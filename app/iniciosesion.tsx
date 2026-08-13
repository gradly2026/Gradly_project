// ════════════════════════════════════════════════════════════════════════
// GUÍA PARA PRINCIPIANTES:
// Este archivo es un "redirect" (redirección): existe SOLO porque, en
// algún momento del proyecto, la pantalla de login vivía en la ruta
// "/iniciosesion" (directo dentro de app/). Después se movió a
// "/auth/iniciosesion" (dentro de la carpeta app/auth/, ver
// app/auth/iniciosesion.tsx, el archivo real y grande con toda la lógica).
//
// Para que un link o notificación VIEJA que todavía apunte a
// "/iniciosesion" no se rompa (mostrando una pantalla en blanco o un
// error de "ruta no encontrada"), se dejó este archivo "puente": en vez
// de dibujar una pantalla, automáticamente redirige al usuario a la
// ubicación NUEVA y correcta.
// ════════════════════════════════════════════════════════════════════════

import { Redirect } from 'expo-router';
// Redirect: un componente especial de Expo Router. En vez de dibujar
// contenido en pantalla, al aparecer le dice a la navegación "cambia
// inmediatamente hacia esta otra ruta", sin que el usuario llegue a ver
// esta pantalla intermedia.

// Ruta legado → ahora vive en /auth/iniciosesion
export default function InicioSesionLegacy() {
  // "Legacy" (heredado/legado) en el nombre deja claro que este
  // componente no es la pantalla real, sino solo un puente de
  // compatibilidad hacia la ruta nueva.
  return <Redirect href="/auth/iniciosesion" />;
  // Al visitar "/iniciosesion", Expo Router monta este componente, que
  // inmediatamente pide navegar a "/auth/iniciosesion" (la pantalla real
  // de login, ver app/auth/iniciosesion.tsx).
}
