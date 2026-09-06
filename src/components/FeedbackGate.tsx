import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  getFeedbackPendiente,
  getFeedbackPospuestos,
  posponerFeedback,
  type EntidadRol,
  type FeedbackPendiente,
} from "../services/feedbackService";
import { enviarNotificacion } from "../services/notificationService";
import FeedbackExperienciaModal from "./FeedbackExperienciaModal";

/**
 * Compuerta de feedback: al montarse (entrada a la app) detecta las pasantías
 * finalizadas sin evaluar del usuario actual y superpone, de forma secuencial y
 * obligatoria, el "Formulario de Experiencia Gradly". Se monta en el home de
 * estudiante (tabs) y de empresa.
 *
 * "Calificar más tarde": si el usuario pospone una evaluación, su `feedbackId`
 * se guarda en el perfil (`feedback_pospuestos`) y esta compuerta deja de
 * forzarla. Sigue visible en la tarjeta de recordatorio del Inicio y en la
 * notificación `feedbackPendiente:<feedbackId>` (que reabre este mismo modal).
 */
export default function FeedbackGate() {
  const { user, rol } = useAuth();
  const [cola, setCola] = useState<FeedbackPendiente[]>([]);
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    // Solo aplica a estudiantes y empresas.
    if (!user?.uid || (rol !== "estudiante" && rol !== "empresa")) {
      setCola([]);
      return;
    }
    let cancelado = false;
    (async () => {
      try {
        const [pendientes, pospuestos] = await Promise.all([
          getFeedbackPendiente(user.uid, rol as EntidadRol),
          getFeedbackPospuestos(user.uid, rol as EntidadRol),
        ]);
        if (!cancelado) {
          // La compuerta NO fuerza las que el usuario marcó "más tarde".
          setCola(pendientes.filter((p) => !pospuestos.includes(p.feedbackId)));
          setIndice(0);
        }
      } catch (error) {
        console.warn("Error detectando feedback pendiente:", error);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [user?.uid, rol]);

  const actual = cola[indice];
  if (!actual || !user?.uid) return null;

  const avanzar = () => setTimeout(() => setIndice((i) => i + 1), 0);

  const posponer = async () => {
    try {
      await posponerFeedback(user.uid, rol as EntidadRol, actual.feedbackId);
      await enviarNotificacion(
        user.uid,
        "Calificación pendiente",
        `Guardaste tu evaluación de "${actual.evaluadoNombre}" para más tarde. Ábrela cuando quieras desde aquí o desde tu inicio.`,
        "info",
        `feedbackPendiente:${actual.feedbackId}`,
      );
    } catch (e) {
      console.warn("No se pudo posponer la evaluación:", e);
    } finally {
      // Aunque falle el guardado, no dejamos al usuario atrapado en el modal.
      avanzar();
    }
  };

  return (
    <FeedbackExperienciaModal
      // key fuerza un remount limpio del formulario entre evaluaciones.
      key={actual.feedbackId}
      pendiente={actual}
      // Se difiere al siguiente tick por la misma razón que en
      // ModeracionVacanteGate: `setIndice` desmonta este `<Modal>` por
      // completo, y hacerlo en el mismo clic que lo originó choca con la
      // limpieza del portal de react-native-web ("removeChild" en consola).
      onSubmitted={avanzar}
      onPosponer={() => void posponer()}
    />
  );
}
