// ════════════════════════════════════════════════════════════════════════
// ReportarIncidenciaModal.tsx — el formulario con el que un ESTUDIANTE abre
// una incidencia sobre su práctica.
//
// GUÍA PARA PRINCIPIANTES:
// Es hermano de ReportarUsuarioModal.tsx, pero no es lo mismo y conviene tener
// clara la diferencia antes de tocar cualquiera de los dos: aquel denuncia la
// CONDUCTA de una persona y va solo al admin; este reporta un PROBLEMA DE LA
// PRÁCTICA y lo ven la universidad y (si va sobre ella) la empresa, que son
// quienes pueden arreglarlo. Ver la cabecera de incidenciaService.ts.
//
// El campo que de verdad decide el destino es `categoria`: por eso se pregunta
// primero y en botones grandes, no escondido en una lista.
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text, AutoTextInput as TextInput } from './AutoText';
import { useTranslation } from '../context/TranslationContext';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import {
  crearIncidencia,
  MOTIVOS_INCIDENCIA,
  type CategoriaIncidencia,
} from '../services/incidenciaService';

const CATEGORIAS: { key: CategoriaIncidencia; icon: keyof typeof Ionicons.glyphMap; clave: string }[] = [
  { key: 'empresa',     icon: 'business-outline', clave: 'inc_cat_empresa' },
  { key: 'universidad', icon: 'school-outline',   clave: 'inc_cat_universidad' },
  { key: 'plataforma',  icon: 'phone-portrait-outline', clave: 'inc_cat_plataforma' },
  { key: 'otro',        icon: 'ellipsis-horizontal', clave: 'inc_cat_otro' },
];

