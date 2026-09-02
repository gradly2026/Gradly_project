import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { db } from '../config/firebaseConfig';
import {
  COLECCION_ASIGNACIONES,
  finalizarInscripcionPorHoras,
  type AsignacionCupo,
} from '../services/reclamoCuposService';
import { progresoPorMeta, type ProgresoMeta } from '../utils/horasPasantia';

export interface ProgresoInscripcion {
  /** La asignación de cupo activa del estudiante (o null). */
  asignacion: AsignacionCupo | null;
  /** Meta de horas del grupo (`horasRequeridas` / `total_horas`), o null. */
  metaHoras: number | null;
  /** Libro mayor de horas, o null si aún no hay datos suficientes
   *  (sin inscripción, sin `fechaPresentacion`, o sin meta). */
  progreso: ProgresoMeta | null;
  /** false mientras aún no resuelve la primera lectura. */
  cargado: boolean;
}

/**
 * Libro mayor de horas de un estudiante inscrito a una pasantía de cupo
 * (Fase D). Escucha su `asignaciones_cupo` activa, lee la meta de horas de su
 * grupo y calcula `progresoPorMeta`, que avanza solo con la fecha (tick 1 min).
 *
 * Lo comparten las pantallas del estudiante ("Mi progreso", "Mi institución")
 * para no repetir el listener ni el cálculo.
 */
export function useProgresoInscripcion(estudianteId?: string | null): ProgresoInscripcion {
  const [asignacion, setAsignacion] = useState<AsignacionCupo | null>(null);
  const [metaHoras, setMetaHoras] = useState<number | null>(null);
  const [cargado, setCargado] = useState(false);
  // Tick para que el conteo avance sin recargar.
  const [ahora, setAhora] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!estudianteId) {
      setAsignacion(null); setMetaHoras(null); setCargado(true);
      return;
    }
    const unsub = onSnapshot(
      query(
        collection(db, COLECCION_ASIGNACIONES),
        where('estudianteId', '==', estudianteId),
        where('estado', '==', 'tomado'),
      ),
      snap => {
        // Prefiere la inscripción que AÚN no culminó; si todas culminaron (o
        // solo hay una), toma la primera. Así, tras cerrar un cupo por horas,
        // una nueva inscripción activa no queda tapada por la ya finalizada.
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AsignacionCupo));
        const a = docs.find(x => x.finalizada !== true) ?? docs[0] ?? null;
        setAsignacion(a);
        setCargado(true);
      },
      e => { console.warn('Error en listener (progreso inscripción):', e); setCargado(true); },
    );
    return unsub;
  }, [estudianteId]);

  // Meta de horas del grupo de la asignación.
  useEffect(() => {
    const grupoId = asignacion?.grupoId;
    if (!grupoId) { setMetaHoras(null); return; }
    let cancel = false;
    (async () => {
      try {
        const g = await getDoc(doc(db, 'grupos', grupoId));
        if (cancel) return;
        const d = g.exists() ? (g.data() as any) : {};
        const h = Number(d.horasRequeridas ?? d.total_horas ?? 0);
        setMetaHoras(Number.isFinite(h) && h > 0 ? Math.floor(h) : null);
      } catch {
        if (!cancel) setMetaHoras(null);
      }
    })();
    return () => { cancel = true; };
  }, [asignacion?.grupoId]);

  const progreso =
    asignacion && metaHoras
      ? progresoPorMeta(asignacion.horario, asignacion.fechaPresentacion, metaHoras, new Date(ahora))
      : null;

  // ── Cierre automático al cumplir la meta (Fase E) ──
  // Cuando el libro mayor llega al 100%, el cliente del estudiante marca la
  // asignación `finalizada` y avisa a los 3 roles. Idempotente en el servicio;
  // el ref evita reintentar en cada tick del mismo montaje.
  const finalizando = useRef(false);
  useEffect(() => {
    if (
      !finalizando.current &&
      asignacion &&
      asignacion.estado === 'tomado' &&
      asignacion.finalizada !== true &&
      progreso?.completado
    ) {
      finalizando.current = true;
      void finalizarInscripcionPorHoras(asignacion.id, {
        estudianteNombre: asignacion.estudianteNombre,
        estudianteId: asignacion.estudianteId,
        universidadId: asignacion.universidadId,
        empresaId: asignacion.empresaId,
        empresaNombre: asignacion.empresaNombre,
        vacanteTitulo: asignacion.vacanteTitulo,
        horasCumplidas: metaHoras ?? undefined,
      }).catch(() => { finalizando.current = false; });
    }
  }, [asignacion, progreso?.completado]);

  return { asignacion, metaHoras, progreso, cargado };
}
