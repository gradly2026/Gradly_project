// ════════════════════════════════════════════════════════════════════════
// Pantalla pública de bienvenida ("landing page") para visitantes que aún
// no tienen cuenta. Es la versión React Native del prototipo HTML que se
// diseñó y aprobó por fuera de la app; el contenido y el copy son los
// mismos, ya traducidos a componentes reales con tema claro/oscuro,
// traducción funcional e íconos de Ionicons en vez de SVGs a mano.
//
// No tiene guard de sesión: cualquiera puede verla, con o sin cuenta.
// Ruta: /bienvenida (archivo plano en app/, mismo patrón que
// about-gradly.tsx / help-gradly.tsx).
// ════════════════════════════════════════════════════════════════════════
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useRef, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  useWindowDimensions,
  View,
} from 'react-native';
import { AutoText as Text } from '../src/components/AutoText';
import { GlassCard } from '../components/ui/liquid-glass/GlassCard';
import { LiquidBackground } from '../components/ui/liquid-glass/LiquidBackground';
import { FONTS, useTheme, webScrollStyle, type GradlyColors } from '../src/context/ThemeContext';
import { useTranslation } from '../src/context/TranslationContext';

const LOGO = require('../assets/images/LogoGradly.png');
const HERO_BG = require('../assets/images/bienvenida-hero.jpg');
// La foto de fondo del hero queda reservada para web (coincide con el
// prototipo original, pensado para visitantes de escritorio/navegador). En
// nativo esta pantalla no está enganchada a ningún flujo todavía, así que
// de momento cae aquí solo un fondo liso — sin pedir la imagen de más.
//
// Se aplica como CSS `backgroundImage` (no <ImageBackground>) a propósito:
// ImageBackground en react-native-web puede colapsar su alto hasta que la
// imagen termina de decodificar, y aquí eso dejaba el hero en blanco en la
// primera carga real (se "arreglaba solo" con cualquier repintado, como
// tocar el botón de idioma). `backgroundImage` nunca afecta el tamaño de
// la caja, así que el alto queda estable desde el primer frame.
//
// OJO: `Image.resolveAssetSource` no existe en el render del servidor que
// hace expo-router (Node, sin runtime de React Native) — llamarlo a nivel
// de módulo tumbaba CUALQUIER ruta que tocara este archivo, incluida "/".
// Por eso se calcula adentro del componente (ya en el navegador) y con
// verificación de que la función exista.
function useHeroUri(): string {
  return useMemo(() => {
    if (Platform.OS !== 'web') return '';
    if (typeof Image.resolveAssetSource !== 'function') return '';
    return Image.resolveAssetSource(HERO_BG)?.uri ?? '';
  }, []);
}

// Mismo umbral que SeccionMensajes.tsx / AsistenteGradly.tsx para el
// patrón "vistaAncha" — una sola bandera ancho/angosto, sin niveles
// intermedios de tablet.
const BREAKPOINT_ANCHO = 768;

type IconName = keyof typeof Ionicons.glyphMap;
type Rol = 'estudiante' | 'empresa' | 'universidad';
const ROLES: { key: Rol; label: string }[] = [
  { key: 'estudiante', label: 'Estudiantes' },
  { key: 'empresa', label: 'Empresas' },
  { key: 'universidad', label: 'Universidades' },
];

