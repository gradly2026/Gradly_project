// ════════════════════════════════════════════════════════════════════════
// disponibilidadEstudiante.ts — "disponibilidad" DERIVADA del sistema para la
// vista de perfil de un estudiante. El estudiante ya no la escribe a mano: se
// calcula de su estado de pasantía y, si ya la culminó y tiene un puesto de
// trabajo, de las horas en que NO está trabajando.
//
// Reglas (pedidas por el usuario):
//   · Aún no culmina su pasantía → estado simple:
//       - en_proceso → "En pasantía"
//       - sin iniciar / desconocido → "Disponible"
//   · Ya culminó su pasantía:
//       - sin puesto de trabajo activo → "Disponible"
//       - con puesto de trabajo (horario) → "Disponible" + las franjas libres
//         dentro de la jornada razonable 06:00–20:00 (nunca de 8pm a 5am, por
//         descanso), p. ej. "7:00 PM – 8:00 PM".
// ════════════════════════════════════════════════════════════════════════

import { parseHoraAMinutos, type HorarioPasantia } from '../data/disponibilidad';

/** Ventana diaria "razonable" para atender fuera del trabajo (06:00–20:00). */
const DIA_INI = 6 * 60;
const DIA_FIN = 20 * 60;

function fmtHora12(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const periodo = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${periodo}`;
}

/** Franjas libres (texto) dentro de 06:00–20:00, quitando el horario laboral. */
export function franjasLibres(horario: HorarioPasantia | null | undefined): string {
  if (!horario) return '';
  const ws = parseHoraAMinutos(horario.horaInicio);
  const we = parseHoraAMinutos(horario.horaFin);
  if (ws == null || we == null) return '';

  const rangos: [number, number][] = [];
  if (ws > DIA_INI) rangos.push([DIA_INI, Math.min(ws, DIA_FIN)]);
  if (we < DIA_FIN) rangos.push([Math.max(we, DIA_INI), DIA_FIN]);

  return rangos
    .filter(([a, b]) => b - a >= 30)
    .map(([a, b]) => `${fmtHora12(a)} – ${fmtHora12(b)}`)
    .join('  ·  ');
}

export interface ResumenDisponibilidad {
  /** Estado corto para el chip. */
  estado: 'disponible' | 'en_pasantia' | 'ocupado';
  /** Etiqueta del chip. */
  chip: string;
  /** Detalle opcional (franjas libres) — solo cuando ya culminó y tiene puesto. */
  detalle?: string;
  /** Días laborales del puesto (para mostrar junto al detalle). */
  dias?: string[];
  /** Cadena única para denormalizar en `perfiles_estudiantes.disponibilidad_auto`. */
  texto: string;
}

/**
 * @param estadoPasantia  `perfiles_estudiantes.estado_pasantia`
 * @param culminada       true si ya culminó (estado 'finalizada' o pct>=100)
 * @param horarioPuesto   horario del `contratos_laborales` activo, o null
 */
export function resumenDisponibilidadEstudiante(opts: {
  estadoPasantia?: string | null;
  culminada: boolean;
  horarioPuesto?: HorarioPasantia | null;
}): ResumenDisponibilidad {
  const { estadoPasantia, culminada, horarioPuesto } = opts;

  if (!culminada) {
    if (estadoPasantia === 'en_proceso') {
      return { estado: 'en_pasantia', chip: 'En pasantía', texto: 'En pasantía' };
    }
    return { estado: 'disponible', chip: 'Disponible', texto: 'Disponible' };
  }

  // Ya culminó su pasantía.
  const libres = franjasLibres(horarioPuesto);
  if (horarioPuesto && libres) {
    return {
      estado: 'ocupado',
      chip: 'Disponible',
      detalle: libres,
      dias: horarioPuesto.dias,
      texto: `Disponible · ${libres}`,
    };
  }
  return { estado: 'disponible', chip: 'Disponible', texto: 'Disponible' };
}
