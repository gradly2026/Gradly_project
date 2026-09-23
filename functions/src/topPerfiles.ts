/**
 * topPerfiles.ts — listas "mejores estudiantes" del PERFIL PÚBLICO de cada empresa
 * y de cada universidad, calculadas en el servidor.
 *
 * Son las que se ven dentro del perfil público (Top Empresas / Top Universidades →
 * "Mejores estudiantes que trabajaron aquí" / "…de esta universidad"). Viven en
 * `perfiles_empresas/{id}.top_estudiantes` y `perfiles_universidades/{id}.top_estudiantes`.
 *
 * Hasta ahora SOLO las escribía el cliente de cada institución al abrir su
 * dashboard (src/services/topEstudiantesService.ts), así que una empresa o una
 * universidad que no entra en días dejaba su lista vieja (o vacía, si era anterior
 * al filtro de certificación). Este job las mantiene al día sin depender de eso.
 * NO reemplaza al cliente: los dos usan el MISMO criterio y el MISMO orden, así que
 * escriban quien escriban queda igual. Si cambias uno, cambia el otro.
 *
 * Criterio (idéntico al de `esElegibleTopEstudiante` del cliente):
 *   · Entra solo quien ya CULMINÓ, está CERTIFICADO por su universidad
 *     (`horas_aprobadas` > 0) y tiene calificación por reseñas (`calificacion_promedio` > 0).
 *   · Empresa (hasta 3): culminó con ELLA — contrato de empleo activo (cuenta siempre),
 *     pasantía por cupo cerrada por horas (`finalizada` sin `terminacionAnticipada`) o
 *     pasantía de grupo `finalizado`. Precedencia: contrato > cupo culminado > grupo
 *     finalizado > cupo en curso. Bono de +1 al orden si su universidad está bien
 *     calificada (>= 3.5).
 *   · Universidad (hasta 5): sus estudiantes elegibles, con bono de +1 si trabajan en
 *     una empresa bien calificada (>= 3.5).
 *   · Orden: puntaje ↓ (promedio + bono), empate → el orden en que se leen los datos
 *     (por id, igual que el cliente).
 *
 * Solo escribe el perfil cuya lista CAMBIÓ (comparación por contenido) y nunca toca
 * nada más del perfil. Nadie más que Admin SDK necesita permisos: no hay cambio de reglas.
 *
 * Además, cada corrida publica el perfil público FILTRADO de todos los estudiantes que
 * salen en esas listas (más los 3 de la plataforma) y borra el de quien ya no sale en
 * ninguna — ver perfilesPublicos.ts: es lo que otro estudiante abre al tocarlos.
 *
 *  · actualizarListasPerfiles → job diario (03:30 América/El_Salvador, media hora
 *    después del Top 3 de la plataforma).
 *  · recalcularListasPerfiles → callable solo admin, para forzarlo ya (lo dispara,
 *    sin esperar, el botón "Recalcular Top 3 ahora" de Config).
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { exigirAdmin, textoSalario, type EntradaTop } from "./topEstudiantes";
import { depurarPerfilesPublicos, publicarPerfilesPublicos } from "./perfilesPublicos";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

const REGION = "us-central1";
const TZ = "America/El_Salvador";

const MAX_EMPRESA = 3;
const MAX_UNI = 5;
/** Igual que `UMBRAL_DESTACADO` del cliente: solo aporta el bono de orden. */
const UMBRAL_DESTACADO = 3.5;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => String(v ?? "").trim();

// ── Datos de entrada (ya reducidos a lo que usa el cálculo) ────────────

