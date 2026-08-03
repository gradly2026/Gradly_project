/**
 * Cloud Functions invocadas por una UNIVERSIDAD para deshacer sus propios
 * errores de carga: borrar un estudiante o un grupo completo que creó por
 * Excel, antes de que ese estudiante/grupo haya quedado ligado a una
 * pasantía real.
 *
 * Van en Cloud Functions (no en el cliente) porque borrar un estudiante
 * implica borrar su cuenta de Firebase Auth — el SDK de cliente NUNCA puede
 * borrar la cuenta de OTRO usuario, solo la propia (`auth.currentUser`). Sin
 * esto, el correo del estudiante queda "atrapado" para siempre y la
 * universidad no podría volver a crearlo al re-subir el Excel corregido.
 */
import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (admin.apps.length === 0) admin.initializeApp();

const db = admin.firestore();
const REGION = "us-central1";

type UserRole = "admin" | "universidad" | "empresa" | "estudiante";

type UniversidadActor = {
  uid: string;
};

function asString(value: unknown): string {
  return String(value ?? "").trim();
}

async function requireUniversidad(
  auth: { uid?: string; token?: Record<string, unknown> } | null | undefined,
): Promise<UniversidadActor> {
  const uid = asString(auth?.uid);
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  const profileSnap = await db.collection("usuarios").doc(uid).get();
  const profileRole = asString(profileSnap.data()?.rol) as UserRole;
  const tokenRole = asString(auth?.token?.role) as UserRole;
  const effectiveRole = tokenRole || profileRole;
  if (effectiveRole !== "universidad") {
    throw new HttpsError(
      "permission-denied",
      "Solo una universidad puede realizar esta acción.",
    );
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
    console.error("audit log failed:", error);
  }
}

/** Best-effort: borra la cuenta de Auth; "ya no existe" no es un error. */
async function deleteAuthUserSafe(uid: string): Promise<void> {
  try {
    await admin.auth().deleteUser(uid);
  } catch (error: any) {
    if (String(error?.code ?? "") !== "auth/user-not-found") {
      console.error(`deleteAuthUserSafe(${uid}) falló:`, error);
    }
  }
}

/** Borra por completo la cuenta de un estudiante (perfil + usuario + Auth). */
async function borrarCuentaEstudiante(uid: string): Promise<void> {
  await db.recursiveDelete(db.collection("perfiles_estudiantes").doc(uid));
  await db.recursiveDelete(db.collection("usuarios").doc(uid));
  await deleteAuthUserSafe(uid);
}

/**
 * true si el estudiante YA quedó ligado a una pasantía real: tomó un cupo
 * (reparto de cupos), tiene una aplicación individual a una vacante, o su
 * grupo ya tiene una solicitud de práctica que lo incluye (matchmaking /
 * "ofrecer a empresa" / compartir por chat — las tres formas denormalizan
 * `estudianteIds`).
 */
async function estudianteTienePasantia(estudianteId: string): Promise<boolean> {
  const [asignaciones, aplicaciones, solicitudes] = await Promise.all([
    db.collection("asignaciones_cupo").where("estudianteId", "==", estudianteId).limit(1).get(),
    db.collection("aplicaciones").where("estudiante_id", "==", estudianteId).limit(1).get(),
    db.collection("solicitudes_practicas").where("estudianteIds", "array-contains", estudianteId).limit(1).get(),
  ]);
  return !asignaciones.empty || !aplicaciones.empty || !solicitudes.empty;
}

/**
 * true si el grupo YA fue postulado por alguno de los tres caminos:
 * Matchmaking (`aplicaciones_grupos`), "ofrecer a empresa"/chat
 * (`solicitudes_practicas`), o reparto de cupos (`reclamos_cupos`).
 */
async function grupoTienePostulacion(grupoId: string): Promise<boolean> {
  const [aplicacionesGrupos, solicitudes, reclamos] = await Promise.all([
    db.collection("aplicaciones_grupos").where("grupoId", "==", grupoId).limit(1).get(),
    db.collection("solicitudes_practicas").where("grupoId", "==", grupoId).limit(1).get(),
    db.collection("reclamos_cupos").where("grupoId", "==", grupoId).limit(1).get(),
  ]);
  return !aplicacionesGrupos.empty || !solicitudes.empty || !reclamos.empty;
}

