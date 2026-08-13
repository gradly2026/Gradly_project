// ════════════════════════════════════════════════════════════════════════
// ThemeContext.tsx
//
// QUÉ ES ESTE ARCHIVO:
// Aquí vive TODO el sistema de "tema claro / tema oscuro" de Gradly: los
// colores de cada modo, las fuentes, algunos estilos reutilizables, y el
// "Context" de React que permite que CUALQUIER pantalla de la app sepa
// "¿estamos en modo oscuro o claro ahora mismo?" y "¿qué color uso para
// el fondo / el texto / los botones?".
//
// Para entender este archivo primero hay que entender qué es un "Context"
// de React (ver también GUIA_06_GLOSARIO_REACT_NATIVE.md):
//
//   Un Context es como un "altavoz" que un componente ARRIBA en el árbol
//   de la app (aquí, <ThemeProvider>) usa para "anunciar" un valor (los
//   colores actuales, si es oscuro o claro, etc.) que CUALQUIER
//   componente hijo, sin importar qué tan profundo esté anidado, puede
//   "escuchar" con el hook useTheme() SIN necesidad de pasarse el dato
//   manualmente de componente en componente (eso se llama "prop drilling"
//   y el Context existe justamente para evitarlo).
//
// Flujo completo, resumido:
//   1. app/_layout.tsx envuelve TODA la app dentro de <ThemeProvider>.
//   2. ThemeProvider (definido en este archivo) guarda en un estado
//      (isDark: true/false) si el tema actual es oscuro o claro, y lo
//      recuerda entre sesiones usando AsyncStorage (la cajita de
//      almacenamiento del celular/navegador).
//   3. Cualquier pantalla o componente llama a: const { colors } = useTheme();
//      y usa colors.primary, colors.textPrimary, etc. en sus estilos.
//   4. Cuando el usuario cambia el tema (por ejemplo desde un switch en
//      Configuración), se llama a toggleTheme() o setTheme('light'), el
//      estado isDark cambia, y como TODOS los componentes están
//      "escuchando" el Context, todos se repintan automáticamente con los
//      nuevos colores — sin recargar la app.
// ════════════════════════════════════════════════════════════════════════

import AsyncStorage from '@react-native-async-storage/async-storage';
// AsyncStorage: la misma cajita de almacenamiento del celular que ya vimos
// en firebaseConfig.ts. Aquí se usa para GUARDAR qué tema eligió el
// usuario (oscuro o claro) para que, al volver a abrir la app, se respete
// su elección en vez de volver siempre al valor por defecto.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type FC,
  type ReactNode,
} from 'react';
// Estas son funciones/tipos que trae React (la librería base de todo el
// proyecto):
//   - createContext(valorPorDefecto) → crea un "Context" nuevo (el altavoz
//     mencionado arriba).
//   - useContext(MiContext)          → hook que un componente usa para
//     "escuchar" el valor actual de un Context.
//   - useEffect(funcion, [deps])     → hook para ejecutar código cuando el
//     componente aparece en pantalla (o cuando cambian ciertos valores).
//     Aquí se usa para leer el tema guardado al arrancar la app.
//   - useState(valorInicial)         → hook para que un componente tenga
//     una "variable con memoria" que, al cambiar, hace que la pantalla se
//     vuelva a dibujar con el nuevo valor.
//   - type FC / type ReactNode        → tipos de TypeScript. "FC" = Function
//     Component (la forma que tiene un componente de React). "ReactNode"
//     = "cualquier cosa que React puede dibujar" (texto, otro componente,
//     una lista de componentes, etc.). Se usan solo para que TypeScript
//     valide que estamos usando bien estas piezas.

import { Platform, StyleSheet } from 'react-native';
// Platform: ya lo vimos en firebaseConfig.ts → dice si estamos en "web",
// "ios" o "android".
// StyleSheet: la utilidad de React Native para crear "hojas de estilos"
// (equivalente al CSS de una página web, pero como objeto de JavaScript).
// StyleSheet.create({...}) valida los estilos y los optimiza un poco.

