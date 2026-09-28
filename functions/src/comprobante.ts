/**
 * Cloud Function — envío del comprobante de finalización de una pasantía por
 * CUPO como un PDF real (Fase 1 de la mejora al comprobante; ver
 * comprobantePdf.ts para el dibujado). Reemplaza, del lado del cliente, al
 * `enviarComprobante()` de src/services/comprobanteService.ts (que escribía
 * directo a Firestore desde el cliente) — esa función queda intacta como
 * camino de emergencia, sin usarse ya desde ComprobanteEmpresaModal.tsx.
 *
 * Por qué una Cloud Function y no seguir escribiendo desde el cliente: el PDF
 * generado necesita subirse a Storage con el Admin SDK (para fijar su propio
 * token de descarga — ver más abajo) y conviene reconstruir del lado del
 * servidor los datos de identidad, en vez de confiar ciegamente en lo que
 * mande el cliente.
 *
 * QUÉ SE RECONSTRUYE SIEMPRE DESDE EL SERVIDOR (nunca del cliente): identidad
 * (estudianteId/empresaId/universidadId) y datos denormalizados (nombres,
 * vacanteTitulo, carrera, fechaInicio, horario) — se leen de
 * `asignaciones_cupo/{asignacionId}` con Admin SDK. Esto cierra un hueco que
 * ya existía: la regla de Firestore de `comprobantes_pasantia` solo cruza
 * `empresaId` contra la asignación, no `estudianteId`/`universidadId`.
 *
 * QUÉ SE ACEPTA DEL CLIENTE CON VALIDACIÓN DE RANGO: `fechaFin` y
 * `horasCumplidas` los calcula hoy `progresoPorMeta` (src/utils/horasPasantia.ts,
 * una máquina de estados de asistencia bastante grande) — portarla a functions/
 * para recomputarla desde cero es demasiado para esta fase, así que se
 * aceptan del cliente pero acotados a un rango razonable (fecha no anterior al
 * inicio, no más allá de "hoy + 1 día"; horas positivas y no absurdas).
 * `area`/`supervisor`/`notaEmpresa` son contenido cosmético de la empresa, sin
 * validación de integridad — solo trim + tope de longitud + saneo de
 * caracteres (ver `sanearTextoPdf`).
 *
 * DETALLE TÉCNICO: el Admin SDK no tiene equivalente de `getDownloadURL()` del
 * cliente — hay que fijar un `firebaseStorageDownloadTokens` propio y construir
 * la URL a mano; sin esto, `Linking.openURL` no podría abrir el archivo aunque
 * las Storage rules lo permitan (las download URLs de Firebase funcionan por
 * posesión del token, no por sesión).
 *
 * Cuando la empresa adjunta su propio PDF escaneado (`archivoUrlPropio`, el
 * caso `origen:'pdf'`, sin cambios de fondo en esta fase) se valida que la URL
 * apunte al propio bucket/path antes de guardarla — al mover la escritura del
 * documento a una Cloud Function, esa URL pasa a ser un parámetro que un
 * cliente modificado podría falsificar.
 *
 * FASE 2 (QR): el PDF generado automáticamente incluye un código QR que lleva
 * a `${URL_BASE_VERIFICACION}?id={asignacionId}` (app/verificar.tsx, página
 * pública sin sesión). Esta función no escribe la colección espejo pública
 * (`comprobantes_publicos`) directamente — eso lo hace un trigger aparte,
 * `sincronizarComprobantePublico` (comprobantePublico.ts), que reacciona a
 * CUALQUIER escritura de `comprobantes_pasantia` (esta function o la
 * `validarComprobante()` del cliente), así que no hace falta tocar esta
 * function cuando cambie el estado a 'validado'.
 */
import * as crypto from "crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import {
  construirComprobantePdfBytes,
  type DatosConstanciaPdf,
  type ExtraConstanciaPdf,
} from "./comprobantePdf";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

const REGION = "us-central1";
/** El Salvador es UTC-6 fijo, sin horario de verano (igual que asistencia.ts). */
const OFFSET_MS = -6 * 60 * 60 * 1000;
const MAX_TEXTO_LIBRE = 400;
const MAX_HORAS = 5000;
/** Dominio de producción, literal (mismo patrón que `URL_LOGIN` en correo.ts). */
const URL_BASE_VERIFICACION = "https://gradly.website/verificar";

