// ══════════════════════════════════════════════════════════════════
//  Catálogo único de carreras de El Salvador + clasificación por ZONA
//  de soporte del MVP.
//
//  Regla de exclusión (Zona Roja): una carrera queda FUERA del MVP solo
//  si la contraparte que recibe las prácticas es una institución estatal
//  hiper-regulada — Salud (MINSAL/CSSP), Educación (MINED) o Derecho
//  (CSJ/PGR). Todo lo demás (incluidas Arquitectura, Ing. Civil,
//  Gastronomía, Turismo, etc.) es Zona Verde: si hay empresa privada que
//  recibe, Gradly la soporta.
//
//  `zona` es un DATO, no lógica quemada: para reclasificar una carrera se
//  cambia aquí un valor, o se sobre-escribe en runtime desde el documento
//  Firestore `config/carreras` (ver `aplicarOverrides`), sin redeploy.
// ══════════════════════════════════════════════════════════════════

export type CarreraTipo =
  | "Doctorado"
  | "Licenciatura"
  | "Ingeniería"
  | "Profesorado"
  | "Técnico";

/** Soporte del MVP. `roja` = bloqueada; `verde` = activa. */
export type ZonaSoporte = "verde" | "roja";

/** Motivo regulatorio de una carrera Roja (elige el mensaje legal). */
export type MotivoRoja = "salud" | "educacion" | "derecho";

export interface Carrera {
  id: string;
  nombre: string;
  modalidad: "Presencial" | "En línea" | "Semipresencial";
  tipo: CarreraTipo;
  duracion: string;
  /** Zona de soporte del MVP (por defecto 'verde'). */
  zona: ZonaSoporte;
  /** Solo en carreras 'roja': qué ente estatal la regula. */
  motivo?: MotivoRoja;
}

