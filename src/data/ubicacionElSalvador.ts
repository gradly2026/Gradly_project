// ══════════════════════════════════════════════════════════════════
//  Catálogo de ubicación de El Salvador — los 14 departamentos y sus
//  distritos (división tradicional de 262 municipios, la que reconoce y
//  usa la gente para su dirección — en la app se llama "distrito"; el
//  país los reagrupó en 44 municipios nuevos por ley en 2023, pero esos
//  nombres nuevos no sirven para "¿dónde vivís?").
//
//  Nace del onboarding de dirección del estudiante: perfiles_estudiantes
//  no tenía departamento/distrito, así que CandidatosVacante mostraba
//  "Dirección no especificada" siempre. Ver [[project_reparto_cupos]].
// ══════════════════════════════════════════════════════════════════

/** Los 14 departamentos, en el orden geográfico oeste→este de siempre. */
export const DEPARTAMENTOS_EL_SALVADOR = [
  "Ahuachapán",
  "Santa Ana",
  "Sonsonate",
  "Chalatenango",
  "La Libertad",
  "San Salvador",
  "Cuscatlán",
  "La Paz",
  "Cabañas",
  "San Vicente",
  "Usulután",
  "San Miguel",
  "Morazán",
  "La Unión",
] as const;

export type DepartamentoElSalvador = (typeof DEPARTAMENTOS_EL_SALVADOR)[number];

/** Forma que se guarda en `perfiles_estudiantes`. */
export interface UbicacionEstudiante {
  departamento?: string;
  distrito?: string;
  /** Colonia/calle/referencia — complementa a departamento+distrito, no los sustituye. */
  direccion?: string;
}

