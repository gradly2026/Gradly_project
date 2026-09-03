/**
 * PostulacionRechazadaModal — el estudiante toca la notificación "Postulación
 * no seleccionada" y ve a qué vacante se había postulado y el motivo con que
 * la empresa la descartó.
 *
 * Se abre por deep link "postulacionRechazada:<aplicacionId>" (ver
 * notifRoute.ts + FloatingTopBar.tsx). Lee el documento de `apliciones/<id>`
 * (el estudiante puede leer las suyas) y, para el nombre de la empresa, el
 * perfil público de la empresa. Solo lectura.
 *
 * Mismo patrón base que VacanteDetailByIdModal / ReclamoDetailModal.
 */
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AutoText as Text } from './AutoText';
import { db } from '../config/firebaseConfig';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';

interface Props {
  visible: boolean;
  aplicacionId: string | null;
  onClose: () => void;
}

export default function PostulacionRechazadaModal({ visible, aplicacionId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [datos, setDatos] = useState<{ vacante: string; empresa: string; motivo: string } | null>(null);

  useEffect(() => {
    if (!visible || !aplicacionId) return;
    let cancel = false;
    setLoading(true);
    setDatos(null);

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'aplicaciones', aplicacionId));
        if (cancel) return;
        if (!snap.exists()) { setDatos(null); return; }
        const d = snap.data() as any;
        let empresa = d.empresa_nombre || '';
        if (!empresa && d.empresa_id) {
          try {
            const e = await getDoc(doc(db, 'perfiles_empresas', d.empresa_id));
            if (!cancel && e.exists()) empresa = (e.data() as any).nombre_empresa ?? '';
          } catch { /* best-effort */ }
        }
        if (!cancel) {
          setDatos({
            vacante: d.titulo_vacante || 'la vacante',
            empresa: empresa || 'la empresa',
            motivo: d.motivo_rechazo || '',
          });
        }
      } catch (e) {
        console.warn('[PostulacionRechazada] load', e);
        if (!cancel) setDatos(null);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => { cancel = true; };
  }, [visible, aplicacionId]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.backBtn} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Postulación no seleccionada</Text>
          <View style={{ width: 32 }} />
        </View>

        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : !datos ? (
          <View style={s.center}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.textMuted} />
            <Text style={s.emptyText}>No se encontró esta postulación.</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            <View style={s.hero}>
              <View style={s.iconWrap}>
                <Ionicons name="close-circle-outline" size={30} color={colors.error} />
              </View>
              <Text style={[s.heroText, s.heroFuerte]} noTranslate>{datos.vacante} · {datos.empresa}</Text>
              <Text style={s.heroText}>Tu postulación no fue seleccionada esta vez.</Text>
            </View>

            {!!datos.motivo && (
              <View style={s.motivoBox}>
                <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.error} />
                <View style={{ flex: 1 }}>
                  <Text style={s.motivoLabel}>Motivo de la empresa</Text>
                  <Text style={s.motivoText} noTranslate>{datos.motivo}</Text>
                </View>
              </View>
            )}

            <View style={s.animoBox}>
              <Ionicons name="sparkles-outline" size={16} color={colors.primaryLight} />
              <Text style={s.animoText}>
                No te desanimes: sigue habiendo vacantes abiertas. Revisa las oportunidades y postúlate a las que encajen con tu carrera y tus skills.
              </Text>
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const makeStyles = (COLORS: GradlyColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.backgroundDark },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyText: { fontSize: 14, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  hero: { alignItems: 'center', paddingVertical: 26, gap: 14, paddingHorizontal: 26 },
  iconWrap: {
    width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center',
    backgroundColor: `${COLORS.error}18`, borderWidth: 1, borderColor: `${COLORS.error}55`,
  },
  heroText: { fontSize: 15, fontFamily: FONTS.interRegular, color: COLORS.textPrimary, textAlign: 'center', lineHeight: 22 },
  heroFuerte: { fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  motivoBox: {
    flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 16, padding: 14,
    borderRadius: 14, backgroundColor: `${COLORS.error}12`, borderWidth: 1, borderColor: COLORS.error,
  },
  motivoLabel: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: COLORS.error, marginBottom: 3 },
  motivoText: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textPrimary, lineHeight: 18 },
  animoBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    marginHorizontal: 16, marginBottom: 20, padding: 14, borderRadius: 14,
    backgroundColor: `${COLORS.primary}12`, borderWidth: 1, borderColor: `${COLORS.primary}44`,
  },
  animoText: { flex: 1, fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textPrimary, lineHeight: 18 },
});
