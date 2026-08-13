// ════════════════════════════════════════════════════════════════════════
// TranslationContext.tsx
//
// QUÉ ES ESTE ARCHIVO:
// Este es el "motor" del sistema de idiomas (Español/Inglés) para el TEXTO
// FIJO de la interfaz (títulos de pantalla, botones, mensajes de error,
// etc. — cosas que un programador escribió a mano en el código).
//
// IMPORTANTE — hay DOS sistemas de traducción distintos en Gradly, y este
// archivo es solo uno de ellos:
//
//   1) TEXTO ESTÁTICO (este archivo + src/locales/es.json + en.json):
//      El programador escribe frases con una "clave" fija, por ejemplo:
//          t('bienvenida_titulo')
//      y este archivo busca esa clave en el diccionario del idioma activo
//      y devuelve el texto ya traducido. Es instantáneo (no llama a
//      internet) porque los dos idiomas ya están escritos de antemano en
//      los archivos .json. Ver GUIA_02_TRADUCTOR_I18N.md para más detalle.
//
//   2) TEXTO DINÁMICO (src/services/translationService.ts):
//      Es contenido que ESCRIBE el usuario (el nombre de una vacante, la
//      descripción de una empresa...) y que nadie pudo traducir de
//      antemano porque no se sabe qué va a escribir la gente. Para eso
//      existe una función en la nube (Cloud Function) que llama a Google
//      Translate. Este archivo (TranslationContext) IMPORTA esas
//      funciones (hydrateTranslationCache, setActiveLang) para
//      coordinarse con ese segundo sistema, pero la lógica pesada vive en
//      translationService.ts.
//
// Igual que ThemeContext.tsx, este archivo define un Context de React:
// un "altavoz" que cualquier pantalla puede escuchar con el hook
// useTranslation() para obtener la función t() y el idioma actual, sin
// tener que pasarse esos datos manualmente de componente en componente.
// ════════════════════════════════════════════════════════════════════════

import AsyncStorage from '@react-native-async-storage/async-storage';
// La misma cajita de almacenamiento persistente del celular/navegador que
// ya vimos en firebaseConfig.ts y ThemeContext.tsx. Aquí se usa para
// recordar qué idioma eligió el usuario la última vez.

import * as Localization from 'expo-localization';
// Localization: librería de Expo que permite preguntarle AL DISPOSITIVO
// (celular/navegador) en qué idioma está configurado el sistema operativo
// del usuario. Se usa para ADIVINAR el idioma inicial la primera vez que
// alguien abre la app (antes de que haya elegido nada manualmente).

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
// Piezas de React. Las que no vimos todavía en ThemeContext.tsx:
//   - useCallback(funcion, [deps]) → "memoriza" una función para que NO
//     se vuelva a crear en cada repintado de pantalla (evita renders
//     innecesarios en componentes que dependen de esa función).
//   - useMemo(funcion, [deps])     → parecido, pero memoriza un VALOR
//     calculado (no una función). Aquí se usa para no reconstruir el
//     objeto `value` completo del Context en cada render si nada cambió.

import en from '../locales/en.json';
import es from '../locales/es.json';
// Estos dos imports traen DIRECTAMENTE el contenido de los archivos
// src/locales/en.json y src/locales/es.json como si fueran objetos de
// JavaScript. Cada uno es un diccionario "clave": "frase traducida", por
// ejemplo:  { "bienvenida_titulo": "¡Bienvenido a Gradly!" }  (en es.json)
// y         { "bienvenida_titulo": "Welcome to Gradly!" }     (en en.json)

import { hydrateTranslationCache, setActiveLang } from '../services/translationService';
// Estas dos funciones vienen del OTRO sistema de traducción (el dinámico,
// explicado arriba), definido en src/services/translationService.ts:
//   - hydrateTranslationCache() → carga en memoria las traducciones de
//     contenido dinámico que ya se habían guardado en el celular antes.
//   - setActiveLang(idioma)     → le "avisa" a ese otro sistema cuál es
//     el idioma activo ahora mismo, porque ese sistema se usa a veces
//     FUERA de componentes de React (por ejemplo, dentro de un Alert),
//     donde no se puede usar el hook useTranslation() de este archivo.

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
// Un TIPO de TypeScript que solo permite el texto 'es' o el texto 'en'
// (nada más). Se usa en todo el archivo para que sea imposible, por
// error de programación, intentar poner un idioma que no existe.

