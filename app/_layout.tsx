// ════════════════════════════════════════════════════════════════════════
// app/_layout.tsx — EL ARCHIVO MÁS IMPORTANTE DEL ARRANQUE DE LA APP
//
// GUÍA PARA PRINCIPIANTES:
// Este es el "_layout.tsx" de la carpeta RAÍZ app/ — por lo tanto envuelve
// LITERALMENTE TODA la aplicación, sin excepción. Es el primer código de
// React que se ejecuta al abrir Gradly. Aquí pasan 3 cosas fundamentales
// que cualquier otra pantalla del proyecto da por hechas:
//   1. Se cargan las fuentes personalizadas (Sora/Inter/Rajdhani) antes de
//      mostrar nada, para que nunca se vea texto con la fuente "por
//      defecto" del sistema por un instante.
//   2. Se "envuelve" toda la app en los 4 Providers globales (Auth, Theme,
//      Translation, Notification) — así CUALQUIER pantalla, sin importar
//      cuán anidada esté, puede usar useAuth()/useTheme()/useTranslation().
//   3. Se declara la lista de rutas de nivel superior del Stack principal
//      de navegación.
// ════════════════════════════════════════════════════════════════════════

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  Rajdhani_400Regular,
  Rajdhani_500Medium,
  Rajdhani_600SemiBold,
  Rajdhani_700Bold,
} from '@expo-google-fonts/rajdhani';
import {
  Sora_400Regular,
  Sora_600SemiBold,
  Sora_700Bold,
  Sora_800ExtraBold,
} from '@expo-google-fonts/sora';
// Estos 3 bloques importan los ARCHIVOS de fuente reales (Google Fonts,
// empaquetadas por Expo) en cada uno de sus "pesos" (Regular, Medium,
// SemiBold, Bold...). Son los mismos nombres que después se usan como
// texto en `FONTS` (ver src/context/ThemeContext.tsx) — por ejemplo,
// `Sora_700Bold` es tanto el nombre del import de aquí como el valor de
// `FONTS.soraBold` allá.

import { useFonts } from 'expo-font';
// useFonts({...}) es el hook de Expo que CARGA de verdad esas fuentes en
// el dispositivo (son archivos, tardan un poquito) y avisa cuándo ya
// están listas para usarse.

import { Stack } from 'expo-router';
// El componente de navegación tipo "pila" — igual concepto visto en
// app/admin/_layout.tsx y app/auth/_layout.tsx, pero aquí es el Stack de
// más alto nivel de TODA la app.

import * as SplashScreen from 'expo-splash-screen';
// SplashScreen: controla la pantalla de bienvenida nativa que el sistema
// operativo muestra automáticamente mientras la app termina de arrancar
// (el logo de Gradly a pantalla completa, antes de que React siquiera
// empiece a dibujar algo).

import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { LogBox } from 'react-native';
// LogBox: permite controlar qué advertencias de desarrollo se muestran
// (o se ocultan) en pantalla mientras se programa.

import { GestureHandlerRootView } from 'react-native-gesture-handler';
// Un contenedor RAÍZ obligatorio para que funcionen correctamente los
// gestos táctiles avanzados (deslizar, arrastrar) en TODA la app — varias
// librerías de gestos de terceros lo requieren envolviendo la app entera.

import 'react-native-reanimated';
// Import "sin nombre" (sin `import algo from ...`): esto significa que
// solo se está EJECUTANDO el código de configuración interna de la
// librería `react-native-reanimated` (animaciones de alto rendimiento),
// sin necesitar usar directamente ningún valor que exporte aquí. Debe
// importarse una sola vez, cerca de la raíz de la app.

import { SafeAreaProvider } from 'react-native-safe-area-context';
// Provider que habilita, para TODA la app, el uso de hooks como
// useSafeAreaInsets() (visto en FloatingTopBar.tsx) — sin este Provider
// envolviendo la app, esos hooks no funcionarían.

