// ════════════════════════════════════════════════════════════════════════
// onboardingInicialService.ts — bandera de "¿ya vio el carrusel de
// bienvenida (idioma/tema + rol) la primera vez que abrió la app?"
//
// GUÍA PARA PRINCIPIANTES:
// Solo guarda UN booleano en AsyncStorage (la misma cajita de
// almacenamiento del celular que ya usan ThemeContext.tsx y
// TranslationContext.tsx para recordar tema/idioma). No hay backend ni
// Firestore de por medio — es puramente local al dispositivo, a propósito:
// esta decisión debe tomarse ANTES de que exista ninguna sesión.
// ════════════════════════════════════════════════════════════════════════

import AsyncStorage from "@react-native-async-storage/async-storage";

const ONBOARDING_KEY = "@gradly_onboarding_visto";
// Mismas claves que usan ThemeContext.tsx (THEME_KEY) y
// TranslationContext.tsx (STORAGE_KEY) — se leen aquí SOLO como señal de
// "este dispositivo ya usó la app antes", nunca se escriben desde este
// archivo.
const THEME_KEY = "@gradly_theme";
const LANG_KEY = "@gradly/lang";

/**
 * true → debe mostrarse el carrusel (instalación nueva, nunca se marcó
 * como visto ni hay rastro de uso previo). false → saltar directo a
 * iniciosesion, igual que el comportamiento de siempre.
 */
export async function debeMostrarOnboardingInicial(): Promise<boolean> {
  try {
    const visto = await AsyncStorage.getItem(ONBOARDING_KEY);
    if (visto) return false;

    // La bandera nunca se escribió: puede ser instalación nueva, o un
    // dispositivo que ya usaba la app ANTES de que existiera esta bandera
    // (no hay forma de distinguirlos directamente). Si ese dispositivo ya
    // tiene guardada una preferencia de tema o idioma, es señal de que la
    // app ya se usó antes — se marca como "visto" sin mostrar el
    // carrusel, para no interrumpir a quien ya la conoce.
    const [temaGuardado, idiomaGuardado] = await Promise.all([
      AsyncStorage.getItem(THEME_KEY),
      AsyncStorage.getItem(LANG_KEY),
    ]);
    if (temaGuardado || idiomaGuardado) {
      await AsyncStorage.setItem(ONBOARDING_KEY, "1");
      return false;
    }

    return true;
  } catch {
    // Ante cualquier fallo de almacenamiento, no bloquear el acceso al
    // login por un problema de una función puramente decorativa.
    return false;
  }
}

/** Se llama al terminar o saltar el carrusel — nunca debe volver a aparecer. */
export async function marcarOnboardingInicialVisto(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_KEY, "1");
  } catch {
    /* no-op: si falla, en el peor caso el carrusel se ve una vez de más */
  }
}