const STORAGE_KEY = '@gradly/lang';
// La "clave" (nombre) bajo la cual se guarda el idioma elegido dentro de
// AsyncStorage, igual de concepto que THEME_KEY en ThemeContext.tsx.

const DICTS: Record<Language, Record<string, string>> = { es, en };
// DICTS es un objeto que agrupa los DOS diccionarios importados arriba,
// indexados por idioma:
//     DICTS.es  → todo el contenido de es.json
//     DICTS.en  → todo el contenido de en.json
// "Record<Language, Record<string, string>>" es un tipo de TypeScript que
// dice: "un objeto cuyas claves son 'es'|'en', y cada valor es a su vez
// otro objeto cuyas claves y valores son texto (string)".

const LOCALES: Record<Language, string> = { es: 'es-SV', en: 'en-US' };
// Convierte nuestro código de idioma corto ('es'/'en') al "locale" oficial
// BCP-47 que usan funciones como Intl.DateTimeFormat para formatear
// fechas y números de forma correcta según el país (aquí, El Salvador
// para español, Estados Unidos para inglés).

// Esta interfaz describe TODO lo que un componente puede pedirle al
// Context de traducción (lo que devuelve el hook useTranslation()):
interface TranslationContextValue {
  /** Traduce una clave del diccionario. Soporta interpolación: t('error_min_chars', { min: 8 }) */
  t: (key: string, params?: Record<string, string | number>) => string;
  // `t` es la función MÁS usada de todo el proyecto para texto de UI.
  // Recibe una "clave" (el nombre identificador de la frase, tal como
  // está escrito en es.json/en.json) y, opcionalmente, un objeto de
  // parámetros para RELLENAR partes variables del texto (por ejemplo,
  // t('error_min_chars', { min: 8 }) podría devolver
  // "Debe tener al menos 8 caracteres" si en el JSON la frase es
  // "Debe tener al menos {{min}} caracteres").
  language: Language;        // idioma activo ahora mismo: 'es' o 'en'
  /** Locale BCP-47 para formatear fechas/números: 'es-SV' | 'en-US' */
  locale: string;
  setLanguage: (lang: Language) => void;   // fija un idioma específico
  toggleLanguage: () => void;              // alterna entre es/en
  /** true cuando ya se cargó la preferencia guardada (evita parpadeo de idioma). */
  ready: boolean;
  // ── Legado: identidad. El contenido de BD se traduce vía Cloud Function + tDoc. ──
  translateText: (text: string) => Promise<string>;
  getTranslation: (text: string) => Promise<string>;
  // Estas dos últimas funciones existen solo por COMPATIBILIDAD: código
  // viejo del proyecto las llamaba esperando que tradujeran texto de la
  // base de datos, pero ese trabajo ahora lo hace translationService.ts +
  // tDoc(). Aquí simplemente devuelven el mismo texto que reciben, sin
  // cambiarlo ("identidad"), para que ese código viejo no se rompa.
}

function translate(
  language: Language,
  key: string,
  params?: Record<string, string | number>,
): string {
  // Esta es la función INTERNA que hace el trabajo real de traducir una
  // clave. No se exporta: solo la usa `t` más abajo, dentro de este mismo
  // archivo.
  const dict = DICTS[language] ?? DICTS.es;
  // Elige el diccionario del idioma pedido; si por algún motivo no
  // existiera (nunca debería pasar, ya que Language solo permite 'es'|'en'),
  // usa español como respaldo ("??" es el operador "nullish coalescing":
  // "usa el valor de la izquierda, salvo que sea null/undefined, en cuyo
  // caso usa el de la derecha").
  let str = dict[key] ?? DICTS.es[key] ?? key;
  // Busca la clave en el diccionario elegido. Si no existe ahí, intenta
  // con el diccionario español como respaldo. Si TAMPOCO existe en
  // español (la clave está mal escrita o nunca se agregó al JSON),
  // devuelve la propia `key` tal cual — así, en vez de romperse o
  // mostrar texto vacío, la pantalla muestra el nombre de la clave, lo
  // cual ayuda a detectar el error durante el desarrollo.
  if (params) {
    // Si se pasaron parámetros (por ejemplo { min: 8 }), hay que
    // reemplazar cada "placeholder" {{min}} dentro del texto por su
    // valor real.
    for (const [k, v] of Object.entries(params)) {
      // Object.entries({min: 8}) da [['min', 8]] — este bucle recorre
      // cada par [nombreParametro, valor].
      str = str.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), String(v));
      // new RegExp(`{{\\s*${k}\\s*}}`, 'g') construye una expresión
      // regular que busca literalmente "{{min}}" (permitiendo espacios
      // extra alrededor del nombre, gracias a \s*), en TODO el texto
      // (la 'g' al final = "global", no se detiene en la primera
      // coincidencia). String(v) convierte el valor (que podría ser un
      // número) a texto antes de insertarlo.
    }
  }
  return str;
}

