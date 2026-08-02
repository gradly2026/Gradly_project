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
export type EntidadRol = "estudiante" | "empresa";

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

/**
 * Rango según la XP acumulada:
 *  - 0–300     → Novato / Empresa Nueva        (bronce)
 *  - 301–1000  → Profesional / Empresa Confiable (plata)
 *  - >1000     → Máster / Empresa Destacada Top  (oro)
 */
export function calcularRango(xp: number, rol: EntidadRol): RangoInfo {
  const esEmpresa = rol === "empresa";
  const seguro = Math.max(0, Number.isFinite(xp) ? xp : 0);

  if (seguro > 1000) {
    return {
      nivel: esEmpresa ? "Empresa Destacada Top" : "Máster",
      tier: "oro",
      color: TIER_COLORS.oro,
      min: 1001,
      max: Infinity,
      siguiente: null,
    };
  }
  if (seguro > 300) {
    return {
      nivel: esEmpresa ? "Empresa Confiable" : "Profesional",
      tier: "plata",
      color: TIER_COLORS.plata,
      min: 301,
      max: 1000,
      siguiente: 1001,
    };
  }
  return {
    nivel: esEmpresa ? "Empresa Nueva" : "Novato",
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

/**
 * Evaluaciones que el usuario actual aún debe completar de sus pasantías
 * finalizadas (`solicitudes_practicas` con `estado: 'finalizado'`).
 *
 * - Estudiante → evalúa a la empresa de cada pasantía finalizada de su grupo.
 * - Empresa → evalúa a cada estudiante de sus pasantías finalizadas.
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

  const pendientes: FeedbackPendiente[] = [];

  if (rol === "estudiante") {
    const perfilSnap = await getDoc(doc(db, "perfiles_estudiantes", uid));
    const grupoId = (perfilSnap.data() as any)?.grupo_id;
    if (!grupoId) return [];

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
    evaluadoRol === "empresa" ? "perfiles_empresas" : "perfiles_estudiantes";

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
