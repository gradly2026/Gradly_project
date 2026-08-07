/**
 * ProfileViewerModal — visualizador avanzado de perfiles.
 *
 * - Estudiante: foto, correo, teléfono, redes, universidad aliada, carrera y
 *   horas de avance. La UBICACIÓN solo se muestra si el usuario activo es
 *   'empresa' o 'universidad'.
 * - Sistema de calificación de 5 estrellas (puntualidad, responsabilidad,
 *   rendimiento) + reseña → solo visible para usuarios 'empresa'. Se guarda en
 *   la subcolección perfiles_estudiantes/{id}/calificaciones.
 * - Insignias gamificadas: "Estudiante de Alto Nivel" (promedio ≥ 4.5) y
 *   "Graduado" (100% de horas completadas).
 */
import { Ionicons } from '@expo/vector-icons';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,


  TouchableOpacity,
  View,
} from 'react-native';
import { AutoText as Text, AutoTextInput as TextInput } from "./AutoText";
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { shadow } from '../utils/shadow';
import { db } from '../config/firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { useIniciarChat } from '../hooks/useIniciarChat';
import { subscribeUserChats, type ChatListItem } from '../services/chatService';
import StorageAvatar from './StorageAvatar';
import ResenasFeedback, { PromedioSimple } from './ResenasFeedback';

export type ProfileTipo = 'estudiante' | 'empresa' | 'universidad';

interface Props {
  visible: boolean;
  onClose: () => void;
  tipo: ProfileTipo;
  profileId: string;
}

interface Calificacion {
  id: string;
  empresa_id: string;
  empresa_nombre?: string;
  puntualidad: number;
  responsabilidad: number;
  rendimiento: number;
  promedio: number;
  comentario?: string;
  fecha?: any;
}

const COLECCION_POR_TIPO: Record<ProfileTipo, string> = {
  estudiante:  'perfiles_estudiantes',
  empresa:     'perfiles_empresas',
  universidad: 'perfiles_universidades',
};

