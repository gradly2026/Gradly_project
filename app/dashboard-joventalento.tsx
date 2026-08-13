// ════════════════════════════════════════════════════════════════════════
// GUÍA PARA PRINCIPIANTES:
// Mismo concepto que app/dashboard-estudiante.tsx. "Joven Talento" fue en
// algún momento un rol o modalidad separada dentro del proyecto; se
// terminó unificando con la experiencia normal de estudiante, dentro de
// app/(tabs)/. Este archivo solo redirige cualquier acceso viejo hacia ahí.
// ════════════════════════════════════════════════════════════════════════

import { Redirect } from 'expo-router';

// Joven Talento migrado a tabs
export default function DashboardJovenTalentoLegacy() {
  return <Redirect href="/(tabs)" />;
}
