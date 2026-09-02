// ════════════════════════════════════════════════════════════════════════
// pasantiaService.ts
//
// QUÉ ES ESTE ARCHIVO:
// Este es el archivo MÁS GRANDE e importante del negocio de Gradly: aquí
// vive TODO el ciclo de vida de una pasantía/práctica laboral, desde que
// un estudiante aplica hasta que la empresa la certifica. Es el mejor
// lugar del proyecto para aprender el patrón CRUD completo de Firestore
// (Create, Read, Update, Delete) en la práctica, incluyendo un mecanismo
// avanzado llamado TRANSACCIÓN (explicado más abajo, en el punto 7).
//
// Si es la primera vez que lees un "service" de este proyecto, antes
// repasa src/config/firebaseConfig.ts (de dónde sale `db`) y
// GUIA_01_FIREBASE_Y_CRUD.md (los 4 verbos CRUD explicados en general).
//
// MAPA DEL ARCHIVO (los números son los mismos que usan los comentarios
// de sección dentro del código):
//   1. Estudiante aplica a una vacante (individual).
//   1b. Estudiante aplica a una pasantía por su cuenta (autoservicio).
//   2. Empresa cambia el estado de una aplicación (acepta/rechaza/entrevista).
//   3. Estudiante marca su proyecto como finalizado.
//   4. Empresa firma la constancia de finalización.
//   5. (Título de sección; la aprobación de horas vive en otro archivo)
//   6. Universidad postula un GRUPO de estudiantes a una vacante.
//   7. Empresa evalúa (acepta/rechaza) ese grupo — usa una TRANSACCIÓN.
//   8. Universidad da la respuesta final sobre la oferta de la empresa —
//      usa una TRANSACCIÓN más grande, la más compleja del archivo.
//   9. Empresa elimina una vacante (solo si nadie la tocó todavía).
// ════════════════════════════════════════════════════════════════════════

import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
// Funciones de Firestore usadas en este archivo. Ya conocemos varias de
// archivos anteriores (addDoc, collection, doc, serverTimestamp), pero
// aquí aparecen varias NUEVAS, muy importantes:
//   - getDoc(refDeUnDocumento)  → READ: lee UN documento específico
//     (por su ID). Devuelve un "snapshot" (una foto del estado actual del
//     documento); hay que llamar .exists() para saber si existe, y
//     .data() para obtener sus campos.
//   - getDocs(query)            → READ: lee VARIOS documentos que
//     cumplan ciertas condiciones (ver `query`/`where` abajo). Devuelve
//     un "snapshot" con `.empty` (true si no hay resultados) y `.docs`
//     (la lista de documentos encontrados).
//   - query(coleccion, ...condiciones) → arma una "pregunta"/filtro sobre
//     una colección, combinando una o más condiciones `where`.
//   - where('campo', '==', valor) → una condición de filtro: "solo
//     documentos donde `campo` sea igual a `valor`" (también existen
//     variantes como 'array-contains', usada más abajo).
//   - updateDoc(refDeUnDocumento, cambios) → UPDATE: modifica SOLO los
//     campos indicados de un documento que YA EXISTE (a diferencia de
//     setDoc, que reemplazaría el documento entero).
//   - deleteDoc(refDeUnDocumento) → DELETE: borra un documento completo.
//   - increment(numero)          → un valor especial de Firestore que le
//     dice "suma (o resta, si es negativo) esta cantidad al valor actual
//     de este campo numérico", de forma ATÓMICA y segura en el servidor
//     (mejor que leer el valor, sumarlo en el celular, y volver a
//     escribirlo — eso podría perder datos si dos personas lo hacen a la
//     vez; increment() no tiene ese problema).
//   - arrayUnion(valor)          → un valor especial que le dice "agrega
//     este elemento a la lista (array) de este campo, PERO solo si
//     todavía no está" (evita duplicados automáticamente).
//   - runTransaction(db, funcion) → ejecuta una serie de lecturas y
//     escrituras como una operación ATÓMICA e indivisible ("todo o
//     nada"). Se explica a fondo más abajo, en la sección 7.

import { db } from '../config/firebaseConfig';
// La conexión a la base de datos.

import type { AcuerdoData } from '../types/chat';
// Un TIPO (no una función ni un valor) que describe la forma de un
// "acuerdo" (horario, días de trabajo, fechas, pago) tal como se define
// en src/types/chat.ts. Se usa para que TypeScript valide que los
// acuerdos que maneja este archivo tienen todos los campos correctos.

import { crearNotificacionInApp, NOTIF } from './notificacionService';
import { enviarNotificacion } from './notificationService';
// Los dos sistemas de notificaciones ya vistos: NOTIF trae las plantillas
// de mensaje predefinidas, crearNotificacionInApp/enviarNotificacion
// escriben la notificación de verdad en Firestore.

import {
  alumnosRealesDeGrupo,
  buildChatId,
  grupoComprometido,
  MENSAJE_GRUPO_COMPROMETIDO,
} from './solicitudPracticaService';
// Funciones utilitarias de OTRO servicio del proyecto
// (solicitudPracticaService.ts), reutilizadas aquí:
//   - alumnosRealesDeGrupo(grupoId) → dado un grupo, devuelve la lista
//     real de sus estudiantes (con nombre e id de cada uno).
//   - buildChatId(...)              → arma un ID determinístico (siempre
//     el mismo dado los mismos participantes) para la sala de chat entre
//     una universidad y una empresa sobre un grupo específico.
//   - grupoComprometido(grupoId)    → revisa si un grupo YA tiene una
//     pasantía activa en curso (no puede comprometerse con dos a la vez).
//   - MENSAJE_GRUPO_COMPROMETIDO    → el texto de error estándar a
//     mostrar cuando un grupo ya está comprometido.

import { cuposDisponibles, hayCupos } from '../utils/cupos';
// Función utilitaria que calcula cuántos cupos LIBRES quedan en una
// vacante (comparando el total contra los ya ocupados).

import { zonaDeCarrera } from '../data/carreras';
// Función que, dado el nombre de una carrera universitaria, devuelve si
// pertenece a la "zona verde" (regulación estatal permite autoservicio)
// o "zona roja" (Salud/Educación/Derecho — requiere que sea la
// universidad quien gestione la práctica, sin excepción). Ver memoria del
// proyecto "Alcance MVP prácticas" para el contexto legal detrás de esto.

// ─────────────────────────────────────────────
// NIVEL GAMIFICADO
// ─────────────────────────────────────────────
export interface NivelEstudiante {
  // Describe el "rango" o nivel gamificado de un estudiante según su
  // progreso de horas — algo parecido a un sistema de niveles de
  // videojuego, para motivar al estudiante a avanzar.
  nivel:      string;   // identificador interno, ej. 'explorador'
  titulo:     string;   // texto mostrado al usuario, ej. 'Explorador'
  icono:      string;   // nombre del ícono a mostrar
  color:      string;   // color hexadecimal asociado a ese nivel
  porcentaje: number;   // % de avance (0 a 100)
}

