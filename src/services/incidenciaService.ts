// ════════════════════════════════════════════════════════════════════════
// incidenciaService.ts — problemas ocurridos DURANTE una práctica.
//
// GUÍA PARA PRINCIPIANTES:
// Ojo con no confundir esto con `reporteService.ts`, que ya existía. Son dos
// cosas distintas a propósito:
//
//   · `reportes`    → denuncia la CONDUCTA DE UNA PERSONA (spam, acoso,
//                     suplantación). Va derecho al panel admin y nadie más lo
//                     ve; sería absurdo enseñarle a una empresa la denuncia de
//                     acoso que un estudiante puso contra ella.
//   · `incidencias` → un PROBLEMA DE LA PRÁCTICA ("llevo tres semanas sin
//                     supervisor", "no me asignaron tareas", "el horario no es
//                     el acordado"). Aquí lo normal es justo lo contrario: la
//                     empresa y la universidad TIENEN que verlo, porque son
//                     quienes pueden arreglarlo. El admin entra solo si lo
//                     escalan.
//
// Mezclarlas en una sola colección habría ensuciado el módulo de Reportes del
// panel admin, que ya funciona y tiene su propio flujo de resolución.
//
// CICLO DE VIDA de una incidencia:
//   abierta → en_seguimiento → resuelta
//                ↘ escalada → (el admin la ve) → resuelta
// El estudiante la abre y puede escribir en el hilo, pero NO cambia el estado:
// eso lo deciden quienes deben responder (empresa/universidad/admin). Sin esa
// separación, cualquiera podría marcar como "resuelto" su propio problema.
// ════════════════════════════════════════════════════════════════════════

import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../config/firebaseConfig';
import { enviarNotificacion } from './notificationService';

export const COLECCION_INCIDENCIAS = 'incidencias';

/** Quién o qué causó el problema. Decide a quién le llega el aviso.
 *  `'estudiante'` es para las incidencias que abre la EMPRESA sobre el pasante
 *  (llegadas tarde, tareas sin cumplir…); las demás las abre el estudiante. */
export type CategoriaIncidencia = 'empresa' | 'universidad' | 'plataforma' | 'estudiante' | 'otro';

/** Quién abrió la incidencia. Ausente = `'estudiante'` (todas las históricas). */
export type OrigenIncidencia = 'estudiante' | 'empresa';

export type EstadoIncidencia = 'abierta' | 'en_seguimiento' | 'escalada' | 'resuelta';

/** Motivos sugeridos. Texto libre también vale: la lista orienta, no encierra. */
export const MOTIVOS_INCIDENCIA = [
  'No me asignaron tareas',
  'Horario distinto al acordado',
  'Falta de supervisor o acompañamiento',
  'Condiciones inseguras',
  'Trato inadecuado',
  'Mis horas no se están registrando',
  'Problema con la plataforma',
  'Otro',
] as const;

/** Motivos sugeridos cuando es la EMPRESA quien reporta a un pasante. */
export const MOTIVOS_INCIDENCIA_EMPRESA = [
  'Llegadas tarde reiteradas',
  'Ausencias sin aviso',
  'Incumplimiento de tareas asignadas',
  'Bajo rendimiento sostenido',
  'Conducta inadecuada',
  'Abandono del puesto',
  // Fase 4 de "asistencia real" (ver [[project_asistencia_pasantia]]): la
  // empresa mueve al pasante de área/puesto sin sacarlo de la pasantía (para
  // no perder la oportunidad). No es una acción propia con campos nuevos —
  // deliberadamente es solo una entrada más aquí, queda como constancia.
  'Cambio de área o puesto',
  'Otro',
] as const;

/** Una entrada del hilo de seguimiento. */
export interface SeguimientoIncidencia {
  autor_id: string;
  autor_nombre: string;
  autor_rol: string;
  texto: string;
  /**
   * Timestamp.now() y no serverTimestamp(): Firestore NO permite un
   * serverTimestamp() dentro de un elemento de array (arrayUnion). La hora la
   * pone el dispositivo. Es una imprecisión aceptable para un hilo de
   * conversación; los campos de nivel superior (`fecha`, `fecha_actualizacion`)
   * sí llevan hora de servidor y son los que se usan para ordenar.
   */
  fecha: Timestamp;
}

