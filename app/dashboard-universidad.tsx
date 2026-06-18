import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { deleteApp, getApps, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import { firebaseConfig } from '../src/config/firebaseConfig';
import { universidadApruebaHoras } from '../src/services/pasantiaService';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import FloatingSearchButton from '../src/components/FloatingSearchButton';
import FloatingTopBar from '../src/components/FloatingTopBar';
import StorageAvatar from '../src/components/StorageAvatar';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as XLSX from 'xlsx';
import FloatingNavBar, { type NavItem } from '../src/components/FloatingNavBar';
import { VacantesDisponibles } from '../src/components/Matchmaking';
import { PerfilStatsUniversidad, RedGradlyBanner } from '../src/components/NetworkStats';
import { OnboardingBubble, useOnboarding } from '../src/components/OnboardingTour';
import { useAuth } from '../src/context/AuthContext';
import { crearChatGrupoOficial, subscribeUnreadTotal } from '../src/services/chatService';
import { enviarNotificacion } from '../src/services/notificationService';
import { auth, db, storage } from '../src/config/firebaseConfig';
import { COLORS, FONTS, useTheme, type GradlyColors } from '../src/context/ThemeContext';
import { useAuthGuard } from '../src/hooks/useAuthGuard';
import { shadow } from '../src/utils/shadow';
import { LiquidBackground } from '../components/ui/liquid-glass/LiquidBackground';
import { GlassCard } from '../components/ui/liquid-glass/GlassCard';
import { JellyButton } from '../components/ui/liquid-glass/JellyButton';

// Hook que recrea los estilos según el tema activo (claro/oscuro)
function useThemedStyles() {
  const { colors } = useTheme();
  return useMemo(
    () => ({ colors, styles: makeStyles(colors), s: makeS(colors) }),
    [colors],
  );
}

const { width: SCREEN_W } = Dimensions.get('window');
const IS_WIDE = SCREEN_W >= 768;

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
type SeccionUni = 'inicio' | 'estudiantes' | 'aprobar' | 'estadisticas';

interface EstudianteRow {
  id: string;
  nombre_completo: string;
  carrera: string;
  semestre: number;
  horas_aprobadas: number;
  horas_objetivo: number;
  horas_en_proceso: number;
  foto_url?: string;
  activo: boolean;
}

interface Aplicacion {
  id: string;
  estudiante_id: string;
  estudiante_nombre: string;
  vacante_id: string;
  empresa_id: string;
  estado: string;
  horas_completadas: number;
  pago_confirmado: boolean;
  fecha_aplicacion: any;
  fecha_inicio?: any;
  fecha_fin?: any;
  // campos desnormalizados que cargaremos
  nombre_empresa?: string;
  titulo_vacante?: string;
}

interface PerfilUni {
  nombre_universidad: string;
  dominio_correo: string;
  logo_url?: string;
  direccion?: string;
  contacto_nombre?: string;
  contacto_correo?: string;
}

// Fila genérica de Excel — los encabezados pueden variar, se detectan por patrón
interface ExcelRow { [columna: string]: any }

// Columnas permitidas en la plantilla de importación
const COLUMNAS_EXCEL = {
  nombres:      { label: 'Nombres completos',          patrones: ['nombre'],                     obligatoria: true },
  correos:      { label: 'Correos electrónicos',        patrones: ['correo', 'email', 'e-mail'],  obligatoria: true },
  documento:    { label: 'Documento de identidad',      patrones: ['documento', 'identidad', 'dui', 'cedula', 'cédula'], obligatoria: false },
  municipio:    { label: 'Municipio',                   patrones: ['municipio'],                  obligatoria: false },
  departamento: { label: 'Departamento de residencia',  patrones: ['departamento'],               obligatoria: false },
} as const;

/** Extrae el valor de una fila buscando una columna cuyo encabezado contenga alguno de los patrones. */
function valorColumna(row: ExcelRow, patrones: readonly string[]): string {
  for (const k of Object.keys(row)) {
    const norm = k.trim().toLowerCase();
    if (patrones.some(p => norm.includes(p))) return String(row[k] ?? '').trim();
  }
  return '';
}

// ── Previsualización de importación ───────────────────────────────
const RX_EMAIL_EXCEL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FilaPreview {
  index: number;        // número de fila (1-based)
  nombre: string;
  correo: string;
  documento: string;
  municipio: string;
  departamento: string;
  valido: boolean;
  error: string;        // motivo cuando es inválida
}

/** Convierte las filas crudas del Excel en filas validadas para la vista previa. */
function construirPreview(rows: ExcelRow[]): FilaPreview[] {
  return rows.map((row, i) => {
    const nombre       = valorColumna(row, COLUMNAS_EXCEL.nombres.patrones);
    const correo       = valorColumna(row, COLUMNAS_EXCEL.correos.patrones).toLowerCase();
    const documento    = valorColumna(row, COLUMNAS_EXCEL.documento.patrones);
    const municipio    = valorColumna(row, COLUMNAS_EXCEL.municipio.patrones);
    const departamento = valorColumna(row, COLUMNAS_EXCEL.departamento.patrones);
    let error = '';
    if (!nombre || !correo) error = 'Dato obligatorio faltante';
    else if (!RX_EMAIL_EXCEL.test(correo)) error = 'Correo con formato inválido';
    return {
      index: i + 1,
      nombre,
      correo,
      documento,
      municipio,
      departamento,
      valido: !error,
      error,
    };
  });
}

// Contraseña temporal unificada para el primer acceso de los estudiantes importados.
const PASSWORD_TEMPORAL = 'Gradly2026!';

// ── Validaciones del formulario de grupo ──
const RX_GRUPO_NOMBRE  = /^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s-]+$/; // letras, números y guiones
const RX_GRUPO_LETRAS  = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/;      // solo letras y espacios

/** Devuelve mensaje de error ('' si es válido) para cada campo del grupo. */
const valGrupoNombre = (v: string) => {
  const t = v.trim();
  if (!t) return 'El nombre del grupo es obligatorio';
  if (!RX_GRUPO_NOMBRE.test(t)) return 'Solo letras, números y guiones';
  return '';
};
const valGrupoCarrera = (v: string) => {
  const t = v.trim();
  if (!t) return 'La carrera es obligatoria';
  if (!RX_GRUPO_LETRAS.test(t)) return 'Solo se permiten letras y espacios';
  return '';
};
const valGrupoHoras = (v: string) => {
  const t = v.trim();
  if (!t) return 'Las horas a cumplir son obligatorias';
  if (!/^\d+$/.test(t) || Number(t) <= 0) return 'Ingresa un número mayor a 0';
  return '';
};
const valGrupoDocente = (v: string) => {
  const t = v.trim();
  if (!t) return ''; // opcional
  if (!RX_GRUPO_LETRAS.test(t)) return 'Solo se permiten letras';
  return '';
};

interface Grupo {
  id: string;
  nombre: string;
  carrera: string;
  horasRequeridas: number;
  docente: string;
  estudiantes_registrados: number;
}

// ── Heurística de columnas del Excel ──
const KEYS_NOMBRE = ['estudiante', 'nombre', 'alumno', 'student', 'name'];
const KEYS_CORREO = ['correo', 'email', 'e-mail', 'mail'];

/** Busca en una fila la primera columna cuyo encabezado contenga alguno de los patrones. */
function buscarValor(row: ExcelRow, patrones: string[]): string {
  for (const k of Object.keys(row)) {
    const norm = k.trim().toLowerCase();
    if (patrones.some(p => norm.includes(p))) return String(row[k] ?? '').trim();
  }
  return '';
}

/** Contraseña genérica: "Gradly" + 4 dígitos aleatorios + "!". Ej: Gradly4821! */
function generarPassword(): string {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `Gradly${n}!`;
}

interface EstudianteNuevo {
  nombre: string;
  correo: string;
  password: string;
}

/** Extrae los pares { nombre, correo, password } válidos de las filas del Excel. */
function extraerEstudiantes(rows: ExcelRow[]): EstudianteNuevo[] {
  const out: EstudianteNuevo[] = [];
  const vistos = new Set<string>();
  for (const row of rows) {
    const nombre = buscarValor(row, KEYS_NOMBRE);
    const correo = buscarValor(row, KEYS_CORREO).toLowerCase();
    if (!nombre || !correo) continue;
    if (!RX_EMAIL_EXCEL.test(correo)) continue; // descarta correos mal formados
    if (vistos.has(correo)) continue;            // evita duplicados
    vistos.add(correo);
    out.push({ nombre, correo, password: generarPassword() });
  }
  return out;
}

