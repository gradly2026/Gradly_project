import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import FeedbackGate from '../../src/components/FeedbackGate';
import FloatingNavBar, { type NavItem } from '../../src/components/FloatingNavBar';
import FloatingSearchButton from '../../src/components/FloatingSearchButton';
import FloatingTopBar from '../../src/components/FloatingTopBar';
import OnboardingDireccionGate from '../../src/components/OnboardingDireccionGate';
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

// Barra inferior personalizada — usa el FloatingNavBar (Liquid Glass)
function GlassTabBar({ state, navigation, vacantesBadge, mensajesBadge }: BottomTabBarProps & { vacantesBadge: number; mensajesBadge: number }) {
  const { t } = useTranslation();
  const activeKey = state.routes[state.index]?.name as TabKey;

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
  const [nuevasVacantes, setNuevasVacantes] = useState(0);
  const [mensajesNoLeidos, setMensajesNoLeidos] = useState(0);

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

  return (
    <>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={props => <GlassTabBar {...props} vacantesBadge={nuevasVacantes} mensajesBadge={mensajesNoLeidos} />}
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
    </>
  );
}
