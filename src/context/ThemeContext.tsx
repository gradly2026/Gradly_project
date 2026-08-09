import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type FC,
  type ReactNode,
} from 'react';
import { Platform, StyleSheet } from 'react-native';
import { shadow } from '../utils/shadow';

// ═══════════════════════════════════════════
// PALETA DE COLORES OFICIAL DE GRADLY
// ═══════════════════════════════════════════
// Modo OSCURO (paleta original — morado profundo)
export const DARK = {
  // Morados principales
  primary:          '#7C3AED',
  primaryLight:     '#A78BFA',
  primaryDark:      '#5B21B6',

  // Fondos (modo oscuro)
  backgroundDark:   '#0F0A1E',
  backgroundCard:   '#1A1030',
  backgroundSurface:'#241642',

  // Acento y semánticos
  accent:           '#C4B5FD',
  success:          '#10B981',
  warning:          '#F59E0B',
  error:            '#EF4444',

  // Textos
  textPrimary:      '#F5F3FF',
  textSecondary:    '#A78BFA',
  textMuted:        '#6B7280',

  // Bordes y dorado premium
  border:           '#2D1F4E',
  gold:             '#D97706',

  // Overlay transparencias frecuentes
  primary20:        'rgba(124,58,237,0.20)',
  primary35:        'rgba(124,58,237,0.35)',
  primary12:        'rgba(124,58,237,0.12)',
  white4:           'rgba(255,255,255,0.04)',
  white8:           'rgba(255,255,255,0.08)',
  white60:          'rgba(255,255,255,0.60)',

  // Sombra del botón primario
  btnShadow:        'rgba(124,58,237,0.55)',
} as const;

// Modo CLARO (blanco + pasteles elegantes, sin negro puro)
export const LIGHT: GradlyColors = {
  // Morados principales (un poco más profundos para contrastar sobre blanco)
  primary:          '#7C3AED',
  primaryLight:     '#7C3AED',
  primaryDark:      '#6D28D9',

  // Fondos claros — lavanda muy suave / blanco
  backgroundDark:   '#F6F4FD',
  backgroundCard:   '#FFFFFF',
  backgroundSurface:'#EFEAFB',

  // Acento y semánticos
  accent:           '#7C3AED',
  success:          '#059669',
  warning:          '#D97706',
  error:            '#DC2626',

  // Textos (tinta morada profunda en vez de negro puro)
  textPrimary:      '#241B3D',
  textSecondary:    '#6D28D9',
  textMuted:        '#8A82A6',

  // Bordes y dorado premium
  border:           '#E7E1F7',
  gold:             '#B45309',

  // Overlay transparencias frecuentes (tinte morado en vez de blanco)
  primary20:        'rgba(124,58,237,0.16)',
  primary35:        'rgba(124,58,237,0.28)',
  primary12:        'rgba(124,58,237,0.08)',
  white4:           'rgba(124,58,237,0.05)',
  white8:           'rgba(124,58,237,0.08)',
  white60:          'rgba(36,27,61,0.55)',

  // Sombra del botón primario
  btnShadow:        'rgba(124,58,237,0.30)',
};

export type GradlyColors = { readonly [K in keyof typeof DARK]: string };

/**
 * Export estático de compatibilidad. Apunta SIEMPRE a la paleta oscura.
 * Las pantallas migradas al tema dinámico deben usar `useTheme().colors`.
 */
export const COLORS = DARK;

// ═══════════════════════════════════════════
// TIPOGRAFÍA — nombres de fuentes cargadas en _layout.tsx
// ═══════════════════════════════════════════
export const FONTS = {
  // Sora — títulos
  soraBold:       'Sora_700Bold',
  soraSemiBold:   'Sora_600SemiBold',
  soraRegular:    'Sora_400Regular',
  soraExtraBold:  'Sora_800ExtraBold',

  // Inter — cuerpo
  interBold:      'Inter_700Bold',
  interSemiBold:  'Inter_600SemiBold',
  interMedium:    'Inter_500Medium',
  interRegular:   'Inter_400Regular',

  // Rajdhani — números / stats
  rajdhaniBold:   'Rajdhani_700Bold',
  rajdhaniSemiBold:'Rajdhani_600SemiBold',
  rajdhaniMedium: 'Rajdhani_500Medium',
  rajdhaniRegular:'Rajdhani_400Regular',
} as const;

