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
  getDocs,
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
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import FloatingSearchButton from '../src/components/FloatingSearchButton';
import FloatingTopBar from '../src/components/FloatingTopBar';
import PeriodoPracticasField, {
  PERIODO_VACIO,
  periodoValido,
  type PeriodoValue,
} from '../src/components/PeriodoPracticasField';
import StorageAvatar from '../src/components/StorageAvatar';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,


  TouchableOpacity,
  View,
} from 'react-native';
import { AutoText as Text, AutoTextInput as TextInput } from "../src/components/AutoText";
import * as XLSX from 'xlsx';
import FloatingNavBar, { type NavItem } from '../src/components/FloatingNavBar';
import UniversidadHomeCards from '../src/components/UniversidadHomeCards';
import CalendarioEventos from '../src/components/CalendarioEventos';
import PerfilMasterDetail from '../src/components/PerfilMasterDetail';
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
import { progresoPorFechas } from '../src/utils/progresoPasantia';
import { calcularHorasAcuerdo } from '../src/utils/horasPasantia';
import { esCarreraSoportada, cargarOverridesCarreras, CARRERAS_EL_SALVADOR } from '../src/data/carreras';
import CarrerasEditorModal from '../src/components/CarrerasEditorModal';
import ProfileViewerModal from '../src/components/ProfileViewerModal';
import { certificarPasantia } from '../src/services/solicitudPracticaService';
import { eliminarEstudiante as eliminarEstudianteCF, eliminarGrupo as eliminarGrupoCF } from '../src/services/universidadService';
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
type SeccionUni = 'inicio' | 'estudiantes' | 'aprobar' | 'estadisticas' | 'perfil';

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
  grupo_id?: string;
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

/** Pasantía de grupo (flujo Universidad↔Empresa, colección solicitudes_practicas). */
interface SolicitudGrupo {
  id: string;
  grupoId?: string;
  grupoNombre?: string;
  carrera?: string;
  empresaId?: string;
  estado?: string;
  fechaInicio?: string;
  fechaFin?: string;
  alumnos?: { id: string; nombre: string }[];
  pago?: { tipo: 'con_pago' | 'sin_pago'; monto?: number };
  /** Acuerdo firmado (días, horario, fechas) — base del cálculo de horas X/Y. */
  acuerdo?: any;
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
  egresado: boolean;
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

// Nota: la sección "Estadísticas" se eliminó del menú; su contenido se movió al
// carrusel de tarjetas del Inicio (ver <UniversidadHomeCards />).
const MENU: { key: SeccionUni; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'inicio',       label: 'Inicio',            icon: 'home-outline' },
  { key: 'estudiantes',  label: 'Mis Estudiantes',   icon: 'people-outline' },
  { key: 'aprobar',      label: 'Prácticas',         icon: 'ribbon-outline' },
];

