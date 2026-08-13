// ════════════════════════════════════════════════════════════════════════
// authService.ts
//
// QUÉ ES ESTE ARCHIVO:
// A pesar del nombre "authService" (que sugiere "todo el login vive
// aquí"), este archivo se dedica a DOS cosas puntuales:
//   1. Subir archivos a Firebase Storage (fotos de perfil, CV, logos).
//   2. Crear, de una sola vez, un GRUPO de estudiantes completo: el
//      documento del grupo en Firestore + una cuenta de acceso (Auth) y
//      un perfil (Firestore) para CADA estudiante del grupo — esto lo usa
//      una universidad cuando registra a todo un salón de una sola vez.
//
// El login/registro "normal" de un solo usuario (iniciar sesión, saber
// quién está conectado ahora mismo) vive en otro archivo:
// src/context/AuthContext.tsx (ver la nota en la línea 2 original).
//
// Este archivo es un buen ejemplo de las 4 operaciones CRUD trabajando
// juntas (ver GUIA_01_FIREBASE_Y_CRUD.md para el concepto general):
//   - Create → addDoc() para el grupo, setDoc() para cada usuario/perfil.
//   - (Read  → no aparece aquí; se hace en otros archivos al mostrar datos.)
//   - (Update/Delete → tampoco aparecen aquí.)
// Además muestra un patrón avanzado: crear varias cuentas de usuario
// SIN cerrar la sesión de quien está usando la app en ese momento (ver el
// bloque "App secundaria" más abajo).
// ════════════════════════════════════════════════════════════════════════

// Utilidades Firebase para uploads y creación de grupos.
// La autenticación de sesión vive en src/context/AuthContext.tsx
import { deleteApp, getApp, initializeApp } from "firebase/app";
// getApp()       → obtiene la conexión principal de Firebase ya creada
//                  (la misma `app` que exporta firebaseConfig.ts).
// initializeApp() → aquí se usa una SEGUNDA vez, pero con un nombre
//                  distinto, para crear una conexión "secundaria" (ver
//                  más abajo por qué hace falta).
// deleteApp()     → destruye una conexión de Firebase que ya no se
//                  necesita, liberando sus recursos.

import {
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
} from "firebase/auth";
// createUserWithEmailAndPassword(auth, correo, contraseña) → crea una
//   cuenta nueva de usuario en Firebase Authentication. IMPORTANTE: por
//   diseño de Firebase, esta función AUTOMÁTICAMENTE inicia sesión con la
//   cuenta recién creada en el `auth` que se le pase.
// getAuth(appSecundaria) → obtiene (o crea) el sistema de autenticación
//   asociado a una conexión de Firebase específica (aquí, la secundaria).
// signOut(auth) → cierra la sesión de un `auth` específico.

import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
// Funciones de Firestore (la base de datos). Se explican a fondo en
// GUIA_01_FIREBASE_Y_CRUD.md y en src/services/pasantiaService.ts, pero
// en resumen:
//   - collection(db, "nombre") → apunta a una "carpeta" de documentos.
//   - addDoc(coleccion, datos)  → CREA un documento nuevo con un ID
//     generado automáticamente por Firebase.
//   - doc(db, "coleccion", id)  → apunta a un documento ESPECÍFICO (con
//     un ID elegido por nosotros, no autogenerado).
//   - setDoc(refDelDocumento, datos) → CREA (o reemplaza por completo) el
//     documento en esa ubicación exacta.
//   - serverTimestamp()  → un valor especial que le dice a Firestore
//     "pon aquí la fecha/hora del SERVIDOR en el momento de guardar" (más
//     confiable que usar la fecha del celular del usuario, que podría
//     estar mal configurada).

import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
// Funciones de Firebase Storage (almacenamiento de archivos):
//   - ref(storage, "ruta/archivo") → apunta a una ubicación dentro del
//     "cajón" de archivos (storageBucket, ver firebaseConfig.ts).
//   - uploadBytes(ubicacion, blob) → sube el contenido binario (blob) de
//     un archivo a esa ubicación.
//   - getDownloadURL(ubicacion)    → una vez subido, devuelve la URL
//     pública desde la que se puede descargar/mostrar ese archivo (por
//     ejemplo, para usarla como `src` de una imagen).

import { db, storage } from "../src/config/firebaseConfig";
// `db` y `storage`: las conexiones a Firestore y a Storage que ya vimos
// en detalle en src/config/firebaseConfig.ts.

