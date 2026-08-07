/**
 * MercadoLaboralStats.tsx — panel de "cómo está el mercado ahora mismo" para
 * el estudiante que YA está en su pasantía activa (puede ver el feed de
 * vacantes en modo lectura, pero todavía no puede aplicar). Se muestra como
 * `ListHeaderComponent` sobre ese feed, en `app/(tabs)/index.tsx`.
 *
 * Cuenta vacantes ACTIVAS por área a partir de los datos que esa pantalla ya
 * tiene cargados por `onSnapshot` (sin query nueva) — "tiempo real" en el
 * sentido de que refleja el mismo listener en vivo del feed.
 */
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import { BarChart } from 'react-native-chart-kit';
import { Dimensions } from 'react-native';
import { GlassCard } from '../../components/ui/liquid-glass/GlassCard';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { makeChartConfig } from './NetworkStats';

const SCREEN_W = Dimensions.get('window').width;
/** Más de esto y las barras se aplastan/solapan (mismo criterio que el resto
 * de gráficos de barras del proyecto, que usan 5-6). */
const MAX_AREAS = 6;

interface VacanteParaStats {
  categoria?: string;
  area?: string;
}

export default function MercadoLaboralStats({ vacantes }: { vacantes: VacanteParaStats[] }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { labels, data, total } = useMemo(() => {
    const conteo = new Map<string, number>();
    vacantes
      .filter(v => v.categoria !== 'pasantia' && v.area?.trim())
      .forEach(v => {
        const area = v.area!.trim();
        conteo.set(area, (conteo.get(area) ?? 0) + 1);
      });
    const top = [...conteo.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_AREAS);
    return {
      labels: top.map(([area]) => area),
      data: top.map(([, n]) => n),
      total: top.reduce((acc, [, n]) => acc + n, 0),
    };
  }, [vacantes]);

  const chartConfig = makeChartConfig(colors, isDark);
  const chartWidth = SCREEN_W - 64;

  return (
    <GlassCard style={{ marginBottom: 16 }} contentStyle={{ padding: 16 }}>
      <Text style={styles.title}>Pulso del mercado laboral</Text>
      <Text style={styles.subtitle}>Vacantes activas por área, ahora mismo.</Text>
      {total > 0 ? (
        <BarChart
          data={{ labels, datasets: [{ data }] }}
          width={chartWidth}
          height={200}
          yAxisLabel=""
          yAxisSuffix=""
          chartConfig={chartConfig}
          fromZero
          showValuesOnTopOfBars
          style={styles.chart}
        />
      ) : (
        <Text style={styles.empty}>Aún no hay vacantes activas para mostrar.</Text>
      )}
    </GlassCard>
  );
}

const makeStyles = (COLORS: GradlyColors) => StyleSheet.create({
  title: { fontSize: 14, fontFamily: FONTS.soraSemiBold, color: COLORS.textPrimary, marginBottom: 2 },
  subtitle: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted, marginBottom: 10 },
  empty: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textMuted, paddingVertical: 10 },
  chart: { borderRadius: 16, marginVertical: 4, alignSelf: 'center' },
});
