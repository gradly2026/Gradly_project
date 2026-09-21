import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import { showAlert, showConfirm } from './AppAlert';
import { db } from '../config/firebaseConfig';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import {
  confirmarSalida,
  hoyISOLocal,
  suscribirRegistroDia,
  type RegistroAsistenciaDia,
} from '../services/asistenciaCodigoService';
import { suscribirAjustesAsistencia } from '../services/ajusteAsistenciaService';
import type { AsignacionCupo } from '../services/reclamoCuposService';
import type { DiaLaboral } from '../types/chat';
import { VENTANA_CORRECCION_DIAS, diasSinAsistencia } from '../utils/horasPasantia';
import RegistrarAsistenciaManualForm, { fechaLarga } from './RegistrarAsistenciaManualForm';

// ════════════════════════════════════════════════════════════════════
//  HistorialAsistenciaModal — Fase 3 de "asistencia real": la empresa ve,
//  de un vistazo, a QUIÉN le tocaba presentarse hoy y en qué estado va cada
//  uno (sin registrar / presente / tarde / con salida confirmada), y confirma
//  la salida con un solo toque — sin código, porque a esa hora ya se validó
//  que el pasante entró.
//
//  "Días anteriores": los días recientes en que el pasante NO tiene asistencia
//  registrada. Como las horas cuentan por asistencia, si sí fue y se olvidó su
//  código la empresa lo corrige aquí (hasta VENTANA_CORRECCION_DIAS días
//  después), indicando la hora de llegada.
// ════════════════════════════════════════════════════════════════════

interface Props {
  visible: boolean;
  empresaId: string;
  onClose: () => void;
}

type Filtro = 'todos' | 'registrada' | 'sinRegistrar' | 'confirmarSalida' | 'anteriores';

const DIA_A_JS: Record<DiaLaboral, number> = {
  Lunes: 1, Martes: 2, Miércoles: 3, Jueves: 4, Viernes: 5,
};

interface Fila {
  asignacion: AsignacionCupo;
  registro: RegistroAsistenciaDia | null;
}

