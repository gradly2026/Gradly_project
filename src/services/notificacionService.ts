// ════════════════════════════════════════════════════════════════════════
// notificacionService.ts   (con "c", distinto de notificationService.ts con "t")
//
// QUÉ ES ESTE ARCHIVO:
// OJO con el nombre: existe también src/services/notificationService.ts
// (en inglés, "notification"). Son DOS archivos relacionados pero
// distintos:
//   - notificationService.ts (inglés) → el servicio "de la fuente de la
//     verdad": tiene la función enviarNotificacion() que escribe de
//     verdad en Firestore (léelo primero si no lo hiciste).
//   - notificacionService.ts (este archivo, en español) → una capa de
//     COMPATIBILIDAD sobre el anterior, más una "biblioteca" de mensajes
//     predefinidos (el objeto NOTIF de más abajo) para no repetir el
//     mismo texto de notificación escrito a mano en 10 lugares distintos
//     del proyecto.
//
// En resumen, este archivo NO duplica la lógica de guardar en Firestore:
// solo la reutiliza y le agrega azúcar (comodidad) alrededor.
// ════════════════════════════════════════════════════════════════════════

import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
// Funciones de Firestore importadas pero — nota para quien lea el
// archivo completo — varias de ellas (onSnapshot, orderBy, query, where,
// updateDoc, doc) NO se terminan usando en este archivo tal como está
// hoy (el bloque "HOOK: notificaciones del usuario actual" de más abajo
// quedó como un título de sección sin código debajo, ver el comentario en
// ese punto). Se dejan importadas por si esa función se termina de
// escribir más adelante, o porque quedaron de una versión anterior del
// archivo.

import { useEffect, useState } from 'react';
// Hooks de React (tampoco usados directamente en el código actual de este
// archivo, por la misma razón de arriba).

import { db } from '../config/firebaseConfig';
// La conexión a Firestore.

import { enviarNotificacion } from './notificationService';
// Aquí está la clave de por qué este archivo es un "wrapper" (envoltorio):
// importa la función REAL que guarda notificaciones desde el otro
// archivo, y la reutiliza en vez de reescribir su lógica.

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
export interface NotificacionApp {
  // Describe la FORMA de un documento leído desde la colección
  // "notificaciones_app" (útil para cuando algún componente lee la lista
  // de notificaciones de un usuario y necesita saber qué campos esperar).
  id:              string;   // el ID del documento en Firestore
  destinatario_id: string;   // uid del usuario que la recibe
  tipo:            string;   // 'success' | 'info' | 'warning' | 'error' (categoría)
  titulo:          string;
  mensaje:         string;
  leido:           boolean;  // si el usuario ya la abrió/vio
  fecha:           any;      // fecha de creación (tipo "any" porque Firestore
                              // la devuelve como un objeto Timestamp especial,
                              // no como un string o Date normal de JavaScript)
  link_accion:     string;   // el "deep link" tipo "tipo:id" (ver notifRoute.ts)
}

// ─────────────────────────────────────────────
// CREAR NOTIFICACIÓN IN-APP
// ─────────────────────────────────────────────
/**
 * Crea una notificación en /notificaciones_app para un usuario específico.
 * Se llama desde los servicios de negocio cuando ocurren eventos relevantes.
 *
 * Wrapper de compatibilidad: delega en el servicio canónico
 * {@link enviarNotificacion} (única fuente de verdad). Conserva la firma
 * histórica `(destinatarioId, tipo, titulo, mensaje, linkAccion)`; el
 * `linkAccion` (ruta de navegación) viaja como `referencia_id` → se persiste
 * también en `link_accion`, que es el campo que leen los navegadores.
 */
export async function crearNotificacionInApp(
  // Esta función existe para código ANTIGUO del proyecto que fue escrito
  // esperando estos parámetros EN ESTE ORDEN específico (destinatarioId,
  // tipo, titulo, mensaje, linkAccion) — un orden distinto al de
  // enviarNotificacion() (que pide primero destinatario, luego titulo,
  // luego mensaje, luego tipo). En vez de tener que ir a buscar y
  // corregir cada lugar del proyecto que la llamaba con el orden viejo,
  // se dejó esta función como "traductora": recibe los parámetros en el
  // orden viejo y por dentro llama a la función nueva con el orden
  // correcto.
  destinatarioId: string,
  tipo:           string,
  titulo:         string,
  mensaje:        string,
  linkAccion:     string = '',
  // Valor por defecto: si no se pasa linkAccion, se usa cadena vacía.
): Promise<void> {
  await enviarNotificacion(destinatarioId, titulo, mensaje, tipo, linkAccion || null);
  // Llama a la función REAL (la de notificationService.ts), reordenando
  // los parámetros a como ella los espera. "linkAccion || null" → si
  // linkAccion es una cadena vacía (valor "falsy" en JavaScript), se
  // manda `null` en su lugar (enviarNotificacion espera
  // `string | null` para su parámetro referencia_id).
}

