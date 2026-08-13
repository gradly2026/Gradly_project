// ════════════════════════════════════════════════════════════════════════
// app/auth/action.tsx — RUTA "/auth/action"
//
// GUÍA PARA PRINCIPIANTES:
// Esta pantalla existe para procesar los LINKS que Firebase Auth envía por
// correo electrónico. Cuando un usuario pide "recuperar mi contraseña",
// Firebase le manda un correo con un link que apunta de vuelta a esta
// misma pantalla, con información especial codificada en la URL (el
// "modo" de la acción, y un código de un solo uso llamado `oobCode`).
// Esta pantalla lee esos datos de la URL y decide QUÉ hacer:
//   - "resetPassword" → mostrar un formulario para poner una contraseña nueva.
//   - "verifyEmail"    → confirmar que el correo del usuario es válido.
//   - "recoverEmail"   → deshacer un cambio de correo no autorizado.
//   - "signIn"          → completar un inicio de sesión sin contraseña
//                          (login por "magic link", un correo con un link
//                          que ya funciona como si fuera la contraseña).
// Es un buen ejemplo de una pantalla que se comporta como una "máquina de
// estados": en cada momento está en UNA fase (`Phase`) específica, y solo
// una parte del JSX se dibuja según cuál sea esa fase.
// ════════════════════════════════════════════════════════════════════════

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
// 5 funciones de Firebase Auth, todas relacionadas con procesar estos
// "códigos de acción" (oobCode = "out of band code", un código que llega
// por FUERA del flujo normal de la app, es decir, por correo):
//   - verifyPasswordResetCode(auth, oobCode) → valida que el código de
//     reseteo de contraseña sea legítimo y no haya expirado; devuelve el
//     CORREO de la cuenta asociada (útil para mostrarlo en pantalla,
//     "vas a cambiar la contraseña de fulano@correo.com").
//   - confirmPasswordReset(auth, oobCode, nuevaContraseña) → aplica de
//     verdad el cambio de contraseña.
//   - applyActionCode(auth, oobCode) → aplica una acción genérica (aquí
//     se usa para "verificar correo" y "recuperar correo anterior").
//   - isSignInWithEmailLink(auth, url) → revisa si una URL dada
//     corresponde a un link válido de inicio de sesión sin contraseña.
//   - signInWithEmailLink(auth, correo, url) → completa el inicio de
//     sesión usando ese link + el correo del usuario.

import { doc, getDoc } from "firebase/firestore";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,


  TouchableOpacity,
  View,
} from "react-native";
import { AutoText as Text, AutoTextInput as TextInput } from "../../src/components/AutoText";
// AutoTextInput: la versión de <TextInput> (el campo de texto de React
// Native) que auto-traduce su `placeholder` — ya explicada en el archivo
// src/components/AutoText.tsx (mencionado en GUIA_02_TRADUCTOR_I18N.md).

import { auth, db } from "../../src/config/firebaseConfig";
import type { UserRole } from "../../src/context/AuthContext";
import { CORREO_TEMPORAL_KEY } from "../../src/services/authService";
// Nota: aunque el import dice ".../authService", este archivo vive en
// services/authService.ts (la raíz, no src/services/) — CORREO_TEMPORAL_KEY
// es la clave de AsyncStorage donde se guarda TEMPORALMENTE el correo del
// usuario mientras espera a que llegue y se abra su "magic link" de
// inicio de sesión (necesario porque signInWithEmailLink pide el correo
// como parámetro, y si el link se abre en el MISMO dispositivo donde se
// pidió, se puede recuperar solo, sin pedírselo de nuevo al usuario).

