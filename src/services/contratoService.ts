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
  collection,
  doc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  updateDoc,
  where,
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
  aplicacionId: string;
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
  const duplicado = ya.docs.some((d) => {
    const c = d.data() as any;
    return c.estudianteId === estudianteId && c.vacanteId === vacante.id && c.estado === 'activo';
  });
  if (duplicado) throw new Error('Este estudiante ya está contratado en esta vacante.');

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
    origen,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 2. La aplicación pasa a 'contratado'.
  await updateDoc(doc(db, 'aplicaciones', aplicacionId), {
    estado: 'contratado',
    fecha_inicio: serverTimestamp(),
    contrato_id: ref.id,
  });

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
      exceptoAplicacionId: aplicacionId,
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
