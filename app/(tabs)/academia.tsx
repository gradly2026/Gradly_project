// ════════════════════════════════════════════════════════════════════════
// GUÍA PARA PRINCIPIANTES:
// La pestaña "Academia" del estudiante: cursos recomendados, guías
// rápidas y un "tip de la semana". IMPORTANTE: todo el contenido de esta
// pantalla (cursos, guías, el tip) está ESCRITO A MANO en este mismo
// archivo (ver "CONTENIDO ESTÁTICO (MVP)" abajo) — NO viene de Firestore.
// Es un buen ejemplo de una pantalla que combina datos LOCALES fijos con
// los mismos patrones visuales (GlassCard, makeStyles) que sí se usan en
// pantallas con datos reales de la base de datos.
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from "../../src/components/AutoText";
import { COLORS, FONTS, useTheme, type GradlyColors } from '../../src/context/ThemeContext';
// Ojo: se importa TANTO `COLORS` (el atajo fijo al tema oscuro) COMO
// `useTheme` (el hook que sí reacciona al tema activo). Más abajo, dentro
// del JSX, se usa `COLORS` directamente en varios lugares — significa que
// esas partes puntuales de esta pantalla NO cambian de color en modo
// claro (posible resabio de una migración incompleta al patrón dinámico
// completo, algo que verás mencionado como pendiente en la memoria del
// proyecto sobre el bug de modales/temas).
import { LiquidBackground } from '../../components/ui/liquid-glass/LiquidBackground';
import { GlassCard } from '../../components/ui/liquid-glass/GlassCard';

// Hook que recrea los estilos según el tema activo (claro/oscuro)
function useThemedStyles() {
  const { colors } = useTheme();
  return useMemo(() => ({ colors, styles: makeStyles(colors) }), [colors]);
}

// ─────────────────────────────────────────────
// CONTENIDO ESTÁTICO (MVP)
// ─────────────────────────────────────────────
// "MVP" = Minimum Viable Product (producto mínimo viable): una primera
// versión funcional, aquí con contenido fijo en vez de un sistema
// completo de gestión de cursos — suficiente para demostrar la pantalla
// sin necesitar un panel de administración de contenido educativo todavía.
const CURSOS = [
  { id: '1', titulo: 'CV que enamora empresas', duracion: '1h 45min', nivel: 'Básico',    icon: 'document-text-outline', nuevo: true  },
  { id: '2', titulo: 'Entrevistas que conquistan',duracion: '2h 10min', nivel: 'Intermedio',icon: 'mic-outline',           nuevo: true  },
  { id: '3', titulo: 'Excel para profesionales', duracion: '3h 20min', nivel: 'Intermedio',icon: 'grid-outline',          nuevo: false },
  { id: '4', titulo: 'Comunicación efectiva',    duracion: '1h 30min', nivel: 'Básico',    icon: 'chatbubbles-outline',   nuevo: false },
  { id: '5', titulo: 'Trabajo en equipo',        duracion: '1h 15min', nivel: 'Básico',    icon: 'people-outline',        nuevo: false },
  { id: '6', titulo: 'LinkedIn profesional',     duracion: '55min',    nivel: 'Básico',    icon: 'logo-linkedin',         nuevo: false },
] as const;
// Un array fijo de objetos "curso". "as const" (visto también en
// ThemeContext.tsx) congela cada valor como literal exacto — así
// `curso.nivel` no es un `string` genérico sino específicamente 'Básico'
// | 'Intermedio', lo cual ayuda a TypeScript a detectar errores de tipeo.

const GUIAS = [
  { id: 'g1', titulo: 'Cómo redactar un CV impactante', icon: 'document-outline' },
  { id: 'g2', titulo: 'Qué esperar en tu primera pasantía', icon: 'briefcase-outline' },
  { id: 'g3', titulo: 'Cómo negociar tu primer contrato', icon: 'people-outline' },
  { id: 'g4', titulo: 'Networking desde cero', icon: 'person-add-outline' },
  { id: 'g5', titulo: 'Errores comunes en entrevistas', icon: 'warning-outline' },
];

const TIP = {
  titulo: 'Tip de la semana',
  texto: 'Personaliza cada CV para la empresa a la que aplicas. Los reclutadores reciben decenas de solicitudes genéricas — la tuya debe mostrar que investigaste a la empresa.',
  autor: 'Equipo Gradly',
};
// Un solo objeto (no una lista) porque solo hay UN tip mostrado a la vez.

