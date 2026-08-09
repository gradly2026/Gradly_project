/**
 * UniversidadHomeCards.tsx — Carrusel de tarjetas resumen para el Inicio de la
 * universidad. Agrupa en DOS tarjetas deslizables (swipe + puntos + flechas):
 *
 *   1. "Resumen"  → métricas numéricas clave calculadas de Firestore:
 *        Estudiantes Activos · Egresados · Instituciones Afiliadas ·
 *        Grupos · En pasantía · Horas aprobadas.
 *   2. "Análisis" → gráficos con datos reales:
 *        · Estado de las pasantías de grupo (pastel)
 *        · Carreras con más pasantías (barras)
 *        · Progreso de las pasantías activas (barras de tiempo)
 *
 * Sustituye a la vieja sección "Estadísticas": todo su contenido vive aquí.
 *
 * Nota: "Egresados" se lee del campo `graduado` del estudiante (marca que la
 * universidad pondrá con la futura acción "Egresar grupo"); mientras no exista
 * esa marca, el valor es 0 y los estudiantes cuentan como activos.
 */
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,

  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { AutoText as Text, useAutoText } from "./AutoText";
import { PieChart } from 'react-native-chart-kit';
import { db } from '../config/firebaseConfig';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { progresoPorFechas } from '../utils/progresoPasantia';
import { GlassCard } from '../../components/ui/liquid-glass/GlassCard';

// Ancho máximo de la tarjeta en pantallas anchas (escritorio/tablet); en móvil
// ocupa el ancho disponible menos el padding del Inicio.
const MAX_CARD_W = 640;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

interface Props {
  uid: string;
  estudiantes: any[];
  apps: any[];
  solicitudesGrupo: any[];
  metricas: { totalEstudiantes: number; enPasantia: number; horasAprobadas: number; pendAprobacion: number };
}

