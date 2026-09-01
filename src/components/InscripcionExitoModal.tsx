import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import { showAlert } from './AppAlert';
import { db } from '../config/firebaseConfig';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { textoHorario } from '../data/disponibilidad';
import { abrirChatDirectoEmpresaEstudiante } from '../services/chatService';

interface Props {
  visible: boolean;
  vacanteTitulo: string;
  empresaId: string;
  empresaNombre: string;
  /** Horario declarado de la vacante (para el resumen). */
  horario?: any;
  /** Grupo del estudiante — para leer las horas a cumplir. */
  grupoId?: string | null;
  estudianteId: string;
  estudianteNombre: string;
  onClose: () => void;
}

/**
 * Modal de éxito tras inscribirse a una pasantía por autoservicio (botón
 * "Inscribir"). Confirma que ya está DENTRO, resume la pasantía y las horas a
 * cumplir, y empuja a coordinar por chat con la empresa el día de presentación
 * física — ese día es el que la empresa fija como "Día 1" (ver Fase C/D).
 */
export default function InscripcionExitoModal({
  visible, vacanteTitulo, empresaId, empresaNombre, horario, grupoId,
  estudianteId, estudianteNombre, onClose,
}: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  const [horasMeta, setHorasMeta] = useState<number | null>(null);
  const [abriendoChat, setAbriendoChat] = useState(false);

  useEffect(() => {
    if (!visible || !grupoId) { setHorasMeta(null); return; }
    let cancel = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'grupos', grupoId));
        if (cancel || !snap.exists()) return;
        const d = snap.data() as any;
        const h = Number(d.horasRequeridas ?? d.total_horas ?? 0);
        setHorasMeta(Number.isFinite(h) && h > 0 ? Math.floor(h) : null);
      } catch { /* no crítico */ }
    })();
    return () => { cancel = true; };
  }, [visible, grupoId]);

  if (!visible) return null;

  const coordinarPorChat = async () => {
    if (abriendoChat) return;
    setAbriendoChat(true);
    try {
      const chatId = await abrirChatDirectoEmpresaEstudiante({
        empresaId,
        empresaNombre,
        estudianteId,
        estudianteNombre,
        contexto: 'candidatura',
      });
      onClose();
      router.push({ pathname: '/ChatScreen', params: { chatId, peerName: empresaNombre } } as any);
    } catch {
      showAlert('Error', 'No se pudo abrir el chat con la empresa.');
    } finally {
      setAbriendoChat(false);
    }
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.iconWrap}>
            <Ionicons name="ribbon" size={28} color={colors.success} />
          </View>

          <Text style={s.titulo}>¡Ya estás en la pasantía!</Text>
          <Text style={s.subtitulo}>
            Quedaste inscrito oficialmente. Tu universidad y la empresa ya fueron notificadas.
          </Text>

          <View style={s.resumen}>
            <Fila icon="business-outline" texto={empresaNombre} s={s} colors={colors} noTranslate />
            <Fila icon="briefcase-outline" texto={vacanteTitulo} s={s} colors={colors} noTranslate />
            {!!textoHorario(horario) && (
              <Fila icon="time-outline" texto={textoHorario(horario) as string} s={s} colors={colors} />
            )}
            {horasMeta !== null && (
              <Fila icon="hourglass-outline" texto={`Deberás cumplir ${horasMeta} horas de práctica`} s={s} colors={colors} />
            )}
          </View>

          <View style={s.nota}>
            <Ionicons name="information-circle-outline" size={15} color={colors.primaryLight} />
            <Text style={s.notaTxt}>
              Coordina con la empresa el día en que te presentas por primera vez: ese día arranca el
              conteo de tus horas. Si no escribes tú, la empresa lo fijará.
            </Text>
          </View>

          <TouchableOpacity
            style={[s.btnPrimary, abriendoChat && { opacity: 0.6 }]}
            activeOpacity={0.85}
            disabled={abriendoChat}
            onPress={coordinarPorChat}
          >
            {abriendoChat
              ? <ActivityIndicator size="small" color="#fff" />
              : (
                <>
                  <Ionicons name="chatbubbles-outline" size={16} color="#fff" />
                  <Text style={s.btnPrimaryTxt}>Escribir a la empresa</Text>
                </>
              )}
          </TouchableOpacity>

          <TouchableOpacity style={s.btnGhost} activeOpacity={0.85} onPress={onClose}>
            <Text style={s.btnGhostTxt}>Ahora no</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function Fila({ icon, texto, s, colors, noTranslate }: {
  icon: keyof typeof Ionicons.glyphMap; texto: string; s: any; colors: GradlyColors; noTranslate?: boolean;
}) {
  return (
    <View style={s.fila}>
      <Ionicons name={icon} size={15} color={colors.textMuted} style={{ width: 22 }} />
      <Text style={s.filaTxt} numberOfLines={2} noTranslate={noTranslate}>{texto}</Text>
    </View>
  );
}

const makeStyles = (COLORS: GradlyColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1, backgroundColor: 'rgba(7,5,15,0.75)',
      justifyContent: 'center', alignItems: 'center', padding: 22,
    },
    card: {
      width: '100%', maxWidth: 400,
      backgroundColor: COLORS.backgroundCard,
      borderRadius: 24, borderWidth: 1, borderColor: COLORS.border,
      padding: 24, alignItems: 'center',
    },
    iconWrap: {
      width: 56, height: 56, borderRadius: 28,
      backgroundColor: `${COLORS.success}1e`,
      alignItems: 'center', justifyContent: 'center', marginBottom: 14,
    },
    titulo: { fontSize: 19, fontFamily: FONTS.soraBold, color: COLORS.textPrimary, textAlign: 'center' },
    subtitulo: {
      fontSize: 12.5, fontFamily: FONTS.interRegular, color: COLORS.textSecondary,
      textAlign: 'center', marginTop: 9, lineHeight: 18,
    },
    resumen: {
      width: '100%', marginTop: 16, gap: 9,
      backgroundColor: COLORS.backgroundSurface,
      borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 13,
    },
    fila: { flexDirection: 'row', alignItems: 'center' },
    filaTxt: { flex: 1, fontSize: 12.5, fontFamily: FONTS.interMedium, color: COLORS.textPrimary },
    nota: {
      flexDirection: 'row', gap: 8, alignItems: 'flex-start',
      width: '100%', marginTop: 14, padding: 12, borderRadius: 12,
      backgroundColor: COLORS.primary12, borderWidth: 1, borderColor: COLORS.border,
    },
    notaTxt: { flex: 1, fontSize: 11.5, fontFamily: FONTS.interRegular, color: COLORS.textSecondary, lineHeight: 16 },
    btnPrimary: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
      marginTop: 18, width: '100%', backgroundColor: COLORS.primary,
      borderRadius: 14, paddingVertical: 13,
    },
    btnPrimaryTxt: { color: '#fff', fontFamily: FONTS.interSemiBold, fontSize: 14 },
    btnGhost: { marginTop: 8, paddingVertical: 10, alignItems: 'center' },
    btnGhostTxt: { color: COLORS.textMuted, fontFamily: FONTS.interMedium, fontSize: 13 },
  });
