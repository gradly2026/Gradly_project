// ════════════════════════════════════════════════════════════════════════
// geo.ts — distancia en línea recta entre dos puntos (fórmula de Haversine)
// y el filtro de "cercanía" del feed de pasantías/vacantes
// (app/(tabs)/index.tsx). Puro y sin dependencias de Firestore/React, para
// poder probarlo con datos sueltos.
//
// Los dos lados que se comparan no usan el mismo nombre de llaves: el punto
// del ESTUDIANTE ("Mi ubicación", `perfiles_estudiantes.ubicacion_precisa`)
// es `{lat, lng}`; el de cada pasantía/vacante (`vacantes.ubicacion_coords`)
// es `{latitude, longitude}`. `normalizarPunto` acepta cualquiera de las dos
// formas para no repetir esa conversión en cada pantalla.
// ════════════════════════════════════════════════════════════════════════

export interface PuntoLatLng {
  lat: number;
  lng: number;
}

const esNumeroValido = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Acepta `{lat,lng}` o `{latitude,longitude}`; cualquier otra cosa (null,
 *  undefined, coordenadas fuera de rango, campos faltantes) da `null` —
 *  nunca lanza, para poder usarse directo sobre un dato que puede no existir. */
export function normalizarPunto(p: unknown): PuntoLatLng | null {
  if (!p || typeof p !== 'object') return null;
  const o = p as Record<string, unknown>;
  const lat = esNumeroValido(o.lat) ? o.lat : esNumeroValido(o.latitude) ? o.latitude : null;
  const lng = esNumeroValido(o.lng) ? o.lng : esNumeroValido(o.longitude) ? o.longitude : null;
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

const RADIO_TIERRA_KM = 6371;
const aRadianes = (grados: number) => (grados * Math.PI) / 180;

/** Distancia en línea recta entre dos puntos, en kilómetros (Haversine).
 *  OJO: no es la distancia real de manejo o caminata — un punto puede estar
 *  más lejos por carretera de lo que sugiere esta cifra. */
export function distanciaKm(a: PuntoLatLng, b: PuntoLatLng): number {
  const dLat = aRadianes(b.lat - a.lat);
  const dLng = aRadianes(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aRadianes(a.lat)) * Math.cos(aRadianes(b.lat)) * Math.sin(dLng / 2) ** 2;
  return RADIO_TIERRA_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Radios de cercanía que ofrece el filtro del feed (km). Único lugar que
 *  decide la lista — la UI arma sus chips a partir de este arreglo. */
export const RADIOS_CERCANIA_KM = [1, 3, 5, 10] as const;

export interface ItemConUbicacion {
  modalidad?: string | null;
  ubicacion_coords?: unknown;
}

export interface ResultadoCercania<T> {
  visibles: T[];
  /** Cuántos elementos quedaron fuera SOLO por no tener ubicación guardada
   *  (no cuenta los que sí la tienen pero caen fuera del radio: esos
   *  simplemente no aplica mostrarlos, no hace falta avisar de ellos). */
  ocultosPorFaltaDeUbicacion: number;
}

/**
 * Filtra una lista de pasantías/vacantes por cercanía al punto del
 * estudiante. Las de modalidad 'Remoto' se muestran SIEMPRE (no exigen
 * desplazarse), tengan o no coordenadas guardadas. Las demás sin
 * `ubicacion_coords` quedan fuera del filtro y se cuentan en
 * `ocultosPorFaltaDeUbicacion`, para poder avisarle al estudiante en vez de
 * que desaparezcan sin explicación.
 *
 * Sin radio elegido (`radioKm` null/0) o sin el punto del estudiante
 * (`origen` null — "Mi ubicación" sin registrar), no filtra nada.
 */
export function filtrarPorCercania<T extends ItemConUbicacion>(
  lista: T[],
  origen: PuntoLatLng | null,
  radioKm: number | null,
): ResultadoCercania<T> {
  if (!radioKm || !origen) return { visibles: lista, ocultosPorFaltaDeUbicacion: 0 };
  let ocultosPorFaltaDeUbicacion = 0;
  const visibles = lista.filter(item => {
    if (item.modalidad === 'Remoto') return true;
    const punto = normalizarPunto(item.ubicacion_coords);
    if (!punto) {
      ocultosPorFaltaDeUbicacion++;
      return false;
    }
    return distanciaKm(origen, punto) <= radioKm;
  });
  return { visibles, ocultosPorFaltaDeUbicacion };
}
