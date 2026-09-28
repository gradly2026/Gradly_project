/**
 * comprobantePdf.ts — dibuja los bytes de la constancia de finalización de una
 * pasantía por cupo como un PDF real (pdf-lib, sin navegador headless). Mismo
 * contenido/orden que src/utils/constanciaHtml.ts (que el cliente sigue usando
 * solo para la previsualización EN VIVO antes de enviar, mientras la empresa
 * todavía está escribiendo); duplicado a propósito porque functions/ no importa
 * código de src/ (proyectos TS separados — mismo criterio que asistencia.ts).
 *
 * Sin negrita inline en los párrafos (decisión tomada al planear esta fase):
 * mezclar dos fuentes dentro de una misma línea que además hace salto de línea
 * automático es mucho más código; se reserva Times-Bold para líneas que no se
 * envuelven (título, subtítulo, nombre de la empresa en la firma).
 */
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import * as logger from "firebase-functions/logger";

export interface HorarioPdf {
  dias: string[];
  horaInicio: string;
  horaFin: string;
}

export interface DatosConstanciaPdf {
  estudianteNombre: string;
  empresaNombre: string;
  universidadNombre: string;
  vacanteTitulo: string;
  carrera: string;
  /** ISO `yyyy-mm-dd`. */
  fechaInicio: string;
  /** ISO `yyyy-mm-dd`. */
  fechaFin: string;
  horasCumplidas: number;
  horario: HorarioPdf | null;
}

export interface ExtraConstanciaPdf {
  area?: string;
  supervisor?: string;
  nota?: string;
  /** ISO `yyyy-mm-dd`, ya resuelta por el llamador (sin default aquí). */
  fechaEmisionISO: string;
  /** URL completa de la página pública de verificación (Fase 2). Solo se
   *  dibuja el código QR si viene presente — la función sigue siendo
   *  testeable/reusable sin depender de la verificación pública. */
  urlVerificacion?: string;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** ISO `yyyy-mm-dd` → "3 de septiembre de 2026" (o el original si no parsea).
 *  Duplicado de `fmtFechaLarga` en src/utils/constanciaHtml.ts. */
export function fmtFechaLarga(iso: string): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const y = Number(m[1]);
  const mes = Number(m[2]);
  const d = Number(m[3]);
  if (mes < 1 || mes > 12) return iso;
  return `${d} de ${MESES[mes - 1]} de ${y}`;
}

const ORDEN_DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const DIA_ABREV: Record<string, string> = {
  Lunes: "Lun", Martes: "Mar", Miércoles: "Mié", Jueves: "Jue",
  Viernes: "Vie", Sábado: "Sáb", Domingo: "Dom",
};

/** "Lun–Vie · 08:00 AM – 05:00 PM" — duplicado chico de `textoHorario`
 *  (src/data/disponibilidad.ts). */
function textoHorarioPdf(h: HorarioPdf | null | undefined): string | null {
  if (!h || !Array.isArray(h.dias) || h.dias.length === 0 || !h.horaInicio || !h.horaFin) return null;
  const dias = h.dias.filter((d) => ORDEN_DIAS.includes(d));
  if (dias.length === 0) return null;
  const rangoCompleto = dias.length === 5 && ORDEN_DIAS.slice(0, 5).every((d) => dias.includes(d));
  const textoDias = rangoCompleto ? "Lun–Vie" : dias.map((d) => DIA_ABREV[d] ?? d.slice(0, 3)).join(", ");
  return `${textoDias} · ${h.horaInicio} – ${h.horaFin}`;
}

/**
 * Sanea texto para dibujarlo con una fuente estándar de PDF (WinAnsiEncoding,
 * cp1252). Tildes/ñ/¿/¡ del español están cubiertos sin problema (Latin-1
 * Supplement, 0xA0–0xFF) — lo que rompe son emoji y símbolos fuera de ese
 * rango, que `drawText`/`widthOfTextAtSize` rechazan con una excepción. Primero
 * se normalizan comillas curvas/guiones largos/puntos suspensivos a su
 * equivalente ASCII (sí soportado, pero así se ve igual en cualquier lector);
 * luego se descarta cualquier carácter restante fuera de ASCII imprimible o
 * Latin-1 Supplement (nunca lanza, nunca descarta el string completo).
 */
