// ════════════════════════════════════════════════════════════════════════
// skills.ts
//
// Emparejado de skills TOLERANTE a la escritura entre lo que pide una vacante
// y lo que un estudiante anotó en su perfil. El caso que motivó esto: la
// vacante pide "Node js" y el estudiante escribió "nodejs" — es la misma
// skill y debe contar.
//
// Lo usa el listado de candidatos de una vacante en Reclutamiento: un
// candidato que cumple una skill pedida sube en el ranking (ver
// rankingCandidatos.ts) y muestra un chip "Cumple con {skill}". Las skills
// pedidas por la vacante también se ofrecen como filtros en ese listado.
// ════════════════════════════════════════════════════════════════════════

// Sinónimos frecuentes → forma canónica (ya normalizada, sin espacios ni
// signos). Lista corta y CONSERVADORA: solo pares donde dos nombres muy
// distintos son inequívocamente la misma tecnología. Todo lo demás se
// resuelve solo con la normalización de abajo ("Node js"/"node.js"/"NODEJS"
// colapsan a "nodejs" sin necesidad de entrada aquí).
const SINONIMOS: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  reactjs: 'react',
  reactnative: 'reactnative',
  nodejs: 'node',
  node: 'node',
  nextjs: 'next',
  postgres: 'postgresql',
  postgre: 'postgresql',
  psql: 'postgresql',
};

/**
 * Reduce una skill a una llave comparable: sin acentos, sin espacios ni
 * signos de puntuación, en minúsculas, y pasada por el mapa de sinónimos.
 *
 *   "Node js"   → "node"
 *   "React.js"  → "react"
 *   "UI/UX"     → "uiux"
 *   "  C++  "   → "c"      (los signos se van; aceptable para este uso)
 */
export function normalizarSkill(raw: string): string {
  const base = (raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita los diacríticos ya separados por NFD
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return SINONIMOS[base] ?? base;
}

/** ¿Estas dos skills son "la misma" a ojos del emparejado tolerante? */
export function skillsCoinciden(a: string, b: string): boolean {
  const na = normalizarSkill(a);
  const nb = normalizarSkill(b);
  return !!na && na === nb;
}

/**
 * Cruza las skills pedidas por la vacante con las del estudiante y devuelve
 * las etiquetas TAL CUAL las escribió la vacante que el estudiante cumple
 * (para mostrarlas en el chip "Cumple con {skill}" con el texto de la empresa).
 */
export function matchSkills(
  skillsVacante: string[] = [],
  skillsEstudiante: string[] = [],
): string[] {
  const set = new Set(skillsEstudiante.map(normalizarSkill).filter(Boolean));
  return skillsVacante.filter((s) => {
    const n = normalizarSkill(s);
    return !!n && set.has(n);
  });
}

/** ¿El estudiante tiene anotada (tolerante) esta skill concreta? Para los
 *  filtros por-skill del listado de candidatos. */
export function estudianteCumpleSkill(skillVacante: string, skillsEstudiante: string[] = []): boolean {
  const objetivo = normalizarSkill(skillVacante);
  if (!objetivo) return false;
  return skillsEstudiante.some((s) => normalizarSkill(s) === objetivo);
}
