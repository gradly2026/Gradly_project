// ════════════════════════════════════════════════════════════════════════
// GUÍA PARA PRINCIPIANTES:
// El "_layout.tsx" de la carpeta app/(tabs)/ — envuelve las 5 pestañas del
// estudiante (Vacantes/Inicio, Progreso, Mi institución, Mensajes, Perfil) con
// una barra de navegación inferior PERSONALIZADA (no la barra estándar de
// React Navigation), además de varios elementos flotantes que deben verse
// en TODAS las pestañas: la barra superior (notificaciones/idioma/tema),
// el botón de búsqueda, y 2 "compuertas" (Gate) que pueden bloquear la
// pantalla con un formulario obligatorio.
// ════════════════════════════════════════════════════════════════════════

import { Tabs, useRouter } from 'expo-router';
// Tabs: el componente de navegación de Expo Router especializado en
// pestañas (a diferencia de Stack, que apila pantallas, Tabs las muestra
// una barra de accesos directos siempre visible).

import { useCallback, useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
// Tipo de las props que React Navigation le pasa a un componente de barra
// de pestañas PERSONALIZADO (como GlassTabBar, definido más abajo) — trae
// cosas como `state` (qué pestaña está activa) y `navigation` (funciones
// para cambiar de pestaña).

import FeedbackGate from '../../src/components/FeedbackGate';
// Componente que, si el estudiante tiene una pasantía recién finalizada
// sin calificar todavía, bloquea la pantalla con un formulario de
// feedback OBLIGATORIO antes de dejarlo seguir usando la app (ver memoria
// del proyecto "Gamificación + feedback").

import FloatingNavBar, { type NavItem } from '../../src/components/FloatingNavBar';
import DashboardTopBar from '../../src/components/DashboardTopBar';
// El componente visual real de la barra de pestañas flotante tipo
// "Liquid Glass" (el mismo estilo visual que FloatingTopBar).

import FloatingSearchButton from '../../src/components/FloatingSearchButton';
import AsistenteGradly from '../../src/components/AsistenteGradly';
import FloatingTopBar from '../../src/components/FloatingTopBar';
import SalirSesionModal from '../../src/components/SalirSesionModal';
import OnboardingDireccionGate from '../../src/components/OnboardingDireccionGate';
import DatosPersonalesGate from '../../src/components/DatosPersonalesGate';
import AvisosGate from '../../src/components/AvisosGate';
// Otra "compuerta": si al estudiante le falta completar su
// departamento/distrito (dirección), bloquea la pantalla con ese
// formulario obligatorio antes de dejarlo continuar.

import { OnboardingBubble, useOnboarding } from '../../src/components/OnboardingTour';
// El sistema de "guía de bienvenida" (tour por globos de diálogo) que se
// muestra la primera vez que un estudiante usa la app, explicando cada
// pestaña una por una.

import { useAuth } from '../../src/context/AuthContext';
import { useTranslation } from '../../src/context/TranslationContext';
import { useAuthGuard } from '../../src/hooks/useAuthGuard';
import { useAuthBackGuard } from '../../src/hooks/useSessionBackGuard';
// Hook propio que intercepta el botón "atrás" del sistema (sobre todo en
// Android) para evitar que el usuario logueado termine, sin querer,
// saliendo de la app o volviendo a una pantalla de login ya inválida.

import { subscribeUnreadTotal } from '../../src/services/chatService';
import { useChatPaneOpen } from '../../src/state/chatPaneOpen';
// Señal "hay un chat abierto en la pestaña Mensajes": mientras sea true, la
// píldora flotante de abajo se esconde (ChatThread ya trae la suya en su
// cabecera — mismo criterio que el dashboard de empresa).
// Función que se suscribe (en vivo, con onSnapshot por dentro) al total
// de mensajes SIN LEER de todos los chats del usuario, para mostrar ese
// número como "badge" sobre el ícono de la pestaña Mensajes.

// Rutas de las tabs en orden, mapeadas a los items del menú flotante
type TabKey = 'index' | 'progreso' | 'institucion' | 'mensajes' | 'perfil';
// Tipo que enumera las 5 pestañas válidas — coincide con los nombres de
// archivo dentro de app/(tabs)/ (index.tsx, progreso.tsx, etc.).

// La etiqueta se traduce en tiempo de render con t(labelKey).
const TAB_ITEMS: { key: TabKey; labelKey: string; icon: NavItem<TabKey>['icon'] }[] = [
  { key: 'index',     labelKey: 'tab_vacantes', icon: 'briefcase-outline' },
  { key: 'progreso',  labelKey: 'tab_progreso', icon: 'stats-chart-outline' },
  { key: 'institucion', labelKey: 'tab_institucion', icon: 'school-outline' },
  { key: 'mensajes',  labelKey: 'tab_mensajes', icon: 'chatbubble-ellipses-outline' },
  { key: 'perfil',    labelKey: 'tab_perfil',   icon: 'person-circle-outline' },
];
// Lista fija con la configuración de cada pestaña: su identificador
// interno (`key`), la CLAVE de traducción de su etiqueta (no el texto ya
// traducido — eso se resuelve después, con t(), dentro de GlassTabBar) y
// el nombre del ícono a mostrar.

// ── Onboarding (guía por globos) — mismo orden que TAB_ITEMS, terminando en
// 'perfil' (Mi Perfil es siempre la última parada del recorrido). Mismo
// componente compartido que ya usan dashboard-empresa.tsx/dashboard-universidad.tsx. ──
const TOUR_CLAVES: TabKey[] = ['index', 'progreso', 'institucion', 'mensajes', 'perfil'];
const TOUR_RUTAS: Record<TabKey, string> = {
  index:    '/(tabs)',
  progreso: '/(tabs)/progreso',
  institucion: '/(tabs)/institucion',
  mensajes: '/(tabs)/mensajes',
  perfil:   '/(tabs)/perfil',
};
// Diccionario que traduce cada `TabKey` a su ruta de navegación real —
// necesario porque el tour, al terminar de explicar una pestaña, tiene
// que NAVEGAR de verdad a la siguiente (ver handleTourContinuar más abajo).
const TOUR_PASOS: Record<TabKey, { titulo: string; texto: string }> = {
  index: {
    titulo: '¡Bienvenido a Gradly!',
    texto:
      'Aquí verás vacantes o pasantías según el momento de tu práctica: cupos asegurados por tu universidad, pasantías afines a tu carrera, o vacantes cuando ya te gradúes.',
  },
  progreso: {
    titulo: 'Mi Progreso',
    texto:
      'Sigue tus horas de práctica, tu pasantía activa y los cupos que tu universidad te asegure.',
  },
  institucion: {
    titulo: 'Mi institución',
    texto: 'Mira a qué universidad y grupo perteneces, en qué punto va tu período de prácticas y a quién escribirle en tu universidad.',
  },
  mensajes: {
    titulo: 'Mensajes',
    texto: 'Chatea con empresas y con tu universidad sobre tu práctica.',
  },
  perfil: {
    titulo: 'Mi Perfil',
    texto: 'Consulta tu certificación, tu CV, tus habilidades y ajusta tus preferencias. Si tienes dudas de cómo usar Gradly, toca la burbuja del Asistente Gradly que flota en tus pantallas.',
  },
};
// El TEXTO real (título + explicación) que se muestra en cada "parada"
// del tour de bienvenida, uno por pestaña.

// Barra inferior personalizada — usa el FloatingNavBar (Liquid Glass)
function GlassTabBar({
  state,
  navigation,
  items,
  onActiveKeyChange,
  chatPaneOpen,
  isWide,
}: BottomTabBarProps & { items: NavItem<TabKey>[]; onActiveKeyChange: (key: TabKey) => void; chatPaneOpen: boolean; isWide: boolean }) {
  // GlassTabBar es un COMPONENTE PERSONALIZADO que React Navigation usa
  // EN VEZ de su barra de pestañas por defecto (ver la prop `tabBar` del
  // componente <Tabs> más abajo). Recibe las props estándar de React
  // Navigation (`state`, `navigation`, ...) MÁS varias props propias del
  // proyecto, combinadas con el tipo "&" (intersección) que ya vimos en
  // pasantiaService.ts. `items` ya viene armado desde TabLayout (con sus
  // etiquetas traducidas) — así el mismo array sirve también para
  // DashboardTopBar (laptop/tablet), sin construirlo dos veces.
  const activeKey = state.routes[state.index]?.name as TabKey;
  // `state.index` es la posición de la pestaña ACTUALMENTE activa dentro
  // de `state.routes` (la lista de todas las pestañas); de ahí se extrae
  // su `name`, que coincide con nuestro `TabKey`.

  // Reporta la pestaña activa hacia TabLayout (para el tour) — vía efecto,
  // no durante el render, para no actualizar estado de otro componente a
  // mitad de un render.
  useEffect(() => { onActiveKeyChange(activeKey); }, [activeKey, onActiveKeyChange]);
  // Cada vez que cambia la pestaña activa, este efecto avisa al
  // componente PADRE (TabLayout, más abajo) llamando a la función que
  // recibió como prop `onActiveKeyChange`. El comentario explica una
  // sutileza importante de React: nunca se debe llamar a un `setState`
  // de OTRO componente directamente durante el render — hacerlo dentro de
  // un useEffect asegura que ocurra DESPUÉS de que este componente ya
  // terminó de dibujarse.

  const handleChange = (key: TabKey) => {
    // Se ejecuta cuando el usuario TOCA una pestaña en la barra visual.
    const route = state.routes.find(r => r.name === key);
    if (!route) return;
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    // Emite el evento ESTÁNDAR de React Navigation "se tocó esta
    // pestaña" — esto existe para que otros mecanismos internos de
    // navegación (como "si tocas de nuevo la pestaña activa, vuelve
    // arriba del todo") sigan funcionando igual que con la barra nativa,
    // aunque se esté usando un componente visual propio.
    if (!event.defaultPrevented) {
      navigation.navigate(route.name);
      // Si nada canceló el evento, se navega de verdad a esa pestaña.
    }
  };

  // En laptop/tablet la navegación ya vive arriba, siempre visible
  // (DashboardTopBar) — este menú inferior queda oculto del todo para no
  // duplicarla. En angosto se queda visible en la pestaña "Mensajes"
  // mientras se ve la bandeja de chats (para poder salir sin necesitar una
  // flecha aparte); solo se oculta con una conversación ABIERTA, para que
  // se vea limpia sin el menú superpuesto.
  if (isWide) return null;
  if (activeKey === 'mensajes' && chatPaneOpen) return null;

  return <FloatingNavBar items={items} activeKey={activeKey} onChange={handleChange} />;
}

export default function TabLayout() {
  const { user, userProfile } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  // Red de seguridad: si por lo que sea esta pantalla llegara a mostrarse
  // sin sesión (p. ej. tras un "atrás" que quedara detrás de un cierre de
  // sesión), redirige a login de inmediato — mismo hook que ya usan los
  // otros 3 paneles (empresa/universidad/admin). El grupo (tabs) es la
  // experiencia del ESTUDIANTE: si una empresa/universidad/admin llega
  // aquí escribiendo la URL a mano (gradly.website/dashboard-estudiante,
  // /perfil, /progreso...), `useAuthGuard('estudiante')` la devuelve a su
  // propio dashboard en cuanto el rol resuelve, sin llegar a mostrar la UI
  // de estudiante. Con rol aún desconocido NO redirige (espera), igual que
  // el resto de guardias.
  useAuthGuard('estudiante');
  // Las pestañas ya sincronizan su propia URL (expo-router), así que aquí
  // NO se le pasa `section` al guard (eso es solo para los dashboards, cuyo
  // cambio de sección es estado local puro sin historial propio) — evita
  // que el guard duplique entradas de historial peleando con esa
  // sincronización nativa. Sigue mostrando el modal de cierre de sesión al
  // agotar el "atrás", solo que sin recorrer pestañas primero.
  const { showLogoutConfirm, confirmLogout, cancelLogout } = useAuthBackGuard();
  const [mensajesNoLeidos, setMensajesNoLeidos] = useState(0);
  const [activeKey, setActiveKey] = useState<TabKey>('index');
  const chatPaneOpen = useChatPaneOpen();
  // La pestaña Mensajes ahora usa el master-detail (SeccionMensajes): oculta
  // el buscador flotante en esa pestaña (como el dashboard de empresa) y la
  // píldora flotante superior mientras haya un chat abierto.
  const enMensajes = activeKey === 'mensajes';
  // Aquí, en el componente PADRE, se guarda cuál es la pestaña activa
  // (actualizada por GlassTabBar vía onActiveKeyChange) — se necesita
  // arriba, en este nivel, porque el tour de bienvenida (más abajo)
  // también depende de saber en qué pestaña está el usuario ahora.

  // Laptop/tablet (>=768): la navegación vive arriba, siempre visible
  // (DashboardTopBar) — el menú inferior flotante (GlassTabBar) queda
  // reservado para pantallas angostas, como ya era.
  const { width: anchoVentana } = useWindowDimensions();
  const isWide = anchoVentana >= 768;

  // Mismos `items` para DashboardTopBar (arriba, ancho) y GlassTabBar
  // (abajo, angosto) — un solo array, para no construirlo dos veces ni
  // arriesgar que se desincronicen sus iconos/etiquetas.
  const items: NavItem<TabKey>[] = TAB_ITEMS.map(it => ({
    key: it.key,
    icon: it.icon,
    label: t(it.labelKey),
    badge: it.key === 'mensajes' ? mensajesNoLeidos : undefined,
  }));

  // "Hola, {nombre}" — mismo cálculo que ya usaba app/(tabs)/index.tsx en
  // su feed; ahora vive en la cabecera persistente, visible en las 5
  // pestañas, así que se quitó de ahí para no repetirlo.
  const primerNombre = (userProfile as any)?.nombre_completo?.split(' ')[0] ?? t('feed_estudiante');
  const saludo = t('feed_saludo', { nombre: primerNombre });

  // Badge: total de mensajes no leídos del usuario
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeUnreadTotal(user.uid, setMensajesNoLeidos);
    return unsub;
  }, [user?.uid]);

  // ── Onboarding: bienvenida en el primer login, con avance automático de
  // pestaña en pestaña al pulsar "Continuar" (no depende de que el usuario
  // toque el menú por su cuenta). ──
  const tour = useOnboarding(user?.uid, activeKey, TOUR_CLAVES);
  // Hook propio que maneja TODO el estado del tour (en qué paso va, si ya
  // se completó antes para este usuario, etc.) — ver
  // src/components/OnboardingTour.tsx si quieres profundizar.
  const handleTourContinuar = useCallback(async () => {
    const idxActual = TOUR_CLAVES.indexOf(activeKey);
    const siguiente = !tour.esUltimo ? TOUR_CLAVES[idxActual + 1] : undefined;
    // Calcula cuál es la SIGUIENTE pestaña del recorrido, a menos que la
    // actual ya sea la última (tour.esUltimo === true).
    await tour.marcar();
    // Registra en el hook (y probablemente en Firestore, por dentro del
    // hook) que este paso del tour ya se mostró.
    if (siguiente) router.push(TOUR_RUTAS[siguiente] as any);
    // Si hay una siguiente parada, NAVEGA automáticamente a esa pestaña —
    // así el usuario no tiene que ir tocando cada pestaña por su cuenta
    // durante el recorrido guiado.
  }, [activeKey, tour, router]);

  return (
    <>
      {/* Cabecera de marca (logo Gradly + "Gradly"): reemplaza cualquier
          identificación de institución que hubiera antes en esta pantalla y,
          en laptop/tablet, agrega el menú de secciones siempre visible en
          fila (DashboardTopBar) — el saludo va siempre debajo, en las 5
          pestañas. En angosto se oculta entero en "Mensajes" porque
          InboxList ya dibuja su propio título "Mensajes" ahí abajo; en
          ancho se queda SIEMPRE visible (también en "Mensajes"), porque ahí
          es la única navegación que queda — GlassTabBar se oculta del todo
          en ese ancho. */}
      {(activeKey !== 'mensajes' || isWide) && (
        <DashboardTopBar
          items={items}
          activeKey={activeKey}
          onChange={(k) => router.navigate(TOUR_RUTAS[k] as any)}
          isWide={isWide}
          greeting={saludo}
          userId={user?.uid}
        />
      )}
      <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{ headerShown: false }}
        // backBehavior="history": el botón/gesto "atrás" NATIVO (Android
        // físico, deslizar en iOS) recorre las pestañas en el orden REAL en
        // que el usuario las visitó (Inicio → Progreso → Mensajes → "atrás"
        // → Progreso → "atrás" → Inicio...), no simplemente "saltar a la
        // primera". Al agotar ese recorrido, ya no queda nada que la
        // barra de pestañas pueda deshacer, así que el sistema operativo
        // sigue con su comportamiento por defecto (salir/minimizar la app)
        // — igual que el resto del recorrido nativo (ver
        // useBackNavigationGuard.ts). En web esto no cambia nada de la
        // protección: ese guard nunca deja salir del panel salvo por el
        // botón "Cerrar sesión".
        backBehavior="history"
        tabBar={props => (
          // La prop `tabBar` reemplaza COMPLETAMENTE la barra de pestañas
          // por defecto de React Navigation por nuestro componente
          // GlassTabBar, pasándole tanto las props estándar (`...props`)
          // como las 3 propias del proyecto.
          <GlassTabBar
            {...props}
            items={items}
            onActiveKeyChange={setActiveKey}
            chatPaneOpen={chatPaneOpen}
            isWide={isWide}
          />
        )}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="progreso" />
        <Tabs.Screen name="institucion" />
        <Tabs.Screen name="mensajes" />
        <Tabs.Screen name="perfil" />
      </Tabs>
      </View>

      {/* Botones flotantes superiores (notificaciones · idioma · tema).
          Ocultos en TODA la pestaña "Mensajes" (a nivel de bandeja ahora los
          dibuja InboxList en su propia cabecera, y con un chat abierto los
          dibuja ChatThread en la suya) y ocultos en ancho: ahí esos mismos 3
          botones ya van DENTRO de DashboardTopBar, en su misma fila. En otra
          pestaña angosta siguen visibles aunque SeccionMensajes quede
          montada de fondo (las tabs no se desmontan al cambiar). */}
      {!enMensajes && !isWide && <FloatingTopBar userId={user?.uid} />}
      {/* Al estar aquí, FUERA de <Tabs> pero dentro del mismo Fragment,
          esta barra flota SOBRE cualquiera de las 5 pestañas, sin tener
          que repetirla dentro de cada archivo individual. */}

      {/* Botón flotante de búsqueda global — oculto en la pestaña Mensajes,
          que ya tiene su propio buscador dentro de la lista de chats. */}
      {!enMensajes && <FloatingSearchButton />}

      {/* Asistente Gradly (bot de ayuda) — apilado encima del botón de búsqueda. */}
      {!enMensajes && <AsistenteGradly />}

      {/* Formulario obligatorio de experiencia (pasantías finalizadas) */}
      <FeedbackGate />

      {/* Compuerta obligatoria: departamento/distrito + teléfono + documento
          si el perfil no los tiene */}
      <OnboardingDireccionGate />

      {/* Recordatorio (una vez) de teléfono/documento para quien ya pasó el
          onboarding de dirección pero le faltan esos datos */}
      <DatosPersonalesGate />

      {/* Aviso al iniciar sesión: cupos que la universidad reservó para el estudiante */}
      <AvisosGate />

      {/* Recorrido de bienvenida (primer login) */}
      <OnboardingBubble
        visible={tour.visible}
        titulo={TOUR_PASOS[activeKey].titulo}
        texto={TOUR_PASOS[activeKey].texto}
        paso={tour.paso}
        total={tour.total}
        esUltimo={tour.esUltimo}
        onContinuar={handleTourContinuar}
        onSaltar={tour.saltar}
      />

      {/* Confirmación de cierre de sesión al agotar el "atrás" del
          navegador (ver useAuthBackGuard más arriba). */}
      <SalirSesionModal
        visible={showLogoutConfirm}
        onConfirm={confirmLogout}
        onCancel={cancelLogout}
      />
    </>
  );
}
