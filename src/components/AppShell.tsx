// ════════════════════════════════════════════════════════════════════════
// AppShell — armazón de laptop/tablet para los dashboards: barra lateral
// (completa con etiquetas en pantallas grandes, riel de íconos en tablet) y
// barra superior (título de la sección, buscador y los 3 botones de
// notificaciones/idioma/tema).
//
// En pantallas angostas (celular/app) NO dibuja nada: devuelve los hijos tal
// cual, así lo que ya existe allá (cabecera, menú inferior flotante) queda
// exactamente como estaba. Lo decide `useShellMode()`, que cada dashboard usa
// también para ocultar sus piezas viejas cuando el armazón está activo.
//
// Usa el MISMO arreglo `items` (con los mismos íconos y etiquetas) que ya
// recibe FloatingNavBar — nunca se duplica esa lista.
// ════════════════════════════════════════════════════════════════════════
import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { AutoText, useAutoText } from './AutoText';
import type { NavItem } from './FloatingNavBar';
import FloatingTopBar from './FloatingTopBar';
import GlobalSearchOverlay from './GlobalSearchOverlay';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';

const LOGO = require('../../assets/images/LogoGradlyRecorte.png');

export type ShellMode = 'none' | 'rail' | 'full';

/** `none` = celular/app, `rail` = tablet (riel de íconos), `full` = laptop/escritorio. */
export function useShellMode(): ShellMode {
  const { width } = useWindowDimensions();
  if (width >= 1200) return 'full';
  if (width >= 768) return 'rail';
  return 'none';
}

interface AppShellProps<K extends string = string> {
  mode: ShellMode;
  items: NavItem<K>[];
  activeKey: K;
  onChange: (key: K) => void;
  userId?: string | null;
  userName: string;
  userSubtitle?: string;
  /** Avatar de la tarjeta de usuario (abajo en la barra lateral). */
  userAvatar?: ReactNode;
  onUserPress?: () => void;
  /** Si se pasa, la barra superior muestra un buscador que abre el buscador global. */
  searchPlaceholder?: string;
  children: ReactNode;
}

export default function AppShell<K extends string = string>({
  mode,
  items,
  activeKey,
  onChange,
  userId,
  userName,
  userSubtitle,
  userAvatar,
  onUserPress,
  searchPlaceholder,
  children,
}: AppShellProps<K>) {
  const { colors } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const activeLabel = useAutoText(items.find(i => i.key === activeKey)?.label ?? '');
  const searchLabel = useAutoText(searchPlaceholder ?? '');

  if (mode === 'none') return <>{children}</>;

  const full = mode === 'full';
  const s = makeStyles(colors, full);

  return (
    <View style={s.row}>
      <View style={s.side}>
        <View style={s.brand}>
          <Image source={LOGO} style={s.logo} resizeMode="contain" />
          {full && <AutoText style={s.word} noTranslate>Gradly</AutoText>}
        </View>

        <ScrollView style={s.navScroll} contentContainerStyle={s.navList} showsVerticalScrollIndicator={false}>
          {items.map(it => (
            <SideItem
              key={it.key}
              item={it}
              active={it.key === activeKey}
              full={full}
              onPress={() => onChange(it.key)}
              colors={colors}
              s={s}
            />
          ))}
        </ScrollView>

        <Pressable onPress={onUserPress} disabled={!onUserPress} style={s.user}>
          {userAvatar}
          {full && (
            <View style={s.userTxt}>
              <AutoText style={s.userName} numberOfLines={1} noTranslate>{userName}</AutoText>
              {userSubtitle ? <AutoText style={s.userSub} numberOfLines={1} noTranslate>{userSubtitle}</AutoText> : null}
            </View>
          )}
        </Pressable>
      </View>

      <View style={s.col}>
        <View style={s.top}>
          <Text style={s.title} numberOfLines={1}>{activeLabel}</Text>
          {searchPlaceholder ? (
            <Pressable style={s.search} onPress={() => setSearchOpen(true)} accessibilityLabel={searchLabel}>
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <Text style={s.searchTxt} numberOfLines={1}>{searchLabel}</Text>
            </Pressable>
          ) : null}
          <View style={s.topRight}>
            <FloatingTopBar userId={userId} variant="inline" />
          </View>
        </View>
        {children}
      </View>

      {searchPlaceholder ? <GlobalSearchOverlay visible={searchOpen} onClose={() => setSearchOpen(false)} /> : null}
    </View>
  );
}

