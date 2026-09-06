// ════════════════════════════════════════════════════════════════════════
// GrupoEstudiantesModal — detalle de un grupo para la UNIVERSIDAD.
//
// Se abre al tocar una tarjeta de grupo en "Mis Estudiantes". Muestra:
//   · nombre, carrera/especialidad, fecha de creación, horas a cumplir,
//     y un botón para el chat oficial del grupo (el mismo de la fila, para
//     no crear salas duplicadas).
//   · un cuadro con los estudiantes del grupo: avatar + nombre (→ perfil),
//     estado "Activo" + basurero + botón de chat individual (reusa el DM
//     canónico, no crea uno nuevo), barra de progreso de su pasantía si la
//     tiene, y el título de la pasantía + empresa (ambos tocables → detalle
//     de la pasantía / perfil de la empresa).
//
// Es autónomo: carga sus propios datos con listeners en vivo. La única
// dependencia del padre es `onAbrirChat`, para abrir el chat dentro de la
// sección "Mensajes" del dashboard.
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../config/firebaseConfig';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { progresoPorMeta } from '../utils/horasPasantia';
import {
  abrirChatDirectoUsuarios,
  crearChatGrupoOficial,
} from '../services/chatService';
import { eliminarEstudiante as eliminarEstudianteCF } from '../services/universidadService';
import { AutoText as Text } from './AutoText';
import { showAlert, showConfirm } from './AppAlert';
import ProfileViewerModal from './ProfileViewerModal';
import StorageAvatar from './StorageAvatar';
import VacanteDetailModal, { type VacanteDetalle } from './VacanteDetailModal';

interface Props {
  visible: boolean;
  grupoId: string | null;
  universidadId: string;
  onClose: () => void;
  /** Abre un chat (grupo o DM) dentro de la sección "Mensajes" del dashboard. */
  onAbrirChat: (chatId: string, peerName: string) => void;
}

interface GrupoInfo {
  nombre: string;
  carrera: string;
  docente: string;
  horas: number | null;
  fechaCreacion: any;
}

interface EstudianteFila {
  id: string;
  nombre: string;
  carrera: string;
  fotoUrl: string | null;
  activo: boolean;
}

interface AsignInfo {
  vacanteId: string;
  vacanteTitulo: string;
  empresaId: string;
  empresaNombre: string;
  horario: any;
  fechaPresentacion: string | null;
  horasCumplidas: number;
}

const MESES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

