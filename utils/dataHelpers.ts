/**
 * dataHelpers.ts
 * Utilidades reutilizables para operaciones comunes sobre Firestore.
 */

import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../src/config/firebaseConfig";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type RolTipo = "empresa" | "talento" | "alumno" | "universidad";

// Colecciones de perfil por rol en Firestore.
const COLLECTION_MAP: Record<RolTipo, string> = {
  empresa: "perfiles_empresas",
  talento: "perfiles_estudiantes",
  alumno: "perfiles_estudiantes",
  universidad: "perfiles_universidades",
};

// ── Notificaciones ────────────────────────────────────────────────────────────

/** Inserta una notificación en la colección notificaciones. */
export async function insertNotificacion(params: {
  userId: string;
  tipo: string;
  titulo: string;
  mensaje: string;
}) {
  return addDoc(collection(db, "notificaciones"), {
    usuario_id: params.userId,
    tipo: params.tipo,
    titulo: params.titulo,
    mensaje: params.mensaje,
    leida: false,
    fecha: serverTimestamp(),
  });
}

// ── Usuarios / Perfiles ───────────────────────────────────────────────────────

/** Obtiene el documento de perfil del usuario según su rol. */
export async function getRolData(userId: string, rol: RolTipo) {
  try {
    const snap = await getDoc(doc(db, COLLECTION_MAP[rol], userId));
    return { data: snap.exists() ? snap.data() : null, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

/** Verifica si un usuario está baneado. Devuelve { baneado, motivo, hasta }. */
export async function checkBaneo(userId: string, rol: RolTipo) {
  const snap = await getDoc(doc(db, COLLECTION_MAP[rol], userId));
  const data: any = snap.exists() ? snap.data() : null;

  if (!data || !data.baneado) return { baneado: false, motivo: null, hasta: null };

  const hasta = data.baneo_hasta;
  const hastaDate =
    hasta instanceof Timestamp ? hasta.toDate() : hasta ? new Date(hasta) : null;

  return {
    baneado: true,
    motivo: data.motivo_baneo ?? "No especificado",
    hasta: hastaDate ? hastaDate.toLocaleDateString("es-SV") : "indefinidamente",
  };
}

/** Banea a un usuario actualizando su perfil de rol y su documento de usuario. */
export async function banearUsuario(
  userId: string,
  rol: RolTipo,
  _profileId: string,
  motivo: string,
  hasta?: string,
) {
  await Promise.all([
    updateDoc(doc(db, COLLECTION_MAP[rol], userId), {
      baneado: true,
      motivo_baneo: motivo,
      baneo_hasta: hasta ?? null,
    }),
    updateDoc(doc(db, "usuarios", userId), { activo: false, status: "inactive" }),
  ]);
}

/** Desbanea a un usuario. */
export async function desbanearUsuario(
  userId: string,
  rol: RolTipo,
  _profileId: string,
) {
  await Promise.all([
    updateDoc(doc(db, COLLECTION_MAP[rol], userId), {
      baneado: false,
      motivo_baneo: null,
      baneo_hasta: null,
    }),
    updateDoc(doc(db, "usuarios", userId), { activo: true, status: "active" }),
  ]);
}

// ── Aplicaciones ──────────────────────────────────────────────────────────────

/** Actualiza el estado de una aplicación. */
export async function actualizarEstadoAplicacion(
  aplicacionId: string,
  estado: "pendiente" | "en_revision" | "entrevista" | "contratada" | "rechazada",
) {
  return updateDoc(doc(db, "aplicaciones", aplicacionId), { estado });
}

// ── Horas Sociales ────────────────────────────────────────────────────────────

/** Actualiza el estado de una solicitud de horas. */
export async function actualizarEstadoSolicitudHoras(
  solicitudId: string,
  estado: "pendiente" | "en_revision" | "aprobada" | "rechazada" | "cerrada",
) {
  return updateDoc(doc(db, "solicitudes_horas", solicitudId), { estado });
}

// ── Vacantes ──────────────────────────────────────────────────────────────────

/**
 * Obtiene el número de vacantes activas de una empresa y el límite de su plan.
 * Retorna { activas, limite, plan }.
 */
export async function getPlanInfo(
  empresaId: string,
): Promise<{ activas: number; limite: number; plan: string }> {
  const [activasSnap, subSnap] = await Promise.all([
    getCountFromServer(
      query(
        collection(db, "vacantes"),
        where("empresa_id", "==", empresaId),
        where("activa", "==", true),
      ),
    ),
    getDocs(
      query(
        collection(db, "suscripciones_empresas"),
        where("empresa_id", "==", empresaId),
        limit(1),
      ),
    ),
  ]);

  const sub: any = subSnap.empty ? null : subSnap.docs[0].data();

  return {
    activas: activasSnap.data().count ?? 0,
    limite: sub?.max_vacantes ?? 3,
    plan: sub?.plan ?? "basico",
  };
}

// ── Formato ───────────────────────────────────────────────────────────────────

/** Formatea una fecha (ISO o Timestamp) a string local de El Salvador. */
export function fmtFecha(value: string | Timestamp | Date): string {
  const date =
    value instanceof Timestamp
      ? value.toDate()
      : value instanceof Date
        ? value
        : new Date(value);
  return date.toLocaleDateString("es-SV", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Trunca un texto a N caracteres con "…" si es más largo. */
export function truncate(text: string, maxLen = 80): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}
