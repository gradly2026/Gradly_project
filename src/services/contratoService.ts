// ════════════════════════════════════════════════════════════════════════
// contratoService.ts
//
// QUÉ ES ESTE ARCHIVO:
// El ciclo de vida del EMPLEO REAL en Gradly — cuando una empresa contrata a
// un estudiante YA GRADUADO (que terminó su pasantía) para una vacante
// `categoria:'vacante'`. Es el equivalente de pasantiaService.ts pero para el
// "Puesto de trabajo", no para la pasantía.
//
// Fuente de verdad: la colección `contratos_laborales` (ver firestore.rules).
// Un doc por contratación. `estado`: 'activo' → 'renuncia' / 'despido'. Una
// vacante cubierta se marca `cerrada:true` y NO se reabre.
//
// MAPA (se completa por fases del rediseño de Reclutamiento):
//   Fase 0 · contratarCandidato()  — la empresa contrata a un postulante.
//   Fase 0 · cerrarVacante()       — cerrar una vacante con ≥1 contratado.
//   Fase 3 · asignarTarea() / completarTarea()
//   Fase 3 · reportarEmpleado() / advertirDespido() / despedirEmpleado()
//   Fase 4 · advertirRenuncia() / renunciarPuesto()
//   Fase 5 · crearOfertaEmpleo() / responderOfertaEmpleo() / contratarExPasante()
// ════════════════════════════════════════════════════════════════════════
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import { enviarNotificacion } from './notificationService';
import type { HorarioPasantia } from '../data/disponibilidad';

// ── Nombres de colección (un único lugar donde cambiarlos) ──
export const COL_CONTRATOS = 'contratos_laborales';
export const COL_TAREAS = 'tareas_laborales';
export const COL_OFERTAS = 'ofertas_empleo';

/** Estado de un contrato laboral. No se reabre: 'renuncia'/'despido' son finales. */
export type EstadoContrato = 'activo' | 'renuncia' | 'despido';

/** Cómo entró el estudiante a este contrato. */
export type OrigenContrato = 'candidato' | 'recontratacion' | 'oferta';

/** Un aviso puntual que una parte le deja a la otra (reporte, advertencia,
 *  despido o renuncia) — se guarda en el contrato para que el modal de la
 *  notificación lo pueda leer sin exponer la colección `reportes`. */
export interface AvisoContrato {
  tipo: 'reporte' | 'advertencia' | 'despido' | 'renuncia';
  texto: string;
  fecha: string; // ISO
}

/** Forma de un documento de `contratos_laborales`. */
export interface ContratoLaboral {
  id: string;
  empresaId: string;
  empresaNombre: string;
  estudianteId: string;
  estudianteNombre: string;
  estudianteFoto: string;
  vacanteId: string;
  vacanteTitulo: string;
  area: string;
  modalidad: string;
  modalidad_contrato: string;
  ubicacion_texto: { direccion: string; municipio: string; departamento: string; pais: string } | null;
  horario: HorarioPasantia | null;
  salario_min: number | null;
  salario_max: number | null;
  fechaInicio: any;
  estado: EstadoContrato;
  fechaFin: any | null;
  motivoFin: string | null;
  finPor: 'empresa' | 'estudiante' | null;
  reportesCount: number;
  advertenciasEmpresa: { texto: string; fecha: string }[];
  advertenciasEstudiante: { texto: string; fecha: string }[];
  ultimoAvisoEmpleado: AvisoContrato | null;
  ultimoAvisoEmpresa: AvisoContrato | null;
  /** Otros contratados activos del MISMO puesto (denormalizado: id + nombre +
   *  foto), para que el estudiante vea a sus compañeros sin leer contratos
   *  ajenos (las reglas no se lo permiten). Lo mantiene la empresa. */
  companeros: { id: string; nombre: string; foto: string }[];
  origen: OrigenContrato;
  createdAt: any;
  updatedAt: any;
}

/** Subconjunto de la vacante que se congela dentro del contrato al firmar. */
export interface VacanteParaContrato {
  id: string;
  titulo: string;
  area?: string;
  modalidad?: string;
  modalidad_contrato?: string;
  ubicacion_texto?: ContratoLaboral['ubicacion_texto'];
  horario?: HorarioPasantia | null;
  salario_min?: number | null;
  salario_max?: number | null;
  cupos?: number | null;
  contratados_count?: number | null;
}