// ─────────────────────────────────────────────
// COMPONENTES
// ─────────────────────────────────────────────
function CursoCard({ curso }: { curso: typeof CURSOS[number] }) {
  // "typeof CURSOS[number]" es un tipo calculado: significa "el tipo de
  // UN elemento cualquiera dentro del array CURSOS" — así, si mañana se
  // agrega o cambia una propiedad en los objetos de CURSOS, este tipo se
  // actualiza solo, sin tener que escribir una interfaz aparte a mano.
  const { styles } = useThemedStyles();
  return (
    <GlassCard style={{ width: 160 }} contentStyle={{ padding: 0 }}>
      {/* Thumbnail placeholder */}
      <View style={[styles.cursoThumb, { backgroundColor: COLORS.backgroundSurface }]}>
        <Ionicons name={curso.icon as any} size={28} color={COLORS.primaryLight} />
        {curso.nuevo && (
          // Solo se muestra el badge "NUEVO" si `curso.nuevo` es true.
          <View style={styles.nuevoBadge}>
            <Text style={styles.nuevoText}>NUEVO</Text>
          </View>
        )}
      </View>
      <View style={styles.cursoMeta}>
        <Text style={styles.cursoTitulo} numberOfLines={2}>{curso.titulo}</Text>
        {/* numberOfLines={2} corta el texto con "..." si ocupara más de 2
            líneas, para que todas las tarjetas mantengan la misma altura. */}
        <View style={styles.cursoFooter}>
          <Text style={styles.cursoDuracion}>{curso.duracion}</Text>
          <View style={styles.nivelBadge}>
            <Text style={styles.nivelText}>{curso.nivel}</Text>
          </View>
        </View>
      </View>
    </GlassCard>
  );
}

function GuiaRow({ guia }: { guia: typeof GUIAS[number] }) {
  const { styles } = useThemedStyles();
  return (
    <TouchableOpacity style={styles.guiaRow} activeOpacity={0.8}>
      <View style={styles.guiaIconWrap}>
        <Ionicons name={guia.icon as any} size={18} color={COLORS.primaryLight} />
      </View>
      <Text style={styles.guiaTitulo} numberOfLines={1}>{guia.titulo}</Text>
      <Ionicons name="chevron-forward-outline" size={16} color={COLORS.textMuted} />
      {/* Una flechita a la derecha, que sugiere "esto es tocable y lleva
          a algo más" — aunque, en esta versión MVP, onPress no está
          definido (tocar una guía todavía no hace nada). */}
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────
// PANTALLA
// ─────────────────────────────────────────────
export default function AcademiaTab() {
  const { styles, colors } = useThemedStyles();
  const webScrollStyle = Platform.OS === 'web'
    ? ({ scrollbarColor: `${colors.primary35} ${colors.backgroundSurface}`, scrollbarWidth: 'thin' } as any)
    : undefined;
  return (
    <LiquidBackground>
    <View style={[styles.root, { backgroundColor: 'transparent' }]}>
      {/* backgroundColor: 'transparent' sobrescribe el fondo sólido que
          styles.root ya trae, para que en su lugar se vea el fondo
          decorativo de <LiquidBackground> por detrás. */}
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Academia Gradly</Text>
          <Text style={styles.headerSub}>Prepárate para tu pasantía</Text>
          {/* Estos textos NO usan t() ni AutoText — quedaron como texto
              fijo en español directo. A diferencia de otras pantallas del
              proyecto, esta no tiene traducción dinámica de su título
              (podría ser una oportunidad de mejora futura, no un error
              del código en sí). */}
        </View>
        <Ionicons name="school-outline" size={28} color={COLORS.primaryLight} />
      </View>

      <ScrollView
        style={webScrollStyle}
        showsVerticalScrollIndicator
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scroll, { flexGrow: 1 }]}
      >

        {/* ── Cursos recomendados ── */}
        <Text style={styles.sectionTitle}>Cursos recomendados</Text>
        <ScrollView
          horizontal
          // horizontal → este ScrollView anidado se desliza de IZQUIERDA
          // A DERECHA en vez de arriba-abajo, formando el típico
          // "carrusel" de tarjetas de cursos.
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12, paddingRight: 16 }}
        >
          {CURSOS.map(c => <CursoCard key={c.id} curso={c} />)}
          {/* .map() sobre el array fijo CURSOS: dibuja una <CursoCard>
              por cada curso definido arriba. */}
        </ScrollView>

        {/* ── Guías rápidas ── */}
        <Text style={styles.sectionTitle}>Guías rápidas</Text>
        <GlassCard style={{ marginBottom: 8 }} contentStyle={{ padding: 0 }}>
          {GUIAS.map(g => <GuiaRow key={g.id} guia={g} />)}
        </GlassCard>

        {/* ── Tip de la semana ── */}
        <Text style={styles.sectionTitle}>Tip de la semana</Text>
        <GlassCard style={{ borderColor: COLORS.gold + '33' }} contentStyle={{ padding: 20, gap: 12 }}>
          {/* "COLORS.gold + '33'" concatena el color hexadecimal con el
              texto '33' — en formato de color hexadecimal de 8 dígitos,
              los últimos 2 caracteres representan la OPACIDAD (33 en
              hexadecimal ≈ 20% de opacidad). Es una forma rápida de tomar
              un color sólido existente y volverlo semi-transparente sin
              tener que definir una variante nueva. */}
          <View style={styles.tipHeader}>
            <View style={styles.tipIconWrap}>
              <Ionicons name="bulb-outline" size={20} color={COLORS.gold} />
            </View>
            <Text style={styles.tipTitulo}>{TIP.titulo}</Text>
          </View>
          <Text style={styles.tipTexto}>{TIP.texto}</Text>
          <Text style={styles.tipAutor}>— {TIP.autor}</Text>
        </GlassCard>

      </ScrollView>
    </View>
    </LiquidBackground>
  );
}

