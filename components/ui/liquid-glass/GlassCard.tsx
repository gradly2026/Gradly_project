import React from 'react';
import { StyleProp, StyleSheet, View, ViewProps, ViewStyle, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../../src/context/ThemeContext';

interface GlassCardProps extends ViewProps {
  children: React.ReactNode;
  /** Override del padding/alineación interna para mapear estilos previos sin romper el layout. */
  contentStyle?: StyleProp<ViewStyle>;
}

export const GlassCard: React.FC<GlassCardProps> = ({ children, style, contentStyle, ...props }) => {
  // Theme-aware: en claro el cristal usa tinte claro y fondo blanquecino para no
  // verse como un bloque oscuro sobre el fondo lavanda. Estructura intacta.
  const { isDark } = useTheme();

  const cardBg = isDark
    ? Platform.OS === 'android'
      ? 'rgba(25, 10, 45, 0.75)'
      : 'rgba(20, 10, 35, 0.35)'
    : Platform.OS === 'android'
    ? 'rgba(255, 255, 255, 0.80)'
    : 'rgba(255, 255, 255, 0.45)';
  const borderColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(124, 58, 237, 0.12)';
  const highlightColor = isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.35)';

  return (
    <View {...props} style={[styles.card, { backgroundColor: cardBg, borderColor }, style]}>
      <BlurView
        intensity={Platform.OS === 'ios' ? 25 : 65}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.highlight, { backgroundColor: highlightColor }]} />
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
  },
  highlight: { position: 'absolute', top: 0, left: 0, right: 0, height: '30%' },
  content: { padding: 16 },
});
