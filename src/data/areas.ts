// ══════════════════════════════════════════════════════════════════
//  Áreas y etiquetas de rol de una vacante, y su afinidad con la carrera
//  del estudiante.
//
//  Problema que resuelve: "Tecnología" es demasiado grueso. Un alumno de
//  Ing. en Sistemas colocado en soporte técnico cuando su fuerte es
//  programar siente que perdió el ciclo, y la empresa que necesitaba redes
//  también pierde. Por eso hay DOS niveles:
//
//    · `area`  → el bucket grande (ya existía en `vacantes`).
//    · `tags`  → el rol concreto dentro del área (Desarrollo web, Soporte…).
//
//  Solo las carreras ANCHAS necesitan tags (Sistemas, Administración,
//  Comunicaciones). Las angostas (Contaduría) se resuelven con el área sola,
//  por eso `TAGS_POR_AREA` no pretende cubrir todo con el mismo detalle.
// ══════════════════════════════════════════════════════════════════

/**
 * Áreas seleccionables al publicar una vacante.
 *
 * Las 8 primeras son las que ya existían: NO se renombran ni se quitan, o
 * las vacantes publicadas se quedarían con un área huérfana. Las siguientes
 * se añadieron porque sin ellas Arquitectura, Derecho o Gastronomía caían
 * todas en "Otra" y el filtro por afinidad no servía de nada.
 */
export const AREAS = [
  "Tecnología",
  "Marketing",
  "Diseño",
  "Finanzas",
  "Salud",
  "Educación",
  "Manufactura",
  "Administración",
  "Comunicaciones",
  "Construcción",
  "Agroindustria",
  "Gastronomía",
  "Legal",
  "Otra",
] as const;

export type Area = (typeof AREAS)[number];

/** Roles concretos dentro de cada área. Vacío = el área no necesita detalle. */
export const TAGS_POR_AREA: Record<string, string[]> = {
  Tecnología: [
    "Desarrollo de software",
    "Desarrollo web",
    "Desarrollo móvil",
    "Soporte técnico",
    "Redes e infraestructura",
    "Bases de datos",
    "QA y pruebas",
    "Ciberseguridad",
    "Datos y BI",
  ],
  Administración: [
    "Recursos humanos",
    "Operaciones",
    "Logística",
    "Atención al cliente",
    "Asistencia administrativa",
    "Gestión de proyectos",
  ],
  Comunicaciones: [
    "Redacción de contenido",
    "Community management",
    "Producción audiovisual",
    "Relaciones públicas",
    "Prensa",
  ],
  Marketing: [
    "Marketing digital",
    "Publicidad",
    "Investigación de mercado",
    "Ventas",
    "SEO y SEM",
  ],
  Diseño: [
    "Diseño gráfico",
    "UX/UI",
    "Ilustración",
    "Motion graphics",
    "Diseño de producto",
  ],
  Finanzas: ["Contabilidad", "Auditoría", "Impuestos", "Tesorería", "Análisis financiero"],
  Manufactura: [
    "Producción",
    "Control de calidad",
    "Mantenimiento",
    "Seguridad industrial",
    "Diseño técnico (CAD)",
  ],
  Construcción: ["Supervisión de obra", "Diseño arquitectónico", "Presupuestos", "Topografía"],
  Agroindustria: ["Producción agrícola", "Control de calidad", "Inocuidad alimentaria", "Pecuaria"],
  Gastronomía: ["Cocina", "Pastelería", "Servicio", "Costos de alimentos"],
  Salud: [],
  Educación: [],
  Legal: [],
  Otra: [],
};

export const tagsDeArea = (area?: string | null): string[] =>
  (area && TAGS_POR_AREA[area]) || [];

/**
 * Áreas afines a cada carrera, por id del catálogo (`CARRERAS_EL_SALVADOR`).
 * Varias carreras encajan en más de un área a propósito: un Ing. Electrónico
 * sirve tanto a Tecnología como a Manufactura, y cerrarlo a una sola le
 * quitaría oportunidades reales.
 */
