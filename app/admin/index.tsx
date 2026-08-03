import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { AutoText as Text, AutoTextInput as TextInput } from "../../src/components/AutoText";
import ProfileViewerModal, { type ProfileTipo } from "../../src/components/ProfileViewerModal";
import { signOut } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "../../src/config/firebaseConfig";
import { useAuth } from "../../src/context/AuthContext";
import {
  deleteUserComplete as deleteUserCompleteAction,
  resolveReport as resolveReportAction,
  setUserApproval as setUserApprovalAction,
  setUserBan as setUserBanAction,
  setUserRole as setUserRoleAction,
  setUserStatus as setUserStatusAction,
} from "../../src/services/adminService";
import { useTranslation } from "../../src/context/TranslationContext";
import { useAuthGuard } from "../../src/hooks/useAuthGuard";
import { translateSync } from "../../src/services/translationService";
import { useAdminTheme } from "../../src/styles/adminStyles";

// Convierte un Timestamp de Firestore (o string) a ISO para los tipos del panel.
const tsToIso = (v: any): string => {
  if (!v) return "";
  if (typeof v?.toDate === "function") return v.toDate().toISOString();
  if (typeof v === "string") return v;
  return "";
};

type AdminPage = "resumen" | "aprobaciones" | "usuarios" | "reportes" | "notificaciones" | "roles" | "logs" | "config";
type Role = "admin" | "universidad" | "empresa" | "estudiante";
type PermissionRole = Exclude<Role, "estudiante">;
type Status = "active" | "pending" | "inactive";
type ApprovalStatus = "active" | "pending" | "inactive";

type AdminUser = {
  id: string;
  role: Role;
  status: Status;
  approval_status: ApprovalStatus;
  banned: boolean;
  nombre: string;
  email: string;
  username: string;
  telefono?: string | null;
  departamento?: string | null;
  ciudad?: string | null;
  ban_reason?: string | null;
  created_at?: string | null;
};

type AuditLog = {
  id: string;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  payload: any;
  created_at: string;
};

type AdminNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
};

type Permission = {
  key: string;
  label: string;
  group_name: string | null;
  description: string | null;
};

type PlatformMetrics = {
  vacantesPublicadas: number;
  aplicacionesTotal: number;
  txCompletadas: number;
  reportesAbiertos: number;
};

type RecentOpenReport = {
  id: string;
  motivo: string;
  tipo: string;
  descripcion: string;
  estado: string;
  created_at: string;
};

type ReportCaseStatus = "abierto" | "en_investigacion" | "resuelto";

type ReportCase = {
  id: string;
  motivo: string;
  tipo: string;
  descripcion: string;
  estado: ReportCaseStatus;
  reportado_id: string | null;
  reportante_id: string | null;
  resolucion?: string | null;
  created_at: string;
};

type DataIssueKey = "usuarios" | "metricas" | "logs" | "notificaciones" | "permisos";

const ROLE_ORDER: Role[] = ["admin", "universidad", "empresa", "estudiante"];
const PERMISSION_ROLES: PermissionRole[] = ["admin", "universidad", "empresa"];

function normalizeRole(value: unknown): Role {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "admin" || raw === "universidad" || raw === "empresa" || raw === "estudiante") {
    return raw;
  }
  if (raw === "talento" || raw === "alumno" || raw === "joventalento") {
    return "estudiante";
  }
  return "estudiante";
}

function normalizeStatus(value: unknown, activo: unknown): Status {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "pending") return "pending";
  if (
    raw === "inactive" ||
    raw === "offline" ||
    raw === "blocked" ||
    raw === "disabled"
  ) {
    return "inactive";
  }
  if (raw === "active" || raw === "online") return "active";
  return activo === false ? "inactive" : "active";
}

function normalizeApprovalStatus(value: unknown, activo: unknown): ApprovalStatus {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "pending") return "pending";
  if (
    raw === "inactive" ||
    raw === "blocked" ||
    raw === "disabled"
  ) {
    return "inactive";
  }
  if (raw === "active") return "active";
  return activo === false ? "inactive" : "active";
}

function roleRequiresApproval(role: Role): boolean {
  return role === "empresa" || role === "universidad";
}

