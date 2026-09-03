/**
 * FloatingTopBar — píldora flotante (Glassmorphism) arriba a la derecha.
 *
 * Agrupa 3 acciones: Notificaciones · Traducción · Tema (claro/oscuro).
 * Position absolute, top: SafeArea, right: 15 — fuera del flujo del documento.
 */

// ════════════════════════════════════════════════════════════════════════
// GUÍA PARA PRINCIPIANTES — qué es este archivo:
//
// FloatingTopBar es un COMPONENTE de React (una pieza de interfaz
// reutilizable). Se coloca "flotando" sobre casi todas las pantallas de
// la app y agrupa 3 botones: la campanita de notificaciones 🔔, el botón
// de idioma 🌐, y el interruptor de tema claro/oscuro 🌓.
//
// Es un ejemplo MUY completo para aprender React Native porque combina:
//   - Varios hooks (useState, useEffect) para manejar su propio estado.
//   - Una LECTURA EN TIEMPO REAL de Firestore con onSnapshot() (distinto
//     a getDoc/getDocs que vimos en pasantiaService.ts: onSnapshot() no
//     trae los datos una sola vez, sino que se queda "escuchando" y
//     avisa automáticamente cada vez que algo cambia en el servidor).
//   - Cómo se consumen los 3 Contexts globales del proyecto (tema,
//     traducción, autenticación) desde un componente hijo.
//   - Cómo se abre un modal según el contenido de una notificación
//     (deep link).
//   - JSX: la sintaxis que mezcla HTML-como-markup con JavaScript, usada
//     para describir QUÉ debe verse en pantalla.
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
// Ionicons: una librería de ÍCONOS incluida con Expo (más de mil íconos
// listos para usar, como <Ionicons name="notifications-outline" />).

import { BlurView } from 'expo-blur';
// BlurView: un componente que dibuja un fondo con efecto de "vidrio
// esmerilado" (desenfoque de lo que hay detrás) — es lo que le da a esta
// barra su apariencia translúcida tipo "glassmorphism".

import * as Haptics from 'expo-haptics';
// Haptics: permite hacer vibrar sutilmente el celular al tocar un botón
// (una pequeña retroalimentación física). Solo funciona en dispositivos
// reales (no en web), por eso más abajo se comprueba Platform.OS.

import { useRouter } from 'expo-router';
// useRouter: hook de Expo Router (el sistema de navegación de la app,
// basado en las carpetas dentro de app/) que da acceso a router.push(ruta)
// para navegar programáticamente (no solo con un <Link>).

import {
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
// Ya conocemos collection, doc, query, where, updateDoc de archivos
// anteriores. Los 2 nuevos:
//   - limit(n)      → limita una consulta a traer como máximo `n`
//     documentos (aquí, 60), para no descargar un historial infinito.
//   - onSnapshot(query, callbackExito, callbackError) → en vez de pedir
//     los datos UNA VEZ (como getDocs), se SUSCRIBE a esa consulta: el
//     `callbackExito` se ejecuta inmediatamente con los datos actuales, y
//     VUELVE A EJECUTARSE automáticamente cada vez que algo cambia en el
//     servidor (alguien crea, edita o borra un documento que cumple la
//     consulta) — sin que la app tenga que "preguntar de nuevo". Por eso
//     la campanita de notificaciones se actualiza SOLA, en vivo, sin
//     recargar la pantalla. onSnapshot() devuelve una función para
//     CANCELAR la suscripción (se guarda como `unsub` más abajo) — es
//     MUY importante llamarla cuando el componente ya no se necesita,
//     para no seguir escuchando cambios en el vacío y desperdiciar datos/
//     batería.

import { useEffect, useState } from 'react';
// Hooks de React ya conocidos de los Contexts.

import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,

  TouchableOpacity,
  View,
} from 'react-native';
// Componentes base de React Native, el "vocabulario visual" con el que
// se arma cualquier pantalla (son el equivalente a las etiquetas HTML
// <div>, <button>, etc., pero para apps nativas):
//   - View            → un contenedor genérico (como un <div>).
//   - Modal            → una ventana que aparece ENCIMA de todo lo demás.
//   - Pressable / TouchableOpacity → elementos "tocables" (botones); la
//     diferencia es sutil: TouchableOpacity atenúa su opacidad al
//     tocarlo, Pressable es más flexible/moderno y permite más control.
//   - ScrollView        → un contenedor que permite hacer scroll si su
//     contenido no cabe en la pantalla.
//   - StyleSheet        → para definir los estilos (ver el objeto
//     `styles` al final del archivo).
//   - Platform          → para saber si estamos en 'web', 'ios' o 'android'.

