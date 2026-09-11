/**
 * Cloud Functions — código de asistencia diario de una pasantía de cupo
 * (Fase 2 de "asistencia real", ver ajusteAsistenciaService.ts para la
 * Fase 1 — "días no computados").
 *
 * FLUJO:
 *   1. El ESTUDIANTE llama generarCodigoAsistencia({}) desde "Mi progreso"
 *      (un día que le toca según su horario) → la function mintea un código
 *      de 8 dígitos de un solo uso, válido hasta la medianoche de hoy (hora
 *      de El Salvador), y lo guarda en `codigos_asistencia/{codigo}`.
 *   2. La EMPRESA (o su tutor, desde la misma cuenta) llama
 *      registrarAsistenciaPorCodigo({ codigo }) desde "Pasantes por cupo" →
 *      valida el código (pertenece a un pasante SUYO, no caducó, no se usó),
 *      marca la asistencia del día en `registros_asistencia/{asigId}_{fecha}`
 *      y devuelve los datos del estudiante para la tarjeta de confirmación.
 *   3. Si llega más de UMBRAL_TARDANZA_MIN minutos tarde, el día queda
 *      `estado:'tarde'`; al acumular TARDANZAS_PARA_INCIDENCIA se abre sola
 *      una incidencia (mismo tubo que ya usa la empresa para reportar a un
 *      pasante — ver incidenciaService.ts, `crearIncidenciaEmpresa`).
 *   4. recordatorioAsistenciaPendiente (programada, 1×/día) avisa a la
 *      empresa si tiene pasantes que hoy les tocaba y aún no han marcado.
 *
 * SEGURIDAD:
 *   - `codigos_asistencia` es read/write:false para clientes (como
 *     `codigos_otp`): solo el Admin SDK (estas functions) lo toca.
 *   - `registros_asistencia` lo leen las 3 partes (transparencia del
 *     historial) pero solo lo escribe el Admin SDK.
 *   - La autorización es por PERTENENCIA (uid del caller == estudianteId /
 *     empresaId de la asignación), no por rol declarado — no hace falta leer
 *     `usuarios/{uid}.rol` para nada de esto.
 *
 * El Salvador no tiene horario de verano: es UTC-6 fijo todo el año, así que
 * la hora/fecha "de hoy" se calcula con un desplazamiento fijo en vez de
 * `Intl.DateTimeFormat` + base de datos de zonas horarias.
 */
import * as crypto from "crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

const REGION = "us-central1";
const TZ = "America/El_Salvador";
/** El Salvador es UTC-6 fijo, sin horario de verano. */
const OFFSET_MS = -6 * 60 * 60 * 1000;

const LONGITUD_CODIGO = 8;
/** Minutos de tolerancia antes de marcar el día como "tarde". */
const UMBRAL_TARDANZA_MIN = 15;
/** Al acumular esta cantidad de "tarde" en la misma pasantía, se abre UNA
 *  incidencia automática (no una por cada tardanza — sería spam). */
const TARDANZAS_PARA_INCIDENCIA = 3;
/** Tope de lecturas por corrida del recordatorio, para no descontrolar el costo. */
const MAX_RECORDATORIOS = 500;

const DIA_A_JS: Record<string, number> = {
  Lunes: 1, Martes: 2, Miércoles: 3, Jueves: 4, Viernes: 5,
};

function generarCodigo(): string {
  const n = crypto.randomInt(0, 10 ** LONGITUD_CODIGO);
  return n.toString().padStart(LONGITUD_CODIGO, "0");
}

/** "Ahora" con los campos UTC* ya desplazados a la hora de El Salvador. */
function ahoraEnSV(): Date {
  return new Date(Date.now() + OFFSET_MS);
}

/** "yyyy-mm-dd" de HOY en El Salvador. */
function hoyISO(): string {
  const d = ahoraEnSV();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Minutos desde medianoche de la hora ACTUAL en El Salvador. */
function horaActualEnMinutos(): number {
  const d = ahoraEnSV();
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** Medianoche de MAÑANA en El Salvador, como instante UTC real — el límite
 *  de vigencia de un código minteado hoy (equivale a "hoy 23:59:59 SV"). */
function finDeHoyEnSV(): Date {
  const iso = hoyISO();
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1, 6, 0, 0));
}

/** "08:00 AM" → minutos desde medianoche (o null si no parsea). */
function parseHora12(s?: string | null): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(s).trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (/PM/i.test(m[3])) h += 12;
  return h * 60 + Number(m[2]);
}

/** getDay() (0=domingo) de un ISO `yyyy-mm-dd`, con aritmética 100% UTC (no
 *  depende de la zona horaria del runtime de la function). */
function getDayOfISO(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return -1;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
}

