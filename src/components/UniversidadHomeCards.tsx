/**
 * UniversidadHomeCards.tsx — Carrusel de tarjetas resumen para el Inicio de la
 * universidad. Agrupa en DOS tarjetas navegables con puntos + flechas (solo se
 * monta la página activa):
 *
 *   1. "Resumen"  → métricas numéricas clave calculadas de Firestore:
 *        Estudiantes Activos · Certificados · Instituciones Afiliadas ·
 *        Grupos · En pasantía · Horas aprobadas.
 *   2. "Análisis" → gráficos con datos reales:
 *        · Progreso de las pasantías activas (barras de tiempo)
 *
 * Sustituye a la vieja sección "Estadísticas": todo su contenido vive aquí.
 *
 * Nota: "Certificados" = estudiantes cuya pasantía culminó y cuyo comprobante
 * validó la universidad (`comprobantes_pasantia` en estado 'validado'), el
 * mismo criterio que la lista "Estudiantes certificados" de la sección
 * Pasantías. (Antes esta tarjeta mostraba "Egresados" con el campo `graduado`.)
 */
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,

  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { AutoText as Text, useAutoText } from "./AutoText";
import { db } from '../config/firebaseConfig';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { progresoPorFechas } from '../utils/progresoPasantia';
import type { InscripcionActiva } from '../hooks/useInscripcionesActivas';
import { GlassCard } from '../../components/ui/liquid-glass/GlassCard';

// Ancho máximo de la tarjeta en pantallas anchas (escritorio/tablet); en móvil
// ocupa el ancho disponible menos el padding del Inicio.
const MAX_CARD_W = 640;

interface Props {
  uid: string;
  estudiantes: any[];
  apps: any[];
  solicitudesGrupo: any[];
  /** Inscripciones de cupo activas de sus estudiantes, con su libro de horas (Fase D). */
  inscripciones?: InscripcionActiva[];
  metricas: { totalEstudiantes: number; enPasantia: number; horasAprobadas: number; pendAprobacion: number };
}

