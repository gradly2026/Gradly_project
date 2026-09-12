import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Lleva a la empresa a "Mi ubicación" (Mi Perfil) a registrar su punto. */
  onIrAMiUbicacion: () => void;
}

/**
 * Se muestra cuando la empresa toca "Usar mi ubicación registrada" al crear
 * una pasantía/vacante pero todavía NO tiene un punto guardado en "Mi
 * ubicación" (ver UbicacionPrecisaModal). Es solo informativo: no bloquea
 * seguir publicando a mano, solo explica la ventaja de tener el punto ya
 * verificado para no tener que repetirlo en cada publicación.
 */
export default function UsarUbicacionGuardadaModal({ visible, onClose, onIrAMiUbicacion }: Props) {
  const { colors: C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.iconWrap}>
            <Ionicons name="location-outline" size={28} color={C.primaryLight} />
          </View>
          <Text style={s.titulo}>Aún no tienes una ubicación registrada</Text>
          <Text style={s.cuerpo}>
            Guarda el punto exacto de tu empresa una sola vez en “Mi ubicación” y desde ahí podrás
            cargarlo con un toque cada vez que publiques una pasantía o vacante — más rápido, y le da
            al estudiante un dato verificado de a dónde va a llegar.
          </Text>

          <TouchableOpacity style={s.btnPrimary} onPress={onIrAMiUbicacion} activeOpacity={0.85}>
            <Text style={s.btnPrimaryTxt}>Ir a Mi ubicación</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btnGhost} onPress={onClose} activeOpacity={0.85}>
            <Text style={s.btnGhostTxt}>Entendido</Text>
          </TouchableOpacity>
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
      width: '100%', maxWidth: 400,
      backgroundColor: C.backgroundCard,
      borderRadius: 24, borderWidth: 1, borderColor: C.border,
      padding: 24, alignItems: 'center',
    },
    iconWrap: {
      width: 54, height: 54, borderRadius: 27,
      alignItems: 'center', justifyContent: 'center', marginBottom: 14,
      backgroundColor: C.primaryLight + '1f',
    },
    titulo: { fontSize: 17, fontFamily: FONTS.soraBold, color: C.textPrimary, textAlign: 'center' },
    cuerpo: {
      fontSize: 13, fontFamily: FONTS.interRegular, color: C.textSecondary,
      textAlign: 'center', marginTop: 10, lineHeight: 19,
    },
    btnPrimary: {
      marginTop: 20, width: '100%', backgroundColor: C.primary,
      borderRadius: 14, paddingVertical: 13, alignItems: 'center',
    },
    btnPrimaryTxt: { color: '#fff', fontFamily: FONTS.interSemiBold, fontSize: 14 },
    btnGhost: { marginTop: 10, width: '100%', paddingVertical: 10, alignItems: 'center' },
    btnGhostTxt: { color: C.textMuted, fontFamily: FONTS.interSemiBold, fontSize: 13.5 },
  });