export function calcularNivelEstudiante(
  horasAprobadas: number,
  horasObjetivo: number,
): NivelEstudiante {
  // Función PURA (no toca Firebase ni tiene efectos secundarios: dado el
  // mismo input, siempre da el mismo output) que calcula en qué nivel
  // está un estudiante, según cuántas horas aprobadas tiene sobre el
  // total de horas que debe cumplir.
  const pct = Math.min(100, Math.round((horasAprobadas / Math.max(horasObjetivo, 1)) * 100));
  // Calcula el porcentaje de avance:
  //   - horasAprobadas / horasObjetivo → la fracción completada (ej. 0.5).
  //   - Math.max(horasObjetivo, 1)     → evita dividir entre 0 si por
  //     algún motivo horasObjetivo fuera 0 (usaría 1 en su lugar).
  //   - * 100                          → lo convierte a porcentaje (ej. 50).
  //   - Math.round(...)                → redondea a un número entero.
  //   - Math.min(100, ...)              → nunca deja pasar de 100%, por si
  //     hubiera más horas aprobadas que el objetivo original.
  if (pct >= 100) return { nivel: 'graduado',    titulo: 'Graduado',    icono: 'trophy',    color: '#D97706', porcentaje: 100 };
  if (pct >= 76)  return { nivel: 'experto',     titulo: 'Experto',     icono: 'star',      color: '#F59E0B', porcentaje: pct };
  if (pct >= 51)  return { nivel: 'profesional', titulo: 'Profesional', icono: 'briefcase', color: '#10B981', porcentaje: pct };
  if (pct >= 26)  return { nivel: 'practicante', titulo: 'Practicante', icono: 'bag',       color: '#A78BFA', porcentaje: pct };
  return             { nivel: 'explorador',  titulo: 'Explorador',  icono: 'compass',   color: '#C4B5FD', porcentaje: pct };
  // Una serie de "if" en cascada que revisan el porcentaje de mayor a
  // menor y devuelven el nivel correspondiente al primer umbral que se
  // cumple. Si ninguno de los "if" se cumple (menos de 26%), se devuelve
  // el nivel más bajo, "Explorador", en la última línea (sin "if" porque
  // es el caso restante).
}

// ─────────────────────────────────────────────
// ELEGIBILIDAD PARA VACANTES
// Solo estudiantes que ya culminaron su práctica/pasantía (100% de horas,
// nivel "graduado") o que la universidad ya declaró `graduado` pueden ver
// y aplicar a vacantes individuales. Se usa tanto en la UI (feed) como aquí,
// al aplicar.
// ─────────────────────────────────────────────
export function estudianteHabilitadoParaVacantes(perfil: {
  graduado?: boolean;
  horas_aprobadas?: number;
  horas_objetivo?: number;
} | null | undefined): boolean {
  // Otra función pura: decide si un estudiante puede aplicar a vacantes
  // "libres" del mercado (no gestionadas por su universidad). Recibe un
  // objeto "perfil" con 3 campos OPCIONALES (todos con "?"), o incluso
  // null/undefined si el perfil no se pudo cargar.
  if (!perfil) return false;
  // Si no hay perfil en absoluto, no está habilitado.
  if (perfil.graduado === true) return true;
  // Si la universidad ya marcó explícitamente al estudiante como
  // graduado, está habilitado sin más cálculos.
  return calcularNivelEstudiante(perfil.horas_aprobadas ?? 0, perfil.horas_objetivo ?? 0).nivel === 'graduado';
  // Si no, se calcula su nivel gamificado (función de arriba) y se
  // habilita solo si ese nivel es exactamente 'graduado' (100% de horas).
  // "?? 0" usa 0 como valor por defecto si esos campos no existieran en
  // el perfil.
}

// ─────────────────────────────────────────────
// 1. ESTUDIANTE APLICA A VACANTE
// ─────────────────────────────────────────────
type PerfilParaAplicar = { nombre_completo: string; foto_url?: string; universidad_id?: string };
// Tipo pequeño con solo los datos del estudiante que hacen falta para
// registrar una aplicación (no todo su perfil completo).

/**
 * Cuerpo compartido de "crear una aplicación": hoy lo usa `aplicarAVacante`
 * (vacante individual, exige graduación) — crea el documento en `aplicaciones`
 * en estado `pendiente` e incrementa `aplicantes_count`. El autoservicio a
 * pasantías YA NO pasa por aquí: ahora inscribe al instante
 * (`inscribirseAPasantiaIndependiente`, en `asignaciones_cupo`).
 */
async function crearAplicacion(
  // Función INTERNA (no se exporta) que hace el trabajo real de CREAR una
  // aplicación en Firestore (colección `aplicaciones`). Quien la llama hace
  // su propia validación de elegibilidad ANTES de invocarla.
  estudianteId: string,
  vacanteId: string,
  empresaId: string,
  estudiantePerfil: PerfilParaAplicar,
): Promise<string> {
  // Verificar aplicación previa
  const existing = await getDocs(
    query(
      collection(db, 'aplicaciones'),
      where('estudiante_id', '==', estudianteId),
      where('vacante_id', '==', vacanteId),
    ),
  );
  // READ: busca en la colección "aplicaciones" si YA existe un documento
  // donde estudiante_id y vacante_id coincidan con los que se están
  // recibiendo ahora (dos condiciones `where` combinadas = "Y" lógico:
  // deben cumplirse AMBAS).
  if (!existing.empty) throw new Error('Ya aplicaste a esta vacante.');
  // .empty es true si la búsqueda no encontró ningún documento. Si SÍ
  // encontró algo (!existing.empty), significa que el estudiante ya
  // había aplicado antes a esta misma vacante — se lanza un error para
  // evitar aplicaciones duplicadas ("throw new Error(...)" interrumpe la
  // función inmediatamente y el error debe ser capturado por quien la
  // llamó, típicamente para mostrarlo en la pantalla).

  const appRef = await addDoc(collection(db, 'aplicaciones'), {
    // CREATE: crea el documento de la aplicación con un ID autogenerado.
    estudiante_id:     estudianteId,
    estudiante_nombre: estudiantePerfil.nombre_completo,
    // Nota de diseño: aquí se guarda una COPIA del nombre del estudiante
    // dentro del propio documento de aplicación (en vez de solo guardar
    // su ID y tener que ir a buscarlo cada vez a otra colección). A esta
    // técnica se le llama "desnormalización" — es un patrón MUY común en
    // Firestore (y en bases de datos NoSQL en general) para que mostrar
    // una lista de aplicaciones en pantalla no requiera decenas de
    // lecturas extra (una por cada estudiante). El costo es que si el
    // estudiante cambia su nombre después, esta copia queda desactualizada
    // — es un balance consciente entre velocidad de lectura y frescura.
    estudiante_foto:   estudiantePerfil.foto_url ?? '',
    vacante_id:        vacanteId,
    empresa_id:        empresaId,
    universidad_id:    estudiantePerfil.universidad_id ?? '',
    estado:            'pendiente',
    // El "estado" de una aplicación viaja por varios valores posibles a
    // lo largo de su vida: 'pendiente' → 'contratado'/'rechazado'/
    // 'entrevista' → 'finalizado_pendiente_firma' → 'finalizado'.
    fecha_aplicacion:  serverTimestamp(),
    horas_completadas: 0,
    pago_confirmado:   false,
    calificacion_empresa:            0,
    calificacion_estudiante:         0,
    calificacion_empresa_enviada:    false,
    calificacion_estudiante_enviada: false,
    notas: '',
  });

  await updateDoc(doc(db, 'vacantes', vacanteId), {
    // UPDATE: en el documento de la VACANTE (no de la aplicación),
    // incrementa en 1 el contador `aplicantes_count`.
    aplicantes_count: increment(1),
    // Se usa increment(1) en vez de "leer el valor actual, sumarle 1 y
    // volver a escribirlo" porque si dos estudiantes aplicaran en el
    // mismo instante, ese enfoque manual podría perder uno de los dos
    // incrementos (ambos leerían, por ejemplo, "5" y ambos escribirían
    // "6", en vez de terminar en "7"). increment() lo resuelve en el
    // servidor de forma segura sin ese riesgo ("condición de carrera").
  });

  // Notificar a la empresa sobre la nueva aplicación
  const n = NOTIF.nuevaAplicacion(estudiantePerfil.nombre_completo);
  await crearNotificacionInApp(empresaId, n.tipo, n.titulo, n.mensaje, '/dashboard-empresa');
  // Usa la plantilla NOTIF.nuevaAplicacion (ver notificacionService.ts)
  // para avisarle a la empresa. El último parámetro, '/dashboard-empresa',
  // es la RUTA a la que navega la app si la empresa toca esta notificación.

  // Confirmación al propio estudiante (no bloquea el flujo).
  try {
    await enviarNotificacion(
      estudianteId,
      'Postulación enviada',
      'Tu postulación fue enviada correctamente. Te avisaremos cuando la empresa responda.',
      'success',
      appRef.id,
      // Se pasa el ID de la aplicación recién creada como referencia
      // (aunque en este caso puntual no se usa como deep link
      // estructurado "tipo:id" — queda como un id suelto).
    );
  } catch {
    /* la notificación no debe afectar el flujo principal */
    // Igual que en otros archivos: si notificar al estudiante falla, NO
    // se debe deshacer ni fallar la aplicación que ya se guardó con
    // éxito — es más importante que la aplicación quede registrada que
    // que la notificación de confirmación llegue.
  }

  return appRef.id;
  // Devuelve el ID de la aplicación recién creada, por si quien llamó a
  // esta función necesita usarlo (por ejemplo, para navegar directo a
  // su detalle).
}

