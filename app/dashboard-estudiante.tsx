/**
 * dashboard-alumno.tsx
 * Portal estudiantil React Native (Expo).
 *
 * Bottom nav: Home · Explorar · Cursos · Mi Perfil
 * Sub-vistas: Pagos (desde Mi Perfil, con flecha de regreso)
 *             Horario (tab dentro de Cursos)
 * Notificaciones: únicamente al pulsar el ícono de campana (topbar)
 * Sidebar: Inscripción · Resultados · Retiro (y atajos al nav principal)
 */

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import BuscadorExplorador from "../components/BuscadorExplorador";
import CambiarPasswordModal from "../components/CambiarPasswordModal";
import TranslatedText from "../components/TranslatedText";
import { supabase } from "../lib/supabase";
import {
  pickAndUploadImage,
  updateProfilePhoto,
  updateUserProfile,
} from "../services/storageService";
import ProfileViewerModal from "../src/components/ProfileViewerModal";
import UniversalHeader from "../src/components/UniversalHeader";
import { useThemeContext } from "../src/context/ThemeContext";
import { useTranslationContext } from "../src/context/TranslationContext";
import handleLogout from "../src/services/authService";

const Text = TranslatedText;

// ─── Types ───────────────────────────────────────────────────────────────────────

type Page =
  | "home"
  | "explorar"
  | "cursos"
  | "perfil"
  | "pagos"
  | "editarperfil"
  | "resultados"
  | "configuracion";

type CursosTab = "lista" | "horario";
type ExplorarTab = "empresas" | "proyectos";
type ModalType = "pago" | "curso" | "logout" | "emergencia" | "acerca" | "ayuda" | null;

type Payment = {
  concepto: string;
  estado: string;
  monto: number;
  vence: string;
};
type PagoForm = {
  concepto: string;
  monto: string;
  estado: string;
  vence: string;
};
type InscripcionForm = {
  carrera: string;
  semestre: string;
  correo: string;
  telefono: string;
};
type Toast = { id: number; title: string; desc: string };
type SubPage = "ayuda" | "acercade" | null;

// ─── Static data ────────────────────────────────────────────────────────────────

const STUDENT_COLORS = [
  "#8b5cf6",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
];


// ─── Labels & nav config ──────────────────────────────────────────────────────────

const PAGE_LABELS: Record<Page, string> = {
  home: "home",
  explorar: "explorar",
  cursos: "cursos",
  perfil: "perfil",
  pagos: "pagos",
  editarperfil: "editarperfil",
  resultados: "resultados",
  configuracion: "configuracion",
};

// 4 ítems del menú inferior
const BOTTOM_NAV: {
  key: Page;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "home", label: "Home", icon: "home-outline" },
  { key: "explorar", label: "Explorar", icon: "compass-outline" },
  { key: "cursos", label: "Cursos", icon: "book-outline" },
  { key: "perfil", label: "Mi Perfil", icon: "person-outline" },
];

// Sidebar: nav principal + páginas extra
const SIDEBAR_ITEMS: {
  key: Page;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "home", label: "Home", icon: "home-outline" },
  { key: "explorar", label: "Explorar", icon: "compass-outline" },
  { key: "cursos", label: "Cursos", icon: "book-outline" },
  { key: "perfil", label: "Mi Perfil", icon: "person-outline" },
  { key: "editarperfil", label: "Editar Mi Perfil", icon: "create-outline" },
  { key: "resultados", label: "Resultados", icon: "newspaper-outline" },
  { key: "configuracion", label: "Configuración", icon: "settings-outline" },
];

// ─── Design tokens ───────────────────────────────────────────────────────────────

const darkTheme = {
  bg: "#07050f",
  surface: "#0d0b1e",
  card: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.08)",
  purple: "#8b5cf6",
  purpleDark: "#7c3aed",
  purpleDim: "rgba(139,92,246,0.12)",
  purpleBorder: "rgba(139,92,246,0.30)",
  text: "#f4f1ff",
  muted: "rgba(244,241,255,0.58)",
  danger: "#ef4444",
  dangerBg: "rgba(239,68,68,0.12)",
  dangerBorder: "rgba(239,68,68,0.35)",
  green: "rgba(52,211,153,1)",
  greenBg: "rgba(52,211,153,0.08)",
  greenBorder: "rgba(52,211,153,0.25)",
  yellow: "#f59e0b",
};

const lightTheme = {
  bg: "#f8fafc",
  surface: "#ffffff",
  card: "#f8fafc",
  border: "rgba(139,92,246,0.18)",
  purple: "#7c3aed",
  purpleDark: "#6d28d9",
  purpleDim: "rgba(139,92,246,0.12)",
  purpleBorder: "rgba(139,92,246,0.30)",
  text: "#111827",
  muted: "rgba(17,24,39,0.55)",
  danger: "#dc2626",
  dangerBg: "rgba(248,113,113,0.12)",
  dangerBorder: "rgba(248,113,113,0.25)",
  green: "#15803d",
  greenBg: "rgba(52,211,153,0.12)",
  greenBorder: "rgba(52,211,153,0.25)",
  yellow: "#b45309",
};

let C = darkTheme;
let s = createStyles(C);

// ─── Reusable primitives ─────────────────────────────────────────────────────────

function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  return <View style={[s.card, style]}>{children}</View>;
}

function Divider() {
  return <View style={s.divider} />;
}

function TableHeader({ cols }: { cols: string[] }) {
  return (
    <View style={s.tableRow}>
      {cols.map((col) => (
        <Text key={col} style={[s.tableCell, s.tableHead]}>
          {col}
        </Text>
      ))}
    </View>
  );
}

