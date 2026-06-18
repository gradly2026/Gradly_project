import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS, FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { shadow } from '../utils/shadow';

interface Props {
  visible:      boolean;
  onClose:      () => void;
  /** Recibe los datos seguros para guardar en Firestore (sin número completo) */
  onGuardar:    (ultimos4: string, alias: string) => Promise<void>;
  tarjetaActual?: { numero: string; alias: string };
}

function formatNumero(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
}

function formatVencimiento(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  if (digits.length >= 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return digits;
}

/**
 * Modal para registrar o cambiar una tarjeta bancaria simulada.
 * IMPORTANTE: Al guardar, SOLO persiste los últimos 4 dígitos y el alias.
 * El número completo, CVV y vencimiento NUNCA se almacenan en Firestore.
 */
export default function ModalTarjeta({ visible, onClose, onGuardar, tarjetaActual }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [numero,   setNumero]   = useState('');
  const [titular,  setTitular]  = useState('');
  const [vence,    setVence]    = useState('');
  const [cvv,      setCvv]      = useState('');
  const [alias,    setAlias]    = useState('');
  const [guardando,setGuardando]= useState(false);
  const [showCVV,  setShowCVV]  = useState(false);

  const handleGuardar = async () => {
    const digits = numero.replace(/\s/g, '');
    if (digits.length !== 16) { Alert.alert('Número inválido', 'Ingresa los 16 dígitos de tu tarjeta.'); return; }
    if (!alias.trim())        { Alert.alert('Alias requerido', 'Pon un alias para identificar tu tarjeta.'); return; }
    if (!titular.trim())      { Alert.alert('Titular requerido'); return; }

    setGuardando(true);
    try {
      // SOLO guardamos los últimos 4 dígitos — NUNCA el número completo
      await onGuardar(digits.slice(-4), alias.trim());
      // Limpiar formulario
      setNumero(''); setTitular(''); setVence(''); setCvv(''); setAlias('');
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'No se pudo guardar la tarjeta.');
    } finally {
      setGuardando(false);
    }
  };

  const ultimos4 = numero.replace(/\s/g, '').slice(-4) || '????';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>
              {tarjetaActual ? 'Cambiar tarjeta' : 'Agregar tarjeta'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Aviso de seguridad */}
          <View style={styles.securityNote}>
            <Ionicons name="shield-checkmark-outline" size={16} color={COLORS.success} />
            <Text style={styles.securityText}>
              Solo guardamos los últimos 4 dígitos y el alias. Tu número completo nunca se almacena.
            </Text>
          </View>

          {/* Preview de tarjeta mini */}
          <View style={styles.previewCard}>
            <Text style={styles.previewNumero}>•••• •••• •••• {ultimos4}</Text>
            <Text style={styles.previewAlias}>{alias || 'Mi tarjeta'}</Text>
          </View>

          {/* Campos */}
          <Text style={styles.label}>Número de tarjeta*</Text>
          <TextInput
            style={styles.input}
            value={numero}
            onChangeText={t => setNumero(formatNumero(t))}
            placeholder="1234 5678 9012 3456"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="number-pad"
            maxLength={19}
            selectionColor={COLORS.primary}
          />

          <Text style={styles.label}>Nombre del titular*</Text>
          <TextInput
            style={styles.input}
            value={titular}
            onChangeText={setTitular}
            placeholder="JUAN PÉREZ"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="characters"
            selectionColor={COLORS.primary}
          />

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Vencimiento*</Text>
              <TextInput
                style={styles.input}
                value={vence}
                onChangeText={t => setVence(formatVencimiento(t))}
                placeholder="MM/YY"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="number-pad"
                maxLength={5}
                selectionColor={COLORS.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>CVV (no se guarda)</Text>
              <View style={styles.cvvWrap}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  value={cvv}
                  onChangeText={setCvv}
                  placeholder="123"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="number-pad"
                  secureTextEntry={!showCVV}
                  maxLength={4}
                  selectionColor={COLORS.primary}
                />
                <TouchableOpacity onPress={() => setShowCVV(v => !v)} style={styles.eyeBtn}>
                  <Ionicons name={showCVV ? 'eye-off-outline' : 'eye-outline'} size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <Text style={styles.label}>Alias de la tarjeta*</Text>
          <TextInput
            style={styles.input}
            value={alias}
            onChangeText={setAlias}
            placeholder="Mi tarjeta Visa / Cuenta Banco XYZ"
            placeholderTextColor={COLORS.textMuted}
            selectionColor={COLORS.primary}
          />

          {/* Acciones */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, guardando && { opacity: 0.65 }]}
              onPress={handleGuardar}
              disabled={guardando}
            >
              <Text style={styles.saveText}>
                {guardando ? 'Guardando...' : 'Guardar tarjeta'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (COLORS: GradlyColors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.backgroundCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: { fontSize: 18, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
  closeBtn: { padding: 4 },

  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(16,185,129,0.10)',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.25)',
    marginBottom: 8,
  },
  securityText: {
    flex: 1,
    fontSize: 11,
    fontFamily: FONTS.interRegular,
    color: COLORS.success,
    lineHeight: 16,
  },

  previewCard: {
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.primary35,
    marginBottom: 8,
    gap: 4,
  },
  previewNumero: {
    fontSize: 18,
    fontFamily: FONTS.rajdhaniBold,
    color: COLORS.textPrimary,
    letterSpacing: 3,
  },
  previewAlias: {
    fontSize: 11,
    fontFamily: FONTS.interRegular,
    color: COLORS.textMuted,
  },

  label: {
    fontSize: 11,
    fontFamily: FONTS.interMedium,
    color: COLORS.primaryLight,
    marginBottom: 4,
    marginTop: 6,
    letterSpacing: 0.3,
  },
  input: {
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 46,
    paddingHorizontal: 14,
    fontSize: 14,
    fontFamily: FONTS.interRegular,
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  cvvWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  eyeBtn: {
    width: 36,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.white4,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontFamily: FONTS.interMedium,
    color: COLORS.textMuted,
  },
  saveBtn: {
    flex: 2,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow({ color: COLORS.btnShadow, y: 4, blur: 12, opacity: 1, elevation: 6 }),
  },
  saveText: {
    fontSize: 14,
    fontFamily: FONTS.interSemiBold,
    color: COLORS.textPrimary,
  },
});
