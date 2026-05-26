/**
 * dashboard-joventalento.tsx
 * Portal Joven Talento — React Native (Expo)
 *
 * Bottom nav: Home · Mis Proyectos · Pagos · Mi Perfil
 * Sub-vistas: Configuración (desde Mi Perfil)
 *             Ayuda (desde Configuración)
 *             Acerca de Gradly (desde Configuración)
 */

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
    Alert,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Switch,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import TranslatedText from "../components/TranslatedText";
import { supabase } from "../lib/supabase";
import {
    pickAndUploadImage,
    updateProfilePhoto,
} from "../services/storageService";
import ProfileViewerModal from "../src/components/ProfileViewerModal";
import UniversalHeader from "../src/components/UniversalHeader";
import { useThemeContext } from "../src/context/ThemeContext";
import { useTranslationContext } from "../src/context/TranslationContext";
import handleLogout from "../src/services/authService";

const Text = TranslatedText;

// ─── Types ────────────────────────────────────────────────────────────────────

type Page = "home" | "proyectos" | "pagos" | "perfil";
type SubPage = "config" | "ayuda" | "acercade" | null;
type ServiceStatus = "activo" | "pausado" | "borrador";
type ServiceModalStep = 1 | 2 | 3;

type VacanteDB = {
  id: string;
  empresa_id: string;
  titulo: string;
  area: string | null;
  ubicacion: string | null;
  departamento: string | null;
  modalidad: "Remoto" | "Presencial" | "Hibrido" | null;
  requisitos: string[] | null;
  empresa: { nombre: string; logo: string | null } | null;
};

type ServicioRow = {
  id: string;
  titulo: string;
  categoria: string | null;
  modalidad: "Remoto" | "Presencial" | "Hibrido";
  precio: number;
  calificacion: number;
  contratos: number;
  estado: ServiceStatus;
};

// ─── Static data ──────────────────────────────────────────────────────────────

const DEPARTAMENTOS = [
  "Ahuachapan",
  "Cabanas",
  "Chalatenango",
  "Cuscatlan",
  "La Libertad",
  "La Paz",
  "La Union",
  "Morazan",
  "San Miguel",
  "San Salvador",
  "San Vicente",
  "Santa Ana",
  "Sonsonate",
  "Usulutan",
];


const FAQ_ITEMS = [
  {
    q: "Gradly es gratuito para los jovenes talentos?",
    a: "Si, completamente gratuito. Los jovenes talentos pueden registrarse, crear su perfil, subir proyectos y aplicar a vacantes sin ningun costo.",
  },
  {
    q: "Como funciona la validacion de horas sociales?",
    a: "Las universidades aliadas se integran con Gradly para registrar y validar las horas sociales. Al completar un proyecto, la empresa confirma las horas y el sistema genera un certificado digital.",
  },
  {
    q: "Como se procesan los pagos a freelancers?",
    a: "Los pagos se procesan a traves de pasarelas seguras. Los fondos se retienen en custodia hasta que el cliente aprueba el trabajo. Comision Gradly: 5%.",
  },
  {
    q: "Puedo postular a varias vacantes al mismo tiempo?",
    a: "Si, no hay limite de aplicaciones simultaneas. Desde tu panel puedes hacer seguimiento del estado de cada aplicacion en tiempo real.",
  },
  {
    q: "Como se protegen mis datos personales?",
    a: "Gradly cumple con la Ley de Proteccion de Datos Personales de El Salvador. Todos los datos se almacenan encriptados y nunca se venden a terceros.",
  },
  {
    q: "Las universidades pueden ver el perfil de sus estudiantes?",
    a: "Solo con permiso explicito del estudiante. Tu controlas que informacion comparten con tu institucion educativa.",
  },
  {
    q: "Que documentos necesita mi empresa para registrarse?",
    a: "NRC, correo corporativo y nombre del representante legal. El proceso de verificacion tarda 24-48 horas habiles.",
  },
  {
    q: "Gradly esta disponible fuera de El Salvador?",
    a: "Actualmente opera principalmente en El Salvador, con planes de expansion a Guatemala, Honduras y Costa Rica para el segundo semestre de 2026.",
  },
];

const TEAM = [
  {
    icon: "L",
    name: "Lindsay Jazmin Coto Marroquin",
    role: "Frontend Developer & UX Lead",
    carrera: "Ingenieria en Sistemas, UDB",
  },
  {
    icon: "D",
    name: "Diego Josue Chavez Lopez",
    role: "Backend Developer & Arquitecto",
    carrera: "Ingenieria en Sistemas, UDB",
  },
  {
    icon: "A",
    name: "Ashlyn Lisseth Escobar Arana",
    role: "UI/UX Designer & Product",
    carrera: "Ingenieria en Sistemas, UDB",
  },
  {
    icon: "N",
    name: "Nathalia Guadalupe Guevara Zelaya",
    role: "Project Manager & QA Lead",
    carrera: "Ingenieria en Sistemas, UDB",
  },
];

const TECH_STACK = [
  {
    icon: "RN",
    name: "React Native",
    desc: "Framework principal para la app movil.",
    badge: "Mobile",
  },
  {
    icon: "EX",
    name: "Expo",
    desc: "Toolchain para desarrollo y distribucion.",
    badge: "Build Tool",
  },
  {
    icon: "TS",
    name: "TypeScript",
    desc: "Tipado estatico para mayor robustez.",
    badge: "Lenguaje",
  },
  {
    icon: "SB",
    name: "Supabase",
    desc: "Backend as a Service con PostgreSQL.",
    badge: "Backend",
  },
  {
    icon: "JS",
    name: "JavaScript",
    desc: "Logica del cliente e integraciones.",
    badge: "Logica",
  },
  {
    icon: "HT",
    name: "HTML5 / CSS3",
    desc: "Base de la interfaz web complementaria.",
    badge: "Web",
  },
  {
    icon: "IT",
    name: "Inter Tight",
    desc: "Tipografia clara y moderna.",
    badge: "Tipografia",
  },
  {
    icon: "NP",
    name: "npm",
    desc: "Gestion de paquetes y dependencias.",
    badge: "Paquetes",
  },
];

