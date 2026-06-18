import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../config/firebaseConfig";
import { enviarNotificacion } from "./notificationService";

/** ID determinístico de la sala de chat: uniId_empresaId_grupoId. */
export const buildChatId = (
  universidadId: string,
  empresaId: string,
  grupoId: string,
) => `${universidadId}_${empresaId}_${grupoId}`;

/** Empresa mostrada en el buscador "Ofrecer a Empresa". */
export interface EmpresaResult {
  id: string;
  nombre: string;
  industria: string;
  logoUrl?: string | null;
  verificado: boolean;
}

/** Alumno referenciado dentro de la solicitud. */
export interface AlumnoRef {
  id: string;
  nombre: string;
}

export interface CrearSolicitudParams {
  universidadId: string;
  empresaId: string;
  grupoId: string;
  grupoNombre: string;
  alumnos: AlumnoRef[];
  carrera: string;
  fechaInicio: string;
  fechaFin: string;
}

/**
 * Busca empresas en `perfiles_empresas` por nombre o rubro (industria).
 *
 * Firestore no soporta búsqueda por substring, así que traemos un lote acotado
 * y filtramos en cliente (mismo patrón que el buscador global del proyecto).
 */
export async function buscarEmpresas(termino: string): Promise<EmpresaResult[]> {
  const snap = await getDocs(
    query(collection(db, "perfiles_empresas"), limit(80)),
  );

  const empresas: EmpresaResult[] = snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      id: d.id,
      nombre: String(data.nombre_empresa ?? "Empresa sin nombre"),
      industria: String(data.industria ?? ""),
      logoUrl: data.logo_url ?? null,
      verificado: Boolean(data.verificado ?? false),
    };
  });

  const q = termino.trim().toLowerCase();
  const filtradas = q
    ? empresas.filter(
        (e) =>
          e.nombre.toLowerCase().includes(q) ||
          e.industria.toLowerCase().includes(q),
      )
    : empresas;

  return filtradas.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/**
 * Crea la solicitud de prácticas (oferta de la universidad a una empresa).
 * El documento arranca en estado `pendiente`.
 */
export async function crearSolicitudPractica(
  params: CrearSolicitudParams,
): Promise<string> {
  const {
    universidadId,
    empresaId,
    grupoId,
    grupoNombre,
    alumnos,
    carrera,
    fechaInicio,
    fechaFin,
  } = params;

  const ref = await addDoc(collection(db, "solicitudes_practicas"), {
    universidadId,
    empresaId,
    // grupoId con la lista de alumnos referenciada.
    grupoId,
    grupoNombre,
    alumnos,
    carrera,
    fechaInicio,
    fechaFin,
    estado: "pendiente",
    createdAt: serverTimestamp(),
  });

  // Notifica a la empresa la nueva oferta (no bloquea la creación).
  try {
    await enviarNotificacion(
      empresaId,
      "Nueva oferta de pasantía",
      `Una universidad te ofreció el grupo "${grupoNombre}" para una pasantía.`,
      "info",
      ref.id,
    );
  } catch {
    /* la notificación no debe afectar el flujo principal */
  }

  return ref.id;
}

/** Resultado de aceptar un grupo compartido en el chat. */
export interface GrupoCompartidoAceptado {
  solicitudId: string;
  chatId: string;
  totalAlumnos: number;
}

/**
 * La empresa **acepta** un grupo que la universidad compartió como tarjeta
 * dentro del chat (`type: 'group_offer'`). Colapsa el flujo formal
 * `crearSolicitudPractica` + `aceptarSolicitudPractica` en un solo paso: crea la
 * `solicitud_practica` directamente en estado `aceptada` y abre (o reutiliza) la
 * sala de pasantía dedicada `chats/{uniId_empresaId_grupoId}`.
 *
 * Los alumnos se resuelven en vivo desde `perfiles_estudiantes` where
 * `grupo_id` (uids reales de Auth + nombre). Las fechas quedan vacías: se
 * negocian luego con el handshake de horario. Notifica a la universidad.
 */
