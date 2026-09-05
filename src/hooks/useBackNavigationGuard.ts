import { useIsFocused } from '@react-navigation/native';
import { usePathname } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform } from 'react-native';

type GuardMode =
  /** Pantallas protegidas (dashboards): "atrás" recorre las secciones internas
   *  y, al agotarlas, deja al usuario quieto en "Inicio" — nunca lo saca al
   *  login ni ofrece cerrar sesión (eso es solo el botón de "Mi Perfil"). */
  | 'protected'
  /** Pantallas de login/registro: "atrás" no debe sacar al usuario de la pantalla. */
  | 'block';

interface BackNavigationGuardOptions<S extends string = string> {
  mode: GuardMode;
  /** Se ejecuta cuando el usuario confirma "Cerrar sesión" (solo aplica a mode: 'protected'). */
  onConfirmLogout?: () => void | Promise<void>;
  /**
   * Sección interna ACTIVA ahora mismo (p. ej. 'inicio' | 'vacantes' | ... en
   * los dashboards, o la pestaña activa en (tabs)/_layout.tsx). Si se pasa,
   * el guard registra una entrada de historial real por cada sección nueva
   * que se visita, y el "atrás" del navegador primero recorre esas
   * secciones (Inicio → Vacantes → Mensajes → Inicio → Vacantes...) ANTES
   * de considerar que el usuario quiere salir de verdad del área protegida.
   * Sin esto (u omitiendo esta prop), cualquier "atrás" se limita a
   * re-anclar el historial: el usuario se queda donde está, sin recorrer
   * secciones ni salir al login.
   */
  section?: S;
  /** Se invoca cuando el "atrás" del navegador debe volver a una sección
   * interna anterior — típicamente el setter de esa sección (setSeccion). */
  onSectionBack?: (previous: S) => void;
}

interface BackNavigationGuardResult {
  /** true mientras se debe mostrar la confirmación de cierre de sesión (el
   * llamador la renderiza con <SalirSesionModal .../>). */
  showLogoutConfirm: boolean;
  /** El usuario confirmó "Cerrar sesión" en el modal. */
  confirmLogout: () => void;
  /** El usuario canceló — se queda donde estaba. */
  cancelLogout: () => void;
}

/**
 * Intercepta el botón "atrás" del navegador (web) para que nunca navegue en
 * silencio fuera de la pantalla protegida actual.
 *
 * Mecanismo: se apila una entrada "ancla" en el historial (`history.pushState`)
 * al montar, y — si se pasa `section` — UNA entrada más por cada sección
 * interna nueva que se visita (la pila interna `stackRef` lleva la cuenta).
 * Cada vez que el usuario presiona "atrás" (evento `popstate`):
 *   - si todavía quedan secciones internas por deshacer, se retrocede una
 *     (se invoca `onSectionBack`) y el navegador se deja avanzar con
 *     normalidad — SIN preguntar nada.
 *   - si ya no quedan (estamos en la entrada ancla), se anula ese "atrás"
 *     (se vuelve a apilar la misma entrada) y el usuario se queda donde
 *     está — normalmente ya en "Inicio" tras recorrer las secciones.
 *     NUNCA se ofrece cerrar sesión desde aquí: el único camino para cerrar
 *     sesión es el botón "Cerrar sesión" de la sección "Mi Perfil" de cada
 *     panel. (`showLogoutConfirm` sigue en el retorno por compatibilidad con
 *     los llamadores, pero ya nunca se pone en true.)
 * - mode 'block': igual — tampoco deja salir de login/registro.
 *
 * En NATIVO (Android/gesto iOS) la regla es DISTINTA a propósito: ahí SÍ se
 * deja salir de la app (nunca al login, nunca cerrar sesión) una vez
 * agotadas las secciones/pantallas visitadas — ver el bloque de
 * `BackHandler` más abajo (solo `mode: 'protected'` CON `section`) y
 * `backBehavior="history"` en los tabs de estudiante.
 */
