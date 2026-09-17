/**
 * AppHeader — header ligero para pantallas sin autenticación.
 * Muestra solo los botones de idioma y tema.
 * Para dashboards usa UniversalHeader (src/components/UniversalHeader.tsx).
 */

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemeToggleIcon } from "../src/components/ThemeToggleButton";
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
  const router = useRouter();
  // insets.top: alto real de la barra de estado/notch del dispositivo (0 en
  // web y en Android sin edge-to-edge). Se SUMA al paddingTop fijo de la
  // barra (en vez de reemplazarlo) para que los botones de idioma/tema
  // nunca queden pegados a la barra de iconos del sistema, sin cambiar
  // nada en las plataformas donde el inset ya es 0.
  const insets = useSafeAreaInsets();

  const C = isDark ? dark : light;

  // Alterna Español ⇄ Inglés. La etiqueta muestra el idioma activo.
  const handleLangToggle = () => toggleLanguage();

  // Este header es el único que usan login y registro — ambas pantallas
  // bloquean a propósito el botón "atrás" del navegador (useLoginBackGuard,
  // mode:'block', para no reabrir login/registro por accidente después de
  // iniciar sesión). Eso las dejaba sin ninguna salida en web: ni "atrás"
  // ni ningún link a la landing pública. El logo ahora sirve de escape,
  // solo en web (en nativo no hay "/bienvenida" en el flujo todavía).
  const irABienvenida = () => {
    if (Platform.OS === "web") router.push("/bienvenida" as any);
  };
  const Logo = Platform.OS === "web" ? TouchableOpacity : View;
  const logoProps = Platform.OS === "web" ? { onPress: irABienvenida, accessibilityLabel: "Ir a la página de bienvenida" } : {};

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: C.bg, borderBottomColor: C.border, paddingTop: insets.top + 12 },
        style,
      ]}
    >
      {/* Izquierda: logo opcional */}
      {!hideLogo ? (
        <Logo style={styles.left} {...logoProps}>
          <Image
            source={require("../assets/images/LogoGradly.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={[styles.brand, { color: C.text }]}>Gradly</Text>
        </Logo>
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
          <ThemeToggleIcon size={18} />
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
