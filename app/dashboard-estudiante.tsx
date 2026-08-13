// ════════════════════════════════════════════════════════════════════════
// GUÍA PARA PRINCIPIANTES:
// Otro "puente" de compatibilidad, mismo concepto que
// app/iniciosesion.tsx. La diferencia es el MOTIVO del cambio: los
// estudiantes nunca tuvieron un "dashboard" de pantalla completa como
// empresa/universidad — su experiencia vive dentro del grupo de pestañas
// app/(tabs)/ (Inicio, Progreso, Mensajes, Academia, Perfil). Este
// archivo existe solo por si algo viejo (un link, una notificación
// antigua) todavía apunta a "/dashboard-estudiante".
// ════════════════════════════════════════════════════════════════════════

import { Redirect } from 'expo-router';

// Estudiantes van a las tabs — no a este dashboard
export default function DashboardEstudianteLegacy() {
  return <Redirect href="/(tabs)" />;
  // "/(tabs)" apunta al grupo de rutas app/(tabs)/ — específicamente a su
  // app/(tabs)/index.tsx (la pestaña de Inicio), que es donde en verdad
  // "vive" la experiencia del estudiante.
}