export default function ProfileViewerModal({ visible, onClose, tipo, profileId }: Props) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { user, rol } = useAuth();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const iniciarChat = useIniciarChat();

  // Grupos de chat que comparto con este perfil (aparecen como "en común").
  const [gruposComun, setGruposComun] = useState<ChatListItem[]>([]);
  const esMiPerfil = !!user?.uid && user.uid === profileId;

  const [data, setData] = useState<any>(null);
  const [correo, setCorreo] = useState<string>('');
  const [uniNombre, setUniNombre] = useState<string>('');
  const [grupoNombre, setGrupoNombre] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const [califs, setCalifs] = useState<Calificacion[]>([]);

  // Inputs de calificación (solo empresa)
  const [puntualidad, setPuntualidad] = useState(0);
  const [responsabilidad, setResponsabilidad] = useState(0);
  const [rendimiento, setRendimiento] = useState(0);
  const [comentario, setComentario] = useState('');
  const [guardando, setGuardando] = useState(false);

  const puedeVerUbicacion = rol === 'empresa' || rol === 'universidad';
  const esEmpresaActiva = rol === 'empresa';

  // ── Cargar perfil ───────────────────────────────────────────────
  useEffect(() => {
    if (!visible || !profileId) return;
    let cancel = false;
    setLoading(true);
    setData(null);
    setCorreo('');
    setUniNombre('');
    setGrupoNombre('');

    (async () => {
      try {
        const snap = await getDoc(doc(db, COLECCION_POR_TIPO[tipo], profileId));
        if (cancel) return;
        const d = snap.exists() ? snap.data() : null;
        setData(d);

        if (tipo === 'estudiante' && d) {
          // Correo: preferir el del perfil, sino el de usuarios/{uid}
          if (d.correo) setCorreo(d.correo);
          else {
            const u = await getDoc(doc(db, 'usuarios', profileId));
            if (!cancel && u.exists()) setCorreo((u.data() as any).correo ?? '');
          }
          // Universidad aliada
          if (d.universidad_id) {
            const uni = await getDoc(doc(db, 'perfiles_universidades', d.universidad_id));
            if (!cancel && uni.exists()) setUniNombre((uni.data() as any).nombre_universidad ?? '');
          }
          // Grupo vinculado
          if (d.grupo_id) {
            const g = await getDoc(doc(db, 'grupos', d.grupo_id));
            if (!cancel && g.exists()) setGrupoNombre((g.data() as any).nombre ?? '');
          }
        }
      } catch (e) {
        console.error('[ProfileViewer] load', e);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => { cancel = true; };
  }, [visible, profileId, tipo]);

  // ── Suscripción a calificaciones (solo estudiantes) ──────────────
  useEffect(() => {
    if (!visible || tipo !== 'estudiante' || !profileId) return;
    const unsub = onSnapshot(
      collection(db, 'perfiles_estudiantes', profileId, 'calificaciones'),
      snap => setCalifs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Calificacion))),
      err => console.error('[ProfileViewer] califs', err),
    );
    return unsub;
  }, [visible, tipo, profileId]);

  // ── Grupos en común con este perfil ──────────────────────────────
  useEffect(() => {
    if (!visible || !user?.uid || !profileId || esMiPerfil) {
      setGruposComun([]);
      return;
    }
    const unsub = subscribeUserChats(
      user.uid,
      (items) =>
        setGruposComun(
          items.filter((c) => c.type === 'group' && c.users.includes(profileId)),
        ),
      () => {},
    );
    return unsub;
  }, [visible, user?.uid, profileId, esMiPerfil]);

  const promedioGlobal = useMemo(() => {
    if (califs.length === 0) return 0;
    return califs.reduce((acc, c) => acc + (c.promedio ?? 0), 0) / califs.length;
  }, [califs]);

  // Horas de avance
  const horasAprobadas = data?.horas_aprobadas ?? 0;
  const horasObjetivo  = data?.horas_objetivo ?? 500;
  const pct = Math.min(100, Math.round((horasAprobadas / Math.max(horasObjetivo, 1)) * 100));

  const esGraduado  = pct >= 100;
  const esAltoNivel = califs.length > 0 && promedioGlobal >= 4.5;

  // ── Guardar calificación ─────────────────────────────────────────
  const guardarCalificacion = async () => {
    if (!user) return;
    if (!puntualidad || !responsabilidad || !rendimiento) {
      Alert.alert('Completa las estrellas', 'Califica puntualidad, responsabilidad y rendimiento.');
      return;
    }
    setGuardando(true);
    const promedio = (puntualidad + responsabilidad + rendimiento) / 3;
    try {
      await addDoc(collection(db, 'perfiles_estudiantes', profileId, 'calificaciones'), {
        empresa_id:      user.uid,
        puntualidad,
        responsabilidad,
        rendimiento,
        promedio,
        comentario:      comentario.trim(),
        fecha:           serverTimestamp(),
      });
      // Recalcular y persistir el promedio global en el perfil
      const nuevoProm = (califs.reduce((a, c) => a + (c.promedio ?? 0), 0) + promedio) / (califs.length + 1);
      await updateDoc(doc(db, 'perfiles_estudiantes', profileId), {
        calificacion_promedio: Math.round(nuevoProm * 10) / 10,
      });
      setPuntualidad(0); setResponsabilidad(0); setRendimiento(0); setComentario('');
      Alert.alert('¡Reseña guardada!', 'Tu calificación se registró correctamente.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo guardar la reseña.');
    } finally {
      setGuardando(false);
    }
  };

  const abrirLink = (url?: string) => {
    if (!url) return;
    const full = url.startsWith('http') ? url : `https://${url}`;
    Linking.openURL(full).catch(() => {});
  };

  // ── Render ───────────────────────────────────────────────────────
  const nombre = data?.nombre_completo ?? data?.nombre_empresa ?? data?.nombre_universidad ?? 'Perfil';
  const fotoUrl = data?.foto_url || data?.logo_url || null;
  const fallbackIcon: keyof typeof Ionicons.glyphMap =
    tipo === 'empresa' ? 'business' : tipo === 'universidad' ? 'school' : 'person';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Perfil</Text>
          <View style={{ width: 32 }} />
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : !data ? (
          <View style={styles.loading}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.textMuted} />
            <Text style={styles.empty}>No se encontró este perfil.</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Hero */}
            <View style={styles.hero}>
              <StorageAvatar url={fotoUrl} size={96} fallbackIcon={fallbackIcon} />
              <View style={styles.nombreRow}>
                <Text style={styles.nombre}>{nombre}</Text>
                {tipo === 'empresa' && data.verificado && (
                  <Ionicons name="checkmark-circle" size={22} color={colors.primaryLight} />
                )}
              </View>
              {tipo === 'estudiante' && (
                <Text style={styles.carrera}>{data.carrera ?? 'Sin carrera'}</Text>
              )}
              {tipo === 'empresa' && (
                <Text style={styles.carrera}>{data.industria ?? 'Empresa'}</Text>
              )}
              {tipo === 'universidad' && (
                <Text style={styles.carrera}>{data.dominio_correo ?? ''}</Text>
              )}

              {/* Insignias gamificadas */}
              {tipo === 'estudiante' && (esGraduado || esAltoNivel) && (
                <View style={styles.badgesRow}>
                  {esAltoNivel && <GlowBadge icon="star" label="Estudiante de Alto Nivel" color="#F59E0B" styles={styles} />}
                  {esGraduado && <GlowBadge icon="trophy" label="Graduado" color={colors.success} styles={styles} />}
                </View>
              )}

              {/* Chatear directamente con este usuario (carga el historial si ya existe). */}
              {!esMiPerfil && (
                <TouchableOpacity
                  style={styles.chatBtn}
                  activeOpacity={0.85}
                  onPress={() => {
                    onClose();
                    void iniciarChat({ uid: profileId, nombre, rol: tipo });
                  }}
                >
                  <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
                  <Text style={styles.chatBtnText}>Chatear</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Grupos de chat en común con este perfil */}
            {gruposComun.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Grupos en común ({gruposComun.length})</Text>
                {gruposComun.map((g) => (
                  <TouchableOpacity
                    key={g.id}
                    style={styles.infoRow}
                    activeOpacity={0.85}
                    onPress={() => {
                      const peerName = g.name || g.grupoNombre || 'Grupo';
                      onClose();
                      router.push({
                        pathname: '/mensajes',
                        params: { chat: g.id, peerName },
                      } as any);
                    }}
                  >
                    <Ionicons name="people" size={18} color={colors.primaryLight} style={{ width: 26 }} />
                    <Text style={[styles.infoValue, { flex: 1 }]} numberOfLines={1}>
                      {g.name || g.grupoNombre || 'Grupo'}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Bandeja de reseñas del sistema OFICIAL (feedback_pasantias) —
                deliberadamente aparte de la sección "Calificar al estudiante"
                de más abajo, que sigue viva sin tocar (sistema viejo, ver
                ResenasFeedback.tsx para el porqué de dejarlos separados). */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Reseñas</Text>
              {tipo === 'universidad' ? (
                <PromedioSimple
                  promedio={Number(data.calificacion_estudiantes_promedio ?? 0)}
                  theme={isDark ? 'dark' : 'light'}
                />
              ) : (
                <ResenasFeedback
                  entidadId={profileId}
                  entidadRol={tipo === 'empresa' ? 'empresa' : 'estudiante'}
                  theme={isDark ? 'dark' : 'light'}
                />
              )}
            </View>

            {tipo === 'estudiante' && (
              <>
                {/* Horas de avance */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Horas de avance</Text>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${pct}%` }]} />
                  </View>
                  <Text style={styles.progressLabel}>
                    {horasAprobadas} / {horasObjetivo} horas · {pct}%
                  </Text>
                  {califs.length > 0 && (
                    <View style={styles.ratingSummary}>
                      <Stars value={Math.round(promedioGlobal)} />
                      <Text style={styles.ratingSummaryText}>
                        {promedioGlobal.toFixed(1)} · {califs.length} reseña{califs.length !== 1 ? 's' : ''}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Contacto */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Información de contacto</Text>
                  <InfoRow icon="mail-outline" label="Correo" value={correo || 'No disponible'} colors={colors} styles={styles} />
                  <InfoRow icon="call-outline" label="Teléfono" value={data.telefono || 'No disponible'} colors={colors} styles={styles} />
                  <InfoRow icon="school-outline" label="Universidad vinculada" value={uniNombre || 'No disponible'} colors={colors} styles={styles} />
                  <InfoRow icon="people-outline" label="Grupo" value={grupoNombre || 'Sin grupo'} colors={colors} styles={styles} />
                  {/* Ubicación: solo empresa/universidad */}
                  {puedeVerUbicacion && (
                    <InfoRow icon="location-outline" label="Ubicación" value={data.direccion || 'No disponible'} colors={colors} styles={styles} />
                  )}
                </View>

                {/* Redes */}
                {(data.linkedin || data.portfolio) && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Redes</Text>
                    <View style={styles.redesRow}>
                      {!!data.linkedin && (
                        <TouchableOpacity style={styles.redBtn} onPress={() => abrirLink(data.linkedin)}>
                          <Ionicons name="logo-linkedin" size={18} color={colors.primaryLight} />
                          <Text style={styles.redText}>LinkedIn</Text>
                        </TouchableOpacity>
                      )}
                      {!!data.portfolio && (
                        <TouchableOpacity style={styles.redBtn} onPress={() => abrirLink(data.portfolio)}>
                          <Ionicons name="globe-outline" size={18} color={colors.primaryLight} />
                          <Text style={styles.redText}>Portfolio</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                )}

                {/* Módulo de calificación — solo empresa */}
                {esEmpresaActiva && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Calificar al estudiante</Text>
                    <View style={styles.ratingCard}>
                      <RatingRow label="Puntualidad" value={puntualidad} onChange={setPuntualidad} styles={styles} />
                      <RatingRow label="Responsabilidad" value={responsabilidad} onChange={setResponsabilidad} styles={styles} />
                      <RatingRow label="Rendimiento" value={rendimiento} onChange={setRendimiento} styles={styles} />
                      <TextInput
                        style={styles.textArea}
                        value={comentario}
                        onChangeText={setComentario}
                        placeholder="Escribe una reseña (opcional)…"
                        placeholderTextColor={colors.textMuted}
                        multiline
                        selectionColor={colors.primary}
                      />
                      <TouchableOpacity
                        style={[styles.saveBtn, guardando && { opacity: 0.6 }]}
                        onPress={guardarCalificacion}
                        disabled={guardando}
                      >
                        {guardando
                          ? <ActivityIndicator color="#fff" />
                          : <Text style={styles.saveText}>Guardar reseña</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Reseñas existentes */}
                {califs.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Reseñas ({califs.length})</Text>
                    {califs.map(c => (
                      <View key={c.id} style={styles.resenaCard}>
                        <Stars value={Math.round(c.promedio)} size={14} />
                        {!!c.comentario && <Text style={styles.resenaText}>{c.comentario}</Text>}
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}

            {tipo === 'empresa' && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Información</Text>
                <InfoRow icon="business-outline" label="Industria" value={data.industria || '—'} colors={colors} styles={styles} />
                <InfoRow icon="star-outline" label="Plan" value={data.premium ? 'Premium' : 'Básico'} colors={colors} styles={styles} />
                <InfoRow icon="shield-checkmark-outline" label="Verificación" value={data.verificado ? 'Empresa verificada' : 'No verificada'} colors={colors} styles={styles} />
              </View>
            )}

            {tipo === 'universidad' && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Información</Text>
                <InfoRow icon="mail-outline" label="Dominio" value={data.dominio_correo || '—'} colors={colors} styles={styles} />
                <InfoRow icon="location-outline" label="Dirección" value={data.direccion || '—'} colors={colors} styles={styles} />
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// SUBCOMPONENTES
// ─────────────────────────────────────────────
function Stars({ value, size = 18 }: { value: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Ionicons key={i} name={i <= value ? 'star' : 'star-outline'} size={size} color="#F59E0B" />
      ))}
    </View>
  );
}

function RatingRow({ label, value, onChange, styles }: {
  label: string; value: number; onChange: (v: number) => void; styles: any;
}) {
  return (
    <View style={styles.ratingRow}>
      <Text style={styles.ratingLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {[1, 2, 3, 4, 5].map(i => (
          <TouchableOpacity key={i} onPress={() => onChange(i)} hitSlop={4}>
            <Ionicons name={i <= value ? 'star' : 'star-outline'} size={22} color="#F59E0B" />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function InfoRow({ icon, label, value, colors, styles }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; value: string; colors: GradlyColors; styles: any;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={colors.primaryLight} style={{ width: 26 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

function GlowBadge({ icon, label, color, styles }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; color: string; styles: any;
}) {
  return (
    <View style={[styles.glowBadge, { borderColor: color + '88', backgroundColor: color + '1A' }, shadow({ color, blur: 10, opacity: 0.7, elevation: 6 })]}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={[styles.glowBadgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────
const makeStyles = (COLORS: GradlyColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.backgroundDark },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  empty: { fontSize: 14, fontFamily: FONTS.interRegular, color: COLORS.textMuted },

  hero: { alignItems: 'center', paddingTop: 24, paddingBottom: 16, gap: 6 },
  nombreRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  nombre: { fontSize: 22, fontFamily: FONTS.soraBold, color: COLORS.textPrimary, textAlign: 'center' },
  carrera: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textMuted },

  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 10 },
  glowBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
  },
  glowBadgeText: { fontSize: 12, fontFamily: FONTS.interSemiBold },

  chatBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 22, paddingVertical: 11, borderRadius: 24, marginTop: 14,
  },
  chatBtnText: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: '#fff' },

  section: { marginHorizontal: 16, marginTop: 18, gap: 8 },
  sectionTitle: {
    fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight,
    letterSpacing: 0.3, textTransform: 'uppercase',
  },

  progressTrack: { height: 10, borderRadius: 5, backgroundColor: COLORS.backgroundSurface, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 5 },
  progressLabel: { fontSize: 12, fontFamily: FONTS.interMedium, color: COLORS.textMuted },
  ratingSummary: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  ratingSummaryText: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },

  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.backgroundCard, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  infoLabel: { fontSize: 11, fontFamily: FONTS.interMedium, color: COLORS.textMuted },
  infoValue: { fontSize: 14, fontFamily: FONTS.interRegular, color: COLORS.textPrimary },

  redesRow: { flexDirection: 'row', gap: 10 },
  redBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.primary12, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: COLORS.primary35,
  },
  redText: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },

  ratingCard: {
    backgroundColor: COLORS.backgroundCard, borderRadius: 16, padding: 16, gap: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  ratingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ratingLabel: { fontSize: 14, fontFamily: FONTS.interMedium, color: COLORS.textPrimary },
  textArea: {
    backgroundColor: COLORS.backgroundSurface, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    minHeight: 80, padding: 12, fontSize: 14, fontFamily: FONTS.interRegular, color: COLORS.textPrimary,
    textAlignVertical: 'top',
  },
  saveBtn: { height: 46, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: '#fff' },

  resenaCard: {
    backgroundColor: COLORS.backgroundCard, borderRadius: 12, padding: 12, gap: 6,
    borderWidth: 1, borderColor: COLORS.border,
  },
  resenaText: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textPrimary, lineHeight: 18 },
});
