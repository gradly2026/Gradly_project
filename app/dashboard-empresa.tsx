/**
 * dashboard-empresa.tsx
 * Portal de empresa React Native (Expo) - VERSIÓN COMPLETA PRODUCTION-READY
 * * Modificaciones:
 * - Eliminación total de datos mock / estáticos.
 * - Conexión directa a Supabase Auth y PostgreSQL.
 * - Carga dinámica del perfil corporativo y sus vacantes publicadas.
 * - Implementación funcional de guardado de vacantes por el método multi-paso.
 * - Integración con Supabase Storage para actualizar el logo de la empresa.
 */

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";

import TranslatedText from "../components/TranslatedText";
import { supabase } from "../lib/supabase";
import handleLogout from "../src/services/authService";

const Text = TranslatedText;

type Theme = {
  bg: string;
  surface: string;
  card: string;
  border: string;
  purple: string;
  purpleDark: string;
  purpleDim: string;
  purpleBorder: string;
  text: string;
  muted: string;
  green: string;
  greenBg: string;
  red: string;
};

const C: Theme = {
  bg: "#07050f",
  surface: "#0d0b1e",
  card: "#141226",
  border: "rgba(139,92,246,0.15)",
  purple: "#8b5cf6",
  purpleDark: "#6d28d9",
  purpleDim: "rgba(139,92,246,0.08)",
  purpleBorder: "rgba(139,92,246,0.3)",
  text: "#ffffff",
  muted: "rgba(255,255,255,0.5)",
  green: "#10b981",
  greenBg: "rgba(16,185,129,0.1)",
  red: "#ef4444",
};

