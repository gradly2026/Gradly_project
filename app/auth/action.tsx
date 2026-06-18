import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  applyActionCode,
  confirmPasswordReset,
  isSignInWithEmailLink,
  signInWithEmailLink,
  verifyPasswordResetCode,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { auth, db } from "../../src/config/firebaseConfig";
import type { UserRole } from "../../src/context/AuthContext";
import { CORREO_TEMPORAL_KEY } from "../../src/services/authService";

// ══════════════════════════════════════════════════════════════════
//  Design tokens (modo oscuro) — alineados con iniciosesion.tsx
// ══════════════════════════════════════════════════════════════════
const C = {
  bg: "#07050f",
  surface: "#0d0b1e",
  accent: "#8b5cf6",
  accent70: "rgba(167,139,250,1)",
  text: "#ffffff",
  textSub: "rgba(255,255,255,0.65)",
  textMuted: "rgba(255,255,255,0.38)",
  border: "rgba(139,92,246,0.22)",
  red: "#ef4444",
  redBg: "rgba(239,68,68,0.10)",
  redBorder: "rgba(239,68,68,0.35)",
  green: "#22c55e",
};

// ── Modos de acción que envía Firebase en el parámetro `mode` ──────
type Mode = "resetPassword" | "signIn" | "verifyEmail" | "recoverEmail";

// ── Fases internas de la pantalla ─────────────────────────────────
type Phase =
  | "loading" // verificando el código / la URL
  | "resetForm" // pidiendo la nueva contraseña
  | "needEmail" // magic link abierto sin correo en almacenamiento
  | "success" // acción completada con éxito
  | "error"; // código inválido / expirado u otro fallo

// ══════════════════════════════════════════════════════════════════
//  Helpers
// ══════════════════════════════════════════════════════════════════
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(v.trim());

function mapActionError(code: string): string {
  if (code.includes("expired-action-code"))
    return "El enlace ha expirado. Solicita uno nuevo.";
  if (code.includes("invalid-action-code"))
    return "El enlace no es válido o ya fue utilizado.";
  if (code.includes("weak-password"))
    return "La contraseña es muy débil (mínimo 6 caracteres).";
  if (code.includes("user-disabled"))
    return "Esta cuenta ha sido deshabilitada.";
  if (code.includes("user-not-found"))
    return "No existe una cuenta asociada a este enlace.";
  if (code.includes("network-request-failed"))
    return "Sin conexión. Verifica tu internet.";
  return "No se pudo completar la acción. Intenta de nuevo.";
}

function routeForRole(rol: UserRole | null): string {
  switch (rol) {
    case "admin":
      return "/dashboard-admin";
    case "universidad":
      return "/dashboard-universidad";
    case "empresa":
      return "/dashboard-empresa";
    case "estudiante":
    default:
      return "/(tabs)";
  }
}

// La URL completa solo está disponible directamente en web. En nativo el
// enlace lo intercepta `iniciosesion` vía expo-linking; esta pantalla se usa
// sobre todo para el flujo web (los correos de reseteo abren el navegador).
function currentUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.location?.href ?? "";
  }
  return "";
}

