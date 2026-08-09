import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  getFeedbackPendiente,
  type EntidadRol,
  type FeedbackPendiente,
} from "../services/feedbackService";
import FeedbackExperienciaModal from "./FeedbackExperienciaModal";

/**
 * Compuerta de feedback: al montarse (entrada a la app) detecta las pasantías
 * finalizadas sin evaluar del usuario actual y superpone, de forma secuencial y
 * obligatoria, el "Formulario de Experiencia Gradly". Se monta en el home de
 * estudiante (tabs) y de empresa.
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
        const pendientes = await getFeedbackPendiente(
          user.uid,
          rol as EntidadRol,
        );
        if (!cancelado) {
          setCola(pendientes);
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
  if (!actual) return null;

  return (
    <FeedbackExperienciaModal
      // key fuerza un remount limpio del formulario entre evaluaciones.
      key={actual.feedbackId}
      pendiente={actual}
      // Se difiere al siguiente tick por la misma razón que en
      // ModeracionVacanteGate: `setIndice` desmonta este `<Modal>` por
      // completo, y hacerlo en el mismo clic que lo originó choca con la
      // limpieza del portal de react-native-web ("removeChild" en consola).
      onSubmitted={() => setTimeout(() => setIndice((i) => i + 1), 0)}
    />
  );
}
