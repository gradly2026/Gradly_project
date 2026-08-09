import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,


  TouchableOpacity,
  View,
} from "react-native";
import { AutoText as Text, AutoTextInput as TextInput } from "../../src/components/AutoText";

import AppHeader from "../../components/AppHeader";
import { auth, db, storage } from "../../src/config/firebaseConfig";
import { useTheme, type GradlyColors } from "../../src/context/ThemeContext";
import { useLoginBackGuard } from "../../src/hooks/useSessionBackGuard";
import {
  CARRERAS_EL_SALVADOR,
  type Carrera,
  zonaDeCarrera,
  avisosZonaRoja,
  carrerasRojasEn,
  type AvisoZonaRoja,
} from "../../src/data/carreras";
import {
  maskExp,
  maskTarjeta,
  valCvv,
  valExp,
  valTarjetaNum,
  valTitular,
} from "../../utils/cardValidation";

// ══════════════════════════════════════════════════════════════════
//  Design tokens — derivados del tema activo (claro / oscuro)
//  Mantiene los mismos nombres de token que usaba la paleta fija, pero
//  se alimentan de useTheme().colors para que TODA la pantalla cambie
//  con el modo. Cada componente obtiene C/s vía useRegistroTheme().
// ══════════════════════════════════════════════════════════════════
const makeC = (colors: GradlyColors) => ({
  bg: colors.backgroundDark, // fondo principal (claro en light, oscuro en dark)
  surface: colors.backgroundCard, // tarjetas / paneles / modales
  accent: colors.primary,
  accent70: colors.primaryLight,
  accent40: colors.primary35,
  accent20: colors.primary12,
  text: colors.textPrimary,
  textSub: colors.white60,
  textMuted: colors.textMuted,
  border: colors.border,
  inputBg: colors.white4, // relleno sutil de inputs / chips
  inputBorder: colors.primary35,
  red: colors.error,
  redBg: "rgba(239,68,68,0.10)",
  redBorder: "rgba(239,68,68,0.35)",
  green: colors.success,
  greenBg: "rgba(34,197,94,0.15)",
});

type Tokens = ReturnType<typeof makeC>;

/**
 * Hook de tema para esta pantalla: devuelve los tokens (C) y la hoja de
 * estilos (s) memorizados, además de isDark. Cada componente lo invoca
 * para reaccionar al modo claro/oscuro sin cambiar su estructura.
 */
function useRegistroTheme() {
  const { colors, isDark } = useTheme();
  const C = useMemo(() => makeC(colors), [colors]);
  const s = useMemo(() => makeStyles(C), [C]);
  return { C, s, isDark };
}

// ══════════════════════════════════════════════════════════════════
//  Tipos
// ══════════════════════════════════════════════════════════════════
type Flow = "empresa" | "universidad" | null;
type DocType = "dui" | "pasaporte" | "licencia";

// Reglas de documento (El Salvador) — SIN guiones, todo de corrido.
interface DocRule {
  maxLen: number;
  pattern: RegExp;
  hint: string;
  upper?: boolean;
  numeric?: boolean;
}
const DOC_RULES: Record<DocType, DocRule> = {
  dui: {
    maxLen: 9,
    pattern: /^\d{9}$/,
    hint: "DUI: 9 dígitos sin guion (ej: 123456789)",
    numeric: true,
  },
  pasaporte: {
    maxLen: 8,
    pattern: /^[A-Z]\d{7}$/,
    hint: "Pasaporte: 1 letra + 7 dígitos (ej: A1234567)",
    upper: true,
  },
  licencia: {
    maxLen: 10,
    pattern: /^\d{10}$/,
    hint: "Licencia: 10 dígitos sin guion",
    numeric: true,
  },
};

// Limpia la entrada del documento según su tipo (bloquea guiones y símbolos).
function cleanDoc(v: string, docType: DocType): string {
  const rule = DOC_RULES[docType];
  if (rule.numeric) return v.replace(/\D/g, "").slice(0, rule.maxLen);
  // Pasaporte: mayúsculas, solo letras y números.
  return v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, rule.maxLen);
}

// ══════════════════════════════════════════════════════════════════
//  Planes de suscripción (empresas)
// ══════════════════════════════════════════════════════════════════
type PlanId = "gratuito" | "mensual" | "premium";

// Restricciones inyectadas en perfiles_empresas/{uid}. El resto de la
// plataforma lee estos campos para limitar vacantes/alianzas y pintar
// la insignia de "Empresa Verificada".
interface PlanRestricciones {
  plan: PlanId;
  limiteVacantes: number;
  limiteAlianzas: number;
  verificado: boolean;
}

interface PlanInfo extends PlanRestricciones {
  nombre: string;
  precio: string; // precio mensual (display)
  precioAnual: string; // precio anual (display)
  periodo: string;
  descripcion: string;
  features: string[];
  requierePago: boolean;
  destacado?: boolean;
}

const PLANES: PlanInfo[] = [
  {
    plan: "gratuito",
    nombre: "Gratuito",
    precio: "$0",
    precioAnual: "$0",
    periodo: "/mes",
    descripcion: "Para empezar a publicar.",
    limiteVacantes: 2,
    limiteAlianzas: 1,
    verificado: false,
    requierePago: false,
    features: [
      "Hasta 2 vacantes activas",
      "1 alianza con universidad",
      "Soporte por correo",
    ],
  },
  {
    plan: "mensual",
    nombre: "Plan Básico",
    precio: "$9.99",
    precioAnual: "$49.99",
    periodo: "/mes",
    descripcion: "Para empresas en crecimiento.",
    limiteVacantes: 10,
    limiteAlianzas: 5,
    verificado: false,
    requierePago: true,
    features: [
      "Hasta 10 vacantes activas simultáneas",
      "Hasta 5 alianzas estratégicas con universidades",
      "Acceso completo a métricas básicas de postulantes",
      "Soporte estándar vía correo electrónico",
    ],
  },
  {
    plan: "premium",
    nombre: "Plan Premium",
    precio: "$24.99",
    precioAnual: "$149.99",
    periodo: "/mes",
    descripcion: "Sin límites, con insignia verificada.",
    limiteVacantes: 9999,
    limiteAlianzas: 9999,
    verificado: true,
    requierePago: true,
    destacado: true,
    features: [
      "Vacantes activas e históricas ILIMITADAS",
      "Alianzas con universidades ILIMITADAS",
      "Insignia de Empresa Verificada (Gold Star)",
      "Acceso prioritario a graduados destacados",
      "Soporte 24/7 con ejecutivo asignado",
    ],
  },
];

// Devuelve el precio/periodo a mostrar según el período elegido.
// El plan gratuito se muestra siempre como mensual.
const precioVisible = (
  info: PlanInfo,
  periodo: "mensual" | "anual",
): { precio: string; periodo: string } => {
  if (!info.requierePago || periodo === "mensual") {
    return { precio: info.precio, periodo: "/mes" };
  }
  return { precio: info.precioAnual, periodo: "/año" };
};

// Extrae solo las restricciones que se guardan en Firestore.
const restriccionesDePlan = (id: PlanId): PlanRestricciones => {
  const p = PLANES.find((x) => x.plan === id) ?? PLANES[0];
  return {
    plan: p.plan,
    limiteVacantes: p.limiteVacantes,
    limiteAlianzas: p.limiteAlianzas,
    verificado: p.verificado,
  };
};

// ── Datos de tarjeta capturados en el modal (solo estado local) ────
interface DatosTarjeta {
  numero: string; // con espacios, como se muestra
  exp: string; // MM/AA
  cvv: string;
  titular: string;
}

// ══════════════════════════════════════════════════════════════════
//  Interfaz del perfil de empresa que se persiste en Firestore
//  (incluye los campos de plan para que TypeScript los reconozca)
// ══════════════════════════════════════════════════════════════════
interface PerfilEmpresa extends PlanRestricciones {
  uid: string;
  nombre_empresa: string;
  nit: string;
  industria: string;
  descripcion: string;
  logo_url: string;
  sitio_web: string;
  telefono: string;
  direccion: string;
  departamento: string;
  ciudad: string;
  instagram: string;
  facebook: string;
  contacto_nombre: string;
  contacto_cargo: string;
  contacto_telefono: string;
  contacto_correo: string;
  contacto_documento_tipo: DocType;
  contacto_documento_numero: string;
  premium: boolean;
  estado_suscripcion: string;
  stripe_id: string;
  calificacion_promedio: number;
  tarjeta_numero: string;
  tarjeta_alias: string;
}

// ── Catálogos ─────────────────────────────────────────────────────
const INDUSTRIAS = [
  "Tecnología",
  "Finanzas y Banca",
  "Comercio y Retail",
  "Salud",
  "Educación",
  "Manufactura",
  "Construcción",
  "Servicios",
  "Media y Entretenimiento",
  "Logística y Transporte",
  "Otro",
];

// Geo El Salvador (departamento → ciudades)
const GEO_DATA: Record<string, string[]> = {
  Ahuachapán: ["Ahuachapán", "Atiquizaya", "Tacuba", "El Refugio", "Turín"],
  Cabañas: ["Sensuntepeque", "Ilobasco", "Victoria", "San Isidro"],
  Chalatenango: ["Chalatenango", "La Palma", "Tejutla", "San Francisco Morazán"],
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

const FLOW_LABELS: Record<Exclude<Flow, null>, string[]> = {
  empresa: ["Datos", "Logo", "Representante", "Plan", "Seguridad"],
  universidad: ["Institución", "Logo", "Carreras", "Responsable", "Seguridad"],
};

// ══════════════════════════════════════════════════════════════════
//  Catálogo de Carreras Universitarias (El Salvador)
//  Base local extraída de la oferta nacional (UES y otras IES):
//  Técnicos, Profesorados, Licenciaturas, Ingenierías y Doctorados.
//  Se usa en el paso 4 del flujo de universidad para que la institución
//  declare qué carreras oferta (campo carreras_ofertadas en Firestore).
// ══════════════════════════════════════════════════════════════════
// Catálogo de carreras: fuente única en src/data/carreras.ts (con zona).

// Límite máximo de carreras que una universidad puede seleccionar.
const MAX_CARRERAS = 65;

// ══════════════════════════════════════════════════════════════════
//  Helpers de validación
// ══════════════════════════════════════════════════════════════════
// ── Expresiones regulares de la maqueta ───────────────────────────
const RX_LETTERS = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/; // nombre comercial / cargo
const RX_INDUSTRIA_OTRO = /^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]+$/; // industria "Otro"
const RX_NIT = /^\d{4}-\d{6}-\d{3}-\d{1}$/; // ####-######-###-#
const RX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RX_DESC = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ0-9\s.,;:¿?¡!()'"%/\-]+$/; // texto + puntuación básica
const RX_DIRECCION = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ0-9\s#.\-]+$/; // dirección
const RX_UNI_NOMBRE = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s().\-]+$/; // nombre de universidad
const RX_DOMINIO = /^@[^\s@]+\.[a-zA-Z]{2,}$/; // @uca.edu.sv
const RX_WEB =
  /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)$/;
const RX_IG = /^(https?:\/\/)?(www\.)?instagram\.com\/[A-Za-z0-9_.\-]{1,255}\/?$/;
const RX_FB = /^(https?:\/\/)?(www\.)?facebook\.com\/[A-Za-z0-9.]{1,255}\/?$/;

// ── Máscara automática de NIT → ####-######-###-# ─────────────────
function maskNit(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 14); // 4 + 6 + 3 + 1 = 14 dígitos
  let out = d.slice(0, 4);
  if (d.length > 4) out += "-" + d.slice(4, 10);
  if (d.length > 10) out += "-" + d.slice(10, 13);
  if (d.length > 13) out += "-" + d.slice(13, 14);
  return out;
}

// ── Filtros de entrada (bloquean caracteres inválidos al teclear) ──
const filterLetters = (v: string) =>
  v.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, "");
const filterIndustriaOtro = (v: string) =>
  v.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g, "");
const filterDireccion = (v: string) =>
  v.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ0-9\s#.\-]/g, "");