const MENU: { key: SeccionUni; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'inicio',       label: 'Inicio',            icon: 'home-outline' },
  { key: 'estudiantes',  label: 'Mis Estudiantes',   icon: 'people-outline' },
  { key: 'aprobar',      label: 'Aprobar Pasantías', icon: 'checkmark-done-outline' },
  { key: 'estadisticas', label: 'Estadísticas',      icon: 'bar-chart-outline' },
];

// ── Onboarding (guía por globos) ──────────────────────────────────
const TOUR_CLAVES: SeccionUni[] = ['inicio', 'estudiantes', 'aprobar', 'estadisticas'];
const TOUR_PASOS: Record<SeccionUni, { titulo: string; texto: string }> = {
  inicio: {
    titulo: '¡Bienvenido a tu panel! 🎓',
    texto:
      'Este es tu panel general. Aquí ves de un vistazo el total de estudiantes, las pasantías activas, las horas aprobadas y las solicitudes pendientes.',
  },
  estudiantes: {
    titulo: 'Mis Estudiantes',
    texto:
      'Administra a tus estudiantes, su carrera y su progreso de horas sociales. Puedes registrarlos uno a uno o importarlos masivamente desde un Excel.',
  },
  aprobar: {
    titulo: 'Aprobar Pasantías',
    texto:
      'Revisa las horas que tus estudiantes completaron y apruébalas o recházalas. Las horas aprobadas suman a su progreso.',
  },
  estadisticas: {
    titulo: 'Estadísticas',
    texto:
      'Visualiza métricas y tendencias del avance de tus estudiantes y de tu institución.',
  },
};

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────
export default function DashboardUniversidad() {
  useAuthGuard('universidad');
  const { user, userProfile } = useAuth();
  const router = useRouter();
  const { styles, colors } = useThemedStyles();

  const [seccion,      setSeccion]      = useState<SeccionUni>('inicio');
  const [mensajesNoLeidos, setMensajesNoLeidos] = useState(0);
  const [perfil,       setPerfil]       = useState<PerfilUni | null>(null);
  const [estudiantes,  setEstudiantes]  = useState<EstudianteRow[]>([]);
  const [apps,         setApps]         = useState<Aplicacion[]>([]);
  const [showEditPerfil, setShowEditPerfil] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);

  const confirmarCierreSesion = async () => {
    try {
      setLogoutModalVisible(false);
      await signOut(auth);
      router.replace('/auth/iniciosesion' as any);
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  const handleAyuda = () => {
    Alert.alert('Ayuda', 'Escríbenos a soporte@gradly.app y te ayudaremos con cualquier duda.');
  };
  const handleAcerca = () => {
    Alert.alert('Acerca de Gradly', 'Gradly conecta estudiantes, universidades y empresas para gestionar pasantías y horas sociales.\n\nVersión 1.0.0');
  };

  const abrirEditPerfil = () => {
    setEditNombre(perfil?.nombre_universidad ?? '');
    setEditDominio(perfil?.dominio_correo ?? '');
    setEditDir(perfil?.direccion ?? '');
    setEditContacto(perfil?.contacto_nombre ?? '');
    setEditCorreo(perfil?.contacto_correo ?? '');
    setShowEditPerfil(true);
  };

  // Edit perfil
  const [editNombre,   setEditNombre]   = useState('');
  const [editDominio,  setEditDominio]  = useState('');
  const [editDir,      setEditDir]      = useState('');
  const [editContacto, setEditContacto] = useState('');
  const [editCorreo,   setEditCorreo]   = useState('');
  const [uploadingLogo,setUploadingLogo]= useState(false);

  // ── Firestore ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      doc(db, 'perfiles_universidades', user.uid),
      snap => { if (snap.exists()) setPerfil(snap.data() as PerfilUni); },
      error => console.warn('Error en listener (perfil universidad):', error),
    );
    return unsub;
  }, [user]);

  // Badge de mensajes no leídos del usuario
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeUnreadTotal(user.uid, setMensajesNoLeidos);
    return unsub;
  }, [user?.uid]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'perfiles_estudiantes'), where('universidad_id', '==', user.uid));
    const unsub = onSnapshot(
      q,
      snap => setEstudiantes(snap.docs.map(d => ({ id: d.id, ...d.data() } as EstudianteRow))),
      error => console.warn('Error en listener (estudiantes):', error),
    );
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'aplicaciones'), where('universidad_id', '==', user.uid));
    const unsub = onSnapshot(
      q,
      snap => setApps(snap.docs.map(d => ({ id: d.id, ...d.data() } as Aplicacion))),
      error => console.warn('Error en listener (aplicaciones):', error),
    );
    return unsub;
  }, [user]);

  // ── Métricas ──────────────────────────────────────────────────────
  const metricas = useMemo(() => ({
    totalEstudiantes: estudiantes.length,
    enPasantia:   apps.filter(a => a.estado === 'contratado').length,
    horasAprobadas: estudiantes.reduce((acc, e) => acc + (e.horas_aprobadas ?? 0), 0),
    pendAprobacion: apps.filter(a => a.estado === 'finalizado').length,
  }), [estudiantes, apps]);

  // ── Upload logo ────────────────────────────────────────────────────
  const handleUploadLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permiso necesario'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (result.canceled) return;
    setUploadingLogo(true);
    try {
      const resp = await fetch(result.assets[0].uri);
      const blob = await resp.blob();
      const storageRef = ref(storage, `logos/${user!.uid}`);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      // Cache-busting: fuerza a <Image/> a descargar la versión nueva al instante
      const urlConCache = `${url}${url.includes('?') ? '&' : '?'}t=${new Date().getTime()}`;
      // Actualizamos AMBOS documentos: el perfil específico y la colección 'usuarios'
      await Promise.all([
        updateDoc(doc(db, 'perfiles_universidades', user!.uid), { logo_url: urlConCache }),
        updateDoc(doc(db, 'usuarios', user!.uid), { foto_url: urlConCache }),
      ]);
      // Refleja el cambio en el estado local de inmediato (no esperar al snapshot)
      setPerfil(prev => (prev ? { ...prev, logo_url: urlConCache } : prev));
    } catch { Alert.alert('Error', 'No se pudo subir el logo.'); }
    finally { setUploadingLogo(false); }
  };

  // ── Guardar perfil ────────────────────────────────────────────────
  const handleSavePerfil = async () => {
    try {
      await updateDoc(doc(db, 'perfiles_universidades', user!.uid), {
        nombre_universidad: editNombre,
        dominio_correo:     editDominio,
        direccion:          editDir,
        contacto_nombre:    editContacto,
        contacto_correo:    editCorreo,
      });
      setShowEditPerfil(false);
    } catch { Alert.alert('Error', 'No se pudo guardar.'); }
  };

  // ── Aprobar pasantía (usa universidadApruebaHoras del servicio) ───
  const handleAprobar = async (app: Aplicacion, horasAjustadas: number) => {
    try {
      const nivel = await universidadApruebaHoras(
        app.id,
        app.estudiante_id,
        horasAjustadas,
        500, // horas objetivo default
      );
      Alert.alert('Aprobado', `Se sumaron ${horasAjustadas} horas.\nNivel: ${nivel.titulo}`);
    } catch { Alert.alert('Error', 'No se pudo aprobar.'); }
  };

  const handleRechazar = async (app: Aplicacion, motivo: string) => {
    try {
      await updateDoc(doc(db, 'aplicaciones', app.id), {
        estado: 'rechazado', notas: motivo,
      });
    } catch { Alert.alert('Error', 'No se pudo rechazar.'); }
  };

  // ── RENDER ───────────────────────────────────────────────────────
  const nombreUni = perfil?.nombre_universidad ?? (userProfile as any)?.nombre_completo ?? 'Universidad';

  // ── Onboarding ────────────────────────────────────────────────────
  const tour = useOnboarding(user?.uid, seccion, TOUR_CLAVES);

  // ── Items del menú flotante ("Mensajes" y "Mi Perfil" al final) ──
  type NavKey = SeccionUni | 'mensajes' | 'perfil';
  const navItems: NavItem<NavKey>[] = [
    ...MENU.map(m => ({
      key: m.key as NavKey,
      label: m.label,
      icon: m.icon,
      badge: m.key === 'aprobar' ? metricas.pendAprobacion : undefined,
    })),
    { key: 'mensajes', label: 'Mensajes', icon: 'chatbubble-ellipses-outline', badge: mensajesNoLeidos },
    { key: 'perfil', label: 'Mi Perfil', icon: 'person-circle-outline' },
  ];

  const renderSeccion = () => {
    switch (seccion) {
      case 'inicio':       return <SeccionInicio metricas={metricas} perfil={perfil} nombreUni={nombreUni} uid={user!.uid} />;
      case 'estudiantes':  return <SeccionEstudiantes estudiantes={estudiantes} uid={user!.uid} />;
      case 'aprobar':      return <SeccionAprobar apps={apps} onAprobar={handleAprobar} onRechazar={handleRechazar} />;
      case 'estadisticas': return <SeccionEstadisticas estudiantes={estudiantes} apps={apps} />;
      default:             return null;
    }
  };

  // ── Guard de ciclo de vida: evita render/crasheos con UID null ──
  // (todos los hooks ya se ejecutaron arriba, así que es seguro retornar aquí)
  if (!user || !user.uid) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <LiquidBackground>
    <View style={[styles.root, { backgroundColor: 'transparent' }]}>
      <StatusBar style="light" />

      {/* ── CONTENIDO ── */}
      <View style={styles.main}>
        <View style={styles.mainHeader}>
          <TouchableOpacity onPress={abrirEditPerfil} activeOpacity={0.8}>
            <StorageAvatar
              url={perfil?.logo_url}
              storagePath={user ? `logos/${user.uid}` : null}
              size={40}
              fallbackIcon="school"
            />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.mainTitle} numberOfLines={1}>
              {MENU.find(m => m.key === seccion)?.label ?? 'Inicio'}
            </Text>
            <Text style={styles.mainSubtitle} numberOfLines={1}>{nombreUni}</Text>
          </View>
        </View>
        {renderSeccion()}
      </View>

      {/* ── BOTONES FLOTANTES SUPERIORES (Glassmorphism) ── */}
      <FloatingTopBar userId={user?.uid} />

      {/* ── BÚSQUEDA FLOTANTE (oculta en "Mis Estudiantes", que tiene su propia barra) ── */}
      {seccion !== 'estudiantes' && <FloatingSearchButton placeholder="Buscar estudiantes..." />}

      {/* ── MENÚ FLOTANTE (Glassmorphism) ── */}
      <FloatingNavBar
        items={navItems}
        activeKey={seccion}
        onChange={(k) =>
          k === 'perfil'
            ? abrirEditPerfil()
            : k === 'mensajes'
              ? router.push('/mensajes' as any)
              : setSeccion(k)
        }
      />

      {/* ── MODAL: Editar Perfil ── */}
      <Modal visible={showEditPerfil} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.sheetCard}>
            <Text style={styles.modalTitle}>Perfil de la universidad</Text>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
            {/* ── Panel de estadísticas (gráficas) ── */}
            <View style={{ marginBottom: 6 }}>
              <PerfilStatsUniversidad universidadId={user!.uid} />
            </View>
            <TouchableOpacity style={styles.logoUploadBtn} onPress={handleUploadLogo} disabled={uploadingLogo}>
              {uploadingLogo
                ? <ActivityIndicator color={COLORS.primaryLight} />
                : <Ionicons name="image-outline" size={20} color={COLORS.primaryLight} />
              }
              <Text style={styles.logoUploadText}>Cambiar logo</Text>
            </TouchableOpacity>
            {[
              { label: 'Nombre de la universidad', value: editNombre, set: setEditNombre },
              { label: 'Dominio de correo (ej. @uca.edu.sv)', value: editDominio, set: setEditDominio },
              { label: 'Dirección', value: editDir, set: setEditDir },
              { label: 'Contacto principal', value: editContacto, set: setEditContacto },
              { label: 'Correo del contacto', value: editCorreo, set: setEditCorreo },
            ].map(f => (
              <View key={f.label}>
                <Text style={styles.fieldLabel}>{f.label}</Text>
                <TextInput
                  style={styles.modalInput}
                  value={f.value}
                  onChangeText={f.set}
                  placeholderTextColor={COLORS.textMuted}
                  selectionColor={COLORS.primary}
                />
              </View>
            ))}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowEditPerfil(false)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <JellyButton style={styles.modalSave} contentStyle={{ paddingVertical: 0 }} onPress={handleSavePerfil}>
                <Text style={styles.modalSaveText}>Guardar</Text>
              </JellyButton>
            </View>

            {/* ── Cuenta: ayuda · acerca de · cerrar sesión (al final) ── */}
            <View style={styles.perfilFooter}>
              <TouchableOpacity style={styles.footerBtn} onPress={handleAyuda}>
                <Ionicons name="help-circle-outline" size={18} color={colors.primaryLight} />
                <Text style={styles.footerBtnText}>Ayuda</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.footerBtn} onPress={handleAcerca}>
                <Ionicons name="information-circle-outline" size={18} color={colors.primaryLight} />
                <Text style={styles.footerBtnText}>Acerca de Gradly</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.logoutFooterBtn}
                onPress={() => setLogoutModalVisible(true)}
              >
                <Ionicons name="log-out-outline" size={18} color={colors.error} />
                <Text style={styles.logoutFooterText}>Cerrar sesión</Text>
              </TouchableOpacity>
            </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Onboarding (guía por globos) ── */}
      <OnboardingBubble
        visible={tour.visible}
        titulo={TOUR_PASOS[seccion].titulo}
        texto={TOUR_PASOS[seccion].texto}
        paso={tour.paso}
        total={tour.total}
        esUltimo={tour.esUltimo}
        onContinuar={tour.marcar}
        onSaltar={tour.saltar}
      />

      {/* ── MODAL: Confirmar cierre de sesión (Liquid Glass) ── */}
      <Modal transparent visible={logoutModalVisible} animationType="fade" onRequestClose={() => setLogoutModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(7,5,15,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#1a162b', borderRadius: 20, padding: 24, width: '100%', maxWidth: 320, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)' }}>
            <Text style={{ fontSize: 18, color: '#fff', fontWeight: 'bold', textAlign: 'center', marginBottom: 10 }}>Cerrar Sesión</Text>
            <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginBottom: 24 }}>¿Estás seguro de que deseas salir de tu cuenta?</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center' }} onPress={() => setLogoutModalVisible(false)}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: '#ef4444', alignItems: 'center' }} onPress={confirmarCierreSesion}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Salir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
    </LiquidBackground>
  );
}