/** Distritos por departamento, orden alfabético (262 en total). */
export const DISTRITOS_POR_DEPARTAMENTO: Record<string, string[]> = {
  "Ahuachapán": [
    "Ahuachapán", "Apaneca", "Atiquizaya", "Concepción de Ataco", "El Refugio",
    "Guaymango", "Jujutla", "San Francisco Menéndez", "San Lorenzo",
    "San Pedro Puxtla", "Tacuba", "Turín",
  ],
  "Santa Ana": [
    "Candelaria de la Frontera", "Chalchuapa", "Coatepeque", "El Congo",
    "El Porvenir", "Masahuat", "Metapán", "San Antonio Pajonal",
    "San Sebastián Salitrillo", "Santa Ana", "Santa Rosa Guachipilín",
    "Santiago de la Frontera", "Texistepeque",
  ],
  "Sonsonate": [
    "Acajutla", "Armenia", "Caluco", "Cuisnahuat", "Izalco", "Juayúa",
    "Nahulingo", "Nahuizalco", "Salcoatitán", "San Antonio del Monte",
    "San Julián", "Santa Catarina Masahuat", "Santa Isabel Ishuatán",
    "Santo Domingo de Guzmán", "Sonsonate", "Sonzacate",
  ],
  "Chalatenango": [
    "Agua Caliente", "Arcatao", "Azacualpa", "Cancasque", "Chalatenango",
    "Citalá", "Comalapa", "Concepción Quezaltepeque", "Dulce Nombre de María",
    "El Carrizal", "El Paraíso", "La Laguna", "La Palma", "La Reina",
    "Las Flores", "Las Vueltas", "Nombre de Jesús", "Nueva Concepción",
    "Nueva Trinidad", "Ojos de Agua", "Potonico", "San Antonio de la Cruz",
    "San Antonio Los Ranchos", "San Fernando", "San Francisco Lempa",
    "San Francisco Morazán", "San Ignacio", "San Isidro Labrador",
    "San Luis del Carmen", "San Miguel de Mercedes", "San Rafael",
    "Santa Rita", "Tejutla",
  ],
  "La Libertad": [
    "Antiguo Cuscatlán", "Chiltiupán", "Ciudad Arce", "Colón", "Comasagua",
    "Huizúcar", "Jayaque", "Jicalapa", "La Libertad", "Nuevo Cuscatlán",
    "Quezaltepeque", "Sacacoyo", "San Juan Opico", "San José Villanueva",
    "San Matías", "San Pablo Tacachico", "Santa Tecla", "Talnique",
    "Tamanique", "Teotepeque", "Tepecoyo", "Zaragoza",
  ],
  "San Salvador": [
    "Aguilares", "Apopa", "Ayutuxtepeque", "Cuscatancingo", "Ciudad Delgado",
    "El Paisnal", "Guazapa", "Ilopango", "Mejicanos", "Nejapa",
    "Panchimalco", "Rosario de Mora", "San Marcos", "San Martín",
    "San Salvador", "Santiago Texacuangos", "Santo Tomás", "Soyapango",
    "Tonacatepeque",
  ],
  "Cuscatlán": [
    "Candelaria", "Cojutepeque", "El Carmen", "El Rosario", "Monte San Juan",
    "Oratorio de Concepción", "San Bartolomé Perulapía", "San Cristóbal",
    "San José Guayabal", "San Pedro Perulapán", "San Rafael Cedros",
    "San Ramón", "Santa Cruz Analquito", "Santa Cruz Michapa", "Suchitoto",
    "Tenancingo",
  ],
  "La Paz": [
    "Cuyultitán", "El Rosario", "Jerusalén", "Mercedes La Ceiba",
    "Olocuilta", "Paraíso de Osorio", "San Antonio Masahuat", "San Emigdio",
    "San Francisco Chinameca", "San Juan Nonualco", "San Juan Talpa",
    "San Juan Tepezontes", "San Luis La Herradura", "San Luis Talpa",
    "San Miguel Tepezontes", "San Pedro Masahuat", "San Pedro Nonualco",
    "San Rafael Obrajuelo", "Santa María Ostuma", "Santiago Nonualco",
    "Tapalhuaca", "Zacatecoluca",
  ],
  "Cabañas": [
    "Cinquera", "Dolores", "Guacotecti", "Ilobasco", "Jutiapa",
    "San Isidro", "Sensuntepeque", "Tejutepeque", "Victoria",
  ],
  "San Vicente": [
    "Apastepeque", "Guadalupe", "San Cayetano Istepeque",
    "San Esteban Catarina", "San Ildefonso", "San Lorenzo", "San Sebastián",
    "San Vicente", "Santa Clara", "Santo Domingo", "Tecoluca", "Tepetitán",
    "Verapaz",
  ],
  "Usulután": [
    "Alegría", "Berlín", "California", "Concepción Batres", "El Triunfo",
    "Ereguayquín", "Estanzuelas", "Jiquilisco", "Jucuapa", "Jucuarán",
    "Mercedes Umaña", "Nueva Granada", "Ozatlán", "Puerto El Triunfo",
    "San Agustín", "San Buenaventura", "San Dionisio", "San Francisco Javier",
    "Santa Elena", "Santa María", "Santiago de María", "Tecapán", "Usulután",
  ],
  "San Miguel": [
    "Carolina", "Chapeltique", "Chinameca", "Chirilagua", "Ciudad Barrios",
    "Comacarán", "El Tránsito", "Lolotique", "Moncagua", "Nueva Guadalupe",
    "Nuevo Edén de San Juan", "Quelepa", "San Antonio del Mosco",
    "San Gerardo", "San Jorge", "San Luis de la Reina", "San Miguel",
    "San Rafael Oriente", "Sesori", "Uluazapa",
  ],
  "Morazán": [
    "Arambala", "Cacaopera", "Chilanga", "Corinto", "Delicias de Concepción",
    "El Divisadero", "El Rosario", "Gualococti", "Guatajiagua", "Joateca",
    "Jocoaitique", "Jocoro", "Lolotiquillo", "Meanguera", "Osicala",
    "Perquín", "San Carlos", "San Fernando", "San Francisco Gotera",
    "San Isidro", "San Simón", "Sensembra", "Sociedad", "Torola",
    "Yamabal", "Yoloaiquín",
  ],
  "La Unión": [
    "Anamorós", "Bolívar", "Concepción de Oriente", "Conchagua", "El Carmen",
    "El Sauce", "Intipucá", "La Unión", "Lislique", "Meanguera del Golfo",
    "Nueva Esparta", "Pasaquina", "Polorós", "San Alejo", "San José",
    "Santa Rosa de Lima", "Yayantique", "Yucuaiquín",
  ],
};

/** Distritos del departamento dado, o `[]` si no está en el catálogo. */
export function distritosDeDepartamento(departamento?: string | null): string[] {
  if (!departamento) return [];
  return DISTRITOS_POR_DEPARTAMENTO[departamento] ?? [];
}

/** True si el par departamento/distrito existe tal cual en el catálogo. */
export function esUbicacionValida(
  departamento?: string | null,
  distrito?: string | null,
): boolean {
  if (!departamento || !distrito) return false;
  return distritosDeDepartamento(departamento).includes(distrito);
}

/**
 * Texto legible para mostrar una ubicación. Acepta que falte el distrito
 * (dato parcial) o todo (perfil sin completar) sin romper — mismo espíritu
 * que `textoCupos`/`textoHorario` en utils/cupos.ts.
 */
export function textoUbicacion(datos: {
  departamento?: string | null;
  distrito?: string | null;
}): string {
  return [datos.distrito, datos.departamento].filter(Boolean).join(", ");
}
