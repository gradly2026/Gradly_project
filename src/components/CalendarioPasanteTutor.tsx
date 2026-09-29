import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import { showAlert, showConfirm } from './AppAlert';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import {
  confirmarSalida,
  hoyISOLocal,
  suscribirRegistroDia,
  type RegistroAsistenciaDia,
} from '../services/asistenciaCodigoService';
import {
  registrarObservacionTutor,
  suscribirObservacionDia,
  type ObservacionTutorDia,
} from '../services/observacionTutorService';
import { suscribirAjustesAsistencia } from '../services/ajusteAsistenciaService';
import { diasSinAsistencia } from '../utils/horasPasantia';
import type { AsignacionCupo } from '../services/reclamoCuposService';
import type { DiaLaboral } from '../types/chat';
import RegistrarAsistenciaManualForm, { fechaLarga } from './RegistrarAsistenciaManualForm';
import SalidaAnticipadaForm from './SalidaAnticipadaForm';

// ════════════════════════════════════════════════════════════════════
//  CalendarioPasanteTutor — rol "tutor", Fase 3: calendario de UN pasante
//  seleccionado (no el calendario agregado de CalendarioEventos, que es por
//  empresa/universidad/estudiante completos). Hoy → observación editable +
//  confirmar salida + salida anticipada. Días pasados → solo lectura (hora
//  de entrada + observación), con corrección manual si el día se quedó sin
//  registrar y aún está dentro de la ventana de corrección.
// ════════════════════════════════════════════════════════════════════

const DIAS_SEMANA = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DIA_A_JS: Record<DiaLaboral, number> = {
  Lunes: 1, Martes: 2, Miércoles: 3, Jueves: 4, Viernes: 5,
};

const isoDe = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

