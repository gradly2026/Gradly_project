// ════════════════════════════════════════════════════════════════════════
// SeccionIncidenciasTutor.tsx — pestaña "Incidencias" del tutor (rol "tutor",
// Fase 4: paridad total con la empresa, acotada a sus propios pasantes).
// Reutiliza la MISMA BandejaIncidencias/ReportarIncidenciaEmpresaModal que ya
// usan empresa y universidad — nada de esto es un componente nuevo aparte,
// solo un envoltorio que arma la lista de "pasantes reportables" del tutor.
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import BandejaIncidencias from './BandejaIncidencias';
import ReportarIncidenciaEmpresaModal, { type PasanteReportable } from './ReportarIncidenciaEmpresaModal';
import { db } from '../config/firebaseConfig';
import { useTranslation } from '../context/TranslationContext';
import { FONTS, useTheme, webScrollStyle, type GradlyColors } from '../context/ThemeContext';
import { COLECCION_ASIGNACIONES } from '../services/reclamoCuposService';

export default function SeccionIncidenciasTutor({
  tutorId,
  tutorNombre,
}: {
  tutorId: string;
  tutorNombre: string;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [pasantes, setPasantes] = useState<PasanteReportable[]>([]);
  const [empresaId, setEmpresaId] = useState('');
  const [empresaNombre, setEmpresaNombre] = useState('');
  const [reportarOpen, setReportarOpen] = useState(false);

  // Todo pasante de un mismo tutor pertenece a la MISMA empresa (la que lo
  // registró) — de ahí se toma empresaId/empresaNombre, sin una lectura aparte.
  useEffect(() => {
    if (!tutorId) { setPasantes([]); return; }
    const unsub = onSnapshot(
      query(
        collection(db, COLECCION_ASIGNACIONES),
        where('tutorId', '==', tutorId),
        where('estado', '==', 'tomado'),
      ),
      snap => {
        const activos = snap.docs
          .map(d => ({ id: d.id, ...(d.data() as any) }))
          .filter(a => a.finalizada !== true);
        setPasantes(activos.map(a => ({
          id: a.estudianteId,
          nombre: a.estudianteNombre || 'Estudiante',
          universidadId: a.universidadId ?? null,
          asignacionId: a.id,
          tutorId,
        })));
        if (activos[0]) {
          setEmpresaId(activos[0].empresaId ?? '');
          setEmpresaNombre(activos[0].empresaNombre ?? '');
        }
      },
      e => console.warn('Error en listener (pasantes reportables del tutor):', e),
    );
    return unsub;
  }, [tutorId]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={[{ flex: 1 }, webScrollStyle(colors)]} contentContainerStyle={{ paddingBottom: 60 }}>
        {pasantes.length > 0 && (
          <TouchableOpacity style={s.btnReportar} activeOpacity={0.85} onPress={() => setReportarOpen(true)}>
            <Ionicons name="flag-outline" size={14} color={colors.warning} />
            <Text style={s.btnReportarTxt}>{t('inc_emp_reportar_btn')}</Text>
          </TouchableOpacity>
        )}
        <BandejaIncidencias rol="tutor" uid={tutorId} nombreUsuario={tutorNombre} />
      </ScrollView>

      <ReportarIncidenciaEmpresaModal
        visible={reportarOpen}
        onClose={() => setReportarOpen(false)}
        empresaId={empresaId}
        empresaNombre={empresaNombre}
        estudiantes={pasantes}
        tutorId={tutorId}
      />
    </View>
  );
}

const makeStyles = (C: GradlyColors) =>
  StyleSheet.create({
    btnReportar: {
      alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 6,
      borderWidth: 1, borderColor: C.warning, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 7, marginBottom: 12,
    },
    btnReportarTxt: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: C.warning },
  });