export async function aceptarGrupoCompartido(params: {
  universidadId: string;
  universidadNombre: string;
  empresaId: string;
  empresaNombre: string;
  grupoId: string;
  grupoNombre: string;
  carrera: string;
}): Promise<GrupoCompartidoAceptado> {
  const {
    universidadId,
    universidadNombre,
    empresaId,
    empresaNombre,
    grupoId,
    grupoNombre,
    carrera,
  } = params;

  // Alumnos reales del grupo (uids de Auth + nombre).
  const estSnap = await getDocs(
    query(collection(db, "perfiles_estudiantes"), where("grupo_id", "==", grupoId)),
  );
  const alumnos: AlumnoRef[] = estSnap.docs.map((d) => ({
    id: d.id,
    nombre: (d.data() as any)?.nombre_completo ?? "Estudiante",
  }));

  // 1) Solicitud directamente en `aceptada` (la empresa ya aceptó en el chat).
  const solRef = await addDoc(collection(db, "solicitudes_practicas"), {
    universidadId,
    empresaId,
    grupoId,
    grupoNombre,
    alumnos,
    carrera,
    fechaInicio: "",
    fechaFin: "",
    estado: "aceptada",
    origen: "chat_group_offer",
    createdAt: serverTimestamp(),
    aceptadaAt: serverTimestamp(),
  });

  // 2) Sala de pasantía dedicada (ID determinístico → idempotente).
  const chatId = buildChatId(universidadId, empresaId, grupoId);
  await setDoc(
    doc(db, "chats", chatId),
    {
      users: [universidadId, empresaId],
      universidadId,
      empresaId,
      grupoId,
      solicitudId: solRef.id,
      empresaNombre,
      universidadNombre,
      grupoNombre,
      lastMessage: "",
      lastSenderId: "",
      unread: { [universidadId]: 0, [empresaId]: 0 },
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  // 3) Notifica a la universidad (no bloquea).
  try {
    await enviarNotificacion(
      universidadId,
      "Grupo aceptado",
      `${empresaNombre} aceptó el grupo "${grupoNombre}". Ya pueden coordinar el horario.`,
      "success",
      solRef.id,
    );
  } catch {
    /* la notificación no debe afectar el flujo principal */
  }

  return { solicitudId: solRef.id, chatId, totalAlumnos: alumnos.length };
}

/**
 * Marca una pasantía (solicitud) como **finalizada**. Lo dispara la universidad
 * o la empresa desde el chat de la pasantía. Solo tiene efecto si la solicitud
 * estaba `aprobado` (acuerdo firmado). Esto habilita el flujo de feedback.
 */
export async function finalizarPasantia(solicitudId: string): Promise<void> {
  if (!solicitudId) throw new Error("Solicitud inválida.");
  await updateDoc(doc(db, "solicitudes_practicas", solicitudId), {
    estado: "finalizado",
    finalizadaAt: serverTimestamp(),
  });
}

/** Identidad mínima de una solicitud necesaria para aceptarla. */
export interface SolicitudAceptable {
  id: string;
  universidadId: string;
  empresaId: string;
  grupoId: string;
}

/**
 * La empresa acepta la solicitud: cambia el estado a `aceptada` y crea (o
 * reutiliza) la sala de chat `chats/{uniId_empresaId_grupoId}` con el array
 * `users` de ambos participantes. Devuelve el ID del chat creado.
 */
export async function aceptarSolicitudPractica(
  solicitud: SolicitudAceptable,
): Promise<string> {
  const { id, universidadId, empresaId, grupoId } = solicitud;

  // 1) Estado de la solicitud → aceptada.
  await updateDoc(doc(db, "solicitudes_practicas", id), {
    estado: "aceptada",
    aceptadaAt: serverTimestamp(),
  });

  // 2) Nombres denormalizados para la bandeja de entrada (evita N lecturas
  //    extra al listar los chats). Se leen una sola vez al crear la sala.
  const [empSnap, uniSnap, solSnap] = await Promise.all([
    getDoc(doc(db, "perfiles_empresas", empresaId)),
    getDoc(doc(db, "perfiles_universidades", universidadId)),
    getDoc(doc(db, "solicitudes_practicas", id)),
  ]);
  const empresaNombre =
    (empSnap.data() as any)?.nombre_empresa ?? "Empresa";
  const universidadNombre =
    (uniSnap.data() as any)?.nombre_universidad ?? "Universidad";
  const grupoNombre = (solSnap.data() as any)?.grupoNombre ?? "Grupo";

  // 3) Sala de chat con ID determinístico. `merge` evita pisar una sala previa.
  const chatId = buildChatId(universidadId, empresaId, grupoId);
  await setDoc(
    doc(db, "chats", chatId),
    {
      users: [universidadId, empresaId],
      universidadId,
      empresaId,
      grupoId,
      solicitudId: id,
      empresaNombre,
      universidadNombre,
      grupoNombre,
      lastMessage: "",
      lastSenderId: "",
      // Sin contadores de no leídos al inicio.
      unread: { [universidadId]: 0, [empresaId]: 0 },
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  return chatId;
}
