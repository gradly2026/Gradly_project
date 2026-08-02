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
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { LogBox } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import NotificationBanner from '../src/components/NotificationBanner';
import { AuthProvider } from '../src/context/AuthContext';
import { ThemeProvider } from '../src/context/ThemeContext';
import { TranslationProvider } from '../src/context/TranslationContext';
import { NotificationProvider } from '../src/contexts/NotificationContext';
import { patchAlertConTraduccion } from '../src/utils/patchAlert';

// Traduce al vuelo el título/mensaje/botones de todos los Alert.alert de la app.
patchAlertConTraduccion();

// Silencia advertencias inofensivas de React Native Web (no afectan la funcionalidad)
LogBox.ignoreLogs(['props.pointerEvents is deprecated', 'As of February 21st, 2024']);

// Mantiene el splash nativo visible hasta que las fuentes estén listas
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
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

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // No renderiza nada hasta que las fuentes carguen (el splash nativo ocupa la pantalla)
  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
        <AuthProvider>
          <ThemeProvider>
            <TranslationProvider>
              <NotificationProvider>
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="index" />
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="auth" />
                  <Stack.Screen name="admin" />
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
                </Stack>
                <StatusBar style="light" />
                {/* Banner flotante — siempre visible sobre cualquier pantalla */}
                <NotificationBanner />
              </NotificationProvider>
            </TranslationProvider>
          </ThemeProvider>
        </AuthProvider>
        </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
