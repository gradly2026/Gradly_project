// ════════════════════════════════════════════════════════════════════════
// notifRoute.ts
//
// QUÉ ES ESTE ARCHIVO:
// Cuando el usuario TOCA una notificación (en la campanita 🔔 de
// FloatingTopBar.tsx), la app tiene que decidir "¿y ahora qué pantalla le
// muestro?". Ese texto se guarda en el documento de la notificación bajo
// el campo `link_accion` (ver src/services/notificationService.ts), pero
// puede tener 3 formatos MUY distintos:
//
//   1. Una ruta directa, ej: "/mensajes"           → navegar ahí tal cual.
//   2. Una referencia estructurada, ej: "vacante:abc123"
//      → significa "abre el MODAL de detalle de la vacante con id abc123"
//        (no es una ruta de navegación, es una instrucción para abrir un
//        modal encima de la pantalla actual).
//   3. Un ID suelto sin ningún prefijo, ej: "abc123"
//      → notificaciones más viejas del proyecto, antes de que existiera
//        el formato "kind:id"; se interpretan como "llévame a mensajes".
//
// Este archivo son 2 funciones "traductoras" puras (sin efectos
// secundarios, sin llamadas a Firebase) que reciben ese texto guardado y
// devuelven una instrucción clara para quien las use.
// ════════════════════════════════════════════════════════════════════════

/** Tipos de entidad reconocidos en una referencia estructurada "kind:id". */
export type NotifRefKind =
  | 'vacante'
  | 'grupo'
  | 'aplicacionGrupo'
  | 'reclamo'
  | 'comprobante'
  | 'postulacionRechazada'
  | 'contratoAviso';
// Tipo de TypeScript que limita `kind` a exactamente estos valores de
// texto posibles. Cada uno corresponde a un modal de detalle distinto:
//   'vacante'              → VacanteDetailByIdModal.tsx
//   'grupo'               → GrupoDetailViewerModal.tsx
//   'aplicacionGrupo'     → AplicacionGrupoDetailModal.tsx
//   'reclamo'             → ReclamoDetailModal.tsx
//   'comprobante'         → ComprobanteInfoModal.tsx (ciclo del comprobante de
//                           finalización de una pasantía por cupo; el id es el
//                           de la `asignaciones_cupo`)
//   'postulacionRechazada' → PostulacionRechazadaModal.tsx (el id es el de la
//                           `aplicaciones`; muestra a qué vacante se postuló y
//                           el motivo con que la empresa la descartó)
//   'contratoAviso'       → ContratoAvisoModal.tsx (el id es el de
//                           `contratos_laborales`; muestra el último aviso —
//                           reporte, advertencia, despido o renuncia — que una
//                           parte dejó a la otra en ese contrato)

export interface NotifRef {
  // Forma del resultado "ya interpretado": qué tipo de entidad es, y cuál
  // es su ID específico en Firestore.
  kind: NotifRefKind;
  id: string;
}

const KINDS: NotifRefKind[] = ['vacante', 'grupo', 'aplicacionGrupo', 'reclamo', 'comprobante', 'postulacionRechazada', 'contratoAviso'];
// La MISMA lista de valores que el tipo NotifRefKind de arriba, pero como
// un ARRAY real (no solo un tipo). Se necesita en tiempo de ejecución
// (los tipos de TypeScript desaparecen al compilar, no existen dentro del
// programa corriendo) para poder hacer KINDS.includes(kind) más abajo y
// verificar si un texto cualquiera es uno de los 4 tipos válidos.

/**
 * Reconoce una referencia estructurada `"kind:id"` guardada en `link_accion`
 * (p. ej. `"vacante:abc123"`) — usada para abrir el modal de detalle
 * correspondiente en vez de solo navegar a una ruta genérica. `null` si
 * `linkAccion` es una ruta ('/...'), está vacío, o no calza con ningún tipo
 * reconocido (notificaciones antiguas o de otros flujos, sin cambios).
 */
