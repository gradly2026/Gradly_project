import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { useNotification } from '../contexts/NotificationContext';
import { db } from '../config/firebaseConfig';
import { NOTIF } from '../services/notificacionService';

type Rol = 'estudiante' | 'empresa' | 'universidad' | 'admin' | 'joventalento';

export interface RealtimeBadges {
  pendientesFirma:      number;
  pendientesAprobacion: number;
  reportesAbiertos:     number;
}

/**
 * Configura listeners de Firestore en tiempo real según el rol del usuario.
 * Debe llamarse dentro de un componente descendiente de NotificationProvider.
 * Retorna badges (contadores) para usar en headers / tab bars.
 */
export function useRealtimeListeners(
  uid: string | null,
  rol: Rol | null,
): RealtimeBadges {
  const { showNotification } = useNotification();

  const [pendientesFirma,      setPendientesFirma]      = useState(0);
  const [pendientesAprobacion, setPendientesAprobacion] = useState(0);
  const [reportesAbiertos,     setReportesAbiertos]     = useState(0);

  useEffect(() => {
    if (!uid || !rol) return;

    const unsubs: (() => void)[] = [];

    // ──────────────────────────────────────────
    // ESTUDIANTE — cambios de estado y pagos
    // ──────────────────────────────────────────
    if (rol === 'estudiante' || rol === 'joventalento') {
      // Tracking local — se reinicia con cada montaje del listener
      const prevEstados:  Record<string, string>  = {};
      const prevPagos:    Record<string, boolean> = {};
      let initialized = false;

      const q = query(
        collection(db, 'aplicaciones'),
        where('estudiante_id', '==', uid),
      );

      const unsub = onSnapshot(q, snap => {
        if (!initialized) {
          snap.docs.forEach(d => {
            prevEstados[d.id] = d.data().estado ?? '';
            prevPagos[d.id]   = d.data().pago_confirmado === true;
          });
          initialized = true;
          return;
        }

        snap.docChanges().forEach(change => {
          if (change.type !== 'modified') return;

          const data  = change.doc.data();
          const docId = change.doc.id;

          // — Cambio de estado
          const prevEstado = prevEstados[docId] ?? '';
          const newEstado  = data.estado ?? '';

          if (prevEstado !== newEstado) {
            const nombre = data.vacante_titulo ?? 'la vacante';

            if (newEstado === 'contratado' || newEstado === 'aceptado') {
              const n = NOTIF.aplicacionAceptada(nombre);
              showNotification(n.tipo as any, n.titulo, n.mensaje);
            } else if (newEstado === 'rechazado') {
              const n = NOTIF.aplicacionRechazada(nombre);
              showNotification(n.tipo as any, n.titulo, n.mensaje);
            } else if (newEstado === 'entrevista') {
              const n = NOTIF.aplicacionEntrevista(nombre);
              showNotification(n.tipo as any, n.titulo, n.mensaje);
            } else if (newEstado === 'aprobado') {
              const n = NOTIF.horasAprobadas(data.horas_completadas ?? 0);
              showNotification(n.tipo as any, n.titulo, n.mensaje);
            }

            prevEstados[docId] = newEstado;
          }

          // — Pago confirmado
          const prevPago = prevPagos[docId] ?? false;
          const newPago  = data.pago_confirmado === true;

          if (!prevPago && newPago) {
            showNotification('success', '¡Pago recibido!', 'Tu pago ha sido procesado. Revisa tu historial de ingresos.');
          }
          prevPagos[docId] = newPago;
        });
      });

      unsubs.push(unsub);
    }

    // ──────────────────────────────────────────
    // EMPRESA — pasantías pendientes de firma
    // ──────────────────────────────────────────
    if (rol === 'empresa') {
      let initialized = false;

      const q = query(
        collection(db, 'aplicaciones'),
        where('empresa_id', '==', uid),
        where('estado', '==', 'finalizado_pendiente_firma'),
      );

      const unsub = onSnapshot(q, snap => {
        setPendientesFirma(snap.size);

        if (!initialized) {
          initialized = true;
          return;
        }

        snap.docChanges().forEach(change => {
          if (change.type !== 'added') return;
          const data = change.doc.data();
          const n = NOTIF.estudianteFinalizó(data.estudiante_nombre ?? 'Un estudiante');
          showNotification(n.tipo as any, n.titulo, n.mensaje);
        });
      });

      unsubs.push(unsub);
    }

    // ──────────────────────────────────────────
    // UNIVERSIDAD — pasantías pendientes de aprobación
    // ──────────────────────────────────────────
    if (rol === 'universidad') {
      let initialized = false;

      const q = query(
        collection(db, 'aplicaciones'),
        where('universidad_id', '==', uid),
        where('estado', '==', 'finalizado'),
      );

      const unsub = onSnapshot(q, snap => {
        setPendientesAprobacion(snap.size);

        if (!initialized) {
          initialized = true;
          return;
        }

        snap.docChanges().forEach(change => {
          if (change.type !== 'added') return;
          const data = change.doc.data();
          const n = NOTIF.pendienteAprobacion(data.estudiante_nombre ?? 'Un estudiante');
          showNotification(n.tipo as any, n.titulo, n.mensaje);
        });
      });

      unsubs.push(unsub);
    }

    // ──────────────────────────────────────────
    // ADMIN — reportes abiertos
    // ──────────────────────────────────────────
    if (rol === 'admin') {
      let prevCount = -1;

      const q = query(
        collection(db, 'reportes'),
        where('estado', '==', 'abierto'),
      );

      const unsub = onSnapshot(q, snap => {
        const count = snap.size;
        setReportesAbiertos(count);

        if (prevCount === -1) {
          prevCount = count;
          return;
        }

        if (count > prevCount) {
          const nuevos = count - prevCount;
          showNotification(
            'warning',
            'Nuevo reporte',
            `${nuevos} nuevo${nuevos > 1 ? 's' : ''} reporte${nuevos > 1 ? 's' : ''} abierto${nuevos > 1 ? 's' : ''} pendiente${nuevos > 1 ? 's' : ''}.`,
          );
        }

        prevCount = count;
      });

      unsubs.push(unsub);
    }

    return () => unsubs.forEach(fn => fn());
  }, [uid, rol, showNotification]);

  return { pendientesFirma, pendientesAprobacion, reportesAbiertos };
}
