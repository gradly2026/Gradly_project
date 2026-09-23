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
 *  · migrarVerificacionesEmpresa → backfill de una sola vez: mueve el NIT y
 *    el documento del representante de `perfiles_empresas` (legible por
 *    cualquier autenticado) a `verificaciones_empresa` (solo dueño + admin),
 *    para las empresas registradas antes de la Fase 2 de la cola de
 *    aprobación (admin.ts). Idempotente, seguro de repetir.
 *  · obtenerSaludAsistencia → contadores agregados para la tarjeta "Salud
 *    operativa" del panel admin (Config): pasantías terminadas
 *    anticipadamente en 30 días + incidencias de tardanza reiterada abiertas
 *    (admin.ts). Bajo demanda, no automático.
 *  · obtenerAsistenciaPasantiaAdmin → gancho de contexto desde el detalle de
 *    un Reporte/Incidencia escalada: dado estudianteId+empresaId, resume la
 *    pasantía de cupo entre ambos (días no computados, fin anticipado) sin
 *    que el admin tenga que pedir los datos aparte (admin.ts).
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
 *  · chatbotGradly → "Asistente Gradly": bot de ayuda (Q&A) que llama a Groq
 *    con la API key como secreto (chatbot.ts). Requiere sesión; tope diario por
 *    usuario en `chatbot_uso/{uid}`. Necesita: firebase functions:secrets:set
 *    GROQ_API_KEY  +  firebase deploy --only functions:chatbotGradly.
 *  · generarCodigoAsistencia / registrarAsistenciaPorCodigo → código diario
 *    de 8 dígitos para marcar asistencia real de una pasantía de cupo
 *    (asistencia.ts, Fase 2 de "asistencia real" — ver ajusteAsistenciaService.ts
 *    en el cliente para la Fase 1, "días no computados"). Las horas cuentan por
 *    asistencia (margen de 20 min); registrarAsistenciaManual deja a la empresa
 *    registrar después la de un pasante que sí fue (hasta 3 días).
 *  · recordatorioAsistenciaPendiente → job diario (11:00 América/El_Salvador)
 *    que avisa a la empresa si tiene pasantes que hoy les tocaba marcar
 *    asistencia y aún no lo han hecho (asistencia.ts).
 *  · extraerFaqDeDocumento → el admin sube un .pdf/.docx/.txt a Storage y
 *    esta function extrae el texto y le pide a Groq pares pregunta/
 *    respuesta en JSON, para precargar el FAQ del Asistente Gradly
 *    (faqExtractor.ts). Solo admin; usa el mismo GROQ_API_KEY que
 *    chatbotGradly, sin secretos nuevos.
 *  · actualizarTopEstudiantes / recalcularTopEstudiantes → "Top 3 estudiantes"
 *    de TODA la plataforma: job diario (03:00 América/El_Salvador) que solo
 *    recalcula cada 3 días, y callable solo admin para forzarlo ya. Guardan UN
 *    documento, `ranking_plataforma/top_estudiantes`, que leen empresas,
 *    universidades y admin en el banner de la Red Gradly (topEstudiantes.ts).
 *    Sin secretos nuevos; el job crea su Cloud Scheduler al desplegar.
 *  · actualizarListasPerfiles / recalcularListasPerfiles → las listas "mejores
 *    estudiantes" del perfil público de CADA empresa y universidad
 *    (`top_estudiantes`): job diario (03:30 América/El_Salvador) y callable solo
 *    admin (lo dispara, sin esperar, el botón "Recalcular Top 3 ahora"). Mismo
 *    criterio y orden que el cliente (topEstudiantesService.ts); solo reescribe
 *    los perfiles cuya lista cambió (topPerfiles.ts).
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
  migrarVerificacionesEmpresa,
  obtenerAsistenciaPasantiaAdmin,
  obtenerSaludAsistencia,
  resolveReport,
  setUserApproval,
  setUserBan,
  setUserRole,
  setUserStatus,
} from "./admin";
export { eliminarEstudiante, eliminarGrupo } from "./universidad";
export { chatbotGradly } from "./chatbot";
export { extraerFaqDeDocumento } from "./faqExtractor";
export { actualizarTopEstudiantes, recalcularTopEstudiantes } from "./topEstudiantes";
export { actualizarListasPerfiles, recalcularListasPerfiles } from "./topPerfiles";
export {
  generarCodigoAsistencia,
  registrarAsistenciaPorCodigo,
  registrarAsistenciaManual,
  recordatorioAsistenciaPendiente,
} from "./asistencia";
