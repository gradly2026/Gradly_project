/**
 * perfilesPublicos.ts — perfil público FILTRADO de los estudiantes destacados.
 *
 * Por qué existe: los estudiantes ahora ven el Top 3 y pueden abrir el perfil de
 * los destacados (para motivarse), pero `perfiles_estudiantes` no se puede abrir a
 * otros estudiantes: las reglas de Firestore leen el documento ENTERO y ahí viven
 * el DUI, el teléfono, la dirección, las coordenadas de la casa y la URL del CV.
 * Esta colección, `perfiles_publicos_estudiantes/{uid}`, guarda SOLO campos "de
 * logros" (lista blanca, abajo) y la puede leer cualquier usuario autenticado. Solo
 * la escribe el servidor (reglas: write false).
 *
 * Quién tiene uno: únicamente los estudiantes destacados — el Top 3 de la
 * plataforma (`topEstudiantes.ts`) y los mejores de cada empresa/universidad
 * (`topPerfiles.ts`). Quien deja de estar en todas esas listas, o cuya cuenta se
 * banea/inactiva, pierde el suyo (`depurarPerfilesPublicos`): la exposición se queda
 * acotada a quien aparece en pantalla.
 *
 * Este archivo no importa de topEstudiantes.ts ni de topPerfiles.ts (ellos lo
 * importan a él) para no crear un ciclo.
 */
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

export const COL_PERFIL_PUBLICO = "perfiles_publicos_estudiantes";

/**
 * LISTA BLANCA: lo único que se copia de `perfiles_estudiantes`. Son los campos que
 * lee `PerfilPublicoModal` para un estudiante (nombre, foto, carrera, "Acerca de",
 * horas, reseñas, habilidades…), con el MISMO nombre que tienen allá para que el
 * modal funcione igual leyendo de cualquiera de los dos.
 *
 * Nunca agregues aquí: telefono, correo/email, direccion, departamento, distrito,
 * ubicacion_precisa, doc_tipo, doc_numero, cv_url, linkedin, facebook, instagram.
 * Un test (functions/…/perfilesPublicos) vigila que ninguno se cuele.
 */
export const CAMPOS_PUBLICOS = [
  "nombre_completo",
  "foto_url",
  "foto_perfil",
  "carrera",
  "semestre",
  "headline",
  "area",
  "descripcion",
  "universidad_id",
  "grupo_id",
  "skills",
  "estado_pasantia",
  "disponibilidad_auto",
  "horas_aprobadas",
  "horas_objetivo",
  "calificacion_promedio",
  "calificaciones_recibidas",
  "puntos_experiencia",
  "pasantias_completadas",
] as const;

const str = (v: unknown): string => String(v ?? "").trim();

/**
 * Perfil público a partir del documento completo. Copia solo la lista blanca (y
 * únicamente valores que no sean `undefined`/`null`) y agrega `empresa_pasantia`
 * (dónde hace/hizo su pasantía o trabajo; las reglas de `asignaciones_cupo` no dejan
 * que otro estudiante lo averigüe, así que lo calcula el servidor).
 */
export function construirPerfilPublico(
  completo: Record<string, unknown>,
  empresaPasantia: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const campo of CAMPOS_PUBLICOS) {
    const v = completo[campo];
    if (v === undefined || v === null) continue;
    out[campo] = v;
  }
  const empresa = str(empresaPasantia);
  if (empresa) out.empresa_pasantia = empresa;
  return out;
}

/** ¿La cuenta sigue activa? Mismo criterio que `cuentaActiva` de topEstudiantes.ts. */
export function cuentaVigente(usuario: Record<string, unknown> | undefined): boolean {
  if (!usuario) return false;
  if (usuario.baneado === true || usuario.activo === false) return false;
  const status = str(usuario.status).toLowerCase();
  return status !== "inactive" && status !== "blocked" && status !== "disabled";
}

const TAMANO_LOTE = 100;

export interface ResumenPublicacion {
  publicados: number;
  omitidos: number;
}

/**
 * Publica (reemplaza por completo) el perfil público de cada estudiante de `ids`.
 * `empresaPorId`: dónde hace su pasantía cada uno, si ya se sabe (opcional).
 * Un estudiante sin perfil, o con la cuenta baneada/inactiva, se omite y se le borra
 * el que tuviera. Nunca lanza por un estudiante suelto: lo registra y sigue.
 */
export async function publicarPerfilesPublicos(
  ids: Iterable<string>,
  empresaPorId: Map<string, string> = new Map(),
): Promise<ResumenPublicacion> {
  const unicos = [...new Set([...ids].map(str).filter(Boolean))];
  const resumen: ResumenPublicacion = { publicados: 0, omitidos: 0 };

  for (let i = 0; i < unicos.length; i += TAMANO_LOTE) {
    const lote = unicos.slice(i, i + TAMANO_LOTE);
    try {
      const [perfiles, usuarios] = await Promise.all([
        db.getAll(...lote.map((id) => db.collection("perfiles_estudiantes").doc(id))),
        db.getAll(...lote.map((id) => db.collection("usuarios").doc(id))),
      ]);
      const batch = db.batch();
      let publicados = 0;
      let omitidos = 0;
      lote.forEach((id, k) => {
        const destino = db.collection(COL_PERFIL_PUBLICO).doc(id);
        const perfil = perfiles[k];
        if (!perfil.exists || !cuentaVigente(usuarios[k].data())) {
          batch.delete(destino);
          omitidos++;
          return;
        }
        batch.set(destino, {
          ...construirPerfilPublico(perfil.data() ?? {}, empresaPorId.get(id) ?? ""),
          actualizado_at: admin.firestore.FieldValue.serverTimestamp(),
        });
        publicados++;
      });
      await batch.commit();
      // Se suma solo si el lote se guardó de verdad.
      resumen.publicados += publicados;
      resumen.omitidos += omitidos;
    } catch (e) {
      logger.warn("perfiles públicos: no se pudo publicar un lote", { desde: i, e });
    }
  }
  return resumen;
}

/** Borra los perfiles públicos de quien ya NO está en `vigentes`. Devuelve cuántos borró. */
export async function depurarPerfilesPublicos(vigentes: Set<string>): Promise<number> {
  const snap = await db.collection(COL_PERFIL_PUBLICO).select().get();
  const sobrantes = snap.docs.filter((d) => !vigentes.has(d.id));
  for (let i = 0; i < sobrantes.length; i += 400) {
    const batch = db.batch();
    sobrantes.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return sobrantes.length;
}
