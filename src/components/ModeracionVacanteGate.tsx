import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  getModeracionesPendientes,
  marcarModeracionNotificada,
  type ModeracionVacantePendiente,
} from "../services/moderacionVacanteService";
import ModeracionVacanteModal from "./ModeracionVacanteModal";

/**
 * Compuerta de moderación: al montarse (entrada al panel de empresa) detecta
 * publicaciones propias que un admin deshabilitó o eliminó y aún no se le han
 * mostrado, y las presenta de forma secuencial con `ModeracionVacanteModal`.
 * Mismo patrón que `FeedbackGate` (cola + índice), pero dismissible (no exige
 * ninguna acción, solo acuse de recibo) en vez de obligar a completar un
 * formulario.
 */
export default function ModeracionVacanteGate() {
  const { user, rol } = useAuth();
  const [cola, setCola] = useState<ModeracionVacantePendiente[]>([]);
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    if (!user?.uid || rol !== "empresa") {
      setCola([]);
      return;
    }
    let cancelado = false;
    (async () => {
      try {
        const pendientes = await getModeracionesPendientes(user.uid);
        if (!cancelado) {
          setCola(pendientes);
          setIndice(0);
        }
      } catch (error) {
        console.warn("Error detectando moderaciones pendientes:", error);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [user?.uid, rol]);

  const actual = cola[indice];
  if (!actual) return null;

  return (
    <ModeracionVacanteModal
      key={actual.vacanteId}
      pendiente={actual}
      onCerrar={() => {
        void marcarModeracionNotificada(actual.vacanteId).catch(() => {});
        setIndice((i) => i + 1);
      }}
    />
  );
}