function adminDataErrorMessage(error: any, subject: string): string {
  const code = String(error?.code ?? "").replace(/^functions\//, "");
  if (code === "permission-denied") return `Sin permisos para ${subject}.`;
  if (code === "failed-precondition") {
    return `Falta un indice o configuracion de Firestore para ${subject}.`;
  }
  if (code === "unauthenticated") return `Debes iniciar sesion para ${subject}.`;
  if (code === "invalid-argument") return `Datos invalidos para ${subject}.`;
  if (code === "not-found") return `No se encontro la informacion para ${subject}.`;
  if (code === "unavailable") return `Firestore no esta disponible para ${subject}.`;
  return `No se pudo cargar ${subject}.`;
}

function adminDetailedErrorMessage(error: any, subject: string): string {
  const base = adminDataErrorMessage(error, subject);
  const rawMessage = String(error?.message ?? "").trim();
  const rawDetails =
    typeof error?.details === "string"
      ? error.details.trim()
      : error?.details != null
        ? JSON.stringify(error.details)
        : "";

  const extras = [rawMessage, rawDetails]
    .filter((value) => value && value !== base)
    .join("\n");

  return extras ? `${base}\n\nDetalle: ${extras}` : base;
}

function showAdminAlert(title: string, message: string) {
  // En web, `Alert.alert` puede no mostrarse según el runtime. Usamos fallback.
  if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.alert === "function") {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

function Badge({ label, type }: { label: string; type: Status }) {
  const { C, s } = useAdminTheme();
  const map: Record<Status, { bg: string; border: string; text: string }> = {
    active: {
      bg: C.greenBg,
      border: "rgba(52,211,153,0.30)",
      text: C.green,
    },
    pending: {
      bg: C.yellowBg,
      border: "rgba(245,158,11,0.30)",
      text: C.yellow,
    },
    inactive: {
      bg: C.redBg,
      border: "rgba(239,68,68,0.30)",
      text: "rgba(252,165,165,1)",
    },
  };
  const col = map[type];
  return (
    <View style={[s.badge, { backgroundColor: col.bg, borderColor: col.border }]}>
      <Text style={[s.badgeText, { color: col.text }]}>{label}</Text>
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { s } = useAdminTheme();
  return (
    <TouchableOpacity
      style={[s.chip, active && s.chipActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  const { s } = useAdminTheme();
  return <View style={[s.card, style]}>{children}</View>;
}

export default function AdminPreview() {
  useAuthGuard("admin");
  const { C, s, isDark, toggleTheme } = useAdminTheme();
  const { t, language, toggleLanguage } = useTranslation();
  const { rol, isLoading, refreshProfile, logout } = useAuth();
  const { width } = useWindowDimensions();
  const isCompact = width < 560;
  const isPhone = width < 768;
  const isWide = width >= 900;
  const isDesktop = width >= 1200;
  const isTablet = width >= 768 && width < 1200;
  const [showAccessRecovery, setShowAccessRecovery] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  const [page, setPage] = useState<AdminPage>("resumen");

  const [roleTab, setRoleTab] = useState<Role>("estudiante");
  const [statusFilter, setStatusFilter] = useState<Status | "todos">("todos");
  const [approvalRoleFilter, setApprovalRoleFilter] = useState<"todos" | "empresa" | "universidad">("todos");
  const [approvalStatusFilter, setApprovalStatusFilter] = useState<ApprovalStatus | "todos">("pending");
  const [search, setSearch] = useState("");

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersRefreshing, setUsersRefreshing] = useState(false);
  const [platformLoading, setPlatformLoading] = useState(true);
  const [platformMetrics, setPlatformMetrics] = useState<PlatformMetrics>({
    vacantesPublicadas: 0,
    aplicacionesTotal: 0,
    txCompletadas: 0,
    reportesAbiertos: 0,
  });
  const [recentOpenReports, setRecentOpenReports] = useState<RecentOpenReport[]>(
    [],
  );
  const [reportCases, setReportCases] = useState<ReportCase[]>([]);
  const [reportStatusFilter, setReportStatusFilter] = useState<ReportCaseStatus | "todos">(
    "todos",
  );

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsAttempted, setLogsAttempted] = useState(false);

  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsAttempted, setNotificationsAttempted] = useState(false);

  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<Set<string>>(new Set());
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [permissionsLoadedRole, setPermissionsLoadedRole] = useState<PermissionRole | null>(null);

  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [verPerfilPublico, setVerPerfilPublico] = useState<{ tipo: ProfileTipo; id: string } | null>(null);
  // Cierra el modal de gestión (el que esté abierto: detalle de usuario o de
  // reporte) antes de abrir el visor público: dos `Modal` nativos presentados
  // a la vez fallan silenciosamente en iOS si uno se está cerrando justo
  // cuando el otro se abre.
  const abrirPerfilPublico = (role: Role, id: string) => {
    if (role === "admin") return;
    setDetailOpen(false);
    setReportDetailOpen(false);
    setTimeout(() => setVerPerfilPublico({ tipo: role, id }), Platform.OS === "ios" ? 350 : 0);
  };
  const [selectedReport, setSelectedReport] = useState<ReportCase | null>(null);
  const [reportDetailOpen, setReportDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editNombre, setEditNombre] = useState("");
  const [editTelefono, setEditTelefono] = useState("");
  const [editDepartamento, setEditDepartamento] = useState("");
  const [editCiudad, setEditCiudad] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [userActionSaving, setUserActionSaving] = useState(false);
  const [reportActionSaving, setReportActionSaving] = useState(false);
  const [banReason, setBanReason] = useState("");
  const [approvalReason, setApprovalReason] = useState("");
  const [reportResolution, setReportResolution] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [meName, setMeName] = useState("Administrador");
  const [meEmail, setMeEmail] = useState<string | null>(null);
  const [dataIssues, setDataIssues] = useState<Partial<Record<DataIssueKey, string>>>({});

  const gradlyLogo = require("../../assets/images/LogoGradly.png");
  const empresaLogo = require("../../assets/images/logo.png");

  const labelRole = (r: Role) =>
    r === "admin"
      ? "Admin"
      : r === "universidad"
        ? "Universidad"
        : r === "empresa"
          ? "Empresa"
          : "Estudiante";

  const labelStatus = (st: Status | "todos") =>
    st === "todos" ? "Todos" : st === "active" ? "Activo" : st === "pending" ? "Pendiente" : "Inactivo";

  const statusBadgeLabel = (st: Status) => (st === "active" ? "Activo" : st === "pending" ? "Pendiente" : "Inactivo");
  const dataIssueList = useMemo(() => Object.values(dataIssues), [dataIssues]);

  const setDataIssue = useCallback((key: DataIssueKey, message?: string | null) => {
    setDataIssues((prev) => {
      const next = { ...prev };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });
  }, []);

  const formatDaysAgo = (iso: string) => {
    if (!iso) return "Fecha no disponible";
    const target = new Date(iso);
    if (Number.isNaN(target.getTime())) return "Fecha no disponible";
    const diff = Math.floor((Date.now() - target.getTime()) / 86_400_000);
    if (diff <= 0) return "Hoy";
    if (diff === 1) return "Hace 1 dia";
    return `Hace ${diff} dias`;
  };

  const openDetail = (u: AdminUser) => {
    setSelected(u);
    setBanReason(u.ban_reason ?? "");
    setApprovalReason("");
    setDetailOpen(true);
  };

  const openEdit = (u: AdminUser) => {
    setSelected(u);
    setEditNombre(u.nombre ?? "");
    setEditTelefono((u.telefono ?? "") as any);
    setEditDepartamento((u.departamento ?? "") as any);
    setEditCiudad((u.ciudad ?? "") as any);
    setEditOpen(true);
  };

  const openReportDetail = (report: ReportCase) => {
    setSelectedReport(report);
    setReportResolution(report.resolucion ?? "");
    setReportDetailOpen(true);
  };

  const navigateToUserList = useCallback(
    (options?: {
      role?: Role;
      status?: Status | "todos";
      search?: string;
      user?: AdminUser | null;
    }) => {
      setPage("usuarios");
      setRoleTab(options?.role ?? "estudiante");
      setStatusFilter(options?.status ?? "todos");
      setSearch(options?.search ?? "");
      setDetailOpen(false);
      setEditOpen(false);
      if (options?.user) {
        setSelected(options.user);
        setDetailOpen(true);
      }
    },
    [],
  );

  const navigateToReportList = useCallback(
    (options?: { status?: ReportCaseStatus | "todos"; report?: ReportCase | null }) => {
      setPage("reportes");
      setReportStatusFilter(options?.status ?? "todos");
      setReportDetailOpen(false);
      if (options?.report) {
        setSelectedReport(options.report);
        setReportDetailOpen(true);
      }
    },
    [],
  );

  const logAction = useCallback(
    async (action: string, entityType: string, entityId: string | null, payload: any) => {
      try {
        const current = auth.currentUser;
        await addDoc(collection(db, "audit_logs"), {
          actor_email: current?.email ?? null,
          actor_id: current?.uid ?? null,
          action,
          entity_type: entityType,
          entity_id: entityId,
          payload,
          created_at: serverTimestamp(),
        });
      } catch {
      }
    },
    [],
  );

  const fetchUsers = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, "usuarios"));
      const mapped: AdminUser[] = snap.docs.map((d) => {
        const r: any = d.data();
        const role = normalizeRole(r.rol);
        const approval_status = normalizeApprovalStatus(r.approval_status, r.activo);
        const status = roleRequiresApproval(role) && approval_status === "pending"
          ? "pending"
          : normalizeStatus(r.status, r.activo);
        return {
          id: d.id,
          role,
          status,
          approval_status,
          banned: Boolean(r.baneado),
          nombre: r.nombre_completo ?? r.nombre ?? "",
          email: r.correo ?? r.email ?? "",
          username: r.username ?? "",
          telefono: r.telefono ?? null,
          departamento: r.departamento ?? null,
          ciudad: r.ciudad ?? null,
          ban_reason: r.motivo_baneo ?? null,
          created_at: tsToIso(r.fecha_registro),
        };
      });
      mapped.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
      setUsers(mapped);
      setDataIssue("usuarios", null);
    } catch (error) {
      setUsers([]);
      setDataIssue("usuarios", adminDataErrorMessage(error, "usuarios del panel"));
    }
  }, [setDataIssue]);

  const refreshUsers = useCallback(async () => {
    setUsersRefreshing(true);
    await fetchUsers();
    setUsersRefreshing(false);
  }, [fetchUsers]);

  const fetchPlatformMetrics = useCallback(async () => {
    setPlatformLoading(true);
    try {
      const [vacantesRes, aplicacionesRes, transaccionesRes, reportesRes] =
        await Promise.allSettled([
          getDocs(collection(db, "vacantes")),
          getDocs(collection(db, "aplicaciones")),
          getDocs(collection(db, "transacciones")),
          getDocs(collection(db, "reportes")),
        ]);

      const issues: string[] = [];
      const vacantesSnap = vacantesRes.status === "fulfilled" ? vacantesRes.value : null;
      const aplicacionesSnap =
        aplicacionesRes.status === "fulfilled" ? aplicacionesRes.value : null;
      const transaccionesSnap =
        transaccionesRes.status === "fulfilled" ? transaccionesRes.value : null;
      const reportesSnap = reportesRes.status === "fulfilled" ? reportesRes.value : null;

      if (!vacantesSnap) issues.push("vacantes");
      if (!aplicacionesSnap) issues.push("aplicaciones");
      if (!transaccionesSnap) issues.push("transacciones");
      if (!reportesSnap) issues.push("reportes");

      const vacantesPublicadas = (vacantesSnap?.docs ?? []).filter(
        (d) => !!(d.data() as any).activa,
      ).length;

      const txCompletadas = (transaccionesSnap?.docs ?? []).filter((d) => {
        const estado = String((d.data() as any).estado ?? "").toLowerCase();
        return estado === "completado";
      }).length;

      const mappedReports: ReportCase[] = (reportesSnap?.docs ?? [])
        .map((d) => {
          const data = d.data() as any;
          const rawEstado = String(data.estado ?? "").toLowerCase();
          const estado: ReportCaseStatus =
            rawEstado === "resuelto"
              ? "resuelto"
              : rawEstado === "en_investigacion"
                ? "en_investigacion"
                : "abierto";
          return {
            id: d.id,
            motivo: String(data.motivo ?? "Reporte sin motivo"),
            tipo: String(data.tipo ?? "general"),
            descripcion: String(data.descripcion ?? ""),
            estado,
            reportado_id: data.reportado_id ? String(data.reportado_id) : null,
            reportante_id: data.reportante_id ? String(data.reportante_id) : null,
            resolucion: data.resolucion ? String(data.resolucion) : null,
            created_at: tsToIso(data.fecha),
          };
        })
        .sort((a, b) => b.created_at.localeCompare(a.created_at));

      const reportesAbiertos = mappedReports.filter(
        (item) => item.estado === "abierto",
      ).length;

      const latestOpenReports: RecentOpenReport[] = mappedReports
        .filter((item) => item.estado === "abierto")
        .slice(0, 4);

      setPlatformMetrics({
        vacantesPublicadas,
        aplicacionesTotal: aplicacionesSnap?.size ?? 0,
        txCompletadas,
        reportesAbiertos,
      });
      setRecentOpenReports(latestOpenReports);
      setReportCases(mappedReports);
      setDataIssue(
        "metricas",
        issues.length
          ? `Colecciones sin acceso en el resumen: ${issues.join(", ")}.`
          : null,
      );
    } catch (error) {
      setPlatformMetrics({
        vacantesPublicadas: 0,
        aplicacionesTotal: 0,
        txCompletadas: 0,
        reportesAbiertos: 0,
      });
      setRecentOpenReports([]);
      setReportCases([]);
      setDataIssue("metricas", adminDataErrorMessage(error, "las metricas operativas"));
    } finally {
      setPlatformLoading(false);
    }
  }, [setDataIssue]);

  const refreshOverview = useCallback(async () => {
    setUsersRefreshing(true);
    await Promise.all([fetchUsers(), fetchPlatformMetrics()]);
    setUsersRefreshing(false);
  }, [fetchPlatformMetrics, fetchUsers]);

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    setLogsAttempted(true);
    try {
      let snap;
      try {
        snap = await getDocs(
          query(collection(db, "audit_logs"), orderBy("created_at", "desc"), limit(200)),
        );
      } catch (error: any) {
        if (String(error?.code ?? "") !== "failed-precondition") throw error;
        snap = await getDocs(query(collection(db, "audit_logs"), limit(200)));
      }
      const list: AuditLog[] = snap.docs.map((d) => {
        const r: any = d.data();
        return {
          id: d.id,
          actor_email: r.actor_email ?? null,
          action: r.action ?? "",
          entity_type: r.entity_type ?? "",
          entity_id: r.entity_id ?? null,
          payload: r.payload ?? null,
          created_at: tsToIso(r.created_at),
        };
      });
      list.sort((a, b) => b.created_at.localeCompare(a.created_at));
      setLogs(list);
      setDataIssue("logs", null);
    } catch (error) {
      setLogs([]);
      setDataIssue("logs", adminDataErrorMessage(error, "la bitacora administrativa"));
    } finally {
      setLogsLoading(false);
    }
  }, [setDataIssue]);

  const fetchNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    setNotificationsAttempted(true);
    try {
      let snap;
      try {
        snap = await getDocs(
          query(
            collection(db, "admin_notifications"),
            orderBy("created_at", "desc"),
            limit(200),
          ),
        );
      } catch (error: any) {
        if (String(error?.code ?? "") !== "failed-precondition") throw error;
        snap = await getDocs(
          query(collection(db, "admin_notifications"), limit(200)),
        );
      }
      const list: AdminNotification[] = snap.docs.map((d) => {
        const r: any = d.data();
        return {
          id: d.id,
          type: r.type ?? "",
          title: r.title ?? "",
          body: r.body ?? null,
          is_read: !!r.is_read,
          created_at: tsToIso(r.created_at),
        };
      });
      list.sort((a, b) => b.created_at.localeCompare(a.created_at));
      setNotifications(list);
      setDataIssue("notificaciones", null);
    } catch (error) {
      setNotifications([]);
      setDataIssue("notificaciones", adminDataErrorMessage(error, "las notificaciones administrativas"));
    } finally {
      setNotificationsLoading(false);
    }
  }, [setDataIssue]);

  const fetchPermissions = useCallback(
    async (role: PermissionRole) => {
      setPermissionsLoading(true);
      setPermissionsLoadedRole(role);
      try {
        const [permRes, rpRes] = await Promise.allSettled([
          getDocs(collection(db, "permissions")),
          getDocs(
            query(collection(db, "role_permissions"), where("role", "==", role)),
          ),
        ]);

        const issues: string[] = [];
        const permSnap = permRes.status === "fulfilled" ? permRes.value : null;
        const rpSnap = rpRes.status === "fulfilled" ? rpRes.value : null;

        if (!permSnap) issues.push("permissions");
        if (!rpSnap) issues.push("role_permissions");

        const perms: Permission[] = (permSnap?.docs ?? []).map((d) => {
          const r: any = d.data();
          return {
            key: r.key ?? d.id,
            label: r.label ?? "",
            group_name: r.group_name ?? null,
            description: r.description ?? null,
          };
        });
        perms.sort(
          (a, b) =>
            (a.group_name ?? "").localeCompare(b.group_name ?? "") ||
            a.key.localeCompare(b.key),
        );

        setPermissions(perms);
        setRolePermissions(
          new Set((rpSnap?.docs ?? []).map((d) => (d.data() as any).permission_key)),
        );
        setDataIssue(
          "permisos",
          issues.length
            ? `Colecciones sin acceso en permisos: ${issues.join(", ")}.`
            : null,
        );
      } catch (error) {
        setPermissions([]);
        setRolePermissions(new Set());
        setDataIssue("permisos", adminDataErrorMessage(error, "los permisos del panel"));
      } finally {
        setPermissionsLoading(false);
      }
    },
    [setDataIssue],
  );

  const setProfileStatus = useCallback(
    async (u: AdminUser, nextStatus: Status) => {
      if (u.status === nextStatus) return;
      try {
        const res = await setUserStatusAction({
          targetUid: u.id,
          nextStatus,
        });
        setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, status: nextStatus } : x)));
        setSelected((prev) => (prev?.id === u.id ? { ...prev, status: nextStatus } : prev));
        if (!res.ok) {
          throw new Error("No se pudo actualizar el estado.");
        }
        const msg =
          nextStatus === "active"
            ? "Usuario activado correctamente."
            : nextStatus === "pending"
              ? "Usuario marcado como pendiente."
              : "Usuario inactivado correctamente.";
        showAdminAlert("Admin", msg);
      } catch (error) {
        console.error("Admin:setProfileStatus error", error);
        showAdminAlert(
          t("admin_error_titulo"),
          translateSync(
            `${adminDetailedErrorMessage(error, "actualizar el estado del usuario")}\n\nCódigo: ${String((error as any)?.code ?? "desconocido")}`,
          ),
        );
      }
    },
    [t],
  );

  const setProfileApproval = useCallback(
    async (u: AdminUser, nextApprovalStatus: ApprovalStatus) => {
      if (!roleRequiresApproval(u.role)) {
        Alert.alert(t('admin_error_titulo'), "Solo empresa y universidad usan este flujo de aprobación.");
        return;
      }
      if (u.approval_status === nextApprovalStatus) return;
      setUserActionSaving(true);
      try {
        const reason = approvalReason.trim() || undefined;
        const res = await setUserApprovalAction({
          targetUid: u.id,
          nextApprovalStatus,
          reason,
        });
        if (!res.ok) {
          throw new Error("No se pudo actualizar la aprobación.");
        }
        setUsers((prev) =>
          prev.map((item) =>
            item.id === u.id
              ? {
                  ...item,
                  approval_status: res.approvalStatus,
                  status: res.status,
                }
              : item,
          ),
        );
        setSelected((prev) =>
          prev?.id === u.id
            ? {
                ...prev,
                approval_status: res.approvalStatus,
                status: res.status,
              }
            : prev,
        );
        if (nextApprovalStatus !== "inactive") setApprovalReason("");
        await refreshOverview();
        showAdminAlert(
          "Admin",
          nextApprovalStatus === "active"
            ? "Cuenta aprobada correctamente."
            : nextApprovalStatus === "pending"
              ? "La cuenta volvió a revisión pendiente."
              : "La cuenta fue rechazada correctamente.",
        );
      } catch (error) {
        console.error("Admin:setProfileApproval error", error);
        showAdminAlert(
          t("admin_error_titulo"),
          translateSync(
            `${adminDetailedErrorMessage(error, "actualizar la aprobación del usuario")}\n\nCódigo: ${String((error as any)?.code ?? "desconocido")}`,
          ),
        );
      } finally {
        setUserActionSaving(false);
      }
    },
    [approvalReason, refreshOverview, t],
  );

  const setProfileRole = useCallback(
    async (u: AdminUser, nextRole: Role) => {
      if (u.role === nextRole) return;
      try {
        const res = await setUserRoleAction({
          targetUid: u.id,
          nextRole,
        });
        setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role: nextRole } : x)));
        setSelected((prev) => (prev?.id === u.id ? { ...prev, role: nextRole } : prev));
        if (!res.ok) {
          throw new Error("No se pudo actualizar el rol.");
        }
      } catch (error) {
        Alert.alert(t('admin_error_titulo'), translateSync(adminDataErrorMessage(error, "actualizar el rol del usuario")));
      }
    },
    [t],
  );

  const togglePermission = useCallback(
    async (role: PermissionRole, permissionKey: string) => {
      const has = rolePermissions.has(permissionKey);
      try {
        if (has) {
          // Borrar los documentos role_permissions que coincidan con role + key.
          const dupSnap = await getDocs(
            query(
              collection(db, "role_permissions"),
              where("role", "==", role),
              where("permission_key", "==", permissionKey),
            ),
          );
          await Promise.all(dupSnap.docs.map((d) => deleteDoc(d.ref)));
          setRolePermissions((prev) => {
            const next = new Set(prev);
            next.delete(permissionKey);
            return next;
          });
          await logAction("role_permissions.delete", "role_permissions", null, { role, permission_key: permissionKey });
        } else {
          await addDoc(collection(db, "role_permissions"), {
            role,
            permission_key: permissionKey,
          });
          setRolePermissions((prev) => new Set(prev).add(permissionKey));
          await logAction("role_permissions.insert", "role_permissions", null, { role, permission_key: permissionKey });
        }
      } catch (error) {
        Alert.alert(t('admin_error_titulo'), translateSync(adminDataErrorMessage(error, "actualizar el permiso")));
      }
    },
    [logAction, rolePermissions],
  );

  const markAllNotificationsRead = useCallback(async () => {
    try {
      const ids = notifications.filter((n) => !n.is_read).map((n) => n.id);
      if (ids.length === 0) return;
      await Promise.all(
        ids.map((id) =>
          updateDoc(doc(db, "admin_notifications", id), { is_read: true }),
        ),
      );
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      await logAction("admin_notifications.read_all", "admin_notifications", null, { count: ids.length });
    } catch (error) {
      Alert.alert(t('admin_error_titulo'), translateSync(adminDataErrorMessage(error, "marcar las notificaciones como leidas")));
    }
  }, [logAction, notifications]);

  const saveEdit = useCallback(async () => {
    if (!selected) return;
    setEditSaving(true);
    try {
      const patch = {
        nombre: editNombre.trim(),
        telefono: editTelefono.trim() || null,
        departamento: editDepartamento.trim() || null,
        ciudad: editCiudad.trim() || null,
      };
      await updateDoc(doc(db, "usuarios", selected.id), {
        nombre_completo: patch.nombre,
        telefono: patch.telefono,
        departamento: patch.departamento,
        ciudad: patch.ciudad,
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === selected.id
            ? {
                ...u,
                nombre: patch.nombre,
                telefono: patch.telefono,
                departamento: patch.departamento,
                ciudad: patch.ciudad,
              }
            : u,
        ),
      );
      setSelected((prev) =>
        prev?.id === selected.id
          ? {
              ...prev,
              nombre: patch.nombre,
              telefono: patch.telefono,
              departamento: patch.departamento,
              ciudad: patch.ciudad,
            }
          : prev,
      );
      setEditOpen(false);
      await logAction("profile.update", "usuarios", selected.id, patch);
    } catch (error) {
      Alert.alert(t('admin_error_titulo'), translateSync(adminDataErrorMessage(error, "guardar el perfil")));
    } finally {
      setEditSaving(false);
    }
  }, [editCiudad, editDepartamento, editNombre, editTelefono, logAction, selected]);

  const setProfileBan = useCallback(
    async (u: AdminUser, banned: boolean) => {
      if (banned && !banReason.trim()) {
        Alert.alert(t('admin_error_titulo'), "Indica el motivo del baneo.");
        return;
      }
      setUserActionSaving(true);
      try {
        const res = await setUserBanAction({
          targetUid: u.id,
          banned,
          reason: banned ? banReason.trim() : undefined,
        });
        if (!res.ok) {
          throw new Error("No se pudo actualizar el baneo.");
        }
        setUsers((prev) =>
          prev.map((item) =>
            item.id === u.id
              ? {
                  ...item,
                  banned,
                  ban_reason: banned ? banReason.trim() : null,
                  status: res.status,
                }
              : item,
          ),
        );
        setSelected((prev) =>
          prev?.id === u.id
            ? {
                ...prev,
                banned,
                ban_reason: banned ? banReason.trim() : null,
                status: res.status,
              }
            : prev,
        );
        if (!banned) setBanReason("");
        await refreshOverview();
        showAdminAlert("Admin", banned ? "Usuario baneado correctamente." : "Usuario reactivado correctamente.");
      } catch (error) {
        console.error("Admin:setProfileBan error", error);
        showAdminAlert(
          t("admin_error_titulo"),
          translateSync(
            `${adminDetailedErrorMessage(error, banned ? "banear el usuario" : "reactivar el usuario")}\n\nCódigo: ${String((error as any)?.code ?? "desconocido")}`,
          ),
        );
      } finally {
        setUserActionSaving(false);
      }
    },
    [banReason, refreshOverview, t],
  );

  const confirmBanToggle = useCallback(
    (u: AdminUser, banned: boolean) => {
      Alert.alert(
        banned ? "Banear usuario" : "Reactivar usuario",
        banned
          ? "Esta acción deshabilitará el acceso del usuario y registrará el motivo."
          : "Esta acción volverá a habilitar el acceso del usuario.",
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: banned ? "Banear" : "Reactivar",
            style: banned ? "destructive" : "default",
            onPress: () => {
              void setProfileBan(u, banned);
            },
          },
        ],
      );
    },
    [setProfileBan],
  );

  const handleDeleteUser = useCallback(
    (u: AdminUser) => {
      Alert.alert(
        "Eliminar usuario",
        "Se eliminará la cuenta de Auth y los documentos principales del usuario. Esta acción no se puede deshacer.",
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Eliminar",
            style: "destructive",
            onPress: async () => {
              setUserActionSaving(true);
              try {
                const res = await deleteUserCompleteAction({
                  targetUid: u.id,
                  reason: "Eliminado desde panel admin",
                });
                if (!res.ok) {
                  throw new Error("No se pudo eliminar el usuario.");
                }
                setUsers((prev) => prev.filter((item) => item.id !== u.id));
                setSelected(null);
                setDetailOpen(false);
                await refreshOverview();
                showAdminAlert("Admin", "Usuario eliminado correctamente.");
              } catch (error) {
                console.error("Admin:deleteUserComplete error", error);
                showAdminAlert(
                  t("admin_error_titulo"),
                  translateSync(
                    `${adminDetailedErrorMessage(error, "eliminar el usuario")}\n\nCódigo: ${String((error as any)?.code ?? "desconocido")}`,
                  ),
                );
              } finally {
                setUserActionSaving(false);
              }
            },
          },
        ],
      );
    },
    [refreshOverview, t],
  );

  const handleReportStatusChange = useCallback(
    async (report: ReportCase, nextStatus: ReportCaseStatus) => {
      if (nextStatus === "resuelto" && !reportResolution.trim()) {
        Alert.alert(t('admin_error_titulo'), "Debes escribir la resolución para cerrar el reporte.");
        return;
      }
      setReportActionSaving(true);
      try {
        const res = await resolveReportAction({
          reportId: report.id,
          nextStatus,
          resolution: reportResolution.trim() || undefined,
        });
        if (!res.ok) {
          throw new Error("No se pudo actualizar el reporte.");
        }
        setReportCases((prev) =>
          prev.map((item) =>
            item.id === report.id
              ? {
                  ...item,
                  estado: res.status,
                  resolucion: res.resolution,
                }
              : item,
          ),
        );
        setSelectedReport((prev) =>
          prev?.id === report.id
            ? {
                ...prev,
                estado: res.status,
                resolucion: res.resolution,
              }
            : prev,
        );
        await refreshOverview();
        Alert.alert("Admin", nextStatus === "resuelto" ? "Reporte resuelto correctamente." : "Reporte actualizado correctamente.");
      } catch (error) {
        Alert.alert(t('admin_error_titulo'), translateSync(adminDataErrorMessage(error, "gestionar el reporte")));
      } finally {
        setReportActionSaving(false);
      }
    },
    [refreshOverview, reportResolution, t],
  );

  useEffect(() => {
    (async () => {
      setUsersLoading(true);
      setPlatformLoading(true);
      await Promise.all([fetchUsers(), fetchPlatformMetrics()]);
      setUsersLoading(false);
      setPlatformLoading(false);
    })();
  }, [fetchPlatformMetrics, fetchUsers]);

  useEffect(() => {
    (async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;
        setMeEmail(user.email ?? null);
        const snap = await getDoc(doc(db, "usuarios", user.uid));
        const data: any = snap.exists() ? snap.data() : null;
        const nombre = data?.nombre_completo?.trim?.()
          ? String(data.nombre_completo)
          : null;
        if (nombre) setMeName(nombre);
        else if (user.email) setMeName(user.email);
      } catch {
      }
    })();
  }, []);

  useEffect(() => {
    if (page === "logs" && !logsAttempted && !logsLoading) fetchLogs();
    if (page === "notificaciones" && !notificationsAttempted && !notificationsLoading) fetchNotifications();
    if (page === "roles" && !permissionsLoading) {
      if (roleTab === "estudiante") {
        setPermissions([]);
        setRolePermissions(new Set());
        setPermissionsLoadedRole(null);
      } else if (permissionsLoadedRole !== roleTab) {
        fetchPermissions(roleTab);
      }
    }
  }, [
    fetchLogs,
    fetchNotifications,
    fetchPermissions,
    logsAttempted,
    logsLoading,
    notificationsAttempted,
    notificationsLoading,
    page,
    permissionsLoadedRole,
    permissionsLoading,
    roleTab,
  ]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (u.role !== roleTab) return false;
      if (statusFilter !== "todos" && u.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = `${u.nombre} ${u.email} ${u.username} ${u.departamento ?? ""} ${u.ciudad ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [roleTab, search, statusFilter, users]);

  const filteredReports = useMemo(() => {
    if (reportStatusFilter === "todos") return reportCases;
    return reportCases.filter((item) => item.estado === reportStatusFilter);
  }, [reportCases, reportStatusFilter]);

  const approvalQueue = useMemo(() => {
    return users
      .filter((u) => roleRequiresApproval(u.role))
      .filter((u) => approvalRoleFilter === "todos" || u.role === approvalRoleFilter)
      .filter((u) => approvalStatusFilter === "todos" || u.approval_status === approvalStatusFilter)
      .sort((a, b) => {
        if (a.approval_status !== b.approval_status) {
          if (a.approval_status === "pending") return -1;
          if (b.approval_status === "pending") return 1;
        }
        return (b.created_at ?? "").localeCompare(a.created_at ?? "");
      });
  }, [approvalRoleFilter, approvalStatusFilter, users]);

  const metrics = useMemo(() => {
    const byRole = (role: Role) => users.filter((u) => u.role === role);
    const count = (arr: AdminUser[], st: Status) => arr.filter((u) => u.status === st).length;
    return ROLE_ORDER.map((r) => {
      const arr = byRole(r);
      return {
        role: r,
        total: arr.length,
        active: count(arr, "active"),
        pending: count(arr, "pending"),
        inactive: count(arr, "inactive"),
      };
    });
  }, [users]);

  const navItems: Array<{ key: AdminPage; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
    { key: "resumen", label: "Resumen", icon: "home-outline" },
    { key: "aprobaciones", label: "Aprobaciones", icon: "checkmark-done-outline" },
    { key: "usuarios", label: "Usuarios", icon: "people-outline" },
    { key: "reportes", label: "Reportes", icon: "bar-chart-outline" },
    { key: "notificaciones", label: "Inbox", icon: "notifications-outline" },
    { key: "roles", label: "Permisos", icon: "key-outline" },
    { key: "logs", label: "Logs", icon: "receipt-outline" },
    { key: "config", label: "Config", icon: "settings-outline" },
  ];

  const navigateAdminPage = useCallback(
    (nextPage: AdminPage) => {
      setPage(nextPage);
      if (nextPage === "roles" && roleTab === "estudiante") {
        setRoleTab("admin");
        void fetchPermissions("admin");
      }
    },
    [fetchPermissions, roleTab],
  );

  const Brand = () => (
    <View style={[s.brandRow, isCompact && s.brandRowCompact]}>
      <Image
        source={gradlyLogo}
        style={[s.brandImg, isCompact && { width: 20, height: 20 }]}
        resizeMode="contain"
      />
      {!isCompact ? <View style={s.brandDivider} /> : null}
      {!isCompact ? (
        <Image source={empresaLogo} style={s.brandImgSecondary} resizeMode="contain" />
      ) : null}
    </View>
  );

  const railExpanded = !isDesktop || sidebarExpanded;

  const SidebarItems = ({ onNavigate }: { onNavigate?: () => void }) => (
    <ScrollView showsVerticalScrollIndicator contentContainerStyle={s.sidebarBody}>
      {navItems.map((it) => {
        const active = page === it.key;
        return (
          <TouchableOpacity
            key={it.key}
            style={[
              s.sidebarItem,
              !railExpanded && s.sidebarItemCollapsed,
              active && s.sidebarItemActive,
            ]}
            onPress={() => {
              navigateAdminPage(it.key);
              onNavigate?.();
            }}
            activeOpacity={0.8}
          >
            <View style={s.sidebarItemIconWrap}>
              <Ionicons name={it.icon} size={18} color={active ? C.accent70 : C.textMuted} />
            </View>
            {railExpanded ? (
              <Text style={[s.sidebarItemText, active && s.sidebarItemTextActive]}>{it.label}</Text>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  const SidebarPanel = () => (
    <Pressable
      style={s.sidebarRail}
      onHoverIn={() => isDesktop && setSidebarExpanded(true)}
      onHoverOut={() => isDesktop && setSidebarExpanded(false)}
    >
      <View style={[s.sidebarCard, !railExpanded && s.sidebarCardCollapsed]}>
        <View style={[s.sidebarHeader, !railExpanded && s.sidebarHeaderCollapsed]}>
          <View style={{ flex: 1, gap: 6 }}>
            <TouchableOpacity
              style={[s.sidebarBurger, railExpanded && s.sidebarBurgerExpanded]}
              onPress={() => setSidebarExpanded((prev) => !prev)}
              activeOpacity={0.85}
            >
              <Ionicons name="menu" size={18} color={C.text} />
              {railExpanded ? <Text style={s.sidebarBurgerText}>Menú</Text> : null}
            </TouchableOpacity>
            {railExpanded ? (
              <>
                {Brand()}
                <View>
                  <Text style={s.sidebarTitle}>{meName}</Text>
                  <Text style={s.sidebarSub}>{meEmail ?? "Administrador"}</Text>
                </View>
              </>
            ) : (
              <View style={s.sidebarLogoMini}>
                <Ionicons name="shield-checkmark-outline" size={20} color={C.accent70} />
              </View>
            )}
          </View>
        </View>
        {SidebarItems({})}
      </View>
    </Pressable>
  );

  const Drawer = () => (
    <Modal visible={drawerOpen} transparent animationType="fade" onRequestClose={() => setDrawerOpen(false)}>
      <View style={s.drawerOverlay}>
        <View
          style={[
            s.drawerPanel,
            { width: isPhone ? Math.min(width - 24, 320) : isWide ? 340 : 328 },
          ]}
        >
          <View style={s.drawerHeader}>
            <View style={{ flex: 1, gap: 6 }}>
              {Brand()}
              <View>
                <Text style={s.drawerTitle}>{meName}</Text>
                <Text style={s.drawerSub}>{meEmail ?? "Admin"}</Text>
              </View>
            </View>
            <TouchableOpacity style={s.iconBtn} onPress={() => setDrawerOpen(false)} activeOpacity={0.8}>
              <Ionicons name="close" size={20} color={C.text} />
            </TouchableOpacity>
          </View>
          {SidebarItems({ onNavigate: () => setDrawerOpen(false) })}
        </View>
        <TouchableOpacity style={s.drawerBackdrop} onPress={() => setDrawerOpen(false)} activeOpacity={1} />
      </View>
    </Modal>
  );

  const renderResumen = () => {
    const cardMinWidth = isDesktop ? "23%" : width >= 700 ? "48%" : "100%";
    return (
      <ScrollView
        showsVerticalScrollIndicator
        refreshControl={<RefreshControl refreshing={usersRefreshing} onRefresh={refreshOverview} tintColor={C.accent70} />}
      >
        <View style={s.heroPanel}>
          <View style={s.heroTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.heroEyebrow}>Centro de control</Text>
              <Text style={s.heroTitle}>Administra Gradly con una vista más clara y moderna</Text>
              <Text style={s.heroSubtitle}>
                Supervisa usuarios, incidencias, actividad y permisos desde un panel con
                jerarquía visual más marcada y accesos rápidos al trabajo más importante.
              </Text>
              <View style={s.heroBadgeRow}>
                <View style={s.heroBadge}>
                  <Text style={s.heroBadgeText}>{meName}</Text>
                </View>
                <View style={s.heroBadge}>
                  <Text style={s.heroBadgeText}>{meEmail ?? "Administrador"}</Text>
                </View>
                <View style={s.heroBadge}>
                  <Text style={s.heroBadgeText}>{`${users.length} perfiles cargados`}</Text>
                </View>
              </View>
            </View>
            <View style={s.heroActionRow}>
              <TouchableOpacity style={s.btnPrimary} onPress={refreshOverview} activeOpacity={0.85}>
                <Text style={s.btnPrimaryText}>Actualizar panel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnOutline} onPress={() => setPage("notificaciones")} activeOpacity={0.8}>
                <Text style={s.btnOutlineText}>Abrir inbox</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={s.heroMetricsRow}>
            <View style={s.heroMetricCard}>
              <Text style={s.heroMetricValue}>{users.length}</Text>
              <Text style={s.heroMetricLabel}>Perfiles visibles</Text>
              <Text style={s.heroMetricHint}>Usuarios sincronizados desde Firestore.</Text>
            </View>
            <View style={s.heroMetricCard}>
              <Text style={[s.heroMetricValue, { color: C.yellow }]}>
                {users.filter((u) => u.status === "pending").length}
              </Text>
              <Text style={s.heroMetricLabel}>Revisión pendiente</Text>
              <Text style={s.heroMetricHint}>Cuentas que requieren atención administrativa.</Text>
            </View>
            <View style={s.heroMetricCard}>
              <Text
                style={[
                  s.heroMetricValue,
                  { color: platformMetrics.reportesAbiertos > 0 ? C.red : C.green },
                ]}
              >
                {platformMetrics.reportesAbiertos}
              </Text>
              <Text style={s.heroMetricLabel}>Incidencias abiertas</Text>
              <Text style={s.heroMetricHint}>Reportes activos que siguen sin resolverse.</Text>
            </View>
          </View>
        </View>

        {usersLoading || platformLoading ? (
          <View style={{ paddingVertical: 28, alignItems: "center" }}>
            <ActivityIndicator color={C.accent70} />
            <Text style={[s.textMuted, { marginTop: 10 }]}>Cargando…</Text>
          </View>
        ) : (
          <View style={s.panelSection}>
            <View style={s.sectionPill}>
              <Text style={s.sectionPillText}>Usuarios por rol</Text>
            </View>
            <View style={s.grid2}>
            {metrics.map((m) => {
              const pendientes = m.pending;
              return (
                <TouchableOpacity
                  key={m.role}
                  style={[s.statCard, { minWidth: cardMinWidth }]}
                  onPress={() => navigateToUserList({ role: m.role, status: "todos", search: "" })}
                  activeOpacity={0.85}
                >
                  <View style={s.statCardTop}>
                    <View style={s.statIconWrap}>
                      <Ionicons
                        name={
                          m.role === "admin"
                            ? "shield-checkmark-outline"
                            : m.role === "universidad"
                              ? "school-outline"
                              : m.role === "empresa"
                                ? "business-outline"
                                : "person-outline"
                        }
                        size={20}
                        color={C.accent70}
                      />
                    </View>
                    {pendientes > 0 ? <Badge label={`${pendientes} pendientes`} type="pending" /> : null}
                  </View>
                  <Text style={s.statValue}>{m.total}</Text>
                  <Text style={s.statLabel}>{labelRole(m.role)}</Text>
                  <Text style={s.statMeta}>
                    Activos: {m.active} · Inactivos: {m.inactive}
                  </Text>
                </TouchableOpacity>
              );
            })}
            </View>
          </View>
        )}

        <Card style={{ marginTop: 14 }}>
          <View style={[s.row, { justifyContent: "space-between", marginBottom: 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitleLg}>Operación de plataforma</Text>
              <Text style={[s.textMuted, { marginTop: 6 }]}>Métricas migradas del panel operativo anterior.</Text>
            </View>
            <TouchableOpacity style={s.btnOutline} onPress={refreshOverview} activeOpacity={0.8}>
              <Text style={s.btnOutlineText}>Actualizar</Text>
            </TouchableOpacity>
          </View>

          <View style={s.grid2}>
            {[
              {
                key: "vacantes",
                label: "Vacantes publicadas",
                value: platformMetrics.vacantesPublicadas,
                icon: "briefcase-outline" as const,
                color: C.yellow,
              },
              {
                key: "aplicaciones",
                label: "Aplicaciones",
                value: platformMetrics.aplicacionesTotal,
                icon: "document-text-outline" as const,
                color: C.accent70,
              },
              {
                key: "transacciones",
                label: "Transacciones OK",
                value: platformMetrics.txCompletadas,
                icon: "checkmark-circle-outline" as const,
                color: C.green,
              },
              {
                key: "reportes",
                label: "Reportes abiertos",
                value: platformMetrics.reportesAbiertos,
                icon: "flag-outline" as const,
                color:
                  platformMetrics.reportesAbiertos > 0 ? C.red : C.textMuted,
              },
            ].map((item) => (
              <View
                key={item.key}
                style={[s.metricTile, { minWidth: cardMinWidth }]}
              >
                <View style={[s.row, { justifyContent: "space-between", marginBottom: 10 }]}>
                  <View style={s.statIconWrap}>
                    <Ionicons name={item.icon} size={20} color={item.color} />
                  </View>
                  {item.key === "reportes" && item.value > 0 ? (
                    <Badge label={`${item.value} abiertos`} type="pending" />
                  ) : null}
                </View>
                <Text style={s.metricTileLabel}>{item.label}</Text>
                <Text
                  style={[s.metricTileValue, { color: item.color }]}
                >
                  {item.value}
                </Text>
                <Text style={s.metricTileSub}>
                  {item.key === "vacantes"
                    ? "Vacantes activas disponibles en plataforma."
                    : item.key === "aplicaciones"
                      ? "Volumen general de aplicaciones registradas."
                      : item.key === "transacciones"
                        ? "Pagos o transacciones completadas correctamente."
                        : "Casos de moderación que siguen abiertos."}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        <Card style={{ marginTop: 14 }}>
          <View style={[s.row, { justifyContent: "space-between", marginBottom: 12, alignItems: "flex-start" }]}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={s.cardTitle}>Reportes abiertos recientes</Text>
              <Text style={[s.textMuted, { marginTop: 6 }]}>
                Vista rapida del panel operativo anterior, sin acciones destructivas.
              </Text>
            </View>
            <TouchableOpacity
              style={s.btnOutline}
              onPress={() => setPage("reportes")}
              activeOpacity={0.8}
            >
              <Text style={s.btnOutlineText}>Abrir modulo</Text>
            </TouchableOpacity>
          </View>

          {platformLoading ? (
            <View style={{ paddingVertical: 18, alignItems: "center" }}>
              <ActivityIndicator color={C.accent70} />
            </View>
          ) : recentOpenReports.length === 0 ? (
            <View
              style={[
                s.card,
                {
                  padding: 14,
                  borderStyle: "dashed",
                  alignItems: "flex-start",
                },
              ]}
            >
              <Text style={s.itemTitle}>Sin incidencias abiertas</Text>
              <Text style={[s.textMuted, { marginTop: 6 }]}>
                No hay reportes en estado abierto en este momento.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {recentOpenReports.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={s.listItem}
                  onPress={() => navigateToReportList({ status: "abierto", report: item as ReportCase })}
                  activeOpacity={0.8}
                >
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      backgroundColor: C.red,
                      marginTop: 4,
                    }}
                  />
                  <View style={{ flex: 1 }}>
                    <View
                      style={[
                        s.row,
                        {
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: 12,
                        },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={s.itemTitle}>{item.motivo}</Text>
                        <Text style={[s.itemSub, { marginTop: 4 }]}>
                          Tipo: {item.tipo} · {formatDaysAgo(item.created_at)}
                        </Text>
                      </View>
                      <Badge label="Abierto" type="pending" />
                    </View>
                    {item.descripcion ? (
                      <Text style={[s.itemSub, { marginTop: 8 }]} numberOfLines={2}>
                        {item.descripcion}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Card>

        <Card style={{ marginTop: 14, marginBottom: 24 }}>
          <Text style={s.cardTitleLg}>Acciones rápidas</Text>
          <View style={[s.grid2, { marginTop: 14 }]}>
            <TouchableOpacity
              style={s.actionTile}
              onPress={() => {
                setApprovalRoleFilter("todos");
                setApprovalStatusFilter("pending");
                setPage("aprobaciones");
              }}
              activeOpacity={0.85}
            >
              <View style={s.statIconWrap}>
                <Ionicons name="time-outline" size={20} color={C.yellow} />
              </View>
              <Text style={s.actionTileTitle}>Revisar pendientes</Text>
              <Text style={s.actionTileText}>Abre la cola de aprobaciones para empresas y universidades.</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.actionTile}
              onPress={() => navigateToReportList({ status: "todos" })}
              activeOpacity={0.85}
            >
              <View style={s.statIconWrap}>
                <Ionicons name="flag-outline" size={20} color={C.red} />
              </View>
              <Text style={s.actionTileTitle}>Gestionar reportes</Text>
              <Text style={s.actionTileText}>Ve a incidencias y entra directo a los casos recientes.</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.actionTile}
              onPress={() => {
                setPage("roles");
                if (roleTab === "estudiante") {
                  setRoleTab("admin");
                  void fetchPermissions("admin");
                }
              }}
              activeOpacity={0.85}
            >
              <View style={s.statIconWrap}>
                <Ionicons name="key-outline" size={20} color={C.accent70} />
              </View>
              <Text style={s.actionTileTitle}>Ajustar permisos</Text>
              <Text style={s.actionTileText}>Edita el mapa de accesos administrativos por rol.</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.actionTile}
              onPress={() => setPage("logs")}
              activeOpacity={0.85}
            >
              <View style={s.statIconWrap}>
                <Ionicons name="receipt-outline" size={20} color={C.green} />
              </View>
              <Text style={s.actionTileTitle}>Abrir auditoría</Text>
              <Text style={s.actionTileText}>Consulta la bitácora reciente del panel y sus acciones.</Text>
            </TouchableOpacity>
          </View>
        </Card>
      </ScrollView>
    );
  };

  const renderAprobaciones = () => {
    const pendientesEmpresa = users.filter(
      (u) => u.role === "empresa" && u.approval_status === "pending",
    ).length;
    const pendientesUniversidad = users.filter(
      (u) => u.role === "universidad" && u.approval_status === "pending",
    ).length;
    const rechazadas = users.filter(
      (u) => roleRequiresApproval(u.role) && u.approval_status === "inactive",
    ).length;

    return (
      <ScrollView
        showsVerticalScrollIndicator
        refreshControl={<RefreshControl refreshing={usersRefreshing} onRefresh={refreshOverview} tintColor={C.accent70} />}
      >
        <View style={s.sectionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.kicker}>Moderación</Text>
            <Text style={s.pageTitle}>Aprobaciones</Text>
            <Text style={[s.textMuted, { marginTop: 6 }]}>
              Revisión operativa de empresas y universidades que dependen de aprobación administrativa.
            </Text>
          </View>
          <TouchableOpacity
            style={s.btnOutline}
            onPress={() => {
              setApprovalRoleFilter("todos");
              setApprovalStatusFilter("pending");
            }}
            activeOpacity={0.8}
          >
            <Text style={s.btnOutlineText}>Ver pendientes</Text>
          </TouchableOpacity>
        </View>

        <View style={[s.grid2, { marginBottom: 14 }]}>
            <View style={[s.card, { flex: 1, minWidth: isDesktop ? "32%" : width >= 700 ? "48%" : "100%", padding: 14 }]}>
            <Text style={s.itemTitle}>Empresas pendientes</Text>
            <Text style={[s.textMuted, { marginTop: 6 }]}>Cuentas empresariales esperando validación.</Text>
            <Text style={[s.heroMetricValue, { color: C.yellow, marginTop: 12 }]}>{pendientesEmpresa}</Text>
          </View>
            <View style={[s.card, { flex: 1, minWidth: isDesktop ? "32%" : width >= 700 ? "48%" : "100%", padding: 14 }]}>
            <Text style={s.itemTitle}>Universidades pendientes</Text>
            <Text style={[s.textMuted, { marginTop: 6 }]}>Instituciones en cola de revisión.</Text>
            <Text style={[s.heroMetricValue, { color: C.yellow, marginTop: 12 }]}>{pendientesUniversidad}</Text>
          </View>
            <View style={[s.card, { flex: 1, minWidth: isDesktop ? "32%" : width >= 700 ? "48%" : "100%", padding: 14 }]}>
            <Text style={s.itemTitle}>Rechazadas</Text>
            <Text style={[s.textMuted, { marginTop: 6 }]}>Cuentas rechazadas que siguen visibles para seguimiento.</Text>
            <Text style={[s.heroMetricValue, { color: C.red, marginTop: 12 }]}>{rechazadas}</Text>
          </View>
        </View>

        <Card style={{ marginBottom: 14 }}>
          <Text style={[s.textMuted, { fontSize: 11, letterSpacing: 0.8, marginBottom: 8 }]}>TIPO DE CUENTA</Text>
          <View style={s.chipRow}>
            {(["todos", "empresa", "universidad"] as const).map((role) => (
              <Chip
                key={role}
                label={role === "todos" ? "Todos" : labelRole(role)}
                active={approvalRoleFilter === role}
                onPress={() => setApprovalRoleFilter(role)}
              />
            ))}
          </View>
          <Text style={[s.textMuted, { fontSize: 11, letterSpacing: 0.8, marginBottom: 8, marginTop: 14 }]}>ESTADO DE APROBACIÓN</Text>
          <View style={s.chipRow}>
            {(["todos", "pending", "active", "inactive"] as const).map((status) => (
              <Chip
                key={status}
                label={labelStatus(status)}
                active={approvalStatusFilter === status}
                onPress={() => setApprovalStatusFilter(status)}
              />
            ))}
          </View>
        </Card>

        <Card style={{ marginBottom: 24 }}>
          <View style={[s.row, { justifyContent: "space-between", marginBottom: 10 }]}>
            <Text style={s.cardTitle}>Cola de revisión</Text>
            <Text style={s.textMuted}>{approvalQueue.length} cuenta(s)</Text>
          </View>

          {usersLoading ? (
            <View style={{ paddingVertical: 26, alignItems: "center" }}>
              <ActivityIndicator color={C.accent70} />
            </View>
          ) : approvalQueue.length === 0 ? (
            <Text style={[s.textMuted, { textAlign: "center", paddingVertical: 20 }]}>No hay cuentas para este filtro.</Text>
          ) : (
            <View style={{ gap: 10 }}>
              {approvalQueue.map((u) => (
                <View key={u.id} style={[s.listItem, isPhone && s.listItemStack]}>
                  <View style={s.avatar}>
                    <Text style={s.avatarText}>{(u.nombre || u.email).trim().charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={[s.row, { justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.itemTitle}>{u.nombre}</Text>
                        <Text style={[s.itemSub, { marginTop: 4 }]}>{u.email}</Text>
                        <Text style={[s.itemSub, { marginTop: 4 }]}>
                          {labelRole(u.role)} · {formatDaysAgo(u.created_at ?? "")}
                        </Text>
                      </View>
                      <Badge label={statusBadgeLabel(u.approval_status)} type={u.approval_status} />
                    </View>
                    <View style={[s.row, { gap: 10, marginTop: 12, flexWrap: "wrap" }]}>
                      <TouchableOpacity
                        style={[s.btnOutline, s.btnSm]}
                        onPress={() => openDetail(u)}
                        activeOpacity={0.8}
                        disabled={userActionSaving}
                      >
                        <Text style={[s.btnOutlineText, s.btnSmText]}>Ver detalle</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.btnPrimary, s.btnSm, { backgroundColor: C.green }]}
                        onPress={() => void setProfileApproval(u, "active")}
                        activeOpacity={0.8}
                        disabled={userActionSaving}
                      >
                        <Text style={[s.btnPrimaryText, s.btnSmText]}>Aprobar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.btnPrimary, s.btnSm, { backgroundColor: C.red }]}
                        onPress={() => void setProfileApproval(u, "inactive")}
                        activeOpacity={0.8}
                        disabled={userActionSaving}
                      >
                        <Text style={[s.btnPrimaryText, s.btnSmText]}>Rechazar</Text>
                      </TouchableOpacity>
                      {u.approval_status !== "pending" ? (
                        <TouchableOpacity
                          style={[s.btnOutline, s.btnSm]}
                          onPress={() => void setProfileApproval(u, "pending")}
                          activeOpacity={0.8}
                          disabled={userActionSaving}
                        >
                          <Text style={[s.btnOutlineText, s.btnSmText]}>Volver a pendiente</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </Card>
      </ScrollView>
    );
  };

  const RoleHeader = () => (
    <View style={s.sectionHeader}>
      <View style={{ flex: 1 }}>
        <Text style={s.kicker}>Administración</Text>
        <Text style={s.pageTitle}>{labelRole(roleTab)}</Text>
        <Text style={[s.textMuted, { marginTop: 6 }]}>Gestión sobre la colección `usuarios`.</Text>
      </View>
      <TouchableOpacity style={s.btnOutline} onPress={refreshUsers} activeOpacity={0.8}>
        <Text style={s.btnOutlineText}>Actualizar</Text>
      </TouchableOpacity>
    </View>
  );

  const renderUsuarios = () => (
    <ScrollView
      showsVerticalScrollIndicator
      refreshControl={<RefreshControl refreshing={usersRefreshing} onRefresh={refreshUsers} tintColor={C.accent70} />}
    >
      <RoleHeader />

      <Card style={{ marginBottom: 14 }}>
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={18} color={C.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="Buscar por nombre, email, username…"
            placeholderTextColor={C.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
        </View>
      </Card>

      <View style={{ marginBottom: 14 }}>
        <Text style={[s.textMuted, { fontSize: 11, letterSpacing: 0.8, marginBottom: 8 }]}>ROL</Text>
        <View style={s.chipRow}>
          {ROLE_ORDER.map((r) => (
            <Chip
              key={r}
              label={labelRole(r)}
              active={roleTab === r}
              onPress={() => {
                setRoleTab(r);
                setSearch("");
                if (page === "roles" && r !== "estudiante") fetchPermissions(r);
              }}
            />
          ))}
        </View>
      </View>

      <View style={{ marginBottom: 10 }}>
        <Text style={[s.textMuted, { fontSize: 11, letterSpacing: 0.8, marginBottom: 8 }]}>ESTADO</Text>
        <View style={s.chipRow}>
          {(["todos", "active", "pending", "inactive"] as Array<Status | "todos">).map((st) => (
            <Chip key={st} label={labelStatus(st)} active={statusFilter === st} onPress={() => setStatusFilter(st)} />
          ))}
        </View>
      </View>

      <Card style={{ marginBottom: 24 }}>
        <View style={[s.row, { justifyContent: "space-between", marginBottom: 10 }]}>
          <Text style={s.cardTitle}>Listado</Text>
          <Text style={s.textMuted}>{filtered.length} resultado(s)</Text>
        </View>

        {usersLoading ? (
          <View style={{ paddingVertical: 26, alignItems: "center" }}>
            <ActivityIndicator color={C.accent70} />
          </View>
        ) : filtered.length === 0 ? (
          <Text style={[s.textMuted, { textAlign: "center", paddingVertical: 20 }]}>Sin resultados</Text>
        ) : (
          filtered.map((u) => (
            <TouchableOpacity
              key={u.id}
              style={[s.listItem, isPhone && s.listItemStack]}
              onPress={() => openDetail(u)}
              activeOpacity={0.8}
            >
              <View style={s.avatar}>
                <Text style={s.avatarText}>{(u.nombre || u.email).trim().charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.itemTitle}>{u.nombre}</Text>
                <Text style={s.itemSub}>{u.email}</Text>
                <Text style={[s.itemSub, { marginTop: 4 }]}>{u.username}</Text>
              </View>
              <View style={[!isPhone ? { alignItems: "flex-end", gap: 6 } : s.listItemAsideCompact]}>
                <Badge label={statusBadgeLabel(u.status)} type={u.status} />
                <Ionicons name="chevron-forward-outline" size={16} color={C.textMuted} />
              </View>
            </TouchableOpacity>
          ))
        )}
      </Card>
    </ScrollView>
  );

  const renderReportes = () => {
    const byStatus = (status: ReportCaseStatus) =>
      reportCases.filter((item) => item.estado === status).length;
    const statusCount = {
      abierto: byStatus("abierto"),
      en_investigacion: byStatus("en_investigacion"),
      resuelto: byStatus("resuelto"),
    };
    const labelReportStatus = (status: ReportCaseStatus | "todos") =>
      status === "todos"
        ? "Todos"
        : status === "abierto"
          ? "Abiertos"
          : status === "en_investigacion"
            ? "En investigación"
            : "Resueltos";
    const reportStatusType = (status: ReportCaseStatus): Status =>
      status === "resuelto"
        ? "active"
        : status === "en_investigacion"
          ? "pending"
          : "pending";
    const reportStatusColor = (status: ReportCaseStatus) =>
      status === "resuelto" ? C.green : status === "en_investigacion" ? C.yellow : C.red;
    return (
      <ScrollView showsVerticalScrollIndicator refreshControl={<RefreshControl refreshing={usersRefreshing} onRefresh={refreshOverview} />}>
        <View style={s.sectionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.kicker}>Incidencias</Text>
            <Text style={s.pageTitle}>Reportes</Text>
            <Text style={[s.textMuted, { marginTop: 6 }]}>Listado real de casos desde la colección `reportes`.</Text>
          </View>
          <TouchableOpacity style={s.btnOutline} onPress={refreshOverview} activeOpacity={0.8}>
            <Text style={s.btnOutlineText}>Actualizar</Text>
          </TouchableOpacity>
        </View>

        <Card style={{ marginBottom: 14 }}>
          <Text style={s.cardTitle}>Estado operativo</Text>
          <View style={s.grid2}>
            <View style={[s.card, { flex: 1, minWidth: width >= 700 ? "48%" : "100%", padding: 14 }]}>
              <Text style={s.itemTitle}>Abiertos</Text>
              <Text style={[s.textMuted, { marginTop: 6 }]}>Casos nuevos pendientes de revisión.</Text>
              <Text style={{ color: statusCount.abierto > 0 ? C.red : C.green, fontSize: 28, fontWeight: "900", marginTop: 12 }}>
                {statusCount.abierto}
              </Text>
            </View>
            <View style={[s.card, { flex: 1, minWidth: width >= 700 ? "48%" : "100%", padding: 14 }]}>
              <Text style={s.itemTitle}>En investigación</Text>
              <Text style={[s.textMuted, { marginTop: 6 }]}>Casos que ya están siendo atendidos.</Text>
              <Text style={{ color: C.yellow, fontSize: 28, fontWeight: "900", marginTop: 12 }}>
                {statusCount.en_investigacion}
              </Text>
            </View>
          </View>
          <View style={[s.card, { marginTop: 12, padding: 14 }]}>
            <Text style={s.itemTitle}>Resueltos</Text>
            <Text style={[s.textMuted, { marginTop: 6 }]}>Casos cerrados o concluidos.</Text>
            <Text style={{ color: C.green, fontSize: 28, fontWeight: "900", marginTop: 12 }}>
              {statusCount.resuelto}
            </Text>
          </View>
        </Card>

        <Card style={{ marginBottom: 14 }}>
          <Text style={s.cardTitle}>Filtro</Text>
          <View style={[s.chipRow, { marginTop: 12 }]}>
            {(["todos", "abierto", "en_investigacion", "resuelto"] as Array<ReportCaseStatus | "todos">).map((status) => (
              <Chip
                key={status}
                label={labelReportStatus(status)}
                active={reportStatusFilter === status}
                onPress={() => setReportStatusFilter(status)}
              />
            ))}
          </View>
        </Card>

        <Card style={{ marginBottom: 24 }}>
          <View style={[s.row, { justifyContent: "space-between", marginBottom: 10 }]}>
            <Text style={s.cardTitle}>Casos</Text>
            <Text style={s.textMuted}>{filteredReports.length}</Text>
          </View>

          {platformLoading ? (
            <View style={{ paddingVertical: 26, alignItems: "center" }}>
              <ActivityIndicator color={C.accent70} />
            </View>
          ) : filteredReports.length === 0 ? (
            <Text style={[s.textMuted, { textAlign: "center", paddingVertical: 20 }]}>Sin reportes para este filtro</Text>
          ) : (
            filteredReports.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[s.listItem, isPhone && s.listItemStack]}
                onPress={() => openReportDetail(item)}
                activeOpacity={0.8}
              >
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    backgroundColor: reportStatusColor(item.estado),
                    marginTop: 4,
                  }}
                />
                <View style={{ flex: 1 }}>
                  <View style={[s.row, { justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.itemTitle}>{item.motivo}</Text>
                      <Text style={[s.itemSub, { marginTop: 4 }]}>
                        Tipo: {item.tipo} · {new Date(item.created_at || Date.now()).toLocaleString()}
                      </Text>
                    </View>
                    <Badge label={labelReportStatus(item.estado)} type={reportStatusType(item.estado)} />
                  </View>
                  {item.descripcion ? (
                    <Text style={[s.itemSub, { marginTop: 8 }]} numberOfLines={2}>
                      {item.descripcion}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            ))
          )}
        </Card>
      </ScrollView>
    );
  };

  const renderNotificaciones = () => (
    <ScrollView showsVerticalScrollIndicator refreshControl={<RefreshControl refreshing={notificationsLoading} onRefresh={fetchNotifications} />}>
      <View style={s.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={s.kicker}>Inbox</Text>
          <Text style={s.pageTitle}>Notificaciones</Text>
          <Text style={[s.textMuted, { marginTop: 6 }]}>Alertas y pendientes del sistema.</Text>
        </View>
        <TouchableOpacity style={s.btnOutline} onPress={markAllNotificationsRead} activeOpacity={0.8}>
          <Text style={s.btnOutlineText}>Marcar leídas</Text>
        </TouchableOpacity>
      </View>

      <Card style={{ marginBottom: 24 }}>
        <View style={[s.row, { justifyContent: "space-between", marginBottom: 10 }]}>
          <Text style={s.cardTitle}>Bandeja</Text>
          <Text style={s.textMuted}>{notifications.length}</Text>
        </View>

        {notificationsLoading ? (
          <View style={{ paddingVertical: 26, alignItems: "center" }}>
            <ActivityIndicator color={C.accent70} />
          </View>
        ) : notifications.length === 0 ? (
          <Text style={[s.textMuted, { textAlign: "center", paddingVertical: 20 }]}>Sin notificaciones</Text>
        ) : (
          notifications.map((n) => (
            <View key={n.id} style={[s.notifItem, !n.is_read && s.notifItemUnread]}>
              <View style={{ flex: 1 }}>
                <Text style={s.itemTitle}>{n.title}</Text>
                {n.body ? <Text style={[s.itemSub, { marginTop: 4 }]}>{n.body}</Text> : null}
                <Text style={[s.itemSub, { marginTop: 6 }]}>{new Date(n.created_at).toLocaleString()}</Text>
              </View>
              {!n.is_read ? <Badge label="Nuevo" type="pending" /> : null}
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );

  const renderRoles = () => {
    const grouped = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
      const g = p.group_name || "General";
      acc[g] = acc[g] || [];
      acc[g].push(p);
      return acc;
    }, {});

    return (
      <ScrollView
        showsVerticalScrollIndicator
        refreshControl={
          <RefreshControl
            refreshing={permissionsLoading}
            onRefresh={() => {
              if (roleTab !== "estudiante") fetchPermissions(roleTab);
            }}
          />
        }
      >
        <View style={s.sectionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.kicker}>Control</Text>
            <Text style={s.pageTitle}>Roles & permisos</Text>
            <Text style={[s.textMuted, { marginTop: 6 }]}>Permisos por rol (role_permissions).</Text>
          </View>
        </View>

        <Card style={{ marginBottom: 14 }}>
          <Text style={[s.textMuted, { fontSize: 11, letterSpacing: 0.8, marginBottom: 10 }]}>ROL</Text>
          <View style={s.chipRow}>
            {PERMISSION_ROLES.map((r) => (
              <Chip
                key={r}
                label={labelRole(r)}
                active={roleTab === r}
                onPress={() => {
                  setRoleTab(r);
                  fetchPermissions(r);
                }}
              />
            ))}
          </View>
        </Card>

        {permissionsLoading ? (
          <View style={{ paddingVertical: 28, alignItems: "center" }}>
            <ActivityIndicator color={C.accent70} />
            <Text style={[s.textMuted, { marginTop: 10 }]}>Cargando permisos…</Text>
          </View>
        ) : roleTab === "estudiante" ? (
          <Card style={{ marginBottom: 24 }}>
            <Text style={s.cardTitle}>Permisos no configurados</Text>
            <Text style={[s.textMuted, { marginTop: 10, lineHeight: 20 }]}>
              El rol Estudiante no tiene permisos administrables en esta sección. Selecciona Admin, Universidad o Empresa.
            </Text>
          </Card>
        ) : (
          Object.keys(grouped).map((g) => (
            <Card key={g} style={{ marginBottom: 14 }}>
              <Text style={s.cardTitle}>{g}</Text>
              <View style={{ height: 10 }} />
              {grouped[g].map((p) => {
                const active = rolePermissions.has(p.key);
                return (
                  <TouchableOpacity
                    key={p.key}
                    style={[s.permItem, active && s.permItemActive]}
                    onPress={() => togglePermission(roleTab, p.key)}
                    activeOpacity={0.8}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.itemTitle}>{p.label}</Text>
                      <Text style={[s.itemSub, { marginTop: 3 }]}>{p.key}</Text>
                      {p.description ? <Text style={[s.itemSub, { marginTop: 6 }]}>{p.description}</Text> : null}
                    </View>
                    <View style={[s.togglePill, active && s.togglePillOn]}>
                      <View style={[s.toggleDot, active && s.toggleDotOn]} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </Card>
          ))
        )}

        <View style={{ height: 10 }} />
      </ScrollView>
    );
  };

  const renderLogs = () => (
    <ScrollView showsVerticalScrollIndicator refreshControl={<RefreshControl refreshing={logsLoading} onRefresh={fetchLogs} />}>
      <View style={s.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={s.kicker}>Auditoría</Text>
          <Text style={s.pageTitle}>Logs</Text>
          <Text style={[s.textMuted, { marginTop: 6 }]}>Últimas acciones registradas.</Text>
        </View>
        <TouchableOpacity style={s.btnOutline} onPress={fetchLogs} activeOpacity={0.8}>
          <Text style={s.btnOutlineText}>Recargar</Text>
        </TouchableOpacity>
      </View>

      <Card style={{ marginBottom: 24 }}>
        <View style={[s.row, { justifyContent: "space-between", marginBottom: 10 }]}>
          <Text style={s.cardTitle}>Bitácora</Text>
          <Text style={s.textMuted}>{logs.length}</Text>
        </View>
        {logsLoading ? (
          <View style={{ paddingVertical: 26, alignItems: "center" }}>
            <ActivityIndicator color={C.accent70} />
          </View>
        ) : logs.length === 0 ? (
          <Text style={[s.textMuted, { textAlign: "center", paddingVertical: 20 }]}>Sin registros</Text>
        ) : (
          logs.map((l) => (
            <View key={l.id} style={s.logItem}>
              <View style={{ flex: 1 }}>
                <Text style={s.itemTitle}>{l.action}</Text>
                <Text style={[s.itemSub, { marginTop: 4 }]}>
                  {l.entity_type}
                  {l.entity_id ? ` · ${l.entity_id}` : ""}
                </Text>
                <Text style={[s.itemSub, { marginTop: 6 }]}>{l.actor_email ?? "—"}</Text>
              </View>
              <Text style={[s.itemSub, { marginLeft: 10 }]}>{new Date(l.created_at).toLocaleString()}</Text>
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );

  const renderConfig = () => (
    <ScrollView showsVerticalScrollIndicator>
      <View style={s.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={s.kicker}>Sistema</Text>
          <Text style={s.pageTitle}>Configuración</Text>
          <Text style={[s.textMuted, { marginTop: 6 }]}>Accesos y administración.</Text>
        </View>
      </View>

      <Card style={{ marginBottom: 14 }}>
        <Text style={s.cardTitle}>Accesos</Text>
        <View style={[s.row, { gap: 10, marginTop: 14, flexWrap: "wrap" }]}>
          <TouchableOpacity style={s.btnOutline} onPress={() => setPage("roles")} activeOpacity={0.8}>
            <Text style={s.btnOutlineText}>Roles y permisos</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btnOutline} onPress={() => setPage("logs")} activeOpacity={0.8}>
            <Text style={s.btnOutlineText}>Auditoría</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btnOutline} onPress={() => setPage("notificaciones")} activeOpacity={0.8}>
            <Text style={s.btnOutlineText}>Notificaciones</Text>
          </TouchableOpacity>
        </View>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <Text style={s.cardTitle}>Sesión</Text>
        <TouchableOpacity
          style={[s.btnPrimary, { marginTop: 14, backgroundColor: C.red }]}
          onPress={async () => {
            try {
              await logout();
              Alert.alert(t('admin_sesion_cerrada_titulo'), t('admin_sesion_cerrada_msg'));
            } catch (error) {
              Alert.alert(t('admin_error_titulo'), translateSync(adminDataErrorMessage(error, "cerrar la sesion")));
            }
          }}
          activeOpacity={0.85}
        >
          <Text style={s.btnPrimaryText}>Cerrar sesión</Text>
        </TouchableOpacity>
      </Card>
    </ScrollView>
  );

  const DetailModal = () => (
    <>
    <Modal visible={detailOpen} transparent animationType="slide" onRequestClose={() => setDetailOpen(false)}>
      <View style={s.modalOverlay}>
        <View style={[s.modal, isPhone && s.modalCompact]}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Detalle</Text>
            <TouchableOpacity style={[s.iconBtn, { width: 38, height: 38 }]} onPress={() => setDetailOpen(false)} activeOpacity={0.8}>
              <Ionicons name="close" size={20} color={C.text} />
            </TouchableOpacity>
          </View>

          {selected ? (
            <ScrollView showsVerticalScrollIndicator>
              <Card>
                <View style={[s.row, { justifyContent: "space-between", marginBottom: 10, gap: 10, flexWrap: "wrap" }]}>
                  <Text style={s.cardTitle}>{selected.nombre}</Text>
                  <Badge label={statusBadgeLabel(selected.status)} type={selected.status} />
                </View>
                <Text style={s.textMuted}>Rol: {labelRole(selected.role)}</Text>
                {roleRequiresApproval(selected.role) ? (
                  <Text style={[s.textMuted, { marginTop: 6 }]}>
                    Aprobación: {labelStatus(selected.approval_status)}
                  </Text>
                ) : null}
                <Text style={[s.textMuted, { marginTop: 6 }]}>Email: {selected.email}</Text>
                <Text style={[s.textMuted, { marginTop: 6 }]}>Username: {selected.username}</Text>
                <Text style={[s.textMuted, { marginTop: 6 }]}>
                  Acceso: {selected.banned ? "Baneado" : "Habilitado"}
                </Text>
                {selected.departamento ? <Text style={[s.textMuted, { marginTop: 6 }]}>Depto: {selected.departamento}</Text> : null}
                {selected.ciudad ? <Text style={[s.textMuted, { marginTop: 6 }]}>Ciudad: {selected.ciudad}</Text> : null}
                {selected.ban_reason ? (
                  <Text style={[s.textMuted, { marginTop: 6 }]}>
                    Motivo baneo: {selected.ban_reason}
                  </Text>
                ) : null}
              </Card>

              <Card style={{ marginTop: 12 }}>
                <Text style={s.cardTitle}>Acciones</Text>
                <View style={[s.row, { gap: 10, marginTop: 12, flexWrap: "wrap" }]}>
                  <TouchableOpacity
                    style={[s.btnPrimary, s.btnSm]}
                    onPress={() => openEdit(selected)}
                    activeOpacity={0.8}
                    disabled={userActionSaving}
                  >
                    <Text style={[s.btnPrimaryText, s.btnSmText]}>Editar</Text>
                  </TouchableOpacity>
                  {selected.role !== "admin" ? (
                    <TouchableOpacity
                      style={[s.btnOutline, s.btnSm]}
                      onPress={() => abrirPerfilPublico(selected.role, selected.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.btnOutlineText, s.btnSmText]}>Ver perfil público</Text>
                    </TouchableOpacity>
                  ) : null}
                  {!roleRequiresApproval(selected.role) ? (
                    <>
                      <TouchableOpacity
                        style={[s.btnOutline, s.btnSm]}
                        onPress={() => setProfileStatus(selected, "pending")}
                        activeOpacity={0.8}
                        disabled={userActionSaving}
                      >
                        <Text style={[s.btnOutlineText, s.btnSmText]}>Pendiente</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.btnPrimary, s.btnSm, { backgroundColor: C.green }]}
                        onPress={() => setProfileStatus(selected, "active")}
                        activeOpacity={0.8}
                        disabled={userActionSaving}
                      >
                        <Text style={[s.btnPrimaryText, s.btnSmText]}>Activar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.btnPrimary, s.btnSm, { backgroundColor: C.red }]}
                        onPress={() => setProfileStatus(selected, "inactive")}
                        activeOpacity={0.8}
                        disabled={userActionSaving}
                      >
                        <Text style={[s.btnPrimaryText, s.btnSmText]}>Inactivar</Text>
                      </TouchableOpacity>
                    </>
                  ) : null}
                </View>
                <View style={{ height: 10 }} />
                <Text style={[s.textMuted, { fontSize: 11, letterSpacing: 0.8 }]}>CAMBIAR ROL</Text>
                <View style={[s.chipRow, { marginTop: 10 }]}>
                  {ROLE_ORDER.map((r) => (
                    <Chip key={r} label={labelRole(r)} active={selected.role === r} onPress={() => setProfileRole(selected, r)} />
                  ))}
                </View>
              </Card>
              {roleRequiresApproval(selected.role) ? (
                <Card style={{ marginTop: 12 }}>
                  <Text style={s.cardTitle}>Aprobación administrativa</Text>
                  <Text style={[s.textMuted, { marginTop: 10 }]}>Nota interna de revisión</Text>
                  <TextInput
                    style={[s.input, { marginTop: 10 }]}
                    value={approvalReason}
                    onChangeText={setApprovalReason}
                    placeholder="Motivo, observación o criterio de aprobación"
                    placeholderTextColor={C.textMuted}
                    editable={!userActionSaving}
                  />
                  <View style={[s.row, { gap: 10, marginTop: 14, flexWrap: "wrap" }]}>
                    <TouchableOpacity
                      style={[s.btnOutline, s.btnSm]}
                      onPress={() => void setProfileApproval(selected, "pending")}
                      activeOpacity={0.8}
                      disabled={userActionSaving}
                    >
                      <Text style={[s.btnOutlineText, s.btnSmText]}>Pendiente</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.btnPrimary, s.btnSm, { backgroundColor: C.green }]}
                      onPress={() => void setProfileApproval(selected, "active")}
                      activeOpacity={0.8}
                      disabled={userActionSaving}
                    >
                      <Text style={[s.btnPrimaryText, s.btnSmText]}>Aprobar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.btnPrimary, s.btnSm, { backgroundColor: C.red }]}
                      onPress={() => void setProfileApproval(selected, "inactive")}
                      activeOpacity={0.8}
                      disabled={userActionSaving}
                    >
                      <Text style={[s.btnPrimaryText, s.btnSmText]}>Rechazar</Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              ) : null}
              <Card style={{ marginTop: 12 }}>
                <Text style={s.cardTitle}>Moderación</Text>
                <Text style={[s.textMuted, { marginTop: 10 }]}>Motivo del baneo</Text>
                <TextInput
                  style={[s.input, { marginTop: 10 }]}
                  value={banReason}
                  onChangeText={setBanReason}
                  placeholder="Describe el motivo"
                  placeholderTextColor={C.textMuted}
                  editable={!userActionSaving}
                />
                <View style={[s.row, { gap: 10, marginTop: 14, flexWrap: "wrap" }]}>
                  <TouchableOpacity
                    style={[s.btnPrimary, s.btnSm, { backgroundColor: selected.banned ? C.green : C.red }]}
                    onPress={() => confirmBanToggle(selected, !selected.banned)}
                    activeOpacity={0.8}
                    disabled={userActionSaving}
                  >
                    <Text style={[s.btnPrimaryText, s.btnSmText]}>
                      {userActionSaving
                        ? "Procesando..."
                        : selected.banned
                          ? "Desbanear"
                          : "Banear"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.btnOutline, s.btnSm, { borderColor: C.red }]}
                    onPress={() => handleDeleteUser(selected)}
                    activeOpacity={0.8}
                    disabled={userActionSaving}
                  >
                    <Text style={[s.btnOutlineText, s.btnSmText, { color: C.red }]}>Eliminar</Text>
                  </TouchableOpacity>
                </View>
              </Card>
              <View style={{ height: 18 }} />
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>

    {verPerfilPublico ? (
      <ProfileViewerModal
        visible
        tipo={verPerfilPublico.tipo}
        profileId={verPerfilPublico.id}
        onClose={() => setVerPerfilPublico(null)}
      />
    ) : null}
    </>
  );

  const EditModal = () => (
    <Modal visible={editOpen} transparent animationType="slide" onRequestClose={() => setEditOpen(false)}>
      <View style={s.modalOverlay}>
        <View style={[s.modal, isPhone && s.modalCompact]}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Editar perfil</Text>
            <TouchableOpacity style={[s.iconBtn, { width: 38, height: 38 }]} onPress={() => setEditOpen(false)} activeOpacity={0.8}>
              <Ionicons name="close" size={20} color={C.text} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator>
            <Text style={s.inputLabel}>Nombre</Text>
            <TextInput style={s.input} value={editNombre} onChangeText={setEditNombre} placeholder="Nombre" placeholderTextColor={C.textMuted} />
            <Text style={[s.inputLabel, { marginTop: 12 }]}>Teléfono</Text>
            <TextInput style={s.input} value={editTelefono} onChangeText={setEditTelefono} placeholder="+503..." placeholderTextColor={C.textMuted} />
            <View style={[s.row, { gap: 12, marginTop: 12 }, isPhone && s.formRowCompact]}>
              <View style={{ flex: 1 }}>
                <Text style={s.inputLabel}>Departamento</Text>
                <TextInput
                  style={s.input}
                  value={editDepartamento}
                  onChangeText={setEditDepartamento}
                  placeholder="Departamento"
                  placeholderTextColor={C.textMuted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.inputLabel}>Ciudad</Text>
                <TextInput style={s.input} value={editCiudad} onChangeText={setEditCiudad} placeholder="Ciudad" placeholderTextColor={C.textMuted} />
              </View>
            </View>
            <TouchableOpacity style={[s.btnPrimary, { marginTop: 16 }]} onPress={saveEdit} activeOpacity={0.85} disabled={editSaving}>
              <Text style={s.btnPrimaryText}>{editSaving ? "Guardando..." : "Guardar"}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const ReportDetailModal = () => {
    const reportedUser =
      selectedReport?.reportado_id
        ? users.find((u) => u.id === selectedReport.reportado_id) ?? null
        : null;
    const reporterUser =
      selectedReport?.reportante_id
        ? users.find((u) => u.id === selectedReport.reportante_id) ?? null
        : null;

    return (
      <Modal
        visible={reportDetailOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setReportDetailOpen(false)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modal, isPhone && s.modalCompact]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Detalle del reporte</Text>
              <TouchableOpacity
                style={[s.iconBtn, { width: 38, height: 38 }]}
                onPress={() => setReportDetailOpen(false)}
                activeOpacity={0.8}
              >
                <Ionicons name="close" size={20} color={C.text} />
              </TouchableOpacity>
            </View>
            {selectedReport ? (
              <ScrollView showsVerticalScrollIndicator>
                <Card>
                  <View style={[s.row, { justifyContent: "space-between", marginBottom: 10, gap: 10, flexWrap: "wrap" }]}>
                    <Text style={s.cardTitle}>{selectedReport.motivo}</Text>
                    <Badge
                      label={
                        selectedReport.estado === "abierto"
                          ? "Abiertos"
                          : selectedReport.estado === "en_investigacion"
                            ? "En investigación"
                            : "Resueltos"
                      }
                      type={
                        selectedReport.estado === "resuelto"
                          ? "active"
                          : selectedReport.estado === "en_investigacion"
                            ? "pending"
                            : "inactive"
                      }
                    />
                  </View>
                  <Text style={s.textMuted}>Tipo: {selectedReport.tipo}</Text>
                  <Text style={[s.textMuted, { marginTop: 6 }]}>
                    Fecha: {new Date(selectedReport.created_at || Date.now()).toLocaleString()}
                  </Text>
                  <Text style={[s.textMuted, { marginTop: 6 }]}>
                    Reportado: {reportedUser?.nombre || reportedUser?.email || selectedReport.reportado_id || "No disponible"}
                  </Text>
                  <Text style={[s.textMuted, { marginTop: 6 }]}>
                    Reportante: {reporterUser?.nombre || reporterUser?.email || selectedReport.reportante_id || "No disponible"}
                  </Text>
                </Card>

                <Card style={{ marginTop: 12 }}>
                  <Text style={s.cardTitle}>Descripción</Text>
                  <Text style={[s.textMuted, { marginTop: 10, lineHeight: 22 }]}>
                    {selectedReport.descripcion || "Sin descripción adicional."}
                  </Text>
                </Card>

                <Card style={{ marginTop: 12 }}>
                  <Text style={s.cardTitle}>Gestión del caso</Text>
                  <Text style={[s.textMuted, { marginTop: 10 }]}>
                    Resolución o notas internas
                  </Text>
                  <TextInput
                    style={[s.input, { marginTop: 10, minHeight: 96, textAlignVertical: "top" }]}
                    value={reportResolution}
                    onChangeText={setReportResolution}
                    placeholder="Describe la acción tomada"
                    placeholderTextColor={C.textMuted}
                    multiline
                    editable={!reportActionSaving}
                  />
                  <View style={[s.row, { gap: 10, marginTop: 14, flexWrap: "wrap" }]}>
                    <TouchableOpacity
                      style={[s.btnOutline, s.btnSm]}
                      onPress={() => handleReportStatusChange(selectedReport, "en_investigacion")}
                      activeOpacity={0.8}
                      disabled={reportActionSaving}
                    >
                      <Text style={[s.btnOutlineText, s.btnSmText]}>
                        {reportActionSaving ? "Guardando..." : "Investigar"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.btnPrimary, s.btnSm, { backgroundColor: C.green }]}
                      onPress={() => handleReportStatusChange(selectedReport, "resuelto")}
                      activeOpacity={0.8}
                      disabled={reportActionSaving}
                    >
                      <Text style={[s.btnPrimaryText, s.btnSmText]}>
                        {reportActionSaving ? "Guardando..." : "Resolver"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </Card>

                {reportedUser ? (
                  <Card style={{ marginTop: 12 }}>
                    <Text style={s.cardTitle}>Usuario vinculado</Text>
                    <Text style={[s.textMuted, { marginTop: 10 }]}>
                      {reportedUser.nombre || "Sin nombre"} · {labelRole(reportedUser.role)}
                    </Text>
                    <Text style={[s.textMuted, { marginTop: 6 }]}>
                      {reportedUser.email || "Sin correo"}
                    </Text>
                    <Text style={[s.textMuted, { marginTop: 6 }]}>
                      Estado: {reportedUser.banned ? "Baneado" : "Sin baneo"}
                    </Text>
                    <View style={[s.row, { gap: 10, marginTop: 14, flexWrap: "wrap" }]}>
                      <TouchableOpacity
                        style={s.btnOutline}
                        onPress={() => {
                          setReportDetailOpen(false);
                          navigateToUserList({
                            role: reportedUser.role,
                            status: "todos",
                            search: "",
                            user: reportedUser,
                          });
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={s.btnOutlineText}>Abrir usuario</Text>
                      </TouchableOpacity>
                      {reportedUser.role !== "admin" ? (
                        <TouchableOpacity
                          style={s.btnOutline}
                          onPress={() => abrirPerfilPublico(reportedUser.role, reportedUser.id)}
                          activeOpacity={0.8}
                        >
                          <Text style={s.btnOutlineText}>Ver perfil público</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      style={[s.btnPrimary, { marginTop: 10, alignSelf: "flex-start", backgroundColor: reportedUser.banned ? C.green : C.red }]}
                      onPress={() => confirmBanToggle(reportedUser, !reportedUser.banned)}
                      activeOpacity={0.8}
                      disabled={userActionSaving}
                    >
                      <Text style={s.btnPrimaryText}>
                        {userActionSaving
                          ? "Procesando..."
                          : reportedUser.banned
                            ? "Desbanear usuario"
                            : "Banear usuario"}
                      </Text>
                    </TouchableOpacity>
                  </Card>
                ) : null}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    );
  };

  const renderBody = () => {
    switch (page) {
      case "resumen":
        return renderResumen();
      case "aprobaciones":
        return renderAprobaciones();
      case "usuarios":
        return renderUsuarios();
      case "reportes":
        return renderReportes();
      case "notificaciones":
        return renderNotificaciones();
      case "roles":
        return renderRoles();
      case "logs":
        return renderLogs();
      case "config":
        return renderConfig();
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  useEffect(() => {
    if (!isLoading && rol) {
      setShowAccessRecovery(false);
      return;
    }

    const timer = setTimeout(() => {
      setShowAccessRecovery(true);
    }, 7000);

    return () => clearTimeout(timer);
  }, [isLoading, rol]);

  if (isLoading || !rol) {
    return (
      <View style={[s.root, { alignItems: "center", justifyContent: "center", padding: 24 }]}>
        <ActivityIndicator color={C.accent70} />
        <Text style={[s.textMuted, { marginTop: 12 }]}>Cargando acceso administrativo…</Text>
        {showAccessRecovery ? (
          <View style={{ marginTop: 18, gap: 10, width: "100%", maxWidth: 320 }}>
            <Text style={[s.textMuted, { textAlign: "center", lineHeight: 20 }]}>
              Estamos tardando en validar tu acceso al panel. Puedes reintentar o volver a iniciar sesión.
            </Text>
            <TouchableOpacity
              style={s.btnPrimary}
              onPress={() => {
                setShowAccessRecovery(false);
                void refreshProfile();
              }}
              activeOpacity={0.85}
            >
              <Text style={s.btnPrimaryText}>Reintentar acceso</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.btnOutline}
              onPress={() => {
                setShowAccessRecovery(false);
                void logout();
              }}
              activeOpacity={0.85}
            >
              <Text style={s.btnOutlineText}>Volver a iniciar sesión</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={s.root}>
      <View style={[s.topbar, isDesktop && s.topbarDesktop, isPhone && s.topbarCompact]}>
        <View style={[s.topbarLeft, isPhone && s.topbarLeftCompact]}>
          {!isDesktop ? (
            <TouchableOpacity style={s.iconBtn} onPress={() => setDrawerOpen(true)} activeOpacity={0.8}>
              <Ionicons name="menu" size={20} color={C.text} />
            </TouchableOpacity>
          ) : null}
          {Brand()}
          <View style={{ flex: 1, minWidth: isPhone ? 120 : 180 }}>
            <Text style={[s.topbarTitle, isPhone && { fontSize: 15 }]} numberOfLines={1}>
              {isDesktop ? "Panel de administración" : isPhone ? "Admin" : meName}
            </Text>
            <Text style={s.topbarSubtitle} numberOfLines={1}>
              {isDesktop ? "Control operativo y moderación" : isTablet ? "Panel administrativo" : "Administrador"}
            </Text>
          </View>
        </View>
        <View style={[s.topbarRight, isPhone && s.topbarRightCompact]}>
          <TouchableOpacity
            style={s.iconBtn}
            onPress={toggleLanguage}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('cambiar_idioma')}
          >
            <Ionicons name="language-outline" size={18} color={C.accent70} />
            <View style={s.langTag}>
              <Text style={s.langTagText}>{language.toUpperCase()}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.iconBtn}
            onPress={toggleTheme}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('cambiar_tema')}
          >
            <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={C.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.iconBtn}
            onPress={() => setPage("notificaciones")}
            activeOpacity={0.8}
          >
            <Ionicons name="notifications-outline" size={20} color={C.text} />
            {unreadCount > 0 ? (
              <View style={s.navBadge}>
                <Text style={s.navBadgeText}>{unreadCount > 99 ? "99+" : String(unreadCount)}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn} onPress={() => setPage("config")} activeOpacity={0.8}>
            <Ionicons name="settings-outline" size={20} color={C.text} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[s.main, isDesktop && s.mainDesktop]}>
        {isDesktop ? SidebarPanel() : null}
        <View style={[s.content, isDesktop && s.contentDesktop, isPhone && s.contentCompact]}>
          <View style={[s.contentInner, isDesktop && s.contentInnerDesktop]}>
            {dataIssueList.length ? (
              <Card
                style={{
                  marginBottom: 16,
                  borderColor: "rgba(251,191,36,0.28)",
                  backgroundColor: "rgba(120,53,15,0.22)",
                }}
              >
                <Text style={{ color: "#FDE68A", fontWeight: "800", marginBottom: 8 }}>
                  Avisos de datos y permisos
                </Text>
                {dataIssueList.map((message) => (
                  <Text
                    key={message}
                    style={{ color: "rgba(255,244,197,0.92)", lineHeight: 20 }}
                  >
                    {`- ${message}`}
                  </Text>
                ))}
              </Card>
            ) : null}
            {renderBody()}
          </View>
        </View>
      </View>

      {DetailModal()}
      {EditModal()}
      {ReportDetailModal()}
      {!isDesktop ? Drawer() : null}
    </View>
  );
}
