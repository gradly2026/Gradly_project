import React from 'react';
import { StyleProp, StyleSheet, Pressable, PressableProps, View, ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useTheme } from '../../../src/context/ThemeContext';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface JellyButtonProps extends PressableProps {
  children: React.ReactNode;
  /** Override del padding/alineación interna para mapear estilos previos sin romper el layout. */
  contentStyle?: StyleProp<ViewStyle>;
}

export const JellyButton: React.FC<JellyButtonProps> = ({ children, style, contentStyle, ...props }) => {
  // Diseño plano: sin desenfoque ni aro de brillo, así un botón con su propio
  // `backgroundColor` muestra su color real. Lo que se conserva es la física de
  // gelatina (spring scaleX/scaleY) y el override de estilo de cada pantalla.
  // El relleno/borde por defecto (botón secundario) sale de los tokens del tema.
  const { colors } = useTheme();
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

  return (
    <AnimatedPressable
      {...props}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[
        styles.button,
        { backgroundColor: colors.primary12, borderColor: colors.primary35 },
        animatedStyle,
        style as any,
      ]}
    >
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
  content: { paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
});
