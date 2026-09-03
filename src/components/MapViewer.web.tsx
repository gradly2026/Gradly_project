/**
 * MapViewer (WEB) — mapa interactivo real para la versión web, con Leaflet +
 * teselas de OpenStreetMap (sin API key ni facturación).
 *
 * Antes este archivo era un stub: `react-native-maps` es nativo puro y en el
 * navegador nunca dispara `onPress` (dejaba `markerPos` en null y bloqueaba
 * silenciosamente publicar la vacante). Ahora:
 *   - Si se pasa `onMapPress`, el mapa es interactivo: al hacer clic (o arrastrar
 *     el pin) devuelve `{ latitude, longitude }`, igual que el nativo.
 *   - Sin `onMapPress`, es solo lectura (pan/zoom desactivados).
 *
 * IMPORTANTE: Expo Router pre-renderiza las rutas en Node (SSG), donde NO hay
 * `window`/`document`. `leaflet` toca `window` al importarse, así que su JS se
 * carga con `require('leaflet')` DENTRO del efecto (solo corre en el navegador).
 * El CSS sí se importa arriba (no toca `window`); se usa una copia vendida
 * (`src/vendor/leaflet.css`) SIN las 3 reglas `url(images/*.png)` del original,
 * que Metro-web no sabe resolver (avisaba "Importing local resources in CSS is
 * not supported yet") y que además no usamos — el pin es un `L.divIcon` con SVG.
 *
 * El archivo nativo `MapViewer.tsx` (Android/iOS, react-native-maps) NO se toca:
 * Metro elige automáticamente este `.web.tsx` al compilar para web.
 */
import React, { useEffect, useRef } from 'react';
import '../vendor/leaflet.css';

type Coord = { latitude: number; longitude: number };
type Props = {
  mapRegion: any;
  markerPos: any;
  /** Si se provee, el mapa es interactivo y al tocarlo/arrastrar el pin devuelve la coordenada. */
  onMapPress?: (coord: Coord) => void;
};

// Centro por defecto: San Salvador (por si `mapRegion` viene incompleto).
const DEFAULT: Coord = { latitude: 13.6929, longitude: -89.2182 };

const num = (v: any, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// SVG del pin, embebido en un divIcon → no usa las PNG de Leaflet (rutas
// relativas que los bundlers rompen) ni ningún CDN.
const PIN_SVG =
  '<svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M15 0C6.716 0 0 6.716 0 15c0 10.5 15 27 15 27s15-16.5 15-27C30 6.716 23.284 0 15 0z" fill="#7c3aed"/>' +
  '<circle cx="15" cy="15" r="5.5" fill="#ffffff"/></svg>';

export default function MapViewer({ mapRegion, markerPos, onMapPress }: Props) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const LRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  // El handler puede cambiar entre renders; se guarda en un ref para no tener
  // que recrear el mapa ni re-suscribir el listener de 'click'.
  const onPressRef = useRef(onMapPress);
  onPressRef.current = onMapPress;

  const interactivo = !!onMapPress;
  const lat = num(mapRegion?.latitude, DEFAULT.latitude);
  const lng = num(mapRegion?.longitude, DEFAULT.longitude);

  // ── Crear el mapa una sola vez (solo en el navegador) ───────────
  useEffect(() => {
    if (typeof window === 'undefined' || !nodeRef.current || mapRef.current) return;
    // `leaflet` toca `window` al cargarse → require perezoso, nunca en SSG.
    const L = require('leaflet');
    LRef.current = L;

    const map = L.map(nodeRef.current, {
      center: [lat, lng],
      zoom: 15,
      zoomControl: interactivo,
      dragging: interactivo,
      scrollWheelZoom: false, // molesto al hacer scroll de la página
      doubleClickZoom: interactivo,
      touchZoom: interactivo,
      boxZoom: interactivo,
      keyboard: interactivo,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    if (interactivo) {
      map.on('click', (e: any) => {
        onPressRef.current?.({ latitude: e.latlng.lat, longitude: e.latlng.lng });
      });
    }

    mapRef.current = map;
    syncMarker();
    // Leaflet mide mal el contenedor si aún no tiene layout (modales, tabs…).
    const t = setTimeout(() => map.invalidateSize(), 80);
    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      LRef.current = null;
    };
    // Solo al montar. Coords/marcador se sincronizan en los efectos de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Recentrar cuando cambian las coordenadas de la región ───────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView([lat, lng], map.getZoom(), { animate: false });
  }, [lat, lng]);

  // ── Sincronizar el marcador con `markerPos` ────────────────────
  function syncMarker() {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    const hasPos =
      markerPos && Number.isFinite(Number(markerPos.latitude)) && Number.isFinite(Number(markerPos.longitude));

    if (!hasPos) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }

    const pos: [number, number] = [Number(markerPos.latitude), Number(markerPos.longitude)];
    if (!markerRef.current) {
      const icon = L.divIcon({ className: '', html: PIN_SVG, iconSize: [30, 42], iconAnchor: [15, 42] });
      const m = L.marker(pos, { icon, draggable: interactivo }).addTo(map);
      if (interactivo) {
        m.on('dragend', () => {
          const ll = m.getLatLng();
          onPressRef.current?.({ latitude: ll.lat, longitude: ll.lng });
        });
      }
      markerRef.current = m;
    } else {
      markerRef.current.setLatLng(pos);
    }
  }
  useEffect(syncMarker, [markerPos?.latitude, markerPos?.longitude, interactivo]);

  // Contenedor DOM puro (Leaflet necesita un elemento real). Se usa
  // React.createElement para no depender de que `<div>` esté en
  // JSX.IntrinsicElements bajo `jsx: "react-native"`.
  return React.createElement(
    'div',
    { style: { width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden' } },
    React.createElement('div', {
      ref: nodeRef,
      style: { width: '100%', height: '100%', background: '#0d0b1e' },
    }),
  );
}
