import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FC,
  type ReactNode,
} from 'react';

import en from '../locales/en.json';
import es from '../locales/es.json';
import { hydrateTranslationCache, setActiveLang } from '../services/translationService';

// ═══════════════════════════════════════════════════════════════
//  i18n GRADLY — Español (principal) · Inglés
//  ───────────────────────────────────────────────────────────────
//  • Texto ESTÁTICO de la interfaz → diccionarios JSON en src/locales.
//    Se usa con  t('clave', { param })  y soporta interpolación {{param}}.
//  • Texto DINÁMICO de la base de datos → se traduce al escribir con la
//    Cloud Function (functions/) y se lee con el helper tDoc() (src/utils).
//    Aquí translateText/getTranslation se conservan como identidad para no
//    romper a quien aún los invoque (devuelven el texto tal cual).
//  • El idioma se persiste en AsyncStorage y, en el primer arranque, se
//    detecta del dispositivo (expo-localization).
// ═══════════════════════════════════════════════════════════════

export type Language = 'es' | 'en';

const STORAGE_KEY = '@gradly/lang';

const DICTS: Record<Language, Record<string, string>> = { es, en };

const LOCALES: Record<Language, string> = { es: 'es-SV', en: 'en-US' };

interface TranslationContextValue {
  /** Traduce una clave del diccionario. Soporta interpolación: t('error_min_chars', { min: 8 }) */
  t: (key: string, params?: Record<string, string | number>) => string;
  language: Language;
  /** Locale BCP-47 para formatear fechas/números: 'es-SV' | 'en-US' */
  locale: string;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  /** true cuando ya se cargó la preferencia guardada (evita parpadeo de idioma). */
  ready: boolean;
  // ── Legado: identidad. El contenido de BD se traduce vía Cloud Function + tDoc. ──
  translateText: (text: string) => Promise<string>;
  getTranslation: (text: string) => Promise<string>;
}

function translate(
  language: Language,
  key: string,
  params?: Record<string, string | number>,
): string {
  const dict = DICTS[language] ?? DICTS.es;
  let str = dict[key] ?? DICTS.es[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), String(v));
    }
  }
  return str;
}

const TranslationContext = createContext<TranslationContextValue>({
  t: (key) => key,
  language: 'es',
  locale: LOCALES.es,
  setLanguage: () => {},
  toggleLanguage: () => {},
  ready: false,
  translateText: async (text) => text,
  getTranslation: async (text) => text,
});

export const TranslationProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('es');
  const [ready, setReady] = useState(false);

  // Espeja el idioma activo para uso fuera de React (parche de Alert, etc.).
  useEffect(() => { setActiveLang(language); }, [language]);

  // Carga inicial: preferencia guardada → idioma del dispositivo → español.
  useEffect(() => {
    let active = true;
    void hydrateTranslationCache(); // caché de traducciones dinámicas
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved === 'es' || saved === 'en') {
          if (active) setLanguageState(saved);
        } else {
          const device = Localization.getLocales?.()[0]?.languageCode;
          if (active) setLanguageState(device === 'en' ? 'en' : 'es');
        }
      } catch {
        // Si AsyncStorage falla, nos quedamos en español por defecto.
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    AsyncStorage.setItem(STORAGE_KEY, lang).catch(() => {});
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguageState((prev) => {
      const next: Language = prev === 'es' ? 'en' : 'es';
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<TranslationContextValue>(
    () => ({
      t: (key, params) => translate(language, key, params),
      language,
      locale: LOCALES[language],
      setLanguage,
      toggleLanguage,
      ready,
      translateText: async (text: string) => text,
      getTranslation: async (text: string) => text,
    }),
    [language, ready, setLanguage, toggleLanguage],
  );

  return (
    <TranslationContext.Provider value={value}>
      {children}
    </TranslationContext.Provider>
  );
};

/** Hook principal — t('clave'), language, setLanguage, toggleLanguage, locale. */
export const useTranslation = () => useContext(TranslationContext);

/** Alias de compatibilidad con código anterior. */
export const useTranslationContext = () => useContext(TranslationContext);

export default TranslationContext;
