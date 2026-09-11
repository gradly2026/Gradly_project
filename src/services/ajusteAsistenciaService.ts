// ════════════════════════════════════════════════════════════════════════
// ajusteAsistenciaService.ts — "Días no computados" de una pasantía de cupo.
//
// GUÍA PARA PRINCIPIANTES:
// Hoy las horas de una pasantía de cupo se calculan 100% por calendario
// (`progresoPorMeta` en horasPasantia.ts): si el horario dice "Lunes,
// Miércoles y Viernes de 1pm a 4pm", el sistema ASUME que el estudiante
// trabajó cada uno de esos días desde su "Día 1" y suma las horas solo.
// Nadie marca nada.
//
// El problema: si el estudiante se enferma y no va un día, ese día IGUAL
// se cuenta — el sistema no tiene forma de saber que no pasó.
//
// Este archivo agrega esa pieza que faltaba: la empresa (o la universidad)
// puede marcar un día programado como "no computado" (con un motivo). El
// motor de horas salta esos días al sumar Y al calcular la fecha en que se
// completa la meta — así la pasantía se EXTIENDE exactamente lo que ese día
// valía, en vez de perder esas horas en silencio.
//
// Los días no computados de una asignación viven en un documento aparte,
// `ajustes_asistencia/{asignacionId}` (uno por asignación, con un array de
// días adentro) — NO en el propio documento de `asignaciones_cupo`, para no
// tener que tocar sus reglas de seguridad (que ya son bastante finas). Es
// el mismo truco que usa `comprobantes_pasantia`.
// ════════════════════════════════════════════════════════════════════════

import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import { enviarNotificacion } from './notificationService';
import type { AsignacionCupo } from './reclamoCuposService';

export const COLECCION_AJUSTES = 'ajustes_asistencia';

/** Por qué un día no cuenta. */
export type CategoriaAjuste = 'enfermedad' | 'permiso' | 'emergencia' | 'otro';

export const CATEGORIAS_AJUSTE: CategoriaAjuste[] = ['enfermedad', 'permiso', 'emergencia', 'otro'];

export const LABEL_CATEGORIA_AJUSTE: Record<CategoriaAjuste, string> = {
  enfermedad: 'Enfermedad',
  permiso: 'Permiso',
  emergencia: 'Emergencia',
  otro: 'Otro motivo',
};

/** Un día programado del horario que se marcó como "no computado". */
export interface AjusteDia {
  /** ISO `yyyy-mm-dd`. */
  fecha: string;
  categoria: CategoriaAjuste;
  motivo: string;
  /** uid de quien lo marcó. */
  marcadoPor: string;
  marcadoPorRol: 'empresa' | 'universidad';
  /** Date.now() — no serverTimestamp(): vive dentro de un array, Firestore no lo admite ahí. */
  creadoAt: number;
}

const RE_FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Escucha en vivo los días no computados de una asignación. Sin id, entrega
 * `[]` una sola vez (nada que escuchar).
 */
export function suscribirAjustesAsistencia(
  asignacionId: string | null | undefined,
  cb: (dias: AjusteDia[]) => void,
): () => void {
  if (!asignacionId) {
    cb([]);
    return () => {};
  }
  return onSnapshot(
    doc(db, COLECCION_AJUSTES, asignacionId),
    snap => cb(snap.exists() ? (((snap.data() as any).dias ?? []) as AjusteDia[]) : []),
    e => { console.warn('Error en listener (ajustes de asistencia):', e); cb([]); },
  );
}

/**
 * Marca un día programado como "no computado". Si ese día ya tenía una
 * marca, la reemplaza (permite corregir categoría/motivo sin duplicar).
 * Puede marcar la empresa o la universidad dueñas de la asignación.
 */