import { shadow } from '../utils/shadow';
// shadow: una función propia del proyecto (definida en
// src/utils/shadow.ts) que genera las propiedades de "sombra" (efecto de
// elevación/profundidad) de forma distinta según la plataforma, porque
// iOS/Android/Web usan propiedades de sombra diferentes. Se usa más abajo
// en el estilo del botón primario (btnPrimary).

// ═══════════════════════════════════════════
// PALETA DE COLORES OFICIAL DE GRADLY
// ═══════════════════════════════════════════
//
// Nota para quien no conozca el formato de colores: cada valor como
// '#7C3AED' es un color en formato HEXADECIMAL (empieza con # seguido de
// 6 caracteres: 2 para rojo, 2 para verde, 2 para azul). Y valores como
// 'rgba(124,58,237,0.20)' son el MISMO tipo de color pero escrito como
// rojo,verde,azul + una cuarta opacidad (0 = invisible, 1 = totalmente
// visible) — se usan para efectos semi-transparentes (por ejemplo, un
// fondo violeta muy tenue). No hace falta memorizar los números: cada
// grupo ya está comentado con su propósito (fondo, texto, borde, etc.).

// Modo OSCURO (paleta original — morado profundo)
export const DARK = {
  // "export const DARK = { ... }" crea un OBJETO con muchas propiedades
  // de tipo texto (string), y lo EXPORTA para que otros archivos puedan
  // importar `DARK` directamente si alguna vez necesitan el tema oscuro
  // "a la fuerza" sin pasar por el Context (poco común, pero existe).
  // Todas las claves de este objeto (primary, backgroundDark, etc.) son
  // los NOMBRES de color que usa toda la app; el valor de cada una es el
  // color hexadecimal/rgba que le corresponde EN MODO OSCURO.

  // Morados principales
  primary:          '#7C3AED', // color de marca principal (botones, iconos activos, links)
  primaryLight:     '#A78BFA', // variante más clara de `primary` (hover, detalles suaves)
  primaryDark:      '#5B21B6', // variante más oscura de `primary` (fondo de botones sólidos)

  // Fondos (modo oscuro)
  backgroundDark:   '#0F0A1E', // fondo general de toda la pantalla
  backgroundCard:   '#1A1030', // fondo de "tarjetas" (Card) sobre el fondo general
  backgroundSurface:'#241642', // fondo de superficies elevadas (un tono más sobre la tarjeta)

  // Acento y semánticos
  accent:           '#C4B5FD', // color de acento decorativo
  success:          '#10B981', // verde: usado para mensajes de éxito / estados positivos
  warning:          '#F59E0B', // ámbar: usado para advertencias
  error:            '#EF4444', // rojo: usado para errores / acciones destructivas

  // Textos
  textPrimary:      '#F5F3FF', // color de texto principal (el más legible/contrastado)
  textSecondary:    '#A78BFA', // color de texto secundario (subtítulos, ayudas)
  textMuted:        '#6B7280', // color de texto apagado (placeholders, texto deshabilitado)

  // Bordes y dorado premium
  border:           '#2D1F4E', // color de bordes/divisores sutiles
  gold:             '#D97706', // dorado, usado en insignias de plan Premium

  // Overlay transparencias frecuentes
  // Estos 6 valores son el mismo morado/blanco pero con distintos niveles
  // de transparencia (el número en el nombre = % de opacidad aproximado).
  // Se usan para fondos semitransparentes, resaltados al tocar, etc.
  primary20:        'rgba(124,58,237,0.20)',
  primary35:        'rgba(124,58,237,0.35)',
  primary12:        'rgba(124,58,237,0.12)',
  white4:           'rgba(255,255,255,0.04)',
  white8:           'rgba(255,255,255,0.08)',
  white60:          'rgba(255,255,255,0.60)',

  // Sombra del botón primario
  btnShadow:        'rgba(124,58,237,0.55)', // color usado por shadow() para el botón principal
} as const;
// "as const" le dice a TypeScript: "trata cada valor de este objeto como
// un texto EXACTO (no como 'string' genérico), y no permitas modificar
// sus propiedades después". Esto habilita que el tipo GradlyColors (más
// abajo) pueda usar `typeof DARK` para "copiar" automáticamente la forma
// (los nombres de propiedades) de este objeto.

