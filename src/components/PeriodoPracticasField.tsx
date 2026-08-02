import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  StyleSheet,


  TouchableOpacity,
  View,
} from "react-native";
import { AutoText as Text, AutoTextInput as TextInput } from "./AutoText";
import { useTheme, type GradlyColors } from "../context/ThemeContext";

// ════════════════════════════════════════════════════════════════════
//  PeriodoPracticasField
//  Reemplaza el viejo input "horas a cumplir" por un período de prácticas
//  con tres modos de medición:
//    • 'ciclos' → el usuario elige 1–6 ciclos (6 meses c/u); el sistema
//                 calcula la fecha de fin.
//    • 'fecha'  → el usuario elige manualmente la fecha de fin.
//    • 'horas'  → el usuario mide la pasantía en horas de práctica laboral.
//  Siempre exige una fecha de inicio (≥ hoy). Componente autónomo: trae su
//  propio calendario sin dependencias nativas.
// ════════════════════════════════════════════════════════════════════

export type ModoPeriodo = "ciclos" | "fecha" | "horas";

export interface PeriodoValue {
  modo: ModoPeriodo;
  fechaInicio: Date | null;
  fechaFin: Date | null;
  /** Solo en modo 'ciclos'. */
  ciclos: number | null;
  /** Duración derivada en meses (modos 'ciclos' y 'fecha'). */
  meses: number | null;
  /** Solo en modo 'horas'. */
  horas: number | null;
}

/** Meses por ciclo académico (un ciclo ≈ medio año). */
export const MESES_POR_CICLO = 6;
export const MAX_CICLOS = 6;

export const PERIODO_VACIO: PeriodoValue = {
  modo: "ciclos",
  fechaInicio: null,
  fechaFin: null,
  ciclos: 1,
  meses: MESES_POR_CICLO,
  horas: null,
};

// ── Utilidades de fecha ──────────────────────────────────────────────
const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

const addMonths = (d: Date, m: number) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + m);
  return x;
};

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

const mesesEntre = (a: Date, b: Date) =>
  Math.max(1, Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24 * 30)));

const DIAS_SEMANA = ["D", "L", "M", "M", "J", "V", "S"];
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** True si el período tiene los datos mínimos para guardarse. */
export function periodoValido(p: PeriodoValue): boolean {
  if (!p.fechaInicio) return false;
  if (p.modo === "ciclos") return !!p.ciclos && p.ciclos >= 1 && p.ciclos <= MAX_CICLOS;
  if (p.modo === "fecha") return !!p.fechaFin && p.fechaFin >= p.fechaInicio;
  if (p.modo === "horas") return !!p.horas && p.horas > 0;
  return false;
}

