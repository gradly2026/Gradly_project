import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import ChatThread from "../src/components/ChatThread";
import { useTheme } from "../src/context/ThemeContext";

/**
 * Pantalla de chat del stack (ruta `/ChatScreen`). Wrapper fino sobre
 * `ChatThread`: lee los params de navegación y delega toda la lógica.
 */
export default function ChatScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { chatId, peerName } = useLocalSearchParams<{
    chatId: string;
    peerName?: string;
  }>();

  return (
    <>
      {/* El chat ahora sigue la paleta del tema activo (ver ChatThread), así
          que la barra de estado también debe seguirlo. */}
      <StatusBar style={isDark ? "light" : "dark"} />
      <ChatThread
        chatId={String(chatId)}
        peerName={peerName}
        onBack={() => router.back()}
      />
    </>
  );
}
