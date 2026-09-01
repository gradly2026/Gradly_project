/**
 * FloatingSearchButton — botón circular flotante (Glassmorphism) situado
 * 3px por encima del FloatingNavBar (lado derecho).
 *
 * Al pulsarlo abre el GlobalSearchOverlay (buscador global con FadeIn).
 */
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { shadow } from '../utils/shadow';
import GlobalSearchOverlay from './GlobalSearchOverlay';

// Altura del FloatingNavBar (debe coincidir con la del componente)
const NAV_HEIGHT = 64;

interface FloatingSearchButtonProps {
  /** Reservado para compatibilidad — el buscador global define su propio texto */
  placeholder?: string;
}

export default function FloatingSearchButton(_props: FloatingSearchButtonProps) {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const [open, setOpen] = useState(false);

  const navBottom = Math.max(insets.bottom, 12);
  const buttonBottom = navBottom + NAV_HEIGHT + 3; // 3px por encima del navbar

  const toggle = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setOpen(v => !v);
  };

  return (
    <>
      <View style={[styles.btnWrap, { bottom: buttonBottom, pointerEvents: 'box-none' }]}>
        {/* El color sólido va en el Pressable, NO en el BlurView: en web
            expo-blur SOBREESCRIBE el backgroundColor con un tinte
            blanquecino/negruzco según `tint`, lo que en modo claro dejaba el
            botón casi blanco y la lupa (blanca) invisible. El BlurView queda
            detrás solo como efecto decorativo. */}
        <Pressable
          onPress={toggle}
          style={[
            styles.btn,
            {
              backgroundColor: isDark ? 'rgba(124,58,237,0.92)' : '#7C3AED',
              borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.35)',
            },
          ]}
        >
          <BlurView
            intensity={24}
            tint={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <Ionicons name="search" size={24} color="#fff" />
        </Pressable>
      </View>

      <GlobalSearchOverlay visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  btnWrap: {
    position: 'absolute',
    right: 20,
    zIndex: 45,
  },
  btn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    ...shadow({ color: '#000', y: 2, blur: 8, opacity: 0.35, elevation: 9 }),
  },
});
