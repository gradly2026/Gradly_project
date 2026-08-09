import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,


  TouchableOpacity,
  View,
} from "react-native";
import { AutoText as Text, AutoTextInput as TextInput } from "./AutoText";
import {
  DIAS_LABORALES,
  type AcuerdoData,
  type DiaLaboral,
} from "../types/chat";

const C = {
  bg: "rgba(7,5,15,0.75)",
  surface: "#0d0b1e",
  text: "#ffffff",
  textMuted: "rgba(255,255,255,0.45)",
  accent: "#8b5cf6",
  green: "#10b981",
  border: "rgba(139,92,246,0.25)",
  red: "#ef4444",
};

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: AcuerdoData) => void;
  /** Título del sheet. Por defecto "Proponer acuerdo". */
  title?: string;
  /** Texto del botón de envío. Por defecto "Enviar propuesta". */
  submitLabel?: string;
  /**
   * Si es `false`, oculta la sección de "Pago" por completo (el acuerdo se
   * envía siempre como `sin_pago`). Pensado para contrataciones de vacantes
   * individuales, donde el salario se negocia de forma privada entre la
   * empresa y el graduado, fuera de Gradly.
   */
  showPago?: boolean;
  /** Nota aclaratoria opcional, mostrada debajo del título. */
  helperText?: string;
}

/** Genera horas en formato 12h cada 30 min entre 06:00 AM y 08:00 PM. */
function buildHoras(): string[] {
  const horas: string[] = [];
  for (let h = 6; h <= 20; h++) {
    for (const min of [0, 30]) {
      const periodo = h < 12 ? "AM" : "PM";
      const h12 = h % 12 === 0 ? 12 : h % 12;
      const hh = String(h12).padStart(2, "0");
      const mm = String(min).padStart(2, "0");
      horas.push(`${hh}:${mm} ${periodo}`);
    }
  }
  return horas;
}

const HORAS = buildHoras();

/** Opciones de inicio (relativas a hoy) → días a sumar. */
const INICIO_OPCIONES: { label: string; addDays: number }[] = [
  { label: "Hoy", addDays: 0 },
  { label: "En 1 semana", addDays: 7 },
  { label: "En 2 semanas", addDays: 14 },
];

/** Opciones de duración en semanas. */
const DURACIONES = [4, 8, 12, 16];

/** Suma días a una fecha y devuelve ISO `yyyy-mm-dd`. */
function isoSumandoDias(addDays: number, base = new Date()): string {
  const d = new Date(base);
  d.setDate(d.getDate() + addDays);
  return d.toISOString().slice(0, 10);
}

