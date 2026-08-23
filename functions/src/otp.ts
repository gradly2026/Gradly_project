/**
 * Cloud Functions — Login sin contraseña por código OTP de 8 dígitos.
 *
 * FLUJO (ver también src/services/otpService.ts y app/auth/iniciosesion.tsx):
 *   1. App llama solicitarOtp({ email })
 *        → genera código de 8 dígitos criptográficamente seguro
 *        → guarda SOLO el hash (sha256) en codigos_otp/{email}
 *        → envía el código por email con Resend
 *        → SIEMPRE responde { ok: true } (exista o no la cuenta) para no
 *          filtrar qué correos están registrados.
 *   2. App llama verificarOtp({ email, codigo })
 *        → valida hash + expiración + intentos
 *        → admin.auth().createCustomToken(uid)
 *        → devuelve { token }; la app hace signInWithCustomToken → sesión REAL.
 *
 * SEGURIDAD:
 *   - codigos_otp es read/write:false para clientes (ver firestore.rules). Solo
 *     el Admin SDK (estas functions) lo toca, y bypassa las reglas.
 *   - Se guarda el HASH, no el código en claro: nadie con acceso a la consola
 *     de Firebase puede iniciar sesión leyendo Firestore.
 *
 * REQUISITOS PARA DESPLEGAR:
 *   1. Plan Blaze activo.
 *   2. cd functions && npm install resend
 *   3. firebase functions:secrets:set RESEND_API_KEY  (clave de resend.com)
 *   4. firebase deploy --only functions:solicitarOtp,functions:verificarOtp
 */
import * as crypto from "crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { Resend } from "resend";

// index.ts no inicializa admin (su función de traducción usa event.data.ref),
// así que lo hacemos aquí de forma idempotente.
if (admin.apps.length === 0) admin.initializeApp();

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const db = admin.firestore();

const LONGITUD = 8;
const VIGENCIA_MS = 5 * 60 * 1000; // 5 minutos
const MAX_INTENTOS = 5;
const COOLDOWN_MS = 60 * 1000; // 1 reenvío por minuto
const REGION = "us-central1"; // misma región que el resto de functions

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/;

const hashCodigo = (codigo: string, email: string): string =>
  crypto.createHash("sha256").update(`${codigo}:${email}`).digest("hex");

function generarCodigo(): string {
  // 8 dígitos seguros, con ceros a la izquierda (00000000–99999999).
  const n = crypto.randomInt(0, 10 ** LONGITUD);
  return n.toString().padStart(LONGITUD, "0");
}

// ── 1) SOLICITAR CÓDIGO ───────────────────────────────────────────
export const solicitarOtp = onCall(
  { secrets: [RESEND_API_KEY], region: REGION },
  async (req) => {
    const email = String(req.data?.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      throw new HttpsError("invalid-argument", "Email inválido");
    }

    const ref = db.collection("codigos_otp").doc(email);

    // Anti-spam: respeta el cooldown de reenvío.
    const prev = await ref.get();
    if (prev.exists) {
      const creadoEn = Number(prev.data()?.creadoEn ?? 0);
      if (Date.now() - creadoEn < COOLDOWN_MS) {
        throw new HttpsError(
          "resource-exhausted",
          "Espera un momento antes de pedir otro código.",
        );
      }
    }

    // ⚠️ No revelar si el email existe: solo enviamos correo si hay cuenta,
    // pero SIEMPRE respondemos { ok: true }.
    let existe = true;
    try {
      await admin.auth().getUserByEmail(email);
    } catch {
      existe = false;
    }

    if (existe) {
      const codigo = generarCodigo();
      await ref.set({
        hash: hashCodigo(codigo, email),
        expiraEn: Date.now() + VIGENCIA_MS,
        intentos: 0,
        creadoEn: Date.now(),
      });

      const resend = new Resend(RESEND_API_KEY.value());
      const { error: errorResend } = await resend.emails.send({
        from: "Gradly <notificaciones@send.gradly.website>",
        to: email,
        subject: `Tu código de acceso Gradly: ${codigo}`,
        html: `
          <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0f172a">
            <h2 style="margin:0 0 8px">Código de acceso</h2>
            <p style="margin:0 0 20px;color:#475569">Usa este código para iniciar sesión en Gradly:</p>
            <p style="font-size:36px;font-weight:800;letter-spacing:10px;margin:0 0 20px;color:#0f172a">${codigo}</p>
            <p style="margin:0;color:#64748b;font-size:14px">Válido por 5 minutos. Si no lo solicitaste, ignora este correo.</p>
          </div>
        `,
      });
      // El SDK de Resend no lanza excepción cuando el envío falla del lado de
      // ellos (dominio no verificado, límite, etc.) — devuelve { error } sin
      // tirar. Sin este chequeo, la función seguía de largo y respondía
      // { ok: true } aunque el correo nunca hubiera salido.
      if (errorResend) {
        logger.error("Resend rechazó el envío del OTP", { email, errorResend });
        throw new HttpsError("internal", "No se pudo enviar el código. Intenta de nuevo.");
      }
    }

    return { ok: true };
  },
);