export const CARRERAS_EL_SALVADOR: Carrera[] = [
  // ── Facultad de Medicina y Ciencias de la Salud (ZONA ROJA · MINSAL/CSSP) ──
  { id: "med-01", nombre: "Doctorado en Medicina", modalidad: "Presencial", tipo: "Doctorado", duracion: "8 años", zona: "roja", motivo: "salud" },
  { id: "med-02", nombre: "Doctorado en Cirugía Dental", modalidad: "Presencial", tipo: "Doctorado", duracion: "5 años", zona: "roja", motivo: "salud" },
  { id: "med-03", nombre: "Licenciatura en Laboratorio Clínico", modalidad: "Presencial", tipo: "Licenciatura", duracion: "5 años", zona: "roja", motivo: "salud" },
  { id: "med-04", nombre: "Licenciatura en Fisioterapia y Terapia Ocupacional", modalidad: "Presencial", tipo: "Licenciatura", duracion: "5 años", zona: "roja", motivo: "salud" },
  { id: "med-05", nombre: "Licenciatura en Nutrición", modalidad: "Presencial", tipo: "Licenciatura", duracion: "5 años", zona: "roja", motivo: "salud" },
  { id: "med-06", nombre: "Licenciatura en Anestesiología e Inhaloterapia", modalidad: "Presencial", tipo: "Licenciatura", duracion: "5 años", zona: "roja", motivo: "salud" },
  { id: "med-07", nombre: "Licenciatura en Enfermería", modalidad: "Presencial", tipo: "Licenciatura", duracion: "5 años", zona: "roja", motivo: "salud" },
  { id: "med-08", nombre: "Licenciatura en Salud Materno Infantil", modalidad: "Presencial", tipo: "Licenciatura", duracion: "5 años", zona: "roja", motivo: "salud" },
  { id: "med-09", nombre: "Licenciatura en Radiología e Imágenes", modalidad: "Presencial", tipo: "Licenciatura", duracion: "5 años", zona: "roja", motivo: "salud" },
  { id: "med-10", nombre: "Técnico en Enfermería", modalidad: "Presencial", tipo: "Técnico", duracion: "3 años", zona: "roja", motivo: "salud" },

  // ── Facultad de Ingeniería y Arquitectura (ZONA VERDE) ──
  { id: "ing-01", nombre: "Arquitectura", modalidad: "Presencial", tipo: "Ingeniería", duracion: "5 años", zona: "verde" },
  { id: "ing-02", nombre: "Ingeniería Civil", modalidad: "Presencial", tipo: "Ingeniería", duracion: "5 años", zona: "verde" },
  { id: "ing-03", nombre: "Ingeniería Industrial", modalidad: "Presencial", tipo: "Ingeniería", duracion: "5 años", zona: "verde" },
  { id: "ing-04", nombre: "Ingeniería Industrial (en línea)", modalidad: "En línea", tipo: "Ingeniería", duracion: "5 años", zona: "verde" },
  { id: "ing-05", nombre: "Ingeniería Mecánica", modalidad: "Presencial", tipo: "Ingeniería", duracion: "5 años", zona: "verde" },
  { id: "ing-06", nombre: "Ingeniería de Sistemas Informáticos", modalidad: "Presencial", tipo: "Ingeniería", duracion: "5 años", zona: "verde" },
  { id: "ing-07", nombre: "Ingeniería Eléctrica", modalidad: "Presencial", tipo: "Ingeniería", duracion: "5 años", zona: "verde" },
  { id: "ing-08", nombre: "Ingeniería Química", modalidad: "Presencial", tipo: "Ingeniería", duracion: "5 años", zona: "verde" },
  { id: "ing-09", nombre: "Ingeniería Electrónica", modalidad: "Presencial", tipo: "Ingeniería", duracion: "5 años", zona: "verde" },
  { id: "ing-10", nombre: "Ingeniería Agroindustrial", modalidad: "Presencial", tipo: "Ingeniería", duracion: "5 años", zona: "verde" },
  { id: "ing-11", nombre: "Ingeniería en Alimentos", modalidad: "Presencial", tipo: "Ingeniería", duracion: "5 años", zona: "verde" },
  { id: "ing-12", nombre: "Ingeniería en Telecomunicaciones", modalidad: "Presencial", tipo: "Ingeniería", duracion: "5 años", zona: "verde" },
  { id: "ing-13", nombre: "Técnico en Ingeniería de Sistemas Informáticos", modalidad: "Semipresencial", tipo: "Técnico", duracion: "2 años", zona: "verde" },
  { id: "ing-14", nombre: "Técnico en Redes Computacionales", modalidad: "Presencial", tipo: "Técnico", duracion: "2 años", zona: "verde" },

  // ── Facultad de Ciencias y Humanidades ──
  { id: "hum-01", nombre: "Licenciatura en Periodismo", modalidad: "Presencial", tipo: "Licenciatura", duracion: "5 años", zona: "verde" },
  { id: "hum-02", nombre: "Licenciatura en Psicología", modalidad: "Presencial", tipo: "Licenciatura", duracion: "5 años", zona: "verde" }, // 🟡 criterio: clínica regulada vs. organizacional
  { id: "hum-03", nombre: "Licenciatura en Idiomas (Inglés y Francés)", modalidad: "Presencial", tipo: "Licenciatura", duracion: "5 años", zona: "verde" },
  { id: "hum-04", nombre: "Licenciatura en Letras", modalidad: "Presencial", tipo: "Licenciatura", duracion: "5 años", zona: "verde" },
  { id: "hum-05", nombre: "Licenciatura en Filosofía", modalidad: "Presencial", tipo: "Licenciatura", duracion: "5 años", zona: "verde" },
  { id: "hum-06", nombre: "Licenciatura en Sociología", modalidad: "Presencial", tipo: "Licenciatura", duracion: "5 años", zona: "verde" },
  { id: "hum-07", nombre: "Licenciatura en Trabajo Social", modalidad: "Presencial", tipo: "Licenciatura", duracion: "5 años", zona: "verde" }, // 🟡 criterio: público vs. ONG/corporativo
  { id: "hum-08", nombre: "Licenciatura en Artes Plásticas", modalidad: "Presencial", tipo: "Licenciatura", duracion: "5 años", zona: "verde" },
  { id: "hum-09", nombre: "Licenciatura en Ciencias de la Educación", modalidad: "Presencial", tipo: "Licenciatura", duracion: "5 años", zona: "roja", motivo: "educacion" },

  // ── Profesorados (ZONA ROJA · MINED) ──
  { id: "prof-01", nombre: "Profesorado en Educación Básica (1° y 2° ciclo)", modalidad: "Presencial", tipo: "Profesorado", duracion: "3 años", zona: "roja", motivo: "educacion" },
  { id: "prof-02", nombre: "Profesorado en Matemática para Tercer Ciclo y Bachillerato", modalidad: "Presencial", tipo: "Profesorado", duracion: "3 años", zona: "roja", motivo: "educacion" },
  { id: "prof-03", nombre: "Profesorado en Lenguaje y Literatura", modalidad: "Presencial", tipo: "Profesorado", duracion: "3 años", zona: "roja", motivo: "educacion" },
  { id: "prof-04", nombre: "Profesorado en Ciencias Naturales", modalidad: "Presencial", tipo: "Profesorado", duracion: "3 años", zona: "roja", motivo: "educacion" },
  { id: "prof-05", nombre: "Profesorado en Inglés", modalidad: "Presencial", tipo: "Profesorado", duracion: "3 años", zona: "roja", motivo: "educacion" },
  { id: "prof-06", nombre: "Profesorado en Educación Parvularia", modalidad: "Presencial", tipo: "Profesorado", duracion: "3 años", zona: "roja", motivo: "educacion" },
  { id: "prof-07", nombre: "Profesorado en Ciencias Sociales", modalidad: "Presencial", tipo: "Profesorado", duracion: "3 años", zona: "roja", motivo: "educacion" },

  // ── Facultad de Ciencias Económicas (ZONA VERDE) ──
  { id: "eco-01", nombre: "Licenciatura en Administración de Empresas", modalidad: "Presencial", tipo: "Licenciatura", duracion: "5 años", zona: "verde" },
  { id: "eco-02", nombre: "Licenciatura en Contaduría Pública", modalidad: "Presencial", tipo: "Licenciatura", duracion: "5 años", zona: "verde" },
  { id: "eco-03", nombre: "Licenciatura en Mercadotecnia", modalidad: "Presencial", tipo: "Licenciatura", duracion: "5 años", zona: "verde" },
  { id: "eco-04", nombre: "Licenciatura en Economía", modalidad: "Presencial", tipo: "Licenciatura", duracion: "5 años", zona: "verde" },
  { id: "eco-05", nombre: "Licenciatura en Negocios Internacionales", modalidad: "Presencial", tipo: "Licenciatura", duracion: "5 años", zona: "verde" },
  { id: "eco-06", nombre: "Técnico en Mercadeo", modalidad: "Semipresencial", tipo: "Técnico", duracion: "2 años", zona: "verde" },
  { id: "eco-07", nombre: "Técnico en Administración de Empresas", modalidad: "Presencial", tipo: "Técnico", duracion: "2 años", zona: "verde" },

  // ── Facultad de Jurisprudencia y Ciencias Sociales ──
  { id: "jur-01", nombre: "Licenciatura en Ciencias Jurídicas (Derecho)", modalidad: "Presencial", tipo: "Licenciatura", duracion: "5 años", zona: "roja", motivo: "derecho" },
  { id: "jur-02", nombre: "Licenciatura en Relaciones Internacionales", modalidad: "Presencial", tipo: "Licenciatura", duracion: "5 años", zona: "verde" },

  // ── Facultad de Ciencias Agronómicas (ZONA VERDE) ──
  { id: "agr-01", nombre: "Ingeniería Agronómica", modalidad: "Presencial", tipo: "Ingeniería", duracion: "5 años", zona: "verde" },
  { id: "agr-02", nombre: "Médico Veterinario y Zootecnista", modalidad: "Presencial", tipo: "Licenciatura", duracion: "5 años", zona: "verde" }, // 🟡 criterio: clínicas privadas → verde

  // ── Facultad de Química y Farmacia ──
  { id: "qui-01", nombre: "Licenciatura en Química y Farmacia", modalidad: "Presencial", tipo: "Licenciatura", duracion: "5 años", zona: "verde" }, // 🟡 criterio: CSSP regula, pero hay farmacias/labs privados

  // ── Otros técnicos (ZONA VERDE) ──
  { id: "tec-01", nombre: "Técnico en Gastronomía", modalidad: "Presencial", tipo: "Técnico", duracion: "2 años", zona: "verde" },
  { id: "tec-02", nombre: "Técnico en Diseño Gráfico", modalidad: "Semipresencial", tipo: "Técnico", duracion: "2 años", zona: "verde" },
];