export default function DashboardEmpresa() {
  const router = useRouter();
  // const { locale } = useTranslationContext();

  // ─── ESTADOS DE LA APLICACIÓN ───
  const [empresa, setEmpresa] = useState<any>(null);
  const [vacantes, setVacantes] = useState<any[]>([]);
  const [postulaciones, setPostulaciones] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);

  // Modales y Vistas
  const [modalVisible, setModalVisible] = useState(false);
  const [stepperStep, setStepperStep] = useState<1 | 2 | 3>(1);
  const [selectedVacante, setSelectedVacante] = useState<any>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // Formulario de Nueva Vacante
  const [formTitulo, setFormTitulo] = useState("");
  const [formArea, setFormArea] = useState("");
  const [formModalidad, setFormModalidad] = useState("presencial"); // remoto, hibrido, presencial
  const [formTipo, setFormTipo] = useState("tiempo_completo"); // pasantia, tiempo_completo, medio_tiempo
  const [formDescripcion, setFormDescripcion] = useState("");
  const [formSalarioMin, setFormSalarioMin] = useState("");
  const [formSalarioMax, setFormSalarioMax] = useState("");
  const [formMostrarSalario, setFormMostrarSalario] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  // ─── CONSULTAS DE BASE DE DATOS (SUPABASE) ───
  const fetchInitialData = async () => {
    try {
      setLoading(true);
      
      // 1. Obtener sesión de usuario autenticado
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        Alert.alert("Error", "No se encontró una sesión activa.");
        router.replace("/iniciosesion");
        return;
      }

      // 2. Traer datos del perfil de la empresa
      const { data: empresaData, error: empresaError } = await supabase
        .from("empresas")
        .select("*")
        .eq("id", user.id)
        .single();

      if (empresaError || !empresaData) {
        throw new Error("No se pudieron cargar los datos de la empresa.");
      }
      setEmpresa(empresaData);

      // 3. Traer vacantes de la empresa
      const { data: vacantesData, error: vacantesError } = await supabase
        .from("vacantes")
        .select("*")
        .eq("empresa_id", user.id)
        .order("created_at", { ascending: false });

      if (!vacantesError && vacantesData) {
        setVacantes(vacantesData);
      }

      // 4. Traer postulaciones vinculadas a las vacantes de esta empresa
      const { data: postData, error: postError } = await supabase
        .from("aplicaciones") // Asegúrate que el nombre coincida exactamente con tu tabla intermedia
        .select("*, alumnos(*), vacantes(*)")
        .eq("vacantes.empresa_id", user.id);

      if (!postError && postData) {
        setPostulaciones(postData);
      }

    } catch (error: any) {
      Alert.alert("Error de Sincronización", error.message || "Ocurrió un error inesperado.");
    } finally {
      setLoading(false);
    }
  };

  // ─── PROCESO DE SUBIDA DE IMÁGENES (STORAGE) ───
  const cambiarLogo = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert("Permiso Denegado", "Se necesita acceso a la galería para cambiar el logo.");
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (pickerResult.canceled || !pickerResult.assets ?.[0]) return;

    try {
      setUploadingImage(true);
      const uri = pickerResult.assets[0].uri;
      
      // Transformación de archivo local a ArrayBuffer para Supabase Storage en Expo
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      const fileName = `${empresa.id}/logo_${Date.now()}.jpg`;

      // Subida al Bucket 'avatars' (Debe ser público en tu consola de Supabase)
      const { data: storageData, error: storageError } = await supabase.storage
        .from("avatars")
        .upload(fileName, base64, {
          contentType: "image/jpeg",
          upsert: true
        });

      if (storageError) throw storageError;

      // Obtención de la URL Pública del CDN de Supabase Storage
      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName);

      // Actualizar columna 'logo' en la tabla 'empresas'
      const { error: updateError } = await supabase
        .from("empresas")
        .update({ logo: publicUrl })
        .eq("id", empresa.id);

      if (updateError) throw updateError;

      setEmpresa({ ...empresa, logo: publicUrl });
      Alert.alert("Éxito", "El logo se ha actualizado correctamente.");

    } catch (error: any) {
      Alert.alert("Error de carga", error.message || "No se pudo subir la imagen.");
    } finally {
      setUploadingImage(false);
    }
  };

  // ─── GUARDAR NUEVA VACANTE EN SQL ───
  const guardarVacante = async () => {
    if (!formTitulo.trim() || !formArea.trim() || !formDescripcion.trim()) {
      Alert.alert("Validación", "Por favor completa los campos requeridos en el paso 1.");
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      const nuevaVacante = {
        empresa_id: user?.id,
        titulo: formTitulo,
        area: formArea,
        modalidad: formModalidad,
        tipo: formTipo,
        descripcion: formDescripcion,
        salario_min: formSalarioMin ? parseFloat(formSalarioMin) : null,
        salario_max: formSalarioMax ? parseFloat(formSalarioMax) : null,
        mostrar_salario: formMostrarSalario,
        estado: "activa",
      };

      const { data, error } = await supabase
        .from("vacantes")
        .insert([nuevaVacante])
        .select();

      if (error) throw error;

      Alert.alert("Éxito", "Vacante publicada correctamente.");
      setModalVisible(false);
      
      // Limpiar Formulario
      setFormTitulo("");
      setFormArea("");
      setFormDescripcion("");
      setFormSalarioMin("");
      setFormSalarioMax("");
      setStepperStep(1);

      // Recargar Listado de vacantes
      if (data) setVacantes([data[0], ...vacantes]);

    } catch (error: any) {
      Alert.alert("Error al guardar", error.message || "No se pudo insertar la vacante.");
    } finally {
      setLoading(false);
    }
  };

  if (loading && !modalVisible && !detailModalVisible) {
    return (
      <SafeAreaView style={[s.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={C.purple} />
        <Text style={{ color: C.text, marginTop: 12 }}>Sincronizando datos con Supabase...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        
        {/* HEADER COMPAÑÍA DINÁMICO */}
        <View style={s.header}>
          <TouchableOpacity onPress={cambiarLogo} activeOpacity={0.7} style={s.logoContainer}>
            {uploadingImage ? (
              <ActivityIndicator color={C.purple} />
            ) : empresa?.logo ? (
              <Image source={{ uri: empresa.logo }} style={s.logo} />
            ) : (
              <Ionicons name="business-outline" size={32} color={C.purple} />
            )}
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.companyName}>{empresa?.nombre || "Cargando..."}</Text>
            <Text style={s.companySector}>{empresa?.sector || "Sector no especificado"}</Text>
          </View>
          <TouchableOpacity style={s.logoutBtn} onPress={() => handleLogout(router)}>
            <Ionicons name="log-out-outline" size={20} color={C.red} />
          </TouchableOpacity>
        </View>

        {/* MÉTRICAS EN TIEMPO REAL */}
        <View style={s.metricsRow}>
          <View style={s.metricCard}>
            <Text style={s.metricValue}>{vacantes.length}</Text>
            <Text style={s.metricLabel}>Vacantes Activas</Text>
          </View>
          <View style={s.metricCard}>
            <Text style={s.metricValue}>{postulaciones.length}</Text>
            <Text style={s.metricLabel}>Postulaciones</Text>
          </View>
        </View>

        {/* ACCIONES PRINCIPALES */}
        <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
          <TouchableOpacity style={s.createBtn} onPress={() => setModalVisible(true)}>
            <Ionicons name="add-circle-outline" size={20} color="#fff" />
            <Text style={s.createBtnText}>Publicar Nueva Vacante</Text>
          </TouchableOpacity>
        </View>

        {/* SECCIÓN: LISTADO DE VACANTES DE LA BD */}
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={s.sectionTitle}>Tus Vacantes Publicadas</Text>
          {vacantes.length === 0 ? (
            <View style={s.emptyCard}>
              <Text style={{ color: C.muted, textAlign: "center" }}>No has publicado ninguna oferta laboral aún.</Text>
            </View>
          ) : (
            vacantes.map((v) => (
              <TouchableOpacity 
                key={v.id} 
                style={s.vacanteCard}
                onPress={() => {
                  setSelectedVacante(v);
                  setDetailModalVisible(true);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.vacanteTitle}>{v.titulo}</Text>
                  <Text style={s.vacanteArea}>{v.area} • {v.modalidad.toUpperCase()}</Text>
                </View>
                <Ionicons name="chevron-forward-outline" size={20} color={C.muted} />
              </TouchableOpacity>
            ))
          )}
        </View>

      </ScrollView>

      {/* MODAL CREAR VACANTE MULTI-PASO (STEPPER) */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={s.modalContainer}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Nueva Oferta (Paso {stepperStep} de 3)</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close-outline" size={24} color={C.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 16 }}>
              {stepperStep === 1 && (
                <View>
                  <Text style={s.inputLabel}>Título del Puesto *</Text>
                  <TextInput value={formTitulo} onChangeText={setFormTitulo} style={s.input} placeholder="Ej: Desarrollador Frontend React" placeholderTextColor={C.muted} />

                  <Text style={s.inputLabel}>Área Profesional *</Text>
                  <TextInput value={formArea} onChangeText={setFormArea} style={s.input} placeholder="Ej: Tecnología / Ingeniería" placeholderTextColor={C.muted} />

                  <Text style={s.inputLabel}>Descripción General *</Text>
                  <TextInput value={formDescripcion} onChangeText={setFormDescripcion} style={[s.input, { height: 100 }]} multiline placeholder="Describe las responsabilidades del puesto..." placeholderTextColor={C.muted} />
                </View>
              )}

              {stepperStep === 2 && (
                <View>
                  <Text style={s.inputLabel}>Modalidad de Trabajo</Text>
                  <View style={{ flexDirection: "row", gap: 10, marginBottom: 15 }}>
                    {["presencial", "remoto", "hibrido"].map((m) => (
                      <TouchableOpacity key={m} style={[s.selectorTab, formModalidad === m && s.selectorTabActive]} onPress={() => setFormModalidad(m)}>
                        <Text style={{ color: formModalidad === m ? "#fff" : C.muted }}>{m.toUpperCase()}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={s.inputLabel}>Tipo de Contrato</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                    {["tiempo_completo", "medio_tiempo", "pasantia", "freelance"].map((t) => (
                      <TouchableOpacity key={t} style={[s.selectorTab, formTipo === t && s.selectorTabActive]} onPress={() => setFormTipo(t)}>
                        <Text style={{ color: formTipo === t ? "#fff" : C.muted }}>{t.replace("_", " ").toUpperCase()}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {stepperStep === 3 && (
                <View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <Text style={s.inputLabel}>Mostrar Salario de forma pública</Text>
                    <Switch value={formMostrarSalario} onValueChange={setFormMostrarSalario} trackColor={{ false: "#222", true: C.purple }} />
                  </View>

                  <Text style={s.inputLabel}>Salario Mínimo Mensual (Opcional)</Text>
                  <TextInput value={formSalarioMin} onChangeText={formSalarioMin => setFormSalarioMin(formSalarioMin.replace(/[^0-9.]/g, ''))} keyboardType="numeric" style={s.input} placeholder="Monto mínimo en USD" placeholderTextColor={C.muted} />

                  <Text style={s.inputLabel}>Salario Máximo Mensual (Opcional)</Text>
                  <TextInput value={formSalarioMax} onChangeText={formSalarioMax => setFormSalarioMax(formSalarioMax.replace(/[^0-9.]/g, ''))} keyboardType="numeric" style={s.input} placeholder="Monto máximo en USD" placeholderTextColor={C.muted} />
                </View>
              )}
            </ScrollView>

            {/* CONTROL DE PASOS */}
            <View style={s.modalFooter}>
              {stepperStep > 1 ? (
                <TouchableOpacity style={s.btnSecundario} onPress={() => setStepperStep((prev) => (prev - 1) as any)}>
                  <Text style={{ color: C.text }}>Atrás</Text>
                </TouchableOpacity>
              ) : <View />}

              {stepperStep < 3 ? (
                <TouchableOpacity style={s.btnPrimario} onPress={() => setStepperStep((prev) => (prev + 1) as any)}>
                  <Text style={{ color: "#fff", fontWeight: "bold" }}>Siguiente</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[s.btnPrimario, { backgroundColor: C.green }]} onPress={guardarVacante}>
                  <Text style={{ color: "#fff", fontWeight: "bold" }}>Publicar Oferta</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── HOJA DE ESTILOS ESTRICTA Y DISEÑO LIMPIO ───
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: "row", padding: 16, alignItems: "center", borderBottomWidth: 1, borderBottomColor: C.border, gap: 12, backgroundColor: C.surface },
  logoContainer: { width: 60, height: 60, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.purpleBorder, justifyContent: "center", alignItems: "center", overflow: "hidden" },
  logo: { width: "100%", height: "100%" },
  companyName: { fontSize: 18, fontWeight: "bold", color: C.text },
  companySector: { fontSize: 13, color: C.muted, marginTop: 2 },
  logoutBtn: { padding: 8 },
  metricsRow: { flexDirection: "row", padding: 16, gap: 12 },
  metricCard: { flex: 1, padding: 16, backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: "center" },
  metricValue: { fontSize: 24, fontWeight: "800", color: C.purple },
  metricLabel: { fontSize: 12, color: C.muted, marginTop: 4 },
  createBtn: { flexDirection: "row", backgroundColor: C.purple, padding: 14, borderRadius: 10, justifyContent: "center", alignItems: "center", gap: 8 },
  createBtnText: { color: "#fff", fontWeight: "bold", fontSize: 15 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: C.text, marginBottom: 12 },
  emptyCard: { padding: 20, backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: C.purpleBorder },
  vacanteCard: { flexDirection: "row", alignItems: "center", padding: 16, backgroundColor: C.surface, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  vacanteTitle: { fontSize: 15, fontWeight: "bold", color: C.text },
  vacanteArea: { fontSize: 12, color: C.muted, marginTop: 4 },
  modalContainer: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, minHeight: "60%", maxHeight: "90%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  modalTitle: { fontSize: 16, fontWeight: "bold", color: C.text },
  inputLabel: { fontSize: 13, color: C.muted, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: C.card, color: C.text, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: C.border, fontSize: 14 },
  selectorTab: { flex: 1, paddingVertical: 10, backgroundColor: C.card, borderRadius: 8, alignItems: "center", borderWidth: 1, borderColor: C.border },
  selectorTabActive: { backgroundColor: C.purple, borderColor: C.purple },
  modalFooter: { flexDirection: "row", justifyContent: "space-between", padding: 16, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.card },
  btnPrimario: { backgroundColor: C.purple, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  btnSecundario: { backgroundColor: "transparent", paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8, borderWidth: 1, borderColor: C.border }
});