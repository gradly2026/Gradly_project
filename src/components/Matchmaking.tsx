/**
 * Matchmaking.tsx — UI del motor relacional de pasantías (Universidad ↔ Empresa).
 *
 * Exporta dos vistas autocontenidas, ambas estilo Liquid Glass y theme-aware:
 *  - <VacantesDisponibles universidadId /> → para el dashboard de Universidad.
 *  - <SolicitudesEmpresa empresaId />       → para el dashboard de Empresa.
 *
 * Ambas se suscriben en tiempo real a Firestore y usan las funciones robustas
 * de src/services/pasantiaService.ts.
 */
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { db } from '../config/firebaseConfig';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import VacanteDetailModal, { type VacanteDetalle } from './VacanteDetailModal';
import {
  DIAS_SEMANA,
  evaluarGrupoPorEmpresa,
  postularGrupoAVacante,
  respuestaFinalUniversidad,
  type AplicacionGrupo,
  type EstadoAplicacionGrupo,
} from '../services/pasantiaService';

// ─────────────────────────────────────────────
// TIPOS LOCALES
// ─────────────────────────────────────────────
interface Vacante {
  id: string;
  titulo?: string;
  nombre_empresa?: string;
  area?: string;
  modalidad?: string;
  horas_requeridas?: number;
  fecha_publicacion?: any;
}

interface Grupo {
  id: string;
  nombre?: string;
  carrera?: string;
  total_horas?: number;
  estudiantes_count?: number;
}

// ─────────────────────────────────────────────
// HELPERS DE ESTADO
// ─────────────────────────────────────────────
const ESTADO_META: Record<EstadoAplicacionGrupo, { label: string; icon: keyof typeof Ionicons.glyphMap; tone: 'muted' | 'warning' | 'success' | 'error' }> = {
  pendiente: { label: 'Pendiente',  icon: 'time-outline',           tone: 'warning' },
  revisando: { label: 'Revisando',  icon: 'sync-outline',           tone: 'muted' },
  aprobada:  { label: 'Aprobada',   icon: 'checkmark-circle',       tone: 'success' },
  rechazada: { label: 'Rechazada',  icon: 'close-circle',           tone: 'error' },
};

function toneColor(c: GradlyColors, tone: 'muted' | 'warning' | 'success' | 'error') {
  switch (tone) {
    case 'warning': return c.warning;
    case 'success': return c.success;
    case 'error':   return c.error;
    default:        return c.primaryLight;
  }
}

function fechaMs(ts: any): number {
  return ts?.toDate?.()?.getTime?.() ?? 0;
}

