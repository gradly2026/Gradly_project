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
import { supabase } from "../lib/supabase";

interface Props {
  visible: boolean;
  onClose: () => void;
  aplicacionId: string;
  solicitanteId: string;
  vacanteNombre?: string;
  solicitanteNombre?: string;
  theme?: "dark" | "light";
  onSuccess?: () => void;
}

const RAZONES = [
  { key: "no_requisitos", label: "No cumple los requisitos" },
  { key: "vacante_cubierta", label: "Vacante ya cubierta" },
  { key: "perfil_diferente", label: "Buscamos un perfil diferente" },
  { key: "sin_experiencia", label: "Falta de experiencia" },
  { key: "otro", label: "Otro motivo" },
];

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
  red: "#ef4444",
  redBg: "rgba(239,68,68,0.10)",
  chipBg: "rgba(255,255,255,0.06)",
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
  red: "#dc2626",
  redBg: "rgba(220,38,38,0.06)",
  chipBg: "#f3f4f6",
  closeBg: "rgba(0,0,0,0.06)",
};

export default function RechazarModal({
  visible,
  onClose,
  aplicacionId,
  solicitanteId,
  vacanteNombre,
  solicitanteNombre,
  theme = "dark",
  onSuccess,
}: Props) {
  const C = theme === "light" ? LIGHT : DARK;

  const [razon, setRazon] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setRazon("");
    setMensaje("");
    setLoading(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (!razon) {
      Alert.alert("Requerido", "Selecciona un motivo de rechazo.");
      return;
    }
    setLoading(true);
    try {
      await supabase
        .from("aplicaciones")
        .update({ estado: "rechazada" })
        .eq("id", aplicacionId);

      const razonLabel = RAZONES.find((r) => r.key === razon)?.label ?? razon;
      await supabase.from("notificaciones").insert({
        usuario_id: solicitanteId,
        tipo: "aplicacion",
        titulo: "Aplicación no avanzó",
        mensaje: vacanteNombre
          ? `Tu aplicación para "${vacanteNombre}" no fue seleccionada. Motivo: ${razonLabel}.${mensaje.trim() ? " " + mensaje.trim() : ""}`
          : `Tu aplicación no fue seleccionada. Motivo: ${razonLabel}.${mensaje.trim() ? " " + mensaje.trim() : ""}`,
        leida: false,
      });

      onSuccess?.();
      handleClose();
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "No se pudo procesar el rechazo.");
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
              <Text style={[styles.title, { color: C.text }]}>Rechazar candidato</Text>
              {solicitanteNombre ? (
                <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{solicitanteNombre}</Text>
              ) : null}
            </View>
            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: C.closeBg }]} onPress={handleClose}>
              <Ionicons name="close" size={18} color={C.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ padding: 16 }}>
            <Text style={[styles.label, { color: C.label }]}>Motivo del rechazo *</Text>
            <View style={{ gap: 8, marginBottom: 16 }}>
              {RAZONES.map((r) => (
                <TouchableOpacity
                  key={r.key}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: razon === r.key ? C.redBg : C.chipBg,
                      borderColor: razon === r.key ? C.red : C.border,
                      borderWidth: razon === r.key ? 1.5 : 1,
                    },
                  ]}
                  onPress={() => setRazon(r.key)}
                >
                  <View style={[styles.radio, { borderColor: razon === r.key ? C.red : C.muted }]}>
                    {razon === r.key && (
                      <View style={[styles.radioDot, { backgroundColor: C.red }]} />
                    )}
                  </View>
                  <Text style={{ color: razon === r.key ? C.red : C.textSub, fontSize: 14 }}>
                    {r.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, { color: C.label }]}>Mensaje al candidato (opcional)</Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: C.inputBg, borderColor: C.border, color: C.text, height: 80, textAlignVertical: "top" },
              ]}
              value={mensaje}
              onChangeText={setMensaje}
              placeholder="Puedes agregar un mensaje adicional para el candidato..."
              placeholderTextColor={C.muted}
              multiline
            />

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: C.red }, loading && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="close-circle-outline" size={16} color="#fff" />
                  <Text style={styles.submitBtnText}>Confirmar rechazo</Text>
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
    maxHeight: "85%",
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
  label: { fontSize: 11, fontWeight: "600", letterSpacing: 0.3, marginBottom: 8, marginTop: 4 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    fontSize: 14,
    marginBottom: 16,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 46,
    borderRadius: 12,
    marginTop: 4,
  },
  submitBtnText: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
});
