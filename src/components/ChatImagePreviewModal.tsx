// ════════════════════════════════════════════════════════════════════════
// ChatImagePreviewModal.tsx — modal flotante que aparece tras elegir una imagen
// en el chat, ANTES de enviarla. Muestra la foto con acciones:
//   · Pantalla completa  → la abre en ChatImageViewerModal
//   · Recortar           → vuelve a abrir el editor nativo del selector
//   · Descartar          → cierra sin enviar
//   · Enviar             → sube la imagen y la manda a la conversación
//
// El recorte lo hace el editor nativo de `expo-image-picker` (`allowsEditing`);
// una rotación persistente antes de enviar necesitaría `expo-image-manipulator`
// (no instalado) — en el visor sí hay un "girar" de solo vista.
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { AutoText as Text } from './AutoText';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import ChatImageViewerModal from './ChatImageViewerModal';

interface Props {
  visible: boolean;
  uri: string | null;
  /** Reabre el selector con su editor de recorte. */
  onRecortar: () => void;
  onDescartar: () => void;
  onEnviar: () => void;
  enviando?: boolean;
}

export default function ChatImagePreviewModal({
  visible,
  uri,
  onRecortar,
  onDescartar,
  onEnviar,
  enviando = false,
}: Props) {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const [verFull, setVerFull] = useState(false);

  return (
    <Modal visible={visible && !!uri} transparent animationType="none" onRequestClose={onDescartar}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.header}>
            <Ionicons name="image-outline" size={18} color={colors.primaryLight} />
            <Text style={s.title}>Enviar imagen</Text>
            <TouchableOpacity onPress={onDescartar} hitSlop={10} disabled={enviando}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={s.imgWrap}
            activeOpacity={0.9}
            onPress={() => setVerFull(true)}
          >
            {uri ? <Image source={{ uri }} style={s.img} resizeMode="cover" /> : null}
            <View style={s.fullHint}>
              <Ionicons name="expand-outline" size={14} color="#fff" />
              <Text style={s.fullHintTxt}>Pantalla completa</Text>
            </View>
          </TouchableOpacity>

          <View style={s.actions}>
            <TouchableOpacity
              style={[s.secBtn, { borderColor: colors.border }]}
              onPress={onRecortar}
              disabled={enviando}
              activeOpacity={0.85}
            >
              <Ionicons name="crop-outline" size={16} color={colors.textSecondary} />
              <Text style={[s.secBtnTxt, { color: colors.textSecondary }]}>Recortar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.secBtn, { borderColor: colors.error + '66' }]}
              onPress={onDescartar}
              disabled={enviando}
              activeOpacity={0.85}
            >
              <Ionicons name="trash-outline" size={16} color={colors.error} />
              <Text style={[s.secBtnTxt, { color: colors.error }]}>Descartar</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[s.sendBtn, { backgroundColor: colors.primary, opacity: enviando ? 0.6 : 1 }]}
            onPress={onEnviar}
            disabled={enviando}
            activeOpacity={0.9}
          >
            {enviando ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="send" size={16} color="#fff" />
                <Text style={s.sendBtnTxt}>Enviar</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ChatImageViewerModal visible={verFull} uri={uri} onClose={() => setVerFull(false)} />
    </Modal>
  );
}

const makeStyles = (C: GradlyColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(7,5,15,0.9)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 18,
    },
    sheet: {
      width: '100%',
      maxWidth: 440,
      alignSelf: 'center',
      backgroundColor: C.backgroundCard,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    title: { flex: 1, fontSize: 14, fontFamily: FONTS.soraSemiBold, color: C.primaryLight },
    imgWrap: {
      margin: 16,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: C.white8,
      aspectRatio: 1,
    },
    img: { width: '100%', height: '100%' },
    fullHint: {
      position: 'absolute',
      bottom: 8,
      right: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: 'rgba(0,0,0,0.6)',
    },
    fullHintTxt: { fontSize: 10, fontFamily: FONTS.interSemiBold, color: '#fff' },
    actions: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 16,
    },
    secBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 11,
    },
    secBtnTxt: { fontSize: 13, fontFamily: FONTS.interSemiBold },
    sendBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      margin: 16,
      borderRadius: 14,
      paddingVertical: 14,
    },
    sendBtnTxt: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: '#fff' },
  });
