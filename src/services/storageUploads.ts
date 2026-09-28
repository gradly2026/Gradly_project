// ════════════════════════════════════════════════════════════════════════
// storageUploads.ts — subidas a Storage compartidas entre roles.
//
// uploadDocumentoVerificacion vivía originalmente solo dentro de
// app/auth/registro.tsx (donde la empresa sube su NIT/documento al
// registrarse); se extrajo aquí para que el tutor (Fase 1 del rol tutor)
// también pueda subir su propio DUI opcional con la misma función, sin
// duplicar código. Misma ruta de Storage para ambos roles:
// documentos_verificacion/{uid}/{fileName} (ver storage.rules — el `rol`
// permitido incluye 'empresa' y 'tutor').
// ════════════════════════════════════════════════════════════════════════

import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../config/firebaseConfig';

/**
 * Sube una foto de documento de verificación (NIT/DUI, frente o reverso) a
 * `documentos_verificacion/{uid}/{fileName}` — legible solo por el propio
 * dueño y el admin (ver storage.rules). La URL que devuelve se guarda en la
 * colección protegida correspondiente (`verificaciones_empresa`/
 * `verificaciones_tutor`), nunca en el perfil público.
 */
export async function uploadDocumentoVerificacion(
  uid: string,
  localUri: string,
  fileName: string,
): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const storageRef = ref(storage, `documentos_verificacion/${uid}/${fileName}`);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}
