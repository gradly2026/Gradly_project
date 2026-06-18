import { Redirect } from 'expo-router';
// Ruta legado → ahora vive en /auth/registro
export default function RegistroLegacy() {
  return <Redirect href="/auth/registro" />;
}