export interface Incidencia {
  id: string;
  estudiante_id: string;
  estudiante_nombre: string;
  universidad_id: string;
  /** '' cuando el problema no involucra a ninguna empresa. */
  empresa_id: string;
  empresa_nombre: string;
  categoria: CategoriaIncidencia;
  /** Quién la abrió. Ausente en las históricas = 'estudiante'. */
  origen?: OrigenIncidencia;
  /**
   * Solo para `origen:'empresa'`: mientras es `false`, el estudiante NO la ve
   * en su bandeja ni recibe aviso. Pasa a `true` cuando la universidad la
   * notifica o la escala. Para `origen:'estudiante'` no aplica (él la abrió).
   */
  visible_estudiante?: boolean;
  motivo: string;
  descripcion: string;
  estado: EstadoIncidencia;
  seguimiento: SeguimientoIncidencia[];
  resolucion: string;
  fecha: any;
  fecha_actualizacion: any;
  /**
   * Rol "tutor" Fase 4: el tutor que estaba asignado al pasante AL CREARSE la
   * incidencia (y la asignación a la que pertenece). Se fijan una sola vez y
   * quedan inmutables (ver firestore.rules) — una reasignación posterior del
   * tutor no cambia qué incidencias ve cada uno. Ausentes cuando la incidencia
   * no es sobre un pasante de cupo con tutor (contratos laborales, o cupos sin
   * tutor asignado todavía).
   */
  tutor_id?: string | null;
  asignacion_id?: string | null;
}

/** Datos que el estudiante aporta al abrir una incidencia. */
export interface CrearIncidenciaParams {
  estudianteNombre: string;
  universidadId: string;
  empresaId?: string | null;
  empresaNombre?: string | null;
  categoria: CategoriaIncidencia;
  motivo: string;
  descripcion: string;
}

/**
 * Rol "tutor" Fase 4: resuelve la asignación de cupo ACTIVA de un estudiante
 * (y su tutor, si tiene) para congelarlos en una incidencia nueva sobre esa
 * empresa. Mismo query que ya usa useProgresoInscripcion — de haber varias
 * (no debería), toma la primera no finalizada. `null` si no tiene ninguna
 * (aplicación individual, acuerdo de grupo, o sin tutor asignado todavía).
 */
async function resolverAsignacionYTutor(
  estudianteId: string,
): Promise<{ asignacionId: string | null; tutorId: string | null }> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'asignaciones_cupo'),
        where('estudianteId', '==', estudianteId),
        where('estado', '==', 'tomado'),
      ),
    );
    const activa = snap.docs
      .map(d => ({ id: d.id, ...(d.data() as any) }))
      .find(a => a.finalizada !== true);
    return { asignacionId: activa?.id ?? null, tutorId: activa?.tutorId ?? null };
  } catch {
    return { asignacionId: null, tutorId: null };
  }
}

/**
 * Abre una incidencia y avisa a quien corresponda.
 *
 * El aviso va a la universidad SIEMPRE (es la responsable del estudiante ante
 * la práctica) y además a la empresa cuando la incidencia es sobre ella. Una
 * incidencia de categoría 'empresa' que la empresa no viera no serviría de
 * nada, y una que la universidad no viera dejaría fuera a quien debe velar por
 * el alumno.
 */
