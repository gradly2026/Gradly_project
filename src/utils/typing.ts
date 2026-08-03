/**
 * Lógica pura del indicador "está escribiendo…".
 *
 * Vive aquí y NO en `chatService` porque ese módulo importa Firestore (y con él
 * react-native), lo que impide probar estas funciones de forma aislada. La
 * escritura en Firestore (`setTyping`) sí se queda en el servicio.
 *
 * El estado se guarda en el propio doc del chat: `typing.{uid} = {nombre, at}`.
 * Va ahí y no en una subcolección porque el chat YA se escucha con onSnapshot
 * en ChatThread y en el inbox — así el indicador no cuesta ni una suscripción
 * ni una lectura extra.
 */

/** Una marca vale mientras sea más nueva que esto (auto-expira). */
export const TYPING_VIGENCIA_MS = 6000;
/** No se escribe más de una vez por este intervalo mientras se teclea. */
export const TYPING_THROTTLE_MS = 2500;

export interface EscribiendoInfo {
  uid: string;
  nombre: string;
}

/**
 * Lee del doc del chat quién está escribiendo AHORA, excluyendo al propio
 * usuario y las marcas rancias (alguien que cerró la app sin limpiar).
 */
export function parseEscribiendo(
  data: any,
  miUid: string,
  ahora: number = Date.now(),
): EscribiendoInfo[] {
  const typing = data?.typing;
  if (!typing || typeof typing !== "object" || Array.isArray(typing)) return [];

  const out: EscribiendoInfo[] = [];
  for (const uid of Object.keys(typing)) {
    if (uid === miUid) continue;
    const entrada = typing[uid];
    if (!entrada) continue;

    // `at` puede llegar como Timestamp (vivo) o serializado ({seconds}) desde
    // caché offline; sin fecha no se puede saber si sigue vigente → se descarta.
    const at: number | null =
      typeof entrada.at?.toMillis === "function"
        ? entrada.at.toMillis()
        : typeof entrada.at?.seconds === "number"
          ? entrada.at.seconds * 1000
          : null;
    if (at === null || ahora - at > TYPING_VIGENCIA_MS) continue;

    out.push({ uid, nombre: String(entrada.nombre || "").trim() });
  }
  return out;
}

/**
 * Texto del indicador. En grupos se nombra a uno y se resume el resto, que es
 * como lo hacen las apps de mensajería (listar 5 nombres no cabe ni se lee).
 */
export function textoEscribiendo(lista: EscribiendoInfo[]): string | null {
  if (lista.length === 0) return null;
  const nombre = (i: number) => lista[i].nombre || "Alguien";
  if (lista.length === 1) return `${nombre(0)} está escribiendo…`;
  if (lista.length === 2) return `${nombre(0)} y ${nombre(1)} están escribiendo…`;
  return `${nombre(0)} y ${lista.length - 1} más están escribiendo…`;
}
