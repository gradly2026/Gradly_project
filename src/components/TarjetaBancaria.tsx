import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { shadow } from '../utils/shadow';

interface Props {
  tarjetaNumero?: string; // últimos 4 dígitos
  tarjetaAlias?:  string;
  titular?:       string;
  onPress:        () => void;
  style?:         object;
}

/**
 * Componente visual de tarjeta bancaria simulada.
 * NUNCA muestra el número completo — solo los últimos 4 dígitos almacenados.
 */
export default function TarjetaBancaria({
  tarjetaNumero,
  tarjetaAlias,
  titular,
  onPress,
  style,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tieneTarjeta = !!tarjetaNumero;

  return (
    <TouchableOpacity
      style={[styles.card, style]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* Círculo decorativo */}
      <View style={[styles.circleLeft, { pointerEvents: 'none' }]} />
      <View style={[styles.circleRight, { pointerEvents: 'none' }]} />

      {/* Fila superior */}
      <View style={styles.topRow}>
        <Text style={styles.brand}>GRADLY PAY</Text>
        <Ionicons
          name={tieneTarjeta ? 'card' : 'card-outline'}
          size={26}
          color={colors.primaryLight}
        />
      </View>

      {/* Número enmascarado */}
      <Text style={styles.numero}>
        {tieneTarjeta
          ? `•••• •••• •••• ${tarjetaNumero}`
          : '•••• •••• •••• ????'}
      </Text>

      {/* Fila inferior */}
      <View style={styles.bottomRow}>
        <View>
          <Text style={styles.label}>ALIAS</Text>
          <Text style={styles.value} numberOfLines={1}>
            {tarjetaAlias ?? 'Sin registrar'}
          </Text>
        </View>
        {titular && (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.label}>TITULAR</Text>
            <Text style={styles.value} numberOfLines={1}>{titular}</Text>
          </View>
        )}
        <View style={styles.editHint}>
          <Ionicons name="pencil-outline" size={14} color={colors.primaryLight} />
          <Text style={styles.editText}>
            {tieneTarjeta ? 'Cambiar' : 'Agregar'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (COLORS: GradlyColors) => StyleSheet.create({
  card: {
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 20,
    padding: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.primary35,
    gap: 14,
    // Sombra (multiplataforma)
    ...shadow({ color: COLORS.primary, y: 8, blur: 20, opacity: 0.25, elevation: 10 }),
  },
  // Círculos decorativos
  circleLeft: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(124,58,237,0.12)',
    top: -40,
    left: -40,
  },
  circleRight: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(124,58,237,0.08)',
    bottom: -30,
    right: -20,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    fontSize: 11,
    fontFamily: FONTS.interSemiBold,
    color: COLORS.primaryLight,
    letterSpacing: 2,
  },
  numero: {
    fontSize: 22,
    fontFamily: FONTS.rajdhaniBold,
    color: COLORS.textPrimary,
    letterSpacing: 4,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 9,
    fontFamily: FONTS.interMedium,
    color: COLORS.textMuted,
    letterSpacing: 1,
    marginBottom: 2,
  },
  value: {
    fontSize: 13,
    fontFamily: FONTS.interSemiBold,
    color: COLORS.textPrimary,
    maxWidth: 130,
  },
  editHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primary12,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.primary35,
  },
  editText: {
    fontSize: 11,
    fontFamily: FONTS.interSemiBold,
    color: COLORS.primaryLight,
  },
});
