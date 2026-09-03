// ════════════════════════════════════════════════════════════════════════
// autoSeed.ts — GUÍA PARA PRINCIPIANTES
//
// QUÉ ES ESTE ARCHIVO:
// Este archivo NO tiene lógica complicada: es, sobre todo, una lista muy
// larga de "diccionarios" de traducción escritos A MANO. Cada diccionario
// tiene la forma:
//
//     {
//       "Texto exacto en español": "Exact matching text in English",
//       "Otro texto en español":   "Another matching text in English",
//       ...
//     }
//
// En TypeScript, el tipo de cada uno de estos diccionarios es
// `Record<string, string>`, que significa: "un objeto donde tanto las
// claves como los valores son texto (string)". Aquí la CLAVE es siempre
// la frase en español TAL COMO aparece en la pantalla (con mayúsculas,
// tildes y signos de puntuación exactos), y el VALOR es su traducción al
// inglés.
//
// ¿PARA QUÉ SIRVE ESTO SI YA EXISTE translationService.ts?
// src/services/translationService.ts (léelo primero si no lo hiciste) ya
// sabe traducir CUALQUIER texto llamando a una función en la nube (Google
// Translate) la primera vez que lo ve, y luego lo recuerda en caché. El
// problema es que esa primera vez toma un poquito de tiempo (necesita
// internet) — así que, para las pantallas más importantes/visitadas de la
// app, en vez de esperar a que Google Translate responda la primera vez,
// aquí se "pre-traducen a mano" las frases más comunes, para que
// aparezcan en inglés DESDE EL PRIMER INSTANTE, sin parpadeo ni depender
// de la red. A este proceso los desarrolladores le llaman "seed"
// (sembrar el caché de antemano).
//
// translationService.ts importa TODOS estos diccionarios y, apenas la app
// arranca (función seedStaticCache() en ese archivo), copia cada pareja
// clave→valor dentro de su caché en memoria, como si Google Translate ya
// las hubiera traducido.
//
// EL ARCHIVO TIENE 9 DICCIONARIOS, cada uno cubriendo una parte distinta
// de la app (ya explicado con un comentario propio justo antes de cada
// uno, pero aquí va el mapa completo):
//   1. AUTO_SEED_EN         (línea ~16)  → Registro y dashboards de
//                                          empresa/estudiante (uso general).
//   2. ADMIN_SEED_EN        (línea ~376) → Panel de administración completo.
//   3. CUPOS_SEED_EN        (línea ~576) → Flujo de "reparto de cupos"
//                                          (disponibilidad horaria, tablero
//                                          de selección de estudiantes).
//   4. UBICACION_SEED_EN    (línea ~773) → Selector de ubicación/dirección
//                                          del estudiante nuevo.
//   5. GESTION_SEED_EN      (línea ~797) → Eliminar vacante/grupo/estudiante
//                                          y moderación de publicaciones.
//   6. PROGRESO_SEED_EN     (línea ~818) → Barra de progreso de la pasantía.
//   7. RESUMEN_HOME_SEED_EN (línea ~833) → Tarjetas "Resumen general" y
//                                          "Análisis" de los dashboards.
//   8. NOTIF_MODALES_SEED_EN(línea ~894) → Modales que se abren al tocar
//                                          una notificación.
//
// IMPORTANTE: como son cientos de frases casi idénticas en estructura
// (clave en español → valor en inglés), NO se comenta cada línea una por
// una — sería repetir la misma explicación cientos de veces sin aportar
// nada nuevo. En vez de eso, cada bloque grande ya tiene un comentario
// arriba explicando A QUÉ PANTALLA pertenece, y dentro de cada bloque hay
// sub-comentarios (líneas que empiezan con "//") marcando qué componente
// usa cada grupo de frases. Si buscas una frase específica, usa Ctrl+F
// (buscar) con el texto en español exacto.
//
// Si algún día agregas una pantalla nueva con mucho texto fijo, puedes
// crear un noveno diccionario siguiendo el mismo patrón, agregarlo al
// import y al bucle seedStaticCache() de translationService.ts.
// ════════════════════════════════════════════════════════════════════════

/**
 * Diccionario estático ES→EN para SEMBRAR el caché de traducción automática.
 *
 * `translationService` inyecta estas parejas en su caché al arrancar, de modo
 * que `AutoText` (que traduce por el string literal en español) las resuelve AL
 * INSTANTE en el primer render — sin llamada de red, sin parpadeo y sin poder
 * quedar "pegadas" en español por un fallo de la Cloud Function.
 *
 * Cubre las pantallas de alto tráfico: registro (empresa/universidad) y los
 * dashboards de empresa y estudiante. Cualquier string NO listado aquí sigue
 * traduciéndose por la vía asíncrona habitual (Google Translate), sin cambios.
 *
 * La CLAVE debe ser EXACTA al texto en español que se renderiza (acentos,
 * mayúsculas, signos y espacios incluidos), o no habrá coincidencia.
 */
