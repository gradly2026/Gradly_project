/**
 * Traducción "al vuelo" del contenido dinámico (BD) con caché.
 *
 * - Llama a la Cloud Function callable `traducirTexto` (functions/src/traducir.ts),
 *   que usa Google Translate con la cuenta de servicio del proyecto (sin API key).
 * - Cachea cada resultado en memoria y en AsyncStorage → cada texto se traduce
 *   UNA sola vez, incluso entre reinicios de la app.
 * - Agrupa (batch) las peticiones de un mismo render en una sola llamada.
 *
 * Se consume con el hook/componente de src/components/AutoText.tsx.
 */

// ════════════════════════════════════════════════════════════════════════
// GUÍA PARA PRINCIPIANTES — qué problema resuelve este archivo:
//
// El otro sistema de traducción (TranslationContext.tsx + es.json/en.json)
// sirve para texto que un PROGRAMADOR escribió de antemano ("Bienvenido",
// "Guardar", "Error"...). Pero ¿qué pasa con texto que escribe un USUARIO,
// como el nombre de una vacante o la descripción de una empresa? Nadie
// puede tener ese texto traducido de antemano porque no se sabe qué va a
// escribir la gente.
//
// Este archivo resuelve eso "al vuelo" (en el momento):
//   1. Cuando la app necesita mostrar un texto dinámico en inglés, primero
//      revisa si YA lo tradujo antes (caché en memoria y en el celular).
//   2. Si no lo tiene, lo agrega a una "cola" de pendientes.
//   3. Después de una pequeña espera (para juntar varios textos a la vez
//      y no hacer una llamada a internet por cada palabra suelta), manda
//      TODOS los pendientes juntos a una función que vive "en la nube"
//      (una Cloud Function de Firebase, no en este proyecto sino en la
//      carpeta functions/), la cual sí sabe hablar con Google Translate.
//   4. Guarda cada resultado en el caché para no tener que volver a
//      pedirlo nunca más.
// ════════════════════════════════════════════════════════════════════════

import AsyncStorage from "@react-native-async-storage/async-storage";
// La cajita de almacenamiento persistente, para guardar el caché de
// traducciones en el celular/navegador y no perderlo al cerrar la app.

import { getFunctions, httpsCallable } from "firebase/functions";
// Estas dos funciones vienen de "firebase/functions", la parte de
// Firebase que permite llamar a "Cloud Functions" (código que corre en
// los servidores de Google, no en el celular del usuario):
//   - getFunctions(app, region) → obtiene la conexión al servicio de
//     Cloud Functions de nuestro proyecto, en una región específica.
//   - httpsCallable(functions, "nombreFuncion") → crea una función de
//     JavaScript que, al llamarla, en realidad hace una petición HTTP
//     segura hacia la Cloud Function con ese nombre y devuelve su
//     respuesta. Es la forma "fácil" de llamar funciones en la nube sin
//     tener que armar la petición HTTP a mano.

import { app } from "../config/firebaseConfig";
// `app` es la conexión principal a Firebase que vimos en detalle en
// src/config/firebaseConfig.ts. Se necesita aquí porque getFunctions()
// requiere saber A QUÉ proyecto de Firebase pertenece.

import { ADMIN_SEED_EN, AUTO_SEED_EN, CUPOS_SEED_EN, GESTION_SEED_EN, INCIDENCIAS_SEED_EN, NOTIF_MODALES_SEED_EN, PROGRESO_SEED_EN, RECLUTAMIENTO_SEED_EN, RESUMEN_HOME_SEED_EN, UBICACION_SEED_EN } from "../i18n/autoSeed";
// Estos son varios diccionarios "es → en" PRE-ESCRITOS a mano, definidos
// en src/i18n/autoSeed.ts (ver la explicación completa en ese archivo y
// en GUIA_02_TRADUCTOR_I18N.md). La idea es: para frases que YA sabemos
// de antemano que van a aparecer mucho (por ejemplo textos de pantallas
// completas, no inventados por el usuario), en vez de esperar a que la
// Cloud Function las traduzca la primera vez que alguien las ve (lo cual
// tarda un poquito y depende de internet), se "siembran" ya traducidas
// directo en el caché apenas arranca la app. Así el usuario nunca ve un
// parpadeo de texto en español antes de que cambie a inglés.

