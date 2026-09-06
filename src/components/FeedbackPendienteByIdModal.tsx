// ════════════════════════════════════════════════════════════════════════
// FeedbackPendienteByIdModal.tsx
//
// Wrapper delgado que abre la campanita (FloatingTopBar) cuando el usuario
// toca una notificación `feedbackPendiente:<feedbackId>` — es decir, una
// evaluación que él mismo pospuso con "Calificar más tarde".
//
// No tiene UI propia: resuelve el `FeedbackPendiente` a partir del id
// (misma fuente que la compuerta, `getFeedbackPendiente`) y monta el
// FeedbackExperienciaModal ya existente. Si esa evaluación ya no está
// pendiente (el usuario la completó por otro lado), avisa y cierra.
// ════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { showAlert } from './AppAlert';
import FeedbackExperienciaModal from './FeedbackExperienciaModal';
import {
  getFeedbackPendiente,
  type EntidadRol,
  type FeedbackPendiente,
} from '../services/feedbackService';

interface Props {
  visible: boolean;
  /** `feedbackId` determinístico: `${solicitudId}_${evaluadorId}_${evaluadoId}`. */
  feedbackId: string | null;
  uid?: string | null;
  rol?: string | null;
  onClose: () => void;
}

const ES_ROL = (r?: string | null): r is EntidadRol =>
  r === 'estudiante' || r === 'empresa' || r === 'universidad';

export default function FeedbackPendienteByIdModal({
  visible,
  feedbackId,
  uid,
  rol,
  onClose,
}: Props) {
  const [pendiente, setPendiente] = useState<FeedbackPendiente | null>(null);

  useEffect(() => {
    if (!visible || !feedbackId || !uid || !ES_ROL(rol)) {
      setPendiente(null);
      return;
    }
    let vivo = true;
    getFeedbackPendiente(uid, rol)
      .then((lista) => {
        if (!vivo) return;
        const p = lista.find((x) => x.feedbackId === feedbackId) ?? null;
        setPendiente(p);
        if (!p) {
          showAlert('Calificación', 'Ya no tienes esta calificación pendiente.');
          onClose();
        }
      })
      .catch(() => {
        if (vivo) onClose();
      });
    return () => {
      vivo = false;
    };
    // onClose se omite a propósito (nueva referencia en cada render del padre).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, feedbackId, uid, rol]);

  if (!visible || !pendiente) return null;

  return (
    <FeedbackExperienciaModal
      key={pendiente.feedbackId}
      pendiente={pendiente}
      onSubmitted={onClose}
      // Ya está pospuesta: aquí "Calificar más tarde" solo vuelve a cerrar.
      onPosponer={onClose}
    />
  );
}