export const AUTO_SEED_EN: Record<string, string> = {
  "Academia Gradly": "Gradly Academy",
  "Aceptar": "Accept",
  "Afín a tu carrera": "Matches your major",
  "Afín a tus vacantes": "Matches your job posts",
  "Aceptar y Cerrar": "Accept and close",
  "Activa": "Active",
  "Actividad reciente": "Recent activity",
  "Actualizar método de pago": "Update payment method",
  "Ahora tienes acceso a las ventajas del": "You now have access to the benefits of the",
  "Alianzas": "Alliances",
  "Anual": "Annual",
  "Aprobadas": "Approved",
  "Aquí aparecerán tus pasantías completadas.": "Your completed internships will appear here.",
  "Avanzar →": "Advance →",
  "Aún no has seleccionado carreras.": "You haven't selected any majors yet.",
  "Aún no tienes conversaciones.\nUsa el buscador de arriba para iniciar una.":
    "You don't have any conversations yet.\nUse the search bar above to start one.",
  "Buscar candidatos o vacantes...": "Search candidates or job posts...",
  "Buscar carrera, tipo o modalidad…": "Search major, type or modality…",
  "Buscar vacantes...": "Search job posts...",
  "CV que enamora empresas": "A CV that wins companies over",
  "Calificar a este candidato:": "Rate this candidate:",
  "Cambiar": "Change",
  "Cambiar a facturación anual": "Switch to annual billing",
  "Cambiar a facturación mensual": "Switch to monthly billing",
  "Cancelar": "Cancel",
  "Cargo": "Position",
  "Carreras": "Majors",
  "Carreras universitarias": "University majors",
  "Cerrar": "Close",
  "Cerrar Sesión": "Sign out",
  "Certificada": "Certified",
  "Chatear con Candidato": "Chat with candidate",
  "Distrito (sede)": "District (headquarters)",
  "Comenzar": "Start",
  "Como aparece en la tarjeta": "As it appears on the card",
  "Comunicación efectiva": "Effective communication",
  "Confirmar Mejora": "Confirm upgrade",
  "Confirmar Rechazo": "Confirm rejection",
  "Confirmar contraseña": "Confirm password",
  "Confirmar plan": "Confirm plan",
  "Confirmar selección": "Confirm selection",
  "Constancia firmada": "Signed certificate",
  "Contacto": "Contact",
  "Contacto / Responsable": "Contact / Manager",
  "Contraseña": "Password",
  "Contratado": "Hired",
  "Correo de contacto": "Contact email",
  "Correo de la cuenta": "Account email",
  "Correo del representante": "Representative's email",
  "Correo del responsable": "Manager's email",
  "Crear cuenta": "Create account",
  "Cursos recomendados": "Recommended courses",
  "Cuéntanos sobre tu organización.": "Tell us about your organization.",
  "Cómo negociar tu primer contrato": "How to negotiate your first contract",
  "Cómo redactar un CV impactante": "How to write a compelling CV",
  "Datos de la empresa": "Company details",
  "Datos de la institución": "Institution details",
  "Datos de pago": "Payment details",
  "Define la contraseña de tu cuenta.": "Set your account password.",
  "Departamento": "Department",
  "Departamento (sede)": "Department (headquarters)",
  "Departamento:": "Department:",
  "Descripción": "Description",
  "Descripción de la vacante...": "Job description...",
  "Descripción*": "Description*",
  "Detalles de Vacante": "Job details",
  "Dirección": "Address",
  "Dirección (opcional)": "Address (optional)",
  "Dirección:": "Address:",
  "Diseño": "Design",
  "Documento de identidad": "ID document",
  "Documento del responsable": "Manager's ID document",
  "Dominio de correo institucional": "Institutional email domain",
  "Ej. Logística": "e.g. Logistics",
  "Elige tu plan": "Choose your plan",
  "Elige un nuevo plan": "Choose a new plan",
  "Empresa": "Company",
  "En Revisión": "Under review",
  "En proceso": "In progress",
  "Entendido": "Got it",
  "Entrevista": "Interview",
  "Entrevistas que conquistan": "Interviews that win",
  "Error al Guardar": "Error saving",
  "Errores comunes en entrevistas": "Common interview mistakes",
  "Especifica el área*": "Specify the area*",
  "Especifica la industria": "Specify the industry",
  "Estadísticas": "Statistics",
  "Excel para profesionales": "Excel for professionals",
  "Explica brevemente por qué no fue seleccionado...": "Briefly explain why they weren't selected...",
  "Facebook": "Facebook",
  "Facebook (opcional)": "Facebook (optional)",
  "Fecha límite*": "Deadline*",
  "Finalizada": "Completed",
  "Sin iniciar": "Not started",
  "Finanzas": "Finance",
  "Firmar": "Sign",
  "Firmar constancia": "Sign certificate",
  "Gestiona los pagos a estudiantes y administra tu método de pago de forma segura.": "Manage student payments and your payment method securely.",
  "Gestiona tu empresa desde aquí": "Manage your company from here",
  "Gradly renueva tu plan cada año sin que tengas que hacer nada.": "Gradly renews your plan every year without you having to do anything.",
  "Gradly renueva tu plan cada mes sin que tengas que hacer nada.": "Gradly renews your plan every month without you having to do anything.",
  "Gestiona y valida el progreso de horas de práctica de tus estudiantes.": "Manage and validate your students' practice-hours progress.",
  "Guardar tarjeta": "Save card",
  "Guías rápidas": "Quick guides",
  "Historial": "History",
  "Historial de Pasantes": "Interns history",
  "Historial de pagos": "Payment history",
  "Horas de práctica": "Practice hours",
  "Horas totales*": "Total hours*",
  "Horas/semana*": "Hours/week*",
  "Híbrido": "Hybrid",
  "Industria / Rubro": "Industry / Sector",
  "Industria / sector": "Industry / sector",
  "Información general de la universidad.": "General information about the university.",
  "Información pública y de contacto": "Public and contact information",
  "Inicia sesión aquí": "Sign in here",
  "Inicio": "Home",
  "Instagram": "Instagram",
  "Instagram (opcional)": "Instagram (optional)",
  "La oferta ya está disponible para todos los estudiantes de la red.": "The offer is now available to all students in the network.",
  "Licencia": "License",
  "LinkedIn profesional": "Professional LinkedIn",
  "Logo de la empresa": "Company logo",
  "Logo de la universidad": "University logo",
  "Mandar a Entrevista": "Send to interview",
  "Marca el punto exacto del lugar de trabajo (solo El Salvador).": "Mark the exact workplace location (El Salvador only).",
  "Marketing": "Marketing",
  "Mejorar tu plan": "Upgrade your plan",
  "Mensajes": "Messages",
  "Mensual": "Monthly",
  "Mi Perfil": "My Profile",
  "Mi calendario": "My calendar",
  "Mi pasantía": "My internship",
  "Mi plan": "My plan",
  "Mi progreso": "My progress",
  "Mi rango": "My rank",
  "Mis Ingresos": "My income",
  "Mis Vacantes": "My job posts",
  "Modalidad*": "Modality*",
  "Motivo del rechazo": "Reason for rejection",
  "Distrito": "District",
  "Municipio:": "Municipality:",
  "Método de pago": "Payment method",
  "Networking desde cero": "Networking from scratch",
  "Nivel y experiencia": "Level and experience",
  "No hay tarjeta registrada": "No card registered",
  "Nombre comercial": "Business name",
  "Nombre completo": "Full name",
  "Nombre de la empresa": "Company name",
  "Nombre de la universidad": "University name",
  "Nombre del responsable": "Manager's name",
  "Nombre del titular": "Cardholder name",
  "Notificar finalización": "Notify completion",
  "Nueva pasantía": "New internship",
  "Número de documento (sin guiones)": "Document number (no dashes)",
  "Número de tarjeta": "Card number",
  "Objetivo": "Goal",
  "PNG, JPG · Máx. 10MB": "PNG, JPG · Max. 10MB",
  "Pagado": "Paid",
  "Pagar": "Pay",
  "Pagar ahora": "Pay now",
  "Pago simulado. No se realiza ningún cargo real.": "Simulated payment. No real charge is made.",
  "Pagos": "Payments",
  "Pagos y aliados": "Payments and partners",
  "Panel de control": "Control panel",
  "Pasantes individuales": "Individual interns",
  "Pasantía activa": "Active internship",
  "Pasantía de Desarrollo Web": "Web Development Internship",
  "Pasantía finalizada": "Completed internship",
  "Pasantías Activas": "Active internships",
  "Pasantías de grupo": "Group internships",
  "Pasaporte": "Passport",
  "País:": "Country:",
  "Pendiente de certificar": "Pending certification",
  "Pendientes": "Pending",
  "Persona de contacto de la empresa": "Company contact person",
  "Persona de contacto de la empresa.": "Company contact person.",
  "Persona encargada de gestionar la cuenta institucional.": "Person in charge of managing the institutional account.",
  "Plan actual": "Current plan",
  "Planes y Facturación": "Plans and billing",
  "Por favor espera, no cierres esta ventana.": "Please wait, don't close this window.",
  "Postulación rechazada": "Application rejected",
  "Prepárate para tu pasantía": "Get ready for your internship",
  "Presencial": "On-site",
  "Procesando Vacante...": "Processing job post...",
  "Procesando pago...": "Processing payment...",
  "Procesando ubicación...": "Processing location...",
  "Procesando...": "Processing...",
  "Procesar pago": "Process payment",
  "Prueba cambiando el filtro o la búsqueda.": "Try changing the filter or the search.",
  "Publica vacantes y contrata talento universitario verificado.": "Post jobs and hire verified university talent.",
  "Publicar": "Publish",
  "Publicar nueva pasantía": "Post new internship",
  "Qué esperar en tu primera pasantía": "What to expect in your first internship",
  "Rechazar": "Reject",
  "Recibo": "Receipt",
  "Recibo Gradly": "Gradly receipt",
  "Reclutamiento": "Recruitment",
  "Redirigiendo a tu panel…": "Redirecting to your dashboard…",
  "Registrando ubicación y datos en la base de datos.": "Registering location and data in the database.",
  "Remoto": "Remote",
  "Renovación automática": "Automatic renewal",
  "Renovar pago de este año": "Renew this year's payment",
  "Renovar pago de este mes": "Renew this month's payment",
  "Representante": "Representative",
  "Requisitos y Horas": "Requirements and hours",
  "Responsable": "Manager",
  "Restantes": "Remaining",
  "Revisar Formulario": "Review form",
  "Salir": "Exit",
  "Salud": "Health",
  "Se generó una transacción pendiente de pago.": "A payment-pending transaction was created.",
  "Seguridad": "Security",
  "Selecciona el tipo de cuenta.": "Select the account type.",
  "Seleccionar Carreras Universitarias": "Select university majors",
  "Siglas (máx. 10)": "Acronym (max. 10)",
  "Sin actividad reciente.": "No recent activity.",
  "Sin datos todavía.": "No data yet.",
  "Sin historial.": "No history.",
  "Sin pagos pendientes.": "No pending payments.",
  "Sin pasantes activos.": "No active interns.",
  "Sin pasantía activa en este momento.": "No active internship right now.",
  "Sin resultados": "No results",
  "Sin transacciones registradas aún.": "No transactions recorded yet.",
  "Sin vacantes publicadas.": "No job posts published.",
  "Suscripciones": "Subscriptions",
  "Suscripciones pagadas": "Subscriptions paid",
  "Suscripciones completadas en el mes en curso.": "Subscriptions completed in the current month.",
  "Suma de los últimos 12 meses.": "Sum of the last 12 months.",
  "Aún no hay ingresos por suscripciones registrados.": "No subscription revenue recorded yet.",
  "Aún no se han registrado pagos de suscripción.": "No subscription payments recorded yet.",
  "Toca para ver el historial e ingresos de suscripciones.": "Tap to see subscription history and revenue.",
  "Ingresos": "Revenue",
  "Ingresos de este mes": "This month's revenue",
  "Ingresos del último año": "Last year's revenue",
  "Ingresos mensuales (últimos 12 meses)": "Monthly revenue (last 12 months)",
  "Planes elegidos": "Plans chosen",
  "Plan Básico": "Basic Plan",
  "Plan Gratuito": "Free Plan",
  "Gratuito": "Free",
  "Plan Premium": "Premium Plan",
  "Pagos de planes de Gradly: qué plan eligió cada empresa, cuánto pagó e ingresos totales a la plataforma.":
    "Gradly plan payments: which plan each company chose, how much they paid, and total platform revenue.",
  "Sitio web": "Website",
  "Sitio web (opcional)": "Website (optional)",
  "Skills (separadas por coma)*": "Skills (comma-separated)*",
  "Sube el escudo o logotipo oficial de la institución.": "Upload the institution's official crest or logo.",
  "Sube el logotipo oficial. Se mostrará en tus vacantes y perfil.": "Upload the official logo. It will appear on your job posts and profile.",
  "Subir logo de la empresa": "Upload company logo",
  "Subir logo de la universidad": "Upload university logo",
  "Suscripción procesada correctamente.": "Subscription processed successfully.",
  "Tecnología": "Technology",
  "Teléfono": "Phone",
  "Teléfono (+503)": "Phone (+503)",
  "Teléfono de contacto": "Contact phone",
  "Tip de la semana": "Tip of the week",
  "Tipo de documento": "Document type",
  "Tipo*": "Type*",
  "Toca el mapa para colocar el marcador en el punto exacto.": "Tap the map to place the marker on the exact spot.",
  "Toca para cambiar": "Tap to change",
  "Todas": "All",
  "Total recibido": "Total received",
  "Trabajo en equipo": "Teamwork",
  "Traducido · Ver original": "Translated · Show original",
  "Traducir mensaje": "Translate message",
  "Traduciendo…": "Translating…",
  "Tu plan actual": "Your current plan",
  "Título*": "Title*",
  "Ubicación": "Location",
  "Ubicación de la vacante": "Job location",
  "Ubicación registrada": "Location registered",
  "Universidad": "University",
  "Vacantes": "Job posts",
  "Vaciar": "Clear",
  "Vaciar chat": "Clear chat",
  "Se ocultarán todos los mensajes solo en tu vista. Los demás participantes seguirán viéndolos.":
    "All messages will be hidden only in your view. The other participants will still see them.",
  "Vencimiento (MM/AA)": "Expiry (MM/YY)",
  "Ver credenciales de pago": "View payment credentials",
  "Ver detalles del plan": "View plan details",
  "Ver original": "Show original",
  "Verificada": "Verified",
  "Volver": "Back",
  "← Anterior": "← Back",
  "Siguiente →": "Next →",
  "Reportar": "Report",
  "Reportar usuario": "Report user",
  "Motivo": "Reason",
  "Descripción (opcional)": "Description (optional)",
  "Describe brevemente lo ocurrido…": "Briefly describe what happened…",
  "Enviar reporte": "Send report",
  "Reporte enviado": "Report sent",
  "Gracias. Nuestro equipo administrativo revisará el caso.": "Thank you. Our admin team will review the case.",
  "Spam o publicidad": "Spam or advertising",
  "Acoso o lenguaje ofensivo": "Harassment or offensive language",
  "Contenido inapropiado": "Inappropriate content",
  "Fraude o estafa": "Fraud or scam",
  "Suplantación de identidad": "Identity impersonation",
  "Otro": "Other",
  "Selecciona un motivo.": "Select a reason.",
  "No puedes reportarte a ti mismo.": "You can't report yourself.",
  "No se pudo enviar el reporte.": "The report could not be sent.",
  "candidatura": "application",
  "¡Aplicación enviada!": "Application sent!",
  "¡Avanzaste a Entrevista!": "You advanced to an interview!",
  "¡Bienvenido a tu panel! 🏢": "Welcome to your dashboard! 🏢",
  "¡Cuenta creada!": "Account created!",
  "¡Felicidades!": "Congratulations!",
  "¡Meta alcanzada! Eres un Graduado.": "Goal reached! You're a Graduate.",
  "¡Pago Realizado!": "Payment completed!",
  "¡Vacante Publicada!": "Job posted!",
  "¿Cómo quieres usar Gradly?": "How do you want to use Gradly?",
  "¿Estás seguro de que deseas salir de tu cuenta?": "Are you sure you want to sign out of your account?",
  "¿Ya tienes cuenta?": "Already have an account?",
  "Área*": "Area*",

  // ── Bandeja de reseñas de perfil (ResenasFeedback.tsx) ──
  "Reseñas": "Reviews",
  "Calificación": "Rating",
  "Aún no hay reseñas.": "No reviews yet.",
  "De una empresa": "From a company",
  "De un estudiante": "From a student",
  "De una universidad": "From a university",
  "Ver más": "See more",
  "Sin datos aún": "No data yet",
  "Lo que estudiantes y empresas opinan de tu universidad":
    "What students and companies think of your university",
  "Aún sin estudiantes trabajando.": "No students working yet.",
  "Promedio de calificación de tus estudiantes en sus pasantías.":
    "Average rating of your students in their internships.",
  "Calificación y comentarios recibidos": "Rating and comments received",
  "Promedio de tus estudiantes en sus pasantías": "Average of your students in their internships",
  "Hace 1 día": "1 day ago",

  // ── Guía de bienvenida (OnboardingTour) — recorrido automático del
  // estudiante, sección por sección, hasta Mi Perfil. Empresa/universidad
  // ya tenían sus propios pasos sembrados; estos son los que faltaban
  // (estudiante es nuevo, y 'historial'/'perfil' de empresa y 'perfil' de
  // universidad quedaban fuera del recorrido antes de este cambio). ──
  "¡Bienvenido a Gradly! 🎓": "Welcome to Gradly! 🎓",
  "Aquí verás vacantes o pasantías según el momento de tu práctica: cupos asegurados por tu universidad, pasantías afines a tu carrera, o vacantes cuando ya te gradúes.":
    "Here you'll see job postings or internships depending on where you are in your internship: slots secured by your university, internships matching your major, or job postings once you graduate.",
  "Mi Progreso": "My Progress",
  "Sigue tus horas de práctica, tu pasantía activa, tus pagos y los cupos que tu universidad te asegure.":
    "Track your internship hours, your active internship, your payments, and the slots your university secures for you.",
  // La parada "Academia" del tour se reemplazó por "Mi institución" cuando esa
  // pestaña pasó a mostrar universidad/grupo/período en vez de contenido fijo.
  "Mi institución": "My institution",
  "Mira a qué universidad y grupo perteneces, en qué punto va tu período de prácticas y a quién escribirle en tu universidad.":
    "See which university and group you belong to, where your internship term stands, and who to contact at your university.",
  "Chatea con empresas y con tu universidad sobre tu práctica.":
    "Chat with companies and your university about your internship.",
  "Consulta tu certificación, tu CV, tus habilidades y ajusta tus preferencias.":
    "Check your certification, your resume, your skills, and adjust your preferences.",
  "Reencuentra a los estudiantes que finalizaron sus pasantías contigo y re-contáctalos para ofrecerles empleo.":
    "Reconnect with students who finished their internships with you and reach out to offer them a job.",
  "Consulta tu rango, tu plan, tu método de pago y tus estadísticas, y ajusta tus preferencias.":
    "Check your rank, your plan, your payment method, and your stats, and adjust your preferences.",
  "Consulta y edita los datos de tu institución, revisa tus estadísticas y ajusta tus preferencias.":
    "Review and edit your institution's information, check your stats, and adjust your preferences.",

  // ── Modal de método de pago (dashboard-empresa): vista de la tarjeta ya
  // registrada + gate de mejora de plan sin tarjeta ──
  "Registrar método de pago": "Register payment method",
  "Por seguridad solo guardamos los últimos 4 dígitos.":
    "For security, we only store the last 4 digits.",
  "Necesitas registrar un método de pago para mejorar tu plan.":
    "You need to register a payment method to upgrade your plan.",
  // ── Modal "Planes y Facturación": selección de plan + aviso de tarjeta ──
  "Seleccionado": "Selected",
  "Suscribirme a este plan": "Subscribe to this plan",
  "Selecciona un plan para continuar": "Select a plan to continue",
  "Falta tu método de pago": "Your payment method is missing",
  "Todavía no tienes una tarjeta registrada, así que no podemos cobrar la suscripción. Al aceptar te llevamos a registrarla y retomamos la compra apenas la guardes.":
    "You don't have a card on file yet, so we can't charge the subscription. Tap Accept and we'll take you to register one, then pick the purchase back up as soon as you save it.",
};

