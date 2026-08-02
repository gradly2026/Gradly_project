import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import { crearNotificacionInApp, NOTIF } from './notificacionService';

function generarReferencia(): string {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `GRL-${ts}-${rand}`;
}

/**
 * Genera el texto de recibo para compartir via Share API de React Native.
 */
export function generarReciboTexto(params: {
  referencia: string;
  monto: number;
  empresa: string;
  estudiante: string;
  fecha: string;
  concepto: string;
}): string {
  return [
    '═══════════════════════════════',
    '    RECIBO DE PAGO — GRADLY   ',
    '═══════════════════════════════',
    '',
    `Referencia: ${params.referencia}`,
    `Fecha:      ${params.fecha}`,
    '',
    `EMPRESA:    ${params.empresa}`,
    `ESTUDIANTE: ${params.estudiante}`,
    `CONCEPTO:   ${params.concepto}`,
    `MONTO:      $${params.monto.toFixed(2)}`,
    '',
    'ESTADO:     ✓ COMPLETADO',
    '',
    '═══════════════════════════════',
    'Pago simulado — Plataforma educativa Gradly.',
    'No representa una transacción financiera real.',
    '═══════════════════════════════',
  ].join('\n');
}
