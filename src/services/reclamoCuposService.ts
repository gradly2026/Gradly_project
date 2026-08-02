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
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import { enviarNotificacion } from './notificationService';
import {
  cuposDisponibles,
  cuposLibresEnReclamo,
  cuposTotales,
  expiroSeleccion,
  PLAZO_SELECCION_HORAS,
} from '../utils/cupos';
import { normalizarHorario, type HorarioPasantia } from '../data/disponibilidad';

/**
 * Reclamo de cupos por lote: la universidad reserva N plazas de una vacante
 * para sus estudiantes, en vez del todo-o-nada del matchmaking por grupo.
 *
 * Así una universidad con 30 alumnos puede armar su cuota tomando 8 de una
 * empresa, 15 de otra y 7 de una tercera.
 *
 * **Los cupos se reservan al reclamar, incluso si el reclamo queda pendiente
 * de confirmación.** Si no se reservaran, dos universidades podrían reclamar
 * las mismas plazas mientras la empresa decide. Al rechazar o liberar, vuelven
 * al mercado.
 */

export const COLECCION_RECLAMOS = 'reclamos_cupos';

export type EstadoReclamo = 'pendiente' | 'aceptado' | 'rechazado' | 'liberado';

export interface ReclamoCupos {
  id: string;
  universidadId: string;
  empresaId: string;
  vacanteId: string;
  /** Grupo al que se destinan los cupos (opcional: puede repartirse luego). */
  grupoId?: string | null;
  /** Cupos reservados y aún vigentes. Baja al liberar sobrantes. */
  cantidad: number;
  /** Cantidad pedida originalmente (no cambia; `cantidad` sí). */
  cantidadInicial: number;
  estado: EstadoReclamo;
  /** Datos desnormalizados para pintar las bandejas sin lecturas extra. */
  vacanteTitulo?: string;
  empresaNombre?: string;
  universidadNombre?: string;
  grupoNombre?: string;
  /** Copia del horario de la vacante al momento de reclamar (evita sorpresas
   *  si la empresa lo cambia después). */
  horario?: HorarioPasantia | null;
  /** Cupos de este reclamo ya tomados por estudiantes. */
  tomados?: number | null;
  /** Hasta cuándo pueden elegir los estudiantes (48 h desde el reclamo). */
  fechaLimiteSeleccion?: any;
  motivoRechazo?: string;
  fechaReclamo?: any;
  fechaRespuesta?: any;
}

export const COLECCION_ASIGNACIONES = 'asignaciones_cupo';

/** Cupo que un estudiante concreto tomó del lote reservado por su universidad. */
export interface AsignacionCupo {
  id: string;
  reclamoId: string;
  estudianteId: string;
  estudianteNombre?: string;
  universidadId: string;
  empresaId: string;
  vacanteId: string;
  grupoId?: string | null;
  vacanteTitulo?: string;
  empresaNombre?: string;
  horario?: HorarioPasantia | null;
  estado: 'tomado' | 'cancelado';
  fechaTomado?: any;
}

/** Datos que la UI pasa al reclamar. */
export interface DatosReclamo {
  universidadId: string;
  vacanteId: string;
  cantidad: number;
  grupoId?: string | null;
  grupoNombre?: string;
  universidadNombre?: string;
}

/**
 * Reserva `cantidad` cupos de una vacante.
 *
 * Todo el chequeo + la reserva ocurren en UNA transacción: si dos
 * universidades reclaman a la vez, la segunda relee el contador ya
 * incrementado y falla en vez de sobrevender la vacante.
 *
 * El estado inicial depende de `reclamos_auto` en la vacante: la empresa
 * decide al publicar si acepta reclamos automáticamente o confirma cada uno
 * (por defecto, confirma — protege a quien paga la suscripción).
 */
