/**
 * faqExtractor.ts — extrae preguntas/respuestas de un documento (.pdf/.docx/
 * .txt) que el admin sube para poblar el FAQ del Asistente Gradly
 * (`config/faq`, ver chatbot.ts).
 *
 * Flujo: el cliente sube el archivo a Storage (`faq_uploads/{uid}/...`),
 * llama a este callable con la ruta; aquí se descarga con el Admin SDK, se
 * extrae el texto plano (pdf-parse / mammoth / directo si es .txt) y se le
 * pide a Gemini que identifique pares pregunta/respuesta en JSON estricto
 * (mismo secreto GEMINI_API_KEY y mismo patrón REST que chatbot.ts).
 *
 * A propósito, el resultado NO se guarda solo en `config/faq`: el cliente lo
 * muestra en la lista editable que ya existe para que el admin revise antes
 * de guardar — un documento real puede traer contenido mal interpretado.
 *
 * Requiere: GEMINI_API_KEY ya configurado (lo usa chatbotGradly desde antes).
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

if (admin.apps.length === 0) admin.initializeApp();

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const REGION = "us-central1";
const MODELO = "gemini-2.5-flash";
// Recorte de seguridad antes de mandar el texto a Gemini: un documento de
// preguntas frecuentes no necesita más que esto para que el modelo capte
// todo el contenido relevante, y evita facturas sorpresa con un archivo
// inusualmente denso.
const MAX_TEXTO_CHARS = 60_000;
const MAX_PREGUNTAS_ABSOLUTO = 60;

function asString(value: unknown): string {
  return String(value ?? "").trim();
}

/** Mismo criterio que `requireAdmin` de admin.ts, reimplementado aquí a
 *  propósito (archivo aparte de functions/, mismo criterio de duplicar
 *  helpers chicos en vez de crear un import cruzado entre módulos). */
async function exigirAdmin(auth: { uid?: string; token?: Record<string, unknown> } | null | undefined): Promise<string> {
  const uid = asString(auth?.uid);
  if (!uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  const tokenRole = asString(auth?.token?.role);
  if (tokenRole === "admin") return uid;
  const snap = await admin.firestore().collection("usuarios").doc(uid).get();
  if (asString(snap.data()?.rol) !== "admin") {
    throw new HttpsError("permission-denied", "No tienes permisos de administrador.");
  }
  return uid;
}

async function extraerTexto(buffer: Buffer, extension: string): Promise<string> {
  if (extension === "txt") {
    return buffer.toString("utf-8");
  }
  if (extension === "pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const resultado = await parser.getText();
      return resultado.text ?? "";
    } finally {
      await parser.destroy();
    }
  }
  if (extension === "docx") {
    const { value } = await mammoth.extractRawText({ buffer });
    return value ?? "";
  }
  throw new HttpsError("invalid-argument", "Formato no soportado. Usa .pdf, .docx o .txt.");
}

/** Pide a Gemini que identifique pares pregunta/respuesta en el texto,
 *  forzando JSON estricto vía `responseSchema` (evita tener que parsear
 *  prosa libre para encontrar el JSON, mismo problema que sí puede tener
 *  chatbotGradly con una respuesta conversacional). */
