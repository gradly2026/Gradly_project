/**
 * Titular — titular de página del diseño nuevo: Sora en MAYÚSCULAS con una
 * palabra en el color de acento ("HOLA, ANA!", "MI PROGRESO").
 *
 * - Traduce igual que <AutoText> (useAutoText), así que el texto puede venir en
 *   español sin traducir. Con `noTranslate` se usa tal cual: para textos que ya
 *   pasaron por t() o que llevan un nombre propio dentro.
 * - La palabra resaltada es `acento` (búsqueda sin distinguir mayúsculas) o, si
 *   no se da, la ÚLTIMA palabra cuando el titular tiene 2 o más. Se calcula
 *   sobre el texto YA traducido, así que funciona igual en español e inglés.
 * - Un titular de una sola palabra no lleva acento (queda todo del color base).
 * - El color base y el tamaño los pone cada pantalla en `style`; el acento sale
 *   del tema (primaryLight), así que sigue el modo claro y oscuro.
 */
import { Text, type TextProps } from 'react-native';
import { useAutoText } from './AutoText';
import { useTheme } from '../context/ThemeContext';

export interface TitularProps extends Omit<TextProps, 'children'> {
  children: string;
  /** Palabra o fragmento a resaltar. Por defecto, la última palabra (si hay 2+). */
  acento?: string;
  /** No traducir (texto ya traducido por t() o con un nombre propio). */
  noTranslate?: boolean;
}

/** Parte `texto` en antes / acento / después. Sin acento: todo va en `antes`. */
function partir(texto: string, acento?: string): { antes: string; resaltado: string; despues: string } {
  const sinAcento = { antes: texto, resaltado: '', despues: '' };
  let inicio = -1;
  let largo = 0;

  if (acento !== undefined) {
    const buscado = acento.trim();
    if (!buscado) return sinAcento;
    // Desde el final: el nombre propio va al final del saludo ("Hola, Ana!") y
    // así un nombre corto no se confunde con un trozo de otra palabra ("Ho" en "Hola").
    inicio = texto.toLowerCase().lastIndexOf(buscado.toLowerCase());
    largo = buscado.length;
  } else {
    const palabras = texto.trim().split(/\s+/);
    if (palabras.length < 2) return sinAcento;
    const ultima = palabras[palabras.length - 1];
    inicio = texto.lastIndexOf(ultima);
    largo = ultima.length;
  }

  if (inicio < 0) return sinAcento;
  return {
    antes: texto.slice(0, inicio),
    resaltado: texto.slice(inicio, inicio + largo),
    despues: texto.slice(inicio + largo),
  };
}

export default function Titular({ children, acento, noTranslate, style, ...rest }: TitularProps) {
  const { colors } = useTheme();
  // El hook se llama siempre (reglas de hooks); con noTranslate se ignora su resultado.
  const traducido = useAutoText(noTranslate ? '' : children);
  const texto = noTranslate ? children : traducido;
  const { antes, resaltado, despues } = partir(texto, acento);

  return (
    <Text {...rest} style={[{ textTransform: 'uppercase', letterSpacing: 0.3 }, style]}>
      {antes}
      {resaltado ? <Text style={{ color: colors.primaryLight }}>{resaltado}</Text> : null}
      {despues}
    </Text>
  );
}
