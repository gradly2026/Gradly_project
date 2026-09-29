import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import RegistrarAsistenciaModal from './RegistrarAsistenciaModal';
import PanelPasanteTutor from './PanelPasanteTutor';
import HistorialPasantesTutor from './HistorialPasantesTutor';
import { db } from '../config/firebaseConfig';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { useInscripcionesActivas } from '../hooks/useInscripcionesActivas';
import { COLECCION_ASIGNACIONES, type AsignacionCupo } from '../services/reclamoCuposService';

// ════════════════════════════════════════════════════════════════════
//  SeccionPasantesTutor — rol "tutor", Fase 3: pestaña principal del
//  dashboard del tutor. Pasantes a su cargo (asignaciones_cupo where
//  tutorId == uid), separados en activos/historial en CLIENTE (mismo
//  criterio "sin índice compuesto" que SeccionActivas de la empresa) — un
//  tutor nunca tiene pasantías de GRUPO, así que no hace falta esa rama.
// ════════════════════════════════════════════════════════════════════

export default function SeccionPasantesTutor({
  tutorId,
  pasanteAAbrirId,
  onConsumidoPasanteAAbrir,
}: {
  tutorId: string;
  pasanteAAbrirId?: string | null;
  onConsumidoPasanteAAbrir?: () => void;
}) {
  const { colors: C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  const [cupos, setCupos] = useState<AsignacionCupo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [pasanteSel, setPasanteSel] = useState<AsignacionCupo | null>(null);
  const [historialVisible, setHistorialVisible] = useState(false);
  const [codigoVisible, setCodigoVisible] = useState(false);

  const inscripciones = useInscripcionesActivas('tutorId', tutorId);
  const progresoDe = (id: string) => inscripciones.find(i => i.asignacion.id === id)?.progreso ?? null;

  useEffect(() => {
    if (!tutorId) { setCupos([]); setCargando(false); return; }
    setCargando(true);
    const unsub = onSnapshot(
      query(collection(db, COLECCION_ASIGNACIONES), where('tutorId', '==', tutorId)),
      snap => {
        setCupos(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as AsignacionCupo)));
        setCargando(false);
      },
      e => { console.warn('Error en listener (pasantes del tutor):', e); setCargando(false); },
    );
    return unsub;
  }, [tutorId]);

  const activos = useMemo(
    () => cupos.filter(c => c.estado === 'tomado' && c.finalizada !== true),
    [cupos],
  );
  const historial = useMemo(() => cupos.filter(c => c.finalizada === true), [cupos]);

  // Deep link (notificación "nuevo pasante asignado"): en cuanto la lista trae
  // ese pasante, se abre su panel automáticamente y se consume el parámetro.
  useEffect(() => {
    if (!pasanteAAbrirId || cargando) return;
    const encontrado = cupos.find(c => c.id === pasanteAAbrirId);
    if (encontrado) setPasanteSel(encontrado);
    onConsumidoPasanteAAbrir?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pasanteAAbrirId, cargando, cupos]);

  return (
    <View style={{ flex: 1 }}>
      <View style={s.topRow}>
        <TouchableOpacity style={s.btnPrimario} activeOpacity={0.85} onPress={() => setCodigoVisible(true)}>
          <Ionicons name="keypad-outline" size={16} color="#fff" />
          <Text style={s.btnPrimarioTxt}>Registrar asistencia</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.btnSecundario} activeOpacity={0.85} onPress={() => setHistorialVisible(true)}>
          <Text style={s.btnSecundarioTxt}>{`Historial (${historial.length})`}</Text>
        </TouchableOpacity>
      </View>

      {cargando ? (
        <View style={{ paddingVertical: 30, alignItems: 'center' }}>
          <ActivityIndicator size="small" color={C.primary} />
        </View>
      ) : activos.length === 0 ? (
        <Text style={s.vacio}>Todavía no tienes pasantes asignados.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 20 }}>
          {activos.map(a => {
            const progreso = progresoDe(a.id);
            return (
              <TouchableOpacity key={a.id} style={s.tarjeta} activeOpacity={0.85} onPress={() => setPasanteSel(a)}>
                <View style={{ flex: 1 }}>
                  <Text style={s.tarjetaNombre} numberOfLines={1} noTranslate>{a.estudianteNombre || 'Pasante'}</Text>
                  {!!a.vacanteTitulo && <Text style={s.tarjetaSub} numberOfLines={1} noTranslate>{a.vacanteTitulo}</Text>}
                  {progreso?.valido && (
                    <View style={s.progresoBarraFondo}>
                      <View style={[s.progresoBarra, { width: `${Math.min(100, Math.max(0, progreso.pct))}%` }]} />
                    </View>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <RegistrarAsistenciaModal visible={codigoVisible} onClose={() => setCodigoVisible(false)} />
      <PanelPasanteTutor
        visible={!!pasanteSel}
        asignacion={pasanteSel}
        progreso={pasanteSel ? progresoDe(pasanteSel.id) : null}
        tutorUid={tutorId}
        onClose={() => setPasanteSel(null)}
      />
      <HistorialPasantesTutor
        visible={historialVisible}
        pasantes={historial}
        onClose={() => setHistorialVisible(false)}
      />
    </View>
  );
}

const makeStyles = (C: GradlyColors) =>
  StyleSheet.create({
    topRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    btnPrimario: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      flex: 1, backgroundColor: C.primary, borderRadius: 12, paddingVertical: 11,
    },
    btnPrimarioTxt: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: '#fff' },
    btnSecundario: {
      borderWidth: 1, borderColor: C.border, borderRadius: 12,
      paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center',
    },
    btnSecundarioTxt: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: C.textSecondary },
    vacio: { fontSize: 13, fontFamily: FONTS.interRegular, color: C.textMuted, fontStyle: 'italic', paddingVertical: 24, textAlign: 'center' },
    tarjeta: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 14,
      backgroundColor: C.backgroundCard,
    },
    tarjetaNombre: { fontSize: 14, fontFamily: FONTS.soraBold, color: C.textPrimary },
    tarjetaSub: { fontSize: 11.5, fontFamily: FONTS.interRegular, color: C.textMuted, marginTop: 2 },
    progresoBarraFondo: { height: 5, borderRadius: 3, backgroundColor: C.border, overflow: 'hidden', marginTop: 8 },
    progresoBarra: { height: 5, borderRadius: 3, backgroundColor: C.primary },
  });