export default function ProponerHorarioModal({
  visible,
  onClose,
  onSubmit,
  title = "Proponer acuerdo",
  submitLabel = "Enviar propuesta",
  showPago = true,
  helperText,
}: Props) {
  const [dias, setDias] = useState<DiaLaboral[]>([]);
  const [horaInicio, setHoraInicio] = useState<string | null>(null);
  const [horaFin, setHoraFin] = useState<string | null>(null);
  const [inicioIdx, setInicioIdx] = useState(0);
  const [semanas, setSemanas] = useState(8);
  const [conPago, setConPago] = useState(false);
  const [monto, setMonto] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setDias([]);
      setHoraInicio(null);
      setHoraFin(null);
      setInicioIdx(0);
      setSemanas(8);
      setConPago(false);
      setMonto("");
      setError(null);
    }
  }, [visible]);

  // Fechas calculadas a partir de inicio + duración (para mostrar al usuario).
  const { fechaInicio, fechaFin } = useMemo(() => {
    const addInicio = INICIO_OPCIONES[inicioIdx]?.addDays ?? 0;
    const fi = isoSumandoDias(addInicio);
    const ff = isoSumandoDias(addInicio + semanas * 7);
    return { fechaInicio: fi, fechaFin: ff };
  }, [inicioIdx, semanas]);

  const toggleDia = (dia: DiaLaboral) => {
    setError(null);
    setDias((prev) =>
      prev.includes(dia) ? prev.filter((d) => d !== dia) : [...prev, dia],
    );
  };

  const handleSubmit = () => {
    if (dias.length === 0) {
      setError("Selecciona al menos un día.");
      return;
    }
    if (!horaInicio || !horaFin) {
      setError("Selecciona la hora de inicio y de fin.");
      return;
    }
    if (HORAS.indexOf(horaFin) <= HORAS.indexOf(horaInicio)) {
      setError("La hora de fin debe ser posterior a la de inicio.");
      return;
    }
    let pagoMonto: number | undefined;
    if (showPago && conPago) {
      pagoMonto = Number(monto.replace(",", "."));
      if (!pagoMonto || pagoMonto <= 0) {
        setError("Ingresa un monto válido por estudiante.");
        return;
      }
    }
    // Ordena los días según el orden natural de la semana.
    const ordenados = DIAS_LABORALES.filter((d) => dias.includes(d));
    onSubmit({
      dias: ordenados,
      horaInicio,
      horaFin,
      fechaInicio,
      fechaFin,
      pago: showPago && conPago
        ? { tipo: "con_pago", monto: pagoMonto, moneda: "USD" }
        : { tipo: "sin_pago" },
    });
  };

  const renderHoras = (
    seleccion: string | null,
    onPick: (h: string) => void,
  ) => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
    >
      {HORAS.map((h) => {
        const activa = seleccion === h;
        return (
          <TouchableOpacity
            key={h}
            style={[styles.horaChip, activa && styles.horaChipActive]}
            onPress={() => {
              setError(null);
              onPick(h);
            }}
            activeOpacity={0.85}
          >
            <Text style={[styles.horaText, activa && styles.horaTextActive]}>
              {h}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  return (
    <Modal
      visible={visible}
      transparent
      // "none" (antes "slide"): la animación de entrada de react-native-web
      // anima un `transform: translateY()` en dos pasos de render; si el
      // segundo paso no llega a pintarse a tiempo, el modal queda con el
      // `translateY` inicial (una pantalla completa hacia abajo) — invisible
      // y sin forma de hacerle scroll para alcanzarlo. Reproducido de forma
      // consistente al aceptar un grupo desde Matchmaking (el selector de
      // horario nunca llegaba a aparecer). Sin animación, el modal usa un
      // `position: fixed` estático y siempre aparece en su lugar.
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          {!!helperText && (
            <View style={styles.helperBox}>
              <Ionicons name="information-circle-outline" size={16} color={C.accent} />
              <Text style={styles.helperText}>{helperText}</Text>
            </View>
          )}

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>Días (Lunes a Viernes)</Text>
            <View style={styles.diasRow}>
              {DIAS_LABORALES.map((dia) => {
                const activa = dias.includes(dia);
                return (
                  <TouchableOpacity
                    key={dia}
                    style={[styles.diaChip, activa && styles.diaChipActive]}
                    onPress={() => toggleDia(dia)}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[styles.diaText, activa && styles.diaTextActive]}
                    >
                      {dia.slice(0, 3)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.label, { marginTop: 18 }]}>Hora de inicio</Text>
            {renderHoras(horaInicio, setHoraInicio)}

            <Text style={[styles.label, { marginTop: 18 }]}>Hora de fin</Text>
            {renderHoras(horaFin, setHoraFin)}

            {/* ── Inicio de la pasantía ── */}
            <Text style={[styles.label, { marginTop: 18 }]}>
              Inicio de la pasantía
            </Text>
            <View style={styles.diasRow}>
              {INICIO_OPCIONES.map((op, idx) => {
                const activa = inicioIdx === idx;
                return (
                  <TouchableOpacity
                    key={op.label}
                    style={[styles.pillChip, activa && styles.diaChipActive]}
                    onPress={() => setInicioIdx(idx)}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[styles.diaText, activa && styles.diaTextActive]}
                    >
                      {op.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── Duración ── */}
            <Text style={[styles.label, { marginTop: 18 }]}>Duración</Text>
            <View style={styles.diasRow}>
              {DURACIONES.map((sem) => {
                const activa = semanas === sem;
                return (
                  <TouchableOpacity
                    key={sem}
                    style={[styles.pillChip, activa && styles.diaChipActive]}
                    onPress={() => setSemanas(sem)}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[styles.diaText, activa && styles.diaTextActive]}
                    >
                      {sem} sem
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.fechasHint}>
              Del {fechaInicio} al {fechaFin}
            </Text>

            {/* ── Pago ── */}
            {showPago && (
              <>
                <Text style={[styles.label, { marginTop: 18 }]}>Pago</Text>
                <View style={styles.diasRow}>
                  <TouchableOpacity
                    style={[styles.pillChip, !conPago && styles.diaChipActive]}
                    onPress={() => {
                      setError(null);
                      setConPago(false);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.diaText, !conPago && styles.diaTextActive]}>
                      Sin pago
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.pillChip,
                      conPago && { backgroundColor: C.green, borderColor: C.green },
                    ]}
                    onPress={() => {
                      setError(null);
                      setConPago(true);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.diaText, conPago && styles.diaTextActive]}>
                      Con pago
                    </Text>
                  </TouchableOpacity>
                </View>

                {conPago && (
                  <View style={styles.montoRow}>
                    <Text style={styles.montoSign}>$</Text>
                    <TextInput
                      style={styles.montoInput}
                      value={monto}
                      onChangeText={(t) => {
                        setError(null);
                        setMonto(t);
                      }}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={C.textMuted}
                    />
                    <Text style={styles.montoHint}>por estudiante</Text>
                  </View>
                )}
              </>
            )}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </ScrollView>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleSubmit}
            activeOpacity={0.9}
          >
            <Ionicons name="paper-plane-outline" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>{submitLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: C.bg,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    padding: 24,
    maxHeight: "88%",
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
  label: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 10,
  },
  helperBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "rgba(139,92,246,0.1)",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  helperText: {
    flex: 1,
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    lineHeight: 17,
  },
  diasRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  diaChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  pillChip: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  diaChipActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  diaText: {
    color: C.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },
  diaTextActive: {
    color: "#fff",
  },
  horaChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  horaChipActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  horaText: {
    color: C.text,
    fontSize: 13,
    fontWeight: "600",
  },
  horaTextActive: {
    color: "#fff",
  },
  fechasHint: {
    color: C.accent,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 10,
  },
  montoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  montoSign: {
    color: C.green,
    fontSize: 18,
    fontWeight: "700",
  },
  montoInput: {
    flex: 1,
    color: C.text,
    fontSize: 16,
    fontWeight: "600",
    paddingVertical: 12,
  },
  montoHint: {
    color: C.textMuted,
    fontSize: 12,
  },
  errorText: {
    color: C.red,
    fontSize: 13,
    marginTop: 14,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 18,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});
