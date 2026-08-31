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
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,


  TouchableOpacity,
  View,
} from 'react-native';
import { AutoText as Text, AutoTextInput as TextInput } from "./AutoText";
import { showAlert } from "./AppAlert";
import { db } from '../config/firebaseConfig';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import type { AcuerdoData } from '../types/chat';
import ProponerHorarioModal from './ProponerHorarioModal';
import VacanteDetailModal, { type VacanteDetalle } from './VacanteDetailModal';
import { cuposAsegurados, cuposDisponibles, hayCupos, textoCupos } from '../utils/cupos';
import { afinidadCarreraVacante } from '../data/areas';
import {
  COLECCION_RECLAMOS,
  liberarCupos,
  reclamarCupos,
  responderReclamo,
  type ReclamoCupos,
} from '../services/reclamoCuposService';
import {
  contarCompatibilidad,
  normalizarHorario,
  textoHorario,
  type DisponibilidadHoraria,
  type HorarioPasantia,
  type ResumenCompatibilidad,
} from '../data/disponibilidad';
import {
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
  /** Roles concretos dentro del área (afinan el match). */
  tags?: string[] | null;
  /** Ausente = vacante legada, sin límite de cupos declarado. */
  cupos?: number | null;
  cupos_reclamados?: number | null;
  contratados_count?: number | null;
  /** Horario declarado al publicar. Ausente = vacante legada. */
  horario?: HorarioPasantia | null;
  fecha_publicacion?: any;
  /** 'vacante' (aplicación individual, graduados) se excluye de esta vista de matchmaking por grupo. */
  categoria?: 'pasantia' | 'vacante';
}

/** Alumno con su disponibilidad horaria, para cruzarla con el horario de la vacante. */
interface EstudianteDisp {
  id: string;
  grupo_id?: string;
  disponibilidad_horaria?: DisponibilidadHoraria | null;
}

interface Grupo {
  id: string;
  nombre?: string;
  carrera?: string;
  total_horas?: number;
  estudiantes_count?: number;
}

/** Pasantía de grupo ya aprobada (colección `solicitudes_practicas`). Solo
 * se usa aquí para saber qué grupos ya están en pasantía activa y no deben
 * postularse a otra vacante en paralelo. */
interface SolicitudPractica {
  id: string;
  grupoId?: string;
  estado?: string;
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
  const [solicitudesPracticas, setSolicitudesPracticas] = useState<SolicitudPractica[]>([]);
  const [estudiantes, setEstudiantes] = useState<EstudianteDisp[]>([]);

  // Reclamo de cupos por lote
  const [reclamos, setReclamos] = useState<ReclamoCupos[]>([]);
  const [reclamoVac, setReclamoVac] = useState<Vacante | null>(null);
  const [reclamoCant, setReclamoCant] = useState('1');
  const [reclamoGrupo, setReclamoGrupo] = useState<string | null>(null);
  const [reclamando, setReclamando] = useState(false);
  const [nombreUniversidad, setNombreUniversidad] = useState('');