const filterUniNombre = (v: string) =>
  v.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s().\-]/g, "");
// Siglas: mayúsculas, solo letras/números, máx. 10 caracteres.
const filterSiglas = (v: string) =>
  v.toUpperCase().replace(/[^A-ZÁÉÍÓÚÑ0-9]/g, "").slice(0, 10);

// ── Validadores en tiempo real: devuelven "" si el dato es válido ──
const valLetters =
  (min = 2) =>
  (v: string) => {
    const t = v.trim();
    if (!t) return "Este campo es requerido";
    if (!RX_LETTERS.test(t)) return "Solo se permiten letras y espacios";
    if (t.length < min) return `Mínimo ${min} caracteres`;
    return "";
  };
const valEmailFmt = (v: string) => {
  const t = v.trim();
  if (!t) return "Este campo es requerido";
  if (!RX_EMAIL.test(t)) return "Ingresa un correo válido";
  return "";
};
const valDesc = (v: string) => {
  const t = v.trim();
  if (!t) return "Este campo es requerido";
  if (t.length < 5) return "Mínimo 5 caracteres";
  if (t.length > 300) return "Máximo 300 caracteres";
  if (!RX_DESC.test(t)) return "Contiene caracteres no permitidos";
  return "";
};
const valNit = (v: string) => {
  if (!v.trim()) return "Este campo es requerido";
  return RX_NIT.test(v.trim()) ? "" : "NIT inválido (formato ####-######-###-#)";
};
const valIndustriaOtro = (v: string) => {
  const t = v.trim();
  if (!t) return "Especifica la industria";
  return RX_INDUSTRIA_OTRO.test(t) ? "" : "Solo se permiten letras y números";
};
const valDireccion = (v: string) => {
  const t = v.trim();
  if (!t) return ""; // opcional
  return RX_DIRECCION.test(t) ? "" : "Solo letras, números y los caracteres # . -";
};
const valUniNombre = (v: string) => {
  const t = v.trim();
  if (!t) return "Este campo es requerido";
  if (!RX_UNI_NOMBRE.test(t)) return "Solo letras y los caracteres ( ) . -";
  if (t.length < 4) return "Mínimo 4 caracteres";
  return "";
};
const valSiglas = (v: string) => {
  const t = v.trim();
  if (!t) return "Este campo es requerido";
  if (t.length > 10) return "Máximo 10 caracteres";
  return "";
};
const valDominio = (v: string) => {
  const t = v.trim();
  if (!t) return "Este campo es requerido";
  return RX_DOMINIO.test(t) ? "" : "Dominio inválido (ej: @uca.edu.sv)";
};
const valPhone = (v: string) => {
  const d = v.replace(/\D/g, "");
  if (!d) return "Este campo es requerido";
  if (d.length < 8) return "El número debe tener 8 dígitos";
  return "";
};
const valDoc = (t: DocType, v: string) => {
  const d = v.trim();
  if (!d) return "Este campo es requerido";
  return DOC_RULES[t].pattern.test(d) ? "" : DOC_RULES[t].hint;
};
const valOptional = (rx: RegExp, msg: string) => (v: string) => {
  const t = v.trim();
  if (!t) return ""; // opcional: vacío es válido
  return rx.test(t) ? "" : msg;
};

// Validación de tarjeta (pasarela simulada) — fuente única compartida
// con el panel de empresa en utils/cardValidation.

function getPassScore(val: string): number {
  if (!val) return 0;
  const hasLower = /[a-z]/.test(val);
  const hasUpper = /[A-Z]/.test(val);
  const hasNum = /[0-9]/.test(val);
  const hasSpc = /[^A-Za-z0-9]/.test(val);
  const long = val.length >= 8;
  if (hasUpper && hasLower && hasNum && hasSpc && long) return 4;
  if (hasUpper && hasLower && hasNum) return 3;
  if ((hasLower || hasUpper) && hasNum) return 2;
  return 1;
}
const PASS_LABELS = ["", "Débil", "Media", "Fuerte", "Muy Fuerte"];
const PASS_COLORS = ["", "#ef4444", "#f59e0b", "#22c55e", "#10b981"];

// ── Mapea errores de Firebase Auth a mensajes legibles ────────────
function mapFirebaseError(code: string): string {
  if (code.includes("email-already-in-use"))
    return "Ese correo ya está registrado. Inicia sesión.";
  if (code.includes("weak-password"))
    return "La contraseña es demasiado débil (mínimo 8 caracteres).";
  if (code.includes("invalid-email"))
    return "El correo no tiene un formato válido.";
  if (code.includes("network-request-failed"))
    return "Sin conexión. Verifica tu internet e intenta de nuevo.";
  return "No se pudo crear la cuenta. Intenta de nuevo.";
}

/**
 * Verifica en Firestore (colección `usuarios`) si un correo ya está
 * registrado. Se usa para validar en tiempo real tanto el alta de
 * Empresas como de Universidades antes de llegar a Firebase Auth.
 */
async function emailYaRegistrado(correo: string): Promise<boolean> {
  const q = query(
    collection(db, "usuarios"),
    where("correo", "==", correo.trim().toLowerCase()),
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

// ── Selección de imagen desde galería ─────────────────────────────
async function pickImage(setter: (uri: string) => void): Promise<void> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    // Nota: en este flujo el aviso se delega a la UI; no bloquea.
    return;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.85,
  });
  if (!result.canceled && result.assets[0]) {
    setter(result.assets[0].uri);
  }
}

/**
 * Sube el logo a Firebase Storage.
 *
 * FIX clásico de Expo: `uploadBytes` falla con URIs locales (file://),
 * por eso convertimos la imagen a Blob con `fetch` antes de subirla.
 * Ruta EXACTA exigida por las reglas de seguridad: logos_empresas/{uid}/{fileName}
 */
async function uploadLogo(uid: string, localUri: string): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();

  // Nombre de archivo determinista para que la ruta de LECTURA coincida
  // siempre con la de ESCRITURA: logos_empresas/{uid}/logo.jpg
  // (sigue cumpliendo la regla de seguridad logos_empresas/{uid}/{fileName}).
  const storageRef = ref(storage, `logos_empresas/${uid}/logo.jpg`);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

