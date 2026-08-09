import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useBackNavigationGuard } from './useBackNavigationGuard';

/**
 * Guardia de "atrás" para pantallas protegidas (dashboards de estudiante,
 * empresa, universidad y admin). Al presionar "atrás" en el navegador se
 * pregunta "¿Desea cerrar sesión?": si acepta, cierra sesión (Firebase Auth +
 * estado local) y redirige a `/auth/iniciosesion`; si cancela, se queda en la
 * pantalla donde estaba.
 *
 * Uso: llamar una vez en el componente raíz de cada dashboard, junto a
 * `useAuthGuard(rol)`.
 */
export function useAuthBackGuard(): void {
  const { logout } = useAuth();
  const router = useRouter();

  useBackNavigationGuard({
    mode: 'protected',
    onConfirmLogout: async () => {
      await logout();
      router.replace('/auth/iniciosesion' as any);
    },
  });
}

/**
 * Guardia de "atrás" para las pantallas de login/registro: bloquea la
 * navegación hacia atrás por completo (el usuario se queda en login/registro).
 */
export function useLoginBackGuard(): void {
  useBackNavigationGuard({ mode: 'block' });
}
