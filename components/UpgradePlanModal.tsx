import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface Props {
  visible: boolean;
  onClose: () => void;
  currentPlan?: string;
  limitReached?: number;
  theme?: "dark" | "light";
}

const PLANS = [
  {
    key: "basico",
    label: "Básico",
    price: "$0/mes",
    vacantes: 3,
    features: ["3 vacantes activas", "Candidatos ilimitados", "Horas sociales básicas"],
    highlight: false,
  },
  {
    key: "profesional",
    label: "Profesional",
    price: "$29/mes",
    vacantes: 15,
    features: ["15 vacantes activas", "Candidatos ilimitados", "Horas sociales avanzadas", "Soporte prioritario"],
    highlight: true,
  },
  {
    key: "empresarial",
    label: "Empresarial",
    price: "$79/mes",
    vacantes: 999,
    features: ["Vacantes ilimitadas", "Candidatos ilimitados", "Horas sociales ilimitadas", "Soporte 24/7", "Analytics avanzado"],
    highlight: false,
  },
];

const DARK = {
  overlay: "rgba(0,0,0,0.80)",
  bg: "#0d0b1e",
  card: "rgba(255,255,255,0.04)",
  border: "rgba(139,92,246,0.25)",
  borderHighlight: "#8b5cf6",
  text: "#f4f1ff",
  textSub: "rgba(255,255,255,0.65)",
  muted: "rgba(255,255,255,0.40)",
  purple: "#8b5cf6",
  purpleDim: "rgba(139,92,246,0.12)",
  green: "#22c55e",
  greenBg: "rgba(34,197,94,0.10)",
  closeBg: "rgba(255,255,255,0.07)",
  highlightBg: "rgba(139,92,246,0.10)",
};

const LIGHT = {
  overlay: "rgba(0,0,0,0.55)",
  bg: "#ffffff",
  card: "#f8f9fa",
  border: "rgba(139,92,246,0.18)",
  borderHighlight: "#7c3aed",
  text: "#111827",
  textSub: "#6b7280",
  muted: "#9ca3af",
  purple: "#7c3aed",
  purpleDim: "rgba(139,92,246,0.08)",
  green: "#059669",
  greenBg: "rgba(5,150,105,0.08)",
  closeBg: "rgba(0,0,0,0.06)",
  highlightBg: "rgba(139,92,246,0.05)",
};

export default function UpgradePlanModal({
  visible,
  onClose,
  currentPlan,
  limitReached,
  theme = "dark",
}: Props) {
  const C = theme === "light" ? LIGHT : DARK;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { backgroundColor: C.overlay }]}>
        <View style={[styles.sheet, { backgroundColor: C.bg, borderTopColor: C.border }]}>
          <View style={[styles.header, { borderBottomColor: C.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: C.text }]}>Actualizar plan</Text>
              {limitReached !== undefined && (
                <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
                  Has alcanzado el límite de {limitReached} vacante{limitReached !== 1 ? "s" : ""} activas de tu plan actual.
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: C.closeBg }]}
              onPress={onClose}
            >
              <Ionicons name="close" size={18} color={C.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            {PLANS.map((plan) => {
              const isCurrent = currentPlan === plan.key;
              return (
                <View
                  key={plan.key}
                  style={[
                    styles.planCard,
                    {
                      backgroundColor: plan.highlight ? C.highlightBg : C.card,
                      borderColor: plan.highlight ? C.borderHighlight : C.border,
                      borderWidth: plan.highlight ? 2 : 1,
                    },
                  ]}
                >
                  {plan.highlight && (
                    <View style={[styles.popularBadge, { backgroundColor: C.purple }]}>
                      <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>
                        MÁS POPULAR
                      </Text>
                    </View>
                  )}
                  <View style={styles.planHeader}>
                    <View>
                      <Text style={[styles.planName, { color: C.text }]}>{plan.label}</Text>
                      <Text style={{ color: C.muted, fontSize: 12 }}>
                        Hasta {plan.vacantes < 100 ? plan.vacantes : "∞"} vacantes activas
                      </Text>
                    </View>
                    <Text style={[styles.planPrice, { color: C.purple }]}>{plan.price}</Text>
                  </View>

                  <View style={{ gap: 6, marginBottom: 14 }}>
                    {plan.features.map((f) => (
                      <View key={f} style={styles.featureRow}>
                        <Ionicons name="checkmark-circle-outline" size={14} color={C.green} />
                        <Text style={{ color: C.textSub, fontSize: 12 }}>{f}</Text>
                      </View>
                    ))}
                  </View>

                  {isCurrent ? (
                    <View style={[styles.currentBtn, { borderColor: C.border }]}>
                      <Text style={{ color: C.muted, fontSize: 13, fontWeight: "600" }}>Plan actual</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.upgradeBtn,
                        { backgroundColor: plan.highlight ? C.purple : "transparent", borderColor: C.purple },
                      ]}
                      onPress={() => {
                        // Placeholder: real payment flow would go here
                        onClose();
                      }}
                    >
                      <Text
                        style={{
                          color: plan.highlight ? "#fff" : C.purple,
                          fontSize: 13,
                          fontWeight: "700",
                        }}
                      >
                        {plan.key === "basico" ? "Desmejorar" : "Actualizar al " + plan.label}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    maxHeight: "92%",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 16,
    borderBottomWidth: 1,
  },
  title: { fontSize: 18, fontWeight: "700" },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  planCard: {
    borderRadius: 14,
    padding: 16,
    position: "relative",
    overflow: "hidden",
  },
  popularBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomLeftRadius: 10,
  },
  planHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  planName: { fontSize: 16, fontWeight: "700" },
  planPrice: { fontSize: 18, fontWeight: "800" },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  currentBtn: {
    height: 38,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  upgradeBtn: {
    height: 38,
    borderWidth: 1.5,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
