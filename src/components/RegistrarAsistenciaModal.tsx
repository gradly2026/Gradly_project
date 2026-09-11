import { Ionicons } from '@expo/vector-icons';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import {
  registrarAsistenciaConCodigo,
  AsistenciaCodigoError,
  type ConfirmacionAsistencia,
} from '../services/asistenciaCodigoService';

// ════════════════════════════════════════════════════════════════════
//  RegistrarAsistenciaModal — la empresa (o su tutor, desde esta misma
//  cuenta) ingresa el código de 8 dígitos que le mostró el pasante. Al
//  completar los 8 dígitos se valida solo (sin botón "Enviar"): bordes
//  verdes + tarjeta con los datos del estudiante si es válido, bordes rojos
//  + motivo si no. "Reintentar" limpia el campo para probar de nuevo.
// ════════════════════════════════════════════════════════════════════

interface Props {
  visible: boolean;
  onClose: () => void;
}

const MENSAJE_POR_TIPO: Record<string, string> = {
  'no-encontrado': 'Código no encontrado. Verifica que esté bien escrito.',
  'otra-empresa': 'Este código no pertenece a un pasante de tu empresa.',
  usado: 'Este código ya fue usado.',
  caducado: 'Este código ya caducó (los códigos son de un solo día).',
  otro: 'No se pudo registrar la asistencia. Intenta de nuevo.',
};

