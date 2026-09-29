// ════════════════════════════════════════════════════════════════════════
// GUÍA PARA PRINCIPIANTES:
// Pantalla de la pestaña "Mensajes" (barra inferior del estudiante). Monta
// SeccionMensajes — el MISMO componente "master-detail" que usan los
// dashboards de empresa y universidad: en pantalla ancha se ven la lista y
// el chat abierto lado a lado; en pantalla angosta, la lista y, al tocar
// una conversación, el chat a pantalla completa (sin navegar a otra ruta,
// solo estado local). Así el estudiante tiene exactamente la misma
// interfaz de chat que la empresa, sin depender de tener ya una alianza.
//
// `onChatOpenChange` avisa al layout de las tabs (app/(tabs)/_layout.tsx)
// cuando hay un chat abierto, para que este esconda su barra inferior y su
// píldora flotante de notificaciones/idioma/tema — ChatThread ya trae esos
// controles en su propia cabecera, y con la bandeja de chats (InboxList)
// visible la barra inferior sigue sirviendo para salir de "Mensajes", así
// que ya no hace falta ninguna flecha "atrás" propia de esta pantalla.
// ════════════════════════════════════════════════════════════════════════

import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useMemo } from "react";

import { LiquidBackground } from "../../components/ui/liquid-glass/LiquidBackground";
import SeccionMensajes from "../../src/components/SeccionMensajes";
import { useTheme } from "../../src/context/ThemeContext";
import { setChatPaneOpen } from "../../src/state/chatPaneOpen";

/** Bandeja de entrada como pestaña inferior (Estudiantes). */
export default function MensajesTab() {
  const router = useRouter();
  const { isDark } = useTheme();

  // El buscador de usuarios (la lupa dentro de SeccionMensajes) delega en
  // `useIniciarChat`; estando ya en /mensajes, ese hook hace
  // `router.setParams({ chat, peerName })` en vez de navegar. Sin consumir
  // aquí ese parámetro, tocar un resultado de la búsqueda no abría ninguna
  // conversación (los dashboards de empresa/universidad sí lo hacían porque
  // su `SeccionMensajes` recibe `openChat` desde su propio estado local).
  const params = useLocalSearchParams<{ chat?: string; peerName?: string }>();
  const openChat = useMemo(
    () =>
      params.chat
        ? {
            id: String(params.chat),
            peerName: params.peerName ? String(params.peerName) : "Chat",
          }
        : null,
    [params.chat, params.peerName],
  );

  return (
    <LiquidBackground>
      <StatusBar style={isDark ? "light" : "dark"} />

      <SeccionMensajes
        openChat={openChat}
        onOpenChatConsumed={() =>
          router.setParams({ chat: "", peerName: "" } as any)
        }
        onChatOpenChange={setChatPaneOpen}
      />
    </LiquidBackground>
  );
}
