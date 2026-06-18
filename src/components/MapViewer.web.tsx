import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../context/ThemeContext';

/**
 * Fallback de mapa para WEB.
 *
 * `react-native-maps` no registra el evento onPress en el navegador (deja
 * markerPos en null y bloquea silenciosamente la publicación). Por eso en web
 * NO renderizamos un mapa interactivo: mostramos un mensaje y el usuario fija la
 * ubicación con el botón "Capturar mi Ubicación Actual" (GPS del navegador),
 * que sí alimenta markerPos y, por tanto, las coordenadas que van a Firestore.
 *
 * En Android / iOS se usa el archivo nativo MapViewer.tsx (sin cambios).
 */
export default function MapViewer(_props: any) {
  return (
    <View style={styles.container}>
      <Ionicons name="map-outline" size={40} color={COLORS.primaryLight} />
      <Text style={styles.text}>
        El mapa interactivo funciona en la app móvil. En la versión web, usa el
        botón “Capturar mi Ubicación Actual” para fijar la ubicación y poder
        publicar la vacante.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  text: {
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 10,
    fontFamily: FONTS.interRegular,
  },
});
