import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// Asegúrate de importar tu cliente de supabase, por ejemplo:
// import { supabase } from '@/lib/supabase'; // <- Ajusta esta ruta según tu proyecto
import TranslatedText from "../components/TranslatedText";
import { supabase } from "../lib/supabase";
import { getUniversityById, updateUniversidad } from "../services/authService";
import GroupCreationModal from "../src/components/GroupCreationModal";
import GroupDetailModal, {
  type GrupoData,
} from "../src/components/GroupDetailModal";
import ProfileViewerModal from "../src/components/ProfileViewerModal";
import { useTranslationContext } from "../src/context/TranslationContext";
import handleLogout from "../src/services/authService";

const Text = TranslatedText;

// ── Theme
const darkTheme = {
  bg: "#07050f",
  surface: "#0d0b1e",
  accent: "#8b5cf6",
  accent70: "rgba(167,139,250,1)",
  accent40: "rgba(139,92,246,0.35)",
  accent20: "rgba(139,92,246,0.12)",
  text: "#ffffff",
  textSub: "rgba(255,255,255,0.65)",
  textMid: "rgba(255,255,255,0.55)",
  textMuted: "rgba(255,255,255,0.38)",
  border: "rgba(139,92,246,0.22)",
  cardBg: "rgba(255,255,255,0.03)",
  green: "rgba(52,211,153,1)",
  greenBg: "rgba(52,211,153,0.08)",
  red: "#ef4444",
  redBg: "rgba(239,68,68,0.10)",
  yellow: "#f59e0b",
  yellowBg: "rgba(245,158,11,0.12)",
  blue: "#3b82f6",
  blueBg: "rgba(59,130,246,0.12)",
};

const lightTheme = {
  bg: "#f8fafc",
  surface: "#ffffff",
  accent: "#7c3aed",
  accent70: "rgba(139,92,246,0.95)",
  accent40: "rgba(139,92,246,0.22)",
  accent20: "rgba(139,92,246,0.12)",
  text: "#111827",
  textSub: "rgba(17,24,39,0.75)",
  textMid: "rgba(17,24,39,0.55)",
  textMuted: "rgba(17,24,39,0.38)",
  border: "rgba(139,92,246,0.18)",
  cardBg: "#f8fafc",
  green: "#15803d",
  greenBg: "rgba(52,211,153,0.12)",
  red: "#b91c1c",
  redBg: "rgba(239,68,68,0.10)",
  yellow: "#b45309",
  yellowBg: "rgba(245,158,11,0.12)",
  blue: "#2563eb",
  blueBg: "rgba(59,130,246,0.12)",
};

let C = darkTheme;
let s = createStyles(C);

type Section =
  | "inicio"
  | "explorar"
  | "grupos"
  | "horas"
  | "empresas"
  | "notificaciones"
  | "perfil"
  | "config"
  | "gestion"
  | "ayuda"
  | "acercade";

type HorasTab = "pendientes" | "en-curso" | "validadas" | "rechazadas";
type ExploreTab = "empresas" | "universidades" | "proyectos";
type PerfilTab = "inicio" | "carreras" | "aliadas" | "destacados";
type PubType = "anuncio" | "oferta" | "evento" | "convocatoria";

type EmpresaDbRow = {
  id: string;
  nombre: string;
  industria?: string | null;
  descripcion?: string | null;
  plan_seleccionado?: string | null;
};

type SolicitudHorasRow = {
  id: string;
  estado: string;
  iniciado_por: "empresa" | "universidad";
  grupo_id?: string | null;
  empresa_id?: string | null;
  decision_universidad?: "pendiente" | "aprobada" | "rechazada" | null;
  motivo_rechazo_universidad?: string | null;
  hora_inicio?: string | null;
  hora_fin?: string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  google_maps_url?: string | null;
  created_at?: string | null;
};

type GrupoDbRow = {
  id: string;
  nombre: string;
  carrera: string;
  created_at?: string | null;
  studentCount?: number;
  horasRequeridas?: number | null;
  empresaAsignada?: string | null;
  status?: string;
  badgeType?: string;
  inicio?: string | null;
  fin?: string | null;
};

// ── Sub-components ────────────────────────────────────────────────

function SectionKicker({ children }: { children: ReactNode }) {
  return <Text style={s.kicker}>{children}</Text>;
}

function PageTitle({ children }: { children: ReactNode }) {
  return <Text style={s.pageTitle}>{children}</Text>;
}

