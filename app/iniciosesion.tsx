import { Redirect } from 'expo-router';
// Ruta legado → ahora vive en /auth/iniciosesion
export default function InicioSesionLegacy() {
  return <Redirect href="/auth/iniciosesion" />;
}
