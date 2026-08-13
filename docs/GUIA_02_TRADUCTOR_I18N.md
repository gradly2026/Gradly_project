# Guía 2 — Cómo funciona el traductor (Español ⇄ Inglés)

> Complementa los comentarios de
> [`TranslationContext.tsx`](../src/context/TranslationContext.tsx),
> [`translationService.ts`](../src/services/translationService.ts) y
> [`autoSeed.ts`](../src/i18n/autoSeed.ts).

Gradly tiene **dos sistemas de traducción totalmente distintos**, porque
resuelven dos problemas diferentes. Confundirlos es la fuente más común
de errores al tocar este tema.

## Sistema A — Texto ESTÁTICO (escrito por el programador)

Cosas como "Iniciar sesión", "Guardar", "Contraseña incorrecta". Un
programador ya sabe de antemano cuáles son estas frases, así que se
traducen **de antemano, a mano**, en dos archivos JSON:

```
src/locales/es.json   { "bienvenida_titulo": "¡Bienvenido a Gradly!" }
src/locales/en.json   { "bienvenida_titulo": "Welcome to Gradly!" }
```

Se usan con la función `t()`, que entrega
[`TranslationContext.tsx`](../src/context/TranslationContext.tsx) a
través del hook `useTranslation()`:

```tsx
const { t } = useTranslation();
<Text>{t('bienvenida_titulo')}</Text>
```

- Es **instantáneo**: no hay llamada a internet, el texto ya está en el
  JSON del idioma activo.
- Si la clave no existe en ningún JSON, `t()` devuelve la propia clave
  como texto — así, en desarrollo, un `t('typo_de_clave')` se nota a
  simple vista en la pantalla en vez de mostrar algo vacío.
- Soporta variables: `t('error_min_chars', { min: 8 })` reemplaza
  `{{min}}` dentro de la frase del JSON.

**Regla práctica:** si agregas un texto fijo nuevo a una pantalla,
agrégalo con la MISMA clave en `es.json` y en `en.json` (ver
[`feedback_i18n_cada_cambio`](../src/i18n) — toda modificación de UI debe
sembrar sus frases nuevas, no basta con dejar que se traduzca solo).

## Sistema B — Texto DINÁMICO (escrito por un usuario)

El nombre de una vacante, la descripción de una empresa, un mensaje de
chat... nadie puede tener esto traducido de antemano porque no se sabe
qué va a escribir la gente. Aquí entra
[`translationService.ts`](../src/services/translationService.ts):

1. Un componente muestra un texto dinámico con `<AutoText>` (definido en
   `src/components/AutoText.tsx`) en vez de `<Text>`:
   ```tsx
   <AutoText>{vacante.titulo}</AutoText>
   ```
2. `AutoText` revisa si ese texto exacto ya está traducido en el
   **caché** (memoria + `AsyncStorage`).
3. Si no está, lo agrega a una cola. Cada ~120ms, la cola completa se
   manda de una sola vez a una **Cloud Function** llamada `traducirTexto`
   (vive en `functions/`, fuera de esta app — usa la cuenta de servicio
   del proyecto para hablar con Google Translate, sin necesitar una API
   key en el celular del usuario).
4. La respuesta se guarda en caché para siempre (hasta que cambie la
   versión del caché, `@gradly/tcache_v4`) — el mismo texto nunca se
   vuelve a traducir dos veces.

```
AutoText  →  translationService (caché + cola)  →  Cloud Function "traducirTexto"  →  Google Translate
```

Mientras la traducción llega, `AutoText` sigue mostrando el texto
original en español — no se queda en blanco ni bloquea la pantalla.

### `noTranslate` — nombres propios

`<AutoText noTranslate>{empresa.nombre}</AutoText>` desactiva la
traducción. Se usa para nombres de empresas, universidades, personas y
grupos — sin esto, "Ferretería Morales" se traduciría a algo como
"Morales Hardware Store", lo cual está mal: un nombre propio no se
traduce.

## El "seed" — por qué existe `autoSeed.ts`

El sistema B tiene un problema: la PRIMERA vez que alguien ve un texto en
inglés, hay que esperar a la Cloud Function (aunque sea poco, se nota un
parpadeo "aparece en español, luego cambia a inglés"). Para las
pantallas de más tráfico (registro, dashboards), en vez de esperar esa
primera vez, [`src/i18n/autoSeed.ts`](../src/i18n/autoSeed.ts) trae 8
diccionarios `{ "texto en español": "texto en inglés" }` **escritos a
mano**, que se cargan en el caché apenas arranca la app
(`seedStaticCache()` en `translationService.ts`). Así, esas pantallas
concretas se ven en inglés desde el primer instante, sin red y sin
parpadeo.

Si agregas una pantalla con mucho texto fijo importante, puedes agregar
sus frases a uno de esos diccionarios (o crear uno nuevo) siguiendo el
mismo patrón.

## ¿Cuál sistema uso al escribir código nuevo?

| Si el texto... | Usa |
|---|---|
| Lo escribiste tú en el código (botón, título, error) | `t('clave')` + agrégalo a `es.json`/`en.json` |
| Viene de un documento de Firestore (nombre, descripción, mensaje) | `<AutoText>{texto}</AutoText>` |
| Es un nombre propio (empresa, universidad, persona, grupo) | `<AutoText noTranslate>{nombre}</AutoText>` |
| Necesitas traducirlo FUERA de un componente (una función suelta, un `Alert`) | `translateSync(texto)` de `translationService.ts` |

## Cómo cambia el usuario de idioma

El botón 🌐 de [`FloatingTopBar.tsx`](../src/components/FloatingTopBar.tsx)
llama a `setLanguage('en')` o `toggleLanguage()` del
`TranslationContext`. Eso:
1. Actualiza el estado `language` → todos los `t()` y `<AutoText>` de la
   app se recalculan solos (React vuelve a dibujar todo lo que depende
   del Context).
2. Guarda la elección en `AsyncStorage` bajo la clave `@gradly/lang`,
   para recordarla la próxima vez que se abra la app.
3. Si es la primera vez que se abre la app (nunca se guardó nada), el
   idioma inicial se adivina con `expo-localization`, según el idioma
   configurado en el propio dispositivo.
