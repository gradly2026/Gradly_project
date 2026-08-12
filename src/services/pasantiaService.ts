import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import type { AcuerdoData } from '../types/chat';
import { crearNotificacionInApp, NOTIF } from './notificacionService';
import { enviarNotificacion } from './notificationService';
import {
  alumnosRealesDeGrupo,
  buildChatId,
  grupoComprometido,
  MENSAJE_GRUPO_COMPROMETIDO,
} from './solicitudPracticaService';
import { cuposDisponibles } from '../utils/cupos';
import { zonaDeCarrera } from '../data/carreras';

// ─────────────────────────────────────────────
// NIVEL GAMIFICADO
// ─────────────────────────────────────────────
export interface NivelEstudiante {
  nivel:      string;
  titulo:     string;
  icono:      string;
  color:      string;
  porcentaje: number;
}

export function calcularNivelEstudiante(
  horasAprobadas: number,
  horasObjetivo: number,
): NivelEstudiante {
  const pct = Math.min(100, Math.round((horasAprobadas / Math.max(horasObjetivo, 1)) * 100));
  if (pct >= 100) return { nivel: 'graduado',    titulo: 'Graduado',    icono: 'trophy',    color: '#D97706', porcentaje: 100 };
  if (pct >= 76)  return { nivel: 'experto',     titulo: 'Experto',     icono: 'star',      color: '#F59E0B', porcentaje: pct };
  if (pct >= 51)  return { nivel: 'profesional', titulo: 'Profesional', icono: 'briefcase', color: '#10B981', porcentaje: pct };
  if (pct >= 26)  return { nivel: 'practicante', titulo: 'Practicante', icono: 'bag',       color: '#A78BFA', porcentaje: pct };
  return             { nivel: 'explorador',  titulo: 'Explorador',  icono: 'compass',   color: '#C4B5FD', porcentaje: pct };
}

// ─────────────────────────────────────────────
// ELEGIBILIDAD PARA VACANTES
// Solo estudiantes que ya culminaron su práctica/pasantía (100% de horas,
// nivel "graduado") o que la universidad ya declaró `graduado` pueden ver
// y aplicar a vacantes individuales. Se usa tanto en la UI (feed) como aquí,
// al aplicar.
// ─────────────────────────────────────────────
export function estudianteHabilitadoParaVacantes(perfil: {
  graduado?: boolean;
  horas_aprobadas?: number;
  horas_objetivo?: number;
} | null | undefined): boolean {
  if (!perfil) return false;
  if (perfil.graduado === true) return true;
  return calcularNivelEstudiante(perfil.horas_aprobadas ?? 0, perfil.horas_objetivo ?? 0).nivel === 'graduado';
}

// ─────────────────────────────────────────────
// 1. ESTUDIANTE APLICA A VACANTE
// ─────────────────────────────────────────────
type PerfilParaAplicar = { nombre_completo: string; foto_url?: string; universidad_id?: string };

/**
 * Cuerpo compartido de "crear una aplicación": lo usan tanto `aplicarAVacante`
 * (vacante individual, exige graduación) como `aplicarAPasantiaIndependiente`
 * (autoservicio a pasantías) — ambas terminan en el mismo documento de
 * `aplicaciones` y el mismo incremento de `aplicantes_count`. Cada llamador
 * hace su propia validación de elegibilidad ANTES de invocar esto.
 */
async function crearAplicacion(
  estudianteId: string,
  vacanteId: string,
  empresaId: string,
  estudiantePerfil: PerfilParaAplicar,
): Promise<string> {
  // Verificar aplicación previa
  const existing = await getDocs(
    query(
      collection(db, 'aplicaciones'),
      where('estudiante_id', '==', estudianteId),
      where('vacante_id', '==', vacanteId),
    ),
  );
  if (!existing.empty) throw new Error('Ya aplicaste a esta vacante.');

  const appRef = await addDoc(collection(db, 'aplicaciones'), {
    estudiante_id:     estudianteId,
    estudiante_nombre: estudiantePerfil.nombre_completo,
    estudiante_foto:   estudiantePerfil.foto_url ?? '',
    vacante_id:        vacanteId,
    empresa_id:        empresaId,
    universidad_id:    estudiantePerfil.universidad_id ?? '',
    estado:            'pendiente',
    fecha_aplicacion:  serverTimestamp(),
    horas_completadas: 0,
    pago_confirmado:   false,
    calificacion_empresa:            0,
    calificacion_estudiante:         0,
    calificacion_empresa_enviada:    false,
    calificacion_estudiante_enviada: false,
    notas: '',
  });

  await updateDoc(doc(db, 'vacantes', vacanteId), {
    aplicantes_count: increment(1),
  });

  // Notificar a la empresa sobre la nueva aplicación
  const n = NOTIF.nuevaAplicacion(estudiantePerfil.nombre_completo);
  await crearNotificacionInApp(empresaId, n.tipo, n.titulo, n.mensaje, '/dashboard-empresa');

  // Confirmación al propio estudiante (no bloquea el flujo).
  try {
    await enviarNotificacion(
      estudianteId,
      'Postulación enviada',
      'Tu postulación fue enviada correctamente. Te avisaremos cuando la empresa responda.',
      'success',
      appRef.id,
    );
  } catch {
    /* la notificación no debe afectar el flujo principal */
  }

  return appRef.id;
}

