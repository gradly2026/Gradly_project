// ════════════════════════════════════════════════════════════════════════
// ComoLlegarBoton.tsx — "Cómo llegar": abre la ruta hacia un punto en Google
// Maps o Waze, ya con el destino puesto (el estudiante solo confirma su
// origen si la app se lo pide).
//
// A propósito NO construimos navegación propia (dibujar la ruta y moverla en
// vivo dentro de Gradly): el stack de mapas de este proyecto (Leaflet+OSM en
// web, react-native-maps en nativo) solo MUESTRA un punto, no trae motor de
// rutas — replicar lo que Google Maps ya hace mejor sería mucho esfuerzo de
// mantenimiento para un beneficio menor. En vez de eso, un enlace universal
// (funciona en web y nativo, con o sin la app instalada, sin API key).
// ════════════════════════════════════════════════════════════════════════
import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Linking, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';

interface Props {
  lat: number;
  lng: number;
  label?: string;
}

export default function ComoLlegarBoton({ lat, lng, label = 'Cómo llegar' }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const abrirGoogleMaps = () => {
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`).catch(() => {});
  };
  const abrirWaze = () => {
    Linking.openURL(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`).catch(() => {});
  };

  return (
    <View style={s.wrap}>
      <Text style={s.label}>{label}</Text>
      <View style={s.row}>
        <TouchableOpacity style={s.btn} onPress={abrirGoogleMaps} activeOpacity={0.8}>
          <Ionicons name="map-outline" size={14} color={colors.primaryLight} />
          <Text style={s.btnTxt} noTranslate>Google Maps</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.btn} onPress={abrirWaze} activeOpacity={0.8}>
          <Ionicons name="navigate-outline" size={14} color={colors.primaryLight} />
          <Text style={s.btnTxt} noTranslate>Waze</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (c: GradlyColors) =>
  StyleSheet.create({
    wrap: { gap: 8 },
    label: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
    row: { flexDirection: 'row', gap: 8 },
    btn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      paddingVertical: 9, borderRadius: 10,
      borderWidth: 1, borderColor: c.primaryLight + '55', backgroundColor: c.primaryLight + '14',
    },
    btnTxt: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: c.primaryLight },
  });
