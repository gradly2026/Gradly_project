import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";
import { AutoText as Text } from "./AutoText";
import { TIER_COLORS, type RangoTier } from "../services/feedbackService";

interface SelloMeta {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

/** Etiqueta de prestigio de la marca empleadora por tier. */
export const SELLO_EMPRESA: Record<RangoTier, SelloMeta> = {
  oro: { label: "Empresa Top", icon: "trophy", color: TIER_COLORS.oro },
  plata: {
    label: "Empresa Confiable",
    icon: "shield-checkmark",
    color: TIER_COLORS.plata,
  },
  bronce: { label: "Empresa Nueva", icon: "leaf", color: TIER_COLORS.bronce },
};

interface Props {
  tier: RangoTier;
  /** Tamaño visual del sello. */
  size?: "sm" | "md";
}

/**
 * Sello de prestigio de la marca empleadora ("Empresa Top" / "Empresa
 * Confiable") que se exhibe en el buscador general y en el perfil para atraer
 * a los mejores talentos.
 */
export default function SelloEmpresa({ tier, size = "sm" }: Props) {
  const meta = SELLO_EMPRESA[tier];
  const md = size === "md";

  return (
    <View
      style={[
        styles.pill,
        {
          borderColor: meta.color,
          backgroundColor: `${meta.color}22`,
          paddingHorizontal: md ? 12 : 8,
          paddingVertical: md ? 6 : 3,
        },
      ]}
    >
      <Ionicons name={meta.icon} size={md ? 15 : 12} color={meta.color} />
      <Text style={[styles.text, { color: meta.color, fontSize: md ? 13 : 11 }]}>
        {meta.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  text: {
    fontWeight: "800",
  },
});
