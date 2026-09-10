// ════════════════════════════════════════════════════════════════════════
// SoporteTicketModal.tsx — el modal con el que un usuario abre y sigue un
// "mensaje de soporte" con el equipo de Gradly (ver src/services/soporteService.ts).
//
// Dos modos, según la prop `ticketId`:
//   · null/undefined → CREAR: chips de categoría + texto + imágenes → "Enviar".
//   · un id          → HILO: la conversación en vivo + caja de respuesta
//                       (si el ticket sigue 'abierto').
//
// Lo montan:
//   · app/help-gradly.tsx        → botón "Enviar un mensaje" y la lista "Mis
//                                   mensajes".
//   · src/components/SoporteGate  → al iniciar sesión, si el admin respondió.
//   · src/components/FloatingTopBar→ al tocar la notificación 'ticketSoporte:id'.
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AutoText as Text } from './AutoText';
import { useAuth } from '../context/AuthContext';
import { FONTS, useTheme, webScrollStyle, type GradlyColors } from '../context/ThemeContext';
import {
  CATEGORIAS_SOPORTE,
  crearTicket,
  labelCategoriaSoporte,
  labelRolSoporte,
  marcarTicketLeido,
  marcarTicketResuelto,
  responderTicket,
  suscribirTicket,
  type CategoriaSoporte,
  type RolSoporte,
  type TicketSoporte,
} from '../services/soporteService';

const MAX_IMG = 3;

interface Props {
  visible: boolean;
  /** null / omitido → modo CREAR. Un id → modo HILO. */
  ticketId?: string | null;
  onClose: () => void;
  /** Modo CREAR: se llama con el id del ticket recién abierto. */
  onCreado?: (id: string) => void;
  /** Modo HILO: baja la bandera de "no leído" del lado que abre (gate / notificación / panel). */
  marcarLeidoAlAbrir?: boolean;
  /**
   * true → lo abre el ADMIN desde el panel: responde `comoAdmin`, sus mensajes
   * van a la derecha, ve los datos del usuario y puede "Marcar como resuelto".
   */
  modoAdmin?: boolean;
  /** Nombre con el que firma el admin sus respuestas. */
  adminNombre?: string;
}

