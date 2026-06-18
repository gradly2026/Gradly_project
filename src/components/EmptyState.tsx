import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { shadow } from '../utils/shadow';

interface EmptyStateProps {
  icon?:        keyof typeof Ionicons.glyphMap;
  titulo:       string;
  subtitulo?:   string;
  accionTexto?: string;
  onAccion?:    () => void;
}

export default function EmptyState({
  icon = 'folder-open-outline',
  titulo,
  subtitulo,
  accionTexto,
  onAccion,
}: EmptyStateProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={52} color={colors.primaryLight} />
      </View>

      <Text style={styles.titulo}>{titulo}</Text>

      {subtitulo ? (
        <Text style={styles.subtitulo}>{subtitulo}</Text>
      ) : null}

      {accionTexto && onAccion ? (
        <TouchableOpacity style={styles.btn} onPress={onAccion} activeOpacity={0.8}>
          <Text style={styles.btnText}>{accionTexto}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const makeStyles = (COLORS: GradlyColors) => StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 28,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.primary12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  titulo: {
    fontSize: 18,
    fontFamily: FONTS.soraSemiBold,
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitulo: {
    fontSize: 13,
    fontFamily: FONTS.interRegular,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  btn: {
    paddingHorizontal: 28,
    paddingVertical: 13,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    ...shadow({ color: COLORS.btnShadow, y: 4, blur: 10, opacity: 1, elevation: 6 }),
  },
  btnText: {
    fontSize: 14,
    fontFamily: FONTS.interSemiBold,
    color: '#FFFFFF',
  },
});
