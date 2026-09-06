// ════════════════════════════════════════════════════════════════════════
// validacionesSV.ts — validaciones de documento / teléfono / redes para El
// Salvador, SIN guiones (todo de corrido). Replican las reglas de
// app/auth/registro.tsx (donde viven como funciones locales) para reusarlas
// en la sección "Información personal" del estudiante y en los modales de
// captura de datos personales.
// ════════════════════════════════════════════════════════════════════════

export type DocTipoSV = 'dui' | 'pasaporte' | 'licencia' | '';

interface ReglaDoc {
  maxLen: number;
  pattern: RegExp;
  hint: string;
  numeric?: boolean;
  upper?: boolean;
}

export const REGLAS_DOC: Record<Exclude<DocTipoSV, ''>, ReglaDoc> = {
  dui: {
    maxLen: 9,
    pattern: /^\d{9}$/,
    hint: 'DUI: 9 dígitos sin guion (ej: 123456789)',
    numeric: true,
  },
  pasaporte: {
    maxLen: 8,
    pattern: /^[A-Z]\d{7}$/,
    hint: 'Pasaporte: 1 letra + 7 dígitos (ej: A1234567)',
    upper: true,
  },
  licencia: {
    maxLen: 10,
    pattern: /^\d{10}$/,
    hint: 'Licencia: 10 dígitos sin guion',
    numeric: true,
  },
};

/** Limpia la entrada del documento según su tipo (bloquea guiones y símbolos). */
export function limpiarDocumento(v: string, tipo: DocTipoSV): string {
  if (!tipo) return v.replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
  const r = REGLAS_DOC[tipo];
  if (r.numeric) return v.replace(/\D/g, '').slice(0, r.maxLen);
  return v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, r.maxLen);
}

/** '' si es válido; mensaje de error si no. Vacío = "requerido". */
export function validarDocumento(tipo: DocTipoSV, v: string): string {
  const d = v.trim();
  if (!d) return 'Ingresa tu número de documento';
  if (!tipo) return 'Elige el tipo de documento';
  return REGLAS_DOC[tipo].pattern.test(d) ? '' : REGLAS_DOC[tipo].hint;
}

/** Teléfono SV: solo dígitos, máximo 8. */
export function limpiarTelefono(v: string): string {
  return v.replace(/\D/g, '').slice(0, 8);
}

export function validarTelefono(v: string): string {
  const d = v.replace(/\D/g, '');
  if (!d) return 'Ingresa tu teléfono';
  if (d.length < 8) return 'El número debe tener 8 dígitos';
  return '';
}

const RX_FB = /^(https?:\/\/)?(www\.)?facebook\.com\/[A-Za-z0-9.]{1,60}\/?$/;
const RX_FB_HANDLE = /^[A-Za-z0-9.]{2,60}$/;
const RX_IG = /^@?[A-Za-z0-9_.]{1,30}$/;
const RX_IG_URL = /^(https?:\/\/)?(www\.)?instagram\.com\/[A-Za-z0-9_.]{1,30}\/?$/;
const RX_LINKEDIN = /^(https?:\/\/)?(www\.)?linkedin\.com\/(in|pub|company)\/[A-Za-z0-9\-_%]{2,120}\/?$/;
const RX_DESC = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ0-9\s.,;:¿?¡!()'"%/\-\n]+$/;

/** Todos los validadores de abajo son OPCIONALES: vacío = válido. */
export function validarFacebook(v: string): string {
  const t = v.trim();
  if (!t) return '';
  return RX_FB.test(t) || RX_FB_HANDLE.test(t) ? '' : 'Ej: facebook.com/tu-perfil';
}

export function validarInstagram(v: string): string {
  const t = v.trim();
  if (!t) return '';
  return RX_IG.test(t) || RX_IG_URL.test(t) ? '' : 'Ej: @tu.usuario';
}

export function validarLinkedin(v: string): string {
  const t = v.trim();
  if (!t) return '';
  return RX_LINKEDIN.test(t) ? '' : 'Ej: https://linkedin.com/in/tu-perfil';
}

export function validarDescripcion(v: string): string {
  const t = v.trim();
  if (!t) return '';
  if (t.length > 300) return 'Máximo 300 caracteres';
  return RX_DESC.test(t) ? '' : 'Solo texto y puntuación básica';
}
