// Utilidades Firebase para uploads y creación de grupos.
// La autenticación de sesión vive en src/context/AuthContext.tsx
import { deleteApp, getApp, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
} from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../src/config/firebaseConfig";
import { enviarNotificacion } from "../src/services/notificationService";

// ══════════════════════════════════════════════════════════════════
//  Uploads a Firebase Storage (fix Blob para URIs locales de Expo)
// ══════════════════════════════════════════════════════════════════
export async function uploadPhoto(uid: string, localUri: string): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const storageRef = ref(storage, `fotos_perfil/${uid}`);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

export async function uploadCV(
  uid: string,
  localUri: string,
  filename: string,
): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const storageRef = ref(storage, `cvs/${uid}/${filename}`);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

export async function uploadLogo(uid: string, localUri: string): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const storageRef = ref(storage, `logos_empresas/${uid}/logo.jpg`);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

// ══════════════════════════════════════════════════════════════════
//  Creación de grupos de estudiantes (universidad)
// ══════════════════════════════════════════════════════════════════
export interface GrupoEstudiante {
  nombre: string;
  email: string;
  tel: string;
  area: string;
}

export interface GrupoStudentCreationResult {
  email: string;
  password: string;
  success: boolean;
  error?: string;
}

/** Genera una contraseña temporal robusta (mayúscula, minúscula y número). */
function generarPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const nums = "23456789";
  const all = upper + lower + nums;
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
  let pass = pick(upper) + pick(lower) + pick(nums);
  for (let i = 0; i < 7; i++) pass += pick(all);
  // Mezclar
  return pass
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}

function mapAuthError(code: string): string {
  if (code.includes("email-already-in-use")) return "El correo ya está registrado.";
  if (code.includes("invalid-email")) return "Correo con formato inválido.";
  if (code.includes("weak-password")) return "Contraseña demasiado débil.";
  return "No se pudo crear la cuenta del estudiante.";
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
  universidadId: string;
  carrera: string;
  nombre: string;
  totalHoras: number;
  fechaInicio?: string | null;
  fechaFin?: string | null;
  estudiantes: GrupoEstudiante[];
  postulacion?: unknown;
}): Promise<{ groupId: string; results: GrupoStudentCreationResult[] }> {
  const {
    universidadId,
    carrera,
    nombre,
    totalHoras,
    fechaInicio = null,
    fechaFin = null,
    estudiantes,
  } = params;

  // 1) Crear el documento del grupo.
  const grupoRef = await addDoc(collection(db, "grupos"), {
    universidad_id: universidadId,
    carrera,
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
  const secondaryAuth = getAuth(secondaryApp);

  const results: GrupoStudentCreationResult[] = [];

  for (const est of estudiantes) {
    const email = est.email.trim().toLowerCase();
    const password = generarPassword();
    try {
      const cred = await createUserWithEmailAndPassword(
        secondaryAuth,
        email,
        password,
      );
      const uid = cred.user.uid;

      await setDoc(doc(db, "usuarios", uid), {
        uid,
        nombre_completo: est.nombre.trim(),
        correo: email,
        rol: "estudiante",
        activo: true,
        fecha_registro: serverTimestamp(),
      });

      await setDoc(doc(db, "perfiles_estudiantes", uid), {
        uid,
        nombre_completo: est.nombre.trim(),
        universidad_id: universidadId,
        grupo_id: grupoRef.id,
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
    } catch (err: any) {
      results.push({
        email,
        password,
        success: false,
        error: mapAuthError(err?.code ?? ""),
      });
    }
  }

  // 3) Cerrar y eliminar la app secundaria.
  await signOut(secondaryAuth).catch(() => {});
  await deleteApp(secondaryApp).catch(() => {});

  // Confirmación a la universidad (no bloquea la creación del grupo).
  try {
    const exitosos = results.filter((r) => r.success).length;
    await enviarNotificacion(
      universidadId,
      "Grupo creado",
      `El grupo "${nombre}" se creó con ${exitosos} estudiante(s) registrado(s).`,
      "success",
      grupoRef.id,
    );
  } catch {
    /* la notificación no debe afectar el flujo principal */
  }

  return { groupId: grupoRef.id, results };
}

/** Convierte cadenas vacías a null (helper de compatibilidad). */
export function toNullableString(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t.length ? t : null;
}