export default function ReportarIncidenciaModal({
  visible, onClose, onCreada, estudianteNombre, universidadId, empresaId, empresaNombre,
}: {
  visible: boolean;
  onClose: () => void;
  onCreada?: () => void;
  estudianteNombre: string;
  universidadId?: string | null;
  /** Empresa de su práctica actual, si tiene una. Sin ella, la categoría
   *  "empresa" no se ofrece: no habría a quién dirigir el reclamo. */
  empresaId?: string | null;
  empresaNombre?: string | null;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [categoria, setCategoria] = useState<CategoriaIncidencia | null>(null);
  const [motivo, setMotivo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  // Cada apertura empieza en blanco: sin esto, reabrir el formulario tras
  // enviar mostraría el reporte anterior a medio llenar.
  useEffect(() => {
    if (visible) { setCategoria(null); setMotivo(''); setDescripcion(''); setError(''); }
  }, [visible]);

  const categorias = CATEGORIAS.filter(c => c.key !== 'empresa' || !!empresaId);
  const listo = !!categoria && !!motivo && descripcion.trim().length >= 15;

  const enviar = async () => {
    if (enviando) return;
    setEnviando(true); setError('');
    try {
      // `Promise.race` con un tope: si por lo que sea la escritura se cuelga
      // (red caída a medias, etc.), el botón no se queda girando para siempre.
      await Promise.race([
        crearIncidencia({
          estudianteNombre,
          universidadId: universidadId ?? '',
          empresaId,
          empresaNombre,
          categoria: categoria!,
          motivo,
          descripcion,
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('La solicitud tardó demasiado. Revisa tu conexión e inténtalo de nuevo.')), 15000)),
      ]);
      onCreada?.();
      onClose();
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      setError(
        msg.includes('insufficient permissions')
          ? 'No se pudo registrar la incidencia (permisos). Inténtalo de nuevo en un momento.'
          : msg || t('error_generico'),
      );
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.hoja}>
          <View style={s.header}>
            <Text style={s.titulo}>{t('inc_reportar_titulo')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
            <Text style={s.ayuda}>{t('inc_reportar_ayuda')}</Text>

            {/* 1) Categoría — decide a quién le llega */}
            <View style={{ gap: 8 }}>
              <Text style={s.label}>{t('inc_campo_sobre_que')}</Text>
              <View style={s.catGrid}>
                {categorias.map(c => {
                  const activa = categoria === c.key;
                  return (
                    <TouchableOpacity
                      key={c.key}
                      style={[s.catBtn, activa && s.catBtnActiva]}
                      onPress={() => setCategoria(c.key)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name={c.icon} size={16} color={activa ? colors.primaryLight : colors.textMuted} />
                      <Text style={[s.catTxt, activa && s.catTxtActiva]}>{t(c.clave)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {categoria === 'empresa' && !!empresaNombre && (
                <Text style={s.nota} noTranslate>{empresaNombre}</Text>
              )}
            </View>

            {/* 2) Motivo */}
            <View style={{ gap: 8 }}>
              <Text style={s.label}>{t('inc_campo_motivo')}</Text>
              <View style={s.motivosWrap}>
                {MOTIVOS_INCIDENCIA.map(m => {
                  const activo = motivo === m;
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[s.motivoChip, activo && s.motivoChipActivo]}
                      onPress={() => setMotivo(m)}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.motivoTxt, activo && s.motivoTxtActivo]}>{m}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* 3) Descripción */}
            <View style={{ gap: 6 }}>
              <Text style={s.label}>{t('inc_campo_descripcion')}</Text>
              <TextInput
                style={s.input}
                value={descripcion}
                onChangeText={setDescripcion}
                placeholder={t('inc_descripcion_placeholder')}
                placeholderTextColor={colors.textMuted}
                multiline
                selectionColor={colors.primary}
              />
              {/* El contador solo aparece mientras falta: cumplido el mínimo,
                  dejar de contar es una señal de "ya está bien". */}
              {descripcion.trim().length < 15 && (
                <Text style={s.contador} noTranslate>{`${descripcion.trim().length}/15`}</Text>
              )}
            </View>

            {!!error && <Text style={s.error}>{error}</Text>}

            <Text style={s.aviso}>
              {categoria === 'empresa' ? t('inc_aviso_empresa') : t('inc_aviso_universidad')}
            </Text>

            <TouchableOpacity
              style={[s.btn, (!listo || enviando) && s.btnOff]}
              disabled={!listo || enviando}
              onPress={enviar}
            >
              {enviando
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Text style={s.btnTxt}>{t('inc_enviar')}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (COLORS: GradlyColors) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 18 },
    hoja: {
      maxHeight: '88%', maxWidth: 560, width: '100%', alignSelf: 'center',
      backgroundColor: COLORS.backgroundCard,
      borderRadius: 18, borderWidth: 1, borderColor: COLORS.border,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 16, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: COLORS.border,
    },
    titulo: { flex: 1, fontSize: 16, fontFamily: FONTS.soraSemiBold, color: COLORS.textPrimary },
    ayuda: { fontSize: 12.5, fontFamily: FONTS.interRegular, color: COLORS.textMuted, lineHeight: 18 },
    label: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },

    catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    catBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 7,
      borderWidth: 1, borderColor: COLORS.border, borderRadius: 11,
      paddingHorizontal: 12, paddingVertical: 10,
    },
    catBtnActiva: { borderColor: COLORS.primary, backgroundColor: COLORS.primary12 },
    catTxt: { fontSize: 12.5, fontFamily: FONTS.interRegular, color: COLORS.textSecondary },
    catTxtActiva: { color: COLORS.primaryLight, fontFamily: FONTS.interSemiBold },
    nota: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted },

    motivosWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    motivoChip: {
      borderWidth: 1, borderColor: COLORS.border, borderRadius: 9,
      paddingHorizontal: 10, paddingVertical: 7,
    },
    motivoChipActivo: { borderColor: COLORS.primary, backgroundColor: COLORS.primary12 },
    motivoTxt: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textSecondary },
    motivoTxtActivo: { color: COLORS.primaryLight, fontFamily: FONTS.interSemiBold },

    input: {
      borderWidth: 1, borderColor: COLORS.border, borderRadius: 11,
      paddingHorizontal: 12, paddingVertical: 10,
      minHeight: 96, textAlignVertical: 'top',
      fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textPrimary,
    },
    contador: { alignSelf: 'flex-end', fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted },

    aviso: { fontSize: 11.5, fontFamily: FONTS.interRegular, color: COLORS.textMuted, lineHeight: 17 },
    error: { fontSize: 12.5, fontFamily: FONTS.interRegular, color: COLORS.error },

    btn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
    btnOff: { opacity: 0.45 },
    btnTxt: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: '#FFF' },
  });
