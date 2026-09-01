// ════════════════════════════════════════════════════════════════════════
// GUÍA PARA PRINCIPIANTES:
// Pantalla de la pestaña "Mensajes" (barra inferior del estudiante).
// Antes montaba solo la LISTA de conversaciones (InboxList). Ahora monta
// SeccionMensajes — el MISMO componente "master-detail" que usan los
// dashboards de empresa y universidad: en pantalla ancha se ven la lista y
// el chat abierto lado a lado; en pantalla angosta, la lista y, al tocar
// una conversación, el chat a pantalla completa (sin navegar a otra ruta,
// solo estado local). Así el estudiante tiene exactamente la misma
// interfaz de chat que la empresa, sin depender de tener ya una alianza.
//
// `onChatOpenChange` avisa al layout de las tabs (app/(tabs)/_layout.tsx)
// cuando hay un chat abierto, para que este esconda su píldora flotante de
// notificaciones/idioma/tema — ChatThread ya trae la suya en la cabecera y
// mostrar las dos a la vez las duplicaría.
//
// Como en esta pestaña se oculta la barra inferior de navegación (para que
// el chat se vea limpio), se añade arriba una fila delgada con una flecha
// "atrás" — el MISMO recurso que usan los dashboards de universidad/empresa
// en su sección "Mensajes" (allí es `mainHeaderChat`). Sin ella, el
// estudiante no tenía forma visible de salir de "Mensajes".
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LiquidBackground } from "../../components/ui/liquid-glass/LiquidBackground";
import SeccionMensajes from "../../src/components/SeccionMensajes";
import { useTheme } from "../../src/context/ThemeContext";
import { setChatPaneOpen } from "../../src/state/chatPaneOpen";

/** Bandeja de entrada como pestaña inferior (Estudiantes). */
export default function MensajesTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  // Vuelve a la pestaña principal (Vacantes) — mismo destino que la flecha
  // "atrás" de la sección "Mensajes" en los dashboards (allí es `inicio`).
  const volver = () => router.navigate("/(tabs)");

  return (
    <LiquidBackground>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Fila delgada con la flecha "atrás" — equivalente al header
          simplificado de "Mensajes" en los dashboards. `paddingRight` deja
          hueco para la píldora flotante de notificaciones/idioma/tema. */}
      <View
        style={[
          styles.backBar,
          { paddingTop: insets.top + 8, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity
          onPress={volver}
          style={styles.backBtn}
          accessibilityLabel="Volver"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <SeccionMensajes onChatOpenChange={setChatPaneOpen} />
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  backBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 12,
    paddingRight: 150,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
