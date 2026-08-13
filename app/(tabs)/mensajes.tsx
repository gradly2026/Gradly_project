// ════════════════════════════════════════════════════════════════════════
// GUÍA PARA PRINCIPIANTES:
// Esta es la pantalla que se muestra al tocar la pestaña "Mensajes" en la
// barra inferior del estudiante (app/(tabs)/). Es un archivo MUY corto a
// propósito: casi todo el trabajo real de mostrar la lista de
// conversaciones vive en el componente reutilizable
// src/components/InboxList.tsx — este archivo solo lo coloca dentro del
// fondo visual estándar de la app (LiquidBackground) y define el estilo
// de la barra de estado del sistema operativo.
// ════════════════════════════════════════════════════════════════════════

import { StatusBar } from "expo-status-bar";
// StatusBar: controla la apariencia de la barra de estado del sistema
// operativo (donde se ve la hora, la batería, el wifi) — aquí solo se
// usa para elegir si sus íconos se dibujan claros u oscuros.

import { LiquidBackground } from "../../components/ui/liquid-glass/LiquidBackground";
// Componente propio del proyecto que dibuja el fondo visual decorativo
// estándar (con efecto "vidrio líquido") detrás del contenido de casi
// toda pantalla de la app — así todas comparten la misma identidad
// visual sin que cada una tenga que reimplementar ese fondo.

import InboxList from "../../src/components/InboxList";
// El componente que de verdad dibuja la lista de conversaciones del
// usuario (leyendo la colección "chats" de Firestore, mostrando el
// último mensaje de cada una, etc.) — toda esa lógica vive en
// src/components/InboxList.tsx, no en este archivo.

/** Bandeja de entrada como pestaña inferior (Estudiantes). */
export default function MensajesTab() {
  return (
    <LiquidBackground>
      <StatusBar style="light" />
      {/* style="light" → los íconos de la barra de estado (hora, batería)
          se dibujan en color claro, porque el fondo de esta pantalla es
          oscuro. */}
      <InboxList />
    </LiquidBackground>
  );
}
