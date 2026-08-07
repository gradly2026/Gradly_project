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
const _consultarEstadoAcceso = httpsCallable<
  { email: string },
  { bloqueado: boolean; tipo: "baneado" | "inactivo" | null; motivo: string | null }
>(functions, "consultarEstadoAcceso");

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

/**
 * Dado un correo, dice si la cuenta está baneada/inactiva y por qué —
 * SIN necesitar sesión (a diferencia de `verificarBloqueoCuenta` en
 * `roleRouting.ts`, que lee Firestore directo y por eso solo sirve DESPUÉS
 * de un login exitoso). Existe porque `signInWithEmailAndPassword`/
 * `signInWithCustomToken` rechazan de entrada una cuenta con `disabled:true`
 * (código `auth/user-disabled`) antes de que el cliente llegue a leer nada.
 * Nunca lanza: si algo falla, devuelve "no bloqueado" (no bloquear al
 * usuario por un error transitorio de red).
 */
export async function consultarEstadoAcceso(
  email: string,
): Promise<{ tipo: "baneado" | "inactivo"; motivo: string | null } | null> {
  try {
    const res = await _consultarEstadoAcceso({ email: email.trim().toLowerCase() });
    if (res.data.bloqueado && res.data.tipo) {
      return { tipo: res.data.tipo, motivo: res.data.motivo };
    }
    return null;
  } catch {
    return null;
  }
}
