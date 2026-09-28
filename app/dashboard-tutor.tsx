// ═════════════════════════════════════════════════════════════════
// DASHBOARD TUTOR — panel del rol nuevo "tutor" (Fase 1: fundación).
//
// Un tutor es la persona que una EMPRESA delega como encargado on-site de
// sus pasantes. En esta fase el dashboard es SOLO su propio perfil — nombre/
// cargo/carnet/correo los puso la empresa al registrarlo (solo lectura
// aquí); dirección/departamento/distrito/DUI opcional/foto/horario los
// completa el propio tutor. Asignación a pasantes, validador de código de
// asistencia, calendario y observaciones llegan en fases posteriores.
//
// Mismo patrón config-driven que dashboard-empresa.tsx/dashboard-
// universidad.tsx: PerfilMasterDetail con un array `sections`.
// ═════════════════════════════════════════════════════════════════
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text, AutoTextInput as TextInput } from '../src/components/AutoText';
import { showAlert } from '../src/components/AppAlert';
import SalirSesionModal from '../src/components/SalirSesionModal';
import PerfilMasterDetail from '../src/components/PerfilMasterDetail';
import HorarioVacanteSelector from '../src/components/HorarioVacanteSelector';
import { auth, db, storage } from '../src/config/firebaseConfig';
import { useAuth } from '../src/context/AuthContext';
import { useAuthGuard } from '../src/hooks/useAuthGuard';
import { FONTS, useTheme, type GradlyColors } from '../src/context/ThemeContext';
import type { HorarioPasantia } from '../src/data/disponibilidad';
import type { PerfilTutor } from '../src/services/tutorService';
import { uploadDocumentoVerificacion } from '../src/services/storageUploads';