export async function reclamarCupos(datos: DatosReclamo): Promise<{ id: string; estado: EstadoReclamo }> {
  const { universidadId, vacanteId, cantidad, grupoId, grupoNombre, universidadNombre } = datos;

  if (!universidadId || !vacanteId) throw new Error('Datos incompletos para reclamar cupos.');
  if (!Number.isFinite(cantidad) || cantidad < 1) {
    throw new Error('Indica cuántos cupos necesitas.');
  }

  const vacanteRef = doc(db, 'vacantes', vacanteId);

  const resultado = await runTransaction(db, async tx => {
    const snap = await tx.get(vacanteRef);
    if (!snap.exists()) throw new Error('La vacante ya no está disponible.');
    const vacante = snap.data() as any;

    if (vacante.activa === false) throw new Error('Esta vacante ya no está activa.');

    // Las vacantes legadas (sin `cupos`) no se pueden reclamar: no hay un
    // total contra el cual reservar. Se siguen usando por matchmaking normal.
    if (cuposTotales(vacante) === null) {
      throw new Error('Esta vacante no maneja cupos; postúlate por el flujo de grupo.');
    }

    const libres = cuposDisponibles(vacante) ?? 0;
    if (libres === 0) throw new Error('Esta vacante ya no tiene cupos disponibles.');
    if (cantidad > libres) {
      throw new Error(`Solo quedan ${libres} cupo(s) disponible(s).`);
    }

    // Reserva efectiva.
    tx.update(vacanteRef, { cupos_reclamados: increment(cantidad) });

    const estado: EstadoReclamo = vacante.reclamos_auto === true ? 'aceptado' : 'pendiente';

    return {
      estado,
      empresaId: (vacante.empresa_id as string) ?? '',
      vacanteTitulo: (vacante.titulo as string) ?? '',
      empresaNombre: (vacante.nombre_empresa as string) ?? '',
      horario: normalizarHorario(vacante.horario),
    };
  });

  // El documento del reclamo se crea FUERA de la transacción a propósito: si
  // fallara la reserva, no queremos un reclamo huérfano. Al revés (reserva sin
  // doc) sería recuperable liberando manualmente, y es el caso improbable.
  const ref = await addDoc(collection(db, COLECCION_RECLAMOS), {
    universidadId,
    empresaId: resultado.empresaId,
    vacanteId,
    grupoId: grupoId ?? null,
    cantidad,
    cantidadInicial: cantidad,
    estado: resultado.estado,
    vacanteTitulo: resultado.vacanteTitulo,
    empresaNombre: resultado.empresaNombre,
    universidadNombre: universidadNombre ?? '',
    grupoNombre: grupoNombre ?? '',
    horario: resultado.horario,
    tomados: 0,
    // Plazo para que los estudiantes elijan. No se usa serverTimestamp porque
    // hay que sumarle horas; el desfase de reloj del cliente es irrelevante
    // frente a un plazo de 48 h.
    fechaLimiteSeleccion: Timestamp.fromMillis(
      Date.now() + PLAZO_SELECCION_HORAS * 60 * 60 * 1000,
    ),
    motivoRechazo: '',
    fechaReclamo: serverTimestamp(),
    fechaRespuesta: null,
  });

  if (resultado.empresaId) {
    const msg =
      resultado.estado === 'aceptado'
        ? `${universidadNombre || 'Una universidad'} reservó ${cantidad} cupo(s) de "${resultado.vacanteTitulo}".`
        : `${universidadNombre || 'Una universidad'} solicita ${cantidad} cupo(s) de "${resultado.vacanteTitulo}". Confírmalo desde tu panel.`;
    await enviarNotificacion(
      resultado.empresaId,
      resultado.estado === 'aceptado' ? 'Cupos reservados' : 'Solicitud de cupos',
      msg,
      resultado.estado === 'aceptado' ? 'info' : 'warning',
      '/dashboard-empresa',
    );
  }

  return { id: ref.id, estado: resultado.estado };
}

/**
 * La empresa acepta o rechaza un reclamo pendiente.
 * Al rechazar, los cupos reservados vuelven al mercado.
 */
