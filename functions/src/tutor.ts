/**
 * Cloud Functions del rol "tutor" (Fase 1: fundación — ver memoria del
 * proyecto). Un tutor es la persona que una EMPRESA delega como encargado
 * on-site de sus pasantes; en esta fase solo existe la cuenta y su perfil
 * propio — asignación a pasantes, asistencia, observaciones e incidencias
 * llegan en fases posteriores.
 *
 * POR QUÉ TODO ESTO VIVE AQUÍ (Admin SDK) Y NO DEL LADO DEL CLIENTE:
 * el precedente más parecido en este proyecto — una universidad crea cuentas
 * de estudiantes por Excel — se hace 100% del lado del cliente con una app
 * secundaria de Firebase (para no cerrar la sesión de quien está creando las
 * cuentas). Pero ese precedente nunca manda correo. Aquí SÍ hace falta
 * mandarle sus credenciales al tutor por Resend (que exige una API key
 * secreta, solo disponible en el servidor) — y una vez que el correo tiene
 * que salir del servidor, ya no tiene sentido dividir el trabajo: el Admin
 * SDK puede crear la cuenta de Auth directamente (no tiene el concepto de
 * "usuario actual" que obliga al truco de la app secundaria en el cliente),
 * así que crearTutor hace todo en un solo lugar.
 *
 * La contraseña temporal que exige Firebase para crear la cuenta NUNCA se le
 * muestra a la empresa que registra al tutor — se le manda solo a él, por
 * correo, junto con el enlace de inicio de sesión. El camino real de acceso
 * es el login sin contraseña (OTP) que ya usa el resto de la app; la
 * contraseña es solo un respaldo si prefiere no usarlo.
 */
import * as crypto from "crypto";
import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { RESEND_API_KEY, correoCredencialesTutor, enviarCorreo } from "./correo";

if (admin.apps.length === 0) admin.initializeApp();

const db = admin.firestore();
const REGION = "us-central1";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const MAX_TEXTO = 200;

type UserRole = "admin" | "universidad" | "empresa" | "estudiante" | "tutor";

type EmpresaActor = { uid: string };

function asString(value: unknown): string {
  return String(value ?? "").trim();
}
function limitarTexto(value: unknown, max = MAX_TEXTO): string {
  return asString(value).slice(0, max);
}

/** Mismo patrón que `requireUniversidad` (universidad.ts): duplicado a
 *  propósito, functions/ no comparte helpers chicos entre archivos. */
