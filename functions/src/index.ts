/**
 * Cloud Functions de Gradly.
 *
 *  · solicitarOtp / verificarOtp  → login sin contraseña por código (otp.ts)
 *  · traducirTexto                → traducción al vuelo del contenido de la BD
 *                                   (traducir.ts). El cliente cachea el resultado.
 *  · notifNuevoMensaje            → notificación de campanita al recibir un
 *                                   mensaje de chat (chatNotif.ts). Sin push.
 *  · barridoCuposVencidos         → job horario que devuelve al mercado los
 *                                   cupos reservados que ningún estudiante tomó
 *                                   dentro del plazo (barridoCupos.ts).
 *  · setUserRole / setUserStatus / setUserApproval / setUserBan /
 *    resolveReport / deleteUserComplete → operaciones sensibles del panel
 *    admin (admin.ts). Solo un actor con rol 'admin' puede invocarlas; cada
 *    una audita en `audit_logs`. Ver ADMIN_IMPLEMENTACION_INICIAL.md.
 *  · eliminarEstudiante / eliminarGrupo → una universidad deshace su propia
 *    carga por Excel (estudiante o grupo completo) antes de que quede ligada
 *    a una pasantía real (universidad.ts). Borran también la cuenta de Auth.
 *
 * Nota: el antiguo patrón "traducir al escribir" (triggers translate_*) se
 * retiró — se reemplazó por la traducción al vuelo con caché, que cubre también
 * el contenido ya existente y cualquier campo, sin backfill.
 */
export { solicitarOtp, verificarOtp } from "./otp";
export { traducirTexto } from "./traducir";
export { notifNuevoMensaje } from "./chatNotif";
export { barridoCuposVencidos } from "./barridoCupos";
export {
  deleteUserComplete,
  resolveReport,
  setUserApproval,
  setUserBan,
  setUserRole,
  setUserStatus,
} from "./admin";
export { eliminarEstudiante, eliminarGrupo } from "./universidad";
