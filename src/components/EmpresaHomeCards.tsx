/**
 * EmpresaHomeCards.tsx — Carrusel de tarjetas resumen para el Inicio de la
 * empresa (equivalente a UniversidadHomeCards, con métricas propias):
 *
 *   1. "Resumen"  → Vacantes activas · Aplicaciones pendientes · Pasantes
 *      activos · Horas validadas · Universidades aliadas · Pasantías de grupo.
 *   2. "Análisis" → Vacantes por área (barras) · Pasantías por cupo (libro de horas).
 *
 * Deslizable (swipe + flechas + puntos). Datos reales de Firestore vía props.
 */
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,

  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { AutoText as Text } from "./AutoText";
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { canonicalizarArea } from '../data/areas';
import type { InscripcionActiva } from '../hooks/useInscripcionesActivas';
import { GlassCard } from '../../components/ui/liquid-glass/GlassCard';

const MAX_CARD_W = 640;

interface Props {
  metricas: { vacantesActivas: number; pendientes: number; activos: number; horasValidadas: number };
  vacantes: any[];
  apps: any[];
  solicitudesGrupo: any[];
  /** Inscripciones de cupo activas en sus vacantes, con su libro de horas (Fase D). */
  inscripciones?: InscripcionActiva[];
}

export default function EmpresaHomeCards({ metricas, vacantes, apps, solicitudesGrupo, inscripciones = [] }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { width: winW } = useWindowDimensions();
  const cardWidth = Math.min(winW - 32, MAX_CARD_W);

  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);

  // ── Métricas derivadas ──
  const universidadesAliadas = useMemo(() => {
    const ids = new Set<string>();
    apps.forEach(a => {
      if ((a.estado === 'contratado' || a.estado === 'finalizado') && a.universidad_id) ids.add(a.universidad_id);
    });
    solicitudesGrupo.forEach(sg => {
      if ((sg.estado === 'aprobado' || sg.estado === 'finalizado') && sg.universidadId) ids.add(sg.universidadId);
    });
    return ids.size;
  }, [apps, solicitudesGrupo]);

  const pasantiasGrupo = useMemo(
    () => solicitudesGrupo.filter(sg => sg.estado === 'aprobado' || sg.estado === 'finalizado').length,
    [solicitudesGrupo],
  );

  // ── Vacantes por área ──
  // Se agrupa por el área CANÓNICA (canonicalizarArea): así "Finaza" y otras
  // variantes con typo/tildes/mayúsculas caen en la misma barra que "Finanzas".
  // Si se crea una vacante en un área existente su número sube; si el área es
  // nueva, aparece sola en la lista.
  const areas = useMemo(() => {
    const map = new Map<string, number>();
    vacantes.forEach(v => {
      const a = canonicalizarArea(v.area);
      map.set(a, (map.get(a) ?? 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [vacantes]);
  // Escala de las barras: el área con más vacantes llena la barra completa.
  const maxArea = useMemo(() => Math.max(...areas.map(([, n]) => n), 1), [areas]);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / cardWidth);
    if (idx !== page) setPage(idx);
  };
  const goTo = (idx: number) => {
    const clamped = Math.max(0, Math.min(1, idx));
    scrollRef.current?.scrollTo({ x: clamped * cardWidth, animated: true });
    setPage(clamped);
  };

  const stats: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number; color: string }[] = [
    { icon: 'briefcase-outline',   label: 'Vacantes activas',     value: metricas.vacantesActivas, color: colors.primaryLight },
    { icon: 'person-add-outline',  label: 'Aplic. pendientes',    value: metricas.pendientes,      color: colors.warning },
    { icon: 'people-outline',      label: 'Pasantes activos',     value: metricas.activos,         color: colors.success },
    { icon: 'time-outline',        label: 'Horas validadas',      value: metricas.horasValidadas,  color: colors.accent },
    { icon: 'school-outline',      label: 'Universidades aliadas', value: universidadesAliadas,    color: colors.primaryLight },
    { icon: 'albums-outline',      label: 'Pasantías de grupo',   value: pasantiasGrupo,           color: colors.gold },
  ];

  return (
    <View style={{ marginBottom: 16, width: cardWidth, alignSelf: 'center' }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        scrollEventThrottle={16}
        decelerationRate="fast"
        // Cada tarjeta ajusta su altura a su propio contenido (no se estiran para igualarse)
        contentContainerStyle={{ alignItems: 'flex-start' }}
      >
        {/* ── TARJETA 1: RESUMEN ── */}
        <View style={{ width: cardWidth }}>
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
        </View>

        {/* ── TARJETA 2: ANÁLISIS ── */}
        <View style={{ width: cardWidth }}>
          <GlassCard contentStyle={{ padding: 18 }}>
            <View style={styles.cardHeader}>
              <Ionicons name="pie-chart-outline" size={18} color={colors.primaryLight} />
              <Text style={styles.cardTitle}>Análisis</Text>
            </View>

            {/* Vacantes por área */}
            <Text style={styles.blockTitle}>Vacantes por área</Text>
            {areas.length === 0 ? (
              <Text style={styles.empty}>Aún no has publicado vacantes.</Text>
            ) : (
              areas.map(([area, count]) => (
                <View key={area} style={styles.barRow}>
                  <Text style={styles.barLabel} numberOfLines={1}>{area}</Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${(count / maxArea) * 100}%` as any }]} />
                  </View>
                  <Text style={styles.barValue}>{count}</Text>
                </View>
              ))
            )}

            {/* Pasantías por cupo (libro de horas — Fase D) */}
            {inscripciones.length > 0 && (
              <>
                <Text style={[styles.blockTitle, { marginTop: 16 }]}>Pasantías por cupo</Text>
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
                        {p ? `${p.cumplidas}/${p.meta} h · ${a.vacanteTitulo || ''}` : `Sin fecha de inicio · ${a.vacanteTitulo || ''}`}
                      </Text>
                    </View>
                  );
                })}
              </>
            )}
          </GlassCard>
        </View>
      </ScrollView>

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
