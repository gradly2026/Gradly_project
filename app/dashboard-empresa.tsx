// ═════════════════════════════════════════════════════════════════
// DASHBOARD EMPRESA — panel principal del rol "empresa".
//
// Mismo esqueleto que app/dashboard-universidad.tsx (léelo primero si no lo
// has visto: menú lateral/flotante + `seccion` activa + listeners onSnapshot
// + PerfilMasterDetail para "Mi Perfil"). Aquí solo se explica a fondo lo que
// es ÚNICO de la empresa: el formulario "Nueva Vacante" (con su fork
// Pasantía/Vacante y todos sus validadores), el tablero Kanban de
// reclutamiento, los planes de suscripción (Básico/Premium) y su flujo de
// pago simulado, y el mapa de ubicación de la plaza. Los bloques de JSX/
// modales que ya viste en otros archivos (perfil.tsx, app/(tabs)/index.tsx,
// iniciosesion.tsx, dashboard-universidad.tsx) solo llevan una nota corta.
// ═════════════════════════════════════════════════════════════════
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
// CRUD de Firestore usados en este archivo: addDoc (crear), doc+updateDoc
// (actualizar), deleteField (borrar un campo específico al editar), getDocs
// (lectura puntual, no en vivo), onSnapshot (lectura en vivo), query+where
// (filtrar), documentId() (leer varios documentos por su id con `in`),
// serverTimestamp() (fecha que pone el propio servidor de Firebase).
import {
  addDoc,
  collection,
  deleteField,
  doc,
  documentId,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
// Funciones de negocio ya centralizadas en pasantiaService.ts (ver ese
// archivo para el detalle de cada transacción): mover el estado de una
// aplicación, firmar la constancia de horas, y eliminar una vacante.
import {
  cambiarEstadoAplicacion,
  empresaFirmaConstancia,
  eliminarVacante,
} from '../src/services/pasantiaService';
import { abrirChatDirectoEmpresaEstudiante } from '../src/services/chatService';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FloatingSearchButton from '../src/components/FloatingSearchButton';
import FloatingTopBar from '../src/components/FloatingTopBar';
import SalirSesionModal from '../src/components/SalirSesionModal';
// Truco de renombrado ya visto en otros dashboards: se usa <Text>/<TextInput>
// normales en todo el JSX, pero en realidad son AutoText/AutoTextInput (se
// traducen solos). `useAutoText` traduce un string suelto fuera del JSX.
import { AutoText, AutoText as Text, AutoTextInput as TextInput, useAutoText } from '../src/components/AutoText';
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
  Switch,

  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useTranslation } from '../src/context/TranslationContext';
import BandejaIncidencias from '../src/components/BandejaIncidencias';
// Bandeja de incidencias de práctica. El MISMO componente que ven el
// estudiante y la universidad; la prop `rol` decide qué puede hacer cada uno.
import FeedbackGate from '../src/components/FeedbackGate';
import ModeracionVacanteGate from '../src/components/ModeracionVacanteGate';
import AvisosGate from '../src/components/AvisosGate';
import FloatingNavBar, { type NavItem } from '../src/components/FloatingNavBar';
import CalendarioEventos from '../src/components/CalendarioEventos';
import EmpresaHomeCards from '../src/components/EmpresaHomeCards';
import HistorialPasantes from '../src/components/HistorialPasantes';
// PerfilMasterDetail: mismo componente config-driven (array de `sections`)
// que arma "Mi Perfil" en app/(tabs)/perfil.tsx y en dashboard-universidad.tsx.
import PerfilMasterDetail from '../src/components/PerfilMasterDetail';
import RangoCard from '../src/components/RangoCard';
import ResenasFeedback from '../src/components/ResenasFeedback';
import SeccionMensajes from '../src/components/SeccionMensajes';
import { SolicitudesEmpresa } from '../src/components/Matchmaking';
import ProponerHorarioModal from '../src/components/ProponerHorarioModal';
import type { AcuerdoData } from '../src/types/chat';
import { PerfilStatsEmpresa, RedGradlyBanner } from '../src/components/NetworkStats';
import { OnboardingBubble, useOnboarding } from '../src/components/OnboardingTour';
import { useAuth } from '../src/context/AuthContext';
import { subscribeUnreadTotal } from '../src/services/chatService';
import { enviarNotificacion } from '../src/services/notificationService';
import { auth, db, storage } from '../src/config/firebaseConfig';
import { COLORS, FONTS, useTheme, type GradlyColors } from '../src/context/ThemeContext';
import { useAuthGuard } from '../src/hooks/useAuthGuard';
import { useAuthBackGuard } from '../src/hooks/useSessionBackGuard';
import { shadow } from '../src/utils/shadow';
import { progresoPorFechas } from '../src/utils/progresoPasantia';
import { progresoDeGrupo } from '../src/utils/horasPasantia';
import { cuposOcupados, cuposTotales, textoCupos, textoSalario, valCupos } from '../src/utils/cupos';
import { AREAS as AREAS_CATALOGO, tagsDeArea } from '../src/data/areas';
import { normalizarHorario, textoHorario, valHorario, type HorarioPasantia } from '../src/data/disponibilidad';
import HorarioVacanteSelector from '../src/components/HorarioVacanteSelector';
import CandidatosVacante from '../src/components/CandidatosVacante';
import PerfilPublicoModal from '../components/PerfilPublicoModal';
import MapViewer from '../src/components/MapViewer';
import { LiquidBackground } from '../components/ui/liquid-glass/LiquidBackground';
import { GlassCard } from '../components/ui/liquid-glass/GlassCard';
import { JellyButton } from '../components/ui/liquid-glass/JellyButton';
// Mismas reglas de validación/máscara de tarjeta que usa el registro
// (utils/cardValidation.ts): Luhn, vencimiento MM/AA, CVV, titular.
import {
  maskExp,
  maskTarjeta,
  valCvv,
  valExp,
  valTarjetaNum,
  valTitular,
} from '../utils/cardValidation';

// Catálogo de planes SOLO para mostrar texto (nombre/precio/beneficios) en
// "Mi Perfil" y en el modal de detalle del plan. Los valores REALES que se
// aplican al comprar (con precio según mensual/anual) están en
// obtenerPlanesVisibles() dentro del componente, y los que se guardan en la
// BD al activar un plan están en confirmarMejoraPlan().
const PLAN_DISPLAY: Record<'gratuito' | 'mensual' | 'premium', { nombre: string; precio: string; beneficios: string[] }> = {
  gratuito: {
    nombre: 'Gratuito',
    precio: '$0/mes',
    beneficios: ['Hasta 2 vacantes activas', '1 alianza con universidad', 'Soporte por correo'],
  },
  mensual: {
    nombre: 'Mensual',
    precio: '$15/mes',
    beneficios: ['Hasta 10 vacantes activas', 'Hasta 5 alianzas', 'Estadísticas de tus vacantes'],
  },
  premium: {
    nombre: 'Premium',
    precio: '$150/año',
    beneficios: ['Vacantes ilimitadas', 'Alianzas ilimitadas', 'Insignia de Empresa Verificada ✓'],
  },
};

// Montos reales por plan/ciclo — mismos valores que se muestran en
// obtenerPlanesVisibles() al comprar, reutilizados aquí para registrar el
// monto correcto en `transacciones` al renovar.
const PRECIOS_PLAN: Record<'mensual' | 'premium', Record<'mensual' | 'anual', number>> = {
  mensual: { mensual: 9.99, anual: 49.99 },
  premium: { mensual: 24.99, anual: 149.99 },
};

// Mismo patrón `useThemedStyles` visto en perfil.tsx/dashboard-universidad.tsx:
// useMemo() para no reconstruir los objetos de estilos en cada render, solo
// cuando cambia el tema (colors). Aquí hay DOS hojas de estilos separadas:
// `styles` (makeStyles, para el layout general/modales) y `s` (makeS, para
// las secciones internas Inicio/Vacantes/Kanban/Activas).
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
// Las 7 pestañas del menú (5 visibles en MENU + 'perfil'/'mensajes' que se
// añaden siempre al final — ver navItems más abajo).
type SeccionEmpresa = 'inicio' | 'vacantes' | 'kanban' | 'activas' | 'historial' | 'perfil' | 'mensajes';

/** Forma de un documento de la colección `vacantes` en Firestore. */
interface Vacante {
  id: string;
  titulo: string;
  descripcion: string;
  modalidad: string;
  tipo: string;
  area: string;
  /** 'pasantia' (matchmaking universidad↔empresa) o 'vacante' (aplicación individual, graduados). Ausente = legado. */
  categoria?: 'pasantia' | 'vacante';
  /** Estudiantes que la empresa puede recibir. Ausente = vacante legada, sin límite. */
  cupos?: number | null;
  /** Cupos reservados por universidades que reclamaron por lote. */
  cupos_reclamados?: number | null;
  contratados_count?: number | null;
  /** Horario declarado al publicar. Ausente = vacante legada (se negociaba por chat). */
  horario?: HorarioPasantia | null;
  /** true = las universidades reservan cupos sin esperar confirmación. */
  reclamos_auto?: boolean;
  /** Roles concretos dentro del área (afinan el match). */
  tags?: string[];
  /** Granularidad de empleo (solo tipo 'Vacante'). */
  modalidad_contrato?: string;
  /** Rango salarial opcional (solo 'Vacante'); informativo, se negocia fuera de Gradly. */
  salario_min?: number | null;
  salario_max?: number | null;
  horas_requeridas?: number;
  horas_semanales?: number;
  skills_requeridas: string[];
  fecha_limite: any;
  activa: boolean;
  aplicantes_count: number;
  ubicacion_coords?: { latitude: number; longitude: number } | null;
  ubicacion_texto?: { direccion: string; municipio: string; departamento: string; pais: string } | null;
  /** Presente solo si un admin deshabilitó/eliminó esta publicación (ver ModeracionVacanteGate). */
  estado_moderacion?: 'deshabilitada' | 'eliminada' | null;
  motivo_moderacion?: string | null;
}

/** Forma de un documento de la colección `aplicaciones` (postulación individual a una `vacante`). */
interface Aplicacion {
  id: string;
  estudiante_id: string;
  estudiante_nombre: string;
  estudiante_foto: string;
  vacante_id: string;
  estado: string;
  fecha_aplicacion: any;
  horas_completadas: number;
  pago_confirmado: boolean;
  titulo_vacante?: string;
  universidad_id?: string;
  fecha_inicio?: any;
  fecha_fin?: any;
  /** Horario acordado al contratar (ver ProponerHorarioModal, sin sección de pago). */
  acuerdo?: AcuerdoData;
  horarioPropuesto?: string;
  diasTrabajo?: string[];
}

/** Pasantía de grupo (flujo Universidad↔Empresa, colección solicitudes_practicas). */
interface SolicitudGrupo {
  id: string;
  grupoId?: string;
  grupoNombre?: string;
  carrera?: string;
  universidadId?: string;
  estado?: string;
  fechaInicio?: string;
  fechaFin?: string;
  alumnos?: { id: string; nombre: string }[];
  /** uids reales de Auth de los alumnos (a diferencia de alumnos[].id, que puede ser sintético). */
  estudianteIds?: string[];
  pago?: { tipo: 'con_pago' | 'sin_pago'; monto?: number };
  /** Acuerdo firmado (días, horario, fechas) — base del progreso en horas reales. */
  acuerdo?: AcuerdoData;
}

/** Forma de un documento de la colección `perfiles_empresas` (uid del dueño = id del documento). */
interface PerfilEmpresa {
  nombre_empresa: string;
  industria: string;
  premium: boolean;
  estado_suscripcion: string;
  tarjeta_numero: string;
  tarjeta_alias: string;
  logo_url?: string;
  // Plan y restricciones de negocio (inyectadas en el registro).
  plan?: 'gratuito' | 'mensual' | 'premium';
  limiteVacantes?: number;
  limiteAlianzas?: number;
  verificado?: boolean;
  /** Ciclo de facturación contratado (mensual/anual) — determina el monto de la renovación. */
  cicloFacturacion?: 'mensual' | 'anual';
  /** true = la empresa quiere que Gradly renueve su plan solo, sin acción manual. */
  renovacionAutomatica?: boolean;
  fechaUltimoPago?: any;
}

// Pestañas del menú lateral/flotante, en orden de aparición (icono de Ionicons + etiqueta).
const MENU: { key: SeccionEmpresa; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'inicio',    label: 'Inicio',           icon: 'home-outline' },
  { key: 'vacantes',  label: 'Mis Vacantes',     icon: 'briefcase-outline' },
  { key: 'kanban',    label: 'Reclutamiento',    icon: 'people-outline' },
  { key: 'activas',   label: 'Pasantías Activas',icon: 'checkmark-circle-outline' },
  { key: 'historial', label: 'Historial de Pasantes', icon: 'time-outline' },
];

// ── Onboarding (guía por globos) — mismo orden que MENU, terminando en
// 'perfil' (Mi Perfil es siempre la última parada del recorrido). ──
const TOUR_CLAVES: SeccionEmpresa[] = ['inicio', 'vacantes', 'kanban', 'activas', 'historial', 'perfil'];
const TOUR_PASOS: Record<SeccionEmpresa, { titulo: string; texto: string }> = {
  inicio: {
    titulo: '¡Bienvenido a tu panel! 🏢',
    texto:
      'Este es tu panel general. Aquí ves un resumen de tu actividad: vacantes publicadas, aplicaciones recibidas y pasantías en curso.',
  },
  vacantes: {
    titulo: 'Mis Vacantes',
    texto:
      'Crea y gestiona tus ofertas de pasantía o proyecto. Puedes activarlas o pausarlas cuando quieras.',
  },
  kanban: {
    titulo: 'Reclutamiento',
    texto:
      'Mueve a los candidatos entre etapas: pendiente, en revisión, entrevista y contratado. Todo desde un tablero visual.',
  },
  activas: {
    titulo: 'Pasantías Activas',
    texto:
      'Da seguimiento a las pasantías en curso y firma las constancias de horas de tus estudiantes.',
  },
  historial: {
    titulo: 'Historial de Pasantes',
    texto:
      'Reencuentra a los estudiantes que finalizaron sus pasantías contigo y re-contáctalos para ofrecerles empleo.',
  },
  perfil: {
    titulo: 'Mi Perfil',
    texto:
      'Consulta tu rango, tu plan, tu método de pago y tus estadísticas, y ajusta tus preferencias.',
  },
  mensajes: {
    titulo: 'Mensajes',
    texto: 'Chatea con tus candidatos y con las universidades aliadas sobre las pasantías.',
  },
};

const MODALIDADES = ['Presencial', 'Remoto', 'Híbrido'];

// Estilos del bloque de mapa (estética Liquid Glass: fondo oscuro translúcido, bordes violetas)
const mapStyles = StyleSheet.create({
  glassBox: {
    marginBottom: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(26,22,43,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.4)',
  },
  glassTitle: { color: '#fff', fontFamily: FONTS.interSemiBold, fontSize: 15, marginBottom: 4 },
  glassHint:  { color: 'rgba(255,255,255,0.6)', fontFamily: FONTS.interRegular, fontSize: 12, marginBottom: 12 },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryBtnText: { color: '#fff', fontFamily: FONTS.interSemiBold, fontSize: 14 },
  mapContainer: {
    height: 300,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  detailBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    gap: 4,
  },
  detailLine:  { color: 'rgba(255,255,255,0.85)', fontFamily: FONTS.interRegular, fontSize: 13 },
  detailLabel: { color: COLORS.primaryLight, fontFamily: FONTS.interSemiBold },
});
// El fork real del sistema: 'Pasantía' enruta por matchmaking universidad↔
// empresa (con cupos reclamables por lote); 'Vacante' es aplicación individual
// para quien ya culminó su primera pasantía o está graduado. Antes este campo
// tenía 3 opciones ('Pasantía'/'Proyecto'/'Tiempo parcial') y las 2 últimas
// colapsaban a 'vacante' de forma oculta — ahora el fork es explícito, y la
// granularidad de empleo vive en MODALIDADES_CONTRATO (solo aplica a Vacante).
const TIPOS = ['Pasantía', 'Vacante'];
// "Por proyecto" se quitó por el momento (a petición explícita, es reversible:
// basta con añadirlo de nuevo aquí — la lógica de horario opcional que
// depende de ese valor exacto ya está lista y no hace falta reconstruirla).
const MODALIDADES_CONTRATO = ['Tiempo completo', 'Medio tiempo'];
// El catálogo de áreas vive en src/data/areas.ts (compartido con el mapeo
// carrera→área que usan el filtro del estudiante y las sugerencias).
const AREAS = [...AREAS_CATALOGO];

// ─────────────────────────────────────────────
// VALIDADORES DE "NUEVA VACANTE" (puros: devuelven '' si es válido)
// Reutilizados tanto en los onChangeText (tiempo real) como en la
// validación maestra de handlePublicarVacante. Mismo patrón "función pura
// que devuelve mensaje de error o '' " que valLetters/valNit/etc. en
// app/auth/registro.tsx — aquí cada validador es específico del formulario
// de vacante en vez de genérico.
// ─────────────────────────────────────────────
const RE_SOLO_LETRAS = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]+$/;          // letras (con tilde/ñ) y espacios
const RE_SKILLS       = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s,]+$/;        // letras, espacios y comas
const RE_DESC_PROHIB  = /[?!@çÇ\\|*]/;                          // caracteres prohibidos en descripción

const valTitulo = (v: string): string => {
  if (!v.trim()) return 'El título es obligatorio.';
  if (!RE_SOLO_LETRAS.test(v.trim())) return 'Solo se permiten letras y espacios (sin números ni símbolos).';
  return '';
};
const valAreaOtra = (v: string): string => {
  if (!v.trim()) return 'Especifica el área.';
  if (!RE_SOLO_LETRAS.test(v.trim())) return 'Solo se permiten letras y espacios.';
  return '';
};
const valDesc = (v: string): string => {
  if (!v.trim()) return 'La descripción es obligatoria.';
  if (RE_DESC_PROHIB.test(v)) return 'No se permiten los caracteres: ? ! @ ç Ç \\ | *';
  return '';
};
const valSkills = (v: string): string => {
  if (!v.trim()) return 'Agrega al menos una skill.';
  if (!RE_SKILLS.test(v)) return 'Solo letras, espacios y comas (sin números ni símbolos).';
  return '';
};
// Fecha límite: hoy+5 días (mínimo) y hoy+5días+3meses (máximo). Date nativo local
// (constructor por componentes => medianoche local, sin desfases de zona horaria).
//
// `original` es la fecha que YA tenía una vacante que se está editando: si el
// usuario no la toca, se acepta aunque hoy caiga fuera de la ventana. Sin esta
// excepción, editar cualquier vacante publicada hace más de unos días sería
// imposible — el formulario quedaría inválido por un campo que no cambió.
const valFecha = (v: string, original?: string): string => {
  if (original && v.trim() && v.trim() === original.trim()) return '';
  if (!v.trim()) return 'La fecha límite es obligatoria.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'Formato incompleto (YYYY-MM-DD).';
  const [y, m, d] = v.split('-').map(Number);
  const fecha = new Date(y, m - 1, d);
  if (fecha.getFullYear() !== y || fecha.getMonth() !== m - 1 || fecha.getDate() !== d) {
    return 'Fecha inválida.';
  }
  const hoy = new Date();
  const min = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 5);
  const max = new Date(min.getFullYear(), min.getMonth() + 3, min.getDate());
  if (fecha < min) return 'Debe ser al menos 5 días después de hoy.';
  if (fecha > max) return 'El plazo máximo es de 3 meses.';
  return '';
};

/** Solo se pide cuando el Tipo es 'Vacante' (la Pasantía no la usa). */
const valModalidadContrato = (v: string): string =>
  v ? '' : 'Selecciona la modalidad de contrato.';

/**
 * Rango salarial: 100% opcional. Se puede dejar "desde X" o "hasta X" sin el
 * otro extremo (rango abierto); solo se valida cuando SÍ hay algo escrito, y
 * que el mínimo no supere al máximo si ambos están presentes.
 */
const valSalario = (min: string, max: string): string => {
  const mn = min.trim() ? Number(min.trim()) : null;
  const mx = max.trim() ? Number(max.trim()) : null;
  if (mn !== null && (!Number.isFinite(mn) || mn < 0)) return 'Salario mínimo inválido.';
  if (mx !== null && (!Number.isFinite(mx) || mx < 0)) return 'Salario máximo inválido.';
  if (mn !== null && mx !== null && mn > mx) return 'El mínimo no puede ser mayor que el máximo.';
  return '';
};

/** ¿El horario quedó completamente vacío (el usuario no tocó nada)? */
const horarioVacio = (h: Partial<HorarioPasantia>): boolean =>
  !(h?.dias?.length) && !h?.horaInicio && !h?.horaFin;

/**
 * El horario es obligatorio salvo en Vacante + "Por proyecto": un trabajo por
 * entregables no siempre tiene un horario semanal fijo. Si el usuario SÍ
 * empezó a llenarlo aun siendo opcional, debe quedar completo (no se admite
 * a medias) — por eso solo se perdona cuando está 100% vacío.
 */
const valHorarioCondicional = (
  h: Partial<HorarioPasantia>,
  requerido: boolean,
): string => {
  if (!requerido && horarioVacio(h)) return '';
  return valHorario(h);
};
// Auto-formato YYYY-MM-DD a partir de solo dígitos (máx 8: YYYYMMDD).
const formatFecha = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length >= 6) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
  if (digits.length >= 4) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return digits;
};
// Columnas del tablero Kanban de reclutamiento (SeccionKanban): key = valor
// real guardado en `aplicaciones.estado`, label = texto de la pestaña, color
// = acento visual. El ORDEN dentro de SeccionKanban (variable local `ORDEN`)
// se define aparte porque debe coincidir exactamente con la secuencia en la
// que se puede avanzar/retroceder a un candidato.
const KANBAN_COLS: { key: string; label: string; color: string }[] = [
  { key: 'pendiente',   label: 'Pendientes',   color: COLORS.textMuted },
  { key: 'en_revision', label: 'En Revisión',  color: COLORS.warning },
  { key: 'entrevista',  label: 'Entrevista',   color: COLORS.primaryLight },
  { key: 'contratado',  label: 'Contratado',   color: COLORS.success },
];


// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────
export default function DashboardEmpresa() {
  // useAuthGuard('empresa'): redirige fuera si el usuario logueado no tiene
  // rol 'empresa' (mismo hook que usan todos los dashboards).
  useAuthGuard('empresa');
  const { user, userProfile } = useAuth();
  const router = useRouter();
  const { styles, colors, s } = useThemedStyles();
  const [showPerfil, setShowPerfil] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

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

  // ── Cambiar logo/foto de la empresa ────────────────────────────────
  // Mismo patrón "elegir de galería → fetch→blob → uploadBytes a Storage →
  // getDownloadURL → guardar la URL en Firestore" ya explicado a fondo en
  // authService.ts (uploadPhoto) y perfil.tsx. La única diferencia es que
  // aquí se actualizan DOS documentos con la misma URL: el perfil de empresa
  // (logo_url) y el documento espejo en 'usuarios' (foto_url), para que
  // cualquier pantalla que solo lea 'usuarios' también vea el logo nuevo.
  const handleUploadLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permiso necesario', 'Necesitamos acceso a tu galería.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (result.canceled) return;
    setUploadingLogo(true);
    try {
      // OBLIGATORIO: convertir la imagen con fetch antes de subirla a Storage
      const response = await fetch(result.assets[0].uri);
      const blob = await response.blob();
      const storageRef = ref(storage, `logos_empresas/${user!.uid}/logo.jpg`);
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      // Cache-busting para forzar refresco visual inmediato
      const urlActualizada = `${downloadURL}${downloadURL.includes('?') ? '&' : '?'}t=${new Date().getTime()}`;
      // Actualizamos AMBOS documentos: perfil específico y colección 'usuarios'
      await Promise.all([
        updateDoc(doc(db, 'perfiles_empresas', user!.uid), { logo_url: urlActualizada }),
        updateDoc(doc(db, 'usuarios', user!.uid), { foto_url: urlActualizada }),
      ]);
      // Estado local inmediato
      setPerfil(prev => (prev ? { ...prev, logo_url: urlActualizada } : prev));
    } catch {
      Alert.alert('Error', 'No se pudo subir el logo.');
    } finally {
      setUploadingLogo(false);
    }
  };

  // ── Planes comerciales visibles (precio dinámico según período) ────
  // Se recalcula en cada render (no useMemo: es barato y depende de
  // `periodoPlanes`) para mostrar el precio mensual o anual en el modal de
  // "Planes y Facturación". El precio real que se cobra/guarda vive en
  // PRECIOS_PLAN — esta función solo arma el texto para pintar las tarjetas.
  const obtenerPlanesVisibles = () => {
    return [
      {
        id: 'mensual', // Guarda como 'mensual' en Firestore para mantener compatibilidad
        nombre: 'Plan Básico',
        precio: periodoPlanes === 'mensual' ? '$9.99/mes' : '$49.99/año',
        beneficios: [
          'Hasta 10 vacantes activas simultáneas',
          'Hasta 5 alianzas estratégicas con universidades',
          'Acceso completo a métricas básicas de postulantes',
          'Soporte estándar vía correo electrónico',
        ],
      },
      {
        id: 'premium', // Guarda como 'premium' en Firestore para mantener compatibilidad
        nombre: 'Plan Premium',
        precio: periodoPlanes === 'mensual' ? '$24.99/mes' : '$149.99/año',
        beneficios: [
          'Vacantes activas e históricas ILIMITADAS',
          'Alianzas con universidades ILIMITADAS',
          'Insignia de Empresa Verificada (Gold Star)',
          'Acceso prioritario a graduados destacados',
          'Soporte 24/7 con ejecutivo asignado',
        ],
      },
    ];
  };

  // ── Procesar mejora de plan (pago simulado) ────────────────────────
  // "Pago simulado" = no hay pasarela de cobro real: se confía en que la
  // empresa ya tiene una tarjeta guardada (ver handleGuardarTarjeta) y este
  // botón solo actualiza la BD como si el cobro hubiera ocurrido. Dos
  // escrituras: (1) el propio perfil con el nuevo plan y sus límites, (2) un
  // documento en 'transacciones' que alimenta el historial de suscripciones
  // que ve el admin (dashboard-admin / panel admin).
  const confirmarMejoraPlan = async () => {
    if (!planToUpgrade || !user) return;
    setUpgradeProcessing(true);
    try {
      // Determinamos si es un "upgrade" real (subir de nivel) en vez de solo
      // renovar el mismo plan, para decidir si mostrar el modal 4 de
      // bienvenida (con la lista de nuevos beneficios) al final de la cadena.
      const isUpgrade = (perfil?.plan === 'gratuito') || (perfil?.plan === 'mensual' && planToUpgrade === 'premium');

      // dataUpdates: los límites de negocio (cuántas vacantes/alianzas puede
      // tener) se recalculan aquí según el plan comprado — son los mismos
      // campos que inyecta el registro (ver project_planes_empresa en las
      // notas del proyecto) y que consumen puedeCrearVacante/limiteVacantes.
      const dataUpdates: any = { plan: planToUpgrade, cicloFacturacion: periodoPlanes, fechaUltimoPago: serverTimestamp() };
      if (planToUpgrade === 'mensual') {
        dataUpdates.limiteVacantes = 10;
        dataUpdates.limiteAlianzas = 5;
        dataUpdates.premium = false;
      } else if (planToUpgrade === 'premium') {
        dataUpdates.limiteVacantes = 9999;
        dataUpdates.limiteAlianzas = 9999;
        dataUpdates.premium = true;
        dataUpdates.verificado = true; // El plan Premium incluye insignia de verificado
      }

      // Actualizamos la BD
      await updateDoc(doc(db, 'perfiles_empresas', user.uid), dataUpdates);

      // Registramos el cobro para el historial de suscripciones del admin.
      await addDoc(collection(db, 'transacciones'), {
        tipo: 'suscripcion',
        creado_por: user.uid,
        empresa_id: user.uid,
        empresa_nombre: perfil?.nombre_empresa ?? '',
        plan: planToUpgrade,
        cicloFacturacion: periodoPlanes,
        monto: PRECIOS_PLAN[planToUpgrade][periodoPlanes],
        concepto: `Suscripción a Plan ${PLAN_DISPLAY[planToUpgrade].nombre} (${periodoPlanes})`,
        estado: 'completado',
        fecha: serverTimestamp(),
      });

      setShowConfirmUpgradeModal(false);
      setShowUpgradeSuccessModal(true);

      // Cadena de 4 modales (ver los <Modal> "MODAL 1/2/3/4" en el JSX de
      // abajo): selección de plan → confirmar compra → "¡Pago realizado!"
      // (este setTimeout) → si fue upgrade real, el modal 4 de bienvenida.
      setTimeout(() => {
        setShowUpgradeSuccessModal(false);
        setShowPlanUpgradeModal(false);
        if (isUpgrade) {
          setNewPlanInfo(planToUpgrade);
          setShowWelcomePlanModal(true);
          setSeccion('inicio'); // Recarga a la sección de inicio
        }
      }, 2500);

    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'No se pudo procesar el pago o actualizar el plan.');
    } finally {
      setUpgradeProcessing(false);
    }
  };

  // ── Renovación automática: switch que se guarda solo, sin botón de confirmar ──
  // Solo cambia una preferencia (no cobra nada): el cobro real ocurre en
  // handleRenovarPago, que la empresa dispara manualmente cada ciclo.
  const handleToggleRenovacionAutomatica = async (value: boolean) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'perfiles_empresas', user.uid), { renovacionAutomatica: value });
    } catch {
      Alert.alert('Error', 'No se pudo actualizar la renovación automática.');
    }
  };

  // ── Renovar el pago del ciclo actual ahora mismo (manual, no automático) ──
  // Mismo patrón "pago simulado" que confirmarMejoraPlan: solo registra la
  // transacción y actualiza fechaUltimoPago, sin cambiar el plan (ya lo tenía).
  const handleRenovarPago = async () => {
    if (!user || !perfil?.plan || perfil.plan === 'gratuito') return;
    const plan = perfil.plan as 'mensual' | 'premium';
    const ciclo = perfil.cicloFacturacion ?? 'mensual';
    const monto = PRECIOS_PLAN[plan][ciclo];
    setRenovandoPago(true);
    try {
      await addDoc(collection(db, 'transacciones'), {
        tipo: 'suscripcion',
        creado_por: user.uid,
        empresa_id: user.uid,
        empresa_nombre: perfil?.nombre_empresa ?? '',
        plan,
        cicloFacturacion: ciclo,
        monto,
        concepto: `Renovación de Plan ${PLAN_DISPLAY[plan].nombre} (${ciclo})`,
        estado: 'completado',
        fecha: serverTimestamp(),
      });
      await updateDoc(doc(db, 'perfiles_empresas', user.uid), { fechaUltimoPago: serverTimestamp() });
      Alert.alert(
        'Pago renovado ✓',
        `Se procesó tu renovación ${ciclo === 'mensual' ? 'de este mes' : 'de este año'} por $${monto.toFixed(2)}.`,
      );
    } catch {
      Alert.alert('Error', 'No se pudo procesar la renovación.');
    } finally {
      setRenovandoPago(false);
    }
  };

  // ── Estado local del componente ──────────────────────────────────
  // Bloque grande de useState: pestaña activa, datos en vivo (perfil,
  // vacantes, apps, solicitudesGrupo), qué modal está abierto, y todos los
  // campos del formulario "Nueva Vacante" (prefijo nv*) y de la tarjeta
  // (prefijo card*). Los comentarios en línea marcan solo lo no obvio.
  const [seccion,     setSeccion]     = useState<SeccionEmpresa>('inicio');
  // useAuthBackGuard(): controla el botón "atrás" del navegador para que
  // primero recorra las secciones internas visitadas (Inicio → Vacantes →
  // Mensajes → ...) y solo al final pregunte si desea cerrar sesión — con
  // el modal propio de abajo (showLogoutConfirm), no window.confirm.
  const { showLogoutConfirm, confirmLogout, cancelLogout } = useAuthBackGuard<SeccionEmpresa>({
    section: seccion,
    onSectionBack: setSeccion,
  });
  // Header superior simplificado en "Mensajes": solo desde tablet/web (no
  // en móvil angosto, donde el header normal sigue igual que siempre).
  const { width: anchoVentana } = useWindowDimensions();
  const headerChatSimplificado = seccion === 'mensajes' && anchoVentana > 768;
  const [mensajesNoLeidos, setMensajesNoLeidos] = useState(0);
  // Chat a abrir de inmediato dentro de la sección "Mensajes" embebida (p. ej.
  // al pulsar "Chatear con Candidato"), en vez de navegar a otra pantalla.
  const [chatAAbrir, setChatAAbrir] = useState<{ id: string; peerName: string } | null>(null);
  // ¿Hay un chat abierto AHORA dentro de la sección "Mensajes"? Mientras sea
  // así, ChatThread ya dibuja su propia píldora de notificaciones/idioma/
  // tema en la cabecera — mostrar también la de este dashboard la duplicaría.
  const [chatAbiertoEnMensajes, setChatAbiertoEnMensajes] = useState(false);
  const [perfil,      setPerfil]      = useState<PerfilEmpresa | null>(null);
  const [vacantes,    setVacantes]    = useState<Vacante[]>([]);
  const [apps,        setApps]        = useState<Aplicacion[]>([]);
  const [solicitudesGrupo, setSolicitudesGrupo] = useState<SolicitudGrupo[]>([]);
  const [vacanteSeleccionada, setVacanteSeleccionada] = useState<Vacante | null>(null);
  // Candidato elegido en la lista de "Detalles de Vacante" → abre su perfil
  // completo reutilizando el mismo visor que ya usa Historial de Pasantes.
  const [perfilCandidatoId, setPerfilCandidatoId] = useState<string | null>(null);

  // Modales
  const [showNuevaVacante,  setShowNuevaVacante]  = useState(false);
  /**
   * Vacante en edición. El MISMO modal sirve para crear y editar: duplicar el
   * formulario habría dejado dos definiciones de validación y payload que se
   * desincronizan a la primera. `null` = modo creación.
   */
  const [vacanteEditando, setVacanteEditando] = useState<Vacante | null>(null);
  const [showCardModal,     setShowCardModal]      = useState(false);
  const [showFirmaModal,    setShowFirmaModal]     = useState<Aplicacion | null>(null);
  const [firmaConfirmada,   setFirmaConfirmada]    = useState(false);
  // Horario de contratación (individual): se pide antes de mover a 'contratado'.
  const [horarioContratoApp, setHorarioContratoApp] = useState<Aplicacion | null>(null);

  // Formulario nueva vacante
  const [nvTitulo,   setNvTitulo]   = useState('');
  const [nvArea,     setNvArea]     = useState('');
  const [nvModalidad,setNvModalidad]= useState('');
  const [nvTipo,     setNvTipo]     = useState('');
  // Solo aplica cuando nvTipo === 'Vacante' (granularidad de empleo).
  const [nvModalidadContrato, setNvModalidadContrato] = useState('');
  const [nvDesc,     setNvDesc]     = useState('');
  const [nvSkills,   setNvSkills]   = useState('');
  const [nvFechaLim, setNvFechaLim] = useState('');
  const [nvCupos,    setNvCupos]    = useState('');
  // Horario declarado al publicar (ya no se negocia por chat en el caso normal).
  const [nvHorario,  setNvHorario]  = useState<Partial<HorarioPasantia>>({});
  // false = la empresa confirma cada reclamo de cupos (default: protege a la
  // empresa). true = las universidades reservan al instante.
  const [nvReclamosAuto, setNvReclamosAuto] = useState(false);
  // Rango salarial (opcional): solo se muestra/aplica a 'Vacante'. El pago de
  // una Pasantía se negocia por el acuerdo del chat (AcuerdoData), un mecanismo
  // aparte que no se toca aquí.
  const [nvSalarioMin, setNvSalarioMin] = useState('');
  const [nvSalarioMax, setNvSalarioMax] = useState('');
  // Roles concretos dentro del área (afinan el match; opcionales).
  const [nvTags, setNvTags] = useState<string[]>([]);
  // Campo dinámico cuando el área seleccionada es "Otra".
  const [nvAreaOtra, setNvAreaOtra] = useState('');
  // Errores de validación en tiempo real por campo ('' = válido).
  const [nvErrors, setNvErrors] = useState<Record<string, string>>({});

  // ── Mapa interactivo / ubicación de la vacante ──
  const [mapRegion, setMapRegion] = useState({ latitude: 13.6929, longitude: -89.2182, latitudeDelta: 0.0922, longitudeDelta: 0.0421 });
  const [markerPos, setMarkerPos] = useState<{ latitude: number; longitude: number } | null>(null);
  const [ubicacionDetalle, setUbicacionDetalle] = useState({ direccion: '', municipio: '', departamento: '', pais: '' });
  const [procesandoUbicacion, setProcesandoUbicacion] = useState(false);
  const [savingVac,  setSavingVac]  = useState(false);

  // Estado del modal dinámico (Liquid Glass) para el guardado de la vacante
  const [estadoGuardado, setEstadoGuardado] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [mensajeErrorGuardado, setMensajeErrorGuardado] = useState('');

  // Tarjeta (mismas reglas estrictas que el registro)
  const [cardNumero,  setCardNumero]  = useState('');
  const [cardExp,     setCardExp]     = useState('');
  const [cardCvv,     setCardCvv]     = useState('');
  const [cardTitular, setCardTitular] = useState('');
  const [cardErrs,    setCardErrs]    = useState<Record<string, string>>({});
  const [cardSaving,  setCardSaving]  = useState(false);
  // true = formulario para agregar/editar; false = vista de solo lectura de la
  // tarjeta ya registrada (con botón para pasar a edición). Ver abrirCardModal.
  const [cardEditing, setCardEditing] = useState(false);
  // Se activa cuando el modal de tarjeta se abrió porque la empresa intentó
  // mejorar su plan sin tener un método de pago registrado: al guardar la
  // tarjeta con éxito, retoma el flujo de mejora automáticamente.
  const [pendingUpgradeAfterCard, setPendingUpgradeAfterCard] = useState(false);

  // Detalle de plan
  const [showPlanDetail, setShowPlanDetail] = useState(false);

  // Estados para el flujo de facturación y planes
  const [showPlanUpgradeModal, setShowPlanUpgradeModal] = useState(false);
  // Plan que el usuario MARCÓ en la lista (solo selección visual). Es distinto
  // de `planToUpgrade`, que es el plan que ya entró al flujo de cobro: tocar
  // una tarjeta ahora solo selecciona, y la compra arranca con el botón
  // "Suscribirme a este plan" de abajo. Vive junto a `periodoPlanes`: la
  // selección se limpia al cambiar de Mensual a Anual, porque son planes
  // distintos (ver cambiarPeriodoPlanes).
  const [planSeleccionado, setPlanSeleccionado] = useState<'mensual' | 'premium' | null>(null);
  // Aviso de "todavía no registraste una tarjeta", que corta la suscripción
  // antes de empezar en vez de mandar al usuario al formulario sin explicar.
  const [avisoSinTarjeta, setAvisoSinTarjeta] = useState(false);
  const [planToUpgrade, setPlanToUpgrade] = useState<'mensual' | 'premium' | null>(null);
  const [showConfirmUpgradeModal, setShowConfirmUpgradeModal] = useState(false);
  const [upgradeProcessing, setUpgradeProcessing] = useState(false);
  const [showUpgradeSuccessModal, setShowUpgradeSuccessModal] = useState(false);
  const [showWelcomePlanModal, setShowWelcomePlanModal] = useState(false);
  const [newPlanInfo, setNewPlanInfo] = useState<'mensual' | 'premium' | null>(null);
  const [periodoPlanes, setPeriodoPlanes] = useState<'mensual' | 'anual'>('mensual');

  // El modal de planes siempre abre sin nada marcado: una selección de una
  // visita anterior no debe reaparecer como si el usuario acabara de elegirla.
  useEffect(() => {
    if (showPlanUpgradeModal) setPlanSeleccionado(null);
  }, [showPlanUpgradeModal]);

  // Cambio de pestaña Mensual/Anual dentro del modal de planes. "Básico
  // mensual" y "Básico anual" son suscripciones distintas (otro precio, otro
  // ciclo de cobro), así que la selección no se arrastra de una pestaña a la
  // otra: se limpia y el usuario vuelve a elegir con los precios del período
  // que está viendo.
  const cambiarPeriodoPlanes = (periodo: 'mensual' | 'anual') => {
    if (periodo === periodoPlanes) return;
    setPeriodoPlanes(periodo);
    setPlanSeleccionado(null);
  };

  // Botón "Suscribirme a este plan": el único punto desde el que arranca el
  // cobro. Si la empresa no tiene tarjeta registrada, NO empieza nada — abre
  // el aviso, y solo al aceptarlo se va al formulario de tarjeta.
  const iniciarSuscripcion = () => {
    if (!planSeleccionado) return;
    setPlanToUpgrade(planSeleccionado);
    if (!perfil?.tarjeta_numero) {
      setAvisoSinTarjeta(true);
      return;
    }
    setShowConfirmUpgradeModal(true);
  };

  const [renovandoPago, setRenovandoPago] = useState(false);

  // ── Vista detallada de un candidato (sección Reclutar / Kanban) ──
  const [candidatoSeleccionado, setCandidatoSeleccionado] = useState<any | null>(null);
  const [showRechazoModal, setShowRechazoModal] = useState(false);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [ratingEstudiante, setRatingEstudiante] = useState(0);

  // ── Firestore subscriptions ──────────────────────────────────────
  // Mismo patrón onSnapshot ya explicado en pasantiaService.ts/index.tsx:
  // useEffect abre el listener al montar (o al cambiar `user`) y el `return
  // unsub` lo cierra al desmontar — sin esto, el listener seguiría
  // escuchando en segundo plano y filtrando memoria/lecturas facturables.
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'perfiles_empresas', user.uid), snap => {
      if (snap.exists()) setPerfil(snap.data() as PerfilEmpresa);
    });
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
    const q = query(collection(db, 'vacantes'), where('empresa_id', '==', user.uid));
    const unsub = onSnapshot(q, snap => {
      setVacantes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Vacante)));
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'aplicaciones'), where('empresa_id', '==', user.uid));
    const unsub = onSnapshot(q, snap => {
      setApps(snap.docs.map(d => ({ id: d.id, ...d.data() } as Aplicacion)));
    });
    return unsub;
  }, [user]);

  // Pasantías de grupo (flujo Universidad↔Empresa) para la línea de tiempo.
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'solicitudes_practicas'), where('empresaId', '==', user.uid));
    const unsub = onSnapshot(
      q,
      snap => setSolicitudesGrupo(snap.docs.map(d => ({ id: d.id, ...d.data() } as SolicitudGrupo))),
      error => console.warn('Error en listener (solicitudes_practicas):', error),
    );
    return unsub;
  }, [user]);

  // Reparto de cupos (flujo alterno de pasantía) — necesario junto a
  // solicitudesGrupo/apps para saber CON QUIÉN trabajó esta empresa en los
  // 3 caminos posibles, al autoreportar el top de mejores estudiantes.
  const [asignacionesCupoEmpresa, setAsignacionesCupoEmpresa] = useState<{ id: string; estudianteId?: string; estado?: string }[]>([]);
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'asignaciones_cupo'), where('empresaId', '==', user.uid));
    const unsub = onSnapshot(
      q,
      snap => setAsignacionesCupoEmpresa(snap.docs.map(d => ({ id: d.id, ...d.data() } as any))),
      error => console.warn('Error en listener (asignaciones_cupo empresa):', error),
    );
    return unsub;
  }, [user]);

  // ── Autoreporta el promedio de calificaciones y el top 5 de mejores
  // estudiantes con los que ha trabajado — cubre los 3 caminos de admisión
  // (grupo completo, reparto de cupos, vacante individual) porque un
  // estudiante puede haber trabajado con esta empresa por cualquiera de
  // ellos. Mismo principio que el lado universidad: alimenta "Top Empresas/
  // Universidades" (RedGradlyBanner) y el perfil público sin que esos
  // lugares necesiten leer `solicitudes_practicas`/`asignaciones_cupo`/
  // `aplicaciones` de otras empresas (las reglas de Firestore solo dejan a
  // cada dueño leer lo suyo). Solo escribe si el valor cambió.
  const calificacionEmpresaReportadaRef = useRef<number | null | undefined>(undefined);
  const topEstudiantesEmpresaReportadoRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!user?.uid) return;
    const ids = new Set<string>();
    solicitudesGrupo.forEach(sg => {
      if (sg.estado !== 'aprobado' && sg.estado !== 'finalizado') return;
      (sg.estudianteIds ?? []).forEach(id => ids.add(id));
    });
    apps.forEach(a => {
      if (a.estado === 'contratado' && a.estudiante_id) ids.add(a.estudiante_id);
    });
    asignacionesCupoEmpresa.forEach(ac => {
      if ((ac.estado === 'tomado' || ac.estado === 'finalizado') && ac.estudianteId) ids.add(ac.estudianteId);
    });
    if (ids.size === 0) return;
    let cancel = false;
    (async () => {
      try {
        const idsArr = [...ids];
        const chunks: string[][] = [];
        for (let i = 0; i < idsArr.length; i += 30) chunks.push(idsArr.slice(i, i + 30));
        const snaps = await Promise.all(
          chunks.map(chunk =>
            getDocs(query(collection(db, 'perfiles_estudiantes'), where(documentId(), 'in', chunk))),
          ),
        );
        if (cancel) return;
        const vals: number[] = [];
        const candidatos: { uid: string; nombre: string; carrera: string; calificacion_promedio: number }[] = [];
        snaps.forEach(snap => snap.docs.forEach(d => {
          const data: any = d.data();
          const califs = Number(data.calificaciones_recibidas) || 0;
          if (califs > 0) {
            const prom = Number(data.calificacion_promedio) || 0;
            vals.push(prom);
            candidatos.push({
              uid: d.id,
              nombre: data.nombre_completo ?? 'Estudiante',
              carrera: data.carrera ?? '',
              calificacion_promedio: prom,
            });
          }
        }));
        const promedio = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        if (calificacionEmpresaReportadaRef.current !== promedio) {
          calificacionEmpresaReportadaRef.current = promedio;
          await updateDoc(doc(db, 'perfiles_empresas', user.uid), {
            calificacion_estudiantes_promedio: promedio,
          });
        }

        const top5 = candidatos
          .sort((a, b) => b.calificacion_promedio - a.calificacion_promedio)
          .slice(0, 5);
        const top5Key = JSON.stringify(top5);
        if (topEstudiantesEmpresaReportadoRef.current !== top5Key) {
          topEstudiantesEmpresaReportadoRef.current = top5Key;
          await updateDoc(doc(db, 'perfiles_empresas', user.uid), {
            top_estudiantes: top5,
          });
        }
      } catch {
        /* no crítico: se reintenta en el próximo cambio real de las fuentes */
      }
    })();
    return () => { cancel = true; };
  }, [user?.uid, solicitudesGrupo, apps, asignacionesCupoEmpresa]);

  // Horas certificadas (`perfiles_estudiantes.horas_aprobadas`, el mismo campo
  // que incrementa `certificarPasantia`) de los estudiantes de cada grupo con
  // pasantía aprobada/finalizada con esta empresa. El perfil del estudiante NO
  // referencia a la empresa directamente (solo a `grupo_id`), así que se abre
  // UN listener por grupo relevante — se derivan como una clave estable
  // (join de ids ordenados) para no destruir/recrear los listeners en cada
  // cambio de campo ajeno de `solicitudesGrupo`.
  const gruposConPasantiaKey = useMemo(() => {
    const ids = Array.from(
      new Set(
        solicitudesGrupo
          .filter(sg => (sg.estado === 'aprobado' || sg.estado === 'finalizado') && sg.grupoId)
          .map(sg => sg.grupoId as string),
      ),
    );
    return ids.sort().join(',');
  }, [solicitudesGrupo]);

  const [horasPorGrupo, setHorasPorGrupo] = useState<Record<string, number>>({});
  useEffect(() => {
    const grupoIds = gruposConPasantiaKey ? gruposConPasantiaKey.split(',') : [];
    const unsubs = grupoIds.map(grupoId =>
      onSnapshot(
        query(collection(db, 'perfiles_estudiantes'), where('grupo_id', '==', grupoId)),
        snap => {
          const total = snap.docs.reduce((acc, d) => acc + ((d.data() as any).horas_aprobadas ?? 0), 0);
          setHorasPorGrupo(prev => ({ ...prev, [grupoId]: total }));
        },
        error => console.warn('Error en listener (horas de grupo):', error),
      ),
    );
    return () => unsubs.forEach(u => u());
  }, [gruposConPasantiaKey]);

  // ── Métricas ─────────────────────────────────────────────────────
  // Números resumen que alimentan SeccionInicio y el badge del Kanban.
  // useMemo: se recalculan solo cuando cambian los datos de origen, no en
  // cada render (los mismos 4 useEffect de arriba son quienes empujan esos
  // cambios al llegar datos nuevos de Firestore).
  const metricas = useMemo(() => ({
    vacantesActivas: vacantes.filter(v => v.activa).length,
    pendientes:      apps.filter(a => a.estado === 'pendiente').length,
    // "Pasantes activos": headcount actual, sumando el flujo individual legado
    // (aplicaciones 'contratado') + estudiantes de grupos con pasantía
    // aprobada (acuerdo firmado, aún sin finalizar) — mismo criterio de estado
    // que usa la universidad para "En pasantía".
    activos:
      apps.filter(a => a.estado === 'contratado').length +
      solicitudesGrupo
        .filter(sg => sg.estado === 'aprobado')
        .reduce((acc, sg) => acc + (sg.alumnos?.length ?? 0), 0),
    // "Horas validadas": horas del flujo individual (`aplicaciones.horas_completadas`)
    // + horas certificadas de los estudiantes de grupo (ver `horasPorGrupo` arriba).
    horasValidadas:
      apps.reduce((acc, a) => acc + (a.horas_completadas ?? 0), 0) +
      Object.values(horasPorGrupo).reduce((acc, h) => acc + h, 0),
  }), [vacantes, apps, solicitudesGrupo, horasPorGrupo]);

  // ── Límite de vacantes según el plan ─────────────────────────────
  const limiteVacantes   = perfil?.limiteVacantes ?? 2;
  const vacantesRestantes = Math.max(0, limiteVacantes - metricas.vacantesActivas);
  const puedeCrearVacante = vacantesRestantes > 0;

  // ── Mapa de ubicación de la vacante ──────────────────────────────
  // Mismo mecanismo de geolocalización que usa el registro (expo-location +
  // Nominatim/OpenStreetMap para geocodificación inversa gratuita, sin API
  // key): capturarUbicacion() pide el GPS del dispositivo, marcarDesdeMapa()
  // toma un toque directo en el mapa, y ambos delegan en este punto único
  // que fija el marcador y resuelve la dirección legible.
  //
  // ── Punto único de aplicación de coordenadas (precedencia: la última acción manda) ─
  // Los métodos (GPS, toque en mapa) llaman aquí y sobreescriben los estados compartidos.
  // Geocodificación inversa gratuita vía Nominatim (OpenStreetMap), sin API key.
  const aplicarCoordenadas = async (lat: number, lng: number) => {
    // 1) Sincronización visual inmediata: pin + región enfocada.
    setMarkerPos({ latitude: lat, longitude: lng });
    setMapRegion(prev => ({ ...prev, latitude: lat, longitude: lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }));
    setProcesandoUbicacion(true);

    try {
      // En web el navegador prohíbe modificar 'User-Agent' (provoca error CORS),
      // así que solo lo enviamos en móvil. En web basta con el idioma.
      const headersPeticion: Record<string, string> = Platform.OS === 'web'
        ? { 'Accept-Language': 'es' }
        : { 'User-Agent': 'MiAppExpo/1.0', 'Accept-Language': 'es' };

      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
        { headers: headersPeticion }
      );
      const data = await response.json();

      if (data && data.address) {
        // Aviso NO destructivo: si Nominatim devuelve explícitamente otro país,
        // avisamos pero conservamos las coordenadas (nunca borramos markerPos).
        // Si no trae country_code (respuesta parcial / límite de peticiones),
        // asumimos válida para no perder el punto marcado.
        if (data.address.country_code && data.address.country_code !== 'sv') {
          Alert.alert('Atención', 'La ubicación marcada parece estar fuera de El Salvador. Verifica el punto antes de publicar.');
        }
        setUbicacionDetalle({
          direccion: data.display_name || '',
          municipio: data.address.city || data.address.town || data.address.village || data.address.municipality || '',
          departamento: data.address.state || '',
          pais: data.address.country || 'El Salvador'
        });
      } else {
        // Geocodificación sin detalle: conservamos las coordenadas (markerPos ya
        // quedó fijado) y mostramos un texto neutro, sin exponer lat/lng en la UI.
        setUbicacionDetalle({
          direccion: 'Ubicación seleccionada',
          municipio: '',
          departamento: '',
          pais: 'El Salvador',
        });
      }
    } catch (error) {
      console.error("Error Nominatim:", error);
      // La geocodificación es solo informativa: si falla, conservamos las
      // coordenadas (markerPos ya quedó fijado) sin exponer lat/lng en la UI.
      setUbicacionDetalle({
        direccion: 'Ubicación seleccionada',
        municipio: '',
        departamento: '',
        pais: 'El Salvador',
      });
    } finally {
      setProcesandoUbicacion(false);
    }
  };

  // ── Método A: capturar ubicación GPS actual (web + móvil) ───────
  const capturarUbicacion = async () => {
    try {
      setProcesandoUbicacion(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permisos', 'Necesitamos acceso a la ubicación.');
        setProcesandoUbicacion(false);
        return;
      }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      // Delegamos en el punto único: fija pin, reenfoca el mapa y resuelve el detalle.
      await aplicarCoordenadas(location.coords.latitude, location.coords.longitude);
    } catch (error: any) {
      Alert.alert('Error de Mapa', error?.message || 'No se pudo obtener la ubicación.');
      setProcesandoUbicacion(false);
    }
  };

  // ── Método B: toque directo en el mapa ──────────────────────────
  const marcarDesdeMapa = (coord: { latitude: number; longitude: number }) => {
    aplicarCoordenadas(coord.latitude, coord.longitude);
  };

  // ── Validación en tiempo real (onChange por campo) ───────────────
  // setErr: helper que actualiza UN campo de nvErrors sin pisar los demás
  // (spread del objeto previo). Cada onChangeX de abajo llama a su validador
  // puro (definidos arriba, antes del componente) en cada tecleo.
  const setErr = (key: string, msg: string) => setNvErrors(prev => ({ ...prev, [key]: msg }));

  const onChangeTitulo   = (v: string) => { setNvTitulo(v);   setErr('titulo', valTitulo(v)); };
  const onChangeDesc     = (v: string) => { setNvDesc(v);     setErr('desc', valDesc(v)); };
  const onChangeSkills   = (v: string) => { setNvSkills(v);   setErr('skills', valSkills(v)); };
  const onChangeAreaOtra = (v: string) => { setNvAreaOtra(v); setErr('areaOtra', valAreaOtra(v)); };

  // Fecha: auto-formato YYYY-MM-DD mientras escribe.
  const onChangeFecha    = (raw: string) => {
    const f = formatFecha(raw);
    setNvFechaLim(f);
    const orig = vacanteEditando && typeof vacanteEditando.fecha_limite === 'string'
      ? vacanteEditando.fecha_limite : undefined;
    setErr('fecha', valFecha(f, orig));
  };

  // Cupos: solo dígitos (descarta cualquier otro carácter mientras escribe).
  const onChangeCupos    = (raw: string) => {
    const v = raw.replace(/\D/g, '').slice(0, 3);
    setNvCupos(v);
    // El mínimo cambia al editar: no se puede bajar de los cupos ya
    // comprometidos. Se pasa aquí también para que el error salga al escribir,
    // no solo al pulsar Guardar.
    setErr('cupos', valCupos(v, vacanteEditando ? cuposOcupados(vacanteEditando) : 0));
  };

  // Salario: solo dígitos, ambos extremos opcionales (rango abierto permitido).
  const onChangeSalarioMin = (raw: string) => {
    const v = raw.replace(/\D/g, '').slice(0, 6);
    setNvSalarioMin(v);
    setErr('salario', valSalario(v, nvSalarioMax));
  };
  const onChangeSalarioMax = (raw: string) => {
    const v = raw.replace(/\D/g, '').slice(0, 6);
    setNvSalarioMax(v);
    setErr('salario', valSalario(nvSalarioMin, v));
  };

  // Selecciones (chips): limpian su error; al cambiar de "Otra" se resetea el sub-campo.
  const onSelectArea = (v: string) => {
    setNvArea(v);
    setNvTags([]); // los roles dependen del área: cambiar de área los invalida
    setNvErrors(prev => ({
      ...prev,
      area: v ? '' : 'Selecciona un área.',
      ...(v !== 'Otra' ? { areaOtra: '' } : {}),
    }));
    if (v !== 'Otra') setNvAreaOtra('');
  };
  const onSelectModalidad = (v: string) => { setNvModalidad(v); setErr('modalidad', ''); };
  const onSelectTipo      = (v: string) => { setNvTipo(v);      setErr('tipo', ''); };
  const onSelectModalidadContrato = (v: string) => {
    setNvModalidadContrato(v);
    setNvErrors(prev => ({
      ...prev,
      modalidadContrato: v ? '' : 'Selecciona la modalidad de contrato.',
      // El horario cambia de obligatorio a opcional (o viceversa) según la
      // modalidad elegida: se recalcula aquí para que el error no quede rancio.
      horario: valHorarioCondicional(nvHorario, !(v === 'Por proyecto')),
    }));
  };

  /**
   * Cupos ya comprometidos de la vacante en edición (reservados por
   * universidades + contratados). Es el piso al que puede bajar el total sin
   * dejar reservas sin respaldo. 0 al crear.
   */
  const cuposComprometidos = vacanteEditando ? cuposOcupados(vacanteEditando) : 0;

  /** Fecha límite que ya tenía la vacante en edición (se acepta sin cambios). */
  const fechaLimiteOriginal =
    vacanteEditando && typeof vacanteEditando.fecha_limite === 'string'
      ? vacanteEditando.fecha_limite
      : undefined;

  /**
   * Cambiar el Tipo entre "Pasantía" y el resto cambia la `categoria`, y con
   * ella el carril: las de `pasantia` viven en el matchmaking universidad↔
   * empresa y las de `vacante` en el feed individual. Si la publicación ya
   * tiene cupos comprometidos, ese salto la sacaría de la vista donde las
   * universidades siguen sus reservas — quedarían huérfanas. Se bloquea.
   */
  const categoriaActual = vacanteEditando
    ? (vacanteEditando.categoria ?? (vacanteEditando.tipo === 'Pasantía' ? 'pasantia' : 'vacante'))
    : null;
  const categoriaNueva = nvTipo === 'Pasantía' ? 'pasantia' : 'vacante';
  const cambioDeCarrilBloqueado =
    !!vacanteEditando && cuposComprometidos > 0 && !!nvTipo && categoriaActual !== categoriaNueva;

  /**
   * El horario es obligatorio salvo en Vacante + "Por proyecto" (ver
   * `valHorarioCondicional`). Un trabajo por entregables no siempre tiene
   * horario semanal fijo; el resto de modalidades sí lo requieren.
   */
  const horarioRequerido = !(nvTipo === 'Vacante' && nvModalidadContrato === 'Por proyecto');

  // Validez global del formulario (recalcula sobre los valores actuales, no sobre
  // nvErrors, para cubrir también los campos que el usuario aún no ha tocado).
  // Se usa para atenuar/deshabilitar el botón Publicar (sin alerts).
  const formularioValido = useMemo(() => {
    if (valTitulo(nvTitulo)) return false;
    if (!nvArea) return false;
    if (nvArea === 'Otra' && valAreaOtra(nvAreaOtra)) return false;
    if (!nvModalidad) return false;
    if (!nvTipo) return false;
    if (nvTipo === 'Vacante' && valModalidadContrato(nvModalidadContrato)) return false;
    if (valDesc(nvDesc)) return false;
    if (valSkills(nvSkills)) return false;
    if (valFecha(nvFechaLim, fechaLimiteOriginal)) return false;
    if (valCupos(nvCupos, cuposComprometidos)) return false;
    if (valHorarioCondicional(nvHorario, horarioRequerido)) return false;
    if (valSalario(nvSalarioMin, nvSalarioMax)) return false;
    if (cambioDeCarrilBloqueado) return false;
    // Ubicación obligatoria para Presencial / Híbrido (mapa o GPS).
    if ((nvModalidad === 'Presencial' || nvModalidad === 'Híbrido') && !markerPos) return false;
    return true;
  }, [
    nvTitulo, nvArea, nvAreaOtra, nvModalidad, nvTipo, nvModalidadContrato, nvDesc, nvSkills,
    nvFechaLim, nvCupos, nvHorario, nvSalarioMin, nvSalarioMax, markerPos, cuposComprometidos,
    fechaLimiteOriginal, cambioDeCarrilBloqueado, horarioRequerido,
  ]);

  // ── Eliminar una vacante ──────────────────────────────────────────
  // NOTA (gotcha ya visto en otros archivos): Alert.alert con botones NO
  // dispara ninguna acción en react-native-web (es un no-op silencioso ahí)
  // — solo funciona en móvil nativo. Este botón concreto, al vivir dentro de
  // SeccionVacantes (ícono de basura en cada fila), heredó ese patrón del
  // código original; a diferencia de otros flujos ya migrados a un <Modal>
  // propio en la app, este todavía usa Alert.alert de dos botones. La lógica
  // real de borrado vive en eliminarVacante() (pasantiaService.ts).
  const handleEliminarVacante = (v: Vacante) => {
    Alert.alert(
      'Eliminar vacante',
      `¿Eliminar "${v.titulo}"? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await eliminarVacante(v.id, user!.uid);
            } catch (e: any) {
              Alert.alert('No se pudo eliminar', e?.message ?? 'Intenta de nuevo.');
            }
          },
        },
      ],
    );
  };

  // ── Abrir el formulario en modo EDICIÓN (precarga desde la vacante) ──
  // Toma un documento `Vacante` ya guardado y llena TODOS los useState del
  // formulario nv* con sus valores — el mismo modal de abajo ("Nueva
  // Vacante") sirve para crear y editar según si `vacanteEditando` es null.
  //
  // La parte no trivial es la MIGRACIÓN de datos legados: el campo `tipo`
  // solía aceptar texto libre ('Pasantía'/'Proyecto'/'Tiempo parcial'), y
  // 'Proyecto'/'Tiempo parcial' colapsaban silenciosamente a
  // categoria:'vacante'. Ahora el formulario solo ofrece 'Pasantía'/
  // 'Vacante' + una "Modalidad de contrato" aparte. Para que abrir una
  // vacante VIEJA en edición no muestre el formulario vacío/roto, se
  // reconstruye qué habría elegido el usuario hoy a partir de `categoria`
  // (fuente de verdad real) y del `tipo` histórico.
  const abrirEditarVacante = (v: Vacante) => {
    setVacanteEditando(v);
    setNvTitulo(v.titulo ?? '');
    // Si el área guardada no está en el catálogo (vacante vieja o texto libre),
    // se muestra como "Otra" + el valor original, para no perderlo al guardar.
    const areaConocida = AREAS.includes(v.area as any);
    setNvArea(areaConocida ? (v.area ?? '') : 'Otra');
    setNvAreaOtra(areaConocida ? '' : (v.area ?? ''));
    setNvModalidad(v.modalidad ?? '');

    // Migración de vacantes legadas: el Tipo tenía 3 valores libres
    // ('Pasantía'/'Proyecto'/'Tiempo parcial') y las 2 últimas colapsaban a
    // categoria:'vacante'. Se reconstruye desde `categoria` (la fuente real de
    // verdad) para que una publicación vieja no aparezca sin nada seleccionado.
    const tipoLegacy = v.tipo ?? '';
    const esPasantiaLegacy = v.categoria === 'pasantia' || (!v.categoria && tipoLegacy === 'Pasantía');
    const tipoNuevo = esPasantiaLegacy ? 'Pasantía' : 'Vacante';
    setNvTipo(tipoNuevo);

    // La granularidad que antes vivía en Tipo ('Proyecto'→Por proyecto,
    // 'Tiempo parcial'→Medio tiempo) se traslada a Modalidad de contrato para
    // no perder el dato al editar una publicación antigua.
    const modalidadContratoGuardada = (v as any).modalidad_contrato ?? '';
    const modalidadContratoDerivada =
      modalidadContratoGuardada ||
      (tipoNuevo === 'Vacante'
        ? tipoLegacy === 'Proyecto'
          ? 'Por proyecto'
          : tipoLegacy === 'Tiempo parcial'
            ? 'Medio tiempo'
            : tipoLegacy === 'Tiempo completo'
              ? 'Tiempo completo'
              : ''
        : '');
    // Si la opción derivada ya no está en el catálogo vigente (p. ej. "Por
    // proyecto" se quitó temporalmente), no se preselecciona nada en vez de
    // dejar un botón "elegido" que en realidad no existe en la lista.
    setNvModalidadContrato(
      MODALIDADES_CONTRATO.includes(modalidadContratoDerivada) ? modalidadContratoDerivada : '',
    );

    setNvDesc(v.descripcion ?? '');
    setNvSkills((v.skills_requeridas ?? []).join(', '));
    setNvFechaLim(typeof v.fecha_limite === 'string' ? v.fecha_limite : '');
    setNvCupos(cuposTotales(v) != null ? String(cuposTotales(v)) : '');
    setNvHorario(normalizarHorario(v.horario) ?? {});
    setNvReclamosAuto(v.reclamos_auto === true);
    setNvSalarioMin((v as any).salario_min != null ? String((v as any).salario_min) : '');
    setNvSalarioMax((v as any).salario_max != null ? String((v as any).salario_max) : '');
    setNvTags(v.tags ?? []);
    setNvErrors({});
    setMarkerPos(
      v.ubicacion_coords
        ? { latitude: v.ubicacion_coords.latitude, longitude: v.ubicacion_coords.longitude }
        : null,
    );
    setUbicacionDetalle({
      direccion:    v.ubicacion_texto?.direccion ?? '',
      municipio:    v.ubicacion_texto?.municipio ?? '',
      departamento: v.ubicacion_texto?.departamento ?? '',
      pais:         v.ubicacion_texto?.pais ?? '',
    });
    setShowNuevaVacante(true);
  };

  // ── Publicar vacante ─────────────────────────────────────────────
  // Handler más largo del archivo: valida TODO el formulario de una vez
  // (aunque cada campo ya se valida al teclear), arma el payload para
  // Firestore, y bifurca entre CREAR (addDoc en 'vacantes') y EDITAR
  // (updateDoc del documento existente) según `vacanteEditando`.
  const handlePublicarVacante = async () => {
    // El límite del plan solo aplica al CREAR: editar no consume cupo nuevo.
    if (!vacanteEditando && !puedeCrearVacante) {
      Alert.alert(
        'Límite alcanzado',
        `Tu plan permite ${limiteVacantes} vacantes activas. Pausa una vacante o mejora tu plan para publicar más.`,
      );
      return;
    }
    // ── Validación maestra: recalcula TODOS los campos y aborta si hay errores ──
    const errs: Record<string, string> = {
      titulo:    valTitulo(nvTitulo),
      area:      nvArea ? '' : 'Selecciona un área.',
      modalidad: nvModalidad ? '' : 'Selecciona una modalidad.',
      tipo:      nvTipo ? '' : 'Selecciona un tipo.',
      desc:      valDesc(nvDesc),
      skills:    valSkills(nvSkills),
      fecha:     valFecha(nvFechaLim, fechaLimiteOriginal),
      cupos:     valCupos(nvCupos, cuposComprometidos),
      horario:   valHorarioCondicional(nvHorario, horarioRequerido),
      salario:   valSalario(nvSalarioMin, nvSalarioMax),
    };
    if (nvArea === 'Otra') errs.areaOtra = valAreaOtra(nvAreaOtra);
    if (nvTipo === 'Vacante') errs.modalidadContrato = valModalidadContrato(nvModalidadContrato);

    if (cambioDeCarrilBloqueado) {
      Alert.alert(
        'No puedes cambiar el tipo',
        `Esta publicación ya tiene ${cuposComprometidos} cupo(s) comprometido(s). ` +
        'Cambiar entre "Pasantía" y otro tipo la movería de sección y dejaría esas ' +
        'reservas sin seguimiento. Crea una publicación nueva si necesitas el otro tipo.',
      );
      return;
    }

    setNvErrors(errs);
    if (Object.values(errs).some(Boolean)) {
      Alert.alert('Revisa el formulario', 'Hay campos con errores o vacíos. Corrige los campos marcados en rojo.');
      return;
    }

    // Ubicación obligatoria para plazas Presencial / Híbrido
    // (válida tanto por toque en el mapa como por "Capturar mi Ubicación Actual").
    if ((nvModalidad === 'Presencial' || nvModalidad === 'Híbrido') && !markerPos) {
      Alert.alert('Ubicación requerida', 'Marca la ubicación de la plaza en el mapa o usa "Capturar mi Ubicación Actual".');
      return;
    }

    // FIXED: activamos el modal dinámico PRIMERO (esto oculta el modal de vacante por el Fix 2),
    //        y solo después marcamos savingVac para el indicador del botón.
    setEstadoGuardado('loading');
    setSavingVac(true);
    try {
      const nombre = perfil?.nombre_empresa ?? (userProfile as any)?.nombre_completo ?? '';

      // Construcción del objeto estrictamente limpio (Firestore bloquea valores undefined).
      const payloadVacante: Record<string, any> = {
        empresa_id:         user!.uid,
        nombre_empresa:     nombre,
        logo_empresa_url:   perfil?.logo_url || (user as any)?.photoURL || '',
        titulo:             nvTitulo.trim(),
        descripcion:        nvDesc.trim(),
        // Categoría derivada del Tipo: 'Pasantía' enruta por matchmaking
        // universidad↔empresa; el resto queda como vacante individual
        // (graduados). Ver estudianteHabilitadoParaVacantes / VacantesDisponibles.
        categoria:          nvTipo === 'Pasantía' ? 'pasantia' : 'vacante',
        modalidad:          nvModalidad,
        tipo:               nvTipo,
        // Granularidad de empleo: solo tiene sentido en 'Vacante' (la
        // Pasantía ya la expresa con precisión vía el horario declarado).
        modalidad_contrato: nvTipo === 'Vacante' ? nvModalidadContrato : undefined,
        area:               nvArea === 'Otra' ? nvAreaOtra.trim() : nvArea,
        skills_requeridas:  nvSkills.split(',').map(s => s.trim()).filter(Boolean),
        fecha_publicacion:  serverTimestamp(),
        fecha_creacion:     serverTimestamp(),
        fecha_limite:       nvFechaLim || null,
        activa:             true,
        aplicantes_count:   0,
        contratados_count:  0,
        // Cupos que la empresa ofrece; `cupos_reclamados` lo moverán las
        // universidades al reclamar por lote (ver src/utils/cupos.ts).
        tags:               nvTags,
        cupos:              Number(nvCupos.trim()),
        cupos_reclamados:   0,
        // Horario declarado: misma forma que el `AcuerdoData` del chat, para
        // que ambos caminos sean intercambiables al calcular horas/compatibilidad.
        horario:            normalizarHorario(nvHorario),
        // El reclamo por lote es exclusivo del carril de Pasantía: en
        // 'Vacante' nunca aparece en `VacantesDisponibles` (la universidad no
        // lo ve), así que el interruptor sería un control muerto. Se omite
        // por completo en vez de guardarlo en falso.
        reclamos_auto:      nvTipo === 'Pasantía' ? nvReclamosAuto : undefined,
        // Rango salarial (opcional, solo 'Vacante'). Informativo: la
        // negociación final ocurre fuera de Gradly (ver nota en el formulario).
        salario_min:        nvTipo === 'Vacante' && nvSalarioMin.trim() ? Number(nvSalarioMin.trim()) : undefined,
        salario_max:        nvTipo === 'Vacante' && nvSalarioMax.trim() ? Number(nvSalarioMax.trim()) : undefined,
        ubicacion_coords:   markerPos ? { latitude: markerPos.latitude, longitude: markerPos.longitude } : null,
        ubicacion_texto:    markerPos ? {
          direccion:    ubicacionDetalle.direccion || '',
          municipio:    ubicacionDetalle.municipio || '',
          departamento: ubicacionDetalle.departamento || '',
          pais:         ubicacionDetalle.pais || '',
        } : null,
      };

      // Sanitización extrema: elimina cualquier campo undefined que reviente el addDoc.
      Object.keys(payloadVacante).forEach(key => {
        if (payloadVacante[key] === undefined) delete payloadVacante[key];
      });

      if (vacanteEditando) {
        // ── EDICIÓN ──────────────────────────────────────────────────
        // Se descartan los campos que NO deben reescribirse al editar: los
        // contadores viven su propia vida (las universidades mueven
        // `cupos_reclamados`, contratar mueve `contratados_count`) y
        // sobrescribirlos con 0 borraría reservas y contrataciones reales.
        const NO_EDITABLES = [
          'aplicantes_count', 'contratados_count', 'cupos_reclamados',
          'fecha_publicacion', 'fecha_creacion', 'activa', 'empresa_id',
        ];
        const cambios: Record<string, any> = { ...payloadVacante };
        NO_EDITABLES.forEach(k => delete cambios[k]);

        // Campos opcionales que pueden pasar de "con valor" a "ya no aplica"
        // (p. ej. cambiar de 'Vacante' a 'Pasantía', o borrar el salario que
        // antes se había puesto). La sanitización de arriba los quitó de
        // `cambios` por venir `undefined` — sin este paso quedarían huérfanos
        // en el documento en vez de desaparecer de verdad.
        const OPCIONALES_BORRABLES = ['modalidad_contrato', 'salario_min', 'salario_max', 'reclamos_auto'];
        OPCIONALES_BORRABLES.forEach(k => {
          if (!(k in cambios)) cambios[k] = deleteField();
        });

        cambios.fecha_modificacion = serverTimestamp();

        await updateDoc(doc(db, 'vacantes', vacanteEditando.id), cambios);
        try {
          await enviarNotificacion(
            user?.uid ?? '',
            'Vacante actualizada',
            `Los cambios en "${payloadVacante.titulo ?? ''}" se guardaron correctamente.`,
            'success',
            `vacante:${vacanteEditando.id}`,
          );
        } catch { /* la notificación no debe afectar el flujo principal */ }
      } else {
        // ── CREACIÓN ─────────────────────────────────────────────────
        const vacanteRef = await addDoc(collection(db, 'vacantes'), payloadVacante);
        // Confirmación a la empresa (no bloquea el guardado de la vacante).
        try {
          await enviarNotificacion(
            user?.uid ?? '',
            'Vacante publicada',
            `Tu vacante "${payloadVacante.titulo ?? ''}" se publicó correctamente y ya es visible para el talento.`,
            'success',
            `vacante:${vacanteRef.id}`,
          );
        } catch { /* la notificación no debe afectar el flujo principal */ }
      }
      // Éxito: mostramos el modal dinámico. El cierre/limpieza ocurre al aceptar
      // (botón "Aceptar y Cerrar") o por el auto-cierre programado.
      setEstadoGuardado('success');
    } catch (error: any) {
      console.error('Error BD Vacante:', error);
      setMensajeErrorGuardado(error?.message || 'Ocurrió un problema inesperado.');
      setEstadoGuardado('error');
    }
    finally { setSavingVac(false); }
  };

  // Cierra el modal de "Nueva vacante" y resetea TODOS los campos nv* a su
  // valor inicial (mismo bloque de resets que el useEffect de abajo, para
  // el botón "Aceptar y Cerrar" del modal de éxito).
  const finalizarGuardadoExitoso = () => {
    setEstadoGuardado('idle');
    setShowNuevaVacante(false);
    setNvTitulo(''); setNvArea(''); setNvModalidad(''); setNvTipo('');
    setNvModalidadContrato('');
    setNvDesc(''); setNvSkills(''); setNvFechaLim(''); setNvCupos(''); setNvHorario({});
    setNvReclamosAuto(false); setNvSalarioMin(''); setNvSalarioMax('');
    setNvTags([]); setVacanteEditando(null);
    setNvAreaOtra(''); setNvErrors({});
    setMarkerPos(null);
    setUbicacionDetalle({ direccion: '', municipio: '', departamento: '', pais: '' });
  };

  // Auto-cierre de los modales de mensaje final (éxito/error) tras mostrarse.
  // FIXED: inline la lógica de limpieza para evitar closure stale sobre
  //        finalizarGuardadoExitoso (que no estaba en las dependencias del efecto).
  useEffect(() => {
    if (estadoGuardado === 'success') {
      const t = setTimeout(() => {
        // Mismo cuerpo que finalizarGuardadoExitoso, pero capturado correctamente.
        // (Este bloque había quedado desactualizado: no reseteaba cupos/horario/
        // tags/reclamosAuto desde que se añadieron esas fases — corregido aquí.)
        setEstadoGuardado('idle');
        setShowNuevaVacante(false);
        setNvTitulo(''); setNvArea(''); setNvModalidad(''); setNvTipo('');
        setNvModalidadContrato('');
        setNvDesc(''); setNvSkills(''); setNvFechaLim(''); setNvCupos(''); setNvHorario({});
        setNvReclamosAuto(false); setNvSalarioMin(''); setNvSalarioMax('');
        setNvTags([]); setVacanteEditando(null);
        setNvAreaOtra(''); setNvErrors({});
        setMarkerPos(null);
        setUbicacionDetalle({ direccion: '', municipio: '', departamento: '', pais: '' });
      }, 2500);
      return () => clearTimeout(t);
    }
    if (estadoGuardado === 'error') {
      const t = setTimeout(() => setEstadoGuardado('idle'), 4000);
      return () => clearTimeout(t);
    }
  }, [estadoGuardado]);

  // ── Toggle vacante activa ─────────────────────────────────────────
  // Pausar/reactivar una vacante sin borrarla: un updateDoc de un solo
  // campo. `!v.activa` invierte el valor actual (true→false, false→true).
  const toggleVacante = async (v: Vacante) => {
    try {
      await updateDoc(doc(db, 'vacantes', v.id), { activa: !v.activa });
    } catch { Alert.alert('Error', 'No se pudo actualizar.'); }
  };

  // ── Mover Kanban (usa cambiarEstadoAplicacion del servicio) ──────
  // Contratar exige antes definir el horario (ver ProponerHorarioModal, sin
  // sección de pago): el modal de horario hace de confirmación.
  const moverEstado = async (app: Aplicacion, nuevoEstado: string) => {
    if (nuevoEstado === 'contratado') {
      setHorarioContratoApp(app);
      return;
    }
    try {
      await cambiarEstadoAplicacion(app.id, nuevoEstado);
    } catch { Alert.alert('Error', 'No se pudo actualizar.'); }
  };

  // ── Confirmar contratación con el horario acordado ────────────────
  const confirmarContratacion = async (acuerdo: AcuerdoData) => {
    if (!horarioContratoApp) return;
    try {
      await cambiarEstadoAplicacion(
        horarioContratoApp.id,
        'contratado',
        horarioContratoApp.vacante_id,
        undefined,
        undefined,
        acuerdo,
      );
      setHorarioContratoApp(null);
    } catch {
      Alert.alert('Error', 'No se pudo confirmar la contratación.');
    }
  };

  // ── Acciones sobre un candidato (vista detallada del Kanban) ──────
  // Estos 5 handlers (entrevista/rechazar/calificar/CV/chatear) trabajan
  // sobre `candidatoSeleccionado`, el objeto que abre el modal "VISTA
  // DETALLADA DEL CANDIDATO" más abajo en el JSX. Cada uno hace un
  // updateDoc/addDoc directo (no pasan por pasantiaService.ts porque son
  // acciones simples de un solo documento, sin transacción).
  const handleMandarEntrevista = async () => {
    if (!candidatoSeleccionado) return;
    try {
      await updateDoc(doc(db, 'aplicaciones', candidatoSeleccionado.id), { estado: 'entrevista' });
      // Notificar al estudiante
      await addDoc(collection(db, 'notificaciones_app'), {
        destinatario_id: candidatoSeleccionado.estudiante_id,
        titulo: '¡Avanzaste a Entrevista!',
        mensaje: `La empresa ha movido tu postulación a fase de Entrevista.`,
        tipo: 'actualizacion_aplicacion',
        leido: false,
        fecha: serverTimestamp(),
        referencia_id: candidatoSeleccionado.id,
      });
      Alert.alert('Éxito', 'Candidato movido a Entrevista');
      setCandidatoSeleccionado(null);
    } catch (error) { Alert.alert('Error', 'No se pudo actualizar.'); }
  };

  const handleRechazarCandidato = async () => {
    if (!candidatoSeleccionado || motivoRechazo.trim() === '') return Alert.alert('Error', 'Escribe un motivo válido.');
    try {
      await updateDoc(doc(db, 'aplicaciones', candidatoSeleccionado.id), { estado: 'rechazado', motivo_rechazo: motivoRechazo });
      await addDoc(collection(db, 'notificaciones_app'), {
        destinatario_id: candidatoSeleccionado.estudiante_id,
        titulo: 'Postulación rechazada',
        mensaje: `Motivo: ${motivoRechazo}`,
        tipo: 'actualizacion_aplicacion',
        leido: false,
        fecha: serverTimestamp(),
        referencia_id: candidatoSeleccionado.id,
      });
      Alert.alert('Postulación rechazada', 'Se ha notificado al estudiante.');
      setShowRechazoModal(false);
      setMotivoRechazo('');
      setCandidatoSeleccionado(null);
    } catch (error) { Alert.alert('Error', 'No se pudo rechazar.'); }
  };

  const handleCalificarEstudiante = async (estrellas: number) => {
    if (!candidatoSeleccionado) return;
    setRatingEstudiante(estrellas);
    try {
      await addDoc(collection(db, 'evaluaciones_estudiantes'), {
        estudiante_id: candidatoSeleccionado.estudiante_id,
        empresa_id: user?.uid,
        calificacion: estrellas,
        fecha: serverTimestamp(),
      });
      Alert.alert('Gracias', 'Calificación guardada exitosamente.');
    } catch (error) { Alert.alert('Error', 'No se pudo guardar la calificación.'); }
  };

  const descargarCV = (cvUrl: string) => {
    if (cvUrl) { Linking.openURL(cvUrl); } else { Alert.alert('Sin CV', 'El estudiante no ha adjuntado un CV.'); }
  };

  // ── Chatear con el candidato seleccionado (chat directo empresa↔estudiante) ──
  const handleChatearCandidato = async () => {
    const estudianteId = candidatoSeleccionado?.estudiante_id;
    if (!user?.uid || !estudianteId) {
      Alert.alert('No disponible', 'No se pudo identificar al candidato para iniciar el chat.');
      return;
    }
    const estudianteNombre = candidatoSeleccionado?.estudiante_nombre || 'Estudiante';
    try {
      const chatId = await abrirChatDirectoEmpresaEstudiante({
        empresaId: user.uid,
        empresaNombre: perfil?.nombre_empresa ?? (userProfile as any)?.nombre_completo ?? 'Empresa',
        estudianteId,
        estudianteNombre,
        contexto: 'candidatura',
      });
      setCandidatoSeleccionado(null);
      // Se abre dentro de la sección "Mensajes" del propio dashboard (no una
      // pantalla aparte) — mismo modelo que usa el estudiante.
      setChatAAbrir({ id: chatId, peerName: estudianteNombre });
      setSeccion('mensajes');
    } catch (error) {
      Alert.alert('Error', 'No se pudo abrir el chat con el candidato.');
    }
  };

  // ── Firmar constancia (usa empresaFirmaConstancia del servicio) ───
  // La lógica real (marcar la aplicación como confirmada, generar la
  // transacción de pago pendiente) vive en pasantiaService.ts — aquí solo se
  // llama y se maneja el feedback visual (ícono de éxito 2s antes de cerrar).
  const handleFirmar = async (app: Aplicacion) => {
    try {
      await empresaFirmaConstancia(app.id, user!.uid, app.estudiante_id);
      setFirmaConfirmada(true);
      setTimeout(() => { setFirmaConfirmada(false); setShowFirmaModal(null); }, 2000);
    } catch { Alert.alert('Error', 'No se pudo firmar la constancia.'); }
  };

  // ── Abrir/cerrar modal de tarjeta ─────────────────────────────────
  // Con tarjeta registrada abre en modo "vista" (credenciales enmascaradas +
  // botón editar); sin tarjeta abre directo en el formulario de alta.
  const abrirCardModal = () => {
    setCardNumero(''); setCardExp(''); setCardCvv(''); setCardTitular('');
    setCardErrs({});
    setCardEditing(!perfil?.tarjeta_numero);
    setShowCardModal(true);
  };

  // Validación en vivo de cada campo de la tarjeta.
  const setCardErr = (k: string, m: string) =>
    setCardErrs(e => { const n = { ...e }; if (m) n[k] = m; else delete n[k]; return n; });

  // ── Guardar tarjeta (Luhn + vencimiento + CVV + titular) ──────────
  const handleGuardarTarjeta = async () => {
    const e: Record<string, string> = {};
    const mn = valTarjetaNum(cardNumero); if (mn) e.numero = mn;
    const me = valExp(cardExp);           if (me) e.exp = me;
    const mc = valCvv(cardCvv);           if (mc) e.cvv = mc;
    const mt = valTitular(cardTitular);   if (mt) e.titular = mt;
    setCardErrs(e);
    if (Object.keys(e).length > 0) return;

    setCardSaving(true);
    try {
      const digits = cardNumero.replace(/\D/g, '');
      // Pasarela simulada: solo guardamos datos enmascarados, sin cobros.
      await updateDoc(doc(db, 'perfiles_empresas', user!.uid), {
        tarjeta_numero: digits.slice(-4),
        tarjeta_alias:  cardTitular.trim() || 'Mi tarjeta',
      });
      setShowCardModal(false);
      setCardNumero(''); setCardExp(''); setCardCvv(''); setCardTitular('');
      setCardEditing(false);
      if (pendingUpgradeAfterCard) {
        // Ya tiene método de pago: retoma la mejora de plan que había quedado
        // pendiente por no tener tarjeta registrada.
        setPendingUpgradeAfterCard(false);
        setShowConfirmUpgradeModal(true);
      } else {
        Alert.alert('Tarjeta actualizada', 'Tu método de pago se guardó correctamente.');
      }
    } catch {
      Alert.alert('Error', 'No se pudo guardar la tarjeta.');
    } finally {
      setCardSaving(false);
    }
  };

  // ── Onboarding ────────────────────────────────────────────────────
  // Mismo hook useOnboarding (ver docs/GUIA_05 y OnboardingTour.tsx) que usan
  // los demás dashboards: recorre TOUR_CLAVES en orden mostrando el globo de
  // ayuda TOUR_PASOS[seccion] correspondiente a la pestaña activa.
  const tour = useOnboarding(user?.uid, seccion, TOUR_CLAVES);
  // "Continuar" marca el paso actual visto y avanza automáticamente a la
  // siguiente sección del recorrido — el usuario ya no tiene que ir tocando
  // pestañas por su cuenta para que reaparezca el globo de guía.
  const handleTourContinuar = useCallback(async () => {
    const idxActual = TOUR_CLAVES.indexOf(seccion);
    const siguiente = !tour.esUltimo ? TOUR_CLAVES[idxActual + 1] : undefined;
    await tour.marcar();
    if (siguiente) setSeccion(siguiente);
  }, [seccion, tour]);

  // ── Items del menú flotante (etiquetas cortas para la barra) ──────
  const NAV_LABELS: Record<SeccionEmpresa, string> = {
    inicio: 'Inicio', vacantes: 'Vacantes', kanban: 'Reclutar',
    activas: 'Activas', historial: 'Historial', perfil: 'Mi Perfil', mensajes: 'Mensajes',
  };
  // "Mensajes" y "Mi Perfil" se añaden SIEMPRE como últimas opciones.
  type NavKey = SeccionEmpresa | 'mensajes' | 'perfil';
  const navItems: NavItem<NavKey>[] = [
    ...MENU.map(m => ({
      key: m.key as NavKey,
      label: NAV_LABELS[m.key],
      icon: m.icon,
      badge: m.key === 'kanban' ? metricas.pendientes : undefined,
    })),
    { key: 'mensajes', label: 'Mensajes', icon: 'chatbubble-ellipses-outline', badge: mensajesNoLeidos },
    { key: 'perfil', label: 'Mi Perfil', icon: 'person-circle-outline' },
  ];

  // ── RENDER SECCIONES ─────────────────────────────────────────────
  // switch clásico: según la pestaña activa (`seccion`), renderiza el
  // sub-componente correspondiente (definidos más abajo, después del cierre
  // de este componente principal) pasándole los datos y callbacks que necesita.
  const renderSeccion = () => {
    switch (seccion) {
      case 'inicio':   return <SeccionInicio metricas={metricas} apps={apps} perfil={perfil} empresaId={user!.uid} vacantes={vacantes} solicitudesGrupo={solicitudesGrupo} onVerPerfil={setPerfilCandidatoId} />;
      case 'vacantes': return <SeccionVacantes vacantes={vacantes} onNueva={() => { setVacanteEditando(null); setShowNuevaVacante(true); }} onToggle={toggleVacante} onVerDetalles={setVacanteSeleccionada} onEditar={abrirEditarVacante} onEliminar={handleEliminarVacante} puedeCrear={puedeCrearVacante} limiteVacantes={limiteVacantes} vacantesRestantes={vacantesRestantes} plan={perfil?.plan} onMejorarPlan={() => setShowPlanUpgradeModal(true)} />;
      case 'kanban':   return <SeccionKanban apps={apps} onMover={moverEstado} onSeleccionar={(a) => { setRatingEstudiante(0); setCandidatoSeleccionado(a); }} />;
      case 'activas':  return <SeccionActivas apps={apps} solicitudesGrupo={solicitudesGrupo} onFirmar={setShowFirmaModal} onVerPerfil={setPerfilCandidatoId} empresaId={user!.uid} empresaNombre={perfil?.nombre_empresa ?? 'Empresa'} />;
      case 'historial': return <HistorialPasantes empresaId={user!.uid} empresaNombre={perfil?.nombre_empresa ?? (userProfile as any)?.nombre_completo ?? 'Empresa'} />;
      case 'perfil':   return renderPerfilSeccion();
      case 'mensajes': return (
        <SeccionMensajes
          openChat={chatAAbrir}
          onOpenChatConsumed={() => setChatAAbrir(null)}
          onChatOpenChange={setChatAbiertoEnMensajes}
        />
      );
      default:         return null;
    }
  };

  // ── Sección "Mi Perfil" (master-detail): rango, plan, método de pago,
  //    estadísticas y preferencias. Reemplaza al antiguo modal. ──
  // Mismo componente config-driven PerfilMasterDetail ya explicado a fondo en
  // app/(tabs)/perfil.tsx: recibe un array `sections`, cada una con `fields`+
  // `onSave` (formulario genérico) o `render` (contenido 100% custom, como
  // las secciones 'rango'/'resenas'/'plan'/'pago'/'stats' de aquí abajo).
  const renderPerfilSeccion = () => {
    const planKey = (perfil?.plan ?? 'gratuito') as 'gratuito' | 'mensual' | 'premium';
    const info = PLAN_DISPLAY[planKey];
    const ilimitado = (perfil?.limiteVacantes ?? 0) >= 9999;
    const tieneTarjeta = !!perfil?.tarjeta_numero;
    return (
      <PerfilMasterDetail
        name={nombreEmpresa}
        subtitle={`${perfil?.industria ?? 'Empresa'} · ${planBadgeLabel}`}
        avatarUrl={perfil?.logo_url}
        avatarStoragePath={`logos_empresas/${user!.uid}/logo.jpg`}
        fallbackIcon="business"
        onEditPhoto={handleUploadLogo}
        uploadingPhoto={uploadingLogo}
        onAyuda={handleAyuda}
        onAcerca={handleAcerca}
        onLogout={() => setLogoutModalVisible(true)}
        sections={[
          {
            id: 'datos',
            title: 'Datos de la empresa',
            subtitle: 'Información pública y de contacto',
            icon: 'business-outline',
            tone: 'blue',
            description: 'Estos datos los ven las universidades y estudiantes. Puedes editarlos.',
            fields: [
              { key: 'nombre_empresa', label: 'Nombre de la empresa', value: (perfil as any)?.nombre_empresa ?? '' },
              { key: 'nit', label: 'NIT', value: (perfil as any)?.nit ?? '', placeholder: '####-######-###-#' },
              { key: 'industria', label: 'Industria / Rubro', value: (perfil as any)?.industria ?? '' },
              { key: 'descripcion', label: 'Descripción', value: (perfil as any)?.descripcion ?? '', multiline: true },
              { key: 'sitio_web', label: 'Sitio web', value: (perfil as any)?.sitio_web ?? '', keyboardType: 'url', autoCapitalize: 'none' },
              { key: 'telefono', label: 'Teléfono', value: (perfil as any)?.telefono ?? '', keyboardType: 'phone-pad' },
              { key: 'direccion', label: 'Dirección', value: (perfil as any)?.direccion ?? '' },
              { key: 'departamento', label: 'Departamento', value: (perfil as any)?.departamento ?? '' },
              { key: 'distrito', label: 'Distrito', value: (perfil as any)?.distrito ?? (perfil as any)?.ciudad ?? '' },
              { key: 'instagram', label: 'Instagram', value: (perfil as any)?.instagram ?? '', autoCapitalize: 'none' },
              { key: 'facebook', label: 'Facebook', value: (perfil as any)?.facebook ?? '', autoCapitalize: 'none' },
            ],
            onSave: async (v) => {
              try {
                await updateDoc(doc(db, 'perfiles_empresas', user!.uid), {
                  nombre_empresa: v.nombre_empresa,
                  nit: v.nit,
                  industria: v.industria,
                  descripcion: v.descripcion,
                  sitio_web: v.sitio_web,
                  telefono: v.telefono,
                  direccion: v.direccion,
                  departamento: v.departamento,
                  distrito: v.distrito,
                  instagram: v.instagram,
                  facebook: v.facebook,
                });
              } catch { Alert.alert('Error', 'No se pudo guardar.'); }
            },
          },
          {
            id: 'contacto',
            title: 'Contacto / Responsable',
            subtitle: 'Persona de contacto de la empresa',
            icon: 'person-outline',
            tone: 'green',
            fields: [
              { key: 'contacto_nombre', label: 'Nombre del responsable', value: (perfil as any)?.contacto_nombre ?? '' },
              { key: 'contacto_cargo', label: 'Cargo', value: (perfil as any)?.contacto_cargo ?? '' },
              { key: 'contacto_telefono', label: 'Teléfono de contacto', value: (perfil as any)?.contacto_telefono ?? '', keyboardType: 'phone-pad' },
              { key: 'contacto_correo', label: 'Correo de contacto', value: (perfil as any)?.contacto_correo ?? '', keyboardType: 'email-address', autoCapitalize: 'none' },
              { key: 'contacto_documento_numero', label: 'Documento del responsable', value: (perfil as any)?.contacto_documento_numero ?? '' },
            ],
            onSave: async (v) => {
              try {
                await updateDoc(doc(db, 'perfiles_empresas', user!.uid), {
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
            id: 'rango',
            title: 'Mi rango',
            subtitle: 'Nivel y experiencia',
            icon: 'ribbon-outline',
            tone: 'orange',
            render: () => (
              <RangoCard
                xp={Number((perfil as any)?.puntos_experiencia ?? 0)}
                calificacion={Number((perfil as any)?.calificacion_promedio ?? 0)}
                pasantias={Number((perfil as any)?.pasantias_completadas ?? 0)}
                rol="empresa"
                theme="dark"
              />
            ),
          },
          {
            id: 'resenas',
            title: 'Reseñas',
            subtitle: 'Calificación y comentarios recibidos',
            icon: 'chatbox-ellipses-outline',
            tone: 'purple',
            render: () => (
              <ResenasFeedback entidadId={user?.uid ?? ''} entidadRol="empresa" theme="dark" />
            ),
          },
          {
            id: 'plan',
            title: 'Mi plan',
            subtitle: `${info.nombre} · ${info.precio}`,
            icon: 'star-outline',
            tone: 'purple',
            render: () => (
              <BlurView intensity={30} tint="dark" style={styles.planBox}>
                <View style={styles.planBoxHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="ribbon-outline" size={18} color={colors.primaryLight} />
                    <Text style={styles.planBoxLabel}>Plan actual</Text>
                  </View>
                  {perfil?.verificado && (
                    <View style={styles.planBoxVerif}>
                      <Ionicons name="checkmark-circle" size={13} color={COLORS.success} />
                      <Text style={styles.planBoxVerifText}>Verificada</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.planBoxName}>{info.nombre} · {info.precio}</Text>
                <View style={styles.planBoxStats}>
                  <View style={styles.planBoxStat}>
                    <Text style={styles.planBoxStatNum}>{ilimitado ? '∞' : (perfil?.limiteVacantes ?? 2)}</Text>
                    <Text style={styles.planBoxStatLbl}>Vacantes</Text>
                  </View>
                  <View style={styles.planBoxStat}>
                    <Text style={styles.planBoxStatNum}>{ilimitado ? '∞' : (perfil?.limiteAlianzas ?? 1)}</Text>
                    <Text style={styles.planBoxStatLbl}>Alianzas</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  {planKey !== 'premium' && (
                    <TouchableOpacity style={[styles.planBoxBtn, { flex: 1, backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => setShowPlanUpgradeModal(true)}>
                      <Text style={[styles.planBoxBtnText, { color: '#fff' }]}>Mejorar tu plan</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[styles.planBoxBtn, { flex: 1 }]} onPress={() => setShowPlanUpgradeModal(true)}>
                    <Text style={styles.planBoxBtnText}>Ver detalles del plan</Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.primaryLight} />
                  </TouchableOpacity>
                </View>

                {planKey !== 'gratuito' && (
                  <View style={styles.planRenewBox}>
                    <View style={styles.planRenewRow}>
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={styles.planRenewTitle}>Renovación automática</Text>
                        <Text style={styles.planRenewDesc}>
                          Gradly renueva tu plan {(perfil?.cicloFacturacion ?? 'mensual') === 'mensual' ? 'cada mes' : 'cada año'} sin que tengas que hacer nada.
                        </Text>
                      </View>
                      <Switch
                        value={!!perfil?.renovacionAutomatica}
                        onValueChange={handleToggleRenovacionAutomatica}
                        trackColor={{ false: colors.border, true: colors.primary }}
                        thumbColor="#fff"
                      />
                    </View>
                    <TouchableOpacity
                      style={[styles.planBoxBtn, { marginTop: 10, opacity: renovandoPago ? 0.6 : 1 }]}
                      disabled={renovandoPago}
                      onPress={handleRenovarPago}
                    >
                      {renovandoPago ? (
                        <ActivityIndicator size="small" color={colors.primaryLight} />
                      ) : (
                        <>
                          <Ionicons name="refresh-outline" size={14} color={colors.primaryLight} />
                          <Text style={styles.planBoxBtnText}>
                            Renovar pago de {(perfil?.cicloFacturacion ?? 'mensual') === 'mensual' ? 'este mes' : 'este año'}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </BlurView>
            ),
          },
          {
            id: 'pago',
            title: 'Método de pago',
            subtitle: tieneTarjeta ? `•••• ${perfil?.tarjeta_numero}` : 'Sin tarjeta registrada',
            icon: 'wallet-outline',
            tone: 'green',
            render: () => (
              <View style={styles.payCard}>
                <View style={styles.payCardHeader}>
                  <Ionicons name="card-outline" size={18} color={colors.primaryLight} />
                  <Text style={styles.payCardTitle}>Método de pago</Text>
                </View>
                {tieneTarjeta ? (
                  <Text style={styles.payCardNumber}>**** **** **** {perfil?.tarjeta_numero}</Text>
                ) : (
                  <Text style={styles.payCardEmpty}>No hay tarjeta registrada</Text>
                )}
                {!!perfil?.tarjeta_alias && tieneTarjeta && (
                  <Text style={styles.payCardAlias}>{perfil.tarjeta_alias}</Text>
                )}
                <TouchableOpacity style={styles.payCardBtn} onPress={abrirCardModal}>
                  <Ionicons name={tieneTarjeta ? 'sync-outline' : 'add-outline'} size={16} color={colors.primaryLight} />
                  <Text style={styles.payCardBtnText}>
                    {tieneTarjeta ? 'Cambiar método de pago' : 'Agregar método de pago'}
                  </Text>
                </TouchableOpacity>
              </View>
            ),
          },
          {
            id: 'stats',
            title: 'Estadísticas',
            subtitle: 'Pagos y aliados',
            icon: 'stats-chart-outline',
            tone: 'blue',
            render: () => <PerfilStatsEmpresa empresaId={user!.uid} />,
          },
        ]}
      />
    );
  };

  // ─────────────────────────────────────────────
  const nombreEmpresa = perfil?.nombre_empresa ?? (userProfile as any)?.nombre_completo ?? 'Empresa';
  // Traducido aquí (hook, siempre se ejecuta) en vez de dejar que AutoText
  // traduzca el string ya compuesto (`subtitle`, "Plan Gratuito · Nombre"): ese
  // string combinado es distinto para cada empresa y nunca podría sembrarse
  // en autoSeed.ts, quedando a merced de la traducción async.
  // El rótulo sale del `plan` real, no del flag binario `premium`: 'gratuito'
  // es "Plan Gratuito", 'mensual' es el "Plan Básico" del catálogo comercial y
  // 'premium' su estrella. Antes todo lo no-premium caía en "Plan Básico", así
  // que una empresa del plan gratuito se veía rotulada como si pagara.
  const planKeyBadge = (perfil?.plan ?? 'gratuito') as 'gratuito' | 'mensual' | 'premium';
  const planBadgeLabel = useAutoText(
    planKeyBadge === 'premium' ? '⭐ Premium' : planKeyBadge === 'mensual' ? 'Plan Básico' : 'Plan Gratuito',
  );

  // ── Guard de ciclo de vida: evita render/crasheos con UID null ──
  // (todos los hooks ya se ejecutaron arriba, así que es seguro retornar aquí)
  if (!user || !user.uid) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // ── JSX de retorno ──────────────────────────────────────────────
  // Mismo esqueleto visual que dashboard-universidad.tsx: LiquidBackground
  // (fondo animado) → header con avatar/nombre/plan → renderSeccion() con el
  // contenido de la pestaña activa → capas flotantes (FloatingTopBar,
  // FloatingSearchButton, FeedbackGate, ModeracionVacanteGate,
  // FloatingNavBar) → la pila de <Modal> del formulario/planes/candidato.
  return (
    <LiquidBackground>
    <View style={[styles.root, { backgroundColor: 'transparent' }]}>
      <StatusBar style="light" />

      {/* ── CONTENIDO ── */}
      <View style={styles.main}>
        {/* Header superior — en "Mensajes" (solo tablet/web) se reemplaza
            por una fila delgada con una flecha "atrás" a la misma altura
            que la píldora flotante, para no verse doble/grueso encima de
            la conversación. En móvil angosto y en el resto de secciones
            sigue exactamente igual que siempre. */}
        <View style={headerChatSimplificado ? styles.mainHeaderChat : styles.mainHeader}>
          {headerChatSimplificado ? (
            <TouchableOpacity
              onPress={() => setSeccion('inicio')}
              style={styles.mainHeaderBackBtn}
              accessibilityLabel="Volver a Inicio"
              hitSlop={8}
            >
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity onPress={() => setSeccion('perfil')} activeOpacity={0.8}>
                <StorageAvatar
                  url={perfil?.logo_url}
                  storagePath={user ? `logos_empresas/${user.uid}/logo.jpg` : null}
                  size={40}
                  fallbackIcon="business"
                />
              </TouchableOpacity>
              <View style={{ flex: 1, marginLeft: 12 }}>
                {/* En Inicio el título es el nombre de la empresa (más identidad que
                    un genérico "Inicio"); el subtítulo deja de repetirlo. */}
                {/* En Inicio el título es el nombre de la empresa → `noTranslate`,
                    es un nombre propio y no debe pasar por el traductor. */}
                {seccion === 'inicio' ? (
                  <Text style={styles.mainTitle} numberOfLines={1} noTranslate>
                    {nombreEmpresa || 'Inicio'}
                  </Text>
                ) : (
                  <Text style={styles.mainTitle} numberOfLines={1}>
                    {seccion === 'perfil' ? 'Mi Perfil' : (MENU.find(m => m.key === seccion)?.label ?? 'Inicio')}
                  </Text>
                )}
                {seccion === 'inicio' ? (
                  <Text style={styles.mainGreeting} numberOfLines={1} noTranslate>
                    {planBadgeLabel}
                  </Text>
                ) : (
                  <Text style={styles.mainGreeting} numberOfLines={1} noTranslate>
                    {planBadgeLabel}
                    {' · '}
                    {nombreEmpresa}
                  </Text>
                )}
              </View>
            </>
          )}
        </View>

        {renderSeccion()}
      </View>

      {/* ── BOTONES FLOTANTES SUPERIORES (Glassmorphism) ──
          Ocultos mientras se ve un chat abierto en "Mensajes": ChatThread ya
          trae su propia versión de estos mismos 3 botones en su cabecera. */}
      {!(seccion === 'mensajes' && chatAbiertoEnMensajes) && (
        <FloatingTopBar userId={user?.uid} />
      )}

      {/* ── BÚSQUEDA FLOTANTE (oculta en "Mi Perfil" y "Mensajes") ── */}
      {seccion !== 'perfil' && seccion !== 'mensajes' && <FloatingSearchButton placeholder="Buscar candidatos o vacantes..." />}

      {/* ── FORMULARIO OBLIGATORIO DE EXPERIENCIA (pasantías finalizadas) ── */}
      <FeedbackGate />

      {/* ── AVISO DE MODERACIÓN (vacantes deshabilitadas/eliminadas por admin) ── */}
      <ModeracionVacanteGate />

      {/* ── AVISOS AL INICIAR SESIÓN (reservas de cupos por confirmar/informativas) ── */}
      <AvisosGate />

      {/* ── MENÚ FLOTANTE (Glassmorphism) ──
          Oculto en "Mensajes": la sección de chat debe verse limpia, sin
          menú inferior superpuesto sobre la conversación. */}
      {seccion !== 'mensajes' && (
        <FloatingNavBar
          items={navItems}
          activeKey={seccion}
          onChange={(k) => setSeccion(k as SeccionEmpresa)}
        />
      )}

      {/* Todos los <Modal> de este archivo usan animationType="none": con
          "slide"/"fade", react-native-web anima con un `transform`/`opacity`
          en dos pasos de render — si el segundo paso no llega a pintarse a
          tiempo (frecuente aquí porque el dashboard mantiene MUCHOS <Modal>
          montados a la vez), el modal queda atascado en su estado inicial
          (fuera de pantalla o invisible), sin forma de alcanzarlo ni con
          scroll. Reproducido en "Planes y Facturación" (el selector de plan
          Premium no reaccionaba a los toques) y en el modal de "Evaluar
          grupo" de Matchmaking.tsx (ver ahí el mismo comentario). */}
      {/* ── MODAL: Detalles de Vacante (incluye mapa solo lectura) ── */}
      <Modal visible={!!vacanteSeleccionada} transparent animationType="none">
        <View style={styles.modalOverlay}>
          <View style={styles.sheetCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={styles.modalTitle}>Detalles de Vacante</Text>
              <TouchableOpacity onPress={() => setVacanteSeleccionada(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              <AutoText style={{ color: '#fff', fontFamily: FONTS.soraBold, fontSize: 18 }}>{vacanteSeleccionada?.titulo}</AutoText>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {/* Un solo chip de tipo: antes `categoria` y `tipo` mostraban el
                    mismo texto duplicado (desde que Tipo pasó a ser
                    exactamente Pasantía/Vacante). `categoria` es la fuente
                    correcta incluso para publicaciones legadas con un `tipo`
                    de texto libre ("Proyecto", etc.). */}
                <View style={styles.pickerChip}>
                  <Text style={styles.pickerText}>
                    {vacanteSeleccionada?.categoria === 'pasantia' || vacanteSeleccionada?.tipo === 'Pasantía'
                      ? 'Pasantía'
                      : 'Vacante'}
                  </Text>
                </View>
                {!!vacanteSeleccionada?.modalidad_contrato && (
                  <View style={styles.pickerChip}>
                    <Text style={styles.pickerText}>{vacanteSeleccionada.modalidad_contrato}</Text>
                  </View>
                )}
                <View style={styles.pickerChip}><Text style={styles.pickerText}>{vacanteSeleccionada?.area}</Text></View>
                <View style={styles.pickerChip}><Text style={styles.pickerText}>{vacanteSeleccionada?.modalidad}</Text></View>
                {/* Roles concretos dentro del área (p. ej. "Desarrollo web"). */}
                {(vacanteSeleccionada?.tags ?? []).map((t: string, i: number) => (
                  <View key={`tag-${i}`} style={[styles.pickerChip, { backgroundColor: COLORS.backgroundSurface }]}>
                    <Text style={styles.pickerText}>{t}</Text>
                  </View>
                ))}
              </View>

              <AutoText style={styles.fieldLabel}>Descripción</AutoText>
              <AutoText style={styles.modalDesc}>{vacanteSeleccionada?.descripcion}</AutoText>

              <Text style={styles.fieldLabel}>Requisitos</Text>
              <Text style={styles.modalDesc}>• Skills: {vacanteSeleccionada?.skills_requeridas?.join(', ')}</Text>
              {!!(vacanteSeleccionada?.horas_requeridas || vacanteSeleccionada?.horas_semanales) && (
                <Text style={styles.modalDesc}>• Total: {vacanteSeleccionada?.horas_requeridas ?? 0} h  |  Semanales: {vacanteSeleccionada?.horas_semanales ?? 0} h</Text>
              )}

              {/* Horario declarado al publicar (ausente en vacantes legadas). */}
              {textoHorario(vacanteSeleccionada?.horario) && (
                <View style={s.horarioBoxDetalle}>
                  <Text style={styles.fieldLabel}>Horario</Text>
                  <Text style={styles.modalDesc}>{textoHorario(vacanteSeleccionada?.horario)}</Text>
                </View>
              )}

              {/* Salario (opcional, solo 'Vacante'): informativo. */}
              {textoSalario(vacanteSeleccionada?.salario_min, vacanteSeleccionada?.salario_max) && (
                <View style={s.horarioBoxDetalle}>
                  <Text style={styles.fieldLabel}>Salario estimado</Text>
                  <Text style={styles.modalDesc}>
                    {textoSalario(vacanteSeleccionada?.salario_min, vacanteSeleccionada?.salario_max)}
                  </Text>
                  <View style={s.avisoEdicion}>
                    <Ionicons name="information-circle-outline" size={14} color={COLORS.textMuted} />
                    <Text style={s.avisoEdicionTxt}>
                      Informativo. La negociación final se realiza de forma privada entre la
                      empresa y el postulante, fuera de Gradly.
                    </Text>
                  </View>
                </View>
              )}

              {/* Candidatos que ya ocupan un cupo de esta vacante. */}
              {!!vacanteSeleccionada && (
                <>
                  <Text style={styles.fieldLabel}>Candidatos</Text>
                  <CandidatosVacante
                    vacanteId={vacanteSeleccionada.id}
                    empresaId={user?.uid ?? ''}
                    empresaNombre={nombreEmpresa}
                    categoria={vacanteSeleccionada.categoria}
                    cupos={vacanteSeleccionada.cupos}
                    onVerPerfil={setPerfilCandidatoId}
                  />
                </>
              )}

              {(vacanteSeleccionada?.modalidad === 'Presencial' || vacanteSeleccionada?.modalidad === 'Híbrido') && vacanteSeleccionada?.ubicacion_coords && (
                <View style={mapStyles.glassBox}>
                  <Text style={mapStyles.glassTitle}>Ubicación registrada</Text>
                  <View pointerEvents="none" style={mapStyles.mapContainer}>
                    <MapViewer
                      mapRegion={{
                        latitude: vacanteSeleccionada.ubicacion_coords.latitude,
                        longitude: vacanteSeleccionada.ubicacion_coords.longitude,
                        latitudeDelta: 0.01,
                        longitudeDelta: 0.01,
                      }}
                      markerPos={vacanteSeleccionada.ubicacion_coords}
                    />
                  </View>
                  {vacanteSeleccionada.ubicacion_texto && (
                    <View style={mapStyles.detailBox}>
                      <Text style={mapStyles.detailLine}><Text style={mapStyles.detailLabel}>Dirección: </Text>{vacanteSeleccionada.ubicacion_texto.direccion || '—'}</Text>
                      <Text style={mapStyles.detailLine}><Text style={mapStyles.detailLabel}>Municipio: </Text>{vacanteSeleccionada.ubicacion_texto.municipio || '—'}</Text>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Perfil completo de un candidato — se abre al tocar su fila en la
          lista de candidatos de "Detalles de Vacante". Reutiliza el mismo
          visor que ya usa Historial de Pasantes (rol="talento"). */}
      <PerfilPublicoModal
        visible={!!perfilCandidatoId}
        onClose={() => setPerfilCandidatoId(null)}
        userId={perfilCandidatoId ?? ''}
        rol="talento"
        viewerUserId={user?.uid ?? ''}
        theme="dark"
      />

      {/* ── MODAL: Nueva Vacante ── el formulario grande: reutiliza los
          FieldInput/PickerRow definidos al final del archivo, valida con las
          funciones puras de arriba, y muestra/oculta secciones según nvTipo
          y nvModalidad (mapa solo si Presencial/Híbrido, salario/modalidad
          de contrato solo si 'Vacante', reclamos_auto solo si 'Pasantía').
          FIXED: se oculta mientras estadoGuardado !== 'idle' para que el Modal
          dinámico de guardado no quede tapado por este en Android / web. */}
      <Modal visible={showNuevaVacante && estadoGuardado === 'idle'} transparent animationType="none">
        <View style={styles.modalOverlay}>
          <View style={styles.sheetCard}>
            <Text style={styles.modalTitle}>
              {vacanteEditando
                ? 'Editar publicación'
                : nvTipo === 'Pasantía' ? 'Nueva pasantía' : nvTipo ? 'Nueva vacante' : 'Nueva pasantía o vacante'}
            </Text>
            {/* Aviso al editar algo que ya tiene compromisos con universidades. */}
            {vacanteEditando && cuposComprometidos > 0 && (
              <View style={s.avisoEdicion}>
                <Ionicons name="information-circle-outline" size={16} color={COLORS.warning} />
                <Text style={s.avisoEdicionTxt}>
                  Esta publicación ya tiene {cuposComprometidos} cupo(s) comprometido(s). No puedes
                  reducir el total por debajo de esa cifra, y cambiar el horario no altera las
                  reservas ya hechas.
                </Text>
              </View>
            )}
            <ScrollView showsVerticalScrollIndicator={false}>
              <FieldInput
                label="Título*" value={nvTitulo} onChange={onChangeTitulo}
                placeholder="Pasantía de Desarrollo Web"
                error={nvErrors.titulo} valid={!nvErrors.titulo && !!nvTitulo.trim()}
              />
              <PickerRow label="Área*" options={AREAS} selected={nvArea} onSelect={onSelectArea} error={nvErrors.area} />
              {nvArea === 'Otra' && (
                <FieldInput
                  label="Especifica el área*" value={nvAreaOtra} onChange={onChangeAreaOtra}
                  placeholder="Ej. Logística"
                  error={nvErrors.areaOtra} valid={!nvErrors.areaOtra && !!nvAreaOtra.trim()}
                />
              )}
              <PickerRow label="Modalidad*" options={MODALIDADES} selected={nvModalidad} onSelect={onSelectModalidad} error={nvErrors.modalidad} />

              {(nvModalidad === 'Presencial' || nvModalidad === 'Híbrido') && (
                <View style={mapStyles.glassBox}>
                  <Text style={mapStyles.glassTitle}>Ubicación de la vacante</Text>
                  <Text style={mapStyles.glassHint}>Marca el punto exacto del lugar de trabajo (solo El Salvador).</Text>

                  {/* a) Capturar ubicación actual */}
                  <TouchableOpacity style={mapStyles.primaryBtn} onPress={capturarUbicacion} disabled={procesandoUbicacion}>
                    <Text style={mapStyles.primaryBtnText}>📍  Capturar mi Ubicación Actual</Text>
                  </TouchableOpacity>

                  {procesandoUbicacion && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <ActivityIndicator color={COLORS.primaryLight} size="small" />
                      <Text style={mapStyles.glassHint}>Procesando ubicación...</Text>
                    </View>
                  )}

                  {/* c) Contenedor del mapa (toque para marcar — Método B) */}
                  <View style={mapStyles.mapContainer}>
                    <MapViewer mapRegion={mapRegion} markerPos={markerPos} onMapPress={marcarDesdeMapa} />
                  </View>
                  <Text style={mapStyles.glassHint}>Toca el mapa para colocar el marcador en el punto exacto.</Text>

                  {/* d) Detalles de la ubicación */}
                  {!!ubicacionDetalle.pais && (
                    <View style={mapStyles.detailBox}>
                      <Text style={mapStyles.detailLine}><Text style={mapStyles.detailLabel}>Dirección: </Text>{ubicacionDetalle.direccion || '—'}</Text>
                      <Text style={mapStyles.detailLine}><Text style={mapStyles.detailLabel}>Municipio: </Text>{ubicacionDetalle.municipio || '—'}</Text>
                      <Text style={mapStyles.detailLine}><Text style={mapStyles.detailLabel}>Departamento: </Text>{ubicacionDetalle.departamento || '—'}</Text>
                      <Text style={mapStyles.detailLine}><Text style={mapStyles.detailLabel}>País: </Text>{ubicacionDetalle.pais}</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Roles dentro del área: solo aparecen en las áreas anchas
                  (Tecnología, Administración…). Son opcionales — afinan el
                  match, no lo condicionan. */}
              {tagsDeArea(nvArea).length > 0 && (
                <View style={{ marginBottom: 14 }}>
                  <Text style={s.tagsLabel}>Rol o especialidad (opcional)</Text>
                  <Text style={s.tagsHint}>
                    Ayuda a que te lleguen los estudiantes correctos: "Tecnología" abarca desde
                    programar hasta soporte técnico.
                  </Text>
                  <View style={s.tagsWrap}>
                    {tagsDeArea(nvArea).map(tag => {
                      const activo = nvTags.includes(tag);
                      return (
                        <TouchableOpacity
                          key={tag}
                          style={[s.tagChip, activo && s.tagChipOn]}
                          onPress={() => setNvTags(prev =>
                            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag],
                          )}
                          activeOpacity={0.7}
                        >
                          <Text style={[s.tagChipText, activo && s.tagChipTextOn]}>{tag}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              <PickerRow
                label="Tipo*" options={TIPOS} selected={nvTipo} onSelect={onSelectTipo}
                error={cambioDeCarrilBloqueado
                  ? 'No puedes cambiar el tipo: ya hay cupos comprometidos con universidades.'
                  : nvErrors.tipo}
              />
              {/* Granularidad de empleo: solo aplica a Vacante. La Pasantía ya
                  queda descrita con precisión por el horario declarado. */}
              {nvTipo === 'Vacante' && (
                <PickerRow
                  label="Modalidad de contrato*"
                  options={MODALIDADES_CONTRATO}
                  selected={nvModalidadContrato}
                  onSelect={onSelectModalidadContrato}
                  error={nvErrors.modalidadContrato}
                />
              )}
              <FieldInput
                label="Descripción*" value={nvDesc} onChange={onChangeDesc}
                placeholder="Descripción de la vacante..." multiline
                error={nvErrors.desc} valid={!nvErrors.desc && !!nvDesc.trim()}
                infoText="💡 Agrega detalles relevantes acerca de la vacante, responsabilidades y beneficios."
              />
              <FieldInput
                label="Skills (separadas por coma)*" value={nvSkills} onChange={onChangeSkills}
                placeholder="React, TypeScript, Node.js"
                error={nvErrors.skills} valid={!nvErrors.skills && !!nvSkills.trim()}
              />
              <FieldInput
                label="Fecha límite*" value={nvFechaLim} onChange={onChangeFecha}
                placeholder="YYYY-MM-DD" keyboardType="number-pad" maxLength={10}
                error={nvErrors.fecha} valid={!nvErrors.fecha && !!nvFechaLim.trim()}
                infoText="💡 La fecha debe ser al menos 5 días después de hoy, con un plazo máximo de 3 meses."
              />
              <FieldInput
                label="Cupos disponibles*" value={nvCupos} onChange={onChangeCupos}
                placeholder="Ej. 8" keyboardType="number-pad" maxLength={3}
                error={nvErrors.cupos} valid={!nvErrors.cupos && !!nvCupos.trim()}
                infoText="💡 Cuántos estudiantes puedes recibir. Las universidades reservan cupos para sus grupos hasta agotarlos."
              />
              <HorarioVacanteSelector
                value={nvHorario}
                onChange={h => { setNvHorario(h); setErr('horario', valHorarioCondicional(h, horarioRequerido)); }}
                error={nvErrors.horario}
                requerido={horarioRequerido}
              />

              {/* Rango salarial: opcional, solo tiene sentido en Vacante (la
                  Pasantía usa el `pago` del acuerdo negociado por chat). */}
              {nvTipo === 'Vacante' && (
                <View style={{ marginBottom: 14 }}>
                  <Text style={s.tagsLabel}>Rango salarial (opcional)</Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <FieldInput
                        label="Mínimo" value={nvSalarioMin} onChange={onChangeSalarioMin}
                        placeholder="Ej. 400" keyboardType="number-pad" maxLength={6}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <FieldInput
                        label="Máximo" value={nvSalarioMax} onChange={onChangeSalarioMax}
                        placeholder="Ej. 600" keyboardType="number-pad" maxLength={6}
                      />
                    </View>
                  </View>
                  {!!nvErrors.salario && <Text style={styles.fieldError}>{nvErrors.salario}</Text>}
                  <View style={s.avisoEdicion}>
                    <Ionicons name="information-circle-outline" size={16} color={COLORS.textMuted} />
                    <Text style={s.avisoEdicionTxt}>
                      El salario es informativo y queda a discreción tuya publicarlo. La negociación
                      final de las condiciones económicas se realiza de forma privada entre la
                      empresa y el postulante, fuera de Gradly.
                    </Text>
                  </View>
                </View>
              )}

              {/* Control de la empresa sobre quién reserva sus cupos — exclusivo
                  de Pasantía: en Vacante ninguna universidad ve ni reclama estos
                  cupos (VacantesDisponibles excluye categoria:'vacante'), así que
                  el interruptor sería un control muerto sin efecto alguno. */}
              {nvTipo === 'Pasantía' && (
                <TouchableOpacity
                  style={s.autoRow}
                  onPress={() => setNvReclamosAuto(v => !v)}
                  activeOpacity={0.7}
                >
                  <View style={[s.autoCheck, nvReclamosAuto && s.autoCheckOn]}>
                    {nvReclamosAuto && <Ionicons name="checkmark" size={14} color="#FFF" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.autoTitle}>Aceptar reclamos de cupos automáticamente</Text>
                    <Text style={s.autoHint}>
                      {nvReclamosAuto
                        ? 'Las universidades reservan cupos al instante, sin esperar tu confirmación.'
                        : 'Recibirás una solicitud por cada universidad y decides si aceptas (un solo toque).'}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => { setShowNuevaVacante(false); setVacanteEditando(null); }}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSave, (savingVac || !formularioValido) && { opacity: 0.5 }]}
                onPress={handlePublicarVacante}
                disabled={savingVac || !formularioValido}
              >
                {savingVac
                  ? <ActivityIndicator color={COLORS.textPrimary} />
                  : <Text style={styles.modalSaveText}>{vacanteEditando ? 'Guardar cambios' : 'Publicar'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL: Firma constancia ── */}
      <Modal visible={!!showFirmaModal} transparent animationType="none">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {firmaConfirmada ? (
              <View style={{ alignItems: 'center', gap: 12 }}>
                <Ionicons name="checkmark-circle" size={56} color={COLORS.success} />
                <Text style={styles.modalTitle}>Constancia firmada</Text>
                <Text style={styles.modalDesc}>Se generó una transacción pendiente de pago.</Text>
              </View>
            ) : (
              <>
                <Text style={styles.modalTitle}>Firmar constancia</Text>
                <Text style={styles.modalDesc}>
                  Estudiante: {showFirmaModal?.estudiante_nombre}{'\n'}
                  Horas completadas: {showFirmaModal?.horas_completadas ?? 0}{'\n'}
                  ¿Confirmas que la pasantía fue completada?
                </Text>
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalCancel} onPress={() => setShowFirmaModal(null)}>
                    <Text style={styles.modalCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalSave}
                    onPress={() => showFirmaModal && handleFirmar(showFirmaModal)}
                  >
                    <Text style={styles.modalSaveText}>Firmar</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── MODAL: Método de pago (ver la registrada, o agregar/actualizar) ── */}
      <Modal visible={showCardModal} transparent animationType="none">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {!cardEditing && !!perfil?.tarjeta_numero ? (
              // ── Vista: credenciales ya registradas (enmascaradas) ──
              <>
                <Text style={styles.modalTitle}>Método de pago</Text>

                <View style={styles.payCard}>
                  <Text style={styles.payCardNumber}>**** **** **** {perfil.tarjeta_numero}</Text>
                  {!!perfil.tarjeta_alias && (
                    <Text style={styles.payCardAlias}>{perfil.tarjeta_alias}</Text>
                  )}
                </View>

                <View style={styles.payNote}>
                  <Ionicons name="lock-closed" size={12} color={COLORS.textMuted} />
                  <Text style={styles.payNoteText}>Por seguridad solo guardamos los últimos 4 dígitos.</Text>
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.modalCancel}
                    onPress={() => { setShowCardModal(false); setPendingUpgradeAfterCard(false); }}
                  >
                    <Text style={styles.modalCancelText}>Cerrar</Text>
                  </TouchableOpacity>
                  <JellyButton style={styles.modalSave} contentStyle={{ paddingVertical: 0 }} onPress={() => setCardEditing(true)}>
                    <Text style={styles.modalSaveText}>Actualizar método de pago</Text>
                  </JellyButton>
                </View>
              </>
            ) : (
              // ── Formulario: alta (sin tarjeta) o edición (reemplaza la actual) ──
              <>
                <Text style={styles.modalTitle}>
                  {perfil?.tarjeta_numero ? 'Actualizar método de pago' : 'Registrar método de pago'}
                </Text>

                {pendingUpgradeAfterCard && (
                  <View style={styles.payNote}>
                    <Ionicons name="information-circle-outline" size={14} color={colors.primaryLight} />
                    <Text style={styles.payNoteText}>Necesitas registrar un método de pago para mejorar tu plan.</Text>
                  </View>
                )}

                <Text style={styles.fieldLabel}>Número de tarjeta</Text>
                <TextInput style={[styles.modalInput, cardErrs.numero && styles.inputErr]} value={cardNumero}
                  onChangeText={t => { const v = maskTarjeta(t); setCardNumero(v); setCardErr('numero', valTarjetaNum(v)); }}
                  placeholder="1234 5678 9012 3456" placeholderTextColor={COLORS.textMuted}
                  keyboardType="number-pad" maxLength={19} selectionColor={COLORS.primary} />
                {!!cardErrs.numero && <Text style={styles.inputErrText}>{cardErrs.numero}</Text>}

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Vencimiento (MM/AA)</Text>
                    <TextInput style={[styles.modalInput, cardErrs.exp && styles.inputErr]} value={cardExp}
                      onChangeText={t => { const v = maskExp(t); setCardExp(v); setCardErr('exp', valExp(v)); }}
                      placeholder="MM/AA" placeholderTextColor={COLORS.textMuted}
                      keyboardType="number-pad" maxLength={5} selectionColor={COLORS.primary} />
                    {!!cardErrs.exp && <Text style={styles.inputErrText}>{cardErrs.exp}</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>CVV</Text>
                    <TextInput style={[styles.modalInput, cardErrs.cvv && styles.inputErr]} value={cardCvv}
                      onChangeText={t => { const v = t.replace(/\D/g, '').slice(0, 4); setCardCvv(v); setCardErr('cvv', valCvv(v)); }}
                      placeholder="123" placeholderTextColor={COLORS.textMuted}
                      keyboardType="number-pad" maxLength={4} selectionColor={COLORS.primary} />
                    {!!cardErrs.cvv && <Text style={styles.inputErrText}>{cardErrs.cvv}</Text>}
                  </View>
                </View>

                <Text style={styles.fieldLabel}>Nombre del titular</Text>
                <TextInput style={[styles.modalInput, cardErrs.titular && styles.inputErr]} value={cardTitular}
                  onChangeText={t => { const v = t.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, ''); setCardTitular(v); setCardErr('titular', valTitular(v)); }}
                  placeholder="Como aparece en la tarjeta" placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="words" selectionColor={COLORS.primary} />
                {!!cardErrs.titular && <Text style={styles.inputErrText}>{cardErrs.titular}</Text>}

                <View style={styles.payNote}>
                  <Ionicons name="lock-closed" size={12} color={COLORS.textMuted} />
                  <Text style={styles.payNoteText}>Pago simulado. No se realiza ningún cargo real.</Text>
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.modalCancel}
                    onPress={() => { setShowCardModal(false); setPendingUpgradeAfterCard(false); }}
                    disabled={cardSaving}
                  >
                    <Text style={styles.modalCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <JellyButton style={[styles.modalSave, cardSaving && { opacity: 0.6 }]} contentStyle={{ paddingVertical: 0 }} onPress={cardSaving ? undefined : handleGuardarTarjeta}>
                    {cardSaving ? <ActivityIndicator color={COLORS.textPrimary} /> : <Text style={styles.modalSaveText}>Guardar tarjeta</Text>}
                  </JellyButton>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── MODAL: Detalle del plan ── */}
      <Modal visible={showPlanDetail} transparent animationType="none" onRequestClose={() => setShowPlanDetail(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {(() => {
              const planKey = (perfil?.plan ?? 'gratuito') as 'gratuito' | 'mensual' | 'premium';
              const info = PLAN_DISPLAY[planKey];
              return (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.modalTitle}>Plan {info.nombre}</Text>
                    <TouchableOpacity onPress={() => setShowPlanDetail(false)} hitSlop={8}>
                      <Ionicons name="close" size={22} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.modalDesc, { marginBottom: 6 }]}>{info.precio}</Text>
                  {info.beneficios.map(b => (
                    <View key={b} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 }}>
                      <Ionicons name="checkmark-circle" size={16} color={colors.primaryLight} />
                      <Text style={styles.modalDesc}>{b}</Text>
                    </View>
                  ))}
                  <JellyButton style={[styles.modalSave, { marginTop: 14 }]} contentStyle={{ paddingVertical: 0 }} onPress={() => setShowPlanDetail(false)}>
                    <Text style={styles.modalSaveText}>Entendido</Text>
                  </JellyButton>
                </>
              );
            })()}
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
        onContinuar={handleTourContinuar}
        onSaltar={tour.saltar}
      />

      {/* ── MODAL: Confirmar cierre de sesión (botón manual del perfil) ── */}
      <SalirSesionModal
        visible={logoutModalVisible}
        onConfirm={confirmarCierreSesion}
        onCancel={() => setLogoutModalVisible(false)}
      />

      {/* ── MODAL: Confirmar cierre de sesión (al agotar el "atrás" del
          navegador — ver useAuthBackGuard más arriba) ── */}
      <SalirSesionModal
        visible={showLogoutConfirm}
        onConfirm={confirmLogout}
        onCancel={cancelLogout}
      />

      {/* MODAL DINÁMICO DE ESTADO DE GUARDADO */}
      <Modal transparent visible={estadoGuardado !== 'idle'} animationType="none">
        <View style={{ flex: 1, backgroundColor: 'rgba(7,5,15,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#1a162b', borderRadius: 24, padding: 30, width: '100%', maxWidth: 340, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)', shadowColor: '#8b5cf6', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 15 }}>

            {/* ESTADO: CARGANDO */}
            {estadoGuardado === 'loading' && (
              <>
                <ActivityIndicator size="large" color="#8b5cf6" style={{ transform: [{ scale: 1.5 }], marginBottom: 24 }} />
                <Text style={{ color: '#fff', fontSize: 18, fontFamily: FONTS.soraBold, marginBottom: 8 }}>Procesando Vacante...</Text>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontFamily: FONTS.interRegular, textAlign: 'center' }}>Registrando ubicación y datos en la base de datos.</Text>
              </>
            )}

            {/* ESTADO: ÉXITO */}
            {estadoGuardado === 'success' && (
              <>
                <Ionicons name="checkmark-circle" size={80} color="#10b981" style={{ marginBottom: 16 }} />
                <Text style={{ color: '#fff', fontSize: 20, fontFamily: FONTS.soraBold, marginBottom: 8 }}>
                  {vacanteEditando ? '¡Cambios guardados!' : '¡Vacante Publicada!'}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontFamily: FONTS.interRegular, textAlign: 'center', marginBottom: 24 }}>
                  {vacanteEditando
                    ? 'La publicación se actualizó. Las reservas de cupos ya hechas se mantienen.'
                    : 'La oferta ya está disponible para todos los estudiantes de la red.'}
                </Text>
                <TouchableOpacity
                  style={{ backgroundColor: '#8b5cf6', paddingVertical: 14, borderRadius: 14, width: '100%', alignItems: 'center' }}
                  onPress={finalizarGuardadoExitoso}
                >
                  <Text style={{ color: '#fff', fontFamily: FONTS.interSemiBold, fontSize: 16 }}>Aceptar y Cerrar</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ESTADO: ERROR */}
            {estadoGuardado === 'error' && (
              <>
                <Ionicons name="close-circle" size={80} color="#ef4444" style={{ marginBottom: 16 }} />
                <Text style={{ color: '#fff', fontSize: 20, fontFamily: FONTS.soraBold, marginBottom: 8 }}>Error al Guardar</Text>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontFamily: FONTS.interRegular, textAlign: 'center', marginBottom: 24 }}>{mensajeErrorGuardado}</Text>
                <TouchableOpacity
                  style={{ backgroundColor: 'rgba(239,68,68,0.15)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)', paddingVertical: 14, borderRadius: 14, width: '100%', alignItems: 'center' }}
                  onPress={() => setEstadoGuardado('idle')}
                >
                  <Text style={{ color: '#ef4444', fontFamily: FONTS.interSemiBold, fontSize: 16 }}>Revisar Formulario</Text>
                </TouchableOpacity>
              </>
            )}

          </View>
        </View>
      </Modal>

      {/* ── Flujo de compra de plan: 4 modales encadenados por setTimeout
          (ver confirmarMejoraPlan arriba) — selección → confirmar → éxito →
          bienvenida. Estilos con colores hardcodeados en línea (no COLORS/
          makeStyles) porque este flujo se escribió antes que el resto del
          archivo migrara al sistema de tema; funciona igual mientras el
          dashboard sea de tema oscuro fijo, pero no reacciona a claro/oscuro. */}
      {/* ── MODAL 1: SELECCIÓN DE PLAN (Mejorar) ── */}
      <Modal visible={showPlanUpgradeModal} transparent animationType="none">
        <View style={styles.modalOverlay}>
          <View style={[styles.sheetCard, { padding: 24, flex: 0.9 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
              <TouchableOpacity onPress={() => setShowPlanUpgradeModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { marginLeft: 16, marginBottom: 0 }]}>Planes y Facturación</Text>
            </View>

            <TouchableOpacity style={s.changeTarjetaBtn} onPress={() => { setShowPlanUpgradeModal(false); abrirCardModal(); }}>
              <Text style={[s.changeTarjetaText, { textAlign: 'center', fontSize: 13, paddingVertical: 4 }]}>Ver credenciales de pago</Text>
            </TouchableOpacity>

            <Text style={[styles.fieldLabel, { marginTop: 20, marginBottom: 10 }]}>Elige un nuevo plan</Text>

            {/* Selector de período Mensual / Anual */}
            <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 4, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: periodoPlanes === 'mensual' ? '#8b5cf6' : 'transparent' }}
                onPress={() => cambiarPeriodoPlanes('mensual')}
              >
                <Text style={{ color: '#fff', fontFamily: FONTS.interSemiBold, fontSize: 14 }}>Mensual</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: periodoPlanes === 'anual' ? '#8b5cf6' : 'transparent' }}
                onPress={() => cambiarPeriodoPlanes('anual')}
              >
                <Text style={{ color: '#fff', fontFamily: FONTS.interSemiBold, fontSize: 14 }}>Anual</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: 12 }} showsVerticalScrollIndicator={false}>
              {obtenerPlanesVisibles().map((p) => {
                // Un plan contratado lo define el par (plan + ciclo de
                // facturación): "Básico mensual" y "Básico anual" son
                // suscripciones distintas. Por eso "Tu plan actual" solo se
                // marca cuando coinciden AMBOS con la pestaña visible; en la
                // pestaña contraria la tarjeta queda seleccionable como un
                // cambio de ciclo, en vez de aparecer marcada por error.
                const cicloActual = perfil?.cicloFacturacion ?? 'mensual';
                const esPlanActual = perfil?.plan === p.id && cicloActual === periodoPlanes;
                const mismoPlanOtroCiclo = perfil?.plan === p.id && !esPlanActual;
                const estaSeleccionado = planSeleccionado === p.id;
                return (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    { padding: 18, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.02)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.15)', marginBottom: 12 },
                    esPlanActual && { borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.05)' },
                    // La selección se pinta con el morado de la marca y un
                    // borde más grueso, para que se distinga de un vistazo del
                    // verde de "Tu plan actual" (que es un estado, no una
                    // elección).
                    estaSeleccionado && { borderColor: '#8b5cf6', borderWidth: 2, backgroundColor: 'rgba(139,92,246,0.10)' },
                  ]}
                  onPress={() => {
                    // Tocar la tarjeta ya no compra: solo marca el plan. El
                    // cobro arranca en iniciarSuscripcion(), con el botón de
                    // abajo — así el usuario ve qué eligió antes de pagar.
                    if (esPlanActual) return;
                    setPlanSeleccionado(p.id as 'mensual' | 'premium');
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <Ionicons
                        name={estaSeleccionado ? 'radio-button-on' : 'radio-button-off'}
                        size={18}
                        color={estaSeleccionado ? '#a78bfa' : 'rgba(255,255,255,0.25)'}
                      />
                      <Text style={{ fontFamily: FONTS.soraBold, fontSize: 16, color: '#fff' }}>{p.nombre}</Text>
                    </View>
                    <Text style={{ fontFamily: FONTS.soraBold, fontSize: 16, color: '#a78bfa' }}>{p.precio}</Text>
                  </View>
                  <View style={{ marginTop: 10, gap: 5 }}>
                    {p.beneficios.map((ben, i) => (
                      <Text key={i} style={{ color: 'rgba(255,255,255,0.6)', fontFamily: FONTS.interRegular, fontSize: 13 }}>• {ben}</Text>
                    ))}
                  </View>
                  {esPlanActual && (
                    <Text style={{ color: '#10b981', fontFamily: FONTS.interSemiBold, fontSize: 12, marginTop: 8 }}>Tu plan actual</Text>
                  )}
                  {mismoPlanOtroCiclo && (
                    <Text style={{ color: '#a78bfa', fontFamily: FONTS.interSemiBold, fontSize: 12, marginTop: 8 }}>
                      {periodoPlanes === 'anual' ? 'Cambiar a facturación anual' : 'Cambiar a facturación mensual'}
                    </Text>
                  )}
                  {estaSeleccionado && (
                    <Text style={{ color: '#a78bfa', fontFamily: FONTS.interSemiBold, fontSize: 12, marginTop: 8 }}>
                      Seleccionado
                    </Text>
                  )}
                </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Pie fijo del modal: resume qué se va a cobrar y dispara el flujo.
                Deshabilitado mientras no haya un plan marcado. */}
            <TouchableOpacity
              style={{
                marginTop: 14,
                paddingVertical: 15,
                borderRadius: 14,
                alignItems: 'center',
                backgroundColor: planSeleccionado ? '#8b5cf6' : 'rgba(255,255,255,0.06)',
                borderWidth: 1,
                borderColor: planSeleccionado ? '#8b5cf6' : 'rgba(255,255,255,0.10)',
              }}
              onPress={iniciarSuscripcion}
              disabled={!planSeleccionado}
              activeOpacity={0.85}
            >
              <Text
                style={{
                  color: planSeleccionado ? '#fff' : 'rgba(255,255,255,0.45)',
                  fontFamily: FONTS.interSemiBold,
                  fontSize: 15,
                }}
              >
                {planSeleccionado ? 'Suscribirme a este plan' : 'Selecciona un plan para continuar'}
              </Text>
            </TouchableOpacity>

            {/* Aviso de método de pago faltante. Va DENTRO de este modal, como
                capa absoluta, y no como <Modal> propio: apilar dos Modal
                nativos mientras uno sigue abierto falla en iOS. */}
            {avisoSinTarjeta && (
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(7,5,15,0.88)',
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: 20,
                  borderRadius: 24,
                }}
              >
                <View style={{ backgroundColor: '#1a162b', borderRadius: 24, padding: 28, width: '100%', maxWidth: 340, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)' }}>
                  <Ionicons name="card-outline" size={54} color="#f59e0b" style={{ marginBottom: 14 }} />
                  <Text style={{ color: '#fff', fontSize: 18, fontFamily: FONTS.soraBold, marginBottom: 10, textAlign: 'center' }}>
                    Falta tu método de pago
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontFamily: FONTS.interRegular, fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 22 }}>
                    Todavía no tienes una tarjeta registrada, así que no podemos cobrar la suscripción. Al aceptar te llevamos a registrarla y retomamos la compra apenas la guardes.
                  </Text>
                  <TouchableOpacity
                    style={{ backgroundColor: '#f59e0b', paddingVertical: 13, borderRadius: 14, width: '100%', alignItems: 'center' }}
                    onPress={() => {
                      // Aceptar = ir a registrar la tarjeta. `pendingUpgradeAfterCard`
                      // hace que, al guardarla, vuelva solo el modal de confirmar
                      // compra con el plan y el período ya elegidos.
                      setAvisoSinTarjeta(false);
                      setPendingUpgradeAfterCard(true);
                      setShowPlanUpgradeModal(false);
                      abrirCardModal();
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={{ color: '#1a162b', fontFamily: FONTS.interSemiBold, fontSize: 15 }}>Aceptar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ── MODAL 2: CONFIRMAR COMPRA ── */}
      <Modal visible={showConfirmUpgradeModal} transparent animationType="none">
        <View style={{ flex: 1, backgroundColor: 'rgba(7,5,15,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#1a162b', borderRadius: 24, padding: 30, width: '100%', maxWidth: 340, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)' }}>
            {upgradeProcessing ? (
              <>
                <ActivityIndicator size="large" color="#8b5cf6" style={{ transform: [{ scale: 1.5 }], marginBottom: 24 }} />
                <Text style={{ color: '#fff', fontSize: 18, fontFamily: FONTS.soraBold, marginBottom: 8 }}>Procesando pago...</Text>
                <Text style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>Por favor espera, no cierres esta ventana.</Text>
              </>
            ) : (
              <>
                <Ionicons name="cart-outline" size={60} color={COLORS.primaryLight} style={{ marginBottom: 16 }} />
                <Text style={{ color: '#fff', fontSize: 20, fontFamily: FONTS.soraBold, marginBottom: 8, textAlign: 'center' }}>Confirmar Mejora</Text>
                <Text style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginBottom: 24, fontFamily: FONTS.interRegular }}>
                  {(() => {
                    const planInfo = obtenerPlanesVisibles().find(x => x.id === planToUpgrade);
                    return `¿Seguro que deseas actualizar al ${planInfo?.nombre}? Se cobrará ${planInfo?.precio} a tu método de pago.`;
                  })()}
                </Text>
                <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                  <TouchableOpacity style={{ flex: 1, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }} onPress={() => setShowConfirmUpgradeModal(false)}>
                    <Text style={{ fontSize: 14, fontFamily: FONTS.interMedium, color: COLORS.textMuted }}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ flex: 1, height: 44, borderRadius: 12, backgroundColor: COLORS.primaryDark, alignItems: 'center', justifyContent: 'center' }} onPress={confirmarMejoraPlan}>
                    <Text style={{ fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary }}>Pagar</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── MODAL 3: COMPRA EXITOSA ── */}
      <Modal visible={showUpgradeSuccessModal} transparent animationType="none">
        <View style={{ flex: 1, backgroundColor: 'rgba(7,5,15,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#1a162b', borderRadius: 24, padding: 30, width: '100%', maxWidth: 340, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)' }}>
            <Ionicons name="checkmark-circle" size={80} color="#10b981" style={{ marginBottom: 16 }} />
            <Text style={{ color: '#fff', fontSize: 20, fontFamily: FONTS.soraBold, marginBottom: 8, textAlign: 'center' }}>¡Pago Realizado!</Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', fontFamily: FONTS.interRegular }}>Suscripción procesada correctamente.</Text>
          </View>
        </View>
      </Modal>

      {/* ── MODAL 4: BIENVENIDA NUEVO PLAN ── */}
      <Modal visible={showWelcomePlanModal} transparent animationType="none">
        <View style={{ flex: 1, backgroundColor: 'rgba(7,5,15,0.9)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#1a162b', borderRadius: 24, padding: 30, width: '100%', maxWidth: 360, alignItems: 'center', borderWidth: 1, borderColor: COLORS.gold + '55' }}>
            <Ionicons name="star" size={60} color={COLORS.gold || '#eab308'} style={{ marginBottom: 16 }} />
            <Text style={{ color: '#fff', fontSize: 22, fontFamily: FONTS.soraBold, marginBottom: 8, textAlign: 'center' }}>
              ¡Felicidades!
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginBottom: 20, fontFamily: FONTS.interRegular, fontSize: 15 }}>
              Ahora tienes acceso a las ventajas del <Text style={{ color: COLORS.gold || '#eab308', fontFamily: FONTS.interSemiBold }}>{PLAN_DISPLAY[newPlanInfo as keyof typeof PLAN_DISPLAY]?.nombre}</Text>.
            </Text>

            <View style={{ width: '100%', backgroundColor: 'rgba(0,0,0,0.3)', padding: 16, borderRadius: 12, marginBottom: 24, gap: 8 }}>
              {PLAN_DISPLAY[newPlanInfo as keyof typeof PLAN_DISPLAY]?.beneficios.map((ben, i) => (
                <Text key={i} style={{ color: COLORS.textPrimary, fontFamily: FONTS.interRegular, fontSize: 14 }}>✅ {ben}</Text>
              ))}
            </View>

            <TouchableOpacity
              style={{ backgroundColor: COLORS.gold || '#eab308', paddingVertical: 14, borderRadius: 14, width: '100%', alignItems: 'center' }}
              onPress={() => setShowWelcomePlanModal(false)}
            >
              <Text style={{ color: '#000', fontFamily: FONTS.interSemiBold, fontSize: 16 }}>Comenzar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── MODAL: VISTA DETALLADA DEL CANDIDATO (Reclutar) ── se abre desde
          SeccionKanban al tocar una tarjeta. Mismos colores hardcodeados en
          línea que el flujo de planes de arriba (p. ej. 'Sora-Bold' en vez
          de FONTS.soraBold) — funciona, pero es la excepción a como se
          escriben los estilos en el resto del archivo. */}
      <Modal visible={!!candidatoSeleccionado && !showRechazoModal} transparent animationType="none">
        <View style={styles.modalOverlay}>
          <View style={[styles.sheetCard, { padding: 0, overflow: 'hidden' }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* INFO VACANTE */}
              <View style={{ padding: 20, backgroundColor: 'rgba(139,92,246,0.1)' }}>
                <Text style={{ color: '#8b5cf6', fontFamily: 'Sora-Bold', fontSize: 14, marginBottom: 5 }}>POSTULACIÓN A:</Text>
                <Text style={{ color: '#fff', fontFamily: 'Sora-Bold', fontSize: 18 }}>{candidatoSeleccionado?.vacante_titulo || candidatoSeleccionado?.titulo_vacante || 'Vacante'}</Text>
              </View>

              {/* INFO ESTUDIANTE */}
              <View style={{ padding: 20, gap: 12 }}>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                  activeOpacity={0.7}
                  disabled={!candidatoSeleccionado?.estudiante_id}
                  onPress={() => setPerfilCandidatoId(candidatoSeleccionado?.estudiante_id ?? null)}
                >
                  <Text style={{ color: '#fff', fontSize: 20, fontFamily: 'Sora-Bold' }}>{candidatoSeleccionado?.estudiante_nombre}</Text>
                  {!!candidatoSeleccionado?.estudiante_id && (
                    <Ionicons name="chevron-forward-circle-outline" size={18} color="#a78bfa" />
                  )}
                </TouchableOpacity>
                <Text style={{ color: '#a78bfa', fontSize: 14 }}>{candidatoSeleccionado?.estudiante_carrera}</Text>

                <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: 12, borderRadius: 10, gap: 8 }}>
                  <Text style={{ color: '#fff' }}>📧 {candidatoSeleccionado?.estudiante_email || 'No visible'}</Text>
                  <Text style={{ color: '#fff' }}>📱 {candidatoSeleccionado?.estudiante_telefono || 'No visible'}</Text>
                  <Text style={{ color: '#fff' }}>🔗 {candidatoSeleccionado?.estudiante_linkedin || 'Sin redes'}</Text>
                  <Text style={{ color: '#10b981', marginTop: 5 }}>⏳ Horas de práctica: {candidatoSeleccionado?.estado_horas || 'En proceso'}</Text>
                </View>

                {/* ESTRELLAS (CALIFICACIÓN) */}
                <View style={{ alignItems: 'center', marginVertical: 10 }}>
                  <Text style={{ color: '#fff', marginBottom: 5, fontFamily: 'Inter-SemiBold' }}>Calificar a este candidato:</Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <TouchableOpacity key={star} onPress={() => handleCalificarEstudiante(star)}>
                        <Ionicons name={star <= ratingEstudiante ? 'star' : 'star-outline'} size={32} color="#eab308" />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <TouchableOpacity style={{ backgroundColor: '#4f46e5', padding: 12, borderRadius: 10, alignItems: 'center' }} onPress={() => descargarCV(candidatoSeleccionado?.cv_url)}>
                  <Text style={{ color: '#fff', fontFamily: 'Inter-SemiBold' }}>📄 Descargar CV (PDF)</Text>
                </TouchableOpacity>

                {/* CHATEAR CON EL CANDIDATO (chat directo empresa↔estudiante) */}
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 8,
                    backgroundColor: candidatoSeleccionado?.estudiante_id ? '#8b5cf6' : 'rgba(139,92,246,0.3)',
                    padding: 14,
                    borderRadius: 12,
                  }}
                  disabled={!candidatoSeleccionado?.estudiante_id}
                  onPress={handleChatearCandidato}
                >
                  <Ionicons name="chatbubble-outline" size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontFamily: 'Inter-SemiBold' }}>Chatear con Candidato</Text>
                </TouchableOpacity>

                {/* BOTONES DE ACCIÓN */}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 15 }}>
                  <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(239,68,68,0.2)', padding: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#ef4444' }} onPress={() => setShowRechazoModal(true)}>
                    <Text style={{ color: '#ef4444', fontFamily: 'Inter-SemiBold' }}>Rechazar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ flex: 1, backgroundColor: '#10b981', padding: 12, borderRadius: 10, alignItems: 'center' }} onPress={handleMandarEntrevista}>
                    <Text style={{ color: '#fff', fontFamily: 'Inter-SemiBold' }}>Mandar a Entrevista</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={{ marginTop: 10, padding: 10, alignItems: 'center' }} onPress={() => setCandidatoSeleccionado(null)}>
                  <Text style={{ color: 'rgba(255,255,255,0.6)' }}>Cerrar</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── SUB-MODAL: MOTIVO DE RECHAZO ── */}
      <Modal visible={showRechazoModal} transparent animationType="none">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#1a162b', padding: 24, borderRadius: 16 }}>
            <Text style={{ color: '#fff', fontSize: 18, fontFamily: 'Sora-Bold', marginBottom: 10 }}>Motivo del rechazo</Text>
            <TextInput
              style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', padding: 12, borderRadius: 10, minHeight: 80, textAlignVertical: 'top', marginBottom: 15 }}
              placeholderTextColor="rgba(255,255,255,0.4)"
              placeholder="Explica brevemente por qué no fue seleccionado..."
              multiline
              value={motivoRechazo}
              onChangeText={setMotivoRechazo}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={{ flex: 1, padding: 12, alignItems: 'center' }} onPress={() => setShowRechazoModal(false)}>
                <Text style={{ color: 'gray' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, backgroundColor: '#ef4444', padding: 12, borderRadius: 10, alignItems: 'center' }} onPress={handleRechazarCandidato}>
                <Text style={{ color: '#fff', fontFamily: 'Inter-SemiBold' }}>Confirmar Rechazo</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── SUB-MODAL: Horario al contratar (vacante individual) ──
          Solo horario: el pago/salario se acuerda de forma privada entre la
          empresa y el postulante (graduado), fuera de Gradly. */}
      <ProponerHorarioModal
        visible={!!horarioContratoApp}
        onClose={() => setHorarioContratoApp(null)}
        onSubmit={confirmarContratacion}
        title={`Horario · ${horarioContratoApp?.estudiante_nombre ?? ''}`}
        submitLabel="Confirmar contratación"
        showPago={false}
        helperText="El salario o pago se acuerda de forma directa y privada entre tu empresa y el postulante graduado, fuera de Gradly. Aquí solo defines el horario de trabajo."
      />
    </View>
    </LiquidBackground>
  );
}

// ─────────────────────────────────────────────
// SUB-COMPONENTES DE CADA SECCIÓN
// A partir de aquí el componente principal ya cerró (línea con el `}` de
// arriba). Cada función siguiente es un componente aparte que recibe sus
// datos por props — mismo patrón que dashboard-universidad.tsx: se separan
// para que renderSeccion() no tenga que definir JSX gigante en un switch.
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// SECCIÓN: INICIO
// ─────────────────────────────────────────────
function SeccionInicio({ metricas, apps, perfil, empresaId, vacantes, solicitudesGrupo, onVerPerfil }: {
  metricas: any; apps: Aplicacion[]; perfil: PerfilEmpresa | null; empresaId: string;
  vacantes: Vacante[]; solicitudesGrupo: SolicitudGrupo[]; onVerPerfil: (estudianteId: string) => void;
}) {
  const { s } = useThemedStyles();
  // Mismo criterio que el badge del encabezado: el rótulo depende del `plan`
  // real ('gratuito' → "Plan Gratuito", 'mensual' → "Plan Básico", 'premium' →
  // "⭐ Premium"), no del flag binario `premium`.
  const planKeyBadge = (perfil?.plan ?? 'gratuito') as 'gratuito' | 'mensual' | 'premium';
  const planBadgeLabel = useAutoText(
    planKeyBadge === 'premium' ? '⭐ Premium' : planKeyBadge === 'mensual' ? 'Plan Básico' : 'Plan Gratuito',
  );
  const recientes = [...apps].sort((a, b) => {
    const ta = a.fecha_aplicacion?.toDate?.()?.getTime() ?? 0;
    const tb = b.fecha_aplicacion?.toDate?.()?.getTime() ?? 0;
    return tb - ta;
  }).slice(0, 5);

  return (
    <ScrollView contentContainerStyle={s.scroll}>
      {/* ── Estadísticas de la Red Gradly ── */}
      <RedGradlyBanner />

      {/* Banner */}
      <GlassCard style={{ marginBottom: 16 }} contentStyle={{ flexDirection: 'row', alignItems: 'center', padding: 20 }}>
        <View style={{ flex: 1 }}>
          <Text style={s.bannerTitle}>Panel de control</Text>
          <Text style={s.bannerSub}>Gestiona tu empresa desde aquí</Text>
        </View>
        <View style={[s.planBadge, perfil?.premium && { borderColor: COLORS.gold + '44', backgroundColor: COLORS.gold + '11' }]}>
          <Text style={[s.planText, perfil?.premium && { color: COLORS.gold }]} noTranslate>
            {planBadgeLabel}
          </Text>
        </View>
      </GlassCard>

      {/* ── Calendario de hitos de la cuenta (registro, vacantes, pasantías) ── */}
      <CalendarioEventos uid={empresaId} rol="empresa" />

      {/* ── Tarjetas resumen agrupadas (Resumen / Análisis) ── */}
      <EmpresaHomeCards
        metricas={metricas}
        vacantes={vacantes}
        apps={apps}
        solicitudesGrupo={solicitudesGrupo}
      />

      {/* ── Matchmaking: solicitudes entrantes de universidades ── */}
      <View style={{ marginTop: 8, marginBottom: 16 }}>
        <SolicitudesEmpresa empresaId={empresaId} limiteAlianzas={perfil?.limiteAlianzas ?? 1} />
      </View>

      {/* Actividad reciente */}
      <Text style={s.sectionTitle}>Actividad reciente</Text>
      {recientes.length === 0
        ? <Text style={s.emptyText}>Sin actividad reciente.</Text>
        : recientes.map(a => (
            <TouchableOpacity
              key={a.id}
              style={s.actividadRow}
              activeOpacity={0.7}
              onPress={() => a.estudiante_id && onVerPerfil(a.estudiante_id)}
              disabled={!a.estudiante_id}
            >
              <View style={s.actividadDot} />
              <Text style={s.actividadText} numberOfLines={1}>
                {a.estudiante_nombre} — {a.estado.replace('_', ' ')}
              </Text>
            </TouchableOpacity>
          ))
      }
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
// SECCIÓN: VACANTES — lista de publicaciones propias con acciones rápidas
// (editar/eliminar/activar-pausar) y el aviso de cupo del plan.
// ─────────────────────────────────────────────
function SeccionVacantes({ vacantes, onNueva, onToggle, onVerDetalles, onEditar, onEliminar, puedeCrear, limiteVacantes, vacantesRestantes, plan, onMejorarPlan }: {
  vacantes: Vacante[]; onNueva: () => void; onToggle: (v: Vacante) => void;
  onVerDetalles: (v: Vacante) => void;
  onEditar: (v: Vacante) => void;
  onEliminar: (v: Vacante) => void;
  puedeCrear: boolean; limiteVacantes: number; vacantesRestantes: number;
  plan?: 'gratuito' | 'mensual' | 'premium';
  onMejorarPlan: () => void;
}) {
  const { s } = useThemedStyles();
  const ilimitado = limiteVacantes >= 9999;
  return (
    <View style={{ flex: 1 }}>
      <View style={s.vacantesHeader}>
        <JellyButton
          style={[s.nuevaBtn, !puedeCrear && { opacity: 0.45 }]}
          contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 0, paddingHorizontal: 18 }}
          onPress={puedeCrear ? onNueva : undefined}
        >
          <Ionicons name={puedeCrear ? 'add-circle-outline' : 'lock-closed-outline'} size={18} color={COLORS.textPrimary} />
          <Text style={s.nuevaBtnText}>Publicar nueva pasantía</Text>
        </JellyButton>
      </View>

      {/* Cupo del plan */}
      <View style={s.cupoRow}>
        <Ionicons name={puedeCrear ? 'information-circle-outline' : 'alert-circle-outline'} size={14} color={puedeCrear ? COLORS.textMuted : COLORS.warning} />
        {puedeCrear || ilimitado ? (
           <Text style={s.cupoText}>
             {ilimitado ? 'Plan Premium · vacantes ilimitadas' : `Te quedan ${vacantesRestantes} de ${limiteVacantes} vacantes activas en tu plan`}
           </Text>
        ) : (
           <TouchableOpacity onPress={onMejorarPlan} activeOpacity={0.7} style={{ flex: 1 }}>
             <Text style={[s.cupoText, { color: COLORS.warning, textDecorationLine: 'underline' }]}>
               Límite alcanzado ({limiteVacantes} activas). Pausa una o mejora tu plan.
             </Text>
           </TouchableOpacity>
        )}
      </View>
      <FlatList
        data={vacantes.filter(v => v.estado_moderacion !== 'eliminada')}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
        renderItem={({ item }) => {
          // Deshabilitada por un admin (no una pausa propia vía `onToggle`):
          // la empresa la sigue viendo, pero opaca y sin poder interactuar —
          // solo el admin puede revertir esto. Ver ModeracionVacanteGate.
          const deshabilitadaPorAdmin = item.estado_moderacion === 'deshabilitada';
          return (
            <GlassCard
              style={{ marginBottom: 8, opacity: deshabilitadaPorAdmin ? 0.5 : 1 }}
              contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}
            >
              <TouchableOpacity
                style={{ flex: 1 }}
                onPress={deshabilitadaPorAdmin ? undefined : () => onVerDetalles(item)}
                activeOpacity={deshabilitadaPorAdmin ? 1 : 0.7}
                disabled={deshabilitadaPorAdmin}
              >
                <AutoText style={s.vacanteTitle} numberOfLines={1}>{item.titulo}</AutoText>
                <Text style={s.vacanteMeta}>
                  {item.categoria === 'vacante' ? 'Vacante' : 'Pasantía'} · {item.area} · {item.modalidad} · {item.aplicantes_count ?? 0} aplicantes
                </Text>
                {/* Cupos y horario: se omiten en vacantes legadas (sin el campo). */}
                {textoCupos(item) && (
                  <Text style={s.vacanteCupos}>{textoCupos(item)}</Text>
                )}
                {textoHorario(item.horario) && (
                  <Text style={s.vacanteMeta}>{textoHorario(item.horario)}</Text>
                )}
              </TouchableOpacity>
              {deshabilitadaPorAdmin ? (
                <View style={{ alignItems: 'flex-end', maxWidth: 110, gap: 3 }}>
                  <Ionicons name="lock-closed-outline" size={16} color={COLORS.error} />
                  <Text style={{ fontSize: 10, fontFamily: FONTS.interSemiBold, color: COLORS.error, textAlign: 'right' }}>
                    Deshabilitada por admin
                  </Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <TouchableOpacity
                    style={s.editarBtn}
                    onPress={() => onEditar(item)}
                    hitSlop={8}
                    accessibilityLabel="Editar publicación"
                  >
                    <Ionicons name="create-outline" size={17} color={COLORS.primaryLight} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.editarBtn}
                    onPress={() => onEliminar(item)}
                    hitSlop={8}
                    accessibilityLabel="Eliminar publicación"
                  >
                    <Ionicons name="trash-outline" size={17} color={COLORS.error} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.toggleBtn, item.activa ? s.toggleBtnOn : s.toggleBtnOff]}
                    onPress={() => onToggle(item)}
                  >
                    <Text style={{ fontSize: 11, fontFamily: FONTS.interSemiBold, color: item.activa ? COLORS.success : COLORS.textMuted }}>
                      {item.activa ? 'Activa' : 'Inactiva'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </GlassCard>
          );
        }}
        ListEmptyComponent={<Text style={s.emptyText}>Sin vacantes publicadas.</Text>}
      />
    </View>
  );
}

// ─────────────────────────────────────────────
// SECCIÓN: KANBAN — tablero de reclutamiento con pestañas en vez de columnas
// lado a lado (más usable en pantallas angostas que un kanban horizontal
// clásico): una pestaña por estado, con botones "←"/"Avanzar →" en cada
// tarjeta para mover al candidato de una etapa a la siguiente/anterior.
// ─────────────────────────────────────────────
function SeccionKanban({ apps, onMover, onSeleccionar }: { apps: Aplicacion[]; onMover: (a: Aplicacion, s: string) => void; onSeleccionar: (a: Aplicacion) => void }) {
  const { s } = useThemedStyles();
  // ORDEN: secuencia real de estados en Firestore (se conserva para mover ←/→)
  const ORDEN = ['pendiente', 'en_revision', 'entrevista', 'contratado'];

  // Pestaña activa. OJO: los ids coinciden con los valores guardados en la BD
  // ('en_revision' lleva guion bajo) para no romper los filtros.
  const [estadoTab, setEstadoTab] = useState<'pendiente' | 'en_revision' | 'entrevista' | 'contratado'>('pendiente');

  // Pestañas reutilizando las etiquetas/orden de KANBAN_COLS.
  const TABS = KANBAN_COLS.map(col => ({ id: col.key, label: col.label, color: col.color }));

  // Lista filtrada al estado activo y posición en la secuencia.
  const filtered = apps.filter(a => a.estado === estadoTab);
  const idx = ORDEN.indexOf(estadoTab);

  // Mensaje amable de lista vacía por pestaña.
  const VACIO: Record<string, string> = {
    pendiente:   'No hay postulantes pendientes por revisar.',
    en_revision: 'No hay postulantes en revisión.',
    entrevista:  'No hay postulantes en entrevista.',
    contratado:  'Aún no has contratado a ningún postulante.',
  };

  return (
    <View style={{ flex: 1, padding: 16, paddingBottom: 110 }}>
      {/* ── Barra de pestañas horizontales ── */}
      <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 4, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(139,92,246,0.15)', gap: 4 }}>
        {TABS.map(tab => {
          const count = apps.filter(a => a.estado === tab.id).length;
          const isActive = estadoTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: isActive ? COLORS.primary : 'transparent' }}
              onPress={() => setEstadoTab(tab.id as any)}
            >
              <Text style={{ color: isActive ? '#fff' : COLORS.textMuted, fontFamily: FONTS.interSemiBold, fontSize: 12, textAlign: 'center' }}>
                {tab.label}{count > 0 ? ` (${count})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Contenedor unificado con la lista del estado activo ── */}
      <GlassCard style={{ flex: 1 }} contentStyle={{ flex: 1, padding: 12 }}>
        {filtered.length === 0 ? (
          <Text style={s.kanbanEmpty}>{VACIO[estadoTab]}</Text>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={item => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 8 }}
            renderItem={({ item: app }) => (
              <TouchableOpacity style={s.kanbanCard} activeOpacity={0.85} onPress={() => onSeleccionar(app)}>
                <Text style={s.kanbanNombre} numberOfLines={1}>{app.estudiante_nombre}</Text>
                <Text style={s.kanbanMeta}>{app.titulo_vacante ?? 'Vacante'}</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                  {idx > 0 && (
                    <JellyButton
                      style={s.kanbanMoveBtn}
                      contentStyle={{ paddingHorizontal: 10, paddingVertical: 5 }}
                      onPress={() => onMover(app, ORDEN[idx - 1])}
                    >
                      <Ionicons name="chevron-back" size={14} color={COLORS.textMuted} />
                    </JellyButton>
                  )}
                  {idx < ORDEN.length - 1 && (
                    <JellyButton
                      style={[s.kanbanMoveBtn, { backgroundColor: COLORS.primary12 }]}
                      contentStyle={{ paddingHorizontal: 10, paddingVertical: 5 }}
                      onPress={() => onMover(app, ORDEN[idx + 1])}
                    >
                      <Text style={{ fontSize: 11, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight }}>
                        Avanzar →
                      </Text>
                    </JellyButton>
                  )}
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </GlassCard>
    </View>
  );
}

// ─────────────────────────────────────────────
// SECCIÓN: PASANTÍAS ACTIVAS — junta los 2 caminos de admisión que puede
// tener una empresa: pasantes individuales (`apps` con estado 'contratado'/
// 'finalizado', el flujo del Kanban) y pasantías de grupo aprobadas por
// matchmaking universidad↔empresa (`solicitudesGrupo`, con su propia barra
// de progreso). El botón "Firmar constancia" solo aplica al camino individual.
// ─────────────────────────────────────────────
function SeccionActivas({ apps, solicitudesGrupo, onFirmar, onVerPerfil, empresaId, empresaNombre }: {
  apps: Aplicacion[]; solicitudesGrupo: SolicitudGrupo[]; onFirmar: (a: Aplicacion) => void;
  onVerPerfil: (estudianteId: string) => void;
  empresaId: string; empresaNombre: string;
}) {
  const { s } = useThemedStyles();
  const { t } = useTranslation();
  const activos    = apps.filter(a => a.estado === 'contratado' || a.estado === 'finalizado');
  const pendFirma  = apps.filter(a => a.estado === 'finalizado');
  const grupoActivas = solicitudesGrupo.filter(sg => sg.estado === 'aprobado' && sg.fechaInicio);

  // Bandeja de incidencias: va en ESTA sección y no en Inicio porque una
  // incidencia siempre habla de una pasantía en curso — es el mismo contexto.
  // Se dibuja aunque esté vacía: si solo apareciera cuando hay problemas, la
  // empresa nunca sabría que este canal existe hasta el día que lo necesita.
  const Incidencias = (
    <View style={{ marginBottom: 20 }}>
      <Text style={[s.activaNombre, { marginBottom: 10 }]}>{t('inc_titulo')}</Text>
      <BandejaIncidencias rol="empresa" uid={empresaId} nombreUsuario={empresaNombre} />
    </View>
  );

  // Encabezado con las pasantías de grupo y su línea de tiempo porcentual.
  const Grupos = grupoActivas.length === 0 ? null : (
    <View style={{ marginBottom: 16 }}>
      <Text style={[s.activaNombre, { marginBottom: 10 }]}>Pasantías de grupo</Text>
      {grupoActivas.map(sg => {
        const prog = progresoPorFechas(sg.fechaInicio, sg.fechaFin);
        // Con acuerdo firmado (el caso normal aquí, ya que `estado==='aprobado'`
        // siempre lo trae), el % y el contador vienen de horas REALES
        // trabajadas — más preciso que el % por fechas de calendario. Mismo
        // helper que usa "Mis Estudiantes" del lado universidad, para que
        // ambos vean el mismo avance de una misma pasantía.
        const progreso = progresoDeGrupo({}, sg.acuerdo);
        const pct = progreso.visible ? progreso.pct : prog.pct;
        const color = prog.estado === 'completado' ? COLORS.gold : prog.estado === 'en_curso' ? COLORS.success : COLORS.primaryLight;
        const conPago = sg.pago?.tipo === 'con_pago';
        return (
          <GlassCard key={sg.id} style={{ marginBottom: 8 }} contentStyle={{ padding: 16, gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={s.activaNombre} numberOfLines={1}>{sg.grupoNombre ?? 'Grupo'}</Text>
                <Text style={s.activaMeta} numberOfLines={1}>
                  {sg.carrera ?? ''}{sg.alumnos?.length ? ` · ${sg.alumnos.length} estudiante(s)` : ''}
                </Text>
              </View>
              <Text style={[s.activaNombre, { color }]}>{pct}%</Text>
            </View>
            <View style={{ height: 6, backgroundColor: COLORS.backgroundSurface, borderRadius: 3, overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${pct}%` as any, backgroundColor: color, borderRadius: 3 }} />
            </View>
            <Text style={s.activaMeta}>
              {progreso.visible
                ? progreso.label
                : prog.estado === 'por_iniciar'
                  ? `Inicia ${sg.fechaInicio}`
                  : `Día ${prog.diasTranscurridos} de ${prog.diasTotales} · ${sg.fechaInicio} → ${sg.fechaFin}`}
            </Text>
            <Text style={[s.activaMeta, conPago && { color: COLORS.success }]}>
              {conPago ? `Pago: $${Number(sg.pago?.monto ?? 0).toFixed(2)} / estudiante` : 'Sin pago'}
            </Text>
          </GlassCard>
        );
      })}
      <Text style={[s.activaNombre, { marginTop: 14, marginBottom: 4 }]}>Pasantes individuales</Text>
    </View>
  );

  const Header = <>{Incidencias}{Grupos}</>;

  return (
    <FlatList
      data={activos}
      keyExtractor={item => item.id}
      ListHeaderComponent={Header}
      contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
      renderItem={({ item }) => {
        const necesitaFirma = item.estado === 'finalizado';
        return (
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={!item.estudiante_id}
            onPress={() => item.estudiante_id && onVerPerfil(item.estudiante_id)}
          >
            <GlassCard style={[{ marginBottom: 8 }, necesitaFirma && s.activaCardPendiente]} contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={s.activaNombre} numberOfLines={1}>{item.estudiante_nombre}</Text>
                {!!item.acuerdo && (
                  <Text style={s.activaMeta} numberOfLines={1}>
                    Horario: {item.acuerdo.dias.join(', ')} · {item.acuerdo.horaInicio} - {item.acuerdo.horaFin}
                  </Text>
                )}
                <Text style={s.activaMeta}>Horas: {item.horas_completadas ?? 0}</Text>
              </View>
              {necesitaFirma && (
                <JellyButton style={s.firmarBtn} contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8 }} onPress={() => onFirmar(item)}>
                  <Ionicons name="pencil-outline" size={14} color={COLORS.textPrimary} />
                  <Text style={s.firmarText}>Firmar constancia</Text>
                </JellyButton>
              )}
            </GlassCard>
          </TouchableOpacity>
        );
      }}
      ListEmptyComponent={<Text style={s.emptyText}>Sin pasantes activos.</Text>}
    />
  );
}

// ─────────────────────────────────────────────
// HELPERS UI — componentes de campo reutilizados en el formulario "Nueva
// Vacante" (y en algún otro punto de este archivo). Mismo espíritu que
// FloatInput/SelectInput en app/auth/registro.tsx: encapsulan label + input/
// chips + línea de error/info para no repetir ese bloque de JSX en cada
// campo del formulario.
// ─────────────────────────────────────────────
function FieldInput({ label, value, onChange, placeholder, multiline, keyboardType, error, valid, infoText, maxLength }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; multiline?: boolean; keyboardType?: any;
  /** Mensaje de error: si existe, borde rojo + texto rojo debajo. */
  error?: string;
  /** Si true (y sin error), borde verde. */
  valid?: boolean;
  /** Texto informativo permanente (verde) debajo del campo. */
  infoText?: string;
  maxLength?: number;
}) {
  const { styles, colors } = useThemedStyles();
  // Prioridad de color de borde: rojo (error) > verde (válido) > borde por defecto.
  const borderColor = error ? '#EF4444' : (valid ? '#22C55E' : colors.border);
  return (
    <>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.modalInput, { borderColor }, multiline && { height: 80, textAlignVertical: 'top' }]}
        value={value} onChangeText={onChange} placeholder={placeholder}
        placeholderTextColor={colors.textMuted} multiline={multiline}
        keyboardType={keyboardType ?? 'default'} selectionColor={colors.primary}
        maxLength={maxLength}
      />
      {!!error && <Text style={styles.fieldError}>{error}</Text>}
      {!!infoText && <Text style={styles.fieldInfo}>{infoText}</Text>}
    </>
  );
}

function PickerRow({ label, options, selected, onSelect, error }: {
  label: string; options: string[]; selected: string; onSelect: (v: string) => void;
  error?: string;
}) {
  const { styles } = useThemedStyles();
  return (
    <>
      <Text style={styles.fieldLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, marginBottom: 10 }}>
        {options.map(opt => (
          <TouchableOpacity
            key={opt}
            style={[styles.pickerChip, selected === opt && styles.pickerChipActive]}
            onPress={() => onSelect(opt)}
          >
            <Text style={[styles.pickerText, selected === opt && styles.pickerTextActive]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {!!error && <Text style={styles.fieldError}>{error}</Text>}
    </>
  );
}

// ─────────────────────────────────────────────
// ESTILOS
// Dos hojas separadas (mismo patrón que dashboard-universidad.tsx):
// `makeStyles` para el layout general (sidebar, header, modales, tarjeta de
// pago/plan), y `makeS` más abajo para las secciones internas (Inicio,
// Vacantes, Kanban, Activas). Ambas son funciones de `COLORS` para
// reconstruirse cuando cambia el tema — ver useThemedStyles() al inicio del
// archivo. Los nombres de cada propiedad son descriptivos por sí solos
// (headerAvatar, sidebarPlan, modalCancel, etc.); no se anota cada línea.
// ─────────────────────────────────────────────
const makeStyles = (COLORS: GradlyColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.backgroundDark, paddingTop: 10 },
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

  // Sidebar
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
  sidebarEmpresa: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  sidebarPlan: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, marginHorizontal: 8,
  },
  menuItemActive: { backgroundColor: COLORS.primary },
  menuLabel: { fontSize: 14, fontFamily: FONTS.interMedium, color: COLORS.textMuted },
  menuLabelActive: { color: COLORS.textPrimary },
  logoutItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 16, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  logoutLabel: { fontSize: 14, fontFamily: FONTS.interMedium, color: COLORS.error },

  // Main
  main: { flex: 1 },
  mainHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingLeft: 20, paddingRight: 150, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.backgroundCard,
  },
  // Header simplificado de "Mensajes" (tablet/web): una fila delgada en vez
  // del bloque de avatar/nombre — el paddingTop/paddingBottom más chico deja
  // la flecha "atrás" a la misma altura que la píldora flotante de arriba.
  mainHeaderChat: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 8, paddingLeft: 12, paddingRight: 150, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.backgroundCard,
  },
  mainHeaderBackBtn: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  mainTitle: { fontSize: 20, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
  mainGreeting: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textMuted },

  // Mi Perfil (cuenta)
  perfilCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 16, padding: 16, marginTop: 6,
    borderWidth: 1, borderColor: COLORS.border,
  },
  perfilNombre: { fontSize: 16, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
  perfilMeta: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted, marginTop: 2 },
  logoEditBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.backgroundCard,
  },
  logoEditText: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight, marginTop: 4 },

  // ── Plan actual (Mi Perfil) ──
  planBox: {
    borderRadius: 16, padding: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.primary35,
    backgroundColor: 'rgba(139,92,246,0.08)', gap: 8,
  },
  planBoxHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planBoxLabel: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight, letterSpacing: 0.5, textTransform: 'uppercase' },
  planBoxVerif: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(34,197,94,0.12)', borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  planBoxVerifText: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: COLORS.success },
  planBoxName: { fontSize: 18, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
  planBoxStats: { flexDirection: 'row', gap: 12, marginTop: 4 },
  planBoxStat: {
    flex: 1, alignItems: 'center', paddingVertical: 8,
    backgroundColor: COLORS.backgroundSurface, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  planBoxStatNum: { fontSize: 18, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
  planBoxStatLbl: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  planBoxBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    marginTop: 4, paddingVertical: 8, borderRadius: 10,
    backgroundColor: COLORS.primary12, borderWidth: 1, borderColor: COLORS.primary35,
  },
  planBoxBtnText: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },
  planRenewBox: {
    marginTop: 10, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  planRenewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planRenewTitle: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  planRenewDesc: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted, marginTop: 2 },

  // ── Método de pago (Mi Perfil) ──
  payCard: {
    borderRadius: 16, padding: 16, gap: 6,
    backgroundColor: COLORS.backgroundSurface,
    borderWidth: 1, borderColor: COLORS.border,
  },
  payCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  payCardTitle: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  payCardNumber: { fontSize: 17, fontFamily: FONTS.soraBold, color: COLORS.textPrimary, letterSpacing: 2 },
  payCardEmpty: { fontSize: 14, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  payCardAlias: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  payCardBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 6, paddingVertical: 10, borderRadius: 10,
    backgroundColor: COLORS.primary12, borderWidth: 1, borderColor: COLORS.primary35,
  },
  payCardBtnText: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },
  payNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  payNoteText: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted },

  // ── Errores de inputs (tarjeta) ──
  inputErr: { borderColor: COLORS.error },
  inputErrText: { fontSize: 11, fontFamily: FONTS.interMedium, color: COLORS.error, marginTop: 4 },

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

  // Modales
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center', padding: 20,
  },
  sheetCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: COLORS.border,
    maxHeight: '90%',
  },
  modalCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: COLORS.border, gap: 12,
  },
  modalTitle: { fontSize: 18, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
  modalDesc: {
    fontSize: 13, fontFamily: FONTS.interRegular,
    color: COLORS.textMuted, lineHeight: 20,
  },
  fieldLabel: {
    fontSize: 11, fontFamily: FONTS.interMedium,
    color: COLORS.primaryLight, marginBottom: 5, marginTop: 8, letterSpacing: 0.3,
  },
  modalInput: {
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    height: 46, paddingHorizontal: 14,
    fontSize: 14, fontFamily: FONTS.interRegular, color: COLORS.textPrimary,
    marginBottom: 6,
  },
  fieldError: {
    fontSize: 11, fontFamily: FONTS.interMedium,
    color: '#EF4444', marginBottom: 6, marginTop: -2,
  },
  fieldInfo: {
    fontSize: 11, fontFamily: FONTS.interRegular,
    color: '#22C55E', marginBottom: 6, marginTop: -2,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
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

  // Picker inline
  pickerChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: COLORS.backgroundSurface,
    borderWidth: 1, borderColor: COLORS.border,
  },
  pickerChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pickerText: { fontSize: 12, fontFamily: FONTS.interMedium, color: COLORS.textMuted },
  pickerTextActive: { color: COLORS.textPrimary },
});

// Estilos de secciones (s)
const makeS = (COLORS: GradlyColors) => StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 110 },

  // Detalles de Vacante: caja de horario/salario (mismo lenguaje visual).
  horarioBoxDetalle: {
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
    gap: 2,
  },

  // Inicio
  banner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 16, padding: 20, marginBottom: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  bannerTitle: { fontSize: 18, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
  bannerSub: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textMuted, marginTop: 4 },
  planBadge: {
    backgroundColor: COLORS.primary12, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: COLORS.primary35,
  },
  planText: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },
  metricasGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16,
  },
  metricCard: {
    flex: 1, minWidth: 120,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 14, padding: 14, gap: 4,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'flex-start',
  },
  metricValue: { fontSize: 28, fontFamily: FONTS.rajdhaniBold },
  metricLabel: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  sectionTitle: {
    fontSize: 15, fontFamily: FONTS.soraSemiBold,
    color: COLORS.textPrimary, marginBottom: 10, marginTop: 4,
  },
  actividadRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  actividadDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.primary,
  },
  actividadText: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textMuted, flex: 1 },
  emptyText: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textMuted, textAlign: 'center', padding: 24 },

  // Vacantes
  vacantesHeader: { padding: 16 },
  nuevaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.primaryDark,
    borderRadius: 14, height: 48, paddingHorizontal: 18,
    ...shadow({ color: COLORS.btnShadow, y: 4, blur: 12, opacity: 1, elevation: 6 }),
  },
  nuevaBtnText: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  cupoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingBottom: 8 },
  cupoText: { flex: 1, fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  vacanteRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,  
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 8,
  },
  vacanteTitle: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  vacanteMeta: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  vacanteCupos: { fontSize: 11.5, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight, marginTop: 3 },
  autoRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: COLORS.backgroundCard,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
    padding: 12, marginBottom: 14,
  },
  autoCheck: {
    width: 22, height: 22, borderRadius: 6, marginTop: 1,
    borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  autoCheckOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  avisoEdicion: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: COLORS.warning + '18',
    borderWidth: 1, borderColor: COLORS.warning + '55',
    borderRadius: 10, padding: 10, marginBottom: 10,
  },
  avisoEdicionTxt: { flex: 1, fontSize: 11.5, fontFamily: FONTS.interRegular, color: COLORS.textMuted, lineHeight: 16 },
  tagsLabel: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary, marginBottom: 3 },
  tagsHint: { fontSize: 11.5, fontFamily: FONTS.interRegular, color: COLORS.textMuted, marginBottom: 8, lineHeight: 16 },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  tagChip: {
    paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.backgroundCard,
  },
  tagChipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tagChipText: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  tagChipTextOn: { color: '#FFF', fontFamily: FONTS.interSemiBold },
  autoTitle: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  autoHint: { fontSize: 11.5, fontFamily: FONTS.interRegular, color: COLORS.textMuted, marginTop: 3, lineHeight: 16 },
  editarBtn: {
    width: 32, height: 32, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  toggleBtn: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10,
    borderWidth: 1,
  },
  toggleBtnOn: { borderColor: COLORS.success + '44', backgroundColor: COLORS.success + '11' },
  toggleBtnOff: { borderColor: COLORS.border, backgroundColor: COLORS.white4 },

  // Kanban
  kanbanCol: {
    width: 200, backgroundColor: COLORS.backgroundCard,
    borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: COLORS.border,
    maxHeight: 600,
  },
  kanbanColTitle: { fontSize: 13, fontFamily: FONTS.interSemiBold, marginBottom: 10 },
  kanbanCard: {
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 8,
  },
  kanbanNombre: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  kanbanMeta: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  kanbanMoveBtn: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    backgroundColor: COLORS.backgroundCard,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center',
  },
  kanbanEmpty: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted, textAlign: 'center', padding: 16 },

  // Activas
  activaCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 8,
  },
  activaCardPendiente: { borderColor: COLORS.warning + '44' },
  activaNombre: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  activaMeta: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  firmarBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.primaryDark,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  firmarText: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },

  // Método de pago (Mi Perfil / modal de plan)
  changeTarjetaBtn: {
    backgroundColor: COLORS.primary12, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  changeTarjetaText: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },
});