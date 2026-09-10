/**
 * chatbot.ts — "Asistente Gradly": un bot de AYUDA que responde dudas sobre
 * cómo usar la plataforma.
 *   · Fase 1: texto (Q&A).
 *   · Fase 2: puede OFRECER llevar al usuario a una sección (tool `irA`); la
 *     navegación la ejecuta el cliente cuando el usuario toca "Ir a …" — el
 *     bot nunca envía/acepta/borra nada.
 *   · Fase 3: recibe la pantalla actual (`pantallaActual`) para afinar la
 *     respuesta, y un FAQ editable por el admin (`config/faq`).
 *
 * Llama a la API de Gemini (generativelanguage.googleapis.com) por REST — sin
 * SDK, con `fetch` nativo de Node 24. La API key va como SECRETO.
 *
 * DESPLIEGUE (una vez):
 *   1. Consigue una API key de Gemini en https://aistudio.google.com/apikey
 *      (con facturación activa en el proyecto de Google Cloud).
 *   2. firebase functions:secrets:set GEMINI_API_KEY
 *   3. firebase deploy --only functions:chatbotGradly
 *
 * No necesita cambios de reglas: el contador de uso (`chatbot_uso/{uid}`) y la
 * lectura del FAQ (`config/faq`) los hace esta función con el Admin SDK.
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

/**
 * Destinos a los que el bot puede OFRECER llevar (tool `irA`). Réplica de
 * `src/utils/asistenteDestinos.ts` — si cambias uno, cámbialo en ambos.
 */
const DESTINOS: Record<string, { label: string; roles: string[] }> = {
  mensajes: { label: "Mensajes", roles: ["estudiante", "empresa", "universidad"] },
  ayuda: { label: "Ayuda", roles: ["estudiante", "empresa", "universidad"] },
  miPerfil: { label: "Mi perfil", roles: ["estudiante", "empresa", "universidad"] },
  progreso: { label: "Mi progreso", roles: ["estudiante"] },
  buscarVacantes: { label: "Buscar vacantes", roles: ["estudiante"] },
  institucion: { label: "Mi institución", roles: ["estudiante"] },
  misVacantes: { label: "Mis vacantes", roles: ["empresa"] },
  pasantesEmpresa: { label: "Pasantes activos", roles: ["empresa"] },
  misEstudiantes: { label: "Mis estudiantes", roles: ["universidad"] },
  aprobaciones: { label: "Aprobaciones", roles: ["universidad"] },
};
const destinosDeRol = (rol: string): string[] =>
  Object.keys(DESTINOS).filter((k) => DESTINOS[k].roles.includes(rol));

/** FAQ editable desde el panel admin (`config/faq`, campo `entradas: {p,r}[]`). */
async function leerFaq(): Promise<{ p: string; r: string }[]> {
  try {
    const snap = await db.collection("config").doc("faq").get();
    const arr = (snap.exists ? (snap.data() as any)?.entradas : null) ?? [];
    return Array.isArray(arr)
      ? arr
          .map((e: any) => ({ p: String(e?.p ?? "").trim(), r: String(e?.r ?? "").trim() }))
          .filter((e: { p: string; r: string }) => e.p && e.r)
          .slice(0, 40)
      : [];
  } catch {
    return [];
  }
}

