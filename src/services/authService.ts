// Utilidades de Auth y uploads (Firebase).
// La sesión global vive en src/context/AuthContext.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signOut,
  type ActionCodeSettings,
} from "firebase/auth";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, storage } from "../config/firebaseConfig";

// ── Magic link / reseteo de contraseña ───────────────────────────────
// Clave bajo la que se guarda el correo ANTES de enviar el enlace mágico.
// Se usa AsyncStorage porque debe funcionar también en nativo (donde
// window.localStorage no existe). En WEB, AsyncStorage escribe directamente
// en window.localStorage con esta misma clave, así que el requisito de
// "guardar en localStorage" queda cubierto. La pantalla /auth/action y
// iniciosesion leen este valor al volver desde la bandeja de entrada.
export const CORREO_TEMPORAL_KEY = "correoTemporalAuth";

/**
 * Override dinámico del handler de la acción (evita tocar la consola).
 *  - Dev  → http://localhost:8081/auth/action (Expo web por defecto).
 *  - Prod → dominio real autorizado en Firebase.
 *
 * Para el Magic Link, este `url` ES el destino del enlace del correo, así que
 * `signIn` aterriza directamente en /auth/action. Para el reseteo, mientras el
 * handler de consola siga por defecto, este `url` actúa como `continueUrl` (el
 * reseteo se completa en la página de Firebase y luego redirige aquí); si más
 * adelante configuras el "Custom action URL", /auth/action recibirá el
 * resetPassword directamente sin cambiar este código.
 */
const ACTION_URL = __DEV__
  ? "http://localhost:8081/auth/action"
  : "https://gradly-db-752c2.firebaseapp.com/auth/action";

const magicLinkSettings: ActionCodeSettings = {
  url: ACTION_URL,
  handleCodeInApp: true,
  android: {
    packageName: "com.gradly.app",
    installApp: true,
    minimumVersion: "12",
  },
};

const resetPasswordSettings: ActionCodeSettings = {
  url: ACTION_URL,
  handleCodeInApp: true,
};

export async function uploadPhoto(uid: string, localUri: string): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const storageRef = ref(storage, `fotos_perfil/${uid}`);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

export async function uploadCV(
  uid: string,
  localUri: string,
  filename: string,
): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const storageRef = ref(storage, `cvs/${uid}/${filename}`);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

export async function uploadLogo(uid: string, localUri: string): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const storageRef = ref(storage, `logos_empresas/${uid}/logo.jpg`);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

/**
 * Cierra la sesión de Firebase y redirige al inicio de sesión.
 * Acepta el `router` de expo-router (tipado laxo para evitar acoplamiento).
 */
export default async function handleLogout(router?: {
  replace: (href: any) => void;
}): Promise<void> {
  try {
    await signOut(auth);
  } finally {
    router?.replace("/auth/iniciosesion");
  }
}
