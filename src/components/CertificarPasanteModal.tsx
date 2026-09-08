// ════════════════════════════════════════════════════════════════════════
// CertificarPasanteModal.tsx — el detalle que abre la UNIVERSIDAD desde la
// sección Prácticas para un estudiante que YA culminó su tiempo de pasantía
// por cupo.
//
// Muestra: datos de la pasantía + objetivo de horas + el mismo gráfico de
// "Pasantía culminada" que ve el estudiante (dona + cumplidas/restantes),
// las calificaciones de estrellas pendientes (FeedbackExperienciaModal) y,
// abajo, ver/validar el comprobante que emitió la empresa.
//
// "Validar comprobante" queda BLOQUEADO hasta que la universidad envíe sus
// calificaciones (al estudiante y a la empresa) de esta pasantía.
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { AutoText as Text } from './AutoText';
import { showAlert, showConfirm } from './AppAlert';
import FeedbackExperienciaModal from './FeedbackExperienciaModal';
import { FONTS, useTheme, webScrollStyle, type GradlyColors } from '../context/ThemeContext';
import { textoHorario } from '../data/disponibilidad';
import { abrirConstancia, constanciaHtml } from '../utils/constanciaHtml';
import type { FeedbackPendiente } from '../services/feedbackService';
import { validarComprobante, type Comprobante } from '../services/comprobanteService';
import type { AsignacionCupo } from '../services/reclamoCuposService';

interface Props {
  visible: boolean;
  asignacion: AsignacionCupo | null;
  comprobante: Comprobante | null;
  /** Calificaciones que la universidad aún debe enviar de ESTA pasantía. */
  pendientesFeedback: FeedbackPendiente[];
  onValidado: () => void;
  /** Se llama al enviar una calificación → el padre recarga la lista. */
  onFeedbackEnviado: () => void;
  onClose: () => void;
}

