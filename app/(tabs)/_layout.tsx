// ════════════════════════════════════════════════════════════════════════
// GUÍA PARA PRINCIPIANTES:
// El "_layout.tsx" de la carpeta app/(tabs)/ — envuelve las 5 pestañas del
// estudiante (Vacantes/Inicio, Progreso, Academia, Mensajes, Perfil) con
// una barra de navegación inferior PERSONALIZADA (no la barra estándar de
// React Navigation), además de varios elementos flotantes que deben verse
// en TODAS las pestañas: la barra superior (notificaciones/idioma/tema),
// el botón de búsqueda, y 2 "compuertas" (Gate) que pueden bloquear la
// pantalla con un formulario obligatorio.
// ════════════════════════════════════════════════════════════════════════

import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Tabs, useRouter } from 'expo-router';
// Tabs: el componente de navegación de Expo Router especializado en
// pestañas (a diferencia de Stack, que apila pantallas, Tabs las muestra
// una barra de accesos directos siempre visible).

import { useCallback, useEffect, useState } from 'react';
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
// El componente visual real de la barra de pestañas flotante tipo
// "Liquid Glass" (el mismo estilo visual que FloatingTopBar).

import FloatingSearchButton from '../../src/components/FloatingSearchButton';
import FloatingTopBar from '../../src/components/FloatingTopBar';
import OnboardingDireccionGate from '../../src/components/OnboardingDireccionGate';
// Otra "compuerta": si al estudiante le falta completar su
// departamento/distrito (dirección), bloquea la pantalla con ese
// formulario obligatorio antes de dejarlo continuar.

import { OnboardingBubble, useOnboarding } from '../../src/components/OnboardingTour';
// El sistema de "guía de bienvenida" (tour por globos de diálogo) que se
// muestra la primera vez que un estudiante usa la app, explicando cada
// pestaña una por una.

import { useAuth } from '../../src/context/AuthContext';
import { useTranslation } from '../../src/context/TranslationContext';
import { useAuthBackGuard } from '../../src/hooks/useSessionBackGuard';
// Hook propio que intercepta el botón "atrás" del sistema (sobre todo en
// Android) para evitar que el usuario logueado termine, sin querer,
// saliendo de la app o volviendo a una pantalla de login ya inválida.

import { db } from '../../src/config/firebaseConfig';
import { subscribeUnreadTotal } from '../../src/services/chatService';
// Función que se suscribe (en vivo, con onSnapshot por dentro) al total
// de mensajes SIN LEER de todos los chats del usuario, para mostrar ese
// número como "badge" sobre el ícono de la pestaña Mensajes.

// Rutas de las tabs en orden, mapeadas a los items del menú flotante
type TabKey = 'index' | 'progreso' | 'academia' | 'mensajes' | 'perfil';
// Tipo que enumera las 5 pestañas válidas — coincide con los nombres de
// archivo dentro de app/(tabs)/ (index.tsx, progreso.tsx, etc.).

