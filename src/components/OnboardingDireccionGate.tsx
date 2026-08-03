import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../config/firebaseConfig";
import { useAuth } from "../context/AuthContext";
import OnboardingDireccionModal from "./OnboardingDireccionModal";

/**
 * Compuerta de dirección: al entrar a la app, si el estudiante no tiene
 * `departamento` guardado en su perfil (nunca se le pidió — ver
 * [[project_reparto_cupos]] Fase 9.1), superpone el modal obligatorio que lo
 * captura. Se monta en el home de estudiante (tabs), igual que `FeedbackGate`.
 */
export default function OnboardingDireccionGate() {
  const { user, rol } = useAuth();
  const [falta, setFalta] = useState(false);

  useEffect(() => {
    if (!user?.uid || rol !== "estudiante") {
      setFalta(false);
      return;
    }
    let cancelado = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "perfiles_estudiantes", user.uid));
        const data = snap.exists() ? (snap.data() as any) : null;
        if (!cancelado) setFalta(!data?.departamento);
      } catch (error) {
        console.warn("Error verificando ubicación del estudiante:", error);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [user?.uid, rol]);

  if (!falta || !user?.uid) return null;

  return <OnboardingDireccionModal uid={user.uid} onGuardado={() => setFalta(false)} />;
}
