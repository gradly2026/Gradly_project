import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { signOut } from 'firebase/auth';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import { auth, db, storage } from '../../src/config/firebaseConfig';
import { COLORS, FONTS, useTheme, type GradlyColors } from '../../src/context/ThemeContext';
import { shadow } from '../../src/utils/shadow';
import { LiquidBackground } from '../../components/ui/liquid-glass/LiquidBackground';
import { GlassCard } from '../../components/ui/liquid-glass/GlassCard';
import { JellyButton } from '../../components/ui/liquid-glass/JellyButton';
import CertificadoGradly from '../../src/components/CertificadoGradly';

// Hook que recrea los estilos según el tema activo (claro/oscuro)
function useThemedStyles() {
  const { colors } = useTheme();
  return useMemo(() => ({ colors, styles: makeStyles(colors) }), [colors]);
}

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
interface EstudiantePerfil {
  nombre_completo:    string;
  universidad_id:     string;
  carrera:            string;
  semestre:           number;
  horas_objetivo:     number;
  horas_aprobadas:    number;
  horas_en_proceso:   number;
  skills:             string[];
  disponibilidad:     string;
  cv_url:             string;
  foto_url:           string;
  linkedin:           string;
  portfolio:          string;
  calificacion_promedio: number;
  tarjeta_numero:     string;
  tarjeta_alias:      string;
}

function getLevel(pct: number) {
  if (pct >= 100) return 'Graduado ';
  if (pct >= 76)  return 'Experto ⭐';
  if (pct >= 51)  return 'Profesional';
  if (pct >= 26)  return 'Practicante';
  return 'Explorador';
}

function formatCardNumber(raw: string) {
  return raw.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
}

