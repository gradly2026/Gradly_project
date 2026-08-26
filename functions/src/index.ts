/**
 * Cloud Functions de Gradly.
 *
 *  · solicitarOtp / verificarOtp  → login sin contraseña por código (otp.ts)
 *  · consultarEstadoAcceso        → dado un correo, dice si la cuenta está
 *    baneada/inactiva y el motivo — sin sesión, para el modal de login de una
 *    cuenta deshabilitada (otp.ts).
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
 *  · deshabilitarVacanteAdmin / eliminarVacanteAdmin → moderación de
 *    vacantes/pasantías desde el panel admin (admin.ts), con motivo
 *    obligatorio. `eliminarVacanteAdmin` es eliminación LÓGICA (no borra el
 *    doc, evita huérfanos en aplicaciones/reclamos_cupos/chats).
 *  · backfillAlianzasCalificaciones → recalcula "alianzas" y calificación
 *    promedio de estudiantes de TODAS las empresas/universidades a partir del
 *    historial completo de `solicitudes_practicas` (admin.ts). Backfill de una
 *    sola vez para pasantías aprobadas antes de que existiera el autoreporte
 *    en tiempo real; también sirve para reconciliar si hiciera falta.
 *  · contarAplicanteNuevo / descontarAplicanteBorrado → mantienen en cada
 *    vacante el desglose `aplicantes_por_carrera` (aplicantes.ts), para que el
 *    estudiante vea CUÁNTOS compiten con él y de qué carreras, sin poder leer
 *    QUIÉNES son. El total `aplicantes_count` NO lo tocan: ese ya lo escribe el
 *    cliente en pasantiaService.crearAplicacion, y contarlo aquí lo duplicaría.
 *    `backfillAplicantesVacantes` recalcula ambos desde cero y reconcilia el
 *    desfase que deja el borrado administrativo; hay que llamarlo una vez tras
 *    desplegar.
 *  · eliminarEstudiante / eliminarGrupo → una universidad deshace su propia
 *    carga por Excel (estudiante o grupo completo) antes de que quede ligada
 *    a una pasantía real (universidad.ts). Borran también la cuenta de Auth.
 *
 * Nota: el antiguo patrón "traducir al escribir" (triggers translate_*) se
 * retiró — se reemplazó por la traducción al vuelo con caché, que cubre también
 * el contenido ya existente y cualquier campo, sin backfill.
 */
export { solicitarOtp, verificarOtp, consultarEstadoAcceso } from "./otp";
export { traducirTexto } from "./traducir";
export { notifNuevoMensaje } from "./chatNotif";
export { barridoCuposVencidos } from "./barridoCupos";
export {
  contarAplicanteNuevo,
  descontarAplicanteBorrado,
  backfillAplicantesVacantes,
} from "./aplicantes";
export {
  backfillAlianzasCalificaciones,
  deleteUserComplete,
  deshabilitarVacanteAdmin,
  eliminarVacanteAdmin,
  resolveReport,
  setUserApproval,
  setUserBan,
  setUserRole,
  setUserStatus,
} from "./admin";
export { eliminarEstudiante, eliminarGrupo } from "./universidad";