const horaCorta = (ms: number | null): string => {
  if (ms == null) return '—';
  try {
    return new Date(ms).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
};

export default function CalendarioPasanteTutor({
  asignacion,
  actorUid,
  soloLectura = false,
}: {
  asignacion: AsignacionCupo;
  /** uid de quien puede actuar (el tutor asignado, o la empresa dueña — ambos
   *  pueden hacer las mismas 4 acciones de asistencia). Solo se usa como
   *  valor a guardar en `salidaConfirmadaPor`; la autorización real la dan
   *  las reglas de Firestore sobre `request.auth.uid`. No hace falta cuando
   *  `soloLectura` es true. */
  actorUid?: string;
  /** true para universidad/estudiante: mismo calendario y misma observación,
   *  pero sin ningún botón de acción — ellos no son responsables de esta
   *  pasantía, solo la consultan. */
  soloLectura?: boolean;
}) {
  const { colors: C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const hoy = useMemo(() => hoyISOLocal(), []);

  const diasHorario: string[] = Array.isArray(asignacion.horario?.dias) ? (asignacion.horario!.dias as string[]) : [];
  // Un mes tiene a lo sumo 42 celdas: recalcular esto cada render sale más
  // barato que la contabilidad de un useMemo bien memoizado.
  const diasSet = new Set(diasHorario.map(d => DIA_A_JS[d as DiaLaboral]).filter((n): n is number => n !== undefined));
  const fechaInicio = asignacion.fechaPresentacion ?? null;

  const hoyD = new Date();
  const [viewYear, setViewYear] = useState(hoyD.getFullYear());
  const [viewMonth, setViewMonth] = useState(hoyD.getMonth());
  const [fechaSel, setFechaSel] = useState<string | null>(null);
  const [manual, setManual] = useState<string | null>(null);
  const [salidaAnticipada, setSalidaAnticipada] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [borrador, setBorrador] = useState('');
  const [guardando, setGuardando] = useState(false);

  const canNext = isoDe(viewYear, viewMonth, 1) <= hoy;

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const diasEnMes = new Date(viewYear, viewMonth + 1, 0).getDate();
  const celdas: (string | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) celdas.push(null);
  for (let d = 1; d <= diasEnMes; d++) celdas.push(isoDe(viewYear, viewMonth, d));

  // Días programados del mes visible que ya pasaron (o son hoy) — solo esos
  // tienen dato que escuchar; el futuro no tiene nada todavía.
  const fechasConsultables = celdas.filter((iso): iso is string => {
    if (!iso || iso > hoy) return false;
    if (fechaInicio && iso < fechaInicio) return false;
    const d = new Date(`${iso}T00:00:00`);
    return diasSet.has(d.getDay());
  });

  const [registros, setRegistros] = useState<Record<string, RegistroAsistenciaDia | null>>({});
  const [observaciones, setObservaciones] = useState<Record<string, ObservacionTutorDia | null>>({});
  const [excluidas, setExcluidas] = useState<string[]>([]);

  const fechasKey = fechasConsultables.join(',');
  useEffect(() => {
    const ids = fechasKey ? fechasKey.split(',') : [];
    const unsubsR = ids.map(f => suscribirRegistroDia(asignacion.id, f, reg => {
      setRegistros(prev => ({ ...prev, [f]: reg }));
    }));
    const unsubsO = ids.map(f => suscribirObservacionDia(asignacion.id, f, obs => {
      setObservaciones(prev => ({ ...prev, [f]: obs }));
    }));
    return () => { unsubsR.forEach(u => u()); unsubsO.forEach(u => u()); };
  }, [asignacion.id, fechasKey]);

  useEffect(() => {
    const unsub = suscribirAjustesAsistencia(asignacion.id, dias => setExcluidas(dias.map(d => d.fecha)));
    return unsub;
  }, [asignacion.id]);

  const faltantes = new Set(diasSinAsistencia(asignacion.horario, fechaInicio, asignacion.asistencias ?? {}, excluidas));

  // El borrador de la observación de hoy se sincroniza con lo ya guardado,
  // pero solo mientras el usuario no ha tocado nada desde que se abrió el día.
  const observacionHoyTexto = observaciones[hoy]?.texto ?? '';
  useEffect(() => {
    if (fechaSel === hoy) setBorrador(observacionHoyTexto);
  }, [fechaSel, hoy, observacionHoyTexto]);

  const goPrev = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1);
    setFechaSel(null);
  };
  const goNext = () => {
    if (!canNext) return;
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1);
    setFechaSel(null);
  };

  const guardarObservacion = async () => {
    setGuardando(true);
    try {
      await registrarObservacionTutor(asignacion.id, borrador.trim());
    } catch (e: any) {
      void showAlert('No se pudo guardar', e?.message ?? 'Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const onConfirmarSalida = async () => {
    const ok = await showConfirm({
      title: 'Confirmar salida',
      message: `¿${asignacion.estudianteNombre || 'Este pasante'} ya salió hoy?`,
      confirmText: 'Confirmar',
    });
    if (!ok) return;
    setConfirmando(true);
    try {
      await confirmarSalida(asignacion.id, hoy, actorUid ?? '');
    } catch (e: any) {
      void showAlert('No se pudo confirmar', e?.message ?? 'Intenta de nuevo.');
    } finally {
      setConfirmando(false);
    }
  };

  if (manual) {
    return (
      <RegistrarAsistenciaManualForm
        asignacion={asignacion}
        fecha={manual}
        onVolver={() => setManual(null)}
        onRegistrada={() => setManual(null)}
      />
    );
  }
  if (salidaAnticipada) {
    return (
      <SalidaAnticipadaForm
        asignacion={asignacion}
        onVolver={() => setSalidaAnticipada(false)}
        onRegistrada={() => setSalidaAnticipada(false)}
      />
    );
  }

  const registroSel = fechaSel ? registros[fechaSel] ?? null : null;
  const observacionSel = fechaSel ? observaciones[fechaSel] ?? null : null;
  const esHoySel = fechaSel === hoy;
  const noComputadoSel = !!fechaSel && excluidas.includes(fechaSel);
  const corregibleSel = !!fechaSel && faltantes.has(fechaSel);

  return (
    <View>
      <View style={s.nav}>
        <TouchableOpacity onPress={goPrev} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={20} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={s.monthLabel} noTranslate>{MESES[viewMonth]} {viewYear}</Text>
        <TouchableOpacity onPress={goNext} disabled={!canNext} style={{ opacity: canNext ? 1 : 0.3, padding: 6 }}>
          <Ionicons name="chevron-forward" size={20} color={C.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={s.weekRow}>
        {DIAS_SEMANA.map((d, i) => <Text key={i} style={s.weekday}>{d}</Text>)}
      </View>

      <View style={s.grid}>
        {celdas.map((iso, idx) => {
          if (!iso) return <View key={idx} style={s.cell} />;
          const d = new Date(`${iso}T00:00:00`);
          const programado = diasSet.has(d.getDay()) && (!fechaInicio || iso >= fechaInicio);
          const esFuturo = iso > hoy;
          const esHoy = iso === hoy;
          const reg = registros[iso];
          const obs = observaciones[iso];
          const interactivo = programado && !esFuturo;
          const dotColor = !programado || esFuturo
            ? 'transparent'
            : reg === undefined ? C.border
              : reg === null ? (excluidas.includes(iso) ? C.textMuted : C.warning)
                : reg.estado === 'tarde' ? C.warning : C.success;
          return (
            <TouchableOpacity
              key={idx}
              style={s.cell}
              disabled={!interactivo}
              activeOpacity={0.7}
              onPress={() => setFechaSel(iso)}
            >
              <View style={[
                s.day,
                esHoy && s.dayHoy,
                fechaSel === iso && s.daySel,
              ]}>
                <Text style={[s.dayText, !programado && s.dayTextInerte]}>{d.getDate()}</Text>
                {programado && !esFuturo && <View style={[s.dot, { backgroundColor: dotColor }]} />}
                {!!obs?.texto && <View style={s.pin}><Ionicons name="chatbox-ellipses" size={8} color={C.primaryLight} /></View>}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {fechaSel && (
        <View style={s.panel}>
          <Text style={s.panelFecha} noTranslate>{fechaLarga(fechaSel)}</Text>

          {esHoySel && !soloLectura ? (
            <>
              {registroSel ? (
                <Text style={s.panelDato}>
                  {`Entrada: ${horaCorta(registroSel.horaEntrada)} · ${registroSel.estado === 'tarde' ? `Tarde (${registroSel.tardanzaMin} min)` : 'Presente'}`}
                </Text>
              ) : (
                <Text style={s.panelVacio}>Aún no se ha registrado la entrada de hoy.</Text>
              )}

              <Text style={s.panelLabel}>Observación de hoy</Text>
              <TextInput
                style={s.input}
                value={borrador}
                onChangeText={setBorrador}
                placeholder="Escribe una nota sobre el día de hoy…"
                placeholderTextColor={C.textMuted}
                multiline
                numberOfLines={3}
              />
              <TouchableOpacity style={s.btn} activeOpacity={0.85} disabled={guardando} onPress={guardarObservacion}>
                {guardando ? <ActivityIndicator size="small" color={C.primaryLight} /> : <Text style={s.btnTxt}>Guardar observación</Text>}
              </TouchableOpacity>

              {registroSel && !registroSel.salidaConfirmada && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TouchableOpacity style={[s.btn, { flex: 1 }]} activeOpacity={0.85} disabled={confirmando} onPress={onConfirmarSalida}>
                    {confirmando ? <ActivityIndicator size="small" color={C.primaryLight} /> : <Text style={s.btnTxt}>Confirmar salida</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={s.btnAdvertencia} activeOpacity={0.85} onPress={() => setSalidaAnticipada(true)}>
                    <Ionicons name="warning-outline" size={12} color={C.warning} />
                    <Text style={s.btnAdvertenciaTxt}>Salida anticipada</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          ) : (
            <>
              {registroSel ? (
                <Text style={s.panelDato}>
                  {`Entrada: ${horaCorta(registroSel.horaEntrada)} · ${registroSel.estado === 'tarde' ? `Tarde (${registroSel.tardanzaMin} min)` : 'Presente'}`}
                </Text>
              ) : noComputadoSel ? (
                <Text style={s.panelVacio}>Este día quedó marcado como no computado.</Text>
              ) : corregibleSel && !soloLectura ? (
                <TouchableOpacity style={s.btn} activeOpacity={0.85} onPress={() => setManual(fechaSel)}>
                  <Text style={s.btnTxt}>Registrar asistencia de este día</Text>
                </TouchableOpacity>
              ) : (
                <Text style={s.panelVacio}>
                  {esHoySel ? 'Aún no se ha registrado la entrada de hoy.' : 'No hay asistencia registrada este día.'}
                </Text>
              )}
              {!!observacionSel?.texto && (
                <>
                  <Text style={s.panelLabel}>Observación</Text>
                  <Text style={s.panelObservacion} noTranslate>{observacionSel.texto}</Text>
                </>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}

const makeStyles = (C: GradlyColors) =>
  StyleSheet.create({
    nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    monthLabel: { color: C.textPrimary, fontSize: 14.5, fontFamily: FONTS.soraBold },
    weekRow: { flexDirection: 'row', marginBottom: 4 },
    weekday: { flex: 1, textAlign: 'center', color: C.textMuted, fontSize: 11.5, fontFamily: FONTS.interSemiBold },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    // 14.28% y NO `100 / 7`: en float32 (Yoga) la 7.ª celda salta de fila en
    // ciertos anchos de pantalla — bug ya conocido en CalendarPickerModal.
    cell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
    day: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    dayHoy: { borderWidth: 1.5, borderColor: C.primary },
    daySel: { backgroundColor: C.primary + '22' },
    dayText: { color: C.textPrimary, fontSize: 12.5 },
    dayTextInerte: { color: C.textMuted, opacity: 0.35 },
    dot: { position: 'absolute', bottom: 1, width: 5, height: 5, borderRadius: 3 },
    pin: { position: 'absolute', top: -2, right: -2 },
    panel: {
      marginTop: 14, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12,
    },
    panelFecha: { fontSize: 13.5, fontFamily: FONTS.soraBold, color: C.textPrimary, marginBottom: 6, textTransform: 'capitalize' },
    panelDato: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: C.textSecondary, marginBottom: 8 },
    panelVacio: { fontSize: 12, fontFamily: FONTS.interRegular, color: C.textMuted, fontStyle: 'italic', marginBottom: 8 },
    panelLabel: { fontSize: 11.5, fontFamily: FONTS.interSemiBold, color: C.textMuted, marginBottom: 4, marginTop: 4 },
    panelObservacion: { fontSize: 12.5, fontFamily: FONTS.interRegular, color: C.textPrimary, lineHeight: 18 },
    input: {
      borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 10,
      fontSize: 12.5, fontFamily: FONTS.interRegular, color: C.textPrimary,
      backgroundColor: C.backgroundSurface, minHeight: 70, textAlignVertical: 'top',
    },
    btn: {
      marginTop: 8, borderWidth: 1, borderColor: C.primary + '55', borderRadius: 10,
      paddingVertical: 9, alignItems: 'center', justifyContent: 'center',
    },
    btnTxt: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: C.primaryLight },
    btnAdvertencia: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
      borderWidth: 1, borderColor: C.warning + '55', borderRadius: 10,
      paddingHorizontal: 11, paddingVertical: 9,
    },
    btnAdvertenciaTxt: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: C.warning },
  });