// ─────────────────────────────────────────────
// SECCIÓN: INICIO
// ─────────────────────────────────────────────
function SeccionInicio({ metricas, perfil, nombreUni, uid }: any) {
  const { s } = useThemedStyles();
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      {/* ── Estadísticas de la Red Gradly ── */}
      <RedGradlyBanner />

      <GlassCard style={{ marginBottom: 16 }} contentStyle={{ flexDirection: 'row', alignItems: 'center', padding: 20 }}>
        <View style={{ flex: 1 }}>
          <Text style={s.bannerTitle}>Bienvenido</Text>
          <Text style={s.bannerNombre}>{nombreUni}</Text>
        </View>
        {perfil?.logo_url && (
          <View style={s.logoWrap}>
            <Ionicons name="school" size={28} color={COLORS.primaryLight} />
          </View>
        )}
      </GlassCard>

      <View style={s.metricasGrid}>
        <MetricCard icon="people-outline"         label="Estudiantes"       value={metricas.totalEstudiantes} color={COLORS.primaryLight} />
        <MetricCard icon="briefcase-outline"       label="En pasantía"      value={metricas.enPasantia}       color={COLORS.success} />
        <MetricCard icon="time-outline"            label="Horas aprobadas"  value={metricas.horasAprobadas}   color={COLORS.accent} />
        <MetricCard icon="alert-circle-outline"    label="Pend. aprobación" value={metricas.pendAprobacion}   color={COLORS.warning} />
      </View>

      {/* ── Matchmaking: vacantes disponibles y postulaciones ── */}
      <View style={{ marginTop: 8 }}>
        <VacantesDisponibles universidadId={uid} />
      </View>
    </ScrollView>
  );
}

function MetricCard({ icon, label, value, color }: any) {
  const { s } = useThemedStyles();
  return (
    <GlassCard style={{ flex: 1, minWidth: 120 }} contentStyle={{ padding: 14, gap: 4 }}>
      <Ionicons name={icon} size={24} color={color} />
      <Text style={[s.metricValue, { color }]}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </GlassCard>
  );
}

