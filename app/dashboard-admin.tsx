import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    RefreshControl,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { supabase } from "../lib/supabase";
import UniversalHeader from "../src/components/UniversalHeader";
import handleLogout from "../src/services/authService";
import { C, s } from "./admin/adminStyles";

type AdminPage = "resumen" | "usuarios" | "reportes" | "ayuda" | "config" | "crear";
type Role = "talento" | "universidad" | "empresa" | "alumno";
type Status = "activo" | "pendiente" | "bloqueado";

type AdminUser = {
  id: string;
  role: Role;
  status: Status;
  nombre: string;
  correo: string;
  org?: string;
  ciudad?: string;
  profileId?: string;
};

const ADMIN_SERVICE_URL = "https://kbevyjupphyxrgcvdsgv.supabase.co";
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtiZXZ5anVwcGh5eHJnY3Zkc2d2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODY4ODA2NCwiZXhwIjoyMDk0MjY0MDY0fQ.wm_Z0dhr2tnlQO4t2Wrdi4AEqU0i-nBrWqNFu_hOQIU";

const mapStatus = (value: string | null | undefined): Status => {
  if (!value) return "pendiente";
  const normalized = String(value).toLowerCase();
  if (normalized === "activo" || normalized === "active") return "activo";
  if (normalized === "pendiente" || normalized === "pending") return "pendiente";
  if (
    normalized === "bloqueado" ||
    normalized === "inactive" ||
    normalized === "blocked" ||
    normalized === "suspended"
  ) {
    return "bloqueado";
  }
  return "pendiente";
};

const toDbStatus = (status: Status) => {
  if (status === "activo") return "active";
  if (status === "bloqueado") return "inactive";
  return "pending";
};

const withTimeout = async <T,>(promise: Promise<T>, ms = 15000) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Tiempo de espera agotado.")), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

function useAdminData() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const [
        talentosResp,
        universidadesResp,
        empresasResp,
        alumnosResp,
        profilesResp,
      ] = await Promise.all([
        supabase.from("talentos").select("id,nombre,email,ciudad"),
        supabase
          .from("universidades")
          .select("id,nombre,email_institucional,ciudad"),
        supabase.from("empresas").select("id,nombre,email_corporativo,ciudad"),
        supabase.from("alumnos").select("id,nombre,email,ciudad"),
        supabase.from("profiles").select("id,email,status,nombre,role"),
      ]);

      if (
        talentosResp.error ||
        universidadesResp.error ||
        empresasResp.error ||
        alumnosResp.error ||
        profilesResp.error
      ) {
        const error =
          talentosResp.error ||
          universidadesResp.error ||
          empresasResp.error ||
          alumnosResp.error ||
          profilesResp.error;
        throw error;
      }

      const profiles = (profilesResp.data ?? []) as any[];
      const profileIndex = new Map<string, any>();
      profiles.forEach((profile) => {
        if (profile?.id) profileIndex.set(String(profile.id), profile);
        if (profile?.email)
          profileIndex.set(String(profile.email).toLowerCase(), profile);
      });

      const getProfile = (id: string, email?: string) => {
        return (
          profileIndex.get(id) ??
          (email ? profileIndex.get(email.toLowerCase()) : undefined)
        );
      };

      const mapUsers = (
        rows: any[],
        role: Role,
        emailKey: string,
        nameKey = "nombre",
        orgLabel?: string,
      ) => {
        return rows.map((item) => {
          const correo = item[emailKey] ?? "";
          const profile = getProfile(item.id, correo);
          return {
            id: String(item.id),
            role,
            status: mapStatus(profile?.status),
            nombre: item[nameKey] ?? profile?.nombre ?? "Sin nombre",
            correo,
            org: orgLabel
              ? (item[orgLabel] ?? profile?.nombre)
              : (item.nombre ?? undefined),
            ciudad: item.ciudad ?? undefined,
            profileId: profile?.id ? String(profile.id) : undefined,
          } as AdminUser;
        });
      };

      const usersData: AdminUser[] = [
        ...mapUsers(talentosResp.data ?? [], "talento", "email"),
        ...mapUsers(
          universidadesResp.data ?? [],
          "universidad",
          "email_institucional",
          "nombre",
          "nombre",
        ),
        ...mapUsers(
          empresasResp.data ?? [],
          "empresa",
          "email_corporativo",
          "nombre",
          "nombre",
        ),
        ...mapUsers(alumnosResp.data ?? [], "alumno", "email"),
      ];

      setUsers(usersData);
      setLoading(false);
      return usersData;
    } catch (err: any) {
      Alert.alert(
        "Error",
        err?.message ?? "No se pudo cargar la información de usuarios.",
      );
      setUsers([]);
      setLoading(false);
      return [] as AdminUser[];
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await fetchUsers();
    } finally {
      setRefreshing(false);
    }
  }, [fetchUsers]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  return {
    users,
    loading,
    refreshing,
    refresh,
    refetch: fetchUsers,
  };
}

