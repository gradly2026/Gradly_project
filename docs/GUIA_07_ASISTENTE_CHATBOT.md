# Guía 7 — El Asistente Gradly (chatbot de ayuda)

> Para quien nunca configuró un chatbot ni sabe qué es una "API key" o un
> "secreto". Al final de esta guía el asistente estará funcionando y sabrás
> cómo cambiar lo que dice, cuánto cuesta y qué hacer si algo falla.
>
> Todo lo que se hace aquí lo hace **una sola vez** el administrador (tú). Los
> usuarios no configuran nada.

---

## 1. ¿Qué es el Asistente Gradly?

Es un **botón flotante con forma de estrella (✨)** que aparece abajo a la
derecha en los dashboards de estudiante, empresa y universidad. Al tocarlo se
abre un chat donde el usuario pregunta cosas como:

- "¿Cómo publico una vacante?"
- "¿Qué significa que un estudiante esté 'Certificado'?"
- "¿Dónde veo mis pasantías por certificar?"

y el asistente responde en el idioma del usuario, con conocimiento de cómo
funciona Gradly. Si la respuesta implica ir a algún lado de la app, además
muestra un botón **"Ir a X →"** — pero **el usuario decide si tocarlo**: el bot
nunca navega solo ni hace acciones (no envía mensajes, no acepta acuerdos, no
borra nada).

El "cerebro" del asistente es **Groq**, un servicio que ejecuta modelos de IA
(Gradly usa `openai/gpt-oss-120b`). Tiene un nivel gratuito con límites de uso y
un plan de pago si algún día hace falta más capacidad (ver sección 8).

---

## 2. Las 3 piezas

```
┌─────────────────────┐   pregunta    ┌──────────────────────┐   pregunta   ┌──────────┐
│  Burbuja ✨ (la app) │ ────────────▶ │  Cloud Function      │ ───────────▶ │   Groq   │
│  AsistenteGradly.tsx │ ◀──────────── │  chatbotGradly       │ ◀─────────── │ (modelo) │
└─────────────────────┘   respuesta   │  functions/chatbot.ts│   respuesta  └──────────┘
                                      └──────────────────────┘
                                       guarda la API key,
                                       cuenta el uso, arma
                                       el "system prompt"
```

| Pieza | Archivo | Qué hace |
|---|---|---|
| **Burbuja** | `src/components/AsistenteGradly.tsx` | El botón ✨ + la hoja de chat. Solo aparece si el admin la habilita. |
| **Cloud Function** | `functions/src/chatbot.ts` | Recibe la pregunta, le pone contexto de Gradly, llama a Groq con la API key (que vive **solo aquí**, nunca en la app), limita a 40 consultas/usuario/día. |
| **Groq** | — | El servicio de IA (modelo `openai/gpt-oss-120b`). Gratis con límites; de pago si se necesita más. |

> ⚠️ **La API key nunca va en el código de la app.** Si estuviera ahí,
> cualquiera que abra la web podría copiarla y gastar tu saldo. Por eso vive
> como **"secreto"** dentro de Firebase, y solo la Cloud Function la puede leer.

---

## 3. Encenderlo — paso a paso

### 3.1 Conseguir la API key de Groq

1. Entra a **https://console.groq.com** e inicia sesión (o crea tu cuenta de
   Groq).
2. En el menú abre **API Keys** → **Create API Key**.
3. Ponle un nombre que te recuerde para qué es (por ejemplo `gradly-asistente`)
   y confirma.
4. **Copia la clave** en ese momento (después ya no se puede volver a ver). Es
   un texto largo que empieza con `gsk_…`.
   - **No la pegues en ningún chat, ni en un archivo, ni en el código.**
   - Si la pierdes no pasa nada: borras esa y creas otra (sección 7).

