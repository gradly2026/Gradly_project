// ════════════════════════════════════════════════════════════════════════
// AsignarTutorModal.tsx — la empresa asigna (o reasigna) el tutor de un
// pasante (rol "tutor", Fase 2). Se abre desde FechaPresentacionModal, arriba
// del botón "Establecer/Editar primer día" (mismo patrón de "cerrar un modal
// y abrir el siguiente" que ya usan AjusteAsistenciaModal/TerminarPasantiaModal).
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { ActivityIndicator, Modal, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import { showAlert } from './AppAlert';
import { db } from '../config/firebaseConfig';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { horariosSeSolapan } from '../data/disponibilidad';
import { asignarTutor, type AsignacionCupo } from '../services/reclamoCuposService';
import { suscribirTutoresDeEmpresa, type PerfilTutor } from '../services/tutorService';

interface Props {
  visible: boolean;
  asignacion: AsignacionCupo | null;
  empresaId: string;
  onClose: () => void;
  /** Se llama tras asignar/reasignar con éxito, para que el padre refresque. */
  onAsignado?: () => void;
  /** La empresa no tiene tutores registrados: llevarla a "Mis tutores". */
  onIrAMisTutores?: () => void;
}

const MOTIVO_MIN = 10;

export default function AsignarTutorModal({ visible, asignacion, empresaId, onClose, onAsignado, onIrAMisTutores }: Props) {
  const { colors: C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  const [tutores, setTutores] = useState<PerfilTutor[] | null>(null);
  const [conteos, setConteos] = useState<Map<string, number>>(new Map());
  const [seleccionId, setSeleccionId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSeleccionId(asignacion?.tutorId ?? null);
    setMotivo('');
  }, [visible, asignacion?.id, asignacion?.tutorId]);

  useEffect(() => {
    if (!visible || !empresaId) return;
    return suscribirTutoresDeEmpresa(empresaId, (lista) => setTutores(lista.filter((t) => t.activo)));
  }, [visible, empresaId]);

  // Cuántos pasantes tiene cada tutor ahora mismo — mismo query que ya corre
  // en SeccionActivas, pero como suscripción propia de este modal (el otro
  // sitio que lo abre, CandidatosVacante, no tiene ese dato cargado).
  useEffect(() => {
    if (!visible || !empresaId) return;
    const unsub = onSnapshot(
      query(collection(db, 'asignaciones_cupo'), where('empresaId', '==', empresaId)),
      (snap) => {
        const m = new Map<string, number>();
        snap.docs.forEach((d) => {
          const data = d.data() as AsignacionCupo;
          if (data.estado === 'tomado' && data.finalizada !== true && data.tutorId) {
            m.set(data.tutorId, (m.get(data.tutorId) ?? 0) + 1);
          }
        });
        setConteos(m);
      },
      () => setConteos(new Map()),
    );
    return unsub;
  }, [visible, empresaId]);

  if (!visible || !asignacion) return null;

  const tutorActualId = asignacion.tutorId ?? null;
  const esReasignacion = !!tutorActualId && !!seleccionId && seleccionId !== tutorActualId;
  const motivoValido = motivo.trim().length >= MOTIVO_MIN;
  const puedeConfirmar = !!seleccionId && seleccionId !== tutorActualId && (!esReasignacion || motivoValido);

  const confirmar = async () => {
    if (!puedeConfirmar || guardando || !seleccionId) return;
    const tutor = tutores?.find((t) => t.id === seleccionId);
    if (!tutor) return;
    setGuardando(true);
    try {
      await asignarTutor({
        asignacionId: asignacion.id,
        tutorId: tutor.id,
        tutorNombre: tutor.nombre_completo,
        motivoReasignacion: esReasignacion ? motivo.trim() : undefined,
      });
      onAsignado?.();
      onClose();
      showAlert('Tutor asignado', `${tutor.nombre_completo} ya es el tutor de ${asignacion.estudianteNombre || 'este pasante'}.`);
    } catch (e: any) {
      showAlert('No se pudo asignar', e?.message ?? 'Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const cargando = tutores === null;
  const sinTutores = !cargando && tutores!.length === 0;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.headerRow}>
            <Text style={s.titulo} numberOfLines={2}>
              Tutor de {asignacion.estudianteNombre || 'estudiante'}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          {cargando && (
            <View style={s.loadingBox}>
              <ActivityIndicator size="small" color={C.primaryLight} />
            </View>
          )}

          {sinTutores && (
            <View>
              <Text style={s.subtitulo}>
                Todavía no has registrado ningún tutor. Registra uno en Mi Perfil antes de asignarlo.
              </Text>
              <TouchableOpacity
                style={s.btnPrimary}
                activeOpacity={0.85}
                onPress={() => { onClose(); onIrAMisTutores?.(); }}
              >
                <Text style={s.btnPrimaryTxt}>Ir a Mis tutores</Text>
              </TouchableOpacity>
            </View>
          )}

          {!cargando && !sinTutores && (
            <>
              <Text style={s.subtitulo}>Elige quién supervisará a este pasante en la empresa.</Text>
              <View style={{ gap: 8, marginTop: 4 }}>
                {tutores!.map((t) => {
                  const activo = seleccionId === t.id;
                  const cuenta = conteos.get(t.id) ?? 0;
                  const noSolapa = !!t.horario && !!asignacion.horario && !horariosSeSolapan(t.horario, asignacion.horario);
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[s.tutorRow, activo && s.tutorRowActiva]}
                      activeOpacity={0.8}
                      onPress={() => setSeleccionId(t.id)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[s.tutorNombre, activo && { color: C.primaryLight }]} noTranslate>
                          {t.nombre_completo}
                        </Text>
                        <Text style={s.tutorCargo} noTranslate>{t.cargo}</Text>
                        {noSolapa && (
                          <Text style={s.avisoHorario}>Horario no coincide con el del pasante</Text>
                        )}
                      </View>
                      <View style={s.contadorBadge}>
                        <Text style={s.contadorTxt}>{cuenta}</Text>
                      </View>
                      {activo && <Ionicons name="checkmark-circle" size={18} color={C.primaryLight} />}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {esReasignacion && (
                <>
                  <Text style={s.label}>Motivo del cambio</Text>
                  <TextInput
                    style={s.input}
                    value={motivo}
                    onChangeText={setMotivo}
                    placeholder="Ej. el tutor anterior ya no está disponible…"
                    placeholderTextColor={C.textMuted}
                    multiline
                  />
                  {motivo.trim().length > 0 && !motivoValido && (
                    <Text style={s.errorTxt}>Cuéntanos un poco más: al menos {MOTIVO_MIN} caracteres.</Text>
                  )}
                </>
              )}

              <TouchableOpacity
                style={[s.btnPrimary, (!puedeConfirmar || guardando) && { opacity: 0.5 }]}
                activeOpacity={0.85}
                disabled={!puedeConfirmar || guardando}
                onPress={confirmar}
              >
                {guardando
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.btnPrimaryTxt}>{esReasignacion ? 'Cambiar tutor' : 'Asignar tutor'}</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (C: GradlyColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1, backgroundColor: 'rgba(7,5,15,0.75)',
      justifyContent: 'center', alignItems: 'center', padding: 20,
    },
    card: {
      width: '100%', maxWidth: 420,
      backgroundColor: C.backgroundCard,
      borderRadius: 22, borderWidth: 1, borderColor: C.border,
      padding: 20,
    },
    headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    titulo: { flex: 1, fontSize: 16, fontFamily: FONTS.soraBold, color: C.textPrimary },
    subtitulo: {
      fontSize: 12.5, fontFamily: FONTS.interRegular, color: C.textSecondary,
      lineHeight: 18, marginTop: 8, marginBottom: 12,
    },
    loadingBox: { paddingVertical: 24, alignItems: 'center' },
    tutorRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      borderWidth: 1, borderColor: C.border, borderRadius: 14,
      paddingHorizontal: 13, paddingVertical: 11,
    },
    tutorRowActiva: { borderColor: C.primary, backgroundColor: C.primary + '14' },
    tutorNombre: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: C.textPrimary },
    tutorCargo: { fontSize: 11.5, fontFamily: FONTS.interRegular, color: C.textMuted, marginTop: 1 },
    avisoHorario: { fontSize: 11, fontFamily: FONTS.interRegular, color: C.warning, marginTop: 3 },
    contadorBadge: {
      minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6,
      alignItems: 'center', justifyContent: 'center', backgroundColor: C.backgroundSurface,
    },
    contadorTxt: { fontSize: 11.5, fontFamily: FONTS.interSemiBold, color: C.textMuted },
    label: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: C.textMuted, marginBottom: 7, marginTop: 14 },
    input: {
      borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
      fontSize: 13, fontFamily: FONTS.interRegular, color: C.textPrimary, minHeight: 70, textAlignVertical: 'top',
      marginBottom: 6,
    },
    errorTxt: { fontSize: 11.5, fontFamily: FONTS.interRegular, color: C.error, marginBottom: 8 },
    btnPrimary: {
      marginTop: 14, backgroundColor: C.primary,
      borderRadius: 13, paddingVertical: 13, alignItems: 'center',
    },
    btnPrimaryTxt: { color: '#fff', fontFamily: FONTS.interSemiBold, fontSize: 14 },
  });
