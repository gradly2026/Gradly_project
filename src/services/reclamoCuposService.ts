// ════════════════════════════════════════════════════════════════════════
// reclamoCuposService.ts
//
// GUÍA PARA PRINCIPIANTES:
// Este archivo implementa el sistema de "reparto de cupos": en vez de que
// una universidad postule un grupo ENTERO a una vacante (todo o nada,
// ver pasantiaService.ts), aquí una universidad puede RESERVAR una
// CANTIDAD de plazas sueltas de una vacante (por ejemplo, 8 de 30
// estudiantes), y luego cada estudiante ELIGE por su cuenta tomar uno de
// esos cupos ya reservados. Es otro gran ejemplo de CRUD + transacciones,
// muy similar en espíritu a pasantiaService.ts, pero con un concepto de
// negocio distinto: "inventario de cupos" en vez de "compromiso de grupo
// completo". Si ya entendiste pasantiaService.ts, reconocerás el mismo
// patrón de transacciones aquí, aplicado a otro problema.
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
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
// Todas estas funciones ya se explicaron a fondo en pasantiaService.ts.
// La única nueva aquí es:
//   - Timestamp (con mayúscula, distinto de serverTimestamp()) → permite
//     CONSTRUIR una fecha de Firestore a partir de un valor calculado en
//     el propio celular (ver Timestamp.fromMillis más abajo), en vez de
//     pedirle al servidor "pon la hora actual" — se necesita cuando hay
//     que calcular una fecha FUTURA (aquí, un plazo de 48 horas).

import { db } from '../config/firebaseConfig';
import { enviarNotificacion } from './notificationService';
import {
  cuposDisponibles,
  cuposLibresEnReclamo,
  cuposTotales,
  expiroSeleccion,
  PLAZO_SELECCION_HORAS,
  sePuedeTomar,
} from '../utils/cupos';
// Funciones utilitarias de src/utils/cupos.ts (no comentado en detalle en
// esta sesión, pero sus nombres son bastante descriptivos):
//   - cuposTotales(vacante)       → el total de cupos que ofrece la
//     vacante, o null si es una vacante "legada" sin ese concepto.
//   - cuposDisponibles(vacante)    → cuántos cupos quedan libres AHORA en
//     toda la vacante.
//   - cuposLibresEnReclamo(reclamo)→ cuántos cupos quedan libres DENTRO de
//     un reclamo específico ya hecho (cantidad reservada menos tomados).
//   - expiroSeleccion(reclamo)     → true si ya pasó el plazo de 48h para
//     que los estudiantes elijan ese cupo.
//   - PLAZO_SELECCION_HORAS         → la constante numérica (48) usada
//     para calcular ese plazo.

import { normalizarHorario, type HorarioPasantia } from '../data/disponibilidad';
// normalizarHorario(horarioCrudo) → convierte el horario tal como está
// guardado en la vacante a una forma "limpia" y consistente
// (HorarioPasantia), por si hubiera variaciones en cómo distintas
// vacantes guardaron ese dato con el tiempo.

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
// El ciclo de vida de un reclamo:
//   pendiente → recién reclamado, esperando que la empresa confirme
//               (salvo que la vacante tenga auto-aceptación, ver más abajo).
//   aceptado  → la empresa confirmó (o se auto-aceptó); los estudiantes
//               ya pueden elegir sus cupos.
//   rechazado → la empresa lo rechazó; los cupos vuelven al mercado.
//   liberado  → la propia universidad devolvió cupos sobrantes que nadie
//               tomó (total o parcialmente).

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
  // Distinción importante: `cantidad` es el saldo VIGENTE (baja cuando se
  // liberan cupos sobrantes), mientras que `cantidadInicial` queda fija
  // para siempre como registro histórico de cuánto se pidió originalmente.
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
  /** true = a la empresa ya se le mostró el aviso de este reclamo al iniciar
   *  sesión (solo aplica al caso auto-aceptado, meramente informativo — los
   *  pendientes se muestran hasta que la empresa responda). Ver AvisosGate. */
  visto_empresa?: boolean;
}

export const COLECCION_ASIGNACIONES = 'asignaciones_cupo';

