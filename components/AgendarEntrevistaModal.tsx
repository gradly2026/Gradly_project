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
  aplicacionId: string;
  solicitanteId: string;
  empresaId: string;
  vacanteId?: string;
  vacanteNombre?: string;
  solicitanteNombre?: string;
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
  closeBg: "rgba(0,0,0,0.06)",
};

export default function AgendarEntrevistaModal({
  visible,
  onClose,
  aplicacionId,
  solicitanteId,
  empresaId,
  vacanteId,
  vacanteNombre,
  solicitanteNombre,
  theme = "dark",
  onSuccess,
}: Props) {
  const C = theme === "light" ? LIGHT : DARK;

  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [modalidad, setModalidad] = useState<"presencial" | "virtual">("virtual");
  const [lugar, setLugar] = useState("");
  const [notas, setNotas] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setFecha("");
    setHora("");
    setModalidad("virtual");
    setLugar("");
    setNotas("");
    setLoading(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (!fecha.trim() || !hora.trim()) {
      Alert.alert("Requerido", "Ingresa la fecha y hora de la entrevista.");
      return;
    }
    setLoading(true);
    try {
      // Actualizar estado de la aplicación
      await updateDoc(doc(db, "aplicaciones", aplicacionId), {
        estado: "entrevista",
      });

      // Registrar la entrevista
      await addDoc(collection(db, "entrevistas"), {
        aplicacion_id: aplicacionId,
        empresa_id: empresaId,
        solicitante_id: solicitanteId,
        vacante_id: vacanteId ?? "",
        fecha,
        hora,
        modalidad,
        lugar: lugar.trim() || "",
        notas: notas.trim() || "",
        estado: "programada",
        fecha_creacion: serverTimestamp(),
      });

      // Notificar al candidato
      await addDoc(collection(db, "notificaciones"), {
        usuario_id: solicitanteId,
        tipo: "entrevista",
        titulo: "Entrevista programada",
        mensaje: vacanteNombre
          ? `Tienes una entrevista para "${vacanteNombre}" el ${fecha} a las ${hora}.`
          : `Tienes una entrevista programada para el ${fecha} a las ${hora}.`,
        leida: false,
        fecha: serverTimestamp(),
      });

      Alert.alert("Entrevista agendada", `Entrevista programada para el ${fecha} a las ${hora}.`);
      onSuccess?.();
      handleClose();
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "No se pudo agendar la entrevista.");
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
              <Text style={[styles.title, { color: C.text }]}>Agendar entrevista</Text>
              {solicitanteNombre ? (
                <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{solicitanteNombre}</Text>
              ) : null}
            </View>
            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: C.closeBg }]} onPress={handleClose}>
              <Ionicons name="close" size={18} color={C.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ padding: 16 }}>
            <Text style={[styles.label, { color: C.label }]}>Modalidad</Text>
            <View style={styles.modeRow}>
              {(["virtual", "presencial"] as const).map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[
                    styles.modeBtn,
                    {
                      backgroundColor: modalidad === m ? C.purple : C.card,
                      borderColor: C.border,
                    },
                  ]}
                  onPress={() => setModalidad(m)}
                >
                  <Ionicons
                    name={m === "virtual" ? "videocam-outline" : "business-outline"}
                    size={16}
                    color={modalidad === m ? "#fff" : C.muted}
                  />
                  <Text style={{ color: modalidad === m ? "#fff" : C.textSub, fontSize: 13 }}>
                    {m === "virtual" ? "Virtual" : "Presencial"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, { color: C.label }]}>Fecha *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, borderColor: C.border, color: C.text }]}
              value={fecha}
              onChangeText={setFecha}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={C.muted}
            />

            <Text style={[styles.label, { color: C.label }]}>Hora *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, borderColor: C.border, color: C.text }]}
              value={hora}
              onChangeText={setHora}
              placeholder="HH:MM (ej: 10:30)"
              placeholderTextColor={C.muted}
            />

            <Text style={[styles.label, { color: C.label }]}>
              {modalidad === "virtual" ? "Enlace de reunión (opcional)" : "Dirección (opcional)"}
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, borderColor: C.border, color: C.text }]}
              value={lugar}
              onChangeText={setLugar}
              placeholder={modalidad === "virtual" ? "https://meet.google.com/..." : "Dirección de la oficina"}
              placeholderTextColor={C.muted}
              autoCapitalize="none"
            />

            <Text style={[styles.label, { color: C.label }]}>Notas para el candidato (opcional)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, borderColor: C.border, color: C.text, height: 80, textAlignVertical: "top" }]}
              value={notas}
              onChangeText={setNotas}
              placeholder="Instrucciones, documentos a traer, etc."
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
                  <Ionicons name="calendar-outline" size={16} color="#fff" />
                  <Text style={styles.submitBtnText}>Confirmar entrevista</Text>
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
  modeRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  modeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
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
