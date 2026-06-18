import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotification, type NotifType } from '../contexts/NotificationContext';
import { COLORS, FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { shadow } from '../utils/shadow';

// ─────────────────────────────────────────────
// CONFIG POR TIPO
// ─────────────────────────────────────────────
const CONFIG: Record<NotifType, { color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  success: { color: COLORS.success,     bg: 'rgba(16,185,129,0.15)',  icon: 'checkmark-circle' },
  warning: { color: COLORS.warning,     bg: 'rgba(245,158,11,0.15)',  icon: 'warning' },
  error:   { color: COLORS.error,       bg: 'rgba(239,68,68,0.15)',   icon: 'close-circle' },
  info:    { color: COLORS.primaryLight, bg: 'rgba(167,139,250,0.15)', icon: 'information-circle' },
};

// ─────────────────────────────────────────────
// COMPONENTE
// ─────────────────────────────────────────────
export default function NotificationBanner() {
  const { notification, hideNotification } = useNotification();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const translateY = useSharedValue(-160);
  const opacity    = useSharedValue(0);

  // Animar entrada cuando aparece una nueva notificación
  useEffect(() => {
    if (!notification) {
      translateY.value = withTiming(-160, { duration: 280 });
      opacity.value    = withTiming(0, { duration: 280 });
    } else {
      translateY.value = -160;
      opacity.value    = 0;
      translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
      opacity.value    = withTiming(1, { duration: 220 });
    }
  }, [notification?.id]);

  // Gesto de swipe hacia arriba para cerrar
  const gesture = Gesture.Pan()
    .onChange(e => {
      if (e.translationY < 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd(e => {
      if (e.translationY < -35 || e.velocityY < -700) {
        translateY.value = withTiming(-160, { duration: 250 }, () => {
          runOnJS(hideNotification)();
        });
        opacity.value = withTiming(0, { duration: 250 });
      } else {
        translateY.value = withSpring(0, { damping: 20 });
      }
    });

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity:   opacity.value,
  }));

  if (!notification) return null;

  const cfg = CONFIG[notification.tipo];

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[
          styles.banner,
          { top: insets.top + 8, backgroundColor: colors.backgroundSurface },
          animStyle,
          { pointerEvents: 'box-none' },
        ]}
      >
        {/* Borde de color izquierdo */}
        <View style={[styles.colorBar, { backgroundColor: cfg.color }]} />

        {/* Contenido */}
        <View style={[styles.iconWrap, { backgroundColor: cfg.bg }]}>
          <Ionicons name={cfg.icon} size={22} color={cfg.color} />
        </View>

        <View style={styles.textWrap}>
          <Text style={styles.titulo} numberOfLines={1}>{notification.titulo}</Text>
          <Text style={styles.mensaje} numberOfLines={2}>{notification.mensaje}</Text>
        </View>

        {/* Botón cerrar */}
        <TouchableOpacity onPress={hideNotification} style={styles.closeBtn} hitSlop={10}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </Animated.View>
    </GestureDetector>
  );
}

// ─────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────
const makeStyles = (COLORS: GradlyColors) => StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    // Sombra (multiplataforma)
    ...shadow({ color: '#000', y: 8, blur: 16, opacity: 0.3, elevation: 20 }),
  },
  colorBar: {
    width: 4,
    alignSelf: 'stretch',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
    marginVertical: 12,
  },
  textWrap: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  titulo: {
    fontSize: 14,
    fontFamily: FONTS.interSemiBold,
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  mensaje: {
    fontSize: 12,
    fontFamily: FONTS.interRegular,
    color: COLORS.textMuted,
    lineHeight: 16,
  },
  closeBtn: {
    padding: 12,
    alignSelf: 'flex-start',
  },
});