import { useSafeAreaInsets } from 'react-native-safe-area-context';
// Hook que da los márgenes de "zona segura" del dispositivo (por ejemplo,
// el espacio que ocupa el notch/cámara frontal o la barra de estado), para
// que esta barra flotante no quede tapada por esos elementos del sistema.

import { db } from '../config/firebaseConfig';
// Conexión a Firestore.

import { parseNotifRef, resolverRutaNotif } from '../utils/notifRoute';
// Las 2 funciones "traductoras" de src/utils/notifRoute.ts, que ya
// comentamos a fondo: deciden si al tocar una notificación hay que abrir
// un modal de detalle o navegar a una ruta.

import { AutoText, AutoText as Text } from './AutoText';
// AutoText es un componente propio del proyecto (no está entre los
// archivos "maestros" de esta sesión, pero vale la pena saber qué hace):
// es como el <Text> normal de React Native, pero AUTOMÁTICAMENTE traduce
// el texto que recibe adentro usando el sistema de traducción dinámica
// (src/services/translationService.ts) — así, textos que vienen de la
// base de datos (como el título o mensaje de una notificación) se
// traducen sin que cada pantalla tenga que hacerlo a mano. Aquí se
// importa DOS VECES con nombres distintos: `AutoText` y también como
// `Text` (un alias) — así el código de abajo puede escribir <Text> en
// vez de <AutoText> en varios lugares sin tener que renombrar cada uso,
// pero sigue siendo el mismo componente con auto-traducción.

import { ThemeToggleIcon } from './ThemeToggleButton';
// Componente reutilizable que dibuja el ícono de sol/luna del interruptor
// de tema (compartido entre esta barra y otras pantallas, para que el
// ícono se vea siempre igual).

import { FONTS, useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useTranslationContext } from '../context/TranslationContext';
// Los 3 hooks de Context ya explicados en sus archivos respectivos:
//   - useTheme()             → colores/tema actual.
//   - useAuth()               → datos del usuario logueado (aquí se usa
//     `rol`, para saber si es empresa o universidad).
//   - useTranslationContext() → función t(), idioma actual, etc.

import { shadow } from '../utils/shadow';
// Utilidad para sombras multiplataforma, ya vista en ThemeContext.tsx.

import VacanteDetailByIdModal from './VacanteDetailByIdModal';
import GrupoDetailViewerModal from './GrupoDetailViewerModal';
import AplicacionGrupoDetailModal from './AplicacionGrupoDetailModal';
import ReclamoDetailModal from './ReclamoDetailModal';
import ComprobanteInfoModal from './ComprobanteInfoModal';
import PostulacionRechazadaModal from './PostulacionRechazadaModal';
import ContratoAvisoModal from './ContratoAvisoModal';
// Los modales de detalle que se pueden abrir al tocar una notificación
// con referencia estructurada "kind:id" (ver notifRoute.ts). Cada uno es
// un componente separado, definido en su propio archivo.

interface Notif {
  // La forma en la que ESTE componente representa una notificación en su
  // propio estado (parecida a, pero no idéntica a, NotificacionApp de
  // notificacionService.ts — aquí se normalizan algunos campos, como
  // convertir la fecha a texto ISO, justo abajo en el useEffect).
  id: string;
  titulo: string;
  mensaje: string;
  leida: boolean;
  created_at: string;
  link_accion?: string;
  tipo?: string;
}

interface FloatingTopBarProps {
  // Las "props" (propiedades) que recibe este componente desde quien lo
  // usa, por ejemplo: <FloatingTopBar userId={miUsuario.uid} />
  userId?: string | null;
  /**
   * Desplazamiento vertical EXTRA (px), sumado a la posición por defecto
   * (insets.top + 8). Las pantallas de chat que no tienen un header de
   * dashboard que les reserve ese espacio arriba (ver app/ChatScreen.tsx,
   * app/mensajes/index.tsx y app/mensajes/[id].tsx) la pasan para que la
   * píldora no quede tapando el encabezado propio del chat — en el resto
   * de pantallas se omite y la posición queda igual que siempre.
   */
  offsetY?: number;
  /**
   * `'floating'` (por defecto): la píldora flota con `position: absolute`
   * encima de lo que sea que haya debajo — el comportamiento de siempre.
   * `'inline'`: se dibuja como una fila normal, en el lugar exacto donde se
   * la coloque en el JSX del padre (usado dentro de la cabecera de
   * ChatThread, para que notificaciones/traducción/tema vivan SIEMPRE en el
   * mismo sitio de la barra, sin importar qué pantalla montó el chat).
   */
  variant?: 'floating' | 'inline';
}

