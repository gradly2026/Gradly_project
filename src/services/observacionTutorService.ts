// ════════════════════════════════════════════════════════════════════════
// observacionTutorService.ts — bitácora del tutor (rol "tutor", Fase 3): una
// nota de texto por (asignación, día), que el tutor escribe/edita mientras
// ese día sigue siendo "hoy" y que queda congelada al día siguiente. Backend:
// functions/src/asistencia.ts (callable registrarObservacionTutor), que
// SIEMPRE decide la fecha con el reloj del servidor — nunca la manda el
// cliente. Colección aparte de `registros_asistencia` a propósito: ver el
// comentario del bloque `observaciones_tutor` en firestore.rules.
// ════════════════════════════════════════════════════════════════════════
import { doc, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, db } from '../config/firebaseConfig';

const functions = getFunctions(app, 'us-central1');

export interface ObservacionTutorDia {
  texto: string;
  tutorId: string;
  actualizadoAt: number | null;
}

/** Mensaje de un error de callable listo para mostrar — mismo patrón que el
 *  resto de los servicios de este proyecto (quita el sufijo `[NNN]` del SDK). */
function mensajeDeCallable(e: any, porDefecto: string): string {
  const msg = String(e?.message ?? '').replace(/\s*\[\d{3}\]\s*$/, '').trim();
  return msg || porDefecto;
}

const _registrarObservacionTutor = httpsCallable<
  { asignacionId: string; texto: string },
  { ok: boolean; fecha: string }
>(functions, 'registrarObservacionTutor');

/** El tutor escribe o edita su observación de HOY sobre un pasante suyo.
 *  `texto` vacío borra la nota — sigue permitido mientras el día no se
 *  haya congelado. La fecha la decide siempre el servidor. */
export async function registrarObservacionTutor(
  asignacionId: string,
  texto: string,
): Promise<{ ok: boolean; fecha: string }> {
  try {
    const res = await _registrarObservacionTutor({ asignacionId, texto });
    return res.data;
  } catch (e: any) {
    throw new Error(mensajeDeCallable(e, 'No se pudo guardar la observación. Intenta de nuevo.'));
  }
}

function mapObservacion(data: any): ObservacionTutorDia {
  return {
    texto: typeof data.texto === 'string' ? data.texto : '',
    tutorId: typeof data.tutorId === 'string' ? data.tutorId : '',
    actualizadoAt: typeof data.actualizadoAt?.toMillis === 'function' ? data.actualizadoAt.toMillis() : null,
  };
}

/** Escucha la observación de una asignación en una fecha puntual
 *  (`yyyy-mm-dd`), o `null` si ese día no tiene ninguna. */
export function suscribirObservacionDia(
  asignacionId: string | null | undefined,
  fecha: string,
  cb: (observacion: ObservacionTutorDia | null) => void,
): () => void {
  if (!asignacionId) { cb(null); return () => {}; }
  return onSnapshot(
    doc(db, 'observaciones_tutor', `${asignacionId}_${fecha}`),
    snap => cb(snap.exists() ? mapObservacion(snap.data()) : null),
    () => cb(null),
  );
}
