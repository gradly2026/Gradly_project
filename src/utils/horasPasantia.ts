/**
 * horasPasantia.ts — Cálculo automático de las horas laborales de una pasantía
 * de grupo a partir del ACUERDO firmado (colección `solicitudes_practicas`,
 * campo `acuerdo`). El acuerdo define los días de la semana, el horario
 * (hora inicio/fin) y el rango de fechas; con eso se derivan:
 *
 *   · horasPorDia  = (horaFin − horaInicio)
 *   · total        = suma de horas de TODOS los días laborables del rango
 *   · transcurridas= horas ya cumplidas hasta hoy (el conteo avanza solo)
 *   · ultimaFecha  = último día en que el grupo trabajará (fechaFin del acuerdo)
 *
 * Se usa para mostrar "X/Y h" en la lista de grupos y de estudiantes.
 */
import type { AcuerdoData, DiaLaboral } from '../types/chat';

const DIA_A_JS: Record<DiaLaboral, number> = {
  Lunes: 1,
  Martes: 2,
  Miércoles: 3,
  Jueves: 4,
  Viernes: 5,
};

/** "08:00 AM" | "12:30 PM" → minutos desde medianoche (o null si no parsea). */
function parseHora12(s?: string): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(s.trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (/PM/i.test(m[3])) h += 12;
  return h * 60 + Number(m[2]);
}

/** ISO `yyyy-mm-dd` → Date local (medianoche) o null. */
function parseISO(s?: string): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s).trim());
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export interface HorasAcuerdo {
  /** true solo si el acuerdo trae datos suficientes para calcular. */
  valido: boolean;
  horasPorDia: number;
  /** Horas laborales ya cumplidas hasta hoy (enteras). */
  transcurridas: number;
  /** Horas laborales totales planificadas del acuerdo (enteras). */
  total: number;
  /** Último día de trabajo (fechaFin del acuerdo). */
  ultimaFecha: Date | null;
  /** Avance 0–100 en función de transcurridas/total. */
  pct: number;
}

const VACIO: HorasAcuerdo = {
  valido: false, horasPorDia: 0, transcurridas: 0, total: 0, ultimaFecha: null, pct: 0,
};

/**
 * Calcula las horas cumplidas y totales de un acuerdo. El conteo de
 * transcurridas avanza automáticamente con la fecha actual.
 */
export function calcularHorasAcuerdo(
  acuerdo: Partial<AcuerdoData> | null | undefined,
  ahora: Date = new Date(),
): HorasAcuerdo {
  if (!acuerdo) return VACIO;
  const dias: DiaLaboral[] = Array.isArray(acuerdo.dias) ? acuerdo.dias : [];
  const ini = parseHora12(acuerdo.horaInicio);
  const fin = parseHora12(acuerdo.horaFin);
  const fechaIni = parseISO(acuerdo.fechaInicio);
  const fechaFin = parseISO(acuerdo.fechaFin);
  if (
    !dias.length || ini == null || fin == null || fin <= ini ||
    !fechaIni || !fechaFin || fechaFin < fechaIni
  ) {
    return VACIO;
  }

  const horasPorDia = (fin - ini) / 60;
  const diasSet = new Set(dias.map(d => DIA_A_JS[d]).filter(n => n !== undefined));
  const hoy0 = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());

  let total = 0;
  let transcurridas = 0;
  const cursor = new Date(fechaIni);
  // Recorremos el rango día a día sumando los días laborables del acuerdo.
  // (Los rangos de pasantía son de semanas/meses → bucle acotado.)
  while (cursor <= fechaFin) {
    if (diasSet.has(cursor.getDay())) {
      total += horasPorDia;
      if (cursor <= hoy0) transcurridas += horasPorDia;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  transcurridas = Math.min(transcurridas, total);
  const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((transcurridas / total) * 100))) : 0;

  return {
    valido: true,
    horasPorDia,
    transcurridas: Math.round(transcurridas),
    total: Math.round(total),
    ultimaFecha: fechaFin,
    pct,
  };
}
