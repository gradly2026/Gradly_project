/**
 * GlobalSearchOverlay — buscador global de Gradly.
 *
 * Vista a pantalla completa con fondo Blur (Glassmorphism) que aparece con un
 * FadeIn de react-native-reanimated. La barra superior filtra por nombre o
 * carrera y, según el rol activo, busca en distintas colecciones:
 *   - Universidad → vacantes · empresas · estudiantes (propios)
 *   - Empresa     → universidades · estudiantes · grupos
 * Al pulsar un usuario/estudiante se abre el ProfileViewerModal.
 */
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,


  TouchableOpacity,
  View,
} from 'react-native';
import { AutoText as Text, AutoTextInput as TextInput } from "./AutoText";
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../config/firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { areasDeCarrera } from '../data/areas';
import { useIniciarChat } from '../hooks/useIniciarChat';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { calcularRango, type RangoTier } from '../services/feedbackService';
import ProfileViewerModal, { type ProfileTipo } from './ProfileViewerModal';
import SelloEmpresa from './SelloEmpresa';
import StorageAvatar from './StorageAvatar';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Callback opcional al pulsar un resultado de tipo perfil */
  onResultPress?: (tipo: ProfileTipo, id: string) => void;
}

type ResultTipo = 'estudiante' | 'empresa' | 'universidad' | 'vacante' | 'grupo';

interface SearchItem {
  id: string;
  tipo: ResultTipo;
  titulo: string;
  subtitulo: string;
  carrera?: string;
  foto?: string | null;
  verificado?: boolean;
  /** Tier de prestigio de la empresa (para el sello en resultados). */
  empresaTier?: RangoTier;
}

/** Tier de prestigio de una empresa a partir de su XP. */
const tierEmpresa = (x: any): RangoTier =>
  calcularRango(Number(x.puntos_experiencia ?? 0), 'empresa').tier;

const TIPO_META: Record<ResultTipo, { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  estudiante:  { icon: 'person',           label: 'Estudiante' },
  empresa:     { icon: 'business',         label: 'Empresa' },
  universidad: { icon: 'school',           label: 'Universidad' },
  vacante:     { icon: 'briefcase',        label: 'Vacante' },
  grupo:       { icon: 'people',           label: 'Grupo' },
};

const PERFIL_TIPOS: ResultTipo[] = ['estudiante', 'empresa', 'universidad'];

/**
 * Palabras "de tipo" (sin tildes, minúsculas): si el usuario escribe UNA de
 * estas, en vez de filtrar por texto libre se interpreta como "quiero ver
 * todos los resultados de este tipo" (p. ej. una empresa escribe
 * "estudiantes" y ve TODOS los estudiantes cargados, no solo los que tengan
 * la palabra "estudiantes" en el nombre/carrera).
 */
const TIPO_KEYWORDS: Record<ResultTipo, string[]> = {
  estudiante: ['estudiante', 'estudiantes', 'alumno', 'alumnos'],
  empresa: ['empresa', 'empresas'],
  universidad: ['universidad', 'universidades'],
  vacante: ['vacante', 'vacantes', 'pasantia', 'pasantias', 'empleo', 'empleos'],
  grupo: ['grupo', 'grupos'],
};

// Marcas diacríticas combinantes (U+0300–U+036F) que deja `normalize("NFD")`.
// Se construye con `fromCharCode` (no como literal en el código fuente) para
// que el rango no quede como caracteres invisibles que un cambio de
// codificación o copiar/pegar podría romper en silencio — mismo patrón que
// `src/data/areas.ts`.
const DIACRITICOS = new RegExp(
  `[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`,
  'g',
);

/** minúsculas + sin tildes, para comparar texto escrito de cualquier forma. */
function norm(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(DIACRITICOS, '');
}