export default function UniversidadHomeCards({ uid, estudiantes, apps, solicitudesGrupo, metricas }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Leyendas del gráfico de pastel y fragmentos de la línea de progreso: se
  // traducen aquí (react-native-chart-kit dibuja su leyenda con
  // react-native-svg, fuera del árbol de AutoText, y la línea de progreso
  // trae fechas/números que no se pueden sembrar como string fijo).
  const lblEnCurso = useAutoText('En curso');
  const lblPorIniciar = useAutoText('Por iniciar');
  const lblCompletadas = useAutoText('Completadas');
  const txtInicia = useAutoText('Inicia');
  const txtDia = useAutoText('Día');
  const txtDe = useAutoText('de');

  // Ancho de página responsivo: reacciona al ancho real de la ventana (móvil y
  // escritorio/web) y se limita en pantallas anchas para no estirarse. El Inicio
  // tiene padding 16 a cada lado.
  const { width: winW } = useWindowDimensions();
  const cardWidth = Math.min(winW - 32, MAX_CARD_W);
  const chartWidth = cardWidth - 36;

  const scrollRef = useRef<ScrollView>(null);
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

  // ── Métricas derivadas ──
  const estudiantesActivos = useMemo(
    () => estudiantes.filter(e => e.activo !== false && !e.graduado).length,
    [estudiantes],
  );
  const egresados = useMemo(
    () => estudiantes.filter(e => e.graduado === true).length,
    [estudiantes],
  );

  // Instituciones afiliadas: empresas con una relación de pasantía real
  // (solicitudes de grupo aprobadas/finalizadas + estudiantes contratados).
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
    return ids.size;
  }, [solicitudesGrupo, apps]);

  // ── Carreras con más pasantías (reusa la lógica de la vieja "Estadísticas") ──
  const carreras = useMemo(() => {
    const map: Record<string, number> = {};
    apps
      .filter(a => a.estado === 'contratado' || a.estado === 'finalizado' || a.estado === 'aprobado')
      .forEach(a => {
        const e = estudiantes.find(est => est.id === a.estudiante_id);
        if (e?.carrera) map[e.carrera] = (map[e.carrera] ?? 0) + 1;
      });
    solicitudesGrupo
      .filter(sg => sg.estado === 'aprobado' || sg.estado === 'finalizado')
      .forEach(sg => {
        if (sg.carrera) map[sg.carrera] = (map[sg.carrera] ?? 0) + (sg.alumnos?.length ?? 1);
      });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [estudiantes, apps, solicitudesGrupo]);
  const maxCarrera = Math.max(...carreras.map(c => c[1]), 1);

  // ── Pasantías de grupo activas (con línea de tiempo porcentual) ──
  const activas = useMemo(
    () => solicitudesGrupo.filter(sg => sg.estado === 'aprobado' && sg.fechaInicio),
    [solicitudesGrupo],
  );

  // ── Distribución de estados de las pasantías de grupo (pastel) ──
  const estadosPasantia = useMemo(() => {
    let porIniciar = 0, enCurso = 0, completadas = 0;
    solicitudesGrupo.forEach(sg => {
      if (sg.estado === 'finalizado') { completadas++; return; }
      if (sg.estado === 'aprobado' && sg.fechaInicio) {
        const p = progresoPorFechas(sg.fechaInicio, sg.fechaFin);
        if (p.estado === 'completado') completadas++;
        else if (p.estado === 'en_curso') enCurso++;
        else porIniciar++;
      }
    });
    return { porIniciar, enCurso, completadas };
  }, [solicitudesGrupo]);
  const totalEstados = estadosPasantia.porIniciar + estadosPasantia.enCurso + estadosPasantia.completadas;

  const [pr, pg, pb] = hexToRgb(colors.primary);
  const [tr, tg, tb] = hexToRgb(colors.textMuted);
  const chartConfig = {
    color: (o = 1) => `rgba(${pr},${pg},${pb},${o})`,
    labelColor: (o = 1) => `rgba(${tr},${tg},${tb},${o})`,
    decimalPlaces: 0,
  };
  const pieData = [
    { name: lblEnCurso, population: estadosPasantia.enCurso, color: colors.success, legendFontColor: colors.textMuted, legendFontSize: 12 },
    { name: lblPorIniciar, population: estadosPasantia.porIniciar, color: colors.primaryLight, legendFontColor: colors.textMuted, legendFontSize: 12 },
    { name: lblCompletadas, population: estadosPasantia.completadas, color: colors.gold, legendFontColor: colors.textMuted, legendFontSize: 12 },
  ].filter(d => d.population > 0);

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
    { icon: 'people-outline',            label: 'Estudiantes activos',  value: estudiantesActivos,      color: colors.primaryLight },
    { icon: 'school-outline',            label: 'Egresados',            value: egresados,               color: colors.gold },
    { icon: 'business-outline',          label: 'Instituciones afiliadas', value: institucionesAfiliadas, color: colors.accent },
    { icon: 'albums-outline',            label: 'Grupos',               value: gruposCount,             color: colors.primaryLight },
    { icon: 'briefcase-outline',         label: 'En pasantía',          value: metricas.enPasantia,     color: colors.success },
    { icon: 'time-outline',              label: 'Horas aprobadas',      value: metricas.horasAprobadas, color: colors.accent },
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

            {/* Estado de pasantías de grupo */}
            <Text style={styles.blockTitle}>Estado de las pasantías de grupo</Text>
            {totalEstados === 0 ? (
              <Text style={styles.empty}>Aún no hay pasantías de grupo.</Text>
            ) : (
              <PieChart
                data={pieData}
                width={chartWidth}
                height={170}
                chartConfig={chartConfig as any}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft="8"
                absolute
              />
            )}

            {/* Carreras con más pasantías */}
            <Text style={[styles.blockTitle, { marginTop: 16 }]}>Carreras con más pasantías</Text>
            {carreras.length === 0 ? (
              <Text style={styles.empty}>Sin datos suficientes.</Text>
            ) : (
              carreras.map(([carrera, count]) => (
                <View key={carrera} style={styles.barRow}>
                  <Text style={styles.barLabel} numberOfLines={1}>{carrera}</Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${(count / maxCarrera) * 100}%` as any }]} />
                  </View>
                  <Text style={styles.barValue}>{count}</Text>
                </View>
              ))
            )}

            {/* Pasantías activas (progreso) */}
            <Text style={[styles.blockTitle, { marginTop: 16 }]}>Pasantías activas</Text>
            {activas.length === 0 ? (
              <Text style={styles.empty}>No hay pasantías en curso.</Text>
            ) : (
              activas.map(sg => {
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
              })
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
