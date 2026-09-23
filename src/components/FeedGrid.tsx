// Cuadrícula de 3 columnas para el feed de vacantes/pasantías del estudiante
// (app/(tabs)/index.tsx), solo web en escritorio.
import { Children, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

// Desde este ancho de ventana, en web, el encabezado ocupa todo el ancho y las
// tarjetas se acomodan de 3 en 3. Por debajo (celular, tablet, ventana angosta)
// no cambia nada: una sola columna de 640, como siempre. 1200 y no menos
// porque a ~1100 el botón más largo de la tarjeta ('Disponible al culminar tu
// pasantía') ya no cabe en una línea junto a la fecha.
export const ANCHO_MIN_GRID_ESCRITORIO = 1200;

const gridStyles = StyleSheet.create({
  // Margen negativo + relleno en cada celda = separación de 16 entre tarjetas
  // sin que el borde exterior de la primera/última columna sobre.
  fila: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -8 },
  // 33.33% (no 33.3334%) a propósito: tres celdas suman 99.99% y nunca
  // desbordan la fila por redondeo — misma lección del calendario de 7
  // columnas. Una última fila con 1 o 2 tarjetas conserva el ancho de un
  // tercio y queda alineada a la izquierda, como si estuvieran las demás.
  celda: { width: '33.33%', paddingHorizontal: 8 },
});

/**
 * Envuelve una lista de tarjetas: con `enGrid` las reparte en 3 columnas; sin
 * él devuelve los hijos tal cual (sin ningún contenedor extra), así que en
 * celular/tablet el feed queda idéntico a antes. Vive a nivel de módulo (no
 * dentro de la pantalla) para que su identidad no cambie en cada render y las
 * tarjetas no se desmonten al teclear en el buscador.
 */
export function FeedGrid({ enGrid, children }: { enGrid: boolean; children: ReactNode }) {
  if (!enGrid) return <>{children}</>;
  return (
    <View style={gridStyles.fila}>
      {Children.toArray(children).map((hijo, i) => (
        <View key={(hijo as { key?: string | number } | null)?.key ?? i} style={gridStyles.celda}>
          {hijo}
        </View>
      ))}
    </View>
  );
}
