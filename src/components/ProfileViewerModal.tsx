/**
 * ProfileViewerModal — visualizador avanzado de perfiles (pantalla completa,
 * abierto desde chat / búsqueda / paneles). Para el estudiante muestra el mismo
 * conjunto de datos que `components/PerfilPublicoModal.tsx` (la hoja inferior):
 * reseñas, "Trabaja para tu empresa", acerca de, horas de avance, contacto,
 * habilidades, currículum y "Reportar perfil". La UBICACIÓN exacta (dirección)
 * solo se muestra si el usuario activo es 'empresa' o 'universidad'.
 *
 * - Reseñas: se lee SOLO el sistema oficial `feedback_pasantias` vía
 *   `ResenasResumen` (promedio + "Ver más"). La subcolección paralela
 *   `perfiles_estudiantes/{id}/calificaciones` y su formulario "Calificar al
 *   estudiante" se RETIRARON: recalculaban `calificacion_promedio` por su cuenta,
 *   pisando lo que `feedbackService.ts` ya había calculado (ver
 *   [[project_resenas_perfil_y_reportar_chat]]).
 * - Insignias gamificadas: "Estudiante de Alto Nivel" (promedio oficial ≥ 4.5) y
 *   "Certificado" (100% de horas de pasantía completadas).
 */
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { AutoText as Text } from "./AutoText";
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { shadow } from '../utils/shadow';
import { db } from '../config/firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { useIniciarChat } from '../hooks/useIniciarChat';
import { subscribeUserChats, type ChatListItem } from '../services/chatService';
import StorageAvatar from './StorageAvatar';
import { ResenasResumen } from './ResenasFeedback';
import TrabajaParaCard from './TrabajaParaCard';
import ReportarUsuarioModal from './ReportarUsuarioModal';

export type ProfileTipo = 'estudiante' | 'empresa' | 'universidad';

interface Props {
  visible: boolean;
  onClose: () => void;
  tipo: ProfileTipo;
  profileId: string;
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

  const [showReportar, setShowReportar] = useState(false);

  const puedeVerUbicacion = rol === 'empresa' || rol === 'universidad';

  // Paleta suelta para <TrabajaParaCard> (trae su propio StyleSheet y espera
  // tokens individuales, no el objeto `colors` completo del tema).
  const trabajaParaPalette = useMemo(() => ({
    card: colors.backgroundCard,
    border: colors.border,
    text: colors.textPrimary,
    textSub: colors.textMuted,
    muted: colors.textMuted,
    purple: colors.primary,
    purpleDim: colors.primary12,
    green: colors.success,
    greenBg: isDark ? 'rgba(16,185,129,0.12)' : 'rgba(5,150,105,0.10)',
    bg: colors.backgroundDark,
  }), [colors, isDark]);

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

  // Horas de avance
  const horasAprobadas = data?.horas_aprobadas ?? 0;
  const horasObjetivo  = data?.horas_objetivo ?? 500;
  const pct = Math.min(100, Math.round((horasAprobadas / Math.max(horasObjetivo, 1)) * 100));