/**
 * Panel de administración (`app/admin/index.tsx`). Mismo mecanismo de seed:
 * traducción instantánea de toda la UI del panel (resumen, usuarios, reportes,
 * roles, logs, config, hero, bottom nav, modales).
 */
export const ADMIN_SEED_EN: Record<string, string> = {
  "Panel de administración": "Administration panel",
  "Control operativo y moderación": "Operations and moderation",
  "Administrador": "Administrator",
  // ── Backfill de alianzas/calificaciones (Configuración → Mantenimiento) ──
  "Recalcular alianzas y calificaciones": "Recalculate partnerships and ratings",
  "Recalculando…": "Recalculating…",
  "Recalcular": "Recalculate",
  "Va a revisar TODAS las pasantías de la plataforma y actualizar los perfiles de empresa/universidad. Puede tardar unos minutos. ¿Continuar?":
    "This will review ALL internships on the platform and update company/university profiles. It may take a few minutes. Continue?",
  "Recalcula, para todas las empresas y universidades, sus alianzas y el promedio de calificaciones de los estudiantes con los que trabajaron — alimenta \"Top Empresas/Universidades\" del Inicio. Úsalo una vez para que las pasantías aprobadas antes de este cambio también cuenten (las nuevas ya se registran solas); también sirve para recalcular todo si algo queda desincronizado. Es seguro repetirlo.":
    "Recalculates every company's and university's partnerships and the average rating of the students they worked with — this feeds the \"Top Companies/Universities\" section on the home screen. Run it once so internships approved before this change count too (new ones are recorded automatically); it also works to recalculate everything if something drifts out of sync. Safe to run more than once.",
  "Centro de control": "Control center",
  "Administra Gradly con una vista más clara y moderna": "Manage Gradly with a clearer, more modern view",
  "Abierto": "Open",
  "Abiertos": "Open",
  "Abre directamente el rol con perfiles pendientes de revisión.": "Opens the role with profiles pending review directly.",
  "Abrir auditoría": "Open audit log",
  "Abrir inbox": "Open inbox",
  "Abrir modulo": "Open module",
  "Abrir usuario": "Open user",
  "Accesos": "Access",
  "Accesos y administración.": "Access and administration.",
  "Acciones": "Actions",
  "Acciones rápidas": "Quick actions",
  "Actualizar": "Refresh",
  "Actualizar panel": "Refresh panel",
  "Administración": "Administration",
  "Ajustar permisos": "Adjust permissions",
  "Alertas y pendientes del sistema.": "System alerts and pending items.",
  "Aplicaciones": "Applications",
  "Aprobar": "Approve",
  "Auditoría": "Audit log",
  "Avisos de datos y permisos": "Data and permission notices",
  "Bandeja": "Inbox",
  "Bitácora": "Log",
  "Buscar por nombre, email, username…": "Search by name, email, username…",
  "Cargando acceso administrativo…": "Loading administrative access…",
  "Cargando permisos…": "Loading permissions…",
  "Cargando…": "Loading…",
  "Casos": "Cases",
  "Casos cerrados o concluidos.": "Closed or completed cases.",
  "Casos nuevos pendientes de revisión.": "New cases pending review.",
  "Casos que ya están siendo atendidos.": "Cases already being handled.",
  "Cerrar sesión": "Sign out",
  "Config": "Config",
  "Configuración": "Settings",
  "Consulta la bitácora reciente del panel y sus acciones.": "Review the panel's recent log and its actions.",
  "Control": "Control",
  "Cuentas que requieren atención administrativa.": "Accounts that require administrative attention.",
  "Departamento": "Department",
  "Descripción": "Description",
  "Detalle": "Detail",
  "Detalle del reporte": "Report detail",
  "Edita el mapa de accesos administrativos por rol.": "Edit the administrative access map by role.",
  "Editar": "Edit",
  "Editar perfil": "Edit profile",
  "En investigación": "Under investigation",
  "Estado operativo": "Operational status",
  "Filtro": "Filter",
  "Gestionar reportes": "Manage reports",
  "Gestión sobre la colección `usuarios`.": "Management of the `usuarios` collection.",
  "Inactivar": "Deactivate",
  "Inbox": "Inbox",
  "Incidencias": "Incidents",
  "Incidencias abiertas": "Open incidents",
  "Listado": "List",
  "Listado real de casos desde la colección `reportes`.": "Real list of cases from the `reportes` collection.",
  "Logs": "Logs",
  "Marcar leídas": "Mark as read",
  "Menú": "Menu",
  "Métricas migradas del panel operativo anterior.": "Metrics migrated from the previous operations panel.",
  "No hay reportes en estado abierto en este momento.": "There are no open reports at the moment.",
  "Nombre": "Name",
  "Notificaciones": "Notifications",
  "Nuevo": "New",
  "Operación de plataforma": "Platform operations",
  "Pendiente": "Pending",
  "Perfiles visibles": "Visible profiles",
  "Permisos": "Permissions",
  "Permisos no configurados": "Permissions not configured",
  "Permisos por rol (role_permissions).": "Permissions by role (role_permissions).",
  "Recargar": "Reload",
  "Reintentar acceso": "Retry access",
  "Reportes": "Reports",
  "Reportes abiertos": "Open reports",
  "Reportes abiertos recientes": "Recent open reports",
  "Reportes activos que siguen sin resolverse.": "Active reports still unresolved.",
  "Resueltos": "Resolved",
  "Resumen": "Overview",
  "Revisar pendientes": "Review pending",
  "Revisión pendiente": "Pending review",
  "Roles & permisos": "Roles & permissions",
  "Roles y permisos": "Roles and permissions",
  "Sesión": "Session",
  "Sin incidencias abiertas": "No open incidents",
  "Sin notificaciones": "No notifications",
  "Sin registros": "No records",
  "Sin reportes para este filtro": "No reports for this filter",
  "Sin resultados": "No results",
  "Sistema": "System",
  "Teléfono": "Phone",
  "Transacciones OK": "Transactions OK",
  "Usuario vinculado": "Linked user",
  "Usuarios": "Users",
  "Usuarios por rol": "Users by role",
  "Usuarios sincronizados desde Firestore.": "Users synced from Firestore.",
  "Vacantes publicadas": "Published job posts",
  "Ve a incidencias y entra directo a los casos recientes.": "Go to incidents and jump straight to recent cases.",
  "Vista rapida del panel operativo anterior, sin acciones destructivas.": "Quick view of the previous operations panel, no destructive actions.",
  "Volver a iniciar sesión": "Sign in again",
  "Últimas acciones registradas.": "Latest recorded actions.",
  "Activo": "Active",
  "Inactivo": "Inactive",
  "Admin": "Admin",
  "Estudiante": "Student",
  "General": "General",
  "Todos": "All",
  "Guardar": "Save",
  "Guardando...": "Saving...",
  "Hoy": "Today",
  "Hace 1 dia": "1 day ago",
  "Fecha no disponible": "Date unavailable",
  "No disponible": "Not available",
  "Sin correo": "No email",
  "Sin nombre": "No name",
  "Sin descripción adicional.": "No additional description.",
  "Casos de moderación que siguen abiertos.": "Moderation cases still open.",
  "Pagos o transacciones completadas correctamente.": "Payments or transactions completed successfully.",
  "Vacantes activas disponibles en plataforma.": "Active job posts available on the platform.",
  "Volumen general de aplicaciones registradas.": "Overall volume of registered applications.",
  // ── Modal de confirmación de acciones sensibles (banear/inactivar/eliminar) ──
  "Banear usuario": "Ban user",
  "Reactivar usuario": "Reactivate user",
  "Desbanear usuario": "Unban user",
  "Esta acción deshabilitará el acceso del usuario y registrará el motivo.":
    "This will disable the user's access and record the reason.",
  "Esta acción volverá a habilitar el acceso del usuario.":
    "This will re-enable the user's access.",
  "Banear": "Ban",
  "Reactivar": "Reactivate",
  "Desbanear": "Unban",
  "Motivo del baneo": "Ban reason",
  "Describe el motivo": "Describe the reason",
  "Eliminar usuario": "Delete user",
  "Se eliminará la cuenta de Auth y los documentos principales del usuario. Esta acción no se puede deshacer.":
    "This will delete the Auth account and the user's main documents. This action cannot be undone.",
  "Activar usuario": "Activate user",
  "Marcar usuario como pendiente": "Mark user as pending",
  "Inactivar usuario": "Deactivate user",
  "El usuario recuperará el acceso normal a la plataforma.":
    "The user will regain normal access to the platform.",
  "El usuario quedará marcado como pendiente de revisión.":
    "The user will be marked as pending review.",
  "El usuario no podrá iniciar sesión mientras su cuenta esté inactiva.":
    "The user won't be able to sign in while their account is inactive.",
  "Activar": "Activate",
  "Marcar pendiente": "Mark pending",
  // ── Microsección "Vacantes publicadas" (drill-down desde Operación de
  // plataforma), lista + detalle con todos los datos del documento ──
  "Publicaciones": "Listings",
  "Vacantes y pasantías": "Job posts and internships",
  "Listado real de publicaciones desde la colección `vacantes`.":
    "Real list of postings from the `vacantes` collection.",
  "Total publicadas": "Total published",
  "Vacantes y pasantías en la colección.": "Job posts and internships in the collection.",
  "Activas": "Active",
  "Visibles para estudiantes ahora mismo.": "Visible to students right now.",
  "Inactivas": "Inactive",
  "Pausadas o cerradas por la empresa.": "Paused or closed by the company.",
  "Buscar por título, empresa o área…": "Search by title, company or area…",
  "TIPO": "TYPE",
  "ESTADO": "STATUS",
  "Sin vacantes para este filtro": "No job posts for this filter",
  "Detalle de la publicación": "Posting detail",
  "Cupos, horario y salario": "Spots, schedule and salary",
  "Fechas": "Dates",
  "Ficha técnica completa": "Complete technical record",
  // ── Moderación de vacantes (botones Deshabilitar/Eliminar en la lista) ──
  "Deshabilitar": "Disable",
  "Deshabilitar publicación": "Disable posting",
  "Eliminar publicación": "Delete posting",
  "La empresa dueña verá el motivo y no podrá reactivarla ella misma; el resto de usuarios dejará de verla.":
    "The owning company will see the reason and won't be able to reactivate it themselves; every other user will stop seeing it.",
  "La empresa dueña verá el motivo. La publicación dejará de existir para todos, incluida la propia empresa.":
    "The owning company will see the reason. The posting will stop existing for everyone, including the company itself.",
  "Motivo de la deshabilitación": "Reason for disabling",
  "Motivo de la eliminación": "Reason for deleting",

  // ── Aprobación administrativa de la ficha de usuario (la nota de revisión
  //    que ahora sí queda guardada en el documento del usuario) ──
  "Aprobación administrativa": "Administrative approval",
  "Nota interna de revisión": "Internal review note",
  "Motivo, observación o criterio de aprobación": "Reason, note, or approval criteria",

  // ── Modales de aviso del panel (AvisoOverlay: éxito / advertencia / error).
  //    Reemplazan a los antiguos Alert.alert de un botón, así que todo este
  //    bloque es texto nuevo que antes no existía en la UI. ──
  "Listo, cambio aplicado": "Done, change applied",
  "Ya puede volver a entrar a Gradly con normalidad.": "They can log back into Gradly as usual.",
  "La cuenta queda en revisión. Su información sigue intacta mientras tanto.":
    "The account is under review. Their information stays untouched in the meantime.",
  "La cuenta queda inactiva y no podrá iniciar sesión. Puedes reactivarla cuando quieras desde esta misma ficha.":
    "The account is now inactive and cannot log in. You can reactivate it any time from this same record.",
  "No pudimos aplicar el cambio": "We couldn't apply the change",
  "El estado del usuario quedó como estaba. Revisa tu conexión e inténtalo de nuevo; si sigue igual, pásale el detalle de abajo al equipo técnico.":
    "The user's status was left as it was. Check your connection and try again; if it keeps failing, pass the details below to the tech team.",
  "Esta cuenta no necesita aprobación": "This account doesn't need approval",
  "El flujo de aprobación es solo para cuentas de empresa y universidad. Esta cuenta ya está lista para usarse tal como está.":
    "The approval flow only applies to company and university accounts. This one is ready to use as it is.",
  "Cuenta aprobada": "Account approved",
  "La institución ya puede usar Gradly con todas sus funciones.":
    "The institution can now use Gradly with all of its features.",
  "Cuenta de vuelta en revisión": "Account back under review",
  "Queda otra vez en la lista de pendientes, esperando una decisión.":
    "It's back on the pending list, waiting for a decision.",
  "Cuenta rechazada": "Account rejected",
  "Le avisamos que su solicitud no fue aprobada. Si fue un error, puedes volver a aprobarla desde esta misma ficha.":
    "We let them know their request wasn't approved. If that was a mistake, you can approve it again from this same record.",
  "No pudimos actualizar la aprobación": "We couldn't update the approval",
  "La solicitud quedó como estaba, así que puedes intentarlo otra vez sin miedo a duplicar nada.":
    "The request was left as it was, so you can try again without duplicating anything.",
  "No pudimos cambiar el rol": "We couldn't change the role",
  "El usuario conserva el rol que tenía. Vuelve a intentarlo en un momento.":
    "The user keeps the role they had. Try again in a moment.",
  "No pudimos guardar el permiso": "We couldn't save the permission",
  "El permiso quedó como estaba antes. Prueba de nuevo en unos segundos.":
    "The permission was left as it was. Try again in a few seconds.",
  "Las notificaciones siguen sin leer": "The notifications are still unread",
  "No logramos marcarlas como leídas. No se perdió ninguna: siguen ahí y puedes intentarlo otra vez.":
    "We couldn't mark them as read. None were lost: they're still there and you can try again.",
  "No pudimos guardar los cambios": "We couldn't save your changes",
  "Los datos que escribiste siguen en el formulario, así que no perdiste nada. Intenta guardar otra vez.":
    "What you typed is still in the form, so nothing was lost. Try saving again.",
  "Falta el motivo del baneo": "The ban reason is missing",
  "Escribe por qué se banea a esta persona antes de continuar. Ese motivo queda registrado y es lo que respalda la decisión más adelante.":
    "Write why this person is being banned before continuing. That reason is recorded and is what backs up the decision later on.",
  "Usuario baneado": "User banned",
  "Ya no puede acceder a Gradly y el motivo quedó registrado en su ficha. Si hace falta, puedes reactivarlo desde aquí mismo.":
    "They can no longer access Gradly and the reason is saved in their record. If needed, you can reactivate them right here.",
  "Usuario reactivado": "User reactivated",
  "Recuperó su acceso a la plataforma y puede volver a entrar cuando quiera.":
    "They got their access back and can log in again whenever they want.",
  "No pudimos banear al usuario": "We couldn't ban the user",
  "No pudimos reactivar al usuario": "We couldn't reactivate the user",
  "Nada cambió: la cuenta sigue exactamente como estaba. Vuelve a intentarlo en un momento.":
    "Nothing changed: the account is exactly as it was. Try again in a moment.",
  "Usuario eliminado": "User deleted",
  "Se borró la cuenta y sus documentos principales. Esta acción no se puede deshacer, así que si fue un error habrá que crear la cuenta de nuevo desde cero.":
    "The account and its main documents were deleted. This can't be undone, so if it was a mistake the account has to be created again from scratch.",
  "No pudimos eliminar la cuenta": "We couldn't delete the account",
  "La cuenta sigue existiendo tal como estaba. Revisa el detalle de abajo antes de volver a intentarlo: si la eliminación quedó a medias, el equipo técnico necesita ese texto.":
    "The account still exists just as it was. Check the details below before trying again: if the deletion was left halfway, the tech team needs that text.",
  "Publicación deshabilitada": "Posting disabled",
  "Ya no aparece para los estudiantes y la empresa puede ver el motivo. Puedes volver a habilitarla si se corrige.":
    "It no longer shows up for students and the company can see the reason. You can enable it again if it gets fixed.",
  "Publicación eliminada": "Posting deleted",
  "La publicación se borró de la plataforma. Esta acción no se puede deshacer.":
    "The posting was removed from the platform. This can't be undone.",
  "La moderación no se aplicó": "The moderation wasn't applied",
  "La publicación sigue como estaba, sin cambios. Puedes intentarlo otra vez sin repetir nada.":
    "The posting is unchanged. You can try again without repeating anything.",
  "Recálculo terminado": "Recalculation finished",
  "El recálculo no terminó": "The recalculation didn't finish",
  "Los datos quedaron como estaban, no se dañó nada. Puedes volver a lanzarlo cuando quieras.":
    "The data was left as it was, nothing was damaged. You can run it again whenever you want.",
  "Falta escribir la resolución": "The resolution is missing",
  "Cuenta en una línea cómo se resolvió el caso antes de cerrarlo. Eso es lo que queda registrado para futuras consultas.":
    "Write a line about how the case was resolved before closing it. That's what stays on record for future reference.",
  "Reporte cerrado": "Report closed",
  "El caso queda cerrado con tu resolución guardada en el historial.":
    "The case is closed with your resolution saved in the history.",
  "Reporte actualizado": "Report updated",
  "El caso cambió de estado. Sigue gestionándolo cuando tengas más información.":
    "The case changed status. Keep working on it when you have more information.",
  "No pudimos actualizar el reporte": "We couldn't update the report",
  "El caso sigue en el estado anterior y tu resolución no se perdió. Inténtalo de nuevo.":
    "The case is still in its previous status and your resolution wasn't lost. Try again.",
  "No pudimos cerrar la sesión": "We couldn't sign you out",
  "Sigues dentro del panel. Vuelve a tocar el botón; si insiste, cierra la pestaña y vuelve a entrar.":
    "You're still inside the panel. Tap the button again; if it persists, close the tab and log back in.",
  // ── Sección "Pasantías" (vista admin) — textos estáticos NO interpolados.
  //    Las etiquetas con valor dinámico ("Empresa: {nombre}", "Fechas: {a→b}",
  //    "Horas completadas: {n}") no se pueden sembrar como par fijo y quedan
  //    en la vía async normal. Las que ya vivían en otros bloques ('Grupo',
  //    'Grupos', 'Pasantía', 'Actualizar', 'Sin resultados', 'Certificada',
  //    'Finalizada', 'Pendiente', 'Rechazada', 'Activa(s)', 'Estudiante',
  //    'Sin carrera', 'Pasantías de grupo', 'ESTADO', 'Todas') no se repiten.
  "Pasantías": "Internships",
  "Operación": "Operations",
  "Visión unificada del flujo de pasantías: grupos (`solicitudes_practicas`) e individuales (`aplicaciones`).":
    "Unified view of the internship flow: group (`solicitudes_practicas`) and individual (`aplicaciones`).",
  "Buscar por grupo, carrera, estudiante o IDs…": "Search by group, major, student or IDs…",
  "ORIGEN": "SOURCE",
  "Individual": "Individual",
  "Individuales": "Individual",
  "Finalizadas": "Completed",
  "Pasantías en `solicitudes_practicas` (según filtros).": "Internships in `solicitudes_practicas` (per filters).",
  "Pasantías individuales (estado en `aplicaciones`).": "Individual internships (status in `aplicaciones`).",
  "Total": "Total",
  "Suma de ambas vistas.": "Sum of both views.",
  "Pasantías individuales": "Individual internships",
  "Estudiantes": "Students",
  "Pend. firma": "Pending signature",
  "Pasantía (grupo)": "Internship (group)",
  "Pasantía (individual)": "Internship (individual)",
  "Detalle técnico": "Technical details",
  "Todos los campos del documento, tal como están guardados en la base de datos.":
    "All the document's fields, exactly as stored in the database.",
};