function fechaCorta(ts: any): string {
  if (!ts) return 'No disponible';
  const d: Date = ts?.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return 'No disponible';
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

export default function GrupoEstudiantesModal({
  visible, grupoId, universidadId, onClose, onAbrirChat,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [grupo, setGrupo] = useState<GrupoInfo | null>(null);
  const [nombreUni, setNombreUni] = useState('');
  const [estudiantes, setEstudiantes] = useState<EstudianteFila[]>([]);
  const [asignPorEst, setAsignPorEst] = useState<Record<string, AsignInfo>>({});

  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [chatCargando, setChatCargando] = useState(false);

  // Modales anidados
  const [perfilEstId, setPerfilEstId] = useState<string | null>(null);
  const [perfilEmpresaId, setPerfilEmpresaId] = useState<string | null>(null);
  const [vacDetalle, setVacDetalle] = useState<VacanteDetalle | null>(null);

  // ── Documento del grupo + nombre de la universidad ──
  useEffect(() => {
    if (!visible || !grupoId) { setGrupo(null); return; }
    let vivo = true;
    setLoading(true);
    (async () => {
      try {
        const [gSnap, uSnap] = await Promise.all([
          getDoc(doc(db, 'grupos', grupoId)),
          getDoc(doc(db, 'perfiles_universidades', universidadId)).catch(() => null),
        ]);
        if (!vivo) return;
        if (uSnap && uSnap.exists()) {
          setNombreUni((uSnap.data() as any).nombre_universidad ?? (uSnap.data() as any).nombre ?? '');
        }
        if (!gSnap.exists()) { setGrupo(null); return; }
        const g = gSnap.data() as any;
        setGrupo({
          nombre: g.nombre ?? 'Grupo',
          carrera: g.carrera ?? '',
          docente: g.docente ?? '',
          horas: g.total_horas ?? g.horasRequeridas ?? null,
          fechaCreacion: g.fecha_creacion ?? null,
        });
      } catch (e) {
        console.warn('Error cargando grupo:', e);
        if (vivo) setGrupo(null);
      } finally {
        if (vivo) setLoading(false);
      }
    })();
    return () => { vivo = false; };
  }, [visible, grupoId, universidadId]);

  // ── Estudiantes del grupo (en vivo). El `where('universidad_id')` es
  //    OBLIGATORIO por reglas (ver gotcha_query_estudiantes_por_grupo). ──
  useEffect(() => {
    if (!visible || !grupoId || !universidadId) { setEstudiantes([]); return; }
    const unsub = onSnapshot(
      query(
        collection(db, 'perfiles_estudiantes'),
        where('grupo_id', '==', grupoId),
        where('universidad_id', '==', universidadId),
      ),
      snap => setEstudiantes(
        snap.docs
          .map(d => {
            const x = d.data() as any;
            return {
              id: d.id,
              nombre: x.nombre_completo ?? 'Estudiante',
              carrera: x.carrera ?? '',
              fotoUrl: x.foto_url ?? null,
              // Misma semántica que la fila de "Estudiantes Registrados".
              activo: !!x.activo,
            };
          })
          .sort((a, b) => a.nombre.localeCompare(b.nombre)),
      ),
      e => console.warn('Error en listener (estudiantes del grupo):', e),
    );
    return unsub;
  }, [visible, grupoId, universidadId]);

  // ── Inscripciones de cupo activas de esta universidad (en vivo) ──
  useEffect(() => {
    if (!visible || !universidadId) { setAsignPorEst({}); return; }
    const unsub = onSnapshot(
      query(
        collection(db, 'asignaciones_cupo'),
        where('universidadId', '==', universidadId),
        where('estado', '==', 'tomado'),
      ),
      snap => {
        const map: Record<string, AsignInfo> = {};
        snap.docs.forEach(d => {
          const a = d.data() as any;
          if (!a.estudianteId) return;
          map[a.estudianteId] = {
            vacanteId: a.vacanteId ?? '',
            vacanteTitulo: a.vacanteTitulo ?? 'Pasantía',
            empresaId: a.empresaId ?? '',
            empresaNombre: a.empresaNombre ?? 'Empresa',
            horario: a.horario ?? null,
            fechaPresentacion: a.fechaPresentacion ?? null,
            horasCumplidas: Number(a.horasCumplidas) || 0,
          };
        });
        setAsignPorEst(map);
      },
      e => console.warn('Error en listener (asignaciones del grupo):', e),
    );
    return unsub;
  }, [visible, universidadId]);

  const abrirChatGrupo = async () => {
    if (!grupoId || !grupo || chatCargando) return;
    setChatCargando(true);
    try {
      const chatId = await crearChatGrupoOficial({
        universidadId, grupoId, grupoNombre: grupo.nombre, universidadNombre: nombreUni,
      });
      onClose();
      onAbrirChat(chatId, grupo.nombre);
    } catch (e) {
      console.warn('Error abriendo chat de grupo:', e);
      void showAlert('Error', 'No se pudo abrir el chat del grupo. Intenta de nuevo.');
    } finally {
      setChatCargando(false);
    }
  };

  const abrirChatEstudiante = async (est: EstudianteFila) => {
    if (chatCargando) return;
    setChatCargando(true);
    try {
      const chatId = await abrirChatDirectoUsuarios({
        yo: { uid: universidadId, nombre: nombreUni || 'Universidad', rol: 'universidad' },
        otro: { uid: est.id, nombre: est.nombre, rol: 'estudiante' },
      });
      onClose();
      onAbrirChat(chatId, est.nombre);
    } catch (e) {
      console.warn('Error abriendo chat con estudiante:', e);
      void showAlert('Error', 'No se pudo abrir el chat. Intenta de nuevo.');
    } finally {
      setChatCargando(false);
    }
  };

  const eliminarEst = async (est: EstudianteFila) => {
    if (eliminandoId) return;
    const ok = await showConfirm({
      title: 'Eliminar estudiante',
      message: `¿Eliminar la cuenta de "${est.nombre}"? Esta acción no se puede deshacer.`,
      confirmText: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;
    setEliminandoId(est.id);
    try {
      await eliminarEstudianteCF({ estudianteId: est.id });
      // El listener quita la fila solo; no hace falta tocar el estado.
    } catch (e: any) {
      void showAlert('No se pudo eliminar', e?.message ?? 'Intenta de nuevo.');
    } finally {
      setEliminandoId(null);
    }
  };

  const abrirDetallePasantia = async (a: AsignInfo) => {
    if (!a.vacanteId) return;
    try {
      const snap = await getDoc(doc(db, 'vacantes', a.vacanteId));
      setVacDetalle(
        snap.exists()
          ? ({ id: snap.id, ...(snap.data() as any) } as VacanteDetalle)
          : ({ id: a.vacanteId, titulo: a.vacanteTitulo, nombre_empresa: a.empresaNombre, empresa_id: a.empresaId, horario: a.horario, categoria: 'pasantia' } as VacanteDetalle),
      );
    } catch {
      setVacDetalle({ id: a.vacanteId, titulo: a.vacanteTitulo, nombre_empresa: a.empresaNombre, empresa_id: a.empresaId, horario: a.horario, categoria: 'pasantia' } as VacanteDetalle);
    }
  };

  if (!visible) return null;

  return (
    <>
      <Modal visible transparent animationType="none" onRequestClose={onClose}>
        <View style={[s.root, { paddingTop: insets.top }]}>
          <View style={s.header}>
            <TouchableOpacity onPress={onClose} style={s.backBtn} hitSlop={10}>
              <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={s.headerTitle}>Detalle del grupo</Text>
            <View style={{ width: 32 }} />
          </View>

          {loading ? (
            <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>
          ) : !grupo ? (
            <View style={s.center}>
              <Ionicons name="alert-circle-outline" size={40} color={colors.textMuted} />
              <Text style={s.emptyText}>No se encontró este grupo.</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>
              {/* ── Datos del grupo ── */}
              <View style={s.hero}>
                <View style={s.groupIcon}>
                  <Ionicons name="people" size={30} color={colors.primaryLight} />
                </View>
                <Text style={s.nombre} noTranslate>{grupo.nombre}</Text>
              </View>

              <View style={s.section}>
                <InfoRow icon="book-outline" label="Carrera o especialidad" value={grupo.carrera || 'No especificada'} s={s} colors={colors} />
                <InfoRow icon="calendar-outline" label="Fecha de creación" value={fechaCorta(grupo.fechaCreacion)} s={s} colors={colors} />
                <InfoRow icon="time-outline" label="Horas a cumplir" value={grupo.horas ? `${grupo.horas} horas` : 'No especificado'} s={s} colors={colors} />
                {!!grupo.docente && (
                  <InfoRow icon="person-outline" label="Docente" value={grupo.docente} s={s} colors={colors} />
                )}
                <TouchableOpacity style={s.chatGrupoBtn} onPress={abrirChatGrupo} disabled={chatCargando} activeOpacity={0.85}>
                  {chatCargando
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <>
                        <Ionicons name="chatbubbles" size={16} color="#fff" />
                        <Text style={s.chatGrupoBtnTxt}>Chat del grupo</Text>
                      </>}
                </TouchableOpacity>
              </View>

              {/* ── Estudiantes del grupo ── */}
              <View style={s.section}>
                <View style={s.cardHeaderRow}>
                  <Text style={s.sectionTitle}>Estudiantes del grupo</Text>
                  <Text style={s.countBadge} noTranslate>{estudiantes.length}</Text>
                </View>

                {estudiantes.length === 0 ? (
                  <Text style={s.emptyInline}>Aún no hay estudiantes registrados en este grupo.</Text>
                ) : (
                  estudiantes.map(est => {
                    const a = asignPorEst[est.id];
                    const meta = grupo.horas ?? 0;
                    const prog = a
                      ? progresoPorMeta(a.horario, a.fechaPresentacion, meta)
                      : null;
                    const cumplidas = a ? Math.max(Math.round(prog?.cumplidas ?? 0), Math.round(a.horasCumplidas)) : 0;
                    const pct = meta > 0 ? Math.min(100, Math.round((cumplidas / meta) * 100)) : 0;
                    return (
                      <View key={est.id} style={s.estBox}>
                        <View style={s.estTopRow}>
                          <StorageAvatar url={est.fotoUrl} size={38} fallbackIcon="person" />
                          <TouchableOpacity
                            style={{ flex: 1 }}
                            activeOpacity={0.7}
                            onPress={() => setPerfilEstId(est.id)}
                          >
                            <Text style={s.estNombre} numberOfLines={1} noTranslate>{est.nombre}</Text>
                            <Text style={s.estMeta} numberOfLines={1} noTranslate>{est.carrera || 'Sin carrera'}</Text>
                          </TouchableOpacity>
                          <View style={[s.estadoBadge, !est.activo && s.estadoBadgeOff]}>
                            <Text style={[s.estadoTxt, !est.activo && { color: colors.textMuted }]}>
                              {est.activo ? 'Activo' : 'Pendiente'}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => eliminarEst(est)}
                            disabled={eliminandoId === est.id}
                            hitSlop={8}
                            style={s.estIconBtn}
                            accessibilityLabel="Eliminar estudiante"
                          >
                            {eliminandoId === est.id
                              ? <ActivityIndicator size="small" color={colors.error} />
                              : <Ionicons name="trash-outline" size={17} color={colors.error} />}
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => abrirChatEstudiante(est)}
                            disabled={chatCargando}
                            hitSlop={8}
                            style={s.estIconBtn}
                            accessibilityLabel="Chatear con el estudiante"
                          >
                            <Ionicons name="chatbubble-ellipses-outline" size={17} color={colors.primaryLight} />
                          </TouchableOpacity>
                        </View>

                        {a ? (
                          <>
                            {meta > 0 && (
                              <>
                                <View style={s.progRow}>
                                  <Text style={s.estMeta}>Progreso de la pasantía</Text>
                                  <Text style={s.progHoras} noTranslate>{cumplidas}/{meta} h</Text>
                                </View>
                                <View style={s.progTrack}>
                                  <View style={[s.progFill, { width: `${pct}%` as any }]} />
                                </View>
                              </>
                            )}
                            <View style={s.pasantiaRow}>
                              <TouchableOpacity activeOpacity={0.7} onPress={() => abrirDetallePasantia(a)}>
                                <Text style={s.pasantiaTitulo} numberOfLines={1} noTranslate>{a.vacanteTitulo}</Text>
                              </TouchableOpacity>
                              <Text style={s.estMeta} noTranslate> · </Text>
                              <TouchableOpacity activeOpacity={0.7} onPress={() => a.empresaId && setPerfilEmpresaId(a.empresaId)}>
                                <Text style={s.pasantiaEmpresa} numberOfLines={1} noTranslate>{a.empresaNombre}</Text>
                              </TouchableOpacity>
                            </View>
                          </>
                        ) : (
                          <Text style={[s.estMeta, { marginTop: 6 }]}>Sin pasantía activa.</Text>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>

      {perfilEstId && (
        <ProfileViewerModal visible tipo="estudiante" profileId={perfilEstId} onClose={() => setPerfilEstId(null)} />
      )}
      {perfilEmpresaId && (
        <ProfileViewerModal visible tipo="empresa" profileId={perfilEmpresaId} onClose={() => setPerfilEmpresaId(null)} />
      )}
      <VacanteDetailModal
        visible={!!vacDetalle}
        vacante={vacDetalle}
        onClose={() => setVacDetalle(null)}
        inscritosUniversidadId={universidadId}
      />
    </>
  );
}

function InfoRow({ icon, label, value, s, colors }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; value: string; s: any; colors: GradlyColors;
}) {
  return (
    <View style={s.infoRow}>
      <Ionicons name={icon} size={17} color={colors.primaryLight} style={{ width: 24 }} />
      <View style={{ flex: 1 }}>
        <Text style={s.infoLabel}>{label}</Text>
        <Text style={s.infoValue} numberOfLines={2} noTranslate>{value}</Text>
      </View>
    </View>
  );
}

const makeStyles = (COLORS: GradlyColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: COLORS.backgroundDark },
    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: COLORS.border,
    },
    backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
    emptyText: { fontSize: 14, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
    hero: { alignItems: 'center', paddingVertical: 22, gap: 10 },
    groupIcon: {
      width: 66, height: 66, borderRadius: 33,
      backgroundColor: COLORS.primary12, alignItems: 'center', justifyContent: 'center',
    },
    nombre: { fontSize: 19, fontFamily: FONTS.soraBold, color: COLORS.textPrimary, textAlign: 'center', paddingHorizontal: 24 },
    section: {
      marginHorizontal: 16, marginBottom: 16, padding: 14, borderRadius: 16,
      backgroundColor: COLORS.backgroundCard, borderWidth: 1, borderColor: COLORS.border,
    },
    sectionTitle: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
    cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    countBadge: {
      fontSize: 12, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight,
      backgroundColor: COLORS.primary12, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8,
    },
    infoRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8 },
    infoLabel: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted, marginBottom: 2 },
    infoValue: { fontSize: 14, fontFamily: FONTS.interMedium, color: COLORS.textPrimary },
    chatGrupoBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 11, marginTop: 10,
    },
    chatGrupoBtnTxt: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: '#fff' },
    emptyInline: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textMuted, paddingVertical: 8 },
    estBox: {
      borderTopWidth: 1, borderTopColor: COLORS.border,
      paddingTop: 12, paddingBottom: 4, gap: 6,
    },
    estTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    estNombre: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
    estMeta: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted, marginTop: 1 },
    estadoBadge: {
      paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20,
      borderWidth: 1, borderColor: COLORS.success + '55', backgroundColor: COLORS.success + '22',
    },
    estadoBadgeOff: { borderColor: COLORS.border, backgroundColor: 'transparent' },
    estadoTxt: { fontSize: 10.5, fontFamily: FONTS.interSemiBold, color: COLORS.success },
    estIconBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
    progRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
    progHoras: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },
    progTrack: { height: 6, borderRadius: 3, backgroundColor: COLORS.border, overflow: 'hidden' },
    progFill: { height: 6, borderRadius: 3, backgroundColor: COLORS.primary },
    pasantiaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, flexWrap: 'wrap' },
    pasantiaTitulo: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },
    pasantiaEmpresa: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight, textDecorationLine: 'underline' },
  });
