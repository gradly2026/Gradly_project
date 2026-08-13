// ════════════════════════════════════════════════════════════════════════
// GUÍA PARA PRINCIPIANTES:
// Otro archivo "wrapper" (envoltorio) fino: la pantalla de chat en sí
// (los mensajes, el campo para escribir, "Vaciar chat", "Reportar
// usuario"...) vive TODA en src/components/ChatThread.tsx, un componente
// reutilizable. Este archivo es solo el "adaptador" que conecta esa
// pieza reutilizable con el sistema de rutas: lee de la URL a qué chat
// hay que entrar, y le pasa esos datos a <ChatThread>.
// ════════════════════════════════════════════════════════════════════════

import { useLocalSearchParams, useRouter } from "expo-router";
// useLocalSearchParams() → hook de Expo Router que lee los PARÁMETROS
// que vienen en la URL/navegación actual (por ejemplo, si se navegó con
// router.push({ pathname: '/ChatScreen', params: { chatId: 'abc' } }),
// aquí se recupera ese `chatId`).
// useRouter() → ya visto en FloatingTopBar.tsx, da acceso a
// router.back() para volver a la pantalla anterior.

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
  // Extrae los dos parámetros esperados de la URL actual: `chatId`
  // (obligatorio, el ID del documento de chat en Firestore) y `peerName`
  // (opcional, el nombre de la otra persona, para mostrarlo de una vez en
  // el encabezado sin tener que esperar a leerlo de Firestore).
  // El tipo genérico "<{ chatId: string; peerName?: string }>" le dice a
  // TypeScript qué forma esperar de esos parámetros.

  return (
    <>
      {/* El chat ahora sigue la paleta del tema activo (ver ChatThread), así
          que la barra de estado también debe seguirlo. */}
      <StatusBar style={isDark ? "light" : "dark"} />
      {/* A diferencia de (tabs)/mensajes.tsx (que fija style="light" fijo),
          aquí el color de la barra de estado SÍ depende del tema activo,
          porque esta pantalla de chat cambia de fondo claro/oscuro según
          el tema del usuario. */}
      <ChatThread
        chatId={String(chatId)}
        // "String(chatId)" convierte el valor a texto de forma segura:
        // useLocalSearchParams puede devolver un parámetro como string O
        // como array de strings (si la URL lo repitiera), y String(...)
        // garantiza un único texto plano sin importar cuál de los dos casos
        // haya ocurrido.
        peerName={peerName}
        onBack={() => router.back()}
        // Le pasa a ChatThread una función para "volver atrás" cuando el
        // usuario toque el botón de retroceso DENTRO del chat — así
        // ChatThread no necesita saber nada de router directamente, solo
        // recibe la función que debe llamar.
      />
    </>
  );
}
