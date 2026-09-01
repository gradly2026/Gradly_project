// ════════════════════════════════════════════════════════════════════════
// app/(tabs)/index.tsx — pestaña "Inicio" del estudiante (feed de vacantes)
//
// GUÍA PARA PRINCIPIANTES:
// Esta es la pantalla MÁS COMPLEJA del recorrido del estudiante: el feed
// principal que ve al abrir la app. Su particularidad es que NO muestra
// siempre lo mismo — según la SITUACIÓN del estudiante, muestra una de 3
// vistas completamente distintas:
//   1. Ya culminó su práctica/está graduado → feed completo de vacantes,
//      puede aplicar directamente.
//   2. Está en una pasantía activa ahora mismo → ve el mercado en modo
//      SOLO LECTURA (para "ubicarse"), no puede aplicar a nada nuevo.
//   3. Todavía no tiene pasantía → ve el tablero de cupos que su
//      universidad le aseguró + pasantías de otras empresas a las que
//      puede aplicar por su cuenta (autoservicio), salvo que su carrera
//      sea de "Zona Roja" (Salud/Educación/Derecho), en cuyo caso no ve
//      autoservicio en absoluto.
// Es un excelente ejemplo de: múltiples onSnapshot combinados para
// derivar un solo "estado de negocio", filtrado/ordenamiento de listas en
// el cliente con useMemo, "debounce" de un campo de búsqueda, y consultas
// `in` de Firestore troceadas de 30 en 30 (un límite real de Firestore).
// ════════════════════════════════════════════════════════════════════════

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
// documentId(): una función especial de Firestore que, usada dentro de
// where(documentId(), 'in', listaDeIds), permite filtrar documentos POR
// SU PROPIO ID (en vez de por el valor de un campo normal) — se usa más
// abajo para leer varios perfiles de empresa a la vez, dados sus ids.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  aplicarAVacante,
  estudianteHabilitadoParaVacantes,
  inscribirseAPasantiaIndependiente,
} from '../../src/services/pasantiaService';
// Las 3 funciones de pasantiaService.ts ya comentadas a fondo en ese
// archivo: deciden si el estudiante puede aplicar a vacantes "normales",
// permiten aplicar por cuenta propia a una pasantía, y calculan la
// elegibilidad.
import { abrirChatDirectoEmpresaEstudiante } from '../../src/services/chatService';
import { showAlert } from '../../src/components/AppAlert';
import { esVacanteAfin, puntuarVacante } from '../../src/data/areas';
// esVacanteAfin(carrera, vacante) → true/false: ¿esta vacante es del área
// de la carrera del estudiante?
// puntuarVacante(carrera, skills, vacante) → un número: qué tan bien
// "encaja" esa vacante con el perfil del estudiante (se usa para
// ORDENAR el feed, mostrando primero lo más afín).
import { hayCupos, sePuedeTomar, textoSalario } from '../../src/utils/cupos';
import { cargarOverridesCarreras, mensajeZonaRoja, zonaDeCarrera } from '../../src/data/carreras';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  // FlatList: el componente de React Native OPTIMIZADO para listas
  // largas — a diferencia de dibujar un .map() dentro de un ScrollView
  // normal (que renderiza TODOS los elementos de una vez, aunque no se
  // vean en pantalla), FlatList solo dibuja los elementos que están
  // (o están por entrar) en el área visible, reciclando las filas que
  // salen de vista — fundamental para que un feed con cientos de
  // vacantes siga siendo fluido.
  Image,
  Platform,
  ScrollView,
  StyleSheet,


  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import { useTranslation } from '../../src/context/TranslationContext';
// useTranslation() da acceso a t('clave'): traducción INSTANTÁNEA desde el
// catálogo local (src/locales/es.json / en.json), sin esperar a la red —
// a diferencia de AutoText, que traduce en vivo y con un parpadeo inicial.
// Se usa para todo el texto FIJO de esta pantalla; AutoText se queda solo
// para el texto que escribieron las empresas (títulos de vacante, etc.).
import { db } from '../../src/config/firebaseConfig';
import { COLORS, FONTS, useTheme, type GradlyColors } from '../../src/context/ThemeContext';
import { LiquidBackground } from '../../components/ui/liquid-glass/LiquidBackground';
import MiInstitucionCard from '../../src/components/MiInstitucionCard';
// Línea de identidad "UES · Grupo 2026-A" bajo el saludo: le recuerda al
// estudiante a qué universidad y grupo pertenece, dato que ya estaba en su
// perfil pero no se mostraba en ninguna pantalla.
import { GlassCard } from '../../components/ui/liquid-glass/GlassCard';
import { JellyButton } from '../../components/ui/liquid-glass/JellyButton';
import VacanteDetailModal from '../../src/components/VacanteDetailModal';
import InscripcionExitoModal from '../../src/components/InscripcionExitoModal';
import SelloEmpresa from '../../src/components/SelloEmpresa';
// "Sello" visual (oro/plata/bronce) que indica el prestigio/rango de una
// empresa, calculado a partir de su experiencia acumulada (XP) en la
// plataforma — parte del mismo sistema de gamificación usado con
// estudiantes.
import TableroCupos from '../../src/components/TableroCupos';
import { useReclamosUniversidad } from '../../src/hooks/useReclamosUniversidad';
// Reservas de cupos de la universidad del estudiante — mismo listener que usa
// TableroCupos. Aquí sirve para NO ofrecer en "Otras pasantías" una pasantía
// cuyo cupo ya está reservado para él (evita que salga por partida doble).
import MercadoLaboralStats from '../../src/components/MercadoLaboralStats';
// Componente que muestra estadísticas generales del "mercado" (cuántas
// vacantes hay, en qué áreas, etc.) — se ve cuando el estudiante está en
// modo solo-lectura (situación 2 de arriba).
import { AutoText, AutoText as Text, AutoTextInput as TextInput } from '../../src/components/AutoText';
// Aquí se importa AutoText de 2 formas: como `AutoText` (nombre normal) y
// como alias `Text`, para que cada <Text> de la pantalla se auto-traduzca.
// Ojo con el reparto de responsabilidades en este archivo: AutoText queda
// para el texto que ESCRIBIERON LAS EMPRESAS (título de la vacante, sus
// skills), que no puede estar en ningún catálogo por adelantado; todo el
// texto FIJO de la interfaz pasa ahora por t() (ver el import de
// TranslationContext más abajo).
import { calcularRango, type RangoTier } from '../../src/services/feedbackService';
// calcularRango(xp, 'empresa') → dado el puntaje de experiencia de una
// empresa, calcula su "tier" (rango): 'bronce' | 'plata' | 'oro' — mismo
// sistema de gamificación que calcula niveles de estudiante, aplicado
// aquí a empresas.

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
  /** Derivados por Cloud Function (functions/src/aplicantes.ts): cuántos
   *  postularon y de qué carreras. Opcionales: las vacantes anteriores al
   *  contador no los tienen hasta que corra el backfill. */
  aplicantes_count?: number;
  aplicantes_por_carrera?: Record<string, number>;
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
const FRASES = ['feed_frase_1', 'feed_frase_2', 'feed_frase_3'];
// Frases motivacionales que rotan bajo el saludo. Se guardan como CLAVES
// de traducción (no como el texto en español) y se resuelven con t() en
// el render — así aparecen ya traducidas desde el primer fotograma.

