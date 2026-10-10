import React from 'react';
import { StyleProp, StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import { useTheme } from '../../../src/context/ThemeContext';

interface GlassCardProps extends ViewProps {
  children: React.ReactNode;
  /** Override del padding/alineación interna para mapear estilos previos sin romper el layout. */
  contentStyle?: StyleProp<ViewStyle>;
}

// El nombre se queda (64 usos en 19 archivos) pero el diseño nuevo es plano:
// fondo sólido de tarjeta + borde fino, sin desenfoque ni brillo superior.
// Los colores salen de los tokens del tema, así que siguen al modo claro/oscuro.
export const GlassCard: React.FC<GlassCardProps> = ({ children, style, contentStyle, ...props }) => {
  const { colors } = useTheme();

  return (
    <View
      {...props}
      style={[styles.card, { backgroundColor: colors.backgroundCard, borderColor: colors.border }, style]}
    >
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
  },
  content: { padding: 16 },
});
