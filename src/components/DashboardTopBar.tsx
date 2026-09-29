// ════════════════════════════════════════════════════════════════════════
// DashboardTopBar — cabecera de marca (logo + "Gradly") para los 3
// dashboards grandes (empresa/universidad/estudiante), con el menú de
// secciones SIEMPRE visible en fila en pantallas anchas (laptop/tablet,
// ancho >= 768) — reemplaza tanto el bloque de avatar+nombre de empresa/
// universidad como el saludo "Hola, {nombre}" del estudiante, que ahora
// vive aquí en vez de adentro del feed de Vacantes.
//
// Usa los MISMOS `items` (con los MISMOS íconos de Ionicons) que ya recibe
// FloatingNavBar — nunca se duplica esa lista, cada dashboard arma UN solo
// array y se lo pasa a los dos componentes (este de arriba, en ancho; y
// FloatingNavBar de abajo, en angosto/app).
//
// En pantallas angostas (`isWide=false`) esta barra NO dibuja el menú —
// ahí la navegación sigue siendo la de siempre (el menú inferior flotante,
// FloatingNavBar), esta barra solo aporta el logo + "Gradly" (y el saludo,
// si se pasa).
// ════════════════════════════════════════════════════════════════════════
import { Ionicons } from '@expo/vector-icons';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AutoText, useAutoText } from './AutoText';
import FloatingTopBar from './FloatingTopBar';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import type { NavItem } from './FloatingNavBar';

const GRADLY_LOGO = require('../../assets/images/LogoGradly.png');

interface DashboardTopBarProps<K extends string = string> {
  items: NavItem<K>[];
  activeKey: K;
  onChange: (key: K) => void;
  /** Ancho de pantalla actual >= 768 (laptop/tablet) — lo calcula el dashboard
   *  que llama, con useWindowDimensions, para no repetir el hook aquí adentro. */
  isWide: boolean;
  /** "Hola, Diego" — solo lo pasa el estudiante; se muestra debajo de la marca. */
  greeting?: string;
  /**
   * Si se pasa, en ancho esta barra dibuja ella misma (en la MISMA fila que
   * el menú, a la misma altura, con 35px de margen izquierdo) los 3 botones
   * de notificaciones/idioma/tema — el dashboard que llama debe entonces
   * ocultar su propia píldora flotante en ese ancho, para no duplicarlos.
   */
  userId?: string | null;
}

export default function DashboardTopBar<K extends string = string>({
  items,
  activeKey,
  onChange,
  isWide,
  greeting,
  userId,
}: DashboardTopBarProps<K>) {
  const { colors } = useTheme();
  const styles = makeStyles(colors, isWide);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Image source={GRADLY_LOGO} style={styles.logo} resizeMode="contain" />
        <AutoText style={styles.brandWord} noTranslate>Gradly</AutoText>

        {isWide && (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.navScroll}
              contentContainerStyle={styles.navRow}
            >
              {items.map(it => (
                <NavPill
                  key={it.key}
                  item={it}
                  active={it.key === activeKey}
                  onPress={() => onChange(it.key)}
                  colors={colors}
                  styles={styles}
                />
              ))}
            </ScrollView>
            <View style={styles.iconsSlot}>
              <FloatingTopBar userId={userId} variant="inline" />
            </View>
          </>
        )}
      </View>

      {greeting ? <Text style={styles.greeting}>{greeting}</Text> : null}
    </View>
  );
}

function NavPill<K extends string>({
  item,
  active,
  onPress,
  colors,
  styles,
}: {
  item: NavItem<K>;
  active: boolean;
  onPress: () => void;
  colors: GradlyColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  // Ya viene traducida: renderizarla con <Text> normal (no <AutoText>) evita
  // mandarla al traductor una segunda vez.
  const label = useAutoText(item.label);
  return (
    <Pressable onPress={onPress} style={[styles.item, active && styles.itemActive]}>
      <View>
        <Ionicons name={item.icon} size={19} color={active ? colors.primaryLight : colors.textMuted} />
        {!!item.badge && item.badge > 0 && (
          <View style={[styles.badge, { backgroundColor: colors.error }]}>
            <Text style={styles.badgeText}>{item.badge > 99 ? '99+' : item.badge}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.itemLabel, { color: active ? colors.primaryLight : colors.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const makeStyles = (C: GradlyColors, isWide: boolean) =>
  StyleSheet.create({
    wrap: {
      borderBottomWidth: 1, borderBottomColor: C.border,
      backgroundColor: C.backgroundCard,
    },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingTop: Platform.OS === 'ios' ? 56 : 40,
      paddingLeft: 20,
      // En angosto la píldora de notificaciones/idioma/tema del dashboard
      // sigue flotando APARTE arriba a la derecha (como siempre) — este
      // padding le deja hueco para no taparla. En ancho esos 3 botones ya
      // van DENTRO de esta misma fila (iconsSlot, más abajo), así que no
      // hace falta ningún hueco reservado.
      paddingRight: isWide ? 20 : 160,
      paddingBottom: 14,
    },
    logo: { width: 60, height: 60 },
    brandWord: { fontSize: 18, fontFamily: FONTS.soraBold, color: C.textPrimary, marginRight: 4 },
    navScroll: { flex: 1 },
    // Fila del menú ~30% más ancha que la versión original (más separación
    // entre botones) y centrada en el espacio libre entre la marca y los
    // 3 íconos — flexGrow:1 le da a ese espacio algo que centrar; si el
    // contenido no cabe, sigue siendo scrolleable como cualquier ScrollView.
    navRow: {
      flexDirection: 'row', alignItems: 'center', gap: 13,
      flexGrow: 1, justifyContent: 'center',
    },
    item: {
      alignItems: 'center', gap: 4,
      paddingVertical: 9, paddingHorizontal: 16,
      borderRadius: 12,
    },
    itemActive: {
      backgroundColor: C.primary20,
      borderWidth: 1, borderColor: C.primary35,
    },
    itemLabel: { fontSize: 10.5, fontFamily: FONTS.interSemiBold, maxWidth: 110 },
    badge: {
      position: 'absolute', top: -6, right: -10,
      minWidth: 15, height: 15, paddingHorizontal: 3,
      borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    },
    badgeText: { fontSize: 9, fontFamily: FONTS.interSemiBold, color: '#fff' },
    // Los 3 botones de notificaciones/idioma/tema, en la MISMA fila que el
    // menú (mismo `alignItems:'center'` del row → misma altura) con 35px de
    // margen respecto al menú, tal como se pidió.
    iconsSlot: { marginLeft: 35 },
    greeting: {
      paddingHorizontal: 20, paddingBottom: 14,
      fontSize: 15, fontFamily: FONTS.interSemiBold, color: C.textPrimary,
    },
  });
