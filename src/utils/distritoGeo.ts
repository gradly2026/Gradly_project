// ════════════════════════════════════════════════════════════════════════
// distritoGeo.ts — geometría (fronteras) de los 262 distritos de El Salvador.
//
// El JSON `src/data/distritosGeoSV.json` se generó a partir de GADM 4.1
// (nivel 2, municipios) simplificado con Douglas–Peucker (~44 m) y redondeo a
// 4 decimales. Clave = "<departamento>|<distrito>" con los MISMOS nombres del
// catálogo `ubicacionElSalvador.ts`. Pesa ~256 KB.
//
// Se usa para:
//  · dibujar el contorno del distrito en la tarjeta "Mi ubicación"
//    (`UbicacionCardSV`), y
//  · validar que el punto que el usuario marca en el mapa cae DENTRO de su
//    distrito antes de guardarlo (`UbicacionPrecisaModal`).
// ════════════════════════════════════════════════════════════════════════
import RAW from '../data/distritosGeoSV.json';

/** Un distrito: bbox + polígonos. Cada polígono = [anilloExterior, ...agujeros];
 *  cada anillo = lista de pares [lng, lat]. */
export interface DistritoGeo {
  /** [minLng, minLat, maxLng, maxLat] */
  b: [number, number, number, number];
  /** polígonos → anillos → puntos [lng, lat] */
  p: number[][][][];
}

const GEO = RAW as unknown as Record<string, DistritoGeo>;

const norm = (s?: string | null): string =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

// Índice normalizado → clave real (tolera diferencias de mayúsculas / tildes /
// espacios entre lo guardado en el perfil y el nombre del catálogo).
const NORM_INDEX: Record<string, string> = {};
for (const k of Object.keys(GEO)) {
  const i = k.indexOf('|');
  NORM_INDEX[norm(k.slice(0, i)) + '|' + norm(k.slice(i + 1))] = k;
}

/** Geometría del distrito, o `null` si no se reconoce el par departamento/distrito. */
export function getDistritoGeo(
  departamento?: string | null,
  distrito?: string | null,
): DistritoGeo | null {
  if (!departamento || !distrito) return null;
  const exact = GEO[`${departamento}|${distrito}`];
  if (exact) return exact;
  const k = NORM_INDEX[norm(departamento) + '|' + norm(distrito)];
  return k ? GEO[k] : null;
}

/** Centro aproximado del distrito (centro de su bbox) — para centrar el mapa. */
export function centroDistrito(
  geo: DistritoGeo | null,
): { latitude: number; longitude: number } | null {
  if (!geo) return null;
  const [w, s, e, n] = geo.b;
  return { latitude: (s + n) / 2, longitude: (w + e) / 2 };
}

/** Deltas de región (react-native-maps) que encuadran el distrito con margen. */
export function regionDistrito(
  geo: DistritoGeo | null,
): { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null {
  const c = centroDistrito(geo);
  if (!geo || !c) return null;
  const [w, s, e, n] = geo.b;
  return {
    latitude: c.latitude,
    longitude: c.longitude,
    latitudeDelta: Math.max((n - s) * 1.6, 0.02),
    longitudeDelta: Math.max((e - w) * 1.6, 0.02),
  };
}

// ── Point-in-polygon (ray casting) ────────────────────────────────────
function enAnilloRayo(x: number, y: number, ring: number[][]): boolean {
  let dentro = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      dentro = !dentro;
    }
  }
  return dentro;
}

function distSegmento(
  px: number, py: number, ax: number, ay: number, bx: number, by: number,
): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function distAAnillo(x: number, y: number, ring: number[][]): number {
  let min = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const d = distSegmento(x, y, ring[j][0], ring[j][1], ring[i][0], ring[i][1]);
    if (d < min) min = d;
  }
  return min;
}

/**
 * ¿El punto (lng, lat) cae dentro del distrito? `bufferGrados` (por defecto
 * ~0.0012° ≈ 130 m) amplía el área aceptada para no rechazar puntos que caen
 * justo sobre el borde (la geometría está simplificada, y nadie marca un pin
 * exactamente sobre una línea municipal). Los agujeros (enclaves) sí se restan.
 */
export function puntoEnDistrito(
  lng: number,
  lat: number,
  geo: DistritoGeo | null,
  bufferGrados = 0.0012,
): boolean {
  if (!geo || !Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  const [w, s, e, n] = geo.b;
  if (lng < w - bufferGrados || lng > e + bufferGrados || lat < s - bufferGrados || lat > n + bufferGrados) {
    return false;
  }
  for (const poly of geo.p) {
    if (!poly.length) continue;
    const ext = poly[0];
    const dentroExt = enAnilloRayo(lng, lat, ext) || (bufferGrados > 0 && distAAnillo(lng, lat, ext) <= bufferGrados);
    if (!dentroExt) continue;
    let enAgujero = false;
    for (let h = 1; h < poly.length; h++) {
      if (enAnilloRayo(lng, lat, poly[h])) { enAgujero = true; break; }
    }
    if (!enAgujero) return true;
  }
  return false;
}
