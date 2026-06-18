import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  isSignInWithEmailLink,
  signInWithEmailAndPassword,
  signInWithEmailLink,
} from "firebase/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import AppHeader from "../../components/AppHeader";
import { auth } from "../../src/config/firebaseConfig";
import { useTheme, type GradlyColors } from "../../src/context/ThemeContext";
import {
  CORREO_TEMPORAL_KEY,
  enviarMagicLink,
  enviarResetPassword,
} from "../../src/services/authService";
import { obtenerRolConReintento, rutaPorRol } from "../../src/utils/roleRouting";

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

const BULLETS = [
  "Accede a vacantes verificadas",
  "Valida tus horas sociales fácilmente",
  "Conecta con empresas reales de El Salvador",
];

type Step = "credentials" | "magic-link" | "reset-request";

// ══════════════════════════════════════════════════════════════════
//  Helpers
// ══════════════════════════════════════════════════════════════════
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(v.trim());

function mapFirebaseError(code: string): string {
  if (code.includes("wrong-password") || code.includes("invalid-credential"))
    return "Correo o contraseña incorrectos.";
  if (code.includes("user-not-found")) return "No existe una cuenta con ese correo.";
  if (code.includes("too-many-requests"))
    return "Demasiados intentos. Intenta más tarde.";
  if (code.includes("network-request-failed"))
    return "Sin conexión. Verifica tu internet.";
  if (code.includes("user-disabled")) return "Esta cuenta ha sido deshabilitada.";
  if (code.includes("invalid-email")) return "El correo no tiene un formato válido.";
  return "Error al iniciar sesión. Intenta de nuevo.";
}

