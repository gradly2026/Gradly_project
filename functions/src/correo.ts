/**
 * Correos transaccionales de Gradly que NO son el código de acceso (ese vive en
 * otp.ts y no se toca). Hoy: el aviso a una EMPRESA cuando un administrador
 * aprueba o rechaza su cuenta (Fase 4 de la cola de aprobación de empresas —
 * ver setUserApproval en admin.ts).
 *
 * Usa el mismo Resend y el mismo secret `RESEND_API_KEY` que otp.ts. Declarar el
 * secret aquí otra vez es seguro: firebase-functions registra los params por
 * nombre y reemplaza el duplicado (params/index.js). Quien use enviarCorreo()
 * debe listar RESEND_API_KEY en el `secrets` de su función.
 */
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { Resend } from "resend";

export const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

const REMITENTE = "Gradly <notificaciones@send.gradly.website>";
const URL_LOGIN = "https://gradly.website/auth/iniciosesion";
// soporte@gradly.app (el que sale en perfil_ayuda_msg de src/locales) no existe
// como buzón: el usuario pidió usar este, que sí es real y lo lee él.
const CORREO_SOPORTE = "gradlycreaj@gmail.com";

/** El nombre de la empresa lo escribe el usuario: se escapa antes de ir al HTML. */
export function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface ContenidoCorreo {
  asunto: string;
  html: string;
  texto: string;
}

const envoltorio = (contenido: string): string => `
  <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0f172a">
    ${contenido}
    <p style="margin:24px 0 0;color:#94a3b8;font-size:12px">Gradly</p>
  </div>
`;

export function correoCuentaAprobada(nombreEmpresa: string): ContenidoCorreo {
  const nombre = nombreEmpresa.trim() || "tu empresa";
  return {
    asunto: "Tu cuenta de empresa en Gradly ya está activa",
    html: envoltorio(`
    <h2 style="margin:0 0 8px">Cuenta aprobada</h2>
    <p style="margin:0 0 16px;color:#475569">Revisamos los datos y los documentos de <strong>${escaparHtml(nombre)}</strong> y tu cuenta de empresa ya está activa.</p>
    <p style="margin:0 0 24px;color:#475569">Ya puedes iniciar sesión con el correo y la contraseña con los que te registraste, publicar pasantías y conectar con estudiantes.</p>
    <p style="margin:0 0 24px"><a href="${URL_LOGIN}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:10px">Iniciar sesión</a></p>
    <p style="margin:0;color:#64748b;font-size:14px">Si no creaste esta cuenta, escríbenos a ${CORREO_SOPORTE}.</p>
  `),
    texto:
      `Cuenta aprobada\n\nRevisamos los datos y los documentos de ${nombre} y tu cuenta de empresa ya está activa. ` +
      `Ya puedes iniciar sesión con el correo y la contraseña con los que te registraste, publicar pasantías y conectar con estudiantes.\n\n` +
      `Iniciar sesión: ${URL_LOGIN}\n\nSi no creaste esta cuenta, escríbenos a ${CORREO_SOPORTE}.`,
  };
}

// A propósito NO lleva el motivo: la "nota de revisión" que escribe el admin es
// interna (así la llama el panel) y no debe salir en un correo sin que nadie la
// haya redactado para eso.
export function correoCuentaRechazada(nombreEmpresa: string): ContenidoCorreo {
  const nombre = nombreEmpresa.trim() || "tu empresa";
  return {
    asunto: "Sobre el registro de tu empresa en Gradly",
    html: envoltorio(`
    <h2 style="margin:0 0 8px">No pudimos aprobar tu cuenta</h2>
    <p style="margin:0 0 16px;color:#475569">Revisamos los datos y los documentos que enviaste para <strong>${escaparHtml(nombre)}</strong> y, por ahora, no pudimos verificarlos, así que la cuenta no fue activada.</p>
    <p style="margin:0;color:#475569">Si crees que es un error, o quieres enviarnos información adicional (por ejemplo, fotos más claras del NIT o del documento del representante), escríbenos a <strong>${CORREO_SOPORTE}</strong> con el nombre de tu empresa y el correo con el que te registraste, y lo revisamos de nuevo.</p>
  `),
    texto:
      `No pudimos aprobar tu cuenta\n\nRevisamos los datos y los documentos que enviaste para ${nombre} y, por ahora, no pudimos verificarlos, así que la cuenta no fue activada.\n\n` +
      `Si crees que es un error, o quieres enviarnos información adicional (por ejemplo, fotos más claras del NIT o del documento del representante), ` +
      `escríbenos a ${CORREO_SOPORTE} con el nombre de tu empresa y el correo con el que te registraste, y lo revisamos de nuevo.`,
  };
}

/**
 * Envía un correo y dice si salió. NUNCA lanza: quien la llama ya hizo su
 * trabajo (p. ej. aprobar la cuenta) y no debe deshacerlo ni fallar porque el
 * aviso no se pudo mandar. El SDK de Resend no lanza cuando el fallo es del
 * lado de ellos (dominio sin verificar, límite…): devuelve `{ error }`, por eso
 * también se revisa.
 */
export async function enviarCorreo(
  para: string,
  contenido: ContenidoCorreo,
): Promise<boolean> {
  try {
    const resend = new Resend(RESEND_API_KEY.value());
    const { error } = await resend.emails.send({
      from: REMITENTE,
      to: para,
      subject: contenido.asunto,
      html: contenido.html,
      text: contenido.texto,
    });
    if (error) {
      logger.error("Resend rechazó el envío del correo", { para, asunto: contenido.asunto, error });
      return false;
    }
    return true;
  } catch (error) {
    logger.error("No se pudo enviar el correo", { para, asunto: contenido.asunto, error });
    return false;
  }
}
