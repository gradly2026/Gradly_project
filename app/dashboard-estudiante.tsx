// ════════════════════════════════════════════════════════════════════════
// GUÍA PARA PRINCIPIANTES:
// Otro "puente" de compatibilidad, mismo concepto que
// app/iniciosesion.tsx. La diferencia es el MOTIVO del cambio: los
// estudiantes nunca tuvieron un "dashboard" de pantalla completa como
// empresa/universidad — su experiencia vive dentro del grupo de pestañas
// app/(tabs)/ (Inicio, Progreso, Mi institución, Mensajes, Perfil). Este
// archivo existe solo por si algo viejo (un link, una notificación
// antigua) todavía apunta a "/dashboard-estudiante".
//
// Antes redirigía SIEMPRE a "/(tabs)". Problema: en la web una empresa /
// universidad / admin podía escribir "gradly.website/dashboard-estudiante"
// a mano y terminaba viendo la experiencia de estudiante. Ahora el puente
// mira el rol y manda a cada quien a SU panel — misma doctrina que
// app/index.tsx y src/utils/roleRouting.ts: un rol desconocido NUNCA cae
// por defecto a la interfaz de estudiante.
// ════════════════════════════════════════════════════════════════════════

import { Redirect } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { rutaPorRol } from '../src/utils/roleRouting';

export default function DashboardEstudianteLegacy() {
  const { user, rol, isLoading } = useAuth();

  // Mientras AuthContext resuelve sesión/rol, no redirigir (evita mandar a
  // la UI equivocada por una lectura a medias). `isLoading` no baja hasta
  // tener el rol resuelto — ver AuthContext.
  if (isLoading) return null;

  // Sin sesión → al login.
  if (!user) return <Redirect href="/auth/iniciosesion" />;

  // Cada rol a SU panel: `rutaPorRol('estudiante')` es "/(tabs)"; una
  // empresa/universidad/admin va a su propio dashboard. Rol aún sin
  // resolver (null) → no navegar todavía.
  const destino = rutaPorRol(rol);
  return destino ? <Redirect href={destino as any} /> : null;
}