type Lang = "es" | "en";
// Tipo local, igual de concepto que `Language` en TranslationContext.tsx.

// Misma región que el resto de Cloud Functions.
const functions = getFunctions(app, "us-central1");
// Conexión al servicio de Cloud Functions del proyecto, especificando la
// región del servidor ("us-central1", en EE.UU. central) donde están
// desplegadas las funciones (debe coincidir con la región configurada en
// la carpeta functions/, si no, las llamadas fallarían).

const _traducir = httpsCallable<
  { q: string[]; target: string },
  { translations: string[] }
>(functions, "traducirTexto");
// Crea la función invocable `_traducir`, conectada a la Cloud Function
// remota llamada "traducirTexto" (su código real vive en
// functions/src/traducir.ts, fuera de este proyecto de la app).
// Los dos "genéricos" entre <> le dicen a TypeScript:
//   - Lo que hay que ENVIARLE: { q: string[]; target: string }
//     (q = lista de textos a traducir, target = idioma destino, "en").
//   - Lo que va a DEVOLVER: { translations: string[] }
//     (una lista de textos ya traducidos, en el mismo orden que se
//     enviaron).
// El guion bajo al inicio del nombre (_traducir) es solo una convención
// para indicar "función interna/privada de este archivo, no la exportes
// directamente" (más abajo sí existe una función pública `traducir`,
// distinta, que la usa por debajo).

// v3: se invalida el caché anterior (podía tener originales "pegados" en español
// por fallos previos de la Cloud Function) → todo se retraduce fresco y el seed
// estático (AUTO_SEED_EN) toma precedencia para las pantallas ya curadas.
const CACHE_KEY = "@gradly/tcache_v4";
// La clave bajo la cual se guarda TODO el caché de traducciones dinámicas
// en AsyncStorage. El sufijo "_v4" es una técnica común: cuando cambia la
// LÓGICA de cómo se guardan los datos (o se detecta que el caché viejo
// podía tener errores, como dice el comentario de arriba), se cambia el
// número de versión en la clave. Así, en vez de intentar "migrar" datos
// viejos con formato distinto, simplemente se empieza un caché nuevo de
// cero (el viejo con clave "_v3" queda huérfano y sin usarse).

const SEP = " ";
// Un separador simple (un espacio) usado para combinar idioma + texto en
// una sola clave de caché (ver la función `key` justo abajo).

const key = (target: string, text: string) => `${target}${SEP}${text}`;
// Función de una sola línea (función flecha) que arma la CLAVE interna
// del caché para un texto+idioma dado. Por ejemplo:
//     key("en", "Hola mundo") → "en Hola mundo"
// Así, el mismo texto en español puede tener una entrada de caché
// distinta para "en" (inglés) sin mezclarse.

const mem: Record<string, string> = {};
// El caché EN MEMORIA (vive solo mientras la app está abierta, se pierde
// al cerrarla — para persistencia real está `schedulePersist`/AsyncStorage
// más abajo). Es un objeto simple "clave de texto" → "traducción".
// Todas las funciones de este archivo leen/escriben aquí primero, porque
// leer de memoria es instantáneo (a diferencia de leer del disco o de
// internet).

const inflight = new Set<string>();
// Un Set (una "lista sin duplicados") con las claves que YA se están
// pidiendo a la Cloud Function ahora mismo, para no pedir el mismo texto
// dos veces en paralelo si dos componentes lo necesitan casi al mismo
// tiempo.

const listeners = new Set<() => void>();
// Un Set de funciones "callback" que quieren ENTERARSE cuando el caché de
// traducciones cambia (por ejemplo, un componente <AutoText> que se
// suscribió para repintarse en cuanto su texto ya esté traducido). Ver
// subscribeTranslations() y notify() más abajo.

let queue: { target: Lang; text: string }[] = [];
// La "cola" de textos pendientes de traducir. Es un array de objetos
// { target, text }. Se usa `let` (no `const`) porque este array se
// reemplaza completo cada vez que se procesa (ver flush()).

