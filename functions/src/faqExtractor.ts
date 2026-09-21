/**
 * faqExtractor.ts — extrae preguntas/respuestas de un documento (.pdf/.docx/
 * .txt) que el admin sube para poblar el FAQ del Asistente Gradly
 * (`config/faq`, ver chatbot.ts).
 *
 * Flujo: el cliente sube el archivo a Storage (`faq_uploads/{uid}/...`),
 * llama a este callable con la ruta; aquí se descarga con el Admin SDK, se
 * extrae el texto plano (pdf-parse / mammoth / directo si es .txt) y se le
 * pide a Groq que identifique pares pregunta/respuesta en JSON estricto
 * (mismo secreto GROQ_API_KEY, mismo modelo y mismo patrón REST que
 * `llamarGroq` de chatbot.ts).
 *
 * A propósito, el resultado NO se guarda solo en `config/faq`: el cliente lo
 * muestra en la lista editable que ya existe para que el admin revise antes
 * de guardar — un documento real puede traer contenido mal interpretado.
 *
 * Requiere: GROQ_API_KEY ya configurado (lo usa chatbotGradly).
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

if (admin.apps.length === 0) admin.initializeApp();

const GROQ_API_KEY = defineSecret("GROQ_API_KEY");
const REGION = "us-central1";
const MODELO_GROQ = "openai/gpt-oss-120b"; // mismo modelo que chatbot.ts (llamarGroq)
// Recorte de seguridad antes de mandar el texto a Groq: un documento de
// preguntas frecuentes no necesita más que esto para que el modelo capte
// todo el contenido relevante, y evita facturas sorpresa con un archivo
// inusualmente denso. Ojo: el plan gratuito de Groq limita la petición
// COMPLETA (entrada + salida pedida) a ~8.000 tokens por minuto, así que un
// documento largo puede rebotar con 413/429 — el error ya se lo explica al admin.
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

/** Pide a Groq que identifique pares pregunta/respuesta en el texto,
 *  forzando JSON estricto vía `response_format` con `json_schema` y
 *  `strict: true` (gpt-oss-120b lo soporta con decodificación restringida):
 *  evita tener que parsear prosa libre para encontrar el JSON, mismo problema
 *  que sí puede tener chatbotGradly con una respuesta conversacional. */
async function extraerPreguntasConGroq(
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
- Formato: un objeto JSON con la lista "entradas"; cada elemento tiene "p" (la pregunta) y "r" (la respuesta).

TEXTO DEL DOCUMENTO:
"""
${texto.slice(0, MAX_TEXTO_CHARS)}
"""`;

  const body = {
    model: MODELO_GROQ,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    // gpt-oss razona antes de responder y esos tokens cuentan dentro del tope de
    // salida: `low` los mantiene cortos, y el tope crece con la cantidad de
    // pares pedidos. Tampoco conviene inflarlo: Groq descuenta del límite por
    // minuto el tope PEDIDO, no los tokens realmente generados.
    reasoning_effort: "low",
    max_completion_tokens: Math.min(6000, 600 + tope * 100),
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "faq_entradas",
        strict: true,
        // El modo estricto exige todos los campos en `required` y
        // `additionalProperties: false` en cada objeto; la raíz debe ser un
        // objeto, por eso la lista va dentro de `entradas`.
        schema: {
          type: "object",
          properties: {
            entradas: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  p: { type: "string" },
                  r: { type: "string" },
                },
                required: ["p", "r"],
                additionalProperties: false,
              },
            },
          },
          required: ["entradas"],
          additionalProperties: false,
        },
      },
    },
  };

  let resp: Response;
  try {
    resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY.value()}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    logger.error("extraerFaqDeDocumento: fallo de red hacia Groq", e);
    throw new HttpsError("unavailable", "No se pudo contactar al servicio de extracción. Intenta de nuevo.");
  }

  if (!resp.ok) {
    const detalle = await resp.text().catch(() => "");
    logger.error("extraerFaqDeDocumento: Groq respondió con error", {
      status: resp.status,
      detalle: detalle.slice(0, 500),
    });
    // 413/429 = límite de tokens o de peticiones por minuto (plan gratuito):
    // casi siempre es un documento demasiado largo o varias subidas seguidas.
    if (resp.status === 413 || resp.status === 429) {
      throw new HttpsError(
        "resource-exhausted",
        "El documento es demasiado largo para el límite actual del servicio de extracción, o hubo varias subidas seguidas. Prueba con un documento más corto o vuelve a intentarlo en un minuto.",
      );
    }
    throw new HttpsError("internal", "No se pudieron extraer las preguntas. Intenta de nuevo.");
  }

  const json: any = await resp.json().catch(() => null);
  const eleccion = json?.choices?.[0];
  const texto2: string = String(eleccion?.message?.content ?? "");
  if (eleccion?.finish_reason === "length") {
    // La salida se cortó por el tope de tokens: el JSON quedó incompleto.
    logger.error("extraerFaqDeDocumento: respuesta de Groq cortada por longitud", {
      texto2: texto2.slice(0, 200),
    });
    throw new HttpsError(
      "resource-exhausted",
      "El documento tiene demasiado contenido para procesarlo de una sola vez. Prueba con un documento más corto o sube solo una parte.",
    );
  }
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto2);
  } catch {
    logger.error("extraerFaqDeDocumento: JSON inválido de Groq", { texto2: texto2.slice(0, 500) });
    throw new HttpsError("internal", "El documento no se pudo interpretar. Prueba con otro archivo.");
  }

  // Con el esquema estricto llega `{ entradas: [...] }`; se tolera también una
  // lista suelta por si el modelo la devolviera sin envoltorio.
  const lista: unknown = Array.isArray(crudo) ? crudo : (crudo as any)?.entradas;
  if (!Array.isArray(lista)) return [];
  return lista
    .map((e: any) => ({ p: asString(e?.p), r: asString(e?.r) }))
    .filter((e) => e.p && e.r)
    .slice(0, tope);
}

export const extraerFaqDeDocumento = onCall(
  { secrets: [GROQ_API_KEY], region: REGION, memory: "512MiB", timeoutSeconds: 120 },
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

      const entradas = await extraerPreguntasConGroq(texto, cuposDisponibles);
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