export default function DashboardTutor() {
  useAuthGuard('tutor');
  const { user } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const s = makeStyles(colors);

  const [perfil, setPerfil] = useState<PerfilTutor | null>(null);
  const [documentoNumero, setDocumentoNumero] = useState('');
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [uploadingDui, setUploadingDui] = useState(false);
  const [guardandoHorario, setGuardandoHorario] = useState(false);
  const [horarioBorrador, setHorarioBorrador] = useState<Partial<HorarioPasantia>>({});
  const [logoutVisible, setLogoutVisible] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(doc(db, 'perfiles_tutores', user.uid), (snap) => {
      const data = snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as PerfilTutor) : null;
      setPerfil(data);
      setHorarioBorrador(data?.horario ?? {});
    });
    return unsub;
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    let cancel = false;
    getDoc(doc(db, 'verificaciones_tutor', user.uid))
      .then((snap) => { if (!cancel) setDocumentoNumero(snap.exists() ? String(snap.data()?.documento_numero ?? '') : ''); })
      .catch(() => { if (!cancel) setDocumentoNumero(''); });
    return () => { cancel = true; };
  }, [user?.uid]);

  const handleUploadFoto = async () => {
    if (!user?.uid) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Permiso necesario', 'Necesitamos acceso a tu galería.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (result.canceled) return;
    setUploadingFoto(true);
    try {
      const response = await fetch(result.assets[0].uri);
      const blob = await response.blob();
      const storageRef = ref(storage, `fotos_tutores/${user.uid}/foto.jpg`);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      const urlConCache = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
      await Promise.all([
        updateDoc(doc(db, 'perfiles_tutores', user.uid), { foto_url: urlConCache }),
        updateDoc(doc(db, 'usuarios', user.uid), { foto_url: urlConCache }),
      ]);
    } catch {
      showAlert('Error', 'No se pudo subir la foto.');
    } finally {
      setUploadingFoto(false);
    }
  };

  const handleUploadDui = async () => {
    if (!user?.uid) return;
    const res = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]?.uri) return;
    setUploadingDui(true);
    try {
      const url = await uploadDocumentoVerificacion(user.uid, res.assets[0].uri, 'dui.jpg');
      await setDoc(doc(db, 'verificaciones_tutor', user.uid), { dui_foto_url: url }, { merge: true });
      showAlert('Listo', 'Se guardó la foto de tu DUI.');
    } catch {
      showAlert('Error', 'No se pudo subir el documento.');
    } finally {
      setUploadingDui(false);
    }
  };

  const guardarDocumentoNumero = async (numero: string) => {
    if (!user?.uid) return;
    await setDoc(doc(db, 'verificaciones_tutor', user.uid), { documento_numero: numero }, { merge: true });
  };

  const guardarHorario = async () => {
    if (!user?.uid) return;
    const h = horarioBorrador;
    if (!h.dias?.length || !h.horaInicio || !h.horaFin) {
      showAlert('Horario incompleto', 'Elige los días y las horas de inicio y fin.');
      return;
    }
    setGuardandoHorario(true);
    try {
      await updateDoc(doc(db, 'perfiles_tutores', user.uid), { horario: h });
      showAlert('Horario guardado', 'Ya quedó actualizado tu horario.');
    } catch {
      showAlert('Error', 'No se pudo guardar el horario.');
    } finally {
      setGuardandoHorario(false);
    }
  };

  if (!perfil) {
    return (
      <View style={s.loading}>
        <ActivityIndicator size="large" color={colors.primaryLight} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.backgroundDark }}>
      <StatusBar style="light" />
      <PerfilMasterDetail
        name={perfil.nombre_completo}
        subtitle={perfil.cargo}
        avatarUrl={perfil.foto_url}
        avatarStoragePath={`fotos_tutores/${user!.uid}/foto.jpg`}
        fallbackIcon="person"
        onEditPhoto={handleUploadFoto}
        uploadingPhoto={uploadingFoto}
        onAyuda={() => router.push('/help-gradly' as any)}
        onAcerca={() => router.push('/about-gradly' as any)}
        onCalificarPlataforma={() => router.push('/calificar-plataforma' as any)}
        onLogout={() => setLogoutVisible(true)}
        sections={[
          {
            id: 'datos',
            title: 'Mis datos',
            subtitle: 'Registrados por tu empresa',
            icon: 'business-outline',
            tone: 'blue',
            description: 'Estos datos los registró tu empresa; si alguno está mal, pídele que te contacte con soporte.',
            fields: [
              { key: 'nombre_completo', label: 'Nombre completo', value: perfil.nombre_completo, readonly: true },
              { key: 'cargo', label: 'Cargo', value: perfil.cargo, readonly: true },
              { key: 'carnet_trabajo', label: 'Carnet de trabajo', value: perfil.carnet_trabajo, readonly: true },
              { key: 'correo', label: 'Correo', value: perfil.correo, readonly: true },
            ],
          },
          {
            id: 'ubicacion',
            title: 'Mi ubicación',
            subtitle: [perfil.departamento, perfil.distrito].filter(Boolean).join(' · ') || 'Sin definir',
            icon: 'location-outline',
            tone: 'purple',
            description: 'Completa tú mismo estos datos.',
            fields: [
              { key: 'direccion', label: 'Dirección', value: perfil.direccion ?? '', multiline: true },
              { key: 'departamento', label: 'Departamento', value: perfil.departamento ?? '' },
              { key: 'distrito', label: 'Distrito', value: perfil.distrito ?? '' },
            ],
            onSave: async (v) => {
              try {
                await updateDoc(doc(db, 'perfiles_tutores', user!.uid), {
                  direccion: v.direccion,
                  departamento: v.departamento,
                  distrito: v.distrito,
                });
              } catch {
                showAlert('Error', 'No se pudo guardar.');
              }
            },
          },
          {
            id: 'documento',
            title: 'Documento (DUI)',
            subtitle: 'Opcional',
            icon: 'card-outline',
            tone: 'green',
            render: () => (
              <View style={{ gap: 12 }}>
                <Text style={s.docHint}>
                  Tu DUI es opcional y solo lo puedes ver tú (y el admin de Gradly, si hace falta verificar algo).
                </Text>
                <TextInput
                  style={s.docInput}
                  value={documentoNumero}
                  onChangeText={setDocumentoNumero}
                  onBlur={() => { void guardarDocumentoNumero(documentoNumero); }}
                  placeholder="Número de DUI"
                  placeholderTextColor={colors.white60}
                />
                <TouchableOpacity style={s.docBtn} onPress={handleUploadDui} disabled={uploadingDui} activeOpacity={0.85}>
                  {uploadingDui ? (
                    <ActivityIndicator size="small" color={colors.textPrimary} />
                  ) : (
                    <>
                      <Ionicons name="camera-outline" size={16} color={colors.textPrimary} />
                      <Text style={s.docBtnTxt}>Subir foto del DUI</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ),
          },
          {
            id: 'horario',
            title: 'Mi horario',
            subtitle: horarioBorrador.horaInicio && horarioBorrador.horaFin
              ? `${horarioBorrador.horaInicio} – ${horarioBorrador.horaFin}`
              : 'Sin definir',
            icon: 'time-outline',
            tone: 'orange',
            render: () => (
              <View style={{ gap: 14 }}>
                <HorarioVacanteSelector
                  value={horarioBorrador}
                  onChange={setHorarioBorrador}
                  requerido={false}
                />
                <TouchableOpacity
                  style={[s.docBtn, s.saveBtn, guardandoHorario && { opacity: 0.6 }]}
                  onPress={guardarHorario}
                  disabled={guardandoHorario}
                  activeOpacity={0.9}
                >
                  {guardandoHorario ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={s.saveBtnTxt}>Guardar horario</Text>
                  )}
                </TouchableOpacity>
              </View>
            ),
          },
        ]}
      />

      <SalirSesionModal
        visible={logoutVisible}
        onConfirm={async () => {
          setLogoutVisible(false);
          await signOut(auth);
          router.replace('/auth/iniciosesion' as any);
        }}
        onCancel={() => setLogoutVisible(false)}
      />
    </View>
  );
}

const makeStyles = (C: GradlyColors) =>
  StyleSheet.create({
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.backgroundDark },
    docHint: { color: C.white60, fontSize: 12.5, lineHeight: 17 },
    docInput: {
      backgroundColor: C.white8,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 11,
      color: C.textPrimary,
      fontSize: 14,
    },
    docBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: C.primary35,
      borderRadius: 12,
      paddingVertical: 12,
    },
    docBtnTxt: { color: C.textPrimary, fontSize: 13.5, fontFamily: FONTS.interSemiBold },
    saveBtn: { backgroundColor: C.primary, borderColor: C.primary },
    saveBtnTxt: { color: '#fff', fontSize: 14, fontFamily: FONTS.interSemiBold },
  });
