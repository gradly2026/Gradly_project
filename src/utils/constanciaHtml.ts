// ════════════════════════════════════════════════════════════════════════
// constanciaHtml.ts — HTML de una página para la CONSTANCIA DE FINALIZACIÓN
// de una pasantía por cupo. Se lo pasa a `expo-print` (Print.printAsync /
// printToFileAsync) para que la empresa la descargue/imprima como PDF.
//
// Es solo presentación: los datos salen de `construirDatosConstancia`
// (comprobanteService.ts) y ya están en la BD cuando se envía.
// ════════════════════════════════════════════════════════════════════════

import { textoHorario } from '../data/disponibilidad';
import type { DatosConstancia } from '../services/comprobanteService';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** ISO `yyyy-mm-dd` → "3 de septiembre de 2026" (o el original si no parsea). */
export function fmtFechaLarga(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return iso;
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  );
}

/** HTML A4 de la constancia de finalización de pasantía. */
export function constanciaHtml(
  d: DatosConstancia,
  extra?: { area?: string; supervisor?: string },
): string {
  const hoy = fmtFechaLarga(new Date().toISOString().slice(0, 10));
  const horario = textoHorario(d.horario as any) || '';
  const area = extra?.area?.trim();
  const supervisor = extra?.supervisor?.trim();

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    * { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1b1430; box-sizing: border-box; }
    body { margin: 0; padding: 56px 60px; }
    .brand { font-size: 12px; letter-spacing: 2px; color: #6b7280; font-weight: 700; }
    h1 { font-size: 21px; margin: 26px 0 6px; text-align: center; letter-spacing: 1px; }
    .rule { height: 3px; background: #8b5cf6; width: 68px; margin: 0 auto 30px; border-radius: 2px; }
    p { font-size: 14px; line-height: 1.9; text-align: justify; }
    .datos { margin: 22px 0; font-size: 14px; line-height: 2; }
    .datos b { display: inline-block; min-width: 180px; color: #6b7280; font-weight: 600; }
    .firma { margin-top: 66px; text-align: center; font-size: 13px; }
    .firma .linea { border-top: 1px solid #1b1430; width: 240px; margin: 0 auto 6px; }
    .pie { margin-top: 44px; font-size: 11px; color: #9ca3af; text-align: center; }
  </style></head><body>
    <div class="brand">CONSTANCIA &middot; GRADLY</div>
    <h1>CONSTANCIA DE FINALIZACIÓN DE PASANTÍA</h1>
    <div class="rule"></div>
    <p>Por medio de la presente, <b>${escapeHtml(d.empresaNombre || 'la empresa')}</b> hace constar que
    el/la estudiante <b>${escapeHtml(d.estudianteNombre || '—')}</b>${d.carrera ? `, de la carrera de ${escapeHtml(d.carrera)}` : ''},
    de <b>${escapeHtml(d.universidadNombre || 'su universidad')}</b>, realizó y <b>culminó satisfactoriamente</b>
    su pasantía / práctica profesional en nuestra organización${d.vacanteTitulo ? ` desempeñándose como <b>${escapeHtml(d.vacanteTitulo)}</b>` : ''}.</p>
    <div class="datos">
      <div><b>Período:</b> del ${fmtFechaLarga(d.fechaInicio)} al ${fmtFechaLarga(d.fechaFin)}</div>
      <div><b>Total de horas cumplidas:</b> ${escapeHtml(d.horasCumplidas)} horas</div>
      ${horario ? `<div><b>Horario:</b> ${escapeHtml(horario)}</div>` : ''}
      ${area ? `<div><b>Área / departamento:</b> ${escapeHtml(area)}</div>` : ''}
      ${supervisor ? `<div><b>Supervisor:</b> ${escapeHtml(supervisor)}</div>` : ''}
    </div>
    <p>El/la estudiante cumplió con las horas y compromisos establecidos para su práctica. Se extiende la
    presente a solicitud de la parte interesada, para los fines académicos que estime convenientes, y se agradece
    a la universidad por el vínculo entre la academia y el mundo laboral.</p>
    <div class="firma">
      <div class="linea"></div>
      ${escapeHtml(d.empresaNombre || 'La empresa')}<br/>
      ${supervisor ? escapeHtml(supervisor) + '<br/>' : ''}
      ${hoy}
    </div>
    <div class="pie">Documento generado por Gradly &middot; El Salvador &middot; ${hoy}</div>
  </body></html>`;
}
