/**
 * NetworkStats.tsx — gráficas interactivas y estadísticas gamificadas.
 *
 * Exporta:
 *  - <RedGradlyBanner />            → carrusel "Estadísticas de la Red Gradly"
 *                                     (Top empresas / universidades) para el Inicio.
 *  - <PerfilStatsEmpresa empresaId />     → panel de Mi Perfil (Empresa):
 *      BarChart de pagos + listas de universidades aliadas y estudiantes.
 *  - <PerfilStatsUniversidad universidadId /> → panel de Mi Perfil (Universidad):
 *      PieChart del estado de las postulaciones de sus grupos.
 */
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { collection, doc, getDoc, getDocs, limit, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BarChart, PieChart } from 'react-native-chart-kit';
import { db } from '../config/firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';

const SCREEN_W = Dimensions.get('window').width;

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function makeChartConfig(colors: GradlyColors, isDark: boolean) {
  const [pr, pg, pb] = hexToRgb(colors.primary);
  const [tr, tg, tb] = hexToRgb(colors.textMuted);
  return {
    backgroundGradientFrom: colors.backgroundCard,
    backgroundGradientTo: colors.backgroundCard,
    backgroundGradientFromOpacity: 0,
    backgroundGradientToOpacity: 0,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(${pr},${pg},${pb},${opacity})`,
    labelColor: (opacity = 1) => `rgba(${tr},${tg},${tb},${opacity})`,
    barPercentage: 0.6,
    propsForBackgroundLines: { stroke: colors.border },
  };
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MEDALLAS = ['🥇', '🥈', '🥉', '4°', '5°'];

// ═════════════════════════════════════════════
// BANNER: ESTADÍSTICAS DE LA RED GRADLY
// ═════════════════════════════════════════════
export function RedGradlyBanner() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [topEmpresas, setTopEmpresas] = useState<{ nombre: string; valor: number }[]>([]);
  const [topUnis, setTopUnis] = useState<{ nombre: string; valor: number }[]>([]);

  useEffect(() => {
    // No ejecutar consultas a Firestore sin sesión activa.
    if (!user?.uid) { setTopEmpresas([]); setTopUnis([]); return; }
    let cancel = false;
    (async () => {
      try {
        const [empSnap, uniSnap, vacSnap, gruSnap] = await Promise.all([
          getDocs(query(collection(db, 'perfiles_empresas'), limit(60))),
          getDocs(query(collection(db, 'perfiles_universidades'), limit(60))),
          getDocs(query(collection(db, 'vacantes'), limit(300))),
          getDocs(query(collection(db, 'grupos'), limit(300))),
        ]);
        if (cancel) return;

        // Volumen de pasantías por empresa = suma de contratados_count de sus vacantes
        const empNombre = new Map<string, string>();
        empSnap.docs.forEach(d => empNombre.set(d.id, (d.data() as any).nombre_empresa ?? 'Empresa'));
        const empVol = new Map<string, number>();
        vacSnap.docs.forEach(d => {
          const v: any = d.data();
          const prev = empVol.get(v.empresa_id) ?? 0;
          empVol.set(v.empresa_id, prev + (v.contratados_count ?? 0) + 1); // +1 por publicar
        });
        const emps = [...empVol.entries()]
          .filter(([id]) => empNombre.has(id))
          .map(([id, valor]) => ({ nombre: empNombre.get(id)!, valor }))
          .sort((a, b) => b.valor - a.valor)
          .slice(0, 5);

        // Volumen por universidad = número de grupos creados
        const uniNombre = new Map<string, string>();
        uniSnap.docs.forEach(d => uniNombre.set(d.id, (d.data() as any).nombre_universidad ?? 'Universidad'));
        const uniVol = new Map<string, number>();
        gruSnap.docs.forEach(d => {
          const g: any = d.data();
          const prev = uniVol.get(g.universidad_id) ?? 0;
          uniVol.set(g.universidad_id, prev + 1);
        });
        const unis = [...uniVol.entries()]
          .filter(([id]) => uniNombre.has(id))
          .map(([id, valor]) => ({ nombre: uniNombre.get(id)!, valor }))
          .sort((a, b) => b.valor - a.valor)
          .slice(0, 5);

        setTopEmpresas(emps);
        setTopUnis(unis);
      } catch (e) {
        console.error('[RedGradly] rank', e);
      }
    })();
    return () => { cancel = true; };
  }, [user?.uid]);

  const cardWidth = SCREEN_W - 64;

  const RankCard = ({ titulo, icon, color, data, unidad }: {
    titulo: string; icon: keyof typeof Ionicons.glyphMap; color: string;
    data: { nombre: string; valor: number }[]; unidad: string;
  }) => (
    <BlurView
      intensity={isDark ? 30 : 55}
      tint={isDark ? 'dark' : 'light'}
      style={[styles.rankCard, { width: cardWidth }]}
    >
      <View style={styles.rankHeader}>
        <Ionicons name={icon} size={18} color={color} />
        <Text style={styles.rankTitle}>{titulo}</Text>
      </View>
      {data.length === 0 ? (
        <Text style={styles.rankEmpty}>Aún sin datos suficientes.</Text>
      ) : (
        data.map((e, i) => (
          <View key={`${e.nombre}-${i}`} style={styles.rankRow}>
            <Text style={styles.rankMedal}>{MEDALLAS[i]}</Text>
            <Text style={styles.rankName} numberOfLines={1}>{e.nombre}</Text>
            <Text style={[styles.rankValue, { color }]}>{e.valor} {unidad}</Text>
          </View>
        ))
      )}
    </BlurView>
  );

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.bannerHeading}>🌐 Estadísticas de la Red Gradly</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + 12}
        decelerationRate="fast"
        contentContainerStyle={{ gap: 12, paddingRight: 16 }}
      >
        <RankCard titulo="Top Empresas" icon="trophy" color={colors.gold} data={topEmpresas} unidad="pts" />
        <RankCard titulo="Top Universidades" icon="school" color={colors.primaryLight} data={topUnis} unidad="grupos" />
      </ScrollView>
    </View>
  );
}

// ═════════════════════════════════════════════
// PANEL MI PERFIL — EMPRESA
// ═════════════════════════════════════════════
export function PerfilStatsEmpresa({ empresaId }: { empresaId: string }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [trans, setTrans] = useState<any[]>([]);
  const [grupoApps, setGrupoApps] = useState<any[]>([]);
  const [contratados, setContratados] = useState<any[]>([]);
  const [unisAliadas, setUnisAliadas] = useState<string[]>([]);

  useEffect(() => {
    if (!empresaId) return;
    const unsubs = [
      onSnapshot(query(collection(db, 'transacciones'), where('empresa_id', '==', empresaId)),
        s => setTrans(s.docs.map(d => d.data())),
        error => console.warn('Error en listener (transacciones):', error)),
      onSnapshot(query(collection(db, 'aplicaciones_grupos'), where('empresaId', '==', empresaId)),
        s => setGrupoApps(s.docs.map(d => d.data())),
        error => console.warn('Error en listener (aplicaciones_grupos):', error)),
      onSnapshot(query(collection(db, 'aplicaciones'), where('empresa_id', '==', empresaId)),
        s => setContratados(s.docs.filter(d => (d.data() as any).estado === 'contratado').map(d => d.data())),
        error => console.warn('Error en listener (aplicaciones empresa):', error)),
    ];
    return () => unsubs.forEach(u => u());
  }, [empresaId]);

  // Resolver nombres de universidades aliadas (postulaciones aprobadas/en proceso)
  useEffect(() => {
    const ids = [...new Set(
      grupoApps.filter(a => a.estado === 'aprobada' || a.estado === 'revisando').map(a => a.universidadId),
    )].filter(Boolean) as string[];
    if (ids.length === 0) { setUnisAliadas([]); return; }
    let cancel = false;
    Promise.all(ids.map(id => getDoc(doc(db, 'perfiles_universidades', id))))
      .then(snaps => {
        if (cancel) return;
        setUnisAliadas(snaps.filter(s => s.exists()).map(s => (s.data() as any).nombre_universidad ?? 'Universidad'));
      })
      .catch(() => {});
    return () => { cancel = true; };
  }, [grupoApps]);

  // Agregación mensual de pagos completados (últimos 6 meses)
  const chart = useMemo(() => {
    const now = new Date();
    const labels: string[] = [];
    const buckets: number[] = [];
    const keyIdx = new Map<string, number>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      keyIdx.set(key, labels.length);
      labels.push(MESES[d.getMonth()]);
      buckets.push(0);
    }
    trans.forEach(t => {
      if (t.estado !== 'completado') return;
      const f = t.fecha?.toDate?.();
      if (!f) return;
      const key = `${f.getFullYear()}-${f.getMonth()}`;
      const idx = keyIdx.get(key);
      if (idx !== undefined) buckets[idx] += Number(t.monto) || 0;
    });
    return { labels, data: buckets, total: buckets.reduce((a, b) => a + b, 0) };
  }, [trans]);

  const chartConfig = makeChartConfig(colors, isDark);
  const chartWidth = SCREEN_W - 96;

  return (
    <View style={{ gap: 16 }}>
      {/* Pagos */}
      <View>
        <Text style={styles.panelTitle}>Pagos a grupos (últimos 6 meses)</Text>
        {chart.total > 0 ? (
          <BarChart
            data={{ labels: chart.labels, datasets: [{ data: chart.data }] }}
            width={chartWidth}
            height={200}
            yAxisLabel="$"
            yAxisSuffix=""
            chartConfig={chartConfig}
            fromZero
            showValuesOnTopOfBars
            style={styles.chart}
          />
        ) : (
          <Text style={styles.empty}>Aún no hay pagos registrados.</Text>
        )}
      </View>

      {/* Universidades aliadas */}
      <View>
        <Text style={styles.panelTitle}>Universidades aliadas ({unisAliadas.length})</Text>
        {unisAliadas.length === 0 ? (
          <Text style={styles.empty}>Aún sin universidades aliadas.</Text>
        ) : (
          unisAliadas.map((n, i) => (
            <View key={`${n}-${i}`} style={styles.listRow}>
              <Ionicons name="school-outline" size={18} color={colors.primaryLight} />
              <Text style={styles.listText} numberOfLines={1}>{n}</Text>
            </View>
          ))
        )}
      </View>

      {/* Estudiantes trabajando */}
      <View>
        <Text style={styles.panelTitle}>Estudiantes trabajando ({contratados.length})</Text>
        {contratados.length === 0 ? (
          <Text style={styles.empty}>Aún sin estudiantes contratados.</Text>
        ) : (
          contratados.map((a, i) => (
            <View key={a.estudiante_id ?? i} style={styles.listRow}>
              <Ionicons name="person-outline" size={18} color={colors.success} />
              <Text style={styles.listText} numberOfLines={1}>{a.estudiante_nombre ?? 'Estudiante'}</Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

// ═════════════════════════════════════════════
// PANEL MI PERFIL — UNIVERSIDAD
// ═════════════════════════════════════════════
export function PerfilStatsUniversidad({ universidadId }: { universidadId: string }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [apps, setApps] = useState<any[]>([]);

  useEffect(() => {
    if (!universidadId) return;
    const unsub = onSnapshot(
      query(collection(db, 'aplicaciones_grupos'), where('universidadId', '==', universidadId)),
      s => setApps(s.docs.map(d => d.data())),
      error => console.warn('Error en listener (aplicaciones_grupos universidad):', error),
    );
    return unsub;
  }, [universidadId]);

  const conteos = useMemo(() => {
    let pendientes = 0, activas = 0, rechazadas = 0;
    apps.forEach(a => {
      if (a.estado === 'pendiente' || a.estado === 'revisando') pendientes++;
      else if (a.estado === 'aprobada') activas++;
      else if (a.estado === 'rechazada') rechazadas++;
    });
    return { pendientes, activas, rechazadas };
  }, [apps]);

  const total = conteos.pendientes + conteos.activas + conteos.rechazadas;
  const chartConfig = makeChartConfig(colors, isDark);
  const chartWidth = SCREEN_W - 96;

  const pieData = [
    { name: 'Activas', population: conteos.activas, color: colors.success, legendFontColor: colors.textMuted, legendFontSize: 12 },
    { name: 'Pendientes', population: conteos.pendientes, color: colors.warning, legendFontColor: colors.textMuted, legendFontSize: 12 },
    { name: 'Rechazadas', population: conteos.rechazadas, color: colors.error, legendFontColor: colors.textMuted, legendFontSize: 12 },
  ].filter(d => d.population > 0);

  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.panelTitle}>Estado de postulaciones de tus grupos</Text>
      {total === 0 ? (
        <Text style={styles.empty}>Aún no hay postulaciones de grupos.</Text>
      ) : (
        <>
          <PieChart
            data={pieData}
            width={chartWidth}
            height={200}
            chartConfig={chartConfig}
            accessor="population"
            backgroundColor="transparent"
            paddingLeft="8"
            absolute
          />
          <View style={styles.statsRow}>
            <MiniStat label="Activas" value={conteos.activas} color={colors.success} styles={styles} />
            <MiniStat label="Pendientes" value={conteos.pendientes} color={colors.warning} styles={styles} />
            <MiniStat label="Rechazadas" value={conteos.rechazadas} color={colors.error} styles={styles} />
          </View>
        </>
      )}
    </View>
  );
}

function MiniStat({ label, value, color, styles }: { label: string; value: number; color: string; styles: any }) {
  return (
    <View style={styles.miniStat}>
      <Text style={[styles.miniValue, { color }]}>{value}</Text>
      <Text style={styles.miniLabel}>{label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────
const makeStyles = (COLORS: GradlyColors) => StyleSheet.create({
  bannerHeading: { fontSize: 15, fontFamily: FONTS.soraSemiBold, color: COLORS.textPrimary, marginBottom: 10 },
  rankCard: {
    borderRadius: 20, padding: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.18)',
    backgroundColor: COLORS.backgroundCard + 'cc',
    gap: 8,
  },
  rankHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  rankTitle: { fontSize: 14, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
  rankEmpty: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted, paddingVertical: 8 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rankMedal: { fontSize: 14, width: 24, textAlign: 'center' },
  rankName: { flex: 1, fontSize: 13, fontFamily: FONTS.interMedium, color: COLORS.textPrimary },
  rankValue: { fontSize: 13, fontFamily: FONTS.rajdhaniBold },

  panelTitle: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight, marginBottom: 8, letterSpacing: 0.3 },
  empty: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textMuted, paddingVertical: 10 },
  chart: { borderRadius: 16, marginVertical: 4 },

  listRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.backgroundSurface, borderRadius: 10, padding: 12, marginBottom: 6,
    borderWidth: 1, borderColor: COLORS.border,
  },
  listText: { flex: 1, fontSize: 13, fontFamily: FONTS.interMedium, color: COLORS.textPrimary },

  statsRow: { flexDirection: 'row', gap: 10 },
  miniStat: {
    flex: 1, alignItems: 'center', backgroundColor: COLORS.backgroundSurface,
    borderRadius: 12, paddingVertical: 12, borderWidth: 1, borderColor: COLORS.border,
  },
  miniValue: { fontSize: 22, fontFamily: FONTS.rajdhaniBold },
  miniLabel: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted, marginTop: 2 },
});