// ══════════════════════════════════════════════════════════════════
//  COMPONENTE
// ══════════════════════════════════════════════════════════════════
export default function AuthAction() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    mode?: string;
    oobCode?: string;
    apiKey?: string;
    continueUrl?: string;
    lang?: string;
  }>();

  const mode = params.mode as Mode | undefined;
  const oobCode = typeof params.oobCode === "string" ? params.oobCode : "";

  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Datos del usuario afectado (mostrado en confirmaciones).
  const [accountEmail, setAccountEmail] = useState("");

  // Formulario de nueva contraseña.
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Magic link sin correo en almacenamiento → pedirlo.
  const [promptEmail, setPromptEmail] = useState("");
  const [promptError, setPromptError] = useState("");

  // Evita procesar dos veces (StrictMode / doble render).
  const handledRef = useRef(false);

  // ── Completar inicio de sesión con enlace mágico ──────────────────
  const completeSignIn = useCallback(
    async (correo: string) => {
      setPhase("loading");
      try {
        const url = currentUrl();
        const result = await signInWithEmailLink(auth, correo, url);
        await AsyncStorage.removeItem(CORREO_TEMPORAL_KEY);

        let rol: UserRole | null = null;
        try {
          const snap = await getDoc(doc(db, "usuarios", result.user.uid));
          rol = snap.exists() ? (snap.data()?.rol as UserRole) : null;
        } catch {
          rol = null;
        }
        router.replace(routeForRole(rol) as any);
      } catch (err: any) {
        setErrorMsg(mapActionError(err?.code ?? ""));
        setPhase("error");
      }
    },
    [router],
  );

  // ── Despacho inicial según el `mode` ──────────────────────────────
  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    (async () => {
      // resetPassword / verifyEmail / recoverEmail requieren oobCode.
      if (mode !== "signIn" && !oobCode) {
        setErrorMsg("Enlace incompleto. Falta el código de la acción.");
        setPhase("error");
        return;
      }

      try {
        switch (mode) {
          case "resetPassword": {
            // Valida el código y obtiene el correo asociado antes del formulario.
            const correo = await verifyPasswordResetCode(auth, oobCode);
            setAccountEmail(correo);
            setPhase("resetForm");
            return;
          }

          case "verifyEmail": {
            await applyActionCode(auth, oobCode);
            setSuccessMsg("Tu correo ha sido verificado correctamente.");
            setPhase("success");
            return;
          }

          case "recoverEmail": {
            await applyActionCode(auth, oobCode);
            setSuccessMsg("Se restauró tu correo electrónico anterior.");
            setPhase("success");
            return;
          }

          case "signIn": {
            const url = currentUrl();
            if (!url || !isSignInWithEmailLink(auth, url)) {
              setErrorMsg(
                "Este enlace de acceso no es válido o ya expiró. Solicita uno nuevo.",
              );
              setPhase("error");
              return;
            }
            const stored = (
              await AsyncStorage.getItem(CORREO_TEMPORAL_KEY)
            )?.trim();
            if (stored) {
              await completeSignIn(stored.toLowerCase());
            } else {
              // Abierto en otro dispositivo: pedir el correo de nuevo.
              setPhase("needEmail");
            }
            return;
          }

          default:
            setErrorMsg("Acción desconocida o no soportada.");
            setPhase("error");
        }
      } catch (err: any) {
        setErrorMsg(mapActionError(err?.code ?? ""));
        setPhase("error");
      }
    })();
  }, [mode, oobCode, completeSignIn]);

  // ── Confirmar nueva contraseña ────────────────────────────────────
  const handleConfirmReset = async () => {
    setFormError("");
    if (password.length < 6) {
      setFormError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== password2) {
      setFormError("Las contraseñas no coinciden.");
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      setSuccessMsg(
        "Tu contraseña fue actualizada. Ya puedes iniciar sesión con ella.",
      );
      setPhase("success");
    } catch (err: any) {
      setFormError(mapActionError(err?.code ?? ""));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Confirmar correo del magic link (fallback) ────────────────────
  const handleConfirmEmail = () => {
    const correo = promptEmail.trim().toLowerCase();
    if (!isEmail(correo)) {
      setPromptError("Ingresa un correo válido.");
      return;
    }
    completeSignIn(correo);
  };

  const goToLogin = () => router.replace("/auth/iniciosesion" as any);

  // ══════════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════════
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.card}>
        {/* ─── Cargando ─── */}
        {phase === "loading" && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={C.accent} />
            <Text style={styles.loadingText}>Verificando tu enlace…</Text>
          </View>
        )}

        {/* ─── Formulario de nueva contraseña ─── */}
        {phase === "resetForm" && (
          <View>
            <View style={styles.iconWrap}>
              <Ionicons name="lock-closed-outline" size={30} color={C.accent70} />
            </View>
            <Text style={styles.title}>Nueva contraseña</Text>
            <Text style={styles.sub}>
              Define una nueva contraseña para{" "}
              <Text style={styles.emphasis}>{accountEmail}</Text>.
            </Text>

            <View style={styles.group}>
              <Text style={styles.label}>Nueva contraseña</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, styles.inputPassInner]}
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t);
                    setFormError("");
                  }}
                  placeholder="Mínimo 6 caracteres"
                  placeholderTextColor={C.textMuted}
                  secureTextEntry={!showPass}
                  autoCapitalize="none"
                  selectionColor={C.accent}
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowPass((v) => !v)}
                  accessibilityLabel={
                    showPass ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                >
                  <Ionicons
                    name={showPass ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={C.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.group}>
              <Text style={styles.label}>Confirmar contraseña</Text>
              <TextInput
                style={styles.input}
                value={password2}
                onChangeText={(t) => {
                  setPassword2(t);
                  setFormError("");
                }}
                placeholder="Repite la contraseña"
                placeholderTextColor={C.textMuted}
                secureTextEntry={!showPass}
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={handleConfirmReset}
                selectionColor={C.accent}
              />
            </View>

            {!!formError && <Text style={styles.fieldError}>{formError}</Text>}

            <TouchableOpacity
              style={[styles.btnPrimary, submitting && { opacity: 0.6 }]}
              onPress={handleConfirmReset}
              disabled={submitting}
            >
              {submitting ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={C.text} />
                  <Text style={[styles.btnPrimaryText, { marginLeft: 10 }]}>
                    Guardando…
                  </Text>
                </View>
              ) : (
                <Text style={styles.btnPrimaryText}>Guardar contraseña</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ─── Magic link sin correo (fallback) ─── */}
        {phase === "needEmail" && (
          <View>
            <View style={styles.iconWrap}>
              <Ionicons name="mail-unread-outline" size={30} color={C.accent70} />
            </View>
            <Text style={styles.title}>Confirma tu correo</Text>
            <Text style={styles.sub}>
              Abriste el enlace en un dispositivo distinto. Ingresa el correo con
              el que solicitaste el acceso para continuar.
            </Text>

            <View style={styles.group}>
              <Text style={styles.label}>Correo electrónico</Text>
              <TextInput
                style={[styles.input, !!promptError && styles.inputErr]}
                value={promptEmail}
                onChangeText={(t) => {
                  setPromptEmail(t);
                  setPromptError("");
                }}
                placeholder="correo@ejemplo.com"
                placeholderTextColor={C.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                returnKeyType="done"
                onSubmitEditing={handleConfirmEmail}
                selectionColor={C.accent}
              />
              {!!promptError && (
                <Text style={styles.fieldError}>{promptError}</Text>
              )}
            </View>

            <TouchableOpacity style={styles.btnPrimary} onPress={handleConfirmEmail}>
              <Text style={styles.btnPrimaryText}>Completar acceso</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ─── Éxito ─── */}
        {phase === "success" && (
          <View>
            <View style={[styles.iconWrap, styles.iconWrapOk]}>
              <Ionicons name="checkmark-circle-outline" size={34} color={C.green} />
            </View>
            <Text style={styles.title}>¡Listo!</Text>
            <Text style={styles.sub}>{successMsg}</Text>
            <TouchableOpacity style={styles.btnPrimary} onPress={goToLogin}>
              <Text style={styles.btnPrimaryText}>Ir a iniciar sesión</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ─── Error ─── */}
        {phase === "error" && (
          <View>
            <View style={[styles.iconWrap, styles.iconWrapErr]}>
              <Ionicons name="alert-circle-outline" size={34} color={C.red} />
            </View>
            <Text style={styles.title}>Enlace no válido</Text>
            <Text style={styles.sub}>{errorMsg}</Text>
            <TouchableOpacity style={styles.btnPrimary} onPress={goToLogin}>
              <Text style={styles.btnPrimaryText}>Volver al inicio</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════
//  Estilos
// ══════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: C.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 28,
  },
  centered: { alignItems: "center", justifyContent: "center", gap: 16, paddingVertical: 24 },
  loadingText: { color: C.textSub, fontSize: 15 },

  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(139,92,246,0.12)",
    borderWidth: 2,
    borderColor: "rgba(139,92,246,0.45)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 22,
  },
  iconWrapOk: {
    backgroundColor: "rgba(34,197,94,0.12)",
    borderColor: "rgba(34,197,94,0.45)",
  },
  iconWrapErr: {
    backgroundColor: C.redBg,
    borderColor: C.redBorder,
  },

  title: {
    fontSize: 26,
    fontWeight: "700",
    color: C.text,
    marginBottom: 6,
    textAlign: "center",
  },
  sub: {
    fontSize: 14,
    color: C.textSub,
    marginBottom: 28,
    lineHeight: 20,
    textAlign: "center",
  },
  emphasis: { color: C.accent70, fontWeight: "700" },

  group: { marginBottom: 18 },
  label: {
    fontSize: 11,
    color: "rgba(167,139,250,0.90)",
    marginBottom: 6,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  input: {
    height: 52,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.30)",
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 14,
    color: C.text,
  },
  inputErr: { borderColor: C.red },
  inputPassInner: { flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0 },
  passwordRow: { flexDirection: "row", alignItems: "stretch" },
  eyeBtn: {
    width: 44,
    height: 52,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: "rgba(139,92,246,0.30)",
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldError: { fontSize: 13, color: C.red, marginBottom: 14 },

  btnPrimary: {
    height: 48,
    backgroundColor: "#7c3aed",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  loadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  btnPrimaryText: { fontSize: 14, fontWeight: "600", color: C.text },
});
