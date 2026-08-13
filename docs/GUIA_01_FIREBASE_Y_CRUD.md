# Guía 1 — Firebase y las operaciones CRUD

> Para quien nunca tocó Firebase ni sabe qué es "CRUD". Si ya leíste los
> comentarios de [`src/config/firebaseConfig.ts`](../src/config/firebaseConfig.ts)
> y de [`src/services/pasantiaService.ts`](../src/services/pasantiaService.ts),
> esta guía es el resumen "de un vistazo" de esos dos archivos.

## 1. ¿Qué es Firebase, en una frase?

Firebase es un conjunto de servicios de Google que Gradly usa como
"backend" (el servidor + la base de datos), sin que nadie en el equipo
tenga que programar ni mantener un servidor propio. De todo lo que ofrece
Firebase, este proyecto usa 4 piezas:

| Pieza | Para qué | Archivo de conexión |
|---|---|---|
| **Firestore** | La base de datos (guarda estudiantes, vacantes, chats, notificaciones...) | `src/config/firebaseConfig.ts` → variable `db` |
| **Auth** | Registro/login, saber quién es el usuario actual | `src/config/firebaseConfig.ts` → variable `auth` |
| **Storage** | Guardar archivos (fotos, CVs, logos) | `src/config/firebaseConfig.ts` → variable `storage` |
| **Cloud Functions** | Código que corre en los servidores de Google, no en el celular (ej. traducir texto) | carpeta `functions/`, fuera de esta app |

Todo el proyecto importa `db`, `auth` o `storage` desde
`src/config/firebaseConfig.ts` cuando necesita hablar con Firebase. Ese
archivo es el único lugar donde se "arma" la conexión — el resto del
proyecto solo la reutiliza.

## 2. ¿Qué es Firestore, la base de datos?

Firestore NO es como Excel (filas y columnas) ni como una base de datos
SQL tradicional (tablas con columnas fijas). Es una base de datos
**NoSQL de documentos**, organizada así:

```
Colección "usuarios"                 ← como una "carpeta"
  └── documento "uid_abc123"         ← como un "archivo" dentro de la carpeta
        { nombre_completo: "Ana Pérez", rol: "estudiante", ... }
  └── documento "uid_def456"
        { nombre_completo: "Tech Corp", rol: "empresa", ... }
```

- Una **colección** es un grupo de documentos (ej. `"usuarios"`,
  `"vacantes"`, `"aplicaciones"`, `"notificaciones_app"`).
- Un **documento** es un objeto con campos (como un JSON): texto,
  números, booleanos, listas, fechas, incluso otros objetos anidados.
- Cada documento tiene un **ID** único (a veces autogenerado por
  Firebase, a veces elegido a mano — por ejemplo, los documentos de
  `usuarios` y `perfiles_estudiantes` usan como ID el mismo `uid` de la
  cuenta de Firebase Auth, para poder relacionarlos fácilmente).

### Colecciones principales de Gradly

| Colección | Qué guarda |
|---|---|
| `usuarios` | Datos comunes a cualquier rol (nombre, correo, rol, activo) |
| `perfiles_estudiantes` / `perfiles_empresas` / `perfiles_universidades` | Datos propios de cada rol |
| `vacantes` | Publicaciones de práctica/pasantía de una empresa |
| `aplicaciones` | Postulaciones individuales de un estudiante a una vacante |
| `aplicaciones_grupos` | Postulaciones de un GRUPO completo (universidad → empresa) |
| `grupos` | Grupos de estudiantes creados por una universidad |
| `solicitudes_practicas` | La "fuente de la verdad" de una pasantía de grupo ya aprobada |
| `notificaciones_app` | Notificaciones in-app (ver [Guía 4](GUIA_04_NOTIFICACIONES.md)) |
| `chats` / dentro de cada chat, subcolección `mensajes` | Conversaciones entre usuarios |
| `transacciones` | Registros de pago (simulado) |

## 3. Las 4 operaciones CRUD

**CRUD** es un acrónimo: **C**reate, **R**ead, **U**pdate, **D**elete —
las 4 acciones básicas que se le pueden hacer a un dato. En Firestore,
cada una tiene sus propias funciones (todas vienen del paquete
`firebase/firestore`):

### CREATE (crear)

