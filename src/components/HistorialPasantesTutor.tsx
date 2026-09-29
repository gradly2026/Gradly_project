import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import type { AsignacionCupo } from '../services/reclamoCuposService';

// ════════════════════════════════════════════════════════════════════
//  HistorialPasantesTutor — rol "tutor", Fase 3: lista simple de los
//  pasantes YA FINALIZADOS del tutor. A diferencia de HistorialPasantes.tsx
//  (empresa), un tutor nunca tiene pasantías de GRUPO (`solicitudes_
//  practicas` no tiene `tutorId`) — solo por cupo, así que no hace falta esa
//  rama aquí.
// ════════════════════════════════════════════════════════════════════

export default function HistorialPasantesTutor({
  visible,
  pasantes,
  onClose,
}: {
  visible: boolean;
  pasantes: AsignacionCupo[];
  onClose: () => void;
}) {
  const { colors: C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.headerRow}>
            <Text style={s.titulo}>Historial de pasantes</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          {pasantes.length === 0 ? (
            <Text style={s.vacio}>Todavía no tienes pasantes finalizados.</Text>
          ) : (
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 8 }}>
              {pasantes.map(a => (
                <View key={a.id} style={s.fila}>
                  <Text style={s.filaNombre} numberOfLines={1} noTranslate>{a.estudianteNombre || 'Estudiante'}</Text>
                  {!!a.vacanteTitulo && <Text style={s.filaSub} numberOfLines={1} noTranslate>{a.vacanteTitulo}</Text>}
                  <Text style={s.filaSub}>
                    {a.terminacionAnticipada
                      ? `Terminada antes de tiempo${a.motivoFin ? ` — ${a.motivoFin}` : ''}`
                      : `Completada · ${a.horasCumplidas ?? 0} h`}
                  </Text>
                </View>
              ))}
            </ScrollView>
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
      justifyContent: 'center', alignItems: 'center', padding: 18,
    },
    card: {
      width: '100%', maxWidth: 440,
      backgroundColor: C.backgroundCard,
      borderRadius: 22, borderWidth: 1, borderColor: C.border,
      padding: 20,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    titulo: { fontSize: 16, fontFamily: FONTS.soraBold, color: C.textPrimary },
    vacio: { fontSize: 12.5, fontFamily: FONTS.interRegular, color: C.textMuted, fontStyle: 'italic', paddingVertical: 14 },
    fila: {
      borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 12,
      backgroundColor: C.backgroundSurface,
    },
    filaNombre: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: C.textPrimary },
    filaSub: { fontSize: 11.5, fontFamily: FONTS.interRegular, color: C.textMuted, marginTop: 2 },
  });
