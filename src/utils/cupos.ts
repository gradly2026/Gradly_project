/**
 * Cupos de una vacante: cuántos estudiantes puede recibir la empresa.
 *
 * Es el dato que permite repartir una necesidad real entre varias
 * universidades (y que una universidad arme un grupo tomando porciones de
 * varias empresas), en vez del todo-o-nada actual.
 *
 * **Compatibilidad:** las vacantes publicadas antes de este campo NO tienen
 * `cupos`. Se tratan como "sin límite declarado" (`null`) y NUNCA se
 * bloquean — sería romper datos que ya existen en producción.
 */

export const CUPOS_MIN = 1;
export const CUPOS_MAX = 200;

/** Forma mínima que necesita este módulo (no exige la interfaz completa). */
export interface VacanteConCupos {
  cupos?: number | null;
  /** Ya existente: se incrementa al contratar (ver `pasantiaService`). */
  contratados_count?: number | null;
  /** Reservados por universidades que reclamaron por lote (fase siguiente). */
  cupos_reclamados?: number | null;
}

/** Total declarado, o `null` si la vacante es legada / sin límite. */
export function cuposTotales(v: VacanteConCupos | null | undefined): number | null {
  const n = Number(v?.cupos);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/** Cupos ya tomados: contratados + reclamados por universidades. */
export function cuposOcupados(v: VacanteConCupos | null | undefined): number {
  const contratados = Number(v?.contratados_count);
  const reclamados = Number(v?.cupos_reclamados);
  return (
    (Number.isFinite(contratados) && contratados > 0 ? Math.floor(contratados) : 0) +
    (Number.isFinite(reclamados) && reclamados > 0 ? Math.floor(reclamados) : 0)
  );
}

/**
 * Cupos libres. `null` = sin límite declarado (vacante legada), que NO es lo
 * mismo que 0: quien consuma esto debe distinguir "no sé" de "no queda".
 */
export function cuposDisponibles(v: VacanteConCupos | null | undefined): number | null {
  const total = cuposTotales(v);
  if (total === null) return null;
  return Math.max(0, total - cuposOcupados(v));
}

/** ¿Se puede tomar al menos un cupo? Sin límite declarado ⇒ sí. */
export function hayCupos(v: VacanteConCupos | null | undefined): boolean {
  const libres = cuposDisponibles(v);
  return libres === null || libres > 0;
}

/** ¿Alcanzan para `n` estudiantes? Sin límite declarado ⇒ sí. */
export function alcanzanCupos(v: VacanteConCupos | null | undefined, n: number): boolean {
  const libres = cuposDisponibles(v);
  return libres === null || libres >= n;
}

/**
 * Etiqueta corta para tarjetas: "5 de 8 cupos" / "Sin cupos" / `null` si la
 * vacante no declara límite (el punto de uso decide si oculta el badge).
 */
export function textoCupos(v: VacanteConCupos | null | undefined): string | null {
  const total = cuposTotales(v);
  if (total === null) return null;
  const libres = cuposDisponibles(v) ?? 0;
  return libres === 0 ? "Sin cupos" : `${libres} de ${total} cupos`;
}

/**
 * Rango salarial legible: "$400 - $600", "Desde $400", "Hasta $600", o `null`
 * si la empresa no lo declaró. Es 100% opcional (solo aplica a tipo
 * 'Vacante') — la negociación final ocurre fuera de Gradly, esto es
 * únicamente indicativo para que el postulante decida si le interesa.
 */
export function textoSalario(min?: number | null, max?: number | null): string | null {
  const mn = typeof min === "number" && min > 0 ? min : null;
  const mx = typeof max === "number" && max > 0 ? max : null;
  if (mn === null && mx === null) return null;
  if (mn !== null && mx !== null) return mn === mx ? `$${mn}` : `$${mn} - $${mx}`;
  return mn !== null ? `Desde $${mn}` : `Hasta $${mx}`;
}

/** Forma mínima de un reclamo para contar cupos (evita depender del servicio). */
export interface ReclamoContable {
  estado?: string;
  cantidad?: number | null;
  tomados?: number | null;
  fechaLimiteSeleccion?: any;
}

/**
 * Cupos que una universidad ya tiene asegurados.
 *
 * Cuentan `pendiente` **y** `aceptado`: en ambos casos las plazas están
 * apartadas en la vacante (se reservan al reclamar, no al confirmar), así que
 * para la cuota de la universidad ya están comprometidas. `rechazado` y
 * `liberado` devolvieron sus cupos al mercado y no cuentan.
 *
 * **Si el plazo ya venció, solo cuentan los cupos realmente tomados**, no los
 * reservados: el barrido del servidor corre cada hora, y sin este ajuste la
 * universidad vería una cuota inflada durante esa ventana.
 *
 * Vive aquí, y no en `reclamoCuposService`, porque es aritmética pura: así se
 * puede probar sin arrastrar Firestore.
 */
export function cuposAsegurados(
  reclamos: ReclamoContable[],
  ahora: number = Date.now(),
): number {
  const n = (v: any) => {
    const x = Number(v);
    return Number.isFinite(x) && x > 0 ? Math.floor(x) : 0;
  };
  return reclamos
    .filter(r => r?.estado === "pendiente" || r?.estado === "aceptado")
    .reduce(
      (acc, r) => acc + (expiroSeleccion(r, ahora) ? n(r?.tomados) : n(r?.cantidad)),
      0,
    );
}

// ─────────────────────────────────────────────
// SELECCIÓN DEL ESTUDIANTE
// ─────────────────────────────────────────────

/** Horas que tiene el estudiante para tomar un cupo antes de que se libere. */
export const PLAZO_SELECCION_HORAS = 48;

/** Forma mínima de un reclamo desde la vista del tablero del estudiante. */
export interface ReclamoSeleccionable extends ReclamoContable {
  /** Cupos ya tomados por estudiantes. */
  tomados?: number | null;
  /** Fecha límite para elegir (ISO, Date o Timestamp de Firestore). */
  fechaLimiteSeleccion?: any;
}

/** Convierte ISO / Date / Timestamp de Firestore a milisegundos. `null` si no se puede. */
export function aMillis(v: any): number | null {
  if (!v) return null;
  if (typeof v?.toMillis === "function") return v.toMillis(); // Timestamp
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const ms = Date.parse(v);
    return Number.isNaN(ms) ? null : ms;
  }
  // Timestamp serializado ({seconds, nanoseconds})
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  return null;
}

