// ════════════════════════════════════════════════════════════════════════
// GUÍA PARA PRINCIPIANTES:
// Igual concepto que app/admin/_layout.tsx: este "_layout.tsx" envuelve
// todas las pantallas dentro de app/auth/ (login, registro, y el manejo
// de links de acción de Firebase). A diferencia del de admin, aquí SÍ se
// listan las pantallas explícitamente, con una animación de transición
// distinta (fundido en vez de la animación por defecto).
// ════════════════════════════════════════════════════════════════════════

import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      {/* headerShown: false → sin barra de título nativa (cada pantalla
          dibuja su propio diseño).
          animation: 'fade' → al navegar entre login/registro/action, la
          transición es un desvanecimiento suave, en vez del deslizamiento
          lateral típico — una elección de diseño para esta sección. */}
      <Stack.Screen name="iniciosesion" />
      {/* Registra explícitamente app/auth/iniciosesion.tsx como una de
          las pantallas de este Stack. El "name" debe coincidir con el
          nombre del archivo (sin extensión). */}
      <Stack.Screen name="registro" />
      {/* app/auth/registro.tsx — el wizard de registro. */}
      <Stack.Screen name="action" />
      {/* app/auth/action.tsx — pantalla que procesa links de acción de
          Firebase Auth (por ejemplo, un link de "restablecer contraseña"
          que el usuario abre desde su correo). */}
    </Stack>
  );
}