export async function crearIncidencia(p: CrearIncidenciaParams): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sesión no válida.');
  if (!p.motivo.trim()) throw new Error('Selecciona un motivo.');
  if (p.descripcion.trim().length < 10) {
    // Un mínimo real: "no" no le da a nadie con qué actuar. El modal ya valida
    // esto antes con un mensaje; esto es la última red.
    throw new Error('Cuéntanos un poco más: al menos 10 caracteres.');
  }

  // OJO: NO se aborta si el estudiante no tiene universidad vinculada — antes
  // esto lanzaba un error que dejaba el modal "sin enviar". Se guarda con
  // `universidad_id: ''` y la incidencia igual llega al admin (más abajo).
  const universidadId = p.universidadId ?? '';
  const esSobreEmpresa = p.categoria === 'empresa' && !!p.empresaId;

  // Rol "tutor" Fase 4: si el reporte es sobre la empresa, el tutor asignado
  // en este momento "entra en tutela de juicio" — se congela en la incidencia
  // igual que si la hubiera creado la propia empresa.
  const { asignacionId, tutorId } = esSobreEmpresa
    ? await resolverAsignacionYTutor(uid)
    : { asignacionId: null, tutorId: null };

  const ref = await addDoc(collection(db, COLECCION_INCIDENCIAS), {
    estudiante_id: uid,
    estudiante_nombre: p.estudianteNombre ?? '',
    universidad_id: universidadId,
    // El id de empresa se guarda SIEMPRE que se conozca, aunque la incidencia
    // no sea sobre ella: es el contexto de la práctica. Lo que decide quién
    // recibe el aviso es `categoria`, no este campo.
    empresa_id: p.empresaId ?? '',
    empresa_nombre: p.empresaNombre ?? '',
    tutor_id: tutorId,
    asignacion_id: asignacionId,
    categoria: p.categoria,
    motivo: p.motivo.trim(),
    descripcion: p.descripcion.trim(),
    estado: 'abierta' as EstadoIncidencia,
    seguimiento: [],
    resolucion: '',
    fecha: serverTimestamp(),
    fecha_actualizacion: serverTimestamp(),
  });

  // Avisos best-effort: la incidencia YA quedó registrada. `allSettled` para
  // que ningún fallo/lentitud de una notificación bloquee el retorno.
  const titulo = 'Nueva incidencia reportada';
  const mensaje = `${p.estudianteNombre || 'Un estudiante'} reportó: ${p.motivo.trim()}`;
  const avisos: Promise<any>[] = [];
  if (universidadId) avisos.push(enviarNotificacion(universidadId, titulo, mensaje, 'warning'));
  if (esSobreEmpresa) avisos.push(enviarNotificacion(p.empresaId!, titulo, mensaje, 'warning'));
  if (tutorId) avisos.push(enviarNotificacion(tutorId, titulo, mensaje, 'warning', `incidenciaTutor:${ref.id}`));
  // El admin ve TODA incidencia nueva (no solo las escaladas), vía la misma
  // cola que usa el panel — `escalarIncidencia`. Best-effort: si las reglas no
  // dejan a un estudiante escribir ahí, la incidencia sigue visible en la
  // bandeja de la universidad/empresa.
  avisos.push(
    addDoc(collection(db, 'admin_notifications'), {
      title: `Nueva incidencia: ${p.motivo.trim()}`,
      is_read: false,
      tipo: 'incidencia',
      incidencia_id: ref.id,
      estudiante_id: uid,
      estudiante_nombre: p.estudianteNombre ?? '',
      created_at: serverTimestamp(),
    }),
  );
  await Promise.allSettled(avisos);

  return ref.id;
}

/** Datos que la empresa aporta al reportar a un pasante suyo. */
export interface CrearIncidenciaEmpresaParams {
  estudianteId: string;
  estudianteNombre: string;
  universidadId: string;
  empresaId: string;
  empresaNombre: string;
  motivo: string;
  descripcion: string;
  /** Rol "tutor" Fase 4: si ese pasante tiene tutor asignado, se congela en
   *  la incidencia — así también él la ve, aunque haya sido la empresa quien
   *  reportó. Van juntos: sin `asignacionId` no tiene sentido guardar `tutorId`. */
  asignacionId?: string | null;
  tutorId?: string | null;
}

