/**
 * chatbot.ts — "Asistente Gradly": un bot de AYUDA que responde dudas sobre
 * cómo usar la plataforma. Fase 1: solo texto (Q&A), sin navegar la app.
 *
 * Llama a la API de Gemini (generativelanguage.googleapis.com) por REST — sin
 * SDK, con `fetch` nativo de Node 24. La API key va como SECRETO, nunca en el
 * cliente.
 *
 * DESPLIEGUE (una vez):
 *   1. Consigue una API key de Gemini en https://aistudio.google.com/apikey
 *      (con facturación activa en el proyecto de Google Cloud).
 *   2. firebase functions:secrets:set GEMINI_API_KEY
 *   3. firebase deploy --only functions:chatbotGradly
 *
 * No necesita cambios de reglas: el contador de uso (`chatbot_uso/{uid}`) lo
 * escribe esta función con el Admin SDK, que se salta las reglas.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

if (admin.apps.length === 0) admin.initializeApp();

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const db = admin.firestore();

const REGION = "us-central1";
const MODELO = "gemini-2.5-flash"; // rápido y barato; cambiar aquí si hiciera falta
const LIMITE_DIARIO = 40; // consultas por usuario por día
const MAX_MENSAJES = 20; // turnos de historial que aceptamos
const MAX_LARGO_MSG = 2000; // caracteres por mensaje

interface MensajeEntrada {
  rol: "user" | "model";
  texto: string;
}

/** Instrucción de sistema: todo lo que el bot "sabe" de Gradly. */
function systemPrompt(idioma: "es" | "en", rolUsuario: string): string {
  const lang = idioma === "en" ? "English" : "español";
  return `Eres el Asistente de Gradly, una plataforma salvadoreña que conecta a estudiantes universitarios con empresas para hacer sus PRÁCTICAS LABORALES (pasantías) y, para egresados, empleo real. Hay 4 roles: estudiante, empresa, universidad y administrador. La persona que te escribe tiene el rol: ${rolUsuario || "desconocido"}.

TU TRABAJO: resolver dudas sobre CÓMO usar Gradly y QUÉ significan las cosas. Responde SIEMPRE en ${lang}. Sé breve y concreto (2 a 6 frases, o una lista corta). Si la pregunta no es sobre Gradly, dilo con amabilidad y no respondas de otro tema.

REGLAS: Nunca pidas contraseñas, códigos de acceso ni datos bancarios. Tú NO puedes ejecutar acciones dentro de la app (no envías mensajes, no aceptas acuerdos, no subes archivos): solo explicas dónde y cómo hacerlo. Si algo se sale de lo que sabes, o parece un problema técnico o de la cuenta, di que abra "Mi perfil → Ayuda → Enviar un mensaje al equipo".

CÓMO FUNCIONA GRADLY:
- Estudiante: completa su perfil, ve vacantes que le hacen match por carrera, se postula (individual) o su universidad lo asigna a un "cupo" de un lote. Cuando la empresa lo toma, se fija el "Día 1" (fecha de presentación). Sus horas avanzan solas según el horario del acuerdo y se ven en "Mi progreso". Al cumplir las horas, la práctica pasa a "por certificar"; la empresa envía el comprobante y la universidad lo valida, y queda "Certificado".
- Empresa: publica vacantes (con o sin cupos por lote), revisa postulantes, coordina por chat, fija el Día 1, da seguimiento en "Pasantías", califica el desempeño y envía el comprobante de finalización. También contrata egresados en "Reclutamiento".
- Universidad: carga a sus estudiantes y grupos, ve vacantes disponibles para sus carreras, asigna cupos, acompaña la práctica, valida comprobantes y certifica horas. Modera el chat de sus grupos.
- El "acuerdo" (handshake) entre universidad y empresa fija días, horario, fechas y pago; lo firma la contraparte de quien lo propuso.

GLOSARIO:
- "Certificado": el estudiante ya culminó su pasantía (estado visible). Es distinto de "Egresado/graduado", que es haber terminado la carrera.
- "Cupo": una plaza dentro de un lote de vacantes que la universidad reparte entre estudiantes de un grupo.
- "Día 1": la fecha de presentación que fija la empresa; desde ahí cuentan las horas.
- "Comprobante": la constancia de finalización de la pasantía; la emite la empresa y la valida la universidad.
- "Incidencia": un problema ocurrido durante la práctica (sin supervisor, horario distinto, etc.). Se abre en "Mi institución → Incidencias". Es distinto de "Reportar un usuario" (conducta), que va solo al administrador.
- "Mensaje de soporte": una consulta 1 a 1 con el equipo de Gradly desde "Mi perfil → Ayuda".
- Algunas carreras no pueden hacer prácticas laborales por regulación estatal; si una carrera no aparece habilitada, es por eso.

DÓNDE ESTÁ CADA COSA:
- Progreso de la pasantía, calendario e historial: sección/pestaña "Progreso" (estudiante).
- Vacantes y postulaciones: la pantalla principal o "Vacantes".
- Conversaciones: "Mensajes".
- Notificaciones: la campanita arriba a la derecha.
- Ayuda, contacto y mensajes de soporte: "Mi perfil → Ayuda".
- Idioma y tema claro/oscuro: la píldora flotante arriba a la derecha, o "Mi perfil → Preferencias".`;
}

