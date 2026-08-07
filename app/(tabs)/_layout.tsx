import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Tabs, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import FeedbackGate from '../../src/components/FeedbackGate';
import FloatingNavBar, { type NavItem } from '../../src/components/FloatingNavBar';
import FloatingSearchButton from '../../src/components/FloatingSearchButton';
import FloatingTopBar from '../../src/components/FloatingTopBar';
import OnboardingDireccionGate from '../../src/components/OnboardingDireccionGate';
import { OnboardingBubble, useOnboarding } from '../../src/components/OnboardingTour';
import { useAuth } from '../../src/context/AuthContext';
import { useTranslation } from '../../src/context/TranslationContext';
import { db } from '../../src/config/firebaseConfig';
import { subscribeUnreadTotal } from '../../src/services/chatService';

// Rutas de las tabs en orden, mapeadas a los items del menú flotante
type TabKey = 'index' | 'progreso' | 'academia' | 'mensajes' | 'perfil';

// La etiqueta se traduce en tiempo de render con t(labelKey).
const TAB_ITEMS: { key: TabKey; labelKey: string; icon: NavItem<TabKey>['icon'] }[] = [
  { key: 'index',     labelKey: 'tab_vacantes', icon: 'briefcase-outline' },
  { key: 'progreso',  labelKey: 'tab_progreso', icon: 'stats-chart-outline' },
  { key: 'academia',  labelKey: 'tab_academia', icon: 'school-outline' },
  { key: 'mensajes',  labelKey: 'tab_mensajes', icon: 'chatbubble-ellipses-outline' },
  { key: 'perfil',    labelKey: 'tab_perfil',   icon: 'person-circle-outline' },
];

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

// Barra inferior personalizada — usa el FloatingNavBar (Liquid Glass)
function GlassTabBar({
  state,
  navigation,
  vacantesBadge,
  mensajesBadge,
  onActiveKeyChange,
}: BottomTabBarProps & { vacantesBadge: number; mensajesBadge: number; onActiveKeyChange: (key: TabKey) => void }) {
  const { t } = useTranslation();
  const activeKey = state.routes[state.index]?.name as TabKey;

  // Reporta la pestaña activa hacia TabLayout (para el tour) — vía efecto,
  // no durante el render, para no actualizar estado de otro componente a
  // mitad de un render.
  useEffect(() => { onActiveKeyChange(activeKey); }, [activeKey, onActiveKeyChange]);

  const items: NavItem<TabKey>[] = TAB_ITEMS.map(it => ({
    key: it.key,
    icon: it.icon,
    label: t(it.labelKey),
    badge:
      it.key === 'index'
        ? vacantesBadge
        : it.key === 'mensajes'
          ? mensajesBadge
          : undefined,
  }));

  const handleChange = (key: TabKey) => {
    const route = state.routes.find(r => r.name === key);
    if (!route) return;
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!event.defaultPrevented) {
      navigation.navigate(route.name);
    }
  };

  return <FloatingNavBar items={items} activeKey={activeKey} onChange={handleChange} />;
}

export default function TabLayout() {
  const { user } = useAuth();
  const router = useRouter();
  const [nuevasVacantes, setNuevasVacantes] = useState(0);
  const [mensajesNoLeidos, setMensajesNoLeidos] = useState(0);
  const [activeKey, setActiveKey] = useState<TabKey>('index');

  // Badge: cuenta vacantes activas (solo con sesión activa)
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'vacantes'), where('activa', '==', true));
    const unsub = onSnapshot(q, snap => setNuevasVacantes(snap.size));
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
  const handleTourContinuar = useCallback(async () => {
    const idxActual = TOUR_CLAVES.indexOf(activeKey);
    const siguiente = !tour.esUltimo ? TOUR_CLAVES[idxActual + 1] : undefined;
    await tour.marcar();
    if (siguiente) router.push(TOUR_RUTAS[siguiente] as any);
  }, [activeKey, tour, router]);

  return (
    <>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={props => (
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

      {/* Botón flotante de búsqueda global */}
      <FloatingSearchButton />

      {/* Formulario obligatorio de experiencia (pasantías finalizadas) */}
      <FeedbackGate />

      {/* Compuerta obligatoria: departamento/municipio si el perfil no los tiene */}
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
