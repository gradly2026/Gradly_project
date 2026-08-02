/**
 * Cloud Function — Notificación (campanita) al recibir un mensaje de chat.
 *
 * Trigger sobre `chats/{chatId}/messages/{messageId}`: por cada mensaje de texto
 * nuevo, para cada participante que NO sea el remitente y que NO tenga el chat
 * abierto, REEMPLAZA (no acumula) su notificación de ese chat — doc
 * determinístico `chat_{chatId}_{uid}` → siempre muestra el último mensaje.
 *
 * Solo campanita in-app (no hay push del sistema). "Chat abierto" = el usuario
 * está viendo justo ese chat: `presencia/{uid}` con `activeChatId === chatId`,
 * `status === 'online'` y `lastSeen` fresco (≤120s).
 */
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

if (admin.apps.length === 0) admin.initializeApp();

const REGION = "us-central1";
const FRESCO_MS = 120_000;

/** ¿El usuario está viendo ESTE chat ahora mismo? */
async function tieneChatAbierto(uid: string, chatId: string): Promise<boolean> {
  const snap = await admin.firestore().doc(`presencia/${uid}`).get();
  const d = snap.data();
  if (!d) return false;
  if (d.activeChatId !== chatId) return false;
  if (d.status !== "online") return false;
  const last = d.lastSeen?.toMillis?.() ?? 0;
  return Date.now() - last < FRESCO_MS;
}

export const notifNuevoMensaje = onDocumentCreated(
  { document: "chats/{chatId}/messages/{messageId}", region: REGION },
  async (event) => {
    const msg = event.data?.data();
    if (!msg) return;

    // Solo mensajes de texto reales.
    if (msg.system || msg.isDeleted) return;
    if (msg.type && msg.type !== "text") return;
    const texto = String(msg.text ?? "").trim();
    if (!texto) return;

    const senderId = String(msg.user?._id ?? msg.user?.id ?? "");
    const chatId = event.params.chatId;

    const chatSnap = await admin.firestore().doc(`chats/${chatId}`).get();
    const chat = chatSnap.data();
    if (!chat) return;

    const users: string[] = Array.isArray(chat.users) ? chat.users : [];
    const destinatarios = users.filter((u) => u && u !== senderId);
    if (destinatarios.length === 0) return;

    const remitente = String(msg.user?.name ?? "Alguien");
    const titulo = `Nuevo mensaje de ${remitente}`;
    const preview = texto.length > 80 ? texto.slice(0, 77) + "…" : texto;
    const ruta = `/mensajes/${chatId}`; // deep link al chat (al tocar la campanita)

    for (const uid of destinatarios) {
      // No molestar si el destinatario ya está viendo este chat.
      if (await tieneChatAbierto(uid, chatId)) continue;

      // Reemplaza la notificación anterior de este chat (ID determinístico).
      await admin
        .firestore()
        .collection("notificaciones_app")
        .doc(`chat_${chatId}_${uid}`)
        .set({
          destinatario_id: uid,
          titulo,
          mensaje: preview,
          tipo: "chat",
          referencia_id: ruta,
          link_accion: ruta,
          leido: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          fecha: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
  },
);
