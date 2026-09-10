// ════════════════════════════════════════════════════════════════════════
// ChatImageViewerModal.tsx — visor de una imagen del chat a pantalla completa.
// Se abre al tocar una imagen del hilo y desde el modal de previsualización
// (botón "Pantalla completa"). Toque en cualquier parte = cerrar.
//
// "Girar" rota SOLO la vista (transform), no toca el archivo — es una comodidad
// para leer una foto de lado, no una edición. La rotación persistente antes de
// enviar necesitaría `expo-image-manipulator` (no instalado).
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';

interface Props {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
}

export default function ChatImageViewerModal({ visible, uri, onClose }: Props) {
  const [rot, setRot] = useState(0);

  useEffect(() => {
    if (visible) setRot(0);
  }, [visible, uri]);

  return (
    <Modal visible={visible && !!uri} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        {uri ? (
          <Image
            source={{ uri }}
            style={[s.img, { transform: [{ rotate: `${rot}deg` }] }]}
            resizeMode="contain"
          />
        ) : null}
      </Pressable>

      <View style={s.topBar} pointerEvents="box-none">
        <TouchableOpacity style={s.btn} onPress={() => setRot((r) => (r + 90) % 360)} hitSlop={10}>
          <Ionicons name="refresh-outline" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={s.btn} onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={26} color="#fff" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  img: { width: '94%', height: '82%' },
  topBar: {
    position: 'absolute',
    top: 40,
    right: 16,
    flexDirection: 'row',
    gap: 8,
  },
  btn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
