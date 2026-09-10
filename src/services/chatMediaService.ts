// ════════════════════════════════════════════════════════════════════════
// chatMediaService.ts — subida a Storage de los adjuntos del chat (imágenes,
// y más adelante audios). Espeja el patrón de `comprobanteService.subirComprobantePdf`.
//
// Los mensajes (`chats/{chatId}/messages/{msgId}`) se crean en ChatThread con
// `image` / `audio` = la URL de descarga que devuelven estas funciones. La
// regla de Storage (`chat_media/{chatId}/{fileName}`) deja escribir a cualquier
// autenticado con límite de tamaño y `image/*` | `audio/*`.
// ════════════════════════════════════════════════════════════════════════

import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { storage } from '../config/firebaseConfig';

/** Sube una imagen local del chat y devuelve su URL de descarga. */
export async function subirImagenChat(
  chatId: string,
  msgId: string,
  fileUri: string,
): Promise<string> {
  const resp = await fetch(fileUri);
  const blob = await resp.blob();
  const r = storageRef(storage, `chat_media/${chatId}/${msgId}.jpg`);
  await uploadBytes(r, blob, { contentType: (blob as any).type || 'image/jpeg' });
  return getDownloadURL(r);
}

/** Sube un audio local del chat y devuelve su URL de descarga. */
export async function subirAudioChat(
  chatId: string,
  msgId: string,
  fileUri: string,
): Promise<string> {
  const resp = await fetch(fileUri);
  const blob = await resp.blob();
  const r = storageRef(storage, `chat_media/${chatId}/${msgId}.m4a`);
  await uploadBytes(r, blob, { contentType: (blob as any).type || 'audio/m4a' });
  return getDownloadURL(r);
}