/**
 * Reparto de cupos: disponibilidad horaria del estudiante, cupos y horario
 * declarado en la vacante, reclamo por lote, tablero de selección, áreas/tags
 * y editor de publicación.
 *
 * Se siembra aparte para que el flujo completo (empresa → universidad →
 * estudiante) esté traducido AL INSTANTE, sin depender de que la Cloud
 * Function responda: es el camino crítico del producto y un parpadeo en
 * español ahí se nota mucho más que en una pantalla secundaria.
 */
export const CUPOS_SEED_EN: Record<string, string> = {
  // ── Disponibilidad horaria (estudiante) ──
  "Mañana": "Morning",
  "Tarde": "Afternoon",
  "Noche": "Evening",
  "Entrada": "Start",
  "Salida": "End",
  "Elegir": "Choose",
  "Hora de entrada": "Start time",
  "Hora de salida": "End time",
  "Horario de la pasantía*": "Internship schedule*",
  "Horario": "Schedule",

  // ── Cupos (empresa) ──
  "Cupos disponibles*": "Available spots*",
  "Sin cupos": "No spots left",
  "Cupos asegurados": "Secured spots",
  "Aceptar reclamos de cupos automáticamente": "Automatically accept spot claims",
  "Rol o especialidad (opcional)": "Role or specialty (optional)",

  // ── Reclamo por lote (universidad) ──
  "Reservar cupos": "Reserve spots",
  "Postular grupo": "Submit group",
  "Mis reservas de cupos": "My spot reservations",
  "Liberar cupos": "Release spots",
  "Confirmado": "Confirmed",
  "Esperando empresa": "Awaiting company",
  "Grupo destino (opcional)": "Destination group (optional)",
  "¿Cuántos cupos necesitas?": "How many spots do you need?",
  "Reservar": "Reserve",
  "Solicitudes de cupos": "Spot requests",
  "Confirmar cupos": "Confirm spots",
  "Rechazar solicitud de cupos": "Reject spot request",
  "Cupos confirmados": "Spots confirmed",
  "Solicitud rechazada": "Request rejected",
  "Cupos liberados": "Spots released",
  "¡Cupos reservados!": "Spots reserved!",
  "Solicitud enviada": "Request sent",

  // ── Aviso de reserva al iniciar sesión (empresa) ──
  "Aceptar reserva": "Accept reservation",
  "Confirmar rechazo": "Confirm rejection",
  "Explica por qué no puedes recibir estos cupos": "Explain why you can't take these spots",
  "Esta reserva se aceptó automáticamente porque tu vacante admite reservas al instante. No necesitas hacer nada.":
    "This reservation was accepted automatically because your posting allows instant reservations. You don't need to do anything.",
  "Reserva confirmada": "Reservation confirmed",
  "Reserva rechazada": "Reservation rejected",
  "La universidad ya puede asignar estos cupos a sus estudiantes.": "The university can now assign these spots to its students.",
  "Se avisó a la universidad con tu motivo.": "The university was notified with your reason.",
  "No se pudo procesar": "Couldn't process it",
  "Intenta de nuevo desde tus solicitudes de cupos.": "Try again from your spot requests.",

  // ── Tarjetas de Inicio: pasantías por cupo (Fase D) ──
  "Pasantías por cupo": "Slot-based internships",
  "Pasantes por cupo": "Slot-based interns",
  "Sin fecha de inicio": "No start date yet",
  "Primer día por definir": "First day not set yet",
  // ── Currículum en el vistazo del perfil del estudiante ──
  "Currículum": "Résumé",
  "Ver CV": "View CV",
  "Descargar": "Download",
  "Sin currículum adjunto.": "No résumé attached.",
  // ── Modal de incidencia: validación + errores ──
  "No se pudo registrar la incidencia (permisos). Inténtalo de nuevo en un momento.":
    "The incident couldn't be recorded (permissions). Try again in a moment.",
  "La solicitud tardó demasiado. Revisa tu conexión e inténtalo de nuevo.":
    "The request took too long. Check your connection and try again.",
  "Elige sobre qué es el problema.": "Choose what the problem is about.",
  "Elige un motivo.": "Choose a reason.",
  "Describe brevemente el motivo.": "Briefly describe the reason.",
  "Cuéntanos un poco más: al menos 10 caracteres.": "Tell us a bit more: at least 10 characters.",

  // ── Cierre automático por horas (Fase E) ──
  "Día de práctica": "Practice day",
  "¡Culminaste tu pasantía!": "You finished your internship!",
  "Cumpliste todas tus horas de práctica. Tu universidad y la empresa ya fueron notificadas.":
    "You completed all your practice hours. Your university and the company have been notified.",
  "Estudiantes que culminaron su pasantía": "Students who finished their internship",
  "Estos estudiantes cumplieron todas sus horas de práctica.": "These students completed all their practice hours.",
  "Estudiante culminó su pasantía": "Student finished their internship",
  "Pasantía completada": "Internship completed",

  // ── Evaluación a 3 bandas al culminar (estudiante ↔ empresa ↔ universidad) ──
  "Calificar ahora": "Rate now",
  "¡Gracias por compartir tu evaluación!": "Thanks for sharing your review!",
  "Incidencias de esta práctica": "Incidents from this placement",
  "Cumpliste todas tus horas de práctica. Califica a la empresa donde trabajaste y a tu universidad.":
    "You completed all your practice hours. Rate the company you worked at and your university.",
  "Estos estudiantes cumplieron todas sus horas de práctica. Califícalos, evalúa a su universidad y envía el comprobante de finalización.":
    "These students completed all their practice hours. Rate them, review their university, and send the completion certificate.",
  "Estos estudiantes cumplieron todas sus horas de práctica. Califícalos y evalúa también a la empresa.":
    "These students completed all their practice hours. Rate them and the company too.",

  // ── Cierre del comprobante de finalización (constancia por cupo) ──
  "Tu comprobante está en camino": "Your certificate is on its way",
  "Comprobante de finalización en camino": "Completion certificate on its way",
  "Tu universidad y la empresa recibirán el comprobante que certifica que culminaste tu pasantía y cumpliste tus horas de práctica laboral. Mientras tanto, ya puedes explorar las vacantes de trabajo.":
    "Your university and the company will receive the certificate confirming you finished your internship and completed your work-practice hours. In the meantime, you can now browse job openings.",
  "Ponte en contacto con la empresa sobre la pronta recepción del comprobante de finalización. Cuando lo envíe, podrás revisarlo y validarlo desde tu inicio.":
    "Get in touch with the company about the upcoming completion certificate. Once they send it, you can review and validate it from your home screen.",
  "No se pudo abrir el chat": "Couldn't open the chat",
  "Escríbele a la empresa desde la sección Mensajes.": "Message the company from the Messages section.",
  "Comprobante de finalización": "Completion certificate",
  "Constancia de finalización de pasantía": "Internship completion certificate",
  "Detalle de la práctica": "Placement details",
  "Total de horas cumplidas": "Total hours completed",
  "Calculando…": "Calculating…",
  "Rol": "Role",
  "Horas cumplidas": "Hours completed",
  "Completa la constancia (opcional)": "Complete the certificate (optional)",
  "Área o departamento": "Area or department",
  "Ej. Desarrollo de software": "e.g. Software development",
  "Supervisor": "Supervisor",
  "Nombre de quien acompañó al estudiante": "Name of the person who guided the student",
  "Nota para la universidad": "Note for the university",
  "Comentario breve sobre el desempeño": "Brief comment on performance",
  "No se pudieron calcular las horas de la práctica. Revisa el grupo del estudiante antes de enviar.":
    "The placement hours couldn't be calculated. Check the student's group before sending.",
  "Toca un estudiante para calificarlo. Al terminar con uno, elige el siguiente.":
    "Tap a student to rate them. When you finish with one, pick the next.",
  "No se pudo guardar la evaluación (permisos). Inténtalo de nuevo en un momento.":
    "The review couldn't be saved (permissions). Try again in a moment.",
  "No se pudo enviar la evaluación. Inténtalo de nuevo.": "The review couldn't be sent. Try again.",
  "Permite las ventanas emergentes para ver el documento.":
    "Allow pop-ups to view the document.",
  "No se pudo abrir el documento.": "Couldn't open the document.",
  "Ver / descargar PDF": "View / download PDF",
  "Adjuntar mi PDF": "Attach my PDF",
  "PDF adjunto — reemplaza la constancia automática al enviar.":
    "PDF attached — it replaces the auto certificate when sent.",
  "Enviar a la universidad": "Send to the university",
  "Enviar más tarde": "Send later",
  "Comprobante enviado": "Certificate sent",
  "Tu universidad ya puede revisarlo y validarlo. Al validarlo, el proceso queda 100% culminado.":
    "Your university can now review and validate it. Once validated, the process is 100% complete.",
  "No se pudo generar el PDF": "Couldn't generate the PDF",
  "No se pudo adjuntar el archivo": "Couldn't attach the file",
  "No se pudo enviar": "Couldn't send it",
  "Inténtalo de nuevo.": "Try again.",
  // Notificaciones del ciclo del comprobante
  "Comprobante de pasantía recibido": "Internship certificate received",
  "Comprobante validado": "Certificate validated",
  "¡Pasantía validada!": "Internship validated!",
  "Pasantía culminada al 100%": "Internship 100% complete",

  // ── Tarjeta de estado del comprobante en el Inicio (3 roles) ──
  "Esperando que la empresa envíe tu comprobante de finalización.":
    "Waiting for the company to send your completion certificate.",
  "Tu comprobante fue enviado a tu universidad. Falta que lo valide.":
    "Your certificate was sent to your university. It still needs to be validated.",
  "Genera y envía el comprobante de finalización.": "Generate and send the completion certificate.",
  "Comprobante enviado. Esperando validación de la universidad.":
    "Certificate sent. Waiting for the university to validate it.",
  "Esperando el comprobante de la empresa.": "Waiting for the company's certificate.",
  "Comprobante recibido. Revísalo y valídalo.": "Certificate received. Review and validate it.",
  "Enviar comprobante": "Send certificate",
  "Corregir y reenviar": "Fix and resend",
  "Ver documento": "View document",
  "Validar": "Validate",
  "Validar comprobante": "Validate certificate",
  "Pasantía validada": "Internship validated",
  "Se acreditaron las horas y el proceso quedó culminado.":
    "The hours were credited and the process is complete.",
  "No se pudo validar": "Couldn't validate it",
  "No se pudo abrir el documento": "Couldn't open the document",

  // ── Modal al tocar la notificación del comprobante + feed post-culminación ──
  "Comprobante en revisión": "Certificate under review",
  "El comprobante de tu pasantía está en trámite. Sigue su avance desde la tarjeta de tu inicio.":
    "Your internship certificate is being processed. Track it from the card on your home screen.",
  "Tienes un comprobante de finalización por revisar y validar. Ábrelo desde la tarjeta de tu inicio.":
    "You have a completion certificate to review and validate. Open it from the card on your home screen.",
  "El comprobante fue enviado a la universidad. Falta que lo valide para cerrar el proceso.":
    "The certificate was sent to the university. It still needs to be validated to close the process.",
  "La universidad validó el comprobante de finalización. El proceso quedó 100% culminado.":
    "The university validated the completion certificate. The process is 100% complete.",
  "Culminaste tu pasantía. Ya puedes explorar las vacantes de trabajo; podrás postularte cuando tu universidad valide tu comprobante.":
    "You finished your internship. You can now browse job openings; you'll be able to apply once your university validates your certificate.",
  // Criterios nuevos (estudiante → universidad)
  "Acompañamiento y seguimiento": "Guidance and follow-up",
  "Gestión de la práctica": "Placement management",
  "Comunicación y respuesta": "Communication and responsiveness",
  // Criterios nuevos (empresa → universidad)
  "Calidad de los candidatos": "Quality of candidates",
  "Coordinación y logística": "Coordination and logistics",
  "Capacidad de respuesta": "Responsiveness",
  // Criterios nuevos (universidad → estudiante)
  "Desempeño en la práctica": "Performance during the placement",
  "Profesionalismo": "Professionalism",
  "Cumplimiento de horas y tareas": "Meeting hours and tasks",
  // Criterios nuevos (universidad → empresa)
  "Ambiente formativo": "Learning environment",
  "Acompañamiento al estudiante": "Support for the student",
  "Cumplimiento del acuerdo": "Adherence to the agreement",
  // Estados de incidencia mostrados en el panel de contexto
  "Abierta": "Open",
  "En seguimiento": "In progress",
  "Escalada": "Escalated",
  "Resuelta": "Resolved",

  // ── Inscripción por autoservicio a una pasantía (estudiante) ──
  "Estudiante inscrito": "Student enrolled",
  "Esta pasantía ya no tiene cupos disponibles.": "This internship has no spots left.",
  "Esta pasantía ya no está activa.": "This internship is no longer active.",
  "¡Ya estás en la pasantía!": "You're in the internship!",
  "Quedaste inscrito oficialmente. Tu universidad y la empresa ya fueron notificadas.":
    "You're officially enrolled. Your university and the company have been notified.",
  "Coordina con la empresa el día en que te presentas por primera vez: ese día arranca el conteo de tus horas. Si no escribes tú, la empresa lo fijará.":
    "Agree with the company on the day you first show up: that day starts your hour count. If you don't reach out, the company will set it.",
  "Escribir a la empresa": "Message the company",
  "Ahora no": "Not now",
  "Ir a Mi Progreso": "Go to My Progress",
  "No se pudo abrir el chat con la empresa.": "Couldn't open the chat with the company.",

  // ── Primer día del estudiante ("Día 1") — lo fija la empresa ──
  "El día que se presente por primera vez a la empresa cuenta como el Día 1. Desde ahí se cuentan sus horas de práctica.":
    "The day they first show up at the company counts as Day 1. Their practice hours are counted from there.",
  "Sin definir todavía": "Not set yet",
  "Establecer primer día": "Set first day",
  "Editar primer día": "Edit first day",
  "Coordinar por chat con el estudiante": "Coordinate by chat with the student",
  "Ver perfil del estudiante": "View student profile",
  "Primer día del estudiante": "Student's first day",
  "Primer día guardado": "First day saved",
  "No se pudo guardar": "Couldn't save",
  "Formato de fecha inválido (se espera aaaa-mm-dd).": "Invalid date format (expected yyyy-mm-dd).",
  "Primer día: por definir": "First day: to be set",

  // ── Aviso de inscripción al iniciar sesión (universidad / empresa) ──
  "Un estudiante": "A student",
  "Tus estudiantes se inscribieron": "Your students enrolled",
  "Estos estudiantes tomaron un cupo que reservaste. Ya están oficialmente en una pasantía.":
    "These students took a spot you reserved. They're now officially in an internship.",
  "Nuevos estudiantes en tus pasantías": "New students in your internships",
  "Estos estudiantes tomaron un cupo de tus vacantes. Ya cuentan como parte de tu pasantía.":
    "These students took a spot from your postings. They now count as part of your internship.",

  // ── Aviso de cupos al iniciar sesión (estudiante) ──
  "Tu universidad te reservó cupos": "Your university reserved spots for you",
  "Reservó estas plazas para tu grupo. Elige una desde tu tablero antes de que venza el plazo; si no eliges, el cupo pasa a otro compañero.":
    "It reserved these spots for your group. Choose one from your board before the deadline; if you don't, the spot goes to a classmate.",
  "Queda 1 cupo": "1 spot left",
  "Práctica": "Placement",

  // ── Tablero de selección (estudiante) ──
  "Cupos que tu universidad aseguró para ti": "Spots your university secured for you",
  "Tu práctica asignada": "Your assigned placement",
  "Elegir esta": "Choose this",
  "Cancelar mi cupo": "Cancel my spot",
  "Cancelar tu cupo": "Cancel your spot",
  "¡Cupo asegurado!": "Spot secured!",
  "No se pudo tomar el cupo": "Couldn't take the spot",
  "Vencido": "Expired",
  "Cupos de tu universidad": "Spots from your university",
  "Tu universidad reservó cupos para tu grupo, pero el plazo para elegir venció o tus compañeros ya los tomaron. Puedes buscar una pasantía por tu cuenta más abajo.":
    "Your university reserved spots for your group, but the selection window closed or your classmates already took them. You can look for an internship on your own below.",
  "Tu universidad tiene cupos reservados, pero asignados a otros grupos. Puedes buscar una pasantía por tu cuenta más abajo.":
    "Your university has reserved spots, but assigned to other groups. You can look for an internship on your own below.",

  // ── Editor de publicación (empresa) ──
  "Editar publicación": "Edit posting",
  "Guardar cambios": "Save changes",
  "¡Cambios guardados!": "Changes saved!",
  "No puedes cambiar el tipo": "You can't change the type",
  "Vacante actualizada": "Job post updated",

  // ── Áreas nuevas del catálogo ──
  "Administración": "Administration",
  "Comunicaciones": "Communications",
  "Construcción": "Construction",
  "Agroindustria": "Agribusiness",
  "Gastronomía": "Culinary",
  "Legal": "Legal",
  "Tecnología": "Technology",
  "Marketing": "Marketing",
  "Diseño": "Design",
  "Finanzas": "Finance",
  "Salud": "Health",
  "Educación": "Education",
  "Manufactura": "Manufacturing",
  "Otra": "Other",

  // ── Tags de rol ──
  "Desarrollo de software": "Software development",
  "Desarrollo web": "Web development",
  "Desarrollo móvil": "Mobile development",
  "Soporte técnico": "Technical support",
  "Redes e infraestructura": "Networks and infrastructure",
  "Bases de datos": "Databases",
  "QA y pruebas": "QA and testing",
  "Ciberseguridad": "Cybersecurity",
  "Datos y BI": "Data and BI",
  "Recursos humanos": "Human resources",
  "Operaciones": "Operations",
  "Logística": "Logistics",
  "Atención al cliente": "Customer service",
  "Asistencia administrativa": "Administrative assistance",
  "Gestión de proyectos": "Project management",
  "Redacción de contenido": "Content writing",
  "Community management": "Community management",
  "Producción audiovisual": "Audiovisual production",
  "Relaciones públicas": "Public relations",
  "Prensa": "Press",
  "Marketing digital": "Digital marketing",
  "Publicidad": "Advertising",
  "Investigación de mercado": "Market research",
  "Ventas": "Sales",
  "SEO y SEM": "SEO and SEM",
  "Diseño gráfico": "Graphic design",
  "UX/UI": "UX/UI",
  "Ilustración": "Illustration",
  "Motion graphics": "Motion graphics",
  "Diseño de producto": "Product design",
  "Contabilidad": "Accounting",
  "Auditoría financiera": "Financial auditing",
  "Impuestos": "Taxes",
  "Tesorería": "Treasury",
  "Análisis financiero": "Financial analysis",
  "Producción": "Production",
  "Control de calidad": "Quality control",
  "Mantenimiento": "Maintenance",
  "Seguridad industrial": "Industrial safety",
  "Diseño técnico (CAD)": "Technical design (CAD)",
  "Supervisión de obra": "Site supervision",
  "Diseño arquitectónico": "Architectural design",
  "Presupuestos": "Budgeting",
  "Topografía": "Surveying",
  "Producción agrícola": "Crop production",
  "Inocuidad alimentaria": "Food safety",
  "Pecuaria": "Livestock",
  "Cocina": "Cooking",
  "Pastelería": "Pastry",
  "Servicio": "Service",
  "Costos de alimentos": "Food costing",

  // ── Indicador "está escribiendo…" ──
  // El nombre va interpolado, así que no se puede sembrar la frase completa:
  // AutoText traducirá cada variante por su cuenta. Se siembran los sufijos
  // fijos por si la CF falla, y las variantes sin nombre.
  "Alguien está escribiendo…": "Someone is typing…",

  // ── Identidad + presencia en la cabecera del chat (ChatThread) ──
  // "Escribiendo…" es la versión corta que se muestra bajo el nombre del
  // contacto (a diferencia de "Alguien está escribiendo…"/"está
  // escribiendo…" de arriba, que van al pie de la lista de mensajes).
  // "Últ. vez {hora}" no se siembra: lleva la hora interpolada.
  "Escribiendo…": "Typing…",
  "En línea": "Online",
  "Desconectado": "Offline",

  // ── Renegociación del horario de una pasantía aprobada ──
  "Cambiar horario": "Change schedule",
  "Enviar cambio": "Send change",
  "Cambio de horario propuesto": "Schedule change proposed",
  "Aceptar cambio": "Accept change",
  "Cambio aplicado": "Change applied",
  "Horario actualizado": "Schedule updated",
  "La pasantía ya está aprobada: el cambio se aplica solo si la contraparte lo acepta. El pago pactado no se modifica.":
    "The internship is already approved: the change only applies if the other party accepts it. The agreed payment is not modified.",

  // ── Fork explícito Pasantía/Vacante + Modalidad de contrato + salario ──
  "Vacante": "Job opening",
  "Pasantía": "Internship",
  "Tiempo completo": "Full-time",
  "Medio tiempo": "Part-time",
  "Por proyecto": "Project-based",
  "Modalidad de contrato*": "Employment type*",
  "Selecciona la modalidad de contrato.": "Select the employment type.",
  "No puedes cambiar el tipo: ya hay cupos comprometidos con universidades.":
    "You can't change the type: there are already spots committed with universities.",
  "Rango salarial (opcional)": "Salary range (optional)",
  "Mínimo": "Minimum",
  "Máximo": "Maximum",
  "Salario mínimo inválido.": "Invalid minimum salary.",
  "Salario máximo inválido.": "Invalid maximum salary.",
  "El mínimo no puede ser mayor que el máximo.": "The minimum can't be greater than the maximum.",
  "El salario es informativo y queda a discreción tuya publicarlo. La negociación final de las condiciones económicas se realiza de forma privada entre la empresa y el postulante, fuera de Gradly.":
    "Salary is informational and it's up to you whether to publish it. Final negotiation of economic terms happens privately between the company and the applicant, outside Gradly.",
  "Salario estimado": "Estimated salary",
  "Informativo. La negociación final se realiza de forma privada entre la empresa y el postulante, fuera de Gradly.":
    "Informational. Final negotiation happens privately between the company and the applicant, outside Gradly.",
  "Horario*": "Schedule*",
  "Horario (opcional)": "Schedule (optional)",

  // ── Candidatos de una vacante (Detalles de Vacante) ──
  "Candidatos": "Candidates",
  "Todavía no hay candidatos admitidos.": "No candidates admitted yet.",
  "Dirección no especificada": "Address not specified",
  "está escribiendo…": "is typing…",
  "están escribiendo…": "are typing…",

  // ── Pestaña Jobs: 3 estados según situación de pasantía del estudiante ──
  "Disponible al graduarte": "Available once you graduate",
  "Otras pasantías para tu carrera": "Other internships for your major",
  "Sin pasantías disponibles todavía": "No internships available yet",
  "Aún no hay pasantías afines a tu carrera para autoservicio. Vuelve pronto, o espera a que tu universidad te asegure un cupo.":
    "There are no self-serve internships matching your major yet. Check back soon, or wait for your university to secure a slot for you.",
  "Gestionado por tu universidad": "Managed by your university",
  "Tu carrera requiere que la práctica la gestione tu universidad.":
    "Your major requires your internship to be managed by your university.",
  "Pulso del mercado laboral": "Job market pulse",
  "Vacantes activas por área, ahora mismo.": "Active job postings by area, right now.",
  "Aún no hay vacantes activas para mostrar.": "There are no active job postings to show yet.",
  "Esta pasantía ya no está disponible.": "This internship is no longer available.",
  "Esta publicación no es una pasantía.": "This listing is not an internship.",
  "Ya tienes una pasantía activa.": "You already have an active internship.",
  "Ya culminaste tu práctica o pasantía: puedes aplicar directamente a cualquier vacante disponible.":
    "You've already completed your internship: you can apply directly to any available job posting.",
  "Estás en tu pasantía activa. Puedes ver el mercado de vacantes para ubicarte, pero solo podrás aplicar cuando la culmines o te gradúes.":
    "You're in your active internship. You can browse the job market to get a sense of it, but you'll only be able to apply once you finish it or graduate.",
  "Todavía no inicias tu pasantía. Debajo verás los cupos que tu universidad ya te aseguró y pasantías de otras empresas a las que puedes aplicar por tu cuenta.":
    "You haven't started your internship yet. Below you'll see the slots your university already secured for you, plus internships from other companies you can apply to on your own.",

  // ── Avisos y confirmaciones del flujo cupos/matchmaking (AppAlert:
  //    showAlert / showConfirm). Antes eran Alert.alert, un no-op en web.
  //    Las que ya vivían en este bloque ('¡Cupo asegurado!', 'No se pudo
  //    tomar el cupo', 'Cancelar tu cupo', '¡Cupos reservados!', 'Solicitud
  //    enviada', 'Cupos liberados', 'Cupos confirmados', 'Solicitud
  //    rechazada', 'Listo') no se repiten. 'Entendido' y 'Cancelar' viven
  //    en AUTO_SEED_EN.
  "Confirmar": "Confirm",
  "Error": "Error",
  "No": "No",
  "Intenta de nuevo.": "Try again.",
  "No se pudo cancelar.": "Couldn't cancel.",
  "Sí, cancelar": "Yes, cancel",
  "Volverá a estar disponible para tus compañeros y tendrás que elegir otro. ¿Continuar?":
    "It'll go back to your classmates and you'll have to pick another one. Continue?",
  "Confirmar finalización": "Confirm completion",
  "¿Seguro que quieres notificar que has finalizado esta pasantía? La empresa deberá confirmar.":
    "Are you sure you want to report that you've finished this internship? The company will have to confirm.",
  "Sí, finalicé": "Yes, I finished",
  "No se pudo actualizar el estado.": "Couldn't update the status.",
  "Cantidad inválida": "Invalid amount",
  "Indica cuántos cupos necesitas.": "Enter how many spots you need.",
  "Sin suficientes cupos": "Not enough spots",
  "No se pudo reservar": "Couldn't reserve",
  "Vuelven a estar disponibles y se avisó a la empresa.":
    "They're available again and the company was notified.",
  "No se pudo liberar.": "Couldn't release.",
  "Selecciona un grupo": "Select a group",
  "¡Postulación enviada!": "Application sent!",
  "La empresa revisará a tu grupo.": "The company will review your group.",
  "No se pudo postular": "Couldn't apply",
  "¡Pasantía confirmada!": "Internship confirmed!",
  "Oferta rechazada": "Offer rejected",
  "Límite de alianzas alcanzado": "Partnership limit reached",
  "Oferta enviada a la universidad.": "Offer sent to the university.",
  "Motivo requerido": "Reason required",
  "Grupo rechazado.": "Group rejected.",
  "No se pudo procesar.": "Couldn't process.",

  // ── "Reportar pasantía" (Matchmaking universidad → reporte al admin) +
  //    bloque "Afinidad con tus carreras" del detalle de vacante + grupo
  //    destino obligatorio al reservar cupos. 'Fraude o estafa', 'Otro',
  //    'Reporte enviado', 'Cerrar', 'Motivo', 'Descripción (opcional)',
  //    'Enviar reporte', 'Cancelar', 'Selecciona un motivo.', 'No se pudo
  //    enviar el reporte.' y 'Selecciona un grupo' ya están sembradas.
  "Información falsa o engañosa": "False or misleading information",
  "Contenido inapropiado u ofensivo": "Inappropriate or offensive content",
  "Requisitos o condiciones abusivas": "Abusive requirements or terms",
  "Empresa sospechosa o no verificable": "Suspicious or unverifiable company",
  "Publicación duplicada o spam": "Duplicate posting or spam",
  "Reportar pasantía": "Report internship",
  "Reportar Pasantía": "Report Internship",
  "Gracias. Nuestro equipo administrativo revisará esta pasantía.":
    "Thank you. Our admin team will review this internship.",
  "Describe brevemente el problema con esta pasantía…":
    "Briefly describe the problem with this internship…",
  "No se pudo identificar la pasantía.": "Couldn't identify the internship.",
  "Pasantía a reportar no válida.": "Invalid internship to report.",
  "Sesión no válida.": "Invalid session.",
  "Afinidad con tus carreras": "Fit with your majors",
  "sin especificar": "not specified",
  "Afín": "Related",
  "Puede encajar": "May fit",
  "Sin relación aparente": "No apparent relation",
  "El área es lo que declaró la empresa y no siempre refleja su necesidad exacta. Puedes reservar cupos para el grupo que consideres, aunque el área no coincida.":
    "The area is what the company declared and doesn't always reflect its exact need. You can reserve slots for whichever group you see fit, even if the area doesn't match.",
  "Grupo destino": "Target group",
  "El área de la vacante no coincide con la carrera de este grupo. Puedes reservar igual.":
    "The job's area doesn't match this group's major. You can reserve anyway.",
  "Elige a qué grupo de estudiantes asignarás estos cupos.":
    "Choose which student group you'll assign these slots to.",
};

