/**
 * IncidenciaAvisoModal — el ESTUDIANTE toca una notificación de incidencia
 * (una que abrió su empresa y que su universidad le notificó o escaló) y ve el
 * acuse: el motivo, lo que reportó la empresa y qué se le pide.
 *
 * Se abre por deep link "incidencia:<id>" (ver notifRoute.ts + FloatingTopBar).
 * Lee `incidencias/<id>` (el estudiante puede leer las suyas) — solo lectura,
 * el hilo y las respuestas viven en la bandeja de incidencias.
 */
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import { db } from '../config/firebaseConfig';
import { useTranslation } from '../context/TranslationContext';
import { FONTS, useTheme, webScrollStyle, type GradlyColors } from '../context/ThemeContext';
import type { Incidencia } from '../services/incidenciaService';

interface Props {
  visible: boolean;
  incidenciaId: string | null;
  onClose: () => void;
}

export default function IncidenciaAvisoModal({ visible, incidenciaId, onClose }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [inc, setInc] = useState<Incidencia | null>(null);

  useEffect(() => {
    if (!visible || !incidenciaId) return;
    let cancel = false;
    setLoading(true);
    setInc(null);
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'incidencias', incidenciaId));
        if (cancel) return;
        setInc(snap.exists() ? ({ id: snap.id, ...snap.data() } as Incidencia) : null);
      } catch (e) {
        console.warn('[IncidenciaAviso] load', e);
        if (!cancel) setInc(null);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [visible, incidenciaId]);

  if (!visible) return null;

  const escalada = inc?.estado === 'escalada';
  const color = escalada ? colors.error : colors.warning;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.hoja}>
          <View style={s.header}>
            <Ionicons name={escalada ? 'alert-circle' : 'notifications'} size={18} color={color} />
            <Text style={s.titulo}>{t('inc_aviso_est_titulo')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>
          ) : !inc ? (
            <View style={s.center}>
              <Ionicons name="alert-circle-outline" size={38} color={colors.textMuted} />
              <Text style={s.vacio}>{t('inc_aviso_est_vacio')}</Text>
            </View>
          ) : (
            <ScrollView style={webScrollStyle(colors)} contentContainerStyle={{ padding: 16, gap: 14 }}>
              <View style={[s.mensajeBox, { borderColor: color }]}>
                <Text style={s.mensajeTxt}>
                  {escalada ? t('inc_aviso_est_escalado') : t('inc_aviso_est_notificado')}
                </Text>
              </View>

              <View style={{ gap: 4 }}>
                <Text style={s.label}>{t('inc_aviso_est_motivo')}</Text>
                <Text style={s.valor} noTranslate>{inc.motivo}</Text>
              </View>

              {!!inc.empresa_nombre && (
                <View style={{ gap: 4 }}>
                  <Text style={s.label}>{t('inc_empresa')}</Text>
                  <Text style={s.valor} noTranslate>{inc.empresa_nombre}</Text>
                </View>
              )}

              {!!inc.descripcion && (
                <View style={{ gap: 4 }}>
                  <Text style={s.label}>{t('inc_descripcion')}</Text>
                  <Text style={s.texto} noTranslate>{inc.descripcion}</Text>
                </View>
              )}

              <TouchableOpacity style={s.btn} onPress={onClose} activeOpacity={0.85}>
                <Text style={s.btnTxt}>{t('inc_aviso_est_entendido')}</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (COLORS: GradlyColors) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 18 },
    hoja: {
      maxHeight: '86%', maxWidth: 520, width: '100%', alignSelf: 'center',
      backgroundColor: COLORS.backgroundCard,
      borderRadius: 18, borderWidth: 1, borderColor: COLORS.border,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 16, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: COLORS.border,
    },
    titulo: { flex: 1, fontSize: 15, fontFamily: FONTS.soraSemiBold, color: COLORS.textPrimary },
    center: { paddingVertical: 40, alignItems: 'center', gap: 10 },
    vacio: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textMuted },

    mensajeBox: {
      borderLeftWidth: 3, borderRadius: 10, padding: 12,
      backgroundColor: COLORS.backgroundSurface,
    },
    mensajeTxt: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textPrimary, lineHeight: 19 },

    label: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
    valor: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
    texto: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textSecondary, lineHeight: 19 },

    btn: {
      marginTop: 6, backgroundColor: COLORS.primary, borderRadius: 12,
      paddingVertical: 12, alignItems: 'center',
    },
    btnTxt: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: '#FFF' },
  });