const STOPWORDS = new Set([
  "a",
  "al",
  "ante",
  "bajo",
  "con",
  "de",
  "del",
  "desde",
  "en",
  "entre",
  "hacia",
  "para",
  "por",
  "sin",
  "sobre",
  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
  "y",
  "o",
  "e",
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalize(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildTokens(q: string): string[] {
  return normalize(q)
    .split(" ")
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function matchesVacante(v: VacanteDB, tokens: string[], dep: string): boolean {
  const okDep = dep === "" || !v.departamento || v.departamento === dep;
  const hay = normalize(
    `${v.titulo} ${v.area ?? ""} ${v.empresa?.nombre ?? ""} ${v.ubicacion ?? ""}`,
  );
  const okSearch = tokens.length === 0 || tokens.every((t) => hay.includes(t));
  return okDep && okSearch;
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const darkTheme = {
  bg: "#07050f",
  surface: "#0d0b1e",
  card: "rgba(255,255,255,0.04)",
  border: "rgba(139,92,246,0.18)",
  purple: "#8b5cf6",
  purpleDark: "#7c3aed",
  purpleDim: "rgba(139,92,246,0.12)",
  purpleBorder: "rgba(139,92,246,0.30)",
  text: "#f4f1ff",
  muted: "rgba(255,255,255,0.55)",
  danger: "#ef4444",
  green: "#27ae60",
  greenBright: "#5eaf73",
  greenBg: "rgba(94,175,115,0.10)",
  greenBorder: "rgba(94,175,115,0.25)",
  yellow: "#f39c12",
  orange: "#e67e22",
  orangeBg: "rgba(230,126,34,0.12)",
  orangeBorder: "rgba(230,126,34,0.30)",
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
  green: "#15803d",
  greenBright: "#5eaf73",
  greenBg: "rgba(94,175,115,0.10)",
  greenBorder: "rgba(94,175,115,0.25)",
  yellow: "#b45309",
  orange: "#c05621",
  orangeBg: "rgba(230,126,34,0.12)",
  orangeBorder: "rgba(230,126,34,0.30)",
};

let C = darkTheme;
let st = createStyles(C);

// ─── Bottom nav config ────────────────────────────────────────────────────────

const BOTTOM_NAV: {
  key: Page;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "home", label: "Home", icon: "home-outline" },
  { key: "proyectos", label: "Proyectos", icon: "folder-outline" },
  { key: "pagos", label: "Pagos", icon: "card-outline" },
  { key: "perfil", label: "Mi Perfil", icon: "person-outline" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  return <View style={[st.card, style]}>{children}</View>;
}
function Kicker({ text }: { text: string }) {
  return <Text style={st.kicker}>{text}</Text>;
}
function SectionTitle({ text }: { text: string }) {
  return <Text style={st.sectionTitle}>{text}</Text>;
}
function BtnPrimary({
  label,
  onPress,
  style,
  small,
}: {
  label: string;
  onPress?: () => void;
  style?: object;
  small?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[st.btnPrimary, small && st.btnSm, style]}
    >
      <Text style={[st.btnPrimaryText, small && { fontSize: 12 }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
function BtnOutline({
  label,
  onPress,
  style,
  small,
  disabled,
}: {
  label: string;
  onPress?: () => void;
  style?: object;
  small?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        st.btnOutline,
        small && st.btnSm,
        disabled && st.btnDisabled,
        style,
      ]}
      disabled={disabled}
    >
      <Text style={[st.btnOutlineText, small && { fontSize: 12 }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad" | "numeric" | "url";
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={st.inputLabel}>{label}</Text>
      <TextInput
        style={st.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType ?? "default"}
      />
    </View>
  );
}
function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={st.toggleRow}>
      <Text style={st.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: "rgba(255,255,255,0.10)", true: C.purpleDark }}
        thumbColor={value ? C.purple : C.muted}
      />
    </View>
  );
}
function Divider() {
  return (
    <View
      style={{ height: 1, backgroundColor: C.border, marginVertical: 14 }}
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DashboardJovenTalento() {
  const [activePage, setActivePage] = useState<Page>("home");
  const [subPage, setSubPage] = useState<SubPage>(null);
  const [busqueda, setBusqueda] = useState("");
  const [departamento, setDepartamento] = useState("");
  const [showDepPicker, setShowDepPicker] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [services, setServices] = useState<ServicioRow[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [serviceStep, setServiceStep] = useState<ServiceModalStep>(1);
  const [svcTitle, setSvcTitle] = useState("");
  const [svcCategory, setSvcCategory] = useState("");
  const [svcDesc, setSvcDesc] = useState("");
  const [svcPrice, setSvcPrice] = useState("");
  const [svcModality, setSvcModality] = useState<
    "Remoto" | "Presencial" | "Hibrido"
  >("Remoto");
  const [svcHabilidades, setSvcHabilidades] = useState("");
  const [svcEntrega, setSvcEntrega] = useState("");
  const [talentoNombre, setTalentoNombre] = useState("John Doe");
  const [talentoHeadline, setTalentoHeadline] = useState(
    "Ingenieria en Sistemas - UDB",
  );
  const [cfgNombre, setCfgNombre] = useState("John Doe");
  const [cfgEmail, setCfgEmail] = useState("jdoe@uni.edu.sv");
  const [cfgTel, setCfgTel] = useState("+503 7000-0000");
  const [cfgPwdActual, setCfgPwdActual] = useState("");
  const [cfgPwdNew, setCfgPwdNew] = useState("");
  const [cfgPwdConfirm, setCfgPwdConfirm] = useState("");
  const [notif1, setNotif1] = useState(true);
  const [notif2, setNotif2] = useState(true);
  const [notif3, setNotif3] = useState(false);
  const [notif4, setNotif4] = useState(true);
  const [contactNombre, setContactNombre] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactMensaje, setContactMensaje] = useState("");
  const [contactSent, setContactSent] = useState(false);
  const router = useRouter();
  const { language } = useTranslationContext();
  const { isDark } = useThemeContext();
  C = isDark ? darkTheme : lightTheme;
  st = createStyles(C);

  const navigate = (page: Page) => {
    setActivePage(page);
    setSubPage(null);
  };

  const [profileViewerVisible, setProfileViewerVisible] = useState(false);
  const [profileUserId, setProfileUserId] = useState("");
  const [profileUserType, setProfileUserType] = useState<
    "talento" | "empresa" | "universidad"
  >("empresa");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [vacantes, setVacantes] = useState<VacanteDB[]>([]);
  const [loadingVacantes, setLoadingVacantes] = useState(true);
  const [agendaCounts, setAgendaCounts] = useState({ postulaciones: 0, horasSociales: 0 });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setCurrentUserId(data.user.id);
        supabase
          .from("talentos")
          .select(
            "foto_perfil, nombre, email, telefono, universidad, area, ciudad, departamento",
          )
          .eq("id", data.user.id)
          .single()
          .then(({ data: t }) => {
            if (!t) return;
            if (t.foto_perfil) setProfilePhotoUrl(t.foto_perfil);
            if (t.nombre) {
              setTalentoNombre(t.nombre);
              setCfgNombre(t.nombre);
            }
            const headlineParts = [t.area, t.universidad].filter(Boolean);
            if (headlineParts.length)
              setTalentoHeadline(headlineParts.join(" - "));
            if (t.email) setCfgEmail(t.email);
            if (t.telefono) setCfgTel(t.telefono);
          });
      }
    });
  }, []);

  // Fetch active vacantes from Supabase
  useEffect(() => {
    (async () => {
      setLoadingVacantes(true);
      const { data } = await supabase
        .from("vacantes")
        .select(
          "id, empresa_id, titulo, area, ubicacion, departamento, modalidad, requisitos, empresas(nombre, logo)",
        )
        .eq("estado", "activa")
        .order("created_at", { ascending: false });
      setVacantes(
        (data ?? []).map((v: any) => ({ ...v, empresa: v.empresas ?? null })),
      );
      setLoadingVacantes(false);
    })();
  }, []);

  // Fetch services and agenda counts once user is known
  useEffect(() => {
    if (!currentUserId) return;
    (async () => {
      setLoadingServices(true);
      const { data: svcs } = await supabase
        .from("servicios")
        .select(
          "id, titulo, categoria, modalidad, precio, calificacion, contratos, estado",
        )
        .eq("talento_id", currentUserId)
        .order("created_at", { ascending: false });
      setServices(
        (svcs ?? []).map((s: any) => ({
          id: s.id,
          titulo: s.titulo,
          categoria: s.categoria ?? null,
          modalidad: s.modalidad ?? "Remoto",
          precio: s.precio ?? 0,
          calificacion: s.calificacion ?? 0,
          contratos: s.contratos ?? 0,
          estado: s.estado ?? "borrador",
        })),
      );
      setLoadingServices(false);

      const [{ count: postCount }, { count: horasCount }] = await Promise.all([
        supabase
          .from("aplicaciones")
          .select("*", { count: "exact", head: true })
          .eq("solicitante_id", currentUserId)
          .in("estado", ["pendiente", "revision"]),
        supabase
          .from("solicitudes_horas")
          .select("*", { count: "exact", head: true })
          .eq("alumno_id", currentUserId)
          .eq("estado", "aprobada"),
      ]);
      setAgendaCounts({
        postulaciones: postCount ?? 0,
        horasSociales: horasCount ?? 0,
      });
    })();
  }, [currentUserId]);

  const openProfileViewer = (
    userId: string,
    userType: "talento" | "empresa" | "universidad",
  ) => {
    setProfileUserId(userId);
    setProfileUserType(userType);
    setProfileViewerVisible(true);
  };

  const tokens = useMemo(() => buildTokens(busqueda), [busqueda]);
  const filteredVacantes = useMemo(
    () => vacantes.filter((v) => matchesVacante(v, tokens, departamento)),
    [vacantes, tokens, departamento],
  );

  const searchSuggestions = useMemo(() => {
    if (!busqueda.trim()) return [];
    return filteredVacantes
      .map((v) => `${v.titulo} · ${v.empresa?.nombre ?? ""}`)
      .filter((value, index, self) => self.indexOf(value) === index)
      .slice(0, 4);
  }, [busqueda, filteredVacantes]);

  const handleSuggestionPress = (suggestion: string) => {
    setBusqueda(suggestion);
    const titulo = suggestion.split("·")[0]?.trim() ?? "";
    const match = vacantes.find((v) => v.titulo === titulo);
    if (match) openProfileViewer(match.empresa_id, "empresa");
  };

  const resetServiceForm = () => {
    setSvcTitle("");
    setSvcCategory("");
    setSvcDesc("");
    setSvcPrice("");
    setSvcModality("Remoto");
    setSvcHabilidades("");
    setSvcEntrega("");
    setServiceStep(1);
  };

  const handlePublishService = async () => {
    if (!svcTitle.trim() || !svcPrice) {
      Alert.alert("Error", "Completa el titulo y el precio.");
      return;
    }
    if (!currentUserId) return;
    const { data, error } = await supabase
      .from("servicios")
      .insert({
        talento_id: currentUserId,
        titulo: svcTitle,
        categoria: svcCategory || "General",
        descripcion: svcDesc,
        modalidad: svcModality,
        precio: parseFloat(svcPrice) || 0,
        habilidades: svcHabilidades,
        entrega_dias: parseInt(svcEntrega) || null,
        estado: "borrador",
      })
      .select()
      .single();
    if (error) {
      Alert.alert("Error", "No se pudo guardar el servicio.");
      return;
    }
    const ns: ServicioRow = {
      id: data.id,
      titulo: data.titulo,
      categoria: data.categoria ?? null,
      modalidad: data.modalidad ?? svcModality,
      precio: data.precio ?? 0,
      calificacion: 0,
      contratos: 0,
      estado: "borrador",
    };
    setServices((prev) => [ns, ...prev]);
    setShowServiceModal(false);
    resetServiceForm();
    Alert.alert("Servicio creado", "Tu servicio fue guardado como borrador.");
  };

  const toggleServiceStatus = async (id: string) => {
    const svc = services.find((s) => s.id === id);
    if (!svc) return;
    const newEstado: ServiceStatus =
      svc.estado === "activo" ? "pausado" : "activo";
    await supabase.from("servicios").update({ estado: newEstado }).eq("id", id);
    setServices((prev) =>
      prev.map((s) => (s.id === id ? { ...s, estado: newEstado } : s)),
    );
  };

  const deleteService = (id: string) => {
    Alert.alert("Eliminar servicio", "Esta accion no se puede deshacer.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          await supabase.from("servicios").delete().eq("id", id);
          setServices((prev) => prev.filter((s) => s.id !== id));
        },
      },
    ]);
  };

  const handleContactSend = () => {
    if (
      !contactNombre.trim() ||
      !contactEmail.trim() ||
      !contactMensaje.trim()
    ) {
      Alert.alert("Error", "Completa todos los campos.");
      return;
    }
    setContactSent(true);
    setTimeout(() => {
      setContactSent(false);
      setContactNombre("");
      setContactEmail("");
      setContactMensaje("");
    }, 3500);
  };

  // ── AYUDA ─────────────────────────────────────────────────────────────────
  const renderAyuda = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={st.sectionContent}
    >
      <TouchableOpacity
        onPress={() => setSubPage("config")}
        style={{ marginBottom: 16 }}
      >
        <Text style={st.backLink}>{"<"} Configuracion</Text>
      </TouchableOpacity>
      <Kicker text="Centro de ayuda" />
      <SectionTitle text="En que podemos ayudarte?" />
      <Text style={[st.muted, { marginBottom: 20 }]}>
        Te respondemos en menos de 24 horas habiles.
      </Text>
      <Card style={{ marginBottom: 16 }}>
        <Text style={[st.subsectionTitle, { marginBottom: 14 }]}>
          Informacion de contacto
        </Text>
        {[
          {
            icon: "mail-outline" as keyof typeof Ionicons.glyphMap,
            label: "Correo electronico",
            value: "hola@gradly.sv",
          },
          {
            icon: "phone-portrait-outline" as keyof typeof Ionicons.glyphMap,
            label: "WhatsApp",
            value: "+503 7000-0000",
          },
          {
            icon: "location-outline" as keyof typeof Ionicons.glyphMap,
            label: "Ubicacion",
            value: "Universidad Don Bosco, Soyapango, El Salvador",
          },
          {
            icon: "time-outline" as keyof typeof Ionicons.glyphMap,
            label: "Horario",
            value: "Lunes a Viernes, 08:00 - 17:00",
          },
        ].map((ci) => (
          <View key={ci.label} style={st.contactItem}>
            <View style={st.contactIconBox}>
              <Ionicons name={ci.icon} size={18} color={C.purple} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.contactLabel}>{ci.label}</Text>
              <Text style={st.contactValue}>{ci.value}</Text>
            </View>
          </View>
        ))}
      </Card>
      <Card style={{ marginBottom: 16 }}>
        <Text style={[st.subsectionTitle, { marginBottom: 14 }]}>
          Enviar mensaje
        </Text>
        {contactSent ? (
          <View
            style={[
              st.badge,
              {
                backgroundColor: C.greenBg,
                borderColor: C.greenBorder,
                padding: 16,
                alignItems: "center",
              },
            ]}
          >
            <Text style={{ color: C.greenBright, fontWeight: "700" }}>
              Mensaje enviado. Gracias por escribirnos!
            </Text>
          </View>
        ) : (
          <>
            <InputField
              label="Nombre completo"
              value={contactNombre}
              onChangeText={setContactNombre}
              placeholder="Tu nombre"
            />
            <InputField
              label="Correo electronico"
              value={contactEmail}
              onChangeText={setContactEmail}
              placeholder="tu@correo.com"
              keyboardType="email-address"
            />
            <View style={{ marginBottom: 14 }}>
              <Text style={st.inputLabel}>Mensaje</Text>
              <TextInput
                style={[st.input, { height: 100, textAlignVertical: "top" }]}
                value={contactMensaje}
                onChangeText={setContactMensaje}
                placeholder="En que podemos ayudarte?"
                placeholderTextColor={C.muted}
                multiline
              />
            </View>
            <BtnPrimary label="Enviar mensaje" onPress={handleContactSend} />
          </>
        )}
      </Card>
      <Text style={[st.subsectionTitle, { marginBottom: 12 }]}>
        Preguntas frecuentes
      </Text>
      {FAQ_ITEMS.map((item, i) => (
        <TouchableOpacity
          key={i}
          style={[st.card, { marginBottom: 8 }]}
          onPress={() => setOpenFaq(openFaq === i ? null : i)}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text style={[st.contactValue, { flex: 1, fontSize: 14 }]}>
              {item.q}
            </Text>
            <Ionicons
              name={
                openFaq === i ? "chevron-up-outline" : "chevron-down-outline"
              }
              size={18}
              color={C.purple}
              style={{ marginLeft: 8 }}
            />
          </View>
          {openFaq === i && (
            <Text style={[st.muted, { marginTop: 10, lineHeight: 20 }]}>
              {item.a}
            </Text>
          )}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  // ── ACERCA DE ─────────────────────────────────────────────────────────────
  const renderAcercaDe = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={st.sectionContent}
    >
      <TouchableOpacity
        onPress={() => setSubPage("config")}
        style={{ marginBottom: 16 }}
      >
        <Text style={st.backLink}>{"<"} Configuracion</Text>
      </TouchableOpacity>
      <View style={st.acercaHero}>
        <View style={st.acercaOrb} />
        <Kicker text="Acerca de Gradly" />
        <Text style={[st.sectionTitle, { textAlign: "center", fontSize: 20 }]}>
          La plataforma que conecta talento con oportunidades
        </Text>
        <Text style={[st.muted, { textAlign: "center", marginTop: 8 }]}>
          Nacio en El Salvador para cerrar la brecha entre jovenes talentos,
          universidades y empresas.
        </Text>
      </View>
      <Card style={{ marginBottom: 16 }}>
        <Text
          style={[
            st.contactValue,
            { fontWeight: "700", color: C.purple, marginBottom: 4 },
          ]}
        >
          Mision
        </Text>
        <Text style={[st.muted, { marginBottom: 12 }]}>
          Democratizar el acceso al empleo profesional para los jovenes talentos
          de America Latina.
        </Text>
        <Divider />
        <Text
          style={[
            st.contactValue,
            { fontWeight: "700", color: C.purple, marginBottom: 4 },
          ]}
        >
          Vision
        </Text>
        <Text style={[st.muted, { marginBottom: 12 }]}>
          Ser el ecosistema profesional de referencia en America Latina para
          2030, conectando a mas de 1 millon de talentos.
        </Text>
        <Divider />
        <Text
          style={[
            st.contactValue,
            { fontWeight: "700", color: C.purple, marginBottom: 4 },
          ]}
        >
          Mercado objetivo
        </Text>
        <Text style={st.muted}>
          Jovenes de 18 a 30 anos en El Salvador, Guatemala, Honduras y Costa
          Rica.
        </Text>
      </Card>
      <Kicker text="Caracteristicas" />
      <View style={st.grid2}>
        {[
          {
            icon: "target",
            title: "Matching Inteligente",
            desc: "Conecta talentos con vacantes por habilidades y ubicacion.",
          },
          {
            icon: "shield",
            title: "Perfiles Verificados",
            desc: "Validacion con universidades aliadas.",
          },
          {
            icon: "chart",
            title: "Analytics en Tiempo Real",
            desc: "Metricas de insercion laboral y rendimiento.",
          },
          {
            icon: "globe",
            title: "Alcance Regional",
            desc: "Escalable a toda Centroamerica.",
          },
          {
            icon: "chat",
            title: "Mensajeria Integrada",
            desc: "Comunicacion directa entre talentos y empresas.",
          },
          {
            icon: "cert",
            title: "Certificaciones Digitales",
            desc: "Certificados verificables de horas sociales.",
          },
        ].map((f) => (
          <Card
            key={f.title}
            style={[st.featureCard, { flex: 1, minWidth: "45%" }]}
          >
            <Ionicons
              name="checkmark-circle-outline"
              size={28}
              color={C.purple}
              style={{ marginBottom: 8 }}
            />
            <Text
              style={[st.contactValue, { fontWeight: "700", marginBottom: 4 }]}
            >
              {f.title}
            </Text>
            <Text style={[st.muted, { fontSize: 12 }]}>{f.desc}</Text>
          </Card>
        ))}
      </View>
      <View style={[st.grid2, { marginBottom: 20 }]}>
        {[
          { num: "500+", label: "Empresas" },
          { num: "10K+", label: "Talentos" },
          { num: "80+", label: "Universidades" },
          { num: "247", label: "Vacantes" },
        ].map((s) => (
          <Card
            key={s.label}
            style={{ alignItems: "center", paddingVertical: 20, flex: 1 }}
          >
            <Text style={st.statNum}>{s.num}</Text>
            <Text style={st.muted}>{s.label}</Text>
          </Card>
        ))}
      </View>
      <Kicker text="El equipo" />
      <Text style={[st.sectionTitle, { fontSize: 18, marginBottom: 4 }]}>
        El equipo detras de Gradly
      </Text>
      <Text style={[st.muted, { marginBottom: 16 }]}>
        Desarrollado por estudiantes de la Universidad Don Bosco, El Salvador
      </Text>
      {TEAM.map((tm) => (
        <Card
          key={tm.name}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            marginBottom: 10,
          }}
        >
          <View style={st.teamAvatar}>
            <Text style={{ color: C.purple, fontWeight: "900", fontSize: 20 }}>
              {tm.icon}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[st.contactValue, { fontWeight: "700" }]}>
              {tm.name}
            </Text>
            <Text style={[st.muted, { fontSize: 13 }]}>{tm.role}</Text>
            <Text style={[st.muted, { fontSize: 12 }]}>{tm.carrera}</Text>
          </View>
        </Card>
      ))}
      <Kicker text="Stack tecnologico" />
      <View style={st.grid2}>
        {TECH_STACK.map((t) => (
          <Card
            key={t.name}
            style={{
              alignItems: "center",
              paddingVertical: 16,
              flex: 1,
              minWidth: "45%",
            }}
          >
            <View style={[st.teamAvatar, { marginBottom: 8 }]}>
              <Text
                style={{ color: C.purple, fontWeight: "900", fontSize: 14 }}
              >
                {t.icon}
              </Text>
            </View>
            <Text
              style={[
                st.contactValue,
                { fontWeight: "700", fontSize: 13, marginBottom: 4 },
              ]}
            >
              {t.name}
            </Text>
            <Text
              style={[
                st.muted,
                { fontSize: 11, textAlign: "center", marginBottom: 8 },
              ]}
            >
              {t.desc}
            </Text>
            <View style={st.techBadge}>
              <Text style={st.techBadgeText}>{t.badge}</Text>
            </View>
          </Card>
        ))}
      </View>
    </ScrollView>
  );

  // ── CONFIGURACION ─────────────────────────────────────────────────────────
  const renderConfig = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={st.sectionContent}
    >
      <TouchableOpacity
        onPress={() => setSubPage(null)}
        style={{ marginBottom: 16 }}
      >
        <Text style={st.backLink}>{"<"} Mi Perfil</Text>
      </TouchableOpacity>
      <Kicker text="Preferencias" />
      <SectionTitle text="Configuracion" />
      <Card style={{ marginBottom: 16 }}>
        <Text style={[st.subsectionTitle, { marginBottom: 16 }]}>
          Datos personales
        </Text>
        <InputField
          label="Nombre completo"
          value={cfgNombre}
          onChangeText={setCfgNombre}
        />
        <InputField
          label="Correo electronico"
          value={cfgEmail}
          onChangeText={setCfgEmail}
          keyboardType="email-address"
        />
        <InputField
          label="Telefono"
          value={cfgTel}
          onChangeText={setCfgTel}
          keyboardType="phone-pad"
        />
        <BtnPrimary
          label="Guardar cambios"
          onPress={async () => {
            if (!currentUserId) return;
            const { error } = await supabase
              .from("talentos")
              .update({ nombre: cfgNombre, telefono: cfgTel })
              .eq("id", currentUserId);
            if (error) Alert.alert("Error", "No se pudieron guardar los cambios.");
            else {
              setTalentoNombre(cfgNombre);
              Alert.alert("Guardado", "Datos actualizados.");
            }
          }}
          style={{ marginTop: 6 }}
        />
      </Card>
      <Card style={{ marginBottom: 16 }}>
        <Text style={[st.subsectionTitle, { marginBottom: 16 }]}>
          Seguridad
        </Text>
        <InputField
          label="Contrasena actual"
          value={cfgPwdActual}
          onChangeText={setCfgPwdActual}
          secureTextEntry
          placeholder="........"
        />
        <InputField
          label="Nueva contrasena"
          value={cfgPwdNew}
          onChangeText={setCfgPwdNew}
          secureTextEntry
          placeholder="........"
        />
        <InputField
          label="Confirmar contrasena"
          value={cfgPwdConfirm}
          onChangeText={setCfgPwdConfirm}
          secureTextEntry
          placeholder="........"
        />
        <BtnPrimary
          label="Cambiar contrasena"
          onPress={async () => {
            if (!cfgPwdNew || cfgPwdNew !== cfgPwdConfirm) {
              Alert.alert("Error", "Las contrasenas no coinciden.");
              return;
            }
            const { error } = await supabase.auth.updateUser({
              password: cfgPwdNew,
            });
            if (error) Alert.alert("Error", error.message);
            else {
              setCfgPwdActual("");
              setCfgPwdNew("");
              setCfgPwdConfirm("");
              Alert.alert("Actualizado", "Contrasena cambiada exitosamente.");
            }
          }}
          style={{ marginTop: 6 }}
        />
      </Card>
      <Card style={{ marginBottom: 16 }}>
        <Text style={[st.subsectionTitle, { marginBottom: 16 }]}>
          Notificaciones
        </Text>
        <ToggleRow
          label="Nuevas vacantes recomendadas"
          value={notif1}
          onValueChange={setNotif1}
        />
        <ToggleRow
          label="Comentarios en mis proyectos"
          value={notif2}
          onValueChange={setNotif2}
        />
        <ToggleRow
          label="Actualizaciones de horas sociales"
          value={notif3}
          onValueChange={setNotif3}
        />
        <ToggleRow
          label="Boletines del sistema"
          value={notif4}
          onValueChange={setNotif4}
        />
      </Card>
      <Card style={{ marginBottom: 16 }}>
        <Text style={[st.subsectionTitle, { marginBottom: 16 }]}>
          Metodos de pago y retiro
        </Text>
        {[
          {
            icon: "logo-paypal" as keyof typeof Ionicons.glyphMap,
            name: "PayPal",
            status: "Configurar",
          },
          {
            icon: "business-outline" as keyof typeof Ionicons.glyphMap,
            name: "Transferencia bancaria",
            status: "Activo",
          },
          {
            icon: "card-outline" as keyof typeof Ionicons.glyphMap,
            name: "Tarjeta debito / credito",
            status: "Configurar",
          },
        ].map((pm) => (
          <View key={pm.name} style={[st.toggleRow, { paddingVertical: 12 }]}>
            <Ionicons
              name={pm.icon}
              size={20}
              color={C.muted}
              style={{ marginRight: 10 }}
            />
            <Text style={[st.toggleLabel, { flex: 1 }]}>{pm.name}</Text>
            <View
              style={[
                st.badge,
                pm.status === "Activo"
                  ? { backgroundColor: C.greenBg, borderColor: C.greenBorder }
                  : {
                      backgroundColor: C.purpleDim,
                      borderColor: C.purpleBorder,
                    },
              ]}
            >
              <Text
                style={[
                  st.badgeText,
                  { color: pm.status === "Activo" ? C.greenBright : C.purple },
                ]}
              >
                {pm.status}
              </Text>
            </View>
          </View>
        ))}
        <Text style={[st.muted, { fontSize: 11, marginTop: 8 }]}>
          Comision Gradly 5% aplicada en cada retiro.
        </Text>
      </Card>
      <Divider />
      <TouchableOpacity
        style={[st.btnOutline, { marginBottom: 12 }]}
        onPress={() => setSubPage("ayuda")}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Ionicons name="help-circle-outline" size={20} color={C.purple} />
          <Text style={[st.btnOutlineText, { flex: 1, textAlign: "left" }]}>
            Ayuda
          </Text>
          <Ionicons name="chevron-forward-outline" size={16} color={C.muted} />
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={[st.btnOutline, { marginBottom: 40 }]}
        onPress={() => setSubPage("acercade")}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Ionicons
            name="information-circle-outline"
            size={20}
            color={C.purple}
          />
          <Text style={[st.btnOutlineText, { flex: 1, textAlign: "left" }]}>
            Acerca de Gradly
          </Text>
          <Ionicons name="chevron-forward-outline" size={16} color={C.muted} />
        </View>
      </TouchableOpacity>
    </ScrollView>
  );

  // ── HOME ─────────────────────────────────────────────────────────────────
  const renderHome = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={st.sectionContent}
    >
      <View style={st.welcomeBanner}>
        <View style={st.welcomeOrb} />
        <Text style={st.welcomeTitle}>Bienvenido, {talentoNombre}!</Text>
        <Text style={[st.muted, { marginTop: 4 }]}>
          Encuentra tu proxima oportunidad laboral.
        </Text>
      </View>
      <Text style={[st.subsectionTitle, { marginBottom: 8 }]}>
        Tu agenda de hoy
      </Text>
      <Card style={[st.agendaCard, { marginBottom: 20 }]}>
        {[
          {
            icon: "mail-outline" as keyof typeof Ionicons.glyphMap,
            label: "Postulaciones",
            value:
              agendaCounts.postulaciones > 0
                ? `${agendaCounts.postulaciones} esperan respuesta`
                : "Sin pendientes",
            color: C.orange,
            badge: String(agendaCounts.postulaciones),
          },
          {
            icon: "time-outline" as keyof typeof Ionicons.glyphMap,
            label: "Horas sociales",
            value: `${agendaCounts.horasSociales} aprobadas`,
            color: C.greenBright,
            badge: "✓",
          },
          {
            icon: "briefcase-outline" as keyof typeof Ionicons.glyphMap,
            label: "Vacantes",
            value: `${vacantes.length} disponibles`,
            color: C.purple,
            badge: String(vacantes.length),
          },
        ].map((ag, i) => (
          <React.Fragment key={ag.label}>
            {i > 0 && <View style={st.agendaDivider} />}
            <TouchableOpacity style={st.agendaBlock}>
              <View
                style={[st.agendaBadge, { backgroundColor: ag.color + "22" }]}
              >
                <Text style={[st.badgeText, { color: ag.color }]}>
                  {ag.badge}
                </Text>
              </View>
              <Ionicons
                name={ag.icon}
                size={18}
                color={ag.color}
                style={{ marginBottom: 4 }}
              />
              <Text style={[st.muted, { fontSize: 11, textAlign: "center" }]}>
                {ag.label}
              </Text>
              <Text style={[st.muted, { fontSize: 10, textAlign: "center" }]}>
                {ag.value}
              </Text>
            </TouchableOpacity>
          </React.Fragment>
        ))}
      </Card>
      <Kicker text="Explorar vacantes" />
      <Card style={{ marginBottom: 16 }}>
        <View style={st.searchRow}>
          <Ionicons
            name="search-outline"
            size={18}
            color={C.muted}
            style={{ marginRight: 8 }}
          />
          <TextInput
            style={[st.input, { flex: 1, borderWidth: 0, padding: 0 }]}
            value={busqueda}
            onChangeText={setBusqueda}
            placeholder="Buscar cargo, empresa..."
            placeholderTextColor={C.muted}
          />
        </View>
        {searchSuggestions.length > 0 && (
          <View style={{ marginTop: 10, marginBottom: 6 }}>
            {searchSuggestions.map((suggestion) => (
              <TouchableOpacity
                key={suggestion}
                style={[
                  st.card,
                  {
                    padding: 10,
                    marginBottom: 8,
                    borderColor: C.border,
                  },
                ]}
                activeOpacity={0.85}
                onPress={() => handleSuggestionPress(suggestion)}
              >
                <Text style={[st.muted, { color: C.text }]}>{suggestion}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <TouchableOpacity
          style={[
            st.input,
            {
              marginTop: 10,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            },
          ]}
          onPress={() => setShowDepPicker(!showDepPicker)}
        >
          <Text style={{ color: departamento ? C.text : C.muted }}>
            {departamento || "Todos los departamentos"}
          </Text>
          <Ionicons
            name={showDepPicker ? "chevron-up-outline" : "chevron-down-outline"}
            size={16}
            color={C.muted}
          />
        </TouchableOpacity>
        {showDepPicker && (
          <ScrollView style={st.dropdownList} showsVerticalScrollIndicator>
            <TouchableOpacity
              style={st.dropdownItem}
              onPress={() => {
                setDepartamento("");
                setShowDepPicker(false);
              }}
            >
              <Text
                style={[
                  st.muted,
                  departamento === "" && { color: C.purple, fontWeight: "700" },
                ]}
              >
                Todos los departamentos
              </Text>
            </TouchableOpacity>
            {DEPARTAMENTOS.map((dep) => (
              <TouchableOpacity
                key={dep}
                style={st.dropdownItem}
                onPress={() => {
                  setDepartamento(dep);
                  setShowDepPicker(false);
                }}
              >
                <Text
                  style={[
                    st.muted,
                    departamento === dep && {
                      color: C.purple,
                      fontWeight: "700",
                    },
                  ]}
                >
                  {dep}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </Card>
      {loadingVacantes ? (
        <Card>
          <Text style={[st.muted, { textAlign: "center", padding: 20 }]}>
            Cargando vacantes...
          </Text>
        </Card>
      ) : filteredVacantes.length === 0 ? (
        <Card>
          <Text style={[st.muted, { textAlign: "center", padding: 20 }]}>
            No se encontraron vacantes para tu busqueda.
          </Text>
        </Card>
      ) : (
        filteredVacantes.map((v) => (
          <Card key={v.id} style={{ marginBottom: 12 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                marginBottom: 10,
              }}
            >
              <TouchableOpacity
                style={st.jobLogoPlaceholder}
                onPress={() => openProfileViewer(v.empresa_id, "empresa")}
              >
                {v.empresa?.logo ? (
                  <Image
                    source={{ uri: v.empresa.logo }}
                    style={{ width: 50, height: 50, borderRadius: 12 }}
                  />
                ) : (
                  <Text
                    style={{ color: "#fff", fontWeight: "700", fontSize: 18 }}
                  >
                    {(v.empresa?.nombre ?? "?").charAt(0)}
                  </Text>
                )}
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text
                  style={[st.contactValue, { fontWeight: "700", fontSize: 15 }]}
                >
                  {v.titulo}
                </Text>
                <Text style={[st.muted, { fontSize: 13 }]}>
                  {v.empresa?.nombre ?? ""}{v.ubicacion ? ` - ${v.ubicacion}` : ""}
                </Text>
                {v.area ? (
                  <Text style={[st.muted, { fontSize: 12 }]}>{v.area}</Text>
                ) : null}
              </View>
              {v.modalidad ? (
                <View
                  style={[
                    st.badge,
                    {
                      backgroundColor: C.purpleDim,
                      borderColor: C.purpleBorder,
                    },
                  ]}
                >
                  <Text style={[st.badgeText, { color: C.purple }]}>
                    {v.modalidad}
                  </Text>
                </View>
              ) : null}
            </View>
            {v.requisitos && v.requisitos.length > 0 ? (
              <>
                <Text
                  style={[
                    st.muted,
                    {
                      fontSize: 11,
                      fontWeight: "700",
                      textTransform: "uppercase",
                      marginBottom: 4,
                    },
                  ]}
                >
                  Que buscan?
                </Text>
                {v.requisitos.map((b, bi) => (
                  <Text key={bi} style={[st.muted, { fontSize: 13 }]}>
                    - {b}
                  </Text>
                ))}
              </>
            ) : null}
            <BtnPrimary
              label="Aplicar"
              style={{ marginTop: 12 }}
              onPress={async () => {
                if (!currentUserId) {
                  Alert.alert("Error", "Debes iniciar sesion.");
                  return;
                }
                const { error } = await supabase.from("aplicaciones").insert({
                  vacante_id: v.id,
                  solicitante_id: currentUserId,
                  estado: "pendiente",
                });
                if (error && error.code === "23505") {
                  Alert.alert("Ya aplicaste", `Ya tienes una postulacion activa para ${v.titulo}.`);
                } else if (error) {
                  Alert.alert("Error", "No se pudo enviar tu postulacion.");
                } else {
                  Alert.alert("Postulacion enviada", `Aplicaste a ${v.titulo} en ${v.empresa?.nombre ?? ""}.`);
                  setAgendaCounts((prev) => ({
                    ...prev,
                    postulaciones: prev.postulaciones + 1,
                  }));
                }
              }}
            />
          </Card>
        ))
      )}
      <Card style={[st.uniAnnouncementCard, { marginTop: 8 }]}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginBottom: 8,
          }}
        >
          <Ionicons name="school-outline" size={24} color={C.purple} />
          <View>
            <Text style={[st.contactValue, { fontWeight: "700" }]}>
              Aviso: Universidad Don Bosco
            </Text>
            <Text style={[st.muted, { fontSize: 12 }]}>
              Feria de Empleo 2026
            </Text>
          </View>
        </View>
        <Text style={[st.muted, { fontSize: 13, lineHeight: 20 }]}>
          La UDB invita a todos los estudiantes a la Feria de Empleo 2026. Mas
          de 30 empresas el 20 de junio. Lleva tu CV actualizado!
        </Text>
      </Card>
    </ScrollView>
  );

  // ── MIS PROYECTOS ─────────────────────────────────────────────────────────
  const renderProyectos = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={st.sectionContent}
    >
      <SectionTitle text="Mis Proyectos" />
      <Text style={[st.muted, { marginBottom: 20 }]}>
        Comparte tu trabajo y da a conocer tus habilidades.
      </Text>
      <BtnPrimary
        label="+ Crear publicacion"
        style={{ marginBottom: 20 }}
        onPress={() =>
          Alert.alert(
            "Proximamente",
            "La creacion de publicaciones estara disponible pronto.",
          )
        }
      />
      <Card style={{ marginBottom: 24 }}>
        <Text style={[st.muted, { textAlign: "center", padding: 20 }]}>
          Aun no has publicado ningun proyecto. Comparte tu primer trabajo!
        </Text>
      </Card>
      <Kicker text="Servicios" />
      <Text style={[st.sectionTitle, { fontSize: 20, marginBottom: 4 }]}>
        Mis servicios freelance
      </Text>
      <Text style={[st.muted, { marginBottom: 16 }]}>
        Publica tus servicios y encuentra clientes en Gradly.
      </Text>
      <BtnPrimary
        label="+ Publicar nuevo servicio"
        style={{ marginBottom: 20 }}
        onPress={() => setShowServiceModal(true)}
      />
      {loadingServices ? (
        <Card>
          <Text style={[st.muted, { textAlign: "center", padding: 16 }]}>
            Cargando servicios...
          </Text>
        </Card>
      ) : services.length === 0 ? (
        <Card style={{ marginBottom: 14 }}>
          <Text style={[st.muted, { textAlign: "center", padding: 16 }]}>
            Aun no tienes servicios publicados.
          </Text>
        </Card>
      ) : (
        services.map((svc) => {
          const statusColors = {
            activo: {
              bg: C.greenBg,
              border: C.greenBorder,
              color: C.greenBright,
            },
            pausado: {
              bg: C.orangeBg,
              border: C.orangeBorder,
              color: C.orange,
            },
            borrador: {
              bg: "rgba(255,255,255,0.06)",
              border: C.border,
              color: C.muted,
            },
          };
          const sc = statusColors[svc.estado];
          return (
            <Card
              key={svc.id}
              style={{ marginBottom: 14, padding: 0, overflow: "hidden" }}
            >
              <View style={st.serviceCover}>
                <Ionicons name="image-outline" size={32} color={C.muted} />
              </View>
              <View style={{ padding: 14 }}>
                <Text
                  style={[
                    st.contactValue,
                    { fontWeight: "700", fontSize: 15, marginBottom: 4 },
                  ]}
                >
                  {svc.titulo}
                </Text>
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                  {svc.categoria ? (
                    <View style={st.techBadge}>
                      <Text style={st.techBadgeText}>{svc.categoria}</Text>
                    </View>
                  ) : null}
                  <View
                    style={[st.techBadge, { backgroundColor: C.purpleDim }]}
                  >
                    <Text style={[st.techBadgeText, { color: C.purple }]}>
                      {svc.modalidad}
                    </Text>
                  </View>
                </View>
                <Text
                  style={{
                    color: C.greenBright,
                    fontWeight: "700",
                    fontSize: 16,
                    marginBottom: 6,
                  }}
                >
                  ${svc.precio.toFixed(2)}
                </Text>
                {svc.calificacion > 0 && (
                  <Text style={[st.muted, { fontSize: 13, marginBottom: 6 }]}>
                    {"★".repeat(Math.round(svc.calificacion))}{" "}
                    {svc.calificacion.toFixed(1)} - {svc.contratos}{" "}
                    contrataciones
                  </Text>
                )}
                <View
                  style={[
                    st.badge,
                    {
                      backgroundColor: sc.bg,
                      borderColor: sc.border,
                      alignSelf: "flex-start",
                      marginBottom: 12,
                    },
                  ]}
                >
                  <Text
                    style={[
                      st.badgeText,
                      { color: sc.color, textTransform: "capitalize" },
                    ]}
                  >
                    {svc.estado}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <BtnOutline
                    label="Editar"
                    small
                    onPress={() => Alert.alert("Editar", "Proximamente.")}
                  />
                  <BtnOutline
                    label={svc.estado === "activo" ? "Pausar" : "Activar"}
                    small
                    onPress={() => toggleServiceStatus(svc.id)}
                  />
                  <TouchableOpacity
                    onPress={() => deleteService(svc.id)}
                    style={st.deleteBtn}
                  >
                    <Ionicons name="trash-outline" size={18} color={C.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            </Card>
          );
        })
      )}
    </ScrollView>
  );

  // ── PAGOS ─────────────────────────────────────────────────────────────────
  const renderPagos = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={st.sectionContent}
    >
      <SectionTitle text="Pagos" />
      <Text style={[st.muted, { marginBottom: 20 }]}>
        Gestiona tus ingresos y metodos de retiro.
      </Text>
      <View style={[st.card, st.financialCard, { marginBottom: 16 }]}>
        <Text style={[st.subsectionTitle, { marginBottom: 16 }]}>
          Resumen financiero
        </Text>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <View>
            <Text style={[st.muted, { fontSize: 12 }]}>
              Saldo disponible para retirar
            </Text>
            <Text
              style={{ color: C.greenBright, fontSize: 32, fontWeight: "900" }}
            >
              $320.00
            </Text>
          </View>
          <BtnPrimary
            label="Retirar fondos"
            small
            onPress={() =>
              Alert.alert(
                "Retiro solicitado",
                "Solicitud enviada.\n\nComision Gradly 5% aplicada.",
              )
            }
          />
        </View>
        <Divider />
        <View style={[st.grid2, { gap: 12 }]}>
          <View>
            <Text style={[st.muted, { fontSize: 12, marginBottom: 4 }]}>
              Ingresos netos del mes
            </Text>
            <Text style={{ color: C.text, fontSize: 20, fontWeight: "700" }}>
              $850.00
            </Text>
            <Text style={{ color: C.greenBright, fontSize: 12 }}>
              +18% vs mes anterior
            </Text>
          </View>
          <View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginBottom: 4,
              }}
            >
              <Ionicons name="lock-closed-outline" size={14} color={C.muted} />
              <Text style={[st.muted, { fontSize: 12 }]}>
                Pendiente de liberacion
              </Text>
            </View>
            <Text style={{ color: C.text, fontSize: 20, fontWeight: "700" }}>
              $150.00
            </Text>
            <Text style={[st.muted, { fontSize: 11 }]}>
              Se libera en 5 dias - Comision Gradly 5% aplicada
            </Text>
          </View>
        </View>
      </View>
      <Card style={{ marginBottom: 16 }}>
        <Text style={[st.subsectionTitle, { marginBottom: 16 }]}>
          Metodos de retiro
        </Text>
        {[
          {
            icon: "logo-paypal" as keyof typeof Ionicons.glyphMap,
            name: "PayPal",
            status: "Configurar",
          },
          {
            icon: "business-outline" as keyof typeof Ionicons.glyphMap,
            name: "Transferencia bancaria",
            status: "Activo",
          },
          {
            icon: "card-outline" as keyof typeof Ionicons.glyphMap,
            name: "Tarjeta",
            status: "Configurar",
          },
        ].map((pm) => (
          <View key={pm.name} style={[st.toggleRow, { paddingVertical: 12 }]}>
            <Ionicons
              name={pm.icon}
              size={20}
              color={C.muted}
              style={{ marginRight: 10 }}
            />
            <Text style={[st.toggleLabel, { flex: 1 }]}>{pm.name}</Text>
            <View
              style={[
                st.badge,
                pm.status === "Activo"
                  ? { backgroundColor: C.greenBg, borderColor: C.greenBorder }
                  : {
                      backgroundColor: C.purpleDim,
                      borderColor: C.purpleBorder,
                    },
              ]}
            >
              <Text
                style={[
                  st.badgeText,
                  { color: pm.status === "Activo" ? C.greenBright : C.purple },
                ]}
              >
                {pm.status}
              </Text>
            </View>
          </View>
        ))}
        <Text style={[st.muted, { fontSize: 11, marginTop: 8 }]}>
          Comision Gradly 5% aplicada en cada retiro.
        </Text>
      </Card>
      <Card>
        <Text style={[st.subsectionTitle, { marginBottom: 12 }]}>
          Historial de transacciones
        </Text>
        {[
          {
            desc: "Servicio: Landing page",
            monto: "+$80.00",
            fecha: "10/05/2026",
            estado: "Liberado",
          },
          {
            desc: "Servicio: Script Python",
            monto: "+$120.00",
            fecha: "02/05/2026",
            estado: "Liberado",
          },
          {
            desc: "Retiro a cuenta bancaria",
            monto: "-$190.00",
            fecha: "28/04/2026",
            estado: "Procesado",
          },
        ].map((tx, i) => (
          <View key={i} style={[st.toggleRow, { paddingVertical: 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={st.contactValue}>{tx.desc}</Text>
              <Text style={[st.muted, { fontSize: 12 }]}>{tx.fecha}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text
                style={{
                  color: tx.monto.startsWith("+") ? C.greenBright : C.danger,
                  fontWeight: "700",
                }}
              >
                {tx.monto}
              </Text>
              <Text style={[st.muted, { fontSize: 11 }]}>{tx.estado}</Text>
            </View>
          </View>
        ))}
      </Card>
    </ScrollView>
  );

  // ── MI PERFIL ─────────────────────────────────────────────────────────────
  const renderPerfil = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={st.sectionContent}
    >
      <View style={st.profileBanner}>
        <TouchableOpacity
          onPress={async () => {
            if (!currentUserId) return;
            setUploadingPhoto(true);
            const url = await pickAndUploadImage(
              "public-media",
              `${currentUserId}/${Date.now()}-foto_perfil.jpg`,
            );
            if (url) {
              const ok = await updateProfilePhoto(
                currentUserId,
                "talentos",
                url,
              );
              if (ok) setProfilePhotoUrl(url);
            }
            setUploadingPhoto(false);
          }}
          style={[
            st.profileAvatarLg,
            {
              overflow: "hidden",
              justifyContent: "center",
              alignItems: "center",
            },
          ]}
        >
          {profilePhotoUrl ? (
            <Image
              source={{ uri: profilePhotoUrl }}
              style={{ width: 80, height: 80, borderRadius: 40 }}
            />
          ) : (
            <Ionicons name="person-outline" size={40} color={C.purple} />
          )}
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[st.sectionTitle, { fontSize: 22, marginBottom: 2 }]}>
            {talentoNombre}
          </Text>
          <Text style={st.muted}>{talentoHeadline}</Text>
          <View
            style={[
              st.badge,
              {
                backgroundColor: C.greenBg,
                borderColor: C.greenBorder,
                alignSelf: "flex-start",
                marginTop: 6,
              },
            ]}
          >
            <Text style={[st.badgeText, { color: C.greenBright }]}>
              Disponible
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[st.btnOutline, { paddingHorizontal: 12 }]}
          onPress={() => Alert.alert("CV", "Visualizando CV en PDF.")}
        >
          <Text style={st.btnOutlineText}>CV PDF</Text>
        </TouchableOpacity>
      </View>
      <Kicker text="Rendimiento" />
      <Text style={[st.sectionTitle, { fontSize: 20, marginBottom: 12 }]}>
        Metricas de rendimiento
      </Text>
      <View style={[st.grid2, { marginBottom: 16 }]}>
        {[
          {
            icon: "chatbubbles-outline" as keyof typeof Ionicons.glyphMap,
            label: "Tasa de respuesta",
            value: "92%",
            trend: "+3%",
          },
          {
            icon: "checkmark-circle-outline" as keyof typeof Ionicons.glyphMap,
            label: "Proyectos completados",
            value: "17",
            trend: "+2",
          },
          {
            icon: "star-outline" as keyof typeof Ionicons.glyphMap,
            label: "Calificacion promedio",
            value: "4.7/5",
            trend: "estable",
          },
          {
            icon: "eye-outline" as keyof typeof Ionicons.glyphMap,
            label: "Vistas al perfil",
            value: "124",
            trend: "+31",
          },
        ].map((m) => (
          <Card key={m.label} style={st.metricCard}>
            <Ionicons
              name={m.icon}
              size={24}
              color={C.purple}
              style={{ marginBottom: 6 }}
            />
            <Text style={st.metricNum}>{m.value}</Text>
            <Text
              style={[
                st.muted,
                { fontSize: 12, textAlign: "center", marginBottom: 6 },
              ]}
            >
              {m.label}
            </Text>
            <View
              style={[
                st.badge,
                { backgroundColor: C.greenBg, borderColor: C.greenBorder },
              ]}
            >
              <Text style={[st.badgeText, { color: C.greenBright }]}>
                {m.trend}
              </Text>
            </View>
          </Card>
        ))}
      </View>
      <Kicker text="Nivel Gradly" />
      <Card style={[st.levelCard, { marginBottom: 16 }]}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            marginBottom: 16,
          }}
        >
          <View style={st.rankBadge}>
            <Ionicons name="star-outline" size={28} color={C.yellow} />
            <Text
              style={[
                st.muted,
                { fontSize: 11, textAlign: "center", marginTop: 4 },
              ]}
            >
              Talento Activo
            </Text>
            <Text style={{ color: C.greenBright, fontWeight: "700" }}>
              3.8 / 5.0
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 4,
              }}
            >
              {["Nuevo", "Activo", "Dest.", "Pro", "Elite"].map((lvl, i) => (
                <Text
                  key={lvl}
                  style={[
                    { fontSize: 9, fontWeight: "700" },
                    i <= 1 ? { color: C.greenBright } : { color: C.muted },
                  ]}
                >
                  {lvl}
                </Text>
              ))}
            </View>
            <View style={[st.progressBar, { marginBottom: 6 }]}>
              <View style={[st.progressFill, { width: "62%" }]} />
            </View>
            <Text style={[st.muted, { fontSize: 12 }]}>
              Proximo nivel:{" "}
              <Text style={{ color: C.text }}>Talento Destacado</Text>
            </Text>
          </View>
        </View>
        <Text
          style={[
            st.muted,
            { fontSize: 12, fontWeight: "700", marginBottom: 8 },
          ]}
        >
          Requisitos pendientes:
        </Text>
        {[
          { done: false, text: "Recibe 2 evaluaciones mas de empresas" },
          { done: false, text: "Completa tus horas sociales (quedan 40 hrs)" },
          { done: true, text: "Perfil completo al 100%" },
        ].map((req, i) => (
          <View
            key={i}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginBottom: 6,
            }}
          >
            <Ionicons
              name={req.done ? "checkmark-circle-outline" : "ellipse-outline"}
              size={16}
              color={req.done ? C.greenBright : C.muted}
            />
            <Text
              style={[
                st.muted,
                { fontSize: 13 },
                req.done && { color: C.greenBright },
              ]}
            >
              {req.text}
            </Text>
          </View>
        ))}
      </Card>
      <TouchableOpacity
        style={[st.btnOutline, { marginBottom: 40 }]}
        onPress={() => setSubPage("config")}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Ionicons name="settings-outline" size={20} color={C.purple} />
          <Text style={[st.btnOutlineText, { flex: 1, textAlign: "left" }]}>
            Configuracion
          </Text>
          <Ionicons name="chevron-forward-outline" size={16} color={C.muted} />
        </View>
      </TouchableOpacity>
    </ScrollView>
  );

  // ── SERVICE MODAL ─────────────────────────────────────────────────────────
  const ServiceModal = () => (
    <Modal
      visible={showServiceModal}
      transparent
      animationType="fade"
      onRequestClose={() => {
        setShowServiceModal(false);
        resetServiceForm();
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <TouchableOpacity
          style={st.modalBackdrop}
          activeOpacity={1}
          onPress={() => {
            setShowServiceModal(false);
            resetServiceForm();
          }}
        >
          <TouchableOpacity activeOpacity={1} style={st.modalCard}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <Text style={st.subsectionTitle}>Publicar nuevo servicio</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowServiceModal(false);
                  resetServiceForm();
                }}
              >
                <Ionicons name="close-outline" size={24} color={C.muted} />
              </TouchableOpacity>
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 20,
                gap: 4,
              }}
            >
              {([1, 2, 3] as ServiceModalStep[]).map((n, idx) => (
                <React.Fragment key={n}>
                  <View
                    style={[
                      st.stepCircle,
                      serviceStep >= n && st.stepCircleActive,
                    ]}
                  >
                    <Text
                      style={[
                        st.stepCircleText,
                        serviceStep >= n && { color: "#fff" },
                      ]}
                    >
                      {n}
                    </Text>
                  </View>
                  {idx < 2 && <View style={st.stepLine} />}
                </React.Fragment>
              ))}
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {serviceStep === 1 && (
                <>
                  <Text style={[st.muted, { fontSize: 12, marginBottom: 16 }]}>
                    Paso 1 de 3 - Informacion basica
                  </Text>
                  <InputField
                    label="Titulo del servicio"
                    value={svcTitle}
                    onChangeText={setSvcTitle}
                    placeholder="Ej: Diseno de landing page"
                  />
                  <InputField
                    label="Categoria"
                    value={svcCategory}
                    onChangeText={setSvcCategory}
                    placeholder="Ej: Desarrollo Web"
                  />
                  <View style={{ marginBottom: 14 }}>
                    <Text style={st.inputLabel}>
                      Descripcion (max. 300 caracteres)
                    </Text>
                    <TextInput
                      style={[
                        st.input,
                        { height: 90, textAlignVertical: "top" },
                      ]}
                      value={svcDesc}
                      onChangeText={(v) => v.length <= 300 && setSvcDesc(v)}
                      placeholder="Describe tu servicio..."
                      placeholderTextColor={C.muted}
                      multiline
                    />
                    <Text style={[st.muted, { fontSize: 10, marginTop: 2 }]}>
                      {svcDesc.length} / 300
                    </Text>
                  </View>
                  <InputField
                    label="Precio base ($)"
                    value={svcPrice}
                    onChangeText={setSvcPrice}
                    keyboardType="numeric"
                    placeholder="Ej: 50.00"
                  />
                </>
              )}
              {serviceStep === 2 && (
                <>
                  <Text style={[st.muted, { fontSize: 12, marginBottom: 16 }]}>
                    Paso 2 de 3 - Modalidad e imagenes
                  </Text>
                  <Text style={st.inputLabel}>Modalidad</Text>
                  <View
                    style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}
                  >
                    {(["Remoto", "Presencial", "Hibrido"] as const).map(
                      (mod) => (
                        <TouchableOpacity
                          key={mod}
                          style={[
                            st.btnOutline,
                            { flex: 1 },
                            svcModality === mod && {
                              borderColor: C.purple,
                              backgroundColor: C.purpleDim,
                            },
                          ]}
                          onPress={() => setSvcModality(mod)}
                        >
                          <Text
                            style={[
                              st.btnOutlineText,
                              { fontSize: 12 },
                              svcModality === mod && { color: C.text },
                            ]}
                          >
                            {mod}
                          </Text>
                        </TouchableOpacity>
                      ),
                    )}
                  </View>
                  <View style={st.imagePlaceholder}>
                    <Ionicons name="image-outline" size={40} color={C.muted} />
                    <Text
                      style={[st.muted, { marginTop: 8, textAlign: "center" }]}
                    >
                      Subir imagenes del servicio
                    </Text>
                    <BtnOutline
                      label="Seleccionar imagenes"
                      small
                      style={{ marginTop: 12 }}
                      onPress={async () => {
                        if (!currentUserId) return;
                        const url = await pickAndUploadImage(
                          "public-media",
                          `${currentUserId}/${Date.now()}-servicio.jpg`,
                        );
                        if (url)
                          Alert.alert(
                            "Imagen subida",
                            "La imagen fue guardada correctamente.",
                          );
                      }}
                    />
                  </View>
                </>
              )}
              {serviceStep === 3 && (
                <>
                  <Text style={[st.muted, { fontSize: 12, marginBottom: 16 }]}>
                    Paso 3 de 3 - Habilidades y requisitos
                  </Text>
                  <InputField
                    label="Habilidades requeridas"
                    value={svcHabilidades}
                    onChangeText={setSvcHabilidades}
                    placeholder="Ej: React, Figma, JavaScript"
                  />
                  <InputField
                    label="Entrega estimada (dias)"
                    value={svcEntrega}
                    onChangeText={setSvcEntrega}
                    keyboardType="numeric"
                    placeholder="Ej: 7"
                  />
                </>
              )}
            </ScrollView>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginTop: 16,
              }}
            >
              <BtnOutline
                label="Anterior"
                onPress={() =>
                  setServiceStep((s) =>
                    s > 1 ? ((s - 1) as ServiceModalStep) : s,
                  )
                }
                disabled={serviceStep === 1}
              />
              {serviceStep < 3 ? (
                <BtnPrimary
                  label="Siguiente"
                  onPress={() =>
                    setServiceStep((s) =>
                      s < 3 ? ((s + 1) as ServiceModalStep) : s,
                    )
                  }
                />
              ) : (
                <BtnPrimary
                  label="Publicar servicio"
                  onPress={handlePublishService}
                />
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );

  // ── ROOT ─────────────────────────────────────────────────────────────────
  const renderContent = () => {
    if (subPage === "ayuda") return renderAyuda();
    if (subPage === "acercade") return renderAcercaDe();
    if (subPage === "config") return renderConfig();
    switch (activePage) {
      case "home":
        return renderHome();
      case "proyectos":
        return renderProyectos();
      case "pagos":
        return renderPagos();
      case "perfil":
        return renderPerfil();
    }
  };

  return (
    <SafeAreaView style={st.root}>
      <UniversalHeader
        userName={talentoNombre}
        userSubtitle={talentoHeadline}
        profilePhotoUrl={profilePhotoUrl}
        userId={currentUserId}
      />
      <View style={{ flex: 1 }}>{renderContent()}</View>
      <View style={st.bottomNav}>
        {BOTTOM_NAV.map((item) => {
          const active = activePage === item.key && !subPage;
          return (
            <TouchableOpacity
              key={item.key}
              style={st.bottomNavItem}
              onPress={() => navigate(item.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={item.icon}
                size={22}
                color={active ? C.purple : C.muted}
              />
              <Text style={[st.bottomNavLabel, active && { color: C.purple }]}>
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
      <ServiceModal />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function createStyles(C: typeof darkTheme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    topbar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: C.surface,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    languageMenuBackdrop: {
      position: "absolute",
      top: 64,
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
    brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    brandBadge: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: C.purple,
      alignItems: "center",
      justifyContent: "center",
    },
    brandBadgeText: { color: "#fff", fontWeight: "700", fontSize: 16 },
    brandTitle: { color: C.text, fontWeight: "700", fontSize: 15 },
    brandSub: { color: C.muted, fontSize: 11 },
    iconBtn: { padding: 6, borderRadius: 8, backgroundColor: C.purpleDim },
    bottomNav: {
      flexDirection: "row",
      backgroundColor: C.surface,
      borderTopWidth: 1,
      borderTopColor: C.border,
      paddingBottom: 8,
      paddingTop: 6,
    },
    bottomNavItem: { flex: 1, alignItems: "center", paddingVertical: 4 },
    bottomNavLabel: { fontSize: 11, color: C.muted, marginTop: 2 },
    sectionContent: { padding: 16, paddingBottom: 40 },
    sectionTitle: {
      fontSize: 24,
      fontWeight: "800",
      color: C.text,
      marginBottom: 4,
    },
    kicker: {
      fontSize: 11,
      fontWeight: "700",
      color: C.purple,
      textTransform: "uppercase",
      letterSpacing: 1.2,
      marginBottom: 4,
    },
    muted: { color: C.muted, fontSize: 13 },
    subsectionTitle: { fontSize: 16, fontWeight: "700", color: C.text },
    backLink: { color: C.purple, fontSize: 14, fontWeight: "600" },
    card: {
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 16,
      padding: 16,
      marginBottom: 4,
    },
    featureCard: { flex: 1, padding: 16 },
    financialCard: { borderLeftWidth: 3, borderLeftColor: C.greenBright },
    levelCard: {
      borderWidth: 1,
      borderColor: "rgba(94,175,115,0.25)",
      backgroundColor: C.card,
      padding: 16,
      borderRadius: 16,
    },
    grid2: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    metricCard: {
      flex: 1,
      minWidth: "45%",
      alignItems: "center",
      paddingVertical: 18,
    },
    metricNum: {
      fontSize: 28,
      fontWeight: "900",
      color: C.text,
      marginBottom: 4,
    },
    welcomeBanner: {
      backgroundColor: C.purpleDark,
      borderRadius: 20,
      padding: 20,
      marginBottom: 20,
      overflow: "hidden",
    },
    welcomeOrb: {
      position: "absolute",
      right: 12,
      top: 10,
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: "rgba(255,255,255,0.08)",
    },
    welcomeTitle: { color: "#fff", fontSize: 20, fontWeight: "800" },
    agendaCard: { flexDirection: "row", padding: 0, overflow: "hidden" },
    agendaBlock: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 14,
      paddingHorizontal: 6,
    },
    agendaDivider: { width: 1, backgroundColor: "rgba(139,92,246,0.15)" },
    agendaBadge: {
      borderRadius: 10,
      paddingHorizontal: 6,
      paddingVertical: 2,
      marginBottom: 4,
    },
    searchRow: { flexDirection: "row", alignItems: "center" },
    dropdownList: {
      backgroundColor: C.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: C.border,
      maxHeight: 200,
      marginTop: 4,
    },
    dropdownItem: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(255,255,255,0.04)",
    },
    jobLogoPlaceholder: {
      width: 50,
      height: 50,
      borderRadius: 12,
      backgroundColor: C.purpleDark,
      alignItems: "center",
      justifyContent: "center",
    },
    uniAnnouncementCard: {
      borderWidth: 1,
      borderColor: "rgba(139,92,246,0.25)",
      backgroundColor: C.purpleDim,
      borderRadius: 16,
      padding: 16,
    },
    serviceCover: {
      height: 100,
      backgroundColor: "rgba(255,255,255,0.03)",
      borderTopLeftRadius: 15,
      borderTopRightRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    deleteBtn: {
      padding: 10,
      borderRadius: 8,
      backgroundColor: "rgba(239,68,68,0.10)",
      borderWidth: 1,
      borderColor: "rgba(239,68,68,0.25)",
    },
    profileBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 16,
      padding: 16,
      marginBottom: 20,
      flexWrap: "wrap",
    },
    profileAvatarLg: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: C.purpleDim,
      borderWidth: 2,
      borderColor: C.purpleBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    rankBadge: {
      alignItems: "center",
      backgroundColor: C.purpleDim,
      borderRadius: 16,
      padding: 12,
      minWidth: 90,
    },
    progressBar: {
      height: 8,
      backgroundColor: "rgba(255,255,255,0.10)",
      borderRadius: 4,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      backgroundColor: C.greenBright,
      borderRadius: 4,
    },
    statNum: {
      fontSize: 28,
      fontWeight: "900",
      color: C.purple,
      marginBottom: 4,
    },
    btnPrimary: {
      backgroundColor: C.purple,
      borderRadius: 10,
      paddingVertical: 13,
      paddingHorizontal: 20,
      alignItems: "center",
    },
    btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
    btnOutline: {
      borderWidth: 1,
      borderColor: C.purpleBorder,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 18,
      alignItems: "center",
    },
    btnOutlineText: { color: C.purple, fontWeight: "600", fontSize: 14 },
    btnSm: { paddingVertical: 8, paddingHorizontal: 14 },
    btnDisabled: { opacity: 0.38 },
    inputLabel: { fontSize: 13, color: C.muted, marginBottom: 6 },
    input: {
      backgroundColor: "rgba(255,255,255,0.04)",
      borderWidth: 1,
      borderColor: C.purpleBorder,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: C.text,
      fontSize: 14,
    },
    toggleRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderBottomWidth: 1,
      borderBottomColor: "rgba(139,92,246,0.10)",
      paddingVertical: 12,
    },
    toggleLabel: { color: C.text, fontSize: 14, flex: 1, marginRight: 12 },
    badge: {
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderWidth: 1,
    },
    badgeText: { fontSize: 11, fontWeight: "600" },
    techBadge: {
      backgroundColor: "rgba(139,92,246,0.08)",
      borderRadius: 20,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderWidth: 1,
      borderColor: "rgba(139,92,246,0.25)",
    },
    techBadgeText: { color: C.purple, fontSize: 10, fontWeight: "600" },
    teamAvatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: C.purpleDim,
      borderWidth: 2,
      borderColor: C.purpleBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    contactItem: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      marginBottom: 14,
    },
    contactIconBox: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: "rgba(255,255,255,0.05)",
      alignItems: "center",
      justifyContent: "center",
    },
    contactLabel: { fontSize: 11, color: C.muted, marginBottom: 2 },
    contactValue: { fontSize: 14, color: C.text },
    acercaHero: {
      backgroundColor: C.purpleDark,
      borderRadius: 20,
      padding: 20,
      marginBottom: 20,
      alignItems: "center",
      overflow: "hidden",
    },
    acercaOrb: {
      position: "absolute",
      right: -20,
      top: -20,
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: "rgba(255,255,255,0.06)",
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.70)",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
    },
    modalCard: {
      width: "100%",
      maxWidth: 560,
      backgroundColor: "rgba(13,11,30,0.97)",
      borderWidth: 1,
      borderColor: "rgba(139,92,246,0.25)",
      borderRadius: 20,
      padding: 20,
      maxHeight: "85%",
    },
    imagePlaceholder: {
      height: 140,
      backgroundColor: "rgba(255,255,255,0.03)",
      borderWidth: 2,
      borderColor: C.purpleBorder,
      borderStyle: "dashed",
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 14,
    },
    stepCircle: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: "rgba(255,255,255,0.04)",
      borderWidth: 2,
      borderColor: C.purpleBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    stepCircleActive: { backgroundColor: C.purple, borderColor: C.purple },
    stepCircleText: { fontWeight: "700", color: C.muted },
    stepLine: { flex: 1, height: 2, backgroundColor: C.purpleBorder },
  });
}