// ── Onboarding de dirección del estudiante (UbicacionSelector,
// OnboardingDireccionModal) ── ver [[project_reparto_cupos]] Fase 9.1.
export const UBICACION_SEED_EN: Record<string, string> = {
  "Departamento*": "Department*",
  "Distrito*": "District*",
  "Buscar distrito…": "Search district…",
  "Dirección específica (opcional)": "Specific address (optional)",
  "Colonia, calle, referencia…": "Neighborhood, street, landmark…",
  "Un último paso": "One last step",
  "¡Bienvenido/a a Gradly!": "Welcome to Gradly!",
  "¿Dónde vivís?": "Where do you live?",
  "Nos falta tu ubicación para mostrarte a empresas y universidades cercanas a vos. Es obligatorio completarlo una sola vez.":
    "We're missing your location to show you nearby companies and universities. It's mandatory to complete this once.",
  "Como sos usuario nuevo, antes de llevarte a tu nuevo perfil necesitamos que completes este dato. Nos ayuda a mostrarte empresas y universidades cercanas a vos, y solo se pide una vez.":
    "Since you're a new user, before taking you to your new profile we need you to complete this. It helps us show you nearby companies and universities, and it's only asked once.",
  "Guardar y continuar": "Save and continue",
  "Elige tu departamento y distrito para continuar.": "Choose your department and district to continue.",
  "No se pudo guardar. Verifica tu conexión e intenta de nuevo.": "Couldn't save. Check your connection and try again.",
  "Habilidades (opcional)": "Skills (optional)",
  "Contanos brevemente sobre vos…": "Tell us briefly about yourself…",
  "Ej: Excel, atención al cliente…": "E.g: Excel, customer service…",
};