/** Cupo que un estudiante concreto tomó (del lote de su universidad, o por autoservicio). */
export interface AsignacionCupo {
  // Mientras `ReclamoCupos` representa el LOTE completo reservado por la
  // universidad, `AsignacionCupo` representa UN cupo individual ya tomado por
  // un estudiante. Normalmente pertenece a un reclamo ("1 reclamo → muchas
  // asignaciones"); en el autoservicio (`origen: 'autoservicio'`) NO hay
  // reclamo — el cupo se apartó directo en la vacante y `reclamoId` es null.
  id: string;
  reclamoId: string | null;
  /** 'autoservicio' = el estudiante se inscribió por su cuenta (sin reclamo). */
  origen?: 'autoservicio';
  estudianteId: string;
  estudianteNombre?: string;
  universidadId: string;
  empresaId: string;
  vacanteId: string;
  grupoId?: string | null;
  vacanteTitulo?: string;
  empresaNombre?: string;
  horario?: HorarioPasantia | null;
  carrera?: string;
  estado: 'tomado' | 'cancelado';
  fechaTomado?: any;
  /**
   * true = el estudiante ya cumplió la meta de horas y la pasantía se cerró
   * automáticamente (Fase E). Se deja `estado: 'tomado'` a propósito: así el
   * tablero, el libro de horas y la lista de candidatos siguen mostrándola
   * (al 100%), en vez de que desaparezca justo cuando más importa verla.
   */
  finalizada?: boolean;
  /** Cuándo se cerró al cumplir la meta de horas. */
  finalizadaAt?: any;
  /** Horas cumplidas al cerrarse (= meta del grupo). Se guarda para que el
   *  Historial del estudiante sea autocontenido, sin releer el grupo. */
  horasCumplidas?: number;
  /**
   * Día en que el estudiante se presenta por primera vez a la empresa — su
   * "Día 1". Lo fija (y puede editar) la empresa. ISO `yyyy-mm-dd`. Mientras
   * sea null/ausente, la pasantía está inscrita pero el conteo de horas aún no
   * arranca (ver Fase D). */
  fechaPresentacion?: string | null;
  /** Cuándo la empresa fijó/editó `fechaPresentacion` (serverTimestamp). */
  fechaPresentacionAt?: any;
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
    // Number.isFinite(cantidad) valida que sea un número REAL y finito
    // (rechaza NaN, Infinity, o cosas que no sean número en absoluto) —
    // más estricto y seguro que solo comprobar "cantidad > 0".
  }

  const vacanteRef = doc(db, 'vacantes', vacanteId);

  const resultado = await runTransaction(db, async tx => {
    // La transacción hace 2 trabajos: (1) validar que hay cupos
    // suficientes y (2) reservar esa cantidad de forma ATÓMICA, para que
    // dos universidades reclamando al mismo tiempo no puedan "sobre
    // vender" los mismos cupos.
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
    // UPDATE transaccional: aumenta el contador `cupos_reclamados` de la
    // vacante en la cantidad pedida — así, la PRÓXIMA vez que alguien
    // (dentro de otra transacción, o en una lectura normal) calcule
    // cuposDisponibles(), ya vería estos cupos como "no libres", sin
    // importar si el reclamo termina aceptado o no todavía.

    const estado: EstadoReclamo = vacante.reclamos_auto === true ? 'aceptado' : 'pendiente';
    // Decide el estado INICIAL del reclamo según una configuración que la
    // propia empresa eligió al publicar la vacante: si activó "aceptar
    // reclamos automáticamente" (`reclamos_auto: true`), el reclamo nace
    // ya 'aceptado' sin que la empresa tenga que confirmar manualmente;
    // si no, nace 'pendiente' y la empresa deberá aceptarlo o rechazarlo
    // a mano (ver responderReclamo() más abajo).

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
    // CREATE: recién aquí, con la reserva de cupos YA confirmada por la
    // transacción de arriba, se crea el documento del reclamo en sí. El
    // comentario explica una decisión de diseño deliberada: se prefiere
    // el riesgo (poco probable) de "cupos reservados sin un documento de
    // reclamo visible" (recuperable a mano) sobre el riesgo de "un
    // reclamo visible que en realidad no reservó nada" (generaría
    // confusión y promesas rotas a la universidad).
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
    // Date.now() da la fecha/hora actual en milisegundos (según el reloj
    // del CELULAR, no del servidor). Se le suma PLAZO_SELECCION_HORAS (48)
    // convertido a milisegundos (× 60 × 60 × 1000: horas → minutos →
    // segundos → milisegundos). El comentario explica por qué aquí SÍ se
    // acepta usar la hora del celular (a diferencia de otros campos que
    // usan serverTimestamp): como el plazo es de 48 horas completas, un
    // reloj mal configurado por unos minutos no cambia nada en la
    // práctica — sería distinto si el plazo fuera de pocos segundos.
    motivoRechazo: '',
    fechaReclamo: serverTimestamp(),
    fechaRespuesta: null,
  });

  // Registra la alianza en AMBOS perfiles desde el momento en que se pide el
  // cupo — no se espera a que la empresa confirme. Pedir un cupo ya es un
  // gesto de confianza hacia esa empresa, y esa alianza no se retira aunque
  // el reclamo termine rechazado o liberado más tarde (arrayUnion: nunca
  // duplica, y solo se agrega, nunca se quita). Mismos campos que usa
  // "Top Empresas/Universidades" (RedGradlyBanner) — best-effort: un fallo
  // aquí no debe impedir la reserva, que ya quedó confirmada arriba.
  if (resultado.empresaId) {
    try {
      await Promise.all([
        updateDoc(doc(db, 'perfiles_universidades', universidadId), {
          aliados_empresas_ids: arrayUnion(resultado.empresaId),
        }),
        updateDoc(doc(db, 'perfiles_empresas', resultado.empresaId), {
          aliados_universidades_ids: arrayUnion(universidadId),
        }),
      ]);
      // Ambas actualizaciones en paralelo (Promise.all), fuera de
      // cualquier transacción — son "mejor esfuerzo": si fallaran, no se
      // deshace nada de lo anterior (la reserva y el reclamo ya son
      // definitivos), solo quedaría sin registrar la alianza.
    } catch (e) {
      console.warn('No se pudo registrar la alianza del reclamo de cupos:', e);
    }
  }

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
      `reclamo:${ref.id}`,
      // Deep link "reclamo:ID" → abre ReclamoDetailModal al tocar la
      // notificación (ver notifRoute.ts).
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
    // Revalidación dentro de la transacción: evita que se procese dos
    // veces el mismo reclamo si, por ejemplo, la empresa tocara "Aceptar"
    // dos veces seguido por una doble pulsación accidental.

    if (decision === 'aceptar') {
      tx.update(reclamoRef, { estado: 'aceptado', fechaRespuesta: serverTimestamp() });
      // Nota: al ACEPTAR no hace falta tocar el contador de cupos de la
      // vacante — ya se habían reservado (incrementado) desde el momento
      // del reclamo original, sigan pendientes o ya aceptados.
    } else {
      // Devuelve los cupos reservados al mercado.
      tx.update(doc(db, 'vacantes', data.vacanteId), {
        cupos_reclamados: increment(-data.cantidad),
        // increment(-data.cantidad): un número NEGATIVO resta en vez de
        // sumar — así se "devuelven" los cupos que se habían reservado.
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
    `reclamo:${reclamoId}`,
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
      // "...(condicion ? {...} : {})" es un patrón para agregar una
      // propiedad CONDICIONALMENTE dentro de un objeto: si `restantes`
      // llegó a 0, se "esparce" (spread) un objeto con `estado:
      // 'liberado'` dentro de los cambios a aplicar; si no, se esparce un
      // objeto VACÍO (sin efecto). Así, el reclamo solo cambia a estado
      // 'liberado' cuando ya no queda NADA reservado — si la universidad
      // liberó solo una parte de sus cupos, el reclamo sigue 'aceptado'
      // (o el estado que tuviera), simplemente con menos `cantidad`.
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
    `reclamo:${reclamoId}`,
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
  // Esta comprobación se hace FUERA de la transacción (una lectura
  // "barata" y no crítica en cuanto a condiciones de carrera: aunque
  // técnicamente dos pestañas del mismo estudiante podrían burlar este
  // chequeo en un instante muy específico, no representa un riesgo real
  // de "sobreventa" de cupos entre distintos estudiantes, que es lo que
  // sí protege la transacción de abajo).

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
      // Este es el mensaje que vería el "perdedor" de una condición de
      // carrera: si 2 estudiantes tocan el último cupo casi al mismo
      // tiempo, Firestore garantiza que las 2 transacciones NO se
      // ejecuten realmente en simultáneo — una de las 2 se procesa
      // primero (incrementa `tomados`), y cuando la SEGUNDA transacción
      // se ejecuta (o se reintenta), esta relectura de `r` ya refleja el
      // cambio de la primera, y cuposLibresEnReclamo(r) da 0.
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
    // CREATE: el documento de la asignación individual del estudiante,
    // creado FUERA de la transacción (mismo razonamiento que con
    // reclamarCupos: la reserva del cupo ya es definitiva, y si esta
    // escritura fallara, sería recuperable a mano — mejor eso que dejar
    // la transacción esperando por una escritura no crítica para la
    // consistencia del contador de cupos).
    reclamoId,
    estudianteId,
    estudianteNombre: estudianteNombre ?? '',
    ...datos,
    // "...datos" esparce TODAS las propiedades devueltas por la
    // transacción (universidadId, empresaId, vacanteId, etc.) directo
    // dentro de este nuevo documento — evita tener que escribir cada
    // propiedad a mano de nuevo.
    estado: 'tomado' as const,
    fechaTomado: serverTimestamp(),
  });

  // Estado de pasantía autoreportado (perfil público) — escritura del propio
  // estudiante en su propio perfil, siempre permitida. Ver [[project_reparto_cupos]].
  try {
    await updateDoc(doc(db, 'perfiles_estudiantes', estudianteId), { estado_pasantia: 'en_proceso' });
  } catch {
    /* no crítico: no debe bloquear la toma del cupo, que ya se guardó arriba */
  }

  // Marca durable de la alianza empresa ↔ universidad (arrayUnion, dedupe).
  // `reclamarCupos` ya la escribe cuando la universidad reserva, pero se repite
  // aquí como refuerzo (idempotente). Best-effort.
  if (datos.universidadId && datos.empresaId) {
    try {
      await Promise.all([
        updateDoc(doc(db, 'perfiles_empresas', datos.empresaId), {
          aliados_universidades_ids: arrayUnion(datos.universidadId),
        }),
        updateDoc(doc(db, 'perfiles_universidades', datos.universidadId), {
          aliados_empresas_ids: arrayUnion(datos.empresaId),
        }),
      ]);
    } catch (e) {
      console.warn('No se pudo registrar la alianza al tomar el cupo:', e);
    }
  }

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

  const estudianteId = await runTransaction(db, async tx => {
    const snap = await tx.get(asigRef);
    if (!snap.exists()) throw new Error('Esta asignación ya no existe.');
    const a = snap.data() as AsignacionCupo;
    if (a.estado !== 'tomado') throw new Error('Este cupo ya fue liberado.');

    if (a.reclamoId) {
      // Cupo de un reclamo: vuelve a estar disponible DENTRO del mismo reclamo
      // (resta 1 a `tomados`). NO se toca `cupos_reclamados` de la vacante: ese
      // cupo sigue "reservado" para la universidad, solo que ahora otro alumno
      // de la misma universidad puede tomarlo.
      tx.update(doc(db, COLECCION_RECLAMOS, a.reclamoId), { tomados: increment(-1) });
    } else if (a.vacanteId) {
      // Autoservicio (sin reclamo): el cupo se había apartado directo en la
      // vacante, así que ahí se devuelve — vuelve al mercado general.
      tx.update(doc(db, 'vacantes', a.vacanteId), { cupos_reclamados: increment(-1) });
    }
    tx.update(asigRef, { estado: 'cancelado' as const });
    return a.estudianteId;
  });

  // Revierte el estado de pasantía autoreportado — escritura del propio
  // estudiante en su propio perfil, siempre permitida.
  if (estudianteId) {
    try {
      await updateDoc(doc(db, 'perfiles_estudiantes', estudianteId), { estado_pasantia: 'sin_iniciar' });
    } catch {
      /* no crítico: no debe bloquear la cancelación, que ya se guardó arriba */
    }
  }
}