> **¿Y los límites del plan gratuito?** Groq no cobra en el nivel gratuito, pero
> pone topes por minuto y por día (para `openai/gpt-oss-120b`, a septiembre de
> 2026: 30 peticiones y 8.000 tokens por minuto; 1.000 peticiones y 200.000
> tokens por día — los valores vigentes están en
> https://console.groq.com/docs/rate-limits). Para el uso normal del asistente
> alcanza. Si con varios usuarios a la vez el bot empieza a fallar por límites,
> se pasa al plan **Developer** (de pago) desde la misma consola (sección 8).

### 3.2 Guardar la key como secreto

Abre una terminal **en la carpeta del proyecto**
(`C:\Users\Admin\Desktop\CreaJ2026\Gradly\Movil\Gradly-firestore`) y corre:

```bash
firebase functions:secrets:set GROQ_API_KEY
```

- Te va a mostrar `? Enter a value for GROQ_API_KEY:` → **pega la clave** y
  Enter. (No se verá mientras la pegas, es normal.)
- Si dice que el **"Secret Manager API" no está habilitado**, te da un enlace →
  ábrelo, dale "Habilitar", y vuelve a correr el comando.
- Guarda la clave **cifrada** en Google. Cada vez que la cambias se crea una
  "versión" nueva; la función usa siempre la última.

### 3.3 Desplegar la función

```bash
firebase deploy --only functions:chatbotGradly,functions:extraerFaqDeDocumento
```

- Son dos funciones que usan la **misma** clave de Groq: el chat del asistente
  (`chatbotGradly`) y el lector de documentos del FAQ (`extraerFaqDeDocumento`,
  sección 4). Si solo quieres el chat, basta con `functions:chatbotGradly`.
- La primera vez tarda 1–3 minutos.
- Si sale un error diciendo que el secreto no tiene permiso para la cuenta de
  servicio, el propio `firebase` te imprime el comando exacto para arreglarlo
  (cópialo y córrelo). Normalmente no hace falta.
- **Cada vez que se cambia `functions/src/chatbot.ts` (o `faqExtractor.ts`) hay
  que volver a correr este comando** para que el cambio surta efecto. La key
  guardada NO se pierde al redesplegar.
- El código todavía declara también el secreto `GEMINI_API_KEY` (el camino de
  Gemini quedó sin usar, pero sigue declarado). En este proyecto ya existe, así
  que no tienes que hacer nada; si algún día despliegas en un proyecto nuevo,
  Firebase te pedirá un valor para ese secreto y puedes escribir cualquier
  texto.

### 3.4 Encender la burbuja

Por defecto la burbuja está **oculta** (aunque la función ya esté desplegada).

1. Entra al **panel de administración** → sección **Config**.
2. Tarjeta **"Asistente Gradly"** → botón **"Mostrar el asistente"**.
3. Confirma. La burbuja aparece **al instante** en los dashboards de todos los
   usuarios no-admin.

Para apagarla en cualquier momento: mismo lugar, **"Ocultar el asistente"**.

### 3.5 Probar

1. Cierra sesión del admin e inicia como estudiante, empresa o universidad
   (o usa otro dispositivo/navegador).
2. Toca la ✨ abajo a la derecha.
3. Escribe algo como *"¿cómo veo mi progreso?"*.
4. Deberías ver una respuesta y, según la pregunta, un botón **"Ir a Mi
   progreso →"**.

Si responde *"El asistente no está disponible ahora"* → ve a la sección 9.

---

## 4. Llenar las "Preguntas frecuentes" (FAQ)

El asistente ya sabe lo básico de Gradly, pero puedes **enseñarle respuestas
nuevas sin tocar código ni volver a desplegar nada**.

1. Panel admin → **Config** → tarjeta **"Preguntas frecuentes del asistente"**.
2. **"+ Agregar pregunta"** → escribe la pregunta y la respuesta.
3. Repite las que quieras (hasta 40).
4. **"Guardar preguntas frecuentes"**.

Desde ese momento, cuando un usuario pregunte algo parecido, el asistente usa
**tu** respuesta como fuente prioritaria. Se guarda en el documento
`config/faq` de la base de datos.

**Buenas FAQ:** preguntas concretas y frecuentes, con respuestas cortas.
Ejemplo:

> **P:** ¿Cuántas horas dura una pasantía?
> **R:** Depende del acuerdo entre la universidad y la empresa; las ves en "Mi
> progreso" como "30/100h". Cuando llegas a la meta, la práctica pasa a "por
> certificar".

### Subir un documento en vez de escribir las preguntas

Si ya las tienes en un archivo, en la misma tarjeta usa **"Subir documento"**
(`.pdf`, `.docx` o `.txt`, hasta 11 MB). Groq lee el texto y propone pares
pregunta/respuesta que se **agregan a la lista para que los revises** — no se
guardan solos: edítalos y presiona **"Guardar preguntas frecuentes"**.

Con el plan gratuito de Groq el documento tiene que ser corto (del orden de 4
páginas): el límite es de unos 8.000 tokens por minuto entre lo que se envía y
lo que se pide de vuelta. Si es más largo, el aviso del panel explica que no se
pudo procesar; divídelo en partes o pasa al plan de pago. La función que lo lee
es `extraerFaqDeDocumento` (`functions/src/faqExtractor.ts`).

---

## 5. Qué puede y qué NO puede hacer el bot (el candado)

**Puede:**
- Explicar cómo se usa Gradly y qué significan los términos.
- Ofrecer llevarte a una sección con un botón "Ir a X →" (tú lo tocas).
- Responder en español o inglés, según el idioma del usuario.

**No puede (a propósito, no es un límite técnico que se pueda "abrir"):**
- Enviar mensajes, aceptar acuerdos, publicar vacantes, borrar cosas ni
  ninguna acción que cambie datos.
- Pedir contraseñas, códigos de acceso o datos bancarios.
- Navegar solo: siempre es el usuario quien toca el botón "Ir a X".

El código que ejecuta la navegación (`src/utils/asistenteDestinos.ts`) solo
sabe **navegar y abrir pestañas** — ni siquiera importa las funciones de
enviar/guardar/borrar, así que no hay forma de que el bot llegue a ellas.

---

## 6. Los destinos "Ir a X →" (fase 2)

Ahora mismo el bot puede ofrecer llevar a:

| Todos | Estudiante | Empresa | Universidad |
|---|---|---|---|
| Mensajes | Mi progreso | Mis vacantes | Mis estudiantes |
| Ayuda | Buscar vacantes | Pasantes activos | Aprobaciones |
| Mi perfil | Mi institución | | |

Faltan los que abren **ventanas modales** (Notificaciones, "Reportar un
problema", "Publicar vacante"…): necesitan un poco más de trabajo en cada
pantalla y se agregarán después.

---

## 7. Cambiar cosas después

| Quiero… | Cómo |
|---|---|
| **Cambiar la API key** (se filtró, caducó…) | Borra la vieja en https://console.groq.com/keys, crea otra, y repite los pasos **3.2** y **3.3**. |
| **Enseñarle respuestas nuevas** | Sección 4 (FAQ). No requiere desplegar. |
| **Apagar/encender la burbuja** | Panel admin → Config → "Asistente Gradly". |
| **Cambiar el modelo de IA** | En `functions/src/chatbot.ts`, la constante `MODELO_GROQ` (hoy `"openai/gpt-oss-120b"`), y la del mismo nombre en `functions/src/faqExtractor.ts`. Modelos disponibles: https://console.groq.com/docs/models. Cambia y redespliega (paso 3.3). |
| **Cambiar el tope diario por usuario** | Misma archivo, constante `LIMITE_DIARIO` (hoy `40`). Redespliega. |
| **Cambiar lo que el bot "sabe" de Gradly** | Misma archivo, la función `systemPrompt(...)`. Redespliega. |
| **Agregar un destino "Ir a X"** | `src/utils/asistenteDestinos.ts` **y** el `enum` de la tool `irA` en `functions/src/chatbot.ts` (mantener sincronizados). Redespliega la función. |

---

## 8. Costos y límites

- **Modelo:** `openai/gpt-oss-120b`, servido por Groq.
- **Tope por usuario:** cada usuario puede hacer **40 consultas al día**
  (contador en el documento `chatbot_uso/{uid}`). Al pasarse, el bot le dice
  "vuelve mañana".
- **Costo:** en el plan gratuito de Groq no se paga nada, pero hay topes por
  minuto y por día para TODA la app junta (a septiembre de 2026, para este
  modelo: 30 peticiones y 8.000 tokens por minuto; 1.000 peticiones y 200.000
  tokens por día — vigentes en https://console.groq.com/docs/rate-limits). Si
  se topan, el bot responde con error hasta que pase el minuto o el día.
- **Ojo con los 8.000 tokens por minuto:** cuentan lo que se envía (la
  pregunta, el historial y el FAQ) más el máximo que se le pide de vuelta. Una
  conversación muy larga o un FAQ muy extenso pueden acercarse a ese tope.
- **Si hace falta más capacidad:** plan **Developer** de Groq (de pago, con
  límites más altos), desde su consola. No hay que cambiar nada en el código.

---

## 9. Si algo falla

| Síntoma | Causa probable | Solución |
|---|---|---|
| La burbuja ✨ no aparece | No está habilitada | Panel admin → Config → "Asistente Gradly" → "Mostrar el asistente". |
| La burbuja aparece pero al enviar dice *"El asistente no está disponible ahora"* | La función no está desplegada, o falta el secreto | Repite pasos **3.2** y **3.3**. Revisa los logs: `firebase functions:log --only chatbotGradly`. |
| En los logs sale un error de **modelo** (`model_not_found`, `model_decommissioned` o un 404) | Groq retiró o renombró el modelo (pasa con el tiempo: `llama-3.3-70b-versatile` se descontinuó el 2026-08-16) | Mira los modelos vigentes en https://console.groq.com/docs/models, cambia `MODELO_GROQ` en `functions/src/chatbot.ts` (y en `functions/src/faqExtractor.ts`) y redespliega. |
| En los logs sale **429** ("rate limit") | Se topó el límite por minuto o por día del plan gratuito | Espera un minuto (o al día siguiente si es el límite diario). Si pasa seguido, pasa al plan Developer de Groq (sección 8). |
| En los logs sale **413** ("Request too large") | La petición (lo que se envía + lo que se pide de vuelta) supera los 8.000 tokens por minuto del plan gratuito | En el chat: conversación muy larga o FAQ muy extenso, recórtalos. Al subir un documento del FAQ: usa uno más corto. |
| En los logs sale **401** ("Invalid API Key") | La clave está mal, se borró o el secreto quedó vacío | Crea otra clave (3.1) y repite 3.2 y 3.3. |
| Responde *"Llegaste al límite de consultas… vuelve mañana"* | Ese usuario ya usó sus 40 del día | Es lo esperado. Para subir el tope: constante `LIMITE_DIARIO` + redesplegar. |
| El botón *"Ir a X →"* no aparece nunca | La función desplegada es una versión vieja (sin fase 2) | Redespliega: `firebase deploy --only functions:chatbotGradly`. |
| Responde pero **no usa mis FAQ** | La función no se ha redesplegado desde que se agregó el soporte de FAQ, o guardaste el FAQ con la función vieja | Redespliega la función. El FAQ en sí NO necesita desplegar, pero la función que lo lee sí tiene que ser la versión con soporte de FAQ. |
| Al **subir un documento** del FAQ sale "No se pudo procesar el documento" | El documento es muy largo para el plan gratuito, no tiene texto (es un escaneo de imágenes), o la función no está desplegada | Lee el detalle del aviso y los registros: `firebase functions:log --only extraerFaqDeDocumento`. Usa un documento más corto o redespliega (3.3). |

**Ver los registros de la función** (lo más útil para diagnosticar):

```bash
firebase functions:log --only chatbotGradly
```

Para el lector de documentos del FAQ: `firebase functions:log --only extraerFaqDeDocumento`.

---

## 10. Mapa de archivos

| Archivo | Qué es |
|---|---|
| `functions/src/chatbot.ts` | La Cloud Function `chatbotGradly`: llama a Groq (`llamarGroq`; el camino de Gemini, `llamarGemini`, quedó sin usar y `PROVEEDOR_IA` está fijo en `"groq"`), arma el prompt, límite diario, lee el FAQ, tool `irA`. |
| `functions/src/faqExtractor.ts` | La Cloud Function `extraerFaqDeDocumento`: lee un .pdf/.docx/.txt que sube el admin y le pide a Groq los pares pregunta/respuesta (JSON estricto). Solo admin. |
| `functions/src/index.ts` | Exporta `chatbotGradly` (una línea). |
| `src/services/chatbotService.ts` | El cliente llama a la función desde aquí (`preguntarAlAsistente`). |
| `src/components/AsistenteGradly.tsx` | La burbuja ✨ + la hoja de chat + el botón "Ir a X →". |
| `src/utils/asistenteDestinos.ts` | Catálogo de destinos "Ir a X" y el despachador que navega (solo navega). |
| `app/admin/index.tsx` → `renderConfig()` | Tarjetas "Asistente Gradly" (encender/apagar) y "Preguntas frecuentes del asistente". |
| Base de datos: `config/asistente` | `{ habilitado: bool }` — si la burbuja se ve. |
| Base de datos: `config/faq` | `{ entradas: [{p, r}, …] }` — las FAQ. |
| Base de datos: `chatbot_uso/{uid}` | Contador de consultas del día por usuario (lo escribe la función). |

---

Relacionado: [`GUIA_01_FIREBASE_Y_CRUD.md`](GUIA_01_FIREBASE_Y_CRUD.md) (qué es
Firebase y Cloud Functions), [`GUIA_04_NOTIFICACIONES.md`](GUIA_04_NOTIFICACIONES.md)
(el sistema de avisos in-app que el bot puede usar para llevar a "Notificaciones"
más adelante).
