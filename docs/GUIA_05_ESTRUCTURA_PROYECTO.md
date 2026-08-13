# Guía 5 — Mapa del proyecto

## 1. Las carpetas principales

```
Gradly-firestore/
├── app/            ← LAS PANTALLAS (rutas). Ver sección 2.
├── src/
│   ├── components/ ← piezas de UI reutilizables (modales, tarjetas, botones)
│   ├── context/     ← los 3 "Context" globales: Theme, Translation, Auth
│   ├── services/    ← funciones que hablan con Firebase (CRUD), por tema
│   ├── i18n/         ← diccionarios de traducción pre-sembrados (autoSeed.ts)
│   ├── locales/       ← es.json / en.json (texto fijo de la interfaz)
│   ├── config/         ← firebaseConfig.ts (conexión a Firebase)
│   ├── types/           ← tipos de TypeScript compartidos
│   ├── utils/             ← funciones sueltas de apoyo (shadow, cupos, notifRoute...)
│   ├── data/                ← catálogos fijos (carreras, ubicaciones de El Salvador)
│   └── hooks/                 ← hooks propios reutilizables
├── services/        ← authService.ts (uploads + creación de grupos)
├── functions/       ← Cloud Functions (código que corre en Google, no en el celular)
├── assets/          ← imágenes, íconos, fuentes
├── firestore.rules  ← reglas de seguridad de la base de datos
└── node_modules/    ← librerías de terceros descargadas (NUNCA se edita a mano)
```

> Nota: hay una carpeta `services/` en la raíz (con `authService.ts`) Y
> una carpeta `src/services/` (con el resto de servicios). Son
> distintas — cuidado al importar, la ruta relativa cambia.

## 2. `app/` — cómo funciona el ruteo (Expo Router)

Este proyecto usa **Expo Router**: la estructura de CARPETAS Y ARCHIVOS
dentro de `app/` define automáticamente las rutas de la app, sin tener
que configurar una lista de rutas a mano (parecido a cómo funciona
Next.js en la web).

| Archivo | Ruta resultante |
|---|---|
| `app/index.tsx` | `/` (pantalla inicial) |
| `app/registro.tsx` | `/registro` |
| `app/dashboard-empresa.tsx` | `/dashboard-empresa` |
| `app/mensajes/index.tsx` | `/mensajes` |
| `app/mensajes/[id].tsx` | `/mensajes/cualquier-id` (ruta dinámica — el `[id]` se vuelve un parámetro) |
| `app/(tabs)/index.tsx` | Una pestaña dentro del grupo `(tabs)` |
| `app/admin/index.tsx` | `/admin` (panel de administración) |

Las carpetas entre `(paréntesis)`, como `(tabs)`, son **grupos de
rutas**: organizan archivos sin agregar ese nombre a la URL — sirven
sobre todo para compartir un layout común (como la barra de pestañas de
abajo) entre varias pantallas.

`app/_layout.tsx` es el archivo RAÍZ de todo el ruteo: envuelve TODA la
app en los Providers globales (`ThemeProvider`, `TranslationProvider`,
`AuthProvider`...) y carga las fuentes personalizadas con `useFonts()`.
Cualquier Context nuevo que se quiera que toda la app pueda usar, se
agrega envolviendo aquí.

Para navegar entre pantallas se usa `router.push('/ruta')` (hook
`useRouter()`, ver `FloatingTopBar.tsx`) o el componente `<Link
href="/ruta">`.

## 3. Los 4 roles de usuario

Gradly tiene 4 tipos de cuenta, cada uno con su propio dashboard:

| Rol | Dashboard | Perfil en Firestore |
|---|---|---|
| Estudiante | `app/(tabs)/*` (pestañas) | `perfiles_estudiantes` |
| Empresa | `app/dashboard-empresa.tsx` | `perfiles_empresas` |
| Universidad | `app/dashboard-universidad.tsx` | `perfiles_universidades` |
| Administrador | `app/admin/index.tsx` | (usa el rol `admin` en `usuarios`, sin perfil propio) |

`src/context/AuthContext.tsx` es quien sabe, en todo momento, qué rol
tiene el usuario logueado (campo `rol` del documento `usuarios/{uid}`), y
las pantallas usan ese dato para decidir a qué dashboard mandar a cada
quien después del login.

## 4. `functions/` — Cloud Functions (código que NO corre en el celular)

Esta carpeta es un proyecto de Node.js **aparte** (tiene su propio
`package.json`, su propio `node_modules`). No corre en el celular del
usuario: se sube ("despliega") a los servidores de Google, y la app le
llama por internet cuando hace falta (usando `httpsCallable`, como en
`translationService.ts`).

¿Por qué hace falta código en el servidor, si Firestore ya se puede leer/
escribir directo desde el celular? Porque hay tareas que NO deben (o no
pueden) hacerse desde el celular del usuario:

| Cloud Function | Para qué |
|---|---|
| `solicitarOtp` / `verificarOtp` | Login sin contraseña por código de 8 dígitos — enviar el código por correo requiere una clave secreta (Resend) que nunca debe estar en la app |
| `traducirTexto` | Llama a Google Translate con la cuenta de servicio del proyecto, sin exponer ninguna clave en la app |
| `notifNuevoMensaje` | Notifica al recibir un mensaje de chat |
| `barridoCuposVencidos` | Tarea programada (corre sola, una vez por hora) que libera cupos reservados y no tomados a tiempo |
| `setUserRole`, `setUserBan`, `resolveReport`, etc. | Operaciones sensibles del panel admin — deben verificar en el SERVIDOR que quien las pide de verdad tiene rol `admin`, algo que no se puede confiar a validar solo del lado del celular |
| `backfillAlianzasCalificaciones` | Recalcula datos históricos masivos — más rápido y confiable corriendo en un servidor que desde la app |

**No hace falta tocar ni entender el código de `functions/` para trabajar
en la app** — la app solo lo "llama" desde lejos, como pedirle un favor a
otro programa. Si algún día necesitas ver o modificar una Cloud Function,
es un proyecto de Node.js normal, con sus propias reglas (no usa React
Native).

## 5. `node_modules/` — ¿qué es esa carpeta gigante?

`node_modules/` contiene TODO el código de las librerías de terceros que
el proyecto usa (React, React Native, Firebase, Expo, y decenas de
paquetes más chicos) — literalmente miles de archivos. Se genera
automáticamente al correr `npm install`, a partir de la lista de
dependencias declarada en `package.json`.

Reglas simples sobre esta carpeta:
- **Nunca se edita a mano.** Cualquier cambio ahí se perdería la próxima
  vez que alguien vuelva a instalar dependencias.
- **Nunca se sube a git** (está en `.gitignore`) — es demasiado grande, y
  cualquiera puede regenerarla con `npm install` a partir de
  `package.json` + `package-lock.json`.
- Si necesitas una librería nueva, se instala con
  `npm install nombre-paquete` (esto la agrega a `package.json` Y la
  descarga dentro de `node_modules/`) — nunca se copian archivos ahí
  manualmente.

## 6. Comandos básicos para correr el proyecto

```bash
npm install       # descarga/actualiza node_modules según package.json
npm run start      # arranca el servidor de desarrollo de Expo
npm run web          # lo mismo, pero abre directo la versión web
npm run android        # abre en un emulador/dispositivo Android
npm run ios              # abre en un simulador/dispositivo iOS (requiere Mac)
```
