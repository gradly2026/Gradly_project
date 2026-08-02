/**
 * AutoText — reemplazo directo (drop-in) de <Text> que traduce el texto al
 * vuelo según el idioma activo.
 *
 * Uso explícito:
 *   <AutoText style={s.titulo}>{vacante.titulo}</AutoText>
 *
 * Uso como drop-in de TODO un archivo (traduce cada <Text> sin editarlos uno a
 * uno) — se cambia solo el import:
 *   // import { Text } from "react-native";
 *   import { AutoText as Text } from "../components/AutoText";
 *
 * Reglas de seguridad:
 *   - Solo traduce cuando los `children` son un STRING plano. Si son número,
 *     ícono, o <Text> anidados (array/elemento), se renderizan TAL CUAL → nunca
 *     rompe un <Text> con hijos mixtos.
 *   - En español devuelve el texto tal cual (sin llamadas de red).
 *   - En inglés muestra el original mientras llega la traducción y luego la
 *     sustituye; el resultado se cachea (memoria + AsyncStorage) → una sola vez.
 *   - El texto ESTÁTICO reutilizable puede seguir usando t('clave') (offline).
 */
import { forwardRef, useEffect, useReducer } from "react";
import {
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
} from "react-native";
import { useTranslation } from "../context/TranslationContext";
import {
  getCachedTranslation,
  requestTranslation,
  subscribeTranslations,
} from "../services/translationService";

/** Hook: devuelve la versión traducida del texto para el idioma activo. */
export function useAutoText(text?: string | null): string {
  const { language } = useTranslation();
  const [, force] = useReducer((c) => c + 1, 0);
  const value = text ?? "";

  useEffect(() => {
    if (language === "es" || !value.trim()) return;
    if (getCachedTranslation(language, value) === undefined) {
      requestTranslation(language, value);
    }
    const unsub = subscribeTranslations(force);
    return unsub;
  }, [language, value]);

  if (language === "es" || !value.trim()) return value;
  return getCachedTranslation(language, value) ?? value;
}

/**
 * <Text> que se auto-traduce. Seguro como reemplazo de react-native <Text>:
 *  - hijo string plano  → se traduce.
 *  - hijos que son un array SOLO de strings/números (p. ej.
 *    `{plan} · {empresa}` o `{label} ({count})`) → se unen y se traducen juntos.
 *  - cualquier otra cosa (íconos, <Text> anidados, elementos) → se deja intacto.
 */
export function AutoText({ children, ...rest }: TextProps) {
  let plano: string | null = null;
  if (typeof children === "string") {
    plano = children;
  } else if (
    Array.isArray(children) &&
    children.every((c) => typeof c === "string" || typeof c === "number")
  ) {
    plano = children.map(String).join("");
  }
  const translated = useAutoText(plano ?? "");
  return <Text {...rest}>{plano !== null ? translated : children}</Text>;
}

/**
 * <TextInput> que auto-traduce su `placeholder`. Reemplazo directo (drop-in) de
 * react-native TextInput. Usa forwardRef para conservar `.focus()`/`.blur()`.
 */
export const AutoTextInput = forwardRef<TextInput, TextInputProps>(
  ({ placeholder, ...rest }, ref) => {
    const isStr = typeof placeholder === "string";
    const ph = useAutoText(isStr ? (placeholder as string) : "");
    return <TextInput ref={ref} {...rest} placeholder={isStr ? ph : placeholder} />;
  },
);
AutoTextInput.displayName = "AutoTextInput";

export default AutoText;
