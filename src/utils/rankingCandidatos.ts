// ════════════════════════════════════════════════════════════════════════
// rankingCandidatos.ts
//
// Orden del listado de candidatos de una vacante en Reclutamiento.
//
// El filtro "Todos" ordena por un SCORE COMPUESTO que premia, de más peso a
// menos: haber hecho la pasantía con esta empresa  >  cuántas skills pedidas
// cumple  >  mejor calificación (estrellas). Los filtros específicos (por una
// skill, "ex-pasante", "mejor calificados") solo recortan el subconjunto
// visible; el orden dentro de cada uno sigue siendo este score.
//
// Ver skills.ts (matchSkills) para cómo se cuenta `skillsCumplidas`, y
// usePasantesEmpresa.ts para `exPasante`.
// ════════════════════════════════════════════════════════════════════════

export interface FactoresCandidato {
  /** Estrellas del perfil (`calificacion_promedio`, escala 0–5). */
  rating: number;
  /** Nº de skills pedidas por la vacante que el candidato cumple. */
  skillsCumplidas: number;
  /** Total de skills que pide la vacante (para el desempate por cobertura). */
  skillsTotales: number;
  /** ¿Hizo su pasantía con esta misma empresa? (privilegio máximo). */
  exPasante: boolean;
}

/**
 * Puntaje único de un candidato. Los pesos están escalonados a propósito para
 * que cada factor domine al siguiente salvo empate:
 *   - ex-pasante suma 1000 (siempre por encima de cualquier no-ex-pasante)
 *   - cada skill cumplida suma 100
 *   - la cobertura relativa (cumplidas/totales) desempata hasta con 50
 *   - las estrellas afinan con hasta 50 (rating 0–5 × 10)
 */
export function scoreCandidato(f: FactoresCandidato): number {
  const cobertura = f.skillsTotales > 0 ? f.skillsCumplidas / f.skillsTotales : 0;
  return (
    (f.exPasante ? 1000 : 0) +
    f.skillsCumplidas * 100 +
    cobertura * 50 +
    (Number.isFinite(f.rating) ? f.rating : 0) * 10
  );
}

/** Comparador descendente por score, para `Array.prototype.sort`. */
export function compararCandidatos(a: FactoresCandidato, b: FactoresCandidato): number {
  return scoreCandidato(b) - scoreCandidato(a);
}
