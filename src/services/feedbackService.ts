import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "../config/firebaseConfig";

// ═══════════════════════════════════════════════════════════════════
// SISTEMA DE RANGOS (GAMIFICACIÓN)
// ═══════════════════════════════════════════════════════════════════

export type RangoTier = "bronce" | "plata" | "oro";
export type EntidadRol = "estudiante" | "empresa" | "universidad";

export interface RangoInfo {
  /** String persistido en `rango_nivel`. */
  nivel: string;
  tier: RangoTier;
  /** Color del metal (oro/plata/bronce). */
  color: string;
  /** Límite inferior de XP del rango actual. */
  min: number;
  /** Límite superior de XP del rango (Infinity en el máximo). */
  max: number;
  /** XP a la que empieza el siguiente rango (null si ya es el máximo). */
  siguiente: number | null;
}

/** Colores metálicos por tier. */
export const TIER_COLORS: Record<RangoTier, string> = {
  bronce: "#CD7F32",
  plata: "#AEB6BF",
  oro: "#E6B422",
};

/** Nombres de rango por rol y tier: [bronce, plata, oro]. */
const NOMBRES_RANGO: Record<EntidadRol, readonly [string, string, string]> = {
  estudiante: ["Novato", "Profesional", "Máster"],
  empresa: ["Empresa Nueva", "Empresa Confiable", "Empresa Destacada Top"],
  universidad: ["Universidad Nueva", "Universidad Confiable", "Universidad Destacada Top"],
};

/**
 * Rango según la XP acumulada (mismos cortes para los 3 roles, solo cambia el
 * nombre):
 *  - 0–300     → Novato / Empresa Nueva / Universidad Nueva            (bronce)
 *  - 301–1000  → Profesional / Empresa Confiable / Universidad Confiable (plata)
 *  - >1000     → Máster / Empresa Destacada Top / Universidad Destacada Top (oro)
 */
export function calcularRango(xp: number, rol: EntidadRol): RangoInfo {
  const nombres = NOMBRES_RANGO[rol] ?? NOMBRES_RANGO.estudiante;
  const seguro = Math.max(0, Number.isFinite(xp) ? xp : 0);

  if (seguro > 1000) {
    return {
      nivel: nombres[2],
      tier: "oro",
      color: TIER_COLORS.oro,
      min: 1001,
      max: Infinity,
      siguiente: null,
    };
  }
  if (seguro > 300) {
    return {
      nivel: nombres[1],
      tier: "plata",
      color: TIER_COLORS.plata,
      min: 301,
      max: 1000,
      siguiente: 1001,
    };
  }
  return {
    nivel: nombres[0],
    tier: "bronce",
    color: TIER_COLORS.bronce,
    min: 0,
    max: 300,
    siguiente: 301,
  };
}

/**
 * XP ganada según el promedio de estrellas de la evaluación:
 *  - 4–5 estrellas → +100 XP
 *  - 3 estrellas   → +50 XP
 *  - <3 estrellas  → +20 XP
 */
export function calcularXP(promedioEstrellas: number): number {
  if (promedioEstrellas >= 4) return 100;
  if (promedioEstrellas >= 3) return 50;
  return 20;
}

/** Progreso [0–1] dentro del rango actual (para la barra de XP). */
export function progresoRango(xp: number, rango: RangoInfo): number {
  if (rango.siguiente === null) return 1;
  const span = rango.siguiente - rango.min;
  if (span <= 0) return 1;
  return Math.max(0, Math.min(1, (xp - rango.min) / span));
}

// ═══════════════════════════════════════════════════════════════════
// CRITERIOS DE EVALUACIÓN POR ROL
// ═══════════════════════════════════════════════════════════════════

/** El estudiante evalúa a la empresa. */
export const CRITERIOS_ESTUDIANTE_A_EMPRESA = [
  { key: "ambiente_laboral", label: "Ambiente laboral" },
  { key: "mentoria", label: "Mentoría" },
  { key: "cumplimiento_horarios", label: "Cumplimiento de horarios" },
] as const;

/** La empresa evalúa al estudiante. */
export const CRITERIOS_EMPRESA_A_ESTUDIANTE = [
  { key: "proactividad", label: "Proactividad" },
  { key: "puntualidad", label: "Puntualidad" },
  { key: "habilidades_tecnicas", label: "Habilidades técnicas" },
  { key: "trabajo_equipo", label: "Trabajo en equipo" },
] as const;

