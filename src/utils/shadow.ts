import { Platform, type ViewStyle } from 'react-native';

/**
 * Sombra multiplataforma.
 *
 * En WEB las props `shadow*` están deprecadas (react-native-web) → usamos
 * `boxShadow` (CSS). En Android usamos `elevation`. En iOS mantenemos las
 * props nativas `shadow*` (que NO están deprecadas en nativo).
 *
 * Devuelve un objeto de estilo que se puede esparcir dentro de
 * `StyleSheet.create({...})` o pasar como override inline.
 */
export interface ShadowOpts {
  color: string;
  /** desplazamiento horizontal (px) */
  x?: number;
  /** desplazamiento vertical (px) */
  y?: number;
  /** radio de difuminado (px) */
  blur?: number;
  /** opacidad 0–1 (se aplica al color en web/iOS) */
  opacity?: number;
  /** elevación Android */
  elevation?: number;
}

function toRgba(color: string, opacity: number): string {
  // Si ya viene como rgb()/rgba(), respetamos su alpha y devolvemos tal cual.
  if (color.startsWith('rgb')) return color;
  const h = color.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${opacity})`;
}

export function shadow({
  color,
  x = 0,
  y = 4,
  blur = 12,
  opacity = 1,
  elevation = 6,
}: ShadowOpts): ViewStyle {
  if (Platform.OS === 'web') {
    return { boxShadow: `${x}px ${y}px ${blur}px ${toRgba(color, opacity)}` } as ViewStyle;
  }
  if (Platform.OS === 'android') {
    return { elevation } as ViewStyle;
  }
  // iOS (las props shadow* sólo están deprecadas en web)
  return {
    shadowColor: color,
    shadowOffset: { width: x, height: y },
    shadowOpacity: opacity,
    shadowRadius: blur,
  } as ViewStyle;
}
