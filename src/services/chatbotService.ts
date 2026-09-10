// "Asistente Gradly" — bot de ayuda (fase 1: solo Q&A por texto).
// Backend: functions/src/chatbot.ts (callable `chatbotGradly`, llama a Gemini
// con la API key como secreto). Conversación efímera: vive en el estado del
// componente, no se persiste.
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../config/firebaseConfig";

const functions = getFunctions(app, "us-central1");

export interface MensajeAsistente {
  rol: "user" | "model";
  texto: string;
}

const _chatbotGradly = httpsCallable<
  { mensajes: MensajeAsistente[]; idioma: "es" | "en"; rolUsuario: string },
  { respuesta: string }
>(functions, "chatbotGradly");

/**
 * Envía el historial (turnos user/model) y devuelve la respuesta del asistente.
 * El último mensaje del array debe ser del usuario. Lanza un `Error` con un
 * texto presentable si algo falla (sin sesión, tope diario, Gemini caído…).
 */
export async function preguntarAlAsistente(
  mensajes: MensajeAsistente[],
  idioma: "es" | "en",
  rolUsuario: string,
): Promise<string> {
  try {
    const res = await _chatbotGradly({
      mensajes: mensajes.slice(-20),
      idioma,
      rolUsuario: rolUsuario || "",
    });
    return String(res.data?.respuesta ?? "").trim();
  } catch (e: any) {
    const code = String(e?.code ?? "");
    if (code.includes("resource-exhausted")) {
      throw new Error(
        idioma === "en"
          ? "You've reached today's assistant limit. Try again tomorrow."
          : "Llegaste al límite de consultas del asistente por hoy. Vuelve mañana.",
      );
    }
    if (code.includes("unauthenticated")) {
      throw new Error(
        idioma === "en" ? "Sign in to use the assistant." : "Inicia sesión para usar el asistente.",
      );
    }
    throw new Error(
      idioma === "en"
        ? "The assistant isn't available right now. Please try again."
        : "El asistente no está disponible ahora. Intenta de nuevo.",
    );
  }
}