// ── Onboarding (guía por globos) ──────────────────────────────────
const TOUR_CLAVES: SeccionUni[] = ['inicio', 'estudiantes', 'aprobar'];
const TOUR_PASOS: Record<SeccionUni, { titulo: string; texto: string }> = {
  inicio: {
    titulo: '¡Bienvenido a tu panel! 🎓',
    texto:
      'Este es tu panel general. Aquí ves de un vistazo el total de estudiantes, las pasantías activas, las horas aprobadas y las solicitudes pendientes.',
  },
  estudiantes: {
    titulo: 'Mis Estudiantes',
    texto:
      'Administra a tus estudiantes, su carrera y su progreso de horas de práctica. Puedes registrarlos uno a uno o importarlos masivamente desde un Excel.',
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
  perfil: {
    titulo: 'Mi Perfil',
    texto:
      'Consulta y edita los datos de tu institución, revisa tus estadísticas y ajusta tus preferencias.',
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
  const [solicitudesGrupo, setSolicitudesGrupo] = useState<SolicitudGrupo[]>([]);
  const [showEditPerfil, setShowEditPerfil] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [showCarrerasEditor, setShowCarrerasEditor] = useState(false);

  // Nombres de las carreras ofertadas (normaliza string u objeto).
  const carrerasNombres = useMemo(() => {
    const raw = (perfil as any)?.carreras_ofertadas ?? [];
    return Array.isArray(raw)
      ? raw.map((it: any) => (typeof it === 'string' ? it : String(it?.nombre ?? ''))).filter(Boolean)
      : [];
  }, [perfil]);

  // Guarda las carreras editadas como objetos con modalidad/duración.
  const guardarCarreras = async (nombres: string[]) => {
    const objs = nombres.map((nombre) => {
      const c = CARRERAS_EL_SALVADOR.find((x) => x.nombre === nombre);
      return {
        nombre,
        modalidad: c?.modalidad ?? '',
        duracion: c?.duracion ?? '',
        tipo: c?.tipo ?? '',
        zona: c?.zona ?? 'verde',
      };
    });
    await updateDoc(doc(db, 'perfiles_universidades', user!.uid), { carreras_ofertadas: objs });
  };

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
    router.push('/help-gradly' as any);
  };
  const handleAcerca = () => {
    router.push('/about-gradly' as any);
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

  // Overrides de zona de carreras (config/carreras) — habilitar/bloquear sin redeploy.
  useEffect(() => { cargarOverridesCarreras(); }, []);

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

  // Pasantías de grupo (flujo Universidad↔Empresa). Alimenta la línea de tiempo
  // porcentual y el conteo de pasantías aprobadas en estadísticas.
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'solicitudes_practicas'), where('universidadId', '==', user.uid));
    const unsub = onSnapshot(
      q,
      snap => setSolicitudesGrupo(snap.docs.map(d => ({ id: d.id, ...d.data() } as SolicitudGrupo))),
      error => console.warn('Error en listener (solicitudes_practicas):', error),
    );
    return unsub;
  }, [user]);

  // ── Métricas ──────────────────────────────────────────────────────
  const metricas = useMemo(() => ({
    totalEstudiantes: estudiantes.length,
    // "En pasantía": estudiantes actualmente cursando una práctica, sumando
    // AMBOS flujos —individual legado (`aplicaciones` contratado) y el de
    // GRUPO real de la plataforma (`solicitudes_practicas` aprobado, aún sin
    // finalizar). Antes solo contaba el flujo individual, así que un grupo con
    // pasantía aprobada por chat/acuerdo no sumaba aquí (aunque sí aparecía en
    // "Instituciones afiliadas", que ya combinaba ambas fuentes).
    enPasantia:
      apps.filter(a => a.estado === 'contratado').length +
      solicitudesGrupo
        .filter(sg => sg.estado === 'aprobado')
        .reduce((acc, sg) => acc + (sg.alumnos?.length ?? 0), 0),
    horasAprobadas: estudiantes.reduce((acc, e) => acc + (e.horas_aprobadas ?? 0), 0),
    // Pasantías finalizadas que esperan la certificación de la universidad.
    pendAprobacion: solicitudesGrupo.filter(x => x.estado === 'finalizado' && (x as any).certificacion !== 'certificada').length,
  }), [estudiantes, apps, solicitudesGrupo]);

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
      case 'inicio':       return <SeccionInicio metricas={metricas} perfil={perfil} nombreUni={nombreUni} uid={user!.uid} estudiantes={estudiantes} apps={apps} solicitudesGrupo={solicitudesGrupo} />;
      case 'estudiantes':  return <SeccionEstudiantes estudiantes={estudiantes} uid={user!.uid} solicitudesGrupo={solicitudesGrupo} />;
      case 'aprobar':      return <SeccionPracticas solicitudes={solicitudesGrupo} />;
      case 'estadisticas': return <SeccionEstadisticas estudiantes={estudiantes} apps={apps} solicitudesGrupo={solicitudesGrupo} />;
      case 'perfil':       return (
        <PerfilMasterDetail
          name={nombreUni}
          subtitle={perfil?.dominio_correo || 'Universidad'}
          avatarUrl={perfil?.logo_url}
          avatarStoragePath={`logos/${user!.uid}`}
          fallbackIcon="school"
          onEditPhoto={handleUploadLogo}
          uploadingPhoto={uploadingLogo}
          onAyuda={handleAyuda}
          onAcerca={handleAcerca}
          onLogout={() => setLogoutModalVisible(true)}
          sections={[
            {
              id: 'datos',
              title: 'Datos de la universidad',
              subtitle: 'Información pública de la institución',
              icon: 'business-outline',
              tone: 'blue',
              description: 'Todos estos datos provienen de tu registro. Puedes editarlos.',
              fields: [
                { key: 'nombre_universidad', label: 'Nombre de la universidad', value: (perfil as any)?.nombre_universidad ?? '' },
                { key: 'siglas', label: 'Siglas', value: (perfil as any)?.siglas ?? '' },
                { key: 'dominio_correo', label: 'Dominio de correo', value: (perfil as any)?.dominio_correo ?? '', placeholder: '@uca.edu.sv', autoCapitalize: 'none' },
                { key: 'descripcion', label: 'Descripción', value: (perfil as any)?.descripcion ?? '', multiline: true },
                { key: 'sitio_web', label: 'Sitio web', value: (perfil as any)?.sitio_web ?? '', keyboardType: 'url', autoCapitalize: 'none' },
                { key: 'telefono', label: 'Teléfono', value: (perfil as any)?.telefono ?? '', keyboardType: 'phone-pad' },
                { key: 'direccion', label: 'Dirección', value: (perfil as any)?.direccion ?? '' },
                { key: 'departamento', label: 'Departamento', value: (perfil as any)?.departamento ?? '' },
                { key: 'ciudad', label: 'Municipio / Ciudad', value: (perfil as any)?.ciudad ?? '' },
                { key: 'instagram', label: 'Instagram', value: (perfil as any)?.instagram ?? '', autoCapitalize: 'none' },
              ],
              onSave: async (v) => {
                try {
                  await updateDoc(doc(db, 'perfiles_universidades', user!.uid), {
                    nombre_universidad: v.nombre_universidad,
                    siglas: v.siglas,
                    dominio_correo: v.dominio_correo,
                    descripcion: v.descripcion,
                    sitio_web: v.sitio_web,
                    telefono: v.telefono,
                    direccion: v.direccion,
                    departamento: v.departamento,
                    ciudad: v.ciudad,
                    instagram: v.instagram,
                  });
                } catch { Alert.alert('Error', 'No se pudo guardar.'); }
              },
            },
            {
              id: 'contacto',
              title: 'Contacto / Responsable',
              subtitle: 'Persona responsable ante Gradly',
              icon: 'person-outline',
              tone: 'green',
              fields: [
                { key: 'contacto_nombre', label: 'Nombre del responsable', value: (perfil as any)?.contacto_nombre ?? '' },
                { key: 'contacto_cargo', label: 'Cargo', value: (perfil as any)?.contacto_cargo ?? '' },
                { key: 'contacto_telefono', label: 'Teléfono de contacto', value: (perfil as any)?.contacto_telefono ?? '', keyboardType: 'phone-pad' },
                { key: 'contacto_correo', label: 'Correo del contacto', value: (perfil as any)?.contacto_correo ?? '', keyboardType: 'email-address', autoCapitalize: 'none' },
                { key: 'contacto_documento_numero', label: 'Documento del responsable', value: (perfil as any)?.contacto_documento_numero ?? '' },
              ],
              onSave: async (v) => {
                try {
                  await updateDoc(doc(db, 'perfiles_universidades', user!.uid), {
                    contacto_nombre: v.contacto_nombre,
                    contacto_cargo: v.contacto_cargo,
                    contacto_telefono: v.contacto_telefono,
                    contacto_correo: v.contacto_correo,
                    contacto_documento_numero: v.contacto_documento_numero,
                  });
                } catch { Alert.alert('Error', 'No se pudo guardar.'); }
              },
            },
            {
              id: 'carreras',
              title: 'Carreras ofertadas',
              subtitle: 'Con modalidad y duración',
              icon: 'library-outline',
              tone: 'orange',
              render: () => {
                const raw = (perfil as any)?.carreras_ofertadas ?? [];
                const lista: { nombre: string; modalidad?: string; duracion?: string }[] =
                  Array.isArray(raw)
                    ? raw.map((it: any) =>
                        typeof it === 'string'
                          ? { nombre: it }
                          : { nombre: String(it?.nombre ?? ''), modalidad: it?.modalidad, duracion: it?.duracion },
                      ).filter((c: any) => c.nombre)
                    : [];
                return (
                  <View style={{ gap: 10 }}>
                    {lista.length === 0 ? (
                      <Text style={{ color: colors.textMuted, fontSize: 14 }}>Aún no has registrado carreras ofertadas.</Text>
                    ) : (
                      lista.map((c, i) => (
                        <View key={i} style={{ backgroundColor: colors.white4, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border }}>
                          <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 14 }}>{c.nombre}</Text>
                          {(c.modalidad || c.duracion) ? (
                            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                              {[c.modalidad, c.duracion].filter(Boolean).join(' · ')}
                            </Text>
                          ) : null}
                        </View>
                      ))
                    )}
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 12, height: 46, marginTop: 4 }}
                      onPress={() => setShowCarrerasEditor(true)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="create-outline" size={18} color="#fff" />
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Editar carreras</Text>
                    </TouchableOpacity>
                  </View>
                );
              },
            },
            {
              id: 'stats',
              title: 'Estadísticas',
              subtitle: 'Avance de tus estudiantes',
              icon: 'stats-chart-outline',
              tone: 'purple',
              render: () => <PerfilStatsUniversidad universidadId={user!.uid} />,
            },
          ]}
        />
      );
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
          <TouchableOpacity onPress={() => setSeccion('perfil')} activeOpacity={0.8}>
            <StorageAvatar
              url={perfil?.logo_url}
              storagePath={user ? `logos/${user.uid}` : null}
              size={40}
              fallbackIcon="school"
            />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            {/* En Inicio el título es el nombre de la universidad; el subtítulo
                se oculta para no repetirlo justo debajo. */}
            {/* El nombre de la universidad es nombre propio → `noTranslate`. */}
            {seccion === 'inicio' ? (
              <Text style={styles.mainTitle} numberOfLines={1} noTranslate>
                {nombreUni || 'Inicio'}
              </Text>
            ) : (
              <>
                <Text style={styles.mainTitle} numberOfLines={1}>
                  {seccion === 'perfil' ? 'Mi Perfil' : (MENU.find(m => m.key === seccion)?.label ?? 'Inicio')}
                </Text>
                <Text style={styles.mainSubtitle} numberOfLines={1} noTranslate>{nombreUni}</Text>
              </>
            )}
          </View>
        </View>
        {renderSeccion()}
      </View>

      {/* ── BOTONES FLOTANTES SUPERIORES (Glassmorphism) ── */}
      <FloatingTopBar userId={user?.uid} />

      {/* ── BÚSQUEDA FLOTANTE (oculta en "Mis Estudiantes", que tiene su propia barra) ── */}
      {seccion !== 'estudiantes' && seccion !== 'perfil' && <FloatingSearchButton placeholder="Buscar estudiantes..." />}

      {/* ── MENÚ FLOTANTE (Glassmorphism) ── */}
      <FloatingNavBar
        items={navItems}
        activeKey={seccion}
        onChange={(k) =>
          k === 'mensajes'
            ? router.push('/mensajes' as any)
            : setSeccion(k)
        }
      />

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

      <CarrerasEditorModal
        visible={showCarrerasEditor}
        initial={carrerasNombres}
        onClose={() => setShowCarrerasEditor(false)}
        onSave={guardarCarreras}
      />
    </View>
    </LiquidBackground>
  );
}