// ══════════════════════════════════════════════════════════════════
//  COMPONENTE
// ══════════════════════════════════════════════════════════════════
export default function InicioSesion() {
  const router = useRouter();

  // Tema dinámico: tokens + estilos memorizados que reaccionan a claro/oscuro.
  const { colors, isDark } = useTheme();
  const C = useMemo(() => makeC(colors), [colors]);
  const styles = useMemo(() => makeStyles(C), [C]);

  const [step, setStep] = useState<Step>("credentials");

  // ── Credenciales (login con contraseña) ──
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passError, setPassError] = useState("");
  const [globalError, setGlobalError] = useState("");
  const [loading, setLoading] = useState(false);

  // ── Magic link (acceso sin contraseña) ──
  const [magicEmail, setMagicEmail] = useState("");
  const [magicError, setMagicError] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);

  // ── Recuperación de contraseña ──
  const [resetEmail, setResetEmail] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // ── Estado mientras se completa el enlace entrante ──
  const [completingLink, setCompletingLink] = useState(false);

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
          Alert.alert(
            "No se pudo cargar tu perfil",
            "Verificamos tu identidad pero no pudimos determinar tu tipo de cuenta. Revisa tu conexión e inténtalo de nuevo.",
          );
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
        Alert.alert(
          "Enlace inválido",
          mapFirebaseError(err?.code ?? "") +
            "\n\nEs posible que el enlace haya expirado. Solicita uno nuevo.",
        );
      } finally {
        setCompletingLink(false);
      }
    },
    [router],
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
      setPromptError("Ingresa un correo válido.");
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
      setEmailError("Ingresa tu correo.");
      ok = false;
    } else if (!isEmail(email)) {
      setEmailError("Ingresa un correo válido.");
      ok = false;
    }
    if (!password) {
      setPassError("Ingresa tu contraseña.");
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
        setGlobalError(
          "Iniciaste sesión, pero no pudimos cargar tu tipo de cuenta. Verifica tu conexión e inténtalo de nuevo.",
        );
        return;
      }

      router.replace(ruta as any);
    } catch (err: any) {
      setGlobalError(mapFirebaseError(err?.code ?? ""));
    } finally {
      setLoading(false);
    }
  };

  // ══════════════════════════════════════════════════════════════
  //  Enviar Magic Link (acceso sin contraseña)
  // ══════════════════════════════════════════════════════════════
  const handleSendMagicLink = async () => {
    setMagicError("");
    const correo = magicEmail.trim().toLowerCase();
    if (!correo) {
      setMagicError("Ingresa tu correo electrónico.");
      return;
    }
    if (!isEmail(correo)) {
      setMagicError("Ingresa un correo válido.");
      return;
    }

    setMagicLoading(true);
    try {
      // enviarMagicLink guarda el correo en AsyncStorage ANTES de enviar.
      await enviarMagicLink(correo);
      setMagicSent(true);
    } catch (err: any) {
      setMagicError(mapFirebaseError(err?.code ?? ""));
    } finally {
      setMagicLoading(false);
    }
  };

  // ══════════════════════════════════════════════════════════════
  //  Enviar correo de recuperación de contraseña
  // ══════════════════════════════════════════════════════════════
  const handleSendReset = async () => {
    setResetError("");
    const correo = resetEmail.trim().toLowerCase();
    if (!correo) {
      setResetError("Ingresa tu correo electrónico.");
      return;
    }
    if (!isEmail(correo)) {
      setResetError("Ingresa un correo válido.");
      return;
    }

    setResetLoading(true);
    try {
      await enviarResetPassword(correo);
      // No revelamos si el correo existe o no (buena práctica de seguridad).
      setResetSent(true);
    } catch (err: any) {
      // user-not-found igualmente se muestra como enviado; el resto sí es error.
      if ((err?.code ?? "").includes("user-not-found")) {
        setResetSent(true);
      } else {
        setResetError(mapFirebaseError(err?.code ?? ""));
      }
    } finally {
      setResetLoading(false);
    }
  };

  const switchToMagic = () => {
    setStep("magic-link");
    setGlobalError("");
    setMagicError("");
    setMagicSent(false);
    setMagicEmail(email.trim());
  };
  const switchToReset = () => {
    setStep("reset-request");
    setGlobalError("");
    setResetError("");
    setResetSent(false);
    setResetEmail(email.trim());
  };
  const switchToLogin = () => {
    setStep("credentials");
    setMagicError("");
    setResetError("");
  };

  // ══════════════════════════════════════════════════════════════
  //  Pantalla de "completando enlace"
  // ══════════════════════════════════════════════════════════════
  if (completingLink) {
    return (
      <View style={[styles.root, styles.centered]}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <ActivityIndicator size="large" color={C.accent} />
        <Text style={styles.completingText}>Verificando tu enlace mágico…</Text>
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
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ══ PANEL IZQUIERDO — marca + bullets + carrusel ══ */}
          <View style={styles.leftPanel}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Text style={styles.backBtnText}>← Volver</Text>
            </TouchableOpacity>

            <View style={styles.brand}>
              <Image
                source={require("../../assets/images/LogoGradly.png")}
                style={styles.brandLogo}
                resizeMode="contain"
              />
              <Text style={styles.brandName}>Gradly</Text>
            </View>

            <Text style={styles.slogan}>
              Tu próxima oportunidad{"\n"}comienza aquí
            </Text>

            <View style={styles.bullets}>
              {BULLETS.map((b) => (
                <View key={b} style={styles.bulletRow}>
                  <View style={styles.bulletCheck}>
                    <Text style={styles.bulletCheckText}>✓</Text>
                  </View>
                  <Text style={styles.bulletText}>{b}</Text>
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
          <View style={styles.rightPanel}>
            {/* ═════ Credenciales ═════ */}
            {step === "credentials" && (
              <View>
                <Text style={styles.formTitle}>Bienvenido de nuevo</Text>
                <Text style={styles.formSub}>Ingresa tus datos para continuar</Text>

                {/* Correo */}
                <View style={styles.floatGroup}>
                  <Text style={styles.floatLabel}>Correo electrónico</Text>
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
                  <Text style={styles.floatLabel}>Contraseña</Text>
                  <View style={styles.passwordRow}>
                    <TextInput
                      style={[styles.input, styles.inputPassInner, !!passError && styles.inputErr]}
                      value={password}
                      onChangeText={(t) => {
                        setPassword(t);
                        setPassError("");
                        setGlobalError("");
                      }}
                      placeholder="Contraseña"
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
                        showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
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

                {/* Acceso sin contraseña / recuperar contraseña */}
                <View style={styles.linksRow}>
                  <TouchableOpacity
                    accessibilityRole="link"
                    onPress={switchToReset}
                  >
                    <Text style={styles.forgotLink}>¿Olvidaste tu contraseña?</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="link"
                    onPress={switchToMagic}
                  >
                    <Text style={styles.forgotLink}>Acceso sin contraseña →</Text>
                  </TouchableOpacity>
                </View>

                {!!globalError && (
                  <View style={styles.globalError}>
                    <Text style={styles.globalErrorText}>{globalError}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.btnPrimary, loading && { opacity: 0.6 }]}
                  onPress={handleLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator color={C.text} />
                      <Text style={[styles.btnPrimaryText, { marginLeft: 10 }]}>
                        Iniciando sesión...
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.btnPrimaryText}>Iniciar Sesión</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.registerRow}>
                  <Text style={styles.registerText}>¿No tienes cuenta? </Text>
                  <TouchableOpacity
                    accessibilityRole="link"
                    onPress={() => router.push("/auth/registro" as any)}
                  >
                    <Text style={styles.registerLink}>Regístrate aquí</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* ═════ Magic Link ═════ */}
            {step === "magic-link" && (
              <View>
                <View style={styles.magicIconWrap}>
                  <Ionicons
                    name={magicSent ? "mail-open-outline" : "sparkles-outline"}
                    size={32}
                    color={C.accent70}
                  />
                </View>

                {!magicSent ? (
                  <>
                    <Text style={styles.formTitle}>Acceso sin contraseña</Text>
                    <Text style={styles.formSub}>
                      Te enviaremos un enlace mágico a tu correo. Tócalo desde este
                      dispositivo para entrar al instante.
                    </Text>

                    <View style={styles.floatGroup}>
                      <Text style={styles.floatLabel}>Correo electrónico</Text>
                      <TextInput
                        style={[styles.input, !!magicError && styles.inputErr]}
                        value={magicEmail}
                        onChangeText={(t) => {
                          setMagicEmail(t);
                          setMagicError("");
                        }}
                        placeholder="correo@ejemplo.com"
                        placeholderTextColor={C.textMuted}
                        autoCapitalize="none"
                        autoComplete="email"
                        keyboardType="email-address"
                        returnKeyType="send"
                        onSubmitEditing={handleSendMagicLink}
                        selectionColor={C.accent}
                      />
                      {!!magicError && (
                        <Text style={styles.fieldError}>{magicError}</Text>
                      )}
                    </View>

                    <TouchableOpacity
                      style={[styles.btnPrimary, magicLoading && { opacity: 0.6 }]}
                      onPress={handleSendMagicLink}
                      disabled={magicLoading}
                    >
                      {magicLoading ? (
                        <View style={styles.loadingRow}>
                          <ActivityIndicator color={C.text} />
                          <Text style={[styles.btnPrimaryText, { marginLeft: 10 }]}>
                            Enviando enlace...
                          </Text>
                        </View>
                      ) : (
                        <Text style={styles.btnPrimaryText}>Enviar enlace mágico</Text>
                      )}
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.formTitle}>Revisa tu correo</Text>
                    <Text style={styles.formSub}>
                      Enviamos un enlace de acceso a{" "}
                      <Text style={{ color: C.accent70, fontWeight: "700" }}>
                        {magicEmail.trim().toLowerCase()}
                      </Text>
                      . Ábrelo desde este dispositivo para iniciar sesión.
                    </Text>

                    <TouchableOpacity
                      style={[styles.btnPrimary, magicLoading && { opacity: 0.6 }]}
                      onPress={handleSendMagicLink}
                      disabled={magicLoading}
                    >
                      <Text style={styles.btnPrimaryText}>Reenviar enlace</Text>
                    </TouchableOpacity>
                  </>
                )}

                <TouchableOpacity style={styles.btnOutline} onPress={switchToLogin}>
                  <Text style={styles.btnOutlineText}>← Volver al inicio de sesión</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ═════ Recuperar contraseña ═════ */}
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
                    <Text style={styles.formTitle}>Recuperar contraseña</Text>
                    <Text style={styles.formSub}>
                      Ingresa tu correo y te enviaremos un enlace para crear una
                      contraseña nueva.
                    </Text>

                    <View style={styles.floatGroup}>
                      <Text style={styles.floatLabel}>Correo electrónico</Text>
                      <TextInput
                        style={[styles.input, !!resetError && styles.inputErr]}
                        value={resetEmail}
                        onChangeText={(t) => {
                          setResetEmail(t);
                          setResetError("");
                        }}
                        placeholder="correo@ejemplo.com"
                        placeholderTextColor={C.textMuted}
                        autoCapitalize="none"
                        autoComplete="email"
                        keyboardType="email-address"
                        returnKeyType="send"
                        onSubmitEditing={handleSendReset}
                        selectionColor={C.accent}
                      />
                      {!!resetError && (
                        <Text style={styles.fieldError}>{resetError}</Text>
                      )}
                    </View>

                    <TouchableOpacity
                      style={[styles.btnPrimary, resetLoading && { opacity: 0.6 }]}
                      onPress={handleSendReset}
                      disabled={resetLoading}
                    >
                      {resetLoading ? (
                        <View style={styles.loadingRow}>
                          <ActivityIndicator color={C.text} />
                          <Text style={[styles.btnPrimaryText, { marginLeft: 10 }]}>
                            Enviando…
                          </Text>
                        </View>
                      ) : (
                        <Text style={styles.btnPrimaryText}>
                          Enviar enlace de recuperación
                        </Text>
                      )}
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.formTitle}>Revisa tu correo</Text>
                    <Text style={styles.formSub}>
                      Si existe una cuenta con{" "}
                      <Text style={{ color: C.accent70, fontWeight: "700" }}>
                        {resetEmail.trim().toLowerCase()}
                      </Text>
                      , recibirás un enlace para restablecer tu contraseña.
                    </Text>

                    <TouchableOpacity
                      style={[styles.btnPrimary, resetLoading && { opacity: 0.6 }]}
                      onPress={handleSendReset}
                      disabled={resetLoading}
                    >
                      <Text style={styles.btnPrimaryText}>Reenviar enlace</Text>
                    </TouchableOpacity>
                  </>
                )}

                <TouchableOpacity style={styles.btnOutline} onPress={switchToLogin}>
                  <Text style={styles.btnOutlineText}>← Volver al inicio de sesión</Text>
                </TouchableOpacity>
              </View>
            )}
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
            <Text style={styles.formTitle}>Confirma tu correo</Text>
            <Text style={styles.formSub}>
              Para completar el acceso, ingresa el correo con el que solicitaste el
              enlace mágico.
            </Text>
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
              <Text style={styles.btnPrimaryText}>Completar acceso</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btnOutline}
              onPress={() => setShowEmailPrompt(false)}
            >
              <Text style={styles.btnOutlineText}>Cancelar</Text>
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
    root: { flex: 1, backgroundColor: C.bg },
    flex1: { flex: 1 },
    centered: { alignItems: "center", justifyContent: "center", gap: 16 },
    completingText: { color: C.textSub, fontSize: 15 },
    scrollContent: { flexGrow: 1, paddingBottom: 48 },

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
    backBtn: { alignSelf: "flex-start", marginBottom: 20 },
    backBtnText: { fontSize: 14, color: C.accent70, fontWeight: "600" },
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
  });
