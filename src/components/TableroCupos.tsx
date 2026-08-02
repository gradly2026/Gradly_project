import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import { db } from '../config/firebaseConfig';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { textoHorario } from '../data/disponibilidad';
import {
  COLECCION_ASIGNACIONES,
  COLECCION_RECLAMOS,
  cancelarCupo,
  tomarCupo,
  type AsignacionCupo,
  type ReclamoCupos,
} from '../services/reclamoCuposService';
import {
  cuposLibresEnReclamo,
  sePuedeTomar,
  tiempoRestante,
} from '../utils/cupos';

/**
 * Tablero de selección del estudiante: muestra SOLO los cupos que su
 * universidad ya aseguró para él y le deja elegir uno.
 *
 * Sintetiza los dos modelos que estaban en tensión: el estudiante elige
 * (como manda la costumbre), pero dentro de un conjunto ya curado y
 * garantizado por su universidad. Orden de llegada; al vencer el plazo los
 * cupos no tomados se liberan.
 *
 * Si el estudiante ya tomó un cupo, el tablero se reemplaza por la tarjeta
 * de "tu cupo" con opción de cancelar.
 */
export default function TableroCupos({
  estudianteId,
  universidadId,
  grupoId,
  estudianteNombre,
}: {
  estudianteId: string;
  universidadId?: string | null;
  grupoId?: string | null;
  estudianteNombre?: string;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [reclamos, setReclamos] = useState<ReclamoCupos[]>([]);
  const [asignacion, setAsignacion] = useState<AsignacionCupo | null>(null);
  const [tomando, setTomando] = useState<string | null>(null);
  // Tick de 1 min para que el contador de tiempo restante avance sin recargar.
  const [ahora, setAhora] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // Cupos reservados por su universidad.
  useEffect(() => {
    if (!universidadId) return;
    const unsub = onSnapshot(
      query(collection(db, COLECCION_RECLAMOS), where('universidadId', '==', universidadId)),
      snap => setReclamos(snap.docs.map(d => ({ id: d.id, ...d.data() } as ReclamoCupos))),
      e => console.warn('Error en listener (tablero cupos):', e),
    );
    return unsub;
  }, [universidadId]);

  // ¿Ya tomó un cupo?
  useEffect(() => {
    if (!estudianteId) return;
    const unsub = onSnapshot(
      query(
        collection(db, COLECCION_ASIGNACIONES),
        where('estudianteId', '==', estudianteId),
        where('estado', '==', 'tomado'),
      ),
      snap => setAsignacion(
        snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as AsignacionCupo),
      ),
      e => console.warn('Error en listener (asignacion cupo):', e),
    );
    return unsub;
  }, [estudianteId]);

  /** Ofertas vigentes para este alumno: las de su grupo o las sin grupo fijado. */
  const disponibles = useMemo(
    () => reclamos
      .filter(r => !r.grupoId || r.grupoId === grupoId)
      .filter(r => sePuedeTomar(r, ahora)),
    [reclamos, grupoId, ahora],
  );

  const elegir = async (r: ReclamoCupos) => {
    setTomando(r.id);
    try {
      await tomarCupo({ reclamoId: r.id, estudianteId, estudianteNombre });
      Alert.alert(
        '¡Cupo asegurado!',
        `Harás tu práctica en ${r.empresaNombre || 'la empresa'}. Tu universidad y la empresa ya fueron notificadas.`,
      );
    } catch (e: any) {
      Alert.alert('No se pudo tomar el cupo', e?.message ?? 'Intenta de nuevo.');
    } finally {
      setTomando(null);
    }
  };

  const cancelar = () => {
    if (!asignacion) return;
    Alert.alert(
      'Cancelar tu cupo',
      'Volverá a estar disponible para tus compañeros y tendrás que elegir otro. ¿Continuar?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelarCupo(asignacion.id);
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'No se pudo cancelar.');
            }
          },
        },
      ],
    );
  };

  // ── Ya eligió ────────────────────────────────────────────────────
  if (asignacion) {
    return (
      <View style={s.wrap}>
        <Text style={s.heading}>Tu práctica asignada</Text>
        <View style={[s.card, s.cardTomado]}>
          <View style={s.rowTop}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={s.titulo} numberOfLines={1}>
                {asignacion.empresaNombre || 'Empresa'}
              </Text>
              <Text style={s.meta} numberOfLines={1}>{asignacion.vacanteTitulo}</Text>
              {textoHorario(asignacion.horario) && (
                <Text style={s.meta}>{textoHorario(asignacion.horario)}</Text>
              )}
            </View>
          </View>
          <TouchableOpacity style={s.cancelarBtn} onPress={cancelar}>
            <Text style={s.cancelarTxt}>Cancelar mi cupo</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Sin ofertas vigentes no se ocupa espacio en la pantalla.
  if (disponibles.length === 0) return null;

  // ── Tablero de selección ─────────────────────────────────────────
  return (
    <View style={s.wrap}>
      <Text style={s.heading}>Cupos que tu universidad aseguró para ti</Text>
      <Text style={s.sub}>
        Elige uno antes de que venza el plazo. Si no eliges, el cupo pasa a otro compañero
        y tendrás que buscar por tu cuenta.
      </Text>

      {disponibles.map(r => {
        const libres = cuposLibresEnReclamo(r);
        const restante = tiempoRestante(r, ahora);
        const cargando = tomando === r.id;
        return (
          <View key={r.id} style={s.card}>
            <View style={s.rowTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.titulo} numberOfLines={1}>{r.empresaNombre || 'Empresa'}</Text>
                <Text style={s.meta} numberOfLines={1}>{r.vacanteTitulo || 'Práctica'}</Text>
                {textoHorario(r.horario) && (
                  <Text style={s.meta}>{textoHorario(r.horario)}</Text>
                )}
              </View>
              {!!restante && (
                <View style={s.plazoPill}>
                  <Ionicons name="time-outline" size={12} color={colors.warning} />
                  <Text style={s.plazoTxt}>{restante}</Text>
                </View>
              )}
            </View>

            <View style={s.rowBottom}>
              <Text style={[s.libres, libres <= 2 && { color: colors.warning }]}>
                {libres === 1 ? 'Queda 1 cupo' : `Quedan ${libres} cupos`}
              </Text>
              <TouchableOpacity
                style={[s.elegirBtn, cargando && { opacity: 0.6 }]}
                onPress={() => elegir(r)}
                disabled={cargando || !!tomando}
              >
                {cargando
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Text style={s.elegirTxt}>Elegir esta</Text>}
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (COLORS: GradlyColors) =>
  StyleSheet.create({
    wrap: { gap: 10, marginBottom: 16 },
    heading: { fontSize: 15, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
    sub: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted, lineHeight: 17 },
    card: {
      backgroundColor: COLORS.backgroundCard,
      borderWidth: 1,
      borderColor: COLORS.border,
      borderRadius: 14,
      padding: 13,
      gap: 10,
    },
    cardTomado: { borderColor: COLORS.success },
    rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
    rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    titulo: { fontSize: 14.5, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
    meta: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted, marginTop: 2 },
    plazoPill: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
      borderWidth: 1, borderColor: COLORS.warning,
    },
    plazoTxt: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: COLORS.warning },
    libres: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },
    elegirBtn: {
      backgroundColor: COLORS.primary,
      borderRadius: 11,
      paddingHorizontal: 16,
      paddingVertical: 9,
      minWidth: 104,
      alignItems: 'center',
    },
    elegirTxt: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: '#FFF' },
    cancelarBtn: {
      alignSelf: 'flex-start',
      borderWidth: 1, borderColor: COLORS.border,
      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7,
    },
    cancelarTxt: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  });
