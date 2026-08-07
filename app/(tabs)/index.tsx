import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  collection,
  doc,
  documentId,
  getDocs,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  aplicarAPasantiaIndependiente,
  aplicarAVacante,
  estudianteHabilitadoParaVacantes,
} from '../../src/services/pasantiaService';
import { abrirChatDirectoEmpresaEstudiante } from '../../src/services/chatService';
import { esVacanteAfin, puntuarVacante } from '../../src/data/areas';
import { hayCupos, textoSalario } from '../../src/utils/cupos';
import { cargarOverridesCarreras, mensajeZonaRoja, zonaDeCarrera } from '../../src/data/carreras';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Platform,
  ScrollView,
  StyleSheet,


  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import { db } from '../../src/config/firebaseConfig';
import { COLORS, FONTS, useTheme, type GradlyColors } from '../../src/context/ThemeContext';
import { LiquidBackground } from '../../components/ui/liquid-glass/LiquidBackground';
import { GlassCard } from '../../components/ui/liquid-glass/GlassCard';
import { JellyButton } from '../../components/ui/liquid-glass/JellyButton';
import VacanteDetailModal from '../../src/components/VacanteDetailModal';
import SelloEmpresa from '../../src/components/SelloEmpresa';
import TableroCupos from '../../src/components/TableroCupos';
import MercadoLaboralStats from '../../src/components/MercadoLaboralStats';
import { AutoText, AutoText as Text, AutoTextInput as TextInput, useAutoText } from '../../src/components/AutoText';
import { calcularRango, type RangoTier } from '../../src/services/feedbackService';

// Hook que recrea los estilos según el tema activo (claro/oscuro)
function useThemedStyles() {
  const { colors } = useTheme();
  return useMemo(() => ({ colors, styles: makeStyles(colors) }), [colors]);
}

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
interface Vacante {
  id: string;
  empresa_id: string;
  nombre_empresa: string;
  logo_empresa_url: string;
  titulo: string;
  modalidad: 'Presencial' | 'Remoto' | 'Híbrido';
  tipo: string;
  /** Granularidad de empleo (solo tipo 'Vacante'). */
  modalidad_contrato?: string;
  area: string;
  horas_requeridas: number;
  /** Rango salarial opcional (solo 'Vacante'); informativo, se negocia fuera de Gradly. */
  salario_min?: number | null;
  salario_max?: number | null;
  skills_requeridas: string[];
  fecha_publicacion: any;
  premium?: boolean;
  /** 'pasantia' se maneja por matchmaking universidad↔empresa; el feed individual solo muestra 'vacante' (o legado sin categoría). */
  categoria?: 'pasantia' | 'vacante';
  /** Cupos declarados por la empresa (ver `utils/cupos.ts`) — usados para no ofrecer en autoservicio una pasantía ya sin plazas libres. */
  cupos?: number | null;
  cupos_reclamados?: number | null;
  contratados_count?: number | null;
}

// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────
const FRASES = [
  'Tu próxima oportunidad te está esperando',
  'Cada pasantía es un paso hacia tu futuro',
  'Conecta con empresas que transforman El Salvador',
];

const FILTROS = [
  { key: 'todas',       label: 'Todas' },
  { key: 'Remoto',      label: 'Remoto' },
  { key: 'Presencial',  label: 'Presencial' },
  { key: 'Híbrido',     label: 'Híbrido' },
];

const HOY = new Date();

function relativeTime(ts: any): string {
  if (!ts) return '';
  const d: Date = ts.toDate ? ts.toDate() : new Date(ts);
  const days = Math.floor((HOY.getTime() - d.getTime()) / 86_400_000);
  if (days === 0) return 'hoy';
  if (days === 1) return 'hace 1 día';
  if (days < 7)  return `hace ${days} días`;
  if (days < 30) return `hace ${Math.floor(days / 7)} sem.`;
  return `hace ${Math.floor(days / 30)} meses`;
}

