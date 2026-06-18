import { useEffect, useMemo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTheme, type GradlyColors } from '../context/ThemeContext';

// ─── Barra esqueleto individual ───────────────
interface BarProps {
  width:         number | `${number}%`;
  height:        number;
  borderRadius?: number;
  style?:        ViewStyle;
}

function SkeletonBar({ width, height, borderRadius = 8, style }: BarProps) {
  const { colors } = useTheme();
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.9,  { duration: 750 }),
        withTiming(0.35, { duration: 750 }),
      ),
      -1,
      false,
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: colors.backgroundCard,
        },
        animStyle,
        style,
      ]}
    />
  );
}

// ─── Tarjeta esqueleto ────────────────────────
function CardSkeleton() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.card}>
      <View style={styles.rowHead}>
        <SkeletonBar width={44} height={44} borderRadius={22} />
        <View style={styles.headTexts}>
          <SkeletonBar width="62%" height={14} />
          <SkeletonBar width="40%" height={11} style={{ marginTop: 7 }} />
        </View>
      </View>
      <SkeletonBar width="100%" height={11} style={{ marginTop: 16 }} />
      <SkeletonBar width="82%"  height={11} style={{ marginTop: 7 }} />
      <SkeletonBar width="50%"  height={11} style={{ marginTop: 7 }} />
      <View style={styles.rowFoot}>
        <SkeletonBar width="30%" height={30} borderRadius={10} />
        <SkeletonBar width="30%" height={30} borderRadius={10} />
      </View>
    </View>
  );
}

// ─── Componente exportado ─────────────────────
interface LoadingStateProps {
  count?: number;
}

export default function LoadingState({ count = 3 }: LoadingStateProps) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </View>
  );
}

const makeStyles = (COLORS: GradlyColors) => StyleSheet.create({
  card: {
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headTexts: {
    flex: 1,
  },
  rowFoot: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
});
