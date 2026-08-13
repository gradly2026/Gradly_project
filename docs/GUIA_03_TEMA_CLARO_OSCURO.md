# Guía 3 — Cómo funciona el tema claro/oscuro

> Complementa los comentarios de
> [`ThemeContext.tsx`](../src/context/ThemeContext.tsx).

## La idea general

Gradly tiene dos "paletas" de colores completas — `DARK` y `LIGHT` —
definidas en [`ThemeContext.tsx`](../src/context/ThemeContext.tsx). Cada
una define el mismo conjunto de nombres (`primary`, `backgroundCard`,
`textPrimary`, `error`, etc.), pero con valores distintos. Ninguna
pantalla del proyecto debería escribir un color "a mano" (`#7C3AED`)
directamente en su estilo — todas deberían usar `colors.primary`, y así
el color correcto sale solo según el tema activo.

## `ThemeProvider` — quién reparte los colores

En `app/_layout.tsx`, TODA la app está envuelta así:

```tsx
<ThemeProvider>
  <TranslationProvider>
    {/* el resto de la app */}
  </TranslationProvider>
</ThemeProvider>
```

`ThemeProvider` guarda un estado `isDark: boolean` y lo comparte, junto
con la paleta correspondiente, a través de un **Context de React** — un
mecanismo que permite que CUALQUIER componente, sin importar qué tan
anidado esté, pueda "escucharlo" sin que se le tenga que pasar el dato
manualmente de padre a hijo en cada nivel (eso se llama "prop drilling",
y el Context existe para evitarlo).

## `useTheme()` — cómo lo usa cada pantalla

```tsx
import { useTheme } from '../src/context/ThemeContext';

function MiPantalla() {
  const { colors, isDark, toggleTheme } = useTheme();
  return (
    <View style={{ backgroundColor: colors.backgroundDark }}>
      <Text style={{ color: colors.textPrimary }}>Hola</Text>
    </View>
  );
}
```

- `colors` → la paleta ACTIVA ahora mismo (`DARK` o `LIGHT`, según
  `isDark`).
- `isDark` → `true`/`false`.
- `toggleTheme()` → alterna entre los dos temas.
- `setTheme('light')` → fija un tema específico.

Cuando el usuario toca el interruptor de tema (ícono de sol/luna en
[`FloatingTopBar.tsx`](../src/components/FloatingTopBar.tsx) y en varias
pantallas más), se llama a `toggleTheme()`, el estado `isDark` cambia, y
**automáticamente** cada componente que usa `useTheme()` se vuelve a
dibujar con los nuevos colores — sin recargar la app ni navegar a
ninguna parte.

La elección se guarda en `AsyncStorage` (celular) / `localStorage`
(navegador web) bajo la clave `@gradly_theme`, para recordarla la
próxima vez que se abra la app.

## El patrón `makeStyles(colors)` — estilos que reaccionan al tema

`StyleSheet.create({...})` normal es **estático**: se define una sola
vez cuando el archivo se carga, y no puede "escuchar" cambios de tema. Si
le pusieras un color fijo ahí, ese color NUNCA cambiaría al alternar el
tema.

Para resolverlo, la mayoría de pantallas y modales del proyecto (ver por
ejemplo `src/components/ReclamoDetailModal.tsx`) usan este patrón:

```tsx
function MiPantalla() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // ... usa styles.card, styles.titulo, etc.
}

// Fuera del componente, al final del archivo:
const makeStyles = (COLORS: GradlyColors) => StyleSheet.create({
  card: {
    backgroundColor: COLORS.backgroundCard,
    borderColor: COLORS.border,
  },
  titulo: {
    color: COLORS.textPrimary,
  },
});
```

Aquí `makeStyles` es una FUNCIÓN que recibe la paleta activa y devuelve
un objeto de estilos construido con esos colores. `useMemo(() =>
makeStyles(colors), [colors])` vuelve a ejecutar esa función SOLO cuando
`colors` cambia (es decir, solo cuando el usuario cambia de tema) — el
resto del tiempo reutiliza el mismo objeto de estilos ya calculado, sin
gastar trabajo de más en cada repintado de pantalla.

**Regla práctica:** si vas a crear una pantalla nueva con muchos
estilos, usa este patrón (`makeStyles(colors)` + `useMemo`) en vez de un
`StyleSheet.create` fijo con colores de `COLORS` a secas — así tu
pantalla sí reacciona al modo claro/oscuro.

## `COLORS` vs `useTheme().colors` — no los confundas

`ThemeContext.tsx` también exporta un atajo `export const COLORS = DARK;`
para código antiguo del proyecto que no fue migrado. `COLORS` apunta
SIEMPRE al tema oscuro, fijo, sin importar lo que elija el usuario. Si
ves una pantalla que no cambia de color al alternar el tema, es señal de
que todavía usa `COLORS` en vez de `useTheme().colors` — en código nuevo,
siempre se debe usar `useTheme()`.

## Tipografía

`FONTS` (en el mismo archivo) define los nombres exactos de las fuentes
personalizadas cargadas en `app/_layout.tsx` con `useFonts({...})`: Sora
(títulos), Inter (cuerpo de texto) y Rajdhani (números/estadísticas). Se
usan como `fontFamily: FONTS.soraBold`, etc.