export default function GlobalSearchOverlay({ visible, onClose, onResultPress }: Props) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { user, rol } = useAuth();
  const iniciarChat = useIniciarChat();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [texto, setTexto] = useState('');
  const [raw, setRaw] = useState<SearchItem[]>([]);
  const [cargando, setCargando] = useState(false);
  const [perfil, setPerfil] = useState<{ tipo: ProfileTipo; id: string } | null>(null);

  // ── Datos para ordenar por afinidad (carrera ↔ área de vacante) ──
  // Empresa buscando estudiantes: áreas de MIS vacantes activas.
  const [misAreasEmpresa, setMisAreasEmpresa] = useState<Set<string>>(new Set());
  // Estudiante buscando empresas: mi propia carrera + áreas activas de cada empresa.
  const [miCarreraEstudiante, setMiCarreraEstudiante] = useState<string | null>(null);
  const [empresaAreasMap, setEmpresaAreasMap] = useState<Map<string, Set<string>>>(new Map());

  // ── Cargar datos según rol al abrir ──────────────────────────────
  useEffect(() => {
    if (!visible) {
      setTexto(''); setRaw([]);
      setMisAreasEmpresa(new Set()); setMiCarreraEstudiante(null); setEmpresaAreasMap(new Map());
      return;
    }
    // No ejecutar consultas a Firestore sin sesión activa.
    if (!user?.uid) { setRaw([]); setCargando(false); return; }
    let cancel = false;
    setCargando(true);

    (async () => {
      const items: SearchItem[] = [];
      try {
        if (rol === 'universidad') {
          const [vac, emp, est] = await Promise.all([
            getDocs(query(collection(db, 'vacantes'), where('activa', '==', true), limit(50))),
            getDocs(query(collection(db, 'perfiles_empresas'), limit(50))),
            user?.uid
              ? getDocs(query(collection(db, 'perfiles_estudiantes'), where('universidad_id', '==', user.uid), limit(100)))
              : Promise.resolve({ docs: [] as any[] }),
          ]);
          vac.docs.forEach((d: any) => { const x = d.data(); items.push({ id: d.id, tipo: 'vacante', titulo: x.titulo ?? 'Vacante', subtitulo: x.nombre_empresa ?? '', carrera: x.area }); });
          emp.docs.forEach((d: any) => { const x = d.data(); items.push({ id: d.id, tipo: 'empresa', titulo: x.nombre_empresa ?? 'Empresa', subtitulo: x.industria ?? '', foto: x.logo_url, verificado: x.verificado ?? false, empresaTier: tierEmpresa(x) }); });
          est.docs.forEach((d: any) => { const x = d.data(); items.push({ id: d.id, tipo: 'estudiante', titulo: x.nombre_completo ?? 'Estudiante', subtitulo: x.carrera ?? '', carrera: x.carrera, foto: x.foto_url }); });
        } else if (rol === 'empresa') {
          const [uni, est, gru, vacPropias] = await Promise.all([
            getDocs(query(collection(db, 'perfiles_universidades'), limit(50))),
            getDocs(query(collection(db, 'perfiles_estudiantes'), limit(100))),
            getDocs(query(collection(db, 'grupos'), limit(80))),
            getDocs(query(collection(db, 'vacantes'), where('empresa_id', '==', user.uid), where('activa', '==', true), limit(50))),
          ]);
          uni.docs.forEach((d: any) => { const x = d.data(); items.push({ id: d.id, tipo: 'universidad', titulo: x.nombre_universidad ?? 'Universidad', subtitulo: x.dominio_correo ?? '', foto: x.logo_url }); });
          est.docs.forEach((d: any) => { const x = d.data(); items.push({ id: d.id, tipo: 'estudiante', titulo: x.nombre_completo ?? 'Estudiante', subtitulo: x.carrera ?? '', carrera: x.carrera, foto: x.foto_url }); });
          gru.docs.forEach((d: any) => { const x = d.data(); items.push({ id: d.id, tipo: 'grupo', titulo: x.nombre ?? 'Grupo', subtitulo: x.carrera ?? '', carrera: x.carrera }); });
          // Áreas de mis propias vacantes activas: sirven para priorizar, en la
          // lista de estudiantes, a quienes tienen una carrera afín a lo que
          // esta empresa está publicando ahora mismo.
          const areas = new Set<string>();
          vacPropias.docs.forEach((d: any) => { const a = d.data()?.area; if (a) areas.add(a); });
          if (!cancel) setMisAreasEmpresa(areas);
        } else {
          // Estudiante (y otros roles): empresas · universidades · grupos
          const [emp, uni, gru, miPerfil, vacActivas] = await Promise.all([
            getDocs(query(collection(db, 'perfiles_empresas'), limit(50))),
            getDocs(query(collection(db, 'perfiles_universidades'), limit(50))),
            getDocs(query(collection(db, 'grupos'), limit(80))),
            getDoc(doc(db, 'perfiles_estudiantes', user.uid)),
            getDocs(query(collection(db, 'vacantes'), where('activa', '==', true), limit(300))),
          ]);
          emp.docs.forEach((d: any) => { const x = d.data(); items.push({ id: d.id, tipo: 'empresa', titulo: x.nombre_empresa ?? 'Empresa', subtitulo: x.industria ?? '', foto: x.logo_url, verificado: x.verificado ?? false, empresaTier: tierEmpresa(x) }); });
          uni.docs.forEach((d: any) => { const x = d.data(); items.push({ id: d.id, tipo: 'universidad', titulo: x.nombre_universidad ?? 'Universidad', subtitulo: x.dominio_correo ?? '', foto: x.logo_url }); });
          gru.docs.forEach((d: any) => { const x = d.data(); items.push({ id: d.id, tipo: 'grupo', titulo: x.nombre ?? 'Grupo', subtitulo: x.carrera ?? '', carrera: x.carrera }); });
          // Mi carrera + el área de las vacantes activas de cada empresa: sirve
          // para priorizar, en la lista de empresas, a las que tienen una
          // vacante afín a mi propia carrera.
          if (!cancel) setMiCarreraEstudiante(miPerfil.exists() ? String((miPerfil.data() as any)?.carrera ?? '') || null : null);
          const mapa = new Map<string, Set<string>>();
          vacActivas.docs.forEach((d: any) => {
            const x = d.data();
            if (!x.empresa_id || !x.area) return;
            if (!mapa.has(x.empresa_id)) mapa.set(x.empresa_id, new Set());
            mapa.get(x.empresa_id)!.add(x.area);
          });
          if (!cancel) setEmpresaAreasMap(mapa);
        }
      } catch (e) {
        console.error('[GlobalSearch] load', e);
      } finally {
        if (!cancel) { setRaw(items); setCargando(false); }
      }
    })();

    return () => { cancel = true; };
  }, [visible, rol, user?.uid]);

  /** Áreas afines a mi propia carrera (solo relevante para rol estudiante). */
  const misAreasEstudianteSet = useMemo(
    () => new Set(areasDeCarrera(miCarreraEstudiante)),
    [miCarreraEstudiante],
  );

  /** Puntúa un resultado por afinidad de carrera/área, para ordenar (no filtra). */
  const puntuarAfinidad = (item: SearchItem): number => {
    if (rol === 'empresa' && item.tipo === 'estudiante') {
      if (misAreasEmpresa.size === 0) return 0;
      return areasDeCarrera(item.carrera).some((a) => misAreasEmpresa.has(a)) ? 1 : 0;
    }
    if (rol !== 'empresa' && rol !== 'universidad' && item.tipo === 'empresa') {
      if (misAreasEstudianteSet.size === 0) return 0;
      const areasEmpresa = empresaAreasMap.get(item.id);
      if (!areasEmpresa) return 0;
      for (const a of areasEmpresa) if (misAreasEstudianteSet.has(a as any)) return 1;
      return 0;
    }
    return 0;
  };

  // ── Filtrado en cliente: por "tipo" (p. ej. "estudiantes"), por texto
  // libre, o sin filtro — y siempre ordenado por afinidad de carrera/área.
  const resultados = useMemo(() => {
    const q = norm(texto);
    const tipoDetectado = q
      ? (Object.keys(TIPO_KEYWORDS) as ResultTipo[]).find((t) => TIPO_KEYWORDS[t].includes(q))
      : undefined;

    let lista: SearchItem[];
    if (tipoDetectado) {
      lista = raw.filter((it) => it.tipo === tipoDetectado);
    } else if (q) {
      lista = raw.filter((it) =>
        norm(it.titulo).includes(q) ||
        norm(it.subtitulo).includes(q) ||
        norm(it.carrera ?? '').includes(q),
      );
    } else {
      lista = raw;
    }

    // Sort estable: primero los afines a mi carrera/rubro, luego el resto,
    // cada grupo conservando su orden relativo original.
    return [...lista].sort((a, b) => puntuarAfinidad(b) - puntuarAfinidad(a));
  }, [raw, texto, rol, misAreasEmpresa, misAreasEstudianteSet, empresaAreasMap]);

  const handlePress = (item: SearchItem) => {
    if (PERFIL_TIPOS.includes(item.tipo)) {
      const tipo = item.tipo as ProfileTipo;
      onResultPress?.(tipo, item.id);
      setPerfil({ tipo, id: item.id }); // abre el perfil sobre el buscador
    } else {
      // Vacantes / grupos: por ahora solo cierran el buscador
      onClose();
    }
  };

  // Inicia (o reutiliza) el chat directo con el perfil seleccionado. El doc id
  // de los perfiles coincide con el uid de Auth, por lo que sirve como `uid`.
  const handleChat = (item: SearchItem) => {
    onClose();
    void iniciarChat({ uid: item.id, nombre: item.titulo, rol: item.tipo });
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
        <Animated.View
          entering={FadeIn.duration(220)}
          exiting={FadeOut.duration(160)}
          style={StyleSheet.absoluteFill}
        >
          <BlurView
            intensity={isDark ? 60 : 80}
            tint={isDark ? 'dark' : 'light'}
            style={[styles.blur, { paddingTop: insets.top + 8 }]}
          >
            {/* Barra de búsqueda */}
            <View style={styles.searchRow}>
              <View style={styles.searchBar}>
                <Ionicons name="search-outline" size={20} color={colors.primary} />
                <TextInput
                  autoFocus
                  value={texto}
                  onChangeText={setTexto}
                  placeholder="Buscar por nombre o carrera…"
                  placeholderTextColor={colors.textMuted}
                  selectionColor={colors.primary}
                  style={styles.input}
                  returnKeyType="search"
                />
                {texto.length > 0 && (
                  <Pressable onPress={() => setTexto('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                  </Pressable>
                )}
              </View>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} hitSlop={8}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
            </View>

            {/* Resultados */}
            {cargando ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              <FlatList
                data={resultados}
                keyExtractor={it => `${it.tipo}-${it.id}`}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ padding: 16, paddingBottom: 60, gap: 8 }}
                ListEmptyComponent={
                  <View style={styles.center}>
                    <Ionicons name="search" size={40} color={colors.textMuted} />
                    <Text style={styles.emptyText}>
                      {texto ? 'Sin coincidencias.' : 'Escribe para buscar.'}
                    </Text>
                  </View>
                }
                renderItem={({ item }) => {
                  const meta = TIPO_META[item.tipo];
                  const esPerfil = PERFIL_TIPOS.includes(item.tipo);
                  const esAfin = puntuarAfinidad(item) === 1;
                  return (
                    <TouchableOpacity style={styles.resultRow} onPress={() => handlePress(item)} activeOpacity={0.8}>
                      {esPerfil ? (
                        <StorageAvatar url={item.foto} size={44} fallbackIcon={meta.icon} />
                      ) : (
                        <View style={styles.iconWrap}>
                          <Ionicons name={meta.icon} size={20} color={colors.primaryLight} />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Text style={styles.resultTitle} numberOfLines={1}>{item.titulo}</Text>
                          {item.tipo === 'empresa' && item.verificado && (
                            <Ionicons name="checkmark-circle" size={15} color={colors.primaryLight} />
                          )}
                        </View>
                        <Text style={styles.resultSub} numberOfLines={1}>
                          {meta.label}{item.subtitulo ? ` · ${item.subtitulo}` : ''}
                        </Text>
                        {esAfin && (
                          <View style={styles.afinBadge}>
                            <Ionicons name="sparkles" size={11} color={colors.success} />
                            <Text style={styles.afinBadgeText}>
                              {item.tipo === 'estudiante' ? 'Afín a tus vacantes' : 'Afín a tu carrera'}
                            </Text>
                          </View>
                        )}
                        {item.tipo === 'empresa' && item.empresaTier && item.empresaTier !== 'bronce' && (
                          <View style={{ marginTop: 6 }}>
                            <SelloEmpresa tier={item.empresaTier} />
                          </View>
                        )}
                      </View>
                      {esPerfil && (
                        <TouchableOpacity
                          style={styles.chatBtn}
                          onPress={() => handleChat(item)}
                          hitSlop={8}
                          accessibilityLabel={`Chatear con ${item.titulo}`}
                        >
                          <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </BlurView>
        </Animated.View>
      </Modal>

      {/* Perfil sobre el buscador */}
      {perfil && (
        <ProfileViewerModal
          visible={!!perfil}
          tipo={perfil.tipo}
          profileId={perfil.id}
          onClose={() => { setPerfil(null); onClose(); }}
        />
      )}
    </>
  );
}

const makeStyles = (COLORS: GradlyColors) => StyleSheet.create({
  blur: { flex: 1 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingBottom: 12,
  },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    height: 50, borderRadius: 25, paddingHorizontal: 16,
    backgroundColor: COLORS.backgroundCard,
    borderWidth: 1, borderColor: COLORS.primary35,
  },
  input: { flex: 1, fontSize: 15, fontFamily: FONTS.interRegular, color: COLORS.textPrimary },
  cancelBtn: { paddingHorizontal: 4 },
  cancelText: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },

  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: FONTS.interRegular, color: COLORS.textMuted },

  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.backgroundCard, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  iconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.primary12, alignItems: 'center', justifyContent: 'center',
  },
  resultTitle: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  resultSub: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted, marginTop: 2 },
  afinBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 6, alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    backgroundColor: COLORS.primary12,
  },
  afinBadgeText: { fontSize: 10, fontFamily: FONTS.interSemiBold, color: COLORS.success },

  chatBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
});
