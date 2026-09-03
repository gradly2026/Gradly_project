/**
 * OfertaEmpleoModal — el estudiante toca la notificación "Oferta de empleo"
 * y ve la vacante que una empresa le ofreció directamente (desde "Historial
 * de Pasantes"). Puede abrir chat, rechazarla con un motivo, o aceptarla.
 *
 * Aceptar NO crea el contrato: solo avisa a la empresa, que confirma la
 * contratación en "Recontratar Pasantes". Deep link: "ofertaEmpleo:<id>".
 */
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AutoText as Text, AutoTextInput as TextInput } from './AutoText';
import { auth, db } from '../config/firebaseConfig';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { useIniciarChat } from '../hooks/useIniciarChat';
import { textoHorario } from '../data/disponibilidad';
import { textoSalario } from '../utils/cupos';
import { responderOfertaEmpleo, type OfertaEmpleo } from '../services/contratoService';

interface Props {
  visible: boolean;
  ofertaId: string | null;
  onClose: () => void;
}

export default function OfertaEmpleoModal({ visible, ofertaId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const iniciarChat = useIniciarChat();

  const [loading, setLoading] = useState(true);
  const [oferta, setOferta] = useState<OfertaEmpleo | null>(null);
  const [vac, setVac] = useState<any | null>(null);
  const [modo, setModo] = useState<'ver' | 'rechazar'>('ver');
  const [motivo, setMotivo] = useState('');
  const [accion, setAccion] = useState<null | 'aceptar' | 'rechazar'>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!visible || !ofertaId) return;
    let cancel = false;
    setLoading(true); setOferta(null); setVac(null); setModo('ver'); setMotivo(''); setErr(''); setAccion(null);
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'ofertas_empleo', ofertaId));
        if (cancel) return;
        if (!snap.exists()) { setOferta(null); return; }
        const o = { id: snap.id, ...(snap.data() as any) } as OfertaEmpleo;
        setOferta(o);
        if (o.vacanteId) {
          try {
            const v = await getDoc(doc(db, 'vacantes', o.vacanteId));
            if (!cancel && v.exists()) setVac(v.data());
          } catch { /* la vacante extra es opcional */ }
        }
      } catch (e) {
        console.warn('[OfertaEmpleo] load', e);
        if (!cancel) setOferta(null);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [visible, ofertaId]);

  if (!visible) return null;

  const responder = async (decision: 'aceptada' | 'rechazada') => {
    if (!oferta) return;
    if (decision === 'rechazada' && motivo.trim().length < 5) {
      setErr('Escribe el motivo (mín. 5 caracteres).');
      return;
    }
    setAccion(decision === 'aceptada' ? 'aceptar' : 'rechazar');
    setErr('');
    try {
      const nombre = (auth.currentUser?.displayName as string) || oferta.estudianteNombre || 'Estudiante';
      await responderOfertaEmpleo({ oferta, estudianteNombre: nombre, decision, motivo });
      onClose();
    } catch (e: any) {
      setErr(e?.message || 'No se pudo enviar la respuesta.');
      setAccion(null);
    }
  };

  const salario = vac ? textoSalario(vac.salario_min, vac.salario_max) : null;
  const horario = vac ? textoHorario(vac.horario) : null;
  const yaRespondida = oferta && oferta.estado !== 'pendiente';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.backBtn} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Oferta de empleo</Text>
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
              <View style={s.iconWrap}><Ionicons name="briefcase" size={26} color={colors.primaryLight} /></View>
              <Text style={s.heroTitulo} noTranslate>{oferta.vacanteTitulo}</Text>
              <Text style={s.heroEmpresa} noTranslate>{oferta.empresaNombre}</Text>
            </View>

            <View style={s.chipsRow}>
              {!!oferta.area && <View style={s.chip}><Text style={s.chipTxt}>{oferta.area}</Text></View>}
              {!!vac?.modalidad && <View style={s.chip}><Text style={s.chipTxt}>{vac.modalidad}</Text></View>}
              {!!vac?.modalidad_contrato && <View style={s.chip}><Text style={s.chipTxt}>{vac.modalidad_contrato}</Text></View>}
              {!!salario && <View style={[s.chip, { backgroundColor: colors.success + '18', borderColor: colors.success + '44' }]}><Text style={[s.chipTxt, { color: colors.success }]} noTranslate>{salario}</Text></View>}
            </View>

            {!!vac?.descripcion && (
              <View style={s.box}>
                <Text style={s.boxLabel}>Descripción</Text>
                <Text style={s.boxTexto} noTranslate>{vac.descripcion}</Text>
              </View>
            )}
            {!!horario && (
              <View style={s.box}>
                <Text style={s.boxLabel}>Horario</Text>
                <Text style={s.boxTexto} noTranslate>{horario}</Text>
              </View>
            )}

            {yaRespondida ? (
              <View style={[s.estadoBox, oferta.estado === 'aceptada' ? { borderColor: colors.success } : { borderColor: colors.error }]}>
                <Ionicons
                  name={oferta.estado === 'aceptada' ? 'checkmark-circle' : 'close-circle'}
                  size={18}
                  color={oferta.estado === 'aceptada' ? colors.success : colors.error}
                />
                <Text style={s.estadoTxt}>
                  {oferta.estado === 'aceptada'
                    ? 'Ya aceptaste esta oferta. La empresa confirmará la contratación.'
                    : 'Ya rechazaste esta oferta.'}
                </Text>
              </View>
            ) : modo === 'rechazar' ? (
              <View style={s.accionBox}>
                <Text style={s.boxLabel}>Motivo del rechazo</Text>
                <TextInput
                  style={s.input}
                  value={motivo}
                  onChangeText={setMotivo}
                  placeholder="Cuéntale a la empresa por qué (mín. 5 caracteres)"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  selectionColor={colors.primary}
                />
                {!!err && <Text style={s.err}>{err}</Text>}
                <View style={s.botonesRow}>
                  <TouchableOpacity style={s.btnGhost} onPress={() => { setModo('ver'); setErr(''); }} disabled={!!accion}>
                    <Text style={s.btnGhostTxt}>Volver</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.btnSolido, { backgroundColor: colors.error }]} onPress={() => responder('rechazada')} disabled={!!accion}>
                    {accion === 'rechazar' ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.btnSolidoTxt}>Confirmar rechazo</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={s.accionBox}>
                {!!err && <Text style={s.err}>{err}</Text>}
                <TouchableOpacity
                  style={s.btnChat}
                  onPress={() => { iniciarChat({ uid: oferta.empresaId, nombre: oferta.empresaNombre, rol: 'empresa' }); onClose(); }}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.primaryLight} />
                  <Text style={s.btnChatTxt}>Chatear con la empresa</Text>
                </TouchableOpacity>
                <View style={s.botonesRow}>
                  <TouchableOpacity style={[s.btnGhost, { borderColor: colors.error }]} onPress={() => { setModo('rechazar'); setErr(''); }} disabled={!!accion}>
                    <Text style={[s.btnGhostTxt, { color: colors.error }]}>Rechazar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.btnSolido, { backgroundColor: colors.success }]} onPress={() => responder('aceptada')} disabled={!!accion}>
                    {accion === 'aceptar' ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.btnSolidoTxt}>Aceptar oferta</Text>}
                  </TouchableOpacity>
                </View>
              </View>
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
  hero: { alignItems: 'center', paddingVertical: 24, gap: 8, paddingHorizontal: 24 },
  iconWrap: {
    width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.primary + '1E', borderWidth: 1, borderColor: COLORS.primary + '55',
  },
  heroTitulo: { fontSize: 18, fontFamily: FONTS.soraBold, color: COLORS.textPrimary, textAlign: 'center' },
  heroEmpresa: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginHorizontal: 16, marginBottom: 14 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    backgroundColor: COLORS.primary + '14', borderWidth: 1, borderColor: COLORS.primary + '2E',
  },
  chipTxt: { fontSize: 11.5, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },
  box: {
    marginHorizontal: 16, marginBottom: 14, padding: 14, borderRadius: 14,
    backgroundColor: COLORS.backgroundCard, borderWidth: 1, borderColor: COLORS.border, gap: 6,
  },
  boxLabel: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  boxTexto: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textPrimary, lineHeight: 19 },
  estadoBox: {
    flexDirection: 'row', gap: 10, alignItems: 'center',
    marginHorizontal: 16, marginTop: 6, padding: 14, borderRadius: 14,
    backgroundColor: COLORS.backgroundCard, borderWidth: 1,
  },
  estadoTxt: { flex: 1, fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textPrimary, lineHeight: 18 },
  accionBox: { marginHorizontal: 16, marginTop: 6, gap: 10 },
  input: {
    minHeight: 84, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.backgroundSurface, padding: 12, textAlignVertical: 'top',
    fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textPrimary,
  },
  err: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: COLORS.error },
  botonesRow: { flexDirection: 'row', gap: 10 },
  btnGhost: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  btnGhostTxt: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: COLORS.textMuted },
  btnSolido: { flex: 1.3, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12 },
  btnSolidoTxt: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: '#fff' },
  btnChat: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: COLORS.primary + '44',
    backgroundColor: COLORS.primary + '12',
  },
  btnChatTxt: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },
});
