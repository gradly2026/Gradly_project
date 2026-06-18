import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';

async function recalcularPromedioEmpresa(empresaId: string): Promise<void> {
  const q = query(
    collection(db, 'aplicaciones'),
    where('empresa_id', '==', empresaId),
    where('calificacion_empresa_enviada', '==', true),
  );
  const snap = await getDocs(q);
  if (snap.empty) return;

  const total = snap.docs.reduce((acc, d) => acc + (d.data().calificacion_empresa ?? 0), 0);
  const promedio = parseFloat((total / snap.size).toFixed(1));
  await updateDoc(doc(db, 'perfiles_empresas', empresaId), { calificacion_promedio: promedio });
}

async function recalcularPromedioEstudiante(estudianteId: string): Promise<void> {
  const q = query(
    collection(db, 'aplicaciones'),
    where('estudiante_id', '==', estudianteId),
    where('calificacion_estudiante_enviada', '==', true),
  );
  const snap = await getDocs(q);
  if (snap.empty) return;

  const total = snap.docs.reduce((acc, d) => acc + (d.data().calificacion_estudiante ?? 0), 0);
  const promedio = parseFloat((total / snap.size).toFixed(1));
  await updateDoc(doc(db, 'perfiles_estudiantes', estudianteId), { calificacion_promedio: promedio });
}

/**
 * El estudiante califica a la empresa tras una pasantía aprobada.
 */
export async function calificarEmpresa(
  aplicacionId: string,
  estudianteId: string,
  calificacion: number,
  comentario: string,
): Promise<void> {
  if (calificacion < 1 || calificacion > 5) throw new Error('Calificación debe ser entre 1 y 5.');

  const appSnap = await getDoc(doc(db, 'aplicaciones', aplicacionId));
  if (!appSnap.exists()) throw new Error('Aplicación no encontrada.');
  const app = appSnap.data();
  if (app.estudiante_id !== estudianteId) throw new Error('Sin autorización.');
  if (app.estado !== 'aprobado') throw new Error('Solo puedes calificar pasantías aprobadas.');
  if (app.calificacion_empresa_enviada) throw new Error('Ya calificaste esta empresa.');

  await updateDoc(doc(db, 'aplicaciones', aplicacionId), {
    calificacion_empresa:              calificacion,
    calificacion_empresa_comentario:   comentario,
    calificacion_empresa_enviada:      true,
  });

  await recalcularPromedioEmpresa(app.empresa_id);
}

/**
 * La empresa califica al estudiante tras una pasantía aprobada.
 */
export async function calificarEstudiante(
  aplicacionId: string,
  empresaId: string,
  calificacion: number,
  comentario: string,
): Promise<void> {
  if (calificacion < 1 || calificacion > 5) throw new Error('Calificación debe ser entre 1 y 5.');

  const appSnap = await getDoc(doc(db, 'aplicaciones', aplicacionId));
  if (!appSnap.exists()) throw new Error('Aplicación no encontrada.');
  const app = appSnap.data();
  if (app.empresa_id !== empresaId) throw new Error('Sin autorización.');
  if (app.estado !== 'aprobado') throw new Error('Solo puedes calificar pasantías aprobadas.');
  if (app.calificacion_estudiante_enviada) throw new Error('Ya calificaste a este estudiante.');

  await updateDoc(doc(db, 'aplicaciones', aplicacionId), {
    calificacion_estudiante:              calificacion,
    calificacion_estudiante_comentario:   comentario,
    calificacion_estudiante_enviada:      true,
  });

  await recalcularPromedioEstudiante(app.estudiante_id);
}
