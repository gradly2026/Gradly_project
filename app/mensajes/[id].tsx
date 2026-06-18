import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { LiquidBackground } from "../../components/ui/liquid-glass/LiquidBackground";
import ChatThread from "../../src/components/ChatThread";

/**
 * Chat individual en móvil (`/mensajes/[id]`). Se navega aquí desde el inbox
 * cuando la pantalla es estrecha (< 768). En web el chat se muestra embebido en
 * el panel derecho del master-detail, sin pasar por esta ruta.
 */
export default function MensajeChatScreen() {
  const router = useRouter();
  const { id, peerName } = useLocalSearchParams<{
    id: string;
    peerName?: string;
  }>();

  return (
    <LiquidBackground>
      <StatusBar style="light" />
      <ChatThread
        chatId={String(id)}
        peerName={peerName}
        onBack={() => router.back()}
      />
    </LiquidBackground>
  );
}
