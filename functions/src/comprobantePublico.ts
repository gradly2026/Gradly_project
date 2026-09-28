/**
 * comprobantePublico.ts — espejo público del comprobante de finalización de
 * una pasantía por cupo (Fase 2 de la mejora al comprobante: código QR +
 * verificación pública).
 *
 * POR QUÉ EXISTE: el QR embebido en el PDF (comprobantePdf.ts) lleva a
 * `app/verificar.tsx`, una página SIN sesión (cualquiera puede abrirla, por
 * ejemplo un futuro empleador escaneando el documento). `comprobantes_pasantia`
 * exige sesión y pertenencia para leerse — y una regla de Firestore no puede
 * ocultar un campo dentro de un doc que ya es público por otro lado, así que la
 * única forma correcta de exponer un resumen es un documento APARTE con solo
 * los campos seguros (mismo principio que `perfiles_publicos_estudiantes`,
 * ver perfilesPublicos.ts). A diferencia de esa colección (que exige sesión
 * para leer), `comprobantes_publicos` es genuinamente pública
 * (`allow read: if true`, como `calificaciones_plataforma`) porque quien
 * escanea el QR no tiene cuenta en Gradly.
 *
 * CAMPOS EXPUESTOS (lista blanca, ver CAMPOS_PUBLICOS_COMPROBANTE): nombre del
 * estudiante, carrera, universidad, empresa, puesto, período, horas y estado
 * de validación. Deliberadamente fuera: cualquier *Id, area, supervisor,
 * notaEmpresa, notaUniversidad, archivoUrl, origen, horario.
 *
 * SINCRONIZACIÓN: un solo trigger, `sincronizarComprobantePublico`
 * (`onDocumentWritten`), cubre TODOS los caminos que tocan
 * `comprobantes_pasantia` — la creación por `enviarComprobantePdf` (Admin SDK)
 * y la transición 'enviado'→'validado' que hoy hace `validarComprobante()`
 * 100% del lado del CLIENTE (comprobanteService.ts, sin pasar por ninguna
 * Cloud Function) — porque un trigger de Firestore siempre recibe el
 * documento COMPLETO ya fusionado (`event.data.after.data()`), no un diff. No
 * hizo falta tocar ni `enviarComprobantePdf` ni `validarComprobante()` para
 * nada de esto.
 */
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

const REGION = "us-central1";

export const COL_COMPROBANTES_PUBLICOS = "comprobantes_publicos";

/** Lista blanca: lo único que se copia de `comprobantes_pasantia`. Nunca
 *  agregues aquí ningún *Id, area, supervisor, notaEmpresa, notaUniversidad,
 *  archivoUrl, origen ni horario. */
export const CAMPOS_PUBLICOS_COMPROBANTE = [
  "estudianteNombre",
  "carrera",
  "universidadNombre",
  "empresaNombre",
  "vacanteTitulo",
  "fechaInicio",
  "fechaFin",
  "horasCumplidas",
  "estado",
  "fechaEmision",
] as const;

/** Espejo público a partir del documento completo de `comprobantes_pasantia`.
 *  Copia solo la lista blanca (y únicamente valores que no sean
 *  `undefined`/`null`). */
export function construirComprobantePublico(c: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const campo of CAMPOS_PUBLICOS_COMPROBANTE) {
    const v = c[campo];
    if (v === undefined || v === null) continue;
    out[campo] = v;
  }
  return out;
}

/** Mantiene `comprobantes_publicos/{asignacionId}` en sincronía con
 *  `comprobantes_pasantia/{asignacionId}`: se reescribe por completo en cada
 *  create/update, y se borra si el original se borra. Idempotente (siempre es
 *  función pura de `event.data.after`) — una redelivery de Cloud Functions v2
 *  produce el mismo resultado salvo `actualizado_at`, que de todos modos debe
 *  avanzar en cada escritura legítima. */
export const sincronizarComprobantePublico = onDocumentWritten(
  { document: "comprobantes_pasantia/{asignacionId}", region: REGION },
  async (event) => {
    const asignacionId = event.params.asignacionId;
    const after = event.data?.after;
    const destino = db.collection(COL_COMPROBANTES_PUBLICOS).doc(asignacionId);

    if (!after?.exists) {
      try {
        await destino.delete();
      } catch (e) {
        logger.warn("No se pudo borrar el espejo público del comprobante", { asignacionId, e });
      }
      return;
    }

    try {
      await destino.set({
        ...construirComprobantePublico(after.data() ?? {}),
        actualizado_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      logger.warn("No se pudo espejar el comprobante público", { asignacionId, e });
    }
  },
);

/**
 * Backfill de una sola vez: recorre TODA `comprobantes_pasantia` y crea/
 * actualiza el espejo público de cada uno, para que los comprobantes ya
 * enviados antes de esta fase también queden verificables (su PDF original no
 * tiene QR, pero el enlace de verificación armado a mano sí funciona). Mismo
 * patrón de control de acceso y de respuesta que `backfillAplicantesVacantes`
 * (aplicantes.ts). Seguro de repetir.
 */
export const backfillComprobantesPublicos = onCall(
  { region: REGION, timeoutSeconds: 300, memory: "512MiB" },
  async (req) => {
    try {
      const uid = req.auth?.uid;
      if (!uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
      const actorSnap = await db.doc(`usuarios/${uid}`).get();
      if (actorSnap.data()?.rol !== "admin") {
        throw new HttpsError("permission-denied", "No tienes permisos de administrador.");
      }

      const snap = await db.collection("comprobantes_pasantia").get();
      let lote = db.batch();
      let enLote = 0;
      let procesados = 0;
      for (const d of snap.docs) {
        lote.set(db.collection(COL_COMPROBANTES_PUBLICOS).doc(d.id), {
          ...construirComprobantePublico(d.data() ?? {}),
          actualizado_at: admin.firestore.FieldValue.serverTimestamp(),
        });
        procesados++;
        if (++enLote === 450) { await lote.commit(); lote = db.batch(); enLote = 0; }
      }
      if (enLote > 0) await lote.commit();

      return { ok: true, procesados };
    } catch (error: any) {
      logger.error("backfillComprobantesPublicos failed:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        `Error interno en backfillComprobantesPublicos: ${String(error?.message ?? error)}`,
      );
    }
  },
);
