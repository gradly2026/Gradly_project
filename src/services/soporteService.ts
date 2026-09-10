// ════════════════════════════════════════════════════════════════════════
// soporteService.ts — mensajes de AYUDA / SOPORTE que un usuario le abre al
// equipo de Gradly (admin) desde "Mi perfil → Ayuda".
//
// No confundir con:
//   · `reportes`     → denuncia la CONDUCTA de una persona (solo admin).
//   · `incidencias`  → problema OCURRIDO DURANTE una práctica (lo ven empresa
//                      y universidad, no es soporte técnico).
//   · `tickets_soporte` (esto) → "no puedo entrar", "me salió un error", "no
//                      me llegó el correo"… una conversación privada 1-a-1
//                      entre el usuario y el admin.
//
// CICLO DE VIDA:
//   abierto  → (usuario y admin se responden en el hilo `mensajes`) → resuelto
// Solo el admin marca `resuelto`; a partir de ahí el hilo queda cerrado.
//
// El hilo es un ARRAY (`mensajes`) en el propio doc, igual que
// `incidencias.seguimiento`: Firestore no admite serverTimestamp() dentro de
// un elemento de array, así que cada mensaje lleva la hora del dispositivo
// (`fecha`, en ms) y el orden fino se apoya en ella; los campos de nivel
// superior (`creadoAt`, `actualizadoAt`) sí llevan hora de servidor.
// ════════════════════════════════════════════════════════════════════════

import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { auth, db, storage } from '../config/firebaseConfig';
import { enviarNotificacion } from './notificationService';

export const COLECCION_TICKETS = 'tickets_soporte';

/** Rol del usuario que abre el ticket (el admin nunca abre uno). */
export type RolSoporte = 'estudiante' | 'empresa' | 'universidad';

/** Categoría del problema. Texto libre también sirve; la lista solo orienta. */
export type CategoriaSoporte =
  | 'cuenta'
  | 'pasantia'
  | 'pagos'
  | 'tecnico'
  | 'sugerencia'
  | 'otro';

/** Catálogo para pintar los chips del modal. `clave` es lo que se guarda. */
export const CATEGORIAS_SOPORTE: {
  clave: CategoriaSoporte;
  label: string;
  icon: string;
}[] = [
  { clave: 'cuenta', label: 'Mi cuenta o acceso', icon: 'person-circle-outline' },
  { clave: 'pasantia', label: 'Una pasantía o postulación', icon: 'briefcase-outline' },
  { clave: 'pagos', label: 'Pagos o suscripción', icon: 'card-outline' },
  { clave: 'tecnico', label: 'Un error o fallo técnico', icon: 'bug-outline' },
  { clave: 'sugerencia', label: 'Una sugerencia', icon: 'bulb-outline' },
  { clave: 'otro', label: 'Otro', icon: 'ellipsis-horizontal-circle-outline' },
];

export function labelCategoriaSoporte(c?: string): string {
  return CATEGORIAS_SOPORTE.find((x) => x.clave === c)?.label ?? 'Otro';
}

export function labelRolSoporte(r?: string): string {
  return r === 'estudiante'
    ? 'Estudiante'
    : r === 'empresa'
      ? 'Empresa'
      : r === 'universidad'
        ? 'Universidad'
        : '—';
}

/** Una entrada del hilo. */
export interface MensajeSoporte {
  /** id local del mensaje (para React keys) — `${fecha}-${aleatorio}`. */
  id: string;
  autor: 'usuario' | 'admin';
  autor_id: string;
  autor_nombre: string;
  texto: string;
  /** URLs de descarga de las imágenes adjuntas (0..n). */
  imagenes: string[];
  /** Hora del dispositivo en ms (ver nota de cabecera). */
  fecha: number;
}

export type EstadoTicket = 'abierto' | 'resuelto';

export interface TicketSoporte {
  id: string;
  usuarioId: string;
  usuarioNombre: string;
  usuarioEmail: string;
  usuarioRol: RolSoporte;
  categoria: CategoriaSoporte;
  estado: EstadoTicket;
  mensajes: MensajeSoporte[];
  /** Quién habló de último — para el filtro "Sin resolver" del panel admin. */
  ultimoAutor: 'usuario' | 'admin';
  /** El usuario escribió y el admin todavía no lo vio. */
  noLeidoAdmin: boolean;
  /** El admin respondió y el usuario todavía no lo vio → dispara el gate al iniciar sesión. */
  noLeidoUsuario: boolean;
  creadoAt?: any;
  actualizadoAt?: any;
  resueltoAt?: any;
}