// ─────────────────────────────────────────────
// SECCIÓN: ESTUDIANTES + IMPORTAR EXCEL
// ─────────────────────────────────────────────
function SeccionEstudiantes({ estudiantes, uid }: { estudiantes: EstudianteRow[]; uid: string }) {
  const { styles, s, colors } = useThemedStyles();
  const router = useRouter();

  // ── Búsqueda ──
  const [busqueda, setBusqueda] = useState('');
  const [busquedaAplicada, setBusquedaAplicada] = useState('');

  // ── Pestañas ──
  const [tab, setTab] = useState<'grupos' | 'estudiantes'>('grupos');

  // ── Grupos (tiempo real) ──
  const [grupos, setGrupos] = useState<Grupo[]>([]);

  // ── Formulario de creación de grupo (Paso 1) ──
  const [gNombre, setGNombre]   = useState('');
  const [gCarrera, setGCarrera] = useState('');
  const [gHoras, setGHoras]     = useState('');
  const [gDocente, setGDocente] = useState('');

  // ── Flujo de modales ──
  const [showModalGrupo, setShowModalGrupo]       = useState(false); // Paso 1
  const [showModalExcel, setShowModalExcel]       = useState(false); // Paso 2
  const [showProgreso, setShowProgreso]           = useState(false); // Creando cuentas
  const [showCredenciales, setShowCredenciales]   = useState(false); // Resultado
  const [progreso, setProgreso] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [credenciales, setCredenciales] = useState<EstudianteNuevo[]>([]);
  const [grupoCreadoNombre, setGrupoCreadoNombre] = useState('');

  // ── Validaciones en tiempo real del formulario de grupo ──
  const errNombre  = valGrupoNombre(gNombre);
  const errCarrera = valGrupoCarrera(gCarrera);
  const errHoras   = valGrupoHoras(gHoras);
  const errDocente = valGrupoDocente(gDocente);
  const formGrupoValido = !errNombre && !errCarrera && !errHoras && !errDocente;

  // ── Suscripción en tiempo real a los grupos de esta universidad ──
  useEffect(() => {
    const q = query(collection(db, 'grupos'), where('universidad_id', '==', uid));
    const unsub = onSnapshot(
      q,
      snap => {
        const lista = snap.docs
          .map(d => {
            const data = d.data();
            return {
              id: d.id,
              nombre: (data.nombre as string) ?? 'Sin nombre',
              carrera: (data.carrera as string) ?? '',
              horasRequeridas: (data.horasRequeridas as number) ?? 0,
              docente: (data.docente as string) ?? 'Sin asignar',
              estudiantes_registrados: (data.estudiantes_registrados as number) ?? 0,
            };
          })
          .sort((a, b) => a.nombre.localeCompare(b.nombre));
        setGrupos(lista);
      },
      error => console.warn('Error en listener (grupos):', error),
    );
    return unsub;
  }, [uid]);

  // ── Filtrado por la búsqueda aplicada (al pulsar "Buscar") ──
  const gruposFiltrados = useMemo(() => {
    const q = busquedaAplicada.trim().toLowerCase();
    if (!q) return grupos;
    return grupos.filter(g => g.nombre.toLowerCase().includes(q) || g.carrera.toLowerCase().includes(q));
  }, [grupos, busquedaAplicada]);

  const estudiantesFiltrados = useMemo(() => {
    const q = busquedaAplicada.trim().toLowerCase();
    if (!q) return estudiantes;
    return estudiantes.filter(e =>
      e.nombre_completo.toLowerCase().includes(q) || (e.carrera ?? '').toLowerCase().includes(q),
    );
  }, [estudiantes, busquedaAplicada]);

  const resetForm = () => { setGNombre(''); setGCarrera(''); setGHoras(''); setGDocente(''); };

  // ── Chat grupal oficial: crea (o reutiliza) la sala y la abre ──
  const [creandoChatGrupo, setCreandoChatGrupo] = useState<string | null>(null);
  const abrirChatGrupo = async (grupo: Grupo) => {
    if (creandoChatGrupo) return;
    setCreandoChatGrupo(grupo.id);
    try {
      const chatId = await crearChatGrupoOficial({
        universidadId: uid,
        grupoId: grupo.id,
        grupoNombre: grupo.nombre,
      });
      router.push({
        pathname: '/ChatScreen',
        params: { chatId, peerName: grupo.nombre },
      } as any);
    } catch (error) {
      console.warn('Error creando chat grupal:', error);
      Alert.alert('Error', 'No se pudo crear el chat del grupo. Intenta de nuevo.');
    } finally {
      setCreandoChatGrupo(null);
    }
  };

  // ── Paso 0 → 1: abrir el formulario de grupo ──
  const abrirFlujo = () => {
    resetForm();
    setShowModalGrupo(true);
  };

  // ── Paso 1 → 2: validar grupo (sin guardar todavía) y mostrar reglas del Excel ──
  const handleSiguienteGrupo = () => {
    if (!formGrupoValido) return;
    setShowModalGrupo(false);
    setShowModalExcel(true);
  };

  // ── Paso 2: elegir el archivo, leerlo (multiplataforma) y arrancar la creación ──
  const handleSeleccionarArchivo = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', '*/*'],
    });
    if (result.canceled) return;

    let rows: ExcelRow[];
    try {
      const fileUri = result.assets[0].uri;
      let workbook: XLSX.WorkBook;
      if (Platform.OS === 'web') {
        const blob = await (await fetch(fileUri)).blob();
        const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(blob);
        });
        workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
      } else {
        const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
        workbook = XLSX.read(base64, { type: 'base64' });
      }
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json<ExcelRow>(sheet);
    } catch {
      Alert.alert('Error', 'No se pudo leer el archivo. Asegúrate de que sea .xlsx o .csv.');
      return;
    }

    const nuevos = extraerEstudiantes(rows);
    if (nuevos.length === 0) {
      Alert.alert(
        'Sin datos válidos',
        'No se encontraron columnas de "Nombres" y "Correos" con datos válidos. Revisa el archivo e inténtalo de nuevo.',
      );
      return;
    }
    setShowModalExcel(false);
    await crearCuentas(nuevos);
  };

  // ── Creación masiva en Firebase usando una app secundaria (no cierra la sesión) ──
  const crearCuentas = async (lista: EstudianteNuevo[]) => {
    setProgreso({ done: 0, total: lista.length });
    setShowProgreso(true);

    // App secundaria: registrar estudiantes sin desconectar a la universidad.
    const secondaryApp = getApps().find(a => a.name === 'Secondary')
      ?? initializeApp(firebaseConfig, 'Secondary');
    const secondaryAuth = getAuth(secondaryApp);

    try {
      // 1) Guardamos el grupo y obtenemos su ID.
      const grupoRef = await addDoc(collection(db, 'grupos'), {
        nombre:          gNombre.trim(),
        carrera:         gCarrera.trim(),
        horasRequeridas: Number(gHoras.trim()),
        docente:         gDocente.trim() || 'Sin asignar',
        universidad_id:  uid,
        fecha_creacion:  serverTimestamp(),
        estudiantes_registrados: 0,
      });
      const grupoId = grupoRef.id;
      const nombreGrupo = gNombre.trim();
      const carreraGrupo = gCarrera.trim();
      const horasGrupo = Number(gHoras.trim());

      // 2) Creamos cada cuenta de estudiante en la app secundaria.
      const creados: EstudianteNuevo[] = [];
      for (const est of lista) {
        try {
          const cred = await createUserWithEmailAndPassword(secondaryAuth, est.correo, est.password);
          const uidEst = cred.user.uid;

          await setDoc(doc(db, 'usuarios', uidEst), {
            nombre_completo: est.nombre,
            correo:          est.correo,
            rol:             'estudiante',
            fecha_registro:  serverTimestamp(),
            activo:          true,
            grupo_id:        grupoId,
            universidad_id:  uid,
          });

          await setDoc(doc(db, 'perfiles_estudiantes', uidEst), {
            nombre_completo:  est.nombre,
            correo:           est.correo,
            universidad_id:   uid,
            grupo_id:         grupoId,
            carrera:          carreraGrupo,
            horas_objetivo:   horasGrupo || 500,
            horas_aprobadas:  0,
            horas_en_proceso: 0,
            skills:           [],
            activo:           true,
          });

          creados.push(est);
        } catch (e) {
          // Correo ya registrado u otro error puntual: se omite y se continúa.
          console.warn('No se pudo crear el estudiante', est.correo, e);
        }
        setProgreso(p => ({ done: p.done + 1, total: lista.length }));
      }

      // 3) Actualizamos el contador real del grupo.
      try {
        await updateDoc(doc(db, 'grupos', grupoId), { estudiantes_registrados: creados.length });
      } catch { /* informativo */ }

      // Confirmación a la universidad (no bloquea la creación del grupo).
      try {
        await enviarNotificacion(
          uid,
          'Grupo creado',
          `El grupo "${nombreGrupo}" se creó con ${creados.length} estudiante(s) registrado(s).`,
          'success',
          grupoId,
        );
      } catch { /* la notificación no debe afectar el flujo principal */ }

      setCredenciales(creados);
      setGrupoCreadoNombre(nombreGrupo);
      resetForm();
      setShowCredenciales(true);
    } catch (e) {
      console.warn('Error en la creación masiva de estudiantes:', e);
      Alert.alert('Error', 'Ocurrió un problema al crear las cuentas. Intenta de nuevo.');
    } finally {
      // Aseguramos el logout secundario y liberamos la app temporal SIEMPRE.
      await signOut(secondaryAuth).catch(() => {});
      await deleteApp(secondaryApp).catch(() => {});
      setShowProgreso(false);
    }
  };

  // ── Copiar credenciales al portapapeles ──
  const handleCopiar = async () => {
    const texto = credenciales
      .map(c => `${c.nombre} | ${c.correo} | ${c.password}`)
      .join('\n');
    await Clipboard.setStringAsync(
      `Credenciales · Grupo ${grupoCreadoNombre}\n\n${texto}`,
    );
    Alert.alert('Copiado', 'Las credenciales se copiaron al portapapeles.');
  };

  const cerrarCredenciales = () => {
    setShowCredenciales(false);
    setCredenciales([]);
    setTab('estudiantes'); // Las listas se actualizan solas por onSnapshot.
  };

  const aplicarBusqueda = () => setBusquedaAplicada(busqueda);

  return (
    <View style={{ flex: 1 }}>
      {/* ── Barra de búsqueda + botón Buscar ── */}
      <View style={s.searchArea}>
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={16} color={COLORS.textMuted} />
          <TextInput
            style={s.searchInput}
            value={busqueda}
            onChangeText={setBusqueda}
            onSubmitEditing={aplicarBusqueda}
            returnKeyType="search"
            placeholder="Buscar grupos o estudiantes..."
            placeholderTextColor={COLORS.textMuted}
            selectionColor={COLORS.primary}
          />
        </View>
        <JellyButton
          style={s.buscarBtn}
          contentStyle={{ paddingVertical: 0, paddingHorizontal: 16, height: 40, alignItems: 'center', justifyContent: 'center' }}
          onPress={aplicarBusqueda}
        >
          <Text style={s.buscarBtnText}>Buscar</Text>
        </JellyButton>
      </View>

      {/* ── Cuadro de gestión (Liquid Glass) + botón principal ── */}
      <GlassCard style={s.gestionBox} contentStyle={{ padding: 16, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="cloud-upload-outline" size={20} color={colors.primaryLight} />
          <Text style={s.gestionTitle}>Gestión de estudiantes</Text>
        </View>
        <Text style={s.gestionText}>
          Crea un grupo (carrera y horas a cumplir) y carga a tus estudiantes desde un Excel.
          Se generarán automáticamente sus cuentas y credenciales de acceso.
        </Text>
        <JellyButton
          style={s.gestionMainBtn}
          contentStyle={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 11 }}
          onPress={abrirFlujo}
        >
          <Ionicons name="add-circle-outline" size={18} color={COLORS.textPrimary} />
          <Text style={s.gestionMainBtnText}>Crear Grupo y Cargar Estudiantes</Text>
        </JellyButton>
      </GlassCard>

      {/* ── Pestañas: Grupos / Estudiantes ── */}
      <View style={s.tabRow}>
        <TouchableOpacity
          style={[s.tabBtn, tab === 'grupos' && s.tabBtnActive]}
          onPress={() => setTab('grupos')}
          activeOpacity={0.8}
        >
          <Text style={[s.tabText, tab === 'grupos' && s.tabTextActive]}>Grupos Creados ({grupos.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tabBtn, tab === 'estudiantes' && s.tabBtnActive]}
          onPress={() => setTab('estudiantes')}
          activeOpacity={0.8}
        >
          <Text style={[s.tabText, tab === 'estudiantes' && s.tabTextActive]}>Estudiantes Registrados ({estudiantes.length})</Text>
        </TouchableOpacity>
      </View>

      {/* ── Contenido de la pestaña activa ── */}
      {tab === 'grupos' ? (
        <FlatList
          data={gruposFiltrados}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 110, gap: 8 }}
          renderItem={({ item }) => (
            <GlassCard contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
              <View style={s.estudianteAvatar}>
                <Ionicons name="people" size={18} color={colors.primaryLight} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.estudianteNombre} numberOfLines={1}>{item.nombre}</Text>
                <Text style={s.estudianteMeta} numberOfLines={1}>{item.carrera} · {item.docente}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text style={s.estudianteHoras}>{item.horasRequeridas}h</Text>
                <Text style={s.estudianteMeta}>{item.estudiantes_registrados} est.</Text>
              </View>
              <TouchableOpacity
                style={s.grupoChatBtn}
                onPress={() => abrirChatGrupo(item)}
                disabled={creandoChatGrupo === item.id}
                accessibilityLabel="Abrir chat del grupo"
              >
                {creandoChatGrupo === item.id ? (
                  <ActivityIndicator size="small" color={colors.primaryLight} />
                ) : (
                  <Ionicons name="chatbubbles" size={18} color={colors.primaryLight} />
                )}
              </TouchableOpacity>
            </GlassCard>
          )}
          ListEmptyComponent={<Text style={s.emptyText}>Aún no has creado grupos.</Text>}
        />
      ) : (
        <FlatList
          data={estudiantesFiltrados}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 110, gap: 8 }}
          renderItem={({ item }) => {
            const pct = Math.round((item.horas_aprobadas / (item.horas_objetivo || 500)) * 100);
            return (
              <GlassCard contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
                <View style={s.estudianteAvatar}>
                  <Text style={s.estudianteInitial}>{item.nombre_completo?.[0]?.toUpperCase() ?? '?'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.estudianteNombre} numberOfLines={1}>{item.nombre_completo}</Text>
                  <Text style={s.estudianteMeta} numberOfLines={1}>{item.carrera || 'Sin carrera'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={s.estudianteHoras}>{item.horas_aprobadas}h</Text>
                  <View style={s.miniBarTrack}>
                    <View style={[s.miniBarFill, { width: `${Math.min(pct, 100)}%` as any }]} />
                  </View>
                  <View style={[s.estadoBadge, !item.activo && s.estadoBadgeOff]}>
                    <Text style={[s.estadoText, !item.activo && { color: COLORS.textMuted }]}>
                      {item.activo ? 'Activo' : 'Pendiente'}
                    </Text>
                  </View>
                </View>
              </GlassCard>
            );
          }}
          ListEmptyComponent={<Text style={s.emptyText}>Sin estudiantes registrados.</Text>}
        />
      )}

      {/* ── MODAL · PASO 1: Crear grupo (validación en tiempo real) ── */}
      <Modal visible={showModalGrupo} transparent animationType="slide" onRequestClose={() => setShowModalGrupo(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheetCard, { maxHeight: '88%' }]}>
            <Text style={styles.modalTitle}>Paso 1 · Datos del grupo</Text>
            <Text style={styles.modalDesc}>
              Define el grupo o aula. Aún no se guarda; en el siguiente paso cargarás el Excel.
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 4, paddingVertical: 6 }}>
              {(() => {
                const tiene = gNombre.trim().length > 0; const malo = tiene && !!errNombre;
                return (
                  <View style={{ marginBottom: 6 }}>
                    <Text style={styles.fieldLabel}>NOMBRE DEL GRUPO *</Text>
                    <TextInput
                      style={[styles.modalInput, malo ? s.campoErr : (tiene ? s.campoOk : null)]}
                      value={gNombre} onChangeText={setGNombre}
                      placeholder='Ej. "Sistemas G1"'
                      placeholderTextColor={COLORS.textMuted} selectionColor={COLORS.primary}
                    />
                    {malo && <Text style={s.campoErrText}>{errNombre}</Text>}
                  </View>
                );
              })()}

              {(() => {
                const tiene = gCarrera.trim().length > 0; const malo = tiene && !!errCarrera;
                return (
                  <View style={{ marginBottom: 6 }}>
                    <Text style={styles.fieldLabel}>CARRERA / ESPECIALIDAD *</Text>
                    <TextInput
                      style={[styles.modalInput, malo ? s.campoErr : (tiene ? s.campoOk : null)]}
                      value={gCarrera} onChangeText={setGCarrera}
                      placeholder="Ej. Ingeniería en Sistemas"
                      placeholderTextColor={COLORS.textMuted} selectionColor={COLORS.primary}
                    />
                    {malo && <Text style={s.campoErrText}>{errCarrera}</Text>}
                  </View>
                );
              })()}

              {(() => {
                const tiene = gHoras.trim().length > 0; const malo = tiene && !!errHoras;
                return (
                  <View style={{ marginBottom: 6 }}>
                    <Text style={styles.fieldLabel}>HORAS A CUMPLIR (PASANTÍA / SOCIALES) *</Text>
                    <TextInput
                      style={[styles.modalInput, malo ? s.campoErr : (tiene ? s.campoOk : null)]}
                      value={gHoras} onChangeText={t => setGHoras(t.replace(/[^0-9]/g, ''))}
                      placeholder="Ej. 500" keyboardType="number-pad"
                      placeholderTextColor={COLORS.textMuted} selectionColor={COLORS.primary}
                    />
                    {malo && <Text style={s.campoErrText}>{errHoras}</Text>}
                  </View>
                );
              })()}

              {(() => {
                const tiene = gDocente.trim().length > 0; const malo = tiene && !!errDocente;
                return (
                  <View style={{ marginBottom: 6 }}>
                    <Text style={styles.fieldLabel}>DOCENTE / SUPERVISOR A CARGO (opcional)</Text>
                    <TextInput
                      style={[styles.modalInput, malo ? s.campoErr : (tiene ? s.campoOk : null)]}
                      value={gDocente} onChangeText={setGDocente}
                      placeholder="Ej. Lic. Ana Martínez"
                      placeholderTextColor={COLORS.textMuted} selectionColor={COLORS.primary}
                    />
                    {malo && <Text style={s.campoErrText}>{errDocente}</Text>}
                  </View>
                );
              })()}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowModalGrupo(false)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <JellyButton
                style={[styles.modalSave, !formGrupoValido && { opacity: 0.5 }]}
                contentStyle={{ paddingVertical: 0 }}
                onPress={formGrupoValido ? handleSiguienteGrupo : undefined}
              >
                <Text style={styles.modalSaveText}>Siguiente</Text>
              </JellyButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL · PASO 2: Reglas del Excel ── */}
      <Modal visible={showModalExcel} transparent animationType="slide" onRequestClose={() => setShowModalExcel(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.sheetCard}>
            <Text style={styles.modalTitle}>Paso 2 · Carga el Excel</Text>
            <Text style={styles.modalDesc}>
              Tu archivo debe contener al menos estas dos columnas. Se detectan automáticamente
              sin importar mayúsculas/minúsculas.
            </Text>

            <BlurView intensity={20} tint="dark" style={s.excelInfoBox}>
              <View style={s.excelInfoRow}>
                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                <Text style={s.excelInfoText}>Nombres completos  · obligatoria</Text>
              </View>
              <View style={s.excelInfoRow}>
                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                <Text style={s.excelInfoText}>Correos electrónicos  · obligatoria</Text>
              </View>
              <Text style={s.excelInfoNote}>
                Solo se importarán las filas con nombre y un correo válido. A cada estudiante se le
                generará una contraseña temporal única.
              </Text>
            </BlurView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowModalExcel(false)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <JellyButton style={styles.modalSave} contentStyle={{ paddingVertical: 0 }} onPress={handleSeleccionarArchivo}>
                <Text style={styles.modalSaveText}>Aceptar y Seleccionar Archivo</Text>
              </JellyButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL · Progreso de creación ── */}
      <Modal visible={showProgreso} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { alignItems: 'center', gap: 14 }]}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.modalTitle}>Creando cuentas…</Text>
            <Text style={[styles.modalDesc, { textAlign: 'center' }]}>
              {progreso.done} de {progreso.total} estudiantes
            </Text>
            <View style={[s.progressTrack, { alignSelf: 'stretch' }]}>
              <View style={[s.progressFill, { width: `${Math.round((progreso.done / Math.max(progreso.total, 1)) * 100)}%` as any }]} />
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL · Credenciales generadas ── */}
      <Modal visible={showCredenciales} transparent animationType="slide" onRequestClose={cerrarCredenciales}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheetCard, { flex: 1, maxHeight: '88%' }]}>
            <View style={{ alignItems: 'center', gap: 6, paddingTop: 4 }}>
              <Ionicons name="checkmark-circle" size={44} color={COLORS.success} />
              <Text style={s.importSuccessTitle}>¡Cuentas creadas!</Text>
              <Text style={[styles.modalDesc, { textAlign: 'center' }]}>
                {credenciales.length} estudiante{credenciales.length === 1 ? '' : 's'} en el grupo{' '}
                <Text style={{ color: COLORS.primaryLight }}>{grupoCreadoNombre}</Text>.
              </Text>
            </View>

            <FlatList
              data={credenciales}
              keyExtractor={(item, i) => item.correo + i}
              style={{ flex: 1 }}
              contentContainerStyle={{ gap: 6, paddingVertical: 6 }}
              showsVerticalScrollIndicator
              renderItem={({ item }) => (
                <View style={s.credItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.previewItemName} numberOfLines={1}>{item.nombre}</Text>
                    <Text style={s.credCorreo} numberOfLines={1}>{item.correo}</Text>
                  </View>
                  <View style={s.credPassChip}>
                    <Text style={s.credPassText}>{item.password}</Text>
                  </View>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.modalDesc}>No se creó ninguna cuenta (¿correos ya registrados?).</Text>}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={handleCopiar}>
                <Ionicons name="copy-outline" size={16} color={COLORS.textMuted} />
                <Text style={[styles.modalCancelText, { marginLeft: 6 }]}>Copiar</Text>
              </TouchableOpacity>
              <JellyButton style={styles.modalSave} contentStyle={{ paddingVertical: 0 }} onPress={cerrarCredenciales}>
                <Text style={styles.modalSaveText}>Listo</Text>
              </JellyButton>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────