export async function aplicarAVacante(
  estudianteId: string,
  vacanteId: string,
  empresaId: string,
  estudiantePerfil: PerfilParaAplicar,
): Promise<string> {
  // Solo estudiantes que ya culminaron su práctica/pasantía o están
  // graduados pueden aplicar (ver `estudianteHabilitadoParaVacantes`).
  const perfilSnap = await getDoc(doc(db, 'perfiles_estudiantes', estudianteId));
  if (!estudianteHabilitadoParaVacantes(perfilSnap.exists() ? (perfilSnap.data() as any) : null)) {
    throw new Error('Las vacantes están disponibles solo para estudiantes que ya culminaron su práctica o pasantía, o que ya están graduados.');
  }

  return crearAplicacion(estudianteId, vacanteId, empresaId, estudiantePerfil);
}

// ─────────────────────────────────────────────
// 1b. ESTUDIANTE APLICA A UNA PASANTÍA POR SU CUENTA (autoservicio)
// ─────────────────────────────────────────────
/**
 * Camino alterno a `aplicarAVacante`: para estudiantes que TODAVÍA no
 * culminan su práctica, pero tampoco tienen ninguna pasantía activa en
 * curso. Antes, la ÚNICA forma de conseguir pasantía era que la universidad
 * reservara cupos por lote (`reclamoCuposService.ts`) — esto abre un segundo
 * camino de autoservicio (ej. si al estudiante se le venció el plazo de 48h
 * para tomar un cupo ya asegurado, o su universidad no reservó nada afín a
 * su carrera).
 *
 * Zona Roja (Salud/Educación/Derecho) queda excluida por completo: esos
 * estudiantes siguen dependiendo 100% de su universidad, sin excepción
 * (decisión de producto explícita).
 *
 * Re-verifica TODO del lado del cliente (mismo nivel de confianza que
 * `aplicarAVacante` — no hay Cloud Function detrás de ninguna de las dos):
 * no confía en lo que ya calculó la pantalla, vuelve a leer.
 */
export async function aplicarAPasantiaIndependiente(
  estudianteId: string,
  vacanteId: string,
  empresaId: string,
  estudiantePerfil: PerfilParaAplicar & { carrera?: string },
): Promise<string> {
  const vacSnap = await getDoc(doc(db, 'vacantes', vacanteId));
  if (!vacSnap.exists()) throw new Error('Esta pasantía ya no está disponible.');
  const vacData: any = vacSnap.data();
  const esPasantia = vacData.categoria === 'pasantia' || (!vacData.categoria && vacData.tipo === 'Pasantía');
  if (!esPasantia) throw new Error('Esta publicación no es una pasantía.');

  if (estudiantePerfil.carrera && zonaDeCarrera(estudiantePerfil.carrera) === 'roja') {
    throw new Error('Tu carrera requiere que la práctica la gestione tu universidad.');
  }

  // No debe tener ya una pasantía activa por ninguna de las 3 vías posibles.
  const [contratadoSnap, acuerdoSnap, cupoSnap] = await Promise.all([
    getDocs(query(
      collection(db, 'aplicaciones'),
      where('estudiante_id', '==', estudianteId),
      where('estado', '==', 'contratado'),
    )),
    getDocs(query(
      collection(db, 'solicitudes_practicas'),
      where('estudianteIds', 'array-contains', estudianteId),
      where('estado', '==', 'aprobado'),
    )),
    getDocs(query(
      collection(db, 'asignaciones_cupo'),
      where('estudianteId', '==', estudianteId),
      where('estado', '==', 'tomado'),
    )),
  ]);
  if (!contratadoSnap.empty || !acuerdoSnap.empty || !cupoSnap.empty) {
    throw new Error('Ya tienes una pasantía activa.');
  }

  return crearAplicacion(estudianteId, vacanteId, empresaId, estudiantePerfil);
}

