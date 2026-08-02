import { Ionicons } from "@expo/vector-icons";
import { Image, StyleSheet, View } from "react-native";
import { AutoText as Text } from "./AutoText";
import {
  calcularRango,
  progresoRango,
} from "../services/feedbackService";

const GRADLY_LOGO = require("../../assets/images/LogoGradly.png");

interface Props {
  /** Puntos de experiencia acumulados (`puntos_experiencia`). */
  xp: number;
  calificacion?: number;
  pasantias?: number;
  /** Nombre del titular del certificado. */
  nombre?: string;
  theme?: "dark" | "light";
}

/** Medalla por tier. */
const TIER_ICON = {
  bronce: "ribbon",
  plata: "ribbon",
  oro: "trophy",
} as const;

/** Etiqueta de prestigio por tier. */
const TIER_SELLO = {
  bronce: "Talento Gradly",
  plata: "Talento Profesional",
  oro: "Talento Destacado",
} as const;

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
 * Certificación digital de Gradly para estudiantes: presenta el rango como un
 * diploma verificado, con sello metálico (bronce/plata/oro). Un "Máster /
 * Talento Destacado" luce un certificado dorado muy atractivo para las empresas.
 */
export default function CertificadoGradly({
  xp,
  calificacion = 0,
  pasantias = 0,
  nombre,
  theme = "dark",
}: Props) {
  const dark = theme !== "light";
  const T = {
    bg: dark ? "#100a22" : "#fbfaff",
    sub: dark ? "rgba(255,255,255,0.55)" : "#6b7280",
    text: dark ? "#f4f1ff" : "#1b1430",
    track: dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)",
    star: "#f5b50a",
  };

  const xpSeguro = Math.max(0, Number(xp) || 0);
  const rango = calcularRango(xpSeguro, "estudiante");
  const progreso = progresoRango(xpSeguro, rango);
  const faltan = rango.siguiente !== null ? rango.siguiente - xpSeguro : 0;
  const esTop = rango.tier === "oro";

  return (
    <View
      style={[
        styles.cert,
        { backgroundColor: T.bg, borderColor: rango.color },
        esTop && styles.certTop,
      ]}
    >
      {/* Marca de agua / esquinas decorativas */}
      <View style={[styles.corner, styles.cornerTL, { borderColor: rango.color }]} />
      <View style={[styles.corner, styles.cornerBR, { borderColor: rango.color }]} />

      {/* Encabezado: marca Gradly + verificación */}
      <View style={styles.header}>
        <Image source={GRADLY_LOGO} style={styles.logo} resizeMode="contain" />
        <Text style={[styles.brand, { color: T.sub }]}>
          CERTIFICACIÓN GRADLY
        </Text>
        <View style={[styles.sello, { borderColor: rango.color }]}>
          <Ionicons name="shield-checkmark" size={12} color={rango.color} />
          <Text style={[styles.selloText, { color: rango.color }]}>
            {TIER_SELLO[rango.tier]}
          </Text>
        </View>
      </View>

      {/* Cuerpo: medalla + rango */}
      <View style={styles.body}>
        <View
          style={[
            styles.medal,
            { borderColor: rango.color, backgroundColor: `${rango.color}1f` },
          ]}
        >
          <Ionicons name={TIER_ICON[rango.tier]} size={34} color={rango.color} />
        </View>
        {nombre ? (
          <Text style={[styles.nombre, { color: T.text }]} numberOfLines={1}>
            {nombre}
          </Text>
        ) : null}
        <Text style={[styles.rango, { color: rango.color }]} numberOfLines={1}>
          {rango.nivel}
        </Text>
        <View style={styles.estrellasRow}>
          <Estrellas valor={calificacion} color={T.star} />
          <Text style={[styles.calif, { color: T.sub }]}>
            {calificacion > 0 ? calificacion.toFixed(1) : "Sin calificaciones"}
          </Text>
        </View>
      </View>

      {/* Barra de XP */}
      <View style={[styles.track, { backgroundColor: T.track }]}>
        <View
          style={[
            styles.fill,
            { width: `${Math.round(progreso * 100)}%`, backgroundColor: rango.color },
          ]}
        />
      </View>
      <View style={styles.metaRow}>
        <Text style={[styles.meta, { color: T.sub }]}>{xpSeguro} XP</Text>
        <Text style={[styles.meta, { color: T.sub }]}>
          {rango.siguiente !== null
            ? `${faltan} XP para subir`
            : "Rango máximo"}
        </Text>
        <Text style={[styles.meta, { color: T.sub }]}>
          {pasantias} pasantía{pasantias === 1 ? "" : "s"}
        </Text>
      </View>

      {/* Pie verificado */}
      <View style={styles.footer}>
        <Ionicons name="checkmark-circle" size={14} color={rango.color} />
        <Text style={[styles.footerText, { color: T.sub }]}>
          Verificado por Gradly · El Salvador
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cert: {
    borderRadius: 20,
    borderWidth: 2,
    padding: 16,
    overflow: "hidden",
  },
  certTop: {
    borderWidth: 2.5,
    shadowColor: "#E6B422",
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  corner: {
    position: "absolute",
    width: 22,
    height: 22,
  },
  cornerTL: {
    top: 8,
    left: 8,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderTopLeftRadius: 6,
  },
  cornerBR: {
    bottom: 8,
    right: 8,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderBottomRightRadius: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  logo: {
    width: 22,
    height: 22,
  },
  brand: {
    flex: 1,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  sello: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  selloText: {
    fontSize: 10,
    fontWeight: "800",
  },
  body: {
    alignItems: "center",
    gap: 6,
    marginBottom: 14,
  },
  medal: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2.5,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  nombre: {
    fontSize: 16,
    fontWeight: "800",
  },
  rango: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  estrellasRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  calif: {
    fontSize: 12,
    fontWeight: "600",
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
    marginTop: 8,
  },
  meta: {
    fontSize: 11,
    fontWeight: "700",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(150,150,170,0.3)",
  },
  footerText: {
    fontSize: 11,
    fontWeight: "600",
  },
});
