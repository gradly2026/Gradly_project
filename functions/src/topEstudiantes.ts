/**
 * topEstudiantes.ts — Top 3 estudiantes de TODA la plataforma.
 *
 * Es UN solo top para todos (no uno por institución): cada 3 días se recalcula
 * en el servidor y se guarda en UN documento, `ranking_plataforma/top_estudiantes`,
 * que el banner "Estadísticas de la Red Gradly" (NetworkStats.tsx) solo lee. Lo
 * pueden leer empresas, universidades, admin y (desde 2026-09-23) estudiantes
 * (reglas de Firestore). Nadie lo escribe desde la app: solo estas functions,
 * con Admin SDK. Al guardarlo también publican el perfil público filtrado de los
 * 3 ganadores (perfilesPublicos.ts), que es lo que un estudiante abre al tocarlos.
 *
 *  · actualizarTopEstudiantes → job diario (03:00 América/El_Salvador) que solo
 *    recalcula cuando ya pasaron ~3 días desde la última actualización. Con un
 *    "every 72 hours" el ritmo y la hora dependerían del momento del deploy; así
 *    la cadencia es fija y, si una corrida falla, la del día siguiente lo
 *    reintenta sola (la fecha de última actualización no cambia si falla).
 *  · recalcularTopEstudiantes → callable solo admin (Config → "Top 3
 *    estudiantes") para forzar la actualización ya, sin esperar los 3 días
 *    (p. ej. tras banear a alguien de la lista). Reinicia la cuenta de 3 días.
 *
 * Quién entra: estudiantes con horas CERTIFICADAS por su universidad
 * (`horas_aprobadas` > 0) y con calificación en reseñas (`calificacion_promedio`
 * > 0), sin cuenta baneada/inactiva. Orden: promedio ↓, cantidad de reseñas ↓,
 * XP ↓, horas certificadas ↓, nombre y id (desempate estable: mismos datos →
 * mismo top). Cada fila lleva la misma forma que `TopEstudianteEntry`
 * (src/services/topEstudiantesService.ts), así `TopEstudiantesCard` la pinta
 * sin cambios.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { publicarPerfilesPublicos } from "./perfilesPublicos";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

const REGION = "us-central1";
const TZ = "America/El_Salvador";

/** Documento único donde vive el top vigente. */
const RUTA_TOP = "ranking_plataforma/top_estudiantes";
const TOP_N = 3;
/** Cada cuánto se refresca: 3 días. */
const INTERVALO_MS = 3 * 24 * 60 * 60 * 1000;
/** Holgura para que la corrida diaria de las 03:00 no se salte un día por unos
 *  segundos de diferencia con la anterior (72 h menos 1 h = 71 h). */
const HOLGURA_MS = 60 * 60 * 1000;
/** Tope de candidatos cuya cuenta se verifica contra `usuarios` al buscar los
 *  {TOP_N} válidos (si los primeros están baneados, se sigue con los siguientes). */
const MAX_CANDIDATOS_REVISADOS = 50;

/** Misma forma que `TopEstudianteEntry` del cliente. */
export interface EntradaTop {
  id: string;
  nombre: string;
  foto: string | null;
  stars: number;
  rango: string;
  universidadNombre: string;
  empresaNombre: string;
  puesto: string;
  salarioTxt: string | null;
  contratado: boolean;
  horasCertificadas: number;
}

