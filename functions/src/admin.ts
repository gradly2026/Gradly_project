import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (admin.apps.length === 0) admin.initializeApp();

const db = admin.firestore();
const REGION = "us-central1";

type UserRole = "admin" | "universidad" | "empresa" | "estudiante";
type UserStatus = "active" | "pending" | "inactive";
type ApprovalStatus = "active" | "pending" | "inactive";
type ReportStatus = "abierto" | "en_investigacion" | "resuelto";

const VALID_ROLES = new Set<UserRole>([
  "admin",
  "universidad",
  "empresa",
  "estudiante",
]);
const VALID_STATUSES = new Set<UserStatus>(["active", "pending", "inactive"]);
const VALID_APPROVAL_STATUSES = new Set<ApprovalStatus>([
  "active",
  "pending",
  "inactive",
]);
const VALID_REPORT_STATUSES = new Set<ReportStatus>([
  "abierto",
  "en_investigacion",
  "resuelto",
]);

type AdminActor = {
  uid: string;
  email: string | null;
  role: UserRole;
};

function asString(value: unknown): string {
  return String(value ?? "").trim();
}

function asNullableString(value: unknown): string | null {
  const v = asString(value);
  return v ? v : null;
}

function normalizeApprovalStatus(
  value: unknown,
  activo: unknown,
): ApprovalStatus {
  const raw = asString(value).toLowerCase();
  if (raw === "pending") return "pending";
  if (raw === "inactive" || raw === "blocked" || raw === "disabled") {
    return "inactive";
  }
  if (raw === "active") return "active";
  return activo === false ? "inactive" : "active";
}

function roleRequiresApproval(role: UserRole | string | null | undefined): boolean {
  return role === "empresa" || role === "universidad";
}

async function requireAdmin(auth: { uid?: string; token?: Record<string, unknown> } | null | undefined): Promise<AdminActor> {
  const uid = asString(auth?.uid);
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const profileSnap = await db.collection("usuarios").doc(uid).get();
  const profile = profileSnap.data() ?? {};
  const profileRole = asString(profile.rol) as UserRole;
  const tokenRole = asString(auth?.token?.role) as UserRole;
  const effectiveRole = tokenRole || profileRole;

  if (effectiveRole !== "admin") {
    throw new HttpsError("permission-denied", "No tienes permisos de administrador.");
  }

  const email =
    typeof auth?.token?.email === "string" ? auth.token.email : null;

  return { uid, email, role: effectiveRole };
}