// ── Eliminar vacante/grupo/estudiante (empresa y universidad deshacen su
// propia carga antes de que quede ligada a algo real) + botón "Ver perfil
// público" del panel admin + aviso de grupo cubierto en Matchmaking ──
export const GESTION_SEED_EN: Record<string, string> = {
  "Ver perfil público": "View public profile",
  "Eliminar vacante": "Delete job posting",
  "Eliminar grupo": "Delete group",
  "Eliminar estudiante": "Delete student",
  "No se pudo eliminar": "Couldn't delete",
  "Eliminar": "Delete",
  "Listo": "Done",
  "Grupo ya cubierto": "Group already covered",
  // ── Aviso a la empresa cuando un admin modera una de sus publicaciones
  // (ModeracionVacanteModal/Gate) ──
  "Tu publicación fue eliminada": "Your posting was deleted",
  "Tu publicación fue deshabilitada": "Your posting was disabled",
  "Para más información, ponte en contacto con el administrador que tomó esta decisión.":
    "For more information, contact the administrator who made this decision.",
  "Deshabilitada por admin": "Disabled by admin",
};

// ── Barra de progreso funcional (Grupos Creados/Estudiantes Registrados/
// Prácticas) + bloqueo de doble compromiso de un grupo entre los 3 flujos
// que confirman una pasantía (Matchmaking/Ofrecer a Empresa/Chat) ──
export const PROGRESO_SEED_EN: Record<string, string> = {
  "Progreso de la pasantía": "Internship progress",
  "Progreso": "Progress",
  "Sin calificación aún": "No rating yet",
  "Este grupo ya tiene una pasantía aprobada con otra empresa y no puede comprometerse con una nueva hasta que esa termine.":
    "This group already has an approved internship with another company and can't commit to a new one until that one ends.",
  "Este acuerdo ya fue firmado.": "This agreement has already been signed.",
  "Aún ningún estudiante ha elegido este cupo": "No student has picked this spot yet",
};

