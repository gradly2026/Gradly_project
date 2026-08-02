import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from "../../src/components/AutoText";
import { COLORS, FONTS, useTheme, type GradlyColors } from '../../src/context/ThemeContext';
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
const CURSOS = [
  { id: '1', titulo: 'CV que enamora empresas', duracion: '1h 45min', nivel: 'Básico',    icon: 'document-text-outline', nuevo: true  },
  { id: '2', titulo: 'Entrevistas que conquistan',duracion: '2h 10min', nivel: 'Intermedio',icon: 'mic-outline',           nuevo: true  },
  { id: '3', titulo: 'Excel para profesionales', duracion: '3h 20min', nivel: 'Intermedio',icon: 'grid-outline',          nuevo: false },
  { id: '4', titulo: 'Comunicación efectiva',    duracion: '1h 30min', nivel: 'Básico',    icon: 'chatbubbles-outline',   nuevo: false },
  { id: '5', titulo: 'Trabajo en equipo',        duracion: '1h 15min', nivel: 'Básico',    icon: 'people-outline',        nuevo: false },
  { id: '6', titulo: 'LinkedIn profesional',     duracion: '55min',    nivel: 'Básico',    icon: 'logo-linkedin',         nuevo: false },
] as const;

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

// ─────────────────────────────────────────────
// COMPONENTES
// ─────────────────────────────────────────────
function CursoCard({ curso }: { curso: typeof CURSOS[number] }) {
  const { styles } = useThemedStyles();
  return (
    <GlassCard style={{ width: 160 }} contentStyle={{ padding: 0 }}>
      {/* Thumbnail placeholder */}
      <View style={[styles.cursoThumb, { backgroundColor: COLORS.backgroundSurface }]}>
        <Ionicons name={curso.icon as any} size={28} color={COLORS.primaryLight} />
        {curso.nuevo && (
          <View style={styles.nuevoBadge}>
            <Text style={styles.nuevoText}>NUEVO</Text>
          </View>
        )}
      </View>
      <View style={styles.cursoMeta}>
        <Text style={styles.cursoTitulo} numberOfLines={2}>{curso.titulo}</Text>
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
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Academia Gradly</Text>
          <Text style={styles.headerSub}>Prepárate para tu pasantía</Text>
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
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12, paddingRight: 16 }}
        >
          {CURSOS.map(c => <CursoCard key={c.id} curso={c} />)}
        </ScrollView>

        {/* ── Guías rápidas ── */}
        <Text style={styles.sectionTitle}>Guías rápidas</Text>
        <GlassCard style={{ marginBottom: 8 }} contentStyle={{ padding: 0 }}>
          {GUIAS.map(g => <GuiaRow key={g.id} guia={g} />)}
        </GlassCard>

        {/* ── Tip de la semana ── */}
        <Text style={styles.sectionTitle}>Tip de la semana</Text>
        <GlassCard style={{ borderColor: COLORS.gold + '33' }} contentStyle={{ padding: 20, gap: 12 }}>
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
    justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerLeft: {},
  headerTitle: { fontSize: 22, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
  headerSub: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textMuted, marginTop: 2 },

  scroll: { padding: 16, paddingBottom: 100 },
  sectionTitle: {
    fontSize: 16, fontFamily: FONTS.soraSemiBold,
    color: COLORS.textPrimary, marginBottom: 12, marginTop: 8,
  },

  // Cursos
  cursoCard: {
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