function ahoraEnSV(): Date {
  return new Date(Date.now() + OFFSET_MS);
}
function hoyISO(): string {
  const d = ahoraEnSV();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function esFechaISOValida(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}
/** ISO `yyyy-mm-dd` más N días (aritmética UTC pura, sin zona horaria). */
function sumarDiasISO(iso: string, dias: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + dias * 24 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function limitarTexto(s: unknown, max: number): string {
  return String(s ?? "").trim().slice(0, max);
}

/** Notificación de campanita (mismo formato que notificationService del cliente). */
async function notificar(
  destinatario_id: string, titulo: string, mensaje: string, tipo: string, link: string,
): Promise<void> {
  if (!destinatario_id) return;
  try {
    const ahora = admin.firestore.FieldValue.serverTimestamp();
    await db.collection("notificaciones_app").add({
      destinatario_id, titulo, mensaje, tipo,
      referencia_id: link, link_accion: link, leido: false, createdAt: ahora, fecha: ahora,
    });
  } catch (e) {
    logger.warn("No se pudo notificar", { destinatario_id, e });
  }
}

export const enviarComprobantePdf = onCall({ region: REGION }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sesión requerida.");

  const asignacionId = String(req.data?.asignacionId ?? "").trim();
  if (!asignacionId) throw new HttpsError("invalid-argument", "Datos inválidos.");

  const asigSnap = await db.collection("asignaciones_cupo").doc(asignacionId).get();
  if (!asigSnap.exists) throw new HttpsError("not-found", "La pasantía ya no existe.");
  const a = asigSnap.data() as any;
  if (a.empresaId !== uid) throw new HttpsError("permission-denied", "Esta pasantía no es de tu empresa.");
  if (a.finalizada !== true) throw new HttpsError("failed-precondition", "Esta pasantía todavía no ha culminado.");
  if (!a.estudianteId || !a.universidadId) {
    throw new HttpsError("failed-precondition", "Faltan datos de la pasantía.");
  }

  const fechaInicio = String(a.fechaPresentacion ?? "");
  let fechaFin = String(req.data?.fechaFin ?? "").trim();
  if (!esFechaISOValida(fechaFin)) fechaFin = fechaInicio || hoyISO();
  if (fechaInicio && fechaFin < fechaInicio) fechaFin = fechaInicio;
  const limiteFuturo = sumarDiasISO(hoyISO(), 1);
  if (fechaFin > limiteFuturo) fechaFin = limiteFuturo;

  let horasCumplidas = Math.round(Number(req.data?.horasCumplidas));
  if (!Number.isFinite(horasCumplidas) || horasCumplidas < 0) horasCumplidas = 0;
  if (horasCumplidas > MAX_HORAS) horasCumplidas = MAX_HORAS;

  const area = limitarTexto(req.data?.area, MAX_TEXTO_LIBRE);
  const supervisor = limitarTexto(req.data?.supervisor, MAX_TEXTO_LIBRE);
  const notaEmpresa = limitarTexto(req.data?.notaEmpresa, MAX_TEXTO_LIBRE);
  const fechaEmisionRaw = String(req.data?.fechaEmisionISO ?? "");
  const fechaEmisionISO = esFechaISOValida(fechaEmisionRaw) ? fechaEmisionRaw : hoyISO();

  let universidadNombre = "";
  try {
    const uSnap = await db.collection("perfiles_universidades").doc(String(a.universidadId)).get();
    universidadNombre = (uSnap.data()?.nombre_universidad as string) ?? "";
  } catch { /* no crítico */ }

  const bucket = admin.storage().bucket();
  const archivoUrlPropio = String(req.data?.archivoUrlPropio ?? "").trim();
  let archivoUrl: string;
  let origen: "auto" | "pdf";

  if (archivoUrlPropio) {
    const prefijoEsperado =
      `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
      encodeURIComponent(`constancias_cupo/${asignacionId}/`);
    if (!archivoUrlPropio.startsWith(prefijoEsperado)) {
      throw new HttpsError("invalid-argument", "El archivo adjunto no es válido.");
    }
    archivoUrl = archivoUrlPropio;
    origen = "pdf";
  } else {
    const datosPdf: DatosConstanciaPdf = {
      estudianteNombre: String(a.estudianteNombre ?? ""),
      empresaNombre: String(a.empresaNombre ?? ""),
      universidadNombre,
      vacanteTitulo: String(a.vacanteTitulo ?? ""),
      carrera: String(a.carrera ?? ""),
      fechaInicio,
      fechaFin,
      horasCumplidas,
      horario: a.horario ?? null,
    };
    const extraPdf: ExtraConstanciaPdf = {
      area, supervisor, nota: notaEmpresa, fechaEmisionISO,
      urlVerificacion: `${URL_BASE_VERIFICACION}?id=${asignacionId}`,
    };

    let bytes: Uint8Array;
    try {
      bytes = await construirComprobantePdfBytes(datosPdf, extraPdf);
    } catch (e) {
      logger.error("No se pudo generar el PDF del comprobante", e);
      throw new HttpsError("internal", "No se pudo generar el documento. Intenta de nuevo.");
    }

    const path = `constancias_cupo/${asignacionId}/constancia.pdf`;
    const token = crypto.randomUUID();
    await bucket.file(path).save(Buffer.from(bytes), {
      metadata: {
        contentType: "application/pdf",
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });
    archivoUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
    origen = "auto";
  }

  await db.collection("comprobantes_pasantia").doc(asignacionId).set(
    {
      asignacionId,
      estudianteId: a.estudianteId,
      estudianteNombre: a.estudianteNombre ?? "",
      empresaId: a.empresaId,
      empresaNombre: a.empresaNombre ?? "",
      universidadId: a.universidadId,
      universidadNombre,
      vacanteId: a.vacanteId ?? "",
      vacanteTitulo: a.vacanteTitulo ?? "",
      carrera: a.carrera ?? "",
      fechaInicio,
      fechaFin,
      horasCumplidas,
      horario: a.horario ?? null,
      estado: "enviado",
      origen,
      archivoUrl,
      area,
      supervisor,
      notaEmpresa,
      fechaEmision: fechaEmisionISO,
      enviadoAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const quien = a.estudianteNombre || "un estudiante";
  const cual = a.vacanteTitulo || "su pasantía";
  await notificar(
    String(a.universidadId), "Comprobante de pasantía recibido",
    `${a.empresaNombre || "La empresa"} envió el comprobante de finalización de ${quien} ("${cual}"). Revísalo y valídalo.`,
    "warning", `certificarPasante:${asignacionId}`,
  );
  await notificar(
    String(a.estudianteId), "Comprobante enviado",
    "La empresa envió tu comprobante de finalización a tu universidad.",
    "info", `comprobante:${asignacionId}`,
  );

  return { ok: true, archivoUrl, origen };
});