/** Lee un reclamo puntual (para pantallas de detalle). */
export async function obtenerReclamo(reclamoId: string): Promise<ReclamoCupos | null> {
  // READ simple: la función más corta del archivo, usada por pantallas de
  // detalle que solo necesitan leer un reclamo puntual sin ninguna lógica
  // de negocio adicional.
  const snap = await getDoc(doc(db, COLECCION_RECLAMOS, reclamoId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as ReclamoCupos) : null;
}

/** Un reclamo que la empresa debería ver al iniciar sesión (ver AvisosGate). */
export interface AvisoReclamoEmpresa {
  reclamoId: string;
  /** 'accion' = pendiente, exige Aceptar/Rechazar. 'info' = ya se auto-aceptó. */
  modo: 'accion' | 'info';
}

/**
 * Reclamos de cupos que la empresa aún no ha "visto" al entrar a su panel:
 *   · `pendiente`  → necesita que confirme o rechace (se muestra hasta que lo
 *                    haga; ignora `visto_empresa`).
 *   · `aceptado` sin `fechaRespuesta` → se auto-aceptó (la vacante acepta
 *                    reservas al instante); aviso informativo una sola vez.
 *
 * Una sola lectura al entrar (no un listener), igual que `getModeracionesPendientes`.
 * La query filtra solo por `empresaId` (lo que permiten las reglas) y el estado
 * se filtra en memoria — sin índice compuesto.
 */
export async function getAvisosReclamosEmpresa(empresaUid: string): Promise<AvisoReclamoEmpresa[]> {
  if (!empresaUid) return [];
  const snap = await getDocs(
    query(collection(db, COLECCION_RECLAMOS), where('empresaId', '==', empresaUid)),
  );
  const avisos: AvisoReclamoEmpresa[] = [];
  snap.forEach(d => {
    const r = d.data() as ReclamoCupos;
    if (r.estado === 'pendiente') {
      avisos.push({ reclamoId: d.id, modo: 'accion' });
    } else if (r.estado === 'aceptado' && !r.fechaRespuesta && r.visto_empresa !== true) {
      avisos.push({ reclamoId: d.id, modo: 'info' });
    }
  });
  return avisos;
}

/** Marca que a la empresa ya se le mostró el aviso informativo de un reclamo. */
export async function marcarReclamoVistoEmpresa(reclamoId: string): Promise<void> {
  if (!reclamoId) return;
  await updateDoc(doc(db, COLECCION_RECLAMOS, reclamoId), { visto_empresa: true });
}

/**
 * Reclamos de cupos que el estudiante aún no ha "acusado" al entrar a la app:
 * los que su universidad reservó para su grupo (o sin grupo fijado), que
 * todavía puede tomar (`sePuedeTomar`) y cuyo id no está en
 * `perfiles_estudiantes/{uid}.reclamos_avisados`.
 *
 * Una sola lectura al montar (no un listener). La query filtra por
 * `universidadId` (lo que permiten las reglas vía `esEstudianteDe`) y el resto
 * se filtra en memoria — sin índice compuesto.
 */
export async function getAvisosCuposEstudiante(estudianteUid: string): Promise<ReclamoCupos[]> {
  if (!estudianteUid) return [];
  const perfilSnap = await getDoc(doc(db, 'perfiles_estudiantes', estudianteUid));
  if (!perfilSnap.exists()) return [];
  const p = perfilSnap.data() as any;
  const universidadId: string | undefined = p.universidad_id;
  const miGrupo: string | undefined = p.grupo_id;
  const avisados: string[] = Array.isArray(p.reclamos_avisados) ? p.reclamos_avisados : [];
  if (!universidadId) return [];

  const snap = await getDocs(
    query(collection(db, COLECCION_RECLAMOS), where('universidadId', '==', universidadId)),
  );
  const ahora = Date.now();
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as ReclamoCupos))
    .filter(r => !r.grupoId || r.grupoId === miGrupo)
    .filter(r => sePuedeTomar(r, ahora))
    .filter(r => !avisados.includes(r.id));
}

