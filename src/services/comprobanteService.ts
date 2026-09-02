// ════════════════════════════════════════════════════════════════════════
// comprobanteService.ts — constancia de finalización de una pasantía POR CUPO.
//
// El modelo de GRUPO (`solicitudes_practicas`) ya tiene su equivalente:
//   finalizarPasantia → constancia (pdf|auto) → certificarPasantia (acredita
//   horas). Ver src/services/solicitudPracticaService.ts.
//
// Aquí el ciclo, para una `asignaciones_cupo` ya culminada (`finalizada: true`):
//
//   (sin doc)  → la empresa aún no manda el comprobante
//   'enviado'  → la empresa lo mandó (auto-generado por el sistema o un PDF
//                propio en papel membretado); la universidad debe validarlo
//   'validado' → la universidad lo revisó y acreditó las horas → proceso 100%
//
// El doc vive en `comprobantes_pasantia/{asignacionId}` (id = id de la
// asignación, 1 a 1). NO se toca `asignaciones_cupo` (sus reglas no cambian).
// ════════════════════════════════════════════════════════════════════════

import {
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { db, storage } from '../config/firebaseConfig';
import type { HorarioPasantia } from '../data/disponibilidad';
import type { AsignacionCupo } from './reclamoCuposService';
import { enviarNotificacion } from './notificationService';

export const COLECCION_COMPROBANTES = 'comprobantes_pasantia';

/** Estados persistidos. La UI añade un "pendiente" virtual cuando no hay doc. */
export type EstadoComprobante = 'enviado' | 'validado';

/** Datos de la constancia — se derivan de la asignación + el libro de horas. */
export interface DatosConstancia {
  asignacionId: string;
  estudianteId: string;
  estudianteNombre: string;
  empresaId: string;
  empresaNombre: string;
  universidadId: string;
  universidadNombre: string;
  vacanteId: string;
  vacanteTitulo: string;
  carrera: string;
  /** ISO `yyyy-mm-dd` — Día 1 (fecha de presentación). */
  fechaInicio: string;
  /** ISO `yyyy-mm-dd` — fin estimado del libro mayor de horas. */
  fechaFin: string;
  /** Horas de práctica cumplidas (= meta del grupo). */
  horasCumplidas: number;
  horario: HorarioPasantia | null;
}

export interface Comprobante extends DatosConstancia {
  id: string;
  estado: EstadoComprobante;
  creadoAt?: any;
  enviadoAt?: any;
  /** Fecha de emisión (ISO `yyyy-mm-dd`) — la fija la empresa al enviar y queda
   *  congelada: es la fecha que muestra la constancia, no la del día en que se
   *  abre/imprime. */
  fechaEmision?: string;
  /** 'auto' = constancia del sistema; 'pdf' = archivo subido por la empresa. */
  origen?: 'auto' | 'pdf';
  archivoUrl?: string | null;
  /** Área/departamento y supervisor — opcionales, los llena la empresa. */
  area?: string;
  supervisor?: string;
  notaEmpresa?: string;
  validadoAt?: any;
  notaUniversidad?: string;
}

/**
 * Arma los datos de la constancia a partir de una asignación culminada y el
 * cierre del libro de horas. Función pura — la usan la pantalla de la empresa
 * (previsualización + PDF) y `enviarComprobante`.
 */
export function construirDatosConstancia(
  a: AsignacionCupo,
  opts: { fechaFin: string; horasCumplidas: number; universidadNombre?: string },
): DatosConstancia {
  return {
    asignacionId: a.id ?? '',
    estudianteId: a.estudianteId ?? '',
    estudianteNombre: a.estudianteNombre ?? '',
    empresaId: a.empresaId ?? '',
    empresaNombre: a.empresaNombre ?? '',
    universidadId: a.universidadId ?? '',
    universidadNombre: opts.universidadNombre ?? '',
    vacanteId: a.vacanteId ?? '',
    vacanteTitulo: a.vacanteTitulo ?? '',
    carrera: a.carrera ?? '',
    fechaInicio: a.fechaPresentacion ?? '',
    fechaFin: opts.fechaFin ?? '',
    horasCumplidas: Math.round(Number(opts.horasCumplidas) || 0),
    horario: a.horario ?? null,
  };
}

/** Lectura de una sola vez del comprobante de una asignación (o null). */
export async function getComprobante(asignacionId: string): Promise<Comprobante | null> {
  if (!asignacionId) return null;
  try {
    const snap = await getDoc(doc(db, COLECCION_COMPROBANTES, asignacionId));
    return snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as Comprobante) : null;
  } catch {
    return null;
  }
}

