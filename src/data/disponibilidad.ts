import { DIAS_LABORALES, type DiaLaboral } from "../types/chat";

/**
 * Disponibilidad horaria ESTRUCTURADA del estudiante.
 *
 * Reemplaza (sin borrar) al campo de texto libre `disponibilidad` de
 * `perfiles_estudiantes`, que era decorativo: nadie podía compararlo con el
 * horario de una pasantía. Aquí el dato es una malla día × bloque, así el
 * sistema puede responder "¿este alumno puede con este horario?" — la pieza
 * que faltaba para repartir cupos sin hacerlo a ciegas.
 *
 * Convive con el campo viejo: `disponibilidad` (texto) se conserva tal cual
 * para no romper lo que ya lo muestra; el dato nuevo vive en
 * `disponibilidad_horaria`.
 */

// ─────────────────────────────────────────────
// BLOQUES
// ─────────────────────────────────────────────

export type BloqueId = "manana" | "tarde" | "noche";

export interface Bloque {
  id: BloqueId;
  /** Etiqueta corta para la UI (se traduce con AutoText/t en el punto de uso). */
  nombre: string;
  /** Rango en minutos desde medianoche: [inicio, fin). */
  desde: number;
  hasta: number;
  /** Texto de apoyo, p. ej. "6:00 – 12:00". */
  rango: string;
}

const H = (h: number) => h * 60;

export const BLOQUES: Bloque[] = [
  { id: "manana", nombre: "Mañana", desde: H(6), hasta: H(12), rango: "6:00 – 12:00" },
  { id: "tarde", nombre: "Tarde", desde: H(12), hasta: H(18), rango: "12:00 – 18:00" },
  { id: "noche", nombre: "Noche", desde: H(18), hasta: H(22), rango: "18:00 – 22:00" },
];

export const BLOQUE_IDS: BloqueId[] = BLOQUES.map((b) => b.id);

const bloquePorId = (id: BloqueId) => BLOQUES.find((b) => b.id === id);

/**
 * Malla de disponibilidad: por cada día laboral, los bloques en que el
 * estudiante está libre. Un día ausente o con arreglo vacío = no disponible.
 */
export type DisponibilidadHoraria = Partial<Record<DiaLaboral, BloqueId[]>>;

// ─────────────────────────────────────────────
// PARSEO DE HORAS
// ─────────────────────────────────────────────

/**
 * Convierte una hora a minutos desde medianoche. Acepta el formato que ya usa
 * `AcuerdoData` ("08:00 AM", "1:00 PM") y también 24h ("13:00").
 * @returns minutos, o `null` si no se pudo interpretar.
 */
export function parseHoraAMinutos(hora: string | undefined | null): number | null {
  if (!hora) return null;
  const txt = String(hora).trim().toUpperCase();
  const m = txt.match(/^(\d{1,2})\s*:\s*(\d{2})\s*(AM|PM)?$/);
  if (!m) return null;

  let h = Number(m[1]);
  const min = Number(m[2]);
  const sufijo = m[3];

  if (Number.isNaN(h) || Number.isNaN(min) || min > 59) return null;

  if (sufijo === "AM") {
    if (h === 12) h = 0; // 12:xx AM = medianoche
  } else if (sufijo === "PM") {
    if (h !== 12) h += 12; // 12:xx PM ya es mediodía
  }
  if (h > 23) return null;

  return h * 60 + min;
}

/**
 * Bloques que toca un rango horario. Un bloque cuenta si se solapa con el
 * rango, aunque sea parcialmente: una pasantía de 10:00 a 14:00 exige que el
 * alumno tenga libres mañana Y tarde.
 */
export function bloquesDeRango(horaInicio: string, horaFin: string): BloqueId[] {
  const ini = parseHoraAMinutos(horaInicio);
  let fin = parseHoraAMinutos(horaFin);
  if (ini === null || fin === null) return [];
  // Tolera un fin "menor" (mal capturado) tratándolo como el mismo día.
  if (fin <= ini) fin = ini + 60;

  return BLOQUES.filter((b) => ini < b.hasta && fin > b.desde).map((b) => b.id);
}

// ─────────────────────────────────────────────
// COMPATIBILIDAD
// ─────────────────────────────────────────────

