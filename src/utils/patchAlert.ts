/**
 * Parche global de Alert.alert para traducir al vuelo su título, mensaje y el
 * texto de los botones según el idioma activo — sin tocar los cientos de
 * llamadas `Alert.alert(...)` de la app.
 *
 * Es SÍNCRONO: usa `translateSync` (caché o original). La primera vez que
 * aparece un texto en inglés se muestra en español y se cachea para las
 * siguientes (los Alerts son repetitivos y efímeros). En español no hace nada.
 *
 * Llamar una vez al arrancar la app (app/_layout.tsx).
 */
import { Alert, type AlertButton } from "react-native";
import { translateSync } from "../services/translationService";

let parchado = false;

export function patchAlertConTraduccion() {
  if (parchado) return;
  parchado = true;

  try {
    const original = Alert.alert.bind(Alert);
    (Alert as any).alert = (
      title?: string,
      message?: string,
      buttons?: AlertButton[],
      options?: any,
    ) => {
      const btns = buttons?.map((b) =>
        b?.text ? { ...b, text: translateSync(b.text) } : b,
      );
      original(
        translateSync(title),
        message != null ? translateSync(message) : message,
        btns,
        options,
      );
    };
  } catch {
    // Si la plataforma no permite reasignar Alert.alert, los alerts quedan sin
    // traducir (sin romper nada).
  }
}
