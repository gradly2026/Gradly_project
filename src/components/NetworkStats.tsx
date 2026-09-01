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
import { Dimensions, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from "./AutoText";
import { BarChart } from 'react-native-chart-kit';
import PerfilPublicoModal from '../../components/PerfilPublicoModal';
import { db } from '../config/firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { useInscripcionesActivas } from '../hooks/useInscripcionesActivas';

const SCREEN_W = Dimensions.get('window').width;

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function makeChartConfig(colors: GradlyColors, isDark: boolean) {
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
/** Fila del ranking: alianzas (contrapartes únicas con pasantía real) +
 * calificación promedio de los estudiantes vinculados a esas pasantías. */
interface RankEntry {
  nombre: string;
  alianzas: number;
  /** null = ningún estudiante vinculado tiene calificaciones aún (no se penaliza). */
  calificacion: number | null;
}

/** Calificación neutra (punto medio 1–5) para quien aún no tiene datos: no
 * hunde el score de una institución con alianzas reales pero sin historial de
 * calificaciones todavía — mismo principio de "dato ausente no penaliza" que
 * ya usa el resto del proyecto (disponibilidad, afinidad, cupos). */
const CALIFICACION_NEUTRA = 2.5;

export function RedGradlyBanner() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [topEmpresas, setTopEmpresas] = useState<RankEntry[]>([]);
  const [topUnis, setTopUnis] = useState<RankEntry[]>([]);

  useEffect(() => {
    // No ejecutar consultas a Firestore sin sesión activa.
    if (!user?.uid) { setTopEmpresas([]); setTopUnis([]); return; }
    let cancel = false;
    (async () => {
      try {
        // ⚠️ Este banner lo puede ver CUALQUIER usuario autenticado, pero las
        // reglas de Firestore de `solicitudes_practicas` (y de `perfiles_
        // estudiantes` para la universidad) solo dejan a cada dueño leer lo
        // suyo — no hay forma de que este componente calcule el ranking
        // consultándolas directamente sin toparse con "Missing or
        // insufficient permissions". Por eso ambas cifras vienen YA
        // calculadas: `aliados_*_ids` (arrayUnion en el propio perfil, lo
        // escriben `respuestaFinalUniversidad`/`firmarAcuerdo` al aprobar una
        // pasantía) y `calificacion_estudiantes_promedio` (cada institución se
        // autoreporta desde su propio dashboard — ver dashboard-empresa.tsx/
        // dashboard-universidad.tsx). Aquí solo se leen y ordenan.
        const [empSnap, uniSnap] = await Promise.all([
          getDocs(query(collection(db, 'perfiles_empresas'), limit(60))),
          getDocs(query(collection(db, 'perfiles_universidades'), limit(60))),
        ]);
        if (cancel) return;

        // Score aditivo (nunca multiplicativo): las alianzas son el eje
        // principal y jamás se van a cero por falta de calificaciones — la
        // calificación solo suma o resta dentro de una banda, con 2.5 (punto
        // medio) como aporte neutro cuando aún no hay ninguna.
        const construirRanking = (
          docs: typeof empSnap.docs,
          campoNombre: string,
          campoAliados: string,
        ): RankEntry[] =>
          docs
            .map(d => {
              const data: any = d.data();
              const aliados: string[] = Array.isArray(data[campoAliados]) ? data[campoAliados] : [];
              const calificacion =
                typeof data.calificacion_estudiantes_promedio === 'number'
                  ? data.calificacion_estudiantes_promedio
                  : null;
              return {
                nombre: (data[campoNombre] as string) ?? '—',
                alianzas: aliados.length,
                calificacion,
                score: aliados.length + (calificacion ?? CALIFICACION_NEUTRA),
              };
            })
            .filter(e => e.alianzas > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map(({ nombre, alianzas, calificacion }) => ({ nombre, alianzas, calificacion }));

        setTopEmpresas(construirRanking(empSnap.docs, 'nombre_empresa', 'aliados_universidades_ids'));
        setTopUnis(construirRanking(uniSnap.docs, 'nombre_universidad', 'aliados_empresas_ids'));
      } catch (e) {
        // No crítico (banner informativo) — se registra pero no debe verse
        // como un crash en el LogBox del usuario.
        console.warn('[RedGradly] rank', e);
      }
    })();
    return () => { cancel = true; };
  }, [user?.uid]);

  const cardWidth = SCREEN_W - 64;

  const RankCard = ({ titulo, icon, color, data }: {
    titulo: string; icon: keyof typeof Ionicons.glyphMap; color: string;
    data: RankEntry[];
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
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.rankValue, { color }]}>{e.alianzas} alianza{e.alianzas === 1 ? '' : 's'}</Text>
              <Text style={styles.rankStars}>
                {e.calificacion != null ? `★ ${e.calificacion.toFixed(1)}` : 'Sin calificación aún'}
              </Text>
            </View>
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
        <RankCard titulo="Top Empresas" icon="trophy" color={colors.gold} data={topEmpresas} />
        <RankCard titulo="Top Universidades" icon="school" color={colors.primaryLight} data={topUnis} />
      </ScrollView>
    </View>
  );
}

// ═════════════════════════════════════════════
// PANEL MI PERFIL — EMPRESA
// ═════════════════════════════════════════════
export function PerfilStatsEmpresa({ empresaId }: { empresaId: string }) {
  const [verPerfilId, setVerPerfilId] = useState<string | null>(null);
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
      if (t.tipo === 'suscripcion') return; // pago del plan de Gradly, no pago a un grupo
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
            <TouchableOpacity
              key={a.estudiante_id ?? i}
              style={styles.listRow}
              activeOpacity={0.7}
              disabled={!a.estudiante_id}
              onPress={() => a.estudiante_id && setVerPerfilId(a.estudiante_id)}
            >
              <Ionicons name="person-outline" size={18} color={colors.success} />
              <Text style={styles.listText} numberOfLines={1}>{a.estudiante_nombre ?? 'Estudiante'}</Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      <PerfilPublicoModal
        visible={!!verPerfilId}
        onClose={() => setVerPerfilId(null)}
        userId={verPerfilId ?? ''}
        rol="talento"
        viewerUserId={empresaId}
        theme="dark"
      />
    </View>
  );
}