export async function aplicarAVacante(
  estudianteId: string,
  vacanteId: string,
  empresaId: string,
  estudiantePerfil: PerfilParaAplicar,
): Promise<string> {
  // Camino PRINCIPAL para aplicar a una vacante del "mercado libre" (no
  // gestionada por la universidad). Exige que el estudiante ya haya
  // culminado su práctica/pasantía obligatoria.
  // Solo estudiantes que ya culminaron su práctica/pasantía o están
  // graduados pueden aplicar (ver `estudianteHabilitadoParaVacantes`).
  const perfilSnap = await getDoc(doc(db, 'perfiles_estudiantes', estudianteId));
  // READ: lee el perfil COMPLETO del estudiante desde Firestore (no confía
  // en datos que la pantalla ya tuviera en memoria — siempre revalida
  // contra el servidor antes de dejarlo aplicar, para que nadie pueda
  // "saltarse" la regla manipulando la app).
  if (!estudianteHabilitadoParaVacantes(perfilSnap.exists() ? (perfilSnap.data() as any) : null)) {
    // perfilSnap.exists() → true si el documento realmente existe en la
    // base de datos. Si existe, se lee su contenido con .data(); si no,
    // se pasa `null` a la función de elegibilidad (que ya sabe manejar
    // ese caso devolviendo false).
    throw new Error('Las vacantes están disponibles solo para estudiantes que ya culminaron su práctica o pasantía, o que ya están graduados.');
  }

  return crearAplicacion(estudianteId, vacanteId, empresaId, estudiantePerfil);
  // Si pasó la validación, delega el trabajo real a la función interna
  // de arriba.
}

// ─────────────────────────────────────────────
// 1b. ESTUDIANTE SE INSCRIBE A UNA PASANTÍA POR SU CUENTA (autoservicio)
// ─────────────────────────────────────────────
/**
 * Camino alterno al reparto de cupos de la universidad: para estudiantes que
 * TODAVÍA no culminan su práctica y no tienen ninguna pasantía activa. Antes,
 * la única vía era que la universidad reservara cupos por lote; esto abre el
 * autoservicio (p. ej. si al estudiante se le venció el plazo de 48 h para
 * tomar un cupo asegurado, o su universidad no reservó nada afín a su carrera).
 *
 * **La inscripción es INMEDIATA** (decisión de producto: "todo por cupo
 * individual"): en vez de crear una `aplicaciones` en estado `pendiente` que la
 * empresa debe aceptar, se crea directamente un documento en `asignaciones_cupo`
 * (`estado: 'tomado'`, `origen: 'autoservicio'`, `reclamoId: null`) — el mismo
 * modelo que `tomarCupo`, para que todo lo que ya lee `asignaciones_cupo`
 * (progreso, candidatos, feedback, "pasantía activa", avisos al iniciar sesión)
 * funcione sin cambios. NO hay reclamo intermedio: el cupo se aparta directo en
 * la vacante (`cupos_reclamados`), y `cancelarCupo` lo devuelve ahí.
 *
 * Zona Roja (Salud/Educación/Derecho) queda excluida por completo: esos
 * estudiantes siguen dependiendo 100% de su universidad, sin excepción.
 *
 * Re-verifica TODO del lado del cliente (no hay Cloud Function detrás): no
 * confía en lo que calculó la pantalla, vuelve a leer.
 */
export async function inscribirseAPasantiaIndependiente(
  estudianteId: string,
  vacanteId: string,
  empresaId: string,
  estudiantePerfil: PerfilParaAplicar & { carrera?: string; grupo_id?: string | null },
): Promise<string> {
  const vacSnap = await getDoc(doc(db, 'vacantes', vacanteId));
  if (!vacSnap.exists()) throw new Error('Esta pasantía ya no está disponible.');
  const vacData: any = vacSnap.data();
  const esPasantia = vacData.categoria === 'pasantia' || (!vacData.categoria && vacData.tipo === 'Pasantía');
  if (!esPasantia) throw new Error('Esta publicación no es una pasantía.');
  if (vacData.activa === false) throw new Error('Esta pasantía ya no está activa.');

  if (estudiantePerfil.carrera && zonaDeCarrera(estudiantePerfil.carrera) === 'roja') {
    throw new Error('Tu carrera requiere que la práctica la gestione tu universidad.');
  }

  // No debe tener ya una pasantía activa por ninguna de las 3 vías posibles.
  const [contratadoSnap, acuerdoSnap, cupoSnap] = await Promise.all([
    getDocs(query(
      collection(db, 'aplicaciones'),
      where('estudiante_id', '==', estudianteId),
      where('estado', '==', 'contratado'),
    )),
    getDocs(query(
      collection(db, 'solicitudes_practicas'),
      where('estudianteIds', 'array-contains', estudianteId),
      where('estado', '==', 'aprobado'),
    )),
    getDocs(query(
      collection(db, 'asignaciones_cupo'),
      where('estudianteId', '==', estudianteId),
      where('estado', '==', 'tomado'),
    )),
  ]);
  if (!contratadoSnap.empty || !acuerdoSnap.empty || !cupoSnap.empty) {
    throw new Error('Ya tienes una pasantía activa.');
  }

  // Aparta 1 cupo en la vacante, de forma atómica (releer dentro de la
  // transacción evita que dos inscripciones simultáneas sobrevendan la plaza).
  await runTransaction(db, async tx => {
    const vRef = doc(db, 'vacantes', vacanteId);
    const vSnap = await tx.get(vRef);
    if (!vSnap.exists()) throw new Error('Esta pasantía ya no está disponible.');
    const v = vSnap.data() as any;
    if (v.activa === false) throw new Error('Esta pasantía ya no está activa.');
    if (!hayCupos(v)) throw new Error('Esta pasantía ya no tiene cupos disponibles.');
    tx.update(vRef, { cupos_reclamados: increment(1) });
    // El estudiante puede tocar `cupos_reclamados` (regla `vacantes.update`
    // con hasOnly(['cupos_reclamados','aplicantes_count'])).
  });

  // El documento de la asignación se crea FUERA de la transacción, igual que en
  // `tomarCupo`: la reserva del cupo ya es definitiva y esta escritura, si
  // fallara, sería recuperable a mano.
  const ref = await addDoc(collection(db, 'asignaciones_cupo'), {
    reclamoId: null,
    origen: 'autoservicio',
    estudianteId,
    estudianteNombre: estudiantePerfil.nombre_completo ?? '',
    universidadId: estudiantePerfil.universidad_id ?? '',
    empresaId,
    vacanteId,
    grupoId: estudiantePerfil.grupo_id ?? null,
    vacanteTitulo: vacData.titulo ?? '',
    empresaNombre: vacData.nombre_empresa ?? '',
    horario: vacData.horario ?? null,
    carrera: estudiantePerfil.carrera ?? '',
    estado: 'tomado' as const,
    fechaTomado: serverTimestamp(),
  });

  // Estado de pasantía autoreportado (perfil público) — el estudiante escribe
  // su propio perfil, siempre permitido.
  try {
    await updateDoc(doc(db, 'perfiles_estudiantes', estudianteId), { estado_pasantia: 'en_proceso' });
  } catch {
    /* no crítico */
  }

  // Marca durable de la alianza empresa ↔ universidad (arrayUnion, dedupe, solo
  // agrega). El autoservicio no pasa por `reclamarCupos`, así que esta marca —
  // que alimenta "Universidades aliadas" y "Top Empresas" — hay que ponerla
  // aquí. Best-effort: un fallo no debe deshacer la inscripción ya creada.
  const uniAliada = estudiantePerfil.universidad_id;
  if (uniAliada && empresaId) {
    try {
      await Promise.all([
        updateDoc(doc(db, 'perfiles_empresas', empresaId), {
          aliados_universidades_ids: arrayUnion(uniAliada),
        }),
        updateDoc(doc(db, 'perfiles_universidades', uniAliada), {
          aliados_empresas_ids: arrayUnion(empresaId),
        }),
      ]);
    } catch (e) {
      console.warn('No se pudo registrar la alianza de la inscripción:', e);
    }
  }

  // Avisos a universidad y empresa — alimentan la campana y los modales de
  // "se inscribió el estudiante X" al iniciar sesión (AvisosGate).
  const quien = estudiantePerfil.nombre_completo || 'Un estudiante';
  if (estudiantePerfil.universidad_id) {
    await enviarNotificacion(
      estudiantePerfil.universidad_id,
      'Estudiante inscrito',
      `${quien} se inscribió en "${vacData.titulo}" (${vacData.nombre_empresa}).`,
      'success',
      '/dashboard-universidad',
    );
  }
  await enviarNotificacion(
    empresaId,
    'Estudiante inscrito',
    `${quien} se inscribió en "${vacData.titulo}".`,
    'info',
    '/dashboard-empresa',
  );

  return ref.id;
}

