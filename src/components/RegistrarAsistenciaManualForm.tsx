import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { registrarAsistenciaManual } from '../services/asistenciaCodigoService';
import type { AsignacionCupo } from '../services/reclamoCuposService';
import { MARGEN_ASISTENCIA_MIN, minutosAHora12, turnoEnMinutos } from '../utils/horasPasantia';

// ════════════════════════════════════════════════════════════════════
//  RegistrarAsistenciaManualForm — la empresa registra la asistencia de un
//  día reciente en que el pasante SÍ fue pero no se registró su código. Por
//  defecto queda elegida la hora de entrada del horario (llegó a tiempo: un
//  toque); si llegó tarde, ajusta la hora. Misma regla de horas que el
//  registro por código (ver functions/src/asistencia.ts): dentro del margen el
//  día cuenta completo desde la hora de entrada; después, desde la hora de
//  llegada. La validación real (ventana de días, día programado…) es del
//  servidor.
//
//  Es un formulario EN LÍNEA (no un <Modal>): se muestra dentro de
//  HistorialAsistenciaModal, en lugar de su lista, para no apilar dos modales
//  nativos (falla en iOS).
// ════════════════════════════════════════════════════════════════════

interface Props {
  asignacion: AsignacionCupo;
  /** Día a registrar (ISO `yyyy-mm-dd`). */
  fecha: string;
  /** Volver a la lista sin registrar. */
  onVolver: () => void;
  /** Tras registrar con éxito (el libro de la asignación llega solo por su
   *  listener; el padre solo tiene que volver a la lista). */
  onRegistrada: () => void;
}

const DIAS_SEM = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MINUTOS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