  // Modal de postulación
  const [vacanteSel, setVacanteSel] = useState<Vacante | null>(null);
  const [grupoSel, setGrupoSel] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Modal de confirmación: se abre al tocar un grupo elegible (evita depender
  // del botón "Enviar postulación", que en iOS quedaba fuera de la vista).
  const [grupoConfirmar, setGrupoConfirmar] = useState<Grupo | null>(null);

  // Modal de detalle de vacante
  const [detalleVac, setDetalleVac] = useState<VacanteDetalle | null>(null);

  // Respuesta final
  const [rechazoApp, setRechazoApp] = useState<AplicacionGrupo | null>(null);
  const [justif, setJustif] = useState('');
  // Error de la última acción (Aceptar/Rechazar oferta), mostrado en línea
  // porque Alert.alert no muestra nada en web.
  const [errorAccion, setErrorAccion] = useState<{ id: string; mensaje: string } | null>(null);
  const [motivoVacioErr, setMotivoVacioErr] = useState(false);

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

  // Pasantías de grupo ya aprobadas: mientras estén 'aprobado' (activas, sin
  // finalizar aún) el grupo no debe postularse a otra vacante en paralelo.
  useEffect(() => {
    if (!universidadId) return;
    const unsub = onSnapshot(
      query(collection(db, 'solicitudes_practicas'), where('universidadId', '==', universidadId)),
      snap => setSolicitudesPracticas(snap.docs.map(d => ({ id: d.id, ...d.data() } as SolicitudPractica))),
      error => console.warn('Error en listener (solicitudes_practicas matchmaking):', error),
    );
    return unsub;
  }, [universidadId]);

  // Alumnos de la universidad con su disponibilidad horaria: permite avisar,
  // ANTES de postular, cuántos del grupo pueden cumplir el horario declarado
  // en la vacante (evita comprometer un grupo que en la práctica no puede ir).
  useEffect(() => {
    if (!universidadId) return;
    const unsub = onSnapshot(
      query(collection(db, 'perfiles_estudiantes'), where('universidad_id', '==', universidadId)),
      snap => setEstudiantes(snap.docs.map(d => ({ id: d.id, ...d.data() } as EstudianteDisp))),
      error => console.warn('Error en listener (estudiantes matchmaking):', error),
    );
    return unsub;
  }, [universidadId]);

  // Reclamos de cupos de esta universidad (para la bandeja y el conteo).
  useEffect(() => {
    if (!universidadId) return;
    const unsub = onSnapshot(
      query(collection(db, COLECCION_RECLAMOS), where('universidadId', '==', universidadId)),
      snap => setReclamos(snap.docs.map(d => ({ id: d.id, ...d.data() } as ReclamoCupos))),
      error => console.warn('Error en listener (reclamos cupos):', error),
    );
    return unsub;
  }, [universidadId]);

  // Nombre de la universidad, para desnormalizarlo en el reclamo.
  useEffect(() => {
    if (!universidadId) return;
    let vivo = true;
    getDoc(doc(db, 'perfiles_universidades', universidadId))
      .then(s => { if (vivo && s.exists()) setNombreUniversidad((s.data() as any).nombre ?? ''); })
      .catch(e => console.warn('Error leyendo perfil universidad:', e));
    return () => { vivo = false; };
  }, [universidadId]);

  const asegurados = useMemo(() => cuposAsegurados(reclamos), [reclamos]);
  /** Alumnos aún sin cupo asegurado — guía cuántos reclamar. */
  const faltantesPorCubrir = Math.max(0, estudiantes.length - asegurados);

  /** Cupos ya asegurados SOLO para un grupo (reclamos con ese grupoId). */
  const cuposAseguradosDeGrupo = (grupoId: string): number =>
    cuposAsegurados(reclamos.filter(r => r.grupoId === grupoId));

  /** Grupo que ya tiene cupo para todos sus estudiantes — no necesita más. */
  const [grupoCubierto, setGrupoCubierto] = useState<Grupo | null>(null);

  /** Compatibilidad de un grupo con el horario de la vacante seleccionada. */
  const compatibilidadGrupo = (grupoId: string): ResumenCompatibilidad | null => {
    const horario = normalizarHorario(vacanteSel?.horario);
    if (!horario) return null; // vacante legada, sin horario declarado
    const delGrupo = estudiantes.filter(e => e.grupo_id === grupoId);
    if (delGrupo.length === 0) return null;
    return contarCompatibilidad(delGrupo, horario);
  };

  // Set de grupoId con una pasantía aprobada y aún no finalizada.
  const gruposEnPasantiaActiva = useMemo(
    () => new Set(
      solicitudesPracticas
        .filter(s => s.estado === 'aprobado' && s.grupoId)
        .map(s => s.grupoId as string),
    ),
    [solicitudesPracticas],
  );

  const vacantesOrdenadas = useMemo(
    () => vacantes
      // Las de categoría 'vacante' son aplicación individual (solo graduados,
      // vía el feed del estudiante); aquí solo interesan las de 'pasantia'
      // (o legado sin categoría, para no perder publicaciones antiguas).
      .filter(v => v.categoria !== 'vacante')
      .sort((a, b) => fechaMs(b.fecha_publicacion) - fechaMs(a.fecha_publicacion)),
    [vacantes],
  );

  // Postulaciones activas (no rechazadas) por vacante, para el límite de 2
  const postulacionesActivasPorVacante = (vacanteId: string) =>
    postulaciones.filter(p => p.vacanteId === vacanteId && p.estado !== 'rechazada');

  const abrirPostular = (v: Vacante) => {
    setVacanteSel(v);
    setGrupoSel(null);
    setGrupoConfirmar(null);
  };

  // ── Reclamo de cupos por lote ──────────────────────────────────────
  const abrirReclamo = (v: Vacante) => {
    const libres = cuposDisponibles(v) ?? 0;
    setReclamoVac(v);
    // Sugerencia: lo que falta por cubrir, acotado a lo que la vacante ofrece.
    setReclamoCant(String(Math.max(1, Math.min(libres, faltantesPorCubrir || libres))));
    setReclamoGrupo(null);
  };

  const confirmarReclamo = async () => {
    if (!reclamoVac) return;
    const n = Number(reclamoCant);
    const libres = cuposDisponibles(reclamoVac) ?? 0;
    if (!Number.isFinite(n) || n < 1) { void showAlert('Cantidad inválida', 'Indica cuántos cupos necesitas.'); return; }
    if (n > libres) { void showAlert('Sin suficientes cupos', `Solo quedan ${libres} disponible(s).`); return; }

    setReclamando(true);
    try {
      const grupo = grupos.find(g => g.id === reclamoGrupo);
      const { estado } = await reclamarCupos({
        universidadId,
        vacanteId: reclamoVac.id,
        cantidad: n,
        grupoId: reclamoGrupo,
        grupoNombre: grupo?.nombre,
        universidadNombre: nombreUniversidad,
      });
      void showAlert(
        estado === 'aceptado' ? '¡Cupos reservados!' : 'Solicitud enviada',
        estado === 'aceptado'
          ? `Reservaste ${n} cupo(s). Ya puedes asignarlos a tus estudiantes.`
          : `La empresa debe confirmar tus ${n} cupo(s). Te avisaremos.`,
      );
      setReclamoVac(null);
    } catch (e: any) {
      void showAlert('No se pudo reservar', e?.message ?? 'Intenta de nuevo.');
    } finally {
      setReclamando(false);
    }
  };

  const liberar = async (r: ReclamoCupos) => {
    try {
      await liberarCupos(r.id, r.cantidad);
      void showAlert('Cupos liberados', 'Vuelven a estar disponibles y se avisó a la empresa.');
    } catch (e: any) {
      void showAlert('Error', e?.message ?? 'No se pudo liberar.');
    }
  };

  const confirmarPostular = async () => {
    if (!vacanteSel || !grupoSel) { void showAlert('Selecciona un grupo'); return; }
    setEnviando(true);
    try {
      await postularGrupoAVacante(universidadId, vacanteSel.id, grupoSel);
      void showAlert('¡Postulación enviada!', 'La empresa revisará a tu grupo.');
      setGrupoConfirmar(null);
      setVacanteSel(null);
      setGrupoSel(null);
    } catch (e: any) {
      void showAlert('No se pudo postular', e?.message ?? 'Intenta de nuevo.');
      setGrupoConfirmar(null);
    } finally {
      setEnviando(false);
    }
  };

  const responderFinal = async (app: AplicacionGrupo, decision: 'aceptar' | 'rechazar', motivo?: string) => {
    setErrorAccion(null);
    try {
      await respuestaFinalUniversidad(app.id, decision, motivo);
      setRechazoApp(null);
      setJustif('');
      void showAlert(decision === 'aceptar' ? '¡Pasantía confirmada!' : 'Oferta rechazada');
    } catch (e: any) {
      // Alert.alert es un no-op en web (no muestra nada): sin este aviso en
      // línea, un rechazo por regla de negocio (p. ej. grupo ya comprometido
      // con otra pasantía) queda completamente silencioso — el botón
      // "Aceptar oferta" parece no hacer nada.
      const mensaje = e?.message ?? 'No se pudo procesar.';
      setErrorAccion({ id: app.id, mensaje });
      void showAlert('Error', mensaje);
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
      {/* ── Cuota de cupos de la universidad ── */}
      {estudiantes.length > 0 && (
        <GlassCard colors={colors} isDark={isDark} column>
          <Text style={styles.cardTitle}>Cupos asegurados</Text>
          <Text style={styles.cardMeta}>
            {asegurados} de {estudiantes.length} estudiantes tienen cupo reservado
            {faltantesPorCubrir > 0 ? ` · faltan ${faltantesPorCubrir}` : ' · cuota cubierta'}
          </Text>
          <View style={styles.barraFondo}>
            <View
              style={[
                styles.barraRelleno,
                {
                  width: `${Math.min(100, Math.round((asegurados / Math.max(1, estudiantes.length)) * 100))}%`,
                  backgroundColor: faltantesPorCubrir === 0 ? colors.success : colors.primary,
                },
              ]}
            />
          </View>
        </GlassCard>
      )}

      {/* ── Mis reservas de cupos ── */}
      {reclamos.filter(r => r.estado === 'pendiente' || r.estado === 'aceptado').length > 0 && (
        <>
          <Text style={styles.heading}>Mis reservas de cupos</Text>
          {reclamos
            .filter(r => r.estado === 'pendiente' || r.estado === 'aceptado')
            .map(r => {
              const tomados = r.tomados ?? 0;
              const pctTomados = Math.min(100, Math.round((tomados / Math.max(1, r.cantidad)) * 100));
              return (
              <GlassCard key={r.id} colors={colors} isDark={isDark} column>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {r.cantidad} cupo(s) · {r.vacanteTitulo || 'Vacante'}
                    </Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {r.empresaNombre || 'Empresa'}
                      {r.grupoNombre ? ` · ${r.grupoNombre}` : ''}
                    </Text>
                    {textoHorario(r.horario) && (
                      <Text style={styles.cardMeta}>{textoHorario(r.horario)}</Text>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.badgeReclamo,
                      { color: r.estado === 'aceptado' ? colors.success : colors.warning },
                    ]}
                  >
                    {r.estado === 'aceptado' ? 'Confirmado' : 'Esperando empresa'}
                  </Text>
                </View>
                {/* Cuántos de estos cupos ya fueron tomados por un estudiante real
                    (no solo reservados) — responde "¿mis estudiantes ya recibieron
                    el espacio?", no solo "¿ya reservé?". */}
                <Text style={styles.cardMeta}>
                  {tomados === 0
                    ? 'Aún ningún estudiante ha elegido este cupo'
                    : tomados === r.cantidad
                      ? `Los ${tomados} estudiante(s) ya eligieron su cupo`
                      : `${tomados}/${r.cantidad} estudiantes ya eligieron su cupo`}
                </Text>
                <View style={styles.barraFondo}>
                  <View
                    style={[
                      styles.barraRelleno,
                      { width: `${pctTomados}%`, backgroundColor: colors.success },
                    ]}
                  />
                </View>
                <TouchableOpacity style={styles.liberarBtn} onPress={() => liberar(r)}>
                  <Ionicons name="return-up-back-outline" size={14} color={colors.textMuted} />
                  <Text style={styles.liberarTxt}>Liberar cupos</Text>
                </TouchableOpacity>
              </GlassCard>
              );
            })}
        </>
      )}

      {/* ── Vacantes disponibles ── */}
      <Text style={styles.heading}>Vacantes disponibles</Text>
      {vacantesOrdenadas.length === 0 ? (
        <Text style={styles.empty}>No hay vacantes disponibles por ahora.</Text>
      ) : (
        <View style={styles.vacantesGrid}>
          {vacantesOrdenadas.map(v => (
            <View key={v.id} style={styles.vacanteCardWrap}>
              <GlassCard colors={colors} isDark={isDark} column>
                <TouchableOpacity activeOpacity={0.7} onPress={() => setDetalleVac(v as VacanteDetalle)}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{v.titulo ?? 'Vacante'}</Text>
                  <Text style={styles.cardMeta} numberOfLines={2}>
                    {v.nombre_empresa ?? 'Empresa'}{v.area ? ` · ${v.area}` : ''}{v.modalidad ? ` · ${v.modalidad}` : ''}
                  </Text>
                  {!!v.horas_requeridas && (
                    <Text style={styles.cardMeta}>{v.horas_requeridas} horas requeridas</Text>
                  )}
                  {/* Horario declarado por la empresa (ausente en vacantes legadas). */}
                  {textoHorario(v.horario) && (
                    <Text style={styles.cardMeta}>{textoHorario(v.horario)}</Text>
                  )}
                  {/* Cupos libres: ausente en vacantes legadas (sin el campo). */}
                  {textoCupos(v) && (
                    <Text style={[styles.cardCupos, !hayCupos(v) && styles.cardCuposAgotado]}>
                      {textoCupos(v)}
                    </Text>
                  )}
                </TouchableOpacity>
                {/* Botones siempre al pie de la tarjeta, repartidos en todo el ancho. */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <TouchableOpacity
                    style={[styles.cta, !hayCupos(v) && styles.ctaDisabled, styles.ctaFull]}
                    onPress={() => abrirPostular(v)}
                    disabled={!hayCupos(v)}
                  >
                    <Ionicons name="people-outline" size={15} color="#fff" />
                    <Text style={styles.ctaText}>{hayCupos(v) ? 'Postular grupo' : 'Sin cupos'}</Text>
                  </TouchableOpacity>
                  {/* Reclamar por lote: solo en vacantes que declaran cupos. */}
                  {cuposDisponibles(v) !== null && hayCupos(v) && (
                    <TouchableOpacity style={[styles.ctaAlt, styles.ctaFull]} onPress={() => abrirReclamo(v)}>
                      <Ionicons name="bookmark-outline" size={15} color={colors.primaryLight} />
                      <Text style={styles.ctaAltText}>Reservar cupos</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </GlassCard>
            </View>
          ))}
        </View>
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
                      <OfertaDetalle icon="hourglass-outline" label="Periodo" value={p.fechaInicio && p.fechaFin ? `${p.fechaInicio} → ${p.fechaFin}` : '—'} colors={colors} styles={styles} />
                      <OfertaDetalle icon="cash-outline" label="Pago" value={typeof p.pagoTotal === 'number' ? `$${p.pagoTotal} por estudiante` : 'Sin pago'} colors={colors} styles={styles} />
                      {errorAccion?.id === p.id && (
                        <Text style={[styles.note, { color: colors.error }]}>{errorAccion.mensaje}</Text>
                      )}
                      <View style={styles.actionsRow}>
                        <TouchableOpacity style={styles.rejectBtn} onPress={() => { setJustif(''); setErrorAccion(null); setMotivoVacioErr(false); setRechazoApp(p); }}>
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

      {/* ── Modal: postular un grupo (un solo <Modal> con dos pasos internos) ──
          IMPORTANTE: en nativo (iOS/Android) NO se pueden tener dos <Modal>
          visibles a la vez de forma confiable — cada uno monta una ventana/
          overlay nativa real, y apilar dos deja el segundo sin mostrarse (o el
          primero sin poder cerrarse bien) hasta recargar la app. En web, el
          <Modal> de react-native-web es solo una View posicionada, por eso ahí
          "funcionaba" apilando dos. La solución es UN solo <Modal> que cambia
          de contenido (lista → confirmación) según `grupoConfirmar`. */}
      <Modal
        visible={!!vacanteSel}
        transparent
        animationType="none"
        onRequestClose={() => {
          if (enviando) return;
          if (grupoConfirmar) { setGrupoConfirmar(null); setGrupoSel(null); return; }
          setVacanteSel(null);
        }}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            {grupoConfirmar ? (
              <>
                <View style={styles.rowBetween}>
                  <Text style={styles.sheetTitle}>Confirmar postulación</Text>
                  <TouchableOpacity
                    onPress={() => { setGrupoConfirmar(null); setGrupoSel(null); }}
                    disabled={enviando}
                    hitSlop={10}
                  >
                    <Ionicons name="close" size={22} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.cardMeta}>
                  Vas a postular al grupo “{grupoConfirmar.nombre ?? 'Grupo'}” para la vacante “{vacanteSel?.titulo ?? ''}”.
                </Text>
                <Text style={styles.note}>
                  La empresa revisará esta postulación y podrás seguir su estado en “Mis postulaciones”.
                </Text>
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => { setGrupoConfirmar(null); setGrupoSel(null); }}
                    disabled={enviando}
                  >
                    <Text style={styles.cancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.acceptBtn, { marginTop: 0 }, enviando && { opacity: 0.6 }]}
                    onPress={confirmarPostular}
                    disabled={enviando}
                  >
                    {enviando
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={styles.acceptText}>Confirmar</Text>}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
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

                {limiteAlcanzado ? (
                  <Text style={[styles.sheetHint, { color: colors.error }]}>Límite de 2 grupos alcanzado para esta vacante.</Text>
                ) : (
                  <Text style={styles.note}>Toca un grupo para postularlo (se pedirá confirmación).</Text>
                )}

                <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                  {gruposDisponibles.length === 0 ? (
                    <Text style={styles.empty}>No tienes grupos creados todavía.</Text>
                  ) : (
                    gruposDisponibles.map(g => {
                      const yaPost = yaPostulados.includes(g.id);
                      const enPasantia = gruposEnPasantiaActiva.has(g.id);
                      // 'ninguna' es la única de las 3 afinidades que bloquea — 'posible'
                      // (dato faltante: vacante legada, área "Otra" o carrera fuera del
                      // catálogo) NUNCA quita la oportunidad, mismo criterio que el resto
                      // de la app (ver areas.ts).
                      const noAfin = afinidadCarreraVacante(g.carrera, vacanteSel) === 'ninguna';
                      const bloqueado = yaPost || enPasantia || limiteAlcanzado || noAfin;
                      return (
                        <TouchableOpacity
                          key={g.id}
                          disabled={bloqueado}
                          style={[styles.grupoRow, bloqueado && { opacity: 0.5 }]}
                          onPress={() => {
                            setGrupoSel(g.id);
                            setGrupoConfirmar(g);
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.cardTitle} numberOfLines={1}>{g.nombre ?? 'Grupo'}</Text>
                            <Text style={styles.cardMeta} numberOfLines={1}>
                              {g.carrera ?? '—'} · {g.estudiantes_count ?? 0} estudiantes · {g.total_horas ?? 0}h
                            </Text>
                            {enPasantia && !yaPost && (
                              <Text style={[styles.cardMeta, { color: colors.warning, marginTop: 2 }]}>
                                Ya está en una pasantía activa
                              </Text>
                            )}
                            {/* Bloquea la selección: el área de la vacante no
                                corresponde a la carrera del grupo. */}
                            {noAfin && (
                              <Text style={[styles.cardMeta, { color: colors.error, marginTop: 2 }]}>
                                ⚠ Área no afín a {g.carrera} — no se puede postular
                              </Text>
                            )}
                            {/* Compatibilidad con el horario declarado en la vacante.
                                Los "desconocidos" (alumnos sin disponibilidad marcada)
                                se muestran aparte: NO se cuentan como que pueden. */}
                            {(() => {
                              const comp = compatibilidadGrupo(g.id);
                              if (!comp) return null;
                              const todos = comp.compatibles === comp.total;
                              return (
                                <Text
                                  style={[
                                    styles.cardMeta,
                                    { marginTop: 2, color: todos ? colors.success : colors.warning },
                                  ]}
                                >
                                  {comp.compatibles}/{comp.total} pueden con este horario
                                  {comp.desconocidos > 0 ? ` · ${comp.desconocidos} sin disponibilidad marcada` : ''}
                                </Text>
                              );
                            })()}
                          </View>
                          <Ionicons
                            name={yaPost ? 'checkmark-done' : enPasantia ? 'briefcase' : 'chevron-forward'}
                            size={20}
                            color={colors.textMuted}
                          />
                        </TouchableOpacity>
                      );
                    })
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Modal: reservar cupos por lote ── */}
      <Modal
        visible={!!reclamoVac}
        transparent
        animationType="none"
        onRequestClose={() => { if (!reclamando) setReclamoVac(null); }}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.rowBetween}>
              <Text style={styles.sheetTitle}>Reservar cupos</Text>
              <TouchableOpacity onPress={() => setReclamoVac(null)} disabled={reclamando} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.cardMeta}>
              {reclamoVac?.titulo} · {reclamoVac?.nombre_empresa}
            </Text>
            {textoHorario(reclamoVac?.horario) && (
              <Text style={styles.cardMeta}>{textoHorario(reclamoVac?.horario)}</Text>
            )}
            <Text style={styles.sheetHint}>
              Disponibles: {cuposDisponibles(reclamoVac) ?? 0} · Te faltan por cubrir: {faltantesPorCubrir}
            </Text>

            <Text style={styles.campoLabel}>¿Cuántos cupos necesitas?</Text>
            <TextInput
              style={styles.inputNum}
              value={reclamoCant}
              onChangeText={t => {
                const digits = t.replace(/\D/g, '').slice(0, 3);
                if (digits === '') { setReclamoCant(''); return; }
                // Tope duro: nunca se puede escribir más de lo que la vacante
                // tiene disponible — no basta con avisar al enviar.
                const libres = cuposDisponibles(reclamoVac) ?? 0;
                setReclamoCant(String(Math.min(Number(digits), libres)));
              }}
              keyboardType="number-pad"
              placeholder="Ej. 8"
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.primary}
            />

            <Text style={styles.campoLabel}>Grupo destino (opcional)</Text>
            <ScrollView style={{ maxHeight: 150 }} showsVerticalScrollIndicator={false}>
              {grupos.length === 0 ? (
                <Text style={styles.empty}>No tienes grupos creados.</Text>
              ) : (
                grupos.map(g => {
                  const sel = reclamoGrupo === g.id;
                  // 'ninguna' es la única afinidad que bloquea (ver el mismo criterio
                  // aplicado arriba, en "Postular un grupo").
                  const noAfin = afinidadCarreraVacante(g.carrera, reclamoVac) === 'ninguna';
                  const comp = normalizarHorario(reclamoVac?.horario)
                    ? contarCompatibilidad(
                        estudiantes.filter(e => e.grupo_id === g.id),
                        normalizarHorario(reclamoVac?.horario)!,
                      )
                    : null;
                  return (
                    <TouchableOpacity
                      key={g.id}
                      disabled={noAfin}
                      style={[styles.grupoRow, sel && styles.grupoRowSel, noAfin && { opacity: 0.5 }]}
                      onPress={() => {
                        if (sel) { setReclamoGrupo(null); return; }
                        // Grupo ya cubierto (cupo asegurado para todos sus
                        // estudiantes): avisar en vez de dejar reservar de más.
                        const total = g.estudiantes_count ?? 0;
                        if (total > 0 && cuposAseguradosDeGrupo(g.id) >= total) {
                          setGrupoCubierto(g);
                          return;
                        }
                        setReclamoGrupo(g.id);
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle} numberOfLines={1}>{g.nombre ?? 'Grupo'}</Text>
                        <Text style={styles.cardMeta} numberOfLines={1}>
                          {g.carrera ?? '—'} · {g.estudiantes_count ?? 0} estudiantes
                        </Text>
                        {/* Bloquea la selección: el área de la vacante no
                            corresponde a la carrera del grupo. */}
                        {noAfin && (
                          <Text style={[styles.cardMeta, { color: colors.error }]}>
                            ⚠ Área no afín a {g.carrera} — no se puede reservar para este grupo
                          </Text>
                        )}
                        {comp && comp.total > 0 && (
                          <Text
                            style={[
                              styles.cardMeta,
                              { color: comp.compatibles === comp.total ? colors.success : colors.warning },
                            ]}
                          >
                            {comp.compatibles}/{comp.total} pueden con este horario
                          </Text>
                        )}
                      </View>
                      <Ionicons
                        name={sel ? 'radio-button-on' : 'radio-button-off'}
                        size={20}
                        color={sel ? colors.primary : colors.textMuted}
                      />
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setReclamoVac(null)}
                disabled={reclamando}
              >
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.acceptBtn, reclamando && { opacity: 0.6 }]}
                onPress={confirmarReclamo}
                disabled={reclamando}
              >
                {reclamando
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.acceptText}>Reservar</Text>}
              </TouchableOpacity>
            </View>

            {/* ── Aviso: grupo ya cubierto — overlay INTERNO, no un <Modal>
                aparte. Dos <Modal> nativos a la vez no se pueden apilar de
                forma confiable en iOS/Android (el segundo no llega a
                mostrarse); mismo cuidado ya aplicado en ChatThread.tsx. */}
            {grupoCubierto ? (
              <TouchableOpacity
                style={[StyleSheet.absoluteFill, styles.avisoBackdrop]}
                activeOpacity={1}
                onPress={() => setGrupoCubierto(null)}
              >
                <View style={styles.avisoCard}>
                  <Ionicons name="checkmark-circle" size={40} color={colors.success} />
                  <Text style={[styles.sheetTitle, { textAlign: 'center', marginTop: 8 }]}>
                    Grupo ya cubierto
                  </Text>
                  <Text style={[styles.cardMeta, { textAlign: 'center', marginTop: 4 }]}>
                    El grupo "{grupoCubierto.nombre ?? 'Grupo'}" ya tiene cupo asegurado para sus{' '}
                    {grupoCubierto.estudiantes_count ?? 0} estudiante(s). No hace falta reservar más para él.
                  </Text>
                  <TouchableOpacity
                    style={[styles.acceptBtn, { marginTop: 14, alignSelf: 'stretch' }]}
                    onPress={() => setGrupoCubierto(null)}
                  >
                    <Text style={styles.acceptText}>Entendido</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* ── Modal: rechazar oferta (justificación) ──
          `animationType="none"` (antes "fade"): mismo riesgo que el modal de
          "Evaluar grupo" (ver comentario ahí) pero con `opacity` en vez de
          `translateY" — si la animación de entrada no llega a pintarse, el
          modal queda con `opacity: 0`, invisible pero técnicamente montado. */}
      <Modal visible={!!rechazoApp} transparent animationType="none" onRequestClose={() => setRechazoApp(null)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Rechazar oferta</Text>
            <Text style={styles.cardMeta}>Justifica por qué rechazas la oferta de la empresa.</Text>
            <TextInput
              style={styles.textArea}
              value={justif}
              onChangeText={(t) => { setJustif(t); setMotivoVacioErr(false); }}
              placeholder="Escribe el motivo…"
              placeholderTextColor={colors.textMuted}
              multiline
              selectionColor={colors.primary}
            />
            {motivoVacioErr && (
              <Text style={[styles.note, { color: colors.error }]}>Escribe un motivo antes de rechazar.</Text>
            )}
            {errorAccion?.id === rechazoApp?.id && (
              <Text style={[styles.note, { color: colors.error }]}>{errorAccion?.mensaje}</Text>
            )}
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setRechazoApp(null)}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.rejectBtnSolid}
                onPress={() => {
                  if (!justif.trim()) {
                    setMotivoVacioErr(true);
                    void showAlert('Motivo requerido');
                    return;
                  }
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
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Error de la evaluación en curso, mostrado en línea porque Alert.alert no
  // muestra nada en web (el botón parecería no hacer nada si solo se usara).
  const [errorSel, setErrorSel] = useState<string | null>(null);
  // Horario/fechas/pago acordado (modal reutilizado del chat, para que el
  // formato sea idéntico al que ya calcula las horas de la pasantía).
  const [showHorarioModal, setShowHorarioModal] = useState(false);

  // Reclamos de cupos pendientes de confirmación (solo si la vacante NO tiene
  // `reclamos_auto`; con auto, el reclamo nace ya aceptado y no aparece aquí).
  const [reclamos, setReclamos] = useState<ReclamoCupos[]>([]);
  const [rechazoReclamo, setRechazoReclamo] = useState<ReclamoCupos | null>(null);
  const [motivoReclamo, setMotivoReclamo] = useState('');

  useEffect(() => {
    if (!empresaId) return;
    const unsub = onSnapshot(
      query(collection(db, 'aplicaciones_grupos'), where('empresaId', '==', empresaId)),
      snap => setSolicitudes(snap.docs.map(d => ({ id: d.id, ...d.data() } as AplicacionGrupo))),
      error => console.warn('Error en listener (solicitudes grupos empresa):', error),
    );
    return unsub;
  }, [empresaId]);

  useEffect(() => {
    if (!empresaId) return;
    const unsub = onSnapshot(
      query(collection(db, COLECCION_RECLAMOS), where('empresaId', '==', empresaId)),
      snap => setReclamos(snap.docs.map(d => ({ id: d.id, ...d.data() } as ReclamoCupos))),
      error => console.warn('Error en listener (reclamos cupos empresa):', error),
    );
    return unsub;
  }, [empresaId]);

  const reclamosPendientes = reclamos.filter(r => r.estado === 'pendiente');

  const responderCupos = async (r: ReclamoCupos, decision: 'aceptar' | 'rechazar', motivo?: string) => {
    try {
      await responderReclamo(r.id, decision, motivo);
      setRechazoReclamo(null);
      setMotivoReclamo('');
      void showAlert(decision === 'aceptar' ? 'Cupos confirmados' : 'Solicitud rechazada');
    } catch (e: any) {
      void showAlert('Error', e?.message ?? 'No se pudo procesar.');
    }
  };

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
    setMotivo('');
    setErrorSel(null);
    setShowHorarioModal(false);
  };

  // Chequeo de límite de alianzas del plan (aplica solo al aceptar): bloquea
  // una universidad NUEVA si ya se alcanzó el cupo (las ya aliadas no cuentan
  // de nuevo). Se valida ANTES de abrir el selector de horario, para no hacer
  // que la empresa llene todo el formulario y recién ahí se le niegue.
  const puedeAceptar = (s: AplicacionGrupo) =>
    ilimitadas || universidadesAliadas.has(s.universidadId) || universidadesAliadas.size < limiteAlianzas;

  const abrirSelectorHorario = () => {
    if (!sel) return;
    setErrorSel(null);
    if (!puedeAceptar(sel)) {
      const mensaje = `Tu plan permite ${limiteAlianzas} alianza${limiteAlianzas === 1 ? '' : 's'} con universidades. Mejora tu plan para aliarte con más instituciones.`;
      setErrorSel(mensaje);
      void showAlert('Límite de alianzas alcanzado', mensaje);
      return;
    }
    setShowHorarioModal(true);
  };

  // Se dispara al enviar el modal de horario (mismo componente que usa el
  // chat) — aceptar el grupo con el acuerdo ya estructurado.
  const aceptarConAcuerdo = async (acuerdo: AcuerdoData) => {
    if (!sel) return;
    setShowHorarioModal(false);
    setEnviando(true);
    try {
      await evaluarGrupoPorEmpresa(sel.id, 'aceptar', { acuerdo });
      void showAlert('Listo', 'Oferta enviada a la universidad.');
      setSel(null);
    } catch (e: any) {
      // Alert.alert es un no-op en web: sin este aviso en línea, un rechazo
      // por regla de negocio queda completamente silencioso.
      const mensaje = e?.message ?? 'No se pudo procesar.';
      setErrorSel(mensaje);
      void showAlert('Error', mensaje);
    } finally {
      setEnviando(false);
    }
  };

  const confirmarRechazo = async () => {
    if (!sel) return;
    if (!motivo.trim()) {
      setErrorSel('Escribe un motivo antes de rechazar.');
      void showAlert('Motivo requerido');
      return;
    }
    setErrorSel(null);
    setEnviando(true);
    try {
      await evaluarGrupoPorEmpresa(sel.id, 'rechazar', { justificacionRechazo: motivo });
      void showAlert('Listo', 'Grupo rechazado.');
      setSel(null);
    } catch (e: any) {
      const mensaje = e?.message ?? 'No se pudo procesar.';
      setErrorSel(mensaje);
      void showAlert('Error', mensaje);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      {/* ── Solicitudes de cupos pendientes de confirmar ── */}
      {reclamosPendientes.length > 0 && (
        <>
          <Text style={styles.heading}>Solicitudes de cupos</Text>
          {reclamosPendientes.map(r => (
            <GlassCard key={r.id} colors={colors} isDark={isDark} column>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {r.universidadNombre || 'Una universidad'} solicita {r.cantidad} cupo(s)
              </Text>
              <Text style={styles.cardMeta} numberOfLines={1}>
                {r.vacanteTitulo || 'Vacante'}
                {r.grupoNombre ? ` · ${r.grupoNombre}` : ''}
              </Text>
              {textoHorario(r.horario) && (
                <Text style={styles.cardMeta}>{textoHorario(r.horario)}</Text>
              )}
              <Text style={styles.note}>
                Los cupos ya están apartados mientras decides. Si rechazas, vuelven a estar disponibles.
              </Text>
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={styles.rejectBtn}
                  onPress={() => { setMotivoReclamo(''); setRechazoReclamo(r); }}
                >
                  <Text style={styles.rejectText}>Rechazar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.acceptBtn}
                  onPress={() => responderCupos(r, 'aceptar')}
                >
                  <Text style={styles.acceptText}>Confirmar cupos</Text>
                </TouchableOpacity>
              </View>
            </GlassCard>
          ))}
        </>
      )}

      {/* ── Modal: rechazar solicitud de cupos ── */}
      <Modal
        visible={!!rechazoReclamo}
        transparent
        animationType="none"
        onRequestClose={() => setRechazoReclamo(null)}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Rechazar solicitud de cupos</Text>
            <Text style={styles.cardMeta}>
              Explica por qué no puedes recibir a estos estudiantes.
            </Text>
            <TextInput
              style={styles.textArea}
              value={motivoReclamo}
              onChangeText={setMotivoReclamo}
              placeholder="Escribe el motivo…"
              placeholderTextColor={colors.textMuted}
              multiline
              selectionColor={colors.primary}
            />
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setRechazoReclamo(null)}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.rejectBtn}
                onPress={() => rechazoReclamo && responderCupos(rechazoReclamo, 'rechazar', motivoReclamo)}
              >
                <Text style={styles.rejectText}>Rechazar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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

      {/* ── Modal de evaluación ──
          `visible` se apaga mientras `showHorarioModal` está abierto: apilar
          dos <Modal> nativos deja un overlay fantasma que bloquea los toques
          (mismo problema ya resuelto en ChatThread.tsx).
          `animationType="none"` (antes "slide"): la animación de entrada de
          react-native-web anima un `transform: translateY()` en dos pasos de
          render; si el segundo paso no llega a pintarse a tiempo, el modal
          queda con el `translateY` inicial (una pantalla completa hacia abajo)
          — visualmente inexistente y sin forma de hacerle scroll para
          alcanzarlo. Sin animación, el modal usa un `position: fixed` estático
          y siempre aparece en su lugar. */}
      <Modal visible={!!sel && !showHorarioModal} transparent animationType="none" onRequestClose={() => setSel(null)}>
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

            {/* Tabs aceptar / rechazar — Aceptar dispara el selector de horario
                de inmediato (antes requería un segundo botón debajo cuyas
                propiedades responsive fallaban en móvil y podía quedar
                inalcanzable en pantallas pequeñas). */}
            <View style={styles.segment}>
              <TouchableOpacity
                style={[styles.segmentBtn, modo === 'aceptar' && styles.segmentBtnActive]}
                onPress={() => { setModo('aceptar'); abrirSelectorHorario(); }}
                disabled={enviando}
              >
                <Text style={[styles.segmentText, modo === 'aceptar' && styles.segmentTextActive]}>Aceptar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentBtn, modo === 'rechazar' && styles.segmentBtnActive]}
                onPress={() => { setModo('rechazar'); setErrorSel(null); }}
              >
                <Text style={[styles.segmentText, modo === 'rechazar' && styles.segmentTextActive]}>Rechazar</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {modo === 'aceptar' ? (
                <Text style={[styles.note, { marginTop: 10 }]}>
                  Al pulsar Aceptar se abrirá el formulario para definir el horario
                  (días y horas), el período de la pasantía y el pago acordado. Ese
                  acuerdo es lo que permite calcular las horas de práctica de cada
                  estudiante del grupo.
                </Text>
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

            {!!errorSel && (
              <Text style={[styles.note, { color: colors.error }]}>{errorSel}</Text>
            )}

            {modo === 'rechazar' && (
              <TouchableOpacity
                style={[styles.rejectBtnSolid, enviando && { opacity: 0.6 }]}
                onPress={confirmarRechazo}
                disabled={enviando}
              >
                {enviando
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.rejectSolidText}>Rechazar grupo</Text>}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Selector de horario/fechas/pago (mismo componente que el chat) ── */}
      <ProponerHorarioModal
        visible={showHorarioModal}
        onClose={() => setShowHorarioModal(false)}
        onSubmit={aceptarConAcuerdo}
      />
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

    // Lista de tarjetas de "Vacantes disponibles": una sola columna (una
    // tarjeta por fila) en todos los tamaños de pantalla, centrada, con un
    // ancho máximo para que no toque los bordes de la pantalla.
    vacantesGrid: { flexDirection: 'column', gap: 14, alignItems: 'center' },
    vacanteCardWrap: { width: '100%', maxWidth: 560 },

    cardTitle: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: C.textPrimary },
    cardMeta: { fontSize: 12, fontFamily: FONTS.interRegular, color: C.textMuted, marginTop: 2 },
    note: { fontSize: 12, fontFamily: FONTS.interRegular, color: C.textMuted, marginTop: 4 },

    rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 10 },

    cta: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: C.primary, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 9, alignSelf: 'flex-start',
    },
    ctaDisabled: { backgroundColor: C.textMuted, opacity: 0.55 },
    // Botones de "Vacantes disponibles": reparten el ancho de la tarjeta a
    // partes iguales en vez de quedar apiñados a la izquierda (`cta`/`ctaAlt`
    // traen `alignSelf: 'flex-start'` para su uso original en fila junto a
    // texto — aquí van solos en su propia franja al pie de la tarjeta).
    ctaFull: { flex: 1, alignSelf: 'stretch', justifyContent: 'center' },
    ctaAlt: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: 'transparent', borderRadius: 12,
      borderWidth: 1, borderColor: C.primary,
      paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start',
    },
    ctaAltText: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: C.primaryLight },
    barraFondo: {
      height: 7, borderRadius: 4, backgroundColor: C.border,
      overflow: 'hidden', marginTop: 8,
    },
    barraRelleno: { height: '100%', borderRadius: 4 },
    badgeReclamo: { fontSize: 11, fontFamily: FONTS.interSemiBold },
    liberarBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      alignSelf: 'flex-start', marginTop: 8,
      paddingVertical: 5, paddingHorizontal: 9,
      borderRadius: 9, borderWidth: 1, borderColor: C.border,
    },
    liberarTxt: { fontSize: 11.5, fontFamily: FONTS.interRegular, color: C.textMuted },
    grupoRowSel: { borderColor: C.primary, borderWidth: 1 },
    campoLabel: {
      fontSize: 12, fontFamily: FONTS.interSemiBold,
      color: C.textPrimary, marginTop: 12, marginBottom: 5,
    },
    inputNum: {
      borderWidth: 1, borderColor: C.border, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 9,
      color: C.textPrimary, fontSize: 15, fontFamily: FONTS.interSemiBold,
      backgroundColor: C.backgroundCard,
    },
    ctaText: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: '#fff' },
    cardCupos: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: C.primaryLight, marginTop: 3 },
    cardCuposAgotado: { color: C.error },

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

    // Aviso "grupo ya cubierto" — overlay interno sobre el modal de reservar
    // cupos (no un <Modal> aparte, ver comentario en el punto de uso).
    avisoBackdrop: {
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center', justifyContent: 'center',
      padding: 24,
      // Solo las esquinas de arriba: el sheet que cubre no tiene radio abajo
      // (llega al borde de la pantalla), así que solo esas hacían falta.
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
    },
    avisoCard: {
      backgroundColor: C.backgroundCard,
      borderRadius: 18, padding: 20, width: '100%', maxWidth: 340,
      borderWidth: 1, borderColor: C.border, alignItems: 'center',
    },

    grupoRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: C.backgroundSurface, borderRadius: 12, padding: 12, marginTop: 8,
      borderWidth: 1, borderColor: C.border,
    },

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
    textArea: {
      backgroundColor: C.backgroundSurface, borderRadius: 10, borderWidth: 1, borderColor: C.border,
      minHeight: 90, padding: 14, fontSize: 14, fontFamily: FONTS.interRegular, color: C.textPrimary,
      textAlignVertical: 'top', marginTop: 6,
    },
  });
  return sheet;
};