export interface EstudianteElegible {
  id: string;
  nombre: string;
  foto: string | null;
  stars: number;
  rango: string;
  horas: number;
  universidadId: string;
}
export interface ContratoActivo {
  empresaId: string;
  estudianteId: string;
  estudianteNombre: string;
  estudianteFoto: string;
  vacanteTitulo: string;
  salarioMin: unknown;
  salarioMax: unknown;
}
export interface CupoLite {
  empresaId: string;
  universidadId: string;
  estudianteId: string;
  estudianteNombre: string;
  empresaNombre: string;
  vacanteTitulo: string;
  estado: string;
  finalizada: boolean;
  terminacionAnticipada: boolean;
}
export interface SolicitudFinalizada {
  empresaId: string;
  estudianteIds: string[];
}
export interface PerfilInstitucion {
  id: string;
  nombre: string;
  alta: boolean;
  /** `top_estudiantes` que tiene guardado ahora (para no reescribir lo que no cambió). */
  actual: unknown;
}
export interface DatosListas {
  /** SOLO los elegibles (certificados y con reseña), ordenados por id. */
  estudiantes: EstudianteElegible[];
  contratos: ContratoActivo[];
  cupos: CupoLite[];
  solicitudes: SolicitudFinalizada[];
  empresas: PerfilInstitucion[];
  universidades: PerfilInstitucion[];
}

// ── Cálculo puro (sin Firestore: se prueba con datos en memoria) ───────

interface FilaEmpresa {
  estudianteId: string;
  nombre: string;
  foto: string;
  puesto: string;
  salarioTxt: string | null;
  contratado: boolean;
  culminada: boolean;
}

/** Top de estudiantes de UNA empresa. Espejo de `recomputarTopEstudiantesEmpresa` (cliente). */
export function listaEmpresa(empresaId: string, d: DatosListas): EntradaTop[] {
  const porId = new Map(d.estudiantes.map((e) => [e.id, e]));
  const uniPorId = new Map(d.universidades.map((u) => [u.id, u]));
  const porEst = new Map<string, FilaEmpresa>();

  // 1) Contrato de empleo activo: cuenta siempre.
  for (const c of d.contratos) {
    if (c.empresaId !== empresaId || !c.estudianteId) continue;
    porEst.set(c.estudianteId, {
      estudianteId: c.estudianteId,
      nombre: c.estudianteNombre || "Estudiante",
      foto: c.estudianteFoto || "",
      puesto: c.vacanteTitulo || "Puesto",
      salarioTxt: textoSalario(c.salarioMin, c.salarioMax),
      contratado: true,
      culminada: true,
    });
  }
  // 2) Pasantía por cupo (no cancelada). Culminada = cerrada por horas, sin terminación anticipada.
  for (const a of d.cupos) {
    if (a.empresaId !== empresaId || a.estado === "cancelado" || !a.estudianteId) continue;
    const culminada = a.finalizada === true && a.terminacionAnticipada !== true;
    const previo = porEst.get(a.estudianteId);
    if (previo && (previo.contratado || previo.culminada || !culminada)) continue;
    porEst.set(a.estudianteId, {
      estudianteId: a.estudianteId,
      nombre: a.estudianteNombre || "Estudiante",
      foto: "",
      puesto: a.vacanteTitulo || "Pasantía",
      salarioTxt: null,
      contratado: false,
      culminada,
    });
  }
  // 3) Pasantía de GRUPO finalizada: cada alumno real de la solicitud.
  for (const s of d.solicitudes) {
    if (s.empresaId !== empresaId) continue;
    for (const id of s.estudianteIds) {
      if (typeof id !== "string" || !id) continue;
      const previo = porEst.get(id);
      if (previo && (previo.contratado || previo.culminada)) continue;
      porEst.set(id, {
        estudianteId: id, nombre: "", foto: "", puesto: "Pasantía",
        salarioTxt: null, contratado: false, culminada: true,
      });
    }
  }

  const filas: { entry: EntradaTop; score: number }[] = [];
  for (const b of porEst.values()) {
    if (!b.culminada) continue;
    const est = porId.get(b.estudianteId);
    if (!est) continue; // no certificado o sin reseña: no entra
    const uni = uniPorId.get(est.universidadId);
    filas.push({
      entry: {
        id: est.id,
        nombre: b.nombre || est.nombre || "Estudiante",
        foto: b.foto || est.foto || null,
        stars: est.stars,
        rango: est.rango,
        universidadNombre: uni?.nombre ?? "",
        empresaNombre: "",
        puesto: b.puesto,
        salarioTxt: b.salarioTxt,
        contratado: b.contratado,
        horasCertificadas: est.horas,
      },
      score: est.stars + (uni?.alta ? 1 : 0),
    });
  }
  return filas.sort((a, b) => b.score - a.score).slice(0, MAX_EMPRESA).map((f) => f.entry);
}

