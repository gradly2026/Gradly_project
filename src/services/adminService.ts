import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../config/firebaseConfig";

export type AdminRole = "admin" | "universidad" | "empresa" | "estudiante";
export type AdminStatus = "active" | "pending" | "inactive";
export type ApprovalStatus = "active" | "pending" | "inactive";

type SetUserRoleInput = {
  targetUid: string;
  nextRole: AdminRole;
  reason?: string;
};

type SetUserRoleOutput = {
  ok: boolean;
  uid: string;
  role: AdminRole;
  claimsSynced: boolean;
};

type SetUserStatusInput = {
  targetUid: string;
  nextStatus: AdminStatus;
  reason?: string;
};

type SetUserStatusOutput = {
  ok: boolean;
  uid: string;
  status: AdminStatus;
  activo: boolean;
};

type SetUserApprovalInput = {
  targetUid: string;
  nextApprovalStatus: ApprovalStatus;
  reason?: string;
};

type SetUserApprovalOutput = {
  ok: boolean;
  uid: string;
  approvalStatus: ApprovalStatus;
  status: AdminStatus;
  activo: boolean;
};

type SetUserBanInput = {
  targetUid: string;
  banned: boolean;
  reason?: string;
};

type SetUserBanOutput = {
  ok: boolean;
  uid: string;
  banned: boolean;
  status: AdminStatus;
  activo: boolean;
};

export type ReportStatus = "abierto" | "en_investigacion" | "resuelto";

type ResolveReportInput = {
  reportId: string;
  nextStatus: ReportStatus;
  resolution?: string;
};

type ResolveReportOutput = {
  ok: boolean;
  id: string;
  status: ReportStatus;
  resolution: string | null;
};

type DeleteUserCompleteInput = {
  targetUid: string;
  reason?: string;
};

type DeleteUserCompleteOutput = {
  ok: boolean;
  uid: string;
};

type ModerarVacanteInput = {
  vacanteId: string;
  reason: string;
};

type ModerarVacanteOutput = {
  ok: boolean;
  id: string;
};

type BackfillAlianzasOutput = {
  ok: boolean;
  empresasActualizadas: number;
  universidadesActualizadas: number;
  solicitudesRevisadas: number;
  reclamosRevisados: number;
};

export type SaludAsistenciaOutput = {
  terminacionesAnticipadas30d: number;
  incidenciasTardanzaAbiertas: number;
};

type ObtenerAsistenciaPasantiaAdminInput = {
  estudianteId: string;
  empresaId: string;
};

/** Un día programado que se marcó como "no computado" (ver ajusteAsistenciaService). */
export type DiaNoComputadoAdmin = {
  fecha: string;
  categoria: string;
  motivo: string;
};

export type AsistenciaPasantiaAdminOutput =
  | { encontrada: false }
  | {
      encontrada: true;
      asignacionId: string;
      vacanteTitulo: string;
      estado: "tomado" | "cancelado";
      finalizada: boolean;
      fechaPresentacion: string | null;
      horasCumplidas: number | null;
      terminacionAnticipada: boolean;
      finPor: "empresa" | "estudiante" | null;
      gravedad: "leve" | "moderada" | "grave" | null;
      motivoFin: string | null;
      diasNoComputados: DiaNoComputadoAdmin[];
    };

const functions = getFunctions(app, "us-central1");

const _setUserRole = httpsCallable<SetUserRoleInput, SetUserRoleOutput>(
  functions,
  "setUserRole",
);

const _setUserStatus = httpsCallable<SetUserStatusInput, SetUserStatusOutput>(
  functions,
  "setUserStatus",
);
const _setUserApproval = httpsCallable<
  SetUserApprovalInput,
  SetUserApprovalOutput
>(functions, "setUserApproval");
const _setUserBan = httpsCallable<SetUserBanInput, SetUserBanOutput>(
  functions,
  "setUserBan",
);
const _resolveReport = httpsCallable<ResolveReportInput, ResolveReportOutput>(
  functions,
  "resolveReport",
);
const _deleteUserComplete = httpsCallable<
  DeleteUserCompleteInput,
  DeleteUserCompleteOutput
