// ════════════════════════════════════════════════════════════════════════
// CompletarPerfilModal.tsx — el estudiante toca la notificación "Completa tu
// perfil" y llena aquí su teléfono y documento (y, si quiere, Facebook /
// Instagram). Es la versión CERRABLE del bloque de datos personales; el modal
// obligatorio de primer login vive en OnboardingDireccionModal.
//
// Se abre por deep link "completarPerfil:me" (ver notifRoute.ts + FloatingTopBar).
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import DatosPersonalesFields, {
  DATOS_PERSONALES_VACIO,
  datosPersonalesAFirestore,
  datosPersonalesObligatoriosOk,
  type DatosPersonalesValue,
} from './DatosPersonalesFields';
import { db } from '../config/firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { FONTS, useTheme, webScrollStyle, type GradlyColors } from '../context/ThemeContext';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function CompletarPerfilModal({ visible, onClose }: Props) {
  const { user, rol } = useAuth();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [datos, setDatos] = useState<DatosPersonalesValue>(DATOS_PERSONALES_VACIO);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible || !user?.uid || rol !== 'estudiante') return;
    let cancel = false;
    setCargando(true);
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'perfiles_estudiantes', user.uid));
        const d = (snap.exists() ? snap.data() : {}) as any;
        if (cancel) return;
        setDatos({
          telefono: d.telefono ?? '',
          docTipo: (d.doc_tipo ?? '') as DatosPersonalesValue['docTipo'],
          docNumero: d.doc_numero ?? '',
          facebook: d.facebook ?? '',
          instagram: d.instagram ?? '',
        });
      } catch {
        /* deja el formulario vacío */
      } finally {
        if (!cancel) setCargando(false);
      }
    })();
    return () => { cancel = true; };
  }, [visible, user?.uid, rol]);

  if (!visible || !user?.uid || rol !== 'estudiante') return null;

  const listo = datosPersonalesObligatoriosOk(datos);

  const guardar = async () => {
    if (!listo || guardando) return;
    setGuardando(true);
    setError('');
    try {
      await updateDoc(doc(db, 'perfiles_estudiantes', user.uid), datosPersonalesAFirestore(datos));
      // La notificación ya no hace falta: se marca leída (id determinístico).
      await updateDoc(doc(db, 'notificaciones_app', `completarPerfil_${user.uid}`), { leido: true }).catch(() => {});
      onClose();
    } catch {
      setError('No se pudo guardar. Verifica tu conexión e intenta de nuevo.');
      setGuardando(false);
    }
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.hoja}>
          <View style={s.header}>
            <Ionicons name="person-circle-outline" size={18} color={colors.primaryLight} />
            <Text style={s.titulo}>Completa tu perfil</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {cargando ? (
            <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>
          ) : (
            <ScrollView style={webScrollStyle(colors)} contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
              <Text style={s.ayuda}>
                Agrega tu teléfono y tu documento de identidad. Tu documento es
                privado: no aparece en ningún perfil. Facebook e Instagram son
                opcionales.
              </Text>

              <DatosPersonalesFields
                value={datos}
                onChange={(patch) => setDatos((d) => ({ ...d, ...patch }))}
              />

              {!!error && <Text style={s.error}>{error}</Text>}

              <TouchableOpacity
                style={[s.btn, (!listo || guardando) && s.btnOff]}
                onPress={guardar}
                disabled={!listo || guardando}
              >
                {guardando
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.btnTxt}>Guardar</Text>}
              </TouchableOpacity>
              {!listo && (
                <Text style={s.hint}>Completa tu teléfono y documento para guardar.</Text>
              )}
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
      maxHeight: '88%', maxWidth: 520, width: '100%', alignSelf: 'center',
      backgroundColor: COLORS.backgroundCard,
      borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
    },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 16, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: COLORS.border,
    },
    titulo: { flex: 1, fontSize: 15, fontFamily: FONTS.soraSemiBold, color: COLORS.textPrimary },
    center: { paddingVertical: 48, alignItems: 'center' },
    ayuda: { fontSize: 12.5, fontFamily: FONTS.interRegular, color: COLORS.textMuted, lineHeight: 18 },
    error: { fontSize: 12.5, fontFamily: FONTS.interRegular, color: COLORS.error },
    btn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
    btnOff: { opacity: 0.45 },
    btnTxt: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: '#fff' },
    hint: { fontSize: 11.5, fontFamily: FONTS.interRegular, color: COLORS.textMuted, textAlign: 'center' },
  });
