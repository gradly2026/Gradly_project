import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../context/AuthContext';

// Ruta canónica para cada rol
const ROLE_HOME: Record<UserRole, string> = {
  admin:       '/admin',
  universidad: '/dashboard-universidad',
  empresa:     '/dashboard-empresa',
  estudiante:  '/(tabs)',
};

/**
 * Hook de guardia de navegación.
 *
 * Uso en dashboards y pantallas protegidas:
 *
 *   useAuthGuard('empresa');   // solo permite rol empresa
 *   useAuthGuard();            // cualquier usuario autenticado
 *
 * Comportamiento:
 * - Si no hay sesión → redirige a /auth/iniciosesion
 * - Si el rol no coincide con `requiredRole` → redirige al dashboard correcto
 */
export function useAuthGuard(requiredRole?: UserRole): void {
  const { user, rol, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      router.replace('/auth/iniciosesion' as any);
      return;
    }

    // Solo redirigimos ante una discrepancia CONFIRMADA de rol: `rol` debe
    // ser un valor real y distinto del requerido. Si `rol` aún es null (la
    // lectura de Firestore sigue en curso tras el login), NO redirigimos:
    // esperamos a que AuthContext lo resuelva. Esto evita el rebote erróneo
    // a /(tabs) o al login mientras el rol todavía no está disponible.
    if (requiredRole && rol && rol !== requiredRole) {
      router.replace(ROLE_HOME[rol] as any);
    }
  }, [user, rol, isLoading, requiredRole]);
}