/**
 * La EMPRESA abre una incidencia SOBRE un pasante suyo (llegadas tarde, tareas
 * sin cumplir, ausencias…). Va a la MISMA colección `incidencias` que las que
 * abre el estudiante, con `origen: 'empresa'` para distinguirlas.
 *
 * Nace oculta al estudiante (`visible_estudiante: false`): la universidad la ve
 * de inmediato y decide si la notifica al estudiante o la escala al admin —
 * solo entonces el estudiante la ve y recibe el aviso. El admin NO se entera
 * hasta que la universidad la escale (mismo criterio que el resto del módulo).
 */
export async function crearIncidenciaEmpresa(p: CrearIncidenciaEmpresaParams): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sesión no válida.');
  if (uid !== p.empresaId) throw new Error('Solo la empresa dueña puede reportar.');
  if (!p.estudianteId) throw new Error('Elige al estudiante.');
  if (!p.motivo.trim()) throw new Error('Selecciona un motivo.');
  if (p.descripcion.trim().length < 10) {
    throw new Error('Cuéntanos un poco más: al menos 10 caracteres.');
  }

  const universidadId = p.universidadId ?? '';

  const ref = await addDoc(collection(db, COLECCION_INCIDENCIAS), {
    estudiante_id: p.estudianteId,
    estudiante_nombre: p.estudianteNombre ?? '',
    universidad_id: universidadId,
    empresa_id: p.empresaId,
    empresa_nombre: p.empresaNombre ?? '',
    tutor_id: p.tutorId ?? null,
    asignacion_id: p.asignacionId ?? null,
    categoria: 'estudiante' as CategoriaIncidencia,
    origen: 'empresa' as OrigenIncidencia,
    visible_estudiante: false,
    motivo: p.motivo.trim(),
    descripcion: p.descripcion.trim(),
    estado: 'abierta' as EstadoIncidencia,
    seguimiento: [],
    resolucion: '',
    fecha: serverTimestamp(),
    fecha_actualizacion: serverTimestamp(),
  });

  // Avisos a la universidad y (Fase 4 del rol "tutor") al tutor asignado —
  // best-effort: la incidencia ya quedó registrada.
  if (universidadId) {
    try {
      await enviarNotificacion(
        universidadId,
        'Una empresa reportó a un estudiante',
        `${p.empresaNombre || 'Una empresa'} reportó a ${p.estudianteNombre || 'un estudiante'}: ${p.motivo.trim()}`,
        'warning',
        `incidencia:${ref.id}`,
      );
    } catch { /* no-op */ }
  }
  if (p.tutorId) {
    try {
      await enviarNotificacion(
        p.tutorId,
        'Tu empresa reportó a un pasante',
        `${p.empresaNombre || 'Tu empresa'} reportó a ${p.estudianteNombre || 'un pasante'}: ${p.motivo.trim()}`,
        'warning',
        `incidenciaTutor:${ref.id}`,
      );
    } catch { /* no-op */ }
  }

  return ref.id;
}

/** Datos que el TUTOR aporta al reportar a uno de sus pasantes (rol "tutor",
 *  Fase 4). `asignacionId` es obligatorio (no opcional como en la versión de
 *  empresa): la regla de Firestore lo necesita para confirmar que ese tutor
 *  de verdad está puesto en esa asignación, y que nombra al mismo estudiante
 *  y empresa que el resto del documento. */
export interface CrearIncidenciaTutorParams {
  estudianteId: string;
  estudianteNombre: string;
  universidadId: string;
  empresaId: string;
  empresaNombre: string;
  asignacionId: string;
  motivo: string;
  descripcion: string;
}

/**
 * El TUTOR abre una incidencia sobre uno de sus propios pasantes — misma
 * forma que `crearIncidenciaEmpresa` (paridad total, decisión del usuario),
 * solo que `tutor_id` es quien llama, no la empresa. Nace oculta al
 * estudiante igual que la de la empresa; la universidad decide si notificar
 * o escalar.
 */