// ── Tarjeta "Resumen general" del Inicio (EmpresaHomeCards.tsx /
// UniversidadHomeCards.tsx): etiquetas de las 6 estadísticas de cada
// dashboard. Sin sembrar, dependían por completo de la traducción asíncrona
// (Google Translate) — cuando esa llamada fallaba quedaban "pegadas" en
// español para siempre (el fallo se cachea, ver translationService.ts). ──
export const RESUMEN_HOME_SEED_EN: Record<string, string> = {
  // Insignia de plan (dashboard-empresa): rama "premium" del mismo ternario
  // cuya rama "Plan Básico" ya vivía en AUTO_SEED_EN.
  "⭐ Premium": "⭐ Premium",
  // EmpresaHomeCards
  "Vacantes activas": "Active job posts",
  "Aplic. pendientes": "Pending applications",
  "Pasantes activos": "Active interns",
  "Horas validadas": "Validated hours",
  "Universidades aliadas": "Partner universities",
  "Empresas aliadas": "Partner companies",
  "Mejores estudiantes que trabajaron aquí": "Top-rated students who worked here",
  "Mejores estudiantes de esta universidad": "Top-rated students from this university",
  // UniversidadHomeCards
  "Estudiantes activos": "Active students",
  "Egresados": "Graduates",
  "Instituciones afiliadas": "Affiliated companies",
  "Grupos": "Groups",
  "En pasantía": "In internship",
  "Horas aprobadas": "Approved hours",

  // ── Pestaña "Análisis" de las mismas dos tarjetas: títulos de sección y
  // estados vacíos. Igual que arriba, sin sembrar dependían de la
  // traducción asíncrona y podían quedar "pegados" en español. ──
  "Análisis": "Analysis",
  // EmpresaHomeCards
  "Estado de las aplicaciones": "Application status",
  "Aún no hay aplicaciones.": "No applications yet.",
  "Vacantes por área": "Job posts by area",
  "Aún no has publicado vacantes.": "You haven't posted any job openings yet.",
  "Pasantías de grupo activas": "Active group internships",
  "No hay pasantías de grupo en curso.": "No group internships in progress.",
  // UniversidadHomeCards
  "Estado de las pasantías de grupo": "Group internship status",
  "Aún no hay pasantías de grupo.": "No group internships yet.",
  "Carreras con más pasantías": "Majors with the most internships",
  "Sin datos suficientes.": "Not enough data yet.",
  "Pasantías activas": "Active internships",
  "No hay pasantías en curso.": "No internships in progress.",
  // Nombre de grupo (fallback cuando no hay grupoNombre) y línea de progreso
  // con fecha, compuesta a mano en el componente (ver useAutoText ahí) porque
  // trae valores dinámicos (fechas/números) que no se pueden sembrar enteros.
  "Grupo": "Group",
  "Inicia": "Starts",
  "Día": "Day",
  "de": "of",
  // Leyendas de los gráficos de pastel (react-native-chart-kit): las dibuja
  // react-native-svg directamente, fuera del árbol de AutoText, así que el
  // componente las traduce a mano con useAutoText antes de pasarlas a
  // `pieData` — igual necesitan vivir aquí para resolver al instante.
  "Contratados": "Hired",
  "En revisión": "Under review",
  "Rechazados": "Rejected",
  "En curso": "In progress",
  "Por iniciar": "Not started",
  "Completadas": "Completed",
};

// ── Modales de detalle abiertos al tocar una notificación (vacante, grupo,
// postulación de grupo, reclamo de cupos) — FloatingTopBar.tsx +
// GrupoDetailViewerModal/AplicacionGrupoDetailModal/ReclamoDetailModal. ──
export const NOTIF_MODALES_SEED_EN: Record<string, string> = {
  // GrupoDetailViewerModal
  "No se encontró este grupo.": "This group was not found.",
  "🎓 Egresado": "🎓 Graduated",
  "Información del grupo": "Group information",
  "Universidad": "University",
  "No disponible": "Not available",
  "Carrera": "Major",
  "No especificada": "Not specified",
  "Categoría": "Category",
  "No determinada": "Not determined",
  "Horas a cumplir": "Hours to complete",
  "No especificado": "Not specified",
  "Docente encargado": "Assigned instructor",
  "Alianza con empresa": "Company partnership",
  "Pasantía activa": "Active internship",
  "Sin alianza activa": "No active partnership",
  "Miembros del grupo": "Group members",
  "Aún no hay estudiantes registrados en este grupo.": "No students registered in this group yet.",
  "Sin carrera": "No major",

  // AplicacionGrupoDetailModal
  "Postulación de grupo": "Group application",
  "No se encontró esta postulación.": "This application was not found.",
  "Pendiente de revisión": "Pending review",
  "Oferta enviada · esperando respuesta": "Offer sent · awaiting reply",
  "Pasantía confirmada": "Internship confirmed",
  "Rechazada": "Rejected",
  "Motivo del rechazo": "Reason for rejection",
  "Universidad y grupo": "University and group",
  "Sin nombre": "No name",
  "Empresa": "Company",
  "Detalles de la pasantía": "Internship details",
  "Horas requeridas": "Required hours",
  "Estudiantes del grupo": "Students in the group",
  "Período": "Period",
  "Horario": "Schedule",
  "Ver vacante completa": "View full job post",

  // ReclamoDetailModal
  "Reclamo de cupos": "Spot request",
  "No se encontró este reclamo.": "This request was not found.",
  "Pendiente de confirmación": "Pending confirmation",
  "Cupos confirmados": "Spots confirmed",
  "Rechazado": "Rejected",
  "Liberado": "Released",
  "Sin asignar todavía": "Not assigned yet",
  "Cupos reclamados": "Requested spots",
  "Cantidad vigente": "Current amount",
  "Ya elegidos por estudiantes": "Already picked by students",
};

export default AUTO_SEED_EN;

// ── Incidencias de práctica (BandejaIncidencias.tsx / ReportarIncidenciaModal.tsx).
// El catálogo MOTIVOS_INCIDENCIA vive en incidenciaService.ts como texto en
// español (es el valor que se guarda en Firestore, no una clave), así que se
// dibuja con AutoText y necesita siembra: sin ella dependería por completo de
// la traducción por red y quedaría en español si esa llamada falla —el fallo
// se cachea, ver translationService.ts—. La descripción que escribe el propio
// estudiante NO se siembra: es texto libre, imposible de conocer de antemano. ──
export const INCIDENCIAS_SEED_EN: Record<string, string> = {
  "No me asignaron tareas": "I was not assigned any tasks",
  "Horario distinto al acordado": "Schedule differs from what was agreed",
  "Falta de supervisor o acompañamiento": "No supervisor or guidance",
  "Condiciones inseguras": "Unsafe conditions",
  "Trato inadecuado": "Inappropriate treatment",
  "Mis horas no se están registrando": "My hours are not being recorded",
  "Problema con la plataforma": "Problem with the platform",
  "Otro": "Other",
};

