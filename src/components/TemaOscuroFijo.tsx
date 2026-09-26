/**
 * TemaOscuroFijo.tsx — fuerza el tema OSCURO para todo lo que se dibuje dentro.
 *
 * /bienvenida (la landing pública) solo se ve bien en oscuro: sus fotos y degradados
 * están pensados para ese fondo. La pantalla ya fija sus PROPIOS colores en oscuro,
 * pero los componentes que usa por dentro (GlassCard, LiquidBackground…) leen el tema
 * real con useTheme(): en modo claro se pintaban con blanco translúcido y un fondo gris
 * claro, y la página se veía rota. Este envoltorio les da la paleta oscura.
 *
 * Es local: solo cambia lo que hay debajo. NO toca el tema guardado del usuario:
 * `toggleTheme` y `setTheme` son no-ops aquí adentro, así que nada de esta pantalla
 * puede reescribir la preferencia (al ir al login o a un panel, el usuario sigue en
 * el modo que había elegido).
 */
import { useMemo, type ReactNode } from 'react';
import ThemeContext, { BASE, DARK, FONTS } from '../context/ThemeContext';

const noop = () => {};

export default function TemaOscuroFijo({ children }: { children: ReactNode }) {
  const valor = useMemo(
    () => ({ colors: DARK, fonts: FONTS, base: BASE, isDark: true, toggleTheme: noop, setTheme: noop }),
    [],
  );
  return <ThemeContext.Provider value={valor}>{children}</ThemeContext.Provider>;
}
