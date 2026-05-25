/**
 * dashboard-empresa.tsx
 * Portal de empresa React Native (Expo) - VERSIÓN COMPLETA MEJORADA
 *
 * ✅ Validaciones en tiempo real por campo
 * ✅ Modal crear vacante con stepper multi-paso
 * ✅ Modal detalle de vacante con candidatos y perfiles
 * ✅ Modal detalle de candidato con calificación y perfil completo
 * ✅ Preguntas dinámicas (agregar/eliminar)
 * ✅ Rango salarial con período de pago
 * ✅ Sección candidatos mejorada con acceso a perfil
 */

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    Alert,
    Image,
    Modal,
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
import { useTranslationContext } from "../src/context/TranslationContext";
import handleLogout, { updateEmpresaPlan } from "../src/services/authService";

const Text = TranslatedText;

type Theme = {
  bg: string;
  surface: string;
  card: string;
  border: string;
  purple: string;
  purpleDark: string;
  purpleDim: string;
  purpleBorder: string;
  text: string;
  muted: string;
  danger: string;
  dangerBg: string;
  dangerBorder: string;
  green: string;
  greenBg: string;
  greenBorder: string;
  yellow: string;
  yellowBg: string;
  yellowBorder: string;
  blue: string;
  blueBg: string;
};

const themeDark: Theme = {
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
  dangerBg: "rgba(220,38,38,0.10)",
  dangerBorder: "rgba(220,38,38,0.40)",
  green: "rgba(52,211,153,1)",
  greenBg: "rgba(52,211,153,0.08)",
  greenBorder: "rgba(52,211,153,0.25)",
  yellow: "#f59e0b",
  yellowBg: "rgba(245,158,11,0.12)",
  yellowBorder: "rgba(245,158,11,0.25)",
  blue: "#3b82f6",
  blueBg: "rgba(59,130,246,0.12)",
};

const themeLight: Theme = {
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
  dangerBg: "rgba(239,68,68,0.10)",
  dangerBorder: "rgba(220,38,38,0.40)",
  green: "#15803d",
  greenBg: "rgba(52,211,153,0.12)",
  greenBorder: "rgba(52,211,153,0.25)",
  yellow: "#b45309",
  yellowBg: "rgba(245,158,11,0.12)",
  yellowBorder: "rgba(245,158,11,0.25)",
  blue: "#2563eb",
  blueBg: "rgba(59,130,246,0.12)",
};

let C = themeDark;
let s = createStyles(C);

// ─── Types ────────────────────────────────────────────────────────────────────

type Section =
  | "inicio"
  | "vacantes"
  | "candidatos"
  | "horas-sociales"
  | "pagos"
  | "notificaciones"
  | "perfil"
  | "configuracion"
  | "crear-vacante"
  | "explorar";

type CompanyPlan = "free" | "basic" | "premium";

type HorasTab = "pendientes" | "revision" | "aprobadas" | "cerradas";
type ExplorarTab = "talentos" | "universidades" | "proyectos";
type CandidateUserFilter = "todos" | "rrhh" | "reclutador" | "directivo";
type CandidateStageFilter = "todos" | "activos" | "entrevistas" | "contratados";
type PaymentFilter = "todos" | "rrhh" | "finanzas" | "externo";
type SubPage = "ayuda" | "acercade" | null;
type Modality = "remoto" | "hibrido" | "presencial";
type PeriodoPago = "quincenal" | "mensual";

interface LocationData {
  lat: number;
  lng: number;
  address: string;
  municipio: string;
  departamento: string;
  pais: string;
}

// ── Geo data El Salvador (departamentos → ciudades) ───────────────
const GEO_DATA: Record<string, string[]> = {
  Ahuachapán: ["Ahuachapán", "Atiquizaya", "Tacuba", "El Refugio", "Turín"],
  Cabañas: ["Sensuntepeque", "Ilobasco", "Victoria", "San Isidro"],
  Chalatenango: [
    "Chalatenango",
    "La Palma",
    "Tejutla",
    "San Francisco Morazán",
  ],
  Cuscatlán: ["Cojutepeque", "Suchitoto", "San Pedro Perulapán"],
  "La Libertad": [
    "Santa Tecla",
    "Antiguo Cuscatlán",
    "Zaragoza",
    "San Juan Opico",
    "Colón",
  ],
  "La Paz": ["Zacatecoluca", "San Luis Talpa", "San Juan Nonualco"],
  "La Unión": ["La Unión", "Santa Rosa de Lima"],
  Morazán: ["San Francisco Gotera", "Jocoaitique", "Cacaopera"],
  "San Miguel": ["San Miguel", "Moncagua", "San Rafael Oriente"],
  "San Salvador": [
    "San Salvador",
    "Soyapango",
    "Mejicanos",
    "Apopa",
    "Ciudad Delgado",
    "Ilopango",
    "San Marcos",
    "Panchimalco",
  ],
  "San Vicente": ["San Vicente", "Apastepeque"],
  "Santa Ana": ["Santa Ana", "Chalchuapa", "Metapán"],
  Sonsonate: ["Sonsonate", "Izalco", "Nahuizalco", "Acajutla"],
  Usulután: ["Usulután", "Jiquilisco", "Santiago de María"],
};

interface Vacante {
  id: string;
  puesto: string;
  modalidad: Modality;
  plazas: number;
  candidatos: number;
  vistas: number;
  cierre: string;
  estado: "Activa" | "Pausada" | "Cerrada";
  descripcion: string;
  requisitos: string;
  rangoSalarial: string;
  periodoPago: PeriodoPago;
  ubicacion?: LocationData;
  preguntas: string[];
  metodoPago: "paypal" | "tarjeta";
  fechaCreacion: string;
}

interface Candidato {
  id: string;
  name: string;
  cargo: string;
  user: "rrhh" | "reclutador" | "directivo";
  stage: "activos" | "entrevistas" | "contratados";
  fecha: string;
  badge: string;
  badgeType: "active" | "interview" | "hired";
  email: string;
  telefono: string;
  calificacion: number;
  universidad: string;
  carrera: string;
  skills: string[];
  experiencia: string;
  portfolio: string;
  vacanteAplicada: string;
  presentacion: string;
}

// ─── Static data ──────────────────────────────────────────────────────────────

const CANDIDATES: Candidato[] = [
  {
    id: "1",
    name: "Juan Pérez",
    cargo: "Desarrollador Frontend",
    user: "rrhh",
    stage: "activos",
    fecha: "02/05/2026",
    badge: "Activo",
    badgeType: "active",
    email: "juan@email.com",
    telefono: "+502 1234-5678",
    calificacion: 4.8,
    universidad: "Universidad Nacional",
    carrera: "Ingeniería en Sistemas",
    skills: ["React", "TypeScript", "Node.js", "CSS", "Git"],
    experiencia: "2 años de experiencia en desarrollo web",
    portfolio: "github.com/juanperez",
    vacanteAplicada: "Desarrollador Frontend",
    presentacion: "Apasionado del desarrollo web moderno con énfasis en UX.",
  },
  {
    id: "2",
    name: "María Torres",
    cargo: "Analista de Datos",
    user: "reclutador",
    stage: "entrevistas",
    fecha: "10/05/2026",
    badge: "Entrevista",
    badgeType: "interview",
    email: "maria@email.com",
    telefono: "+502 2345-6789",
    calificacion: 4.6,
    universidad: "UES",
    carrera: "Estadística",
    skills: ["Python", "SQL", "Power BI", "Excel", "Tableau"],
    experiencia: "3 años en análisis de datos y BI",
    portfolio: "linkedin.com/in/mariatorres",
    vacanteAplicada: "Analista de Datos",
    presentacion:
      "Especialista en visualización de datos y toma de decisiones.",
  },
  {
    id: "3",
    name: "Carla Méndez",
    cargo: "Coordinador de Producto",
    user: "directivo",
    stage: "contratados",
    fecha: "22/04/2026",
    badge: "Contratado",
    badgeType: "hired",
    email: "carla@email.com",
    telefono: "+502 3456-7890",
    calificacion: 4.9,
    universidad: "Don Bosco",
    carrera: "Administración de Empresas",
    skills: ["Product Management", "Figma", "Agile", "Scrum", "Jira"],
    experiencia: "4 años en gestión de productos digitales",
    portfolio: "behance.net/carlam",
    vacanteAplicada: "Coordinador de Producto",
    presentacion: "Líder de producto con enfoque en metodologías ágiles.",
  },
  {
    id: "4",
    name: "Andrés López",
    cargo: "Especialista en Talento",
    user: "rrhh",
    stage: "activos",
    fecha: "27/05/2026",
    badge: "Activo",
    badgeType: "active",
    email: "andres@email.com",
    telefono: "+502 4567-8901",
    calificacion: 4.7,
    universidad: "UJMD",
    carrera: "Psicología Organizacional",
    skills: ["HR", "Recruitment", "Analytics", "ATS", "Onboarding"],
    experiencia: "3 años en recursos humanos y reclutamiento",
    portfolio: "linkedin.com/in/andreslopez",
    vacanteAplicada: "Analista de Datos",
    presentacion: "Experto en selección de talento y cultura organizacional.",
  },
];

const PAYMENTS = [
  {
    usuario: "RRHH",
    monto: "$4,200.00",
    fecha: "01/05/2026",
    metodo: "Transferencia",
    badge: "Procesado",
    badgeType: "active" as const,
    userKey: "rrhh",
  },
  {
    usuario: "Finanzas",
    monto: "$2,750.00",
    fecha: "08/05/2026",
    metodo: "Tarjeta",
    badge: "Pendiente",
    badgeType: "interview" as const,
    userKey: "finanzas",
  },
  {
    usuario: "Consultor externo",
    monto: "$1,500.00",
    fecha: "12/05/2026",
    metodo: "Pago móvil",
    badge: "Procesado",
    badgeType: "active" as const,
    userKey: "externo",
  },
  {
    usuario: "RRHH",
    monto: "$3,800.00",
    fecha: "18/05/2026",
    metodo: "Transferencia",
    badge: "Confirmado",
    badgeType: "hired" as const,
    userKey: "rrhh",
  },
];

const VACANTES_MOCK: Vacante[] = [
  {
    id: "1",
    puesto: "Desarrollador Frontend",
    modalidad: "remoto",
    plazas: 3,
    candidatos: 23,
    vistas: 156,
    cierre: "30/06/2026",
    estado: "Activa",
    descripcion:
      "Buscamos un desarrollador frontend con experiencia en React y TypeScript para unirse a nuestro equipo.",
    requisitos: "2 años de experiencia, React, TypeScript, CSS",
    rangoSalarial: "1200",
    periodoPago: "mensual",
    preguntas: [
      "¿Cuál es tu experiencia con React?",
      "¿Has trabajado con TypeScript?",
    ],
    metodoPago: "tarjeta",
    fechaCreacion: "15/05/2026",
  },
  {
    id: "2",
    puesto: "Analista de Datos",
    modalidad: "presencial",
    plazas: 2,
    candidatos: 15,
    vistas: 89,
    cierre: "15/07/2026",
    estado: "Activa",
    descripcion:
      "Se requiere analista con experiencia en SQL y Power BI para el área de inteligencia de negocios.",
    requisitos: "3 años experiencia, SQL, Power BI, Excel avanzado",
    rangoSalarial: "1000",
    periodoPago: "mensual",
    ubicacion: {
      lat: 13.6929,
      lng: -89.2182,
      address: "Paseo General Escalón, San Salvador",
      municipio: "San Salvador",
      departamento: "San Salvador",
      pais: "El Salvador",
    },
    preguntas: ["¿Experiencia con bases de datos?"],
    metodoPago: "paypal",
    fechaCreacion: "10/05/2026",
  },
];

type AlumnoGrupo = {
  id: string;
  name: string;
  carrera: string;
  grupoId: string;
  estado: string;
};

type GrupoCerrado = {
  id: string;
  nombre: string;
  descripcion: string;
  horasCompletadas: number;
  periodo: string;
  cierre: string;
  estudiantes: AlumnoGrupo[];
};

type GrupoDisponible = {
  id: string;
  nombre: string;
  descripcion: string;
  especialidad: string;
  horasRequeridas: number;
  periodo: string;
  cierre: string;
};

type GrupoAlumno = {
  id: string;
  nombre: string;
  carrera: string;
  estado: string;
};

type SolicitudHoras = {
  id: string;
  estado: string;
  iniciado_por: "empresa" | "universidad";
  motivo_rechazo?: string;
  grupo_id?: string;
  hora_inicio?: string;
  hora_fin?: string;
  fecha_inicio?: string;
  fecha_fin?: string;
  google_maps_url?: string;
};

const CLOSED_GROUPS: GrupoCerrado[] = [
  {
    id: "g1",
    nombre: "Grupo Innovación 2026",
    descripcion:
      "Equipo con 160 horas completadas en capacitación y práctica profesional.",
    horasCompletadas: 160,
    periodo: "Ene 2026 - May 2026",
    cierre: "20/05/2026",
    estudiantes: [
      {
        id: "s1",
        name: "Luis Martínez",
        carrera: "Ing. en Sistemas",
        grupoId: "g1",
        estado: "Finalizado",
      },
      {
        id: "s2",
        name: "Ana Ramírez",
        carrera: "Ing. Industrial",
        grupoId: "g1",
        estado: "Finalizado",
      },
    ],
  },
  {
    id: "g2",
    nombre: "Grupo Talento Junior",
    descripcion:
      "Finalizó el ciclo de horas con enfoque en proyectos de talento humano.",
    horasCompletadas: 148,
    periodo: "Feb 2026 - May 2026",
    cierre: "18/05/2026",
    estudiantes: [
      {
        id: "s3",
        name: "Sofía Morales",
        carrera: "Psicología Organizacional",
        grupoId: "g2",
        estado: "Finalizado",
      },
      {
        id: "s4",
        name: "Carlos Díaz",
        carrera: "Comunicación",
        grupoId: "g2",
        estado: "Finalizado",
      },
    ],
  },
];

const EMPRESA_BOTTOM_NAV: {
  key: Section;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "inicio", label: "Inicio", icon: "home-outline" },
  { key: "vacantes", label: "Vacantes", icon: "briefcase-outline" },
  { key: "candidatos", label: "Candidatos", icon: "people-outline" },
  { key: "horas-sociales", label: "Horas", icon: "time-outline" },
  { key: "perfil", label: "Mi Perfil", icon: "person-outline" },
];

// ─── Design tokens ────────────────────────────────────────────────────────────

// ─── Reusable primitives ──────────────────────────────────────────────────────

function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  return <View style={[s.card, style]}>{children}</View>;
}

function SectionTitle({ text }: { text: string }) {
  return <Text style={s.sectionTitle}>{text}</Text>;
}

function Badge({
  label,
  type,
}: {
  label: string;
  type: "active" | "interview" | "hired" | "default";
}) {
  const colors = {
    active: { bg: C.greenBg, border: C.greenBorder, color: C.green },
    interview: { bg: C.yellowBg, border: C.yellowBorder, color: C.yellow },
    hired: { bg: C.greenBg, border: C.greenBorder, color: C.green },
    default: { bg: C.purpleDim, border: C.purpleBorder, color: C.purple },
  };
  const c = colors[type];
  return (
    <View style={[s.badge, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={[s.badgeText, { color: c.color }]}>{label}</Text>
    </View>
  );
}

function FilterPill({
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
      onPress={onPress}
      style={[s.filterPill, active && s.filterPillActive]}
    >
      <Text style={[s.filterPillText, active && s.filterPillTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function SelectInput({
  label,
  value,
  options,
  onChange,
  error,
  style,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  error?: string;
  style?: any;
}) {
  const [open, setOpen] = useState(false);
  const success = !!value && !error;
  const hasError = !!error;
  const borderColor = hasError ? C.danger : success ? C.green : C.purpleBorder;

  return (
    <View style={[{ marginBottom: 14 }, style]}>
      <Text style={[s.inputLabel, value && { color: C.purple }]}>{label}</Text>
      <TouchableOpacity
        style={[
          s.input,
          {
            justifyContent: "space-between",
            flexDirection: "row",
            paddingHorizontal: 14,
            borderColor,
          },
        ]}
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.7}
      >
        <Text
          style={
            value
              ? { color: C.text, fontSize: 14 }
              : { color: C.muted, fontSize: 14 }
          }
          numberOfLines={1}
        >
          {value || "Selecciona…"}
        </Text>
        <Text style={{ color: C.muted, fontSize: 12, marginLeft: 8 }}>
          {open ? "▴" : "▾"}
        </Text>
      </TouchableOpacity>
      {open && (
        <View
          style={[
            {
              backgroundColor: C.surface,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: C.purpleBorder,
              marginTop: 4,
              zIndex: 1000,
              overflow: "hidden",
            },
          ]}
        >
          <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[
                  {
                    padding: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: "rgba(255,255,255,0.04)",
                  },
                  value === opt && { backgroundColor: C.purpleDim },
                ]}
                onPress={() => {
                  onChange(opt);
                  setOpen(false);
                }}
              >
                <Text
                  style={[
                    { color: "rgba(255,255,255,0.75)", fontSize: 14 },
                    value === opt && { color: C.purple, fontWeight: "700" },
                  ]}
                >
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
      {!!error && <Text style={s.errorText}>⚠️ {error}</Text>}
    </View>
  );
}

function TabBtn({
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
      onPress={onPress}
      style={[s.tabBtn, active && s.tabBtnActive]}
    >
      <Text style={[s.tabBtnText, active && s.tabBtnTextActive]}>{label}</Text>
    </TouchableOpacity>
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
    <View style={s.toggleRow}>
      <Text style={s.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: "rgba(255,255,255,0.10)", true: C.purpleDark }}
        thumbColor={value ? C.purple : "rgba(255,255,255,0.55)"}
      />
    </View>
  );
}

function RatingStars({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={s.inputLabel}>{label}</Text>
      <View style={s.ratingRow}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            style={[s.ratingStar, value >= star && s.ratingStarActive]}
            onPress={() => onChange(star)}
          >
            <Ionicons
              name={value >= star ? "star" : "star-outline"}
              size={18}
              color={value >= star ? C.green : C.text}
            />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ─── Validadores ─────────────────────────────────────────────────────────────

const validators = {
  titulo: (v: string) => {
    if (!v) return { isValid: false, error: "Este campo es obligatorio" };
    if (!/^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s]+$/.test(v))
      return { isValid: false, error: "Solo se permiten letras" };
    return { isValid: true };
  },
  plazas: (v: string) => {
    const n = parseInt(v);
    if (!v) return { isValid: false, error: "Este campo es obligatorio" };
    if (isNaN(n) || n < 1 || n > 100)
      return { isValid: false, error: "Ingresa un número entre 1 y 100" };
    return { isValid: true };
  },
  fecha: (v: string) => {
    if (!v) return { isValid: false, error: "Este campo es obligatorio" };
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(v))
      return { isValid: false, error: "Formato requerido: DD/MM/AAAA" };
    return { isValid: true };
  },
  descripcion: (v: string) => {
    if (!v) return { isValid: false, error: "Este campo es obligatorio" };
    if (!/^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ0-9\s.,;:¿?¡!()-]+$/.test(v))
      return { isValid: false, error: "Solo se permiten letras y números" };
    return { isValid: true };
  },
  requisitos: (v: string) => {
    if (!v) return { isValid: false, error: "Este campo es obligatorio" };
    if (!/^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ0-9\s.,;:¿?¡!()-]+$/.test(v))
      return { isValid: false, error: "Solo se permiten letras y números" };
    return { isValid: true };
  },
  salario: (v: string) => {
    if (!v) return { isValid: false, error: "Este campo es obligatorio" };
    const clean = v.replace(/,/g, "");
    const n = parseInt(clean);
    if (isNaN(n) || n <= 99 || n >= 2501)
      return { isValid: false, error: "Valor entre $100 y $2,500" };
    return { isValid: true };
  },
  pregunta: (v: string) => {
    if (!v) return { isValid: false, error: "Escribe la pregunta o elimínala" };
    if (!/^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s¿?¡!.,]+$/.test(v))
      return { isValid: false, error: "Solo se permiten letras" };
    return { isValid: true };
  },
  hora: (v: string) => {
    if (!v) return { isValid: false, error: "Este campo es obligatorio" };
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))
      return { isValid: false, error: "Formato requerido: HH:mm" };
    return { isValid: true };
  },
  googleMaps: (v: string) => {
    if (!v)
      return { isValid: false, error: "Enlace de Google Maps es obligatorio" };
    try {
      new URL(v);
    } catch (_) {
      return { isValid: false, error: "Ingresa una URL válida" };
    }
    if (!/google\./.test(v) && !/maps\.app\.goo\.gl/.test(v))
      return { isValid: false, error: "La URL debe ser de Google Maps" };
    return { isValid: true };
  },
  alphanumeric: (v: string) => {
    if (!v) return { isValid: false, error: "Describe el motivo de rechazo" };
    if (!/^[a-zA-ZÁÉÍÓÚáéíóúÜüÑñ0-9\s]+$/.test(v))
      return { isValid: false, error: "Solo letras y números permitidos" };
    return { isValid: true };
  },
};

