import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../config/firebaseConfig';
import { COLECCION_ASIGNACIONES, type AsignacionCupo } from '../services/reclamoCuposService';
import { progresoPorMeta, type ProgresoMeta } from '../utils/horasPasantia';

export interface InscripcionActiva {
  asignacion: AsignacionCupo;
  /** Libro mayor de horas, o null si falta `fechaPresentacion` o la meta del grupo. */
  progreso: ProgresoMeta | null;
}

/**
 * Inscripciones de cupo activas de una universidad o empresa, con su libro
 * mayor de horas (Fase D) — para las tarjetas "de un vistazo" del Inicio.
 * Escucha `asignaciones_cupo` where `{campo} == uid && estado == 'tomado'`,
 * lee la meta de horas de cada grupo (cacheada) y recalcula con tick de 1 min.
 */
export function useInscripcionesActivas(
  campo: 'universidadId' | 'empresaId',
  uid?: string | null,
): InscripcionActiva[] {
  const [asignaciones, setAsignaciones] = useState<AsignacionCupo[]>([]);
  const [metaPorGrupo, setMetaPorGrupo] = useState<Record<string, number | null>>({});
  const [ahora, setAhora] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!uid) { setAsignaciones([]); return; }
    const unsub = onSnapshot(
      query(collection(db, COLECCION_ASIGNACIONES), where(campo, '==', uid), where('estado', '==', 'tomado')),
      snap => setAsignaciones(snap.docs.map(d => ({ id: d.id, ...d.data() } as AsignacionCupo))),
      e => console.warn('Error en listener (inscripciones activas):', e),
    );
    return unsub;
  }, [campo, uid]);

  // Metas de grupo que aún no están en caché.
  useEffect(() => {
    const faltan = Array.from(
      new Set(asignaciones.map(a => a.grupoId).filter((g): g is string => !!g)),
    ).filter(g => !(g in metaPorGrupo));
    if (faltan.length === 0) return;
    let cancel = false;
    (async () => {
      const nuevos: Record<string, number | null> = {};
      for (const g of faltan) {
        try {
          const snap = await getDoc(doc(db, 'grupos', g));
          const d = snap.exists() ? (snap.data() as any) : {};
          const h = Number(d.horasRequeridas ?? d.total_horas ?? 0);
          nuevos[g] = Number.isFinite(h) && h > 0 ? Math.floor(h) : null;
        } catch {
          nuevos[g] = null;
        }
      }
      if (!cancel) setMetaPorGrupo(prev => ({ ...prev, ...nuevos }));
    })();
    return () => { cancel = true; };
  }, [asignaciones, metaPorGrupo]);

  return asignaciones.map(a => {
    const meta = a.grupoId ? metaPorGrupo[a.grupoId] : null;
    return {
      asignacion: a,
      progreso: meta ? progresoPorMeta(a.horario, a.fechaPresentacion, meta, new Date(ahora)) : null,
    };
  });
}
