import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  collection,
  documentId,
  getDocs,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { aplicarAVacante } from '../../src/services/pasantiaService';
import { abrirChatDirectoEmpresaEstudiante } from '../../src/services/chatService';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
  area: string;
  horas_requeridas: number;
  skills_requeridas: string[];
  fecha_publicacion: any;
  premium?: boolean;
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
  { key: 'Tecnología',  label: 'Tecnología' },
  { key: 'Diseño',      label: 'Diseño' },
  { key: 'Marketing',   label: 'Marketing' },
  { key: 'Finanzas',    label: 'Finanzas' },
  { key: 'Salud',       label: 'Salud' },
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
}: {
  vacante: Vacante;
  yaAplico: boolean;
  estadoAplicacion: string;
  onAplicar: (v: Vacante) => void;
  onVerDetalle: (v: Vacante) => void;
  applying: boolean;
  empresaTier?: RangoTier;
}) {
  const { styles } = useThemedStyles();
  const initial = vacante.nombre_empresa?.[0]?.toUpperCase() ?? '?';

  const btnColor = yaAplico
    ? estadoAplicacion === 'contratado' ? COLORS.success
    : estadoAplicacion === 'rechazado' ? COLORS.error
    : COLORS.warning
    : COLORS.primaryDark;

  const btnLabel = yaAplico
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
            <Text style={styles.titulo} numberOfLines={2}>{vacante.titulo}</Text>
          </View>
        </View>

        {/* Chips de tipo */}
        <View style={styles.chipsRow}>
          <Chip label={vacante.tipo} color={COLORS.primary} />
          <Chip label={vacante.modalidad} color={COLORS.backgroundSurface} textColor={COLORS.textSecondary} />
          <Chip label={`${vacante.horas_requeridas}h`} color={COLORS.backgroundSurface} textColor={COLORS.textMuted} />
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
          style={[styles.aplicarBtn, { backgroundColor: btnColor }, applying && { opacity: 0.6 }]}
          contentStyle={{ paddingVertical: 8, paddingHorizontal: 18 }}
          onPress={() => !yaAplico && onAplicar(vacante)}
          disabled={yaAplico || applying}
        >
          {applying
            ? <ActivityIndicator size="small" color={COLORS.textPrimary} />
            : <Text style={styles.aplicarBtnText}>{btnLabel}</Text>
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

  const [vacantes,       setVacantes]       = useState<Vacante[]>([]);
  const [aplicaciones,   setAplicaciones]   = useState<Record<string, string>>({});
  const [applying,       setApplying]       = useState<string | null>(null);
  const [searchInput,    setSearchInput]    = useState('');
  const [searchQuery,    setSearchQuery]    = useState('');
  const [filtroActivo,   setFiltroActivo]   = useState('todas');
  const [phraseIdx,      setPhraseIdx]      = useState(0);
  const [cargando,       setCargando]       = useState(true);
  const [vacanteDetalle, setVacanteDetalle] = useState<Vacante | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const phraseOpacity = useRef(new Animated.Value(1)).current;
  const toastOpacity  = useRef(new Animated.Value(0)).current;
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
    let res = vacantes;
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
  }, [vacantes, searchQuery, filtroActivo]);

  // ── Aplicar a vacante ────────────────────────────────────────────
  const handleAplicar = useCallback(async (vacante: Vacante) => {
    if (!user) { Alert.alert('Debes iniciar sesión.'); return; }

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
  }, [user, userProfile, showToast]);

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

  // ── Empty state ───────────────────────────────────────────────────
  const EmptyState = () => (
    <View style={styles.empty}>
      <Ionicons name="briefcase-outline" size={56} color={COLORS.border} />
      <Text style={styles.emptyTitle}>Sin resultados</Text>
      <Text style={styles.emptyDesc}>Prueba cambiando el filtro o la búsqueda.</Text>
    </View>
  );

  // ── Render ────────────────────────────────────────────────────────
  return (
    <LiquidBackground>
    <View style={[styles.root, { backgroundColor: 'transparent' }]}>
      <StatusBar style="light" />

      {/* ── HEADER ── */}
      <View style={styles.header}>
        {/* Saludo */}
        <View style={styles.greetingRow}>
          <View>
            <Text style={styles.greeting}>Hola, {nombre}! 👋</Text>
            <Animated.Text style={[styles.phrase, { opacity: phraseOpacity }]}>
              {FRASES[phraseIdx]}
            </Animated.Text>
          </View>
          <Text style={styles.fecha}>{fecha}</Text>
        </View>

        {/* Búsqueda */}
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

        {/* Chips de filtro */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtrosScroll}
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
      </View>

      {/* ── FEED ── */}
      {cargando ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
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
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 100 }}
          ListEmptyComponent={<EmptyState />}
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
  filtrosScroll: { paddingHorizontal: 16, gap: 8 },
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