// ─────────────────────────────────────────────
// 2. EMPRESA CAMBIA ESTADO DE APLICACIÓN
// ─────────────────────────────────────────────
export async function cambiarEstadoAplicacion(
  aplicacionId: string,
  nuevoEstado: string,
  vacanteId?: string,
  estudianteId?: string,
  vacanteNombre?: string,
  /** Horario acordado al contratar (ver ProponerHorarioModal, sin sección de pago). */
  acuerdo?: AcuerdoData,
): Promise<void> {
  // Esta función la usa la empresa para mover una aplicación individual
  // entre estados: aceptar, rechazar, llamar a entrevista, contratar.
  const updates: Record<string, any> = { estado: nuevoEstado };
  // Arma un objeto de cambios que empieza solo con el nuevo estado, y se
  // le van agregando más campos condicionalmente más abajo. "Record<string,
  // any>" es un tipo flexible: "un objeto con claves de texto y valores
  // de cualquier tipo" — se usa aquí porque los campos a actualizar
  // varían según el caso.

  if (nuevoEstado === 'contratado') {
    updates.fecha_inicio = serverTimestamp();
    if (acuerdo) {
      updates.acuerdo = acuerdo;
      updates.horarioPropuesto = `${acuerdo.horaInicio} - ${acuerdo.horaFin}`;
      updates.diasTrabajo = acuerdo.dias;
      updates.fechaInicioPasantia = acuerdo.fechaInicio;
      updates.fechaFinPasantia = acuerdo.fechaFin;
    }
    // Si el nuevo estado es "contratado", se agregan campos extra al
    // objeto `updates`: la fecha de inicio, y si se proporcionó un
    // acuerdo de horario, sus detalles también (guardados tanto como
    // objeto estructurado `acuerdo` como en campos de texto sueltos
    // derivados, para que las pantallas que todavía leen esos campos
    // sueltos sigan funcionando).
  }

  await updateDoc(doc(db, 'aplicaciones', aplicacionId), updates);
  // UPDATE: aplica todos los cambios juntos en un solo viaje al servidor.

  if (nuevoEstado === 'contratado' && vacanteId) {
    await updateDoc(doc(db, 'vacantes', vacanteId), {
      contratados_count: increment(1),
    });
    // UPDATE adicional: si se contrató a alguien, incrementa el contador
    // de contratados de la vacante correspondiente.
  }

  // Notificar al estudiante si tenemos su ID
  if (estudianteId) {
    const nombre = vacanteNombre ?? 'la vacante';
    let n: { tipo: string; titulo: string; mensaje: string } | null = null;
    // `n` empieza en null; se le asigna una plantilla de NOTIF solo si el
    // nuevo estado corresponde a alguno de los 3 casos que sí generan
    // notificación (los demás estados, como "pendiente", no notifican).

    if (nuevoEstado === 'contratado' || nuevoEstado === 'aceptado') {
      n = NOTIF.aplicacionAceptada(nombre);
    } else if (nuevoEstado === 'rechazado') {
      n = NOTIF.aplicacionRechazada(nombre);
    } else if (nuevoEstado === 'entrevista') {
      n = NOTIF.aplicacionEntrevista(nombre);
    }

    if (n) {
      await crearNotificacionInApp(estudianteId, n.tipo, n.titulo, n.mensaje, '/(tabs)');
    }
  }
}

// ─────────────────────────────────────────────
// 3. ESTUDIANTE MARCA FINALIZACIÓN
// ─────────────────────────────────────────────
export async function estudianteFinalizaProyecto(
  aplicacionId: string,
  estudianteId: string,
  horasCompletadas: number,
  empresaId?: string,
  estudianteNombre?: string,
): Promise<void> {
  // El estudiante avisa que ya terminó su pasantía individual. Queda en
  // un estado "pendiente de firma" hasta que la empresa lo confirme.
  await updateDoc(doc(db, 'aplicaciones', aplicacionId), {
    estado:            'finalizado_pendiente_firma',
    horas_completadas: horasCompletadas,
  });

  // Notificar a la empresa que debe firmar la constancia
  if (empresaId) {
    const n = NOTIF.estudianteFinalizó(estudianteNombre ?? 'El estudiante');
    await crearNotificacionInApp(empresaId, n.tipo, n.titulo, n.mensaje, '/dashboard-empresa');
  }
}

// ─────────────────────────────────────────────
// 4. EMPRESA FIRMA CONSTANCIA
// ─────────────────────────────────────────────
export async function empresaFirmaConstancia(
  aplicacionId: string,
  empresaId: string,
  estudianteId: string,
): Promise<string> {
  // Leer para obtener universidad_id y nombre del estudiante
  const appSnap = await getDoc(doc(db, 'aplicaciones', aplicacionId));
  const appData = appSnap.data() ?? {};
  // READ: se necesita releer la aplicación para saber a qué universidad
  // pertenece el estudiante y cómo se llama, datos que no llegaron como
  // parámetros a esta función. "?? {}" evita errores si por algún motivo
  // el documento no existiera (se seguiría con un objeto vacío).

  await updateDoc(doc(db, 'aplicaciones', aplicacionId), {
    estado:    'finalizado',
    fecha_fin: serverTimestamp(),
  });
  // UPDATE: marca la aplicación como completamente finalizada.

  const txRef = await addDoc(collection(db, 'transacciones'), {
    // CREATE: crea un registro de "transacción" (pago) en estado
    // pendiente, aunque el monto todavía sea 0 — sirve como placeholder
    // para el módulo de pagos, que después lo completará.
    empresa_id:    empresaId,
    estudiante_id: estudianteId,
    aplicacion_id: aplicacionId,
    monto:         0,
    concepto:      'Pasantía finalizada — pendiente de pago',
    estado:        'pendiente',
    fecha:         serverTimestamp(),
    metodo:        'tarjeta_simulada',
    referencia:    '',
  });

  // Notificar a la universidad que hay una pasantía pendiente de aprobación
  const universidadId = appData.universidad_id as string | undefined;
  if (universidadId) {
    const n = NOTIF.pendienteAprobacion(appData.estudiante_nombre ?? 'Un estudiante');
    await crearNotificacionInApp(universidadId, n.tipo, n.titulo, n.mensaje, '/dashboard-universidad');
  }

  return txRef.id;
}

