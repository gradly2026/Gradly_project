import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { AutoText as Text, useAutoText } from "./AutoText";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONTS, useTheme } from '../context/ThemeContext';
import { shadow } from '../utils/shadow';

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
export interface NavItem<K extends string = string> {
  key: K;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Badge numérico opcional (ej. solicitudes pendientes) */
  badge?: number;
}

interface FloatingNavBarProps<K extends string = string> {
  items: NavItem<K>[];
  activeKey: K;
  onChange: (key: K) => void;
  /**
   * Botón extra al final de la barra (p. ej. notificaciones): mismo
   * tamaño/espaciado que los demás botones, pero NO participa de la
   * píldora deslizante ni cambia `activeKey` — solo dispara `onPress`.
   */
  extraButton?: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    badge?: number;
    onPress: () => void;
  };
  /**
   * `'floating'` (por defecto): la píldora flota fija abajo de toda la
   * pantalla (`position: absolute`) — el uso de siempre en móvil/app.
   * `'inline'`: se dibuja como una fila normal, en el lugar exacto donde se
   * la coloque en el JSX del padre, sin posición absoluta ni el margen de
   * zona segura inferior (usado por DashboardTopBar, para laptop/tablet).
   */
  variant?: 'floating' | 'inline';
}

// Configuración de muelle compartida → animación fluida tipo iOS
const SPRING = { damping: 16, stiffness: 180, mass: 0.9 };

// ─────────────────────────────────────────────
// COMPONENTE
// ─────────────────────────────────────────────
export default function FloatingNavBar<K extends string = string>({
  items,
  activeKey,
  onChange,
  extraButton,
  variant = 'floating',
}: FloatingNavBarProps<K>) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [barWidth, setBarWidth] = useState(0);
  const isInline = variant === 'inline';

  const activeIndex = Math.max(0, items.findIndex(i => i.key === activeKey));
  // El botón extra ocupa un espacio más en la fila, pero no entra en la
  // píldora deslizante (esa solo se mueve entre `items`).
  const slotCount = items.length + (extraButton ? 1 : 0);
  const itemWidth = barWidth > 0 ? barWidth / slotCount : 0;

  // Posición animada del indicador deslizante (bolita)
  const indicatorX = useSharedValue(0);

  useEffect(() => {
    if (itemWidth > 0) {
      indicatorX.value = withSpring(activeIndex * itemWidth, SPRING);
    }
  }, [activeIndex, itemWidth, indicatorX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: itemWidth,
  }));

  const handlePress = (item: NavItem<K>) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onChange(item.key);
  };

  const bar = (
    <BlurView
      intensity={40}
      tint={isDark ? 'dark' : 'light'}
      style={[
        styles.bar,
        isInline && styles.barInline,
        {
          backgroundColor: isDark ? 'rgba(26,16,48,0.55)' : 'rgba(255,255,255,0.6)',
          borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(124,58,237,0.18)',
        },
      ]}
      onLayout={e => setBarWidth(e.nativeEvent.layout.width)}
    >
      {/* Indicador deslizante (bolita / píldora) */}
      {itemWidth > 0 && (
        <Animated.View style={[styles.indicatorTrack, indicatorStyle, { pointerEvents: 'none' }]}>
          <View style={[styles.indicatorPill, { backgroundColor: colors.primary20, borderColor: colors.primary35 }]} />
        </Animated.View>
      )}

      {items.map((item, index) => (
        <NavButton
          key={item.key}
          item={item}
          active={index === activeIndex}
          onPress={() => handlePress(item)}
        />
      ))}
      {extraButton && <ExtraNavButton item={extraButton} />}
    </BlurView>
  );

  if (isInline) return bar;

  return (
    <View
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12), pointerEvents: 'box-none' }]}
    >
      {bar}
    </View>
  );
}

// ─────────────────────────────────────────────
// BOTÓN INDIVIDUAL (con rebote de escala)
// ─────────────────────────────────────────────
function NavButton<K extends string>({
  item,
  active,
  onPress,
}: {
  item: NavItem<K>;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const labelText = useAutoText(item.label); // traduce la etiqueta de navegación
  // 0 = inactivo, 1 = activo → controla escala/rebote y color
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    progress.value = active
      ? withSpring(1, { damping: 9, stiffness: 220, mass: 0.7 })
      : withTiming(0, { duration: 180 });
  }, [active, progress]);

  const scale = useDerivedValue(() => 1 + progress.value * 0.18);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: -progress.value * 2 }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    color: interpolateColor(
      progress.value,
      [0, 1],
      [colors.textMuted, colors.primaryLight],
    ),
  }));

  return (
    <Pressable style={styles.button} onPress={onPress} hitSlop={8}>
      <Animated.View style={iconStyle}>
        <Ionicons
          name={item.icon}
          size={24}
          color={active ? colors.primaryLight : colors.textMuted}
        />
        {!!item.badge && item.badge > 0 && (
          <View style={[styles.badge, { backgroundColor: colors.error }]}>
            <Text style={styles.badgeText}>{item.badge > 99 ? '99+' : item.badge}</Text>
          </View>
        )}
      </Animated.View>
      <Animated.Text numberOfLines={1} style={[styles.label, labelStyle]}>
        {labelText}
      </Animated.Text>
    </Pressable>
  );
}

// ─────────────────────────────────────────────
// BOTÓN EXTRA (sin animación de "activo" — p. ej. notificaciones)
// ─────────────────────────────────────────────
function ExtraNavButton({
  item,
}: {
  item: { icon: keyof typeof Ionicons.glyphMap; label: string; badge?: number; onPress: () => void };
}) {
  const { colors } = useTheme();
  const labelText = useAutoText(item.label);

  const handlePress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    item.onPress();
  };

  return (
    <Pressable style={styles.button} onPress={handlePress} hitSlop={8}>
      <View>
        <Ionicons name={item.icon} size={24} color={colors.textMuted} />
        {!!item.badge && item.badge > 0 && (
          <View style={[styles.badge, { backgroundColor: colors.error }]}>
            <Text style={styles.badgeText}>{item.badge > 99 ? '99+' : item.badge}</Text>
          </View>
        )}
      </View>
      <Text numberOfLines={1} style={[styles.label, { color: colors.textMuted }]}>
        {labelText}
      </Text>
    </Pressable>
  );
}

// ─────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    height: 64,
    marginHorizontal: 20,
    borderRadius: 30,
    overflow: 'hidden',
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    // Vidrio: fondo translúcido sobre el blur
    backgroundColor: 'rgba(26,16,48,0.55)',
    // Sombra suave (multiplataforma)
    ...shadow({ color: '#000', y: 2, blur: 12, opacity: 0.35, elevation: 8 }),
  },
  // Variante `inline` (dentro de DashboardTopBar): sin el margen horizontal
  // que tiene al flotar (ese margen viene del lado del padre) y `flex: 1`
  // para ocupar el espacio disponible entre la marca y los 3 íconos.
  // `alignSelf: 'auto'` cancela el `alignSelf: 'stretch'` de `bar` — en la
  // fila horizontal del padre eso estiraría el ALTO en vez del ancho.
  barInline: {
    marginHorizontal: 0,
    alignSelf: 'auto',
    flex: 1,
  },
  indicatorTrack: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 8,
  },
  indicatorPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
  },
  button: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: {
    fontSize: 10,
    fontFamily: FONTS.interSemiBold,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 9,
    fontFamily: FONTS.interSemiBold,
    color: '#fff',
  },
});
