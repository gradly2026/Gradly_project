// ════════════════════════════════════════════════════════════════════════
// RecordatorioCalificacionCard.tsx
//
// Tarjeta del Inicio que recuerda las calificaciones que el usuario pospuso
// con "Calificar más tarde" (o cualquier evaluación pendiente que aún no haya
// completado). Se auto-oculta si no hay ninguna.
//
// - estudiante → cabecera del feed (app/(tabs)/index.tsx)
// - empresa / universidad → SeccionInicio de su dashboard
//
// Al tocar "Calificar ahora" abre el FeedbackExperienciaModal ya existente,
// una evaluación tras otra. La misma evaluación también llega como
// notificación `feedbackPendiente:<feedbackId>` (ver FloatingTopBar).
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { GlassCard } from '../../components/ui/liquid-glass/GlassCard';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import {
  getFeedbackPendiente,
  type EntidadRol,
  type FeedbackPendiente,
} from '../services/feedbackService';
import { AutoText as Text } from './AutoText';
import FeedbackExperienciaModal from './FeedbackExperienciaModal';

export default function RecordatorioCalificacionCard({
  rol,
  uid,
}: {
  rol: EntidadRol;
  uid: string;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [pendientes, setPendientes] = useState<FeedbackPendiente[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [idx, setIdx] = useState(0);

  const cargar = useCallback(() => {
    if (!uid) return;
    getFeedbackPendiente(uid, rol)
      .then(setPendientes)
      .catch(() => setPendientes([]));
  }, [uid, rol]);

  useEffect(() => { cargar(); }, [cargar]);

  if (pendientes.length === 0) return null;

  const n = pendientes.length;
  const actual = pendientes[idx];

  const alEnviar = () => {
    // Siguiente evaluación pendiente de la tanda; si no quedan, cerrar y
    // recargar (las ya enviadas desaparecen de la lista).
    if (idx + 1 < pendientes.length) {
      setIdx(i => i + 1);
    } else {
      setAbierto(false);
      setIdx(0);
      cargar();
    }
  };

  return (
    <>
      <GlassCard style={{ marginBottom: 12 }} contentStyle={{ padding: 14, gap: 8 }}>
        <View style={s.row}>
          <View style={[s.iconWrap, { backgroundColor: colors.warning + '22', borderColor: colors.warning + '55' }]}>
            <Ionicons name="star-outline" size={17} color={colors.warning} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.titulo}>
              {n === 1 ? 'Tienes 1 calificación pendiente' : 'Tienes calificaciones pendientes'}
            </Text>
            <Text style={s.sub}>
              Guardaste evaluaciones para más tarde. Complétalas cuando quieras.
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[s.btn, { backgroundColor: colors.primary }]}
          onPress={() => { setIdx(0); setAbierto(true); }}
          activeOpacity={0.85}
        >
          <Ionicons name="star" size={14} color="#fff" />
          <Text style={s.btnTxt}>Calificar ahora</Text>
        </TouchableOpacity>
      </GlassCard>

      {abierto && actual && (
        <FeedbackExperienciaModal
          key={actual.feedbackId}
          pendiente={actual}
          onSubmitted={alEnviar}
          // Aquí "más tarde" solo cierra la tarjeta (ya está pospuesta).
          onPosponer={() => { setAbierto(false); setIdx(0); }}
        />
      )}
    </>
  );
}

const makeStyles = (COLORS: GradlyColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    iconWrap: {
      width: 34, height: 34, borderRadius: 10, borderWidth: 1,
      alignItems: 'center', justifyContent: 'center',
    },
    titulo: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
    sub: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted, lineHeight: 17, marginTop: 2 },
    btn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
      borderRadius: 11, paddingVertical: 10, alignSelf: 'stretch',
    },
    btnTxt: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: '#fff' },
  });
