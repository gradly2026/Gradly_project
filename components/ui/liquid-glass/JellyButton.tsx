import React from 'react';
import { StyleProp, StyleSheet, Pressable, PressableProps, Platform, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useTheme } from '../../../src/context/ThemeContext';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface JellyButtonProps extends PressableProps {
  children: React.ReactNode;
  /** Override del padding/alineación interna para mapear estilos previos sin romper el layout. */
  contentStyle?: StyleProp<ViewStyle>;
}

export const JellyButton: React.FC<JellyButtonProps> = ({ children, style, contentStyle, ...props }) => {
  // Theme-aware: el tinte del cristal y el fondo siguen al tema activo. La física
  // de gelatina (spring scaleX/scaleY) se mantiene idéntica.
  const { isDark } = useTheme();
  const scaleX = useSharedValue(1);
  const scaleY = useSharedValue(1);

  const onPressIn = () => {
    scaleX.value = withSpring(0.92, { damping: 15, stiffness: 300 });
    scaleY.value = withSpring(0.96, { damping: 15, stiffness: 300 });
  };

  const onPressOut = () => {
    scaleX.value = withSpring(1, { damping: 5, stiffness: 150 });
    scaleY.value = withSpring(1, { damping: 5, stiffness: 150 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: scaleX.value }, { scaleY: scaleY.value }],
  }));

  const buttonBg = isDark
    ? Platform.OS === 'android'
      ? 'rgba(40, 20, 70, 0.6)'
      : 'rgba(255, 255, 255, 0.03)'
    : Platform.OS === 'android'
    ? 'rgba(124, 58, 237, 0.12)'
    : 'rgba(124, 58, 237, 0.08)';
  const borderColor = isDark ? 'rgba(180, 100, 255, 0.2)' : 'rgba(124, 58, 237, 0.30)';
  const glowColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(124, 58, 237, 0.15)';

  return (
    <AnimatedPressable
      {...props}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[styles.button, { backgroundColor: buttonBg, borderColor }, animatedStyle, style as any]}
    >
      <BlurView
        intensity={Platform.OS === 'ios' ? 20 : 50}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.glow, { borderColor: glowColor }]} />
      <View style={[styles.content, contentStyle]}>{children}</View>
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
  },
  glow: { ...StyleSheet.absoluteFillObject, borderWidth: 1, borderRadius: 14 },
  content: { paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
});