import { enviarNotificacion } from "../src/services/notificationService";
// La función para crear una notificación in-app (colección
// notificaciones_app), explicada a fondo en
// src/services/notificationService.ts y en GUIA_04_NOTIFICACIONES.md.

// ══════════════════════════════════════════════════════════════════
//  Uploads a Firebase Storage (fix Blob para URIs locales de Expo)
// ══════════════════════════════════════════════════════════════════

export async function uploadPhoto(uid: string, localUri: string): Promise<string> {
  // Sube la foto de perfil de un usuario a Storage y devuelve la URL
  // pública ya lista para guardar en Firestore (por ejemplo, en el campo
  // foto_url del perfil del usuario).
  // Parámetros:
  //   uid       → el identificador único del usuario (mismo id que su
  //               cuenta de Firebase Auth), se usa para nombrar el archivo.
  //   localUri  → la ruta LOCAL del archivo en el celular (por ejemplo,
  //               algo como "file:///data/.../foto.jpg"), obtenida al
  //               elegir una imagen con el selector de archivos de Expo.
  const response = await fetch(localUri);
  // `fetch` normalmente se usa para pedir datos a internet, pero aquí se
  // usa sobre una ruta LOCAL del dispositivo: en React Native, fetch()
  // también puede leer archivos locales dado su URI. `response` es la
  // "respuesta" de esa lectura.
  const blob = await response.blob();
  // .blob() convierte esa respuesta en un "Blob": un objeto que contiene
  // los bytes crudos del archivo (su contenido binario), sin importar si
  // es una imagen, un PDF, etc. Es el formato que Firebase Storage espera
  // para subir archivos.
  const storageRef = ref(storage, `fotos_perfil/${uid}`);
  // Define la ubicación DESTINO dentro de Storage: la carpeta
  // "fotos_perfil", con el nombre de archivo igual al uid del usuario
  // (así cada usuario tiene como máximo una foto, y volver a subir una
  // reemplaza la anterior en la misma ruta).
  await uploadBytes(storageRef, blob);
  // Sube el contenido del blob a esa ubicación. `await` espera a que la
  // subida termine antes de seguir.
  return getDownloadURL(storageRef);
  // Devuelve la URL pública para acceder a la imagen recién subida.
}