// ════════════════════════════════════════════════════════════════════
//  Calendario interno (sin dependencias nativas)
// ════════════════════════════════════════════════════════════════════
function CalendarModal({
  visible,
  value,
  minimumDate,
  maximumDate,
  title,
  onSelect,
  onClose,
  C,
}: {
  visible: boolean;
  value: Date | null;
  minimumDate: Date;
  maximumDate: Date;
  title: string;
  onSelect: (d: Date) => void;
  onClose: () => void;
  C: GradlyColors;
}) {
  const styles = useMemo(() => makeStyles(C), [C]);
  const base = value ?? minimumDate;
  const [viewYear, setViewYear] = useState(base.getFullYear());
  const [viewMonth, setViewMonth] = useState(base.getMonth());

  useEffect(() => {
    if (visible) {
      const b = value ?? minimumDate;
      setViewYear(b.getFullYear());
      setViewMonth(b.getMonth());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const minDay = startOfDay(minimumDate);
  const maxDay = startOfDay(maximumDate);
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(viewYear, viewMonth, d));

  const monthStart = startOfDay(new Date(viewYear, viewMonth, 1));
  const canPrev = monthStart > startOfDay(new Date(minDay.getFullYear(), minDay.getMonth(), 1));
  const canNext = monthStart < startOfDay(new Date(maxDay.getFullYear(), maxDay.getMonth(), 1));

  const goPrev = () => {
    if (!canPrev) return;
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const goNext = () => {
    if (!canNext) return;
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.calBackdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.calContainer} activeOpacity={1} onPress={() => {}}>
          <View style={styles.calHeader}>
            <Text style={styles.calTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.calNav}>
            <TouchableOpacity onPress={goPrev} disabled={!canPrev} style={{ opacity: canPrev ? 1 : 0.3, padding: 6 }}>
              <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.calMonthLabel}>{MESES[viewMonth]} {viewYear}</Text>
            <TouchableOpacity onPress={goNext} disabled={!canNext} style={{ opacity: canNext ? 1 : 0.3, padding: 6 }}>
              <Ionicons name="chevron-forward" size={22} color={C.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.calWeekRow}>
            {DIAS_SEMANA.map((d, i) => (
              <Text key={i} style={styles.calWeekday}>{d}</Text>
            ))}
          </View>

          <View style={styles.calGrid}>
            {cells.map((cell, idx) => {
              if (!cell) return <View key={idx} style={styles.calCell} />;
              const day = startOfDay(cell);
              const disabled = day < minDay || day > maxDay;
              const selected = value ? sameDay(day, value) : false;
              return (
                <TouchableOpacity key={idx} style={styles.calCell} disabled={disabled} activeOpacity={0.7} onPress={() => onSelect(day)}>
                  <View style={[styles.calDay, selected && styles.calDaySelected]}>
                    <Text style={[styles.calDayText, disabled && styles.calDayTextDisabled, selected && styles.calDayTextSelected]}>
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

// ════════════════════════════════════════════════════════════════════
//  Campo principal
// ════════════════════════════════════════════════════════════════════
export default function PeriodoPracticasField({
  value,
  onChange,
}: {
  value: PeriodoValue;
  onChange: (v: PeriodoValue) => void;
}) {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [picker, setPicker] = useState<"inicio" | "fin" | null>(null);

  const today = useMemo(() => startOfDay(new Date()), []);
  const maxDate = useMemo(() => addMonths(today, 48), [today]); // hasta 4 años

  // Recalcula fechaFin/meses según el modo cuando cambian inicio o ciclos.
  const emitir = (parcial: Partial<PeriodoValue>) => {
    const next: PeriodoValue = { ...value, ...parcial };
    if (next.modo === "ciclos" && next.fechaInicio && next.ciclos) {
      next.meses = next.ciclos * MESES_POR_CICLO;
      next.fechaFin = addMonths(next.fechaInicio, next.meses);
      next.horas = null;
    } else if (next.modo === "fecha") {
      next.ciclos = null;
      next.horas = null;
      next.meses =
        next.fechaInicio && next.fechaFin
          ? mesesEntre(next.fechaInicio, next.fechaFin)
          : null;
    } else if (next.modo === "horas") {
      next.ciclos = null;
      next.fechaFin = null;
      next.meses = null;
    }
    onChange(next);
  };

  const seleccionarFecha = (date: Date) => {
    if (picker === "inicio") emitir({ fechaInicio: date });
    else if (picker === "fin") emitir({ fechaFin: date });
    setPicker(null);
  };

  const setCiclos = (n: number) => {
    const clamped = Math.min(MAX_CICLOS, Math.max(1, n));
    emitir({ ciclos: clamped });
  };

  const MODOS: { key: ModoPeriodo; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: "ciclos", label: "Por ciclos", icon: "repeat-outline" },
    { key: "fecha", label: "Fecha de fin", icon: "calendar-outline" },
    { key: "horas", label: "Por horas", icon: "time-outline" },
  ];

  return (
    <View>
      {/* Fecha de inicio */}
      <Text style={styles.label}>FECHA DE INICIO *</Text>
      <TouchableOpacity
        style={[styles.input, styles.inputRow, value.fechaInicio && styles.inputOk]}
        onPress={() => setPicker("inicio")}
        activeOpacity={0.85}
      >
        <Text style={{ color: value.fechaInicio ? C.textPrimary : C.textMuted, flex: 1 }}>
          {value.fechaInicio ? formatFecha(value.fechaInicio) : "dd/mm/aaaa (hoy o después)"}
        </Text>
        <Ionicons name="calendar-outline" size={18} color={C.textMuted} />
      </TouchableOpacity>

      {/* Selector de modo de medición */}
      <Text style={[styles.label, { marginTop: 14 }]}>¿CÓMO MEDIR LA DURACIÓN? *</Text>
      <View style={styles.segment}>
        {MODOS.map((m) => {
          const activo = value.modo === m.key;
          return (
            <TouchableOpacity
              key={m.key}
              style={[styles.segmentBtn, activo && styles.segmentBtnActive]}
              onPress={() => emitir({ modo: m.key })}
              activeOpacity={0.85}
            >
              <Ionicons name={m.icon} size={15} color={activo ? "#fff" : C.textMuted} />
              <Text style={[styles.segmentText, activo && styles.segmentTextActive]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Modo CICLOS ── */}
      {value.modo === "ciclos" && (
        <View style={{ marginTop: 12 }}>
          <Text style={styles.label}>CICLOS DE ESTUDIO A CUBRIR (1–{MAX_CICLOS}) *</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => setCiclos((value.ciclos ?? 1) - 1)}
              disabled={(value.ciclos ?? 1) <= 1}
            >
              <Ionicons name="remove" size={20} color={(value.ciclos ?? 1) <= 1 ? C.textMuted : "#fff"} />
            </TouchableOpacity>
            <View style={styles.stepValue}>
              <Text style={styles.stepValueNum}>{value.ciclos ?? 1}</Text>
              <Text style={styles.stepValueUnit}>
                {(value.ciclos ?? 1) === 1 ? "ciclo" : "ciclos"}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => setCiclos((value.ciclos ?? 1) + 1)}
              disabled={(value.ciclos ?? 1) >= MAX_CICLOS}
            >
              <Ionicons name="add" size={20} color={(value.ciclos ?? 1) >= MAX_CICLOS ? C.textMuted : "#fff"} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Modo FECHA DE FIN MANUAL ── */}
      {value.modo === "fecha" && (
        <View style={{ marginTop: 12 }}>
          <Text style={styles.label}>FECHA DE FIN *</Text>
          <TouchableOpacity
            style={[styles.input, styles.inputRow, value.fechaFin && styles.inputOk]}
            onPress={() => {
              if (!value.fechaInicio) { setPicker("inicio"); return; }
              setPicker("fin");
            }}
            activeOpacity={0.85}
          >
            <Text style={{ color: value.fechaFin ? C.textPrimary : C.textMuted, flex: 1 }}>
              {value.fechaFin
                ? formatFecha(value.fechaFin)
                : value.fechaInicio
                  ? "dd/mm/aaaa"
                  : "Elige primero la fecha de inicio"}
            </Text>
            <Ionicons name="calendar-outline" size={18} color={C.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Modo HORAS ── */}
      {value.modo === "horas" && (
        <View style={{ marginTop: 12 }}>
          <Text style={styles.label}>HORAS DE PRÁCTICA A CUMPLIR *</Text>
          <TextInput
            style={[styles.input, value.horas ? styles.inputOk : null, { color: C.textPrimary }]}
            value={value.horas ? String(value.horas) : ""}
            onChangeText={(t) => {
              const n = Number(t.replace(/\D/g, "").slice(0, 4));
              emitir({ horas: n > 0 ? n : null });
            }}
            placeholder="Ej. 500"
            placeholderTextColor={C.textMuted}
            keyboardType="number-pad"
            selectionColor={C.primary}
          />
        </View>
      )}

      {/* Resumen del período calculado */}
      <View style={styles.resumen}>
        <Ionicons name="information-circle-outline" size={15} color={C.primary} />
        <Text style={styles.resumenText}>{describirPeriodo(value)}</Text>
      </View>

      <CalendarModal
        visible={picker !== null}
        value={picker === "inicio" ? value.fechaInicio : value.fechaFin}
        minimumDate={picker === "fin" && value.fechaInicio ? value.fechaInicio : today}
        maximumDate={maxDate}
        title={picker === "inicio" ? "Fecha de inicio" : "Fecha de fin"}
        onSelect={seleccionarFecha}
        onClose={() => setPicker(null)}
        C={C}
      />
    </View>
  );
}

/** Texto humano que resume el período elegido. */
function describirPeriodo(p: PeriodoValue): string {
  if (!p.fechaInicio) return "Elige una fecha de inicio para definir el período.";
  if (p.modo === "horas") {
    return p.horas
      ? `Pasantía de ${p.horas} horas, desde el ${formatFecha(p.fechaInicio)}.`
      : "Indica cuántas horas debe cumplir el estudiante.";
  }
  if (!p.fechaFin) return "Completa la duración para calcular la fecha de fin.";
  const meses = p.meses ?? mesesEntre(p.fechaInicio, p.fechaFin);
  const ciclosTxt =
    p.modo === "ciclos" && p.ciclos
      ? `${p.ciclos} ${p.ciclos === 1 ? "ciclo" : "ciclos"} · `
      : "";
  return `${ciclosTxt}${meses} ${meses === 1 ? "mes" : "meses"}: del ${formatFecha(p.fechaInicio)} al ${formatFecha(p.fechaFin)}.`;
}

const makeStyles = (C: GradlyColors) =>
  StyleSheet.create({
    label: {
      color: C.textMuted,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.3,
      marginBottom: 8,
    },
    input: {
      backgroundColor: C.white4,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: C.textPrimary,
      fontSize: 13,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    inputOk: {
      borderColor: C.success,
    },
    segment: {
      flexDirection: "row",
      gap: 8,
    },
    segmentBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.white4,
    },
    segmentBtnActive: {
      backgroundColor: C.primary,
      borderColor: C.primary,
    },
    segmentText: {
      color: C.textMuted,
      fontSize: 12,
      fontWeight: "600",
    },
    segmentTextActive: {
      color: "#fff",
    },
    stepperRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    stepBtn: {
      width: 46,
      height: 46,
      borderRadius: 12,
      backgroundColor: C.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    stepValue: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.white4,
    },
    stepValueNum: {
      color: C.textPrimary,
      fontSize: 22,
      fontWeight: "800",
    },
    stepValueUnit: {
      color: C.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    resumen: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      marginTop: 14,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.primary35,
      backgroundColor: C.primary12,
    },
    resumenText: {
      flex: 1,
      color: C.textPrimary,
      fontSize: 12,
      lineHeight: 18,
    },
    // ── Calendario ──
    calBackdrop: {
      flex: 1,
      backgroundColor: "rgba(7,5,15,0.75)",
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    calContainer: {
      width: "100%",
      maxWidth: 360,
      backgroundColor: C.backgroundCard,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: C.border,
      padding: 20,
    },
    calHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    calTitle: {
      color: C.textPrimary,
      fontSize: 16,
      fontWeight: "700",
    },
    calNav: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    calMonthLabel: {
      color: C.textPrimary,
      fontSize: 15,
      fontWeight: "700",
    },
    calWeekRow: {
      flexDirection: "row",
      marginBottom: 6,
    },
    calWeekday: {
      flex: 1,
      textAlign: "center",
      color: C.textMuted,
      fontSize: 12,
      fontWeight: "600",
    },
    calGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    calCell: {
      width: `${100 / 7}%`,
      aspectRatio: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    calDay: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    calDaySelected: {
      backgroundColor: C.primary,
    },
    calDayText: {
      color: C.textPrimary,
      fontSize: 13,
    },
    calDayTextDisabled: {
      color: C.textMuted,
      opacity: 0.4,
    },
    calDayTextSelected: {
      color: "#fff",
      fontWeight: "700",
    },
  });