/** Top de estudiantes de UNA universidad. Espejo de `recomputarTopEstudiantesUniversidad` (cliente). */
export function listaUniversidad(universidadId: string, d: DatosListas): EntradaTop[] {
  const uni = d.universidades.find((u) => u.id === universidadId);
  const empPorId = new Map(d.empresas.map((e) => [e.id, e]));

  // Primera asignación no cancelada de cada estudiante con ESTA universidad.
  const asgPorEst = new Map<string, CupoLite>();
  for (const a of d.cupos) {
    if (a.universidadId !== universidadId || a.estado === "cancelado") continue;
    if (!asgPorEst.has(a.estudianteId)) asgPorEst.set(a.estudianteId, a);
  }

  const filas: { entry: EntradaTop; score: number }[] = [];
  for (const est of d.estudiantes) {
    if (est.universidadId !== universidadId) continue;
    const a = asgPorEst.get(est.id);
    let empresaNombre = a?.empresaNombre ?? "";
    let empAlta = false;
    if (a?.empresaId) {
      const emp = empPorId.get(a.empresaId);
      empAlta = emp?.alta ?? false;
      if (!empresaNombre) empresaNombre = emp?.nombre ?? "";
    }
    filas.push({
      entry: {
        id: est.id,
        nombre: est.nombre || "Estudiante",
        foto: est.foto,
        stars: est.stars,
        rango: est.rango,
        universidadNombre: uni?.nombre ?? "",
        empresaNombre,
        puesto: a?.vacanteTitulo ?? "",
        salarioTxt: null,
        contratado: false,
        horasCertificadas: est.horas,
      },
      score: est.stars + (empAlta ? 1 : 0),
    });
  }
  return filas.sort((a, b) => b.score - a.score).slice(0, MAX_UNI).map((f) => f.entry);
}

/** JSON con las llaves ordenadas: Firestore devuelve los mapas en otro orden que el
 *  del código que los escribió, así que comparar con `JSON.stringify` a secas daría
 *  "cambió" cuando no cambió nada. */
function canonico(v: unknown): string {
  const ordenar = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(ordenar);
    if (x && typeof x === "object") {
      return Object.fromEntries(
        Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, val]) => [k, ordenar(val)]),
      );
    }
    return x;
  };
  return JSON.stringify(ordenar(v));
}

/** ¿Hay que reescribir la lista? Sin lista guardada equivale a lista vacía. */
export function listaCambio(actual: unknown, nueva: EntradaTop[]): boolean {
  const previa = Array.isArray(actual) ? actual : [];
  return canonico(previa) !== canonico(nueva);
}

// ── Lectura de Firestore ───────────────────────────────────────────────

/** Orden por id de documento (como los devuelve Firestore a una consulta sin orden). */
const porId = <T extends { id: string }>(a: T, b: T): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

