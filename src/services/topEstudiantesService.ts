// ════════════════════════════════════════════════════════════════════════
// topEstudiantesService.ts — "estudiantes destacados", auto-reportados.
//
// Las reglas de Firestore NO dejan que un estudiante (ni una universidad) lea
// el perfil/calificación de OTROS estudiantes, así que un ranking calculado
// en el cliente solo funcionaría para empresa/admin. La solución (misma que
// ya usa `calificacion_estudiantes_promedio`): cada institución calcula SU
// propio top y lo escribe en su propio perfil; el resto solo lo lee.
//
//   · Empresa      → hasta 3 estudiantes contratados en sus puestos, con
//                    bono si su universidad está bien calificada.
//                    Escribe `perfiles_empresas/{id}.top_estudiantes`.
//   · Universidad  → hasta 5 de sus estudiantes mejor calificados, con bono
//                    si trabajan en un puesto/pasantía de una empresa bien
//                    calificada. Escribe `perfiles_universidades/{id}.top_estudiantes`.
//
// El dueño puede escribir cualquier campo de su propio perfil → sin cambio de
// reglas. Todo va en try/catch: es un dato informativo, nunca bloquea.
// ════════════════════════════════════════════════════════════════════════

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import { textoSalario } from '../utils/cupos';

/** Fila del cuadro de "estudiantes destacados" — trae TODO lo que se pinta,
 *  sin lecturas extra en quien lo lee. */
export interface TopEstudianteEntry {
  id: string;
  nombre: string;
  foto: string | null;
  /** `calificacion_promedio` (0–5). */
  stars: number;
  /** `rango_nivel` (string libre). */
  rango: string;
  universidadNombre: string;
  /** Empresa del puesto (si `contratado`) o de la pasantía. */
  empresaNombre: string;
  /** Título del puesto de empleo o de la pasantía. */
  puesto: string;
  /** "$400 - $600" — solo si es un contrato de empleo con salario declarado. */
  salarioTxt: string | null;
  /** true = puesto de empleo (`contratos_laborales`); false = pasantía. */
  contratado: boolean;
}

/** Umbral de "calificación alta": aporta el bono de prioridad, y es el piso
 *  para entrar al cuadro (por debajo no se considera "destacado"). */
export const UMBRAL_DESTACADO = 3.5;

const MAX_EMPRESA = 3;
const MAX_UNI = 5;

const numOr0 = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Lee nombre + "está bien calificada" de una universidad, con caché local. */
async function infoUni(
  uniId: string,
  cache: Map<string, { nombre: string; alta: boolean }>,
): Promise<{ nombre: string; alta: boolean }> {
  if (!uniId) return { nombre: '', alta: false };
  const hit = cache.get(uniId);
  if (hit) return hit;
  let out = { nombre: '', alta: false };
  try {
    const s = await getDoc(doc(db, 'perfiles_universidades', uniId));
    if (s.exists()) {
      const x: any = s.data();
      out = {
        nombre: x.nombre_universidad ?? '',
        alta: numOr0(x.calificacion_estudiantes_promedio) >= UMBRAL_DESTACADO,
      };
    }
  } catch { /* best-effort */ }
  cache.set(uniId, out);
  return out;
}

/** Lee nombre + "está bien calificada" de una empresa, con caché local. */
async function infoEmp(
  empId: string,
  cache: Map<string, { nombre: string; alta: boolean }>,
): Promise<{ nombre: string; alta: boolean }> {
  if (!empId) return { nombre: '', alta: false };
  const hit = cache.get(empId);
  if (hit) return hit;
  let out = { nombre: '', alta: false };
  try {
    const s = await getDoc(doc(db, 'perfiles_empresas', empId));
    if (s.exists()) {
      const x: any = s.data();
      out = {
        nombre: x.nombre_empresa ?? '',
        alta: numOr0(x.calificacion_estudiantes_promedio) >= UMBRAL_DESTACADO,
      };
    }
  } catch { /* best-effort */ }
  cache.set(empId, out);
  return out;
}

/**
 * Recalcula el top 3 de estudiantes contratados de una empresa y lo guarda en
 * su propio perfil. Se llama al abrir el dashboard de la empresa (fire-and-forget).
 */
