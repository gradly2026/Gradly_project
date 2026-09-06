// ════════════════════════════════════════════════════════════════════════
// DatosPersonalesFields.tsx — los campos personales del estudiante (v87)
// reutilizados por el modal de primer login (OnboardingDireccionModal) y por
// el modal recordatorio (CompletarPerfilModal). El formulario de 'Mi Perfil'
// (app/(tabs)/perfil.tsx) mantiene su propia copia inline, ya en producción.
//
// El documento de identidad (tipo + número) es dato privado: se pide aquí pero
// NUNCA se muestra en ninguna vista de perfil.
// ════════════════════════════════════════════════════════════════════════

import { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text, AutoTextInput as TextInput } from './AutoText';
import { useTranslation } from '../context/TranslationContext';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import {
  limpiarDocumento,
  limpiarTelefono,
  REGLAS_DOC,
  validarDocumento,
  validarTelefono,
} from '../utils/validacionesSV';

export type DocTipo = 'dui' | 'pasaporte' | 'licencia' | '';

export interface DatosPersonalesValue {
  telefono: string;
  docTipo: DocTipo;
  docNumero: string;
  facebook: string;
  instagram: string;
}

export const DATOS_PERSONALES_VACIO: DatosPersonalesValue = {
  telefono: '', docTipo: '', docNumero: '', facebook: '', instagram: '',
};

/** true cuando teléfono y documento están presentes Y con formato válido. */
export function datosPersonalesObligatoriosOk(v: DatosPersonalesValue): boolean {
  return !validarTelefono(v.telefono) && !validarDocumento(v.docTipo, v.docNumero);
}

/** Objeto listo para escribir en `perfiles_estudiantes` (Instagram sin `@`). */
export function datosPersonalesAFirestore(v: DatosPersonalesValue) {
  return {
    telefono: v.telefono.trim(),
    doc_tipo: v.docTipo,
    doc_numero: v.docNumero.trim(),
    facebook: v.facebook.trim(),
    instagram: v.instagram.trim().replace(/^@/, ''),
  };
}

export default function DatosPersonalesFields({
  value, onChange,
}: {
  value: DatosPersonalesValue;
  onChange: (patch: Partial<DatosPersonalesValue>) => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const s = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={{ gap: 8 }}>
      <Text style={s.label}>{t('campo_telefono')} *</Text>
      <TextInput
        style={s.input}
        value={value.telefono}
        onChangeText={v => onChange({ telefono: limpiarTelefono(v) })}
        placeholder="22223333"
        placeholderTextColor={colors.textMuted}
        keyboardType="phone-pad"
      />

      <Text style={[s.label, { marginTop: 6 }]}>{t('perfil_doc_identidad')} *</Text>
      <View style={s.chips}>
        {([['dui', t('perfil_doc_dui')], ['pasaporte', t('perfil_doc_pasaporte')], ['licencia', t('perfil_doc_licencia')]] as const).map(([k, lbl]) => {
          const on = value.docTipo === k;
          return (
            <TouchableOpacity
              key={k}
              style={[s.chip, on && s.chipOn]}
              onPress={() => onChange({ docTipo: on ? '' : k })}
              activeOpacity={0.8}
            >
              <Text style={[s.chipTxt, on && s.chipTxtOn]}>{lbl}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <TextInput
        style={s.input}
        value={value.docNumero}
        onChangeText={v => onChange({ docNumero: limpiarDocumento(v, value.docTipo) })}
        placeholder={t('perfil_doc_numero_ph')}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="characters"
      />
      {value.docTipo ? (
        <Text style={s.hint} noTranslate>{REGLAS_DOC[value.docTipo].hint}</Text>
      ) : null}

      <Text style={[s.label, { marginTop: 6 }]}>Facebook</Text>
      <TextInput
        style={s.input}
        value={value.facebook}
        onChangeText={v => onChange({ facebook: v })}
        placeholder="facebook.com/tu-perfil"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
      />

      <Text style={[s.label, { marginTop: 6 }]}>Instagram</Text>
      <TextInput
        style={s.input}
        value={value.instagram}
        onChangeText={v => onChange({ instagram: v })}
        placeholder="@tu.usuario"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
      />
    </View>
  );
}

const makeStyles = (COLORS: GradlyColors) =>
  StyleSheet.create({
    label: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: COLORS.textSecondary },
    input: {
      borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.backgroundCard,
      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
      fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textPrimary,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 8,
    },
    chipOn: { borderColor: COLORS.primary, backgroundColor: COLORS.primary12 },
    chipTxt: { fontSize: 12.5, fontFamily: FONTS.interRegular, color: COLORS.textSecondary },
    chipTxtOn: { color: COLORS.primaryLight, fontFamily: FONTS.interSemiBold },
    hint: { fontSize: 11.5, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  });
