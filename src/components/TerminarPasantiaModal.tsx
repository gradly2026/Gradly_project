import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import { showAlert, showConfirm } from './AppAlert';
import { db } from '../config/firebaseConfig';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { suscribirAjustesAsistencia } from '../services/ajusteAsistenciaService';
import { terminarPasantiaAnticipada, type AsignacionCupo } from '../services/reclamoCuposService';
import { progresoPorMeta } from '../utils/horasPasantia';

// ════════════════════════════════════════════════════════════════════
//  TerminarPasantiaModal — Fase 5 de "asistencia real": la empresa marca
//  que un pasante YA NO PUEDE CONTINUAR su pasantía (lo despidió, o el
//  estudiante renunció). Congela las horas reales acumuladas hasta hoy y
//  avisa al estudiante y a la universidad — la universidad decide, caso por
//  caso y fuera del sistema, si esas horas cuentan como crédito en la
//  siguiente pasantía o si el estudiante empieza de cero.
// ════════════════════════════════════════════════════════════════════

interface Props {
  visible: boolean;
  asignacion: AsignacionCupo | null;
  onClose: () => void;
  /** Se llama tras terminar con éxito, para que el padre refresque. */
  onListo?: () => void;
}

type FinPor = 'empresa' | 'estudiante';
type Gravedad = 'leve' | 'moderada' | 'grave';

const GRAVEDADES: { valor: Gravedad; label: string; color: (c: GradlyColors) => string }[] = [
  { valor: 'leve', label: 'Leve', color: c => c.warning },
  { valor: 'moderada', label: 'Moderada', color: c => c.warning },
  { valor: 'grave', label: 'Grave', color: c => c.error },
];

