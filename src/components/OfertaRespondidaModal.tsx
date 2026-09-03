/**
 * OfertaRespondidaModal — la empresa toca la notificación "Oferta aceptada" /
 * "Oferta rechazada" y ve la respuesta del estudiante a una oferta de empleo.
 * Si la aceptó, un botón la lleva a su panel para confirmar la contratación en
 * "Recontratar Pasantes". Deep link: "ofertaRespondida:<id>".
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AutoText as Text } from './AutoText';
import { db } from '../config/firebaseConfig';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import type { OfertaEmpleo } from '../services/contratoService';

interface Props {
  visible: boolean;
  ofertaId: string | null;
  onClose: () => void;
}

export default function OfertaRespondidaModal({ visible, ofertaId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [oferta, setOferta] = useState<OfertaEmpleo | null>(null);

  useEffect(() => {
    if (!visible || !ofertaId) return;
    let cancel = false;
    setLoading(true); setOferta(null);
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'ofertas_empleo', ofertaId));
        if (!cancel) setOferta(snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as OfertaEmpleo) : null);
      } catch (e) {
        console.warn('[OfertaRespondida] load', e);
        if (!cancel) setOferta(null);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [visible, ofertaId]);

  if (!visible) return null;

  const aceptada = oferta?.estado === 'aceptada';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.backBtn} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>{aceptada ? 'Oferta aceptada' : 'Respuesta a tu oferta'}</Text>
          <View style={{ width: 32 }} />
        </View>

        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : !oferta ? (
          <View style={s.center}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.textMuted} />
            <Text style={s.emptyText}>No se encontró esta oferta.</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            <View style={s.hero}>
              <View style={[s.iconWrap, aceptada ? { backgroundColor: colors.success + '1E', borderColor: colors.success + '55' } : { backgroundColor: colors.error + '18', borderColor: colors.error + '55' }]}>
                <Ionicons name={aceptada ? 'checkmark-circle' : 'close-circle'} size={28} color={aceptada ? colors.success : colors.error} />
              </View>
              <Text style={s.heroTexto}>
                <Text style={s.heroFuerte} noTranslate>{oferta.estudianteNombre}</Text>{' '}
                {aceptada ? 'aceptó tu oferta para' : 'rechazó tu oferta para'}
              </Text>
              <Text style={[s.heroTexto, s.heroFuerte]} noTranslate>{oferta.vacanteTitulo}</Text>
            </View>

            {!aceptada && !!oferta.motivoRechazo && (
              <View style={s.motivoBox}>
                <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.error} />
                <View style={{ flex: 1 }}>
                  <Text style={s.motivoLabel}>Motivo</Text>
                  <Text style={s.motivoTxt} noTranslate>{oferta.motivoRechazo}</Text>
                </View>
              </View>
            )}

            {aceptada && (
              <View style={s.infoBox}>
                <Ionicons name="information-circle-outline" size={16} color={colors.primaryLight} />
                <Text style={s.infoTxt}>
                  Para completar la contratación, ve a Reclutamiento → "Recontratar Pasantes" y pulsa Contratar en su tarjeta.
                </Text>
              </View>
            )}

            {aceptada && (
              <TouchableOpacity
                style={s.btn}
                onPress={() => { router.push('/dashboard-empresa' as any); onClose(); }}
                activeOpacity={0.9}
              >
                <Ionicons name="people" size={16} color="#fff" />
                <Text style={s.btnTxt}>Ir a mi panel</Text>
              </TouchableOpacity>
            )}
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
  hero: { alignItems: 'center', paddingVertical: 26, gap: 12, paddingHorizontal: 26 },
  iconWrap: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  heroTexto: { fontSize: 15, fontFamily: FONTS.interRegular, color: COLORS.textPrimary, textAlign: 'center', lineHeight: 22 },
  heroFuerte: { fontFamily: FONTS.interSemiBold },
  motivoBox: {
    flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 16, padding: 14,
    borderRadius: 14, backgroundColor: COLORS.error + '12', borderWidth: 1, borderColor: COLORS.error,
  },
  motivoLabel: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: COLORS.error, marginBottom: 3 },
  motivoTxt: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textPrimary, lineHeight: 18 },
  infoBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    marginHorizontal: 16, marginBottom: 16, padding: 14, borderRadius: 14,
    backgroundColor: COLORS.primary + '10', borderWidth: 1, borderColor: COLORS.primary + '33',
  },
  infoTxt: { flex: 1, fontSize: 12.5, fontFamily: FONTS.interRegular, color: COLORS.textPrimary, lineHeight: 18 },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14,
    marginHorizontal: 16,
  },
  btnTxt: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: '#fff' },
});
