// ══════════════════════════════════════════════════════════════════
//  Enrutamiento estricto basado en rol
//  Fuente única de verdad para "qué dashboard corresponde a cada rol"
//  y para leer el rol desde Firestore con reintentos.
//
//  REGLA CRÍTICA: un rol desconocido / null / undefined NUNCA se enruta
//  a la interfaz de estudiante. Devuelve `null` y el llamador decide
//  (mantener splash/loading, reintentar o mostrar error). Esto evita el
//  bug en el que universidad/empresa caían a /(tabs) por una lectura
//  fallida o una carrera de propagación del token tras el login.
// ══════════════════════════════════════════════════════════════════
import { doc, getDoc } from "firebase/firestore";
import { db } from "../config/firebaseConfig";
import type { UserRole } from "../context/AuthContext";

/**
 * Devuelve la ruta del dashboard para un rol concreto.
 * Estricto: solo 'estudiante' va a /(tabs). Cualquier valor desconocido,
 * null o undefined devuelve `null` (sin ruta segura por defecto).
 */
export function rutaPorRol(rol: UserRole | null | undefined): string | null {
  switch (rol) {
    case "admin":
      return "/admin";
    case "universidad":
      return "/dashboard-universidad";
    case "empresa":
      return "/dashboard-empresa";
    case "estudiante":
      return "/(tabs)";
    default:
      return null;
  }
}

const ROLES_VALIDOS: ReadonlyArray<UserRole> = [
  "estudiante",
  "empresa",
  "universidad",
  "admin",
];

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Lee `usuarios/{uid}.rol` con reintentos. Justo después de un login o de
 * un registro el documento puede no estar replicado todavía o el token de
 * Auth puede no haberse propagado a las reglas de Firestore; reintentar
 * unas pocas veces resuelve esa carrera sin degradar al rol de estudiante.
 *
 * @returns el rol válido, o `null` si tras todos los intentos no se pudo
 *          determinar (el llamador NO debe asumir estudiante en ese caso).
 */
export async function obtenerRolConReintento(
  uid: string,
  intentos = 4,
  delayMs = 350,
): Promise<UserRole | null> {
  for (let i = 0; i < intentos; i++) {
    try {
      const snap = await getDoc(doc(db, "usuarios", uid));
      if (snap.exists()) {
        const rol = snap.data()?.rol as UserRole | undefined;
        if (rol && ROLES_VALIDOS.includes(rol)) return rol;
      }
    } catch {
      // Error transitorio de red/reglas → se reintenta abajo.
    }
    if (i < intentos - 1) await esperar(delayMs * (i + 1));
  }
  return null;
}
