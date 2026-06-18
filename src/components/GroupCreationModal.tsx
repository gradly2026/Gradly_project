import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../config/firebaseConfig";
import {
  createGrupoWithStudents,
  type GrupoEstudiante,
  type GrupoStudentCreationResult,
} from "../../services/authService";
import { crearChatGrupoOficial } from "../services/chatService";
import { type GrupoData } from "./GroupDetailModal";

const C = {
  bg: "#07050f",
  surface: "#0d0b1e",
  accent: "#8b5cf6",
  accent70: "rgba(167,139,250,1)",
  text: "#ffffff",
  textMuted: "rgba(255,255,255,0.45)",
  border: "rgba(139,92,246,0.25)",
  green: "rgba(52,211,153,1)",
  red: "rgba(239,68,68,1)",
};

// ── Utilidades de fecha ──────────────────────────────────────────────
const DIAS_SEMANA = ["D", "L", "M", "M", "J", "V", "S"];
const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

/** Devuelve la fecha sin componente horario (00:00:00 local). */
const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const formatFecha = (d: Date | null) =>
  d
    ? d.toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "";

/** ISO corto (YYYY-MM-DD) para persistir en Firestore. */
const toISODate = (d: Date) => {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};

interface CalendarModalProps {
  visible: boolean;
  value: Date | null;
  minimumDate: Date;
  maximumDate: Date;
  title: string;
  onSelect: (date: Date) => void;
  onClose: () => void;
}

/**
 * Calendario propio (sin dependencias nativas) que respeta minimumDate /
 * maximumDate. Se construye con la misma paleta `C` y patrón de Modal anidado
 * que ya usa el selector de carrera.
 */