/** Cuántos días programados del horario caen entre `inicioISO` y `hoyISO_`
 *  (ambos incluidos), saltando `excluidas` (días no computados, Fase 1) —
 *  el número de "día N" de práctica que se le muestra al pasante y a la
 *  empresa. Mismo bucle día-a-día que horasPasantia.ts, autocontenido aquí
 *  porque functions/ no importa código de src/ (proyectos TS separados). */
function contarDiaN(
  diasSet: Set<number>, inicioISO: string, hoyISO_: string, excluidas: Set<string>,
): number {
  const mi = /^(\d{4})-(\d{2})-(\d{2})$/.exec(inicioISO);
  const mh = /^(\d{4})-(\d{2})-(\d{2})$/.exec(hoyISO_);
  if (!mi || !mh) return 0;
  const fin = Date.UTC(Number(mh[1]), Number(mh[2]) - 1, Number(mh[3]));
  let cursor = Date.UTC(Number(mi[1]), Number(mi[2]) - 1, Number(mi[3]));
  let n = 0;
  let guard = 0;
  while (cursor <= fin && guard < 4000) {
    guard++;
    const d = new Date(cursor);
    const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    if (diasSet.has(d.getUTCDay()) && !excluidas.has(iso)) n++;
    cursor += 24 * 60 * 60 * 1000;
  }
  return n;
}

/** Notificación de campanita (mismo formato que notificationService del cliente). */
async function notificar(
  destinatario_id: string, titulo: string, mensaje: string, tipo: string, link: string,
): Promise<void> {
  if (!destinatario_id) return;
  try {
    const ahora = admin.firestore.FieldValue.serverTimestamp();
    await db.collection("notificaciones_app").add({
      destinatario_id, titulo, mensaje, tipo,
      referencia_id: link, link_accion: link, leido: false, createdAt: ahora, fecha: ahora,
    });
  } catch (e) {
    logger.warn("No se pudo notificar", { destinatario_id, e });
  }
}

async function diasExcluidosDe(asignacionId: string): Promise<Set<string>> {
  try {
    const snap = await db.collection("ajustes_asistencia").doc(asignacionId).get();
    const dias = snap.exists ? ((snap.data()?.dias ?? []) as { fecha: string }[]) : [];
    return new Set(dias.map((d) => d.fecha));
  } catch {
    return new Set();
  }
}

// ── 1) EL ESTUDIANTE PIDE SU CÓDIGO DE HOY ─────────────────────────
export const generarCodigoAsistencia = onCall({ region: REGION }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sesión requerida.");

  const asigSnap = await db.collection("asignaciones_cupo")
    .where("estudianteId", "==", uid)
    .where("estado", "==", "tomado")
    .get();
  const activa = asigSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .find((a) => a.finalizada !== true);
  if (!activa) throw new HttpsError("failed-precondition", "No tienes una pasantía activa.");
  if (!activa.fechaPresentacion) {
    throw new HttpsError("failed-precondition", "Tu empresa todavía no fija tu primer día.");
  }

  const horario = activa.horario ?? {};
  const dias: string[] = Array.isArray(horario.dias) ? horario.dias : [];
  const diasSet = new Set(dias.map((d) => DIA_A_JS[d]).filter((n): n is number => n !== undefined));
  const fecha = hoyISO();

  if (fecha < activa.fechaPresentacion || !diasSet.has(getDayOfISO(fecha))) {
    throw new HttpsError("failed-precondition", "Hoy no te toca según tu horario.");
  }

  // Ya se registró hoy: nada que generar.
  const regRef = db.collection("registros_asistencia").doc(`${activa.id}_${fecha}`);
  if ((await regRef.get()).exists) {
    throw new HttpsError("already-exists", "Ya marcaste tu asistencia de hoy.");
  }

  const excluidas = await diasExcluidosDe(activa.id);
  const diaN = contarDiaN(diasSet, activa.fechaPresentacion, fecha, excluidas);

  // Idempotencia: si ya hay un código vigente sin usar para HOY, se reutiliza
  // en vez de mintear uno nuevo (evita que dos códigos válidos confundan a
  // la empresa sobre cuál es el bueno).
  const existente = await db.collection("codigos_asistencia")
    .where("asignacionId", "==", activa.id)
    .where("fecha", "==", fecha)
    .where("usado", "==", false)
    .limit(1)
    .get();

  let codigo: string;
  let expiraAtMs: number;

  if (!existente.empty) {
    const d = existente.docs[0];
    codigo = d.id;
    expiraAtMs = (d.data().expiraAt as admin.firestore.Timestamp).toMillis();
  } else {
    let intentos = 0;
    let ref: FirebaseFirestore.DocumentReference;
    for (;;) {
      codigo = generarCodigo();
      ref = db.collection("codigos_asistencia").doc(codigo);
      if (!(await ref.get()).exists) break;
      if (++intentos > 5) throw new HttpsError("internal", "No se pudo generar el código. Intenta de nuevo.");
    }
    const expira = finDeHoyEnSV();
    expiraAtMs = expira.getTime();
    await ref!.set({
      asignacionId: activa.id,
      estudianteId: uid,
      empresaId: activa.empresaId,
      universidadId: activa.universidadId,
      fecha,
      tipo: "entrada",
      usado: false,
      usadoAt: null,
      usadoPor: null,
      creadoAt: admin.firestore.FieldValue.serverTimestamp(),
      expiraAt: admin.firestore.Timestamp.fromDate(expira),
    });
  }

  return {
    codigo, expiraAt: expiraAtMs, fecha, diaN,
    horaInicio: horario.horaInicio ?? null,
    horaFin: horario.horaFin ?? null,
  };
});

