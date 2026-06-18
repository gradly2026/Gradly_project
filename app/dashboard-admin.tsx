import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import FloatingNavBar, { type NavItem } from '../src/components/FloatingNavBar';
import FloatingSearchButton from '../src/components/FloatingSearchButton';
import FloatingTopBar from '../src/components/FloatingTopBar';
import StorageAvatar from '../src/components/StorageAvatar';
import { useAuth } from '../src/context/AuthContext';
import { auth, db } from '../src/config/firebaseConfig';
import { COLORS, FONTS, useTheme, type GradlyColors } from '../src/context/ThemeContext';
import { RedGradlyBanner } from '../src/components/NetworkStats';
import { useAuthGuard } from '../src/hooks/useAuthGuard';
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

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
type SeccionAdmin = 'panel' | 'usuarios' | 'vacantes' | 'reportes' | 'transacciones' | 'config';
type UserSubTab  = 'empresas' | 'universidades' | 'estudiantes';
type VacSubTab   = 'vacantes' | 'aplicaciones';

const MENU: { key: SeccionAdmin; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'panel',         label: 'Panel Principal',       icon: 'grid-outline' },
  { key: 'usuarios',      label: 'Gestión de Usuarios',   icon: 'people-outline' },
  { key: 'vacantes',      label: 'Vacantes y Aplicaciones', icon: 'briefcase-outline' },
  { key: 'reportes',      label: 'Reportes e Incidencias', icon: 'flag-outline' },
  { key: 'transacciones', label: 'Transacciones',          icon: 'card-outline' },
  { key: 'config',        label: 'Configuración',          icon: 'settings-outline' },
];

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────
export default function DashboardAdmin() {
  useAuthGuard('admin');
  const { user, userProfile, logout } = useAuth();
  const router = useRouter();
  const { styles, s } = useThemedStyles();

  const [seccion,      setSeccion]      = useState<SeccionAdmin>('panel');
  const [showPerfil,   setShowPerfil]   = useState(false);
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

  // ── Datos globales ────────────────────────────────────────────────
  const [usuarios,      setUsuarios]     = useState<any[]>([]);
  const [empresas,      setEmpresas]     = useState<any[]>([]);
  const [universidades, setUniversidades]= useState<any[]>([]);
  const [estudiantes,   setEstudiantes]  = useState<any[]>([]);
  const [vacantes,      setVacantes]     = useState<any[]>([]);
  const [aplicaciones,  setAplicaciones] = useState<any[]>([]);
  const [transacciones, setTransacciones]= useState<any[]>([]);
  const [reportes,      setReportes]     = useState<any[]>([]);
  const [cargando,      setCargando]     = useState(true);

  // ── Modales ───────────────────────────────────────────────────────
  const [selectedUser,   setSelectedUser]  = useState<any>(null);
  const [showViewModal,  setShowViewModal]  = useState(false);
  const [showEditModal,  setShowEditModal]  = useState(false);
  const [showBanModal,   setShowBanModal]   = useState(false);
  const [selectedReporte,setSelectedReporte]= useState<any>(null);
  const [banMotivo,      setBanMotivo]      = useState('');
  const [resolucion,     setResolucion]     = useState('');
  const [editForm,       setEditForm]       = useState<Record<string,string>>({});
  const [guardando,      setGuardando]      = useState(false);

  // ── Config ────────────────────────────────────────────────────────
  const [bannerMsg,            setBannerMsg]           = useState('');
  const [modoMantenimiento,    setModoMantenimiento]    = useState(false);
  const [registroAbierto,      setRegistroAbierto]      = useState(true);
  const [horasDefaultUni,      setHorasDefaultUni]      = useState('500');

  // ── onSnapshot: reportes (tiempo real) ───────────────────────────
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'reportes'), orderBy('fecha', 'desc'));
    return onSnapshot(q, snap => {
      setReportes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [user]);

  // ── onSnapshot: transacciones ─────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'transacciones'), orderBy('fecha', 'desc'));
    return onSnapshot(q, snap => {
      setTransacciones(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [user]);

  // ── Carga inicial con getDocs ─────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const cargarTodo = async () => {
      try {
        const [uSnap, eSnap, univSnap, estSnap, vacSnap, appSnap] = await Promise.all([
          getDocs(collection(db, 'usuarios')),
          getDocs(collection(db, 'perfiles_empresas')),
          getDocs(collection(db, 'perfiles_universidades')),
          getDocs(collection(db, 'perfiles_estudiantes')),
          getDocs(collection(db, 'vacantes')),
          getDocs(collection(db, 'aplicaciones')),
        ]);
        setUsuarios(uSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setEmpresas(eSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setUniversidades(univSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setEstudiantes(estSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setVacantes(vacSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setAplicaciones(appSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        Alert.alert('Error', 'No se pudo cargar datos.');
      } finally {
        setCargando(false);
      }
    };
    cargarTodo();
  }, [user]);

  const handleRefresh = async () => {
    setCargando(true);
    const [uSnap, eSnap, univSnap, estSnap, vacSnap, appSnap] = await Promise.all([
      getDocs(collection(db, 'usuarios')),
      getDocs(collection(db, 'perfiles_empresas')),
      getDocs(collection(db, 'perfiles_universidades')),
      getDocs(collection(db, 'perfiles_estudiantes')),
      getDocs(collection(db, 'vacantes')),
      getDocs(collection(db, 'aplicaciones')),
    ]);
    setUsuarios(uSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setEmpresas(eSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setUniversidades(univSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setEstudiantes(estSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setVacantes(vacSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setAplicaciones(appSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setCargando(false);
  };

  // ── Métricas globales ─────────────────────────────────────────────
  const metricas = useMemo(() => {
    const empresasTotal   = usuarios.filter(u => u.rol === 'empresa').length;
    const empresasPremium = empresas.filter(e => e.premium).length;
    const hoy = new Date();
    const primeroDeMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    return {
      usuariosActivos:    usuarios.filter(u => u.activo).length,
      empresasTotal,
      empresasPremium,
      universidades:      universidades.length,
      estudiantes:        usuarios.filter(u => u.rol === 'estudiante').length,
      vacantesPublicadas: vacantes.filter(v => v.activa).length,
      appsMes:            aplicaciones.filter(a => a.fecha_aplicacion?.toDate?.() >= primeroDeMes).length,
      txCompletadas:      transacciones.filter(t => t.estado === 'completado').length,
      reportesAbiertos:   reportes.filter(r => r.estado === 'abierto').length,
    };
  }, [usuarios, empresas, universidades, vacantes, aplicaciones, transacciones, reportes]);

  // ── Acciones CRUD ─────────────────────────────────────────────────
  const toggleActivo = async (uid: string, actual: boolean) => {
    try {
      await updateDoc(doc(db, 'usuarios', uid), { activo: !actual });
      setUsuarios(prev => prev.map(u => u.id === uid ? { ...u, activo: !actual } : u));
    } catch { Alert.alert('Error', 'No se pudo actualizar.'); }
  };

  const handleBanear = async () => {
    if (!banMotivo.trim()) { Alert.alert('Motivo requerido'); return; }
    if (!selectedUser) return;
    setGuardando(true);
    try {
      await updateDoc(doc(db, 'usuarios', selectedUser.id), {
        activo:       false,
        baneado:      true,
        motivo_baneo: banMotivo.trim(),
        baneo_hasta:  null,
      });
      const colMap: Record<string, string> = {
        empresa:     'perfiles_empresas',
        universidad: 'perfiles_universidades',
        estudiante:  'perfiles_estudiantes',
      };
      if (colMap[selectedUser.rol]) {
        await updateDoc(doc(db, colMap[selectedUser.rol], selectedUser.id), { activo: false });
      }
      setUsuarios(prev => prev.map(u =>
        u.id === selectedUser.id ? { ...u, activo: false, baneado: true } : u,
      ));
      Alert.alert('Usuario baneado');
      setShowBanModal(false);
      setBanMotivo('');
    } catch { Alert.alert('Error', 'No se pudo banear.'); }
    finally { setGuardando(false); }
  };

  const handleEliminar = (uid: string, rol: string, nombre: string) => {
    Alert.alert(`Eliminar a "${nombre}"`, 'Esta acción eliminará el usuario de Firestore.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Continuar',
        style: 'destructive',
        onPress: () => Alert.alert('Confirmación final', '¿Estás SEGURO? No hay vuelta atrás.', [
          { text: 'No', style: 'cancel' },
          {
            text: 'Eliminar para siempre',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteDoc(doc(db, 'usuarios', uid));
                const colMap: Record<string,string> = {
                  empresa: 'perfiles_empresas',
                  universidad: 'perfiles_universidades',
                  estudiante: 'perfiles_estudiantes',
                };
                if (colMap[rol]) await deleteDoc(doc(db, colMap[rol], uid));
                setUsuarios(prev => prev.filter(u => u.id !== uid));
                Alert.alert('Eliminado', 'Usuario eliminado de Firestore.\nLa cuenta de Auth requiere Cloud Functions.');
              } catch { Alert.alert('Error', 'No se pudo eliminar.'); }
            },
          },
        ]),
      },
    ]);
  };

  const handleGuardarEdit = async () => {
    if (!selectedUser) return;
    setGuardando(true);
    try {
      await updateDoc(doc(db, 'usuarios', selectedUser.id), {
        nombre_completo: editForm.nombre_completo ?? selectedUser.nombre_completo,
        correo:          editForm.correo          ?? selectedUser.correo,
      });
      setUsuarios(prev => prev.map(u => u.id === selectedUser.id ? { ...u, ...editForm } : u));
      setShowEditModal(false);
    } catch { Alert.alert('Error', 'No se pudo guardar.'); }
    finally { setGuardando(false); }
  };

  const handleReporteAccion = async (reporte: any, nuevoEstado: string, resolucionText?: string) => {
    try {
      const updates: any = { estado: nuevoEstado };
      if (resolucionText) updates.resolucion = resolucionText;
      await updateDoc(doc(db, 'reportes', reporte.id), updates);
      setSelectedReporte(null);
      setResolucion('');
    } catch { Alert.alert('Error', 'No se pudo actualizar el reporte.'); }
  };

  const handleCambiarEstadoTx = async (txId: string, nuevoEstado: string) => {
    try {
      await updateDoc(doc(db, 'transacciones', txId), { estado: nuevoEstado });
    } catch { Alert.alert('Error', 'No se pudo actualizar.'); }
  };

  // ── RENDER ────────────────────────────────────────────────────────
  const renderSeccion = () => {
    if (cargando) return <View style={s.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
    switch (seccion) {
      case 'panel':         return <SeccionPanel metricas={metricas} reportesAbiertos={reportes.filter(r=>r.estado==='abierto')} onRefresh={handleRefresh} />;
      case 'usuarios':      return <SeccionUsuarios usuarios={usuarios} empresas={empresas} universidades={universidades} estudiantes={estudiantes} onView={(u:any)=>{setSelectedUser(u);setShowViewModal(true);}} onEdit={(u:any)=>{setSelectedUser(u);setEditForm({nombre_completo:u.nombre_completo,correo:u.correo});setShowEditModal(true);}} onToggle={(u:any)=>toggleActivo(u.id,u.activo)} onBan={(u:any)=>{setSelectedUser(u);setBanMotivo('');setShowBanModal(true);}} onDelete={(u:any)=>handleEliminar(u.id,u.rol,u.nombre_completo)} />;
      case 'vacantes':      return <SeccionVacantes vacantes={vacantes} aplicaciones={aplicaciones} onToggleVacante={async(v:any)=>{ await updateDoc(doc(db,'vacantes',v.id),{activa:!v.activa}); setVacantes(prev=>prev.map(x=>x.id===v.id?{...x,activa:!v.activa}:x)); }} onDeleteVacante={async(v:any)=>{ Alert.alert('Eliminar vacante','¿Confirmar?',[{text:'Cancelar',style:'cancel'},{text:'Eliminar',style:'destructive',onPress:async()=>{ await deleteDoc(doc(db,'vacantes',v.id)); setVacantes(prev=>prev.filter(x=>x.id!==v.id)); }}]); }} onCambiarEstadoApp={async(appId:string,estado:string)=>{ await updateDoc(doc(db,'aplicaciones',appId),{estado}); setAplicaciones(prev=>prev.map(x=>x.id===appId?{...x,estado}:x)); }} />;
      case 'reportes':      return <SeccionReportes reportes={reportes} onSelect={setSelectedReporte} />;
      case 'transacciones': return <SeccionTransacciones transacciones={transacciones} onCambiarEstado={handleCambiarEstadoTx} />;
      case 'config':        return <SeccionConfig bannerMsg={bannerMsg} onBannerMsg={setBannerMsg} modoMantenimiento={modoMantenimiento} onMantenimiento={setModoMantenimiento} registroAbierto={registroAbierto} onRegistro={setRegistroAbierto} horasDefault={horasDefaultUni} onHorasDefault={setHorasDefaultUni} onLogout={() => setLogoutModalVisible(true)} />;
      default: return null;
    }
  };

  const navItems: NavItem<SeccionAdmin>[] = [
    { key: 'panel',         label: 'Panel',     icon: 'grid-outline' },
    { key: 'usuarios',      label: 'Usuarios',  icon: 'people-outline' },
    { key: 'vacantes',      label: 'Vacantes',  icon: 'briefcase-outline' },
    { key: 'reportes',      label: 'Reportes',  icon: 'flag-outline', badge: metricas.reportesAbiertos },
    { key: 'transacciones', label: 'Pagos',     icon: 'card-outline' },
    { key: 'config',        label: 'Config',    icon: 'settings-outline' },
  ];

  return (
    <LiquidBackground>
    <View style={[styles.root, { backgroundColor: 'transparent' }]}>
      <StatusBar style="light" />

      {/* ── CONTENIDO ── */}
      <View style={styles.main}>
        <View style={styles.mainHeader}>
          <TouchableOpacity onPress={() => setShowPerfil(true)} activeOpacity={0.8}>
            <StorageAvatar size={40} fallbackIcon="shield-checkmark" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.mainTitle} numberOfLines={1}>{MENU.find(m=>m.key===seccion)?.label}</Text>
            <Text style={styles.adminEmail} numberOfLines={1}>Administrador</Text>
          </View>
          <TouchableOpacity onPress={handleRefresh} style={styles.refreshBtn}>
            <Ionicons name="refresh-outline" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
        {renderSeccion()}
      </View>

      {/* ── BOTONES FLOTANTES SUPERIORES (Glassmorphism) ── */}
      <FloatingTopBar userId={user?.uid} />

      {/* ── BÚSQUEDA FLOTANTE ── */}
      <FloatingSearchButton placeholder="Buscar usuarios, vacantes..." />

      {/* ── MENÚ FLOTANTE (Glassmorphism) ── */}
      <FloatingNavBar items={navItems} activeKey={seccion} onChange={setSeccion} />

      {/* ── MODAL: Mi Perfil (cuenta) ── */}
      <Modal visible={showPerfil} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Mi perfil</Text>
            <Text style={styles.adminEmail}>{user?.email ?? ''}</Text>

            <View style={styles.perfilFooter}>
              <TouchableOpacity style={styles.footerBtn} onPress={handleAyuda}>
                <Ionicons name="help-circle-outline" size={18} color={COLORS.primaryLight} />
                <Text style={styles.footerBtnText}>Ayuda</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.footerBtn} onPress={handleAcerca}>
                <Ionicons name="information-circle-outline" size={18} color={COLORS.primaryLight} />
                <Text style={styles.footerBtnText}>Acerca de Gradly</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.logoutFooterBtn}
                onPress={async () => { setShowPerfil(false); await logout(); router.replace('/auth/iniciosesion' as any); }}
              >
                <Ionicons name="log-out-outline" size={18} color={COLORS.error} />
                <Text style={styles.logoutFooterText}>Cerrar sesión</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[styles.modalCancel, { marginTop: 12 }]} onPress={() => setShowPerfil(false)}>
              <Text style={styles.modalCancelText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── MODAL: Ver perfil ── */}
      <Modal visible={showViewModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Perfil del usuario</Text>
            {selectedUser && Object.entries(selectedUser)
              .filter(([k]) => !['id'].includes(k))
              .map(([k, v]) => (
                <View key={k} style={s.profileRow}>
                  <Text style={s.profileKey}>{k}</Text>
                  <Text style={s.profileVal} numberOfLines={2}>{String(v)}</Text>
                </View>
              ))
            }
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowViewModal(false)}>
              <Text style={styles.modalCloseText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── MODAL: Editar usuario ── */}
      <Modal visible={showEditModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Editar usuario</Text>
            {[
              { label: 'Nombre completo', key: 'nombre_completo' },
              { label: 'Correo',          key: 'correo' },
            ].map(f => (
              <View key={f.key}>
                <Text style={styles.fieldLabel}>{f.label}</Text>
                <TextInput
                  style={styles.modalInput}
                  value={editForm[f.key] ?? ''}
                  onChangeText={v => setEditForm(prev => ({ ...prev, [f.key]: v }))}
                  placeholderTextColor={COLORS.textMuted}
                  selectionColor={COLORS.primary}
                />
              </View>
            ))}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowEditModal(false)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <JellyButton style={[styles.modalSave, guardando && {opacity:0.6}]} contentStyle={{ paddingVertical: 0 }} onPress={handleGuardarEdit} disabled={guardando}>
                <Text style={styles.modalSaveText}>{guardando ? 'Guardando...' : 'Guardar'}</Text>
              </JellyButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL: Banear ── */}
      <Modal visible={showBanModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Banear usuario</Text>
            <Text style={styles.modalDesc}>
              Usuario: {selectedUser?.nombre_completo ?? selectedUser?.correo}
            </Text>
            <Text style={styles.fieldLabel}>Motivo del baneo (obligatorio)</Text>
            <TextInput
              style={[styles.modalInput, { height: 80, textAlignVertical: 'top' }]}
              value={banMotivo}
              onChangeText={setBanMotivo}
              placeholder="Describe el motivo..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              selectionColor={COLORS.primary}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowBanModal(false)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalDelete, guardando && {opacity:0.6}]} onPress={handleBanear} disabled={guardando}>
                <Text style={styles.modalDeleteText}>{guardando ? 'Baneando...' : 'Banear'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL: Reporte ── */}
      <Modal visible={!!selectedReporte} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reporte #{selectedReporte?.id?.slice(0, 8)}</Text>
            <Text style={styles.modalDesc}>
              Tipo: {selectedReporte?.tipo}{'\n'}
              Motivo: {selectedReporte?.motivo}{'\n'}
              Descripción: {selectedReporte?.descripcion}{'\n'}
              Estado: {selectedReporte?.estado}
            </Text>

            {selectedReporte?.estado !== 'resuelto' && (
              <>
                <Text style={styles.fieldLabel}>Resolución (para marcar como resuelto)</Text>
                <TextInput
                  style={[styles.modalInput, { height: 64, textAlignVertical: 'top' }]}
                  value={resolucion}
                  onChangeText={setResolucion}
                  placeholder="Describe la resolución..."
                  placeholderTextColor={COLORS.textMuted}
                  multiline
                  selectionColor={COLORS.primary}
                />
              </>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, marginTop: 8 }}>
              {selectedReporte?.estado === 'abierto' && (
                <JellyButton style={s.actionChip} contentStyle={{ paddingVertical: 6, paddingHorizontal: 12 }}
                  onPress={() => handleReporteAccion(selectedReporte, 'en_investigacion')}>
                  <Text style={s.actionChipText}>Iniciar investigación</Text>
                </JellyButton>
              )}
              {selectedReporte?.estado !== 'resuelto' && (
                <JellyButton style={[s.actionChip, { backgroundColor: COLORS.success + '22' }]} contentStyle={{ paddingVertical: 6, paddingHorizontal: 12 }}
                  onPress={() => handleReporteAccion(selectedReporte, 'resuelto', resolucion)}>
                  <Text style={[s.actionChipText, { color: COLORS.success }]}>Marcar resuelto</Text>
                </JellyButton>
              )}
              <JellyButton style={[s.actionChip, { backgroundColor: COLORS.error + '15' }]} contentStyle={{ paddingVertical: 6, paddingHorizontal: 12 }}
                onPress={() => {
                  setSelectedReporte(null);
                  const u = usuarios.find(x => x.id === selectedReporte?.reportado_id);
                  if (u) { setSelectedUser(u); setBanMotivo(''); setShowBanModal(true); }
                }}>
                <Text style={[s.actionChipText, { color: COLORS.error }]}>Banear reportado</Text>
              </JellyButton>
            </ScrollView>

            <TouchableOpacity style={styles.modalClose} onPress={() => { setSelectedReporte(null); setResolucion(''); }}>
              <Text style={styles.modalCloseText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
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
// SECCIÓN: PANEL PRINCIPAL
// ─────────────────────────────────────────────
function SeccionPanel({ metricas, reportesAbiertos, onRefresh }: {
  metricas: any; reportesAbiertos: any[]; onRefresh: () => void;
}) {
  const { s } = useThemedStyles();
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      {/* ── Estadísticas de la Red Gradly ── */}
      <RedGradlyBanner />

      {/* Banner */}
      <GlassCard style={{ marginBottom: 16 }} contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20 }}>
        <Ionicons name="shield-checkmark" size={28} color={COLORS.primary} />
        <View style={{ flex: 1 }}>
          <Text style={s.bannerTitle}>Panel de Control Administrativo</Text>
          <Text style={s.bannerSub}>Gradly — Acceso total a la plataforma</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={s.refreshBtn}>
          <Ionicons name="refresh-outline" size={18} color={COLORS.textMuted} />
          <Text style={s.refreshText}>Actualizar</Text>
        </TouchableOpacity>
      </GlassCard>

      {/* 8 métricas en grid 2x4 */}
      <View style={s.grid}>
        <MetricCard icon="people-outline"       label="Usuarios activos"       value={metricas.usuariosActivos}    color={COLORS.primaryLight} />
        <MetricCard icon="business-outline"     label="Empresas (total)"       value={metricas.empresasTotal}      color={COLORS.accent} />
        <MetricCard icon="star-outline"         label="Empresas premium"       value={metricas.empresasPremium}    color={COLORS.gold} />
        <MetricCard icon="school-outline"       label="Universidades"          value={metricas.universidades}      color={COLORS.success} />
        <MetricCard icon="person-outline"       label="Estudiantes"            value={metricas.estudiantes}        color={COLORS.primaryLight} />
        <MetricCard icon="briefcase-outline"    label="Vacantes publicadas"    value={metricas.vacantesPublicadas} color={COLORS.warning} />
        <MetricCard icon="checkmark-circle-outline" label="Transacciones OK"  value={metricas.txCompletadas}      color={COLORS.success} />
        <MetricCard icon="flag-outline"         label="Reportes abiertos"      value={metricas.reportesAbiertos}   color={metricas.reportesAbiertos > 0 ? COLORS.error : COLORS.textMuted} alert={metricas.reportesAbiertos > 0} />
      </View>

      {/* Alertas en tiempo real */}
      {reportesAbiertos.length > 0 && (
        <>
          <Text style={s.sectionTitle}>Alertas — Reportes abiertos</Text>
          {reportesAbiertos.slice(0, 5).map(r => (
            <View key={r.id} style={s.alertRow}>
              <View style={s.alertDotRed} />
              <View style={{ flex: 1 }}>
                <Text style={s.alertText}>Reporte {r.tipo}: {r.motivo}</Text>
                <Text style={s.alertSub}>{r.descripcion?.slice(0, 60)}...</Text>
              </View>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function MetricCard({ icon, label, value, color, alert }: any) {
  const { s } = useThemedStyles();
  return (
    <GlassCard style={[{ width: '48%' }, alert && s.metricCardAlert]} contentStyle={{ padding: 14, gap: 4 }}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[s.metricValue, { color }]}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </GlassCard>
  );
}

// ─────────────────────────────────────────────
// SECCIÓN: GESTIÓN DE USUARIOS
// ─────────────────────────────────────────────
function SeccionUsuarios({ usuarios, empresas, universidades, estudiantes, onView, onEdit, onToggle, onBan, onDelete }: any) {
  const { styles, s } = useThemedStyles();
  const [subTab,    setSubTab]    = useState<UserSubTab>('empresas');
  const [busqueda,  setBusqueda]  = useState('');
  const [displayN,  setDisplayN]  = useState(20);

  const listaBase = useMemo(() => {
    const rolMap: Record<UserSubTab, string> = { empresas: 'empresa', universidades: 'universidad', estudiantes: 'estudiante' };
    return usuarios.filter((u: any) => u.rol === rolMap[subTab]);
  }, [usuarios, subTab]);

  const filtered = useMemo(() => {
    if (!busqueda.trim()) return listaBase;
    const q = busqueda.toLowerCase();
    return listaBase.filter((u: any) =>
      (u.nombre_completo ?? '').toLowerCase().includes(q) ||
      (u.correo ?? '').toLowerCase().includes(q),
    );
  }, [listaBase, busqueda]);

  const displayed = filtered.slice(0, displayN);

  // Datos enriquecidos
  const profileMap = useMemo(() => {
    const m: Record<string, any> = {};
    [...empresas, ...universidades, ...estudiantes].forEach(p => { m[p.id] = p; });
    return m;
  }, [empresas, universidades, estudiantes]);

  return (
    <View style={{ flex: 1 }}>
      {/* Sub-tabs */}
      <View style={s.subTabs}>
        {(['empresas','universidades','estudiantes'] as UserSubTab[]).map(t => (
          <TouchableOpacity key={t} style={[s.subTab, subTab===t && s.subTabActive]} onPress={()=>setSubTab(t)}>
            <Text style={[s.subTabText, subTab===t && s.subTabTextActive]}>
              {t.charAt(0).toUpperCase()+t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Búsqueda */}
      <View style={s.searchWrap}>
        <Ionicons name="search-outline" size={16} color={COLORS.textMuted} />
        <TextInput style={s.searchInput} value={busqueda} onChangeText={setBusqueda}
          placeholder="Buscar por nombre o correo..." placeholderTextColor={COLORS.textMuted}
          selectionColor={COLORS.primary} />
      </View>

      <FlatList
        data={displayed}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 60 }}
        renderItem={({ item }) => {
          const perfil = profileMap[item.id] ?? {};
          const baneado = item.baneado === true;
          return (
            <GlassCard style={{ marginBottom: 8 }} contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}>
              <View style={s.userAvatar}>
                <Text style={s.userInitial}>
                  {(item.nombre_completo?.[0] ?? item.correo?.[0] ?? '?').toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={s.userNameRow}>
                  <Text style={s.userName} numberOfLines={1}>
                    {item.nombre_completo ?? item.correo}
                  </Text>
                  {perfil.premium && <View style={s.premiumTag}><Text style={s.premiumTagText}>PREMIUM</Text></View>}
                  {baneado && <View style={s.baneadoTag}><Text style={s.baneadoTagText}>BANEADO</Text></View>}
                </View>
                <Text style={s.userEmail} numberOfLines={1}>{item.correo}</Text>
              </View>
              {/* Acciones */}
              <View style={s.userActions}>
                <ActionBtn icon="eye-outline"    onPress={() => onView(item)} />
                <ActionBtn icon="create-outline" onPress={() => onEdit(item)} />
                <ActionBtn icon="power-outline"  onPress={() => onToggle(item)} color={item.activo ? COLORS.success : COLORS.textMuted} />
                <ActionBtn icon="ban-outline"    onPress={() => onBan(item)}  color={COLORS.warning} />
                <ActionBtn icon="trash-outline"  onPress={() => onDelete(item)} color={COLORS.error} />
              </View>
            </GlassCard>
          );
        }}
        ListFooterComponent={displayed.length < filtered.length ? (
          <JellyButton style={s.cargarMasBtn} contentStyle={{ paddingVertical: 0 }} onPress={() => setDisplayN(n => n + 20)}>
            <Text style={s.cargarMasText}>Cargar más ({filtered.length - displayed.length} restantes)</Text>
          </JellyButton>
        ) : null}
        ListEmptyComponent={<Text style={s.emptyText}>Sin usuarios en esta categoría.</Text>}
      />
    </View>
  );
}

function ActionBtn({ icon, onPress, color }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; color?: string }) {
  const { s } = useThemedStyles();
  return (
    <TouchableOpacity style={s.actionBtn} onPress={onPress}>
      <Ionicons name={icon} size={16} color={color ?? COLORS.textMuted} />
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────
// SECCIÓN: VACANTES Y APLICACIONES
// ─────────────────────────────────────────────
function SeccionVacantes({ vacantes, aplicaciones, onToggleVacante, onDeleteVacante, onCambiarEstadoApp }: any) {
  const { styles, s } = useThemedStyles();
  const [subTab, setSubTab] = useState<VacSubTab>('vacantes');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [displayN, setDisplayN] = useState(20);

  const ESTADOS_APP = ['todos','pendiente','en_revision','entrevista','contratado','finalizado','aprobado','rechazado'];

  const filteredApps = aplicaciones.filter((a: any) =>
    filtroEstado === 'todos' || a.estado === filtroEstado,
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={s.subTabs}>
        {(['vacantes','aplicaciones'] as VacSubTab[]).map(t => (
          <TouchableOpacity key={t} style={[s.subTab, subTab===t && s.subTabActive]} onPress={()=>setSubTab(t)}>
            <Text style={[s.subTabText, subTab===t && s.subTabTextActive]}>
              {t.charAt(0).toUpperCase()+t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {subTab === 'vacantes' ? (
        <FlatList
          data={vacantes.slice(0, displayN)}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 60 }}
          renderItem={({ item }: any) => (
            <View style={s.vacanteRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.vacanteTitle} numberOfLines={1}>{item.titulo}</Text>
                <Text style={s.vacanteMeta}>{item.nombre_empresa} · {item.area} · {item.modalidad}</Text>
              </View>
              <TouchableOpacity style={[s.miniToggle, item.activa && s.miniToggleOn]} onPress={() => onToggleVacante(item)}>
                <Text style={{ fontSize: 10, fontFamily: FONTS.interSemiBold, color: item.activa ? COLORS.success : COLORS.textMuted }}>
                  {item.activa ? 'Activa' : 'Inactiva'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onDeleteVacante(item)} style={{ padding: 6 }}>
                <Ionicons name="trash-outline" size={16} color={COLORS.error} />
              </TouchableOpacity>
            </View>
          )}
          ListFooterComponent={vacantes.length > displayN ? (
            <TouchableOpacity style={s.cargarMasBtn} onPress={()=>setDisplayN(n=>n+20)}>
              <Text style={s.cargarMasText}>Cargar más</Text>
            </TouchableOpacity>
          ) : null}
        />
      ) : (
        <View style={{ flex: 1 }}>
          {/* Filtro de estado */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, padding: 12 }}>
            {ESTADOS_APP.map(e => (
              <TouchableOpacity key={e} style={[s.filtroChip, filtroEstado===e && s.filtroChipActive]} onPress={()=>setFiltroEstado(e)}>
                <Text style={[s.filtroText, filtroEstado===e && s.filtroTextActive]}>{e}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <FlatList
            data={filteredApps.slice(0, displayN)}
            keyExtractor={(item: any) => item.id}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 60 }}
            renderItem={({ item }: any) => (
              <View style={s.appRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.appNombre} numberOfLines={1}>{item.estudiante_nombre}</Text>
                  <Text style={s.appMeta}>{item.empresa_id} · {item.estado}</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
                  {['en_revision','entrevista','contratado','rechazado'].map(e => (
                    <TouchableOpacity key={e} style={s.estadoBtn} onPress={() => onCambiarEstadoApp(item.id, e)}>
                      <Text style={s.estadoBtnText}>{e}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          />
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────
// SECCIÓN: REPORTES
// ─────────────────────────────────────────────
function SeccionReportes({ reportes, onSelect }: { reportes: any[]; onSelect: (r: any) => void }) {
  const { s } = useThemedStyles();
  const ESTADOS_COLOR: Record<string, string> = {
    abierto: COLORS.error, en_investigacion: COLORS.warning, resuelto: COLORS.success,
  };

  return (
    <FlatList
      data={reportes}
      keyExtractor={item => item.id}
      contentContainerStyle={{ padding: 12, paddingBottom: 80 }}
      renderItem={({ item }) => {
        const ahora = new Date();
        const fechaRep = item.fecha?.toDate?.() ?? new Date();
        const dias = Math.floor((ahora.getTime() - fechaRep.getTime()) / 86_400_000);
        const color = ESTADOS_COLOR[item.estado] ?? COLORS.textMuted;
        return (
          <TouchableOpacity style={s.reporteCard} onPress={() => onSelect(item)} activeOpacity={0.8}>
            <View style={[s.reporteDot, { backgroundColor: color }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.reporteTitle}>{item.motivo}</Text>
              <Text style={s.reporteMeta}>Tipo: {item.tipo} · Hace {dias} días</Text>
              <Text style={s.reporteDesc} numberOfLines={2}>{item.descripcion}</Text>
            </View>
            <View style={[s.reporteEstadoBadge, { borderColor: color + '44', backgroundColor: color + '11' }]}>
              <Text style={[s.reporteEstadoText, { color }]}>{item.estado.replace('_', ' ')}</Text>
            </View>
          </TouchableOpacity>
        );
      }}
      ListEmptyComponent={<Text style={s.emptyText}>Sin reportes registrados.</Text>}
    />
  );
}

// ─────────────────────────────────────────────
// SECCIÓN: TRANSACCIONES
// ─────────────────────────────────────────────
function SeccionTransacciones({ transacciones, onCambiarEstado }: { transacciones: any[]; onCambiarEstado: (id:string, estado:string) => void }) {
  const { styles, s } = useThemedStyles();
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [displayN, setDisplayN] = useState(20);

  const totalMes = transacciones
    .filter(t => t.estado === 'completado')
    .reduce((acc, t) => acc + (t.monto ?? 0), 0);

  const filtered = filtroEstado === 'todos' ? transacciones : transacciones.filter(t => t.estado === filtroEstado);

  return (
    <View style={{ flex: 1 }}>
      {/* Resumen */}
      <View style={s.txResumen}>
        <Ionicons name="checkmark-circle-outline" size={22} color={COLORS.success} />
        <View>
          <Text style={s.txResumenLabel}>Total procesado</Text>
          <Text style={s.txResumenValue}>${totalMes.toFixed(2)}</Text>
        </View>
      </View>

      {/* Filtros */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, paddingHorizontal: 12, paddingBottom: 8 }}>
        {['todos','pendiente','completado','fallido'].map(e => (
          <TouchableOpacity key={e} style={[s.filtroChip, filtroEstado===e && s.filtroChipActive]} onPress={()=>setFiltroEstado(e)}>
            <Text style={[s.filtroText, filtroEstado===e && s.filtroTextActive]}>{e}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filtered.slice(0, displayN)}
        keyExtractor={(item:any) => item.id}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 80 }}
        renderItem={({ item }: any) => {
          const color = item.estado === 'completado' ? COLORS.success : item.estado === 'fallido' ? COLORS.error : COLORS.warning;
          return (
            <View style={s.txRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.txConcepto} numberOfLines={1}>{item.concepto}</Text>
                <Text style={s.txMeta}>${(item.monto??0).toFixed(2)} · Ref: {item.referencia || '—'}</Text>
              </View>
              <View style={{ gap: 4, alignItems: 'flex-end' }}>
                <View style={[s.estadoBadge, { borderColor: color + '44', backgroundColor: color + '11' }]}>
                  <Text style={[s.estadoText, { color }]}>{item.estado}</Text>
                </View>
                {item.estado === 'pendiente' && (
                  <TouchableOpacity style={s.forceTxBtn} onPress={() => onCambiarEstado(item.id, 'completado')}>
                    <Text style={s.forceTxText}>Forzar OK</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        }}
        ListFooterComponent={filtered.length > displayN ? (
          <TouchableOpacity style={s.cargarMasBtn} onPress={()=>setDisplayN(n=>n+20)}>
            <Text style={s.cargarMasText}>Cargar más</Text>
          </TouchableOpacity>
        ) : null}
        ListEmptyComponent={<Text style={s.emptyText}>Sin transacciones.</Text>}
      />
    </View>
  );
}

// ─────────────────────────────────────────────
// SECCIÓN: CONFIGURACIÓN
// ─────────────────────────────────────────────
function SeccionConfig({ bannerMsg, onBannerMsg, modoMantenimiento, onMantenimiento, registroAbierto, onRegistro, horasDefault, onHorasDefault, onLogout }: any) {
  const { styles, s } = useThemedStyles();
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <Text style={s.sectionTitle}>Mensaje de banner global</Text>
      <Text style={s.configDesc}>Este mensaje aparecerá en todos los dashboards cuando esté activo.</Text>
      <TextInput
        style={[s.input, { height: 80, textAlignVertical: 'top' }]}
        value={bannerMsg}
        onChangeText={onBannerMsg}
        placeholder="Mensaje global para todos los usuarios..."
        placeholderTextColor={COLORS.textMuted}
        multiline
        selectionColor={COLORS.primary}
      />

      <Text style={s.sectionTitle}>Horas default por universidad</Text>
      <TextInput
        style={s.input}
        value={horasDefault}
        onChangeText={onHorasDefault}
        keyboardType="number-pad"
        placeholder="500"
        placeholderTextColor={COLORS.textMuted}
        selectionColor={COLORS.primary}
      />

      <Text style={s.sectionTitle}>Funcionalidades del sistema</Text>

      <View style={s.toggleRow}>
        <View>
          <Text style={s.toggleLabel}>Modo mantenimiento</Text>
          <Text style={s.toggleDesc}>Bloquea el acceso a todos los usuarios excepto admin</Text>
        </View>
        <Switch
          value={modoMantenimiento}
          onValueChange={onMantenimiento}
          trackColor={{ false: COLORS.border, true: COLORS.primary }}
          thumbColor={modoMantenimiento ? COLORS.textPrimary : COLORS.textMuted}
        />
      </View>

      <View style={s.toggleRow}>
        <View>
          <Text style={s.toggleLabel}>Registro abierto</Text>
          <Text style={s.toggleDesc}>Permite que empresas y universidades se registren</Text>
        </View>
        <Switch
          value={registroAbierto}
          onValueChange={onRegistro}
          trackColor={{ false: COLORS.border, true: COLORS.success }}
          thumbColor={registroAbierto ? COLORS.textPrimary : COLORS.textMuted}
        />
      </View>

      <View style={s.infoNote}>
        <Ionicons name="information-circle-outline" size={16} color={COLORS.textMuted} />
        <Text style={s.infoNoteText}>
          Los cambios de configuración son locales en esta sesión. Para persistirlos, implementa un documento /config/global en Firestore.
        </Text>
      </View>

      {/* ── Cerrar sesión (destructivo) ── */}
      <TouchableOpacity
        onPress={onLogout}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24, marginBottom: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)' }}
      >
        <Ionicons name="log-out-outline" size={18} color="#ef4444" />
        <Text style={{ color: '#ef4444', fontFamily: FONTS.interSemiBold, fontSize: 15 }}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─────────────────────────────────────────────
// ESTILOS GLOBALES
// ─────────────────────────────────────────────
const makeStyles = (COLORS: GradlyColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.backgroundDark },

  // Footer de cuenta (Mi Perfil → ayuda · acerca · cerrar sesión)
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

  sidebar: {
    width: 230, backgroundColor: COLORS.backgroundCard,
    borderRightWidth: 1, borderRightColor: COLORS.border,
    paddingTop: Platform.OS === 'ios' ? 52 : 32,
  },
  sidebarHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingBottom: 16, marginBottom: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  adminAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: COLORS.primary12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.primary35,
  },
  adminName: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  adminEmail: { fontSize: 10, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 10, marginHorizontal: 8,
  },
  menuItemActive: { backgroundColor: COLORS.primary },
  menuLabel: { fontSize: 13, fontFamily: FONTS.interMedium, color: COLORS.textMuted, flex: 1 },
  menuLabelActive: { color: COLORS.textPrimary },
  alertDot: {
    backgroundColor: COLORS.error, borderRadius: 8,
    minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  alertDotText: { fontSize: 9, fontFamily: FONTS.interSemiBold, color: '#fff' },
  logoutItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 16, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  logoutLabel: { fontSize: 13, fontFamily: FONTS.interMedium, color: COLORS.error },

  main: { flex: 1 },
  mainHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingLeft: 20, paddingRight: 150, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.backgroundCard,
  },
  mainTitle: { fontSize: 18, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
  refreshBtn: { padding: 6 },

  // Modales
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', padding: 20,
  },
  modalCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: COLORS.border,
    gap: 10, maxHeight: '90%',
  },
  modalTitle: { fontSize: 18, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
  modalDesc: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textMuted, lineHeight: 20 },
  fieldLabel: {
    fontSize: 11, fontFamily: FONTS.interMedium,
    color: COLORS.primaryLight, letterSpacing: 0.3,
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
  modalClose: {
    marginTop: 8, height: 44, borderRadius: 12,
    backgroundColor: COLORS.white4, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  modalCloseText: { fontSize: 14, fontFamily: FONTS.interMedium, color: COLORS.textMuted },
});

const makeS = (COLORS: GradlyColors) => StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 80 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Panel
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 16, padding: 20, marginBottom: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  bannerTitle: { fontSize: 16, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
  bannerSub: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  refreshBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.primary12, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: COLORS.primary35,
  },
  refreshText: { fontSize: 11, fontFamily: FONTS.interMedium, color: COLORS.primaryLight },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  metricCard: {
    width: '48%', backgroundColor: COLORS.backgroundCard,
    borderRadius: 14, padding: 14, gap: 4,
    borderWidth: 1, borderColor: COLORS.border,
  },
  metricCardAlert: { borderColor: COLORS.error + '44' },
  metricValue: { fontSize: 26, fontFamily: FONTS.rajdhaniBold },
  metricLabel: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted },

  sectionTitle: {
    fontSize: 14, fontFamily: FONTS.interSemiBold,
    color: COLORS.primaryLight, marginBottom: 8, marginTop: 4,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  alertRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(239,68,68,0.05)',
    borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.15)', marginBottom: 6,
  },
  alertDotRed: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.error },
  alertText: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  alertSub: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted },

  // Usuarios
  subTabs: {
    flexDirection: 'row', gap: 0,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.backgroundCard,
  },
  subTab: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  subTabActive: { borderBottomColor: COLORS.primary },
  subTabText: { fontSize: 13, fontFamily: FONTS.interMedium, color: COLORS.textMuted },
  subTabTextActive: { color: COLORS.textPrimary },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    margin: 12, paddingHorizontal: 12, height: 40,
  },
  searchInput: {
    flex: 1, fontSize: 13,
    fontFamily: FONTS.interRegular, color: COLORS.textPrimary,
  },

  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 8,
  },
  userAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: COLORS.primary12,
    alignItems: 'center', justifyContent: 'center',
  },
  userInitial: { fontSize: 15, fontFamily: FONTS.soraBold, color: COLORS.primaryLight },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  userName: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary, flex: 1 },
  userEmail: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  premiumTag: {
    backgroundColor: COLORS.gold + '22', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
    borderWidth: 1, borderColor: COLORS.gold + '44',
  },
  premiumTagText: { fontSize: 8, fontFamily: FONTS.interSemiBold, color: COLORS.gold },
  baneadoTag: {
    backgroundColor: COLORS.error + '15', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
    borderWidth: 1, borderColor: COLORS.error + '44',
  },
  baneadoTagText: { fontSize: 8, fontFamily: FONTS.interSemiBold, color: COLORS.error },
  userActions: { flexDirection: 'row', gap: 2 },
  actionBtn: { padding: 6, borderRadius: 8 },

  cargarMasBtn: {
    padding: 14, alignItems: 'center',
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    marginTop: 4,
  },
  cargarMasText: { fontSize: 13, fontFamily: FONTS.interMedium, color: COLORS.primaryLight },
  emptyText: {
    fontSize: 13, fontFamily: FONTS.interRegular,
    color: COLORS.textMuted, textAlign: 'center', padding: 32,
  },

  // Vacantes admin
  vacanteRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 8,
  },
  vacanteTitle: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  vacanteMeta: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  miniToggle: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white4,
  },
  miniToggleOn: { borderColor: COLORS.success + '44', backgroundColor: COLORS.success + '11' },

  // Aplicaciones admin
  appRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 8,
  },
  appNombre: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  appMeta: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  estadoBtn: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
    backgroundColor: COLORS.primary12, borderWidth: 1, borderColor: COLORS.primary35,
  },
  estadoBtnText: { fontSize: 10, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },

  // Reportes
  reporteCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 8,
  },
  reporteDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  reporteTitle: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  reporteMeta: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  reporteDesc: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted, marginTop: 2 },
  reporteEstadoBadge: {
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1,
  },
  reporteEstadoText: { fontSize: 10, fontFamily: FONTS.interSemiBold },
  actionChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
    backgroundColor: COLORS.primary12, borderWidth: 1, borderColor: COLORS.primary35,
  },
  actionChipText: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },

  // Transacciones
  txResumen: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 14, padding: 16, margin: 12,
    borderWidth: 1, borderColor: COLORS.success + '33',
  },
  txResumenLabel: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  txResumenValue: { fontSize: 24, fontFamily: FONTS.rajdhaniBold, color: COLORS.success },
  txRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 8,
  },
  txConcepto: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  txMeta: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  forceTxBtn: {
    backgroundColor: COLORS.success + '15', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: COLORS.success + '33',
  },
  forceTxText: { fontSize: 10, fontFamily: FONTS.interSemiBold, color: COLORS.success },

  estadoBadge: {
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1,
  },
  estadoText: { fontSize: 10, fontFamily: FONTS.interSemiBold },

  // Config
  configDesc: {
    fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted, marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.backgroundSurface,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    height: 46, paddingHorizontal: 14, marginBottom: 16,
    fontSize: 14, fontFamily: FONTS.interRegular, color: COLORS.textPrimary,
  },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 14, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  toggleLabel: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  toggleDesc: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted, marginTop: 2, maxWidth: 200 },
  infoNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: COLORS.white4, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: COLORS.border, marginTop: 8,
  },
  infoNoteText: { flex: 1, fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted, lineHeight: 16 },

  // Filtros
  filtroChip: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
    backgroundColor: COLORS.backgroundSurface, borderWidth: 1, borderColor: COLORS.border,
  },
  filtroChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filtroText: { fontSize: 11, fontFamily: FONTS.interMedium, color: COLORS.textMuted },
  filtroTextActive: { color: COLORS.textPrimary },

  // Perfil modal
  profileRow: {
    flexDirection: 'row', gap: 8, paddingVertical: 4,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  profileKey: { fontSize: 11, fontFamily: FONTS.interMedium, color: COLORS.textMuted, width: 100 },
  profileVal: { flex: 1, fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textPrimary },
});
