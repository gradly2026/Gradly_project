import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../config/firebaseConfig";

/**
 * Servicio centralizado de notificaciones in-app.
 *
 * Escribe en la colección `notificaciones_app`. Para no fragmentar el sistema
 * existente (el lector histórico ordena por `fecha` y usa `link_accion`),
 * además de los campos canónicos (`createdAt`, `referencia_id`) se escriben los
 * campos espejo `fecha` y `link_accion`. Así cualquier lector —nuevo o viejo—
 * funciona sin migración.
 *
 * Tipos sugeridos: 'success' | 'info' | 'warning' | 'error'.
 */
export async function enviarNotificacion(
  destinatario_id: string,
  titulo: string,
  mensaje: string,
  tipo: string,
  referencia_id: string | null = null,
): Promise<void> {
  if (!destinatario_id) return;
  try {
    await addDoc(collection(db, "notificaciones_app"), {
      destinatario_id,
      titulo,
      mensaje,
      tipo,
      referencia_id,
      leido: false,
      createdAt: serverTimestamp(),
      // ── Espejo para compatibilidad con el lector existente ──
      fecha: serverTimestamp(),
      link_accion: referencia_id ?? "",
    });
  } catch (error) {
    // Las notificaciones nunca deben bloquear el flujo principal del usuario.
    console.warn("No se pudo enviar la notificación:", error);
  }
}
