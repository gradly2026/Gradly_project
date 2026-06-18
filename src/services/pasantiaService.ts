import {
  addDoc,
  collection,
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
import { crearNotificacionInApp, NOTIF } from './notificacionService';
import { enviarNotificacion } from './notificationService';

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
// 1. ESTUDIANTE APLICA A VACANTE
// ─────────────────────────────────────────────
export async function aplicarAVacante(
  estudianteId: string,
  vacanteId: string,
  empresaId: string,
  estudiantePerfil: { nombre_completo: string; foto_url?: string; universidad_id?: string },
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

// ─────────────────────────────────────────────
// 2. EMPRESA CAMBIA ESTADO DE APLICACIÓN
// ─────────────────────────────────────────────
export async function cambiarEstadoAplicacion(
  aplicacionId: string,
  nuevoEstado: string,
  vacanteId?: string,
  estudianteId?: string,
  vacanteNombre?: string,
): Promise<void> {
  const updates: Record<string, any> = { estado: nuevoEstado };

  if (nuevoEstado === 'contratado') {
    updates.fecha_inicio = serverTimestamp();
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
export async function universidadApruebaHoras(
  aplicacionId: string,
  estudianteId: string,
  horasAprobar: number,
  horasObjetivo: number,
): Promise<NivelEstudiante> {
  await updateDoc(doc(db, 'aplicaciones', aplicacionId), { estado: 'aprobado' });

  await updateDoc(doc(db, 'perfiles_estudiantes', estudianteId), {
    horas_aprobadas:  increment(horasAprobar),
    horas_en_proceso: increment(-Math.abs(horasAprobar)),
  });

  // Notificar al estudiante sobre sus horas aprobadas
  const n = NOTIF.horasAprobadas(horasAprobar);
  await crearNotificacionInApp(estudianteId, n.tipo, n.titulo, n.mensaje, '/(tabs)/progreso');

  // Retornamos el nuevo nivel para mostrarlo en la UI
  return calcularNivelEstudiante(horasAprobar, horasObjetivo);
}

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

/** Detalles que la empresa envía al aceptar un grupo */
export interface OfertaEmpresa {
  horarioPropuesto: string;   // ej. "7:00 a 17:00"
  diasTrabajo: string[];      // ej. ["Lunes", "Martes", "Miércoles"]
  pagoTotal?: number;         // opcional
  justificacionRechazo?: string; // requerido solo si la empresa rechaza
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
  horarioPropuesto?: string;
  diasTrabajo?: string[];
  pagoTotal?: number | null;
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
    if (!detalles?.horarioPropuesto?.trim()) {
      throw new Error('Debes indicar el horario propuesto (ej. 7:00 a 17:00).');
    }
    if (!detalles?.diasTrabajo?.length) {
      throw new Error('Debes seleccionar al menos un día de trabajo.');
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
      tx.update(ref, {
        estado: 'revisando' as EstadoAplicacionGrupo,
        horarioPropuesto: detalles.horarioPropuesto.trim(),
        diasTrabajo:      detalles.diasTrabajo,
        pagoTotal:        typeof detalles.pagoTotal === 'number' ? detalles.pagoTotal : null,
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
      tx.update(ref, {
        estado: 'aprobada' as EstadoAplicacionGrupo,
        fechaRespuestaUniversidad: serverTimestamp(),
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
