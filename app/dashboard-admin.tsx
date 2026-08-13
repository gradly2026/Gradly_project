// ════════════════════════════════════════════════════════════════════════
// GUÍA PARA PRINCIPIANTES:
// Este archivo es OTRO "puente" de ruta legada (como
// app/dashboard-estudiante.tsx), pero con una diferencia importante:
// en vez de usar el componente <Redirect> (que redirige "en silencio",
// sin pantalla intermedia visible), aquí se hace la redirección A MANO
// dentro de un useEffect, y MIENTRAS TANTO se muestra un loader con un
// mensaje. La razón está explicada en el comentario original de abajo:
// esta ruta ya casi nadie la visita en el flujo normal (el login manda
// directo a /admin), pero podría llegar alguien por un link viejo
// guardado, y se prefiere mostrar algo (aunque sea un instante) en vez de
// una redirección completamente invisible.
// ════════════════════════════════════════════════════════════════════════

import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { AutoText as Text } from '../src/components/AutoText';
// Se importa AutoText renombrado como "Text" (mismo truco visto en
// FloatingTopBar.tsx) — aunque aquí el texto es fijo en español y no
// dinámico de la base de datos, así que en rigor podría haber sido un
// <Text> normal; usar AutoText no hace daño, pero tampoco aporta nada
// extra en este caso puntual.
import { COLORS, FONTS } from '../src/context/ThemeContext';
// Nota: usa el `COLORS` FIJO (siempre tema oscuro), no `useTheme().colors`
// — para una pantalla de transición de medio segundo que redirige sola,
// no vale la pena conectar el Context completo del tema.

/**
 * Ruta legada: el panel admin real vive en `app/admin/index.tsx` (`/admin`).
 * `roleRouting.ts` ya envía ahí al iniciar sesión, así que nadie navega a esta
 * pantalla en flujo normal — pero la ruta sigue siendo alcanzable por un
 * bookmark o deep link viejo. En vez de mostrar el panel duplicado (que
 * quedaría desactualizado respecto al canónico), redirige de inmediato.
 */
export default function DashboardAdmin() {
  const router = useRouter();

  useEffect(() => {
    // Efecto que corre UNA vez al montar esta pantalla (dependencias
    // [router], que en la práctica no cambia).
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.replace('/admin');
      return;
      // En la versión WEB, en vez de usar la navegación de Expo Router,
      // se usa la API nativa del navegador `window.location.replace(...)`.
      // La diferencia con router.replace() es sutil pero importante:
      // .replace() (tanto la de window.location como la de router) NO
      // agrega una entrada nueva al historial de navegación — sustituye
      // la actual. Así, si el usuario presiona "atrás" después de la
      // redirección, no vuelve a caer en esta pantalla puente (que solo
      // lo mandaría de nuevo a /admin en un bucle molesto).
    }
    router.replace('/admin' as any);
    // En nativo (Android/iOS), se usa el router de Expo en vez de
    // `window`, que no existe en esas plataformas. "as any" evita un
    // posible chequeo de tipos demasiado estricto sobre las rutas válidas
    // de Expo Router.
  }, [router]);

  return (
    <View style={styles.root}>
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={styles.text}>Redirigiendo al panel administrativo...</Text>
      {/* Este contenido se alcanza a ver brevemente MIENTRAS el useEffect
          de arriba dispara la redirección real — en la práctica, dura una
          fracción de segundo, pero evita que la pantalla se vea
          "congelada en blanco" ese instante. */}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.backgroundDark,
    gap: 12,
  },
  text: {
    color: COLORS.textMuted,
    fontFamily: FONTS.interMedium,
  },
});
