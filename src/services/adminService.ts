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