// ═════════════════════════════════════════════
// VISTA UNIVERSIDAD
// ═════════════════════════════════════════════
export function VacantesDisponibles({ universidadId }: { universidadId: string }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [vacantes, setVacantes] = useState<Vacante[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [postulaciones, setPostulaciones] = useState<AplicacionGrupo[]>([]);

  // Modal de postulación
  const [vacanteSel, setVacanteSel] = useState<Vacante | null>(null);
  const [grupoSel, setGrupoSel] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Modal de detalle de vacante
  const [detalleVac, setDetalleVac] = useState<VacanteDetalle | null>(null);

  // Respuesta final
  const [rechazoApp, setRechazoApp] = useState<AplicacionGrupo | null>(null);
  const [justif, setJustif] = useState('');

  useEffect(() => {
    if (!universidadId) return;
    const unsub = onSnapshot(
      query(collection(db, 'vacantes'), where('activa', '==', true)),
      snap => setVacantes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Vacante))),
      error => console.warn('Error en listener (vacantes):', error),
    );
    return unsub;
  }, [universidadId]);

  useEffect(() => {
    if (!universidadId) return;
    const unsub = onSnapshot(
      query(collection(db, 'grupos'), where('universidad_id', '==', universidadId)),
      snap => setGrupos(snap.docs.map(d => ({ id: d.id, ...d.data() } as Grupo))),
      error => console.warn('Error en listener (grupos matchmaking):', error),
    );
    return unsub;
  }, [universidadId]);

  useEffect(() => {
    if (!universidadId) return;
    const unsub = onSnapshot(
      query(collection(db, 'aplicaciones_grupos'), where('universidadId', '==', universidadId)),
      snap => setPostulaciones(snap.docs.map(d => ({ id: d.id, ...d.data() } as AplicacionGrupo))),
      error => console.warn('Error en listener (postulaciones grupos):', error),
    );
    return unsub;
  }, [universidadId]);

  const vacantesOrdenadas = useMemo(
    () => [...vacantes].sort((a, b) => fechaMs(b.fecha_publicacion) - fechaMs(a.fecha_publicacion)),
    [vacantes],
  );

  // Postulaciones activas (no rechazadas) por vacante, para el límite de 2
  const postulacionesActivasPorVacante = (vacanteId: string) =>
    postulaciones.filter(p => p.vacanteId === vacanteId && p.estado !== 'rechazada');

  const abrirPostular = (v: Vacante) => {
    setVacanteSel(v);
    setGrupoSel(null);
  };

  const confirmarPostular = async () => {
    if (!vacanteSel || !grupoSel) { Alert.alert('Selecciona un grupo'); return; }
    setEnviando(true);
    try {
      await postularGrupoAVacante(universidadId, vacanteSel.id, grupoSel);
      Alert.alert('¡Postulación enviada!', 'La empresa revisará a tu grupo.');
      setVacanteSel(null);
      setGrupoSel(null);
    } catch (e: any) {
      Alert.alert('No se pudo postular', e?.message ?? 'Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  const responderFinal = async (app: AplicacionGrupo, decision: 'aceptar' | 'rechazar', motivo?: string) => {
    try {
      await respuestaFinalUniversidad(app.id, decision, motivo);
      setRechazoApp(null);
      setJustif('');
      Alert.alert(decision === 'aceptar' ? '¡Pasantía confirmada!' : 'Oferta rechazada');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo procesar.');
    }
  };

  const gruposDisponibles = vacanteSel ? grupos : [];
  const yaPostulados = vacanteSel
    ? postulacionesActivasPorVacante(vacanteSel.id).map(p => p.grupoId)
    : [];
  const limiteAlcanzado = vacanteSel
    ? postulacionesActivasPorVacante(vacanteSel.id).length >= 2
    : false;

  return (
    <View style={{ gap: 12 }}>
      {/* ── Vacantes disponibles ── */}
      <Text style={styles.heading}>Vacantes disponibles</Text>
      {vacantesOrdenadas.length === 0 ? (
        <Text style={styles.empty}>No hay vacantes disponibles por ahora.</Text>
      ) : (
        vacantesOrdenadas.map(v => (
          <GlassCard key={v.id} colors={colors} isDark={isDark}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.7} onPress={() => setDetalleVac(v as VacanteDetalle)}>
              <Text style={styles.cardTitle} numberOfLines={1}>{v.titulo ?? 'Vacante'}</Text>
              <Text style={styles.cardMeta} numberOfLines={1}>
                {v.nombre_empresa ?? 'Empresa'}{v.area ? ` · ${v.area}` : ''}{v.modalidad ? ` · ${v.modalidad}` : ''}
              </Text>
              <Text style={styles.cardMeta}>{v.horas_requeridas ?? 0} horas requeridas</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cta} onPress={() => abrirPostular(v)}>
              <Ionicons name="people-outline" size={15} color="#fff" />
              <Text style={styles.ctaText}>Postular grupo</Text>
            </TouchableOpacity>
          </GlassCard>
        ))
      )}

      {/* ── Mis postulaciones ── */}
      {postulaciones.length > 0 && (
        <>
          <Text style={[styles.heading, { marginTop: 8 }]}>Mis postulaciones</Text>
          {[...postulaciones]
            .sort((a, b) => fechaMs(b.fechaPostulacion) - fechaMs(a.fechaPostulacion))
            .map(p => {
              const meta = ESTADO_META[p.estado];
              return (
                <GlassCard key={p.id} colors={colors} isDark={isDark} column>
                  <View style={styles.rowBetween}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{p.grupoNombre || 'Grupo'}</Text>
                      <Text style={styles.cardMeta} numberOfLines={1}>{p.vacanteTitulo} · {p.empresaNombre}</Text>
                    </View>
                    <EstadoBadge estado={p.estado} colors={colors} />
                  </View>

                  {p.estado === 'pendiente' && (
                    <Text style={styles.note}>Esperando respuesta de la empresa…</Text>
                  )}

                  {p.estado === 'revisando' && (
                    <View style={styles.ofertaBox}>
                      <Text style={styles.ofertaTitle}>Oferta de la empresa</Text>
                      <OfertaDetalle icon="time-outline" label="Horario" value={p.horarioPropuesto || '—'} colors={colors} styles={styles} />
                      <OfertaDetalle icon="calendar-outline" label="Días" value={(p.diasTrabajo ?? []).join(', ') || '—'} colors={colors} styles={styles} />
                      <OfertaDetalle icon="cash-outline" label="Pago" value={typeof p.pagoTotal === 'number' ? `$${p.pagoTotal}` : 'No especificado'} colors={colors} styles={styles} />
                      <View style={styles.actionsRow}>
                        <TouchableOpacity style={styles.rejectBtn} onPress={() => { setJustif(''); setRechazoApp(p); }}>
                          <Text style={styles.rejectText}>Rechazar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.acceptBtn} onPress={() => responderFinal(p, 'aceptar')}>
                          <Text style={styles.acceptText}>Aceptar oferta</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {p.estado === 'rechazada' && !!p.justificacionRechazo && (
                    <Text style={styles.note}>Motivo: {p.justificacionRechazo}</Text>
                  )}
                  {p.estado === 'aprobada' && (
                    <Text style={[styles.note, { color: colors.success }]}>
                      {meta.label}: pasantía confirmada con {p.horarioPropuesto || 'horario acordado'}.
                    </Text>
                  )}
                </GlassCard>
              );
            })}
        </>
      )}

      {/* ── Modal: seleccionar grupo y postular ── */}
      <Modal visible={!!vacanteSel} transparent animationType="slide" onRequestClose={() => setVacanteSel(null)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.rowBetween}>
              <Text style={styles.sheetTitle}>Postular un grupo</Text>
              <TouchableOpacity onPress={() => setVacanteSel(null)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.cardMeta}>{vacanteSel?.titulo} · {vacanteSel?.nombre_empresa}</Text>
            <Text style={styles.sheetHint}>
              Máximo 2 grupos por vacante. Postulados: {vacanteSel ? postulacionesActivasPorVacante(vacanteSel.id).length : 0}/2
            </Text>

            <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
              {gruposDisponibles.length === 0 ? (
                <Text style={styles.empty}>No tienes grupos creados todavía.</Text>
              ) : (
                gruposDisponibles.map(g => {
                  const yaPost = yaPostulados.includes(g.id);
                  const selected = grupoSel === g.id;
                  return (
                    <TouchableOpacity
                      key={g.id}
                      disabled={yaPost}
                      style={[styles.grupoRow, selected && styles.grupoRowSel, yaPost && { opacity: 0.5 }]}
                      onPress={() => setGrupoSel(g.id)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle} numberOfLines={1}>{g.nombre ?? 'Grupo'}</Text>
                        <Text style={styles.cardMeta} numberOfLines={1}>
                          {g.carrera ?? '—'} · {g.estudiantes_count ?? 0} estudiantes · {g.total_horas ?? 0}h
                        </Text>
                      </View>
                      <Ionicons
                        name={yaPost ? 'checkmark-done' : selected ? 'radio-button-on' : 'radio-button-off'}
                        size={20}
                        color={selected ? colors.primaryLight : colors.textMuted}
                      />
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.acceptBtn, (!grupoSel || limiteAlcanzado || enviando) && { opacity: 0.5 }]}
              onPress={confirmarPostular}
              disabled={!grupoSel || limiteAlcanzado || enviando}
            >
              {enviando
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.acceptText}>{limiteAlcanzado ? 'Límite de 2 grupos alcanzado' : 'Enviar postulación'}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Modal: rechazar oferta (justificación) ── */}
      <Modal visible={!!rechazoApp} transparent animationType="fade" onRequestClose={() => setRechazoApp(null)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Rechazar oferta</Text>
            <Text style={styles.cardMeta}>Justifica por qué rechazas la oferta de la empresa.</Text>
            <TextInput
              style={styles.textArea}
              value={justif}
              onChangeText={setJustif}
              placeholder="Escribe el motivo…"
              placeholderTextColor={colors.textMuted}
              multiline
              selectionColor={colors.primary}
            />
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setRechazoApp(null)}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.rejectBtnSolid}
                onPress={() => {
                  if (!justif.trim()) { Alert.alert('Motivo requerido'); return; }
                  if (rechazoApp) responderFinal(rechazoApp, 'rechazar', justif);
                }}
              >
                <Text style={styles.rejectSolidText}>Rechazar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal: detalle de vacante ── */}
      <VacanteDetailModal
        visible={!!detalleVac}
        vacante={detalleVac}
        onClose={() => setDetalleVac(null)}
      />
    </View>
  );
}

