import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { LiquidBackground } from "../../components/ui/liquid-glass/LiquidBackground";
import ChatThread from "../../src/components/ChatThread";
import { useTheme } from "../../src/context/ThemeContext";

/**
 * Chat individual en móvil (`/mensajes/[id]`). Se navega aquí desde el inbox
 * cuando la pantalla es estrecha (< 768). En web el chat se muestra embebido en
 * el panel derecho del master-detail, sin pasar por esta ruta.
 */
export default function MensajeChatScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { id, peerName } = useLocalSearchParams<{
    id: string;
    peerName?: string;
  }>();

  return (
    <LiquidBackground>
      {/* El chat ahora sigue la paleta del tema activo (ver ChatThread), así
          que la barra de estado también debe seguirlo. */}
      <StatusBar style={isDark ? "light" : "dark"} />
      <ChatThread
        chatId={String(id)}
        peerName={peerName}
        onBack={() => router.back()}
      />
    </LiquidBackground>
  );
}
