import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import { esPassword } from "../hooks/useFieldValidation";

interface Props {
  visible: boolean;
  onClose: () => void;
  theme?: "dark" | "light";
}

const DARK = {
  overlay: "rgba(0,0,0,0.75)",
  bg: "#0d0b1e",
  border: "rgba(139,92,246,0.30)",
  borderErr: "#ef4444",
  borderOk: "#22c55e",
  label: "rgba(167,139,250,0.90)",
  text: "#ffffff",
  textSub: "rgba(255,255,255,0.55)",
  textMuted: "rgba(255,255,255,0.38)",
  inputBg: "rgba(255,255,255,0.04)",
  accent: "#8b5cf6",
  red: "#ef4444",
  redBg: "rgba(239,68,68,0.10)",
  btnBg: "#7c3aed",
  closeBg: "rgba(255,255,255,0.07)",
};

const LIGHT = {
  overlay: "rgba(0,0,0,0.55)",
  bg: "#ffffff",
  border: "rgba(139,92,246,0.25)",
  borderErr: "#ef4444",
  borderOk: "#22c55e",
  label: "#7c3aed",
  text: "#111827",
  textSub: "#6b7280",
  textMuted: "#9ca3af",
  inputBg: "#f8f9fa",
  accent: "#7c3aed",
  red: "#ef4444",
  redBg: "rgba(239,68,68,0.08)",
  btnBg: "#7c3aed",
  closeBg: "rgba(0,0,0,0.06)",
};

export default function CambiarPasswordModal({
  visible,
  onClose,
  theme = "dark",
}: Props) {
  const C = theme === "light" ? LIGHT : DARK;

  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const [errCurrent, setErrCurrent] = useState("");
  const [errNew, setErrNew] = useState("");
  const [errConfirm, setErrConfirm] = useState("");

  const reset = () => {
    setCurrentPass("");
    setNewPass("");
    setConfirmPass("");
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setErrCurrent("");
    setErrNew("");
    setErrConfirm("");
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const validate = () => {
    let ok = true;
    setErrCurrent("");
    setErrNew("");
    setErrConfirm("");

    if (!currentPass) {
      setErrCurrent("Ingresa tu contraseña actual.");
      ok = false;
    }
    if (!newPass) {
      setErrNew("Ingresa la nueva contraseña.");
      ok = false;
    } else if (!esPassword(newPass)) {
      setErrNew(
        "Mínimo 8 caracteres, una mayúscula y un número.",
      );
      ok = false;
    }
    if (!confirmPass) {
      setErrConfirm("Confirma la nueva contraseña.");
      ok = false;
    } else if (newPass && confirmPass && newPass !== confirmPass) {
      setErrConfirm("Las contraseñas no coinciden.");
      ok = false;
    }
    return ok;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      // Re-authenticate with current password to verify it
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("No se pudo obtener el usuario.");

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPass,
      });
      if (signInError) {
        setErrCurrent("Contraseña actual incorrecta.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPass,
      });
      if (updateError) throw updateError;

      Alert.alert("Éxito", "Tu contraseña se actualizó correctamente.");
      handleClose();
    } catch (err: any) {
      Alert.alert(
        "Error",
        err?.message ?? "No se pudo actualizar la contraseña.",
      );
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
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: C.text }]}>
              Cambiar contraseña
            </Text>
            <TouchableOpacity
              onPress={handleClose}
              style={[styles.closeBtn, { backgroundColor: C.closeBg }]}
              accessibilityLabel="Cerrar"
            >
              <Ionicons name="close" size={18} color={C.text} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.sub, { color: C.textSub }]}>
            Ingresa tu contraseña actual y la nueva contraseña.
          </Text>

          {/* Current password */}
          <PasswordField
            label="Contraseña actual"
            value={currentPass}
            onChangeText={(t) => { setCurrentPass(t); setErrCurrent(""); }}
            show={showCurrent}
            onToggleShow={() => setShowCurrent((v) => !v)}
            error={errCurrent}
            C={C}
            placeholder="Contraseña actual"
          />

          {/* New password */}
          <PasswordField
            label="Nueva contraseña"
            value={newPass}
            onChangeText={(t) => { setNewPass(t); setErrNew(""); }}
            show={showNew}
            onToggleShow={() => setShowNew((v) => !v)}
            error={errNew}
            C={C}
            placeholder="Mínimo 8 caracteres, mayúscula y número"
          />

          {/* Confirm password */}
          <PasswordField
            label="Confirmar contraseña"
            value={confirmPass}
            onChangeText={(t) => { setConfirmPass(t); setErrConfirm(""); }}
            show={showConfirm}
            onToggleShow={() => setShowConfirm((v) => !v)}
            error={errConfirm}
            C={C}
            placeholder="Repite la nueva contraseña"
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btnOutline, { borderColor: C.border }]}
              onPress={handleClose}
              disabled={loading}
            >
              <Text style={[styles.btnOutlineText, { color: C.text }]}>
                Cancelar
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: C.btnBg }, loading && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.btnPrimaryText}>Guardar</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Internal helper ────────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  show: boolean;
  onToggleShow: () => void;
  error: string;
  C: typeof DARK;
  placeholder: string;
  returnKeyType?: "done" | "next";
  onSubmitEditing?: () => void;
}

function PasswordField({
  label,
  value,
  onChangeText,
  show,
  onToggleShow,
  error,
  C,
  placeholder,
  returnKeyType,
  onSubmitEditing,
}: FieldProps) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, { color: C.label }]}>{label}</Text>
      <View style={styles.passRow}>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: C.inputBg,
              borderColor: error ? C.borderErr : C.border,
              color: C.text,
            },
            styles.inputInner,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.textMuted}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoComplete="password"
          returnKeyType={returnKeyType ?? "next"}
          onSubmitEditing={onSubmitEditing}
          selectionColor="#8b5cf6"
        />
        <TouchableOpacity
          style={[
            styles.eyeBtn,
            { backgroundColor: C.inputBg, borderColor: error ? C.borderErr : C.border },
          ]}
          onPress={onToggleShow}
          accessibilityLabel={show ? "Ocultar contraseña" : "Mostrar contraseña"}
        >
          <Ionicons
            name={show ? "eye-off-outline" : "eye-outline"}
            size={18}
            color={C.textMuted}
          />
        </TouchableOpacity>
      </View>
      {!!error && (
        <Text style={[styles.fieldError, { color: C.red }]}>{error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: { fontSize: 18, fontWeight: "700" },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  sub: { fontSize: 13, marginBottom: 20, lineHeight: 18 },

  fieldGroup: { marginBottom: 16 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  passRow: { flexDirection: "row" },
  input: {
    height: 48,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  inputInner: {
    flex: 1,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  eyeBtn: {
    width: 44,
    height: 48,
    borderWidth: 1.5,
    borderLeftWidth: 0,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldError: { fontSize: 11, marginTop: 4 },

  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  btnOutline: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btnOutlineText: { fontSize: 14, fontWeight: "600" },
  btnPrimary: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: { fontSize: 14, fontWeight: "600", color: "#ffffff" },
});