// ═════════════════════════════════════════════
// PANEL MI PERFIL — UNIVERSIDAD
// Avance formativo de los estudiantes: distribución por % de horas cumplidas
// (barras) + indicadores de promedio, estudiantes en proceso y egresados.
// Datos reales de `perfiles_estudiantes` de la universidad.
// ═════════════════════════════════════════════
const BUCKET_LABELS = ['0-25%', '26-50%', '51-75%', '76-99%', '100%'];

export function PerfilStatsUniversidad({ universidadId }: { universidadId: string }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [estudiantes, setEstudiantes] = useState<any[]>([]);

  useEffect(() => {
    if (!universidadId) return;
    const unsub = onSnapshot(
      query(collection(db, 'perfiles_estudiantes'), where('universidad_id', '==', universidadId)),
      s => setEstudiantes(s.docs.map(d => ({ id: d.id, ...d.data() }))),
      error => console.warn('Error en listener (perfiles_estudiantes universidad):', error),
    );
    return unsub;
  }, [universidadId]);

  // Libro mayor de horas de las inscripciones de cupo activas (Fase D): es el
  // avance REAL de un estudiante mientras cursa la pasantía. `horas_aprobadas`
  // solo se llena al CERTIFICAR, así que sin esto todos caían en el bucket 0-25%.
  const inscripciones = useInscripcionesActivas('universidadId', universidadId);
  const ledgerPorEstudiante = useMemo(() => {
    const m: Record<string, { pct: number; enProceso: boolean }> = {};
    inscripciones.forEach(({ asignacion, progreso }) => {
      const pct = progreso?.pct ?? 0;
      m[asignacion.estudianteId] = { pct, enProceso: !progreso?.completado };
    });
    return m;
  }, [inscripciones]);

  const resumen = useMemo(() => {
    const buckets = [0, 0, 0, 0, 0];
    let sumaPct = 0, enProceso = 0, egresados = 0;
    estudiantes.forEach(e => {
      const objetivo = Number(e.horas_objetivo) || 500;
      const pctCert = Math.max(0, Math.min(100, (Number(e.horas_aprobadas) || 0) / objetivo * 100));
      const led = ledgerPorEstudiante[e.id];
      // El mayor de: horas ya certificadas vs avance del libro mayor en curso.
      const pct = Math.max(pctCert, led?.pct ?? 0);
      const idx = pct >= 100 ? 4 : pct >= 76 ? 3 : pct >= 51 ? 2 : pct >= 26 ? 1 : 0;
      buckets[idx]++;
      sumaPct += pct;
      if ((Number(e.horas_en_proceso) || 0) > 0 || led?.enProceso) enProceso++;
      if (e.graduado === true) egresados++;
    });
    const promedio = estudiantes.length ? Math.round(sumaPct / estudiantes.length) : 0;
    return { buckets, promedio, enProceso, egresados };
  }, [estudiantes, ledgerPorEstudiante]);

  const chartConfig = makeChartConfig(colors, isDark);
  const chartWidth = SCREEN_W - 96;

  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.panelTitle}>Avance formativo de tus estudiantes</Text>
      {estudiantes.length === 0 ? (
        <Text style={styles.empty}>Aún no tienes estudiantes registrados.</Text>
      ) : (
        <>
          <BarChart
            data={{ labels: BUCKET_LABELS, datasets: [{ data: resumen.buckets }] }}
            width={chartWidth}
            height={200}
            yAxisLabel=""
            yAxisSuffix=""
            chartConfig={chartConfig}
            fromZero
            showValuesOnTopOfBars
            style={styles.chart}
          />
          <Text style={styles.empty}>Estudiantes según su porcentaje de horas cumplidas.</Text>
          <View style={styles.statsRow}>
            <MiniStat label="Avance prom." value={`${resumen.promedio}%` as any} color={colors.primaryLight} styles={styles} />
            <MiniStat label="En proceso" value={resumen.enProceso} color={colors.success} styles={styles} />
            <MiniStat label="Egresados" value={resumen.egresados} color={colors.gold} styles={styles} />
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
  rankStars: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.gold, marginTop: 1 },

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