export default function HistorialAsistenciaModal({ visible, empresaId, onClose }: Props) {
  const { colors: C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const hoy = useMemo(() => hoyISOLocal(), []);

  const [cupos, setCupos] = useState<AsignacionCupo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [registros, setRegistros] = useState<Record<string, RegistroAsistenciaDia | null>>({});
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [confirmando, setConfirmando] = useState<string | null>(null);
  // Días anteriores sin asistencia registrada: días no computados por pasante
  // (no se piden) y el (pasante, día) que se está corrigiendo, si hay uno.
  const [excluidasPorAsig, setExcluidasPorAsig] = useState<Record<string, string[]>>({});
  const [manual, setManual] = useState<{ asignacion: AsignacionCupo; fecha: string } | null>(null);

  useEffect(() => {
    if (!visible) setManual(null);
  }, [visible]);

  useEffect(() => {
    if (!visible || !empresaId) return;
    setCargando(true);
    const unsub = onSnapshot(
      query(collection(db, 'asignaciones_cupo'), where('empresaId', '==', empresaId), where('estado', '==', 'tomado')),
      snap => {
        setCupos(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as AsignacionCupo)));
        setCargando(false);
      },
      () => setCargando(false),
    );
    return unsub;
  }, [visible, empresaId]);

  // A quién le toca HOY según su horario (activos, con Día 1 ya en curso).
  const hoyProgramados = useMemo(() => {
    const diaJS = new Date().getDay();
    return cupos.filter(c => {
      if (c.finalizada === true) return false;
      if (!c.fechaPresentacion || c.fechaPresentacion > hoy) return false;
      const dias: string[] = Array.isArray(c.horario?.dias) ? (c.horario!.dias as string[]) : [];
      return dias.some(d => DIA_A_JS[d as DiaLaboral] === diaJS);
    });
  }, [cupos, hoy]);

  const idsKey = hoyProgramados.map(c => c.id).sort().join(',');
  useEffect(() => {
    if (!visible) return;
    const ids = idsKey ? idsKey.split(',') : [];
    const unsubs = ids.map(id => suscribirRegistroDia(id, hoy, reg => {
      setRegistros(prev => ({ ...prev, [id]: reg }));
    }));
    return () => unsubs.forEach(u => u());
  }, [visible, idsKey, hoy]);

  const filas: Fila[] = useMemo(
    () => hoyProgramados.map(a => ({ asignacion: a, registro: registros[a.id] ?? null })),
    [hoyProgramados, registros],
  );

  // Pasantías en curso con su Día 1 fijado: son las que pueden tener días sin
  // asistencia. Se escuchan sus días no computados para no ofrecer un día que la
  // empresa ya excusó.
  const activos = useMemo(
    () => cupos.filter(c => c.finalizada !== true && c.terminacionAnticipada !== true && !!c.fechaPresentacion),
    [cupos],
  );
  const activosKey = activos.map(c => c.id).sort().join(',');
  useEffect(() => {
    if (!visible) return;
    const ids = activosKey ? activosKey.split(',') : [];
    const unsubs = ids.map(id => suscribirAjustesAsistencia(id, dias => {
      setExcluidasPorAsig(prev => ({ ...prev, [id]: dias.map(d => d.fecha) }));
    }));
    return () => unsubs.forEach(u => u());
  }, [visible, activosKey]);

  const faltantes = useMemo(() => {
    const out: { asignacion: AsignacionCupo; fecha: string }[] = [];
    activos.forEach(a => {
      diasSinAsistencia(a.horario, a.fechaPresentacion, a.asistencias ?? {}, excluidasPorAsig[a.id])
        .forEach(fecha => out.push({ asignacion: a, fecha }));
    });
    return out.sort(
      (x, y) => y.fecha.localeCompare(x.fecha)
        || String(x.asignacion.estudianteNombre ?? '').localeCompare(String(y.asignacion.estudianteNombre ?? '')),
    );
  }, [activos, excluidasPorAsig]);

  const porFiltro = (f: Filtro) => filas.filter(fila => {
    if (f === 'todos' || f === 'anteriores') return true;
    if (f === 'sinRegistrar') return !fila.registro;
    if (f === 'registrada') return !!fila.registro;
    return !!fila.registro && !fila.registro.salidaConfirmada; // confirmarSalida
  });

  const visibles = filtro === 'anteriores' ? [] : porFiltro(filtro);
  const contador = (f: Filtro) => (f === 'anteriores' ? faltantes.length : porFiltro(f).length);

  const onConfirmarSalida = async (fila: Fila) => {
    if (confirmando) return;
    const ok = await showConfirm({
      title: 'Confirmar salida',
      message: `¿${fila.asignacion.estudianteNombre || 'Este pasante'} ya salió hoy?`,
      confirmText: 'Confirmar',
    });
    if (!ok) return;
    setConfirmando(fila.asignacion.id);
    try {
      await confirmarSalida(fila.asignacion.id, hoy, empresaId);
    } catch (e: any) {
      void showAlert('No se pudo confirmar', e?.message ?? 'Intenta de nuevo.');
    } finally {
      setConfirmando(null);
    }
  };

  if (!visible) return null;

  const FiltroChip = ({ f, label }: { f: Filtro; label: string }) => (
    <TouchableOpacity
      onPress={() => setFiltro(f)}
      activeOpacity={0.75}
      style={[s.chip, filtro === f && s.chipActivo]}
    >
      <Text style={[s.chipTxt, filtro === f && s.chipTxtActivo]}>{label} ({contador(f)})</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.card}>
         {manual ? (
          <RegistrarAsistenciaManualForm
            asignacion={manual.asignacion}
            fecha={manual.fecha}
            onVolver={() => setManual(null)}
            onRegistrada={() => setManual(null)}
          />
         ) : (
         <>
          <View style={s.headerRow}>
            <Text style={s.titulo}>Asistencia de hoy</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>
            <FiltroChip f="todos" label="Todos" />
            <FiltroChip f="registrada" label="Asistencia registrada" />
            <FiltroChip f="sinRegistrar" label="Sin registrar" />
            <FiltroChip f="confirmarSalida" label="Confirmar salida" />
            <FiltroChip f="anteriores" label="Días anteriores" />
          </ScrollView>

          {cargando ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={C.primary} />
            </View>
          ) : filtro === 'anteriores' ? (
            <>
              <Text style={s.ayuda}>
                {`Si un pasante sí asistió pero no se registró su código, registra aquí su asistencia. Puedes hacerlo hasta ${VENTANA_CORRECCION_DIAS} días después.`}
              </Text>
              {faltantes.length === 0 ? (
                <Text style={s.vacio}>No hay días pendientes por registrar.</Text>
              ) : (
                <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 8 }}>
                  {faltantes.map(f => (
                    <View key={`${f.asignacion.id}_${f.fecha}`} style={s.fila}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.filaNombre} numberOfLines={1} noTranslate>{f.asignacion.estudianteNombre || 'Estudiante'}</Text>
                        <Text style={s.filaSub} noTranslate>{fechaLarga(f.fecha)}</Text>
                      </View>
                      <TouchableOpacity style={s.btnSalida} activeOpacity={0.85} onPress={() => setManual(f)}>
                        <Text style={s.btnSalidaTxt}>Registrar</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}
            </>
          ) : visibles.length === 0 ? (
            <Text style={s.vacio}>Nadie en esta lista por ahora.</Text>
          ) : (
            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8 }}>
              {visibles.map(fila => {
                const { asignacion: a, registro: r } = fila;
                const estadoColor = !r ? C.textMuted : r.estado === 'tarde' ? C.warning : C.success;
                const estadoTxt = !r ? 'Sin registrar' : r.estado === 'tarde' ? `Tarde (${r.tardanzaMin} min)` : 'Presente';
                return (
                  <View key={a.id} style={s.fila}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.filaNombre} numberOfLines={1} noTranslate>{a.estudianteNombre || 'Estudiante'}</Text>
                      {!!a.vacanteTitulo && <Text style={s.filaSub} numberOfLines={1} noTranslate>{a.vacanteTitulo}</Text>}
                      <Text style={[s.filaEstado, { color: estadoColor }]}>{estadoTxt}</Text>
                    </View>
                    {r && !r.salidaConfirmada ? (
                      <TouchableOpacity
                        style={[s.btnSalida, confirmando === a.id && { opacity: 0.6 }]}
                        activeOpacity={0.85}
                        disabled={confirmando === a.id}
                        onPress={() => onConfirmarSalida(fila)}
                      >
                        {confirmando === a.id
                          ? <ActivityIndicator size="small" color={C.primaryLight} />
                          : <Text style={s.btnSalidaTxt}>Confirmar salida</Text>}
                      </TouchableOpacity>
                    ) : r?.salidaConfirmada ? (
                      <View style={s.salidaOk}>
                        <Ionicons name="checkmark-circle" size={14} color={C.success} />
                        <Text style={s.salidaOkTxt}>Salida confirmada</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
          )}
         </>
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
      width: '100%', maxWidth: 460,
      backgroundColor: C.backgroundCard,
      borderRadius: 22, borderWidth: 1, borderColor: C.border,
      padding: 20,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    titulo: { fontSize: 16, fontFamily: FONTS.soraBold, color: C.textPrimary },
    chipsRow: { gap: 8, paddingBottom: 12 },
    chip: {
      paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.border,
    },
    chipActivo: { backgroundColor: C.primary + '22', borderColor: C.primary },
    chipTxt: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: C.textMuted },
    chipTxtActivo: { color: C.primaryLight },
    vacio: { fontSize: 12.5, fontFamily: FONTS.interRegular, color: C.textMuted, fontStyle: 'italic', paddingVertical: 14 },
    ayuda: { fontSize: 12, fontFamily: FONTS.interRegular, color: C.textSecondary, lineHeight: 17, marginBottom: 10 },
    fila: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 12,
      backgroundColor: C.backgroundSurface,
    },
    filaNombre: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: C.textPrimary },
    filaSub: { fontSize: 11.5, fontFamily: FONTS.interRegular, color: C.textMuted, marginTop: 1 },
    filaEstado: { fontSize: 11.5, fontFamily: FONTS.interSemiBold, marginTop: 3 },
    btnSalida: {
      borderWidth: 1, borderColor: C.primary + '55', borderRadius: 10,
      paddingHorizontal: 11, paddingVertical: 8,
    },
    btnSalidaTxt: { fontSize: 11.5, fontFamily: FONTS.interSemiBold, color: C.primaryLight },
    salidaOk: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    salidaOkTxt: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: C.success },
  });
