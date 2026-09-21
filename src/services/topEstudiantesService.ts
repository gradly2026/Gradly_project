// ════════════════════════════════════════════════════════════════════════
// topEstudiantesService.ts — "estudiantes destacados", auto-reportados.
//
// Las reglas de Firestore NO dejan que un estudiante (ni una universidad) lea
// el perfil/calificación de OTROS estudiantes, así que un ranking calculado
// en el cliente solo funcionaría para empresa/admin. La solución (misma que
// ya usa `calificacion_estudiantes_promedio`): cada institución calcula SU
// propio top y lo escribe en su propio perfil; el resto solo lo lee.
//
//   · Empresa      → hasta 3 estudiantes que ya culminaron con ella (pasantía
//                    por cupo o de grupo terminada, o puesto de empleo), con bono si su universidad
//                    está bien calificada.
//                    Escribe `perfiles_empresas/{id}.top_estudiantes`.
//   · Universidad  → hasta 5 de sus estudiantes mejor calificados, con bono
//                    si trabajan en un puesto/pasantía de una empresa bien
//                    calificada. Escribe `perfiles_universidades/{id}.top_estudiantes`.
//
// En ambas SOLO entra quien ya culminó, fue CERTIFICADO por su universidad y
// tiene calificación por reseñas — ver `esElegibleTopEstudiante`.
//
// Estas listas por perfil son las que se ven DENTRO del perfil público de cada
// empresa/universidad. NO alimentan el "Top 3 estudiantes" de la Red Gradly
// (NetworkStats.tsx): ese es un top único de toda la plataforma que calcula el
// servidor cada 3 días — ver functions/src/topEstudiantes.ts.
//
// Cada fila lleva además `horasCertificadas` (las `horas_aprobadas` del
// estudiante), dato informativo de esa fila.
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
  /** Horas de práctica ya CERTIFICADAS por la universidad (`horas_aprobadas` del
   *  perfil del estudiante: solo suben cuando la universidad valida el
   *  comprobante o certifica la pasantía). El "Top 3 estudiantes" de la Red
   *  Gradly (calculado en el servidor, functions/src/topEstudiantes.ts) solo
   *  incluye a quien tiene más de 0. Opcional porque las entradas
   *  auto-reportadas antes de este campo no lo traen. */
  horasCertificadas?: number;
}

/** Umbral de "calificación alta" (de la institución vinculada): aporta el
 *  bono de prioridad en el score. NO filtra estudiantes (eso lo hace
 *  `esElegibleTopEstudiante`): solo influye en el orden. */
export const UMBRAL_DESTACADO = 3.5;

const MAX_EMPRESA = 3;
const MAX_UNI = 5;

const numOr0 = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * ¿Entra una fila en la lista de "mejores estudiantes" de un perfil? Solo quien
 * ya CULMINÓ y fue CERTIFICADO por su universidad (`horasCertificadas` > 0: las
 * `horas_aprobadas` solo suben cuando la universidad valida el comprobante o
 * certifica la pasantía) y tiene calificación por reseñas (`stars` > 0). Acepta
 * también la forma vieja de la fila (`calificacion_promedio`). Las filas
 * guardadas antes de que existiera `horasCertificadas` no lo traen y quedan
 * fuera hasta que su institución abra su panel y se recalculen.
 *
 * La usan el cálculo (abajo) Y los modales que muestran la lista, para que una
 * lista vieja ya guardada en un perfil no siga enseñando estudiantes sin
 * certificar o sin reseña.
 */
