// ════════════════════════════════════════════════════════════════════════
// ReportarIncidenciaEmpresaModal.tsx — el formulario con el que una EMPRESA
// reporta a un pasante suyo (llegadas tarde, ausencias, tareas sin cumplir…).
//
// Es hermano de ReportarIncidenciaModal.tsx (el del estudiante) y escribe en
// la MISMA colección `incidencias`, pero con `origen: 'empresa'`. La revisa la
// universidad del estudiante, que decide si lo notifica o lo escala a Gradly;
// el estudiante no la ve hasta ese momento. Ver incidenciaService.ts →
// crearIncidenciaEmpresa().
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text, AutoTextInput as TextInput } from './AutoText';
import { showAlert } from './AppAlert';
import { db } from '../config/firebaseConfig';
import { useTranslation } from '../context/TranslationContext';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { crearIncidenciaEmpresa, MOTIVOS_INCIDENCIA_EMPRESA } from '../services/incidenciaService';

/** Un pasante reportable — se arma en dashboard-empresa a partir de cupos,
 *  grupos y contrataciones individuales activas. */
export interface PasanteReportable {
  id: string;
  nombre: string;
  /** Si ya se conoce (cupos/grupo/aplicación lo traen); si no, se resuelve del perfil. */
  universidadId?: string | null;
}

export default function ReportarIncidenciaEmpresaModal({
  visible, onClose, onCreada, empresaId, empresaNombre, estudiantes,
}: {
  visible: boolean;
  onClose: () => void;
  onCreada?: () => void;
  empresaId: string;
  empresaNombre: string;
  estudiantes: PasanteReportable[];
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [estudianteId, setEstudianteId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [motivoOtro, setMotivoOtro] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const MIN_DESC = 10;

  // Cada apertura empieza en blanco. Si solo hay un pasante, queda preelegido.
  useEffect(() => {
    if (visible) {
      setEstudianteId(estudiantes.length === 1 ? estudiantes[0].id : null);
      setMotivo(''); setMotivoOtro(''); setDescripcion(''); setError('');
    }
  }, [visible, estudiantes]);

  const motivoFinal = motivo === 'Otro' ? motivoOtro.trim() : motivo;
  const elegido = estudiantes.find(e => e.id === estudianteId) ?? null;

  const enviar = async () => {
    if (enviando) return;
    if (!elegido) { setError(t('inc_emp_campo_estudiante')); return; }
    if (!motivo) { setError(t('inc_campo_motivo')); return; }
    if (motivo === 'Otro' && motivoFinal.length < 3) { setError(t('inc_motivo_otro_placeholder')); return; }
    if (descripcion.trim().length < MIN_DESC) {
      setError(`${descripcion.trim().length}/${MIN_DESC}`);
      return;
    }

    setEnviando(true); setError('');
    try {
      // La universidad: la que traiga el pasante, o se resuelve de su perfil.
      let universidadId = elegido.universidadId ?? '';
      if (!universidadId) {
        try {
          const snap = await getDoc(doc(db, 'perfiles_estudiantes', elegido.id));
          universidadId = (snap.data() as any)?.universidad_id ?? '';
        } catch { /* se envía con '' — la incidencia igual queda registrada */ }
      }

      await Promise.race([
        crearIncidenciaEmpresa({
          estudianteId: elegido.id,
          estudianteNombre: elegido.nombre,
          universidadId,
          empresaId,
          empresaNombre,
          motivo: motivoFinal,
          descripcion,
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error(t('error_generico'))), 15000)),
      ]);
      onCreada?.();
      showAlert(t('inc_emp_ok_titulo'), t('inc_emp_ok_msg'));
      onClose();
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      setError(
        msg.includes('insufficient permissions')
          ? t('error_generico')
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
            <Text style={s.titulo}>{t('inc_emp_titulo')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
            <Text style={s.ayuda}>{t('inc_emp_ayuda')}</Text>

            {/* 1) Estudiante */}
            <View style={{ gap: 8 }}>
              <Text style={s.label}>{t('inc_emp_campo_estudiante')}</Text>
              {estudiantes.length === 0 ? (
                <Text style={s.nota}>{t('inc_emp_sin_pasantes')}</Text>
              ) : (
                <View style={{ gap: 6 }}>
                  {estudiantes.map(e => {
                    const activo = estudianteId === e.id;
                    return (
                      <TouchableOpacity
                        key={e.id}
                        style={[s.estRow, activo && s.estRowActiva]}
                        onPress={() => setEstudianteId(e.id)}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name={activo ? 'radio-button-on' : 'radio-button-off'}
                          size={16}
                          color={activo ? colors.primaryLight : colors.textMuted}
                        />
                        <Text style={[s.estTxt, activo && s.estTxtActiva]} numberOfLines={1} noTranslate>
                          {e.nombre}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            {/* 2) Motivo */}
            <View style={{ gap: 8 }}>
              <Text style={s.label}>{t('inc_campo_motivo')}</Text>
              <View style={s.motivosWrap}>
                {MOTIVOS_INCIDENCIA_EMPRESA.map(mo => {
                  const activo = motivo === mo;
                  return (
                    <TouchableOpacity
                      key={mo}
                      style={[s.motivoChip, activo && s.motivoChipActivo]}
                      onPress={() => setMotivo(mo)}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.motivoTxt, activo && s.motivoTxtActivo]}>{mo}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {motivo === 'Otro' && (
                <TextInput
                  style={[s.input, { minHeight: 44 }]}
                  value={motivoOtro}
                  onChangeText={setMotivoOtro}
                  placeholder={t('inc_motivo_otro_placeholder')}
                  placeholderTextColor={colors.textMuted}
                  selectionColor={colors.primary}
                />
              )}
            </View>

            {/* 3) Descripción */}
            <View style={{ gap: 6 }}>
              <Text style={s.label}>{t('inc_campo_descripcion')}</Text>
              <TextInput
                style={s.input}
                value={descripcion}
                onChangeText={setDescripcion}
                placeholder={t('inc_emp_desc_placeholder')}
                placeholderTextColor={colors.textMuted}
                multiline
                selectionColor={colors.primary}
              />
              {descripcion.trim().length < MIN_DESC && (
                <Text style={s.contador} noTranslate>{`${descripcion.trim().length}/${MIN_DESC}`}</Text>
              )}
            </View>

            {!!error && <Text style={s.error}>{error}</Text>}

            <Text style={s.aviso}>{t('inc_emp_aviso')}</Text>

            <TouchableOpacity
              style={[s.btn, enviando && s.btnOff]}
              disabled={enviando}
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
    nota: { fontSize: 12.5, fontFamily: FONTS.interRegular, color: COLORS.textMuted },

    estRow: {
      flexDirection: 'row', alignItems: 'center', gap: 9,
      borderWidth: 1, borderColor: COLORS.border, borderRadius: 11,
      paddingHorizontal: 12, paddingVertical: 11,
    },
    estRowActiva: { borderColor: COLORS.primary, backgroundColor: COLORS.primary12 },
    estTxt: { flex: 1, fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textSecondary },
    estTxtActiva: { color: COLORS.primaryLight, fontFamily: FONTS.interSemiBold },

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