async function cargarDatos(): Promise<DatosListas> {
  const [estSnap, contrSnap, cupoSnap, solSnap, empSnap, uniSnap] = await Promise.all([
    db.collection("perfiles_estudiantes").where("horas_aprobadas", ">", 0)
      .select("nombre_completo", "foto_url", "calificacion_promedio", "rango_nivel", "horas_aprobadas", "universidad_id").get(),
    db.collection("contratos_laborales").where("estado", "==", "activo")
      .select("empresaId", "estudianteId", "estudianteNombre", "estudianteFoto", "vacanteTitulo", "salario_min", "salario_max").get(),
    db.collection("asignaciones_cupo")
      .select("empresaId", "universidadId", "estudianteId", "estudianteNombre", "empresaNombre", "vacanteTitulo", "estado", "finalizada", "terminacionAnticipada").get(),
    db.collection("solicitudes_practicas").where("estado", "==", "finalizado").select("empresaId", "estudianteIds").get(),
    db.collection("perfiles_empresas").select("nombre_empresa", "calificacion_estudiantes_promedio", "top_estudiantes").get(),
    db.collection("perfiles_universidades").select("nombre_universidad", "calificacion_estudiantes_promedio", "top_estudiantes").get(),
  ]);

  const estudiantes: EstudianteElegible[] = estSnap.docs
    .map((s) => {
      const x = s.data() ?? {};
      return {
        id: s.id,
        nombre: str(x.nombre_completo),
        foto: str(x.foto_url) || null,
        stars: num(x.calificacion_promedio),
        rango: str(x.rango_nivel),
        horas: num(x.horas_aprobadas),
        universidadId: str(x.universidad_id),
      };
    })
    .filter((e) => e.horas > 0 && e.stars > 0)
    .sort(porId);

  const contratos: ContratoActivo[] = contrSnap.docs
    .map((s) => ({ id: s.id, x: s.data() ?? {} }))
    .sort(porId)
    .map(({ x }) => ({
      empresaId: str(x.empresaId),
      estudianteId: str(x.estudianteId),
      estudianteNombre: str(x.estudianteNombre),
      estudianteFoto: str(x.estudianteFoto),
      vacanteTitulo: str(x.vacanteTitulo),
      salarioMin: x.salario_min,
      salarioMax: x.salario_max,
    }));

  const cupos: CupoLite[] = cupoSnap.docs
    .map((s) => ({ id: s.id, x: s.data() ?? {} }))
    .sort(porId)
    .map(({ x }) => ({
      empresaId: str(x.empresaId),
      universidadId: str(x.universidadId),
      estudianteId: str(x.estudianteId),
      estudianteNombre: str(x.estudianteNombre),
      empresaNombre: str(x.empresaNombre),
      vacanteTitulo: str(x.vacanteTitulo),
      estado: str(x.estado),
      finalizada: x.finalizada === true,
      terminacionAnticipada: x.terminacionAnticipada === true,
    }));

  const solicitudes: SolicitudFinalizada[] = solSnap.docs
    .map((s) => ({ id: s.id, x: s.data() ?? {} }))
    .sort(porId)
    .map(({ x }) => ({
      empresaId: str(x.empresaId),
      estudianteIds: Array.isArray(x.estudianteIds) ? x.estudianteIds : [],
    }));

  const instituciones = (snap: FirebaseFirestore.QuerySnapshot, campoNombre: string): PerfilInstitucion[] =>
    snap.docs
      .map((s) => {
        const x = s.data() ?? {};
        return {
          id: s.id,
          nombre: str(x[campoNombre]),
          alta: num(x.calificacion_estudiantes_promedio) >= UMBRAL_DESTACADO,
          actual: x.top_estudiantes,
        };
      })
      .sort(porId);

  return {
    estudiantes, contratos, cupos, solicitudes,
    empresas: instituciones(empSnap, "nombre_empresa"),
    universidades: instituciones(uniSnap, "nombre_universidad"),
  };
}

export interface ResumenListas {
  empresas: { revisadas: number; actualizadas: number; fallidas: number };
  universidades: { revisadas: number; actualizadas: number; fallidas: number };
  /** Perfiles públicos filtrados de los destacados (ver perfilesPublicos.ts). */
  perfilesPublicos?: { publicados: number; eliminados: number };
}

