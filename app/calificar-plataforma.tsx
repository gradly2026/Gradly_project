// ════════════════════════════════════════════════════════════════════════
// GUÍA PARA PRINCIPIANTES:
// Pantalla de "Calificar la plataforma" — el usuario opina sobre GRADLY
// COMO TAL (facilidad de uso, diseño, rendimiento, utilidad general), no
// sobre otra persona ni sobre una pasantía real (eso es `feedback_pasantias`,
// ver ResenasFeedback.tsx). Se llega aquí desde "Mi perfil", igual que
// Ayuda (help-gradly.tsx) y Acerca de Gradly (about-gradly.tsx) — mismo
// patrón de pantalla: LiquidBackground + GlassCard + makeStyles(colors).
//
// Dos partes en una sola pantalla:
//   1. El formulario (arriba): 4 categorías con estrellas + un comentario +
//      un campo aparte, opcional, para reportar un problema/corrección.
//      Es un "upsert": si el usuario ya había calificado antes, esta
//      pantalla precarga sus valores y reenviar actualiza la misma
//      calificación (no crea una segunda).
//   2. La lista pública (abajo): todas las calificaciones de los 3 roles,
//      filtrable. El campo de "corrección" NUNCA aparece aquí — ver el
//      comentario de cabecera de calificacionPlataformaService.ts sobre por
//      qué vive en un documento aparte, solo-admin.
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text, AutoTextInput as TextInput } from '../src/components/AutoText';
import { GlassCard } from '../components/ui/liquid-glass/GlassCard';
import { LiquidBackground } from '../components/ui/liquid-glass/LiquidBackground';
import { useAuth } from '../src/context/AuthContext';
import { FONTS, useTheme, webScrollStyle, type GradlyColors } from '../src/context/ThemeContext';
import {
  enviarCalificacionPlataforma,
  labelRolCalificacion,
  promedioCalificacion,
  suscribirCalificacionesPlataforma,
  suscribirMiCalificacion,
  type CalificacionPlataforma,
  type RolCalificacion,
} from '../src/services/calificacionPlataformaService';

const STAR_COLOR = '#f5b50a';

function useThemedStyles() {
  const { colors } = useTheme();
  return useMemo(() => ({ colors, styles: makeStyles(colors) }), [colors]);
}

/** Fila de 5 estrellas TAPEABLES — a diferencia de la `Estrellas` de solo
 *  lectura (más abajo), esta es la única parte interactiva: cada estrella es
 *  su propio botón, igual al patrón ya usado en `StarRow`
 *  (FeedbackExperienciaModal.tsx), aquí en escala 1-5 en vez de 1-10. */
function EstrellasInput({ valor, onChange, size = 26 }: { valor: number; onChange: (v: number) => void; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity
          key={n}
          onPress={() => onChange(n)}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          activeOpacity={0.7}
        >
          <Ionicons name={n <= valor ? 'star' : 'star-outline'} size={size} color={STAR_COLOR} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

/** Fila de 5 estrellas de solo lectura (soporta medias estrellas para
 *  promedios) — mismo patrón ya duplicado en ResenasFeedback/RangoCard/
 *  CertificadoGradly; una copia local más es consistente con ese precedente
 *  del proyecto (no se centralizó ahí tampoco). */
function Estrellas({ valor, size = 14 }: { valor: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const name = valor >= n ? 'star' : valor >= n - 0.5 ? 'star-half' : 'star-outline';
        return <Ionicons key={n} name={name as any} size={size} color={STAR_COLOR} />;
      })}
    </View>
  );
}

const CATEGORIAS: { key: 'facilidadUso' | 'diseno' | 'rendimiento' | 'utilidadGeneral'; label: string; icon: any }[] = [
  { key: 'facilidadUso', label: 'Facilidad de uso', icon: 'compass-outline' },
  { key: 'diseno', label: 'Diseño e interfaz', icon: 'color-palette-outline' },
  { key: 'rendimiento', label: 'Rendimiento y velocidad', icon: 'speedometer-outline' },
  { key: 'utilidadGeneral', label: 'Utilidad general', icon: 'ribbon-outline' },
];

const FILTROS: { key: 'todas' | RolCalificacion; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'estudiante', label: 'Estudiantes' },
  { key: 'empresa', label: 'Empresas' },
  { key: 'universidad', label: 'Universidades' },
];

