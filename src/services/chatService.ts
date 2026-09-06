import {
  addDoc,
  collection,
  deleteField,
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
  type DocumentReference,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../config/firebaseConfig";

/**
 * True si el chat ya existe. CRÍTICO: tolera el `permission-denied` que
 * Firestore lanza al hacer `getDoc()` de un documento INEXISTENTE cuyas reglas
 * referencian `resource.data.users` (resource es null → la regla de lectura
 * falla). Sin esto, crear la PRIMERA conversación con alguien fallaba siempre.
 */
async function chatYaExiste(ref: DocumentReference): Promise<boolean> {
  try {
    return (await getDoc(ref)).exists();
  } catch {
    return false;
  }
}

/** Hash determinístico (djb2) de un conjunto de uids → id estable de grupo. */
function hashIds(ids: string[]): string {
  const base = [...ids].sort().join("_");
  let h = 5381;
  for (let i = 0; i < base.length; i++) {
    h = ((h << 5) + h + base.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

// ═══════════════════════════════════════════════════════════════════
//  "ESTÁ ESCRIBIENDO…"
// ═══════════════════════════════════════════════════════════════════

// La lógica pura (parseo, vigencia, texto) vive en utils/typing.ts para poder
// probarla sin arrastrar Firestore. Se re-exporta aquí por comodidad de los
// consumidores, que ya importan de este servicio.
// OJO: `export ... from` NO introduce los nombres en este módulo, por eso hace
// falta además el `import` para usarlos aquí abajo.
export {
  parseEscribiendo,
  textoEscribiendo,
  TYPING_THROTTLE_MS,
  TYPING_VIGENCIA_MS,
  type EscribiendoInfo,
} from "../utils/typing";
import { parseEscribiendo, type EscribiendoInfo } from "../utils/typing";

/**
 * Marca (o limpia) que este usuario está escribiendo en el chat.
 *
 * `at` es `serverTimestamp()` para no depender del reloj del dispositivo, y se
 * escribe con dot-path porque Firestore solo admite el centinela en la posición
 * de un campo, no anidado dentro de un objeto literal.
 *
 * Errores silenciados a propósito: que falle un indicador de tecleo nunca debe
 * interrumpir la conversación.
 */
export async function setTyping(
  chatId: string,
  uid: string,
  nombre: string,
  activo: boolean,
): Promise<void> {
  if (!chatId || !uid) return;
  try {
    await updateDoc(
      doc(db, "chats", chatId),
      activo
        ? { [`typing.${uid}.nombre`]: nombre || "", [`typing.${uid}.at`]: serverTimestamp() }
        : { [`typing.${uid}`]: deleteField() },
    );
  } catch {
    /* el indicador es cosmético: nunca romper el chat por esto */
  }
}

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
  /**
   * Info denormalizada de los participantes para los chats directos GENÉRICOS
   * (cualquier usuario ↔ cualquier usuario, creados desde el buscador). Permite
   * que el inbox y `chatTitle` resuelvan el nombre del otro sin lecturas extra.
   */
  participantsInfo?: Record<string, { nombre: string; rol: string }>;
  /** Participantes (sin contar al usuario actual) que están escribiendo ahora. */
  escribiendo?: EscribiendoInfo[];
}

/**
 * Título del chat = nombre del *otro* participante según el rol del usuario
 * actual. Centralizado aquí para que el inbox y el orquestador master-detail
 * deriven el mismo nombre (p. ej. para pasarlo como `peerName`).
 */
export function chatTitle(chat: ChatListItem, uid?: string): string {
  if (chat.type === "group") return chat.name || chat.grupoNombre || "Grupo";
  // Directo GENÉRICO (buscador): el otro participante según `participantsInfo`.
  if (chat.participantsInfo && uid) {
    const otroUid = Object.keys(chat.participantsInfo).find((u) => u !== uid);
    if (otroUid) return chat.participantsInfo[otroUid]?.nombre || "Usuario";
  }
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

  // Estudiantes reales del grupo (uids de Auth). El `where('universidad_id')`
  // es OBLIGATORIO: la regla de `perfiles_estudiantes` solo deja a la
  // universidad leer a SUS alumnos, y Firestore rechaza la query ENTERA con
  // permission-denied si no está acotada a esa rama — por eso "el botón de
  // chat del grupo no hacía nada" (ver gotcha_query_estudiantes_por_grupo).
  const estSnap = await getDocs(
    query(
      collection(db, "perfiles_estudiantes"),
      where("universidad_id", "==", universidadId),
      where("grupo_id", "==", grupoId),
    ),
  );
  // Estudiantes con su nombre (para `participantsInfo` → panel de integrantes).
  const estudiantesData = estSnap.docs.map((d) => ({
    id: d.id,
    nombre: String((d.data() as any)?.nombre_completo ?? "Estudiante"),
    foto: (d.data() as any)?.foto_url ?? null,
  }));
  const estudiantes = estudiantesData.map((e) => e.id);

  // Nombre de la universidad (denormalizado) si no se pasó.
  let universidadNombre = params.universidadNombre;
  if (!universidadNombre) {
    const uniSnap = await getDoc(
      doc(db, "perfiles_universidades", universidadId),
    );
    universidadNombre =
      (uniSnap.data() as any)?.nombre_universidad ?? "Universidad";
  }

  // Info denormalizada de participantes (nombre + foto) para el panel del grupo,
  // sin que cada cliente tenga que leer `usuarios/{uid}` (que las reglas niegan).
  const participantsInfo: Record<
    string,
    { nombre: string; rol: string; foto?: string | null }
  > = {
    [universidadId]: { nombre: universidadNombre ?? "Universidad", rol: "universidad" },
  };
  estudiantesData.forEach((e) => {
    participantsInfo[e.id] = { nombre: e.nombre, rol: "estudiante", foto: e.foto };
  });

  const chatId = `grupo_${grupoId}`;
  const users = Array.from(new Set([universidadId, ...estudiantes]));
  const chatRef = doc(db, "chats", chatId);
  const yaExiste = await chatYaExiste(chatRef);

  // Campos refrescables en cada recreación (membresía y nombre).
  const base: Record<string, unknown> = {
    type: "group",
    name: grupoNombre,
    admins: [universidadId],
    users,
    estudiantes,
    participantsInfo,
    universidadId,
    universidadNombre,
    grupoId,
    grupoNombre,
    ...(empresaId ? { empresaId } : {}),
    updatedAt: serverTimestamp(),
  };

  if (!yaExiste) {
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
 * Busca una conversación 1:1 YA existente entre `uidA` y `uidB`, sin importar
 * bajo qué esquema de id se creó (`direct_{empresa}_{estudiante}`, `dm_{a}_{b}`,
 * etc.). Devuelve el id de la mejor candidata (la que tiene mensajes; a
 * igualdad, la más reciente) o `null` si no hay ninguna.
 *
 * Se usa para NO duplicar el chat cuando ya se había hablado antes con esa
 * persona: al abrir el chat desde "Recontratar pasantes" (u otros botones) se
 * reutiliza la conversación previa —con todo su historial— en vez de crear una
 * sala nueva vacía con el mismo nombre.
 */
async function buscarChatDirectoPrevio(
  uidA: string,
  uidB: string,
): Promise<string | null> {
  try {
    const snap = await getDocs(
      query(collection(db, "chats"), where("users", "array-contains", uidA)),
    );
    const candidatas = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter(
        (c) =>
          c.type === "direct" &&
          Array.isArray(c.users) &&
          c.users.length === 2 &&
          c.users.includes(uidB),
      )
      .sort((a, b) => {
        const am = a.lastMessage?.trim() ? 1 : 0;
        const bm = b.lastMessage?.trim() ? 1 : 0;
        if (am !== bm) return bm - am;
        const ta = a.updatedAt?.toMillis?.() ?? 0;
        const tb = b.updatedAt?.toMillis?.() ?? 0;
        return tb - ta;
      });
    return candidatas[0]?.id ?? null;
  } catch {
    return null;
  }
}

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
  const yaExiste = await chatYaExiste(chatRef);

  // Si el chat canónico todavía no existe, puede haber YA una conversación
  // previa con esta misma persona bajo otro esquema de id (p. ej. un
  // `dm_{a}_{b}` creado desde el buscador). En ese caso se reutiliza esa —con
  // todo su historial— en vez de crear un chat nuevo duplicado.
  if (!yaExiste) {
    const previa = await buscarChatDirectoPrevio(empresaId, estudianteId);
    if (previa) {
      try {
        await updateDoc(doc(db, "chats", previa), {
          archivado: false,
          updatedAt: serverTimestamp(),
        });
      } catch {
        /* reactivar es best-effort: no romper la apertura del chat */
      }
      return previa;
    }
  }

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

  if (!yaExiste) {
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
 * Crea o reutiliza un chat directo GENÉRICO entre dos usuarios cualesquiera
 * (cualquier rol ↔ cualquier rol), iniciado desde el buscador.
 *
 * - ID determinístico `dm_{a}_{b}` con los uids ORDENADOS, de modo que da igual
 *   quién inicie la conversación: siempre es la misma sala (nunca se duplica).
 * - `users: [a, b]` → satisface las reglas de Firestore (el creador está dentro)
 *   y hace que el chat aparezca en el inbox de AMBOS.
 * - `participantsInfo` denormaliza nombre+rol de cada uno para que el inbox y
 *   `chatTitle` muestren el nombre correcto sin lecturas adicionales.
 *
 * Devuelve el id del chat (listo para abrir en ChatThread / master-detail).
 */
export async function abrirChatDirectoUsuarios(params: {
  yo: { uid: string; nombre: string; rol: string };
  otro: { uid: string; nombre: string; rol: string };
}): Promise<string> {
  const { yo, otro } = params;

  // Un par empresa↔estudiante SIEMPRE resuelve a la MISMA sala canónica
  // `direct_{empresaId}_{estudianteId}` que ya usan los botones de coordinación
  // (Mi Progreso, FechaPresentacionModal, InscripcionExitoModal, feed…). Sin
  // esto, pulsar "Chatear" desde un perfil o desde el buscador creaba un
  // `dm_{a}_{b}` PARALELO y salían dos conversaciones con la misma persona.
  const porRol: Record<string, { uid: string; nombre: string; rol: string }> = {
    [yo.rol]: yo,
    [otro.rol]: otro,
  };
  if (porRol.empresa && porRol.estudiante) {
    return abrirChatDirectoEmpresaEstudiante({
      empresaId: porRol.empresa.uid,
      empresaNombre: porRol.empresa.nombre,
      estudianteId: porRol.estudiante.uid,
      estudianteNombre: porRol.estudiante.nombre,
    });
  }

  const [a, b] = [yo.uid, otro.uid].sort();
  const chatId = `dm_${a}_${b}`;
  const chatRef = doc(db, "chats", chatId);
  const yaExiste = await chatYaExiste(chatRef);

  const participantsInfo: Record<string, { nombre: string; rol: string }> = {
    [yo.uid]: { nombre: yo.nombre, rol: yo.rol },
    [otro.uid]: { nombre: otro.nombre, rol: otro.rol },
  };

  const base: Record<string, unknown> = {
    type: "direct",
    contexto: "general",
    users: [a, b],
    participantsInfo,
    archivado: false,
    updatedAt: serverTimestamp(),
  };

  if (!yaExiste) {
    base.lastMessage = "";
    base.lastSenderId = "";
    base.unread = {};
    base.createdAt = serverTimestamp();
  }

  await setDoc(chatRef, base, { merge: true });
  return chatId;
}

/**
 * Crea un chat de GRUPO ad-hoc (no atado a un grupo académico): la universidad
 * arma una sala con los estudiantes que elija desde el buscador. `admins` = la
 * universidad (puede renombrar/moderar). ID aleatorio (addDoc) porque no hay un
 * grupoId determinístico detrás.
 */
export async function crearChatGrupoAdHoc(params: {
  adminUid: string;
  adminNombre: string;
  nombre: string;
  miembros: { uid: string; nombre: string }[];
}): Promise<string> {
  const { adminUid, adminNombre, nombre, miembros } = params;
  const users = Array.from(new Set([adminUid, ...miembros.map((m) => m.uid)]));

  const participantsInfo: Record<string, { nombre: string; rol: string }> = {
    [adminUid]: { nombre: adminNombre, rol: "universidad" },
  };
  miembros.forEach((m) => {
    participantsInfo[m.uid] = { nombre: m.nombre, rol: "estudiante" };
  });

  // ID determinístico por conjunto de miembros → el MISMO grupo de estudiantes
  // reutiliza la MISMA sala (ya no se crea un grupo nuevo en cada pulsación).
  const chatId = `gest_${hashIds(users)}`;
  const chatRef = doc(db, "chats", chatId);
  const yaExiste = await chatYaExiste(chatRef);

  const base: Record<string, unknown> = {
    type: "group",
    name: nombre,
    admins: [adminUid],
    users,
    participantsInfo,
    settings: { adminsOnly: false },
    updatedAt: serverTimestamp(),
  };
  if (!yaExiste) {
    base.lastMessage = "";
    base.lastSenderId = "";
    base.unread = {};
    base.createdAt = serverTimestamp();
  }
  await setDoc(chatRef, base, { merge: true });
  return chatId;
}

/**
 * Colapsa los chats DIRECTOS duplicados de un mismo par de personas. Antes de
 * unificar los flujos podía quedar un `direct_{empresaId}_{estudianteId}` (de
 * los botones de coordinación) y un `dm_{a}_{b}` (del "Chatear" genérico) para
 * la MISMA conversación. Se conserva UNO en la bandeja: el que tenga mensajes;
 * a igualdad, el más reciente; a igualdad, el `direct_` (el canónico al que ya
 * convergen los flujos nuevos). NO borra nada en la base: solo decide qué se
 * muestra. Las salas de grupo y las de 3+ participantes no se tocan.
 */
function colapsarDirectosDuplicados(items: ChatListItem[]): ChatListItem[] {
  const conMensaje = (c: ChatListItem) => !!c.lastMessage?.trim();
  const mejor = (a: ChatListItem, b: ChatListItem): ChatListItem => {
    if (conMensaje(a) !== conMensaje(b)) return conMensaje(a) ? a : b;
    const ta = a.updatedAt?.getTime() ?? 0;
    const tb = b.updatedAt?.getTime() ?? 0;
    if (ta !== tb) return ta > tb ? a : b;
    return a.id.startsWith("direct_") ? a : b;
  };

  // Solo entran las salas de los esquemas `direct_{empresaId}_{estudianteId}` y
  // `dm_{a}_{b}`: son las únicas dos que pueden apuntar a la MISMA conversación
  // de un par empresa↔estudiante. Los chats de coordinación de pasantía
  // (`{uni}_{emp}_{grupo}`, sin prefijo) y los de grupo quedan intactos.
  const esColapsable = (c: ChatListItem) =>
    c.type === "direct" &&
    c.users.length === 2 &&
    (c.id.startsWith("direct_") || c.id.startsWith("dm_"));

  const porPar = new Map<string, ChatListItem>();
  const resto: ChatListItem[] = [];
  for (const c of items) {
    if (!esColapsable(c)) {
      resto.push(c);
      continue;
    }
    const clave = [...c.users].sort().join("|");
    const prev = porPar.get(clave);
    porPar.set(clave, prev ? mejor(prev, c) : c);
  }
  return [...resto, ...porPar.values()].sort(
    (a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0),
  );
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
          participantsInfo: data.participantsInfo ?? undefined,
          // Quién teclea AHORA en esta sala (para el "escribiendo…" del inbox).
          escribiendo: parseEscribiendo(data, uid),
        };
      });
      onData(colapsarDirectosDuplicados(items));
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

/**
 * Marca como leídos los mensajes del chat para el usuario actual y registra la
 * hora exacta en que ENTRÓ al chat (`lastRead.{uid}`). Esa marca alimenta el
 * recibo "Visto [hora]" que ve el OTRO participante en sus propios mensajes.
 * No requiere cambios de reglas: el update lo hace un participante del chat.
 */
export async function markChatRead(chatId: string, uid: string): Promise<void> {
  try {
    await updateDoc(doc(db, "chats", chatId), {
      [`unread.${uid}`]: 0,
      [`lastRead.${uid}`]: serverTimestamp(),
    });
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
