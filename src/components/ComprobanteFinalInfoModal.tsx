import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { abrirChatDirectoUsuarios } from '../services/chatService';
import { showAlert } from './AppAlert';
import { AutoText as Text } from './AutoText';

const C = {
  overlay: 'rgba(7,5,15,0.92)',
  surface: '#0d0b1e',
  border: 'rgba(139,92,246,0.25)',
  text: '#f4f1ff',
  textSub: 'rgba(255,255,255,0.65)',
  accent: '#8b5cf6',
  green: '#34d399',
};

interface Props {
  /** 'estudiante' → "tu comprobante está en camino"; 'universidad' → "contacta a la empresa". */
  variante: 'estudiante' | 'universidad';
  /** Solo 'universidad': empresa con la que ofrecer el chat (si el lote es de una sola). */
  empresa?: { uid?: string; nombre?: string } | null;
  onCerrar: () => void;
}

/**
 * Pantalla informativa que cierra el flujo de culminación (después de las
 * evaluaciones). No decide nada — solo cuenta qué sigue con el comprobante.
 */
export default function ComprobanteFinalInfoModal({ variante, empresa, onCerrar }: Props) {
  const { user, userProfile } = useAuth();
  const [abriendoChat, setAbriendoChat] = useState(false);

  const esEstudiante = variante === 'estudiante';
  const puedeChat = variante === 'universidad' && !!empresa?.uid && !!user?.uid;

  const irAlChat = async () => {
    if (!user?.uid || !empresa?.uid || abriendoChat) return;
    setAbriendoChat(true);
    try {
      await abrirChatDirectoUsuarios({
        yo: {
          uid: user.uid,
          nombre: (userProfile as any)?.nombre_universidad ?? (userProfile as any)?.nombre ?? 'Universidad',
          rol: 'universidad',
        },
        otro: { uid: empresa.uid, nombre: empresa.nombre ?? 'Empresa', rol: 'empresa' },
      });
      onCerrar();
    } catch {
      showAlert('No se pudo abrir el chat', 'Escríbele a la empresa desde la sección Mensajes.');
      setAbriendoChat(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCerrar}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.iconWrap}>
            <Ionicons
              name={esEstudiante ? 'ribbon' : 'document-text'}
              size={30}
              color={C.accent}
            />
          </View>

          <Text style={styles.titulo}>
            {esEstudiante ? 'Tu comprobante está en camino' : 'Comprobante de finalización en camino'}
          </Text>

          <Text style={styles.cuerpo}>
            {esEstudiante
              ? 'Tu universidad y la empresa recibirán el comprobante que certifica que culminaste tu pasantía y cumpliste tus horas de práctica laboral. Mientras tanto, ya puedes explorar las vacantes de trabajo.'
              : 'Ponte en contacto con la empresa sobre la pronta recepción del comprobante de finalización. Cuando lo envíe, podrás revisarlo y validarlo desde tu inicio.'}
          </Text>

          {puedeChat ? (
            <TouchableOpacity style={styles.btn} onPress={irAlChat} disabled={abriendoChat} activeOpacity={0.9}>
              {abriendoChat ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="chatbubble-ellipses" size={16} color="#fff" />
                  <Text style={styles.btnText}>Escribir a la empresa</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={puedeChat ? styles.btnLink : styles.btn}
            onPress={onCerrar}
            activeOpacity={0.85}
          >
            <Text style={puedeChat ? styles.btnLinkText : styles.btnText}>Entendido</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: C.overlay, justifyContent: 'center', padding: 18 },
  sheet: {
    backgroundColor: C.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    padding: 24,
    alignItems: 'center',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(139,92,246,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  titulo: { color: C.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  cuerpo: {
    color: C.textSub,
    fontSize: 13.5,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 20,
    width: '100%',
  },
  btnText: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
  btnLink: { marginTop: 12, paddingVertical: 6, alignItems: 'center' },
  btnLinkText: { color: C.textSub, fontSize: 13, fontWeight: '700' },
});
