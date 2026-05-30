import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  registerEmpresa,
  registerTalento,
  registerUniversidad,
  toNullableString,
} from "../services/authService";
import AppHeader from "../components/AppHeader";

// ── Design tokens ──────────────────────────────────────────────
const C = {
  bg: "#07050f",
  surface: "#0d0b1e",
  accent: "#8b5cf6",
  accent70: "rgba(167,139,250,1)",
  accent40: "rgba(139,92,246,0.35)",
  accent20: "rgba(139,92,246,0.12)",
  text: "#ffffff",
  textSub: "rgba(255,255,255,0.65)",
  textMuted: "rgba(255,255,255,0.38)",
  border: "rgba(139,92,246,0.22)",
  red: "#ef4444",
  redBg: "rgba(239,68,68,0.10)",
  green: "#22c55e",
  greenBg: "rgba(34,197,94,0.15)",
};

// ── Types ────────────────────────────────────────────────────────
type Flow = "talento" | "empresa" | "universidad" | null;
type DocType = "dui" | "pasaporte" | "licencia";
type PayMethod = "tarjeta" | "";

interface LangEntry {
  name: string;
  level: string;
}
interface CarreraEntry {
  nombre: string;
  duracion: string;
  modalidad: string;
  coordinador: string;
}

const AREAS = [
  "Ingeniería en Sistemas / Informática",
  "Ingeniería Industrial",
  "Ingeniería Civil",
  "Ingeniería Eléctrica",
  "Ingeniería Mecánica",
  "Ingeniería Electrónica",
  "Licenciatura en Ciencias Computacionales",
  "Licenciatura en Administración de Empresas",
  "Licenciatura en Contaduría Pública",
  "Licenciatura en Marketing",
  "Licenciatura en Derecho",
  "Licenciatura en Psicología",
  "Licenciatura en Comunicaciones",
  "Licenciatura en Diseño Gráfico",
  "Licenciatura en Educación",
  "Técnico en Computación",
  "Técnico en Electrónica",
  "Técnico en Administración",
  "Maestría en Administración de Empresas (MBA)",
  "Maestría en Ciencias de Datos",
  "Maestría en Gestión de Proyectos",
  "Otro",
];

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

const IDIOMAS = [
  "Inglés (EE. UU.)",
  "Inglés Británico",
  "Inglés Australiano",
  "Español Latinoamérica",
  "Español (España)",
  "Francés",
  "Italiano",
  "Alemán",
  "Portugués",
  "Polaco",
  "Ruso",
  "Chino Mandarín",
  "Japonés",
  "Coreano",
  "Árabe",
  "Hindi",
  "Otro",
];

const NIVELES = ["A1", "A2", "B1", "B2", "C1", "C2"];

const DURATIONS = [
  "2 años",
  "3 años",
  "4 años",
  "5 años",
  "6 años",
  "7 años",
  "8 años",
];
const MODALIDADES = ["Presencial", "Virtual", "Híbrida"];

const FLOW_LABELS: Record<string, string[]> = {
  talento: ["Datos", "Identidad", "Perfil", "Pago", "Seguridad"],
  empresa: ["Empresa", "Visual", "Antifraude", "Pago", "Representante"],
  universidad: [
    "Institución",
    "Visual",
    "Antifraude",
    "Carreras",
    "Responsable",
  ],
};

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
// ── Universidades El Salvador ────────────────────────────────────
const UNIVERSIDADES: string[] = [
  "Universidad Don Bosco (UDB)",
  "Universidad Centroamericana José Simeón Cañas (UCA)",
  "Universidad de El Salvador (UES)",
  "Universidad Tecnológica de El Salvador (UTEC)",
  "Universidad Francisco Gavidia (UFG)",
  "Universidad Modular Abierta (UMA)",
  "USAM",
  "CESSA Universidad",
  "Universidad Católica de El Salvador (UNICAES)",
  "Universidad de Oriente (UNIVO)",
  "Escuela Superior de Economía y Negocios (ESEN)",
  "Universidad Evangélica de El Salvador",
  "Universidad Luterana Salvadoreña (ULS)",
  "Universidad Pedagógica de El Salvador",
];
// ── Carreras por universidad ──────────────────────────────────────
const UNIV_CARRERAS: Record<string, string[]> = {
  "Universidad Don Bosco (UDB)": [
    "Ingeniería en Sistemas Computacionales",
    "Ingeniería Industrial",
    "Ingeniería Eléctrica",
    "Ingeniería en Mecatrónica",
    "Licenciatura en Diseño Gráfico",
    "Técnico en Computación",
    "Técnico en Electrónica",
    "Maestría en Gestión de Proyectos",
  ],
  "Universidad Centroamericana José Simeón Cañas (UCA)": [
    "Ingeniería en Sistemas Computacionales",
    "Licenciatura en Administración de Empresas",
    "Licenciatura en Economía",
    "Licenciatura en Comunicaciones",
    "Licenciatura en Psicología",
    "Licenciatura en Derecho",
    "Maestría en Administración de Empresas (MBA)",
  ],
  "Universidad de El Salvador (UES)": [
    "Ingeniería en Sistemas Informáticos",
    "Ingeniería Civil",
    "Ingeniería Eléctrica",
    "Ingeniería Industrial",
    "Licenciatura en Ciencias Computacionales",
    "Licenciatura en Administración de Empresas",
    "Licenciatura en Contaduría Pública",
    "Licenciatura en Derecho",
    "Licenciatura en Educación",
    "Licenciatura en Psicología",
    "Otro",
  ],
  "Universidad Tecnológica de El Salvador (UTEC)": [
    "Ingeniería en Sistemas Computacionales",
    "Ingeniería Industrial",
    "Licenciatura en Administración de Empresas",
    "Licenciatura en Marketing",
    "Licenciatura en Contaduría Pública",
    "Técnico en Computación",
    "Técnico en Administración",
    "Maestría en Administración de Empresas (MBA)",
  ],
  "Universidad Francisco Gavidia (UFG)": [
    "Ingeniería en Sistemas Computacionales",
    "Ingeniería Industrial",
    "Licenciatura en Administración de Empresas",
    "Licenciatura en Marketing",
    "Licenciatura en Derecho",
    "Licenciatura en Contaduría Pública",
    "Licenciatura en Comunicaciones",
    "Técnico en Computación",
  ],
  "Universidad Modular Abierta (UMA)": [
    "Licenciatura en Administración de Empresas",
    "Licenciatura en Contaduría Pública",
    "Licenciatura en Educación",
    "Licenciatura en Derecho",
    "Técnico en Administración",
  ],
  USAM: [
    "Licenciatura en Administración de Empresas",
    "Licenciatura en Marketing",
    "Licenciatura en Contaduría Pública",
    "Técnico en Administración",
  ],
  "CESSA Universidad": [
    "Licenciatura en Administración de Empresas",
    "Licenciatura en Marketing",
    "Técnico en Gastronomía",
    "Turismo y Hotelería",
  ],
  "Universidad Católica de El Salvador (UNICAES)": [
    "Licenciatura en Derecho",
    "Licenciatura en Administración de Empresas",
    "Licenciatura en Contaduría Pública",
    "Licenciatura en Educación",
    "Trabajo Social",
  ],
  "Universidad de Oriente (UNIVO)": [
    "Ingeniería en Sistemas Computacionales",
    "Licenciatura en Administración de Empresas",
    "Licenciatura en Derecho",
    "Licenciatura en Contaduría Pública",
  ],
  "Escuela Superior de Economía y Negocios (ESEN)": [
    "Licenciatura en Administración de Empresas",
    "Maestría en Administración de Empresas (MBA)",
    "Maestría en Ciencias de Datos",
    "Finanzas y Economía",
  ],
  "Universidad Evangélica de El Salvador": [
    "Medicina",
    "Enfermería",
    "Licenciatura en Derecho",
    "Licenciatura en Administración de Empresas",
    "Licenciatura en Educación",
  ],
  "Universidad Luterana Salvadoreña (ULS)": [
    "Licenciatura en Trabajo Social",
    "Licenciatura en Educación",
    "Licenciatura en Administración de Empresas",
    "Teología",
  ],
  "Universidad Pedagógica de El Salvador": [
    "Licenciatura en Ciencias de la Educación",
    "Licenciatura en Educación Parvularia",
    "Maestría en Gestión de Proyectos",
    "Administración Educativa",
  ],
};

// ── Document validation rules (El Salvador) ────────────────────
interface DocRule {
  maxLen: number;
  pattern: RegExp;
  hint: string;
  upper?: boolean;
}
const DOC_RULES: Record<DocType, DocRule> = {
  dui: {
    maxLen: 10,
    pattern: /^\d{8}-\d$/,
    hint: "DUI: formato XXXXXXXX-X  (ej: 12345678-9)",
  },
  pasaporte: {
    maxLen: 8,
    pattern: /^[A-Z]\d{7}$/,
    hint: "Pasaporte: 1 letra mayúscula + 7 dígitos  (ej: A1234567)",
    upper: true,
  },
  licencia: {
    maxLen: 10,
    pattern: /^\d{10}$/,
    hint: "Licencia de conducir: exactamente 10 dígitos numéricos",
  },
};
// ── Password strength ────────────────────────────────────────────
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

// ── Validation helpers ───────────────────────────────────────────
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(v.trim());
const TAKEN_USERS = ["admin", "gradly", "usuario", "test"];

// ── Utility helpers ──────────────────────────────────────────────
const isOnlyLettersSpaces = (v: string) => /^[a-zA-ZÀ-ÿ\s]+$/.test(v.trim());

async function pickImage(setter: (uri: string) => void): Promise<void> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    Alert.alert(
      "Permiso requerido",
      "Necesitamos acceso a tu galería para subir imágenes. Habilítalo en Configuración.",
    );
    return;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 0.85,
  });
  if (!result.canceled && result.assets[0]) {
    setter(result.assets[0].uri);
  }
}

function luhn(num: string): boolean {
  const digits = num.replace(/\s/g, "").split("").reverse().map(Number);
  let sum = 0;
  digits.forEach((d, i) => {
    let n = d;
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  });
  return sum % 10 === 0;
}

function detectPhonePrefix(
  digits: string,
): { prefix: string; digits: number } | null {
  if (digits.startsWith("503")) return { prefix: "+503", digits: 8 };
  if (digits.startsWith("502")) return { prefix: "+502", digits: 8 };
  if (digits.startsWith("504")) return { prefix: "+504", digits: 8 };
  if (digits.startsWith("505")) return { prefix: "+505", digits: 8 };
  if (digits.startsWith("506")) return { prefix: "+506", digits: 8 };
  if (digits.startsWith("507")) return { prefix: "+507", digits: 8 };
  if (digits.startsWith("52")) return { prefix: "+52", digits: 10 };
  if (digits.startsWith("1")) return { prefix: "+1", digits: 10 };
  return null;
}

function formatPhoneLocal(
  localDigits: string,
  detected: { prefix: string; digits: number },
): string {
  if (!localDigits.length) return "";
  if (detected.prefix === "+1") {
    const d = localDigits.slice(0, 10);
    if (d.length <= 3) return d;
    if (d.length <= 6) return "(" + d.slice(0, 3) + ") " + d.slice(3);
    return "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6, 10);
  }
  if (detected.prefix === "+52") {
    const d = localDigits.slice(0, 10);
    if (d.length <= 3) return d;
    if (d.length <= 6) return d.slice(0, 3) + " " + d.slice(3);
    return d.slice(0, 3) + " " + d.slice(3, 6) + " " + d.slice(6, 10);
  }
  const d = localDigits.slice(0, 8);
  if (d.length <= 4) return d;
  return d.slice(0, 4) + " " + d.slice(4, 8);
}

// ── Reusable sub-components ──────────────────────────────────────

function FloatInput({
  label,
  value,
  onChangeText,
  secureTextEntry = false,
  keyboardType = "default",
  multiline = false,
  maxLength,
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
  error?: string;
  rightIcon?: React.ReactNode;
  style?: any;
}) {
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
          style={[
            s.textInput,
            multiline && { height: 90, textAlignVertical: "top" },
          ]}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          multiline={multiline}
          maxLength={maxLength}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholderTextColor="transparent"
          autoCapitalize="none"
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
  const [open, setOpen] = useState(false);
  const success = !!value && !error;
  return (
    <View style={[s.floatWrap, style]}>
      <Text style={[s.floatLabel, value ? s.floatLabelActive : null]}>
        {label}
      </Text>
      <TouchableOpacity
        style={[
          s.inputRow,
          s.selectRow,
          error ? s.inputErr : success ? s.inputSuccess : null,
        ]}
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.7}
      >
        <Text
          style={value ? s.selectVal : s.selectPlaceholder}
          numberOfLines={1}
        >
          {value || "Selecciona…"}
        </Text>
        <Text style={s.selectArrow}>{open ? "▴" : "▾"}</Text>
      </TouchableOpacity>
      {open && (
        <View style={s.dropdown}>
          <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[s.dropdownItem, value === opt && s.dropdownItemActive]}
                onPress={() => {
                  onChange(opt);
                  setOpen(false);
                }}
              >
                <Text
                  style={[
                    s.dropdownText,
                    value === opt && { color: C.accent70 },
                  ]}
                >
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

// ── University autocomplete input ─────────────────────────────────
function AutocompleteInput({
  label,
  value,
  options,
  onSelect,
  error,
}: {
  label: string;
  value: string;
  options: string[];
  onSelect: (v: string) => void;
  error?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(value);
  const isSelected = options.includes(text);
  const filtered = text.trim()
    ? options.filter((o) => o.toLowerCase().includes(text.toLowerCase()))
    : options;
  const showDropdown = focused && !isSelected && filtered.length > 0;
  const success = isSelected && !error;

  React.useEffect(() => {
    setText(value);
  }, [value]);

  return (
    <View style={s.floatWrap}>
      <Text
        style={[
          s.floatLabel,
          (focused || text.length > 0) && s.floatLabelActive,
        ]}
      >
        {label}
      </Text>
      <View
        style={[
          s.inputRow,
          focused && s.inputFocused,
          error ? s.inputErr : success ? s.inputSuccess : null,
        ]}
      >
        <TextInput
          style={s.textInput}
          value={text}
          onChangeText={(v) => {
            setText(v);
            onSelect("");
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 180)}
          placeholderTextColor="transparent"
          autoCapitalize="none"
        />
        {isSelected && (
          <TouchableOpacity
            onPress={() => {
              setText("");
              onSelect("");
            }}
            style={{ padding: 6 }}
          >
            <Ionicons name="close-circle" size={18} color={C.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      {showDropdown && (
        <View style={s.dropdown}>
          <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }}>
            {filtered.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={s.dropdownItem}
                onPress={() => {
                  setText(opt);
                  onSelect(opt);
                  setFocused(false);
                }}
              >
                <Text style={s.dropdownText}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
      {!!error && <Text style={s.errText}>{error}</Text>}
    </View>
  );
}

function UploadZone({
  label,
  icon,
  imageUri,
  onPress,
  error,
}: {
  label: string;
  icon: string;
  imageUri?: string | null;
  onPress: () => void;
  error?: string;
}) {
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
            <Image
              source={{ uri: imageUri }}
              style={s.uploadPreview}
              resizeMode="cover"
            />
            <Text style={s.uploadChangeText}>Toca para cambiar</Text>
          </>
        ) : (
          <>
            <Text style={s.uploadIcon}>{icon}</Text>
            <Text style={s.uploadLabel}>{label}</Text>
            <Text style={s.uploadHint}>PNG, JPG · Máx. 10MB</Text>
          </>
        )}
      </TouchableOpacity>
      {!!error && <Text style={s.errText}>{error}</Text>}
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
  return (
    <View style={s.stepNav}>
      <TouchableOpacity
        style={s.btnOutline}
        onPress={onBack}
        disabled={loading}
      >
        <Text style={s.btnOutlineText}>← Anterior</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.btnPrimary, loading && { opacity: 0.6 }]}
        onPress={onNext}
        disabled={loading}
      >
        <Text style={s.btnPrimaryText}>
          {loading ? "Procesando..." : nextLabel}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={s.sectionLabel}>{children}</Text>;
}

function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <View style={s.infoNote}>
      <Text style={s.infoNoteText}>{children}</Text>
    </View>
  );
}

// ── Password field ────────────────────────────────────────────────
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
          <TouchableOpacity
            onPress={() => setShow((v) => !v)}
            style={{ padding: 6 }}
          >
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

// ── Confirm-password field (with show/hide toggle) ────────────────
function ConfirmPassField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <FloatInput
      label="Confirmar contraseña"
      value={value}
      onChangeText={onChange}
      secureTextEntry={!show}
      error={error}
      rightIcon={
        <TouchableOpacity
          onPress={() => setShow((v) => !v)}
          style={{ padding: 6 }}
        >
          <Ionicons
            name={show ? "eye-off-outline" : "eye-outline"}
            size={20}
            color={C.textMuted}
          />
        </TouchableOpacity>
      }
    />
  );
}

