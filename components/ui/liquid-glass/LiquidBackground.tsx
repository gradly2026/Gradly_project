import React from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Canvas, LinearGradient, vec, Circle, Blur } from '@shopify/react-native-skia';
import { useSharedValue, useFrameCallback } from 'react-native-reanimated';
import { useTheme } from '../../../src/context/ThemeContext';

interface LiquidBackgroundProps {
  children: React.ReactNode;
}

const PARTICLE_COUNT = 12;

// Paletas del fondo derivadas del tema activo. El gradiente y el tinte de las
// partículas cambian con claro/oscuro para no romper el tema dinámico de Gradly.
const DARK_GRADIENT = ['#1E0A3C', '#0A0214', '#030006'];
const LIGHT_GRADIENT = ['#FFFFFF', '#F6F4FD', '#EFEAFB'];
const DARK_PARTICLE = 'rgba(180, 100, 255, 0.35)';
const LIGHT_PARTICLE = 'rgba(124, 58, 237, 0.18)';

// ─────────────────────────────────────────────────────────────
// WEB: Skia/CanvasKit (WebAssembly) NO está configurado en este
// proyecto, por lo que <Canvas>/<LinearGradient>/useFrameCallback
// crashean con "CanvasKit is not defined". En web renderizamos un
// fondo CSS equivalente (gradiente lineal + color sólido de respaldo)
// sin tocar Skia ni los hooks de la simulación de partículas.
// ─────────────────────────────────────────────────────────────
const LiquidBackgroundWeb: React.FC<LiquidBackgroundProps> = ({ children }) => {
  const { isDark, colors } = useTheme();

  const stops = isDark ? DARK_GRADIENT : LIGHT_GRADIENT;
  const webGradient: any = {
    flex: 1,
    // Color sólido de respaldo si el navegador/RNW ignora backgroundImage.
    backgroundColor: isDark ? '#0A0214' : colors.backgroundDark,
    // Gradiente simulado con CSS (react-native-web lo aplica al <div>).
    backgroundImage: `linear-gradient(135deg, ${stops[0]} 0%, ${stops[1]} 50%, ${stops[2]} 100%)`,
  };

  return <View style={webGradient}>{children}</View>;
};

// ─────────────────────────────────────────────────────────────
// NATIVO (iOS / Android): canvas Skia + simulación de partículas.
// ─────────────────────────────────────────────────────────────
const LiquidBackgroundNative: React.FC<LiquidBackgroundProps> = ({ children }) => {
  const { width, height } = useWindowDimensions();
  const { isDark, colors } = useTheme();

  const gradient = isDark ? DARK_GRADIENT : LIGHT_GRADIENT;
  const particleColor = isDark ? DARK_PARTICLE : LIGHT_PARTICLE;

  // NOTE: velocities are kept as shared values so the bounce reversal persists
  // across frames on the UI thread (plain JS fields mutated inside a worklet
  // do not survive between frames). Hook count is constant (PARTICLE_COUNT),
  // so calling hooks in this fixed-length map is safe w.r.t. the rules of hooks.
  const particles = Array.from({ length: PARTICLE_COUNT }).map(() => ({
    x: useSharedValue(Math.random() * width),
    y: useSharedValue(Math.random() * height),
    speedX: useSharedValue((Math.random() - 0.5) * 0.4),
    speedY: useSharedValue((Math.random() - 0.5) * 0.4),
    radius: Math.random() * 4 + 2,
  }));

  useFrameCallback((frameInfo) => {
    'worklet';
    if (!frameInfo.timeSincePreviousFrame) return;
    for (let p of particles) {
      let nextX = p.x.value + p.speedX.value;
      let nextY = p.y.value + p.speedY.value;
      if (nextX < 0 || nextX > width) p.speedX.value *= -1;
      if (nextY < 0 || nextY > height) p.speedY.value *= -1;
      p.x.value = nextX;
      p.y.value = nextY;
    }
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.backgroundDark }]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(width, height)}
          colors={gradient}
        />
        {particles.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={p.radius} color={particleColor}>
            <Blur blur={1} />
          </Circle>
        ))}
      </Canvas>
      {children}
    </View>
  );
};

// Selector por plataforma. El wrapper NO llama hooks condicionalmente: solo
// decide qué subcomponente montar; cada subcomponente llama sus hooks de forma
// incondicional, evitando cualquier violación de las reglas de hooks.
export const LiquidBackground: React.FC<LiquidBackgroundProps> = (props) =>
  Platform.OS === 'web'
    ? <LiquidBackgroundWeb {...props} />
    : <LiquidBackgroundNative {...props} />;

const styles = StyleSheet.create({
  container: { flex: 1 },
});
