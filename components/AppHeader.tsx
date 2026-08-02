/**
 * AppHeader — header ligero para pantallas sin autenticación.
 * Muestra solo los botones de idioma y tema.
 * Para dashboards usa UniversalHeader (src/components/UniversalHeader.tsx).
 */

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { useThemeContext } from "../src/context/ThemeContext";
import { useTranslationContext } from "../src/context/TranslationContext";

interface AppHeaderProps {
  /** Ocultar el logo (útil si la pantalla ya tiene su propio branding) */
  hideLogo?: boolean;
  style?: ViewStyle;
}

export default function AppHeader({ hideLogo = false, style }: AppHeaderProps) {
  const { isDark, toggleTheme } = useThemeContext();
  const { language, toggleLanguage } = useTranslationContext();

  const C = isDark ? dark : light;

  // Alterna Español ⇄ Inglés. La etiqueta muestra el idioma activo.
  const handleLangToggle = () => toggleLanguage();

  return (
    <View style={[styles.bar, { backgroundColor: C.bg, borderBottomColor: C.border }, style]}>
      {/* Izquierda: logo opcional */}
      {!hideLogo ? (
        <View style={styles.left}>
          <Image
            source={require("../assets/images/LogoGradly.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={[styles.brand, { color: C.text }]}>Gradly</Text>
        </View>
      ) : (
        <View style={styles.left} />
      )}

      {/* Derecha: idioma + tema */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: C.btnBg }]}
          onPress={handleLangToggle}
          accessibilityLabel="Cambiar idioma"
        >
          <Ionicons name="planet-outline" size={18} color={C.icon} />
          <Text style={[styles.btnLabel, { color: C.icon }]}>
            {language.toUpperCase()}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: C.btnBg }]}
          onPress={toggleTheme}
          accessibilityLabel={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
        >
          <Ionicons
            name={isDark ? "sunny-outline" : "moon-outline"}
            size={18}
            color={C.icon}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const dark = {
  bg: "rgba(13,11,30,0.95)",
  border: "rgba(139,92,246,0.18)",
  text: "#f4f1ff",
  icon: "rgba(167,139,250,0.90)",
  btnBg: "rgba(139,92,246,0.12)",
};

const light = {
  bg: "rgba(248,250,252,0.97)",
  border: "rgba(139,92,246,0.15)",
  text: "#111827",
  icon: "#7c3aed",
  btnBg: "rgba(139,92,246,0.08)",
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  logo: {
    width: 28,
    height: 28,
  },
  brand: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  btnLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