// ─────────────────────────────────────────────
// 5. UNIVERSIDAD APRUEBA HORAS
// ─────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════
// MOTOR RELACIONAL DE PASANTÍAS (MATCHMAKING UNIVERSIDAD ↔ EMPRESA)
// ═══════════════════════════════════════════════════════════════════
//
// Flujo de estados de una postulación de grupo:
//   pendiente  → la universidad postuló un grupo, la empresa aún no responde
//   revisando  → la empresa aceptó y envió su oferta (horario/días/pago);
//                la universidad debe dar la respuesta final
//   aprobada   → la universidad aceptó definitivamente la oferta
//   rechazada  → rechazada por la empresa o por la universidad (con justificación)
//
// Las postulaciones de grupo viven en su propia colección 'aplicaciones_grupos'
// para no mezclarse con las aplicaciones individuales de estudiantes.
// ───────────────────────────────────────────────────────────────────
//
// A partir de aquí empieza el sistema de "grupos" (una universidad
// postula MUCHOS estudiantes de una vez a una vacante, en vez de que cada
// uno aplique individualmente).

export const COLECCION_APLICACIONES_GRUPOS = 'aplicaciones_grupos';
// Guardar el nombre de la colección en una constante (en vez de escribir
// el texto 'aplicaciones_grupos' repetido muchas veces en el archivo)
// evita errores de tipeo y facilita cambiarlo en un solo lugar si algún
// día hiciera falta.
export const MAX_GRUPOS_POR_VACANTE = 2;
// Regla de negocio: una universidad puede postular como máximo 2 grupos
// distintos a la misma vacante.

/** Días de la semana — útil para los selectores multiselect de la UI */
export const DIAS_SEMANA = [
  'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo',
] as const;
// Lista fija reutilizada por componentes de UI que necesitan mostrar un
// selector de días de la semana (por ejemplo, al definir un horario).

export type EstadoAplicacionGrupo = 'pendiente' | 'revisando' | 'aprobada' | 'rechazada';
export type DecisionEmpresa = 'aceptar' | 'rechazar';
export type DecisionUniversidad = 'aceptar' | 'rechazar';
// Tipos que restringen estos valores a exactamente las opciones válidas,
// evitando errores de tipeo (como escribir 'aprobado' en vez de
// 'aprobada') en cualquier parte del proyecto que los use.

/**
 * Detalles que la empresa envía al aceptar un grupo. El horario/fechas/pago
 * viajan como un `AcuerdoData` estructurado (el mismo formato que usa el
 * handshake del chat vía `ProponerHorarioModal`) — así `calcularHorasAcuerdo`
 * puede calcular horas/progreso para pasantías confirmadas por Matchmaking
 * igual que para las confirmadas por chat. Antes este campo era texto libre
 * ("7:00 a 17:00"), imposible de calcular de forma confiable.
 */
export interface OfertaEmpresa {
  /** Requerido si `decision === 'aceptar'`. */
  acuerdo?: AcuerdoData;
  /** Requerido si `decision === 'rechazar'`. */
  justificacionRechazo?: string;
}

export interface AplicacionGrupo {
  // La FORMA completa de un documento de la colección
  // "aplicaciones_grupos" — útil para saber, de un vistazo, TODOS los
  // campos que puede tener sin tener que ir a mirar Firestore
  // directamente.
  id: string;
  universidadId: string;
  vacanteId: string;
  empresaId: string;
  grupoId: string;

  // Datos desnormalizados para mostrar en la UI sin lecturas extra
  grupoNombre?: string;
  carrera?: string;
  horasRequeridas?: number;
  estudiantesCount?: number;
  vacanteTitulo?: string;
  empresaNombre?: string;
  universidadNombre?: string;

  // Flujo relacional
  estado: EstadoAplicacionGrupo;
  /** Acuerdo estructurado (horario + fechas + pago) — fuente de verdad para el cálculo de horas. */
  acuerdo?: AcuerdoData;
  // Campos de solo-lectura DERIVADOS de `acuerdo` (se siguen escribiendo para
  // no romper las tarjetas existentes que ya los muestran como texto).
  horarioPropuesto?: string;
  diasTrabajo?: string[];
  pagoTotal?: number | null;
  fechaInicio?: string;
  fechaFin?: string;
  justificacionRechazo?: string;

  // Marcas de tiempo
  fechaPostulacion?: any;
  fechaRespuestaEmpresa?: any;
  fechaRespuestaUniversidad?: any;
}

// ─────────────────────────────────────────────
// 6. UNIVERSIDAD POSTULA UN GRUPO A UNA VACANTE
// ─────────────────────────────────────────────
/**
 * Postula un grupo de la universidad a una vacante.
 * Reglas:
 *  - Máximo {@link MAX_GRUPOS_POR_VACANTE} grupos por universidad por vacante.
 *  - Un mismo grupo no puede postularse dos veces a la misma vacante.
 * @returns el id de la nueva postulación.
 */
