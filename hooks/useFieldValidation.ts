// ── Funciones de validación del proyecto Gradly ──────────────────────────────

/** Solo letras (incluyendo acentos y ñ) y espacios */
export const soloLetras = (texto: string): boolean =>
  /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/.test(texto);

/** Letras, números, acentos, ñ, espacios, comas, puntos, guiones, # y paréntesis */
export const soloLetrasNumeros = (texto: string): boolean =>
  /^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s,.\-#()]+$/.test(texto);

/** Email válido */
export const esEmail = (texto: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto);

/** Teléfono El Salvador: 0000-0000 o 00000000 */
export const esTelefono = (texto: string): boolean =>
  /^[0-9]{4}-?[0-9]{4}$/.test(texto);

/** URL válida, con prefijo opcional */
export const esURL = (texto: string, prefijo?: string): boolean => {
  try {
    const url = new URL(texto);
    if (prefijo) return texto.startsWith(prefijo);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

/** URL de Google Maps */
export const esMaps = (texto: string): boolean =>
  texto.startsWith("https://maps.google.com") ||
  texto.startsWith("https://goo.gl/maps") ||
  texto.startsWith("https://maps.app.goo.gl");

/** URL de Google Meet */
export const esMeet = (texto: string): boolean =>
  texto.startsWith("https://meet.google.com");

/** Contraseña: mínimo 8 caracteres, al menos una mayúscula y un número */
export const esPassword = (texto: string): boolean =>
  texto.length >= 8 && /[A-Z]/.test(texto) && /[0-9]/.test(texto);

/** Número entre min y max (inclusive) */
export const esNumero = (
  val: string | number,
  min: number,
  max: number,
): boolean => {
  const n = typeof val === "string" ? parseFloat(val) : val;
  return !isNaN(n) && n >= min && n <= max;
};

/** Número de tarjeta bancaria: 16 dígitos */
export const esTarjeta = (texto: string): boolean =>
  /^[0-9]{16}$/.test(texto.replace(/\s/g, ""));

/** Fecha MM/YY no vencida */
export const esFechaVigente = (texto: string): boolean => {
  const match = texto.match(/^(\d{2})\/(\d{2})$/);
  if (!match) return false;
  const month = parseInt(match[1], 10);
  const year = parseInt("20" + match[2], 10);
  if (month < 1 || month > 12) return false;
  const expiry = new Date(year, month, 1);
  return expiry > new Date();
};

/** CVV: 3 o 4 dígitos */
export const esCVV = (texto: string): boolean => /^[0-9]{3,4}$/.test(texto);

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useFieldValidation() {
  return {
    soloLetras,
    soloLetrasNumeros,
    esEmail,
    esTelefono,
    esURL,
    esMaps,
    esMeet,
    esPassword,
    esNumero,
    esTarjeta,
    esFechaVigente,
    esCVV,
  };
}

export default useFieldValidation;