export async function recomputarTopEstudiantesEmpresa(empresaId: string): Promise<void> {
  if (!empresaId) return;
  try {
    const snap = await getDocs(
      query(collection(db, 'contratos_laborales'), where('empresaId', '==', empresaId)),
    );
    const activos = snap.docs
      .map(d => ({ id: d.id, ...(d.data() as any) }))
      .filter(c => c.estado === 'activo');

    if (activos.length === 0) {
      await updateDoc(doc(db, 'perfiles_empresas', empresaId), { top_estudiantes: [] });
      return;
    }

    const uniCache = new Map<string, { nombre: string; alta: boolean }>();
    const filas = await Promise.all(
      activos.map(async c => {
        let stars = 0;
        let rango = '';
        let uniId = '';
        try {
          const e = await getDoc(doc(db, 'perfiles_estudiantes', c.estudianteId));
          if (e.exists()) {
            const x: any = e.data();
            stars = numOr0(x.calificacion_promedio);
            rango = x.rango_nivel ?? '';
            uniId = x.universidad_id ?? '';
          }
        } catch { /* best-effort */ }
        const uni = await infoUni(uniId, uniCache);
        const entry: TopEstudianteEntry = {
          id: c.estudianteId,
          nombre: c.estudianteNombre || 'Estudiante',
          foto: c.estudianteFoto || null,
          stars,
          rango,
          universidadNombre: uni.nombre,
          empresaNombre: c.empresaNombre || '',
          puesto: c.vacanteTitulo || 'Puesto',
          salarioTxt: textoSalario(c.salario_min, c.salario_max),
          contratado: true,
        };
        return { entry, score: stars + (uni.alta ? 1 : 0) };
      }),
    );

    const top = filas
      .filter(f => f.entry.stars >= UMBRAL_DESTACADO)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_EMPRESA)
      .map(f => f.entry);

    await updateDoc(doc(db, 'perfiles_empresas', empresaId), { top_estudiantes: top });
  } catch (e) {
    console.warn('recomputarTopEstudiantesEmpresa:', e);
  }
}

/**
 * Recalcula el top 5 de estudiantes destacados de una universidad y lo guarda
 * en su propio perfil. Se llama al abrir el dashboard de la universidad.
 */
export async function recomputarTopEstudiantesUniversidad(universidadId: string): Promise<void> {
  if (!universidadId) return;
  try {
    const [estSnap, uniSnap, asgSnap] = await Promise.all([
      getDocs(query(collection(db, 'perfiles_estudiantes'), where('universidad_id', '==', universidadId))),
      getDoc(doc(db, 'perfiles_universidades', universidadId)),
      getDocs(query(collection(db, 'asignaciones_cupo'), where('universidadId', '==', universidadId))),
    ]);

    const uniNombre = uniSnap.exists() ? ((uniSnap.data() as any).nombre_universidad ?? '') : '';

    // Asignación de cupo (pasantía) por estudiante — la primera que aparece
    // que no esté cancelada; alcanza para nombrar la empresa/puesto.
    const asgPorEst = new Map<string, any>();
    asgSnap.docs.forEach(d => {
      const a: any = d.data();
      if (a.estado === 'cancelado') return;
      if (!asgPorEst.has(a.estudianteId)) asgPorEst.set(a.estudianteId, a);
    });

    const empCache = new Map<string, { nombre: string; alta: boolean }>();
    const filas = await Promise.all(
      estSnap.docs.map(async d => {
        const x: any = d.data();
        const stars = numOr0(x.calificacion_promedio);
        const a = asgPorEst.get(d.id);
        let empresaNombre = a?.empresaNombre ?? '';
        const puesto = a?.vacanteTitulo ?? '';
        let empAlta = false;
        if (a?.empresaId) {
          const emp = await infoEmp(a.empresaId, empCache);
          empAlta = emp.alta;
          if (!empresaNombre) empresaNombre = emp.nombre;
        }
        const entry: TopEstudianteEntry = {
          id: d.id,
          nombre: x.nombre_completo ?? 'Estudiante',
          foto: x.foto_url ?? null,
          stars,
          rango: x.rango_nivel ?? '',
          universidadNombre: uniNombre,
          empresaNombre,
          puesto,
          salarioTxt: null,
          contratado: false,
        };
        return { entry, score: stars + (empAlta ? 1 : 0) };
      }),
    );

    const top = filas
      .filter(f => f.entry.stars >= UMBRAL_DESTACADO)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_UNI)
      .map(f => f.entry);

    await updateDoc(doc(db, 'perfiles_universidades', universidadId), { top_estudiantes: top });
  } catch (e) {
    console.warn('recomputarTopEstudiantesUniversidad:', e);
  }
}
