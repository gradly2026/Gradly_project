/**
 * Cloud Function — Traducción "al vuelo" para contenido dinámico de la BD.
 *
 * Callable `traducirTexto({ q, target })`:
 *   - `q`: string o string[] a traducir.
 *   - `target`: idioma destino ("en" | "es").
 *   - Devuelve `{ translations: string[] }` en el mismo orden que `q`.
 *
 * Autenticación: usa la cuenta de servicio del proyecto (ADC) — NO requiere
 * API key. Solo hay que tener el plan Blaze y la Cloud Translation API activa.
 *
 * El cliente (src/services/translationService.ts) cachea los resultados, así
 * que cada texto se traduce una sola vez.
 */
import { v2 } from "@google-cloud/translate";
import { HttpsError, onCall } from "firebase-functions/v2/https";

const { Translate } = v2;
const translator = new Translate();
const REGION = "us-central1";

export const traducirTexto = onCall({ region: REGION }, async (req) => {
  // Callable abierto (también sin sesión) para que las pantallas de registro y
  // login —que son PÚBLICAS— también se traduzcan. Solo traduce texto; no
  // expone datos. Si en el futuro te preocupa la cuota, puedes limitar por
  // App Check o volver a exigir auth.

  const target = String(req.data?.target ?? "en");
  const raw = req.data?.q;
  const q: string[] = Array.isArray(raw) ? raw.map((s) => String(s ?? "")) : [String(raw ?? "")];

  // Traducimos solo los no vacíos; los vacíos se devuelven tal cual.
  const idxNoVacios: number[] = [];
  const aTraducir: string[] = [];
  q.forEach((s, i) => {
    if (s.trim().length > 0) {
      idxNoVacios.push(i);
      aTraducir.push(s);
    }
  });

  if (aTraducir.length === 0) return { translations: q };

  try {
    const [out] = await translator.translate(aTraducir, target);
    const arr = Array.isArray(out) ? out : [out];
    const translations = [...q];
    idxNoVacios.forEach((origIdx, k) => {
      translations[origIdx] = arr[k] ?? q[origIdx];
    });
    return { translations };
  } catch (e) {
    console.error("traducirTexto error", e);
    throw new HttpsError("internal", "Error de traducción");
  }
});