/** Recalcula las listas de TODAS las empresas y universidades y guarda solo las que cambiaron. */
export async function refrescarListasPerfiles(): Promise<ResumenListas> {
  const datos = await cargarDatos();
  const resumen: ResumenListas = {
    empresas: { revisadas: 0, actualizadas: 0, fallidas: 0 },
    universidades: { revisadas: 0, actualizadas: 0, fallidas: 0 },
  };

  // Estudiante destacado → empresa donde hace/hizo su pasantía o trabajo ("" si no se sabe).
  const destacados = new Map<string, string>();

  const aplicar = async (
    coleccion: "perfiles_empresas" | "perfiles_universidades",
    instituciones: PerfilInstitucion[],
    calcular: (id: string) => EntradaTop[],
    cuenta: ResumenListas["empresas"],
    empresaDe: (inst: PerfilInstitucion, e: EntradaTop) => string,
  ) => {
    for (const inst of instituciones) {
      cuenta.revisadas++;
      try {
        const nueva = calcular(inst.id);
        for (const e of nueva) {
          if (e.id && !destacados.get(e.id)) destacados.set(e.id, empresaDe(inst, e));
        }
        if (!listaCambio(inst.actual, nueva)) continue;
        await db.collection(coleccion).doc(inst.id).update({ top_estudiantes: nueva });
        cuenta.actualizadas++;
      } catch (e) {
        // Un perfil que falle no debe frenar a los demás.
        cuenta.fallidas++;
        logger.warn(`listas de perfil: no se pudo actualizar ${coleccion}/${inst.id}`, e);
      }
    }
  };

  // En la lista de una empresa, ella misma es donde trabajaron; en la de una universidad,
  // la fila trae su empresa.
  await aplicar("perfiles_empresas", datos.empresas, (id) => listaEmpresa(id, datos), resumen.empresas, (inst) => inst.nombre);
  await aplicar("perfiles_universidades", datos.universidades, (id) => listaUniversidad(id, datos), resumen.universidades, (_inst, e) => e.empresaNombre);

  // Perfil público filtrado de todos los destacados: los de las listas + los 3 del Top de la
  // plataforma. Best-effort: si falla, las listas ya quedaron guardadas. Solo se depura (se
  // borra el de quien ya no sale en ninguna lista) si NINGUNA lista falló: con una lista sin
  // calcular faltaría gente en `destacados` y se borrarían perfiles que sí corresponden.
  try {
    const top = await db.doc("ranking_plataforma/top_estudiantes").get();
    const entradasTop: any[] = Array.isArray(top.data()?.entradas) ? top.data()!.entradas : [];
    for (const e of entradasTop) {
      if (e?.id && !destacados.get(e.id)) destacados.set(e.id, str(e.empresaNombre));
    }
    const pub = await publicarPerfilesPublicos(destacados.keys(), destacados);
    const sinFallas = resumen.empresas.fallidas === 0 && resumen.universidades.fallidas === 0;
    const eliminados = sinFallas ? await depurarPerfilesPublicos(new Set(destacados.keys())) : 0;
    resumen.perfilesPublicos = { publicados: pub.publicados, eliminados };
  } catch (e) {
    logger.warn("listas de perfil: no se pudieron publicar los perfiles públicos", e);
  }
  return resumen;
}

// ── 1) JOB DIARIO ──────────────────────────────────────────────────────
export const actualizarListasPerfiles = onSchedule(
  { schedule: "every day 03:30", region: REGION, timeZone: TZ, memory: "512MiB", timeoutSeconds: 300 },
  async () => {
    try {
      const r = await refrescarListasPerfiles();
      logger.log(
        `Listas de perfil: empresas ${r.empresas.actualizadas}/${r.empresas.revisadas} actualizadas (${r.empresas.fallidas} fallidas), ` +
        `universidades ${r.universidades.actualizadas}/${r.universidades.revisadas} actualizadas (${r.universidades.fallidas} fallidas). ` +
        `Perfiles públicos de estudiantes destacados: ${r.perfilesPublicos ? `${r.perfilesPublicos.publicados} publicados, ${r.perfilesPublicos.eliminados} retirados` : "no se pudieron actualizar"}.`,
      );
    } catch (e) {
      logger.error("Listas de perfil: falló la actualización", e);
      throw e;
    }
  },
);

// ── 2) RECÁLCULO MANUAL (solo admin) ───────────────────────────────────
export const recalcularListasPerfiles = onCall(
  { region: REGION, memory: "512MiB", timeoutSeconds: 300 },
  async (req) => {
    await exigirAdmin(req.auth);
    try {
      return await refrescarListasPerfiles();
    } catch (e) {
      logger.error("recalcularListasPerfiles: falló", e);
      throw new HttpsError("internal", "No se pudieron recalcular las listas de los perfiles. Intenta de nuevo.");
    }
  },
);
