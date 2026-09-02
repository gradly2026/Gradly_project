// ════════════════════════════════════════════════════════════════════════
// usePasantesEmpresa.ts
//
// Set de uids de estudiantes que YA culminaron una pasantía con esta empresa,
// por cualquiera de los dos flujos de admisión:
//   - GRUPO: `solicitudes_practicas` con `estado === 'finalizado'`
//   - CUPO:  `asignaciones_cupo` con `finalizada === true`
//
// Se usa para:
//   - el privilegio "Hizo su pasantía con nuestra empresa" en el listado de
//     candidatos de una vacante (Reclutamiento), y
//   - poblar el filtro "Recontratar Pasantes".
//
// Es la misma lógica de cruce grupo→perfiles que hace HistorialPasantes,
// aislada aquí para reutilizarla. Diferencia consciente: en el flujo de grupo
// se toman TODOS los miembros actuales de un grupo que tuvo una solicitud
// finalizada con la empresa (HistorialPasantes además emparejaba por nombre
// contra `solicitud.alumnos`). Como esto alimenta un PRIVILEGIO y no un
// candado, el conjunto un poco más amplio es aceptable y evita el emparejado
// difuso por nombre.
// ════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';

export interface PasantesEmpresa {
  /** uids de ex-pasantes de la empresa (ambos flujos). */
  pasantes: Set<string>;
  cargando: boolean;
}

export function usePasantesEmpresa(empresaId?: string): PasantesEmpresa {
  const [pasantes, setPasantes] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!empresaId) {
      setPasantes(new Set());
      setCargando(false);
      return;
    }
    setCargando(true);
    let cancelado = false;
    let solicitudes: any[] = [];
    let cupos: any[] = [];

    // Recompone el Set cada vez que llega cualquiera de los dos listeners.
    const recomputar = async () => {
      const acc = new Set<string>();

      // CUPO: `estudianteId` ya es un uid real de Auth.
      for (const c of cupos) if (c.estudianteId) acc.add(c.estudianteId);

      // GRUPO: resolver uids reales vía `perfiles_estudiantes` del grupo.
      const grupoIds = [...new Set(solicitudes.map((s) => s.grupoId).filter(Boolean))];
      await Promise.all(
        grupoIds.map(async (gid) => {
          try {
            const es = await getDocs(
              query(collection(db, 'perfiles_estudiantes'), where('grupo_id', '==', gid)),
            );
            es.docs.forEach((d) => acc.add(d.id));
          } catch {
            /* best-effort: un grupo que no resuelve no rompe el resto */
          }
        }),
      );

      if (!cancelado) {
        setPasantes(acc);
        setCargando(false);
      }
    };

    // `estado`/`finalizada` se filtran en cliente (mismo patrón que el resto
    // del repo: se evita el índice compuesto empresaId+estado).
    const unsubSol = onSnapshot(
      query(collection(db, 'solicitudes_practicas'), where('empresaId', '==', empresaId)),
      (snap) => {
        solicitudes = snap.docs
          .map((d) => d.data() as any)
          .filter((s) => s.estado === 'finalizado');
        void recomputar();
      },
      (e) => {
        console.warn('usePasantesEmpresa (solicitudes):', e);
        if (!cancelado) setCargando(false);
      },
    );
    const unsubCup = onSnapshot(
      query(collection(db, 'asignaciones_cupo'), where('empresaId', '==', empresaId)),
      (snap) => {
        cupos = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((c) => c.finalizada === true && c.estado !== 'cancelado');
        void recomputar();
      },
      (e) => console.warn('usePasantesEmpresa (cupos):', e),
    );

    return () => {
      cancelado = true;
      unsubSol();
      unsubCup();
    };
  }, [empresaId]);

  return { pasantes, cargando };
}