function nuevoIdMensaje(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Sube una imagen local a `soporte/{ticketId}/...` y devuelve su URL. La regla
 * de Storage deja escribir a cualquier autenticado (el path va namespaced por
 * el id del ticket, que no es adivinable), acota tamaño y exige `image/*`.
 */
export async function subirImagenSoporte(ticketId: string, fileUri: string): Promise<string> {
  const resp = await fetch(fileUri);
  const blob = await resp.blob();
  const r = storageRef(
    storage,
    `soporte/${ticketId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`,
  );
  await uploadBytes(r, blob, { contentType: (blob as any).type || 'image/jpeg' });
  return getDownloadURL(r);
}

export interface CrearTicketParams {
  categoria: CategoriaSoporte;
  texto: string;
  /** URIs LOCALES de las imágenes elegidas; se suben aquí dentro. */
  imagenesUri?: string[];
  usuarioNombre: string;
  usuarioEmail: string;
  rol: RolSoporte;
}

/**
 * Abre un ticket nuevo. Se genera primero el id del doc (sin escribir) para
 * poder subir las imágenes a `soporte/{id}/...` y guardar ya sus URLs dentro
 * del primer mensaje, en una sola escritura.
 */
export async function crearTicket(p: CrearTicketParams): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sesión no válida.');
  if (p.texto.trim().length < 10) {
    throw new Error('Cuéntanos un poco más: al menos 10 caracteres.');
  }

  const ref = doc(collection(db, COLECCION_TICKETS));
  let imagenes: string[] = [];
  if (p.imagenesUri && p.imagenesUri.length) {
    imagenes = await Promise.all(p.imagenesUri.map((uri) => subirImagenSoporte(ref.id, uri)));
  }

  const primer: MensajeSoporte = {
    id: nuevoIdMensaje(),
    autor: 'usuario',
    autor_id: uid,
    autor_nombre: p.usuarioNombre || 'Usuario',
    texto: p.texto.trim(),
    imagenes,
    fecha: Date.now(),
  };

  await setDoc(ref, {
    usuarioId: uid,
    usuarioNombre: p.usuarioNombre || 'Usuario',
    usuarioEmail: p.usuarioEmail || auth.currentUser?.email || '',
    usuarioRol: p.rol,
    categoria: p.categoria,
    estado: 'abierto' as EstadoTicket,
    mensajes: [primer],
    ultimoAutor: 'usuario' as const,
    noLeidoAdmin: true,
    noLeidoUsuario: false,
    creadoAt: serverTimestamp(),
    actualizadoAt: serverTimestamp(),
  });

  // Rastro best-effort para el Inbox del panel admin (mismo canal que usan
  // incidencias/reportes). Si las reglas no dejan a un no-admin escribir ahí,
  // el ticket ya quedó registrado y visible en la sección de Soporte.
  try {
    await addDoc(collection(db, 'admin_notifications'), {
      title: `Nuevo mensaje de soporte: ${labelCategoriaSoporte(p.categoria)}`,
      is_read: false,
      tipo: 'soporte',
      ticket_id: ref.id,
      usuario_id: uid,
      usuario_nombre: p.usuarioNombre || 'Usuario',
      created_at: serverTimestamp(),
    });
  } catch {
    /* no-op */
  }

  return ref.id;
}

export interface ResponderTicketParams {
  ticketId: string;
  texto: string;
  imagenesUri?: string[];
  /** true = lo responde el admin; false/omitido = lo responde el dueño. */
  comoAdmin?: boolean;
  autorNombre: string;
  /** Solo para `comoAdmin`: uid del dueño, para avisarle. */
  notificarA?: string | null;
}

/** Agrega un mensaje al hilo. Lo pueden hacer el dueño o el admin. */
export async function responderTicket(p: ResponderTicketParams): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sesión no válida.');
  const texto = p.texto.trim();
  if (!texto && !(p.imagenesUri && p.imagenesUri.length)) {
    throw new Error('Escribe un mensaje o adjunta una imagen.');
  }

  let imagenes: string[] = [];
  if (p.imagenesUri && p.imagenesUri.length) {
    imagenes = await Promise.all(p.imagenesUri.map((uri) => subirImagenSoporte(p.ticketId, uri)));
  }

  const msg: MensajeSoporte = {
    id: nuevoIdMensaje(),
    autor: p.comoAdmin ? 'admin' : 'usuario',
    autor_id: uid,
    autor_nombre: p.autorNombre || (p.comoAdmin ? 'Soporte Gradly' : 'Usuario'),
    texto,
    imagenes,
    fecha: Date.now(),
  };

  await updateDoc(doc(db, COLECCION_TICKETS, p.ticketId), {
    mensajes: arrayUnion(msg),
    ultimoAutor: p.comoAdmin ? 'admin' : 'usuario',
    noLeidoAdmin: p.comoAdmin ? false : true,
    noLeidoUsuario: p.comoAdmin ? true : false,
    actualizadoAt: serverTimestamp(),
  });

  if (p.comoAdmin && p.notificarA) {
    try {
      await enviarNotificacion(
        p.notificarA,
        'Respuesta de soporte',
        'El equipo de Gradly respondió a tu mensaje. Toca para verlo.',
        'info',
        `ticketSoporte:${p.ticketId}`,
      );
    } catch {
      /* no-op */
    }
  }
}