/** Contador de uso diario por usuario (Admin SDK → sin reglas). */
async function consumirCuota(uid: string): Promise<void> {
  const ref = db.collection("chatbot_uso").doc(uid);
  const hoy = new Date().toISOString().slice(0, 10);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() as { dia?: string; n?: number }) : {};
    const n = data.dia === hoy ? Number(data.n ?? 0) : 0;
    if (n >= LIMITE_DIARIO) {
      throw new HttpsError(
        "resource-exhausted",
        "Llegaste al límite de consultas del asistente por hoy. Vuelve mañana.",
      );
    }
    tx.set(
      ref,
      { dia: hoy, n: n + 1, actualizadoAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
  });
}

export const chatbotGradly = onCall(
  { secrets: [GEMINI_API_KEY], region: REGION },
  async (req) => {
    if (!req.auth?.uid) {
      throw new HttpsError("unauthenticated", "Inicia sesión para usar el asistente.");
    }
    const uid = req.auth.uid;

    const idioma: "es" | "en" = req.data?.idioma === "en" ? "en" : "es";
    const rolUsuario = String(req.data?.rolUsuario ?? "").slice(0, 20);
    const crudos: unknown = req.data?.mensajes;
    if (!Array.isArray(crudos) || crudos.length === 0) {
      throw new HttpsError("invalid-argument", "Falta el mensaje.");
    }

    const mensajes: MensajeEntrada[] = crudos
      .slice(-MAX_MENSAJES)
      .map((m: any): MensajeEntrada => ({
        rol: m?.rol === "model" ? "model" : "user",
        texto: String(m?.texto ?? "").slice(0, MAX_LARGO_MSG),
      }))
      .filter((m) => m.texto.trim().length > 0);

    if (mensajes.length === 0 || mensajes[mensajes.length - 1].rol !== "user") {
      throw new HttpsError("invalid-argument", "El último mensaje debe ser del usuario.");
    }

    await consumirCuota(uid);

    const body = {
      systemInstruction: { parts: [{ text: systemPrompt(idioma, rolUsuario) }] },
      contents: mensajes.map((m) => ({ role: m.rol, parts: [{ text: m.texto }] })),
      generationConfig: { temperature: 0.3, topP: 0.9, maxOutputTokens: 800 },
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
      logger.error("chatbotGradly: fallo de red hacia Gemini", e);
      throw new HttpsError("unavailable", "El asistente no está disponible ahora. Intenta de nuevo.");
    }

    if (!resp.ok) {
      const detalle = await resp.text().catch(() => "");
      logger.error("chatbotGradly: Gemini respondió con error", {
        status: resp.status,
        detalle: detalle.slice(0, 500),
      });
      throw new HttpsError("internal", "El asistente no pudo responder. Intenta de nuevo.");
    }

    const json: any = await resp.json().catch(() => null);
    const texto: string =
      json?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p?.text ?? "")
        .join("")
        .trim() ?? "";

    if (!texto) {
      const motivo = json?.promptFeedback?.blockReason ?? json?.candidates?.[0]?.finishReason;
      logger.warn("chatbotGradly: respuesta vacía de Gemini", { motivo });
      return {
        respuesta:
          idioma === "en"
            ? "I couldn't produce an answer for that. Try rephrasing, or open \"My profile → Help → Send a message to the team\"."
            : "No pude responder eso. Prueba a reformularlo, o abre \"Mi perfil → Ayuda → Enviar un mensaje al equipo\".",
      };
    }

    return { respuesta: texto };
  },
);
