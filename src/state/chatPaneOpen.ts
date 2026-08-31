// ════════════════════════════════════════════════════════════════════════
// Señal compartida: "¿hay un chat abierto AHORA dentro de la pestaña
// Mensajes del estudiante?".
//
// La pestaña (app/(tabs)/mensajes.tsx) sabe si el usuario tiene una
// conversación abierta (vía SeccionMensajes → onChatOpenChange), pero la
// píldora flotante de notificaciones/idioma/tema la monta el layout de las
// tabs (app/(tabs)/_layout.tsx), que es OTRO componente. ChatThread ya
// dibuja esa misma píldora dentro de su cabecera, así que mientras haya un
// chat abierto el layout debe esconder la suya para no duplicarla — el
// mismo criterio que ya aplica el dashboard de empresa con
// `chatAbiertoEnMensajes`.
//
// Un store mínimo con useSyncExternalStore (sin dependencias, sin Context)
// es suficiente: solo hay un productor y un consumidor.
// ════════════════════════════════════════════════════════════════════════
import { useSyncExternalStore } from "react";

let abierto = false;
const suscriptores = new Set<() => void>();

/** Lo llama SeccionMensajes (vía onChatOpenChange) al abrir/cerrar un chat. */
export function setChatPaneOpen(valor: boolean): void {
  if (abierto === valor) return;
  abierto = valor;
  suscriptores.forEach((fn) => fn());
}

/** Lo lee el layout de las tabs para decidir si oculta su píldora flotante. */
export function useChatPaneOpen(): boolean {
  return useSyncExternalStore(
    (fn) => {
      suscriptores.add(fn);
      return () => suscriptores.delete(fn);
    },
    () => abierto,
    () => abierto,
  );
}