export async function crearIncidenciaTutor(p: CrearIncidenciaTutorParams): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sesión no válida.');
  if (!p.asignacionId) throw new Error('No se pudo identificar la pasantía.');
  if (!p.estudianteId) throw new Error('Elige al estudiante.');
  if (!p.motivo.trim()) throw new Error('Selecciona un motivo.');
  if (p.descripcion.trim().length < 10) {
    throw new Error('Cuéntanos un poco más: al menos 10 caracteres.');
  }

  const universidadId = p.universidadId ?? '';

  const ref = await addDoc(collection(db, COLECCION_INCIDENCIAS), {
    estudiante_id: p.estudianteId,
    estudiante_nombre: p.estudianteNombre ?? '',
    universidad_id: universidadId,
    empresa_id: p.empresaId,
    empresa_nombre: p.empresaNombre ?? '',
    tutor_id: uid,
    asignacion_id: p.asignacionId,
    categoria: 'estudiante' as CategoriaIncidencia,
    origen: 'empresa' as OrigenIncidencia,
    visible_estudiante: false,
    motivo: p.motivo.trim(),
    descripcion: p.descripcion.trim(),
    estado: 'abierta' as EstadoIncidencia,
    seguimiento: [],
    resolucion: '',
    fecha: serverTimestamp(),
    fecha_actualizacion: serverTimestamp(),
  });

  if (universidadId) {
    try {
      await enviarNotificacion(
        universidadId,
        'Un tutor reportó a un estudiante',
        `${p.empresaNombre || 'Una empresa'} reportó a ${p.estudianteNombre || 'un estudiante'}: ${p.motivo.trim()}`,
        'warning',
        `incidencia:${ref.id}`,
      );
    } catch { /* no-op */ }
  }

  return ref.id;
}

/**
 * Se suscribe EN VIVO a las incidencias que le tocan a un usuario según su rol.
 *
 * Cada rol filtra por un campo distinto, y por eso son consultas separadas en
 * vez de una sola con OR: Firestore no permite comparar dos campos distintos
 * con OR dentro de una misma consulta sin `or()` compuesto, y esta forma deja
 * además que las reglas de seguridad validen cada caso por separado.
 */
export function suscribirIncidencias(
  rol: 'estudiante' | 'universidad' | 'empresa' | 'tutor',
  uid: string,
  onChange: (lista: Incidencia[]) => void,
  onError?: () => void,
) {
  if (!uid) { onChange([]); return () => {}; }

  const campo =
    rol === 'estudiante' ? 'estudiante_id'
    : rol === 'universidad' ? 'universidad_id'
    : rol === 'tutor' ? 'tutor_id'
    : 'empresa_id';

  const q = query(
    collection(db, COLECCION_INCIDENCIAS),
    where(campo, '==', uid),
    orderBy('fecha_actualizacion', 'desc'),
  );

  return onSnapshot(
    q,
    snap => onChange(snap.docs.map(d => ({ id: d.id, ...d.data() } as Incidencia))),
    () => onError?.(),
    // Manejador de error explícito: sin él, un fallo de permisos o un índice
    // compuesto que falte se convierte en una excepción no capturada.
  );
}

/**
 * Incidencias que involucran a la vez a un estudiante concreto y a quien
 * consulta (empresa o universidad). Lectura de una sola vez, pensada como
 * CONTEXTO al evaluar al estudiante tras una pasantía culminada (feedback a 3
 * bandas).
 *
 * Consulta por el campo del PROPIO consultante (`empresa_id` / `universidad_id`)
 * y filtra en cliente por `estudiante_id`: así las reglas la permiten (el
 * consultante es siempre parte de cada doc devuelto) y se apoya en un índice ya
 * existente. No expone nada nuevo: son las mismas incidencias que ese rol ya ve
 * en su bandeja.
 */
export async function getIncidenciasDeEstudiante(
  rolConsultante: 'universidad' | 'empresa',
  uid: string,
  estudianteId: string,
): Promise<Incidencia[]> {
  if (!uid || !estudianteId) return [];
  const campo = rolConsultante === 'universidad' ? 'universidad_id' : 'empresa_id';
  const snap = await getDocs(
    query(collection(db, COLECCION_INCIDENCIAS), where(campo, '==', uid)),
  );
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Incidencia))
    .filter(i => i.estudiante_id === estudianteId)
    .sort(
      (a, b) =>
        (b.fecha_actualizacion?.toMillis?.() ?? 0) -
        (a.fecha_actualizacion?.toMillis?.() ?? 0),
    );
}