// ─────────────────────────────────────────────
// PANTALLA PRINCIPAL
// ─────────────────────────────────────────────
export default function PerfilTab() {
  const router = useRouter();
  const { user } = useAuth();
  const { styles, colors } = useThemedStyles();
  const { isDark } = useTheme();

  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [perfil,        setPerfil]        = useState<EstudiantePerfil | null>(null);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [uploadingCV,   setUploadingCV]   = useState(false);

  // Modales
  const [skillInput,      setSkillInput]      = useState('');
  const [showAddSkill,    setShowAddSkill]     = useState(false);
  const [showCardModal,   setShowCardModal]    = useState(false);
  const [showEditModal,   setShowEditModal]    = useState(false);
  const [deletingSkill,   setDeletingSkill]    = useState<string | null>(null);

  // Formulario de tarjeta
  const [cardNumero,     setCardNumero]     = useState('');
  const [cardNombre,     setCardNombre]     = useState('');
  const [cardVence,      setCardVence]      = useState('');
  const [cardAlias,      setCardAlias]      = useState('');

  // Formulario de edición de perfil
  const [editDisp,      setEditDisp]      = useState('');
  const [editLinkedin,  setEditLinkedin]  = useState('');
  const [editPortfolio, setEditPortfolio] = useState('');

  // ── Firestore: perfil ────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'perfiles_estudiantes', user.uid), snap => {
      if (snap.exists()) setPerfil(snap.data() as EstudiantePerfil);
    });
    return unsub;
  }, [user]);

  // ── Estadísticas ─────────────────────────────────────────────────
  const horasAprobadas = perfil?.horas_aprobadas ?? 0;
  const horasObjetivo  = perfil?.horas_objetivo  ?? 500;
  const pct = Math.round((horasAprobadas / horasObjetivo) * 100);
  const nivel = getLevel(Math.min(pct, 100));

  // ── Subir / cambiar foto de perfil ────────────────────────────────
  const handleUploadFoto = async () => {
    // a. Permisos de galería
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso necesario', 'Necesitamos acceso a tu galería para cambiar la foto.');
      return;
    }

    // b. Abrir galería (solo imágenes, edición, aspecto 1:1)
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;

    setUploadingFoto(true);
    try {
      // c. URI → Blob
      const response = await fetch(result.assets[0].uri);
      const blob = await response.blob();

      // d. Subir a Storage en fotos_estudiantes/{uid}/perfil.jpg
      const storageRef = ref(storage, `fotos_estudiantes/${user!.uid}/perfil.jpg`);
      await uploadBytes(storageRef, blob);

      // e. URL de descarga + cache-busting.
      //    getDownloadURL ya devuelve "...?alt=media&token=...", por lo que el
      //    cache-buster debe ir con "&" (no con "?", o la URL quedaría inválida
      //    con dos signos de interrogación y la imagen nunca cargaría).
      const baseUrl = await getDownloadURL(storageRef);
      const urlActualizada = `${baseUrl}&t=${new Date().getTime()}`;

      // f. Actualizar Firestore en ambas colecciones simultáneamente
      await Promise.all([
        updateDoc(doc(db, 'perfiles_estudiantes', user!.uid), { foto_url: urlActualizada }),
        updateDoc(doc(db, 'usuarios', user!.uid), { foto_url: urlActualizada }),
      ]);

      // g. Inyectar la nueva URL directamente en el estado del perfil para que
      //    la imagen se refleje de inmediato dentro del contenedor circular.
      setPerfil(prev => (prev ? { ...prev, foto_url: urlActualizada } : prev));
    } catch (e) {
      // h. Manejo de errores
      console.warn('Error al subir la foto de perfil:', e);
      Alert.alert('Error', 'No se pudo subir la foto. Intenta de nuevo.');
    } finally {
      setUploadingFoto(false);
    }
  };

  // ── Subir CV ──────────────────────────────────────────────────────
  const handleUploadCV = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
    if (result.canceled) return;

    const file = result.assets[0];
    setUploadingCV(true);
    try {
      const resp = await fetch(file.uri);
      const blob = await resp.blob();
      const storageRef = ref(storage, `cvs/${user!.uid}/${file.name}`);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, 'perfiles_estudiantes', user!.uid), { cv_url: url });
      Alert.alert('CV subido', 'Tu CV se actualizó correctamente.');
    } catch {
      Alert.alert('Error', 'No se pudo subir el CV.');
    } finally {
      setUploadingCV(false);
    }
  };

  // ── Agregar skill ─────────────────────────────────────────────────
  const handleAddSkill = async () => {
    const sk = skillInput.trim();
    if (!sk) return;
    const current = perfil?.skills ?? [];
    if (current.includes(sk)) { setSkillInput(''); return; }
    try {
      await updateDoc(doc(db, 'perfiles_estudiantes', user!.uid), {
        skills: [...current, sk],
      });
    } catch { Alert.alert('Error', 'No se pudo agregar la skill.'); }
    setSkillInput('');
    setShowAddSkill(false);
  };

  // ── Eliminar skill ────────────────────────────────────────────────
  const handleDeleteSkill = async (sk: string) => {
    const current = (perfil?.skills ?? []).filter(s => s !== sk);
    try {
      await updateDoc(doc(db, 'perfiles_estudiantes', user!.uid), { skills: current });
    } catch { Alert.alert('Error', 'No se pudo eliminar la skill.'); }
    setDeletingSkill(null);
  };

  // ── Guardar tarjeta ───────────────────────────────────────────────
  const handleGuardarTarjeta = async () => {
    const digits = cardNumero.replace(/\s/g, '');
    if (digits.length !== 16) { Alert.alert('Número inválido', 'Ingresa los 16 dígitos.'); return; }
    if (!cardAlias.trim()) { Alert.alert('Alias requerido', 'Ingresa un alias para la tarjeta.'); return; }
    try {
      // SOLO guardamos los últimos 4 dígitos. NUNCA el número completo.
      await updateDoc(doc(db, 'perfiles_estudiantes', user!.uid), {
        tarjeta_numero: digits.slice(-4),
        tarjeta_alias:  cardAlias.trim(),
      });
      Alert.alert('Tarjeta guardada', 'Tus datos se guardaron de forma segura.');
      setShowCardModal(false);
      setCardNumero(''); setCardNombre(''); setCardVence(''); setCardAlias('');
    } catch { Alert.alert('Error', 'No se pudo guardar la tarjeta.'); }
  };

  // ── Guardar perfil ────────────────────────────────────────────────
  const handleSaveEdit = async () => {
    try {
      await updateDoc(doc(db, 'perfiles_estudiantes', user!.uid), {
        disponibilidad: editDisp,
        linkedin:       editLinkedin,
        portfolio:      editPortfolio,
      });
      setShowEditModal(false);
    } catch { Alert.alert('Error', 'No se pudo guardar.'); }
  };

  const handleAyuda = () => {
    Alert.alert('Ayuda', 'Escríbenos a soporte@gradly.app y te ayudaremos con cualquier duda.');
  };
  const handleAcerca = () => {
    Alert.alert('Acerca de Gradly', 'Gradly conecta estudiantes, universidades y empresas para gestionar pasantías y horas sociales.\n\nVersión 1.0.0');
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

  if (!perfil && !user) return null;

  const skills  = perfil?.skills ?? [];
  const tieneCV = !!(perfil?.cv_url);

  // ── RENDER ────────────────────────────────────────────────────────
  return (
    <LiquidBackground>
    <View style={[styles.root, { backgroundColor: 'transparent' }]}>
      <StatusBar style="light" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* ── HERO CARD ── */}
        <View style={styles.heroCard}>
          {/* Foto (clickeable para subir/cambiar) */}
          <View style={styles.fotoWrap}>
            <TouchableOpacity activeOpacity={0.85} onPress={handleUploadFoto} disabled={uploadingFoto}>
              {perfil?.foto_url ? (
                <Image source={{ uri: perfil.foto_url }} style={styles.foto} />
              ) : (
                <View style={[styles.foto, styles.fotoFallback]}>
                  <Ionicons name="person" size={52} color={COLORS.primaryLight} />
                </View>
              )}
              {uploadingFoto && (
                <View style={styles.fotoOverlay}>
                  <ActivityIndicator size="large" color={COLORS.textPrimary} />
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.camaraBtn} onPress={handleUploadFoto} disabled={uploadingFoto}>
              {uploadingFoto
                ? <ActivityIndicator size="small" color={COLORS.textPrimary} />
                : <Ionicons name="camera" size={16} color={COLORS.textPrimary} />
              }
            </TouchableOpacity>
          </View>

          {/* Nombre + info */}
          <Text style={styles.nombre}>{perfil?.nombre_completo ?? user?.email}</Text>
          <Text style={styles.universidad}>
            {perfil?.carrera ?? 'Sin carrera'} {perfil?.universidad_id ? '· Sem. ' + perfil.semestre : ''}
          </Text>
          <View style={styles.nivelBadge}>
            <Text style={styles.nivelText}>{nivel}</Text>
          </View>

          {/* Stats */}
          <View style={styles.statsRow}>
            <StatHero label="Horas" value={horasAprobadas} />
            <View style={styles.statSep} />
            <StatHero label="Nivel" value={`${Math.min(pct, 100)}%`} />
            <View style={styles.statSep} />
            <StatHero label="Skills" value={skills.length} />
          </View>
        </View>

        {/* ── CERTIFICACIÓN DIGITAL GRADLY (rango) ── */}
        <View style={styles.section}>
          <CertificadoGradly
            xp={Number((perfil as any)?.puntos_experiencia ?? 0)}
            calificacion={Number(perfil?.calificacion_promedio ?? 0)}
            pasantias={Number((perfil as any)?.pasantias_completadas ?? 0)}
            nombre={perfil?.nombre_completo}
            theme={isDark ? 'dark' : 'light'}
          />
        </View>

        {/* ── ACCIONES ── */}
        <View style={styles.section}>
          <JellyButton
            style={[styles.actionBtn, tieneCV && styles.actionBtnSecondary]}
            contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 0, paddingHorizontal: 18 }}
            onPress={handleUploadCV}
            disabled={uploadingCV}
          >
            {uploadingCV
              ? <ActivityIndicator size="small" color={COLORS.textPrimary} />
              : <Ionicons name="document-outline" size={18} color={tieneCV ? COLORS.success : COLORS.textPrimary} />
            }
            <Text style={[styles.actionBtnText, tieneCV && { color: COLORS.success }]}>
              {tieneCV ? 'CV subido — Reemplazar' : 'Subir CV (PDF)'}
            </Text>
            {tieneCV && <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />}
          </JellyButton>

          <TouchableOpacity
            style={styles.actionBtnOutline}
            onPress={() => {
              setEditDisp(perfil?.disponibilidad ?? '');
              setEditLinkedin(perfil?.linkedin ?? '');
              setEditPortfolio(perfil?.portfolio ?? '');
              setShowEditModal(true);
            }}
          >
            <Ionicons name="create-outline" size={18} color={COLORS.primaryLight} />
            <Text style={styles.actionBtnOutlineText}>Editar perfil</Text>
          </TouchableOpacity>
        </View>

        {/* ── SKILLS ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Habilidades</Text>
          <View style={styles.skillsWrap}>
            {skills.slice(0, 8).map(sk => (
              <TouchableOpacity
                key={sk}
                style={styles.skillChip}
                onLongPress={() => setDeletingSkill(sk)}
                onPress={() => setDeletingSkill(sk)}
              >
                <Text style={styles.skillText}>{sk}</Text>
              </TouchableOpacity>
            ))}
            {!showAddSkill ? (
              <TouchableOpacity style={styles.addSkillBtn} onPress={() => setShowAddSkill(true)}>
                <Ionicons name="add" size={16} color={COLORS.primaryLight} />
              </TouchableOpacity>
            ) : (
              <View style={styles.skillInputWrap}>
                <TextInput
                  style={styles.skillInput}
                  value={skillInput}
                  onChangeText={setSkillInput}
                  placeholder="Nueva skill"
                  placeholderTextColor={COLORS.textMuted}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleAddSkill}
                  selectionColor={COLORS.primary}
                />
                <TouchableOpacity onPress={handleAddSkill} style={{ padding: 4 }}>
                  <Ionicons name="checkmark" size={18} color={COLORS.success} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowAddSkill(false); setSkillInput(''); }} style={{ padding: 4 }}>
                  <Ionicons name="close" size={18} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* ── INFO PERSONAL ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Información personal</Text>
          <GlassCard contentStyle={{ padding: 0 }}>
            <InfoRow icon="time-outline" label="Disponibilidad" value={perfil?.disponibilidad || 'No especificada'} />
            <InfoRow icon="logo-linkedin" label="LinkedIn" value={perfil?.linkedin || 'No especificado'} />
            <InfoRow icon="globe-outline" label="Portfolio" value={perfil?.portfolio || 'No especificado'} last />
          </GlassCard>
        </View>

        {/* ── TARJETA BANCARIA ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tarjeta de cobro simulada</Text>
          <GlassCard style={{ borderColor: COLORS.primary35 }} contentStyle={{ padding: 20, gap: 12 }}>
            <View style={styles.bankCardTop}>
              <Text style={styles.bankCardBrand}>GRADLY PAY</Text>
              <Ionicons name="card-outline" size={24} color={COLORS.primaryLight} />
            </View>
            <Text style={styles.bankCardNumber}>
              •••• •••• •••• {perfil?.tarjeta_numero || '????'}
            </Text>
            <Text style={styles.bankCardAlias}>{perfil?.tarjeta_alias || 'Sin tarjeta registrada'}</Text>
          </GlassCard>
          <TouchableOpacity style={styles.actionBtnOutline} onPress={() => setShowCardModal(true)}>
            <Ionicons name="add-circle-outline" size={18} color={COLORS.primaryLight} />
            <Text style={styles.actionBtnOutlineText}>
              {perfil?.tarjeta_numero ? 'Cambiar tarjeta' : 'Agregar tarjeta'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── CUENTA: AYUDA · ACERCA DE · CERRAR SESIÓN (al final absoluto) ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cuenta</Text>
          <TouchableOpacity style={styles.actionBtnOutline} onPress={handleAyuda}>
            <Ionicons name="help-circle-outline" size={18} color={colors.primaryLight} />
            <Text style={styles.actionBtnOutlineText}>Ayuda</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtnOutline} onPress={handleAcerca}>
            <Ionicons name="information-circle-outline" size={18} color={colors.primaryLight} />
            <Text style={styles.actionBtnOutlineText}>Acerca de Gradly</Text>
          </TouchableOpacity>
          <JellyButton style={styles.logoutBtn} contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 0, paddingHorizontal: 18 }} onPress={() => setLogoutModalVisible(true)}>
            <Ionicons name="log-out-outline" size={18} color={colors.error} />
            <Text style={styles.logoutText}>Cerrar sesión</Text>
          </JellyButton>
        </View>

      </ScrollView>

      {/* ── MODAL: Confirmar eliminar skill ── */}
      <Modal visible={!!deletingSkill} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Eliminar skill</Text>
            <Text style={styles.modalDesc}>¿Quitar "{deletingSkill}" de tus habilidades?</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setDeletingSkill(null)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <JellyButton
                style={styles.modalDelete}
                contentStyle={{ paddingVertical: 0 }}
                onPress={() => deletingSkill && handleDeleteSkill(deletingSkill)}
              >
                <Text style={styles.modalDeleteText}>Eliminar</Text>
              </JellyButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL: Tarjeta bancaria ── */}
      <Modal visible={showCardModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.sheetCard}>
            <Text style={styles.modalTitle}>Datos de la tarjeta</Text>
            <Text style={styles.modalDesc}>
              Solo guardamos los últimos 4 dígitos. Tus datos nunca se almacenan completos.
            </Text>

            <Text style={styles.fieldLabel}>Número de tarjeta (16 dígitos)</Text>
            <TextInput
              style={styles.modalInput}
              value={cardNumero}
              onChangeText={t => setCardNumero(formatCardNumber(t))}
              placeholder="1234 5678 9012 3456"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="number-pad"
              maxLength={19}
              selectionColor={COLORS.primary}
            />

            <Text style={styles.fieldLabel}>Nombre del titular</Text>
            <TextInput
              style={styles.modalInput}
              value={cardNombre}
              onChangeText={setCardNombre}
              placeholder="JUAN PÉREZ"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="characters"
              selectionColor={COLORS.primary}
            />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Vencimiento</Text>
                <TextInput
                  style={styles.modalInput}
                  value={cardVence}
                  onChangeText={setCardVence}
                  placeholder="MM/YY"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="number-pad"
                  maxLength={5}
                  selectionColor={COLORS.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Alias</Text>
                <TextInput
                  style={styles.modalInput}
                  value={cardAlias}
                  onChangeText={setCardAlias}
                  placeholder="Mi tarjeta"
                  placeholderTextColor={COLORS.textMuted}
                  selectionColor={COLORS.primary}
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowCardModal(false)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <JellyButton style={styles.modalSave} contentStyle={{ paddingVertical: 0 }} onPress={handleGuardarTarjeta}>
                <Text style={styles.modalSaveText}>Guardar</Text>
              </JellyButton>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── MODAL: Editar perfil ── */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.sheetCard}>
            <Text style={styles.modalTitle}>Editar perfil</Text>

            <Text style={styles.fieldLabel}>Disponibilidad</Text>
            <TextInput style={styles.modalInput} value={editDisp} onChangeText={setEditDisp}
              placeholder="Tiempo completo / Parcial" placeholderTextColor={COLORS.textMuted} selectionColor={COLORS.primary} />

            <Text style={styles.fieldLabel}>LinkedIn URL</Text>
            <TextInput style={styles.modalInput} value={editLinkedin} onChangeText={setEditLinkedin}
              placeholder="https://linkedin.com/in/tu-perfil" placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none" keyboardType="url" selectionColor={COLORS.primary} />

            <Text style={styles.fieldLabel}>Portfolio URL</Text>
            <TextInput style={styles.modalInput} value={editPortfolio} onChangeText={setEditPortfolio}
              placeholder="https://tu-portfolio.com" placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none" keyboardType="url" selectionColor={COLORS.primary} />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowEditModal(false)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <JellyButton style={styles.modalSave} contentStyle={{ paddingVertical: 0 }} onPress={handleSaveEdit}>
                <Text style={styles.modalSaveText}>Guardar</Text>
              </JellyButton>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
