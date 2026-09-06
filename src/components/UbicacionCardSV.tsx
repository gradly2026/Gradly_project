// ════════════════════════════════════════════════════════════════════════
// UbicacionCardSV.tsx — la tarjeta "Mi ubicación" de empresa / universidad
// (y, en solo lectura, de la vista de perfil ajeno).
//
// Tarjeta ~360×240 con fondo degradado (morado de la plataforma → índigo
// oscuro) sobre el que se dibuja el CONTORNO real del distrito guardado en
// líneas largas punteadas (geometría de `distritoGeo.ts`). Arriba: el
// departamento y el distrito. Abajo a la derecha: un botón con ícono de
// ubicación que abre `UbicacionPrecisaModal` para registrar / ver el punto
// exacto en el mapa.
// ════════════════════════════════════════════════════════════════════════
import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { AutoText as Text } from './AutoText';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { getDistritoGeo } from '../utils/distritoGeo';

const VB_W = 360;
const VB_H = 240;
// Caja interior donde se encuadra el contorno (deja aire arriba para el texto).
const BOX = { x0: 26, y0: 66, x1: 334, y1: 220 };

interface Props {
  departamento?: string | null;
  distrito?: string | null;
  /** Punto preciso ya registrado (o null). Solo afecta el ícono del botón. */
  puntoGuardado?: { lat: number; lng: number } | null;
  /** Se llama al pulsar el botón de ubicación. Si no se pasa, no hay botón. */
  onPin?: () => void;
  /** El botón de ubicación se ve/actúa deshabilitado si es false. */
  pinHabilitado?: boolean;
}

/** Construye el atributo `d` de un <Path> con TODOS los anillos del distrito,
 *  proyectando lng/lat a la caja interior de la tarjeta (aspecto preservado). */
function pathDelDistrito(departamento?: string | null, distrito?: string | null): string {
  const geo = getDistritoGeo(departamento, distrito);
  if (!geo) return '';
  const [w, s, e, n] = geo.b;
  const bw = e - w || 1e-6;
  const bh = n - s || 1e-6;
  const scale = Math.min((BOX.x1 - BOX.x0) / bw, (BOX.y1 - BOX.y0) / bh);
  const offX = BOX.x0 + ((BOX.x1 - BOX.x0) - bw * scale) / 2;
  const offY = BOX.y0 + ((BOX.y1 - BOX.y0) - bh * scale) / 2;
  const X = (lng: number) => offX + (lng - w) * scale;
  const Y = (lat: number) => offY + (n - lat) * scale; // lat sube, y del SVG baja

  const partes: string[] = [];
  for (const poly of geo.p) {
    for (const ring of poly) {
      if (ring.length < 3) continue;
      let d = '';
      for (let i = 0; i < ring.length; i++) {
        d += (i === 0 ? 'M' : 'L') + X(ring[i][0]).toFixed(1) + ' ' + Y(ring[i][1]).toFixed(1) + ' ';
      }
      partes.push(d + 'Z');
    }
  }
  return partes.join(' ');
}

export default function UbicacionCardSV({
  departamento, distrito, puntoGuardado, onPin, pinHabilitado = true,
}: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const d = useMemo(() => pathDelDistrito(departamento, distrito), [departamento, distrito]);
  const tieneContorno = !!d;

  return (
    <View style={s.card}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${VB_W} ${VB_H}`}>
        <Defs>
          <LinearGradient id="ucgrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0" stopColor={colors.primary} stopOpacity={1} />
            <Stop offset="0.55" stopColor={colors.primaryDark} stopOpacity={1} />
            <Stop offset="1" stopColor="#140f2e" stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={VB_W} height={VB_H} fill="url(#ucgrad)" />
        {tieneContorno && (
          <>
            {/* Relleno tenue para dar cuerpo (regla par/impar → agujeros reales). */}
            <Path d={d} fill="#ffffff" fillOpacity={0.06} fillRule="evenodd" />
            {/* Contorno en líneas largas punteadas. */}
            <Path
              d={d}
              fill="none"
              stroke="#ffffff"
              strokeOpacity={0.55}
              strokeWidth={1.6}
              strokeDasharray="15 9"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        )}
      </Svg>

      {/* Capa de texto + botón, encima del SVG. */}
      <View style={s.overlay} pointerEvents="box-none">
        <View style={s.textWrap}>
          <Text style={s.depTxt} numberOfLines={1} noTranslate>
            {(departamento || '—').toUpperCase()}
          </Text>
          <Text style={s.distTxt} numberOfLines={2} noTranslate>
            {distrito || 'Distrito sin definir'}
          </Text>
          {!tieneContorno && (
            <Text style={s.hintTxt}>Define tu departamento y distrito para ver el mapa aquí.</Text>
          )}
        </View>

        {onPin && (
          <TouchableOpacity
            style={[s.pinBtn, !pinHabilitado && s.pinBtnOff]}
            onPress={pinHabilitado ? onPin : undefined}
            disabled={!pinHabilitado}
            activeOpacity={0.85}
            accessibilityLabel="Ubicación precisa"
          >
            <Ionicons name="location" size={18} color="#fff" />
            {puntoGuardado && <View style={s.pinDot} />}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const makeStyles = (c: GradlyColors) =>
  StyleSheet.create({
    card: {
      width: '100%',
      maxWidth: 360,
      aspectRatio: VB_W / VB_H,
      borderRadius: 18,
      overflow: 'hidden',
      alignSelf: 'center',
      borderWidth: 1,
      borderColor: c.primary + '55',
    },
    overlay: { ...StyleSheet.absoluteFillObject, padding: 18, justifyContent: 'space-between' },
    textWrap: { gap: 4 },
    depTxt: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: '#ffffffcc', letterSpacing: 1.5 },
    distTxt: { fontSize: 21, fontFamily: FONTS.soraBold, color: '#ffffff', lineHeight: 26 },
    hintTxt: { fontSize: 11.5, fontFamily: FONTS.interRegular, color: '#ffffff99', marginTop: 4, maxWidth: 220, lineHeight: 16 },
    pinBtn: {
      alignSelf: 'flex-end',
      width: 42, height: 42, borderRadius: 21,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.primary,
      borderWidth: 1, borderColor: '#ffffff55',
    },
    pinBtnOff: { opacity: 0.4 },
    pinDot: {
      position: 'absolute', top: 6, right: 6,
      width: 8, height: 8, borderRadius: 4,
      backgroundColor: c.success, borderWidth: 1, borderColor: '#fff',
    },
  });