export async function responderReclamo(
  reclamoId: string,
  decision: 'aceptar' | 'rechazar',
  motivo?: string,
): Promise<void> {
  if (!reclamoId) throw new Error('Reclamo inválido.');
  if (decision === 'rechazar' && !motivo?.trim()) {
    throw new Error('Indica el motivo del rechazo.');
  }

  const reclamoRef = doc(db, COLECCION_RECLAMOS, reclamoId);

  const { universidadId, cantidad, vacanteTitulo } = await runTransaction(db, async tx => {
    const snap = await tx.get(reclamoRef);
    if (!snap.exists()) throw new Error('El reclamo ya no existe.');
    const data = snap.data() as ReclamoCupos;

    if (data.estado !== 'pendiente') throw new Error('Este reclamo ya fue procesado.');

    if (decision === 'aceptar') {
      tx.update(reclamoRef, { estado: 'aceptado', fechaRespuesta: serverTimestamp() });
    } else {
      // Devuelve los cupos reservados al mercado.
      tx.update(doc(db, 'vacantes', data.vacanteId), {
        cupos_reclamados: increment(-data.cantidad),
      });
      tx.update(reclamoRef, {
        estado: 'rechazado',
        motivoRechazo: motivo!.trim(),
        fechaRespuesta: serverTimestamp(),
      });
    }

    return {
      universidadId: data.universidadId,
      cantidad: data.cantidad,
      vacanteTitulo: data.vacanteTitulo ?? '',
    };
  });

  await enviarNotificacion(
    universidadId,
    decision === 'aceptar' ? 'Cupos confirmados' : 'Cupos rechazados',
    decision === 'aceptar'
      ? `La empresa confirmó tus ${cantidad} cupo(s) de "${vacanteTitulo}".`
      : `La empresa rechazó tu solicitud de cupos para "${vacanteTitulo}". Motivo: ${motivo!.trim()}`,
    decision === 'aceptar' ? 'success' : 'warning',
    '/dashboard-universidad',
  );
}

/**
 * Libera cupos que la universidad reservó pero no usará (p. ej. los que
 * ningún estudiante tomó dentro del plazo). Vuelven al mercado y se avisa a
 * la empresa — fue una decisión explícita: la empresa merece saber que
 * sobraron plazas que había apartado.
 */
export async function liberarCupos(reclamoId: string, cantidadALiberar: number): Promise<void> {
  if (!reclamoId) throw new Error('Reclamo inválido.');
  if (!Number.isFinite(cantidadALiberar) || cantidadALiberar < 1) {
    throw new Error('Indica cuántos cupos liberar.');
  }

  const reclamoRef = doc(db, COLECCION_RECLAMOS, reclamoId);

  const { empresaId, vacanteTitulo, universidadNombre } = await runTransaction(db, async tx => {
    const snap = await tx.get(reclamoRef);
    if (!snap.exists()) throw new Error('El reclamo ya no existe.');
    const data = snap.data() as ReclamoCupos;

    if (data.estado === 'rechazado' || data.estado === 'liberado') {
      throw new Error('Este reclamo ya no tiene cupos vigentes.');
    }
    if (cantidadALiberar > data.cantidad) {
      throw new Error(`Solo tienes ${data.cantidad} cupo(s) reservado(s).`);
    }

    const restantes = data.cantidad - cantidadALiberar;

    tx.update(doc(db, 'vacantes', data.vacanteId), {
      cupos_reclamados: increment(-cantidadALiberar),
    });
    tx.update(reclamoRef, {
      cantidad: restantes,
      // Solo se marca 'liberado' si ya no queda nada reservado.
      ...(restantes === 0 ? { estado: 'liberado' as EstadoReclamo } : {}),
    });

    return {
      empresaId: data.empresaId,
      vacanteTitulo: data.vacanteTitulo ?? '',
      universidadNombre: data.universidadNombre ?? 'Una universidad',
    };
  });

  await enviarNotificacion(
    empresaId,
    'Cupos liberados',
    `${universidadNombre} liberó ${cantidadALiberar} cupo(s) de "${vacanteTitulo}". Ya están disponibles de nuevo.`,
    'info',
    '/dashboard-empresa',
  );
}

/**
 * El estudiante toma uno de los cupos que su universidad reservó.
 *
 * **Orden de llegada, resuelto en transacción:** si dos estudiantes tocan el
 * último cupo a la vez, el segundo relee `tomados` ya incrementado y recibe
 * "se acaba de agotar" en vez de crear una asignación fantasma.
 *
 * Un estudiante no puede tener dos cupos: se comprueba antes de la
 * transacción (barata) y el propio flujo de UI oculta el tablero si ya eligió.
 */
