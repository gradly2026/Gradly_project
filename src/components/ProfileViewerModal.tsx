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
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
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
import { FONTS, useTheme, webScrollStyle, type GradlyColors } from '../context/ThemeContext';
import { useIniciarChat } from '../hooks/useIniciarChat';
import { subscribeUserChats, type ChatListItem } from '../services/chatService';
import StorageAvatar from './StorageAvatar';
import { ResenasResumen } from './ResenasFeedback';
import TrabajaParaCard from './TrabajaParaCard';
import ReportarUsuarioModal from './ReportarUsuarioModal';
import UbicacionCardSV from './UbicacionCardSV';
import UbicacionPrecisaModal from './UbicacionPrecisaModal';
import TopEstudiantesCard from './TopEstudiantesCard';
import CalendarioEventos from './CalendarioEventos';
import type { TopEstudianteEntry } from '../services/topEstudiantesService';
import { progresoPorMeta, type ProgresoMeta } from '../utils/horasPasantia';

export type ProfileTipo = 'estudiante' | 'empresa' | 'universidad';

interface Props {
  visible: boolean;
  onClose: () => void;
  tipo: ProfileTipo;
  profileId: string;
  /** Solo lo pasa el panel de admin: al tocar el nombre de una pasantía en la
   *  lista de estudiantes de una empresa, lleva al admin a esa pasantía y abre
   *  su modal de detalle. Recibe el doc crudo de `asignaciones_cupo` (con `id`). */
  onVerPasantiaCupo?: (asignacion: any) => void;
}

const COLECCION_POR_TIPO: Record<ProfileTipo, string> = {
  estudiante:  'perfiles_estudiantes',
  empresa:     'perfiles_empresas',
  universidad: 'perfiles_universidades',
};