export default function TerminarPasantiaModal({ visible, asignacion, onClose, onListo }: Props) {
  const { colors: C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  const [finPor, setFinPor] = useState<FinPor | null>(null);
  const [gravedad, setGravedad] = useState<Gravedad | null>(null);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [metaHoras, setMetaHoras] = useState<number | null>(null);
  const [fechasExcluidas, setFechasExcluidas] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) return;
    setFinPor(null);
    setGravedad(null);
    setMotivo('');
  }, [visible, asignacion?.id]);

  useEffect(() => {
    if (!visible || !asignacion?.grupoId) { setMetaHoras(null); return; }
    let cancel = false;
    getDoc(doc(db, 'grupos', asignacion.grupoId)).then(snap => {
      if (cancel) return;
      const d = snap.exists() ? (snap.data() as any) : {};
      const h = Number(d.horasRequeridas ?? d.total_horas ?? 0);
      setMetaHoras(Number.isFinite(h) && h > 0 ? Math.floor(h) : null);
    }).catch(() => { if (!cancel) setMetaHoras(null); });
    return () => { cancel = true; };
  }, [visible, asignacion?.grupoId]);

  useEffect(() => {
    if (!visible) return;
    const unsub = suscribirAjustesAsistencia(asignacion?.id, dias => setFechasExcluidas(dias.map(d => d.fecha)));
    return unsub;
  }, [visible, asignacion?.id]);

  if (!visible || !asignacion) return null;

  const progreso = metaHoras
    ? progresoPorMeta(asignacion.horario, asignacion.fechaPresentacion, metaHoras, new Date(), fechasExcluidas)
    : null;
  const horasActuales = progreso?.valido ? progreso.cumplidas : 0;

  const listo = !!finPor && motivo.trim().length >= 10;

  const confirmar = async () => {
    if (!listo || enviando) return;
    const ok = await showConfirm({
      title: 'Terminar la pasantía',
      message: `Se congelarán ${horasActuales} h para ${asignacion.estudianteNombre || 'el estudiante'} y la pasantía dejará de estar activa. Tendrá que inscribirse en una pasantía nueva para continuar. ¿Confirmas?`,
      confirmText: 'Terminar pasantía',
      destructive: true,
    });
    if (!ok) return;
    setEnviando(true);
    try {
      await terminarPasantiaAnticipada({
        asignacionId: asignacion.id,
        finPor: finPor!,
        gravedad: finPor === 'empresa' ? gravedad ?? undefined : undefined,
        motivo,
        horasCumplidas: horasActuales,
      });
      onListo?.();
      onClose();
      void showAlert('Pasantía terminada', 'Se avisó al estudiante y a su universidad.');
    } catch (e: any) {
      void showAlert('No se pudo terminar', e?.message ?? 'Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.headerRow}>
            <Text style={s.titulo} numberOfLines={2}>
              Terminar pasantía de {asignacion.estudianteNombre || 'estudiante'}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>
          <Text style={s.subtitulo}>
            Úsalo cuando el pasante ya no pueda continuar (lo despides, o renunció). Sus horas reales
            quedan congeladas y se avisa a su universidad — ella decide qué pasa con esas horas en su
            próxima pasantía.
          </Text>

          <View style={s.horasBox}>
            <Ionicons name="time-outline" size={16} color={C.textMuted} />
            <Text style={s.horasTxt} noTranslate>{horasActuales} h acumuladas hasta hoy</Text>
          </View>

          <Text style={s.label}>¿Qué pasó?</Text>
          <View style={s.opcionesRow}>
            <TouchableOpacity
              style={[s.opcion, finPor === 'empresa' && s.opcionActiva]}
              onPress={() => setFinPor('empresa')}
              activeOpacity={0.8}
            >
              <Text style={[s.opcionTxt, finPor === 'empresa' && s.opcionTxtActiva]}>La empresa lo termina</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.opcion, finPor === 'estudiante' && s.opcionActiva]}
              onPress={() => setFinPor('estudiante')}
              activeOpacity={0.8}
            >
              <Text style={[s.opcionTxt, finPor === 'estudiante' && s.opcionTxtActiva]}>El estudiante renunció</Text>
            </TouchableOpacity>
          </View>

          {finPor === 'empresa' && (
            <>
              <Text style={s.label}>Gravedad</Text>
              <View style={s.opcionesRow}>
                {GRAVEDADES.map(g => (
                  <TouchableOpacity
                    key={g.valor}
                    style={[s.chip, gravedad === g.valor && { backgroundColor: g.color(C) + '22', borderColor: g.color(C) }]}
                    onPress={() => setGravedad(g.valor)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.chipTxt, gravedad === g.valor && { color: g.color(C) }]}>{g.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {!!finPor && (
            <>
              <Text style={s.label}>Motivo</Text>
              <TextInput
                style={s.input}
                value={motivo}
                onChangeText={setMotivo}
                placeholder={
                  finPor === 'empresa'
                    ? 'Ej. incumplimiento de tareas, conducta de riesgo, o un problema interno que impide continuar…'
                    : 'Ej. el estudiante avisó que no puede continuar…'
                }
                placeholderTextColor={C.textMuted}
                multiline
              />
              {motivo.trim().length > 0 && motivo.trim().length < 10 && (
                <Text style={s.errorTxt}>Cuéntanos un poco más: al menos 10 caracteres.</Text>
              )}
            </>
          )}

          <TouchableOpacity
            style={[s.btnDanger, (!listo || enviando) && { opacity: 0.5 }]}
            activeOpacity={0.85}
            disabled={!listo || enviando}
            onPress={confirmar}
          >
            {enviando
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={s.btnDangerTxt}>Terminar pasantía</Text>}
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
      fontSize: 12, fontFamily: FONTS.interRegular, color: C.textSecondary,
      lineHeight: 17, marginTop: 8, marginBottom: 14,
    },
    horasBox: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: C.backgroundSurface, borderWidth: 1, borderColor: C.border,
      borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, marginBottom: 14,
    },
    horasTxt: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: C.textPrimary },
    label: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: C.textMuted, marginBottom: 7, marginTop: 4 },
    opcionesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
    opcion: {
      flex: 1, minWidth: 140, borderWidth: 1, borderColor: C.border, borderRadius: 12,
      paddingVertical: 11, paddingHorizontal: 10, alignItems: 'center',
    },
    opcionActiva: { backgroundColor: C.primary + '22', borderColor: C.primary },
    opcionTxt: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: C.textMuted, textAlign: 'center' },
    opcionTxtActiva: { color: C.primaryLight },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.border },
    chipTxt: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: C.textMuted },
    input: {
      borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
      fontSize: 13, fontFamily: FONTS.interRegular, color: C.textPrimary, minHeight: 70, textAlignVertical: 'top',
      marginBottom: 6,
    },
    errorTxt: { fontSize: 11.5, fontFamily: FONTS.interRegular, color: C.error, marginBottom: 8 },
    btnDanger: { backgroundColor: C.error, borderRadius: 13, paddingVertical: 13, alignItems: 'center', marginTop: 10 },
    btnDangerTxt: { color: '#fff', fontFamily: FONTS.interSemiBold, fontSize: 14 },
  });