function Badge({ label, type }: { label: string; type: Status }) {
  const map: Record<Status, { bg: string; border: string; text: string }> = {
    activo: {
      bg: C.greenBg,
      border: "rgba(52,211,153,0.30)",
      text: C.green,
    },
    pendiente: {
      bg: C.yellowBg,
      border: "rgba(245,158,11,0.30)",
      text: C.yellow,
    },
    bloqueado: {
      bg: C.redBg,
      border: "rgba(239,68,68,0.30)",
      text: "rgba(252,165,165,1)",
    },
  };
  const col = map[type];
  return (
    <View
      style={[s.badge, { backgroundColor: col.bg, borderColor: col.border }]}
    >
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

export default function DashboardAdmin() {
  const router = useRouter();
  const [page, setPage] = useState<AdminPage>("resumen");
  const [adminUserId, setAdminUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setAdminUserId(data.user.id);
    });
    loadKpis();
  }, []);

  useEffect(() => {
    if (page === "reportes") loadReportes();
    if (page === "ayuda") loadMensajesAyuda();
  }, [page]);

  const [roleTab, setRoleTab] = useState<Role>("talento");
  const [statusFilter, setStatusFilter] = useState<Status | "todos">("todos");
  const [search, setSearch] = useState("");

  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [banModalOpen, setBanModalOpen] = useState(false);
  const [banMotivo, setBanMotivo] = useState("");
  const [banHasta, setBanHasta] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // ── Reportes ────────────────────────────────────────────────────────────────
  const [reportes, setReportes] = useState<any[]>([]);
  const [loadingReportes, setLoadingReportes] = useState(false);

  // ── Mensajes ayuda ──────────────────────────────────────────────────────────
  const [mensajesAyuda, setMensajesAyuda] = useState<any[]>([]);
  const [loadingAyuda, setLoadingAyuda] = useState(false);
  const [respuestaAyuda, setRespuestaAyuda] = useState("");
  const [selectedAyuda, setSelectedAyuda] = useState<any | null>(null);
  const [sendingRespuesta, setSendingRespuesta] = useState(false);

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const [kpis, setKpis] = useState({ vacantesActivas: 0, solicitudesPendientes: 0, reportesPendientes: 0, mensajesAyudaPendientes: 0 });
  const [loadingKpis, setLoadingKpis] = useState(false);

  const { users, loading, refreshing, refresh, refetch } = useAdminData();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (u.role !== roleTab) return false;
      if (statusFilter !== "todos" && u.status !== statusFilter) return false;
      if (!q) return true;
      const haystack =
        `${u.nombre} ${u.correo} ${u.org ?? ""} ${u.ciudad ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [users, roleTab, statusFilter, search]);

  const openDetail = (u: AdminUser) => {
    setSelected(u);
    setDetailOpen(true);
  };

  const noop = () =>
    Alert.alert("Próximamente", "Esta función estará disponible pronto.");

  const updateProfileStatus = async (u: AdminUser, nextStatus: Status) => {
    setActionLoading(true);
    try {
      const profileId = u.profileId ?? u.id;
      const dbStatus = toDbStatus(nextStatus);
      const { data, error } = await withTimeout(
        supabase
          .from("profiles")
          .update({ status: dbStatus })
          .eq("id", profileId)
          .select("status")
          .maybeSingle(),
      );

      if (error) {
        Alert.alert(
          "Error",
          error.message || "No se pudo actualizar el estado.",
        );
        return;
      }

      if (!data) {
        Alert.alert(
          "Error",
          "No se pudo actualizar el estado. Verifica permisos (RLS) o que el perfil exista.",
        );
        return;
      }

      const updatedStatus = mapStatus((data as any)?.status);
      setSelected((prev) =>
        prev?.id === u.id ? { ...prev, status: updatedStatus } : prev,
      );
      await refetch();
    } catch (e: any) {
      Alert.alert(
        "Error",
        e?.message ?? "No se pudo actualizar el estado.",
      );
    } finally {
      setActionLoading(false);
    }
  };

  const loadReportes = async () => {
    setLoadingReportes(true);
    const { data } = await supabase
      .from("reportes")
      .select("*")
      .order("created_at", { ascending: false });
    setReportes(data ?? []);
    setLoadingReportes(false);
  };

  const loadMensajesAyuda = async () => {
    setLoadingAyuda(true);
    const { data } = await supabase
      .from("mensajes_ayuda")
      .select("*")
      .order("created_at", { ascending: false });
    setMensajesAyuda(data ?? []);
    setLoadingAyuda(false);
  };

  const loadKpis = async () => {
    setLoadingKpis(true);
    const [{ count: vAct }, { count: solPend }, { count: repPend }, { count: ayudaPend }] =
      await Promise.all([
        supabase.from("vacantes").select("*", { count: "exact", head: true }).eq("estado", "activa"),
        supabase.from("solicitudes_horas").select("*", { count: "exact", head: true }).eq("estado", "pendiente"),
        supabase.from("reportes").select("*", { count: "exact", head: true }).eq("estado", "pendiente"),
        supabase.from("mensajes_ayuda").select("*", { count: "exact", head: true }).is("respondido_en", null),
      ]);
    setKpis({
      vacantesActivas: vAct ?? 0,
      solicitudesPendientes: solPend ?? 0,
      reportesPendientes: repPend ?? 0,
      mensajesAyudaPendientes: ayudaPend ?? 0,
    });
    setLoadingKpis(false);
  };

  const banearUsuario = async (u: AdminUser) => {
    if (!banMotivo.trim()) {
      Alert.alert("Requerido", "Escribe el motivo del baneo.");
      return;
    }
    setActionLoading(true);
    try {
      const TABLE_MAP: Record<Role, string> = {
        talento: "talentos", alumno: "alumnos", empresa: "empresas", universidad: "universidades",
      };
      const tabla = TABLE_MAP[u.role];
      const { error: banError } = await withTimeout(
        supabase
          .from(tabla)
          .update({
            baneado: true,
            motivo_baneo: banMotivo.trim(),
            baneo_hasta: banHasta.trim() || null,
          })
          .eq("id", u.id),
      );
      if (banError) throw banError;

      // Also block profile
      const { error: profileError } = await withTimeout(
        supabase
          .from("profiles")
          .update({ status: toDbStatus("bloqueado") })
          .eq("id", u.profileId ?? u.id),
      );
      if (profileError) throw profileError;

      Alert.alert("Usuario baneado", `${u.nombre} ha sido suspendido.`);
      setBanModalOpen(false);
      setBanMotivo("");
      setBanHasta("");
      await refetch();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo banear.");
    } finally {
      setActionLoading(false);
    }
  };

  const desbanearUsuario = async (u: AdminUser) => {
    setActionLoading(true);
    try {
      const TABLE_MAP: Record<Role, string> = {
        talento: "talentos", alumno: "alumnos", empresa: "empresas", universidad: "universidades",
      };
      const tabla = TABLE_MAP[u.role];
      const { error: unbanError } = await withTimeout(
        supabase
          .from(tabla)
          .update({
            baneado: false,
            motivo_baneo: null,
            baneo_hasta: null,
          })
          .eq("id", u.id),
      );
      if (unbanError) throw unbanError;
      const { error: profileError } = await withTimeout(
        supabase
          .from("profiles")
          .update({ status: toDbStatus("activo") })
          .eq("id", u.profileId ?? u.id),
      );
      if (profileError) throw profileError;
      Alert.alert("Usuario desbaneado", `${u.nombre} ha sido reactivado.`);
      await refetch();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo desbanear.");
    } finally {
      setActionLoading(false);
    }
  };

  const resolverReporte = async (reporteId: string) => {
    await supabase.from("reportes").update({ estado: "resuelto" }).eq("id", reporteId);
    setReportes((p) => p.map((r) => r.id === reporteId ? { ...r, estado: "resuelto" } : r));
  };

  const responderAyuda = async () => {
    if (!selectedAyuda || !respuestaAyuda.trim()) return;
    setSendingRespuesta(true);
    try {
      await supabase.from("mensajes_ayuda").update({
        respuesta: respuestaAyuda.trim(),
        respondido_en: new Date().toISOString(),
      }).eq("id", selectedAyuda.id);

      await supabase.from("notificaciones").insert({
        usuario_id: selectedAyuda.user_id,
        tipo: "ayuda",
        titulo: "Respuesta de soporte",
        mensaje: respuestaAyuda.trim(),
        leida: false,
      });

      setMensajesAyuda((p) => p.map((m) => m.id === selectedAyuda.id
        ? { ...m, respuesta: respuestaAyuda.trim(), respondido_en: new Date().toISOString() }
        : m
      ));
      setSelectedAyuda(null);
      setRespuestaAyuda("");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo enviar respuesta.");
    } finally {
      setSendingRespuesta(false);
    }
  };

  const handleCreateAdmin = async () => {
    if (!adminName.trim() || !adminEmail.trim() || !adminPassword.trim()) {
      Alert.alert(
        "Validación",
        "Nombre, correo y contraseña son obligatorios.",
      );
      return;
    }

    setActionLoading(true);
    try {
      const username = adminEmail.split("@")[0] || adminEmail;
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: adminEmail.trim(),
        password: adminPassword,
        options: {
          data: {
            role: "universidad",
            nombre: adminName.trim(),
            username,
          },
        },
      });

      if (authError) {
        Alert.alert(
          "Error",
          authError.message || "No se pudo crear el usuario.",
        );
        return;
      }

      const userId = authData.user?.id;
      if (!userId) {
        Alert.alert("Error", "No se pudo crear el usuario.");
        return;
      }

      const { error: profileError } = await supabase.from("profiles").insert({
        id: userId,
        email: adminEmail.trim(),
        username,
        role: "universidad",
        nombre: adminName.trim(),
        status: "active",
      });

      if (profileError) {
        Alert.alert(
          "Error",
          profileError.message || "Error al crear el perfil.",
        );
        return;
      }

      Alert.alert(
        "Creado",
        "Usuario creado con éxito. Revisa la bandeja de correo para activar la cuenta.",
      );
      setAdminName("");
      setAdminEmail("");
      setAdminPassword("");
      refetch();
      setPage("usuarios");
    } catch (error: any) {
      Alert.alert("Error", error?.message || "No se pudo crear el usuario.");
    } finally {
      setActionLoading(false);
    }
  };

  const onLogout = async () => {
    try {
      await handleLogout(router);
    } catch {
      router.replace("/" as any);
    }
  };

  const labelRole = (r: Role) =>
    r === "talento"
      ? "Talentos"
      : r === "universidad"
        ? "Universidades"
        : r === "empresa"
          ? "Empresas"
          : "Alumnos";

  const labelStatus = (st: Status | "todos") =>
    st === "todos"
      ? "Todos"
      : st === "activo"
        ? "Activos"
        : st === "pendiente"
          ? "Pendientes"
          : "Bloqueados";

  const RoleHeader = () => (
    <View style={s.sectionHeader}>
      <View style={{ flex: 1 }}>
        <Text style={s.kicker}>Administración</Text>
        <Text style={s.pageTitle}>{labelRole(roleTab)}</Text>
        <Text style={[s.textMuted, { marginTop: 6 }]}>
          Frontend de administración (solo UI) para gestionar roles.
        </Text>
      </View>
      <TouchableOpacity
        style={s.btnPrimary}
        onPress={() => setPage("crear")}
        activeOpacity={0.8}
      >
        <Text style={s.btnPrimaryText}>+ Crear</Text>
      </TouchableOpacity>
    </View>
  );

  const renderResumen = () => {
    const total = users.length;
    const activos = users.filter((u) => u.status === "activo").length;
    const pendientes = users.filter((u) => u.status === "pendiente").length;
    const bloqueados = users.filter((u) => u.status === "bloqueado").length;

    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { await refresh(); await loadKpis(); }}
            tintColor={C.accent70}
          />
        }
      >
        <View style={s.sectionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.kicker}>Panel admin</Text>
            <Text style={s.pageTitle}>Resumen</Text>
            <Text style={[s.textMuted, { marginTop: 6 }]}>
              Revisión rápida de usuarios por rol y estado.
            </Text>
          </View>
        </View>

        {/* KPIs de plataforma */}
        <Card style={{ marginTop: 14 }}>
          <Text style={s.cardTitle}>KPIs de plataforma</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
            {[
              { label: "Vacantes activas", value: kpis.vacantesActivas, color: C.accent70 },
              { label: "Horas pendientes", value: kpis.solicitudesPendientes, color: C.yellow },
              { label: "Reportes pendientes", value: kpis.reportesPendientes, color: C.red },
              { label: "Ayuda sin responder", value: kpis.mensajesAyudaPendientes, color: C.green },
            ].map((item) => (
              <View key={item.label} style={{ flex: 1, minWidth: "45%", padding: 14, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 16 }}>
                <Text style={[s.textMuted, { fontSize: 11, marginBottom: 6 }]}>{item.label}</Text>
                <Text style={{ color: item.color, fontSize: 28, fontWeight: "800" }}>{item.value}</Text>
              </View>
            ))}
          </View>
        </Card>

        <Card style={{ marginTop: 14 }}>
          <Text style={s.cardTitle}>Usuarios registrados</Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "space-between",
              gap: 10,
              marginTop: 12,
            }}
          >
            {[
              { label: "Total", value: total },
              { label: "Activos", value: activos },
              { label: "Pendientes", value: pendientes },
              { label: "Bloqueados", value: bloqueados },
            ].map((item) => (
              <View
                key={item.label}
                style={{
                  flex: 1,
                  minWidth: "45%",
                  padding: 14,
                  backgroundColor: "rgba(255,255,255,0.04)",
                  borderRadius: 16,
                }}
              >
                <Text style={[s.textMuted, { fontSize: 12, marginBottom: 6 }]}>
                  {item.label}
                </Text>
                <Text style={[s.cardTitle, { marginTop: 0 }]}>
                  {item.value}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        {loading ? (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <ActivityIndicator size="large" color={C.accent70} />
          </View>
        ) : (
          <View style={s.grid2}>
            {(
              [
                {
                  role: "talento" as const,
                  icon: "person-outline",
                  label: "Talentos",
                },
                {
                  role: "universidad" as const,
                  icon: "school-outline",
                  label: "Universidades",
                },
                {
                  role: "empresa" as const,
                  icon: "business-outline",
                  label: "Empresas",
                },
                {
                  role: "alumno" as const,
                  icon: "book-outline",
                  label: "Alumnos",
                },
              ] as const
            ).map((it) => {
              const total = users.filter((d) => d.role === it.role).length;
              const pendientes = users.filter(
                (d) => d.role === it.role && d.status === "pendiente",
              ).length;
              return (
                <TouchableOpacity
                  key={it.role}
                  style={[s.card, { flex: 1, minWidth: "45%" }]}
                  onPress={() => {
                    setPage("usuarios");
                    setRoleTab(it.role);
                    setStatusFilter("todos");
                    setSearch("");
                  }}
                  activeOpacity={0.85}
                >
                  <View
                    style={[
                      s.row,
                      { justifyContent: "space-between", marginBottom: 10 },
                    ]}
                  >
                    <Ionicons name={it.icon} size={20} color={C.accent70} />
                    {pendientes > 0 ? (
                      <Badge
                        label={`${pendientes} pendientes`}
                        type="pendiente"
                      />
                    ) : null}
                  </View>
                  <Text style={s.cardTitle}>{it.label}</Text>
                  <Text style={[s.textMuted, { marginTop: 6 }]}>
                    {total} registros
                  </Text>
                  <View style={{ height: 8 }} />
                  <Text style={[s.textMuted, { fontSize: 12 }]}>
                    Ver lista →
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <Card style={{ marginTop: 14 }}>
          <Text style={s.cardTitle}>Acciones rápidas</Text>
          <View style={[s.chipRow, { marginTop: 12 }]}>
            <Chip
              label="Ver pendientes"
              active={false}
              onPress={() => {
                setPage("usuarios");
                setStatusFilter("pendiente");
              }}
            />
            <Chip
              label="Reportes"
              active={false}
              onPress={() => {
                loadReportes();
                setPage("reportes");
              }}
            />
            <Chip
              label="Mensajes ayuda"
              active={false}
              onPress={() => {
                loadMensajesAyuda();
                setPage("ayuda");
              }}
            />
          </View>
        </Card>
        <View style={{ height: 24 }} />
      </ScrollView>
    );
  };

  const renderUsuarios = () => (
    <View style={{ flex: 1 }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={C.accent70}
          />
        }
      >
        <RoleHeader />

        <Card style={{ marginBottom: 14 }}>
          <View style={s.searchWrap}>
            <Ionicons name="search-outline" size={18} color={C.textMuted} />
            <TextInput
              style={s.searchInput}
              placeholder="Buscar por nombre, correo, ciudad…"
              placeholderTextColor={C.textMuted}
              value={search}
              onChangeText={setSearch}
            />
          </View>
        </Card>

        <View style={{ marginBottom: 14 }}>
          <Text
            style={[
              s.textMuted,
              { fontSize: 11, letterSpacing: 0.8, marginBottom: 8 },
            ]}
          >
            ROL
          </Text>
          <View style={s.chipRow}>
            {(["talento", "universidad", "empresa", "alumno"] as Role[]).map(
              (r) => (
                <Chip
                  key={r}
                  label={labelRole(r)}
                  active={roleTab === r}
                  onPress={() => {
                    setRoleTab(r);
                    setSearch("");
                  }}
                />
              ),
            )}
          </View>
        </View>

        <View style={{ marginBottom: 10 }}>
          <Text
            style={[
              s.textMuted,
              { fontSize: 11, letterSpacing: 0.8, marginBottom: 8 },
            ]}
          >
            ESTADO
          </Text>
          <View style={s.chipRow}>
            {(
              ["todos", "activo", "pendiente", "bloqueado"] as Array<
                Status | "todos"
              >
            ).map((st) => (
              <Chip
                key={st}
                label={labelStatus(st)}
                active={statusFilter === st}
                onPress={() => setStatusFilter(st)}
              />
            ))}
          </View>
        </View>

        <Card style={{ marginBottom: 24 }}>
          <View
            style={[
              s.row,
              { justifyContent: "space-between", marginBottom: 10 },
            ]}
          >
            <Text style={s.cardTitle}>Listado</Text>
            <Text style={s.textMuted}>{filtered.length} resultado(s)</Text>
          </View>

          {filtered.length === 0 ? (
            <Text
              style={[
                s.textMuted,
                { textAlign: "center", paddingVertical: 20 },
              ]}
            >
              Sin resultados
            </Text>
          ) : (
            filtered.map((u) => (
              <TouchableOpacity
                key={u.id}
                style={s.listItem}
                onPress={() => openDetail(u)}
                activeOpacity={0.8}
              >
                <View style={s.avatar}>
                  <Text style={s.avatarText}>
                    {u.nombre.trim().charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.itemTitle}>{u.nombre}</Text>
                  <Text style={s.itemSub}>{u.correo}</Text>
                  {u.org || u.ciudad ? (
                    <Text style={[s.itemSub, { marginTop: 4 }]}>
                      {(u.org ? u.org : "") +
                        (u.org && u.ciudad ? " · " : "") +
                        (u.ciudad ? u.ciudad : "")}
                    </Text>
                  ) : null}
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <Badge
                    label={
                      u.status === "activo"
                        ? "Activo"
                        : u.status === "pendiente"
                          ? "Pendiente"
                          : "Bloqueado"
                    }
                    type={u.status}
                  />
                  <Ionicons
                    name="chevron-forward-outline"
                    size={16}
                    color={C.textMuted}
                  />
                </View>
              </TouchableOpacity>
            ))
          )}
        </Card>
      </ScrollView>
    </View>
  );

  const renderCrear = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={C.accent70}
        />
      }
    >
      <View style={s.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={s.kicker}>Crear administrador</Text>
          <Text style={s.pageTitle}>Nuevo usuario</Text>
          <Text style={[s.textMuted, { marginTop: 6 }]}>
            Crea un usuario de administración y gestiona su estado.
          </Text>
        </View>
      </View>

      <Card style={{ marginBottom: 14 }}>
        <Text style={s.cardTitle}>Información</Text>
        <TextInput
          style={s.input}
          placeholder="Nombre completo"
          placeholderTextColor={C.textMuted}
          value={adminName}
          onChangeText={setAdminName}
        />
        <TextInput
          style={s.input}
          placeholder="Correo electrónico"
          placeholderTextColor={C.textMuted}
          value={adminEmail}
          onChangeText={setAdminEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={s.input}
          placeholder="Contraseña"
          placeholderTextColor={C.textMuted}
          value={adminPassword}
          onChangeText={setAdminPassword}
          secureTextEntry
        />
        <TouchableOpacity
          style={[
            s.btnPrimary,
            { marginTop: 12, opacity: actionLoading ? 0.6 : 1 },
          ]}
          onPress={handleCreateAdmin}
          activeOpacity={0.85}
          disabled={actionLoading}
        >
          <Text style={s.btnPrimaryText}>
            {actionLoading ? "Creando..." : "Crear administrador"}
          </Text>
        </TouchableOpacity>
      </Card>

      <Card style={{ marginTop: 14, marginBottom: 24 }}>
        <Text style={s.cardTitle}>Notas</Text>
        <Text style={[s.textMuted, { marginTop: 10, lineHeight: 20 }]}>
          El usuario creado utilizará la misma tabla de perfiles y podrá
          aparecer en el panel de administración al refrescar.
        </Text>
      </Card>
    </ScrollView>
  );

  const renderReportes = () => (
    <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={loadingReportes} onRefresh={loadReportes} tintColor={C.accent70} />}>
      <View style={s.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={s.kicker}>Moderación</Text>
          <Text style={s.pageTitle}>Reportes</Text>
        </View>
      </View>
      {loadingReportes ? (
        <ActivityIndicator color={C.accent70} style={{ marginTop: 40 }} />
      ) : reportes.length === 0 ? (
        <Card><Text style={s.textMuted}>No hay reportes registrados.</Text></Card>
      ) : (
        reportes.map((r) => (
          <Card key={r.id} style={{ marginBottom: 12 }}>
            <View style={[s.row, { justifyContent: "space-between", marginBottom: 8 }]}>
              <Text style={s.cardTitle}>{r.razon ?? "Sin razón"}</Text>
              <View style={[s.badge, { backgroundColor: r.estado === "resuelto" ? C.greenBg : C.yellowBg, borderColor: r.estado === "resuelto" ? C.green : C.yellow }]}>
                <Text style={[s.badgeText, { color: r.estado === "resuelto" ? C.green : C.yellow }]}>
                  {r.estado ?? "pendiente"}
                </Text>
              </View>
            </View>
            <Text style={[s.textMuted, { fontSize: 12 }]}>Reportado: {r.reportado_id}</Text>
            <Text style={[s.textMuted, { fontSize: 12 }]}>Rol: {r.reportado_rol}</Text>
            {r.detalle ? <Text style={[s.textMuted, { fontSize: 12, marginTop: 4 }]}>{r.detalle}</Text> : null}
            {r.estado !== "resuelto" && (
              <TouchableOpacity
                style={[s.btnOutline, { marginTop: 10, borderColor: C.green }]}
                onPress={() => resolverReporte(r.id)}
              >
                <Text style={[s.btnOutlineText, { color: C.green }]}>Marcar como resuelto</Text>
              </TouchableOpacity>
            )}
          </Card>
        ))
      )}
    </ScrollView>
  );

  const renderAyuda = () => (
    <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={loadingAyuda} onRefresh={loadMensajesAyuda} tintColor={C.accent70} />}>
      <View style={s.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={s.kicker}>Soporte</Text>
          <Text style={s.pageTitle}>Mensajes de ayuda</Text>
        </View>
      </View>
      {loadingAyuda ? (
        <ActivityIndicator color={C.accent70} style={{ marginTop: 40 }} />
      ) : mensajesAyuda.length === 0 ? (
        <Card><Text style={s.textMuted}>No hay mensajes de ayuda.</Text></Card>
      ) : (
        mensajesAyuda.map((m) => (
          <Card key={m.id} style={{ marginBottom: 12 }}>
            <View style={[s.row, { justifyContent: "space-between", marginBottom: 6 }]}>
              <Text style={[s.textMuted, { fontSize: 11 }]}>Rol: {m.rol}</Text>
              {m.respondido_en ? (
                <View style={[s.badge, { backgroundColor: C.greenBg, borderColor: C.green }]}>
                  <Text style={[s.badgeText, { color: C.green }]}>Respondido</Text>
                </View>
              ) : (
                <View style={[s.badge, { backgroundColor: C.yellowBg, borderColor: C.yellow }]}>
                  <Text style={[s.badgeText, { color: C.yellow }]}>Pendiente</Text>
                </View>
              )}
            </View>
            <Text style={s.cardTitle}>{m.mensaje}</Text>
            {m.respuesta ? (
              <Text style={[s.textMuted, { fontSize: 12, marginTop: 6 }]}>Respuesta: {m.respuesta}</Text>
            ) : (
              <TouchableOpacity
                style={[s.btnOutline, { marginTop: 10 }]}
                onPress={() => setSelectedAyuda(m)}
              >
                <Text style={s.btnOutlineText}>Responder</Text>
              </TouchableOpacity>
            )}
          </Card>
        ))
      )}

      {/* Responder modal */}
      <Modal visible={!!selectedAyuda} transparent animationType="slide" onRequestClose={() => setSelectedAyuda(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Responder mensaje</Text>
              <TouchableOpacity style={[s.iconBtn, { width: 38, height: 38 }]} onPress={() => setSelectedAyuda(null)}>
                <Ionicons name="close" size={20} color={C.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 16 }}>
              <Text style={[s.textMuted, { marginBottom: 12 }]}>{selectedAyuda?.mensaje}</Text>
              <TextInput
                style={[s.input, { height: 100, textAlignVertical: "top" }]}
                multiline
                placeholder="Escribe tu respuesta..."
                placeholderTextColor={C.textMuted}
                value={respuestaAyuda}
                onChangeText={setRespuestaAyuda}
              />
              <TouchableOpacity
                style={[s.btnPrimary, { marginTop: 8, opacity: sendingRespuesta ? 0.6 : 1 }]}
                onPress={responderAyuda}
                disabled={sendingRespuesta}
              >
                <Text style={s.btnPrimaryText}>{sendingRespuesta ? "Enviando..." : "Enviar respuesta"}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );

  const renderConfig = () => (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={s.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={s.kicker}>Sistema</Text>
          <Text style={s.pageTitle}>Configuración</Text>
          <Text style={[s.textMuted, { marginTop: 6 }]}>
            Preferencias del panel y accesos.
          </Text>
        </View>
      </View>

      <Card style={{ marginBottom: 14 }}>
        <Text style={s.cardTitle}>Seguridad y accesos</Text>
        <Text style={[s.textMuted, { marginTop: 10, lineHeight: 20 }]}>
          Panel de administración Gradly. Gestiona usuarios, reportes y mensajes de soporte desde las pestañas inferiores.
        </Text>
        <View style={[s.row, { gap: 10, marginTop: 14, flexWrap: "wrap" }]}>
          <TouchableOpacity style={s.btnOutline} onPress={() => { loadReportes(); setPage("reportes"); }} activeOpacity={0.8}>
            <Text style={s.btnOutlineText}>Ver reportes</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btnOutline} onPress={() => { loadMensajesAyuda(); setPage("ayuda"); }} activeOpacity={0.8}>
            <Text style={s.btnOutlineText}>Ver mensajes ayuda</Text>
          </TouchableOpacity>
        </View>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <Text style={s.cardTitle}>Sesión</Text>
        <TouchableOpacity
          style={[s.btnPrimary, { marginTop: 14, backgroundColor: C.red }]}
          onPress={onLogout}
          activeOpacity={0.85}
        >
          <Text style={s.btnPrimaryText}>Cerrar sesión</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.btnOutline, { marginTop: 10 }]}
          onPress={() => router.replace("/" as any)}
          activeOpacity={0.85}
        >
          <Text style={s.btnOutlineText}>Ir al inicio</Text>
        </TouchableOpacity>
      </Card>
    </ScrollView>
  );

  const DetailModal = () => (
    <Modal
      visible={detailOpen}
      transparent
      animationType="slide"
      onRequestClose={() => setDetailOpen(false)}
    >
      <View style={s.modalOverlay}>
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Detalle</Text>
            <TouchableOpacity
              style={[s.iconBtn, { width: 38, height: 38 }]}
              onPress={() => setDetailOpen(false)}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={20} color={C.text} />
            </TouchableOpacity>
          </View>

          {selected ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Card>
                <View
                  style={[
                    s.row,
                    { justifyContent: "space-between", marginBottom: 10 },
                  ]}
                >
                  <Text style={s.cardTitle}>{selected.nombre}</Text>
                  <Badge
                    label={
                      selected.status === "activo"
                        ? "Activo"
                        : selected.status === "pendiente"
                          ? "Pendiente"
                          : "Bloqueado"
                    }
                    type={selected.status}
                  />
                </View>
                <Text style={s.textMuted}>Rol: {labelRole(selected.role)}</Text>
                <Text style={[s.textMuted, { marginTop: 6 }]}>
                  Correo: {selected.correo}
                </Text>
                {selected.org ? (
                  <Text style={[s.textMuted, { marginTop: 6 }]}>
                    Org: {selected.org}
                  </Text>
                ) : null}
                {selected.ciudad ? (
                  <Text style={[s.textMuted, { marginTop: 6 }]}>
                    Ciudad: {selected.ciudad}
                  </Text>
                ) : null}
              </Card>

              <Card style={{ marginTop: 12 }}>
                <Text style={s.cardTitle}>Acciones</Text>
                <View style={[s.row, { gap: 10, marginTop: 12, flexWrap: "wrap" }]}>
                  <TouchableOpacity
                    style={[s.btnPrimary, s.btnSm, { backgroundColor: C.yellow }]}
                    onPress={() => selected && updateProfileStatus(selected, "pendiente")}
                    activeOpacity={0.8}
                    disabled={actionLoading}
                  >
                    <Text style={[s.btnPrimaryText, s.btnSmText]}>En revisión</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.btnPrimary, s.btnSm, { backgroundColor: C.green }]}
                    onPress={() => selected && updateProfileStatus(selected, "activo")}
                    activeOpacity={0.8}
                    disabled={actionLoading}
                  >
                    <Text style={[s.btnPrimaryText, s.btnSmText]}>Activar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.btnPrimary, s.btnSm, { backgroundColor: C.red }]}
                    onPress={() => { setBanModalOpen(true); }}
                    activeOpacity={0.8}
                    disabled={actionLoading}
                  >
                    <Text style={[s.btnPrimaryText, s.btnSmText]}>Banear</Text>
                  </TouchableOpacity>
                  {selected?.status === "bloqueado" && (
                    <TouchableOpacity
                      style={[s.btnOutline, s.btnSm]}
                      onPress={() => selected && desbanearUsuario(selected)}
                      activeOpacity={0.8}
                      disabled={actionLoading}
                    >
                      <Text style={[s.btnOutlineText, s.btnSmText]}>Desbanear</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </Card>

              {/* Ban Modal */}
              <Modal visible={banModalOpen} transparent animationType="fade" onRequestClose={() => setBanModalOpen(false)}>
                <View style={s.modalOverlay}>
                  <View style={[s.modal, { maxHeight: "60%" }]}>
                    <View style={s.modalHeader}>
                      <Text style={s.modalTitle}>Banear usuario</Text>
                      <TouchableOpacity style={[s.iconBtn, { width: 38, height: 38 }]} onPress={() => setBanModalOpen(false)}>
                        <Ionicons name="close" size={20} color={C.text} />
                      </TouchableOpacity>
                    </View>
                    <View style={{ padding: 16 }}>
                      <TextInput
                        style={[s.input, { marginBottom: 12 }]}
                        placeholder="Motivo del baneo *"
                        placeholderTextColor={C.textMuted}
                        value={banMotivo}
                        onChangeText={setBanMotivo}
                      />
                      <TextInput
                        style={[s.input, { marginBottom: 12 }]}
                        placeholder="Bloqueado hasta (DD/MM/AAAA, opcional)"
                        placeholderTextColor={C.textMuted}
                        value={banHasta}
                        onChangeText={setBanHasta}
                      />
                      <TouchableOpacity
                        style={[s.btnPrimary, { backgroundColor: C.red, opacity: actionLoading ? 0.6 : 1 }]}
                        onPress={() => selected && banearUsuario(selected)}
                        disabled={actionLoading}
                      >
                        <Text style={s.btnPrimaryText}>{actionLoading ? "Baneando..." : "Confirmar baneo"}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </Modal>

              <View style={{ height: 18 }} />
            </ScrollView>
          ) : null}
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
      case "crear":
        return renderCrear();
      case "reportes":
        return renderReportes();
      case "ayuda":
        return renderAyuda();
      case "config":
        return renderConfig();
    }
  };

  return (
    <View style={s.root}>
      <UniversalHeader
        userName="Administrador"
        userSubtitle="Gradly Admin"
        userId={adminUserId}
      />

      <View style={s.content}>{renderBody()}</View>

      <View style={s.bottomNav}>
        {(
          [
            { key: "resumen" as const, icon: "home-outline", label: "Resumen" },
            { key: "usuarios" as const, icon: "people-outline", label: "Usuarios" },
            { key: "reportes" as const, icon: "flag-outline", label: "Reportes" },
            { key: "ayuda" as const, icon: "help-circle-outline", label: "Ayuda" },
            { key: "config" as const, icon: "settings-outline", label: "Config" },
          ] as const
        ).map((it) => {
          const active = page === it.key;
          return (
            <TouchableOpacity
              key={it.key}
              style={[s.bottomNavItem, active && s.bottomNavItemActive]}
              onPress={() => setPage(it.key)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={it.icon}
                size={22}
                color={active ? C.accent70 : C.textMuted}
              />
              <Text
                style={[s.bottomNavLabel, active && s.bottomNavLabelActive]}
              >
                {it.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <DetailModal />
    </View>
  );
}
