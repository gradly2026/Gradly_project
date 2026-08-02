// Login sin contraseña por código OTP de 8 dígitos.
// Backend: functions/src/otp.ts (callables solicitarOtp / verificarOtp).
// La sesión global vive en src/context/AuthContext.tsx.
import { signInWithCustomToken } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app, auth } from "../config/firebaseConfig";

// Misma región que las Cloud Functions (ver REGION en functions/src/otp.ts).
const functions = getFunctions(app, "us-central1");

const _solicitarOtp = httpsCallable<{ email: string }, { ok: boolean }>(
  functions,
  "solicitarOtp",
);
const _verificarOtp = httpsCallable<
  { email: string; codigo: string; nuevaPassword?: string },
  { token: string }
>(functions, "verificarOtp");

/**
 * Pide que se genere y envíe un código OTP al correo. Por seguridad la función
 * responde igual exista o no la cuenta (no revela qué correos están registrados).
 */
export async function solicitarOtp(email: string): Promise<void> {
  await _solicitarOtp({ email: email.trim().toLowerCase() });
}

/**
 * Verifica el código contra el backend y, si es correcto, INICIA LA SESIÓN real
 * de Firebase Auth con el custom token devuelto. Devuelve el uid del usuario.
 *
 * Si se pasa `nuevaPassword` (flujo "recuperar contraseña"), el backend además
 * actualiza la contraseña del usuario antes de emitir el token.
 *
 * Lanza el HttpsError propagado (code: 'deadline-exceeded' | 'permission-denied'
 * | 'not-found' | 'resource-exhausted' | 'invalid-argument') si falla.
 */
export async function verificarOtpYEntrar(
  email: string,
  codigo: string,
  nuevaPassword?: string,
): Promise<string> {
  const res = await _verificarOtp({
    email: email.trim().toLowerCase(),
    codigo: codigo.trim(),
    ...(nuevaPassword ? { nuevaPassword } : {}),
  });
  const cred = await signInWithCustomToken(auth, res.data.token);
  return cred.user.uid;
}
