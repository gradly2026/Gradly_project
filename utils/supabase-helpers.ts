/**
 * supabase-helpers.ts
 * Utilidades reutilizables para operaciones comunes de Supabase.
 */

import { supabase } from "../lib/supabase";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type RolTipo = "empresa" | "talento" | "alumno" | "universidad";

const TABLE_MAP: Record<RolTipo, string> = {
  empresa: "empresas",
  talento: "talentos",
  alumno: "alumnos",
  universidad: "universidades",
};

// ── Notificaciones ────────────────────────────────────────────────────────────

/**
 * Inserta una notificación en la tabla notificaciones.
 */
export async function insertNotificacion(params: {
  userId: string;
  tipo: string;
  titulo: string;
  mensaje: string;
}) {
  return supabase.from("notificaciones").insert({
    usuario_id: params.userId,
    tipo: params.tipo,
    titulo: params.titulo,
    mensaje: params.mensaje,
    leida: false,
  });
}

// ── Usuarios / Perfiles ───────────────────────────────────────────────────────

/**
 * Obtiene el registro de rol del usuario desde la tabla correspondiente.
 */
export async function getRolData(userId: string, rol: RolTipo) {
  const tabla = TABLE_MAP[rol];
  const { data, error } = await supabase
    .from(tabla)
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  return { data, error };
}

/**
 * Verifica si un usuario está baneado. Devuelve { baneado, motivo, hasta }.
 */
export async function checkBaneo(userId: string, rol: RolTipo) {
  const tabla = TABLE_MAP[rol];
  const { data } = await supabase
    .from(tabla)
    .select("baneado, motivo_baneo, baneo_hasta")
    .eq("id", userId)
    .maybeSingle();

  if (!data || !data.baneado) return { baneado: false, motivo: null, hasta: null };

  return {
    baneado: true,
    motivo: data.motivo_baneo ?? "No especificado",
    hasta: data.baneo_hasta
      ? new Date(data.baneo_hasta).toLocaleDateString("es-SV")
      : "indefinidamente",
  };
}

/**
 * Banea a un usuario actualizando su tabla de rol y su perfil.
 */
export async function banearUsuario(
  userId: string,
  rol: RolTipo,
  profileId: string,
  motivo: string,
  hasta?: string
) {
  const tabla = TABLE_MAP[rol];
  await Promise.all([
    supabase.from(tabla).update({
      baneado: true,
      motivo_baneo: motivo,
      baneo_hasta: hasta ?? null,
    }).eq("id", userId),
    supabase.from("profiles").update({ status: "bloqueado" }).eq("id", profileId),
  ]);
}

/**
 * Desbanea a un usuario actualizando su tabla de rol y su perfil.
 */
export async function desbanearUsuario(userId: string, rol: RolTipo, profileId: string) {
  const tabla = TABLE_MAP[rol];
  await Promise.all([
    supabase.from(tabla).update({
      baneado: false,
      motivo_baneo: null,
      baneo_hasta: null,
    }).eq("id", userId),
    supabase.from("profiles").update({ status: "activo" }).eq("id", profileId),
  ]);
}

// ── Aplicaciones ──────────────────────────────────────────────────────────────

/**
 * Actualiza el estado de una aplicación.
 */
export async function actualizarEstadoAplicacion(
  aplicacionId: string,
  estado: "pendiente" | "en_revision" | "entrevista" | "contratada" | "rechazada"
) {
  return supabase.from("aplicaciones").update({ estado }).eq("id", aplicacionId);
}

// ── Horas Sociales ────────────────────────────────────────────────────────────

/**
 * Actualiza el estado de una solicitud de horas.
 */
export async function actualizarEstadoSolicitudHoras(
  solicitudId: string,
  estado: "pendiente" | "en_revision" | "aprobada" | "rechazada" | "cerrada"
) {
  return supabase.from("solicitudes_horas").update({ estado }).eq("id", solicitudId);
}

// ── Vacantes ──────────────────────────────────────────────────────────────────

/**
 * Obtiene el número de vacantes activas de una empresa y el límite de su plan.
 * Retorna { activas, limite, plan }.
 */
export async function getPlanInfo(empresaId: string): Promise<{ activas: number; limite: number; plan: string }> {
  const [{ count: activas }, { data: sub }] = await Promise.all([
    supabase.from("vacantes").select("*", { count: "exact", head: true }).eq("empresa_id", empresaId).eq("estado", "activa"),
    supabase.from("suscripciones_empresas").select("plan, max_vacantes").eq("empresa_id", empresaId).maybeSingle(),
  ]);

  return {
    activas: activas ?? 0,
    limite: sub?.max_vacantes ?? 3,
    plan: sub?.plan ?? "basico",
  };
}

// ── Formato ───────────────────────────────────────────────────────────────────

/**
 * Formatea una fecha ISO a string local de El Salvador.
 */
export function fmtFecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-SV", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Trunca un texto a N caracteres con "…" si es más largo.
 */
export function truncate(text: string, maxLen = 80): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}
