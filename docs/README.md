# Guías de Gradly para principiantes

Estas guías explican, en español y desde cero, cómo funciona el código
de este proyecto (React Native + Expo + Firebase). Están pensadas para
alguien que nunca programó en React Native ni usó Firebase.

**Empieza por acá si nunca viste el proyecto:**
1. [GUIA_06_GLOSARIO_REACT_NATIVE.md](GUIA_06_GLOSARIO_REACT_NATIVE.md) — vocabulario básico (React, JSX, hooks, TypeScript, Firebase).
2. [GUIA_05_ESTRUCTURA_PROYECTO.md](GUIA_05_ESTRUCTURA_PROYECTO.md) — mapa de carpetas, cómo funciona el ruteo, roles de usuario, Cloud Functions, node_modules.

**Luego, un tema a la vez:**
3. [GUIA_01_FIREBASE_Y_CRUD.md](GUIA_01_FIREBASE_Y_CRUD.md) — la base de datos y las operaciones CRUD (crear/leer/actualizar/eliminar).
4. [GUIA_02_TRADUCTOR_I18N.md](GUIA_02_TRADUCTOR_I18N.md) — el sistema de idiomas Español/Inglés.
5. [GUIA_03_TEMA_CLARO_OSCURO.md](GUIA_03_TEMA_CLARO_OSCURO.md) — el sistema de tema claro/oscuro.
6. [GUIA_04_NOTIFICACIONES.md](GUIA_04_NOTIFICACIONES.md) — cómo se crean, muestran y abren las notificaciones.

## Archivos de código comentados línea por línea

Cada guía de arriba enlaza a "archivos maestros" del código real, donde
CADA línea tiene un comentario explicando qué hace, para qué sirve cada
variable, y de qué otro archivo viene cada dato importado. Son el mejor
punto de partida para leer código real del proyecto:

| Archivo | Qué enseña |
|---|---|
| [`src/config/firebaseConfig.ts`](../src/config/firebaseConfig.ts) | Cómo se conecta la app a Firebase |
| [`src/context/ThemeContext.tsx`](../src/context/ThemeContext.tsx) | Tema claro/oscuro, Context de React |
| [`src/context/TranslationContext.tsx`](../src/context/TranslationContext.tsx) | El motor del traductor de texto fijo |
| [`src/services/translationService.ts`](../src/services/translationService.ts) | Traducción dinámica de contenido de la base de datos |
| [`src/i18n/autoSeed.ts`](../src/i18n/autoSeed.ts) | Diccionarios pre-traducidos (patrón, no cada línea) |
| [`services/authService.ts`](../services/authService.ts) | Subir archivos + crear cuentas en lote (CRUD + Auth) |
| [`src/services/notificationService.ts`](../src/services/notificationService.ts) | Crear una notificación (CREATE) |
| [`src/services/notificacionService.ts`](../src/services/notificacionService.ts) | Plantillas de mensajes de notificación |
| [`src/utils/notifRoute.ts`](../src/utils/notifRoute.ts) | Interpretar el "deep link" de una notificación |
| [`src/services/pasantiaService.ts`](../src/services/pasantiaService.ts) | **El archivo más grande**: CRUD completo + transacciones |
| [`src/components/FloatingTopBar.tsx`](../src/components/FloatingTopBar.tsx) | Un componente real completo: campanita, idioma, tema, lectura en vivo |
| [`src/components/VacanteDetailByIdModal.tsx`](../src/components/VacanteDetailByIdModal.tsx) | El patrón "leer un documento y mostrarlo" en su forma más simple |

El resto del proyecto (los otros ~100 archivos) sigue los MISMOS
patrones que ya viste en estos 12 archivos maestros — una vez que los
entiendas, vas a reconocer la misma forma de trabajar en cualquier otra
pantalla o servicio de Gradly.