// ═════════════════════════════════════════════
// VISTA EMPRESA
// ═════════════════════════════════════════════
export function SolicitudesEmpresa({ empresaId, limiteAlianzas = 9999 }: { empresaId: string; limiteAlianzas?: number }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [solicitudes, setSolicitudes] = useState<AplicacionGrupo[]>([]);

  // Modal de evaluación
  const [sel, setSel] = useState<AplicacionGrupo | null>(null);
  const [modo, setModo] = useState<'aceptar' | 'rechazar'>('aceptar');
  const [dias, setDias] = useState<string[]>([]);
  const [horario, setHorario] = useState('');
  const [pago, setPago] = useState('');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!empresaId) return;
    const unsub = onSnapshot(
      query(collection(db, 'aplicaciones_grupos'), where('empresaId', '==', empresaId)),
      snap => setSolicitudes(snap.docs.map(d => ({ id: d.id, ...d.data() } as AplicacionGrupo))),
      error => console.warn('Error en listener (solicitudes grupos empresa):', error),
    );
    return unsub;
  }, [empresaId]);

  const pendientes = solicitudes.filter(s => s.estado === 'pendiente');
  const enProceso  = solicitudes.filter(s => s.estado !== 'pendiente');

  // Alianzas = universidades distintas con las que ya hay una oferta en curso
  // o confirmada (revisando/aprobada). Sirve para aplicar el límite del plan.
  const universidadesAliadas = useMemo(
    () => new Set(
      solicitudes
        .filter(s => s.estado === 'revisando' || s.estado === 'aprobada')
        .map(s => s.universidadId),
    ),
    [solicitudes],
  );
  const ilimitadas = limiteAlianzas >= 9999;

  const abrir = (s: AplicacionGrupo) => {
    setSel(s);
    setModo('aceptar');
    setDias([]);
    setHorario('');
    setPago('');
    setMotivo('');
  };

  const toggleDia = (d: string) =>
    setDias(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]));

  const confirmar = async () => {
    if (!sel) return;
    // Límite de alianzas del plan: bloquea aceptar una universidad NUEVA si ya
    // se alcanzó el cupo (las universidades ya aliadas no cuentan de nuevo).
    if (
      modo === 'aceptar' &&
      !ilimitadas &&
      !universidadesAliadas.has(sel.universidadId) &&
      universidadesAliadas.size >= limiteAlianzas
    ) {
      Alert.alert(
        'Límite de alianzas alcanzado',
        `Tu plan permite ${limiteAlianzas} alianza${limiteAlianzas === 1 ? '' : 's'} con universidades. Mejora tu plan para aliarte con más instituciones.`,
      );
      return;
    }
    setEnviando(true);
    try {
      if (modo === 'aceptar') {
        await evaluarGrupoPorEmpresa(sel.id, 'aceptar', {
          horarioPropuesto: horario,
          diasTrabajo: dias,
          pagoTotal: pago.trim() ? Number(pago) : undefined,
        });
      } else {
        await evaluarGrupoPorEmpresa(sel.id, 'rechazar', {
          horarioPropuesto: '',
          diasTrabajo: [],
          justificacionRechazo: motivo,
        });
      }
      Alert.alert('Listo', modo === 'aceptar' ? 'Oferta enviada a la universidad.' : 'Grupo rechazado.');
      setSel(null);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo procesar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.rowBetween}>
        <Text style={styles.heading}>Solicitudes de universidades</Text>
        <Text style={styles.note}>
          {ilimitadas
            ? 'Alianzas ∞'
            : `Alianzas ${universidadesAliadas.size}/${limiteAlianzas}`}
        </Text>
      </View>
      {pendientes.length === 0 ? (
        <Text style={styles.empty}>No tienes solicitudes pendientes.</Text>
      ) : (
        pendientes.map(s => (
          <GlassCard key={s.id} colors={colors} isDark={isDark} column>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>{s.grupoNombre || 'Grupo'}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>{s.vacanteTitulo}</Text>
              </View>
              <EstadoBadge estado={s.estado} colors={colors} />
            </View>
            <View style={styles.tagsRow}>
              <InfoTag icon="school-outline" text={s.carrera || '—'} color={colors.primaryLight} styles={styles} />
              <InfoTag icon="time-outline" text={`${s.horasRequeridas ?? 0}h`} color={colors.primaryLight} styles={styles} />
              <InfoTag icon="people-outline" text={`${s.estudiantesCount ?? 0} est.`} color={colors.primaryLight} styles={styles} />
            </View>
            <TouchableOpacity style={styles.cta} onPress={() => abrir(s)}>
              <Ionicons name="create-outline" size={15} color="#fff" />
              <Text style={styles.ctaText}>Evaluar grupo</Text>
            </TouchableOpacity>
          </GlassCard>
        ))
      )}

      {enProceso.length > 0 && (
        <>
          <Text style={[styles.heading, { marginTop: 8 }]}>En proceso</Text>
          {enProceso.map(s => (
            <GlassCard key={s.id} colors={colors} isDark={isDark} column>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{s.grupoNombre || 'Grupo'}</Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>{s.vacanteTitulo}</Text>
                </View>
                <EstadoBadge estado={s.estado} colors={colors} />
              </View>
              {s.estado === 'revisando' && (
                <Text style={styles.note}>Oferta enviada · esperando respuesta de la universidad.</Text>
              )}
              {s.estado === 'rechazada' && !!s.justificacionRechazo && (
                <Text style={styles.note}>Motivo: {s.justificacionRechazo}</Text>
              )}
              {s.estado === 'aprobada' && (
                <Text style={[styles.note, { color: colors.success }]}>Pasantía confirmada con la universidad.</Text>
              )}
            </GlassCard>
          ))}
        </>
      )}

      {/* ── Modal de evaluación ── */}
      <Modal visible={!!sel} transparent animationType="slide" onRequestClose={() => setSel(null)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.rowBetween}>
              <Text style={styles.sheetTitle}>Evaluar grupo</Text>
              <TouchableOpacity onPress={() => setSel(null)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Datos del grupo */}
            <View style={styles.ofertaBox}>
              <Text style={styles.ofertaTitle}>{sel?.grupoNombre || 'Grupo'}</Text>
              <OfertaDetalle icon="school-outline" label="Carrera" value={sel?.carrera || '—'} colors={colors} styles={styles} />
              <OfertaDetalle icon="time-outline" label="Horas requeridas" value={`${sel?.horasRequeridas ?? 0} h`} colors={colors} styles={styles} />
              <OfertaDetalle icon="people-outline" label="Estudiantes" value={`${sel?.estudiantesCount ?? 0}`} colors={colors} styles={styles} />
            </View>

            {/* Tabs aceptar / rechazar */}
            <View style={styles.segment}>
              <TouchableOpacity
                style={[styles.segmentBtn, modo === 'aceptar' && styles.segmentBtnActive]}
                onPress={() => setModo('aceptar')}
              >
                <Text style={[styles.segmentText, modo === 'aceptar' && styles.segmentTextActive]}>Aceptar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentBtn, modo === 'rechazar' && styles.segmentBtnActive]}
                onPress={() => setModo('rechazar')}
              >
                <Text style={[styles.segmentText, modo === 'rechazar' && styles.segmentTextActive]}>Rechazar</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {modo === 'aceptar' ? (
                <>
                  <Text style={styles.label}>Días de trabajo</Text>
                  <View style={styles.diasWrap}>
                    {DIAS_SEMANA.map(d => {
                      const on = dias.includes(d);
                      return (
                        <TouchableOpacity
                          key={d}
                          style={[styles.diaChip, on && styles.diaChipOn]}
                          onPress={() => toggleDia(d)}
                        >
                          <Text style={[styles.diaText, on && styles.diaTextOn]}>{d.slice(0, 3)}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={styles.label}>Horario propuesto</Text>
                  <TextInput
                    style={styles.input}
                    value={horario}
                    onChangeText={setHorario}
                    placeholder="Ej. 7:00 a 17:00"
                    placeholderTextColor={colors.textMuted}
                    selectionColor={colors.primary}
                  />

                  <Text style={styles.label}>Pago total (opcional)</Text>
                  <TextInput
                    style={styles.input}
                    value={pago}
                    onChangeText={t => setPago(t.replace(/[^0-9.]/g, ''))}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    placeholderTextColor={colors.textMuted}
                    selectionColor={colors.primary}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.label}>Justificación del rechazo *</Text>
                  <TextInput
                    style={styles.textArea}
                    value={motivo}
                    onChangeText={setMotivo}
                    placeholder="Explica por qué rechazas a este grupo…"
                    placeholderTextColor={colors.textMuted}
                    multiline
                    selectionColor={colors.primary}
                  />
                </>
              )}
            </ScrollView>

            <TouchableOpacity
              style={[modo === 'aceptar' ? styles.acceptBtn : styles.rejectBtnSolid, enviando && { opacity: 0.6 }]}
              onPress={confirmar}
              disabled={enviando}
            >
              {enviando
                ? <ActivityIndicator color="#fff" />
                : <Text style={modo === 'aceptar' ? styles.acceptText : styles.rejectSolidText}>
                    {modo === 'aceptar' ? 'Enviar oferta' : 'Rechazar grupo'}
                  </Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────
// SUBCOMPONENTES VISUALES
// ─────────────────────────────────────────────
function GlassCard({ children, colors, isDark, column }: {
  children: React.ReactNode; colors: GradlyColors; isDark: boolean; column?: boolean;
}) {
  return (
    <BlurView
      intensity={isDark ? 30 : 50}
      tint={isDark ? 'dark' : 'light'}
      style={{
        flexDirection: column ? 'column' : 'row',
        alignItems: column ? 'stretch' : 'center',
        gap: 12,
        borderRadius: 20,
        padding: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(124,58,237,0.16)',
        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.6)',
      }}
    >
      {children}
    </BlurView>
  );
}

function EstadoBadge({ estado, colors }: { estado: EstadoAplicacionGrupo; colors: GradlyColors }) {
  const meta = ESTADO_META[estado];
  const color = toneColor(colors, meta.tone);
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
      backgroundColor: color + '22', borderWidth: 1, borderColor: color + '55',
    }}>
      <Ionicons name={meta.icon} size={12} color={color} />
      <Text style={{ fontSize: 11, fontFamily: FONTS.interSemiBold, color }}>{meta.label}</Text>
    </View>
  );
}