// SECCIÓN: APROBAR PASANTÍAS
// ─────────────────────────────────────────────
function SeccionAprobar({ apps, onAprobar, onRechazar }: {
  apps: Aplicacion[];
  onAprobar: (a: Aplicacion, horas: number) => void;
  onRechazar: (a: Aplicacion, motivo: string) => void;
}) {
  const { styles, s } = useThemedStyles();
  const pendientes = apps.filter(a => a.estado === 'finalizado');
  const [aprobarApp, setAprobarApp] = useState<Aplicacion | null>(null);
  const [rechazarApp, setRechazarApp] = useState<Aplicacion | null>(null);
  const [horasAjustadas, setHorasAjustadas] = useState('');
  const [motivo, setMotivo] = useState('');

  const ahora = new Date();

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={pendientes}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
        renderItem={({ item }) => {
          const fechaApp = item.fecha_aplicacion?.toDate?.() ?? new Date();
          const diasEspera = Math.floor((ahora.getTime() - fechaApp.getTime()) / 86_400_000);
          const urgente = diasEspera > 7;
          return (
            <GlassCard style={[{ marginBottom: 8 }, urgente && s.aprobacionCardUrgente]} contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={s.aprobNombre} numberOfLines={1}>{item.estudiante_nombre}</Text>
                <Text style={s.aprobMeta}>{item.nombre_empresa ?? 'Empresa'} · {item.titulo_vacante ?? 'Pasantía'}</Text>
                <Text style={s.aprobMeta}>Horas: {item.horas_completadas ?? 0}</Text>
                <Text style={s.aprobMeta}>Pago: {item.pago_confirmado ? '✓ Pagado' : '⏳ Pendiente'}</Text>
                {urgente && <Text style={s.aprobUrgente}>⚠️ Esperando {diasEspera} días</Text>}
              </View>
              <View style={{ gap: 8 }}>
                <JellyButton
                  style={s.aprobBtn}
                  contentStyle={{ paddingVertical: 8, paddingHorizontal: 14 }}
                  onPress={() => { setHorasAjustadas(String(item.horas_completadas ?? 0)); setAprobarApp(item); }}
                >
                  <Text style={s.aprobBtnText}>Aprobar</Text>
                </JellyButton>
                <JellyButton
                  style={s.rechazarBtn}
                  contentStyle={{ paddingVertical: 8, paddingHorizontal: 14 }}
                  onPress={() => { setMotivo(''); setRechazarApp(item); }}
                >
                  <Text style={s.rechazarText}>Rechazar</Text>
                </JellyButton>
              </View>
            </GlassCard>
          );
        }}
        ListEmptyComponent={<Text style={s.emptyText}>Sin pasantías pendientes de aprobación.</Text>}
      />

      {/* Modal aprobar */}
      <Modal visible={!!aprobarApp} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirmar aprobación</Text>
            <Text style={styles.modalDesc}>
              Estudiante: {aprobarApp?.estudiante_nombre}{'\n'}
              Empresa: {aprobarApp?.nombre_empresa ?? 'Empresa'}
            </Text>
            <Text style={styles.fieldLabel}>Horas a sumar al estudiante</Text>
            <TextInput
              style={styles.modalInput}
              value={horasAjustadas}
              onChangeText={setHorasAjustadas}
              keyboardType="number-pad"
              placeholderTextColor={COLORS.textMuted}
              selectionColor={COLORS.primary}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setAprobarApp(null)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <JellyButton
                style={styles.modalSave}
                contentStyle={{ paddingVertical: 0 }}
                onPress={() => { aprobarApp && onAprobar(aprobarApp, parseInt(horasAjustadas) || 0); setAprobarApp(null); }}
              >
                <Text style={styles.modalSaveText}>Aprobar y sumar</Text>
              </JellyButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal rechazar */}
      <Modal visible={!!rechazarApp} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Rechazar pasantía</Text>
            <Text style={styles.fieldLabel}>Motivo del rechazo (obligatorio)</Text>
            <TextInput
              style={[styles.modalInput, { height: 80, textAlignVertical: 'top' }]}
              value={motivo}
              onChangeText={setMotivo}
              placeholder="Describe el motivo..."
              placeholderTextColor={COLORS.textMuted}
              multiline selectionColor={COLORS.primary}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setRechazarApp(null)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <JellyButton
                style={[styles.modalDelete]}
                contentStyle={{ paddingVertical: 0 }}
                onPress={() => {
                  if (!motivo.trim()) { Alert.alert('Motivo requerido'); return; }
                  rechazarApp && onRechazar(rechazarApp, motivo);
                  setRechazarApp(null);
                }}
              >
                <Text style={styles.modalDeleteText}>Rechazar</Text>
              </JellyButton>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────