// Endónimos: cada idioma se muestra en su propio nombre (no se traducen).
const LANGS: { code: 'es' | 'en'; label: string }[] = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
];
// Lista fija con las 2 opciones del menú de idioma. Un "endónimo" es el
// nombre de un idioma EN SU PROPIO idioma (por eso "English" no se
// traduce a "Inglés" aunque la app esté en español — así lo reconoce
// cualquier hablante, sin importar qué idioma tenga activo).

export default function FloatingTopBar({ userId, offsetY = 0, variant = 'floating' }: FloatingTopBarProps) {
  // "export default function Nombre(props) { ... }" es la forma estándar
  // de definir un componente de función en React. "{ userId }" extrae
  // directamente la prop `userId` del objeto de props recibido
  // (destructuring, igual concepto que vimos en otros archivos).

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark, toggleTheme } = useTheme();
  const { rol } = useAuth();
  const { language, setLanguage, t, locale } = useTranslationContext();
  // Aquí el componente "se conecta" a los 3 Contexts globales y a otros 2
  // hooks, extrayendo solo lo que necesita de cada uno.

  const [notifOpen, setNotifOpen] = useState(false);
  // Estado: ¿está abierta la pantalla completa de notificaciones?
  const [langOpen, setLangOpen] = useState(false);
  // Estado: ¿está abierto el menú desplegable de idioma?
  const [notifs, setNotifs] = useState<Notif[]>([]);
  // Estado: la lista de notificaciones del usuario (se llena con
  // onSnapshot, ver más abajo).
  const [unread, setUnread] = useState(0);
  // Estado: cuántas notificaciones sin leer hay (se muestra como
  // "badge" numérico sobre la campanita).

  // ── Modales de detalle abiertos por deep link de notificación ──────
  const [vacanteModalId, setVacanteModalId] = useState<string | null>(null);
  const [grupoModalId, setGrupoModalId] = useState<string | null>(null);
  const [aplicacionModalId, setAplicacionModalId] = useState<string | null>(null);
  const [reclamoModalId, setReclamoModalId] = useState<string | null>(null);
  const [comprobanteModalId, setComprobanteModalId] = useState<string | null>(null);
  const [postulacionRechazadaId, setPostulacionRechazadaId] = useState<string | null>(null);
  const [contratoAvisoId, setContratoAvisoId] = useState<string | null>(null);
  // 4 estados, uno por cada tipo de modal de detalle posible. Cada uno
  // guarda `null` (modal cerrado) o el ID del documento a mostrar (modal
  // abierto, mostrando ese documento específico). Ver más abajo cómo
  // los componentes <VacanteDetailByIdModal .../> etc. usan estos
  // estados directamente como su prop `visible` (con "!!" convertido a
  // booleano: cualquier texto no vacío se vuelve `true`, `null` se
  // vuelve `false`).

  // ── Notificaciones en tiempo real ────────────────────────────────
  useEffect(() => {
    // Este efecto se vuelve a ejecutar cada vez que cambia `userId`
    // (está en el array de dependencias [userId] al final). Al montar el
    // componente (o cuando cambia de usuario), arranca una suscripción
    // en vivo a las notificaciones de ESE usuario.
    if (!userId) return;
    // Sin usuario logueado, no hay nada que escuchar.
    const q = query(
      collection(db, 'notificaciones_app'),
      where('destinatario_id', '==', userId),
      limit(60),
    );
    // Arma la consulta: "documentos de 'notificaciones_app' donde
    // destinatario_id sea este usuario, como máximo 60".
    const unsub = onSnapshot(
      q,
      // Segundo argumento: función que se ejecuta cada vez que llegan
      // datos nuevos (al inicio, y cada vez que algo cambia después).
      snap => {
        const list: Notif[] = snap.docs.map(d => {
          // snap.docs es la lista de documentos actuales que cumplen la
          // consulta. .map() transforma cada documento crudo de
          // Firestore en un objeto `Notif` "limpio", con el formato que
          // este componente necesita.
          const data: any = d.data();
          // Soporta tanto el campo canónico nuevo (`createdAt`) como el histórico (`fecha`).
          const created = data.createdAt?.toDate?.() ?? data.fecha?.toDate?.() ?? null;
          // Los campos de fecha que guarda Firestore (creados con
          // serverTimestamp()) no son objetos Date normales de
          // JavaScript: son un tipo especial "Timestamp" que tiene un
          // método .toDate() para convertirlos. "data.createdAt?.toDate?.()"
          // usa optional chaining DOS veces: si createdAt no existiera, o
          // si no tuviera el método toDate, toda la expresión da
          // undefined en vez de romper el programa; "??" pasa entonces al
          // siguiente intento (el campo viejo `fecha`), y si tampoco
          // existe, usa `null`.
          return {
            id: d.id,
            // d.id es el ID del documento (no es un campo dentro de sus
            // datos — Firestore lo expone aparte).
            titulo: data.titulo ?? '',
            mensaje: data.mensaje ?? '',
            leida: !!data.leido,
            // "!!" convierte cualquier valor a booleano puro (por
            // ejemplo, convierte `undefined` a `false`).
            created_at: created ? created.toISOString() : new Date(0).toISOString(),
            // .toISOString() da un texto de fecha en formato estándar,
            // fácil de comparar como texto (ver el .sort() de abajo). Si
            // no hay fecha válida, usa "new Date(0)" (1 de enero de 1970)
            // como último recurso para que la notificación igual se
            // pueda ordenar (quedaría al final, por ser la más antigua).
            link_accion: data.link_accion ?? data.referencia_id ?? '',
            tipo: data.tipo ?? '',
          };
        });
        list.sort((a, b) => b.created_at.localeCompare(a.created_at));
        // Ordena la lista de más reciente a más antigua.
        // .localeCompare() compara dos textos alfabéticamente; como las
        // fechas están en formato ISO (año-mes-día...), compararlas como
        // texto da el mismo resultado que compararlas cronológicamente.
        // "b.compareTo(a)" (en vez de a.compareTo(b)) invierte el orden,
        // dejando las más nuevas primero.
        setNotifs(list.slice(0, 40));
        // Actualiza el estado con las primeras 40 notificaciones más
        // recientes (aunque se pidieron hasta 60 a Firestore, en pantalla
        // solo se muestran 40).
        setUnread(list.filter(n => !n.leida).length);
        // Cuenta cuántas no están leídas y actualiza el contador del badge.
      },
      err => console.error('[FloatingTopBar] notif error', err),
      // Tercer argumento de onSnapshot: función que se ejecuta si la
      // suscripción falla (por ejemplo, error de permisos en las reglas
      // de Firestore). Aquí solo se deja un registro en consola.
    );
    return () => unsub();
    // La función de "limpieza" de useEffect: cuando el componente se
    // desmonta (o antes de que el efecto se vuelva a ejecutar por un
    // cambio de userId), se llama a unsub() para CANCELAR la
    // suscripción — muy importante para no dejar "escuchas" activas de
    // Firestore sin necesidad (eso consumiría datos/batería
    // innecesariamente).
  }, [userId]);

  const markAllRead = async () => {
    // Marca TODAS las notificaciones pendientes como leídas, tanto en
    // Firestore como en el estado local de la pantalla.
    const pend = notifs.filter(n => !n.leida);
    await Promise.all(
      pend.map(n => updateDoc(doc(db, 'notificaciones_app', n.id), { leido: true })),
    );
    // UPDATE (varios a la vez): crea una lista de "promesas" de
    // actualización (una por cada notificación pendiente) y las ejecuta
    // todas en paralelo con Promise.all, en vez de una por una en
    // secuencia (más rápido).
    setNotifs(prev => prev.map(n => ({ ...n, leida: true })));
    // Actualiza también el estado LOCAL (en memoria, sin esperar a que
    // Firestore confirme) para que la pantalla se sienta instantánea.
    // "{ ...n, leida: true }" copia todas las propiedades del objeto `n`
    // (operador spread) y sobrescribe solo `leida` con `true`.
    setUnread(0);
  };

  const markOneRead = async (id: string) => {
    // Igual que arriba, pero para una sola notificación específica.
    await updateDoc(doc(db, 'notificaciones_app', id), { leido: true });
    setNotifs(prev => prev.map(n => (n.id === id ? { ...n, leida: true } : n)));
    setUnread(prev => Math.max(0, prev - 1));
    // Resta 1 al contador, pero nunca deja que baje de 0
    // (Math.max(0, ...) es una protección por si hubiera algún
    // desajuste entre el contador y la lista real).
  };

  // Ruta del dashboard del rol activo — se navega ahí de paso al abrir un
  // modal de detalle, para que el toque "aterrice" en la sección relevante
  // y no solo abra un overlay flotante sobre lo que sea que estuviera viendo.
  const dashboardDelRol = (): string | null => {
    if (rol === 'empresa') return '/dashboard-empresa';
    if (rol === 'universidad') return '/dashboard-universidad';
    return null;
  };

  // Al tocar una notificación: marcarla leída, cerrar el panel y navegar al
  // objeto consecuente (deep link) según su `link_accion`/`referencia_id`.
  // Las referencias estructuradas ("kind:id") abren el modal de detalle
  // correspondiente en vez de solo llevar a una ruta genérica.
  const abrirNotif = (n: Notif) => {
    // Esta función central se ejecuta cuando el usuario TOCA una
    // notificación de la lista.
    if (!n.leida) markOneRead(n.id);
    setNotifOpen(false);
    // Cierra la pantalla de notificaciones para que el usuario vea el
    // destino (modal o pantalla) sin que quede tapado.

    const ref = parseNotifRef(n.link_accion);
    // Intenta interpretar link_accion como referencia estructurada
    // "kind:id" usando la función de notifRoute.ts.
    if (ref) {
      const ruta = dashboardDelRol();
      if (ruta) { try { router.push(ruta as any); } catch { /* ya estamos ahí, o ruta inválida */ } }
      // Primero navega al dashboard correspondiente al rol del usuario
      // (empresa o universidad), para que el modal se abra "sobre" la
      // pantalla correcta. El try/catch ignora el caso de que ya
      // estuviéramos exactamente ahí (podría lanzar un aviso menor).
      switch (ref.kind) {
        // "switch" es como una cadena de "if / else if" pero comparando
        // un mismo valor contra varios casos posibles: según qué tipo de
        // entidad sea la referencia, se abre el estado (y por lo tanto el
        // modal) correspondiente.
        case 'comprobante': setComprobanteModalId(ref.id); break;
        case 'vacante': setVacanteModalId(ref.id); break;
        case 'grupo': setGrupoModalId(ref.id); break;
        case 'aplicacionGrupo': setAplicacionModalId(ref.id); break;
        case 'reclamo': setReclamoModalId(ref.id); break;
        case 'postulacionRechazada': setPostulacionRechazadaId(ref.id); break;
        case 'contratoAviso': setContratoAvisoId(ref.id); break;
      }
      return;
      // Termina aquí: si era una referencia estructurada, ya se decidió
      // qué modal abrir — no hace falta seguir revisando rutas normales.
    }

    const ruta = resolverRutaNotif(n.link_accion, n.tipo);
    // Si NO era una referencia estructurada, se usa la otra función de
    // notifRoute.ts para decidir si hay que navegar a alguna ruta simple.
    if (ruta) {
      try { router.push(ruta as any); } catch { /* ruta inválida → no navega */ }
    }
  };

  // Tamaños: la variante `inline` se dibuja DENTRO de una cabecera que ya
  // tiene sus propios íconos de 40px (ver ChatThread), así que se achica un
  // poco para no verse más grande que sus vecinos (Vaciar chat / Reportar).
  const isInline = variant === 'inline';
  const pillHeight = isInline ? 40 : 46;
  const iconBoxSize = isInline ? 36 : 40;
  const iconSize = isInline ? 20 : 22;

  const tap = (fn: () => void) => () => {
    // `tap` es una función que ENVUELVE otra función: recibe la acción
    // real que se quiere ejecutar (`fn`) y devuelve una NUEVA función que,
    // al ejecutarse, primero hace vibrar el celular (si no es web) y
    // LUEGO ejecuta `fn`. Se usa para agregar la vibración a cualquier
    // botón sin repetir ese código de Haptics en cada uno (ver
    // onPress={tap(() => setNotifOpen(true))} más abajo).
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    fn();
  };

  // ── A PARTIR DE AQUÍ: el JSX, la parte "visual" del componente ──────
  // JSX es una extensión de sintaxis de JavaScript que permite escribir
  // algo parecido a HTML directamente dentro del código. No es HTML de
  // verdad: cada etiqueta como <View> o <Text> es en realidad una llamada
  // a un componente de React Native, y las {llaves} permiten insertar
  // valores o expresiones de JavaScript en medio del markup.
  return (
    <>
      {/* "<>...</>" es un "Fragment": permite agrupar varios elementos
          hermanos (View, Modal, los 4 modales de detalle) sin tener que
          envolverlos en un <View> extra innecesario, ya que una función
          de React solo puede devolver UN elemento raíz. */}
      <View
        style={[
          isInline ? styles.inlineWrap : styles.wrap,
          !isInline && { top: insets.top + 8 + offsetY, pointerEvents: 'box-none' },
        ]}
      >
        {/* El prop `style` puede recibir un ARRAY de estilos: React
            Native los combina en orden (los de la derecha pueden
            sobrescribir a los de la izquierda). En la variante `floating`
            se combina el estilo fijo `styles.wrap` con un objeto calculado
            en el momento (la posición `top` depende del insets del
            dispositivo) y "pointerEvents: 'box-none'" para que el
            contenedor NO capture toques en las zonas vacías. En `inline`
            (dentro de la cabecera de ChatThread) nada de eso aplica: el
            elemento fluye en su lugar normal, como cualquier otra fila. */}
        <BlurView
          intensity={40}
          tint={isDark ? 'dark' : 'light'}
          style={[
            styles.pill,
            { height: pillHeight },
            {
              backgroundColor: isDark ? 'rgba(26,16,48,0.55)' : 'rgba(255,255,255,0.55)',
              borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(124,58,237,0.18)',
            },
          ]}
        >
          {/* La "píldora" en sí: el color de fondo/borde cambia
              según `isDark` (proveniente de useTheme()), para verse bien
              en ambos temas. */}

          {/* Notificaciones */}
          <Pressable
            style={[styles.iconBtn, { width: iconBoxSize, height: iconBoxSize }]}
            onPress={tap(() => setNotifOpen(true))}
            hitSlop={6}
          >
            {/* onPress recibe la función que arma `tap(...)`: al tocar,
                vibra y luego abre la pantalla de notificaciones.
                hitSlop={6} agranda el área tocable 6px en cada dirección
                más allá del tamaño visual del botón (más fácil de tocar
                en pantallas pequeñas). */}
            <Ionicons name="notifications-outline" size={iconSize} color={colors.textPrimary} />
            {unread > 0 && (
              // "{condicion && <Componente/>}" es un patrón MUY común en
              // JSX para renderizado condicional: si `unread > 0` es
              // falso, JavaScript ni siquiera evalúa el lado derecho y no
              // se muestra nada; si es verdadero, se muestra el badge.
              <View style={[styles.badge, { backgroundColor: colors.error }]}>
                <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
                {/* Operador ternario: si hay más de 9 sin leer, muestra
                    "9+" en vez del número exacto (por espacio). */}
              </View>
            )}
          </Pressable>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Traducción */}
          <Pressable
            style={[styles.iconBtn, { width: iconBoxSize, height: iconBoxSize }]}
            onPress={tap(() => setLangOpen(v => !v))}
            hitSlop={6}
          >
            {/* setLangOpen(v => !v) alterna el estado (true↔false) usando
                la forma funcional del setter, igual patrón visto en
                ThemeContext.tsx. */}
            <Ionicons name="language-outline" size={iconSize} color={colors.textPrimary} />
          </Pressable>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Tema claro/oscuro — ícono compartido (ver ThemeToggleButton.tsx),
              el mismo que usan login, registro y el resto de dashboards. */}
          <Pressable
            style={[styles.iconBtn, { width: iconBoxSize, height: iconBoxSize }]}
            onPress={tap(toggleTheme)}
            hitSlop={6}
          >
            <ThemeToggleIcon size={iconSize} />
          </Pressable>
        </BlurView>

        {/* Menú de idioma — Español / Inglés. En `inline` se ancla como
            dropdown (`position: absolute`) para no empujar el resto de la
            cabecera del chat hacia abajo al abrirse. */}
        {langOpen && (
          <View
            style={[
              styles.langMenu,
              isInline && styles.langMenuInline,
              { backgroundColor: colors.backgroundCard, borderColor: colors.border },
            ]}
          >
            {LANGS.map(({ code, label }) => {
              // .map() sobre la lista fija LANGS: por cada idioma
              // disponible, dibuja una opción del menú. Este es el patrón
              // MÁS común en React Native para mostrar listas: convertir
              // un array de datos en un array de elementos JSX.
              const active = language === code;
              // ¿esta opción es el idioma actualmente activo?
              return (
                <TouchableOpacity
                  key={code}
                  // "key" es una prop OBLIGATORIA de React al renderizar
                  // listas con .map(): debe ser un valor único por cada
                  // elemento (aquí, el código de idioma), para que React
                  // pueda saber cuál es cuál al actualizar la lista de
                  // forma eficiente.
                  style={styles.langItem}
                  onPress={() => {
                    setLanguage(code);
                    setLangOpen(false);
                  }}
                >
                  <Ionicons
                    name={active ? 'checkmark-circle' : 'ellipse-outline'}
                    size={16}
                    color={active ? colors.primary : colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.langItemText,
                      { color: active ? colors.primary : colors.textPrimary },
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* ── Vista de notificaciones (pantalla completa con flecha de retorno) ── */}
      <Modal
        visible={notifOpen}
        animationType="slide"
        onRequestClose={() => setNotifOpen(false)}
        // onRequestClose se dispara con el botón "atrás" físico de
        // Android — hay que manejarlo para que ese botón también cierre
        // el modal correctamente.
      >
        <View style={[styles.notifScreen, { backgroundColor: colors.backgroundDark }]}>
          <View style={[styles.notifHeader, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setNotifOpen(false)} style={styles.backBtn} hitSlop={10}>
              <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.notifTitle, { color: colors.textPrimary }]}>
              {t('notifications')}
              {/* Texto de UI fijo, traducido con la clave 'notifications'
                  del sistema i18n estático (t(), ver TranslationContext.tsx). */}
            </Text>
            {unread > 0 ? (
              <TouchableOpacity onPress={markAllRead}>
                <Text style={[styles.markAll, { color: colors.primary }]}>{t('marcar_todas')}</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 80 }} />
              // Si no hay pendientes, se deja un espacio vacío del mismo
              // ancho que tendría el botón "Marcar todas" — así el título
              // central no se desplaza al aparecer/desaparecer ese botón.
            )}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {notifs.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="notifications-off-outline" size={48} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                  {t('sin_notificaciones')}
                </Text>
              </View>
            ) : (
              notifs.map(n => (
                // Recorre la lista de notificaciones (ya cargada en vivo
                // por el useEffect con onSnapshot) y dibuja una fila por
                // cada una.
                <TouchableOpacity
                  key={n.id}
                  style={[
                    styles.notifItem,
                    { borderBottomColor: colors.border },
                    !n.leida && { backgroundColor: colors.primary12 },
                    // Un TERCER estilo condicional dentro del array: si
                    // NO está leída, se le agrega un fondo violeta muy
                    // tenue para destacarla visualmente de las ya leídas.
                    // Si `!n.leida` fuera false, React Native ignora ese
                    // valor "false" dentro del array de estilos.
                  ]}
                  onPress={() => abrirNotif(n)}
                >
                  {!n.leida && <View style={[styles.dot, { backgroundColor: colors.primary }]} />}
                  {/* Un punto de color junto a las no leídas. */}
                  <View style={{ flex: 1 }}>
                    <AutoText style={[styles.itemTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                      {n.titulo}
                    </AutoText>
                    {/* Se usa <AutoText> (no <Text>) para el título y el
                        mensaje porque ESE contenido viene de la base de
                        datos (fue escrito por un humano al momento de
                        crear la notificación) y necesita traducción
                        dinámica si el usuario tiene el idioma en inglés —
                        a diferencia de "Notificaciones" o "Marcar todas",
                        que son texto FIJO de la interfaz y usan t(). */}
                    <AutoText style={[styles.itemMsg, { color: colors.textMuted }]} numberOfLines={2}>
                      {n.mensaje}
                    </AutoText>
                    <Text style={[styles.itemTime, { color: colors.textMuted }]}>
                      {new Date(n.created_at).toLocaleDateString(locale, {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                      {/* .toLocaleDateString(locale, opciones) formatea la
                          fecha usando las convenciones del idioma/región
                          activos (locale viene de useTranslationContext,
                          'es-SV' o 'en-US'), mostrando día, mes
                          abreviado, hora y minuto. */}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Modales de detalle abiertos desde una notificación ── */}
      <VacanteDetailByIdModal
        visible={!!vacanteModalId}
        // "!!vacanteModalId" convierte el string-o-null a booleano puro:
        // cualquier ID (texto no vacío) da `true`, `null` da `false`.
        vacanteId={vacanteModalId}
        onClose={() => setVacanteModalId(null)}
        // Al cerrar el modal, se resetea el estado a null (lo cual, por
        // el "!!" de arriba, automáticamente pone `visible` en false).
      />
      <GrupoDetailViewerModal
        visible={!!grupoModalId}
        grupoId={grupoModalId}
        onClose={() => setGrupoModalId(null)}
      />
      <AplicacionGrupoDetailModal
        visible={!!aplicacionModalId}
        aplicacionId={aplicacionModalId}
        onClose={() => setAplicacionModalId(null)}
      />
      <ReclamoDetailModal
        visible={!!reclamoModalId}
        reclamoId={reclamoModalId}
        onClose={() => setReclamoModalId(null)}
      />
      <ComprobanteInfoModal
        visible={!!comprobanteModalId}
        asignacionId={comprobanteModalId}
        onClose={() => setComprobanteModalId(null)}
      />
      <PostulacionRechazadaModal
        visible={!!postulacionRechazadaId}
        aplicacionId={postulacionRechazadaId}
        onClose={() => setPostulacionRechazadaId(null)}
      />
      <ContratoAvisoModal
        visible={!!contratoAvisoId}
        contratoId={contratoAvisoId}
        onClose={() => setContratoAvisoId(null)}
      />
    </>
  );
}

// ── ESTILOS ──────────────────────────────────────────────────────────
// StyleSheet.create({...}) define todos los estilos usados arriba, con
// nombres (wrap, pill, iconBtn...) que luego se referencian como
// styles.wrap, styles.pill, etc. Es el equivalente de una hoja de estilos
// CSS, pero escrita como objeto de JavaScript (las propiedades son muy
// parecidas a CSS: backgroundColor en vez de background-color, etc.,
// aunque con nombres en "camelCase" en vez de "kebab-case").
const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',   // saca este View del flujo normal de la pantalla
    right: 15,               // pegado a 15px del borde derecho
    zIndex: 50,               // se dibuja POR ENCIMA de casi todo lo demás
    alignItems: 'flex-end',  // alinea sus hijos (la píldora, el menú) a la derecha
  },
  // Variante `inline` (dentro de la cabecera de ChatThread): sin `position:
  // absolute` — ocupa su lugar normal en la fila, como cualquier otro ícono
  // de la barra. `position: relative` es lo que le permite al menú de idioma
  // (`langMenuInline`, más abajo) anclarse como dropdown SOBRE el resto de
  // la cabecera en vez de empujarla hacia abajo.
  inlineWrap: {
    position: 'relative',
  },
  langMenuInline: {
    position: 'absolute',
    top: '100%',
    right: 0,
    zIndex: 60,
  },
  pill: {
    flexDirection: 'row',     // acomoda los 3 botones en fila horizontal
    alignItems: 'center',
    height: 46,
    borderRadius: 23,          // la mitad de la altura → esquinas totalmente redondeadas (forma de píldora)
    paddingHorizontal: 6,
    overflow: 'hidden',         // recorta el BlurView a esta forma redondeada
    borderWidth: 1,
    ...shadow({ color: '#000', y: 2, blur: 10, opacity: 0.3, elevation: 8 }),
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: { width: 1, height: 22, opacity: 0.5 }, // línea vertical separadora entre íconos
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 8, fontFamily: FONTS.interSemiBold, color: '#fff' },
  langMenu: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 4,
    minWidth: 190,
    ...shadow({ color: '#000', y: 0, blur: 10, opacity: 0.25, elevation: 10 }),
  },
  langItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,                    // espacio entre el ícono y el texto
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  langItemText: { fontSize: 13, fontFamily: FONTS.interMedium },

  // Vista notificaciones
  notifScreen: { flex: 1 },   // ocupa toda la pantalla disponible
  notifHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  notifTitle: { flex: 1, fontSize: 18, fontFamily: FONTS.soraBold },
  markAll: { fontSize: 12, fontFamily: FONTS.interSemiBold, width: 80, textAlign: 'right' },
  empty: { alignItems: 'center', paddingVertical: 64, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: FONTS.interRegular },
  notifItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  itemTitle: { fontSize: 14, fontFamily: FONTS.interSemiBold, marginBottom: 2 },
  itemMsg: { fontSize: 12, fontFamily: FONTS.interRegular, lineHeight: 17, marginBottom: 4 },
  itemTime: { fontSize: 10, fontFamily: FONTS.interRegular },
});
