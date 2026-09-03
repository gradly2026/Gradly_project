import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useBackNavigationGuard } from './useBackNavigationGuard';

interface UseAuthBackGuardOptions<S extends string = string> {
  /** Sección interna activa ahora mismo (dashboards) — ver
   * useBackNavigationGuard.ts para el detalle de qué habilita. Opcional:
   * sin esto, cualquier "atrás" pregunta de inmediato por cerrar sesión. */
  section?: S;
  onSectionBack?: (previous: S) => void;
}

/**
 * Guardia de "atrás" para pantallas protegidas (dashboards de estudiante,
 * empresa, universidad y admin). Al presionar "atrás" (botón del navegador
 * en web, botón físico en Android):
 *   - si se pasó `section`, primero recorre las secciones internas
 *     visitadas (Inicio → Vacantes → Mensajes → ...) sin preguntar nada.
 *   - al llegar al final de esa pila, el usuario simplemente se queda en
 *     "Inicio": NO se sale al login, NO se cierra la app y NO aparece
 *     ningún "¿Desea cerrar sesión?". Cerrar sesión es exclusivamente el
 *     botón "Cerrar sesión" de la sección "Mi Perfil" de cada panel.
 *
 * `onConfirmLogout` y el `showLogoutConfirm` que devuelve el hook se
 * conservan por compatibilidad con los llamadores actuales (que aún montan
 * un <SalirSesionModal visible={showLogoutConfirm} .../>), pero ese modal
 * ya nunca se muestra.
 *
 * Uso: llamar una vez en el componente raíz de cada dashboard, junto a
 * `useAuthGuard(rol)`.
 */
export function useAuthBackGuard<S extends string = string>(
  options?: UseAuthBackGuardOptions<S>,
) {
  const { logout } = useAuth();
  const router = useRouter();

  return useBackNavigationGuard<S>({
    mode: 'protected',
    section: options?.section,
    onSectionBack: options?.onSectionBack,
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
