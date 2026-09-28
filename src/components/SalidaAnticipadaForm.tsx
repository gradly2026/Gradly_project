import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text, AutoTextInput as TextInput } from './AutoText';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { registrarSalidaAnticipada } from '../services/asistenciaCodigoService';
import type { AsignacionCupo } from '../services/reclamoCuposService';

// ════════════════════════════════════════════════════════════════════
//  SalidaAnticipadaForm — la EMPRESA registra que un pasante tuvo que salir
//  antes de terminar su turno de HOY (una emergencia). A diferencia de
//  "Confirmar salida" (solo bitácora), esto SÍ corta las horas de hoy: la
//  Cloud Function usa la hora ACTUAL del servidor como hora de salida — este
//  formulario no deja elegir una hora, solo pide el motivo.
//
//  Mismo patrón que RegistrarAsistenciaManualForm: un formulario EN LÍNEA (no
//  un <Modal>) que sustituye la lista dentro de HistorialAsistenciaModal, para
//  no apilar dos modales nativos.
// ════════════════════════════════════════════════════════════════════

interface Props {
  asignacion: AsignacionCupo;
  onVolver: () => void;
  onRegistrada: () => void;
}

const LARGO_MAX_MOTIVO = 300;

export default function SalidaAnticipadaForm({ asignacion, onVolver, onRegistrada }: Props) {
  const { colors: C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setMotivo('');
    setEnviando(false);
    setError('');
  }, [asignacion.id]);

  const listo = motivo.trim().length > 0 && !enviando;

  const confirmar = async () => {
    if (!listo) return;
    setEnviando(true);
    setError('');
    try {
      await registrarSalidaAnticipada(asignacion.id, motivo.trim());
      onRegistrada();
    } catch (e: any) {
      setError(e?.message || 'No se pudo registrar la salida anticipada. Intenta de nuevo.');
      setEnviando(false);
    }
  };

  return (
    <View>
      <View style={s.headerRow}>
        <TouchableOpacity onPress={onVolver} hitSlop={10} style={s.volver} disabled={enviando}>
          <Ionicons name="chevron-back" size={20} color={C.textMuted} />
        </TouchableOpacity>
        <Text style={s.titulo}>Salida anticipada</Text>
      </View>

      <Text style={s.nombre} numberOfLines={1} noTranslate>{asignacion.estudianteNombre || 'Estudiante'}</Text>

      <View style={s.aviso}>
        <Ionicons name="warning-outline" size={16} color={C.warning} style={{ marginTop: 1 }} />
        {/* Como hijo de expresión (no texto JSX plano) para poder usar comillas
            rectas sin que ESLint las marque, y para que coincida EXACTO con la
            frase sembrada en autoSeed.ts. */}
        <Text style={s.avisoTxt}>
          {'Vas a registrar que salió antes de terminar su turno de hoy, ahora mismo. Sus horas de hoy contarán solo hasta este momento — esto es distinto de "Confirmar salida", que no afecta las horas.'}
        </Text>
      </View>

      <Text style={s.etiqueta}>Motivo</Text>
      <TextInput
        style={s.input}
        value={motivo}
        onChangeText={t => setMotivo(t.slice(0, LARGO_MAX_MOTIVO))}
        placeholder="Ej. Emergencia médica, tuvo que retirarse."
        placeholderTextColor={C.textMuted}
        multiline
        selectionColor={C.primary}
      />
      <Text style={s.contador}>{motivo.trim().length}/{LARGO_MAX_MOTIVO}</Text>

      {!!error && (
        <View style={s.errorBox}>
          <Ionicons name="alert-circle-outline" size={16} color={C.error} />
          <Text style={s.errorTxt}>{error}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[s.btnPrimario, !listo && { opacity: 0.6 }]}
        activeOpacity={0.85}
        disabled={!listo}
        onPress={confirmar}
      >
        {enviando
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text style={s.btnPrimarioTxt}>Registrar salida anticipada</Text>}
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (C: GradlyColors) =>
  StyleSheet.create({
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    volver: { paddingVertical: 2, paddingRight: 4 },
    titulo: { fontSize: 16, fontFamily: FONTS.soraBold, color: C.textPrimary },
    nombre: { fontSize: 14.5, fontFamily: FONTS.interSemiBold, color: C.textPrimary, marginTop: 10 },
    aviso: {
      flexDirection: 'row', gap: 8, marginTop: 12,
      backgroundColor: C.warning + '18', borderWidth: 1, borderColor: C.warning + '40',
      borderRadius: 12, padding: 11,
    },
    avisoTxt: { flex: 1, fontSize: 12, fontFamily: FONTS.interRegular, color: C.textPrimary, lineHeight: 17 },
    etiqueta: {
      fontSize: 11.5, fontFamily: FONTS.interSemiBold, color: C.textMuted,
      textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 14, marginBottom: 6,
    },
    input: {
      backgroundColor: C.backgroundSurface, borderWidth: 1, borderColor: C.border,
      borderRadius: 12, padding: 11, minHeight: 72, textAlignVertical: 'top',
      color: C.textPrimary, fontSize: 13.5, fontFamily: FONTS.interRegular,
    },
    contador: { fontSize: 11, fontFamily: FONTS.interRegular, color: C.textMuted, textAlign: 'right', marginTop: 4 },
    errorBox: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10,
      backgroundColor: C.error + '18', borderWidth: 1, borderColor: C.error + '40',
      borderRadius: 12, padding: 11,
    },
    errorTxt: { flex: 1, fontSize: 12, fontFamily: FONTS.interRegular, color: C.textPrimary, lineHeight: 17 },
    btnPrimario: {
      marginTop: 14, borderRadius: 13, paddingVertical: 13, alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.warning,
    },
    btnPrimarioTxt: { color: '#fff', fontFamily: FONTS.interSemiBold, fontSize: 14 },
  });
