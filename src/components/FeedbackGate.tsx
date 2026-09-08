/**
 * Compuerta de feedback — DESACTIVADA.
 *
 * Antes, al montarse (entrada a la app), detectaba las pasantías finalizadas
 * sin evaluar del usuario y superponía, de forma secuencial y OBLIGATORIA, el
 * "Formulario de Experiencia Gradly".
 *
 * Por pedido del equipo, las calificaciones dejaron de ser intrusivas: ahora
 * SOLO se abren desde botones explícitos —"Calificar desempeño" en el filtro
 * "Por certificar" del dashboard de empresa, "Calificar mi experiencia" en
 * "Mi progreso" del estudiante, y "Calificar ahora" en el modal de la
 * universidad (`CertificarPasanteModal`)— todos vía `CalificarPasantiaModal`.
 *
 * Este componente se conserva (lo montan `app/(tabs)/_layout.tsx` y
 * `app/dashboard-empresa.tsx`) pero ya no renderiza nada. El servicio
 * `getFeedbackPendiente` / `enviarFeedback` sigue igual: es el que consultan
 * esos botones y el que garantiza "una sola vez" (`feedback_pasantias`).
 */
export default function FeedbackGate() {
  return null;
}
