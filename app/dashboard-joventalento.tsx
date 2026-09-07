// ════════════════════════════════════════════════════════════════════════
// GUÍA PARA PRINCIPIANTES:
// Mismo concepto que app/dashboard-estudiante.tsx. "Joven Talento" fue en
// algún momento un rol o modalidad separada dentro del proyecto; se
// terminó unificando con la experiencia normal de estudiante, dentro de
// app/(tabs)/. Este archivo solo redirige cualquier acceso viejo.
//
// Mira el rol antes de redirigir (igual que dashboard-estudiante.tsx): una
// empresa/universidad/admin que llegue aquí por la URL se va a su propio
// panel, no a las pestañas del estudiante.
// ════════════════════════════════════════════════════════════════════════

import { Redirect } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { rutaPorRol } from '../src/utils/roleRouting';

export default function DashboardJovenTalentoLegacy() {
  const { user, rol, isLoading } = useAuth();

  if (isLoading) return null;
  if (!user) return <Redirect href="/auth/iniciosesion" />;

  const destino = rutaPorRol(rol);
  return destino ? <Redirect href={destino as any} /> : null;
}