let flushTimer: ReturnType<typeof setTimeout> | null = null;
// Guarda el identificador del temporizador (setTimeout) que va a disparar
// el envío de la cola pendiente. "ReturnType<typeof setTimeout>" es un
// truco de TypeScript para decir "el tipo que devuelve setTimeout",  sin
// tener que escribirlo a mano (cambia según el entorno: número en
// nativo/web, o un objeto especial en Node).

let persistTimer: ReturnType<typeof setTimeout> | null = null;
// Temporizador separado para guardar el caché en AsyncStorage (persistir
// en disco), explicado más abajo en schedulePersist().

let dirty = false;
// Bandera booleana: "¿hay cambios en el caché que todavía no se guardaron
// en AsyncStorage?". Evita escribir en disco innecesariamente si nada
// cambió.

/** Devuelve la traducción cacheada, o undefined si aún no existe. */
export function getCachedTranslation(target: Lang, text: string): string | undefined {
  if (target === "es") return text;
  // Si el idioma destino es español, no hace falta traducir nada: el
  // contenido de la base de datos ya está en español (es el idioma en el
  // que los usuarios lo escriben). Se devuelve el texto tal cual.
  return mem[key(target, text)];
  // Busca en el caché de memoria. Si no existe la clave, JavaScript
  // devuelve automáticamente `undefined` (de ahí el tipo de retorno
  // "string | undefined").
}

// Idioma activo espejado desde TranslationContext, para uso FUERA de React
// (parche de Alert, helpers imperativos) donde no hay acceso al contexto.
let activeLang: Lang = "es";
// Variable "global" de este módulo (no es un estado de React) que guarda
// cuál es el idioma activo AHORA MISMO. Se necesita porque algunas
// funciones de este archivo se llaman desde lugares que NO son
// componentes de React (por ejemplo, funciones utilitarias sueltas), y
// ahí no se puede usar el hook useTranslation().

export function setActiveLang(l: Lang) {
  activeLang = l;
}
// Función que llama TranslationContext.tsx cada vez que el usuario cambia
// de idioma, para mantener sincronizada esta copia "espejo".

export function getActiveLang(): Lang {
  return activeLang;
}
// Función de solo lectura para que cualquier archivo pueda preguntar
// "¿cuál es el idioma activo ahora?" sin pasar por el Context de React.

/**
 * Traducción SÍNCRONA para strings sueltos (placeholders imperativos, Alerts):
 * devuelve la versión cacheada o el original; si falta, la pide para la próxima
 * vez. Nunca bloquea (los Alerts deben aparecer al instante).
 */
export function translateSync(text?: string | null): string {
  // "SÍNCRONA" significa que esta función devuelve un resultado
  // INMEDIATAMENTE (no hay que esperar con "await"), aunque el resultado
  // pueda no estar traducido todavía la primera vez que se pide.
  const t = text ?? "";
  // Si `text` es null/undefined, se usa cadena vacía en su lugar (evita
  // errores más abajo al llamar a .trim()).
  if (activeLang === "es" || !t.trim()) return t;
  // Si el idioma activo es español, o el texto está vacío (o solo tiene
  // espacios en blanco: .trim() los quita y si queda vacío es "falsy"),
  // no hay nada que traducir: se devuelve tal cual.
  const cached = getCachedTranslation(activeLang, t);
  if (cached !== undefined) return cached;
  // Si ya estaba en caché, se devuelve directamente la traducción ya
  // guardada (instantáneo, sin esperar a internet).
  requestTranslation(activeLang, t);
  // Si NO estaba en caché, se pide que se traduzca (esto se agrega a la
  // cola y tardará un poco), pero como esta función debe responder YA...
  return t;
  // ...mientras tanto se devuelve el texto ORIGINAL (en español). La
  // próxima vez que se llame a translateSync() con el mismo texto
  // (por ejemplo, cuando el componente se vuelva a dibujar tras recibir
  // la notificación de `notify()`), ya estará en caché y se devolverá
  // traducido.
}

export function subscribeTranslations(fn: () => void): () => void {
  // Permite que un componente (típicamente <AutoText>) diga "avísame
  // cuando el caché de traducciones cambie, para volver a intentar
  // mostrar el texto ya traducido".
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
  // Devuelve una función de "desuscripción": el componente la llama
  // cuando se desmonta, para dejar de recibir avisos (evita fugas de
  // memoria).
}