// ─────────────────────────────────────────────
// 2. EMPRESA CAMBIA ESTADO DE APLICACIÓN
// ─────────────────────────────────────────────
export async function cambiarEstadoAplicacion(
  aplicacionId: string,
  nuevoEstado: string,
  vacanteId?: string,
  estudianteId?: string,
  vacanteNombre?: string,
  /** Horario acordado al contratar (ver ProponerHorarioModal, sin sección de pago). */
  acuerdo?: AcuerdoData,
): Promise<void> {
  const updates: Record<string, any> = { estado: nuevoEstado };

  if (nuevoEstado === 'contratado') {
    updates.fecha_inicio = serverTimestamp();
    if (acuerdo) {
      updates.acuerdo = acuerdo;
      updates.horarioPropuesto = `${acuerdo.horaInicio} - ${acuerdo.horaFin}`;
      updates.diasTrabajo = acuerdo.dias;
      updates.fechaInicioPasantia = acuerdo.fechaInicio;
      updates.fechaFinPasantia = acuerdo.fechaFin;
    }
  }

  await updateDoc(doc(db, 'aplicaciones', aplicacionId), updates);

  if (nuevoEstado === 'contratado' && vacanteId) {
    await updateDoc(doc(db, 'vacantes', vacanteId), {
      contratados_count: increment(1),
    });
  }

  // Notificar al estudiante si tenemos su ID
  if (estudianteId) {
    const nombre = vacanteNombre ?? 'la vacante';
    let n: { tipo: string; titulo: string; mensaje: string } | null = null;

    if (nuevoEstado === 'contratado' || nuevoEstado === 'aceptado') {
      n = NOTIF.aplicacionAceptada(nombre);
    } else if (nuevoEstado === 'rechazado') {
      n = NOTIF.aplicacionRechazada(nombre);
    } else if (nuevoEstado === 'entrevista') {
      n = NOTIF.aplicacionEntrevista(nombre);
    }

    if (n) {
      await crearNotificacionInApp(estudianteId, n.tipo, n.titulo, n.mensaje, '/(tabs)');
    }
  }
}

// ─────────────────────────────────────────────
// 3. ESTUDIANTE MARCA FINALIZACIÓN
// ─────────────────────────────────────────────
export async function estudianteFinalizaProyecto(
  aplicacionId: string,
  estudianteId: string,
  horasCompletadas: number,
  empresaId?: string,
  estudianteNombre?: string,
): Promise<void> {
  await updateDoc(doc(db, 'aplicaciones', aplicacionId), {
    estado:            'finalizado_pendiente_firma',
    horas_completadas: horasCompletadas,
  });

  // Notificar a la empresa que debe firmar la constancia
  if (empresaId) {
    const n = NOTIF.estudianteFinalizó(estudianteNombre ?? 'El estudiante');
    await crearNotificacionInApp(empresaId, n.tipo, n.titulo, n.mensaje, '/dashboard-empresa');
  }
}

// ─────────────────────────────────────────────
// 4. EMPRESA FIRMA CONSTANCIA
// ─────────────────────────────────────────────
export async function empresaFirmaConstancia(
  aplicacionId: string,
  empresaId: string,
  estudianteId: string,
): Promise<string> {
  // Leer para obtener universidad_id y nombre del estudiante
  const appSnap = await getDoc(doc(db, 'aplicaciones', aplicacionId));
  const appData = appSnap.data() ?? {};

  await updateDoc(doc(db, 'aplicaciones', aplicacionId), {
    estado:    'finalizado',
    fecha_fin: serverTimestamp(),
  });

  const txRef = await addDoc(collection(db, 'transacciones'), {
    empresa_id:    empresaId,
    estudiante_id: estudianteId,
    aplicacion_id: aplicacionId,
    monto:         0,
    concepto:      'Pasantía finalizada — pendiente de pago',
    estado:        'pendiente',
    fecha:         serverTimestamp(),
    metodo:        'tarjeta_simulada',
    referencia:    '',
  });

  // Notificar a la universidad que hay una pasantía pendiente de aprobación
  const universidadId = appData.universidad_id as string | undefined;
  if (universidadId) {
    const n = NOTIF.pendienteAprobacion(appData.estudiante_nombre ?? 'Un estudiante');
    await crearNotificacionInApp(universidadId, n.tipo, n.titulo, n.mensaje, '/dashboard-universidad');
  }

  return txRef.id;
}

