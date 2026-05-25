import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { supabase } from "../lib/supabase";
import { resolveEmailFromUsername } from "../services/authService";

const { width: SCREEN_W } = Dimensions.get("window");
const OTP_LENGTH = 8;
const OTP_ROW_GAP = 8;

// ── Same design tokens as index.tsx
const C = {
  bg: "#07050f",
  surface: "#0d0b1e",
  bgMid: "#1a1340",
  accent: "#8b5cf6",
  accent70: "rgba(167,139,250,1)",
  accent40: "rgba(139,92,246,0.35)",
  accent20: "rgba(139,92,246,0.12)",
  text: "#ffffff",
  textSub: "rgba(255,255,255,0.65)",
  textMid: "rgba(255,255,255,0.55)",
  textMuted: "rgba(255,255,255,0.38)",
  border: "rgba(139,92,246,0.22)",
  cardBg: "rgba(255,255,255,0.03)",
  red: "#ef4444",
  redBg: "rgba(239,68,68,0.10)",
  redBorder: "rgba(239,68,68,0.35)",
  green: "#22c55e",
  greenBg: "rgba(34,197,94,0.15)",
};

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

export default function InicioSesion() {
  const router = useRouter();

  // ── Step
  const [step, setStep] = useState<
    | "credentials"
    | "2fa"
    | "recovery-email"
    | "recovery-otp"
    | "recovery-password"
  >("credentials");

  // ── Credentials form
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [userError, setUserError] = useState("");
  const [passError, setPassError] = useState("");
  const [globalError, setGlobalError] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [loginRole, setLoginRole] = useState("");

  // ── Password recovery
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryEmailError, setRecoveryEmailError] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newPassError, setNewPassError] = useState("");
  const [confirmPassError, setConfirmPassError] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // ── OTP (8 digits)
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [otpError, setOtpError] = useState(false);
  const [otpSuccess, setOtpSuccess] = useState(false);
  const otpRefs = useRef<(TextInput | null)[]>([]);

  // ── OTP validity timer (600s = 10 min)
  const [otpSeconds, setOtpSeconds] = useState(600);
  const otpTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Resend countdown (60s)
  const [resendSeconds, setResendSeconds] = useState(60);
  const [resendEnabled, setResendEnabled] = useState(false);
  const resendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Carousel
  const [carouselIndex, setCarouselIndex] = useState(0);
  const carouselTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Start carousel on mount
  useEffect(() => {
    startCarousel();
    return () => {
      if (carouselTimerRef.current) clearInterval(carouselTimerRef.current);
      if (otpTimerRef.current) clearInterval(otpTimerRef.current);
      if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    };
  }, []);

  const startCarousel = useCallback(() => {
    if (carouselTimerRef.current) clearInterval(carouselTimerRef.current);
    carouselTimerRef.current = setInterval(() => {
      setCarouselIndex((prev) => (prev + 1) % CAROUSEL_IMAGES.length);
    }, 5000);
  }, []);

  // ── Start OTP countdown
  const startOTPTimer = useCallback(() => {
    if (otpTimerRef.current) clearInterval(otpTimerRef.current);
    setOtpSeconds(600);
    otpTimerRef.current = setInterval(() => {
      setOtpSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(otpTimerRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // ── Start resend countdown
  const startResendCountdown = useCallback(() => {
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    setResendSeconds(60);
    setResendEnabled(false);
    resendTimerRef.current = setInterval(() => {
      setResendSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(resendTimerRef.current!);
          setResendEnabled(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // ── Clear OTP state (back to step 1 or resend)
  const clearOTPState = useCallback(() => {
    if (otpTimerRef.current) clearInterval(otpTimerRef.current);
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    setOtp(Array(OTP_LENGTH).fill(""));
    setOtpError(false);
    setOtpSuccess(false);
    setOtpSeconds(600);
    setResendSeconds(60);
    setResendEnabled(false);
  }, []);

  // ── Format seconds as M:SS
  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const isValidEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(value);

  const maskEmail = (email: string) => {
    const [local, domain] = email.split("@");
    const maskedLocal =
      local.length <= 2 ? local : `${local[0]}***${local.slice(-1)}`;
    return `${maskedLocal}@${domain}`;
  };

  const getDashboardRoute = (role: string) => {
    switch (role) {
      case "universidad":
        return "/dashboard-universidad";
      case "empresa":
        return "/dashboard-empresa";
      case "admin":
        return "/dashboard-administrador";
      case "talento":
      default:
        return "/dashboard-joventalento";
    }
  };

  const [loading, setLoading] = useState(false);

  // ── Handle credentials submit
  const handleSubmit = async () => {
    let valid = true;
    setUserError("");
    setPassError("");
    setGlobalError("");

    const rawInput = emailOrUsername.trim();
    if (!rawInput) {
      setUserError("Este campo es obligatorio.");
      valid = false;
    }
    if (!password) {
      setPassError("Ingresa tu contraseña.");
      valid = false;
    }
    if (!valid) return;

    setLoading(true);
    try {
      let email = rawInput;
      const emailIsValid = isValidEmail(email);

      if (!emailIsValid) {
        const resolvedEmail = await resolveEmailFromUsername(email);
        if (!resolvedEmail) {
          throw new Error("Credenciales de inicio de sesión inválidas");
        }

        email = resolvedEmail;
      }

      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      if (!authData.user) throw new Error("No se pudo iniciar sesión");

      // Login successful: redirect to dashboard
      try {
        const role = authData.user.user_metadata?.role ?? "talento";
        router.replace(getDashboardRoute(role) as any);
        return;
      } catch (err) {
        // fallback to existing 2FA flow if redirect fails
        const role = authData.user.user_metadata?.role ?? "talento";
        setLoginRole(role);
        setMaskedEmail(maskEmail(email));
        setStep("2fa");
        clearOTPState();
        startOTPTimer();
        startResendCountdown();
      }
    } catch (error: any) {
      const msg: string = (error?.message ?? "").toLowerCase();
      let userMessage = "Error al iniciar sesión.";
      if (
        msg.includes("invalid login credentials") ||
        msg.includes("invalid password") ||
        msg.includes("user not found") ||
        msg.includes("invalid login")
      ) {
        userMessage = "Correo, usuario o contraseña incorrectos.";
      } else if (msg.includes("too many requests") || error?.status === 429) {
        userMessage = "Demasiados intentos. Intenta más tarde.";
      } else if (msg.includes("network") || msg.includes("fetch")) {
        userMessage = "Sin conexión. Verifica tu internet.";
      } else if (msg.includes("email not confirmed")) {
        userMessage = "Confirma tu correo electrónico antes de ingresar.";
      } else if (error?.message) {
        userMessage = error.message;
      }
      setGlobalError(userMessage);
      Alert.alert("Error", userMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    setStep("recovery-email");
    setGlobalError("");
    setUserError("");
    setPassError("");
    setRecoveryEmail("");
    setRecoveryEmailError("");
    setNewPassword("");
    setConfirmPassword("");
    setNewPassError("");
    setConfirmPassError("");
    clearOTPState();
  };

  const handleSendRecoveryEmail = async () => {
    setRecoveryEmailError("");
    const email = recoveryEmail.trim();
    if (!email) {
      setRecoveryEmailError("Este campo es obligatorio.");
      return;
    }
    if (!isValidEmail(email)) {
      setRecoveryEmailError("Ingresa un correo válido.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;

      setMaskedEmail(maskEmail(email));
      setStep("recovery-otp");
      clearOTPState();
      startOTPTimer();
      startResendCountdown();
      Alert.alert(
        "Correo enviado",
        "Revisa tu correo para obtener el código de recuperación.",
      );
    } catch (error: any) {
      Alert.alert("Error", error?.message ?? "No se pudo enviar el correo.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    setNewPassError("");
    setConfirmPassError("");

    if (!newPassword) {
      setNewPassError("Ingresa tu nueva contraseña.");
    }
    if (!confirmPassword) {
      setConfirmPassError("Confirma tu contraseña.");
    }
    if (!newPassword || !confirmPassword) return;
    if (newPassword !== confirmPassword) {
      setConfirmPassError("Las contraseñas no coinciden.");
      return;
    }
    if (newPassword.length < 6) {
      setNewPassError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;

      Alert.alert("Éxito", "Tu contraseña se actualizó correctamente.");
      setStep("credentials");
      setEmailOrUsername(recoveryEmail);
      setPassword("");
      setRecoveryEmail("");
      setNewPassword("");
      setConfirmPassword("");
      setMaskedEmail("");
      router.replace("/iniciosesion" as any);
    } catch (error: any) {
      Alert.alert(
        "Error",
        error?.message ?? "No se pudo actualizar la contraseña.",
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Handle OTP digit input
  const handleOtpChange = (text: string, index: number) => {
    const digit = text.replace(/[^0-9]/g, "").slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    setOtpError(false);

    if (digit && index < OTP_LENGTH - 1) otpRefs.current[index + 1]?.focus();

    if (newOtp.every((d) => d.length === 1)) validateOTP(newOtp);
  };

  // ── Handle OTP backspace navigation
  const handleOtpKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === "Backspace" && !otp[index] && index > 0) {
      const newOtp = [...otp];
      newOtp[index - 1] = "";
      setOtp(newOtp);
      otpRefs.current[index - 1]?.focus();
    }
  };

  // ── Validate OTP for login and recovery
  const validateOTP = async (code: string[]) => {
    const token = code.join("");
    if (token.length !== OTP_LENGTH) return;

    if (step === "2fa") {
      if (token === "123456") {
        setOtpSuccess(true);
        setOtpError(false);
        setTimeout(() => {
          clearOTPState();
          router.replace(getDashboardRoute(loginRole) as any);
        }, 1500);
        return;
      }
      setOtpError(true);
      setTimeout(() => {
        setOtp(Array(OTP_LENGTH).fill(""));
        setOtpError(false);
        otpRefs.current[0]?.focus();
      }, 1400);
      return;
    }

    if (step === "recovery-otp") {
      setLoading(true);
      try {
        const { error } = await supabase.auth.verifyOtp({
          email: recoveryEmail.trim(),
          token,
          type: "recovery",
        });
        if (error) throw error;

        setOtpSuccess(true);
        setOtpError(false);
        setTimeout(() => {
          clearOTPState();
          setStep("recovery-password");
        }, 600);
      } catch (error: any) {
        setOtpError(true);
        Alert.alert("Error", error?.message ?? "Código incorrecto.");
        setTimeout(() => {
          setOtp(Array(OTP_LENGTH).fill(""));
          setOtpError(false);
          otpRefs.current[0]?.focus();
        }, 1400);
      } finally {
        setLoading(false);
      }
    }
  };

  // ── Resend handler
  const handleResend = async () => {
    if (!resendEnabled) return;
    clearOTPState();
    startOTPTimer();
    startResendCountdown();
    setTimeout(() => otpRefs.current[0]?.focus(), 100);

    if (step === "recovery-otp") {
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(
          recoveryEmail.trim(),
        );
        if (error) throw error;
        Alert.alert(
          "Código reenviado",
          "Se ha enviado un nuevo código de recuperación a tu correo.",
        );
      } catch (error: any) {
        Alert.alert(
          "Error",
          error?.message ?? "No se pudo reenviar el código.",
        );
      }
    }
  };

  const otpBarPct = `${(otpSeconds / 600) * 100}%` as any;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ══ LEFT PANEL — brand + bullets + carousel ══ */}
          <View style={styles.leftPanel}>
            {/* Back button */}
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => router.back()}
            >
              <Text style={styles.backBtnText}>← Volver</Text>
            </TouchableOpacity>

            {/* Logo + brand name */}
            <View style={styles.brand}>
              <Image
                source={require("@/assets/images/LogoGradly.png")}
                style={styles.brandLogo}
                resizeMode="contain"
              />
              <Text style={styles.brandName}>Gradly</Text>
            </View>

            <Text style={styles.slogan}>
              Tu próxima oportunidad{"\n"}comienza aquí
            </Text>

            {/* Bullet points */}
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

            {/* Image carousel */}
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

          {/* ══ RIGHT PANEL — form ══ */}
          <View style={styles.rightPanel}>
            {/* ═════ STEP 1: Credentials ═════ */}
            {step === "credentials" && (
              <View>
                <Text style={styles.formTitle}>Bienvenido de nuevo</Text>
                <Text style={styles.formSub}>
                  Ingresa tus datos para continuar
                </Text>

                {/* Usuario / correo */}
                <View style={styles.floatGroup}>
                  <Text style={styles.floatLabel}>
                    Usuario o correo electrónico
                  </Text>
                  <TextInput
                    style={[styles.input, !!userError && styles.inputErr]}
                    value={emailOrUsername}
                    onChangeText={(t) => {
                      setEmailOrUsername(t);
                      setUserError("");
                    }}
                    placeholder="Usuario o correo electrónico"
                    placeholderTextColor={C.textMuted}
                    autoCapitalize="none"
                    autoComplete="username"
                    keyboardType="email-address"
                    returnKeyType="next"
                    selectionColor={C.accent}
                  />
                  {!!userError && (
                    <Text style={styles.fieldError}>{userError}</Text>
                  )}
                </View>

                {/* Contraseña */}
                <View style={styles.floatGroup}>
                  <Text style={styles.floatLabel}>Contraseña</Text>
                  <View style={styles.passwordRow}>
                    <TextInput
                      style={[
                        styles.input,
                        styles.inputPassInner,
                        !!passError && styles.inputErr,
                      ]}
                      value={password}
                      onChangeText={(t) => {
                        setPassword(t);
                        setPassError("");
                      }}
                      placeholder="Contraseña"
                      placeholderTextColor={C.textMuted}
                      secureTextEntry={!showPassword}
                      autoComplete="current-password"
                      returnKeyType="done"
                      onSubmitEditing={handleSubmit}
                      selectionColor={C.accent}
                    />
                    <TouchableOpacity
                      style={styles.eyeBtn}
                      onPress={() => setShowPassword((v) => !v)}
                      accessibilityLabel={
                        showPassword
                          ? "Ocultar contraseña"
                          : "Mostrar contraseña"
                      }
                    >
                      <Ionicons
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={20}
                        color={C.textMuted}
                      />
                    </TouchableOpacity>
                  </View>
                  {!!passError && (
                    <Text style={styles.fieldError}>{passError}</Text>
                  )}
                </View>

                {/* ¿Olvidaste tu contraseña? */}
                <TouchableOpacity
                  accessibilityRole="link"
                  style={styles.forgotWrap}
                  onPress={handleForgotPassword}
                >
                  <Text style={styles.forgotLink}>
                    ¿Olvidaste tu contraseña?
                  </Text>
                </TouchableOpacity>

                {/* Error global */}
                {!!globalError && (
                  <View style={styles.globalError}>
                    <Text style={styles.globalErrorText}>{globalError}</Text>
                  </View>
                )}

                {/* Submit */}
                <TouchableOpacity
                  style={[styles.btnPrimary, loading && { opacity: 0.6 }]}
                  onPress={handleSubmit}
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
                    <Text style={styles.btnPrimaryText}>Continuar</Text>
                  )}
                </TouchableOpacity>

                {/* Divider */}
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>o continúa con</Text>
                  <View style={styles.dividerLine} />
                </View>

                {/* Google OAuth */}
                <TouchableOpacity
                  style={styles.oauthBtn}
                  accessibilityLabel="Continuar con Google"
                >
                  {/* Google "G" SVG approximated with styled text */}
                  <View style={styles.googleGWrap}>
                    <Text style={styles.googleG}>G</Text>
                  </View>
                  <Text style={styles.oauthText}>Google</Text>
                </TouchableOpacity>

                {/* Register link */}
                <View style={styles.registerRow}>
                  <Text style={styles.registerText}>¿No tienes cuenta? </Text>
                  <TouchableOpacity
                    accessibilityRole="link"
                    onPress={() => router.push("/registro" as any)}
                  >
                    <Text style={styles.registerLink}>Regístrate aquí</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* ═════ STEP 2: RECOVERY EMAIL ═════ */}
            {step === "recovery-email" && (
              <View>
                <Text style={styles.formTitle}>Recuperar contraseña</Text>
                <Text style={styles.formSub}>
                  Ingresa el correo asociado a tu cuenta para recibir el código.
                </Text>

                <View style={styles.floatGroup}>
                  <Text style={styles.floatLabel}>Correo electrónico</Text>
                  <TextInput
                    style={[
                      styles.input,
                      !!recoveryEmailError && styles.inputErr,
                    ]}
                    value={recoveryEmail}
                    onChangeText={(t) => {
                      setRecoveryEmail(t);
                      setRecoveryEmailError("");
                    }}
                    placeholder="Correo electrónico"
                    placeholderTextColor={C.textMuted}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    returnKeyType="send"
                    selectionColor={C.accent}
                  />
                  {!!recoveryEmailError && (
                    <Text style={styles.fieldError}>{recoveryEmailError}</Text>
                  )}
                </View>

                <TouchableOpacity
                  style={[styles.btnPrimary, loading && { opacity: 0.6 }]}
                  onPress={handleSendRecoveryEmail}
                  disabled={loading}
                >
                  <Text style={styles.btnPrimaryText}>
                    {loading ? "Enviando código..." : "Enviar código"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.btnOutline}
                  onPress={() => setStep("credentials")}
                >
                  <Text style={styles.btnOutlineText}>← Volver al inicio</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ═════ STEP 3: RECOVERY OTP ═════ */}
            {step === "recovery-otp" && (
              <View>
                <View style={styles.twofaIconWrap}>
                  <Text style={styles.twofaIconText}>🔒</Text>
                </View>
                <Text style={[styles.formTitle, { textAlign: "center" }]}>
                  Buscar código
                </Text>
                <Text style={[styles.formSub, { textAlign: "center" }]}>
                  Recibirás un código de recuperación de 8 dígitos en{" "}
                </Text>

                <View style={styles.otpRow}>
                  {otp.map((digit, i) => (
                    <TextInput
                      key={i}
                      ref={(el) => {
                        otpRefs.current[i] = el;
                      }}
                      style={[
                        styles.otpInput,
                        digit && styles.otpInputFilled,
                        otpError && styles.otpInputError,
                        otpSuccess && styles.otpInputSuccess,
                      ]}
                      value={digit}
                      onChangeText={(t) => handleOtpChange(t, i)}
                      onKeyPress={(e) => handleOtpKeyPress(e, i)}
                      keyboardType="number-pad"
                      maxLength={1}
                      selectTextOnFocus
                      editable={!otpSuccess}
                      selectionColor={C.accent}
                      accessibilityLabel={`Dígito ${i + 1}`}
                    />
                  ))}
                </View>

                {otpError && (
                  <Text style={styles.otpErrorMsg}>
                    Código incorrecto. Por favor inténtalo de nuevo.
                  </Text>
                )}

                <View style={styles.validityBar}>
                  <View
                    style={[styles.validityProgress, { width: otpBarPct }]}
                  />
                </View>
                <Text style={styles.validityLabel}>
                  Código válido por{" "}
                  <Text style={{ color: C.text, fontWeight: "600" }}>
                    {formatTime(otpSeconds)}
                  </Text>
                </Text>

                <View style={styles.resendRow}>
                  <Text style={styles.resendText}>No recibí el código — </Text>
                  <TouchableOpacity
                    onPress={handleResend}
                    disabled={!resendEnabled}
                  >
                    <Text
                      style={[
                        styles.resendBtn,
                        resendEnabled && styles.resendBtnActive,
                      ]}
                    >
                      {resendEnabled
                        ? "Reenviar código"
                        : `Reenviar (${resendSeconds}s)`}
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.btnPrimary}
                  onPress={() => setStep("recovery-email")}
                >
                  <Text style={styles.btnPrimaryText}>← Cambiar correo</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ═════ STEP 4: RECOVERY PASSWORD ═════ */}
            {step === "recovery-password" && (
              <View>
                <Text style={styles.formTitle}>Nueva contraseña</Text>
                <Text style={styles.formSub}>
                  Ingresa y confirma tu nueva contraseña para finalizar.
                </Text>

                <View style={styles.floatGroup}>
                  <Text style={styles.floatLabel}>Nueva contraseña</Text>
                  <View style={styles.passwordRow}>
                    <TextInput
                      style={[
                        styles.input,
                        styles.inputPassInner,
                        !!newPassError && styles.inputErr,
                      ]}
                      value={newPassword}
                      onChangeText={(t) => {
                        setNewPassword(t);
                        setNewPassError("");
                      }}
                      placeholder="Nueva contraseña"
                      placeholderTextColor={C.textMuted}
                      secureTextEntry={!showNewPassword}
                      autoComplete="password"
                      returnKeyType="next"
                      selectionColor={C.accent}
                    />
                    <TouchableOpacity
                      style={styles.eyeBtn}
                      onPress={() => setShowNewPassword((v) => !v)}
                      accessibilityLabel={
                        showNewPassword
                          ? "Ocultar contraseña"
                          : "Mostrar contraseña"
                      }
                    >
                      <Ionicons
                        name={
                          showNewPassword ? "eye-off-outline" : "eye-outline"
                        }
                        size={20}
                        color={C.textMuted}
                      />
                    </TouchableOpacity>
                  </View>
                  {!!newPassError && (
                    <Text style={styles.fieldError}>{newPassError}</Text>
                  )}
                </View>

                <View style={styles.floatGroup}>
                  <Text style={styles.floatLabel}>Confirmar contraseña</Text>
                  <View style={styles.passwordRow}>
                    <TextInput
                      style={[
                        styles.input,
                        styles.inputPassInner,
                        !!confirmPassError && styles.inputErr,
                      ]}
                      value={confirmPassword}
                      onChangeText={(t) => {
                        setConfirmPassword(t);
                        setConfirmPassError("");
                      }}
                      placeholder="Confirmar contraseña"
                      placeholderTextColor={C.textMuted}
                      secureTextEntry={!showConfirmPassword}
                      autoComplete="password"
                      returnKeyType="done"
                      selectionColor={C.accent}
                    />
                    <TouchableOpacity
                      style={styles.eyeBtn}
                      onPress={() => setShowConfirmPassword((v) => !v)}
                      accessibilityLabel={
                        showConfirmPassword
                          ? "Ocultar contraseña"
                          : "Mostrar contraseña"
                      }
                    >
                      <Ionicons
                        name={
                          showConfirmPassword
                            ? "eye-off-outline"
                            : "eye-outline"
                        }
                        size={20}
                        color={C.textMuted}
                      />
                    </TouchableOpacity>
                  </View>
                  {!!confirmPassError && (
                    <Text style={styles.fieldError}>{confirmPassError}</Text>
                  )}
                </View>

                <TouchableOpacity
                  style={[styles.btnPrimary, loading && { opacity: 0.6 }]}
                  onPress={handleUpdatePassword}
                  disabled={loading}
                >
                  <Text style={styles.btnPrimaryText}>
                    {loading ? "Guardando contraseña..." : "Guardar contraseña"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.btnOutline}
                  onPress={handleForgotPassword}
                >
                  <Text style={styles.btnOutlineText}>← Volver al correo</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ═════ STEP 2: 2FA / OTP ═════ */}
            {step === "2fa" && (
              <View>
                <View style={styles.twofaIconWrap}>
                  <Text style={styles.twofaIconText}>✉️</Text>
                </View>
                <Text style={[styles.formTitle, { textAlign: "center" }]}>
                  Verifica tu identidad
                </Text>
                <Text style={[styles.formSub, { textAlign: "center" }]}>
                  {maskedEmail
                    ? `Si este correo está registrado, recibirás un código de 8 dígitos en ${maskedEmail}`
                    : "Ingresa el código de 8 dígitos enviado a tu correo registrado"}
                </Text>

                {/* Success checkmark */}
                {otpSuccess && (
                  <View style={styles.otpSuccessWrap}>
                    <Text style={styles.otpSuccessIcon}>✓</Text>
                  </View>
                )}

                {/* 6 OTP digit inputs */}
                <View style={styles.otpRow}>
                  {otp.map((digit, i) => (
                    <TextInput
                      key={i}
                      ref={(el) => {
                        otpRefs.current[i] = el;
                      }}
                      style={[
                        styles.otpInput,
                        digit && styles.otpInputFilled,
                        otpError && styles.otpInputError,
                        otpSuccess && styles.otpInputSuccess,
                      ]}
                      value={digit}
                      onChangeText={(t) => handleOtpChange(t, i)}
                      onKeyPress={(e) => handleOtpKeyPress(e, i)}
                      keyboardType="number-pad"
                      maxLength={1}
                      selectTextOnFocus
                      editable={!otpSuccess}
                      selectionColor={C.accent}
                      accessibilityLabel={`Dígito ${i + 1}`}
                    />
                  ))}
                </View>

                {otpError && (
                  <Text style={styles.otpErrorMsg}>
                    Código incorrecto. Por favor inténtalo de nuevo.
                  </Text>
                )}

                {/* Validity progress bar */}
                <View style={styles.validityBar}>
                  <View
                    style={[styles.validityProgress, { width: otpBarPct }]}
                  />
                </View>
                <Text style={styles.validityLabel}>
                  Código válido por{" "}
                  <Text style={{ color: C.text, fontWeight: "600" }}>
                    {formatTime(otpSeconds)}
                  </Text>
                </Text>

                {/* Resend row */}
                <View style={styles.resendRow}>
                  <Text style={styles.resendText}>No recibí el código — </Text>
                  <TouchableOpacity
                    onPress={handleResend}
                    disabled={!resendEnabled}
                  >
                    <Text
                      style={[
                        styles.resendBtn,
                        resendEnabled && styles.resendBtnActive,
                      ]}
                    >
                      {resendEnabled
                        ? "Reenviar código"
                        : `Reenviar (${resendSeconds}s)`}
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  accessibilityRole="link"
                  style={{ alignSelf: "center", marginBottom: 16 }}
                >
                  <Text style={styles.otherMethod}>Usar otro método</Text>
                </TouchableOpacity>

                {/* Back */}
                <TouchableOpacity
                  style={styles.btnOutline}
                  onPress={() => {
                    setStep("credentials");
                    clearOTPState();
                  }}
                >
                  <Text style={styles.btnOutlineText}>← Volver</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  flex1: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 48 },

  // ── Left panel (.login-left) — compact header stacked above form on mobile
  leftPanel: {
    backgroundColor: "rgba(13,11,30,0.98)", // CSS: rgba(13,11,30,0.98)
    paddingHorizontal: 28,
    paddingTop: 48,
    paddingBottom: 32,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(139,92,246,0.18)", // CSS border-right color
    alignItems: "center", // CSS: align-items center
  },
  backBtn: { alignSelf: "flex-start", marginBottom: 20 },
  backBtnText: { fontSize: 14, color: C.accent70, fontWeight: "600" },

  // .login-brand-logo
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
    justifyContent: "center",
  },
  brandLogo: { width: 56, height: 56 },
  brandName: {
    fontSize: 44, // CSS: 64px — scaled for mobile readability
    fontWeight: "900",
    color: C.text,
    letterSpacing: 2, // CSS: letter-spacing 2px
  },

  // .login-slogan
  slogan: {
    fontSize: 20, // CSS: clamp(18px,2.5vw,24px) → ~20 on phone
    fontWeight: "700",
    color: "rgba(255,255,255,0.85)", // CSS exactly
    textAlign: "center",
    marginBottom: 40, // CSS: 40px
    lineHeight: 28,
  },

  // .login-bullets li
  bullets: { gap: 16, marginBottom: 48, width: "100%" }, // CSS: gap 16, mb 48
  bulletRow: { flexDirection: "row", alignItems: "center", gap: 12 }, // CSS: gap 12
  bulletCheck: {
    width: 24,
    height: 24,
    borderRadius: 12, // CSS: 50%
    backgroundColor: "rgba(139,92,246,0.20)",
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.55)", // CSS: rgba(139,92,246,0.55)
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  bulletCheckText: { fontSize: 12, color: C.accent70, fontWeight: "700" },
  bulletText: { fontSize: 15, color: "rgba(255,255,255,0.75)", flex: 1 }, // CSS: .75 opacity

  // ── Carousel (.login-carousel)
  carousel: {
    borderRadius: 16, // CSS: 16px
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.22)",
    marginTop: 12, // CSS: margin-top 12px
    width: "100%",
  },
  carouselImg: { width: "100%", aspectRatio: 4 / 3 }, // CSS: aspect-ratio 4/3
  carouselDotsWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 10,
    backgroundColor: "rgba(0,0,0,0.55)", // CSS: gradient transparent→rgba
  },
  carouselDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.30)", // CSS: rgba(255,255,255,0.30)
  },
  carouselDotActive: {
    backgroundColor: C.accent70, // CSS: rgba(167,139,250,1)
    transform: [{ scale: 1.3 }], // CSS: scale(1.5)
  },

  // ── Right panel (.login-right + .login-form-box)
  rightPanel: {
    paddingHorizontal: 24,
    paddingTop: 60, // CSS @900px: 60px top
    paddingBottom: 40,
    backgroundColor: "#000000", // CSS: background #000000
  },

  // .login-form-title
  formTitle: {
    fontSize: 28, // CSS: 28px (24px @600px)
    fontWeight: "700",
    color: C.text,
    marginBottom: 6,
  },
  // .login-form-sub
  formSub: {
    fontSize: 14,
    color: "rgba(255,255,255,0.60)", // CSS: rgba(255,255,255,0.60)
    marginBottom: 32, // CSS: 32px
    lineHeight: 20,
  },

  // ── Inputs (.float-group)
  floatGroup: { marginBottom: 20 }, // CSS: 20px
  floatLabel: {
    fontSize: 11,
    color: "rgba(167,139,250,0.90)", // CSS label focused state color
    marginBottom: 6,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  input: {
    height: 52,
    backgroundColor: "rgba(255,255,255,0.04)", // CSS: rgba(255,255,255,0.04)
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.30)", // CSS: rgba(139,92,246,0.30)
    borderRadius: 10, // CSS: 10px
    paddingHorizontal: 16,
    fontSize: 14,
    color: C.text,
  },
  inputErr: { borderColor: C.red },
  inputPassInner: {
    flex: 1,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
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
  eyeText: { fontSize: 16 },
  fieldError: { fontSize: 12, color: C.red, marginTop: 5 },

  // .forgot-link
  forgotWrap: { alignSelf: "flex-end", marginBottom: 24, marginTop: -8 },
  forgotLink: { fontSize: 13, color: "rgba(255,255,255,0.45)" }, // CSS: white 45% opacity

  globalError: {
    backgroundColor: C.redBg,
    borderWidth: 1,
    borderColor: C.redBorder,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  globalErrorText: { fontSize: 13, color: "rgba(255,255,255,0.75)" },

  // ── Buttons (.btn, .btn-primary, .btn-outline)
  btnPrimary: {
    height: 48, // CSS: 48px (44px @600px)
    backgroundColor: "#7c3aed", // CSS: gradient midpoint
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: { fontSize: 14, fontWeight: "600", color: C.text },
  btnOutline: {
    height: 48,
    backgroundColor: "rgba(255,255,255,0.05)", // CSS: rgba(255,255,255,0.05)
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.40)", // CSS: rgba(139,92,246,0.40)
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  btnOutlineText: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(255,255,255,0.85)",
  },

  // ── Divider (.login-divider)
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 24, // CSS: margin 24px 0
    marginBottom: 24,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: "rgba(139,92,246,0.22)" },
  dividerText: { fontSize: 12, color: "rgba(255,255,255,0.35)" },

  // ── OAuth (.btn-oauth)
  oauthBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 48,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.30)", // CSS: rgba(139,92,246,0.30)
    borderRadius: 12,
    marginBottom: 24,
  },
  googleGWrap: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  googleG: { fontSize: 12, fontWeight: "900", color: "#4285F4" },
  oauthText: {
    fontSize: 14,
    fontWeight: "500",
    color: "rgba(255,255,255,0.75)",
  },

  // ── Register link (.register-link)
  registerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
  },
  registerText: { fontSize: 13, color: "rgba(255,255,255,0.40)" },
  registerLink: { fontSize: 13, color: C.accent70, fontWeight: "600" },

  // ── 2FA icon (.twofa-icon)
  twofaIconWrap: {
    width: 72, // CSS: 72px
    height: 72,
    borderRadius: 36, // CSS: 50%
    backgroundColor: "rgba(139,92,246,0.12)",
    borderWidth: 2,
    borderColor: "rgba(139,92,246,0.45)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 24, // CSS: margin 0 auto 24px
  },
  twofaIconText: { fontSize: 32 }, // CSS: font-size 32px

  otpSuccessWrap: {
    width: 64, // CSS: 64px
    height: 64,
    borderRadius: 32,
    backgroundColor: C.greenBg,
    borderWidth: 2,
    borderColor: "rgba(34,197,94,0.55)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 16,
  },
  otpSuccessIcon: { fontSize: 28, color: C.green, fontWeight: "700" },

  // ── OTP inputs (.otp-row / .otp-input)
  otpRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: OTP_ROW_GAP,
    marginBottom: 8,
  },
  otpInput: {
    width: Math.min(
      48,
      (SCREEN_W - 48 - OTP_ROW_GAP * (OTP_LENGTH - 1)) / OTP_LENGTH,
    ),
    height: 52,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.35)", // CSS: rgba(139,92,246,0.35)
    borderRadius: 10, // CSS: 10px
    textAlign: "center",
    fontSize: 24, // CSS: 24px (20px @480px)
    fontWeight: "700",
    color: C.text,
  },
  otpInputFilled: {
    borderColor: "rgba(139,92,246,0.65)",
    backgroundColor: "rgba(139,92,246,0.08)",
  },
  otpInputError: { borderColor: C.red, backgroundColor: C.redBg },
  otpInputSuccess: { borderColor: C.green, backgroundColor: C.greenBg },

  otpErrorMsg: {
    fontSize: 13,
    color: C.red,
    textAlign: "center",
    marginTop: 12,
    marginBottom: 12,
  },

  // ── Validity bar (.otp-validity-bar)
  validityBar: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.08)", // CSS: rgba(255,255,255,0.08)
    borderRadius: 2,
    overflow: "hidden",
    marginTop: 20,
    marginBottom: 8,
  },
  validityProgress: {
    height: "100%",
    backgroundColor: "#7c3aed", // CSS: gradient #6d28d9→#8b5cf6
    borderRadius: 2,
  },
  validityLabel: {
    fontSize: 13,
    color: C.textMuted,
    textAlign: "center",
    marginBottom: 16,
  },

  // ── Resend row
  resendRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 16, // CSS: margin-top 16px
    marginBottom: 12,
  },
  resendText: { fontSize: 13, color: "rgba(255,255,255,0.40)" },
  resendBtn: {
    fontSize: 13,
    color: "rgba(255,255,255,0.30)",
    fontWeight: "600",
  },
  resendBtnActive: { color: C.accent70 },

  // .other-method-link
  otherMethod: { fontSize: 13, color: "rgba(255,255,255,0.35)" }, // CSS: rgba(255,255,255,0.35)
});