export const eliminarEstudiante = onCall({ region: REGION }, async (req) => {
  try {
    const actor = await requireUniversidad(req.auth);
    const estudianteId = asString(req.data?.estudianteId);
    if (!estudianteId) {
      throw new HttpsError("invalid-argument", "Falta el estudiante a eliminar.");
    }

    const perfilRef = db.collection("perfiles_estudiantes").doc(estudianteId);
    const perfilSnap = await perfilRef.get();
    if (!perfilSnap.exists) {
      throw new HttpsError("not-found", "Estudiante no encontrado.");
    }
    const perfil = perfilSnap.data() ?? {};
    if (asString(perfil.universidad_id) !== actor.uid) {
      throw new HttpsError(
        "permission-denied",
        "Ese estudiante no pertenece a tu universidad.",
      );
    }

    if (await estudianteTienePasantia(estudianteId)) {
      throw new HttpsError(
        "failed-precondition",
        "No se puede eliminar: el estudiante ya tiene una pasantía o solicitud en curso.",
      );
    }

    await borrarCuentaEstudiante(estudianteId);

    const grupoId = asString(perfil.grupo_id);
    if (grupoId) {
      await db.collection("grupos").doc(grupoId).update({
        estudiantes_registrados: admin.firestore.FieldValue.increment(-1),
      }).catch(() => {
        /* el grupo pudo haber sido borrado aparte; no es fatal */
      });
    }

    await writeAuditLog({
      actorUid: actor.uid,
      action: "estudiante.delete",
      entityType: "perfiles_estudiantes",
      entityId: estudianteId,
      payload: { nombre: perfil.nombre_completo ?? null, grupo_id: grupoId || null },
    });

    return { ok: true, uid: estudianteId };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    console.error("eliminarEstudiante failed:", error);
    throw new HttpsError("internal", `Error interno: ${String(error?.message ?? error)}`);
  }
});

export const eliminarGrupo = onCall({ region: REGION }, async (req) => {
  try {
    const actor = await requireUniversidad(req.auth);
    const grupoId = asString(req.data?.grupoId);
    if (!grupoId) {
      throw new HttpsError("invalid-argument", "Falta el grupo a eliminar.");
    }

    const grupoRef = db.collection("grupos").doc(grupoId);
    const grupoSnap = await grupoRef.get();
    if (!grupoSnap.exists) {
      throw new HttpsError("not-found", "Grupo no encontrado.");
    }
    const grupo = grupoSnap.data() ?? {};
    if (asString(grupo.universidad_id) !== actor.uid) {
      throw new HttpsError(
        "permission-denied",
        "Ese grupo no pertenece a tu universidad.",
      );
    }

    if (await grupoTienePostulacion(grupoId)) {
      throw new HttpsError(
        "failed-precondition",
        "No se puede eliminar: el grupo ya fue postulado a una empresa.",
      );
    }

    const estudiantesSnap = await db
      .collection("perfiles_estudiantes")
      .where("grupo_id", "==", grupoId)
      .get();

    // Secuencial (no Promise.all): cada borrado ya hace varias llamadas a
    // Auth/Firestore, y estos lotes son de decenas de alumnos, no miles.
    for (const doc of estudiantesSnap.docs) {
      await borrarCuentaEstudiante(doc.id);
    }

    // Chat oficial del grupo (id determinístico `grupo_{grupoId}`, creado al
    // crear el grupo) — se borra aparte porque vive en `chats`, no en `grupos`.
    await db.recursiveDelete(db.collection("chats").doc(`grupo_${grupoId}`)).catch(() => {});

    await db.recursiveDelete(grupoRef);

    await writeAuditLog({
      actorUid: actor.uid,
      action: "grupo.delete",
      entityType: "grupos",
      entityId: grupoId,
      payload: { nombre: grupo.nombre ?? null, estudiantes_eliminados: estudiantesSnap.size },
    });

    return { ok: true, id: grupoId, estudiantesEliminados: estudiantesSnap.size };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    console.error("eliminarGrupo failed:", error);
    throw new HttpsError("internal", `Error interno: ${String(error?.message ?? error)}`);
  }
});
