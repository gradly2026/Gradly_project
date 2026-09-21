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
//  DOS MODOS (ver `progresoPorMeta`):
//   · Por HORARIO (sin `asistencias`): el conteo avanza solo con la fecha — no
//     hace falta que nadie marque asistencia. Es el cálculo de siempre.
//   · Por ASISTENCIA (con el libro `asistencias` de la asignación): desde
//     `ASISTENCIA_HORAS_DESDE` cada día cuenta según la asistencia registrada
//     (ver `progresoPorAsistencia`); los días anteriores siguen por horario.
// ════════════════════════════════════════════════════════════════════

/**
 * Desde qué día (ISO `yyyy-mm-dd`, hora de El Salvador) las horas de una
 * pasantía de cupo cuentan por ASISTENCIA registrada en vez de por horario. Los
 * días anteriores se quedan como estaban: nadie pierde horas ya acumuladas.
 *
 * ⚠️ Tiene que ser un día POSTERIOR a que estén desplegadas las Cloud Functions
 * de asistencia (registrarAsistenciaPorCodigo es la que escribe el libro
 * `asistencias`) y la app nueva; si no, esos días se contarían en 0 sin que
 * nada los registre.
 */
export const ASISTENCIA_HORAS_DESDE = '2026-09-22';

/** Margen (minutos desde la hora de entrada) para que se registre la asistencia
 *  sin contar como llegada tarde. SOLO para los textos de la app: el que decide
 *  es el servidor (`UMBRAL_TARDANZA_MIN` en functions/src/asistencia.ts) — deben
 *  valer lo mismo. */
export const MARGEN_ASISTENCIA_MIN = 20;

/** Cuántos días después puede la empresa registrar la asistencia olvidada de un
 *  día (mismo valor que `VENTANA_CORRECCION_DIAS` del servidor). */
export const VENTANA_CORRECCION_DIAS = 3;

/** Libro de asistencia de una asignación de cupo: `yyyy-mm-dd` → minuto del día
 *  (desde medianoche) desde el que cuentan las horas de ese día. Lo escribe
 *  SOLO el servidor: la hora de entrada del horario si la asistencia se registró
 *  dentro del margen, o la hora del registro si fue llegada tarde. */