/** Texto de agradecimiento que se guarda y se notifica a los candidatos que
 *  quedan descartados porque la vacante se cubrió. */
export function mensajeVacanteCubierta(titulo: string): string {
  return `La vacante "${titulo}" ya fue cubierta. Agradecemos tu interés y tu postulación; te animamos a aplicar a futuras oportunidades.`;
}

// ────────────────────────────────────────────────────────────────────────
// Helper interno: descarta (rechaza) las postulaciones que siguen
// 'pendiente' en una vacante, notificando a cada estudiante. Lo usan tanto
// el auto-cierre al cubrirse los cupos como `cerrarVacante()`.
// ────────────────────────────────────────────────────────────────────────
async function rechazarPendientesRestantes(opts: {
  vacanteId: string;
  empresaId: string;
  vacanteTitulo: string;
  /** No tocar esta aplicación (la del recién contratado, por si aún dice 'pendiente'). */
  exceptoAplicacionId?: string;
}): Promise<number> {
  const { vacanteId, empresaId, vacanteTitulo, exceptoAplicacionId } = opts;
  // Query por `empresa_id` (rama de la regla) + `vacante_id`; el estado se
  // filtra en cliente para no exigir índice compuesto.
  const snap = await getDocs(
    query(
      collection(db, 'aplicaciones'),
      where('empresa_id', '==', empresaId),
      where('vacante_id', '==', vacanteId),
    ),
  );
  const msg = mensajeVacanteCubierta(vacanteTitulo);
  let n = 0;
  await Promise.all(
    snap.docs.map(async (d) => {
      if (d.id === exceptoAplicacionId) return;
      if ((d.data() as any).estado !== 'pendiente') return;
      n += 1;
      await updateDoc(doc(db, 'aplicaciones', d.id), {
        estado: 'rechazado',
        motivo_rechazo: msg,
        fecha_rechazo: serverTimestamp(),
      });
      const est = (d.data() as any).estudiante_id;
      if (est) {
        // Deep link "postulacionRechazada:<aplicacionId>" → modal de detalle
        // (se registra el kind + su modal en la Fase 2).
        await enviarNotificacion(
          est,
          'Postulación no seleccionada',
          msg,
          'info',
          `postulacionRechazada:${d.id}`,
        );
      }
    }),
  );
  return n;
}

// ────────────────────────────────────────────────────────────────────────
// Fase 0 · La empresa CONTRATA a un postulante de una vacante.
// ────────────────────────────────────────────────────────────────────────
/**
 * Crea el contrato laboral, marca la aplicación como 'contratado' y sube el
 * contador de la vacante. Si con esta contratación se cubren todos los cupos
 * (incluye el caso de 1 solo cupo), descarta al resto de postulantes y marca
 * la vacante `cerrada:true`.
 *
 * Devuelve el id del contrato y si la vacante quedó cerrada.
 */
