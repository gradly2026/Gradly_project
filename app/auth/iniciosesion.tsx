// ════════════════════════════════════════════════════════════════════════
// app/auth/iniciosesion.tsx — LA PANTALLA DE LOGIN (la real, no el stub)
//
// GUÍA PARA PRINCIPIANTES:
// Este es el archivo MÁS grande relacionado con autenticación del
// proyecto. Ofrece nada menos que 4 formas distintas de iniciar sesión,
// todas dentro de la MISMA pantalla, cambiando de "paso" (`Step`):
//   1. "credentials" → correo + contraseña (el login clásico).
//   2. "otp"          → código de 8 dígitos enviado por correo, SIN
//                        contraseña (ver GUIA — la app tiene su propio
//                        sistema de login por código, con Cloud Functions).
//   3. "reset-request" → recuperar contraseña: pide el mismo código OTP,
//                        pero además una contraseña NUEVA, y actualiza
//                        ambas cosas de una vez.
//   4. (fuera de `Step`, manejado aparte) → "magic link": un link que
//                        llega por correo y que la propia app INTERCEPTA
//                        al abrirse, sin que el usuario tenga que escribir
//                        nada — ver el useEffect "Interceptar el enlace
//                        mágico" más abajo.
// Es el mejor archivo para ver, en un solo lugar, la variedad de formas
// en que una app puede autenticar a un usuario contra Firebase Auth (y,
// en el caso de OTP, contra Cloud Functions propias del proyecto).
// ════════════════════════════════════════════════════════════════════════

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
// Linking: el módulo de Expo para trabajar con "deep links" (enlaces que
// abren la app directamente, en vez de un navegador) — se usa aquí para
// detectar cuándo la app se abrió a partir de un link de "magic link" de
// Firebase.
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
// Componente compartido: la barra superior simple (con logo/back) que
// aparece en pantallas fuera del área logueada, como login y registro.
import { useTranslation } from "../../src/context/TranslationContext";
import { auth } from "../../src/config/firebaseConfig";
import { useTheme, type GradlyColors } from "../../src/context/ThemeContext";
import { CORREO_TEMPORAL_KEY } from "../../src/services/authService";
import { consultarEstadoAcceso, solicitarOtp, verificarOtpYEntrar } from "../../src/services/otpService";
// Las 3 funciones que hablan con las Cloud Functions del sistema OTP (ver
// GUIA_05_ESTRUCTURA_PROYECTO.md, tabla de Cloud Functions):
//   - solicitarOtp(correo)                       → pide que se genere y
//     envíe por correo un código de 8 dígitos.
//   - verificarOtpYEntrar(correo, codigo, pass?)  → valida el código; si
//     es correcto, inicia sesión de verdad (y, si se le pasa una
//     contraseña nueva, también la actualiza — usado en el flujo de
//     recuperación).
//   - consultarEstadoAcceso(correo)                → sin necesitar sesión
//     iniciada, pregunta si esa cuenta está baneada/inactiva y por qué —
//     se usa cuando el login normal falla por "cuenta deshabilitada".
import {
  obtenerRolConReintento,
  rutaPorRol,
  verificarBloqueoCuenta,
  type BloqueoCuenta,
} from "../../src/utils/roleRouting";
// obtenerRolConReintento(uid) → lee el rol del usuario desde Firestore,
// REINTENTANDO varias veces si la primera lectura no lo encuentra
// (explicado más abajo, es clave para evitar una condición de carrera).
// verificarBloqueoCuenta(uid) → revisa si la cuenta está baneada/inactiva
// DESPUÉS de un login ya exitoso (a diferencia de consultarEstadoAcceso,
// que se usa cuando el login ni siquiera pudo completarse).
import { useLoginBackGuard } from "../../src/hooks/useSessionBackGuard";
// Hook que evita comportamientos raros del botón "atrás" del sistema
// mientras se está en la pantalla de login (por ejemplo, evitar que
// "atrás" saque al usuario de la app sin querer, en Android).