// SUBCOMPONENTES
// ─────────────────────────────────────────────
function StatHero({ label, value }: { label: string; value: number | string }) {
  const { styles } = useThemedStyles();
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={styles.statHeroValue}>{value}</Text>
      <Text style={styles.statHeroLabel}>{label}</Text>
    </View>
  );
}

function InfoRow({ icon, label, value, last }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; value: string; last?: boolean;
}) {
  const { styles, colors } = useThemedStyles();
  return (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      <Ionicons name={icon} size={18} color={colors.primaryLight} style={{ width: 26 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────
const makeStyles = (COLORS: GradlyColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.backgroundDark },

  // ── Hero
  heroCard: {
    backgroundColor: COLORS.backgroundCard,
    paddingTop: 56, paddingBottom: 24,
    alignItems: 'center', gap: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  fotoWrap: { position: 'relative', marginBottom: 4 },
  foto: {
    width: 110, height: 110, borderRadius: 55,
    borderWidth: 3, borderColor: COLORS.primary,
  },
  fotoFallback: {
    backgroundColor: COLORS.backgroundSurface,
    alignItems: 'center', justifyContent: 'center',
  },
  fotoOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 55, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  camaraBtn: {
    position: 'absolute', bottom: 0, right: 0,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.backgroundCard,
  },
  nombre: { fontSize: 22, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
  universidad: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  nivelBadge: {
    backgroundColor: COLORS.primary20,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4,
    borderWidth: 1, borderColor: COLORS.primary35,
  },
  nivelText: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },
  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 8, width: '100%', paddingHorizontal: 24,
  },
  statHeroValue: { fontSize: 22, fontFamily: FONTS.rajdhaniBold, color: COLORS.textPrimary },
  statHeroLabel: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  statSep: { width: 1, height: 32, backgroundColor: COLORS.border },

  // ── Secciones
  section: { marginHorizontal: 16, marginTop: 16, gap: 10 },
  sectionTitle: {
    fontSize: 14, fontFamily: FONTS.interSemiBold,
    color: COLORS.primaryLight, letterSpacing: 0.3,
    textTransform: 'uppercase', marginBottom: 2,
  },

  // ── Botones de acción
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.primaryDark,
    borderRadius: 14, height: 50, paddingHorizontal: 18,
    ...shadow({ color: COLORS.btnShadow, y: 4, blur: 12, opacity: 1, elevation: 6 }),
  },
  actionBtnSecondary: { backgroundColor: COLORS.backgroundSurface, borderWidth: 1, borderColor: COLORS.success + '44' },
  actionBtnText: { flex: 1, fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  actionBtnOutline: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.white4, borderRadius: 14, height: 48, paddingHorizontal: 18,
    borderWidth: 1, borderColor: COLORS.border,
  },
  actionBtnOutlineText: { fontSize: 14, fontFamily: FONTS.interMedium, color: COLORS.textPrimary },

  // ── Skills
  skillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skillChip: {
    backgroundColor: COLORS.primary12, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: COLORS.primary35,
  },
  skillText: { fontSize: 12, fontFamily: FONTS.interMedium, color: COLORS.primaryLight },
  addSkillBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: COLORS.backgroundSurface,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  skillInputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4,
    borderWidth: 1, borderColor: COLORS.primary35,
    flex: 1,
  },
  skillInput: {
    flex: 1, fontSize: 12,
    fontFamily: FONTS.interRegular, color: COLORS.textPrimary,
    paddingVertical: 0,
  },

  // ── Info personal
  infoCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border,
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  infoLabel: { fontSize: 11, fontFamily: FONTS.interMedium, color: COLORS.textMuted },
  infoValue: { fontSize: 14, fontFamily: FONTS.interRegular, color: COLORS.textPrimary },

  // ── Tarjeta bancaria
  bankCard: {
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 16, padding: 20, gap: 12,
    borderWidth: 1, borderColor: COLORS.primary35,
    ...shadow({ color: COLORS.primary, y: 4, blur: 12, opacity: 0.2, elevation: 0 }),
  },
  bankCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bankCardBrand: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight, letterSpacing: 2 },
  bankCardNumber: { fontSize: 22, fontFamily: FONTS.rajdhaniBold, color: COLORS.textPrimary, letterSpacing: 4 },
  bankCardAlias: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted },

  // ── Logout
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderRadius: 14, height: 50, paddingHorizontal: 18,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
  },
  logoutText: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.error },

  // ── Modales
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 20, padding: 24, width: '100%',
    borderWidth: 1, borderColor: COLORS.border, gap: 10,
  },
  sheetCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 20, padding: 24, width: '100%',
    borderWidth: 1, borderColor: COLORS.border, gap: 8,
    position: 'absolute', bottom: 0, left: 0, right: 0,
  },
  modalTitle: { fontSize: 18, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
  modalDesc: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textMuted, lineHeight: 18 },
  fieldLabel: {
    fontSize: 11, fontFamily: FONTS.interMedium,
    color: COLORS.primaryLight, marginTop: 6, letterSpacing: 0.3,
  },
  modalInput: {
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    height: 46, paddingHorizontal: 14,
    fontSize: 14, fontFamily: FONTS.interRegular, color: COLORS.textPrimary,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalCancel: {
    flex: 1, height: 44, borderRadius: 12,
    backgroundColor: COLORS.white4, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  modalCancelText: { fontSize: 14, fontFamily: FONTS.interMedium, color: COLORS.textMuted },
  modalDelete: {
    flex: 1, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.15)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalDeleteText: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.error },
  modalSave: {
    flex: 1, height: 44, borderRadius: 12,
    backgroundColor: COLORS.primaryDark,
    alignItems: 'center', justifyContent: 'center',
  },
  modalSaveText: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
});
