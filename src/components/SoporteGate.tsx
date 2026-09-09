// ════════════════════════════════════════════════════════════════════════
// SoporteGate.tsx — al iniciar sesión, si el equipo de Gradly respondió a
// algún mensaje de soporte del usuario (ticket con `noLeidoUsuario === true`),
// le abre el hilo de una vez para que lo lea.
//
// Montado una sola vez en app/_layout.tsx (fuera del <Stack>, dentro de los
// Providers). Mismo espíritu que ComunicadosGate.
//
// Cerrar el modal (X) NO reabre la conversación en la próxima sesión: al abrir
// el hilo se baja `noLeidoUsuario` (marcarLeidoAlAbrir). La notificación de la
// campanita queda como vía para volver a abrirlo cuando el usuario quiera
// (deep link 'ticketSoporte:id', ver FloatingTopBar).
// ════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getMisTicketsConRespuesta } from '../services/soporteService';
import SoporteTicketModal from './SoporteTicketModal';

export default function SoporteGate() {
  const { user, rol } = useAuth();
  const [cola, setCola] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!user?.uid || (rol !== 'estudiante' && rol !== 'empresa' && rol !== 'universidad')) {
      setCola([]);
      setIdx(0);
      return;
    }
    let cancel = false;
    getMisTicketsConRespuesta(user.uid)
      .then((list) => {
        if (!cancel) {
          setCola(list.map((t) => t.id));
          setIdx(0);
        }
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [user?.uid, rol]);

  const actual = cola[idx];
  if (!actual || !user?.uid) return null;

  return (
    <SoporteTicketModal
      visible
      ticketId={actual}
      marcarLeidoAlAbrir
      onClose={() => setIdx((i) => i + 1)}
    />
  );
}
