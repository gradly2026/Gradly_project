import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  isSignInWithEmailLink,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signOut,
} from "firebase/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { AutoText as Text, AutoTextInput as TextInput } from "../../src/components/AutoText";

import AppHeader from "../../components/AppHeader";
import { useTranslation } from "../../src/context/TranslationContext";
import { auth } from "../../src/config/firebaseConfig";
import { useTheme, type GradlyColors } from "../../src/context/ThemeContext";
import { CORREO_TEMPORAL_KEY } from "../../src/services/authService";
import { consultarEstadoAcceso, solicitarOtp, verificarOtpYEntrar } from "../../src/services/otpService";
import {
  obtenerRolConReintento,
  rutaPorRol,
  verificarBloqueoCuenta,
  type BloqueoCuenta,
} from "../../src/utils/roleRouting";

// ══════════════════════════════════════════════════════════════════
//  Design tokens — derivados del tema activo (claro / oscuro)
//  Mantiene los mismos nombres de token que usaba la paleta fija, pero
//  ahora se alimentan de useTheme().colors para que TODA la pantalla
//  (fondo, tarjetas, textos, inputs) cambie con el modo claro/oscuro.
// ══════════════════════════════════════════════════════════════════
const makeC = (colors: GradlyColors) => ({
  bg: colors.backgroundDark, // fondo principal (claro en light, oscuro en dark)
  surface: colors.backgroundCard, // paneles / tarjetas
  accent: colors.primary,
  accent70: colors.primaryLight,
  accent40: colors.primary35,
  accent20: colors.primary12,
  text: colors.textPrimary,
  textSub: colors.white60,
  textMuted: colors.textMuted,
  border: colors.border,
  inputBg: colors.white4,
  inputBorder: colors.primary35,
  red: colors.error,
  redBg: "rgba(239,68,68,0.10)",
  redBorder: "rgba(239,68,68,0.35)",
  green: colors.success,
  greenBg: "rgba(34,197,94,0.15)",
});

type Tokens = ReturnType<typeof makeC>;

const CAROUSEL_IMAGES = [
  "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=700&q=80",
  "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=700&q=80",
  "https://images.unsplash.com/photo-1517077304055-6e89abbf09b0?w=700&q=80",
  "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=700&q=80",
  "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=700&q=80",
  "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=700&q=80",
];

// Claves de bullets del panel izquierdo (se traducen al renderizar).
const BULLET_KEYS = ["login_bullet_1", "login_bullet_2", "login_bullet_3"];

type Step = "credentials" | "magic-link" | "reset-request" | "otp";

// ══════════════════════════════════════════════════════════════════
//  Helpers
// ══════════════════════════════════════════════════════════════════
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(v.trim());

/** Devuelve la CLAVE de traducción del error; tradúcela con t(...) en el punto de uso. */
function mapFirebaseError(code: string): string {
  if (code.includes("wrong-password") || code.includes("invalid-credential"))
    return "fb_wrong_password";
  if (code.includes("user-not-found")) return "fb_user_not_found";
  if (code.includes("too-many-requests")) return "fb_too_many_requests";
  if (code.includes("network-request-failed")) return "fb_network_error";
  if (code.includes("user-disabled")) return "fb_user_disabled";
  if (code.includes("invalid-email")) return "fb_invalid_email";
  return "fb_login_error";
}

/**
 * Mapea los `HttpsError.code` de las Cloud Functions de OTP a CLAVES de
 * traducción. Los códigos llegan como "functions/<code>" (p. ej.
 * "functions/deadline-exceeded"), por eso usamos includes().
 */
function mapOtpError(code: string): string {
  if (code.includes("deadline-exceeded")) return "otp_expirado";
  if (code.includes("permission-denied")) return "otp_incorrecto";
  if (code.includes("not-found")) return "otp_expirado";
  if (code.includes("resource-exhausted")) return "otp_espera";
  if (code.includes("invalid-argument")) return "val_email_invalido";
  if (code.includes("unavailable") || code.includes("network"))
    return "fb_network_error";
  return "fb_login_error";
}