// ─────────────────────────────────────────────
// SECCIÓN: INICIO
// ─────────────────────────────────────────────
function SeccionInicio({ metricas, perfil, nombreUni, uid, estudiantes, apps, solicitudesGrupo }: any) {
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

      {/* ── Calendario de hitos de la cuenta (registro, grupos, pasantías, egresos) ── */}
      <CalendarioEventos uid={uid} />

      {/* ── Tarjetas resumen agrupadas (Resumen / Análisis) — sustituyen a la
             grilla de métricas y a la vieja sección "Estadísticas" ── */}
      <UniversidadHomeCards
        uid={uid}
        estudiantes={estudiantes}
        apps={apps}
        solicitudesGrupo={solicitudesGrupo}
        metricas={metricas}
      />

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
function SeccionEstudiantes({ estudiantes, uid, solicitudesGrupo }: { estudiantes: EstudianteRow[]; uid: string; solicitudesGrupo: SolicitudGrupo[] }) {
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
  const [gDocente, setGDocente] = useState('');
  // Período de prácticas (reemplaza el viejo campo de horas).
  const [periodo, setPeriodo]   = useState<PeriodoValue>(PERIODO_VACIO);
  // Selector de carrera: lista las carreras ofertadas por esta universidad.
  const [showCarreraPicker, setShowCarreraPicker] = useState(false);

  // ── Flujo de modales ──
  const [verPerfilEstudianteId, setVerPerfilEstudianteId] = useState<string | null>(null);
  const [showModalGrupo, setShowModalGrupo]       = useState(false); // Paso 1
  const [showModalExcel, setShowModalExcel]       = useState(false); // Paso 2
  const [showProgreso, setShowProgreso]           = useState(false); // Creando cuentas
  const [showCredenciales, setShowCredenciales]   = useState(false); // Resultado
  const [progreso, setProgreso] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [credenciales, setCredenciales] = useState<EstudianteNuevo[]>([]);
  const [grupoCreadoNombre, setGrupoCreadoNombre] = useState('');

  // ── Carreras ofertadas por la universidad (para el selector) ──
  const [carrerasUni, setCarrerasUni] = useState<string[]>([]);
  useEffect(() => {
    if (!uid) return;
    let cancel = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'perfiles_universidades', uid));
        const data = snap.data() as any;
        const raw = data?.carreras_ofertadas ?? data?.carreras;
        const arr = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
        const norm = arr
          .map((it: any) =>
            typeof it === 'string' ? it : it && typeof it === 'object' ? String(it.nombre ?? '') : String(it ?? ''),
          )
          .filter(Boolean)
          // Gate defensivo: aunque el registro ya bloquea Zona Roja, filtramos
          // aquí por si la universidad tenía carreras reguladas de antes.
          .filter((nombre: string) => esCarreraSoportada(nombre));
        if (!cancel) setCarrerasUni(norm);
      } catch (e) {
        console.warn('Error cargando carreras de la universidad:', e);
      }
    })();
    return () => { cancel = true; };
  }, [uid]);

  // ── Validaciones en tiempo real del formulario de grupo ──
  const errNombre  = valGrupoNombre(gNombre);
  const errCarrera = valGrupoCarrera(gCarrera);
  const errDocente = valGrupoDocente(gDocente);
  const periodoOk  = periodoValido(periodo);
  const formGrupoValido = !errNombre && !errCarrera && periodoOk && !errDocente;

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
              egresado: (data.egresado as boolean) ?? false,
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

  // ── Horas laborales por grupo (X/Y), calculadas del acuerdo firmado ──
  // Para cada grupo con una pasantía aprobada/finalizada y acuerdo válido,
  // derivamos horas transcurridas y totales. El conteo avanza con la fecha.
  const horasPorGrupo = useMemo(() => {
    const map: Record<string, ReturnType<typeof calcularHorasAcuerdo>> = {};
    solicitudesGrupo.forEach(sg => {
      if (!sg.grupoId || !sg.acuerdo) return;
      if (sg.estado !== 'aprobado' && sg.estado !== 'finalizado') return;
      const h = calcularHorasAcuerdo(sg.acuerdo);
      if (h.valido) map[sg.grupoId] = h;
    });
    return map;
  }, [solicitudesGrupo]);

  const resetForm = () => {
    setGNombre('');
    setGCarrera('');
    setGDocente('');
    setPeriodo(PERIODO_VACIO);
    setShowCarreraPicker(false);
  };

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

  // ── ¿El grupo puede egresar? ────────────────────────────────────
  // Condición: debe haber realizado una pasantía cuyo TIEMPO ya finalizó
  // (estado 'finalizado' o cuyo período por fechas ya se completó). Si aún no
  // ha terminado la pasantía, no puede egresar.
  const grupoPuedeEgresar = (grupoId: string) =>
    solicitudesGrupo.some(sg => {
      if (sg.grupoId !== grupoId) return false;
      if (sg.estado === 'finalizado') return true;
      if ((sg.estado === 'aprobado' || sg.estado === 'aceptada') && sg.fechaFin) {
        return progresoPorFechas(sg.fechaInicio, sg.fechaFin).estado === 'completado';
      }
      return false;
    });

  // ── Egresar (graduar) un grupo ──────────────────────────────────
  // Marca a TODOS los estudiantes del grupo como `graduado` y sella el grupo
  // con `egresado`/`fecha_egreso`. Esto alimenta la métrica "Egresados" del
  // Inicio y crea el evento de egreso en el calendario. Es irreversible.
  const [egresando, setEgresando] = useState<string | null>(null);
  const egresarGrupo = (grupo: Grupo) => {
    if (grupo.egresado || egresando) return;
    // Guardia: solo grupos con una pasantía ya finalizada (cumplida).
    if (!grupoPuedeEgresar(grupo.id)) {
      Alert.alert(
        'Aún no puede egresar',
        `El grupo "${grupo.nombre}" solo puede egresar cuando haya completado una pasantía (su período debe haber finalizado).`,
      );
      return;
    }
    Alert.alert(
      'Egresar grupo',
      `¿Marcar como egresados a los estudiantes del grupo "${grupo.nombre}"? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Egresar',
          style: 'destructive',
          onPress: async () => {
            setEgresando(grupo.id);
            try {
              const estSnap = await getDocs(
                query(collection(db, 'perfiles_estudiantes'), where('grupo_id', '==', grupo.id)),
              );
              const batch = writeBatch(db);
              estSnap.docs.forEach(d => {
                batch.update(d.ref, { graduado: true, fecha_graduacion: serverTimestamp() });
              });
              batch.update(doc(db, 'grupos', grupo.id), { egresado: true, fecha_egreso: serverTimestamp() });
              await batch.commit();

              try {
                await enviarNotificacion(
                  uid,
                  'Grupo egresado 🎓',
                  `El grupo "${grupo.nombre}" fue marcado como egresado (${estSnap.size} estudiante(s)).`,
                  'success',
                  grupo.id,
                );
              } catch { /* la notificación no debe afectar el flujo principal */ }

              Alert.alert('Listo', `El grupo "${grupo.nombre}" egresó correctamente.`);
            } catch (e) {
              console.warn('Error al egresar grupo:', e);
              Alert.alert('Error', 'No se pudo egresar el grupo. Intenta de nuevo.');
            } finally {
              setEgresando(null);
            }
          },
        },
      ],
    );
  };

  // ── Eliminar grupo (deshacer una carga por Excel equivocada) ──
  // Solo antes de postularlo — la Cloud Function repite el chequeo del lado
  // servidor (guardián autoritativo, no solo aquí). Borra también las cuentas
  // de los estudiantes del grupo: es una unidad, no tiene sentido dejarlos
  // huérfanos sin grupo.
  const [eliminandoGrupo, setEliminandoGrupo] = useState<string | null>(null);
  const handleEliminarGrupo = (grupo: Grupo) => {
    if (eliminandoGrupo) return;
    Alert.alert(
      'Eliminar grupo',
      `¿Eliminar el grupo "${grupo.nombre}" y las ${grupo.estudiantes_registrados} cuenta(s) de estudiante que contiene? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setEliminandoGrupo(grupo.id);
            try {
              const res = await eliminarGrupoCF({ grupoId: grupo.id });
              Alert.alert('Listo', `Se eliminó el grupo "${grupo.nombre}" y ${res.estudiantesEliminados} estudiante(s).`);
            } catch (e: any) {
              Alert.alert('No se pudo eliminar', e?.message ?? 'Intenta de nuevo.');
            } finally {
              setEliminandoGrupo(null);
            }
          },
        },
      ],
    );
  };

  // ── Eliminar un estudiante específico (deshacer un dato mal cargado) ──
  // Solo antes de que tenga una pasantía o solicitud en curso — la Cloud
  // Function repite el chequeo del lado servidor.
  const [eliminandoEstudiante, setEliminandoEstudiante] = useState<string | null>(null);
  const handleEliminarEstudiante = (est: EstudianteRow) => {
    if (eliminandoEstudiante) return;
    Alert.alert(
      'Eliminar estudiante',
      `¿Eliminar la cuenta de "${est.nombre_completo}"? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setEliminandoEstudiante(est.id);
            try {
              await eliminarEstudianteCF({ estudianteId: est.id });
              Alert.alert('Listo', `Se eliminó la cuenta de "${est.nombre_completo}".`);
            } catch (e: any) {
              Alert.alert('No se pudo eliminar', e?.message ?? 'Intenta de nuevo.');
            } finally {
              setEliminandoEstudiante(null);
            }
          },
        },
      ],
    );
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

    // Período de prácticas → campos persistibles (ISO + duración).
    const toISO = (d: Date | null) =>
      d
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        : null;
    // En modo 'horas' las horas son explícitas; en modos por fecha/ciclos no
    // medimos en horas (0 → el perfil del estudiante usa el objetivo por defecto).
    const horasGrupo = periodo.modo === 'horas' ? periodo.horas ?? 0 : 0;

    try {
      // 1) Guardamos el grupo y obtenemos su ID.
      const grupoRef = await addDoc(collection(db, 'grupos'), {
        nombre:          gNombre.trim(),
        carrera:         gCarrera.trim(),
        horasRequeridas: horasGrupo,
        docente:         gDocente.trim() || 'Sin asignar',
        universidad_id:  uid,
        fecha_creacion:  serverTimestamp(),
        estudiantes_registrados: 0,
        // ── Período de prácticas ──
        modo_duracion:   periodo.modo,
        fecha_inicio:    toISO(periodo.fechaInicio),
        fecha_fin:       toISO(periodo.fechaFin),
        duracion_meses:  periodo.meses ?? null,
        ciclos:          periodo.ciclos ?? null,
      });
      const grupoId = grupoRef.id;
      const nombreGrupo = gNombre.trim();
      const carreraGrupo = gCarrera.trim();

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
            graduado:         false,
            fecha_registro:   serverTimestamp(),
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

      // 3.5) Creamos AUTOMÁTICAMENTE el chat grupal oficial (id `grupo_{grupoId}`)
      // con los estudiantes recién registrados. Es exactamente la MISMA sala que
      // abre el botón de chat del grupo en la lista. No bloquea el flujo: si
      // fallara, se (re)crea al pulsar ese botón.
      try {
        await crearChatGrupoOficial({ universidadId: uid, grupoId, grupoNombre: nombreGrupo });
      } catch (e) {
        console.warn('No se pudo crear el chat del grupo automáticamente:', e);
      }

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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={s.estudianteNombre} numberOfLines={1}>{item.nombre}</Text>
                  {item.egresado && (
                    <View style={s.egresadoBadge}>
                      <Text style={s.egresadoBadgeText}>🎓 Egresado</Text>
                    </View>
                  )}
                </View>
                <Text style={s.estudianteMeta} numberOfLines={1}>{item.carrera} · {item.docente}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                {horasPorGrupo[item.id] ? (
                  <Text style={s.estudianteHoras}>
                    {horasPorGrupo[item.id].transcurridas}/{horasPorGrupo[item.id].total} h
                  </Text>
                ) : (
                  <Text style={s.estudianteHoras}>{item.horasRequeridas}h</Text>
                )}
                <Text style={s.estudianteMeta}>{item.estudiantes_registrados} est.</Text>
              </View>
              {!item.egresado && (
                <TouchableOpacity
                  style={[s.grupoEgresarBtn, !grupoPuedeEgresar(item.id) && { opacity: 0.4 }]}
                  onPress={() => egresarGrupo(item)}
                  disabled={egresando === item.id}
                  accessibilityLabel="Egresar grupo"
                >
                  {egresando === item.id ? (
                    <ActivityIndicator size="small" color={colors.gold} />
                  ) : (
                    <Ionicons name="school-outline" size={18} color={colors.gold} />
                  )}
                </TouchableOpacity>
              )}
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
              <TouchableOpacity
                style={s.grupoChatBtn}
                onPress={() => handleEliminarGrupo(item)}
                disabled={eliminandoGrupo === item.id}
                accessibilityLabel="Eliminar grupo"
              >
                {eliminandoGrupo === item.id ? (
                  <ActivityIndicator size="small" color={COLORS.error} />
                ) : (
                  <Ionicons name="trash-outline" size={18} color={COLORS.error} />
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
            // Si el grupo del estudiante tiene un acuerdo activo, mostramos las
            // horas laborales cumplidas/total (X/Y) con el conteo automático;
            // de lo contrario, caemos a las horas aprobadas por la universidad.
            const h = item.grupo_id ? horasPorGrupo[item.grupo_id] : undefined;
            const pct = h ? h.pct : Math.round((item.horas_aprobadas / (item.horas_objetivo || 500)) * 100);
            return (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setVerPerfilEstudianteId(item.id)}
              >
                <GlassCard contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
                  <StorageAvatar url={item.foto_url} size={44} fallbackIcon="person" />
                  <View style={{ flex: 1 }}>
                    <Text style={s.estudianteNombre} numberOfLines={1}>{item.nombre_completo}</Text>
                    <Text style={s.estudianteMeta} numberOfLines={1}>{item.carrera || 'Sin carrera'}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={s.estudianteHoras}>
                      {h ? `${h.transcurridas}/${h.total} h` : `${item.horas_aprobadas}h`}
                    </Text>
                    <View style={s.miniBarTrack}>
                      <View style={[s.miniBarFill, { width: `${Math.min(pct, 100)}%` as any }]} />
                    </View>
                    <View style={[s.estadoBadge, !item.activo && s.estadoBadgeOff]}>
                      <Text style={[s.estadoText, !item.activo && { color: COLORS.textMuted }]}>
                        {item.activo ? 'Activo' : 'Pendiente'}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleEliminarEstudiante(item)}
                    disabled={eliminandoEstudiante === item.id}
                    hitSlop={8}
                    accessibilityLabel="Eliminar estudiante"
                    style={{ paddingLeft: 4 }}
                  >
                    {eliminandoEstudiante === item.id ? (
                      <ActivityIndicator size="small" color={COLORS.error} />
                    ) : (
                      <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                    )}
                  </TouchableOpacity>
                </GlassCard>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<Text style={s.emptyText}>Sin estudiantes registrados.</Text>}
        />
      )}

      {verPerfilEstudianteId ? (
        <ProfileViewerModal
          visible
          tipo="estudiante"
          profileId={verPerfilEstudianteId}
          onClose={() => setVerPerfilEstudianteId(null)}
        />
      ) : null}

      {/* ── MODAL · PASO 1: Crear grupo (validación en tiempo real) ── */}
      <Modal visible={showModalGrupo} transparent animationType="slide" onRequestClose={() => setShowModalGrupo(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheetCard, { maxHeight: '88%' }]}>
            <Text style={styles.modalTitle}>Paso 1 · Datos del grupo</Text>
            <Text style={styles.modalDesc}>
              Define el grupo o aula. Aún no se guarda; en el siguiente paso cargarás el Excel.
            </Text>

            {/* Aviso: un grupo = un horario. Disponibilidad incompatible → grupos separados. */}
            <View style={{
              flexDirection: 'row', gap: 10, alignItems: 'flex-start',
              backgroundColor: COLORS.primary + '12',
              borderWidth: 1, borderColor: COLORS.primary + '30',
              borderRadius: 12, padding: 12, marginBottom: 12,
            }}>
              <Ionicons name="information-circle-outline" size={18} color={COLORS.primaryLight} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, color: COLORS.textMuted, fontSize: 12, lineHeight: 17 }}>
                Cada grupo acuerda <Text style={{ color: COLORS.textPrimary, fontFamily: FONTS.interSemiBold }}>un solo horario</Text> con la empresa.
                Si tienes estudiantes con disponibilidad incompatible (por ejemplo, unos trabajan de mañana y otros de tarde),
                crea <Text style={{ color: COLORS.textPrimary, fontFamily: FONTS.interSemiBold }}>grupos separados</Text> para que cada uno pueda cumplir sus prácticas.
              </Text>
            </View>

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
                    <TouchableOpacity
                      style={[
                        styles.modalInput,
                        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
                        malo ? s.campoErr : (tiene ? s.campoOk : null),
                      ]}
                      onPress={() => setShowCarreraPicker(v => !v)}
                      activeOpacity={0.85}
                    >
                      <Text style={{ color: gCarrera ? COLORS.textPrimary : COLORS.textMuted, flex: 1 }}>
                        {gCarrera || (carrerasUni.length ? 'Selecciona una carrera' : 'No hay carreras registradas')}
                      </Text>
                      <Ionicons
                        name={showCarreraPicker ? 'chevron-up-outline' : 'chevron-down-outline'}
                        size={18}
                        color={COLORS.textMuted}
                      />
                    </TouchableOpacity>
                    {showCarreraPicker && (
                      <ScrollView
                        nestedScrollEnabled
                        style={{
                          maxHeight: 200,
                          marginTop: 6,
                          borderWidth: 1,
                          borderColor: COLORS.border,
                          borderRadius: 10,
                          backgroundColor: COLORS.white4,
                        }}
                      >
                        {carrerasUni.length === 0 ? (
                          <Text style={{ color: COLORS.textMuted, fontSize: 13, padding: 14 }}>
                            Registra carreras en el perfil de la universidad para poder elegirlas aquí.
                          </Text>
                        ) : (
                          carrerasUni.map((c, i) => (
                            <TouchableOpacity
                              key={c}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                paddingVertical: 12,
                                paddingHorizontal: 14,
                                borderTopWidth: i === 0 ? 0 : 1,
                                borderTopColor: COLORS.border,
                              }}
                              activeOpacity={0.85}
                              onPress={() => { setGCarrera(c); setShowCarreraPicker(false); }}
                            >
                              <Text style={{ color: COLORS.textPrimary, fontSize: 13, flex: 1 }}>{c}</Text>
                              {gCarrera === c && <Ionicons name="checkmark" size={16} color={COLORS.primary} />}
                            </TouchableOpacity>
                          ))
                        )}
                      </ScrollView>
                    )}
                    {malo && <Text style={s.campoErrText}>{errCarrera}</Text>}
                  </View>
                );
              })()}

              {/* Período de prácticas — reemplaza el antiguo campo de horas */}
              <View style={{ marginBottom: 6, marginTop: 4 }}>
                <PeriodoPracticasField value={periodo} onChange={setPeriodo} />
              </View>
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
// ── SECCIÓN PRÁCTICAS (reemplaza "Aprobar Pasantías") ──────────────
// Gestiona las pasantías de grupo (solicitudes_practicas): en curso, por
// certificar (la empresa ya finalizó y emitió constancia) y certificadas.
// La universidad revisa la constancia y pulsa "Certificar" → acredita horas.
function SeccionPracticas({ solicitudes }: { solicitudes: SolicitudGrupo[] }) {
  const { s, colors } = useThemedStyles();
  const [certificando, setCertificando] = useState<string | null>(null);

  const porCertificar = solicitudes.filter(x => x.estado === 'finalizado' && (x as any).certificacion !== 'certificada');
  const activas       = solicitudes.filter(x => x.estado === 'aprobado');
  const certificadas  = solicitudes.filter(x => (x as any).certificacion === 'certificada');

  const handleCertificar = (sol: SolicitudGrupo) => {
    const h = calcularHorasAcuerdo(sol.acuerdo);
    Alert.alert(
      'Certificar pasantía',
      `Grupo "${sol.grupoNombre ?? '—'}"\nSe acreditarán ${h.total} horas a ${sol.alumnos?.length ?? 0} estudiante(s). Esta acción es definitiva.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Certificar',
          onPress: async () => {
            setCertificando(sol.id);
            try {
              const r = await certificarPasantia(sol.id);
              Alert.alert('✅ Certificada', `Se acreditaron ${r.horas} horas a ${r.totalEstudiantes} estudiante(s).`);
            } catch {
              Alert.alert('Error', 'No se pudo certificar la pasantía.');
            } finally {
              setCertificando(null);
            }
          },
        },
      ],
    );
  };

  const Card = ({ sol, accion }: { sol: SolicitudGrupo; accion?: 'certificar' }) => {
    const h = calcularHorasAcuerdo(sol.acuerdo);
    const cert = (sol as any).certificacion;
    const badge =
      cert === 'certificada' ? { txt: 'Certificada', col: COLORS.gold }
      : sol.estado === 'finalizado' ? { txt: 'Por certificar', col: COLORS.warning }
      : { txt: 'En curso', col: COLORS.success };
    return (
      <GlassCard style={{ marginBottom: 10 }} contentStyle={{ padding: 14, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 15, flex: 1 }} numberOfLines={1}>
            {sol.grupoNombre ?? 'Grupo'}
          </Text>
          <View style={{ borderWidth: 1, borderColor: badge.col + '55', backgroundColor: badge.col + '22', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 }}>
            <Text style={{ color: badge.col, fontSize: 11, fontWeight: '700' }}>{badge.txt}</Text>
          </View>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{sol.carrera ?? '—'}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          {sol.alumnos?.length ?? 0} estudiante(s) · {h.total} h {sol.fechaInicio ? `· ${sol.fechaInicio} → ${sol.fechaFin}` : ''}
        </Text>
        {cert === 'certificada' && (
          <Text style={{ color: COLORS.gold, fontSize: 12, fontWeight: '600' }}>
            ✓ {(sol as any).horasCertificadas ?? h.total} horas acreditadas
          </Text>
        )}
        {accion === 'certificar' && (
          <View style={{ gap: 6, marginTop: 4 }}>
            {((sol as any).constancia?.tipo === 'pdf' && (sol as any).constancia?.url) ? (
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                onPress={() => Linking.openURL((sol as any).constancia.url)}
              >
                <Ionicons name="document-attach-outline" size={16} color={colors.primaryLight} />
                <Text style={{ color: colors.primaryLight, fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' }}>
                  Ver constancia (PDF)
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="document-text-outline" size={15} color={colors.primaryLight} />
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Constancia automática emitida</Text>
              </View>
            )}
            <JellyButton
              style={{ backgroundColor: COLORS.primary, borderRadius: 12 }}
              contentStyle={{ paddingVertical: 10 }}
              onPress={() => handleCertificar(sol)}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {certificando === sol.id ? 'Certificando…' : 'Certificar y acreditar horas'}
              </Text>
            </JellyButton>
          </View>
        )}
      </GlassCard>
    );
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
      <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16, marginBottom: 8 }}>
        Por certificar ({porCertificar.length})
      </Text>
      {porCertificar.length === 0
        ? <Text style={s.emptyText}>No hay pasantías esperando certificación.</Text>
        : porCertificar.map(sol => <Card key={sol.id} sol={sol} accion="certificar" />)}

      <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16, marginTop: 18, marginBottom: 8 }}>
        En curso ({activas.length})
      </Text>
      {activas.length === 0
        ? <Text style={s.emptyText}>Sin pasantías en curso.</Text>
        : activas.map(sol => <Card key={sol.id} sol={sol} />)}

      {certificadas.length > 0 && (
        <>
          <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16, marginTop: 18, marginBottom: 8 }}>
            Certificadas ({certificadas.length})
          </Text>
          {certificadas.map(sol => <Card key={sol.id} sol={sol} />)}
        </>
      )}
    </ScrollView>
  );
}

