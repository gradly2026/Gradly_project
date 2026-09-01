import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Modal, StyleSheet, TouchableOpacity, View } from "react-native";
import { AutoText as Text } from "./AutoText";
import { useTheme, type GradlyColors } from "../context/ThemeContext";

// ════════════════════════════════════════════════════════════════════
//  CalendarPickerModal — calendario mensual autónomo (sin dependencias
//  nativas). Extraído de PeriodoPracticasField para reutilizarlo también
//  al fijar el "Día 1" de un estudiante (Fase C) y en el calendario de la
//  pasantía (Fase E). Elegir un día llama `onSelect(dia)`.
// ════════════════════════════════════════════════════════════════════

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const DIAS_SEMANA = ["D", "L", "M", "M", "J", "V", "S"];
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export default function CalendarPickerModal({
  visible,
  value,
  minimumDate,
  maximumDate,
  title,
  onSelect,
  onClose,
}: {
  visible: boolean;
  value: Date | null;
  minimumDate: Date;
  maximumDate: Date;
  title: string;
  onSelect: (d: Date) => void;
  onClose: () => void;
}) {
  const { colors: C } = useTheme();
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
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.container} activeOpacity={1} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.nav}>
            <TouchableOpacity onPress={goPrev} disabled={!canPrev} style={{ opacity: canPrev ? 1 : 0.3, padding: 6 }}>
              <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{MESES[viewMonth]} {viewYear}</Text>
            <TouchableOpacity onPress={goNext} disabled={!canNext} style={{ opacity: canNext ? 1 : 0.3, padding: 6 }}>
              <Ionicons name="chevron-forward" size={22} color={C.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {DIAS_SEMANA.map((d, i) => (
              <Text key={i} style={styles.weekday}>{d}</Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((cell, idx) => {
              if (!cell) return <View key={idx} style={styles.cell} />;
              const day = startOfDay(cell);
              const disabled = day < minDay || day > maxDay;
              const selected = value ? sameDay(day, value) : false;
              return (
                <TouchableOpacity key={idx} style={styles.cell} disabled={disabled} activeOpacity={0.7} onPress={() => onSelect(day)}>
                  <View style={[styles.day, selected && styles.daySelected]}>
                    <Text style={[styles.dayText, disabled && styles.dayTextDisabled, selected && styles.dayTextSelected]}>
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

const makeStyles = (C: GradlyColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(7,5,15,0.75)",
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    container: {
      width: "100%",
      maxWidth: 360,
      backgroundColor: C.backgroundCard,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: C.border,
      padding: 20,
    },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    title: { color: C.textPrimary, fontSize: 16, fontWeight: "700" },
    nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    monthLabel: { color: C.textPrimary, fontSize: 15, fontWeight: "700" },
    weekRow: { flexDirection: "row", marginBottom: 6 },
    weekday: { flex: 1, textAlign: "center", color: C.textMuted, fontSize: 12, fontWeight: "600" },
    grid: { flexDirection: "row", flexWrap: "wrap" },
    cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
    day: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    daySelected: { backgroundColor: C.primary },
    dayText: { color: C.textPrimary, fontSize: 13 },
    dayTextDisabled: { color: C.textMuted, opacity: 0.4 },
    dayTextSelected: { color: "#fff", fontWeight: "700" },
  });
