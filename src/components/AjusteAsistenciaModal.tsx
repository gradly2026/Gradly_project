import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import { showAlert, showConfirm } from './AppAlert';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import type { DiaLaboral } from '../types/chat';
import {
  CATEGORIAS_AJUSTE,
  LABEL_CATEGORIA_AJUSTE,
  marcarDiaNoComputado,
  reactivarDia,
  suscribirAjustesAsistencia,
  type AjusteDia,
  type CategoriaAjuste,
} from '../services/ajusteAsistenciaService';
import type { AsignacionCupo } from '../services/reclamoCuposService';

// ════════════════════════════════════════════════════════════════════
//  AjusteAsistenciaModal — "días no computados" de una pasantía de cupo.
//
//  La empresa (o la universidad) marca un día PROGRAMADO del horario como
//  "no computado" (enfermedad, permiso, emergencia...): ese día deja de
//  sumar horas y la fecha de fin de la pasantía se corre exactamente un día
//  programado más. Es el arreglo al hueco de "un día de enfermedad igual
//  cuenta" del cálculo 100% por calendario (ver horasPasantia.ts).
//
//  Solo se pueden ajustar días de HOY hacia atrás (no tiene sentido excusar
//  un día que todavía no llega) y que caigan dentro del horario declarado.
// ════════════════════════════════════════════════════════════════════

interface Props {
  visible: boolean;
  asignacion: AsignacionCupo | null;
  /** uid de quien marca (la empresa o la universidad dueñas de la asignación). */
  marcadoPorUid: string;
  marcadoPorRol: 'empresa' | 'universidad';
  onClose: () => void;
}