export function parseNotifRef(linkAccion?: string | null): NotifRef | null {
  // Intenta "leer" el texto guardado como si tuviera el formato
  // "tipo:id". Si NO tiene ese formato (o el tipo no es reconocido),
  // devuelve `null` para indicar "esto no es una referencia estructurada".
  const dest = (linkAccion ?? '').trim();
  // Si linkAccion es null/undefined, usa cadena vacía; .trim() quita
  // espacios sobrantes.
  const idx = dest.indexOf(':');
  // Busca la posición del primer ":" dentro del texto. Si no hay ningún
  // ":", indexOf devuelve -1.
  if (idx <= 0) return null;
  // Si no hay ":" (idx sería -1), o si el ":" está en la primerísima
  // posición (idx === 0, lo que significaría un "kind" vacío antes de los
  // dos puntos), no es una referencia válida.
  const kind = dest.slice(0, idx) as NotifRefKind;
  // .slice(0, idx) toma todo el texto ANTES del ":" — por ejemplo, de
  // "vacante:abc123" extrae "vacante". "as NotifRefKind" le dice a
  // TypeScript "confía en que este texto es uno de los 4 tipos válidos"
  // (una afirmación que TODAVÍA no se comprobó — por eso la validación
  // real ocurre 2 líneas más abajo con KINDS.includes).
  const id = dest.slice(idx + 1).trim();
  // Toma todo el texto DESPUÉS del ":" — de "vacante:abc123" extrae
  // "abc123" (idx + 1 se salta el propio carácter ":").
  if (!id || !KINDS.includes(kind)) return null;
  // Si no quedó ningún id (texto vacío después de los ":"), o si el
  // "kind" extraído no es ninguno de los 4 valores reconocidos en KINDS
  // (por ejemplo, si el texto fuera "http://algo" — que también tiene
  // ":" pero no es un kind válido), se descarta y se devuelve null.
  return { kind, id };
  // Si pasó todas las validaciones, devuelve el objeto ya interpretado.
}

/**
 * Resuelve a qué ruta debe navegar la app al tocar una notificación.
 *
 * Las notificaciones guardan `link_accion` (espejo de `referencia_id`), que puede
 * ser:
 *   - Una RUTA explícita (empieza con '/') → se navega ahí directo.
 *   - Una referencia estructurada "kind:id" (ver {@link parseNotifRef}) → la
 *     resuelve quien llama (FloatingTopBar abre el modal correspondiente); esta
 *     función no navega para esos casos.
 *   - Un ID de entidad suelto (p. ej. el id de una solicitud de pasantía) → se
 *     lleva a la bandeja de mensajes, donde vive el chat/objeto consecuente.
 *   - Vacío → sin destino (no navega).
 *
 * Lo usan tanto la campanita in-app (FloatingTopBar) como el manejador de push.
 */
export function resolverRutaNotif(
  linkAccion?: string | null,
  tipo?: string,
): string | null {
  // Esta función complementa a parseNotifRef(): mientras esa se enfoca en
  // el caso "abrir un modal", esta decide si hay que NAVEGAR a otra
  // pantalla (o no hacer nada). Devuelve la ruta como texto (por ejemplo
  // "/mensajes"), o `null` si no hay que navegar.
  const t = (tipo ?? "").toLowerCase();
  // Normaliza el "tipo" de notificación a minúsculas para comparar sin
  // preocuparse por mayúsculas.

  // ── Reglas por TIPO (tienen prioridad sobre link_accion) ──
  // Eventos del ciclo de la pasantía del estudiante → tab Progreso.
  if (t.includes("certificad") || t.includes("acuerdo_aprobado")) {
    // Si el TIPO de la notificación contiene la palabra "certificad" (por
    // ejemplo "certificado_firmado") o es exactamente sobre un acuerdo
    // aprobado, se manda al usuario directo a la pestaña "Progreso" de su
    // pasantía, SIN IMPORTAR qué diga link_accion — estas reglas por tipo
    // van primero y ganan.
    return "/(tabs)/progreso";
    // Esta es una ruta de Expo Router: la carpeta app/(tabs)/ contiene
    // las pestañas principales de la app, y "progreso" es uno de sus
    // archivos/pantallas.
  }

  // ── Por defecto: usar link_accion / referencia_id ──
  const dest = (linkAccion ?? "").trim();
  if (dest.startsWith("/")) return dest;
  // Caso 1: si el texto guardado ya empieza con "/", es una ruta directa
  // de la app (ej. "/mensajes", "/dashboard-empresa") — se devuelve tal
  // cual para navegar ahí.
  if (parseNotifRef(dest)) return null; // lo resuelve el llamador (modal de detalle)
  // Caso 2: si el texto SÍ tiene el formato "kind:id" reconocido (usando
  // la función de arriba), esta función NO decide la navegación — se
  // devuelve `null` a propósito, porque quien llamó a resolverRutaNotif
  // (típicamente FloatingTopBar.tsx) debe, en su lugar, llamar de nuevo a
  // parseNotifRef() y abrir el MODAL de detalle correspondiente en vez de
  // navegar a otra pantalla.
  if (dest) return "/mensajes";
  // Caso 3: si hay ALGÚN texto pero no es ruta ni referencia
  // estructurada (por ejemplo, un ID suelto de una notificación antigua
  // de antes de que existiera este sistema), se asume que se refiere a
  // algo relacionado a un chat/solicitud, y se manda al usuario a la
  // bandeja de mensajes.
  return null;
  // Caso 4: si no hay ningún texto en absoluto (notificación sin
  // link_accion), no hay a dónde navegar.
}