export async function marcarDiaNoComputado(params: {
  asignacion: AsignacionCupo;
  /** ISO `yyyy-mm-dd`. */
  fecha: string;
  categoria: CategoriaAjuste;
  motivo: string;
  marcadoPor: string;
  marcadoPorRol: 'empresa' | 'universidad';
}): Promise<void> {
  const { asignacion, fecha, categoria, motivo, marcadoPor, marcadoPorRol } = params;
  if (!asignacion?.id) throw new Error('Asignación inválida.');
  if (!RE_FECHA_ISO.test(fecha)) throw new Error('Formato de fecha inválido.');
  if (!motivo.trim()) throw new Error('Indica el motivo.');

  const ref = doc(db, COLECCION_AJUSTES, asignacion.id);
  await runTransaction(db, async tx => {
    // Relee dentro de la transacción: si dos personas marcan el mismo día
    // casi a la vez, la segunda no pisa a la primera con un array viejo.
    const snap = await tx.get(ref);
    const previos: AjusteDia[] = snap.exists() ? ((snap.data() as any).dias ?? []) : [];
    const sinEseDia = previos.filter(d => d.fecha !== fecha);
    const nuevo: AjusteDia = {
      fecha, categoria, motivo: motivo.trim(), marcadoPor, marcadoPorRol, creadoAt: Date.now(),
    };
    // `set` con merge: si el doc no existía, Firestore lo trata como create
    // (allow create); si ya existía, como update (allow update) — así las
    // reglas de arriba lo cubren en ambos casos con un solo bloque de código.
    tx.set(ref, {
      asignacionId: asignacion.id,
      estudianteId: asignacion.estudianteId,
      empresaId: asignacion.empresaId,
      universidadId: asignacion.universidadId,
      dias: [...sinEseDia, nuevo],
      actualizadoAt: serverTimestamp(),
    }, { merge: true });
  });

  // Avisos: al estudiante (por qué se extendió su pasantía) y a la
  // universidad (si no fue ella quien lo marcó). Best-effort: si fallan, el
  // ajuste ya quedó guardado arriba, que es lo que importa.
  const cual = asignacion.vacanteTitulo || 'tu pasantía';
  const etiqueta = LABEL_CATEGORIA_AJUSTE[categoria];
  try {
    if (asignacion.estudianteId) {
      await enviarNotificacion(
        asignacion.estudianteId,
        'Día no computado',
        `${asignacion.empresaNombre || 'La empresa'} registró que el ${fecha} no cuenta para tus horas de "${cual}" (${etiqueta}). Tu pasantía se extiende ese día.`,
        'info',
        '/(tabs)/progreso',
      );
    }
    if (asignacion.universidadId && marcadoPorRol !== 'universidad') {
      await enviarNotificacion(
        asignacion.universidadId,
        'Día no computado',
        `${asignacion.empresaNombre || 'Una empresa'} registró un día no computado (${etiqueta}) para ${asignacion.estudianteNombre || 'un estudiante'}.`,
        'info',
        '/dashboard-universidad',
      );
    }
  } catch (e) {
    console.warn('No se pudo avisar el día no computado:', e);
  }
}

/** Revierte un día marcado: vuelve a contar para el libro mayor de horas. */
export async function reactivarDia(asignacion: AsignacionCupo, fecha: string): Promise<void> {
  if (!asignacion?.id) throw new Error('Asignación inválida.');
  const ref = doc(db, COLECCION_AJUSTES, asignacion.id);
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const previos: AjusteDia[] = (snap.data() as any).dias ?? [];
    tx.update(ref, { dias: previos.filter(d => d.fecha !== fecha), actualizadoAt: serverTimestamp() });
  });
  try {
    if (asignacion.estudianteId) {
      await enviarNotificacion(
        asignacion.estudianteId,
        'Día vuelto a computar',
        `${asignacion.empresaNombre || 'La empresa'} reactivó el ${fecha}: vuelve a contar para tus horas.`,
        'info',
        '/(tabs)/progreso',
      );
    }
  } catch (e) {
    console.warn('No se pudo avisar la reactivación del día:', e);
  }
}