const TranslationContext = createContext<TranslationContextValue>({
  // Valor por defecto del Context, solo usado si algún componente llamara
  // a useTranslation() sin estar envuelto en <TranslationProvider> (no
  // debería ocurrir, porque _layout.tsx siempre lo envuelve).
  t: (key) => key,               // sin provider, "traduce" devolviendo la misma clave
  language: 'es',
  locale: LOCALES.es,
  setLanguage: () => {},
  toggleLanguage: () => {},
  ready: false,
  translateText: async (text) => text,
  getTranslation: async (text) => text,
});

export const TranslationProvider: FC<{ children: ReactNode }> = ({ children }) => {
  // Componente que envuelve TODA la app (colocado en app/_layout.tsx,
  // normalmente dentro de <ThemeProvider>) y provee el valor del Context
  // de traducción a todos sus hijos.

  const [language, setLanguageState] = useState<Language>('es');
  // Estado con el idioma ACTUAL. Arranca en español por defecto mientras
  // se determina cuál debería ser el idioma real (ver el useEffect de
  // "Carga inicial" más abajo).

  const [ready, setReady] = useState(false);
  // Estado booleano que indica si YA terminamos de decidir el idioma
  // inicial correcto (leyendo AsyncStorage / el idioma del dispositivo).
  // Se usa para evitar que la pantalla "parpadee" mostrando texto en
  // español por una fracción de segundo antes de cambiar a inglés (si
  // ese fuera el idioma guardado).

  // Espeja el idioma activo para uso fuera de React (parche de Alert, etc.).
  useEffect(() => { setActiveLang(language); }, [language]);
  // Este efecto se ejecuta cada vez que `language` cambia (porque
  // `language` está en el array de dependencias [language]). Llama a
  // setActiveLang() de translationService.ts para que el OTRO sistema de
  // traducción (el dinámico) siempre sepa cuál es el idioma activo,
  // incluso cuando se lo necesita fuera de un componente de React.

  // Carga inicial: preferencia guardada → idioma del dispositivo → español.
  useEffect(() => {
    // Este efecto corre UNA sola vez al montar el Provider (array de
    // dependencias vacío: []).
    let active = true;
    // Bandera de seguridad: si el componente se "desmontara" antes de que
    // termine esta operación asíncrona, `active` se pone en false (ver el
    // "return" al final) para evitar actualizar el estado de un
    // componente que ya no existe (eso generaría una advertencia/errores
    // en React).
    void hydrateTranslationCache(); // caché de traducciones dinámicas
    // "void" indica explícitamente "ejecuta esta promesa pero no me
    // interesa esperar su resultado aquí ni manejar su error aquí" (ya se
    // maneja dentro de la propia función). Dispara, en paralelo, la carga
    // del caché de traducciones DINÁMICAS (el otro sistema).
    (async () => {
      // Función asíncrona autoejecutada (IIFE), igual patrón que vimos en
      // firebaseConfig.ts, para poder usar await dentro de un useEffect
      // (los efectos en sí no pueden ser "async" directamente).
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        // Busca si el usuario ya había elegido un idioma antes.
        if (saved === 'es' || saved === 'en') {
          // Si hay un valor guardado válido, se usa ese.
          if (active) setLanguageState(saved);
        } else {
          // Si NUNCA se guardó nada (primera vez que abre la app),
          // intenta adivinar el idioma según la configuración del
          // dispositivo:
          const device = Localization.getLocales?.()[0]?.languageCode;
          // "Localization.getLocales?.()" usa "optional chaining" (el
          // "?."): si getLocales no existiera como función, en vez de
          // romper el programa, toda la expresión da "undefined".
          // getLocales() devuelve una LISTA de idiomas configurados en el
          // dispositivo, en orden de preferencia; "[0]" toma el primero
          // (el principal), y ".languageCode" extrae solo el código de
          // idioma (por ejemplo "en" de "en-US").
          if (active) setLanguageState(device === 'en' ? 'en' : 'es');
          // Si el idioma del dispositivo es inglés, arranca en inglés;
          // para cualquier otro caso (incluido español u otros idiomas
          // no soportados), arranca en español.
        }
      } catch {
        // Si AsyncStorage falla, nos quedamos en español por defecto.
      } finally {
        // El bloque "finally" se ejecuta SIEMPRE, haya habido error o no.
        if (active) setReady(true);
        // Marca que ya terminamos de decidir el idioma (para que la UI
        // ya pueda mostrarse con confianza).
      }
    })();
    return () => {
      // Función de "limpieza" del efecto: React la llama automáticamente
      // si el componente se desmonta antes de que termine el proceso de
      // arriba.
      active = false;
    };
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    // Función pública para FIJAR un idioma específico (ej. un botón
    // "English" en el menú de configuración).
    setLanguageState(lang);                              // actualiza el estado (repinta la app)
    AsyncStorage.setItem(STORAGE_KEY, lang).catch(() => {});
    // y guarda la elección para la próxima vez que se abra la app.
  }, []);
  // useCallback con [] como dependencias: esta función se crea UNA sola
  // vez y se reutiliza siempre la misma referencia entre renders (útil
  // para no provocar renders extra en componentes hijos que la reciban
  // como prop).

  const toggleLanguage = useCallback(() => {
    // Función pública para ALTERNAR entre español e inglés (el botón de
    // idioma que aparece en varias pantallas, tipo "ES ⇄ EN").
    setLanguageState((prev) => {
      const next: Language = prev === 'es' ? 'en' : 'es';
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<TranslationContextValue>(
    () => ({
      // Este es el objeto completo que reciben todos los componentes que
      // llamen a useTranslation(). Se recalcula solo cuando cambian sus
      // dependencias (ver el array [language, ready, setLanguage,
      // toggleLanguage] más abajo), gracias a useMemo — así se evita
      // reconstruir (y provocar renders extra) en cada repintado.
      t: (key, params) => translate(language, key, params),
      // Aquí es donde la función `t` que usa TODA la app queda "atada" al
      // idioma actual: cada vez que se llama t('clave'), internamente
      // llama a translate(language, 'clave') con el `language` de este
      // momento.
      language,
      locale: LOCALES[language],
      setLanguage,
      toggleLanguage,
      ready,
      translateText: async (text: string) => text,   // legado: identidad, ver comentario arriba
      getTranslation: async (text: string) => text,  // legado: identidad, ver comentario arriba
    }),
    [language, ready, setLanguage, toggleLanguage],
  );

  return (
    <TranslationContext.Provider value={value}>
      {children}
      {/* Toda la app (todo lo que esté anidado dentro de
          <TranslationProvider>...</TranslationProvider> en _layout.tsx)
          se renderiza aquí, y todos esos componentes ya pueden usar
          useTranslation() para acceder a `value`. */}
    </TranslationContext.Provider>
  );
};

/** Hook principal — t('clave'), language, setLanguage, toggleLanguage, locale. */
export const useTranslation = () => useContext(TranslationContext);
// El hook que usa CASI CADA pantalla del proyecto. Ejemplo típico:
//     const { t, language, toggleLanguage } = useTranslation();
//     <Text>{t('bienvenida_titulo')}</Text>

/** Alias de compatibilidad con código anterior. */
export const useTranslationContext = () => useContext(TranslationContext);
// Mismo hook, nombre alternativo para no romper archivos antiguos que ya
// lo llamaban así.

export default TranslationContext;
