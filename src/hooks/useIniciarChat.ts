import { usePathname, useRouter } from "expo-router";
import { useCallback } from "react";
import { Alert } from "react-native";
import { useAuth } from "../context/AuthContext";
import { abrirChatDirectoUsuarios } from "../services/chatService";

/**
 * Hook para iniciar (o reutilizar) un chat directo con cualquier usuario y
 * abrirlo. Centraliza el flujo "buscar usuario → chatear" para que el buscador
 * global (dashboards) y el buscador de Mensajes compartan la misma lógica.
 *
 * Navega siempre a `/mensajes` pasando el id del chat por parámetro; la propia
 * pantalla de mensajes decide la presentación:
 *  - Web (master-detail estilo WhatsApp Web): abre el chat en el panel derecho.
 *  - Móvil: salta a la pantalla individual `/mensajes/[id]`.
 */
export function useIniciarChat() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, userProfile, rol } = useAuth();

  return useCallback(
    async (otro: { uid: string; nombre: string; rol: string }) => {
      if (!user?.uid) return;
      // No se chatea con uno mismo.
      if (!otro.uid || otro.uid === user.uid) return;

      try {
        const chatId = await abrirChatDirectoUsuarios({
          yo: {
            uid: user.uid,
            nombre: userProfile?.nombre_completo ?? "Usuario",
            rol: rol ?? "",
          },
          otro,
        });
        const params = { chat: chatId, peerName: otro.nombre };
        // Si ya estamos parados en /mensajes (p. ej. se pulsó "Chatear" desde
        // el perfil de alguien con quien YA se estaba chateando), actualizar
        // los parámetros de la pantalla actual en vez de apilar una segunda
        // instancia de /mensajes encima de la primera: ese doble montaje era
        // la causa de que la cabecera del chat "cambiara de diseño" al volver
        // — cada instancia arrancaba su propia píldora flotante en una
        // posición ligeramente distinta.
        if (pathname === "/mensajes") {
          router.setParams(params as any);
        } else {
          router.push({ pathname: "/mensajes", params } as any);
        }
      } catch (error) {
        console.warn("No se pudo iniciar el chat:", error);
        Alert.alert("Error", "No se pudo abrir el chat. Intenta de nuevo.");
      }
    },
    [user?.uid, userProfile?.nombre_completo, rol, router, pathname],
  );
}
