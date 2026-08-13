// ════════════════════════════════════════════════════════════════════════
// notificationService.ts
//
// QUÉ ES ESTE ARCHIVO:
// Es el archivo MÁS PEQUEÑO y a la vez el CORAZÓN de todo el sistema de
// notificaciones in-app (dentro de la app) de Gradly. Solo exporta UNA
// función: enviarNotificacion(). Toda notificación que se crea en
// CUALQUIER parte del proyecto (una empresa acepta a un estudiante, una
// universidad aprueba horas, un pago se recibió, etc.) termina llamando,
// directa o indirectamente, a esta función.
//
// Ver también:
//   - src/services/notificacionService.ts → un "envoltorio" (wrapper) de
//     compatibilidad sobre esta misma función, con mensajes predefinidos.
//   - src/components/FloatingTopBar.tsx   → la campanita 🔔 que MUESTRA
//     estas notificaciones al usuario.
//   - src/utils/notifRoute.ts             → decide a qué pantalla/modal
//     navegar cuando el usuario toca una notificación.
//   - GUIA_04_NOTIFICACIONES.md           → explicación completa del flujo.
// ════════════════════════════════════════════════════════════════════════

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
// addDoc, collection, serverTimestamp: las mismas funciones de Firestore
// que ya vimos en services/authService.ts y que se explican a fondo en
// GUIA_01_FIREBASE_Y_CRUD.md. En resumen: collection() apunta a una
// "carpeta" de documentos, addDoc() CREA un documento nuevo con ID
// autogenerado, y serverTimestamp() pide la fecha/hora del servidor.

import { db } from "../config/firebaseConfig";
// La conexión a la base de datos Firestore (ver src/config/firebaseConfig.ts).

/**
 * Servicio centralizado de notificaciones in-app.
 *
 * Escribe en la colección `notificaciones_app`. Para no fragmentar el sistema
 * existente (el lector histórico ordena por `fecha` y usa `link_accion`),
 * además de los campos canónicos (`createdAt`, `referencia_id`) se escriben los
 * campos espejo `fecha` y `link_accion`. Así cualquier lector —nuevo o viejo—
 * funciona sin migración.
 *
 * Tipos sugeridos: 'success' | 'info' | 'warning' | 'error'.
 */
export async function enviarNotificacion(
  // Esta es LA función que cualquier otro archivo del proyecto llama para
  // avisarle algo a un usuario dentro de la app (sin usar notificaciones
  // push del sistema operativo — esto es "in-app": el usuario la ve
  // dentro de la campanita 🔔 mientras usa Gradly).
  destinatario_id: string,
  // El uid del usuario que DEBE recibir esta notificación (el mismo id
  // que su cuenta de Firebase Auth y sus documentos en "usuarios").
  titulo: string,
  // Texto corto y llamativo, por ejemplo "¡Fuiste contratado!".
  mensaje: string,
  // Texto más largo con el detalle, por ejemplo "Has sido seleccionado
  // para 'Desarrollador Junior'. Revisa los detalles en tu progreso."
  tipo: string,
  // Categoría de la notificación: normalmente uno de estos 4 valores
  // (aunque el tipo TypeScript aquí es un `string` genérico, no un tipo
  // restringido, así que técnicamente se podría pasar cualquier texto):
  //   'success' → algo positivo (ej. fue aceptado, pago recibido)
  //   'info'    → informativo neutral
  //   'warning' → requiere atención (ej. hay que firmar algo)
  //   'error'   → algo salió mal
  // El componente que dibuja la notificación (FloatingTopBar.tsx) usa
  // este valor para elegir el color/ícono con el que se muestra.
  referencia_id: string | null = null,
  // Dato OPCIONAL (por defecto null) usado como "deep link": un texto con
  // forma "tipo:id" (por ejemplo "vacante:abc123" o "grupo:xyz789") que
  // le dice a la app, cuando el usuario toca la notificación, QUÉ modal
  // de detalle debe abrir y CON QUÉ documento (ver src/utils/notifRoute.ts).
): Promise<void> {
  // La función no devuelve ningún valor útil (Promise<void>): solo hay
  // que esperar (await) a que termine de intentar guardar la notificación.
  if (!destinatario_id) return;
  // Si por algún error de programación no se especificó a quién
  // notificar, la función simplemente no hace nada (evita crear
  // notificaciones "huérfanas" sin destinatario en la base de datos).
  try {
    await addDoc(collection(db, "notificaciones_app"), {
      // CREATE: agrega un documento nuevo a la colección
      // "notificaciones_app", con un ID autogenerado por Firestore.
      destinatario_id,
      titulo,
      mensaje,
      tipo,
      referencia_id,
      leido: false,
      // Todas las notificaciones nuevas empiezan como "no leídas". La
      // campanita usa este campo para mostrar el contador de pendientes
      // y para pintar la notificación distinta antes/después de abrirla.
      createdAt: serverTimestamp(),
      // Campo "canónico" (el oficial/moderno) con la fecha de creación.
      // ── Espejo para compatibilidad con el lector existente ──
      fecha: serverTimestamp(),
      // Campo DUPLICADO con el mismo valor que createdAt, pero con el
      // nombre viejo "fecha". Existe porque, en algún momento del
      // proyecto, el código que LEE las notificaciones (ordenarlas,
      // mostrarlas) fue escrito esperando un campo llamado "fecha". En
      // vez de reescribir todo ese código lector de una sola vez, se
      // decidió escribir el dato DOS VECES (bajo los dos nombres) — así
      // tanto el código nuevo como el viejo pueden seguir funcionando sin
      // tener que migrar nada de golpe. A este patrón se le llama "campo
      // espejo" o "campo de compatibilidad".
      link_accion: referencia_id ?? "",
      // Mismo concepto: el campo NUEVO se llama `referencia_id`, pero el
      // código lector viejo espera un campo llamado `link_accion` con el
      // mismo valor (o cadena vacía si no había referencia_id).
    });
  } catch (error) {
    // Las notificaciones nunca deben bloquear el flujo principal del usuario.
    console.warn("No se pudo enviar la notificación:", error);
    // Si falla el guardado (sin internet, error de Firestore, etc.), NO
    // se relanza el error hacia quien llamó a esta función — se captura
    // aquí y solo se deja un aviso en la consola de desarrollo
    // (console.warn). La idea: si por ejemplo "aceptar una aplicación de
    // trabajo" internamente dispara una notificación, un fallo AL
    // NOTIFICAR no debería hacer fallar ni deshacer la aceptación en sí,
    // que es la acción realmente importante para el usuario.
  }
}