/** Guarda en el perfil del estudiante que ya se le avisó de estos reclamos. */
export async function marcarCuposAvisadosEstudiante(
  estudianteUid: string,
  reclamoIds: string[],
): Promise<void> {
  if (!estudianteUid || reclamoIds.length === 0) return;
  await updateDoc(doc(db, 'perfiles_estudiantes', estudianteUid), {
    reclamos_avisados: arrayUnion(...reclamoIds),
  });
}

/**
 * Inscripción del propio estudiante que se cerró por horas y de la que aún no
 * se le ha mostrado el modal "¡Culminaste!" (Fase E). El "visto" va en su perfil
 * (`inscripciones_fin_avisadas`), como el resto de flags de B.2.
 */
export async function getAvisoFinalizacionEstudiante(estudianteUid: string): Promise<AsignacionCupo | null> {
  if (!estudianteUid) return null;
  const perfilSnap = await getDoc(doc(db, 'perfiles_estudiantes', estudianteUid));
  const avisadas: string[] = perfilSnap.exists() && Array.isArray((perfilSnap.data() as any).inscripciones_fin_avisadas)
    ? (perfilSnap.data() as any).inscripciones_fin_avisadas
    : [];
  const snap = await getDocs(
    query(collection(db, COLECCION_ASIGNACIONES), where('estudianteId', '==', estudianteUid), where('estado', '==', 'tomado')),
  );
  const a = snap.docs
    .map(d => ({ id: d.id, ...d.data() } as AsignacionCupo))
    .find(x => x.finalizada === true && !avisadas.includes(x.id));
  return a ?? null;
}

