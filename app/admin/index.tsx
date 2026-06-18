import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { signOut } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "../../src/config/firebaseConfig";
import { C, s } from "../../src/styles/adminStyles";

// Convierte un Timestamp de Firestore (o string) a ISO para los tipos del panel.
const tsToIso = (v: any): string => {
  if (!v) return "";
  if (typeof v?.toDate === "function") return v.toDate().toISOString();
  if (typeof v === "string") return v;
  return "";
};

type AdminPage = "resumen" | "usuarios" | "reportes" | "notificaciones" | "roles" | "logs" | "config";
type Role = "talento" | "universidad" | "empresa" | "alumno";
type PermissionRole = Exclude<Role, "alumno">;
type Status = "active" | "pending" | "inactive";

type AdminUser = {
  id: string;
  role: Role;
  status: Status;
  nombre: string;
  email: string;
  username: string;
  telefono?: string | null;
  departamento?: string | null;
  ciudad?: string | null;
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

function Badge({ label, type }: { label: string; type: Status }) {
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
  return <View style={[s.card, style]}>{children}</View>;
}

export default function AdminPreview() {
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  const [page, setPage] = useState<AdminPage>("resumen");

  const [roleTab, setRoleTab] = useState<Role>("talento");
  const [statusFilter, setStatusFilter] = useState<Status | "todos">("todos");
  const [search, setSearch] = useState("");

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersRefreshing, setUsersRefreshing] = useState(false);

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<Set<string>>(new Set());
  const [permissionsLoading, setPermissionsLoading] = useState(false);

  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editNombre, setEditNombre] = useState("");
  const [editTelefono, setEditTelefono] = useState("");
  const [editDepartamento, setEditDepartamento] = useState("");
  const [editCiudad, setEditCiudad] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [meName, setMeName] = useState("Administrador");
  const [meEmail, setMeEmail] = useState<string | null>(null);

  const gradlyLogo = require("../../assets/images/LogoGradly.png");
  const empresaLogo = require("../../assets/images/logo.png");

  const labelRole = (r: Role) =>
    r === "talento" ? "Talento" : r === "universidad" ? "Universidad" : r === "empresa" ? "Empresa" : "Alumno";

  const labelStatus = (st: Status | "todos") =>
    st === "todos" ? "Todos" : st === "active" ? "Activo" : st === "pending" ? "Pendiente" : "Inactivo";

  const statusBadgeLabel = (st: Status) => (st === "active" ? "Activo" : st === "pending" ? "Pendiente" : "Inactivo");

  const openDetail = (u: AdminUser) => {
    setSelected(u);
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
        const status: Status =
          r.status ?? (r.activo === false ? "inactive" : "active");
        return {
          id: d.id,
          role: r.rol,
          status,
          nombre: r.nombre_completo ?? r.nombre ?? "",
          email: r.correo ?? r.email ?? "",
          username: r.username ?? "",
          telefono: r.telefono ?? null,
          departamento: r.departamento ?? null,
          ciudad: r.ciudad ?? null,
          created_at: tsToIso(r.fecha_registro),
        };
      });
      mapped.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
      setUsers(mapped);
    } catch {
      Alert.alert("Error", "No se pudo cargar la lista de usuarios.");
    }
  }, []);

  const refreshUsers = useCallback(async () => {
    setUsersRefreshing(true);
    await fetchUsers();
    setUsersRefreshing(false);
  }, [fetchUsers]);

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "audit_logs"), limit(200)));
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
    } catch {
      Alert.alert("Error", "No se pudo cargar la bitácora.");
    } finally {
      setLogsLoading(false);
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, "admin_notifications"), limit(200)),
      );
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
    } catch {
      Alert.alert("Error", "No se pudo cargar notificaciones.");
    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  const fetchPermissions = useCallback(
    async (role: PermissionRole) => {
      setPermissionsLoading(true);
      try {
        const [permSnap, rpSnap] = await Promise.all([
          getDocs(collection(db, "permissions")),
          getDocs(
            query(collection(db, "role_permissions"), where("role", "==", role)),
          ),
        ]);

        const perms: Permission[] = permSnap.docs.map((d) => {
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
          new Set(rpSnap.docs.map((d) => (d.data() as any).permission_key)),
        );
      } catch {
        Alert.alert("Error", "No se pudo cargar permisos.");
      } finally {
        setPermissionsLoading(false);
      }
    },
    [],
  );

  const setProfileStatus = useCallback(
    async (u: AdminUser, nextStatus: Status) => {
      try {
        await updateDoc(doc(db, "usuarios", u.id), {
          status: nextStatus,
          activo: nextStatus === "active",
        });
        setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, status: nextStatus } : x)));
        setSelected((prev) => (prev?.id === u.id ? { ...prev, status: nextStatus } : prev));
        await logAction("profile.status.update", "usuarios", u.id, { from: u.status, to: nextStatus });
      } catch {
        Alert.alert("Error", "No se pudo actualizar el estado.");
      }
    },
    [logAction],
  );

  const setProfileRole = useCallback(
    async (u: AdminUser, nextRole: Role) => {
      try {
        await updateDoc(doc(db, "usuarios", u.id), { rol: nextRole });
        setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role: nextRole } : x)));
        setSelected((prev) => (prev?.id === u.id ? { ...prev, role: nextRole } : prev));
        await logAction("profile.role.update", "usuarios", u.id, { from: u.role, to: nextRole });
      } catch {
        Alert.alert("Error", "No se pudo actualizar el rol.");
      }
    },
    [logAction],
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
      } catch {
        Alert.alert("Error", "No se pudo actualizar el permiso.");
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
    } catch {
      Alert.alert("Error", "No se pudo marcar como leídas.");
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
      setEditOpen(false);
      await logAction("profile.update", "usuarios", selected.id, patch);
    } catch {
      Alert.alert("Error", "No se pudo guardar el perfil.");
    } finally {
      setEditSaving(false);
    }
  }, [editCiudad, editDepartamento, editNombre, editTelefono, logAction, selected]);

  useEffect(() => {
    (async () => {
      setUsersLoading(true);
      await fetchUsers();
      setUsersLoading(false);
    })();
  }, [fetchUsers]);

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
    if (page === "logs" && logs.length === 0 && !logsLoading) fetchLogs();
    if (page === "notificaciones" && notifications.length === 0 && !notificationsLoading) fetchNotifications();
    if (page === "roles" && permissions.length === 0 && !permissionsLoading) {
      if (roleTab === "alumno") {
        setPermissions([]);
        setRolePermissions(new Set());
      } else {
        fetchPermissions(roleTab);
      }
    }
  }, [
    fetchLogs,
    fetchNotifications,
    fetchPermissions,
    logs.length,
    logsLoading,
    notifications.length,
    notificationsLoading,
    page,
    permissions.length,
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

  const metrics = useMemo(() => {
    const byRole = (role: Role) => users.filter((u) => u.role === role);
    const count = (arr: AdminUser[], st: Status) => arr.filter((u) => u.status === st).length;
    const roles: Role[] = ["talento", "universidad", "empresa", "alumno"];
    return roles.map((r) => {
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
    { key: "usuarios", label: "Usuarios", icon: "people-outline" },
    { key: "reportes", label: "Reportes", icon: "bar-chart-outline" },
    { key: "notificaciones", label: "Inbox", icon: "notifications-outline" },
    { key: "roles", label: "Permisos", icon: "key-outline" },
    { key: "logs", label: "Logs", icon: "receipt-outline" },
    { key: "config", label: "Config", icon: "settings-outline" },
  ];

  const Brand = () => (
    <View style={s.brandRow}>
      <Image source={gradlyLogo} style={s.brandImg} />
      <View style={s.brandDivider} />
      <Image source={empresaLogo} style={s.brandImgSecondary} />
    </View>
  );

  const Drawer = () => (
    <Modal visible={drawerOpen} transparent animationType="fade" onRequestClose={() => setDrawerOpen(false)}>
      <View style={s.drawerOverlay}>
        <View style={[s.drawerPanel, isWide && { width: 340 }]}>
          <View style={s.drawerHeader}>
            <View style={{ flex: 1, gap: 6 }}>
              <Brand />
              <View>
                <Text style={s.drawerTitle}>{meName}</Text>
                <Text style={s.drawerSub}>{meEmail ?? "Admin"}</Text>
              </View>
            </View>
            <TouchableOpacity style={s.iconBtn} onPress={() => setDrawerOpen(false)} activeOpacity={0.8}>
              <Ionicons name="close" size={20} color={C.text} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} style={s.drawerBody}>
            {navItems.map((it) => {
              const active = page === it.key;
              return (
                <TouchableOpacity
                  key={it.key}
                  style={[s.sidebarItem, active && s.sidebarItemActive]}
                  onPress={() => {
                    setPage(it.key);
                    setDrawerOpen(false);
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name={it.icon} size={18} color={active ? C.accent70 : C.textMuted} />
                  <Text style={[s.sidebarItemText, active && s.sidebarItemTextActive]}>{it.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
        <TouchableOpacity style={s.drawerBackdrop} onPress={() => setDrawerOpen(false)} activeOpacity={1} />
      </View>
    </Modal>
  );

  const renderResumen = () => {
    const cardMinWidth = isWide ? "23%" : width >= 600 ? "48%" : "100%";
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={usersRefreshing} onRefresh={refreshUsers} tintColor={C.accent70} />}
      >
        <View style={s.sectionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.kicker}>Admin</Text>
            <Text style={s.pageTitle}>Resumen</Text>
            <Text style={[s.textMuted, { marginTop: 6 }]}>Usuarios desde Firestore (colección usuarios).</Text>
          </View>
          <TouchableOpacity style={s.btnOutline} onPress={() => setPage("notificaciones")} activeOpacity={0.8}>
            <Text style={s.btnOutlineText}>Ver inbox</Text>
          </TouchableOpacity>
        </View>

        {usersLoading ? (
          <View style={{ paddingVertical: 28, alignItems: "center" }}>
            <ActivityIndicator color={C.accent70} />
            <Text style={[s.textMuted, { marginTop: 10 }]}>Cargando…</Text>
          </View>
        ) : (
          <View style={s.grid2}>
            {metrics.map((m) => {
              const pendientes = m.pending;
              return (
                <TouchableOpacity
                  key={m.role}
                  style={[s.card, { flex: 1, minWidth: cardMinWidth }]}
                  onPress={() => {
                    setPage("usuarios");
                    setRoleTab(m.role);
                    setStatusFilter("todos");
                    setSearch("");
                  }}
                  activeOpacity={0.85}
                >
                  <View style={[s.row, { justifyContent: "space-between", marginBottom: 10 }]}>
                    <Ionicons
                      name={
                        m.role === "talento"
                          ? "person-outline"
                          : m.role === "universidad"
                            ? "school-outline"
                            : m.role === "empresa"
                              ? "business-outline"
                              : "book-outline"
                      }
                      size={20}
                      color={C.accent70}
                    />
                    {pendientes > 0 ? <Badge label={`${pendientes} pendientes`} type="pending" /> : null}
                  </View>
                  <Text style={s.cardTitle}>{labelRole(m.role)}</Text>
                  <Text style={[s.textMuted, { marginTop: 6 }]}>{m.total} registros</Text>
                  <View style={{ height: 8 }} />
                  <Text style={[s.textMuted, { fontSize: 12 }]}>
                    Activos: {m.active} · Inactivos: {m.inactive}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <Card style={{ marginTop: 14, marginBottom: 24 }}>
          <Text style={s.cardTitle}>Acciones rápidas</Text>
          <View style={[s.chipRow, { marginTop: 12 }]}>
            <Chip
              label="Pendientes"
              active={false}
              onPress={() => {
                setPage("usuarios");
                setStatusFilter("pending");
              }}
            />
            <Chip label="Reportes" active={false} onPress={() => setPage("reportes")} />
            <Chip label="Permisos" active={false} onPress={() => setPage("roles")} />
            <Chip label="Logs" active={false} onPress={() => setPage("logs")} />
          </View>
        </Card>
      </ScrollView>
    );
  };

  const RoleHeader = () => (
    <View style={s.sectionHeader}>
      <View style={{ flex: 1 }}>
        <Text style={s.kicker}>Administración</Text>
        <Text style={s.pageTitle}>{labelRole(roleTab)}</Text>
        <Text style={[s.textMuted, { marginTop: 6 }]}>Gestión sobre tabla profiles.</Text>
      </View>
      <TouchableOpacity style={s.btnOutline} onPress={refreshUsers} activeOpacity={0.8}>
        <Text style={s.btnOutlineText}>Actualizar</Text>
      </TouchableOpacity>
    </View>
  );

  const renderUsuarios = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
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
          {(["talento", "universidad", "empresa", "alumno"] as Role[]).map((r) => (
            <Chip
              key={r}
              label={labelRole(r)}
              active={roleTab === r}
              onPress={() => {
                setRoleTab(r);
                setSearch("");
                if (page === "roles" && r !== "alumno") fetchPermissions(r);
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
            <TouchableOpacity key={u.id} style={s.listItem} onPress={() => openDetail(u)} activeOpacity={0.8}>
              <View style={s.avatar}>
                <Text style={s.avatarText}>{(u.nombre || u.email).trim().charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.itemTitle}>{u.nombre}</Text>
                <Text style={s.itemSub}>{u.email}</Text>
                <Text style={[s.itemSub, { marginTop: 4 }]}>{u.username}</Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
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
    const roleSum = (r: Role) => metrics.find((m) => m.role === r);
    const total = users.length || 1;
    const bar = (n: number, color: string) => (
      <View style={[s.progressWrap, { marginTop: 10 }]}>
        <View style={[s.progressBar, { width: `${Math.round((n / total) * 100)}%` as any, backgroundColor: color }]} />
      </View>
    );
    return (
      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={usersRefreshing} onRefresh={refreshUsers} />}>
        <View style={s.sectionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.kicker}>Insights</Text>
            <Text style={s.pageTitle}>Reportes</Text>
            <Text style={[s.textMuted, { marginTop: 6 }]}>Métricas en tiempo real según profiles.</Text>
          </View>
        </View>

        <Card style={{ marginBottom: 14 }}>
          <Text style={s.cardTitle}>Distribución por rol</Text>
          {(["talento", "universidad", "empresa", "alumno"] as Role[]).map((r) => {
            const sum = roleSum(r);
            const n = sum?.total ?? 0;
            return (
              <View key={r} style={{ marginTop: 14 }}>
                <View style={[s.row, { justifyContent: "space-between" }]}>
                  <Text style={s.itemTitle}>{labelRole(r)}</Text>
                  <Text style={s.textMuted}>{n}</Text>
                </View>
                {bar(n, C.accent70)}
              </View>
            );
          })}
        </Card>

        <Card style={{ marginBottom: 24 }}>
          <Text style={s.cardTitle}>Pendientes por rol</Text>
          {(["talento", "universidad", "empresa", "alumno"] as Role[]).map((r) => {
            const sum = roleSum(r);
            const n = sum?.pending ?? 0;
            return (
              <View key={r} style={{ marginTop: 14 }}>
                <View style={[s.row, { justifyContent: "space-between" }]}>
                  <Text style={s.itemTitle}>{labelRole(r)}</Text>
                  <Badge label={`${n} pendientes`} type="pending" />
                </View>
                {bar(n, C.yellow)}
              </View>
            );
          })}
        </Card>
      </ScrollView>
    );
  };

  const renderNotificaciones = () => (
    <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={notificationsLoading} onRefresh={fetchNotifications} />}>
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
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={permissionsLoading}
            onRefresh={() => {
              if (roleTab !== "alumno") fetchPermissions(roleTab);
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
            {(["talento", "universidad", "empresa"] as PermissionRole[]).map((r) => (
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
        ) : roleTab === "alumno" ? (
          <Card style={{ marginBottom: 24 }}>
            <Text style={s.cardTitle}>Permisos no configurados</Text>
            <Text style={[s.textMuted, { marginTop: 10, lineHeight: 20 }]}>
              El rol Alumno no tiene permisos administrables en esta sección. Selecciona Talento, Universidad o Empresa.
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
    <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={logsLoading} onRefresh={fetchLogs} />}>
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
    <ScrollView showsVerticalScrollIndicator={false}>
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
            await signOut(auth);
            Alert.alert("Sesión cerrada", "Se cerró la sesión correctamente.");
          }}
          activeOpacity={0.85}
        >
          <Text style={s.btnPrimaryText}>Cerrar sesión</Text>
        </TouchableOpacity>
      </Card>
    </ScrollView>
  );

  const DetailModal = () => (
    <Modal visible={detailOpen} transparent animationType="slide" onRequestClose={() => setDetailOpen(false)}>
      <View style={s.modalOverlay}>
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Detalle</Text>
            <TouchableOpacity style={[s.iconBtn, { width: 38, height: 38 }]} onPress={() => setDetailOpen(false)} activeOpacity={0.8}>
              <Ionicons name="close" size={20} color={C.text} />
            </TouchableOpacity>
          </View>

          {selected ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Card>
                <View style={[s.row, { justifyContent: "space-between", marginBottom: 10 }]}>
                  <Text style={s.cardTitle}>{selected.nombre}</Text>
                  <Badge label={statusBadgeLabel(selected.status)} type={selected.status} />
                </View>
                <Text style={s.textMuted}>Rol: {labelRole(selected.role)}</Text>
                <Text style={[s.textMuted, { marginTop: 6 }]}>Email: {selected.email}</Text>
                <Text style={[s.textMuted, { marginTop: 6 }]}>Username: {selected.username}</Text>
                {selected.departamento ? <Text style={[s.textMuted, { marginTop: 6 }]}>Depto: {selected.departamento}</Text> : null}
                {selected.ciudad ? <Text style={[s.textMuted, { marginTop: 6 }]}>Ciudad: {selected.ciudad}</Text> : null}
              </Card>

              <Card style={{ marginTop: 12 }}>
                <Text style={s.cardTitle}>Acciones</Text>
                <View style={[s.row, { gap: 10, marginTop: 12, flexWrap: "wrap" }]}>
                  <TouchableOpacity style={[s.btnPrimary, s.btnSm]} onPress={() => openEdit(selected)} activeOpacity={0.8}>
                    <Text style={[s.btnPrimaryText, s.btnSmText]}>Editar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.btnOutline, s.btnSm]} onPress={() => setProfileStatus(selected, "pending")} activeOpacity={0.8}>
                    <Text style={[s.btnOutlineText, s.btnSmText]}>Pendiente</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.btnPrimary, s.btnSm, { backgroundColor: C.green }]}
                    onPress={() => setProfileStatus(selected, "active")}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.btnPrimaryText, s.btnSmText]}>Aprobar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.btnPrimary, s.btnSm, { backgroundColor: C.red }]}
                    onPress={() => setProfileStatus(selected, "inactive")}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.btnPrimaryText, s.btnSmText]}>Inactivar</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ height: 10 }} />
                <Text style={[s.textMuted, { fontSize: 11, letterSpacing: 0.8 }]}>CAMBIAR ROL</Text>
                <View style={[s.chipRow, { marginTop: 10 }]}>
                  {(["talento", "universidad", "empresa", "alumno"] as Role[]).map((r) => (
                    <Chip key={r} label={labelRole(r)} active={selected.role === r} onPress={() => setProfileRole(selected, r)} />
                  ))}
                </View>
              </Card>
              <View style={{ height: 18 }} />
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );

  const EditModal = () => (
    <Modal visible={editOpen} transparent animationType="slide" onRequestClose={() => setEditOpen(false)}>
      <View style={s.modalOverlay}>
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Editar perfil</Text>
            <TouchableOpacity style={[s.iconBtn, { width: 38, height: 38 }]} onPress={() => setEditOpen(false)} activeOpacity={0.8}>
              <Ionicons name="close" size={20} color={C.text} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={s.inputLabel}>Nombre</Text>
            <TextInput style={s.input} value={editNombre} onChangeText={setEditNombre} placeholder="Nombre" placeholderTextColor={C.textMuted} />
            <Text style={[s.inputLabel, { marginTop: 12 }]}>Teléfono</Text>
            <TextInput style={s.input} value={editTelefono} onChangeText={setEditTelefono} placeholder="+503..." placeholderTextColor={C.textMuted} />
            <View style={[s.row, { gap: 12, marginTop: 12 }]}>
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

  const renderBody = () => {
    switch (page) {
      case "resumen":
        return renderResumen();
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

  return (
    <View style={s.root}>
      <View style={s.topbar}>
        <View style={s.topbarLeft}>
          <TouchableOpacity style={s.iconBtn} onPress={() => setDrawerOpen(true)} activeOpacity={0.8}>
            <Ionicons name="menu" size={20} color={C.text} />
          </TouchableOpacity>
          <Brand />
          <View style={{ flex: 1 }}>
            <Text style={s.topbarTitle}>{meName}</Text>
            <Text style={s.topbarSubtitle}>Administrador</Text>
          </View>
        </View>
        <View style={s.topbarRight}>
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

      <View style={s.main}>
        <View style={s.content}>{renderBody()}</View>
      </View>

      <DetailModal />
      <EditModal />
      <Drawer />
    </View>
  );
}