// ─────────────────────────────────────────────
// COMPONENTE TARJETA
// ─────────────────────────────────────────────
function VacanteCard({
  vacante,
  yaAplico,
  estadoAplicacion,
  onAplicar,
  onVerDetalle,
  applying,
  empresaTier,
  readOnly,
}: {
  vacante: Vacante;
  yaAplico: boolean;
  estadoAplicacion: string;
  onAplicar?: (v: Vacante) => void;
  onVerDetalle: (v: Vacante) => void;
  applying: boolean;
  empresaTier?: RangoTier;
  /** Solo lectura: puede navegar y ver el detalle, pero el botón Aplicar
   * queda deshabilitado (estudiante en pasantía activa, aún no graduado). */
  readOnly?: boolean;
}) {
  const { styles } = useThemedStyles();
  const initial = vacante.nombre_empresa?.[0]?.toUpperCase() ?? '?';

  const btnColor = readOnly
    ? COLORS.backgroundSurface
    : yaAplico
    ? estadoAplicacion === 'contratado' ? COLORS.success
    : estadoAplicacion === 'rechazado' ? COLORS.error
    : COLORS.warning
    : COLORS.primaryDark;

  const btnLabel = readOnly
    ? 'Disponible al graduarte'
    : yaAplico
    ? estadoAplicacion === 'pendiente'  ? 'Pendiente'
    : estadoAplicacion === 'en_revision'? 'En revisión'
    : estadoAplicacion === 'entrevista' ? 'Entrevista'
    : estadoAplicacion === 'contratado' ? '¡Contratado!'
    : estadoAplicacion === 'rechazado'  ? 'Rechazado'
    : 'Aplicado'
    : 'Aplicar';

  const skillsVisible = vacante.skills_requeridas?.slice(0, 3) ?? [];
  const extraSkills   = (vacante.skills_requeridas?.length ?? 0) - 3;

  return (
    <GlassCard style={{ marginBottom: 12 }} contentStyle={{ padding: 16 }}>
      {/* Toca la tarjeta para ver el detalle completo */}
      <TouchableOpacity activeOpacity={0.85} onPress={() => onVerDetalle(vacante)}>
        {/* Cabecera empresa */}
        <View style={styles.cardHeader}>
          {vacante.logo_empresa_url ? (
            <Image source={{ uri: vacante.logo_empresa_url }} style={styles.logo} />
          ) : (
            <View style={styles.logoFallback}>
              <Text style={styles.logoInitial}>{initial}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <View style={styles.empresaRow}>
              <Text style={styles.empresaNombre} numberOfLines={1}>
                {vacante.nombre_empresa}
              </Text>
              {vacante.premium && (
                <View style={styles.premiumBadge}>
                  <Text style={styles.premiumText}>PREMIUM</Text>
                </View>
              )}
            </View>
            {empresaTier && empresaTier !== 'bronce' && (
              <View style={{ marginTop: 4 }}>
                <SelloEmpresa tier={empresaTier} />
              </View>
            )}
            <AutoText style={styles.titulo} numberOfLines={2}>{vacante.titulo}</AutoText>
          </View>
        </View>

        {/* Chips de tipo */}
        <View style={styles.chipsRow}>
          <Chip label={vacante.tipo} color={COLORS.primary} />
          {!!vacante.modalidad_contrato && (
            <Chip label={vacante.modalidad_contrato} color={COLORS.backgroundSurface} textColor={COLORS.textSecondary} />
          )}
          <Chip label={vacante.modalidad} color={COLORS.backgroundSurface} textColor={COLORS.textSecondary} />
          {!!vacante.horas_requeridas && (
            <Chip label={`${vacante.horas_requeridas}h`} color={COLORS.backgroundSurface} textColor={COLORS.textMuted} />
          )}
          {/* Rango salarial: quick-scan en la tarjeta, como cualquier job board. */}
          {textoSalario(vacante.salario_min, vacante.salario_max) && (
            <Chip
              label={textoSalario(vacante.salario_min, vacante.salario_max)!}
              color={COLORS.success + '22'}
              textColor={COLORS.success}
            />
          )}
        </View>

        {/* Skills */}
        {skillsVisible.length > 0 && (
          <View style={styles.chipsRow}>
            {skillsVisible.map(sk => (
              <Chip key={sk} label={sk} color={COLORS.primary12} textColor={COLORS.primaryLight} small />
            ))}
            {extraSkills > 0 && (
              <Chip label={`+${extraSkills}`} color={COLORS.primary12} textColor={COLORS.primaryLight} small />
            )}
          </View>
        )}
      </TouchableOpacity>

      {/* Footer */}
      <View style={styles.cardFooter}>
        <Text style={styles.dateText}>{relativeTime(vacante.fecha_publicacion)}</Text>
        <JellyButton
          style={[
            styles.aplicarBtn,
            { backgroundColor: btnColor },
            applying && { opacity: 0.6 },
            readOnly && { opacity: 0.7 },
          ]}
          contentStyle={{ paddingVertical: 8, paddingHorizontal: 18 }}
          onPress={() => !readOnly && !yaAplico && onAplicar?.(vacante)}
          disabled={readOnly || yaAplico || applying}
        >
          {applying
            ? <ActivityIndicator size="small" color={COLORS.textPrimary} />
            : <Text style={[styles.aplicarBtnText, readOnly && { color: COLORS.textMuted }]}>{btnLabel}</Text>
          }
        </JellyButton>
      </View>
    </GlassCard>
  );
}

function Chip({
  label, color, textColor, small,
}: { label: string; color: string; textColor?: string; small?: boolean }) {
  const { styles } = useThemedStyles();
  return (
    <View style={[styles.chip, { backgroundColor: color }, small && styles.chipSmall]}>
      <Text style={[styles.chipText, { color: textColor ?? COLORS.textPrimary }, small && { fontSize: 10 }]}>
        {label}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────
// PANTALLA PRINCIPAL
// ─────────────────────────────────────────────
export default function FeedVacantes() {
  const { user, userProfile } = useAuth();
  const { styles, colors } = useThemedStyles();
  const router = useRouter();
  const webScrollStyle = Platform.OS === 'web'
    ? ({ scrollbarColor: `${colors.primary35} ${colors.backgroundSurface}`, scrollbarWidth: 'thin' } as any)
    : undefined;

  const [vacantes,       setVacantes]       = useState<Vacante[]>([]);
  const [aplicaciones,   setAplicaciones]   = useState<Record<string, string>>({});
  const [applying,       setApplying]       = useState<string | null>(null);
  const [searchInput,    setSearchInput]    = useState('');
  const [searchQuery,    setSearchQuery]    = useState('');
  const [filtroActivo,   setFiltroActivo]   = useState('todas');
  const [phraseIdx,      setPhraseIdx]      = useState(0);
  const [cargando,       setCargando]       = useState(true);
  const [vacanteDetalle, setVacanteDetalle] = useState<Vacante | null>(null);

  // ── Elegibilidad: solo estudiantes que ya culminaron su práctica/pasantía
  //    o están graduados pueden ver y aplicar a vacantes ──────────────
  const [perfilEstudiante, setPerfilEstudiante] = useState<{
    graduado?: boolean; horas_aprobadas?: number; horas_objetivo?: number;
    // Necesarios para el tablero de cupos reservados por su universidad.
    universidad_id?: string; grupo_id?: string;
    // Para el filtro/orden por afinidad de carrera.
    carrera?: string; skills?: string[];
  } | null>(null);
  const [perfilCargado, setPerfilCargado] = useState(false);

  // ── ¿Tiene una pasantía activa en curso? (distinto de "graduado") ──
  // No hay un solo campo booleano para esto: se deriva de las 2 vías que NO
  // se enteran ya por `aplicaciones` (que este archivo ya escucha más abajo):
  // acuerdo de grupo aprobado (`solicitudes_practicas`) y cupo tomado
  // (`asignaciones_cupo`). Cada una con su propio flag de carga para no
  // mostrar el estado equivocado un instante antes de que resuelvan.
  const [tieneAcuerdoAprobado, setTieneAcuerdoAprobado] = useState(false);
  const [acuerdoCargado, setAcuerdoCargado] = useState(false);
  const [tieneCupoTomado, setTieneCupoTomado] = useState(false);
  const [cupoCargado, setCupoCargado] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const phraseOpacity = useRef(new Animated.Value(1)).current;
  const toastOpacity  = useRef(new Animated.Value(0)).current;

  // ── Flechas de navegación de la fila de filtros (útil en web/escritorio,
  // donde no hay swipe táctil) ──
  const filtrosScrollRef = useRef<ScrollView | null>(null);
  const [filtrosViewportW, setFiltrosViewportW] = useState(0);
  const [filtrosContentW, setFiltrosContentW] = useState(0);
  const [filtrosScrollX, setFiltrosScrollX] = useState(0);
  const canScrollFiltros = filtrosContentW > filtrosViewportW + 8;
  const canScrollLeft = filtrosScrollX > 4;
  const canScrollRight = filtrosScrollX < Math.max(0, filtrosContentW - filtrosViewportW - 4);
  const moverFiltros = useCallback((delta: number) => {
    const siguiente = Math.max(0, Math.min(
      filtrosScrollX + delta,
      Math.max(0, filtrosContentW - filtrosViewportW),
    ));
    filtrosScrollRef.current?.scrollTo({ x: siguiente, animated: true });
    setFiltrosScrollX(siguiente);
  }, [filtrosContentW, filtrosScrollX, filtrosViewportW]);
  const toastY        = useRef(new Animated.Value(20)).current;

  // Nombre del estudiante
  const nombre = (userProfile as any)?.nombre_completo?.split(' ')[0] ?? 'Estudiante';
  const fecha  = HOY.toLocaleDateString('es-SV', { weekday: 'long', day: 'numeric', month: 'long' });

  // ── Firebase: vacantes activas ──────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'vacantes'), where('activa', '==', true));
    const unsub = onSnapshot(q, snap => {
      setVacantes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Vacante)));
      setCargando(false);
    });
    return unsub;
  }, [user]);

  // ── Firebase: perfil del estudiante (elegibilidad para vacantes) ────
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'perfiles_estudiantes', user.uid), snap => {
      setPerfilEstudiante(snap.exists() ? (snap.data() as any) : null);
      setPerfilCargado(true);
    });
    return unsub;
  }, [user]);

  const habilitadoParaVacantes = useMemo(
    () => estudianteHabilitadoParaVacantes(perfilEstudiante),
    [perfilEstudiante],
  );

  // ── Firebase: acuerdo de grupo aprobado (pasantía activa vía matchmaking) ──
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'solicitudes_practicas'),
      where('estudianteIds', 'array-contains', user.uid),
      where('estado', '==', 'aprobado'),
    );
    const unsub = onSnapshot(
      q,
      snap => { setTieneAcuerdoAprobado(!snap.empty); setAcuerdoCargado(true); },
      () => { setTieneAcuerdoAprobado(false); setAcuerdoCargado(true); },
    );
    return unsub;
  }, [user]);

  // ── Firebase: cupo tomado (pasantía activa vía reparto de cupos) ──
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'asignaciones_cupo'),
      where('estudianteId', '==', user.uid),
      where('estado', '==', 'tomado'),
    );
    const unsub = onSnapshot(
      q,
      snap => { setTieneCupoTomado(!snap.empty); setCupoCargado(true); },
      () => { setTieneCupoTomado(false); setCupoCargado(true); },
    );
    return unsub;
  }, [user]);

  // Overrides de Zona Roja (config/carreras) — sin esto el catálogo estático
  // manda siempre, aunque un admin haya reclasificado una carrera en vivo.
  useEffect(() => { void cargarOverridesCarreras(); }, []);

  // ── ¿Tiene una pasantía activa ahora mismo? (distinto de "graduado") ──
  const tienePasantiaActiva = useMemo(
    () => Object.values(aplicaciones).includes('contratado') || tieneAcuerdoAprobado || tieneCupoTomado,
    [aplicaciones, tieneAcuerdoAprobado, tieneCupoTomado],
  );

  // Carrera del estudiante + si cae en Zona Roja (Salud/Educación/Derecho):
  // esos estudiantes NUNCA ven la sección de autoservicio a pasantías, sin
  // excepción — siguen dependiendo 100% de lo que les asegure su universidad.
  const miCarrera = perfilEstudiante?.carrera ?? (userProfile as any)?.carrera;
  const zonaRoja = useMemo(
    () => (miCarrera ? zonaDeCarrera(miCarrera) === 'roja' : false),
    [miCarrera],
  );

  // ── Sello de prestigio de la empresa por vacante ────────────────
  // Resolvemos el tier (oro/plata/bronce) de las empresas de las vacantes
  // visibles a partir de su XP, cacheando para no releer en cada snapshot.
  const [empresaTiers, setEmpresaTiers] = useState<Record<string, RangoTier>>({});
  useEffect(() => {
    const pendientes = Array.from(
      new Set(vacantes.map(v => v.empresa_id).filter(Boolean)),
    ).filter(id => !(id in empresaTiers));
    if (pendientes.length === 0) return;

    let cancelado = false;
    (async () => {
      const nuevos: Record<string, RangoTier> = {};
      // Firestore limita `in` a 30 ids por consulta.
      for (let i = 0; i < pendientes.length; i += 30) {
        const lote = pendientes.slice(i, i + 30);
        try {
          const snap = await getDocs(
            query(collection(db, 'perfiles_empresas'), where(documentId(), 'in', lote)),
          );
          snap.docs.forEach(d => {
            nuevos[d.id] = calcularRango(Number((d.data() as any).puntos_experiencia ?? 0), 'empresa').tier;
          });
        } catch (e) {
          console.warn('Error cargando tiers de empresas:', e);
        }
      }
      if (!cancelado && Object.keys(nuevos).length > 0) {
        setEmpresaTiers(prev => ({ ...prev, ...nuevos }));
      }
    })();
    return () => { cancelado = true; };
  }, [vacantes, empresaTiers]);

  // ── Firebase: aplicaciones propias ──────────────────────────────
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'aplicaciones'), where('estudiante_id', '==', user.uid));
    const unsub = onSnapshot(q, snap => {
      const map: Record<string, string> = {};
      snap.docs.forEach(d => { map[d.data().vacante_id] = d.data().estado; });
      setAplicaciones(map);
    });
    return unsub;
  }, [user]);

  // ── Rotación de frases motivacionales ───────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(phraseOpacity, { toValue: 0, duration: 400, useNativeDriver: Platform.OS !== 'web' })
        .start(() => {
          setPhraseIdx(p => (p + 1) % FRASES.length);
          Animated.timing(phraseOpacity, { toValue: 1, duration: 400, useNativeDriver: Platform.OS !== 'web' }).start();
        });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // ── Debounce búsqueda ────────────────────────────────────────────
  const handleSearch = useCallback((text: string) => {
    setSearchInput(text);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearchQuery(text), 350);
  }, []);

  // ── Toast de éxito ───────────────────────────────────────────────
  const showToast = useCallback(() => {
    toastOpacity.setValue(0); toastY.setValue(20);
    Animated.parallel([
      Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(toastY, { toValue: 0, duration: 300, useNativeDriver: Platform.OS !== 'web' }),
    ]).start(() =>
      setTimeout(() =>
        Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: Platform.OS !== 'web' }).start(),
      2000),
    );
  }, []);

  // ── Filtrado local ───────────────────────────────────────────────
  const filteredVacantes = useMemo(() => {
    // Las de categoría 'pasantia' se gestionan por el matchmaking
    // universidad↔empresa (Matchmaking.tsx); este feed individual es solo
    // para 'vacante' (o vacantes legado sin categoría asignada aún).
    let res = vacantes.filter(v => v.categoria !== 'pasantia');

    // Filtro duro por carrera: el estudiante no ve vacantes de un área ajena a
    // la suya, así no puede postularse a algo que su universidad rechazaría
    // después. NO oculta las de área "Otra" ni las legadas sin área: un dato
    // ausente no debe costarle una oportunidad (ver esVacanteAfin).
    const miCarrera = perfilEstudiante?.carrera ?? (userProfile as any)?.carrera;
    if (miCarrera) res = res.filter(v => esVacanteAfin(miCarrera, v));

    // Orden por afinidad: primero lo que mejor encaja con su carrera y skills.
    const misSkills = perfilEstudiante?.skills ?? [];
    res = [...res].sort(
      (a, b) => puntuarVacante(miCarrera, misSkills, b) - puntuarVacante(miCarrera, misSkills, a),
    );

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      res = res.filter(v =>
        v.titulo.toLowerCase().includes(q) ||
        v.nombre_empresa.toLowerCase().includes(q) ||
        v.area?.toLowerCase().includes(q),
      );
    }
    if (filtroActivo !== 'todas') {
      res = res.filter(v => v.modalidad === filtroActivo || v.area === filtroActivo);
    }
    return res;
  }, [vacantes, searchQuery, filtroActivo, perfilEstudiante, userProfile]);

  // ── Autoservicio de pasantías: para quien AÚN no tiene pasantía activa,
  // pasantías de OTRAS empresas afines a su carrera — camino aparte del que
  // le aseguró su universidad (ver <TableroCupos/> en el render). Vacío por
  // completo si es Zona Roja, o si ya está graduado/en pasantía (ese caso lo
  // cubren las otras 2 ramas del render).
  const pasantiasDisponibles = useMemo(() => {
    if (habilitadoParaVacantes || tienePasantiaActiva || zonaRoja) return [];

    let res = vacantes.filter(v =>
      (v.categoria === 'pasantia' || (!v.categoria && v.tipo === 'Pasantía')) && hayCupos(v),
    );

    if (miCarrera) res = res.filter(v => esVacanteAfin(miCarrera, v));

    const misSkills = perfilEstudiante?.skills ?? [];
    res = [...res].sort(
      (a, b) => puntuarVacante(miCarrera, misSkills, b) - puntuarVacante(miCarrera, misSkills, a),
    );

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      res = res.filter(v =>
        v.titulo.toLowerCase().includes(q) ||
        v.nombre_empresa.toLowerCase().includes(q) ||
        v.area?.toLowerCase().includes(q),
      );
    }
    if (filtroActivo !== 'todas') {
      res = res.filter(v => v.modalidad === filtroActivo || v.area === filtroActivo);
    }
    return res;
  }, [vacantes, searchQuery, filtroActivo, perfilEstudiante, miCarrera, habilitadoParaVacantes, tienePasantiaActiva, zonaRoja]);

  // ── Aplicar a vacante ────────────────────────────────────────────
  const handleAplicar = useCallback(async (vacante: Vacante) => {
    if (!user) { Alert.alert('Debes iniciar sesión.'); return; }
    if (!habilitadoParaVacantes) {
      Alert.alert('Vacantes no disponibles', 'Las vacantes se habilitan cuando culmines tu práctica o pasantía, o estés graduado.');
      return;
    }

    setApplying(vacante.id);
    try {
      await aplicarAVacante(
        user.uid,
        vacante.id,
        vacante.empresa_id,
        {
          nombre_completo: (userProfile as any)?.nombre_completo ?? '',
          foto_url:        (userProfile as any)?.foto_url ?? '',
          universidad_id:  (userProfile as any)?.universidad_id ?? '',
        },
      );
      showToast();
    } catch (err: any) {
      if (!err.message?.includes('Ya aplicaste')) {
        Alert.alert('Error', err.message ?? 'No se pudo enviar tu aplicación.');
      }
    } finally {
      setApplying(null);
    }
  }, [user, userProfile, showToast, habilitadoParaVacantes]);

  // ── Aplicar a una pasantía por cuenta propia (autoservicio) ──────
  const handleAplicarPasantia = useCallback(async (vacante: Vacante) => {
    if (!user) { Alert.alert('Debes iniciar sesión.'); return; }

    setApplying(vacante.id);
    try {
      await aplicarAPasantiaIndependiente(
        user.uid,
        vacante.id,
        vacante.empresa_id,
        {
          nombre_completo: (userProfile as any)?.nombre_completo ?? '',
          foto_url:        (userProfile as any)?.foto_url ?? '',
          universidad_id:  (userProfile as any)?.universidad_id ?? '',
          carrera:         miCarrera,
        },
      );
      showToast();
    } catch (err: any) {
      if (!err.message?.includes('Ya aplicaste')) {
        Alert.alert('Error', err.message ?? 'No se pudo enviar tu aplicación.');
      }
    } finally {
      setApplying(null);
    }
  }, [user, userProfile, showToast, miCarrera]);

  // ── Contactar empresa (chat directo estudiante↔empresa) ──────────
  const handleContactarEmpresa = useCallback(async (vacante: Vacante) => {
    if (!user?.uid || !vacante.empresa_id) {
      Alert.alert('No disponible', 'No se pudo identificar a la empresa para iniciar el chat.');
      return;
    }
    const estudianteNombre = (userProfile as any)?.nombre_completo ?? 'Estudiante';
    try {
      const chatId = await abrirChatDirectoEmpresaEstudiante({
        empresaId: vacante.empresa_id,
        empresaNombre: vacante.nombre_empresa ?? 'Empresa',
        estudianteId: user.uid,
        estudianteNombre,
        contexto: 'candidatura',
      });
      setVacanteDetalle(null);
      router.push({ pathname: '/ChatScreen', params: { chatId, peerName: vacante.nombre_empresa ?? 'Empresa' } } as any);
    } catch {
      Alert.alert('Error', 'No se pudo abrir el chat con la empresa.');
    }
  }, [user, userProfile, router]);

  // ── Empty state (parametrizable: se reutiliza en los 3 estados del feed) ──
  const EmptyState = ({
    icon = 'briefcase-outline',
    titulo = 'Sin resultados',
    desc = 'Prueba cambiando el filtro o la búsqueda.',
  }: { icon?: keyof typeof Ionicons.glyphMap; titulo?: string; desc?: string }) => (
    <View style={styles.empty}>
      <Ionicons name={icon} size={56} color={COLORS.border} />
      <Text style={styles.emptyTitle}>{titulo}</Text>
      <Text style={styles.emptyDesc}>{desc}</Text>
    </View>
  );

  // Aviso legal de Zona Roja para la carrera del estudiante (si aplica) —
  // reutiliza el mismo texto que ya se le muestra a la universidad, en vez
  // de inventar copy nuevo para este caso.
  const avisoZonaRoja = miCarrera ? mensajeZonaRoja(miCarrera) : null;

  // ── Nota de contexto: explica QUÉ está viendo el estudiante y por qué,
  // según su situación de pasantía. Va encima del feed en los 3 estados. ──
  const EstadoBanner = ({ texto }: { texto: string }) => (
    <View style={styles.estadoBanner}>
      <Ionicons name="information-circle-outline" size={18} color={colors.primaryLight} />
      <Text style={styles.estadoBannerText}>{texto}</Text>
    </View>
  );

  // ── Render ────────────────────────────────────────────────────────
  return (
    <LiquidBackground>
    <View style={[styles.root, { backgroundColor: 'transparent' }]}>
      <StatusBar style="light" />

      {/* ── HEADER ── */}
      <View style={styles.header}>
        {/* Contenedor responsive: centra y limita el ancho en web/tablet. */}
        <View style={{ maxWidth: 640, alignSelf: 'center', width: '100%' }}>
        {/* Saludo */}
        <View style={styles.greetingRow}>
          <View>
            <Text style={styles.greeting}>Hola, {nombre}! 👋</Text>
            <Animated.Text style={[styles.phrase, { opacity: phraseOpacity }]}>
              {useAutoText(FRASES[phraseIdx])}
            </Animated.Text>
          </View>
          <Text style={styles.fecha}>{fecha}</Text>
        </View>

        {/* Búsqueda y filtros: hay algo que buscar en los 3 estados del feed
            (vacantes, vacantes en modo lectura, o pasantías de autoservicio) —
            antes solo se mostraba si `habilitadoParaVacantes`. Se oculta solo
            para Zona Roja, que nunca tiene nada que buscar en autoservicio. */}
        {(habilitadoParaVacantes || tienePasantiaActiva || !zonaRoja) && (
          <>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={COLORS.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            value={searchInput}
            onChangeText={handleSearch}
            placeholder="Buscar vacantes..."
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
            selectionColor={COLORS.primary}
          />
          {searchInput !== '' && (
            <TouchableOpacity onPress={() => { setSearchInput(''); setSearchQuery(''); }}>
              <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Chips de filtro (con flechas ◀▶ para navegar en web/escritorio) */}
        <View style={styles.filtrosOuter} onLayout={(e) => setFiltrosViewportW(e.nativeEvent.layout.width)}>
          {canScrollFiltros ? (
            <TouchableOpacity
              style={[styles.filtrosArrow, !canScrollLeft && styles.filtrosArrowDisabled]}
              onPress={() => moverFiltros(-180)}
              disabled={!canScrollLeft}
              activeOpacity={0.8}
            >
              <Ionicons name="chevron-back" size={18} color={canScrollLeft ? colors.primaryLight : colors.textMuted} />
            </TouchableOpacity>
          ) : null}

          <ScrollView
            ref={filtrosScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            onContentSizeChange={(w) => setFiltrosContentW(w)}
            onScroll={(e) => setFiltrosScrollX(e.nativeEvent.contentOffset.x)}
            scrollEventThrottle={16}
            contentContainerStyle={styles.filtrosScroll}
            style={styles.filtrosViewport}
          >
            {FILTROS.map(f => (
              <JellyButton
                key={f.key}
                style={[styles.filtroChip, { borderRadius: 20 }, filtroActivo === f.key && styles.filtroChipActive]}
                contentStyle={{ paddingHorizontal: 14, paddingVertical: 6 }}
                onPress={() => setFiltroActivo(f.key)}
              >
                <Text style={[
                  styles.filtroChipText,
                  filtroActivo === f.key && styles.filtroChipTextActive,
                ]}>
                  {f.label}
                </Text>
              </JellyButton>
            ))}
          </ScrollView>

          {canScrollFiltros ? (
            <TouchableOpacity
              style={[styles.filtrosArrow, !canScrollRight && styles.filtrosArrowDisabled]}
              onPress={() => moverFiltros(180)}
              disabled={!canScrollRight}
              activeOpacity={0.8}
            >
              <Ionicons name="chevron-forward" size={18} color={canScrollRight ? colors.primaryLight : colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
          </>
        )}
        </View>
      </View>

      {/* ── FEED ── */}
      {cargando || !perfilCargado || !acuerdoCargado || !cupoCargado ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : habilitadoParaVacantes ? (
        // ── Graduado: feed completo, aplicar habilitado (sin cambios) ──
        <FlatList
          data={filteredVacantes}
          renderItem={({ item }) => (
            <VacanteCard
              vacante={item}
              yaAplico={item.id in aplicaciones}
              estadoAplicacion={aplicaciones[item.id] ?? ''}
              onAplicar={handleAplicar}
              onVerDetalle={setVacanteDetalle}
              applying={applying === item.id}
              empresaTier={empresaTiers[item.empresa_id]}
            />
          )}
          showsVerticalScrollIndicator
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          style={[{ flex: 1 }, webScrollStyle]}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 100, maxWidth: 640, alignSelf: 'center', width: '100%', flexGrow: 1 }}
          ListHeaderComponent={
            <EstadoBanner texto="Ya culminaste tu práctica o pasantía: podés aplicar directamente a cualquier vacante disponible." />
          }
          ListEmptyComponent={<EmptyState />}
          keyExtractor={item => item.id}
        />
      ) : tienePasantiaActiva ? (
        // ── En pasantía activa: mercado en modo lectura + pulso del mercado ──
        <FlatList
          data={filteredVacantes}
          renderItem={({ item }) => (
            <VacanteCard
              vacante={item}
              yaAplico={item.id in aplicaciones}
              estadoAplicacion={aplicaciones[item.id] ?? ''}
              onVerDetalle={setVacanteDetalle}
              applying={false}
              empresaTier={empresaTiers[item.empresa_id]}
              readOnly
            />
          )}
          showsVerticalScrollIndicator
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          style={[{ flex: 1 }, webScrollStyle]}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 100, maxWidth: 640, alignSelf: 'center', width: '100%', flexGrow: 1 }}
          ListHeaderComponent={
            <>
              <EstadoBanner texto="Estás en tu pasantía activa. Podés ver el mercado de vacantes para ubicarte, pero solo podrás aplicar cuando la culmines o te gradúes." />
              <MercadoLaboralStats vacantes={vacantes} />
            </>
          }
          ListEmptyComponent={<EmptyState />}
          keyExtractor={item => item.id}
        />
      ) : (
        // ── Sin pasantía todavía: cupos asegurados por su universidad +
        // autoservicio a pasantías afines a su carrera ──
        <FlatList
          data={pasantiasDisponibles}
          renderItem={({ item }) => (
            <VacanteCard
              vacante={item}
              yaAplico={item.id in aplicaciones}
              estadoAplicacion={aplicaciones[item.id] ?? ''}
              onAplicar={handleAplicarPasantia}
              onVerDetalle={setVacanteDetalle}
              applying={applying === item.id}
              empresaTier={empresaTiers[item.empresa_id]}
            />
          )}
          showsVerticalScrollIndicator
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          style={[{ flex: 1 }, webScrollStyle]}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 100, maxWidth: 640, alignSelf: 'center', width: '100%', flexGrow: 1 }}
          ListHeaderComponent={
            <>
              {!zonaRoja && (
                <EstadoBanner texto="Todavía no iniciás tu pasantía. Debajo verás los cupos que tu universidad ya te aseguró y pasantías de otras empresas a las que podés aplicar por tu cuenta." />
              )}
              {user?.uid && (
                <TableroCupos
                  estudianteId={user.uid}
                  universidadId={perfilEstudiante?.universidad_id ?? (userProfile as any)?.universidad_id}
                  grupoId={perfilEstudiante?.grupo_id}
                  estudianteNombre={(userProfile as any)?.nombre_completo ?? ''}
                />
              )}
              {!zonaRoja && (
                <Text style={styles.pasantiasSectionLabel}>Otras pasantías para tu carrera</Text>
              )}
            </>
          }
          ListEmptyComponent={
            zonaRoja ? (
              <EmptyState
                icon="shield-checkmark-outline"
                titulo={avisoZonaRoja?.titulo ?? 'Gestionado por tu universidad'}
                desc={avisoZonaRoja?.cuerpo ?? 'Tu carrera requiere que la práctica la gestione tu universidad.'}
              />
            ) : (
              <EmptyState
                titulo="Sin pasantías disponibles todavía"
                desc="Aún no hay pasantías afines a tu carrera para autoservicio. Vuelve pronto, o espera a que tu universidad te asegure un cupo."
              />
            )
          }
          keyExtractor={item => item.id}
        />
      )}

      {/* ── TOAST ── */}
      <Animated.View style={[styles.toast, { opacity: toastOpacity, transform: [{ translateY: toastY }] }]}>
        <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
        <Text style={styles.toastText}>¡Aplicación enviada!</Text>
      </Animated.View>

      {/* ── Detalle de vacante ── */}
      <VacanteDetailModal
        visible={!!vacanteDetalle}
        vacante={vacanteDetalle}
        onClose={() => setVacanteDetalle(null)}
        onContactarEmpresa={
          vacanteDetalle && vacanteDetalle.id in aplicaciones
            ? () => handleContactarEmpresa(vacanteDetalle)
            : undefined
        }
      />
    </View>
    </LiquidBackground>
  );
}