export function esElegibleTopEstudiante(
  e: { stars?: unknown; calificacion_promedio?: unknown; horasCertificadas?: unknown } | null | undefined,
): boolean {
  if (!e) return false;
  return numOr0(e.calificacion_promedio ?? e.stars) > 0 && numOr0(e.horasCertificadas) > 0;
}

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
    // Tres vías por las que un estudiante "está" en una empresa: un contrato de
    // empleo activo (`contratos_laborales`), una pasantía por cupo
    // (`asignaciones_cupo`) o una pasantía de GRUPO (`solicitudes_practicas`, el
    // flujo donde la universidad ofrece un grupo entero; ahí no hay cupo por
    // estudiante). La empresa puede leer las tres colecciones por su propio id.
    // Se combinan y se deduplican por estudiante (gana el contrato). La de
    // grupo es la única que puede fallar sin tumbar a las demás: si no se puede
    // leer, el resultado es el de siempre (contratos + cupos).
    const [contrSnap, cupoSnap, grupoSnap] = await Promise.all([
      getDocs(query(collection(db, 'contratos_laborales'), where('empresaId', '==', empresaId))),
      getDocs(query(collection(db, 'asignaciones_cupo'), where('empresaId', '==', empresaId))),
      getDocs(query(collection(db, 'solicitudes_practicas'), where('empresaId', '==', empresaId))).catch(() => null),
    ]);

    // `culminada`: el estudiante YA terminó con esta empresa — un puesto de
    // empleo cuenta siempre; una pasantía de cupo solo si se cerró por cumplir
    // sus horas (`finalizada`, no por despido/renuncia: `terminacionAnticipada`);
    // una de grupo, si la solicitud quedó `finalizado` (la finaliza la empresa).
    const porEst = new Map<string, { estudianteId: string; nombre: string; foto: string; puesto: string; salarioTxt: string | null; contratado: boolean; culminada: boolean }>();
    contrSnap.docs.forEach(d => {
      const c: any = d.data();
      if (c.estado !== 'activo' || !c.estudianteId) return;
      porEst.set(c.estudianteId, {
        estudianteId: c.estudianteId,
        nombre: c.estudianteNombre || 'Estudiante',
        foto: c.estudianteFoto || '',
        puesto: c.vacanteTitulo || 'Puesto',
        salarioTxt: textoSalario(c.salario_min, c.salario_max),
        contratado: true,
        culminada: true,
      });
    });
    cupoSnap.docs.forEach(d => {
      const a: any = d.data();
      if (a.estado === 'cancelado' || !a.estudianteId) return;
      const culminada = a.finalizada === true && a.terminacionAnticipada !== true;
      const previo = porEst.get(a.estudianteId);
      // Ya cuenta como contratado, o ya hay una pasantía culminada, o esta no lo está.
      if (previo && (previo.contratado || previo.culminada || !culminada)) return;
      porEst.set(a.estudianteId, {
        estudianteId: a.estudianteId,
        nombre: a.estudianteNombre || 'Estudiante',
        foto: '',
        puesto: a.vacanteTitulo || 'Pasantía',
        salarioTxt: null,
        contratado: false,
        culminada,
      });
    });
    // Pasantías de grupo ya finalizadas: cada alumno real de la solicitud
    // (`estudianteIds`, los uids de Auth). Solo suman quien aún no está como
    // contrato o como cupo culminado; el nombre lo pone el perfil más abajo (la
    // solicitud no lo trae por uid de forma fiable) y el puesto se queda genérico.
    grupoSnap?.docs.forEach(d => {
      const s: any = d.data();
      if (s.estado !== 'finalizado') return;
      const ids: unknown[] = Array.isArray(s.estudianteIds) ? s.estudianteIds : [];
      ids.forEach(id => {
        if (typeof id !== 'string' || !id) return;
        const previo = porEst.get(id);
        if (previo && (previo.contratado || previo.culminada)) return;
        porEst.set(id, {
          estudianteId: id,
          nombre: '',
          foto: '',
          puesto: 'Pasantía',
          salarioTxt: null,
          contratado: false,
          culminada: true,
        });
      });
    });

    const base = Array.from(porEst.values());
    if (base.length === 0) {
      await updateDoc(doc(db, 'perfiles_empresas', empresaId), { top_estudiantes: [] });
      return;
    }

    const uniCache = new Map<string, { nombre: string; alta: boolean }>();
    const filas = await Promise.all(
      base.map(async b => {
        let stars = 0;
        let rango = '';
        let uniId = '';
        let horasCertificadas = 0;
        let foto = b.foto || null;
        let nombre = b.nombre;
        try {
          const e = await getDoc(doc(db, 'perfiles_estudiantes', b.estudianteId));
          if (e.exists()) {
            const x: any = e.data();
            if (!nombre) nombre = x.nombre_completo || '';
            stars = numOr0(x.calificacion_promedio);
            rango = x.rango_nivel ?? '';
            uniId = x.universidad_id ?? '';
            horasCertificadas = numOr0(x.horas_aprobadas);
            if (!foto) foto = x.foto_url ?? null;
          }
        } catch { /* best-effort */ }
        const uni = await infoUni(uniId, uniCache);
        const entry: TopEstudianteEntry = {
          id: b.estudianteId,
          nombre: nombre || 'Estudiante',
          foto,
          stars,
          rango,
          universidadNombre: uni.nombre,
          empresaNombre: '',
          puesto: b.puesto,
          salarioTxt: b.salarioTxt,
          contratado: b.contratado,
          horasCertificadas,
        };
        return { entry, score: stars + (uni.alta ? 1 : 0), culminada: b.culminada };
      }),
    );

    // Solo quien ya culminó con esta empresa, está certificado y tiene reseña
    // (`esElegibleTopEstudiante`); entre ellos, los mejores por score. El bono de
    // "institución bien calificada" ya usa UMBRAL_DESTACADO. Si no hay ninguno,
    // se guarda [] (así se limpia una lista vieja).
    const top = filas
      .filter(f => f.culminada && esElegibleTopEstudiante(f.entry))
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
          horasCertificadas: numOr0(x.horas_aprobadas),
        };
        return { entry, score: stars + (empAlta ? 1 : 0) };
      }),
    );

    // Solo estudiantes certificados y con reseña (`esElegibleTopEstudiante`);
    // entre ellos, los mejores por score. El bono de "empresa bien calificada"
    // ya usa UMBRAL_DESTACADO. Si no hay ninguno, se guarda [] (así se limpia
    // una lista vieja).
    const top = filas
      .filter(f => esElegibleTopEstudiante(f.entry))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_UNI)
      .map(f => f.entry);

    await updateDoc(doc(db, 'perfiles_universidades', universidadId), { top_estudiantes: top });
  } catch (e) {
    console.warn('recomputarTopEstudiantesUniversidad:', e);
  }
}