/** El estudiante evalúa a su universidad. */
export const CRITERIOS_ESTUDIANTE_A_UNIVERSIDAD = [
  { key: "acompanamiento", label: "Acompañamiento y seguimiento" },
  { key: "gestion_practica", label: "Gestión de la práctica" },
  { key: "comunicacion_universidad", label: "Comunicación y respuesta" },
] as const;

/** La empresa evalúa a la universidad. */
export const CRITERIOS_EMPRESA_A_UNIVERSIDAD = [
  { key: "calidad_candidatos", label: "Calidad de los candidatos" },
  { key: "coordinacion", label: "Coordinación y logística" },
  { key: "respuesta_universidad", label: "Capacidad de respuesta" },
] as const;

/** La universidad evalúa al estudiante. */
export const CRITERIOS_UNIVERSIDAD_A_ESTUDIANTE = [
  { key: "desempeno_practica", label: "Desempeño en la práctica" },
  { key: "profesionalismo", label: "Profesionalismo" },
  { key: "cumplimiento_horas", label: "Cumplimiento de horas y tareas" },
] as const;

/** La universidad evalúa a la empresa. */
export const CRITERIOS_UNIVERSIDAD_A_EMPRESA = [
  { key: "ambiente_formativo", label: "Ambiente formativo" },
  { key: "acompanamiento_empresa", label: "Acompañamiento al estudiante" },
  { key: "cumplimiento_acuerdo", label: "Cumplimiento del acuerdo" },
] as const;

/**
 * Juego de criterios para un par evaluador→evaluado. Cubre las 6 direcciones
 * posibles entre los 3 roles; cae a estudiante→empresa como red defensiva.
 */
export function criteriosPara(
  evaluadorRol: EntidadRol,
  evaluadoRol: EntidadRol,
): ReadonlyArray<{ readonly key: string; readonly label: string }> {
  if (evaluadorRol === "estudiante" && evaluadoRol === "universidad")
    return CRITERIOS_ESTUDIANTE_A_UNIVERSIDAD;
  if (evaluadorRol === "empresa" && evaluadoRol === "universidad")
    return CRITERIOS_EMPRESA_A_UNIVERSIDAD;
  if (evaluadorRol === "universidad" && evaluadoRol === "estudiante")
    return CRITERIOS_UNIVERSIDAD_A_ESTUDIANTE;
  if (evaluadorRol === "universidad" && evaluadoRol === "empresa")
    return CRITERIOS_UNIVERSIDAD_A_EMPRESA;
  if (evaluadorRol === "empresa" && evaluadoRol === "estudiante")
    return CRITERIOS_EMPRESA_A_ESTUDIANTE;
  return CRITERIOS_ESTUDIANTE_A_EMPRESA;
}

// ═══════════════════════════════════════════════════════════════════
// DETECCIÓN DE EVALUACIONES PENDIENTES
// ═══════════════════════════════════════════════════════════════════

export interface FeedbackPendiente {
  /** ID determinístico: `${solicitudId}_${evaluadorId}_${evaluadoId}`. */
  feedbackId: string;
  solicitudId: string;
  evaluadorId: string;
  evaluadorRol: EntidadRol;
  evaluadoId: string;
  evaluadoNombre: string;
  evaluadoRol: EntidadRol;
  carrera: string;
  fechaInicio: string;
  fechaFin: string;
}

const buildFeedbackId = (
  solicitudId: string,
  evaluadorId: string,
  evaluadoId: string,
) => `${solicitudId}_${evaluadorId}_${evaluadoId}`;

const norm = (s: string) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

/**
 * Una pasantía dispara evaluación si está marcada `finalizado` **o** si ya
 * pasó su fecha de fin estando `aprobado` (handshake cerrado). Cubre ambos
 * disparadores: fin de fecha y marcado manual.
 */
function pasantiaFinalizada(s: any): boolean {
  if (s?.estado === "finalizado") return true;
  if (s?.estado === "aprobado" && s?.fechaFin) {
    const fin = new Date(s.fechaFin);
    return !Number.isNaN(fin.getTime()) && fin.getTime() < Date.now();
  }
  return false;
}