// ══════════════════════════════════════════════════════════════════
//  Design tokens — derivados del tema activo (claro / oscuro)
//  Mantiene los mismos nombres de token que usaba la paleta fija, pero
//  ahora se alimentan de useTheme().colors para que TODA la pantalla
//  (fondo, tarjetas, textos, inputs) cambie con el modo claro/oscuro.
// ══════════════════════════════════════════════════════════════════
const makeC = (colors: GradlyColors) => ({
  // A diferencia de app/auth/action.tsx (que usa una paleta LOCAL FIJA,
  // sin tema), esta pantalla SÍ reacciona al tema claro/oscuro del
  // usuario — makeC(colors) es una variante del patrón makeStyles(colors)
  // ya visto, pero aquí arma primero un diccionario de "tokens" con
  // nombres cortos (bg, surface, accent...) a partir de la paleta
  // GradlyColors, y ESE diccionario es lo que después usa makeStyles más
  // abajo — un nivel extra de indirección para mantener nombres de
  // variable más cortos en los estilos.
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
// "ReturnType<typeof makeC>" es un tipo CALCULADO: significa "el tipo que
// devuelve la función makeC" — así, si algún día se agrega o quita un
// token del diccionario de arriba, este tipo se actualiza solo, sin tener
// que escribir una interfaz aparte a mano.

const CAROUSEL_IMAGES = [
  "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=700&q=80",
  "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=700&q=80",
  "https://images.unsplash.com/photo-1517077304055-6e89abbf09b0?w=700&q=80",
  "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=700&q=80",
  "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=700&q=80",
  "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=700&q=80",
];
// Imágenes decorativas del carrusel del panel izquierdo (solo visible en
// escritorio/web ancho) — vienen de Unsplash, un banco de fotos gratuito,
// no de Firebase Storage.

// Claves de bullets del panel izquierdo (se traducen al renderizar).
const BULLET_KEYS = ["login_bullet_1", "login_bullet_2", "login_bullet_3"];

type Step = "credentials" | "magic-link" | "reset-request" | "otp";
// Nota: "magic-link" aparece en el tipo pero, revisando todo el archivo,
// nunca se le asigna realmente a `step` en ningún punto del código — el
// flujo de magic link se maneja por COMPLETO fuera del sistema de pasos
// (con sus propios estados `completingLink`/`showEmailPrompt`, ver más
// abajo), así que este valor del tipo queda sin usarse en la práctica.

// ══════════════════════════════════════════════════════════════════
//  Helpers
// ══════════════════════════════════════════════════════════════════
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(v.trim());

/** Devuelve la CLAVE de traducción del error; tradúcela con t(...) en el punto de uso. */
function mapFirebaseError(code: string): string {
  // Igual concepto que mapActionError() de action.tsx, pero esta versión
  // devuelve CLAVES de traducción ('fb_wrong_password') en vez de texto
  // final directo — porque esta pantalla sí tiene el sistema t() completo
  // disponible (a diferencia de action.tsx, que no usa traducción).
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
  // Los errores que devuelven las Cloud Functions de Firebase tienen sus
  // PROPIOS códigos estándar (distintos a los de Firebase Auth), como
  // "deadline-exceeded" (se agotó el tiempo) o "resource-exhausted"
  // (demasiadas solicitudes seguidas) — este helper los traduce a claves
  // de traducción legibles para el usuario.
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
  useLoginBackGuard();

  // Tema dinámico: tokens + estilos memorizados que reaccionan a claro/oscuro.
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const C = useMemo(() => makeC(colors), [colors]);
  const styles = useMemo(() => makeStyles(C), [C]);

  // Layout responsive: en web de escritorio (ancho grande) mostramos los dos
  // paneles lado a lado dentro de una "tarjeta"; en móvil se apilan.
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === "web" && width >= 1100;
  // Un segundo criterio de "responsive" además del breakpoint de 768 que
  // vimos en mensajes/index.tsx — aquí, 1100px, y ADEMÁS solo aplica en
  // web (Platform.OS === "web"): en un tablet nativo grande, por ejemplo,
  // esta pantalla seguiría apilando los paneles, aunque tenga espacio de
  // sobra, porque el diseño de 2 columnas está pensado específicamente
  // para navegador de escritorio.

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
  // GUÍA: nota que "otp" y "reset-request" tienen estados CASI
  // IDÉNTICOS, duplicados con nombres distintos (otpEmail vs resetEmail,
  // otpSent vs resetSent, etc.) — a propósito, en vez de compartir un
  // solo grupo de estados: así, si el usuario cambia de "olvidé mi
  // contraseña" a "acceso sin contraseña" (o viceversa) a mitad de
  // camino, cada flujo mantiene su propio progreso sin pisarse.

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
    // GUÍA: esta función resuelve una sutileza real del sistema de
    // baneos del proyecto. Hay 2 formas en que una cuenta puede estar
    // bloqueada:
    //   (a) Firebase Auth la tiene marcada como "disabled" — en ese caso,
    //       el LOGIN EN SÍ falla con el código "auth/user-disabled" ANTES
    //       de que exista ninguna sesión, así que no se puede usar
    //       verificarBloqueoCuenta() (que necesita un uid de sesión ya
    //       iniciada para leer Firestore).
    //   (b) El login SÍ tiene éxito (Firebase Auth no la tiene
    //       deshabilitada), pero el documento en Firestore dice que está
    //       "baneado" o "inactivo" — ese caso lo cubre
    //       verificarBloqueoCuenta(), llamado DESPUÉS de un login exitoso
    //       en varios de los handlers de abajo.
    // manejarPosibleBloqueo() cubre el caso (a): revisa si el error que
    // acaba de ocurrir es justo "user-disabled", y si es así, consulta el
    // MOTIVO vía una Cloud Function especial que no requiere sesión
    // (consultarEstadoAcceso), para poder mostrar el mismo modal
    // informativo en ambos casos (a) y (b).
    if (!String(err?.code ?? "").includes("user-disabled")) return false;
    const bloqueo = await consultarEstadoAcceso(correo);
    if (!bloqueo) return false;
    setBloqueoCuenta(bloqueo);
    return true;
    // Devuelve true/false para que quien la llama sepa si YA se manejó
    // el error (mostrando el modal) o si debe seguir con su propio manejo
    // de error genérico (ver los catch{} de los distintos handlers).
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
        // GUÍA DE "obtenerRolConReintento": ¿por qué haría falta
        // REINTENTAR una simple lectura de Firestore? Porque justo
        // después de crearse una cuenta nueva (o de un login recién
        // completado), puede haber una PEQUEÑA ventana de tiempo donde el
        // documento del usuario en Firestore todavía no está totalmente
        // "propagado"/disponible para lectura, o donde el token de
        // autenticación todavía no terminó de sincronizarse del todo con
        // los permisos de Firestore — leer una sola vez, justo en ese
        // instante, podría fallar o devolver vacío por pura mala suerte
        // de timing (una "condición de carrera"). obtenerRolConReintento
        // reintenta la lectura varias veces con pequeñas esperas entre
        // intentos, dándole tiempo a que todo se sincronice.
        const ruta = rutaPorRol(rol);

        // Rol indeterminado → NO degradar a estudiante: avisamos al usuario.
        if (!ruta) {
          Alert.alert(t('login_perfil_error_titulo'), t('login_perfil_error_msg'));
          return;
        }

        const bloqueo = await verificarBloqueoCuenta(result.user.uid);
        if (bloqueo) {
          await signOut(auth);
          // Si la cuenta está bloqueada, se CIERRA la sesión que se
          // acababa de abrir (no tiene sentido dejarla "medio adentro")
          // y se muestra el modal de bloqueo en su lugar.
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
        // GUÍA: este doble intento de navegación (inmediato + de
        // respaldo medio segundo después) es una medida defensiva contra
        // casos raros de navegadores/plataformas donde el primer
        // router.replace() no toma efecto correctamente justo después de
        // un cambio de estado de autenticación — más vale intentarlo dos
        // veces que dejar al usuario "atascado" en la pantalla de login
        // después de haber iniciado sesión con éxito.
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
      // Si la URL actual/entrante NO es un link válido de "magic link" de
      // Firebase, no hace nada — deja que la pantalla se muestre
      // normalmente.

      const stored = await AsyncStorage.getItem(CORREO_TEMPORAL_KEY);
      if (stored && stored.trim()) {
        await completeSignIn(stored.trim().toLowerCase(), url);
        return;
        // Camino RÁPIDO: si el correo quedó guardado (el link se abrió en
        // el MISMO dispositivo donde se pidió), completa el login
        // automáticamente, sin pedirle nada al usuario.
      }

      // Fallback inmediato: correo nulo/vacío → modal para confirmarlo.
      setPendingUrl(url);
      setPromptEmail("");
      setPromptError("");
      setShowEmailPrompt(true);
      // Camino de RESPALDO: guarda la URL pendiente y muestra el modal
      // para que el usuario escriba su correo manualmente (mismo patrón
      // ya visto en action.tsx).
    };

    // Web: el enlace llega como la URL de la página actual.
    if (
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      window.location?.href
    ) {
      handleUrl(window.location.href);
      // En web, el link de Firebase literalmente ES la URL que el
      // usuario abrió (el navegador cargó esta misma pantalla porque el
      // link apuntaba aquí) — así que se revisa la URL actual del
      // navegador.
    }

    // Cold start nativo: app abierta directamente desde el enlace.
    Linking.getInitialURL().then(handleUrl);
    // "Cold start" (arranque en frío): el usuario tocó el link estando la
    // app COMPLETAMENTE CERRADA — el sistema operativo abre la app de
    // cero, y Linking.getInitialURL() permite preguntar "¿con qué URL me
    // abrieron?".

    // Warm start: app ya abierta cuando llega el enlace.
    const sub = Linking.addEventListener("url", (event) => handleUrl(event.url));
    // "Warm start" (arranque en caliente): la app YA estaba abierta (en
    // segundo plano, por ejemplo) cuando el usuario tocó el link —
    // Linking.addEventListener("url", ...) se suscribe a ese evento en
    // vivo, para los casos donde la app no necesitó reiniciarse.
    return () => sub.remove();
    // Cancela la suscripción al desmontar (mismo patrón de "limpieza" ya
    // visto en useEffect + onSnapshot).
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
    // Patrón de validación "acumulativa": en vez de detenerse en el
    // PRIMER campo inválido, revisa TODOS los campos y marca el error de
    // cada uno que falle, para que el usuario vea de una vez todo lo que
    // debe corregir, en vez de un error a la vez tras cada intento.

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
  // Este handler define el "esqueleto" que se repite (con variaciones)
  // en los otros 2 flujos: autenticar → leer rol con reintento → resolver
  // ruta → verificar bloqueo → navegar. Vale la pena reconocerlo, porque
  // se repite CASI IDÉNTICO en handleVerificarReset y handleVerificarOtp
  // más abajo.

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
      // /^\d{8}$/ es una expresión regular: "el texto completo debe ser
      // EXACTAMENTE 8 dígitos, nada más" (^ inicio, \d{8} 8 dígitos, $ fin).
    }
    if (resetPassword.length < 6) {
      setResetError(t('reset_password_corta'));
      return;
    }

    setResetVerifying(true);
    try {
      // Verifica el código, cambia la contraseña e inicia la sesión real.
      const uid = await verificarOtpYEntrar(resetEmail, codigo, resetPassword);
      // Aquí se le pasa la NUEVA contraseña como tercer argumento (a
      // diferencia de handleVerificarOtp más abajo, que no la pasa) — la
      // Cloud Function detrás de esta llamada, al recibirla, ACTUALIZA la
      // contraseña de la cuenta usando el Admin SDK (con permisos totales
      // en el servidor) Y de paso deja la sesión iniciada, todo en una
      // sola llamada.

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
      // Sin tercer argumento (no hay contraseña nueva que actualizar) —
      // este es el acceso SIN contraseña, no una recuperación.

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
    // Precarga el correo que el usuario ya había escrito en el paso de
    // login (si lo había escrito), para no hacerlo escribirlo de nuevo.
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
  // 3 funciones cortas para cambiar de "paso", cada una reiniciando el
  // estado del flujo AL QUE SE ENTRA (para que no queden restos de un
  // intento anterior) — no del que se abandona (esos estados simplemente
  // quedan "congelados" hasta que se vuelva a entrar a ese paso).

  // ══════════════════════════════════════════════════════════════
  //  Pantalla de "completando enlace"
  // ══════════════════════════════════════════════════════════════
  if (completingLink) {
    // Mientras se procesa un magic link (justo después de que
    // handleUrl/completeSignIn arrancan), TODA la pantalla se reemplaza
    // por un simple loader — el formulario normal ni se dibuja.
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
            {/* Este panel completo (logo, eslogan, 3 bullets con check,
                carrusel de fotos) es puramente DECORATIVO/informativo —
                en móvil se apila ARRIBA del formulario; en escritorio
                ancho queda como columna IZQUIERDA fija, gracias a
                isDesktopWeb. */}
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
                  // "(_, i)" — el primer parámetro del .map() (el valor de
                  // cada imagen) se ignora a propósito (nombrado "_" por
                  // convención, "no me interesa este valor"), solo
                  // interesa el índice `i` para dibujar los puntos.
                  <TouchableOpacity
                    key={i}
                    onPress={() => {
                      setCarouselIndex(i);
                      startCarousel();
                      // Al tocar un punto manualmente, además de saltar a
                      // esa imagen, se REINICIA el temporizador automático
                      // (startCarousel), para que no cambie de nuevo
                      // "demasiado pronto" justo después de la elección
                      // manual del usuario.
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
                  // Nota: aquí `style` recibe una FUNCIÓN, no un array
                  // directo — Pressable soporta esta forma para poder
                  // acceder al estado `pressed` (¿está el dedo/mouse
                  // presionando AHORA MISMO?) y ajustar el estilo en
                  // consecuencia, algo que TouchableOpacity no ofrece
                  // directamente.
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
                {/* Este bloque tiene 2 sub-estados propios, controlados por
                    `otpSent`: ANTES de enviar el código (solo pide el
                    correo) y DESPUÉS de enviarlo (pide el código de 8
                    dígitos). Mismo patrón de "2 sub-pasos" se repite en el
                    bloque "reset-request" más abajo, con `resetSent`. */}
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
                      {/* Frase partida en 3 pedazos (pre + correo + post)
                          para poder insertar el correo del usuario
                          RESALTADO (color distinto, negrita) justo en
                          medio de la oración traducida. */}
                    </Text>

                    <View style={styles.floatGroup}>
                      <Text style={styles.floatLabel}>{t('otp_label_codigo')}</Text>
                      <TextInput
                        style={[styles.input, styles.otpInput, !!otpError && styles.inputErr]}
                        value={otpCodigo}
                        onChangeText={(v) => {
                          setOtpCodigo(v.replace(/[^\d]/g, "").slice(0, 8));
                          // Filtra CUALQUIER carácter que no sea dígito
                          // (\D o [^\d], "no dígito") apenas se escribe,
                          // y corta a 8 caracteres máximo — así el campo
                          // nunca permite escribir letras ni más de 8
                          // números, sin necesitar validarlo después.
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
              // Mismo patrón de 2 sub-pasos que "otp" (controlado ahora
              // por `resetSent`), con la diferencia de que el segundo
              // sub-paso pide TAMBIÉN una contraseña nueva, no solo el
              // código.
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
              {/* El texto del modal cambia según el TIPO de bloqueo: un
                  baneo (decisión de un administrador) es un mensaje
                  distinto a una cuenta simplemente "inactiva". */}
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
                // "mailto:correo@ejemplo.com" es un esquema de URL
                // especial que abre la app de correo predeterminada del
                // dispositivo, con ese destinatario ya puesto.
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
      // flexShrink: 0 evita que este círculo se "achique" si el texto de
      // al lado es muy largo y el espacio se pone justo — mantiene su
      // tamaño fijo siempre.
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
    // aspectRatio: 4/3 mantiene la proporción de la imagen (ancho:alto =
    // 4:3) sin importar el ancho real disponible — la altura se calcula
    // automáticamente a partir del ancho.
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
      // El punto activo se ve un 30% más grande que los demás.
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
    // (No usados directamente en el JSX actual — quedaron de una versión
    // anterior del diseño; no rompen nada estando definidos sin aplicar.)

    // Input del código OTP (centrado, grande, espaciado)
    otpInput: {
      textAlign: "center",
      fontSize: 24,
      fontWeight: "700",
      letterSpacing: 12,
      // letterSpacing muy grande (12) separa cada dígito visualmente,
      // como en apps bancarias reales, para que un código de 8 dígitos
      // se lea más fácil de un vistazo.
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
