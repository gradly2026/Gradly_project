# Guía 4 — Cómo funcionan las notificaciones in-app

> Complementa los comentarios de
> [`notificationService.ts`](../src/services/notificationService.ts),
> [`notificacionService.ts`](../src/services/notificacionService.ts),
> [`notifRoute.ts`](../src/utils/notifRoute.ts) y
> [`FloatingTopBar.tsx`](../src/components/FloatingTopBar.tsx).

Gradly usa notificaciones **in-app** (dentro de la app, mostradas en una
campanita 🔔), no notificaciones push del sistema operativo. Todo el
flujo, de principio a fin:

## 1. Se crea la notificación (Create)

Cualquier archivo del proyecto que necesite avisarle algo a un usuario
llama a `enviarNotificacion()`, definida en
[`src/services/notificationService.ts`](../src/services/notificationService.ts):

```ts
await enviarNotificacion(
  destinatarioId,        // uid de quien la recibe
  'Nueva aplicación',    // título
  'Ana Pérez aplicó a "Desarrollador Junior".', // mensaje
  'info',                // tipo: success | info | warning | error
  'vacante:abc123',      // referencia opcional (deep link)
);
```

Esto crea un documento en la colección **`notificaciones_app`**, con
`leido: false` y la fecha del servidor.

### El "catálogo" de mensajes: `NOTIF`

Para no repetir el mismo texto en 10 lugares distintos,
[`notificacionService.ts`](../src/services/notificacionService.ts)
(con "c") define un objeto `NOTIF` con plantillas ya redactadas:

```ts
import { NOTIF } from '../services/notificacionService';
const n = NOTIF.aplicacionAceptada('Desarrollador Junior');
// n = { titulo: '¡Fuiste contratado!', mensaje: '...', tipo: 'success' }
await enviarNotificacion(estudianteId, n.titulo, n.mensaje, n.tipo, `vacante:${vacanteId}`);
```

`notificacionService.ts` también expone `crearNotificacionInApp(...)`,
una versión con los parámetros en OTRO orden, que existe solo para no
tener que reescribir código antiguo que ya la llamaba así — por dentro
llama a la misma `enviarNotificacion()`.

## 2. Se muestra en tiempo real (Read en vivo)

[`FloatingTopBar.tsx`](../src/components/FloatingTopBar.tsx) — la barra
flotante presente en casi todas las pantallas — usa `onSnapshot()` para
"escuchar" la colección `notificaciones_app` filtrada por
`destinatario_id === miUsuario`. Cada vez que se crea, edita o borra una
notificación de ese usuario, la lista y el contador de no leídas
(el número rojo sobre la campanita 🔔) se actualizan **solos**, sin que
nadie tenga que refrescar la pantalla.

## 3. El usuario toca una notificación → ¿a dónde va?

El campo `link_accion` (guardado como copia de `referencia_id`, ver más
abajo) puede tener 3 formas distintas, y
[`src/utils/notifRoute.ts`](../src/utils/notifRoute.ts) decide qué hacer
con cada una:

| Formato de `link_accion` | Ejemplo | Qué pasa |
|---|---|---|
| Ruta explícita (empieza con `/`) | `/mensajes` | `router.push('/mensajes')` — navega directo |
| Referencia estructurada `"tipo:id"` | `vacante:abc123` | Se abre el **modal de detalle** correspondiente (no se navega) |
| Un ID suelto (notificaciones antiguas) | `abc123` | Se asume que es sobre un chat → navega a `/mensajes` |
| Vacío | `""` | No hace nada |

Las 4 referencias estructuradas reconocidas y su modal:

| `tipo` | Modal que se abre |
|---|---|
| `vacante` | `VacanteDetailByIdModal.tsx` → `VacanteDetailModal.tsx` |
| `grupo` | `GrupoDetailViewerModal.tsx` |
| `aplicacionGrupo` | `AplicacionGrupoDetailModal.tsx` |
| `reclamo` | `ReclamoDetailModal.tsx` |

`FloatingTopBar.tsx` guarda el ID de cada uno en su propio estado
(`vacanteModalId`, `grupoModalId`, etc.) y renderiza los 4 modales al
final, cada uno visible solo si su estado correspondiente no es `null`.

## 4. El truco de los "campos espejo"

Si abres un documento de `notificaciones_app`, vas a ver DOS pares de
campos que dicen casi lo mismo:

- `createdAt` (nuevo) **y** `fecha` (histórico) — misma fecha, dos nombres.
- `referencia_id` (nuevo) **y** `link_accion` (histórico) — mismo valor,
  dos nombres.

Esto es a propósito: en algún momento del proyecto, el código que LEE
notificaciones esperaba los nombres viejos (`fecha`, `link_accion`). En
vez de reescribir todo ese código lector de golpe, se decidió escribir
el dato DOS VECES al crearlo — así tanto el código nuevo como el viejo
funcionan sin necesitar una migración. A esto se le llama **"campo
espejo"** o **"campo de compatibilidad"**, y es un patrón que vas a ver
repetido en otras partes del proyecto.

## 5. Diagrama resumen

```
Cualquier servicio (pasantiaService, authService, reclamoCuposService...)
        │
        ▼
enviarNotificacion() ──► crea documento en Firestore: notificaciones_app
        │
        ▼
FloatingTopBar.tsx  ──onSnapshot()──►  escucha en vivo, pinta 🔔 + contador
        │
        ▼  (usuario toca una notificación)
notifRoute.ts  ──► decide: ¿navegar a una ruta? ¿abrir un modal de detalle?
        │
        ▼
router.push(ruta)   O   setXModalId(id) → se abre el modal correspondiente
```
