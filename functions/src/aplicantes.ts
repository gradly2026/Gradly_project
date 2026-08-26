/**
 * Cloud Functions — DESGLOSE DE POSTULANTES POR CARRERA.
 *
 * POR QUÉ EXISTE:
 * Al estudiante le sirve saber contra cuánta gente compite antes de gastar una
 * postulación. Pero las reglas de Firestore le dejan leer ÚNICAMENTE su propia
 * aplicación (`aplicaciones`: `resource.data.estudiante_id == request.auth.uid`),
 * y eso es a propósito: la lista de postulantes con nombre y apellido es la
 * lista de sus competidores por un puesto, y abrirla sería una fuga de datos
 * personales, no una mejora de producto. La salida es un AGREGADO: cuántos, no
 * quiénes.
 *
 * QUÉ MANTIENE Y QUÉ NO:
 * El TOTAL ya existía antes de este archivo. `aplicantes_count` lo inicializa
 * el dashboard de empresa al publicar la vacante y lo incrementa el propio
 * cliente en `crearAplicacion` (pasantiaService.ts), con permiso explícito en
 * las reglas. Este archivo NO lo toca en los triggers: hacerlo lo contaría dos
 * veces. Lo único que faltaba, y lo único que se agrega aquí, es el desglose:
 *   · `aplicantes_por_carrera` → { "Contaduría Pública": 5, ... }
 * Con eso el cliente arma "12 postulantes · 5 de tu misma carrera" sin leer un
 * solo documento ajeno.
 *
 * POR QUÉ EN EL SERVIDOR:
 * el mapa no se puede dejar en manos del cliente. Las reglas pueden autorizar
 * la escritura de un campo, pero no validar razonablemente el CONTENIDO de un
 * mapa de claves libres: una app modificada podría escribir
 * `{"Ingeniería": 9999}` y fabricar una sensación de competencia falsa. El
 * Admin SDK se salta las reglas y es el único que escribe este campo.
 *
 * La carrera se lee del perfil del estudiante en vez de exigir que el cliente
 * la mande dentro de la aplicación: así funciona igual para las dos vías de
 * postulación (`aplicarAVacante` no guarda la carrera en el documento,
 * `aplicarAPasantiaIndependiente` sí) y para las aplicaciones ya existentes.
 *
 * DESPUÉS DE DESPLEGAR hay que llamar UNA VEZ a `backfillAplicantesVacantes`
 * desde una cuenta admin: ninguna vacante tiene todavía el mapa, y el cliente
 * está escrito para omitir el fragmento "N de tu carrera" mientras no exista.
 */
import { onDocumentCreated, onDocumentDeleted } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (admin.apps.length === 0) admin.initializeApp();

const REGION = "us-central1";
const db = admin.firestore();

/** Etiqueta con la que se agrupa a quien no tiene carrera declarada. */
const SIN_CARRERA = "__sin_carrera__";

/** Carrera del estudiante, leída de su perfil. "" si no se puede determinar. */
async function carreraDe(estudianteId: string): Promise<string> {
  if (!estudianteId) return "";
  try {
    const snap = await db.doc(`perfiles_estudiantes/${estudianteId}`).get();
    return String(snap.data()?.carrera ?? "").trim();
  } catch {
    return "";
  }
}

/**
 * Suma `delta` (+1 o -1) al contador de esa carrera dentro del mapa.
 *
 * Usa FieldValue.increment, que es ATÓMICO del lado del servidor: si dos
 * estudiantes de la misma carrera aplican en el mismo instante, los dos
 * incrementos se aplican — no hay "leer → sumar 1 → escribir" que pueda
 * pisarse entre sí.
 *
 * Va con `set(..., { merge: true })` y no con `update` porque en una vacante
 * que todavía no tiene el mapa, `update` sobre una ruta anidada inexistente
 * falla. El nombre de la carrera se pasa dentro del OBJETO y no como ruta de
 * campo en texto: en una ruta, "Ing. en Sistemas" se leería como campos
 * anidados por cada punto.
 */
async function ajustarDesglose(vacanteId: string, carrera: string, delta: 1 | -1) {
  if (!vacanteId) return;
  const clave = carrera || SIN_CARRERA;
  try {
    await db.doc(`vacantes/${vacanteId}`).set(
      { aplicantes_por_carrera: { [clave]: admin.firestore.FieldValue.increment(delta) } },
      { merge: true },
    );
  } catch (e) {
    // La vacante pudo eliminarse antes que su aplicación. No es un fallo que
    // deba reintentarse: se registra y se sigue.
    console.warn(`ajustarDesglose: no se pudo actualizar vacantes/${vacanteId}`, e);
  }
}