export default function RegistrarAsistenciaModal({ visible, onClose }: Props) {
  const { colors: C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  const [codigo, setCodigo] = useState('');
  const [estado, setEstado] = useState<'idle' | 'cargando' | 'ok' | 'error'>('idle');
  const [resultado, setResultado] = useState<ConfirmacionAsistencia | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef<TextInput>(null);

  const reiniciar = () => {
    setCodigo('');
    setEstado('idle');
    setResultado(null);
    setErrorMsg('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const cerrar = () => {
    reiniciar();
    onClose();
  };

  const onChangeCodigo = async (texto: string) => {
    const limpio = texto.replace(/\D/g, '').slice(0, 8);
    setCodigo(limpio);
    if (estado === 'error' || estado === 'ok') {
      setEstado('idle');
      setResultado(null);
      setErrorMsg('');
    }
    if (limpio.length === 8) {
      setEstado('cargando');
      try {
        const r = await registrarAsistenciaConCodigo(limpio);
        setResultado(r);
        setEstado('ok');
      } catch (e) {
        const tipo = e instanceof AsistenciaCodigoError ? e.tipo : 'otro';
        setErrorMsg(MENSAJE_POR_TIPO[tipo] ?? MENSAJE_POR_TIPO.otro);
        setEstado('error');
      }
    }
  };

  if (!visible) return null;

  const borderColor = estado === 'ok' ? C.success : estado === 'error' ? C.error : C.border;
  const rango = resultado?.estudiante.horaInicio && resultado?.estudiante.horaFin
    ? `${resultado.estudiante.horaInicio} - ${resultado.estudiante.horaFin}`
    : null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={cerrar}>
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.headerRow}>
            <Text style={s.titulo}>Registrar asistencia</Text>
            <TouchableOpacity onPress={cerrar} hitSlop={10}>
              <Ionicons name="close" size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>
          <Text style={s.subtitulo}>Pídele al pasante su código de 8 dígitos y escríbelo aquí.</Text>

          <View style={[s.inputBox, { borderColor }]}>
            <TextInput
              ref={inputRef}
              style={s.input}
              value={codigo}
              onChangeText={onChangeCodigo}
              placeholder="00000000"
              placeholderTextColor={C.textMuted}
              keyboardType="number-pad"
              maxLength={8}
              editable={estado !== 'cargando'}
              autoFocus
            />
            {estado === 'cargando' && <ActivityIndicator size="small" color={C.primary} style={{ marginLeft: 8 }} />}
            {estado === 'ok' && <Ionicons name="checkmark-circle" size={22} color={C.success} />}
            {estado === 'error' && <Ionicons name="close-circle" size={22} color={C.error} />}
          </View>

          {estado === 'error' && (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={C.error} />
              <Text style={s.errorTxt}>{errorMsg}</Text>
            </View>
          )}

          {estado === 'ok' && resultado && (
            <View style={[s.infoCard, { borderColor: C.success + '55' }]}>
              <Text style={s.infoNombre} numberOfLines={1} noTranslate>{resultado.estudiante.nombre}</Text>
              {!!resultado.estudiante.universidadNombre && (
                <Text style={s.infoLinea} numberOfLines={1} noTranslate>{resultado.estudiante.universidadNombre}</Text>
              )}
              {!!resultado.estudiante.carrera && (
                <Text style={s.infoLinea} numberOfLines={1} noTranslate>{resultado.estudiante.carrera}</Text>
              )}
              {!!resultado.estudiante.vacanteTitulo && (
                <Text style={s.infoLinea} numberOfLines={1} noTranslate>{resultado.estudiante.vacanteTitulo}</Text>
              )}
              <View style={s.infoDivider} />
              <Text style={s.infoLinea} noTranslate>
                {resultado.estudiante.diaN != null ? `Día ${resultado.estudiante.diaN}` : ''}
                {rango ? ` · ${rango}` : ''}
              </Text>
              <View style={s.okRow}>
                <Ionicons name="checkmark-circle" size={15} color={C.success} />
                <Text style={[s.okTxt, resultado.estado === 'tarde' && { color: C.warning }]}>
                  {resultado.estado === 'tarde'
                    ? `Asistencia registrada · llegó ${resultado.tardanzaMin} min tarde`
                    : 'Asistencia registrada'}
                </Text>
              </View>
            </View>
          )}

          {(estado === 'ok' || estado === 'error') && (
            <TouchableOpacity style={s.btnSecundario} activeOpacity={0.85} onPress={reiniciar}>
              <Ionicons name="refresh-outline" size={16} color={C.primaryLight} />
              <Text style={s.btnSecundarioTxt}>Registrar otro pasante</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (C: GradlyColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1, backgroundColor: 'rgba(7,5,15,0.75)',
      justifyContent: 'center', alignItems: 'center', padding: 20,
    },
    card: {
      width: '100%', maxWidth: 400,
      backgroundColor: C.backgroundCard,
      borderRadius: 22, borderWidth: 1, borderColor: C.border,
      padding: 20,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    titulo: { fontSize: 16, fontFamily: FONTS.soraBold, color: C.textPrimary },
    subtitulo: {
      fontSize: 12, fontFamily: FONTS.interRegular, color: C.textSecondary,
      lineHeight: 17, marginTop: 8, marginBottom: 16,
    },
    inputBox: {
      flexDirection: 'row', alignItems: 'center',
      borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4,
      backgroundColor: C.backgroundSurface,
    },
    input: {
      flex: 1, fontSize: 22, fontFamily: FONTS.soraBold, color: C.textPrimary,
      letterSpacing: 4, paddingVertical: 10,
    },
    errorBox: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10,
      backgroundColor: C.error + '18', borderWidth: 1, borderColor: C.error + '40',
      borderRadius: 12, padding: 11,
    },
    errorTxt: { flex: 1, fontSize: 12, fontFamily: FONTS.interRegular, color: C.textPrimary, lineHeight: 17 },
    infoCard: {
      marginTop: 12, borderWidth: 1, borderRadius: 14, padding: 14, gap: 3,
      backgroundColor: C.success + '10',
    },
    infoNombre: { fontSize: 14.5, fontFamily: FONTS.interSemiBold, color: C.textPrimary },
    infoLinea: { fontSize: 12, fontFamily: FONTS.interRegular, color: C.textSecondary },
    infoDivider: { height: 1, backgroundColor: C.border, marginVertical: 6 },
    okRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
    okTxt: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: C.success },
    btnSecundario: {
      marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
      borderRadius: 13, borderWidth: 1, borderColor: C.border, paddingVertical: 12,
    },
    btnSecundarioTxt: { color: C.primaryLight, fontFamily: FONTS.interSemiBold, fontSize: 13 },
  });
