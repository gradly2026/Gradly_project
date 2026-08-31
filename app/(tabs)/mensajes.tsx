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
// ════════════════════════════════════════════════════════════════════════

import { StatusBar } from "expo-status-bar";

import { LiquidBackground } from "../../components/ui/liquid-glass/LiquidBackground";
import SeccionMensajes from "../../src/components/SeccionMensajes";
import { setChatPaneOpen } from "../../src/state/chatPaneOpen";

/** Bandeja de entrada como pestaña inferior (Estudiantes). */
export default function MensajesTab() {
  return (
    <LiquidBackground>
      <StatusBar style="light" />
      <SeccionMensajes onChatOpenChange={setChatPaneOpen} />
    </LiquidBackground>
  );
}