// La etiqueta se traduce en tiempo de render con t(labelKey).
const TAB_ITEMS: { key: TabKey; labelKey: string; icon: NavItem<TabKey>['icon'] }[] = [
  { key: 'index',     labelKey: 'tab_vacantes', icon: 'briefcase-outline' },
  { key: 'progreso',  labelKey: 'tab_progreso', icon: 'stats-chart-outline' },
  { key: 'academia',  labelKey: 'tab_academia', icon: 'school-outline' },
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
const TOUR_CLAVES: TabKey[] = ['index', 'progreso', 'academia', 'mensajes', 'perfil'];
const TOUR_RUTAS: Record<TabKey, string> = {
  index:    '/(tabs)',
  progreso: '/(tabs)/progreso',
  academia: '/(tabs)/academia',
  mensajes: '/(tabs)/mensajes',
  perfil:   '/(tabs)/perfil',
};
// Diccionario que traduce cada `TabKey` a su ruta de navegación real —
// necesario porque el tour, al terminar de explicar una pestaña, tiene
// que NAVEGAR de verdad a la siguiente (ver handleTourContinuar más abajo).
const TOUR_PASOS: Record<TabKey, { titulo: string; texto: string }> = {
  index: {
    titulo: '¡Bienvenido a Gradly! 🎓',
    texto:
      'Aquí verás vacantes o pasantías según el momento de tu práctica: cupos asegurados por tu universidad, pasantías afines a tu carrera, o vacantes cuando ya te gradúes.',
  },
  progreso: {
    titulo: 'Mi Progreso',
    texto:
      'Sigue tus horas de práctica, tu pasantía activa y los cupos que tu universidad te asegure.',
  },
  academia: {
    titulo: 'Academia',
    texto: 'Cursos recomendados, guías rápidas y tips para tu desarrollo profesional.',
  },
  mensajes: {
    titulo: 'Mensajes',
    texto: 'Chatea con empresas y con tu universidad sobre tu práctica.',
  },
  perfil: {
    titulo: 'Mi Perfil',
    texto: 'Consulta tu certificación, tu CV, tus habilidades y ajusta tus preferencias.',
  },
};
// El TEXTO real (título + explicación) que se muestra en cada "parada"
// del tour de bienvenida, uno por pestaña.

// Barra inferior personalizada — usa el FloatingNavBar (Liquid Glass)
function GlassTabBar({
  state,
  navigation,
  vacantesBadge,
  mensajesBadge,
  onActiveKeyChange,
}: BottomTabBarProps & { vacantesBadge: number; mensajesBadge: number; onActiveKeyChange: (key: TabKey) => void }) {
  // GlassTabBar es un COMPONENTE PERSONALIZADO que React Navigation usa
  // EN VEZ de su barra de pestañas por defecto (ver la prop `tabBar` del
  // componente <Tabs> más abajo). Recibe las props estándar de React
  // Navigation (`state`, `navigation`, ...) MÁS 3 props propias del
  // proyecto, combinadas con el tipo "&" (intersección) que ya vimos en
  // pasantiaService.ts.
  const { t } = useTranslation();
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

  const items: NavItem<TabKey>[] = TAB_ITEMS.map(it => ({
    key: it.key,
    icon: it.icon,
    label: t(it.labelKey),
    // Aquí es donde la CLAVE de traducción (labelKey) se convierte
    // finalmente en el TEXTO real, usando t() — recalculado en cada
    // render, así que si el usuario cambia de idioma, las etiquetas de
    // las pestañas cambian solas.
    badge:
      it.key === 'index'
        ? vacantesBadge
        : it.key === 'mensajes'
          ? mensajesBadge
          : undefined,
    // Solo 2 de las 5 pestañas muestran un número de "badge" (vacantes
    // nuevas, mensajes sin leer) — las demás no tienen badge
    // (`undefined`). Es un ternario ANIDADO: primero pregunta si es
    // 'index', si no, pregunta si es 'mensajes', si tampoco, `undefined`.
  }));

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

  return <FloatingNavBar items={items} activeKey={activeKey} onChange={handleChange} />;
}

export default function TabLayout() {
  const { user } = useAuth();
  const router = useRouter();
  useAuthBackGuard();
  const [nuevasVacantes, setNuevasVacantes] = useState(0);
  const [mensajesNoLeidos, setMensajesNoLeidos] = useState(0);
  const [activeKey, setActiveKey] = useState<TabKey>('index');
  // Aquí, en el componente PADRE, se guarda cuál es la pestaña activa
  // (actualizada por GlassTabBar vía onActiveKeyChange) — se necesita
  // arriba, en este nivel, porque el tour de bienvenida (más abajo)
  // también depende de saber en qué pestaña está el usuario ahora.

  // Badge: cuenta vacantes activas (solo con sesión activa)
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'vacantes'), where('activa', '==', true));
    const unsub = onSnapshot(q, snap => setNuevasVacantes(snap.size));
    // READ en vivo: cuenta cuántas vacantes están activas en TODA la
    // plataforma (snap.size = cantidad de documentos que cumplen la
    // consulta) y lo muestra como badge en la pestaña "Vacantes".
    return unsub;
  }, [user]);

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
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={props => (
          // La prop `tabBar` reemplaza COMPLETAMENTE la barra de pestañas
          // por defecto de React Navigation por nuestro componente
          // GlassTabBar, pasándole tanto las props estándar (`...props`)
          // como las 3 propias del proyecto.
          <GlassTabBar
            {...props}
            vacantesBadge={nuevasVacantes}
            mensajesBadge={mensajesNoLeidos}
            onActiveKeyChange={setActiveKey}
          />
        )}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="progreso" />
        <Tabs.Screen name="academia" />
        <Tabs.Screen name="mensajes" />
        <Tabs.Screen name="perfil" />
      </Tabs>

      {/* Botones flotantes superiores (notificaciones · idioma · tema) */}
      <FloatingTopBar userId={user?.uid} />
      {/* Al estar aquí, FUERA de <Tabs> pero dentro del mismo Fragment,
          esta barra flota SOBRE cualquiera de las 5 pestañas, sin tener
          que repetirla dentro de cada archivo individual. */}

      {/* Botón flotante de búsqueda global */}
      <FloatingSearchButton />

      {/* Formulario obligatorio de experiencia (pasantías finalizadas) */}
      <FeedbackGate />

      {/* Compuerta obligatoria: departamento/distrito si el perfil no los tiene */}
      <OnboardingDireccionGate />

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
    </>
  );
}