import NotificationBanner from '../src/components/NotificationBanner';
import { AppAlertHost } from '../src/components/AppAlert';
// Avisos/confirmaciones propios (Modal) que SÍ funcionan en web, a diferencia
// de Alert.alert. Ver src/components/AppAlert.tsx.
// Un componente distinto a la campanita de FloatingTopBar: dibuja un
// pequeño "banner" (aviso) que aparece brevemente en la parte superior de
// la pantalla cuando llega una notificación NUEVA mientras el usuario ya
// está usando la app activamente (parecido a una notificación push
// visual, pero dibujada dentro de la propia UI).

import { AuthProvider } from '../src/context/AuthContext';
import { ThemeProvider } from '../src/context/ThemeContext';
import { TranslationProvider } from '../src/context/TranslationContext';
import { NotificationProvider } from '../src/contexts/NotificationContext';
// Los 4 Providers globales del proyecto. Nota la carpeta: los 3 primeros
// vienen de `src/context/` (singular) y el último de `src/contexts/`
// (plural) — son carpetas DISTINTAS que coexisten en el proyecto, cuidado
// al escribir la ruta de import a mano.

import { patchAlertConTraduccion } from '../src/utils/patchAlert';
// Una función que "parchea" (modifica en caliente) el comportamiento
// global de `Alert.alert` de React Native, para que sus textos también
// pasen por el sistema de traducción — se ejecuta una sola vez, ver la
// línea suelta justo abajo.

// Traduce al vuelo el título/mensaje/botones de todos los Alert.alert de la app.
patchAlertConTraduccion();
// Esta línea NO está dentro de ninguna función ni componente: es "código
// a nivel de módulo", igual concepto que el `seedStaticCache()` suelto en
// translationService.ts — se ejecuta UNA sola vez, automáticamente, en
// cuanto este archivo se carga por primera vez (que, al ser el _layout.tsx
// raíz, es prácticamente lo primero que corre en toda la app).

// Silencia advertencias inofensivas de React Native Web (no afectan la funcionalidad)
LogBox.ignoreLogs(['props.pointerEvents is deprecated', 'As of February 21st, 2024']);
// También código a nivel de módulo: le dice a React Native que NO
// muestre en pantalla (durante desarrollo) estas 2 advertencias
// específicas, porque son conocidas, no representan un error real, y
// solo generarían ruido visual constante mientras se programa.

// Mantiene el splash nativo visible hasta que las fuentes estén listas
SplashScreen.preventAutoHideAsync();
// Por defecto, el splash nativo se oculta automáticamente apenas React
// termina de montar el primer frame. Esta línea CANCELA ese
// comportamiento automático — el splash se queda visible hasta que el
// propio código decida ocultarlo a mano (ver el useEffect más abajo,
// SplashScreen.hideAsync()), garantizando así que nunca se vea, ni por un
// instante, texto con una fuente incorrecta antes de que Sora/Inter/
// Rajdhani terminen de cargar.

