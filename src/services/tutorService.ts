// ════════════════════════════════════════════════════════════════════════
// tutorService.ts — rol "tutor" (Fase 1: fundación). El tutor es la persona
// que una EMPRESA delega como encargado on-site de sus pasantes. En esta
// fase solo existe la cuenta y su propio perfil — asignación a pasantes,
// asistencia y observaciones llegan en fases posteriores.
//
// Toda la creación/activación de cuenta pasa por Cloud Functions (Admin
// SDK) — ver functions/src/tutor.ts para el porqué (hace falta mandar un
// correo con credenciales vía Resend, que exige una key secreta solo
// disponible en el servidor).
// ════════════════════════════════════════════════════════════════════════

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, db } from '../config/firebaseConfig';
import type { HorarioPasantia } from '../data/disponibilidad';

const functions = getFunctions(app, 'us-central1');

export const COLECCION_TUTORES = 'perfiles_tutores';

export interface PerfilTutor {
  id: string;
  empresa_id: string;
  nombre_completo: string;
  correo: string;
  cargo: string;
  carnet_trabajo: string;
  foto_url?: string;
  direccion?: string;
  departamento?: string;
  distrito?: string;
  horario?: HorarioPasantia | null;
  activo: boolean;
  fecha_registro?: any;
}

/** Mensaje de un error de callable listo para mostrar — mismo patrón que el
 *  resto de los servicios de este proyecto (quita el sufijo `[NNN]` del SDK). */
function mensajeDeCallable(e: any, porDefecto: string): string {
  const msg = String(e?.message ?? '').replace(/\s*\[\d{3}\]\s*$/, '').trim();
  return msg || porDefecto;
}

export interface ResultadoCrearTutor {
  ok: boolean;
  uid: string;
  /** false si Resend no pudo mandarle las credenciales — la cuenta SÍ quedó
   *  creada; la empresa debe avisarle al tutor por otro medio. */
  emailEnviado: boolean;
}
const _crearTutor = httpsCallable<
  { correo: string; nombreCompleto: string; cargo: string; carnetTrabajo: string },
  ResultadoCrearTutor
>(functions, 'crearTutor');

const _desactivarTutor = httpsCallable<{ tutorId: string }, { ok: boolean; uid: string }>(
  functions, 'desactivarTutor',
);
const _reactivarTutor = httpsCallable<{ tutorId: string }, { ok: boolean; uid: string }>(
  functions, 'reactivarTutor',
);

/** La EMPRESA registra a un tutor: correo, nombre, cargo y carnet de trabajo.
 *  Le llega por correo (nunca se le muestra a la empresa) su contraseña
 *  temporal y el enlace de acceso; el camino real de login es el código OTP
 *  que ya usa el resto de la app. */
export async function crearTutor(datos: {
  correo: string;
  nombreCompleto: string;
  cargo: string;
  carnetTrabajo: string;
}): Promise<ResultadoCrearTutor> {
  try {
    const res = await _crearTutor(datos);
    return res.data;
  } catch (e: any) {
    throw new Error(mensajeDeCallable(e, 'No se pudo registrar al tutor. Intenta de nuevo.'));
  }
}

/** Desactiva un tutor de la propia empresa — no borra su cuenta ni su
 *  historial, solo le quita el acceso. */
export async function desactivarTutor(tutorId: string): Promise<void> {
  try {
    await _desactivarTutor({ tutorId });
  } catch (e: any) {
    throw new Error(mensajeDeCallable(e, 'No se pudo desactivar al tutor. Intenta de nuevo.'));
  }
}

/** Reactiva un tutor previamente desactivado de la propia empresa. */
export async function reactivarTutor(tutorId: string): Promise<void> {
  try {
    await _reactivarTutor({ tutorId });
  } catch (e: any) {
    throw new Error(mensajeDeCallable(e, 'No se pudo reactivar al tutor. Intenta de nuevo.'));
  }
}

/** Suscripción en vivo a todos los tutores de una empresa (para "Mis tutores"). */
export function suscribirTutoresDeEmpresa(
  empresaId: string,
  onChange: (lista: PerfilTutor[]) => void,
  onError?: () => void,
) {
  if (!empresaId) {
    onChange([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(db, COLECCION_TUTORES), where('empresa_id', '==', empresaId)),
    snap => onChange(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as PerfilTutor))),
    e => {
      console.warn('Error en listener (tutores de empresa):', e);
      onError?.();
    },
  );
}

/** Lectura de una sola vez del perfil de un tutor (para su propio dashboard). */
export async function getPerfilTutor(tutorId: string): Promise<PerfilTutor | null> {
  if (!tutorId) return null;
  try {
    const snap = await getDoc(doc(db, COLECCION_TUTORES, tutorId));
    return snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as PerfilTutor) : null;
  } catch {
    return null;
  }
}
