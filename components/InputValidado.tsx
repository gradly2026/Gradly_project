import React from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";

// ── Paletas ───────────────────────────────────────────────────────────────────

const DARK = {
  label: "rgba(167,139,250,0.90)",
  bg: "rgba(255,255,255,0.04)",
  border: "rgba(139,92,246,0.30)",
  borderOk: "#22c55e",
  borderErr: "#ef4444",
  text: "#ffffff",
  placeholder: "rgba(255,255,255,0.38)",
  error: "#ef4444",
};

const LIGHT = {
  label: "#7c3aed",
  bg: "#f8f9fa",
  border: "rgba(139,92,246,0.25)",
  borderOk: "#22c55e",
  borderErr: "#ef4444",
  text: "#111827",
  placeholder: "#9ca3af",
  error: "#ef4444",
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface InputValidadoProps extends TextInputProps {
  /** El campo ya fue tocado/modificado por el usuario */
  dirty?: boolean;
  /** true = válido (borde verde), false = inválido (borde rojo) */
  isValid?: boolean;
  label?: string;
  errorMsg?: string;
  containerStyle?: ViewStyle;
  /** 'dark' por defecto */
  theme?: "dark" | "light";
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function InputValidado({
  label,
  errorMsg,
  dirty = false,
  isValid,
  containerStyle,
  style,
  theme = "dark",
  ...props
}: InputValidadoProps) {
  const C = theme === "light" ? LIGHT : DARK;

  const borderColor =
    dirty && isValid !== undefined
      ? isValid
        ? C.borderOk
        : C.borderErr
      : C.border;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text style={[styles.label, { color: C.label }]}>{label}</Text>
      ) : null}
      <TextInput
        placeholderTextColor={C.placeholder}
        selectionColor="#8b5cf6"
        {...props}
        style={[
          styles.input,
          { backgroundColor: C.bg, borderColor, color: C.text },
          style,
        ]}
      />
      {dirty && !isValid && errorMsg ? (
        <Text style={[styles.error, { color: C.error }]}>{errorMsg}</Text>
      ) : null}
    </View>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: {
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  input: {
    height: 52,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  error: {
    fontSize: 11,
    marginTop: 4,
  },
});
