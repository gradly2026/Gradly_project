// ════════════════════════════════════════════════════════════════════════
// UbicacionPrecisaModal.tsx — registrar / ver el punto exacto de un perfil
// (empresa o universidad) dentro de su distrito.
//
// Se abre desde el botón de la tarjeta `UbicacionCardSV`.
//  · Sin punto guardado → mapa interactivo: se toca para marcar; el botón
//    Guardar solo se habilita si el punto cae DENTRO del distrito
//    (`puntoEnDistrito`).
//  · Con punto guardado (se vuelve a pulsar el botón) → mismo mapa pero en
//    SOLO LECTURA, mostrando el marcador guardado.
// ════════════════════════════════════════════════════════════════════════
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import MapViewer from './MapViewer';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { getDistritoGeo, puntoEnDistrito, regionDistrito } from '../utils/distritoGeo';

interface Props {
  visible: boolean;
  onClose: () => void;
  departamento?: string | null;
  distrito?: string | null;
  /** Punto ya registrado (o null). */
  puntoGuardado?: { lat: number; lng: number } | null;
  /** true → abre en solo lectura (ya hay punto y se vuelve a abrir). */
  soloLectura?: boolean;
  /** Persiste el punto en el perfil. Sin esto, el modal es de solo lectura. */
  onGuardar?: (p: { lat: number; lng: number }) => Promise<void>;
}

const REGION_SV = { latitude: 13.7, longitude: -88.9, latitudeDelta: 1.6, longitudeDelta: 1.9 };

export default function UbicacionPrecisaModal({
  visible, onClose, departamento, distrito, puntoGuardado, soloLectura, onGuardar,
}: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const geo = useMemo(() => getDistritoGeo(departamento, distrito), [departamento, distrito]);
  const region = useMemo(() => regionDistrito(geo) ?? REGION_SV, [geo]);

  const [marker, setMarker] = useState<{ latitude: number; longitude: number } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (visible) {
      setMarker(puntoGuardado ? { latitude: puntoGuardado.lat, longitude: puntoGuardado.lng } : null);
      setGuardando(false);
      setErr('');
    }
  }, [visible, puntoGuardado]);

  const editable = !soloLectura && !!onGuardar;
  const dentro = marker ? puntoEnDistrito(marker.longitude, marker.latitude, geo) : false;
  const puedeGuardar = editable && !!marker && dentro && !guardando;

  const guardar = async () => {
    if (!puedeGuardar || !marker || !onGuardar) return;
    setGuardando(true);
    setErr('');
    try {
      await onGuardar({ lat: marker.latitude, lng: marker.longitude });
      onClose();
    } catch (e: any) {
      setErr(e?.message || 'No se pudo guardar la ubicación.');
      setGuardando(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.header}>
            <Text style={s.title}>{soloLectura ? 'Tu ubicación registrada' : 'Registra tu ubicación'}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar">
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {!geo ? (
            <View style={s.sinGeo}>
              <Ionicons name="alert-circle-outline" size={30} color={colors.textMuted} />
              <Text style={s.sinGeoTxt}>
                No pudimos ubicar el mapa de tu distrito. Revisa que tu departamento y distrito estén bien escritos en &quot;Datos&quot;.
              </Text>
            </View>
          ) : (
            <>
              <Text style={s.sub} noTranslate>
                {distrito}, {departamento}
              </Text>
              <View style={s.mapWrap}>
                <MapViewer
                  mapRegion={region}
                  markerPos={marker}
                  onMapPress={editable ? setMarker : undefined}
                />
              </View>

              {soloLectura ? (
                <Text style={s.hint}>Este es el punto exacto que registraste dentro de tu distrito.</Text>
              ) : (
                <>
                  <Text style={s.hint}>
                    Toca el mapa para marcar tu punto exacto. Debe quedar dentro de tu distrito.
                  </Text>
                  <View style={s.estadoRow}>
                    <Ionicons
                      name={!marker ? 'ellipse-outline' : dentro ? 'checkmark-circle' : 'close-circle'}
                      size={16}
                      color={!marker ? colors.textMuted : dentro ? colors.success : colors.error}
                    />
                    <Text
                      style={[
                        s.estadoTxt,
                        { color: !marker ? colors.textMuted : dentro ? colors.success : colors.error },
                      ]}
                    >
                      {!marker
                        ? 'Aún no marcas un punto.'
                        : dentro
                          ? 'Tu punto está dentro de tu distrito.'
                          : 'El punto debe estar dentro de tu distrito.'}
                    </Text>
                  </View>
                </>
              )}

              {!!err && <Text style={s.err}>{err}</Text>}

              <View style={s.botones}>
                <TouchableOpacity style={s.btnGhost} onPress={onClose} disabled={guardando}>
                  <Text style={s.btnGhostTxt}>{soloLectura ? 'Cerrar' : 'Cancelar'}</Text>
                </TouchableOpacity>
                {editable && (
                  <TouchableOpacity
                    style={[s.btnPrimary, !puedeGuardar && { opacity: 0.5 }]}
                    onPress={guardar}
                    disabled={!puedeGuardar}
                  >
                    {guardando
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={s.btnPrimaryTxt}>Guardar ubicación</Text>}
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: GradlyColors) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(7,5,15,0.85)', justifyContent: 'center', alignItems: 'center', padding: 18 },
    card: {
      width: '100%', maxWidth: 460, borderRadius: 20, padding: 18, gap: 10,
      backgroundColor: c.backgroundCard, borderWidth: 1, borderColor: c.border,
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { fontSize: 17, fontFamily: FONTS.soraBold, color: c.textPrimary },
    sub: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: c.primaryLight },
    mapWrap: { height: 300, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: c.border, backgroundColor: c.backgroundSurface },
    hint: { fontSize: 12, fontFamily: FONTS.interRegular, color: c.textMuted, lineHeight: 17 },
    estadoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    estadoTxt: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, flex: 1 },
    err: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: c.error },
    sinGeo: { alignItems: 'center', gap: 10, paddingVertical: 22 },
    sinGeoTxt: { fontSize: 13, fontFamily: FONTS.interRegular, color: c.textSecondary, textAlign: 'center', lineHeight: 19, paddingHorizontal: 12 },
    botones: { flexDirection: 'row', gap: 10, marginTop: 4 },
    btnGhost: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: c.border },
    btnGhostTxt: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: c.textMuted },
    btnPrimary: { flex: 1.4, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: c.primary },
    btnPrimaryTxt: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: '#fff' },
  });
