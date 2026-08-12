import {
  addDoc,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { db, storage } from "../config/firebaseConfig";
import type { AcuerdoData } from "../types/chat";
import { acuerdoToSchedule } from "../types/chat";
import { calcularHorasAcuerdo } from "../utils/horasPasantia";
import { enviarNotificacion } from "./notificationService";

/**
 * Sube un PDF de constancia escaneada a Storage
 * `constancias/{solicitudId}/...` y devuelve su URL de descarga. Solo la
 * empresa parte puede escribir ahí (regla de Storage).
 */
export async function subirConstanciaPdf(
  solicitudId: string,
  fileUri: string,
): Promise<string> {
  const resp = await fetch(fileUri);
  const blob = await resp.blob();
  const r = storageRef(storage, `constancias/${solicitudId}/constancia_${Date.now()}.pdf`);
  await uploadBytes(r, blob, { contentType: "application/pdf" });
  return getDownloadURL(r);
}

/** ID determinístico de la sala de chat: uniId_empresaId_grupoId. */
export const buildChatId = (
  universidadId: string,
  empresaId: string,
  grupoId: string,
) => `${universidadId}_${empresaId}_${grupoId}`;

export const MENSAJE_GRUPO_COMPROMETIDO =
  "Este grupo ya tiene una pasantía aprobada con otra empresa y no puede comprometerse con una nueva hasta que esa termine.";

/**
 * Verifica si un grupo ya está comprometido en una pasantía activa (una
 * `solicitudes_practicas` en `estado:'aprobado'`, sin importar cuál de los 3
 * flujos — Matchmaking, Ofrecer a Empresa o Compartir en chat — la creó).
 *
 * Lee el flag denormalizado `pasantia_activa_id` en el propio documento del
 * grupo (`grupos/{grupoId}`, lectura abierta a cualquier autenticado) en vez
 * de consultar `solicitudes_practicas` directamente: esa colección exige que
 * la query incluya un `where` que calce con la regla de permisos
 * (`universidadId` o `empresaId` igual al uid del llamante) para poder
 * evaluarse en tiempo de consulta, y una empresa nunca puede probar la rama
 * de OTRA empresa — la query se rechazaría con permission-denied. El flag en
 * `grupos` lo fija `firmarAcuerdo`/`respuestaFinalUniversidad` al aprobar, y
 * lo libera `finalizarPasantia`.
 */
export async function grupoComprometido(
  grupoId: string,
): Promise<{ comprometido: boolean; solicitudId: string | null }> {
  const snap = await getDoc(doc(db, "grupos", grupoId));
  const solicitudId = (snap.data() as any)?.pasantia_activa_id ?? null;
  return { comprometido: !!solicitudId, solicitudId };
}

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
 * Alumnos reales de un grupo (uids de Auth + nombre) leídos de
 * `perfiles_estudiantes where grupo_id`. Se usa tanto para poblar la lista
 * `alumnos[]` como para denormalizar `estudianteIds` en la solicitud.
 *
 * Exportada: también la usa `pasantiaService.ts` para el puente Matchmaking →
 * `solicitudes_practicas` (ver `respuestaFinalUniversidad`).
 */
export async function alumnosRealesDeGrupo(grupoId: string): Promise<AlumnoRef[]> {
  const snap = await getDocs(
    query(collection(db, "perfiles_estudiantes"), where("grupo_id", "==", grupoId)),
  );
  return snap.docs.map((d) => ({
    id: d.id,
    nombre: (d.data() as any)?.nombre_completo ?? "Estudiante",
  }));
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

  // Aviso temprano: si el grupo ya está comprometido con otra empresa, no
  // tiene sentido abrir una negociación nueva que nunca podrá aprobarse.
  const { comprometido } = await grupoComprometido(grupoId);
  if (comprometido) throw new Error(MENSAJE_GRUPO_COMPROMETIDO);

  // uids reales de Auth del grupo → permiten al estudiante LEER su propia
  // pasantía (regla `request.auth.uid in resource.data.estudianteIds`) y ver
  // el estado en vivo. Los `alumnos[].id` del param pueden ser sintéticos.
  const estudianteIds = (await alumnosRealesDeGrupo(grupoId)).map((a) => a.id);

  const ref = await addDoc(collection(db, "solicitudes_practicas"), {
    universidadId,
    empresaId,
    // grupoId con la lista de alumnos referenciada.
    grupoId,
    grupoNombre,
    alumnos,
    estudianteIds,
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

  // Aviso temprano: evita que la empresa acepte en el chat un grupo que ya
  // no va a poder confirmarse (ahorra una negociación de horario inútil).
  const { comprometido } = await grupoComprometido(grupoId);
  if (comprometido) throw new Error(MENSAJE_GRUPO_COMPROMETIDO);

  // Alumnos reales del grupo (uids de Auth + nombre).
  const alumnos = await alumnosRealesDeGrupo(grupoId);

  // 1) Solicitud directamente en `aceptada` (la empresa ya aceptó en el chat).
  const solRef = await addDoc(collection(db, "solicitudes_practicas"), {
    universidadId,
    empresaId,
    grupoId,
    grupoNombre,
    alumnos,
    estudianteIds: alumnos.map((a) => a.id),
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

/** Texto legible de un horario para mensajes/recibos. */
const horarioToText = (a: AcuerdoData) =>
  `${a.dias.join(", ")} · ${a.horaInicio} - ${a.horaFin}`;

export interface FirmarAcuerdoParams {
  solicitudId: string;
  chatId: string;
  /** ID del mensaje-propuesta que se está aceptando (se marca `approved`). */
  messageId: string;
  universidadId: string;
  empresaId: string;
  empresaNombre: string;
  grupoId: string;
  carrera: string;
  /** uid de quien acepta (la contraparte que no envió la propuesta). */
  firmadoPor: string;
  acuerdo: AcuerdoData;
}

export interface FirmarAcuerdoResult {
  totalEstudiantes: number;
  /** Estudiantes a los que se les generó una transacción de pago pendiente. */
  totalConPago: number;
  fechaInicio: string;
  fechaFin: string;
}

/**
 * **Firma del acuerdo** de pasantía: lo dispara la Universidad o la Empresa
 * (la contraparte que no envió la propuesta) desde el chat. En una sola
 * operación atómica (`writeBatch`):
 *
 *  1. Marca la `solicitud_practica` como `aprobado` con el acuerdo completo
 *     (horario + fechas + pago).
 *  2. Crea una `notificaciones_estudiantes` por cada alumno **real** del grupo.
 *  3. Si el acuerdo es `con_pago`, crea una `transacciones` pendiente por alumno
 *     (la colección que ya consume el dashboard de progreso del estudiante).
 *  4. Marca el mensaje-propuesta como `approved` y postea un mensaje de sistema.
 *  5. Actualiza los metadatos del chat (inbox) y el contador de no leídos.
 *
 * Los alumnos se resuelven en vivo desde `perfiles_estudiantes` where `grupo_id`
 * (uids reales de Auth), porque los `alumnos[].id` de la solicitud pueden ser
 * sintéticos. Por eso la notificación/transacción siempre apunta al uid real.
 */
export async function firmarAcuerdo(
  params: FirmarAcuerdoParams,
): Promise<FirmarAcuerdoResult> {
  const {
    solicitudId,
    chatId,
    messageId,
    universidadId,
    empresaId,
    empresaNombre,
    grupoId,
    carrera,
    firmadoPor,
    acuerdo,
  } = params;

  if (!solicitudId || !chatId) throw new Error("Acuerdo inválido.");

  // Evita doble-disparo (reintento de red, doble tap) sobre una solicitud
  // que ya quedó aprobada — antes esta función no releía nada.
  const solSnapPrevio = await getDoc(doc(db, "solicitudes_practicas", solicitudId));
  if (!solSnapPrevio.exists()) throw new Error("La pasantía ya no existe.");
  if ((solSnapPrevio.data() as any)?.estado === "aprobado") {
    throw new Error("Este acuerdo ya fue firmado.");
  }

  // El grupo no puede quedar comprometido con dos empresas a la vez. Si el
  // flag ya apunta a ESTA misma solicitud (reintento) se deja pasar.
  const { comprometido, solicitudId: otraSolicitudId } = await grupoComprometido(grupoId);
  if (comprometido && otraSolicitudId !== solicitudId) {
    throw new Error(MENSAJE_GRUPO_COMPROMETIDO);
  }

  // Alumnos reales del grupo (uid de Auth + nombre).
  const alumnos = await alumnosRealesDeGrupo(grupoId);

  const horario = acuerdoToSchedule(acuerdo);
  const horarioTexto = horarioToText(acuerdo);
  const conPago = acuerdo.pago.tipo === "con_pago";
  const monto = conPago ? Number(acuerdo.pago.monto ?? 0) : 0;

  const batch = writeBatch(db);

  // 1) Solicitud principal → aprobado con el acuerdo completo.
  //    Reafirmamos `estudianteIds` (uids reales) por si la solicitud se creó
  //    antes de la denormalización: garantiza que el estudiante pueda leerla.
  batch.update(doc(db, "solicitudes_practicas", solicitudId), {
    estado: "aprobado",
    horarioAcordado: horario,
    acuerdo,
    pago: acuerdo.pago,
    estudianteIds: alumnos.map((a) => a.id),
    fechaInicio: acuerdo.fechaInicio,
    fechaFin: acuerdo.fechaFin,
    aprobadoAt: serverTimestamp(),
    aprobadoPor: firmadoPor,
  });

  // 1.5) Bloquea el grupo: no puede comprometerse con otra empresa mientras
  // esta pasantía siga aprobada (se libera en `finalizarPasantia`).
  batch.update(doc(db, "grupos", grupoId), { pasantia_activa_id: solicitudId });

  // Registra la alianza en AMBOS perfiles (arrayUnion dedupe solo). Alimenta
  // "Top Empresas/Universidades" sin que ese ranking necesite leer
  // `solicitudes_practicas` (colección restringida a cada dueño).
  batch.update(doc(db, "perfiles_universidades", universidadId), {
    aliados_empresas_ids: arrayUnion(empresaId),
  });
  batch.update(doc(db, "perfiles_empresas", empresaId), {
    aliados_universidades_ids: arrayUnion(universidadId),
  });

  // 2) y 3) Notificación + (opcional) transacción por estudiante real.
  alumnos.forEach((al) => {
    // Estado de pasantía autoreportado (perfil público) — ver [[project_reparto_cupos]].
    batch.update(doc(db, "perfiles_estudiantes", al.id), { estado_pasantia: "en_proceso" });

    const notiRef = doc(collection(db, "notificaciones_estudiantes"));
    batch.set(notiRef, {
      estudianteId: al.id,
      estudianteNombre: al.nombre,
      empresaId,
      empresaNombre,
      grupoId,
      solicitudId,
      carrera,
      fechaInicio: acuerdo.fechaInicio,
      fechaFin: acuerdo.fechaFin,
      horario,
      pago: acuerdo.pago,
      tipo: "acuerdo_aprobado",
      leida: false,
      mensaje: `Tu pasantía en ${empresaNombre} fue aprobada. Del ${acuerdo.fechaInicio} al ${acuerdo.fechaFin}. Horario: ${horarioTexto}.${conPago ? ` Pago: $${monto.toFixed(2)}.` : ""}`,
      createdAt: serverTimestamp(),
    });

    if (conPago && monto > 0) {
      const txRef = doc(collection(db, "transacciones"));
      batch.set(txRef, {
        estudiante_id: al.id,
        empresa_id: empresaId,
        solicitud_id: solicitudId,
        concepto: `Pasantía en ${empresaNombre}`,
        monto,
        estado: "pendiente",
        creado_por: firmadoPor,
        fecha: serverTimestamp(),
      });
    }
  });

  // 4) Marca la propuesta como aprobada + mensaje de sistema.
  batch.update(doc(db, "chats", chatId, "messages", messageId), {
    approved: true,
  });
  const sysRef = doc(collection(db, "chats", chatId, "messages"));
  batch.set(sysRef, {
    _id: sysRef.id,
    text: `El acuerdo fue firmado. La pasantía inicia el ${acuerdo.fechaInicio}. Se notificó a ${alumnos.length} estudiante(s).`,
    type: "system",
    system: true,
    createdAt: serverTimestamp(),
    user: { _id: "system", name: "Sistema" },
  });

  // 5) Metadatos del chat (inbox) + no leídos para la contraparte.
  const otroUid = firmadoPor === empresaId ? universidadId : empresaId;
  batch.update(doc(db, "chats", chatId), {
    lastMessage: "✅ Acuerdo firmado",
    lastSenderId: firmadoPor,
    updatedAt: serverTimestamp(),
    [`unread.${otroUid}`]: increment(1),
  });

  await batch.commit();

  return {
    totalEstudiantes: alumnos.length,
    totalConPago: conPago ? alumnos.length : 0,
    fechaInicio: acuerdo.fechaInicio,
    fechaFin: acuerdo.fechaFin,
  };
}

export interface ModificarAcuerdoParams {
  solicitudId: string;
  chatId: string;
  /** Mensaje-propuesta de CAMBIO que se está aceptando (se marca `approved`). */
  messageId: string;
  universidadId: string;
  empresaId: string;
  empresaNombre: string;
  grupoId: string;
  /** uid de quien ACEPTA el cambio (la contraparte que no lo propuso). */
  aceptadoPor: string;
  /** Nuevo horario/fechas. El PAGO no viaja aquí: se conserva el original. */
  acuerdo: AcuerdoData;
}

/**
 * **Renegociación del horario** de una pasantía YA aprobada.
 *
 * Igual que la firma inicial, exige que ambas partes estén de acuerdo: una
 * propone el cambio en el chat y la CONTRAPARTE lo acepta; solo entonces se
 * aplica. Se implementa aparte de `firmarAcuerdo` porque los efectos son
 * distintos:
 *
 *  - **NO toca el pago ni crea transacciones.** El modal de renegociación
 *    oculta la sección de pago y por tanto enviaría `sin_pago`, lo que
 *    borraría las condiciones económicas pactadas. Aquí se conserva el `pago`
 *    original leyéndolo de la solicitud. Cambiar dinero es otra conversación,
 *    y crear transacciones nuevas duplicaría cobros ya emitidos.
 *  - **NO reabre la pasantía**: exige `estado === 'aprobado'` y lo mantiene.
 *  - Guarda el acuerdo anterior en `acuerdoHistorial` para dejar rastro de qué
 *    se cambió, cuándo y quién lo aceptó.
 *
 * ⚠️ Efecto esperado: las horas cumplidas (`calcularHorasAcuerdo`) y los días
 * marcados en el calendario del estudiante se recalculan con el horario nuevo,
 * porque ambos se derivan del acuerdo vigente.
 */
export async function modificarAcuerdo(
  params: ModificarAcuerdoParams,
): Promise<{ totalEstudiantes: number; fechaInicio: string; fechaFin: string }> {
  const {
    solicitudId, chatId, messageId, universidadId,
    empresaId, empresaNombre, grupoId, aceptadoPor, acuerdo,
  } = params;

  if (!solicitudId || !chatId) throw new Error("Acuerdo inválido.");

  const solRef = doc(db, "solicitudes_practicas", solicitudId);
  const solSnap = await getDoc(solRef);
  if (!solSnap.exists()) throw new Error("La pasantía ya no existe.");
  const sol = solSnap.data() as any;

  if (sol.estado !== "aprobado") {
    throw new Error("Solo se puede cambiar el horario de una pasantía aprobada.");
  }

  // El pago pactado NO se renegocia aquí: se conserva tal cual.
  const pagoOriginal = sol.pago ?? sol.acuerdo?.pago ?? { tipo: "sin_pago" };
  const acuerdoFinal: AcuerdoData = { ...acuerdo, pago: pagoOriginal };

  const alumnos = await alumnosRealesDeGrupo(grupoId);
  const horario = acuerdoToSchedule(acuerdoFinal);
  const horarioTexto = horarioToText(acuerdoFinal);

  const batch = writeBatch(db);

  // 1) Aplica el nuevo horario, conservando estado y pago.
  batch.update(solRef, {
    horarioAcordado: horario,
    acuerdo: acuerdoFinal,
    fechaInicio: acuerdoFinal.fechaInicio,
    fechaFin: acuerdoFinal.fechaFin,
    acuerdoModificadoAt: serverTimestamp(),
    acuerdoModificadoPor: aceptadoPor,
    // Rastro de lo que había antes (auditoría de la renegociación).
    acuerdoHistorial: arrayUnion({
      acuerdo: sol.acuerdo ?? null,
      reemplazadoAt: new Date().toISOString(),
      aceptadoPor,
    }),
  });

  // 2) Avisar a cada estudiante: su horario cambió y deben enterarse.
  alumnos.forEach((al) => {
    const notiRef = doc(collection(db, "notificaciones_estudiantes"));
    batch.set(notiRef, {
      estudianteId: al.id,
      estudianteNombre: al.nombre,
      empresaId,
      empresaNombre,
      grupoId,
      solicitudId,
      fechaInicio: acuerdoFinal.fechaInicio,
      fechaFin: acuerdoFinal.fechaFin,
      horario,
      // `carrera` y `pago` se REPITEN aunque no cambien: la tarjeta "Mi
      // pasantía" del estudiante se arma con la notificación más reciente, así
      // que omitirlos haría que perdiera esos datos al aceptarse el cambio.
      carrera: sol.carrera ?? "",
      pago: pagoOriginal,
      tipo: "horario_modificado",
      leida: false,
      mensaje: `Cambió el horario de tu pasantía en ${empresaNombre}. Ahora es: ${horarioTexto}. Del ${acuerdoFinal.fechaInicio} al ${acuerdoFinal.fechaFin}.`,
      createdAt: serverTimestamp(),
    });
  });

  // 3) Marca la propuesta de cambio como aceptada + mensaje de sistema.
  batch.update(doc(db, "chats", chatId, "messages", messageId), { approved: true });
  const sysRef = doc(collection(db, "chats", chatId, "messages"));
  batch.set(sysRef, {
    _id: sysRef.id,
    text: `Se aceptó el cambio de horario: ${horarioTexto}. Del ${acuerdoFinal.fechaInicio} al ${acuerdoFinal.fechaFin}. Se notificó a ${alumnos.length} estudiante(s).`,
    type: "system",
    system: true,
    createdAt: serverTimestamp(),
    user: { _id: "system", name: "Sistema" },
  });

  // 4) Inbox de la contraparte.
  const otroUid = aceptadoPor === empresaId ? universidadId : empresaId;
  batch.update(doc(db, "chats", chatId), {
    lastMessage: "🕒 Horario actualizado",
    lastSenderId: aceptadoPor,
    updatedAt: serverTimestamp(),
    [`unread.${otroUid}`]: increment(1),
  });

  await batch.commit();

  return {
    totalEstudiantes: alumnos.length,
    fechaInicio: acuerdoFinal.fechaInicio,
    fechaFin: acuerdoFinal.fechaFin,
  };
}

/**
 * **Finaliza** una pasantía y emite la constancia. Lo dispara la empresa (o la
 * universidad) desde el chat cuando el acuerdo estaba `aprobado`. En lugar de un
 * `finalizado` sin más, pasa a **`pendiente_certificacion`** y adjunta una
 * constancia automática (registro estructurado y auditable: emisor + fecha).
 * Notifica a la universidad para que la certifique. El chat/feedback siguen
 * funcionando con este estado.
 *
 * @param emitidaPor uid de quien finaliza/emite (normalmente la empresa).
 */
export async function finalizarPasantia(
  solicitudId: string,
  emitidaPor?: string,
  constanciaUrl?: string,
): Promise<void> {
  if (!solicitudId) throw new Error("Solicitud inválida.");
  const ref = doc(db, "solicitudes_practicas", solicitudId);
  const snap = await getDoc(ref);
  const data = snap.data() as any | undefined;
  const emisor = emitidaPor ?? data?.empresaId ?? "";

  // El `estado` sigue siendo 'finalizado' (lo consumen feedback, historial y
  // las tarjetas de inicio). La certificación se modela con un campo aparte
  // `certificacion` para no romper esos consumidores.
  await updateDoc(ref, {
    estado: "finalizado",
    certificacion: "pendiente",
    finalizadaAt: serverTimestamp(),
    // serverTimestamp() no se admite anidado en un map → usamos Timestamp.now().
    // `pdf` = constancia escaneada subida; `auto` = registro generado por Gradly.
    constancia: constanciaUrl
      ? { tipo: "pdf", url: constanciaUrl, emitidaPor: emisor, fecha: Timestamp.now() }
      : { tipo: "auto", emitidaPor: emisor, fecha: Timestamp.now() },
  });

  // Estado de pasantía autoreportado (perfil público) — cada alumno real de
  // la solicitud pasa a "finalizada". `estudianteIds` ya está denormalizado
  // en la solicitud desde que se aprobó (firmarAcuerdo/respuestaFinalUniversidad).
  const estudianteIds: string[] = Array.isArray(data?.estudianteIds) ? data.estudianteIds : [];
  await Promise.all(
    estudianteIds.map((id) =>
      updateDoc(doc(db, "perfiles_estudiantes", id), { estado_pasantia: "finalizada" }).catch(
        () => {
          /* no crítico: no debe bloquear la finalización/certificación */
        },
      ),
    ),
  );

  // Libera el grupo: ya puede comprometerse con una pasantía nueva. Solo si
  // el flag sigue apuntando a ESTA solicitud (defensivo — evita pisar un
  // compromiso más nuevo en algún escenario imprevisto).
  const grupoId = data?.grupoId;
  if (grupoId) {
    try {
      const grupoSnap = await getDoc(doc(db, "grupos", grupoId));
      if ((grupoSnap.data() as any)?.pasantia_activa_id === solicitudId) {
        await updateDoc(doc(db, "grupos", grupoId), { pasantia_activa_id: deleteField() });
      }
    } catch {
      /* liberar el flag no debe bloquear la finalización de la pasantía */
    }
  }

  // Avisa a la universidad que la pasantía espera su certificación.
  const universidadId = data?.universidadId;
  if (universidadId) {
    try {
      await enviarNotificacion(
        universidadId,
        "Pasantía lista para certificar",
        `La pasantía del grupo "${data?.grupoNombre ?? "—"}" finalizó y espera tu certificación.`,
        "info",
        solicitudId,
      );
    } catch {
      /* la notificación no bloquea el flujo */
    }
  }
}

/**
 * **Certifica** una pasantía finalizada. Lo dispara la UNIVERSIDAD desde la
 * sección "Prácticas" tras revisar la constancia. En una operación atómica:
 *  1. Marca la solicitud `certificada` con las horas certificadas.
 *  2. Acredita esas horas a cada estudiante real (`horas_aprobadas += horas`).
 *  3. Notifica a cada estudiante que su pasantía fue certificada.
 *
 * Las horas se derivan del acuerdo firmado (`calcularHorasAcuerdo`).
 */
export async function certificarPasantia(
  solicitudId: string,
): Promise<{ totalEstudiantes: number; horas: number }> {
  if (!solicitudId) throw new Error("Solicitud inválida.");
  const ref = doc(db, "solicitudes_practicas", solicitudId);
  const snap = await getDoc(ref);
  const data = snap.data() as any | undefined;
  if (!data) throw new Error("Solicitud no encontrada.");

  const horas = calcularHorasAcuerdo(data.acuerdo).total || 0;
  const estudianteIds: string[] = Array.isArray(data.estudianteIds)
    ? data.estudianteIds
    : [];
  const empresaNombre = data.empresaNombre ?? "la empresa";
  const grupoNombre = data.grupoNombre ?? "tu grupo";

  const batch = writeBatch(db);
  // `estado` permanece 'finalizado'; la certificación se marca en `certificacion`.
  batch.update(ref, {
    certificacion: "certificada",
    certificadaAt: serverTimestamp(),
    horasCertificadas: horas,
  });

  estudianteIds.forEach((eid) => {
    batch.update(doc(db, "perfiles_estudiantes", eid), {
      horas_aprobadas: increment(horas),
    });
    const notiRef = doc(collection(db, "notificaciones_estudiantes"));
    batch.set(notiRef, {
      estudianteId: eid,
      tipo: "pasantia_certificada",
      solicitudId,
      grupoNombre,
      horas,
      leida: false,
      mensaje: `¡Tu pasantía en ${empresaNombre} fue certificada! Se acreditaron ${horas} horas de práctica a tu expediente.`,
      createdAt: serverTimestamp(),
    });
  });

  await batch.commit();
  return { totalEstudiantes: estudianteIds.length, horas };
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
