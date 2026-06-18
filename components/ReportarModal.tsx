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
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../src/config/firebaseConfig";

const RAZONES = [
  "Información falsa o engañosa",
  "Contenido inapropiado",
  "Acoso o intimidación",
  "Spam o publicidad no deseada",
  "Perfil falso",
  "Otro",
];

interface Props {
  visible: boolean;
  onClose: () => void;
  reportadoId: string;
  reportadoRol: "empresa" | "talento" | "alumno" | "universidad";
  reportadoNombre?: string;
  reportanteId: string;
  theme?: "dark" | "light";
}

const DARK = {
  overlay: "rgba(0,0,0,0.75)",
  bg: "#0d0b1e",
  border: "rgba(139,92,246,0.30)",
  text: "#ffffff",
  textSub: "rgba(255,255,255,0.65)",
  textMuted: "rgba(255,255,255,0.38)",
  inputBg: "rgba(255,255,255,0.04)",
  chipBg: "rgba(255,255,255,0.04)",
  chipActiveBg: "rgba(239,68,68,0.15)",
  chipActiveBorder: "#ef4444",
  label: "rgba(167,139,250,0.90)",
  red: "#ef4444",
  redBg: "#7c3aed",
  btnBg: "#ef4444",
  closeBg: "rgba(255,255,255,0.07)",
};

const LIGHT = {
  overlay: "rgba(0,0,0,0.55)",
  bg: "#ffffff",
  border: "rgba(139,92,246,0.25)",
  text: "#111827",
  textSub: "#6b7280",
  textMuted: "#9ca3af",
  inputBg: "#f8f9fa",
  chipBg: "#f3f4f6",
  chipActiveBg: "rgba(239,68,68,0.10)",
  chipActiveBorder: "#ef4444",
  label: "#7c3aed",
  red: "#ef4444",
  redBg: "#7c3aed",
  btnBg: "#ef4444",
  closeBg: "rgba(0,0,0,0.06)",
};

export default function ReportarModal({
  visible,
  onClose,
  reportadoId,
  reportadoRol,
  reportadoNombre,
  reportanteId,
  theme = "dark",
}: Props) {
  const C = theme === "light" ? LIGHT : DARK;

  const [razon, setRazon] = useState("");
  const [detalle, setDetalle] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setRazon("");
    setDetalle("");
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!razon) {
      Alert.alert("Requerido", "Selecciona una razón para el reporte.");
      return;
    }
    setLoading(true);
    try {
      await addDoc(collection(db, "reportes"), {
        reportador_id: reportanteId,
        reportado_id: reportadoId,
        tipo: reportadoRol,
        motivo: razon,
        descripcion: detalle.trim() || "",
        estado: "abierto",
        fecha: serverTimestamp(),
        resolucion: "",
      });
      Alert.alert("Reporte enviado", "Gracias por ayudarnos a mantener la comunidad segura.");
      handleClose();
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "No se pudo enviar el reporte.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={[styles.overlay, { backgroundColor: C.overlay }]}>
        <View style={[styles.card, { backgroundColor: C.bg, borderColor: C.border }]}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: C.text }]}>Reportar perfil</Text>
              {reportadoNombre ? (
                <Text style={[styles.sub, { color: C.textSub }]}>{reportadoNombre}</Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: C.closeBg }]}
              onPress={handleClose}
            >
              <Ionicons name="close" size={18} color={C.text} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.label, { color: C.label }]}>Razón del reporte</Text>
          <ScrollView
            style={{ maxHeight: 200, marginBottom: 14 }}
            showsVerticalScrollIndicator={false}
          >
            {RAZONES.map((r) => (
              <TouchableOpacity
                key={r}
                style={[
                  styles.chip,
                  {
                    backgroundColor: razon === r ? C.chipActiveBg : C.chipBg,
                    borderColor: razon === r ? C.chipActiveBorder : C.border,
                  },
                ]}
                onPress={() => setRazon(r)}
              >
                <Ionicons
                  name={razon === r ? "radio-button-on" : "radio-button-off"}
                  size={16}
                  color={razon === r ? C.red : C.textMuted}
                />
                <Text
                  style={[
                    styles.chipText,
                    { color: razon === r ? C.red : C.text },
                  ]}
                >
                  {r}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={[styles.label, { color: C.label }]}>
            Detalles adicionales (opcional)
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: C.inputBg,
                borderColor: C.border,
                color: C.text,
              },
            ]}
            value={detalle}
            onChangeText={setDetalle}
            placeholder="Describe brevemente el problema..."
            placeholderTextColor={C.textMuted}
            multiline
            numberOfLines={3}
          />

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btnOutline, { borderColor: C.border }]}
              onPress={handleClose}
              disabled={loading}
            >
              <Text style={[styles.btnOutlineText, { color: C.text }]}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.btnDanger,
                { backgroundColor: C.btnBg },
                loading && { opacity: 0.6 },
              ]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.btnDangerText}>Enviar reporte</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  title: { fontSize: 17, fontWeight: "700" },
  sub: { fontSize: 12, marginTop: 2 },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 6,
  },
  chipText: { fontSize: 13 },
  input: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    height: 80,
    textAlignVertical: "top",
    marginBottom: 16,
  },
  actions: { flexDirection: "row", gap: 10 },
  btnOutline: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btnOutlineText: { fontSize: 13, fontWeight: "600" },
  btnDanger: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDangerText: { fontSize: 13, fontWeight: "700", color: "#ffffff" },
});