/** `2026-09-21` → "lunes 21 de septiembre". */
export function fechaLarga(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${DIAS_SEM[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

export default function RegistrarAsistenciaManualForm({ asignacion, fecha, onVolver, onRegistrada }: Props) {
  const { colors: C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  const turno = useMemo(() => turnoEnMinutos(asignacion.horario), [asignacion.horario]);
  const [hora, setHora] = useState(turno ? Math.floor(turno.ini / 60) : 0);
  const [minuto, setMinuto] = useState(turno ? turno.ini % 60 : 0);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  // Al cambiar de pasante/día, vuelve a la hora de entrada (llegó a tiempo).
  useEffect(() => {
    if (!turno) return;
    setHora(Math.floor(turno.ini / 60));
    setMinuto(turno.ini % 60);
    setEnviando(false);
    setError('');
  }, [asignacion.id, fecha, turno]);

  const cabecera = (
    <View style={s.headerRow}>
      <TouchableOpacity onPress={onVolver} hitSlop={10} style={s.volver} disabled={enviando}>
        <Ionicons name="chevron-back" size={20} color={C.textMuted} />
      </TouchableOpacity>
      <Text style={s.titulo}>Registrar asistencia</Text>
    </View>
  );

  if (!turno) {
    return (
      <View>
        {cabecera}
        <Text style={s.subtitulo}>Esta pasantía no tiene un horario válido, así que no se puede registrar la asistencia.</Text>
      </View>
    );
  }

  const llegadaMin = hora * 60 + minuto;
  const dentroDelTurno = llegadaMin >= turno.ini && llegadaMin < turno.fin;
  const aTiempo = llegadaMin <= turno.ini + MARGEN_ASISTENCIA_MIN;
  const horas: number[] = [];
  for (let h = Math.floor(turno.ini / 60); h <= Math.floor((turno.fin - 1) / 60); h++) horas.push(h);

  const confirmar = async () => {
    if (enviando || !dentroDelTurno) return;
    setEnviando(true);
    setError('');
    try {
      await registrarAsistenciaManual({ asignacionId: asignacion.id, fecha, llegadaMin });
      onRegistrada();
    } catch (e: any) {
      setError(e?.message || 'No se pudo registrar la asistencia. Intenta de nuevo.');
      setEnviando(false);
    }
  };

  return (
    <View>
      {cabecera}
      <Text style={s.nombre} numberOfLines={1} noTranslate>{asignacion.estudianteNombre || 'Estudiante'}</Text>
      <Text style={s.fecha} noTranslate>{fechaLarga(fecha).replace(/^./, c => c.toUpperCase())}</Text>
      <Text style={s.subtitulo}>
        Indica a qué hora llegó. Por defecto queda su hora de entrada; cámbiala solo si llegó tarde.
      </Text>
      <View style={s.horarioRow}>
        <Text style={s.horarioTxt}>Horario</Text>
        <Text style={s.horarioTxt} noTranslate>{`${minutosAHora12(turno.ini)} – ${minutosAHora12(turno.fin)}`}</Text>
      </View>

      <Text style={s.etiqueta}>Hora</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        {horas.map(h => (
          <TouchableOpacity key={h} activeOpacity={0.8} onPress={() => setHora(h)} style={[s.chip, hora === h && s.chipActivo]}>
            <Text style={[s.chipTxt, hora === h && s.chipTxtActivo]} noTranslate>
              {minutosAHora12(h * 60).replace(':00', '')}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={s.etiqueta}>Minutos</Text>
      <View style={[s.chips, { flexWrap: 'wrap' }]}>
        {MINUTOS.map(m => (
          <TouchableOpacity key={m} activeOpacity={0.8} onPress={() => setMinuto(m)} style={[s.chip, minuto === m && s.chipActivo]}>
            <Text style={[s.chipTxt, minuto === m && s.chipTxtActivo]} noTranslate>{String(m).padStart(2, '0')}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[s.resumen, { borderColor: (!dentroDelTurno ? C.error : aTiempo ? C.success : C.warning) + '55' }]}>
        <Text style={s.resumenHora} noTranslate>{minutosAHora12(llegadaMin)}</Text>
        {!dentroDelTurno ? (
          <Text style={[s.resumenTxt, { color: C.error }]}>
            La hora debe estar dentro del horario del pasante.
          </Text>
        ) : aTiempo ? (
          <Text style={[s.resumenTxt, { color: C.success }]}>
            Llegó dentro del margen: el día cuenta completo desde la hora de entrada.
          </Text>
        ) : (
          <Text style={[s.resumenTxt, { color: C.warning }]}>
            Llegada tarde: las horas de ese día cuentan desde la hora de llegada.
          </Text>
        )}
      </View>

      {!!error && (
        <View style={s.errorBox}>
          <Ionicons name="alert-circle-outline" size={16} color={C.error} />
          <Text style={s.errorTxt}>{error}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[s.btnPrimario, (!dentroDelTurno || enviando) && { opacity: 0.6 }]}
        activeOpacity={0.85}
        disabled={!dentroDelTurno || enviando}
        onPress={confirmar}
      >
        {enviando
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text style={s.btnPrimarioTxt}>Registrar asistencia</Text>}
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
    fecha: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: C.primaryLight, marginTop: 2 },
    subtitulo: {
      fontSize: 12, fontFamily: FONTS.interRegular, color: C.textSecondary,
      lineHeight: 17, marginTop: 8, marginBottom: 6,
    },
    horarioRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    horarioTxt: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: C.textMuted },
    etiqueta: {
      fontSize: 11.5, fontFamily: FONTS.interSemiBold, color: C.textMuted,
      textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 12, marginBottom: 6,
    },
    chips: { flexDirection: 'row', gap: 8 },
    chip: {
      paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.border,
    },
    chipActivo: { backgroundColor: C.primary + '22', borderColor: C.primary },
    chipTxt: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: C.textMuted },
    chipTxtActivo: { color: C.primaryLight },
    resumen: {
      marginTop: 14, borderWidth: 1, borderRadius: 14, padding: 12, gap: 3,
      backgroundColor: C.backgroundSurface,
    },
    resumenHora: { fontSize: 18, fontFamily: FONTS.soraBold, color: C.textPrimary },
    resumenTxt: { fontSize: 12, fontFamily: FONTS.interSemiBold, lineHeight: 17 },
    errorBox: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10,
      backgroundColor: C.error + '18', borderWidth: 1, borderColor: C.error + '40',
      borderRadius: 12, padding: 11,
    },
    errorTxt: { flex: 1, fontSize: 12, fontFamily: FONTS.interRegular, color: C.textPrimary, lineHeight: 17 },
    btnPrimario: {
      marginTop: 14, borderRadius: 13, paddingVertical: 13, alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.primary,
    },
    btnPrimarioTxt: { color: '#fff', fontFamily: FONTS.interSemiBold, fontSize: 14 },
  });
