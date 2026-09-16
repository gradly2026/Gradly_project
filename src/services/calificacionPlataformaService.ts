// ════════════════════════════════════════════════════════════════════════
// calificacionPlataformaService.ts — el usuario califica a GRADLY COMO TAL
// (facilidad de uso, diseño, rendimiento, utilidad general), no a otra
// persona ni a una pasantía real. Se abre desde "Mi perfil → Calificar la
// plataforma", en los 3 roles.
//
// No confundir con:
//   · `feedback_pasantias`  → califica a una PERSONA/empresa tras una
//                      pasantía real (ver ResenasFeedback.tsx).
//   · `incidencias`   → problema OCURRIDO DURANTE una práctica (lo ven
//                      empresa y universidad, no es esto).
//   · `reportes`      → denuncia la CONDUCTA de una persona (solo admin).
//   · `tickets_soporte` → conversación privada 1-a-1 de soporte técnico.
//   · `calificaciones_plataforma` (esto) → opinión sobre LA PLATAFORMA,
//                      pública entre los 3 roles (sin nombre, solo rol).
//
// UNA calificación por usuario, editable: el id del doc ES su uid — volver
// a enviar actualiza la misma, no crea una nueva ni queda un historial de
// envíos repetidos (decisión explícita, no un descuido).
//
// El campo de "reportar un problema/corrección" NO vive en el mismo
// documento que las estrellas: vive en `calificaciones_plataforma_privado/
// {uid}`, con su propia regla de Firestore de lectura SOLO-ADMIN. Una regla
// de Firestore no puede ocultar un campo dentro de un documento que además
// debe ser público por otro lado — la única forma real de que SOLO el admin
// lo vea es que tenga su propio documento con su propia regla (ver
// firestore.rules). Por eso enviarCalificacionPlataforma() puede escribir
// DOS documentos, no uno.
// ════════════════════════════════════════════════════════════════════════

import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { auth, db } from '../config/firebaseConfig';

export const COLECCION_CALIFICACIONES = 'calificaciones_plataforma';
export const COLECCION_CALIFICACIONES_PRIVADO = 'calificaciones_plataforma_privado';

export type RolCalificacion = 'estudiante' | 'empresa' | 'universidad';

// Frase COMPLETA a propósito (no solo "un estudiante" para concatenar con un
// "De " literal en el JSX): el traductor automático (AutoText) traduce cada
// nodo de texto que recibe por separado, así que mezclar un literal fijo con
// una variable en la misma línea de JSX puede traducirse mal o a medias —
// mismo patrón ya usado en ResenasFeedback.tsx para este mismo problema.
export function labelRolCalificacion(r?: string): string {
  return r === 'estudiante'
    ? 'De un estudiante'
    : r === 'empresa'
      ? 'De una empresa'
      : r === 'universidad'
        ? 'De una universidad'
        : 'De un usuario';
}

/** Las 4 categorías que se califican con estrellas (1-5 cada una). */
export interface EstrellasPlataforma {
  facilidadUso: number;
  diseno: number;
  rendimiento: number;
  utilidadGeneral: number;
}

export interface CalificacionPlataforma extends EstrellasPlataforma {
  id: string;
  usuarioId: string;
  usuarioRol: RolCalificacion;
  comentario: string;
  actualizadoAt?: any;
}

export interface CorreccionPlataforma {
  id: string;
  correccion: string;
  actualizadoAt?: any;
}

/** Promedio simple de las 4 categorías — se calcula al vuelo, nunca se
 *  guarda, así nunca puede quedar desactualizado respecto a las estrellas
 *  reales del documento. */
export function promedioCalificacion(c: EstrellasPlataforma): number {
  return (c.facilidadUso + c.diseno + c.rendimiento + c.utilidadGeneral) / 4;
}

const CAMPOS_ESTRELLAS = ['facilidadUso', 'diseno', 'rendimiento', 'utilidadGeneral'] as const;

export interface EnviarCalificacionParams extends EstrellasPlataforma {
  usuarioRol: RolCalificacion;
  comentario: string;
  /** Opcional: problema o error a corregir — queda SOLO para el admin. */
  correccion?: string;
}

/**
 * Crea o actualiza (upsert) la calificación del usuario actual. Las
 * estrellas/comentario van al doc público; la corrección (si escribió algo)
 * al doc privado, solo-admin — si la dejó vacía, no se toca ese segundo doc
 * (no se borra una corrección anterior con un reenvío sin ese campo; el
 * admin la sigue viendo hasta que la atienda por su cuenta).
 */
export async function enviarCalificacionPlataforma(p: EnviarCalificacionParams): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sesión no válida.');
  for (const campo of CAMPOS_ESTRELLAS) {
    const v = p[campo];
    if (!Number.isFinite(v) || v < 1 || v > 5) {
      throw new Error('Completa las 4 estrellas antes de enviar.');
    }
  }

  await setDoc(doc(db, COLECCION_CALIFICACIONES, uid), {
    usuarioId: uid,
    usuarioRol: p.usuarioRol,
    facilidadUso: p.facilidadUso,
    diseno: p.diseno,
    rendimiento: p.rendimiento,
    utilidadGeneral: p.utilidadGeneral,
    comentario: p.comentario.trim(),
    actualizadoAt: serverTimestamp(),
  });

  const correccion = (p.correccion ?? '').trim();
  if (correccion) {
    await setDoc(doc(db, COLECCION_CALIFICACIONES_PRIVADO, uid), {
      correccion,
      actualizadoAt: serverTimestamp(),
    });
  }
}

/** Suscripción EN VIVO a la propia calificación (para precargar el
 *  formulario si el usuario ya había calificado antes). */
export function suscribirMiCalificacion(
  uid: string,
  onChange: (c: CalificacionPlataforma | null) => void,
) {
  if (!uid) { onChange(null); return () => {}; }
  return onSnapshot(
    doc(db, COLECCION_CALIFICACIONES, uid),
    (snap) => onChange(snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as CalificacionPlataforma) : null),
    (e) => console.warn('Error en listener (mi calificación):', e),
  );
}

/**
 * Suscripción EN VIVO a TODAS las calificaciones públicas (para la lista
 * filtrable por rol). Sin `where`: es una colección con un doc por usuario
 * (no por evento), así que no hace falta paginar ni indexar para este
 * tamaño — mismo criterio que otras listas del proyecto que evitan un
 * índice compuesto filtrando/ordenando en cliente.
 */
export function suscribirCalificacionesPlataforma(
  onChange: (lista: CalificacionPlataforma[]) => void,
) {
  return onSnapshot(
    collection(db, COLECCION_CALIFICACIONES),
    (snap) => {
      const lista = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) } as CalificacionPlataforma))
        .sort((a, b) => (b.actualizadoAt?.toMillis?.() ?? 0) - (a.actualizadoAt?.toMillis?.() ?? 0));
      onChange(lista);
    },
    (e) => console.warn('Error en listener (calificaciones plataforma):', e),
  );
}

/** Solo-admin (la regla de Firestore lo exige): las correcciones/problemas
 *  reportados junto con cada calificación. */
export function suscribirCorreccionesPlataforma(
  onChange: (lista: CorreccionPlataforma[]) => void,
) {
  return onSnapshot(
    collection(db, COLECCION_CALIFICACIONES_PRIVADO),
    (snap) => {
      const lista = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) } as CorreccionPlataforma))
        .sort((a, b) => (b.actualizadoAt?.toMillis?.() ?? 0) - (a.actualizadoAt?.toMillis?.() ?? 0));
      onChange(lista);
    },
    (e) => console.warn('Error en listener (correcciones plataforma):', e),
  );
}
