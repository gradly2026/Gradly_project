import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

type GuardMode =
  /** Pantallas protegidas (dashboards): al presionar "atrás" pregunta si desea cerrar sesión. */
  | 'protected'
  /** Pantallas de login/registro: "atrás" no debe sacar al usuario de la pantalla. */
  | 'block';

interface BackNavigationGuardOptions {
  mode: GuardMode;
  /** Se ejecuta cuando el usuario confirma "Cerrar sesión" (solo aplica a mode: 'protected'). */
  onConfirmLogout?: () => void | Promise<void>;
  message?: string;
}

/**
 * Intercepta el botón "atrás" del navegador (web) para que nunca navegue en
 * silencio fuera de la pantalla protegida actual.
 *
 * Mecanismo: se apila una entrada "ancla" en el historial (`history.pushState`)
 * y, cada vez que el usuario presiona "atrás" (evento `popstate`), se vuelve a
 * apilar esa misma entrada de inmediato — esto anula la navegación que el
 * navegador ya hizo, dejando al usuario en la misma pantalla.
 *
 * - mode 'protected': además muestra `window.confirm('¿Desea cerrar sesión?')`.
 *   Si acepta, se invoca `onConfirmLogout` (limpiar sesión + redirigir a login).
 *   Si cancela, el usuario simplemente se queda donde estaba.
 * - mode 'block': no permite salir en absoluto (login/registro) — sin diálogo.
 *
 * Solo aplica en web (`Platform.OS === 'web'`): en nativo no existe un botón
 * "atrás" de navegador equivalente, así que el hook no hace nada.
 */
export function useBackNavigationGuard({
  mode,
  onConfirmLogout,
  message = '¿Desea cerrar sesión?',
}: BackNavigationGuardOptions): void {
  // Se leen por ref dentro del listener para no tener que reinstalar el
  // listener (ni re-apilar el historial) cada vez que el componente vuelve a
  // renderizar con una nueva identidad de función (p. ej. `logout` de
  // AuthContext cambia en cada render del provider).
  const callbackRef = useRef(onConfirmLogout);
  const messageRef = useRef(message);
  useEffect(() => {
    callbackRef.current = onConfirmLogout;
    messageRef.current = message;
  });

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    // Entrada ancla: da un "colchón" en el historial para poder interceptar
    // el primer "atrás" sin dejar salir de la pantalla actual.
    window.history.pushState(null, '', window.location.href);

    const handlePopState = () => {
      // Re-apila de inmediato para neutralizar el "atrás" que el navegador
      // ya ejecutó — el usuario permanece visualmente en la misma pantalla.
      window.history.pushState(null, '', window.location.href);

      if (mode === 'block') return;

      const deseaCerrarSesion = window.confirm(messageRef.current);
      if (deseaCerrarSesion) {
        void callbackRef.current?.();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [mode]);
}
