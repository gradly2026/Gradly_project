/**
 * DescargarApk.tsx — botón "Descargar app" (con el ícono de Android) de la página de bienvenida.
 *
 * El APK se publica UNA vez como "release" del repositorio de GitHub (Releases →
 * Draft a new release → subir el archivo con el nombre EXACTO `Gradly.apk`). El
 * enlace `releases/latest/download/Gradly.apk` apunta siempre a la última versión
 * publicada, así que actualizar la app es subir un release nuevo: no hay que tocar
 * la web.
 *
 * Solo se dibuja cuando se cumplen las dos cosas:
 *   1. es la versión WEB y el navegador es de ANDROID (celular o tableta; en
 *      computadora e iPhone no se ve, ni siquiera se consulta a GitHub);
 *   2. de verdad hay un APK publicado. Al montarse consulta la API pública de GitHub
 *      (`releases/latest`, con CORS abierto):
 *        · 404, o un release sin el archivo `Gradly.apk` → no se dibuja nada (el
 *          enlace estaría roto).
 *        · release con el archivo → se dibuja.
 *        · cualquier otro fallo (sin red, límite de la API) → se dibuja igual: es
 *          mejor mostrarlo que esconderlo por un tropiezo de la consulta.
 */
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet } from 'react-native';
import { FONTS } from '../context/ThemeContext';
import { AutoText as Text } from './AutoText';

const REPO = 'gradly2026/Gradly_project';
export const NOMBRE_APK = 'Gradly.apk';
export const URL_DESCARGA_APK = `https://github.com/${REPO}/releases/latest/download/${NOMBRE_APK}`;
const URL_API_RELEASE = `https://api.github.com/repos/${REPO}/releases/latest`;

/** ¿El navegador es de Android? (celulares y tabletas lo declaran en el user agent). */
export function esNavegadorAndroid(userAgent: string | undefined | null): boolean {
  return /android/i.test(userAgent || '');
}

/** Decide si hay un APK descargable a partir de la respuesta de `releases/latest` (pura, sin red: se prueba sola). */
export function hayApkPublicado(status: number, json: any): boolean {
  if (status === 404) return false;
  if (status < 200 || status >= 300) return true;
  return Array.isArray(json?.assets) && json.assets.some((a: any) => a?.name === NOMBRE_APK);
}

export default function DescargarApk() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!esNavegadorAndroid(typeof navigator !== 'undefined' ? navigator.userAgent : '')) return;
    let cancelado = false;
    (async () => {
      try {
        const r = await fetch(URL_API_RELEASE, { headers: { Accept: 'application/vnd.github+json' } });
        const json = r.ok ? await r.json().catch(() => null) : null;
        if (!cancelado) setVisible(hayApkPublicado(r.status, json));
      } catch {
        if (!cancelado) setVisible(true);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  if (!visible) return null;

  return (
    <Pressable
      onPress={() => { void Linking.openURL(URL_DESCARGA_APK); }}
      style={({ pressed }) => [s.btn, pressed && { opacity: 0.85 }]}
      accessibilityRole="link"
      accessibilityLabel="Descargar app para Android"
    >
      <Ionicons name="logo-android" size={20} color="#fff" />
      <Text style={s.btnTxt}>Descargar app</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'center',
    paddingHorizontal: 22, paddingVertical: 13, borderRadius: 999, marginTop: 4,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(255,255,255,0.08)',
  },
  btnTxt: { color: '#fff', fontSize: 15, fontFamily: FONTS.interSemiBold },
});
