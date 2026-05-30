import { useThemeContext } from "../src/context/ThemeContext";

/**
 * Hook de acceso al tema de la app.
 * Wrapper del ThemeContext — úsalo en cualquier componente.
 *
 * isDark   → boolean
 * toggleTheme → () => void
 * theme    → 'dark' | 'light'
 */
export function useAppTheme() {
  const { isDark, toggleTheme } = useThemeContext();
  return {
    isDark,
    toggleTheme,
    theme: isDark ? ("dark" as const) : ("light" as const),
  };
}

export default useAppTheme;
