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
import { progresoPorFechas } from './progresoPasantia';

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

// ════════════════════════════════════════════════════════════════════
//  progresoPorMeta — el "libro mayor" de horas de un estudiante inscrito
//  a una pasantía de cupo (Fase D).
//
//  A diferencia de `calcularHorasAcuerdo` (que tiene fechaInicio Y fechaFin y
//  suma todo el rango), aquí hay una META de horas y hay que DERIVAR la fecha
//  de fin: se avanza día a día desde la fecha de presentación ("Día 1" que fijó
//  la empresa), sumando las horas de cada día laborable del horario hasta
//  llegar a la meta. El último día puede ser PARCIAL (ej. meta que deja 1 h
//  suelta un miércoles de jornada de 4 h).
//
//  El conteo de "cumplidas" avanza solo con la fecha actual — no hace falta
//  que nadie marque asistencia.
// ════════════════════════════════════════════════════════════════════

export interface HorarioMinimo {
  dias?: DiaLaboral[];
  horaInicio?: string;
  horaFin?: string;
}

export interface ProgresoMeta {
  /** false = faltan datos (sin horario, sin fecha de presentación, o meta ≤ 0). */
  valido: boolean;
  horasPorDia: number;
  /** Horas ya cumplidas hasta hoy (nunca supera la meta; último día al tope del remanente). */
  cumplidas: number;
  /** Meta total de horas del grupo. */
  meta: number;
  restantes: number;
  /** 0–100. */
  pct: number;
  /** Día 1 (fecha de presentación). */
  fechaInicio: Date | null;
  /** Último día de práctica (puede ser parcial). null si faltan datos. */
  fechaFin: Date | null;
  /** Horas que se hacen ese último día (≤ horasPorDia si es parcial). */
  horasUltimoDia: number;
  /** true si hoy ≥ fechaFin (ya se cumplió la meta). */
  completado: boolean;
  /** true si hoy < fechaInicio (aún no se presenta). */
  porIniciar: boolean;
}

