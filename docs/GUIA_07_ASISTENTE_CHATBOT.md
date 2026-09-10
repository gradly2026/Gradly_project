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

El "cerebro" del asistente es **Gemini**, el modelo de IA de Google. Gradly le
paga a Google por cada consulta (muy poco, ver sección 8).

---

## 2. Las 3 piezas

```
┌─────────────────────┐   pregunta    ┌──────────────────────┐   pregunta   ┌──────────┐
│  Burbuja ✨ (la app) │ ────────────▶ │  Cloud Function      │ ───────────▶ │  Gemini  │
│  AsistenteGradly.tsx │ ◀──────────── │  chatbotGradly       │ ◀─────────── │ (Google) │
└─────────────────────┘   respuesta   │  functions/chatbot.ts│   respuesta  └──────────┘
                                      └──────────────────────┘
                                       guarda la API key,
                                       cuenta el uso, arma
                                       el "system prompt"
```

| Pieza | Archivo | Qué hace |
|---|---|---|
| **Burbuja** | `src/components/AsistenteGradly.tsx` | El botón ✨ + la hoja de chat. Solo aparece si el admin la habilita. |
| **Cloud Function** | `functions/src/chatbot.ts` | Recibe la pregunta, le pone contexto de Gradly, llama a Gemini con la API key (que vive **solo aquí**, nunca en la app), limita a 40 consultas/usuario/día. |
| **Gemini** | — | El modelo de IA. Se paga por uso. |

> ⚠️ **La API key nunca va en el código de la app.** Si estuviera ahí,
> cualquiera que abra la web podría copiarla y gastar tu saldo. Por eso vive
> como **"secreto"** dentro de Firebase, y solo la Cloud Function la puede leer.

---

## 3. Encenderlo — paso a paso

### 3.1 Conseguir la API key de Gemini

1. Entra a **https://aistudio.google.com/apikey** con tu cuenta de Google (la
   misma del proyecto de Firebase de Gradly).
2. Si te pide **importar un proyecto**: elige **"Gradly-db"** (id
   `gradly-db-752c2`) — es el mismo proyecto de Firebase donde corre todo lo
   demás. Así la facturación, las cuotas y los registros quedan en un solo
   lugar. (Puedes dejar también "Default Gemini Project" marcado, no estorba,
   pero **no lo uses**.) → **Importar**.
3. **Crear clave / "Create API key"** → cuando te pregunte el proyecto, elige
   **`gradly-db-752c2` (Gradly-db)**, NO "Default Gemini Project".
4. **Copia la clave.** Es un texto largo que empieza con `AIza…`.
   - **No la pegues en ningún chat, ni en un archivo, ni en el código.**
   - Si la pierdes no pasa nada: borras esa y creas otra (sección 7).

> **¿Por qué el proyecto de Gradly y no el gratuito?** El "Default Gemini
> Project" es de nivel gratuito y tiene un límite bajo de peticiones por minuto:
> con varios usuarios a la vez se topa y el bot empieza a fallar. El proyecto
> Gradly-db ya tiene facturación activa (de ahí despliegas las Cloud
> Functions), así que no tiene ese muro — y el costo real sigue siendo de
> centavos (sección 8).

### 3.2 Guardar la key como secreto

Abre una terminal **en la carpeta del proyecto**
(`C:\Users\Admin\Desktop\CreaJ2026\Gradly\Movil\Gradly-firestore`) y corre:

```bash
firebase functions:secrets:set GEMINI_API_KEY
```

- Te va a mostrar `? Enter a value for GEMINI_API_KEY:` → **pega la clave** y
  Enter. (No se verá mientras la pegas, es normal.)
- Si dice que el **"Secret Manager API" no está habilitado**, te da un enlace →
  ábrelo, dale "Habilitar", y vuelve a correr el comando.
- Guarda la clave **cifrada** en Google. Cada vez que la cambias se crea una
  "versión" nueva; la función usa siempre la última.

### 3.3 Desplegar la función

```bash
firebase deploy --only functions:chatbotGradly
```

- La primera vez tarda 1–3 minutos.
- Si sale un error diciendo que el secreto no tiene permiso para la cuenta de
  servicio, el propio `firebase` te imprime el comando exacto para arreglarlo
  (cópialo y córrelo). Normalmente no hace falta.
