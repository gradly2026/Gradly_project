/**
 * Servicio de REPORTES de usuario.
 *
 * Cierra el "hueco" en el que el panel admin tenía un módulo de Reportes pero
 * ningún dashboard permitía CREAR un reporte. Escribe en `reportes` con el
 * esquema exacto que el panel admin lee (`reportado_id` / `reportante_id` /
 * `motivo` / `tipo` / `descripcion` / `estado` / `fecha`) y además duplica
 * `reportador_id` para satisfacer la regla de Firestore de lectura del propio
 * reporte. Genera también una `admin_notifications` para alimentar el módulo de
 * Notificaciones del panel (si las reglas lo permiten).
 */
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../config/firebaseConfig";

/** Catálogo de motivos (la etiqueta se traduce en la UI vía AutoText/seed). */
export const MOTIVOS_REPORTE = [
  "Spam o publicidad",
  "Acoso o lenguaje ofensivo",
  "Contenido inapropiado",
  "Fraude o estafa",
  "Suplantación de identidad",
  "Otro",
] as const;

export type MotivoReporte = (typeof MOTIVOS_REPORTE)[number];

export interface CrearReporteParams {
  /** UID del usuario reportado. */
  reportadoId: string;
  /** Motivo (uno de MOTIVOS_REPORTE o texto libre). */
  motivo: string;
  /** Descripción / detalle del reporte. */
  descripcion: string;
  /** Categoría del reporte (por defecto "usuario"). */
  tipo?: string;
}

/**
 * Crea un reporte. Lanza si no hay sesión o si el reportado es el propio
 * usuario. La notificación al admin es best-effort (no rompe el reporte).
 */
export async function crearReporte({
  reportadoId,
  motivo,
  descripcion,
  tipo = "usuario",
}: CrearReporteParams): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sesión no válida.");
  if (!reportadoId) throw new Error("Usuario a reportar no válido.");
  if (reportadoId === uid) throw new Error("No puedes reportarte a ti mismo.");
  if (!motivo.trim()) throw new Error("Selecciona un motivo.");

  await addDoc(collection(db, "reportes"), {
    reportado_id: reportadoId,
    reportante_id: uid,
    reportador_id: uid, // compat con la regla de Firestore (lectura del propio reporte)
    motivo: motivo.trim(),
    tipo,
    descripcion: descripcion.trim(),
    estado: "abierto",
    fecha: serverTimestamp(),
  });

  // Notifica al panel admin. Best-effort: si las reglas aún no permiten create
  // a un no-admin, el reporte ya quedó registrado igualmente.
  try {
    await addDoc(collection(db, "admin_notifications"), {
      title: `Nuevo reporte: ${motivo.trim()}`,
      is_read: false,
      tipo: "reporte",
      reportado_id: reportadoId,
      created_at: serverTimestamp(),
    });
  } catch {
    /* no-op: la notificación es secundaria al reporte */
  }
}
