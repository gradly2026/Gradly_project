// ════════════════════════════════════════════════════════════════════════
// GUÍA PARA PRINCIPIANTES:
// Igual patrón que app/iniciosesion.tsx: esta ruta vieja "/registro"
// queda como puente hacia la ubicación real y actual, "/auth/registro"
// (ver app/auth/registro.tsx, el wizard de registro completo).
// ════════════════════════════════════════════════════════════════════════

import { Redirect } from 'expo-router';

// Ruta legado → ahora vive en /auth/registro
export default function RegistroLegacy() {
  return <Redirect href="/auth/registro" />;
  // Cualquiera que llegue a "/registro" (un link viejo, un favorito
  // guardado, etc.) es enviado automáticamente a "/auth/registro".
}
