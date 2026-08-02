/**
 * Resuelve a qué ruta debe navegar la app al tocar una notificación.
 *
 * Las notificaciones guardan `link_accion` (espejo de `referencia_id`), que puede
 * ser:
 *   - Una RUTA explícita (empieza con '/') → se navega ahí directo.
 *   - Un ID de entidad (p. ej. el id de una solicitud de pasantía) → se lleva a
 *     la bandeja de mensajes, donde vive el chat/objeto consecuente.
 *   - Vacío → sin destino (no navega).
 *
 * Lo usan tanto la campanita in-app (FloatingTopBar) como el manejador de push.
 */
export function resolverRutaNotif(
  linkAccion?: string | null,
  tipo?: string,
): string | null {
  const t = (tipo ?? "").toLowerCase();

  // ── Reglas por TIPO (tienen prioridad sobre link_accion) ──
  // Eventos del ciclo de la pasantía del estudiante → tab Progreso.
  if (t.includes("certificad") || t.includes("acuerdo_aprobado")) {
    return "/(tabs)/progreso";
  }

  // ── Por defecto: usar link_accion / referencia_id ──
  const dest = (linkAccion ?? "").trim();
  if (dest.startsWith("/")) return dest;
  if (dest) return "/mensajes";
  return null;
}