// ── 2) VERIFICAR CÓDIGO + (opcional) CAMBIAR CONTRASEÑA + TOKEN ────
// `nuevaPassword` opcional: si viene (flujo "recuperar contraseña"), se
// actualiza la contraseña del usuario con el Admin SDK ANTES de emitir el
// token. Si no viene (flujo "acceso sin contraseña"), solo se emite el token.
export const verificarOtp = onCall({ region: REGION }, async (req) => {
  const email = String(req.data?.email ?? "").trim().toLowerCase();
  const codigo = String(req.data?.codigo ?? "").trim();
  const nuevaPassword =
    req.data?.nuevaPassword != null ? String(req.data.nuevaPassword) : null;

  if (!EMAIL_RE.test(email) || codigo.length !== LONGITUD) {
    throw new HttpsError("invalid-argument", "Datos inválidos");
  }
  // Si se va a cambiar la contraseña, validar su longitud mínima.
  if (nuevaPassword !== null && nuevaPassword.length < 6) {
    throw new HttpsError("invalid-argument", "La contraseña es muy corta");
  }

  const ref = db.collection("codigos_otp").doc(email);
  const snap = await ref.get();

  if (!snap.exists) {
    throw new HttpsError(
      "not-found",
      "No hay código activo. Solicita uno nuevo.",
    );
  }

  const d = snap.data()!;

  if (Date.now() > Number(d.expiraEn)) {
    await ref.delete();
    throw new HttpsError("deadline-exceeded", "El código expiró.");
  }

  if (Number(d.intentos) >= MAX_INTENTOS) {
    await ref.delete();
    throw new HttpsError("resource-exhausted", "Demasiados intentos.");
  }

  if (d.hash !== hashCodigo(codigo, email)) {
    await ref.update({ intentos: admin.firestore.FieldValue.increment(1) });
    throw new HttpsError("permission-denied", "Código incorrecto.");
  }

  // Correcto: borra el código (un solo uso).
  await ref.delete();
  const user = await admin.auth().getUserByEmail(email);

  // Flujo "recuperar contraseña": actualiza la clave antes de emitir el token.
  if (nuevaPassword !== null) {
    await admin.auth().updateUser(user.uid, { password: nuevaPassword });
  }

  const token = await admin.auth().createCustomToken(user.uid);
  return { token };
});

// ── 3) CONSULTAR MOTIVO DE BLOQUEO (baneo/inactivación) ────────────
/**
 * `signInWithEmailAndPassword`/`signInWithCustomToken` rechazan de entrada a
 * una cuenta con `disabled:true` en Firebase Auth (código `auth/user-disabled`)
 * — ANTES de que el cliente llegue a leer `usuarios/{uid}` para mostrar el
 * motivo, porque en ese punto el login falló y no hay sesión autenticada
 * (las reglas de Firestore exigen `request.auth != null`). Esta función
 * pública (sin requerir sesión, igual que `solicitarOtp`) resuelve ESE hueco
 * puntual: dado un correo, dice si la cuenta está bloqueada y por qué, sin
 * exponer nada más del documento del usuario.
 *
 * No exige `EMAIL_RE` estricto sobre intentos maliciosos porque el peor caso
 * es revelar si un correo puntual está baneado/inactivo — mismo nivel de
 * exposición que ya tiene el propio error `auth/user-disabled` de Firebase.
 */
export const consultarEstadoAcceso = onCall({ region: REGION }, async (req) => {
  const email = String(req.data?.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { bloqueado: false, tipo: null, motivo: null };
  }

  try {
    const user = await admin.auth().getUserByEmail(email);
    if (!user.disabled) {
      return { bloqueado: false, tipo: null, motivo: null };
    }

    const snap = await db.collection("usuarios").doc(user.uid).get();
    const data = snap.exists ? snap.data() ?? {} : {};
    const baneado = data.baneado === true;

    return {
      bloqueado: true,
      tipo: baneado ? "baneado" : "inactivo",
      motivo: baneado && data.motivo_baneo ? String(data.motivo_baneo) : null,
    };
  } catch {
    // Cuenta inexistente u otro error: no revelar nada (mismo criterio que
    // solicitarOtp, que tampoco delata si un correo está registrado).
    return { bloqueado: false, tipo: null, motivo: null };
  }
});