export default function RootLayout() {
  // El componente raíz de TODA la aplicación. Expo Router busca
  // automáticamente un `export default` en app/_layout.tsx y lo usa como
  // el "molde" que envuelve cualquier otra pantalla.

  const [fontsLoaded, fontError] = useFonts({
    Sora_400Regular,
    Sora_600SemiBold,
    Sora_700Bold,
    Sora_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Rajdhani_400Regular,
    Rajdhani_500Medium,
    Rajdhani_600SemiBold,
    Rajdhani_700Bold,
  });
  // useFonts recibe un objeto donde cada clave es el NOMBRE con el que
  // esa fuente va a quedar registrada en el sistema (los mismos nombres
  // usados en `FONTS` de ThemeContext.tsx), y el valor es el archivo de
  // fuente importado arriba. Devuelve un array de 2 elementos
  // (destructurado con corchetes, como useState):
  //   - fontsLoaded → true cuando TODAS las fuentes terminaron de cargar.
  //   - fontError    → contiene un error si algo falló al cargar.

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
      // En cuanto las fuentes terminan de cargar (con éxito O con error —
      // en ambos casos ya no tiene sentido seguir esperando), se oculta el
      // splash nativo manualmente, revelando por fin la interfaz de React.
    }
  }, [fontsLoaded, fontError]);

  // No renderiza nada hasta que las fuentes carguen (el splash nativo ocupa la pantalla)
  if (!fontsLoaded && !fontError) return null;
  // Mientras las fuentes NO estén listas Y tampoco haya habido un error,
  // este componente no dibuja NADA (devuelve null) — la pantalla que se
  // ve en ese momento sigue siendo el splash nativo del sistema operativo,
  // no algo dibujado por React todavía.

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Contenedor raíz obligatorio para gestos, ocupando toda la pantalla
          (flex: 1). A partir de aquí empieza el anidado de TODOS los
          Providers — el orden de anidado importa poco entre sí en este
          caso (no dependen unos de otros al inicializarse), pero todos
          deben estar ARRIBA de cualquier pantalla para que sus hooks
          (useAuth, useTheme, useTranslation...) funcionen en cualquier
          parte de la app. */}
        <SafeAreaProvider>
        <AuthProvider>
          <ThemeProvider>
            <TranslationProvider>
              <NotificationProvider>
                <Stack screenOptions={{ headerShown: false }}>
                  {/* El Stack de navegación de más alto nivel. Cada
                      <Stack.Screen name="..."/> corresponde a un archivo o
                      carpeta dentro de app/ — declararlos aquí no es
                      estrictamente obligatorio (Expo Router los detecta
                      solo por convención de archivos), pero hacerlo de
                      forma explícita documenta cuáles son las rutas de
                      nivel superior "oficiales" del proyecto. */}
                  <Stack.Screen name="index" />
                  {/* app/index.tsx — pantalla de entrada/splash de React */}
                  <Stack.Screen name="(tabs)" />
                  {/* El grupo completo de pestañas del estudiante */}
                  <Stack.Screen name="auth" />
                  {/* El grupo app/auth/ (login, registro, action) */}
                  <Stack.Screen name="admin" />
                  {/* El grupo app/admin/ (panel de administración) */}
                  <Stack.Screen name="dashboard-admin" />
                  <Stack.Screen name="dashboard-universidad" />
                  <Stack.Screen name="dashboard-empresa" />
                  <Stack.Screen name="dashboard-estudiante" />
                  <Stack.Screen name="dashboard-joventalento" />
                  <Stack.Screen name="ChatScreen" />
                  <Stack.Screen name="mensajes/index" />
                  <Stack.Screen name="mensajes/[id]" />
                  {/* Rutas legado — compatibilidad mientras se migra */}
                  <Stack.Screen name="iniciosesion" />
                  <Stack.Screen name="registro" />
                  {/* Estas 2 últimas son justamente los archivos "puente"
                      (Redirect) que vimos en app/iniciosesion.tsx y
                      app/registro.tsx. */}
                </Stack>
                <StatusBar style="light" />
                {/* Configuración GLOBAL por defecto de la barra de estado
                    (íconos claros) — pantallas puntuales, como ChatScreen,
                    pueden sobrescribir esto localmente con su propio
                    <StatusBar style={...} />, que gana sobre este valor
                    global mientras esa pantalla esté activa. */}
                {/* Banner flotante — siempre visible sobre cualquier pantalla */}
                <NotificationBanner />
                {/* Host de avisos/confirmaciones propios (reemplaza Alert.alert
                    en los flujos que corren en web). Una sola instancia global. */}
                <AppAlertHost />
                {/* Al estar aquí, FUERA del <Stack> pero DENTRO de todos
                    los Providers, este banner puede aparecer flotando
                    sobre CUALQUIER pantalla de la app sin importar en cuál
                    esté el usuario, y sigue teniendo acceso a
                    useAuth/useTheme/useTranslation si los necesitara. */}
              </NotificationProvider>
            </TranslationProvider>
          </ThemeProvider>
        </AuthProvider>
        </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