const PROGRESO_META_VACIO: ProgresoMeta = {
  valido: false, horasPorDia: 0, cumplidas: 0, meta: 0, restantes: 0, pct: 0,
  fechaInicio: null, fechaFin: null, horasUltimoDia: 0, completado: false, porIniciar: false,
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function progresoPorMeta(
  horario: HorarioMinimo | null | undefined,
  fechaPresentacionISO: string | null | undefined,
  horasMeta: number | null | undefined,
  ahora: Date = new Date(),
): ProgresoMeta {
  if (!horario) return PROGRESO_META_VACIO;
  const dias: DiaLaboral[] = Array.isArray(horario.dias) ? horario.dias : [];
  const ini = parseHora12(horario.horaInicio);
  const fin = parseHora12(horario.horaFin);
  const inicio = parseISO(fechaPresentacionISO ?? undefined);
  const meta = Number(horasMeta);
  if (
    !dias.length || ini == null || fin == null || fin <= ini ||
    !inicio || !Number.isFinite(meta) || meta <= 0
  ) {
    return { ...PROGRESO_META_VACIO, fechaInicio: inicio, meta: Number.isFinite(meta) && meta > 0 ? meta : 0 };
  }

  const horasPorDia = (fin - ini) / 60;
  const diasSet = new Set(dias.map(d => DIA_A_JS[d]).filter(n => n !== undefined));
  const hoy0 = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());

  let acumTotal = 0;   // hasta cubrir la meta (define fechaFin)
  let acumHoy = 0;     // hasta hoy
  let fechaFin: Date | null = null;
  let horasUltimoDia = 0;
  const cursor = new Date(inicio);
  // Bucle acotado: como mucho meta/horasPorDia días laborables (semanas/meses).
  // El tope duro cubre ~11 años de pasos diarios por si el horario fuera raro.
  let guard = 0;
  while (acumTotal < meta && guard < 4000) {
    guard++;
    if (diasSet.has(cursor.getDay())) {
      const hoyEste = Math.min(horasPorDia, meta - acumTotal); // último día puede ser parcial
      acumTotal += hoyEste;
      if (cursor <= hoy0) acumHoy += hoyEste;
      if (acumTotal >= meta - 1e-9) {
        fechaFin = new Date(cursor);
        horasUltimoDia = hoyEste;
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  const cumplidas = Math.min(acumHoy, meta);
  const completado = fechaFin != null && hoy0 >= fechaFin;
  const porIniciar = hoy0 < inicio;
  const pct = Math.max(0, Math.min(100, Math.round((cumplidas / meta) * 100)));

  return {
    valido: true,
    horasPorDia: r2(horasPorDia),
    cumplidas: r2(cumplidas),
    meta,
    restantes: r2(Math.max(0, meta - cumplidas)),
    pct,
    fechaInicio: inicio,
    fechaFin,
    horasUltimoDia: r2(horasUltimoDia),
    completado,
    porIniciar,
  };
}

/** Progreso "X/Y" listo para mostrar en una tarjeta (barra + contador). */
export interface ProgresoGrupo {
  /** false = no hay ningún dato de período; no mostrar barra ni contador. */
  visible: boolean;
  pct: number;
  label: string;
  /** true si ya se cumplió la meta de horas (solo en el modo `progresoPorMeta`). */
  completado?: boolean;
  /** Horas que faltan (solo en el modo `progresoPorMeta`). */
  restantes?: number;
}

/** Inscripción a una pasantía de cupo, para el cálculo de horas (Fase D). */
export interface InscripcionParaProgreso {
  horario?: HorarioMinimo | null;
  /** "Día 1" fijado por la empresa (ISO `yyyy-mm-dd`). */
  fechaPresentacion?: string | null;
}

/** Datos de período de un grupo, tal como los guarda `PeriodoPracticasField`. */
export interface GrupoPeriodo {
  horasRequeridas?: number | null;
  fechaInicio?: string | null;
  fechaFin?: string | null;
}

/**
 * Progreso a mostrar para un grupo (o para un estudiante, vía el grupo al que
 * pertenece), con esta prioridad — nunca se fabrica un número que no venga de
 * un dato real guardado:
 *
 *  0. El estudiante está inscrito a una pasantía de cupo, la empresa ya fijó su
 *     `fechaPresentacion` y el grupo tiene una meta de horas → **libro mayor de
 *     horas** (`progresoPorMeta`): horas que avanzan solas desde el Día 1 sobre
 *     la meta del grupo. Es el caso más preciso del reparto de cupos.
 *  1. Ya hay un acuerdo real aprobado/finalizado con una empresa → horas
 *     REALES trabajadas (`calcularHorasAcuerdo`) — para el flujo de grupo.
 *  2. Sin acuerdo/inscripción todavía, pero el grupo definió una meta en horas
 *     al crearse → "0/{horas} h".
 *  3. Sin meta en horas, pero el grupo tiene su propio período de fechas
 *     (legado modo 'fecha') → días transcurridos (`progresoPorFechas`).
 *  4. Sin ningún dato → oculto.
 */
export function progresoDeGrupo(
  grupo: GrupoPeriodo,
  acuerdo: Partial<AcuerdoData> | null | undefined,
  inscripcion?: InscripcionParaProgreso | null,
): ProgresoGrupo {
  // 0. Libro mayor de horas del reparto de cupos (Fase D).
  if (inscripcion?.fechaPresentacion && grupo.horasRequeridas && grupo.horasRequeridas > 0) {
    const m = progresoPorMeta(inscripcion.horario, inscripcion.fechaPresentacion, grupo.horasRequeridas);
    if (m.valido) {
      return {
        visible: true,
        pct: m.pct,
        label: `${m.cumplidas}/${m.meta} h`,
        completado: m.completado,
        restantes: m.restantes,
      };
    }
  }

  const porAcuerdo = calcularHorasAcuerdo(acuerdo);
  if (porAcuerdo.valido) {
    return {
      visible: true,
      pct: porAcuerdo.pct,
      label: `${porAcuerdo.transcurridas}/${porAcuerdo.total} h`,
    };
  }

  if (grupo.horasRequeridas && grupo.horasRequeridas > 0) {
    return { visible: true, pct: 0, label: `0/${grupo.horasRequeridas} h` };
  }

  if (grupo.fechaInicio && grupo.fechaFin) {
    const prog = progresoPorFechas(grupo.fechaInicio, grupo.fechaFin);
    return {
      visible: true,
      pct: prog.pct,
      label: `${prog.diasTranscurridos}/${prog.diasTotales} días`,
    };
  }

  return { visible: false, pct: 0, label: '' };
}
