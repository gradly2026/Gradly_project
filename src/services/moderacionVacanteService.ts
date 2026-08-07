import { collection, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { db } from "../config/firebaseConfig";

/**
 * Moderación administrativa de vacantes/pasantías (ver `functions/src/admin.ts`
 * `deshabilitarVacanteAdmin` / `eliminarVacanteAdmin`): cuando un admin actúa
 * sobre una publicación, marca `moderacion_notificada:false` en el documento
 * para que la empresa dueña reciba el aviso obligatorio la próxima vez que
 * abra su panel — este servicio detecta esos casos y los marca como vistos.
 */
export type EstadoModeracionVacante = "deshabilitada" | "eliminada";

export interface ModeracionVacantePendiente {
  vacanteId: string;
  titulo: string;
  estado: EstadoModeracionVacante;
  motivo: string;
  moderadoPorEmail: string | null;
}

/** Publicaciones de esta empresa moderadas por un admin y aún no notificadas. */
export async function getModeracionesPendientes(
  empresaId: string,
): Promise<ModeracionVacantePendiente[]> {
  if (!empresaId) return [];
  const snap = await getDocs(
    query(
      collection(db, "vacantes"),
      where("empresa_id", "==", empresaId),
      where("moderacion_notificada", "==", false),
    ),
  );
  return snap.docs
    .map((d) => {
      const data = d.data() as any;
      const estado = data.estado_moderacion;
      if (estado !== "deshabilitada" && estado !== "eliminada") return null;
      return {
        vacanteId: d.id,
        titulo: String(data.titulo ?? "Tu publicación"),
        estado: estado as EstadoModeracionVacante,
        motivo: String(data.motivo_moderacion ?? ""),
        moderadoPorEmail: data.moderado_por_email ? String(data.moderado_por_email) : null,
      };
    })
    .filter((item): item is ModeracionVacantePendiente => item !== null);
}

/** El dueño ya vio el aviso: no debe volver a aparecer. */
export async function marcarModeracionNotificada(vacanteId: string): Promise<void> {
  await updateDoc(doc(db, "vacantes", vacanteId), { moderacion_notificada: true });
}
