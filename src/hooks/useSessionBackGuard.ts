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
 * empresa, universidad y admin). Al presionar "atrás" en el navegador:
 *   - si se pasó `section`, primero recorre las secciones internas
 *     visitadas (Inicio → Vacantes → Mensajes → ...) sin preguntar nada.
 *   - al llegar al final de esa pila, pregunta "¿Desea cerrar sesión?" con
 *     un modal propio (el llamador debe renderizar <SalirSesionModal
 *     visible={...} onConfirm={...} onCancel={...} /> con lo que devuelve
 *     este hook): si acepta, cierra sesión (Firebase Auth + estado local) y
 *     redirige a `/auth/iniciosesion`; si cancela, se queda donde estaba.
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
