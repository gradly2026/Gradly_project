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
  /** Payload de la tarjeta de grupo compartido (`type: 'group_offer'`). */
  groupOffer?: GroupOfferData;
  approved?: boolean;
  /** Borrado lógico: el texto se sustituye por "Mensaje eliminado". */
  isDeleted?: boolean;
  /** Marca de edición (muestra "Editado" bajo la burbuja). */
  isEdited?: boolean;
}
