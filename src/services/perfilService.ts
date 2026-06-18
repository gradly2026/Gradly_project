import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';

/**
 * Perfil público del estudiante — solo campos visibles para empresas.
 * NO incluye: correo, teléfono, datos bancarios.
 */
export async function getPerfilPublicoEstudiante(estudianteId: string) {
  const snap = await getDoc(doc(db, 'perfiles_estudiantes', estudianteId));
  if (!snap.exists()) throw new Error('Estudiante no encontrado.');
  const d = snap.data();
  return {
    id:                  estudianteId,
    nombre_completo:     d.nombre_completo,
    foto_url:            d.foto_url,
    carrera:             d.carrera,
    universidad_id:      d.universidad_id,
    skills:              d.skills ?? [],
    disponibilidad:      d.disponibilidad,
    cv_url:              d.cv_url,
    calificacion_promedio: d.calificacion_promedio ?? 0,
    // correo y telefono: SOLO via revelarContactoEstudiante()
  };
}

/**
 * Revela correo y contacto del estudiante — SOLO si la aplicación está en estado "contratado".
 */
export async function revelarContactoEstudiante(
  estudianteId: string,
  empresaId: string,
  aplicacionId: string,
) {
  const appSnap = await getDoc(doc(db, 'aplicaciones', aplicacionId));
  if (!appSnap.exists()) throw new Error('Aplicación no encontrada.');
  const app = appSnap.data();
  if (app.empresa_id !== empresaId) throw new Error('Sin autorización.');
  if (app.estado !== 'contratado') throw new Error('Solo disponible para estudiantes contratados.');

  const snap = await getDoc(doc(db, 'perfiles_estudiantes', estudianteId));
  if (!snap.exists()) throw new Error('Estudiante no encontrado.');
  const d = snap.data();
  return {
    correo:    d.correo ?? '',
    linkedin:  d.linkedin ?? '',
    portfolio: d.portfolio ?? '',
  };
}

/**
 * Perfil público de empresa — visible para estudiantes.
 * NO incluye: NIT, datos de tarjeta, stripe_id.
 */
export async function getPerfilPublicoEmpresa(empresaId: string) {
  const snap = await getDoc(doc(db, 'perfiles_empresas', empresaId));
  if (!snap.exists()) throw new Error('Empresa no encontrada.');
  const d = snap.data();
  return {
    id:                  empresaId,
    nombre_empresa:      d.nombre_empresa,
    industria:           d.industria,
    descripcion:         d.descripcion,
    logo_url:            d.logo_url,
    sitio_web:           d.sitio_web,
    premium:             d.premium ?? false,
    verificado:          d.verificado ?? false,
    plan:                d.plan ?? 'gratuito',
    calificacion_promedio: d.calificacion_promedio ?? 0,
  };
}
