/**
 * PerfilMasterDetail.tsx — Vista reutilizable de "Mi Perfil" con patrón
 * master-detail (inspirado en el mockup del proyecto):
 *
 *   · Vista MAESTRA: header oscuro con avatar/logo (+ botón cambiar foto),
 *     nombre y subtítulo; debajo, tarjetas de categoría que abren subsecciones.
 *     Al final SIEMPRE: Preferencias (opcional), Ayuda, Acerca de Gradly y
 *     Cerrar sesión.
 *   · Vista DETALLE: cada sección se abre con botón "‹ atrás". Las secciones
 *     con campos editables arrancan en modo LECTURA y se editan con "Editar"
 *     → "Guardar / Cancelar". Las secciones visuales (gráficos, plan, etc.)
 *     se pasan como `render`.
 *
 * Es agnóstico al rol: cada dashboard le pasa sus propios datos, secciones y
 * handlers reales (guardar, subir foto/logo, etc.). No implementa lógica de
 * negocio: solo orquesta presentación y el modo lectura/edición.
 */
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,


  TouchableOpacity,
  View,
} from 'react-native';
import { AutoText as Text, AutoTextInput as TextInput } from "./AutoText";
import StorageAvatar from './StorageAvatar';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { useAppLanguage } from '../../hooks/useAppLanguage';

export type PerfilTone = 'blue' | 'green' | 'orange' | 'red' | 'purple';

export interface PerfilField {
  key: string;
  label: string;
  value: string;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad' | 'url';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  multiline?: boolean;
}

export interface PerfilSection {
  id: string;
  title: string;
  /** Texto corto bajo el título en la tarjeta del menú. */
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: PerfilTone;
  /** Descripción dentro del detalle (encabezado). */
  description?: string;
  /** Campos editables; si se define junto a onSave habilita el modo edición. */
  fields?: PerfilField[];
  onSave?: (values: Record<string, string>) => Promise<void> | void;
  /** Contenido visual personalizado (gráfico, plan, tarjeta…). Solo lectura. */
  render?: () => React.ReactNode;
}

export interface PerfilMasterDetailLabels {
  editar: string;
  guardar: string;
  cancelar: string;
  preferencias: string;
  preferenciasSub: string;
  tema: string;
  temaClaro: string;
  temaOscuro: string;
  idioma: string;
  ayuda: string;
  acerca: string;
  cerrarSesion: string;
  cuenta: string;
}

const LABELS_ES: PerfilMasterDetailLabels = {
  editar: 'Editar',
  guardar: 'Guardar cambios',
  cancelar: 'Cancelar',
  preferencias: 'Preferencias',
  preferenciasSub: 'Tema e idioma',
  tema: 'Tema de la app',
  temaClaro: 'Claro',
  temaOscuro: 'Oscuro',
  idioma: 'Idioma',
  ayuda: 'Ayuda',
  acerca: 'Acerca de Gradly',
  cerrarSesion: 'Cerrar sesión',
  cuenta: 'Cuenta',
};

export interface PerfilMasterDetailProps {
  name: string;
  subtitle?: string;
  avatarUrl?: string | null;
  avatarStoragePath?: string | null;
  fallbackIcon?: keyof typeof Ionicons.glyphMap;
  onEditPhoto?: () => void;
  uploadingPhoto?: boolean;
  sections: PerfilSection[];
  includePreferencias?: boolean;
  onAyuda: () => void;
  onAcerca: () => void;
  onLogout: () => void;
  labels?: Partial<PerfilMasterDetailLabels>;
}

const PREFS_ID = '__prefs__';