/** Instrucción de sistema: todo lo que el bot "sabe" de Gradly. */
function systemPrompt(
  idioma: "es" | "en",
  rolUsuario: string,
  pantalla: string,
  faq: { p: string; r: string }[],
): string {
  const lang = idioma === "en" ? "English" : "español";
  const destinos = destinosDeRol(rolUsuario);
  const listaDestinos = destinos.length
    ? destinos.map((k) => `  · ${k} = ${DESTINOS[k].label}`).join("\n")
    : "  (ninguno para este rol)";
  const bloqueFaq = faq.length
    ? `\n\nPREGUNTAS FRECUENTES (el equipo de Gradly las escribió; úsalas como fuente prioritaria si aplican):\n${faq
        .map((e) => `P: ${e.p}\nR: ${e.r}`)
        .join("\n\n")}`
    : "";
  return `Eres el Asistente de Gradly, una plataforma salvadoreña que conecta a estudiantes universitarios con empresas para hacer sus PRÁCTICAS LABORALES (pasantías) y, para egresados, empleo real. Hay 4 roles: estudiante, empresa, universidad y administrador. La persona que te escribe tiene el rol: ${rolUsuario || "desconocido"}${pantalla ? `, y ahora mismo está viendo: ${pantalla}` : ""}.

TU TRABAJO: resolver dudas sobre CÓMO usar Gradly y QUÉ significan las cosas. Responde SIEMPRE en ${lang}. Sé breve y concreto (2 a 6 frases, o una lista corta). Si la pregunta no es sobre Gradly, dilo con amabilidad y no respondas de otro tema.

REGLAS: Nunca pidas contraseñas, códigos de acceso ni datos bancarios. Tú NO puedes ejecutar acciones dentro de la app (no envías mensajes, no aceptas acuerdos, no subes archivos, no borras nada): solo explicas dónde y cómo hacerlo. Si algo se sale de lo que sabes, o parece un problema técnico o de la cuenta, di que abra "Mi perfil → Ayuda → Enviar un mensaje al equipo".

NAVEGACIÓN: si tu respuesta implica ir a un lugar concreto de la app, además de explicarlo BREVEMENTE, llama a la herramienta \`irA\` con el destino adecuado (el usuario verá un botón y decide si tocarlo; tú NO navegas). Destinos válidos para este rol:
${listaDestinos}
No llames a \`irA\` si la duda es conceptual o si el destino no está en la lista.

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
- Idioma y tema claro/oscuro: la píldora flotante arriba a la derecha, o "Mi perfil → Preferencias".${bloqueFaq}`;
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
    const pantalla = String(req.data?.pantallaActual ?? "").slice(0, 80);
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
    const faq = await leerFaq();

    const destinosValidos = destinosDeRol(rolUsuario);
    const tools = destinosValidos.length
      ? [
          {
            functionDeclarations: [
              {
                name: "irA",
                description:
                  "Ofrece llevar a la persona a una sección de la app. El usuario verá un botón y decide.",
                parameters: {
                  type: "object",
                  properties: {
                    destino: { type: "string", enum: destinosValidos },
                  },
                  required: ["destino"],
                },
              },
            ],
          },
        ]
      : undefined;

    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: systemPrompt(idioma, rolUsuario, pantalla, faq) }] },
      contents: mensajes.map((m) => ({ role: m.rol, parts: [{ text: m.texto }] })),
      generationConfig: { temperature: 0.3, topP: 0.9, maxOutputTokens: 800 },
    };
    if (tools) {
      body.tools = tools;
      body.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
    }

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
    const parts: any[] = json?.candidates?.[0]?.content?.parts ?? [];
    const texto = parts
      .map((p) => p?.text ?? "")
      .join("")
      .trim();

    // Tool call `irA` → acción de navegación para el cliente (una sola).
    let accion: { tipo: "irA"; destino: string } | null = null;
    for (const p of parts) {
      const fc = p?.functionCall;
      if (fc?.name === "irA" && typeof fc?.args?.destino === "string") {
        const d = fc.args.destino;
        if (destinosValidos.includes(d)) {
          accion = { tipo: "irA", destino: d };
          break;
        }
      }
    }

    if (!texto && !accion) {
      const motivo = json?.promptFeedback?.blockReason ?? json?.candidates?.[0]?.finishReason;
      logger.warn("chatbotGradly: respuesta vacía de Gemini", { motivo });
      return {
        respuesta:
          idioma === "en"
            ? "I couldn't produce an answer for that. Try rephrasing, or open \"My profile → Help → Send a message to the team\"."
            : "No pude responder eso. Prueba a reformularlo, o abre \"Mi perfil → Ayuda → Enviar un mensaje al equipo\".",
        accion: null,
      };
    }

    // Si solo vino la acción (sin texto), sintetiza una frase corta.
    const respuesta =
      texto ||
      (idioma === "en"
        ? `Sure — I can take you to "${DESTINOS[accion!.destino]?.label ?? ""}".`
        : `Claro, te puedo llevar a "${DESTINOS[accion!.destino]?.label ?? ""}".`);

    return { respuesta, accion };
  },
);
