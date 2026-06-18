import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../src/config/firebaseConfig";

interface Props {
  visible: boolean;
  onClose: () => void;
  solicitudId: string;
  empresaId: string;
  universidadId: string;
  grupoNombre?: string;
  horasRequeridas?: number;
  theme?: "dark" | "light";
  onSuccess?: () => void;
}

const DARK = {
  overlay: "rgba(0,0,0,0.75)",
  bg: "#0d0b1e",
  card: "rgba(255,255,255,0.04)",
  border: "rgba(139,92,246,0.30)",
  text: "#f4f1ff",
  textSub: "rgba(255,255,255,0.65)",
  muted: "rgba(255,255,255,0.38)",
  inputBg: "rgba(255,255,255,0.04)",
  label: "rgba(167,139,250,0.90)",
  purple: "#8b5cf6",
  green: "#10b981",
  closeBg: "rgba(255,255,255,0.07)",
};

const LIGHT = {
  overlay: "rgba(0,0,0,0.55)",
  bg: "#ffffff",
  card: "#f8f9fa",
  border: "rgba(139,92,246,0.25)",
  text: "#111827",
  textSub: "#6b7280",
  muted: "#9ca3af",
  inputBg: "#f3f4f6",
  label: "#7c3aed",
  purple: "#7c3aed",
  green: "#059669",
  closeBg: "rgba(0,0,0,0.06)",
};

export default function PropuestaCondicionesModal({
  visible,
  onClose,
  solicitudId,
  empresaId,
  universidadId,
  grupoNombre,
  horasRequeridas,
  theme = "dark",
  onSuccess,
}: Props) {
  const C = theme === "light" ? LIGHT : DARK;

  const [horasOfrecidas, setHorasOfrecidas] = useState(
    horasRequeridas ? String(horasRequeridas) : ""
  );
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [horario, setHorario] = useState("");
  const [condiciones, setCondiciones] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setHorasOfrecidas(horasRequeridas ? String(horasRequeridas) : "");
    setFechaInicio("");
    setFechaFin("");
    setHorario("");
    setCondiciones("");
    setLoading(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (!horasOfrecidas.trim() || !fechaInicio.trim() || !fechaFin.trim()) {
      Alert.alert("Requerido", "Ingresa las horas ofrecidas y las fechas de inicio y fin.");
      return;
    }
    setLoading(true);
    try {
      await updateDoc(doc(db, "solicitudes_horas", solicitudId), {
        estado: "en_revision",
        horas_ofrecidas: parseInt(horasOfrecidas, 10),
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        horario: horario.trim() || "",
        condiciones: condiciones.trim() || "",
        empresa_id: empresaId,
      });

      // Notificar a la universidad
      await addDoc(collection(db, "notificaciones"), {
        usuario_id: universidadId,
        tipo: "horas_sociales",
        titulo: "Propuesta de condiciones recibida",
        mensaje: grupoNombre
          ? `La empresa ha enviado una propuesta de condiciones para el grupo "${grupoNombre}". Revisa los detalles en Horas Sociales.`
          : "La empresa ha enviado una propuesta de condiciones. Revisa los detalles en Horas Sociales.",
        leida: false,
        fecha: serverTimestamp(),
      });

      onSuccess?.();
      handleClose();
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "No se pudo enviar la propuesta.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={[styles.overlay, { backgroundColor: C.overlay }]}>
        <View style={[styles.sheet, { backgroundColor: C.bg, borderTopColor: C.border }]}>
          <View style={[styles.header, { borderBottomColor: C.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: C.text }]}>Propuesta de condiciones</Text>
              {grupoNombre ? (
                <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{grupoNombre}</Text>
              ) : null}
            </View>
            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: C.closeBg }]} onPress={handleClose}>
              <Ionicons name="close" size={18} color={C.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ padding: 16 }}>
            <Text style={[styles.label, { color: C.label }]}>Horas sociales ofrecidas *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, borderColor: C.border, color: C.text }]}
              value={horasOfrecidas}
              onChangeText={(t) => setHorasOfrecidas(t.replace(/[^0-9]/g, ""))}
              placeholder={horasRequeridas ? `Requeridas: ${horasRequeridas}` : "Número de horas"}
              placeholderTextColor={C.muted}
              keyboardType="numeric"
            />

            <Text style={[styles.label, { color: C.label }]}>Fecha de inicio *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, borderColor: C.border, color: C.text }]}
              value={fechaInicio}
              onChangeText={setFechaInicio}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={C.muted}
            />

            <Text style={[styles.label, { color: C.label }]}>Fecha de fin *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, borderColor: C.border, color: C.text }]}
              value={fechaFin}
              onChangeText={setFechaFin}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={C.muted}
            />

            <Text style={[styles.label, { color: C.label }]}>Horario (opcional)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, borderColor: C.border, color: C.text }]}
              value={horario}
              onChangeText={setHorario}
              placeholder="Ej: Lunes a viernes 8:00 a 12:00"
              placeholderTextColor={C.muted}
            />

            <Text style={[styles.label, { color: C.label }]}>Condiciones y requisitos (opcional)</Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: C.inputBg, borderColor: C.border, color: C.text, height: 90, textAlignVertical: "top" },
              ]}
              value={condiciones}
              onChangeText={setCondiciones}
              placeholder="Uniformes, equipos necesarios, áreas de trabajo, etc."
              placeholderTextColor={C.muted}
              multiline
            />

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: C.purple }, loading && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="send-outline" size={16} color="#fff" />
                  <Text style={styles.submitBtnText}>Enviar propuesta</Text>
                </>
              )}
            </TouchableOpacity>
            <View style={{ height: 20 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    maxHeight: "90%",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 16,
    borderBottomWidth: 1,
  },
  title: { fontSize: 17, fontWeight: "700" },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  label: { fontSize: 11, fontWeight: "600", letterSpacing: 0.3, marginBottom: 6, marginTop: 4 },
  input: {
    height: 46,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    marginBottom: 12,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 46,
    borderRadius: 12,
    marginTop: 8,
  },
  submitBtnText: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
});