export async function uploadCV(
  uid: string,
  localUri: string,
  filename: string,
): Promise<string> {
  // Igual que uploadPhoto, pero para el CV (currículum) de un estudiante.
  // Recibe además `filename` (el nombre original del archivo elegido por
  // el usuario) para conservarlo en la ruta de Storage.
  const response = await fetch(localUri);
  const blob = await response.blob();
  const storageRef = ref(storage, `cvs/${uid}/${filename}`);
  // Carpeta "cvs", subcarpeta con el uid del estudiante, y dentro el
  // archivo con su nombre original — así un mismo estudiante podría en
  // teoría tener más de un archivo sin pisarse entre sí.
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

export async function uploadLogo(uid: string, localUri: string): Promise<string> {
  // Igual patrón, para el logo de una empresa.
  const response = await fetch(localUri);
  const blob = await response.blob();
  const storageRef = ref(storage, `logos_empresas/${uid}/logo.jpg`);
  // Aquí el nombre de archivo queda FIJO como "logo.jpg" dentro de la
  // carpeta del uid de la empresa (siempre se sobrescribe el mismo
  // archivo si la empresa cambia su logo).
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

// ══════════════════════════════════════════════════════════════════
//  Creación de grupos de estudiantes (universidad)
// ══════════════════════════════════════════════════════════════════

// Una "interface" de TypeScript describe la FORMA que debe tener un
// objeto (qué propiedades tiene y de qué tipo es cada una). No genera
// código real, solo ayuda a que el editor/TypeScript detecten errores.
export interface GrupoEstudiante {
  nombre: string;   // nombre completo del estudiante, tal como lo escribió la universidad
  email: string;    // correo con el que se le va a crear su cuenta de acceso
  tel: string;      // teléfono de contacto
  area: string;     // dirección/zona del estudiante
}

export interface GrupoStudentCreationResult {
  // Describe el resultado de intentar crear la cuenta de UN estudiante
  // dentro del grupo (puede salir bien o mal, por ejemplo si el correo ya
  // estaba registrado).
  email: string;
  password: string;    // la contraseña temporal generada para ese estudiante
  success: boolean;    // true si la cuenta se creó correctamente
  error?: string;       // el "?" indica que esta propiedad es OPCIONAL: solo
                        // existe si success es false, con un mensaje legible
                        // del motivo del fallo.
}

/** Genera una contraseña temporal robusta (mayúscula, minúscula y número). */
function generarPassword(): string {
  // Esta función arma una contraseña aleatoria de 10 caracteres para cada
  // estudiante nuevo, garantizando que tenga al menos una mayúscula, una
  // minúscula y un número (requisito típico de "contraseña segura").
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  // Letras mayúsculas, EXCLUYENDO la "I" y la "O" a propósito (se
  // parecen mucho a "1" y "0" y podrían confundir a un estudiante al
  // escribir su contraseña a mano).
  const lower = "abcdefghijkmnpqrstuvwxyz";
  // Minúsculas, excluyendo por el mismo motivo la "l" (parecida a "1").
  const nums = "23456789";
  // Números, excluyendo el "0" y el "1" por la misma razón de claridad.
  const all = upper + lower + nums;
  // Concatena (une) los tres grupos en un solo texto con todos los
  // caracteres posibles.
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
  // `pick` es una función auxiliar que elige UN carácter al azar de
  // cualquier texto que se le pase. Math.random() da un decimal entre 0
  // (incluido) y 1 (excluido); multiplicado por el largo del texto y
  // redondeado hacia abajo (Math.floor), da un índice válido y aleatorio
  // dentro de ese texto.
  let pass = pick(upper) + pick(lower) + pick(nums);
  // Empieza la contraseña garantizando UNA mayúscula, UNA minúscula y UN
  // número (así nunca falla el requisito mínimo, sin importar el azar).
  for (let i = 0; i < 7; i++) pass += pick(all);
  // Agrega 7 caracteres más, cualquiera de los tres grupos, hasta llegar
  // a 10 caracteres en total (3 + 7).
  // Mezclar
  return pass
    .split("")           // convierte el texto en un array de caracteres sueltos
    .sort(() => Math.random() - 0.5)  // los reordena al azar ("shuffle" simple)
    .join("");            // los vuelve a unir en un solo texto
  // Este paso final es importante: sin él, los primeros 3 caracteres
  // SIEMPRE seguirían el patrón "Mayúscula, minúscula, número", lo cual
  // sería predecible. Mezclarlos hace la contraseña más aleatoria.
}

function mapAuthError(code: string): string {
  // Traduce los códigos de error TÉCNICOS que devuelve Firebase Auth
  // (en inglés, tipo "auth/email-already-in-use") a mensajes legibles en
  // español para mostrar al usuario.
  if (code.includes("email-already-in-use")) return "El correo ya está registrado.";
  if (code.includes("invalid-email")) return "Correo con formato inválido.";
  if (code.includes("weak-password")) return "Contraseña demasiado débil.";
  return "No se pudo crear la cuenta del estudiante.";
  // Si el código de error no coincide con ninguno de los casos conocidos,
  // se devuelve un mensaje genérico en vez de mostrar el texto técnico en
  // inglés de Firebase.
}

/**
 * Crea un grupo en /grupos y registra a cada estudiante (Auth + Firestore).
 *
 * IMPORTANTE: `createUserWithEmailAndPassword` inicia sesión con la cuenta
 * recién creada. Para no expulsar a la universidad de su sesión, las cuentas
 * se crean con una **app Firebase secundaria** aislada que se elimina al final.
 *
 * Para volúmenes grandes lo ideal es hacerlo en Cloud Functions con el Admin SDK.
 */
export async function createGrupoWithStudents(params: {
  // Esta función recibe UN SOLO parámetro, pero es un objeto con varias
  // propiedades (un patrón muy común: en vez de 7 parámetros sueltos en
  // orden, se agrupan en un objeto para que sea más claro al llamarla).
  universidadId: string;   // uid de la universidad que está creando el grupo
  carrera: string;         // carrera a la que pertenece el grupo
  nombre: string;          // nombre del grupo (ej. "Ingeniería - Sección A")
  totalHoras: number;      // horas de práctica que debe completar cada estudiante
  fechaInicio?: string | null;
  fechaFin?: string | null;
  estudiantes: GrupoEstudiante[];   // la lista de estudiantes a registrar
  postulacion?: unknown;   // dato opcional, no se usa dentro de esta función
}): Promise<{ groupId: string; results: GrupoStudentCreationResult[] }> {
  // El tipo de retorno dice: esta función es asíncrona (Promise) y al
  // resolver entrega un objeto con el id del grupo creado y la lista de
  // resultados (uno por estudiante).
  const {
    universidadId,
    carrera,
    nombre,
    totalHoras,
    fechaInicio = null,
    fechaFin = null,
    estudiantes,
  } = params;
  // "Destructuring": extrae cada propiedad de `params` a su propia
  // variable, para no tener que escribir "params.nombre",
  // "params.carrera", etc. una y otra vez. "fechaInicio = null" y
  // "fechaFin = null" son VALORES POR DEFECTO: si el que llama a la
  // función no envía esas propiedades, se usan `null` automáticamente.

  // 1) Crear el documento del grupo.
  const grupoRef = await addDoc(collection(db, "grupos"), {
    // CREATE: agrega un documento nuevo a la colección "grupos" de
    // Firestore, con un ID autogenerado. `grupoRef` va a contener ese ID
    // (accesible como grupoRef.id, usado más abajo).
    universidad_id: universidadId,
    carrera,               // forma corta de "carrera: carrera" (mismo nombre de variable y propiedad)
    nombre,
    total_horas: totalHoras,
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin,
    estado: "Activo",
    estudiantes_count: estudiantes.length,
    fecha_creacion: serverTimestamp(),
  });

  // 2) App secundaria aislada para crear cuentas sin afectar la sesión actual.
  const secondaryApp = initializeApp(getApp().options, `Secondary-${Date.now()}`);
  // Este es el truco central del archivo. Problema: createUserWithEmailAndPassword
  // SIEMPRE inicia sesión automáticamente con la cuenta recién creada. Si
  // usáramos el `auth` PRINCIPAL de la app (el mismo de firebaseConfig.ts),
  // cada vez que se creara un estudiante nuevo, ¡LA UNIVERSIDAD SERÍA
  // DESCONECTADA de su propia sesión y quedaría logueada como ese
  // estudiante! Para evitarlo, se crea una SEGUNDA conexión de Firebase
  // completamente independiente ("secondaryApp"), usando las MISMAS
  // credenciales del proyecto (getApp().options las copia), pero con un
  // nombre distinto y único (`Secondary-${Date.now()}`, donde Date.now()
  // da la marca de tiempo actual en milisegundos, para que el nombre
  // nunca se repita). Así, las cuentas de estudiante se crean "en otra
  // sesión aparte" sin tocar la sesión real de la universidad.
  const secondaryAuth = getAuth(secondaryApp);
  // Obtiene el sistema de autenticación de ESA conexión secundaria (no el
  // de la app principal).

  const results: GrupoStudentCreationResult[] = [];
  // Array vacío donde se va a ir guardando el resultado de cada
  // estudiante (éxito o error).

  for (const est of estudiantes) {
    // Recorre la lista de estudiantes UNO POR UNO (no en paralelo, sino
    // en orden, gracias al "await" adentro del bucle).
    const email = est.email.trim().toLowerCase();
    // .trim() quita espacios accidentales al inicio/final;
    // .toLowerCase() pasa todo a minúsculas (los correos no distinguen
    // mayúsculas de minúsculas, y así se evitan duplicados como
    // "Juan@x.com" vs "juan@x.com").
    const password = generarPassword();
    // Genera una contraseña temporal única para este estudiante (función
    // explicada arriba).
    try {
      const cred = await createUserWithEmailAndPassword(
        secondaryAuth,
        email,
        password,
      );
      // CREATE (en Firebase Auth, no en Firestore todavía): crea la
      // cuenta de acceso del estudiante, usando la conexión secundaria.
      // `cred` contiene información de la cuenta recién creada.
      const uid = cred.user.uid;
      // El identificador único que Firebase Auth le asignó a esta nueva
      // cuenta — este mismo uid se va a usar como ID de sus documentos en
      // Firestore, para poder relacionar "cuenta de acceso" con "perfil
      // de datos" fácilmente.

      await setDoc(doc(db, "usuarios", uid), {
        // CREATE en Firestore: crea el documento base del usuario en la
        // colección "usuarios" (la que guarda datos comunes a TODOS los
        // roles: nombre, correo, rol, si está activo...), usando el uid
        // como ID del documento (así luego se puede buscar directo con
        // doc(db, "usuarios", uid) sin tener que hacer una búsqueda).
        uid,
        nombre_completo: est.nombre.trim(),
        correo: email,
        rol: "estudiante",
        activo: true,
        fecha_registro: serverTimestamp(),
      });

      await setDoc(doc(db, "perfiles_estudiantes", uid), {
        // CREATE en Firestore: crea el documento de PERFIL específico de
        // estudiante (datos propios de ese rol: carrera, horas objetivo,
        // habilidades...), en una colección separada
        // "perfiles_estudiantes", también usando el mismo uid como ID.
        // (Este patrón de "usuarios" + "perfiles_<rol>" separados se
        // repite para empresas y universidades en el resto del proyecto.)
        uid,
        nombre_completo: est.nombre.trim(),
        universidad_id: universidadId,
        grupo_id: grupoRef.id,     // enlaza este estudiante con el grupo creado en el paso 1
        carrera,
        telefono: est.tel.trim(),
        direccion: est.area.trim(),
        horas_objetivo: totalHoras,
        horas_aprobadas: 0,
        horas_en_proceso: 0,
        skills: [],
        foto_url: "",
        cv_url: "",
        calificacion_promedio: 0,
      });

      results.push({ email, password, success: true });
      // Si todo salió bien, se agrega un resultado exitoso a la lista,
      // incluyendo la contraseña temporal (la universidad necesita verla
      // para poder comunicársela al estudiante).
    } catch (err: any) {
      // Si algo falla (por ejemplo, el correo ya estaba registrado en
      // Firebase Auth), no se detiene todo el proceso: se registra el
      // error de ESTE estudiante y se sigue con el siguiente del bucle.
      results.push({
        email,
        password,
        success: false,
        error: mapAuthError(err?.code ?? ""),
        // "err?.code ?? ''" → si err.code existe, se usa; si no, cadena
        // vacía. mapAuthError() lo convierte en un mensaje legible.
      });
    }
  }

  // 3) Cerrar y eliminar la app secundaria.
  await signOut(secondaryAuth).catch(() => {});
  // Cierra la sesión que quedó abierta en la conexión secundaria (la del
  // ÚLTIMO estudiante creado, por el comportamiento automático de
  // createUserWithEmailAndPassword). ".catch(() => {})" ignora cualquier
  // error al cerrar sesión (no es crítico).
  await deleteApp(secondaryApp).catch(() => {});
  // Destruye por completo la conexión secundaria, liberando sus recursos
  // — ya cumplió su propósito.

  // Confirmación a la universidad (no bloquea la creación del grupo).
  try {
    const exitosos = results.filter((r) => r.success).length;
    // Cuenta cuántos estudiantes se registraron correctamente
    // (filter(...) se queda solo con los que tienen success === true, y
    // .length cuenta cuántos quedaron).
    await enviarNotificacion(
      universidadId,
      "Grupo creado",
      `El grupo "${nombre}" se creó con ${exitosos} estudiante(s) registrado(s).`,
      "success",
      `grupo:${grupoRef.id}`,
      // Este último argumento, `grupo:${grupoRef.id}`, es el "deep link":
      // un texto con el formato "tipo:id" que, al tocar la notificación,
      // le dice a la app qué modal abrir y con qué documento (ver
      // src/utils/notifRoute.ts y GUIA_04_NOTIFICACIONES.md).
    );
  } catch {
    /* la notificación no debe afectar el flujo principal */
    // Si el envío de la notificación fallara, no se quiere que ESO haga
    // fallar la creación del grupo (que ya se completó exitosamente) —
    // por eso el error se ignora aquí.
  }

  return { groupId: grupoRef.id, results };
  // Devuelve el ID del grupo recién creado y la lista completa de
  // resultados (uno por estudiante), para que la pantalla que llamó a
  // esta función pueda mostrar un resumen ("8 de 10 estudiantes
  // registrados, 2 fallaron porque su correo ya existía", por ejemplo).
}

/** Convierte cadenas vacías a null (helper de compatibilidad). */
export function toNullableString(v: string | null | undefined): string | null {
  // Función utilitaria pequeña: recibe un texto que podría ser null,
  // undefined, o una cadena (posiblemente vacía o solo con espacios), y
  // la "normaliza": si no tiene contenido real, devuelve null; si tiene
  // contenido, devuelve el texto ya limpio de espacios sobrantes. Se usa
  // en formularios donde un campo opcional vacío debe guardarse como
  // `null` en Firestore, no como cadena vacía "".
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t.length ? t : null;
  // "t.length ? t : null" → si el texto (ya sin espacios extra) tiene
  // algún carácter, se devuelve tal cual; si quedó vacío, se devuelve null.
}