async function extraerPreguntasConGemini(
  texto: string,
  cuposDisponibles: number,
): Promise<{ p: string; r: string }[]> {
  const tope = Math.max(1, Math.min(cuposDisponibles, MAX_PREGUNTAS_ABSOLUTO));
  const prompt = `Eres un asistente que prepara el FAQ de un chatbot de ayuda. Te doy el texto completo de un documento que un administrador subió para alimentar ese FAQ. Identifica pares de PREGUNTA y RESPUESTA:
- Si el documento ya trae preguntas y respuestas explícitas (aunque el formato varíe), extráelas tal cual, sin inventar información nueva.
- Si el documento es informativo pero no tiene formato de preguntas, redacta preguntas razonables que un usuario haría y responde usando SOLO el contenido del documento.
- Ignora portadas, índices, pies de página y contenido irrelevante.
- Responde en español, sé breve en las respuestas (2-4 frases).
- Devuelve como máximo ${tope} pares, priorizando los más útiles/generales si hay más.

TEXTO DEL DOCUMENTO:
"""
${texto.slice(0, MAX_TEXTO_CHARS)}
"""`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 4000,
      responseMimeType: "application/json",
      responseSchema: {
        type: "ARRAY",
        maxItems: tope,
        items: {
          type: "OBJECT",
          properties: {
            p: { type: "STRING" },
            r: { type: "STRING" },
          },
          required: ["p", "r"],
        },
      },
    },
  };

  let resp: Response;
  try {
    resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY.value(),
        },
        body: JSON.stringify(body),
      },
    );
  } catch (e) {
    logger.error("extraerFaqDeDocumento: fallo de red hacia Gemini", e);
    throw new HttpsError("unavailable", "No se pudo contactar al servicio de extracción. Intenta de nuevo.");
  }

  if (!resp.ok) {
    const detalle = await resp.text().catch(() => "");
    logger.error("extraerFaqDeDocumento: Gemini respondió con error", {
      status: resp.status,
      detalle: detalle.slice(0, 500),
    });
    throw new HttpsError("internal", "No se pudieron extraer las preguntas. Intenta de nuevo.");
  }

  const json: any = await resp.json().catch(() => null);
  const texto2: string = json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") ?? "";
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto2);
  } catch {
    logger.error("extraerFaqDeDocumento: JSON inválido de Gemini", { texto2: texto2.slice(0, 500) });
    throw new HttpsError("internal", "El documento no se pudo interpretar. Prueba con otro archivo.");
  }

  if (!Array.isArray(crudo)) return [];
  return crudo
    .map((e: any) => ({ p: asString(e?.p), r: asString(e?.r) }))
    .filter((e) => e.p && e.r)
    .slice(0, tope);
}

export const extraerFaqDeDocumento = onCall(
  { secrets: [GEMINI_API_KEY], region: REGION, memory: "512MiB", timeoutSeconds: 120 },
  async (req) => {
    await exigirAdmin(req.auth);

    const storagePath = asString(req.data?.storagePath);
    const extension = asString(req.data?.extension).toLowerCase();
    const cuposDisponibles = Number(req.data?.cuposDisponibles);
    if (!storagePath || !["pdf", "docx", "txt"].includes(extension)) {
      throw new HttpsError("invalid-argument", "Parámetros inválidos.");
    }
    if (!Number.isFinite(cuposDisponibles) || cuposDisponibles <= 0) {
      throw new HttpsError("failed-precondition", "Ya tienes el máximo de 40 preguntas — borra alguna antes de subir un documento nuevo.");
    }

    const bucket = admin.storage().bucket();
    const file = bucket.file(storagePath);

    try {
      const [existe] = await file.exists();
      if (!existe) {
        throw new HttpsError("not-found", "No se encontró el archivo subido.");
      }

      let buffer: Buffer;
      try {
        [buffer] = await file.download();
      } catch (e) {
        logger.error("extraerFaqDeDocumento: fallo al descargar de Storage", e);
        throw new HttpsError("internal", "No se pudo leer el archivo subido.");
      }

      let texto: string;
      try {
        texto = await extraerTexto(buffer, extension);
      } catch (e) {
        if (e instanceof HttpsError) throw e;
        logger.error("extraerFaqDeDocumento: fallo al extraer texto", e);
        throw new HttpsError("internal", "No pudimos leer el contenido del archivo. Verifica que no esté dañado.");
      }

      if (!texto.trim()) {
        throw new HttpsError("invalid-argument", "El documento no tiene texto que se pueda leer (¿es un escaneo de imágenes?).");
      }

      const entradas = await extraerPreguntasConGemini(texto, cuposDisponibles);
      if (entradas.length === 0) {
        throw new HttpsError("invalid-argument", "No se encontraron preguntas y respuestas en el documento.");
      }
      return { entradas };
    } finally {
      // Limpieza best-effort: el archivo ya cumplió su propósito, sea que la
      // extracción haya funcionado o no. Nunca debe tumbar la respuesta real.
      file.delete().catch(() => {});
    }
  },
);
