import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { AutoText as Text } from '../src/components/AutoText';
import { COLORS, FONTS } from '../src/context/ThemeContext';

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
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.replace('/admin');
      return;
    }
    router.replace('/admin' as any);
  }, [router]);

  return (
    <View style={styles.root}>
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={styles.text}>Redirigiendo al panel administrativo...</Text>
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