/** Nueva postulación → +1 en el desglose de su carrera. */
export const contarAplicanteNuevo = onDocumentCreated(
  { document: "aplicaciones/{aplicacionId}", region: REGION },
  async (event) => {
    const app = event.data?.data();
    if (!app) return;
    const vacanteId = String(app.vacante_id ?? "");
    if (!vacanteId) return;
    await ajustarDesglose(vacanteId, await carreraDe(String(app.estudiante_id ?? "")), 1);
  },
);

/**
 * Postulación borrada → -1 en el desglose. Hoy solo un admin puede borrar
 * aplicaciones.
 *
 * Ojo con una asimetría heredada: `aplicantes_count` (el total, escrito por el
 * cliente) NUNCA se decrementa, ni antes ni ahora — nadie lo bajaba al borrar.
 * Así que tras una limpieza administrativa el total puede quedar por encima de
 * la suma del mapa. `backfillAplicantesVacantes` reconcilia los dos.
 */
export const descontarAplicanteBorrado = onDocumentDeleted(
  { document: "aplicaciones/{aplicacionId}", region: REGION },
  async (event) => {
    const app = event.data?.data();
    if (!app) return;
    const vacanteId = String(app.vacante_id ?? "");
    if (!vacanteId) return;
    await ajustarDesglose(vacanteId, await carreraDe(String(app.estudiante_id ?? "")), -1);
  },
);

/**
 * Recuenta desde cero, para TODAS las vacantes, el desglose por carrera Y el
 * total, a partir de la colección `aplicaciones` completa.
 *
 * Reescribe también `aplicantes_count` a propósito: es la única oportunidad de
 * corregir el desfase que deja el borrado administrativo descrito arriba. El
 * valor recalculado sale de la misma fuente que el incremento del cliente
 * (un documento de `aplicaciones` = un postulante), así que lo que la empresa
 * y el panel admin ya muestran no cambia de significado.
 */
export const backfillAplicantesVacantes = onCall(
  { region: REGION, timeoutSeconds: 300, memory: "512MiB" },
  async (req) => {
    try {
      // Mismo control de acceso que el resto de backfills del panel admin.
      const uid = req.auth?.uid;
      if (!uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
      const actorSnap = await db.doc(`usuarios/${uid}`).get();
      if (actorSnap.data()?.rol !== "admin") {
        throw new HttpsError("permission-denied", "No tienes permisos de administrador.");
      }

      // 1) Carrera de cada estudiante, en un solo barrido (evita una lectura
      //    por aplicación, que en una base grande serían miles).
      const carreras = new Map<string, string>();
      const perfiles = await db.collection("perfiles_estudiantes").get();
      perfiles.docs.forEach((d) => {
        carreras.set(d.id, String(d.data()?.carrera ?? "").trim());
      });

      // 2) Conteo en memoria de todas las aplicaciones.
      const totales = new Map<string, number>();
      const porCarrera = new Map<string, Map<string, number>>();
      const apps = await db.collection("aplicaciones").get();
      apps.docs.forEach((d) => {
        const a = d.data() ?? {};
        const vacanteId = String(a.vacante_id ?? "");
        if (!vacanteId) return;
        const carrera = carreras.get(String(a.estudiante_id ?? "")) || SIN_CARRERA;
        totales.set(vacanteId, (totales.get(vacanteId) ?? 0) + 1);
        if (!porCarrera.has(vacanteId)) porCarrera.set(vacanteId, new Map());
        const m = porCarrera.get(vacanteId)!;
        m.set(carrera, (m.get(carrera) ?? 0) + 1);
      });

      // 3) Se escriben TODAS las vacantes, incluidas las de cero postulantes:
      //    sin eso, una vacante sin aplicaciones se quedaría sin el mapa y el
      //    cliente no podría distinguirla de una aún sin recontar.
      const vacantes = await db.collection("vacantes").get();
      let escritas = 0;
      let lote = db.batch();
      let enLote = 0;
      for (const v of vacantes.docs) {
        const mapa: Record<string, number> = {};
        (porCarrera.get(v.id) ?? new Map()).forEach((n, c) => { mapa[c] = n; });
        lote.set(
          v.ref,
          { aplicantes_count: totales.get(v.id) ?? 0, aplicantes_por_carrera: mapa },
          { merge: true },
        );
        escritas++;
        // Un batch de Firestore admite 500 operaciones como máximo.
        if (++enLote === 450) { await lote.commit(); lote = db.batch(); enLote = 0; }
      }
      if (enLote > 0) await lote.commit();

      return { ok: true, vacantes: escritas, aplicaciones: apps.size };
    } catch (error: any) {
      console.error("backfillAplicantesVacantes failed:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        `Error interno en backfillAplicantesVacantes: ${String(error?.message ?? error)}`,
      );
    }
  },
);