function SeccionEstadisticas({ estudiantes, apps, solicitudesGrupo }: { estudiantes: EstudianteRow[]; apps: Aplicacion[]; solicitudesGrupo: SolicitudGrupo[] }) {
  const { s } = useThemedStyles();

  // "Carreras con más pasantías": combina pasantías individuales (aplicaciones)
  // y de grupo (solicitudes_practicas), cada grupo cuenta por su nº de alumnos.
  const carreras = useMemo(() => {
    const map: Record<string, number> = {};
    apps.filter(a => a.estado === 'contratado' || a.estado === 'finalizado' || a.estado === 'aprobado')
      .forEach(a => {
        const e = estudiantes.find(est => est.id === a.estudiante_id);
        if (e?.carrera) map[e.carrera] = (map[e.carrera] ?? 0) + 1;
      });
    solicitudesGrupo
      .filter(sg => sg.estado === 'aprobado' || sg.estado === 'finalizado')
      .forEach(sg => {
        if (sg.carrera) map[sg.carrera] = (map[sg.carrera] ?? 0) + (sg.alumnos?.length ?? 1);
      });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [estudiantes, apps, solicitudesGrupo]);

  const maxVal = Math.max(...carreras.map(c => c[1]), 1);

  // Pasantías de grupo activas (aprobadas) con su línea de tiempo porcentual.
  const activas = useMemo(
    () => solicitudesGrupo.filter(sg => sg.estado === 'aprobado' && sg.fechaInicio),
    [solicitudesGrupo],
  );

  const aprobadasCount =
    solicitudesGrupo.filter(sg => sg.estado === 'aprobado' || sg.estado === 'finalizado').length +
    apps.filter(a => a.estado === 'aprobado').length;

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

      {/* ── Línea de tiempo de pasantías activas ── */}
      <Text style={[s.statTitle, { marginTop: 24 }]}>Pasantías activas</Text>
      {activas.length === 0
        ? <Text style={s.emptyText}>No hay pasantías en curso.</Text>
        : activas.map(sg => {
            const prog = progresoPorFechas(sg.fechaInicio, sg.fechaFin);
            const color = prog.estado === 'completado' ? COLORS.gold : prog.estado === 'en_curso' ? COLORS.success : COLORS.primaryLight;
            return (
              <View key={sg.id} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={s.barLabel} numberOfLines={1}>{sg.grupoNombre ?? 'Grupo'}</Text>
                  <Text style={[s.barValue, { color }]}>{prog.pct}%</Text>
                </View>
                <View style={s.barTrack}>
                  <View style={[s.barFill, { width: `${prog.pct}%` as any, backgroundColor: color }]} />
                </View>
                <Text style={[s.emptyText, { textAlign: 'left', marginTop: 4, fontSize: 11 }]}>
                  {prog.estado === 'por_iniciar'
                    ? `Inicia ${sg.fechaInicio}`
                    : `Día ${prog.diasTranscurridos} de ${prog.diasTotales} · ${sg.fechaInicio} → ${sg.fechaFin}`}
                </Text>
              </View>
            );
          })
      }

      <Text style={[s.statTitle, { marginTop: 24 }]}>Resumen general</Text>
      <View style={s.metricasGrid}>
        <MetricCard icon="people-outline"   label="Total estudiantes"  value={estudiantes.length}                                   color={COLORS.primaryLight} />
        <MetricCard icon="checkmark-circle-outline" label="Pasantías aprobadas" value={aprobadasCount} color={COLORS.success} />
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
  // ── Modal "Mi Perfil" (master-detail) ──
  perfilModalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center', padding: 14,
  },
  perfilModalCard: {
    width: '100%', maxWidth: 520, height: '90%',
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 24, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border,
  },
  perfilCloseBtn: {
    position: 'absolute', top: 12, right: 12, zIndex: 30,
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.white4, borderWidth: 1, borderColor: COLORS.border,
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
  grupoEgresarBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: COLORS.gold + '1f',
    borderWidth: 1, borderColor: COLORS.gold + '55',
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 4,
  },
  egresadoBadge: {
    backgroundColor: COLORS.gold + '22',
    borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2,
  },
  egresadoBadgeText: { fontSize: 10, fontFamily: FONTS.interSemiBold, color: COLORS.gold },
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