async function requireEmpresa(
  auth: { uid?: string; token?: Record<string, unknown> } | null | undefined,
): Promise<EmpresaActor> {
  const uid = asString(auth?.uid);
  if (!uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  const profileSnap = await db.collection("usuarios").doc(uid).get();
  const profileRole = asString(profileSnap.data()?.rol) as UserRole;
  const tokenRole = asString(auth?.token?.role) as UserRole;
  const effectiveRole = tokenRole || profileRole;
  if (effectiveRole !== "empresa") {
    throw new HttpsError("permission-denied", "Solo una empresa puede realizar esta acción.");
  }
  return { uid };
}

async function writeAuditLog(params: {
  actorUid: string;
  action: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.collection("audit_logs").add({
      actor_id: params.actorUid,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      payload: params.payload,
      source: "cloud_function",
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    logger.error("audit log failed:", error);
  }
}

/** Mismo patrón que `syncAuthDisabled` de admin.ts: duplicado a propósito. */
async function syncAuthDisabled(uid: string, disabled: boolean): Promise<void> {
  try {
    await admin.auth().updateUser(uid, { disabled });
  } catch (error: any) {
    if (String(error?.code ?? "") !== "auth/user-not-found") {
      logger.error("syncAuthDisabled failed:", error);
    }
  }
}

/** Contraseña temporal — nunca se muestra en la app, solo viaja por correo al
 *  propio tutor. Evita caracteres ambiguos (0/O, 1/l/I). */
function generarPasswordTemporal(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i++) out += alfabeto[bytes[i] % alfabeto.length];
  return `Gradly-${out}!`;
}

// ── LA EMPRESA REGISTRA UN TUTOR ────────────────────────────────────
export const crearTutor = onCall({ region: REGION, secrets: [RESEND_API_KEY] }, async (req) => {
  const actor = await requireEmpresa(req.auth);

  const correo = asString(req.data?.correo).toLowerCase();
  const nombreCompleto = limitarTexto(req.data?.nombreCompleto);
  const cargo = limitarTexto(req.data?.cargo);
  const carnetTrabajo = limitarTexto(req.data?.carnetTrabajo);

  if (!EMAIL_RE.test(correo)) throw new HttpsError("invalid-argument", "Correo inválido.");
  if (!nombreCompleto) throw new HttpsError("invalid-argument", "Falta el nombre completo.");
  if (!cargo) throw new HttpsError("invalid-argument", "Falta el cargo.");
  if (!carnetTrabajo) throw new HttpsError("invalid-argument", "Falta el carnet de trabajo.");

  const passwordTemporal = generarPasswordTemporal();
  let uid: string;
  try {
    const userRecord = await admin.auth().createUser({
      email: correo,
      password: passwordTemporal,
      displayName: nombreCompleto,
    });
    uid = userRecord.uid;
  } catch (error: any) {
    if (String(error?.code ?? "") === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "Ya existe una cuenta registrada con ese correo.");
    }
    logger.error("crearTutor: no se pudo crear la cuenta de Auth", error);
    throw new HttpsError("internal", "No se pudo crear la cuenta del tutor. Intenta de nuevo.");
  }

  const ahora = admin.firestore.FieldValue.serverTimestamp();
  await db.collection("usuarios").doc(uid).set({
    nombre_completo: nombreCompleto,
    correo,
    rol: "tutor",
    empresa_id: actor.uid,
    activo: true,
    esPrimerIngreso: true,
    tourVisto: {},
    fecha_registro: ahora,
  });
  await db.collection("perfiles_tutores").doc(uid).set({
    empresa_id: actor.uid,
    nombre_completo: nombreCompleto,
    correo,
    cargo,
    carnet_trabajo: carnetTrabajo,
    foto_url: "",
    direccion: "",
    departamento: "",
    distrito: "",
    horario: null,
    activo: true,
    fecha_registro: ahora,
  });

  const emailEnviado = await enviarCorreo(correo, correoCredencialesTutor(nombreCompleto, correo, passwordTemporal));

  await writeAuditLog({
    actorUid: actor.uid,
    action: "crear_tutor",
    entityType: "perfiles_tutores",
    entityId: uid,
    payload: { correo, cargo, emailEnviado },
  });

  return { ok: true, uid, emailEnviado };
});

async function cambiarActivoTutor(
  req: { auth?: { uid?: string; token?: Record<string, unknown> } | null; data: any },
  activo: boolean,
  accion: string,
): Promise<{ ok: true; uid: string }> {
  const actor = await requireEmpresa(req.auth);
  const tutorId = asString(req.data?.tutorId);
  if (!tutorId) throw new HttpsError("invalid-argument", "Datos inválidos.");

  const perfilRef = db.collection("perfiles_tutores").doc(tutorId);
  const perfilSnap = await perfilRef.get();
  if (!perfilSnap.exists) throw new HttpsError("not-found", "Ese tutor ya no existe.");
  if (perfilSnap.data()?.empresa_id !== actor.uid) {
    throw new HttpsError("permission-denied", "Ese tutor no pertenece a tu empresa.");
  }

  await Promise.all([
    perfilRef.update({ activo }),
    db.collection("usuarios").doc(tutorId).update({ activo }),
  ]);
  await syncAuthDisabled(tutorId, !activo);
  await writeAuditLog({
    actorUid: actor.uid,
    action: accion,
    entityType: "perfiles_tutores",
    entityId: tutorId,
    payload: {},
  });

  return { ok: true, uid: tutorId };
}

// ── LA EMPRESA DESACTIVA / REACTIVA UN TUTOR SUYO ──────────────────
export const desactivarTutor = onCall({ region: REGION }, async (req) => {
  try {
    return await cambiarActivoTutor(req, false, "desactivar_tutor");
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error("desactivarTutor failed:", error);
    throw new HttpsError("internal", "No se pudo desactivar al tutor.");
  }
});

export const reactivarTutor = onCall({ region: REGION }, async (req) => {
  try {
    return await cambiarActivoTutor(req, true, "reactivar_tutor");
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error("reactivarTutor failed:", error);
    throw new HttpsError("internal", "No se pudo reactivar al tutor.");
  }
});