/**
 * Cupos de un reclamo que aún nadie ha tomado.
 * Nunca negativo, aunque el contador venga inconsistente.
 */
export function cuposLibresEnReclamo(r: ReclamoSeleccionable | null | undefined): number {
  const cantidad = Number(r?.cantidad);
  const tomados = Number(r?.tomados);
  const total = Number.isFinite(cantidad) && cantidad > 0 ? Math.floor(cantidad) : 0;
  const usados = Number.isFinite(tomados) && tomados > 0 ? Math.floor(tomados) : 0;
  return Math.max(0, total - usados);
}

/**
 * ¿Venció el plazo para elegir? Sin fecha límite se considera **vigente**:
 * un dato faltante no debe quitarle la oportunidad al estudiante.
 */
export function expiroSeleccion(
  r: ReclamoSeleccionable | null | undefined,
  ahora: number = Date.now(),
): boolean {
  const limite = aMillis(r?.fechaLimiteSeleccion);
  if (limite === null) return false;
  return ahora > limite;
}

/** ¿El estudiante puede tomar este cupo ahora mismo? */
export function sePuedeTomar(
  r: ReclamoSeleccionable | null | undefined,
  ahora: number = Date.now(),
): boolean {
  if (!r) return false;
  if (r.estado !== "pendiente" && r.estado !== "aceptado") return false;
  if (cuposLibresEnReclamo(r) === 0) return false;
  return !expiroSeleccion(r, ahora);
}

/** Texto del tiempo restante: "2 d 5 h", "7 h", "45 min" o "Vencido". */
export function tiempoRestante(
  r: ReclamoSeleccionable | null | undefined,
  ahora: number = Date.now(),
): string | null {
  const limite = aMillis(r?.fechaLimiteSeleccion);
  if (limite === null) return null;
  const ms = limite - ahora;
  if (ms <= 0) return "Vencido";

  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `${horas} h`;
  const dias = Math.floor(horas / 24);
  return `${dias} d ${horas % 24} h`;
}

/**
 * Validador del formulario (mismo estilo que valTitulo/valFecha).
 *
 * `minimo` sirve al EDITAR una vacante ya publicada: no se puede bajar el
 * total por debajo de los cupos ya comprometidos (reservados por
 * universidades + contratados), o `cuposDisponibles` quedaría en negativo y
 * habría universidades con reservas que la vacante ya no respalda.
 */
export function valCupos(v: string, minimo: number = CUPOS_MIN): string {
  const txt = (v ?? "").trim();
  if (!txt) return "Indica cuántos estudiantes puedes recibir.";
  if (!/^\d+$/.test(txt)) return "Solo números enteros.";
  const n = Number(txt);
  const min = Math.max(CUPOS_MIN, Math.floor(minimo) || CUPOS_MIN);
  if (n < min) {
    return min > CUPOS_MIN
      ? `No puedes bajar de ${min}: ya hay ${min} cupo(s) comprometido(s).`
      : `Debe ser al menos ${CUPOS_MIN}.`;
  }
  if (n > CUPOS_MAX) return `Máximo ${CUPOS_MAX} cupos.`;
  return "";
}
