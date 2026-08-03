import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../config/firebaseConfig";

/**
 * Cloud Functions que una universidad usa para deshacer su propia carga por
 * Excel (estudiante o grupo completo) — ver functions/src/universidad.ts
 * para el porqué de que esto viva en el servidor y no en el cliente.
 */

type EliminarEstudianteInput = { estudianteId: string; reason?: string };
type EliminarEstudianteOutput = { ok: boolean; uid: string };

type EliminarGrupoInput = { grupoId: string; reason?: string };
type EliminarGrupoOutput = { ok: boolean; id: string; estudiantesEliminados: number };

const functions = getFunctions(app, "us-central1");

const _eliminarEstudiante = httpsCallable<EliminarEstudianteInput, EliminarEstudianteOutput>(
  functions,
  "eliminarEstudiante",
);
const _eliminarGrupo = httpsCallable<EliminarGrupoInput, EliminarGrupoOutput>(
  functions,
  "eliminarGrupo",
);

export async function eliminarEstudiante(
  input: EliminarEstudianteInput,
): Promise<EliminarEstudianteOutput> {
  const res = await _eliminarEstudiante(input);
  return res.data;
}

export async function eliminarGrupo(
  input: EliminarGrupoInput,
): Promise<EliminarGrupoOutput> {
  const res = await _eliminarGrupo(input);
  return res.data;
}