// ── Índice por nombre para lookups O(1) ─────────────────────────────
const POR_NOMBRE = new Map(CARRERAS_EL_SALVADOR.map((c) => [c.nombre, c]));

/**
 * Overrides de zona en runtime, cargados desde `config/carreras`
 * (map `{ [nombreDeCarrera]: 'verde' | 'roja' }`). Permite al admin
 * habilitar/bloquear carreras sin redeploy. Vacío hasta que se cargue.
 */
let OVERRIDES: Record<string, ZonaSoporte> = {};

/** Aplica los overrides leídos de Firestore (idempotente). */
export function aplicarOverrides(overrides?: Record<string, ZonaSoporte> | null) {
  OVERRIDES = overrides ?? {};
}

/**
 * Carga los overrides de zona desde `config/carreras` (documento con campo
 * `overrides: { [nombreDeCarrera]: 'verde' | 'roja' }`) y los aplica. Permite
 * al admin habilitar/bloquear carreras sin redeploy. Silenciosa: si el doc no
 * existe o falla, se conservan los valores del catálogo. Llamar una vez al
 * abrir el registro o montar el dashboard de universidad.
 */
export async function cargarOverridesCarreras(): Promise<void> {
  try {
    const { db } = await import("../config/firebaseConfig");
    const { doc, getDoc } = await import("firebase/firestore");
    const snap = await getDoc(doc(db, "config", "carreras"));
    const data = snap.exists() ? (snap.data() as any) : null;
    if (data?.overrides && typeof data.overrides === "object") {
      aplicarOverrides(data.overrides as Record<string, ZonaSoporte>);
    }
  } catch {
    /* sin overrides: se usan los valores del catálogo */
  }
}

