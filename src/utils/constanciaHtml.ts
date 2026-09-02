// ════════════════════════════════════════════════════════════════════════
// constanciaHtml.ts — HTML de la CONSTANCIA DE FINALIZACIÓN de una pasantía
// por cupo, con formato de documento formal (carta membretada). Se lo pasa a
// `expo-print` (Print.printAsync) para descargarla/imprimirla como PDF.
//
// Solo presentación: los datos salen de `construirDatosConstancia`
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

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  );
}

export interface ConstanciaExtra {
  area?: string;
  supervisor?: string;
  nota?: string;
  /** Fecha de emisión (ISO `yyyy-mm-dd`) — la que fijó la empresa al enviar.
   *  Si falta, se usa la de hoy (solo para la previsualización previa al envío). */
  fechaEmisionISO?: string;
}

/** HTML A4 de la constancia de finalización de pasantía (documento formal). */
export function constanciaHtml(d: DatosConstancia, extra?: ConstanciaExtra): string {
  const hoy = fmtFechaLarga(extra?.fechaEmisionISO || new Date().toISOString().slice(0, 10));
  const horario = textoHorario(d.horario as any) || '';
  const area = extra?.area?.trim();
  const supervisor = extra?.supervisor?.trim();
  const nota = extra?.nota?.trim();
  const empresa = esc(d.empresaNombre || 'La empresa');

  const fila = (k: string, v: string) =>
    `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 26mm 24mm 22mm; }
    * { font-family: 'Times New Roman', Georgia, serif; color: #14121c; box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    .pagenum { position: fixed; bottom: 8mm; right: 0; font: 10pt Arial, sans-serif; color: #666; }
    h1 { font-size: 15pt; text-align: center; text-transform: uppercase; letter-spacing: .6px; margin: 0 0 3pt; }
    .brand { text-align: center; font: 700 9.5pt Arial, sans-serif; letter-spacing: 3px; color: #6b7280; margin-bottom: 30pt; }
    .lugar { font-size: 11pt; margin-bottom: 18pt; }
    p { font-size: 12pt; line-height: 1.85; text-align: justify; margin: 0 0 14pt; }
    .detalle { margin: 6pt 0 16pt; }
    .detalle .lbl { font-size: 11.5pt; font-weight: bold; margin-bottom: 6pt; }
    table.d { border-collapse: collapse; font-size: 11.5pt; }
    table.d td { padding: 3.5pt 0; vertical-align: top; }
    table.d td.k { color: #555; padding-right: 18pt; white-space: nowrap; }
    .firma { margin-top: 54pt; text-align: center; font-size: 11pt; }
    .firma .line { border-top: 1px solid #14121c; width: 62mm; margin: 0 auto 6pt; }
    .firma .name { font-weight: bold; }
  </style></head><body>
    <h1>Constancia de finalización de pasantía</h1>
    <div class="brand">GRADLY</div>

    <div class="lugar">San Salvador, El Salvador, a ${hoy}.</div>

    <p>Por medio de la presente, <b>${empresa}</b> hace constar que el/la estudiante
    <b>${esc(d.estudianteNombre || '—')}</b>${d.carrera ? `, de la carrera de ${esc(d.carrera)}` : ''}, de
    <b>${esc(d.universidadNombre || 'su universidad')}</b>, realizó y <b>culminó satisfactoriamente</b> su
    pasantía o práctica profesional en nuestra organización${d.vacanteTitulo ? `, desempeñándose como <b>${esc(d.vacanteTitulo)}</b>` : ''}.</p>

    <div class="detalle">
      <div class="lbl">Detalle de la práctica</div>
      <table class="d">
        ${fila('Período', `del ${fmtFechaLarga(d.fechaInicio)} al ${fmtFechaLarga(d.fechaFin)}`)}
        ${fila('Total de horas cumplidas', `${d.horasCumplidas} horas`)}
        ${horario ? fila('Horario', horario) : ''}
        ${area ? fila('Área o departamento', area) : ''}
        ${supervisor ? fila('Supervisor', supervisor) : ''}
      </table>
    </div>

    ${nota ? `<p>${esc(nota)}</p>` : ''}

    <p>El/la estudiante cumplió con las horas y los compromisos establecidos para su práctica. Se
    extiende la presente a solicitud de la parte interesada, para los fines académicos que estime
    convenientes.</p>

    <div class="firma">
      <div class="line"></div>
      <div class="name">${empresa}</div>
      ${supervisor ? `<div>${esc(supervisor)}</div>` : ''}
      <div>${hoy}</div>
    </div>

    <div class="pagenum">1</div>
  </body></html>`;
}