export async function postularGrupoAVacante(
  universidadId: string,
  vacanteId: string,
  grupoId: string,
): Promise<string> {
  if (!universidadId || !vacanteId || !grupoId) {
    throw new Error('Datos incompletos para postular el grupo.');
  }
  // Validación básica: los 3 identificadores son obligatorios.

  // 1) Verificar el límite de grupos por universidad en esta vacante
  const previas = await getDocs(
    query(
      collection(db, COLECCION_APLICACIONES_GRUPOS),
      where('universidadId', '==', universidadId),
      where('vacanteId', '==', vacanteId),
    ),
  );
  // READ: trae TODAS las postulaciones anteriores de esta universidad a
  // esta misma vacante (sin importar su estado).

  // No contamos las rechazadas para permitir reintentar con otro grupo
  const activas = previas.docs.filter(d => (d.data() as any).estado !== 'rechazada');
  // .filter() se queda solo con los documentos cuyo estado NO sea
  // 'rechazada' — una postulación rechazada no debe seguir "ocupando
  // cupo" en el límite de 2 grupos.
  if (activas.length >= MAX_GRUPOS_POR_VACANTE) {
    throw new Error(
      `Solo puedes postular ${MAX_GRUPOS_POR_VACANTE} grupos por vacante. Ya alcanzaste el límite.`,
    );
  }
  if (activas.some(d => (d.data() as any).grupoId === grupoId)) {
    // .some() revisa si AL MENOS UNO de los documentos cumple la
    // condición (aquí: que sea justo el mismo grupoId que se quiere
    // postular ahora).
    throw new Error('Este grupo ya fue postulado a esta vacante.');
  }

  // 1.5) Un grupo con una pasantía ya aprobada (activa, sin finalizar) no
  // puede postularse a otra vacante en paralelo. Repite en el servidor la
  // validación de la UI (Matchmaking.tsx) para que no se pueda saltar por una
  // condición de carrera o llamando este servicio directamente. Lee el flag
  // denormalizado en `grupos` (ver `grupoComprometido`) en vez de consultar
  // `solicitudes_practicas`: así el mismo chequeo cubre al grupo sin importar
  // cuál de los 3 flujos (Matchmaking/Ofrecer a Empresa/Chat) lo comprometió.
  const { comprometido } = await grupoComprometido(grupoId);
  if (comprometido) {
    throw new Error(MENSAJE_GRUPO_COMPROMETIDO);
  }

  // 2) Leer el grupo, la vacante y la universidad para desnormalizar datos en
  // la postulación (el nombre de la universidad debe verse SIEMPRE en la
  // bandeja de la empresa, sin lecturas extra).
  const [grupoSnap, vacanteSnap, universidadSnap] = await Promise.all([
    getDoc(doc(db, 'grupos', grupoId)),
    getDoc(doc(db, 'vacantes', vacanteId)),
    getDoc(doc(db, 'perfiles_universidades', universidadId)),
  ]);
  // 3 lecturas en paralelo (Promise.all), igual técnica que vimos en
  // inscribirseAPasantiaIndependiente.
  if (!grupoSnap.exists())   throw new Error('El grupo seleccionado no existe.');
  if (!vacanteSnap.exists()) throw new Error('La vacante ya no está disponible.');

  const grupo   = grupoSnap.data() as any;
  const vacante = vacanteSnap.data() as any;
  const universidadNombre = universidadSnap.exists()
    ? ((universidadSnap.data() as any).nombre_universidad ?? '')
    : '';
  // Si el perfil de la universidad existe, toma su nombre; si no, usa
  // texto vacío (esta lectura, a diferencia de grupo/vacante, no es
  // obligatoria: si fallara no debería impedir postular).

  if (grupo.universidad_id && grupo.universidad_id !== universidadId) {
    throw new Error('Ese grupo no pertenece a tu universidad.');
  }
  // Verificación de seguridad: nadie puede postular un grupo que
  // pertenece a OTRA universidad, aunque conozca su ID.

  // 2.5) Cupos: la vacante debe poder recibir al grupo completo. Las vacantes
  // legadas (sin el campo `cupos`) devuelven `null` en `cuposDisponibles` y NO
  // se bloquean — mantienen el comportamiento previo. Se valida aquí y no solo
  // en la UI para que no se pueda saltar por condición de carrera.
  const libres = cuposDisponibles(vacante);
  if (libres !== null) {
    const necesarios = Number(grupo.estudiantes_count ?? 0);
    if (libres === 0) {
      throw new Error('Esta vacante ya no tiene cupos disponibles.');
    }
    if (necesarios > 0 && libres < necesarios) {
      throw new Error(
        `Esta vacante tiene ${libres} cupo(s) disponible(s) y tu grupo es de ${necesarios} estudiantes.`,
      );
    }
  }

  const empresaId = vacante.empresa_id as string;

  // 3) Crear la postulación
  const ref = await addDoc(collection(db, COLECCION_APLICACIONES_GRUPOS), {
    // CREATE: finalmente, después de todas las validaciones, se crea el
    // documento real de la postulación.
    universidadId,
    vacanteId,
    empresaId,
    grupoId,
    grupoNombre:      grupo.nombre ?? '',
    carrera:          grupo.carrera ?? '',
    horasRequeridas:  vacante.horas_requeridas ?? grupo.total_horas ?? 0,
    estudiantesCount: grupo.estudiantes_count ?? 0,
    vacanteTitulo:    vacante.titulo ?? '',
    empresaNombre:    vacante.nombre_empresa ?? '',
    universidadNombre,
    estado:           'pendiente' as EstadoAplicacionGrupo,
    horarioPropuesto: '',
    diasTrabajo:      [],
    pagoTotal:        null,
    justificacionRechazo: '',
    fechaPostulacion: serverTimestamp(),
  });

  // 4) Notificar a la empresa
  if (empresaId) {
    await crearNotificacionInApp(
      empresaId,
      'info',
      'Nueva postulación de grupo',
      `${universidadNombre || 'Una universidad'} postuló al grupo "${grupo.nombre ?? ''}" para "${vacante.titulo ?? 'tu vacante'}".`,
      `aplicacionGrupo:${ref.id}`,
      // Deep link estructurado "aplicacionGrupo:ID" — al tocar la
      // notificación, la app abrirá el modal AplicacionGrupoDetailModal
      // con este ID (ver src/utils/notifRoute.ts).
    );
  }

  return ref.id;
}

// ─────────────────────────────────────────────
// 7. EMPRESA EVALÚA AL GRUPO
// ─────────────────────────────────────────────
/**
 * La empresa acepta o rechaza un grupo postulado.
 *  - Al aceptar: debe enviar horario, días de trabajo y (opcional) pago total.
 *    La postulación pasa a 'revisando' (la universidad dará la respuesta final).
 *  - Al rechazar: debe enviar obligatoriamente una justificación. → 'rechazada'.
 */
export async function evaluarGrupoPorEmpresa(
  aplicacionId: string,
  decision: DecisionEmpresa,
  detalles: OfertaEmpresa,
): Promise<void> {
  if (!aplicacionId) throw new Error('Postulación inválida.');

  // Validación de entrada antes de la transacción
  if (decision === 'aceptar') {
    if (!detalles?.acuerdo) {
      throw new Error('Debes definir el horario, fechas y pago acordado.');
    }
  } else if (!detalles?.justificacionRechazo?.trim()) {
    throw new Error('Debes escribir una justificación para rechazar el grupo.');
  }
  // Se validan los datos de entrada ANTES de tocar la base de datos, para
  // fallar rápido y barato si falta algo, sin siquiera abrir una transacción.

  const ref = doc(db, COLECCION_APLICACIONES_GRUPOS, aplicacionId);

  // ── ¿QUÉ ES UNA TRANSACCIÓN? ──────────────────────────────────────────
  // runTransaction(db, async tx => { ... }) ejecuta un bloque de lecturas
  // y escrituras como una operación "todo o nada": o se aplican TODOS
  // los cambios juntos, o (si algo falla, o si alguien más modificó los
  // mismos documentos al mismo tiempo) NO se aplica NINGUNO, y Firestore
  // reintenta automáticamente el bloque completo desde cero. Esto evita
  // el problema de "condición de carrera": por ejemplo, que dos empresas
  // aprueben la misma postulación casi al mismo tiempo, o que se lea un
  // estado "pendiente" que en microsegundos después ya cambió por otra
  // operación en curso. Dentro del bloque, en vez de getDoc/updateDoc/
  // addDoc normales, se usa tx.get/tx.update/tx.set — son las versiones
  // "transaccionales" de esas mismas operaciones.
  const { universidadId, grupoNombre } = await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    // READ transaccional: lee el estado ACTUAL del documento, garantizado
    // fresco dentro de esta transacción.
    if (!snap.exists()) throw new Error('La postulación ya no existe.');
    const data = snap.data() as AplicacionGrupo;

    if (data.estado !== 'pendiente') {
      throw new Error('Esta postulación ya fue procesada.');
    }
    // Revalida que el estado siga siendo 'pendiente' — si otra persona ya
    // la procesó mientras tanto, se rechaza esta operación con un error
    // claro en vez de sobrescribir silenciosamente su decisión.

    if (decision === 'aceptar') {
      const acuerdo = detalles.acuerdo!;
      // El "!" al final le dice a TypeScript "confío en que este valor
      // NO es undefined aquí" (ya se validó unas líneas arriba, fuera de
      // la transacción, que existe si decision === 'aceptar').
      // Campos de texto derivados del acuerdo estructurado — solo para que
      // las tarjetas existentes (que aún leen estos campos) sigan mostrando
      // algo legible sin cambios.
      tx.update(ref, {
        // UPDATE transaccional.
        estado: 'revisando' as EstadoAplicacionGrupo,
        acuerdo,
        horarioPropuesto: `${acuerdo.horaInicio} - ${acuerdo.horaFin}`,
        diasTrabajo: acuerdo.dias,
        pagoTotal: acuerdo.pago.tipo === 'con_pago' ? Number(acuerdo.pago.monto ?? 0) : null,
        fechaInicio: acuerdo.fechaInicio,
        fechaFin: acuerdo.fechaFin,
        justificacionRechazo: '',
        fechaRespuestaEmpresa: serverTimestamp(),
      });
    } else {
      tx.update(ref, {
        estado: 'rechazada' as EstadoAplicacionGrupo,
        justificacionRechazo: detalles.justificacionRechazo!.trim(),
        fechaRespuestaEmpresa: serverTimestamp(),
      });
    }

    return { universidadId: data.universidadId, grupoNombre: data.grupoNombre ?? '' };
    // Lo que se "return" desde adentro de runTransaction es el valor que
    // recibe la variable de afuera (aquí, desestructurado directo en
    // "{ universidadId, grupoNombre }"). Se usa para saber a quién avisar
    // DESPUÉS de que la transacción se confirmó con éxito.
  });

  // Notificar a la universidad fuera de la transacción
  if (universidadId) {
    // Importante: las notificaciones se envían DESPUÉS de que
    // runTransaction ya terminó (fuera del bloque), no adentro. Las
    // transacciones deben ser rápidas y solo tocar Firestore — un envío
    // de notificación no debería formar parte de esa unidad atómica.
    const n = decision === 'aceptar'
      ? {
          tipo: 'success',
          titulo: 'La empresa aceptó tu grupo',
          mensaje: `La empresa envió una oferta para el grupo "${grupoNombre}". Revísala y da tu respuesta final.`,
        }
      : {
          tipo: 'warning',
          titulo: 'Grupo no aceptado',
          mensaje: `La empresa rechazó al grupo "${grupoNombre}". Revisa la justificación.`,
        };
    await crearNotificacionInApp(universidadId, n.tipo, n.titulo, n.mensaje, `aplicacionGrupo:${aplicacionId}`);
  }
}