/** Agrega un mensaje al hilo. Lo puede hacer cualquiera de las partes.
 *  `tutorId` (rol "tutor" Fase 4): si la incidencia tiene tutor asignado y
 *  no es quien está respondiendo, se le avisa — "está al tanto" también
 *  cuando la conversación avanza sin él. */
export async function responderIncidencia(
  incidenciaId: string,
  texto: string,
  autor: { nombre: string; rol: string },
  tutorId?: string | null,
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sesión no válida.');
  if (!texto.trim()) throw new Error('Escribe una respuesta.');

  await updateDoc(doc(db, COLECCION_INCIDENCIAS, incidenciaId), {
    seguimiento: arrayUnion({
      autor_id: uid,
      autor_nombre: autor.nombre ?? '',
      autor_rol: autor.rol ?? '',
      texto: texto.trim(),
      fecha: Timestamp.now(),
    }),
    fecha_actualizacion: serverTimestamp(),
  });

  if (tutorId && tutorId !== uid) {
    try {
      await enviarNotificacion(
        tutorId,
        'Nueva respuesta en una incidencia',
        `${autor.nombre || 'Alguien'} respondió en una incidencia de tu pasante.`,
        'info',
        `incidenciaTutor:${incidenciaId}`,
      );
    } catch { /* no-op */ }
  }
}

/**
 * Cambia el estado. Reservado a empresa/universidad/admin: el estudiante no
 * declara resuelto su propio problema (ver las reglas de Firestore).
 *
 * `resolucion` es obligatoria al cerrar: un "resuelta" sin explicación no le
 * dice nada al estudiante sobre qué pasó, que es justo lo que hacía mal el
 * flujo de notas de revisión del panel admin antes de que se corrigiera.
 */
export async function cambiarEstadoIncidencia(
  incidenciaId: string,
  estado: EstadoIncidencia,
  opts: {
    resolucion?: string;
    estudianteId?: string;
    motivo?: string;
    /** Campos extra a fijar en el mismo update (p. ej. `visible_estudiante`). */
    extra?: Record<string, any>;
    /** Deep link para la notificación al estudiante (p. ej. `incidencia:ID`). */
    notifRef?: string;
    /** Reemplaza el texto por defecto del aviso al estudiante. */
    mensajeEstudiante?: string;
    /** Rol "tutor" Fase 4: si la incidencia tiene tutor asignado y no es
     *  quien está gestionando, se le avisa del cambio de estado. */
    tutorId?: string | null;
  } = {},
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sesión no válida.');
  if (estado === 'resuelta' && !opts.resolucion?.trim()) {
    throw new Error('Explica cómo se resolvió antes de cerrarla.');
  }

  await updateDoc(doc(db, COLECCION_INCIDENCIAS, incidenciaId), {
    estado,
    ...(opts.resolucion !== undefined ? { resolucion: opts.resolucion.trim() } : {}),
    ...(opts.extra ?? {}),
    fecha_actualizacion: serverTimestamp(),
  });

  const textos: Record<EstadoIncidencia, string> = {
    abierta: 'se reabrió.',
    en_seguimiento: 'está siendo atendida.',
    escalada: 'se escaló al equipo de Gradly.',
    resuelta: 'se marcó como resuelta.',
  };

  if (opts.estudianteId) {
    try {
      await enviarNotificacion(
        opts.estudianteId,
        'Actualización de tu incidencia',
        opts.mensajeEstudiante ?? `Tu incidencia ${textos[estado]}${opts.motivo ? ` (${opts.motivo})` : ''}`,
        estado === 'resuelta' ? 'success' : 'info',
        opts.notifRef ?? null,
      );
    } catch { /* no-op */ }
  }

  if (opts.tutorId && opts.tutorId !== uid) {
    try {
      await enviarNotificacion(
        opts.tutorId,
        'Actualización de una incidencia',
        `Una incidencia de tu pasante ${textos[estado]}${opts.motivo ? ` (${opts.motivo})` : ''}`,
        estado === 'resuelta' ? 'success' : 'info',
        `incidenciaTutor:${incidenciaId}`,
      );
    } catch { /* no-op */ }
  }
}

