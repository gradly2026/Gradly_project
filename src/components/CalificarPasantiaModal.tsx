// ════════════════════════════════════════════════════════════════════════
// CalificarPasantiaModal.tsx — modal NO intrusivo para calificar una pasantía
// culminada. Se abre SOLO desde un botón ("Calificar desempeño" en el filtro
// "Por certificar" de la empresa, "Calificar mi experiencia" en "Mi progreso"
// del estudiante). Sustituye al forzado que hacían `FeedbackGate` y la fase
// "evaluar" de `AvisosGate`/`CulminacionFlow`.
//
// Muestra (igual que el modal de la universidad, `CertificarPasanteModal`):
// el anillo de horas (opcional) y el aviso "Te faltan N calificación(es)…"
// con el botón "Calificar ahora", que abre en secuencia las
// `FeedbackExperienciaModal` que ESTE usuario aún debe enviar de la pasantía.
//
// "Solo una vez": ya lo garantiza el modelo — `feedback_pasantias/{feedbackId}`
// existe → `getFeedbackPendiente` lo excluye → no reaparece.
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { AutoText as Text } from './AutoText';
import FeedbackExperienciaModal from './FeedbackExperienciaModal';
import {
  getFeedbackPendiente,
  type EntidadRol,
  type FeedbackPendiente,
} from '../services/feedbackService';
import { FONTS, useTheme, webScrollStyle, type GradlyColors } from '../context/ThemeContext';

interface Props {
  visible: boolean;
  /** uid del evaluador (usuario actual). */
  uid: string;
  rol: EntidadRol;
  /** Si se pasa, limita las calificaciones pendientes a esa pasantía
   *  (`solicitudId` == id de la asignación de cupo). Sin él, todas las del rol. */
  asignacionId?: string | null;
  /** Título del encabezado (nombre de la contraparte / de la pasantía). */
  titulo?: string;
  /** Anillo de horas (opcional). Una pasantía culminada está al 100 %. */
  horas?: { cumplidas: number; objetivo: number } | null;
  /** Muestra "Calificar más tarde" en cada formulario (cierra sin enviar). */
  permitirPosponer?: boolean;
  onClose: () => void;
  /** Se llama cuando el usuario terminó de enviar TODAS las pendientes. */
  onEnviado?: () => void;
}

