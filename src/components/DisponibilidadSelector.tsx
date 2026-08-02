import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { AutoText as Text } from "./AutoText";
import { useTheme, type GradlyColors } from "../context/ThemeContext";
import { DIAS_LABORALES, type DiaLaboral } from "../types/chat";
import {
  BLOQUES,
  alternarBloque,
  contarBloques,
  type BloqueId,
  type DisponibilidadHoraria,
} from "../data/disponibilidad";

/**
 * Malla de disponibilidad (5 días × 3 bloques) que el estudiante marca.
 * Sustituye al campo de texto libre: el dato resultante SÍ se puede comparar
 * contra el horario de una pasantía.
 *
 * `readOnly` sirve para mostrarla en perfiles ajenos (universidad/empresa)
 * sin permitir edición.
 */
export default function DisponibilidadSelector({
  value,
  onChange,
  readOnly = false,
}: {
  value: DisponibilidadHoraria;
  onChange?: (siguiente: DisponibilidadHoraria) => void;
  readOnly?: boolean;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const total = contarBloques(value);

  const toggle = (dia: DiaLaboral, bloque: BloqueId) => {
    if (readOnly || !onChange) return;
    onChange(alternarBloque(value, dia, bloque));
  };

  /** Marca/desmarca una fila completa (atajo para "toda la mañana"). */
  const toggleFila = (bloque: BloqueId) => {
    if (readOnly || !onChange) return;
    const todosMarcados = DIAS_LABORALES.every((d) => (value[d] ?? []).includes(bloque));
    let siguiente = value;
    for (const dia of DIAS_LABORALES) {
      const marcado = (siguiente[dia] ?? []).includes(bloque);
      if (marcado === todosMarcados) siguiente = alternarBloque(siguiente, dia, bloque);
    }
    onChange(siguiente);
  };

  return (
    <View style={s.wrap}>
      {!readOnly && (
        <Text style={s.ayuda}>
          Marca las horas en que estás libre de clases. La universidad usa esto para
          buscarte una pasantía con un horario que sí puedas cumplir.
        </Text>
      )}

      {/* Cabecera: días */}
      <View style={s.fila}>
        <View style={s.celdaEtiqueta} />
        {DIAS_LABORALES.map((dia) => (
          <View key={dia} style={s.celdaDia}>
            <Text style={s.diaTxt}>{dia.slice(0, 3)}</Text>
          </View>
        ))}
      </View>

      {/* Una fila por bloque horario */}
      {BLOQUES.map((bloque) => (
        <View key={bloque.id} style={s.fila}>
          <TouchableOpacity
            style={s.celdaEtiqueta}
            onPress={() => toggleFila(bloque.id)}
            disabled={readOnly}
            activeOpacity={readOnly ? 1 : 0.6}
          >
            <Text style={s.bloqueTxt}>{bloque.nombre}</Text>
            <Text style={s.rangoTxt}>{bloque.rango}</Text>
          </TouchableOpacity>

          {DIAS_LABORALES.map((dia) => {
            const activo = (value[dia] ?? []).includes(bloque.id);
            return (
              <TouchableOpacity
                key={`${dia}-${bloque.id}`}
                style={[s.celda, activo && s.celdaActiva]}
                onPress={() => toggle(dia, bloque.id)}
                disabled={readOnly}
                activeOpacity={readOnly ? 1 : 0.7}
              >
                {activo && (
                  <Ionicons name="checkmark" size={15} color={colors.textPrimary} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      <View style={s.pie}>
        <Ionicons
          name={total > 0 ? "time-outline" : "alert-circle-outline"}
          size={15}
          color={total > 0 ? colors.success : colors.warning}
        />
        <Text style={[s.pieTxt, { color: total > 0 ? colors.textMuted : colors.warning }]}>
          {total > 0
            ? `${total} bloques disponibles`
            : "Sin disponibilidad marcada — no podremos asignarte pasantías"}
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (COLORS: GradlyColors) =>
  StyleSheet.create({
    wrap: { gap: 6 },
    ayuda: {
      color: COLORS.textMuted,
      fontSize: 12,
      lineHeight: 17,
      marginBottom: 6,
    },
    fila: { flexDirection: "row", alignItems: "stretch", gap: 6 },
    celdaEtiqueta: { width: 78, justifyContent: "center", paddingVertical: 4 },
    celdaDia: { flex: 1, alignItems: "center", paddingBottom: 4 },
    diaTxt: {
      color: COLORS.textMuted,
      fontSize: 11,
      fontWeight: "600",
    },
    bloqueTxt: { color: COLORS.textPrimary, fontSize: 12, fontWeight: "600" },
    rangoTxt: { color: COLORS.textMuted, fontSize: 10, marginTop: 1 },
    celda: {
      flex: 1,
      height: 38,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.backgroundCard,
      alignItems: "center",
      justifyContent: "center",
    },
    celdaActiva: {
      backgroundColor: COLORS.primary,
      borderColor: COLORS.primary,
    },
    pie: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 8,
    },
    pieTxt: { fontSize: 11.5, flex: 1, lineHeight: 16 },
  });
