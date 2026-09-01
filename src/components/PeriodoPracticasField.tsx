import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  StyleSheet,


  TouchableOpacity,
  View,
} from "react-native";
import { AutoText as Text, AutoTextInput as TextInput } from "./AutoText";
import { useTheme, type GradlyColors } from "../context/ThemeContext";
import CalendarPickerModal from "./CalendarPickerModal";

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

export type ModoPeriodo = "ciclos" | "horas";

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

/**
 * Horas de práctica que equivale un ciclo universitario completo. Es el piso
 * del rango de inmersión a tiempo completo en El Salvador (700–1056 h; el
 * servicio social de ley —500 h— es aparte y NO es lo que gestiona Gradly).
 * Se usa como valor por defecto al medir "por ciclos"; el usuario puede
 * ajustarlo (varía por facultad: part-time 300–400, UES ley 940–1056,
 * Salud/Internado 2000+).
 */
export const HORAS_POR_CICLO = 700;

/** Piso de horas de un grupo en modo 'horas'. Un grupo puede durar tan poco
 *  como 1 hora — no se impone ningún mínimo mayor. */
export const MIN_HORAS = 1;

export const PERIODO_VACIO: PeriodoValue = {
  modo: "ciclos",
  fechaInicio: null,
  fechaFin: null,
  ciclos: 1,
  meses: MESES_POR_CICLO,
  horas: HORAS_POR_CICLO,
};

// ── Utilidades de fecha ──────────────────────────────────────────────
const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

const addMonths = (d: Date, m: number) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + m);
  return x;
};

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

/** True si el período tiene los datos mínimos para guardarse. */
export function periodoValido(p: PeriodoValue): boolean {
  if (!p.fechaInicio) return false;
  if (p.modo === "ciclos") {
    return !!p.ciclos && p.ciclos >= 1 && p.ciclos <= MAX_CICLOS
      && !!p.horas && p.horas >= MIN_HORAS;
  }
  if (p.modo === "horas") return !!p.horas && p.horas >= MIN_HORAS;
  return false;
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
  // Sin el modo "fecha" manual, el único selector es la fecha de inicio.
  const [picker, setPicker] = useState<"inicio" | null>(null);
  // En modo 'ciclos' las horas se derivan del nº de ciclos (× HORAS_POR_CICLO)
  // salvo que el usuario las haya ajustado a mano — ahí se congelan.
  const [horasCicloTocado, setHorasCicloTocado] = useState(false);

  const today = useMemo(() => startOfDay(new Date()), []);
  const maxDate = useMemo(() => addMonths(today, 48), [today]); // hasta 4 años

  // Recalcula fechaFin/meses/horas según el modo cuando cambian inicio o ciclos.
  const emitir = (parcial: Partial<PeriodoValue>) => {
    const next: PeriodoValue = { ...value, ...parcial };
    if (next.modo === "ciclos") {
      const n = next.ciclos ?? 1;
      next.meses = n * MESES_POR_CICLO;
      if (next.fechaInicio) next.fechaFin = addMonths(next.fechaInicio, next.meses);
      // Horas estimadas del ciclo; se dejan de auto-derivar si el usuario las tocó.
      if (parcial.horas === undefined && !horasCicloTocado) {
        next.horas = n * HORAS_POR_CICLO;
      }
    } else if (next.modo === "horas") {
      next.ciclos = null;
      next.fechaFin = null;
      next.meses = null;
    }
    onChange(next);
  };

  const seleccionarFecha = (date: Date) => {
    emitir({ fechaInicio: date });
    setPicker(null);
  };

  const setCiclos = (n: number) => {
    const clamped = Math.min(MAX_CICLOS, Math.max(1, n));
    emitir({ ciclos: clamped });
  };

  const cambiarModo = (key: ModoPeriodo) => {
    // Al volver a 'ciclos', las horas vuelven a derivarse solas.
    if (key === "ciclos") setHorasCicloTocado(false);
    emitir({ modo: key });
  };

  const editarHorasCiclo = (t: string) => {
    setHorasCicloTocado(true);
    const n = Number(t.replace(/\D/g, "").slice(0, 5));
    emitir({ horas: n >= MIN_HORAS ? n : null });
  };

  const MODOS: { key: ModoPeriodo; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: "ciclos", label: "Por ciclos", icon: "repeat-outline" },
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
              onPress={() => cambiarModo(m.key)}
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

          {/* Horas estimadas del ciclo (prellenadas, editables) */}
          <Text style={[styles.label, { marginTop: 14 }]}>HORAS DE PRÁCTICA A CUMPLIR *</Text>
          <TextInput
            style={[styles.input, value.horas ? styles.inputOk : null, { color: C.textPrimary }]}
            value={value.horas ? String(value.horas) : ""}
            onChangeText={editarHorasCiclo}
            placeholder={`Ej. ${HORAS_POR_CICLO}`}
            placeholderTextColor={C.textMuted}
            keyboardType="number-pad"
            selectionColor={C.primary}
          />
          <Text style={styles.hint}>
            {horasCicloTocado
              ? "Ajustaste el total. Cambiar de ciclos ya no lo recalcula."
              : `Estimado: ${(value.ciclos ?? 1) * HORAS_POR_CICLO} h (${HORAS_POR_CICLO} h por ciclo). Puedes ajustarlo si tu facultad exige otro total.`}
          </Text>
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
              emitir({ horas: n >= MIN_HORAS ? n : null });
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

      <CalendarPickerModal
        visible={picker !== null}
        value={value.fechaInicio}
        minimumDate={today}
        maximumDate={maxDate}
        title="Fecha de inicio"
        onSelect={seleccionarFecha}
        onClose={() => setPicker(null)}
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
  const horasTxt = p.modo === "ciclos" && p.horas ? ` · ${p.horas} h de práctica` : "";
  return `${ciclosTxt}${meses} ${meses === 1 ? "mes" : "meses"}${horasTxt}: del ${formatFecha(p.fechaInicio)} al ${formatFecha(p.fechaFin)}.`;
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
    hint: {
      color: C.textMuted,
      fontSize: 11,
      lineHeight: 15,
      marginTop: 6,
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
  });