function TableRow({ cells }: { cells: string[] }) {
  return (
    <View style={[s.tableRow, s.tableBodyRow]}>
      {cells.map((cell, i) => (
        <Text key={i} style={s.tableCell}>
          {cell}
        </Text>
      ))}
    </View>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────────

export default function DashboardAlumno() {
  // ── Navigation
  const [activePage, setActivePage] = useState<Page>("home");
  const [prevPage, setPrevPage] = useState<Page>("perfil");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [subPage, setSubPage] = useState<SubPage>(null);

  // ── Cursos tab
  const [cursosTab, setCursosTab] = useState<CursosTab>("lista");

  // ── Explorar tab
  const [explorarTab, setExplorarTab] = useState<ExplorarTab>("empresas");

  // ── Notificaciones
  const [notifVisible, setNotifVisible] = useState(false);
  const [openAccordions, setOpenAccordions] = useState<Set<number>>(new Set());
  const router = useRouter();
  const { isDark } = useThemeContext();
  C = isDark ? darkTheme : lightTheme;
  s = createStyles(C);

  // ── Modals
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [showCambiarPass, setShowCambiarPass] = useState(false);
  const [ayudaMsg, setAyudaMsg] = useState("");
  const [sendingAyuda, setSendingAyuda] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState("");

  // ── Search
  const [searchQuery, setSearchQuery] = useState("");
  const [profileViewerVisible, setProfileViewerVisible] = useState(false);
  const [profileUserId, setProfileUserId] = useState("");
  const [profileUserType, setProfileUserType] = useState<
    "talento" | "empresa" | "universidad"
  >("empresa");

  const openProfileViewer = (
    userId: string,
    userType: "talento" | "empresa" | "universidad",
  ) => {
    setProfileUserId(userId);
    setProfileUserType(userType);
    setProfileViewerVisible(true);
  };

  // ── Companies for Explorar (declared before filteredExploreCompanies useMemo)
  const [companies, setCompanies] = useState<
    { id: string; nombre: string; sector: string | null; logo: string | null }[]
  >([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);

  const filteredExploreCompanies = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return companies.filter((empresa) => {
      const haystack =
        `${empresa.nombre} ${empresa.sector ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [searchQuery, companies]);


  const onLogout = async () => {
    try {
      await handleLogout(router);
    } catch {
      // ignore fallback errors
    }
  };

  // ── Toast
  const [toasts, setToasts] = useState<Toast[]>([]);

  // ── Payments
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [trabajos, setTrabajos] = useState<any[]>([]);
  const [loadingTrabajos, setLoadingTrabajos] = useState(false);
  const [pagoForm, setPagoForm] = useState<PagoForm>({
    concepto: "",
    monto: "",
    estado: "",
    vence: "",
  });
  const [inscripcionForm, setInscripcionForm] = useState<InscripcionForm>({
    carrera: "",
    semestre: "",
    correo: "",
    telefono: "",
  });

  // ── Alumno extended profile state
  const [alumnoEmail, setAlumnoEmail] = useState("");
  const [alumnoTel, setAlumnoTel] = useState("");
  const [alumnoCarrera, setAlumnoCarrera] = useState("");
  const [alumnoSemestre, setAlumnoSemestre] = useState("");

  // ── Courses and schedule
  const [courses, setCourses] = useState<
    { id: string; nombre: string; modulo: string | null; avance: string | null }[]
  >([]);
  const [horario, setHorario] = useState<
    { dia: string; hora: string; materia: string; aula: string }[]
  >([]);
  const [grupoCompaneros, setGrupoCompaneros] = useState<string[]>([]);

  // ── University announcements
  const [avisos, setAvisos] = useState<
    { titulo: string; fecha: string; contenido: string }[]
  >([]);

  // ── Config
  const [cfgNombre, setCfgNombre] = useState("");
  const [cfgEmail, setCfgEmail] = useState("");
  const [cfgTel, setCfgTel] = useState("");
  const [cfgNotif1, setCfgNotif1] = useState(true);
  const [cfgNotif2, setCfgNotif2] = useState(true);
  const [cfgNotif3, setCfgNotif3] = useState(false);
  const [cfgNotif4, setCfgNotif4] = useState(true);
  const [cfgPwdActual, setCfgPwdActual] = useState("");
  const [cfgPwdNew, setCfgPwdNew] = useState("");
  const [cfgPwdConfirm, setCfgPwdConfirm] = useState("");

  // ── Editar perfil
  const [editNombre, setEditNombre] = useState("");
  const [editCorreo, setEditCorreo] = useState("");
  const [editTel, setEditTel] = useState("");
  const [editCarrera] = useState("Ing. en Sistemas");
  const [editSemestre] = useState("5.º semestre");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [alumnoNombre, setAlumnoNombre] = useState("Estudiante");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUserId(data.user.id);
        supabase
          .from("alumnos")
          .select(
            "foto_perfil, nombre_completo, email, telefono, carrera, semestre",
          )
          .eq("id", data.user.id)
          .single()
          .then(({ data: p }) => {
            if (!p) return;
            if (p.foto_perfil) setProfilePhotoUrl(p.foto_perfil);
            if (p.nombre_completo) {
              setAlumnoNombre(p.nombre_completo);
              setCfgNombre(p.nombre_completo);
              setEditNombre(p.nombre_completo);
            }
            if (p.email) {
              setAlumnoEmail(p.email);
              setCfgEmail(p.email);
              setEditCorreo(p.email);
            }
            if (p.telefono) {
              setAlumnoTel(p.telefono);
              setCfgTel(p.telefono);
              setEditTel(p.telefono);
            }
            if (p.carrera) setAlumnoCarrera(p.carrera);
            if (p.semestre) setAlumnoSemestre(p.semestre);
          });
      }
    });
  }, []);

  // Fetch companies for Explorar
  useEffect(() => {
    (async () => {
      setLoadingCompanies(true);
      const { data } = await supabase
        .from("empresas")
        .select("id, nombre, sector, logo")
        .order("nombre");
      setCompanies(data ?? []);
      setLoadingCompanies(false);
    })();
  }, []);

  // Fetch per-student data once userId is known
  useEffect(() => {
    if (!userId) return;
    (async () => {
      // Payments
      setLoadingPayments(true);
      const { data: pagos } = await supabase
        .from("pagos")
        .select("id, concepto, estado, monto, fecha_vencimiento")
        .eq("alumno_id", userId)
        .order("created_at", { ascending: false });
      if (pagos) {
        setPayments(
          pagos.map((p: any) => ({
            concepto: p.concepto,
            estado: p.estado,
            monto: p.monto ?? 0,
            vence: p.fecha_vencimiento ?? "—",
          })),
        );
      }
      setLoadingPayments(false);

      // Courses / inscripciones
      const { data: inscrip } = await supabase
        .from("inscripciones")
        .select("id, grupo, ciclo, avance")
        .eq("alumno_id", userId);
      if (inscrip) {
        setCourses(
          inscrip.map((c: any) => ({
            id: c.id,
            nombre: c.grupo ?? "Grupo",
            modulo: c.ciclo ?? null,
            avance: c.avance ? `${c.avance}%` : null,
          })),
        );
      }

      // Horario — query from horarios table linked to alumno's grupo
      const { data: hor } = await supabase
        .from("horarios")
        .select("dia, hora, materia, aula")
        .eq("alumno_id", userId);
      if (hor) setHorario(hor);

      // Avisos de universidad
      const { data: avs } = await supabase
        .from("avisos")
        .select("titulo, fecha, contenido")
        .order("created_at", { ascending: false })
        .limit(10);
      if (avs) setAvisos(avs);

      // Trabajos (contrataciones)
      setLoadingTrabajos(true);
      const { data: trabs } = await supabase
        .from("pagos_trabajos")
        .select("*, vacantes(titulo, area), empresas(nombre, foto_logo)")
        .eq("trabajador_id", userId)
        .order("created_at", { ascending: false });
      setTrabajos(trabs ?? []);
      setLoadingTrabajos(false);
    })();
  }, [userId]);

  // ── Horas laborales
  const [horasStarted, setHorasStarted] = useState(false);
  const [horasFinalizadas, setHorasFinalizadas] = useState(false);
  const [emergenciaComment, setEmergenciaComment] = useState("");

  // ── Computed
  const totalPendiente = payments
    .filter((p) => !p.estado.toLowerCase().includes("pag"))
    .reduce((acc, p) => acc + p.monto, 0);
  const totalPagado = payments
    .filter((p) => p.estado.toLowerCase().includes("pag"))
    .reduce((acc, p) => acc + p.monto, 0);
  const filteredCourses = useMemo(
    () =>
      searchQuery.trim()
        ? courses.filter((c) =>
            c.nombre.toLowerCase().includes(searchQuery.trim().toLowerCase()),
          )
        : courses,
    [searchQuery, courses],
  );
  const money = (n: number) => `$ ${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;

  // ── Helpers
  const showToast = (title: string, desc: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, title, desc }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      4200,
    );
  };

  const toggleAccordion = (idx: number) => {
    setOpenAccordions((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const navigate = (page: Page) => {
    if (page !== activePage) setPrevPage(activePage);
    setActivePage(page);
    setSidebarOpen(false);
    setSubPage(null);
    setSearchQuery("");
  };

  const goToPagos = () => {
    setPrevPage("perfil");
    setActivePage("pagos");
  };

  const goBack = () => {
    if (subPage !== null) {
      setSubPage(null);
      return;
    }
    setActivePage(prevPage);
  };

  // ── Handlers
  const handleAddPago = () => {
    const monto = parseFloat(pagoForm.monto);
    if (
      !pagoForm.concepto.trim() ||
      !pagoForm.estado.trim() ||
      !pagoForm.vence.trim() ||
      isNaN(monto)
    )
      return;
    setPayments((prev) => [
      ...prev,
      {
        concepto: pagoForm.concepto,
        estado: pagoForm.estado,
        monto,
        vence: pagoForm.vence,
      },
    ]);
    setPagoForm({ concepto: "", monto: "", estado: "", vence: "" });
    setActiveModal(null);
    showToast("Pago agregado", "Se agregó un registro a la tabla.");
  };

  const handleInscripcion = () => {
    setInscripcionForm({ carrera: "", semestre: "", correo: "", telefono: "" });
    showToast(
      "Solicitud enviada",
      "Tu solicitud de inscripción fue registrada.",
    );
  };

  // ── Page renderers ────────────────────────────────────────────────────────────

  /** 1. HOME */
  const renderHome = () => (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={s.welcomeBanner}>
        <Text style={s.welcomeTitle}>
          ¡Bienvenido de nuevo, {alumnoNombre.split(" ")[0] || "Estudiante"}!
        </Text>
        <Text
          style={[s.muted, { marginTop: 4, color: "rgba(255,255,255,0.72)" }]}
        >
          Mantente al día con tu portal estudiantil.
        </Text>
        <View style={s.welcomeOrb} />
      </View>

      <View style={s.sectionHeader}>
        <Text style={s.sectionLabel}>Horas Laborales</Text>
        <Text style={s.linkText}>Ver todo</Text>
      </View>
      <View style={s.row3}>
        <Card style={s.metricCard}>
          <Text style={s.metricValue}>—</Text>
          <Text style={s.muted}>Requeridas</Text>
        </Card>
        <Card style={[s.metricCard, s.metricHighlight]}>
          <Text style={s.metricValue}>$ 5,000</Text>
          <Text style={s.muted}>Total pagado</Text>
        </Card>
        <Card style={s.metricCard}>
          <Text style={s.metricValue}>$ 300</Text>
          <Text style={s.muted}>Otros</Text>
        </Card>
      </View>

      <View style={[s.sectionHeader, { marginTop: 8 }]}>
        <Text style={s.sectionLabel}>Empresas destacadas</Text>
        <TouchableOpacity onPress={() => navigate("explorar")}>
          <Text style={s.linkText}>Ver todo</Text>
        </TouchableOpacity>
      </View>
      <Text style={[s.muted, { marginBottom: 14, fontSize: 12 }]}>
        Empresas disponibles en Gradly.
      </Text>
      {loadingCompanies ? (
        <Card style={{ padding: 16 }}>
          <Text style={[s.muted, { textAlign: "center" }]}>
            Cargando empresas...
          </Text>
        </Card>
      ) : companies.length === 0 ? (
        <Card style={{ padding: 16 }}>
          <Text style={[s.muted, { textAlign: "center" }]}>
            Sin empresas disponibles.
          </Text>
        </Card>
      ) : (
        companies.slice(0, 3).map((e) => (
          <Card key={e.id} style={{ padding: 16, marginBottom: 12 }}>
            <View style={[s.row, { gap: 12, marginBottom: 10 }]}>
              <View style={s.empresaLogo}>
                {e.logo ? (
                  <Image
                    source={{ uri: e.logo }}
                    style={{ width: 36, height: 36, borderRadius: 8 }}
                  />
                ) : (
                  <Text style={{ fontSize: 20, fontWeight: "700", color: C.purple }}>
                    {e.nombre.charAt(0)}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.boldText}>{e.nombre}</Text>
                {e.sector ? (
                  <Text style={[s.muted, { fontSize: 12 }]}>{e.sector}</Text>
                ) : null}
              </View>
            </View>
            <View style={[s.row, { gap: 8 }]}>
              <TouchableOpacity
                style={[s.btnOutline, { flex: 1, paddingVertical: 8 }]}
                onPress={() => openProfileViewer(e.id, "empresa")}
              >
                <Text style={[s.btnOutlineText, { fontSize: 12 }]}>
                  Ver empresa
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btnPrimary, { flex: 1, paddingVertical: 8 }]}
                onPress={async () => {
                  if (!userId) return;
                  const { error } = await supabase
                    .from("solicitudes_horas")
                    .insert({
                      alumno_id: userId,
                      empresa_id: e.id,
                      estado: "pendiente",
                    });
                  showToast(
                    error ? "Error" : "Solicitud enviada",
                    error
                      ? "No se pudo enviar la solicitud."
                      : `Solicitud enviada a ${e.nombre}.`,
                  );
                }}
              >
                <Text style={[s.btnPrimaryText, { fontSize: 12 }]}>
                  Solicitar horas
                </Text>
              </TouchableOpacity>
            </View>
          </Card>
        ))
      )}

      <Card style={{ padding: 16, marginBottom: 12 }}>
        <Text style={[s.boldText, { marginBottom: 12 }]}>
          📋 Solicitudes de horas pendientes
        </Text>
        {payments.filter((p) => !p.estado.toLowerCase().includes("pag"))
          .length === 0 ? (
          <Text style={[s.muted, { fontSize: 12 }]}>
            Sin solicitudes pendientes.
          </Text>
        ) : (
          payments
            .filter((p) => !p.estado.toLowerCase().includes("pag"))
            .map((item, i) => (
              <View
                key={i}
                style={[
                  s.row,
                  { justifyContent: "space-between", marginBottom: 10 },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[s.boldText, { fontSize: 13 }]}>
                    {item.concepto}
                  </Text>
                  <Text style={[s.muted, { fontSize: 11 }]}>
                    Vence: {item.vence}
                  </Text>
                </View>
                <View style={s.pendingBadge}>
                  <Text style={s.pendingBadgeText}>{item.estado}</Text>
                </View>
              </View>
            ))
        )}
      </Card>

      <Card style={{ padding: 16, marginBottom: 12 }}>
        <Text style={[s.boldText, { marginBottom: 12 }]}>
          📅 Próximas fechas
        </Text>
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
          <View key={d.date} style={[s.row, { marginBottom: 10, gap: 10 }]}>
            <Text style={{ fontSize: 18 }}>{d.icon}</Text>
            <View>
              <Text style={[s.muted, { fontSize: 12 }]}>{d.desc}</Text>
              <Text style={[s.muted, { fontSize: 11, marginTop: 2 }]}>
                {d.date}
              </Text>
            </View>
          </View>
        ))}
      </Card>

      <View style={{ paddingHorizontal: 0, marginBottom: 16 }}>
        <Text style={[s.sectionLabel, { marginBottom: 8 }]}>DESCUBRIR</Text>
        <BuscadorExplorador
          viewerUserId={userId ?? ""}
          theme={isDark ? "dark" : "light"}
          tabs={["empresas", "talentos"]}
        />
      </View>

      <Card style={{ padding: 16, marginBottom: 24 }}>
        <Text style={[s.boldText, { marginBottom: 12 }]}>
          Actividad reciente
        </Text>
        {[
          {
            icon: "✅",
            text: "TechSV Solutions validó 120 horas del Grupo A",
            time: "hace 1 hora",
          },
          {
            icon: "🤝",
            text: "Nueva empresa verificada: LogiSV Corp",
            time: "hace 3 horas",
          },
          {
            icon: "📋",
            text: "Solicitud de horas enviada a WebFactory CR",
            time: "hace 5 horas",
          },
        ].map((f, i) => (
          <View key={i} style={[s.row, { marginBottom: 12, gap: 10 }]}>
            <View style={s.feedIconBox}>
              <Text>{f.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.muted, { fontSize: 12 }]}>{f.text}</Text>
              <Text style={[s.muted, { fontSize: 11, marginTop: 2 }]}>
                {f.time}
              </Text>
            </View>
          </View>
        ))}
      </Card>
    </ScrollView>
  );

  /** 2. EXPLORAR */
  const renderExplorar = () => (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={s.pageHead}>
        <Text style={s.pageTitle}>Explorar</Text>
      </View>
      <View style={s.searchBox}>
        <Ionicons name="search-outline" size={16} color={C.muted} />
        <TextInput
          style={[
            s.input,
            {
              flex: 1,
              marginLeft: 8,
              borderWidth: 0,
              padding: 0,
              backgroundColor: "transparent",
            },
          ]}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Buscar empresas, proyectos..."
          placeholderTextColor={C.muted}
        />
      </View>
      {searchQuery.trim().length > 0 && (
        <View style={{ marginTop: 10, marginBottom: 8 }}>
          {filteredExploreCompanies.length === 0 ? (
            <Text style={[s.muted, { fontSize: 12 }]}>
              No se encontraron empresas.
            </Text>
          ) : (
            filteredExploreCompanies.slice(0, 4).map((empresa) => (
              <TouchableOpacity
                key={empresa.id}
                style={[
                  s.card,
                  {
                    padding: 12,
                    marginBottom: 8,
                    borderColor: C.border,
                  },
                ]}
                activeOpacity={0.85}
                onPress={() => {
                  setSearchQuery(empresa.nombre);
                  openProfileViewer(empresa.id, "empresa");
                }}
              >
                <Text style={[s.boldText, { fontSize: 14 }]}>
                  {empresa.nombre}
                </Text>
                <Text style={[s.muted, { fontSize: 12, marginTop: 4 }]}>
                  {" "}
                  {empresa.sector}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}
      <View style={[s.row, { gap: 8, marginBottom: 16 }]}>
        {(["empresas", "proyectos"] as ExplorarTab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[s.tabChip, explorarTab === t && s.tabChipActive]}
            onPress={() => setExplorarTab(t)}
            activeOpacity={0.8}
          >
            <Text
              style={[s.tabChipText, explorarTab === t && s.tabChipTextActive]}
            >
              {t === "empresas" ? "🏢 Empresas" : "💡 Proyectos"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {explorarTab === "empresas" && (
        <>
          {loadingCompanies ? (
            <Card style={{ padding: 16 }}>
              <Text style={[s.muted, { textAlign: "center" }]}>
                Cargando empresas...
              </Text>
            </Card>
          ) : companies.length === 0 ? (
            <Card style={{ padding: 16 }}>
              <Text style={[s.muted, { textAlign: "center" }]}>
                Sin empresas disponibles.
              </Text>
            </Card>
          ) : (
            companies.map((e) => (
              <Card key={e.id} style={{ padding: 16, marginBottom: 12 }}>
                <View style={[s.row, { gap: 12, marginBottom: 10 }]}>
                  <View style={s.empresaLogo}>
                    {e.logo ? (
                      <Image
                        source={{ uri: e.logo }}
                        style={{ width: 36, height: 36, borderRadius: 8 }}
                      />
                    ) : (
                      <Text
                        style={{
                          fontSize: 18,
                          fontWeight: "700",
                          color: C.purple,
                        }}
                      >
                        {e.nombre.charAt(0)}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.boldText}>{e.nombre}</Text>
                    {e.sector ? (
                      <Text style={[s.muted, { fontSize: 12 }]}>
                        {e.sector}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View style={[s.row, { gap: 8 }]}>
                  <TouchableOpacity
                    style={[s.btnOutline, { flex: 1, paddingVertical: 8 }]}
                    onPress={() => openProfileViewer(e.id, "empresa")}
                  >
                    <Text style={[s.btnOutlineText, { fontSize: 12 }]}>
                      Ver empresa
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.btnPrimary, { flex: 1, paddingVertical: 8 }]}
                    onPress={async () => {
                      if (!userId) return;
                      const { error } = await supabase
                        .from("solicitudes_horas")
                        .insert({
                          alumno_id: userId,
                          empresa_id: e.id,
                          estado: "pendiente",
                        });
                      showToast(
                        error ? "Error" : "Solicitud enviada",
                        error
                          ? "No se pudo enviar la solicitud."
                          : `Solicitud enviada a ${e.nombre}.`,
                      );
                    }}
                  >
                    <Text style={[s.btnPrimaryText, { fontSize: 12 }]}>
                      Solicitar horas
                    </Text>
                  </TouchableOpacity>
                </View>
              </Card>
            ))
          )}
        </>
      )}

      {explorarTab === "proyectos" && (
        <Card style={{ padding: 24, alignItems: "center" }}>
          <Ionicons name="construct-outline" size={32} color={C.muted as string} />
          <Text style={[s.boldText, { marginTop: 12, textAlign: "center" }]}>
            Proyectos — Próximamente
          </Text>
          <Text style={[s.muted, { marginTop: 6, fontSize: 12, textAlign: "center" }]}>
            Pronto podrás explorar y publicar proyectos de otros estudiantes.
          </Text>
        </Card>
      )}
      <View style={{ height: 20 }} />
    </ScrollView>
  );

  /** 3. CURSOS — tabs: Mis Cursos | Mi Horario */
  const renderCursos = () => (
    <View style={{ flex: 1 }}>
      <View style={s.inPageTabBar}>
        {(["lista", "horario"] as CursosTab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[s.inPageTab, cursosTab === t && s.inPageTabActive]}
            onPress={() => setCursosTab(t)}
            activeOpacity={0.8}
          >
            <Text
              style={[
                s.inPageTabText,
                cursosTab === t && s.inPageTabTextActive,
              ]}
            >
              {t === "lista" ? "Mi Grupo" : "Mi Horario"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {cursosTab === "lista" && (
        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
          <View style={s.searchBox}>
            <Ionicons name="search-outline" size={16} color={C.muted} />
            <TextInput
              style={[
                s.input,
                {
                  flex: 1,
                  marginLeft: 8,
                  borderWidth: 0,
                  padding: 0,
                  backgroundColor: "transparent",
                },
              ]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Buscar"
              placeholderTextColor={C.muted}
            />
          </View>
          {filteredCourses.map((c) => (
            <Card key={c.id} style={{ padding: 16, marginBottom: 12 }}>
              <Text style={s.boldText}>{c.nombre}</Text>
              <Text style={[s.muted, { marginTop: 6 }]}>
                {c.modulo} • Avance {c.avance}
              </Text>
              <View style={{ marginTop: 12, alignItems: "flex-end" }}>
                <TouchableOpacity
                  style={s.btnPrimary}
                  onPress={() => {
                    setSelectedCourse(c.nombre);
                    setActiveModal("curso");
                  }}
                >
                  <Text style={s.btnPrimaryText}>Ver detalle</Text>
                </TouchableOpacity>
              </View>
            </Card>
          ))}
          {filteredCourses.length === 0 && (
            <Text style={[s.muted, { textAlign: "center", marginTop: 24 }]}>
              Sin resultados
            </Text>
          )}
          <View style={{ height: 20 }} />
        </ScrollView>
      )}

      {cursosTab === "horario" && (
        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
          <Card style={{ padding: 16, marginTop: 4 }}>
            <Text style={[s.boldText, { marginBottom: 12 }]}>
              📅 Horario de clases
            </Text>
            <TableHeader cols={["Día", "Hora", "Materia", "Aula"]} />
            {horario.length === 0 ? (
              <Text
                style={[s.muted, { textAlign: "center", paddingVertical: 12 }]}
              >
                Sin horario registrado.
              </Text>
            ) : (
              horario.map((h, i) => (
                <TableRow
                  key={i}
                  cells={[h.dia, h.hora, h.materia, h.aula]}
                />
              ))
            )}
          </Card>
          <Card style={{ padding: 16, marginTop: 4 }}>
            <Text style={[s.boldText, { marginBottom: 4 }]}>
              🏢 Horas Laborales – Día de Hoy
            </Text>
            <Text style={[s.muted, { fontSize: 12, marginBottom: 14 }]}>
              TechSV Solutions · Lunes 08:00 – 12:00
            </Text>
            <TouchableOpacity
              style={[
                s.btnPrimary,
                horasStarted && { backgroundColor: "rgba(139,92,246,0.35)" },
                { marginBottom: 10 },
              ]}
              onPress={() => {
                if (!horasStarted) {
                  showToast(
                    "Verificando ubicación…",
                    "Comprobando que estás en el local.",
                  );
                  setTimeout(() => {
                    setHorasStarted(true);
                    showToast(
                      "¡Horas iniciadas!",
                      "Se registró tu entrada. Buen día.",
                    );
                  }, 1500);
                }
              }}
              disabled={horasStarted}
              activeOpacity={0.8}
            >
              <Text style={s.btnPrimaryText}>
                {horasStarted
                  ? "✅ Horas iniciadas"
                  : "📍 Iniciar horas del día"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btnDanger, { marginBottom: 10 }]}
              onPress={() => setActiveModal("emergencia")}
              activeOpacity={0.8}
            >
              <Text style={s.btnDangerText}>🚨 Reportar emergencia</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                s.btnOutline,
                (!horasStarted || horasFinalizadas) && { opacity: 0.4 },
              ]}
              onPress={() => {
                if (horasStarted && !horasFinalizadas) {
                  setHorasFinalizadas(true);
                  showToast(
                    "Horas finalizadas",
                    "Tu jornada quedó registrada correctamente.",
                  );
                }
              }}
              disabled={!horasStarted || horasFinalizadas}
              activeOpacity={0.8}
            >
              <Text style={s.btnOutlineText}>
                {horasFinalizadas
                  ? "✅ Jornada completada"
                  : "🏁 Horas laborales finalizadas"}
              </Text>
            </TouchableOpacity>
          </Card>
          <View style={{ height: 20 }} />
        </ScrollView>
      )}
    </View>
  );

  /** 4. MI PERFIL */
  const renderPerfil = () => (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={s.profileHeader}>
        <View style={[s.profileAvatar, { overflow: "hidden" }]}>
          {profilePhotoUrl ? (
            <Image
              source={{ uri: profilePhotoUrl }}
              style={{ width: 72, height: 72, borderRadius: 36 }}
            />
          ) : (
            <Text style={s.profileAvatarText}>
              {alumnoNombre.charAt(0) || "E"}
            </Text>
          )}
        </View>
        <Text style={s.profileName}>{alumnoNombre || "Estudiante"}</Text>
        <Text style={[s.muted, { marginTop: 4 }]}>
          {[alumnoCarrera, alumnoSemestre].filter(Boolean).join(" · ") ||
            "Estudiante Gradly"}
        </Text>
        <View style={[s.badgeChip, { marginTop: 10 }]}>
          <Text style={s.badgeChipText}>Estudiante activo</Text>
        </View>
      </View>

      <Card style={{ padding: 16 }}>
        {[
          { label: "Carrera", value: alumnoCarrera || "—" },
          { label: "Semestre", value: alumnoSemestre || "—" },
          { label: "Correo", value: alumnoEmail || "—" },
          { label: "Teléfono", value: alumnoTel || "—" },
        ].map((item) => (
          <View
            key={item.label}
            style={[
              s.row,
              {
                justifyContent: "space-between",
                paddingVertical: 8,
                borderBottomWidth: 1,
                borderBottomColor: C.border,
              },
            ]}
          >
            <Text style={s.muted}>{item.label}</Text>
            <Text style={[s.boldText, { fontSize: 13 }]}>{item.value}</Text>
          </View>
        ))}
      </Card>

      <Text style={[s.sectionLabel, { marginTop: 8, marginBottom: 12 }]}>
        Mis secciones
      </Text>

      <TouchableOpacity
        style={[
          s.profileSection,
          { borderColor: C.purpleBorder, backgroundColor: C.purpleDim },
        ]}
        onPress={goToPagos}
        activeOpacity={0.8}
      >
        <View style={[s.row, { gap: 12, flex: 1 }]}>
          <Ionicons name="card-outline" size={20} color={C.purple} />
          <View style={{ flex: 1 }}>
            <Text style={[s.boldText, { color: C.purple }]}>Pagos</Text>
            <Text style={[s.muted, { fontSize: 12 }]}>
              Ver y registrar tus pagos
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={C.purple} />
        </View>
      </TouchableOpacity>

      {[
        {
          label: "Editar Mi Perfil",
          icon: "create-outline" as const,
          page: "editarperfil" as Page,
          desc: "Actualizar tus datos personales",
        },
        {
          label: "Resultados",
          icon: "newspaper-outline" as const,
          page: "resultados" as Page,
          desc: "Ver comentarios de tu desempeño en la empresa",
        },
        {
          label: "Configuración",
          icon: "settings-outline" as const,
          page: "configuracion" as Page,
          desc: "Seguridad, notificaciones y preferencias",
        },
      ].map((item) => (
        <TouchableOpacity
          key={item.label}
          style={s.profileSection}
          onPress={() => navigate(item.page as Page)}
          activeOpacity={0.8}
        >
          <View style={[s.row, { gap: 12, flex: 1 }]}>
            <Ionicons name={item.icon} size={20} color={C.muted} />
            <View style={{ flex: 1 }}>
              <Text style={s.boldText}>{item.label}</Text>
              <Text style={[s.muted, { fontSize: 12 }]}>{item.desc}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={C.muted} />
          </View>
        </TouchableOpacity>
      ))}

      {/* Cuenta */}
      {[
        { label: "Cambiar contraseña", icon: "lock-closed-outline" as const, onPress: () => setShowCambiarPass(true) },
        { label: "Acerca de Gradly", icon: "information-circle-outline" as const, onPress: () => setActiveModal("acerca") },
        { label: "Ayuda y soporte", icon: "help-circle-outline" as const, onPress: () => setActiveModal("ayuda") },
      ].map((item) => (
        <TouchableOpacity key={item.label} style={s.profileSection} onPress={item.onPress} activeOpacity={0.8}>
          <View style={[s.row, { gap: 12, flex: 1 }]}>
            <Ionicons name={item.icon} size={20} color={C.muted} />
            <Text style={[s.boldText, { flex: 1 }]}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={16} color={C.muted} />
          </View>
        </TouchableOpacity>
      ))}

      <Card style={{ padding: 16, marginTop: 4 }}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionLabel}>Instructores</Text>
          <Text style={s.linkText}>Ver todo</Text>
        </View>
        <View style={[s.row, { gap: 10, marginTop: 8 }]}>
          {["A", "M", "C"].map((initial) => (
            <View key={initial} style={s.avatarCircle}>
              <Text style={s.avatarText}>{initial}</Text>
            </View>
          ))}
          <View
            style={[
              s.avatarCircle,
              { borderStyle: "dashed", marginLeft: "auto" as any },
            ]}
          >
            <Text style={[s.avatarText, { color: C.muted }]}>+2</Text>
          </View>
        </View>
      </Card>

      <TouchableOpacity
        style={[s.btnDanger, { marginTop: 16, marginBottom: 8 }]}
        onPress={() => setActiveModal("logout")}
      >
        <Text style={s.btnDangerText}>Cerrar sesión</Text>
      </TouchableOpacity>
      <View style={{ height: 20 }} />
    </ScrollView>
  );

  /** PAGOS — sub-vista */
  const renderPagos = () => (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={s.pageHead}>
        <Text style={s.pageTitle}>Info de pagos</Text>
        <TouchableOpacity
          style={s.btnPrimary}
          onPress={() => setActiveModal("pago")}
        >
          <Text style={s.btnPrimaryText}>Registrar pago</Text>
        </TouchableOpacity>
      </View>

      {/* Mis Trabajos (contrataciones) */}
      <Card style={{ padding: 16, marginBottom: 14 }}>
        <Text style={[s.boldText, { marginBottom: 12 }]}>Mis Trabajos</Text>
        {loadingTrabajos ? (
          <Text style={[s.muted, { fontSize: 13 }]}>Cargando trabajos...</Text>
        ) : trabajos.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 16 }}>
            <Ionicons name="briefcase-outline" size={28} color={C.muted as string} />
            <Text style={[s.muted, { marginTop: 8, fontSize: 13, textAlign: "center" }]}>
              Aún no tienes contrataciones.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {trabajos.map((t) => (
              <View key={t.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: C.purpleDim, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {t.empresas?.foto_logo ? (
                    <Image source={{ uri: t.empresas.foto_logo }} style={{ width: 36, height: 36 }} />
                  ) : (
                    <Ionicons name="business-outline" size={16} color={C.purple} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.boldText, { fontSize: 13 }]}>{t.vacantes?.titulo ?? "Trabajo"}</Text>
                  <Text style={[s.muted, { fontSize: 11 }]}>{t.empresas?.nombre ?? "Empresa"}</Text>
                </View>
                <View style={[{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: t.estado === "activo" ? C.greenBg : C.purpleDim }]}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: t.estado === "activo" ? C.green : C.purple }}>
                    {t.estado === "activo" ? "Activo" : t.estado}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </Card>

      <Card style={{ padding: 16 }}>
        <TableHeader cols={["Concepto", "Estado", "Monto", "Vence"]} />
        {payments.map((p, i) => (
          <TableRow
            key={i}
            cells={[p.concepto, p.estado, money(p.monto), p.vence]}
          />
        ))}
      </Card>
      <Card style={{ padding: 16 }}>
        <Text style={s.boldText}>Resumen</Text>
        <View style={[s.row, { gap: 12, marginTop: 12 }]}>
          <View
            style={[
              s.card,
              {
                flex: 1,
                padding: 14,
                backgroundColor: "rgba(255,255,255,0.02)",
              },
            ]}
          >
            <Text style={s.muted}>Pendiente</Text>
            <Text style={s.summaryAmount}>{money(totalPendiente)}</Text>
          </View>
          <View
            style={[
              s.card,
              {
                flex: 1,
                padding: 14,
                backgroundColor: "rgba(255,255,255,0.02)",
              },
            ]}
          >
            <Text style={s.muted}>Pagado</Text>
            <Text style={s.summaryAmount}>{money(totalPagado)}</Text>
          </View>
        </View>
        <Divider />
        <Text style={s.muted}>
          Usa {"\"Registrar pago\""} para agregar un movimiento nuevo.
        </Text>
      </Card>
      <View style={{ height: 20 }} />
    </ScrollView>
  );

  /** EDITAR MI PERFIL */
  const renderEditarPerfil = () => (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.pageHead}>
          <Text style={s.pageTitle}>Editar Mi Perfil</Text>
        </View>
        <View style={[s.profileHeader, { marginBottom: 16 }]}>
          <TouchableOpacity
            style={[s.profileAvatar, { overflow: "hidden" }]}
            onPress={async () => {
              if (!userId) return;
              setUploadingPhoto(true);
              const url = await pickAndUploadImage(
                "public-media",
                userId + "/" + Date.now() + "-foto_perfil.jpg",
              );
              if (url) {
                const ok = await updateProfilePhoto(userId, "alumnos", url);
                if (ok) {
                  setProfilePhotoUrl(url);
                  showToast(
                    "Foto actualizada",
                    "Tu foto de perfil fue guardada.",
                  );
                }
              }
              setUploadingPhoto(false);
            }}
          >
            {profilePhotoUrl ? (
              <Image
                source={{ uri: profilePhotoUrl }}
                style={{ width: 72, height: 72, borderRadius: 36 }}
              />
            ) : (
              <Text style={s.profileAvatarText}>
                {alumnoNombre.charAt(0) || "E"}
              </Text>
            )}
          </TouchableOpacity>
          <Text style={[s.muted, { fontSize: 12, marginTop: 8 }]}>
            {uploadingPhoto
              ? "Subiendo foto..."
              : "Toca para cambiar foto de perfil"}
          </Text>
        </View>
        <Card style={{ padding: 16 }}>
          <View style={s.field}>
            <Text style={s.fieldLabel}>Nombre completo</Text>
            <TextInput
              style={s.input}
              value={editNombre}
              onChangeText={setEditNombre}
              placeholder="Nombre"
              placeholderTextColor={C.muted}
            />
          </View>
          <View style={s.field}>
            <Text style={s.fieldLabel}>Correo electrónico</Text>
            <TextInput
              style={s.input}
              value={editCorreo}
              onChangeText={setEditCorreo}
              placeholder="Correo"
              placeholderTextColor={C.muted}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          <View style={s.field}>
            <Text style={s.fieldLabel}>Teléfono</Text>
            <TextInput
              style={s.input}
              value={editTel}
              onChangeText={setEditTel}
              placeholder="Teléfono"
              placeholderTextColor={C.muted}
              keyboardType="phone-pad"
            />
          </View>
          <View style={s.field}>
            <Text style={s.fieldLabel}>Carrera</Text>
            <View style={[s.input, { justifyContent: "center" }]}>
              <Text style={[s.muted, { fontSize: 14 }]}>{editCarrera}</Text>
            </View>
          </View>
          <View style={s.field}>
            <Text style={s.fieldLabel}>Semestre</Text>
            <View style={[s.input, { justifyContent: "center" }]}>
              <Text style={[s.muted, { fontSize: 14 }]}>{editSemestre}</Text>
            </View>
          </View>
          <View
            style={[
              s.row,
              { justifyContent: "flex-end", gap: 10, marginTop: 16 },
            ]}
          >
            <TouchableOpacity
              style={s.btnPrimary}
              onPress={async () => {
                if (!userId) return;
                const ok = await updateUserProfile(userId, "alumnos", {
                  nombre_completo: editNombre,
                  email: editCorreo,
                  telefono: editTel,
                });
                if (ok) {
                  setAlumnoNombre(editNombre);
                  setAlumnoEmail(editCorreo);
                  setAlumnoTel(editTel);
                  setCfgNombre(editNombre);
                  setCfgEmail(editCorreo);
                  setCfgTel(editTel);
                  showToast(
                    "Perfil actualizado",
                    "Tus datos fueron guardados.",
                  );
                  navigate("perfil");
                }
              }}
            >
              <Text style={s.btnPrimaryText}>Guardar cambios</Text>
            </TouchableOpacity>
          </View>
        </Card>
        <View style={{ height: 20 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );

  /** RESULTADOS — Comentarios de desempeño en la empresa */
  const renderResultados = () => (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={s.pageHead}>
        <Text style={s.pageTitle}>Resultados</Text>
      </View>
      <Card style={{ padding: 16, marginBottom: 12 }}>
        <View style={[s.row, { gap: 12, marginBottom: 12 }]}>
          <View style={s.empresaLogo}>
            <Text style={{ fontSize: 20 }}>💼</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.boldText}>TechSV Solutions</Text>
            <Text style={[s.muted, { fontSize: 12 }]}>
              Tecnología · Software
            </Text>
            <Text style={[s.muted, { fontSize: 11, marginTop: 2 }]}>
              Horas completadas:{" "}
              <Text style={{ color: C.green, fontWeight: "700" }}>
                120 / 120
              </Text>
            </Text>
          </View>
          <View
            style={[
              s.badgeChip,
              { backgroundColor: C.greenBg, borderColor: C.greenBorder },
            ]}
          >
            <Text style={[s.badgeChipText, { color: C.green }]}>
              Completado
            </Text>
          </View>
        </View>
        <Divider />
        <Text style={[s.boldText, { marginBottom: 10 }]}>
          Comentarios del encargado
        </Text>
        {[
          {
            tipo: "positivo",
            autor: "Ing. Roberto Flores",
            fecha: "10/05/2026",
            texto:
              "Excelente actitud y compromiso con las tareas asignadas. Siempre puntual y proactivo en la resolución de problemas.",
          },
          {
            tipo: "positivo",
            autor: "Ing. Roberto Flores",
            fecha: "02/05/2026",
            texto:
              "Buen trabajo en equipo durante el sprint de desarrollo. Comunicación clara y efectiva con los compañeros.",
          },
          {
            tipo: "negativo",
            autor: "Ing. Roberto Flores",
            fecha: "25/04/2026",
            texto:
              "Se recomienda mejorar la documentación del código y revisar los estándares de la empresa antes de hacer commit.",
          },
        ].map((c, i) => (
          <View
            key={i}
            style={[
              s.card,
              {
                padding: 14,
                marginBottom: 10,
                borderColor:
                  c.tipo === "positivo" ? C.greenBorder : C.dangerBorder,
                backgroundColor: c.tipo === "positivo" ? C.greenBg : C.dangerBg,
              },
            ]}
          >
            <View
              style={[
                s.row,
                { justifyContent: "space-between", marginBottom: 6 },
              ]}
            >
              <View style={[s.row, { gap: 6 }]}>
                <Ionicons
                  name={
                    c.tipo === "positivo"
                      ? "thumbs-up-outline"
                      : "thumbs-down-outline"
                  }
                  size={14}
                  color={c.tipo === "positivo" ? C.green : C.danger}
                />
                <Text
                  style={[
                    s.muted,
                    {
                      fontSize: 12,
                      color: c.tipo === "positivo" ? C.green : C.danger,
                    },
                  ]}
                >
                  {c.tipo === "positivo"
                    ? "Comentario positivo"
                    : "Área de mejora"}
                </Text>
              </View>
              <Text style={[s.muted, { fontSize: 11 }]}>{c.fecha}</Text>
            </View>
            <Text style={[s.body, { marginBottom: 4 }]}>{c.texto}</Text>
            <Text style={[s.muted, { fontSize: 11 }]}>— {c.autor}</Text>
          </View>
        ))}
      </Card>
      <View style={{ height: 20 }} />
    </ScrollView>
  );

  /** CONFIGURACIÓN */
  const renderConfiguracion = () => (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.pageHead}>
          <Text style={s.pageTitle}>Configuración</Text>
        </View>
        <Card style={{ padding: 16, marginBottom: 12 }}>
          <Text style={[s.boldText, { fontSize: 15, marginBottom: 14 }]}>
            Datos personales
          </Text>
          <View style={s.field}>
            <Text style={s.fieldLabel}>Nombre completo</Text>
            <TextInput
              style={s.input}
              value={cfgNombre}
              onChangeText={setCfgNombre}
              placeholder="Nombre"
              placeholderTextColor={C.muted}
            />
          </View>
          <View style={s.field}>
            <Text style={s.fieldLabel}>Correo electrónico</Text>
            <TextInput
              style={s.input}
              value={cfgEmail}
              onChangeText={setCfgEmail}
              placeholder="Correo"
              placeholderTextColor={C.muted}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          <View style={s.field}>
            <Text style={s.fieldLabel}>Teléfono</Text>
            <TextInput
              style={s.input}
              value={cfgTel}
              onChangeText={setCfgTel}
              placeholder="Teléfono"
              placeholderTextColor={C.muted}
              keyboardType="phone-pad"
            />
          </View>
          <TouchableOpacity
            style={[s.btnPrimary, { marginTop: 8 }]}
            onPress={async () => {
              if (!userId) return;
              const { error } = await supabase
                .from("alumnos")
                .update({ nombre_completo: cfgNombre, telefono: cfgTel })
                .eq("id", userId);
              if (error)
                showToast("Error", "No se pudieron guardar los cambios.");
              else {
                setAlumnoNombre(cfgNombre);
                setAlumnoTel(cfgTel);
                showToast("Guardado", "Datos actualizados correctamente.");
              }
            }}
          >
            <Text style={s.btnPrimaryText}>Guardar cambios</Text>
          </TouchableOpacity>
        </Card>

        <Card style={{ padding: 16, marginBottom: 12 }}>
          <Text style={[s.boldText, { fontSize: 15, marginBottom: 14 }]}>
            Seguridad
          </Text>
          <View style={s.field}>
            <Text style={s.fieldLabel}>Contraseña actual</Text>
            <TextInput
              style={s.input}
              value={cfgPwdActual}
              onChangeText={setCfgPwdActual}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={C.muted}
            />
          </View>
          <View style={s.field}>
            <Text style={s.fieldLabel}>Nueva contraseña</Text>
            <TextInput
              style={s.input}
              value={cfgPwdNew}
              onChangeText={setCfgPwdNew}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={C.muted}
            />
          </View>
          <View style={s.field}>
            <Text style={s.fieldLabel}>Confirmar nueva contraseña</Text>
            <TextInput
              style={s.input}
              value={cfgPwdConfirm}
              onChangeText={setCfgPwdConfirm}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={C.muted}
            />
          </View>
          <TouchableOpacity
            style={[s.btnPrimary, { marginTop: 8 }]}
            onPress={async () => {
              if (!cfgPwdNew || cfgPwdNew !== cfgPwdConfirm) {
                showToast("Error", "Las contraseñas no coinciden.");
                return;
              }
              const { error } = await supabase.auth.updateUser({
                password: cfgPwdNew,
              });
              if (error) showToast("Error", error.message);
              else {
                setCfgPwdActual("");
                setCfgPwdNew("");
                setCfgPwdConfirm("");
                showToast(
                  "Contraseña actualizada",
                  "Se cambió correctamente.",
                );
              }
            }}
          >
            <Text style={s.btnPrimaryText}>Cambiar contraseña</Text>
          </TouchableOpacity>
        </Card>

        <Card style={{ padding: 16, marginBottom: 12 }}>
          <Text style={[s.boldText, { fontSize: 15, marginBottom: 14 }]}>
            Notificaciones
          </Text>
          {[
            {
              label: "Nuevas empresas en mi área",
              val: cfgNotif1,
              set: setCfgNotif1,
            },
            {
              label: "Solicitudes de horas laborales",
              val: cfgNotif2,
              set: setCfgNotif2,
            },
            { label: "Actividad del grupo", val: cfgNotif3, set: setCfgNotif3 },
            {
              label: "Boletines del sistema",
              val: cfgNotif4,
              set: setCfgNotif4,
            },
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
              <Text style={[s.muted, { fontSize: 14, flex: 1 }]}>
                {n.label}
              </Text>
              <TouchableOpacity
                style={{
                  width: 40,
                  height: 22,
                  borderRadius: 22,
                  backgroundColor: n.val ? C.purple : "rgba(255,255,255,0.1)",
                  justifyContent: "center",
                  paddingHorizontal: 3,
                }}
                onPress={() => n.set(!n.val)}
                activeOpacity={0.8}
              >
                <View
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 8,
                    backgroundColor: n.val ? "#fff" : "rgba(255,255,255,0.4)",
                    alignSelf: n.val ? "flex-end" : "flex-start",
                  }}
                />
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
          onPress={() => setSubPage("ayuda")}
        >
          <Ionicons name="help-circle-outline" size={20} color={C.purple} />
          <Text style={[s.boldText, { flex: 1 }]}>Ayuda</Text>
          <Ionicons name="chevron-forward-outline" size={16} color={C.muted} />
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
          onPress={() => setSubPage("acercade")}
        >
          <Ionicons
            name="information-circle-outline"
            size={20}
            color={C.purple}
          />
          <Text style={[s.boldText, { flex: 1 }]}>Acerca de Gradly</Text>
          <Ionicons name="chevron-forward-outline" size={16} color={C.muted} />
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  /** AYUDA */
  const renderAyuda = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: 16 }}
    >
      <View style={s.pageHead}>
        <Text style={s.pageTitle}>Ayuda</Text>
      </View>
      <Text style={[s.muted, { marginBottom: 20 }]}>
        Te respondemos en menos de 24 horas hábiles.
      </Text>
      <Card style={{ padding: 16, marginBottom: 16 }}>
        <Text style={[s.boldText, { fontSize: 15, marginBottom: 14 }]}>
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
                backgroundColor: C.purpleDim,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name={ci.icon} size={17} color={C.purple} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.muted, { fontSize: 12 }]}>{ci.label}</Text>
              <Text style={[s.boldText, { fontSize: 14 }]}>{ci.value}</Text>
            </View>
          </View>
        ))}
      </Card>
      <Text style={[s.boldText, { fontSize: 15, marginBottom: 12 }]}>
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
          q: "¿Cómo se protegen mis datos personales?",
          a: "Gradly cumple con la Ley de Protección de Datos Personales de El Salvador.",
        },
        {
          q: "¿Las universidades pueden ver mi perfil?",
          a: "Solo las universidades a las que estés afiliado pueden acceder a tu información académica.",
        },
        {
          q: "¿Qué documentos necesita mi empresa para registrarse?",
          a: "NRC, correo corporativo y nombre del representante legal. La verificación tarda 24-48 horas hábiles.",
        },
        {
          q: "¿Gradly está disponible fuera de El Salvador?",
          a: "Actualmente opera en El Salvador, con expansión planeada a Centroamérica para el segundo semestre de 2026.",
        },
      ].map((item, i) => (
        <Card key={i} style={{ padding: 14, marginBottom: 8 }}>
          <Text style={[s.boldText, { fontSize: 14, marginBottom: 6 }]}>
            {item.q}
          </Text>
          <Text style={[s.muted, { lineHeight: 20 }]}>{item.a}</Text>
        </Card>
      ))}
    </ScrollView>
  );

  /** ACERCA DE GRADLY */
  const renderAcercaDe = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: 16 }}
    >
      <View
        style={[
          s.card,
          {
            backgroundColor: C.purpleDark,
            marginBottom: 20,
            alignItems: "center",
            padding: 24,
            borderRadius: 16,
          },
        ]}
      >
        <Text
          style={[
            s.muted,
            {
              fontSize: 12,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              marginBottom: 6,
            },
          ]}
        >
          Acerca de Gradly
        </Text>
        <Text
          style={[
            s.boldText,
            { fontSize: 20, textAlign: "center", marginBottom: 8 },
          ]}
        >
          La plataforma que conecta talento con oportunidades
        </Text>
        <Text style={[s.muted, { textAlign: "center" }]}>
          Nació en El Salvador para cerrar la brecha entre jóvenes talentos,
          universidades y empresas.
        </Text>
      </View>
      <Card style={{ padding: 16, marginBottom: 16 }}>
        <Text style={[s.boldText, { color: C.purple, marginBottom: 4 }]}>
          Misión
        </Text>
        <Text style={[s.muted, { marginBottom: 12 }]}>
          Democratizar el acceso al empleo profesional para los jóvenes talentos
          de América Latina.
        </Text>
        <View style={s.divider} />
        <Text
          style={[
            s.boldText,
            { color: C.purple, marginBottom: 4, marginTop: 12 },
          ]}
        >
          Visión
        </Text>
        <Text style={[s.muted, { marginBottom: 12 }]}>
          Ser el ecosistema profesional de referencia en América Latina para
          2030.
        </Text>
        <View style={s.divider} />
        <Text
          style={[
            s.boldText,
            { color: C.purple, marginBottom: 4, marginTop: 12 },
          ]}
        >
          Mercado objetivo
        </Text>
        <Text style={s.muted}>
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
                color: C.purple,
                marginBottom: 4,
              }}
            >
              {st.num}
            </Text>
            <Text style={s.muted}>{st.label}</Text>
          </Card>
        ))}
      </View>
      <Text style={[s.boldText, { fontSize: 15, marginBottom: 12 }]}>
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
              backgroundColor: C.purpleDim,
              borderWidth: 1,
              borderColor: C.purpleBorder,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: C.purple, fontWeight: "900", fontSize: 17 }}>
              {tm.icon}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.boldText, { fontSize: 14 }]}>{tm.name}</Text>
            <Text style={[s.muted, { fontSize: 12 }]}>{tm.role}</Text>
          </View>
        </Card>
      ))}
      <View style={{ height: 20 }} />
    </ScrollView>
  );

  const renderPage = () => {
    if (subPage === "ayuda") return renderAyuda();
    if (subPage === "acercade") return renderAcercaDe();
    switch (activePage) {
      case "home":
        return renderHome();
      case "explorar":
        return renderExplorar();
      case "cursos":
        return renderCursos();
      case "perfil":
        return renderPerfil();
      case "pagos":
        return renderPagos();
      case "editarperfil":
        return renderEditarPerfil();
      case "resultados":
        return renderResultados();
      case "configuracion":
        return renderConfiguracion();
    }
  };

  // ── Modal wrapper ─────────────────────────────────────────────────────────────

  const ModalShell = ({
    visible,
    title,
    children,
  }: {
    visible: boolean;
    title: string;
    children: React.ReactNode;
  }) => (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => setActiveModal(null)}
    >
      <View style={s.modalBackdrop}>
        <View style={s.modalDialog}>
          <View style={s.modalHead}>
            <Text style={s.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={() => setActiveModal(null)}>
              <Ionicons name="close" size={20} color={C.text} />
            </TouchableOpacity>
          </View>
          <View style={s.modalBody}>{children}</View>
        </View>
      </View>
    </Modal>
  );

  // ── Topbar logic
  const isSubView = activePage === "pagos";
  const isSidebarExtra =
    !!subPage ||
    activePage === "editarperfil" ||
    activePage === "resultados" ||
    activePage === "configuracion";

  return (
    <SafeAreaView style={s.root}>
      {/* ── Topbar universal */}
      <UniversalHeader
        userName={alumnoNombre}
        userSubtitle="Estudiante"
        profilePhotoUrl={profilePhotoUrl}
        userId={userId}
      />
      {/* ── Sub-nav (back / menu + título de página) */}
      <View style={[s.topbar, { paddingVertical: 8 }]}>
        <View style={[s.row, { gap: 8 }]}>
          {isSubView || isSidebarExtra ? (
            <TouchableOpacity
              style={s.iconBtn}
              onPress={goBack}
              accessibilityLabel="Regresar"
            >
              <Ionicons name="arrow-back-outline" size={24} color={C.text} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={s.iconBtn}
              onPress={() => setSidebarOpen(true)}
              accessibilityLabel="Abrir menú"
            >
              <Ionicons name="menu-outline" size={24} color={C.text} />
            </TouchableOpacity>
          )}
          <TranslatedText style={s.topbarTitle}>
            {PAGE_LABELS[activePage]}
          </TranslatedText>
        </View>
      </View>

      {/* ── Page content */}
      <View style={s.content}>{renderPage()}</View>

      {/* ── Bottom nav (4 ítems) */}
      <View style={s.bottomNav}>
        {BOTTOM_NAV.map((item) => {
          const active = activePage === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={s.bottomNavItem}
              onPress={() => navigate(item.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={item.icon}
                size={22}
                color={active ? C.purple : C.muted}
              />
              <Text style={[s.bottomNavLabel, active && { color: C.purple }]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <ProfileViewerModal
        visible={profileViewerVisible}
        userId={profileUserId}
        userType={profileUserType}
        onClose={() => setProfileViewerVisible(false)}
      />
      <Modal
        visible={sidebarOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSidebarOpen(false)}
      >
        <View style={s.drawerOverlay}>
          <View style={s.drawer}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {BOTTOM_NAV.map((item) => {
                const active = activePage === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[s.drawerItem, active && s.drawerItemActive]}
                    onPress={() => navigate(item.key)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={item.icon}
                      size={18}
                      color={active ? C.purple : C.muted}
                      style={{ marginRight: 12 }}
                    />
                    <Text
                      style={[
                        s.drawerItemText,
                        active && { color: C.purple, fontWeight: "700" },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={s.drawerFooter}>
              <TouchableOpacity
                style={s.btnDanger}
                onPress={() => {
                  setSidebarOpen(false);
                  setActiveModal("logout");
                }}
              >
                <Text style={s.btnDangerText}>Cerrar sesión</Text>
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)" }}
            onPress={() => setSidebarOpen(false)}
            activeOpacity={1}
          />
        </View>
      </Modal>

      {/* ── Notificaciones modal */}
      <Modal
        visible={notifVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNotifVisible(false)}
      >
        <View style={s.modalBackdrop}>
          <View style={s.modalDialog}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>Notificaciones</Text>
              <TouchableOpacity onPress={() => setNotifVisible(false)}>
                <Ionicons name="close" size={20} color={C.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={s.modalBody}>
              {avisos.length === 0 ? (
                <Text
                  style={[
                    s.muted,
                    { textAlign: "center", paddingVertical: 20 },
                  ]}
                >
                  Sin avisos por el momento.
                </Text>
              ) : (
                avisos.map((aviso, idx) => (
                  <View
                    key={idx}
                    style={[s.card, { padding: 14, marginBottom: 8 }]}
                  >
                    <View
                      style={[
                        s.row,
                        { justifyContent: "space-between", marginBottom: 6 },
                      ]}
                    >
                      <Text style={s.boldText}>{aviso.titulo}</Text>
                      <Text style={[s.muted, { fontSize: 11 }]}>
                        {aviso.fecha}
                      </Text>
                    </View>
                    <Text style={s.body}>{aviso.contenido}</Text>
                  </View>
                ))
              )}
              <View style={{ height: 8 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Modal: Registrar pago */}
      <ModalShell visible={activeModal === "pago"} title="Registrar pago">
        {(
          [
            {
              key: "concepto",
              label: "Concepto",
              placeholder: "Concepto",
              keyboardType: "default",
            },
            {
              key: "monto",
              label: "Monto",
              placeholder: "Monto",
              keyboardType: "numeric",
            },
            {
              key: "estado",
              label: "Estado (Pagado / Pendiente)",
              placeholder: "Estado",
              keyboardType: "default",
            },
            {
              key: "vence",
              label: "Vence (YYYY-MM-DD)",
              placeholder: "Vence",
              keyboardType: "default",
            },
          ] as Array<{
            key: keyof PagoForm;
            label: string;
            placeholder: string;
            keyboardType: "default" | "numeric";
          }>
        ).map((f) => (
          <View key={f.key} style={s.field}>
            <Text style={s.fieldLabel}>{f.label}</Text>
            <TextInput
              style={s.input}
              value={pagoForm[f.key]}
              onChangeText={(v) =>
                setPagoForm((prev) => ({ ...prev, [f.key]: v }))
              }
              placeholder={f.placeholder}
              placeholderTextColor={C.muted}
              keyboardType={f.keyboardType}
              autoCapitalize="none"
            />
          </View>
        ))}
        <View
          style={[s.row, { justifyContent: "flex-end", gap: 10, marginTop: 8 }]}
        >
          <TouchableOpacity
            style={s.btnOutline}
            onPress={() => setActiveModal(null)}
          >
            <Text style={s.btnOutlineText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btnPrimary} onPress={handleAddPago}>
            <Text style={s.btnPrimaryText}>Agregar</Text>
          </TouchableOpacity>
        </View>
      </ModalShell>

      {/* ── Modal: Detalle del grupo */}
      <ModalShell
        visible={activeModal === "curso"}
        title={selectedCourse || "Detalle del Grupo"}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={{ maxHeight: 480 }}
        >
          {/* Universidad */}
          <View style={[s.row, { gap: 12, marginBottom: 14 }]}>
            <View style={[s.empresaLogo, { backgroundColor: C.purpleDim }]}>
              <Text style={{ fontSize: 20 }}>🎓</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.boldText}>Universidad Don Bosco</Text>
              <Text style={[s.muted, { fontSize: 12 }]}>
                Facultad de Ingeniería
              </Text>
            </View>
          </View>
          <View
            style={[
              s.card,
              {
                padding: 14,
                marginBottom: 12,
                backgroundColor: "rgba(255,255,255,0.02)",
              },
            ]}
          >
            <View
              style={[
                s.row,
                { justifyContent: "space-between", marginBottom: 8 },
              ]}
            >
              <Text style={s.muted}>Encargada</Text>
              <Text style={[s.boldText, { fontSize: 13 }]}>Ana Contreras</Text>
            </View>
            <View
              style={[
                s.row,
                { justifyContent: "space-between", marginBottom: 8 },
              ]}
            >
              <Text style={s.muted}>Fecha de creación</Text>
              <Text style={[s.boldText, { fontSize: 13 }]}>15/01/2026</Text>
            </View>
            <View style={[s.row, { justifyContent: "space-between" }]}>
              <Text style={s.muted}>Hora de creación</Text>
              <Text style={[s.boldText, { fontSize: 13 }]}>09:30 AM</Text>
            </View>
          </View>

          <Text style={[s.sectionLabel, { marginBottom: 10 }]}>
            Estudiantes del grupo
          </Text>
          {grupoCompaneros.length === 0 ? (
            <Text style={[s.muted, { fontSize: 12 }]}>
              Sin compañeros registrados en este grupo.
            </Text>
          ) : (
            grupoCompaneros.map((nombre, i) => (
              <View key={i} style={[s.row, { gap: 12, marginBottom: 10 }]}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: STUDENT_COLORS[i % STUDENT_COLORS.length],
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Text
                    style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}
                  >
                    {nombre.charAt(0)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.boldText}>{nombre}</Text>
                  <Text style={[s.muted, { fontSize: 11 }]}>
                    Estudiante activo
                  </Text>
                </View>
              </View>
            ))
          )}

          <Divider />
          <Text style={[s.sectionLabel, { marginBottom: 10 }]}>
            Horas Laborales
          </Text>
          <View
            style={[
              s.card,
              { padding: 14, backgroundColor: "rgba(255,255,255,0.02)" },
            ]}
          >
            <View style={[s.row, { gap: 12, marginBottom: 12 }]}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: "#3b82f6",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Text
                  style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}
                >
                  T
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.boldText}>TechSV Solutions</Text>
                <Text style={[s.muted, { fontSize: 12 }]}>
                  Tecnología · Software
                </Text>
              </View>
            </View>
            <Text style={[s.muted, { fontSize: 13, marginBottom: 10 }]}>
              Empresa de desarrollo de software especializada en soluciones
              empresariales para el sector financiero y retail en El Salvador.
            </Text>
            <View
              style={[
                s.row,
                { justifyContent: "space-between", marginBottom: 7 },
              ]}
            >
              <Text style={s.muted}>Encargado</Text>
              <Text style={[s.boldText, { fontSize: 13 }]}>
                Ing. Roberto Flores
              </Text>
            </View>
            <View
              style={[
                s.row,
                { justifyContent: "space-between", marginBottom: 7 },
              ]}
            >
              <Text style={s.muted}>Puesto de trabajo</Text>
              <Text style={[s.boldText, { fontSize: 13 }]}>
                Desarrollador Jr.
              </Text>
            </View>
            <View
              style={[
                s.row,
                { justifyContent: "space-between", marginBottom: 7 },
              ]}
            >
              <Text style={s.muted}>Horario</Text>
              <Text style={[s.boldText, { fontSize: 13 }]}>
                Lun–Vie 08:00–12:00
              </Text>
            </View>
            <View
              style={[
                s.row,
                { justifyContent: "space-between", marginBottom: 7 },
              ]}
            >
              <Text style={s.muted}>Total de horas</Text>
              <Text style={[s.boldText, { fontSize: 13, color: C.purple }]}>
                120 horas
              </Text>
            </View>
            <View style={[s.row, { justifyContent: "space-between" }]}>
              <Text style={s.muted}>Fecha de inicio</Text>
              <Text style={[s.boldText, { fontSize: 13 }]}>03/02/2026</Text>
            </View>
          </View>
          <View style={{ height: 8 }} />
        </ScrollView>
        <View style={[s.row, { justifyContent: "flex-end", marginTop: 16 }]}>
          <TouchableOpacity
            style={s.btnPrimary}
            onPress={() => setActiveModal(null)}
          >
            <Text style={s.btnPrimaryText}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      </ModalShell>

      {/* ── Modal: Cerrar sesión */}
      <ModalShell visible={activeModal === "logout"} title="Cerrar sesión">
        <TranslatedText style={s.body}>
          ¿Seguro que deseas cerrar sesión?
        </TranslatedText>
        <View
          style={[
            s.row,
            { justifyContent: "flex-end", gap: 10, marginTop: 16 },
          ]}
        >
          <TouchableOpacity
            style={s.btnOutline}
            onPress={() => setActiveModal(null)}
          >
            <TranslatedText style={s.btnOutlineText}>Cancelar</TranslatedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.btnDanger}
            onPress={async () => {
              setActiveModal(null);
              await onLogout();
            }}
          >
            <TranslatedText style={s.btnDangerText}>Salir</TranslatedText>
          </TouchableOpacity>
        </View>
      </ModalShell>

      {/* ── Modal: Reportar emergencia */}
      <ModalShell
        visible={activeModal === "emergencia"}
        title="Reportar emergencia"
      >
        <Text style={[s.muted, { marginBottom: 12 }]}>
          Describe la situación (accidente, situación personal o familiar,
          etc.):
        </Text>
        <TextInput
          style={[
            s.input,
            { height: 100, textAlignVertical: "top", paddingTop: 10 },
          ]}
          value={emergenciaComment}
          onChangeText={setEmergenciaComment}
          placeholder="Escribe aquí tu reporte..."
          placeholderTextColor={C.muted}
          multiline
          numberOfLines={4}
        />
        <View
          style={[
            s.row,
            { justifyContent: "flex-end", gap: 10, marginTop: 16 },
          ]}
        >
          <TouchableOpacity
            style={s.btnOutline}
            onPress={() => {
              setEmergenciaComment("");
              setActiveModal(null);
            }}
          >
            <Text style={s.btnOutlineText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.btnDanger}
            onPress={() => {
              if (!emergenciaComment.trim()) return;
              setActiveModal(null);
              setEmergenciaComment("");
              showToast(
                "Emergencia reportada",
                "Tu reporte fue enviado al encargado.",
              );
            }}
          >
            <Text style={s.btnDangerText}>Enviar reporte</Text>
          </TouchableOpacity>
        </View>
      </ModalShell>

      {/* ── CambiarPasswordModal */}
      <CambiarPasswordModal
        visible={showCambiarPass}
        onClose={() => setShowCambiarPass(false)}
        theme={isDark ? "dark" : "light"}
      />

      {/* ── Modal Acerca de */}
      <ModalShell visible={activeModal === "acerca"} title="Acerca de Gradly">
        <Text style={[s.muted, { marginBottom: 8, color: C.purple, fontSize: 22, fontWeight: "900" }]}>Gradly</Text>
        <Text style={[s.muted, { fontSize: 12, marginBottom: 12 }]}>Versión 1.0.0</Text>
        <Text style={[s.body, { marginBottom: 10 }]}>
          Gradly conecta estudiantes con empresas y universidades de El Salvador, facilitando la gestión de horas sociales y oportunidades laborales.
        </Text>
        <Text style={[s.muted, { fontSize: 12 }]}>© 2025 Gradly. Todos los derechos reservados.</Text>
        <TouchableOpacity style={[s.btnPrimary, { marginTop: 16 }]} onPress={() => setActiveModal(null)}>
          <Text style={s.btnPrimaryText}>Cerrar</Text>
        </TouchableOpacity>
      </ModalShell>

      {/* ── Modal Ayuda */}
      <ModalShell visible={activeModal === "ayuda"} title="Ayuda y soporte">
        <Text style={[s.body, { marginBottom: 12 }]}>
          ¿Tienes alguna duda o problema? Escríbenos y te responderemos a la brevedad.
        </Text>
        <TextInput
          style={[s.input, { height: 90, textAlignVertical: "top", paddingTop: 10 }]}
          value={ayudaMsg}
          onChangeText={setAyudaMsg}
          placeholder="Describe tu consulta..."
          placeholderTextColor={C.muted}
          multiline
        />
        <View style={[s.row, { justifyContent: "flex-end", gap: 10, marginTop: 14 }]}>
          <TouchableOpacity style={s.btnOutline} onPress={() => { setActiveModal(null); setAyudaMsg(""); }}>
            <Text style={s.btnOutlineText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.btnPrimary, sendingAyuda && { opacity: 0.6 }]}
            disabled={sendingAyuda}
            onPress={async () => {
              if (!ayudaMsg.trim()) return;
              setSendingAyuda(true);
              try {
                await supabase.from("mensajes_ayuda").insert({ user_id: userId, rol: "alumno", mensaje: ayudaMsg.trim() });
                setAyudaMsg("");
                setActiveModal(null);
                showToast("Mensaje enviado", "Te contactaremos pronto.");
              } finally {
                setSendingAyuda(false);
              }
            }}
          >
            <Text style={s.btnPrimaryText}>{sendingAyuda ? "Enviando..." : "Enviar"}</Text>
          </TouchableOpacity>
        </View>
      </ModalShell>

      {/* ── Toasts */}
      <View style={[s.toastStack, { pointerEvents: "none" } as object]}>
        {toasts.map((t) => (
          <View key={t.id} style={s.toast}>
            <View style={s.toastIcon}>
              <Ionicons name="checkmark" size={16} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.toastTitle}>{t.title}</Text>
              <Text style={s.toastDesc}>{t.desc}</Text>
            </View>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

// ─── StyleSheet ──────────────────────────────────────────────────────────────────

function createStyles(C: typeof darkTheme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },

    // Topbar
    topbar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
      backgroundColor: C.surface,
    },
    topbarTitle: { color: C.text, fontSize: 16, fontWeight: "700" },
    topbarUserChip: {
      backgroundColor: C.purpleDim,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    topbarUserName: { color: C.text, fontSize: 13, fontWeight: "700" },
    iconBtn: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
    },
    languageMenuBackdrop: {
      position: "absolute",
      top: 54,
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
      minWidth: 170,
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

    // Brand badge
    brandBadge: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: C.purple,
      alignItems: "center",
      justifyContent: "center",
    },
    brandBadgeText: { color: "#fff", fontWeight: "900", fontSize: 18 },

    // Content
    content: {
      flex: 1,
      paddingHorizontal: 16,
      paddingTop: 12,
      backgroundColor: C.bg,
    },

    // Page structure
    pageHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 16,
    },
    pageTitle: { color: C.text, fontSize: 22, fontWeight: "800" },

    // Card
    card: {
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
    },

    // Layout
    row: { flexDirection: "row", alignItems: "center" },
    row3: { flexDirection: "row", gap: 10, marginBottom: 16 },
    divider: { height: 1, backgroundColor: C.border, marginVertical: 14 },

    // Section header
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    sectionLabel: { color: C.text, fontWeight: "700", fontSize: 14 },

    // Typography
    muted: { color: C.muted, fontSize: 13 },
    body: { color: C.muted, fontSize: 14, lineHeight: 22 },
    boldText: { color: C.text, fontWeight: "700", fontSize: 14 },
    linkText: {
      color: "rgba(139,92,246,0.92)",
      fontSize: 13,
      fontWeight: "700",
    },

    // Welcome banner
    welcomeBanner: {
      backgroundColor: C.purpleDark,
      borderRadius: 18,
      padding: 20,
      marginBottom: 16,
      minHeight: 130,
      overflow: "hidden",
    },
    welcomeTitle: {
      color: "#fff",
      fontSize: 24,
      fontWeight: "800",
      letterSpacing: -0.5,
    },
    welcomeOrb: {
      position: "absolute",
      right: 16,
      top: 10,
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: "rgba(255,255,255,0.10)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.14)",
    },

    // Metric cards
    metricCard: { flex: 1, padding: 12, alignItems: "center", marginBottom: 0 },
    metricHighlight: {
      borderColor: "rgba(139,92,246,0.40)",
      shadowColor: C.purple,
      shadowOpacity: 0.2,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 0 },
      elevation: 4,
    },
    metricValue: {
      color: C.text,
      fontWeight: "900",
      fontSize: 18,
      letterSpacing: -0.5,
      marginBottom: 4,
    },
    summaryAmount: {
      color: C.text,
      fontWeight: "900",
      fontSize: 22,
      marginTop: 6,
      letterSpacing: -0.5,
    },

    // Courses on Perfil
    courseRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      padding: 16,
      backgroundColor: "rgba(139,92,246,0.08)",
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 12,
    },
    courseIcon: {
      width: 72,
      height: 60,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.purpleBorder,
      backgroundColor: "rgba(255,255,255,0.03)",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },

    // Avatars
    avatarCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: C.purpleDim,
      borderWidth: 1,
      borderColor: C.purpleBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { color: C.text, fontWeight: "900", fontSize: 15 },

    // Tables
    tableRow: {
      flexDirection: "row",
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    tableBodyRow: { backgroundColor: "transparent" },
    tableHead: {
      fontWeight: "700",
      color: C.muted,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    tableCell: { flex: 1, color: C.text, fontSize: 13, paddingHorizontal: 2 },

    // Forms
    field: { marginBottom: 12 },
    fieldLabel: {
      color: C.muted,
      fontSize: 11,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    input: {
      backgroundColor: "rgba(255,255,255,0.06)",
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 11,
      color: C.text,
      fontSize: 14,
    },

    // Search box
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "rgba(255,255,255,0.06)",
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginBottom: 16,
    },

    // Accordion
    accBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 16,
    },
    accPanel: { paddingHorizontal: 16, paddingBottom: 16 },

    // Buttons
    btnPrimary: {
      backgroundColor: C.purple,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
    btnOutline: {
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 18,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: "rgba(255,255,255,0.04)",
    },
    btnOutlineText: { color: C.text, fontWeight: "600", fontSize: 14 },
    btnDanger: {
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 18,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: C.dangerBorder,
      backgroundColor: C.dangerBg,
    },
    btnDangerText: { color: C.danger, fontWeight: "700", fontSize: 14 },

    // Bottom navigation
    bottomNav: {
      flexDirection: "row",
      backgroundColor: C.surface,
      borderTopWidth: 1,
      borderTopColor: C.border,
      paddingBottom: Platform.OS === "ios" ? 16 : 8,
      paddingTop: 8,
    },
    bottomNavItem: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 3,
    },
    bottomNavLabel: { color: C.muted, fontSize: 10, fontWeight: "600" },

    // Drawer
    drawerOverlay: { flex: 1, flexDirection: "row" },
    drawer: {
      width: 280,
      backgroundColor: C.surface,
      borderRightWidth: 1,
      borderRightColor: C.border,
      paddingTop: Platform.OS === "ios" ? 50 : 30,
      paddingBottom: 20,
    },
    drawerHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingBottom: 20,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
      marginBottom: 8,
    },
    drawerBrand: { color: C.text, fontWeight: "900", fontSize: 16 },
    drawerBrandSub: { color: C.muted, fontSize: 11 },
    drawerItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 13,
      paddingHorizontal: 20,
      borderRadius: 10,
      marginHorizontal: 8,
      marginVertical: 1,
    },
    drawerItemActive: { backgroundColor: C.purpleDim },
    drawerItemText: { color: C.muted, fontSize: 14, fontWeight: "500" },
    drawerFooter: {
      paddingHorizontal: 20,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: C.border,
    },

    // Modals
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.7)",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
    },
    modalDialog: {
      backgroundColor: C.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: C.border,
      width: "100%",
      maxWidth: 480,
    },
    modalHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    modalTitle: { color: C.text, fontWeight: "700", fontSize: 16 },
    modalBody: { padding: 20 },

    // Toasts
    toastStack: {
      position: "absolute",
      bottom: 90,
      right: 16,
      left: 16,
      gap: 8,
    },
    toast: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: C.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
      padding: 14,
      shadowColor: "#000",
      shadowOpacity: 0.4,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    toastIcon: {
      width: 30,
      height: 30,
      borderRadius: 8,
      backgroundColor: C.purple,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    toastTitle: { color: C.text, fontWeight: "700", fontSize: 13 },
    toastDesc: { color: C.muted, fontSize: 12, marginTop: 2 },

    // New component styles
    empresaLogo: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: C.purpleDim,
      borderWidth: 1,
      borderColor: C.purpleBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeChip: {
      backgroundColor: C.purpleDim,
      borderRadius: 99,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: C.purpleBorder,
    },
    badgeChipText: {
      color: "rgba(167,139,250,1)",
      fontSize: 11,
      fontWeight: "700" as const,
    },
    pendingBadge: {
      backgroundColor: "rgba(245,158,11,0.10)",
      borderRadius: 99,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderWidth: 1,
      borderColor: "rgba(245,158,11,0.30)",
    },
    pendingBadgeText: {
      color: "#f59e0b",
      fontSize: 11,
      fontWeight: "700" as const,
    },
    feedIconBox: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: C.purpleDim,
      borderWidth: 1,
      borderColor: C.border,
      alignItems: "center",
      justifyContent: "center",
    },
    tabChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 99,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: "rgba(255,255,255,0.04)",
    },
    tabChipActive: {
      backgroundColor: C.purpleDim,
      borderColor: C.purpleBorder,
    },
    tabChipText: { color: C.muted, fontSize: 13, fontWeight: "600" as const },
    tabChipTextActive: { color: C.purple, fontWeight: "700" as const },
    tagChip: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 99,
      backgroundColor: "rgba(255,255,255,0.06)",
      borderWidth: 1,
      borderColor: C.border,
    },
    tagChipText: { color: C.muted, fontSize: 11, fontWeight: "600" as const },
    inPageTabBar: {
      flexDirection: "row" as const,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
      marginBottom: 12,
    },
    inPageTab: {
      flex: 1,
      paddingVertical: 12,
      alignItems: "center" as const,
      borderBottomWidth: 2,
      borderBottomColor: "transparent",
    },
    inPageTabActive: { borderBottomColor: C.purple },
    inPageTabText: { color: C.muted, fontSize: 14, fontWeight: "600" as const },
    inPageTabTextActive: { color: C.purple, fontWeight: "700" as const },
    profileHeader: {
      alignItems: "center" as const,
      paddingVertical: 20,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
      marginBottom: 16,
    },
    profileAvatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: C.purpleDark,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderWidth: 3,
      borderColor: C.purpleBorder,
      marginBottom: 12,
    },
    profileAvatarText: {
      color: "#fff",
      fontSize: 28,
      fontWeight: "900" as const,
    },
    profileName: { color: C.text, fontSize: 20, fontWeight: "800" as const },
    profileSection: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.card,
      marginBottom: 10,
    },
  });
}
