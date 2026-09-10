// "Asistente Gradly" — bot de ayuda.
//   · Fase 1: Q&A por texto.
//   · Fase 2: puede devolver una `accion` de navegación ({tipo:'irA', destino})
//     que el cliente ofrece como botón "Ir a …". Ver src/utils/asistenteDestinos.ts.
//   · Fase 3: se le manda `pantallaActual` para afinar la respuesta.
// Backend: functions/src/chatbot.ts (callable `chatbotGradly`). Conversación
// efímera: vive en el estado del componente, no se persiste.
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../config/firebaseConfig";

const functions = getFunctions(app, "us-central1");

export interface MensajeAsistente {
  rol: "user" | "model";
  texto: string;
}

export interface AccionAsistente {
  tipo: "irA";
  destino: string;
}

export interface RespuestaAsistente {
  respuesta: string;
  accion: AccionAsistente | null;
}

const _chatbotGradly = httpsCallable<
  {
    mensajes: MensajeAsistente[];
    idioma: "es" | "en";
    rolUsuario: string;
    pantallaActual: string;
  },
  { respuesta: string; accion?: AccionAsistente | null }
>(functions, "chatbotGradly");

/**
 * Envía el historial (turnos user/model) + la pantalla actual y devuelve la
 * respuesta del asistente y, si aplica, una acción de navegación. El último
 * mensaje del array debe ser del usuario. Lanza un `Error` con texto
 * presentable si algo falla.
 */
export async function preguntarAlAsistente(
  mensajes: MensajeAsistente[],
  idioma: "es" | "en",
  rolUsuario: string,
  pantallaActual = "",
): Promise<RespuestaAsistente> {
  try {
    const res = await _chatbotGradly({
      mensajes: mensajes.slice(-20),
      idioma,
      rolUsuario: rolUsuario || "",
      pantallaActual: pantallaActual.slice(0, 80),
    });
    return {
      respuesta: String(res.data?.respuesta ?? "").trim(),
      accion: res.data?.accion ?? null,
    };
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