/** Reparte un array en filas de `size` — así una fila de cards se hace con
 *  flex normal (`flex:1` por card) en vez de porcentajes + gap, que no
 *  combinan bien en React Native. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function useThemedStyles() {
  const { colors } = useTheme();
  return useMemo(() => ({ colors, styles: makeStyles(colors) }), [colors]);
}

// ── Contenido por rol de las 4 secciones que lo usan ───────────────────

const PASOS: Record<Rol, { icon: IconName; title: string; desc: string }[]> = {
  estudiante: [
    { icon: 'person-outline', title: 'Accede a tu cuenta', desc: 'Tu universidad ya registró tu perfil y te entrega tus datos de acceso; solo inicia sesión y completa tus datos de contacto.' },
    { icon: 'school-outline', title: 'Consigue tu cupo o aplica', desc: 'Tu universidad te asigna un cupo, o aplicás directo a una pasantía.' },
    { icon: 'chatbubble-outline', title: 'Trabaja y coordina', desc: 'Todo el contacto pasa por el chat; marca tu asistencia y tus horas avanzan según tu horario.' },
    { icon: 'checkmark-circle-outline', title: 'Certifícate', desc: 'La empresa emite tu comprobante y tu universidad lo valida.' },
  ],
  empresa: [
    { icon: 'person-outline', title: 'Crea tu perfil', desc: 'Regístrate y verifica tu empresa para empezar a publicar.' },
    { icon: 'school-outline', title: 'Publica tu oportunidad', desc: 'Publica pasantías por cupos o vacantes abiertas, y recibe aplicantes o cupos asignados por la universidad.' },
    { icon: 'chatbubble-outline', title: 'Gestiona y coordina', desc: 'Marca la asistencia con el código diario del estudiante y da seguimiento por chat.' },
    { icon: 'checkmark-circle-outline', title: 'Certifica y contrata', desc: 'Emite el comprobante al finalizar, y si el desempeño fue bueno, ofrécele empleo real.' },
  ],
  universidad: [
    { icon: 'person-outline', title: 'Crea tu perfil', desc: 'Regístrate y crea el perfil de tu universidad para empezar a gestionar cupos.' },
    { icon: 'school-outline', title: 'Carga tus estudiantes', desc: 'Sube tus grupos por Excel y reparte los cupos disponibles según carrera.' },
    { icon: 'chatbubble-outline', title: 'Da seguimiento', desc: 'Supervisa el progreso y la asistencia de cada estudiante en tiempo real.' },
    { icon: 'checkmark-circle-outline', title: 'Valida certificados', desc: 'Revisa y valida el comprobante que emite la empresa al finalizar cada pasantía.' },
  ],
};
const PASOS_SUB: Record<Rol, string> = {
  estudiante: 'Cuatro pasos para tu próxima oportunidad',
  empresa: 'Cuatro pasos para encontrar a tu próximo talento',
  universidad: 'Cuatro pasos para acompañar a tus estudiantes',
};

type Oportunidad = { icon: IconName; titulo: string; sub: string; ubicacion: string; chips: string[]; tag: string; cta: string };
const OPORTUNIDADES: Record<Rol, Oportunidad[]> = {
  estudiante: [
    { icon: 'business-outline', titulo: 'Analista de Datos Jr. (Pasantía)', sub: 'Empresa de Tecnología', ubicacion: 'San Salvador, El Salvador', chips: ['Presencial', '20 hrs/sem'], tag: 'Vacante activa', cta: 'Aplicar' },
    { icon: 'business-outline', titulo: 'Soporte de Sistemas (Pasantía)', sub: 'Empresa Financiera', ubicacion: 'Santa Ana, El Salvador', chips: ['Híbrido', '25 hrs/sem'], tag: 'Vacante activa', cta: 'Aplicar' },
    { icon: 'business-outline', titulo: 'Asistente de Marketing (Pasantía)', sub: 'Agencia de Marketing', ubicacion: 'San Miguel, El Salvador', chips: ['Remoto', '15 hrs/sem'], tag: 'Vacante activa', cta: 'Aplicar' },
  ],
  empresa: [
    { icon: 'person-outline', titulo: 'Estudiante de Ingeniería en Sistemas', sub: 'Disponible para pasantía', ubicacion: 'San Salvador, El Salvador', chips: ['Presencial', '20 hrs/sem'], tag: 'Aplicante activo', cta: 'Ver perfil' },
    { icon: 'person-outline', titulo: 'Estudiante de Administración de Empresas', sub: 'Disponible para pasantía', ubicacion: 'Santa Ana, El Salvador', chips: ['Híbrido', '25 hrs/sem'], tag: 'Aplicante activo', cta: 'Ver perfil' },
    { icon: 'person-outline', titulo: 'Estudiante de Mercadotecnia', sub: 'Disponible para pasantía', ubicacion: 'San Miguel, El Salvador', chips: ['Remoto', '15 hrs/sem'], tag: 'Aplicante activo', cta: 'Ver perfil' },
  ],
  universidad: [
    { icon: 'business-outline', titulo: 'Analista de Datos Jr. (Pasantía)', sub: 'Empresa de Tecnología · 3 cupos', ubicacion: 'San Salvador, El Salvador', chips: ['Presencial', '20 hrs/sem'], tag: 'Cupo abierto', cta: 'Ver postulantes' },
    { icon: 'business-outline', titulo: 'Soporte de Sistemas (Pasantía)', sub: 'Empresa Financiera · 2 cupos', ubicacion: 'Santa Ana, El Salvador', chips: ['Híbrido', '25 hrs/sem'], tag: 'Cupo abierto', cta: 'Ver postulantes' },
    { icon: 'business-outline', titulo: 'Asistente de Marketing (Pasantía)', sub: 'Agencia de Marketing · 4 cupos', ubicacion: 'San Miguel, El Salvador', chips: ['Remoto', '15 hrs/sem'], tag: 'Cupo abierto', cta: 'Ver postulantes' },
  ],
};
const OPORTUNIDADES_HEADER: Record<Rol, { kicker: string; titulo: string; nota: string }> = {
  estudiante: { kicker: 'Vacantes', titulo: 'Así se ven las oportunidades en Gradly', nota: 'Tarjetas ilustrativas — al crear tu cuenta verás las vacantes reales de tu carrera.' },
  empresa: { kicker: 'Talento', titulo: 'Así ves a tus candidatos en Gradly', nota: 'Tarjetas ilustrativas — al publicar tu pasantía o vacante verás tus propios aplicantes.' },
  universidad: { kicker: 'Cupos', titulo: 'Así ves tus cupos y alianzas en Gradly', nota: 'Tarjetas ilustrativas — al registrar a tus estudiantes verás tus cupos y empresas aliadas reales.' },
};

type Caso = { badge: string; empleo?: boolean; texto: string; meta: string };
const CASOS: Record<Rol, Caso[]> = {
  estudiante: [
    { badge: 'Certificado', texto: 'Un estudiante de Ingeniería en Sistemas hizo su pasantía en el área de tecnología de una empresa de retail y completó sus 200 horas.', meta: 'Ingeniería en Sistemas' },
    { badge: 'Empleo real', empleo: true, texto: 'Una estudiante de Administración de Empresas hizo su pasantía en el área financiera de un banco y fue contratada para su primer empleo real.', meta: 'Administración de Empresas' },
    { badge: 'Certificado', texto: 'Un estudiante de Mercadotecnia hizo su pasantía en una agencia de marketing y completó 180 horas certificadas por su universidad.', meta: 'Mercadotecnia' },
  ],
  empresa: [
    { badge: 'Talento formado', texto: 'Una empresa de tecnología encontró una pasante de Ingeniería en Sistemas para su área de datos, filtrando directo por carrera y universidad.', meta: 'Área de Tecnología' },
    { badge: 'Contratación real', empleo: true, texto: 'Un banco certificó a una pasante de Administración de Empresas en su área financiera y terminó contratándola para su primer empleo real.', meta: 'Área Financiera' },
    { badge: 'Talento formado', texto: 'Una agencia de marketing certificó a un pasante de Mercadotecnia tras 180 horas de trabajo real dentro de sus campañas.', meta: 'Área de Marketing' },
  ],
  universidad: [
    { badge: 'Certificado', texto: 'Una universidad dio seguimiento a un estudiante de Ingeniería en Sistemas durante toda su pasantía y validó sus 200 horas sin papeleo manual.', meta: 'Ingeniería en Sistemas' },
    { badge: 'Empleabilidad', empleo: true, texto: 'Una universidad acompañó a una estudiante de Administración de Empresas hasta su contratación real, fortaleciendo su alianza con la empresa.', meta: 'Administración de Empresas' },
    { badge: 'Certificado', texto: 'Una universidad certificó a un estudiante de Mercadotecnia tras completar sus horas de pasantía, validadas desde el propio panel institucional.', meta: 'Mercadotecnia' },
  ],
};
const CASOS_SUB: Record<Rol, string> = {
  estudiante: 'Así se ve cuando una pasantía en Gradly se convierte en experiencia real.',
  empresa: 'Así encuentran las empresas talento real a través de Gradly.',
  universidad: 'Así acompañan las universidades a sus estudiantes de principio a fin.',
};

type Testi = { icon: IconName; texto: string; nombre: string; rol: string };
const TESTIMONIOS: Record<Rol, Testi[]> = {
  estudiante: [
    { icon: 'person-outline', texto: 'Conseguí mi pasantía sin depender de conocidos — todo el proceso fue claro desde la app, desde postular hasta certificarme.', nombre: 'Estudiante', rol: 'Ingeniería, universidad participante' },
    { icon: 'person-outline', texto: 'Marco mi asistencia con un código todos los días y veo mis horas avanzar en tiempo real, sin tener que preguntar cómo voy.', nombre: 'Estudiante', rol: 'Administración, universidad participante' },
    { icon: 'person-outline', texto: 'Cuando terminé mi pasantía, la empresa me ofreció mi primer empleo real desde la misma app.', nombre: 'Estudiante', rol: 'Mercadotecnia, universidad participante' },
  ],
  empresa: [
    { icon: 'business-outline', texto: 'Recibimos candidatos que ya vienen validados por su universidad — nos ahorra tiempo de selección y coordinación.', nombre: 'Empresa aliada', rol: 'Recursos Humanos' },
    { icon: 'business-outline', texto: 'Publicamos cupos por carrera y la universidad nos asigna directo a los estudiantes que califican.', nombre: 'Empresa aliada', rol: 'Reclutamiento' },
    { icon: 'business-outline', texto: 'El código diario de asistencia nos quitó el problema de llevar el control manual de cada pasante.', nombre: 'Empresa aliada', rol: 'Supervisión de pasantes' },
  ],
  universidad: [
    { icon: 'school-outline', texto: 'Por fin tenemos visibilidad real de las horas y pasantías de nuestros estudiantes, sin depender de reportes por correo.', nombre: 'Universidad', rol: 'Coordinación académica' },
    { icon: 'school-outline', texto: 'Repartir los cupos entre nuestros grupos ya no es un proceso manual — la plataforma nos ayuda a organizarlo por carrera.', nombre: 'Universidad', rol: 'Vinculación empresarial' },
    { icon: 'school-outline', texto: 'Validamos el comprobante final de cada estudiante desde el mismo panel, sin papeleo adicional.', nombre: 'Universidad', rol: 'Coordinación académica' },
  ],
};

const FEATURES: { icon: IconName; title: string; desc: string }[] = [
  { icon: 'school-outline', title: 'Cupos por lote', desc: 'Tu universidad reparte cupos de pasantía entre su alumnado — o aplicás directo a una pasantía.' },
  { icon: 'time-outline', title: 'Asistencia y horas', desc: 'Marcas tu código de asistencia cada día que te toca. Tus horas avanzan según el horario acordado y se ajustan solas si faltas con permiso.' },
  { icon: 'chatbubble-outline', title: 'Chat integrado', desc: 'Coordina con la empresa sin salir de la app — todo el historial queda en un solo lugar.' },
  { icon: 'checkmark-circle-outline', title: 'Certificación digital', desc: 'Al terminar, la empresa emite el comprobante y tu universidad lo valida.' },
  { icon: 'chatbubble-ellipses-outline', title: 'Asistente Gradly', desc: 'Un asistente dentro de la app resuelve tus dudas sobre cómo funciona todo.' },
  { icon: 'shield-checkmark-outline', title: 'Reportes e incidencias', desc: 'Un canal directo para reportar problemas durante la pasantía, con seguimiento de tu universidad.' },
];

const BENEFICIOS: { icon: IconName; title: string; items: string[] }[] = [
  { icon: 'person-outline', title: 'Para Estudiantes', items: ['Perfil validado por tu universidad', 'Pasantías y vacantes reales, no simulacros', 'Certificación digital de tus horas'] },
  { icon: 'business-outline', title: 'Para Empresas', items: ['Candidatos ya verificados por su universidad', 'Panel para dar seguimiento a tus pasantes', 'Reclutamiento directo cuando se gradúen'] },
  { icon: 'school-outline', title: 'Para Universidades', items: ['Seguimiento en tiempo real de tus estudiantes', 'Validación de horas y comprobantes sin papeleo', 'Vínculo directo con empresas aliadas'] },
];

const EQUIPO = [
  { nombre: 'Lindsay Jazmin Coto Marroquin', rol: 'Frontend Developer & UX Lead', carrera: 'Ingeniería en Sistemas, UDB' },
  { nombre: 'Diego Josue Chavez Lopez', rol: 'Backend Developer & Arquitecto', carrera: 'Ingeniería en Sistemas, UDB' },
  { nombre: 'Ashlyn Lisseth Escobar Arana', rol: 'UI/UX Designer & Product', carrera: 'Ingeniería en Sistemas, UDB' },
  { nombre: 'Nathalia Guadalupe Guevara Zelaya', rol: 'Project Manager & QA Lead', carrera: 'Ingeniería en Sistemas, UDB' },
];

const SECTORES_ALIADOS = [
  'Empresa de Tecnología', 'Empresa Financiera', 'Empresa de Retail',
  'Empresa de Construcción', 'Empresa de Logística', 'Agencia de Marketing',
  'Empresa de Telecomunicaciones', 'Laboratorio Clínico',
];

// Manchas de luz violeta en las esquinas de algunas secciones — decoración
// pura, tomada tal cual del prototipo HTML (mismos radios/colores/blur).
// Solo web: dependen de `background` (radial-gradient) y `filter: blur`,
// que RN nativo no soporta sin una librería aparte, y aquí no hacen falta
// en nativo porque esta pantalla todavía es web-only en la práctica.
const HALO_POS: Record<'tl' | 'tr' | 'bl' | 'br', any> = {
  tl: { top: -220, left: -180, width: 640, height: 640, background: 'radial-gradient(circle, rgba(124,58,237,.40) 0%, transparent 70%)' },
  br: { bottom: -240, right: -200, width: 620, height: 620, background: 'radial-gradient(circle, rgba(167,139,250,.24) 0%, transparent 70%)' },
  tr: { top: -180, right: -160, width: 520, height: 520, background: 'radial-gradient(circle, rgba(124,58,237,.30) 0%, transparent 70%)' },
  bl: { bottom: -180, left: -140, width: 520, height: 520, background: 'radial-gradient(circle, rgba(167,139,250,.20) 0%, transparent 70%)' },
};

function Halo({ corner }: { corner: 'tl' | 'tr' | 'bl' | 'br' }) {
  if (Platform.OS !== 'web') return null;
  return (
    <View
      style={{ position: 'absolute', borderRadius: 9999, filter: 'blur(6px)', zIndex: 0, pointerEvents: 'none', ...HALO_POS[corner] } as any}
    />
  );
}

// Textura de puntitos detrás de toda la pantalla — igual a `.bg-dots` del
// HTML (mismo color/tamaño de grilla). Un solo `View` absolutamente
// posicionado, sembrado como primer hijo de `root` (antes del header y del
// ScrollView) para que quede DETRÁS de todo sin moverse con el scroll,
// igual que el `position:fixed` del prototipo. Solo web, mismo motivo que
// los halos: depende de `backgroundImage`/`backgroundSize` en CSS.
function DotsTexture() {
  if (Platform.OS !== 'web') return null;
  return (
    <View
      style={
        {
          ...StyleSheet.absoluteFillObject,
          zIndex: 0,
          pointerEvents: 'none',
          backgroundImage: 'radial-gradient(circle, rgba(167,139,250,0.14) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
        } as any
      }
    />
  );
}

// ── Componentes reutilizados por las 4 secciones con pestañas de rol ────

function RoleTabs({ value, onChange, colors, styles }: { value: Rol; onChange: (r: Rol) => void; colors: GradlyColors; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={styles.roleTabs}>
      {ROLES.map((r) => {
        const active = value === r.key;
        return (
          <Pressable
            key={r.key}
            onPress={() => onChange(r.key)}
            style={[styles.roleTab, { borderColor: colors.border, backgroundColor: colors.backgroundCard }, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
          >
            <Text style={[styles.roleTabText, { color: colors.textSecondary }, active && { color: '#fff' }]}>{r.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SectionHeader({ kicker, title, sub, colors, styles }: { kicker: string; title: string; sub?: string; colors: GradlyColors; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.kicker, { color: colors.primaryLight }]}>{kicker}</Text>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
      {sub ? <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>{sub}</Text> : null}
    </View>
  );
}

export default function BienvenidaScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { styles } = useThemedStyles();
  const { language, toggleLanguage } = useTranslation();
  const { width } = useWindowDimensions();
  const heroUri = useHeroUri();
  const wide = width > BREAKPOINT_ANCHO;
  const cols = wide ? 3 : 1;
  const teamCols = wide ? 4 : 1;
  const scrollStyle = webScrollStyle(colors);

  const [rolPasos, setRolPasos] = useState<Rol>('estudiante');
  const [rolOportunidades, setRolOportunidades] = useState<Rol>('estudiante');
  const [rolCasos, setRolCasos] = useState<Rol>('estudiante');
  const [rolTesti, setRolTesti] = useState<Rol>('estudiante');

  const irALogin = () => router.push('/auth/iniciosesion' as any);
  const irARegistro = () => router.push('/auth/registro' as any);

  // ── Links de navegación con scroll a sección (como los <a href="#..."> del
  // HTML). Cada sección "ancla" guarda su posición Y real vía onLayout; el
  // link solo pide al ScrollView moverse ahí. "Inicio" no necesita medir
  // nada, siempre es y:0. ──
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Record<string, number>>({});
  const registrarSeccion = (key: string) => (e: { nativeEvent: { layout: { y: number } } }) => {
    sectionY.current[key] = e.nativeEvent.layout.y;
  };
  const irASeccion = (key: string) => {
    scrollRef.current?.scrollTo({ y: key === 'top' ? 0 : (sectionY.current[key] ?? 0), animated: true });
  };
  const NAV_LINKS: { key: string; label: string }[] = [
    { key: 'top', label: 'Inicio' },
    { key: 'como-funciona', label: 'Cómo funciona' },
    { key: 'oportunidades', label: 'Oportunidades' },
    { key: 'nosotros', label: 'Nosotros' },
  ];

  return (
    <LiquidBackground>
      <View style={styles.root}>
      <DotsTexture />
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* ── Header fijo: logo, links de navegación, idioma, iniciar sesión, crear cuenta ── */}
      <View style={[styles.header, { backgroundColor: colors.backgroundCard, borderBottomColor: colors.border }]}>
        <View style={styles.brand}>
          <Image source={LOGO} style={styles.brandLogo} resizeMode="contain" />
          <Text style={[styles.brandText, { color: colors.textPrimary }]} noTranslate>Gradly</Text>
        </View>
        {wide && (
          <View style={styles.navLinks}>
            {NAV_LINKS.map((l) => (
              <Pressable key={l.key} onPress={() => irASeccion(l.key)}>
                <Text style={[styles.navLinkText, { color: colors.textSecondary }]}>{l.label}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <View style={styles.headerActions}>
          <Pressable onPress={toggleLanguage} style={[styles.langPill, { borderColor: colors.border, backgroundColor: colors.backgroundSurface }]}>
            <Ionicons name="globe-outline" size={14} color={colors.textSecondary} />
            <RNText style={[styles.langPillText, { color: colors.textSecondary }]}>{language.toUpperCase()}</RNText>
          </Pressable>
          {wide && (
            <Pressable onPress={irALogin}>
              <Text style={[styles.loginLink, { color: colors.textSecondary }]}>Iniciar sesión</Text>
            </Pressable>
          )}
          <Pressable onPress={irARegistro} style={[styles.headerCta, { backgroundColor: colors.primary }]}>
            <Text style={styles.headerCtaText}>Crear cuenta</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={[styles.scrollView, scrollStyle]}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator
      >
        {/* ── Hero (foto de fondo solo en web — ver HERO_URI arriba) ── */}
        <View
          style={[
            styles.hero,
            Platform.OS === 'web'
              ? ({
                  backgroundImage: `linear-gradient(180deg, rgba(15,10,30,.25) 0%, rgba(15,10,30,.72) 60%, ${colors.backgroundDark} 100%), url("${heroUri}")`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center 30%',
                } as any)
              : { backgroundColor: colors.backgroundCard },
          ]}
        >
          <View style={[styles.badge, { backgroundColor: colors.primary12, borderColor: colors.primary35 }]}>
            <Text style={[styles.badgeText, { color: colors.accent }]}>Pasantías y empleo, en tus manos</Text>
          </View>
          <Text style={styles.heroTitle}>Conecta tu talento con oportunidades reales.</Text>
          <Text style={styles.heroSub}>
            Gradly une a estudiantes universitarios, universidades y empresas en un solo lugar: tu pasantía durante la carrera, y tu primer empleo al graduarte.
          </Text>
          <View style={styles.ctaRow}>
            <Pressable onPress={irARegistro} style={[styles.btnPrimaryLg, { backgroundColor: colors.primary }]}>
              <Text style={styles.btnPrimaryText}>Crear mi cuenta</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </Pressable>
            <Pressable onPress={irALogin} style={[styles.btnOutlineLg, { borderColor: 'rgba(255,255,255,0.35)' }]}>
              <Text style={styles.btnOutlineText}>Ya tengo cuenta</Text>
            </Pressable>
          </View>
          <View style={[styles.ecoRow, { flexDirection: wide ? 'row' : 'column' }]}>
            {[
              { icon: 'person-outline' as IconName, title: 'Estudiantes', desc: 'Haz tu pasantía y consigue tu primer empleo' },
              { icon: 'school-outline' as IconName, title: 'Universidades', desc: 'Acompaña y certifica a tus estudiantes' },
              { icon: 'business-outline' as IconName, title: 'Empresas', desc: 'Encuentra y forma a tu próximo talento' },
            ].map((e) => (
              <View key={e.title} style={styles.ecoCard}>
                <View style={styles.ecoIcon}><Ionicons name={e.icon} size={20} color={colors.primaryLight} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ecoTitle}>{e.title}</Text>
                  <Text style={styles.ecoDesc}>{e.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ── ¿Qué es Gradly? ── */}
        <View style={[styles.section, styles.sectionSurface]}>
          <Halo corner="tl" />
          <Halo corner="br" />
          <SectionHeader kicker="La plataforma" title="¿Qué es Gradly?" colors={colors} styles={styles} />
          <GlassCard contentStyle={styles.aboutLead}>
            <View>
              <Text style={[styles.paragraphLabel, { color: colors.textPrimary }]}>Misión</Text>
              <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                Eliminar la distancia entre estudiar y trabajar — que cualquier estudiante universitario en El Salvador pueda hacer una pasantía real durante su carrera, sin depender de contactos.
              </Text>
            </View>
            <View>
              <Text style={[styles.paragraphLabel, { color: colors.textPrimary }]}>Visión</Text>
              <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                Ser la forma en que universidades y empresas coordinan pasantías y primeras contrataciones — horas, comprobantes y seguimiento en un solo lugar, empezando en El Salvador.
              </Text>
            </View>
          </GlassCard>
          {chunk(FEATURES, cols).map((row, i) => (
            <View key={i} style={styles.cardRow}>
              {row.map((f) => (
                <GlassCard key={f.title} style={{ flex: 1 }} contentStyle={styles.featureCardContent}>
                  <View style={[styles.iconBadge, { backgroundColor: colors.primary12 }]}>
                    <Ionicons name={f.icon} size={20} color={colors.primaryLight} />
                  </View>
                  <Text style={[styles.featureTitle, { color: colors.textPrimary }]}>{f.title}</Text>
                  <Text style={[styles.featureDesc, { color: colors.textMuted }]}>{f.desc}</Text>
                </GlassCard>
              ))}
            </View>
          ))}
        </View>

        {/* ── Beneficios ── */}
        <View style={styles.section}>
          <SectionHeader kicker="Ventajas" title="¿Por qué elegir Gradly?" colors={colors} styles={styles} />
          {chunk(BENEFICIOS, cols).map((row, i) => (
            <View key={i} style={styles.cardRow}>
              {row.map((b) => (
                <GlassCard key={b.title} style={{ flex: 1 }} contentStyle={styles.benefitCardContent}>
                  <View style={[styles.iconBadge, { backgroundColor: colors.primary12 }]}>
                    <Ionicons name={b.icon} size={20} color={colors.primaryLight} />
                  </View>
                  <Text style={[styles.benefitTitle, { color: colors.textPrimary }]}>{b.title}</Text>
                  {b.items.map((it) => (
                    <View key={it} style={styles.benefitItem}>
                      <Ionicons name="checkmark" size={14} color={colors.primaryLight} />
                      <Text style={[styles.benefitItemText, { color: colors.textSecondary }]}>{it}</Text>
                    </View>
                  ))}
                </GlassCard>
              ))}
            </View>
          ))}
        </View>

        {/* ── Cómo funciona (por rol) ── */}
        <View style={styles.section} onLayout={registrarSeccion('como-funciona')}>
          <SectionHeader kicker="El proceso" title="¿Cómo funciona Gradly?" sub={PASOS_SUB[rolPasos]} colors={colors} styles={styles} />
          <RoleTabs value={rolPasos} onChange={setRolPasos} colors={colors} styles={styles} />
          {chunk(PASOS[rolPasos], cols).map((row, i) => (
            <View key={i} style={styles.cardRow}>
              {row.map((p, idx) => (
                <View key={p.title} style={styles.stepCard}>
                  <View style={styles.stepIconWrap}>
                    <View style={[styles.stepIconCircle, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
                      <Ionicons name={p.icon} size={22} color={colors.primaryLight} />
                    </View>
                    <View style={[styles.stepNumber, { backgroundColor: colors.primary, borderColor: colors.backgroundDark }]}>
                      <Text style={styles.stepNumberText}>{i * cols + idx + 1}</Text>
                    </View>
                  </View>
                  <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>{p.title}</Text>
                  <Text style={[styles.stepDesc, { color: colors.textMuted }]}>{p.desc}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        {/* ── Oportunidades (por rol) ── */}
        <View style={styles.section} onLayout={registrarSeccion('oportunidades')}>
          <SectionHeader
            kicker={OPORTUNIDADES_HEADER[rolOportunidades].kicker}
            title={OPORTUNIDADES_HEADER[rolOportunidades].titulo}
            colors={colors}
            styles={styles}
          />
          <Text style={[styles.vacNote, { color: colors.textMuted }]}>{OPORTUNIDADES_HEADER[rolOportunidades].nota}</Text>
          <RoleTabs value={rolOportunidades} onChange={setRolOportunidades} colors={colors} styles={styles} />
          {chunk(OPORTUNIDADES[rolOportunidades], cols).map((row, i) => (
            <View key={i} style={styles.cardRow}>
              {row.map((o) => (
                <GlassCard key={o.titulo} style={{ flex: 1 }} contentStyle={styles.vacanteCardContent}>
                  <View style={[styles.vacanteLogo, { backgroundColor: colors.backgroundSurface, borderColor: colors.border }]}>
                    <Ionicons name={o.icon} size={18} color={colors.primaryLight} />
                  </View>
                  <Text style={[styles.vacantePuesto, { color: colors.textPrimary }]}>{o.titulo}</Text>
                  <Text style={[styles.vacanteEmpresa, { color: colors.textSecondary }]}>{o.sub}</Text>
                  <View style={styles.vacanteMeta}>
                    <Ionicons name="location-outline" size={12} color={colors.textMuted} />
                    <Text style={[styles.vacanteMetaText, { color: colors.textMuted }]}>{o.ubicacion}</Text>
                  </View>
                  <View style={styles.chipRow}>
                    {o.chips.map((c) => (
                      <View key={c} style={[styles.chip, { backgroundColor: colors.backgroundSurface }]}>
                        <Text style={[styles.chipText, { color: colors.textSecondary }]}>{c}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={[styles.vacanteFoot, { borderTopColor: colors.border }]}>
                    <Text style={[styles.vacDate, { color: colors.textMuted }]}>{o.tag}</Text>
                    <Pressable onPress={irARegistro} style={[styles.btnSmall, { backgroundColor: colors.primary }]}>
                      <Text style={styles.btnSmallText}>{o.cta}</Text>
                    </Pressable>
                  </View>
                </GlassCard>
              ))}
            </View>
          ))}
        </View>

        {/* ── Casos de éxito (por rol) ── */}
        <View style={[styles.section, styles.sectionSurface]}>
          <Halo corner="tl" />
          <Halo corner="br" />
          <SectionHeader kicker="Resultados" title="Casos de éxito" sub={CASOS_SUB[rolCasos]} colors={colors} styles={styles} />
          <RoleTabs value={rolCasos} onChange={setRolCasos} colors={colors} styles={styles} />
          {chunk(CASOS[rolCasos], cols).map((row, i) => (
            <View key={i} style={styles.cardRow}>
              {row.map((c) => (
                <GlassCard key={c.texto} style={{ flex: 1 }} contentStyle={styles.caseCardContent}>
                  <View style={[styles.caseBadge, c.empleo ? { backgroundColor: 'rgba(217,119,6,.16)' } : { backgroundColor: 'rgba(63,166,107,.16)' }]}>
                    <Text style={[styles.caseBadgeText, c.empleo ? { color: colors.gold } : { color: '#4CB877' }]}>{c.badge}</Text>
                  </View>
                  <Text style={[styles.caseText, { color: colors.textSecondary }]}>{c.texto}</Text>
                  <Text style={[styles.caseMeta, { color: colors.textMuted, borderTopColor: colors.border }]}>{c.meta}</Text>
                </GlassCard>
              ))}
            </View>
          ))}
        </View>

        {/* ── Testimonios (por rol) ── */}
        <View style={styles.section}>
          <SectionHeader kicker="Comunidad" title="Lo que podrían decir en Gradly" colors={colors} styles={styles} />
          <RoleTabs value={rolTesti} onChange={setRolTesti} colors={colors} styles={styles} />
          {chunk(TESTIMONIOS[rolTesti], cols).map((row, i) => (
            <View key={i} style={styles.cardRow}>
              {row.map((t) => (
                <GlassCard key={t.texto} style={{ flex: 1 }} contentStyle={styles.testiCardContent}>
                  <Text style={[styles.testiQuote, { color: colors.primaryLight }]}>&ldquo;</Text>
                  <Text style={[styles.testiText, { color: colors.textSecondary }]}>{t.texto}</Text>
                  <View style={[styles.testiAuthor, { borderTopColor: colors.border }]}>
                    <View style={[styles.testiAvatar, { backgroundColor: colors.backgroundSurface }]}>
                      <Ionicons name={t.icon} size={16} color={colors.primaryLight} />
                    </View>
                    <View>
                      <Text style={[styles.testiName, { color: colors.textPrimary }]}>{t.nombre}</Text>
                      <Text style={[styles.testiRole, { color: colors.textMuted }]}>{t.rol}</Text>
                    </View>
                  </View>
                </GlassCard>
              ))}
            </View>
          ))}
        </View>

        {/* ── Empresas aliadas ── */}
        <View style={[styles.section, styles.sectionSurface]}>
          <SectionHeader
            kicker="Alianzas"
            title="Así se vería tu red de empresas"
            sub="Aquí aparecerán los nombres de las empresas reales registradas en Gradly."
            colors={colors}
            styles={styles}
          />
          <View style={styles.aliadosWrap}>
            {SECTORES_ALIADOS.map((s) => (
              <View key={s} style={[styles.aliadoChip, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
                <Ionicons name="business-outline" size={14} color={colors.primaryLight} />
                <Text style={[styles.aliadoChipText, { color: colors.textSecondary }]}>{s}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Nosotros ── */}
        <View style={styles.section} onLayout={registrarSeccion('nosotros')}>
          <Halo corner="tr" />
          <Halo corner="bl" />
          <SectionHeader
            kicker="El equipo"
            title="El equipo detrás de Gradly"
            sub="Desarrollado por estudiantes de la Universidad Don Bosco, El Salvador"
            colors={colors}
            styles={styles}
          />
          {chunk(EQUIPO, teamCols).map((row, i) => (
            <View key={i} style={styles.cardRow}>
              {row.map((m) => (
                <GlassCard key={m.nombre} style={{ flex: 1 }} contentStyle={styles.teamCardContent}>
                  <View style={[styles.teamAvatar, { backgroundColor: colors.backgroundSurface, borderColor: colors.border }]}>
                    <Ionicons name="person-outline" size={24} color={colors.primaryLight} />
                  </View>
                  <Text style={[styles.teamName, { color: colors.textPrimary }]} noTranslate>{m.nombre}</Text>
                  <Text style={[styles.teamRole, { color: colors.primaryLight }]}>{m.rol}</Text>
                  <Text style={[styles.teamCarrera, { color: colors.textMuted }]}>{m.carrera}</Text>
                </GlassCard>
              ))}
            </View>
          ))}
          <GlassCard contentStyle={styles.quoteCard}>
            <Text style={[styles.quoteText, { color: colors.textSecondary }]}>
              &ldquo;Somos cuatro estudiantes que creen que el talento salvadoreño no debería buscar oportunidades, las oportunidades deberían encontrar al talento. Eso es Gradly.&rdquo;
            </Text>
            <Text style={[styles.quoteAuthor, { color: colors.textMuted }]}>— Equipo Gradly, Soyapango, El Salvador</Text>
          </GlassCard>
        </View>

        {/* ── Footer ── */}
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <View style={[styles.footerRow, { flexDirection: wide ? 'row' : 'column' }]}>
            <View style={{ flex: 1.4 }}>
              <Text style={[styles.footerLogo, { color: colors.textPrimary }]} noTranslate>Gradly</Text>
              <Text style={[styles.footerDesc, { color: colors.textMuted }]}>
                La plataforma que conecta estudiantes universitarios, universidades y empresas en El Salvador para hacer pasantías reales.
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.footerColTitle, { color: colors.textPrimary }]}>Plataforma</Text>
              {['Para Estudiantes', 'Para Empresas', 'Para Universidades', 'Oportunidades'].map((l) => (
                <Text key={l} style={[styles.footerLink, { color: colors.textMuted }]}>{l}</Text>
              ))}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.footerColTitle, { color: colors.textPrimary }]}>Empresa</Text>
              {['Términos de uso', 'Política de privacidad', 'Contacto'].map((l) => (
                <Text key={l} style={[styles.footerLink, { color: colors.textMuted }]}>{l}</Text>
              ))}
            </View>
          </View>
          <Text style={[styles.footerBottom, { color: colors.textMuted, borderTopColor: colors.border }]}>
            © 2026 Gradly — Soyapango, El Salvador
          </Text>
        </View>
      </ScrollView>
      </View>
    </LiquidBackground>
  );
}

const makeStyles = (COLORS: GradlyColors) =>
  StyleSheet.create({
    root: { flex: 1, width: '100%' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 48,
      paddingBottom: 14,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
    },
    brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    brandLogo: { width: 28, height: 33 },
    brandText: { fontSize: 18, fontFamily: FONTS.soraBold },
    navLinks: { flexDirection: 'row', alignItems: 'center', gap: 28 },
    navLinkText: { fontSize: 14, fontFamily: FONTS.interSemiBold },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    langPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
    langPillText: { fontSize: 12, fontFamily: FONTS.interSemiBold },
    loginLink: { fontSize: 14, fontFamily: FONTS.interSemiBold },
    headerCta: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999 },
    headerCtaText: { color: '#fff', fontSize: 13, fontFamily: FONTS.interSemiBold },

    scrollView: { flex: 1, minHeight: 0, width: '100%' },
    scroll: { paddingBottom: 60, width: '100%', maxWidth: 1240, alignSelf: 'center' },

    hero: { minHeight: 560, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 56, gap: 20, overflow: 'hidden' },
    badge: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
    badgeText: { fontSize: 13, fontFamily: FONTS.interSemiBold },
    heroTitle: { fontSize: 34, lineHeight: 40, textAlign: 'center', fontFamily: FONTS.soraExtraBold, color: '#fff', maxWidth: 640 },
    heroSub: { fontSize: 16, lineHeight: 24, textAlign: 'center', color: 'rgba(255,255,255,0.82)', fontFamily: FONTS.interRegular, maxWidth: 520 },
    ctaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'center' },
    btnPrimaryLg: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, paddingVertical: 14, borderRadius: 999 },
    btnPrimaryText: { color: '#fff', fontSize: 15, fontFamily: FONTS.interSemiBold },
    btnOutlineLg: { paddingHorizontal: 22, paddingVertical: 14, borderRadius: 999, borderWidth: 1.5 },
    btnOutlineText: { color: '#fff', fontSize: 15, fontFamily: FONTS.interSemiBold },
    ecoRow: { gap: 14, marginTop: 12, width: '100%', maxWidth: 820, alignItems: 'stretch', justifyContent: 'center' },
    ecoCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,.18)', borderRadius: 16, padding: 14 },
    ecoIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.12)' },
    ecoTitle: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: '#fff' },
    ecoDesc: { fontSize: 12, lineHeight: 16, color: 'rgba(255,255,255,.75)', fontFamily: FONTS.interRegular, marginTop: 2 },

    section: { paddingHorizontal: 20, paddingVertical: 72, gap: 22, position: 'relative', overflow: 'hidden' },
    sectionSurface: { backgroundColor: 'rgba(26,16,48,.55)' },
    sectionHeader: { alignItems: 'center', gap: 10, marginBottom: 8, maxWidth: 700, alignSelf: 'center' },
    kicker: { fontSize: 13, fontFamily: FONTS.soraSemiBold, letterSpacing: 2, textTransform: 'uppercase' },
    sectionTitle: { fontSize: 32, textAlign: 'center', fontFamily: FONTS.soraExtraBold },
    sectionSub: { fontSize: 16, lineHeight: 26, textAlign: 'center', fontFamily: FONTS.interRegular, maxWidth: 480 },

    cardRow: { flexDirection: 'row', gap: 20 },

    aboutLead: { gap: 18, padding: 26 },
    paragraphLabel: { fontSize: 13, fontFamily: FONTS.interSemiBold, marginBottom: 4 },
    paragraph: { fontSize: 14.5, lineHeight: 22, fontFamily: FONTS.interRegular },

    iconBadge: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    featureCardContent: { padding: 26, gap: 4 },
    featureTitle: { fontSize: 15, fontFamily: FONTS.soraSemiBold, marginBottom: 4 },
    featureDesc: { fontSize: 13, lineHeight: 19, fontFamily: FONTS.interRegular },

    benefitCardContent: { padding: 26, gap: 10 },
    benefitTitle: { fontSize: 16, fontFamily: FONTS.soraSemiBold, marginBottom: 4 },
    benefitItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    benefitItemText: { flex: 1, fontSize: 13, lineHeight: 19, fontFamily: FONTS.interRegular },

    roleTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
    roleTab: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, borderWidth: 1 },
    roleTabText: { fontSize: 13, fontFamily: FONTS.interBold },

    stepCard: { flex: 1, alignItems: 'center', gap: 6 },
    stepIconWrap: { marginBottom: 8 },
    stepIconCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    stepNumber: { position: 'absolute', bottom: -4, right: -4, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
    stepNumberText: { color: '#fff', fontSize: 11, fontFamily: FONTS.soraBold },
    stepTitle: { fontSize: 14.5, fontFamily: FONTS.soraSemiBold, textAlign: 'center' },
    stepDesc: { fontSize: 12.5, lineHeight: 18, textAlign: 'center', fontFamily: FONTS.interRegular },

    vacNote: { fontSize: 13, textAlign: 'center', fontFamily: FONTS.interRegular, marginTop: -8 },
    vacanteCardContent: { padding: 26, gap: 10 },
    vacanteLogo: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    vacantePuesto: { fontSize: 14.5, fontFamily: FONTS.soraSemiBold },
    vacanteEmpresa: { fontSize: 13, fontFamily: FONTS.interRegular },
    vacanteMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    vacanteMetaText: { fontSize: 11.5, fontFamily: FONTS.interRegular },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
    chipText: { fontSize: 11, fontFamily: FONTS.interSemiBold },
    vacanteFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 12, marginTop: 2 },
    vacDate: { fontSize: 11, fontFamily: FONTS.interRegular },
    btnSmall: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
    btnSmallText: { color: '#fff', fontSize: 12, fontFamily: FONTS.interSemiBold },

    caseCardContent: { padding: 26, gap: 10 },
    caseBadge: { alignSelf: 'flex-start', paddingHorizontal: 11, paddingVertical: 4, borderRadius: 999 },
    caseBadgeText: { fontSize: 11, fontFamily: FONTS.interBold },
    caseText: { fontSize: 13.5, lineHeight: 20, fontFamily: FONTS.interRegular },
    caseMeta: { fontSize: 12, borderTopWidth: 1, paddingTop: 10, fontFamily: FONTS.interRegular },

    testiCardContent: { padding: 26, gap: 12 },
    testiQuote: { fontSize: 30, fontFamily: FONTS.soraBold, opacity: 0.5, lineHeight: 30 },
    testiText: { fontSize: 13.5, lineHeight: 20, fontFamily: FONTS.interRegular },
    testiAuthor: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, paddingTop: 12 },
    testiAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    testiName: { fontSize: 13, fontFamily: FONTS.interSemiBold },
    testiRole: { fontSize: 11, fontFamily: FONTS.interRegular },

    aliadosWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
    aliadoChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, borderWidth: 1 },
    aliadoChipText: { fontSize: 12.5, fontFamily: FONTS.interSemiBold },

    teamCardContent: { padding: 26, alignItems: 'center', gap: 4 },
    teamAvatar: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', borderWidth: 2, marginBottom: 8 },
    teamName: { fontSize: 13.5, fontFamily: FONTS.soraSemiBold, textAlign: 'center' },
    teamRole: { fontSize: 11.5, fontFamily: FONTS.interSemiBold, textAlign: 'center' },
    teamCarrera: { fontSize: 11, fontFamily: FONTS.interRegular, textAlign: 'center' },
    quoteCard: { padding: 22, gap: 10, alignItems: 'center' },
    quoteText: { fontSize: 15, lineHeight: 23, textAlign: 'center', fontFamily: FONTS.interRegular, fontStyle: 'italic' },
    quoteAuthor: { fontSize: 12.5, fontFamily: FONTS.interSemiBold },

    footer: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 32, gap: 24, borderTopWidth: 1 },
    footerRow: { gap: 28 },
    footerLogo: { fontSize: 20, fontFamily: FONTS.soraExtraBold, marginBottom: 8 },
    footerDesc: { fontSize: 13, lineHeight: 20, fontFamily: FONTS.interRegular, maxWidth: 320 },
    footerColTitle: { fontSize: 13, fontFamily: FONTS.interSemiBold, marginBottom: 10 },
    footerLink: { fontSize: 13, fontFamily: FONTS.interRegular, marginBottom: 8 },
    footerBottom: { fontSize: 12, textAlign: 'center', borderTopWidth: 1, paddingTop: 20, fontFamily: FONTS.interRegular },
  });