// ─────────────────────────────────────────────
// 5. UNIVERSIDAD APRUEBA HORAS
// ─────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════
// MOTOR RELACIONAL DE PASANTÍAS (MATCHMAKING UNIVERSIDAD ↔ EMPRESA)
// ═══════════════════════════════════════════════════════════════════
//
// Flujo de estados de una postulación de grupo:
//   pendiente  → la universidad postuló un grupo, la empresa aún no responde
//   revisando  → la empresa aceptó y envió su oferta (horario/días/pago);
//                la universidad debe dar la respuesta final
//   aprobada   → la universidad aceptó definitivamente la oferta
//   rechazada  → rechazada por la empresa o por la universidad (con justificación)
//
// Las postulaciones de grupo viven en su propia colección 'aplicaciones_grupos'
// para no mezclarse con las aplicaciones individuales de estudiantes.
// ───────────────────────────────────────────────────────────────────

export const COLECCION_APLICACIONES_GRUPOS = 'aplicaciones_grupos';
export const MAX_GRUPOS_POR_VACANTE = 2;

/** Días de la semana — útil para los selectores multiselect de la UI */
export const DIAS_SEMANA = [
  'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo',
] as const;

export type EstadoAplicacionGrupo = 'pendiente' | 'revisando' | 'aprobada' | 'rechazada';
export type DecisionEmpresa = 'aceptar' | 'rechazar';
export type DecisionUniversidad = 'aceptar' | 'rechazar';

/**
 * Detalles que la empresa envía al aceptar un grupo. El horario/fechas/pago
 * viajan como un `AcuerdoData` estructurado (el mismo formato que usa el
 * handshake del chat vía `ProponerHorarioModal`) — así `calcularHorasAcuerdo`
 * puede calcular horas/progreso para pasantías confirmadas por Matchmaking
 * igual que para las confirmadas por chat. Antes este campo era texto libre
 * ("7:00 a 17:00"), imposible de calcular de forma confiable.
 */
export interface OfertaEmpresa {
  /** Requerido si `decision === 'aceptar'`. */
  acuerdo?: AcuerdoData;
  /** Requerido si `decision === 'rechazar'`. */
  justificacionRechazo?: string;
}

export interface AplicacionGrupo {
  id: string;
  universidadId: string;
  vacanteId: string;
  empresaId: string;
  grupoId: string;

  // Datos desnormalizados para mostrar en la UI sin lecturas extra
  grupoNombre?: string;
  carrera?: string;
  horasRequeridas?: number;
  estudiantesCount?: number;
  vacanteTitulo?: string;
  empresaNombre?: string;
  universidadNombre?: string;

  // Flujo relacional
  estado: EstadoAplicacionGrupo;
  /** Acuerdo estructurado (horario + fechas + pago) — fuente de verdad para el cálculo de horas. */
  acuerdo?: AcuerdoData;
  // Campos de solo-lectura DERIVADOS de `acuerdo` (se siguen escribiendo para
  // no romper las tarjetas existentes que ya los muestran como texto).
  horarioPropuesto?: string;
  diasTrabajo?: string[];
  pagoTotal?: number | null;
  fechaInicio?: string;
  fechaFin?: string;
  justificacionRechazo?: string;

  // Marcas de tiempo
  fechaPostulacion?: any;
  fechaRespuestaEmpresa?: any;
  fechaRespuestaUniversidad?: any;
}

// ─────────────────────────────────────────────
// 6. UNIVERSIDAD POSTULA UN GRUPO A UNA VACANTE
// ─────────────────────────────────────────────
/**
 * Postula un grupo de la universidad a una vacante.
 * Reglas:
 *  - Máximo {@link MAX_GRUPOS_POR_VACANTE} grupos por universidad por vacante.
 *  - Un mismo grupo no puede postularse dos veces a la misma vacante.
 * @returns el id de la nueva postulación.
 */