// ─────────────────────────────────────────────
// 8. RESPUESTA FINAL DE LA UNIVERSIDAD
// ─────────────────────────────────────────────
/**
 * La universidad revisa la oferta de la empresa (estado 'revisando') y la
 * acepta definitivamente ('aprobada') o la rechaza ('rechazada') con
 * justificación obligatoria.
 */
export async function respuestaFinalUniversidad(
  aplicacionId: string,
  decision: DecisionUniversidad,
  justificacion?: string,
): Promise<void> {
  // Esta es la función MÁS LARGA y compleja del archivo: cuando la
  // universidad acepta definitivamente la oferta de una empresa para un
  // grupo, hay que crear/actualizar MUCHOS documentos relacionados a la
  // vez (la solicitud de práctica "oficial", el chat, notificaciones para
  // cada estudiante, posibles transacciones de pago, y bloquear al grupo
  // para que no se comprometa dos veces) — todo eso debe pasar junto, o
  // no pasar nada, de ahí que TODO viva dentro de una única transacción.
  if (!aplicacionId) throw new Error('Postulación inválida.');
  if (decision === 'rechazar' && !justificacion?.trim()) {
    throw new Error('Debes escribir una justificación para rechazar la oferta.');
  }

  const ref = doc(db, COLECCION_APLICACIONES_GRUPOS, aplicacionId);

  const { empresaId, grupoNombre, vacanteTitulo } = await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('La postulación ya no existe.');
    const data = snap.data() as AplicacionGrupo;

    if (data.estado !== 'revisando') {
      throw new Error('La empresa aún no ha enviado una oferta para responder.');
    }

    if (decision === 'aceptar') {
      if (!data.acuerdo) {
        throw new Error('Falta el horario acordado de esta oferta.');
      }
      const acuerdo = data.acuerdo;

      // El grupo no puede quedar comprometido con dos pasantías a la vez.
      // Se verifica DENTRO de la transacción (misma lectura atómica que el
      // resto de esta operación) para que dos aprobaciones simultáneas del
      // mismo grupo —por Matchmaking u otro flujo— no puedan colarse por una
      // condición de carrera. Debe ser el primer `tx.get` antes de cualquier
      // escritura (Firestore exige todas las lecturas antes que las escrituras).
      const grupoRef = doc(db, 'grupos', data.grupoId);
      const grupoSnap = await tx.get(grupoRef);
      // IMPORTANTE (regla técnica de Firestore): dentro de una
      // transacción, TODAS las lecturas (tx.get) deben hacerse ANTES que
      // cualquier escritura (tx.set/tx.update). Por eso esta segunda
      // lectura del grupo aparece aquí, antes de cualquier tx.update.
      if ((grupoSnap.data() as any)?.pasantia_activa_id) {
        throw new Error(MENSAJE_GRUPO_COMPROMETIDO);
      }
      // Si el grupo YA tiene el campo `pasantia_activa_id` con algún
      // valor, significa que ya está comprometido con otra pasantía en
      // curso — se bloquea esta aprobación.

      tx.update(ref, {
        estado: 'aprobada' as EstadoAplicacionGrupo,
        fechaRespuestaUniversidad: serverTimestamp(),
      });
      // UPDATE 1: marca la postulación como aprobada.

      // ── Puente Matchmaking → solicitudes_practicas ──────────────────────
      // Sin esto, una pasantía confirmada por este flujo queda invisible para
      // el resto del sistema (horas de "Mis Estudiantes", tarjetas de Home,
      // certificación, feedback), que solo lee `solicitudes_practicas`. Nace
      // directamente en `aprobado`: el horario ya se acordó aquí mismo, sin
      // pasar por el handshake de chat.
      const alumnos = await alumnosRealesDeGrupo(data.grupoId);
      // READ (no transaccional, pero de solo lectura de datos que no
      // necesitan ser parte de la atomicidad — es una consulta auxiliar
      // para obtener la lista de estudiantes reales del grupo).
      const solRef = doc(collection(db, 'solicitudes_practicas'));
      // doc(collection(...)) SIN pasar un ID → genera una referencia con
      // un ID NUEVO autogenerado, pero SIN escribir nada todavía (a
      // diferencia de addDoc, que lee+escribe en un solo paso; aquí hace
      // falta el ID de antemano para poder usarlo en varios lugares antes
      // de hacer el tx.set real un poco más abajo).
      tx.set(solRef, {
        // CREATE transaccional: crea el documento "oficial" de la
        // solicitud de práctica, que es la colección que TODO el resto
        // del sistema (horas, certificación, feedback) sabe leer.
        universidadId: data.universidadId,
        empresaId: data.empresaId,
        grupoId: data.grupoId,
        grupoNombre: data.grupoNombre ?? '',
        alumnos,
        estudianteIds: alumnos.map(a => a.id),
        carrera: data.carrera ?? '',
        fechaInicio: acuerdo.fechaInicio,
        fechaFin: acuerdo.fechaFin,
        acuerdo,
        pago: acuerdo.pago,
        estado: 'aprobado',
        origen: 'matchmaking',
        aplicacionGrupoId: aplicacionId,
        createdAt: serverTimestamp(),
        aprobadoAt: serverTimestamp(),
      });

      // Bloquea el grupo: no puede comprometerse con otra empresa mientras
      // esta pasantía siga aprobada (se libera en `finalizarPasantia`).
      tx.update(grupoRef, { pasantia_activa_id: solRef.id });
      // UPDATE 2: guarda en el documento del GRUPO el id de la solicitud
      // que lo tiene comprometido — este es el "candado" que
      // grupoComprometido() (usado más arriba, en postularGrupoAVacante)
      // consulta para bloquear nuevas postulaciones de este grupo.

      // Estado de pasantía autoreportado (perfil público) — arranca "en
      // proceso" para cada alumno real del grupo. Ver [[project_reparto_cupos]].
      alumnos.forEach(al => {
        tx.update(doc(db, 'perfiles_estudiantes', al.id), { estado_pasantia: 'en_proceso' });
      });
      // UPDATE 3 (uno por cada estudiante): actualiza el campo público
      // "estado_pasantia" en el perfil de CADA estudiante del grupo, para
      // que se muestre correctamente en su perfil visible por otros.

      // Registra la alianza en AMBOS perfiles (arrayUnion dedupe solo — no
      // pasa nada si ya se habían aliado antes). Alimenta "Top Empresas/
      // Universidades" sin que ese ranking necesite leer `solicitudes_practicas`.
      tx.update(doc(db, 'perfiles_universidades', data.universidadId), {
        aliados_empresas_ids: arrayUnion(data.empresaId),
      });
      tx.update(doc(db, 'perfiles_empresas', data.empresaId), {
        aliados_universidades_ids: arrayUnion(data.universidadId),
      });
      // UPDATE 4 y 5: registra en el perfil de la universidad que ahora
      // está aliada con esta empresa, y viceversa. arrayUnion() asegura
      // que si ya estaban aliadas antes, no se duplique la entrada en la
      // lista.

      // Sala de chat dedicada (mismo esquema determinístico que los otros
      // flujos) para que uni/empresa sigan coordinando sobre esta pasantía.
      const chatId = buildChatId(data.universidadId, data.empresaId, data.grupoId);
      tx.set(
        doc(db, 'chats', chatId),
        {
          users: [data.universidadId, data.empresaId],
          universidadId: data.universidadId,
          empresaId: data.empresaId,
          grupoId: data.grupoId,
          solicitudId: solRef.id,
          empresaNombre: data.empresaNombre ?? 'Empresa',
          grupoNombre: data.grupoNombre ?? '',
          lastMessage: '',
          lastSenderId: '',
          unread: { [data.universidadId]: 0, [data.empresaId]: 0 },
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true },
        // { merge: true } es una opción de tx.set (y de setDoc en
        // general): en vez de REEMPLAZAR el documento entero si ya
        // existiera algo en esa ubicación, MEZCLA los campos nuevos con
        // los que ya hubiera. Como buildChatId() siempre da el mismo ID
        // para los mismos participantes, esto evita crear un chat
        // duplicado si por algún motivo ya existía uno.
      );
      // CREATE/UPDATE 6: crea (o actualiza) el documento de la sala de
      // chat entre esta universidad y esta empresa sobre este grupo.

      // Notifica a cada estudiante real del grupo (mismo patrón que firmarAcuerdo).
      const conPago = acuerdo.pago.tipo === 'con_pago';
      const monto = conPago ? Number(acuerdo.pago.monto ?? 0) : 0;
      const horarioTexto = `${acuerdo.dias.join(', ')} · ${acuerdo.horaInicio} - ${acuerdo.horaFin}`;
      // .join(', ') convierte un array de textos (ej. ['Lunes','Martes'])
      // en un solo texto separado por comas ("Lunes, Martes").
      alumnos.forEach(al => {
        const notiRef = doc(collection(db, 'notificaciones_estudiantes'));
        tx.set(notiRef, {
          // CREATE (uno por estudiante): un tipo de notificación
          // ESPECÍFICO para estudiantes de grupo (colección separada de
          // "notificaciones_app"), con más detalle estructurado (horario,
          // pago) además del texto.
          estudianteId: al.id,
          estudianteNombre: al.nombre,
          empresaId: data.empresaId,
          empresaNombre: data.empresaNombre ?? 'la empresa',
          grupoId: data.grupoId,
          solicitudId: solRef.id,
          carrera: data.carrera ?? '',
          fechaInicio: acuerdo.fechaInicio,
          fechaFin: acuerdo.fechaFin,
          horario: { dias: acuerdo.dias, horaInicio: acuerdo.horaInicio, horaFin: acuerdo.horaFin },
          pago: acuerdo.pago,
          tipo: 'acuerdo_aprobado',
          leida: false,
          mensaje: `Tu pasantía en ${data.empresaNombre ?? 'la empresa'} fue aprobada. Del ${acuerdo.fechaInicio} al ${acuerdo.fechaFin}. Horario: ${horarioTexto}.${conPago ? ` Pago: $${monto.toFixed(2)}.` : ''}`,
          createdAt: serverTimestamp(),
        });
        if (conPago && monto > 0) {
          const txRef = doc(collection(db, 'transacciones'));
          tx.set(txRef, {
            // CREATE (solo si hay pago): crea el registro de la
            // transacción/pago pendiente para este estudiante.
            estudiante_id: al.id,
            empresa_id: data.empresaId,
            solicitud_id: solRef.id,
            concepto: `Pasantía en ${data.empresaNombre ?? 'la empresa'}`,
            monto,
            estado: 'pendiente',
            creado_por: data.universidadId,
            fecha: serverTimestamp(),
          });
        }
      });
    } else {
      // Rama de RECHAZO (mucho más simple: solo actualiza la postulación).
      tx.update(ref, {
        estado: 'rechazada' as EstadoAplicacionGrupo,
        justificacionRechazo: justificacion!.trim(),
        fechaRespuestaUniversidad: serverTimestamp(),
      });
    }

    return {
      empresaId: data.empresaId,
      grupoNombre: data.grupoNombre ?? '',
      vacanteTitulo: data.vacanteTitulo ?? '',
    };
  });
  // Fin de la transacción: si TODO lo de arriba se ejecutó sin lanzar
  // ningún error, Firestore confirma TODOS esos cambios juntos de forma
  // atómica. Si algo hubiera fallado a mitad de camino, NINGUNO de esos
  // cambios se aplicaría (ni la solicitud, ni el candado del grupo, ni el
  // chat, ni las notificaciones) — se reintentaría o se propagaría el
  // error hacia quien llamó a esta función.

  // Notificar a la empresa
  if (empresaId) {
    const n = decision === 'aceptar'
      ? {
          tipo: 'success',
          titulo: '¡Pasantía confirmada!',
          mensaje: `La universidad aceptó tu oferta para el grupo "${grupoNombre}" en "${vacanteTitulo}".`,
        }
      : {
          tipo: 'warning',
          titulo: 'Oferta rechazada',
          mensaje: `La universidad rechazó tu oferta para el grupo "${grupoNombre}". Revisa la justificación.`,
        };
    await crearNotificacionInApp(empresaId, n.tipo, n.titulo, n.mensaje, `aplicacionGrupo:${aplicacionId}`);
  }
}

