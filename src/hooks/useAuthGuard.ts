import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../context/AuthContext';

// Ruta canónica para cada rol
const ROLE_HOME: Record<UserRole, string> = {
  admin:       '/dashboard-admin',
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

    if (requiredRole && rol !== requiredRole) {
      const correctRoute = rol ? ROLE_HOME[rol] : '/auth/iniciosesion';
      router.replace(correctRoute as any);
    }
  }, [user, rol, isLoading, requiredRole]);
}