/** Suscripción en vivo al comprobante de una asignación (para modal/tarjeta). */
export function suscribirComprobante(
  asignacionId: string,
  onChange: (c: Comprobante | null) => void,
  onError?: () => void,
) {
  if (!asignacionId) {
    onChange(null);
    return () => {};
  }
  return onSnapshot(
    doc(db, COLECCION_COMPROBANTES, asignacionId),
    snap => onChange(snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as Comprobante) : null),
    e => {
      console.warn('Error en listener (comprobante):', e);
      onError?.();
    },
  );
}

/**
 * Suscripción a TODOS los comprobantes en los que el usuario es parte, según su
 * rol. Consulta por igualdad de un solo campo (sin índice compuesto); el filtro
 * por estado, si hace falta, se hace en cliente.
 */
export function suscribirComprobantesDeRol(
  rol: 'estudiante' | 'universidad' | 'empresa',
  uid: string,
  onChange: (lista: Comprobante[]) => void,
  onError?: () => void,
) {
  if (!uid) {
    onChange([]);
    return () => {};
  }
  const campo =
    rol === 'estudiante' ? 'estudianteId'
    : rol === 'universidad' ? 'universidadId'
    : 'empresaId';
  return onSnapshot(
    query(collection(db, COLECCION_COMPROBANTES), where(campo, '==', uid)),
    snap => onChange(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Comprobante))),
    e => {
      console.warn('Error en listener (comprobantes por rol):', e);
      onError?.();
    },
  );
}

/**
 * Sube un PDF de comprobante a `constancias_cupo/{asignacionId}/...` y devuelve
 * su URL de descarga. La regla de Storage deja escribir a la empresa (o al
 * estudiante) dueños de la asignación. Espeja a `subirConstanciaPdf` del flujo
 * de grupo.
 */
export async function subirComprobantePdf(
  asignacionId: string,
  fileUri: string,
): Promise<string> {
  const resp = await fetch(fileUri);
  const blob = await resp.blob();
  const r = storageRef(storage, `constancias_cupo/${asignacionId}/comprobante_${Date.now()}.pdf`);
  await uploadBytes(r, blob, { contentType: 'application/pdf' });
  return getDownloadURL(r);
}

/**
 * La EMPRESA envía (o corrige y reenvía) el comprobante. Crea/actualiza el doc
 * en `estado: 'enviado'` y avisa a la universidad (que debe validarlo) y al
 * estudiante. `archivoUrl` presente ⇒ `origen: 'pdf'`; ausente ⇒ `origen: 'auto'`.
 */