// SECCIÓN: ESTADÍSTICAS
// ─────────────────────────────────────────────
function SeccionEstadisticas({ estudiantes, apps }: { estudiantes: EstudianteRow[]; apps: Aplicacion[] }) {
  const { s } = useThemedStyles();
  const carreras = useMemo(() => {
    const map: Record<string, number> = {};
    apps.filter(a => a.estado === 'contratado' || a.estado === 'finalizado' || a.estado === 'aprobado')
      .forEach(a => {
        const e = estudiantes.find(est => est.id === a.estudiante_id);
        if (e?.carrera) map[e.carrera] = (map[e.carrera] ?? 0) + 1;
      });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [estudiantes, apps]);

  const maxVal = Math.max(...carreras.map(c => c[1]), 1);

  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <Text style={s.statTitle}>Carreras con más pasantías</Text>
      {carreras.length === 0
        ? <Text style={s.emptyText}>Sin datos suficientes.</Text>
        : carreras.map(([carrera, count]) => (
            <View key={carrera} style={s.barRow}>
              <Text style={s.barLabel} numberOfLines={1}>{carrera}</Text>
              <View style={s.barTrack}>
                <View style={[s.barFill, { width: `${(count / maxVal) * 100}%` as any }]} />
              </View>
              <Text style={s.barValue}>{count}</Text>
            </View>
          ))
      }

      <Text style={[s.statTitle, { marginTop: 24 }]}>Resumen general</Text>
      <View style={s.metricasGrid}>
        <MetricCard icon="people-outline"   label="Total estudiantes"  value={estudiantes.length}                                   color={COLORS.primaryLight} />
        <MetricCard icon="checkmark-circle-outline" label="Pasantías aprobadas" value={apps.filter(a=>a.estado==='aprobado').length} color={COLORS.success} />
        <MetricCard icon="time-outline"     label="Horas totales"      value={estudiantes.reduce((acc,e)=>acc+(e.horas_aprobadas??0),0)} color={COLORS.accent} />
      </View>
    </ScrollView>
  );
}