// ── Rediseño de la sección "Reclutamiento" del dashboard empresa
// (SeccionReclutamiento.tsx y, en fases siguientes, sus modales de contratar/
// rechazar/despedir/tareas). Se van acumulando aquí las frases nuevas de cada
// fase para que el inglés sea instantáneo (sin esperar la traducción por red),
// según la regla del proyecto: toda UI nueva siembra sus textos. Las claves
// que ya viven en AUTO_SEED_EN ("Contratado", "Vacante", "Vacantes", "Volver",
// "Descripción", "Ubicación") NO se repiten aquí. ──
export const RECLUTAMIENTO_SEED_EN: Record<string, string> = {
  // Fase 1 — cascarón: pestañas, filtros, tarjetas y microsección.
  "En reclutamiento": "Recruiting",
  "Puestos": "Positions",
  "Todos los contratados": "All hires",
  "Puesto": "Position",
  "postulantes": "applicants",
  "contratados": "hired",
  "Skills requeridas": "Required skills",
  "Fecha límite:": "Deadline:",
  "Cupos disponibles:": "Open spots:",
  "Cupos: sin límite declarado": "Spots: no declared limit",
  "Ver perfil": "View profile",
  "No hay vacantes de empleo abiertas. Publica una desde \"Mis Vacantes\".":
    "No open job vacancies. Post one from \"My Vacancies\".",
  "Aún no has contratado a nadie. Cuando lo hagas, el puesto cubierto aparecerá aquí.":
    "You haven't hired anyone yet. Once you do, the filled position will appear here.",
  "Todavía no hay contratados.": "No hires yet.",
  "Este puesto no tiene contratados.": "This position has no hires.",
  "Todavía nadie se ha postulado a esta vacante.": "No one has applied to this vacancy yet.",
  "Revisa tus vacantes de empleo y sus postulantes. Cada vacante muestra cuántos graduados se postularon; ábrela para ver el detalle, contratar o descartar. La pestaña \"Contratado\" reúne los puestos ya cubiertos.":
    "Review your job vacancies and their applicants. Each vacancy shows how many graduates applied; open it to see the details, hire, or reject. The \"Hired\" tab gathers the positions already filled.",

  // Fase 2 — listado de candidatos: filtros, privilegios, y acciones
  // (rechazar / contratar / cerrar vacante) + modal de postulación rechazada.
  "Todos": "All",
  "Ex-pasantes": "Former interns",
  "Mejor calificados": "Top rated",
  "Cumple con": "Meets",
  "Hizo su pasantía con nuestra empresa": "Did their internship with our company",
  "Cerrar vacante": "Close vacancy",
  "Cerrar la vacante": "Close the vacancy",
  "Ningún postulante coincide con este filtro.": "No applicant matches this filter.",
  "Rechazar": "Reject",
  "Contratar": "Hire",
  "Ver CV": "View CV",
  "Abrir en navegador": "Open in browser",
  "Rechazar postulación": "Reject application",
  "Explica por qué no fue seleccionado; el estudiante verá este motivo en sus notificaciones.":
    "Explain why they weren't selected; the student will see this reason in their notifications.",
  "Motivo del rechazo (mín. 10 caracteres)": "Reason for rejection (min. 10 characters)",
  "Escribe un motivo de al menos 10 caracteres.": "Write a reason of at least 10 characters.",
  "No se pudo rechazar. Intenta de nuevo.": "Couldn't reject. Try again.",
  "Confirmar rechazo": "Confirm rejection",
  "Confirmar contratación": "Confirm hiring",
  "Vas a contratar a:": "You're about to hire:",
  "Con esta contratación se cubren los cupos: el resto de postulantes quedarán descartados (con aviso de agradecimiento) y la vacante se cerrará.":
    "This hire fills the open spots: the remaining applicants will be dismissed (with a thank-you notice) and the vacancy will close.",
  "No se pudo completar la contratación.": "Couldn't complete the hiring.",
  "La vacante quedará cerrada con los contratados que ya tienes. El resto de postulantes serán descartados con un aviso de agradecimiento. No se puede reabrir.":
    "The vacancy will be closed with the hires you already have. The remaining applicants will be dismissed with a thank-you notice. It cannot be reopened.",
  "No se pudo cerrar la vacante.": "Couldn't close the vacancy.",
  // PostulacionRechazadaModal (lo ve el estudiante desde su campana).
  "Postulación no seleccionada": "Application not selected",
  "No se encontró esta postulación.": "This application was not found.",
  "Tu postulación no fue seleccionada esta vez.": "Your application wasn't selected this time.",
  "Motivo de la empresa": "Company's reason",
  "No te desanimes: sigue habiendo vacantes abiertas. Revisa las oportunidades y postúlate a las que encajen con tu carrera y tus skills.":
    "Don't be discouraged: there are still open vacancies. Check the opportunities and apply to the ones that fit your degree and your skills.",

  // Fase 3 — microsección del puesto contratado (lado empresa): horario,
  // tareas, empleados, reportar / advertir / despedir + modal de aviso.
  "Skills del puesto": "Position skills",
  "Horario laboral:": "Work schedule:",
  "Sin horario laboral declarado.": "No work schedule declared.",
  "Compañeros": "Coworkers",
  "Tareas": "Tasks",
  "Asignar tarea": "Assign task",
  "Sin tareas asignadas.": "No tasks assigned.",
  "Para todos": "For everyone",
  "A todos": "Everyone",
  "completadas": "completed",
  "empleado": "employee",
  "empleados": "employees",
  "reporte": "report",
  "reportes": "reports",
  "advertencia": "warning",
  "advertencias": "warnings",
  "Reportar": "Report",
  "Despedir": "Dismiss",
  "Reportar empleado": "Report employee",
  "El administrador revisará este reporte. El empleado recibe un aviso.":
    "The administrator will review this report. The employee gets a notice.",
  "Detalle (opcional)": "Details (optional)",
  "Enviar reporte": "Send report",
  "Selecciona un motivo.": "Select a reason.",
  "No se pudo enviar el reporte.": "Couldn't send the report.",
  "Este empleado acumula 3 reportes": "This employee has 3 reports",
  "Entendido": "Got it",
  "Ir a despedir": "Go to dismiss",
  "Finalizar contrato": "End contract",
  "Escribe el motivo. Puedes enviarlo solo como advertencia, o finalizar el contrato definitivamente (no se reabre).":
    "Write the reason. You can send it as a warning only, or end the contract permanently (it won't reopen).",
  "Motivo (mín. 5 caracteres)": "Reason (min. 5 characters)",
  "Escribe el motivo (mín. 5 caracteres).": "Write the reason (min. 5 characters).",
  "Enviar solo como advertencia": "Send as a warning only",
  "Despedir definitivamente": "Dismiss permanently",
  "No se pudo completar la acción.": "Couldn't complete the action.",
  "advertencia enviada": "warning sent",
  "advertencias enviadas": "warnings sent",
  "Asignar tarea ": "Assign task ",
  "Título de la tarea": "Task title",
  "La tarea necesita un título.": "The task needs a title.",
  "¿A quién se la asignas?": "Who do you assign it to?",
  "No hay empleados a los que asignar.": "No employees to assign to.",
  "No se pudo asignar la tarea.": "Couldn't assign the task.",
  "Asignar": "Assign",
  // ContratoAvisoModal (lo ve el destinatario del reporte / advertencia / despido).
  "Aviso del contrato": "Contract notice",
  "Reporte de tu empresa": "Report from your company",
  "Advertencia": "Warning",
  "Contrato finalizado": "Contract ended",
  "Renuncia recibida": "Resignation received",
  "No hay un aviso para mostrar.": "There is no notice to show.",
  "Motivo": "Reason",
  "Tu contrato quedó anulado. En \"Mi Progreso\" no verás un puesto activo hasta que vuelvas a ser contratado.":
    "Your contract has been voided. In \"My Progress\" you won't see an active position until you're hired again.",

  // Fase 4 — "Puesto de trabajo" del estudiante en "Mi Progreso".
  "Puesto de trabajo": "Job position",
  "Pasantía culminada": "Completed internship",
  "Mi institución": "My institution",
  "Mi calendario": "My calendar",
  "Empresa que me contrató": "Company that hired me",
  "Fecha de inicio": "Start date",
  "Puesto único: no tienes compañeros en esta plaza.": "Single position: you have no coworkers here.",
  "No tienes un puesto de trabajo activo. Cuando una empresa te contrate, aquí verás los detalles del puesto.":
    "You don't have an active job position. When a company hires you, you'll see the position details here.",
  "Este puesto no tiene un horario laboral declarado.": "This position has no declared work schedule.",
  "La empresa aún no te asignó tareas.": "The company hasn't assigned you any tasks yet.",
  "Completada": "Completed",
  "Marcar": "Mark",
  "Renunciar al puesto": "Resign from the position",
  "Escribe el motivo. Puedes enviarlo solo como aviso a la empresa, o renunciar definitivamente (el contrato se anula y no se reabre).":
    "Write the reason. You can send it as a notice to the company only, or resign permanently (the contract is voided and won't reopen).",
  "Enviar solo como aviso a la empresa": "Send as a notice to the company only",
  "Renunciar definitivamente": "Resign permanently",
  "Aviso de un empleado": "Notice from an employee",
  "Un empleado renunció": "An employee resigned",

  // Fase 5 — Recontratar pasantes + ofertas de empleo.
  "Por vacantes": "By vacancy",
  "Recontratar pasantes": "Rehire interns",
  "Estudiantes que ya culminaron su pasantía contigo, ordenados por calificación. Contrátalos directo a una vacante afín a su carrera.":
    "Students who already completed an internship with you, sorted by rating. Hire them straight into a vacancy that fits their degree.",
  "Aún no tienes ex-pasantes disponibles para recontratar.": "You don't have any former interns available to rehire yet.",
  "Aceptó tu oferta de empleo": "Accepted your job offer",
  "Contratar a un ex-pasante": "Hire a former intern",
  "Elige la vacante bajo la cual quedará contratado.": "Choose the vacancy they'll be hired under.",
  "No tienes vacantes de empleo abiertas.": "You have no open job vacancies.",
  "No se pudo contratar.": "Couldn't hire.",
  "Elige una vacante.": "Choose a vacancy.",
  // OfertaEmpleoModal (estudiante)
  "Oferta de empleo": "Job offer",
  "No se encontró esta oferta.": "This offer was not found.",
  "Horario": "Schedule",
  "Ya aceptaste esta oferta. La empresa confirmará la contratación.":
    "You already accepted this offer. The company will confirm the hire.",
  "Ya rechazaste esta oferta.": "You already declined this offer.",
  "Motivo del rechazo": "Reason for declining",
  "Cuéntale a la empresa por qué (mín. 5 caracteres)": "Tell the company why (min. 5 characters)",
  "Chatear con la empresa": "Chat with the company",
  "Aceptar oferta": "Accept offer",
  "No se pudo enviar la respuesta.": "Couldn't send your response.",
  // OfertaRespondidaModal (empresa)
  "Respuesta a tu oferta": "Response to your offer",
  "Oferta aceptada": "Offer accepted",
  "Oferta rechazada": "Offer declined",
  "aceptó tu oferta para": "accepted your offer for",
  "rechazó tu oferta para": "declined your offer for",
  "Para completar la contratación, ve a Reclutamiento → \"Recontratar Pasantes\" y pulsa Contratar en su tarjeta.":
    "To complete the hire, go to Recruitment → \"Rehire Interns\" and tap Hire on their card.",
  "Ir a mi panel": "Go to my dashboard",
  // OfertarEmpleoModal (empresa, desde Historial de Pasantes)
  "Ofertar empleo": "Offer a job",
  "Oferta enviada. El estudiante la verá en sus notificaciones y podrá aceptarla o rechazarla.":
    "Offer sent. The student will see it in their notifications and can accept or decline it.",
  "No tienes vacantes de empleo abiertas para ofrecer.": "You have no open job vacancies to offer.",
  "Elige la vacante a ofrecer": "Choose the vacancy to offer",
  "No se pudo identificar al estudiante.": "Couldn't identify the student.",
  "No se pudo enviar la oferta.": "Couldn't send the offer.",
  "Enviar oferta": "Send offer",
  "Re-contactar": "Re-contact",

  // Fase 6 — tarjeta "Trabaja para tu empresa" + "Añadir tarea" en la vista
  // de perfil del contratado.
  "Trabaja para tu empresa": "Works for your company",
  "Desde": "Since",
  "Añadir tarea": "Add task",
  "Tarea asignada. El empleado la verá en \"Mi Progreso\" y podrá marcarla completada.":
    "Task assigned. The employee will see it in \"My Progress\" and can mark it complete.",
};