// Modo CLARO (blanco + pasteles elegantes, sin negro puro)
export const LIGHT: GradlyColors = {
  // Mismo objeto que DARK, pero con los valores adaptados para que se vean
  // bien sobre fondo blanco/claro. Aquí sí se le puso el tipo explícito
  // ": GradlyColors" para que TypeScript avise si falta o sobra alguna
  // propiedad comparado con DARK (deben tener EXACTAMENTE las mismas
  // claves, solo cambia el color de cada una).

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
// Esto define un TIPO (no una variable, no existe en tiempo de ejecución,
// solo ayuda a TypeScript). Se lee así: "GradlyColors es un objeto que
// tiene, como claves ([K in keyof typeof DARK]), EXACTAMENTE las mismas
// claves que el objeto DARK, y el valor de cada una debe ser un string
// (color), y son 'readonly' (de solo lectura, no se pueden reasignar)".
// Gracias a esto, si mañana se agrega un color nuevo a DARK y se olvida
// agregarlo a LIGHT, TypeScript marcará un error automáticamente.

/**
 * Export estático de compatibilidad. Apunta SIEMPRE a la paleta oscura.
 * Las pantallas migradas al tema dinámico deben usar `useTheme().colors`.
 */
export const COLORS = DARK;
// COLORS es una salida "vieja"/de compatibilidad: código antiguo que
// todavía no fue actualizado para usar useTheme() puede importar `COLORS`
// directamente, pero siempre verá el tema OSCURO fijo (no cambia aunque
// el usuario active el modo claro). Por eso el comentario dice que las
// pantallas "migradas" deben usar useTheme().colors en su lugar: eso sí
// reacciona al cambio de tema en vivo.

// ═══════════════════════════════════════════
// TIPOGRAFÍA — nombres de fuentes cargadas en _layout.tsx
// ═══════════════════════════════════════════
export const FONTS = {
  // Cada propiedad es el NOMBRE EXACTO con el que Expo registró una
  // fuente personalizada (ver app/_layout.tsx, donde se cargan con
  // useFonts({...})). Estos nombres se usan luego en cualquier estilo de
  // texto como: fontFamily: FONTS.soraBold

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
  // BASE contiene estilos "genéricos" (tarjeta, botón, input...) que
  // varias pantallas antiguas reutilizan directo, en vez de redefinir el
  // mismo estilo una y otra vez. OJO: como usan `COLORS` (el atajo fijo
  // al tema oscuro definido arriba), estos estilos NO cambian si el
  // usuario activa el modo claro — por eso las pantallas nuevas prefieren
  // el patrón "makeStyles(colors)" explicado en GUIA_03_TEMA_CLARO_OSCURO.md,
  // que sí es sensible al tema actual.
  card: {
    backgroundColor: COLORS.backgroundCard, // fondo de tarjeta
    borderRadius: 16,                       // esquinas redondeadas (16px)
    padding: 20,                            // espacio interno en los 4 lados
    borderWidth: 1,                         // grosor del borde
    borderColor: COLORS.border,             // color del borde
  },
  cardSurface: {
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnPrimary: {
    height: 50,                              // alto fijo del botón
    backgroundColor: COLORS.primaryDark,     // color de fondo del botón principal
    borderRadius: 12,
    alignItems: 'center',                    // centra el contenido horizontalmente
    justifyContent: 'center',                // centra el contenido verticalmente
    ...shadow({ color: COLORS.btnShadow, y: 4, blur: 12, opacity: 1, elevation: 8 }),
    // "...shadow(...)" usa el operador "spread": llama a la función
    // shadow() (importada arriba) que devuelve un objeto con las
    // propiedades de sombra correctas para la plataforma actual, y las
    // "esparce" (copia) dentro de este objeto de estilos.
  },
  btnPrimaryText: {
    fontSize: 15,
    fontWeight: '600',                       // grosor de la fuente (600 = semi-negrita)
    color: COLORS.textPrimary,
    letterSpacing: 0.3,                      // espacio extra entre letras
  },
  btnOutline: {
    height: 48,
    backgroundColor: COLORS.white4,          // fondo casi transparente
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
    flex: 1,                                 // ocupa todo el espacio disponible
    height: 52,
    backgroundColor: COLORS.white4,
    borderRadius: 12,
    paddingHorizontal: 14,                   // espacio interno izquierda/derecha
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  inputWrap: {
    flexDirection: 'row',                    // acomoda a los hijos en fila (horizontal)
    alignItems: 'center',
    backgroundColor: COLORS.white4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 52,
    marginBottom: 14,                        // espacio debajo del elemento
    paddingHorizontal: 14,
  },
  inputWrapError: {
    borderColor: COLORS.error,               // se combina con inputWrap cuando hay error de validación
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
    marginTop: -8,                           // margen negativo: "acerca" el texto al campo de arriba
    marginBottom: 10,
  },
  divider: {
    height: 1,                               // una línea delgada
    backgroundColor: COLORS.border,
    marginVertical: 20,                      // espacio arriba y abajo
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,                        // muy redondeado → forma de "píldora"
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

// Esta interfaz describe la FORMA exacta del valor que va a "escuchar"
// cualquier componente que use useTheme(): qué propiedades tiene y de qué
// tipo es cada una.
interface ThemeContextValue {
  colors: GradlyColors;                    // el objeto de colores ACTIVO ahora mismo (DARK o LIGHT)
  fonts: typeof FONTS;                     // los nombres de fuentes (siempre igual, no cambia con el tema)
  base: typeof BASE;                       // los estilos base reutilizables (siempre igual)
  isDark: boolean;                         // true = modo oscuro activo, false = modo claro activo
  toggleTheme: () => void;                 // función para ALTERNAR entre oscuro/claro
  setTheme: (mode: 'dark' | 'light') => void; // función para FIJAR un modo específico
}

const THEME_KEY = '@gradly_theme';
// THEME_KEY es el "nombre de archivo" que se usa dentro de AsyncStorage
// (o localStorage en web) para guardar la preferencia de tema del
// usuario. Es solo un identificador de texto — AsyncStorage funciona
// como un diccionario clave→valor, y esta es la clave.

const ThemeContext = createContext<ThemeContextValue>({
  // Se crea el Context con un valor "por defecto" que solo se usaría si
  // algún componente llamara a useTheme() SIN estar envuelto dentro de
  // <ThemeProvider> (en la práctica no pasa, porque _layout.tsx siempre
  // envuelve toda la app). Por defecto arranca en modo oscuro.
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
  // Esta función decide con qué tema debe ARRANCAR la app, ANTES incluso
  // de que se pinte la primera pantalla.
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    // Solo en la versión WEB podemos leer el almacenamiento de forma
    // "síncrona" (inmediata, sin esperar). "typeof window !== 'undefined'"
    // es una comprobación de seguridad típica en React Native Web: se
    // asegura de que `window` (el objeto global del navegador) sí existe
    // antes de usarlo, por si este código llegara a correr en un entorno
    // donde no existe.
    try {
      return window.localStorage.getItem(THEME_KEY) !== 'light';
      // Lee directamente del navegador el valor guardado bajo la clave
      // THEME_KEY. Si el valor guardado NO es exactamente 'light',
      // entonces devuelve true (modo oscuro) — es decir, oscuro es el
      // valor por defecto salvo que el usuario haya elegido claro antes.
    } catch {
      // localStorage inaccesible (modo privado estricto, etc.) → default oscuro.
    }
  }
  return true; // Si no es web, o falló la lectura: arranca en modo oscuro por defecto.
}

export const ThemeProvider: FC<{ children: ReactNode }> = ({ children }) => {
  // ThemeProvider es el componente que hay que colocar "envolviendo" toda
  // la app (ya lo hace app/_layout.tsx). Recibe una sola prop, `children`
  // (todo lo que esté "adentro" de <ThemeProvider>...</ThemeProvider> en
  // el JSX), y se encarga de calcular y compartir el valor del tema.

  const [isDark, setIsDark] = useState(getInitialIsDark);
  // useState(getInitialIsDark) crea el estado `isDark` (booleano) y su
  // función para actualizarlo `setIsDark`. Al pasarle la FUNCIÓN
  // getInitialIsDark (sin llamarla con paréntesis) en vez de un valor
  // fijo, React la ejecuta UNA SOLA VEZ, en el primer render, para
  // calcular el valor inicial — así se evita recalcularlo en cada
  // repintado de pantalla.

  // Carga la preferencia persistida al iniciar (solo nativo: en web ya se
  // resolvió de forma síncrona arriba, sin esperar a este efecto).
  useEffect(() => {
    // El array vacío "[]" al final de useEffect significa: "ejecuta esta
    // función SOLO UNA VEZ, cuando el componente aparece en pantalla por
    // primera vez" (equivalente a "onMount" en otros frameworks).
    if (Platform.OS === 'web') return;
    // En web ya se resolvió el tema de forma inmediata en
    // getInitialIsDark(), así que aquí no hay nada más que hacer.
    AsyncStorage.getItem(THEME_KEY)
      // En nativo (Android/iOS), leer AsyncStorage es asíncrono (tarda un
      // poquito), así que no se puede hacer antes del primer render — se
      // hace aquí, después, y si el valor guardado es 'light' se corrige
      // el estado.
      .then(v => { if (v === 'light') setIsDark(false); })
      .catch(() => {});
      // Si algo falla leyendo el almacenamiento, simplemente no se hace
      // nada (se queda con el valor por defecto, modo oscuro).
  }, []);

  const setTheme = (mode: 'dark' | 'light') => {
    // Función para FIJAR un tema específico (no alternar, sino elegir
    // directamente "dark" o "light"). La usaría, por ejemplo, un menú de
    // Configuración con dos botones "Oscuro" / "Claro".
    setIsDark(mode === 'dark');
    // Actualiza el estado en memoria (esto hace que la app se repinte).
    AsyncStorage.setItem(THEME_KEY, mode).catch(() => {});
    // Y en paralelo, guarda la elección en el almacenamiento persistente
    // para recordarla la próxima vez que se abra la app. ".catch(() => {})"
    // ignora cualquier error de guardado (no es crítico si falla).
  };

  const toggleTheme = () => {
    // Función para ALTERNAR entre oscuro y claro (lo que usa normalmente
    // un switch/interruptor único).
    setIsDark(prev => {
      // Se le pasa una FUNCIÓN a setIsDark (en vez de un valor) para
      // garantizar que `prev` sea siempre el valor más reciente del
      // estado, incluso si hay actualizaciones encoladas.
      const next = !prev; // invierte el booleano actual
      AsyncStorage.setItem(THEME_KEY, next ? 'dark' : 'light').catch(() => {});
      return next; // este es el nuevo valor de isDark
    });
  };

  return (
    <ThemeContext.Provider
      value={{
        // Este es el "paquete" completo de datos que CUALQUIER componente
        // hijo va a recibir al llamar a useTheme():
        colors: isDark ? DARK : LIGHT, // elige la paleta según el estado actual
        fonts: FONTS,
        base: BASE,
        isDark,
        toggleTheme,
        setTheme,
      }}
    >
      {children}
      {/* Aquí se renderiza TODA la app (todo lo que estaba dentro de
          <ThemeProvider>...</ThemeProvider> en _layout.tsx). Gracias al
          Context.Provider, toda esa app (sin importar cuán anidada esté)
          puede acceder al `value` de arriba con useTheme(). */}
    </ThemeContext.Provider>
  );
};

/** Hook principal — devuelve colores, fuentes y estilos base */
export const useTheme = () => useContext(ThemeContext);
// Este es EL hook que usa el resto de la app. Ejemplo de uso típico en
// cualquier componente:
//     const { colors, isDark, toggleTheme } = useTheme();
//     <View style={{ backgroundColor: colors.backgroundDark }}>...</View>
// useContext(ThemeContext) simplemente "escucha" el Context definido
// arriba y devuelve su valor actual — y como es un hook, si el valor
// cambia (por ejemplo el usuario activa el modo claro), el componente que
// lo usa se vuelve a dibujar automáticamente con los nuevos colores.

/** Alias de compatibilidad con código anterior */
export const useThemeContext = () => useContext(ThemeContext);
// Mismo hook con otro nombre, para no romper archivos antiguos del
// proyecto que ya lo importaban como `useThemeContext` antes de que se
// estandarizara el nombre `useTheme`.

export default ThemeContext;
// También se exporta el Context "crudo" como export por defecto, por si
// algún archivo necesita usarlo directamente (poco común; casi todo el
// proyecto usa los hooks useTheme/useThemeContext de arriba).