export async function contratarCandidato(params: {
  /** id de la `aplicaciones` que originó la contratación; `null` cuando no
   *  hubo postulación (recontratación de ex-pasante u oferta de empleo). */
  aplicacionId: string | null;
  vacante: VacanteParaContrato;
  estudianteId: string;
  estudianteNombre: string;
  estudianteFoto?: string;
  empresaId: string;
  empresaNombre: string;
  origen?: OrigenContrato;
}): Promise<{ contratoId: string; vacanteCerrada: boolean }> {
  const {
    aplicacionId, vacante, estudianteId, estudianteNombre,
    estudianteFoto = '', empresaId, empresaNombre, origen = 'candidato',
  } = params;

  // Candado anti-doble-contrato: ¿ya hay un contrato ACTIVO de este estudiante
  // en esta vacante con esta empresa? Query por `empresaId` (rama de la regla)
  // y se filtra el resto en cliente.
  const ya = await getDocs(
    query(collection(db, COL_CONTRATOS), where('empresaId', '==', empresaId)),
  );
  const activosDeVacante = ya.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((c) => c.vacanteId === vacante.id && c.estado === 'activo');
  if (activosDeVacante.some((c) => c.estudianteId === estudianteId)) {
    throw new Error('Este estudiante ya está contratado en esta vacante.');
  }

  // Compañeros ya activos del mismo puesto (denormalizado para el estudiante).
  const companeros = activosDeVacante.map((c) => ({
    id: c.estudianteId,
    nombre: c.estudianteNombre || '',
    foto: c.estudianteFoto || '',
  }));

  // 1. Crear el contrato (congela los datos del puesto).
  const ref = await addDoc(collection(db, COL_CONTRATOS), {
    empresaId,
    empresaNombre,
    estudianteId,
    estudianteNombre,
    estudianteFoto,
    vacanteId: vacante.id,
    vacanteTitulo: vacante.titulo,
    area: vacante.area ?? '',
    modalidad: vacante.modalidad ?? '',
    modalidad_contrato: vacante.modalidad_contrato ?? '',
    ubicacion_texto: vacante.ubicacion_texto ?? null,
    horario: vacante.horario ?? null,
    salario_min: vacante.salario_min ?? null,
    salario_max: vacante.salario_max ?? null,
    fechaInicio: serverTimestamp(),
    estado: 'activo' as EstadoContrato,
    fechaFin: null,
    motivoFin: null,
    finPor: null,
    reportesCount: 0,
    advertenciasEmpresa: [],
    advertenciasEstudiante: [],
    ultimoAvisoEmpleado: null,
    ultimoAvisoEmpresa: null,
    companeros,
    origen,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 1b. Añadir al nuevo contratado como compañero en los contratos ya activos.
  await Promise.allSettled(
    activosDeVacante.map((c) =>
      updateDoc(doc(db, COL_CONTRATOS, c.id), {
        companeros: arrayUnion({ id: estudianteId, nombre: estudianteNombre || '', foto: estudianteFoto || '' }),
      }),
    ),
  );

  // 2. La aplicación (si la hubo) pasa a 'contratado'.
  if (aplicacionId) {
    await updateDoc(doc(db, 'aplicaciones', aplicacionId), {
      estado: 'contratado',
      fecha_inicio: serverTimestamp(),
      contrato_id: ref.id,
    });
  }

  // 3. Contador de la vacante.
  await updateDoc(doc(db, 'vacantes', vacante.id), {
    contratados_count: increment(1),
  });

  // 4. ¿Se cubrieron todos los cupos? (cupos===1 entra por aquí también).
  const cupos = typeof vacante.cupos === 'number' && vacante.cupos > 0 ? vacante.cupos : null;
  const contratadosAhora = (Number(vacante.contratados_count) || 0) + 1;
  const vacanteCerrada = cupos !== null && contratadosAhora >= cupos;

  if (vacanteCerrada) {
    await rechazarPendientesRestantes({
      vacanteId: vacante.id,
      empresaId,
      vacanteTitulo: vacante.titulo,
      exceptoAplicacionId: aplicacionId ?? undefined,
    });
    await updateDoc(doc(db, 'vacantes', vacante.id), { cerrada: true });
  }

  // 5. Notificar al contratado (deep link a su pestaña de progreso → "Puesto
  //    de trabajo"; el split de esa pantalla llega en la Fase 4).
  await enviarNotificacion(
    estudianteId,
    '¡Fuiste contratado! 🎉',
    `${empresaNombre} te contrató para "${vacante.titulo}". Abre tu progreso para ver los detalles del puesto.`,
    'success',
    '/(tabs)/progreso',
  );

  return { contratoId: ref.id, vacanteCerrada };
}

// ────────────────────────────────────────────────────────────────────────
// Fase 0 · Cerrar una vacante manualmente (requiere ≥1 contratado).
// ────────────────────────────────────────────────────────────────────────
/**
 * La empresa cierra una vacante que todavía tenía cupos libres, quedándose
 * solo con quien ya contrató. Descarta al resto de postulantes con su aviso.
 * El llamador debe garantizar que ya hay al menos un contratado.
 */
export async function cerrarVacante(params: {
  vacanteId: string;
  empresaId: string;
  vacanteTitulo: string;
}): Promise<{ descartados: number }> {
  const { vacanteId, empresaId, vacanteTitulo } = params;
  const descartados = await rechazarPendientesRestantes({ vacanteId, empresaId, vacanteTitulo });
  await updateDoc(doc(db, 'vacantes', vacanteId), { cerrada: true });
  return { descartados };
}

// ════════════════════════════════════════════════════════════════════════
// FASE 3 · Vida del puesto contratado (lado empresa): tareas, reportes,
// advertencias y despido.
// ════════════════════════════════════════════════════════════════════════

/** Forma mínima de una tarea (colección `tareas_laborales`). */
export interface TareaLaboral {
  id: string;
  vacanteId: string;
  empresaId: string;
  estudianteId: string;
  loteId: string | null;
  titulo: string;
  detalle: string;
  estado: 'pendiente' | 'completada';
  createdAt: any;
  completadaAt: any | null;
}

/**
 * La empresa asigna una tarea a uno o varios empleados de un puesto. "A ambos"
 * = un doc por empleado, agrupados por `loteId` (estado simple por doc). Se
 * escriben en un batch atómico. Notifica a cada empleado (deep link a su
 * progreso → "Puesto de trabajo", pantalla que llega en Fase 4).
 */
export async function asignarTarea(params: {
  vacanteId: string;
  vacanteTitulo: string;
  empresaId: string;
  empresaNombre: string;
  titulo: string;
  detalle: string;
  /** uids de los empleados a los que se asigna (1 = "a uno", varios = "a ambos"). */
  estudianteIds: string[];
}): Promise<{ ids: string[] }> {
  const { vacanteId, vacanteTitulo, empresaId, empresaNombre, titulo, detalle, estudianteIds } = params;
  const destinatarios = [...new Set(estudianteIds.filter(Boolean))];
  if (destinatarios.length === 0) throw new Error('Elige al menos un empleado.');
  if (!titulo.trim()) throw new Error('La tarea necesita un título.');

  const loteId = destinatarios.length > 1 ? doc(collection(db, COL_TAREAS)).id : null;
  const batch = writeBatch(db);
  const ids: string[] = [];
  for (const estudianteId of destinatarios) {
    const ref = doc(collection(db, COL_TAREAS));
    ids.push(ref.id);
    batch.set(ref, {
      vacanteId,
      empresaId,
      estudianteId,
      loteId,
      titulo: titulo.trim(),
      detalle: detalle.trim(),
      estado: 'pendiente' as const,
      createdAt: serverTimestamp(),
      completadaAt: null,
    });
  }
  await batch.commit();

  await Promise.allSettled(
    destinatarios.map((id) =>
      enviarNotificacion(
        id,
        'Nueva tarea asignada',
        `${empresaNombre} te asignó una tarea en "${vacanteTitulo}": ${titulo.trim()}`,
        'info',
        '/(tabs)/progreso',
      ),
    ),
  );
  return { ids };
}

/** El empleado (o la empresa) marca/desmarca una tarea como completada. */
export async function completarTarea(tareaId: string, completada: boolean): Promise<void> {
  await updateDoc(doc(db, COL_TAREAS, tareaId), {
    estado: completada ? 'completada' : 'pendiente',
    completadaAt: completada ? serverTimestamp() : null,
  });
}

/**
 * La empresa reporta a un empleado contratado. Escribe en `reportes` con el
 * mismo esquema que lee el panel admin (+ `contexto:'laboral'` y `contratoId`),
 * notifica al admin, sube el contador `reportesCount` del contrato y avisa al
 * empleado. Devuelve el nuevo total de reportes de ese contrato.
 */
export async function reportarEmpleado(params: {
  contratoId: string;
  empresaId: string;
  empresaNombre: string;
  estudianteId: string;
  estudianteNombre: string;
  vacanteTitulo: string;
  motivo: string;
  descripcion: string;
}): Promise<{ total: number }> {
  const {
    contratoId, empresaId, empresaNombre, estudianteId, estudianteNombre,
    vacanteTitulo, motivo, descripcion,
  } = params;
  if (!motivo.trim()) throw new Error('Selecciona un motivo.');

  const detalle = [
    `Puesto: ${vacanteTitulo}`,
    `Empresa: ${empresaNombre}`,
    descripcion.trim() ? `\n${descripcion.trim()}` : '',
  ].filter(Boolean).join(' · ');

  await addDoc(collection(db, 'reportes'), {
    reportado_id: estudianteId,
    reportado_nombre: estudianteNombre,
    reportante_id: empresaId,
    reportador_id: empresaId, // compat regla de lectura del propio reporte
    motivo: motivo.trim(),
    tipo: 'laboral',
    contexto: 'laboral',
    contratoId,
    descripcion: detalle,
    estado: 'abierto',
    fecha: serverTimestamp(),
  });
  try {
    await addDoc(collection(db, 'admin_notifications'), {
      title: `Reporte laboral: ${motivo.trim()}`,
      is_read: false,
      tipo: 'reporte',
      reportado_id: estudianteId,
      created_at: serverTimestamp(),
    });
  } catch { /* la notificación al admin es secundaria */ }

  // Sube el contador del contrato y deja el aviso legible para el empleado.
  await updateDoc(doc(db, COL_CONTRATOS, contratoId), {
    reportesCount: increment(1),
    ultimoAvisoEmpleado: { tipo: 'reporte', texto: motivo.trim(), fecha: new Date().toISOString() },
    updatedAt: serverTimestamp(),
  });
  await enviarNotificacion(
    estudianteId,
    'Reporte de tu empresa',
    `${empresaNombre} envió un reporte sobre tu desempeño en "${vacanteTitulo}".`,
    'warning',
    `contratoAviso:${contratoId}`,
  );

  // Lee el total ya actualizado (para la regla de 3 en la UI).
  let total = 0;
  try {
    const snap = await getDoc(doc(db, COL_CONTRATOS, contratoId));
    total = Number((snap.data() as any)?.reportesCount) || 0;
  } catch { /* no bloquea */ }
  return { total };
}

/**
 * Advertencia empresa → empleado (NO termina el contrato). Suma al array
 * `advertenciasEmpresa`, deja el aviso legible y notifica. Devuelve el nuevo
 * número de advertencias (a la 3ª, la UI deshabilita el botón de advertir).
 */
export async function advertirEmpleado(params: {
  contratoId: string;
  empresaNombre: string;
  estudianteId: string;
  vacanteTitulo: string;
  texto: string;
}): Promise<{ total: number }> {
  const { contratoId, empresaNombre, estudianteId, vacanteTitulo, texto } = params;
  if (!texto.trim()) throw new Error('Escribe el motivo de la advertencia.');
  const fecha = new Date().toISOString();
  await updateDoc(doc(db, COL_CONTRATOS, contratoId), {
    advertenciasEmpresa: arrayUnion({ texto: texto.trim(), fecha }),
    ultimoAvisoEmpleado: { tipo: 'advertencia', texto: texto.trim(), fecha },
    updatedAt: serverTimestamp(),
  });
  await enviarNotificacion(
    estudianteId,
    'Advertencia de tu empresa',
    `${empresaNombre} te envió una advertencia en "${vacanteTitulo}": ${texto.trim()}`,
    'warning',
    `contratoAviso:${contratoId}`,
  );
  let total = 0;
  try {
    const snap = await getDoc(doc(db, COL_CONTRATOS, contratoId));
    total = Array.isArray((snap.data() as any)?.advertenciasEmpresa)
      ? (snap.data() as any).advertenciasEmpresa.length
      : 0;
  } catch { /* no bloquea */ }
  return { total };
}

/**
 * Despido definitivo: anula el contrato (estado 'despido'), deja el aviso
 * legible y notifica al empleado. La vacante NO se reabre.
 */
export async function despedirEmpleado(params: {
  contratoId: string;
  empresaNombre: string;
  estudianteId: string;
  vacanteTitulo: string;
  motivo: string;
}): Promise<void> {
  const { contratoId, empresaNombre, estudianteId, vacanteTitulo, motivo } = params;
  if (!motivo.trim()) throw new Error('Escribe el motivo del despido.');
  const fecha = new Date().toISOString();
  await updateDoc(doc(db, COL_CONTRATOS, contratoId), {
    estado: 'despido' as EstadoContrato,
    fechaFin: serverTimestamp(),
    motivoFin: motivo.trim(),
    finPor: 'empresa' as const,
    ultimoAvisoEmpleado: { tipo: 'despido', texto: motivo.trim(), fecha },
    updatedAt: serverTimestamp(),
  });
  await enviarNotificacion(
    estudianteId,
    'Se terminó tu contrato',
    `${empresaNombre} finalizó tu contrato en "${vacanteTitulo}". Motivo: ${motivo.trim()}`,
    'error',
    `contratoAviso:${contratoId}`,
  );
}

// ════════════════════════════════════════════════════════════════════════
// FASE 4 · Lado del estudiante contratado: completar tareas, avisar/renunciar.
// (Las reglas de `contratos_laborales` permiten al estudiante tocar solo
//  estado/fechaFin/motivoFin/finPor/advertenciasEstudiante/ultimoAvisoEmpresa,
//  y solo sobre un contrato aún 'activo'.)
// ════════════════════════════════════════════════════════════════════════

/**
 * Aviso / advertencia del estudiante a la empresa (NO termina el contrato).
 * Suma al array `advertenciasEstudiante`, deja el aviso legible para la
 * empresa y la notifica.
 */
export async function avisarEmpresaContrato(params: {
  contratoId: string;
  empresaId: string;
  estudianteNombre: string;
  vacanteTitulo: string;
  texto: string;
}): Promise<void> {
  const { contratoId, empresaId, estudianteNombre, vacanteTitulo, texto } = params;
  if (!texto.trim()) throw new Error('Escribe tu aviso.');
  const fecha = new Date().toISOString();
  await updateDoc(doc(db, COL_CONTRATOS, contratoId), {
    advertenciasEstudiante: arrayUnion({ texto: texto.trim(), fecha }),
    ultimoAvisoEmpresa: { tipo: 'advertencia', texto: texto.trim(), fecha },
    updatedAt: serverTimestamp(),
  });
  await enviarNotificacion(
    empresaId,
    'Aviso de un empleado',
    `${estudianteNombre} te dejó un aviso en "${vacanteTitulo}": ${texto.trim()}`,
    'warning',
    `contratoAviso:${contratoId}`,
  );
}

/**
 * Renuncia definitiva del estudiante: anula el contrato (estado 'renuncia'),
 * deja el aviso legible y notifica a la empresa. No se reabre.
 */
export async function renunciarPuesto(params: {
  contratoId: string;
  empresaId: string;
  estudianteNombre: string;
  vacanteTitulo: string;
  motivo: string;
}): Promise<void> {
  const { contratoId, empresaId, estudianteNombre, vacanteTitulo, motivo } = params;
  if (!motivo.trim()) throw new Error('Escribe el motivo de la renuncia.');
  const fecha = new Date().toISOString();
  await updateDoc(doc(db, COL_CONTRATOS, contratoId), {
    estado: 'renuncia' as EstadoContrato,
    fechaFin: serverTimestamp(),
    motivoFin: motivo.trim(),
    finPor: 'estudiante' as const,
    ultimoAvisoEmpresa: { tipo: 'renuncia', texto: motivo.trim(), fecha },
    updatedAt: serverTimestamp(),
  });
  await enviarNotificacion(
    empresaId,
    'Un empleado renunció',
    `${estudianteNombre} renunció a "${vacanteTitulo}". Motivo: ${motivo.trim()}`,
    'error',
    `contratoAviso:${contratoId}`,
  );
}

// ════════════════════════════════════════════════════════════════════════
// FASE 5 · Recontratar ex-pasantes + ofertas de empleo.
// ════════════════════════════════════════════════════════════════════════

/** Forma de un documento de `ofertas_empleo`. */
export interface OfertaEmpleo {
  id: string;
  empresaId: string;
  empresaNombre: string;
  estudianteId: string;
  estudianteNombre: string;
  vacanteId: string;
  vacanteTitulo: string;
  area: string;
  estado: 'pendiente' | 'aceptada' | 'rechazada';
  motivoRechazo: string | null;
  createdAt: any;
  respondidaAt: any | null;
}

/**
 * La empresa contrata a un EX-PASANTE directo a una vacante afín — sin que haya
 * habido postulación. Igual que `contratarCandidato` pero sin `aplicaciones`.
 * Si con esto se cubren los cupos, descarta a los postulantes que hubiera y
 * cierra la vacante.
 */
export async function contratarExPasante(params: {
  vacante: VacanteParaContrato;
  estudianteId: string;
  estudianteNombre: string;
  estudianteFoto?: string;
  empresaId: string;
  empresaNombre: string;
  origen?: OrigenContrato;
}): Promise<{ contratoId: string; vacanteCerrada: boolean }> {
  return contratarCandidato({
    aplicacionId: null,
    vacante: params.vacante,
    estudianteId: params.estudianteId,
    estudianteNombre: params.estudianteNombre,
    estudianteFoto: params.estudianteFoto,
    empresaId: params.empresaId,
    empresaNombre: params.empresaNombre,
    origen: params.origen ?? 'recontratacion',
  });
}

/**
 * La empresa oferta una vacante a un ex-pasante desde "Historial de Pasantes".
 * Crea el doc en `ofertas_empleo` ('pendiente') y notifica al estudiante con
 * deep link 'ofertaEmpleo:<id>'. Bloquea duplicar una oferta pendiente para el
 * mismo estudiante+vacante.
 */
export async function crearOfertaEmpleo(params: {
  empresaId: string;
  empresaNombre: string;
  estudianteId: string;
  estudianteNombre: string;
  vacanteId: string;
  vacanteTitulo: string;
  area?: string;
}): Promise<string> {
  const { empresaId, empresaNombre, estudianteId, estudianteNombre, vacanteId, vacanteTitulo, area } = params;

  const previas = await getDocs(
    query(collection(db, COL_OFERTAS), where('empresaId', '==', empresaId)),
  );
  const yaPendiente = previas.docs.some((d) => {
    const o = d.data() as any;
    return o.estudianteId === estudianteId && o.vacanteId === vacanteId && o.estado === 'pendiente';
  });
  if (yaPendiente) throw new Error('Ya tienes una oferta pendiente para este estudiante en esta vacante.');

  const ref = await addDoc(collection(db, COL_OFERTAS), {
    empresaId,
    empresaNombre,
    estudianteId,
    estudianteNombre,
    vacanteId,
    vacanteTitulo,
    area: area ?? '',
    estado: 'pendiente' as const,
    motivoRechazo: null,
    createdAt: serverTimestamp(),
    respondidaAt: null,
  });
  await enviarNotificacion(
    estudianteId,
    'Oferta de empleo',
    `${empresaNombre} te ofreció el puesto "${vacanteTitulo}".`,
    'info',
    `ofertaEmpleo:${ref.id}`,
  );
  return ref.id;
}

/**
 * El estudiante responde una oferta: 'aceptada' o 'rechazada' (con motivo).
 * Aceptar NO crea el contrato — la empresa lo confirma luego en "Recontratar
 * Pasantes". Notifica a la empresa con deep link 'ofertaRespondida:<id>'.
 */
export async function responderOfertaEmpleo(params: {
  oferta: OfertaEmpleo;
  estudianteNombre: string;
  decision: 'aceptada' | 'rechazada';
  motivo?: string;
}): Promise<void> {
  const { oferta, estudianteNombre, decision, motivo } = params;
  if (decision === 'rechazada' && !(motivo ?? '').trim()) {
    throw new Error('Escribe el motivo del rechazo.');
  }
  await updateDoc(doc(db, COL_OFERTAS, oferta.id), {
    estado: decision,
    motivoRechazo: decision === 'rechazada' ? (motivo ?? '').trim() : null,
    respondidaAt: serverTimestamp(),
  });
  await enviarNotificacion(
    oferta.empresaId,
    decision === 'aceptada' ? 'Oferta aceptada' : 'Oferta rechazada',
    decision === 'aceptada'
      ? `${estudianteNombre} aceptó tu oferta para "${oferta.vacanteTitulo}". Confírmala en "Recontratar Pasantes".`
      : `${estudianteNombre} rechazó tu oferta para "${oferta.vacanteTitulo}".${motivo ? ` Motivo: ${motivo.trim()}` : ''}`,
    decision === 'aceptada' ? 'success' : 'info',
    `ofertaRespondida:${oferta.id}`,
  );
}
