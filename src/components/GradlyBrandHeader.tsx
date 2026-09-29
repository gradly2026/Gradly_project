// ════════════════════════════════════════════════════════════════════════
// GradlyBrandHeader — franja delgada con el logo de Gradly + "Gradly",
// SIEMPRE visible arriba de los 3 dashboards grandes (empresa/universidad/
// estudiante), en cualquier sección (incluida "Mensajes") y cualquier
// ancho de pantalla.
//
// Es lo único que sobrevivió del rediseño de navegación para laptop/tablet
// (Gradly-v234/v235): el usuario pidió revertir el resto exactamente a
// como estaba antes de Gradly-v233 (los headers de avatar+nombre, el menú
// inferior, la bandeja de Mensajes, todo), pero quedarse con esta marca
// siempre visible.
// ════════════════════════════════════════════════════════════════════════
import { Image, Platform, StyleSheet, View } from 'react-native';
import { AutoText } from './AutoText';
import { FONTS, type GradlyColors } from '../context/ThemeContext';

const GRADLY_LOGO = require('../../assets/images/LogoGradly.png');

export default function GradlyBrandHeader({ colors }: { colors: GradlyColors }) {
  const styles = makeStyles(colors);
  return (
    <View style={styles.wrap}>
      <Image source={GRADLY_LOGO} style={styles.logo} resizeMode="contain" />
      <AutoText style={styles.word} noTranslate>Gradly</AutoText>
    </View>
  );
}

const makeStyles = (C: GradlyColors) =>
  StyleSheet.create({
    wrap: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingTop: Platform.OS === 'ios' ? 20 : 14,
      paddingHorizontal: 20, paddingBottom: 6,
    },
    logo: { width: 28, height: 28 },
    word: { fontSize: 15, fontFamily: FONTS.soraBold, color: C.textPrimary },
  });
