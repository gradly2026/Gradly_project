/**
 * Cloud Function programada — libera los cupos reservados que nadie tomó.
 *
 * Cuando una universidad reserva N cupos, los estudiantes tienen 48 h para
 * elegirlos (`fechaLimiteSeleccion`). Sin este barrido, los cupos no tomados
 * quedarían apartados para siempre en `vacantes.cupos_reclamados`: la empresa
 * nunca recuperaría esas plazas y otras universidades no podrían pedirlas.
 *
 * Corre en el servidor a propósito: si dependiera de que alguien abra la app,
 * una vacante podría quedar bloqueada indefinidamente durante un fin de semana.
 *
 * Es IDEMPOTENTE: marca `barrido: true` y ajusta `cantidad` a lo realmente
 * tomado, así una segunda pasada no vuelve a descontar.
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

if (admin.apps.length === 0) admin.initializeApp();

const REGION = "us-central1";
/** Tope por ejecución: evita agotar el tiempo de la función si hay backlog. */
const MAX_POR_CORRIDA = 200;

type Estado = "pendiente" | "aceptado" | "rechazado" | "liberado";

/** Notificación de campanita (mismo formato que `notificationService` del cliente). */
async function notificar(
  destinatario_id: string,
  titulo: string,
  mensaje: string,
  tipo: string,
  link: string,
): Promise<void> {
  if (!destinatario_id) return;
  const ahora = admin.firestore.FieldValue.serverTimestamp();
  try {
    await admin.firestore().collection("notificaciones_app").add({
      destinatario_id,
      titulo,
      mensaje,
      tipo,
      referencia_id: link,
      link_accion: link,
      leido: false,
      createdAt: ahora,
      fecha: ahora,
    });
  } catch (e) {
    console.warn("No se pudo notificar", destinatario_id, e);
  }
}

/**
 * Libera los cupos sobrantes de UN reclamo vencido.
 * Toda la aritmética va en transacción para no chocar con un estudiante que
 * esté tomando un cupo en ese mismo instante.
 */
async function liberarSobrantes(reclamoId: string): Promise<number> {
  const db = admin.firestore();
  const reclamoRef = db.collection("reclamos_cupos").doc(reclamoId);

  const resultado = await db.runTransaction(async (tx) => {
    const snap = await tx.get(reclamoRef);
    if (!snap.exists) return null;
    const r = snap.data() as any;

    // Puede haber cambiado entre la consulta y la transacción.
    if (r.barrido === true) return null;
    if (r.estado === "rechazado" || r.estado === "liberado") return null;

    const cantidad = Number(r.cantidad) || 0;
    const tomados = Number(r.tomados) || 0;
    const sobrantes = Math.max(0, cantidad - tomados);

    if (sobrantes === 0) {
      // Nada que devolver, pero se marca para no volver a revisarlo.
      tx.update(reclamoRef, { barrido: true });
      return null;
    }

    tx.update(db.collection("vacantes").doc(r.vacanteId), {
      cupos_reclamados: admin.firestore.FieldValue.increment(-sobrantes),
    });
    tx.update(reclamoRef, {
      cantidad: tomados,
      barrido: true,
      // Si nadie tomó nada, el reclamo entero deja de existir a efectos prácticos.
      ...(tomados === 0 ? { estado: "liberado" as Estado } : {}),
      fechaBarrido: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      sobrantes,
      empresaId: r.empresaId as string,
      universidadId: r.universidadId as string,
      vacanteTitulo: (r.vacanteTitulo as string) ?? "",
      universidadNombre: (r.universidadNombre as string) ?? "Una universidad",
    };
  });

  if (!resultado) return 0;

  // La empresa merece saber que sobraron plazas que había apartado.
  await notificar(
    resultado.empresaId,
    "Cupos liberados por vencimiento",
    `${resultado.universidadNombre} no asignó ${resultado.sobrantes} cupo(s) de ` +
      `"${resultado.vacanteTitulo}" dentro del plazo. Ya están disponibles de nuevo.`,
    "info",
    "/dashboard-empresa",
  );
  await notificar(
    resultado.universidadId,
    "Cupos vencidos",
    `Se liberaron ${resultado.sobrantes} cupo(s) de "${resultado.vacanteTitulo}" ` +
      "porque tus estudiantes no los tomaron a tiempo.",
    "warning",
    "/dashboard-universidad",
  );

  return resultado.sobrantes;
}

export const barridoCuposVencidos = onSchedule(
  { schedule: "every 1 hours", region: REGION, timeZone: "America/El_Salvador" },
  async () => {
    const db = admin.firestore();
    const ahora = admin.firestore.Timestamp.now();

    // Una sola desigualdad (`<`) sobre un campo → no requiere índice compuesto.
    // El estado se filtra en memoria a propósito, para no obligar a crear un
    // índice `estado + fechaLimiteSeleccion` en la consola.
    const snap = await db
      .collection("reclamos_cupos")
      .where("fechaLimiteSeleccion", "<", ahora)
      .limit(MAX_POR_CORRIDA)
      .get();

    const candidatos = snap.docs.filter((d) => {
      const r = d.data() as any;
      if (r.barrido === true) return false;
      return r.estado === "pendiente" || r.estado === "aceptado";
    });

    if (candidatos.length === 0) {
      console.log("Barrido de cupos: nada por liberar.");
      return;
    }

    let liberados = 0;
    for (const d of candidatos) {
      try {
        liberados += await liberarSobrantes(d.id);
      } catch (e) {
        // Un reclamo problemático no debe abortar el barrido completo.
        console.error("Error liberando reclamo", d.id, e);
      }
    }

    console.log(
      `Barrido de cupos: ${candidatos.length} reclamo(s) vencido(s), ` +
        `${liberados} cupo(s) devuelto(s) al mercado.`,
    );
  },
);