// ══════════════════════════════════════════════════════════════════
//  Design tokens (modo oscuro) — alineados con iniciosesion.tsx
// ══════════════════════════════════════════════════════════════════
const C = {
  // Una paleta de colores LOCAL a este archivo (no usa useTheme() ni
  // ThemeContext) — esta pantalla siempre se ve en modo oscuro fijo,
  // porque el usuario llega aquí desde un LINK de correo, típicamente
  // ANTES incluso de haber iniciado sesión (donde su preferencia de tema
  // guardada podría no estar disponible todavía). "C" es solo el nombre
  // corto elegido para esta constante (de "Colors").
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
// Estos 4 valores son EXACTAMENTE los que Firebase Auth escribe en la URL
// del correo (parámetro ?mode=...) — no se inventan en este proyecto, son
// parte del contrato de Firebase.

// ── Fases internas de la pantalla ─────────────────────────────────
type Phase =
  | "loading" // verificando el código / la URL
  | "resetForm" // pidiendo la nueva contraseña
  | "needEmail" // magic link abierto sin correo en almacenamiento
  | "success" // acción completada con éxito
  | "error"; // código inválido / expirado u otro fallo
// A diferencia de `Mode` (que viene de Firebase), `Phase` es un concepto
// PROPIO de este componente: representa en qué momento visual está la
// pantalla. Un mismo `mode` puede pasar por varias `Phase` (por ejemplo,
// "resetPassword" empieza en "loading", pasa a "resetForm", y termina en
// "success" o "error").

// ══════════════════════════════════════════════════════════════════
//  Helpers
// ══════════════════════════════════════════════════════════════════
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(v.trim());
// Expresión regular simple para validar formato de correo: "algo@algo.algo"
// (sin espacios antes/después de la @, con un dominio de al menos 2
// letras al final). No es una validación perfecta de correos (ningún
// regex simple lo es), pero es suficiente para detectar errores obvios de
// tipeo antes de enviar la solicitud.

function mapActionError(code: string): string {
  // Traduce los códigos técnicos de error de Firebase Auth (en inglés,
  // tipo "auth/expired-action-code") a mensajes legibles en español —
  // mismo concepto que mapAuthError() en services/authService.ts.
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
  // Igual concepto que `rutaPorRol` de app/index.tsx: decide a qué
  // dashboard mandar según el rol, para después de un inicio de sesión
  // exitoso por magic link.
  switch (rol) {
    case "admin":
      return "/admin";
    case "universidad":
      return "/dashboard-universidad";
    case "empresa":
      return "/dashboard-empresa";
    case "estudiante":
    default:
      // El "default" cubre tanto rol === 'estudiante' explícito como
      // cualquier otro valor inesperado (null, undefined) — por defecto,
      // manda a las pestañas del estudiante.
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
  // En nativo (Android/iOS), no existe `window`, así que esta función
  // devuelve cadena vacía — coherente con el comentario: en esos casos,
  // OTRO archivo (iniciosesion.tsx) es quien intercepta el link antes de
  // que se llegue aquí.
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
  // Lee TODOS los parámetros que Firebase agrega a la URL del correo.
  // Varios de ellos (apiKey, continueUrl, lang) se reciben pero NO se
  // usan en este archivo — Firebase los agrega igual por su propio
  // protocolo interno, y esta pantalla solo toma los 2 que necesita
  // (mode, oobCode).

  const mode = params.mode as Mode | undefined;
  const oobCode = typeof params.oobCode === "string" ? params.oobCode : "";
  // "typeof params.oobCode === 'string'" es una comprobación defensiva:
  // useLocalSearchParams podría, en teoría, devolver un array de strings
  // si el parámetro se repitiera en la URL — aquí se asegura de tratarlo
  // como texto simple, o cadena vacía si no vino en ese formato.

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
  // useRef (no useState) a propósito: esta bandera NO debe provocar un
  // repintado al cambiar, solo sirve como "candado" interno. React, en
  // modo de desarrollo estricto (StrictMode), a veces ejecuta un mismo
  // efecto DOS VECES seguidas a propósito (para ayudar a detectar bugs) —
  // sin este candado, se podría intentar canjear el mismo oobCode dos
  // veces, y Firebase lo rechazaría la segunda vez por ser de un solo uso.

  // ── Completar inicio de sesión con enlace mágico ──────────────────
  const completeSignIn = useCallback(
    async (correo: string) => {
      setPhase("loading");
      try {
        const url = currentUrl();
        const result = await signInWithEmailLink(auth, correo, url);
        // Firebase valida el link contra el correo dado, y si coincide,
        // inicia sesión — `result.user` es la cuenta recién autenticada.
        await AsyncStorage.removeItem(CORREO_TEMPORAL_KEY);
        // Ya no hace falta guardar el correo temporal, se limpia.

        let rol: UserRole | null = null;
        try {
          const snap = await getDoc(doc(db, "usuarios", result.user.uid));
          rol = snap.exists() ? (snap.data()?.rol as UserRole) : null;
          // READ: busca el rol del usuario recién logueado para saber a
          // dónde mandarlo.
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
  // useCallback aquí memoriza la función para que no cambie de
  // referencia en cada render (se usa como dependencia del useEffect de
  // abajo, y también se le pasa a un botón más adelante).

  // ── Despacho inicial según el `mode` ──────────────────────────────
  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;
    // El candado explicado arriba: la primera vez que este efecto corre,
    // se marca como "ya manejado" ANTES de hacer nada asíncrono, así una
    // segunda ejecución del efecto (por StrictMode) se detiene aquí mismo.

    (async () => {
      // resetPassword / verifyEmail / recoverEmail requieren oobCode.
      if (mode !== "signIn" && !oobCode) {
        setErrorMsg("Enlace incompleto. Falta el código de la acción.");
        setPhase("error");
        return;
      }

      try {
        switch (mode) {
          // Este switch es el "despachador" central: según el modo que
          // vino en la URL, decide qué hacer. Cada "case" es uno de los 4
          // flujos posibles de Firebase Auth.

          case "resetPassword": {
            // Valida el código y obtiene el correo asociado antes del formulario.
            const correo = await verifyPasswordResetCode(auth, oobCode);
            setAccountEmail(correo);
            setPhase("resetForm");
            return;
            // No se cambia la contraseña TODAVÍA — solo se valida que el
            // link sea legítimo y se pasa a mostrar el formulario (fase
            // "resetForm"). El cambio real ocurre en handleConfirmReset()
            // más abajo, cuando el usuario complete y envíe el formulario.
          }

          case "verifyEmail": {
            await applyActionCode(auth, oobCode);
            // Este SÍ aplica la acción de inmediato (no requiere ningún
            // formulario adicional): confirma que el correo es válido.
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
            // Intenta recuperar el correo que se guardó cuando el usuario
            // PIDIÓ el link de acceso (si el link se abre en el MISMO
            // dispositivo/navegador, este dato debería seguir ahí).
            if (stored) {
              await completeSignIn(stored.toLowerCase());
              // Camino RÁPIDO: si se encontró el correo guardado, se
              // completa el login automáticamente sin pedirle nada al
              // usuario.
            } else {
              // Abierto en otro dispositivo: pedir el correo de nuevo.
              setPhase("needEmail");
              // Camino de RESPALDO: si el usuario abrió el link en OTRO
              // dispositivo (por ejemplo, pidió el link desde el celular
              // pero lo abrió desde la laptop), no hay forma de saber su
              // correo automáticamente — se le pide que lo escriba de
              // nuevo, como medida de seguridad extra (así solo quien
              // realmente conoce el correo puede completar el acceso).
            }
            return;
          }

          default:
            setErrorMsg("Acción desconocida o no soportada.");
            setPhase("error");
            // Si `mode` fuera cualquier otro valor no reconocido (o
            // undefined, por ejemplo si alguien visitara esta ruta sin
            // venir de un correo real de Firebase), se muestra un error
            // genérico.
        }
      } catch (err: any) {
        setErrorMsg(mapActionError(err?.code ?? ""));
        setPhase("error");
      }
    })();
  }, [mode, oobCode, completeSignIn]);

  // ── Confirmar nueva contraseña ────────────────────────────────────
  const handleConfirmReset = async () => {
    // Se ejecuta al enviar el formulario de la fase "resetForm".
    setFormError("");
    if (password.length < 6) {
      setFormError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== password2) {
      setFormError("Las contraseñas no coinciden.");
      return;
    }
    // 2 validaciones simples del lado del cliente ANTES de gastar una
    // llamada a Firebase: largo mínimo, y que las 2 contraseñas escritas
    // coincidan entre sí.

    setSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      // Aquí sí se aplica el cambio de contraseña de verdad.
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
    // Se ejecuta al enviar el formulario de la fase "needEmail" (cuando
    // se pidió el correo manualmente).
    const correo = promptEmail.trim().toLowerCase();
    if (!isEmail(correo)) {
      setPromptError("Ingresa un correo válido.");
      return;
    }
    completeSignIn(correo);
  };

  const goToLogin = () => router.replace("/auth/iniciosesion" as any);
  // Función corta reutilizada por los botones de las fases "success" y
  // "error" para volver a la pantalla de login.

  // ══════════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════════
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.card}>
        {/* Cada uno de los 5 bloques siguientes usa el patrón
            "{condicion && <JSX/>}": solo UNO de ellos se dibuja a la vez,
            según el valor actual de `phase`. */}

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
              {/* Un <Text> anidado DENTRO de otro <Text> — React Native
                  permite esto para aplicar un estilo distinto (aquí,
                  emphasis) a solo una PARTE del texto de un párrafo,
                  igual que un <span> dentro de un <p> en HTML. */}
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
                    // Limpia el error de formulario apenas el usuario
                    // vuelve a escribir, para no dejarlo mostrado tras
                    // corregir el problema.
                  }}
                  placeholder="Mínimo 6 caracteres"
                  placeholderTextColor={C.textMuted}
                  secureTextEntry={!showPass}
                  // secureTextEntry oculta el texto escrito (puntos en
                  // vez de letras) — se invierte según `showPass`.
                  autoCapitalize="none"
                  selectionColor={C.accent}
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowPass((v) => !v)}
                  accessibilityLabel={
                    showPass ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  // accessibilityLabel: texto que leen los lectores de
                  // pantalla (para personas con discapacidad visual) en
                  // vez del ícono, que no tiene texto visible.
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
                // onSubmitEditing: se dispara al presionar "Listo"/"Done"
                // en el teclado del celular — permite enviar el
                // formulario sin tener que tocar el botón.
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
                // keyboardType="email-address" hace que el teclado
                // móvil muestre atajos útiles para correos (como el @).
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
// Nota: a diferencia del patrón makeStyles(colors) visto en otras
// pantallas, aquí los estilos se definen UNA sola vez con el objeto fijo
// `C` de arriba — coherente con que esta pantalla no reacciona al tema
// claro/oscuro del usuario (ver la explicación al inicio del archivo).
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
    maxWidth: 440,           // en pantallas muy anchas (escritorio), la tarjeta no se estira de más
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
    // Se combina con iconWrap (ver style={[styles.iconWrap, styles.iconWrapOk]})
    // para sobrescribir solo el color, en el caso de éxito.
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
  // Las esquinas derechas quedan "cuadradas" a propósito, porque
  // justo a la derecha va pegado el botón del ojo (eyeBtn), formando
  // visualmente un solo campo compuesto.
  passwordRow: { flexDirection: "row", alignItems: "stretch" },
  eyeBtn: {
    width: 44,
    height: 52,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderLeftWidth: 0,        // sin borde izquierdo, para "fundirse" con el input de al lado
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
