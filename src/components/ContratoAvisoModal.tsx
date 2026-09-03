/**
 * ContratoAvisoModal — el destinatario toca una notificación de reporte /
 * advertencia / despido / renuncia y ve el último aviso que la otra parte
 * dejó en ese contrato laboral.
 *
 * Se abre por deep link "contratoAviso:<contratoId>" (ver notifRoute.ts +
 * FloatingTopBar.tsx). Lee `contratos_laborales/<id>` (ambas partes pueden
 * leerlo) y muestra el `ultimoAvisoEmpleado` si quien mira es el estudiante,
 * o el `ultimoAvisoEmpresa` si es la empresa. Solo lectura.
 */
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AutoText as Text } from './AutoText';
import { auth, db } from '../config/firebaseConfig';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import type { AvisoContrato } from '../services/contratoService';

interface Props {
  visible: boolean;
  contratoId: string | null;
  onClose: () => void;
}

const META: Record<AvisoContrato['tipo'], { titulo: string; icono: keyof typeof Ionicons.glyphMap; color: (c: GradlyColors) => string }> = {
  reporte: { titulo: 'Reporte de tu empresa', icono: 'flag', color: (c) => c.warning },
  advertencia: { titulo: 'Advertencia', icono: 'alert-circle', color: (c) => c.warning },
  despido: { titulo: 'Contrato finalizado', icono: 'close-circle', color: (c) => c.error },
  renuncia: { titulo: 'Renuncia recibida', icono: 'exit', color: (c) => c.error },
};

function fechaLegible(iso?: string): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  return new Date(ms).toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ContratoAvisoModal({ visible, contratoId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [datos, setDatos] = useState<{ aviso: AvisoContrato; puesto: string; contraparte: string } | null>(null);

  useEffect(() => {
    if (!visible || !contratoId) return;
    let cancel = false;
    setLoading(true);
    setDatos(null);

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'contratos_laborales', contratoId));
        if (cancel) return;
        if (!snap.exists()) { setDatos(null); return; }
        const d = snap.data() as any;
        const uid = auth.currentUser?.uid;
        const soyEmpresa = uid === d.empresaId;
        const aviso: AvisoContrato | null = soyEmpresa ? d.ultimoAvisoEmpresa : d.ultimoAvisoEmpleado;
        if (!aviso) { setDatos(null); return; }
        setDatos({
          aviso,
          puesto: d.vacanteTitulo || 'el puesto',
          contraparte: soyEmpresa ? (d.estudianteNombre || 'el empleado') : (d.empresaNombre || 'la empresa'),
        });
      } catch (e) {
        console.warn('[ContratoAviso] load', e);
        if (!cancel) setDatos(null);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => { cancel = true; };
  }, [visible, contratoId]);

  if (!visible) return null;

  const meta = datos ? META[datos.aviso.tipo] : null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.backBtn} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>{meta?.titulo ?? 'Aviso del contrato'}</Text>
          <View style={{ width: 32 }} />
        </View>

        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : !datos || !meta ? (
          <View style={s.center}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.textMuted} />
            <Text style={s.emptyText}>No hay un aviso para mostrar.</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            <View style={s.hero}>
              <View style={[s.iconWrap, { backgroundColor: `${meta.color(colors)}18`, borderColor: `${meta.color(colors)}55` }]}>
                <Ionicons name={meta.icono} size={28} color={meta.color(colors)} />
              </View>
              <Text style={[s.heroText, s.heroFuerte]} noTranslate>{datos.puesto} · {datos.contraparte}</Text>
              {!!fechaLegible(datos.aviso.fecha) && (
                <Text style={s.fecha} noTranslate>{fechaLegible(datos.aviso.fecha)}</Text>
              )}
            </View>

            <View style={[s.motivoBox, { borderColor: meta.color(colors) }]}>
              <Ionicons name="chatbubble-ellipses-outline" size={16} color={meta.color(colors)} />
              <View style={{ flex: 1 }}>
                <Text style={[s.motivoLabel, { color: meta.color(colors) }]}>Motivo</Text>
                <Text style={s.motivoText} noTranslate>{datos.aviso.texto}</Text>
              </View>
            </View>

            {datos.aviso.tipo === 'despido' && (
              <View style={s.infoBox}>
                <Ionicons name="information-circle-outline" size={15} color={colors.textMuted} />
                <Text style={s.infoText}>
                  Tu contrato quedó anulado. En "Mi Progreso" no verás un puesto activo hasta que vuelvas a ser contratado.
                </Text>
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
  hero: { alignItems: 'center', paddingVertical: 26, gap: 12, paddingHorizontal: 26 },
  iconWrap: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  heroText: { fontSize: 15, fontFamily: FONTS.interRegular, color: COLORS.textPrimary, textAlign: 'center', lineHeight: 22 },
  heroFuerte: { fontFamily: FONTS.interSemiBold },
  fecha: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  motivoBox: {
    flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 16, padding: 14,
    borderRadius: 14, backgroundColor: COLORS.backgroundCard, borderWidth: 1,
  },
  motivoLabel: { fontSize: 11, fontFamily: FONTS.interSemiBold, marginBottom: 3 },
  motivoText: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textPrimary, lineHeight: 18 },
  infoBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    marginHorizontal: 16, marginBottom: 20, padding: 14, borderRadius: 14,
    backgroundColor: COLORS.white4, borderWidth: 1, borderColor: COLORS.border,
  },
  infoText: { flex: 1, fontSize: 12.5, fontFamily: FONTS.interRegular, color: COLORS.textSecondary, lineHeight: 18 },
});
