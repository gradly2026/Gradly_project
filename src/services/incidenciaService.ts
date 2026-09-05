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

  const ref = await addDoc(collection(db, COLECCION_INCIDENCIAS), {
    estudiante_id: uid,
    estudiante_nombre: p.estudianteNombre ?? '',
    universidad_id: universidadId,
    // El id de empresa se guarda SIEMPRE que se conozca, aunque la incidencia
    // no sea sobre ella: es el contexto de la práctica. Lo que decide quién
    // recibe el aviso es `categoria`, no este campo.
    empresa_id: p.empresaId ?? '',
    empresa_nombre: p.empresaNombre ?? '',
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

  // Aviso a la universidad (best-effort: la incidencia ya quedó registrada).
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
  rol: 'estudiante' | 'universidad' | 'empresa',
  uid: string,
  onChange: (lista: Incidencia[]) => void,
  onError?: () => void,
) {
  if (!uid) { onChange([]); return () => {}; }

  const campo =
    rol === 'estudiante' ? 'estudiante_id'
    : rol === 'universidad' ? 'universidad_id'
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

/** Agrega un mensaje al hilo. Lo puede hacer cualquiera de las partes. */
export async function responderIncidencia(
  incidenciaId: string,
  texto: string,
  autor: { nombre: string; rol: string },
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

  if (opts.estudianteId) {
    const textos: Record<EstadoIncidencia, string> = {
      abierta: 'Tu incidencia se reabrió.',
      en_seguimiento: 'Tu incidencia está siendo atendida.',
      escalada: 'Tu incidencia se escaló al equipo de Gradly.',
      resuelta: 'Tu incidencia se marcó como resuelta.',
    };
    try {
      await enviarNotificacion(
        opts.estudianteId,
        'Actualización de tu incidencia',
        opts.mensajeEstudiante ?? `${textos[estado]}${opts.motivo ? ` (${opts.motivo})` : ''}`,
        estado === 'resuelta' ? 'success' : 'info',
        opts.notifRef ?? null,
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
  inc: Pick<Incidencia, 'motivo' | 'estudiante_id' | 'estudiante_nombre' | 'origen'>,
): Promise<void> {
  const deEmpresa = inc.origen === 'empresa';
  await cambiarEstadoIncidencia(incidenciaId, 'escalada', {
    estudianteId: inc.estudiante_id,
    motivo: inc.motivo,
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
  inc: Pick<Incidencia, 'motivo' | 'estudiante_id' | 'estado'>,
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
}
