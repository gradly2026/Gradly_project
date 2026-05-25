import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import handleLogout from "../src/services/authService";
import { C, s } from "./admin/adminStyles";

type AdminPage = "resumen" | "usuarios" | "config";
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
};

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

export default function DashboardAdmin() {
  const router = useRouter();
  const [page, setPage] = useState<AdminPage>("resumen");

  const [roleTab, setRoleTab] = useState<Role>("talento");
  const [statusFilter, setStatusFilter] = useState<Status | "todos">("todos");
  const [search, setSearch] = useState("");

  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const data: AdminUser[] = [
    {
      id: "tal-001",
      role: "talento",
      status: "activo",
      nombre: "Valentina Cruz",
      correo: "valentina.cruz@mail.com",
      ciudad: "San Salvador",
    },
    {
      id: "tal-002",
      role: "talento",
      status: "pendiente",
      nombre: "José Ramos",
      correo: "jose.ramos@mail.com",
      ciudad: "Santa Tecla",
    },
    {
      id: "uni-001",
      role: "universidad",
      status: "activo",
      nombre: "Universidad Don Bosco",
      correo: "admisiones@udb.edu.sv",
      org: "UDB",
      ciudad: "Soyapango",
    },
    {
      id: "uni-002",
      role: "universidad",
      status: "pendiente",
      nombre: "Universidad de El Salvador",
      correo: "contacto@ues.edu.sv",
      org: "UES",
      ciudad: "San Salvador",
    },
    {
      id: "emp-001",
      role: "empresa",
      status: "activo",
      nombre: "TechSV Solutions",
      correo: "rrhh@techsv.com",
      org: "TechSV",
      ciudad: "San Salvador",
    },
    {
      id: "emp-002",
      role: "empresa",
      status: "bloqueado",
      nombre: "LogiSV Corp",
      correo: "contacto@logisv.com",
      org: "LogiSV",
      ciudad: "San Miguel",
    },
    {
      id: "alu-001",
      role: "alumno",
      status: "activo",
      nombre: "Carlos Martínez",
      correo: "carlos.martinez@uni.edu.sv",
      org: "UDB",
      ciudad: "Soyapango",
    },
    {
      id: "alu-002",
      role: "alumno",
      status: "pendiente",
      nombre: "María López",
      correo: "maria.lopez@uni.edu.sv",
      org: "UCA",
      ciudad: "San Salvador",
    },
  ];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((u) => {
      if (u.role !== roleTab) return false;
      if (statusFilter !== "todos" && u.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = `${u.nombre} ${u.correo} ${u.org ?? ""} ${u.ciudad ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [data, roleTab, statusFilter, search]);

  const openDetail = (u: AdminUser) => {
    setSelected(u);
    setDetailOpen(true);
  };

  const noop = () => Alert.alert("Próximamente", "Esta función estará disponible pronto.");

  const onLogout = async () => {
    try {
      await handleLogout(router);
    } catch {
      router.replace("/" as any);
    }
  };

  const labelRole = (r: Role) =>
    r === "talento" ? "Talentos" : r === "universidad" ? "Universidades" : r === "empresa" ? "Empresas" : "Alumnos";

  const labelStatus = (st: Status | "todos") =>
    st === "todos" ? "Todos" : st === "activo" ? "Activos" : st === "pendiente" ? "Pendientes" : "Bloqueados";

  const RoleHeader = () => (
    <View style={s.sectionHeader}>
      <View style={{ flex: 1 }}>
        <Text style={s.kicker}>Administración</Text>
        <Text style={s.pageTitle}>{labelRole(roleTab)}</Text>
        <Text style={[s.textMuted, { marginTop: 6 }]}>
          Frontend de administración (solo UI) para gestionar roles.
        </Text>
      </View>
      <TouchableOpacity style={s.btnPrimary} onPress={noop} activeOpacity={0.8}>
        <Text style={s.btnPrimaryText}>+ Crear</Text>
      </TouchableOpacity>
    </View>
  );

  const renderResumen = () => (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={s.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={s.kicker}>Panel admin</Text>
          <Text style={s.pageTitle}>Resumen</Text>
          <Text style={[s.textMuted, { marginTop: 6 }]}>
            Revisión rápida de usuarios por rol y estado.
          </Text>
        </View>
      </View>

      <View style={s.grid2}>
        {(
          [
            { role: "talento" as const, icon: "person-outline", label: "Talentos" },
            { role: "universidad" as const, icon: "school-outline", label: "Universidades" },
            { role: "empresa" as const, icon: "business-outline", label: "Empresas" },
            { role: "alumno" as const, icon: "book-outline", label: "Alumnos" },
          ] as const
        ).map((it) => {
          const total = data.filter((d) => d.role === it.role).length;
          const pendientes = data.filter((d) => d.role === it.role && d.status === "pendiente").length;
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
              <View style={[s.row, { justifyContent: "space-between", marginBottom: 10 }]}>
                <Ionicons name={it.icon} size={20} color={C.accent70} />
                {pendientes > 0 ? <Badge label={`${pendientes} pendientes`} type="pendiente" /> : null}
              </View>
              <Text style={s.cardTitle}>{it.label}</Text>
              <Text style={[s.textMuted, { marginTop: 6 }]}>{total} registros</Text>
              <View style={{ height: 8 }} />
              <Text style={[s.textMuted, { fontSize: 12 }]}>Ver lista →</Text>
            </TouchableOpacity>
          );
        })}
      </View>

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
          <Chip label="Reportes" active={false} onPress={noop} />
          <Chip label="Auditoría" active={false} onPress={noop} />
          <Chip label="Invitar usuario" active={false} onPress={noop} />
        </View>
      </Card>

      <Card style={{ marginTop: 14, marginBottom: 24 }}>
        <Text style={s.cardTitle}>Notas</Text>
        <Text style={[s.textMuted, { marginTop: 10, lineHeight: 20 }]}>
          Este panel es solo frontend. Las acciones (crear/editar/bloquear) muestran un aviso de “Próximamente” hasta
          integrar la lógica de backend.
        </Text>
      </Card>
    </ScrollView>
  );

  const renderUsuarios = () => (
    <View style={{ flex: 1 }}>
      <ScrollView showsVerticalScrollIndicator={false}>
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
                }}
              />
            ))}
          </View>
        </View>

        <View style={{ marginBottom: 10 }}>
          <Text style={[s.textMuted, { fontSize: 11, letterSpacing: 0.8, marginBottom: 8 }]}>ESTADO</Text>
          <View style={s.chipRow}>
            {(["todos", "activo", "pendiente", "bloqueado"] as Array<Status | "todos">).map((st) => (
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
          <View style={[s.row, { justifyContent: "space-between", marginBottom: 10 }]}>
            <Text style={s.cardTitle}>Listado</Text>
            <Text style={s.textMuted}>{filtered.length} resultado(s)</Text>
          </View>

          {filtered.length === 0 ? (
            <Text style={[s.textMuted, { textAlign: "center", paddingVertical: 20 }]}>Sin resultados</Text>
          ) : (
            filtered.map((u) => (
              <TouchableOpacity key={u.id} style={s.listItem} onPress={() => openDetail(u)} activeOpacity={0.8}>
                <View style={s.avatar}>
                  <Text style={s.avatarText}>{u.nombre.trim().charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.itemTitle}>{u.nombre}</Text>
                  <Text style={s.itemSub}>{u.correo}</Text>
                  {u.org || u.ciudad ? (
                    <Text style={[s.itemSub, { marginTop: 4 }]}>
                      {(u.org ? u.org : "") + (u.org && u.ciudad ? " · " : "") + (u.ciudad ? u.ciudad : "")}
                    </Text>
                  ) : null}
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <Badge
                    label={u.status === "activo" ? "Activo" : u.status === "pendiente" ? "Pendiente" : "Bloqueado"}
                    type={u.status}
                  />
                  <Ionicons name="chevron-forward-outline" size={16} color={C.textMuted} />
                </View>
              </TouchableOpacity>
            ))
          )}
        </Card>
      </ScrollView>
    </View>
  );

  const renderConfig = () => (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={s.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={s.kicker}>Sistema</Text>
          <Text style={s.pageTitle}>Configuración</Text>
          <Text style={[s.textMuted, { marginTop: 6 }]}>Preferencias del panel y accesos.</Text>
        </View>
      </View>

      <Card style={{ marginBottom: 14 }}>
        <Text style={s.cardTitle}>Seguridad</Text>
        <Text style={[s.textMuted, { marginTop: 10, lineHeight: 20 }]}>
          Aquí se configurarán permisos, logs y reglas por rol (UI lista para conectarse a backend).
        </Text>
        <View style={[s.row, { gap: 10, marginTop: 14, flexWrap: "wrap" }]}>
          <TouchableOpacity style={s.btnOutline} onPress={noop} activeOpacity={0.8}>
            <Text style={s.btnOutlineText}>Roles y permisos</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btnOutline} onPress={noop} activeOpacity={0.8}>
            <Text style={s.btnOutlineText}>Auditoría</Text>
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
                <View style={[s.row, { justifyContent: "space-between", marginBottom: 10 }]}>
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
                <Text style={[s.textMuted, { marginTop: 6 }]}>Correo: {selected.correo}</Text>
                {selected.org ? <Text style={[s.textMuted, { marginTop: 6 }]}>Org: {selected.org}</Text> : null}
                {selected.ciudad ? <Text style={[s.textMuted, { marginTop: 6 }]}>Ciudad: {selected.ciudad}</Text> : null}
              </Card>

              <Card style={{ marginTop: 12 }}>
                <Text style={s.cardTitle}>Acciones</Text>
                <View style={[s.row, { gap: 10, marginTop: 12, flexWrap: "wrap" }]}>
                  <TouchableOpacity style={[s.btnPrimary, s.btnSm]} onPress={noop} activeOpacity={0.8}>
                    <Text style={[s.btnPrimaryText, s.btnSmText]}>Editar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.btnOutline, s.btnSm]} onPress={noop} activeOpacity={0.8}>
                    <Text style={[s.btnOutlineText, s.btnSmText]}>Cambiar rol</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.btnPrimary, s.btnSm, { backgroundColor: C.yellow }]}
                    onPress={noop}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.btnPrimaryText, s.btnSmText]}>Poner en revisión</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.btnPrimary, s.btnSm, { backgroundColor: C.red }]}
                    onPress={noop}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.btnPrimaryText, s.btnSmText]}>Bloquear</Text>
                  </TouchableOpacity>
                </View>
              </Card>

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
      case "config":
        return renderConfig();
    }
  };

  return (
    <View style={s.root}>
      <View style={s.topbar}>
        <View style={s.topbarLeft}>
          <View style={s.brand}>
            <Text style={s.brandText}>G</Text>
          </View>
          <Text style={s.topbarTitle}>Gradly Admin</Text>
        </View>
        <View style={s.topbarRight}>
          <TouchableOpacity style={s.iconBtn} onPress={() => setPage("usuarios")} activeOpacity={0.8}>
            <Ionicons name="people-outline" size={20} color={C.text} />
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn} onPress={() => setPage("config")} activeOpacity={0.8}>
            <Ionicons name="settings-outline" size={20} color={C.text} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.content}>{renderBody()}</View>

      <View style={s.bottomNav}>
        {(
          [
            { key: "resumen" as const, icon: "home-outline", label: "Resumen" },
            { key: "usuarios" as const, icon: "people-outline", label: "Usuarios" },
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
              <Ionicons name={it.icon} size={22} color={active ? C.accent70 : C.textMuted} />
              <Text style={[s.bottomNavLabel, active && s.bottomNavLabelActive]}>{it.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <DetailModal />
    </View>
  );
}
