import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import {
  calcularRango,
  progresoRango,
  type EntidadRol,
} from "../services/feedbackService";

interface Props {
  /** Puntos de experiencia acumulados (`puntos_experiencia`). */
  xp: number;
  /** Calificación promedio (`calificacion_promedio`). */
  calificacion?: number;
  /** Pasantías completadas (`pasantias_completadas`). */
  pasantias?: number;
  rol: EntidadRol;
  theme?: "dark" | "light";
}

/** Icono de medalla por tier. */
const TIER_ICON = {
  bronce: "medal-outline",
  plata: "medal",
  oro: "trophy",
} as const;

/** Fila de 5 estrellas (soporta media estrella). */
function Estrellas({ valor, color }: { valor: number; color: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const name =
          valor >= n ? "star" : valor >= n - 0.5 ? "star-half" : "star-outline";
        return <Ionicons key={n} name={name} size={15} color={color} />;
      })}
    </View>
  );
}

/**
 * Tarjeta de rango gamificado: nivel con color metálico (oro/plata/bronce),
 * barra de progreso de XP y calificación con estrellas. Reutilizable para
 * estudiantes y empresas, en sus perfiles propios y públicos.
 */
export default function RangoCard({
  xp,
  calificacion = 0,
  pasantias = 0,
  rol,
  theme = "dark",
}: Props) {
  const dark = theme !== "light";
  const T = {
    card: dark ? "rgba(255,255,255,0.04)" : "#f8f9fa",
    border: dark ? "rgba(139,92,246,0.22)" : "rgba(139,92,246,0.18)",
    text: dark ? "#f4f1ff" : "#111827",
    sub: dark ? "rgba(255,255,255,0.55)" : "#6b7280",
    track: dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)",
    star: "#f5b50a",
  };

  const xpSeguro = Math.max(0, Number(xp) || 0);
  const rango = calcularRango(xpSeguro, rol);
  const progreso = progresoRango(xpSeguro, rango);
  const faltan = rango.siguiente !== null ? rango.siguiente - xpSeguro : 0;

  return (
    <View style={[styles.card, { backgroundColor: T.card, borderColor: T.border }]}>
      {/* Cabecera: medalla + nivel */}
      <View style={styles.top}>
        <View
          style={[
            styles.medal,
            { borderColor: rango.color, backgroundColor: `${rango.color}22` },
          ]}
        >
          <Ionicons name={TIER_ICON[rango.tier]} size={24} color={rango.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.nivel, { color: rango.color }]} numberOfLines={1}>
            {rango.nivel}
          </Text>
          <View style={styles.estrellasRow}>
            <Estrellas valor={calificacion} color={T.star} />
            <Text style={[styles.califText, { color: T.sub }]}>
              {calificacion > 0 ? calificacion.toFixed(1) : "Sin calificaciones"}
            </Text>
          </View>
        </View>
        <View style={styles.xpPill}>
          <Text style={[styles.xpPillNum, { color: rango.color }]}>
            {xpSeguro}
          </Text>
          <Text style={[styles.xpPillLabel, { color: T.sub }]}>XP</Text>
        </View>
      </View>

      {/* Barra de progreso de XP */}
      <View style={[styles.track, { backgroundColor: T.track }]}>
        <View
          style={[
            styles.fill,
            { width: `${Math.round(progreso * 100)}%`, backgroundColor: rango.color },
          ]}
        />
      </View>
      <View style={styles.metaRow}>
        <Text style={[styles.meta, { color: T.sub }]}>
          {rango.siguiente !== null
            ? `${faltan} XP para el siguiente rango`
            : "Rango máximo alcanzado"}
        </Text>
        <Text style={[styles.meta, { color: T.sub }]}>
          {pasantias} pasantía{pasantias === 1 ? "" : "s"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  medal: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  nivel: {
    fontSize: 16,
    fontWeight: "900",
  },
  estrellasRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  califText: {
    fontSize: 12,
    fontWeight: "600",
  },
  xpPill: {
    alignItems: "center",
    minWidth: 44,
  },
  xpPillNum: {
    fontSize: 20,
    fontWeight: "900",
  },
  xpPillLabel: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: -2,
  },
  track: {
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 5,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  meta: {
    fontSize: 11,
    fontWeight: "600",
  },
});
