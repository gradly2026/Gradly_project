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
  const { language, translateText, getTranslation } = useTranslationContext();

  // La app es español fijo. Mantenemos estas funciones como no-op para
  // conservar la API de los componentes que aún las invocan.
  const changeLanguage = (_lang?: string) => {};
  const toggleLanguage = () => {};

  return {
    language,
    toggleLanguage,
    changeLanguage,
    t: translateText,
    getTranslation,
  };
}

export default useAppLanguage;