// ─────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────
const makeStyles = (COLORS: GradlyColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.backgroundDark },

  // ── Header
  header: {
    backgroundColor: COLORS.backgroundCard,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  greeting: { fontSize: 20, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
  phrase: {
    fontSize: 12,
    fontFamily: FONTS.interRegular,
    color: COLORS.textMuted,
    marginTop: 3,
  },
  fecha: {
    fontSize: 11,
    fontFamily: FONTS.interRegular,
    color: COLORS.textMuted,
    textAlign: 'right',
    maxWidth: 120,
  },

  // Búsqueda
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: FONTS.interRegular,
    color: COLORS.textPrimary,
  },

  // Filtros
  filtrosOuter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  filtrosViewport: { flex: 1 },
  filtrosScroll: { gap: 8, paddingRight: 4 },
  filtrosArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.backgroundSurface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filtrosArrowDisabled: {
    opacity: 0.45,
  },
  filtroChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: COLORS.backgroundSurface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filtroChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filtroChipText: {
    fontSize: 12,
    fontFamily: FONTS.interMedium,
    color: COLORS.textMuted,
  },
  filtroChipTextActive: { color: COLORS.textPrimary },

  // ── Card
  card: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  logo: { width: 48, height: 48, borderRadius: 24 },
  logoFallback: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  logoInitial: {
    fontSize: 20, fontFamily: FONTS.soraBold, color: COLORS.textPrimary,
  },
  empresaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  empresaNombre: {
    fontSize: 12, fontFamily: FONTS.interMedium,
    color: COLORS.textMuted, flex: 1,
  },
  premiumBadge: {
    backgroundColor: COLORS.gold + '22',
    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2,
    borderWidth: 1, borderColor: COLORS.gold + '44',
  },
  premiumText: {
    fontSize: 9, fontFamily: FONTS.interSemiBold, color: COLORS.gold,
  },
  titulo: {
    fontSize: 15, fontFamily: FONTS.soraSemiBold, color: COLORS.textPrimary,
  },

  // Chips en card
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20,
  },
  chipSmall: { paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 11, fontFamily: FONTS.interMedium },

  // Footer card
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  dateText: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  aplicarBtn: {
    paddingHorizontal: 18, paddingVertical: 8,
    borderRadius: 10,
    minWidth: 80, alignItems: 'center',
  },
  aplicarBtnText: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },

  // ── States
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 80 },
  emptyTitle: { fontSize: 16, fontFamily: FONTS.soraSemiBold, color: COLORS.textMuted },
  emptyDesc: {
    fontSize: 13, fontFamily: FONTS.interRegular,
    color: COLORS.textMuted, textAlign: 'center', lineHeight: 20,
  },
  pasantiasSectionLabel: {
    fontSize: 13, fontFamily: FONTS.soraSemiBold, color: COLORS.textPrimary,
    marginBottom: 8, marginTop: 4,
  },
  estadoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: COLORS.primary12, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
    padding: 12, marginBottom: 14,
  },
  estadoBannerText: {
    flex: 1, fontSize: 12.5, fontFamily: FONTS.interRegular,
    color: COLORS.textSecondary, lineHeight: 18,
  },

  // ── Toast
  toast: {
    position: 'absolute',
    bottom: 90,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 24,
    paddingHorizontal: 18, paddingVertical: 10,
    borderWidth: 1, borderColor: COLORS.success + '44',
  },
  toastText: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.success },
});
