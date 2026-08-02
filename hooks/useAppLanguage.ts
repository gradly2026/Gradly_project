import { useTranslationContext } from "../src/context/TranslationContext";

/**
 * Hook de acceso al idioma de la app. Wrapper del TranslationContext.
 *
 * language       → 'es' | 'en'
 * t(key, params) → string  (traducción del diccionario, síncrona)
 * setLanguage    → (lang) => void
 * toggleLanguage → alterna 'es' ⇄ 'en'
 * changeLanguage → alias de setLanguage
 * locale         → 'es-SV' | 'en-US'  (para formatear fechas/números)
 */
export function useAppLanguage() {
  const { language, locale, t, setLanguage, toggleLanguage, getTranslation } =
    useTranslationContext();

  return {
    language,
    locale,
    t,
    setLanguage,
    changeLanguage: setLanguage,
    toggleLanguage,
    getTranslation,
  };
}

export default useAppLanguage;