export default function UniversidadHomeCards({ uid, estudiantes, apps, solicitudesGrupo, inscripciones = [], metricas }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Fragmentos de la línea de progreso: se traducen aquí porque traen
  // fechas/números que no se pueden sembrar como string fijo.
  const txtInicia = useAutoText('Inicia');
  const txtDia = useAutoText('Día');
  const txtDe = useAutoText('de');

  // Ancho de página responsivo: reacciona al ancho real de la ventana (móvil y
  // escritorio/web) y se limita en pantallas anchas para no estirarse. El Inicio
  // tiene padding 16 a cada lado.
  const { width: winW } = useWindowDimensions();
  const cardWidth = Math.min(winW - 32, MAX_CARD_W);

  const [page, setPage] = useState(0);

  // ── Nº de grupos de esta universidad (suscripción propia y ligera) ──
  const [gruposCount, setGruposCount] = useState(0);
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      query(collection(db, 'grupos'), where('universidad_id', '==', uid)),
      snap => setGruposCount(snap.size),
      error => console.warn('Error en listener (grupos count):', error),
    );
    return unsub;
  }, [uid]);

  // ── Nº de estudiantes CERTIFICADOS (comprobante de pasantía validado por la
  //    universidad). Mismo criterio que "Estudiantes certificados" de la
  //    sección Pasantías: `comprobantes_pasantia` en estado 'validado'. ──
  const [certificadosCount, setCertificadosCount] = useState(0);
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      query(collection(db, 'comprobantes_pasantia'), where('universidadId', '==', uid)),
      snap => setCertificadosCount(snap.docs.filter(d => (d.data() as any).estado === 'validado').length),
      error => console.warn('Error en listener (comprobantes certificados):', error),
    );
    return unsub;
  }, [uid]);

  // ── Métricas derivadas ──
  const estudiantesActivos = useMemo(
    () => estudiantes.filter(e => e.activo !== false && !e.graduado).length,
    [estudiantes],
  );

  // Instituciones afiliadas: empresas con una relación de pasantía real
  // (solicitudes de grupo aprobadas/finalizadas + estudiantes contratados +
  //  inscripciones de cupo activas — este último flujo antes no contaba).
  const institucionesAfiliadas = useMemo(() => {
    const ids = new Set<string>();
    solicitudesGrupo.forEach(sg => {
      if ((sg.estado === 'aprobado' || sg.estado === 'finalizado') && sg.empresaId) ids.add(sg.empresaId);
    });
    apps.forEach(a => {
      if ((a.estado === 'contratado' || a.estado === 'finalizado' || a.estado === 'aprobado') && a.empresa_id) {
        ids.add(a.empresa_id);
      }
    });
    inscripciones.forEach(({ asignacion }) => {
      if (asignacion.empresaId) ids.add(asignacion.empresaId);
    });
    return ids.size;
  }, [solicitudesGrupo, apps, inscripciones]);

  // "En pasantía": estudiantes cursando una práctica AHORA por cualquier vía —
  // el `metricas.enPasantia` que llega ya suma grupo + individual legado; aquí
  // se le añaden las inscripciones de cupo activas (`asignaciones_cupo` tomado),
  // que antes no se contaban en ninguna parte.
  const enPasantiaTotal = (metricas?.enPasantia ?? 0) + inscripciones.length;

  // ── Pasantías de grupo activas (con línea de tiempo porcentual) ──
  const activas = useMemo(
    () => solicitudesGrupo.filter(sg => sg.estado === 'aprobado' && sg.fechaInicio),
    [solicitudesGrupo],
  );

  const goTo = (idx: number) => {
    setPage(Math.max(0, Math.min(1, idx)));
  };

  const stats: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number; color: string }[] = [
    { icon: 'people-outline',            label: 'Estudiantes activos',  value: estudiantesActivos,      color: colors.primaryLight },
    { icon: 'ribbon-outline',            label: 'Certificados',         value: certificadosCount,       color: colors.gold },
    { icon: 'business-outline',          label: 'Instituciones afiliadas', value: institucionesAfiliadas, color: colors.accent },
    { icon: 'albums-outline',            label: 'Grupos',               value: gruposCount,             color: colors.primaryLight },
    { icon: 'briefcase-outline',         label: 'En pasantía',          value: enPasantiaTotal,         color: colors.success },
    { icon: 'time-outline',              label: 'Horas aprobadas',      value: metricas.horasAprobadas, color: colors.accent },
  ];

  return (
    <View style={{ marginBottom: 16, width: cardWidth, alignSelf: 'center' }}>
      {/* Solo se monta la página activa: así el contenedor toma exactamente la
          altura de esa página y no queda espacio vacío bajo la más corta. */}
      <View style={{ width: cardWidth }}>
        {/* ── TARJETA 1: RESUMEN ── */}
        {page === 0 && (
          <GlassCard contentStyle={{ padding: 18 }}>
            <View style={styles.cardHeader}>
              <Ionicons name="stats-chart-outline" size={18} color={colors.primaryLight} />
              <Text style={styles.cardTitle}>Resumen general</Text>
            </View>
            <View style={styles.statGrid}>
              {stats.map(st => (
                <View key={st.label} style={styles.statTile}>
                  <Ionicons name={st.icon} size={22} color={st.color} />
                  <Text style={[styles.statValue, { color: st.color }]}>{st.value}</Text>
                  <Text style={styles.statLabel} numberOfLines={2}>{st.label}</Text>
                </View>
              ))}
            </View>
          </GlassCard>
        )}

        {/* ── TARJETA 2: ANÁLISIS ── */}
        {page === 1 && (
          <GlassCard contentStyle={{ padding: 18 }}>
            <View style={styles.cardHeader}>
              <Ionicons name="pie-chart-outline" size={18} color={colors.primaryLight} />
              <Text style={styles.cardTitle}>Análisis</Text>
            </View>

            {/* Pasantías activas (progreso) */}
            <Text style={styles.blockTitle}>Pasantías activas</Text>
            {activas.length === 0 && inscripciones.length === 0 ? (
              <Text style={styles.empty}>No hay pasantías en curso.</Text>
            ) : (
              <>
              {inscripciones.map(({ asignacion: a, progreso: p }) => {
                const pct = p?.pct ?? 0;
                const color = p?.completado ? colors.gold : p ? colors.success : colors.textMuted;
                return (
                  <View key={a.id} style={{ marginBottom: 14 }}>
                    <View style={styles.progHeader}>
                      <Text style={styles.barLabel} numberOfLines={1} noTranslate>{a.estudianteNombre || 'Estudiante'}</Text>
                      <Text style={[styles.barValue, { color, width: 40 }]}>{pct}%</Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${pct}%` as any, backgroundColor: color }]} />
                    </View>
                    <Text style={styles.progSub} noTranslate>
                      {p ? `${p.cumplidas}/${p.meta} h · ${a.empresaNombre || ''}` : `Sin fecha de inicio · ${a.empresaNombre || ''}`}
                    </Text>
                  </View>
                );
              })}
              {activas.map(sg => {
                const prog = progresoPorFechas(sg.fechaInicio, sg.fechaFin);
                const color = prog.estado === 'completado' ? colors.gold : prog.estado === 'en_curso' ? colors.success : colors.primaryLight;
                return (
                  <View key={sg.id} style={{ marginBottom: 14 }}>
                    <View style={styles.progHeader}>
                      {sg.grupoNombre
                        ? <Text style={styles.barLabel} numberOfLines={1} noTranslate>{sg.grupoNombre}</Text>
                        : <Text style={styles.barLabel} numberOfLines={1}>Grupo</Text>}
                      <Text style={[styles.barValue, { color, width: 40 }]}>{prog.pct}%</Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${prog.pct}%` as any, backgroundColor: color }]} />
                    </View>
                    <Text style={styles.progSub} noTranslate>
                      {prog.estado === 'por_iniciar'
                        ? `${txtInicia} ${sg.fechaInicio}`
                        : `${txtDia} ${prog.diasTranscurridos} ${txtDe} ${prog.diasTotales} · ${sg.fechaInicio} → ${sg.fechaFin}`}
                    </Text>
                  </View>
                );
              })}
              </>
            )}
          </GlassCard>
        )}
      </View>

      {/* ── Controles: flechas + puntos ── */}
      <View style={styles.controls}>
        <TouchableOpacity onPress={() => goTo(page - 1)} disabled={page === 0} style={[styles.arrow, page === 0 && styles.arrowOff]}>
          <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.dots}>
          {[0, 1].map(i => (
            <TouchableOpacity key={i} onPress={() => goTo(i)}>
              <View style={[styles.dot, page === i && styles.dotActive]} />
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity onPress={() => goTo(page + 1)} disabled={page === 1} style={[styles.arrow, page === 1 && styles.arrowOff]}>
          <Ionicons name="chevron-forward" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (COLORS: GradlyColors) => StyleSheet.create({
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  cardTitle: { fontSize: 15, fontFamily: FONTS.soraSemiBold, color: COLORS.textPrimary },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statTile: {
    width: '31%', flexGrow: 1, minWidth: 96,
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 10,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'flex-start', gap: 4,
  },
  statValue: { fontSize: 26, fontFamily: FONTS.rajdhaniBold },
  statLabel: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted },

  blockTitle: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight, marginBottom: 8, letterSpacing: 0.3 },
  empty: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textMuted, paddingVertical: 8 },

  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  barLabel: { flex: 1, fontSize: 12, fontFamily: FONTS.interMedium, color: COLORS.textPrimary },
  barTrack: { flex: 1.4, height: 8, backgroundColor: COLORS.border, borderRadius: 5, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 5 },
  barValue: { fontSize: 12, fontFamily: FONTS.rajdhaniSemiBold, color: COLORS.primaryLight, width: 24, textAlign: 'right' },

  progHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  progSub: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted, marginTop: 4 },

  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 12 },
  arrow: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.backgroundSurface, borderWidth: 1, borderColor: COLORS.border,
  },
  arrowOff: { opacity: 0.35 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.border },
  dotActive: { width: 22, backgroundColor: COLORS.primaryLight },
});