/** Marca que al estudiante ya se le mostró el modal de "culminaste" de estas asignaciones. */
export async function marcarFinalizacionAvisadaEstudiante(
  estudianteUid: string,
  asignacionIds: string[],
): Promise<void> {
  if (!estudianteUid || asignacionIds.length === 0) return;
  await updateDoc(doc(db, 'perfiles_estudiantes', estudianteUid), {
    inscripciones_fin_avisadas: arrayUnion(...asignacionIds),
  });
}

// ─────────────────────────────────────────────
// Avisos de INSCRIPCIÓN (un estudiante tomó un cupo) → universidad y empresa
// ─────────────────────────────────────────────
// El "ya visto" se guarda en el perfil de quien mira (`perfiles_universidades`
// / `perfiles_empresas`, campo `asignaciones_avisadas: string[]`), igual que el
// estudiante en B.2 — así NO hace falta tocar las reglas de `asignaciones_cupo`
// (cuyo `update` no admite a la empresa). El dueño de su propio perfil lo puede
// actualizar sin restricción de campos.

/**
 * Inscripciones (`asignaciones_cupo` en estado `tomado`) que este rol aún no ha
 * acusado al entrar. `campo` = 'universidadId' | 'empresaId' según quién mira;
 * `perfilCol` = la colección de su perfil.
 *
 * La query filtra solo por ese campo (lo que permiten las reglas) y el estado
 * se filtra en memoria — sin índice compuesto.
 */