export default function SoporteTicketModal({
  visible,
  ticketId = null,
  onClose,
  onCreado,
  marcarLeidoAlAbrir,
  modoAdmin = false,
  adminNombre = 'Soporte Gradly',
}: Props) {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const { user, userProfile, rol } = useAuth();

  const rolU: RolSoporte | null =
    rol === 'estudiante' || rol === 'empresa' || rol === 'universidad' ? rol : null;
  const nombre =
    (userProfile?.nombre_completo || '').trim() ||
    user?.displayName ||
    user?.email ||
    'Usuario';
  const email = (userProfile?.correo || '').trim() || user?.email || '';

  const modoHilo = !!ticketId;

  const [cat, setCat] = useState<CategoriaSoporte>('cuenta');
  const [texto, setTexto] = useState('');
  const [imgs, setImgs] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [ticket, setTicket] = useState<TicketSoporte | null>(null);
  const [cargando, setCargando] = useState(false);
  const [verImagen, setVerImagen] = useState<string | null>(null);

  // Reset al abrir / cambiar de ticket.
  useEffect(() => {
    if (!visible) return;
    setTexto('');
    setImgs([]);
    setErr(null);
    setCat('cuenta');
  }, [visible, ticketId]);

  // Suscripción al hilo (modo HILO).
  useEffect(() => {
    if (!visible || !ticketId) {
      setTicket(null);
      return;
    }
    setCargando(true);
    const unsub = suscribirTicket(
      ticketId,
      (t) => {
        setTicket(t);
        setCargando(false);
      },
      () => setCargando(false),
    );
    return () => unsub();
  }, [visible, ticketId]);

  // Baja la bandera de "no leído" del lado que abre (usuario o admin).
  useEffect(() => {
    if (visible && ticketId && marcarLeidoAlAbrir) {
      void marcarTicketLeido(ticketId, modoAdmin ? 'admin' : 'usuario');
    }
  }, [visible, ticketId, marcarLeidoAlAbrir, modoAdmin]);

  const pickImage = useCallback(async () => {
    setErr(null);
    if (imgs.length >= MAX_IMG) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        setErr('Necesitamos permiso para acceder a tus fotos.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });
      if (res.canceled) return;
      const uri = res.assets?.[0]?.uri;
      if (uri) setImgs((prev) => [...prev, uri].slice(0, MAX_IMG));
    } catch {
      setErr('No se pudo abrir la galería.');
    }
  }, [imgs.length]);

  const quitarImg = (uri: string) => setImgs((prev) => prev.filter((u) => u !== uri));

  const enviarNuevo = async () => {
    if (enviando) return;
    if (!user?.uid || !rolU) {
      setErr('Inicia sesión para enviar un mensaje al equipo.');
      return;
    }
    if (texto.trim().length < 10) {
      setErr('Cuéntanos un poco más: al menos 10 caracteres.');
      return;
    }
    setEnviando(true);
    setErr(null);
    try {
      const id = await crearTicket({
        categoria: cat,
        texto,
        imagenesUri: imgs,
        usuarioNombre: nombre,
        usuarioEmail: email,
        rol: rolU,
      });
      setTexto('');
      setImgs([]);
      onCreado?.(id);
    } catch (e: any) {
      setErr(e?.message || 'No se pudo enviar. Vuelve a intentarlo.');
    } finally {
      setEnviando(false);
    }
  };

  const enviarRespuesta = async () => {
    if (enviando || !ticketId) return;
    if (!texto.trim() && imgs.length === 0) {
      setErr('Escribe un mensaje o adjunta una imagen.');
      return;
    }
    setEnviando(true);
    setErr(null);
    try {
      await responderTicket({
        ticketId,
        texto,
        imagenesUri: imgs,
        autorNombre: modoAdmin ? adminNombre : nombre,
        comoAdmin: modoAdmin,
        notificarA: modoAdmin ? ticket?.usuarioId ?? null : null,
      });
      setTexto('');
      setImgs([]);
    } catch (e: any) {
      setErr(e?.message || 'No se pudo enviar. Vuelve a intentarlo.');
    } finally {
      setEnviando(false);
    }
  };

  const marcarResuelto = async () => {
    if (enviando || !ticketId) return;
    setEnviando(true);
    setErr(null);
    try {
      await marcarTicketResuelto(ticketId, ticket?.usuarioId ?? null);
    } catch (e: any) {
      setErr(e?.message || 'No se pudo marcar como resuelto.');
    } finally {
      setEnviando(false);
    }
  };

  const cerrado = ticket?.estado === 'resuelto';

  const tituloHeader = modoHilo
    ? labelCategoriaSoporte(ticket?.categoria)
    : 'Enviar un mensaje';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.header}>
            <Ionicons name="help-buoy-outline" size={18} color={colors.primaryLight} />
            <Text style={s.badge} numberOfLines={1}>{tituloHeader}</Text>
            {modoHilo && ticket ? (
              <View
                style={[
                  s.estadoPill,
                  { backgroundColor: (cerrado ? colors.success : colors.warning) + '22' },
                ]}
              >
                <Text
                  style={[s.estadoTxt, { color: cerrado ? colors.success : colors.warning }]}
                  noTranslate
                >
                  {cerrado ? 'Resuelto' : 'Abierto'}
                </Text>
              </View>
            ) : null}
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={webScrollStyle(colors)}
            contentContainerStyle={{ padding: 18, gap: 14 }}
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
          >
            {modoHilo ? (
              // ── MODO HILO ────────────────────────────────────────────
              cargando && !ticket ? (
                <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : !ticket ? (
                <Text style={s.parrafo}>No pudimos cargar esta conversación.</Text>
              ) : (
                <>
                  {modoAdmin ? (
                    <View style={s.adminMeta}>
                      <Text style={s.adminMetaNombre} noTranslate>{ticket.usuarioNombre}</Text>
                      <Text style={s.adminMetaLinea} noTranslate>
                        {labelRolSoporte(ticket.usuarioRol)}
                        {ticket.usuarioEmail ? ` · ${ticket.usuarioEmail}` : ''}
                      </Text>
                    </View>
                  ) : null}
                  {ticket.mensajes
                    ?.slice()
                    .sort((a, b) => (a.fecha ?? 0) - (b.fecha ?? 0))
                    .map((m) => {
                      const mio = modoAdmin ? m.autor === 'admin' : m.autor === 'usuario';
                      return (
                        <View
                          key={m.id}
                          style={[s.burbuja, mio ? s.burbujaMia : s.burbujaAdmin]}
                        >
                          <Text style={s.burbujaAutor} noTranslate>
                            {mio
                              ? 'Tú'
                              : m.autor_nombre ||
                                (m.autor === 'admin' ? 'Soporte Gradly' : 'Usuario')}
                          </Text>
                          {!!m.texto && (
                            <Text style={s.burbujaTexto} noTranslate>{m.texto}</Text>
                          )}
                          {Array.isArray(m.imagenes) && m.imagenes.length > 0 && (
                            <View style={s.imgRow}>
                              {m.imagenes.map((u) => (
                                <Pressable key={u} onPress={() => setVerImagen(u)}>
                                  <Image source={{ uri: u }} style={s.imgThumb} />
                                </Pressable>
                              ))}
                            </View>
                          )}
                          <Text style={s.burbujaHora} noTranslate>
                            {new Date(m.fecha || 0).toLocaleDateString(undefined, {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </Text>
                        </View>
                      );
                    })}

                  {cerrado ? (
                    <View style={s.cerradoBox}>
                      <Ionicons name="checkmark-done-outline" size={16} color={colors.success} />
                      <Text style={[s.cerradoTxt, { color: colors.success }]}>
                        El equipo marcó esta conversación como resuelta.
                      </Text>
                    </View>
                  ) : null}
                </>
              )
            ) : (
              // ── MODO CREAR ───────────────────────────────────────────
              <>
                <Text style={s.parrafo}>
                  Cuéntale al equipo de Gradly qué está pasando. Te responderán aquí mismo y
                  te avisaremos cuando lo hagan.
                </Text>

                <View>
                  <Text style={s.label}>¿Sobre qué es?</Text>
                  <View style={s.chipRow}>
                    {CATEGORIAS_SOPORTE.map((c) => {
                      const activo = cat === c.clave;
                      return (
                        <TouchableOpacity
                          key={c.clave}
                          style={[
                            s.chip,
                            {
                              backgroundColor: activo ? colors.primary : colors.white8,
                              borderColor: activo ? colors.primary : colors.border,
                            },
                          ]}
                          onPress={() => setCat(c.clave)}
                          activeOpacity={0.85}
                        >
                          <Ionicons
                            name={c.icon as any}
                            size={14}
                            color={activo ? '#fff' : colors.textMuted}
                          />
                          <Text
                            style={[
                              s.chipTxt,
                              { color: activo ? '#fff' : colors.textSecondary },
                            ]}
                          >
                            {c.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View>
                  <Text style={s.label}>Cuéntanos qué pasó</Text>
                  <TextInput
                    style={s.input}
                    value={texto}
                    onChangeText={setTexto}
                    placeholder="Describe el problema con el mayor detalle posible…"
                    placeholderTextColor={colors.textMuted}
                    multiline
                    editable={!enviando}
                  />
                </View>
              </>
            )}

            {/* Adjuntar imágenes — común a crear y responder (si no está cerrado). */}
            {(!modoHilo || !cerrado) && (
              <View>
                <Text style={s.label}>
                  {modoHilo ? 'Adjuntar imagen (opcional)' : 'Adjuntar imágenes (opcional)'}
                </Text>
                <View style={s.imgRow}>
                  {imgs.map((u) => (
                    <View key={u} style={s.pendWrap}>
                      <Image source={{ uri: u }} style={s.imgThumb} />
                      <TouchableOpacity
                        style={s.pendX}
                        onPress={() => quitarImg(u)}
                        hitSlop={8}
                      >
                        <Ionicons name="close" size={12} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {imgs.length < MAX_IMG && (
                    <TouchableOpacity
                      style={[s.imgAdd, { borderColor: colors.border }]}
                      onPress={pickImage}
                      activeOpacity={0.8}
                      disabled={enviando}
                    >
                      <Ionicons name="camera-outline" size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {err ? <Text style={[s.error, { color: colors.error }]}>{err}</Text> : null}

            {/* Acción principal. */}
            {modoHilo ? (
              !cerrado ? (
                <>
                  <TouchableOpacity
                    style={[s.btn, { backgroundColor: colors.primary, opacity: enviando ? 0.6 : 1 }]}
                    onPress={enviarRespuesta}
                    activeOpacity={0.9}
                    disabled={enviando}
                  >
                    {enviando ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={s.btnTxt}>Enviar respuesta</Text>
                    )}
                  </TouchableOpacity>
                  {modoAdmin && ticket ? (
                    <TouchableOpacity
                      style={[s.btnOutline, { borderColor: colors.success, opacity: enviando ? 0.6 : 1 }]}
                      onPress={marcarResuelto}
                      activeOpacity={0.9}
                      disabled={enviando}
                    >
                      <Ionicons name="checkmark-done-outline" size={16} color={colors.success} />
                      <Text style={[s.btnOutlineTxt, { color: colors.success }]}>
                        Marcar como resuelto
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              ) : null
            ) : (
              <TouchableOpacity
                style={[
                  s.btn,
                  {
                    backgroundColor: colors.primary,
                    opacity: enviando || texto.trim().length < 10 ? 0.6 : 1,
                  },
                ]}
                onPress={enviarNuevo}
                activeOpacity={0.9}
                disabled={enviando || texto.trim().length < 10}
              >
                {enviando ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.btnTxt}>Enviar mensaje</Text>
                )}
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </View>

      {/* Visor de imagen a pantalla completa. */}
      <Modal
        visible={!!verImagen}
        transparent
        animationType="fade"
        onRequestClose={() => setVerImagen(null)}
      >
        <Pressable style={s.viewerOverlay} onPress={() => setVerImagen(null)}>
          {verImagen ? (
            <Image source={{ uri: verImagen }} style={s.viewerImg} resizeMode="contain" />
          ) : null}
          <View style={s.viewerClose}>
            <Ionicons name="close" size={26} color="#fff" />
          </View>
        </Pressable>
      </Modal>
    </Modal>
  );
}

const makeStyles = (C: GradlyColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(7,5,15,0.9)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 18,
    },
    sheet: {
      width: '100%',
      maxWidth: 480,
      maxHeight: '88%',
      alignSelf: 'center',
      backgroundColor: C.backgroundCard,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    badge: { flex: 1, fontSize: 14, fontFamily: FONTS.soraSemiBold, color: C.primaryLight },
    estadoPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
    estadoTxt: { fontSize: 10, fontFamily: FONTS.interSemiBold },

    parrafo: { fontSize: 13, lineHeight: 20, fontFamily: FONTS.interRegular, color: C.textMuted },
    label: {
      fontSize: 12,
      fontFamily: FONTS.interSemiBold,
      color: C.textSecondary,
      marginBottom: 8,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 999,
      borderWidth: 1,
    },
    chipTxt: { fontSize: 12, fontFamily: FONTS.interMedium },
    input: {
      minHeight: 96,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 14,
      fontFamily: FONTS.interRegular,
      color: C.textPrimary,
      textAlignVertical: 'top',
      backgroundColor: C.white8,
    },

    imgRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    imgThumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: C.white8 },
    imgAdd: {
      width: 64,
      height: 64,
      borderRadius: 10,
      borderWidth: 1,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
    },
    pendWrap: { position: 'relative' },
    pendX: {
      position: 'absolute',
      top: -6,
      right: -6,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: 'rgba(0,0,0,0.75)',
      alignItems: 'center',
      justifyContent: 'center',
    },

    burbuja: {
      borderRadius: 14,
      padding: 12,
      gap: 6,
      maxWidth: '92%',
    },
    burbujaMia: {
      alignSelf: 'flex-end',
      backgroundColor: C.primary12,
      borderWidth: 1,
      borderColor: C.primary35,
    },
    burbujaAdmin: {
      alignSelf: 'flex-start',
      backgroundColor: C.white8,
      borderWidth: 1,
      borderColor: C.border,
    },
    burbujaAutor: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: C.textSecondary },
    burbujaTexto: { fontSize: 14, fontFamily: FONTS.interRegular, color: C.textPrimary, lineHeight: 20 },
    burbujaHora: { fontSize: 10, fontFamily: FONTS.interRegular, color: C.textMuted },

    cerradoBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 12,
      borderRadius: 12,
      backgroundColor: C.white8,
    },
    cerradoTxt: { flex: 1, fontSize: 12, fontFamily: FONTS.interMedium },

    adminMeta: {
      padding: 12,
      borderRadius: 12,
      backgroundColor: C.white8,
      borderWidth: 1,
      borderColor: C.border,
      gap: 2,
    },
    adminMetaNombre: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: C.textPrimary },
    adminMetaLinea: { fontSize: 12, fontFamily: FONTS.interRegular, color: C.textMuted },

    error: { fontSize: 12, fontFamily: FONTS.interMedium },
    btn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    btnTxt: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: '#fff' },
    btnOutline: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 14,
      paddingVertical: 13,
      borderWidth: 1,
    },
    btnOutlineTxt: { fontSize: 14, fontFamily: FONTS.interSemiBold },

    viewerOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.94)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    viewerImg: { width: '92%', height: '80%' },
    viewerClose: { position: 'absolute', top: 44, right: 20 },
  });
