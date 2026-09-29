import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import { showAlert } from './AppAlert';
import CalendarPickerModal from './CalendarPickerModal';
import { db } from '../config/firebaseConfig';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { textoHorario } from '../data/disponibilidad';
import { abrirChatDirectoEmpresaEstudiante, abrirChatDirectoUsuarios } from '../services/chatService';
import { COLECCION_ASIGNACIONES, fijarFechaPresentacion, type AsignacionCupo } from '../services/reclamoCuposService';

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
  /** Abrir "Ajustar asistencia" (días no computados) para esta asignación.
   *  El padre cierra este modal y abre el suyo (mismo patrón que onVerPerfil). */
  onAjustarAsistencia?: (asignacion: AsignacionCupo) => void;
  /** Abrir "Terminar pasantía" (despido/renuncia, Fase 5) para esta asignación. */
  onTerminarPasantia?: (asignacion: AsignacionCupo) => void;
  /** Abrir "Asignar tutor" (rol "tutor", Fase 2) para esta asignación. */
  onAsignarTutor?: (asignacion: AsignacionCupo) => void;
  /** Abrir el calendario de asistencia + observaciones del tutor (Fase 3) para
   *  esta asignación — la empresa puede además actuar (confirmar salida,
   *  salida anticipada, corrección manual), igual que el tutor. */
  onVerCalendario?: (asignacion: AsignacionCupo) => void;
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
  onAjustarAsistencia, onTerminarPasantia, onAsignarTutor, onVerCalendario,
}: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  const [calAbierto, setCalAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [abriendoChat, setAbriendoChat] = useState(false);
  const [abriendoChatTutor, setAbriendoChatTutor] = useState(false);

  // Cuántos pasantes tiene A CARGO ahora mismo el tutor asignado — declarado
  // ANTES del early return de abajo para no romper las reglas de hooks.
  // No reutiliza useInscripcionesActivas: ese hook no excluye los cupos ya
  // finalizada:true, y aquí hace falta el mismo criterio exacto que ya usa
  // AsignarTutorModal.tsx para su propio contador.
  const tutorId = asignacion?.tutorId ?? null;
  const [cantidadPasantesTutor, setCantidadPasantesTutor] = useState(0);
  useEffect(() => {
    if (!tutorId) { setCantidadPasantesTutor(0); return; }
    const unsub = onSnapshot(
      query(collection(db, COLECCION_ASIGNACIONES), where('tutorId', '==', tutorId), where('estado', '==', 'tomado')),
      snap => setCantidadPasantesTutor(snap.docs.filter(d => (d.data() as any).finalizada !== true).length),
      () => setCantidadPasantesTutor(0),
    );
    return unsub;
  }, [tutorId]);

  if (!visible || !asignacion) return null;

  const fechaActual = parseISO(asignacion.fechaPresentacion);
  const hoy = startOfDay(new Date());
  const maxDate = new Date(hoy.getFullYear() + 2, hoy.getMonth(), hoy.getDate());
  // Desde el propio Día 1 (o después) el primer día ya no se edita: el conteo de
  // horas arrancó ese día y moverlo cambiaría lo ya contado. También deja de
  // hacer falta "coordinar" el arranque, así que el atajo del chat pasa a ser un
  // simple "Contacta al estudiante".
  const primerDiaLlego = !!fechaActual && fechaActual.getTime() <= hoy.getTime();
  // Rol "tutor" (Fase 2): asignar un tutor es requisito SOLO para fijar el
  // primer día por PRIMERA VEZ — una pasantía que ya tenía fecha antes de
  // esta fase (o cualquier caso legado sin tutor) sigue editándose normal,
  // sin quedar bloqueada retroactivamente por un requisito que no existía
  // cuando se creó.
  const requiereTutorPrimero = !fechaActual && !asignacion.tutorId;

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

  const chatearConTutor = async () => {
    if (!tutorId || abriendoChatTutor) return;
    setAbriendoChatTutor(true);
    try {
      const chatId = await abrirChatDirectoUsuarios({
        yo: { uid: empresaId, nombre: empresaNombre || 'Empresa', rol: 'empresa' },
        otro: { uid: tutorId, nombre: asignacion.tutorNombre || 'Tutor', rol: 'tutor' },
      });
      onClose();
      router.push({ pathname: '/ChatScreen', params: { chatId, peerName: asignacion.tutorNombre || 'Tutor' } } as any);
    } catch {
      showAlert('Error', 'No se pudo abrir el chat con el tutor.');
    } finally {
      setAbriendoChatTutor(false);
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

            {/* Tutor asignado (rol "tutor", Fase 2) — arriba del botón de
                primer día a propósito: la empresa debe elegir tutor antes de
                poder fijar el Día 1 por primera vez. */}
            {!!onAsignarTutor && (
              <View style={s.tutorBox}>
                <TouchableOpacity
                  style={s.tutorBoxFila}
                  activeOpacity={0.8}
                  onPress={() => onAsignarTutor(asignacion)}
                >
                  <Ionicons
                    name={asignacion.tutorId ? 'person' : 'person-add-outline'}
                    size={17}
                    color={asignacion.tutorId ? colors.success : colors.warning}
                  />
                  <Text style={[s.tutorTxt, asignacion.tutorId && { color: colors.textPrimary }]} noTranslate>
                    {asignacion.tutorId ? `Tutor: ${asignacion.tutorNombre}` : 'Sin tutor asignado'}
                  </Text>
                  <Text style={s.tutorAccion}>{asignacion.tutorId ? 'Cambiar' : 'Asignar tutor'}</Text>
                </TouchableOpacity>

                {!!asignacion.tutorId && (
                  <View style={s.tutorBoxFila2}>
                    <TouchableOpacity
                      style={[s.tutorChatBtn, abriendoChatTutor && { opacity: 0.6 }]}
                      activeOpacity={0.85}
                      disabled={abriendoChatTutor}
                      onPress={chatearConTutor}
                    >
                      {abriendoChatTutor
                        ? <ActivityIndicator size="small" color={colors.primaryLight} />
                        : (
                          <>
                            <Ionicons name="chatbubbles-outline" size={15} color={colors.primaryLight} />
                            <Text style={s.tutorChatBtnTxt}>Chatear</Text>
                          </>
                        )}
                    </TouchableOpacity>
                    <View style={s.tutorContador}>
                      <Ionicons name="people-outline" size={13} color={colors.textMuted} />
                      <Text style={s.tutorContadorTxt} noTranslate>{cantidadPasantesTutor}</Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            <TouchableOpacity
              style={[s.btnPrimary, (guardando || primerDiaLlego || requiereTutorPrimero) && { opacity: (primerDiaLlego || requiereTutorPrimero) ? 0.4 : 0.6 }]}
              activeOpacity={0.85}
              disabled={guardando || primerDiaLlego || requiereTutorPrimero}
              accessibilityState={{ disabled: guardando || primerDiaLlego || requiereTutorPrimero }}
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
            {requiereTutorPrimero && (
              <Text style={s.tutorHint}>Asigna un tutor arriba para poder fijar el primer día.</Text>
            )}

            <TouchableOpacity
              style={[s.btnSecundario, abriendoChat && { opacity: 0.6 }]}
              activeOpacity={0.85}
              disabled={abriendoChat}
              onPress={chatearConEstudiante}
            >
              <Ionicons name="chatbubbles-outline" size={16} color={colors.primaryLight} />
              <Text style={s.btnSecundarioTxt}>
                {primerDiaLlego ? 'Contacta al estudiante' : 'Coordinar por chat con el estudiante'}
              </Text>
            </TouchableOpacity>

            {/* Calendario de asistencia + observaciones (Fase 3 del rol
                "tutor"): mismo requisito que "Ajustar asistencia", solo tiene
                sentido con el Día 1 ya fijado. */}
            {!!onVerCalendario && !!fechaActual && (
              <TouchableOpacity
                style={s.btnSecundario}
                activeOpacity={0.85}
                onPress={() => onVerCalendario(asignacion)}
              >
                <Ionicons name="calendar-outline" size={16} color={colors.primaryLight} />
                <Text style={s.btnSecundarioTxt}>Ver calendario y observaciones</Text>
              </TouchableOpacity>
            )}

            {/* Días no computados: solo tiene sentido una vez que hay Día 1
                fijado (si no, todavía no hay ningún día programado que excusar). */}
            {!!onAjustarAsistencia && !!fechaActual && (
              <TouchableOpacity
                style={s.btnSecundario}
                activeOpacity={0.85}
                onPress={() => onAjustarAsistencia(asignacion)}
              >
                <Ionicons name="calendar-clear-outline" size={16} color={colors.primaryLight} />
                <Text style={s.btnSecundarioTxt}>Ajustar asistencia</Text>
              </TouchableOpacity>
            )}

            {/* Terminar pasantía (despido/renuncia): solo tiene sentido con
                Día 1 ya fijado — antes de eso, la pasantía ni ha empezado. */}
            {!!onTerminarPasantia && !!fechaActual && (
              <TouchableOpacity
                style={s.btnPeligro}
                activeOpacity={0.85}
                onPress={() => onTerminarPasantia(asignacion)}
              >
                <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
                <Text style={s.btnPeligroTxt}>Terminar pasantía</Text>
              </TouchableOpacity>
            )}

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
    tutorBox: {
      backgroundColor: COLORS.backgroundSurface,
      borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
      paddingHorizontal: 13, paddingVertical: 11, marginTop: 10, gap: 10,
    },
    tutorBoxFila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    tutorBoxFila2: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10,
    },
    tutorTxt: { flex: 1, fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: COLORS.textMuted },
    tutorAccion: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },
    tutorChatBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      borderWidth: 1, borderColor: COLORS.primary35, borderRadius: 10,
      paddingHorizontal: 11, paddingVertical: 7, backgroundColor: COLORS.primary12,
    },
    tutorChatBtnTxt: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },
    tutorContador: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    tutorContadorTxt: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: COLORS.textMuted },
    tutorHint: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.warning, marginTop: 6, textAlign: 'center' },
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
    btnPeligro: {
      marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
      borderRadius: 13, borderWidth: 1, borderColor: COLORS.error + '55', paddingVertical: 12,
    },
    btnPeligroTxt: { color: COLORS.error, fontFamily: FONTS.interSemiBold, fontSize: 13 },
    verPerfilRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border,
    },
    verPerfilTxt: { flex: 1, fontSize: 12.5, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  });
