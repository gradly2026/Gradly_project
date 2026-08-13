// ════════════════════════════════════════════════════════════════════════
// GUÍA PARA PRINCIPIANTES:
// Un archivo llamado exactamente "_layout.tsx" tiene un significado
// ESPECIAL para Expo Router: define el "marco" o "envoltorio" compartido
// para todas las pantallas que viven en la MISMA carpeta (aquí,
// app/admin/). Cualquier archivo que se agregue dentro de app/admin/ en
// el futuro automáticamente queda envuelto por lo que este archivo
// devuelva.
// ════════════════════════════════════════════════════════════════════════

import { Stack } from "expo-router";
// Stack: un componente de navegación de Expo Router que apila pantallas
// una encima de otra (como las apps típicas donde "entrar" a una sección
// empuja una pantalla nueva, y "atrás" la retira) — el patrón de
// navegación estándar para folders con varias pantallas relacionadas.

import React from "react";
// Import explícito de React (en versiones más viejas de React era
// obligatorio importarlo en TODO archivo que usara JSX; en proyectos
// modernos con la configuración de compilación actual ya no hace falta
// escribirlo a mano, pero no causa ningún problema dejarlo).

export default function AdminLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
  // Declara un Stack SIN ninguna pantalla listada explícitamente adentro
  // (a diferencia de app/auth/_layout.tsx, que sí declara cada una) —
  // Expo Router arma el stack automáticamente a partir de los archivos
  // que encuentre dentro de app/admin/ (hoy, solo index.tsx). screenOptions
  // headerShown: false oculta la barra de título nativa por defecto en
  // TODAS las pantallas de este grupo, porque el panel admin dibuja su
  // propio encabezado personalizado dentro de cada pantalla.
}
