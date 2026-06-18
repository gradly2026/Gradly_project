// ══════════════════════════════════════════════════════════════════
//  Validación de tarjeta (pasarela simulada — sin transacciones)
//  Fuente única reutilizada por el registro de empresas y el panel.
// ══════════════════════════════════════════════════════════════════

export const RX_EXP = /^(0[1-9]|1[0-2])\/?([0-9]{2})$/;
const RX_TITULAR = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/;

/**
 * Algoritmo de Luhn: valida matemáticamente el número de tarjeta.
 * Recorre los dígitos de derecha a izquierda duplicando uno de cada
 * dos; si la suma total es múltiplo de 10, el número es válido.
 */
export function luhnValido(numero: string): boolean {
  const d = numero.replace(/\D/g, "");
  if (d.length < 15 || d.length > 16) return false;
  let suma = 0;
  let duplicar = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = parseInt(d[i], 10);
    if (duplicar) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    suma += n;
    duplicar = !duplicar;
  }
  return suma % 10 === 0;
}

// Máscara visual del número: grupos de 4 dígitos (#### #### #### ####).
export function maskTarjeta(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 16);
  return d.replace(/(.{4})/g, "$1 ").trim();
}

// Máscara de vencimiento MM/AA con barra automática.
export function maskExp(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}/${d.slice(2)}`;
}

// Valida formato MM/AA y que la tarjeta no esté caducada.
export function expVigente(v: string): boolean {
  const m = v.match(RX_EXP);
  if (!m) return false;
  const mes = parseInt(m[1], 10);
  const anio = 2000 + parseInt(m[2], 10);
  const ahora = new Date();
  const inicioMesActual = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  const finVigencia = new Date(anio, mes - 1, 1);
  return finVigencia >= inicioMesActual;
}

export const valTarjetaNum = (v: string) => {
  const d = v.replace(/\D/g, "");
  if (!d) return "Este campo es requerido";
  if (d.length < 15) return "El número debe tener 15 o 16 dígitos";
  if (!luhnValido(d)) return "Número de tarjeta inválido";
  return "";
};
export const valExp = (v: string) => {
  if (!v.trim()) return "Este campo es requerido";
  if (!RX_EXP.test(v.trim())) return "Formato MM/AA inválido";
  if (!expVigente(v.trim())) return "La tarjeta está vencida";
  return "";
};
export const valCvv = (v: string) => {
  const d = v.replace(/\D/g, "");
  if (!d) return "Este campo es requerido";
  if (d.length < 3 || d.length > 4) return "El CVV debe tener 3 o 4 dígitos";
  return "";
};
export const valTitular = (v: string) => {
  const t = v.trim();
  if (!t) return "Este campo es requerido";
  if (!RX_TITULAR.test(t)) return "Solo se permiten letras y espacios";
  return "";
};

// Filtra la entrada del titular: solo letras y espacios.
export const filterTitular = (v: string) =>
  v.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, "");