// ─────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────
const makeStyles = (COLORS: GradlyColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.backgroundDark },
  headerAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: COLORS.primary12,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.white4, marginLeft: 8,
  },
  mainSubtitle: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  sidebar: {
    width: 240, backgroundColor: COLORS.backgroundCard,
    borderRightWidth: 1, borderRightColor: COLORS.border,
    paddingTop: Platform.OS === 'ios' ? 52 : 32,
  },
  sidebarOverlay: {
    position: 'absolute', top: 0, left: 0, bottom: 0, zIndex: 100,
    ...shadow({ color: '#000', x: 4, y: 0, blur: 12, opacity: 0.5, elevation: 0 }),
  },
  sidebarHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingBottom: 20, marginBottom: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  sidebarAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.primary12,
    alignItems: 'center', justifyContent: 'center',
  },
  sidebarNombre: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  sidebarDominio: { fontSize: 10, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, marginHorizontal: 8,
  },
  menuItemActive: { backgroundColor: COLORS.primary },
  menuLabel: { fontSize: 14, fontFamily: FONTS.interMedium, color: COLORS.textMuted, flex: 1 },
  menuLabelActive: { color: COLORS.textPrimary },
  alertBadge: {
    backgroundColor: COLORS.warning, borderRadius: 10,
    minWidth: 18, height: 18,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
  },
  alertBadgeText: { fontSize: 10, fontFamily: FONTS.interSemiBold, color: '#000' },
  logoutItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 16, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  logoutLabel: { fontSize: 14, fontFamily: FONTS.interMedium, color: COLORS.error },

  main: { flex: 1 },
  mainHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingLeft: 20, paddingRight: 150, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.backgroundCard,
  },
  mainTitle: { fontSize: 20, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center', padding: 20,
  },
  sheetCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: COLORS.border,
    maxHeight: '85%', gap: 8,
  },
  modalCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: COLORS.border, gap: 10,
  },
  modalTitle: { fontSize: 18, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
  modalDesc: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textMuted, lineHeight: 18 },
  fieldLabel: {
    fontSize: 11, fontFamily: FONTS.interMedium,
    color: COLORS.primaryLight, marginBottom: 5, marginTop: 6, letterSpacing: 0.3,
  },
  modalInput: {
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    height: 46, paddingHorizontal: 14,
    fontSize: 14, fontFamily: FONTS.interRegular, color: COLORS.textPrimary,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  modalCancel: {
    flex: 1, height: 44, borderRadius: 12,
    backgroundColor: COLORS.white4, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  modalCancelText: { fontSize: 14, fontFamily: FONTS.interMedium, color: COLORS.textMuted },
  modalSave: {
    flex: 1, height: 44, borderRadius: 12,
    backgroundColor: COLORS.primaryDark, alignItems: 'center', justifyContent: 'center',
  },
  modalSaveText: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  modalDelete: {
    flex: 1, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.15)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalDeleteText: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.error },
  logoUploadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.primary12, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: COLORS.primary35, alignSelf: 'flex-start',
  },
  logoUploadText: { fontSize: 13, fontFamily: FONTS.interMedium, color: COLORS.primaryLight },

  // Footer de cuenta (ayuda · acerca · cerrar sesión)
  perfilFooter: {
    marginTop: 14, paddingTop: 14, gap: 8,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  footerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    height: 46, paddingHorizontal: 14, borderRadius: 12,
    backgroundColor: COLORS.white4, borderWidth: 1, borderColor: COLORS.border,
  },
  footerBtnText: { fontSize: 14, fontFamily: FONTS.interMedium, color: COLORS.textPrimary },
  logoutFooterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    height: 46, paddingHorizontal: 14, borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
  },
  logoutFooterText: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.error },
});