function CalendarModal({
  visible,
  value,
  minimumDate,
  maximumDate,
  title,
  onSelect,
  onClose,
}: CalendarModalProps) {
  const initialMonth = value ?? minimumDate;
  const [viewYear, setViewYear] = useState(initialMonth.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialMonth.getMonth());

  useEffect(() => {
    if (visible) {
      const base = value ?? minimumDate;
      setViewYear(base.getFullYear());
      setViewMonth(base.getMonth());
    }
  }, [visible]);

  const minDay = startOfDay(minimumDate);
  const maxDay = startOfDay(maximumDate);

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++)
    cells.push(new Date(viewYear, viewMonth, d));

  const monthStart = startOfDay(new Date(viewYear, viewMonth, 1));
  const canGoPrev = monthStart > startOfDay(new Date(minDay.getFullYear(), minDay.getMonth(), 1));
  const canGoNext = monthStart < startOfDay(new Date(maxDay.getFullYear(), maxDay.getMonth(), 1));

  const goPrev = () => {
    if (!canGoPrev) return;
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  };
  const goNext = () => {
    if (!canGoNext) return;
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.calendarBackdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={styles.calendarContainer}
          activeOpacity={1}
          onPress={() => {}}
        >
          <View style={styles.headerRow}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.calendarNav}>
            <TouchableOpacity
              onPress={goPrev}
              disabled={!canGoPrev}
              style={{ opacity: canGoPrev ? 1 : 0.3, padding: 6 }}
            >
              <Ionicons name="chevron-back" size={22} color={C.text} />
            </TouchableOpacity>
            <Text style={styles.calendarMonthLabel}>
              {MESES[viewMonth]} {viewYear}
            </Text>
            <TouchableOpacity
              onPress={goNext}
              disabled={!canGoNext}
              style={{ opacity: canGoNext ? 1 : 0.3, padding: 6 }}
            >
              <Ionicons name="chevron-forward" size={22} color={C.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.calendarWeekRow}>
            {DIAS_SEMANA.map((d, i) => (
              <Text key={i} style={styles.calendarWeekday}>
                {d}
              </Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {cells.map((cell, idx) => {
              if (!cell) return <View key={idx} style={styles.calendarCell} />;
              const day = startOfDay(cell);
              const disabled = day < minDay || day > maxDay;
              const selected = value ? sameDay(day, value) : false;
              return (
                <TouchableOpacity
                  key={idx}
                  style={styles.calendarCell}
                  disabled={disabled}
                  activeOpacity={0.7}
                  onPress={() => onSelect(day)}
                >
                  <View
                    style={[
                      styles.calendarDay,
                      selected && styles.calendarDaySelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.calendarDayText,
                        disabled && styles.calendarDayTextDisabled,
                        selected && styles.calendarDayTextSelected,
                      ]}
                    >
                      {cell.getDate()}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

interface Props {
  visible: boolean;
  universidadId: string;
  onClose: () => void;
  onCreated: (group: GrupoData) => void;
}

const EMPTY_ESTUDIANTE: GrupoEstudiante = {
  nombre: "",
  email: "",
  tel: "",
  area: "",
};

const validators = {
  onlyLetters: (v: string) => {
    const value = v.trim();
    if (!value) return { isValid: false, error: "Este campo es obligatorio" };
    if (!/^[a-zA-ZÁÉÍÓÚáéíóúÜüÑñ\s]+$/.test(value))
      return { isValid: false, error: "Solo se permiten letras" };
    return { isValid: true };
  },
  lettersAndNumbers: (v: string) => {
    const value = v.trim();
    if (!value) return { isValid: false, error: "Este campo es obligatorio" };
    if (!/^[a-zA-ZÁÉÍÓÚáéíóúÜüÑñ0-9\s]+$/.test(value))
      return { isValid: false, error: "Solo se permiten letras y números" };
    return { isValid: true };
  },
  email: (v: string) => {
    const value = v.trim();
    if (!value) return { isValid: false, error: "Este campo es obligatorio" };
    const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(value))
      return { isValid: false, error: "Ingresa un correo válido" };
    return { isValid: true };
  },
  phoneSv: (v: string) => {
    const digits = v.replace(/\D/g, "");
    if (!digits) return { isValid: false, error: "Este campo es obligatorio" };
    if (digits.length < 8)
      return { isValid: false, error: "Debe tener 8 dígitos" };
    return { isValid: true };
  },
  horasTotal: (v: string) => {
    const value = v.trim();
    if (!value) return { isValid: false, error: "Este campo es obligatorio" };
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1 || n > 500)
      return { isValid: false, error: "Debe ser un número entre 1 y 500" };
    return { isValid: true };
  },
};

function ValidatedInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  validator,
  error,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "email-address" | "phone-pad" | "numeric" | "url";
  multiline?: boolean;
  validator?: (v: string) => { isValid: boolean; error?: string };
  error?: string;
}) {
  const validation = validator ? validator(value) : { isValid: true };
  const hasError = !!error || (!!value && !validation.isValid);
  const isValid = !!value && validation.isValid && !error;
  const borderColor = hasError ? C.red : isValid ? C.green : C.border;

  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          {
            borderColor,
            height: multiline ? 90 : undefined,
            textAlignVertical: multiline ? "top" : "auto",
          },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.textMuted}
        keyboardType={keyboardType ?? "default"}
        multiline={multiline}
      />
      {hasError && (
        <Text style={{ color: C.red, fontSize: 12, marginTop: 6 }}>
          {error || validation.error}
        </Text>
      )}
    </View>
  );
}

export default function GroupCreationModal({
  visible,
  universidadId,
  onClose,
  onCreated,
}: Props) {
  const [step, setStep] = useState(1);
  const [grupoCarrera, setGrupoCarrera] = useState("");
  const [grupoNombre, setGrupoNombre] = useState("");
  const [grupoTotalHoras, setGrupoTotalHoras] = useState("");
  const [fechaInicio, setFechaInicio] = useState<Date | null>(null);
  const [fechaFin, setFechaFin] = useState<Date | null>(null);
  const [datePickerTarget, setDatePickerTarget] = useState<
    "inicio" | "fin" | null
  >(null);
  const [estudiantes, setEstudiantes] = useState<GrupoEstudiante[]>([
    { ...EMPTY_ESTUDIANTE },
  ]);
  const [saving, setSaving] = useState(false);
  const [createdGroup, setCreatedGroup] = useState<GrupoData | null>(null);
  const [studentCredentials, setStudentCredentials] = useState<
    GrupoStudentCreationResult[]
  >([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [carreras, setCarreras] = useState<string[]>([]);
  const [isLoadingCarreras, setIsLoadingCarreras] = useState(false);
  const [carreraPickerOpen, setCarreraPickerOpen] = useState(false);

  // Límites del calendario: desde hoy hasta exactamente 2 años en el futuro.
  const today = useMemo(() => startOfDay(new Date()), []);
  const maxDate = useMemo(() => {
    const d = new Date(today);
    d.setFullYear(d.getFullYear() + 2);
    return d;
  }, [today]);

  useEffect(() => {
    if (!visible) {
      resetForm();
      return;
    }
    if (universidadId) {
      void loadCarreras();
    }
  }, [visible, universidadId]);

  const loadCarreras = async () => {
    setIsLoadingCarreras(true);
    try {
      const snap = await getDoc(doc(db, "perfiles_universidades", universidadId));
      const data = snap.exists() ? (snap.data() as any) : null;

      // El registro de universidad persiste la oferta en `carreras_ofertadas`
      // (array de nombres). Mantenemos `carreras` como fallback por compatibilidad.
      const carrerasRaw = data?.carreras_ofertadas ?? data?.carreras;
      const carrerasData = Array.isArray(carrerasRaw)
        ? carrerasRaw
        : typeof carrerasRaw === "string"
          ? [carrerasRaw]
          : [];

      const normalizedCarreras = carrerasData
        .map((item: any) => {
          if (!item) return "";
          if (typeof item === "string") return item;
          if (typeof item === "object") return String(item.nombre ?? "");
          return String(item);
        })
        .filter(Boolean);

      setCarreras(normalizedCarreras);
    } catch (error) {
      console.error("Error cargando carreras:", error);
      setCarreras([]);
    } finally {
      setIsLoadingCarreras(false);
    }
  };

  const resetForm = () => {
    setStep(1);
    setGrupoCarrera("");
    setGrupoNombre("");
    setGrupoTotalHoras("");
    setFechaInicio(null);
    setFechaFin(null);
    setDatePickerTarget(null);
    setEstudiantes([{ ...EMPTY_ESTUDIANTE }]);
    setSaving(false);
    setCreatedGroup(null);
    setErrors({});
    setCarreras([]);
    setCarreraPickerOpen(false);
  };

  const addEstudiante = () => {
    if (estudiantes.length >= 30) {
      Alert.alert(
        "Límite alcanzado",
        "No puedes agregar más de 30 estudiantes.",
      );
      return;
    }
    setEstudiantes((prev) => [...prev, { ...EMPTY_ESTUDIANTE }]);
  };

  const removeEstudiante = (index: number) =>
    setEstudiantes((prev) => prev.filter((_, idx) => idx !== index));

  const updateEstudiante = (
    index: number,
    field: keyof GrupoEstudiante,
    value: string,
  ) =>
    setEstudiantes((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, [field]: value } : item,
      ),
    );

  const closeModal = () => {
    onClose();
    resetForm();
  };

  const clearError = (key: string) =>
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const handleSelectCarrera = (value: string) => {
    setGrupoCarrera(value);
    clearError("grupoCarrera");
    setCarreraPickerOpen(false);
  };

  const handleSelectFecha = (date: Date) => {
    if (datePickerTarget === "inicio") {
      setFechaInicio(date);
      clearError("fechaInicio");
      // Si la fecha de fin quedó antes de la nueva fecha de inicio, la limpiamos.
      if (fechaFin && fechaFin < date) {
        setFechaFin(null);
      }
    } else if (datePickerTarget === "fin") {
      setFechaFin(date);
      clearError("fechaFin");
    }
    setDatePickerTarget(null);
  };

  const validateStep1 = () => {
    const next: Record<string, string> = {};
    if (!grupoCarrera.trim()) {
      next.grupoCarrera = "Debes elegir una carrera";
    }
    const vNombre = validators.lettersAndNumbers(grupoNombre);
    if (!vNombre.isValid) next.grupoNombre = vNombre.error || "Inválido";
    const vHoras = validators.horasTotal(grupoTotalHoras);
    if (!vHoras.isValid) next.grupoTotalHoras = vHoras.error || "Inválido";
    if (!fechaInicio) {
      next.fechaInicio = "Debes elegir la fecha de inicio";
    }
    if (!fechaFin) {
      next.fechaFin = "Debes elegir la fecha de fin";
    } else if (fechaInicio && fechaFin < fechaInicio) {
      next.fechaFin = "La fecha de fin no puede ser anterior al inicio";
    }
    setErrors((prev) => ({ ...prev, ...next }));
    return Object.keys(next).length === 0;
  };

  const validateStep2 = () => {
    const next: Record<string, string> = {};
    estudiantes.forEach((est, idx) => {
      const vNombre = validators.onlyLetters(est.nombre);
      if (!vNombre.isValid)
        next[`estudiantes.${idx}.nombre`] = vNombre.error || "Inválido";
      const vEmail = validators.email(est.email);
      if (!vEmail.isValid)
        next[`estudiantes.${idx}.email`] = vEmail.error || "Inválido";
      const vTel = validators.phoneSv(est.tel);
      if (!vTel.isValid)
        next[`estudiantes.${idx}.tel`] = vTel.error || "Inválido";
      const vDir = validators.lettersAndNumbers(est.area);
      if (!vDir.isValid)
        next[`estudiantes.${idx}.area`] = vDir.error || "Inválido";
    });
    setErrors((prev) => ({ ...prev, ...next }));
    return Object.keys(next).length === 0;
  };

  // Phone handler — El Salvador only (8 digits, XXXX XXXX)
  const makePhoneHandler = (index: number) => (v: string) => {
    const digits = v.replace(/[^\d]/g, "").slice(0, 8);
    const formatted =
      digits.length <= 4 ? digits : digits.slice(0, 4) + " " + digits.slice(4);
    updateEstudiante(index, "tel", formatted);
    if (!digits) clearError(`estudiantes.${index}.tel`);
    else if (digits.length < 8)
      setErrors((prev) => ({
        ...prev,
        [`estudiantes.${index}.tel`]: "Debe tener 8 dígitos",
      }));
    else clearError(`estudiantes.${index}.tel`);
  };

  const handleCreateGroup = async () => {
    if (!validateStep1() || !validateStep2()) return;
    setSaving(true);

    try {
      const response = await createGrupoWithStudents({
        universidadId,
        carrera: grupoCarrera,
        nombre: grupoNombre,
        totalHoras: Number(grupoTotalHoras),
        fechaInicio: fechaInicio ? toISODate(fechaInicio) : null,
        fechaFin: fechaFin ? toISODate(fechaFin) : null,
        estudiantes,
        postulacion: null,
      });

      setStudentCredentials(response.results);

      const newGroup: GrupoData = {
        id: response.groupId,
        name: grupoNombre,
        carrera: grupoCarrera,
        dateCreated: new Date().toLocaleDateString("es-ES"),
        inicio: formatFecha(fechaInicio),
        fin: formatFecha(fechaFin),
        count: estudiantes.length,
        status: "Activo",
        badgeType: "active",
        tags: [...new Set(estudiantes.map((s) => s.area).filter(Boolean))],
        empresaAsignada: null,
        estudiantes: estudiantes.map((student, idx) => ({
          id: `${response.groupId}-${idx}`,
          name: student.nombre,
          carrera: grupoCarrera,
          estado: "Activo",
        })),
      };

      setCreatedGroup(newGroup);
      onCreated(newGroup);
      setStep(4);

      // Crea el chat grupal oficial (universidad = admin). No es bloqueante:
      // si falla, el grupo ya quedó creado y puede reintentarse desde la lista.
      try {
        await crearChatGrupoOficial({
          universidadId,
          grupoId: response.groupId,
          grupoNombre: grupoNombre,
        });
      } catch (chatError) {
        console.warn("No se pudo crear el chat del grupo:", chatError);
      }

      const failed = response.results.filter((item) => !item.success);
      if (failed.length > 0) {
        Alert.alert(
          "Alerta",
          `Se creó el grupo, pero ${failed.length} estudiante(s) no pudieron registrarse. Revisa la consola para detalles.`,
        );
      }
    } catch (error: any) {
      console.error("Error al crear grupo:", error);
      Alert.alert(
        "Error",
        error?.message || "No se pudo crear el grupo. Intenta de nuevo.",
      );
    } finally {
      setSaving(false);
    }
  };

  const saveGroup = () => {
    void handleCreateGroup();
  };

  const copyCredentialsToClipboard = async () => {
    if (studentCredentials.length === 0) {
      Alert.alert("Sin datos", "No hay credenciales para copiar.");
      return;
    }

    const text = studentCredentials
      .map((item, index) =>
        [
          `Estudiante ${index + 1}:`,
          `Email: ${item.email}`,
          `Contraseña: ${item.password}`,
        ]
          .concat(item.error ? [`Error: ${item.error}`] : [])
          .join(" \n"),
      )
      .join("\n\n");

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        Alert.alert("Copiado", "Las credenciales se copiaron al portapapeles.");
        return;
      }
    } catch (err) {
      console.warn("No se pudo copiar con navigator.clipboard", err);
    }

    Alert.alert(
      "Copiar manualmente",
      "No se pudo copiar automáticamente. Selecciona el texto y cópialo manualmente.",
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={closeModal}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalContainer}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Crear nuevo grupo</Text>
            <TouchableOpacity onPress={closeModal}>
              <Ionicons name="close" size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {step === 1 && (
              <View>
                <Text style={styles.inputLabel}>Especialidad / Carrera *</Text>
                <TouchableOpacity
                  style={[
                    styles.input,
                    {
                      borderColor: errors.grupoCarrera
                        ? C.red
                        : grupoCarrera
                          ? C.green
                          : C.border,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    },
                  ]}
                  onPress={() => setCarreraPickerOpen((prev) => !prev)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={{
                      color: grupoCarrera ? C.text : C.textMuted,
                      flex: 1,
                    }}
                  >
                    {grupoCarrera ||
                      (isLoadingCarreras
                        ? "Cargando carreras..."
                        : "Selecciona una carrera")}
                  </Text>
                  <Ionicons
                    name={
                      carreraPickerOpen
                        ? "chevron-up-outline"
                        : "chevron-down-outline"
                    }
                    size={18}
                    color={C.textMuted}
                  />
                </TouchableOpacity>
                {carreraPickerOpen && (
                  <View style={styles.pickerList}>
                    {isLoadingCarreras ? (
                      <Text style={styles.pickerEmpty}>
                        Cargando carreras...
                      </Text>
                    ) : carreras.length === 0 ? (
                      <Text style={styles.pickerEmpty}>
                        No se encontraron carreras.
                      </Text>
                    ) : (
                      carreras.map((item) => (
                        <TouchableOpacity
                          key={item}
                          style={styles.pickerItem}
                          onPress={() => handleSelectCarrera(item)}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.pickerItemText}>{item}</Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                )}
                {errors.grupoCarrera ? (
                  <Text style={{ color: C.red, fontSize: 12, marginTop: 6 }}>
                    {errors.grupoCarrera}
                  </Text>
                ) : null}
                <ValidatedInput
                  label="Nombre del grupo *"
                  value={grupoNombre}
                  onChangeText={(v) => {
                    const clean = v.replace(
                      /[^a-zA-ZÁÉÍÓÚáéíóúÜüÑñ0-9\s]/g,
                      "",
                    );
                    setGrupoNombre(clean);
                    clearError("grupoNombre");
                  }}
                  placeholder="Ej: Ing. Sistemas - Grupo A 2025"
                  validator={validators.lettersAndNumbers}
                  error={errors.grupoNombre}
                />

                <Text style={[styles.sectionTitle, { marginTop: 6 }]}>
                  Total de horas (1–500) *
                </Text>
                <View style={[styles.rowTwo, { marginTop: 10 }]}>
                  <TouchableOpacity
                    style={[styles.outlineButton, { flex: 1, marginTop: 0 }]}
                    onPress={() => {
                      const current = Number(grupoTotalHoras || 0);
                      const next = Math.max(1, current - 10);
                      setGrupoTotalHoras(String(next));
                      clearError("grupoTotalHoras");
                    }}
                  >
                    <Text style={styles.outlineButtonText}>-10</Text>
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <ValidatedInput
                      label="Horas *"
                      value={grupoTotalHoras}
                      onChangeText={(v) => {
                        const digits = v.replace(/\D/g, "").slice(0, 3);
                        setGrupoTotalHoras(digits);
                        clearError("grupoTotalHoras");
                      }}
                      placeholder="120"
                      keyboardType="numeric"
                      validator={validators.horasTotal}
                      error={errors.grupoTotalHoras}
                    />
                  </View>
                  <TouchableOpacity
                    style={[styles.outlineButton, { flex: 1, marginTop: 0 }]}
                    onPress={() => {
                      const current = Number(grupoTotalHoras || 0);
                      const next = Math.min(500, current + 10);
                      setGrupoTotalHoras(String(next));
                      clearError("grupoTotalHoras");
                    }}
                  >
                    <Text style={styles.outlineButtonText}>+10</Text>
                  </TouchableOpacity>
                </View>

                <Text style={[styles.sectionTitle, { marginTop: 18 }]}>
                  Duración de la pasantía *
                </Text>
                <View style={[styles.rowTwo, { marginTop: 10 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Fecha de inicio *</Text>
                    <TouchableOpacity
                      style={[
                        styles.input,
                        {
                          borderColor: errors.fechaInicio
                            ? C.red
                            : fechaInicio
                              ? C.green
                              : C.border,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                        },
                      ]}
                      onPress={() => setDatePickerTarget("inicio")}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={{
                          color: fechaInicio ? C.text : C.textMuted,
                          flex: 1,
                        }}
                      >
                        {fechaInicio ? formatFecha(fechaInicio) : "dd/mm/aaaa"}
                      </Text>
                      <Ionicons
                        name="calendar-outline"
                        size={18}
                        color={C.textMuted}
                      />
                    </TouchableOpacity>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Fecha de fin *</Text>
                    <TouchableOpacity
                      style={[
                        styles.input,
                        {
                          borderColor: errors.fechaFin
                            ? C.red
                            : fechaFin
                              ? C.green
                              : C.border,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                        },
                      ]}
                      onPress={() => setDatePickerTarget("fin")}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={{
                          color: fechaFin ? C.text : C.textMuted,
                          flex: 1,
                        }}
                      >
                        {fechaFin ? formatFecha(fechaFin) : "dd/mm/aaaa"}
                      </Text>
                      <Ionicons
                        name="calendar-outline"
                        size={18}
                        color={C.textMuted}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
                {errors.fechaInicio ? (
                  <Text style={{ color: C.red, fontSize: 12, marginTop: 6 }}>
                    {errors.fechaInicio}
                  </Text>
                ) : null}
                {errors.fechaFin ? (
                  <Text style={{ color: C.red, fontSize: 12, marginTop: 6 }}>
                    {errors.fechaFin}
                  </Text>
                ) : null}

                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => {
                    if (!validateStep1()) return;
                    setStep(2);
                  }}
                >
                  <Text style={styles.primaryButtonText}>
                    Siguiente: Lista de estudiantes →
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {step === 2 && (
              <View>
                <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>
                  Lista de estudiantes
                </Text>
                {estudiantes.map((est, idx) => (
                  <View key={idx} style={{ marginBottom: 12 }}>
                    <View style={[styles.rowBetween, { marginBottom: 6 }]}>
                      <Text style={styles.smallLabel}>
                        Estudiante {idx + 1}
                      </Text>
                      {estudiantes.length > 1 && (
                        <TouchableOpacity onPress={() => removeEstudiante(idx)}>
                          <Ionicons
                            name="trash-outline"
                            size={16}
                            color={C.red}
                          />
                        </TouchableOpacity>
                      )}
                    </View>
                    <ValidatedInput
                      label="Nombre *"
                      value={est.nombre}
                      onChangeText={(value) => {
                        const clean = value.replace(
                          /[^a-zA-ZÁÉÍÓÚáéíóúÜüÑñ\s]/g,
                          "",
                        );
                        updateEstudiante(idx, "nombre", clean);
                        clearError(`estudiantes.${idx}.nombre`);
                      }}
                      placeholder="Nombre completo"
                      validator={validators.onlyLetters}
                      error={errors[`estudiantes.${idx}.nombre`]}
                    />
                    <ValidatedInput
                      label="Correo *"
                      value={est.email}
                      onChangeText={(value) => {
                        updateEstudiante(idx, "email", value);
                        clearError(`estudiantes.${idx}.email`);
                      }}
                      placeholder="correo@ejemplo.com"
                      keyboardType="email-address"
                      validator={validators.email}
                      error={errors[`estudiantes.${idx}.email`]}
                    />
                    <View style={styles.rowTwo}>
                      <View style={{ flex: 1 }}>
                        <ValidatedInput
                          label="Teléfono (+503) *"
                          value={est.tel}
                          onChangeText={makePhoneHandler(idx)}
                          placeholder="#### ####"
                          keyboardType="phone-pad"
                          validator={validators.phoneSv}
                          error={errors[`estudiantes.${idx}.tel`]}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <ValidatedInput
                          label="Dirección *"
                          value={est.area}
                          onChangeText={(value) => {
                            const clean = value.replace(
                              /[^a-zA-ZÁÉÍÓÚáéíóúÜüÑñ0-9\s]/g,
                              "",
                            );
                            updateEstudiante(idx, "area", clean);
                            clearError(`estudiantes.${idx}.area`);
                          }}
                          placeholder="Dirección"
                          validator={validators.lettersAndNumbers}
                          error={errors[`estudiantes.${idx}.area`]}
                        />
                      </View>
                    </View>
                  </View>
                ))}
                <TouchableOpacity
                  style={styles.outlineButton}
                  onPress={addEstudiante}
                  disabled={estudiantes.length >= 30}
                >
                  <Text style={styles.outlineButtonText}>
                    + Agregar estudiante
                  </Text>
                </TouchableOpacity>
                {estudiantes.length >= 30 && (
                  <Text
                    style={[styles.textMuted, { fontSize: 12, marginTop: 10 }]}
                  >
                    Has alcanzado el límite máximo de 30 estudiantes.
                  </Text>
                )}
                <Text
                  style={[styles.textMuted, { fontSize: 12, marginTop: 12 }]}
                >
                  Total: {estudiantes.length} estudiante(s)
                </Text>
                <View style={[styles.rowTwo, { marginTop: 20 }]}>
                  <TouchableOpacity
                    style={[styles.outlineButton, { flex: 1 }]}
                    onPress={() => setStep(1)}
                  >
                    <Text style={styles.outlineButtonText}>← Volver</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.primaryButton,
                      { flex: 1, opacity: saving ? 0.7 : 1 },
                    ]}
                    onPress={saveGroup}
                    disabled={saving}
                  >
                    <Text style={styles.primaryButtonText}>
                      {saving ? "Guardando..." : "Guardar grupo"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {step === 4 && createdGroup && (
              <View style={{ paddingVertical: 24 }}>
                <View style={{ alignItems: "center", marginBottom: 16 }}>
                  <Text style={{ fontSize: 48, marginBottom: 16 }}>🎉</Text>
                  <Text style={[styles.sectionTitle, { textAlign: "center" }]}>
                    ¡Grupo creado exitosamente!
                  </Text>
                  <Text
                    style={[
                      styles.textMuted,
                      { fontSize: 13, textAlign: "center", marginTop: 8 },
                    ]}
                  >
                    <Text style={{ color: C.text, fontWeight: "700" }}>
                      {createdGroup.count} estudiante(s)
                    </Text>{" "}
                    registrado(s). Se generaron credenciales automáticamente.
                  </Text>
                </View>

                <View style={[styles.card, { padding: 16, marginBottom: 16 }]}>
                  <Text style={[styles.subsectionTitle, { marginBottom: 12 }]}>
                    Credenciales generadas
                  </Text>
                  {studentCredentials.length === 0 ? (
                    <Text style={styles.textMuted}>
                      No se encontraron credenciales.
                    </Text>
                  ) : (
                    studentCredentials.map((item, index) => (
                      <View
                        key={`${item.email}-${index}`}
                        style={{ marginBottom: 12 }}
                      >
                        <Text style={styles.textSub}>
                          Estudiante {index + 1}
                        </Text>
                        <Text style={[styles.textMuted, { marginTop: 4 }]}>
                          Email: {item.email}
                        </Text>
                        <Text style={[styles.textMuted, { marginTop: 2 }]}>
                          Contraseña: {item.password}
                        </Text>
                        {item.error ? (
                          <Text style={[styles.errorText, { marginTop: 4 }]}>
                            Error: {item.error}
                          </Text>
                        ) : null}
                      </View>
                    ))
                  )}
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, { marginBottom: 12 }]}
                  onPress={copyCredentialsToClipboard}
                >
                  <Text style={styles.primaryButtonText}>
                    Copiar credenciales
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.outlineButton, { alignSelf: "center" }]}
                  onPress={closeModal}
                >
                  <Text style={styles.outlineButtonText}>Cerrar</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </View>

      <CalendarModal
        visible={datePickerTarget !== null}
        value={datePickerTarget === "inicio" ? fechaInicio : fechaFin}
        minimumDate={
          datePickerTarget === "fin" && fechaInicio ? fechaInicio : today
        }
        maximumDate={maxDate}
        title={
          datePickerTarget === "inicio"
            ? "Fecha de inicio"
            : "Fecha de fin"
        }
        onSelect={handleSelectFecha}
        onClose={() => setDatePickerTarget(null)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(7,5,15,0.75)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    padding: 24,
    maxHeight: "90%",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    color: C.text,
    fontSize: 18,
    fontWeight: "700",
  },
  sectionTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: "700",
  },
  inputLabel: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: C.text,
    fontSize: 13,
  },
  rowTwo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  smallLabel: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  primaryButton: {
    backgroundColor: C.accent,
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  outlineButtonText: {
    color: C.accent70,
    fontWeight: "600",
    fontSize: 13,
  },
  pickerList: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 8,
    maxHeight: 180,
    paddingVertical: 6,
  },
  pickerItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  pickerItemText: {
    color: C.text,
    fontSize: 13,
  },
  pickerEmpty: {
    color: C.textMuted,
    fontSize: 13,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
  },
  subsectionTitle: {
    color: C.text,
    fontSize: 14,
    fontWeight: "700",
  },
  textSub: {
    color: C.text,
    fontSize: 13,
  },
  errorText: {
    color: C.red,
    fontSize: 12,
  },
  textMuted: {
    color: C.textMuted,
    fontSize: 13,
    marginBottom: 10,
  },
  calendarBackdrop: {
    flex: 1,
    backgroundColor: "rgba(7,5,15,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  calendarContainer: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: C.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
  },
  calendarNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  calendarMonthLabel: {
    color: C.text,
    fontSize: 15,
    fontWeight: "700",
  },
  calendarWeekRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  calendarWeekday: {
    flex: 1,
    textAlign: "center",
    color: C.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  calendarCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarDay: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarDaySelected: {
    backgroundColor: C.accent,
  },
  calendarDayText: {
    color: C.text,
    fontSize: 13,
  },
  calendarDayTextDisabled: {
    color: C.textMuted,
    opacity: 0.4,
  },
  calendarDayTextSelected: {
    color: "#fff",
    fontWeight: "700",
  },
});