// ─────────────────────────────────────────────
// HOOK: notificaciones del usuario actual
// ─────────────────────────────────────────────
// (Sección reservada/título sin implementación activa en este archivo —
// la lectura en tiempo real de notificaciones para mostrarlas en la
// campanita 🔔 vive hoy directamente en src/components/FloatingTopBar.tsx,
// usando onSnapshot()/query()/where() de forma similar a como se
// importan arriba. Si en el futuro se quisiera extraer ese hook para
// reutilizarlo en otra pantalla, este es el lugar pensado para hacerlo.)

// ─────────────────────────────────────────────
// MENSAJES PREDEFINIDOS POR EVENTO
// ─────────────────────────────────────────────
export const NOTIF = {
  // NOTIF es un "catálogo" de plantillas de notificación: en vez de que
  // cada archivo del proyecto escriba a mano el título y mensaje exacto
  // de, por ejemplo, "fuiste contratado", todos importan NOTIF y llaman a
  // NOTIF.aplicacionAceptada("Nombre de la vacante"), garantizando que el
  // texto sea siempre idéntico y fácil de cambiar en un solo lugar.
  //
  // Cada propiedad es una FUNCIÓN que recibe un dato variable (el nombre
  // de la vacante, la cantidad de horas, etc.) y devuelve un objeto
  // { titulo, mensaje, tipo } listo para pasarle a enviarNotificacion()
  // o crearNotificacionInApp().

  // → Estudiante
  aplicacionAceptada: (vacanteNombre: string) => ({
    titulo:  '¡Fuiste contratado!',
    mensaje: `Has sido seleccionado para "${vacanteNombre}". Revisa los detalles en tu progreso.`,
    // El backtick (`) crea un "template literal": permite insertar el
    // valor de una variable directo dentro del texto usando ${...}.
    tipo:    'success',
  }),
  aplicacionRechazada: (vacanteNombre: string) => ({
    titulo:  'Aplicación no seleccionada',
    mensaje: `Tu aplicación para "${vacanteNombre}" no fue seleccionada esta vez. ¡Sigue intentando!`,
    tipo:    'info',
  }),
  aplicacionEntrevista: (vacanteNombre: string) => ({
    titulo:  '¡Te llamaron a entrevista!',
    mensaje: `La empresa revisará tu perfil para "${vacanteNombre}". Prepárate.`,
    tipo:    'info',
  }),
  horasAprobadas: (horas: number) => ({
    titulo:  '¡Horas aprobadas!',
    mensaje: `Se registraron ${horas} horas en tu progreso. ¡Vas muy bien!`,
    tipo:    'success',
  }),
  pagoRecibido: (monto: number) => ({
    titulo:  '¡Pago recibido!',
    mensaje: `Recibiste un pago de $${monto.toFixed(2)}. Revisa tu historial de ingresos.`,
    // .toFixed(2) formatea el número con exactamente 2 decimales (por
    // ejemplo, 50 se muestra como "50.00").
    tipo:    'success',
  }),

  // → Empresa
  estudianteFinalizó: (nombre: string) => ({
    titulo:  'Pasantía finalizada',
    mensaje: `${nombre} marcó su pasantía como finalizada. Debes firmar la constancia.`,
    tipo:    'warning',
  }),
  nuevaAplicacion: (nombre: string) => ({
    titulo:  'Nueva aplicación',
    mensaje: `${nombre} aplicó a una de tus vacantes.`,
    tipo:    'info',
  }),

  // → Universidad
  pendienteAprobacion: (nombre: string) => ({
    titulo:  'Pasantía pendiente de aprobación',
    mensaje: `La pasantía de ${nombre} fue firmada y está lista para aprobar horas.`,
    tipo:    'warning',
  }),
} as const;
// "as const" congela el objeto y cada valor interno como "literal"
// (TypeScript sabe, por ejemplo, que `tipo` es EXACTAMENTE el texto
// 'success' y no un `string` genérico cualquiera), lo cual da mejor
// autocompletado y detección de errores al usar NOTIF en otros archivos.

// Ejemplo real de uso en otro archivo del proyecto:
//     import { NOTIF } from '../services/notificacionService';
//     const n = NOTIF.aplicacionAceptada('Desarrollador Junior');
//     await enviarNotificacion(estudianteId, n.titulo, n.mensaje, n.tipo, `vacante:${vacanteId}`);