export async function postularGrupoAVacante(
  universidadId: string,
  vacanteId: string,
  grupoId: string,
): Promise<string> {
  if (!universidadId || !vacanteId || !grupoId) {
    throw new Error('Datos incompletos para postular el grupo.');
  }

  // 1) Verificar el límite de grupos por universidad en esta vacante
  const previas = await getDocs(
    query(
      collection(db, COLECCION_APLICACIONES_GRUPOS),
      where('universidadId', '==', universidadId),
      where('vacanteId', '==', vacanteId),
    ),
  );

  // No contamos las rechazadas para permitir reintentar con otro grupo
  const activas = previas.docs.filter(d => (d.data() as any).estado !== 'rechazada');
  if (activas.length >= MAX_GRUPOS_POR_VACANTE) {
    throw new Error(
      `Solo puedes postular ${MAX_GRUPOS_POR_VACANTE} grupos por vacante. Ya alcanzaste el límite.`,
    );
  }
  if (activas.some(d => (d.data() as any).grupoId === grupoId)) {
    throw new Error('Este grupo ya fue postulado a esta vacante.');
  }

  // 1.5) Un grupo con una pasantía ya aprobada (activa, sin finalizar) no
  // puede postularse a otra vacante en paralelo. Repite en el servidor la
  // validación de la UI (Matchmaking.tsx) para que no se pueda saltar por una
  // condición de carrera o llamando este servicio directamente. Lee el flag
  // denormalizado en `grupos` (ver `grupoComprometido`) en vez de consultar
  // `solicitudes_practicas`: así el mismo chequeo cubre al grupo sin importar
  // cuál de los 3 flujos (Matchmaking/Ofrecer a Empresa/Chat) lo comprometió.
  const { comprometido } = await grupoComprometido(grupoId);
  if (comprometido) {
    throw new Error(MENSAJE_GRUPO_COMPROMETIDO);
  }

  // 2) Leer el grupo y la vacante para desnormalizar datos en la postulación
  const [grupoSnap, vacanteSnap] = await Promise.all([
    getDoc(doc(db, 'grupos', grupoId)),
    getDoc(doc(db, 'vacantes', vacanteId)),
  ]);
  if (!grupoSnap.exists())   throw new Error('El grupo seleccionado no existe.');
  if (!vacanteSnap.exists()) throw new Error('La vacante ya no está disponible.');

  const grupo   = grupoSnap.data() as any;
  const vacante = vacanteSnap.data() as any;

  if (grupo.universidad_id && grupo.universidad_id !== universidadId) {
    throw new Error('Ese grupo no pertenece a tu universidad.');
  }

  // 2.5) Cupos: la vacante debe poder recibir al grupo completo. Las vacantes
  // legadas (sin el campo `cupos`) devuelven `null` en `cuposDisponibles` y NO
  // se bloquean — mantienen el comportamiento previo. Se valida aquí y no solo
  // en la UI para que no se pueda saltar por condición de carrera.
  const libres = cuposDisponibles(vacante);
  if (libres !== null) {
    const necesarios = Number(grupo.estudiantes_count ?? 0);
    if (libres === 0) {
      throw new Error('Esta vacante ya no tiene cupos disponibles.');
    }
    if (necesarios > 0 && libres < necesarios) {
      throw new Error(
        `Esta vacante tiene ${libres} cupo(s) disponible(s) y tu grupo es de ${necesarios} estudiantes.`,
      );
    }
  }

  const empresaId = vacante.empresa_id as string;

  // 3) Crear la postulación
  const ref = await addDoc(collection(db, COLECCION_APLICACIONES_GRUPOS), {
    universidadId,
    vacanteId,
    empresaId,
    grupoId,
    grupoNombre:      grupo.nombre ?? '',
    carrera:          grupo.carrera ?? '',
    horasRequeridas:  vacante.horas_requeridas ?? grupo.total_horas ?? 0,
    estudiantesCount: grupo.estudiantes_count ?? 0,
    vacanteTitulo:    vacante.titulo ?? '',
    empresaNombre:    vacante.nombre_empresa ?? '',
    estado:           'pendiente' as EstadoAplicacionGrupo,
    horarioPropuesto: '',
    diasTrabajo:      [],
    pagoTotal:        null,
    justificacionRechazo: '',
    fechaPostulacion: serverTimestamp(),
  });

  // 4) Notificar a la empresa
  if (empresaId) {
    await crearNotificacionInApp(
      empresaId,
      'info',
      'Nueva postulación de grupo',
      `Una universidad postuló al grupo "${grupo.nombre ?? ''}" para "${vacante.titulo ?? 'tu vacante'}".`,
      '/dashboard-empresa',
    );
  }

  return ref.id;
}

