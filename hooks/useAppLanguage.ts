import { useTranslationContext } from "../src/context/TranslationContext";

/**
 * Hook de acceso al idioma de la app.
 * Wrapper del TranslationContext — úsalo en cualquier componente.
 *
 * language       → 'es' | 'en' | 'pt' | 'zh'
 * toggleLanguage → alterna entre 'es' y 'en'
 * changeLanguage → (lang) => void  (control completo)
 * t              → (text: string) => Promise<string>  (traducción asíncrona)
 */
export function useAppLanguage() {
  const { language, changeLanguage, translateText, getTranslation } =
    useTranslationContext();

  const toggleLanguage = () => {
    changeLanguage(language === "es" ? "en" : "es");
  };

  return {
    language,
    toggleLanguage,
    changeLanguage,
    t: translateText,
    getTranslation,
  };
}

export default useAppLanguage;
