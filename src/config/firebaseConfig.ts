// ════════════════════════════════════════════════════════════════════════
// firebaseConfig.ts
//
// QUÉ ES ESTE ARCHIVO (explicado para alguien que nunca vio esto):
// Este es el archivo MÁS importante de conexión del proyecto. Aquí es donde
// la app "se conecta" a Firebase, que es la plataforma de Google que Gradly
// usa como backend (el servidor + base de datos, aunque nosotros no
// escribimos ni administramos ningún servidor propio).
//
// Firebase nos da 4 servicios distintos, y este archivo prepara los 4:
//   1. Auth      → registrar usuarios, iniciar sesión, saber "quién soy".
//   2. Firestore → la BASE DE DATOS (guarda documentos, como si fueran
//                  "fichas" de información: un estudiante, una vacante, etc.)
//   3. Storage   → guardar ARCHIVOS (fotos de perfil, PDFs de constancias).
//   4. App       → el "objeto raíz" que conecta todo lo anterior a este
//                  proyecto de Firebase en particular (el proyecto se llama
//                  "gradly-db-752c2", ver más abajo).
//
// Cualquier otro archivo del proyecto que necesite hablar con la base de
// datos, hace esto al inicio del archivo:
//
//     import { db } from '../config/firebaseConfig';   // (o la ruta que toque)
//
// y luego usa esa variable `db` para leer/escribir. Por eso este archivo
// es el "root" (raíz) de toda la conexión a datos de la app.
// ════════════════════════════════════════════════════════════════════════

// ── IMPORTS ────────────────────────────────────────────────────────────
// "import" trae código que YA existe en otra parte (una librería instalada,
// o un archivo nuestro) para poder usarlo aquí. Es como "pedir prestada"
// una herramienta de otra caja de herramientas.

import AsyncStorage from "@react-native-async-storage/async-storage";
// AsyncStorage = una "cajita" de almacenamiento simple que existe en el
// teléfono (Android/iOS). Sirve para guardar datos pequeños de forma
// permanente en el dispositivo, aunque se cierre la app. Aquí se usa para
// que Firebase pueda GUARDAR la sesión del usuario en el celular, y así
// la próxima vez que abra la app no tenga que volver a iniciar sesión.

import { getApp, getApps, initializeApp } from "firebase/app";
// Estas 3 funciones vienen de la librería oficial de Firebase ("firebase/app")
// y sirven para crear/obtener la conexión principal a un proyecto de Firebase:
//   - initializeApp(config)  → crea la conexión por primera vez.
//   - getApps()              → devuelve la lista de conexiones ya creadas.
//   - getApp()                → devuelve la conexión ya creada (si existe).

import {
  browserLocalPersistence,
  getAuth,
  initializeAuth,
  type Auth,
} from "firebase/auth";
// "firebase/auth" es la parte de Firebase encargada de usuarios y sesiones
// (registro, login, "quién es el usuario actual").
//   - initializeAuth(app, opciones) → crea el sistema de autenticación,
//     indicando CÓMO debe recordar la sesión (ver más abajo, "persistence").
//   - getAuth(app)                   → obtiene el sistema de auth ya creado.
//   - browserLocalPersistence        → una "opción" que le dice a Firebase:
//     "en la versión web, guarda la sesión usando el almacenamiento local
//     del navegador (localStorage)".
//   - type Auth                      → esto NO es una función, es un TIPO
//     de TypeScript. Un "type" describe la FORMA que debe tener un valor
//     (qué propiedades tiene, qué tipo es cada una) para que el editor de
//     código y TypeScript nos avisen si nos equivocamos usándolo. No existe
//     en tiempo de ejecución, solo ayuda mientras programamos.

// getReactNativePersistence existe en el build de React Native aunque su tipo
// no se exporte en algunas versiones de firebase; lo importamos por separado.
// @ts-expect-error - falta la declaración de tipos, no el símbolo en runtime
import { getReactNativePersistence } from "firebase/auth";
// getReactNativePersistence(AsyncStorage) → le dice a Firebase Auth:
// "en el celular (no en la web), guarda la sesión usando AsyncStorage"
// (la cajita de almacenamiento que importamos arriba).
// La línea "@ts-expect-error" justo encima es un comentario ESPECIAL que
// entiende TypeScript: significa "sé que la línea de abajo va a marcar un
// error de tipos, ignóralo a propósito, porque en la práctica sí funciona".
// Es decir: el código SÍ existe y SÍ funciona al ejecutarse, solo que la
// librería de Firebase no declaró su "type" correctamente en esta versión.