export async function enviarComprobante(
  datos: DatosConstancia,
  opts: {
    archivoUrl?: string | null;
    notaEmpresa?: string;
    area?: string;
    supervisor?: string;
    /** ISO `yyyy-mm-dd` — fecha de emisión a congelar. Por defecto, hoy. */
    fechaEmisionISO?: string;
  } = {},
): Promise<void> {
  if (!datos.asignacionId) throw new Error('Asignación inválida.');
  if (!datos.empresaId || !datos.estudianteId || !datos.universidadId) {
    throw new Error('Faltan datos de la pasantía.');
  }

  // La universidad puede no venir denormalizada desde la pantalla de la empresa.
  let universidadNombre = datos.universidadNombre;
  if (!universidadNombre) {
    try {
      const u = await getDoc(doc(db, 'perfiles_universidades', datos.universidadId));
      universidadNombre = (u.data() as any)?.nombre_universidad ?? '';
    } catch {
      universidadNombre = '';
    }
  }

  // OJO: no se relee el doc antes de escribir. Un `getDoc` sobre un
  // `comprobantes_pasantia` inexistente lo DENIEGA la regla de lectura (que
  // referencia `resource.data`, nulo si el doc no existe) → lanzaría
  // "Missing or insufficient permissions". El `setDoc` con `merge` sirve igual
  // para crear y para corregir; `enviadoAt` marca el último envío.
  const ref = doc(db, COLECCION_COMPROBANTES, datos.asignacionId);
  await setDoc(
    ref,
    {
      ...datos,
      universidadNombre,
      estado: 'enviado' as EstadoComprobante,
      origen: opts.archivoUrl ? 'pdf' : 'auto',
      archivoUrl: opts.archivoUrl ?? null,
      area: opts.area ?? '',
      supervisor: opts.supervisor ?? '',
      notaEmpresa: opts.notaEmpresa ?? '',
      fechaEmision: opts.fechaEmisionISO || new Date().toISOString().slice(0, 10),
      enviadoAt: serverTimestamp(),
    },
    { merge: true },
  );

  const quien = datos.estudianteNombre || 'un estudiante';
  const cual = datos.vacanteTitulo || 'su pasantía';
  await enviarNotificacion(
    datos.universidadId,
    'Comprobante de pasantía recibido',
    `${datos.empresaNombre || 'La empresa'} envió el comprobante de finalización de ${quien} ("${cual}"). Revísalo y valídalo.`,
    'warning',
    `comprobante:${datos.asignacionId}`,
  );
  await enviarNotificacion(
    datos.estudianteId,
    'Comprobante enviado',
    `La empresa envió tu comprobante de finalización a tu universidad.`,
    'info',
    `comprobante:${datos.asignacionId}`,
  );
}

/**
 * La UNIVERSIDAD valida el comprobante: pasa `enviado → validado`, acredita las
 * horas de práctica al expediente del estudiante (`horas_aprobadas += N`, igual
 * que `certificarPasantia` del flujo de grupo) y avisa a los 3. Idempotente:
 * relee dentro de la transacción y no hace nada si no estaba `enviado`.
 */
export async function validarComprobante(
  asignacionId: string,
  opts: { notaUniversidad?: string } = {},
): Promise<boolean> {
  if (!asignacionId) throw new Error('Comprobante inválido.');
  const ref = doc(db, COLECCION_COMPROBANTES, asignacionId);

  const info = await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return null;
    const c = snap.data() as Comprobante;
    if (c.estado !== 'enviado') return null;

    tx.update(ref, {
      estado: 'validado' as EstadoComprobante,
      validadoAt: serverTimestamp(),
      notaUniversidad: opts.notaUniversidad?.trim() ?? '',
    });

    const horas = Math.round(Number(c.horasCumplidas) || 0);
    if (horas > 0 && c.estudianteId) {
      tx.update(doc(db, 'perfiles_estudiantes', c.estudianteId), {
        horas_aprobadas: increment(horas),
      });
    }
    return {
      estudianteId: c.estudianteId,
      estudianteNombre: c.estudianteNombre,
      empresaId: c.empresaId,
      universidadId: c.universidadId,
      vacanteTitulo: c.vacanteTitulo,
      horas,
    };
  });

  if (!info) return false;

  const cual = info.vacanteTitulo || 'la pasantía';
  await enviarNotificacion(
    info.estudianteId,
    '¡Pasantía validada!',
    `Tu universidad validó tu comprobante de "${cual}". Se acreditaron ${info.horas} horas de práctica a tu expediente. El proceso quedó 100% culminado.`,
    'success',
    `comprobante:${asignacionId}`,
  );
  if (info.empresaId) {
    await enviarNotificacion(
      info.empresaId,
      'Comprobante validado',
      `La universidad validó el comprobante de finalización de ${info.estudianteNombre || 'el estudiante'}. El proceso quedó culminado.`,
      'success',
      `comprobante:${asignacionId}`,
    );
  }
  if (info.universidadId) {
    await enviarNotificacion(
      info.universidadId,
      'Pasantía culminada al 100%',
      `Validaste el comprobante de ${info.estudianteNombre || 'el estudiante'}. El proceso quedó cerrado.`,
      'success',
      `comprobante:${asignacionId}`,
    );
  }
  return true;
}