function SideItem<K extends string>({
  item,
  active,
  full,
  onPress,
  colors,
  s,
}: {
  item: NavItem<K>;
  active: boolean;
  full: boolean;
  onPress: () => void;
  colors: GradlyColors;
  s: ReturnType<typeof makeStyles>;
}) {
  // Ya viene traducida: se pinta con <Text> normal para no traducirla dos veces.
  const label = useAutoText(item.label);
  const tooltip = Platform.OS === 'web' ? ({ title: label } as any) : null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={({ hovered }: any) => [s.item, active && s.itemActive, !active && hovered && s.itemHover]}
      {...tooltip}
    >
      <Ionicons name={item.icon} size={22} color={active ? colors.primaryLight : colors.textMuted} />
      {full && (
        <Text style={[s.itemTxt, { color: active ? colors.primaryLight : colors.textMuted }]} numberOfLines={1}>
          {label}
        </Text>
      )}
      {!!item.badge && item.badge > 0 && (
        <View style={[s.badge, full ? s.badgeFull : s.badgeRail]}>
          <Text style={s.badgeTxt}>{item.badge > 99 ? '99+' : item.badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

const makeStyles = (C: GradlyColors, full: boolean) =>
  StyleSheet.create({
    row: { flex: 1, flexDirection: 'row' },
    side: {
      width: full ? 252 : 84,
      backgroundColor: C.backgroundCard,
      borderRightWidth: 1, borderRightColor: C.border,
      paddingTop: Platform.OS === 'web' ? 20 : 40, paddingBottom: 16,
      paddingHorizontal: full ? 14 : 10,
    },
    brand: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      justifyContent: full ? 'flex-start' : 'center',
      paddingHorizontal: full ? 8 : 0, paddingBottom: 20,
    },
    logo: { width: 44, height: 52 },
    word: { fontSize: 24, fontFamily: FONTS.soraBold, color: C.textPrimary },
    navScroll: { flex: 1 },
    navList: { gap: 4 },
    item: {
      flexDirection: 'row', alignItems: 'center', gap: 13,
      justifyContent: full ? 'flex-start' : 'center',
      paddingVertical: 13, paddingHorizontal: full ? 14 : 0,
      borderRadius: 14, borderWidth: 1, borderColor: 'transparent',
    },
    itemActive: { backgroundColor: C.primary20, borderColor: C.primary35 },
    itemHover: { backgroundColor: C.primary12 },
    itemTxt: { fontSize: 14, fontFamily: FONTS.interSemiBold, flexShrink: 1 },
    badge: { backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
    badgeFull: { marginLeft: 'auto', minWidth: 20, height: 20, borderRadius: 10 },
    badgeRail: { position: 'absolute', top: 5, right: 12, minWidth: 18, height: 18, borderRadius: 9 },
    badgeTxt: { color: '#fff', fontSize: 10.5, fontFamily: FONTS.interSemiBold },
    user: {
      flexDirection: 'row', alignItems: 'center', gap: 11,
      justifyContent: full ? 'flex-start' : 'center',
      padding: full ? 10 : 6, borderRadius: 16,
      borderWidth: full ? 1 : 0, borderColor: C.border,
      backgroundColor: full ? C.backgroundSurface : 'transparent',
    },
    userTxt: { flex: 1, minWidth: 0 },
    userName: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: C.textPrimary },
    userSub: { fontSize: 12, fontFamily: FONTS.interRegular, color: C.textMuted, marginTop: 1 },
    col: { flex: 1, minWidth: 0 },
    top: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      paddingHorizontal: full ? 28 : 20,
      paddingTop: Platform.OS === 'web' ? 14 : 36, paddingBottom: 14,
      borderBottomWidth: 1, borderBottomColor: C.border,
      // zIndex: el menú de idioma de FloatingTopBar se despliega hacia abajo
      // y debe quedar por encima del contenido que sigue.
      position: 'relative', zIndex: 5,
    },
    title: { fontSize: 22, fontFamily: FONTS.soraBold, color: C.textPrimary, flexShrink: 1 },
    search: {
      flex: 1, maxWidth: 420, marginLeft: 8, height: 44,
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 14, borderRadius: 12, borderWidth: 1,
      backgroundColor: C.backgroundSurface, borderColor: C.border,
    },
    searchTxt: { flex: 1, fontSize: 14, fontFamily: FONTS.interRegular, color: C.textMuted },
    topRight: { marginLeft: 'auto' },
  });