function ValidatedInput({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  validator,
  hint,
  prefix,
  keyboardType,
  error,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  validator?: (v: string) => { isValid: boolean; error?: string };
  hint?: string;
  prefix?: string;
  keyboardType?: any;
  error?: string;
}) {
  const validation = validator ? validator(value) : { isValid: true };
  const hasError = !!error || (!!value && !validation.isValid);
  const isValid = !!value && validation.isValid && !error;
  const borderColor = hasError ? C.danger : isValid ? C.green : C.purpleBorder;

  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.inputLabel}>{label}</Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: multiline ? "flex-start" : "center",
        }}
      >
        {prefix ? (
          <View
            style={[
              s.inputPrefix,
              { borderColor, paddingTop: multiline ? 12 : 0 },
            ]}
          >
            <Text style={{ color: C.green, fontWeight: "700", fontSize: 16 }}>
              {prefix}
            </Text>
          </View>
        ) : null}
        <TextInput
          style={[
            s.input,
            { borderColor, flex: prefix ? 1 : undefined },
            prefix
              ? {
                  borderLeftWidth: 0,
                  borderTopLeftRadius: 0,
                  borderBottomLeftRadius: 0,
                }
              : {},
            multiline
              ? { height: 80, textAlignVertical: "top", paddingTop: 10 }
              : {},
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.muted}
          multiline={multiline}
          keyboardType={keyboardType ?? "default"}
        />
      </View>
      {hint && (
        <Text style={{ color: C.green, fontSize: 11, marginTop: 4 }}>
          ℹ️ {hint}
        </Text>
      )}
      {hasError && (
        <Text style={s.errorText}>⚠️ {error || validation.error}</Text>
      )}
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DashboardEmpresa() {
  // ── Navigation
  const [activeSection, setActiveSection] = useState<Section>("inicio");
  const [subPage, setSubPage] = useState<SubPage>(null);

  // ── Tabs
  const [horasTab, setHorasTab] = useState<HorasTab>("pendientes");
  const [explorarTab, setExplorarTab] = useState<ExplorarTab>("talentos");

  // ── Crear vacante stepper
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedModality, setSelectedModality] = useState<Modality | null>(
    null,
  );
  const [tituloPuesto, setTituloPuesto] = useState("");
  const [plazas, setPlazas] = useState("");
  const [fechaCierre, setFechaCierre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [requisitos, setRequisitos] = useState("");
  const [rangoSalarial, setRangoSalarial] = useState("");
  const [periodoPago, setPeriodoPago] = useState<PeriodoPago>("mensual");
  const [ubicacion, setUbicacion] = useState<LocationData | null>(null);
  const [googleMapsUrl, setGoogleMapsUrl] = useState("");
  const [preguntas, setPreguntas] = useState<string[]>([""]);
  const [otpInput, setOtpInput] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [emailVerificationMessage, setEmailVerificationMessage] = useState("");
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isSavingVacante, setIsSavingVacante] = useState(false);
  const [horasInicio, setHorasInicio] = useState("");
  const [horasFin, setHorasFin] = useState("");
  const [fechaInicioCond, setFechaInicioCond] = useState("");
  const [fechaFinCond, setFechaFinCond] = useState("");
  const [condGoogleMapsUrl, setCondGoogleMapsUrl] = useState("");
  const [rechazoMotivo, setRechazoMotivo] = useState("");
  const [showRechazoField, setShowRechazoField] = useState(false);
  const [pendingSolicitud, setPendingSolicitud] =
    useState<SolicitudHoras | null>(null);
  const [isLoadingPendingSolicitud, setIsLoadingPendingSolicitud] =
    useState(false);
  const [horasFormErrors, setHorasFormErrors] = useState<
    Record<string, string>
  >({});
  const [availableGroups, setAvailableGroups] = useState<GrupoDisponible[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [selectedAvailableGroup, setSelectedAvailableGroup] =
    useState<GrupoDisponible | null>(null);
  const [showAvailableGroupModal, setShowAvailableGroupModal] = useState(false);
  const [availableGroupStudents, setAvailableGroupStudents] = useState<
    GrupoAlumno[]
  >([]);
  const [isLoadingGroupStudents, setIsLoadingGroupStudents] = useState(false);
  const [convenioHorasInicio, setConvenioHorasInicio] = useState("");
  const [convenioHorasFin, setConvenioHorasFin] = useState("");
  const [convenioFechaInicio, setConvenioFechaInicio] = useState("");
  const [convenioFechaFin, setConvenioFechaFin] = useState("");
  const [convenioGoogleMapsUrl, setConvenioGoogleMapsUrl] = useState("");
  const [convenioFormErrors, setConvenioFormErrors] = useState<
    Record<string, string>
  >({});
  const [convenioSubmitting, setConvenioSubmitting] = useState(false);
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({}); // Errores por campo
  const [showModalityError, setShowModalityError] = useState(false); // Mostrar error solo al hacer click siguiente

  // ── Vacantes state
  const [vacantes, setVacantes] = useState<Vacante[]>(VACANTES_MOCK);
  const [selectedVacante, setSelectedVacante] = useState<Vacante | null>(null);
  const [showVacanteDetail, setShowVacanteDetail] = useState(false);

  // ── Candidato state
  const [selectedCandidato, setSelectedCandidato] = useState<Candidato | null>(
    null,
  );
  const [showCandidatoDetail, setShowCandidatoDetail] = useState(false);

  // ── Publication success modal
  const [publicationSuccess, setPublicationSuccess] = useState(false);

  // ── Perfil panel
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [empresaLogoUrl, setEmpresaLogoUrl] = useState<string | null>(null);
  const [empresaBannerUrl, setEmpresaBannerUrl] = useState<string | null>(null);
  const [currentEmpresaId, setCurrentEmpresaId] = useState<string | null>(null);
  const [empresaName, setEmpresaName] = useState("TechCorp S.A.");
  const [empresaContactEmail, setEmpresaContactEmail] = useState(
    "contacto@techcorp.la",
  );
  const [empresaPhone, setEmpresaPhone] = useState("+503 7000-1234");
  const [empresaLocation, setEmpresaLocation] = useState(
    "San Salvador, El Salvador",
  );
  const [empresaVerified, setEmpresaVerified] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setCurrentEmpresaId(data.user.id);
        supabase
          .from("empresas")
          .select(
            "foto_logo, foto_banner, nombre, telefono, email_corporativo, direccion, departamento, ciudad, rep_nombre, plan_seleccionado",
          )
          .eq("id", data.user.id)
          .single()
          .then(({ data: emp }) => {
            if (emp?.foto_logo) setEmpresaLogoUrl(emp.foto_logo);
            if (emp?.foto_banner) setEmpresaBannerUrl(emp.foto_banner);
            if (emp?.nombre) setEmpresaName(emp.nombre);
            if (emp?.telefono) setEmpresaPhone(emp.telefono);
            if (emp?.email_corporativo)
              setEmpresaContactEmail(emp.email_corporativo);
            const locationParts = [
              emp?.direccion,
              emp?.ciudad,
              emp?.departamento,
            ].filter(Boolean);
            if (locationParts.length)
              setEmpresaLocation(locationParts.join(", "));
            setEmpresaVerified(Boolean(emp?.plan_seleccionado));
            if (emp?.nombre) setCfgNombre(emp.nombre);
            if (emp?.email_corporativo) setCfgEmail(emp.email_corporativo);
            if (emp?.telefono) setCfgTel(emp.telefono);
            if (emp?.nombre) setCfgEmpresa(emp.nombre);
            if (emp?.email_corporativo) setCfgContacto(emp.email_corporativo);
            if (emp?.rep_nombre) setCfgPuesto(emp.rep_nombre);
          });
      }
    });
  }, []);

  // ── Candidate filters
  const [candidateUserFilter, setCandidateUserFilter] =
    useState<CandidateUserFilter>("todos");
  const [candidateStageFilter, setCandidateStageFilter] =
    useState<CandidateStageFilter>("todos");

  // ── Horas cerradas: sub-vistas y evaluaciones
  const [closedViewMode, setClosedViewMode] = useState<"grupo" | "alumnos">(
    "grupo",
  );
  const [selectedGroup, setSelectedGroup] = useState<GrupoCerrado | null>(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<AlumnoGrupo | null>(
    null,
  );
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);
  const [evaluationScores, setEvaluationScores] = useState<
    Record<
      | "puntualidad"
      | "disciplina"
      | "responsabilidad"
      | "respeto"
      | "desempeno",
      number
    >
  >({
    puntualidad: 0,
    disciplina: 0,
    responsabilidad: 0,
    respeto: 0,
    desempeno: 0,
  });
  const [evaluationComment, setEvaluationComment] = useState("");
  const [evaluationErrors, setEvaluationErrors] = useState<
    Record<string, string>
  >({});
  const [isSavingEvaluation, setIsSavingEvaluation] = useState(false);

  // ── Payment filter
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("todos");
  const [companyPlan, setCompanyPlan] = useState<CompanyPlan>("free");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradePlan, setUpgradePlan] = useState<"basic" | "premium" | null>(
    null,
  );
  const [upgradeBillingMode, setUpgradeBillingMode] = useState<
    "monthly" | "annual"
  >("monthly");
  const [upgradeCardNum, setUpgradeCardNum] = useState("");
  const [upgradeCardName, setUpgradeCardName] = useState("");
  const [upgradeCardExp, setUpgradeCardExp] = useState("");
  const [upgradeCardCvv, setUpgradeCardCvv] = useState("");
  const [upgradeErrors, setUpgradeErrors] = useState<Record<string, string>>(
    {},
  );
  const [vacanteLimitError, setVacanteLimitError] = useState("");

  // ── Search
  const [searchQuery, setSearchQuery] = useState("");
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const { language, changeLanguage } = useTranslationContext();
  const [darkMode, setDarkMode] = useState(false);
  const router = useRouter();

  C = darkMode ? themeDark : themeLight;
  s = createStyles(C);

  const toggleLanguage = () => {
    setLanguageMenuOpen((prev) => !prev);
  };

  const toggleTheme = () => {
    setDarkMode((prev) => !prev);
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

  const loadAvailableGroups = async () => {
    setIsLoadingGroups(true);
    const approvedResp = (await supabase
      .from("solicitudes_horas")
      .select("grupo_id")
      .eq("estado", "aprobada")) as any;
    const { data: approvedRequests, error: approvedError } = approvedResp;

    if (approvedError) {
      console.error("Error cargando solicitudes aprobadas:", approvedError);
    }

    const approvedIds = new Set(
      ((approvedRequests ?? []) as any[]).map((item) => (item as any).grupo_id),
    );

    const groupsResp = (await supabase.from("grupos").select("*")) as any;
    const { data: groupsData, error: groupsError } = groupsResp;

    if (groupsError) {
      console.error("Error cargando grupos:", groupsError);
      setIsLoadingGroups(false);
      return;
    }

    const groups = ((groupsData ?? []) as any[])
      .filter((group) => !approvedIds.has((group as any).id))
      .map((group) => {
        const g = group as any;
        return {
          id: g.id,
          nombre: g.nombre_grupo || g.nombre || "Grupo sin nombre",
          descripcion: g.descripcion || g.detalle || "",
          especialidad: g.especialidad || g.carrera || "",
          horasRequeridas: g.horas_requeridas || g.horas || 0,
          periodo: g.periodo || "",
          cierre: g.cierre || "",
        };
      });

    setAvailableGroups(groups);
    setIsLoadingGroups(false);
  };

  const loadPendingSolicitud = async () => {
    setIsLoadingPendingSolicitud(true);
    const resp = (await supabase
      .from("solicitudes_horas")
      .select("*")
      .eq("estado", "pendiente")
      .eq("iniciado_por", "universidad")
      .order("created_at", { ascending: false })
      .limit(1)) as any;

    const { data, error } = resp;
    setIsLoadingPendingSolicitud(false);

    if (error) {
      console.error("Error cargando solicitud pendiente:", error);
      setPendingSolicitud(null);
      return;
    }

    const solicitud = ((data ?? []) as any[])[0] as SolicitudHoras | undefined;
    setPendingSolicitud(solicitud ?? null);
    setShowRechazoField(false);
    setRechazoMotivo("");
    setHorasFormErrors((prev) => ({ ...prev, rechazoMotivo: "" }));
  };

  const loadAvailableGroupStudents = async (groupId: string) => {
    setIsLoadingGroupStudents(true);
    const studentsResp = (await supabase
      .from("estudiantes")
      .select("*")
      .eq("grupo_id", groupId)) as any;
    const { data, error } = studentsResp;

    if (error) {
      console.error("Error cargando estudiantes del grupo:", error);
      setAvailableGroupStudents([]);
      setIsLoadingGroupStudents(false);
      return;
    }

    setAvailableGroupStudents(
      ((data ?? []) as any[]).map((item) => {
        const student = item as any;
        return {
          id: student.id,
          nombre:
            student.nombre_completo ||
            student.name ||
            student.nombre ||
            "Estudiante",
          carrera:
            student.carrera || student.especialidad || student.programa || "",
          estado: student.estado || "Activo",
        };
      }),
    );
    setIsLoadingGroupStudents(false);
  };

  const openAvailableGroupModal = async (group: GrupoDisponible) => {
    setSelectedAvailableGroup(group);
    setShowAvailableGroupModal(true);
    await loadAvailableGroupStudents(group.id);
  };

  const resetConvenioFields = () => {
    setConvenioHorasInicio("");
    setConvenioHorasFin("");
    setConvenioFechaInicio("");
    setConvenioFechaFin("");
    setConvenioGoogleMapsUrl("");
    setConvenioFormErrors({});
  };

  const validateConvenioForm = () => {
    const errors: Record<string, string> = {};
    const horaInicioValidation = validators.hora(convenioHorasInicio);
    const horaFinValidation = validators.hora(convenioHorasFin);
    const fechaInicioValidation = validators.fecha(convenioFechaInicio);
    const fechaFinValidation = validators.fecha(convenioFechaFin);
    const mapValidation = validators.googleMaps(convenioGoogleMapsUrl);

    if (!horaInicioValidation.isValid) {
      errors.convenioHorasInicio =
        horaInicioValidation.error || "Hora inicio inválida";
    }
    if (!horaFinValidation.isValid) {
      errors.convenioHorasFin = horaFinValidation.error || "Hora fin inválida";
    }
    if (!fechaInicioValidation.isValid) {
      errors.convenioFechaInicio =
        fechaInicioValidation.error || "Fecha de inicio inválida";
    }
    if (!fechaFinValidation.isValid) {
      errors.convenioFechaFin =
        fechaFinValidation.error || "Fecha de fin inválida";
    }
    if (!mapValidation.isValid) {
      errors.convenioGoogleMapsUrl = mapValidation.error || "Enlace inválido";
    }

    return errors;
  };

  const handleEnviarConvenio = async () => {
    if (!selectedAvailableGroup) return;
    const errors = validateConvenioForm();
    if (Object.keys(errors).length > 0) {
      setConvenioFormErrors(errors);
      return;
    }

    setConvenioSubmitting(true);
    const payload = {
      grupo_id: selectedAvailableGroup.id,
      estado: "pendiente",
      iniciado_por: "empresa",
      hora_inicio: convenioHorasInicio,
      hora_fin: convenioHorasFin,
      fecha_inicio: convenioFechaInicio,
      fecha_fin: convenioFechaFin,
      google_maps_url: convenioGoogleMapsUrl,
    };

    const { error } = await supabase.from("solicitudes_horas").insert(payload);
    setConvenioSubmitting(false);

    if (error) {
      Alert.alert(
        "Error",
        "No se pudo enviar la oferta de convenio. Intenta de nuevo más tarde.",
      );
      return;
    }

    Alert.alert(
      "Convenio enviado",
      "La oferta de convenio ha sido registrada y queda pendiente de aprobación.",
    );
    setShowAvailableGroupModal(false);
    setSelectedAvailableGroup(null);
    resetConvenioFields();
    loadAvailableGroups();
  };

  useEffect(() => {
    loadAvailableGroups();
  }, []);

  useEffect(() => {
    if (activeSection === "horas-sociales" && horasTab === "pendientes") {
      loadPendingSolicitud();
    }
  }, [activeSection, horasTab]);

  // ── Config
  const [cfgEmpresa, setCfgEmpresa] = useState("TechCorp S.A.");
  const [cfgContacto, setCfgContacto] = useState("contacto@techcorp.la");
  const [cfgPuesto, setCfgPuesto] = useState("María López");
  const [cfgPwdActual, setCfgPwdActual] = useState("");
  const [cfgPwdNew, setCfgPwdNew] = useState("");
  const [cfgPwdConfirm, setCfgPwdConfirm] = useState("");
  const [notifCandidatos, setNotifCandidatos] = useState(true);
  const [notifResumen, setNotifResumen] = useState(true);
  const [notifPagos, setNotifPagos] = useState(false);
  const [cfgNombre, setCfgNombre] = useState("TechCorp S.A.");
  const [cfgEmail, setCfgEmail] = useState("contacto@techcorp.la");
  const [cfgTel, setCfgTel] = useState("+503 7000-1234");
  const [pNotifCand, setPNotifCand] = useState(true);
  const [pNotifPagos, setPNotifPagos] = useState(true);
  const [pNotifVIP, setPNotifVIP] = useState(false);

  // ── Computed
  const filteredCandidates = CANDIDATES.filter((c) => {
    const matchUser =
      candidateUserFilter === "todos" || c.user === candidateUserFilter;
    const matchStage =
      candidateStageFilter === "todos" || c.stage === candidateStageFilter;
    const matchSearch =
      !searchQuery ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.cargo.toLowerCase().includes(searchQuery.toLowerCase());
    return matchUser && matchStage && matchSearch;
  });

  const filteredPayments = PAYMENTS.filter(
    (p) => paymentFilter === "todos" || p.userKey === paymentFilter,
  );

  const companyPlanLabel =
    companyPlan === "free"
      ? "Prueba Gratuita"
      : companyPlan === "basic"
        ? "Básico"
        : "Premium + Verificado";
  const freePlanLimit = companyPlan === "free" ? 3 : Infinity;
  const companyPlanUsageWidth =
    companyPlan === "free"
      ? `${Math.min((vacantes.length / 3) * 100, 100)}%`
      : "70%";
  const canPublishNewVacante =
    companyPlan !== "free" || vacantes.length < freePlanLimit;

  // ── Helpers
  const navigate = (section: Section) => {
    setActiveSection(section);
    setSubPage(null);
  };

  const formatFechaCierre = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    let result = digits;
    if (digits.length > 4)
      result =
        digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4);
    else if (digits.length > 2)
      result = digits.slice(0, 2) + "/" + digits.slice(2);
    return result;
  };

  const validateStep1 = () => {
    const errors: Record<string, string> = {};

    if (!tituloPuesto) {
      errors.tituloPuesto = "Título del puesto es obligatorio";
    } else if (!/^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s]+$/.test(tituloPuesto)) {
      errors.tituloPuesto = "Solo se permiten letras";
    }

    const p = parseInt(plazas);
    if (!plazas || isNaN(p) || p < 1 || p > 100) {
      errors.plazas = "Ingresa un número entre 1 y 100";
    }

    if (!fechaCierre || !/^\d{2}\/\d{2}\/\d{4}$/.test(fechaCierre)) {
      errors.fechaCierre = "Formato DD/MM/AAAA requerido";
    } else {
      const [dd, mm, aaaa] = fechaCierre.split("/").map(Number);
      if (dd < 1 || dd > 31) {
        errors.fechaCierre = "Día debe estar entre 01 y 31";
      } else if (mm < 1 || mm > 12) {
        errors.fechaCierre = "Mes debe estar entre 01 y 12";
      } else if (aaaa < 2026 || aaaa > 2027) {
        errors.fechaCierre = "Año debe estar entre 2026 y 2027";
      }
    }

    if (!selectedModality) {
      errors.modalidad = "Debes seleccionar una modalidad";
    }

    if (
      (selectedModality === "presencial" || selectedModality === "hibrido") &&
      !ubicacion?.departamento
    ) {
      errors.departamento = "Selecciona un departamento";
    }

    if (
      (selectedModality === "presencial" || selectedModality === "hibrido") &&
      !ubicacion?.municipio
    ) {
      errors.municipio = "Selecciona una ciudad";
    }

    if (
      (selectedModality === "presencial" || selectedModality === "hibrido") &&
      !googleMapsUrl.trim()
    ) {
      errors.googleMaps = "Enlace de Google Maps es obligatorio";
    } else if (
      (selectedModality === "presencial" || selectedModality === "hibrido") &&
      !googleMapsUrl.startsWith("https://maps.app.goo.gl/")
    ) {
      errors.googleMaps =
        "El enlace debe comenzar con https://maps.app.goo.gl/";
    }

    return errors;
  };

  const validateStep2 = () => {
    const errors: Record<string, string> = {};
    if (!descripcion) {
      errors.descripcion = "Descripción del puesto es obligatoria";
    }
    if (!requisitos) {
      errors.requisitos = "Requisitos son obligatorios";
    }
    if (!rangoSalarial) {
      errors.rangoSalarial = "Rango salarial es obligatorio";
    } else {
      const n = parseInt(rangoSalarial.replace(/,/g, ""));
      if (isNaN(n) || n <= 99 || n >= 2501) {
        errors.rangoSalarial = "Valor entre $100 y $2,500";
      }
    }
    return errors;
  };

  const validateStep3 = () => {
    const errors: Record<string, string> = {};
    preguntas.forEach((p, i) => {
      if (!p) {
        errors[`pregunta_${i}`] = "Está vacía — complétala o elimínala";
      } else if (!/^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s¿?¡!.,]+$/.test(p)) {
        errors[`pregunta_${i}`] = "Solo se permiten letras";
      }
    });
    return errors;
  };

  const validateCondicionesForm = () => {
    const errors: Record<string, string> = {};
    const horaInicioValidation = validators.hora(horasInicio);
    const horaFinValidation = validators.hora(horasFin);
    const fechaInicioValidation = validators.fecha(fechaInicioCond);
    const fechaFinValidation = validators.fecha(fechaFinCond);
    const mapValidation = validators.googleMaps(condGoogleMapsUrl);

    if (!horaInicioValidation.isValid) {
      errors.horasInicio = horaInicioValidation.error || "Hora inicio inválida";
    }
    if (!horaFinValidation.isValid) {
      errors.horasFin = horaFinValidation.error || "Hora fin inválida";
    }
    if (!fechaInicioValidation.isValid) {
      errors.fechaInicioCond =
        fechaInicioValidation.error || "Fecha de inicio inválida";
    }
    if (!fechaFinValidation.isValid) {
      errors.fechaFinCond = fechaFinValidation.error || "Fecha de fin inválida";
    }
    if (!mapValidation.isValid) {
      errors.condGoogleMapsUrl = mapValidation.error || "Enlace inválido";
    }

    return errors;
  };

  const handleEnviarCondiciones = async () => {
    const errors = validateCondicionesForm();
    if (Object.keys(errors).length > 0) {
      setHorasFormErrors(errors);
      return;
    }

    if (!pendingSolicitud?.id) {
      Alert.alert("Error", "No hay una solicitud pendiente para actualizar.");
      return;
    }

    setHorasFormErrors({});
    const { error } = await supabase
      .from("solicitudes_horas")
      .update({
        hora_inicio: horasInicio,
        hora_fin: horasFin,
        fecha_inicio: fechaInicioCond,
        fecha_fin: fechaFinCond,
        google_maps_url: condGoogleMapsUrl,
        estado: "en_revision",
        decision_universidad: "pendiente",
      })
      .eq("id", pendingSolicitud.id);

    if (error) {
      console.error("Error enviando condiciones:", error);
      Alert.alert(
        "Error",
        "No se pudo enviar la propuesta de condiciones. Intenta de nuevo.",
      );
      return;
    }

    setHorasTab("revision");
    setShowRechazoField(false);
    Alert.alert("Condiciones enviadas", "La solicitud ha pasado a revisión.");
    loadPendingSolicitud();
  };

  const handleEnviarRechazo = async () => {
    const validation = validators.alphanumeric(rechazoMotivo);
    if (!validation.isValid) {
      setHorasFormErrors({
        rechazoMotivo: validation.error || "Motivo inválido",
      });
      return;
    }
    setHorasFormErrors({});

    if (!pendingSolicitud?.id) {
      Alert.alert("Error", "No hay una solicitud pendiente para rechazar.");
      return;
    }

    const { error } = await supabase
      .from("solicitudes_horas")
      .update({
        estado: "cerrada",
        motivo_rechazo: rechazoMotivo.trim(),
        decision_universidad: "pendiente",
      })
      .eq("id", pendingSolicitud.id);

    if (error) {
      console.error("Error rechazando solicitud:", error);
      Alert.alert("Error", "No fue posible rechazar la solicitud.");
      return;
    }

    setShowRechazoField(false);
    setRechazoMotivo("");
    setHorasTab("cerradas");
    Alert.alert("Solicitud rechazada", "Rechazo enviado con justificación.");
    loadPendingSolicitud();
  };

  const validateEvaluation = () => {
    const errors: Record<string, string> = {};
    const hasScore = Object.values(evaluationScores).some((value) => value > 0);
    if (!hasScore) {
      errors.evaluacion = "Califica al menos un criterio";
    }
    const commentTrim = evaluationComment.trim();
    if (commentTrim && !/^[a-zA-ZÁÉÍÓÚáéíóúÜüÑñ0-9\s]+$/.test(commentTrim)) {
      errors.comment = "Solo letras y números permitidos";
    }
    return errors;
  };

  const resetEvaluationForm = () => {
    setEvaluationScores({
      puntualidad: 0,
      disciplina: 0,
      responsabilidad: 0,
      respeto: 0,
      desempeno: 0,
    });
    setEvaluationComment("");
    setEvaluationErrors({});
  };

  const openGroupModal = (group: GrupoCerrado) => {
    setSelectedGroup(group);
    setShowGroupModal(true);
  };

  const openEvaluationModal = (student: AlumnoGrupo) => {
    setSelectedStudent(student);
    resetEvaluationForm();
    setShowEvaluationModal(true);
  };

  const handleSaveEvaluation = async () => {
    const errors = validateEvaluation();
    if (Object.keys(errors).length > 0) {
      setEvaluationErrors(errors);
      return;
    }
    setEvaluationErrors({});
    setIsSavingEvaluation(true);
    const commentTrim = evaluationComment.trim();
    const payload = {
      estudiante_id: selectedStudent?.id,
      estudiante_nombre: selectedStudent?.name,
      grupo_id: selectedStudent?.grupoId,
      puntualidad: evaluationScores.puntualidad,
      disciplina: evaluationScores.disciplina,
      responsabilidad: evaluationScores.responsabilidad,
      respeto: evaluationScores.respeto,
      desempeno: evaluationScores.desempeno,
      comentario: commentTrim ? commentTrim : null,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("evaluaciones_alumnos")
      .insert(payload);
    setIsSavingEvaluation(false);
    if (error) {
      console.error("Error guardando evaluación:", error);
      Alert.alert(
        "Error",
        "No fue posible guardar la evaluación. Intenta de nuevo.",
      );
      return;
    }

    Alert.alert(
      "Evaluación guardada",
      "La evaluación del estudiante se ha registrado correctamente.",
    );
    setShowEvaluationModal(false);
    setSelectedStudent(null);
    resetEvaluationForm();
  };

  const generateOtpCode = () =>
    Math.floor(100000 + Math.random() * 900000).toString();

  const handleSendOtp = () => {
    const targetEmail = cfgEmail || cfgContacto || "contacto@techcorp.la";
    const newCode = generateOtpCode();
    setOtpCode(newCode);
    setOtpSent(true);
    setOtpInput("");
    setOtpError("");
    setEmailVerificationMessage(
      `Se ha enviado el código OTP a ${targetEmail}. Revisa tu correo.`,
    );
    Alert.alert(
      "Código enviado",
      `Revisa ${targetEmail} e ingresa el código para continuar.`,
    );
    console.log("OTP generado:", newCode);
  };

  const handleSaveVacante = async (nuevaVacante: Vacante) => {
    const payload = {
      puesto: nuevaVacante.puesto,
      modalidad: nuevaVacante.modalidad,
      plazas: nuevaVacante.plazas,
      candidatos: nuevaVacante.candidatos,
      vistas: nuevaVacante.vistas,
      cierre: nuevaVacante.cierre,
      estado: nuevaVacante.estado,
      descripcion: nuevaVacante.descripcion,
      requisitos: nuevaVacante.requisitos,
      rango_salarial: nuevaVacante.rangoSalarial,
      periodo_pago: nuevaVacante.periodoPago,
      ubicacion: nuevaVacante.ubicacion
        ? JSON.stringify(nuevaVacante.ubicacion)
        : null,
      preguntas: nuevaVacante.preguntas,
      metodo_pago: nuevaVacante.metodoPago,
      fecha_creacion: nuevaVacante.fechaCreacion,
      empresa_email: cfgEmail || cfgContacto || null,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("vacantes").insert(payload);
    if (error) {
      console.error("Error insertando vacante:", error);
      throw error;
    }
  };

  const handleFinalVerification = async () => {
    if (!otpSent) {
      setStepErrors({ otp: "Debes enviar el código OTP antes de continuar." });
      setOtpError("Debes enviar el código OTP antes de continuar.");
      return;
    }
    if (!otpInput) {
      setStepErrors({ otp: "Ingresa el código OTP" });
      setOtpError("Ingresa el código OTP");
      return;
    }
    if (otpInput !== otpCode) {
      setStepErrors({ otp: "OTP incorrecto. Verifica el código enviado." });
      setOtpError("OTP incorrecto. Verifica el código enviado.");
      return;
    }

    setStepErrors({});
    setOtpError("");
    setIsSavingVacante(true);

    const salarial = rangoSalarial.replace(/,/g, "");
    const nuevaVacante: Vacante = {
      id: Date.now().toString(),
      puesto: tituloPuesto,
      modalidad: selectedModality!,
      plazas: parseInt(plazas),
      candidatos: 0,
      vistas: 0,
      cierre: fechaCierre,
      estado: "Activa",
      descripcion,
      requisitos,
      rangoSalarial: `$${parseInt(salarial).toLocaleString()} / ${
        periodoPago === "mensual" ? "mes" : "quincena"
      }`,
      periodoPago,
      ubicacion: ubicacion || undefined,
      preguntas: preguntas.filter(Boolean),
      metodoPago: "tarjeta",
      fechaCreacion: new Date().toLocaleDateString("es-SV"),
    };

    try {
      await handleSaveVacante(nuevaVacante);
      setVacantes((prev) => [nuevaVacante, ...prev]);
      setPublicationSuccess(true);
      Alert.alert(
        "Verificación exitosa",
        "Código OTP correcto. Tu vacante se ha guardado correctamente.",
      );
      setTimeout(() => {
        setPublicationSuccess(false);
        resetForm();
        navigate("vacantes");
      }, 2000);
    } catch (error: any) {
      setStepErrors({
        form:
          error?.message ||
          "Ocurrió un error guardando la vacante. Intenta de nuevo.",
      });
    } finally {
      setIsSavingVacante(false);
    }
  };

  const handleStepperNext = () => {
    let errors: Record<string, string> = {};
    if (currentStep === 1) {
      errors = validateStep1();
      setShowModalityError(true);
    }
    if (currentStep === 2) errors = validateStep2();
    if (currentStep === 3) errors = validateStep3();

    if (Object.keys(errors).length > 0) {
      setStepErrors(errors);
      return;
    }
    setStepErrors({});

    if (
      currentStep === 3 &&
      companyPlan === "free" &&
      vacantes.length >= freePlanLimit
    ) {
      setStepErrors({
        form: "En Prueba Gratuita solo puedes publicar hasta 3 vacantes activas. Actualiza tu plan para publicar más.",
      });
      return;
    }

    if (currentStep < 4) {
      setCurrentStep((s) => s + 1);
    } else {
      handleFinalVerification();
    }
  };

  const handleStepperPrev = () => {
    if (currentStep > 1) {
      setCurrentStep((s) => s - 1);
      setStepErrors({});
      setShowModalityError(false);
    }
  };

  const validateUpgrade = () => {
    const errs: Record<string, string> = {};
    if (!upgradePlan) errs.plan = "Selecciona un plan para actualizar.";
    if (!upgradeCardNum.replace(/\s/g, ""))
      errs.cardNum = "Número de tarjeta es requerido.";
    else if (upgradeCardNum.replace(/\s/g, "").length !== 16)
      errs.cardNum = "Número de tarjeta inválido.";
    if (!upgradeCardName.trim())
      errs.cardName = "Titular de la tarjeta es requerido.";
    if (!/^\d{2}\/\d{2}$/.test(upgradeCardExp))
      errs.cardExp = "Fecha MM/AA requerida.";
    else {
      const [month] = upgradeCardExp.split("/").map(Number);
      if (month < 1 || month > 12) errs.cardExp = "Mes debe ser entre 01 y 12.";
    }
    if (!/^\d{3,4}$/.test(upgradeCardCvv))
      errs.cardCvv = "CVV debe tener 3 o 4 dígitos.";
    setUpgradeErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSavePlanAndPay = async () => {
    if (!validateUpgrade()) return;
    try {
      await updateEmpresaPlan({
        plan_seleccionado: upgradePlan || undefined,
        plan_facturacion: upgradeBillingMode,
        card_num: upgradeCardNum.replace(/\s/g, ""),
        card_exp: upgradeCardExp,
        card_cvv: upgradeCardCvv,
      });
      setCompanyPlan(upgradePlan!);
      setShowUpgradeModal(false);
      setVacanteLimitError("");
      setUpgradePlan(null);
      setUpgradeCardNum("");
      setUpgradeCardName("");
      setUpgradeCardExp("");
      setUpgradeCardCvv("");
      setUpgradeErrors({});
      Alert.alert(
        "¡Plan mejorado con éxito!",
        "Tu plan se ha actualizado correctamente.",
      );
    } catch (error: any) {
      Alert.alert(
        "Error actualizando plan",
        error?.message || "No fue posible actualizar el plan.",
      );
    }
  };

  const resetForm = () => {
    setCurrentStep(1);
    setSelectedModality(null);
    setTituloPuesto("");
    setPlazas("");
    setFechaCierre("");
    setDescripcion("");
    setRequisitos("");
    setRangoSalarial("");
    setPeriodoPago("mensual");
    setUbicacion(null);
    setGoogleMapsUrl("");
    setPreguntas([""]);
    setOtpInput("");
    setOtpError("");
    setOtpCode("");
    setOtpSent(false);
    setEmailVerificationMessage("");
    setIsVerifyingOtp(false);
    setIsSavingVacante(false);
    setStepErrors({});
    setShowModalityError(false);
  };

  const starRating = (rating: number) => {
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5;
    let stars = "";
    for (let i = 0; i < full; i++) stars += "⭐";
    if (half) stars += "✨";
    return stars;
  };

  // ── Renderers ─────────────────────────────────────────────────────────────

  /** BOTTOM NAV */
  const renderBottomNav = () => (
    <View style={s.bottomNav}>
      {EMPRESA_BOTTOM_NAV.map((item) => {
        const active = activeSection === item.key && !subPage;
        return (
          <TouchableOpacity
            key={item.key}
            style={s.bottomNavItem}
            onPress={() => navigate(item.key)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={
                active ? (item.icon.replace("-outline", "") as any) : item.icon
              }
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
  );

  /** TOPBAR */
  const renderTopbar = () => (
    <View style={s.topbar}>
      <View style={s.brandRow}>
        <View style={s.brandBadge}>
          <Text style={s.brandBadgeText}>G</Text>
        </View>
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <TranslatedText style={s.companyName}>TechCorp S.A.</TranslatedText>
        <TranslatedText style={s.companyVerified}>Verificada ✓</TranslatedText>
      </View>
      <View style={s.topbarRight}>
        <View style={s.searchBox}>
          <TextInput
            style={s.searchInput}
            placeholder={"Buscar..."}
            placeholderTextColor={C.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <Ionicons name="search-outline" size={16} color={C.muted} />
        </View>
        <TouchableOpacity
          style={s.notifBtn}
          onPress={toggleTheme}
          accessibilityLabel={"Cambiar tema"}
        >
          <Ionicons
            name={darkMode ? "sunny-outline" : "moon-outline"}
            size={22}
            color={C.muted}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={s.notifBtn}
          onPress={toggleLanguage}
          accessibilityLabel={"Cambiar idioma"}
        >
          <Ionicons name="planet-outline" size={22} color={C.muted} />
        </TouchableOpacity>
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
        <TouchableOpacity
          style={s.notifBtn}
          onPress={() => navigate("notificaciones")}
          accessibilityLabel={"Notificaciones"}
        >
          <Ionicons name="notifications-outline" size={22} color={C.muted} />
          <View style={s.notifBadge}>
            <Text style={s.navBadgeText}>3</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.notifBtn}
          onPress={onLogout}
          accessibilityLabel={"Cerrar sesión"}
        >
          <Ionicons name="log-out-outline" size={22} color={C.muted} />
        </TouchableOpacity>
      </View>
    </View>
  );

  /** 1. INICIO */
  const renderInicio = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.sectionContent}
    >
      <SectionTitle text="Inicio" />
      <Text style={s.subtitle}>Resumen general de tu actividad en Gradly</Text>
      <View style={s.grid2}>
        {[
          {
            icon: "📋",
            num: "12",
            label: "Vacantes activas",
            trend: "↗️ +2",
            pos: true,
          },
          {
            icon: "👥",
            num: "45",
            label: "Candidatos este mes",
            trend: "↗️ +15",
            pos: true,
          },
          {
            icon: "📅",
            num: "8",
            label: "Entrevistas agendadas",
            trend: "↘️ -1",
            pos: false,
          },
          {
            icon: "✅",
            num: "5",
            label: "Contrataciones realizadas",
            trend: "↗️ +3",
            pos: true,
          },
        ].map((m) => (
          <Card key={m.label} style={s.metricCard}>
            <Text style={s.metricIcon}>{m.icon}</Text>
            <Text style={s.metricNumber}>{m.num}</Text>
            <Text style={s.metricLabel}>{m.label}</Text>
            <Text style={[s.metricTrend, m.pos ? s.trendPos : s.trendNeg]}>
              {m.trend}
            </Text>
          </Card>
        ))}
      </View>
      <Card style={{ marginTop: 16 }}>
        <Text style={s.cardTitle}>Estado del plan</Text>
        <Text style={[s.muted, { marginBottom: 12, fontSize: 13 }]}>
          Plan actual: {companyPlanLabel}
        </Text>
        <View style={s.planBar}>
          <View
            style={[s.planBarFill, { width: companyPlanUsageWidth as any }]}
          />
        </View>
        <Text style={[s.muted, { marginTop: 6, fontSize: 13 }]}>
          {companyPlan === "free"
            ? `Has publicado ${vacantes.length} de 3 vacantes gratuitas.`
            : "75% de uso mensual"}
        </Text>
        {companyPlan === "free" && (
          <Text style={[s.successText, { marginTop: 8 }]}>
            Actualiza tu plan para publicar más vacantes y obtener badge
            verificado.
          </Text>
        )}
      </Card>
      <SectionTitle text="Grupos sin convenio vigente" />
      {isLoadingGroups ? (
        <Card>
          <Text style={[s.muted, { textAlign: "center", padding: 24 }]}>
            Cargando grupos disponibles...
          </Text>
        </Card>
      ) : availableGroups.length === 0 ? (
        <Card>
          <Text style={[s.muted, { textAlign: "center", padding: 24 }]}>
            No hay grupos disponibles sin convenio vigente.
          </Text>
        </Card>
      ) : (
        <View style={{ gap: 12, marginTop: 12 }}>
          {availableGroups.map((group) => (
            <TouchableOpacity
              key={group.id}
              style={[s.card, { padding: 16 }]}
              onPress={() => openAvailableGroupModal(group)}
            >
              <Text style={s.subsectionTitle}>{group.nombre}</Text>
              <Text style={[s.muted, { marginTop: 8 }]}>
                {group.descripcion}
              </Text>
              <View
                style={[
                  s.row,
                  { justifyContent: "space-between", marginTop: 12 },
                ]}
              >
                <Text style={s.career}>{group.especialidad}</Text>
                <Text style={s.career}>Cierre {group.cierre}</Text>
              </View>
              <Text style={[s.muted, { marginTop: 10 }]}>
                Horario requerido: {group.horasRequeridas} horas
              </Text>
              <View style={{ marginTop: 14, alignItems: "flex-end" }}>
                <View
                  style={[
                    s.btnPrimary,
                    { paddingVertical: 8, paddingHorizontal: 12 },
                  ]}
                >
                  <Text style={s.btnPrimaryText}>Ofrecer convenio</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );

  /** 2. VACANTES */
  const renderVacantes = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.sectionContent}
    >
      <View style={s.sectionHeaderRow}>
        <SectionTitle text="Mis vacantes" />
        <TouchableOpacity
          style={s.btnPrimary}
          onPress={() => {
            if (!canPublishNewVacante) {
              setVacanteLimitError(
                "En Prueba Gratuita solo puedes publicar hasta 3 vacantes activas. Actualiza tu plan para publicar más.",
              );
              return;
            }
            setVacanteLimitError("");
            resetForm();
            navigate("crear-vacante");
          }}
          disabled={!canPublishNewVacante}
        >
          <Ionicons
            name="add-circle-outline"
            size={16}
            color="#fff"
            style={{ marginRight: 4 }}
          />
          <Text style={s.btnPrimaryText}>
            {canPublishNewVacante ? "Publicar nueva" : "Límite alcanzado"}
          </Text>
        </TouchableOpacity>
      </View>

      {companyPlan === "free" && (
        <View style={s.upgradeBanner}>
          <Text style={s.upgradeBannerTitle}>
            Estás usando el plan gratuito.
          </Text>
          <Text style={s.upgradeBannerText}>
            Para publicar más de 3 vacantes y desbloquear todas las funciones,
            mejora tu plan.
          </Text>
          <TouchableOpacity
            style={[s.btnPrimary, { alignSelf: "flex-start", marginTop: 8 }]}
            onPress={() => setShowUpgradeModal(true)}
          >
            <Text style={s.btnPrimaryText}>Mejorar Plan</Text>
          </TouchableOpacity>
        </View>
      )}

      {vacanteLimitError ? (
        <Text style={s.errorText}>{vacanteLimitError}</Text>
      ) : null}

      {vacantes.map((vacante) => (
        <TouchableOpacity
          key={vacante.id}
          onPress={() => {
            setSelectedVacante(vacante);
            setShowVacanteDetail(true);
          }}
          style={[s.card, { marginBottom: 12 }]}
        >
          <View style={s.vacanteHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.vacanteTitle}>{vacante.puesto}</Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 4,
                  flexWrap: "wrap",
                }}
              >
                <View
                  style={[
                    s.modalityBadge,
                    vacante.modalidad === "remoto" && {
                      backgroundColor: C.purpleDim,
                      borderColor: C.purpleBorder,
                    },
                    vacante.modalidad === "presencial" && {
                      backgroundColor: "rgba(245,158,11,0.15)",
                      borderColor: "rgba(245,158,11,0.4)",
                    },
                    vacante.modalidad === "hibrido" && {
                      backgroundColor: "rgba(6,182,212,0.15)",
                      borderColor: "rgba(6,182,212,0.4)",
                    },
                  ]}
                >
                  <Ionicons
                    name={
                      vacante.modalidad === "remoto"
                        ? "home-outline"
                        : vacante.modalidad === "presencial"
                          ? "location-outline"
                          : "git-merge-outline"
                    }
                    size={12}
                    color={
                      vacante.modalidad === "remoto"
                        ? C.purple
                        : vacante.modalidad === "presencial"
                          ? "#f59e0b"
                          : "#06b6d4"
                    }
                  />
                  <Text
                    style={[
                      s.modalityBadgeText,
                      {
                        color:
                          vacante.modalidad === "remoto"
                            ? C.purple
                            : vacante.modalidad === "presencial"
                              ? "#f59e0b"
                              : "#06b6d4",
                      },
                    ]}
                  >
                    {vacante.modalidad === "remoto"
                      ? "Remoto"
                      : vacante.modalidad === "presencial"
                        ? "Presencial"
                        : "Híbrido"}
                  </Text>
                </View>
                {(vacante.modalidad === "presencial" ||
                  vacante.modalidad === "hibrido") &&
                  vacante.ubicacion && (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Ionicons
                        name="business-outline"
                        size={11}
                        color={C.muted}
                      />
                      <Text style={{ color: C.muted, fontSize: 11 }}>
                        {vacante.ubicacion.municipio},{" "}
                        {vacante.ubicacion.departamento}
                      </Text>
                    </View>
                  )}
              </View>
            </View>
            <Badge label={vacante.estado} type="active" />
          </View>

          <View style={s.vacanteStats}>
            <View style={s.vacanteStatItem}>
              <Ionicons name="people-outline" size={13} color={C.muted} />
              <Text style={s.vacanteStatLabel}>Candidatos</Text>
              <Text style={s.vacanteStatValue}>{vacante.candidatos}</Text>
            </View>
            <View style={s.vacanteStatItem}>
              <Ionicons name="eye-outline" size={13} color={C.muted} />
              <Text style={s.vacanteStatLabel}>Vistas</Text>
              <Text style={s.vacanteStatValue}>{vacante.vistas}</Text>
            </View>
            <View style={s.vacanteStatItem}>
              <Ionicons name="calendar-outline" size={13} color={C.muted} />
              <Text style={s.vacanteStatLabel}>Cierre</Text>
              <Text style={s.vacanteStatValue}>{vacante.cierre}</Text>
            </View>
            <View style={s.vacanteStatItem}>
              <Ionicons name="briefcase-outline" size={13} color={C.muted} />
              <Text style={s.vacanteStatLabel}>Plazas</Text>
              <Text style={s.vacanteStatValue}>{vacante.plazas}</Text>
            </View>
          </View>
          <View
            style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}
          >
            <Ionicons name="cash-outline" size={13} color={C.green} />
            <Text style={{ color: C.green, fontSize: 12, marginLeft: 4 }}>
              {vacante.rangoSalarial}
            </Text>
          </View>
        </TouchableOpacity>
      ))}

      {vacantes.length === 0 && (
        <Card>
          <Text style={[s.muted, { textAlign: "center", padding: 24 }]}>
            No tienes vacantes publicadas. ¡Crea una ahora!
          </Text>
        </Card>
      )}
    </ScrollView>
  );

  /** 3. CANDIDATOS */
  const renderCandidatos = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.sectionContent}
    >
      <SectionTitle text="Candidatos" />
      <Text style={s.subtitle}>Gestiona y examina el pipeline de talento.</Text>

      <Text style={s.filterLabel}>Usuario:</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 12 }}
      >
        <View style={s.filterRow}>
          {(
            [
              "todos",
              "rrhh",
              "reclutador",
              "directivo",
            ] as CandidateUserFilter[]
          ).map((f) => (
            <FilterPill
              key={f}
              label={f.charAt(0).toUpperCase() + f.slice(1)}
              active={candidateUserFilter === f}
              onPress={() => setCandidateUserFilter(f)}
            />
          ))}
        </View>
      </ScrollView>

      <Text style={s.filterLabel}>Etapa:</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 16 }}
      >
        <View style={s.filterRow}>
          {(
            [
              { key: "todos", label: "Todos" },
              { key: "activos", label: "Activos" },
              { key: "entrevistas", label: "Por entrevistar" },
              { key: "contratados", label: "Contratados" },
            ] as { key: CandidateStageFilter; label: string }[]
          ).map((f) => (
            <FilterPill
              key={f.key}
              label={f.label}
              active={candidateStageFilter === f.key}
              onPress={() => setCandidateStageFilter(f.key)}
            />
          ))}
        </View>
      </ScrollView>

      {filteredCandidates.map((c) => (
        <TouchableOpacity
          key={c.id}
          onPress={() => {
            setSelectedCandidato(c);
            setShowCandidatoDetail(true);
          }}
          style={[s.card, { marginBottom: 10 }]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={s.candidatoAvatar}>
              <Text
                style={{ color: C.purple, fontWeight: "900", fontSize: 18 }}
              >
                {c.name.charAt(0)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontWeight: "700", fontSize: 14 }}>
                {c.name}
              </Text>
              <Text style={{ color: C.muted, fontSize: 12 }}>{c.cargo}</Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 4,
                }}
              >
                <Text style={{ color: C.yellow, fontSize: 11 }}>
                  {starRating(c.calificacion)} {c.calificacion}
                </Text>
                <Text style={{ color: C.muted, fontSize: 11 }}>
                  • {c.universidad}
                </Text>
              </View>
            </View>
            <View style={{ alignItems: "flex-end", gap: 6 }}>
              <Badge label={c.badge} type={c.badgeType} />
              <Text style={{ color: C.muted, fontSize: 11 }}>{c.fecha}</Text>
            </View>
          </View>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 6,
              marginTop: 10,
            }}
          >
            {c.skills.slice(0, 3).map((sk) => (
              <View key={sk} style={s.skillPill}>
                <Text style={s.skillPillText}>{sk}</Text>
              </View>
            ))}
            {c.skills.length > 3 && (
              <View style={s.skillPill}>
                <Text style={s.skillPillText}>+{c.skills.length - 3}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      ))}

      {filteredCandidates.length === 0 && (
        <Card>
          <Text style={[s.muted, { padding: 16, textAlign: "center" }]}>
            No hay candidatos para estos filtros.
          </Text>
        </Card>
      )}
    </ScrollView>
  );

  /** 4. HORAS SOCIALES */
  const renderHorasSociales = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.sectionContent}
    >
      <SectionTitle text="Horas sociales" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 16 }}
      >
        <View style={s.tabRow}>
          {(
            [
              { key: "pendientes", label: "Pendientes" },
              { key: "revision", label: "En revisión" },
              { key: "aprobadas", label: "Aprobadas" },
              { key: "cerradas", label: "Cerradas" },
            ] as { key: HorasTab; label: string }[]
          ).map((t) => (
            <TabBtn
              key={t.key}
              label={t.label}
              active={horasTab === t.key}
              onPress={() => setHorasTab(t.key)}
            />
          ))}
        </View>
      </ScrollView>
      {horasTab === "pendientes" && (
        <Card>
          <SectionTitle text="Solicitudes pendientes" />

          {isLoadingPendingSolicitud ? (
            <Text style={[s.muted, { paddingVertical: 14 }]}>
              Cargando solicitud pendiente...
            </Text>
          ) : !pendingSolicitud ? (
            <Text style={[s.muted, { paddingVertical: 14 }]}>
              No hay solicitudes pendientes.
            </Text>
          ) : (
            <>
              <Text style={[s.muted, { marginBottom: 14 }]}>
                ID: {String(pendingSolicitud.id).slice(0, 8)} • Iniciada por:{" "}
                {pendingSolicitud.iniciado_por === "universidad"
                  ? "Universidad"
                  : "Empresa"}
              </Text>

              <SectionTitle text="Evaluar solicitud" />
              <ValidatedInput
                label="Hora de inicio"
                value={horasInicio}
                onChangeText={(v) => {
                  setHorasInicio(v);
                  setHorasFormErrors((prev) => ({ ...prev, horasInicio: "" }));
                }}
                placeholder="08:00"
                validator={validators.hora}
                error={horasFormErrors.horasInicio}
              />
              <ValidatedInput
                label="Hora de fin"
                value={horasFin}
                onChangeText={(v) => {
                  setHorasFin(v);
                  setHorasFormErrors((prev) => ({ ...prev, horasFin: "" }));
                }}
                placeholder="17:00"
                validator={validators.hora}
                error={horasFormErrors.horasFin}
              />
              <ValidatedInput
                label="Fecha de inicio"
                value={fechaInicioCond}
                onChangeText={(v) => {
                  setFechaInicioCond(v);
                  setHorasFormErrors((prev) => ({
                    ...prev,
                    fechaInicioCond: "",
                  }));
                }}
                placeholder="01/06/2026"
                validator={validators.fecha}
                error={horasFormErrors.fechaInicioCond}
              />
              <ValidatedInput
                label="Fecha de fin"
                value={fechaFinCond}
                onChangeText={(v) => {
                  setFechaFinCond(v);
                  setHorasFormErrors((prev) => ({ ...prev, fechaFinCond: "" }));
                }}
                placeholder="31/08/2026"
                validator={validators.fecha}
                error={horasFormErrors.fechaFinCond}
              />
              <ValidatedInput
                label="Enlace de Google Maps"
                value={condGoogleMapsUrl}
                onChangeText={(v) => {
                  setCondGoogleMapsUrl(v);
                  setHorasFormErrors((prev) => ({
                    ...prev,
                    condGoogleMapsUrl: "",
                  }));
                }}
                placeholder="https://maps.app.goo.gl/..."
                validator={validators.googleMaps}
                error={horasFormErrors.condGoogleMapsUrl}
              />

              <View style={{ marginBottom: 14 }}>
                <Text style={s.inputLabel}>Contacto de la universidad</Text>
                <Text style={{ color: C.text, marginBottom: 6 }}>
                  Facebook: facebook.com/universidad
                </Text>
                <Text style={{ color: C.text, marginBottom: 6 }}>
                  Instagram: instagram.com/universidad
                </Text>
                <Text style={{ color: C.text }}>
                  Correo: contacto@universidad.edu.sv
                </Text>
              </View>

              <View style={[s.rowGap, { marginTop: 16 }]}>
                <TouchableOpacity
                  style={[s.btnPrimary, { flex: 1 }]}
                  onPress={handleEnviarCondiciones}
                >
                  <Text style={s.btnPrimaryText}>Enviar condiciones</Text>
                </TouchableOpacity>

                {pendingSolicitud.iniciado_por === "universidad" && (
                  <TouchableOpacity
                    style={[s.btnReject, { flex: 1 }]}
                    onPress={() => setShowRechazoField(true)}
                  >
                    <Text style={s.btnRejectText}>Rechazar</Text>
                  </TouchableOpacity>
                )}
              </View>

              {showRechazoField &&
                pendingSolicitud.iniciado_por === "universidad" && (
                  <View style={{ marginTop: 18 }}>
                    <ValidatedInput
                      label="Motivo de rechazo (obligatorio)"
                      value={rechazoMotivo}
                      onChangeText={(v) => {
                        setRechazoMotivo(v);
                        setHorasFormErrors((prev) => ({
                          ...prev,
                          rechazoMotivo: "",
                        }));
                      }}
                      placeholder="Justifica el rechazo"
                      validator={validators.alphanumeric}
                      error={horasFormErrors.rechazoMotivo}
                    />
                    <TouchableOpacity
                      style={s.btnOutline}
                      onPress={handleEnviarRechazo}
                    >
                      <Text style={s.btnOutlineText}>Enviar rechazo</Text>
                    </TouchableOpacity>
                  </View>
                )}
            </>
          )}
        </Card>
      )}
      {horasTab === "aprobadas" && (
        <Card style={s.studentCard}>
          <View style={s.studentAvatarWrapper}>
            <Text style={{ fontSize: 28 }}>👩‍🎓</Text>
            <View style={[s.statusDot, { backgroundColor: C.green }]} />
          </View>
          <View style={{ flex: 1, marginLeft: 16 }}>
            <Text style={s.studentName}>María González</Text>
            <Text style={s.career}>Ingeniería en Sistemas</Text>
            <View style={s.progressBar}>
              <View style={[s.progressFill, { width: "60%" }]} />
            </View>
            <Text style={s.progressText}>60 horas completadas de 100</Text>
          </View>
          <TouchableOpacity style={s.btnOutline}>
            <Text style={s.btnOutlineText}>Evaluar</Text>
          </TouchableOpacity>
        </Card>
      )}
      {horasTab === "revision" && (
        <Card>
          <Text style={[s.muted, { textAlign: "center", padding: 24 }]}>
            Sin solicitudes en revisión.
          </Text>
        </Card>
      )}
      {horasTab === "cerradas" && (
        <>
          <View style={s.tabRow}>
            {[
              { key: "grupo", label: "Grupo" },
              { key: "alumnos", label: "Alumnos" },
            ].map((item) => (
              <TabBtn
                key={item.key}
                label={item.label}
                active={closedViewMode === item.key}
                onPress={() =>
                  setClosedViewMode(item.key as "grupo" | "alumnos")
                }
              />
            ))}
          </View>
          {closedViewMode === "grupo" ? (
            <View style={{ gap: 12 }}>
              {CLOSED_GROUPS.map((group) => (
                <TouchableOpacity
                  key={group.id}
                  style={[s.card, { marginBottom: 12, padding: 18 }]}
                  onPress={() => openGroupModal(group)}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      marginBottom: 10,
                    }}
                  >
                    <Text style={s.subsectionTitle}>{group.nombre}</Text>
                    <Badge label="Cerrado" type="active" />
                  </View>
                  <Text style={s.textMuted}>{group.descripcion}</Text>
                  <View
                    style={[
                      s.row,
                      {
                        justifyContent: "space-between",
                        marginTop: 12,
                        gap: 16,
                      },
                    ]}
                  >
                    <Text style={s.career}>{group.periodo}</Text>
                    <Text style={s.career}>Cierre {group.cierre}</Text>
                  </View>
                  <Text style={[s.muted, { marginTop: 10 }]}>
                    {group.estudiantes.length} alumnos finalizados
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {CLOSED_GROUPS.flatMap((group) => group.estudiantes).length ===
              0 ? (
                <Card>
                  <Text style={[s.muted, { textAlign: "center", padding: 24 }]}>
                    No hay alumnos en grupos cerrados.
                  </Text>
                </Card>
              ) : (
                CLOSED_GROUPS.flatMap((group) => group.estudiantes).map(
                  (student) => (
                    <View
                      key={student.id}
                      style={[s.card, { marginBottom: 12, padding: 18 }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={s.studentName}>{student.name}</Text>
                        <Text style={s.career}>{student.carrera}</Text>
                        <Text style={s.textMuted}>Grupo {student.grupoId}</Text>
                      </View>
                      <TouchableOpacity
                        style={[s.btnOutline, { alignSelf: "center" }]}
                        onPress={() => openEvaluationModal(student)}
                      >
                        <Text style={s.btnOutlineText}>Evaluar</Text>
                      </TouchableOpacity>
                    </View>
                  ),
                )
              )}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );

  /** 5. CREAR VACANTE */
  const renderCrearVacante = () => {
    const steps = [
      "Información básica",
      "Detalles del puesto",
      "Preguntas adicionales",
      "Verificación OTP",
    ];

    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.sectionContent}
      >
        <TouchableOpacity
          style={{ marginBottom: 16 }}
          onPress={() => navigate("vacantes")}
        >
          <Text style={s.backLink}>← Volver a Mis vacantes</Text>
        </TouchableOpacity>
        <SectionTitle text="Crear nueva vacante" />

        {/* Stepper */}
        <View style={s.stepper}>
          {steps.map((label, idx) => {
            const stepNum = idx + 1;
            const active = stepNum <= currentStep;
            return (
              <React.Fragment key={stepNum}>
                <View style={s.stepItem}>
                  <View style={[s.stepCircle, active && s.stepCircleActive]}>
                    {active && stepNum < currentStep ? (
                      <Ionicons name="checkmark" size={18} color="#fff" />
                    ) : (
                      <Text
                        style={[s.stepCircleText, active && { color: "#fff" }]}
                      >
                        {stepNum}
                      </Text>
                    )}
                  </View>
                  <Text style={[s.stepLabel, active && s.stepLabelActive]}>
                    {label}
                  </Text>
                </View>
                {idx < steps.length - 1 && (
                  <View
                    style={[
                      s.stepLine,
                      currentStep > idx + 1 && { backgroundColor: C.purple },
                    ]}
                  />
                )}
              </React.Fragment>
            );
          })}
        </View>

        {/* Error list - removed, now showing errors per field */}

        {/* ── STEP 1 ── */}
        {currentStep === 1 && (
          <Card>
            <ValidatedInput
              label="Título del puesto *"
              value={tituloPuesto}
              onChangeText={(v) =>
                setTituloPuesto(v.replace(/[^a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s]/g, ""))
              }
              placeholder="Ej: Desarrollador Frontend Senior"
              validator={validators.titulo}
              error={stepErrors.tituloPuesto}
            />

            <Text style={[s.inputLabel, { marginTop: 4 }]}>Modalidad *</Text>
            <View style={s.modalityCards}>
              {[
                {
                  key: "remoto" as Modality,
                  icon: "home-outline" as const,
                  label: "Remoto",
                },
                {
                  key: "hibrido" as Modality,
                  icon: "git-merge-outline" as const,
                  label: "Híbrido",
                },
                {
                  key: "presencial" as Modality,
                  icon: "location-outline" as const,
                  label: "Presencial",
                },
              ].map((m) => (
                <TouchableOpacity
                  key={m.key}
                  style={[
                    s.modalityCard,
                    selectedModality === m.key && s.modalityCardActive,
                  ]}
                  onPress={() => {
                    setSelectedModality(m.key);
                    setShowModalityError(false);
                  }}
                >
                  <Ionicons
                    name={m.icon}
                    size={22}
                    color={selectedModality === m.key ? C.purple : C.muted}
                    style={{ marginBottom: 6 }}
                  />
                  <Text
                    style={[
                      s.muted,
                      { fontSize: 12 },
                      selectedModality === m.key && {
                        color: C.purple,
                        fontWeight: "700",
                      },
                    ]}
                  >
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {showModalityError && stepErrors.modalidad && (
              <Text style={s.errorText}>⚠️ {stepErrors.modalidad}</Text>
            )}

            <ValidatedInput
              label="Cantidad de plazas *"
              value={plazas}
              onChangeText={(v) => setPlazas(v.replace(/\D/g, "").slice(0, 3))}
              placeholder="Ej: 5"
              keyboardType="numeric"
              validator={validators.plazas}
              hint="Puedes publicar entre 1 y 100 plazas por vacante"
              error={stepErrors.plazas}
            />

            <View style={{ marginBottom: 14 }}>
              <Text style={s.inputLabel}>Fecha de cierre * (DD/MM/AAAA)</Text>
              <TextInput
                style={[
                  s.input,
                  {
                    borderColor: stepErrors.fechaCierre
                      ? C.danger
                      : fechaCierre && /^\d{2}\/\d{2}\/\d{4}$/.test(fechaCierre)
                        ? C.green
                        : C.purpleBorder,
                  },
                ]}
                value={fechaCierre}
                onChangeText={(v) => setFechaCierre(formatFechaCierre(v))}
                placeholder="DD/MM/AAAA"
                placeholderTextColor={C.muted}
                keyboardType="numeric"
                maxLength={10}
              />
              {stepErrors.fechaCierre && (
                <Text style={s.errorText}>⚠️ {stepErrors.fechaCierre}</Text>
              )}
            </View>

            {/* Dirección + Google Maps para Presencial / Híbrido */}
            {(selectedModality === "presencial" ||
              selectedModality === "hibrido") && (
              <View style={{ marginTop: 8 }}>
                <Text style={[s.inputLabel, { marginBottom: 8 }]}>
                  <Ionicons
                    name="location-outline"
                    size={14}
                    color={C.purple}
                  />{" "}
                  Departamento *
                </Text>
                <SelectInput
                  label="Selecciona departamento"
                  value={ubicacion?.departamento || ""}
                  options={Object.keys(GEO_DATA)}
                  onChange={(v) => {
                    setUbicacion((prev) => ({
                      lat: prev?.lat ?? 0,
                      lng: prev?.lng ?? 0,
                      address: prev?.address ?? "",
                      municipio: "",
                      departamento: v,
                      pais: prev?.pais ?? "El Salvador",
                    }));
                  }}
                  error={stepErrors.departamento}
                  style={{ marginBottom: 14 }}
                />

                {ubicacion?.departamento && (
                  <>
                    <Text style={[s.inputLabel, { marginBottom: 8 }]}>
                      <Ionicons
                        name="location-outline"
                        size={14}
                        color={C.purple}
                      />{" "}
                      Ciudad / Municipio *
                    </Text>
                    <SelectInput
                      label="Selecciona ciudad"
                      value={ubicacion?.municipio || ""}
                      options={GEO_DATA[ubicacion.departamento] || []}
                      onChange={(v) =>
                        setUbicacion((prev) => ({
                          lat: prev?.lat ?? 0,
                          lng: prev?.lng ?? 0,
                          address: prev?.address ?? "",
                          municipio: v,
                          departamento: prev?.departamento ?? "",
                          pais: prev?.pais ?? "El Salvador",
                        }))
                      }
                      error={stepErrors.municipio}
                      style={{ marginBottom: 14 }}
                    />
                  </>
                )}

                <Text style={[s.inputLabel, { marginBottom: 8 }]}>
                  <Ionicons name="map-outline" size={14} color={C.purple} />{" "}
                  Enlace de Google Maps *
                </Text>
                <TextInput
                  style={[
                    s.input,
                    {
                      borderColor: stepErrors.googleMaps
                        ? C.danger
                        : googleMapsUrl &&
                            googleMapsUrl.startsWith("https://maps.app.goo.gl/")
                          ? C.green
                          : googleMapsUrl
                            ? C.danger
                            : C.purpleBorder,
                    },
                  ]}
                  value={googleMapsUrl}
                  onChangeText={setGoogleMapsUrl}
                  placeholder="https://maps.app.goo.gl/[código]"
                  placeholderTextColor={C.muted}
                />
                {stepErrors.googleMaps && (
                  <Text style={s.errorText}>⚠️ {stepErrors.googleMaps}</Text>
                )}
              </View>
            )}
          </Card>
        )}

        {/* ── STEP 2 ── */}
        {currentStep === 2 && (
          <Card>
            <ValidatedInput
              label="Descripción del puesto *"
              value={descripcion}
              onChangeText={setDescripcion}
              placeholder="Describe las responsabilidades..."
              multiline
              validator={validators.descripcion}
              error={stepErrors.descripcion}
            />
            <ValidatedInput
              label="Requisitos *"
              value={requisitos}
              onChangeText={setRequisitos}
              placeholder="Ej: 2 años de experiencia, React..."
              multiline
              validator={validators.requisitos}
              error={stepErrors.requisitos}
            />

            {/* Rango salarial */}
            <Text style={s.inputLabel}>Rango salarial *</Text>
            <View style={{ flexDirection: "row", marginBottom: 14 }}>
              <View
                style={[
                  s.inputPrefix,
                  {
                    borderColor: stepErrors.rangoSalarial
                      ? C.danger
                      : rangoSalarial &&
                          validators.salario(rangoSalarial).isValid
                        ? C.green
                        : rangoSalarial
                          ? C.danger
                          : C.purpleBorder,
                  },
                ]}
              >
                <Text
                  style={{ color: C.green, fontWeight: "700", fontSize: 16 }}
                >
                  $
                </Text>
              </View>
              <TextInput
                style={[
                  s.input,
                  {
                    flex: 1,
                    borderLeftWidth: 0,
                    borderTopLeftRadius: 0,
                    borderBottomLeftRadius: 0,
                    borderColor: stepErrors.rangoSalarial
                      ? C.danger
                      : rangoSalarial &&
                          validators.salario(rangoSalarial).isValid
                        ? C.green
                        : rangoSalarial
                          ? C.danger
                          : C.purpleBorder,
                  },
                ]}
                value={rangoSalarial}
                onChangeText={(v) =>
                  setRangoSalarial(v.replace(/[^0-9,]/g, ""))
                }
                placeholder="1,200"
                placeholderTextColor={C.muted}
                keyboardType="numeric"
              />
            </View>
            {stepErrors.rangoSalarial && (
              <Text style={s.errorText}>⚠️ {stepErrors.rangoSalarial}</Text>
            )}
            <Text
              style={{
                color: C.muted,
                fontSize: 11,
                marginBottom: 14,
                marginTop: 4,
              }}
            >
              Formato de muestra: $
              {parseInt(
                (rangoSalarial || "0").replace(/,/g, ""),
              ).toLocaleString() || "0"}{" "}
              / {periodoPago === "mensual" ? "mes" : "quincena"}
            </Text>

            {/* Período de pago */}
            <Text style={s.inputLabel}>Período de pago *</Text>
            <View
              style={[
                s.input,
                { justifyContent: "center", padding: 0, marginBottom: 14 },
              ]}
            >
              {(["quincenal", "mensual"] as PeriodoPago[]).map((opt) => (
                <TouchableOpacity
                  key={opt}
                  onPress={() => setPeriodoPago(opt)}
                  style={[
                    { paddingVertical: 10, paddingHorizontal: 14 },
                    periodoPago === opt && { backgroundColor: C.purpleDim },
                  ]}
                >
                  <Text
                    style={[
                      { color: C.muted, fontSize: 13 },
                      periodoPago === opt && {
                        color: C.purple,
                        fontWeight: "700",
                      },
                    ]}
                  >
                    {periodoPago === opt ? "✓ " : ""}
                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>
        )}

        {/* ── STEP 3 ── */}
        {currentStep === 3 && (
          <Card>
            <Text style={[s.muted, { marginBottom: 16 }]}>
              Añade preguntas adicionales para los candidatos (opcional). Solo
              se aceptan letras.
            </Text>
            {preguntas.map((pregunta, idx) => (
              <View key={idx} style={{ marginBottom: 10 }}>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <Text style={[s.inputLabel, { flex: 1 }]}>
                    Pregunta {idx + 1}
                  </Text>
                  {preguntas.length > 1 && (
                    <TouchableOpacity
                      onPress={() =>
                        setPreguntas((prev) => prev.filter((_, i) => i !== idx))
                      }
                      style={s.removeBtn}
                    >
                      <Ionicons name="close" size={14} color={C.danger} />
                    </TouchableOpacity>
                  )}
                </View>
                <TextInput
                  style={[
                    s.input,
                    {
                      borderColor: stepErrors[`pregunta_${idx}`]
                        ? C.danger
                        : pregunta && validators.pregunta(pregunta).isValid
                          ? C.green
                          : C.purpleBorder,
                    },
                  ]}
                  value={pregunta}
                  onChangeText={(v) => {
                    const newPq = [...preguntas];
                    newPq[idx] = v.replace(
                      /[^a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s¿?¡!.,]/g,
                      "",
                    );
                    setPreguntas(newPq);
                  }}
                  placeholder="¿Por qué te interesa este puesto?"
                  placeholderTextColor={C.muted}
                />
                {stepErrors[`pregunta_${idx}`] && (
                  <Text style={s.errorText}>
                    ⚠️ {stepErrors[`pregunta_${idx}`]}
                  </Text>
                )}
              </View>
            ))}
            <TouchableOpacity
              style={[
                s.btnOutline,
                {
                  marginTop: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                },
              ]}
              onPress={() => setPreguntas((prev) => [...prev, ""])}
            >
              <Ionicons name="add-circle-outline" size={16} color={C.purple} />
              <Text style={s.btnOutlineText}>Agregar pregunta</Text>
            </TouchableOpacity>
          </Card>
        )}

        {/* ── STEP 4: OTP ── */}
        {currentStep === 4 && (
          <Card>
            <Text style={[s.inputLabel, { marginBottom: 8 }]}>
              Verificación por correo
            </Text>
            <Text style={[s.muted, { marginBottom: 14, lineHeight: 20 }]}>
              {" "}
              Antes de publicar tu vacante, te pedimos verificar tu correo.
              Envía un código OTP a {cfgEmail || cfgContacto || "tu correo"} y
              confírmalo aquí.
            </Text>
            <TouchableOpacity
              style={[s.btnOutline, { marginBottom: 12 }]}
              onPress={handleSendOtp}
            >
              <Text style={s.btnOutlineText}>
                {otpSent ? "Reenviar código OTP" : "Enviar código OTP"}
              </Text>
            </TouchableOpacity>
            {emailVerificationMessage ? (
              <Text style={[s.successText, { marginBottom: 12 }]}>
                {" "}
                {emailVerificationMessage}
              </Text>
            ) : null}
            <View style={{ marginBottom: 10 }}>
              <Text style={s.inputLabel}>Código OTP *</Text>
              <TextInput
                style={[
                  s.input,
                  {
                    borderColor: otpError
                      ? C.danger
                      : otpInput && /^\d{6}$/.test(otpInput)
                        ? C.green
                        : C.purpleBorder,
                  },
                ]}
                value={otpInput}
                onChangeText={(v) =>
                  setOtpInput(v.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
                placeholderTextColor={C.muted}
                keyboardType="numeric"
                maxLength={6}
              />
              {(otpError || stepErrors.otp) && (
                <Text style={s.errorText}>⚠️ {otpError || stepErrors.otp}</Text>
              )}
            </View>
          </Card>
        )}

        {stepErrors.form ? (
          <Text style={[s.errorText, { marginBottom: 12 }]}>
            ⚠️ {stepErrors.form}
          </Text>
        ) : null}

        {/* Actions */}
        <View style={s.stepActions}>
          <TouchableOpacity
            style={[s.btnOutline, currentStep === 1 && s.btnDisabled]}
            onPress={handleStepperPrev}
            disabled={currentStep === 1}
          >
            <Ionicons
              name="arrow-back-outline"
              size={15}
              color={currentStep === 1 ? C.muted : C.purple}
              style={{ marginRight: 4 }}
            />
            <Text
              style={[
                s.btnOutlineText,
                currentStep === 1 && { color: C.muted },
              ]}
            >
              Anterior
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.btnPrimary, isSavingVacante && s.btnDisabled]}
            onPress={handleStepperNext}
            disabled={isSavingVacante}
          >
            <Text style={s.btnPrimaryText}>
              {isSavingVacante
                ? "Guardando..."
                : currentStep === 4
                  ? "Publicar vacante"
                  : "Siguiente"}
            </Text>
            <Ionicons
              name={
                currentStep === 4
                  ? "checkmark-circle-outline"
                  : "arrow-forward-outline"
              }
              size={15}
              color="#fff"
              style={{ marginLeft: 4 }}
            />
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  /** 6. EXPLORAR */
  const renderExplorar = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.sectionContent}
    >
      <SectionTitle text="Explorar" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 16 }}
      >
        <View style={s.tabRow}>
          {(
            [
              { key: "talentos", label: "Talentos" },
              { key: "universidades", label: "Universidades" },
              { key: "proyectos", label: "Proyectos" },
            ] as { key: ExplorarTab; label: string }[]
          ).map((t) => (
            <TabBtn
              key={t.key}
              label={t.label}
              active={explorarTab === t.key}
              onPress={() => setExplorarTab(t.key)}
            />
          ))}
        </View>
      </ScrollView>
      {explorarTab === "talentos" && (
        <View style={s.grid2}>
          {[
            {
              name: "Ana Rodríguez",
              career: "Ing. en Sistemas",
              uni: "Universidad Nacional",
              skills: ["React", "Node.js", "Python"],
              status: "Disponible",
            },
            {
              name: "Luis Herrera",
              career: "Ing. Industrial",
              uni: "UES",
              skills: ["AutoCAD", "Excel", "SAP"],
              status: "Disponible",
            },
          ].map((t) => (
            <Card key={t.name} style={s.talentCard}>
              <View style={s.talentAvatarWrapper}>
                <Text style={{ fontSize: 40 }}>👤</Text>
              </View>
              <Text style={s.talentName}>{t.name}</Text>
              <Text style={[s.muted, { fontSize: 13 }]}>{t.career}</Text>
              <Text style={[s.muted, { fontSize: 12, marginBottom: 8 }]}>
                {t.uni}
              </Text>
              <View style={s.skillPills}>
                {t.skills.map((sk) => (
                  <View key={sk} style={s.skillPill}>
                    <Text style={s.skillPillText}>{sk}</Text>
                  </View>
                ))}
              </View>
              <View style={s.availableBadge}>
                <Text style={s.availableBadgeText}>{t.status}</Text>
              </View>
              <View style={[s.rowGap, { marginTop: 12 }]}>
                <TouchableOpacity style={s.btnOutline}>
                  <Text style={s.btnOutlineText}>Ver perfil</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnPrimary}>
                  <Text style={s.btnPrimaryText}>Contactar</Text>
                </TouchableOpacity>
              </View>
            </Card>
          ))}
        </View>
      )}
      {explorarTab !== "talentos" && (
        <Card>
          <Text style={[s.muted, { padding: 24, textAlign: "center" }]}>
            Próximamente.
          </Text>
        </Card>
      )}
    </ScrollView>
  );

  /** 7. PAGOS */
  const renderPagos = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.sectionContent}
    >
      <SectionTitle text="Pagos" />
      <View style={s.grid3}>
        {[
          { label: "Total este mes", value: "$12,450.00" },
          { label: "Pendientes", value: "$3,200.00" },
          { label: "Procesados", value: "$9,250.00" },
        ].map((ps) => (
          <Card key={ps.label} style={s.paymentSummary}>
            <Text style={s.paymentSummaryLabel}>{ps.label}</Text>
            <Text style={s.paymentSummaryValue}>{ps.value}</Text>
          </Card>
        ))}
      </View>
      <Text style={[s.filterLabel, { marginTop: 16 }]}>Usuarios:</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 16 }}
      >
        <View style={s.filterRow}>
          {(["todos", "rrhh", "finanzas", "externo"] as PaymentFilter[]).map(
            (f) => (
              <FilterPill
                key={f}
                label={f.charAt(0).toUpperCase() + f.slice(1)}
                active={paymentFilter === f}
                onPress={() => setPaymentFilter(f)}
              />
            ),
          )}
        </View>
      </ScrollView>
      <Card>
        <View style={[s.tableRow, s.tableHead]}>
          {["Usuario", "Monto", "Fecha", "Método", "Estado"].map((h) => (
            <Text key={h} style={[s.tableCell, s.tableHeadText]}>
              {h}
            </Text>
          ))}
        </View>
        {filteredPayments.map((p, i) => (
          <View key={i} style={[s.tableRow, s.tableBodyRow]}>
            <Text style={[s.tableCell, { fontSize: 12 }]}>{p.usuario}</Text>
            <Text style={[s.tableCell, { fontSize: 12 }]}>{p.monto}</Text>
            <Text style={[s.tableCell, { fontSize: 11 }]}>{p.fecha}</Text>
            <Text style={[s.tableCell, { fontSize: 11 }]}>{p.metodo}</Text>
            <Badge label={p.badge} type={p.badgeType} />
          </View>
        ))}
      </Card>
    </ScrollView>
  );

  /** 8. NOTIFICACIONES */
  const renderNotificaciones = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.sectionContent}
    >
      <SectionTitle text="Notificaciones" />
      {[
        {
          icon: "person-add-outline" as const,
          title: "Nuevo candidato",
          desc: "Ana Rodríguez postuló a Desarrollador Frontend.",
          time: "Hace 10 min",
        },
        {
          icon: "card-outline" as const,
          title: "Pago procesado",
          desc: "El pago de RRHH por $4,200 fue confirmado.",
          time: "Hace 1 hora",
        },
        {
          icon: "school-outline" as const,
          title: "Solicitud de horas sociales",
          desc: "Universidad Nacional envió una nueva solicitud.",
          time: "Ayer",
        },
      ].map((n, i) => (
        <Card key={i} style={{ marginBottom: 12 }}>
          <View style={s.notifItem}>
            <View style={[s.notifIconBox, { backgroundColor: C.purpleDim }]}>
              <Ionicons name={n.icon} size={20} color={C.purple} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.notifTitle}>{n.title}</Text>
              <Text style={[s.muted, { fontSize: 13, marginTop: 2 }]}>
                {n.desc}
              </Text>
            </View>
            <Text style={[s.muted, { fontSize: 11 }]}>{n.time}</Text>
          </View>
        </Card>
      ))}
    </ScrollView>
  );

  /** 9. PERFIL */
  const renderPerfil = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.sectionContent}
    >
      <View style={s.profileBanner}>
        {empresaBannerUrl && (
          <Image
            source={{ uri: empresaBannerUrl }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
        )}
        <View style={s.bannerOverlay} />
        <View style={s.bannerContent}>
          <View style={s.bigAvatar}>
            <Text style={{ fontSize: 42 }}>🏢</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.profileCompanyName}>{empresaName}</Text>
            <View style={s.verifiedBadge}>
              <Text style={s.verifiedText}>
                {empresaVerified
                  ? "Empresa verificada ✓"
                  : "Perfil en espera de verificación"}
              </Text>
            </View>
            <Text style={[s.muted, { fontSize: 13, marginTop: 8 }]}>
              {empresaVerified
                ? "Empresa con perfil activo y visibilidad mejorada."
                : "Completa los datos de tu empresa para mejorar tu alcance."}
            </Text>
          </View>
        </View>
        <View style={s.profileStats}>
          {[
            { num: "18", label: "vacantes activas" },
            { num: "125", label: "candidatos activos" },
            { num: "9", label: "universidades aliadas" },
          ].map((st) => (
            <View key={st.label} style={s.profileStatItem}>
              <Text style={s.profileStatNum}>{st.num}</Text>
              <Text style={[s.muted, { fontSize: 12 }]}>{st.label}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity
          style={[s.btnPrimary, { alignSelf: "flex-start", marginTop: 12 }]}
          onPress={() => {
            // El logo y banner se editan desde el formulario de edición de perfil.
            // Para actualizar el logo directamente:
            // const url = await pickAndUploadImage('public-media', `${currentEmpresaId}/${Date.now()}-logo.jpg`);
            // if (url) { await supabase.from('empresas').update({ foto_logo: url }).eq('id', currentEmpresaId); setEmpresaLogoUrl(url); }
            setShowProfileSettings(!showProfileSettings);
          }}
        >
          <Ionicons
            name="settings-outline"
            size={14}
            color="#fff"
            style={{ marginRight: 4 }}
          />
          <Text style={s.btnPrimaryText}>
            {showProfileSettings ? "Ver perfil" : "Configuración interna"}
          </Text>
        </TouchableOpacity>
      </View>

      {!showProfileSettings ? (
        <>
          <Card style={{ marginTop: 16 }}>
            <Text style={s.subsectionTitle}>Contacto y redes</Text>
            {[
              {
                icon: "mail-outline" as const,
                label: "Correo",
                value: empresaContactEmail,
              },
              {
                icon: "location-outline" as const,
                label: "Ubicación",
                value: empresaLocation,
              },
              {
                icon: "call-outline" as const,
                label: "Teléfono",
                value: empresaPhone,
              },
            ].map((ci) => (
              <View key={ci.label} style={s.contactItem}>
                <View style={s.contactIconBox}>
                  <Ionicons name={ci.icon} size={18} color={C.purple} />
                </View>
                <View>
                  <Text style={s.contactLabel}>{ci.label}</Text>
                  <Text style={s.contactValue}>{ci.value}</Text>
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : (
        <>
          <Card style={{ marginTop: 16 }}>
            <Text style={s.subsectionTitle}>Configuración interna</Text>
            <ValidatedInput
              label="Nombre de la empresa"
              value={cfgNombre}
              onChangeText={setCfgNombre}
            />
            <ValidatedInput
              label="Correo de contacto"
              value={cfgEmail}
              onChangeText={setCfgEmail}
            />
            <ValidatedInput
              label="Teléfono"
              value={cfgTel}
              onChangeText={setCfgTel}
            />
            <TouchableOpacity style={[s.btnPrimary, { marginTop: 8 }]}>
              <Text style={s.btnPrimaryText}>Guardar cambios</Text>
            </TouchableOpacity>
          </Card>
          <Card style={{ marginTop: 16 }}>
            <Text style={s.subsectionTitle}>Notificaciones</Text>
            <ToggleRow
              label="Notificaciones de candidatos"
              value={pNotifCand}
              onValueChange={setPNotifCand}
            />
            <ToggleRow
              label="Notificaciones de pagos"
              value={pNotifPagos}
              onValueChange={setPNotifPagos}
            />
            <ToggleRow
              label="Recibir alertas VIP"
              value={pNotifVIP}
              onValueChange={setPNotifVIP}
            />
          </Card>
        </>
      )}
    </ScrollView>
  );

  /** 10. CONFIGURACIÓN */
  const renderConfiguracion = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.sectionContent}
    >
      <SectionTitle text="Configuración" />
      <Card style={{ marginBottom: 16 }}>
        <Text style={s.subsectionTitle}>Datos de empresa</Text>
        <ValidatedInput
          label="Nombre de la empresa"
          value={cfgEmpresa}
          onChangeText={setCfgEmpresa}
        />
        <ValidatedInput
          label="Correo de contacto"
          value={cfgContacto}
          onChangeText={setCfgContacto}
        />
        <ValidatedInput
          label="Representante"
          value={cfgPuesto}
          onChangeText={setCfgPuesto}
        />
        <TouchableOpacity style={[s.btnPrimary, { marginTop: 8 }]}>
          <Text style={s.btnPrimaryText}>Guardar cambios</Text>
        </TouchableOpacity>
      </Card>
      <Card style={{ marginBottom: 16 }}>
        <Text style={s.subsectionTitle}>Seguridad</Text>
        <ValidatedInput
          label="Contraseña actual"
          value={cfgPwdActual}
          onChangeText={setCfgPwdActual}
        />
        <ValidatedInput
          label="Nueva contraseña"
          value={cfgPwdNew}
          onChangeText={setCfgPwdNew}
        />
        <ValidatedInput
          label="Confirmar contraseña"
          value={cfgPwdConfirm}
          onChangeText={setCfgPwdConfirm}
        />
        <TouchableOpacity style={[s.btnPrimary, { marginTop: 8 }]}>
          <Text style={s.btnPrimaryText}>Cambiar contraseña</Text>
        </TouchableOpacity>
      </Card>
      <Card style={{ marginBottom: 16 }}>
        <Text style={s.subsectionTitle}>Notificaciones</Text>
        <ToggleRow
          label="Alertas de candidato nuevo"
          value={notifCandidatos}
          onValueChange={setNotifCandidatos}
        />
        <ToggleRow
          label="Resumen semanal"
          value={notifResumen}
          onValueChange={setNotifResumen}
        />
        <ToggleRow
          label="Notificaciones de pagos"
          value={notifPagos}
          onValueChange={setNotifPagos}
        />
      </Card>
      <TouchableOpacity
        style={[s.btnOutline, { marginBottom: 12 }]}
        onPress={() => setSubPage("ayuda")}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Ionicons name="help-circle-outline" size={20} color={C.purple} />
          <Text style={[s.btnOutlineText, { flex: 1, textAlign: "left" }]}>
            Ayuda
          </Text>
          <Ionicons name="chevron-forward-outline" size={16} color={C.muted} />
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.btnOutline, { marginBottom: 40 }]}
        onPress={() => setSubPage("acercade")}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Ionicons
            name="information-circle-outline"
            size={20}
            color={C.purple}
          />
          <Text style={[s.btnOutlineText, { flex: 1, textAlign: "left" }]}>
            Acerca de Gradly
          </Text>
          <Ionicons name="chevron-forward-outline" size={16} color={C.muted} />
        </View>
      </TouchableOpacity>
    </ScrollView>
  );

  /** AYUDA */
  const renderAyuda = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.sectionContent}
    >
      <TouchableOpacity
        onPress={() => setSubPage(null)}
        style={{ marginBottom: 16 }}
      >
        <Text style={s.backLink}>← Configuración</Text>
      </TouchableOpacity>
      <SectionTitle text="Centro de ayuda" />
      <Card>
        <Text style={s.subsectionTitle}>Contacto</Text>
        {[
          {
            icon: "mail-outline" as const,
            label: "Correo",
            value: "hola@gradly.sv",
          },
          {
            icon: "logo-whatsapp" as const,
            label: "WhatsApp",
            value: "+503 7000-0000",
          },
          {
            icon: "time-outline" as const,
            label: "Horario",
            value: "Lun-Vie 08:00-17:00",
          },
        ].map((ci) => (
          <View key={ci.label} style={s.contactItem}>
            <View style={s.contactIconBox}>
              <Ionicons name={ci.icon} size={18} color={C.purple} />
            </View>
            <View>
              <Text style={s.contactLabel}>{ci.label}</Text>
              <Text style={s.contactValue}>{ci.value}</Text>
            </View>
          </View>
        ))}
      </Card>
    </ScrollView>
  );

  /** ACERCA DE */
  const renderAcercaDe = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.sectionContent}
    >
      <TouchableOpacity
        onPress={() => setSubPage(null)}
        style={{ marginBottom: 16 }}
      >
        <Text style={s.backLink}>← Configuración</Text>
      </TouchableOpacity>
      <SectionTitle text="Acerca de Gradly" />
      <Card>
        <Text
          style={[
            s.contactValue,
            { fontWeight: "700", color: C.purple, marginBottom: 4 },
          ]}
        >
          Misión
        </Text>
        <Text style={[s.muted, { marginBottom: 12 }]}>
          Democratizar el acceso al empleo profesional para los jóvenes talentos
          de América Latina.
        </Text>
        <Text
          style={[
            s.contactValue,
            { fontWeight: "700", color: C.purple, marginBottom: 4 },
          ]}
        >
          Visión
        </Text>
        <Text style={s.muted}>
          Ser el ecosistema profesional de referencia en América Latina para
          2030.
        </Text>
      </Card>
    </ScrollView>
  );

  // ── Section router ─────────────────────────────────────────────────────────
  const renderContent = () => {
    if (subPage === "ayuda") return renderAyuda();
    if (subPage === "acercade") return renderAcercaDe();
    switch (activeSection) {
      case "inicio":
        return renderInicio();
      case "vacantes":
        return renderVacantes();
      case "candidatos":
        return renderCandidatos();
      case "horas-sociales":
        return renderHorasSociales();
      case "pagos":
        return renderPagos();
      case "notificaciones":
        return renderNotificaciones();
      case "perfil":
        return renderPerfil();
      case "configuracion":
        return renderConfiguracion();
      case "crear-vacante":
        return renderCrearVacante();
      case "explorar":
        return renderExplorar();
      default:
        return null;
    }
  };

  // ── MODAL: Detalle de Vacante ──────────────────────────────────────────────
  const renderVacanteDetailModal = () => {
    if (!selectedVacante) return null;
    const vacanteCandidate = CANDIDATES.filter(
      (c) => c.vacanteAplicada === selectedVacante.puesto,
    );
    return (
      <Modal
        visible={showVacanteDetail}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.modalHeader}>
            <TouchableOpacity
              onPress={() => setShowVacanteDetail(false)}
              style={s.modalCloseBtn}
            >
              <Ionicons name="close" size={22} color={C.text} />
            </TouchableOpacity>
            <Text style={s.modalTitle} numberOfLines={1}>
              {selectedVacante.puesto}
            </Text>
            <Badge label={selectedVacante.estado} type="active" />
          </View>

          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {/* Info general */}
            <Card style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                {[
                  {
                    icon: "briefcase-outline" as const,
                    label: "Modalidad",
                    value:
                      selectedVacante.modalidad.charAt(0).toUpperCase() +
                      selectedVacante.modalidad.slice(1),
                  },
                  {
                    icon: "people-outline" as const,
                    label: "Plazas",
                    value: `${selectedVacante.plazas}`,
                  },
                  {
                    icon: "eye-outline" as const,
                    label: "Vistas",
                    value: `${selectedVacante.vistas}`,
                  },
                  {
                    icon: "calendar-outline" as const,
                    label: "Cierre",
                    value: selectedVacante.cierre,
                  },
                  {
                    icon: "cash-outline" as const,
                    label: "Salario",
                    value: selectedVacante.rangoSalarial,
                  },
                  {
                    icon: "create-outline" as const,
                    label: "Creada",
                    value: selectedVacante.fechaCreacion,
                  },
                ].map((item) => (
                  <View
                    key={item.label}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      minWidth: "45%",
                    }}
                  >
                    <Ionicons name={item.icon} size={14} color={C.purple} />
                    <View>
                      <Text style={{ color: C.muted, fontSize: 10 }}>
                        {item.label}
                      </Text>
                      <Text
                        style={{
                          color: C.text,
                          fontSize: 13,
                          fontWeight: "600",
                        }}
                      >
                        {item.value}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </Card>

            {/* Descripción y requisitos */}
            <Card style={{ marginBottom: 14 }}>
              <Text style={s.subsectionTitle}>Descripción</Text>
              <Text style={[s.muted, { fontSize: 13, lineHeight: 20 }]}>
                {selectedVacante.descripcion}
              </Text>
              <Text style={[s.subsectionTitle, { marginTop: 14 }]}>
                Requisitos
              </Text>
              <Text style={[s.muted, { fontSize: 13, lineHeight: 20 }]}>
                {selectedVacante.requisitos}
              </Text>
            </Card>

            {/* Ubicación texto si aplica */}
            {selectedVacante.ubicacion && (
              <Card style={{ marginBottom: 14 }}>
                <Text style={s.subsectionTitle}>Ubicación</Text>
                <View style={s.locationInfo}>
                  <Text style={{ color: C.muted, fontSize: 12 }}>
                    📍 {selectedVacante.ubicacion.address}
                  </Text>
                  <Text style={{ color: C.muted, fontSize: 12 }}>
                    🏙️ {selectedVacante.ubicacion.municipio},{" "}
                    {selectedVacante.ubicacion.departamento}
                  </Text>
                  <Text style={{ color: C.muted, fontSize: 12 }}>
                    🌎 {selectedVacante.ubicacion.pais}
                  </Text>
                </View>
              </Card>
            )}

            {/* Preguntas */}
            {selectedVacante.preguntas.length > 0 && (
              <Card style={{ marginBottom: 14 }}>
                <Text style={s.subsectionTitle}>Preguntas para candidatos</Text>
                {selectedVacante.preguntas.map((p, i) => (
                  <View
                    key={i}
                    style={{ flexDirection: "row", gap: 8, marginTop: 8 }}
                  >
                    <View
                      style={[
                        s.stepCircle,
                        s.stepCircleActive,
                        { width: 24, height: 24, borderRadius: 12 },
                      ]}
                    >
                      <Text
                        style={{
                          color: "#fff",
                          fontSize: 11,
                          fontWeight: "700",
                        }}
                      >
                        {i + 1}
                      </Text>
                    </View>
                    <Text style={{ color: C.text, fontSize: 13, flex: 1 }}>
                      {p}
                    </Text>
                  </View>
                ))}
              </Card>
            )}

            {/* Candidatos de esta vacante */}
            <Text style={[s.subsectionTitle, { marginBottom: 10 }]}>
              Candidatos ({vacanteCandidate.length})
            </Text>
            {vacanteCandidate.length === 0 ? (
              <Card>
                <Text style={[s.muted, { textAlign: "center", padding: 16 }]}>
                  Aún no hay candidatos para esta vacante.
                </Text>
              </Card>
            ) : (
              vacanteCandidate.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[s.card, { marginBottom: 10 }]}
                  onPress={() => {
                    setSelectedCandidato(c);
                    setShowVacanteDetail(false);
                    setShowCandidatoDetail(true);
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <View style={s.candidatoAvatar}>
                      <Text
                        style={{
                          color: C.purple,
                          fontWeight: "900",
                          fontSize: 18,
                        }}
                      >
                        {c.name.charAt(0)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: C.text,
                          fontWeight: "700",
                          fontSize: 14,
                        }}
                      >
                        {c.name}
                      </Text>
                      <Text style={{ color: C.muted, fontSize: 12 }}>
                        {c.cargo} • {c.universidad}
                      </Text>
                      <Text style={{ color: C.yellow, fontSize: 11 }}>
                        {starRating(c.calificacion)} {c.calificacion}/5.0
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Badge label={c.badge} type={c.badgeType} />
                      <Ionicons
                        name="chevron-forward-outline"
                        size={14}
                        color={C.muted}
                      />
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}

            {/* Acciones */}
            <View style={[s.rowGap, { marginTop: 16 }]}>
              <TouchableOpacity
                style={s.btnOutline}
                onPress={() => setShowVacanteDetail(false)}
              >
                <Ionicons
                  name="pencil-outline"
                  size={14}
                  color={C.purple}
                  style={{ marginRight: 4 }}
                />
                <Text style={s.btnOutlineText}>Editar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btnPrimary, { backgroundColor: C.danger }]}
                onPress={() => {
                  setVacantes((prev) =>
                    prev.filter((v) => v.id !== selectedVacante.id),
                  );
                  setShowVacanteDetail(false);
                }}
              >
                <Ionicons
                  name="trash-outline"
                  size={14}
                  color="#fff"
                  style={{ marginRight: 4 }}
                />
                <Text style={s.btnPrimaryText}>Eliminar</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  const renderGroupModal = () => {
    if (!selectedGroup) return null;
    return (
      <Modal
        visible={showGroupModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.modalHeader}>
            <TouchableOpacity
              onPress={() => setShowGroupModal(false)}
              style={s.modalCloseBtn}
            >
              <Ionicons name="close" size={22} color={C.text} />
            </TouchableOpacity>
            <Text style={s.modalTitle} numberOfLines={1}>
              Ver grupo
            </Text>
            <Badge label="Cerrado" type="active" />
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Card style={{ marginBottom: 14 }}>
              <Text style={s.subsectionTitle}>{selectedGroup.nombre}</Text>
              <Text style={[s.muted, { marginTop: 8 }]}>
                {selectedGroup.descripcion}
              </Text>
              <View
                style={[
                  s.row,
                  { justifyContent: "space-between", marginTop: 14 },
                ]}
              >
                <Text style={s.career}>{selectedGroup.periodo}</Text>
                <Text style={s.career}>Cierre {selectedGroup.cierre}</Text>
              </View>
              <Text style={[s.muted, { marginTop: 10 }]}>
                {selectedGroup.horasCompletadas} horas completadas
              </Text>
            </Card>
            <SectionTitle text="Estudiantes" />
            {selectedGroup.estudiantes.map((student) => (
              <View
                key={student.id}
                style={[s.card, { marginBottom: 12, padding: 16 }]}
              >
                <Text style={s.studentName}>{student.name}</Text>
                <Text style={s.career}>{student.carrera}</Text>
                <Text style={[s.muted, { marginTop: 6 }]}>
                  Estado: {student.estado}
                </Text>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  const renderAvailableGroupModal = () => {
    if (!selectedAvailableGroup) return null;
    return (
      <Modal
        visible={showAvailableGroupModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.modalHeader}>
            <TouchableOpacity
              onPress={() => {
                setShowAvailableGroupModal(false);
                setSelectedAvailableGroup(null);
                resetConvenioFields();
              }}
              style={s.modalCloseBtn}
            >
              <Ionicons name="close" size={22} color={C.text} />
            </TouchableOpacity>
            <Text style={s.modalTitle} numberOfLines={1}>
              Ofrecer convenio
            </Text>
            <Badge label="Oferta" type="interview" />
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Card style={{ marginBottom: 14 }}>
              <Text style={s.subsectionTitle}>
                {selectedAvailableGroup.nombre}
              </Text>
              <Text style={[s.muted, { marginTop: 8 }]}>
                {selectedAvailableGroup.descripcion}
              </Text>
              <View
                style={[
                  s.row,
                  { justifyContent: "space-between", marginTop: 12 },
                ]}
              >
                <Text style={s.career}>
                  {selectedAvailableGroup.especialidad}
                </Text>
                <Text style={s.career}>
                  Cierre {selectedAvailableGroup.cierre}
                </Text>
              </View>
              <Text style={[s.muted, { marginTop: 10 }]}>
                Horas requeridas: {selectedAvailableGroup.horasRequeridas}
              </Text>
            </Card>
            <SectionTitle text="Estudiantes del grupo" />
            {isLoadingGroupStudents ? (
              <Card>
                <Text style={[s.muted, { textAlign: "center", padding: 24 }]}>
                  Cargando estudiantes...
                </Text>
              </Card>
            ) : availableGroupStudents.length === 0 ? (
              <Card>
                <Text style={[s.muted, { textAlign: "center", padding: 24 }]}>
                  No se encontraron estudiantes registrados para este grupo.
                </Text>
              </Card>
            ) : (
              availableGroupStudents.map((student) => (
                <View
                  key={student.id}
                  style={[s.card, { marginBottom: 12, padding: 16 }]}
                >
                  <Text style={s.studentName}>{student.nombre}</Text>
                  <Text style={s.career}>{student.carrera}</Text>
                  <Text style={[s.muted, { marginTop: 6 }]}>
                    Estado: {student.estado}
                  </Text>
                </View>
              ))
            )}
            <SectionTitle text="Condiciones de convenio" />
            <ValidatedInput
              label="Hora de inicio"
              value={convenioHorasInicio}
              onChangeText={(value) => {
                setConvenioHorasInicio(value);
                setConvenioFormErrors((prev) => ({
                  ...prev,
                  convenioHorasInicio: "",
                }));
              }}
              placeholder="08:00"
              validator={validators.hora}
              error={convenioFormErrors.convenioHorasInicio}
            />
            <ValidatedInput
              label="Hora de fin"
              value={convenioHorasFin}
              onChangeText={(value) => {
                setConvenioHorasFin(value);
                setConvenioFormErrors((prev) => ({
                  ...prev,
                  convenioHorasFin: "",
                }));
              }}
              placeholder="17:00"
              validator={validators.hora}
              error={convenioFormErrors.convenioHorasFin}
            />
            <ValidatedInput
              label="Fecha de inicio"
              value={convenioFechaInicio}
              onChangeText={(value) => {
                setConvenioFechaInicio(value);
                setConvenioFormErrors((prev) => ({
                  ...prev,
                  convenioFechaInicio: "",
                }));
              }}
              placeholder="01/09/2026"
              validator={validators.fecha}
              error={convenioFormErrors.convenioFechaInicio}
            />
            <ValidatedInput
              label="Fecha de fin"
              value={convenioFechaFin}
              onChangeText={(value) => {
                setConvenioFechaFin(value);
                setConvenioFormErrors((prev) => ({
                  ...prev,
                  convenioFechaFin: "",
                }));
              }}
              placeholder="30/11/2026"
              validator={validators.fecha}
              error={convenioFormErrors.convenioFechaFin}
            />
            <ValidatedInput
              label="Enlace de Google Maps"
              value={convenioGoogleMapsUrl}
              onChangeText={(value) => {
                setConvenioGoogleMapsUrl(value);
                setConvenioFormErrors((prev) => ({
                  ...prev,
                  convenioGoogleMapsUrl: "",
                }));
              }}
              placeholder="https://maps.app.goo.gl/..."
              validator={validators.googleMaps}
              error={convenioFormErrors.convenioGoogleMapsUrl}
            />
            <TouchableOpacity
              style={[s.btnPrimary, { marginTop: 12 }]}
              onPress={handleEnviarConvenio}
              disabled={convenioSubmitting}
            >
              <Text style={s.btnPrimaryText}>
                {convenioSubmitting ? "Enviando..." : "Ofrecer convenio"}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  const renderEvaluationModal = () => (
    <Modal
      visible={showEvaluationModal}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={s.modalHeader}>
          <TouchableOpacity
            onPress={() => setShowEvaluationModal(false)}
            style={s.modalCloseBtn}
          >
            <Ionicons name="close" size={22} color={C.text} />
          </TouchableOpacity>
          <Text style={s.modalTitle} numberOfLines={1}>
            Evaluar alumno
          </Text>
          <View style={{ width: 42 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Card style={{ marginBottom: 14 }}>
            <Text style={s.subsectionTitle}>Alumno</Text>
            <Text style={[s.muted, { marginTop: 8 }]}>
              {selectedStudent?.name ?? "Seleccione un alumno"}
            </Text>
            <Text style={[s.muted, { marginTop: 4 }]}>
              {selectedStudent?.carrera}
            </Text>
          </Card>
          <RatingStars
            label="Puntualidad"
            value={evaluationScores.puntualidad}
            onChange={(value) =>
              setEvaluationScores((prev) => ({ ...prev, puntualidad: value }))
            }
          />
          <RatingStars
            label="Disciplina"
            value={evaluationScores.disciplina}
            onChange={(value) =>
              setEvaluationScores((prev) => ({ ...prev, disciplina: value }))
            }
          />
          <RatingStars
            label="Responsabilidad"
            value={evaluationScores.responsabilidad}
            onChange={(value) =>
              setEvaluationScores((prev) => ({
                ...prev,
                responsabilidad: value,
              }))
            }
          />
          <RatingStars
            label="Respeto"
            value={evaluationScores.respeto}
            onChange={(value) =>
              setEvaluationScores((prev) => ({ ...prev, respeto: value }))
            }
          />
          <RatingStars
            label="Desempeño laboral"
            value={evaluationScores.desempeno}
            onChange={(value) =>
              setEvaluationScores((prev) => ({ ...prev, desempeno: value }))
            }
          />
          <ValidatedInput
            label="Comentario/Crítica a mejorar"
            value={evaluationComment}
            onChangeText={(text) => {
              setEvaluationComment(text);
              setEvaluationErrors((prev) => ({ ...prev, comment: "" }));
            }}
            placeholder="Comentarios"
            multiline
            validator={validators.alphanumeric}
            error={evaluationErrors.comment}
          />
          {evaluationErrors.evaluacion ? (
            <Text style={s.errorText}>⚠️ {evaluationErrors.evaluacion}</Text>
          ) : null}
          <View style={[s.rowGap, { marginTop: 12 }]}>
            <TouchableOpacity
              style={[s.btnPrimary, { flex: 1 }]}
              onPress={handleSaveEvaluation}
              disabled={isSavingEvaluation}
            >
              <Text style={s.btnPrimaryText}>
                {isSavingEvaluation ? "Guardando..." : "Guardar evaluación"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btnOutline, { flex: 1 }]}
              onPress={() => setShowEvaluationModal(false)}
            >
              <Text style={s.btnOutlineText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );

  const renderUpgradeModal = () => (
    <Modal
      visible={showUpgradeModal}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={s.modalHeader}>
          <TouchableOpacity
            onPress={() => setShowUpgradeModal(false)}
            style={s.modalCloseBtn}
          >
            <Ionicons name="close" size={22} color={C.text} />
          </TouchableOpacity>
          <Text style={s.modalTitle}>Actualizar plan</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView
          contentContainerStyle={{ padding: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={s.subsectionTitle}>Elige tu nuevo plan</Text>
          <View style={{ gap: 12, marginBottom: 18 }}>
            {[
              {
                key: "basic" as const,
                label: "Básico",
                price:
                  upgradeBillingMode === "monthly"
                    ? "$4.99 / mes"
                    : "$59.99 / año",
                description: "Hasta 10 vacantes activas y soporte prioritario.",
              },
              {
                key: "premium" as const,
                label: "Premium + Verificado",
                price:
                  upgradeBillingMode === "monthly"
                    ? "$14.99 / mes"
                    : "$179.99 / año",
                description:
                  "Vacantes ilimitadas y badge de empresa verificada.",
              },
            ].map((plan) => (
              <TouchableOpacity
                key={plan.key}
                style={{
                  borderWidth: 2,
                  borderColor: upgradePlan === plan.key ? C.green : C.border,
                  borderRadius: 14,
                  padding: 14,
                  backgroundColor:
                    upgradePlan === plan.key
                      ? "rgba(34, 197, 94, 0.08)"
                      : C.surface,
                }}
                onPress={() => setUpgradePlan(plan.key)}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <View>
                    <Text
                      style={{ color: C.text, fontWeight: "700", fontSize: 16 }}
                    >
                      {plan.label}
                    </Text>
                    <Text
                      style={{ color: C.muted, fontSize: 12, marginTop: 4 }}
                    >
                      {plan.description}
                    </Text>
                  </View>
                  <Text style={{ color: C.green, fontWeight: "700" }}>
                    {plan.price}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
          {upgradeErrors.plan ? (
            <Text style={s.errorText}>{upgradeErrors.plan}</Text>
          ) : null}

          {upgradePlan ? (
            <>
              <Text style={s.subsectionTitle}>Facturación</Text>
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 18 }}>
                {[
                  { key: "monthly" as const, label: "Mensual" },
                  { key: "annual" as const, label: "Anual" },
                ].map((option) => (
                  <TouchableOpacity
                    key={option.key}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor:
                        upgradeBillingMode === option.key ? C.purple : C.border,
                      backgroundColor:
                        upgradeBillingMode === option.key
                          ? C.purple
                          : C.surface,
                    }}
                    onPress={() => setUpgradeBillingMode(option.key)}
                  >
                    <Text
                      style={{
                        textAlign: "center",
                        color:
                          upgradeBillingMode === option.key ? "#fff" : C.text,
                        fontWeight:
                          upgradeBillingMode === option.key ? "700" : "500",
                      }}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[s.inputLabel, { marginBottom: 8 }]}>Tarjeta</Text>
              <TextInput
                style={[
                  s.input,
                  { marginBottom: 12 },
                  upgradeCardNum.length > 0 &&
                    (upgradeCardNum.replace(/\s/g, "").length === 16
                      ? s.inputValid
                      : s.inputError),
                ]}
                value={upgradeCardNum}
                onChangeText={(value) => {
                  const formatted = value
                    .replace(/\D/g, "")
                    .replace(/(.{4})/g, "$1 ")
                    .trim()
                    .slice(0, 19);
                  setUpgradeCardNum(formatted);
                }}
                placeholder="Número de tarjeta"
                placeholderTextColor={C.muted}
                keyboardType="numeric"
              />
              {upgradeErrors.cardNum ? (
                <Text style={s.errorText}>{upgradeErrors.cardNum}</Text>
              ) : null}

              <TextInput
                style={[
                  s.input,
                  { marginBottom: 12 },
                  upgradeCardName.length > 0 &&
                    (upgradeCardName.trim().length > 0
                      ? s.inputValid
                      : s.inputError),
                ]}
                value={upgradeCardName}
                onChangeText={setUpgradeCardName}
                placeholder="Nombre del titular"
                placeholderTextColor={C.muted}
              />
              {upgradeErrors.cardName ? (
                <Text style={s.errorText}>{upgradeErrors.cardName}</Text>
              ) : null}

              <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <TextInput
                    style={[
                      s.input,
                      upgradeCardExp.length > 0 &&
                        (/^\d{2}\/\d{2}$/.test(upgradeCardExp)
                          ? s.inputValid
                          : s.inputError),
                    ]}
                    value={upgradeCardExp}
                    onChangeText={(value) => {
                      let text = value.replace(/\D/g, "");
                      if (text.length > 2)
                        text = `${text.slice(0, 2)}/${text.slice(2, 4)}`;
                      setUpgradeCardExp(text);
                    }}
                    placeholder="MM/AA"
                    placeholderTextColor={C.muted}
                    maxLength={5}
                    keyboardType="numeric"
                  />
                  {upgradeErrors.cardExp ? (
                    <Text style={s.errorText}>{upgradeErrors.cardExp}</Text>
                  ) : null}
                </View>
                <View style={{ flex: 1 }}>
                  <TextInput
                    style={[
                      s.input,
                      upgradeCardCvv.length > 0 &&
                        (/^\d{3,4}$/.test(upgradeCardCvv)
                          ? s.inputValid
                          : s.inputError),
                    ]}
                    value={upgradeCardCvv}
                    onChangeText={(value) =>
                      setUpgradeCardCvv(value.replace(/\D/g, "").slice(0, 4))
                    }
                    placeholder="CVV"
                    placeholderTextColor={C.muted}
                    keyboardType="numeric"
                    maxLength={4}
                  />
                  {upgradeErrors.cardCvv ? (
                    <Text style={s.errorText}>{upgradeErrors.cardCvv}</Text>
                  ) : null}
                </View>
              </View>

              <TouchableOpacity
                style={s.btnPrimary}
                onPress={handleSavePlanAndPay}
              >
                <Text style={s.btnPrimaryText}>Guardar plan y pagar</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={[s.muted, { marginTop: 12 }]}>
              Selecciona un plan para continuar con los datos de pago.
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );

  // ── MODAL: Perfil de Candidato ─────────────────────────────────────────────
  const renderCandidatoDetailModal = () => {
    if (!selectedCandidato) return null;
    const c = selectedCandidato;
    const stageActions: Record<string, string> = {
      activos: "Mover a Entrevista",
      entrevistas: "Contratar",
      contratados: "Contratado ✓",
    };

    return (
      <Modal
        visible={showCandidatoDetail}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={s.modalHeader}>
            <TouchableOpacity
              onPress={() => setShowCandidatoDetail(false)}
              style={s.modalCloseBtn}
            >
              <Ionicons name="close" size={22} color={C.text} />
            </TouchableOpacity>
            <Text style={s.modalTitle}>Perfil del candidato</Text>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {/* Header perfil */}
            <Card
              style={{
                marginBottom: 14,
                alignItems: "center",
                paddingVertical: 24,
              }}
            >
              <View
                style={[
                  s.candidatoAvatar,
                  { width: 72, height: 72, borderRadius: 36, marginBottom: 12 },
                ]}
              >
                <Text
                  style={{ color: C.purple, fontWeight: "900", fontSize: 32 }}
                >
                  {c.name.charAt(0)}
                </Text>
              </View>
              <Text style={{ color: C.text, fontWeight: "800", fontSize: 20 }}>
                {c.name}
              </Text>
              <Text style={{ color: C.muted, fontSize: 14, marginTop: 2 }}>
                {c.cargo}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 10,
                }}
              >
                <Badge label={c.badge} type={c.badgeType} />
                <Text style={{ color: C.yellow, fontSize: 14 }}>
                  {starRating(c.calificacion)} {c.calificacion}/5.0
                </Text>
              </View>
              <Text
                style={{
                  color: C.muted,
                  fontSize: 12,
                  marginTop: 8,
                  textAlign: "center",
                  lineHeight: 18,
                }}
              >
                {c.presentacion}
              </Text>
            </Card>

            {/* Datos de contacto */}
            <Card style={{ marginBottom: 14 }}>
              <Text style={s.subsectionTitle}>Datos de contacto</Text>
              {[
                {
                  icon: "mail-outline" as const,
                  label: "Correo",
                  value: c.email,
                },
                {
                  icon: "call-outline" as const,
                  label: "Teléfono",
                  value: c.telefono,
                },
                {
                  icon: "school-outline" as const,
                  label: "Universidad",
                  value: c.universidad,
                },
                {
                  icon: "book-outline" as const,
                  label: "Carrera",
                  value: c.carrera,
                },
                {
                  icon: "globe-outline" as const,
                  label: "Portfolio",
                  value: c.portfolio,
                },
                {
                  icon: "briefcase-outline" as const,
                  label: "Vacante aplicada",
                  value: c.vacanteAplicada,
                },
              ].map((item) => (
                <View key={item.label} style={s.contactItem}>
                  <View style={s.contactIconBox}>
                    <Ionicons name={item.icon} size={18} color={C.purple} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.contactLabel}>{item.label}</Text>
                    <Text style={s.contactValue}>{item.value}</Text>
                  </View>
                </View>
              ))}
            </Card>

            {/* Experiencia */}
            <Card style={{ marginBottom: 14 }}>
              <Text style={s.subsectionTitle}>Experiencia</Text>
              <Text style={[s.muted, { fontSize: 13, lineHeight: 20 }]}>
                {c.experiencia}
              </Text>
            </Card>

            {/* Habilidades */}
            <Card style={{ marginBottom: 14 }}>
              <Text style={s.subsectionTitle}>Habilidades</Text>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 8,
                  marginTop: 8,
                }}
              >
                {c.skills.map((sk) => (
                  <View
                    key={sk}
                    style={[
                      s.skillPill,
                      { paddingHorizontal: 12, paddingVertical: 6 },
                    ]}
                  >
                    <Text style={s.skillPillText}>{sk}</Text>
                  </View>
                ))}
              </View>
            </Card>

            {/* Calificación visual */}
            <Card style={{ marginBottom: 14 }}>
              <Text style={s.subsectionTitle}>Calificación del perfil</Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  marginTop: 8,
                }}
              >
                <Text style={{ color: C.yellow, fontSize: 32 }}>
                  {starRating(c.calificacion)}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ color: C.text, fontSize: 26, fontWeight: "900" }}
                  >
                    {c.calificacion}
                  </Text>
                  <Text style={{ color: C.muted, fontSize: 12 }}>
                    sobre 5.0
                  </Text>
                </View>
              </View>
              <View style={s.progressBar}>
                <View
                  style={[
                    s.progressFill,
                    { width: `${(c.calificacion / 5) * 100}%` as any },
                  ]}
                />
              </View>
            </Card>

            {/* Acciones */}
            <View style={[s.rowGap, { marginTop: 8 }]}>
              <TouchableOpacity style={s.btnOutline}>
                <Ionicons
                  name="chatbubble-outline"
                  size={14}
                  color={C.purple}
                  style={{ marginRight: 4 }}
                />
                <Text style={s.btnOutlineText}>Contactar</Text>
              </TouchableOpacity>
              {c.stage !== "contratados" && (
                <TouchableOpacity style={s.btnPrimary}>
                  <Ionicons
                    name="arrow-forward-outline"
                    size={14}
                    color="#fff"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={s.btnPrimaryText}>{stageActions[c.stage]}</Text>
                </TouchableOpacity>
              )}
              {c.stage === "contratados" && (
                <TouchableOpacity
                  style={[s.btnPrimary, { backgroundColor: C.green }]}
                >
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={14}
                    color="#fff"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={s.btnPrimaryText}>Contratado ✓</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={[
                s.btnOutline,
                { marginTop: 10, borderColor: C.dangerBorder },
              ]}
            >
              <Ionicons
                name="close-circle-outline"
                size={14}
                color={C.danger}
                style={{ marginRight: 4 }}
              />
              <Text style={[s.btnOutlineText, { color: C.danger }]}>
                Rechazar candidato
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  // ── Root render ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.root}>
      {renderTopbar()}
      <View style={s.mainContent}>{renderContent()}</View>
      {renderBottomNav()}
      {renderVacanteDetailModal()}
      {renderGroupModal()}
      {renderEvaluationModal()}
      {renderCandidatoDetailModal()}
      {renderUpgradeModal()}
      {publicationSuccess && (
        <Modal visible={publicationSuccess} transparent animationType="fade">
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.6)",
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 20,
            }}
          >
            <View
              style={{
                backgroundColor: C.surface,
                borderRadius: 16,
                padding: 28,
                alignItems: "center",
                borderWidth: 1,
                borderColor: C.greenBorder,
                width: "100%",
                maxWidth: 260,
              }}
            >
              <Ionicons
                name="checkmark-circle"
                size={64}
                color={C.green}
                style={{ marginBottom: 12 }}
              />
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "800",
                  color: C.text,
                  textAlign: "center",
                  marginBottom: 6,
                }}
              >
                ¡Vacante publicada!
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: C.muted,
                  textAlign: "center",
                  lineHeight: 18,
                }}
              >
                Tu vacante está ahora visible para todos los candidatos.
              </Text>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function createStyles(C: Theme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },

    // ── Bottom nav
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

    // ── Brand
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

    // ── Topbar
    topbar: {
      flexDirection: "row",
      alignItems: "center",
      height: 64,
      backgroundColor: C.surface,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
      paddingHorizontal: 16,
      zIndex: 100,
    },
    companyName: { fontSize: 16, fontWeight: "700", color: C.text },
    companyVerified: { fontSize: 11, color: C.purple },
    topbarRight: { flexDirection: "row", alignItems: "center", gap: 10 },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "rgba(255,255,255,0.04)",
      borderWidth: 1,
      borderColor: C.purpleBorder,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 6,
      maxWidth: 150,
    },
    searchInput: { color: C.text, fontSize: 13, flex: 1, marginRight: 4 },
    notifBtn: { position: "relative", padding: 6 },
    notifBadge: {
      position: "absolute",
      top: 0,
      right: 0,
      backgroundColor: C.danger,
      borderRadius: 8,
      minWidth: 16,
      paddingHorizontal: 3,
      alignItems: "center",
    },
    navBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
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
      top: 4,
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

    // ── Main content
    mainContent: { flex: 1 },
    sectionContent: { padding: 16, paddingBottom: 32 },
    sectionHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
    },

    // ── Typography
    sectionTitle: {
      fontSize: 22,
      fontWeight: "800",
      color: C.text,
      marginBottom: 4,
    },
    subtitle: { color: C.muted, fontSize: 13, marginBottom: 16 },
    kicker: {
      color: C.purple,
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 1.2,
      marginBottom: 4,
    },
    muted: { color: C.muted, fontSize: 14 },
    textMuted: { color: C.muted, fontSize: 12 },
    row: { flexDirection: "row", alignItems: "center" },
    backLink: { color: C.purple, fontSize: 14, fontWeight: "600" },
    subsectionTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: C.text,
      marginBottom: 12,
    },
    filterLabel: { color: C.muted, fontSize: 12, marginBottom: 8 },
    errorText: { color: C.danger, fontSize: 12, marginTop: 4 },
    successText: { color: C.green, fontSize: 12, marginTop: 4 },
    inputValid: { borderColor: C.green },
    inputError: { borderColor: C.danger },
    upgradeBanner: {
      marginBottom: 14,
      borderWidth: 1,
      borderColor: C.green,
      backgroundColor: "rgba(34, 197, 94, 0.08)",
      borderRadius: 16,
      padding: 14,
    },
    upgradeBannerTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: "#166534",
      marginBottom: 6,
    },
    upgradeBannerText: {
      color: "#14532d",
      fontSize: 13,
      lineHeight: 18,
    },

    // ── Card
    card: {
      backgroundColor: "rgba(255,255,255,0.04)",
      borderWidth: 1,
      borderColor: "rgba(139,92,246,0.18)",
      borderRadius: 16,
      padding: 16,
      marginBottom: 4,
    },
    cardTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: C.text,
      marginBottom: 8,
    },

    // ── Badge
    badge: {
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderWidth: 1,
    },
    badgeText: { fontSize: 11, fontWeight: "700" },

    // ── Filter pill
    filterPill: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: C.purpleBorder,
      marginRight: 8,
    },
    filterPillActive: { backgroundColor: C.purple, borderColor: C.purple },
    filterPillText: { color: C.muted, fontSize: 13 },
    filterPillTextActive: { color: "#fff", fontWeight: "700" },
    filterRow: { flexDirection: "row" },

    // ── Tab
    tabRow: { flexDirection: "row", gap: 8 },
    tabBtn: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: C.purpleBorder,
    },
    tabBtnActive: { backgroundColor: C.purple, borderColor: C.purple },
    tabBtnText: { color: C.muted, fontSize: 13 },
    tabBtnTextActive: { color: "#fff", fontWeight: "700" },

    // ── Toggle
    toggleRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(139,92,246,0.12)",
    },
    toggleLabel: { color: C.text, fontSize: 14, flex: 1, marginRight: 12 },

    // ── Input
    inputGroup: { marginBottom: 4 },
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
    inputPrefix: {
      backgroundColor: "rgba(255,255,255,0.04)",
      borderWidth: 1,
      borderColor: C.purpleBorder,
      borderRightWidth: 0,
      borderTopLeftRadius: 10,
      borderBottomLeftRadius: 10,
      paddingHorizontal: 12,
      justifyContent: "center",
      alignItems: "center",
    },
    selectDisplay: { justifyContent: "center" },

    // ── Buttons
    btnPrimary: {
      backgroundColor: C.purple,
      borderRadius: 12,
      paddingHorizontal: 18,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },
    btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
    btnOutline: {
      borderRadius: 12,
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderWidth: 1.5,
      borderColor: C.purpleBorder,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },
    btnOutlineText: { color: C.purple, fontWeight: "600", fontSize: 14 },
    btnReject: {
      backgroundColor: C.dangerBg,
      borderRadius: 12,
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderWidth: 1.5,
      borderColor: C.dangerBorder,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },
    btnRejectText: { color: C.danger, fontWeight: "600", fontSize: 14 },
    btnDisabled: { opacity: 0.4 },
    removeBtn: {
      backgroundColor: C.dangerBg,
      borderRadius: 8,
      padding: 6,
      borderWidth: 1,
      borderColor: C.dangerBorder,
    },
    rowGap: { flexDirection: "row", gap: 10 },

    // ── Modality cards
    modalityCards: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 16,
      marginTop: 8,
    },
    modalityCard: {
      flex: 1,
      padding: 14,
      backgroundColor: "rgba(255,255,255,0.02)",
      borderWidth: 2,
      borderColor: "rgba(139,92,246,0.12)",
      borderRadius: 12,
      alignItems: "center",
    },
    modalityCardActive: { borderColor: C.purple, backgroundColor: C.purpleDim },

    // ── Modality badge (in vacante cards)
    modalityBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      borderWidth: 1,
    },
    modalityBadgeText: { fontSize: 11, fontWeight: "700" },

    // ── Vacante
    vacanteHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 12,
    },
    vacanteTitle: { fontSize: 16, fontWeight: "700", color: C.text },
    vacanteStats: { flexDirection: "row", gap: 0, marginTop: 4 },
    vacanteStatItem: { flex: 1, alignItems: "center", gap: 2 },
    vacanteStatLabel: { fontSize: 11, color: C.muted },
    vacanteStatValue: { fontSize: 15, fontWeight: "700", color: C.text },

    // ── Stepper
    stepper: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 24,
      flexWrap: "wrap",
      gap: 4,
    },
    stepItem: { alignItems: "center", gap: 6 },
    stepCircle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: "rgba(255,255,255,0.04)",
      borderWidth: 2,
      borderColor: C.purpleBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    stepCircleActive: { backgroundColor: C.purple, borderColor: C.purple },
    stepCircleText: { fontWeight: "700", color: C.muted },
    stepLabel: {
      fontSize: 11,
      color: C.muted,
      textAlign: "center",
      maxWidth: 80,
    },
    stepLabelActive: { color: C.text, fontWeight: "600" },
    stepLine: {
      width: 36,
      height: 2,
      backgroundColor: C.purpleBorder,
      marginHorizontal: 4,
      marginBottom: 20,
    },
    stepActions: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 24,
    },

    // ── Error box
    errorBox: {
      backgroundColor: C.dangerBg,
      borderWidth: 1,
      borderColor: C.dangerBorder,
      borderRadius: 12,
      padding: 14,
      marginBottom: 16,
    },
    errorBoxText: { color: C.danger, fontSize: 13, marginBottom: 4 },

    // ── Location info (sin mapa)
    locationInfo: {
      backgroundColor: C.purpleDim,
      borderRadius: 10,
      padding: 12,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: C.purpleBorder,
      gap: 4,
    },

    // ── Grids
    grid2: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
    grid3: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

    // ── Metrics
    metricCard: {
      flex: 1,
      minWidth: "44%",
      alignItems: "center",
      paddingVertical: 20,
    },
    metricIcon: { fontSize: 26, marginBottom: 8 },
    metricNumber: { fontSize: 28, fontWeight: "900", color: C.text },
    metricLabel: {
      fontSize: 12,
      color: C.muted,
      textAlign: "center",
      marginTop: 4,
    },
    metricTrend: { fontSize: 12, marginTop: 6, fontWeight: "600" },
    trendPos: { color: C.green },
    trendNeg: { color: C.danger },
    planBar: {
      height: 8,
      backgroundColor: "rgba(255,255,255,0.08)",
      borderRadius: 4,
      overflow: "hidden",
      marginTop: 8,
    },
    planBarFill: { height: "100%", backgroundColor: C.purple, borderRadius: 4 },

    // ── Notif
    notifItem: { flexDirection: "row", alignItems: "center", gap: 12 },
    notifIconBox: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    notifTitle: { fontSize: 14, fontWeight: "700", color: C.text },

    // ── Horas sociales
    requestHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 12,
    },
    uniName: { fontSize: 15, fontWeight: "700", color: C.text },
    career: { fontSize: 13, color: C.muted },
    period: { fontSize: 12, color: C.muted },
    studentCard: { flexDirection: "row", alignItems: "center" },
    studentAvatarWrapper: {
      position: "relative",
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: C.purpleDim,
      alignItems: "center",
      justifyContent: "center",
    },
    statusDot: {
      position: "absolute",
      bottom: 0,
      right: 0,
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: C.bg,
    },
    studentName: { color: C.text, fontWeight: "700", fontSize: 14 },
    progressBar: {
      height: 6,
      backgroundColor: "rgba(255,255,255,0.10)",
      borderRadius: 3,
      overflow: "hidden",
      marginTop: 8,
      marginBottom: 4,
    },
    progressFill: {
      height: "100%",
      backgroundColor: C.purple,
      borderRadius: 3,
    },
    progressText: { fontSize: 12, color: C.muted },
    ratingRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: 8,
    },
    ratingStar: {
      width: 40,
      height: 40,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.12)",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.04)",
    },
    ratingStarActive: {
      borderColor: C.green,
      backgroundColor: "rgba(39,174,96,0.14)",
    },

    // ── Table
    tableRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    tableHead: {
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(139,92,246,0.15)",
      marginBottom: 4,
    },
    tableHeadText: { color: C.muted, fontSize: 12, fontWeight: "700" },
    tableBodyRow: {
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(255,255,255,0.04)",
    },
    tableCell: { flex: 1, color: C.text },

    // ── Candidato
    candidatoAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: C.purpleDim,
      borderWidth: 2,
      borderColor: C.purpleBorder,
      alignItems: "center",
      justifyContent: "center",
    },

    // ── Skills
    skillPills: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      justifyContent: "center",
      marginBottom: 10,
    },
    skillPill: {
      backgroundColor: C.purpleDim,
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    skillPillText: { color: C.purple, fontSize: 11, fontWeight: "500" },
    availableBadge: {
      backgroundColor: C.greenBg,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderWidth: 1,
      borderColor: C.greenBorder,
    },
    availableBadgeText: { color: C.green, fontSize: 11, fontWeight: "600" },

    // ── Talent cards
    talentCard: {
      flex: 1,
      minWidth: "45%",
      alignItems: "center",
      paddingVertical: 20,
    },
    talentAvatarWrapper: {
      width: 70,
      height: 70,
      borderRadius: 35,
      backgroundColor: C.purpleDim,
      borderWidth: 2,
      borderColor: C.purpleBorder,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    talentName: {
      fontSize: 16,
      fontWeight: "700",
      color: C.text,
      marginBottom: 4,
    },

    // ── Payment
    paymentSummary: {
      flex: 1,
      minWidth: "28%",
      alignItems: "center",
      paddingVertical: 20,
    },
    paymentSummaryLabel: { color: C.muted, fontSize: 12, marginBottom: 8 },
    paymentSummaryValue: { fontSize: 22, fontWeight: "700", color: C.text },

    // ── Profile
    profileBanner: {
      backgroundColor: "rgba(255,255,255,0.04)",
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 20,
      padding: 20,
      overflow: "hidden",
    },
    bannerOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(139,92,246,0.06)",
    },
    bannerContent: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 16,
    },
    bigAvatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: C.purpleDim,
      borderWidth: 2,
      borderColor: C.purpleBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    profileCompanyName: { fontSize: 24, fontWeight: "800", color: C.text },
    profileStats: {
      flexDirection: "row",
      gap: 24,
      marginTop: 16,
      flexWrap: "wrap",
    },
    profileStatItem: { alignItems: "center" },
    profileStatNum: { fontSize: 20, fontWeight: "800", color: C.purple },
    verifiedBadge: {
      backgroundColor: C.greenBg,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderWidth: 1,
      borderColor: C.greenBorder,
      alignSelf: "flex-start",
      marginTop: 6,
    },
    verifiedText: { color: C.green, fontSize: 12, fontWeight: "700" },

    // ── Contact
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

    // ── Avatar rep
    repAvatar: {
      backgroundColor: C.purpleDim,
      borderWidth: 2,
      borderColor: C.purpleBorder,
      alignItems: "center",
      justifyContent: "center",
    },

    // ── Modal
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
      gap: 12,
      backgroundColor: C.surface,
    },
    modalCloseBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "rgba(255,255,255,0.08)",
      alignItems: "center",
      justifyContent: "center",
    },
    modalTitle: { flex: 1, fontSize: 18, fontWeight: "800", color: C.text },

    // ── Dropdown
    dropdown: {
      backgroundColor: C.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: C.purpleBorder,
      marginTop: 4,
      zIndex: 100,
      overflow: "hidden",
    },
    dropdownItem: {
      padding: 12,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(255,255,255,0.04)",
    },
    dropdownItemActive: { backgroundColor: C.purpleDim },
    dropdownText: { color: "rgba(255,255,255,0.75)", fontSize: 14 },
  });
}