/** Timestamp de Firestore (o Date/número) → 'yyyy-mm-dd', o "" si no se puede. */
function tsToIso(v: any): string {
  try {
    const d: Date | null =
      typeof v?.toDate === "function" ? v.toDate()
      : v instanceof Date ? v
      : typeof v === "number" ? new Date(v)
      : null;
    if (!d || Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

/**
 * Igual que `getFeedbackPendiente` pero para pasantías de CUPO culminadas
 * (`asignaciones_cupo` con `finalizada === true`, Fase E). El ID de la
 * asignación hace de `solicitudId`, así el dedupe (`${solId}_${evaluadoId}`) y
 * `enviarFeedback` funcionan sin cambio alguno.
 *
 * Evaluación a 3 bandas, en el orden que ve cada rol:
 * - Estudiante  → 1º la empresa, 2º su universidad.
 * - Empresa     → 1º el estudiante, 2º la universidad.
 * - Universidad → 1º el estudiante, 2º la empresa.
 *
 * A diferencia del flujo de grupo, aquí `estudianteId` es un uid real, así que
 * no hace falta emparejar por nombre.
 */
async function feedbackPendienteCupos(
  uid: string,
  rol: EntidadRol,
  yaEnviado: Set<string>,
): Promise<FeedbackPendiente[]> {
  const campo =
    rol === "empresa" ? "empresaId"
    : rol === "universidad" ? "universidadId"
    : "estudianteId";
  const snap = await getDocs(
    query(collection(db, "asignaciones_cupo"), where(campo, "==", uid)),
  );
  const culminadas = snap.docs.filter((d) => {
    const a = d.data() as any;
    return a.finalizada === true && a.estado !== "cancelado";
  });
  if (culminadas.length === 0) return [];

  const out: FeedbackPendiente[] = [];
  const nombreEmpresaCache: Record<string, string> = {};
  const nombreUniCache: Record<string, string> = {};

  const nombreEmpresa = async (id: string, fallback?: string): Promise<string> => {
    if (!(id in nombreEmpresaCache)) {
      const s = await getDoc(doc(db, "perfiles_empresas", id));
      nombreEmpresaCache[id] =
        fallback || (s.data() as any)?.nombre_empresa || "la empresa";
    }
    return nombreEmpresaCache[id];
  };
  const nombreUni = async (id: string): Promise<string> => {
    if (!(id in nombreUniCache)) {
      const s = await getDoc(doc(db, "perfiles_universidades", id));
      nombreUniCache[id] = (s.data() as any)?.nombre_universidad || "tu universidad";
    }
    return nombreUniCache[id];
  };

  for (const d of culminadas) {
    const a = d.data() as any;
    const base = {
      solicitudId: d.id,
      evaluadorId: uid,
      carrera: a.carrera ?? "",
      fechaInicio: a.fechaPresentacion ?? "",
      fechaFin: tsToIso(a.finalizadaAt),
    };
    const add = (
      evaluadorRol: EntidadRol,
      evaluadoId: string | undefined,
      evaluadoRol: EntidadRol,
      evaluadoNombre: string,
    ) => {
      if (!evaluadoId || yaEnviado.has(`${d.id}_${evaluadoId}`)) return;
      out.push({
        ...base,
        feedbackId: buildFeedbackId(d.id, uid, evaluadoId),
        evaluadorRol,
        evaluadoId,
        evaluadoNombre,
        evaluadoRol,
      });
    };

    if (rol === "estudiante") {
      add("estudiante", a.empresaId, "empresa", await nombreEmpresa(a.empresaId, a.empresaNombre));
      add("estudiante", a.universidadId, "universidad", await nombreUni(a.universidadId));
    } else if (rol === "empresa") {
      add("empresa", a.estudianteId, "estudiante", a.estudianteNombre ?? "Estudiante");
      add("empresa", a.universidadId, "universidad", await nombreUni(a.universidadId));
    } else {
      add("universidad", a.estudianteId, "estudiante", a.estudianteNombre ?? "Estudiante");
      add("universidad", a.empresaId, "empresa", await nombreEmpresa(a.empresaId, a.empresaNombre));
    }
  }
  return out;
}

/**
 * Evaluaciones que el usuario actual aún debe completar de sus pasantías
 * finalizadas: las de grupo (`solicitudes_practicas` con `estado: 'finalizado'`)
 * y las de cupo (`asignaciones_cupo` con `finalizada === true`, Fase E).
 *
 * - Estudiante → evalúa a la empresa (grupo y cupo) y a su universidad (cupo).
 * - Empresa → evalúa a cada estudiante (grupo y cupo) y a la universidad (cupo).
 * - Universidad → evalúa al estudiante y a la empresa de cada cupo culminado.
 *
 * El flujo de grupo aún no genera evaluación hacia/desde la universidad; eso
 * vive solo en el flujo de cupo por ahora.
 */
export async function getFeedbackPendiente(
  uid: string,
  rol: EntidadRol,
): Promise<FeedbackPendiente[]> {
  if (!uid) return [];

  // Set de evaluaciones ya enviadas por este usuario: `${solId}_${evaluadoId}`.
  const dadosSnap = await getDocs(
    query(collection(db, "feedback_pasantias"), where("evaluadorId", "==", uid)),
  );
  const yaEnviado = new Set(
    dadosSnap.docs.map((d) => {
      const x = d.data() as any;
      return `${x.solicitudId}_${x.evaluadoId}`;
    }),
  );

  // Pasantías de cupo culminadas (Fase E). Vale para ambos roles y no depende
  // del grupo, así que se resuelve antes de la lógica del flujo de grupo.
  const pendientes: FeedbackPendiente[] = await feedbackPendienteCupos(
    uid,
    rol,
    yaEnviado,
  );

  if (rol === "estudiante") {
    const perfilSnap = await getDoc(doc(db, "perfiles_estudiantes", uid));
    const grupoId = (perfilSnap.data() as any)?.grupo_id;
    if (!grupoId) return pendientes;

    const sols = await getDocs(
      query(collection(db, "solicitudes_practicas"), where("grupoId", "==", grupoId)),
    );
    const finalizadas = sols.docs.filter((d) => pasantiaFinalizada(d.data()));

    // Cache de nombres de empresa.
    const empresaNombreCache: Record<string, string> = {};
    for (const d of finalizadas) {
      const s = d.data() as any;
      const empresaId = s.empresaId as string;
      if (!empresaId) continue;
      if (yaEnviado.has(`${d.id}_${empresaId}`)) continue;

      if (!(empresaId in empresaNombreCache)) {
        const eSnap = await getDoc(doc(db, "perfiles_empresas", empresaId));
        empresaNombreCache[empresaId] =
          (eSnap.data() as any)?.nombre_empresa ?? "la empresa";
      }

      pendientes.push({
        feedbackId: buildFeedbackId(d.id, uid, empresaId),
        solicitudId: d.id,
        evaluadorId: uid,
        evaluadorRol: "estudiante",
        evaluadoId: empresaId,
        evaluadoNombre: empresaNombreCache[empresaId],
        evaluadoRol: "empresa",
        carrera: s.carrera ?? "",
        fechaInicio: s.fechaInicio ?? "",
        fechaFin: s.fechaFin ?? "",
      });
    }
    return pendientes;
  }

  // rol === 'universidad': el flujo de grupo no genera feedback hacia la
  // universidad; solo cuentan los cupos culminados ya resueltos arriba.
  if (rol === "universidad") return pendientes;

  // rol === 'empresa'
  const sols = await getDocs(
    query(collection(db, "solicitudes_practicas"), where("empresaId", "==", uid)),
  );
  const finalizadas = sols.docs.filter((d) => pasantiaFinalizada(d.data()));

  // Cache de estudiantes por grupo.
  const porGrupo: Record<string, any[]> = {};
  for (const d of finalizadas) {
    const s = d.data() as any;
    const grupoId = s.grupoId as string;
    const alumnos: any[] = Array.isArray(s.alumnos) ? s.alumnos : [];
    if (!grupoId || alumnos.length === 0) continue;

    if (!(grupoId in porGrupo)) {
      const es = await getDocs(
        query(
          collection(db, "perfiles_estudiantes"),
          where("grupo_id", "==", grupoId),
        ),
      );
      porGrupo[grupoId] = es.docs.map((x) => ({ uid: x.id, ...(x.data() as any) }));
    }

    alumnos.forEach((al) => {
      const match = porGrupo[grupoId].find(
        (c) => norm(c.nombre_completo) === norm(al.nombre),
      );
      if (!match?.uid) return; // sin uid real no se puede evaluar
      if (yaEnviado.has(`${d.id}_${match.uid}`)) return;

      pendientes.push({
        feedbackId: buildFeedbackId(d.id, uid, match.uid),
        solicitudId: d.id,
        evaluadorId: uid,
        evaluadorRol: "empresa",
        evaluadoId: match.uid,
        evaluadoNombre: al.nombre ?? match.nombre_completo ?? "Estudiante",
        evaluadoRol: "estudiante",
        carrera: s.carrera ?? match.carrera ?? "",
        fechaInicio: s.fechaInicio ?? "",
        fechaFin: s.fechaFin ?? "",
      });
    });
  }
  return pendientes;
}

// ═══════════════════════════════════════════════════════════════════
// ENVÍO ATÓMICO + SUBIDA DE RANGO
// ═══════════════════════════════════════════════════════════════════

export interface EnviarFeedbackParams {
  feedbackId: string;
  solicitudId: string;
  evaluadorId: string;
  evaluadorRol: EntidadRol;
  evaluadoId: string;
  evaluadoRol: EntidadRol;
  /** Mapa criterio → estrellas (1..escalaMax). */
  criterios: Record<string, number>;
  comentario: string;
  /** Máximo de la escala de estrellas usada por la UI (por defecto 5). */
  escalaMax?: number;
}

export interface EnviarFeedbackResult {
  xp: number;
  promedio: number;
  rango: RangoInfo;
  subioDeRango: boolean;
}

/**
 * Guarda el feedback y actualiza el rango del evaluado en una **transacción
 * atómica**: escribe `feedback_pasantias`, e incrementa `puntos_experiencia` y
 * `pasantias_completadas`, recalcula `calificacion_promedio` y el `rango_nivel`
 * del perfil evaluado. Idempotente: si el feedback ya existe, lanza error.
 */
export async function enviarFeedback(
  params: EnviarFeedbackParams,
): Promise<EnviarFeedbackResult> {
  const {
    feedbackId,
    solicitudId,
    evaluadorId,
    evaluadorRol,
    evaluadoId,
    evaluadoRol,
    criterios,
    comentario,
    escalaMax = 5,
  } = params;

  const valores = Object.values(criterios).filter((n) => n > 0);
  if (valores.length === 0) throw new Error("Debes calificar todos los criterios.");
  // Promedio bruto en la escala de la UI (p. ej. 1–10), normalizado a /5 para
  // conservar el XP y la `calificacion_promedio` en la misma escala histórica.
  const factor = 5 / (escalaMax || 5);
  const promedioBruto = valores.reduce((a, b) => a + b, 0) / valores.length;
  const promedioFeedback = promedioBruto * factor;
  const xp = calcularXP(promedioFeedback);
  const evaluadoCol =
    evaluadoRol === "empresa" ? "perfiles_empresas"
    : evaluadoRol === "universidad" ? "perfiles_universidades"
    : "perfiles_estudiantes";

  return runTransaction(db, async (tx) => {
    const perfilRef = doc(db, evaluadoCol, evaluadoId);
    const fbRef = doc(db, "feedback_pasantias", feedbackId);

    const [perfilSnap, fbSnap] = await Promise.all([
      tx.get(perfilRef),
      tx.get(fbRef),
    ]);
    if (fbSnap.exists()) throw new Error("Ya enviaste esta evaluación.");

    const p = (perfilSnap.data() ?? {}) as any;
    const xpPrev = Number(p.puntos_experiencia ?? 0);
    const compPrev = Number(p.pasantias_completadas ?? 0);
    const countPrev = Number(p.calificaciones_recibidas ?? 0);
    const promPrev = Number(p.calificacion_promedio ?? 0);
    const rangoPrev = calcularRango(xpPrev, evaluadoRol);

    const xpNew = xpPrev + xp;
    const compNew = compPrev + 1;
    const countNew = countPrev + 1;
    const promNew = parseFloat(
      ((promPrev * countPrev + promedioFeedback) / countNew).toFixed(2),
    );
    const rango = calcularRango(xpNew, evaluadoRol);

    tx.set(fbRef, {
      solicitudId,
      evaluadorId,
      evaluadorRol,
      evaluadoId,
      evaluadoRol,
      criterios,
      escala: escalaMax,
      comentario: comentario.trim(),
      promedio: parseFloat(promedioFeedback.toFixed(2)),
      promedioBruto: parseFloat(promedioBruto.toFixed(2)),
      xpOtorgada: xp,
      createdAt: serverTimestamp(),
    });

    // `merge` para no pisar el resto del perfil (y tolerar campos ausentes).
    tx.set(
      perfilRef,
      {
        puntos_experiencia: xpNew,
        pasantias_completadas: compNew,
        calificaciones_recibidas: countNew,
        calificacion_promedio: promNew,
        rango_nivel: rango.nivel,
        rango_tier: rango.tier,
      },
      { merge: true },
    );

    return {
      xp,
      promedio: promNew,
      rango,
      subioDeRango: rango.tier !== rangoPrev.tier,
    };
  });
}