// ── Payment section (shared talento/empresa) ──────────────────────
function PaymentSection({
  method,
  setMethod,
  cardNum,
  setCardNum,
  cardName,
  setCardName,
  cardExp,
  setCardExp,
  cardCvv,
  setCardCvv,
  errors,
}: any) {
  return (
    <View>
      <SelectInput
        label="Método de pago"
        value={method === "tarjeta" ? "Tarjeta débito / crédito" : ""}
        options={["Tarjeta débito / crédito"]}
        onChange={(v) =>
          setMethod(v === "Tarjeta débito / crédito" ? "tarjeta" : "")
        }
        error={errors?.method}
      />
      {method === "tarjeta" && (
        <View>
          <FloatInput
            label="Número de tarjeta"
            value={cardNum}
            onChangeText={(v) =>
              setCardNum(
                v
                  .replace(/\D/g, "")
                  .replace(/(.{4})/g, "$1 ")
                  .trim()
                  .slice(0, 19),
              )
            }
            keyboardType="numeric"
            error={errors?.cardNum}
          />
          <FloatInput
            label="Titular de la tarjeta"
            value={cardName}
            onChangeText={setCardName}
            error={errors?.cardName}
          />
          <View style={s.grid2}>
            <FloatInput
              label="MM/AA"
              value={cardExp}
              onChangeText={(v) => {
                let d = v.replace(/\D/g, "");
                if (d.length > 2) d = d.slice(0, 2) + "/" + d.slice(2, 4);
                setCardExp(d);
              }}
              maxLength={5}
              style={{ flex: 1 }}
              error={errors?.cardExp}
            />
            <FloatInput
              label="CVV"
              value={cardCvv}
              onChangeText={setCardCvv}
              keyboardType="numeric"
              maxLength={4}
              style={{ flex: 1 }}
              error={errors?.cardCvv}
            />
          </View>
        </View>
      )}
      <InfoNote>
        💡 Solo se activa al recibir pagos a través de Gradly.
      </InfoNote>
    </View>
  );
}
// ══════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════
export default function Registro() {
  const router = useRouter();

  // ── Scroll ref ──────────────────────────────────────────────────
  const scrollRef = React.useRef<React.ElementRef<typeof ScrollView>>(null);
  const scrollTop = () => scrollRef.current?.scrollTo({ y: 0, animated: true });

  // ── Navigation state ──────────────────────────────────────────
  const [flow, setFlow] = useState<Flow>(null);
  const [step, setStep] = useState(0); // 0 = role picker, 1-5 = flow steps, 99 = success

  // ── Errors ────────────────────────────────────────────────────
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [registerError, setRegisterError] = useState("");
  const setErr = (key: string, msg: string) =>
    setErrors((e) => ({ ...e, [key]: msg }));
  const clearErr = (key: string) =>
    setErrors((e) => {
      const n = { ...e };
      delete n[key];
      return n;
    });

  // ─────────────────────────────────────────────────────────────
  // TALENTO state
  // ─────────────────────────────────────────────────────────────
  const [tNombre, setTNombre] = useState("");
  const [tUsername, setTUsername] = useState("");
  const [tEmail, setTEmail] = useState("");
  const [tPhone, setTPhone] = useState("");
  const [tDepto, setTDepto] = useState("");
  const [tCiudad, setTCiudad] = useState("");
  const [tBio, setTBio] = useState("");
  const [tInstagram, setTInstagram] = useState("");
  const [tLinkedin, setTLinkedin] = useState("");
  const [tFacebook, setTFacebook] = useState("");
  const [tGithub, setTGithub] = useState("");
  const [tLanguages, setTLanguages] = useState<LangEntry[]>([
    { name: "", level: "" },
  ]);
  const [tSkills, setTSkills] = useState("");
  // T2
  const [tDocType, setTDocType] = useState<DocType>("dui");
  const [tDocNum, setTDocNum] = useState("");
  // T3
  const [tUniv, setTUniv] = useState("");
  const [tArea, setTArea] = useState("");
  const [tUniv2, setTUniv2] = useState("");
  const [tArea2, setTArea2] = useState("");
  const [showSecondCareer, setShowSecondCareer] = useState(false);
  const [tOtroEstudio, setTOtroEstudio] = useState("");
  // T4 Payment
  const [tPayMethod, setTPayMethod] = useState<PayMethod>("");
  const [tCardNum, setTCardNum] = useState("");
  const [tCardName, setTCardName] = useState("");
  const [tCardExp, setTCardExp] = useState("");
  const [tCardCvv, setTCardCvv] = useState("");
  // T5 Security
  const [tPass, setTPass] = useState("");
  const [tPass2, setTPass2] = useState("");
  const [tTerms, setTTerms] = useState(false);

  // ─────────────────────────────────────────────────────────────
  // EMPRESA state
  // ─────────────────────────────────────────────────────────────
  const [eNombre, setENombre] = useState("");
  const [eIndustria, setEIndustria] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eDepto, setEDepto] = useState("");
  const [eCiudad, setECiudad] = useState("");
  const [eDireccion, setEDireccion] = useState("");
  const [eTel, setETel] = useState("");
  const [eEmail, setEEmail] = useState("");
  const [eWeb, setEWeb] = useState("");
  const [eIg, setEIg] = useState("");
  const [eFb, setEFb] = useState("");

  // E3 Antifraude
  const [eRepDui, setERepDui] = useState("");
  // E4 Payment Plans
  const [ePlanBillingMode, setEPlanBillingMode] = useState<
    "monthly" | "annual"
  >("monthly");
  const [eSelectedPlan, setESelectedPlan] = useState<
    "free" | "basic" | "premium" | null
  >(null);
  const [showEPaymentModal, setShowEPaymentModal] = useState(false);
  const [ePayMethod, setEPayMethod] = useState<PayMethod>("");
  const [eCardNum, setECardNum] = useState("");
  const [eCardName, setECardName] = useState("");
  const [eCardExp, setECardExp] = useState("");
  const [eCardCvv, setECardCvv] = useState("");
  // E5
  const [eRepNombre, setERepNombre] = useState("");
  const [eRepCargo, setERepCargo] = useState("");
  const [eRepEmail, setERepEmail] = useState("");
  const [eRepTel, setERepTel] = useState("");
  const [eRepUsername, setERepUsername] = useState("");
  const [eRepFb, setERepFb] = useState("");
  const [eRepIg, setERepIg] = useState("");
  const [ePass, setEPass] = useState("");
  const [ePass2, setEPass2] = useState("");
  const [eTerms, setETerms] = useState(false);

  // ─────────────────────────────────────────────────────────────
  // UNIVERSIDAD state
  // ─────────────────────────────────────────────────────────────
  const [uNombre, setUNombre] = useState("");
  const [uDepto, setUDepto] = useState("");
  const [uCiudad, setUCiudad] = useState("");
  const [uDireccion, setUDireccion] = useState("");
  const [uEmail, setUEmail] = useState("");
  const [uWeb, setUWeb] = useState("");
  const [uTel, setUTel] = useState("");
  const [uDesc, setUDesc] = useState("");
  const [uIg, setUIg] = useState("");
  const [uGithub, setUGithub] = useState("");
  const [uFacebook, setUFacebook] = useState("");
  // U3
  const [uRectorNombre, setURectorNombre] = useState("");
  const [uRectorDocType, setURectorDocType] = useState<DocType>("dui");
  const [uRectorDocNum, setURectorDocNum] = useState("");
  // U4 Carreras
  const [carreras, setCarreras] = useState<CarreraEntry[]>([]);
  const [newCarrera, setNewCarrera] = useState<CarreraEntry>({
    nombre: "",
    duracion: "",
    modalidad: "",
    coordinador: "",
  });
  const [showCarreraForm, setShowCarreraForm] = useState(false);
  // U5
  const [uEncNombre, setUEncNombre] = useState("");
  const [uEncTel, setUEncTel] = useState("");
  const [uEncEmail, setUEncEmail] = useState("");
  const [uUsername, setUUsername] = useState("");
  const [uEncIg, setUEncIg] = useState("");
  const [uEncLi, setUEncLi] = useState("");
  const [uPass, setUPass] = useState("");
  const [uPass2, setUPass2] = useState("");
  const [uTerms, setUTerms] = useState(false);

  // ── E1 extra ───────────────────────────────────────────────────
  const [eIndustriaOtro, setEIndustriaOtro] = useState("");

  // ── Photo / image URIs ────────────────────────────────────────
  // Talento
  const [tProfilePhoto, setTProfilePhoto] = useState<string | null>(null);
  const [tDocPhoto, setTDocPhoto] = useState<string | null>(null);
  // Empresa
  const [eLogoPhoto, setELogoPhoto] = useState<string | null>(null);
  const [eBannerPhoto, setEBannerPhoto] = useState<string | null>(null);
  const [eRepDuiPhoto, setERepDuiPhoto] = useState<string | null>(null);
  const [eRepSelfiePhoto, setERepSelfiePhoto] = useState<string | null>(null);
  const [eRepPhoto, setERepPhoto] = useState<string | null>(null);
  // Universidad
  const [uLogoPhoto, setULogoPhoto] = useState<string | null>(null);
  const [uBannerPhoto, setUBannerPhoto] = useState<string | null>(null);
  const [uRectorDocPhoto, setURectorDocPhoto] = useState<string | null>(null);
  const [uRectorSelfiePhoto, setURectorSelfiePhoto] = useState<string | null>(
    null,
  );
  const [uEncPhoto, setUEncPhoto] = useState<string | null>(null);

  // ── Derived geo options (El Salvador only) ──────────────────────
  const deptoOptions = Object.keys(GEO_DATA);
  const tCiudadOptions = tDepto ? (GEO_DATA[tDepto] ?? []) : [];
  const eCiudadOptions = eDepto ? (GEO_DATA[eDepto] ?? []) : [];
  const uCiudadOptions = uDepto ? (GEO_DATA[uDepto] ?? []) : [];

  // ── Helpers ────────────────────────────────────────────────────
  const selectRole = (role: Flow) => {
    setFlow(role);
    setErrors({});
    setStep(1);
  };

  const goBack = () => {
    scrollTop();
    if (step <= 1) {
      setFlow(null);
      setStep(0);
    } else {
      setStep((s) => s - 1);
    }
  };

  // Phone handler — El Salvador only (+503, 8 digits, XXXX XXXX)
  const makePhoneHandler =
    (setter: (v: string) => void, errKey: string) => (v: string) => {
      const digits = v.replace(/[^\d]/g, "").slice(0, 8);
      if (!digits) {
        setter("");
        clearErr(errKey);
        return;
      }
      const formatted =
        digits.length <= 4
          ? digits
          : digits.slice(0, 4) + " " + digits.slice(4);
      setter(formatted);
      if (digits.length < 8) setErr(errKey, "El número debe tener 8 dígitos");
      else clearErr(errKey);
    };

  // ── Validation ─────────────────────────────────────────────────
  const getDocRule = (docType: DocType): DocRule =>
    DOC_RULES[docType] ?? DOC_RULES["dui"];

  const validateT1 = () => {
    const errs: Record<string, string> = {};

    const nombre = tNombre.trim();
    if (!nombre) errs.tNombre = "Este campo es requerido";
    else if (!isOnlyLettersSpaces(nombre))
      errs.tNombre = "Solo se permiten letras mayúsculas y minúsculas";

    const uname = tUsername.trim();
    if (!uname) errs.tUsername = "Este campo es requerido";
    else if (uname.length < 3 || uname.length > 30)
      errs.tUsername = "Debe tener entre 3 y 30 caracteres";
    else if (!/^[a-zA-Z0-9_.]+$/.test(uname))
      errs.tUsername = "Solo letras, números, _ y .";
    else if (uname.startsWith(".") || uname.endsWith("."))
      errs.tUsername = "No puede empezar o terminar con un punto";
    else if (uname.includes(".."))
      errs.tUsername = "No se permiten puntos consecutivos";
    else if (TAKEN_USERS.includes(uname.toLowerCase()))
      errs.tUsername = "Usuario no disponible";

    const email = tEmail.trim();
    if (!email) errs.tEmail = "Este campo es requerido";
    else if (!isEmail(email)) errs.tEmail = "Ingresa un correo válido";

    if (!tDepto) errs.tDepto = "Selecciona un departamento";
    if (!tCiudad) errs.tCiudad = "Selecciona una ciudad";

    const phoneDigits = tPhone.replace(/\D/g, "");
    if (!phoneDigits) errs.tPhone = "Este campo es requerido";
    else if (phoneDigits.length < 8)
      errs.tPhone = "El número debe tener 8 dígitos";

    const bio = tBio.trim();
    if (!bio) errs.tBio = "El campo no puede quedar vacío";
    else if (/[^a-zA-ZÀ-ÿ0-9\s.,;:]/.test(bio))
      errs.tBio = "No se permiten caracteres especiales";

    const skills = tSkills.trim();
    if (!skills) errs.tSkills = "El campo no puede quedar vacío";
    else if (/[^a-zA-ZÀ-ÿ\s,.]/.test(skills))
      errs.tSkills = "No se permiten caracteres especiales";
    else if ((skills.match(/[a-zA-ZÀ-ÿ]/g) ?? []).length < 2)
      errs.tSkills = "Ingresa al menos dos letras";

    const socials: { val: string; prefix: string; key: string }[] = [
      { val: tInstagram, prefix: "instagram.com/", key: "tInstagram" },
      { val: tLinkedin, prefix: "linkedin.com/", key: "tLinkedin" },
      { val: tFacebook, prefix: "facebook.com/", key: "tFacebook" },
      { val: tGithub, prefix: "github.com/", key: "tGithub" },
    ];
    socials.forEach(({ val, prefix, key }) => {
      if (val.trim() && !val.includes(prefix))
        errs[key] = "Debe incluir " + prefix;
    });

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateT2 = () => {
    const errs: Record<string, string> = {};
    const rule = getDocRule(tDocType);
    const docNum = tDocNum.trim();
    if (!docNum) errs.tDocNum = "Este campo es requerido";
    else {
      const testVal = rule.upper ? docNum.toUpperCase() : docNum;
      if (!rule.pattern.test(testVal)) errs.tDocNum = rule.hint;
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateT3 = () => {
    const errs: Record<string, string> = {};

    const univ = tUniv.trim();
    if (!univ) errs.tUniv = "Ingresa tu universidad o institución";
    else if (/[^a-zA-ZÀ-ÿ0-9\s(),.\-]/.test(univ))
      errs.tUniv = "Caracteres no permitidos";

    if (!tArea) errs.tArea = "Selecciona un área de especialización";

    if (showSecondCareer) {
      const univ2 = tUniv2.trim();
      if (!univ2) errs.tUniv2 = "Ingresa la institución o elimina este campo";
      else if (/[^a-zA-ZÀ-ÿ0-9\s(),.\-]/.test(univ2))
        errs.tUniv2 = "Caracteres no permitidos";
      if (!tArea2) errs.tArea2 = "Selecciona un área de especialización";
    }

    if (tOtroEstudio.trim() && /[^a-zA-ZÀ-ÿ0-9\s,.:;)(]/.test(tOtroEstudio))
      errs.tOtroEstudio = "Solo letras, números y los caracteres , . : ; ) (";

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateT4 = (prefix: string) => {
    // Talento (paso 4) es informativo - no requiere validación de pago
    if (prefix === "t") {
      setErrors({});
      return true;
    }

    // Empresa (paso 4) requiere validación completa de pago o plan gratuito
    const errs: Record<string, string> = {};
    if (eSelectedPlan === null) {
      errs[`${prefix}Plan`] = "Selecciona un plan.";
      setErrors(errs);
      return false;
    }
    if (eSelectedPlan === "free") {
      setErrors({});
      return true;
    }

    const method = prefix === "e" ? ePayMethod : null;
    if (!method) {
      errs[`${prefix}PayMethod`] = "Selecciona un método de pago.";
      setErrors(errs);
      return false;
    }
    if (method === "tarjeta") {
      const num = eCardNum.replace(/\s/g, "");
      if (!/^[0-9]+$/.test(num))
        errs[`${prefix}CardNum`] = "Ingresa solo números para la tarjeta.";
      errs[`${prefix}CardName`] = "Ingresa el nombre del titular.";
      const exp = eCardExp.trim();
      if (!/^\d{2}\/\d{2}$/.test(exp)) {
        errs[`${prefix}CardExp`] = "Formato MM/AA.";
      } else {
        const [m, y] = exp.split("/").map(Number);
        const now = new Date();
        const expDate = new Date(2000 + y, m - 1, 1);
        if (
          m < 1 ||
          m > 12 ||
          expDate < new Date(now.getFullYear(), now.getMonth(), 1)
        )
          errs[`${prefix}CardExp`] = "Tarjeta expirada o fecha inválida.";
      }
      const cvv = eCardCvv.trim();
      if (!/^\d{3,4}$/.test(cvv))
        errs[`${prefix}CardCvv`] = "CVV de 3 o 4 dígitos.";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validatePass = (
    p: string,
    p2: string,
    terms: boolean,
    prefix: string,
  ) => {
    const errs: Record<string, string> = {};
    if (!p) errs[`${prefix}Pass`] = "La contraseña es requerida.";
    else if (getPassScore(p) < 2)
      errs[`${prefix}Pass`] = "La contraseña es demasiado débil.";
    if (p !== p2) errs[`${prefix}Pass2`] = "Las contraseñas no coinciden.";
    if (!terms)
      errs[`${prefix}Terms`] = "Debes aceptar los términos y condiciones.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateE1 = () => {
    const errs: Record<string, string> = {};

    const nombre = eNombre.trim();
    if (!nombre) errs.eNombre = "Este campo no puede quedar vacío";
    else if (/[^a-zA-Z\u00C0-\u00FF0-9\s]/.test(nombre))
      errs.eNombre = "Solo se permiten letras y números";
    else if (nombre.length < 2) errs.eNombre = "Mínimo 2 caracteres";

    if (!eIndustria) errs.eIndustria = "Selecciona una industria o sector";
    else if (eIndustria === "Otro") {
      const otro = eIndustriaOtro.trim();
      if (!otro) errs.eIndustriaOtro = "Especifica la industria";
      else if (/[^a-zA-Z\u00C0-\u00FF\s,;.:]/.test(otro))
        errs.eIndustriaOtro = "Solo letras y los caracteres , ; . :";
    }

    const desc = eDesc.trim();
    if (!desc) errs.eDesc = "Este campo no puede quedar vacío";
    else if (/[^a-zA-Z\u00C0-\u00FF0-9\s.,;:]/.test(desc))
      errs.eDesc = "No se permiten caracteres especiales";

    if (!eDepto) errs.eDepto = "Selecciona un departamento";
    if (!eCiudad) errs.eCiudad = "Selecciona una ciudad";

    if (eDireccion.trim() && /[^a-zA-ZÀ-ÿ0-9\s#.,;:]/.test(eDireccion))
      errs.eDireccion = "Solo letras, números y los caracteres # . , ; :";

    const telDigits = eTel.replace(/\D/g, "");
    if (!telDigits) errs.eTel = "Este campo no puede quedar vacío";
    else if (telDigits.length < 8) errs.eTel = "El número debe tener 8 dígitos";

    const email = eEmail.trim();
    if (!email) errs.eEmail = "Este campo no puede quedar vacío";
    else if (!isEmail(email)) errs.eEmail = "Ingresa un correo válido";

    if (eWeb.trim()) {
      const eWebTest = /^https?:\/\//.test(eWeb.trim())
        ? eWeb.trim()
        : `https://${eWeb.trim()}`;
      if (!/^https?:\/\/.+\..+/.test(eWebTest))
        errs.eWeb = "Ingresa una URL válida (ej: https://www.ejemplo.com)";
    }

    const eSocials: {
      val: string;
      check: (v: string) => boolean;
      key: string;
      hint: string;
    }[] = [
      {
        val: eIg,
        check: (v) => v.includes("instagram.com/"),
        key: "eIg",
        hint: "https://www.instagram.com/",
      },
      {
        val: eFb,
        check: (v) => v.includes("facebook.com/"),
        key: "eFb",
        hint: "https://www.facebook.com/",
      },
    ];
    eSocials.forEach(({ val, check, key, hint }) => {
      if (val.trim() && !check(val))
        errs[key] = "El enlace debe incluir: " + hint;
    });

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateE2 = () => {
    const errs: Record<string, string> = {};
    if (!eLogoPhoto) errs.eLogoPhoto = "Debes subir el logo de la empresa";
    if (!eBannerPhoto)
      errs.eBannerPhoto = "Debes subir el banner de la empresa";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateE3 = () => {
    const errs: Record<string, string> = {};
    const dui = eRepDui.trim();
    if (!/^\d{8,9}$/.test(dui)) errs.eRepDui = "DUI: 8–9 dígitos numéricos.";
    if (!eRepDuiPhoto) errs.eRepDuiPhoto = "Debes subir la imagen del DUI";
    if (!eRepSelfiePhoto)
      errs.eRepSelfiePhoto = "Debes subir la selfie de verificación";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateE5 = () => {
    const errs: Record<string, string> = {};

    const repNombre = eRepNombre.trim();
    if (!repNombre) errs.eRepNombre = "Este campo no puede quedar vacío";
    else if (!isOnlyLettersSpaces(repNombre))
      errs.eRepNombre = "Solo se permiten letras y espacios";

    const repCargo = eRepCargo.trim();
    if (!repCargo) errs.eRepCargo = "Este campo no puede quedar vacío";
    else if (/[^a-zA-ZÀ-ÿ\s,.]/.test(repCargo))
      errs.eRepCargo = "Solo letras, comas y puntos";

    const repEmail = eRepEmail.trim();
    if (!repEmail) errs.eRepEmail = "Este campo no puede quedar vacío";
    else if (!isEmail(repEmail)) errs.eRepEmail = "Ingresa un correo válido";

    const telDigits = eRepTel.replace(/\D/g, "");
    if (!telDigits) errs.eRepTel = "Este campo no puede quedar vacío";
    else if (telDigits.length < 8)
      errs.eRepTel = "El número debe tener 8 dígitos";

    const uname = eRepUsername.trim();
    if (!uname) errs.eRepUsername = "Este campo no puede quedar vacío";
    else if (uname.length < 4) errs.eRepUsername = "Mínimo 4 caracteres";
    else if (!/^[a-zA-Z0-9$_.]+$/.test(uname))
      errs.eRepUsername = "Solo letras, números, $, _ y .";
    else if (TAKEN_USERS.includes(uname.toLowerCase()))
      errs.eRepUsername = "Usuario no disponible";

    if (eRepFb.trim() && !eRepFb.includes("facebook.com/"))
      errs.eRepFb = "El enlace debe incluir facebook.com/";
    if (eRepIg.trim() && !eRepIg.includes("instagram.com/"))
      errs.eRepIg = "El enlace debe incluir instagram.com/";
    if (!eRepPhoto) errs.eRepPhoto = "Debes subir la foto del representante";

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateU1 = () => {
    const errs: Record<string, string> = {};

    const nombre = uNombre.trim();
    if (!nombre) errs.uNombre = "Este campo es requerido";
    else if (/[^a-zA-ZÀ-ÿ0-9\s(),.\-]/.test(nombre))
      errs.uNombre = "Solo letras, números y los caracteres ( ) , . -";
    else if (nombre.length < 4) errs.uNombre = "Mínimo 4 caracteres";

    if (!uDepto) errs.uDepto = "Selecciona un departamento";
    if (!uCiudad) errs.uCiudad = "Selecciona una ciudad";

    if (uDireccion.trim() && /[^a-zA-ZÀ-ÿ0-9\s#.,;:]/.test(uDireccion))
      errs.uDireccion = "Solo letras, números y los caracteres # . , ; :";

    const email = uEmail.trim();
    if (!email) errs.uEmail = "Este campo es requerido";
    else if (!isEmail(email)) errs.uEmail = "Ingresa un correo válido";

    if (uWeb.trim()) {
      const uWebTest = /^https?:\/\//.test(uWeb.trim())
        ? uWeb.trim()
        : `https://${uWeb.trim()}`;
      if (!/^https?:\/\/.+\..+/.test(uWebTest))
        errs.uWeb =
          "Ingresa una URL válida (ej: https://www.universidad.edu.sv)";
    }

    const telDigits = uTel.replace(/\D/g, "");
    if (!telDigits) errs.uTel = "Este campo es requerido";
    else if (telDigits.length < 8) errs.uTel = "El número debe tener 8 dígitos";

    const desc = uDesc.trim();
    if (!desc) errs.uDesc = "El campo no puede quedar vacío";
    else if (/[^a-zA-ZÀ-ÿ0-9\s.,;:]/.test(desc))
      errs.uDesc = "No se permiten caracteres especiales";

    const uSocials: {
      val: string;
      check: (v: string) => boolean;
      key: string;
      hint: string;
    }[] = [
      {
        val: uIg,
        check: (v) => v.includes("instagram.com/"),
        key: "uIg",
        hint: "https://www.instagram.com/",
      },
      {
        val: uFacebook,
        check: (v) => v.includes("facebook.com/"),
        key: "uFacebook",
        hint: "https://www.facebook.com/",
      },
      {
        val: uGithub,
        check: (v) => v.includes("github.com/"),
        key: "uGithub",
        hint: "https://github.com/",
      },
    ];
    uSocials.forEach(({ val, check, key, hint }) => {
      if (val.trim() && !check(val))
        errs[key] = "El enlace debe incluir: " + hint;
    });

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateU2 = () => {
    const errs: Record<string, string> = {};
    if (!uLogoPhoto) errs.uLogoPhoto = "Debes subir el logo de la institución";
    if (!uBannerPhoto)
      errs.uBannerPhoto = "Debes subir el banner de la institución";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateU3 = () => {
    const errs: Record<string, string> = {};

    const rNombre = uRectorNombre.trim();
    if (!rNombre) errs.uRectorNombre = "Este campo es requerido";
    else if (!isOnlyLettersSpaces(rNombre))
      errs.uRectorNombre = "Solo se permiten letras y espacios";

    const rule = getDocRule(uRectorDocType);
    const docNum = uRectorDocNum.trim();
    if (!docNum) errs.uRectorDocNum = "Este campo es requerido";
    else {
      const testVal = rule.upper ? docNum.toUpperCase() : docNum;
      if (!rule.pattern.test(testVal)) errs.uRectorDocNum = rule.hint;
    }
    if (!uRectorDocPhoto)
      errs.uRectorDocPhoto = "Debes subir la imagen del documento";
    if (!uRectorSelfiePhoto)
      errs.uRectorSelfiePhoto = "Debes subir la selfie de verificación";

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateU4 = () => {
    if (carreras.length === 0) {
      setErrors({ carreras: "Debes agregar y guardar al menos una carrera." });
      return false;
    }
    return true;
  };

  const validateU5 = () => {
    const errs: Record<string, string> = {};

    const encNombre = uEncNombre.trim();
    if (!encNombre) errs.uEncNombre = "Este campo es requerido";
    else if (!isOnlyLettersSpaces(encNombre))
      errs.uEncNombre = "Solo se permiten letras y espacios";

    const telDigits = uEncTel.replace(/\D/g, "");
    if (!telDigits) errs.uEncTel = "Este campo es requerido";
    else if (telDigits.length < 8)
      errs.uEncTel = "El número debe tener 8 dígitos";

    const email = uEncEmail.trim();
    if (!email) errs.uEncEmail = "Este campo es requerido";
    else if (!isEmail(email)) errs.uEncEmail = "Ingresa un correo válido";

    const uname = uUsername.trim();
    if (!uname) errs.uUsername = "Este campo es requerido";
    else if (uname.length < 4) errs.uUsername = "Mínimo 4 caracteres";
    else if (!/^[a-zA-Z0-9$_.]+$/.test(uname))
      errs.uUsername = "Solo letras, números, $, _ y .";
    else if (TAKEN_USERS.includes(uname.toLowerCase()))
      errs.uUsername = "Usuario no disponible";

    if (uEncIg.trim() && !uEncIg.includes("instagram.com/"))
      errs.uEncIg = "El enlace debe incluir instagram.com/";
    if (uEncLi.trim() && !uEncLi.includes("linkedin.com/in/"))
      errs.uEncLi = "El enlace debe incluir linkedin.com/in/";
    if (!uEncPhoto) errs.uEncPhoto = "Debes subir la foto del encargado";

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const nextStep = async () => {
    let valid = true;
    setRegisterError("");

    if (flow === "talento") {
      if (step === 1) valid = validateT1();
      else if (step === 2) valid = validateT2();
      else if (step === 3) valid = validateT3();
      else if (step === 4) valid = validateT4("t");
      else if (step === 5) valid = validatePass(tPass, tPass2, tTerms, "t");
    } else if (flow === "empresa") {
      if (step === 1) valid = validateE1();
      else if (step === 2) valid = validateE2();
      else if (step === 3) valid = validateE3();
      else if (step === 4) valid = validateT4("e");
      else if (step === 5) {
        valid = validateE5() && validatePass(ePass, ePass2, eTerms, "e");
      }
    } else if (flow === "universidad") {
      if (step === 1) valid = validateU1();
      else if (step === 2) valid = validateU2();
      else if (step === 3) valid = validateU3();
      else if (step === 4) valid = validateU4();
      else if (step === 5) {
        valid = validateU5() && validatePass(uPass, uPass2, uTerms, "u");
      }
    }

    if (!valid) return;

    if (step >= 5) {
      setSubmitting(true);
      try {
        if (flow === "talento") {
          const payloadTal: any = {
            email: tEmail,
            password: tPass,
            nombre: tNombre,
            username: tUsername,
            telefono: tPhone,
            departamento: tDepto,
            ciudad: tCiudad,
            bio: tBio,
            habilidades: tSkills,
            idiomas: tLanguages,
            docTipo: tDocType,
            docNumero: tDocNum,
            universidad: tUniv,
            area: tArea,
            universidad2: tUniv2 || null,
            area2: tArea2 || null,
            otroEstudio: tOtroEstudio || null,
            metodoPago: tPayMethod || null,
            fotoPerfilUri: tProfilePhoto || null,
            fotoDocUri: tDocPhoto || null,
            instagram: tInstagram || null,
            linkedin: tLinkedin || null,
            facebook: tFacebook || null,
            github: tGithub || null,
          };
          await registerTalento(payloadTal);
        } else if (flow === "empresa") {
          await registerEmpresa({
            email: eRepEmail,
            password: ePass,
            username: eRepUsername,
            nombre: eNombre,
            industria: eIndustria === "Otro" ? eIndustriaOtro : eIndustria,
            descripcion: eDesc,
            departamento: eDepto,
            ciudad: eCiudad,
            direccion: eDireccion || null,
            telefono: eTel,
            emailCorporativo: eEmail,
            web: eWeb || null,
            instagram: eIg || null,
            facebook: eFb || null,
            planFacturacion: ePlanBillingMode || null,
            planSeleccionado: eSelectedPlan || null,
            cardNum: eCardNum.trim() || null,
            cardExp: eCardExp.trim() || null,
            cardCvv: eCardCvv.trim() || null,
            repDui: eRepDui || null,
            repNombre: eRepNombre,
            repCargo: eRepCargo,
            repEmail: eRepEmail,
            repTelefono: eRepTel,
            repFacebook: toNullableString(eRepFb),
            repInstagram: toNullableString(eRepIg),
            fotoLogoUri: eLogoPhoto || null,
            fotoBannerUri: eBannerPhoto || null,
            fotoRepDuiUri: eRepDuiPhoto || null,
            fotoRepSelfieUri: eRepSelfiePhoto || null,
            fotoRepUri: eRepPhoto || null,
          });
        } else if (flow === "universidad") {
          const payloadUni: any = {
            email: uEncEmail,
            password: uPass,
            username: uUsername,
            nombre: uNombre,
            departamento: uDepto,
            ciudad: uCiudad,
            direccion: uDireccion || null,
            emailInstitucional: uEmail,
            web: uWeb || null,
            telefono: uTel,
            descripcion: uDesc || null,
            instagram: uIg || null,
            facebook: uFacebook || null,
            github: uGithub || null,
            rectorNombre: uRectorNombre,
            rectorDocTipo: uRectorDocType,
            rectorDocNumero: uRectorDocNum,
            carreras: carreras,
            encNombre: uEncNombre,
            encTelefono: uEncTel,
            encEmail: uEncEmail,
            encInstagram: uEncIg || null,
            encLinkedin: uEncLi || null,
            fotoLogoUri: uLogoPhoto || null,
            fotoBannerUri: uBannerPhoto || null,
            fotoRectorDocUri: uRectorDocPhoto || null,
            fotoRectorSelfieUri: uRectorSelfiePhoto || null,
            fotoEncUri: uEncPhoto || null,
          };
          await registerUniversidad(payloadUni);
        }
        setStep(99);
        scrollTop();
      } catch (err: any) {
        const msg: string = (err?.message ?? "").toLowerCase();
        if (
          msg.includes("already registered") ||
          msg.includes("user already registered")
        ) {
          const emailField =
            flow === "talento"
              ? "tEmail"
              : flow === "empresa"
                ? "eRepEmail"
                : "uEncEmail";
          setErr(emailField, "Este correo ya está registrado.");
          setRegisterError(
            "El correo electrónico ya está registrado. Regresa al paso 1 para corregirlo.",
          );
        } else if (
          msg.includes("profiles_username_key") ||
          (msg.includes("duplicate key") && msg.includes("username"))
        ) {
          const usernameField =
            flow === "talento"
              ? "tUsername"
              : flow === "empresa"
                ? "eRepUsername"
                : "uUsername";
          setErr(usernameField, "Este nombre de usuario ya está en uso.");
          setRegisterError(
            "El nombre de usuario ya está en uso. Regresa para elegir uno diferente.",
          );
        } else {
          setRegisterError(
            err?.message ?? "Error al crear la cuenta. Intenta de nuevo.",
          );
        }
      } finally {
        setSubmitting(false);
      }
    } else {
      setStep((s) => s + 1);
      scrollTop();
    }
  };

  // ── RENDER ─────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <AppHeader />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity
            style={s.backBtn}
            onPress={() => (step === 0 ? router.back() : goBack())}
          >
            <Text style={s.backBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Gradly</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Stepper */}
        {flow && step > 0 && step < 99 && (
          <View style={s.stepperWrap}>
            {FLOW_LABELS[flow].map((lbl, i) => {
              const num = i + 1;
              const done = num < step;
              const active = num === step;
              return (
                <React.Fragment key={lbl}>
                  <View style={s.stepperItem}>
                    <View
                      style={[
                        s.stepperCircle,
                        done && s.stepperDone,
                        active && s.stepperActive,
                      ]}
                    >
                      <Text
                        style={[
                          s.stepperCircleText,
                          (done || active) && { color: "#fff" },
                        ]}
                      >
                        {done ? "✓" : num}
                      </Text>
                    </View>
                    {/* stepper labels hidden on mobile */}
                  </View>
                  {i < FLOW_LABELS[flow].length - 1 && (
                    <View
                      style={[
                        s.stepperConnector,
                        done && { backgroundColor: C.accent },
                      ]}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </View>
        )}

        <View style={s.card}>
          {/* ── SUCCESS SCREEN ── */}
          {step === 99 && (
            <View style={s.successScreen}>
              <Text style={s.successIcon}>🎉</Text>
              <Text style={s.successTitle}>
                {flow === "talento"
                  ? `¡Bienvenido a Gradly, ${tNombre.split(" ")[0] || ""}!`
                  : flow === "empresa"
                    ? `¡Empresa registrada, ${eNombre || ""}!`
                    : `¡Institución registrada, ${uNombre || ""}!`}
              </Text>
              <Text style={s.successDesc}>
                {flow === "talento"
                  ? "Tu cuenta ha sido creada exitosamente."
                  : "Tu cuenta está en revisión. Te notificaremos en 24–48 horas."}
              </Text>
              <TouchableOpacity
                style={[
                  s.btnPrimary,
                  { marginTop: 24, alignSelf: "center", paddingHorizontal: 32 },
                ]}
                onPress={() =>
                  flow === "universidad"
                    ? router.replace("/dashboard-universidad" as any)
                    : router.replace("/(tabs)/" as any)
                }
              >
                <Text style={s.btnPrimaryText}>Ir a mi panel →</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── STEP 0: ROLE PICKER ── */}
          {step === 0 && (
            <View>
              <Text style={s.stepTitle}>¿Cómo usarás Gradly?</Text>
              <Text style={s.stepSubtitle}>
                Elige el perfil que mejor te describe
              </Text>
              <View style={s.roleCards}>
                {[
                  {
                    id: "talento" as Flow,
                    icon: "🎓",
                    title: "Joven Talento",
                    desc: "Soy estudiante activo, recién graduado, o busco mi primer empleo",
                  },
                  {
                    id: "empresa" as Flow,
                    icon: "🏢",
                    title: "Empresa",
                    desc: "Represento una empresa que quiere publicar vacantes",
                  },
                  {
                    id: "universidad" as Flow,
                    icon: "🏛️",
                    title: "Universidad",
                    desc: "Represento una institución universitaria",
                  },
                ].map((r) => (
                  <TouchableOpacity
                    key={r.id as string}
                    style={s.roleCard}
                    onPress={() => selectRole(r.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={s.roleIcon}>{r.icon}</Text>
                    <Text style={s.roleTitle}>{r.title}</Text>
                    <Text style={s.roleDesc}>{r.desc}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* ════════════════════════
              FLUJO TALENTO
          ════════════════════════ */}
          {flow === "talento" && step === 1 && (
            <View>
              <Text style={s.stepTitle}>Datos Personales</Text>
              <Text style={s.stepSubtitle}>Completa tu información básica</Text>
              <View style={s.grid2}>
                <FloatInput
                  label="Nombre completo"
                  value={tNombre}
                  onChangeText={(v) => {
                    setTNombre(v);
                    if (!v.trim()) {
                      clearErr("tNombre");
                      return;
                    }
                    if (!isOnlyLettersSpaces(v))
                      setErr("tNombre", "Solo letras mayúsculas y minúsculas");
                    else clearErr("tNombre");
                  }}
                  style={{ flex: 1 }}
                  error={errors.tNombre}
                />
                <FloatInput
                  label="Nombre de usuario"
                  value={tUsername}
                  onChangeText={(v) => {
                    setTUsername(v);
                    const u = v.trim();
                    if (!u) {
                      clearErr("tUsername");
                      return;
                    }
                    if (u.length < 3 || u.length > 30)
                      setErr("tUsername", "Debe tener entre 3 y 30 caracteres");
                    else if (!/^[a-zA-Z0-9_.]+$/.test(u))
                      setErr("tUsername", "Solo letras, números, _ y .");
                    else if (u.startsWith(".") || u.endsWith("."))
                      setErr(
                        "tUsername",
                        "No puede empezar o terminar con un punto",
                      );
                    else if (u.includes(".."))
                      setErr("tUsername", "No se permiten puntos consecutivos");
                    else if (TAKEN_USERS.includes(u.toLowerCase()))
                      setErr("tUsername", "Usuario no disponible");
                    else clearErr("tUsername");
                  }}
                  style={{ flex: 1 }}
                  error={errors.tUsername}
                />
              </View>
              <View style={s.grid2}>
                <FloatInput
                  label="Correo electrónico"
                  value={tEmail}
                  onChangeText={(v) => {
                    setTEmail(v);
                    if (!v.trim()) {
                      clearErr("tEmail");
                      return;
                    }
                    if (!isEmail(v))
                      setErr("tEmail", "Ingresa un correo válido");
                    else clearErr("tEmail");
                  }}
                  keyboardType="email-address"
                  style={{ flex: 1 }}
                  error={errors.tEmail}
                />
                <FloatInput
                  label="Teléfono"
                  value={tPhone}
                  onChangeText={makePhoneHandler(setTPhone, "tPhone")}
                  keyboardType="phone-pad"
                  style={{ flex: 1 }}
                  error={errors.tPhone}
                />
              </View>
              <View style={s.phoneInfoNote}>
                <Text style={s.phoneInfoText}>
                  📞 Solo se admiten números de El Salvador (+503) · 8 dígitos ·
                  formato XXXX XXXX
                </Text>
              </View>
              <SelectInput
                label="Departamento"
                value={tDepto}
                options={deptoOptions}
                onChange={(v) => {
                  setTDepto(v);
                  setTCiudad("");
                }}
                error={errors.tDepto}
              />
              <SelectInput
                label="Ciudad"
                value={tCiudad}
                options={tCiudadOptions}
                onChange={setTCiudad}
                error={errors.tCiudad}
              />
              <FloatInput
                label="Bio (máx. 300 caracteres)"
                value={tBio}
                onChangeText={(v) => {
                  setTBio(v);
                  if (!v.trim()) {
                    clearErr("tBio");
                    return;
                  }
                  if (/[^a-zA-ZÀ-ÿ0-9\s.,;:]/.test(v))
                    setErr("tBio", "No se permiten caracteres especiales");
                  else clearErr("tBio");
                }}
                multiline
                maxLength={300}
                error={errors.tBio}
              />
              <SectionLabel>Redes sociales (opcionales)</SectionLabel>
              <FloatInput
                label="Instagram (instagram.com/…)"
                value={tInstagram}
                onChangeText={(v) => {
                  setTInstagram(v);
                  if (v.trim() && !v.includes("instagram.com/"))
                    setErr("tInstagram", "Debe incluir instagram.com/");
                  else clearErr("tInstagram");
                }}
                error={errors.tInstagram}
              />
              <FloatInput
                label="LinkedIn (linkedin.com/in/…)"
                value={tLinkedin}
                onChangeText={(v) => {
                  setTLinkedin(v);
                  if (v.trim() && !v.includes("linkedin.com/"))
                    setErr("tLinkedin", "Debe incluir linkedin.com/");
                  else clearErr("tLinkedin");
                }}
                error={errors.tLinkedin}
              />
              <FloatInput
                label="Facebook (facebook.com/…)"
                value={tFacebook}
                onChangeText={(v) => {
                  setTFacebook(v);
                  if (v.trim() && !v.includes("facebook.com/"))
                    setErr("tFacebook", "Debe incluir facebook.com/");
                  else clearErr("tFacebook");
                }}
                error={errors.tFacebook}
              />
              <FloatInput
                label="GitHub (github.com/…)"
                value={tGithub}
                onChangeText={(v) => {
                  setTGithub(v);
                  if (v.trim() && !v.includes("github.com/"))
                    setErr("tGithub", "Debe incluir github.com/");
                  else clearErr("tGithub");
                }}
                error={errors.tGithub}
              />
              {/* Behance removed per request */}
              <SectionLabel>Idiomas</SectionLabel>
              {tLanguages.map((lang, idx) => (
                <View key={idx} style={s.langRow}>
                  <SelectInput
                    label="Idioma"
                    value={lang.name}
                    options={IDIOMAS}
                    onChange={(v) => {
                      const l = [...tLanguages];
                      l[idx].name = v;
                      setTLanguages(l);
                    }}
                    style={{ flex: 1 }}
                  />
                  <SelectInput
                    label="Nivel"
                    value={lang.level}
                    options={NIVELES}
                    onChange={(v) => {
                      const l = [...tLanguages];
                      l[idx].level = v;
                      setTLanguages(l);
                    }}
                    style={{ flex: 1 }}
                  />
                  {tLanguages.length > 1 && (
                    <TouchableOpacity
                      onPress={() =>
                        setTLanguages(tLanguages.filter((_, i) => i !== idx))
                      }
                      style={s.removeLang}
                    >
                      <Text style={{ color: C.red }}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              <TouchableOpacity
                style={s.addBtn}
                onPress={() =>
                  setTLanguages([...tLanguages, { name: "", level: "" }])
                }
              >
                <Text style={s.addBtnText}>+ Agregar idioma</Text>
              </TouchableOpacity>
              <SectionLabel>Habilidades</SectionLabel>
              <FloatInput
                label="Describe tus habilidades"
                value={tSkills}
                onChangeText={(v) => {
                  setTSkills(v);
                  if (!v.trim()) {
                    clearErr("tSkills");
                    return;
                  }
                  if (/[^a-zA-ZÀ-ÿ\s,.]/.test(v))
                    setErr("tSkills", "No se permiten caracteres especiales");
                  else clearErr("tSkills");
                }}
                error={errors.tSkills}
              />
              <StepNav onBack={goBack} onNext={nextStep} />
            </View>
          )}

          {flow === "talento" && step === 2 && (
            <View>
              <Text style={s.stepTitle}>Identidad y Verificación</Text>
              <Text style={s.stepSubtitle}>
                Necesitamos verificar tu identidad
              </Text>
              <SectionLabel>Foto de perfil</SectionLabel>
              <UploadZone
                label="Subir foto de perfil"
                icon="👤"
                imageUri={tProfilePhoto}
                onPress={() => pickImage(setTProfilePhoto)}
              />
              <SectionLabel>Tipo de documento</SectionLabel>
              <View style={s.docTypeRow}>
                {(["dui", "pasaporte", "licencia"] as DocType[]).map((dt) => (
                  <TouchableOpacity
                    key={dt}
                    style={[
                      s.docTypeBtn,
                      tDocType === dt && s.docTypeBtnActive,
                    ]}
                    onPress={() => {
                      setTDocType(dt);
                      setTDocNum("");
                    }}
                  >
                    <Text
                      style={[
                        s.docTypeBtnText,
                        tDocType === dt && { color: C.accent70 },
                      ]}
                    >
                      {dt.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <FloatInput
                label="Número del documento"
                value={tDocNum}
                onChangeText={(v) => {
                  const rule = getDocRule(tDocType);
                  let val = rule.upper ? v.toUpperCase() : v;
                  if (val.length > rule.maxLen) val = val.slice(0, rule.maxLen);
                  setTDocNum(val);
                  if (
                    val.trim() &&
                    val.length >= rule.maxLen &&
                    !rule.pattern.test(val)
                  )
                    setErr("tDocNum", rule.hint);
                  else clearErr("tDocNum");
                }}
                maxLength={getDocRule(tDocType).maxLen}
                error={errors.tDocNum}
              />
              <Text
                style={{
                  color: C.textMuted,
                  fontSize: 12,
                  marginTop: -10,
                  marginBottom: 14,
                }}
              >
                {getDocRule(tDocType).hint}
              </Text>
              <SectionLabel>Imagen del documento</SectionLabel>
              <UploadZone
                label="Subir imagen del documento"
                icon="🪪"
                imageUri={tDocPhoto}
                onPress={() => pickImage(setTDocPhoto)}
              />
              <InfoNote>
                🔒 Tu documento es verificado por nuestro equipo y nunca es
                compartido públicamente.
              </InfoNote>
              <StepNav onBack={goBack} onNext={nextStep} />
            </View>
          )}

          {flow === "talento" && step === 3 && (
            <View>
              <Text style={s.stepTitle}>Perfil Profesional</Text>
              <Text style={s.stepSubtitle}>
                Cuéntanos sobre tu formación académica
              </Text>
              <AutocompleteInput
                label="Universidad o institución"
                value={tUniv}
                options={UNIVERSIDADES}
                onSelect={(v) => {
                  setTUniv(v);
                  setTArea("");
                }}
                error={errors.tUniv}
              />
              <SelectInput
                label="Área de especialización"
                value={tArea}
                options={UNIV_CARRERAS[tUniv] ?? AREAS}
                onChange={setTArea}
                error={errors.tArea}
              />
              {!showSecondCareer ? (
                <TouchableOpacity
                  style={s.addBtn}
                  onPress={() => setShowSecondCareer(true)}
                >
                  <Text style={s.addBtnText}>+ Agregar segunda carrera</Text>
                </TouchableOpacity>
              ) : (
                <View style={s.secondCareer}>
                  <View style={s.secondCareerHeader}>
                    <Text style={s.secondCareerLabel}>Segunda carrera</Text>
                    <TouchableOpacity
                      onPress={() => {
                        setShowSecondCareer(false);
                        setTUniv2("");
                        setTArea2("");
                      }}
                    >
                      <Text style={{ color: C.red }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  <AutocompleteInput
                    label="Universidad o institución"
                    value={tUniv2}
                    options={UNIVERSIDADES}
                    onSelect={(v) => {
                      setTUniv2(v);
                      setTArea2("");
                    }}
                  />
                  <SelectInput
                    label="Área de especialización"
                    value={tArea2}
                    options={UNIV_CARRERAS[tUniv2] ?? AREAS}
                    onChange={setTArea2}
                  />
                </View>
              )}
              <SectionLabel>Cursos, certificaciones (opcional)</SectionLabel>
              <FloatInput
                label="Describe cursos, certificaciones u otros estudios"
                value={tOtroEstudio}
                onChangeText={setTOtroEstudio}
                multiline
                maxLength={500}
              />
              <StepNav onBack={goBack} onNext={nextStep} />
            </View>
          )}

          {flow === "talento" && step === 4 && (
            <View>
              <Text style={s.stepTitle}>Método de Pago</Text>
              <Text style={s.stepSubtitle}>
                Información importante sobre pagos
              </Text>
              <InfoNote>
                <Text
                  style={{
                    fontWeight: "700",
                    color: C.text,
                    fontSize: 14,
                    marginBottom: 12,
                  }}
                >
                  Términos y Condiciones de Pago
                </Text>
                <Text
                  style={{ color: C.textSub, lineHeight: 22, fontSize: 13 }}
                >
                  De conformidad con los términos y condiciones de la plataforma
                  Gradly, todos los pagos entre empresas y trabajadores se
                  gestionan de forma cerrada y directa entre ambas partes. Esto
                  significa que la plataforma actúa como verificadora de
                  identidad y facilitadora del contacto, pero el sistema de pago
                  es manejado exclusivamente por la empresa contratante y el
                  trabajador, sin intermediación de Gradly.{"\n\n"}
                  Nuestro modelo garantiza protección a ambas partes mediante
                  verificación de perfiles, pero respeta la autonomía en la
                  negociación de términos de pago y métodos de cancelación. No
                  requerimos que registres un método de pago en este momento del
                  registro.{"\n\n"}
                  Una vez que recibas una oferta de empleo desde una empresa
                  verificada, ella se pondrá en contacto directo contigo para
                  acordar los términos de pago, la forma de cancelación y
                  cualquier otra condición laboral específica. La empresa será
                  responsable de comunicarse contigo a través de los canales que
                  proporcionaste en tu perfil.{"\n\n"}
                  Si tienes preguntas sobre cómo funciona nuestro sistema de
                  pagos, el proceso de verificación de empresas, o cualquier
                  otro aspecto relacionado con transacciones económicas en la
                  plataforma, te invitamos a consultar nuestro centro de ayuda o
                  ponerte en contacto con nuestro equipo de soporte.
                </Text>
              </InfoNote>
              <StepNav onBack={goBack} onNext={nextStep} />
            </View>
          )}

          {flow === "talento" && step === 5 && (
            <View>
              <Text style={s.stepTitle}>Seguridad</Text>
              <Text style={s.stepSubtitle}>
                Crea una contraseña segura para tu cuenta
              </Text>
              <PasswordField
                label="Contraseña"
                value={tPass}
                onChange={setTPass}
                error={errors.tPass}
              />
              <ConfirmPassField
                value={tPass2}
                onChange={setTPass2}
                error={errors.tPass2}
              />
              <TouchableOpacity
                style={s.termsRow}
                onPress={() => setTTerms((v) => !v)}
              >
                <View style={[s.checkbox, tTerms && s.checkboxChecked]}>
                  {tTerms && <Text style={s.checkmark}>✓</Text>}
                </View>
                <Text style={s.termsText}>
                  Acepto los{" "}
                  <Text style={{ color: C.accent70 }}>
                    Términos y Condiciones
                  </Text>{" "}
                  y la{" "}
                  <Text style={{ color: C.accent70 }}>
                    Política de Privacidad
                  </Text>{" "}
                  de Gradly.
                </Text>
              </TouchableOpacity>
              {errors.tTerms && <Text style={s.errText}>{errors.tTerms}</Text>}
              {!!registerError && (
                <View style={s.registerErrorBox}>
                  <Text style={s.registerErrorText}>{registerError}</Text>
                </View>
              )}
              <StepNav
                onBack={goBack}
                onNext={nextStep}
                nextLabel="Crear mi cuenta →"
                loading={submitting}
              />
            </View>
          )}

          {/* ════════════════════════
              FLUJO EMPRESA
          ════════════════════════ */}
          {flow === "empresa" && step === 1 && (
            <View>
              <Text style={s.stepTitle}>Información de la Empresa</Text>
              <Text style={s.stepSubtitle}>
                Datos oficiales de tu organización
              </Text>
              <FloatInput
                label="Nombre oficial de la empresa"
                value={eNombre}
                onChangeText={(v) => {
                  setENombre(v);
                  if (!v.trim()) {
                    clearErr("eNombre");
                    return;
                  }
                  if (/[^a-zA-Z\u00C0-\u00FF0-9\s]/.test(v))
                    setErr("eNombre", "Solo letras y números");
                  else if (v.length < 2)
                    setErr("eNombre", "Mínimo 2 caracteres");
                  else clearErr("eNombre");
                }}
                error={errors.eNombre}
              />
              <SelectInput
                label="Industria o sector"
                value={eIndustria}
                options={INDUSTRIAS}
                onChange={(v) => {
                  setEIndustria(v);
                  if (v !== "Otro") setEIndustriaOtro("");
                  clearErr("eIndustria");
                }}
                error={errors.eIndustria}
              />
              {eIndustria === "Otro" && (
                <FloatInput
                  label="Especifica la industria"
                  value={eIndustriaOtro}
                  onChangeText={(v) => {
                    setEIndustriaOtro(v);
                    if (!v.trim()) {
                      clearErr("eIndustriaOtro");
                      return;
                    }
                    if (/[^a-zA-Z\u00C0-\u00FF\s,;.:]/.test(v))
                      setErr(
                        "eIndustriaOtro",
                        "Solo letras y los caracteres , ; . :",
                      );
                    else clearErr("eIndustriaOtro");
                  }}
                  error={errors.eIndustriaOtro}
                />
              )}
              <FloatInput
                label="Descripción de la empresa"
                value={eDesc}
                onChangeText={(v) => {
                  setEDesc(v);
                  if (!v.trim()) {
                    clearErr("eDesc");
                    return;
                  }
                  if (/[^a-zA-Z\u00C0-\u00FF0-9\s.,;:]/.test(v))
                    setErr("eDesc", "No se permiten caracteres especiales");
                  else clearErr("eDesc");
                }}
                multiline
                maxLength={500}
                error={errors.eDesc}
              />
              <SelectInput
                label="Departamento"
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
                label="Ciudad"
                value={eCiudad}
                options={eCiudadOptions}
                onChange={(v) => {
                  setECiudad(v);
                  clearErr("eCiudad");
                }}
                error={errors.eCiudad}
              />
              <FloatInput
                label="Dirección"
                value={eDireccion}
                onChangeText={(v) => {
                  setEDireccion(v);
                  if (!v.trim()) {
                    clearErr("eDireccion");
                    return;
                  }
                  if (/[^a-zA-ZÀ-ÿ0-9\s#.,;:]/.test(v))
                    setErr(
                      "eDireccion",
                      "Solo letras, números y los caracteres # . , ; :",
                    );
                  else clearErr("eDireccion");
                }}
                error={errors.eDireccion}
              />
              <FloatInput
                label="Teléfono (ej: +503 2345 6789)"
                value={eTel}
                onChangeText={makePhoneHandler(setETel, "eTel")}
                keyboardType="phone-pad"
                error={errors.eTel}
              />
              <View style={s.grid2}>
                <FloatInput
                  label="Correo corporativo"
                  value={eEmail}
                  onChangeText={(v) => {
                    setEEmail(v);
                    if (!v.trim()) {
                      clearErr("eEmail");
                      return;
                    }
                    if (!isEmail(v))
                      setErr("eEmail", "Ingresa un correo válido");
                    else clearErr("eEmail");
                  }}
                  keyboardType="email-address"
                  style={{ flex: 1 }}
                  error={errors.eEmail}
                />
                <FloatInput
                  label="Sitio web"
                  value={eWeb}
                  onChangeText={(v) => {
                    setEWeb(v);
                    if (!v.trim()) {
                      clearErr("eWeb");
                      return;
                    }
                    const testUrl = /^https?:\/\//.test(v.trim())
                      ? v.trim()
                      : `https://${v.trim()}`;
                    if (!/^https?:\/\/.+\..+/.test(testUrl))
                      setErr("eWeb", "URL inválida (ej: https://empresa.com)");
                    else clearErr("eWeb");
                  }}
                  keyboardType="url"
                  style={{ flex: 1 }}
                  error={errors.eWeb}
                />
              </View>
              <SectionLabel>Redes sociales (opcionales)</SectionLabel>
              <FloatInput
                label="Instagram"
                value={eIg}
                onChangeText={(v) => {
                  setEIg(v);
                  if (v.trim() && !v.includes("instagram.com/"))
                    setErr("eIg", "Debe incluir instagram.com/");
                  else clearErr("eIg");
                }}
                error={errors.eIg}
              />
              <FloatInput
                label="Facebook"
                value={eFb}
                onChangeText={(v) => {
                  setEFb(v);
                  if (v.trim() && !v.includes("facebook.com/"))
                    setErr("eFb", "Debe incluir facebook.com/");
                  else clearErr("eFb");
                }}
                error={errors.eFb}
              />
              {/* TikTok removed — use Facebook field above */}
              <StepNav onBack={goBack} onNext={nextStep} />
            </View>
          )}

          {flow === "empresa" && step === 2 && (
            <View>
              <Text style={s.stepTitle}>Identidad Visual</Text>
              <Text style={s.stepSubtitle}>Logo y banner de tu empresa</Text>
              <SectionLabel>Logo</SectionLabel>
              <UploadZone
                label="Subir logo de la empresa"
                icon="🏢"
                imageUri={eLogoPhoto}
                onPress={() => pickImage(setELogoPhoto)}
                error={errors.eLogoPhoto}
              />
              <SectionLabel>Banner (16:9)</SectionLabel>
              <UploadZone
                label="Subir banner de la empresa"
                icon="🖼️"
                imageUri={eBannerPhoto}
                onPress={() => pickImage(setEBannerPhoto)}
                error={errors.eBannerPhoto}
              />
              <InfoNote>
                📸 Estos archivos serán visibles en tu perfil de empresa en
                Gradly.
              </InfoNote>
              <StepNav onBack={goBack} onNext={nextStep} />
            </View>
          )}

          {flow === "empresa" && step === 3 && (
            <View>
              <Text style={s.stepTitle}>Verificación de documento de identidad</Text>
              <Text style={s.stepSubtitle}>
                Ingresa tu documento de identidad
              </Text>
              <FloatInput
                label="Número de DUI del representante"
                value={eRepDui}
                onChangeText={(v) => {
                  const cleaned = v.replace(/\D/g, "").slice(0, 9);
                  setERepDui(cleaned);
                  if (!cleaned) {
                    clearErr("eRepDui");
                    return;
                  }
                  if (!/^\d{8,9}$/.test(cleaned))
                    setErr("eRepDui", "DUI: 8–9 dígitos numéricos");
                  else clearErr("eRepDui");
                }}
                keyboardType="numeric"
                maxLength={9}
                error={errors.eRepDui}
              />
              <SectionLabel>Imagen del DUI del representante</SectionLabel>
              <UploadZone
                label="Subir imagen del DUI"
                icon="🪪"
                imageUri={eRepDuiPhoto}
                onPress={() => pickImage(setERepDuiPhoto)}
              />
              <SectionLabel>Selfie de verificación</SectionLabel>
              <UploadZone
                label="Selfie del representante"
                icon="🤳"
                imageUri={eRepSelfiePhoto}
                onPress={() => pickImage(setERepSelfiePhoto)}
              />
              <InfoNote>
                🔍 Esta imagen la revisa nuestro equipo. No es pública.
              </InfoNote>
              <View style={s.statusBadge}>
                <Text style={s.statusBadgeText}>
                  ⏳ Tu cuenta estará en revisión 24–48 horas
                </Text>
              </View>
              <StepNav onBack={goBack} onNext={nextStep} />
            </View>
          )}

          {flow === "empresa" && step === 4 && (
            <View>
              <Text style={s.stepTitle}>Plan de Suscripción</Text>
              <Text style={s.stepSubtitle}>
                Elige el plan que mejor se adapte a tus necesidades
              </Text>

              {/* Subscription Info */}
              <InfoNote>
                <Text
                  style={{
                    fontWeight: "700",
                    color: C.text,
                    fontSize: 14,
                    marginBottom: 8,
                  }}
                >
                  Planes de Suscripción Disponibles
                </Text>
                <Text
                  style={{ color: C.textSub, lineHeight: 20, fontSize: 12 }}
                >
                  Gradly ofrece dos planes de suscripción que se adaptan a
                  empresas de cualquier tamaño. Los planes incluyen acceso a
                  herramientas de reclutamiento, gestión de candidatos y
                  comunicación directa con talentos verificados. Selecciona el
                  plan que mejor se ajuste a tus necesidades y elige si
                  prefieres facturación mensual o anual.
                </Text>
              </InfoNote>

              {/* Billing Toggle */}
              <View
                style={{
                  flexDirection: "row",
                  marginBottom: 20,
                  justifyContent: "center",
                  gap: 10,
                }}
              >
                <TouchableOpacity
                  style={[
                    {
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 8,
                      backgroundColor:
                        ePlanBillingMode === "monthly" ? C.accent : C.surface,
                      borderWidth: 1,
                      borderColor:
                        ePlanBillingMode === "monthly"
                          ? C.accent
                          : "rgba(139,92,246,0.30)",
                    },
                  ]}
                  onPress={() => setEPlanBillingMode("monthly")}
                >
                  <Text
                    style={{
                      color: ePlanBillingMode === "monthly" ? "#fff" : C.text,
                      fontWeight:
                        ePlanBillingMode === "monthly" ? "700" : "500",
                      fontSize: 13,
                    }}
                  >
                    Pago Mensual
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    {
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 8,
                      backgroundColor:
                        ePlanBillingMode === "annual" ? C.accent : C.surface,
                      borderWidth: 1,
                      borderColor:
                        ePlanBillingMode === "annual"
                          ? C.accent
                          : "rgba(139,92,246,0.30)",
                    },
                  ]}
                  onPress={() => setEPlanBillingMode("annual")}
                >
                  <Text
                    style={{
                      color: ePlanBillingMode === "annual" ? "#fff" : C.text,
                      fontWeight: ePlanBillingMode === "annual" ? "700" : "500",
                      fontSize: 13,
                    }}
                  >
                    Pago Anual
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Plans */}
              <View style={{ marginBottom: 20 }}>
                {/* Free Trial Plan */}
                <TouchableOpacity
                  style={[
                    {
                      borderWidth: 2,
                      borderColor:
                        eSelectedPlan === "free" ? C.green : C.border,
                      borderRadius: 12,
                      padding: 16,
                      backgroundColor:
                        eSelectedPlan === "free"
                          ? "rgba(34, 197, 94, 0.08)"
                          : C.surface,
                      marginBottom: 12,
                    },
                  ]}
                  onPress={() => {
                    setESelectedPlan("free");
                    setEPayMethod("");
                  }}
                  activeOpacity={0.7}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: 12,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 18,
                          fontWeight: "700",
                          color: C.text,
                        }}
                      >
                        Prueba Gratuita
                      </Text>
                      <Text
                        style={{
                          fontSize: 12,
                          color: C.textMuted,
                          marginTop: 4,
                        }}
                      >
                        Inicio sin costo para nuevas empresas
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text
                        style={{
                          fontSize: 22,
                          fontWeight: "700",
                          color: C.green,
                        }}
                      >
                        $0
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: C.textMuted,
                          fontWeight: "500",
                        }}
                      >
                        prueba gratuita
                      </Text>
                    </View>
                  </View>
                  <View
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: "rgba(139,92,246,0.25)",
                      paddingTop: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color: C.textMuted,
                        marginBottom: 8,
                        fontWeight: "600",
                      }}
                    >
                      Incluye:
                    </Text>
                    <Text
                      style={{ fontSize: 12, color: C.text, marginBottom: 6 }}
                    >
                      ✓ Hasta 3 vacantes activas simultáneamente
                    </Text>
                    <Text
                      style={{ fontSize: 12, color: C.text, marginBottom: 6 }}
                    >
                      ✓ Hasta 1 vacante con horario visible de horas laborales
                    </Text>
                    <Text
                      style={{ fontSize: 12, color: C.text, marginBottom: 6 }}
                    >
                      ✓ Sin badge verificado ni reporte premium
                    </Text>
                    <Text style={{ fontSize: 12, color: C.text }}>
                      ✓ No requiere método de pago
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Basic Plan */}
                <TouchableOpacity
                  style={[
                    {
                      borderWidth: 2,
                      borderColor:
                        eSelectedPlan === "basic" ? C.green : C.border,
                      borderRadius: 12,
                      padding: 16,
                      backgroundColor:
                        eSelectedPlan === "basic"
                          ? "rgba(34, 197, 94, 0.08)"
                          : C.surface,
                      marginBottom: 12,
                    },
                  ]}
                  onPress={() => setESelectedPlan("basic")}
                  activeOpacity={0.7}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: 12,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 18,
                          fontWeight: "700",
                          color: C.text,
                        }}
                      >
                        Plan Básico
                      </Text>
                      <Text
                        style={{
                          fontSize: 12,
                          color: C.textMuted,
                          marginTop: 4,
                        }}
                      >
                        Ideal para empresas iniciando
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text
                        style={{
                          fontSize: 22,
                          fontWeight: "700",
                          color: C.green,
                        }}
                      >
                        ${ePlanBillingMode === "monthly" ? "4.99" : "59.99"}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: C.textMuted,
                          fontWeight: "500",
                        }}
                      >
                        {ePlanBillingMode === "monthly" ? "/mes" : "/año"}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: "rgba(139,92,246,0.25)",
                      paddingTop: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color: C.textMuted,
                        marginBottom: 8,
                        fontWeight: "600",
                      }}
                    >
                      Incluye:
                    </Text>
                    <Text
                      style={{ fontSize: 12, color: C.text, marginBottom: 6 }}
                    >
                      ✓ Hasta 5 vacantes activas simultáneamente
                    </Text>
                    <Text
                      style={{ fontSize: 12, color: C.text, marginBottom: 6 }}
                    >
                      ✓ Búsqueda y filtrado básico de candidatos
                    </Text>
                    <Text style={{ fontSize: 12, color: C.text }}>
                      ✓ Soporte técnico por email
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Premium Plan */}
                <TouchableOpacity
                  style={[
                    {
                      borderWidth: 2,
                      borderColor:
                        eSelectedPlan === "premium" ? C.green : C.border,
                      borderRadius: 12,
                      padding: 16,
                      backgroundColor:
                        eSelectedPlan === "premium"
                          ? "rgba(34, 197, 94, 0.08)"
                          : C.surface,
                    },
                  ]}
                  onPress={() => setESelectedPlan("premium")}
                  activeOpacity={0.7}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: 12,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 18,
                          fontWeight: "700",
                          color: C.text,
                        }}
                      >
                        Premium + Verificado
                      </Text>
                      <Text
                        style={{
                          fontSize: 12,
                          color: C.textMuted,
                          marginTop: 4,
                        }}
                      >
                        Para empresas en crecimiento
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text
                        style={{
                          fontSize: 22,
                          fontWeight: "700",
                          color: C.green,
                        }}
                      >
                        ${ePlanBillingMode === "monthly" ? "14.99" : "179.99"}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: C.textMuted,
                          fontWeight: "500",
                        }}
                      >
                        {ePlanBillingMode === "monthly" ? "/mes" : "/año"}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: "rgba(139,92,246,0.25)",
                      paddingTop: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color: C.textMuted,
                        marginBottom: 8,
                        fontWeight: "600",
                      }}
                    >
                      Incluye todo del Plan Básico, más:
                    </Text>
                    <Text
                      style={{ fontSize: 12, color: C.text, marginBottom: 6 }}
                    >
                      ✓ Vacantes ilimitadas
                    </Text>
                    <Text
                      style={{ fontSize: 12, color: C.text, marginBottom: 6 }}
                    >
                      ✓ Búsqueda avanzada y análisis predictivo de candidatos
                    </Text>
                    <Text
                      style={{ fontSize: 12, color: C.text, marginBottom: 6 }}
                    >
                      ✓ Perfil de empresa verificado con badge de confianza
                    </Text>
                    <View
                      style={{
                        borderTopWidth: 1,
                        borderTopColor: "rgba(139,92,246,0.15)",
                        marginTop: 8,
                        paddingTop: 8,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          color: C.accent70,
                          marginBottom: 6,
                          fontWeight: "600",
                        }}
                      >
                        Beneficios exclusivos Premium:
                      </Text>
                      <Text
                        style={{ fontSize: 12, color: C.text, marginBottom: 6 }}
                      >
                        ⭐ Soporte prioritario 24/7
                      </Text>
                      <Text
                        style={{ fontSize: 12, color: C.text, marginBottom: 6 }}
                      >
                        ⭐ Reportes y análisis detallados de contratación
                      </Text>
                      <Text style={{ fontSize: 12, color: C.text }}>
                        ⭐ Integración con redes sociales y herramientas CRM
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </View>

              {!eSelectedPlan && (
                <Text
                  style={{
                    color: C.red,
                    fontSize: 12,
                    marginBottom: 12,
                    textAlign: "center",
                  }}
                >
                  ⚠️ Selecciona un plan para continuar
                </Text>
              )}

              {/* Payment Button */}
              {eSelectedPlan === "free" ? (
                <View
                  style={{
                    marginBottom: 16,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: C.green,
                    borderRadius: 12,
                    backgroundColor: "rgba(34, 197, 94, 0.08)",
                  }}
                >
                  <Text
                    style={{
                      color: C.text,
                      fontWeight: "700",
                      marginBottom: 6,
                    }}
                  >
                    Has seleccionado Prueba Gratuita
                  </Text>
                  <Text style={{ color: C.textMuted, fontSize: 12 }}>
                    No se requiere método de pago. Continúa al siguiente paso
                    para completar tu registro.
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[
                    s.btnPrimary,
                    {
                      flex: 0,
                      height: 50,
                      opacity: !eSelectedPlan ? 0.5 : 1,
                      marginBottom: 10,
                    },
                  ]}
                  onPress={() => {
                    if (eSelectedPlan) setShowEPaymentModal(true);
                  }}
                  disabled={!eSelectedPlan}
                >
                  <Text style={s.btnPrimaryText}>
                    Configurar Método de Pago →
                  </Text>
                </TouchableOpacity>
              )}

              <StepNav onBack={goBack} onNext={nextStep} />
            </View>
          )}

          {flow === "empresa" && step === 5 && (
            <View>
              <Text style={s.stepTitle}>Representante y Seguridad</Text>
              <Text style={s.stepSubtitle}>
                Datos del responsable de la cuenta
              </Text>
              <View style={s.grid2}>
                <FloatInput
                  label="Nombre completo"
                  value={eRepNombre}
                  onChangeText={(v) => {
                    setERepNombre(v);
                    if (!v.trim()) {
                      clearErr("eRepNombre");
                      return;
                    }
                    if (!isOnlyLettersSpaces(v))
                      setErr("eRepNombre", "Solo letras y espacios");
                    else clearErr("eRepNombre");
                  }}
                  style={{ flex: 1 }}
                  error={errors.eRepNombre}
                />
                <FloatInput
                  label="Cargo en la empresa"
                  value={eRepCargo}
                  onChangeText={(v) => {
                    setERepCargo(v);
                    if (!v.trim()) {
                      clearErr("eRepCargo");
                      return;
                    }
                    if (/[^a-zA-ZÀ-ÿ\s,.]/.test(v))
                      setErr("eRepCargo", "Solo letras, comas y puntos");
                    else clearErr("eRepCargo");
                  }}
                  style={{ flex: 1 }}
                  error={errors.eRepCargo}
                />
              </View>
              <View style={s.grid2}>
                <FloatInput
                  label="Correo personal"
                  value={eRepEmail}
                  onChangeText={(v) => {
                    setERepEmail(v);
                    if (!v.trim()) {
                      clearErr("eRepEmail");
                      return;
                    }
                    if (!isEmail(v))
                      setErr("eRepEmail", "Ingresa un correo válido");
                    else clearErr("eRepEmail");
                  }}
                  keyboardType="email-address"
                  style={{ flex: 1 }}
                  error={errors.eRepEmail}
                />
                <FloatInput
                  label="Teléfono"
                  value={eRepTel}
                  onChangeText={makePhoneHandler(setERepTel, "eRepTel")}
                  keyboardType="phone-pad"
                  style={{ flex: 1 }}
                  error={errors.eRepTel}
                />
              </View>
              <SectionLabel>Foto del representante</SectionLabel>
              <UploadZone
                label="Foto del representante"
                icon="👤"
                imageUri={eRepPhoto}
                onPress={() => pickImage(setERepPhoto)}
                error={errors.eRepPhoto}
              />
              <FloatInput
                label="Nombre de usuario"
                value={eRepUsername}
                onChangeText={(v) => {
                  setERepUsername(v);
                  if (!v) {
                    clearErr("eRepUsername");
                    return;
                  }
                  if (!/^[a-zA-Z0-9$_.]+$/.test(v))
                    setErr("eRepUsername", "Solo letras, números, $, _ y .");
                  else if (v.length < 4)
                    setErr("eRepUsername", "Mínimo 4 caracteres");
                  else if (TAKEN_USERS.includes(v.toLowerCase()))
                    setErr("eRepUsername", "Usuario no disponible");
                  else clearErr("eRepUsername");
                }}
                error={errors.eRepUsername}
              />
              <PasswordField
                label="Contraseña"
                value={ePass}
                onChange={(v) => {
                  setEPass(v);
                  if (v && getPassScore(v) < 2)
                    setErr("ePass", "La contraseña es demasiado débil.");
                  else clearErr("ePass");
                }}
                error={errors.ePass}
              />
              <ConfirmPassField
                value={ePass2}
                onChange={(v) => {
                  setEPass2(v);
                  if (v && ePass && v !== ePass)
                    setErr("ePass2", "Las contraseñas no coinciden.");
                  else clearErr("ePass2");
                }}
                error={errors.ePass2}
              />
              <SectionLabel>Redes sociales (opcionales)</SectionLabel>
              <FloatInput
                label="Facebook"
                value={eRepFb}
                onChangeText={(v) => {
                  setERepFb(v);
                  if (v.trim() && !v.includes("facebook.com/"))
                    setErr("eRepFb", "Debe incluir facebook.com/");
                  else clearErr("eRepFb");
                }}
                error={errors.eRepFb}
              />
              <FloatInput
                label="Instagram"
                value={eRepIg}
                onChangeText={(v) => {
                  setERepIg(v);
                  if (v.trim() && !v.includes("instagram.com/"))
                    setErr("eRepIg", "Debe incluir instagram.com/");
                  else clearErr("eRepIg");
                }}
                error={errors.eRepIg}
              />
              <TouchableOpacity
                style={s.termsRow}
                onPress={() => setETerms((v) => !v)}
              >
                <View style={[s.checkbox, eTerms && s.checkboxChecked]}>
                  {eTerms && <Text style={s.checkmark}>✓</Text>}
                </View>
                <Text style={s.termsText}>
                  Acepto los{" "}
                  <Text style={{ color: C.accent70 }}>
                    Términos y Condiciones
                  </Text>{" "}
                  y la{" "}
                  <Text style={{ color: C.accent70 }}>
                    Política de Privacidad
                  </Text>{" "}
                  de Gradly.
                </Text>
              </TouchableOpacity>
              {errors.eTerms && <Text style={s.errText}>{errors.eTerms}</Text>}
              {!!registerError && (
                <View style={s.registerErrorBox}>
                  <Text style={s.registerErrorText}>{registerError}</Text>
                </View>
              )}
              <StepNav
                onBack={goBack}
                onNext={nextStep}
                nextLabel="Registrar empresa →"
                loading={submitting}
              />
            </View>
          )}

          {/* ════════════════════════
              FLUJO UNIVERSIDAD
          ════════════════════════ */}
          {flow === "universidad" && step === 1 && (
            <View>
              <Text style={s.stepTitle}>Información Institucional</Text>
              <Text style={s.stepSubtitle}>
                Datos oficiales de la universidad
              </Text>
              <FloatInput
                label="Nombre oficial de la universidad"
                value={uNombre}
                onChangeText={(v) => {
                  setUNombre(v);
                  if (!v.trim()) {
                    clearErr("uNombre");
                    return;
                  }
                  if (/[^a-zA-ZÀ-ÿ0-9\s(),.-]/.test(v))
                    setErr(
                      "uNombre",
                      "Solo letras, números y los caracteres ( ) , . -",
                    );
                  else if (v.length < 4)
                    setErr("uNombre", "Mínimo 4 caracteres");
                  else clearErr("uNombre");
                }}
                error={errors.uNombre}
              />
              <SelectInput
                label="Departamento"
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
                label="Ciudad"
                value={uCiudad}
                options={uCiudadOptions}
                onChange={(v) => {
                  setUCiudad(v);
                  clearErr("uCiudad");
                }}
                error={errors.uCiudad}
              />
              <FloatInput
                label="Dirección física"
                value={uDireccion}
                onChangeText={(v) => {
                  setUDireccion(v);
                  if (!v.trim()) {
                    clearErr("uDireccion");
                    return;
                  }
                  if (/[^a-zA-ZÀ-ÿ0-9\s#.,;:]/.test(v))
                    setErr(
                      "uDireccion",
                      "Solo letras, números y los caracteres # . , ; :",
                    );
                  else clearErr("uDireccion");
                }}
                error={errors.uDireccion}
              />
              <View style={s.grid2}>
                <FloatInput
                  label="Correo institucional"
                  value={uEmail}
                  onChangeText={(v) => {
                    setUEmail(v);
                    if (!v.trim()) {
                      clearErr("uEmail");
                      return;
                    }
                    if (!isEmail(v))
                      setErr("uEmail", "Ingresa un correo válido");
                    else clearErr("uEmail");
                  }}
                  keyboardType="email-address"
                  style={{ flex: 1 }}
                  error={errors.uEmail}
                />
                <FloatInput
                  label="Sitio web oficial"
                  value={uWeb}
                  onChangeText={(v) => {
                    setUWeb(v);
                    if (!v.trim()) {
                      clearErr("uWeb");
                      return;
                    }
                    const testUrl = /^https?:\/\//.test(v.trim())
                      ? v.trim()
                      : `https://${v.trim()}`;
                    if (!/^https?:\/\/.+\..+/.test(testUrl))
                      setErr(
                        "uWeb",
                        "URL inválida (ej: https://universidad.edu.sv)",
                      );
                    else clearErr("uWeb");
                  }}
                  keyboardType="url"
                  style={{ flex: 1 }}
                  error={errors.uWeb}
                />
              </View>
              <FloatInput
                label="Teléfono (ej: +503 2345 6789)"
                value={uTel}
                onChangeText={makePhoneHandler(setUTel, "uTel")}
                keyboardType="phone-pad"
                error={errors.uTel}
              />
              <FloatInput
                label="Descripción institucional"
                value={uDesc}
                onChangeText={(v) => {
                  setUDesc(v);
                  if (!v.trim()) {
                    clearErr("uDesc");
                    return;
                  }
                  if (/[^a-zA-ZÀ-ÿ0-9\s.,;:]/.test(v))
                    setErr("uDesc", "No se permiten caracteres especiales");
                  else clearErr("uDesc");
                }}
                multiline
                maxLength={600}
                error={errors.uDesc}
              />
              <SectionLabel>Redes sociales (opcionales)</SectionLabel>
              <FloatInput
                label="Instagram"
                value={uIg}
                onChangeText={(v) => {
                  setUIg(v);
                  if (v.trim() && !v.includes("instagram.com/"))
                    setErr("uIg", "Debe incluir instagram.com/");
                  else clearErr("uIg");
                }}
                error={errors.uIg}
              />
              <FloatInput
                label="Facebook"
                value={uFacebook}
                onChangeText={(v) => {
                  setUFacebook(v);
                  if (v.trim() && !v.includes("facebook.com/"))
                    setErr("uFacebook", "Debe incluir facebook.com/");
                  else clearErr("uFacebook");
                }}
                error={errors.uFacebook}
              />
              <FloatInput
                label="GitHub"
                value={uGithub}
                onChangeText={(v) => {
                  setUGithub(v);
                  if (v.trim() && !v.includes("github.com/"))
                    setErr("uGithub", "Debe incluir github.com/");
                  else clearErr("uGithub");
                }}
                error={errors.uGithub}
              />
              {/* Behance removed per request */}
              <StepNav onBack={goBack} onNext={nextStep} />
            </View>
          )}

          {flow === "universidad" && step === 2 && (
            <View>
              <Text style={s.stepTitle}>Identidad Visual</Text>
              <Text style={s.stepSubtitle}>
                Logo y banner de la institución
              </Text>
              <SectionLabel>Logo institucional</SectionLabel>
              <UploadZone
                label="Subir logo de la institución"
                icon="🏛️"
                imageUri={uLogoPhoto}
                onPress={() => pickImage(setULogoPhoto)}
                error={errors.uLogoPhoto}
              />
              <SectionLabel>Banner (16:9)</SectionLabel>
              <UploadZone
                label="Subir banner de la institución"
                icon="🖼️"
                imageUri={uBannerPhoto}
                onPress={() => pickImage(setUBannerPhoto)}
                error={errors.uBannerPhoto}
              />
              <InfoNote>
                📸 Estos archivos serán visibles en tu perfil institucional en
                Gradly.
              </InfoNote>
              <StepNav onBack={goBack} onNext={nextStep} />
            </View>
          )}

          {flow === "universidad" && step === 3 && (
            <View>
              <Text style={s.stepTitle}>Verificación Antifraude</Text>
              <Text style={s.stepSubtitle}>
                Para proteger a la comunidad educativa
              </Text>
              <FloatInput
                label="Nombre completo del rector o encargado"
                value={uRectorNombre}
                onChangeText={(v) => {
                  setURectorNombre(v);
                  if (!v.trim()) {
                    clearErr("uRectorNombre");
                    return;
                  }
                  if (!isOnlyLettersSpaces(v))
                    setErr("uRectorNombre", "Solo letras y espacios");
                  else clearErr("uRectorNombre");
                }}
                error={errors.uRectorNombre}
              />
              <SectionLabel>Documento del rector</SectionLabel>
              <View style={s.docTypeRow}>
                {(["dui", "pasaporte", "licencia"] as DocType[]).map((dt) => (
                  <TouchableOpacity
                    key={dt}
                    style={[
                      s.docTypeBtn,
                      uRectorDocType === dt && s.docTypeBtnActive,
                    ]}
                    onPress={() => {
                      setURectorDocType(dt);
                      setURectorDocNum("");
                    }}
                  >
                    <Text
                      style={[
                        s.docTypeBtnText,
                        uRectorDocType === dt && { color: C.accent70 },
                      ]}
                    >
                      {dt.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <FloatInput
                label="Número del documento"
                value={uRectorDocNum}
                onChangeText={(v) => {
                  const rule = getDocRule(uRectorDocType);
                  let val = rule.upper ? v.toUpperCase() : v;
                  if (val.length > rule.maxLen) val = val.slice(0, rule.maxLen);
                  setURectorDocNum(val);
                  if (
                    val.trim() &&
                    val.length >= rule.maxLen &&
                    !rule.pattern.test(val)
                  )
                    setErr("uRectorDocNum", rule.hint);
                  else clearErr("uRectorDocNum");
                }}
                maxLength={getDocRule(uRectorDocType).maxLen}
                error={errors.uRectorDocNum}
              />
              <Text
                style={{
                  color: C.textMuted,
                  fontSize: 12,
                  marginTop: -10,
                  marginBottom: 14,
                }}
              >
                {getDocRule(uRectorDocType).hint}
              </Text>
              <SectionLabel>Imagen del documento</SectionLabel>
              <UploadZone
                label="Foto del documento del rector"
                icon="🪪"
                imageUri={uRectorDocPhoto}
                onPress={() => pickImage(setURectorDocPhoto)}
                error={errors.uRectorDocPhoto}
              />
              <SectionLabel>Selfie de verificación</SectionLabel>
              <UploadZone
                label="Selfie del rector"
                icon="🤳"
                imageUri={uRectorSelfiePhoto}
                onPress={() => pickImage(setURectorSelfiePhoto)}
                error={errors.uRectorSelfiePhoto}
              />
              <InfoNote>
                🔍 Esta información la revisa nuestro equipo. No es pública.
              </InfoNote>
              <View style={s.statusBadge}>
                <Text style={s.statusBadgeText}>
                  ⏳ Tu cuenta estará en revisión 24–48 horas
                </Text>
              </View>
              <StepNav onBack={goBack} onNext={nextStep} />
            </View>
          )}

          {flow === "universidad" && step === 4 && (
            <View>
              <Text style={s.stepTitle}>Carreras y Estructura Académica</Text>
              <Text style={s.stepSubtitle}>
                Agrega las carreras que ofrece tu institución
              </Text>

              {/* Saved carreras */}
              {carreras.length > 0 && (
                <View style={s.carreraChips}>
                  {carreras.map((c, i) => (
                    <View key={i} style={s.carreraChip}>
                      <Text style={s.carreraChipText}>
                        {c.nombre}
                        {c.duracion ? ` · ${c.duracion}` : ""}
                        {c.modalidad ? ` · ${c.modalidad}` : ""}
                      </Text>
                      <TouchableOpacity
                        onPress={() =>
                          setCarreras(carreras.filter((_, j) => j !== i))
                        }
                      >
                        <Text style={{ color: C.red, marginLeft: 8 }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
              {errors.carreras && (
                <Text style={s.errText}>{errors.carreras}</Text>
              )}

              {/* Add carrera form */}
              {showCarreraForm && (
                <View style={s.carreraForm}>
                  <FloatInput
                    label="Nombre de la carrera"
                    value={newCarrera.nombre}
                    onChangeText={(v) => {
                      setNewCarrera({ ...newCarrera, nombre: v });
                      if (!v.trim())
                        setErr("cNombre", "El nombre es requerido");
                      else clearErr("cNombre");
                    }}
                    error={errors.cNombre}
                  />
                  <View style={s.grid2}>
                    <SelectInput
                      label="Duración"
                      value={newCarrera.duracion}
                      options={DURATIONS}
                      onChange={(v) => {
                        setNewCarrera({ ...newCarrera, duracion: v });
                        clearErr("cDuracion");
                      }}
                      error={errors.cDuracion}
                      style={{ flex: 1 }}
                    />
                    <SelectInput
                      label="Modalidad"
                      value={newCarrera.modalidad}
                      options={MODALIDADES}
                      onChange={(v) => {
                        setNewCarrera({ ...newCarrera, modalidad: v });
                        clearErr("cModalidad");
                      }}
                      error={errors.cModalidad}
                      style={{ flex: 1 }}
                    />
                  </View>
                  <FloatInput
                    label="Coordinador responsable"
                    value={newCarrera.coordinador}
                    onChangeText={(v) => {
                      setNewCarrera({ ...newCarrera, coordinador: v });
                      if (v.trim() && !isOnlyLettersSpaces(v))
                        setErr(
                          "cCoordinador",
                          "Solo se permiten letras y espacios",
                        );
                      else clearErr("cCoordinador");
                    }}
                    error={errors.cCoordinador}
                  />
                  <View style={s.carreraFormBtns}>
                    <TouchableOpacity
                      style={s.btnOutline}
                      onPress={() => {
                        setShowCarreraForm(false);
                        setNewCarrera({
                          nombre: "",
                          duracion: "",
                          modalidad: "",
                          coordinador: "",
                        });
                        clearErr("cNombre");
                        clearErr("cDuracion");
                        clearErr("cModalidad");
                        clearErr("cCoordinador");
                      }}
                    >
                      <Text style={s.btnOutlineText}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.btnPrimary}
                      onPress={() => {
                        const errs: Record<string, string> = {};
                        if (!newCarrera.nombre.trim())
                          errs.cNombre = "El nombre es requerido";
                        if (!newCarrera.duracion)
                          errs.cDuracion = "Selecciona la duración";
                        if (!newCarrera.modalidad)
                          errs.cModalidad = "Selecciona la modalidad";
                        const coord = newCarrera.coordinador.trim();
                        if (coord && !isOnlyLettersSpaces(coord))
                          errs.cCoordinador =
                            "Solo se permiten letras y espacios";
                        if (Object.keys(errs).length > 0) {
                          setErrors(errs);
                          return;
                        }
                        setCarreras([...carreras, newCarrera]);
                        setNewCarrera({
                          nombre: "",
                          duracion: "",
                          modalidad: "",
                          coordinador: "",
                        });
                        setShowCarreraForm(false);
                        setErrors({});
                      }}
                    >
                      <Text style={s.btnPrimaryText}>Guardar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {!showCarreraForm && (
                <TouchableOpacity
                  style={[
                    s.btnOutline,
                    { alignSelf: "flex-start", marginBottom: 16 },
                  ]}
                  onPress={() => setShowCarreraForm(true)}
                >
                  <Text style={s.btnOutlineText}>+ Agregar carrera</Text>
                </TouchableOpacity>
              )}

              <InfoNote>
                📚 Podrás agregar más carreras desde tu dashboard una vez
                aprobada tu cuenta.
              </InfoNote>
              <StepNav onBack={goBack} onNext={nextStep} />
            </View>
          )}

          {flow === "universidad" && step === 5 && (
            <View>
              <Text style={s.stepTitle}>Responsable y Seguridad</Text>
              <Text style={s.stepSubtitle}>
                Datos del encargado del perfil institucional
              </Text>
              <View style={s.grid2}>
                <FloatInput
                  label="Nombre del encargado"
                  value={uEncNombre}
                  onChangeText={(v) => {
                    setUEncNombre(v);
                    if (!v.trim()) {
                      clearErr("uEncNombre");
                      return;
                    }
                    if (!isOnlyLettersSpaces(v))
                      setErr("uEncNombre", "Solo letras y espacios");
                    else clearErr("uEncNombre");
                  }}
                  style={{ flex: 1 }}
                  error={errors.uEncNombre}
                />
                <FloatInput
                  label="Teléfono"
                  value={uEncTel}
                  onChangeText={makePhoneHandler(setUEncTel, "uEncTel")}
                  keyboardType="phone-pad"
                  style={{ flex: 1 }}
                  error={errors.uEncTel}
                />
              </View>
              <FloatInput
                label="Correo personal del encargado"
                value={uEncEmail}
                onChangeText={(v) => {
                  setUEncEmail(v);
                  if (!v.trim()) {
                    clearErr("uEncEmail");
                    return;
                  }
                  if (!isEmail(v))
                    setErr("uEncEmail", "Ingresa un correo válido");
                  else clearErr("uEncEmail");
                }}
                keyboardType="email-address"
                error={errors.uEncEmail}
              />
              <SectionLabel>Foto del encargado</SectionLabel>
              <UploadZone
                label="Foto del encargado"
                icon="👤"
                imageUri={uEncPhoto}
                onPress={() => pickImage(setUEncPhoto)}
                error={errors.uEncPhoto}
              />
              <FloatInput
                label="Nombre de usuario"
                value={uUsername}
                onChangeText={(v) => {
                  setUUsername(v);
                  if (!v) {
                    clearErr("uUsername");
                    return;
                  }
                  if (!/^[a-zA-Z0-9$_.]+$/.test(v))
                    setErr("uUsername", "Solo letras, números, $, _ y .");
                  else if (v.length < 4)
                    setErr("uUsername", "Mínimo 4 caracteres");
                  else if (TAKEN_USERS.includes(v.toLowerCase()))
                    setErr("uUsername", "Usuario no disponible");
                  else clearErr("uUsername");
                }}
                error={errors.uUsername}
              />
              <PasswordField
                label="Contraseña"
                value={uPass}
                onChange={(v) => {
                  setUPass(v);
                  if (v && getPassScore(v) < 2)
                    setErr("uPass", "La contraseña es demasiado débil.");
                  else clearErr("uPass");
                }}
                error={errors.uPass}
              />
              <ConfirmPassField
                value={uPass2}
                onChange={(v) => {
                  setUPass2(v);
                  if (v && uPass && v !== uPass)
                    setErr("uPass2", "Las contraseñas no coinciden.");
                  else clearErr("uPass2");
                }}
                error={errors.uPass2}
              />
              <SectionLabel>Redes sociales (opcionales)</SectionLabel>
              <FloatInput
                label="Instagram"
                value={uEncIg}
                onChangeText={(v) => {
                  setUEncIg(v);
                  if (v.trim() && !v.includes("instagram.com/"))
                    setErr("uEncIg", "Debe incluir instagram.com/");
                  else clearErr("uEncIg");
                }}
                error={errors.uEncIg}
              />
              <FloatInput
                label="LinkedIn"
                value={uEncLi}
                onChangeText={(v) => {
                  setUEncLi(v);
                  if (v.trim() && !v.includes("linkedin.com/in/"))
                    setErr("uEncLi", "Debe incluir linkedin.com/in/");
                  else clearErr("uEncLi");
                }}
                error={errors.uEncLi}
              />
              <TouchableOpacity
                style={s.termsRow}
                onPress={() => setUTerms((v) => !v)}
              >
                <View style={[s.checkbox, uTerms && s.checkboxChecked]}>
                  {uTerms && <Text style={s.checkmark}>✓</Text>}
                </View>
                <Text style={s.termsText}>
                  Acepto los{" "}
                  <Text style={{ color: C.accent70 }}>
                    Términos y Condiciones
                  </Text>{" "}
                  y la{" "}
                  <Text style={{ color: C.accent70 }}>
                    Política de Privacidad
                  </Text>{" "}
                  de Gradly.
                </Text>
              </TouchableOpacity>
              {errors.uTerms && <Text style={s.errText}>{errors.uTerms}</Text>}
              {!!registerError && (
                <View style={s.registerErrorBox}>
                  <Text style={s.registerErrorText}>{registerError}</Text>
                </View>
              )}
              <StepNav
                onBack={goBack}
                onNext={nextStep}
                nextLabel="Registrar institución →"
                loading={submitting}
              />
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── EMPRESA PAYMENT MODAL ── */}
      <Modal
        visible={showEPaymentModal}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowEPaymentModal(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1 }}
          >
            <View style={{ padding: 16 }}>
              {/* Header */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 20,
                }}
              >
                <Text
                  style={{ fontSize: 20, fontWeight: "800", color: C.text }}
                >
                  Completar Pago
                </Text>
                <TouchableOpacity
                  onPress={() => setShowEPaymentModal(false)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: "rgba(255,255,255,0.08)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="close" size={20} color={C.text} />
                </TouchableOpacity>
              </View>

              {/* Info about subscription */}
              <InfoNote>
                <Text
                  style={{
                    fontWeight: "700",
                    color: C.text,
                    fontSize: 14,
                    marginBottom: 12,
                  }}
                >
                  Información sobre tu Suscripción
                </Text>
                <Text
                  style={{ color: C.textSub, lineHeight: 20, fontSize: 12 }}
                >
                  Tu plan de suscripción{" "}
                  <Text style={{ fontWeight: "700", color: C.accent70 }}>
                    {eSelectedPlan === "basic"
                      ? "Plan Básico"
                      : "Plan Premium + Verificado"}
                  </Text>{" "}
                  será renovado automaticamente cada{" "}
                  <Text style={{ fontWeight: "700", color: C.accent70 }}>
                    {ePlanBillingMode === "monthly" ? "mes" : "año"}
                  </Text>
                  . Selecciona tu método de pago preferido para completar el
                  registro.
                </Text>
              </InfoNote>

              {/* Payment Method Selection */}
              {eSelectedPlan === "free" ? (
                <View
                  style={{
                    marginBottom: 20,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: C.green,
                    borderRadius: 12,
                    backgroundColor: "rgba(34, 197, 94, 0.08)",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      color: C.text,
                      fontWeight: "700",
                      marginBottom: 8,
                    }}
                  >
                    Prueba Gratuita seleccionada
                  </Text>
                  <Text style={{ color: C.textMuted, fontSize: 12 }}>
                    Este plan no requiere configurar un método de pago. Completa
                    el siguiente paso para finalizar tu registro.
                  </Text>
                </View>
              ) : (
                <>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: C.accent70,
                      marginBottom: 12,
                      textTransform: "uppercase",
                      letterSpacing: 1,
                    }}
                  >
                    Método de Pago
                  </Text>
                  <View
                    style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}
                  >
                    <TouchableOpacity
                      style={[
                        s.btnOutline,
                        {
                          flex: 1,
                          backgroundColor:
                            ePayMethod === "tarjeta"
                              ? "rgba(139,92,246,0.20)"
                              : "rgba(255,255,255,0.03)",
                          borderColor:
                            ePayMethod === "tarjeta"
                              ? C.accent
                              : "rgba(139,92,246,0.30)",
                        },
                      ]}
                      onPress={() => {
                        setEPayMethod("tarjeta");
                        setErrors({});
                      }}
                    >
                      <Text
                        style={[
                          s.btnOutlineText,
                          {
                            color:
                              ePayMethod === "tarjeta"
                                ? C.accent70
                                : "rgba(255,255,255,0.60)",
                          },
                        ]}
                      >
                        Tarjeta
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Card Fields */}
                  {ePayMethod === "tarjeta" && (
                    <View style={{ marginBottom: 20 }}>
                      <FloatInput
                        label="Número de tarjeta *"
                        value={eCardNum}
                        onChangeText={(v) => {
                          const formatted = v
                            .replace(/\D/g, "")
                            .replace(/(.{4})/g, "$1 ")
                            .trim()
                            .slice(0, 19);
                          setECardNum(formatted);
                          if (formatted.replace(/\s/g, "").length !== 16) {
                            setErr("eCardNum", "Debe tener 16 dígitos");
                          } else if (!luhn(formatted)) {
                            setErr("eCardNum", "Número de tarjeta inválido");
                          } else {
                            clearErr("eCardNum");
                          }
                        }}
                        keyboardType="numeric"
                        error={errors.eCardNum}
                      />
                      <FloatInput
                        label="Titular de la tarjeta *"
                        value={eCardName}
                        onChangeText={(v) => {
                          setECardName(v);
                          if (!v.trim())
                            setErr("eCardName", "El nombre es requerido");
                          else clearErr("eCardName");
                        }}
                        error={errors.eCardName}
                      />
                      <View style={s.grid2}>
                        <FloatInput
                          label="MM/AA *"
                          value={eCardExp}
                          onChangeText={(v) => {
                            let d = v.replace(/\D/g, "");
                            if (d.length > 2)
                              d = d.slice(0, 2) + "/" + d.slice(2, 4);
                            setECardExp(d);
                            if (d.length < 5)
                              setErr("eCardExp", "Formato MM/AA requerido");
                            else clearErr("eCardExp");
                          }}
                          maxLength={5}
                          error={errors.eCardExp}
                        />
                        <FloatInput
                          label="CVV *"
                          value={eCardCvv}
                          onChangeText={(v) => {
                            const clean = v.replace(/\D/g, "").slice(0, 4);
                            setECardCvv(clean);
                            if (clean.length < 3)
                              setErr("eCardCvv", "CVV debe tener 3-4 dígitos");
                            else clearErr("eCardCvv");
                          }}
                          keyboardType="numeric"
                          error={errors.eCardCvv}
                        />
                      </View>
                    </View>
                  )}
                </>
              )}

              {/* Buttons */}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
                <TouchableOpacity
                  style={[s.btnOutline, { flex: 1 }]}
                  onPress={() => setShowEPaymentModal(false)}
                >
                  <Text style={s.btnOutlineText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    s.btnPrimary,
                    {
                      flex: 1,
                      opacity: !(
                        ePayMethod === "tarjeta" &&
                        eCardNum &&
                        eCardName &&
                        eCardExp &&
                        eCardCvv
                      )
                        ? 0.5
                        : 1,
                    },
                  ]}
                  disabled={
                    !(
                      ePayMethod === "tarjeta" &&
                      eCardNum &&
                      eCardName &&
                      eCardExp &&
                      eCardCvv
                    )
                  }
                  onPress={() => {
                    if (!eCardNum)
                      setErr("eCardNum", "Número de tarjeta es requerido");
                    if (!eCardName) setErr("eCardName", "Titular es requerido");
                    if (!eCardExp) setErr("eCardExp", "Fecha es requerida");
                    if (!eCardCvv) setErr("eCardCvv", "CVV es requerido");

                    if (eCardNum && eCardName && eCardExp && eCardCvv) {
                      setShowEPaymentModal(false);
                    }
                  }}
                >
                  <Text style={s.btnPrimaryText}>Confirmar Pago</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // ── Page shell ────────────────────────────────────────────────
  scrollContent: {
    flexGrow: 1,
    backgroundColor: C.bg,
    paddingTop: 0,
    paddingBottom: 60,
  },

  // ── Header ───────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 52,
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
  backBtnText: { color: C.accent70, fontSize: 20, fontWeight: "700" },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: C.text,
    letterSpacing: 0.5,
  },

  // ── Stepper ──────────────────────────────────────────────────
  // Sits below header; items spread horizontally across the full width.
  stepperWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 12,
    marginBottom: 8,
  },
  stepperItem: {
    alignItems: "center",
    flexShrink: 1,
  },
  stepperCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "rgba(139,92,246,0.30)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  stepperCircleText: { fontSize: 15, fontWeight: "700", color: C.textMuted },
  stepperDone: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  stepperActive: {
    backgroundColor: C.accent20,
    borderColor: C.accent,
  },
  // Labels hidden on mobile
  stepperLabel: {
    fontSize: 10,
    height: 0,
    color: "transparent",
  },
  // Connector grows to fill remaining space between circles
  stepperConnector: {
    flex: 1,
    height: 2,
    backgroundColor: "rgba(139,92,246,0.18)",
    marginHorizontal: 4,
    marginBottom: 14,
  },

  // ── Central card ─────────────────────────────────────────────
  card: {
    marginHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.18)",
  },

  // ── Step header ──────────────────────────────────────────────
  stepTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: C.text,
    marginBottom: 6,
  },
  stepSubtitle: { fontSize: 14, color: C.textSub, marginBottom: 28 },

  // ── Role cards (column on mobile) ────────────────────────────
  roleCards: {
    flexDirection: "column",
    gap: 14,
    marginTop: 20,
  },
  roleCard: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 18,
    padding: 24,
    borderWidth: 2,
    borderColor: "rgba(139,92,246,0.18)",
  },
  roleIcon: { fontSize: 40, marginBottom: 12 },
  roleTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: C.text,
    marginBottom: 8,
  },
  roleDesc: { fontSize: 13, color: C.textSub, lineHeight: 20 },

  // ── Floating-label input ──────────────────────────────────────
  floatWrap: { marginBottom: 20 },
  floatLabel: {
    fontSize: 11,
    color: "rgba(167,139,250,0.90)",
    marginBottom: 5,
    fontWeight: "500",
  },
  floatLabelActive: { color: "rgba(167,139,250,0.90)" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.30)",
    borderRadius: 10,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  inputFocused: {
    borderColor: C.accent,
  },
  inputErr: { borderColor: C.red },
  inputSuccess: { borderColor: C.green },
  textInput: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    paddingVertical: 14,
    fontFamily: undefined, // system font
  },

  // ── Select ────────────────────────────────────────────────────
  selectRow: {
    paddingVertical: 16,
    justifyContent: "space-between",
  },
  selectVal: { color: C.text, fontSize: 14, flex: 1 },
  selectPlaceholder: { color: "rgba(255,255,255,0.40)", fontSize: 14, flex: 1 },
  selectArrow: { color: "rgba(255,255,255,0.30)", fontSize: 12, marginLeft: 8 },
  dropdown: {
    backgroundColor: "#0d0b1e",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.35)",
    marginTop: 4,
    zIndex: 100,
    overflow: "hidden",
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  dropdownItemActive: { backgroundColor: C.accent20 },
  dropdownText: { color: "rgba(255,255,255,0.75)", fontSize: 14 },

  // ── Two-column grid (flex row, wraps on narrow screens) ───────
  // Children should have flex:1 so they share the row equally.
  grid2: {
    flexDirection: "row",
    gap: 12,
  },

  // ── Field error ───────────────────────────────────────────────
  errText: { color: C.red, fontSize: 12, marginTop: 4 },

  // ── Section label (uppercase, accent colour, separator line) ──
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(167,139,250,0.85)",
    textTransform: "uppercase",
    letterSpacing: 2,
    marginTop: 20,
    marginBottom: 14,
  },

  // ── Info / note block ─────────────────────────────────────────
  infoNote: {
    backgroundColor: "rgba(139,92,246,0.06)",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.22)",
    marginVertical: 14,
  },
  infoNoteText: { color: C.textSub, fontSize: 13, lineHeight: 20 },

  // ── Drag-and-drop / upload zone ───────────────────────────────
  uploadZone: {
    width: "100%",
    borderWidth: 2,
    borderColor: "rgba(139,92,246,0.40)",
    borderStyle: "dashed",
    borderRadius: 14,
    paddingVertical: 28,
    paddingHorizontal: 16,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.02)",
    marginBottom: 12,
  },
  uploadIcon: { fontSize: 32, marginBottom: 8 },
  uploadLabel: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
    textAlign: "center",
  },
  uploadHint: {
    color: "rgba(255,255,255,0.30)",
    fontSize: 12,
    textAlign: "center",
  },
  uploadZoneFilled: {
    borderStyle: "solid",
    borderColor: "rgba(34,197,94,0.50)",
    backgroundColor: "rgba(34,197,94,0.04)",
    paddingVertical: 10,
  },
  uploadZoneErr: {
    borderColor: C.red,
  },
  uploadPreview: {
    width: "100%",
    height: 160,
    borderRadius: 8,
    marginBottom: 8,
  },
  uploadChangeText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    textAlign: "center",
  },

  // ── Document-type selector ────────────────────────────────────
  docTypeRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
  },
  docTypeBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.28)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  docTypeBtnActive: {
    borderColor: C.accent,
    backgroundColor: "rgba(139,92,246,0.15)",
  },
  docTypeBtnText: {
    color: "rgba(255,255,255,0.60)",
    fontSize: 13,
    fontWeight: "600",
  },

  // ── Language entry row ────────────────────────────────────────
  // On mobile: idioma + nivel side-by-side, remove button on the right.
  langRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    marginBottom: 10,
  },
  removeLang: {
    width: 36,
    height: 46,
    borderRadius: 10,
    backgroundColor: "rgba(239,68,68,0.08)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.30)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },

  // ── "Add" ghost button ────────────────────────────────────────
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 0,
    marginBottom: 14,
  },
  addBtnText: {
    color: "rgba(167,139,250,0.90)",
    fontSize: 13,
    fontWeight: "500",
  },

  // ── Password strength meter ───────────────────────────────────
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
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: "700",
    minWidth: 72,
    textAlign: "right",
  },

  // ── Step navigation ───────────────────────────────────────────
  // Both buttons stretch equally; full-width on mobile (matches CSS flex:1 + min-width:0).
  stepNav: {
    flexDirection: "row",
    gap: 10,
    marginTop: 28,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(139,92,246,0.12)",
  },
  btnOutline: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.40)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  btnOutlineText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    fontWeight: "600",
  },
  btnPrimary: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: { color: "#fff", fontSize: 14, fontWeight: "600" },

  // ── Terms / checkbox row ──────────────────────────────────────
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
    borderColor: "rgba(139,92,246,0.40)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  checkboxChecked: { backgroundColor: C.accent, borderColor: C.accent },
  checkmark: { color: "#fff", fontSize: 11, fontWeight: "700" },
  termsText: {
    flex: 1,
    color: "rgba(255,255,255,0.60)",
    fontSize: 13,
    lineHeight: 20,
  },

  // ── Status badge ──────────────────────────────────────────────
  statusBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 100,
    backgroundColor: "rgba(139,92,246,0.10)",
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.32)",
    marginTop: 12,
  },
  statusBadgeText: {
    color: "rgba(167,139,250,0.90)",
    fontSize: 12,
  },

  // ── Second-career sub-card ────────────────────────────────────
  secondCareer: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 14,
  },
  secondCareerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  secondCareerLabel: { color: C.accent70, fontSize: 13, fontWeight: "600" },

  // ── Carrera chips ─────────────────────────────────────────────
  carreraChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
    marginBottom: 16,
  },
  carreraChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(139,92,246,0.10)",
    borderRadius: 100,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.30)",
  },
  carreraChipText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
  },
  carreraForm: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 12,
  },
  carreraFormBtns: { flexDirection: "row", gap: 8, marginTop: 8 },

  // ── Success screen ────────────────────────────────────────────
  successScreen: { alignItems: "center", paddingVertical: 40 },
  successIcon: { fontSize: 64, marginBottom: 20 },
  successTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: C.text,
    textAlign: "center",
    marginBottom: 10,
  },
  successDesc: {
    fontSize: 15,
    color: C.textSub,
    textAlign: "center",
    lineHeight: 23,
  },

  // ── Phone info note (green) ───────────────────────────────────
  phoneInfoNote: {
    backgroundColor: "rgba(34,197,94,0.08)",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.30)",
    marginTop: -12,
    marginBottom: 16,
  },
  phoneInfoText: {
    color: C.green,
    fontSize: 12,
    lineHeight: 18,
  },

  // ── Register error box (step 5 submission errors) ─────────────
  registerErrorBox: {
    backgroundColor: "rgba(239,68,68,0.10)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  registerErrorText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.80)",
    lineHeight: 18,
  },
});
