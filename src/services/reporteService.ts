import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../config/firebaseConfig';

export interface Reporte {
  id:            string;
  reportador_id: string;
  reportado_id:  string;
  tipo:          'empresa' | 'estudiante';
  motivo:        string;
  descripcion:   string;
  estado:        'abierto' | 'en_investigacion' | 'resuelto';
  fecha:         any;
  resolucion:    string;
}

/**
 * Crear un reporte desde cualquier usuario autenticado.
 */
export async function crearReporte(
  reportadorId: string,
  reportadoId: string,
  tipo: 'empresa' | 'estudiante',
  motivo: string,
  descripcion: string,
): Promise<void> {
  await addDoc(collection(db, 'reportes'), {
    reportador_id: reportadorId,
    reportado_id:  reportadoId,
    tipo,
    motivo,
    descripcion,
    estado:        'abierto',
    fecha:         serverTimestamp(),
    resolucion:    '',
  });
}

/**
 * Hook para el Admin — escucha todos los reportes en tiempo real, ordenados por fecha DESC.
 */
export function useReportesAdmin(): { reportes: Reporte[]; loading: boolean } {
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'reportes'), orderBy('fecha', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setReportes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Reporte)));
      setLoading(false);
    });
    return unsub;
  }, []);

  const abiertos       = reportes.filter(r => r.estado === 'abierto');
  const enInvestigacion= reportes.filter(r => r.estado === 'en_investigacion');
  const resueltos      = reportes.filter(r => r.estado === 'resuelto');

  return { reportes, loading };
}