// ─────────────────────────────────────────────
// 9. EMPRESA ELIMINA VACANTE
// Solo mientras nadie la haya tocado todavía: ni un estudiante aplicó
// individualmente, ni una universidad la postuló por grupo (matchmaking),
// ni reclamó cupos. Borrar después de eso dejaría esos documentos
// referenciando una vacante inexistente.
// ─────────────────────────────────────────────
export async function vacanteTieneSolicitudes(vacanteId: string): Promise<boolean> {
  // Función de apoyo: revisa en las 3 colecciones que podrían referenciar
  // una vacante, si HAY algo relacionado con ella.
  const [aplicaciones, aplicacionesGrupos, reclamos] = await Promise.all([
    getDocs(query(collection(db, 'aplicaciones'), where('vacante_id', '==', vacanteId))),
    getDocs(query(collection(db, 'aplicaciones_grupos'), where('vacanteId', '==', vacanteId))),
    getDocs(query(collection(db, 'reclamos_cupos'), where('vacanteId', '==', vacanteId))),
  ]);
  return !aplicaciones.empty || !aplicacionesGrupos.empty || !reclamos.empty;
  // Devuelve true si CUALQUIERA de las 3 colecciones tiene al menos un
  // documento relacionado con esta vacante.
}

export async function eliminarVacante(vacanteId: string, empresaId: string): Promise<void> {
  const vacSnap = await getDoc(doc(db, 'vacantes', vacanteId));
  if (!vacSnap.exists()) return;
  // Si la vacante ya no existe (por ejemplo, se borró en otro momento),
  // no hay nada que hacer: se sale de la función sin error (borrar algo
  // que ya no existe se considera "éxito trivial", no un fallo).
  if ((vacSnap.data() as any)?.empresa_id !== empresaId) {
    throw new Error('Esta vacante no te pertenece.');
  }
  // Verificación de seguridad: una empresa solo puede borrar SUS PROPIAS
  // vacantes, comparando el `empresa_id` guardado en el documento contra
  // quien está pidiendo borrarla.
  if (await vacanteTieneSolicitudes(vacanteId)) {
    throw new Error('No se puede eliminar: ya hay solicitudes o postulaciones para esta vacante.');
  }
  await deleteDoc(doc(db, 'vacantes', vacanteId));
  // DELETE: recién aquí, después de pasar TODAS las validaciones, se
  // borra el documento de verdad.
}
