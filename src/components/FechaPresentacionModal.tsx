import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import { showAlert } from './AppAlert';
import CalendarPickerModal from './CalendarPickerModal';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { textoHorario } from '../data/disponibilidad';
import { abrirChatDirectoEmpresaEstudiante } from '../services/chatService';
import { fijarFechaPresentacion, type AsignacionCupo } from '../services/reclamoCuposService';

interface Props {
  visible: boolean;
  asignacion: AsignacionCupo | null;
  /** uid de la empresa dueña (para abrir el chat con el estudiante). */
  empresaId: string;
  empresaNombre: string;
  onClose: () => void;
  /** Se llama tras guardar/editar la fecha, para que el padre refresque. */
  onGuardado?: () => void;
  /** Abrir el perfil del estudiante (opcional). */
  onVerPerfil?: (estudianteId: string) => void;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseISO = (s?: string | null): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? '').trim());
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const fechaLarga = (d: Date) =>
  d.toLocaleDateString('es-SV', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/**
 * La empresa fija (o edita) el "Día 1" de un estudiante inscrito: el día que se
 * presenta por primera vez. Desde ese día la Fase D cuenta sus horas. Incluye un
 * atajo para chatear con el estudiante y coordinar ese día.
 */
export default function FechaPresentacionModal({
  visible, asignacion, empresaId, empresaNombre, onClose, onGuardado, onVerPerfil,
}: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  const [calAbierto, setCalAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [abriendoChat, setAbriendoChat] = useState(false);

  if (!visible || !asignacion) return null;

  const fechaActual = parseISO(asignacion.fechaPresentacion);
  const hoy = startOfDay(new Date());
  const maxDate = new Date(hoy.getFullYear() + 2, hoy.getMonth(), hoy.getDate());

  const guardar = async (dia: Date) => {
    setCalAbierto(false);
    setGuardando(true);
    try {
      await fijarFechaPresentacion(asignacion.id, toISO(dia));
      onGuardado?.();
      showAlert('Primer día guardado', `${asignacion.estudianteNombre || 'El estudiante'} debe presentarse el ${fechaLarga(dia)}.`);
      onClose();
    } catch (e: any) {
      showAlert('No se pudo guardar', e?.message ?? 'Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const chatearConEstudiante = async () => {
    if (!asignacion.estudianteId || abriendoChat) return;
    setAbriendoChat(true);
    try {
      const chatId = await abrirChatDirectoEmpresaEstudiante({
        empresaId,
        empresaNombre,
        estudianteId: asignacion.estudianteId,
        estudianteNombre: asignacion.estudianteNombre || 'Estudiante',
        contexto: 'candidatura',
      });
      onClose();
      router.push({ pathname: '/ChatScreen', params: { chatId, peerName: asignacion.estudianteNombre || 'Estudiante' } } as any);
    } catch {
      showAlert('Error', 'No se pudo abrir el chat con el estudiante.');
    } finally {
      setAbriendoChat(false);
    }
  };

  return (
    <>
      <Modal visible transparent animationType="none" onRequestClose={onClose}>
        <View style={s.overlay}>
          <View style={s.card}>
            <View style={s.headerRow}>
              <Text style={s.titulo} numberOfLines={2}>
                Primer día de {asignacion.estudianteNombre || 'estudiante'}
              </Text>
              <TouchableOpacity onPress={onClose} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={s.subtitulo}>
              El día que se presente por primera vez a la empresa cuenta como el Día 1. Desde ahí se
              cuentan sus horas de práctica.
            </Text>

            {!!asignacion.vacanteTitulo && (
              <Text style={s.meta} noTranslate>{asignacion.vacanteTitulo}</Text>
            )}
            {!!textoHorario(asignacion.horario) && (
              <Text style={s.meta}>{textoHorario(asignacion.horario)}</Text>
            )}

            {/* Estado actual del Día 1 */}
            <View style={s.fechaBox}>
              <Ionicons
                name={fechaActual ? 'calendar' : 'calendar-outline'}
                size={18}
                color={fechaActual ? colors.success : colors.textMuted}
              />
              <Text style={[s.fechaTxt, fechaActual && { color: colors.textPrimary }]}>
                {fechaActual ? fechaLarga(fechaActual) : 'Sin definir todavía'}
              </Text>
            </View>

            <TouchableOpacity
              style={[s.btnPrimary, guardando && { opacity: 0.6 }]}
              activeOpacity={0.85}
              disabled={guardando}
              onPress={() => setCalAbierto(true)}
            >
              {guardando
                ? <ActivityIndicator size="small" color="#fff" />
                : (
                  <Text style={s.btnPrimaryTxt}>
                    {fechaActual ? 'Editar primer día' : 'Establecer primer día'}
                  </Text>
                )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.btnSecundario, abriendoChat && { opacity: 0.6 }]}
              activeOpacity={0.85}
              disabled={abriendoChat}
              onPress={chatearConEstudiante}
            >
              <Ionicons name="chatbubbles-outline" size={16} color={colors.primaryLight} />
              <Text style={s.btnSecundarioTxt}>Coordinar por chat con el estudiante</Text>
            </TouchableOpacity>

            {!!onVerPerfil && asignacion.estudianteId && (
              <TouchableOpacity
                style={s.verPerfilRow}
                activeOpacity={0.7}
                onPress={() => { onClose(); onVerPerfil(asignacion.estudianteId); }}
              >
                <Ionicons name="person-outline" size={15} color={colors.textMuted} />
                <Text style={s.verPerfilTxt}>Ver perfil del estudiante</Text>
                <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      <CalendarPickerModal
        visible={calAbierto}
        value={fechaActual ?? hoy}
        minimumDate={new Date(hoy.getFullYear() - 1, hoy.getMonth(), hoy.getDate())}
        maximumDate={maxDate}
        title="Primer día del estudiante"
        onSelect={guardar}
        onClose={() => setCalAbierto(false)}
      />
    </>
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
      borderRadius: 22, borderWidth: 1, borderColor: COLORS.border,
      padding: 22,
    },
    headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    titulo: { flex: 1, fontSize: 17, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
    subtitulo: {
      fontSize: 12.5, fontFamily: FONTS.interRegular, color: COLORS.textSecondary,
      lineHeight: 18, marginTop: 10,
    },
    meta: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted, marginTop: 6 },
    fechaBox: {
      flexDirection: 'row', alignItems: 'center', gap: 9,
      backgroundColor: COLORS.backgroundSurface,
      borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
      paddingHorizontal: 13, paddingVertical: 12, marginTop: 16,
    },
    fechaTxt: { flex: 1, fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.textMuted },
    btnPrimary: {
      marginTop: 14, backgroundColor: COLORS.primary,
      borderRadius: 13, paddingVertical: 13, alignItems: 'center',
    },
    btnPrimaryTxt: { color: '#fff', fontFamily: FONTS.interSemiBold, fontSize: 14 },
    btnSecundario: {
      marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
      borderRadius: 13, borderWidth: 1, borderColor: COLORS.border, paddingVertical: 12,
    },
    btnSecundarioTxt: { color: COLORS.primaryLight, fontFamily: FONTS.interSemiBold, fontSize: 13 },
    verPerfilRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border,
    },
    verPerfilTxt: { flex: 1, fontSize: 12.5, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  });