/**
 * Horario de una pasantía/vacante contra el que se evalúa al estudiante.
 * Misma forma que `ScheduleData` del chat, para que un horario declarado en la
 * vacante y uno negociado por chat sean intercambiables.
 */
export interface HorarioPasantia {
  dias: DiaLaboral[];
  horaInicio: string;
  horaFin: string;
}

/** Horas seleccionables (06:00 AM – 08:00 PM cada 30 min), formato 12h. */
export const HORAS_JORNADA: string[] = (() => {
  const horas: string[] = [];
  for (let h = 6; h <= 20; h++) {
    for (const min of [0, 30]) {
      const periodo = h < 12 ? "AM" : "PM";
      const h12 = h % 12 === 0 ? 12 : h % 12;
      horas.push(`${String(h12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${periodo}`);
    }
  }
  return horas;
})();

/** Lee un horario que venga de Firestore; `null` si está incompleto o es inválido. */
export function normalizarHorario(raw: any): HorarioPasantia | null {
  if (!raw || typeof raw !== "object") return null;
  const dias = Array.isArray(raw.dias)
    ? raw.dias.filter((d: any): d is DiaLaboral => DIAS_LABORALES.includes(d))
    : [];
  const horaInicio = typeof raw.horaInicio === "string" ? raw.horaInicio : "";
  const horaFin = typeof raw.horaFin === "string" ? raw.horaFin : "";
  if (dias.length === 0 || !horaInicio || !horaFin) return null;

  const ini = parseHoraAMinutos(horaInicio);
  const fin = parseHoraAMinutos(horaFin);
  if (ini === null || fin === null || fin <= ini) return null;

  // Se reordena a Lun→Vie para que el dato guardado sea estable.
  return { dias: DIAS_LABORALES.filter((d) => dias.includes(d)), horaInicio, horaFin };
}

/** Valida un horario en construcción; devuelve el mensaje de error o "". */
export function valHorario(h: Partial<HorarioPasantia> | null | undefined): string {
  if (!h?.dias?.length) return "Selecciona al menos un día.";
  if (!h.horaInicio || !h.horaFin) return "Indica la hora de entrada y de salida.";
  const ini = parseHoraAMinutos(h.horaInicio);
  const fin = parseHoraAMinutos(h.horaFin);
  if (ini === null || fin === null) return "Horas inválidas.";
  if (fin <= ini) return "La hora de salida debe ser posterior a la de entrada.";
  return "";
}

/** Etiqueta corta: "Lun–Vie · 08:00 AM – 12:00 PM". */
export function textoHorario(h: HorarioPasantia | null | undefined): string | null {
  const norm = normalizarHorario(h);
  if (!norm) return null;
  const abrev = norm.dias.map((d) => d.slice(0, 3));
  const textoDias =
    norm.dias.length === DIAS_LABORALES.length
      ? `${DIAS_LABORALES[0].slice(0, 3)}–${DIAS_LABORALES[DIAS_LABORALES.length - 1].slice(0, 3)}`
      : abrev.join(", ");
  return `${textoDias} · ${norm.horaInicio} – ${norm.horaFin}`;
}

/**
 * `desconocida` es deliberado y NO debe tratarse como "compatible": es el
 * alumno que aún no llenó su disponibilidad (o viene del esquema viejo de
 * texto libre). Asumir que puede sería justo el error que hace que una
 * universidad reclame cupos que nadie podrá tomar.
 */
export type Compatibilidad = "compatible" | "incompatible" | "desconocida";

export function tieneDisponibilidad(disp: DisponibilidadHoraria | null | undefined): boolean {
  if (!disp) return false;
  return DIAS_LABORALES.some((d) => (disp[d]?.length ?? 0) > 0);
}

/**
 * ¿El estudiante puede con este horario? Exige que esté libre en TODOS los
 * días del horario y, dentro de cada día, en TODOS los bloques que el horario
 * toca (una pasantía de 10:00–14:00 no se cubre teniendo solo la tarde libre).
 */