// ═══════════════════════════════════════════
// ESTILOS BASE REUTILIZABLES
// ═══════════════════════════════════════════
export const BASE = StyleSheet.create({
  card: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardSurface: {
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnPrimary: {
    height: 50,
    backgroundColor: COLORS.primaryDark,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow({ color: COLORS.btnShadow, y: 4, blur: 12, opacity: 1, elevation: 8 }),
  },
  btnPrimaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    letterSpacing: 0.3,
  },
  btnOutline: {
    height: 48,
    backgroundColor: COLORS.white4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.primary35,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutlineText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  input: {
    flex: 1,
    height: 52,
    backgroundColor: COLORS.white4,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 52,
    marginBottom: 14,
    paddingHorizontal: 14,
  },
  inputWrapError: {
    borderColor: COLORS.error,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.primaryLight,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  errorText: {
    fontSize: 12,
    color: COLORS.error,
    marginTop: -8,
    marginBottom: 10,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 20,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: COLORS.primary20,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primaryLight,
  },
});

// ═══════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════
interface ThemeContextValue {
  colors: GradlyColors;
  fonts: typeof FONTS;
  base: typeof BASE;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (mode: 'dark' | 'light') => void;
}

const THEME_KEY = '@gradly_theme';

const ThemeContext = createContext<ThemeContextValue>({
  colors: DARK,
  fonts: FONTS,
  base: BASE,
  isDark: true,
  toggleTheme: () => {},
  setTheme: () => {},
});

/**
 * Estado inicial del tema. En web, `AsyncStorage` es un envoltorio síncrono
 * sobre `window.localStorage` (misma clave, sin prefijo) — leerlo aquí de
 * forma síncrona evita el parpadeo "arranca oscuro y luego cambia a claro"
 * que dejaba una ventana breve donde el ícono/tema no coincidían con la
 * preferencia real ya guardada. En nativo no hay lectura síncrona posible,
 * así que se resuelve con el efecto de abajo.
 */
function getInitialIsDark(): boolean {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    try {
      return window.localStorage.getItem(THEME_KEY) !== 'light';
    } catch {
      // localStorage inaccesible (modo privado estricto, etc.) → default oscuro.
    }
  }
  return true;
}

export const ThemeProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [isDark, setIsDark] = useState(getInitialIsDark);

  // Carga la preferencia persistida al iniciar (solo nativo: en web ya se
  // resolvió de forma síncrona arriba, sin esperar a este efecto).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    AsyncStorage.getItem(THEME_KEY)
      .then(v => { if (v === 'light') setIsDark(false); })
      .catch(() => {});
  }, []);

  const setTheme = (mode: 'dark' | 'light') => {
    setIsDark(mode === 'dark');
    AsyncStorage.setItem(THEME_KEY, mode).catch(() => {});
  };

  const toggleTheme = () => {
    setIsDark(prev => {
      const next = !prev;
      AsyncStorage.setItem(THEME_KEY, next ? 'dark' : 'light').catch(() => {});
      return next;
    });
  };

  return (
    <ThemeContext.Provider
      value={{
        colors: isDark ? DARK : LIGHT,
        fonts: FONTS,
        base: BASE,
        isDark,
        toggleTheme,
        setTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

/** Hook principal — devuelve colores, fuentes y estilos base */
export const useTheme = () => useContext(ThemeContext);

/** Alias de compatibilidad con código anterior */
export const useThemeContext = () => useContext(ThemeContext);

export default ThemeContext;
