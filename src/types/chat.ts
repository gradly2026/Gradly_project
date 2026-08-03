import type { IMessage } from "react-native-gifted-chat";

/** Días laborables seleccionables en una propuesta de horario. */
export type DiaLaboral =
  | "Lunes"
  | "Martes"
  | "Miércoles"
  | "Jueves"
  | "Viernes";

export const DIAS_LABORALES: DiaLaboral[] = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
];

/** Datos estructurados de un horario propuesto/acordado. */
export interface ScheduleData {
  dias: DiaLaboral[];
  horaInicio: string; // p.ej. "08:00 AM"
  horaFin: string; // p.ej. "12:00 PM"
}

/** Condición de pago de la pasantía dentro de un acuerdo. */
export interface PagoAcuerdo {
  /** `con_pago` lleva `monto` por estudiante; `sin_pago` es ad honorem. */
  tipo: "con_pago" | "sin_pago";
  /** Monto por estudiante (sólo si `tipo === 'con_pago'`). */
  monto?: number;
  /** Moneda del monto (sólo USD por ahora). */
  moneda?: "USD";
}

/**
 * Propuesta/acuerdo completo que viaja en un mensaje `type: 'proposal'`.
 * Engloba el horario (días + horas), el rango de fechas de la pasantía y la
 * condición de pago. Lo puede enviar la Universidad o la Empresa; la contraparte
 * lo acepta y se "firma".
 */
export interface AcuerdoData {
  dias: DiaLaboral[];
  horaInicio: string; // p.ej. "08:00 AM"
  horaFin: string; // p.ej. "12:00 PM"
  /** Fecha de inicio de la pasantía (ISO `yyyy-mm-dd`). */
  fechaInicio: string;
  /** Fecha de fin de la pasantía (ISO `yyyy-mm-dd`). */
  fechaFin: string;
  /** Condición de pago acordada. */
  pago: PagoAcuerdo;
}

/** Sub-horario `ScheduleData` derivado de un `AcuerdoData`. */
export const acuerdoToSchedule = (a: AcuerdoData): ScheduleData => ({
  dias: a.dias,
  horaInicio: a.horaInicio,
  horaFin: a.horaFin,
});

/** Tipos de mensaje que viajan por el chat. */
export type ChatMessageType = "text" | "proposal" | "system" | "group_offer";

/**
 * Tarjeta interactiva con la que la Universidad comparte un grupo de
 * estudiantes dentro del chat con la Empresa (`type: 'group_offer'`).
 */
export interface GroupOfferData {
  grupoId: string;
  grupoNombre: string;
  carrera: string;
  /** Cantidad de estudiantes en el grupo (denormalizada para la tarjeta). */
  totalEstudiantes: number;
  universidadId: string;
  universidadNombre: string;
}

/**
 * Mensaje de Gifted Chat extendido con los campos del "handshake".
 * `type: 'proposal'` lleva `scheduleData`; `approved` marca el acuerdo cerrado.
 *
 * `isDeleted`/`isEdited` modelan el borrado lógico y la edición; `replyMessage`
 * (heredado de `IMessage`) cita el mensaje original al responder.
 */
export interface ChatMessage extends IMessage {
  type?: ChatMessageType;
  scheduleData?: ScheduleData;
  /**
   * Acuerdo completo (horario + fechas + pago) de una propuesta nueva.
   * Los mensajes antiguos sólo tienen `scheduleData`; el render hace fallback.
   */
  acuerdo?: AcuerdoData;
  /** Payload de la tarjeta de grupo compartido (`type: 'group_offer'`). */
  groupOffer?: GroupOfferData;
  approved?: boolean;
  /**
   * `true` cuando la propuesta NO abre la pasantía sino que renegocia el
   * horario de una ya aprobada. Cambia el texto de la tarjeta y hace que al
   * aceptarla se llame `modificarAcuerdo` en vez de `firmarAcuerdo`.
   */
  cambioHorario?: boolean;
  /** Borrado lógico: el texto se sustituye por "Mensaje eliminado". */
  isDeleted?: boolean;
  /** Marca de edición (muestra "Editado" bajo la burbuja). */
  isEdited?: boolean;
  /** Mensaje reenviado desde otro chat (muestra la etiqueta "Reenviado"). */
  forwarded?: boolean;
  /** Cita del mensaje al que se responde (se dibuja dentro de la burbuja). */
  replyMessage?: {
    _id: string | number;
    text: string;
    user?: { _id?: string | number; name?: string; avatar?: string };
  };
}