  const esGraduado  = pct >= 100;
  // Insignia "Alto Nivel": promedio OFICIAL del perfil (feedback_pasantias, vía
  // feedbackService) — antes se derivaba de la subcolección paralela.
  const esAltoNivel =
    Number(data?.calificaciones_recibidas ?? 0) > 0 &&
    Number(data?.calificacion_promedio ?? 0) >= 4.5;

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
    <>
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={[styles.header, styles.pageMax]}>
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
          <ScrollView showsVerticalScrollIndicator={false} style={styles.pageMax} contentContainerStyle={{ paddingBottom: 40 }}>
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
                <Text style={styles.carrera}>
                  {[data.carrera, data.semestre ? `${data.semestre}° sem.` : '']
                    .filter(Boolean).join('  ·  ') || 'Sin carrera'}
                </Text>
              )}
              {tipo === 'empresa' && (
                <Text style={styles.carrera}>{data.industria ?? 'Empresa'}</Text>
              )}
              {tipo === 'universidad' && (
                <Text style={styles.carrera}>{data.dominio_correo ?? ''}</Text>
              )}

              {tipo === 'estudiante' && !!data.estado_pasantia && (
                <View style={styles.estadoPill}>
                  <Text style={styles.estadoPillText}>
                    {data.estado_pasantia === 'en_proceso'
                      ? 'En proceso'
                      : data.estado_pasantia === 'finalizada'
                      ? 'Finalizada'
                      : 'Sin iniciar'}
                  </Text>
                </View>
              )}

              {/* Insignias gamificadas */}
              {tipo === 'estudiante' && (esGraduado || esAltoNivel) && (
                <View style={styles.badgesRow}>
                  {esAltoNivel && <GlowBadge icon="star" label="Estudiante de Alto Nivel" color="#F59E0B" styles={styles} />}
                  {esGraduado && <GlowBadge icon="ribbon" label="Certificado" color={colors.success} styles={styles} />}
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

            {/* Reseñas del sistema OFICIAL (feedback_pasantias): mismo vistazo
                compacto + "Ver más" que PerfilPublicoModal. `ResenasResumen` ya
                trae su encabezado "RESEÑAS", así que aquí NO se repite el título
                (antes convivía con la sección paralela "Calificar al estudiante",
                retirada por pisar `calificacion_promedio` del sistema real). */}
            <View style={styles.section}>
              <ResenasResumen
                entidadId={profileId}
                entidadRol={tipo}
                theme={isDark ? 'dark' : 'light'}
              />
            </View>

            {/* Si quien mira es la empresa que tiene contratado a este estudiante:
                "Trabaja para tu empresa" + "Añadir tarea". Se autooculta si no hay
                contrato activo (query interna por empresaId == viewer). */}
            {tipo === 'estudiante' && rol === 'empresa' && !!user?.uid && !esMiPerfil && (
              <View style={{ marginHorizontal: 16, marginTop: 18 }}>
                <TrabajaParaCard
                  estudianteId={profileId}
                  viewerUserId={user.uid}
                  C={trabajaParaPalette}
                />
              </View>
            )}

            {tipo === 'estudiante' && (
              <>
                {/* Acerca de */}
                {!!data.descripcion && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Acerca de</Text>
                    <View style={styles.aboutCard}>
                      <Text style={styles.aboutText}>{data.descripcion}</Text>
                    </View>
                  </View>
                )}

                {/* Horas de avance */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Horas de avance</Text>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${pct}%` }]} />
                  </View>
                  <Text style={styles.progressLabel}>
                    {horasAprobadas} / {horasObjetivo} horas · {pct}%
                  </Text>
                </View>

                {/* Contacto */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Información de contacto</Text>
                  <InfoRow icon="mail-outline" label="Correo" value={correo || 'No disponible'} colors={colors} styles={styles} />
                  <InfoRow icon="call-outline" label="Teléfono" value={data.telefono || 'No disponible'} colors={colors} styles={styles} />
                  {!!data.web && (
                    <InfoRow icon="globe-outline" label="Web" value={String(data.web)} colors={colors} styles={styles} noTranslate />
                  )}
                  <InfoRow icon="school-outline" label="Universidad vinculada" value={uniNombre || 'No disponible'} colors={colors} styles={styles} noTranslate={!!uniNombre} />
                  <InfoRow icon="people-outline" label="Grupo" value={grupoNombre || 'Sin grupo'} colors={colors} styles={styles} noTranslate={!!grupoNombre} />
                  {(() => {
                    const ubic = [data.distrito ?? data.ciudad, data.departamento].filter(Boolean).join(', ');
                    return ubic
                      ? <InfoRow icon="location-outline" label="Ubicación" value={ubic} colors={colors} styles={styles} noTranslate />
                      : null;
                  })()}
                  {/* Dirección exacta: solo empresa/universidad */}
                  {puedeVerUbicacion && !!data.direccion && (
                    <InfoRow icon="home-outline" label="Dirección" value={String(data.direccion)} colors={colors} styles={styles} noTranslate />
                  )}
                  {!!data.instagram && (
                    <InfoRow icon="logo-instagram" label="Instagram" value={String(data.instagram)} colors={colors} styles={styles} noTranslate />
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

                {/* Habilidades — el campo real en perfiles_estudiantes es `skills`. */}
                {!!data.skills &&
                  (Array.isArray(data.skills) ? data.skills.length > 0 : String(data.skills).trim().length > 0) && (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Habilidades</Text>
                      <View style={styles.skillsRow}>
                        {(Array.isArray(data.skills) ? data.skills : String(data.skills).split(','))
                          .map((h: string) => String(h).trim())
                          .filter(Boolean)
                          .map((h: string, i: number) => (
                            <View key={i} style={styles.skillTag}>
                              <Text style={styles.skillText} noTranslate>{h}</Text>
                            </View>
                          ))}
                      </View>
                    </View>
                  )}

                {/* Currículum */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Currículum</Text>
                  {data.cv_url ? (
                    <View style={styles.redesRow}>
                      <TouchableOpacity style={styles.redBtn} onPress={() => abrirLink(data.cv_url)}>
                        <Ionicons name="document-text-outline" size={18} color={colors.primaryLight} />
                        <Text style={styles.redText}>Ver CV</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.redBtn} onPress={() => abrirLink(data.cv_url)}>
                        <Ionicons name="download-outline" size={18} color={colors.primaryLight} />
                        <Text style={styles.redText}>Descargar</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={styles.progressLabel}>Sin currículum adjunto.</Text>
                  )}
                </View>

                {/* Reportar perfil */}
                {!esMiPerfil && (
                  <View style={styles.section}>
                    <TouchableOpacity
                      style={[styles.reportBtn, { borderColor: isDark ? '#ef4444' : '#dc2626' }]}
                      onPress={() => setShowReportar(true)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="flag-outline" size={14} color={isDark ? '#ef4444' : '#dc2626'} />
                      <Text style={[styles.reportText, { color: isDark ? '#ef4444' : '#dc2626' }]}>
                        Reportar perfil
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}

            {tipo === 'empresa' && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Información</Text>
                <InfoRow icon="business-outline" label="Industria" value={data.industria || '—'} colors={colors} styles={styles} />
                <InfoRow icon="star-outline" label="Plan" value={(data.plan === 'premium' || data.premium) ? 'Premium' : data.plan === 'mensual' ? 'Básico' : 'Gratuito'} colors={colors} styles={styles} />
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

    {!esMiPerfil && !!data && tipo === 'estudiante' && (
      <ReportarUsuarioModal
        visible={showReportar}
        reportadoId={profileId}
        reportadoNombre={nombre}
        onClose={() => setShowReportar(false)}
      />
    )}
    </>
  );
}

// ─────────────────────────────────────────────
// SUBCOMPONENTES
// ─────────────────────────────────────────────
function InfoRow({ icon, label, value, colors, styles, noTranslate }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; value: string;
  colors: GradlyColors; styles: any; noTranslate?: boolean;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={colors.primaryLight} style={{ width: 26 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={1} noTranslate={noTranslate}>{value}</Text>
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
  // El perfil es una pantalla completa; en tablet/escritorio se topa a una
  // columna legible y se centra en vez de estirarse de borde a borde.
  pageMax: { width: '100%', maxWidth: 720, alignSelf: 'center' },
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

  estadoPill: {
    marginTop: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.backgroundCard,
  },
  estadoPillText: { fontSize: 11.5, fontFamily: FONTS.interSemiBold, color: COLORS.textSecondary },

  aboutCard: {
    backgroundColor: COLORS.backgroundCard, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  aboutText: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textPrimary, lineHeight: 20 },

  progressTrack: { height: 10, borderRadius: 5, backgroundColor: COLORS.backgroundSurface, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 5 },
  progressLabel: { fontSize: 12, fontFamily: FONTS.interMedium, color: COLORS.textMuted },

  skillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  skillTag: {
    backgroundColor: COLORS.primary12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.primary35,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  skillText: { fontSize: 12, fontFamily: FONTS.interMedium, color: COLORS.primaryLight },

  reportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, borderWidth: 1, borderRadius: 12,
  },
  reportText: { fontSize: 12.5, fontFamily: FONTS.interSemiBold },

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
});