// ─────────────────────────────────────────────
// 7. EMPRESA EVALÚA AL GRUPO
// ─────────────────────────────────────────────
/**
 * La empresa acepta o rechaza un grupo postulado.
 *  - Al aceptar: debe enviar horario, días de trabajo y (opcional) pago total.
 *    La postulación pasa a 'revisando' (la universidad dará la respuesta final).
 *  - Al rechazar: debe enviar obligatoriamente una justificación. → 'rechazada'.
 */
export async function evaluarGrupoPorEmpresa(
  aplicacionId: string,
  decision: DecisionEmpresa,
  detalles: OfertaEmpresa,
): Promise<void> {
  if (!aplicacionId) throw new Error('Postulación inválida.');

  // Validación de entrada antes de la transacción
  if (decision === 'aceptar') {
    if (!detalles?.acuerdo) {
      throw new Error('Debes definir el horario, fechas y pago acordado.');
    }
  } else if (!detalles?.justificacionRechazo?.trim()) {
    throw new Error('Debes escribir una justificación para rechazar el grupo.');
  }

  const ref = doc(db, COLECCION_APLICACIONES_GRUPOS, aplicacionId);

  const { universidadId, grupoNombre } = await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('La postulación ya no existe.');
    const data = snap.data() as AplicacionGrupo;

    if (data.estado !== 'pendiente') {
      throw new Error('Esta postulación ya fue procesada.');
    }

    if (decision === 'aceptar') {
      const acuerdo = detalles.acuerdo!;
      // Campos de texto derivados del acuerdo estructurado — solo para que
      // las tarjetas existentes (que aún leen estos campos) sigan mostrando
      // algo legible sin cambios.
      tx.update(ref, {
        estado: 'revisando' as EstadoAplicacionGrupo,
        acuerdo,
        horarioPropuesto: `${acuerdo.horaInicio} - ${acuerdo.horaFin}`,
        diasTrabajo: acuerdo.dias,
        pagoTotal: acuerdo.pago.tipo === 'con_pago' ? Number(acuerdo.pago.monto ?? 0) : null,
        fechaInicio: acuerdo.fechaInicio,
        fechaFin: acuerdo.fechaFin,
        justificacionRechazo: '',
        fechaRespuestaEmpresa: serverTimestamp(),
      });
    } else {
      tx.update(ref, {
        estado: 'rechazada' as EstadoAplicacionGrupo,
        justificacionRechazo: detalles.justificacionRechazo!.trim(),
        fechaRespuestaEmpresa: serverTimestamp(),
      });
    }

    return { universidadId: data.universidadId, grupoNombre: data.grupoNombre ?? '' };
  });

  // Notificar a la universidad fuera de la transacción
  if (universidadId) {
    const n = decision === 'aceptar'
      ? {
          tipo: 'success',
          titulo: 'La empresa aceptó tu grupo',
          mensaje: `La empresa envió una oferta para el grupo "${grupoNombre}". Revísala y da tu respuesta final.`,
        }
      : {
          tipo: 'warning',
          titulo: 'Grupo no aceptado',
          mensaje: `La empresa rechazó al grupo "${grupoNombre}". Revisa la justificación.`,
        };
    await crearNotificacionInApp(universidadId, n.tipo, n.titulo, n.mensaje, '/dashboard-universidad');
  }
}

// ─────────────────────────────────────────────
// 8. RESPUESTA FINAL DE LA UNIVERSIDAD
// ─────────────────────────────────────────────
/**
 * La universidad revisa la oferta de la empresa (estado 'revisando') y la
 * acepta definitivamente ('aprobada') o la rechaza ('rechazada') con
 * justificación obligatoria.
 */
