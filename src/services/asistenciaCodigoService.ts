// ════════════════════════════════════════════════════════════════════════
// asistenciaCodigoService.ts — código de asistencia diario de una pasantía
// de cupo (Fase 2 de "asistencia real"). Backend: functions/src/asistencia.ts
// (callables generarCodigoAsistencia / registrarAsistenciaPorCodigo).
//
// El estudiante pide su código de hoy; la empresa lo ingresa para marcar la
// asistencia. Toda la validación (pertenencia, caducidad, uso único) vive en
// el servidor — el cliente solo llama y muestra el resultado. Ver
// [[project_asistencia_pasantia]] en memoria para el diseño completo.
// ════════════════════════════════════════════════════════════════════════
import { doc, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, db } from '../config/firebaseConfig';

const functions = getFunctions(app, 'us-central1');

export interface CodigoAsistencia {
  codigo: string;
  /** Milisegundos (epoch) hasta que el código deja de ser válido (hoy 23:59 hora SV). */
  expiraAt: number;
  fecha: string;
  /** Número de día de práctica (cuenta días programados desde el Día 1). */
  diaN: number;
  horaInicio: string | null;
  horaFin: string | null;
}

export interface ConfirmacionAsistencia {
  estado: 'presente' | 'tarde';
  tardanzaMin: number;
  estudiante: {
    nombre: string;
    universidadNombre: string;
    carrera: string;
    vacanteTitulo: string;
    diaN: number | null;
    horaInicio: string | null;
    horaFin: string | null;
  };
}

/** Por qué falló el registro — para pintar el campo de rojo con el motivo correcto. */
export type ErrorCodigoAsistencia = 'no-encontrado' | 'otra-empresa' | 'usado' | 'caducado' | 'otro';

export class AsistenciaCodigoError extends Error {
  tipo: ErrorCodigoAsistencia;
  constructor(tipo: ErrorCodigoAsistencia, mensaje: string) {
    super(mensaje);
    this.tipo = tipo;
  }
}

const _generarCodigoAsistencia = httpsCallable<Record<string, never>, CodigoAsistencia>(
  functions, 'generarCodigoAsistencia',
);
const _registrarAsistenciaPorCodigo = httpsCallable<{ codigo: string }, ConfirmacionAsistencia>(
  functions, 'registrarAsistenciaPorCodigo',
);

/** Pide (o recupera, si ya había uno vigente sin usar) el código de hoy del estudiante. */
export async function generarCodigoDeHoy(): Promise<CodigoAsistencia> {
  try {
    const res = await _generarCodigoAsistencia({});
    return res.data;
  } catch (e: any) {
    throw new Error(String(e?.message ?? '') || 'No se pudo generar tu código. Intenta de nuevo.');
  }
}

/** La empresa canjea el código de un estudiante y marca su asistencia de hoy. */
export async function registrarAsistenciaConCodigo(codigo: string): Promise<ConfirmacionAsistencia> {
  try {
    const res = await _registrarAsistenciaPorCodigo({ codigo });
    return res.data;
  } catch (e: any) {
    const code = String(e?.code ?? '');
    let tipo: ErrorCodigoAsistencia = 'otro';
    if (code.includes('not-found')) tipo = 'no-encontrado';
    else if (code.includes('permission-denied')) tipo = 'otra-empresa';
    else if (code.includes('already-exists')) tipo = 'usado';
    else if (code.includes('deadline-exceeded')) tipo = 'caducado';
    throw new AsistenciaCodigoError(
      tipo, String(e?.message ?? '') || 'No se pudo registrar la asistencia. Intenta de nuevo.',
    );
  }
}

// ── Lectura del registro de HOY (para la UI del estudiante) ────────
// `registros_asistencia` lo leen las 3 partes (ver firestore.rules); esto es
// solo un `onSnapshot` directo, no pasa por una Cloud Function.

export interface RegistroAsistenciaDia {
  estado: 'presente' | 'tarde';
  tardanzaMin: number;
}

/** ISO `yyyy-mm-dd` de HOY según el reloj del dispositivo — solo para decidir
 *  qué mostrar en la UI (botón vs. "ya registrada"); la validez real del
 *  código la decide siempre el servidor con su propio reloj. */
export function hoyISOLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Escucha el registro de asistencia de HOY de una asignación (o `null` si
 *  todavía no se ha marcado). */
export function suscribirRegistroDeHoy(
  asignacionId: string | null | undefined,
  cb: (registro: RegistroAsistenciaDia | null) => void,
): () => void {
  if (!asignacionId) { cb(null); return () => {}; }
  const id = `${asignacionId}_${hoyISOLocal()}`;
  return onSnapshot(
    doc(db, 'registros_asistencia', id),
    snap => {
      if (!snap.exists()) { cb(null); return; }
      const d = snap.data() as any;
      cb({ estado: d.estado === 'tarde' ? 'tarde' : 'presente', tardanzaMin: Number(d.tardanzaMin) || 0 });
    },
    () => cb(null),
  );
}