// ── 2) LA EMPRESA REGISTRA LA ASISTENCIA CON EL CÓDIGO ─────────────
export const registrarAsistenciaPorCodigo = onCall({ region: REGION }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sesión requerida.");
  const codigo = String(req.data?.codigo ?? "").trim();
  if (!/^\d{8}$/.test(codigo)) throw new HttpsError("invalid-argument", "Código inválido.");

  const codRef = db.collection("codigos_asistencia").doc(codigo);
  const codSnap = await codRef.get();
  if (!codSnap.exists) throw new HttpsError("not-found", "Código no encontrado.");
  const c = codSnap.data()!;

  if (c.empresaId !== uid) {
    throw new HttpsError("permission-denied", "Este código no pertenece a un pasante de tu empresa.");
  }
  if (c.usado === true) throw new HttpsError("already-exists", "Este código ya fue usado.");
  const expiraAtMs = (c.expiraAt as admin.firestore.Timestamp)?.toMillis?.() ?? 0;
  if (Date.now() > expiraAtMs) throw new HttpsError("deadline-exceeded", "Este código ya caducó.");

  const asigSnap = await db.collection("asignaciones_cupo").doc(String(c.asignacionId)).get();
  if (!asigSnap.exists) throw new HttpsError("not-found", "La pasantía asociada ya no existe.");
  const a = asigSnap.data() as any;
  const horario = a.horario ?? {};

  const horaInicioMin = parseHora12(horario.horaInicio);
  const ahoraMin = horaActualEnMinutos();
  let estado: "presente" | "tarde" = "presente";
  let tardanzaMin = 0;
  if (horaInicioMin != null && ahoraMin > horaInicioMin + UMBRAL_TARDANZA_MIN) {
    estado = "tarde";
    tardanzaMin = ahoraMin - horaInicioMin;
  }

  const regRef = db.collection("registros_asistencia").doc(`${c.asignacionId}_${c.fecha}`);

  // El estado autoritativo (usado / ya registrado) se revalida DENTRO de la
  // transacción — los chequeos de arriba son solo para responder con el
  // error más claro posible antes de gastar una escritura.
  await db.runTransaction(async (tx) => {
    const [codTx, regTx] = await Promise.all([tx.get(codRef), tx.get(regRef)]);
    if (!codTx.exists) throw new HttpsError("not-found", "Código no encontrado.");
    if (codTx.data()?.usado === true) throw new HttpsError("already-exists", "Este código ya fue usado.");
    if (regTx.exists) throw new HttpsError("already-exists", "Ya se registró la asistencia de este día.");
    tx.update(codRef, { usado: true, usadoAt: admin.firestore.FieldValue.serverTimestamp(), usadoPor: uid });
    tx.set(regRef, {
      asignacionId: c.asignacionId,
      estudianteId: c.estudianteId,
      empresaId: c.empresaId,
      universidadId: c.universidadId,
      fecha: c.fecha,
      estado,
      tardanzaMin,
      horaEntrada: admin.firestore.FieldValue.serverTimestamp(),
      marcadoPor: uid,
      creadoAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  // Tardanza reiterada → UNA incidencia automática, al cruzar el umbral
  // exacto (no en cada tardanza posterior — sería spam). Mismo formato de
  // documento que crearIncidenciaEmpresa (incidenciaService.ts).
  if (estado === "tarde") {
    try {
      const tardesSnap = await db.collection("registros_asistencia")
        .where("asignacionId", "==", c.asignacionId)
        .where("estado", "==", "tarde")
        .get();
      if (tardesSnap.size === TARDANZAS_PARA_INCIDENCIA) {
        const ahora = admin.firestore.FieldValue.serverTimestamp();
        await db.collection("incidencias").add({
          estudiante_id: a.estudianteId ?? c.estudianteId,
          estudiante_nombre: a.estudianteNombre ?? "",
          universidad_id: a.universidadId ?? "",
          empresa_id: a.empresaId ?? "",
          empresa_nombre: a.empresaNombre ?? "",
          categoria: "estudiante",
          origen: "empresa",
          visible_estudiante: false,
          motivo: "Llegadas tarde reiteradas",
          descripcion: `El sistema de asistencia registró ${TARDANZAS_PARA_INCIDENCIA} llegadas tarde en esta pasantía.`,
          estado: "abierta",
          seguimiento: [],
          resolucion: "",
          fecha: ahora,
          fecha_actualizacion: ahora,
        });
        if (a.universidadId) {
          await notificar(
            a.universidadId, "Llegadas tarde reiteradas",
            `${a.estudianteNombre || "Un estudiante"} acumula ${TARDANZAS_PARA_INCIDENCIA} llegadas tarde en su pasantía.`,
            "warning", "/dashboard-universidad",
          );
        }
      }
    } catch (e) {
      logger.warn("No se pudo crear la incidencia automática de tardanza", e);
    }
  }

  try {
    await notificar(
      c.estudianteId, "Asistencia registrada",
      `Se registró tu asistencia de hoy${estado === "tarde" ? " (llegada tarde)" : ""}.`,
      estado === "tarde" ? "warning" : "success", "/(tabs)/progreso",
    );
  } catch { /* no crítico */ }

  let universidadNombre = "";
  if (a.universidadId) {
    try {
      const uSnap = await db.collection("perfiles_universidades").doc(a.universidadId).get();
      universidadNombre = (uSnap.data()?.nombre_universidad as string) ?? "";
    } catch { /* no crítico */ }
  }

  const diasHoy: string[] = Array.isArray(horario.dias) ? horario.dias : [];
  const diasSet = new Set(diasHoy.map((d) => DIA_A_JS[d]).filter((n): n is number => n !== undefined));
  const excluidas = await diasExcluidosDe(String(c.asignacionId));
  const diaN = a.fechaPresentacion ? contarDiaN(diasSet, a.fechaPresentacion, String(c.fecha), excluidas) : null;

  return {
    ok: true,
    estado,
    tardanzaMin,
    estudiante: {
      nombre: a.estudianteNombre ?? "",
      universidadNombre,
      carrera: a.carrera ?? "",
      vacanteTitulo: a.vacanteTitulo ?? "",
      diaN,
      horaInicio: horario.horaInicio ?? null,
      horaFin: horario.horaFin ?? null,
    },
  };
});

// ── 3) RECORDATORIO DIARIO A LA EMPRESA (pasantes sin asistencia marcada) ──
export const recordatorioAsistenciaPendiente = onSchedule(
  { schedule: "every day 11:00", region: REGION, timeZone: TZ },
  async () => {
    const fecha = hoyISO();
    const diaJS = getDayOfISO(fecha);

    const snap = await db.collection("asignaciones_cupo").where("estado", "==", "tomado").get();
    const candidatas = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter((a) => a.finalizada !== true && a.fechaPresentacion && a.fechaPresentacion <= fecha)
      .filter((a) => {
        const dias: string[] = Array.isArray(a.horario?.dias) ? a.horario.dias : [];
        return new Set(dias.map((d) => DIA_A_JS[d])).has(diaJS);
      })
      .slice(0, MAX_RECORDATORIOS);

    if (candidatas.length === 0) {
      logger.log("Recordatorio de asistencia: nadie programado hoy.");
      return;
    }

    const pendientes: any[] = [];
    for (const a of candidatas) {
      const reg = await db.collection("registros_asistencia").doc(`${a.id}_${fecha}`).get();
      if (!reg.exists) pendientes.push(a);
    }
    if (pendientes.length === 0) {
      logger.log("Recordatorio de asistencia: todos ya marcaron.");
      return;
    }

    const porEmpresa = new Map<string, number>();
    for (const p of pendientes) {
      if (!p.empresaId) continue;
      porEmpresa.set(p.empresaId, (porEmpresa.get(p.empresaId) ?? 0) + 1);
    }
    for (const [empresaId, count] of porEmpresa) {
      await notificar(
        empresaId, "Asistencia sin marcar",
        count === 1
          ? "Tienes un pasante sin registrar asistencia hoy. Pídele su código."
          : `Tienes ${count} pasantes sin registrar asistencia hoy. Pídeles su código.`,
        "warning", "/dashboard-empresa",
      );
    }
    logger.log(`Recordatorio de asistencia: ${pendientes.length} pendiente(s) en ${porEmpresa.size} empresa(s).`);
  },
);
