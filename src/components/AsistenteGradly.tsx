// ════════════════════════════════════════════════════════════════════════
// AsistenteGradly.tsx — burbuja flotante + hoja de chat del "Asistente Gradly"
// (bot de AYUDA, fase 1: solo Q&A por texto; ver src/services/chatbotService.ts).
//
// Se monta en los dashboards (estudiante `(tabs)`, empresa, universidad). No
// aparece para admin ni sin sesión. La conversación es efímera: vive en el
// estado del componente.
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import { doc, onSnapshot } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AutoText as Text } from './AutoText';
import { db } from '../config/firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { FONTS, useTheme, webScrollStyle, type GradlyColors } from '../context/ThemeContext';
import { useTranslationContext } from '../context/TranslationContext';
import { preguntarAlAsistente, type MensajeAsistente } from '../services/chatbotService';
import { shadow } from '../utils/shadow';

interface Props {
  /**
   * Distancia al borde inferior (px). Por defecto queda APILADO encima del
   * botón flotante de búsqueda (que vive a ~90px). Súbela si tapa algo.
   */
  bottom?: number;
}

export default function AsistenteGradly({ bottom = 158 }: Props) {
  const { user, rol } = useAuth();
  const { colors } = useTheme();
  const { language } = useTranslationContext();
  const s = makeStyles(colors);

  const [open, setOpen] = useState(false);
  const [mensajes, setMensajes] = useState<MensajeAsistente[]>([]);
  const [input, setInput] = useState('');
  const [cargando, setCargando] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // La burbuja solo se ve si el admin la habilitó (doc `config/asistente`).
  // Arranca oculta; el listener la muestra si `habilitado === true`.
  const [habilitado, setHabilitado] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'config', 'asistente'),
      (snap) => setHabilitado(snap.exists() && (snap.data() as any)?.habilitado === true),
      () => setHabilitado(false),
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
  }, [open, mensajes.length, cargando]);

  const enviar = useCallback(async () => {
    const q = input.trim();
    if (!q || cargando) return;
    const nuevo: MensajeAsistente = { rol: 'user', texto: q };
    const historial = [...mensajes, nuevo];
    setMensajes(historial);
    setInput('');
    setErr(null);
    setCargando(true);
    try {
      const r = await preguntarAlAsistente(historial, language === 'en' ? 'en' : 'es', rol ?? '');
      setMensajes((prev) => [...prev, { rol: 'model', texto: r }]);
    } catch (e: any) {
      setErr(e?.message || 'Algo salió mal.');
    } finally {
      setCargando(false);
    }
  }, [input, cargando, mensajes, language, rol]);

  // No para admin ni sin sesión, y solo si el admin habilitó la burbuja.
  if (!user?.uid || rol === 'admin' || !habilitado) return null;

  return (
    <>
      <TouchableOpacity
        style={[s.fab, { bottom, backgroundColor: colors.primary }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
        accessibilityLabel="Abrir el asistente de Gradly"
      >
        <Ionicons name="sparkles" size={22} color="#fff" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={s.backdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={s.sheet}
          >
            <View style={s.header}>
              <View style={s.headerIcon}>
                <Ionicons name="sparkles" size={16} color={colors.primaryLight} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.headerTitle}>Asistente Gradly</Text>
                <Text style={s.headerSub}>Te ayudo a moverte por la app</Text>
              </View>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={scrollRef}
              style={[webScrollStyle(colors), { flex: 1 }]}
              contentContainerStyle={{ padding: 16, gap: 10 }}
              keyboardShouldPersistTaps="handled"
            >
              <View style={[s.burbuja, s.burbujaBot]}>
                <Text style={s.burbujaBotTxt}>
                  ¡Hola! Soy el asistente de Gradly. Pregúntame cómo hacer algo o qué significa
                  un término y te oriento.
                </Text>
              </View>

              {mensajes.map((m, i) =>
                m.rol === 'user' ? (
                  <View key={i} style={[s.burbuja, s.burbujaYo, { backgroundColor: colors.primary }]}>
                    <Text style={s.burbujaYoTxt} noTranslate>{m.texto}</Text>
                  </View>
                ) : (
                  <View key={i} style={[s.burbuja, s.burbujaBot]}>
                    <Text style={s.burbujaBotTxt} noTranslate>{m.texto}</Text>
                  </View>
                ),
              )}

              {cargando ? (
                <View style={[s.burbuja, s.burbujaBot, s.escribiendo]}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={s.escribiendoTxt}>Escribiendo…</Text>
                </View>
              ) : null}

              {err ? <Text style={[s.err, { color: colors.error }]}>{err}</Text> : null}
            </ScrollView>

            <View style={s.inputRow}>
              <TextInput
                style={s.input}
                value={input}
                onChangeText={setInput}
                placeholder="Pregúntame sobre Gradly…"
                placeholderTextColor={colors.textMuted}
                multiline
                editable={!cargando}
                onSubmitEditing={enviar}
              />
              <TouchableOpacity
                style={[s.sendBtn, { backgroundColor: colors.primary, opacity: input.trim() && !cargando ? 1 : 0.5 }]}
                onPress={enviar}
                disabled={!input.trim() || cargando}
                activeOpacity={0.85}
              >
                <Ionicons name="send" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const makeStyles = (C: GradlyColors) =>
  StyleSheet.create({
    fab: {
      position: 'absolute',
      right: 20,
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 40,
      ...shadow({ color: '#000', y: 3, blur: 12, opacity: 0.32, elevation: 8 }),
    },
    backdrop: { flex: 1, backgroundColor: 'rgba(7,5,15,0.55)', justifyContent: 'flex-end' },
    sheet: {
      height: '82%',
      backgroundColor: C.backgroundDark,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
      backgroundColor: C.backgroundCard,
    },
    headerIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.primary12,
      borderWidth: 1,
      borderColor: C.primary35,
    },
    headerTitle: { fontSize: 15, fontFamily: FONTS.soraSemiBold, color: C.textPrimary },
    headerSub: { fontSize: 11, fontFamily: FONTS.interRegular, color: C.textMuted, marginTop: 1 },

    burbuja: { maxWidth: '86%', borderRadius: 16, paddingHorizontal: 13, paddingVertical: 10 },
    burbujaBot: {
      alignSelf: 'flex-start',
      backgroundColor: C.backgroundCard,
      borderWidth: 1,
      borderColor: C.border,
    },
    burbujaBotTxt: { fontSize: 14, lineHeight: 20, fontFamily: FONTS.interRegular, color: C.textPrimary },
    burbujaYo: { alignSelf: 'flex-end' },
    burbujaYoTxt: { fontSize: 14, lineHeight: 20, fontFamily: FONTS.interRegular, color: '#fff' },
    escribiendo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    escribiendoTxt: { fontSize: 12, fontFamily: FONTS.interRegular, color: C.textMuted },
    err: { fontSize: 12, fontFamily: FONTS.interMedium, alignSelf: 'center', textAlign: 'center' },

    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      padding: 10,
      borderTopWidth: 1,
      borderTopColor: C.border,
      backgroundColor: C.backgroundCard,
    },
    input: {
      flex: 1,
      maxHeight: 110,
      minHeight: 40,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 14,
      fontFamily: FONTS.interRegular,
      color: C.textPrimary,
      backgroundColor: C.white8,
    },
    sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  });