export function compatibilidadConHorario(
  disp: DisponibilidadHoraria | null | undefined,
  horario: HorarioPasantia,
): Compatibilidad {
  if (!tieneDisponibilidad(disp)) return "desconocida";

  const bloques = bloquesDeRango(horario.horaInicio, horario.horaFin);
  // Sin horario interpretable no podemos afirmar incompatibilidad.
  if (bloques.length === 0 || horario.dias.length === 0) return "desconocida";

  const puede = horario.dias.every((dia) => {
    const libres = disp![dia] ?? [];
    return bloques.every((b) => libres.includes(b));
  });

  return puede ? "compatible" : "incompatible";
}

export interface ResumenCompatibilidad {
  compatibles: number;
  incompatibles: number;
  desconocidos: number;
  total: number;
}

/** Cuenta cuántos alumnos de una lista pueden con un horario dado. */
export function contarCompatibilidad(
  estudiantes: { disponibilidad_horaria?: DisponibilidadHoraria | null }[],
  horario: HorarioPasantia,
): ResumenCompatibilidad {
  const r: ResumenCompatibilidad = {
    compatibles: 0,
    incompatibles: 0,
    desconocidos: 0,
    total: estudiantes.length,
  };
  for (const e of estudiantes) {
    const c = compatibilidadConHorario(e.disponibilidad_horaria, horario);
    if (c === "compatible") r.compatibles += 1;
    else if (c === "incompatible") r.incompatibles += 1;
    else r.desconocidos += 1;
  }
  return r;
}

// ─────────────────────────────────────────────
// PRESENTACIÓN
// ─────────────────────────────────────────────

/** Nº total de casillas marcadas (para badges tipo "8 bloques"). */
export function contarBloques(disp: DisponibilidadHoraria | null | undefined): number {
  if (!disp) return 0;
  return DIAS_LABORALES.reduce((acc, d) => acc + (disp[d]?.length ?? 0), 0);
}

/**
 * Resumen legible corto, p. ej. "Lun, Mar, Mié · Mañana" o
 * "Lun–Vie · Mañana, Tarde". Devuelve `null` si no hay nada que resumir
 * (el punto de uso decide el texto de "no especificado", que es traducible).
 */
export function resumenDisponibilidad(disp: DisponibilidadHoraria | null | undefined): string | null {
  if (!tieneDisponibilidad(disp)) return null;

  const diasConAlgo = DIAS_LABORALES.filter((d) => (disp![d]?.length ?? 0) > 0);
  const abreviado = diasConAlgo.map((d) => d.slice(0, 3));

  // Lun–Vie completo se comprime; si no, se listan los días.
  const textoDias =
    diasConAlgo.length === DIAS_LABORALES.length
      ? `${DIAS_LABORALES[0].slice(0, 3)}–${DIAS_LABORALES[DIAS_LABORALES.length - 1].slice(0, 3)}`
      : abreviado.join(", ");

  const bloquesUsados = BLOQUE_IDS.filter((b) => diasConAlgo.some((d) => disp![d]!.includes(b)));
  const textoBloques = bloquesUsados
    .map((b) => bloquePorId(b)?.nombre ?? b)
    .join(", ");

  return textoBloques ? `${textoDias} · ${textoBloques}` : textoDias;
}

/** Normaliza lo que venga de Firestore (defensivo ante datos viejos/corruptos). */
export function normalizarDisponibilidad(raw: any): DisponibilidadHoraria {
  const out: DisponibilidadHoraria = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;

  for (const dia of DIAS_LABORALES) {
    const v = raw[dia];
    if (!Array.isArray(v)) continue;
    const bloques = v.filter((b: any): b is BloqueId => BLOQUE_IDS.includes(b));
    if (bloques.length > 0) out[dia] = bloques;
  }
  return out;
}

/** Alterna una casilla día×bloque y devuelve una malla NUEVA (inmutable). */
export function alternarBloque(
  disp: DisponibilidadHoraria,
  dia: DiaLaboral,
  bloque: BloqueId,
): DisponibilidadHoraria {
  const actuales = disp[dia] ?? [];
  const siguiente = actuales.includes(bloque)
    ? actuales.filter((b) => b !== bloque)
    : [...actuales, bloque];

  const out: DisponibilidadHoraria = { ...disp };
  if (siguiente.length > 0) {
    // Se reordena según BLOQUE_IDS para que el dato guardado sea estable.
    out[dia] = BLOQUE_IDS.filter((b) => siguiente.includes(b));
  } else {
    delete out[dia];
  }
  return out;
}