import { getFirestore } from "firebase/firestore";
// getFirestore(app) → obtiene la conexión a la BASE DE DATOS (Firestore)
// de este proyecto de Firebase. Esta es la función más usada en TODO el
// proyecto, porque de ahí sale la variable `db` que se usa para leer y
// escribir información (estudiantes, vacantes, chats, notificaciones...).

import { getStorage } from "firebase/storage";
// getStorage(app) → obtiene la conexión al ALMACENAMIENTO DE ARCHIVOS
// (fotos, PDFs, etc.) de este proyecto de Firebase.

import { Platform } from "react-native";
// Platform → una utilidad de React Native que nos dice en qué "plataforma"
// se está ejecutando la app ahora mismo. Platform.OS puede valer "web",
// "ios" o "android". Se usa más abajo para decidir cómo guardar la sesión
// según si el usuario está en un navegador o en el celular.

// ── CREDENCIALES DEL PROYECTO DE FIREBASE ────────────────────────────────
// Credenciales reales del proyecto gradly-db-752c2 (reemplaza al viejo
// gradly-e1a2a, que se deja de lado sin migrar — ver decisión del 20 ago).
const firebaseConfig = {
  // "const" = una variable que, una vez creada, no se vuelve a reasignar.
  // firebaseConfig es un OBJETO (un conjunto de pares "nombre: valor") con
  // los datos públicos que identifican a ESTE proyecto de Firebase frente
  // a los servidores de Google. Todos son de tipo texto (string).
  apiKey: "AIzaSyDR5L2E7Cc3EW59C8FtcGJgedhIELQQGXE",
  // apiKey → una clave que identifica qué APLICACIÓN está llamando a
  // Firebase. OJO: en proyectos de Firebase para app móvil/web, esta clave
  // NO es secreta como una contraseña — está pensada para ir incluida en
  // el código de la app (hasta el navegador la puede ver). La seguridad
  // real de los datos la dan las REGLAS de Firestore (archivo
  // firestore.rules en la raíz del proyecto), no esta clave.
  authDomain: "gradly-db-752c2.firebaseapp.com",
  // authDomain → el dominio web que usa Firebase Auth para ciertos flujos
  // de inicio de sesión (por ejemplo, redirecciones).
  projectId: "gradly-db-752c2",
  // projectId → el identificador único del proyecto dentro de la consola
  // de Firebase/Google Cloud. Todo lo que hace la app (base de datos,
  // funciones en la nube, etc.) vive "dentro" de este projectId.
  storageBucket: "gradly-db-752c2.firebasestorage.app",
  // storageBucket → el "cajón" donde se guardan los archivos subidos
  // (fotos de perfil, constancias en PDF, etc.) cuando se usa Storage.
  messagingSenderId: "1077038818089",
  // messagingSenderId → identificador usado por Firebase Cloud Messaging
  // (notificaciones push). En este proyecto las notificaciones son
  // "in-app" (dentro de la app, ver GUIA_04_NOTIFICACIONES.md), así que
  // este campo casi no se usa hoy, pero Firebase lo pide igual.
  appId: "1:1077038818089:web:531d87508dfc5e77becd38",
  // appId → identificador único de ESTA app dentro del proyecto de Firebase
  // (un mismo proyecto de Firebase puede tener varias apps: web, iOS...).
  // No se incluye measurementId: la consola no lo dio en el snippet, señal
  // de que Google Analytics no está activado en este proyecto todavía. Si
  // se activa más adelante, se agrega este campo con el valor que dé Firebase.
};

// ── CREAR (O REUTILIZAR) LA CONEXIÓN PRINCIPAL ───────────────────────────
// getApps() evita el crash "Firebase App '[DEFAULT]' already exists" al recargar.
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
// Esta línea usa un operador ternario: "condición ? valorSiVerdadero : valorSiFalso"
//   - getApps().length === 0   → ¿la lista de conexiones ya creadas está vacía?
//   - Si SÍ (es la primera vez que corre este archivo) → initializeApp(firebaseConfig)
//     crea la conexión desde cero, usando las credenciales de arriba.
//   - Si NO (el archivo se volvió a ejecutar, por ejemplo al "recargar en
//     caliente" durante desarrollo) → getApp() simplemente reutiliza la
//     conexión que ya existía, en vez de crear una segunda y provocar un
//     error de Firebase que dice "la app ya existe".
// `app` es entonces el objeto "raíz" que representa la conexión al
// proyecto de Firebase completo. A partir de `app` se sacan `auth`, `db`
// y `storage` (líneas de abajo).