async function getAvisosInscripciones(
  uid: string,
  campo: 'universidadId' | 'empresaId',
  perfilCol: 'perfiles_universidades' | 'perfiles_empresas',
  evento: 'inscrito' | 'finalizado' = 'inscrito',
): Promise<AsignacionCupo[]> {
  if (!uid) return [];
  const campoAvisadas = evento === 'finalizado' ? 'asignaciones_fin_avisadas' : 'asignaciones_avisadas';
  const perfilSnap = await getDoc(doc(db, perfilCol, uid));
  const avisadas: string[] = perfilSnap.exists() && Array.isArray((perfilSnap.data() as any)[campoAvisadas])
    ? (perfilSnap.data() as any)[campoAvisadas]
    : [];
  const snap = await getDocs(
    query(collection(db, COLECCION_ASIGNACIONES), where(campo, '==', uid)),
  );
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as AsignacionCupo))
    .filter(a => a.estado === 'tomado')
    .filter(a => (evento === 'finalizado' ? a.finalizada === true : a.finalizada !== true))
    .filter(a => !avisadas.includes(a.id));
}

export const getAvisosInscripcionesUniversidad = (uid: string) =>
  getAvisosInscripciones(uid, 'universidadId', 'perfiles_universidades');
export const getAvisosInscripcionesEmpresa = (uid: string) =>
  getAvisosInscripciones(uid, 'empresaId', 'perfiles_empresas');
export const getAvisosFinalizacionUniversidad = (uid: string) =>
  getAvisosInscripciones(uid, 'universidadId', 'perfiles_universidades', 'finalizado');
export const getAvisosFinalizacionEmpresa = (uid: string) =>
  getAvisosInscripciones(uid, 'empresaId', 'perfiles_empresas', 'finalizado');

