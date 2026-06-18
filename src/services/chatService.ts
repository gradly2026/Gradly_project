import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../config/firebaseConfig";

/** Tipo de sala: 1:1 universidad↔empresa o grupo oficial administrado. */
export type ChatType = "direct" | "group";

/** Ítem de la bandeja de entrada (un chat). */
export interface ChatListItem {
  id: string;
  users: string[];
  empresaId: string;
  universidadId: string;
  grupoId: string;
  empresaNombre: string;
  universidadNombre: string;
  grupoNombre: string;
  lastMessage: string;
  lastSenderId: string;
  updatedAt: Date | null;
  /** No leídos del usuario actual. */
  unread: number;
  /** `'group'` para grupos oficiales; ausente/`'direct'` para 1:1. */
  type: ChatType;
  /** Nombre del grupo (solo `type: 'group'`). */
  name: string;
  /** Estudiante del chat directo empresa↔estudiante (recontratación). */
  estudianteId: string;
  estudianteNombre: string;
}

/**
 * Título del chat = nombre del *otro* participante según el rol del usuario
 * actual. Centralizado aquí para que el inbox y el orquestador master-detail
 * deriven el mismo nombre (p. ej. para pasarlo como `peerName`).
 */
export function chatTitle(chat: ChatListItem, uid?: string): string {
  if (chat.type === "group") return chat.name || chat.grupoNombre || "Grupo";
  // Directo empresa↔estudiante (recontratación): cada uno ve al otro.
  if (chat.estudianteId) {
    if (uid && uid === chat.empresaId) return chat.estudianteNombre || "Estudiante";
    return chat.empresaNombre || "Empresa";
  }
  if (uid && uid === chat.empresaId) return chat.universidadNombre;
  if (uid && uid === chat.universidadId) return chat.empresaNombre;
  // Estudiante u otro participante: muestra la empresa.
  return chat.empresaNombre;
}

/**
 * Crea (o actualiza, `merge`) el chat grupal oficial de un grupo de la
 * universidad. ID determinístico `grupo_{grupoId}` → idempotente.
 *
 * - `admins: [universidadId]` (la universidad modera).
 * - `users`: incluye al admin + los estudiantes reales del grupo (sus uids de
 *   Auth, leídos de `perfiles_estudiantes`), para que el chat aparezca en el
 *   inbox de todos y las reglas permitan leer/escribir.
 * - `settings.adminsOnly` arranca en `false`.
 */
export async function crearChatGrupoOficial(params: {
  universidadId: string;
  grupoId: string;
  grupoNombre: string;
  universidadNombre?: string;
  empresaId?: string | null;
}): Promise<string> {
  const { universidadId, grupoId, grupoNombre, empresaId } = params;

  // Estudiantes reales del grupo (uids de Auth).
  const estSnap = await getDocs(
    query(
      collection(db, "perfiles_estudiantes"),
      where("grupo_id", "==", grupoId),
    ),
  );
  const estudiantes = estSnap.docs.map((d) => d.id);

  // Nombre de la universidad (denormalizado) si no se pasó.
  let universidadNombre = params.universidadNombre;
  if (!universidadNombre) {
    const uniSnap = await getDoc(
      doc(db, "perfiles_universidades", universidadId),
    );
    universidadNombre =
      (uniSnap.data() as any)?.nombre_universidad ?? "Universidad";
  }

  const chatId = `grupo_${grupoId}`;
  const users = Array.from(new Set([universidadId, ...estudiantes]));
  const chatRef = doc(db, "chats", chatId);
  const existente = await getDoc(chatRef);

  // Campos refrescables en cada recreación (membresía y nombre).
  const base: Record<string, unknown> = {
    type: "group",
    name: grupoNombre,
    admins: [universidadId],
    users,
    estudiantes,
    universidadId,
    universidadNombre,
    grupoId,
    grupoNombre,
    ...(empresaId ? { empresaId } : {}),
    updatedAt: serverTimestamp(),
  };

  if (!existente.exists()) {
    // Primera creación: inicializa ajustes y metadatos del inbox.
    base.settings = { adminsOnly: false };
    base.lastMessage = "";
    base.lastSenderId = "";
    base.unread = {};
    base.createdAt = serverTimestamp();
  }

  // `merge` para no pisar `settings.adminsOnly` ni mensajes ya existentes.
  await setDoc(chatRef, base, { merge: true });

  return chatId;
}

/** Contexto de un chat directo empresa↔estudiante (afecta sólo el handshake de horario). */
export type ContextoChatDirecto = "recontratacion" | "candidatura";

/**
 * Crea o **reactiva** el chat directo (`type: 'direct'`) empresa↔estudiante.
 * ID determinístico `direct_{empresaId}_{estudianteId}` → idempotente: si ya
 * existía (p. ej. el grupal se archivó, o la empresa ya contactó al candidato)
 * se reutiliza y se marca `archivado: false`. Devuelve el id del chat.
 *
 * `contexto`:
 * - `'recontratacion'` → re-contacto a un ex-pasante desde el historial.
 * - `'candidatura'` → contacto directo a un candidato del Kanban de postulaciones.
 * En ambos casos `ChatThread` oculta el handshake de horario (sólo aplica al
 * flujo universidad↔empresa).
 */