export default function PerfilMasterDetail(props: PerfilMasterDetailProps) {
  const {
    name, subtitle, avatarUrl, avatarStoragePath, fallbackIcon = 'person',
    onEditPhoto, uploadingPhoto, sections, includePreferencias = true,
    onAyuda, onAcerca, onLogout,
  } = props;

  const { colors, isDark, setTheme } = useTheme();
  const { language, setLanguage } = useAppLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const webScrollStyle = Platform.OS === 'web'
    ? ({ scrollbarColor: `${colors.primary35} ${colors.backgroundSurface}`, scrollbarWidth: 'thin' } as any)
    : undefined;
  const labels = { ...LABELS_ES, ...(props.labels ?? {}) };

  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const active = sections.find(s => s.id === activeId) ?? null;
  const isPrefs = activeId === PREFS_ID;

  const abrir = (id: string) => { setActiveId(id); setEditing(false); };
  const cerrar = () => { setActiveId(null); setEditing(false); };

  const entrarEdicion = (sec: PerfilSection) => {
    const init: Record<string, string> = {};
    (sec.fields ?? []).forEach(f => { init[f.key] = f.value ?? ''; });
    setForm(init);
    setEditing(true);
  };

  const guardar = async (sec: PerfilSection) => {
    if (!sec.onSave) { setEditing(false); return; }
    setSaving(true);
    try {
      await sec.onSave(form);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const toneColor = (tone?: PerfilTone): string => {
    switch (tone) {
      case 'green':  return colors.success;
      case 'orange': return colors.accent;
      case 'red':    return colors.error;
      case 'purple': return colors.primary;
      case 'blue':
      default:       return colors.primaryLight;
    }
  };

  // ── Tarjeta de categoría (menú maestro) ──
  const MenuBox = ({ id, icon, title, sub, tone, danger }: {
    id: string; icon: keyof typeof Ionicons.glyphMap; title: string; sub?: string; tone?: PerfilTone; danger?: boolean;
  }) => {
    const c = danger ? colors.error : toneColor(tone);
    return (
      <TouchableOpacity style={styles.menuBox} activeOpacity={0.8} onPress={() => abrir(id)}>
        <View style={[styles.iconWrap, { backgroundColor: c + '1f', borderColor: c + '55' }]}>
          <Ionicons name={icon} size={18} color={c} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.menuTitle, danger && { color: colors.error }]} numberOfLines={1}>{title}</Text>
          {!!sub && <Text style={styles.menuSub} numberOfLines={1}>{sub}</Text>}
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </TouchableOpacity>
    );
  };

  // ═══════════════ VISTA DETALLE ═══════════════
  if (active || isPrefs) {
    return (
      <View style={styles.container}>
        <View style={styles.detailHeader}>
          <TouchableOpacity style={styles.backBtn} onPress={cerrar}>
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.detailTitle} numberOfLines={1}>
            {isPrefs ? labels.preferencias : active?.title}
          </Text>
        </View>

        <ScrollView
          style={webScrollStyle}
          showsVerticalScrollIndicator
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 20, paddingBottom: 120, maxWidth: 640, alignSelf: 'center', width: '100%', flexGrow: 1 }}
        >
          {/* ── PREFERENCIAS (tema + idioma) ── */}
          {isPrefs && (
            <View style={{ gap: 22 }}>
              <View>
                <Text style={styles.prefLabel}>{labels.tema}</Text>
                <View style={styles.segment}>
                  <TouchableOpacity
                    style={[styles.segmentBtn, !isDark && styles.segmentBtnActive]}
                    onPress={() => setTheme('light')}
                  >
                    <Ionicons name="sunny-outline" size={16} color={!isDark ? colors.textPrimary : colors.textMuted} />
                    <Text style={[styles.segmentText, !isDark && styles.segmentTextActive]}>{labels.temaClaro}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.segmentBtn, isDark && styles.segmentBtnActive]}
                    onPress={() => setTheme('dark')}
                  >
                    <Ionicons name="moon-outline" size={16} color={isDark ? colors.textPrimary : colors.textMuted} />
                    <Text style={[styles.segmentText, isDark && styles.segmentTextActive]}>{labels.temaOscuro}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View>
                <Text style={styles.prefLabel}>{labels.idioma}</Text>
                <View style={styles.segment}>
                  <TouchableOpacity
                    style={[styles.segmentBtn, language === 'es' && styles.segmentBtnActive]}
                    onPress={() => setLanguage('es')}
                  >
                    <Text style={[styles.segmentText, language === 'es' && styles.segmentTextActive]}>Español</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.segmentBtn, language === 'en' && styles.segmentBtnActive]}
                    onPress={() => setLanguage('en')}
                  >
                    <Text style={[styles.segmentText, language === 'en' && styles.segmentTextActive]}>English</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* ── SECCIÓN CON CONTENIDO VISUAL (render) ── */}
          {active?.render && (
            <View>
              {!!active.description && <Text style={styles.detailDesc}>{active.description}</Text>}
              {active.render()}
            </View>
          )}

          {/* ── SECCIÓN CON CAMPOS (lectura / edición) ── */}
          {active?.fields && (
            <View>
              <View style={styles.sectionActions}>
                <Text style={styles.detailDesc}>{active.description ?? ''}</Text>
                {active.onSave && !editing && (
                  <TouchableOpacity style={styles.editBtn} onPress={() => entrarEdicion(active)}>
                    <Ionicons name="create-outline" size={15} color={colors.primaryLight} />
                    <Text style={styles.editBtnText}>{labels.editar}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {active.fields.map(f => (
                <View key={f.key} style={styles.formGroup}>
                  <Text style={styles.fieldLabel}>{f.label}</Text>
                  {editing ? (
                    <TextInput
                      style={[styles.input, f.multiline && { height: 88, textAlignVertical: 'top' }]}
                      value={form[f.key] ?? ''}
                      onChangeText={v => setForm(prev => ({ ...prev, [f.key]: v }))}
                      placeholder={f.placeholder}
                      placeholderTextColor={colors.textMuted}
                      keyboardType={f.keyboardType as any}
                      autoCapitalize={f.autoCapitalize}
                      multiline={f.multiline}
                      selectionColor={colors.primary}
                    />
                  ) : (
                    <Text style={styles.readValue}>{f.value?.trim() ? f.value : '—'}</Text>
                  )}
                </View>
              ))}

              {editing && (
                <View style={styles.saveActions}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnPrimary]}
                    onPress={() => guardar(active)}
                    disabled={saving}
                  >
                    {saving
                      ? <ActivityIndicator size="small" color={colors.textPrimary} />
                      : <><Ionicons name="checkmark" size={16} color={colors.textPrimary} /><Text style={styles.btnPrimaryText}>{labels.guardar}</Text></>}
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={() => setEditing(false)} disabled={saving}>
                    <Text style={styles.btnSecondaryText}>{labels.cancelar}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  // ═══════════════ VISTA MAESTRA ═══════════════
  return (
    <View style={styles.container}>
      <ScrollView
        style={webScrollStyle}
        showsVerticalScrollIndicator
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 120, maxWidth: 640, alignSelf: 'center', width: '100%', flexGrow: 1 }}
      >
        {/* Header oscuro con avatar */}
        <View style={styles.header}>
          <View style={styles.avatarWrap}>
            <StorageAvatar url={avatarUrl ?? undefined} storagePath={avatarStoragePath ?? null} size={96} fallbackIcon={fallbackIcon} />
            {onEditPhoto && (
              <TouchableOpacity style={styles.editAvatar} onPress={onEditPhoto} disabled={uploadingPhoto}>
                {uploadingPhoto
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="camera" size={15} color="#fff" />}
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.headerName} numberOfLines={1}>{name}</Text>
          {!!subtitle && <Text style={styles.headerSub} numberOfLines={1}>{subtitle}</Text>}
        </View>

        <View style={styles.menu}>
          {sections.map(s => (
            <MenuBox key={s.id} id={s.id} icon={s.icon} title={s.title} sub={s.subtitle} tone={s.tone} />
          ))}

          <Text style={styles.groupLabel}>{labels.cuenta}</Text>
          {includePreferencias && (
            <MenuBox id={PREFS_ID} icon="options-outline" title={labels.preferencias} sub={labels.preferenciasSub} tone="orange" />
          )}
          <TouchableOpacity style={styles.menuBox} activeOpacity={0.8} onPress={onAyuda}>
            <View style={[styles.iconWrap, { backgroundColor: colors.primaryLight + '1f', borderColor: colors.primaryLight + '55' }]}>
              <Ionicons name="help-circle-outline" size={18} color={colors.primaryLight} />
            </View>
            <Text style={[styles.menuTitle, { flex: 1 }]}>{labels.ayuda}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuBox} activeOpacity={0.8} onPress={onAcerca}>
            <View style={[styles.iconWrap, { backgroundColor: colors.primaryLight + '1f', borderColor: colors.primaryLight + '55' }]}>
              <Ionicons name="information-circle-outline" size={18} color={colors.primaryLight} />
            </View>
            <Text style={[styles.menuTitle, { flex: 1 }]}>{labels.acerca}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.menuBox, styles.logoutBox]} activeOpacity={0.8} onPress={onLogout}>
            <View style={[styles.iconWrap, { backgroundColor: colors.error + '1f', borderColor: colors.error + '55' }]}>
              <Ionicons name="log-out-outline" size={18} color={colors.error} />
            </View>
            <Text style={[styles.menuTitle, { flex: 1, color: colors.error }]}>{labels.cerrarSesion}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (COLORS: GradlyColors) => StyleSheet.create({
  container: { flex: 1, minHeight: 0 },

  // Header
  header: {
    backgroundColor: COLORS.backgroundSurface,
    paddingTop: 28, paddingBottom: 24, paddingHorizontal: 20,
    alignItems: 'center', gap: 6,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
    borderWidth: 1, borderColor: COLORS.border,
  },
  avatarWrap: { position: 'relative', marginBottom: 8 },
  editAvatar: {
    position: 'absolute', bottom: -2, right: -2,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: COLORS.backgroundSurface,
  },
  headerName: { fontSize: 20, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
  headerSub: { fontSize: 13, fontFamily: FONTS.interMedium, color: COLORS.textMuted },

  // Menú maestro
  menu: { padding: 16, gap: 12 },
  groupLabel: {
    fontSize: 11, fontFamily: FONTS.interSemiBold, color: COLORS.textMuted,
    letterSpacing: 1, textTransform: 'uppercase', marginTop: 10, marginBottom: 2, marginLeft: 4,
  },
  menuBox: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  logoutBox: { borderColor: COLORS.error + '33' },
  iconWrap: {
    width: 42, height: 42, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  menuTitle: { fontSize: 15, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  menuSub: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted, marginTop: 2 },

  // Detalle
  detailHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.backgroundSurface, borderWidth: 1, borderColor: COLORS.border,
  },
  detailTitle: { flex: 1, fontSize: 18, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
  detailDesc: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textMuted, lineHeight: 18, flex: 1 },

  sectionActions: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    marginBottom: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.primary12, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: COLORS.primary35,
  },
  editBtnText: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },

  formGroup: { marginBottom: 18 },
  fieldLabel: {
    fontSize: 11, fontFamily: FONTS.interSemiBold, color: COLORS.textMuted,
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8,
  },
  readValue: { fontSize: 16, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  input: {
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: FONTS.interRegular, color: COLORS.textPrimary,
  },

  saveActions: { gap: 10, marginTop: 16 },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 48, borderRadius: 12,
  },
  btnPrimary: { backgroundColor: COLORS.primaryDark },
  btnPrimaryText: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  btnSecondary: { backgroundColor: COLORS.white4, borderWidth: 1, borderColor: COLORS.border },
  btnSecondaryText: { fontSize: 14, fontFamily: FONTS.interMedium, color: COLORS.textMuted },

  // Preferencias
  prefLabel: {
    fontSize: 11, fontFamily: FONTS.interSemiBold, color: COLORS.textMuted,
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10,
  },
  segment: {
    flexDirection: 'row', gap: 8,
    backgroundColor: COLORS.backgroundSurface, borderRadius: 12, padding: 5,
    borderWidth: 1, borderColor: COLORS.border,
  },
  segmentBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 11, borderRadius: 9,
  },
  segmentBtnActive: { backgroundColor: COLORS.primary },
  segmentText: { fontSize: 14, fontFamily: FONTS.interMedium, color: COLORS.textMuted },
  segmentTextActive: { color: COLORS.textPrimary, fontFamily: FONTS.interSemiBold },
});