/** Marca inscripciones como avisadas en el perfil de la universidad o la empresa. */
export async function marcarInscripcionesAvisadas(
  uid: string,
  perfilCol: 'perfiles_universidades' | 'perfiles_empresas',
  asignacionIds: string[],
  evento: 'inscrito' | 'finalizado' = 'inscrito',
): Promise<void> {
  if (!uid || asignacionIds.length === 0) return;
  const campo = evento === 'finalizado' ? 'asignaciones_fin_avisadas' : 'asignaciones_avisadas';
  await updateDoc(doc(db, perfilCol, uid), { [campo]: arrayUnion(...asignacionIds) });
}

/**
 * Cierre automático de una inscripción de cupo al cumplir la meta de horas
 * (Fase E). Lo dispara el cliente del estudiante (su hook `useProgresoInscripcion`
 * detecta `completado`). Marca `finalizada: true` (deja `estado: 'tomado'`) y
 * avisa a los 3: universidad, empresa y el propio estudiante — vía notificación
 * + los modales de `AvisosGate` al iniciar sesión.
 *
 * Idempotente: relee dentro de la transacción y no hace nada si ya estaba
 * finalizada o cancelada.
 */
export async function finalizarInscripcionPorHoras(
  asignacionId: string,
  datos: { estudianteNombre?: string; universidadId?: string; empresaId?: string; vacanteTitulo?: string; empresaNombre?: string; estudianteId?: string; horasCumplidas?: number },
): Promise<boolean> {
  if (!asignacionId) return false;
  const ref = doc(db, COLECCION_ASIGNACIONES, asignacionId);
  const meta = Number(datos.horasCumplidas);
  const hecho = await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return false;
    const a = snap.data() as AsignacionCupo;
    if (a.estado !== 'tomado' || a.finalizada === true) return false;
    tx.update(ref, {
      finalizada: true,
      finalizadaAt: serverTimestamp(),
      ...(Number.isFinite(meta) && meta > 0 ? { horasCumplidas: Math.round(meta) } : {}),
    });
    return true;
  });
  if (!hecho) return false;

  const quien = datos.estudianteNombre || 'Un estudiante';
  const cual = datos.vacanteTitulo || 'su pasantía';
  if (datos.estudianteId) {
    try {
      await updateDoc(doc(db, 'perfiles_estudiantes', datos.estudianteId), { estado_pasantia: 'finalizada' });
    } catch { /* no crítico */ }
    await enviarNotificacion(datos.estudianteId, '¡Culminaste tu pasantía!', `Cumpliste todas tus horas de "${cual}".`, 'success', '/(tabs)/progreso');
  }
  if (datos.universidadId) {
    await enviarNotificacion(datos.universidadId, 'Estudiante culminó su pasantía', `${quien} cumplió sus horas de "${cual}"${datos.empresaNombre ? ` (${datos.empresaNombre})` : ''}.`, 'success', '/dashboard-universidad');
  }
  if (datos.empresaId) {
    await enviarNotificacion(datos.empresaId, 'Estudiante culminó su pasantía', `${quien} cumplió sus horas de "${cual}".`, 'success', '/dashboard-empresa');
  }
  return true;
}

// ─────────────────────────────────────────────
// Fecha de presentación ("Día 1") — la fija la empresa por estudiante
// ─────────────────────────────────────────────

const RE_FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * La empresa fija (o edita, o borra pasando null) el día en que el estudiante
 * debe presentarse por primera vez. Ese día es el "Día 1" desde el que la
 * Fase D contará las horas.
 *
 * `fechaISO` debe ser `yyyy-mm-dd` (o null para quitarla). Las reglas dejan a
 * la empresa dueña tocar SOLO `fechaPresentacion`/`fechaPresentacionAt` de la
 * asignación (`hasOnly`), nada más.
 */
export async function fijarFechaPresentacion(
  asignacionId: string,
  fechaISO: string | null,
): Promise<void> {
  if (!asignacionId) throw new Error('Asignación inválida.');
  if (fechaISO !== null && !RE_FECHA_ISO.test(fechaISO)) {
    throw new Error('Formato de fecha inválido (se espera aaaa-mm-dd).');
  }
  await updateDoc(doc(db, COLECCION_ASIGNACIONES, asignacionId), {
    fechaPresentacion: fechaISO,
    fechaPresentacionAt: serverTimestamp(),
  });
}