export async function respuestaFinalUniversidad(
  aplicacionId: string,
  decision: DecisionUniversidad,
  justificacion?: string,
): Promise<void> {
  if (!aplicacionId) throw new Error('Postulación inválida.');
  if (decision === 'rechazar' && !justificacion?.trim()) {
    throw new Error('Debes escribir una justificación para rechazar la oferta.');
  }

  const ref = doc(db, COLECCION_APLICACIONES_GRUPOS, aplicacionId);

  const { empresaId, grupoNombre, vacanteTitulo } = await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('La postulación ya no existe.');
    const data = snap.data() as AplicacionGrupo;

    if (data.estado !== 'revisando') {
      throw new Error('La empresa aún no ha enviado una oferta para responder.');
    }

    if (decision === 'aceptar') {
      if (!data.acuerdo) {
        throw new Error('Falta el horario acordado de esta oferta.');
      }
      const acuerdo = data.acuerdo;

      // El grupo no puede quedar comprometido con dos pasantías a la vez.
      // Se verifica DENTRO de la transacción (misma lectura atómica que el
      // resto de esta operación) para que dos aprobaciones simultáneas del
      // mismo grupo —por Matchmaking u otro flujo— no puedan colarse por una
      // condición de carrera. Debe ser el primer `tx.get` antes de cualquier
      // escritura (Firestore exige todas las lecturas antes que las escrituras).
      const grupoRef = doc(db, 'grupos', data.grupoId);
      const grupoSnap = await tx.get(grupoRef);
      if ((grupoSnap.data() as any)?.pasantia_activa_id) {
        throw new Error(MENSAJE_GRUPO_COMPROMETIDO);
      }

      tx.update(ref, {
        estado: 'aprobada' as EstadoAplicacionGrupo,
        fechaRespuestaUniversidad: serverTimestamp(),
      });

      // ── Puente Matchmaking → solicitudes_practicas ──────────────────────
      // Sin esto, una pasantía confirmada por este flujo queda invisible para
      // el resto del sistema (horas de "Mis Estudiantes", tarjetas de Home,
      // certificación, feedback), que solo lee `solicitudes_practicas`. Nace
      // directamente en `aprobado`: el horario ya se acordó aquí mismo, sin
      // pasar por el handshake de chat.
      const alumnos = await alumnosRealesDeGrupo(data.grupoId);
      const solRef = doc(collection(db, 'solicitudes_practicas'));
      tx.set(solRef, {
        universidadId: data.universidadId,
        empresaId: data.empresaId,
        grupoId: data.grupoId,
        grupoNombre: data.grupoNombre ?? '',
        alumnos,
        estudianteIds: alumnos.map(a => a.id),
        carrera: data.carrera ?? '',
        fechaInicio: acuerdo.fechaInicio,
        fechaFin: acuerdo.fechaFin,
        acuerdo,
        pago: acuerdo.pago,
        estado: 'aprobado',
        origen: 'matchmaking',
        aplicacionGrupoId: aplicacionId,
        createdAt: serverTimestamp(),
        aprobadoAt: serverTimestamp(),
      });

      // Bloquea el grupo: no puede comprometerse con otra empresa mientras
      // esta pasantía siga aprobada (se libera en `finalizarPasantia`).
      tx.update(grupoRef, { pasantia_activa_id: solRef.id });

      // Estado de pasantía autoreportado (perfil público) — arranca "en
      // proceso" para cada alumno real del grupo. Ver [[project_reparto_cupos]].
      alumnos.forEach(al => {
        tx.update(doc(db, 'perfiles_estudiantes', al.id), { estado_pasantia: 'en_proceso' });
      });

      // Registra la alianza en AMBOS perfiles (arrayUnion dedupe solo — no
      // pasa nada si ya se habían aliado antes). Alimenta "Top Empresas/
      // Universidades" sin que ese ranking necesite leer `solicitudes_practicas`.
      tx.update(doc(db, 'perfiles_universidades', data.universidadId), {
        aliados_empresas_ids: arrayUnion(data.empresaId),
      });
      tx.update(doc(db, 'perfiles_empresas', data.empresaId), {
        aliados_universidades_ids: arrayUnion(data.universidadId),
      });

      // Sala de chat dedicada (mismo esquema determinístico que los otros
      // flujos) para que uni/empresa sigan coordinando sobre esta pasantía.
      const chatId = buildChatId(data.universidadId, data.empresaId, data.grupoId);
      tx.set(
        doc(db, 'chats', chatId),
        {
          users: [data.universidadId, data.empresaId],
          universidadId: data.universidadId,
          empresaId: data.empresaId,
          grupoId: data.grupoId,
          solicitudId: solRef.id,
          empresaNombre: data.empresaNombre ?? 'Empresa',
          grupoNombre: data.grupoNombre ?? '',
          lastMessage: '',
          lastSenderId: '',
          unread: { [data.universidadId]: 0, [data.empresaId]: 0 },
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );

      // Notifica a cada estudiante real del grupo (mismo patrón que firmarAcuerdo).
      const conPago = acuerdo.pago.tipo === 'con_pago';
      const monto = conPago ? Number(acuerdo.pago.monto ?? 0) : 0;
      const horarioTexto = `${acuerdo.dias.join(', ')} · ${acuerdo.horaInicio} - ${acuerdo.horaFin}`;
      alumnos.forEach(al => {
        const notiRef = doc(collection(db, 'notificaciones_estudiantes'));
        tx.set(notiRef, {
          estudianteId: al.id,
          estudianteNombre: al.nombre,
          empresaId: data.empresaId,
          empresaNombre: data.empresaNombre ?? 'la empresa',
          grupoId: data.grupoId,
          solicitudId: solRef.id,
          carrera: data.carrera ?? '',
          fechaInicio: acuerdo.fechaInicio,
          fechaFin: acuerdo.fechaFin,
          horario: { dias: acuerdo.dias, horaInicio: acuerdo.horaInicio, horaFin: acuerdo.horaFin },
          pago: acuerdo.pago,
          tipo: 'acuerdo_aprobado',
          leida: false,
          mensaje: `Tu pasantía en ${data.empresaNombre ?? 'la empresa'} fue aprobada. Del ${acuerdo.fechaInicio} al ${acuerdo.fechaFin}. Horario: ${horarioTexto}.${conPago ? ` Pago: $${monto.toFixed(2)}.` : ''}`,
          createdAt: serverTimestamp(),
        });
        if (conPago && monto > 0) {
          const txRef = doc(collection(db, 'transacciones'));
          tx.set(txRef, {
            estudiante_id: al.id,
            empresa_id: data.empresaId,
            solicitud_id: solRef.id,
            concepto: `Pasantía en ${data.empresaNombre ?? 'la empresa'}`,
            monto,
            estado: 'pendiente',
            creado_por: data.universidadId,
            fecha: serverTimestamp(),
          });
        }
      });
    } else {
      tx.update(ref, {
        estado: 'rechazada' as EstadoAplicacionGrupo,
        justificacionRechazo: justificacion!.trim(),
        fechaRespuestaUniversidad: serverTimestamp(),
      });
    }

    return {
      empresaId: data.empresaId,
      grupoNombre: data.grupoNombre ?? '',
      vacanteTitulo: data.vacanteTitulo ?? '',
    };
  });

  // Notificar a la empresa
  if (empresaId) {
    const n = decision === 'aceptar'
      ? {
          tipo: 'success',
          titulo: '¡Pasantía confirmada!',
          mensaje: `La universidad aceptó tu oferta para el grupo "${grupoNombre}" en "${vacanteTitulo}".`,
        }
      : {
          tipo: 'warning',
          titulo: 'Oferta rechazada',
          mensaje: `La universidad rechazó tu oferta para el grupo "${grupoNombre}". Revisa la justificación.`,
        };
    await crearNotificacionInApp(empresaId, n.tipo, n.titulo, n.mensaje, '/dashboard-empresa');
  }
}