function notify() {
  listeners.forEach((fn) => fn());
}
// Recorre TODOS los suscriptores registrados y los ejecuta, avisándoles
// "algo cambió en el caché, revisa si tu texto ya está traducido".

/** Encola un texto para traducir (si no está ya cacheado o en curso). */
export function requestTranslation(target: Lang, text: string) {
  if (target === "es" || !text || !text.trim()) return;
  // No hay nada que pedir si el destino es español, o si el texto está
  // vacío.
  const k = key(target, text);
  if (mem[k] !== undefined || inflight.has(k)) return;
  // Si ya está en caché, o ya se está pidiendo AHORA MISMO (está en
  // `inflight`), no hace falta pedirlo de nuevo — evita trabajo duplicado.
  inflight.add(k);
  // Marca esta clave como "en curso" para que nadie más la vuelva a
  // pedir mientras se resuelve.
  queue.push({ target, text });
  // Agrega el texto a la cola de pendientes.
  if (!flushTimer) flushTimer = setTimeout(flush, 120);
  // Si todavía no hay un temporizador programado para "vaciar" la cola,
  // programa uno que la vacíe en 120 milisegundos. Este pequeño retraso
  // es a propósito: durante esos 120ms se pueden ir juntando MUCHOS
  // textos pendientes (por ejemplo, si una lista de 20 vacantes se está
  // dibujando a la vez), y así se manda UNA sola petición a la Cloud
  // Function con los 20 textos juntos, en vez de 20 peticiones sueltas
  // (esto se llama "batching" o "agrupar peticiones").
}

async function flush() {
  // "flush" = "vaciar". Esta función toma todo lo que se acumuló en la
  // cola y lo envía de verdad a la Cloud Function.
  flushTimer = null;
  // Libera el temporizador (para que requestTranslation() pueda programar
  // uno nuevo la próxima vez que haga falta).
  const batch = queue;
  queue = [];
  // Toma la cola actual y la reemplaza por una vacía. Guardar la
  // referencia en `batch` primero evita perder textos que se agreguen a
  // `queue` MIENTRAS este flush() todavía se está ejecutando (con
  // "await" más abajo).
  if (batch.length === 0) return;

  const byTarget: Record<string, string[]> = {};
  batch.forEach(({ target, text }) => {
    (byTarget[target] ??= []).push(text);
  });
  // Agrupa los textos pendientes por idioma destino (en la práctica, en
  // este proyecto casi siempre va a ser solo "en", pero el código soporta
  // varios). "byTarget[target] ??= []" es un atajo: "si byTarget[target]
  // todavía no existe (es null/undefined), créalo como array vacío", y
  // luego .push(text) agrega el texto a ese array.

  for (const [target, texts] of Object.entries(byTarget)) {
    // Recorre cada grupo de idioma con sus textos.
    const uniq = Array.from(new Set(texts));
    // Elimina duplicados: si el mismo texto apareció 5 veces en la cola
    // (por ejemplo, la misma etiqueta repetida en 5 tarjetas), solo se
    // manda UNA vez a traducir.
    // Trocea para no mandar payloads enormes.
    for (let i = 0; i < uniq.length; i += 100) {
      const chunk = uniq.slice(i, i + 100);
      // Divide la lista en "trozos" (chunks) de máximo 100 textos, para
      // no mandar una petición gigante de una sola vez (podría fallar por
      // límites de tamaño del servidor).
      try {
        const res = await _traducir({ q: chunk, target });
        // Llama de verdad a la Cloud Function, esperando (await) su
        // respuesta. `res.data` va a tener la forma { translations: [...] }
        // definida en los genéricos de httpsCallable de más arriba.
        const out = res.data?.translations ?? [];
        // Si por algún motivo `res.data` no trajera `translations`, se
        // usa un array vacío como respaldo (evita errores más abajo).
        chunk.forEach((t, idx) => {
          mem[key(target, t)] = out[idx] ?? t;
          // Guarda en el caché de memoria la traducción recibida en la
          // MISMA posición (idx) que el texto original que se mandó. Si
          // por algún motivo faltara esa posición en la respuesta, se
          // guarda el texto original tal cual (mejor mostrar el original
          // que nada).
          inflight.delete(key(target, t));
          // Ya no está "en curso": se resolvió (para bien o para mal).
        });
      } catch {
        // Falla → guardamos el original para no reintentar en bucle.
        chunk.forEach((t) => {
          mem[key(target, t)] = t;
          inflight.delete(key(target, t));
        });
        // Si la llamada a la Cloud Function falla (sin internet, error
        // del servidor, etc.), en vez de dejar el texto "atascado"
        // pidiéndose una y otra vez, se guarda el texto ORIGINAL como si
        // fuera su propia "traducción". Así el usuario al menos ve algo
        // (el texto en español) en vez de nada, y no se sigue
        // reintentando en bucle infinito.
      }
      dirty = true;
      // Marca que el caché cambió y hay que guardarlo en disco pronto.
    }
  }

  notify();
  // Avisa a todos los componentes suscritos que el caché cambió, para que
  // vuelvan a intentar mostrar sus textos (ahora ya deberían estar
  // traducidos).
  schedulePersist();
  // Programa el guardado del caché en AsyncStorage.
}

