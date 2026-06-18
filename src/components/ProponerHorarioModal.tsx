import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  DIAS_LABORALES,
  type DiaLaboral,
  type ScheduleData,
} from "../types/chat";

const C = {
  bg: "rgba(7,5,15,0.75)",
  surface: "#0d0b1e",
  text: "#ffffff",
  textMuted: "rgba(255,255,255,0.45)",
  accent: "#8b5cf6",
  border: "rgba(139,92,246,0.25)",
  red: "#ef4444",
};

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: ScheduleData) => void;
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

export default function ProponerHorarioModal({
  visible,
  onClose,
  onSubmit,
}: Props) {
  const [dias, setDias] = useState<DiaLaboral[]>([]);
  const [horaInicio, setHoraInicio] = useState<string | null>(null);
  const [horaFin, setHoraFin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setDias([]);
      setHoraInicio(null);
      setHoraFin(null);
      setError(null);
    }
  }, [visible]);

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
    // Ordena los días según el orden natural de la semana.
    const ordenados = DIAS_LABORALES.filter((d) => dias.includes(d));
    onSubmit({ dias: ordenados, horaInicio, horaFin });
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
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Proponer horario</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>

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

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </ScrollView>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleSubmit}
            activeOpacity={0.9}
          >
            <Ionicons name="paper-plane-outline" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>Enviar propuesta</Text>
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
    maxHeight: "85%",
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
  diasRow: {
    flexDirection: "row",
    gap: 8,
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