// ══════════════════════════════════════════════════════════════════
//  Sub-componentes reutilizables
// ══════════════════════════════════════════════════════════════════
function FloatInput({
  label,
  value,
  onChangeText,
  secureTextEntry = false,
  keyboardType = "default",
  multiline = false,
  maxLength,
  autoCapitalize = "none",
  error,
  rightIcon,
  style,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: any;
  multiline?: boolean;
  maxLength?: number;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  error?: string;
  rightIcon?: React.ReactNode;
  style?: any;
}) {
  const { s, C } = useRegistroTheme();
  const [focused, setFocused] = useState(false);
  const active = focused || value.length > 0;
  const success = value.trim().length > 0 && !error;
  return (
    <View style={[s.floatWrap, style]}>
      <Text style={[s.floatLabel, active && s.floatLabelActive]}>{label}</Text>
      <View
        style={[
          s.inputRow,
          focused && s.inputFocused,
          error ? s.inputErr : success ? s.inputSuccess : null,
        ]}
      >
        <TextInput
          style={[s.textInput, multiline && { height: 90, textAlignVertical: "top" }]}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          multiline={multiline}
          maxLength={maxLength}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholderTextColor="transparent"
          autoCapitalize={autoCapitalize}
          selectionColor={C.accent}
        />
        {rightIcon}
      </View>
      {!!error && <Text style={s.errText}>{error}</Text>}
    </View>
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
  const { s, C } = useRegistroTheme();
  const [open, setOpen] = useState(false);
  const success = !!value && !error;
  return (
    <View style={[s.floatWrap, style]}>
      <Text style={[s.floatLabel, value ? s.floatLabelActive : null]}>{label}</Text>
      <TouchableOpacity
        style={[s.inputRow, s.selectRow, error ? s.inputErr : success ? s.inputSuccess : null]}
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.7}
      >
        <Text style={value ? s.selectVal : s.selectPlaceholder} numberOfLines={1}>
          {value || "Selecciona…"}
        </Text>
        <Text style={s.selectArrow}>{open ? "▴" : "▾"}</Text>
      </TouchableOpacity>
      {open && (
        <View style={s.dropdown}>
          <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[s.dropdownItem, value === opt && s.dropdownItemActive]}
                onPress={() => {
                  onChange(opt);
                  setOpen(false);
                }}
              >
                <Text style={[s.dropdownText, value === opt && { color: C.accent70 }]}>
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
      {!!error && <Text style={s.errText}>{error}</Text>}
    </View>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const { s, C } = useRegistroTheme();
  const [show, setShow] = useState(false);
  const score = value ? getPassScore(value) : 0;
  return (
    <View>
      <FloatInput
        label={label}
        value={value}
        onChangeText={onChange}
        secureTextEntry={!show}
        error={error}
        rightIcon={
          <TouchableOpacity onPress={() => setShow((v) => !v)} style={{ padding: 6 }}>
            <Ionicons
              name={show ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={C.textMuted}
            />
          </TouchableOpacity>
        }
      />
      {value.length > 0 && (
        <View style={s.strengthWrap}>
          <View style={s.strengthBars}>
            {[1, 2, 3, 4].map((i) => (
              <View
                key={i}
                style={[
                  s.strengthBar,
                  i <= score && { backgroundColor: PASS_COLORS[score] },
                ]}
              />
            ))}
          </View>
          <Text style={[s.strengthLabel, { color: PASS_COLORS[score] }]}>
            {PASS_LABELS[score]}
          </Text>
        </View>
      )}
    </View>
  );
}

function UploadZone({
  label,
  imageUri,
  onPress,
  error,
}: {
  label: string;
  imageUri?: string | null;
  onPress: () => void;
  error?: string;
}) {
  const { s, C } = useRegistroTheme();
  return (
    <View style={{ marginBottom: 12 }}>
      <TouchableOpacity
        style={[
          s.uploadZone,
          { marginBottom: 0 },
          !!imageUri && s.uploadZoneFilled,
          !!error && !imageUri && s.uploadZoneErr,
        ]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        {imageUri ? (
          <>
            <Image source={{ uri: imageUri }} style={s.uploadPreview} resizeMode="cover" />
            <Text style={s.uploadChangeText}>Toca para cambiar</Text>
          </>
        ) : (
          <>
            <Ionicons name="cloud-upload-outline" size={32} color={C.accent70} />
            <Text style={s.uploadLabel}>{label}</Text>
            <Text style={s.uploadHint}>PNG, JPG · Máx. 10MB</Text>
          </>
        )}
      </TouchableOpacity>
      {!!error && <Text style={s.errText}>{error}</Text>}
    </View>
  );
}

function DocTypeSelector({
  value,
  onChange,
}: {
  value: DocType;
  onChange: (v: DocType) => void;
}) {
  const { s, C } = useRegistroTheme();
  const opts: { key: DocType; label: string }[] = [
    { key: "dui", label: "DUI" },
    { key: "pasaporte", label: "Pasaporte" },
    { key: "licencia", label: "Licencia" },
  ];
  return (
    <View style={{ marginBottom: 6 }}>
      <Text style={s.floatLabel}>Tipo de documento</Text>
      <View style={s.docTypeRow}>
        {opts.map((o) => (
          <TouchableOpacity
            key={o.key}
            style={[s.docTypeBtn, value === o.key && s.docTypeBtnActive]}
            onPress={() => onChange(o.key)}
            activeOpacity={0.7}
          >
            <Text style={[s.docTypeBtnText, value === o.key && { color: C.accent70 }]}>
              {o.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function StepNav({
  onBack,
  onNext,
  nextLabel = "Siguiente →",
  loading = false,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  loading?: boolean;
}) {
  const { s } = useRegistroTheme();
  return (
    <View style={s.stepNav}>
      <TouchableOpacity style={s.btnOutline} onPress={onBack} disabled={loading}>
        <Text style={s.btnOutlineText}>← Anterior</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.btnPrimary, loading && { opacity: 0.6 }]}
        onPress={onNext}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={s.btnPrimaryText}>{nextLabel}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  const { s } = useRegistroTheme();
  return <Text style={s.sectionLabel}>{children}</Text>;
}

function InfoNote({ children }: { children: React.ReactNode }) {
  const { s } = useRegistroTheme();
  return (
    <View style={s.infoNote}>
      <Text style={s.infoNoteText}>{children}</Text>
    </View>
  );
}

function Stepper({ flow, step }: { flow: Exclude<Flow, null>; step: number }) {
  const { s, C } = useRegistroTheme();
  const labels = FLOW_LABELS[flow];
  return (
    <View style={s.stepperWrap}>
      {labels.map((_, idx) => {
        const n = idx + 1;
        const done = n < step;
        const activeStep = n === step;
        return (
          <React.Fragment key={n}>
            <View style={s.stepperItem}>
              <View
                style={[
                  s.stepperCircle,
                  done && s.stepperDone,
                  activeStep && s.stepperActive,
                ]}
              >
                {done ? (
                  <Ionicons name="checkmark" size={18} color="#fff" />
                ) : (
                  <Text
                    style={[
                      s.stepperCircleText,
                      activeStep && { color: C.accent70 },
                    ]}
                  >
                    {n}
                  </Text>
                )}
              </View>
            </View>
            {n < labels.length && <View style={s.stepperConnector} />}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ── Tarjeta de plan de suscripción ─────────────────────────────────
function PlanCard({
  info,
  selected,
  onPress,
  precio,
  periodo,
}: {
  info: PlanInfo;
  selected: boolean;
  onPress: () => void;
  precio: string;
  periodo: string;
}) {
  const { s, C } = useRegistroTheme();
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        s.planCard,
        info.destacado && s.planCardFeatured,
        selected && s.planCardSelected,
      ]}
    >
      {info.destacado && (
        <View style={s.planRibbon}>
          <Text style={s.planRibbonText}>RECOMENDADO</Text>
        </View>
      )}
      <View style={s.planHeaderRow}>
        <Text style={s.planName}>{info.nombre}</Text>
        <View style={[s.planRadio, selected && s.planRadioOn]}>
          {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
      </View>
      <View style={s.planPriceRow}>
        <Text style={s.planPrice}>{precio}</Text>
        <Text style={s.planPeriod}>{periodo}</Text>
      </View>
      <Text style={s.planDesc}>{info.descripcion}</Text>
      <View style={s.planFeatures}>
        {info.features.map((f) => (
          <View key={f} style={s.planFeatureRow}>
            <Ionicons name="checkmark-circle" size={16} color={C.accent70} />
            <Text style={s.planFeatureText}>{f}</Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );
}

// ── Modal glassmorphism para ingresar tarjeta (pago simulado) ──────
function TarjetaModal({
  visible,
  plan,
  periodoSel,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  plan: PlanInfo | null;
  periodoSel: "mensual" | "anual";
  onClose: () => void;
  onConfirm: (datos: DatosTarjeta) => void;
}) {
  const { s, C } = useRegistroTheme();
  const [numero, setNumero] = useState("");
  const [exp, setExp] = useState("");
  const [cvv, setCvv] = useState("");
  const [titular, setTitular] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});

  // Limpia los campos cada vez que se cierra el modal.
  useEffect(() => {
    if (!visible) {
      setNumero("");
      setExp("");
      setCvv("");
      setTitular("");
      setErrs({});
    }
  }, [visible]);

  const setE = (k: string, m: string) =>
    setErrs((e) => {
      const n = { ...e };
      if (m) n[k] = m;
      else delete n[k];
      return n;
    });

  const onNum = (v: string) => {
    const mv = maskTarjeta(v);
    setNumero(mv);
    setE("numero", valTarjetaNum(mv));
  };
  const onExp = (v: string) => {
    const mv = maskExp(v);
    setExp(mv);
    setE("exp", valExp(mv));
  };
  const onCvv = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 4);
    setCvv(d);
    setE("cvv", valCvv(d));
  };
  const onTit = (v: string) => {
    const f = filterLetters(v);
    setTitular(f);
    setE("titular", valTitular(f));
  };

  const confirmar = () => {
    const e: Record<string, string> = {};
    const mn = valTarjetaNum(numero);
    if (mn) e.numero = mn;
    const me = valExp(exp);
    if (me) e.exp = me;
    const mc = valCvv(cvv);
    if (mc) e.cvv = mc;
    const mt = valTitular(titular);
    if (mt) e.titular = mt;
    setErrs(e);
    if (Object.keys(e).length > 0) return;
    onConfirm({ numero, exp, cvv, titular });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.modalOverlay}>
        <View style={s.modalCard}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Datos de pago</Text>
            <TouchableOpacity onPress={onClose} style={s.modalClose}>
              <Ionicons name="close" size={20} color={C.textSub} />
            </TouchableOpacity>
          </View>

          {plan && (
            <View style={s.modalPlanRow}>
              <Text style={s.modalPlanName}>{plan.nombre}</Text>
              <Text style={s.modalPlanPrice}>
                {precioVisible(plan, periodoSel).precio}
                {precioVisible(plan, periodoSel).periodo}
              </Text>
            </View>
          )}

          <ScrollView keyboardShouldPersistTaps="handled">
            <FloatInput
              label="Número de tarjeta"
              value={numero}
              onChangeText={onNum}
              keyboardType="number-pad"
              maxLength={19}
              error={errs.numero}
            />
            <View style={s.cardRow}>
              <FloatInput
                label="Vencimiento (MM/AA)"
                value={exp}
                onChangeText={onExp}
                keyboardType="number-pad"
                maxLength={5}
                error={errs.exp}
                style={{ flex: 1 }}
              />
              <FloatInput
                label="CVV"
                value={cvv}
                onChangeText={onCvv}
                keyboardType="number-pad"
                maxLength={4}
                error={errs.cvv}
                style={{ flex: 1 }}
              />
            </View>
            <FloatInput
              label="Nombre del titular"
              value={titular}
              onChangeText={onTit}
              autoCapitalize="words"
              error={errs.titular}
            />
          </ScrollView>

          <View style={s.modalNote}>
            <Text style={s.modalNoteText}>
              🔒 Pago simulado. No se realiza ningún cargo real.
            </Text>
          </View>

          <TouchableOpacity style={s.btnPrimary} onPress={confirmar}>
            <Text style={s.btnPrimaryText}>Confirmar plan</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════
//  Modal de selección de Carreras Universitarias (solo universidad)
//
//  Estructura de 3 modales sin anidar <Modal> (evita bugs de superposición
//  en iOS): un único <Modal> contiene la búsqueda + lista (Modal 1), y los
//  Modal 2 (Ver seleccionadas) y Modal 3 (Confirmación) se pintan como
//  vistas absolutas sobre el mismo contenedor.
//   • isModal1Visible      → prop `visible` (controlado por el padre)
//   • isModal2Visible      → estado interno (ver seleccionadas)
//   • isConfirmModalVisible→ estado interno (confirmación + auto-avance)
// ══════════════════════════════════════════════════════════════════
function CarrerasModal({
  visible,
  selected,
  setSelected,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  selected: string[];
  setSelected: React.Dispatch<React.SetStateAction<string[]>>;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { s, C } = useRegistroTheme();
  const [search, setSearch] = useState("");
  const [isModal2Visible, setIsModal2Visible] = useState(false);
  const [isConfirmModalVisible, setIsConfirmModalVisible] = useState(false);

  // Resetea búsqueda y sub-modales cada vez que se cierra el Modal 1.
  useEffect(() => {
    if (!visible) {
      setSearch("");
      setIsModal2Visible(false);
      setIsConfirmModalVisible(false);
    }
  }, [visible]);

  // Filtro en tiempo real por nombre / tipo / modalidad.
  const filtradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CARRERAS_EL_SALVADOR;
    return CARRERAS_EL_SALVADOR.filter(
      (c) =>
        c.nombre.toLowerCase().includes(q) ||
        c.tipo.toLowerCase().includes(q) ||
        c.modalidad.toLowerCase().includes(q),
    );
  }, [search]);

  const isSelected = (nombre: string) => selected.includes(nombre);

  const toggle = (nombre: string) => {
    // Se permite seleccionar cualquier carrera (incluidas las Zona Roja); la
    // validación de las reguladas por el Estado ocurre al pulsar "Siguiente".
    setSelected((prev) => {
      if (prev.includes(nombre)) return prev.filter((x) => x !== nombre);
      if (prev.length >= MAX_CARRERAS) return prev; // tope alcanzado
      return [...prev, nombre];
    });
  };

  const limiteAlcanzado = selected.length >= MAX_CARRERAS;

  const renderItem = ({ item }: { item: Carrera }) => {
    const sel = isSelected(item.nombre);
    const esRoja = zonaDeCarrera(item.nombre) === "roja";
    const bloqueado = !sel && limiteAlcanzado;
    return (
      <TouchableOpacity
        style={[
          s.carreraItem,
          sel && s.carreraItemSel,
          bloqueado && { opacity: 0.4 },
        ]}
        activeOpacity={0.7}
        disabled={bloqueado}
        onPress={() => toggle(item.nombre)}
      >
        <View style={[s.carreraCheckbox, sel && s.carreraCheckboxOn]}>
          {sel && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.carreraItemName} numberOfLines={2}>
            {item.nombre}
          </Text>
          <Text style={s.carreraItemMeta}>
            {item.tipo} · {item.modalidad} · {item.duracion}
            {esRoja ? "  ·  🔒 Regulada por el Estado" : ""}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={s.modalOverlay}>
        <View style={[s.modalCard, s.carrerasModalCard]}>
          {/* ── Header Modal 1 ── */}
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Carreras</Text>
            <TouchableOpacity onPress={onClose} style={s.modalClose}>
              <Ionicons name="close" size={20} color={C.textSub} />
            </TouchableOpacity>
          </View>

          {selected.length > 0 && (
            <TouchableOpacity
              style={s.verSeleccionadasBtn}
              onPress={() => setIsModal2Visible(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="list-outline" size={16} color={C.accent70} />
              <Text style={s.verSeleccionadasText}>
                Ver Seleccionadas ({selected.length})
              </Text>
            </TouchableOpacity>
          )}

          {/* ── Buscador ── */}
          <View style={s.carrerasSearchRow}>
            <Ionicons name="search" size={18} color={C.textMuted} />
            <TextInput
              style={s.carrerasSearchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar carrera, tipo o modalidad…"
              placeholderTextColor={C.textMuted}
              selectionColor={C.accent}
              autoCorrect={false}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={18} color={C.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {limiteAlcanzado && (
            <Text style={s.carrerasLimitNote}>
              Has alcanzado el máximo de {MAX_CARRERAS} carreras.
            </Text>
          )}

          {/* ── Lista filtrada (Modal 1) ── */}
          <FlatList
            data={filtradas}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
            style={s.carrerasList}
            ListEmptyComponent={
              <Text style={s.carrerasEmpty}>
                No se encontraron carreras para “{search}”.
              </Text>
            }
          />

          {/* ── Footer Modal 1 ── */}
          <TouchableOpacity
            style={[s.btnPrimary, selected.length === 0 && { opacity: 0.5 }]}
            disabled={selected.length === 0}
            onPress={() => setIsConfirmModalVisible(true)}
          >
            <Text style={s.btnPrimaryText}>
              Aceptar{selected.length > 0 ? ` (${selected.length})` : ""}
            </Text>
          </TouchableOpacity>

          {/* ══ Modal 2 — Ver seleccionadas (vista absoluta sobre Modal 1) ══ */}
          {isModal2Visible && (
            <View style={s.subModalLayer}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>
                  Seleccionadas ({selected.length})
                </Text>
                <TouchableOpacity
                  onPress={() => setIsModal2Visible(false)}
                  style={s.modalClose}
                >
                  <Ionicons name="close" size={20} color={C.textSub} />
                </TouchableOpacity>
              </View>

              {selected.length === 0 ? (
                <Text style={s.carrerasEmpty}>
                  Aún no has seleccionado carreras.
                </Text>
              ) : (
                <FlatList
                  data={selected}
                  keyExtractor={(item) => item}
                  style={s.carrerasList}
                  renderItem={({ item }) => (
                    <View style={s.seleccionadaRow}>
                      <Text style={s.seleccionadaName} numberOfLines={2}>
                        {item}
                      </Text>
                      <TouchableOpacity
                        style={s.seleccionadaDel}
                        onPress={() =>
                          setSelected((prev) => prev.filter((x) => x !== item))
                        }
                      >
                        <Ionicons name="trash-outline" size={18} color={C.red} />
                      </TouchableOpacity>
                    </View>
                  )}
                />
              )}

              <TouchableOpacity
                style={s.btnOutline}
                onPress={() => setIsModal2Visible(false)}
              >
                <Text style={s.btnOutlineText}>Volver</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ══ Modal 3 — Confirmación + auto-avance (vista absoluta) ══ */}
          {isConfirmModalVisible && (
            <View style={s.confirmLayer}>
              <View style={s.confirmCard}>
                <View style={s.confirmIconWrap}>
                  <Ionicons
                    name="help-circle-outline"
                    size={34}
                    color={C.accent70}
                  />
                </View>
                <Text style={s.confirmTitle}>Confirmar selección</Text>
                <Text style={s.confirmDesc}>
                  Has seleccionado {selected.length}{" "}
                  {selected.length === 1 ? "carrera" : "carreras"}. ¿Deseas
                  continuar?
                </Text>
                <View style={s.confirmActions}>
                  <TouchableOpacity
                    style={s.btnOutline}
                    onPress={() => setIsConfirmModalVisible(false)}
                  >
                    <Text style={s.btnOutlineText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.btnPrimary}
                    onPress={() => {
                      setIsConfirmModalVisible(false);
                      onConfirm();
                    }}
                  >
                    <Text style={s.btnPrimaryText}>Aceptar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════
//  COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════════
export default function Registro() {
  const router = useRouter();
  useLoginBackGuard();
  const { C, s, isDark } = useRegistroTheme();
  const scrollRef = React.useRef<React.ElementRef<typeof ScrollView>>(null);
  const scrollTop = () => scrollRef.current?.scrollTo({ y: 0, animated: true });

  const [flow, setFlow] = useState<Flow>(null);
  const [step, setStep] = useState(0); // 0 = selector, 1..4 pasos, 99 = éxito
  const [submitting, setSubmitting] = useState(false);
  const [registerError, setRegisterError] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const setErr = (k: string, m: string) => setErrors((e) => ({ ...e, [k]: m }));
  const clearErr = (k: string) =>
    setErrors((e) => {
      const n = { ...e };
      delete n[k];
      return n;
    });

  // ── Factory de validación en tiempo real ───────────────────────
  // Filtra la entrada, actualiza el estado y pinta el borde verde/rojo
  // (vía `errors`) en cada pulsación: borde rojo + texto si es inválido,
  // verde si pasa la RegEx, neutro si está vacío.
  const live =
    (
      key: string,
      setter: (v: string) => void,
      filter?: (v: string) => string,
      validate?: (v: string) => string,
    ) =>
    (raw: string) => {
      const v = filter ? filter(raw) : raw;
      setter(v);
      const msg = validate ? validate(v) : "";
      if (msg) setErr(key, msg);
      else clearErr(key);
    };

  // ─────────────────────────────────────────────────────────────
  // Estado EMPRESA
  // ─────────────────────────────────────────────────────────────
  const [eNombre, setENombre] = useState("");
  const [eNit, setENit] = useState("");
  const [eIndustria, setEIndustria] = useState("");
  const [eIndustriaOtro, setEIndustriaOtro] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eDepto, setEDepto] = useState("");
  const [eCiudad, setECiudad] = useState("");
  const [eDireccion, setEDireccion] = useState("");
  const [eTel, setETel] = useState("");
  const [eEmail, setEEmail] = useState("");
  const [eWeb, setEWeb] = useState("");
  const [eIg, setEIg] = useState("");
  const [eFb, setEFb] = useState("");
  const [eLogo, setELogo] = useState<string | null>(null);
  // Representante
  const [eRepNombre, setERepNombre] = useState("");
  const [eRepCargo, setERepCargo] = useState("");
  const [eRepTel, setERepTel] = useState("");
  const [eRepEmail, setERepEmail] = useState("");
  const [eRepDocType, setERepDocType] = useState<DocType>("dui");
  const [eRepDocNum, setERepDocNum] = useState("");
  // Plan de suscripción + pasarela simulada
  const [ePlan, setEPlan] = useState<PlanId | "">("");
  const [eCard, setECard] = useState<DatosTarjeta | null>(null);
  const [planModalVisible, setPlanModalVisible] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<PlanInfo | null>(null);
  const [periodoPlanes, setPeriodoPlanes] = useState<"mensual" | "anual">("mensual");
  // Seguridad
  const [ePass, setEPass] = useState("");
  const [ePass2, setEPass2] = useState("");
  const [eTerms, setETerms] = useState(false);

  // ─────────────────────────────────────────────────────────────
  // Estado UNIVERSIDAD
  // ─────────────────────────────────────────────────────────────
  const [uNombre, setUNombre] = useState("");
  const [uSiglas, setUSiglas] = useState("");
  const [uDominio, setUDominio] = useState("");
  const [uDesc, setUDesc] = useState("");
  const [uDepto, setUDepto] = useState("");
  const [uCiudad, setUCiudad] = useState("");
  const [uDireccion, setUDireccion] = useState("");
  const [uTel, setUTel] = useState("");
  const [uEmail, setUEmail] = useState("");
  const [uWeb, setUWeb] = useState("");
  const [uIg, setUIg] = useState("");
  const [uLogo, setULogo] = useState<string | null>(null);
  // Responsable
  const [uRespNombre, setURespNombre] = useState("");
  const [uRespCargo, setURespCargo] = useState("");
  const [uRespTel, setURespTel] = useState("");
  const [uRespEmail, setURespEmail] = useState("");
  const [uRespDocType, setURespDocType] = useState<DocType>("dui");
  const [uRespDocNum, setURespDocNum] = useState("");
  // Carreras ofertadas (paso 4 universidad)
  const [uCarreras, setUCarreras] = useState<string[]>([]);
  const [isModal1Visible, setIsModal1Visible] = useState(false);
  // Aviso de carreras Zona Roja detectadas al pulsar "Siguiente".
  const [avisosRoja, setAvisosRoja] = useState<AvisoZonaRoja[] | null>(null);
  // Seguridad
  const [uPass, setUPass] = useState("");
  const [uPass2, setUPass2] = useState("");
  const [uTerms, setUTerms] = useState(false);

  // ── Opciones de ciudad derivadas del departamento ──────────────
  const deptoOptions = Object.keys(GEO_DATA);
  const eCiudadOptions = eDepto ? (GEO_DATA[eDepto] ?? []) : [];
  const uCiudadOptions = uDepto ? (GEO_DATA[uDepto] ?? []) : [];

  // ── Verificación de correo único en Firestore (debounce 600ms) ──
  // Solo se dispara cuando el formato es válido; si el correo ya existe
  // pinta el campo en rojo con el mensaje correspondiente.
  useEffect(() => {
    const correo = eEmail.trim().toLowerCase();
    if (!RX_EMAIL.test(correo)) return;
    const t = setTimeout(async () => {
      try {
        if (await emailYaRegistrado(correo))
          setErr("eEmail", "Este correo ya está registrado");
      } catch {
        /* sin conexión: la validación final en el alta cubre el caso */
      }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eEmail]);

  useEffect(() => {
    const correo = uEmail.trim().toLowerCase();
    if (!RX_EMAIL.test(correo)) return;
    const t = setTimeout(async () => {
      try {
        if (await emailYaRegistrado(correo))
          setErr("uEmail", "Este correo ya está registrado");
      } catch {
        /* sin conexión: la validación final en el alta cubre el caso */
      }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uEmail]);

  // ══════════════════════════════════════════════════════════════
  //  Handlers de entrada con bloqueo de caracteres inválidos
  // ══════════════════════════════════════════════════════════════
  // Teléfono El Salvador: solo dígitos, 8 máximo, formato XXXX XXXX
  const makePhoneHandler =
    (setter: (v: string) => void, errKey: string) => (v: string) => {
      const digits = v.replace(/[^\d]/g, "").slice(0, 8);
      setter(digits.length <= 4 ? digits : `${digits.slice(0, 4)} ${digits.slice(4)}`);
      if (digits && digits.length < 8) setErr(errKey, "El número debe tener 8 dígitos");
      else clearErr(errKey);
    };

  // ══════════════════════════════════════════════════════════════
  //  Navegación
  // ══════════════════════════════════════════════════════════════
  const selectRole = (role: Flow) => {
    setFlow(role);
    setErrors({});
    setRegisterError("");
    setStep(1);
    scrollTop();
  };

  const goBack = () => {
    scrollTop();
    setRegisterError("");
    if (step <= 1) {
      setFlow(null);
      setStep(0);
    } else {
      setStep((st) => st - 1);
    }
  };

  const goNext = () => {
    scrollTop();
    setStep((st) => st + 1);
  };

  // ══════════════════════════════════════════════════════════════
  //  Selección de plan + pasarela simulada (solo empresas)
  // ══════════════════════════════════════════════════════════════
  const handleSelectPlan = (info: PlanInfo) => {
    clearErr("ePlan");
    if (!info.requierePago) {
      // Gratuito: se selecciona directo, sin tarjeta.
      setEPlan(info.plan);
      setECard(null);
      return;
    }
    // Mensual / Premium: abre el modal de pago antes de confirmar.
    setPendingPlan(info);
    setPlanModalVisible(true);
  };

  const handleConfirmTarjeta = (datos: DatosTarjeta) => {
    if (!pendingPlan) return;
    setEPlan(pendingPlan.plan);
    setECard(datos);
    setPlanModalVisible(false);
    setPendingPlan(null);
    clearErr("ePlan");
  };

  // ── Empresa paso 4 (plan) ──
  const validateEPlan = () => {
    if (!ePlan) {
      setErr("ePlan", "Selecciona un plan para continuar");
      return false;
    }
    clearErr("ePlan");
    return true;
  };

  // ══════════════════════════════════════════════════════════════
  //  Validaciones por paso
  // ══════════════════════════════════════════════════════════════
  // Acumula un error solo si el validador devuelve mensaje.
  const put = (errs: Record<string, string>, k: string, m: string) => {
    if (m) errs[k] = m;
  };

  // ── Empresa paso 1 ──
  const validateE1 = () => {
    const errs: Record<string, string> = {};
    put(errs, "eNombre", valLetters(2)(eNombre));
    put(errs, "eNit", valNit(eNit));

    if (!eIndustria) errs.eIndustria = "Selecciona una industria o sector";
    else if (eIndustria === "Otro")
      put(errs, "eIndustriaOtro", valIndustriaOtro(eIndustriaOtro));

    put(errs, "eDesc", valDesc(eDesc));

    if (!eDepto) errs.eDepto = "Selecciona un departamento";
    if (!eCiudad) errs.eCiudad = "Selecciona una ciudad";

    put(errs, "eDireccion", valDireccion(eDireccion));
    put(errs, "eTel", valPhone(eTel));
    put(errs, "eEmail", valEmailFmt(eEmail));
    put(errs, "eWeb", valOptional(RX_WEB, "Ingresa una URL válida (ej: https://www.ejemplo.com)")(eWeb));
    put(errs, "eIg", valOptional(RX_IG, "Enlace de Instagram inválido")(eIg));
    put(errs, "eFb", valOptional(RX_FB, "Enlace de Facebook inválido")(eFb));

    // Conserva el aviso de correo ya registrado detectado en tiempo real.
    if (errors.eEmail === "Este correo ya está registrado")
      errs.eEmail = errors.eEmail;

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Empresa paso 2 (logo) ──
  const validateE2 = () => {
    const errs: Record<string, string> = {};
    if (!eLogo) errs.eLogo = "Debes subir el logo de la empresa";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Empresa paso 3 (representante) ──
  const validateE3 = () => {
    const errs: Record<string, string> = {};
    put(errs, "eRepNombre", valLetters(2)(eRepNombre));
    put(errs, "eRepCargo", valLetters(2)(eRepCargo));
    put(errs, "eRepTel", valPhone(eRepTel));
    put(errs, "eRepEmail", valEmailFmt(eRepEmail));
    put(errs, "eRepDocNum", valDoc(eRepDocType, eRepDocNum));
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Universidad paso 1 ──
  const validateU1 = () => {
    const errs: Record<string, string> = {};
    put(errs, "uNombre", valUniNombre(uNombre));
    put(errs, "uSiglas", valSiglas(uSiglas));
    put(errs, "uDominio", valDominio(uDominio));
    put(errs, "uDesc", valDesc(uDesc));

    if (!uDepto) errs.uDepto = "Selecciona un departamento";
    if (!uCiudad) errs.uCiudad = "Selecciona una ciudad";

    put(errs, "uDireccion", valDireccion(uDireccion));
    put(errs, "uTel", valPhone(uTel));
    put(errs, "uEmail", valEmailFmt(uEmail));
    put(errs, "uWeb", valOptional(RX_WEB, "Ingresa una URL válida (ej: https://www.universidad.edu.sv)")(uWeb));
    put(errs, "uIg", valOptional(RX_IG, "Enlace de Instagram inválido")(uIg));

    // Conserva el aviso de correo ya registrado detectado en tiempo real.
    if (errors.uEmail === "Este correo ya está registrado")
      errs.uEmail = errors.uEmail;

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Universidad paso 2 (logo) ──
  const validateU2 = () => {
    const errs: Record<string, string> = {};
    if (!uLogo) errs.uLogo = "Debes subir el logo de la universidad";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Universidad paso 3 (responsable) ──
  const validateU3 = () => {
    const errs: Record<string, string> = {};
    put(errs, "uRespNombre", valLetters(2)(uRespNombre));
    put(errs, "uRespCargo", valLetters(2)(uRespCargo));
    put(errs, "uRespTel", valPhone(uRespTel));
    put(errs, "uRespEmail", valEmailFmt(uRespEmail));
    put(errs, "uRespDocNum", valDoc(uRespDocType, uRespDocNum));
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Universidad paso 4 (carreras ofertadas) ──
  const validateU4 = () => {
    if (uCarreras.length === 0) {
      setErr("uCarreras", "Selecciona al menos una carrera ofertada");
      return false;
    }
    clearErr("uCarreras");
    return true;
  };

  // ── Seguridad (paso 5 empresa / paso 5 universidad, ambos roles) ──
  const validateSecurity = (
    p: string,
    p2: string,
    terms: boolean,
    prefix: "e" | "u",
  ) => {
    const errs: Record<string, string> = {};
    if (!p) errs[`${prefix}Pass`] = "La contraseña es requerida";
    else if (p.length < 8) errs[`${prefix}Pass`] = "Mínimo 8 caracteres";
    else if (getPassScore(p) < 2) errs[`${prefix}Pass`] = "La contraseña es demasiado débil";
    if (p !== p2) errs[`${prefix}Pass2`] = "Las contraseñas no coinciden";
    if (!terms) errs[`${prefix}Terms`] = "Debes aceptar los términos y condiciones";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ══════════════════════════════════════════════════════════════
  //  Avanzar paso (valida antes de continuar)
  // ══════════════════════════════════════════════════════════════
  const handleNext = () => {
    if (flow === "empresa") {
      if (step === 1 && validateE1()) goNext();
      else if (step === 2 && validateE2()) goNext();
      else if (step === 3 && validateE3()) goNext();
      else if (step === 4 && validateEPlan()) goNext();
    } else if (flow === "universidad") {
      if (step === 1 && validateU1()) goNext();
      else if (step === 2 && validateU2()) goNext();
      // Paso 3 = Carreras. Antes de avanzar, examina la selección: si hay
      // carreras Zona Roja (Salud/Educación/Derecho), muestra el/los aviso(s)
      // legal(es) y NO avanza; el usuario acepta y se deseleccionan.
      else if (step === 3) {
        const rojas = carrerasRojasEn(uCarreras);
        if (rojas.length > 0) {
          setAvisosRoja(avisosZonaRoja(uCarreras));
          return;
        }
        if (validateU4()) goNext();
      }
      // Paso 4 = Responsable.
      else if (step === 4 && validateU3()) goNext();
    }
  };

  // El usuario aceptó el aviso legal → se anulan las carreras Zona Roja de la
  // selección y se cierra el modal. NO avanza: decide agregar otra o "Siguiente".
  const aceptarAvisoRoja = () => {
    setUCarreras((prev) => prev.filter((n) => zonaDeCarrera(n) !== "roja"));
    setAvisosRoja(null);
  };

  // ══════════════════════════════════════════════════════════════
  //  Registro final → Firebase Auth + Firestore + Storage
  // ══════════════════════════════════════════════════════════════
  const handleRegister = async () => {
    setRegisterError("");

    const isEmpresa = flow === "empresa";
    const pass = isEmpresa ? ePass : uPass;
    const pass2 = isEmpresa ? ePass2 : uPass2;
    const terms = isEmpresa ? eTerms : uTerms;
    const prefix = isEmpresa ? "e" : "u";

    if (!validateSecurity(pass, pass2, terms, prefix)) return;

    const correo = (isEmpresa ? eEmail : uEmail).trim().toLowerCase();
    const localLogo = isEmpresa ? eLogo : uLogo;

    setSubmitting(true);
    try {
      // 1) Crear autenticación en Firebase
      const cred = await createUserWithEmailAndPassword(auth, correo, pass);
      const uid = cred.user.uid;

      const nombrePrincipal = isEmpresa ? eNombre.trim() : uNombre.trim();
      await updateProfile(cred.user, { displayName: nombrePrincipal }).catch(() => {});

      // 2) Subir logo a Storage (logos_empresas/{uid}/{fileName}) y obtener URL
      let logoUrl = "";
      if (localLogo) {
        try {
          logoUrl = await uploadLogo(uid, localLogo);
        } catch {
          // No bloqueamos el registro si el logo falla; queda vacío y editable luego.
          logoUrl = "";
        }
      }

      // 3) Documento base obligatorio en /usuarios/{uid}
      //    esPrimerIngreso + tourVisto habilitan la guía de onboarding la
      //    primera vez que el usuario entra a su dashboard.
      await setDoc(doc(db, "usuarios", uid), {
        uid,
        nombre_completo: nombrePrincipal,
        correo,
        rol: flow,
        activo: true,
        esPrimerIngreso: true,
        tourVisto: {},
        fecha_registro: serverTimestamp(),
      });

      // 4) Perfil extendido según rol
      if (isEmpresa) {
        // Restricciones de negocio inyectadas según el plan elegido.
        const restric = restriccionesDePlan(ePlan || "gratuito");
        // Últimos 4 dígitos de la tarjeta (solo si hubo pago simulado).
        const tarjeta4 = eCard
          ? eCard.numero.replace(/\D/g, "").slice(-4)
          : "";

        const perfilEmpresa: PerfilEmpresa = {
          uid,
          nombre_empresa: eNombre.trim(),
          nit: eNit.trim(),
          industria: eIndustria === "Otro" ? eIndustriaOtro.trim() : eIndustria,
          descripcion: eDesc.trim(),
          logo_url: logoUrl,
          sitio_web: eWeb.trim(),
          telefono: eTel.trim(),
          direccion: eDireccion.trim(),
          departamento: eDepto,
          ciudad: eCiudad,
          instagram: eIg.trim(),
          facebook: eFb.trim(),
          contacto_nombre: eRepNombre.trim(),
          contacto_cargo: eRepCargo.trim(),
          contacto_telefono: eRepTel.trim(),
          contacto_correo: eRepEmail.trim().toLowerCase(),
          contacto_documento_tipo: eRepDocType,
          contacto_documento_numero: eRepDocNum.trim(),
          // ── Plan, límites e insignia (leídos por el resto de la app) ──
          plan: restric.plan,
          limiteVacantes: restric.limiteVacantes,
          limiteAlianzas: restric.limiteAlianzas,
          verificado: restric.verificado,
          premium: restric.verificado,
          estado_suscripcion: restric.plan === "gratuito" ? "gratuita" : "activa",
          stripe_id: "",
          calificacion_promedio: 0,
          tarjeta_numero: tarjeta4,
          tarjeta_alias: eCard ? eCard.titular.trim() : "",
        };
        await setDoc(doc(db, "perfiles_empresas", uid), {
          ...perfilEmpresa,
          fecha_registro: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, "perfiles_universidades", uid), {
          uid,
          nombre_universidad: uNombre.trim(),
          siglas: uSiglas.trim(),
          dominio_correo: uDominio.trim(),
          descripcion: uDesc.trim(),
          logo_url: logoUrl,
          sitio_web: uWeb.trim(),
          telefono: uTel.trim(),
          direccion: uDireccion.trim(),
          departamento: uDepto,
          ciudad: uCiudad,
          instagram: uIg.trim(),
          contacto_nombre: uRespNombre.trim(),
          contacto_cargo: uRespCargo.trim(),
          contacto_telefono: uRespTel.trim(),
          contacto_correo: uRespEmail.trim().toLowerCase(),
          contacto_documento_tipo: uRespDocType,
          contacto_documento_numero: uRespDocNum.trim(),
          // Guardamos objetos con modalidad/duración/tipo/zona (no solo el nombre)
          // para que el perfil y los grupos tengan el detalle completo. Los
          // lectores del proyecto ya soportan tanto string como objeto.
          carreras_ofertadas: uCarreras.map((nombre) => {
            const c = CARRERAS_EL_SALVADOR.find((x) => x.nombre === nombre);
            return {
              nombre,
              modalidad: c?.modalidad ?? "",
              duracion: c?.duracion ?? "",
              tipo: c?.tipo ?? "",
              zona: c?.zona ?? "verde",
            };
          }),
          fecha_registro: serverTimestamp(),
        });
      }

      scrollTop();
      setStep(99);
    } catch (err: any) {
      setRegisterError(mapFirebaseError(err?.code ?? ""));
    } finally {
      setSubmitting(false);
    }
  };

  const goToDashboard = () => {
    const ruta =
      flow === "empresa" ? "/dashboard-empresa" : "/dashboard-universidad";
    try {
      router.replace(ruta as any);
    } catch {
      /* fallback abajo */
    }
    // Fallback de navegación de seguridad (web/edge).
    setTimeout(() => {
      try {
        router.replace(ruta as any);
      } catch {
        /* no-op */
      }
    }, 400);
  };

  // ── Auto-redirección al dashboard 3s después del registro exitoso ──
  useEffect(() => {
    if (step !== 99) return;
    const t = setTimeout(goToDashboard, 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ══════════════════════════════════════════════════════════════
  //  Render del contenido por paso
  // ══════════════════════════════════════════════════════════════
  const renderEmpresaStep = () => {
    switch (step) {
      case 1:
        return (
          <View>
            <Text style={s.stepTitle}>Datos de la empresa</Text>
            <Text style={s.stepSubtitle}>Cuéntanos sobre tu organización.</Text>

            <FloatInput
              label="Nombre comercial"
              value={eNombre}
              onChangeText={live("eNombre", setENombre, filterLetters, valLetters(2))}
              autoCapitalize="words"
              error={errors.eNombre}
            />
            <FloatInput
              label="NIT"
              value={eNit}
              onChangeText={live("eNit", setENit, maskNit, valNit)}
              keyboardType="number-pad"
              maxLength={17}
              error={errors.eNit}
            />
            <SelectInput
              label="Industria / sector"
              value={eIndustria}
              options={INDUSTRIAS}
              onChange={(v) => {
                setEIndustria(v);
                clearErr("eIndustria");
                if (v !== "Otro") {
                  setEIndustriaOtro("");
                  clearErr("eIndustriaOtro");
                }
              }}
              error={errors.eIndustria}
            />
            {eIndustria === "Otro" && (
              <FloatInput
                label="Especifica la industria"
                value={eIndustriaOtro}
                onChangeText={live(
                  "eIndustriaOtro",
                  setEIndustriaOtro,
                  filterIndustriaOtro,
                  valIndustriaOtro,
                )}
                autoCapitalize="sentences"
                error={errors.eIndustriaOtro}
              />
            )}
            <FloatInput
              label="Descripción"
              value={eDesc}
              onChangeText={live("eDesc", setEDesc, undefined, valDesc)}
              multiline
              maxLength={300}
              autoCapitalize="sentences"
              error={errors.eDesc}
            />

            <SectionLabel>Ubicación</SectionLabel>
            <SelectInput
              label="Departamento (sede)"
              value={eDepto}
              options={deptoOptions}
              onChange={(v) => {
                setEDepto(v);
                setECiudad("");
                clearErr("eDepto");
              }}
              error={errors.eDepto}
            />
            <SelectInput
              label="Ciudad (sede)"
              value={eCiudad}
              options={eCiudadOptions}
              onChange={(v) => {
                setECiudad(v);
                clearErr("eCiudad");
              }}
              error={errors.eCiudad}
            />
            <FloatInput
              label="Dirección (opcional)"
              value={eDireccion}
              onChangeText={live("eDireccion", setEDireccion, filterDireccion, valDireccion)}
              autoCapitalize="sentences"
              error={errors.eDireccion}
            />

            <SectionLabel>Contacto</SectionLabel>
            <FloatInput
              label="Teléfono (+503)"
              value={eTel}
              onChangeText={makePhoneHandler(setETel, "eTel")}
              keyboardType="phone-pad"
              error={errors.eTel}
            />
            <FloatInput
              label="Correo de la cuenta"
              value={eEmail}
              onChangeText={live("eEmail", setEEmail, (v) => v.replace(/\s/g, ""), valEmailFmt)}
              keyboardType="email-address"
              error={errors.eEmail}
            />
            <FloatInput
              label="Sitio web (opcional)"
              value={eWeb}
              onChangeText={live(
                "eWeb",
                setEWeb,
                undefined,
                valOptional(RX_WEB, "Ingresa una URL válida (ej: https://www.ejemplo.com)"),
              )}
              keyboardType="url"
              error={errors.eWeb}
            />
            <FloatInput
              label="Instagram (opcional)"
              value={eIg}
              onChangeText={live(
                "eIg",
                setEIg,
                undefined,
                valOptional(RX_IG, "Enlace de Instagram inválido (ej: instagram.com/gradly)"),
              )}
              keyboardType="url"
              error={errors.eIg}
            />
            <FloatInput
              label="Facebook (opcional)"
              value={eFb}
              onChangeText={live(
                "eFb",
                setEFb,
                undefined,
                valOptional(RX_FB, "Enlace de Facebook inválido (ej: facebook.com/gradly)"),
              )}
              keyboardType="url"
              error={errors.eFb}
            />
          </View>
        );
      case 2:
        return (
          <View>
            <Text style={s.stepTitle}>Logo de la empresa</Text>
            <Text style={s.stepSubtitle}>
              Sube el logotipo oficial. Se mostrará en tus vacantes y perfil.
            </Text>
            <UploadZone
              label="Subir logo de la empresa"
              imageUri={eLogo}
              onPress={() => {
                pickImage((uri) => {
                  setELogo(uri);
                  clearErr("eLogo");
                });
              }}
              error={errors.eLogo}
            />
            <InfoNote>💡 Formato cuadrado recomendado (PNG con fondo transparente).</InfoNote>
          </View>
        );
      case 3:
        return (
          <View>
            <Text style={s.stepTitle}>Representante</Text>
            <Text style={s.stepSubtitle}>Persona de contacto de la empresa.</Text>
            <FloatInput
              label="Nombre completo"
              value={eRepNombre}
              onChangeText={live("eRepNombre", setERepNombre, filterLetters, valLetters(2))}
              autoCapitalize="words"
              error={errors.eRepNombre}
            />
            <FloatInput
              label="Cargo"
              value={eRepCargo}
              onChangeText={live("eRepCargo", setERepCargo, filterLetters, valLetters(2))}
              autoCapitalize="words"
              error={errors.eRepCargo}
            />
            <FloatInput
              label="Teléfono (+503)"
              value={eRepTel}
              onChangeText={makePhoneHandler(setERepTel, "eRepTel")}
              keyboardType="phone-pad"
              error={errors.eRepTel}
            />
            <FloatInput
              label="Correo del representante"
              value={eRepEmail}
              onChangeText={live("eRepEmail", setERepEmail, (v) => v.replace(/\s/g, ""), valEmailFmt)}
              keyboardType="email-address"
              error={errors.eRepEmail}
            />

            <SectionLabel>Documento de identidad</SectionLabel>
            <DocTypeSelector
              value={eRepDocType}
              onChange={(t) => {
                setERepDocType(t);
                setERepDocNum("");
                clearErr("eRepDocNum");
              }}
            />
            <FloatInput
              label="Número de documento (sin guiones)"
              value={eRepDocNum}
              onChangeText={(v) => {
                const c = cleanDoc(v, eRepDocType);
                setERepDocNum(c);
                const m = valDoc(eRepDocType, c);
                if (m) setErr("eRepDocNum", m);
                else clearErr("eRepDocNum");
              }}
              keyboardType={eRepDocType === "pasaporte" ? "default" : "number-pad"}
              autoCapitalize="characters"
              maxLength={DOC_RULES[eRepDocType].maxLen}
              error={errors.eRepDocNum}
            />
          </View>
        );
      case 4:
        return (
          <View>
            <Text style={s.stepTitle}>Elige tu plan</Text>
            <Text style={s.stepSubtitle}>
              Selecciona el plan que mejor se adapte a tu empresa. Podrás
              cambiarlo más adelante.
            </Text>

            {/* Selector de período Mensual / Anual */}
            <View style={s.periodoSwitch}>
              <TouchableOpacity
                style={[
                  s.periodoTab,
                  periodoPlanes === "mensual" && s.periodoTabActive,
                ]}
                onPress={() => setPeriodoPlanes("mensual")}
              >
                <Text
                  style={[
                    s.periodoTabText,
                    periodoPlanes === "mensual" && s.periodoTabTextActive,
                  ]}
                >
                  Mensual
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  s.periodoTab,
                  periodoPlanes === "anual" && s.periodoTabActive,
                ]}
                onPress={() => setPeriodoPlanes("anual")}
              >
                <Text
                  style={[
                    s.periodoTabText,
                    periodoPlanes === "anual" && s.periodoTabTextActive,
                  ]}
                >
                  Anual
                </Text>
              </TouchableOpacity>
            </View>

            {PLANES.map((p) => {
              const pv = precioVisible(p, periodoPlanes);
              return (
                <PlanCard
                  key={p.plan}
                  info={p}
                  precio={pv.precio}
                  periodo={pv.periodo}
                  selected={ePlan === p.plan}
                  onPress={() => handleSelectPlan(p)}
                />
              );
            })}
            {!!errors.ePlan && <Text style={s.errText}>{errors.ePlan}</Text>}
            {ePlan && eCard && (
              <View style={s.cardConfirmedRow}>
                <Ionicons name="card-outline" size={16} color={C.green} />
                <Text style={s.cardConfirmedText}>
                  Tarjeta terminada en •••• {eCard.numero.replace(/\D/g, "").slice(-4)}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    const info = PLANES.find((x) => x.plan === ePlan) ?? null;
                    setPendingPlan(info);
                    setPlanModalVisible(true);
                  }}
                >
                  <Text style={s.cardConfirmedChange}>Cambiar</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      case 5:
        return (
          <View>
            <Text style={s.stepTitle}>Seguridad</Text>
            <Text style={s.stepSubtitle}>Define la contraseña de tu cuenta.</Text>
            <PasswordField
              label="Contraseña"
              value={ePass}
              onChange={(v) => {
                setEPass(v);
                clearErr("ePass");
              }}
              error={errors.ePass}
            />
            <PasswordField
              label="Confirmar contraseña"
              value={ePass2}
              onChange={(v) => {
                setEPass2(v);
                clearErr("ePass2");
              }}
              error={errors.ePass2}
            />
            <TermsRow
              checked={eTerms}
              onToggle={() => {
                setETerms((v) => !v);
                clearErr("eTerms");
              }}
              error={errors.eTerms}
            />
          </View>
        );
      default:
        return null;
    }
  };

  const renderUniversidadStep = () => {
    switch (step) {
      case 1:
        return (
          <View>
            <Text style={s.stepTitle}>Datos de la institución</Text>
            <Text style={s.stepSubtitle}>Información general de la universidad.</Text>

            <FloatInput
              label="Nombre de la universidad"
              value={uNombre}
              onChangeText={live("uNombre", setUNombre, filterUniNombre, valUniNombre)}
              autoCapitalize="words"
              error={errors.uNombre}
            />
            <FloatInput
              label="Siglas (máx. 10)"
              value={uSiglas}
              onChangeText={live("uSiglas", setUSiglas, filterSiglas, valSiglas)}
              autoCapitalize="characters"
              maxLength={10}
              error={errors.uSiglas}
            />
            <FloatInput
              label="Dominio de correo institucional"
              value={uDominio}
              onChangeText={live("uDominio", setUDominio, (v) => v.toLowerCase().replace(/\s/g, ""), valDominio)}
              keyboardType="email-address"
              error={errors.uDominio}
            />
            <FloatInput
              label="Descripción"
              value={uDesc}
              onChangeText={live("uDesc", setUDesc, undefined, valDesc)}
              multiline
              maxLength={300}
              autoCapitalize="sentences"
              error={errors.uDesc}
            />

            <SectionLabel>Ubicación</SectionLabel>
            <SelectInput
              label="Departamento (sede)"
              value={uDepto}
              options={deptoOptions}
              onChange={(v) => {
                setUDepto(v);
                setUCiudad("");
                clearErr("uDepto");
              }}
              error={errors.uDepto}
            />
            <SelectInput
              label="Ciudad (sede)"
              value={uCiudad}
              options={uCiudadOptions}
              onChange={(v) => {
                setUCiudad(v);
                clearErr("uCiudad");
              }}
              error={errors.uCiudad}
            />
            <FloatInput
              label="Dirección (opcional)"
              value={uDireccion}
              onChangeText={live("uDireccion", setUDireccion, filterDireccion, valDireccion)}
              autoCapitalize="sentences"
              error={errors.uDireccion}
            />

            <SectionLabel>Contacto</SectionLabel>
            <FloatInput
              label="Teléfono (+503)"
              value={uTel}
              onChangeText={makePhoneHandler(setUTel, "uTel")}
              keyboardType="phone-pad"
              error={errors.uTel}
            />
            <FloatInput
              label="Correo de la cuenta"
              value={uEmail}
              onChangeText={live("uEmail", setUEmail, (v) => v.replace(/\s/g, ""), valEmailFmt)}
              keyboardType="email-address"
              error={errors.uEmail}
            />
            <FloatInput
              label="Sitio web (opcional)"
              value={uWeb}
              onChangeText={live(
                "uWeb",
                setUWeb,
                undefined,
                valOptional(RX_WEB, "Ingresa una URL válida (ej: https://www.universidad.edu.sv)"),
              )}
              keyboardType="url"
              error={errors.uWeb}
            />
            <FloatInput
              label="Instagram (opcional)"
              value={uIg}
              onChangeText={live(
                "uIg",
                setUIg,
                undefined,
                valOptional(RX_IG, "Enlace de Instagram inválido (ej: instagram.com/gradly)"),
              )}
              keyboardType="url"
              error={errors.uIg}
            />
          </View>
        );
      case 2:
        return (
          <View>
            <Text style={s.stepTitle}>Logo de la universidad</Text>
            <Text style={s.stepSubtitle}>
              Sube el escudo o logotipo oficial de la institución.
            </Text>
            <UploadZone
              label="Subir logo de la universidad"
              imageUri={uLogo}
              onPress={() => {
                pickImage((uri) => {
                  setULogo(uri);
                  clearErr("uLogo");
                });
              }}
              error={errors.uLogo}
            />
            <InfoNote>💡 Formato cuadrado recomendado (PNG con fondo transparente).</InfoNote>
          </View>
        );
      case 4:
        return (
          <View>
            <Text style={s.stepTitle}>Responsable</Text>
            <Text style={s.stepSubtitle}>
              Persona encargada de gestionar la cuenta institucional.
            </Text>
            <FloatInput
              label="Nombre completo"
              value={uRespNombre}
              onChangeText={live("uRespNombre", setURespNombre, filterLetters, valLetters(2))}
              autoCapitalize="words"
              error={errors.uRespNombre}
            />
            <FloatInput
              label="Cargo"
              value={uRespCargo}
              onChangeText={live("uRespCargo", setURespCargo, filterLetters, valLetters(2))}
              autoCapitalize="words"
              error={errors.uRespCargo}
            />
            <FloatInput
              label="Teléfono (+503)"
              value={uRespTel}
              onChangeText={makePhoneHandler(setURespTel, "uRespTel")}
              keyboardType="phone-pad"
              error={errors.uRespTel}
            />
            <FloatInput
              label="Correo del responsable"
              value={uRespEmail}
              onChangeText={live("uRespEmail", setURespEmail, (v) => v.replace(/\s/g, ""), valEmailFmt)}
              keyboardType="email-address"
              error={errors.uRespEmail}
            />

            <SectionLabel>Documento de identidad</SectionLabel>
            <DocTypeSelector
              value={uRespDocType}
              onChange={(t) => {
                setURespDocType(t);
                setURespDocNum("");
                clearErr("uRespDocNum");
              }}
            />
            <FloatInput
              label="Número de documento (sin guiones)"
              value={uRespDocNum}
              onChangeText={(v) => {
                const c = cleanDoc(v, uRespDocType);
                setURespDocNum(c);
                const m = valDoc(uRespDocType, c);
                if (m) setErr("uRespDocNum", m);
                else clearErr("uRespDocNum");
              }}
              keyboardType={uRespDocType === "pasaporte" ? "default" : "number-pad"}
              autoCapitalize="characters"
              maxLength={DOC_RULES[uRespDocType].maxLen}
              error={errors.uRespDocNum}
            />
          </View>
        );
      case 3:
        return (
          <View>
            <Text style={s.stepTitle}>Carreras universitarias</Text>
            <Text style={s.stepSubtitle}>
              Selecciona las carreras que oferta tu institución (máx.{" "}
              {MAX_CARRERAS}).
            </Text>

            <TouchableOpacity
              style={[
                s.carrerasTriggerBtn,
                uCarreras.length > 0 && s.carrerasTriggerBtnFilled,
              ]}
              onPress={() => setIsModal1Visible(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="school-outline" size={20} color={C.accent70} />
              <Text style={s.carrerasTriggerText}>
                Seleccionar Carreras Universitarias
              </Text>
              <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
            </TouchableOpacity>

            {uCarreras.length > 0 && (
              <View style={s.carrerasSummary}>
                <View style={s.carrerasSummaryHeader}>
                  <Ionicons name="checkmark-circle" size={18} color={C.green} />
                  <Text style={s.carrerasSummaryCount}>
                    {uCarreras.length}{" "}
                    {uCarreras.length === 1
                      ? "carrera seleccionada"
                      : "carreras seleccionadas"}
                  </Text>
                </View>
                <View style={s.carrerasChips}>
                  {uCarreras.slice(0, 6).map((nombre) => (
                    <View key={nombre} style={s.carreraChip}>
                      <Text style={s.carreraChipText} numberOfLines={1}>
                        {nombre}
                      </Text>
                      <TouchableOpacity
                        onPress={() => {
                          setUCarreras((prev) =>
                            prev.filter((x) => x !== nombre),
                          );
                        }}
                      >
                        <Ionicons name="close" size={14} color={C.textMuted} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {uCarreras.length > 6 && (
                    <View style={s.carreraChip}>
                      <Text style={s.carreraChipText}>
                        +{uCarreras.length - 6} más
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {!!errors.uCarreras && (
              <Text style={s.errText}>{errors.uCarreras}</Text>
            )}

            <InfoNote>
              💡 Puedes seleccionar varias carreras y revisarlas antes de
              continuar. Estas se mostrarán en el perfil público de tu
              universidad.
            </InfoNote>
          </View>
        );
      case 5:
        return (
          <View>
            <Text style={s.stepTitle}>Seguridad</Text>
            <Text style={s.stepSubtitle}>Define la contraseña de tu cuenta.</Text>
            <PasswordField
              label="Contraseña"
              value={uPass}
              onChange={(v) => {
                setUPass(v);
                clearErr("uPass");
              }}
              error={errors.uPass}
            />
            <PasswordField
              label="Confirmar contraseña"
              value={uPass2}
              onChange={(v) => {
                setUPass2(v);
                clearErr("uPass2");
              }}
              error={errors.uPass2}
            />
            <TermsRow
              checked={uTerms}
              onToggle={() => {
                setUTerms((v) => !v);
                clearErr("uTerms");
              }}
              error={errors.uTerms}
            />
          </View>
        );
      default:
        return null;
    }
  };

  // Empresa: Plan + Seguridad → 5 pasos. Universidad: Carreras + Seguridad → 5 pasos.
  const maxStep = flow === "universidad" ? 5 : 5;
  const isLastStep = step === maxStep;

  // ══════════════════════════════════════════════════════════════
  //  Render principal
  // ══════════════════════════════════════════════════════════════
  return (
    <View style={s.root}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <AppHeader />

      <KeyboardAvoidingView
        style={s.flex1}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={Platform.OS === "web"}
          keyboardShouldPersistTaps="handled"
        >
          {/* Contenedor responsive: centra y limita el ancho en web/tablet. */}
          <View style={{ maxWidth: 640, alignSelf: "center", width: "100%" }}>
          {/* Encabezado */}
          <View style={s.header}>
            <TouchableOpacity
              style={s.backBtn}
              onPress={() => (step === 0 ? router.back() : goBack())}
            >
              <Ionicons name="arrow-back" size={20} color={C.accent70} />
            </TouchableOpacity>
            <Text style={s.headerTitle}>Crear cuenta</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Stepper (oculto en selector y éxito) */}
          {flow && step >= 1 && step <= maxStep && (
            <Stepper flow={flow} step={step} />
          )}

          {/* ═════ PASO 0 — Selector de rol ═════ */}
          {step === 0 && (
            <View style={s.card}>
              <Text style={s.stepTitle}>¿Cómo quieres usar Gradly?</Text>
              <Text style={s.stepSubtitle}>Selecciona el tipo de cuenta.</Text>

              <View style={s.roleCards}>
                <TouchableOpacity
                  style={s.roleCard}
                  onPress={() => selectRole("empresa")}
                  activeOpacity={0.85}
                >
                  <Ionicons name="business-outline" size={36} color={C.accent70} />
                  <Text style={s.roleTitle}>Empresa</Text>
                  <Text style={s.roleDesc}>
                    Publica vacantes y contrata talento universitario verificado.
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={s.roleCard}
                  onPress={() => selectRole("universidad")}
                  activeOpacity={0.85}
                >
                  <Ionicons name="school-outline" size={36} color={C.accent70} />
                  <Text style={s.roleTitle}>Universidad</Text>
                  <Text style={s.roleDesc}>
                    Gestiona y valida el progreso de horas de práctica de tus estudiantes.
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={s.loginRow}>
                <Text style={s.loginText}>¿Ya tienes cuenta? </Text>
                <TouchableOpacity onPress={() => router.replace("/auth/iniciosesion" as any)}>
                  <Text style={s.loginLink}>Inicia sesión aquí</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ═════ PASOS DEL FLUJO ═════ */}
          {flow && step >= 1 && step <= maxStep && (
            <View style={s.card}>
              {flow === "empresa" ? renderEmpresaStep() : renderUniversidadStep()}

              {!!registerError && (
                <View style={s.registerErrorBox}>
                  <Text style={s.registerErrorText}>{registerError}</Text>
                </View>
              )}

              <StepNav
                onBack={goBack}
                onNext={isLastStep ? handleRegister : handleNext}
                nextLabel={isLastStep ? "Crear cuenta" : "Siguiente →"}
                loading={submitting}
              />
            </View>
          )}

          {/* Modal de pago (pasarela simulada) */}
          <TarjetaModal
            visible={planModalVisible}
            plan={pendingPlan}
            periodoSel={periodoPlanes}
            onClose={() => {
              setPlanModalVisible(false);
              setPendingPlan(null);
            }}
            onConfirm={handleConfirmTarjeta}
          />

          {/* Modal de selección de carreras (solo universidad) */}
          <CarrerasModal
            visible={isModal1Visible}
            selected={uCarreras}
            setSelected={setUCarreras}
            onClose={() => setIsModal1Visible(false)}
            onConfirm={() => {
              // Solo cierra el selector; el avance (y la validación Zona Roja)
              // ocurre al pulsar "Siguiente".
              setIsModal1Visible(false);
              clearErr("uCarreras");
            }}
          />

          {/* Aviso legal de carreras Zona Roja detectadas al continuar */}
          <Modal
            visible={!!avisosRoja}
            transparent
            animationType="fade"
            onRequestClose={() => setAvisosRoja(null)}
          >
            <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 20 }}>
              <View style={[s.confirmCard, { maxHeight: "85%" }]}>
                <View style={s.confirmIconWrap}>
                  <Ionicons name="shield-checkmark-outline" size={34} color={C.accent70} />
                </View>
                <ScrollView style={{ width: "100%" }}>
                  {(avisosRoja ?? []).map((a, i) => (
                    <View key={a.motivo} style={{ marginBottom: i < (avisosRoja?.length ?? 0) - 1 ? 18 : 0 }}>
                      <Text style={s.confirmTitle}>{a.titulo}</Text>
                      <Text style={s.confirmDesc}>{a.cuerpo}</Text>
                      <Text style={[s.confirmDesc, { fontWeight: "700", marginTop: 6 }]}>
                        Se quitará(n): {a.carreras.join(", ")}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
                <View style={s.confirmActions}>
                  <TouchableOpacity style={s.btnPrimary} onPress={aceptarAvisoRoja}>
                    <Text style={s.btnPrimaryText}>Entendido</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* ═════ PASO 99 — Éxito ═════ */}
          {step === 99 && (
            <View style={s.card}>
              <View style={s.successScreen}>
                <View style={s.successIconWrap}>
                  <Ionicons name="checkmark" size={40} color={C.green} />
                </View>
                <Text style={s.successTitle}>¡Cuenta creada!</Text>
                <Text style={s.successDesc}>
                  Tu cuenta de {flow === "empresa" ? "empresa" : "universidad"} fue
                  registrada correctamente. Te llevaremos a tu panel en unos
                  segundos…
                </Text>
                <View style={s.redirectRow}>
                  <ActivityIndicator color={C.accent70} />
                  <Text style={s.redirectText}>Redirigiendo a tu panel…</Text>
                </View>
              </View>
            </View>
          )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Fila de términos y condiciones ─────────────────────────────────
function TermsRow({
  checked,
  onToggle,
  error,
}: {
  checked: boolean;
  onToggle: () => void;
  error?: string;
}) {
  const { s } = useRegistroTheme();
  return (
    <View>
      <TouchableOpacity style={s.termsRow} onPress={onToggle} activeOpacity={0.7}>
        <View style={[s.checkbox, checked && s.checkboxChecked]}>
          {checked && <Text style={s.checkmark}>✓</Text>}
        </View>
        <Text style={s.termsText}>
          Acepto los términos y condiciones y la política de privacidad de Gradly.
        </Text>
      </TouchableOpacity>
      {!!error && <Text style={s.errText}>{error}</Text>}
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════
//  Estilos
// ══════════════════════════════════════════════════════════════════
const makeStyles = (C: Tokens) =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingTop: 10 },
  flex1: { flex: 1 },
  scrollContent: { flexGrow: 1, backgroundColor: C.bg, paddingBottom: 60 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.accent20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 20, fontWeight: "800", color: C.text, letterSpacing: 0.5 },

  // Stepper
  stepperWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
  },
  stepperItem: { alignItems: "center", flexShrink: 1 },
  stepperCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: C.inputBorder,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.inputBg,
  },
  stepperCircleText: { fontSize: 15, fontWeight: "700", color: C.textMuted },
  stepperDone: { backgroundColor: C.accent, borderColor: C.accent },
  stepperActive: { backgroundColor: C.accent20, borderColor: C.accent },
  stepperConnector: {
    flex: 1,
    height: 2,
    backgroundColor: C.border,
    marginHorizontal: 4,
  },

  // Card
  card: {
    marginHorizontal: 10,
    backgroundColor: C.surface,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: C.border,
  },

  // Step header
  stepTitle: { fontSize: 22, fontWeight: "700", color: C.text, marginBottom: 6 },
  stepSubtitle: { fontSize: 14, color: C.textSub, marginBottom: 24 },

  // Selector de período Mensual / Anual
  periodoSwitch: {
    flexDirection: "row",
    backgroundColor: C.inputBg,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  periodoTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "transparent",
  },
  periodoTabActive: { backgroundColor: C.accent },
  // Texto legible en ambos modos sobre pestaña inactiva; blanco cuando activa.
  periodoTabText: { color: C.text, fontWeight: "600", fontSize: 14 },
  periodoTabTextActive: { color: "#fff" },

  // Role cards
  roleCards: { flexDirection: "column", gap: 14, marginTop: 12 },
  roleCard: {
    backgroundColor: C.surface,
    borderRadius: 18,
    padding: 24,
    borderWidth: 2,
    borderColor: C.border,
    gap: 8,
  },
  roleTitle: { fontSize: 16, fontWeight: "700", color: C.text, marginTop: 8 },
  roleDesc: { fontSize: 13, color: C.textSub, lineHeight: 20 },

  // Floating input
  floatWrap: { marginBottom: 20 },
  floatLabel: {
    fontSize: 11,
    color: C.accent70,
    marginBottom: 5,
    fontWeight: "500",
  },
  floatLabelActive: { color: C.accent70 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.inputBg,
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 10,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  inputFocused: { borderColor: C.accent },
  inputErr: { borderColor: C.red },
  inputSuccess: { borderColor: C.green },
  textInput: { flex: 1, color: C.text, fontSize: 14, paddingVertical: 14 },

  // Select
  selectRow: { paddingVertical: 16, justifyContent: "space-between" },
  selectVal: { color: C.text, fontSize: 14, flex: 1 },
  selectPlaceholder: { color: C.textMuted, fontSize: 14, flex: 1 },
  selectArrow: { color: C.textMuted, fontSize: 12, marginLeft: 8 },
  dropdown: {
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.inputBorder,
    marginTop: 4,
    zIndex: 100,
    overflow: "hidden",
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  dropdownItemActive: { backgroundColor: C.accent20 },
  dropdownText: { color: C.textSub, fontSize: 14 },

  // Field error
  errText: { color: C.red, fontSize: 12, marginTop: 4 },

  // Document-type selector
  docTypeRow: { flexDirection: "row", gap: 10, marginBottom: 6 },
  docTypeBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.inputBorder,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.inputBg,
  },
  docTypeBtnActive: { borderColor: C.accent, backgroundColor: C.accent20 },
  docTypeBtnText: { color: C.textSub, fontSize: 13, fontWeight: "600" },

  // Section label
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: C.accent70,
    textTransform: "uppercase",
    letterSpacing: 2,
    marginTop: 12,
    marginBottom: 14,
  },

  // Info note
  infoNote: {
    backgroundColor: C.accent20,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    marginVertical: 14,
  },
  infoNoteText: { color: C.textSub, fontSize: 13, lineHeight: 20 },

  // Upload zone
  uploadZone: {
    width: "100%",
    borderWidth: 2,
    borderColor: C.accent40,
    borderStyle: "dashed",
    borderRadius: 14,
    paddingVertical: 28,
    paddingHorizontal: 16,
    alignItems: "center",
    backgroundColor: C.inputBg,
    marginBottom: 12,
    gap: 6,
  },
  uploadLabel: {
    color: C.textSub,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  uploadHint: { color: C.textMuted, fontSize: 12, textAlign: "center" },
  uploadZoneFilled: {
    borderStyle: "solid",
    borderColor: "rgba(34,197,94,0.50)",
    backgroundColor: "rgba(34,197,94,0.04)",
    paddingVertical: 10,
  },
  uploadZoneErr: { borderColor: C.red },
  uploadPreview: { width: "100%", height: 160, borderRadius: 8, marginBottom: 8 },
  uploadChangeText: { color: C.textMuted, fontSize: 12, textAlign: "center" },

  // Password strength
  strengthWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    marginBottom: 10,
  },
  strengthBars: { flexDirection: "row", gap: 4, flex: 1 },
  strengthBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
  },
  strengthLabel: { fontSize: 12, fontWeight: "700", minWidth: 72, textAlign: "right" },

  // Step navigation
  stepNav: {
    flexDirection: "row",
    gap: 10,
    marginTop: 28,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  btnOutline: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.accent40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.inputBg,
  },
  btnOutlineText: { color: C.text, fontSize: 14, fontWeight: "600" },
  btnPrimary: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: { color: "#fff", fontSize: 14, fontWeight: "600" },

  // Terms
  termsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginTop: 18,
    marginBottom: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: C.accent40,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    backgroundColor: C.inputBg,
  },
  checkboxChecked: { backgroundColor: C.accent, borderColor: C.accent },
  checkmark: { color: "#fff", fontSize: 11, fontWeight: "700" },
  termsText: { flex: 1, color: C.textSub, fontSize: 13, lineHeight: 20 },

  // Login link
  loginRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
  },
  loginText: { fontSize: 13, color: C.textMuted },
  loginLink: { fontSize: 13, color: C.accent70, fontWeight: "600" },

  // Register error
  registerErrorBox: {
    backgroundColor: C.redBg,
    borderWidth: 1,
    borderColor: C.redBorder,
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
  },
  registerErrorText: { fontSize: 13, color: C.textSub, lineHeight: 18 },

  // Success screen
  successScreen: { alignItems: "center", paddingVertical: 24 },
  successIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: C.greenBg,
    borderWidth: 2,
    borderColor: "rgba(34,197,94,0.55)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: C.text,
    textAlign: "center",
    marginBottom: 10,
  },
  successDesc: { fontSize: 15, color: C.textSub, textAlign: "center", lineHeight: 23 },
  redirectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 28,
  },
  redirectText: { color: C.accent70, fontSize: 14, fontWeight: "600" },

  // Planes de suscripción
  planCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 14,
  },
  planCardFeatured: { borderColor: C.accent40 },
  planCardSelected: {
    borderColor: C.accent,
    backgroundColor: C.accent20,
  },
  planRibbon: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: C.accent,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  planRibbonText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  planHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  planName: { color: C.text, fontSize: 17, fontWeight: "700" },
  planRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: C.accent40,
    alignItems: "center",
    justifyContent: "center",
  },
  planRadioOn: { backgroundColor: C.accent, borderColor: C.accent },
  planPriceRow: { flexDirection: "row", alignItems: "flex-end", marginTop: 8 },
  planPrice: { color: C.accent70, fontSize: 26, fontWeight: "800" },
  planPeriod: { color: C.textSub, fontSize: 13, marginLeft: 4, marginBottom: 4 },
  planDesc: { color: C.textSub, fontSize: 13, marginTop: 4, marginBottom: 12 },
  planFeatures: { gap: 8 },
  planFeatureRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  planFeatureText: { color: C.textSub, fontSize: 13, flex: 1 },

  // Tarjeta confirmada (resumen bajo los planes)
  cardConfirmedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "rgba(34,197,94,0.08)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.30)",
  },
  cardConfirmedText: { flex: 1, color: C.textSub, fontSize: 13 },
  cardConfirmedChange: { color: C.accent70, fontSize: 13, fontWeight: "700" },

  // Modal de pago (glassmorphism)
  modalOverlay: {
    flex: 1,
    // Scrim del modal: oscuro en ambos modos por convención.
    backgroundColor: "rgba(7,5,15,0.80)",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  modalCard: {
    backgroundColor: C.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: C.inputBorder,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  modalTitle: { color: C.text, fontSize: 20, fontWeight: "800" },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.inputBg,
    alignItems: "center",
    justifyContent: "center",
  },
  modalPlanRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: C.accent20,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 16,
  },
  modalPlanName: { color: C.text, fontSize: 15, fontWeight: "700" },
  modalPlanPrice: { color: C.accent70, fontSize: 16, fontWeight: "800" },
  cardRow: { flexDirection: "row", gap: 12 },
  modalNote: {
    backgroundColor: C.inputBg,
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
  },
  modalNoteText: {
    color: C.textMuted,
    fontSize: 12,
    textAlign: "center",
  },

  // ── Paso 4 universidad — disparador y resumen de carreras ──
  carrerasTriggerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.inputBg,
    borderWidth: 1.5,
    borderColor: C.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 16,
  },
  carrerasTriggerBtnFilled: { borderColor: C.accent },
  carrerasTriggerText: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    fontWeight: "600",
  },
  carrerasSummary: {
    backgroundColor: C.accent20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    marginBottom: 14,
  },
  carrerasSummaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  carrerasSummaryCount: { color: C.text, fontSize: 14, fontWeight: "700" },
  carrerasChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  carreraChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "100%",
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  carreraChipText: {
    color: C.textSub,
    fontSize: 12,
    fontWeight: "500",
    flexShrink: 1,
  },

  // ── Modal de carreras ──
  carrerasModalCard: { maxHeight: "88%", overflow: "hidden" },
  verSeleccionadasBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "flex-start",
    backgroundColor: C.accent20,
    borderWidth: 1,
    borderColor: C.accent40,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  verSeleccionadasText: { color: C.accent70, fontSize: 13, fontWeight: "700" },
  carrerasSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.inputBg,
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    minHeight: 48,
    marginBottom: 10,
  },
  carrerasSearchInput: { flex: 1, color: C.text, fontSize: 14, paddingVertical: 10 },
  carrerasLimitNote: {
    color: C.red,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
  },
  carrerasList: { marginBottom: 14 },
  carrerasEmpty: {
    color: C.textMuted,
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 24,
  },
  carreraItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.inputBg,
    marginBottom: 8,
  },
  carreraItemSel: { borderColor: C.accent, backgroundColor: C.accent20 },
  carreraCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: C.accent40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface,
  },
  carreraCheckboxOn: { backgroundColor: C.accent, borderColor: C.accent },
  carreraItemName: { color: C.text, fontSize: 14, fontWeight: "600" },
  carreraItemMeta: { color: C.textMuted, fontSize: 12, marginTop: 2 },

  // ── Sub-modal 2 (ver seleccionadas) — capa absoluta sobre Modal 1 ──
  subModalLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.surface,
    borderRadius: 20,
    padding: 20,
  },
  seleccionadaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.inputBg,
    marginBottom: 8,
  },
  seleccionadaName: { flex: 1, color: C.text, fontSize: 14, fontWeight: "600" },
  seleccionadaDel: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.redBg,
  },

  // ── Modal 3 (confirmación) — capa absoluta centrada ──
  confirmLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(7,5,15,0.70)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    borderRadius: 20,
  },
  confirmCard: {
    width: "100%",
    backgroundColor: C.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.inputBorder,
    padding: 22,
    alignItems: "center",
  },
  confirmIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.accent20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  confirmTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center",
  },
  confirmDesc: {
    color: C.textSub,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginBottom: 20,
  },
  confirmActions: { flexDirection: "row", gap: 10, width: "100%" },
});