const RING = 132;
const STROKE = 13;
const R = (RING - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

function Dona({ pct, colors }: { pct: number; colors: GradlyColors }) {
  const p = Math.max(0, Math.min(100, pct));
  const arc = colors.gold;
  return (
    <View style={{ width: RING, height: RING, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={RING} height={RING}>
        <Circle cx={RING / 2} cy={RING / 2} r={R} stroke={colors.border} strokeWidth={STROKE} fill="none" />
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={R}
          stroke={arc}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(p / 100) * CIRC} ${CIRC}`}
          transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text style={{ color: arc, fontFamily: FONTS.rajdhaniBold, fontSize: 30 }} noTranslate>{Math.round(p)}%</Text>
      </View>
    </View>
  );
}

export default function CertificarPasanteModal({
  visible, asignacion, comprobante, pendientesFeedback, onValidado, onFeedbackEnviado, onClose,
}: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [validando, setValidando] = useState(false);
  const [calificando, setCalificando] = useState(false);

  if (!visible || !asignacion) return null;

  const objetivo = Math.round(
    Number(comprobante?.horasCumplidas) || Number(asignacion.horasCumplidas) || 0,
  );
  // Una pasantía por cupo se cierra AL cumplir la meta, así que cumplidas ==
  // objetivo (100%). Se deja el cálculo explícito por si en el futuro se cierra
  // por fecha con horas parciales.
  const cumplidas = objetivo;
  const restantes = Math.max(0, objetivo - cumplidas);
  const pct = objetivo > 0 ? Math.round((cumplidas / objetivo) * 100) : 0;

  const faltanEstrellas = pendientesFeedback.length > 0;
  const comprobanteEnviado = comprobante?.estado === 'enviado';
  const comprobanteValidado = comprobante?.estado === 'validado';

  const verComprobante = async () => {
    if (!comprobante) return;
    try {
      if (comprobante.origen === 'pdf' && comprobante.archivoUrl) {
        await Linking.openURL(comprobante.archivoUrl);
      } else {
        await abrirConstancia(
          constanciaHtml(comprobante, {
            area: comprobante.area,
            supervisor: comprobante.supervisor,
            nota: comprobante.notaEmpresa,
            fechaEmisionISO: comprobante.fechaEmision,
          }),
        );
      }
    } catch (e: any) {
      showAlert('No se pudo abrir el documento', e?.message ?? 'Inténtalo de nuevo.');
    }
  };

  const validar = async () => {
    if (!comprobante || validando || faltanEstrellas) return;
    const ok = await showConfirm({
      title: 'Validar comprobante',
      message: `Vas a validar el comprobante de ${asignacion.estudianteNombre || 'el estudiante'}. Se acreditarán ${objetivo} horas de práctica y el proceso quedará 100% culminado.`,
    });
    if (!ok) return;
    setValidando(true);
    try {
      await validarComprobante(asignacion.id);
      showAlert('Pasantía certificada', 'Se acreditaron las horas y el proceso quedó culminado.');
      onValidado();
      onClose();
    } catch (e: any) {
      showAlert('No se pudo validar', e?.message ?? 'Inténtalo de nuevo.');
    } finally {
      setValidando(false);
    }
  };

  const filaHorario = textoHorario(asignacion.horario);

  return (
    <>
      <Modal visible transparent animationType="none" onRequestClose={onClose}>
        <View style={s.overlay}>
          <View style={s.hoja}>
            <View style={s.header}>
              <Ionicons name="ribbon" size={18} color={colors.gold} />
              <Text style={s.titulo} numberOfLines={1} noTranslate>{asignacion.estudianteNombre || 'Estudiante'}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={10}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={webScrollStyle(colors)} contentContainerStyle={{ padding: 16, gap: 16 }}>
              {/* Datos de la pasantía */}
              <View style={s.bloque}>
                {!!asignacion.vacanteTitulo && (
                  <Text style={s.dato} noTranslate>{asignacion.vacanteTitulo}</Text>
                )}
                {!!asignacion.empresaNombre && (
                  <Text style={s.datoSec} noTranslate>{asignacion.empresaNombre}</Text>
                )}
                {!!asignacion.carrera && <Text style={s.datoSec} noTranslate>{asignacion.carrera}</Text>}
                {(!!asignacion.fechaPresentacion || !!comprobante?.fechaFin) && (
                  <Text style={s.datoSec} noTranslate>
                    {asignacion.fechaPresentacion || '—'}{comprobante?.fechaFin ? `  →  ${comprobante.fechaFin}` : ''}
                  </Text>
                )}
                {!!filaHorario && <Text style={s.datoSec} noTranslate>{filaHorario}</Text>}
              </View>

              {/* Gráfico de horas — igual que "Pasantía culminada" del estudiante */}
              <View style={s.card}>
                <Text style={s.cardLabel}>Horas de práctica</Text>
                <View style={s.horasRow}>
                  <Dona pct={pct} colors={colors} />
                  <View style={{ flex: 1, gap: 10 }}>
                    <Stat label="Cumplidas" value={cumplidas} color={colors.success} s={s} />
                    <Stat label="En proceso" value={0} color={colors.warning} s={s} />
                    <Stat label="Restantes" value={restantes} color={colors.textMuted} s={s} />
                    <Stat label="Objetivo" value={objetivo} color={colors.primaryLight} s={s} />
                  </View>
                </View>
              </View>

              {/* Calificaciones de estrellas */}
              {faltanEstrellas ? (
                <View style={[s.aviso, { borderColor: colors.warning }]}>
                  <Ionicons name="star-outline" size={16} color={colors.warning} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <Text style={s.avisoTxt}>
                      Te faltan {pendientesFeedback.length} calificación(es) de esta pasantía (al estudiante y a la empresa).
                    </Text>
                    <TouchableOpacity
                      style={s.btnAmbar}
                      onPress={() => setCalificando(true)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="star" size={14} color="#fff" />
                      <Text style={s.btnAmbarTxt}>Calificar ahora</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={s.okRow}>
                  <Ionicons name="checkmark-circle" size={15} color={colors.success} />
                  <Text style={s.okTxt}>Ya enviaste tus calificaciones de esta pasantía.</Text>
                </View>
              )}

              {/* Comprobante de la empresa */}
              <View style={s.card}>
                <Text style={s.cardLabel}>Comprobante de finalización</Text>
                {!comprobante ? (
                  <Text style={s.datoSec}>La empresa aún no ha enviado el comprobante. Cuando lo haga, podrás verlo y validarlo aquí.</Text>
                ) : (
                  <>
                    <TouchableOpacity style={s.btnLinea} onPress={verComprobante} activeOpacity={0.7}>
                      <Ionicons name="eye-outline" size={15} color={colors.primaryLight} />
                      <Text style={s.btnLineaTxt}>Ver / descargar comprobante</Text>
                    </TouchableOpacity>

                    {comprobanteValidado ? (
                      <View style={s.okRow}>
                        <Ionicons name="shield-checkmark" size={15} color={colors.gold} />
                        <Text style={[s.okTxt, { color: colors.gold }]}>Validado — pasantía certificada al 100%.</Text>
                      </View>
                    ) : comprobanteEnviado ? (
                      <>
                        <TouchableOpacity
                          style={[s.btnSolido, (faltanEstrellas || validando) && s.btnOff]}
                          onPress={validar}
                          disabled={faltanEstrellas || validando}
                          activeOpacity={0.85}
                        >
                          {validando
                            ? <ActivityIndicator size="small" color="#fff" />
                            : (
                              <>
                                <Ionicons name="checkmark-circle" size={15} color="#fff" />
                                <Text style={s.btnSolidoTxt}>Validar comprobante</Text>
                              </>
                            )}
                        </TouchableOpacity>
                        {faltanEstrellas && (
                          <Text style={s.hint}>Envía primero tus calificaciones para poder validar.</Text>
                        )}
                      </>
                    ) : null}
                  </>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {calificando && pendientesFeedback[0] && (
        <FeedbackExperienciaModal
          key={pendientesFeedback[0].feedbackId}
          pendiente={pendientesFeedback[0]}
          onSubmitted={() => {
            setCalificando(false);
            onFeedbackEnviado();
          }}
        />
      )}
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

    bloque: { gap: 3 },
    dato: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
    datoSec: { fontSize: 12.5, fontFamily: FONTS.interRegular, color: COLORS.textMuted, lineHeight: 18 },

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

    btnLinea: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    btnLineaTxt: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },
    btnAmbar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
      backgroundColor: COLORS.warning, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, alignSelf: 'flex-start',
    },
    btnAmbarTxt: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: '#fff' },
    btnSolido: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
      backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 11,
    },
    btnSolidoTxt: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: '#fff' },
    btnOff: { opacity: 0.45 },
    hint: { fontSize: 11.5, fontFamily: FONTS.interRegular, color: COLORS.textMuted, textAlign: 'center' },
  });
