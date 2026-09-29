// ════════════════════════════════════════════════════════════════════════
// DashboardTopBar — cabecera de marca (logo + "Gradly") para los 3
// dashboards grandes (empresa/universidad/estudiante), con el menú de
// secciones SIEMPRE visible en pantallas anchas (laptop/tablet, ancho
// >= 768) — reemplaza tanto el bloque de avatar+nombre de empresa/
// universidad como el saludo "Hola, {nombre}" del estudiante, que ahora
// vive aquí en vez de adentro del feed de Vacantes.
//
// El menú es el MISMO FloatingNavBar que ya se usa flotando abajo en
// móvil/app — aquí se dibuja con `variant="inline"` (mismos íconos,
// mismas etiquetas, misma píldora deslizante), solo que reubicado arriba,
// en fila junto a la marca. Cada dashboard arma UN solo array de `items` y
// se lo pasa a los dos (este de arriba, en ancho; y FloatingNavBar de
// abajo, en angosto/app) — nunca se duplica esa lista.
//
// En pantallas angostas (`isWide=false`) esta barra NO dibuja el menú ni
// los 3 íconos de notificaciones/idioma/tema — ahí la navegación sigue
// siendo la de siempre (el menú inferior flotante) y esos 3 íconos siguen
// flotando aparte arriba a la derecha (FloatingTopBar, en su dashboard).
// Esta barra solo aporta el logo + "Gradly" (y el saludo, si se pasa).
// ════════════════════════════════════════════════════════════════════════
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { AutoText } from './AutoText';
import FloatingNavBar, { type NavItem } from './FloatingNavBar';
import FloatingTopBar from './FloatingTopBar';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';

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
   * En ancho, esta barra dibuja ella misma (en la MISMA fila que el menú,
   * a la misma altura, con 35px de margen) los 3 botones de notificaciones/
   * idioma/tema — el dashboard que llama debe entonces ocultar su propia
   * píldora flotante en ese ancho, para no duplicarlos.
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
            <View style={styles.navSlot}>
              <FloatingNavBar items={items} activeKey={activeKey} onChange={onChange} variant="inline" />
            </View>
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
    // El menú (FloatingNavBar inline) ocupa todo el espacio disponible
    // entre la marca y los 3 íconos, con 35px de margen a cada lado —
    // mismo margen que ya separaba la píldora del menú inferior de los
    // bordes de la pantalla al flotar en móvil.
    navSlot: { flex: 1, marginLeft: 35 },
    iconsSlot: { marginLeft: 35 },
    greeting: {
      paddingHorizontal: 20, paddingBottom: 14,
      fontSize: 15, fontFamily: FONTS.interSemiBold, color: C.textPrimary,
    },
  });