function OfertaDetalle({ icon, label, value, colors, styles }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; value: string; colors: GradlyColors; styles: any;
}) {
  return (
    <View style={styles.detalleRow}>
      <Ionicons name={icon} size={15} color={colors.primaryLight} />
      <Text style={styles.detalleLabel}>{label}:</Text>
      <Text style={styles.detalleValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function InfoTag({ icon, text, color, styles }: { icon: keyof typeof Ionicons.glyphMap; text: string; color: string; styles: any }) {
  return (
    <View style={styles.infoTag}>
      <Ionicons name={icon} size={12} color={color} />
      <Text style={styles.infoTagText}>{text}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────
// ESTILOS (theme-aware)
// ─────────────────────────────────────────────
const makeStyles = (C: GradlyColors, _isDark: boolean) => {
  const sheet = StyleSheet.create({
    heading: { fontSize: 15, fontFamily: FONTS.soraSemiBold, color: C.textPrimary, marginBottom: 2 },
    empty: { fontSize: 13, fontFamily: FONTS.interRegular, color: C.textMuted, paddingVertical: 12 },

    cardTitle: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: C.textPrimary },
    cardMeta: { fontSize: 12, fontFamily: FONTS.interRegular, color: C.textMuted, marginTop: 2 },
    note: { fontSize: 12, fontFamily: FONTS.interRegular, color: C.textMuted, marginTop: 4 },

    rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 10 },

    cta: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: C.primary, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 9, alignSelf: 'flex-start',
    },
    ctaText: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: '#fff' },

    tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    infoTag: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: C.primary12, borderRadius: 8,
      paddingHorizontal: 8, paddingVertical: 4,
      borderWidth: 1, borderColor: C.primary35,
    },
    infoTagText: { fontSize: 11, fontFamily: FONTS.interMedium, color: C.primaryLight },

    // Oferta / detalle
    ofertaBox: {
      backgroundColor: C.backgroundSurface, borderRadius: 14, padding: 12, gap: 6,
      borderWidth: 1, borderColor: C.border, marginTop: 4,
    },
    ofertaTitle: { fontSize: 13, fontFamily: FONTS.soraSemiBold, color: C.textPrimary, marginBottom: 2 },
    detalleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    detalleLabel: { fontSize: 12, fontFamily: FONTS.interMedium, color: C.textMuted },
    detalleValue: { flex: 1, fontSize: 12, fontFamily: FONTS.interSemiBold, color: C.textPrimary },

    // Acciones
    actionsRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
    acceptBtn: {
      flex: 1, height: 44, borderRadius: 12, marginTop: 12,
      backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center',
    },
    acceptText: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: '#fff' },
    rejectBtn: {
      flex: 1, height: 44, borderRadius: 12,
      backgroundColor: 'rgba(239,68,68,0.10)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.30)',
      alignItems: 'center', justifyContent: 'center',
    },
    rejectText: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: C.error },
    rejectBtnSolid: {
      flex: 1, height: 44, borderRadius: 12, marginTop: 12,
      backgroundColor: C.error, alignItems: 'center', justifyContent: 'center',
    },
    rejectSolidText: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: '#fff' },
    cancelBtn: {
      flex: 1, height: 44, borderRadius: 12,
      backgroundColor: C.white4, borderWidth: 1, borderColor: C.border,
      alignItems: 'center', justifyContent: 'center',
    },
    cancelText: { fontSize: 14, fontFamily: FONTS.interMedium, color: C.textMuted },

    // Modal
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: C.backgroundCard,
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      padding: 20, paddingBottom: 32, gap: 8,
      borderTopWidth: 1, borderColor: C.border,
    },
    sheetTitle: { fontSize: 18, fontFamily: FONTS.soraBold, color: C.textPrimary, flex: 1 },
    sheetHint: { fontSize: 12, fontFamily: FONTS.interMedium, color: C.primaryLight, marginTop: 2 },

    grupoRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: C.backgroundSurface, borderRadius: 12, padding: 12, marginTop: 8,
      borderWidth: 1, borderColor: C.border,
    },
    grupoRowSel: { borderColor: C.primary },

    // Segment
    segment: {
      flexDirection: 'row', backgroundColor: C.backgroundSurface,
      borderRadius: 12, padding: 4, marginTop: 6, borderWidth: 1, borderColor: C.border,
    },
    segmentBtn: { flex: 1, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    segmentBtnActive: { backgroundColor: C.primary },
    segmentText: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: C.textMuted },
    segmentTextActive: { color: '#fff' },

    label: {
      fontSize: 11, fontFamily: FONTS.interMedium, color: C.primaryLight,
      marginTop: 12, marginBottom: 6, letterSpacing: 0.3,
    },
    input: {
      backgroundColor: C.backgroundSurface, borderRadius: 10, borderWidth: 1, borderColor: C.border,
      height: 46, paddingHorizontal: 14, fontSize: 14, fontFamily: FONTS.interRegular, color: C.textPrimary,
    },
    textArea: {
      backgroundColor: C.backgroundSurface, borderRadius: 10, borderWidth: 1, borderColor: C.border,
      minHeight: 90, padding: 14, fontSize: 14, fontFamily: FONTS.interRegular, color: C.textPrimary,
      textAlignVertical: 'top', marginTop: 6,
    },

    diasWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    diaChip: {
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
      backgroundColor: C.backgroundSurface, borderWidth: 1, borderColor: C.border,
    },
    diaChipOn: { backgroundColor: C.primary, borderColor: C.primary },
    diaText: { fontSize: 12, fontFamily: FONTS.interMedium, color: C.textMuted },
    diaTextOn: { color: '#fff' },
  });
  return sheet;
};