>(functions, "deleteUserComplete");
const _backfillAlianzasCalificaciones = httpsCallable<void, BackfillAlianzasOutput>(
  functions,
  "backfillAlianzasCalificaciones",
);
const _obtenerSaludAsistencia = httpsCallable<void, SaludAsistenciaOutput>(
  functions,
  "obtenerSaludAsistencia",
);
const _obtenerAsistenciaPasantiaAdmin = httpsCallable<
  ObtenerAsistenciaPasantiaAdminInput,
  AsistenciaPasantiaAdminOutput
>(functions, "obtenerAsistenciaPasantiaAdmin");
const _deshabilitarVacanteAdmin = httpsCallable<ModerarVacanteInput, ModerarVacanteOutput>(
  functions,
  "deshabilitarVacanteAdmin",
);
const _eliminarVacanteAdmin = httpsCallable<ModerarVacanteInput, ModerarVacanteOutput>(
  functions,
  "eliminarVacanteAdmin",
);

export async function setUserRole(input: SetUserRoleInput): Promise<SetUserRoleOutput> {
  const res = await _setUserRole(input);
  return res.data;
}

export async function setUserStatus(
  input: SetUserStatusInput,
): Promise<SetUserStatusOutput> {
  const res = await _setUserStatus(input);
  return res.data;
}

export async function setUserApproval(
  input: SetUserApprovalInput,
): Promise<SetUserApprovalOutput> {
  const res = await _setUserApproval(input);
  return res.data;
}

export async function setUserBan(input: SetUserBanInput): Promise<SetUserBanOutput> {
  const res = await _setUserBan(input);
  return res.data;
}

export async function resolveReport(
  input: ResolveReportInput,
): Promise<ResolveReportOutput> {
  const res = await _resolveReport(input);
  return res.data;
}

export async function deleteUserComplete(
  input: DeleteUserCompleteInput,
): Promise<DeleteUserCompleteOutput> {
  const res = await _deleteUserComplete(input);
  return res.data;
}

/** Backfill de una sola vez: recalcula alianzas + calificación promedio de
 * TODAS las empresas/universidades a partir del historial completo. Ver
 * `functions/src/admin.ts` — solo admin puede invocarlo. */
export async function backfillAlianzasCalificaciones(): Promise<BackfillAlianzasOutput> {
  const res = await _backfillAlianzasCalificaciones();
  return res.data;
}

/** Contadores agregados de "salud de asistencia" para el panel admin (Config).
 * Bajo demanda, no automático. Ver `functions/src/admin.ts`. */
export async function obtenerSaludAsistencia(): Promise<SaludAsistenciaOutput> {
  const res = await _obtenerSaludAsistencia();
  return res.data;
}

/** Resumen de solo lectura de la pasantía de cupo entre un estudiante y una
 * empresa (días no computados, fin anticipado) — gancho de contexto desde el
 * detalle de un Reporte/Incidencia escalada. Ver `functions/src/admin.ts`. */
export async function obtenerAsistenciaPasantiaAdmin(
  input: ObtenerAsistenciaPasantiaAdminInput,
): Promise<AsistenciaPasantiaAdminOutput> {
  const res = await _obtenerAsistenciaPasantiaAdmin(input);
  return res.data;
}

/** Deshabilita una vacante/pasantía (motivo obligatorio); la empresa dueña no
 * puede reactivarla. Ver `functions/src/admin.ts`. */
export async function deshabilitarVacanteAdmin(
  input: ModerarVacanteInput,
): Promise<ModerarVacanteOutput> {
  const res = await _deshabilitarVacanteAdmin(input);
  return res.data;
}

/** Elimina lógicamente una vacante/pasantía (motivo obligatorio): deja de
 * verse para todos, incluida la empresa dueña. Ver `functions/src/admin.ts`. */
export async function eliminarVacanteAdmin(
  input: ModerarVacanteInput,
): Promise<ModerarVacanteOutput> {
  const res = await _eliminarVacanteAdmin(input);
  return res.data;
}
