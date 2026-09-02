import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { getComprobante, type Comprobante } from '../services/comprobanteService';
import { AutoText as Text } from './AutoText';

interface Props {
  visible: boolean;
  /** Id de la `asignaciones_cupo` (= id del comprobante). */
  asignacionId: string | null;
  onClose: () => void;
}

/**
 * Modal informativo que se abre al tocar una notificación `comprobante:{id}`.
 * Lee el estado del comprobante y cuenta en qué punto va el proceso; el caso
 * principal es `validado` → "la universidad validó la pasantía, proceso 100%
 * culminado".
 */
export default function ComprobanteInfoModal({ visible, asignacionId, onClose }: Props) {
  const { colors } = useTheme();
  const { rol } = useAuth();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [comp, setComp] = useState<Comprobante | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!visible || !asignacionId) return;
    let vivo = true;
    setCargando(true);
    getComprobante(asignacionId)
      .then(c => { if (vivo) { setComp(c); setCargando(false); } })
      .catch(() => { if (vivo) { setComp(null); setCargando(false); } });
    return () => { vivo = false; };
  }, [visible, asignacionId]);

  const validado = comp?.estado === 'validado';
  const enviado = comp?.estado === 'enviado';

  let titulo = 'Comprobante de finalización';
  let cuerpo =
    'El comprobante de tu pasantía está en trámite. Sigue su avance desde la tarjeta de tu inicio.';
  if (validado) {
    titulo = 'Pasantía validada';
    cuerpo =
      rol === 'estudiante'
        ? `Tu universidad validó tu comprobante de finalización${comp?.horasCumplidas ? ` y acreditó ${comp.horasCumplidas} horas de práctica a tu expediente` : ''}. El proceso quedó 100% culminado.`
        : 'La universidad validó el comprobante de finalización. El proceso quedó 100% culminado.';
  } else if (enviado) {
    titulo = 'Comprobante en revisión';
    cuerpo =
      rol === 'universidad'
        ? 'Tienes un comprobante de finalización por revisar y validar. Ábrelo desde la tarjeta de tu inicio.'
        : 'El comprobante fue enviado a la universidad. Falta que lo valide para cerrar el proceso.';
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={[s.iconWrap, validado && { backgroundColor: colors.success + '1f' }]}>
            <Ionicons
              name={validado ? 'checkmark-circle' : 'document-text'}
              size={28}
              color={validado ? colors.success : colors.primaryLight}
            />
          </View>
          <Text style={s.titulo}>{titulo}</Text>
          <Text style={s.cuerpo}>{cargando ? 'Cargando…' : cuerpo}</Text>
          <TouchableOpacity style={s.btn} onPress={onClose} activeOpacity={0.85}>
            <Text style={s.btnText}>Entendido</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (COLORS: GradlyColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(7,5,15,0.75)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 22,
    },
    card: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: COLORS.backgroundCard,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: COLORS.border,
      padding: 24,
      alignItems: 'center',
    },
    iconWrap: {
      width: 54,
      height: 54,
      borderRadius: 27,
      backgroundColor: COLORS.primary12,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    titulo: { fontSize: 17, fontFamily: FONTS.soraBold, color: COLORS.textPrimary, textAlign: 'center' },
    cuerpo: {
      fontSize: 13,
      fontFamily: FONTS.interRegular,
      color: COLORS.textSecondary,
      textAlign: 'center',
      marginTop: 10,
      lineHeight: 19,
    },
    btn: {
      marginTop: 20,
      width: '100%',
      backgroundColor: COLORS.primary,
      borderRadius: 14,
      paddingVertical: 13,
      alignItems: 'center',
    },
    btnText: { color: '#fff', fontFamily: FONTS.interSemiBold, fontSize: 14 },
  });