export type AsistenciasDia = Record<string, number>;

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
const r1 = (n: number) => Math.round(n * 10) / 10;
/** Hacia abajo a 1 decimal (la holgura evita que 5.3 se lea como 5.2999…). */
const piso1 = (n: number) => Math.floor(n * 10 + 1e-9) / 10;
const acotar = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** Cálculo por HORARIO (el de siempre). Ver `progresoPorMeta`. */
function progresoPorHorario(
  horario: HorarioMinimo | null | undefined,
  fechaPresentacionISO: string | null | undefined,
  horasMeta: number | null | undefined,
  ahora: Date = new Date(),
  /**
   * Días programados que NO cuentan (ISO `yyyy-mm-dd`) — "días no
   * computados" por enfermedad/permiso/emergencia (ver
   * ajusteAsistenciaService.ts). Se saltan al sumar Y al derivar la fecha de
   * fin, así que cada día excluido corre la fecha de fin un día programado
   * más — la pasantía se "extiende" en vez de perder esas horas.
   */
  fechasExcluidas?: string[] | null,
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
  const excluidas = new Set(fechasExcluidas ?? []);
  const aISO = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  let acumTotal = 0;   // hasta cubrir la meta (define fechaFin)
  let acumHoy = 0;     // hasta hoy
  let fechaFin: Date | null = null;
  let horasUltimoDia = 0;
  const cursor = new Date(inicio);
  // Bucle acotado: como mucho meta/horasPorDia días laborables (semanas/meses),
  // más los días excluidos (pocos en la práctica). El tope duro cubre ~11 años
  // de pasos diarios por si el horario fuera raro.
  let guard = 0;
  while (acumTotal < meta && guard < 4000) {
    guard++;
    // Un día "no computado" es como si ese día no fuera laborable: no suma
    // ni a la meta ni a lo cumplido, y el cursor sigue — así la fecha de fin
    // se corre exactamente un día programado por cada exclusión.
    if (diasSet.has(cursor.getDay()) && !excluidas.has(aISO(cursor))) {
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

/**
 * Cálculo por ASISTENCIA. Desde `desdeISO`, cada día cuenta según el libro
 * `asistencias` (minuto del día desde el que cuentan sus horas):
 *   · día CON asistencia: rinde desde ese minuto hasta la hora de salida del
 *     horario — completo si el registro llegó dentro del margen, menos si fue
 *     llegada tarde;
 *   · día SIN asistencia (ya pasado): 0 horas, y la fecha de fin se corre sola
 *     (la pasantía se alarga hasta completar las horas reales, igual que con los
 *     días no computados);
 *   · HOY: corre por reloj desde ese minuto (hora a hora), así que el último
 *     día — que puede ser parcial — cierra cuando pasan sus horas, no a las
 *     00:00; si hoy aún no hay asistencia, todavía no suma nada.
 * Los días anteriores a `desdeISO` conservan el cálculo por horario (nadie
 * pierde horas ya acumuladas).
 */
function progresoPorAsistencia(
  horario: HorarioMinimo | null | undefined,
  fechaPresentacionISO: string | null | undefined,
  horasMeta: number | null | undefined,
  ahora: Date,
  fechasExcluidas: string[] | null | undefined,
  asistencias: AsistenciasDia,
  desdeISO: string,
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

  const EPS = 1e-9;
  const horasPorDia = (fin - ini) / 60;
  const diasSet = new Set(dias.map(d => DIA_A_JS[d]).filter(n => n !== undefined));
  const hoy0 = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const excluidas = new Set(fechasExcluidas ?? []);
  const aISO = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hoyISO = aISO(hoy0);
  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes() + ahora.getSeconds() / 60;

  let acumTotal = 0;   // plan: lo REAL de los días ya pasados + lo proyectado de los que faltan
  let acumHoy = 0;     // lo real, hasta este momento
  let fechaFin: Date | null = null;
  let horasUltimoDia = 0;
  const cursor = new Date(inicio);
  // Bucle acotado (como en el cálculo por horario); las ausencias lo alargan,
  // pero el tope duro cubre ~11 años de pasos diarios por si algo fuera raro.
  let guard = 0;
  while (acumTotal < meta - EPS && guard < 4000) {
    guard++;
    const cursorISO = aISO(cursor);
    // Un día "no computado" es como si no fuera laborable: ni suma ni se planea.
    if (diasSet.has(cursor.getDay()) && !excluidas.has(cursorISO)) {
      let plan: number; // horas que rinde (o rendirá) ese día
      let real: number; // horas que ya rindió hasta este momento
      if (cursorISO < desdeISO) {
        // Anterior a la regla: por horario, como siempre.
        plan = horasPorDia;
        real = cursorISO <= hoyISO ? horasPorDia : 0;
      } else {
        const desde = asistencias[cursorISO];
        const asistio = typeof desde === 'number' && Number.isFinite(desde);
        // Lo que rinde el día COMPLETO desde el minuto en que empezó a contar.
        const rinde = asistio ? acotar((fin - desde) / 60, 0, horasPorDia) : 0;
        if (cursorISO < hoyISO) {
          plan = rinde;
          real = rinde;
        } else if (cursorISO === hoyISO) {
          if (asistio) {
            plan = rinde;
            real = acotar((Math.min(minutosAhora, fin) - desde) / 60, 0, rinde);
          } else {
            // Aún sin asistencia hoy: mientras dure el turno todavía puede
            // llegar (se proyecta el día completo); pasado el turno, ausente.
            plan = minutosAhora <= fin ? horasPorDia : 0;
            real = 0;
          }
        } else {
          plan = horasPorDia; // día futuro: se proyecta completo
          real = 0;
        }
      }
      const usa = Math.min(plan, meta - acumTotal); // el último día puede ser parcial
      if (usa > 0) {
        acumTotal += usa;
        acumHoy += Math.min(real, usa);
        if (acumTotal >= meta - EPS) {
          fechaFin = new Date(cursor);
          horasUltimoDia = usa;
        }
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  const cumplidasExactas = Math.min(acumHoy, meta);
  // Completado = ya pasaron TODAS las horas reales (el último día, cuando se
  // cumple su remanente por reloj), no cuando empieza ese día.
  const completado = fechaFin != null && cumplidasExactas >= meta - EPS;
  const porIniciar = hoy0 < inicio;
  // A lo más un decimal y hacia abajo: nunca se muestra más de lo trabajado (el
  // contador cambia cada ~6 min). Al completar, exactamente la meta.
  const cumplidas = completado ? meta : piso1(cumplidasExactas);
  // 100 % solo cuando está completado (el redondeo no lo adelanta).
  const pct = Math.max(0, Math.min(completado ? 100 : 99, Math.round((cumplidasExactas / meta) * 100)));

  return {
    valido: true,
    horasPorDia: r2(horasPorDia),
    cumplidas,
    meta,
    restantes: completado ? 0 : r1(Math.max(0, meta - cumplidas)),
    pct,
    fechaInicio: inicio,
    fechaFin,
    horasUltimoDia: r2(horasUltimoDia),
    completado,
    porIniciar,
  };
}

/**
 * Libro mayor de horas de una pasantía de cupo.
 *
 *  · SIN `asistencias` (undefined/null): cálculo por HORARIO, el de siempre —
 *    lo usan las pantallas y los flujos que no manejan asistencia.
 *  · CON `asistencias` (el libro de la asignación; pasar `{}` si aún no tiene
 *    ninguna): las horas cuentan por ASISTENCIA desde `desdeISO`
 *    (`ASISTENCIA_HORAS_DESDE`); ver `progresoPorAsistencia`.
 */
export function progresoPorMeta(
  horario: HorarioMinimo | null | undefined,
  fechaPresentacionISO: string | null | undefined,
  horasMeta: number | null | undefined,
  ahora: Date = new Date(),
  fechasExcluidas?: string[] | null,
  asistencias?: AsistenciasDia | null,
  desdeISO: string = ASISTENCIA_HORAS_DESDE,
): ProgresoMeta {
  if (asistencias == null) {
    return progresoPorHorario(horario, fechaPresentacionISO, horasMeta, ahora, fechasExcluidas);
  }
  return progresoPorAsistencia(horario, fechaPresentacionISO, horasMeta, ahora, fechasExcluidas, asistencias, desdeISO);
}

/** Hora de entrada y de salida del horario, en minutos desde medianoche (o null
 *  si no parsean o la salida no es posterior a la entrada). */
export function turnoEnMinutos(horario: HorarioMinimo | null | undefined): { ini: number; fin: number } | null {
  const ini = parseHora12(horario?.horaInicio);
  const fin = parseHora12(horario?.horaFin);
  return ini != null && fin != null && fin > ini ? { ini, fin } : null;
}

/** Minutos desde medianoche → "08:30 AM" (mismo formato que el horario), para
 *  mostrar "tus horas cuentan desde…" o elegir una hora de llegada. */
export function minutosAHora12(min: number): string {
  const total = Math.max(0, Math.round(min));
  const h24 = Math.floor(total / 60) % 24;
  const m = total % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

/**
 * Días recientes (hasta `ventanaDias` atrás; y hoy, solo si el turno ya
 * terminó) que le tocaban a la pasantía y NO tienen asistencia registrada — los
 * candidatos a que la empresa la registre después (registrarAsistenciaManual) y
 * lo que se le avisa al estudiante. Solo cuenta desde `desdeISO` (antes de la
 * regla no importa la asistencia), desde el Día 1, y sin los días no
 * computados. Fechas ISO, de la más antigua a la más reciente.
 */
export function diasSinAsistencia(
  horario: HorarioMinimo | null | undefined,
  fechaPresentacionISO: string | null | undefined,
  asistencias: AsistenciasDia | null | undefined,
  fechasExcluidas: string[] | null | undefined,
  ahora: Date = new Date(),
  ventanaDias: number = 3,
  desdeISO: string = ASISTENCIA_HORAS_DESDE,
): string[] {
  const dias: DiaLaboral[] = Array.isArray(horario?.dias) ? horario!.dias! : [];
  const fin = parseHora12(horario?.horaFin);
  const inicio = parseISO(fechaPresentacionISO ?? undefined);
  if (!dias.length || fin == null || !inicio) return [];
  const diasSet = new Set(dias.map(d => DIA_A_JS[d]).filter(n => n !== undefined));
  const excluidas = new Set(fechasExcluidas ?? []);
  const libro = asistencias ?? {};
  const hoy0 = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();
  const aISO = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const out: string[] = [];
  for (let k = ventanaDias; k >= 0; k--) {
    if (k === 0 && minutosAhora < fin) continue; // hoy: aún puede marcar hasta que termine el turno
    const d = new Date(hoy0);
    d.setDate(d.getDate() - k);
    const dISO = aISO(d);
    if (dISO < desdeISO || d < inicio) continue;
    if (!diasSet.has(d.getDay()) || excluidas.has(dISO)) continue;
    if (typeof libro[dISO] === 'number') continue;
    out.push(dISO);
  }
  return out;
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
  /** Días no computados (ISO `yyyy-mm-dd`) — ver `progresoPorMeta`. */
  fechasExcluidas?: string[] | null;
  /** Libro de asistencia de la asignación (`{}` si aún no tiene) — con él las
   *  horas cuentan por asistencia; sin él (undefined), por horario. */
  asistencias?: AsistenciasDia | null;
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
 *     horas** (`progresoPorMeta`): horas contadas desde el Día 1 (por horario o,
 *     desde `ASISTENCIA_HORAS_DESDE`, por asistencia registrada) sobre
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
    const m = progresoPorMeta(
      inscripcion.horario, inscripcion.fechaPresentacion, grupo.horasRequeridas,
      undefined, inscripcion.fechasExcluidas, inscripcion.asistencias,
    );
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
