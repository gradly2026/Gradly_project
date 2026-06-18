import MapView, { Marker } from 'react-native-maps';
import { StyleSheet, View } from 'react-native';

type Coord = { latitude: number; longitude: number };
type Props = {
  mapRegion: any;
  markerPos: any;
  /** Si se provee, el mapa es interactivo y al tocarlo devuelve la coordenada. */
  onMapPress?: (coord: Coord) => void;
};

export default function MapViewer({ mapRegion, markerPos, onMapPress }: Props) {
  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        region={mapRegion}
        onPress={onMapPress ? (e: any) => onMapPress(e.nativeEvent.coordinate) : undefined}
      >
        {markerPos && <Marker coordinate={markerPos} title="Ubicación de la vacante" />}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', height: '100%' },
  map: { width: '100%', height: '100%' },
});