// ─────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────
const makeStyles = (COLORS: GradlyColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.backgroundDark },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',   // título a la izquierda, ícono a la derecha, separados al máximo
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerLeft: {},   // objeto vacío: no necesita estilos propios, solo agrupa 2 <Text> en columna por defecto
  headerTitle: { fontSize: 22, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
  headerSub: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textMuted, marginTop: 2 },

  scroll: { padding: 16, paddingBottom: 100 },
  sectionTitle: {
    fontSize: 16, fontFamily: FONTS.soraSemiBold,
    color: COLORS.textPrimary, marginBottom: 12, marginTop: 8,
  },

  // Cursos
  cursoCard: {
    // Nota: este estilo `cursoCard` está definido pero NO se usa en el
    // JSX de arriba (CursoCard aplica su tamaño con un `style={{ width: 160 }}`
    // inline en vez de con este objeto) — puede ser un estilo que quedó
    // sin usar tras algún cambio anterior; no rompe nada, simplemente no
    // se aplica en ningún lado.
    width: 160,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border,
  },
  cursoThumb: {
    height: 90, alignItems: 'center', justifyContent: 'center',
  },
  nuevoBadge: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2,
  },
  nuevoText: { fontSize: 9, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  cursoMeta: { padding: 10, gap: 6 },
  cursoTitulo: {
    fontSize: 13, fontFamily: FONTS.interSemiBold,
    color: COLORS.textPrimary, lineHeight: 18,
  },
  cursoFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cursoDuracion: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  nivelBadge: {
    backgroundColor: COLORS.primary12,
    borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },
  nivelText: { fontSize: 9, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },

  // Guías
  guiasContainer: {
    // Tampoco se usa directamente (GuiaRow las envuelve con un GlassCard
    // en vez de este estilo) — mismo caso que cursoCard arriba.
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border,
    marginBottom: 8,
  },
  guiaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  guiaIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.primary12,
    alignItems: 'center', justifyContent: 'center',
  },
  guiaTitulo: {
    flex: 1, fontSize: 14,
    fontFamily: FONTS.interMedium, color: COLORS.textPrimary,
  },

  // Tip
  tipCard: {
    // Igual que los 2 casos anteriores: no se usa en el JSX (el estilo se
    // arma inline con `borderColor` calculado + `contentStyle`).
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: COLORS.gold + '33',
    gap: 12,
  },
  tipHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tipIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.gold + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  tipTitulo: { fontSize: 15, fontFamily: FONTS.soraSemiBold, color: COLORS.textPrimary, flex: 1 },
  tipTexto: {
    fontSize: 14, fontFamily: FONTS.interRegular,
    color: COLORS.white60, lineHeight: 22,
  },
  tipAutor: { fontSize: 12, fontFamily: FONTS.interMedium, color: COLORS.textMuted },
});
