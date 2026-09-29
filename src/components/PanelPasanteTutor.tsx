import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import CalendarioPasanteTutor from './CalendarioPasanteTutor';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import type { AsignacionCupo } from '../services/reclamoCuposService';
import type { ProgresoMeta } from '../utils/horasPasantia';

// ════════════════════════════════════════════════════════════════════
//  PanelPasanteTutor — rol "tutor", Fase 3: detalle de UN pasante a cargo
//  del tutor (nombre, puesto, progreso de horas) con su calendario de
//  asistencia + observaciones embebido.
// ════════════════════════════════════════════════════════════════════

export default function PanelPasanteTutor({
  visible,
  asignacion,
  progreso,
  tutorUid,
  onClose,
}: {
  visible: boolean;
  asignacion: AsignacionCupo | null;
  progreso: ProgresoMeta | null;
  tutorUid: string;
  onClose: () => void;
}) {
  const { colors: C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  if (!visible || !asignacion) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.nombre} numberOfLines={1} noTranslate>{asignacion.estudianteNombre || 'Pasante'}</Text>
              {!!asignacion.vacanteTitulo && <Text style={s.puesto} numberOfLines={1} noTranslate>{asignacion.vacanteTitulo}</Text>}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          {progreso?.valido && (
            <View style={s.progresoBox}>
              <View style={s.progresoBarraFondo}>
                <View style={[s.progresoBarra, { width: `${Math.min(100, Math.max(0, progreso.pct))}%` }]} />
              </View>
              <Text style={s.progresoTxt}>
                {`${Math.round(progreso.cumplidas)} / ${progreso.meta} h`}
              </Text>
            </View>
          )}

          <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
            <CalendarioPasanteTutor asignacion={asignacion} tutorUid={tutorUid} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (C: GradlyColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1, backgroundColor: 'rgba(7,5,15,0.75)',
      justifyContent: 'center', alignItems: 'center', padding: 18,
    },
    card: {
      width: '100%', maxWidth: 460,
      backgroundColor: C.backgroundCard,
      borderRadius: 22, borderWidth: 1, borderColor: C.border,
      padding: 20,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    nombre: { fontSize: 16, fontFamily: FONTS.soraBold, color: C.textPrimary },
    puesto: { fontSize: 12, fontFamily: FONTS.interRegular, color: C.textMuted, marginTop: 2 },
    progresoBox: { marginBottom: 14 },
    progresoBarraFondo: { height: 6, borderRadius: 3, backgroundColor: C.border, overflow: 'hidden' },
    progresoBarra: { height: 6, borderRadius: 3, backgroundColor: C.primary },
    progresoTxt: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: C.textMuted, marginTop: 4 },
  });