function fechaRelativa(ts: any): string {
  const ms = ts?.toMillis?.();
  if (!ms) return '';
  const dias = Math.floor((Date.now() - ms) / 86400000);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  if (dias < 30) return `Hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? 'Hace 1 mes' : `Hace ${meses} meses`;
}

export default function CalificarPlataformaScreen() {
  const router = useRouter();
  const { styles, colors } = useThemedStyles();
  const { user, rol } = useAuth();
  const rolValido: RolCalificacion | null =
    rol === 'estudiante' || rol === 'empresa' || rol === 'universidad' ? rol : null;
  const scrollStyle = webScrollStyle(colors);

  // ── Formulario (precargado si ya existe una calificación previa) ──
  const [facilidadUso, setFacilidadUso] = useState(0);
  const [diseno, setDiseno] = useState(0);
  const [rendimiento, setRendimiento] = useState(0);
  const [utilidadGeneral, setUtilidadGeneral] = useState(0);
  const [comentario, setComentario] = useState('');
  const [correccion, setCorreccion] = useState('');
  const [yaCalifico, setYaCalifico] = useState(false);
  // Con una calificación ya guardada, el formulario queda colapsado detrás
  // de una confirmación compacta ("¡Gracias!" + botón) — recién se vuelve a
  // mostrar si el usuario toca ese botón para editarla. Antes de tener
  // ninguna calificación, no hay nada que colapsar: se ve el formulario de
  // una vez.
  const [editando, setEditando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = suscribirMiCalificacion(user.uid, (c) => {
      if (!c) return;
      setFacilidadUso(c.facilidadUso);
      setDiseno(c.diseno);
      setRendimiento(c.rendimiento);
      setUtilidadGeneral(c.utilidadGeneral);
      setComentario(c.comentario ?? '');
      setYaCalifico(true);
    });
    return unsub;
  }, [user?.uid]);

  // ── Lista pública, filtrable ──
  const [lista, setLista] = useState<CalificacionPlataforma[]>([]);
  const [filtro, setFiltro] = useState<'todas' | RolCalificacion>('todas');
  useEffect(() => {
    const unsub = suscribirCalificacionesPlataforma(setLista);
    return unsub;
  }, []);
  const listaFiltrada = filtro === 'todas' ? lista : lista.filter((c) => c.usuarioRol === filtro);

  const handleEnviar = async () => {
    if (enviando) return;
    if (!facilidadUso || !diseno || !rendimiento || !utilidadGeneral) {
      setError('Completa las 4 estrellas antes de enviar.');
      return;
    }
    if (!rolValido) {
      setError('Sesión no válida.');
      return;
    }
    setError('');
    setEnviando(true);
    try {
      await enviarCalificacionPlataforma({
        usuarioRol: rolValido,
        facilidadUso,
        diseno,
        rendimiento,
        utilidadGeneral,
        comentario,
        correccion,
      });
      setYaCalifico(true);
      setCorreccion('');
      setEditando(false);
    } catch (e: any) {
      setError(e?.message || 'No se pudo enviar. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <LiquidBackground>
      <View style={styles.root}>
        <StatusBar style="light" />

        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/(tabs)/perfil' as any);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Calificar la plataforma</Text>
        </View>

        <ScrollView
          style={[styles.scrollView, scrollStyle]}
          showsVerticalScrollIndicator
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.scroll, { flexGrow: 1 }]}
        >
          <GlassCard contentStyle={styles.heroCard}>
            <View style={styles.heroBadge}>
              <Ionicons name="star-outline" size={18} color={colors.primaryLight} />
              <Text style={styles.heroBadgeText} noTranslate>Gradly</Text>
            </View>
            <Text style={styles.sectionTitle}>
              {yaCalifico ? 'Tu calificación' : '¿Qué te parece Gradly?'}
            </Text>
            <Text style={styles.paragraph}>
              Tu opinión nos ayuda a mejorar la plataforma. Califica estos aspectos, deja un
              comentario si quieres, y si algo no funcionó como debía, cuéntanoslo abajo.
            </Text>
          </GlassCard>

          {yaCalifico && !editando ? (
            <GlassCard contentStyle={styles.confirmacionCard}>
              <Text style={styles.exito}>¡Gracias por tu calificación!</Text>
              <TouchableOpacity style={styles.actualizarBtn} onPress={() => setEditando(true)} activeOpacity={0.85}>
                <Text style={styles.actualizarBtnText}>Actualizar calificación</Text>
              </TouchableOpacity>
            </GlassCard>
          ) : (
            <GlassCard contentStyle={styles.formCard}>
              {CATEGORIAS.map((c) => (
                <View key={c.key} style={styles.estrellaFila}>
                  <View style={styles.estrellaLabelRow}>
                    <Ionicons name={c.icon} size={16} color={colors.textSecondary} />
                    <Text style={styles.estrellaLabel}>{c.label}</Text>
                  </View>
                  <EstrellasInput
                    valor={{ facilidadUso, diseno, rendimiento, utilidadGeneral }[c.key]}
                    onChange={{ facilidadUso: setFacilidadUso, diseno: setDiseno, rendimiento: setRendimiento, utilidadGeneral: setUtilidadGeneral }[c.key]}
                  />
                </View>
              ))}

              <View style={styles.campo}>
                <Text style={styles.campoLabel}>Comentario (opcional)</Text>
                <TextInput
                  style={styles.input}
                  value={comentario}
                  onChangeText={setComentario}
                  placeholder="¿Qué te gusta o qué mejorarías?"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.campo}>
                <View style={styles.correccionLabelRow}>
                  <Ionicons name="bug-outline" size={16} color={colors.accent} />
                  <Text style={styles.correccionLabel}>¿Algo que corregir? (opcional)</Text>
                </View>
                <Text style={styles.correccionAyuda}>
                  Cuéntanos un error o problema puntual que hayas tenido con la plataforma. Esto
                  solo lo ve el equipo de Gradly, no aparece en la lista pública de abajo.
                </Text>
                <TextInput
                  style={styles.input}
                  value={correccion}
                  onChangeText={setCorreccion}
                  placeholder="Describe el problema (opcional)"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={3}
                />
              </View>

              {!!error && <Text style={styles.error}>{error}</Text>}

              <TouchableOpacity
                style={[styles.enviarBtn, { backgroundColor: colors.primary }, enviando && { opacity: 0.6 }]}
                onPress={handleEnviar}
                disabled={enviando}
                activeOpacity={0.9}
              >
                <Text style={styles.enviarBtnText}>
                  {enviando ? 'Enviando…' : yaCalifico ? 'Actualizar calificación' : 'Enviar calificación'}
                </Text>
              </TouchableOpacity>
            </GlassCard>
          )}

          <View style={styles.listaHeadRow}>
            <Text style={styles.sectionTitle}>Lo que opina la comunidad</Text>
          </View>

          <View style={styles.filtrosRow}>
            {FILTROS.map((f) => {
              const activo = filtro === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[
                    styles.filtroChip,
                    { borderColor: colors.border },
                    activo && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => setFiltro(f.key)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.filtroChipText, activo && { color: '#fff' }]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {listaFiltrada.length === 0 ? (
            <GlassCard contentStyle={styles.vacioCard}>
              <Text style={styles.vacioText}>Todavía no hay calificaciones en esta categoría.</Text>
            </GlassCard>
          ) : (
            <View style={{ gap: 10 }}>
              {listaFiltrada.map((c) => (
                <GlassCard key={c.id} contentStyle={styles.resenaCard}>
                  <View style={styles.resenaHeadRow}>
                    <Estrellas valor={promedioCalificacion(c)} size={15} />
                    <Text style={styles.resenaFecha} noTranslate>{fechaRelativa(c.actualizadoAt)}</Text>
                  </View>
                  <Text style={styles.resenaRol}>{labelRolCalificacion(c.usuarioRol)}</Text>
                  {!!c.comentario && <Text style={styles.resenaComentario}>{c.comentario}</Text>}
                </GlassCard>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </LiquidBackground>
  );
}

const makeStyles = (COLORS: GradlyColors) =>
  StyleSheet.create({
    root: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingTop: 56,
      paddingHorizontal: 16,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: COLORS.white8,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    headerTitle: {
      fontSize: 22,
      fontFamily: FONTS.soraBold,
      color: COLORS.textPrimary,
    },
    scroll: {
      padding: 16,
      paddingBottom: 120,
      gap: 16,
      width: '100%',
      maxWidth: 640,
      alignSelf: 'center',
    },
    scrollView: { flex: 1, minHeight: 0 },
    heroCard: { padding: 20, gap: 14 },
    heroBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: COLORS.primary12,
      borderWidth: 1,
      borderColor: COLORS.primary35,
    },
    heroBadgeText: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },
    sectionTitle: { fontSize: 20, fontFamily: FONTS.soraSemiBold, color: COLORS.textPrimary },
    paragraph: { fontSize: 14, lineHeight: 22, fontFamily: FONTS.interRegular, color: COLORS.textMuted },

    formCard: { padding: 18, gap: 16 },
    estrellaFila: { gap: 8 },
    estrellaLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    estrellaLabel: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },

    campo: { gap: 8 },
    campoLabel: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.textSecondary },
    input: {
      borderWidth: 1,
      borderColor: COLORS.border,
      borderRadius: 12,
      padding: 12,
      minHeight: 80,
      textAlignVertical: 'top',
      fontSize: 14,
      fontFamily: FONTS.interRegular,
      color: COLORS.textPrimary,
      backgroundColor: COLORS.backgroundSurface,
    },
    divider: { height: 1, backgroundColor: COLORS.border },
    correccionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    correccionLabel: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
    correccionAyuda: { fontSize: 12.5, lineHeight: 18, fontFamily: FONTS.interRegular, color: COLORS.textMuted },

    error: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.error },
    exito: { flex: 1, fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.success },

    enviarBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    enviarBtnText: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: '#fff' },

    confirmacionCard: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      padding: 20,
    },
    actualizarBtn: {
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 11,
      backgroundColor: COLORS.primary12,
      borderWidth: 1,
      borderColor: COLORS.primary35,
    },
    actualizarBtnText: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },

    listaHeadRow: { marginTop: 4 },
    filtrosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    filtroChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
    filtroChipText: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: COLORS.textSecondary },

    vacioCard: { padding: 20, alignItems: 'center' },
    vacioText: { fontSize: 13.5, fontFamily: FONTS.interRegular, color: COLORS.textMuted },

    resenaCard: { padding: 16, gap: 8 },
    resenaHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    resenaFecha: { fontSize: 11.5, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
    resenaRol: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: COLORS.textSecondary },
    resenaComentario: { fontSize: 14, lineHeight: 20, fontFamily: FONTS.interRegular, color: COLORS.textPrimary },
  });