```ts
// Con ID autogenerado por Firebase:
const ref = await addDoc(collection(db, 'aplicaciones'), { estado: 'pendiente', ... });
// ref.id → el ID que Firebase le asignó

// Con un ID elegido por nosotros (ej. el uid del usuario):
await setDoc(doc(db, 'usuarios', uid), { nombre_completo: '...', ... });
```

Ejemplo real: `crearAplicacion()` en
[`pasantiaService.ts`](../src/services/pasantiaService.ts) usa `addDoc`
para crear una aplicación nueva cuando un estudiante postula.

### READ (leer)

```ts
// Un documento específico, por su ID:
const snap = await getDoc(doc(db, 'vacantes', vacanteId));
if (snap.exists()) { const datos = snap.data(); }

// Varios documentos que cumplan una condición:
const snap = await getDocs(query(
  collection(db, 'aplicaciones'),
  where('estudiante_id', '==', estudianteId),
));
snap.docs.forEach(d => console.log(d.id, d.data()));

// EN VIVO (se actualiza solo cuando cambian los datos en el servidor):
const cancelar = onSnapshot(query(...), snapshot => { /* ... */ });
// más tarde: cancelar(); ← MUY importante llamarlo al salir de la pantalla
```

Ejemplo real de lectura en vivo:
[`FloatingTopBar.tsx`](../src/components/FloatingTopBar.tsx) usa
`onSnapshot` para que la campanita de notificaciones se actualice sola,
sin que el usuario tenga que refrescar nada.

### UPDATE (actualizar)

```ts
await updateDoc(doc(db, 'aplicaciones', aplicacionId), {
  estado: 'contratado',
  contratados_count: increment(1),   // suma 1 de forma segura
});
```

`updateDoc` solo cambia los campos que le indiques — el resto del
documento queda intacto (a diferencia de `setDoc` sin `{ merge: true }`,
que reemplazaría el documento entero).

### DELETE (eliminar)

```ts
await deleteDoc(doc(db, 'vacantes', vacanteId));
```

Ejemplo real: `eliminarVacante()` en `pasantiaService.ts` — primero
verifica que nadie haya aplicado todavía, y solo entonces borra.

## 4. ¿Dónde vive el código que hace CRUD?

Por convención, este proyecto NO llama a Firestore directamente desde las
pantallas (`app/*.tsx`). En su lugar, cada "tema" de negocio tiene su
propio **servicio** en `src/services/*.ts` (o `services/authService.ts`),
con funciones que las pantallas importan y llaman:

```
app/dashboard-empresa.tsx
    import { cambiarEstadoAplicacion } from '../src/services/pasantiaService';
    ...
    await cambiarEstadoAplicacion(aplicacionId, 'contratado', ...);
```

Esto mantiene la lógica de negocio (validaciones, reglas, qué
notificación mandar) en un solo lugar por tema, en vez de repetida en
cada pantalla que la necesite.

## 5. Un mecanismo avanzado: las transacciones

Cuando una sola acción del usuario necesita crear/actualizar **varios
documentos relacionados a la vez**, y es importante que TODOS se
apliquen juntos (o ninguno), se usa `runTransaction()`. El ejemplo más
grande del proyecto es `respuestaFinalUniversidad()` en
`pasantiaService.ts`: al aprobar una pasantía de grupo, en una sola
transacción se crea la solicitud oficial, se bloquea el grupo, se
registra la alianza universidad↔empresa, se crea el chat, y se notifica
a cada estudiante — o no pasa nada de eso, si algo falla a mitad de
camino. Está comentado línea por línea en ese archivo si quieres ver el
detalle completo.

## 6. Patrón de "desnormalización" (copiar datos a propósito)

Vas a ver, en casi todos los documentos, campos como `estudiante_nombre`
guardados DENTRO de una aplicación, aunque ya exista un
`perfiles_estudiantes/{uid}` con ese mismo nombre. Esto es intencional:
en Firestore, hacer 1 lectura con el dato ya "copiado" adentro es mucho
más rápido y barato que hacer 1 lectura extra por cada fila de una lista
para ir a buscar el nombre a otra colección. El costo es que, si el
estudiante cambia su nombre después, esa copia queda desactualizada — es
un balance consciente entre velocidad y frescura de los datos.
