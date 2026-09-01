import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import { COLECCION_RECLAMOS, type ReclamoCupos } from '../services/reclamoCuposService';

/**
 * Reservas de cupos (`reclamos_cupos`) de una universidad, en vivo.
 *
 * Lo comparten dos pantallas del estudiante para no duplicar el listener ni
 * la query:
 *   · `TableroCupos` — pinta los cupos que su universidad le aseguró.
 *   · el feed (`app/(tabs)/index.tsx`) — para NO volver a ofrecer en "Otras
 *     pasantías" una pasantía cuyo cupo ya está reservado para este alumno.
 *
 * Las reglas dejan leer esta colección al estudiante de esa universidad
 * (`esEstudianteDe`), a la propia universidad, a la empresa dueña y al admin.
 */
export function useReclamosUniversidad(universidadId?: string | null): ReclamoCupos[] {
  const [reclamos, setReclamos] = useState<ReclamoCupos[]>([]);

  useEffect(() => {
    if (!universidadId) {
      setReclamos([]);
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, COLECCION_RECLAMOS), where('universidadId', '==', universidadId)),
      snap => setReclamos(snap.docs.map(d => ({ id: d.id, ...d.data() } as ReclamoCupos))),
      e => console.warn('Error en listener (reclamos universidad):', e),
    );
    return unsub;
  }, [universidadId]);

  return reclamos;
}