export function sanearTextoPdf(s: unknown): string {
  const raw = String(s ?? "")
    .normalize("NFC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ");
  let out = "";
  for (const ch of raw) {
    const cp = ch.codePointAt(0) ?? 0;
    if (ch === "\n" || (cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff)) out += ch;
  }
  return out;
}

/** Word-wrap greedy: mide con `widthOfTextAtSize` (el texto ya debe venir
 *  saneado — medir antes de sanear puede lanzar la misma excepción que dibujar). */
function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const palabras = text.split(/\s+/).filter(Boolean);
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of palabras) {
    const candidata = actual ? `${actual} ${palabra}` : palabra;
    if (actual === "" || font.widthOfTextAtSize(candidata, size) <= maxWidth) {
      actual = candidata;
    } else {
      lineas.push(actual);
      actual = palabra;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_TOP = 74;
const MARGIN_SIDE = 68;
const MARGIN_BOTTOM = 62;
const CONTENT_W = PAGE_W - MARGIN_SIDE * 2;
const INK = rgb(0.078, 0.070, 0.11);
const INK_SUB = rgb(0.33, 0.33, 0.33);

/** Dibuja la constancia completa (A4, 1 página normalmente) y devuelve los
 *  bytes del PDF. Mismo texto/orden que `constanciaHtml()`. */
export async function construirComprobantePdfBytes(
  datos: DatosConstanciaPdf,
  extra: ExtraConstanciaPdf,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN_TOP;

  const nuevaPagina = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN_TOP;
  };
  const asegurarEspacio = (alto: number) => {
    if (y - alto < MARGIN_BOTTOM) nuevaPagina();
  };
  const anchoCentrado = (texto: string, font: PDFFont, size: number) =>
    MARGIN_SIDE + (CONTENT_W - font.widthOfTextAtSize(texto, size)) / 2;

  const dibujarCentrado = (texto: string, font: PDFFont, size: number, gap: number) => {
    const limpio = sanearTextoPdf(texto);
    asegurarEspacio(gap);
    page.drawText(limpio, { x: anchoCentrado(limpio, font, size), y: y - size, size, font, color: INK });
    y -= gap;
  };
  const dibujarLinea = (texto: string, size = 12, gap = 20) => {
    asegurarEspacio(gap);
    page.drawText(sanearTextoPdf(texto), { x: MARGIN_SIDE, y: y - size, size, font: regular, color: INK });
    y -= gap;
  };
  const dibujarParrafo = (texto: string, size = 12, lineHeight = 18.5) => {
    const lineas = wrapText(regular, sanearTextoPdf(texto), size, CONTENT_W);
    for (const linea of lineas) {
      asegurarEspacio(lineHeight);
      page.drawText(linea, { x: MARGIN_SIDE, y: y - size, size, font: regular, color: INK });
      y -= lineHeight;
    }
  };
  const dibujarFila = (k: string, v: string) => {
    const size = 11.5;
    const lineHeight = 16;
    const valX = MARGIN_SIDE + 165;
    const valW = CONTENT_W - 165;
    const kTxt = sanearTextoPdf(k);
    const vLineas = wrapText(regular, sanearTextoPdf(v), size, valW);
    const alto = Math.max(1, vLineas.length) * lineHeight;
    asegurarEspacio(alto);
    page.drawText(kTxt, { x: MARGIN_SIDE, y: y - size, size, font: regular, color: INK_SUB });
    vLineas.forEach((linea, i) => {
      page.drawText(linea, { x: valX, y: y - size - i * lineHeight, size, font: regular, color: INK });
    });
    y -= alto;
  };

  const hoy = fmtFechaLarga(extra.fechaEmisionISO);
  const empresa = sanearTextoPdf(datos.empresaNombre || "La empresa");
  const area = extra.area?.trim();
  const supervisor = extra.supervisor?.trim();
  const nota = extra.nota?.trim();
  const horario = textoHorarioPdf(datos.horario);

  dibujarCentrado("CONSTANCIA DE FINALIZACIÓN DE PASANTÍA", bold, 15, 22);
  dibujarCentrado("G R A D L Y", bold, 9.5, 26);

  asegurarEspacio(14);
  page.drawLine({
    start: { x: MARGIN_SIDE, y }, end: { x: MARGIN_SIDE + CONTENT_W, y },
    thickness: 0.75, color: rgb(0.85, 0.85, 0.85),
  });
  y -= 24;

  dibujarLinea(`San Salvador, El Salvador, a ${hoy}.`, 11, 24);

  const carreraTxt = datos.carrera ? `, de la carrera de ${datos.carrera}` : "";
  const vacanteTxt = datos.vacanteTitulo ? `, desempeñándose como ${datos.vacanteTitulo}` : "";
  dibujarParrafo(
    `Por medio de la presente, ${empresa} hace constar que el/la estudiante ` +
    `${datos.estudianteNombre || "—"}${carreraTxt}, de ${datos.universidadNombre || "su universidad"}, ` +
    `realizó y culminó satisfactoriamente su pasantía o práctica profesional en nuestra organización${vacanteTxt}.`,
  );

  y -= 4;
  dibujarLinea("Detalle de la práctica", 11.5, 20);
  dibujarFila("Período", `del ${fmtFechaLarga(datos.fechaInicio)} al ${fmtFechaLarga(datos.fechaFin)}`);
  dibujarFila("Total de horas cumplidas", `${Math.round(datos.horasCumplidas)} horas`);
  if (horario) dibujarFila("Horario", horario);
  if (area) dibujarFila("Área o departamento", area);
  if (supervisor) dibujarFila("Supervisor", supervisor);
  y -= 8;

  if (nota) dibujarParrafo(nota);

  dibujarParrafo(
    "El/la estudiante cumplió con las horas y los compromisos establecidos para su práctica. " +
    "Se extiende la presente a solicitud de la parte interesada, para los fines académicos que estime convenientes.",
  );

  y -= 34;
  asegurarEspacio(90);
  const lineaAncho = 180;
  const lineaX = MARGIN_SIDE + (CONTENT_W - lineaAncho) / 2;
  page.drawLine({
    start: { x: lineaX, y }, end: { x: lineaX + lineaAncho, y },
    thickness: 1, color: INK,
  });
  y -= 16;
  dibujarCentrado(empresa, bold, 12, 16);
  if (supervisor) dibujarCentrado(sanearTextoPdf(supervisor), regular, 11, 15);
  dibujarCentrado(hoy, regular, 11, 15);

  // QR de verificación pública (Fase 2) — un fallo aquí (p. ej. una URL rara)
  // no debe tumbar el documento completo: se loggea y se sigue sin QR.
  if (extra.urlVerificacion) {
    try {
      const qrBytes = await QRCode.toBuffer(extra.urlVerificacion, {
        type: "png", margin: 1, width: 240,
      });
      const qrImage = await pdf.embedPng(qrBytes);
      const qrSize = 78;
      y -= 18;
      asegurarEspacio(qrSize + 34);
      const qrX = MARGIN_SIDE + (CONTENT_W - qrSize) / 2;
      page.drawImage(qrImage, { x: qrX, y: y - qrSize, width: qrSize, height: qrSize });
      y -= qrSize + 6;
      dibujarCentrado("Escanea para verificar este documento", regular, 9, 13);
      const urlLimpia = sanearTextoPdf(extra.urlVerificacion);
      page.drawText(urlLimpia, {
        x: anchoCentrado(urlLimpia, regular, 8), y: y - 8, size: 8, font: regular, color: INK_SUB,
      });
      y -= 12;
    } catch (e) {
      logger.warn("No se pudo dibujar el QR de verificación", e);
    }
  }

  return pdf.save();
}