const DIA_A_JS: Record<DiaLaboral, number> = {
  Lunes: 1, Martes: 2, Miércoles: 3, Jueves: 4, Viernes: 5,
};
const DIAS_SEMANA = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseISO = (s?: string | null): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? '').trim());
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const fechaLarga = (d: Date) =>
  d.toLocaleDateString('es-SV', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export default function AjusteAsistenciaModal({
  visible, asignacion, marcadoPorUid, marcadoPorRol, onClose,
}: Props) {
  const { colors: C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  const [ajustes, setAjustes] = useState<AjusteDia[]>([]);
  const [diaSel, setDiaSel] = useState<Date | null>(null);
  const [categoria, setCategoria] = useState<CategoriaAjuste | null>(null);
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);

  const hoy = useMemo(() => startOfDay(new Date()), []);
  const inicio = parseISO(asignacion?.fechaPresentacion) ?? hoy;
  const [mesVisible, setMesVisible] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1));

  useEffect(() => {
    if (!visible) return;
    setMesVisible(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    setDiaSel(null);
    setCategoria(null);
    setMotivo('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, asignacion?.id]);

  useEffect(() => {
    if (!visible) return;
    const unsub = suscribirAjustesAsistencia(asignacion?.id, setAjustes);
    return unsub;
  }, [visible, asignacion?.id]);

  if (!visible || !asignacion) return null;

  const dias: DiaLaboral[] = Array.isArray(asignacion.horario?.dias) ? (asignacion.horario!.dias as DiaLaboral[]) : [];
  const diasSet = new Set(dias.map(d => DIA_A_JS[d]).filter(n => n !== undefined));
  const ajustesPorFecha = new Map(ajustes.map(a => [a.fecha, a]));

  const y = mesVisible.getFullYear();
  const mth = mesVisible.getMonth();
  const primerDiaSemana = new Date(y, mth, 1).getDay();
  const diasEnMes = new Date(y, mth + 1, 0).getDate();
  const celdas: (Date | null)[] = [];
  for (let i = 0; i < primerDiaSemana; i++) celdas.push(null);
  for (let d = 1; d <= diasEnMes; d++) celdas.push(new Date(y, mth, d));

  const minMonth = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
  const maxMonth = new Date(hoy.getFullYear(), hoy.getMonth() + 3, 1); // un poco de contexto a futuro, informativo
  const monthStart = new Date(y, mth, 1);
  const puedeAnterior = monthStart.getTime() > minMonth.getTime();
  const puedeSiguiente = monthStart.getTime() < maxMonth.getTime();

  const cambiarMes = (delta: number) => {
    if (delta < 0 && !puedeAnterior) return;
    if (delta > 0 && !puedeSiguiente) return;
    setMesVisible(new Date(y, mth + delta, 1));
    setDiaSel(null);
  };

  const tocarDia = (d: Date) => {
    const esProgramado = diasSet.has(d.getDay()) && d.getTime() >= inicio.getTime();
    if (!esProgramado) return;
    if (d.getTime() > hoy.getTime()) {
      void showAlert('Aún no', 'Solo puedes ajustar días de hoy hacia atrás.');
      return;
    }
    setDiaSel(sameDay(d, diaSel ?? new Date(0)) ? null : d);
    setCategoria(null);
    setMotivo('');
  };

  const ajusteDelDiaSel = diaSel ? ajustesPorFecha.get(toISO(diaSel)) : undefined;

  const confirmarMarcar = async () => {
    if (!diaSel || !categoria || !motivo.trim() || guardando) return;
    const ok = await showConfirm({
      title: 'No computar este día',
      message: `El ${fechaLarga(diaSel)} dejará de contar para las horas de ${asignacion.estudianteNombre || 'el estudiante'}. Su pasantía se extiende un día. ¿Confirmas?`,
      confirmText: 'Confirmar',
    });
    if (!ok) return;
    setGuardando(true);
    try {
      await marcarDiaNoComputado({
        asignacion, fecha: toISO(diaSel), categoria, motivo,
        marcadoPor: marcadoPorUid, marcadoPorRol,
      });
      setDiaSel(null);
      setCategoria(null);
      setMotivo('');
    } catch (e: any) {
      void showAlert('No se pudo guardar', e?.message ?? 'Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const confirmarReactivar = async () => {
    if (!diaSel || guardando) return;
    const ok = await showConfirm({
      title: 'Reactivar este día',
      message: 'Este día vuelve a contar para las horas de la pasantía. ¿Confirmas?',
      confirmText: 'Reactivar',
    });
    if (!ok) return;
    setGuardando(true);
    try {
      await reactivarDia(asignacion, toISO(diaSel));
      setDiaSel(null);
    } catch (e: any) {
      void showAlert('No se pudo guardar', e?.message ?? 'Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.headerRow}>
            <Text style={s.titulo} numberOfLines={2}>
              Ajustar asistencia de {asignacion.estudianteNombre || 'estudiante'}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>
          <Text style={s.subtitulo}>
            Toca un día programado del horario para marcarlo como "no computado" (no cuenta para sus
            horas). La fecha de fin de la pasantía se corre un día por cada uno.
          </Text>

          <View style={s.nav}>
            <TouchableOpacity onPress={() => cambiarMes(-1)} disabled={!puedeAnterior} style={{ opacity: puedeAnterior ? 1 : 0.3, padding: 6 }}>
              <Ionicons name="chevron-back" size={20} color={C.textPrimary} />
            </TouchableOpacity>
            <Text style={s.mesLabel}>{MESES[mth]} {y}</Text>
            <TouchableOpacity onPress={() => cambiarMes(1)} disabled={!puedeSiguiente} style={{ opacity: puedeSiguiente ? 1 : 0.3, padding: 6 }}>
              <Ionicons name="chevron-forward" size={20} color={C.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={s.weekRow}>
            {DIAS_SEMANA.map((d, i) => <Text key={i} style={s.weekday}>{d}</Text>)}
          </View>
          <View style={s.grid}>
            {celdas.map((d, i) => {
              if (!d) return <View key={i} style={s.cell} />;
              const day = startOfDay(d);
              const esProgramado = diasSet.has(day.getDay()) && day.getTime() >= inicio.getTime();
              const esFutura = day.getTime() > hoy.getTime();
              const noComputado = esProgramado && ajustesPorFecha.has(toISO(day));
              const esSel = diaSel && sameDay(day, diaSel);
              return (
                <TouchableOpacity key={i} style={s.cell} activeOpacity={esProgramado ? 0.7 : 1} onPress={() => tocarDia(day)}>
                  <View style={[
                    s.dia,
                    esProgramado && (esFutura ? s.diaProgramadaFutura : s.diaProgramadaPasada),
                    noComputado && s.diaNoComputado,
                    esSel && s.diaSel,
                  ]}>
                    <Text style={[s.diaTxt, esSel && s.diaTxtSel]}>{d.getDate()}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={s.leyenda}>
            <View style={s.leyendaItem}><View style={[s.punto, { backgroundColor: C.warning }]} /><Text style={s.leyendaTxt}>Programado</Text></View>
            <View style={s.leyendaItem}><View style={[s.punto, { backgroundColor: C.error }]} /><Text style={s.leyendaTxt}>No computado</Text></View>
          </View>

          {diaSel && (
            <View style={s.detalle}>
              <Text style={s.detalleFecha}>{fechaLarga(diaSel)}</Text>
              {ajusteDelDiaSel ? (
                <>
                  <Text style={s.detalleCategoria}>{LABEL_CATEGORIA_AJUSTE[ajusteDelDiaSel.categoria]}</Text>
                  <Text style={s.detalleMotivo} noTranslate>{ajusteDelDiaSel.motivo}</Text>
                  <TouchableOpacity
                    style={[s.btnSecundario, guardando && { opacity: 0.6 }]}
                    activeOpacity={0.85}
                    disabled={guardando}
                    onPress={confirmarReactivar}
                  >
                    {guardando
                      ? <ActivityIndicator size="small" color={C.primaryLight} />
                      : <Text style={s.btnSecundarioTxt}>Reactivar este día</Text>}
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={s.chipsRow}>
                    {CATEGORIAS_AJUSTE.map(cat => (
                      <TouchableOpacity
                        key={cat}
                        style={[s.chip, categoria === cat && s.chipActivo]}
                        onPress={() => setCategoria(cat)}
                      >
                        <Text style={[s.chipTxt, categoria === cat && s.chipTxtActivo]}>{LABEL_CATEGORIA_AJUSTE[cat]}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    style={s.input}
                    value={motivo}
                    onChangeText={setMotivo}
                    placeholder="Motivo (ej. el estudiante avisó que está enfermo)"
                    placeholderTextColor={C.textMuted}
                    multiline
                  />
                  <TouchableOpacity
                    style={[s.btnPrimary, (!categoria || !motivo.trim() || guardando) && { opacity: 0.5 }]}
                    activeOpacity={0.85}
                    disabled={!categoria || !motivo.trim() || guardando}
                    onPress={confirmarMarcar}
                  >
                    {guardando
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={s.btnPrimaryTxt}>No computar este día</Text>}
                  </TouchableOpacity>
                </>
              )}
            </View>
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
      width: '100%', maxWidth: 420,
      backgroundColor: C.backgroundCard,
      borderRadius: 22, borderWidth: 1, borderColor: C.border,
      padding: 20,
    },
    headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    titulo: { flex: 1, fontSize: 16, fontFamily: FONTS.soraBold, color: C.textPrimary },
    subtitulo: {
      fontSize: 12, fontFamily: FONTS.interRegular, color: C.textSecondary,
      lineHeight: 17, marginTop: 8, marginBottom: 14,
    },
    nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    mesLabel: { fontSize: 14, fontFamily: FONTS.soraSemiBold, color: C.textPrimary },
    weekRow: { flexDirection: 'row', marginBottom: 4 },
    weekday: { flex: 1, textAlign: 'center', fontSize: 11, fontFamily: FONTS.interSemiBold, color: C.textMuted },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: { width: `${100 / 7}%` as any, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
    dia: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    diaProgramadaPasada: { backgroundColor: C.warning + '33', borderWidth: 1, borderColor: C.warning + '88' },
    diaProgramadaFutura: { borderWidth: 1, borderColor: C.border },
    diaNoComputado: { backgroundColor: C.error + '33', borderWidth: 1, borderColor: C.error + '88' },
    diaSel: { backgroundColor: C.primary, borderWidth: 0 },
    diaTxt: { fontSize: 12.5, fontFamily: FONTS.interMedium, color: C.textPrimary },
    diaTxtSel: { color: '#fff', fontFamily: FONTS.interSemiBold },
    leyenda: { flexDirection: 'row', gap: 14, marginTop: 10 },
    leyendaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    punto: { width: 8, height: 8, borderRadius: 4 },
    leyendaTxt: { fontSize: 11, fontFamily: FONTS.interRegular, color: C.textMuted },
    detalle: {
      marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.border, gap: 8,
    },
    detalleFecha: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: C.textPrimary, textTransform: 'capitalize' },
    detalleCategoria: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: C.error },
    detalleMotivo: { fontSize: 12.5, fontFamily: FONTS.interRegular, color: C.textSecondary, lineHeight: 18 },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: C.border,
    },
    chipActivo: { backgroundColor: C.primary + '22', borderColor: C.primary },
    chipTxt: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: C.textMuted },
    chipTxtActivo: { color: C.primaryLight },
    input: {
      borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
      fontSize: 13, fontFamily: FONTS.interRegular, color: C.textPrimary, minHeight: 60, textAlignVertical: 'top',
    },
    btnPrimary: { backgroundColor: C.primary, borderRadius: 13, paddingVertical: 13, alignItems: 'center' },
    btnPrimaryTxt: { color: '#fff', fontFamily: FONTS.interSemiBold, fontSize: 13.5 },
    btnSecundario: {
      borderRadius: 13, borderWidth: 1, borderColor: C.border, paddingVertical: 12, alignItems: 'center',
    },
    btnSecundarioTxt: { color: C.primaryLight, fontFamily: FONTS.interSemiBold, fontSize: 13 },
  });