function schedulePersist() {
  if (persistTimer) return;
  // Si ya hay un guardado programado, no programa otro encima (evita
  // guardar más veces de las necesarias).
  persistTimer = setTimeout(async () => {
    persistTimer = null;
    if (!dirty) return;
    // Si entre que se programó el guardado y ahora nada volvió a cambiar,
    // no hace falta escribir en disco.
    dirty = false;
    try {
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(mem));
      // Convierte TODO el objeto `mem` (el caché en memoria) a texto JSON
      // y lo guarda en el almacenamiento persistente, bajo la clave
      // CACHE_KEY definida arriba.
    } catch {
      /* si falla el guardado, el caché en memoria sigue funcionando */
    }
  }, 1500);
  // Espera 1.5 segundos antes de guardar, para no escribir en disco cada
  // vez que llega una sola traducción nueva — junta varios cambios y
  // guarda una sola vez.
}

/**
 * Siembra el caché en memoria con el diccionario estático curado (ES→EN) para
 * que esas pantallas se traduzcan AL INSTANTE en el primer render (sin red, sin
 * parpadeo) y sin poder quedar "pegadas" en español por un fallo de la CF.
 * El seed tiene precedencia: se aplica DESPUÉS de cargar el caché persistido.
 */
function seedStaticCache(): void {
  // Esta función recorre cada uno de los diccionarios pre-escritos
  // importados al inicio del archivo (AUTO_SEED_EN, ADMIN_SEED_EN, etc.,
  // definidos en src/i18n/autoSeed.ts) y los vuelca dentro del caché en
  // memoria `mem`, como si ya hubieran sido traducidos por la Cloud
  // Function. Se repite el mismo patrón para cada diccionario:
  for (const es in AUTO_SEED_EN) {
    // "for...in" recorre las CLAVES de un objeto (aquí, cada clave es un
    // texto en español).
    const en = AUTO_SEED_EN[es];
    // Obtiene la traducción al inglés correspondiente a esa clave.
    if (en) mem[key("en", es)] = en;
    // Si existe traducción, la guarda en el caché con la misma forma de
    // clave que usa el resto del sistema (key("en", textoEnEspañol)).
  }
  for (const es in ADMIN_SEED_EN) {
    const en = ADMIN_SEED_EN[es];
    if (en) mem[key("en", es)] = en;
  }
  for (const es in CUPOS_SEED_EN) {
    const en = CUPOS_SEED_EN[es];
    if (en) mem[key("en", es)] = en;
  }
  for (const es in UBICACION_SEED_EN) {
    const en = UBICACION_SEED_EN[es];
    if (en) mem[key("en", es)] = en;
  }
  for (const es in GESTION_SEED_EN) {
    const en = GESTION_SEED_EN[es];
    if (en) mem[key("en", es)] = en;
  }
  for (const es in PROGRESO_SEED_EN) {
    const en = PROGRESO_SEED_EN[es];
    if (en) mem[key("en", es)] = en;
  }
  for (const es in RESUMEN_HOME_SEED_EN) {
    const en = RESUMEN_HOME_SEED_EN[es];
    if (en) mem[key("en", es)] = en;
  }
  for (const es in NOTIF_MODALES_SEED_EN) {
    const en = NOTIF_MODALES_SEED_EN[es];
    if (en) mem[key("en", es)] = en;
  }
  for (const es in INCIDENCIAS_SEED_EN) {
    const en = INCIDENCIAS_SEED_EN[es];
    if (en) mem[key("en", es)] = en;
  }
  for (const es in RECLUTAMIENTO_SEED_EN) {
    const en = RECLUTAMIENTO_SEED_EN[es];
    if (en) mem[key("en", es)] = en;
  }
  // (Los 9 bloques hacen exactamente lo mismo, cada uno con un diccionario
  // distinto de src/i18n/autoSeed.ts — cada diccionario agrupa las frases
  // de una sección distinta de la app: administración, cupos, ubicación,
  // gestión, progreso, resumen del home, modales de notificaciones,
  // incidencias de práctica, etc.)
}

