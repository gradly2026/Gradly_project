/**
 * Convierte el rango de fechas acordado de una pasantía en una **línea de
 * tiempo porcentual**. Lo consumen los dashboards de estudiante, universidad y
 * empresa para mostrar el avance de una pasantía activa.
 *
 * Acepta fechas en ISO `yyyy-mm-dd` (lo que guarda el acuerdo) o cualquier
 * string parseable por `Date`. Si faltan datos, devuelve un progreso neutro.
 */
export interface ProgresoPasantia {
  /** Porcentaje 0–100 de tiempo transcurrido entre inicio y fin. */
  pct: number;
  diasTotales: number;
  diasTranscurridos: number;
  diasRestantes: number;
  /** `por_iniciar` si aún no llega la fecha de inicio. */
  estado: "por_iniciar" | "en_curso" | "completado";
  fechaInicio: Date | null;
  fechaFin: Date | null;
}

const MS_DIA = 86_400_000;

/** Parsea una fecha (ISO `yyyy-mm-dd`, Date o Timestamp Firestore). */
function parseFecha(valor: unknown): Date | null {
  if (!valor) return null;
  if (valor instanceof Date) return isNaN(valor.getTime()) ? null : valor;
  // Timestamp de Firestore.
  if (typeof (valor as any)?.toDate === "function") {
    const d = (valor as any).toDate();
    return d instanceof Date && !isNaN(d.getTime()) ? d : null;
  }
  if (typeof valor === "string") {
    // `yyyy-mm-dd` se interpreta como medianoche local (no UTC) para evitar
    // desfases de un día por zona horaria.
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor.trim());
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(valor);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function progresoPorFechas(
  fechaInicio: unknown,
  fechaFin: unknown,
  ahora: Date = new Date(),
): ProgresoPasantia {
  const inicio = parseFecha(fechaInicio);
  const fin = parseFecha(fechaFin);

  if (!inicio || !fin || fin.getTime() <= inicio.getTime()) {
    return {
      pct: 0,
      diasTotales: 0,
      diasTranscurridos: 0,
      diasRestantes: 0,
      estado: "por_iniciar",
      fechaInicio: inicio,
      fechaFin: fin,
    };
  }

  // Conteo INCLUSIVO (1-indexado): un rango lun→vie son "5 días", y el primer
  // día de la pasantía ya es el "Día 1" (evita mostrar "Día 0" el día en que
  // arranca, que es como se veía con el conteo exclusivo/0-indexado anterior).
  const diasTotales = Math.max(1, Math.round((fin.getTime() - inicio.getTime()) / MS_DIA) + 1);

  if (ahora.getTime() < inicio.getTime()) {
    return {
      pct: 0,
      diasTotales,
      diasTranscurridos: 0,
      diasRestantes: diasTotales,
      estado: "por_iniciar",
      fechaInicio: inicio,
      fechaFin: fin,
    };
  }
  if (ahora.getTime() >= fin.getTime()) {
    return {
      pct: 100,
      diasTotales,
      diasTranscurridos: diasTotales,
      diasRestantes: 0,
      estado: "completado",
      fechaInicio: inicio,
      fechaFin: fin,
    };
  }

  const diasTranscurridos = Math.max(
    1,
    Math.min(diasTotales, Math.floor((ahora.getTime() - inicio.getTime()) / MS_DIA) + 1),
  );
  const diasRestantes = Math.max(0, diasTotales - diasTranscurridos);
  const pct = Math.max(0, Math.min(100, Math.round((diasTranscurridos / diasTotales) * 100)));

  return {
    pct,
    diasTotales,
    diasTranscurridos,
    diasRestantes,
    estado: "en_curso",
    fechaInicio: inicio,
    fechaFin: fin,
  };
}