const FILTROS = [
  { key: 'todas',       labelKey: 'feed_filtro_todas' },
  { key: 'Remoto',      labelKey: 'feed_filtro_remoto' },
  { key: 'Presencial',  labelKey: 'feed_filtro_presencial' },
  { key: 'Híbrido',     labelKey: 'feed_filtro_hibrido' },
];
// `key` es el valor REAL con el que se filtra la lista (debe seguir
// coincidiendo con `vacante.modalidad` tal como se guarda en Firestore, en
// español) — por eso no se traduce. `labelKey` es solo lo que LEE el
// usuario.

const HOY = new Date();
// Se calcula UNA sola vez, al cargar el archivo (no dentro del
// componente) — suficiente para esta pantalla, ya que la fecha "hoy" no
// necesita actualizarse en vivo mientras el usuario tiene la app abierta.

function relativeTime(ts: any, t: (k: string, p?: Record<string, string | number>) => string): string {
  // Convierte una fecha de Firestore a un texto relativo tipo "hace 3
  // días" — mucho más fácil de leer de un vistazo que una fecha exacta.
  // Recibe `t` como PARÁMETRO porque es una función suelta, no un
  // componente: los hooks (useTranslation) solo pueden llamarse dentro de
  // un componente, así que quien la llama le pasa su propia `t`.
  if (!ts) return '';
  const d: Date = ts.toDate ? ts.toDate() : new Date(ts);
  const days = Math.floor((HOY.getTime() - d.getTime()) / 86_400_000);
  if (days === 0) return t('feed_fecha_hoy');
  if (days === 1) return t('feed_fecha_1_dia');
  if (days < 7)  return t('feed_fecha_dias', { n: days });
  if (days < 30) return t('feed_fecha_semanas', { n: Math.floor(days / 7) });
  return t('feed_fecha_meses', { n: Math.floor(days / 30) });
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
  accionLabel,
}: {
  vacante: Vacante;
  yaAplico: boolean;
  estadoAplicacion: string;
  onAplicar?: (v: Vacante) => void;
  // Prop OPCIONAL (con "?"): en modo readOnly, quien use esta tarjeta
  // simplemente no le pasa esta función.
  onVerDetalle: (v: Vacante) => void;
  applying: boolean;
  empresaTier?: RangoTier;
  /** Solo lectura: puede navegar y ver el detalle, pero el botón Aplicar
   * queda deshabilitado (estudiante en pasantía activa, aún no graduado). */
  readOnly?: boolean;
  /** Texto del botón cuando aún no se ha aplicado (por defecto "Aplicar").
   * El autoservicio de pasantías lo pone en "Inscribir": ahí el clic inscribe
   * al instante, no crea una aplicación pendiente. */
  accionLabel?: string;
}) {
  const { styles } = useThemedStyles();
  const { t } = useTranslation();
  const initial = vacante.nombre_empresa?.[0]?.toUpperCase() ?? '?';
  // La primera LETRA del nombre de la empresa, en mayúscula, usada como
  // "avatar" alternativo cuando no hay logo (ver logoFallback más abajo).

  const btnColor = readOnly
    ? COLORS.backgroundSurface
    : yaAplico
    ? estadoAplicacion === 'contratado' ? COLORS.success
    : estadoAplicacion === 'rechazado' ? COLORS.error
    : COLORS.warning
    : COLORS.primaryDark;
  // Una cadena de ternarios anidados (equivalente a varios "if/else if")
  // que calcula el color del botón según 4 posibles situaciones, en
  // orden de prioridad:
  //   1. readOnly → gris neutro (no se puede interactuar).
  //   2. Ya aplicó Y fue contratado → verde.
  //   3. Ya aplicó Y fue rechazado → rojo.
  //   4. Ya aplicó (cualquier otro estado, ej. pendiente) → ámbar.
  //   5. (ninguna de las anteriores) No ha aplicado todavía → morado
  //      oscuro normal (color por defecto del botón "Aplicar").

  const btnLabel = readOnly
    ? t('feed_btn_disponible_graduarte')
    : yaAplico
    ? estadoAplicacion === 'pendiente'  ? t('feed_btn_pendiente')
    : estadoAplicacion === 'en_revision'? t('feed_btn_en_revision')
    : estadoAplicacion === 'entrevista' ? t('feed_btn_entrevista')
    : estadoAplicacion === 'contratado' ? t('feed_btn_contratado')
    : estadoAplicacion === 'rechazado'  ? t('feed_btn_rechazado')
    : t('feed_btn_aplicado')
    : (accionLabel ?? t('accion_aplicar'));
  // Mismo patrón de cascada de ternarios, esta vez para el TEXTO del
  // botón, con más casos posibles según el estado exacto de la aplicación.

  const skillsVisible = vacante.skills_requeridas?.slice(0, 3) ?? [];
  // Muestra como máximo 3 habilidades requeridas en la tarjeta (para no
  // saturarla visualmente).
  const extraSkills   = (vacante.skills_requeridas?.length ?? 0) - 3;
  // Cuántas skills MÁS hay, aparte de las 3 mostradas (se usa para el
  // chip "+2" si hay más).

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
              // Solo se muestra el sello si es plata u oro (bronce, el
              // rango más básico, no se destaca visualmente).
              <View style={{ marginTop: 4 }}>
                <SelloEmpresa tier={empresaTier} />
              </View>
            )}
            <AutoText style={styles.titulo} numberOfLines={2}>{vacante.titulo}</AutoText>
            {/* El título usa AutoText (traducción dinámica) porque lo
                escribió la empresa; nombre_empresa arriba usa <Text>
                normal sin traducir — un nombre propio no debería
                traducirse (aunque aquí, a diferencia de otros archivos,
                no se usa explícitamente noTranslate; puede ser una
                inconsistencia menor sin impacto grave, ya que <Text>
                normal simplemente no pasa por el sistema de traducción en
                absoluto). */}
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
        <Text style={styles.dateText}>{relativeTime(vacante.fecha_publicacion, t)}</Text>
        <JellyButton
          style={[
            styles.aplicarBtn,
            { backgroundColor: btnColor },
            applying && { opacity: 0.6 },
            readOnly && { opacity: 0.7 },
          ]}
          contentStyle={{ paddingVertical: 8, paddingHorizontal: 18 }}
          onPress={() => !readOnly && !yaAplico && onAplicar?.(vacante)}
          // "onAplicar?.(vacante)" — optional chaining sobre una función:
          // si `onAplicar` no vino como prop (undefined), esta expresión
          // simplemente no hace nada, en vez de lanzar un error por
          // "intentar llamar algo que no es una función".
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
  // Componente pequeño y genérico reutilizado MUCHAS veces en la tarjeta
  // (tipo, modalidad, horas, salario, skills) — una "píldora" de color
  // configurable.
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
  const { t, language } = useTranslation();
  const { styles, colors } = useThemedStyles();
  const router = useRouter();
  const webScrollStyle = Platform.OS === 'web'
    ? ({ scrollbarColor: `${colors.primary35} ${colors.backgroundSurface}`, scrollbarWidth: 'thin' } as any)
    : undefined;

  const [vacantes,       setVacantes]       = useState<Vacante[]>([]);
  const [aplicaciones,   setAplicaciones]   = useState<Record<string, string>>({});
  // Un DICCIONARIO (no un array): la clave es el ID de la vacante, el
  // valor es el estado de la aplicación del estudiante a esa vacante
  // ('pendiente', 'contratado', etc.) — permite consultar
  // "¿ya apliqué a esta vacante puntual, y en qué estado quedó?" en
  // tiempo O(1) (instantáneo), en vez de recorrer un array completo cada
  // vez que se dibuja una tarjeta.
  const [applying,       setApplying]       = useState<string | null>(null);
  // Guarda el ID de la vacante a la que se está aplicando AHORA MISMO (o
  // null si ninguna) — se usa para mostrar el loader solo en el botón de
  // la tarjeta correcta, no en todas a la vez.
  const [searchInput,    setSearchInput]    = useState('');
  const [searchQuery,    setSearchQuery]    = useState('');
  // Dos estados separados para la búsqueda: `searchInput` refleja
  // INSTANTÁNEAMENTE lo que el usuario escribe (para que el campo de
  // texto se sienta responsivo), mientras `searchQuery` se actualiza con
  // RETRASO (debounce, ver más abajo) y es la que de verdad filtra la
  // lista — evita recalcular el filtrado completo en CADA tecla
  // presionada.
  const [filtroActivo,   setFiltroActivo]   = useState('todas');
  const [phraseIdx,      setPhraseIdx]      = useState(0);
  const [cargando,       setCargando]       = useState(true);
  const [vacanteDetalle, setVacanteDetalle] = useState<Vacante | null>(null);
  // Vacante recién inscrita → dispara el modal de éxito (Fase C).
  const [inscripcionOk,  setInscripcionOk]  = useState<Vacante | null>(null);

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
  // GUÍA: notarás el patrón "X" + "XCargado" repetido varias veces en
  // este archivo (perfilCargado, acuerdoCargado, cupoCargado). Cada
  // bandera "Cargado" existe porque este componente combina VARIAS
  // fuentes de datos asíncronas para decidir QUÉ VISTA mostrar — y
  // mientras no se sepa el resultado de TODAS ellas, no se puede decidir
  // con certeza en cuál de las 3 situaciones está el estudiante. Mostrar
  // la vista equivocada aunque sea un instante (por ejemplo, mostrarle el
  // feed completo a alguien que en realidad está en pasantía activa,
  // solo porque esa lectura en particular todavía no llegó) sería peor
  // que mostrar un loader un poco más de tiempo.

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
  // ¿el contenido de los chips de filtro es más ancho que el espacio
  // visible? (con 8px de margen de tolerancia) — si es así, hacen falta
  // las flechas de navegación.
  const canScrollLeft = filtrosScrollX > 4;
  const canScrollRight = filtrosScrollX < Math.max(0, filtrosContentW - filtrosViewportW - 4);
  const moverFiltros = useCallback((delta: number) => {
    const siguiente = Math.max(0, Math.min(
      filtrosScrollX + delta,
      Math.max(0, filtrosContentW - filtrosViewportW),
    ));
    // Math.max(0, Math.min(..., límite)) es el patrón "clamp" (acotar):
    // asegura que el nuevo punto de scroll nunca sea negativo NI se pase
    // del máximo posible, sin importar cuánto sea `delta`.
    filtrosScrollRef.current?.scrollTo({ x: siguiente, animated: true });
    setFiltrosScrollX(siguiente);
  }, [filtrosContentW, filtrosScrollX, filtrosViewportW]);
  const toastY        = useRef(new Animated.Value(20)).current;

  // Nombre del estudiante
  const nombre = (userProfile as any)?.nombre_completo?.split(' ')[0] ?? t('feed_estudiante');
  // .split(' ')[0] toma solo la PRIMERA palabra del nombre completo (el
  // primer nombre), para un saludo más cercano ("Hola, Ana!" en vez de
  // "Hola, Ana María Pérez López!").
  const fecha  = HOY.toLocaleDateString(language === 'en' ? 'en-US' : 'es-SV', { weekday: 'long', day: 'numeric', month: 'long' });
  // La fecha larga la formatea el SISTEMA OPERATIVO, no nuestro catálogo:
  // por eso aquí no va t(), sino el código de idioma correspondiente —
  // así "lunes 25 de agosto" se vuelve "Monday, August 25" solo.

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
  // Carga (una sola vez) posibles cambios que un administrador haya hecho
  // a la clasificación Zona Verde/Roja de las carreras, guardados en
  // Firestore — sin esto, `zonaDeCarrera()` solo usaría el catálogo fijo
  // programado de antemano, ignorando cambios recientes hechos desde el
  // panel admin.

  // ── ¿Tiene una pasantía activa ahora mismo? (distinto de "graduado") ──
  const tienePasantiaActiva = useMemo(
    () => Object.values(aplicaciones).includes('contratado') || tieneAcuerdoAprobado || tieneCupoTomado,
    [aplicaciones, tieneAcuerdoAprobado, tieneCupoTomado],
  );
  // Combina las 3 posibles VÍAS por las que un estudiante puede tener una
  // pasantía activa: (a) una aplicación individual en estado
  // 'contratado', (b) un acuerdo de grupo aprobado, o (c) un cupo tomado
  // del reparto por lote. Object.values(aplicaciones) convierte el
  // diccionario de aplicaciones en un array de solo sus VALORES (los
  // estados), y .includes('contratado') revisa si alguno de ellos es
  // exactamente 'contratado'.

  // Carrera del estudiante + si cae en Zona Roja (Salud/Educación/Derecho):
  // esos estudiantes NUNCA ven la sección de autoservicio a pasantías, sin
  // excepción — siguen dependiendo 100% de lo que les asegure su universidad.
  const miCarrera = perfilEstudiante?.carrera ?? (userProfile as any)?.carrera;
  const zonaRoja = useMemo(
    () => (miCarrera ? zonaDeCarrera(miCarrera) === 'roja' : false),
    [miCarrera],
  );

  // ── Cupos que la universidad ya reservó para este alumno ────────────
  // Si su universidad reservó cupos de una pasantía para su grupo, esa
  // pasantía se maneja desde <TableroCupos/> — no debe salir ADEMÁS en la
  // lista de autoservicio "Otras pasantías" (antes aparecía por partida
  // doble). Solo se excluye si el cupo sigue siendo tomable por él
  // (`sePuedeTomar`): si venció o se agotó, el autoservicio vuelve a ser su
  // vía de respaldo y la pasantía debe reaparecer.
  const reclamosUniversidad = useReclamosUniversidad(
    perfilEstudiante?.universidad_id ?? (userProfile as any)?.universidad_id,
  );
  const vacantesConCupoReservado = useMemo(() => {
    const ahora = Date.now();
    const miGrupo = perfilEstudiante?.grupo_id;
    return new Set(
      reclamosUniversidad
        .filter(r => !r.grupoId || r.grupoId === miGrupo)
        .filter(r => sePuedeTomar(r, ahora))
        .map(r => r.vacanteId)
        .filter(Boolean),
    );
  }, [reclamosUniversidad, perfilEstudiante?.grupo_id]);

  // ── Sello de prestigio de la empresa por vacante ────────────────
  // Resolvemos el tier (oro/plata/bronce) de las empresas de las vacantes
  // visibles a partir de su XP, cacheando para no releer en cada snapshot.
  const [empresaTiers, setEmpresaTiers] = useState<Record<string, RangoTier>>({});
  useEffect(() => {
    const pendientes = Array.from(
      new Set(vacantes.map(v => v.empresa_id).filter(Boolean)),
    ).filter(id => !(id in empresaTiers));
    // Calcula la lista de IDs de empresa que aparecen en las vacantes
    // actuales pero que TODAVÍA no se han consultado (no están en el
    // caché `empresaTiers`). "new Set(...)" elimina duplicados (varias
    // vacantes pueden ser de la misma empresa) y Array.from(...) lo
    // vuelve a convertir en array para poder usar .filter().
    if (pendientes.length === 0) return;
    // Si no hay ninguna empresa pendiente de consultar, no hace nada
    // (evita peticiones innecesarias a Firestore).

    let cancelado = false;
    (async () => {
      const nuevos: Record<string, RangoTier> = {};
      // Firestore limita `in` a 30 ids por consulta.
      for (let i = 0; i < pendientes.length; i += 30) {
        const lote = pendientes.slice(i, i + 30);
        // GUÍA IMPORTANTE: Firestore tiene un límite TÉCNICO real: una
        // consulta `where(documentId(), 'in', lista)` acepta como máximo
        // 30 valores en esa lista. Si hubiera, por ejemplo, 75 empresas
        // distintas pendientes, este bucle las trocea en 3 lotes de hasta
        // 30 cada uno (0-29, 30-59, 60-74) y hace UNA consulta por lote.
        try {
          const snap = await getDocs(
            query(collection(db, 'perfiles_empresas'), where(documentId(), 'in', lote)),
          );
          // where(documentId(), 'in', lote) → "documentos cuyo PROPIO ID
          // (no un campo interno) esté dentro de esta lista" — una forma
          // eficiente de leer VARIOS documentos conocidos de una sola vez
          // (en vez de hacer una consulta getDoc() separada por cada uno).
          snap.docs.forEach(d => {
            nuevos[d.id] = calcularRango(Number((d.data() as any).puntos_experiencia ?? 0), 'empresa').tier;
          });
        } catch (e) {
          console.warn('Error cargando tiers de empresas:', e);
        }
      }
      if (!cancelado && Object.keys(nuevos).length > 0) {
        setEmpresaTiers(prev => ({ ...prev, ...nuevos }));
        // Combina los tiers recién calculados con los que ya estaban en
        // caché (spread de `prev` + los `nuevos`), en vez de reemplazar
        // todo el diccionario — así no se pierden tiers ya calculados en
        // ejecuciones anteriores de este mismo efecto.
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
      // Convierte la lista de aplicaciones (documentos) en el diccionario
      // { vacanteId: estado } explicado arriba.
    });
    return unsub;
  }, [user]);

  // ── Rotación de frases motivacionales ───────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(phraseOpacity, { toValue: 0, duration: 400, useNativeDriver: Platform.OS !== 'web' })
        .start(() => {
          // El callback de .start() se ejecuta CUANDO la animación de
          // desvanecer (fade out) termina: recién ahí se cambia el texto
          // (para que el cambio sea invisible, oculto detrás de la
          // opacidad 0) y se dispara la animación de vuelta (fade in).
          setPhraseIdx(p => (p + 1) % FRASES.length);
          // "(p + 1) % FRASES.length" avanza al siguiente índice, y
          // cuando llega al final de la lista, vuelve a 0 (el operador
          // módulo % hace que el conteo sea "circular").
          Animated.timing(phraseOpacity, { toValue: 1, duration: 400, useNativeDriver: Platform.OS !== 'web' }).start();
        });
    }, 5000);
    // Cada 5 segundos se repite el ciclo completo: desvanecer → cambiar
    // texto → aparecer.
    return () => clearInterval(interval);
  }, []);

  // ── Debounce búsqueda ────────────────────────────────────────────
  const handleSearch = useCallback((text: string) => {
    setSearchInput(text);
    // Actualiza el campo visible INMEDIATAMENTE (sin retraso), para que
    // escribir se sienta fluido.
    clearTimeout(debounceRef.current);
    // Cancela cualquier temporizador de "aplicar búsqueda" que hubiera
    // quedado pendiente de la tecla ANTERIOR.
    debounceRef.current = setTimeout(() => setSearchQuery(text), 350);
    // Programa un NUEVO temporizador: si el usuario no vuelve a escribir
    // en los próximos 350ms, recién ENTONCES se actualiza `searchQuery`
    // (la que de verdad dispara el filtrado de la lista). Este patrón se
    // llama "debounce" (retraso agrupado): si el usuario escribe rápido
    // "desarrollador", en vez de recalcular el filtro completo 13 veces
    // (una por letra), se recalcula UNA sola vez, 350ms después de la
    // última letra escrita.
  }, []);

  // ── Toast de éxito ───────────────────────────────────────────────
  // El mismo toast sirve para "aplicación enviada" (vacantes) y "te
  // inscribiste" (autoservicio de pasantía); el llamador fija el mensaje.
  const [toastMsg, setToastMsg] = useState(t('feed_toast_aplicacion'));
  const showToast = useCallback((msg?: string) => {
    if (msg) setToastMsg(msg);
    toastOpacity.setValue(0); toastY.setValue(20);
    // Reinicia los valores animados a su punto de partida (invisible, 20
    // píxeles más abajo) antes de animar, por si el toast se mostrara dos
    // veces seguidas sin terminar la animación anterior.
    Animated.parallel([
      Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(toastY, { toValue: 0, duration: 300, useNativeDriver: Platform.OS !== 'web' }),
      // Anima 2 valores A LA VEZ: la opacidad (aparece) y la posición
      // vertical (sube desde 20px más abajo hasta su posición final) —
      // el típico efecto "toast que sube y aparece".
    ]).start(() =>
      setTimeout(() =>
        Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: Platform.OS !== 'web' }).start(),
      2000),
      // Cuando la animación de ENTRADA termina, se espera 2 segundos y
      // luego se anima la SALIDA (solo la opacidad, de vuelta a 0).
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
    // "[...res].sort(...)" copia el array ANTES de ordenar (con spread),
    // porque .sort() ordena "en el lugar" (modifica el array original) —
    // copiarlo primero evita mutar `vacantes` (el estado original)
    // directamente, lo cual sería una mala práctica en React. La función
    // de comparación resta el puntaje de `b` menos el de `a`: cuando el
    // resultado es negativo, `a` va primero — así se ordena de MAYOR a
    // MENOR puntaje (los más afines, primero).

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      res = res.filter(v =>
        v.titulo.toLowerCase().includes(q) ||
        v.nombre_empresa.toLowerCase().includes(q) ||
        v.area?.toLowerCase().includes(q),
      );
      // Búsqueda simple de texto: coincide si el término buscado aparece
      // (sin importar mayúsculas/minúsculas) en el título, el nombre de
      // la empresa, O el área.
    }
    if (filtroActivo !== 'todas') {
      res = res.filter(v => v.modalidad === filtroActivo || v.area === filtroActivo);
    }
    return res;
  }, [vacantes, searchQuery, filtroActivo, perfilEstudiante, userProfile]);
  // useMemo: este cálculo (filtrar + ordenar) solo se vuelve a ejecutar
  // cuando cambia alguna de sus dependencias — no en CADA render de la
  // pantalla (por ejemplo, no se recalcula solo porque `applying` cambió).

  // ── Autoservicio de pasantías: para quien AÚN no tiene pasantía activa,
  // pasantías de OTRAS empresas afines a su carrera — camino aparte del que
  // le aseguró su universidad (ver <TableroCupos/> en el render). Vacío por
  // completo si es Zona Roja, o si ya está graduado/en pasantía (ese caso lo
  // cubren las otras 2 ramas del render).
  const pasantiasDisponibles = useMemo(() => {
    if (habilitadoParaVacantes || tienePasantiaActiva || zonaRoja) return [];
    // Corta temprano: si el estudiante está en cualquiera de las otras 2
    // situaciones (o es Zona Roja), esta lista ni siquiera se calcula —
    // simplemente queda vacía.

    let res = vacantes.filter(v =>
      (v.categoria === 'pasantia' || (!v.categoria && v.tipo === 'Pasantía')) &&
      hayCupos(v) &&
      !vacantesConCupoReservado.has(v.id),
    );
    // A diferencia de filteredVacantes (que EXCLUYE las de categoría
    // 'pasantia'), aquí es al revés: se buscan JUSTO las de categoría
    // 'pasantia' (o legadas sin categoría pero con tipo "Pasantía") que
    // además TENGAN cupos disponibles (hayCupos) y NO tengan ya un cupo
    // reservado para este alumno (esas van en <TableroCupos/>, no aquí).

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
  }, [vacantes, searchQuery, filtroActivo, perfilEstudiante, miCarrera, habilitadoParaVacantes, tienePasantiaActiva, zonaRoja, vacantesConCupoReservado]);

  // ── Aplicar a vacante ────────────────────────────────────────────
  const handleAplicar = useCallback(async (vacante: Vacante) => {
    if (!user) { void showAlert(t('feed_alert_sesion')); return; }
    if (!habilitadoParaVacantes) {
      void showAlert(t('feed_alert_no_disp_titulo'), t('feed_alert_no_disp_msg'));
      return;
      // Doble verificación de seguridad: aunque el botón ya debería estar
      // deshabilitado visualmente en ese caso, esta comprobación evita
      // que la acción se ejecute si de alguna forma se llamara igual.
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
        void showAlert(t('error_generico'), err.message ?? t('feed_alert_error_aplicar'));
        // No muestra un Alert de error si el mensaje es "Ya aplicaste..."
        // — ese caso puede pasar por un doble toque accidental, y no hace
        // falta alarmar al usuario con un Alert por algo tan menor
        // (simplemente no se envía dos veces, sin más aviso).
      }
    } finally {
      setApplying(null);
    }
  }, [user, userProfile, showToast, habilitadoParaVacantes, t]);

  // ── Inscribirse a una pasantía por cuenta propia (autoservicio) ──────
  // Inscripción INMEDIATA: crea la asignación de cupo al instante (no una
  // aplicación "pendiente"). El feed pasa solo a "pasantía activa" en cuanto el
  // listener de asignaciones_cupo lo detecta. Universidad y empresa se enteran
  // por notificación + modal al iniciar sesión.
  const handleInscribirPasantia = useCallback(async (vacante: Vacante) => {
    if (!user) { void showAlert(t('feed_alert_sesion')); return; }

    setApplying(vacante.id);
    try {
      await inscribirseAPasantiaIndependiente(
        user.uid,
        vacante.id,
        vacante.empresa_id,
        {
          nombre_completo: (userProfile as any)?.nombre_completo ?? '',
          foto_url:        (userProfile as any)?.foto_url ?? '',
          universidad_id:  perfilEstudiante?.universidad_id ?? (userProfile as any)?.universidad_id ?? '',
          carrera:         miCarrera,
          grupo_id:        perfilEstudiante?.grupo_id ?? null,
        },
      );
      setInscripcionOk(vacante);
    } catch (err: any) {
      void showAlert(t('error_generico'), err.message ?? t('feed_alert_error_aplicar'));
    } finally {
      setApplying(null);
    }
  }, [user, userProfile, perfilEstudiante, miCarrera, t]);

  // ── Contactar empresa (chat directo estudiante↔empresa) ──────────
  const handleContactarEmpresa = useCallback(async (vacante: Vacante) => {
    if (!user?.uid || !vacante.empresa_id) {
      void showAlert(t('feed_alert_no_disponible_titulo'), t('feed_alert_chat_sin_empresa'));
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
      // Crea (o reutiliza, si ya existía) un chat directo entre este
      // estudiante y la empresa de la vacante, y devuelve su ID.
      setVacanteDetalle(null);
      router.push({ pathname: '/ChatScreen', params: { chatId, peerName: vacante.nombre_empresa ?? 'Empresa' } } as any);
      // Navega a la pantalla de chat, pasándole el ID recién obtenido y
      // el nombre de la empresa como parámetros de URL.
    } catch {
      void showAlert(t('error_generico'), t('feed_alert_chat_error'));
    }
  }, [user, userProfile, router, t]);

  // ── Empty state (parametrizable: se reutiliza en los 3 estados del feed) ──
  const EmptyState = ({
    icon = 'briefcase-outline',
    titulo = t('feed_empty_titulo'),
    desc = t('feed_empty_desc'),
  }: { icon?: keyof typeof Ionicons.glyphMap; titulo?: string; desc?: string }) => (
    <View style={styles.empty}>
      <Ionicons name={icon} size={56} color={COLORS.border} />
      <Text style={styles.emptyTitle}>{titulo}</Text>
      <Text style={styles.emptyDesc}>{desc}</Text>
    </View>
  );
  // Nota: EmptyState está definido DENTRO del componente FeedVacantes (no
  // fuera, como VacanteCard o Chip) — esto significa que se vuelve a
  // crear en CADA render de la pantalla. Para un componente tan simple no
  // representa un problema real de rendimiento, pero es una diferencia de
  // estilo respecto a los componentes definidos afuera.

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

  // ── "Vacantes de trabajo" (vista previa opaca, estado sin pasantía) ──
  // Debajo de las pasantías, el estudiante ve TODAS las vacantes afines a su
  // carrera pero atenuadas y sin poder postularse: aún no culmina su pasantía.
  // Cuando la culmine (rama `habilitadoParaVacantes`) verá justo estas mismas,
  // ya activas y sin pasantías. Se memoiza para no re-render toda la lista en
  // cada tecla o cambio de `applying`.
  const vacantesTrabajoPreview = useMemo(() => {
    if (zonaRoja || filteredVacantes.length === 0) return null;
    return (
      <View style={{ marginTop: 12 }}>
        <Text style={styles.pasantiasSectionLabel}>{t('feed_vacantes_trabajo')}</Text>
        <Text style={styles.vacantesTrabajoSub}>{t('feed_vacantes_trabajo_sub')}</Text>
        {filteredVacantes.map(item => (
          <View key={item.id} style={styles.vacanteTrabajoDim}>
            <VacanteCard
              vacante={item}
              yaAplico={false}
              estadoAplicacion=""
              onVerDetalle={setVacanteDetalle}
              applying={false}
              empresaTier={empresaTiers[item.empresa_id]}
              readOnly
            />
          </View>
        ))}
      </View>
    );
  }, [zonaRoja, filteredVacantes, empresaTiers, t, styles]);

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
            <Text style={styles.greeting} noTranslate>{t('feed_saludo', { nombre })}</Text>
            {/* noTranslate: el texto ya viene traducido por t(), y además
                lleva dentro un NOMBRE PROPIO — sin esto, AutoText lo
                mandaría al traductor y podría devolver el nombre del
                estudiante "traducido". */}
            <Animated.Text style={[styles.phrase, { opacity: phraseOpacity }]}>
              {t(FRASES[phraseIdx])}
              {/* Antes esto era useAutoText(FRASES[idx]): la frase estaba
                  escrita en español y se traducía por red. Ahora FRASES
                  guarda CLAVES y t() devuelve el texto ya traducido, sin
                  parpadeo. Se sigue usando <Animated.Text> (y no <Text>)
                  porque su opacidad se anima en cada rotación. */}
            </Animated.Text>
          </View>
          <Text style={styles.fecha}>{fecha}</Text>
        </View>

        {/* Universidad y grupo del estudiante (variante de una línea). */}
        <MiInstitucionCard
          universidadId={perfilEstudiante?.universidad_id ?? (userProfile as any)?.universidad_id}
          grupoId={perfilEstudiante?.grupo_id}
          variant="compacta"
        />

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
            placeholder={t('feed_buscar_placeholder')}
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
          {/* onLayout: un evento de React Native que se dispara cuando el
              componente termina de calcular su tamaño real en pantalla —
              se usa aquí para medir cuánto espacio VISIBLE hay disponible
              para los chips, y así decidir si hacen falta las flechas. */}
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
            // onContentSizeChange mide el ancho TOTAL del contenido
            // desplazable (todos los chips juntos, aunque no quepan en
            // pantalla) — junto con filtrosViewportW (el ancho visible),
            // permite calcular si hay espacio de sobra para desplazar.
            onScroll={(e) => setFiltrosScrollX(e.nativeEvent.contentOffset.x)}
            scrollEventThrottle={16}
            // scrollEventThrottle={16} limita la frecuencia con la que se
            // dispara onScroll a, como máximo, cada 16 milisegundos
            // (~60 veces por segundo) — evita sobrecargar la app con
            // actualizaciones de estado en cada micro-movimiento del dedo.
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
                  {t(f.labelKey)}
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
      {/* Este bloque es el CORAZÓN de la lógica "3 vistas distintas"
          explicada al inicio del archivo: primero se revisa si TODAVÍA
          faltan datos por cargar (loader), y si no, se decide entre 3
          ramas mutuamente excluyentes según la situación del estudiante. */}
      {cargando || !perfilCargado || !acuerdoCargado || !cupoCargado ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : habilitadoParaVacantes ? (
        // ── Graduado: feed completo, aplicar habilitado (sin cambios) ──
        <FlatList
          data={filteredVacantes}
          renderItem={({ item }) => (
            // "renderItem" es la función que FlatList llama por cada
            // elemento visible de `data`, para dibujar su fila — recibe
            // un objeto con `item` (el dato de esa posición).
            <VacanteCard
              vacante={item}
              yaAplico={item.id in aplicaciones}
              // "item.id in aplicaciones" comprueba si esa clave existe
              // en el diccionario (sin importar su valor).
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
            // Un componente que se dibuja UNA vez, arriba de toda la
            // lista (no se repite por cada elemento) — aquí, el banner
            // explicativo.
            <EstadoBanner texto={t('feed_banner_graduado')} />
          }
          ListEmptyComponent={<EmptyState />}
          // Se dibuja SOLO si `data` está vacío, en vez de ListHeaderComponent.
          keyExtractor={item => item.id}
          // keyExtractor: le dice a FlatList cómo obtener una `key` única
          // por cada elemento (equivalente al `key` que se pone a mano en
          // un .map() normal).
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
              // No se pasa onAplicar en absoluto — VacanteCard ya sabe
              // manejar esa ausencia (ver "onAplicar?.(vacante)" arriba).
            />
          )}
          showsVerticalScrollIndicator
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          style={[{ flex: 1 }, webScrollStyle]}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 100, maxWidth: 640, alignSelf: 'center', width: '100%', flexGrow: 1 }}
          ListHeaderComponent={
            <>
              <EstadoBanner texto={t('feed_banner_pasantia_activa')} />
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
              onAplicar={handleInscribirPasantia}
              accionLabel={t('feed_btn_inscribir')}
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
                <EstadoBanner texto={t('feed_banner_sin_pasantia')} />
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
                <Text style={styles.pasantiasSectionLabel}>{t('feed_otras_pasantias')}</Text>
              )}
            </>
          }
          ListEmptyComponent={
            zonaRoja ? (
              <EmptyState
                icon="shield-checkmark-outline"
                titulo={avisoZonaRoja?.titulo ?? t('feed_zona_roja_titulo')}
                desc={avisoZonaRoja?.cuerpo ?? t('feed_zona_roja_desc')}
              />
            ) : vacantesTrabajoPreview ? (
              // Hay "Vacantes de trabajo" debajo: una nota compacta, no un vacío
              // de pantalla completa que empujaría esa sección fuera de vista.
              <View style={styles.pasantiasEmptyCompact}>
                <Text style={styles.emptyDesc}>{t('feed_empty_pasantias_desc')}</Text>
              </View>
            ) : (
              <EmptyState
                titulo={t('feed_empty_pasantias_titulo')}
                desc={t('feed_empty_pasantias_desc')}
              />
            )
          }
          ListFooterComponent={vacantesTrabajoPreview}
          keyExtractor={item => item.id}
        />
      )}

      {/* ── TOAST ── */}
      <Animated.View style={[styles.toast, { opacity: toastOpacity, transform: [{ translateY: toastY }] }]}>
        <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
        <Text style={styles.toastText}>{toastMsg}</Text>
      </Animated.View>

      {/* ── Detalle de vacante ── */}
      <VacanteDetailModal
        visible={!!vacanteDetalle}
        vacante={vacanteDetalle}
        onClose={() => setVacanteDetalle(null)}
        carreraEstudiante={miCarrera}
        // Solo el feed del estudiante manda esto: es lo que enciende el bloque
        // de "afín a tu carrera" y el conteo de postulantes dentro del modal.
        onContactarEmpresa={
          vacanteDetalle && vacanteDetalle.id in aplicaciones
            ? () => handleContactarEmpresa(vacanteDetalle)
            : undefined
          // El botón "Contactar empresa" solo se habilita si el
          // estudiante YA aplicó a esa vacante (tiene sentido chatear con
          // la empresa una vez que hay una candidatura de por medio, no
          // antes).
        }
      />

      {/* ── Éxito al inscribirse a una pasantía (autoservicio) ── */}
      {inscripcionOk && (
        <InscripcionExitoModal
          visible
          vacanteTitulo={inscripcionOk.titulo}
          empresaId={inscripcionOk.empresa_id}
          empresaNombre={inscripcionOk.nombre_empresa}
          horario={(inscripcionOk as any).horario}
          grupoId={perfilEstudiante?.grupo_id ?? (userProfile as any)?.grupo_id ?? null}
          estudianteId={user?.uid ?? ''}
          estudianteNombre={(userProfile as any)?.nombre_completo ?? ''}
          onClose={() => setInscripcionOk(null)}
        />
      )}
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
    // No usado directamente (VacanteCard usa GlassCard) — estilo de
    // respaldo sin aplicar, igual patrón visto en otros archivos.
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
  vacantesTrabajoSub: {
    fontSize: 11.5, fontFamily: FONTS.interRegular, color: COLORS.textMuted,
    marginTop: -4, marginBottom: 10,
  },
  vacanteTrabajoDim: { opacity: 0.55 },
  pasantiasEmptyCompact: { paddingVertical: 8, paddingHorizontal: 4, marginBottom: 4 },
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
