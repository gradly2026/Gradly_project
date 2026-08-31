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

/** Motivos para reportar una PASANTÍA/vacante (no a una persona). */
export const MOTIVOS_REPORTE_PASANTIA = [
  "Información falsa o engañosa",
  "Fraude o estafa",
  "Contenido inapropiado u ofensivo",
  "Requisitos o condiciones abusivas",
  "Empresa sospechosa o no verificable",
  "Publicación duplicada o spam",
  "Otro",
] as const;

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

export interface ReportarPasantiaParams {
  /** UID de la empresa dueña de la vacante (puede faltar en vacantes legadas). */
  empresaId?: string;
  empresaNombre?: string;
  /** ID del documento en `vacantes`. */
  vacanteId: string;
  vacanteTitulo?: string;
  /** Motivo (uno de MOTIVOS_REPORTE_PASANTIA o texto libre). */
  motivo: string;
  /** Detalle opcional que escribe la universidad. */
  descripcion?: string;
}

/**
 * Reporta una PASANTÍA/vacante al admin. Escribe en `reportes` con el mismo
 * esquema que lee el panel (`motivo` / `tipo` / `descripcion` / `estado` /
 * `fecha` / `reportado_id` / `reportante_id`), marcando `tipo: 'pasantia'` y
 * guardando además `vacante_id` / `vacante_titulo`. Como el detalle del reporte
 * en el panel no tiene fila dedicada para la vacante, el título y la empresa se
 * anteponen a la descripción para que el admin identifique la publicación sin
 * abrirla.
 */
export async function reportarPasantia({
  empresaId,
  empresaNombre,
  vacanteId,
  vacanteTitulo,
  motivo,
  descripcion,
}: ReportarPasantiaParams): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sesión no válida.");
  if (!vacanteId) throw new Error("Pasantía a reportar no válida.");
  if (!motivo.trim()) throw new Error("Selecciona un motivo.");

  const partes: string[] = [];
  if (vacanteTitulo?.trim()) partes.push(`Pasantía: ${vacanteTitulo.trim()}`);
  if (empresaNombre?.trim()) partes.push(`Empresa: ${empresaNombre.trim()}`);
  let detalle = partes.join(" · ");
  if (descripcion?.trim()) detalle += (detalle ? "\n\n" : "") + descripcion.trim();

  await addDoc(collection(db, "reportes"), {
    reportado_id: empresaId ?? "",
    // Denormalizado: el admin no puede resolver un id de vacante contra `usuarios`.
    reportado_nombre: (empresaNombre ?? vacanteTitulo ?? "").trim(),
    reportante_id: uid,
    reportador_id: uid, // compat regla de Firestore (lectura del propio reporte)
    motivo: motivo.trim(),
    tipo: "pasantia",
    vacante_id: vacanteId,
    vacante_titulo: vacanteTitulo ?? "",
    descripcion: detalle,
    estado: "abierto",
    fecha: serverTimestamp(),
  });

  try {
    await addDoc(collection(db, "admin_notifications"), {
      title: `Reporte de pasantía: ${motivo.trim()}`,
      is_read: false,
      tipo: "reporte",
      vacante_id: vacanteId,
      created_at: serverTimestamp(),
    });
  } catch {
    /* no-op: la notificación es secundaria al reporte */
  }
}
