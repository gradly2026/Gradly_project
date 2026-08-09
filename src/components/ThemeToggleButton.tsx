/**
 * Ícono del toggle de tema claro/oscuro — SVG en línea (no usa la librería
 * de íconos, para evitar la ambigüedad de glifos que causaba el bug del
 * "doble sol"). Es la MISMA implementación validada en el dashboard de
 * universidad, extraída aquí para reutilizarla en toda la plataforma:
 * login, registro, dashboard de empresa, dashboard de estudiante, etc.
 *
 * Uso típico (dentro de tu propio botón/Pressable con su onPress={toggleTheme}):
 *   <ThemeToggleIcon size={22} />
 */
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';

const SUN_COLOR = '#FFFFFF';
const MOON_COLOR = '#312E81';

export function SunIcon({ size = 22, color = SUN_COLOR }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="4" />
      <Path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </Svg>
  );
}

export function MoonIcon({ size = 22, color = MOON_COLOR }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </Svg>
  );
}

/**
 * Ícono listo para usar: lee `isDark` directo del ThemeContext compartido
 * (el mismo estado de tema de toda la app), así que siempre coincide con el
 * tema real de la página — sol blanco en oscuro, luna índigo en claro, y
 * solo uno de los dos a la vez.
 */
export function ThemeToggleIcon({ size = 22 }: { size?: number }) {
  const { isDark } = useTheme();
  return isDark ? <SunIcon size={size} /> : <MoonIcon size={size} />;
}