/** Zona efectiva de una carrera (override > catálogo > 'verde' por defecto). */
export function zonaDeCarrera(nombre: string): ZonaSoporte {
  if (OVERRIDES[nombre]) return OVERRIDES[nombre];
  return POR_NOMBRE.get(nombre)?.zona ?? "verde";
}

/** true si la carrera puede usar Gradly en el MVP (Zona Verde). */
export function esCarreraSoportada(nombre: string): boolean {
  return zonaDeCarrera(nombre) !== "roja";
}

/** Motivo regulatorio de una carrera (para elegir el mensaje legal). */
export function motivoDeCarrera(nombre: string): MotivoRoja | null {
  return POR_NOMBRE.get(nombre)?.motivo ?? null;
}

/** Solo las carreras soportadas (útil para pickers ya filtrados). */
export const CARRERAS_SOPORTADAS = () =>
  CARRERAS_EL_SALVADOR.filter((c) => zonaDeCarrera(c.nombre) === "verde");

// ── Mensajes legales de Zona Roja (se muestran a la UNIVERSIDAD) ─────
export interface MensajeZonaRoja {
  titulo: string;
  cuerpo: string;
}

export const MENSAJES_ZONA_ROJA: Record<MotivoRoja, MensajeZonaRoja> = {
  salud: {
    titulo: "Prácticas reguladas por el Estado",
    cuerpo:
      "En El Salvador, las prácticas profesionales de las Ciencias de la Salud están estrictamente reguladas por el Ministerio de Salud (MINSAL) y el Consejo Superior de Salud Pública (CSSP). Por mandato legal, estas horas deben realizarse en la red de hospitales nacionales o unidades de salud bajo protocolos médicos y de bioseguridad específicos. Debido a estas normativas estatales, las horas de esta facultad no pueden gestionarse ni certificarse a través de plataformas privadas de conexión corporativa.",
  },
  educacion: {
    titulo: "Gestión exclusiva del Ministerio de Educación",
    cuerpo:
      "Las prácticas docentes de tu facultad responden a los lineamientos directos del Ministerio de Educación (MINED). Estas requieren asignaciones presenciales en centros escolares y una estricta supervisión pedagógica estatal. Para garantizar que el proceso sea válido para el escalafón docente, estas horas deben tramitarse a través de los canales institucionales de la universidad y el Gobierno, fuera de plataformas de empleo corporativo.",
  },
  derecho: {
    titulo: "Jurisdicción de la Corte Suprema de Justicia",
    cuerpo:
      "El proceso de prácticas jurídicas en El Salvador es un procedimiento regulado directamente por la Corte Suprema de Justicia (CSJ) y la Procuraduría General de la República (PGR). Para garantizar la validez legal de las horas y la futura autorización como abogado de la República, la asignación a juzgados, procuradurías o clínicas jurídicas debe realizarse bajo los mecanismos oficiales del Estado, que no permiten la intermediación de plataformas tecnológicas privadas.",
  },
};

/** Mensaje legal correspondiente a una carrera Roja (o null si es Verde). */
export function mensajeZonaRoja(nombre: string): MensajeZonaRoja | null {
  const motivo = motivoDeCarrera(nombre);
  return motivo ? MENSAJES_ZONA_ROJA[motivo] : null;
}

/** Nombres de una lista que caen en Zona Roja (según zona efectiva). */
export function carrerasRojasEn(nombres: string[]): string[] {
  return nombres.filter((n) => zonaDeCarrera(n) === "roja");
}

/**
 * Dado un conjunto de carreras, devuelve los mensajes legales DISTINTOS que
 * aplican (uno por categoría regulada presente: salud/educacion/derecho),
 * cada uno con la lista de carreras seleccionadas que lo provocan.
 */
export interface AvisoZonaRoja extends MensajeZonaRoja {
  motivo: MotivoRoja;
  carreras: string[];
}

export function avisosZonaRoja(nombres: string[]): AvisoZonaRoja[] {
  const rojas = carrerasRojasEn(nombres);
  const porMotivo = new Map<MotivoRoja, string[]>();
  rojas.forEach((n) => {
    const m = motivoDeCarrera(n);
    if (!m) return;
    porMotivo.set(m, [...(porMotivo.get(m) ?? []), n]);
  });
  return Array.from(porMotivo.entries()).map(([motivo, carreras]) => ({
    motivo,
    carreras,
    ...MENSAJES_ZONA_ROJA[motivo],
  }));
}