async function writeAuditLog(params: {
  actor: AdminActor;
  action: string;
  entityId: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  await db.collection("audit_logs").add({
    actor_id: params.actor.uid,
    actor_email: params.actor.email,
    action: params.action,
    entity_type: "usuarios",
    entity_id: params.entityId,
    payload: params.payload,
    source: "cloud_function",
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function safeWriteAuditLog(params: {
  actor: AdminActor;
  action: string;
  entityId: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    await writeAuditLog(params);
  } catch (error) {
    console.error("audit log failed:", error);
  }
}

async function syncRoleClaim(uid: string, role: UserRole): Promise<boolean> {
  try {
    const user = await admin.auth().getUser(uid);
    const claims = user.customClaims ?? {};
    await admin.auth().setCustomUserClaims(uid, {
      ...claims,
      role,
    });
    return true;
  } catch {
    return false;
  }
}

function profileCollectionForRole(role: UserRole | string | null | undefined): string | null {
  switch (role) {
    case "empresa":
      return "perfiles_empresas";
    case "universidad":
      return "perfiles_universidades";
    case "estudiante":
      return "perfiles_estudiantes";
    default:
      return null;
  }
}

export const setUserRole = onCall({ region: REGION }, async (req) => {
  try {
    const actor = await requireAdmin(req.auth);
    const targetUid = asString(req.data?.targetUid);
    const nextRole = asString(req.data?.nextRole) as UserRole;
    const reason = asNullableString(req.data?.reason);

    if (!targetUid || !VALID_ROLES.has(nextRole)) {
      throw new HttpsError("invalid-argument", "Parámetros inválidos.");
    }

    if (actor.uid === targetUid && nextRole !== "admin") {
      throw new HttpsError(
        "permission-denied",
        "No puedes quitarte tus propios privilegios de admin.",
      );
    }

    const targetRef = db.collection("usuarios").doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) {
      throw new HttpsError("not-found", "Usuario no encontrado.");
    }

    const currentRole = asString(targetSnap.data()?.rol) as UserRole;
    if (currentRole === nextRole) {
      return {
        ok: true,
        uid: targetUid,
        role: nextRole,
        claimsSynced: true,
      };
    }

    await targetRef.update({
      rol: nextRole,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    const claimsSynced = await syncRoleClaim(targetUid, nextRole);

    await safeWriteAuditLog({
      actor,
      action: "profile.role.update",
      entityId: targetUid,
      payload: {
        from: currentRole || null,
        to: nextRole,
        reason,
        claims_synced: claimsSynced,
      },
    });

    return {
      ok: true,
      uid: targetUid,
      role: nextRole,
      claimsSynced,
    };
  } catch (error: any) {
    console.error("setUserRole failed:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError(
      "internal",
      `Error interno en setUserRole: ${String(error?.message ?? error)}`,
    );
  }
});

export const setUserStatus = onCall({ region: REGION }, async (req) => {
  try {
    const actor = await requireAdmin(req.auth);
    const targetUid = asString(req.data?.targetUid);
    const nextStatus = asString(req.data?.nextStatus) as UserStatus;
    const reason = asNullableString(req.data?.reason);

    if (!targetUid || !VALID_STATUSES.has(nextStatus)) {
      throw new HttpsError("invalid-argument", "Parámetros inválidos.");
    }

    if (actor.uid === targetUid && nextStatus !== "active") {
      throw new HttpsError(
        "permission-denied",
        "No puedes desactivarte a ti mismo desde el panel.",
      );
    }

    const targetRef = db.collection("usuarios").doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) {
      throw new HttpsError("not-found", "Usuario no encontrado.");
    }

    const currentStatus = asString(targetSnap.data()?.status) as UserStatus;
    const nextActivo = nextStatus === "active";
    if (currentStatus === nextStatus) {
      return {
        ok: true,
        uid: targetUid,
        status: nextStatus,
        activo: nextActivo,
      };
    }

    await targetRef.update({
      status: nextStatus,
      activo: nextActivo,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    await safeWriteAuditLog({
      actor,
      action: "profile.status.update",
      entityId: targetUid,
      payload: {
        from: currentStatus || null,
        to: nextStatus,
        activo: nextActivo,
        reason,
      },
    });

    return {
      ok: true,
      uid: targetUid,
      status: nextStatus,
      activo: nextActivo,
    };
  } catch (error: any) {
    console.error("setUserStatus failed:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError(
      "internal",
      `Error interno en setUserStatus: ${String(error?.message ?? error)}`,
    );
  }
});

export const setUserApproval = onCall({ region: REGION }, async (req) => {
  try {
    const actor = await requireAdmin(req.auth);
    const targetUid = asString(req.data?.targetUid);
    const nextApprovalStatus = asString(
      req.data?.nextApprovalStatus,
    ) as ApprovalStatus;
    const reason = asNullableString(req.data?.reason);

    if (!targetUid || !VALID_APPROVAL_STATUSES.has(nextApprovalStatus)) {
      throw new HttpsError("invalid-argument", "Parámetros inválidos.");
    }

    if (actor.uid === targetUid) {
      throw new HttpsError(
        "permission-denied",
        "No puedes aprobar o rechazar tu propia cuenta desde el panel.",
      );
    }

    const targetRef = db.collection("usuarios").doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) {
      throw new HttpsError("not-found", "Usuario no encontrado.");
    }

    const targetData = targetSnap.data() ?? {};
    const targetRole = asString(targetData.rol) as UserRole;
    if (!roleRequiresApproval(targetRole)) {
      throw new HttpsError(
        "failed-precondition",
        "Solo empresa y universidad requieren aprobación administrativa.",
      );
    }

    const currentApprovalStatus = normalizeApprovalStatus(
      targetData.approval_status,
      targetData.activo,
    );
    const nextStatus: UserStatus = nextApprovalStatus;
    const nextActivo = nextApprovalStatus === "active";
    if (
      currentApprovalStatus === nextApprovalStatus
      && asString(targetData.status) === nextStatus
      && Boolean(targetData.activo) === nextActivo
    ) {
      return {
        ok: true,
        uid: targetUid,
        approvalStatus: nextApprovalStatus,
        status: nextStatus,
        activo: nextActivo,
      };
    }

    await targetRef.update({
      approval_status: nextApprovalStatus,
      status: nextStatus,
      activo: nextActivo,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    const profileCollection = profileCollectionForRole(targetRole);
    if (profileCollection) {
      try {
        const profileRef = db.collection(profileCollection).doc(targetUid);
        const profileSnap = await profileRef.get();
        if (profileSnap.exists) {
          await profileRef.update({
            approval_status: nextApprovalStatus,
            activo: nextActivo,
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      } catch (error) {
        console.error("setUserApproval profile sync failed:", error);
      }
    }

    await safeWriteAuditLog({
      actor,
      action: "profile.approval.update",
      entityId: targetUid,
      payload: {
        from: currentApprovalStatus,
        to: nextApprovalStatus,
        reason,
        role: targetRole,
        status: nextStatus,
        activo: nextActivo,
      },
    });

    return {
      ok: true,
      uid: targetUid,
      approvalStatus: nextApprovalStatus,
      status: nextStatus,
      activo: nextActivo,
    };
  } catch (error: any) {
    console.error("setUserApproval failed:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError(
      "internal",
      `Error interno en setUserApproval: ${String(error?.message ?? error)}`,
    );
  }
});

export const setUserBan = onCall({ region: REGION }, async (req) => {
  try {
    const actor = await requireAdmin(req.auth);
    const targetUid = asString(req.data?.targetUid);
    const banned = Boolean(req.data?.banned);
    const reason = asNullableString(req.data?.reason);

    if (!targetUid) {
      throw new HttpsError("invalid-argument", "Parámetros inválidos.");
    }
    if (banned && !reason) {
      throw new HttpsError(
        "invalid-argument",
        "Debes indicar el motivo del baneo.",
      );
    }
    if (actor.uid === targetUid) {
      throw new HttpsError(
        "permission-denied",
        "No puedes banearte o desbanearte desde el panel.",
      );
    }

    const targetRef = db.collection("usuarios").doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) {
      throw new HttpsError("not-found", "Usuario no encontrado.");
    }

    const targetData = targetSnap.data() ?? {};
    const targetRole = asString(targetData.rol) as UserRole;
    const profileCollection = profileCollectionForRole(targetRole);
    const nextStatus: UserStatus = banned ? "inactive" : "active";
    const nextActivo = !banned;

    await targetRef.update({
      baneado: banned,
      motivo_baneo: banned ? reason : null,
      baneo_hasta: null,
      status: nextStatus,
      activo: nextActivo,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (profileCollection) {
      try {
        const profileRef = db.collection(profileCollection).doc(targetUid);
        const profileSnap = await profileRef.get();
        if (profileSnap.exists) {
          await profileRef.update({
            activo: nextActivo,
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      } catch (error) {
        console.error("setUserBan profile sync failed:", error);
      }
    }

    try {
      await admin.auth().updateUser(targetUid, { disabled: banned });
    } catch (error: any) {
      if (String(error?.code ?? "") !== "auth/user-not-found") {
        console.error("setUserBan auth sync failed:", error);
      }
    }

    await safeWriteAuditLog({
      actor,
      action: banned ? "profile.ban.enable" : "profile.ban.disable",
      entityId: targetUid,
      payload: {
        banned,
        reason,
        role: targetRole || null,
        status: nextStatus,
        activo: nextActivo,
      },
    });

    return {
      ok: true,
      uid: targetUid,
      banned,
      status: nextStatus,
      activo: nextActivo,
    };
  } catch (error: any) {
    console.error("setUserBan failed:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError(
      "internal",
      `Error interno en setUserBan: ${String(error?.message ?? error)}`,
    );
  }
});

export const resolveReport = onCall({ region: REGION }, async (req) => {
  try {
    const actor = await requireAdmin(req.auth);
    const reportId = asString(req.data?.reportId);
    const nextStatus = asString(req.data?.nextStatus) as ReportStatus;
    const resolution = asNullableString(req.data?.resolution);

    if (!reportId || !VALID_REPORT_STATUSES.has(nextStatus)) {
      throw new HttpsError("invalid-argument", "Parámetros inválidos.");
    }
    if (nextStatus === "resuelto" && !resolution) {
      throw new HttpsError(
        "invalid-argument",
        "Debes indicar la resolución para cerrar el reporte.",
      );
    }

    const reportRef = db.collection("reportes").doc(reportId);
    const reportSnap = await reportRef.get();
    if (!reportSnap.exists) {
      throw new HttpsError("not-found", "Reporte no encontrado.");
    }

    const currentData = reportSnap.data() ?? {};
    const currentStatus = asString(currentData.estado) || "abierto";
    const patch: Record<string, unknown> = {
      estado: nextStatus,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      gestionado_por: actor.uid,
      gestionado_por_email: actor.email,
    };

    if (nextStatus === "resuelto") {
      patch.resolucion = resolution;
      patch.resuelto_en = admin.firestore.FieldValue.serverTimestamp();
    } else if (resolution) {
      patch.resolucion = resolution;
    }

    await reportRef.update(patch);

    await safeWriteAuditLog({
      actor,
      action: "report.status.update",
      entityId: reportId,
      payload: {
        from: currentStatus,
        to: nextStatus,
        resolution,
        reportado_id: asNullableString(currentData.reportado_id),
      },
    });

    return {
      ok: true,
      id: reportId,
      status: nextStatus,
      resolution: resolution ?? null,
    };
  } catch (error: any) {
    console.error("resolveReport failed:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError(
      "internal",
      `Error interno en resolveReport: ${String(error?.message ?? error)}`,
    );
  }
});

export const deleteUserComplete = onCall({ region: REGION }, async (req) => {
  try {
    const actor = await requireAdmin(req.auth);
    const targetUid = asString(req.data?.targetUid);
    const reason = asNullableString(req.data?.reason);

    if (!targetUid) {
      throw new HttpsError("invalid-argument", "Parámetros inválidos.");
    }
    if (actor.uid === targetUid) {
      throw new HttpsError(
        "permission-denied",
        "No puedes eliminar tu propia cuenta desde el panel.",
      );
    }

    const targetRef = db.collection("usuarios").doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) {
      throw new HttpsError("not-found", "Usuario no encontrado.");
    }

    const targetData = targetSnap.data() ?? {};
    const targetRole = asString(targetData.rol) as UserRole;
    const profileCollection = profileCollectionForRole(targetRole);
    const targetEmail =
      asNullableString(targetData.correo) ?? asNullableString(targetData.email);

    if (profileCollection) {
      const profileRef = db.collection(profileCollection).doc(targetUid);
      const profileSnap = await profileRef.get();
      if (profileSnap.exists) {
        await db.recursiveDelete(profileRef);
      }
    }

    await db.recursiveDelete(targetRef);

    try {
      await admin.auth().deleteUser(targetUid);
    } catch (error: any) {
      if (String(error?.code ?? "") !== "auth/user-not-found") {
        console.error("deleteUserComplete auth delete failed:", error);
      }
    }

    await safeWriteAuditLog({
      actor,
      action: "profile.delete.complete",
      entityId: targetUid,
      payload: {
        reason,
        role: targetRole || null,
        email: targetEmail,
        deleted_auth: true,
      },
    });

    return {
      ok: true,
      uid: targetUid,
    };
  } catch (error: any) {
    console.error("deleteUserComplete failed:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError(
      "internal",
      `Error interno en deleteUserComplete: ${String(error?.message ?? error)}`,
    );
  }
});