// ─────────────────────────────────────────────
// 9. EMPRESA ELIMINA VACANTE
// Solo mientras nadie la haya tocado todavía: ni un estudiante aplicó
// individualmente, ni una universidad la postuló por grupo (matchmaking),
// ni reclamó cupos. Borrar después de eso dejaría esos documentos
// referenciando una vacante inexistente.
// ─────────────────────────────────────────────
export async function vacanteTieneSolicitudes(vacanteId: string): Promise<boolean> {
  const [aplicaciones, aplicacionesGrupos, reclamos] = await Promise.all([
    getDocs(query(collection(db, 'aplicaciones'), where('vacante_id', '==', vacanteId))),
    getDocs(query(collection(db, 'aplicaciones_grupos'), where('vacanteId', '==', vacanteId))),
    getDocs(query(collection(db, 'reclamos_cupos'), where('vacanteId', '==', vacanteId))),
  ]);
  return !aplicaciones.empty || !aplicacionesGrupos.empty || !reclamos.empty;
}

export async function eliminarVacante(vacanteId: string, empresaId: string): Promise<void> {
  const vacSnap = await getDoc(doc(db, 'vacantes', vacanteId));
  if (!vacSnap.exists()) return;
  if ((vacSnap.data() as any)?.empresa_id !== empresaId) {
    throw new Error('Esta vacante no te pertenece.');
  }
  if (await vacanteTieneSolicitudes(vacanteId)) {
    throw new Error('No se puede eliminar: ya hay solicitudes o postulaciones para esta vacante.');
  }
  await deleteDoc(doc(db, 'vacantes', vacanteId));
}