export default function ProfileViewerModal({ visible, onClose, tipo, profileId, onVerPasantiaCupo }: Props) {
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
  const [verUbicPrecisa, setVerUbicPrecisa] = useState(false);
  // Estudiante destacado abierto desde el cuadro "Estudiantes destacados".
  const [verEstudianteId, setVerEstudianteId] = useState<string | null>(null);
  // "En qué empresa hizo su pasantía" (solo si el que mira puede leerlo).
  const [empresaPasantia, setEmpresaPasantia] = useState<{ id: string; nombre: string } | null>(null);
  // Progreso REAL del libro de horas de la pasantía por cupo EN CURSO del
  // estudiante (`progresoPorMeta`). Durante la pasantía las horas viven aquí,
  // no en `horas_aprobadas` (que solo se acredita al certificar).
  const [progresoLibro, setProgresoLibro] = useState<ProgresoMeta | null>(null);

  // ── Extras SOLO para el admin ──
  // Estudiante: datos de su pasantía por cupo (barra + universidad + empresa +
  // calendario). Se llena solo si tiene/tuvo una asignación de cupo → así el
  // cuadro no sale para los "nuevos".
  const [asigAdmin, setAsigAdmin] = useState<{
    horario: any;
    fechaPresentacion: string | null;
    fechaFin: Date | null;
    empresaNombre: string;
    universidadNombre: string;
    vacanteTitulo: string;
    cumplidas: number;
    meta: number;
    pct: number;
  } | null>(null);
  // Empresa: estudiantes que hacen / hicieron su pasantía por cupo con ella.
  type EstEmpresaFila = {
    id: string;
    estudianteId: string;
    nombre: string;
    carrera: string;
    universidadNombre: string;
    vacanteTitulo: string;
    fechaPresentacion: string | null;
    cumplidas: number;
    meta: number;
    pct: number;
    fechaFin: Date | null;
    raw: any;
  };
  const [estEmpresa, setEstEmpresa] = useState<EstEmpresaFila[] | null>(null);
  const [verEstEmpresa, setVerEstEmpresa] = useState(false);

  const puedeVerUbicacion = rol === 'empresa' || rol === 'universidad';
  // Los cuadros de "estudiantes destacados" (auto-reportados en el perfil) solo
  // se muestran a quien ya puede leer datos de estudiantes: empresa / universidad
  // / admin. Ver topEstudiantesService.
  const puedeVerTopEst = rol === 'empresa' || rol === 'universidad' || rol === 'admin';
  const topEstudiantes: TopEstudianteEntry[] = Array.isArray(data?.top_estudiantes) ? data.top_estudiantes : [];

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

  // ── "Empresa de su pasantía" (solo estudiante) ──
  // Best-effort: las reglas de `asignaciones_cupo` solo dejan leer al propio
  // estudiante / su universidad / la empresa del cupo / admin. Si la lectura
  // falla o no hay pasantía, la fila simplemente no se muestra.
  useEffect(() => {
    if (!visible || !profileId || tipo !== 'estudiante') { setEmpresaPasantia(null); return; }
    let cancel = false;
    getDocs(query(collection(db, 'asignaciones_cupo'), where('estudianteId', '==', profileId)))
      .then(snap => {
        if (cancel) return;
        const a = snap.docs
          .map(d => d.data() as any)
          .find(x => x.estado !== 'cancelado' && (x.empresaNombre || x.empresaId));
        setEmpresaPasantia(a ? { id: a.empresaId ?? '', nombre: a.empresaNombre ?? 'Empresa' } : null);
      })
      .catch(() => { if (!cancel) setEmpresaPasantia(null); });
    return () => { cancel = true; };
  }, [visible, profileId, tipo]);

  // ── Progreso del libro de horas (pasantía por cupo en curso) ──────
  // Best-effort. La consulta usa UN solo `where` de igualdad (sin índice
  // compuesto) elegido por el rol del que mira, para que las reglas de
  // `asignaciones_cupo` (OR de igualdades por uid) la dejen pasar: universidad
  // → where('universidadId'), empresa → where('empresaId'), admin (rol puro) /
  // propio estudiante → where('estudianteId'). El filtro por estudiante y por
  // estado se hace en memoria.
  useEffect(() => {
    if (!visible || !profileId || tipo !== 'estudiante') { setProgresoLibro(null); return; }
    let cancel = false;
    (async () => {
      try {
        const q =
          rol === 'universidad' && user?.uid
            ? query(collection(db, 'asignaciones_cupo'), where('universidadId', '==', user.uid))
            : rol === 'empresa' && user?.uid
            ? query(collection(db, 'asignaciones_cupo'), where('empresaId', '==', user.uid))
            : query(collection(db, 'asignaciones_cupo'), where('estudianteId', '==', profileId));
        const snap = await getDocs(q);
        if (cancel) return;
        const activa = snap.docs
          .map(d => d.data() as any)
          .find(x => x.estudianteId === profileId && x.estado !== 'cancelado' && x.finalizada !== true && x.fechaPresentacion && x.grupoId);
        if (!activa) { setProgresoLibro(null); return; }
        const g = await getDoc(doc(db, 'grupos', activa.grupoId));
        if (cancel) return;
        const gd = g.exists() ? (g.data() as any) : {};
        const meta = Number(gd.horasRequeridas ?? gd.total_horas ?? 0);
        const p = progresoPorMeta(activa.horario, activa.fechaPresentacion, meta);
        if (!cancel) setProgresoLibro(p.valido ? p : null);
      } catch {
        if (!cancel) setProgresoLibro(null);
      }
    })();
    return () => { cancel = true; };
  }, [visible, profileId, tipo, rol, user?.uid]);

  // ── ADMIN · datos de la pasantía por cupo del ESTUDIANTE ──────────
  // Toma su asignación (activa si la hay, si no la más reciente no cancelada),
  // lee la meta del grupo y calcula el progreso. Si no tiene ninguna, queda en
  // null y el cuadro extra no se muestra (así no sale para los "nuevos").
  useEffect(() => {
    if (!visible || !profileId || tipo !== 'estudiante' || rol !== 'admin') { setAsigAdmin(null); return; }
    let cancel = false;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'asignaciones_cupo'), where('estudianteId', '==', profileId)));
        if (cancel) return;
        const docs = snap.docs.map(d => d.data() as any).filter(x => x.estado !== 'cancelado');
        if (docs.length === 0) { setAsigAdmin(null); return; }
        const activa = docs.find(x => x.finalizada !== true);
        const a =
          activa ??
          docs.slice().sort((x, y) => {
            const ty = y.finalizadaAt?.toMillis?.() ?? y.fechaTomado?.toMillis?.() ?? 0;
            const tx = x.finalizadaAt?.toMillis?.() ?? x.fechaTomado?.toMillis?.() ?? 0;
            return ty - tx;
          })[0];
        let meta = 0;
        if (a.grupoId) {
          const g = await getDoc(doc(db, 'grupos', a.grupoId));
          if (cancel) return;
          const gd = g.exists() ? (g.data() as any) : {};
          meta = Number(gd.horasRequeridas ?? gd.total_horas ?? 0);
        }
        const p = a.fechaPresentacion && meta > 0 ? progresoPorMeta(a.horario, a.fechaPresentacion, meta) : null;
        let uniNom = '';
        if (a.universidadId) {
          const u = await getDoc(doc(db, 'perfiles_universidades', a.universidadId));
          if (cancel) return;
          uniNom = u.exists() ? String((u.data() as any).nombre_universidad ?? '') : '';
        }
        const completa = a.finalizada === true;
        const metaFinal = completa ? Number(a.horasCumplidas ?? meta) || meta : p?.valido ? p.meta : meta;
        setAsigAdmin({
          horario: a.horario ?? null,
          fechaPresentacion: a.fechaPresentacion ?? null,
          fechaFin: p?.valido ? p.fechaFin : null,
          empresaNombre: a.empresaNombre ?? '',
          universidadNombre: uniNom,
          vacanteTitulo: a.vacanteTitulo ?? '',
          cumplidas: completa ? metaFinal : Math.round(p?.valido ? p.cumplidas : 0),
          meta: metaFinal,
          pct: completa ? 100 : p?.valido ? p.pct : 0,
        });
      } catch {
        if (!cancel) setAsigAdmin(null);
      }
    })();
    return () => { cancel = true; };
  }, [visible, profileId, tipo, rol]);

  // ── ADMIN · estudiantes en pasantía por cupo con esta EMPRESA ─────
  useEffect(() => {
    if (!visible || !profileId || tipo !== 'empresa' || rol !== 'admin') { setEstEmpresa(null); return; }
    let cancel = false;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'asignaciones_cupo'), where('empresaId', '==', profileId)));
        if (cancel) return;
        const docs = snap.docs
          .map(d => ({ id: d.id, ...(d.data() as any) }))
          .filter(x => x.estado !== 'cancelado');
        const grupoIds = Array.from(new Set(docs.map(x => x.grupoId).filter(Boolean))) as string[];
        const metaPorGrupo: Record<string, number> = {};
        await Promise.all(
          grupoIds.map(async gid => {
            try {
              const g = await getDoc(doc(db, 'grupos', gid));
              const gd = g.exists() ? (g.data() as any) : {};
              metaPorGrupo[gid] = Number(gd.horasRequeridas ?? gd.total_horas ?? 0);
            } catch {
              metaPorGrupo[gid] = 0;
            }
          }),
        );
        const uniIds = Array.from(new Set(docs.map(x => x.universidadId).filter(Boolean))) as string[];
        const uniNom: Record<string, string> = {};
        await Promise.all(
          uniIds.map(async id2 => {
            try {
              const u = await getDoc(doc(db, 'perfiles_universidades', id2));
              uniNom[id2] = u.exists() ? String((u.data() as any).nombre_universidad ?? '') : '';
            } catch {
              uniNom[id2] = '';
            }
          }),
        );
        if (cancel) return;
        const filas: EstEmpresaFila[] = docs
          .map(x => {
            const meta = x.grupoId ? metaPorGrupo[x.grupoId] ?? 0 : 0;
            const p = x.fechaPresentacion && meta > 0 ? progresoPorMeta(x.horario, x.fechaPresentacion, meta) : null;
            const completa = x.finalizada === true;
            const metaFinal = completa ? Number(x.horasCumplidas ?? meta) || meta : p?.valido ? p.meta : meta;
            return {
              id: x.id,
              estudianteId: x.estudianteId ?? '',
              nombre: x.estudianteNombre ?? 'Estudiante',
              carrera: x.carrera ?? '',
              universidadNombre: x.universidadId ? uniNom[x.universidadId] ?? '' : '',
              vacanteTitulo: x.vacanteTitulo ?? '',
              fechaPresentacion: x.fechaPresentacion ?? null,
              cumplidas: completa ? metaFinal : Math.round(p?.valido ? p.cumplidas : 0),
              meta: metaFinal,
              pct: completa ? 100 : p?.valido ? p.pct : 0,
              fechaFin: p?.valido ? p.fechaFin : null,
              raw: x,
            };
          })
          .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
        setEstEmpresa(filas);
      } catch {
        if (!cancel) setEstEmpresa(null);
      }
    })();
    return () => { cancel = true; };
  }, [visible, profileId, tipo, rol]);

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

  // Horas de avance. Con una pasantía por cupo EN CURSO, las horas reales salen
  // del libro de horas (`progresoLibro`); si no, del expediente
  // (`horas_aprobadas`, que solo se acredita al certificar).
  const progVal = !!progresoLibro?.valido;
  const horasAprobadas = progVal ? Math.round(progresoLibro!.cumplidas) : (data?.horas_aprobadas ?? 0);
  const horasObjetivo  = progVal ? progresoLibro!.meta : (data?.horas_objetivo ?? 500);
  // El expediente ya certificó suficientes horas (flujo de GRUPO,
  // `certificarPasantia` en solicitudPracticaService, que acredita
  // `horas_aprobadas` sin tocar la asignación de cupo). Esto puede pasar
  // aunque además quede una `asignaciones_cupo` sin cerrar formalmente (nadie
  // marcó `finalizada`, p.ej. porque el estudiante nunca reabrió su pantalla
  // de progreso tras terminar) — antes, en ese caso, el libro en vivo de ESE
  // cupo (con su propia meta y horario, `progVal`) tapaba por completo las
  // horas ya certificadas al expediente y la barra se veía incompleta pese a
  // que el estudiante sí había terminado.
  const horasCertificadasCompletas =
    (data?.horas_aprobadas ?? 0) >= (data?.horas_objetivo ?? 500);
  // El estudiante ya cumplió sus horas cuando alcanza (o supera) la meta, o
  // cuando el sistema marcó su pasantía como 'finalizada' — eso lo pone
  // `finalizarInscripcionPorHoras` al cumplir la meta de horas del cupo, aunque
  // la certificación todavía no haya acreditado `horas_aprobadas` al expediente.
  // En ese caso la barra va llena al 100%.
  const horasCompletas =
    (data as any)?.estado_pasantia === 'finalizada' ||
    horasCertificadasCompletas ||
    (progVal ? progresoLibro!.completado : horasAprobadas >= horasObjetivo);
  const pct = horasCompletas
    ? 100
    : progVal
    ? progresoLibro!.pct
    : Math.min(100, Math.round((horasAprobadas / Math.max(horasObjetivo, 1)) * 100));

  // La insignia "Certificado" NO sale solo por el libro de horas en vivo: con
  // una pasantía por cupo en curso (`progVal`) aún no está certificado — salvo
  // que el expediente ya certificó las horas por otra vía (ver arriba).
  const esGraduado =
    (data as any)?.estado_pasantia === 'finalizada' ||
    horasCertificadasCompletas ||
    (!progVal && pct >= 100);
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
          <ScrollView showsVerticalScrollIndicator={false} style={[styles.pageMax, webScrollStyle(colors)]} contentContainerStyle={{ paddingBottom: 40 }}>
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
                tarjeta "Trabaja para tu empresa" (puesto + fecha). Se autooculta si
                no hay contrato activo (query interna por empresaId == viewer). */}
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
                    {horasCompletas
                      ? `${Math.max(horasAprobadas, horasObjetivo)} / ${horasObjetivo} horas · 100% · Completó sus horas`
                      : `${horasAprobadas} / ${horasObjetivo} horas · ${pct}%`}
                  </Text>
                </View>

                {/* ── Cuadro EXTRA solo para el admin: barra + universidad +
                    empresa + calendario de la pasantía. Sale solo para quien
                    está en pasantía / por certificar / certificado (para los
                    "nuevos" `asigAdmin` y `estado_pasantia` están vacíos). ── */}
                {rol === 'admin' &&
                  (asigAdmin ||
                    esGraduado ||
                    ['en_proceso', 'finalizada'].includes(String((data as any)?.estado_pasantia))) && (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Pasantía · vista admin</Text>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${asigAdmin ? asigAdmin.pct : pct}%` }]} />
                      </View>
                      <Text style={styles.progressLabel} noTranslate>
                        {asigAdmin
                          ? `${asigAdmin.cumplidas} / ${asigAdmin.meta} h · ${asigAdmin.pct}%`
                          : `${horasAprobadas} / ${horasObjetivo} h · ${pct}%`}
                      </Text>
                      <InfoRow
                        icon="school-outline"
                        label="Universidad"
                        value={asigAdmin?.universidadNombre || uniNombre || 'No disponible'}
                        colors={colors}
                        styles={styles}
                        noTranslate={!!(asigAdmin?.universidadNombre || uniNombre)}
                      />
                      <InfoRow
                        icon="business-outline"
                        label="Empresa"
                        value={asigAdmin?.empresaNombre || empresaPasantia?.nombre || 'No disponible'}
                        colors={colors}
                        styles={styles}
                        noTranslate={!!(asigAdmin?.empresaNombre || empresaPasantia?.nombre)}
                      />
                      {!!asigAdmin?.vacanteTitulo && (
                        <InfoRow
                          icon="briefcase-outline"
                          label="Pasantía"
                          value={asigAdmin.vacanteTitulo}
                          colors={colors}
                          styles={styles}
                          noTranslate
                        />
                      )}
                      <View style={{ marginTop: 12 }}>
                        <CalendarioEventos
                          uid={profileId}
                          rol="estudiante"
                          inscripcion={
                            asigAdmin
                              ? {
                                  horario: asigAdmin.horario,
                                  fechaPresentacion: asigAdmin.fechaPresentacion,
                                  fechaFin: asigAdmin.fechaFin,
                                }
                              : null
                          }
                        />
                      </View>
                    </View>
                  )}

                {/* Disponibilidad — la deriva el sistema (perfil.tsx la
                    denormaliza en `disponibilidad_auto`); si no está, se estima
                    del estado de pasantía. */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Disponibilidad</Text>
                  <InfoRow
                    icon="time-outline"
                    label="Estado"
                    value={
                      data.disponibilidad_auto ||
                      (data.estado_pasantia === 'en_proceso' ? 'En pasantía' : 'Disponible')
                    }
                    colors={colors}
                    styles={styles}
                  />
                </View>

                {/* Contacto */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Información de contacto</Text>
                  <InfoRow icon="mail-outline" label="Correo" value={correo || 'No disponible'} colors={colors} styles={styles} />
                  <InfoRow icon="call-outline" label="Teléfono" value={data.telefono || 'No disponible'} colors={colors} styles={styles} noTranslate={!!data.telefono} />
                  {!!data.web && (
                    <InfoRow icon="globe-outline" label="Web" value={String(data.web)} colors={colors} styles={styles} noTranslate />
                  )}
                  <InfoRow icon="school-outline" label="Universidad vinculada" value={uniNombre || 'No disponible'} colors={colors} styles={styles} noTranslate={!!uniNombre} />
                  {empresaPasantia && (
                    <InfoRow icon="briefcase-outline" label="Empresa de su pasantía" value={empresaPasantia.nombre} colors={colors} styles={styles} noTranslate />
                  )}
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
                    <InfoRow icon="logo-instagram" label="Instagram" value={`@${String(data.instagram).replace(/^@/, '')}`} colors={colors} styles={styles} noTranslate />
                  )}
                  {!!data.facebook && (
                    <InfoRow icon="logo-facebook" label="Facebook" value={String(data.facebook)} colors={colors} styles={styles} noTranslate />
                  )}
                </View>

                {/* Redes */}
                {(data.linkedin || data.facebook) && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Redes</Text>
                    <View style={styles.redesRow}>
                      {!!data.linkedin && (
                        <TouchableOpacity style={styles.redBtn} onPress={() => abrirLink(data.linkedin)}>
                          <Ionicons name="logo-linkedin" size={18} color={colors.primaryLight} />
                          <Text style={styles.redText}>LinkedIn</Text>
                        </TouchableOpacity>
                      )}
                      {!!data.facebook && (
                        <TouchableOpacity style={styles.redBtn} onPress={() => abrirLink(data.facebook)}>
                          <Ionicons name="logo-facebook" size={18} color={colors.primaryLight} />
                          <Text style={styles.redText}>Facebook</Text>
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

                {/* Admin: lista de estudiantes en pasantía por cupo con esta empresa. */}
                {rol === 'admin' && (
                  <TouchableOpacity
                    style={styles.adminBtn}
                    activeOpacity={0.85}
                    onPress={() => setVerEstEmpresa(true)}
                  >
                    <Ionicons name="people-outline" size={16} color={colors.primaryLight} />
                    <Text style={styles.adminBtnTxt} noTranslate>
                      {`Estudiantes en pasantía${estEmpresa ? ` (${estEmpresa.length})` : ''}`}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.primaryLight} />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {tipo === 'universidad' && (
              <>
                {/* Acerca de (descripción de la universidad) */}
                {!!data.descripcion && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Acerca de</Text>
                    <View style={styles.aboutCard}>
                      <Text style={styles.aboutText}>{data.descripcion}</Text>
                    </View>
                  </View>
                )}

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Información</Text>
                  {[data.contacto_nombre, data.contacto_cargo].filter(Boolean).length > 0 && (
                    <InfoRow
                      icon="person-outline"
                      label="Representante"
                      value={[data.contacto_nombre, data.contacto_cargo].filter(Boolean).join(' · ')}
                      colors={colors}
                      styles={styles}
                      noTranslate
                    />
                  )}
                  <InfoRow icon="mail-outline" label="Dominio" value={data.dominio_correo || '—'} colors={colors} styles={styles} noTranslate={!!data.dominio_correo} />
                  {(() => {
                    const ubic = [data.distrito ?? data.ciudad, data.departamento].filter(Boolean).join(', ');
                    return ubic
                      ? <InfoRow icon="location-outline" label="Ubicación" value={ubic} colors={colors} styles={styles} noTranslate />
                      : null;
                  })()}
                  {!!data.direccion && (
                    <InfoRow icon="home-outline" label="Dirección" value={String(data.direccion)} colors={colors} styles={styles} noTranslate />
                  )}
                </View>

                {/* Datos de contacto — al final */}
                {(data.telefono || data.contacto_telefono || data.contacto_correo || data.web || data.sitio_web || data.instagram) && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Información de contacto</Text>
                    {!!(data.telefono || data.contacto_telefono) && (
                      <InfoRow icon="call-outline" label="Teléfono" value={String(data.telefono || data.contacto_telefono)} colors={colors} styles={styles} noTranslate />
                    )}
                    {!!data.contacto_correo && (
                      <InfoRow icon="mail-outline" label="Correo" value={String(data.contacto_correo)} colors={colors} styles={styles} noTranslate />
                    )}
                    {!!(data.web || data.sitio_web) && (
                      <InfoRow icon="globe-outline" label="Web" value={String(data.web || data.sitio_web)} colors={colors} styles={styles} noTranslate />
                    )}
                    {!!data.instagram && (
                      <InfoRow icon="logo-instagram" label="Instagram" value={`@${String(data.instagram).replace(/^@/, '')}`} colors={colors} styles={styles} noTranslate />
                    )}
                  </View>
                )}
              </>
            )}

            {/* Estudiantes destacados — solo para empresa / universidad / admin
                (ver puedeVerTopEst). Los datos vienen auto-reportados en el
                propio perfil (topEstudiantesService). */}
            {(tipo === 'empresa' || tipo === 'universidad') && puedeVerTopEst && topEstudiantes.length > 0 && (
              <View style={styles.section}>
                <TopEstudiantesCard
                  titulo={tipo === 'empresa' ? 'Estudiantes destacados en sus puestos' : 'Estudiantes más destacados'}
                  entries={topEstudiantes}
                  onVerEstudiante={setVerEstudianteId}
                  detallado
                  relacionEmpresa={tipo === 'empresa'}
                />
              </View>
            )}

            {(data.departamento || data.distrito || data.ciudad) && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Ubicación</Text>
                <UbicacionCardSV
                  departamento={data.departamento}
                  distrito={data.distrito ?? data.ciudad}
                  puntoGuardado={data.ubicacion_precisa ?? null}
                  // El punto preciso solo se puede consultar en perfiles de
                  // empresa/universidad; el de un estudiante es su domicilio.
                  onPin={
                    (tipo === 'empresa' || tipo === 'universidad')
                      ? () => setVerUbicPrecisa(true)
                      : undefined
                  }
                  pinHabilitado={!!data.ubicacion_precisa}
                />
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

    {!!data && (tipo === 'empresa' || tipo === 'universidad') && (
      <UbicacionPrecisaModal
        visible={verUbicPrecisa}
        onClose={() => setVerUbicPrecisa(false)}
        departamento={data.departamento}
        distrito={data.distrito ?? data.ciudad}
        puntoGuardado={data.ubicacion_precisa ?? null}
        soloLectura
      />
    )}

    {/* ADMIN · modal con los estudiantes en pasantía por cupo con esta empresa. */}
    {rol === 'admin' && tipo === 'empresa' && (
      <Modal visible={verEstEmpresa} transparent animationType="none" onRequestClose={() => setVerEstEmpresa(false)}>
        <View style={styles.estOverlay}>
          <View style={styles.estSheet}>
            <View style={styles.estHeader}>
              <Ionicons name="people-outline" size={18} color={colors.primaryLight} />
              <Text style={styles.estTitulo}>Estudiantes en pasantía</Text>
              <TouchableOpacity onPress={() => setVerEstEmpresa(false)} hitSlop={10}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={webScrollStyle(colors)} contentContainerStyle={{ padding: 16, gap: 12 }}>
              {estEmpresa === null ? (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
              ) : estEmpresa.length === 0 ? (
                <Text style={styles.progressLabel}>Esta empresa no tiene estudiantes en pasantía por cupo.</Text>
              ) : (
                estEmpresa.map(f => {
                  const finISO = f.fechaFin
                    ? `${f.fechaFin.getFullYear()}-${String(f.fechaFin.getMonth() + 1).padStart(2, '0')}-${String(f.fechaFin.getDate()).padStart(2, '0')}`
                    : '';
                  return (
                    <View key={f.id} style={styles.estFila}>
                      <Text style={styles.estFilaNombre} numberOfLines={1} noTranslate>{f.nombre}</Text>
                      {!!f.carrera && <Text style={styles.estFilaMeta} noTranslate>{f.carrera}</Text>}
                      {!!f.universidadNombre && <Text style={styles.estFilaMeta} noTranslate>{f.universidadNombre}</Text>}
                      {!!f.vacanteTitulo && (
                        <TouchableOpacity
                          activeOpacity={onVerPasantiaCupo ? 0.7 : 1}
                          disabled={!onVerPasantiaCupo}
                          onPress={() => { onVerPasantiaCupo?.(f.raw); setVerEstEmpresa(false); }}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}
                        >
                          <Ionicons name="briefcase-outline" size={13} color={colors.primaryLight} />
                          <Text style={styles.estPasantiaLink} numberOfLines={1} noTranslate>{f.vacanteTitulo}</Text>
                        </TouchableOpacity>
                      )}
                      <Text style={[styles.estFilaMeta, { color: f.fechaPresentacion ? colors.success : colors.warning }]} noTranslate>
                        {f.fechaPresentacion ? `Día 1: ${f.fechaPresentacion}` : 'Primer día sin fijar'}
                      </Text>
                      {f.meta > 0 && (
                        <>
                          <View style={[styles.progressTrack, { marginTop: 6 }]}>
                            <View style={[styles.progressFill, { width: `${Math.min(100, f.pct)}%` }]} />
                          </View>
                          <Text style={styles.estFilaMeta} noTranslate>{`${f.cumplidas} / ${f.meta} h · ${f.pct}%`}</Text>
                        </>
                      )}
                      {(f.fechaPresentacion || finISO) && (
                        <Text style={styles.estFilaMeta} noTranslate>
                          {`Inicio: ${f.fechaPresentacion ?? '—'}${finISO ? `  ·  Fin est.: ${finISO}` : ''}`}
                        </Text>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    )}

    {/* Perfil de un estudiante destacado, abierto desde el cuadro de arriba. */}
    {verEstudianteId && (
      <ProfileViewerModal
        visible
        tipo="estudiante"
        profileId={verEstudianteId}
        onClose={() => setVerEstudianteId(null)}
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

  // Admin: botón "Estudiantes en pasantía" (perfil de empresa) + su modal.
  adminBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.primary12, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, marginTop: 4,
    borderWidth: 1, borderColor: COLORS.primary35,
  },
  adminBtnTxt: { flex: 1, fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },
  estOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 18 },
  estSheet: {
    maxHeight: '86%', maxWidth: 560, width: '100%', alignSelf: 'center',
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
  },
  estHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  estTitulo: { flex: 1, fontSize: 15, fontFamily: FONTS.soraSemiBold, color: COLORS.textPrimary },
  estFila: {
    backgroundColor: COLORS.backgroundSurface, borderRadius: 12, padding: 14, gap: 3,
    borderWidth: 1, borderColor: COLORS.border,
  },
  estFilaNombre: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  estFilaMeta: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted, lineHeight: 17 },
  estPasantiaLink: { flex: 1, fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },
});
