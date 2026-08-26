// ════════════════════════════════════════════════════════════════════════
// GUÍA PARA PRINCIPIANTES:
// Fíjate en el NOMBRE del archivo: "[id].tsx", entre corchetes. En Expo
// Router (y en Next.js, que usa la misma convención), un nombre de
// archivo entre corchetes define una RUTA DINÁMICA: la carpeta
// app/mensajes/ tiene un archivo index.tsx (la ruta "/mensajes", la
// bandeja completa) y este archivo "[id].tsx", que responde a CUALQUIER
// ruta con la forma "/mensajes/loquesea" — ese "loquesea" queda
// disponible dentro del componente como el parámetro `id`.
//
// Es casi idéntico a app/ChatScreen.tsx (mismo trabajo: ser un puente
// fino hacia ChatThread), pero se usa en un caso distinto — ver el
// comentario de la función más abajo.
// ════════════════════════════════════════════════════════════════════════

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
  // Este componente se usa SOLO en pantallas angostas (celular): ahí no
  // hay espacio para mostrar la lista de chats Y el chat abierto al mismo
  // tiempo, así que tocar un chat de la lista NAVEGA a esta pantalla
  // aparte. En una pantalla ancha (navegador de escritorio), en cambio,
  // el mismo <ChatThread> se dibuja EMBEBIDO al lado de la lista, sin
  // necesitar navegar a ninguna ruta nueva (ver
  // GUIA memoria del proyecto "Mensajes master-detail" para el diseño
  // completo de ese comportamiento responsivo).
  const router = useRouter();
  const { isDark } = useTheme();
  const { id, peerName } = useLocalSearchParams<{
    id: string;
    peerName?: string;
  }>();
  // Aquí el parámetro dinámico de la URL se llama `id` (coincide con el
  // nombre del archivo "[id].tsx" — Expo Router usa ese mismo nombre como
  // clave del parámetro).

  return (
    <LiquidBackground>
      {/* El chat ahora sigue la paleta del tema activo (ver ChatThread), así
          que la barra de estado también debe seguirlo. */}
      <StatusBar style={isDark ? "light" : "dark"} />
      {/* Notificaciones/idioma/tema viven DENTRO de la cabecera de
          ChatThread (ver ese componente) — ya no flotan aparte. */}
      <ChatThread
        chatId={String(id)}
        peerName={peerName}
        onBack={() => router.back()}
      />
    </LiquidBackground>
  );
}