export const AREAS_POR_CARRERA: Record<string, Area[]> = {
  // Salud (Zona Roja — fuera del MVP, se mapean por completitud)
  "med-01": ["Salud"], "med-02": ["Salud"], "med-03": ["Salud"], "med-04": ["Salud"],
  "med-05": ["Salud"], "med-06": ["Salud"], "med-07": ["Salud"], "med-08": ["Salud"],
  "med-09": ["Salud"], "med-10": ["Salud"],

  // Ingenierías y técnicos
  "ing-01": ["Construcción", "Diseño"],          // Arquitectura
  "ing-02": ["Construcción"],                     // Civil
  "ing-03": ["Manufactura", "Administración"],    // Industrial
  "ing-04": ["Manufactura", "Administración"],    // Industrial (en línea)
  "ing-05": ["Manufactura"],                      // Mecánica
  "ing-06": ["Tecnología"],                       // Sistemas Informáticos
  "ing-07": ["Manufactura", "Tecnología"],        // Eléctrica
  "ing-08": ["Manufactura"],                      // Química
  "ing-09": ["Tecnología", "Manufactura"],        // Electrónica
  "ing-10": ["Agroindustria", "Manufactura"],     // Agroindustrial
  "ing-11": ["Agroindustria", "Manufactura"],     // Alimentos
  "ing-12": ["Tecnología"],                       // Telecomunicaciones
  "ing-13": ["Tecnología"],                       // Téc. Sistemas
  "ing-14": ["Tecnología"],                       // Téc. Redes

  // Humanidades
  "hum-01": ["Comunicaciones"],                   // Periodismo
  "hum-02": ["Administración", "Salud"],          // Psicología (organizacional / clínica)
  "hum-03": ["Comunicaciones", "Educación"],      // Idiomas
  "hum-04": ["Comunicaciones"],                   // Letras
  "hum-05": ["Educación"],                        // Filosofía
  "hum-06": ["Administración"],                   // Sociología
  "hum-07": ["Administración"],                   // Trabajo Social
  "hum-08": ["Diseño"],                           // Artes Plásticas
  "hum-09": ["Educación"],                        // Ciencias de la Educación

  // Profesorados (Zona Roja)
  "prof-01": ["Educación"], "prof-02": ["Educación"], "prof-03": ["Educación"],
  "prof-04": ["Educación"], "prof-05": ["Educación"], "prof-06": ["Educación"],
  "prof-07": ["Educación"],

  // Económicas
  "eco-01": ["Administración"],                   // Administración de Empresas
  "eco-02": ["Finanzas"],                         // Contaduría Pública
  "eco-03": ["Marketing"],                        // Mercadotecnia
  "eco-04": ["Finanzas"],                         // Economía
  "eco-05": ["Administración", "Finanzas"],       // Negocios Internacionales
  "eco-06": ["Marketing"],                        // Téc. Mercadeo
  "eco-07": ["Administración"],                   // Téc. Administración

  // Jurídicas
  "jur-01": ["Legal"],                            // Derecho (Zona Roja)
  "jur-02": ["Administración", "Legal"],          // Relaciones Internacionales

  // Agro y química
  "agr-01": ["Agroindustria"],                    // Agronómica
  "agr-02": ["Agroindustria", "Salud"],           // Veterinaria
  "qui-01": ["Salud", "Manufactura"],             // Química y Farmacia

  // Técnicos varios
  "tec-01": ["Gastronomía"],                      // Gastronomía
  "tec-02": ["Diseño"],                           // Diseño Gráfico
};

/** Índice nombre→id, construido una sola vez (los perfiles guardan el NOMBRE). */
let indiceNombres: Record<string, string> | null = null;

/**
 * Marcas diacríticas combinantes (U+0300–U+036F) que deja `normalize("NFD")`.
 * Se construye con `fromCharCode` a propósito: así el rango no aparece como
 * caracteres invisibles en el código fuente, donde un cambio de codificación
 * o un copiar/pegar podría romperlo en silencio.
 */
const DIACRITICOS = new RegExp(
  `[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`,
  "g",
);

/** minúsculas + sin tildes, para comparar nombres escritos de cualquier forma. */
function normalizar(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICOS, "");
}

/**
 * Áreas afines a una carrera dada por NOMBRE (que es como se guarda en
 * `grupos.carrera` y `perfiles_estudiantes.carrera`).
 * Devuelve `[]` si la carrera no está en el catálogo — el punto de uso debe
 * tratar eso como "desconocido", no como "sin afinidad".
 */
export function areasDeCarrera(nombreCarrera?: string | null): Area[] {
  if (!nombreCarrera) return [];

  if (!indiceNombres) {
    // Import diferido: evita un ciclo si carreras.ts algún día importa este módulo.
    const { CARRERAS_EL_SALVADOR } = require("./carreras") as typeof import("./carreras");
    indiceNombres = {};
    for (const c of CARRERAS_EL_SALVADOR) indiceNombres[normalizar(c.nombre)] = c.id;
  }

  const id = indiceNombres[normalizar(nombreCarrera)];
  return id ? AREAS_POR_CARRERA[id] ?? [] : [];
}

// ─────────────────────────────────────────────
// AFINIDAD
// ─────────────────────────────────────────────

/**
 * `alta`      → el área de la vacante es de las afines a la carrera.
 * `posible`   → falta el dato (vacante legada sin área, área "Otra", o carrera
 *               fuera del catálogo). **Se muestra igual**: un dato ausente no
 *               debe quitarle una oportunidad al estudiante.
 * `ninguna`   → áreas conocidas y distintas.
 */
export type Afinidad = "alta" | "posible" | "ninguna";

export interface VacanteAfin {
  area?: string | null;
  tags?: string[] | null;
}

export function afinidadCarreraVacante(
  nombreCarrera: string | null | undefined,
  vacante: VacanteAfin | null | undefined,
): Afinidad {
  const area = vacante?.area?.trim();
  if (!area || area === "Otra") return "posible";

  const afines = areasDeCarrera(nombreCarrera);
  if (afines.length === 0) return "posible"; // carrera desconocida

  return afines.includes(area as Area) ? "alta" : "ninguna";
}

/** Filtro duro del buscador: oculta lo que claramente no es de su carrera. */
export function esVacanteAfin(
  nombreCarrera: string | null | undefined,
  vacante: VacanteAfin | null | undefined,
): boolean {
  return afinidadCarreraVacante(nombreCarrera, vacante) !== "ninguna";
}

/**
 * Puntúa una vacante contra la carrera y las habilidades del estudiante, para
 * ORDENAR sugerencias (no para bloquear). Los tags solo suman: un alumno puede
 * servir para un rol aunque no lo tenga listado en su perfil.
 */
export function puntuarVacante(
  nombreCarrera: string | null | undefined,
  skills: string[] | null | undefined,
  vacante: VacanteAfin | null | undefined,
): number {
  const af = afinidadCarreraVacante(nombreCarrera, vacante);
  let puntos = af === "alta" ? 10 : af === "posible" ? 3 : 0;

  const tags = vacante?.tags ?? [];
  if (tags.length > 0 && skills && skills.length > 0) {
    const mias = new Set(skills.map(normalizar));
    const coincidencias = tags.filter(t => mias.has(normalizar(t))).length;
    puntos += coincidencias * 2;
  }
  return puntos;
}
