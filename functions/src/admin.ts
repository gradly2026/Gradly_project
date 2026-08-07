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
  entityType?: string;
  entityId: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  await db.collection("audit_logs").add({
    actor_id: params.actor.uid,
    actor_email: params.actor.email,
    action: params.action,
    entity_type: params.entityType ?? "usuarios",
    entity_id: params.entityId,
    payload: params.payload,
    source: "cloud_function",
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function safeWriteAuditLog(params: {
  actor: AdminActor;
  action: string;
  entityType?: string;
  entityId: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    await writeAuditLog(params);
  } catch (error) {
    console.error("audit log failed:", error);
  }
}

/**
 * Sincroniza el flag `disabled` de Firebase Auth con el estado en Firestore.
 * Usado por setUserStatus/setUserApproval/setUserBan: sin esto, inactivar o
 * rechazar una cuenta solo cambiaba Firestore y el usuario podía seguir
 * iniciando sesión con contraseña con total normalidad (Auth no sabía nada
 * del bloqueo).
 */
async function syncAuthDisabled(uid: string, disabled: boolean): Promise<void> {
  try {
    await admin.auth().updateUser(uid, { disabled });
  } catch (error: any) {
    if (String(error?.code ?? "") !== "auth/user-not-found") {
      console.error("syncAuthDisabled failed:", error);
    }
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

    // No reactivar Auth si la cuenta sigue baneada por separado (setUserBan
    // es la fuente de verdad del baneo; este flujo no debe pisarlo).
    if (nextStatus === "inactive") {
      await syncAuthDisabled(targetUid, true);
    } else if (!targetSnap.data()?.baneado) {
      await syncAuthDisabled(targetUid, false);
    }

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

    // Igual que setUserStatus: no reactivar Auth si la cuenta sigue baneada.
    if (nextApprovalStatus === "inactive") {
      await syncAuthDisabled(targetUid, true);
    } else if (!targetData.baneado) {
      await syncAuthDisabled(targetUid, false);
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

    await syncAuthDisabled(targetUid, banned);

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

/**
 * Recalcula desde cero, para TODAS las empresas y universidades, las
 * "alianzas" (contrapartes únicas con al menos una pasantía de grupo
 * aprobada/finalizada, O al menos un reclamo de cupos — cualquier estado,
 * incluso rechazado/liberado: pedir cupos ya es un gesto de confianza hacia
 * esa empresa) y el promedio de calificaciones de los estudiantes vinculados
 * (de grupo o de cupos tomados). Alimenta "Top Empresas/Universidades"
 * (RedGradlyBanner).
 *
 * Necesita Admin SDK porque nadie del lado cliente puede leer
 * `solicitudes_practicas`/`reclamos_cupos` de TODAS las instituciones a la
 * vez (las reglas de Firestore solo dejan a cada dueño leer lo suyo) —
 * normalmente estos dos campos los mantiene cada institución sola, en tiempo
 * real, al aprobar una pasantía o reclamar cupos (`arrayUnion` en su propio
 * perfil) o al visitar su panel (autoreporte de calificación). Esta función
 * es el backfill de una sola vez para que lo aprobado/reclamado ANTES de que
 * existiera ese mecanismo también cuente, y sirve además como "recalcular
 * todo" si algún día hiciera falta reconciliar drift.
 */
export const backfillAlianzasCalificaciones = onCall(
  { region: REGION, timeoutSeconds: 300, memory: "512MiB" },
  async (req) => {
    try {
      const actor = await requireAdmin(req.auth);

      const aliadosDeEmpresa = new Map<string, Set<string>>();
      const aliadosDeUni = new Map<string, Set<string>>();
      const estudiantesDeEmpresa = new Map<string, Set<string>>();
      const estudiantesDeUni = new Map<string, Set<string>>();

      const registrarAlianza = (empId: string, uniId: string) => {
        if (!empId || !uniId) return;
        if (!aliadosDeEmpresa.has(empId)) aliadosDeEmpresa.set(empId, new Set());
        aliadosDeEmpresa.get(empId)!.add(uniId);
        if (!aliadosDeUni.has(uniId)) aliadosDeUni.set(uniId, new Set());
        aliadosDeUni.get(uniId)!.add(empId);
      };
      const registrarEstudiante = (empId: string, uniId: string, estId: string) => {
        if (!empId || !uniId || !estId) return;
        if (!estudiantesDeEmpresa.has(empId)) estudiantesDeEmpresa.set(empId, new Set());
        estudiantesDeEmpresa.get(empId)!.add(estId);
        if (!estudiantesDeUni.has(uniId)) estudiantesDeUni.set(uniId, new Set());
        estudiantesDeUni.get(uniId)!.add(estId);
      };

      // 1) Pasantías de GRUPO realmente confirmadas (aprobado/finalizado),
      //    agrupadas por contraparte única + estudiantes vinculados.
      const solSnap = await db.collection("solicitudes_practicas").get();
      solSnap.docs.forEach((doc) => {
        const s = doc.data() ?? {};
        const estado = asString(s.estado);
        if (estado !== "aprobado" && estado !== "finalizado") return;
        const empId = asString(s.empresaId);
        const uniId = asString(s.universidadId);
        registrarAlianza(empId, uniId);
        const ids: string[] = Array.isArray(s.estudianteIds) ? s.estudianteIds : [];
        ids.forEach((id) => registrarEstudiante(empId, uniId, id));
      });

      // 2) Reparto de cupos: CUALQUIER reclamo (sin filtrar por estado) ya es
      //    un gesto de confianza hacia esa empresa — pedir cupos compromete
      //    plazas de inmediato, aunque la empresa termine rechazando o queden
      //    cupos sin usar. La alianza no se retira después (mismo criterio
      //    que el autoreporte en vivo de `reclamarCupos`).
      const reclamosSnap = await db.collection("reclamos_cupos").get();
      reclamosSnap.docs.forEach((doc) => {
        const r = doc.data() ?? {};
        registrarAlianza(asString(r.empresaId), asString(r.universidadId));
      });

      // 3) Estudiantes que efectivamente tomaron un cupo (asignaciones_cupo,
      //    estado 'tomado') — se suman al mismo grupo de "estudiantes
      //    vinculados" para el promedio de calificación, junto a los de
      //    solicitudes_practicas.
      const asigSnap = await db.collection("asignaciones_cupo").get();
      asigSnap.docs.forEach((doc) => {
        const a = doc.data() ?? {};
        if (asString(a.estado) !== "tomado") return;
        registrarEstudiante(asString(a.empresaId), asString(a.universidadId), asString(a.estudianteId));
      });

      // 2) Calificación de cada estudiante involucrado (una sola tanda de
      //    lecturas por lote, sin restricción de dueño porque corre con Admin SDK).
      const todosLosIds = new Set<string>();
      estudiantesDeEmpresa.forEach((set) => set.forEach((id) => todosLosIds.add(id)));
      estudiantesDeUni.forEach((set) => set.forEach((id) => todosLosIds.add(id)));

      const calificacionPorEstudiante = new Map<string, number>();
      const idsArr = [...todosLosIds];
      for (let i = 0; i < idsArr.length; i += 300) {
        const chunk = idsArr.slice(i, i + 300);
        if (chunk.length === 0) continue;
        const snaps = await db.getAll(
          ...chunk.map((id) => db.collection("perfiles_estudiantes").doc(id)),
        );
        snaps.forEach((snap) => {
          if (!snap.exists) return;
          const data = snap.data() ?? {};
          // Sin ninguna calificación recibida, el estudiante NO entra al
          // promedio — no hay dato real que arrastrarlo a la baja.
          if ((Number(data.calificaciones_recibidas) || 0) > 0) {
            calificacionPorEstudiante.set(snap.id, Number(data.calificacion_promedio) || 0);
          }
        });
      }

      const promedioDe = (ids: Set<string> | undefined): number | null => {
        if (!ids || ids.size === 0) return null;
        const vals = [...ids]
          .map((id) => calificacionPorEstudiante.get(id))
          .filter((v): v is number => v !== undefined);
        if (vals.length === 0) return null;
        return vals.reduce((a, b) => a + b, 0) / vals.length;
      };

      // 3) Escribe el agregado completo (reemplaza, no suma) en lotes de
      //    Firestore. `set({merge:true})` en vez de `update()`: si algún perfil
      //    ya no existiera (cuenta borrada), no debe tumbar todo el backfill.
      let batch = db.batch();
      let pendientes = 0;
      let empresasActualizadas = 0;
      let universidadesActualizadas = 0;

      const agregar = async (ref: FirebaseFirestore.DocumentReference, data: Record<string, unknown>) => {
        batch.set(ref, data, { merge: true });
        pendientes++;
        if (pendientes >= 450) {
          await batch.commit();
          batch = db.batch();
          pendientes = 0;
        }
      };

      for (const [empId, unis] of aliadosDeEmpresa.entries()) {
        await agregar(db.collection("perfiles_empresas").doc(empId), {
          aliados_universidades_ids: [...unis],
          calificacion_estudiantes_promedio: promedioDe(estudiantesDeEmpresa.get(empId)),
        });
        empresasActualizadas++;
      }
      for (const [uniId, emps] of aliadosDeUni.entries()) {
        await agregar(db.collection("perfiles_universidades").doc(uniId), {
          aliados_empresas_ids: [...emps],
          calificacion_estudiantes_promedio: promedioDe(estudiantesDeUni.get(uniId)),
        });
        universidadesActualizadas++;
      }
      if (pendientes > 0) await batch.commit();

      await safeWriteAuditLog({
        actor,
        action: "ranking.backfill",
        entityType: "solicitudes_practicas",
        entityId: "backfill",
        payload: {
          solicitudes_revisadas: solSnap.size,
          reclamos_revisados: reclamosSnap.size,
          asignaciones_revisadas: asigSnap.size,
          empresas_actualizadas: empresasActualizadas,
          universidades_actualizadas: universidadesActualizadas,
        },
      });

      return {
        ok: true,
        empresasActualizadas,
        universidadesActualizadas,
        solicitudesRevisadas: solSnap.size,
        reclamosRevisados: reclamosSnap.size,
      };
    } catch (error: any) {
      console.error("backfillAlianzasCalificaciones failed:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        `Error interno en backfillAlianzasCalificaciones: ${String(error?.message ?? error)}`,
      );
    }
  },
);

/**
 * Deshabilita una vacante/pasantía por decisión administrativa (motivo
 * obligatorio). NO es un `toggleVacante` común: además de `activa:false`,
 * marca `estado_moderacion:'deshabilitada'` para que la empresa dueña (a
 * diferencia de una pausa propia) no pueda reactivarla ella misma, y para que
 * el resto de la plataforma (que ya filtra `activa==true` en sus listados) la
 * pierda de vista automáticamente. `moderacion_notificada:false` hace que
 * `ModeracionVacanteGate` (cliente, dashboard de empresa) le muestre el aviso
 * obligatorio con el motivo la próxima vez que abra su panel.
 */
export const deshabilitarVacanteAdmin = onCall({ region: REGION }, async (req) => {
  try {
    const actor = await requireAdmin(req.auth);
    const vacanteId = asString(req.data?.vacanteId);
    const reason = asNullableString(req.data?.reason);

    if (!vacanteId) {
      throw new HttpsError("invalid-argument", "Parámetros inválidos.");
    }
    if (!reason) {
      throw new HttpsError("invalid-argument", "Debes indicar el motivo.");
    }

    const vacanteRef = db.collection("vacantes").doc(vacanteId);
    const vacanteSnap = await vacanteRef.get();
    if (!vacanteSnap.exists) {
      throw new HttpsError("not-found", "Publicación no encontrada.");
    }
    const vacanteData = vacanteSnap.data() ?? {};

    await vacanteRef.update({
      activa: false,
      estado_moderacion: "deshabilitada",
      motivo_moderacion: reason,
      moderado_por: actor.uid,
      moderado_por_email: actor.email,
      moderado_en: admin.firestore.FieldValue.serverTimestamp(),
      moderacion_notificada: false,
    });

    await safeWriteAuditLog({
      actor,
      action: "vacante.moderacion.deshabilitar",
      entityType: "vacantes",
      entityId: vacanteId,
      payload: {
        reason,
        titulo: asNullableString(vacanteData.titulo),
        empresa_id: asNullableString(vacanteData.empresa_id),
      },
    });

    return { ok: true, id: vacanteId };
  } catch (error: any) {
    console.error("deshabilitarVacanteAdmin failed:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError(
      "internal",
      `Error interno en deshabilitarVacanteAdmin: ${String(error?.message ?? error)}`,
    );
  }
});

/**
 * Elimina (lógicamente) una vacante/pasantía por decisión administrativa.
 * Deliberadamente NO es un `deleteDoc`: otras colecciones (aplicaciones,
 * aplicaciones_grupos, reclamos_cupos, chats, evaluaciones) referencian su id,
 * y borrar el documento real las dejaría huérfanas. En vez de eso, el
 * documento queda marcado `estado_moderacion:'eliminada'` + `activa:false` —
 * invisible para TODOS (incluida la propia empresa, a diferencia de
 * 'deshabilitada') pero sin romper referencias existentes.
 */
export const eliminarVacanteAdmin = onCall({ region: REGION }, async (req) => {
  try {
    const actor = await requireAdmin(req.auth);
    const vacanteId = asString(req.data?.vacanteId);
    const reason = asNullableString(req.data?.reason);

    if (!vacanteId) {
      throw new HttpsError("invalid-argument", "Parámetros inválidos.");
    }
    if (!reason) {
      throw new HttpsError("invalid-argument", "Debes indicar el motivo.");
    }

    const vacanteRef = db.collection("vacantes").doc(vacanteId);
    const vacanteSnap = await vacanteRef.get();
    if (!vacanteSnap.exists) {
      throw new HttpsError("not-found", "Publicación no encontrada.");
    }
    const vacanteData = vacanteSnap.data() ?? {};

    await vacanteRef.update({
      activa: false,
      estado_moderacion: "eliminada",
      motivo_moderacion: reason,
      moderado_por: actor.uid,
      moderado_por_email: actor.email,
      moderado_en: admin.firestore.FieldValue.serverTimestamp(),
      moderacion_notificada: false,
    });

    await safeWriteAuditLog({
      actor,
      action: "vacante.moderacion.eliminar",
      entityType: "vacantes",
      entityId: vacanteId,
      payload: {
        reason,
        titulo: asNullableString(vacanteData.titulo),
        empresa_id: asNullableString(vacanteData.empresa_id),
      },
    });

    return { ok: true, id: vacanteId };
  } catch (error: any) {
    console.error("eliminarVacanteAdmin failed:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError(
      "internal",
      `Error interno en eliminarVacanteAdmin: ${String(error?.message ?? error)}`,
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