function Card({ children, style }: { children: ReactNode; style?: any }) {
  return <View style={[s.card, style]}>{children}</View>;
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
      activeOpacity={0.7}
    >
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Badge({
  label,
  type = "default",
}: {
  label: string;
  type?:
    | "premium"
    | "verificada"
    | "startup"
    | "pyme"
    | "internacional"
    | "default"
    | "pending"
    | "inprogress"
    | "validated"
    | "completed"
    | "rejected"
    | "convenio"
    | "active"
    | "review";
}) {
  const colorMap: Record<string, { bg: string; border: string; text: string }> =
    {
      premium: {
        bg: "rgba(234,179,8,0.1)",
        border: "rgba(234,179,8,0.35)",
        text: "rgba(253,224,71,1)",
      },
      verificada: {
        bg: "rgba(52,211,153,0.08)",
        border: "rgba(52,211,153,0.3)",
        text: "rgba(52,211,153,1)",
      },
      startup: {
        bg: "rgba(99,102,241,0.1)",
        border: "rgba(99,102,241,0.3)",
        text: "rgba(165,180,252,1)",
      },
      pyme: {
        bg: "rgba(251,146,60,0.1)",
        border: "rgba(251,146,60,0.3)",
        text: "rgba(253,186,116,1)",
      },
      internacional: {
        bg: "rgba(59,130,246,0.1)",
        border: "rgba(59,130,246,0.3)",
        text: "rgba(147,197,253,1)",
      },
      default: {
        bg: C.accent20,
        border: "rgba(139,92,246,0.3)",
        text: C.accent70,
      },
      pending: {
        bg: "rgba(234,179,8,0.1)",
        border: "rgba(234,179,8,0.3)",
        text: "rgba(253,224,71,1)",
      },
      inprogress: {
        bg: "rgba(59,130,246,0.1)",
        border: "rgba(59,130,246,0.3)",
        text: "rgba(147,197,253,1)",
      },
      validated: {
        bg: "rgba(52,211,153,0.08)",
        border: "rgba(52,211,153,0.25)",
        text: "rgba(52,211,153,0.95)",
      },
      completed: {
        bg: "rgba(139,92,246,0.1)",
        border: "rgba(139,92,246,0.3)",
        text: "rgba(167,139,250,1)",
      },
      rejected: {
        bg: "rgba(239,68,68,0.1)",
        border: "rgba(239,68,68,0.3)",
        text: "rgba(252,165,165,1)",
      },
      convenio: {
        bg: "rgba(52,211,153,0.1)",
        border: "rgba(52,211,153,0.3)",
        text: "rgba(52,211,153,1)",
      },
      active: {
        bg: "rgba(52,211,153,0.1)",
        border: "rgba(52,211,153,0.3)",
        text: "rgba(52,211,153,1)",
      },
      review: {
        bg: "rgba(251,146,60,0.1)",
        border: "rgba(251,146,60,0.3)",
        text: "rgba(253,186,116,1)",
      },
    };
  const col = colorMap[type] ?? colorMap.default;
  return (
    <View
      style={[s.badge, { backgroundColor: col.bg, borderColor: col.border }]}
    >
      <TranslatedText style={[s.badgeText, { color: col.text }]}>
        {label}
      </TranslatedText>
    </View>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <View style={s.tag}>
      <Text style={s.tagText}>{label}</Text>
    </View>
  );
}

function BtnPrimary({
  label,
  onPress,
  small,
  style,
}: {
  label: string;
  onPress?: () => void;
  small?: boolean;
  style?: any;
}) {
  return (
    <TouchableOpacity
      style={[s.btnPrimary, small && s.btnSm, style]}
      onPress={
        onPress ??
        (() =>
          Alert.alert("Próximamente", "Esta función estará disponible pronto."))
      }
      activeOpacity={0.8}
    >
      <Text style={[s.btnPrimaryText, small && s.btnSmText]}>{label}</Text>
    </TouchableOpacity>
  );
}

function BtnOutline({
  label,
  onPress,
  small,
  style,
  disabled,
}: {
  label: string;
  onPress?: () => void;
  small?: boolean;
  style?: any;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[s.btnOutline, small && s.btnSm, disabled && s.btnDisabled, style]}
      onPress={
        onPress ??
        (() =>
          Alert.alert("Próximamente", "Esta función estará disponible pronto."))
      }
      activeOpacity={0.8}
      disabled={disabled}
    >
      <Text
        style={[
          s.btnOutlineText,
          small && s.btnSmText,
          disabled && { color: C.textMuted },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function EmpresaCard({
  icon,
  name,
  sector,
  rating,
  reviews,
  horas,
  badgeLabel,
  badgeType,
  showConvenio,
  onViewEmpresa,
  onSolicitarHoras,
}: {
  icon: string;
  name: string;
  sector: string;
  rating: string;
  reviews: string;
  horas: number;
  badgeLabel?: string;
  badgeType?: any;
  showConvenio?: boolean;
  onViewEmpresa?: () => void;
  onSolicitarHoras?: () => void;
}) {
  return (
    <Card style={{ marginBottom: 16 }}>
      <View style={s.empresaHeader}>
        <View style={s.empresaLogo}>
          <Text style={{ fontSize: 22 }}>{icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.empresaName}>{name}</Text>
          <Text style={s.empresaSector}>{sector}</Text>
        </View>
        {badgeLabel && <Badge label={badgeLabel} type={badgeType} />}
      </View>
      <Text style={s.empresaRating}>
        ⭐ {rating}{" "}
        <Text style={{ color: C.textMuted }}>({reviews} reseñas)</Text>
      </Text>
      <Text style={s.empresaCupos}>
        🕐 <Text style={{ fontWeight: "700", color: C.text }}>{horas}</Text>{" "}
        horas sociales disponibles
      </Text>
      {showConvenio && <Badge label="Convenio activo" type="convenio" />}
      <View style={[s.row, { marginTop: 12, gap: 8 }]}>
        <BtnOutline label="Ver empresa" small onPress={onViewEmpresa} />
        <BtnPrimary
          label="Solicitar horas sociales"
          small
          onPress={onSolicitarHoras}
        />
      </View>
    </Card>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────
export default function DashboardUniversidad() {
  const router = useRouter();

  // ── Datos del usuario desde Firebase
  const [nombreUniv, setNombreUniv] = useState("Cargando...");
  const [encNombre, setEncNombre] = useState("");
  const [universidadId, setUniversidadId] = useState("");
  const [universidad, setUniversidad] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUniversidadId(user.id);
      // Obtener registro completo de la universidad
      getUniversityById(user.id)
        .then((data) => {
          if (data) {
            setNombreUniv(data.nombre ?? "Mi Universidad");
            setEncNombre(data.enc_nombre ?? "");
            setUniversidad(data ?? null);
            // Inicializar campos de edición
            setEditDesc(data.descripcion ?? "");
            setEditInstagram(data.instagram ?? "");
            setEditLinkedin(data.enc_linkedin ?? "");
            setEditBanner(data.banner_url ?? "");
            setEditLogo(data.logo_url ?? "");
          }
        })
        .catch(() => {});
    });
  }, []);

  // ── Navigation state
  const [section, setSection] = useState<Section>("inicio");

  // ── Horas tabs
  const [horasTab, setHorasTab] = useState<HorasTab>("pendientes");

  // ── Explorar tabs
  const [exploreTab, setExploreTab] = useState<ExploreTab>("empresas");
  const [exploreSearch, setExploreSearch] = useState("");

  // ── Perfil tabs
  const [perfilTab, setPerfilTab] = useState<PerfilTab>("inicio");

  // ── Publicar type
  const [pubType, setPubType] = useState<PubType>("anuncio");
  const [pubVisibility, setPubVisibility] = useState<
    "publica" | "estudiantes" | "empresas"
  >("publica");

  // ── Notificaciones
  const [notifFilter, setNotifFilter] = useState("Todas");
  const [unreadRead, setUnreadRead] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const { language, changeLanguage } = useTranslationContext();
  const [darkMode, setDarkMode] = useState(false);

  C = darkMode ? lightTheme : darkTheme;
  s = createStyles(C);

  const toggleLanguage = () => {
    setLanguageMenuOpen((prev) => !prev);
  };

  const handleChangeLanguage = () => {
    const target = language === "es" ? "en" : "es";
    changeLanguage(target);
    setLanguageMenuOpen(false);
  };

  const languageOptionLabel =
    language === "es" ? "Cambiar a Inglés" : "Change to Spanish";

  const onLogout = async () => {
    await handleLogout(router);
  };

  // ── Sidebar (mobile simulation — treated as bottom nav)
  // ── Modal: Crear Grupo
  const [groupCreationOpen, setGroupCreationOpen] = useState(false);

  // ── Modal: Rechazar
  const [modalRechazar, setModalRechazar] = useState(false);
  const [rejectNote, setRejectNote] = useState("");

  // ── Modal: Editar perfil
  const [modalEditPerfil, setModalEditPerfil] = useState(false);
  const [editBanner, setEditBanner] = useState("");
  const [editLogo, setEditLogo] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editInstagram, setEditInstagram] = useState("");
  const [editLinkedin, setEditLinkedin] = useState("");

  // ── Configuración
  const [cfgNombre, setCfgNombre] = useState("");
  useEffect(() => {
    if (encNombre) setCfgNombre(encNombre);
  }, [encNombre]);
  const [cfgEmail, setCfgEmail] = useState("agarcia@udb.edu.sv");
  const [cfgTel, setCfgTel] = useState("+503 7000-0001");
  const [cfgNotif1, setCfgNotif1] = useState(true);
  const [cfgNotif2, setCfgNotif2] = useState(true);
  const [cfgNotif3, setCfgNotif3] = useState(false);
  const [cfgNotif4, setCfgNotif4] = useState(true);
  const [cfgPwdActual, setCfgPwdActual] = useState("");
  const [cfgPwdNew, setCfgPwdNew] = useState("");
  const [cfgPwdConfirm, setCfgPwdConfirm] = useState("");

  // ── Publicar
  const [pubTitulo, setPubTitulo] = useState("");
  const [pubDescripcion, setPubDescripcion] = useState("");

  // ── Gestión Práctica filters
  const [gestionGrupoFilter, setGestionGrupoFilter] = useState("Todos");
  const [gestionEstudianteFilter, setGestionEstudianteFilter] =
    useState("Todos");
  const [gestionHorasTab, setGestionHorasTab] =
    useState<HorasTab>("pendientes");

  const [profileViewerOpen, setProfileViewerOpen] = useState(false);
  const [profileViewerUserId, setProfileViewerUserId] = useState<string | null>(
    null,
  );
  const [profileViewerUserType, setProfileViewerUserType] = useState<
    "talento" | "empresa" | "universidad"
  >("talento");

  const [grupos, setGrupos] = useState<GrupoData[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<GrupoData | null>(null);
  const [groupModalMode, setGroupModalMode] = useState<"view" | "edit" | null>(
    null,
  );
  const [groupEditSaving, setGroupEditSaving] = useState(false);

  // ── Módulo 6: datos reales (empresas / propuestas / solicitar horas)
  const [empresasDb, setEmpresasDb] = useState<EmpresaDbRow[]>([]);
  const [isLoadingEmpresas, setIsLoadingEmpresas] = useState(false);

  const [propuestasOpen, setPropuestasOpen] = useState(false);
  const [propuestas, setPropuestas] = useState<SolicitudHorasRow[]>([]);
  const [isLoadingPropuestas, setIsLoadingPropuestas] = useState(false);
  const [selectedPropuesta, setSelectedPropuesta] =
    useState<SolicitudHorasRow | null>(null);
  const [isUpdatingPropuesta, setIsUpdatingPropuesta] = useState(false);
  const [rechazoPropuestaMotivo, setRechazoPropuestaMotivo] = useState("");
  const [rechazoPropuestaError, setRechazoPropuestaError] = useState("");
  const [showRechazoPropuestaInput, setShowRechazoPropuestaInput] =
    useState(false);

  const [solicitarHorasOpen, setSolicitarHorasOpen] = useState(false);
  const [solicitarStep, setSolicitarStep] = useState<"grupo" | "empresa">(
    "grupo",
  );
  const [empresaSearch, setEmpresaSearch] = useState("");
  const [gruposDb, setGruposDb] = useState<GrupoDbRow[]>([]);
  const [isLoadingGruposDb, setIsLoadingGruposDb] = useState(false);
  const [isLoadingGroupDetail, setIsLoadingGroupDetail] = useState(false);
  const [selectedGrupoDb, setSelectedGrupoDb] = useState<GrupoDbRow | null>(
    null,
  );
  const [selectedEmpresaDb, setSelectedEmpresaDb] =
    useState<EmpresaDbRow | null>(null);
  const [solicitarErrors, setSolicitarErrors] = useState<
    Record<string, string>
  >({});
  const [isSendingSolicitud, setIsSendingSolicitud] = useState(false);

  const handleGroupCreated = (group: GrupoData) => {
    setGrupos((prev) => [group, ...prev]);
    loadGruposDb();
  };

  const loadEmpresasDb = async () => {
    setIsLoadingEmpresas(true);
    const resp = (await supabase
      .from("empresas")
      .select("id,nombre,industria,descripcion,plan_seleccionado")
      .order("created_at", { ascending: false })) as any;
    const { data, error } = resp;
    setIsLoadingEmpresas(false);
    if (error) {
      console.error("Error cargando empresas:", error);
      setEmpresasDb([]);
      return;
    }
    setEmpresasDb((data ?? []) as EmpresaDbRow[]);
  };

  const loadGruposDb = async () => {
    setIsLoadingGruposDb(true);

    let groupsQuery: any = supabase.from("grupos").select("*");
    if (universidadId) {
      groupsQuery = groupsQuery.eq("universidad_id", universidadId);
    }
    const groupsResp = (await groupsQuery.order("fecha_creacion", {
      ascending: false,
    })) as any;
    const studentsResp = (await supabase
      .from("estudiantes")
      .select("grupo_id")) as any;

    const groupIds = ((groupsResp.data ?? []) as any[]).map((g) =>
      String(g.id),
    );
    const solicitudesResp = groupIds.length
      ? ((await supabase
          .from("solicitudes_horas")
          .select("grupo_id,empresa_id,fecha_inicio,fecha_fin,estado")
          .in("grupo_id", groupIds)
          .order("created_at", { ascending: false })) as any)
      : { data: [], error: null };

    const empresasResp = (await supabase
      .from("empresas")
      .select("id,nombre")) as any;

    const { data: groupsData, error: groupsError } = groupsResp;
    const { data: studentsData, error: studentsError } = studentsResp;
    const { data: solicitudesData, error: solicitudesError } = solicitudesResp;
    const { data: empresasData, error: empresasError } = empresasResp;
    setIsLoadingGruposDb(false);

    if (groupsError) {
      console.error("Error cargando grupos:", groupsError);
      setGruposDb([]);
      return;
    }

    if (studentsError) {
      console.error("Error cargando estudiantes:", studentsError);
    }

    const studentCountByGroup = ((studentsData ?? []) as any[]).reduce(
      (acc: Record<string, number>, item: any) => {
        const groupId = String(item.grupo_id);
        acc[groupId] = (acc[groupId] || 0) + 1;
        return acc;
      },
      {},
    );

    if (solicitudesError) {
      console.error("Error cargando solicitudes de horas:", solicitudesError);
    }

    if (empresasError) {
      console.error("Error cargando empresas para solicitudes:", empresasError);
    }

    const latestSolicitudByGroup = ((solicitudesData ?? []) as any[]).reduce(
      (acc: Record<string, any>, item: any) => {
        const groupId = String(item.grupo_id);
        if (!acc[groupId]) acc[groupId] = item;
        return acc;
      },
      {},
    );

    const empresaNamesById = ((empresasData ?? []) as any[]).reduce(
      (acc: Record<string, string>, empresa: any) => {
        if (empresa?.id) acc[String(empresa.id)] = empresa.nombre;
        return acc;
      },
      {},
    );

    const mapped = ((groupsData ?? []) as any[]).map((g) => {
      const carrera = (g.especialidad || g.carrera || "") as string;
      const nombreGrupo = (g.nombre_grupo ||
        g.nombre ||
        "Grupo sin nombre") as string;
      const createdAt = g.fecha_creacion || g.created_at || null;
      const solicitud = latestSolicitudByGroup[String(g.id)];
      const estadoRaw = solicitud?.estado ? String(solicitud.estado) : "Activo";
      const status =
        estadoRaw === "aprobada"
          ? "Aprobada"
          : estadoRaw === "cerrada"
            ? "Completado"
            : estadoRaw === "Activo"
              ? "Activo"
              : "En revisión";
      const badgeType =
        estadoRaw === "aprobada"
          ? "inprogress"
          : estadoRaw === "cerrada"
            ? "completed"
            : estadoRaw === "Activo"
              ? "active"
              : "review";

      return {
        id: String(g.id),
        nombre:
          [carrera, nombreGrupo].filter(Boolean).join(" - ") || nombreGrupo,
        carrera,
        created_at: createdAt,
        studentCount: studentCountByGroup[String(g.id)] ?? 0,
        horasRequeridas: g.horas_requeridas ?? g.horas ?? null,
        empresaAsignada: solicitud?.empresa_id
          ? (empresaNamesById[String(solicitud.empresa_id)] ?? null)
          : null,
        status,
        badgeType,
        inicio: solicitud?.fecha_inicio || null,
        fin: solicitud?.fecha_fin || null,
      };
    });
    setGruposDb(mapped);
  };

  const loadPropuestas = async () => {
    setIsLoadingPropuestas(true);
    let query: any = supabase
      .from("solicitudes_horas")
      .select("*")
      .order("created_at", { ascending: false });
    if (universidadId) {
      query = query.eq("universidad_id", universidadId);
    }
    const resp = (await query) as any;
    const { data, error } = resp;
    setIsLoadingPropuestas(false);
    if (error) {
      console.error("Error cargando propuestas:", error);
      setPropuestas([]);
      return;
    }
    setPropuestas((data ?? []) as SolicitudHorasRow[]);
  };

  const formatDateString = (value?: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("es-ES");
  };

  const loadGroupDetail = async (groupId: string) => {
    try {
      const groupResp = (await supabase
        .from("grupos")
        .select("*")
        .eq("id", groupId)
        .single()) as any;
      const { data: groupData, error: groupError } = groupResp;
      if (groupError || !groupData) {
        throw groupError || new Error("Grupo no encontrado");
      }

      const studentsResp = (await supabase
        .from("estudiantes")
        .select("id,nombre_completo,email,matricula")
        .eq("grupo_id", groupId)
        .order("created_at", { ascending: true })) as any;
      const { data: studentsData, error: studentsError } = studentsResp;
      if (studentsError) {
        console.error("Error cargando estudiantes del grupo:", studentsError);
      }

      const requestResp = (await supabase
        .from("solicitudes_horas")
        .select("empresa_id,fecha_inicio,fecha_fin,estado")
        .eq("grupo_id", groupId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()) as any;
      const { data: requestData, error: requestError } = requestResp;
      if (requestError) {
        console.error("Error cargando solicitud de horas:", requestError);
      }

      let empresaAsignada: string | null = null;
      let inicio = "";
      let fin = "";
      let badgeType: GrupoData["badgeType"] = "active";

      if (requestData) {
        if (requestData.empresa_id) {
          const empresaResp = (await supabase
            .from("empresas")
            .select("nombre")
            .eq("id", requestData.empresa_id)
            .single()) as any;
          empresaAsignada = empresaResp.data?.nombre ?? null;
        }
        inicio = requestData.fecha_inicio
          ? formatDateString(requestData.fecha_inicio)
          : "";
        fin = requestData.fecha_fin
          ? formatDateString(requestData.fecha_fin)
          : "";
        badgeType =
          requestData.estado === "aprobada"
            ? "inprogress"
            : requestData.estado === "cerrada"
              ? "completed"
              : "review";
      }

      const groupName = [
        groupData.especialidad || groupData.carrera || "",
        groupData.nombre_grupo || groupData.nombre || "",
      ]
        .filter(Boolean)
        .join(" - ")
        .trim();

      return {
        id: String(groupData.id),
        name: groupName || "Grupo sin nombre",
        carrera: (groupData.especialidad || groupData.carrera || "") as string,
        dateCreated: formatDateString(
          groupData.fecha_creacion || groupData.created_at,
        ),
        inicio,
        fin,
        count: ((studentsData ?? []) as any[]).length,
        status: requestData?.estado ? String(requestData.estado) : "Activo",
        badgeType,
        tags: [
          (groupData.especialidad || groupData.carrera || "") as string,
        ].filter(Boolean),
        empresaAsignada,
        horasRequeridas: groupData.horas_requeridas ?? groupData.horas ?? null,
        estudiantes: ((studentsData ?? []) as any[]).map((student) => ({
          id: String(student.id),
          name: student.nombre_completo || "",
          carrera: (groupData.especialidad ||
            groupData.carrera ||
            "") as string,
          estado: String(student.matricula || "Activo"),
          horas: groupData.horas_requeridas ?? groupData.horas ?? null,
        })),
      };
    } catch (error: any) {
      console.error("Error cargando detalle de grupo:", error);
      throw error;
    }
  };

  /**
   * Carga los grupos creados por el usuario autenticado desde Supabase
   * y actualiza el estado `grupos` con los datos reales
   */
  const loadGruposAutenticado = async () => {
    try {
      // Obtener el usuario autenticado
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        console.warn("No authenticated user found");
        return;
      }

      // Obtener grupos del usuario autenticado (universidad_id = user.id)
      const { data: gruposData, error: gruposError } = await supabase
        .from("grupos")
        .select("*")
        .eq("universidad_id", user.id)
        .order("fecha_creacion", { ascending: false });

      if (gruposError) {
        console.error("Error cargando grupos autenticados:", gruposError);
        return;
      }

      if (!gruposData || gruposData.length === 0) {
        console.log("No groups found for authenticated user");
        setGrupos([]);
        return;
      }

      // Para cada grupo, obtener estudiantes y solicitudes de horas
      const gruposConDetalles = await Promise.all(
        (gruposData as any[]).map(async (groupData) => {
          try {
            // Obtener estudiantes del grupo
            const { data: estudiantesData } = await supabase
              .from("estudiantes")
              .select("*")
              .eq("grupo_id", groupData.id);

            // Obtener solicitud de horas del grupo
            const { data: solicitudData } = await supabase
              .from("solicitudes_horas")
              .select("*")
              .eq("grupo_id", groupData.id)
              .order("created_at", { ascending: false })
              .limit(1);

            // Obtener nombre de la empresa si existe
            let empresaNombre = null;
            if (solicitudData && solicitudData.length > 0) {
              const empresaId = solicitudData[0].empresa_id;
              const { data: empresaData } = await supabase
                .from("empresas")
                .select("nombre")
                .eq("id", empresaId)
                .single();
              empresaNombre = empresaData?.nombre ?? null;
            }

            // Mapear datos a estructura GrupoData
            const estadoRaw = solicitudData?.[0]?.estado ?? "Activo";
            const statusMap: Record<string, string> = {
              aprobada: "En curso",
              cerrada: "Completado",
              pendiente: "En revisión",
              rechazada: "Rechazada",
              Activo: "Activo",
            };

            const badgeTypeMap: Record<string, GrupoData["badgeType"]> = {
              aprobada: "inprogress",
              cerrada: "completed",
              pendiente: "review",
              rechazada: "rejected",
              Activo: "active",
            };

            return {
              id: String(groupData.id),
              name: `${groupData.carrera || ""} - ${groupData.nombre_grupo || groupData.nombre || "Grupo sin nombre"}`.trim(),
              carrera: groupData.carrera || "",
              dateCreated: formatDateString(
                groupData.fecha_creacion || groupData.created_at,
              ),
              inicio: solicitudData?.[0]?.fecha_inicio
                ? formatDateString(solicitudData[0].fecha_inicio)
                : "Por definir",
              fin: solicitudData?.[0]?.fecha_fin
                ? formatDateString(solicitudData[0].fecha_fin)
                : "Por definir",
              count: (estudiantesData ?? []).length,
              status: statusMap[estadoRaw] || "Activo",
              badgeType:
                (badgeTypeMap[estadoRaw] as GrupoData["badgeType"]) || "active",
              tags: [
                groupData.carrera || "",
                solicitudData?.[0]?.estado || "Sin solicitud",
              ].filter(Boolean),
              empresaAsignada: empresaNombre,
              estudiantes: (estudiantesData ?? []).map((student: any) => ({
                id: String(student.id),
                name: student.nombre_completo || "Estudiante sin nombre",
                carrera: groupData.carrera || "",
                estado: student.estado || "Activo",
                horas: groupData.horas_requeridas ?? null,
              })),
            } as GrupoData;
          } catch (error) {
            console.error("Error procesando grupo:", groupData.id, error);
            return null;
          }
        }),
      );

      // Filtrar grupos nulos y actualizar estado
      const gruposFiltrados = gruposConDetalles.filter(
        (g) => g !== null,
      ) as GrupoData[];
      setGrupos(gruposFiltrados);

      console.log(
        `✓ Grupos autenticados cargados: ${gruposFiltrados.length} grupos`,
      );
    } catch (error) {
      console.error("Error en loadGruposAutenticado:", error);
    }
  };

  const handleActualizarEstadoPropuesta = async (
    propuestaId: string,
    estado: "aprobada" | "cerrada",
    motivo?: string,
  ) => {
    setIsUpdatingPropuesta(true);
    setRechazoPropuestaError("");

    if (estado === "cerrada" && !motivo?.trim()) {
      setRechazoPropuestaError("Escribe el motivo real del rechazo.");
      setIsUpdatingPropuesta(false);
      return false;
    }

    const { error } = await supabase
      .from("solicitudes_horas")
      .update({
        estado,
        decision_universidad: estado === "aprobada" ? "aprobada" : "rechazada",
        motivo_rechazo_universidad:
          estado === "cerrada" ? motivo?.trim() : null,
      })
      .eq("id", propuestaId);
    setIsUpdatingPropuesta(false);

    if (error) {
      console.error("Error actualizando propuesta:", error);
      Alert.alert("Error", "No fue posible actualizar la propuesta.");
      return false;
    }
    await loadPropuestas();
    return true;
  };

  const handleEnviarSolicitudHoras = async () => {
    const nextErrors: Record<string, string> = {};
    if (!selectedGrupoDb?.id) nextErrors.grupo = "Selecciona un grupo";
    if (!selectedEmpresaDb?.id) nextErrors.empresa = "Selecciona una empresa";
    if (Object.keys(nextErrors).length > 0) {
      setSolicitarErrors(nextErrors);
      return;
    }
    setSolicitarErrors({});
    setIsSendingSolicitud(true);

    if (!universidadId) {
      Alert.alert(
        "Error",
        "No se pudo identificar la universidad. Intenta reiniciar la sesión.",
      );
      setIsSendingSolicitud(false);
      return;
    }

    const payload = {
      universidad_id: universidadId,
      grupo_id: selectedGrupoDb?.id,
      empresa_id: selectedEmpresaDb?.id,
      iniciado_por: "universidad",
      estado: "pendiente",
      decision_universidad: "pendiente",
      motivo_rechazo_universidad: null,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("solicitudes_horas").insert(payload);
    setIsSendingSolicitud(false);
    if (error) {
      console.error("Error enviando solicitud de horas:", error);
      Alert.alert("Error", "No fue posible enviar la propuesta.");
      return;
    }

    Alert.alert("Enviado", "La propuesta fue enviada correctamente.");
    setSolicitarHorasOpen(false);
    resetSolicitarHorasModal();
  };

  const resetSolicitarHorasModal = () => {
    setSolicitarStep("grupo");
    setEmpresaSearch("");
    setSelectedGrupoDb(null);
    setSelectedEmpresaDb(null);
    setSolicitarErrors({});
    setIsSendingSolicitud(false);
  };

  const openSolicitarHorasModal = (empresa?: EmpresaDbRow) => {
    setSolicitarHorasOpen(true);
    resetSolicitarHorasModal();
    loadGruposDb();
    // Si viene desde una tarjeta de empresa, dejamos precargada esa empresa
    if (empresa) {
      setSelectedEmpresaDb(empresa);
    }
  };

  useEffect(() => {
    if (section === "inicio" || section === "explorar") {
      loadEmpresasDb();
    }
    if (section === "grupos" || section === "gestion") {
      loadGruposDb();
      loadGruposAutenticado(); // Cargar grupos del usuario autenticado
    }
  }, [section]);

  const noop = () =>
    Alert.alert("Próximamente", "Esta función estará disponible pronto.");

  const openProfileViewer = (
    userId: string,
    userType: "talento" | "empresa" | "universidad",
  ) => {
    setProfileViewerUserId(userId);
    setProfileViewerUserType(userType);
    setProfileViewerOpen(true);
  };

  const openGroupViewer = async (groupId: string) => {
    setIsLoadingGroupDetail(true);
    try {
      const detail = await loadGroupDetail(groupId);
      setSelectedGroup(detail);
      setGroupModalMode("view");
    } catch (error: any) {
      Alert.alert(
        "Error",
        error?.message || "No se pudo cargar el detalle del grupo.",
      );
    } finally {
      setIsLoadingGroupDetail(false);
    }
  };

  const openGroupEditor = (group: GrupoData) => {
    setSelectedGroup(group);
    setGroupModalMode("edit");
  };

  const filteredExploreCompanies = useMemo(() => {
    const query = exploreSearch.trim().toLowerCase();
    if (!query) return [];
    return empresasDb.filter((empresa) => {
      const haystack =
        `${empresa.nombre} ${empresa.industria ?? ""} ${empresa.descripcion ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [exploreSearch, empresasDb]);

  const handleUpdateGroup = async (updatedGroup: GrupoData) => {
    setGroupEditSaving(true);
    try {
      const payload = {
        nombre: updatedGroup.name,
        carrera: updatedGroup.carrera,
        fecha_inicio: updatedGroup.inicio,
        fecha_fin: updatedGroup.fin,
        empresa_asignada: updatedGroup.empresaAsignada,
        status: updatedGroup.status,
        estudiantes: updatedGroup.estudiantes.map((student) => student.name),
      };
      const { error } = await supabase
        .from("grupos")
        .update(payload)
        .eq("id", updatedGroup.id);

      if (error) {
        throw error;
      }

      setGrupos((prev) =>
        prev.map((group) =>
          group.id === updatedGroup.id ? updatedGroup : group,
        ),
      );
      setGroupModalMode(null);
      setSelectedGroup(null);
      Alert.alert(
        "Grupo actualizado",
        "Los cambios se guardaron correctamente.",
      );
    } catch (err: any) {
      console.error("Error actualizando grupo:", err);
      Alert.alert(
        "Error",
        "No fue posible guardar los cambios del grupo. Intenta de nuevo.",
      );
    } finally {
      setGroupEditSaving(false);
    }
  };

  // ── Bottom nav items ──────────────────────────────────────────
  const navItems: {
    key: Section;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
  }[] = [
    { key: "inicio", icon: "home-outline", label: "Inicio" },
    { key: "explorar", icon: "compass-outline", label: "Explorar" },
    { key: "gestion", icon: "people-outline", label: "Gestión" },
    { key: "perfil", icon: "business-outline", label: "Mi Perfil" },
  ];

  // ═══════════════════════════════════════════════════════════════
  // SECTIONS
  // ═══════════════════════════════════════════════════════════════

  const renderInicio = () => (
    <ScrollView showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={s.sectionHeader}>
        <View>
          <SectionKicker>Panel de control</SectionKicker>
          <PageTitle>
            Bienvenido/a {encNombre ? `, ${encNombre.split(" ")[0]}` : ""}
          </PageTitle>
        </View>
        {/* <View style={s.dateChip}>
          <Text style={s.dateChipText}>Activated 04/05/2026</Text>
        </View> */}
      </View>

      {/* Métricas */}
      <View style={s.metricsGrid}>
        {[
          {
            icon: "🎓",
            num: "1,247",
            label: "Estudiantes registrados",
            trend: "↑ 12% este mes",
            up: true,
          },
          {
            icon: "⏱️",
            num: "3,840",
            label: "Horas sociales validadas este mes",
            trend: "↑ 8% vs. mes anterior",
            up: true,
          },
          {
            icon: "🤝",
            num: "38",
            label: "Empresas con convenio activo",
            trend: "↑ 3 nuevas este mes",
            up: true,
          },
          {
            icon: "📋",
            num: "14",
            label: "Solicitudes pendientes de aprobación",
            trend: "⚠ Requieren revisión",
            up: false,
          },
        ].map((m) => (
          <Card key={m.label} style={s.metricCard}>
            <View style={s.metricIconBox}>
              <Text style={s.metricIcon}>{m.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.metricNum}>{m.num}</Text>
              <Text style={s.metricLabel}>{m.label}</Text>
              <Text
                style={[s.metricTrend, { color: m.up ? C.green : C.yellow }]}
              >
                {m.trend}
              </Text>
            </View>
          </Card>
        ))}
      </View>

      {/* Empresas destacadas */}
      <Text style={s.subsectionTitle}>Empresas registradas</Text>
      <Text style={[s.textMuted, { marginBottom: 16 }]}>
        Este listado se carga desde la tabla{" "}
        <Text style={s.textSub}>empresas</Text> en Supabase.
      </Text>

      <View style={[s.row, { gap: 10, flexWrap: "wrap", marginBottom: 16 }]}>
        <BtnPrimary
          label="Solicitar horas (nuevo)"
          small
          onPress={() => openSolicitarHorasModal()}
        />
        <BtnOutline
          label="Propuestas de empresas"
          small
          onPress={() => {
            setPropuestasOpen(true);
            loadPropuestas();
          }}
        />
      </View>

      {isLoadingEmpresas ? (
        <Text style={[s.textMuted, { paddingVertical: 14 }]}>
          Cargando empresas...
        </Text>
      ) : empresasDb.length === 0 ? (
        <Card style={{ marginBottom: 16 }}>
          <Text style={[s.textMuted, { textAlign: "center", padding: 18 }]}>
            No hay empresas registradas aún.
          </Text>
        </Card>
      ) : (
        empresasDb.map((emp) => {
          const isPremium = /premium/i.test(emp.plan_seleccionado ?? "");
          const badgeLabel = isPremium ? "Premium" : undefined;
          const badgeType = isPremium ? "premium" : undefined;
          return (
            <EmpresaCard
              key={emp.id}
              icon="🏢"
              name={emp.nombre}
              sector={emp.industria ?? "Sin industria"}
              rating="—"
              reviews="—"
              horas={0}
              badgeLabel={badgeLabel}
              badgeType={badgeType}
              onViewEmpresa={() => openProfileViewer(emp.id, "empresa")}
              onSolicitarHoras={() => openSolicitarHorasModal(emp)}
            />
          );
        })
      )}

      {/* Paneles laterales */}
      <Card style={{ marginBottom: 16 }}>
        <Text style={s.sideCardTitle}>📋 Solicitudes pendientes</Text>
        {[
          { grupo: "Ing. Sistemas – Grupo A", empresa: "TechSV Solutions" },
          { grupo: "Diseño Gráfico – Grupo B", empresa: "WebFactory CR" },
          { grupo: "Administración – Grupo C", empresa: "Banco Agrícola" },
        ].map((item) => (
          <View key={item.grupo} style={s.pendingItem}>
            <View style={{ flex: 1 }}>
              <Text style={s.pendingGroup}>{item.grupo}</Text>
              <Text style={[s.textMuted, { fontSize: 12 }]}>
                {item.empresa}
              </Text>
            </View>
            <Badge label="Pendiente" type="pending" />
          </View>
        ))}
        <BtnOutline
          label="Ver todas →"
          small
          style={{ marginTop: 12 }}
          onPress={() => setSection("horas")}
        />
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Text style={s.sideCardTitle}>✅ Últimas validaciones</Text>
        {[
          { avatar: "👨‍💻", name: "Carlos Martínez", sub: "TechSV · 30/04/2026" },
          { avatar: "👩‍🎨", name: "María López", sub: "WebFactory · 29/04/2026" },
          { avatar: "👨‍🔬", name: "José Ramos", sub: "BioMed Labs · 28/04/2026" },
        ].map((a) => (
          <View key={a.name} style={s.activityItem}>
            <View style={s.activityAvatar}>
              <Text style={{ fontSize: 20 }}>{a.avatar}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.activityName}>{a.name}</Text>
              <Text style={[s.textMuted, { fontSize: 12 }]}>{a.sub}</Text>
            </View>
            <Badge label="Validado" type="validated" />
          </View>
        ))}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Text style={s.sideCardTitle}>📅 Próximas fechas importantes</Text>
        {[
          {
            icon: "📌",
            desc: "Cierre de solicitudes de horas – Ciclo 01",
            date: "15/05/2026",
          },
          {
            icon: "🎓",
            desc: "Ceremonia de entrega de certificados",
            date: "22/05/2026",
          },
          {
            icon: "🏢",
            desc: "Feria de empresas UDB 2026",
            date: "06/06/2026",
          },
        ].map((d) => (
          <View key={d.date} style={s.dateItem}>
            <Text style={{ fontSize: 18, marginRight: 12 }}>{d.icon}</Text>
            <View>
              <Text style={[s.textSub, { fontSize: 13 }]}>{d.desc}</Text>
              <Text style={[s.textMuted, { fontSize: 12 }]}>{d.date}</Text>
            </View>
          </View>
        ))}
      </Card>

      {/* Feed */}
      <Card style={{ marginBottom: 32 }}>
        <Text style={s.subsectionTitle}>Actividad reciente</Text>
        {[
          {
            icon: "🎓",
            text: "3 nuevos estudiantes de Ing. Sistemas se registraron en Gradly",
            time: "hace 20 minutos",
          },
          {
            icon: "✅",
            text: "TechSV Solutions validó 120 horas del Grupo A – Ing. Sistemas",
            time: "hace 1 hora",
          },
          {
            icon: "🤝",
            text: "Nueva empresa verificada: LogiSV Corp – Logística",
            time: "hace 3 horas",
          },
          {
            icon: "📋",
            text: "Solicitud de horas sociales del Grupo B – Diseño enviada a WebFactory CR",
            time: "hace 5 horas",
          },
          {
            icon: "🎓",
            text: "Valentina Cruz activó su cuenta en Gradly",
            time: "ayer 16:42",
          },
        ].map((f, i) => (
          <View key={i} style={s.feedItem}>
            <View style={s.feedIconBox}>
              <Text style={s.feedIcon}>{f.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.textSub, { fontSize: 13 }]}>{f.text}</Text>
              <Text style={[s.textMuted, { fontSize: 12, marginTop: 2 }]}>
                {f.time}
              </Text>
            </View>
          </View>
        ))}
      </Card>
    </ScrollView>
  );

  const renderExplorar = () => (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={s.sectionHeader}>
        <View>
          <SectionKicker>Descubrir</SectionKicker>
          <PageTitle>Explorar</PageTitle>
        </View>
      </View>

      <Card style={{ marginBottom: 16 }}>
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={18} color={C.textMuted} />
          <TextInput
            style={s.searchInput}
            value={exploreSearch}
            onChangeText={setExploreSearch}
            placeholder="Buscar empresas, universidades, proyectos..."
            placeholderTextColor={C.textMuted}
          />
        </View>
        {exploreSearch.trim().length > 0 && exploreTab === "empresas" && (
          <View style={{ marginTop: 10 }}>
            {filteredExploreCompanies.length === 0 ? (
              <Text style={[s.textMuted, { fontSize: 12 }]}>
                No se encontraron empresas.
              </Text>
            ) : (
              filteredExploreCompanies.slice(0, 5).map((empresa) => (
                <TouchableOpacity
                  key={empresa.id}
                  style={[
                    s.card,
                    { padding: 14, marginBottom: 8, borderColor: C.border },
                  ]}
                  onPress={() => openProfileViewer(empresa.id, "empresa")}
                  activeOpacity={0.85}
                >
                  <Text style={[s.textSub, { fontWeight: "700" }]}>
                    {empresa.nombre}
                  </Text>
                  <Text style={[s.textMuted, { fontSize: 12, marginTop: 4 }]}>
                    {empresa.industria ?? ""}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
      </Card>

      <View style={[s.row, { gap: 8, flexWrap: "wrap", marginBottom: 20 }]}>
        {(["empresas", "universidades", "proyectos"] as ExploreTab[]).map(
          (t) => (
            <Chip
              key={t}
              label={
                t === "empresas"
                  ? "🏢 Empresas"
                  : t === "universidades"
                    ? "🏛️ Otras universidades"
                    : "💡 Proyectos"
              }
              active={exploreTab === t}
              onPress={() => setExploreTab(t)}
            />
          ),
        )}
      </View>

      {exploreTab === "empresas" && (
        <>
          {empresasDb.length === 0 ? (
            <Text style={[s.textMuted, { textAlign: "center", padding: 24 }]}>
              \n No hay empresas registradas aún.
            </Text>
          ) : (
            (exploreSearch.trim().length > 0
              ? filteredExploreCompanies
              : empresasDb
            ).map((empresa) => (
              <EmpresaCard
                key={empresa.id}
                icon="🏢"
                name={empresa.nombre}
                sector={empresa.industria ?? "Sin industria"}
                rating={empresa.plan_seleccionado ? "4.5" : "N/A"}
                reviews="0"
                horas={0}
                badgeLabel={empresa.plan_seleccionado ?? "Activo"}
                badgeType={empresa.plan_seleccionado ? "premium" : "default"}
                onViewEmpresa={() => openProfileViewer(empresa.id, "empresa")}
                onSolicitarHoras={() => openSolicitarHorasModal(empresa)}
              />
            ))
          )}
        </>
      )}

      {exploreTab === "universidades" && (
        <>
          {[
            {
              icon: "🎓",
              name: "Universidad de El Salvador",
              acreds: ["ACAP", "ABET"],
              areas: ["Ingeniería", "Medicina", "Derecho"],
              conv: 12,
            },
            {
              icon: "🏫",
              name: "UTEC El Salvador",
              acreds: ["ISO 9001"],
              areas: ["Sistemas", "Negocios"],
              conv: 7,
            },
            {
              icon: "🏛️",
              name: "UCA El Salvador",
              acreds: ["ACAP"],
              areas: ["Psicología", "Comunicaciones", "Sistemas"],
              conv: 9,
            },
          ].map((u) => (
            <Card
              key={u.name}
              style={{ marginBottom: 16, alignItems: "center" }}
            >
              <Text style={{ fontSize: 40, marginBottom: 12 }}>{u.icon}</Text>
              <Text
                style={[
                  s.empresaName,
                  { textAlign: "center", marginBottom: 8 },
                ]}
              >
                {u.name}
              </Text>
              <View
                style={[
                  s.row,
                  { flexWrap: "wrap", gap: 6, justifyContent: "center" },
                ]}
              >
                {u.acreds.map((a) => (
                  <Tag key={a} label={a} />
                ))}
              </View>
              <View
                style={[
                  s.row,
                  {
                    flexWrap: "wrap",
                    gap: 6,
                    justifyContent: "center",
                    marginTop: 6,
                  },
                ]}
              >
                {u.areas.map((a) => (
                  <Tag key={a} label={a} />
                ))}
              </View>
              <Text style={[s.textMuted, { fontSize: 12, marginTop: 12 }]}>
                {u.conv} convenios activos
              </Text>
            </Card>
          ))}
        </>
      )}

      {exploreTab === "proyectos" && (
        <>
          {[
            {
              name: "Sistema de gestión de inventarios",
              author: "Carlos Martínez · UDB",
              tags: ["React", "Node.js"],
              area: "Ing. Sistemas",
            },
            {
              name: "App de reservas para restaurantes",
              author: "María López · UCA",
              tags: ["Flutter", "Firebase"],
              area: "Ing. Sistemas",
            },
            {
              name: "Branding identidad corporativa",
              author: "Sofía Ramírez · UTEC",
              tags: ["Figma", "Illustrator"],
              area: "Diseño",
            },
          ].map((p) => (
            <Card key={p.name} style={{ marginBottom: 16 }}>
              <View style={[s.projectThumb, { marginBottom: 12 }]} />
              <Text style={s.empresaName}>{p.name}</Text>
              <Text style={[s.textMuted, { fontSize: 12, marginTop: 4 }]}>
                {p.author}
              </Text>
              <View style={[s.row, { gap: 6, flexWrap: "wrap", marginTop: 8 }]}>
                {p.tags.map((t) => (
                  <Tag key={t} label={t} />
                ))}
              </View>
              <Badge label={p.area} type="default" />
            </Card>
          ))}
        </>
      )}
    </ScrollView>
  );

  const renderGestion = () => {
    const GRUPOS_FILTER = [
      "Todos",
      "Ing. Sistemas – Grupo A",
      "Diseño Gráfico – Grupo B",
      "Administración – Grupo C",
      "Ing. Industrial – Grupo D",
    ];
    const ESTUDIANTES_POR_GRUPO: Record<string, string[]> = {
      Todos: [
        "Todos",
        "Carlos Martínez",
        "María López",
        "Valentina Cruz",
        "José Ramos",
      ],
      "Ing. Sistemas – Grupo A": [
        "Todos",
        "Carlos Martínez",
        "Valentina Cruz",
        "José Ramos",
      ],
      "Diseño Gráfico – Grupo B": ["Todos", "María López"],
      "Administración – Grupo C": ["Todos"],
      "Ing. Industrial – Grupo D": ["Todos"],
    };
    const estudiantesOpts = ESTUDIANTES_POR_GRUPO[gestionGrupoFilter] ?? [
      "Todos",
    ];

    const pendientesData = [
      {
        icon: "💼",
        grupo: "Ing. Sistemas – Grupo A",
        empresa: "TechSV Solutions",
        empresaId: "demo-empresa-1",
        periodo: "15/05/2026 – 15/08/2026",
        horas: 120,
      },
      {
        icon: "🌐",
        grupo: "Diseño Gráfico – Grupo B",
        empresa: "WebFactory CR",
        empresaId: "demo-empresa-1",
        periodo: "20/05/2026 – 20/08/2026",
        horas: 100,
      },
      {
        icon: "🏦",
        grupo: "Administración – Grupo C",
        empresa: "Banco Agrícola",
        empresaId: "demo-empresa-1",
        periodo: "01/06/2026 – 01/09/2026",
        horas: 120,
      },
    ].filter(
      (item) =>
        gestionGrupoFilter === "Todos" || item.grupo === gestionGrupoFilter,
    );

    const enCursoData = [
      {
        avatar: "👨‍💻",
        name: "Carlos Martínez",
        talentoId: "demo-talento-1",
        sub: "Ing. Sistemas · Grupo A",
        grupo: "Ing. Sistemas – Grupo A",
        last: "03/05/2026",
        done: 90,
        total: 120,
        pct: 75,
      },
      {
        avatar: "👩‍🎨",
        name: "María López",
        talentoId: "demo-talento-1",
        sub: "Diseño Gráfico · Grupo B",
        grupo: "Diseño Gráfico – Grupo B",
        last: "02/05/2026",
        done: 50,
        total: 100,
        pct: 50,
      },
    ].filter(
      (item) =>
        (gestionGrupoFilter === "Todos" || item.grupo === gestionGrupoFilter) &&
        (gestionEstudianteFilter === "Todos" ||
          item.name === gestionEstudianteFilter),
    );

    const validadasData = [
      {
        avatar: "👨‍🔬",
        name: "José Ramos",
        talentoId: "demo-talento-1",
        sub: "BioMed Labs · 120 horas",
        grupo: "Ing. Sistemas – Grupo A",
        certified: true,
        evidencias: "📄 Informe final · 🖼 Fotografías",
        firma: "BioMed Labs — 28/04/2026",
      },
      {
        avatar: "👩‍💻",
        name: "Valentina Cruz",
        talentoId: "demo-talento-1",
        sub: "TechSV Solutions · 120 horas",
        grupo: "Ing. Sistemas – Grupo A",
        certified: false,
        evidencias: "📄 Reporte · 📊 Presentación",
        firma: "",
      },
    ].filter(
      (item) =>
        (gestionGrupoFilter === "Todos" || item.grupo === gestionGrupoFilter) &&
        (gestionEstudianteFilter === "Todos" ||
          item.name === gestionEstudianteFilter),
    );

    const gruposFiltrados = grupos.filter(
      (grupo) =>
        gestionGrupoFilter === "Todos" || grupo.name === gestionGrupoFilter,
    );

    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* ══ SECCIÓN 1: GRUPOS ══ */}
        <View
          style={[
            s.sectionHeader,
            {
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-end",
            },
          ]}
        >
          <View>
            <SectionKicker>Gestión académica</SectionKicker>
            <PageTitle>Grupos de estudiantes</PageTitle>
          </View>
          <View
            style={[
              s.row,
              { gap: 8, flexWrap: "wrap", justifyContent: "flex-end" },
            ]}
          >
            <BtnOutline
              label="Propuestas"
              small
              onPress={() => {
                setPropuestasOpen(true);
                loadPropuestas();
              }}
            />
            <BtnOutline
              label="Solicitar horas"
              small
              onPress={() => openSolicitarHorasModal()}
            />
            <BtnPrimary
              label="+ Crear grupo"
              onPress={() => setGroupCreationOpen(true)}
              small
            />
          </View>
        </View>

        {gruposFiltrados.length === 0 ? (
          <Text style={[s.textMuted, { textAlign: "center", padding: 24 }]}>
            No hay grupos que coincidan con este filtro.
          </Text>
        ) : (
          gruposFiltrados.map((g) => (
            <Card key={g.id} style={{ marginBottom: 16 }}>
              <View
                style={[
                  s.row,
                  {
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 8,
                  },
                ]}
              >
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={s.grupoName}>{g.name}</Text>
                  <Text style={[s.textMuted, { fontSize: 12, marginTop: 4 }]}>
                    Creado el {g.dateCreated} · {g.count} estudiantes
                  </Text>
                </View>

                <Badge label={g.status} type={g.badgeType as any} />
              </View>
              <View
                style={[s.row, { gap: 6, flexWrap: "wrap", marginBottom: 12 }]}
              >
                {g.tags.map((t) => (
                  <Tag key={t} label={t} />
                ))}
              </View>
              <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
                <BtnOutline
                  label="Ver grupo"
                  small
                  onPress={() => openGroupViewer(g.id)}
                />
                <BtnOutline
                  label="Enviar a empresa"
                  small
                  disabled={!g.empresaAsignada}
                />
                <BtnOutline
                  label="Editar"
                  small
                  onPress={() => openGroupEditor(g)}
                />
              </View>
            </Card>
          ))
        )}

        {/* ── Acceso a Empresas aliadas ── */}
        <TouchableOpacity
          style={[
            s.card,
            {
              flexDirection: "row",
              alignItems: "center",
              padding: 18,
              marginBottom: 32,
            },
          ]}
          onPress={() => setSection("empresas")}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 30, marginRight: 16 }}>🏢</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.textSub, { fontSize: 15, fontWeight: "700" }]}>
              Empresas aliadas
            </Text>
            <Text style={[s.textMuted, { fontSize: 13, marginTop: 4 }]}>
              Gestiona los convenios y empresas aliadas.
            </Text>
          </View>
          <Text style={{ color: C.accent70, fontSize: 20 }}>›</Text>
        </TouchableOpacity>

        {/* ══ SECCIÓN 2: HORAS SOCIALES ══ */}
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 20,
            marginBottom: 16,
            borderTopWidth: 1,
            borderTopColor: C.border,
          }}
        >
          <SectionKicker>Seguimiento académico</SectionKicker>
          <PageTitle>Horas Sociales</PageTitle>
        </View>

        {/* Filtro por grupo */}
        <Text
          style={[
            s.textMuted,
            {
              fontSize: 11,
              letterSpacing: 0.8,
              paddingHorizontal: 16,
              marginBottom: 8,
            },
          ]}
        >
          FILTRAR POR GRUPO
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 14 }}
        >
          <View style={[s.row, { gap: 6, paddingHorizontal: 16 }]}>
            {GRUPOS_FILTER.map((g) => (
              <Chip
                key={g}
                label={g === "Todos" ? "Todos los grupos" : g}
                active={gestionGrupoFilter === g}
                onPress={() => {
                  setGestionGrupoFilter(g);
                  setGestionEstudianteFilter("Todos");
                }}
              />
            ))}
          </View>
        </ScrollView>

        {/* Filtro por estudiante */}
        <Text
          style={[
            s.textMuted,
            {
              fontSize: 11,
              letterSpacing: 0.8,
              paddingHorizontal: 16,
              marginBottom: 8,
            },
          ]}
        >
          FILTRAR POR ESTUDIANTE
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 16 }}
        >
          <View style={[s.row, { gap: 6, paddingHorizontal: 16 }]}>
            {estudiantesOpts.map((e) => (
              <Chip
                key={e}
                label={e === "Todos" ? "Todos" : e}
                active={gestionEstudianteFilter === e}
                onPress={() => setGestionEstudianteFilter(e)}
              />
            ))}
          </View>
        </ScrollView>

        {/* Tabs de estado */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 16 }}
        >
          <View style={[s.row, { gap: 4, paddingHorizontal: 16 }]}>
            {(
              [
                { key: "pendientes", label: "Pendientes", badge: 3 },
                { key: "en-curso", label: "En curso" },
                { key: "validadas", label: "Validadas" },
                { key: "rechazadas", label: "Rechazadas" },
              ] as { key: HorasTab; label: string; badge?: number }[]
            ).map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[s.tab, gestionHorasTab === t.key && s.tabActive]}
                onPress={() => setGestionHorasTab(t.key)}
              >
                <Text
                  style={[
                    s.tabText,
                    gestionHorasTab === t.key && s.tabTextActive,
                  ]}
                >
                  {t.label}
                  {t.badge ? ` (${t.badge})` : ""}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <View
          style={[
            s.row,
            {
              gap: 10,
              paddingHorizontal: 16,
              marginBottom: 12,
              flexWrap: "wrap",
            },
          ]}
        >
          <BtnOutline
            label="Ver perfil universidad"
            small
            disabled={!universidadId}
            onPress={() => {
              if (!universidadId) return;
              openProfileViewer(universidadId, "universidad");
            }}
          />
          <BtnOutline
            label="Ver perfil talento"
            small
            onPress={() => openProfileViewer("demo-talento-1", "talento")}
          />
        </View>

        {/* Tab: Pendientes */}
        {gestionHorasTab === "pendientes" && (
          <>
            {pendientesData.length === 0 && (
              <Text style={[s.textMuted, { textAlign: "center", padding: 24 }]}>
                No hay solicitudes para este grupo.
              </Text>
            )}
            {pendientesData.map((item) => (
              <Card key={item.grupo} style={{ marginBottom: 16 }}>
                <View style={s.empresaHeader}>
                  <View style={s.empresaLogo}>
                    <Text style={{ fontSize: 22 }}>{item.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.empresaName}>{item.grupo}</Text>
                    <Text style={s.empresaSector}>{item.empresa}</Text>
                  </View>
                  <Badge label="Pendiente" type="pending" />
                </View>
                <Text style={[s.textMuted, { fontSize: 13, marginTop: 12 }]}>
                  📅 Período: {item.periodo} · {item.horas} horas
                </Text>
                {item.empresaId ? (
                  <BtnOutline
                    label="Ver empresa"
                    small
                    style={{ marginTop: 12 }}
                    onPress={() => openProfileViewer(item.empresaId, "empresa")}
                  />
                ) : null}
              </Card>
            ))}
          </>
        )}

        {/* Tab: En curso */}
        {gestionHorasTab === "en-curso" && (
          <>
            {enCursoData.length === 0 && (
              <Text style={[s.textMuted, { textAlign: "center", padding: 24 }]}>
                No hay registros para este filtro.
              </Text>
            )}
            {enCursoData.map((e) => (
              <Card key={e.name} style={{ marginBottom: 16 }}>
                <View style={s.empresaHeader}>
                  <View style={s.empresaLogo}>
                    <Text style={{ fontSize: 22 }}>{e.avatar}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.empresaName}>{e.name}</Text>
                    <Text style={s.empresaSector}>{e.sub}</Text>
                  </View>
                </View>
                <Text style={[s.textMuted, { fontSize: 12, marginTop: 8 }]}>
                  Último registro: {e.last}
                </Text>
                <View style={s.progressWrap}>
                  <View
                    style={[s.progressBar, { width: `${e.pct}%` as any }]}
                  />
                </View>
                <Text style={[s.textMuted, { fontSize: 12, marginTop: 4 }]}>
                  {e.done} / {e.total} horas completadas
                </Text>
                <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
                  <BtnOutline
                    label="Ver detalle"
                    small
                    style={{ marginTop: 12 }}
                  />
                  {e.talentoId ? (
                    <BtnOutline
                      label="Ver talento"
                      small
                      style={{ marginTop: 12 }}
                      onPress={() => openProfileViewer(e.talentoId, "talento")}
                    />
                  ) : null}
                </View>
              </Card>
            ))}
          </>
        )}

        {/* Tab: Validadas */}
        {gestionHorasTab === "validadas" && (
          <>
            {validadasData.length === 0 && (
              <Text style={[s.textMuted, { textAlign: "center", padding: 24 }]}>
                No hay registros para este filtro.
              </Text>
            )}
            {validadasData.map((e) => (
              <Card
                key={e.name}
                style={{
                  marginBottom: 16,
                  borderColor: e.certified ? C.accent40 : C.border,
                }}
              >
                {e.certified && (
                  <View style={s.certSeal}>
                    <Text style={s.certSealText}>CERTIFICADO</Text>
                  </View>
                )}
                <View style={s.empresaHeader}>
                  <View style={s.empresaLogo}>
                    <Text style={{ fontSize: 22 }}>{e.avatar}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.empresaName}>{e.name}</Text>
                    <Text style={s.empresaSector}>{e.sub}</Text>
                  </View>
                </View>
                <Text style={[s.textMuted, { fontSize: 12, marginTop: 8 }]}>
                  Evidencias: {e.evidencias}
                </Text>
                {e.certified ? (
                  <Text style={[s.textMuted, { fontSize: 12 }]}>
                    Firma digital: {e.firma}
                  </Text>
                ) : (
                  <>
                    <Text
                      style={[s.textMuted, { fontSize: 12, marginBottom: 16 }]}
                    >
                      Horas reportadas: 120 · Pendiente firma
                    </Text>
                    <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
                      {e.talentoId ? (
                        <BtnOutline
                          label="Ver talento"
                          small
                          style={{ marginTop: 0 }}
                          onPress={() =>
                            openProfileViewer(e.talentoId, "talento")
                          }
                        />
                      ) : null}
                      <TouchableOpacity
                        style={[
                          s.btnPrimary,
                          s.btnSm,
                          { backgroundColor: C.green },
                        ]}
                        onPress={noop}
                      >
                        <Text style={s.btnPrimaryText}>
                          ✓ Validar y certificar
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          s.btnPrimary,
                          s.btnSm,
                          { backgroundColor: C.red },
                        ]}
                        onPress={() => setModalRechazar(true)}
                      >
                        <Text style={s.btnPrimaryText}>✕ Rechazar</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </Card>
            ))}
          </>
        )}

        {/* Tab: Rechazadas */}
        {gestionHorasTab === "rechazadas" &&
          (gestionGrupoFilter !== "Todos" &&
          gestionGrupoFilter !== "Ing. Química – Grupo E" ? (
            <Text style={[s.textMuted, { textAlign: "center", padding: 24 }]}>
              No hay rechazos para este grupo.
            </Text>
          ) : (
            <Card style={{ marginBottom: 16 }}>
              <View style={s.empresaHeader}>
                <View style={s.empresaLogo}>
                  <Text style={{ fontSize: 22 }}>🔬</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.empresaName}>Ing. Química – Grupo E</Text>
                  <Text style={s.empresaSector}>BioMed Labs</Text>
                </View>
                <Badge label="Rechazada" type="rejected" />
              </View>
              <View
                style={[
                  s.card,
                  {
                    marginTop: 12,
                    backgroundColor: C.redBg,
                    borderColor: "rgba(239,68,68,0.25)",
                  },
                ]}
              >
                <Text style={[s.textMuted, { fontSize: 12 }]}>
                  Motivo de rechazo:
                </Text>
                <Text style={[s.textSub, { fontSize: 13, marginTop: 4 }]}>
                  El grupo no cumplía los requisitos mínimos de créditos
                  académicos establecidos en el convenio.
                </Text>
              </View>
            </Card>
          ))}

        <View style={{ height: 24 }} />
      </ScrollView>
    );
  };

  const renderProfileViewerModal = () => (
    <ProfileViewerModal
      visible={profileViewerOpen}
      userId={profileViewerUserId ?? ""}
      userType={profileViewerUserType}
      onClose={() => setProfileViewerOpen(false)}
    />
  );

  const renderGrupos = () => (
    <ScrollView showsVerticalScrollIndicator={false}>
      <TouchableOpacity
        onPress={() => setSection("gestion")}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 4,
        }}
        activeOpacity={0.7}
      >
        <Text style={{ color: C.accent70, fontSize: 16 }}>
          ‹ Gestión Práctica
        </Text>
      </TouchableOpacity>
      <View
        style={[
          s.sectionHeader,
          {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-end",
          },
        ]}
      >
        <View>
          <SectionKicker>Gestión académica</SectionKicker>
          <PageTitle>Grupos de estudiantes</PageTitle>
        </View>
        <BtnPrimary
          label="+ Crear grupo"
          onPress={() => setGroupCreationOpen(true)}
          small
        />
      </View>

      {isLoadingGruposDb ? (
        <Text style={[s.textMuted, { paddingHorizontal: 16, marginTop: 8 }]}>
          Cargando grupos...
        </Text>
      ) : gruposDb.length === 0 ? (
        <Text style={[s.textMuted, { paddingHorizontal: 16, marginTop: 8 }]}>
          No hay grupos registrados en la base de datos.
        </Text>
      ) : (
        gruposDb.map((g) => (
          <Card key={g.id} style={{ marginBottom: 16 }}>
            <View
              style={[
                s.row,
                {
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 8,
                },
              ]}
            >
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={s.grupoName}>{g.nombre}</Text>
                <Text style={[s.textMuted, { fontSize: 12, marginTop: 4 }]}>
                  Creado el {formatDateString(g.created_at)} ·{" "}
                  {g.studentCount ?? 0} estudiante(s)
                </Text>
                {g.empresaAsignada ? (
                  <Text style={[s.textMuted, { fontSize: 12, marginTop: 2 }]}>
                    Empresa: {g.empresaAsignada}
                  </Text>
                ) : null}
                {g.inicio || g.fin ? (
                  <Text style={[s.textMuted, { fontSize: 12, marginTop: 2 }]}>
                    Inicio: {formatDateString(g.inicio)} · Fin:{" "}
                    {formatDateString(g.fin)}
                  </Text>
                ) : null}
              </View>
              <Badge
                label={g.status ?? "Activo"}
                type={(g.badgeType as any) ?? "active"}
              />
            </View>
            {g.carrera ? (
              <View
                style={[s.row, { gap: 6, flexWrap: "wrap", marginBottom: 12 }]}
              >
                <Tag key={g.carrera} label={g.carrera} />
              </View>
            ) : null}
            <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
              <BtnOutline
                label="Ver grupo"
                small
                onPress={() => openGroupViewer(g.id)}
              />
              <BtnOutline label="Enviar a empresa" small disabled />
              <BtnOutline label="Editar" small />
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );

  const renderHoras = () => (
    <ScrollView showsVerticalScrollIndicator={false}>
      <TouchableOpacity
        onPress={() => setSection("gestion")}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 4,
        }}
        activeOpacity={0.7}
      >
        <Text style={{ color: C.accent70, fontSize: 16 }}>
          ‹ Gestión Práctica
        </Text>
      </TouchableOpacity>
      <View style={s.sectionHeader}>
        <SectionKicker>Seguimiento académico</SectionKicker>
        <PageTitle>Horas sociales</PageTitle>
      </View>

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 20 }}
      >
        <View style={[s.row, { gap: 4 }]}>
          {(
            [
              { key: "pendientes", label: "Pendientes", badge: 3 },
              { key: "en-curso", label: "En curso" },
              { key: "validadas", label: "Validadas" },
              { key: "rechazadas", label: "Rechazadas" },
            ] as { key: HorasTab; label: string; badge?: number }[]
          ).map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[s.tab, horasTab === t.key && s.tabActive]}
              onPress={() => setHorasTab(t.key)}
            >
              <Text style={[s.tabText, horasTab === t.key && s.tabTextActive]}>
                {t.label}
                {t.badge ? ` (${t.badge})` : ""}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {horasTab === "pendientes" && (
        <>
          {[
            {
              icon: "💼",
              grupo: "Ing. Sistemas – Grupo A",
              empresa: "TechSV Solutions",
              periodo: "15/05/2026 – 15/08/2026",
              horas: 120,
            },
            {
              icon: "🌐",
              grupo: "Diseño Gráfico – Grupo B",
              empresa: "WebFactory CR",
              periodo: "20/05/2026 – 20/08/2026",
              horas: 100,
            },
            {
              icon: "🏦",
              grupo: "Administración – Grupo C",
              empresa: "Banco Agrícola",
              periodo: "01/06/2026 – 01/09/2026",
              horas: 120,
            },
          ].map((item) => (
            <Card key={item.grupo} style={{ marginBottom: 16 }}>
              <View style={s.empresaHeader}>
                <View style={s.empresaLogo}>
                  <Text style={{ fontSize: 22 }}>{item.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.empresaName}>{item.grupo}</Text>
                  <Text style={s.empresaSector}>{item.empresa}</Text>
                </View>
                <Badge label="Pendiente de respuesta" type="pending" />
              </View>
              <Text style={[s.textMuted, { fontSize: 13, marginTop: 12 }]}>
                📅 Período: {item.periodo} · {item.horas} horas
              </Text>
            </Card>
          ))}
        </>
      )}

      {horasTab === "en-curso" && (
        <>
          {[
            {
              avatar: "👨‍💻",
              name: "Carlos Martínez",
              sub: "Ing. Sistemas · UDB",
              last: "03/05/2026",
              done: 90,
              total: 120,
              pct: 75,
            },
            {
              avatar: "👩‍🎨",
              name: "María López",
              sub: "Diseño Gráfico · UDB",
              last: "02/05/2026",
              done: 50,
              total: 100,
              pct: 50,
            },
          ].map((e) => (
            <Card key={e.name} style={{ marginBottom: 16 }}>
              <View style={s.empresaHeader}>
                <View style={s.empresaLogo}>
                  <Text style={{ fontSize: 22 }}>{e.avatar}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.empresaName}>{e.name}</Text>
                  <Text style={s.empresaSector}>{e.sub}</Text>
                </View>
              </View>
              <Text style={[s.textMuted, { fontSize: 12, marginTop: 8 }]}>
                Último registro: {e.last}
              </Text>
              <View style={s.progressWrap}>
                <View style={[s.progressBar, { width: `${e.pct}%` as any }]} />
              </View>
              <Text style={[s.textMuted, { fontSize: 12, marginTop: 4 }]}>
                {e.done} / {e.total} horas completadas
              </Text>
              <BtnOutline label="Ver detalle" small style={{ marginTop: 12 }} />
            </Card>
          ))}
        </>
      )}

      {horasTab === "validadas" && (
        <>
          <Card style={{ marginBottom: 16, borderColor: C.accent40 }}>
            <View style={s.certSeal}>
              <Text style={s.certSealText}>CERTIFICADO</Text>
            </View>
            <View style={s.empresaHeader}>
              <View style={s.empresaLogo}>
                <Text style={{ fontSize: 22 }}>👨‍🔬</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.empresaName}>José Ramos</Text>
                <Text style={s.empresaSector}>BioMed Labs · 120 horas</Text>
              </View>
            </View>
            <Text style={[s.textMuted, { fontSize: 12, marginTop: 8 }]}>
              Evidencias: 📄 Informe final · 🖼 Fotografías
            </Text>
            <Text style={[s.textMuted, { fontSize: 12 }]}>
              Firma digital: BioMed Labs — 28/04/2026
            </Text>
          </Card>
          <Card style={{ marginBottom: 16 }}>
            <View style={s.empresaHeader}>
              <View style={s.empresaLogo}>
                <Text style={{ fontSize: 22 }}>👩‍💻</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.empresaName}>Valentina Cruz</Text>
                <Text style={s.empresaSector}>
                  TechSV Solutions · 120 horas
                </Text>
              </View>
            </View>
            <Text style={[s.textMuted, { fontSize: 12, marginTop: 12 }]}>
              Evidencias: 📄 Reporte · 📊 Presentación
            </Text>
            <Text style={[s.textMuted, { fontSize: 12, marginBottom: 16 }]}>
              Horas reportadas: 120 · Pendiente firma
            </Text>
            <View style={[s.row, { gap: 8 }]}>
              <TouchableOpacity
                style={[s.btnPrimary, s.btnSm, { backgroundColor: C.green }]}
                onPress={noop}
              >
                <Text style={s.btnPrimaryText}>✓ Validar y certificar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btnPrimary, s.btnSm, { backgroundColor: C.red }]}
                onPress={() => setModalRechazar(true)}
              >
                <Text style={s.btnPrimaryText}>✕ Rechazar con nota</Text>
              </TouchableOpacity>
            </View>
          </Card>
        </>
      )}

      {horasTab === "rechazadas" && (
        <Card>
          <View style={s.empresaHeader}>
            <View style={s.empresaLogo}>
              <Text style={{ fontSize: 22 }}>🔬</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.empresaName}>Ing. Química – Grupo E</Text>
              <Text style={s.empresaSector}>BioMed Labs</Text>
            </View>
            <Badge label="Rechazada" type="rejected" />
          </View>
          <View
            style={[
              s.card,
              {
                marginTop: 12,
                backgroundColor: C.redBg,
                borderColor: "rgba(239,68,68,0.25)",
              },
            ]}
          >
            <Text style={[s.textMuted, { fontSize: 12 }]}>
              Motivo de rechazo:
            </Text>
            <Text style={[s.textSub, { fontSize: 13, marginTop: 4 }]}>
              El grupo no cumplía los requisitos mínimos de créditos académicos
              establecidos en el convenio.
            </Text>
          </View>
        </Card>
      )}
    </ScrollView>
  );

  const renderEmpresas = () => (
    <ScrollView showsVerticalScrollIndicator={false}>
      <TouchableOpacity
        onPress={() => setSection("gestion")}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 4,
        }}
        activeOpacity={0.7}
      >
        <Text style={{ color: C.accent70, fontSize: 16 }}>
          ‹ Gestión Práctica
        </Text>
      </TouchableOpacity>
      <View style={s.sectionHeader}>
        <SectionKicker>Red de convenios</SectionKicker>
        <PageTitle>Empresas</PageTitle>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 20 }}
      >
        <View style={[s.row, { gap: 8 }]}>
          {[
            "Todas",
            "Convenio activo",
            "Tecnología",
            "Finanzas",
            "Salud",
            "Logística",
          ].map((f) => (
            <Chip key={f} label={f} active={f === "Todas"} onPress={noop} />
          ))}
        </View>
      </ScrollView>
      <EmpresaCard
        icon="💼"
        name="TechSV Solutions"
        sector="Tecnología"
        rating="4.8"
        reviews="124"
        horas={45}
        badgeLabel="Premium"
        badgeType="premium"
        showConvenio
      />
      <EmpresaCard
        icon="🏦"
        name="Banco Agrícola"
        sector="Finanzas"
        rating="4.7"
        reviews="209"
        horas={60}
        badgeLabel="Internacional"
        badgeType="internacional"
        showConvenio
      />
      <EmpresaCard
        icon="🔬"
        name="BioMed Labs"
        sector="Salud · Biotecnología"
        rating="4.5"
        reviews="67"
        horas={25}
        badgeLabel="Verificada"
        badgeType="verificada"
      />
    </ScrollView>
  );

  const renderPublicar = () => (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={s.sectionHeader}>
        <SectionKicker>Comunicación institucional</SectionKicker>
        <PageTitle>Publicar contenido</PageTitle>
      </View>

      {/* Tipos de publicación */}
      <View style={[s.grid2, { marginBottom: 28 }]}>
        {(
          [
            {
              key: "anuncio",
              icon: "📢",
              title: "Anuncio o Noticia",
              desc: "Comparte información relevante",
            },
            {
              key: "oferta",
              icon: "🎓",
              title: "Oferta educativa",
              desc: "Programas, cursos o especializaciones",
            },
            {
              key: "evento",
              icon: "📅",
              title: "Evento",
              desc: "Ferias, seminarios, talleres",
            },
            {
              key: "convocatoria",
              icon: "🏢",
              title: "Convocatoria de horas sociales",
              desc: "Invita a empresas a recibir estudiantes",
            },
          ] as { key: PubType; icon: string; title: string; desc: string }[]
        ).map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[s.pubTypeCard, pubType === p.key && s.pubTypeCardActive]}
            onPress={() => setPubType(p.key)}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 28, marginBottom: 8 }}>{p.icon}</Text>
            <Text style={s.empresaName}>{p.title}</Text>
            <Text style={[s.textMuted, { fontSize: 12, marginTop: 4 }]}>
              {p.desc}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Card style={{ marginBottom: 32 }}>
        <Text style={s.inputLabel}>Título de la publicación</Text>
        <TextInput
          style={s.input}
          value={pubTitulo}
          onChangeText={setPubTitulo}
          placeholder="Escribe un título claro y descriptivo"
          placeholderTextColor={C.textMuted}
        />
        <Text style={[s.inputLabel, { marginTop: 16 }]}>Descripción</Text>
        <TextInput
          style={[s.input, { height: 100, textAlignVertical: "top" }]}
          value={pubDescripcion}
          onChangeText={setPubDescripcion}
          multiline
          placeholder="Describe el contenido de tu publicación..."
          placeholderTextColor={C.textMuted}
        />

        <Text style={[s.inputLabel, { marginTop: 16 }]}>Visibilidad</Text>
        <View style={[s.row, { gap: 8, flexWrap: "wrap", marginTop: 8 }]}>
          {(
            [
              { key: "publica", label: "🌐 Pública" },
              { key: "estudiantes", label: "🎓 Solo mis estudiantes" },
              { key: "empresas", label: "🏢 Solo empresas aliadas" },
            ] as {
              key: "publica" | "estudiantes" | "empresas";
              label: string;
            }[]
          ).map((v) => (
            <Chip
              key={v.key}
              label={v.label}
              active={pubVisibility === v.key}
              onPress={() => setPubVisibility(v.key)}
            />
          ))}
        </View>

        <BtnPrimary
          label="Publicar →"
          style={{ marginTop: 24 }}
          onPress={noop}
        />
        <BtnOutline
          label="Guardar borrador"
          style={{ marginTop: 12 }}
          onPress={noop}
        />
      </Card>
    </ScrollView>
  );

  const renderNotificaciones = () => (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View
        style={[
          s.sectionHeader,
          {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-end",
          },
        ]}
      >
        <PageTitle>Notificaciones</PageTitle>
        <BtnOutline
          label="Marcar todo leído"
          small
          onPress={() => setUnreadRead(true)}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 20 }}
      >
        <View style={[s.row, { gap: 8 }]}>
          {[
            "Todas",
            "Horas sociales",
            "Empresas",
            "Estudiantes",
            "Sistema",
          ].map((f) => (
            <Chip
              key={f}
              label={f}
              active={notifFilter === f}
              onPress={() => setNotifFilter(f)}
            />
          ))}
        </View>
      </ScrollView>

      {!unreadRead && (
        <>
          <Text
            style={[
              s.textMuted,
              {
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 12,
              },
            ]}
          >
            Sin leer
          </Text>
          {[
            {
              icon: "🏢",
              text: "Nueva empresa ha publicado cupos de horas sociales para Ing. Sistemas",
              sub: "LogiSV Corp · hace 20 min",
            },
            {
              icon: "✅",
              text: "Tu solicitud de horas sociales fue aprobada por TechSV Solutions",
              sub: "hace 1 hora",
            },
            {
              icon: "⏳",
              text: "Tu solicitud fue puesta en revisión por Banco Agrícola",
              sub: "hace 2 horas",
            },
            {
              icon: "⭐",
              text: "BioMed Labs evaluó a José Ramos con 5 estrellas",
              sub: "hace 5 horas",
            },
            {
              icon: "🎓",
              text: "3 estudiantes completaron sus horas sociales en TechSV Solutions",
              sub: "ayer 18:30",
            },
          ].map((n, i) => (
            <Card key={i} style={[{ marginBottom: 10 }, s.notifUnread]}>
              <View style={s.notifDot} />
              <Text style={{ fontSize: 20, marginRight: 12 }}>{n.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.textSub, { fontSize: 13 }]}>{n.text}</Text>
                <Text style={[s.textMuted, { fontSize: 12, marginTop: 2 }]}>
                  {n.sub}
                </Text>
              </View>
            </Card>
          ))}
        </>
      )}

      <Text
        style={[
          s.textMuted,
          {
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 1,
            marginBottom: 12,
            marginTop: 8,
          },
        ]}
      >
        Leídas
      </Text>
      {[
        {
          icon: "👤",
          text: "Valentina Cruz activó su cuenta en Gradly",
          sub: "30/04/2026",
        },
        {
          icon: "🏢",
          text: "Nueva empresa verificada en tu área académica: WebFactory CR",
          sub: "29/04/2026",
        },
      ].map((n, i) => (
        <Card key={i} style={[{ marginBottom: 10 }, s.notifRead]}>
          <Text style={{ fontSize: 20, marginRight: 12 }}>{n.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.textSub, { fontSize: 13 }]}>{n.text}</Text>
            <Text style={[s.textMuted, { fontSize: 12, marginTop: 2 }]}>
              {n.sub}
            </Text>
          </View>
        </Card>
      ))}
    </ScrollView>
  );

  const renderPerfil = () => (
    <ScrollView showsVerticalScrollIndicator={false}>
      {/* Perfil estilo 'Facebook': contenedor principal morado/oscuro */}
      <View style={s.profileHeaderContainer}>
        {/* Banner: imagen proveniente de la BD. Si no existe, se muestra un placeholder. */}
        {universidad?.banner_url ? (
          <Image
            source={{ uri: universidad.banner_url }}
            style={s.bannerImage}
            resizeMode="cover"
          />
        ) : (
          // Imagen estática de placeholder (reemplazar por DB)
          <View
            style={[
              s.bannerImage,
              { alignItems: "center", justifyContent: "center" },
            ]}
          >
            <Text style={{ color: C.textMuted }}>No banner disponible</Text>
          </View>
        )}

        {/* Logo: imagen de la BD colocada absolute para superponerse en la línea divisoria */}
        {universidad?.logo_url ? (
          <Image
            source={{ uri: universidad.logo_url }}
            style={s.logoImage}
            resizeMode="cover"
          />
        ) : (
          // Logo estático (emoji) — comentar en el código: placeholder local
          <View style={s.logoImage}>
            <Text style={{ fontSize: 28 }}>🏛️</Text>
          </View>
        )}

        <View
          style={{ paddingHorizontal: 16, paddingTop: 48, paddingBottom: 14 }}
        >
          <Text style={[s.pageTitle, { textAlign: "center" }]}>
            {nombreUniv}
          </Text>
          {/* Centrar horizontalmente el texto de verificación */}
          <View style={{ alignItems: "center", marginTop: 8 }}>
            <Badge label="Universidad verificada ✓" type="verificada" />
          </View>

          {/* Descripción: mapear desde la BD */}
          <Text
            style={[
              s.textSub,
              { fontSize: 13, textAlign: "center", marginTop: 10 },
            ]}
          >
            {universidad?.descripcion ??
              "Agrega una descripción institucional en Configuración."}
          </Text>

          <View
            style={[
              s.row,
              {
                gap: 6,
                flexWrap: "wrap",
                justifyContent: "center",
                marginTop: 12,
              },
            ]}
          >
            {/* Acreditaciones estáticas: mantener como etiquetas, pueden provenir de BD en iteración futura */}
            {(["✓ ACAP", "✓ ISO 9001", "✓ MINED"] as string[]).map((a) => (
              <Tag key={a} label={a} />
            ))}
          </View>

          <View style={s.profileStats}>
            <Text style={s.textMuted}>
              <Text style={{ color: C.accent70, fontWeight: "700" }}>
                {universidad?.estudiantesCount ?? "—"}
              </Text>{" "}
              estudiantes
            </Text>
            <Text style={s.textMuted}>
              <Text style={{ color: C.accent70, fontWeight: "700" }}>
                {universidad?.carrerasCount ?? "—"}
              </Text>{" "}
              carreras
            </Text>
            <Text style={s.textMuted}>
              <Text style={{ color: C.accent70, fontWeight: "700" }}>
                {universidad?.empresasAliadas ?? "—"}
              </Text>{" "}
              empresas aliadas
            </Text>
          </View>

          {/* Botón editar perfil institucional — COMENTADO: placeholder estático para edición */}
          {/* BtnPrimary: Editar perfil institucional (actualmente abre modal local). Reemplazar por flujo de edición institucional. */}
          <BtnPrimary
            label="✎ Editar perfil institucional"
            onPress={() => setModalEditPerfil(true)}
            style={{ marginTop: 16 }}
          />
        </View>
      </View>

      {/* Profile tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 20 }}
      >
        <View style={[s.row, { gap: 4 }]}>
          {(
            [
              { key: "inicio", label: "Inicio" },
              { key: "carreras", label: "Carreras" },
              { key: "aliadas", label: "Empresas aliadas" },
              { key: "destacados", label: "Estudiantes destacados" },
            ] as { key: PerfilTab; label: string }[]
          ).map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[s.tab, perfilTab === t.key && s.tabActive]}
              onPress={() => setPerfilTab(t.key)}
            >
              <Text style={[s.tabText, perfilTab === t.key && s.tabTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {perfilTab === "inicio" && (
        <>
          <Card style={{ marginBottom: 16 }}>
            <Text style={[s.subsectionTitle, { marginBottom: 16 }]}>
              Contacto y redes
            </Text>

            {/* Correo institucional */}
            <View
              style={[s.row, { marginBottom: 12, alignItems: "flex-start" }]}
            >
              <Text style={{ fontSize: 20, marginRight: 12 }}>📧</Text>
              <View>
                <Text style={[s.textMuted, { fontSize: 12 }]}>
                  Correo institucional
                </Text>
                <Text style={[s.textSub, { fontSize: 14 }]}>
                  {universidad?.email_institucional ?? "No registrado"}
                </Text>
              </View>
            </View>

            {/* Ubicación: dirección + ciudad/departamento */}
            <View
              style={[s.row, { marginBottom: 12, alignItems: "flex-start" }]}
            >
              <Text style={{ fontSize: 20, marginRight: 12 }}>📍</Text>
              <View>
                <Text style={[s.textMuted, { fontSize: 12 }]}>Ubicación</Text>
                <Text style={[s.textSub, { fontSize: 14 }]}>
                  {universidad?.direccion ?? "No registrada"}
                </Text>
                <Text style={[s.textMuted, { fontSize: 12, marginTop: 4 }]}>
                  {universidad?.ciudad || universidad?.departamento
                    ? `${universidad?.ciudad ?? ""}${universidad?.ciudad && universidad?.departamento ? ", " : ""}${universidad?.departamento ?? ""}, El Salvador`
                    : ""}
                </Text>
              </View>
            </View>

            {/* Teléfono */}
            <View
              style={[s.row, { marginBottom: 12, alignItems: "flex-start" }]}
            >
              <Text style={{ fontSize: 20, marginRight: 12 }}>📱</Text>
              <View>
                <Text style={[s.textMuted, { fontSize: 12 }]}>Teléfono</Text>
                <Text style={[s.textSub, { fontSize: 14 }]}>
                  {universidad?.telefono ?? "No registrado"}
                </Text>
              </View>
            </View>

            {/* Redes sociales: mostrar iconos/enlaces si existen, sino mostrar mensaje */}
            <View style={{ marginTop: 8 }}>
              <Text style={[s.textMuted, { fontSize: 12, marginBottom: 8 }]}>
                Redes
              </Text>
              <View style={[s.row, { gap: 12, flexWrap: "wrap" }]}>
                {(() => {
                  const keys = [
                    "instagram",
                    "tiktok",
                    "facebook",
                    "linkedin",
                    "twitter",
                  ];
                  const links = keys.map((k) => ({
                    key: k,
                    url: universidad?.[k],
                  }));
                  const present = links.filter((l) => l.url);
                  if (present.length === 0) {
                    return (
                      <Text style={s.textMuted}>
                        Agrega tu enlace de contacto en Configuracion
                      </Text>
                    );
                  }
                  return present.map((p) => (
                    <TouchableOpacity
                      key={p.key}
                      onPress={() => p.url && Linking.openURL(p.url)}
                    >
                      <Text style={[s.textSub, { fontSize: 14 }]}>{p.key}</Text>
                    </TouchableOpacity>
                  ));
                })()}
              </View>
            </View>
          </Card>
          <Card>
            <Text style={[s.subsectionTitle, { marginBottom: 16 }]}>
              Próximos eventos
            </Text>
            {[].map((ev) => (
              <Card key={ev.title} style={{ marginBottom: 12, padding: 14 }}>
                <Text style={[s.textSub, { fontSize: 13, fontWeight: "600" }]}>
                  {ev.title}
                </Text>
                <Text style={[s.textMuted, { fontSize: 12, marginTop: 4 }]}>
                  {ev.sub}
                </Text>
              </Card>
            ))}
          </Card>
        </>
      )}

      {perfilTab === "carreras" && (
        <>
          {[
            {
              name: "Ingeniería en Sistemas",
              dur: "5 años · Presencial",
              coord: "👩‍💻 Coord. Ana García",
            },
            {
              name: "Diseño Gráfico",
              dur: "4 años · Presencial",
              coord: "👨‍🎨 Coord. Mario Pérez",
            },
            {
              name: "Administración de Empresas",
              dur: "4 años · Mixta",
              coord: "👩‍💼 Coord. Laura Vásquez",
            },
          ].map((c) => (
            <Card key={c.name} style={{ marginBottom: 16 }}>
              <Text style={s.empresaName}>{c.name}</Text>
              <Text style={[s.textMuted, { fontSize: 12, marginVertical: 6 }]}>
                {c.dur}
              </Text>
              <Badge label="Presencial" type="verificada" />
              <Text style={[s.textSub, { fontSize: 13, marginTop: 14 }]}>
                {c.coord}
              </Text>
            </Card>
          ))}
        </>
      )}

      {perfilTab === "aliadas" && (
        <View style={s.grid2}>
          {[
            { icon: "💼", name: "TechSV Solutions" },
            { icon: "🏦", name: "Banco Agrícola" },
            { icon: "📡", name: "Tigo El Salvador" },
            { icon: "🔬", name: "BioMed Labs" },
          ].map((e) => (
            <TouchableOpacity
              key={e.name}
              style={[s.card, s.aliadaCard]}
              onPress={noop}
              activeOpacity={0.75}
            >
              <Text style={{ fontSize: 36, marginBottom: 8 }}>{e.icon}</Text>
              <Text
                style={[
                  s.textSub,
                  { fontSize: 13, fontWeight: "600", textAlign: "center" },
                ]}
              >
                {e.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {perfilTab === "destacados" && (
        <>
          <Text style={[s.textMuted, { fontSize: 12, marginBottom: 16 }]}>
            Con permiso del estudiante para aparecer aquí.
          </Text>
          {[
            {
              avatar: "👩‍💻",
              name: "Valentina Cruz",
              role: "Ing. Sistemas",
              stars: "★★★★★",
              pts: "98.5",
            },
            {
              avatar: "👨‍🔬",
              name: "José Ramos",
              role: "Ing. Sistemas",
              stars: "★★★★★",
              pts: "96.2",
            },
            {
              avatar: "👩‍🎨",
              name: "María López",
              role: "Diseño Gráfico",
              stars: "★★★★☆",
              pts: "92.8",
            },
            {
              avatar: "👨‍💼",
              name: "Carlos Martínez",
              role: "Administración",
              stars: "★★★★☆",
              pts: "90.1",
            },
          ].map((e) => (
            <Card
              key={e.name}
              style={{ marginBottom: 16, alignItems: "center" }}
            >
              <Text style={{ fontSize: 40, marginBottom: 8 }}>{e.avatar}</Text>
              <Text style={[s.textSub, { fontSize: 15, fontWeight: "700" }]}>
                {e.name}
              </Text>
              <Text style={[s.textMuted, { fontSize: 12, marginTop: 4 }]}>
                {e.role}
              </Text>
              <Text style={{ color: C.yellow, fontSize: 16, marginTop: 6 }}>
                {e.stars}
              </Text>
              <Text style={[s.textMuted, { fontSize: 12, marginTop: 2 }]}>
                {e.pts} pts
              </Text>
            </Card>
          ))}
        </>
      )}

      {/* Actions */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 24, gap: 12 }}>
        <TouchableOpacity
          style={[
            s.card,
            { flexDirection: "row", alignItems: "center", padding: 16 },
          ]}
          onPress={() => setSection("config")}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 22, marginRight: 14 }}>⚙️</Text>
          <Text style={[s.textSub, { fontSize: 15, fontWeight: "600" }]}>
            Configuración
          </Text>
          <Text style={{ color: C.accent70, fontSize: 20, marginLeft: "auto" }}>
            ›
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            s.card,
            { flexDirection: "row", alignItems: "center", padding: 16 },
          ]}
          onPress={onLogout}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 22, marginRight: 14 }}>🚪</Text>
          <Text
            style={[
              s.textSub,
              { fontSize: 15, fontWeight: "600", color: "#ef4444" },
            ]}
          >
            Cerrar Sesión
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderConfig = () => (
    <ScrollView showsVerticalScrollIndicator={false}>
      <TouchableOpacity
        onPress={() => setSection("perfil")}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 4,
        }}
        activeOpacity={0.7}
      >
        <Text style={{ color: C.accent70, fontSize: 16 }}>‹ Mi Perfil</Text>
      </TouchableOpacity>
      <View style={s.sectionHeader}>
        <SectionKicker>Preferencias</SectionKicker>
        <PageTitle>Configuración</PageTitle>
      </View>

      <Card style={{ marginBottom: 16 }}>
        <Text style={[s.subsectionTitle, { marginBottom: 16 }]}>
          Datos del coordinador
        </Text>
        <Text style={s.inputLabel}>Nombre completo</Text>
        <TextInput
          style={s.input}
          value={cfgNombre}
          onChangeText={setCfgNombre}
        />
        <Text style={[s.inputLabel, { marginTop: 14 }]}>
          Correo electrónico
        </Text>
        <TextInput
          style={s.input}
          value={cfgEmail}
          onChangeText={setCfgEmail}
          keyboardType="email-address"
        />
        <Text style={[s.inputLabel, { marginTop: 14 }]}>Teléfono</Text>
        <TextInput
          style={s.input}
          value={cfgTel}
          onChangeText={setCfgTel}
          keyboardType="phone-pad"
        />
        <BtnPrimary
          label="Guardar cambios"
          style={{ marginTop: 20 }}
          onPress={() => Alert.alert("Guardado", "Datos actualizados.")}
        />
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Text style={[s.subsectionTitle, { marginBottom: 16 }]}>Seguridad</Text>
        <Text style={s.inputLabel}>Contraseña actual</Text>
        <TextInput
          style={s.input}
          value={cfgPwdActual}
          onChangeText={setCfgPwdActual}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor={C.textMuted}
        />
        <Text style={[s.inputLabel, { marginTop: 14 }]}>Nueva contraseña</Text>
        <TextInput
          style={s.input}
          value={cfgPwdNew}
          onChangeText={setCfgPwdNew}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor={C.textMuted}
        />
        <Text style={[s.inputLabel, { marginTop: 14 }]}>
          Confirmar nueva contraseña
        </Text>
        <TextInput
          style={s.input}
          value={cfgPwdConfirm}
          onChangeText={setCfgPwdConfirm}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor={C.textMuted}
        />
        <BtnPrimary
          label="Cambiar contraseña"
          style={{ marginTop: 20 }}
          onPress={() => Alert.alert("Actualizado", "Contraseña cambiada.")}
        />
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Text style={[s.subsectionTitle, { marginBottom: 16 }]}>
          Notificaciones
        </Text>
        {[
          {
            label: "Nuevas empresas en mi área",
            val: cfgNotif1,
            set: setCfgNotif1,
          },
          {
            label: "Solicitudes de horas sociales",
            val: cfgNotif2,
            set: setCfgNotif2,
          },
          {
            label: "Actividad de estudiantes",
            val: cfgNotif3,
            set: setCfgNotif3,
          },
          { label: "Boletines del sistema", val: cfgNotif4, set: setCfgNotif4 },
        ].map((n) => (
          <View
            key={n.label}
            style={[
              s.row,
              {
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              },
            ]}
          >
            <Text style={[s.textSub, { fontSize: 14, flex: 1 }]}>
              {n.label}
            </Text>
            <TouchableOpacity
              style={[s.toggle, n.val && s.toggleOn]}
              onPress={() => n.set(!n.val)}
            >
              <View style={[s.toggleThumb, n.val && s.toggleThumbOn]} />
            </TouchableOpacity>
          </View>
        ))}
      </Card>

      {/* Ayuda / Acerca de */}
      <View
        style={{
          height: 1,
          backgroundColor: C.border,
          marginHorizontal: 16,
          marginVertical: 8,
        }}
      />
      <TouchableOpacity
        style={[
          s.card,
          {
            marginHorizontal: 16,
            marginBottom: 12,
            padding: 14,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          },
        ]}
        onPress={() => setSection("ayuda")}
      >
        <Ionicons name="help-circle-outline" size={20} color={C.accent70} />
        <Text style={[s.subsectionTitle, { flex: 1, marginBottom: 0 }]}>
          Ayuda
        </Text>
        <Ionicons
          name="chevron-forward-outline"
          size={16}
          color={C.textMuted}
        />
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          s.card,
          {
            marginHorizontal: 16,
            marginBottom: 30,
            padding: 14,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          },
        ]}
        onPress={() => setSection("acercade")}
      >
        <Ionicons
          name="information-circle-outline"
          size={20}
          color={C.accent70}
        />
        <Text style={[s.subsectionTitle, { flex: 1, marginBottom: 0 }]}>
          Acerca de Gradly
        </Text>
        <Ionicons
          name="chevron-forward-outline"
          size={16}
          color={C.textMuted}
        />
      </TouchableOpacity>
    </ScrollView>
  );

  /** AYUDA */
  const renderAyuda = () => (
    <ScrollView showsVerticalScrollIndicator={false}>
      <TouchableOpacity
        onPress={() => setSection("config")}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 4,
        }}
        activeOpacity={0.7}
      >
        <Text style={{ color: C.accent70, fontSize: 16 }}>‹ Configuración</Text>
      </TouchableOpacity>
      <View style={s.sectionHeader}>
        <SectionKicker>Soporte</SectionKicker>
        <PageTitle>Ayuda</PageTitle>
      </View>
      <Text style={[s.textSub, { marginHorizontal: 16, marginBottom: 20 }]}>
        Te respondemos en menos de 24 horas hábiles.
      </Text>
      <Card style={{ marginBottom: 16 }}>
        <Text style={[s.subsectionTitle, { marginBottom: 14 }]}>
          Información de contacto
        </Text>
        {[
          {
            icon: "mail-outline" as keyof typeof Ionicons.glyphMap,
            label: "Correo electrónico",
            value: "hola@gradly.sv",
          },
          {
            icon: "phone-portrait-outline" as keyof typeof Ionicons.glyphMap,
            label: "WhatsApp",
            value: "+503 7000-0000",
          },
          {
            icon: "location-outline" as keyof typeof Ionicons.glyphMap,
            label: "Ubicación",
            value: "Universidad Don Bosco, Soyapango, El Salvador",
          },
          {
            icon: "time-outline" as keyof typeof Ionicons.glyphMap,
            label: "Horario",
            value: "Lunes a Viernes, 08:00 - 17:00",
          },
        ].map((ci) => (
          <View
            key={ci.label}
            style={{
              flexDirection: "row",
              gap: 12,
              alignItems: "flex-start",
              marginBottom: 12,
            }}
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                backgroundColor: C.accent20,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name={ci.icon} size={17} color={C.accent70} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.textSub, { fontSize: 12 }]}>{ci.label}</Text>
              <Text style={{ color: C.text, fontSize: 14, fontWeight: "600" }}>
                {ci.value}
              </Text>
            </View>
          </View>
        ))}
      </Card>
      <Text
        style={[s.subsectionTitle, { marginHorizontal: 16, marginBottom: 12 }]}
      >
        Preguntas frecuentes
      </Text>
      {[
        {
          q: "¿Gradly es gratuito para los jóvenes talentos?",
          a: "Sí, completamente gratuito. Los jóvenes talentos pueden registrarse y aplicar a vacantes sin ningún costo.",
        },
        {
          q: "¿Cómo funciona la validación de horas sociales?",
          a: "Las universidades aliadas se integran con Gradly para registrar y validar las horas sociales de los estudiantes.",
        },
        {
          q: "¿Cómo se procesan los pagos a freelancers?",
          a: "Los pagos se procesan a través de pasarelas seguras con una comisión Gradly del 5%.",
        },
        {
          q: "¿Puedo publicar múltiples vacantes?",
          a: "Sí, puedes publicar y gestionar todas las vacantes que necesites desde tu panel.",
        },
        {
          q: "¿Cómo se protegen los datos de mis estudiantes?",
          a: "Gradly cumple con la Ley de Protección de Datos Personales de El Salvador. Los datos se almacenan encriptados.",
        },
        {
          q: "¿Las universidades pueden ver los perfiles de los talentos?",
          a: "Solo los talentos afiliados a tu universidad son visibles en el panel institucional.",
        },
        {
          q: "¿Qué documentos necesita mi institución para registrarse?",
          a: "NRC institucional, correo oficial y nombre del coordinador. La verificación tarda 24-48 horas hábiles.",
        },
        {
          q: "¿Gradly está disponible fuera de El Salvador?",
          a: "Actualmente opera en El Salvador, con expansión planeada a Centroamérica para el segundo semestre de 2026.",
        },
      ].map((item, i) => (
        <Card key={i} style={{ marginBottom: 8, padding: 14 }}>
          <Text
            style={{
              color: C.text,
              fontSize: 14,
              fontWeight: "600",
              marginBottom: 6,
            }}
          >
            {item.q}
          </Text>
          <Text style={[s.textSub, { lineHeight: 20 }]}>{item.a}</Text>
        </Card>
      ))}
    </ScrollView>
  );

  /** ACERCA DE GRADLY */
  const renderAcercaDe = () => (
    <ScrollView showsVerticalScrollIndicator={false}>
      <TouchableOpacity
        onPress={() => setSection("config")}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 4,
        }}
        activeOpacity={0.7}
      >
        <Text style={{ color: C.accent70, fontSize: 16 }}>‹ Configuración</Text>
      </TouchableOpacity>
      <View style={s.sectionHeader}>
        <SectionKicker>Acerca de</SectionKicker>
        <PageTitle>Gradly</PageTitle>
      </View>
      <Card
        style={[
          {
            backgroundColor: C.accent20,
            marginBottom: 20,
            padding: 24,
            alignItems: "center",
          },
        ]}
      >
        <Text
          style={{
            color: C.text,
            fontSize: 20,
            fontWeight: "900",
            textAlign: "center",
            marginBottom: 8,
          }}
        >
          La plataforma que conecta talento con oportunidades
        </Text>
        <Text style={[s.textSub, { textAlign: "center" }]}>
          Nació en El Salvador para cerrar la brecha entre jóvenes talentos,
          universidades y empresas.
        </Text>
      </Card>
      <Card style={{ marginBottom: 16 }}>
        <Text style={{ color: C.accent70, fontWeight: "700", marginBottom: 4 }}>
          Misión
        </Text>
        <Text style={[s.textSub, { marginBottom: 12 }]}>
          Democratizar el acceso al empleo profesional para los jóvenes talentos
          de América Latina.
        </Text>
        <View
          style={{ height: 1, backgroundColor: C.border, marginVertical: 10 }}
        />
        <Text style={{ color: C.accent70, fontWeight: "700", marginBottom: 4 }}>
          Visión
        </Text>
        <Text style={[s.textSub, { marginBottom: 12 }]}>
          Ser el ecosistema profesional de referencia en América Latina para
          2030.
        </Text>
        <View
          style={{ height: 1, backgroundColor: C.border, marginVertical: 10 }}
        />
        <Text style={{ color: C.accent70, fontWeight: "700", marginBottom: 4 }}>
          Mercado objetivo
        </Text>
        <Text style={s.textSub}>
          Jóvenes de 18 a 30 años en El Salvador, Guatemala, Honduras y Costa
          Rica.
        </Text>
      </Card>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 16,
          paddingHorizontal: 16,
        }}
      >
        {[
          { num: "500+", label: "Empresas" },
          { num: "10K+", label: "Talentos" },
          { num: "80+", label: "Universidades" },
          { num: "247", label: "Vacantes" },
        ].map((st) => (
          <Card
            key={st.label}
            style={{
              alignItems: "center",
              padding: 16,
              flex: 1,
              minWidth: "40%",
            }}
          >
            <Text
              style={{
                fontSize: 22,
                fontWeight: "900",
                color: C.accent70,
                marginBottom: 4,
              }}
            >
              {st.num}
            </Text>
            <Text style={s.textSub}>{st.label}</Text>
          </Card>
        ))}
      </View>
      <Text
        style={[s.subsectionTitle, { marginHorizontal: 16, marginBottom: 12 }]}
      >
        El equipo detrás de Gradly
      </Text>
      {[
        {
          icon: "L",
          name: "Lindsay Jazmin Coto Marroquín",
          role: "Frontend Developer & UX Lead",
        },
        {
          icon: "D",
          name: "Diego Josué Chávez López",
          role: "Backend Developer & Arquitecto",
        },
        {
          icon: "A",
          name: "Ashlyn Lisseth Escobar Arana",
          role: "UI/UX Designer & Product",
        },
        {
          icon: "N",
          name: "Nathalia Guadalupe Guevara Zelaya",
          role: "Project Manager & QA Lead",
        },
      ].map((tm) => (
        <Card
          key={tm.name}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            padding: 14,
            marginBottom: 8,
          }}
        >
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              backgroundColor: C.accent20,
              borderWidth: 1,
              borderColor: C.accent40,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{ color: C.accent70, fontWeight: "900", fontSize: 17 }}
            >
              {tm.icon}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontSize: 14, fontWeight: "700" }}>
              {tm.name}
            </Text>
            <Text style={[s.textSub, { fontSize: 12 }]}>{tm.role}</Text>
          </View>
        </Card>
      ))}
      <View style={{ height: 20 }} />
    </ScrollView>
  );

  // ── Render section content ────────────────────────────────────
  const renderContent = () => {
    switch (section) {
      case "inicio":
        return renderInicio();
      case "explorar":
        return renderExplorar();
      case "gestion":
        return renderGestion();
      case "grupos":
        return renderGrupos();
      case "horas":
        return renderHoras();
      case "empresas":
        return renderEmpresas();
      case "notificaciones":
        return renderNotificaciones();
      case "perfil":
        return renderPerfil();
      case "config":
        return renderConfig();
      case "ayuda":
        return renderAyuda();
      case "acercade":
        return renderAcercaDe();
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // MODALS
  // ═══════════════════════════════════════════════════════════════

  const ModalPropuestasEmpresas = () => (
    <Modal
      visible={propuestasOpen}
      transparent
      animationType="slide"
      onRequestClose={() => {
        setPropuestasOpen(false);
        setSelectedPropuesta(null);
      }}
    >
      <View style={s.modalOverlay}>
        <View style={s.modal}>
          <View
            style={[
              s.row,
              { justifyContent: "space-between", marginBottom: 16 },
            ]}
          >
            <Text style={s.subsectionTitle}>Propuestas de empresas</Text>
            <TouchableOpacity
              onPress={() => {
                setPropuestasOpen(false);
                setSelectedPropuesta(null);
              }}
            >
              <Ionicons name="close" size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {isLoadingPropuestas ? (
              <Text style={[s.textMuted, { paddingVertical: 12 }]}>
                Cargando propuestas...
              </Text>
            ) : propuestas.length === 0 ? (
              <Text style={[s.textMuted, { paddingVertical: 12 }]}>
                No hay propuestas iniciadas por empresas.
              </Text>
            ) : (
              propuestas.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    s.card,
                    {
                      padding: 14,
                      marginBottom: 10,
                      borderColor:
                        selectedPropuesta?.id === p.id ? C.green : C.border,
                    },
                  ]}
                  onPress={() => {
                    setSelectedPropuesta(p);
                    setShowRechazoPropuestaInput(false);
                    setRechazoPropuestaMotivo(
                      (p as any).motivo_rechazo_universidad ?? "",
                    );
                    setRechazoPropuestaError("");
                  }}
                  activeOpacity={0.85}
                >
                  <View style={[s.row, { justifyContent: "space-between" }]}>
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={[s.textSub, { fontWeight: "800" }]}>
                        Grupo:{" "}
                        {p.grupo_id ? String(p.grupo_id).slice(0, 8) : "—"}
                      </Text>
                      <Text
                        style={[s.textMuted, { fontSize: 12, marginTop: 4 }]}
                      >
                        Estado: {p.estado}
                      </Text>
                    </View>
                    <Badge label="Empresa" type="default" />
                  </View>
                </TouchableOpacity>
              ))
            )}

            {selectedPropuesta && (
              <Card style={{ marginTop: 14 }}>
                <Text style={s.subsectionTitle}>Detalle de condiciones</Text>
                <Text style={[s.textMuted, { marginTop: 10 }]}>
                  🕐 Horario: {selectedPropuesta.hora_inicio ?? "—"} a{" "}
                  {selectedPropuesta.hora_fin ?? "—"}
                </Text>
                <Text style={[s.textMuted, { marginTop: 6 }]}>
                  📅 Fechas: {selectedPropuesta.fecha_inicio ?? "—"} a{" "}
                  {selectedPropuesta.fecha_fin ?? "—"}
                </Text>
                <Text style={[s.textMuted, { marginTop: 6 }]}>
                  📍 Maps: {selectedPropuesta.google_maps_url ?? "—"}
                </Text>
                {selectedPropuesta.google_maps_url ? (
                  <BtnOutline
                    label="Abrir ubicación"
                    small
                    style={{ marginTop: 10 }}
                    onPress={() =>
                      Linking.openURL(
                        selectedPropuesta.google_maps_url as string,
                      )
                    }
                  />
                ) : null}
                {(selectedPropuesta as any).motivo_rechazo_universidad ? (
                  <Text style={[s.textMuted, { marginTop: 10 }]}>
                    Motivo de rechazo de la universidad:{" "}
                    {(selectedPropuesta as any).motivo_rechazo_universidad}
                  </Text>
                ) : null}

                <View style={[s.row, { gap: 10, marginTop: 16 }]}>
                  <TouchableOpacity
                    style={[
                      s.btnPrimary,
                      { flex: 1, opacity: isUpdatingPropuesta ? 0.7 : 1 },
                    ]}
                    disabled={isUpdatingPropuesta}
                    onPress={async () => {
                      const ok = await handleActualizarEstadoPropuesta(
                        selectedPropuesta.id,
                        "aprobada",
                      );
                      if (ok) setSelectedPropuesta(null);
                    }}
                  >
                    <Text style={s.btnPrimaryText}>Aceptar propuesta</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      s.btnPrimary,
                      {
                        flex: 1,
                        backgroundColor: C.red,
                        opacity: isUpdatingPropuesta ? 0.7 : 1,
                      },
                    ]}
                    disabled={isUpdatingPropuesta}
                    onPress={() => {
                      setShowRechazoPropuestaInput(true);
                      setRechazoPropuestaError("");
                    }}
                  >
                    <Text style={s.btnPrimaryText}>Rechazar propuesta</Text>
                  </TouchableOpacity>
                </View>
                {showRechazoPropuestaInput && (
                  <View style={{ marginTop: 14 }}>
                    <Text style={s.inputLabel}>Motivo de rechazo</Text>
                    <TextInput
                      style={[
                        s.input,
                        {
                          borderColor: rechazoPropuestaError ? C.red : C.border,
                          marginTop: 6,
                          minHeight: 80,
                          textAlignVertical: "top",
                        },
                      ]}
                      value={rechazoPropuestaMotivo}
                      onChangeText={(value) => {
                        setRechazoPropuestaMotivo(value);
                        setRechazoPropuestaError("");
                      }}
                      placeholder="Explica por qué rechazas la propuesta"
                      placeholderTextColor={C.textMuted}
                      multiline
                    />
                    {rechazoPropuestaError ? (
                      <Text style={[s.errorText, { marginTop: 8 }]}>
                        ⚠️ {rechazoPropuestaError}
                      </Text>
                    ) : null}
                    <View style={[s.row, { gap: 12, marginTop: 12 }]}>
                      <BtnOutline
                        label="Cancelar"
                        style={{ flex: 1 }}
                        onPress={() => {
                          setShowRechazoPropuestaInput(false);
                          setRechazoPropuestaMotivo(
                            (selectedPropuesta as any)
                              ?.motivo_rechazo_universidad ?? "",
                          );
                        }}
                      />
                      <TouchableOpacity
                        style={[s.btnPrimary, { flex: 1 }]}
                        disabled={isUpdatingPropuesta}
                        onPress={async () => {
                          const ok = await handleActualizarEstadoPropuesta(
                            selectedPropuesta.id,
                            "cerrada",
                            rechazoPropuestaMotivo,
                          );
                          if (ok) {
                            setSelectedPropuesta(null);
                            setShowRechazoPropuestaInput(false);
                          }
                        }}
                      >
                        <Text style={s.btnPrimaryText}>Confirmar rechazo</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </Card>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const ModalSolicitarHoras = () => {
    const normalizedEmpresaSearch = empresaSearch.trim().toLowerCase();
    const filteredEmpresas = empresasDb.filter((e) => {
      if (!normalizedEmpresaSearch) return true;
      const haystack =
        `${e.nombre} ${e.industria ?? ""} ${e.descripcion ?? ""}`.toLowerCase();
      return haystack.includes(normalizedEmpresaSearch);
    });

    const grupoBorderColor = solicitarErrors.grupo
      ? C.red
      : selectedGrupoDb
        ? C.green
        : C.border;
    const empresaBorderColor = solicitarErrors.empresa
      ? C.red
      : selectedEmpresaDb
        ? C.green
        : C.border;

    return (
      <Modal
        visible={solicitarHorasOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setSolicitarHorasOpen(false);
          resetSolicitarHorasModal();
        }}
      >
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <View
              style={[
                s.row,
                { justifyContent: "space-between", marginBottom: 16 },
              ]}
            >
              <Text style={s.subsectionTitle}>Solicitar horas</Text>
              <TouchableOpacity
                onPress={() => {
                  setSolicitarHorasOpen(false);
                  resetSolicitarHorasModal();
                }}
              >
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {solicitarStep === "grupo" ? (
                <>
                  <Text style={s.inputLabel}>Selecciona un grupo</Text>
                  {solicitarErrors.grupo ? (
                    <Text style={[s.errorText, { marginTop: 8 }]}>
                      ⚠️ {solicitarErrors.grupo}
                    </Text>
                  ) : null}
                  {solicitarErrors.grupo ? (
                    <Text style={[s.errorText, { marginTop: 8 }]}>
                      ⚠️ {solicitarErrors.grupo}
                    </Text>
                  ) : null}

                  <View style={{ marginTop: 12 }}>
                    {isLoadingGruposDb ? (
                      <Text style={s.textMuted}>Cargando grupos...</Text>
                    ) : gruposDb.length === 0 ? (
                      <Text style={s.textMuted}>
                        No hay grupos creados por esta universidad.
                      </Text>
                    ) : (
                      gruposDb.map((g) => (
                        <TouchableOpacity
                          key={g.id}
                          style={[
                            s.card,
                            {
                              padding: 14,
                              marginBottom: 10,
                              borderColor:
                                selectedGrupoDb?.id === g.id
                                  ? C.green
                                  : C.border,
                            },
                          ]}
                          onPress={() => {
                            setSelectedGrupoDb(g);
                            setSolicitarErrors((prev) => ({
                              ...prev,
                              grupo: "",
                            }));
                          }}
                          activeOpacity={0.85}
                        >
                          <Text style={[s.textSub, { fontWeight: "800" }]}>
                            {g.nombre}
                          </Text>
                          <Text
                            style={[
                              s.textMuted,
                              { fontSize: 12, marginTop: 4 },
                            ]}
                          >
                            {g.carrera}
                          </Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </View>

                  <View style={[s.row, { gap: 12, marginTop: 14 }]}>
                    <BtnOutline
                      label="Descartar"
                      style={{ flex: 1 }}
                      onPress={() => {
                        setSolicitarHorasOpen(false);
                        resetSolicitarHorasModal();
                      }}
                    />
                    <TouchableOpacity
                      style={[
                        s.btnPrimary,
                        {
                          flex: 1,
                          opacity: selectedGrupoDb ? 1 : 0.6,
                        },
                      ]}
                      disabled={!selectedGrupoDb}
                      onPress={() => {
                        setSolicitarStep("empresa");
                        if (empresasDb.length === 0) loadEmpresasDb();
                      }}
                    >
                      <Text style={s.btnPrimaryText}>Enviar propuesta →</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Card style={{ marginBottom: 14 }}>
                    <Text style={s.subsectionTitle}>Grupo seleccionado</Text>
                    <Text style={[s.textMuted, { marginTop: 8 }]}>
                      {selectedGrupoDb?.nombre ?? "—"}
                    </Text>
                    <Text style={[s.textMuted, { marginTop: 4 }]}>
                      {selectedGrupoDb?.carrera ?? ""}
                    </Text>
                  </Card>

                  <Text style={s.inputLabel}>Buscar empresa (tiempo real)</Text>
                  <TextInput
                    style={[
                      s.input,
                      { borderColor: empresaBorderColor, marginTop: 6 },
                    ]}
                    value={empresaSearch}
                    onChangeText={(v) => {
                      setEmpresaSearch(v);
                      setSolicitarErrors((prev) => ({ ...prev, empresa: "" }));
                    }}
                    placeholder="Nombre, categoría o descripción..."
                    placeholderTextColor={C.textMuted}
                  />
                  {solicitarErrors.empresa ? (
                    <Text style={[s.errorText, { marginTop: 8 }]}>
                      ⚠️ {solicitarErrors.empresa}
                    </Text>
                  ) : null}

                  <View style={{ marginTop: 12 }}>
                    {isLoadingEmpresas ? (
                      <Text style={s.textMuted}>Cargando empresas...</Text>
                    ) : filteredEmpresas.length === 0 ? (
                      <Text style={s.textMuted}>
                        No hay empresas para este filtro.
                      </Text>
                    ) : (
                      filteredEmpresas.slice(0, 30).map((e) => (
                        <TouchableOpacity
                          key={e.id}
                          style={[
                            s.card,
                            {
                              padding: 14,
                              marginBottom: 10,
                              borderColor:
                                selectedEmpresaDb?.id === e.id
                                  ? C.green
                                  : C.border,
                            },
                          ]}
                          onPress={() => {
                            setSelectedEmpresaDb(e);
                            setSolicitarErrors((prev) => ({
                              ...prev,
                              empresa: "",
                            }));
                          }}
                          activeOpacity={0.85}
                        >
                          <Text style={[s.textSub, { fontWeight: "800" }]}>
                            {e.nombre}
                          </Text>
                          <Text
                            style={[
                              s.textMuted,
                              { fontSize: 12, marginTop: 4 },
                            ]}
                          >
                            {(e.industria ?? "Sin industria") as string}
                          </Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </View>

                  <View style={[s.row, { gap: 12, marginTop: 14 }]}>
                    <BtnOutline
                      label="← Cambiar grupo"
                      style={{ flex: 1 }}
                      onPress={() => setSolicitarStep("grupo")}
                    />
                    <TouchableOpacity
                      style={[
                        s.btnPrimary,
                        {
                          flex: 1,
                          opacity:
                            selectedGrupoDb &&
                            selectedEmpresaDb &&
                            !isSendingSolicitud
                              ? 1
                              : 0.6,
                        },
                      ]}
                      disabled={
                        !selectedGrupoDb ||
                        !selectedEmpresaDb ||
                        isSendingSolicitud
                      }
                      onPress={handleEnviarSolicitudHoras}
                    >
                      <Text style={s.btnPrimaryText}>
                        {isSendingSolicitud
                          ? "Enviando..."
                          : "Enviar propuesta"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  const ModalRechazar = () => (
    <Modal
      visible={modalRechazar}
      transparent
      animationType="fade"
      onRequestClose={() => setModalRechazar(false)}
    >
      <View style={s.modalOverlay}>
        <View style={[s.modal, { maxWidth: 480 }]}>
          <View
            style={[
              s.row,
              { justifyContent: "space-between", marginBottom: 16 },
            ]}
          >
            <Text style={s.subsectionTitle}>Rechazar solicitud</Text>
            <TouchableOpacity onPress={() => setModalRechazar(false)}>
              <Ionicons name="close" size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>
          <Text style={s.inputLabel}>Motivo del rechazo</Text>
          <TextInput
            style={[
              s.input,
              { height: 100, textAlignVertical: "top", marginTop: 8 },
            ]}
            value={rejectNote}
            onChangeText={setRejectNote}
            multiline
            placeholder="Describe el motivo del rechazo para que el estudiante pueda entender la decisión..."
            placeholderTextColor={C.textMuted}
          />
          <View style={[s.row, { gap: 12, marginTop: 16 }]}>
            <BtnOutline
              label="Cancelar"
              style={{ flex: 1 }}
              onPress={() => setModalRechazar(false)}
            />
            <TouchableOpacity
              style={[s.btnPrimary, { flex: 1, backgroundColor: C.red }]}
              onPress={() => {
                setModalRechazar(false);
                Alert.alert("Rechazado", "La solicitud fue rechazada.");
              }}
            >
              <Text style={s.btnPrimaryText}>Confirmar rechazo</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const ModalEditPerfil = () => (
    <Modal
      visible={modalEditPerfil}
      transparent
      animationType="slide"
      onRequestClose={() => setModalEditPerfil(false)}
    >
      <View style={s.modalOverlay}>
        <View style={s.modal}>
          <View
            style={[
              s.row,
              { justifyContent: "space-between", marginBottom: 16 },
            ]}
          >
            <Text style={s.subsectionTitle}>Editar perfil institucional</Text>
            <TouchableOpacity onPress={() => setModalEditPerfil(false)}>
              <Ionicons name="close" size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {[
              {
                label: "Banner (URL de imagen)",
                val: editBanner,
                set: setEditBanner,
                placeholder: "https://...",
              },
              {
                label: "Logo institucional (URL)",
                val: editLogo,
                set: setEditLogo,
                placeholder: "https://...",
              },
              {
                label: "Instagram",
                val: editInstagram,
                set: setEditInstagram,
                placeholder: "https://instagram.com/...",
              },
              {
                label: "LinkedIn",
                val: editLinkedin,
                set: setEditLinkedin,
                placeholder: "https://linkedin.com/...",
              },
            ].map((f) => (
              <View key={f.label} style={{ marginBottom: 16 }}>
                <Text style={s.inputLabel}>{f.label}</Text>
                <TextInput
                  style={[s.input, { marginTop: 6 }]}
                  value={f.val}
                  onChangeText={f.set}
                  placeholder={f.placeholder}
                  placeholderTextColor={C.textMuted}
                />
              </View>
            ))}
            <Text style={s.inputLabel}>Descripción institucional</Text>
            <TextInput
              style={[
                s.input,
                { height: 80, textAlignVertical: "top", marginTop: 6 },
              ]}
              value={editDesc}
              onChangeText={setEditDesc}
              multiline
              placeholder="Describe tu institución..."
              placeholderTextColor={C.textMuted}
            />
            <BtnPrimary
              label="Guardar cambios"
              style={{ marginTop: 20 }}
              onPress={async () => {
                try {
                  const payload: Record<string, any> = {
                    descripcion: editDesc || null,
                    instagram: editInstagram || null,
                    enc_linkedin: editLinkedin || null,
                    banner_url: editBanner || null,
                    logo_url: editLogo || null,
                  };
                  const updated = await updateUniversidad(
                    universidadId,
                    payload,
                  );
                  setUniversidad(updated ?? universidad);
                  setModalEditPerfil(false);
                  Alert.alert("Guardado", "Perfil actualizado.");
                } catch (err: any) {
                  console.error("update error", err);
                  Alert.alert(
                    "Error",
                    err?.message || "No se pudo actualizar.",
                  );
                }
              }}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  // ═══════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <View style={s.root}>
      {/* Topbar */}
      <View style={s.topbar}>
        <View style={s.topbarLeft}>
          <Text style={{ fontSize: 22, marginRight: 8 }}>🏛️</Text>
          <Text style={s.topbarName}>{nombreUniv}</Text>
          <Badge label="Verificada" type="verificada" />
        </View>
        <TouchableOpacity
          style={{ padding: 8, borderRadius: 12 }}
          onPress={toggleLanguage}
          accessibilityLabel="Cambiar idioma"
        >
          <Ionicons name="planet-outline" size={22} color={C.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={{ padding: 8, borderRadius: 12 }}
          onPress={() => setDarkMode((prev) => !prev)}
          accessibilityLabel="Cambiar tema"
        >
          <Ionicons
            name={darkMode ? "sunny-outline" : "moon-outline"}
            size={22}
            color={C.text}
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setSection("notificaciones")}
          style={s.logoutBtn}
          accessibilityLabel="Notificaciones"
        >
          <Text style={{ fontSize: 22 }}>🔔</Text>
          {!unreadRead && (
            <View style={s.navBadge}>
              <Text style={s.navBadgeText}>5</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
      {languageMenuOpen && (
        <TouchableOpacity
          style={s.languageMenuBackdrop}
          activeOpacity={1}
          onPress={() => setLanguageMenuOpen(false)}
        >
          <View style={s.languageMenu}>
            <TouchableOpacity
              style={s.languageMenuItem}
              onPress={handleChangeLanguage}
              activeOpacity={0.8}
            >
              <Text style={s.languageMenuText}>{languageOptionLabel}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}

      {/* Content */}
      <View style={s.content}>{renderContent()}</View>

      {/* Bottom nav (mobile) */}
      <View style={s.bottomNav}>
        {navItems.map((item) => {
          const isActive =
            section === item.key ||
            (item.key === "gestion" &&
              ["grupos", "horas", "empresas"].includes(section)) ||
            (item.key === "perfil" &&
              ["config", "ayuda", "acercade"].includes(section));
          return (
            <TouchableOpacity
              key={item.key}
              style={[s.bottomNavItem, isActive && s.bottomNavItemActive]}
              onPress={() => setSection(item.key)}
              activeOpacity={0.75}
            >
              <Ionicons
                name={item.icon}
                size={22}
                color={isActive ? C.accent70 : C.textMuted}
              />
              <TranslatedText
                style={[s.bottomNavLabel, isActive && s.bottomNavLabelActive]}
              >
                {item.label}
              </TranslatedText>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Modals */}
      {renderProfileViewerModal()}
      <ModalPropuestasEmpresas />
      <ModalSolicitarHoras />
      <GroupDetailModal
        visible={groupModalMode !== null}
        mode={groupModalMode ?? "view"}
        group={selectedGroup}
        onClose={() => {
          setGroupModalMode(null);
          setSelectedGroup(null);
        }}
        onSave={handleUpdateGroup}
        saving={groupEditSaving}
      />
      <GroupCreationModal
        visible={groupCreationOpen}
        universidadId={universidadId}
        onClose={() => setGroupCreationOpen(false)}
        onCreated={handleGroupCreated}
      />
      <ModalRechazar />
      <ModalEditPerfil />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
function createStyles(C: typeof darkTheme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },

    // ── Topbar
    topbar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 52,
      paddingBottom: 12,
      backgroundColor: "rgba(13,11,30,0.96)",
      borderBottomWidth: 1,
      borderBottomColor: "rgba(139,92,246,0.12)",
    },
    topbarLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flex: 1,
      flexWrap: "wrap",
    },
    topbarAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: C.accent20,
      borderWidth: 1,
      borderColor: "rgba(139,92,246,0.3)",
      alignItems: "center",
      justifyContent: "center",
    },
    topbarName: {
      color: "rgba(255,255,255,0.85)",
      fontSize: 14,
      fontWeight: "600",
    },
    languageMenuBackdrop: {
      position: "absolute",
      top: 76,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 20,
    },
    languageMenu: {
      position: "absolute",
      top: 0,
      right: 16,
      backgroundColor: C.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.border,
      paddingVertical: 6,
      minWidth: 180,
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 18,
      elevation: 10,
    },
    languageMenuItem: {
      paddingVertical: 10,
      paddingHorizontal: 16,
    },
    languageMenuText: {
      color: C.text,
      fontSize: 14,
      fontWeight: "600",
    },
    logoutBtn: {
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.1)",
      borderRadius: 10,
      padding: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },

    // ── Horizontal nav strip (sidebar equivalent)
    sidebarScroll: {
      backgroundColor: "rgba(13,11,30,0.96)",
      borderBottomWidth: 1,
      borderBottomColor: "rgba(139,92,246,0.1)",
      maxHeight: 48,
    },
    sidebarScrollContent: { paddingHorizontal: 8, alignItems: "center" },
    sideNavItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderBottomWidth: 3,
      borderBottomColor: "transparent",
    },
    sideNavItemActive: { borderBottomColor: C.accent },
    sideNavLabel: {
      color: "rgba(255,255,255,0.55)",
      fontSize: 13,
      fontWeight: "500",
    },
    sideNavLabelActive: { color: C.accent70, fontWeight: "600" },
    navBadge: {
      backgroundColor: "rgba(139,92,246,0.85)",
      borderRadius: 20,
      paddingHorizontal: 7,
      paddingVertical: 2,
      marginLeft: 4,
      minWidth: 18,
      alignItems: "center",
    },
    navBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },

    // ── Main content
    content: {
      flex: 1,
      paddingHorizontal: 16,
      paddingTop: 24,
      paddingBottom: 16,
    },

    // ── Bottom nav (mobile)
    bottomNav: {
      flexDirection: "row",
      backgroundColor: "rgba(13,11,30,0.96)",
      borderTopWidth: 1,
      borderTopColor: "rgba(139,92,246,0.15)",
      paddingBottom: 20,
      paddingTop: 10,
      paddingHorizontal: 8,
      justifyContent: "space-around",
    },
    bottomNavItem: {
      flex: 1,
      alignItems: "center",
      gap: 3,
      paddingVertical: 4,
      borderRadius: 10,
      minWidth: 52,
    },
    bottomNavItemActive: { backgroundColor: C.accent20 },
    bottomNavLabel: {
      color: "rgba(255,255,255,0.4)",
      fontSize: 9,
      fontWeight: "500",
    },
    bottomNavLabelActive: { color: C.accent70 },

    // ── Section header — row with wrap so date chip wraps below on tiny screens
    sectionHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 12,
      marginBottom: 24,
    },
    kicker: {
      color: C.accent70,
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 1.5,
      marginBottom: 4,
    },
    pageTitle: {
      color: C.text,
      fontSize: 26,
      fontWeight: "800",
      lineHeight: 31,
    },
    dateChip: {
      paddingHorizontal: 14,
      paddingVertical: 5,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: "rgba(139,92,246,0.25)",
      backgroundColor: "rgba(139,92,246,0.1)",
      alignSelf: "flex-start",
      marginTop: 6,
    },
    dateChipText: { color: "rgba(167,139,250,0.9)", fontSize: 12 },
    subsectionTitle: { color: C.text, fontSize: 16, fontWeight: "700" },
    textSub: { color: "rgba(255,255,255,0.8)" },
    textMuted: { color: "rgba(255,255,255,0.45)" },

    // ── Card
    card: {
      backgroundColor: "rgba(13,11,30,0.85)",
      borderRadius: 14,
      borderWidth: 1,
      borderColor: "rgba(139,92,246,0.15)",
      padding: 18,
      flexDirection: "column",
    },

    // ── Metrics (vertical stack, each card full-width)
    metricsGrid: { gap: 12, marginBottom: 28 },
    metricCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 16,
      padding: 20,
    },
    metricIconBox: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: "rgba(139,92,246,0.1)",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    metricIcon: { fontSize: 24 },
    metricNum: {
      color: C.text,
      fontSize: 26,
      fontWeight: "800",
      lineHeight: 28,
    },
    metricLabel: {
      color: "rgba(255,255,255,0.5)",
      fontSize: 12,
      marginTop: 4,
      lineHeight: 16,
    },
    metricTrend: { fontSize: 11, fontWeight: "600", marginTop: 6 },

    // ── Empresa card
    empresaHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      marginBottom: 12,
    },
    empresaLogo: {
      width: 44,
      height: 44,
      borderRadius: 10,
      backgroundColor: C.accent20,
      borderWidth: 1,
      borderColor: "rgba(139,92,246,0.25)",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    empresaName: { color: C.text, fontSize: 14, fontWeight: "700" },
    empresaSector: {
      color: "rgba(255,255,255,0.45)",
      fontSize: 11,
      marginTop: 2,
    },
    empresaRating: {
      color: "rgba(255,255,255,0.65)",
      fontSize: 12,
      marginBottom: 8,
    },
    empresaCupos: {
      color: "rgba(255,255,255,0.55)",
      fontSize: 12,
      marginBottom: 12,
    },

    // ── Badge
    badge: {
      borderRadius: 20,
      borderWidth: 1,
      paddingHorizontal: 9,
      paddingVertical: 3,
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
    },
    badgeText: { fontSize: 10, fontWeight: "700" },

    // ── Tag
    tag: {
      backgroundColor: C.accent20,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: "rgba(139,92,246,0.3)",
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    tagText: { color: C.accent70, fontSize: 11 },

    // ── Filter chip
    chip: {
      paddingHorizontal: 16,
      paddingVertical: 6,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.1)",
      backgroundColor: "rgba(255,255,255,0.04)",
    },
    chipActive: {
      backgroundColor: "rgba(139,92,246,0.18)",
      borderColor: "rgba(139,92,246,0.5)",
    },
    chipText: {
      color: "rgba(255,255,255,0.55)",
      fontSize: 12,
      fontWeight: "500",
    },
    chipTextActive: { color: C.accent70, fontWeight: "700" },

    // ── Buttons
    btnPrimary: {
      backgroundColor: C.accent,
      borderRadius: 10,
      paddingVertical: 13,
      paddingHorizontal: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
    btnOutline: {
      borderWidth: 1,
      borderColor: "rgba(139,92,246,0.25)",
      borderRadius: 10,
      paddingVertical: 11,
      paddingHorizontal: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    btnOutlineText: { color: C.accent70, fontWeight: "600", fontSize: 13 },
    btnSm: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8 },
    btnSmText: { fontSize: 12 },
    btnDisabled: { opacity: 0.4 },
    btnValidate: {
      backgroundColor: "rgba(52,211,153,0.1)",
      borderWidth: 1,
      borderColor: "rgba(52,211,153,0.35)",
      borderRadius: 10,
      paddingVertical: 7,
      paddingHorizontal: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    btnValidateText: {
      color: "rgba(52,211,153,1)",
      fontSize: 12,
      fontWeight: "600",
    },
    btnReject: {
      backgroundColor: "rgba(239,68,68,0.08)",
      borderWidth: 1,
      borderColor: "rgba(239,68,68,0.3)",
      borderRadius: 10,
      paddingVertical: 7,
      paddingHorizontal: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    btnRejectText: {
      color: "rgba(252,165,165,1)",
      fontSize: 12,
      fontWeight: "600",
    },

    // ── Inputs
    inputLabel: {
      color: "rgba(255,255,255,0.6)",
      fontSize: 12,
      fontWeight: "600",
      marginBottom: 8,
    },
    input: {
      backgroundColor: "rgba(255,255,255,0.04)",
      borderWidth: 1,
      borderColor: "rgba(139,92,246,0.2)",
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      color: "rgba(255,255,255,0.85)",
      fontSize: 13,
    },
    errorText: {
      color: C.red,
      fontSize: 12,
      fontWeight: "600",
    },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: "rgba(255,255,255,0.04)",
      borderWidth: 1,
      borderColor: "rgba(139,92,246,0.18)",
      borderRadius: 40,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    searchInput: { flex: 1, color: "rgba(255,255,255,0.85)", fontSize: 13 },

    // ── Tab strip
    tab: {
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderBottomWidth: 2,
      borderBottomColor: "transparent",
    },
    tabActive: { borderBottomColor: C.accent },
    tabText: {
      color: "rgba(255,255,255,0.5)",
      fontSize: 13,
      fontWeight: "500",
    },
    tabTextActive: { color: C.accent70, fontWeight: "700" },

    // ── List items with bottom-border separators
    sideCardTitle: {
      color: C.text,
      fontSize: 13,
      fontWeight: "700",
      marginBottom: 14,
    },
    pendingItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(139,92,246,0.08)",
    },
    pendingGroup: {
      color: "rgba(255,255,255,0.8)",
      fontSize: 12,
      fontWeight: "600",
    },
    activityItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(139,92,246,0.08)",
    },
    activityAvatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: C.accent20,
      borderWidth: 1,
      borderColor: "rgba(139,92,246,0.25)",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    activityName: {
      color: "rgba(255,255,255,0.8)",
      fontSize: 12,
      fontWeight: "600",
    },
    dateItem: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(139,92,246,0.08)",
    },
    feedItem: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingVertical: 10,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(139,92,246,0.08)",
    },
    feedIconBox: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: "rgba(139,92,246,0.08)",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    feedIcon: { fontSize: 16 },

    // ── Progress bar
    progressWrap: {
      height: 6,
      backgroundColor: "rgba(255,255,255,0.08)",
      borderRadius: 6,
      marginTop: 8,
      overflow: "hidden",
    },
    progressBar: { height: 6, backgroundColor: C.accent70, borderRadius: 6 },

    // ── Certified seal
    certSeal: {
      alignSelf: "flex-end",
      backgroundColor: "rgba(52,211,153,0.08)",
      borderWidth: 1,
      borderColor: "rgba(52,211,153,0.25)",
      borderRadius: 4,
      paddingHorizontal: 7,
      paddingVertical: 3,
      marginBottom: 8,
    },
    certSealText: {
      color: "rgba(52,211,153,1)",
      fontSize: 8,
      fontWeight: "800",
      letterSpacing: 1,
      textTransform: "uppercase",
    },

    // ── Notifications
    notifUnread: {
      flexDirection: "row",
      alignItems: "flex-start",
      borderLeftWidth: 3,
      borderLeftColor: C.accent,
    },
    notifRead: { opacity: 0.6, flexDirection: "row", alignItems: "flex-start" },
    notifDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: C.accent,
      marginRight: 8,
      marginTop: 4,
      flexShrink: 0,
    },

    // ── Profile banner (gradient-like dark purple)
    profileBanner: {
      alignItems: "center",
      paddingVertical: 32,
      paddingHorizontal: 20,
      backgroundColor: "rgba(30,20,60,0.95)",
      borderRadius: 20,
      borderWidth: 1,
      borderColor: "rgba(139,92,246,0.2)",
      marginBottom: 20,
      overflow: "hidden",
    },
    profileBannerAvatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: C.accent20,
      borderWidth: 2,
      borderColor: C.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    // Nuevo: contenedor tipo 'perfil' con banner y logo superpuesto
    profileHeaderContainer: {
      backgroundColor: "rgba(30,20,60,0.98)",
      borderRadius: 14,
      overflow: "hidden",
      marginBottom: 20,
    },
    // Banner que ocupa la mitad superior del contenedor
    bannerImage: {
      width: "100%",
      height: 140,
      backgroundColor: "rgba(109,40,217,0.18)",
    },
    // Logo absolute, se superpone en la línea divisoria (mitad dentro/mitad fuera)
    logoImage: {
      width: 96,
      height: 96,
      borderRadius: 20,
      borderWidth: 3,
      borderColor: "rgba(255,255,255,0.9)",
      backgroundColor: C.accent20,
      position: "absolute",
      left: 16,
      top: 100,
      alignItems: "center",
      justifyContent: "center",
    },
    profileStats: {
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: "rgba(139,92,246,0.12)",
      flexWrap: "wrap",
      justifyContent: "center",
      width: "100%",
    },

    // ── Grupos
    grupoName: { color: C.text, fontSize: 14, fontWeight: "700" },

    // ── Grid helpers (row + wrap → 2-col on mobile)
    grid2: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
    row: { flexDirection: "row", alignItems: "center" },

    // ── Pub type card (2-col via flexWrap)
    pubTypeCard: {
      flex: 1,
      minWidth: "45%",
      backgroundColor: "rgba(13,11,30,0.85)",
      borderRadius: 14,
      borderWidth: 1,
      borderColor: "rgba(139,92,246,0.15)",
      padding: 24,
      alignItems: "center",
    },
    pubTypeCardActive: {
      borderColor: "rgba(139,92,246,0.6)",
      backgroundColor: "rgba(139,92,246,0.12)",
    },

    // ── Project thumb
    projectThumb: {
      height: 100,
      borderRadius: 10,
      backgroundColor: "rgba(109,40,217,0.25)",
    },

    // ── Aliada card (2-col via flexWrap)
    aliadaCard: {
      flex: 1,
      minWidth: "45%",
      alignItems: "center",
      paddingVertical: 24,
    },

    // ── Toggle (40 px per CSS spec)
    toggle: {
      width: 40,
      height: 22,
      borderRadius: 22,
      backgroundColor: "rgba(255,255,255,0.1)",
      justifyContent: "center",
      paddingHorizontal: 3,
    },
    toggleOn: { backgroundColor: "rgba(139,92,246,0.5)" },
    toggleThumb: {
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: "rgba(255,255,255,0.5)",
      alignSelf: "flex-start",
    },
    toggleThumbOn: { alignSelf: "flex-end", backgroundColor: C.accent70 },

    // ── Modal (bottom sheet)
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(7,5,15,0.75)",
      justifyContent: "flex-end",
    },
    modal: {
      backgroundColor: C.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 1,
      borderColor: "rgba(139,92,246,0.2)",
      padding: 28,
      maxHeight: "90%",
    },

    // ── Stepper
    stepCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.15)",
      backgroundColor: "rgba(255,255,255,0.06)",
    },
    stepActive: {
      borderColor: "rgba(139,92,246,0.6)",
      backgroundColor: "rgba(139,92,246,0.25)",
    },
    stepDone: {
      borderColor: "rgba(52,211,153,0.5)",
      backgroundColor: "rgba(52,211,153,0.15)",
    },
    stepIdle: {
      borderColor: "rgba(255,255,255,0.15)",
      backgroundColor: "rgba(255,255,255,0.06)",
    },
    stepNum: {
      color: "rgba(255,255,255,0.4)",
      fontSize: 12,
      fontWeight: "700",
    },
    stepLine: {
      flex: 1,
      height: 1,
      backgroundColor: "rgba(139,92,246,0.2)",
      alignSelf: "center",
      marginHorizontal: 10,
    },
  });
}
