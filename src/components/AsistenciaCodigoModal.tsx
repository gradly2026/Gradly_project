import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { generarCodigoDeHoy, type CodigoAsistencia } from '../services/asistenciaCodigoService';

// ════════════════════════════════════════════════════════════════════
//  AsistenciaCodigoModal — el estudiante pide su código de asistencia de
//  hoy y se lo muestra a su empresa (o a la persona que le da seguimiento
//  ahí) para que lo ingresen desde su panel. Un solo código por día,
//  válido hasta la medianoche.
// ════════════════════════════════════════════════════════════════════

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function AsistenciaCodigoModal({ visible, onClose }: Props) {
  const { colors: C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  const [cargando, setCargando] = useState(true);
  const [datos, setDatos] = useState<CodigoAsistencia | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancel = false;
    setCargando(true);
    setError(null);
    setDatos(null);
    (async () => {
      try {
        const d = await generarCodigoDeHoy();
        if (!cancel) setDatos(d);
      } catch (e: any) {
        if (!cancel) setError(e?.message ?? 'No se pudo generar tu código.');
      } finally {
        if (!cancel) setCargando(false);
      }
    })();
    return () => { cancel = true; };
  }, [visible]);

  if (!visible) return null;

  const codigoEspaciado = datos ? datos.codigo.split('').join(' ') : '';
  const rango = datos?.horaInicio && datos?.horaFin ? `${datos.horaInicio} - ${datos.horaFin}` : null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.headerRow}>
            <Text style={s.titulo}>Asistencia de hoy</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          {cargando ? (
            <View style={{ paddingVertical: 32, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={C.primary} />
            </View>
          ) : error ? (
            <View style={{ paddingVertical: 12, gap: 12 }}>
              <View style={s.errorBox}>
                <Ionicons name="alert-circle-outline" size={18} color={C.error} />
                <Text style={s.errorTxt}>{error}</Text>
              </View>
              <TouchableOpacity style={s.btnSecundario} activeOpacity={0.85} onPress={onClose}>
                <Text style={s.btnSecundarioTxt}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          ) : datos ? (
            <>
              <Text style={s.subtitulo}>
                Muéstrale este código a tu empresa para que registren tu asistencia de hoy.
              </Text>
              <View style={s.codigoBox}>
                <Text style={s.codigoTxt} noTranslate>{codigoEspaciado}</Text>
              </View>
              <View style={s.metaRow}>
                <Ionicons name="briefcase-outline" size={14} color={C.textMuted} />
                <Text style={s.metaTxt}>Día {datos.diaN} de práctica</Text>
              </View>
              {!!rango && (
                <View style={s.metaRow}>
                  <Ionicons name="time-outline" size={14} color={C.textMuted} />
                  <Text style={s.metaTxt} noTranslate>{rango}</Text>
                </View>
              )}
              <Text style={s.nota}>Válido solo por hoy. No lo compartas por chat ni redes.</Text>
              <TouchableOpacity style={s.btnPrimary} activeOpacity={0.85} onPress={onClose}>
                <Text style={s.btnPrimaryTxt}>Listo</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (C: GradlyColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1, backgroundColor: 'rgba(7,5,15,0.75)',
      justifyContent: 'center', alignItems: 'center', padding: 22,
    },
    card: {
      width: '100%', maxWidth: 380,
      backgroundColor: C.backgroundCard,
      borderRadius: 22, borderWidth: 1, borderColor: C.border,
      padding: 22,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    titulo: { fontSize: 17, fontFamily: FONTS.soraBold, color: C.textPrimary },
    subtitulo: {
      fontSize: 12.5, fontFamily: FONTS.interRegular, color: C.textSecondary,
      lineHeight: 18, marginTop: 10, marginBottom: 16, textAlign: 'center',
    },
    codigoBox: {
      backgroundColor: C.backgroundSurface, borderWidth: 1, borderColor: C.primary + '55',
      borderRadius: 16, paddingVertical: 18, alignItems: 'center', marginBottom: 16,
    },
    codigoTxt: { fontSize: 26, fontFamily: FONTS.soraBold, color: C.primaryLight, letterSpacing: 2 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
    metaTxt: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: C.textSecondary },
    nota: {
      fontSize: 11, fontFamily: FONTS.interRegular, color: C.textMuted,
      textAlign: 'center', marginTop: 6, marginBottom: 16, fontStyle: 'italic',
    },
    errorBox: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 9,
      backgroundColor: C.error + '18', borderWidth: 1, borderColor: C.error + '40',
      borderRadius: 12, padding: 12,
    },
    errorTxt: { flex: 1, fontSize: 12.5, fontFamily: FONTS.interRegular, color: C.textPrimary, lineHeight: 18 },
    btnPrimary: { backgroundColor: C.primary, borderRadius: 13, paddingVertical: 13, alignItems: 'center' },
    btnPrimaryTxt: { color: '#fff', fontFamily: FONTS.interSemiBold, fontSize: 14 },
    btnSecundario: {
      borderRadius: 13, borderWidth: 1, borderColor: C.border, paddingVertical: 12, alignItems: 'center',
    },
    btnSecundarioTxt: { color: C.primaryLight, fontFamily: FONTS.interSemiBold, fontSize: 13 },
  });
