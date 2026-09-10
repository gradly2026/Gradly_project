// ════════════════════════════════════════════════════════════════════════
// historialLaboralService.ts — "Historial de puestos" (empleo real): la lista
// de contratos TERMINADOS (renuncia/despido) de un estudiante o de una empresa.
//
// Dos fuentes según quién mira:
//   · getHistorialPropio  → el DUEÑO ve su propio historial completo, leyendo
//     `contratos_laborales` (solo las partes pueden). Incluye el motivo real
//     del despido.
//   · getHistorialPublico → un TERCERO ve la versión sanitizada, leyendo
//     `historial_laboral_publico` (cualquier autenticado). El motivo del
//     despido NO viaja ahí; el de la renuncia sí (criterio "intermedio").
//
// El espejo público lo escribe `contratoService.escribirHistorialPublico` al
// finalizar el contrato.
// ════════════════════════════════════════════════════════════════════════

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import { COL_CONTRATOS, COL_HISTORIAL_PUB, type ContratoLaboral } from './contratoService';

/** Rol del perfil cuyo historial se muestra. */
export type RolHistorial = 'estudiante' | 'empresa';

/** Una fila del historial, ya lista para pintar (da igual la fuente). */
export interface EntradaHistorial {
  contratoId: string;
  /** El OTRO: la empresa si el perfil es de un estudiante; el estudiante si es de una empresa. */
  contraparteId: string;
  contraparteNombre: string;
  puesto: string;
  fechaInicio: Date | null;
  fechaFin: Date | null;
  estado: 'renuncia' | 'despido';
  finPor: 'empresa' | 'estudiante';
  /** Motivo a mostrar ('' si es un despido y quien mira no tiene derecho a verlo). */
  motivo: string;
  /** true = hubo un motivo pero está oculto para quien mira (despido en vista pública). */
  motivoOculto: boolean;
}

const aFecha = (v: any): Date | null => {
  if (!v) return null;
  if (typeof v?.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const ordenar = (a: EntradaHistorial, b: EntradaHistorial) =>
  (b.fechaFin?.getTime() ?? 0) - (a.fechaFin?.getTime() ?? 0);

/**
 * Historial COMPLETO del propio dueño (lee `contratos_laborales`). Solo funciona
 * para `uid === request.auth.uid` con el `campo` correcto (las reglas lo exigen).
 */
export async function getHistorialPropio(
  rol: RolHistorial,
  uid: string,
): Promise<EntradaHistorial[]> {
  if (!uid) return [];
  const campo = rol === 'estudiante' ? 'estudianteId' : 'empresaId';
  try {
    const snap = await getDocs(query(collection(db, COL_CONTRATOS), where(campo, '==', uid)));
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) } as ContratoLaboral))
      .filter((c) => c.estado === 'renuncia' || c.estado === 'despido')
      .map((c) => ({
        contratoId: c.id,
        contraparteId: rol === 'estudiante' ? c.empresaId : c.estudianteId,
        contraparteNombre: rol === 'estudiante' ? (c.empresaNombre ?? '') : (c.estudianteNombre ?? ''),
        puesto: c.vacanteTitulo ?? '',
        fechaInicio: aFecha(c.fechaInicio),
        fechaFin: aFecha(c.fechaFin),
        estado: c.estado as 'renuncia' | 'despido',
        finPor: (c.finPor ?? (c.estado === 'despido' ? 'empresa' : 'estudiante')) as 'empresa' | 'estudiante',
        motivo: c.motivoFin ?? '',
        motivoOculto: false,
      }))
      .sort(ordenar);
  } catch (e) {
    console.warn('getHistorialPropio:', e);
    return [];
  }
}

/**
 * Historial PÚBLICO (lee `historial_laboral_publico`). Lo que ve un tercero en
 * el perfil de un estudiante o de una empresa. Sin motivos de despido.
 */
export async function getHistorialPublico(
  rol: RolHistorial,
  id: string,
): Promise<EntradaHistorial[]> {
  if (!id) return [];
  const campo = rol === 'estudiante' ? 'estudianteId' : 'empresaId';
  try {
    const snap = await getDocs(query(collection(db, COL_HISTORIAL_PUB), where(campo, '==', id)));
    return snap.docs
      .map((d) => d.data() as any)
      .map((e) => {
        const estado = (e.estado === 'despido' ? 'despido' : 'renuncia') as 'renuncia' | 'despido';
        return {
          contratoId: String(e.contratoId ?? ''),
          contraparteId: rol === 'estudiante' ? String(e.empresaId ?? '') : String(e.estudianteId ?? ''),
          contraparteNombre: rol === 'estudiante' ? String(e.empresaNombre ?? '') : String(e.estudianteNombre ?? ''),
          puesto: String(e.vacanteTitulo ?? ''),
          fechaInicio: aFecha(e.fechaInicio),
          fechaFin: aFecha(e.fechaFin),
          estado,
          finPor: (e.finPor === 'empresa' ? 'empresa' : 'estudiante') as 'empresa' | 'estudiante',
          motivo: String(e.motivoPublico ?? ''),
          // Un despido siempre tuvo un motivo; en la vista pública está oculto.
          motivoOculto: estado === 'despido',
        };
      })
      .sort(ordenar);
  } catch (e) {
    console.warn('getHistorialPublico:', e);
    return [];
  }
}
