import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../config/firebaseConfig';
import { enviarNotificacion } from './notificationService';

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
export interface NotificacionApp {
  id:              string;
  destinatario_id: string;
  tipo:            string;
  titulo:          string;
  mensaje:         string;
  leido:           boolean;
  fecha:           any;
  link_accion:     string;
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
  destinatarioId: string,
  tipo:           string,
  titulo:         string,
  mensaje:        string,
  linkAccion:     string = '',
): Promise<void> {
  await enviarNotificacion(destinatarioId, titulo, mensaje, tipo, linkAccion || null);
}

// ─────────────────────────────────────────────
// HOOK: notificaciones del usuario actual
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// MENSAJES PREDEFINIDOS POR EVENTO
// ─────────────────────────────────────────────
export const NOTIF = {
  // → Estudiante
  aplicacionAceptada: (vacanteNombre: string) => ({
    titulo:  '¡Fuiste contratado!',
    mensaje: `Has sido seleccionado para "${vacanteNombre}". Revisa los detalles en tu progreso.`,
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
