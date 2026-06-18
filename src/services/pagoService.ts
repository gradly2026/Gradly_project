import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import { crearNotificacionInApp, NOTIF } from './notificacionService';

function generarReferencia(): string {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `GRL-${ts}-${rand}`;
}

/**
 * Procesa un pago simulado:
 * 1. Verifica tarjeta registrada de la empresa
 * 2. Verifica que la transacción esté pendiente
 * 3. Espera 2 s (simulación de gateway)
 * 4. Marca transacción como completada y genera referencia
 * 5. Marca aplicación como pago_confirmado
 */
export async function procesarPagoSimulado(
  transaccionId: string,
  empresaId: string,
  montoFinal: number,
): Promise<{ exito: boolean; referencia: string }> {
  const txSnap = await getDoc(doc(db, 'transacciones', transaccionId));
  if (!txSnap.exists()) throw new Error('Transacción no encontrada.');
  const tx = txSnap.data();
  if (tx.estado !== 'pendiente') throw new Error('Esta transacción ya fue procesada.');

  const empresaSnap = await getDoc(doc(db, 'perfiles_empresas', empresaId));
  if (!empresaSnap.exists()) throw new Error('Empresa no encontrada.');
  if (!empresaSnap.data().tarjeta_numero)
    throw new Error('La empresa no tiene una tarjeta registrada. Agrégala en "Pagos".');

  // Simulación del tiempo de procesamiento
  await new Promise(resolve => setTimeout(resolve, 2000));

  const referencia = generarReferencia();

  await updateDoc(doc(db, 'transacciones', transaccionId), {
    estado:     'completado',
    monto:      montoFinal,
    fecha_pago: serverTimestamp(),
    referencia,
  });

  if (tx.aplicacion_id) {
    await updateDoc(doc(db, 'aplicaciones', tx.aplicacion_id), {
      pago_confirmado: true,
    });
  }

  // Notificar al estudiante que recibió su pago
  if (tx.estudiante_id) {
    const n = NOTIF.pagoRecibido(montoFinal);
    await crearNotificacionInApp(
      tx.estudiante_id as string,
      n.tipo,
      n.titulo,
      n.mensaje,
      '/(tabs)/progreso',
    );
  }

  return { exito: true, referencia };
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