/**
 * El admin marca el ticket como resuelto (queda cerrado, no se responde más).
 * Avisa al usuario con deep link para que pueda leer el cierre.
 */
export async function marcarTicketResuelto(
  ticketId: string,
  notificarA?: string | null,
): Promise<void> {
  await updateDoc(doc(db, COLECCION_TICKETS, ticketId), {
    estado: 'resuelto' as EstadoTicket,
    noLeidoUsuario: true,
    resueltoAt: serverTimestamp(),
    actualizadoAt: serverTimestamp(),
  });
  if (notificarA) {
    try {
      await enviarNotificacion(
        notificarA,
        'Tu solicitud de soporte se resolvió',
        'El equipo de Gradly marcó tu mensaje como resuelto. Toca para ver la conversación.',
        'success',
        `ticketSoporte:${ticketId}`,
      );
    } catch {
      /* no-op */
    }
  }
}

/**
 * Baja la bandera de "no leído" del lado indicado. El dueño solo puede bajar la
 * suya (`noLeidoUsuario`); el admin, la del admin. El `hasOnly` implícito lo da
 * la regla de Firestore, que ya limita quién edita qué.
 */
export async function marcarTicketLeido(
  ticketId: string,
  quien: 'usuario' | 'admin',
): Promise<void> {
  try {
    await updateDoc(doc(db, COLECCION_TICKETS, ticketId), {
      [quien === 'usuario' ? 'noLeidoUsuario' : 'noLeidoAdmin']: false,
    });
  } catch {
    /* no-op: es un detalle de UI, no debe romper nada */
  }
}

/** Suscripción EN VIVO a un ticket concreto (para el hilo abierto en pantalla). */
export function suscribirTicket(
  ticketId: string,
  onChange: (t: TicketSoporte | null) => void,
  onError?: () => void,
) {
  if (!ticketId) {
    onChange(null);
    return () => {};
  }
  return onSnapshot(
    doc(db, COLECCION_TICKETS, ticketId),
    (snap) => onChange(snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as TicketSoporte) : null),
    (e) => {
      console.warn('Error en listener (ticket soporte):', e);
      onError?.();
    },
  );
}

/**
 * Suscripción EN VIVO a los tickets de un usuario. Consulta por un solo campo
 * (`usuarioId`), sin índice compuesto; el orden se hace en cliente.
 */
export function suscribirMisTickets(
  uid: string,
  onChange: (lista: TicketSoporte[]) => void,
  onError?: () => void,
) {
  if (!uid) {
    onChange([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(db, COLECCION_TICKETS), where('usuarioId', '==', uid)),
    (snap) => {
      const lista = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) } as TicketSoporte))
        .sort(
          (a, b) =>
            (b.actualizadoAt?.toMillis?.() ?? 0) - (a.actualizadoAt?.toMillis?.() ?? 0),
        );
      onChange(lista);
    },
    (e) => {
      console.warn('Error en listener (mis tickets):', e);
      onError?.();
    },
  );
}

/**
 * Lectura de una sola vez de los tickets del usuario que tienen una respuesta
 * del admin sin ver (`noLeidoUsuario`). Lo usa el gate al iniciar sesión. Filtra
 * `noLeidoUsuario` en cliente para no necesitar índice compuesto.
 */
export async function getMisTicketsConRespuesta(uid: string): Promise<TicketSoporte[]> {
  if (!uid) return [];
  try {
    const snap = await getDocs(
      query(collection(db, COLECCION_TICKETS), where('usuarioId', '==', uid)),
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) } as TicketSoporte))
      .filter((t) => t.noLeidoUsuario === true)
      .sort((a, b) => (a.actualizadoAt?.toMillis?.() ?? 0) - (b.actualizadoAt?.toMillis?.() ?? 0));
  } catch (e) {
    console.warn('getMisTicketsConRespuesta:', e);
    return [];
  }
}