export async function abrirChatDirectoEmpresaEstudiante(params: {
  empresaId: string;
  empresaNombre: string;
  estudianteId: string;
  estudianteNombre: string;
  contexto?: ContextoChatDirecto;
}): Promise<string> {
  const {
    empresaId,
    empresaNombre,
    estudianteId,
    estudianteNombre,
    contexto = "recontratacion",
  } = params;

  const chatId = `direct_${empresaId}_${estudianteId}`;
  const chatRef = doc(db, "chats", chatId);
  const existente = await getDoc(chatRef);

  const base: Record<string, unknown> = {
    type: "direct",
    contexto,
    users: [empresaId, estudianteId],
    empresaId,
    empresaNombre,
    estudianteId,
    estudianteNombre,
    archivado: false,
    updatedAt: serverTimestamp(),
  };

  if (!existente.exists()) {
    base.lastMessage = "";
    base.lastSenderId = "";
    base.unread = {};
    base.createdAt = serverTimestamp();
  }

  await setDoc(chatRef, base, { merge: true });
  return chatId;
}

/**
 * Compat: re-contacto desde el historial de pasantes. Delega en
 * {@link abrirChatDirectoEmpresaEstudiante} con `contexto: 'recontratacion'`.
 */
export async function abrirChatDirectoRecontratacion(params: {
  empresaId: string;
  empresaNombre: string;
  estudianteId: string;
  estudianteNombre: string;
}): Promise<string> {
  return abrirChatDirectoEmpresaEstudiante({ ...params, contexto: "recontratacion" });
}

/**
 * Suscripción en tiempo real a los chats donde participa `uid`.
 * Ordena por `updatedAt` desc (los más recientes primero).
 */
export function subscribeUserChats(
  uid: string,
  onData: (chats: ChatListItem[]) => void,
  onError?: (e: unknown) => void,
): Unsubscribe {
  const q = query(
    collection(db, "chats"),
    where("users", "array-contains", uid),
    orderBy("updatedAt", "desc"),
  );

  return onSnapshot(
    q,
    (snap) => {
      const items: ChatListItem[] = snap.docs.map((d) => {
        const data = d.data() as any;
        const unreadMap = (data.unread ?? {}) as Record<string, number>;
        return {
          id: d.id,
          users: Array.isArray(data.users) ? data.users : [],
          empresaId: data.empresaId ?? "",
          universidadId: data.universidadId ?? "",
          grupoId: data.grupoId ?? "",
          empresaNombre: data.empresaNombre ?? "Empresa",
          universidadNombre: data.universidadNombre ?? "Universidad",
          grupoNombre: data.grupoNombre ?? "Grupo",
          lastMessage: data.lastMessage ?? "",
          lastSenderId: data.lastSenderId ?? "",
          updatedAt: data.updatedAt?.toDate?.() ?? null,
          unread: unreadMap[uid] ?? 0,
          type: data.type === "group" ? "group" : "direct",
          name: data.name ?? "",
          estudianteId: data.estudianteId ?? "",
          estudianteNombre: data.estudianteNombre ?? "",
        };
      });
      onData(items);
    },
    (error) => {
      console.warn("Error en listener (chats inbox):", error);
      onError?.(error);
    },
  );
}

/**
 * Actualiza los metadatos del chat al enviar un mensaje: último mensaje, hora
 * y contador de no leídos para los participantes distintos al remitente.
 */
export async function touchChatOnMessage(
  chatId: string,
  lastMessage: string,
  senderId: string,
  users: string[],
): Promise<void> {
  const payload: Record<string, unknown> = {
    lastMessage,
    lastSenderId: senderId,
    updatedAt: serverTimestamp(),
  };
  users
    .filter((u) => u && u !== senderId)
    .forEach((u) => {
      payload[`unread.${u}`] = increment(1);
    });

  try {
    await updateDoc(doc(db, "chats", chatId), payload);
  } catch (error) {
    console.warn("No se pudo actualizar el chat:", error);
  }
}

/** Marca como leídos los mensajes del chat para el usuario actual. */
export async function markChatRead(chatId: string, uid: string): Promise<void> {
  try {
    await updateDoc(doc(db, "chats", chatId), { [`unread.${uid}`]: 0 });
  } catch {
    // El doc puede no existir aún; se ignora silenciosamente.
  }
}

/** Suscripción al total de mensajes no leídos de `uid` (para el badge). */
export function subscribeUnreadTotal(
  uid: string,
  onData: (total: number) => void,
): Unsubscribe {
  const q = query(
    collection(db, "chats"),
    where("users", "array-contains", uid),
  );
  return onSnapshot(
    q,
    (snap) => {
      let total = 0;
      snap.forEach((d) => {
        const unreadMap = ((d.data() as any).unread ?? {}) as Record<
          string,
          number
        >;
        total += unreadMap[uid] ?? 0;
      });
      onData(total);
    },
    (error) => console.warn("Error en listener (unread total):", error),
  );
}