/**
 * Escala al equipo de Gradly. Además del cambio de estado, deja una entrada en
 * `admin_notifications` — la misma cola que ya alimenta el módulo de
 * Notificaciones del panel admin, para no inventar un canal paralelo.
 */
export async function escalarIncidencia(
  incidenciaId: string,
  inc: Pick<Incidencia, 'motivo' | 'estudiante_id' | 'estudiante_nombre' | 'origen' | 'tutor_id'>,
): Promise<void> {
  const deEmpresa = inc.origen === 'empresa';
  await cambiarEstadoIncidencia(incidenciaId, 'escalada', {
    estudianteId: inc.estudiante_id,
    motivo: inc.motivo,
    tutorId: inc.tutor_id,
    // Solo las incidencias de la empresa se revelan al estudiante al escalarlas
    // y abren el modal de acuse; las que abrió el propio estudiante siguen igual.
    ...(deEmpresa
      ? {
          extra: { visible_estudiante: true },
          notifRef: `incidencia:${incidenciaId}`,
          mensajeEstudiante: `Tu universidad elevó al equipo de Gradly el reporte de la empresa (${inc.motivo}). Es una situación grave: revísala y toma medidas.`,
        }
      : {}),
  });
  try {
    await addDoc(collection(db, 'admin_notifications'), {
      title: `Incidencia escalada: ${inc.motivo}`,
      is_read: false,
      tipo: 'incidencia',
      incidencia_id: incidenciaId,
      estudiante_id: inc.estudiante_id,
      created_at: serverTimestamp(),
    });
  } catch {
    // Igual que en reporteService: si las reglas todavía no dejan a un
    // no-admin escribir en esa cola, la incidencia ya quedó escalada y
    // visible en la bandeja; el aviso es secundario.
  }
}

/**
 * La UNIVERSIDAD "notifica" al estudiante una incidencia que abrió la empresa:
 * la revela en su bandeja (`visible_estudiante: true`), la pasa a
 * `en_seguimiento`, deja constancia en el hilo y le manda un aviso con deep
 * link al modal de acuse. Es la vía "blanda" (la dura es escalar al admin).
 */
export async function notificarEstudianteIncidencia(
  incidenciaId: string,
  inc: Pick<Incidencia, 'motivo' | 'estudiante_id' | 'estado' | 'tutor_id'>,
  universidadNombre: string,
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sesión no válida.');

  await updateDoc(doc(db, COLECCION_INCIDENCIAS, incidenciaId), {
    visible_estudiante: true,
    ...(inc.estado === 'abierta' ? { estado: 'en_seguimiento' as EstadoIncidencia } : {}),
    seguimiento: arrayUnion({
      autor_id: uid,
      autor_nombre: universidadNombre || 'Universidad',
      autor_rol: 'universidad',
      texto: `Revisamos el reporte de la empresa (${inc.motivo}). Te notificamos formalmente: corrige la situación y evita que se repita. Puedes responder en este hilo.`,
      fecha: Timestamp.now(),
    }),
    fecha_actualizacion: serverTimestamp(),
  });

  try {
    await enviarNotificacion(
      inc.estudiante_id,
      'Tu universidad te notificó una incidencia',
      `La empresa reportó: ${inc.motivo}. Tu universidad ya fue informada y te pide corregirlo. Toca para ver el detalle.`,
      'warning',
      `incidencia:${incidenciaId}`,
    );
  } catch { /* no-op */ }

  if (inc.tutor_id && inc.tutor_id !== uid) {
    try {
      await enviarNotificacion(
        inc.tutor_id,
        'Tu universidad respondió una incidencia',
        `La universidad notificó formalmente al pasante sobre el reporte: ${inc.motivo}.`,
        'info',
        `incidenciaTutor:${incidenciaId}`,
      );
    } catch { /* no-op */ }
  }
}