const RING = 128;
const STROKE = 12;
const R = (RING - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

export default function CalificarPasantiaModal({
  visible, uid, rol, asignacionId, titulo, horas, permitirPosponer, onClose, onEnviado,
}: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  // null = cargando; [] = ya no hay nada pendiente.
  const [pendientes, setPendientes] = useState<FeedbackPendiente[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [calificando, setCalificando] = useState(false);

  useEffect(() => {
    if (!visible || !uid) {
      setPendientes(null); setIdx(0); setCalificando(false);
      return;
    }
    let vivo = true;
    (async () => {
      try {
        const all = await getFeedbackPendiente(uid, rol);
        if (!vivo) return;
        setPendientes(asignacionId ? all.filter(p => p.solicitudId === asignacionId) : all);
        setIdx(0);
      } catch {
        if (vivo) setPendientes([]);
      }
    })();
    return () => { vivo = false; };
  }, [visible, uid, rol, asignacionId]);

  if (!visible) return null;

  const pct = horas && horas.objetivo > 0
    ? Math.min(100, Math.round((horas.cumplidas / horas.objetivo) * 100))
    : 100;
  const total = pendientes?.length ?? 0;
  const restantes = Math.max(0, total - idx);
  const actual = pendientes && calificando ? pendientes[idx] : null;

  const avanzar = () => {
    setCalificando(false);
    if (idx + 1 >= total) {
      onEnviado?.();
      onClose();
    } else {
      setIdx(i => i + 1);
    }
  };

  return (
    <>
      <Modal visible transparent animationType="none" onRequestClose={onClose}>
        <View style={s.overlay}>
          <View style={s.hoja}>
            <View style={s.header}>
              <Ionicons name="ribbon" size={18} color={colors.gold} />
              <Text style={s.titulo} numberOfLines={1} noTranslate>{titulo || 'Calificar pasantía'}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={10}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={webScrollStyle(colors)} contentContainerStyle={{ padding: 16, gap: 16 }}>
              {horas ? (
                <View style={s.card}>
                  <Text style={s.cardLabel}>Horas de práctica</Text>
                  <View style={s.horasRow}>
                    <View style={{ width: RING, height: RING, alignItems: 'center', justifyContent: 'center' }}>
                      <Svg width={RING} height={RING}>
                        <Circle cx={RING / 2} cy={RING / 2} r={R} stroke={colors.border} strokeWidth={STROKE} fill="none" />
                        <Circle
                          cx={RING / 2}
                          cy={RING / 2}
                          r={R}
                          stroke={colors.gold}
                          strokeWidth={STROKE}
                          fill="none"
                          strokeLinecap="round"
                          strokeDasharray={`${(pct / 100) * CIRC} ${CIRC}`}
                          transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
                        />
                      </Svg>
                      <View style={{ position: 'absolute' }}>
                        <Text style={{ color: colors.gold, fontFamily: FONTS.rajdhaniBold, fontSize: 28 }} noTranslate>{pct}%</Text>
                      </View>
                    </View>
                    <View style={{ flex: 1, gap: 8 }}>
                      <Stat label="Cumplidas" value={Math.round(horas.cumplidas)} color={colors.success} s={s} />
                      <Stat label="En proceso" value={0} color={colors.warning} s={s} />
                      <Stat label="Restantes" value={Math.max(0, Math.round(horas.objetivo - horas.cumplidas))} color={colors.textMuted} s={s} />
                      <Stat label="Objetivo" value={Math.round(horas.objetivo)} color={colors.primaryLight} s={s} />
                    </View>
                  </View>
                </View>
              ) : null}

              {pendientes === null ? (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
              ) : total === 0 ? (
                <View style={s.okRow}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                  <Text style={s.okTxt}>Ya enviaste tus calificaciones de esta pasantía.</Text>
                </View>
              ) : (
                <View style={[s.aviso, { borderColor: colors.warning }]}>
                  <Ionicons name="star-outline" size={16} color={colors.warning} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <Text style={s.avisoTxt} noTranslate>
                      {`Te faltan ${restantes} calificación(es) de esta pasantía.`}
                    </Text>
                    <TouchableOpacity style={s.btnAmbar} onPress={() => setCalificando(true)} activeOpacity={0.85}>
                      <Ionicons name="star" size={14} color="#fff" />
                      <Text style={s.btnAmbarTxt}>Calificar ahora</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {actual ? (
        <FeedbackExperienciaModal
          key={actual.feedbackId}
          pendiente={actual}
          onSubmitted={avanzar}
          onPosponer={permitirPosponer ? () => { setCalificando(false); onClose(); } : undefined}
        />
      ) : null}
    </>
  );
}

function Stat({ label, value, color, s }: { label: string; value: number; color: string; s: any }) {
  return (
    <View style={s.stat}>
      <Text style={[s.statValue, { color }]} noTranslate>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (COLORS: GradlyColors) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 18 },
    hoja: {
      maxHeight: '88%', maxWidth: 560, width: '100%', alignSelf: 'center',
      backgroundColor: COLORS.backgroundCard,
      borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
    },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 16, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: COLORS.border,
    },
    titulo: { flex: 1, fontSize: 15, fontFamily: FONTS.soraSemiBold, color: COLORS.textPrimary },

    card: {
      backgroundColor: COLORS.backgroundSurface, borderRadius: 14,
      borderWidth: 1, borderColor: COLORS.border, padding: 14, gap: 12,
    },
    cardLabel: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight, textTransform: 'uppercase', letterSpacing: 0.4 },
    horasRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
    stat: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    statValue: { fontSize: 20, fontFamily: FONTS.rajdhaniBold, minWidth: 34 },
    statLabel: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted },

    aviso: {
      flexDirection: 'row', gap: 10, alignItems: 'flex-start',
      borderWidth: 1, borderRadius: 12, padding: 12,
    },
    avisoTxt: { fontSize: 12.5, fontFamily: FONTS.interRegular, color: COLORS.textSecondary, lineHeight: 18 },
    okRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    okTxt: { fontSize: 12.5, fontFamily: FONTS.interRegular, color: COLORS.success },

    btnAmbar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
      backgroundColor: COLORS.warning, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, alignSelf: 'flex-start',
    },
    btnAmbarTxt: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: '#fff' },
  });