// ── CREAR EL SISTEMA DE AUTENTICACIÓN (LOGIN) ────────────────────────────
/**
 * Auth robusto en las tres plataformas:
 *  - Web   → browserLocalPersistence (getReactNativePersistence NO funciona en web).
 *  - Nativo→ AsyncStorage vía getReactNativePersistence.
 *  - Hot reload → si ya estaba inicializado, initializeAuth lanza y reutilizamos getAuth.
 */
const auth: Auth = (() => {
  // Esto es una función que se define Y se ejecuta inmediatamente
  // (se le llama "IIFE": Immediately Invoked Function Expression). Los
  // paréntesis "(() => { ... })()" crean la función con "() => {...}" y
  // los últimos "()" la llaman al instante. Se usa aquí para poder usar
  // "try/catch" (manejo de errores) y terminar con un solo valor final
  // guardado directo en la constante `auth`.
  // ": Auth" después de "const auth" es una anotación de TypeScript: le
  // decimos "esta variable va a tener la forma del tipo Auth" (importado
  // arriba). Ayuda a detectar errores mientras escribimos código.
  try {
    // "try" = "intenta ejecutar este bloque; si algo falla, no rompas
    // todo el programa, salta al bloque catch de abajo".
    return initializeAuth(app, {
      // initializeAuth crea el sistema de autenticación para nuestra app,
      // conectado a `app` (la conexión principal de arriba), indicando
      // en qué CAJA debe guardar la sesión del usuario (persistence):
      persistence:
        Platform.OS === "web"
          // Si la app corre en un navegador (web) → usa el almacenamiento
          // local del navegador.
          ? browserLocalPersistence
          // Si la app corre en Android/iOS (nativo) → usa AsyncStorage,
          // la cajita de almacenamiento del celular importada arriba.
          : getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // Si initializeAuth() lanza un error (típicamente porque este mismo
    // archivo ya se ejecutó antes en esta sesión, por ejemplo durante el
    // "hot reload" del desarrollo, y Firebase Auth ya estaba inicializado)
    // entonces en vez de crear uno nuevo, reutilizamos el que ya existe:
    return getAuth(app);
  }
})();
// Resultado: `auth` es el objeto que usan services/authService.ts y
// src/context/AuthContext.tsx para registrar usuarios, iniciar sesión,
// cerrar sesión, y saber "quién es el usuario logueado ahora mismo".

// ── CREAR LA CONEXIÓN A LA BASE DE DATOS (FIRESTORE) ─────────────────────
const db = getFirestore(app);
// `db` (de "database") es la variable MÁS importada en todo el proyecto.
// Representa la base de datos Firestore de este proyecto de Firebase.
// Cualquier archivo que necesite leer o escribir información (estudiantes,
// vacantes, chats, notificaciones, reportes...) empieza importando esto:
//     import { db } from '../config/firebaseConfig';
// y luego usa funciones como collection(db, "nombre"), doc(db, ...), etc.
// (explicado a fondo en GUIA_01_FIREBASE_Y_CRUD.md).

// ── CREAR LA CONEXIÓN AL ALMACENAMIENTO DE ARCHIVOS ──────────────────────
const storage = getStorage(app);
// `storage` se usa cuando la app necesita subir o descargar ARCHIVOS
// (por ejemplo, la foto de perfil de un usuario, o el PDF de una
// constancia de pasantía), a diferencia de `db` que guarda solo texto y
// números estructurados (documentos).

// ── EXPORTAR TODO PARA QUE OTROS ARCHIVOS LO USEN ────────────────────────
export { app, auth, db, storage, firebaseConfig };
// "export" hace que estas 4 variables + el objeto de configuración puedan
// ser importadas desde CUALQUIER otro archivo del proyecto, así:
//
//     import { db } from '../config/firebaseConfig';      // para leer/escribir datos
//     import { auth } from '../config/firebaseConfig';    // para login/registro
//     import { storage } from '../config/firebaseConfig'; // para subir archivos
//
// Ejemplos reales dentro de este mismo proyecto:
//   - src/services/pasantiaService.ts   importa `db` para leer y escribir
//     documentos de la colección "pasantias" (ver GUIA_01).
//   - services/authService.ts           importa `auth` y `db` para
//     registrar usuarios y guardar su perfil (ver GUIA_01).
//   - src/context/AuthContext.tsx       importa `auth` para escuchar si
//     hay un usuario con sesión iniciada.
