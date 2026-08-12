import { useMemo, useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { AutoText as Text, AutoTextInput as TextInput } from "./AutoText";
import { useTheme, type GradlyColors } from "../context/ThemeContext";
import {
  DEPARTAMENTOS_EL_SALVADOR,
  distritosDeDepartamento,
  type UbicacionEstudiante,
} from "../data/ubicacionElSalvador";

/**
 * Departamento → distrito (dependiente) → dirección específica (libre).
 * Controlado por objeto, mismo patrón que HorarioVacanteSelector: el padre
 * es dueño del estado y decide cuándo guardar.
 */
export default function UbicacionSelector({
  value,
  onChange,
  error,
}: {
  value: Partial<UbicacionEstudiante>;
  onChange: (siguiente: Partial<UbicacionEstudiante>) => void;
  error?: string;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [buscarDistrito, setBuscarDistrito] = useState("");

  const distritos = useMemo(
    () => distritosDeDepartamento(value.departamento),
    [value.departamento],
  );

  const distritosFiltrados = useMemo(() => {
    const q = buscarDistrito.trim().toLowerCase();
    if (!q) return distritos;
    return distritos.filter((m) => m.toLowerCase().includes(q));
  }, [distritos, buscarDistrito]);

  const elegirDepartamento = (d: string) => {
    if (d === value.departamento) return;
    // Cambiar de departamento invalida el distrito ya elegido (era de otro).
    onChange({ ...value, departamento: d, distrito: undefined });
    setBuscarDistrito("");
  };

  const elegirDistrito = (m: string) => {
    onChange({ ...value, distrito: m });
  };

  return (
    <View style={s.wrap}>
      <Text style={s.label}>Departamento*</Text>
      <View style={s.chipsWrap}>
        {DEPARTAMENTOS_EL_SALVADOR.map((d) => {
          const activo = value.departamento === d;
          return (
            <TouchableOpacity
              key={d}
              style={[s.chip, activo && s.chipActivo]}
              onPress={() => elegirDepartamento(d)}
              activeOpacity={0.75}
            >
              <Text style={[s.chipTxt, activo && s.chipTxtActivo]} noTranslate>
                {d}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {value.departamento ? (
        <>
          <Text style={[s.label, { marginTop: 14 }]}>Distrito*</Text>
          {distritos.length > 10 && (
            <TextInput
              style={s.buscador}
              value={buscarDistrito}
              onChangeText={setBuscarDistrito}
              placeholder="Buscar distrito…"
              placeholderTextColor={colors.textMuted}
            />
          )}
          <View style={s.chipsWrap}>
            {distritosFiltrados.map((m) => {
              const activo = value.distrito === m;
              return (
                <TouchableOpacity
                  key={m}
                  style={[s.chip, activo && s.chipActivo]}
                  onPress={() => elegirDistrito(m)}
                  activeOpacity={0.75}
                >
                  <Text style={[s.chipTxt, activo && s.chipTxtActivo]} noTranslate>
                    {m}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {distritosFiltrados.length === 0 && (
              <Text style={s.sinResultados}>Ningún distrito coincide con "{buscarDistrito}".</Text>
            )}
          </View>
        </>
      ) : null}

      <Text style={[s.label, { marginTop: 14 }]}>Dirección específica (opcional)</Text>
      <TextInput
        style={s.direccionInput}
        value={value.direccion ?? ""}
        onChangeText={(t: string) => onChange({ ...value, direccion: t })}
        placeholder="Colonia, calle, referencia…"
        placeholderTextColor={colors.textMuted}
        multiline
        numberOfLines={2}
      />

      {!!error && <Text style={s.error}>{error}</Text>}
    </View>
  );
}

const makeStyles = (COLORS: GradlyColors) =>
  StyleSheet.create({
    wrap: { gap: 2 },
    label: {
      fontSize: 13,
      fontWeight: "600",
      color: COLORS.textPrimary,
      marginBottom: 8,
    },
    chipsWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    chip: {
      paddingHorizontal: 13,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.backgroundCard,
    },
    chipActivo: {
      backgroundColor: COLORS.primary,
      borderColor: COLORS.primary,
    },
    chipTxt: { fontSize: 12.5, color: COLORS.textPrimary },
    chipTxtActivo: { color: "#fff", fontWeight: "600" },
    sinResultados: { fontSize: 12.5, color: COLORS.textMuted, fontStyle: "italic", paddingVertical: 4 },
    buscador: {
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.backgroundCard,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 13,
      color: COLORS.textPrimary,
      marginBottom: 8,
    },
    direccionInput: {
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.backgroundCard,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 13,
      color: COLORS.textPrimary,
      minHeight: 56,
      textAlignVertical: "top",
    },
    error: { fontSize: 12, color: COLORS.error, marginTop: 8 },
  });