const makeS = (COLORS: GradlyColors) => StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 110 },

  banner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 16, padding: 20, marginBottom: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  bannerTitle: { fontSize: 14, fontFamily: FONTS.interMedium, color: COLORS.textMuted },
  bannerNombre: { fontSize: 18, fontFamily: FONTS.soraBold, color: COLORS.textPrimary, marginTop: 2 },
  logoWrap: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: COLORS.primary12,
    alignItems: 'center', justifyContent: 'center',
  },

  metricasGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  metricCard: {
    flex: 1, minWidth: 120,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 14, padding: 14, gap: 4,
    borderWidth: 1, borderColor: COLORS.border,
  },
  metricValue: { fontSize: 28, fontFamily: FONTS.rajdhaniBold },
  metricLabel: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted },

  // Estudiantes
  searchArea: {
    flexDirection: 'row', gap: 10, padding: 12, paddingBottom: 8,
  },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 12, height: 40,
  },
  searchInput: {
    flex: 1, fontSize: 13,
    fontFamily: FONTS.interRegular, color: COLORS.textPrimary,
  },
  excelBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.success + '15',
    borderRadius: 10, paddingHorizontal: 12, height: 40,
    borderWidth: 1, borderColor: COLORS.success + '33',
  },
  excelText: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: COLORS.success },

  // ── Grupos / aulas ──
  grupoArea: { paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  grupoLabel: {
    fontSize: 10, fontFamily: FONTS.interSemiBold, letterSpacing: 0.5,
    color: COLORS.primaryLight,
  },
  grupoRow: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'space-between' },
  grupoWarn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.warning + '15', borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.warning + '40', padding: 10,
  },
  grupoWarnText: { flex: 1, fontSize: 12, fontFamily: FONTS.interMedium, color: COLORS.warning, lineHeight: 16 },
  importarFullBtn: {
    backgroundColor: COLORS.success + '15', borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.success + '33',
  },
  // Tarjeta de grupo (lista horizontal seleccionable)
  grupoCard: { width: 160, borderColor: COLORS.border },
  grupoCardActive: { borderColor: COLORS.success + '88', backgroundColor: COLORS.success + '12' },
  grupoCardNombre: { flex: 1, fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  grupoCardMeta: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  grupoCardHoras: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },
  // Validación de campos del formulario de grupo
  campoOk:  { borderColor: COLORS.success },
  campoErr: { borderColor: COLORS.error },
  campoErrText: { fontSize: 11, fontFamily: FONTS.interMedium, color: COLORS.error, marginTop: 4 },

  // ── Búsqueda con botón ──
  buscarBtn: { backgroundColor: COLORS.primary, borderRadius: 10 },
  buscarBtnText: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },

  // ── Cuadro de gestión (Liquid Glass) ──
  gestionBox: { marginHorizontal: 12, marginBottom: 10 },
  gestionTitle: { fontSize: 15, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
  gestionText: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted, lineHeight: 17 },
  gestionMainBtn: { backgroundColor: COLORS.primaryDark, borderRadius: 12 },
  gestionMainBtnText: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },

  // ── Pestañas (Tabs) ──
  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, marginBottom: 8 },
  tabBtn: {
    flex: 1, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.backgroundSurface, borderWidth: 1, borderColor: COLORS.border,
  },
  tabBtnActive: { backgroundColor: COLORS.primary12, borderColor: COLORS.primary35 },
  tabText: { fontSize: 12, fontFamily: FONTS.interMedium, color: COLORS.textMuted },
  tabTextActive: { color: COLORS.primaryLight, fontFamily: FONTS.interSemiBold },

  grupoDestino: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.primary12, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.primary35, padding: 10, marginTop: 2,
  },
  grupoDestinoText: { flex: 1, fontSize: 12, fontFamily: FONTS.interMedium, color: COLORS.textPrimary },

  // ── Credenciales temporales (pantalla de éxito) ──
  credAviso: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: COLORS.primary12, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.primary35, padding: 12,
  },
  credAvisoText: { flex: 1, fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textPrimary, lineHeight: 17 },
  credItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.backgroundSurface, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, padding: 12,
  },
  credCorreo: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  credPassChip: {
    backgroundColor: COLORS.primary12, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.primary35, paddingHorizontal: 8, paddingVertical: 4,
  },
  credPassText: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },

  // Cuadro informativo de columnas del Excel (Liquid Glass)
  excelInfoBox: {
    marginHorizontal: 12, marginBottom: 8, padding: 14, borderRadius: 16,
    overflow: 'hidden', gap: 6,
    borderWidth: 1, borderColor: COLORS.primary35,
    backgroundColor: COLORS.primary12,
  },
  excelInfoHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  excelInfoTitle: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  excelInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  excelInfoText: { fontSize: 12, fontFamily: FONTS.interMedium, color: COLORS.textPrimary },
  excelInfoNote: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted, marginTop: 6, lineHeight: 16 },

  progressBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.backgroundSurface,
    marginHorizontal: 12, borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 8,
  },
  progressText: { fontSize: 12, fontFamily: FONTS.interMedium, color: COLORS.textMuted },

  filtroChip: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
    backgroundColor: COLORS.backgroundSurface,
    borderWidth: 1, borderColor: COLORS.border,
  },
  filtroChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filtroText: { fontSize: 12, fontFamily: FONTS.interMedium, color: COLORS.textMuted },
  filtroTextActive: { color: COLORS.textPrimary },

  estudianteRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 8,
  },
  estudianteAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.primary12,
    alignItems: 'center', justifyContent: 'center',
  },
  grupoChatBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: COLORS.primary12,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 4,
  },
  estudianteInitial: { fontSize: 16, fontFamily: FONTS.soraBold, color: COLORS.primaryLight },
  estudianteNombre: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  estudianteMeta: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  estudianteHoras: { fontSize: 14, fontFamily: FONTS.rajdhaniBold, color: COLORS.primaryLight },
  miniBarTrack: {
    width: 60, height: 4, backgroundColor: COLORS.backgroundSurface,
    borderRadius: 2, overflow: 'hidden',
  },
  miniBarFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 2 },
  estadoBadge: {
    backgroundColor: COLORS.success + '15', borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: COLORS.success + '33',
  },
  estadoBadgeOff: { backgroundColor: COLORS.white4, borderColor: COLORS.border },
  estadoText: { fontSize: 10, fontFamily: FONTS.interSemiBold, color: COLORS.success },

  previewRow: {
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 8, padding: 8, marginBottom: 4,
  },
  previewText: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted },

  // ── Vista previa de importación de Excel ──
  previewSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 4 },
  previewChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    borderWidth: 1,
  },
  previewChipTotal: { backgroundColor: COLORS.backgroundSurface, borderColor: COLORS.border },
  previewChipOk: { backgroundColor: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.35)' },
  previewChipBad: { backgroundColor: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.35)' },
  previewChipText: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: COLORS.textMuted },

  previewItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, padding: 12, borderWidth: 1,
  },
  previewItemOk: { backgroundColor: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.25)' },
  previewItemBad: { backgroundColor: 'rgba(239,68,68,0.07)', borderColor: 'rgba(239,68,68,0.40)' },
  previewItemName: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  previewItemMail: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  previewItemError: { fontSize: 11, fontFamily: FONTS.interMedium, color: COLORS.error, marginTop: 2 },
  previewItemIdx: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted },

  progressTrack: {
    height: 6, borderRadius: 3, backgroundColor: COLORS.backgroundSurface, overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: COLORS.primary },

  importSuccess: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  importSuccessTitle: { fontSize: 18, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },

  // Aprobar
  aprobacionCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 10,
  },
  aprobacionCardUrgente: { borderColor: COLORS.warning + '55' },
  aprobNombre: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  aprobMeta: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  aprobUrgente: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: COLORS.warning, marginTop: 4 },
  aprobBtn: {
    backgroundColor: COLORS.primaryDark,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7,
    alignItems: 'center',
  },
  aprobBtnText: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  rechazarBtn: {
    backgroundColor: 'rgba(239,68,68,0.10)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)', alignItems: 'center',
  },
  rechazarText: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: COLORS.error },

  // Estadísticas
  statTitle: { fontSize: 15, fontFamily: FONTS.soraSemiBold, color: COLORS.textPrimary, marginBottom: 12 },
  barRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10,
  },
  barLabel: {
    width: 100, fontSize: 12,
    fontFamily: FONTS.interRegular, color: COLORS.textMuted,
  },
  barTrack: {
    flex: 1, height: 10, backgroundColor: COLORS.backgroundSurface,
    borderRadius: 5, overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 5 },
  barValue: { fontSize: 12, fontFamily: FONTS.rajdhaniSemiBold, color: COLORS.primaryLight, width: 24, textAlign: 'right' },

  emptyText: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textMuted, textAlign: 'center', padding: 24 },

  // Shared
  sectionTitle: { fontSize: 15, fontFamily: FONTS.soraSemiBold, color: COLORS.textPrimary, marginBottom: 10 },
});
