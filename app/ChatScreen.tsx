import { useLocalSearchParams, useRouter } from "expo-router";
import ChatThread from "../src/components/ChatThread";

/**
 * Pantalla de chat del stack (ruta `/ChatScreen`). Wrapper fino sobre
 * `ChatThread`: lee los params de navegación y delega toda la lógica.
 */
export default function ChatScreen() {
  const router = useRouter();
  const { chatId, peerName } = useLocalSearchParams<{
    chatId: string;
    peerName?: string;
  }>();

  return (
    <ChatThread
      chatId={String(chatId)}
      peerName={peerName}
      onBack={() => router.back()}
    />
  );
}