export function useBackNavigationGuard<S extends string = string>({
  mode,
  onConfirmLogout,
  section,
  onSectionBack,
}: BackNavigationGuardOptions<S>): BackNavigationGuardResult {
  // Se leen por ref dentro del listener para no tener que reinstalar el
  // listener (ni re-apilar el historial) cada vez que el componente vuelve a
  // renderizar con una nueva identidad de función (p. ej. `logout` de
  // AuthContext cambia en cada render del provider).
  const callbackRef = useRef(onConfirmLogout);
  const onSectionBackRef = useRef(onSectionBack);
  useEffect(() => {
    callbackRef.current = onConfirmLogout;
    onSectionBackRef.current = onSectionBack;
  });

  // La pantalla protegida (dashboard) NUNCA se desmonta cuando se empuja una
  // pantalla hija encima (chat, mensajes, etc.) — sigue viva debajo, en el
  // mismo Stack de navegación raíz. Sin esto, el listener de `popstate` de
  // abajo interceptaría también el "atrás" de esas pantallas hijas (p. ej. la
  // flecha del chat) y preguntaría por cerrar sesión en vez de dejarlas
  // regresar al dashboard con normalidad. Solo se debe interceptar cuando
  // ESTA pantalla es la que está realmente activa.
  const isFocused = useIsFocused();
  const isFocusedRef = useRef(isFocused);
  useEffect(() => {
    isFocusedRef.current = isFocused;
  }, [isFocused]);

  // Ruta actual (expo-router) — solo se usa en web, para detectar navegación
  // "real" (cambio de URL) que no pasó por `section`/`onSectionBack` — p. ej.
  // los tabs de estudiante, donde cada pestaña ES una ruta de archivo
  // distinta y expo-router empuja su PROPIA entrada de historial al cambiar
  // de pestaña (ver el efecto que reacciona a `pathname` más abajo).
  const pathname = usePathname();

  // Pila de secciones internas visitadas — arranca con la sección inicial
  // (si se pasó `section`) para que el primer "atrás" ya sepa que esa fue
  // la primera parada.
  const stackRef = useRef<S[]>(section !== undefined ? [section] : []);

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Detecta navegación HACIA ADELANTE dentro del área protegida (p. ej. el
  // usuario tocó "Vacantes" en el menú): registra una entrada de historial
  // real para que el "atrás" tenga algo que recorrer. Cuando el cambio de
  // `section` vino AL REVÉS (el propio handlePopState ya hizo pop y avisó
  // vía onSectionBack), la pila ya tiene a `section` en el tope — el guard
  // de abajo lo detecta y no hace nada.
  useEffect(() => {
    if (section === undefined) return;
    const stack = stackRef.current;
    if (stack.length === 0) {
      stack.push(section);
      return;
    }
    if (stack[stack.length - 1] === section) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.pushState(null, '', window.location.href);
    }
    stack.push(section);
  }, [section]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    // Entrada ancla: da un "colchón" en el historial para poder interceptar
    // el primer "atrás" sin dejar salir de la pantalla actual.
    window.history.pushState(null, '', window.location.href);

    // Refuerzo diferido: justo después de iniciar sesión, la pantalla de
    // login hace un `router.replace()` inmediato Y (por seguridad, ante
    // casos raros donde el primero "no toma efecto") uno de RESPALDO medio
    // segundo más tarde (ver app/auth/iniciosesion.tsx, completeSignIn). Si
    // ese segundo `replace` llega DESPUÉS del ancla de arriba, la
    // reemplaza en el sitio (sin dejar "colchón") y un solo "atrás" real
    // podría entonces salir de la app. Este refuerzo re-apila el ancla una
    // vez más, ya pasado ese margen, para que quede intacta pase lo que
    // pase con esa navegación de respaldo.
    const refuerzo = setTimeout(() => {
      if (!isFocusedRef.current) return;
      window.history.pushState(null, '', window.location.href);
    }, 900);

    const handlePopState = () => {
      // Si esta pantalla no está activa (hay una pantalla hija encima que
      // absorbió el "atrás"), se deja navegar con normalidad — no es un
      // intento de salir de la pantalla protegida.
      if (!isFocusedRef.current) return;

      const stack = stackRef.current;
      if (stack.length > 1) {
        // Todavía hay secciones internas por deshacer: el navegador YA
        // avanzó su historial solo (así llegó este evento) — solo hace
        // falta sincronizar el estado de la pantalla con la sección
        // anterior, sin preguntar nada.
        stack.pop();
        onSectionBackRef.current?.(stack[stack.length - 1]);
        return;
      }

      // Ya no hay más secciones internas por deshacer: este "atrás" intentaría
      // sacar al usuario del área protegida (hacia el login). Se anula SIEMPRE
      // re-apilando la misma entrada, así el usuario se queda donde está
      // (normalmente ya en "Inicio" tras recorrer las secciones). NO se ofrece
      // cerrar sesión aquí: el único camino es el botón "Cerrar sesión" de la
      // sección "Mi Perfil". `mode: 'block'` (login/registro) ya se comportaba
      // así — ahora `'protected'` también.
      window.history.pushState(null, '', window.location.href);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      clearTimeout(refuerzo);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [mode]);

  // Re-anclar ante cualquier cambio REAL de URL mientras esta pantalla está
  // enfocada — más allá de lo que `section` ya cubre. Caso concreto: los
  // tabs de estudiante (app/(tabs)/_layout.tsx) NO pasan `section` (cada
  // pestaña es su propia ruta de archivo, ya sincronizada por expo-router),
  // así que cambiar de pestaña empuja una entrada de historial REAL que
  // este hook no controla — sin este efecto, esa entrada podía quedar sin
  // ancla propia encima, dejando un solo "atrás" más cerca de escapar del
  // área protegida. Para pantallas con `section` (empresa/universidad) esto
  // no cambia nada: su URL no cambia al cambiar de sección. Se ignora el
  // primer valor (el mount de arriba ya se encarga de ese caso).
  const pathnameMontadoRef = useRef(false);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (!pathnameMontadoRef.current) {
      pathnameMontadoRef.current = true;
      return;
    }
    if (!isFocusedRef.current) return;
    window.history.pushState(null, '', window.location.href);
  }, [pathname]);

  // ── NATIVO (Android/gesto iOS): botón físico "atrás" o gesto de deslizar
  //    para regresar. En web lo cubre el listener de `popstate` de arriba
  //    (ahí SÍ debe quedarse siempre dentro del panel); en NATIVO la regla de
  //    producto es DISTINTA a propósito: el usuario debe poder recorrer hacia
  //    atrás cada sección/pantalla interna que haya visitado (en el orden
  //    inverso en que las visitó) y, al llegar a la primera (justo donde
  //    entró tras iniciar sesión), el siguiente "atrás" SÍ debe sacarlo de la
  //    app (comportamiento nativo estándar) — nunca cerrar sesión ni mandar
  //    al login. Solo aplica a pantallas protegidas CON secciones internas
  //    (paneles de empresa/universidad); los tabs de estudiante logran el
  //    mismo recorrido con `backBehavior="history"` en su propio `<Tabs>`
  //    (ver app/(tabs)/_layout.tsx), que ya delega correctamente en el
  //    sistema al agotarse. iOS no tiene botón físico (BackHandler inerte;
  //    el gesto de deslizar de un Stack sí lo cubre React Navigation solo).
  const hasSection = section !== undefined;
  useEffect(() => {
    if (Platform.OS === 'web' || mode !== 'protected' || !hasSection) return;

    const onHardwareBack = (): boolean => {
      // Hay una pantalla hija encima (chat, modal a pantalla completa…): que
      // la maneje ella — no interceptamos el "atrás" del dashboard de fondo.
      if (!isFocusedRef.current) return false;

      const stack = stackRef.current;
      if (stack.length > 1) {
        stack.pop();
        onSectionBackRef.current?.(stack[stack.length - 1]);
        return true;
      }
      // Ya en la sección inicial (la primera que visitó tras entrar): no hay
      // nada más que deshacer — se deja pasar el "atrás" (return false) para
      // que el sistema operativo haga lo suyo y cierre/minimice la app. NO
      // se consume aquí: consumirlo dejaría al usuario "atrapado" en el
      // panel, que es justo el comportamiento de WEB, no el de nativo.
      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => sub.remove();
  }, [mode, hasSection]);

  const confirmLogout = useCallback(() => {
    setShowLogoutConfirm(false);
    void callbackRef.current?.();
  }, []);

  const cancelLogout = useCallback(() => setShowLogoutConfirm(false), []);

  return { showLogoutConfirm, confirmLogout, cancelLogout };
}
