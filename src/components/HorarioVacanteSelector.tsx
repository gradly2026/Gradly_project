import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { AutoText as Text } from "./AutoText";
import { useTheme, type GradlyColors } from "../context/ThemeContext";
import { DIAS_LABORALES, type DiaLaboral } from "../types/chat";
import { HORAS_JORNADA, type HorarioPasantia } from "../data/disponibilidad";

/**
 * Captura el horario que la empresa DECLARA al publicar la vacante
 * (días + entrada/salida), en vez de negociarlo después por chat.
 *
 * Declararlo por adelantado es lo que permite que la universidad sepa, antes
 * de reclamar cupos, cuántos de sus alumnos pueden realmente cumplirlo
 * (ver `compatibilidadConHorario`). El chat de negociación sigue existiendo
 * como excepción, no como paso obligatorio.
 */
export default function HorarioVacanteSelector({
  value,
  onChange,
  error,
  requerido = true,
}: {
  value: Partial<HorarioPasantia>;
  onChange: (siguiente: Partial<HorarioPasantia>) => void;
  error?: string;
  /**
   * `false` en Vacante + "Por proyecto": un trabajo por entregables no
   * siempre tiene horario semanal fijo. Solo cambia el rótulo/ayuda — si el
   * usuario empieza a llenarlo de todos modos, debe quedar completo (lo exige
   * `valHorarioCondicional` del lado del formulario).
   */
  requerido?: boolean;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [picker, setPicker] = useState<"inicio" | "fin" | null>(null);

  const dias = value.dias ?? [];

  const toggleDia = (d: DiaLaboral) => {
    const siguiente = dias.includes(d) ? dias.filter((x) => x !== d) : [...dias, d];
    // Se reordena a Lun→Vie para guardar un dato estable.
    onChange({ ...value, dias: DIAS_LABORALES.filter((x) => siguiente.includes(x)) });
  };

  const elegirHora = (h: string) => {
    onChange(picker === "inicio" ? { ...value, horaInicio: h } : { ...value, horaFin: h });
    setPicker(null);
  };

  return (
    <View style={s.wrap}>
      <Text style={s.label}>{requerido ? "Horario*" : "Horario (opcional)"}</Text>

      <View style={s.diasRow}>
        {DIAS_LABORALES.map((d) => {
          const activo = dias.includes(d);
          return (
            <TouchableOpacity
              key={d}
              style={[s.diaChip, activo && s.diaChipOn]}
              onPress={() => toggleDia(d)}
              activeOpacity={0.7}
            >
              <Text style={[s.diaTxt, activo && s.diaTxtOn]}>{d.slice(0, 3)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={s.horasRow}>
        <TouchableOpacity style={s.horaBox} onPress={() => setPicker("inicio")} activeOpacity={0.7}>
          <Text style={s.horaCaption}>Entrada</Text>
          <Text style={[s.horaValor, !value.horaInicio && s.horaVacia]}>
            {value.horaInicio ?? "Elegir"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.horaBox} onPress={() => setPicker("fin")} activeOpacity={0.7}>
          <Text style={s.horaCaption}>Salida</Text>
          <Text style={[s.horaValor, !value.horaFin && s.horaVacia]}>
            {value.horaFin ?? "Elegir"}
          </Text>
        </TouchableOpacity>
      </View>

      {!!error && <Text style={s.error}>{error}</Text>}
      <Text style={s.ayuda}>
        💡 Los estudiantes ven este horario antes de postularse, y el sistema avisa a las
        universidades cuántos de sus alumnos pueden cumplirlo.
      </Text>

      <Modal visible={picker !== null} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <Pressable style={s.backdrop} onPress={() => setPicker(null)}>
          <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={s.sheetTitle}>
              {picker === "inicio" ? "Hora de entrada" : "Hora de salida"}
            </Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {HORAS_JORNADA.map((h) => {
                const sel = (picker === "inicio" ? value.horaInicio : value.horaFin) === h;
                return (
                  <TouchableOpacity
                    key={h}
                    style={[s.horaItem, sel && s.horaItemOn]}
                    onPress={() => elegirHora(h)}
                  >
                    <Text style={[s.horaItemTxt, sel && s.horaItemTxtOn]}>{h}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const makeStyles = (COLORS: GradlyColors) =>
  StyleSheet.create({
    wrap: { gap: 8, marginBottom: 14 },
    label: { color: COLORS.textPrimary, fontSize: 13, fontWeight: "600" },
    diasRow: { flexDirection: "row", gap: 6 },
    diaChip: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.backgroundCard,
      alignItems: "center",
    },
    diaChipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
    diaTxt: { color: COLORS.textMuted, fontSize: 12, fontWeight: "600" },
    diaTxtOn: { color: "#FFF" },
    horasRow: { flexDirection: "row", gap: 10 },
    horaBox: {
      flex: 1,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.backgroundCard,
      borderRadius: 10,
      paddingVertical: 9,
      paddingHorizontal: 12,
    },
    horaCaption: { color: COLORS.textMuted, fontSize: 10.5, marginBottom: 2 },
    horaValor: { color: COLORS.textPrimary, fontSize: 13.5, fontWeight: "600" },
    horaVacia: { color: COLORS.textMuted, fontWeight: "400" },
    error: { color: COLORS.error, fontSize: 11.5 },
    ayuda: { color: COLORS.textMuted, fontSize: 11, lineHeight: 15 },
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    sheet: {
      width: "100%",
      maxWidth: 340,
      backgroundColor: COLORS.backgroundCard,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: COLORS.border,
      padding: 16,
    },
    sheetTitle: {
      color: COLORS.textPrimary,
      fontSize: 15,
      fontWeight: "700",
      marginBottom: 10,
    },
    horaItem: { paddingVertical: 11, paddingHorizontal: 12, borderRadius: 9 },
    horaItemOn: { backgroundColor: COLORS.primary },
    horaItemTxt: { color: COLORS.textPrimary, fontSize: 13.5 },
    horaItemTxtOn: { color: "#FFF", fontWeight: "700" },
  });