// Seed síncrono al cargar el módulo: el caché queda caliente desde el primer
// render, incluso antes de que resuelva hydrateTranslationCache().
seedStaticCache();
// Esta línea NO está dentro de ninguna función: se ejecuta automáticamente
// una sola vez, apenas JavaScript "importa"/carga este archivo por primera
// vez (esto se llama "código a nivel de módulo"). Así, el caché ya tiene
// las traducciones curadas disponibles incluso antes de que termine de
// arrancar el resto de la app.

/** Carga el caché persistido. Llamar una vez al arrancar la app. */
export async function hydrateTranslationCache(): Promise<void> {
  // "Hidratar" (hydrate) es un término común para "cargar datos guardados
  // y volver a llenar con ellos una estructura en memoria". Esta función
  // la llama TranslationContext.tsx apenas arranca la app.
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    // Lee el texto JSON guardado en el almacenamiento persistente.
    if (raw) Object.assign(mem, JSON.parse(raw));
    // Si existía algo guardado, lo convierte de vuelta a objeto
    // (JSON.parse) y copia todas sus propiedades dentro del caché en
    // memoria `mem` (Object.assign combina objetos).
  } catch {
    /* sin caché previo */
  }
  // El seed va al final para sobrescribir cualquier original "pegado".
  seedStaticCache();
  // Se vuelve a aplicar el "seed" curado DESPUÉS de cargar lo guardado en
  // disco, a propósito: si el caché guardado tuviera algún dato viejo o
  // incorrecto para una frase que sí está en el seed curado, el seed
  // "gana" y sobrescribe ese valor con la versión correcta.
  notify();
  // Avisa a los componentes suscritos que el caché ya se actualizó.
}

/**
 * Traducción imperativa (para strings sueltos fuera de React, p. ej. un Alert).
 * Devuelve el original si es español o si la API falla.
 */
export async function traducir(text: string, target: Lang): Promise<string> {
  // A diferencia de translateSync() (que devuelve YA aunque no esté
  // traducido), esta función es ASÍNCRONA: espera (await) a tener la
  // traducción real antes de devolver algo. Se usa en lugares donde SÍ se
  // puede esperar un poquito, como antes de mostrar un mensaje de alerta.
  if (target === "es" || !text || !text.trim()) return text;
  const cached = getCachedTranslation(target, text);
  if (cached !== undefined) return cached;
  // Si ya está en caché, se devuelve de inmediato sin llamar a internet.
  try {
    const res = await _traducir({ q: [text], target });
    // Llama a la Cloud Function con un solo texto dentro de la lista `q`.
    const out = res.data?.translations?.[0] ?? text;
    // Toma el primer (y único) resultado de la lista de traducciones
    // devuelta; si no viniera, usa el texto original como respaldo.
    mem[key(target, text)] = out;
    dirty = true;
    schedulePersist();
    // Guarda el resultado en caché y programa que se persista en disco,
    // igual que hace flush() para las traducciones agrupadas.
    return out;
  } catch {
    return text;
    // Si falla la llamada, se devuelve el texto original sin traducir
    // (mejor eso que romper la pantalla o dejarla en blanco).
  }
}

export default traducir;
// También se exporta `traducir` como export por defecto del archivo (una
// segunda forma de importarlo: `import traducir from '.../translationService'`
// en vez de `import { traducir } from '.../translationService'`).