- **Cada vez que se cambia `functions/src/chatbot.ts` hay que volver a correr
  este comando** para que el cambio surta efecto. La key guardada NO se pierde
  al redesplegar.

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
| **Cambiar la API key** (se filtró, caducó…) | Borra la vieja en https://aistudio.google.com/apikey, crea otra, y repite los pasos **3.2** y **3.3**. |
| **Enseñarle respuestas nuevas** | Sección 4 (FAQ). No requiere desplegar. |
| **Apagar/encender la burbuja** | Panel admin → Config → "Asistente Gradly". |
| **Cambiar el modelo de IA** | En `functions/src/chatbot.ts`, la constante `MODELO` (hoy `"gemini-2.5-flash"`). Cambia y redespliega (paso 3.3). |
| **Cambiar el tope diario por usuario** | Misma archivo, constante `LIMITE_DIARIO` (hoy `40`). Redespliega. |
| **Cambiar lo que el bot "sabe" de Gradly** | Misma archivo, la función `systemPrompt(...)`. Redespliega. |
| **Agregar un destino "Ir a X"** | `src/utils/asistenteDestinos.ts` **y** el `enum` de la tool `irA` en `functions/src/chatbot.ts` (mantener sincronizados). Redespliega la función. |

---

## 8. Costos y límites

- **Modelo:** `gemini-2.5-flash` — el más barato y rápido de Google.
- **Tope:** cada usuario puede hacer **40 consultas al día** (contador en el
  documento `chatbot_uso/{uid}`). Al pasarse, el bot le dice "vuelve mañana".
- **Costo aproximado:** una conversación de ayuda son fracciones de centavo. Aun
  con cientos de usuarios activos al día, el gasto mensual es de pocos dólares.
- **Facturación:** va al proyecto `gradly-db-752c2` (el mismo de Firebase). Lo
  ves en Google Cloud Console → Facturación.
- Si quieres un techo duro de gasto, en Google Cloud Console → Facturación →
  **Presupuestos y alertas** puedes poner un límite y recibir aviso por correo.

---

## 9. Si algo falla

| Síntoma | Causa probable | Solución |
|---|---|---|
| La burbuja ✨ no aparece | No está habilitada | Panel admin → Config → "Asistente Gradly" → "Mostrar el asistente". |
| La burbuja aparece pero al enviar dice *"El asistente no está disponible ahora"* | La función no está desplegada, o falta el secreto | Repite pasos **3.2** y **3.3**. Revisa los logs: `firebase functions:log --only chatbotGradly`. |
| En los logs sale un **404 "model not found"** | El nombre del modelo no aplica a tu key/tier | En `functions/src/chatbot.ts` cambia `MODELO` a `"gemini-2.0-flash"` y redespliega. |
| En los logs sale **429 / "quota"** | Estás en nivel gratuito y se topó | Crea la key en el proyecto **Gradly-db** (con facturación), no en "Default Gemini Project". Repite 3.1–3.3. |
| Responde *"Llegaste al límite de consultas… vuelve mañana"* | Ese usuario ya usó sus 40 del día | Es lo esperado. Para subir el tope: constante `LIMITE_DIARIO` + redesplegar. |
| El botón *"Ir a X →"* no aparece nunca | La función desplegada es una versión vieja (sin fase 2) | Redespliega: `firebase deploy --only functions:chatbotGradly`. |
| Responde pero **no usa mis FAQ** | La función no se ha redesplegado desde que se agregó el soporte de FAQ, o guardaste el FAQ con la función vieja | Redespliega la función. El FAQ en sí NO necesita desplegar, pero la función que lo lee sí tiene que ser la versión con soporte de FAQ. |

**Ver los registros de la función** (lo más útil para diagnosticar):

```bash
firebase functions:log --only chatbotGradly
```

---

## 10. Mapa de archivos

| Archivo | Qué es |
|---|---|
| `functions/src/chatbot.ts` | La Cloud Function `chatbotGradly`: llama a Gemini, arma el prompt, límite diario, lee el FAQ, tool `irA`. |
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