// ══════════════════════════════════════════════════════════════════
//  COMPONENTE
// ══════════════════════════════════════════════════════════════════
export default function InicioSesion() {
  const router = useRouter();

  // Tema dinámico: tokens + estilos memorizados que reaccionan a claro/oscuro.
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const C = useMemo(() => makeC(colors), [colors]);
  const styles = useMemo(() => makeStyles(C), [C]);

  // Layout responsive: en web de escritorio (ancho grande) mostramos los dos
  // paneles lado a lado dentro de una "tarjeta"; en móvil se apilan.
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === "web" && width >= 1100;

  const [step, setStep] = useState<Step>("credentials");

  // ── Credenciales (login con contraseña) ──
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passError, setPassError] = useState("");
  const [globalError, setGlobalError] = useState("");
  const [loading, setLoading] = useState(false);

  // ── Acceso sin contraseña con código OTP ──
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCodigo, setOtpCodigo] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);

  // ── Recuperación de contraseña por código OTP + nueva contraseña ──
  const [resetEmail, setResetEmail] = useState("");
  const [resetCodigo, setResetCodigo] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetVerifying, setResetVerifying] = useState(false);

  // ── Estado mientras se completa el enlace entrante ──
  const [completingLink, setCompletingLink] = useState(false);

  // ── Cuenta baneada/inactiva: bloquea el acceso tras un login exitoso ──
  const [bloqueoCuenta, setBloqueoCuenta] = useState<BloqueoCuenta | null>(null);

  // Firebase Auth rechaza de entrada una cuenta con disabled:true (código
  // auth/user-disabled) — ANTES de que lleguemos a verificarBloqueoCuenta,
  // porque en ese punto el login falló y no hay sesión para leer Firestore.
  // Esto intercepta ESE caso puntual: si el error es por cuenta deshabilitada,
  // consulta el motivo (vía Cloud Function, no requiere sesión) y muestra el
  // modal enriquecido en vez del error genérico. Devuelve true si lo mostró.
  const manejarPosibleBloqueo = useCallback(async (err: any, correo: string): Promise<boolean> => {
    if (!String(err?.code ?? "").includes("user-disabled")) return false;
    const bloqueo = await consultarEstadoAcceso(correo);
    if (!bloqueo) return false;
    setBloqueoCuenta(bloqueo);
    return true;
  }, []);

  // ── Fallback: pedir correo si no está en AsyncStorage ──
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [showEmailPrompt, setShowEmailPrompt] = useState(false);
  const [promptEmail, setPromptEmail] = useState("");
  const [promptError, setPromptError] = useState("");

  // ── Carrusel ──
  const [carouselIndex, setCarouselIndex] = useState(0);
  const carouselTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCarousel = useCallback(() => {
    if (carouselTimerRef.current) clearInterval(carouselTimerRef.current);
    carouselTimerRef.current = setInterval(() => {
      setCarouselIndex((prev) => (prev + 1) % CAROUSEL_IMAGES.length);
    }, 5000);
  }, []);

  useEffect(() => {
    startCarousel();
    return () => {
      if (carouselTimerRef.current) clearInterval(carouselTimerRef.current);
    };
  }, [startCarousel]);

  // ══════════════════════════════════════════════════════════════
  //  Completa el inicio de sesión con el enlace mágico.
  //  Tras éxito: lee el rol en usuarios/{uid} (con reintentos) + router.replace con
  //  fallback de navegación manual de seguridad.
  // ══════════════════════════════════════════════════════════════
  const completeSignIn = useCallback(
    async (correo: string, url: string) => {
      setCompletingLink(true);
      try {
        const result = await signInWithEmailLink(auth, correo, url);
        await AsyncStorage.removeItem(CORREO_TEMPORAL_KEY);

        // Obtener el rol desde Firestore con reintentos (carrera token/replicación).
        const rol = await obtenerRolConReintento(result.user.uid);
        const ruta = rutaPorRol(rol);

        // Rol indeterminado → NO degradar a estudiante: avisamos al usuario.
        if (!ruta) {
          Alert.alert(t('login_perfil_error_titulo'), t('login_perfil_error_msg'));
          return;
        }

        const bloqueo = await verificarBloqueoCuenta(result.user.uid);
        if (bloqueo) {
          await signOut(auth);
          setBloqueoCuenta(bloqueo);
          return;
        }

        // Navegación principal…
        try {
          router.replace(ruta as any);
        } catch {
          /* se reintenta abajo */
        }
        // …y fallback de seguridad por si replace no surte efecto (web/edge).
        setTimeout(() => {
          try {
            router.replace(ruta as any);
          } catch {
            /* no-op */
          }
        }, 500);
      } catch (err: any) {
        if (await manejarPosibleBloqueo(err, correo)) return;
        Alert.alert(
          t('login_enlace_invalido_titulo'),
          t(mapFirebaseError(err?.code ?? "")) + "\n\n" + t('login_enlace_expirado'),
        );
      } finally {
        setCompletingLink(false);
      }
    },
    [router, t, manejarPosibleBloqueo],
  );

  // ══════════════════════════════════════════════════════════════
  //  Interceptar el enlace mágico entrante (cold + warm start + web)
  // ══════════════════════════════════════════════════════════════
  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      if (!url || !isSignInWithEmailLink(auth, url)) return;

      const stored = await AsyncStorage.getItem(CORREO_TEMPORAL_KEY);
      if (stored && stored.trim()) {
        await completeSignIn(stored.trim().toLowerCase(), url);
        return;
      }

      // Fallback inmediato: correo nulo/vacío → modal para confirmarlo.
      setPendingUrl(url);
      setPromptEmail("");
      setPromptError("");
      setShowEmailPrompt(true);
    };

    // Web: el enlace llega como la URL de la página actual.
    if (
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      window.location?.href
    ) {
      handleUrl(window.location.href);
    }

    // Cold start nativo: app abierta directamente desde el enlace.
    Linking.getInitialURL().then(handleUrl);

    // Warm start: app ya abierta cuando llega el enlace.
    const sub = Linking.addEventListener("url", (event) => handleUrl(event.url));
    return () => sub.remove();
  }, [completeSignIn]);

  // Confirmar correo desde el modal de fallback.
  const handleConfirmEmailPrompt = () => {
    const correo = promptEmail.trim().toLowerCase();
    if (!isEmail(correo)) {
      setPromptError(t('val_email_invalido'));
      return;
    }
    if (!pendingUrl) {
      setShowEmailPrompt(false);
      return;
    }
    setShowEmailPrompt(false);
    completeSignIn(correo, pendingUrl);
  };

  // ══════════════════════════════════════════════════════════════
  //  Login con correo + contraseña
  // ══════════════════════════════════════════════════════════════
  const handleLogin = async () => {
    setGlobalError("");
    setEmailError("");
    setPassError("");

    let ok = true;
    if (!email.trim()) {
      setEmailError(t('val_email_requerido'));
      ok = false;
    } else if (!isEmail(email)) {
      setEmailError(t('val_email_invalido'));
      ok = false;
    }
    if (!password) {
      setPassError(t('val_password_requerido'));
      ok = false;
    }
    if (!ok) return;

    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password,
      );
      // Espera OBLIGATORIA del rol (con reintentos) ANTES de navegar.
      const rol = await obtenerRolConReintento(cred.user.uid);
      const ruta = rutaPorRol(rol);

      // Rol indeterminado → NO caer a /(tabs): mostramos error y dejamos
      // al usuario en la pantalla de login para reintentar.
      if (!ruta) {
        setGlobalError(t('login_rol_error'));
        return;
      }

      const bloqueo = await verificarBloqueoCuenta(cred.user.uid);
      if (bloqueo) {
        await signOut(auth);
        setBloqueoCuenta(bloqueo);
        return;
      }

      router.replace(ruta as any);
    } catch (err: any) {
      if (await manejarPosibleBloqueo(err, email)) return;
      setGlobalError(t(mapFirebaseError(err?.code ?? "")));
    } finally {
      setLoading(false);
    }
  };

  // ══════════════════════════════════════════════════════════════
  //  Recuperar contraseña por código OTP + nueva contraseña
  //  1) Pide el código → solicitarOtp (mismo backend que el login).
  //  2) Verifica el código + envía la nueva contraseña → el backend la
  //     actualiza con el Admin SDK y deja la sesión iniciada → dashboard.
  // ══════════════════════════════════════════════════════════════
  const handleSolicitarReset = async () => {
    setResetError("");
    const correo = resetEmail.trim().toLowerCase();
    if (!correo) {
      setResetError(t('val_email_requerido'));
      return;
    }
    if (!isEmail(correo)) {
      setResetError(t('val_email_invalido'));
      return;
    }

    setResetLoading(true);
    try {
      await solicitarOtp(correo);
      setResetSent(true);
      setResetCodigo("");
      setResetPassword("");
    } catch (err: any) {
      setResetError(t(mapOtpError(err?.code ?? "")));
    } finally {
      setResetLoading(false);
    }
  };

  const handleVerificarReset = async () => {
    setResetError("");
    const codigo = resetCodigo.trim();
    if (codigo.length !== 8 || !/^\d{8}$/.test(codigo)) {
      setResetError(t('otp_8_digitos'));
      return;
    }
    if (resetPassword.length < 6) {
      setResetError(t('reset_password_corta'));
      return;
    }

    setResetVerifying(true);
    try {
      // Verifica el código, cambia la contraseña e inicia la sesión real.
      const uid = await verificarOtpYEntrar(resetEmail, codigo, resetPassword);

      // Mismo flujo de rol/ruta que handleLogin.
      const rol = await obtenerRolConReintento(uid);
      const ruta = rutaPorRol(rol);
      if (!ruta) {
        setResetError(t('login_rol_error'));
        return;
      }

      const bloqueo = await verificarBloqueoCuenta(uid);
      if (bloqueo) {
        await signOut(auth);
        setBloqueoCuenta(bloqueo);
        return;
      }

      router.replace(ruta as any);
    } catch (err: any) {
      if (await manejarPosibleBloqueo(err, resetEmail)) return;
      setResetError(t(mapOtpError(err?.code ?? "")));
    } finally {
      setResetVerifying(false);
    }
  };

  // ══════════════════════════════════════════════════════════════
  //  Acceso sin contraseña con código OTP de 8 dígitos
  //  1) Pide el código  → solicitarOtp  → muestra el campo del código.
  //  2) Verifica + entra → verificarOtpYEntrar inicia la sesión REAL,
  //     y a partir de ahí seguimos el MISMO flujo de rol/ruta que handleLogin.
  // ══════════════════════════════════════════════════════════════
  const handleSolicitarOtp = async () => {
    setOtpError("");
    const correo = otpEmail.trim().toLowerCase();
    if (!correo) {
      setOtpError(t('val_email_requerido'));
      return;
    }
    if (!isEmail(correo)) {
      setOtpError(t('val_email_invalido'));
      return;
    }

    setOtpLoading(true);
    try {
      await solicitarOtp(correo);
      setOtpSent(true);
      setOtpCodigo("");
    } catch (err: any) {
      setOtpError(t(mapOtpError(err?.code ?? "")));
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerificarOtp = async () => {
    setOtpError("");
    const codigo = otpCodigo.trim();
    if (codigo.length !== 8 || !/^\d{8}$/.test(codigo)) {
      setOtpError(t('otp_8_digitos'));
      return;
    }

    setOtpVerifying(true);
    try {
      // Inicia la sesión real de Firebase Auth con el custom token.
      const uid = await verificarOtpYEntrar(otpEmail, codigo);

      // A partir de aquí, idéntico a handleLogin: rol (con reintentos) → ruta.
      const rol = await obtenerRolConReintento(uid);
      const ruta = rutaPorRol(rol);
      if (!ruta) {
        setOtpError(t('login_rol_error'));
        return;
      }

      const bloqueo = await verificarBloqueoCuenta(uid);
      if (bloqueo) {
        await signOut(auth);
        setBloqueoCuenta(bloqueo);
        return;
      }

      router.replace(ruta as any);
    } catch (err: any) {
      if (await manejarPosibleBloqueo(err, otpEmail)) return;
      setOtpError(t(mapOtpError(err?.code ?? "")));
    } finally {
      setOtpVerifying(false);
    }
  };

  const switchToReset = () => {
    setStep("reset-request");
    setGlobalError("");
    setResetError("");
    setResetSent(false);
    setResetCodigo("");
    setResetPassword("");
    setResetEmail(email.trim());
  };
  const switchToOtp = () => {
    setStep("otp");
    setGlobalError("");
    setOtpError("");
    setOtpSent(false);
    setOtpCodigo("");
    setOtpEmail(email.trim());
  };
  const switchToLogin = () => {
    setStep("credentials");
    setResetError("");
    setOtpError("");
  };

  // ══════════════════════════════════════════════════════════════
  //  Pantalla de "completando enlace"
  // ══════════════════════════════════════════════════════════════
  if (completingLink) {
    return (
      <View style={[styles.root, styles.centered]}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <ActivityIndicator size="large" color={C.accent} />
        <Text style={styles.completingText}>{t('login_verificando_enlace')}</Text>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════
  //  Render
  // ══════════════════════════════════════════════════════════════
  return (
    <View style={styles.root}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <AppHeader />

      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            isDesktopWeb && styles.scrollContentDesktop,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Contenedor responsive: centra y limita el ancho en pantallas anchas/web */}
          <View
            style={[
              styles.authShell,
              isDesktopWeb && styles.authShellDesktop,
            ]}
          >
          {/* ══ PANEL IZQUIERDO — marca + bullets + carrusel ══ */}
          <View style={[styles.leftPanel, isDesktopWeb && styles.leftPanelDesktop]}>
            <View style={styles.brand}>
              <Image
                source={require("../../assets/images/LogoGradly.png")}
                style={styles.brandLogo}
                resizeMode="contain"
              />
              <Text style={styles.brandName}>Gradly</Text>
            </View>

            <Text style={styles.slogan}>{t('login_slogan')}</Text>

            <View style={styles.bullets}>
              {BULLET_KEYS.map((k) => (
                <View key={k} style={styles.bulletRow}>
                  <View style={styles.bulletCheck}>
                    <Text style={styles.bulletCheckText}>✓</Text>
                  </View>
                  <Text style={styles.bulletText}>{t(k)}</Text>
                </View>
              ))}
            </View>

            <View style={styles.carousel}>
              <Image
                source={{ uri: CAROUSEL_IMAGES[carouselIndex] }}
                style={styles.carouselImg}
                resizeMode="cover"
              />
              <View style={styles.carouselDotsWrap}>
                {CAROUSEL_IMAGES.map((_, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => {
                      setCarouselIndex(i);
                      startCarousel();
                    }}
                    style={[
                      styles.carouselDot,
                      i === carouselIndex && styles.carouselDotActive,
                    ]}
                    accessibilityRole="tab"
                    accessibilityLabel={`Imagen ${i + 1}`}
                  />
                ))}
              </View>
            </View>
          </View>

          {/* ══ PANEL DERECHO — formulario ══ */}
          <View style={[styles.rightPanel, isDesktopWeb && styles.rightPanelDesktop]}>
            {/* ═════ Credenciales ═════ */}
            {step === "credentials" && (
              <View>
                <Text style={styles.formTitle}>{t('login_bienvenido')}</Text>
                <Text style={styles.formSub}>{t('login_subtitulo')}</Text>

                {/* Correo */}
                <View style={styles.floatGroup}>
                  <Text style={styles.floatLabel}>{t('campo_email')}</Text>
                  <TextInput
                    style={[styles.input, !!emailError && styles.inputErr]}
                    value={email}
                    onChangeText={(t) => {
                      setEmail(t);
                      setEmailError("");
                      setGlobalError("");
                    }}
                    placeholder="correo@ejemplo.com"
                    placeholderTextColor={C.textMuted}
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    returnKeyType="next"
                    selectionColor={C.accent}
                  />
                  {!!emailError && <Text style={styles.fieldError}>{emailError}</Text>}
                </View>

                {/* Contraseña */}
                <View style={styles.floatGroup}>
                  <Text style={styles.floatLabel}>{t('login_password')}</Text>
                  <View style={styles.passwordRow}>
                    <TextInput
                      style={[styles.input, styles.inputPassInner, !!passError && styles.inputErr]}
                      value={password}
                      onChangeText={(t) => {
                        setPassword(t);
                        setPassError("");
                        setGlobalError("");
                      }}
                      placeholder={t('login_password')}
                      placeholderTextColor={C.textMuted}
                      secureTextEntry={!showPassword}
                      autoComplete="current-password"
                      returnKeyType="done"
                      onSubmitEditing={handleLogin}
                      selectionColor={C.accent}
                    />
                    <TouchableOpacity
                      style={styles.eyeBtn}
                      onPress={() => setShowPassword((v) => !v)}
                      accessibilityLabel={
                        showPassword ? t('ocultar_password') : t('mostrar_password')
                      }
                    >
                      <Ionicons
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={20}
                        color={C.textMuted}
                      />
                    </TouchableOpacity>
                  </View>
                  {!!passError && <Text style={styles.fieldError}>{passError}</Text>}
                </View>

                {/* Recuperar contraseña */}
                <View style={styles.linksRow}>
                  <TouchableOpacity
                    accessibilityRole="link"
                    onPress={switchToReset}
                  >
                    <Text style={styles.forgotLink}>{t('login_olvidaste')}</Text>
                  </TouchableOpacity>
                </View>

                {!!globalError && (
                  <View style={styles.globalError}>
                    <Text style={styles.globalErrorText}>{globalError}</Text>
                  </View>
                )}

                <Pressable
                  style={({ pressed }) => [
                    styles.btnPrimary,
                    (loading || pressed) && { opacity: 0.6 },
                  ]}
                  onPress={handleLogin}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel={t('login_iniciar')}
                >
                  {loading ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator color={C.text} />
                      <Text style={[styles.btnPrimaryText, { marginLeft: 10 }]}>
                        {t('login_iniciando')}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.btnPrimaryText}>{t('login_iniciar')}</Text>
                  )}
                </Pressable>

                {/* Divisor + acceso sin contraseña (código OTP) */}
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>{t('login_o_continua_con')}</Text>
                  <View style={styles.dividerLine} />
                </View>

                <TouchableOpacity
                  style={styles.btnOutlineIcon}
                  onPress={switchToOtp}
                  accessibilityRole="button"
                >
                  <Ionicons name="keypad-outline" size={18} color={C.accent70} />
                  <Text style={styles.btnOutlineText}>{t('login_acceso_sin_password')}</Text>
                </TouchableOpacity>

                <View style={styles.registerRow}>
                  <Text style={styles.registerText}>{`${t('login_sin_cuenta')} `}</Text>
                  <TouchableOpacity
                    accessibilityRole="link"
                    onPress={() => router.push("/auth/registro" as any)}
                  >
                    <Text style={styles.registerLink}>{t('login_registrate')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* ═════ Acceso sin contraseña (código OTP de 8 dígitos) ═════ */}
            {step === "otp" && (
              <View>
                <View style={styles.magicIconWrap}>
                  <Ionicons
                    name={otpSent ? "keypad" : "keypad-outline"}
                    size={32}
                    color={C.accent70}
                  />
                </View>

                {!otpSent ? (
                  <>
                    <Text style={styles.formTitle}>{t('login_acceso_sin_password')}</Text>
                    <Text style={styles.formSub}>{t('otp_desc')}</Text>

                    <View style={styles.floatGroup}>
                      <Text style={styles.floatLabel}>{t('campo_email')}</Text>
                      <TextInput
                        style={[styles.input, !!otpError && styles.inputErr]}
                        value={otpEmail}
                        onChangeText={(v) => {
                          setOtpEmail(v);
                          setOtpError("");
                        }}
                        placeholder="correo@ejemplo.com"
                        placeholderTextColor={C.textMuted}
                        autoCapitalize="none"
                        autoComplete="email"
                        keyboardType="email-address"
                        returnKeyType="send"
                        onSubmitEditing={handleSolicitarOtp}
                        selectionColor={C.accent}
                      />
                      {!!otpError && <Text style={styles.fieldError}>{otpError}</Text>}
                    </View>

                    <TouchableOpacity
                      style={[styles.btnPrimary, otpLoading && { opacity: 0.6 }]}
                      onPress={handleSolicitarOtp}
                      disabled={otpLoading}
                    >
                      {otpLoading ? (
                        <View style={styles.loadingRow}>
                          <ActivityIndicator color={C.text} />
                          <Text style={[styles.btnPrimaryText, { marginLeft: 10 }]}>
                            {t('login_enviando')}
                          </Text>
                        </View>
                      ) : (
                        <Text style={styles.btnPrimaryText}>{t('otp_enviar')}</Text>
                      )}
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.formTitle}>{t('login_revisa_correo')}</Text>
                    <Text style={styles.formSub}>
                      {t('otp_enviado_pre')}{" "}
                      <Text style={{ color: C.accent70, fontWeight: "700" }}>
                        {otpEmail.trim().toLowerCase()}
                      </Text>
                      {t('otp_enviado_post')}
                    </Text>

                    <View style={styles.floatGroup}>
                      <Text style={styles.floatLabel}>{t('otp_label_codigo')}</Text>
                      <TextInput
                        style={[styles.input, styles.otpInput, !!otpError && styles.inputErr]}
                        value={otpCodigo}
                        onChangeText={(v) => {
                          setOtpCodigo(v.replace(/[^\d]/g, "").slice(0, 8));
                          setOtpError("");
                        }}
                        placeholder="••••••••"
                        placeholderTextColor={C.textMuted}
                        keyboardType="number-pad"
                        maxLength={8}
                        returnKeyType="done"
                        onSubmitEditing={handleVerificarOtp}
                        selectionColor={C.accent}
                      />
                      {!!otpError && <Text style={styles.fieldError}>{otpError}</Text>}
                    </View>

                    <TouchableOpacity
                      style={[styles.btnPrimary, otpVerifying && { opacity: 0.6 }]}
                      onPress={handleVerificarOtp}
                      disabled={otpVerifying}
                    >
                      {otpVerifying ? (
                        <View style={styles.loadingRow}>
                          <ActivityIndicator color={C.text} />
                          <Text style={[styles.btnPrimaryText, { marginLeft: 10 }]}>
                            {t('login_iniciando')}
                          </Text>
                        </View>
                      ) : (
                        <Text style={styles.btnPrimaryText}>{t('otp_verificar')}</Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.btnOutline, otpLoading && { opacity: 0.6 }]}
                      onPress={handleSolicitarOtp}
                      disabled={otpLoading}
                    >
                      <Text style={styles.btnOutlineText}>{t('otp_reenviar')}</Text>
                    </TouchableOpacity>
                  </>
                )}

                <TouchableOpacity style={styles.btnOutline} onPress={switchToLogin}>
                  <Text style={styles.btnOutlineText}>{`← ${t('login_volver_login')}`}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ═════ Recuperar contraseña (código OTP + nueva contraseña) ═════ */}
            {step === "reset-request" && (
              <View>
                <View style={styles.magicIconWrap}>
                  <Ionicons
                    name={resetSent ? "mail-open-outline" : "key-outline"}
                    size={32}
                    color={C.accent70}
                  />
                </View>

                {!resetSent ? (
                  <>
                    <Text style={styles.formTitle}>{t('login_reset_titulo')}</Text>
                    <Text style={styles.formSub}>{t('login_reset_desc')}</Text>

                    <View style={styles.floatGroup}>
                      <Text style={styles.floatLabel}>{t('campo_email')}</Text>
                      <TextInput
                        style={[styles.input, !!resetError && styles.inputErr]}
                        value={resetEmail}
                        onChangeText={(v) => {
                          setResetEmail(v);
                          setResetError("");
                        }}
                        placeholder="correo@ejemplo.com"
                        placeholderTextColor={C.textMuted}
                        autoCapitalize="none"
                        autoComplete="email"
                        keyboardType="email-address"
                        returnKeyType="send"
                        onSubmitEditing={handleSolicitarReset}
                        selectionColor={C.accent}
                      />
                      {!!resetError && (
                        <Text style={styles.fieldError}>{resetError}</Text>
                      )}
                    </View>

                    <TouchableOpacity
                      style={[styles.btnPrimary, resetLoading && { opacity: 0.6 }]}
                      onPress={handleSolicitarReset}
                      disabled={resetLoading}
                    >
                      {resetLoading ? (
                        <View style={styles.loadingRow}>
                          <ActivityIndicator color={C.text} />
                          <Text style={[styles.btnPrimaryText, { marginLeft: 10 }]}>
                            {t('login_enviando')}
                          </Text>
                        </View>
                      ) : (
                        <Text style={styles.btnPrimaryText}>{t('otp_enviar')}</Text>
                      )}
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.formTitle}>{t('reset_titulo_codigo')}</Text>
                    <Text style={styles.formSub}>
                      {t('reset_codigo_enviado_pre')}{" "}
                      <Text style={{ color: C.accent70, fontWeight: "700" }}>
                        {resetEmail.trim().toLowerCase()}
                      </Text>
                      {t('reset_codigo_enviado_post')}
                    </Text>

                    {/* Código de 8 dígitos */}
                    <View style={styles.floatGroup}>
                      <Text style={styles.floatLabel}>{t('otp_label_codigo')}</Text>
                      <TextInput
                        style={[styles.input, styles.otpInput, !!resetError && styles.inputErr]}
                        value={resetCodigo}
                        onChangeText={(v) => {
                          setResetCodigo(v.replace(/[^\d]/g, "").slice(0, 8));
                          setResetError("");
                        }}
                        placeholder="••••••••"
                        placeholderTextColor={C.textMuted}
                        keyboardType="number-pad"
                        maxLength={8}
                        selectionColor={C.accent}
                      />
                    </View>

                    {/* Nueva contraseña */}
                    <View style={styles.floatGroup}>
                      <Text style={styles.floatLabel}>{t('reset_label_nueva')}</Text>
                      <View style={styles.passwordRow}>
                        <TextInput
                          style={[styles.input, styles.inputPassInner, !!resetError && styles.inputErr]}
                          value={resetPassword}
                          onChangeText={(v) => {
                            setResetPassword(v);
                            setResetError("");
                          }}
                          placeholder={t('reset_label_nueva')}
                          placeholderTextColor={C.textMuted}
                          secureTextEntry={!showResetPassword}
                          autoComplete="new-password"
                          returnKeyType="done"
                          onSubmitEditing={handleVerificarReset}
                          selectionColor={C.accent}
                        />
                        <TouchableOpacity
                          style={styles.eyeBtn}
                          onPress={() => setShowResetPassword((v) => !v)}
                          accessibilityLabel={
                            showResetPassword ? t('ocultar_password') : t('mostrar_password')
                          }
                        >
                          <Ionicons
                            name={showResetPassword ? "eye-off-outline" : "eye-outline"}
                            size={20}
                            color={C.textMuted}
                          />
                        </TouchableOpacity>
                      </View>
                      {!!resetError && <Text style={styles.fieldError}>{resetError}</Text>}
                    </View>

                    <TouchableOpacity
                      style={[styles.btnPrimary, resetVerifying && { opacity: 0.6 }]}
                      onPress={handleVerificarReset}
                      disabled={resetVerifying}
                    >
                      {resetVerifying ? (
                        <View style={styles.loadingRow}>
                          <ActivityIndicator color={C.text} />
                          <Text style={[styles.btnPrimaryText, { marginLeft: 10 }]}>
                            {t('login_iniciando')}
                          </Text>
                        </View>
                      ) : (
                        <Text style={styles.btnPrimaryText}>{t('reset_actualizar')}</Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.btnOutline, resetLoading && { opacity: 0.6 }]}
                      onPress={handleSolicitarReset}
                      disabled={resetLoading}
                    >
                      <Text style={styles.btnOutlineText}>{t('otp_reenviar')}</Text>
                    </TouchableOpacity>
                  </>
                )}

                <TouchableOpacity style={styles.btnOutline} onPress={switchToLogin}>
                  <Text style={styles.btnOutlineText}>{`← ${t('login_volver_login')}`}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ══ Modal fallback: confirmar correo del enlace mágico ══ */}
      <Modal
        visible={showEmailPrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEmailPrompt(false)}
      >
        <View style={styles.promptOverlay}>
          <View style={styles.promptCard}>
            <View style={styles.magicIconWrap}>
              <Ionicons name="mail-unread-outline" size={30} color={C.accent70} />
            </View>
            <Text style={styles.formTitle}>{t('login_confirma_correo')}</Text>
            <Text style={styles.formSub}>{t('login_confirma_desc')}</Text>
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
              onSubmitEditing={handleConfirmEmailPrompt}
              selectionColor={C.accent}
            />
            {!!promptError && <Text style={styles.fieldError}>{promptError}</Text>}
            <TouchableOpacity
              style={[styles.btnPrimary, { marginTop: 16 }]}
              onPress={handleConfirmEmailPrompt}
            >
              <Text style={styles.btnPrimaryText}>{t('login_completar_acceso')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btnOutline}
              onPress={() => setShowEmailPrompt(false)}
            >
              <Text style={styles.btnOutlineText}>{t('accion_cancelar')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ══ Modal: cuenta baneada/inactiva — bloquea el acceso ══ */}
      <Modal
        visible={!!bloqueoCuenta}
        transparent
        animationType="fade"
        onRequestClose={() => setBloqueoCuenta(null)}
      >
        <View style={styles.promptOverlay}>
          <View style={styles.promptCard}>
            <TouchableOpacity
              style={styles.blockCloseBtn}
              onPress={() => setBloqueoCuenta(null)}
              accessibilityRole="button"
              accessibilityLabel={t('accion_cerrar')}
              hitSlop={10}
            >
              <Ionicons name="close" size={20} color={C.textMuted} />
            </TouchableOpacity>
            <View style={[styles.magicIconWrap, styles.blockIconWrap]}>
              <Ionicons name="lock-closed-outline" size={30} color={C.red} />
            </View>
            <Text style={styles.formTitle}>
              {bloqueoCuenta?.tipo === "baneado"
                ? t('login_bloqueo_titulo_baneado')
                : t('login_bloqueo_titulo_inactivo')}
            </Text>
            <Text style={styles.formSub}>
              {bloqueoCuenta?.tipo === "baneado"
                ? t('login_bloqueo_msg_baneado')
                : t('login_bloqueo_msg_inactivo')}
            </Text>
            {!!bloqueoCuenta?.motivo && (
              <View style={styles.blockReasonBox}>
                <Text style={styles.blockReasonText}>
                  {t('login_bloqueo_motivo_prefijo')} {bloqueoCuenta.motivo}
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.blockContactRow}
              onPress={() => {
                // En Android/iOS sin cliente de correo configurado, openURL
                // rechaza la promesa (no hay excepción sincrónica que atrapar
                // con try/catch) — sin este .catch() queda como rejection sin
                // manejar. En web el navegador siempre sabe qué hacer con mailto:.
                Linking.openURL(`mailto:${t('help_screen_email_value')}`).catch(() => {});
              }}
              accessibilityRole="link"
            >
              <Ionicons name="mail-outline" size={16} color={C.accent70} />
              <Text style={styles.blockContactText}>
                {`${t('login_bloqueo_contacto')} ${t('help_screen_email_value')}`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnPrimary, { marginTop: 18 }]}
              onPress={() => setBloqueoCuenta(null)}
            >
              <Text style={styles.btnPrimaryText}>{t('login_bloqueo_boton')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════
//  Estilos — factoría parametrizada por los tokens del tema activo
// ══════════════════════════════════════════════════════════════════
const makeStyles = (C: Tokens) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg, paddingTop: 10 },
    flex1: { flex: 1 },
    centered: { alignItems: "center", justifyContent: "center", gap: 16 },
    completingText: { color: C.textSub, fontSize: 15 },
    scrollContent: { flexGrow: 1, paddingBottom: 48 },
    scrollContentDesktop: { paddingHorizontal: 24, paddingVertical: 28 },

    // Contenedor responsive ("tarjeta" en escritorio, apilado en móvil)
    authShell: { maxWidth: 640, alignSelf: "center", width: "100%" },
    authShellDesktop: {
      maxWidth: 1180,
      flexDirection: "row",
      borderRadius: 28,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.surface,
      minHeight: 720,
    },

    // Panel izquierdo
    leftPanel: {
      backgroundColor: C.surface,
      paddingHorizontal: 28,
      paddingTop: 32,
      paddingBottom: 32,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
      alignItems: "center",
    },
    leftPanelDesktop: {
      flex: 1.05,
      borderBottomWidth: 0,
      borderRightWidth: 1,
      borderRightColor: C.border,
      paddingHorizontal: 48,
      paddingTop: 48,
      paddingBottom: 48,
      justifyContent: "center",
    },
    brand: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 16,
      justifyContent: "center",
    },
    brandLogo: { width: 56, height: 56 },
    brandName: { fontSize: 44, fontWeight: "900", color: C.text, letterSpacing: 2 },
    slogan: {
      fontSize: 20,
      fontWeight: "700",
      color: C.text,
      textAlign: "center",
      marginBottom: 40,
      lineHeight: 28,
    },
    bullets: { gap: 16, marginBottom: 48, width: "100%" },
    bulletRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    bulletCheck: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: C.accent20,
      borderWidth: 1,
      borderColor: C.accent40,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    bulletCheckText: { fontSize: 12, color: C.accent70, fontWeight: "700" },
    bulletText: { fontSize: 15, color: C.textSub, flex: 1 },

    // Carrusel
    carousel: {
      borderRadius: 16,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: C.border,
      marginTop: 12,
      width: "100%",
    },
    carouselImg: { width: "100%", aspectRatio: 4 / 3 },
    carouselDotsWrap: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: "row",
      justifyContent: "center",
      gap: 7,
      paddingVertical: 10,
      // Overlay sobre la imagen: oscuro en ambos modos a propósito.
      backgroundColor: "rgba(0,0,0,0.55)",
    },
    carouselDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: "rgba(255,255,255,0.30)",
    },
    carouselDotActive: {
      backgroundColor: C.accent70,
      transform: [{ scale: 1.3 }],
    },

    // Panel derecho
    rightPanel: {
      paddingHorizontal: 24,
      paddingTop: 40,
      paddingBottom: 40,
      backgroundColor: C.bg,
    },
    rightPanelDesktop: {
      flex: 0.95,
      paddingHorizontal: 48,
      paddingTop: 48,
      paddingBottom: 48,
      justifyContent: "center",
    },
    formTitle: { fontSize: 28, fontWeight: "700", color: C.text, marginBottom: 6 },
    formSub: {
      fontSize: 14,
      color: C.textSub,
      marginBottom: 32,
      lineHeight: 20,
    },

    // Inputs
    floatGroup: { marginBottom: 20 },
    floatLabel: {
      fontSize: 11,
      color: C.accent70,
      marginBottom: 6,
      fontWeight: "500",
      letterSpacing: 0.3,
    },
    input: {
      height: 52,
      backgroundColor: C.inputBg,
      borderWidth: 1,
      borderColor: C.inputBorder,
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
      backgroundColor: C.inputBg,
      borderWidth: 1,
      borderLeftWidth: 0,
      borderColor: C.inputBorder,
      borderTopRightRadius: 10,
      borderBottomRightRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    fieldError: { fontSize: 12, color: C.red, marginTop: 5 },

    // Acceso sin contraseña / recuperar contraseña
    linksRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 24,
      marginTop: -8,
    },
    forgotLink: { fontSize: 13, color: C.accent70, fontWeight: "600" },

    globalError: {
      backgroundColor: C.redBg,
      borderWidth: 1,
      borderColor: C.redBorder,
      borderRadius: 10,
      padding: 12,
      marginBottom: 16,
    },
    globalErrorText: { fontSize: 13, color: C.textSub },

    // Botones
    btnPrimary: {
      height: 48,
      backgroundColor: C.accent,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    loadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
    btnPrimaryText: { fontSize: 14, fontWeight: "600", color: "#ffffff" },
    btnOutline: {
      height: 48,
      backgroundColor: C.inputBg,
      borderWidth: 1,
      borderColor: C.accent40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 4,
    },
    btnOutlineText: { fontSize: 14, fontWeight: "600", color: C.text },
    btnOutlineIcon: {
      height: 48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      backgroundColor: C.inputBg,
      borderWidth: 1,
      borderColor: C.accent40,
      borderRadius: 12,
      marginBottom: 12,
    },

    // Divisor "o continúa con"
    dividerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 16,
      marginTop: 4,
    },
    dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
    dividerText: { fontSize: 12, color: C.textMuted, fontWeight: "500" },

    // Enlace para alternar entre métodos sin contraseña
    altMethodLink: { alignItems: "center", paddingVertical: 12, marginTop: 4 },
    altMethodText: { fontSize: 13, color: C.accent70, fontWeight: "600" },

    // Input del código OTP (centrado, grande, espaciado)
    otpInput: {
      textAlign: "center",
      fontSize: 24,
      fontWeight: "700",
      letterSpacing: 12,
    },

    // Link de registro
    registerRow: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      marginTop: 20,
    },
    registerText: { fontSize: 13, color: C.textMuted },
    registerLink: { fontSize: 13, color: C.accent70, fontWeight: "600" },

    // Modal de confirmación de correo (fallback magic link)
    promptOverlay: {
      flex: 1,
      // Scrim del modal: oscuro en ambos modos por convención.
      backgroundColor: "rgba(0,0,0,0.75)",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    promptCard: {
      width: "100%",
      maxWidth: 420,
      backgroundColor: C.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: C.border,
      padding: 24,
    },

    // Ícono magic link
    magicIconWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: C.accent20,
      borderWidth: 2,
      borderColor: C.accent40,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "center",
      marginBottom: 24,
    },

    // Modal de cuenta baneada/inactiva
    blockCloseBtn: {
      position: "absolute",
      top: 14,
      right: 14,
      zIndex: 1,
      padding: 4,
    },
    blockIconWrap: {
      backgroundColor: C.redBg,
      borderColor: C.redBorder,
    },
    blockReasonBox: {
      backgroundColor: C.redBg,
      borderWidth: 1,
      borderColor: C.redBorder,
      borderRadius: 10,
      padding: 12,
      marginTop: -8,
      marginBottom: 16,
    },
    blockReasonText: { color: C.text, fontSize: 13, lineHeight: 18 },
    blockContactRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      marginTop: -4,
      paddingVertical: 6,
    },
    blockContactText: { color: C.accent70, fontSize: 13, fontWeight: "600" },
  });