interface Candidato {
  id: string;
  nombre: string;
  foto: string | null;
  promedio: number;
  resenas: number;
  xp: number;
  horas: number;
  rango: string;
  universidadId: string;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const str = (v: unknown): string => String(v ?? "").trim();

/** "$400 - $600" — mismo formato que `textoSalario` del cliente (src/utils/cupos.ts),
 *  duplicado aquí porque functions/ no puede importar código de src/. */
export function textoSalario(min: unknown, max: unknown): string | null {
  const mn = typeof min === "number" && min > 0 ? min : null;
  const mx = typeof max === "number" && max > 0 ? max : null;
  if (mn === null && mx === null) return null;
  if (mn !== null && mx !== null) return mn === mx ? `$${mn}` : `$${mn} - $${mx}`;
  return mn !== null ? `Desde $${mn}` : `Hasta $${mx}`;
}

/** Mismo criterio que `requireAdmin` de admin.ts, reimplementado aquí a
 *  propósito (mismo criterio de duplicar helpers chicos en vez de crear un
 *  import cruzado entre módulos, como hace faqExtractor.ts). */
export async function exigirAdmin(auth: { uid?: string; token?: Record<string, unknown> } | null | undefined): Promise<void> {
  const uid = str(auth?.uid);
  if (!uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  if (str(auth?.token?.role) === "admin") return;
  const snap = await db.collection("usuarios").doc(uid).get();
  if (str(snap.data()?.rol) !== "admin") {
    throw new HttpsError("permission-denied", "No tienes permisos de administrador.");
  }
}

/** Orden del top: promedio ↓ → reseñas ↓ → XP ↓ → horas ↓ → nombre → id. */
export function compararCandidatos(a: Candidato, b: Candidato): number {
  return (
    b.promedio - a.promedio ||
    b.resenas - a.resenas ||
    b.xp - a.xp ||
    b.horas - a.horas ||
    a.nombre.localeCompare(b.nombre, "es") ||
    a.id.localeCompare(b.id)
  );
}

/** ¿La cuenta del estudiante sigue activa? (no baneada ni deshabilitada).
 *  `setUserBan` (admin.ts) escribe `baneado`, `activo` y `status` en `usuarios`. */
async function cuentaActiva(uid: string): Promise<boolean> {
  const snap = await db.collection("usuarios").doc(uid).get();
  if (!snap.exists) return false;
  const d = snap.data() ?? {};
  if (d.baneado === true || d.activo === false) return false;
  const status = str(d.status).toLowerCase();
  return status !== "inactive" && status !== "blocked" && status !== "disabled";
}

/** Marca de tiempo en milisegundos de un campo Timestamp (0 si no hay). */
function ms(v: any): number {
  return typeof v?.toMillis === "function" ? num(v.toMillis()) : 0;
}

/** Arma la fila completa de un estudiante elegido: su universidad y dónde
 *  hace/hizo su pasantía o trabajo. Todo best-effort: un dato que no se pueda
 *  leer deja el campo vacío, nunca tumba el top. */
async function armarEntrada(c: Candidato): Promise<EntradaTop> {
  let universidadNombre = "";
  let empresaNombre = "";
  let puesto = "";
  let salarioTxt: string | null = null;
  let contratado = false;

  try {
    if (c.universidadId) {
      const u = await db.collection("perfiles_universidades").doc(c.universidadId).get();
      universidadNombre = str(u.data()?.nombre_universidad);
    }
  } catch (e) {
    logger.warn("top estudiantes: no se pudo leer la universidad", { uid: c.id, e });
  }

  try {
    // 1) Contrato de empleo ACTIVO: gana sobre cualquier pasantía.
    const contratos = await db.collection("contratos_laborales").where("estudianteId", "==", c.id).get();
    const activo = contratos.docs.map((d) => d.data()).find((x) => x.estado === "activo");
    if (activo) {
      contratado = true;
      empresaNombre = str(activo.empresaNombre);
      puesto = str(activo.vacanteTitulo);
      salarioTxt = textoSalario(activo.salario_min, activo.salario_max);
    } else {
      // 2) Pasantía por cupo (la más reciente que no esté cancelada).
      const cupos = await db.collection("asignaciones_cupo").where("estudianteId", "==", c.id).get();
      const cupo = cupos.docs
        .map((d) => d.data())
        .filter((x) => x.estado !== "cancelado")
        .sort((a, b) => ms(b.fechaTomado) - ms(a.fechaTomado))[0];
      if (cupo) {
        empresaNombre = str(cupo.empresaNombre);
        puesto = str(cupo.vacanteTitulo);
      } else {
        // 3) Pasantía de GRUPO aprobada/finalizada: solo se conoce la empresa.
        const grupos = await db.collection("solicitudes_practicas").where("estudianteIds", "array-contains", c.id).get();
        const grupo = grupos.docs
          .map((d) => d.data())
          .find((x) => x.estado === "aprobado" || x.estado === "finalizado");
        if (grupo) empresaNombre = str(grupo.empresaNombre);
      }
    }
  } catch (e) {
    logger.warn("top estudiantes: no se pudo leer su puesto/empresa", { uid: c.id, e });
  }

  return {
    id: c.id,
    nombre: c.nombre || "Estudiante",
    foto: c.foto,
    stars: c.promedio,
    rango: c.rango,
    universidadNombre,
    empresaNombre,
    puesto,
    salarioTxt,
    contratado,
    horasCertificadas: c.horas,
  };
}

/** Calcula el Top 3 vigente leyendo TODOS los estudiantes con horas certificadas. */
export async function calcularTopEstudiantes(): Promise<{ entradas: EntradaTop[]; elegibles: number }> {
  const snap = await db
    .collection("perfiles_estudiantes")
    .where("horas_aprobadas", ">", 0)
    .select(
      "nombre_completo", "foto_url", "calificacion_promedio", "calificaciones_recibidas",
      "puntos_experiencia", "rango_nivel", "horas_aprobadas", "universidad_id", "activo",
    )
    .get();

  const candidatos: Candidato[] = snap.docs
    .map((d) => {
      const x = d.data() ?? {};
      return {
        activo: x.activo,
        c: {
          id: d.id,
          nombre: str(x.nombre_completo),
          foto: str(x.foto_url) || null,
          promedio: num(x.calificacion_promedio),
          resenas: num(x.calificaciones_recibidas),
          xp: num(x.puntos_experiencia),
          horas: num(x.horas_aprobadas),
          rango: str(x.rango_nivel),
          universidadId: str(x.universidad_id),
        } as Candidato,
      };
    })
    .filter((x) => x.activo !== false && x.c.horas > 0 && x.c.promedio > 0)
    .map((x) => x.c)
    .sort(compararCandidatos);

  const elegidos: Candidato[] = [];
  let revisados = 0;
  for (const c of candidatos) {
    if (elegidos.length >= TOP_N || revisados >= MAX_CANDIDATOS_REVISADOS) break;
    revisados++;
    if (await cuentaActiva(c.id)) elegidos.push(c);
  }

  const entradas = await Promise.all(elegidos.map(armarEntrada));
  return { entradas, elegibles: candidatos.length };
}

/**
 * Recalcula y guarda el Top 3. Sin `forzar`, solo lo hace si ya pasaron ~3 días
 * desde la última actualización (o si nunca se ha calculado).
 */
export async function refrescarTopEstudiantes(
  forzar: boolean,
): Promise<{ actualizado: boolean; entradas: EntradaTop[]; elegibles: number }> {
  if (!forzar) {
    const previo = await db.doc(RUTA_TOP).get();
    const ultimo = ms(previo.data()?.actualizadoAt);
    if (previo.exists && ultimo > 0 && Date.now() - ultimo < INTERVALO_MS - HOLGURA_MS) {
      const d = previo.data() ?? {};
      return {
        actualizado: false,
        entradas: Array.isArray(d.entradas) ? d.entradas : [],
        elegibles: num(d.elegibles),
      };
    }
  }

  const { entradas, elegibles } = await calcularTopEstudiantes();
  await db.doc(RUTA_TOP).set({
    entradas,
    elegibles,
    actualizadoAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  // Perfil público filtrado de los 3 ganadores, para que otro estudiante pueda
  // abrirlos (ver perfilesPublicos.ts). Best-effort: si falla, el Top 3 ya quedó
  // guardado y NO se debe deshacer ni fallar por esto.
  try {
    await publicarPerfilesPublicos(
      entradas.map((e) => e.id),
      new Map(entradas.filter((e) => e.empresaNombre).map((e) => [e.id, e.empresaNombre] as [string, string])),
    );
  } catch (e) {
    logger.warn("top estudiantes: no se pudieron publicar los perfiles públicos", e);
  }
  return { actualizado: true, entradas, elegibles };
}

// ── 1) JOB DIARIO (recalcula solo cada 3 días) ─────────────────────────
export const actualizarTopEstudiantes = onSchedule(
  { schedule: "every day 03:00", region: REGION, timeZone: TZ, memory: "512MiB", timeoutSeconds: 300 },
  async () => {
    try {
      const r = await refrescarTopEstudiantes(false);
      if (r.actualizado) {
        logger.log(`Top 3 estudiantes actualizado (${r.elegibles} elegible(s)): ${r.entradas.map((e) => e.nombre).join(", ") || "nadie aún"}.`);
      } else {
        logger.log("Top 3 estudiantes: aún vigente (no han pasado 3 días), no se recalcula.");
      }
    } catch (e) {
      logger.error("Top 3 estudiantes: falló la actualización", e);
      throw e;
    }
  },
);

// ── 2) RECÁLCULO MANUAL (solo admin) ───────────────────────────────────
export const recalcularTopEstudiantes = onCall(
  { region: REGION, memory: "512MiB", timeoutSeconds: 300 },
  async (req) => {
    await exigirAdmin(req.auth);
    try {
      const r = await refrescarTopEstudiantes(true);
      return { elegibles: r.elegibles, nombres: r.entradas.map((e) => e.nombre) };
    } catch (e) {
      logger.error("recalcularTopEstudiantes: falló", e);
      throw new HttpsError("internal", "No se pudo recalcular el Top 3. Intenta de nuevo.");
    }
  },
);