export async function tomarCupo(params: {
  reclamoId: string;
  estudianteId: string;
  estudianteNombre?: string;
}): Promise<string> {
  const { reclamoId, estudianteId, estudianteNombre } = params;
  if (!reclamoId || !estudianteId) throw new Error('Datos incompletos.');

  // ¿Ya tiene un cupo tomado? (evita duplicados por doble toque o dos sesiones)
  const previas = await getDocs(
    query(
      collection(db, COLECCION_ASIGNACIONES),
      where('estudianteId', '==', estudianteId),
      where('estado', '==', 'tomado'),
    ),
  );
  if (!previas.empty) {
    throw new Error('Ya tomaste un cupo. Cancélalo antes de elegir otro.');
  }

  const reclamoRef = doc(db, COLECCION_RECLAMOS, reclamoId);

  const datos = await runTransaction(db, async tx => {
    const snap = await tx.get(reclamoRef);
    if (!snap.exists()) throw new Error('Esta oportunidad ya no existe.');
    const r = { id: snap.id, ...snap.data() } as ReclamoCupos;

    if (r.estado === 'rechazado' || r.estado === 'liberado') {
      throw new Error('Esta oportunidad ya no está disponible.');
    }
    if (expiroSeleccion(r)) {
      throw new Error('El plazo para elegir esta oportunidad ya venció.');
    }
    if (cuposLibresEnReclamo(r) === 0) {
      throw new Error('Alguien más acaba de tomar el último cupo.');
    }

    tx.update(reclamoRef, { tomados: increment(1) });

    return {
      universidadId: r.universidadId,
      empresaId: r.empresaId,
      vacanteId: r.vacanteId,
      grupoId: r.grupoId ?? null,
      vacanteTitulo: r.vacanteTitulo ?? '',
      empresaNombre: r.empresaNombre ?? '',
      horario: r.horario ?? null,
    };
  });

  const ref = await addDoc(collection(db, COLECCION_ASIGNACIONES), {
    reclamoId,
    estudianteId,
    estudianteNombre: estudianteNombre ?? '',
    ...datos,
    estado: 'tomado' as const,
    fechaTomado: serverTimestamp(),
  });

  // Avisos: a la universidad (para su seguimiento) y a la empresa (sabe quién llega).
  const quien = estudianteNombre || 'Un estudiante';
  await enviarNotificacion(
    datos.universidadId,
    'Cupo tomado',
    `${quien} tomó un cupo de "${datos.vacanteTitulo}" (${datos.empresaNombre}).`,
    'success',
    '/dashboard-universidad',
  );
  await enviarNotificacion(
    datos.empresaId,
    'Estudiante asignado',
    `${quien} tomó uno de los cupos de "${datos.vacanteTitulo}".`,
    'info',
    '/dashboard-empresa',
  );

  return ref.id;
}

/**
 * El estudiante suelta un cupo que había tomado: vuelve al lote de su
 * universidad (no al mercado general — sigue siendo un cupo reservado).
 */
export async function cancelarCupo(asignacionId: string): Promise<void> {
  if (!asignacionId) throw new Error('Asignación inválida.');
  const asigRef = doc(db, COLECCION_ASIGNACIONES, asignacionId);

  await runTransaction(db, async tx => {
    const snap = await tx.get(asigRef);
    if (!snap.exists()) throw new Error('Esta asignación ya no existe.');
    const a = snap.data() as AsignacionCupo;
    if (a.estado !== 'tomado') throw new Error('Este cupo ya fue liberado.');

    tx.update(doc(db, COLECCION_RECLAMOS, a.reclamoId), { tomados: increment(-1) });
    tx.update(asigRef, { estado: 'cancelado' as const });
  });
}

/** Lee un reclamo puntual (para pantallas de detalle). */
export async function obtenerReclamo(reclamoId: string): Promise<ReclamoCupos | null> {
  const snap = await getDoc(doc(db, COLECCION_RECLAMOS, reclamoId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as ReclamoCupos) : null;
}
