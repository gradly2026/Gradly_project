import emailjs from "@emailjs/browser";
import { Alert } from "react-native";
import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "../lib/supabase";

export type OptionalText = string | null | undefined;

export function toNullableString(value: OptionalText): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

type UserRole = "talento" | "empresa" | "universidad" | "estudiante";

async function createProfileRecord(params: {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  nombre?: string | null;
}) {
  try {
    const { error } = await supabase.from("profiles").insert({
      id: params.id,
      email: params.email,
      username: params.username,
      role: params.role,
      roll: params.role,
      nombre: params.nombre ?? null,
    });
    if (error) {
      console.warn("createProfileRecord warning", error);
    }
  } catch (err: any) {
    console.warn("createProfileRecord unexpected error", err);
  }
}

export async function resolveEmailFromUsername(
  username: string,
): Promise<string | null> {
  const normalized = username.trim();
  if (!normalized) return null;

  const sources = [
    { table: "profiles", select: "email", column: "username" },
    { table: "talentos", select: "email", column: "username" },
    { table: "empresas", select: "email_corporativo", column: "rep_username" },
  ] as const;

  for (const source of sources) {
    const { data, error } = await supabase
      .from(source.table)
      .select(source.select)
      .eq(source.column, normalized)
      .single();

    if (!error && data) {
      const emailValue = (data as any)[source.select];
      if (typeof emailValue === "string" && emailValue.trim()) {
        return emailValue;
      }
    }
  }

  return null;
}

const NETWORK_ALERT_MESSAGE =
  "Error de Conexión: No pudimos comunicarnos con el servidor. Verifica tu conexión a internet o desactiva temporalmente tu antivirus/firewall si estás en PC, e intenta nuevamente.";

function assertSupabaseCredentialsLoaded() {
  if (!SUPABASE_URL?.trim() || !SUPABASE_ANON_KEY?.trim()) {
    const message =
      "Configuración de Supabase incompleta. Verifica SUPABASE_URL y SUPABASE_ANON_KEY.";
    Alert.alert("Error de Configuración", message);
    throw new Error(message);
  }
}

function isNetworkError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  const name = String(error?.name || "").toLowerCase();
  return (
    message.includes("failed to fetch") ||
    name.includes("failed to fetch") ||
    message.includes("network request failed") ||
    name.includes("network request failed")
  );
}

export async function uploadImageIfExists(
  uri: OptionalText,
  bucket: string,
  destinationPath: string,
): Promise<string | null> {
  const normalizedUri = uri?.trim();
  const normalizedDestination = destinationPath?.trim();
  const normalizedBucket = bucket?.trim();

  if (!normalizedUri || !normalizedDestination || !normalizedBucket) {
    console.log(
      "uploadImageIfExists skipped because uri, bucket, or destinationPath was empty",
      { uri, bucket, destinationPath },
    );
    return null;
  }

  try {
    const response = await fetch(normalizedUri);
    if (!response.ok) {
      throw new Error(`Error al leer el archivo local: ${response.status}`);
    }

    const blob = await response.blob();
    const { error } = await supabase.storage
      .from(normalizedBucket)
      .upload(normalizedDestination, blob, { upsert: true });

    if (error) throw error;

    if (normalizedBucket === "private-docs") {
      return normalizedDestination;
    }

    const publicUrlResponse = await supabase.storage
      .from(normalizedBucket)
      .getPublicUrl(normalizedDestination);

    if (!publicUrlResponse.data?.publicUrl) {
      throw new Error("No se pudo obtener la URL pública del archivo.");
    }
    return publicUrlResponse.data.publicUrl;
  } catch (error: any) {
    const errorMessage =
      error?.message || "Error desconocido al subir la imagen.";
    Alert.alert("Error subiendo imagen", errorMessage);
    console.error("uploadImageIfExists error", error);
    throw error;
  }
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface TalentoData {
  email: string;
  password: string;
  nombre: string;
  username: string;
  telefono: string;
  departamento: string;
  ciudad: string;
  bio: string;
  habilidades: string;
  idiomas: { name: string; level: string }[];
  docTipo: string;
  docNumero: string;
  universidad: string;
  area: string;
  universidad2?: string | null;
  area2?: string | null;
  universidad3?: string | null;
  area3?: string | null;
  otroEstudio?: string | null;
  metodoPago?: string | null;
  fotoPerfilUri?: string | null;
  fotoDocUri?: string | null;
  instagram?: string | null;
  linkedin?: string | null;
  facebook?: string | null;
  github?: string | null;
  behance?: string | null;
}

export interface EmpresaData {
  email: string;
  password: string;
  username: string;
  nombre: string;
  industria: string;
  industriaOtro?: string | null;
  descripcion: string;
  departamento: string;
  ciudad: string;
  direccion?: string | null;
  telefono: string;
  emailCorporativo: string;
  web?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  tiktok?: string | null;
  planFacturacion?: string | null;
  planSeleccionado?: string | null;
  cardNum?: string | null;
  cardExp?: string | null;
  cardCvv?: string | null;
  repDui?: string | null;
  repNombre: string;
  repCargo: string;
  repEmail: string;
  repTelefono: string;
  repFacebook?: string | null;
  repInstagram?: string | null;
  fotoLogoUri?: string | null;
  fotoBannerUri?: string | null;
  fotoRepDuiUri?: string | null;
  fotoRepSelfieUri?: string | null;
  fotoRepUri?: string | null;
}

export interface CarreraData {
  nombre: string;
  duracion: string;
  modalidad: string;
  coordinador: string;
}

export interface UniversidadData {
  email: string;
  password: string;
  username: string;
  nombre: string;
  departamento: string;
  ciudad: string;
  direccion?: string | null;
  emailInstitucional: string;
  web?: string | null;
  telefono: string;
  descripcion?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  github?: string | null;
  behance?: string | null;
  fotoLogoUri?: string | null;
  fotoBannerUri?: string | null;
  fotoRectorDocUri?: string | null;
  fotoRectorSelfieUri?: string | null;
  fotoEncUri?: string | null;
  rectorNombre: string;
  rectorDocTipo: string;
  rectorDocNumero: string;
  carreras: CarreraData[];
  encNombre: string;
  encTelefono: string;
  encEmail: string;
  encInstagram?: string | null;
  encLinkedin?: string | null;
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
/**
 * Inicia sesión con correo electrónico o nombre de usuario.
 * Soporta login con ambos métodos:
 * - Email directo (ej: usuario@example.com)
 * - Nombre de usuario (busca el email asociado en la tabla 'profiles')
 *
 * @param emailOrUsername - Email o nombre de usuario del usuario
 * @param password - Contraseña del usuario
 * @returns Objeto con el rol del usuario para redirigir a la pantalla correcta
 * @throws Error si el login falla o no existen credenciales
 */
export async function loginUser(
  emailOrUsername: string,
  password: string,
): Promise<{ role: string }> {
  try {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
    let email = emailOrUsername.trim();

    // Si no es un correo, buscar el email asociado al nombre de usuario
    if (!emailRegex.test(email)) {
      const resolvedEmail = await resolveEmailFromUsername(email);
      if (!resolvedEmail) {
        throw new Error("Credenciales de inicio de sesión inválidas");
      }
      email = resolvedEmail;
    }

    // Autenticar con el email y contraseña
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (authError) throw authError;
    if (!authData.user) throw new Error("No se pudo iniciar sesión");

    // El rol se guarda en user_metadata al momento del registro
    const role: string = authData.user.user_metadata?.role ?? "talento";
    return { role };
  } catch (error: any) {
    const errorMessage =
      error?.message || "Error desconocido al iniciar sesión";
    throw new Error(errorMessage);
  }
}

// ── REGISTRO TALENTO ──────────────────────────────────────────────────────────
/**
 * Registra un nuevo talento (usuario individual).
 * Crea:
 * 1. Cuenta de autenticación en Supabase Auth
 * 2. Perfil completo del talento en la tabla 'profiles' con todos sus datos
 */
export async function registerTalento(data: TalentoData) {
  try {
    // Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          role: "talento",
          nombre: data.nombre,
          username: data.username,
        },
      },
    });

    if (authError) {
      const authMessage =
        authError.message || "Error de autenticación al crear la cuenta.";
      Alert.alert("Error de Autenticación", authMessage);
      console.error("registerTalento authError", authError);
      throw authError;
    }

    if (!authData.user)
      throw new Error("No se pudo crear la cuenta de usuario.");

    const userId = authData.user.id;

    await createProfileRecord({
      id: userId,
      email: data.email,
      username: data.username,
      role: "talento",
      nombre: data.nombre,
    });

    // Storage
    let fotoPerfilUrl: string | null = null;
    let fotoDocUrl: string | null = null;

    try {
      if (data.fotoPerfilUri?.trim() !== "") {
        fotoPerfilUrl = await uploadImageIfExists(
          data.fotoPerfilUri,
          "public-media",
          `${userId}/${Date.now()}-foto_perfil.jpg`,
        );
      }

      if (data.fotoDocUri?.trim() !== "") {
        fotoDocUrl = await uploadImageIfExists(
          data.fotoDocUri,
          "private-docs",
          `private/${userId}/${Date.now()}-foto_doc.jpg`,
        );
      }
    } catch (storageError: any) {
      const storageMessage =
        storageError?.message || "Error al subir archivos del talento.";
      Alert.alert("Error de Storage", storageMessage);
      console.error("registerTalento storageError", storageError);
      throw storageError;
    }

    // DB insert
    const talentoPayload = {
      id: userId,
      nombre: data.nombre,
      username: data.username,
      email: data.email,
      telefono: data.telefono,
      departamento: data.departamento,
      ciudad: data.ciudad,
      bio: data.bio,
      instagram: toNullableString(data.instagram),
      linkedin: toNullableString(data.linkedin),
      facebook: toNullableString(data.facebook),
      github: toNullableString(data.github),
      idiomas: data.idiomas,
      habilidades: toNullableString(data.habilidades),
      doc_tipo: data.docTipo,
      doc_numero: data.docNumero,
      universidad: toNullableString(data.universidad),
      area: toNullableString(data.area),
      universidad_2: toNullableString(data.universidad2),
      area_2: toNullableString(data.area2),
      universidad_3: toNullableString(data.universidad3),
      area_3: toNullableString(data.area3),
      otro_estudio: toNullableString(data.otroEstudio),
      metodo_pago: toNullableString(data.metodoPago),
      foto_perfil: fotoPerfilUrl,
      foto_doc: fotoDocUrl,
      created_at: new Date().toISOString(),
    };

    console.log("registerTalento payload:", talentoPayload);

    const { error: talentoError } = await supabase
      .from("talentos")
      .insert(talentoPayload);

    if (talentoError) {
      Alert.alert(
        "Error guardando datos",
        talentoError.message || "No se pudo guardar el talento.",
      );
      console.error("registerTalento insertError", talentoError);
      throw talentoError;
    }

    return authData;
  } catch (error: any) {
    const errorMessage =
      error?.message || "Error desconocido al registrar el talento";
    throw new Error(errorMessage);
  }
}

// ── REGISTRO EMPRESA ──────────────────────────────────────────────────────────
/**
 * Registra una nueva empresa.
 * Crea:
 * 1. Cuenta de autenticación en Supabase Auth (con datos del representante)
 * 2. Perfil del representante en la tabla 'profiles'
 * 3. Registro de la empresa en la tabla 'empresas' con todos sus datos
 */
export async function registerEmpresa(data: EmpresaData) {
  try {
    assertSupabaseCredentialsLoaded();

    let authData;
    try {
      const { data: signUpData, error: authError } = await supabase.auth.signUp(
        {
          email: data.email,
          password: data.password,
          options: {
            data: {
              role: "empresa",
              nombre: data.repNombre,
              username: data.username,
            },
          },
        },
      );

      if (authError) {
        if (isNetworkError(authError)) {
          Alert.alert("Error de Conexión", NETWORK_ALERT_MESSAGE);
          console.error("registerEmpresa networkError", authError);
          throw new Error(NETWORK_ALERT_MESSAGE);
        }

        const authMessage =
          authError.message || "Error de autenticación al crear la cuenta.";
        Alert.alert("Error de Autenticación", authMessage);
        console.error("registerEmpresa authError", authError);
        throw authError;
      }

      authData = signUpData;
    } catch (error: any) {
      if (isNetworkError(error)) {
        Alert.alert("Error de Conexión", NETWORK_ALERT_MESSAGE);
        console.error("registerEmpresa networkError", error);
        throw new Error(NETWORK_ALERT_MESSAGE);
      }
      throw error;
    }

    if (!authData?.user)
      throw new Error("No se pudo crear la cuenta de usuario.");

    const userId = authData.user.id;

    await createProfileRecord({
      id: userId,
      email: data.email,
      username: data.username,
      role: "empresa",
      nombre: data.repNombre,
    });

    // Storage
    let fotoLogoUrl: string | null = null;
    let fotoBannerUrl: string | null = null;
    let fotoRepDuiUrl: string | null = null;
    let fotoRepSelfieUrl: string | null = null;
    let fotoRepUrl: string | null = null;

    try {
      if (data.fotoLogoUri?.trim() !== "") {
        fotoLogoUrl = await uploadImageIfExists(
          data.fotoLogoUri,
          "public-media",
          `${userId}/${Date.now()}-foto_logo.jpg`,
        );
      }

      if (data.fotoBannerUri?.trim() !== "") {
        fotoBannerUrl = await uploadImageIfExists(
          data.fotoBannerUri,
          "public-media",
          `${userId}/${Date.now()}-foto_banner.jpg`,
        );
      }

      if (data.fotoRepDuiUri?.trim() !== "") {
        fotoRepDuiUrl = await uploadImageIfExists(
          data.fotoRepDuiUri,
          "private-docs",
          `private/${userId}/${Date.now()}-foto_rep_dui.jpg`,
        );
      }

      if (data.fotoRepSelfieUri?.trim() !== "") {
        fotoRepSelfieUrl = await uploadImageIfExists(
          data.fotoRepSelfieUri,
          "private-docs",
          `private/${userId}/${Date.now()}-foto_rep_selfie.jpg`,
        );
      }

      if (data.fotoRepUri?.trim() !== "") {
        fotoRepUrl = await uploadImageIfExists(
          data.fotoRepUri,
          "private-docs",
          `private/${userId}/${Date.now()}-foto_rep.jpg`,
        );
      }
    } catch (storageError: any) {
      const storageMessage =
        storageError?.message || "Error al subir archivos de la empresa.";
      Alert.alert("Error de Storage", storageMessage);
      console.error("registerEmpresa storageError", storageError);
      throw storageError;
    }

    const empresaPayload = {
      id: userId,
      nombre: data.nombre,
      industria: data.industria,
      industria_otro: toNullableString(data.industriaOtro),
      descripcion: toNullableString(data.descripcion),
      departamento: data.departamento,
      ciudad: data.ciudad,
      direccion: toNullableString(data.direccion),
      telefono: data.telefono,
      email_corporativo: data.emailCorporativo,
      web: toNullableString(data.web),
      instagram: toNullableString(data.instagram),
      facebook: toNullableString(data.facebook),
      plan_facturacion: toNullableString(data.planFacturacion),
      plan_seleccionado: toNullableString(data.planSeleccionado),
      card_num: toNullableString(data.cardNum),
      card_exp: toNullableString(data.cardExp),
      card_cvv: toNullableString(data.cardCvv),
      rep_dui: toNullableString(data.repDui),
      rep_nombre: data.repNombre,
      rep_cargo: data.repCargo,
      rep_email: data.repEmail,
      rep_telefono: data.repTelefono,
      rep_username: data.username,
      rep_facebook: toNullableString(data.repFacebook),
      rep_instagram: toNullableString(data.repInstagram),
      foto_logo: fotoLogoUrl,
      foto_banner: fotoBannerUrl,
      foto_rep_dui: fotoRepDuiUrl,
      foto_rep_selfie: fotoRepSelfieUrl,
      foto_rep: fotoRepUrl,
      created_at: new Date().toISOString(),
    };

    console.log("registerEmpresa payload:", empresaPayload);

    const { error: empresaError } = await supabase
      .from("empresas")
      .insert(empresaPayload);

    if (empresaError) {
      Alert.alert(
        "Error guardando datos",
        empresaError.message || "No se pudo guardar la empresa.",
      );
      console.error("registerEmpresa insertError", empresaError);
      throw empresaError;
    }

    return authData;
  } catch (error: any) {
    const errorMessage =
      error?.message || "Error desconocido al registrar la empresa";
    throw new Error(errorMessage);
  }
}

// ── REGISTRO UNIVERSIDAD ──────────────────────────────────────────────────────
/**
 * Registra una nueva institución de educación superior.
 * Crea:
 * 1. Cuenta de autenticación en Supabase Auth
 * 2. Perfil del encargado en la tabla 'profiles'
 * 3. Registro de la universidad en la tabla 'universidades' con datos del rector y encargado
 */
export async function registerUniversidad(data: UniversidadData) {
  try {
    assertSupabaseCredentialsLoaded();

    let authData;
    try {
      const { data: signUpData, error: authError } = await supabase.auth.signUp(
        {
          email: data.email,
          password: data.password,
          options: {
            data: {
              role: "universidad",
              nombre: data.encNombre,
              username: data.username,
            },
          },
        },
      );

      if (authError) {
        if (isNetworkError(authError)) {
          Alert.alert("Error de Conexión", NETWORK_ALERT_MESSAGE);
          console.error("registerUniversidad networkError", authError);
          throw new Error(NETWORK_ALERT_MESSAGE);
        }

        const authMessage =
          authError.message || "Error de autenticación al crear la cuenta.";
        Alert.alert("Error de Autenticación", authMessage);
        console.error("registerUniversidad authError", authError);
        throw authError;
      }

      authData = signUpData;
    } catch (error: any) {
      if (isNetworkError(error)) {
        Alert.alert("Error de Conexión", NETWORK_ALERT_MESSAGE);
        console.error("registerUniversidad networkError", error);
        throw new Error(NETWORK_ALERT_MESSAGE);
      }
      throw error;
    }

    if (!authData?.user)
      throw new Error("No se pudo crear la cuenta de usuario.");

    const userId = authData.user.id;

    await createProfileRecord({
      id: userId,
      email: data.email,
      username: data.username,
      role: "universidad",
      nombre: data.encNombre,
    });

    let fotoLogoUrl: string | null = null;
    let fotoBannerUrl: string | null = null;
    let fotoRectorDocUrl: string | null = null;
    let fotoRectorSelfieUrl: string | null = null;
    let fotoEncUrl: string | null = null;

    try {
      if (data.fotoLogoUri?.trim() !== "") {
        fotoLogoUrl = await uploadImageIfExists(
          data.fotoLogoUri,
          "public-media",
          `${userId}/${Date.now()}-foto_logo.jpg`,
        );
      }
      if (data.fotoBannerUri?.trim() !== "") {
        fotoBannerUrl = await uploadImageIfExists(
          data.fotoBannerUri,
          "public-media",
          `${userId}/${Date.now()}-foto_banner.jpg`,
        );
      }
      if (data.fotoRectorDocUri?.trim() !== "") {
        fotoRectorDocUrl = await uploadImageIfExists(
          data.fotoRectorDocUri,
          "private-docs",
          `private/${userId}/${Date.now()}-foto_rector_doc.jpg`,
        );
      }
      if (data.fotoRectorSelfieUri?.trim() !== "") {
        fotoRectorSelfieUrl = await uploadImageIfExists(
          data.fotoRectorSelfieUri,
          "private-docs",
          `private/${userId}/${Date.now()}-foto_rector_selfie.jpg`,
        );
      }
      if (data.fotoEncUri?.trim() !== "") {
        fotoEncUrl = await uploadImageIfExists(
          data.fotoEncUri,
          "public-media",
          `${userId}/${Date.now()}-foto_enc.jpg`,
        );
      }
    } catch (storageError: any) {
      const storageMessage =
        storageError?.message || "Error al subir archivos de la universidad.";
      Alert.alert("Error de Storage", storageMessage);
      console.error("registerUniversidad storageError", storageError);
      throw storageError;
    }

    // DB insert
    const universidadPayload = {
      id: userId,
      nombre: data.nombre,
      departamento: data.departamento,
      ciudad: data.ciudad,
      direccion: toNullableString(data.direccion),
      email_institucional: data.emailInstitucional,
      web: toNullableString(data.web),
      telefono: data.telefono,
      descripcion: toNullableString(data.descripcion),
      instagram: toNullableString(data.instagram),
      tiktok: toNullableString(data.tiktok),
      github: toNullableString(data.github),
      behance: toNullableString(data.behance),
      foto_logo: fotoLogoUrl,
      foto_banner: fotoBannerUrl,
      foto_rector_doc: fotoRectorDocUrl,
      foto_rector_selfie: fotoRectorSelfieUrl,
      foto_enc: fotoEncUrl,
      rector_nombre: data.rectorNombre,
      rector_doc_tipo: data.rectorDocTipo,
      rector_doc_numero: data.rectorDocNumero,
      enc_nombre: data.encNombre,
      enc_telefono: data.encTelefono,
      enc_email: data.encEmail,
      enc_instagram: toNullableString(data.encInstagram),
      enc_linkedin: toNullableString(data.encLinkedin),
      carreras: data.carreras,
      created_at: new Date().toISOString(),
    };

    console.log("registerUniversidad payload:", universidadPayload);

    const { error: univError } = await supabase
      .from("universidades")
      .insert(universidadPayload);

    if (univError) {
      Alert.alert(
        "Error guardando datos",
        univError.message || "No se pudo guardar la universidad.",
      );
      console.error("registerUniversidad insertError", univError);
      throw univError;
    }

    return authData;
  } catch (error: any) {
    const errorMessage =
      error?.message || "Error desconocido al registrar la universidad";
    throw new Error(errorMessage);
  }
}

// ── UTILIDADES ────────────────────────────────────────────────────────────────
/**
 * Cierra la sesión del usuario actual
 */
export async function logout(): Promise<void> {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (error: any) {
    const errorMessage = error?.message || "Error desconocido al cerrar sesión";
    throw new Error(errorMessage);
  }
}

/**
 * Obtiene el usuario autenticado actualmente
 * @returns Usuario actual o null si no hay sesión activa
 */
export async function getCurrentUser() {
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) throw error;
    return user;
  } catch (error: any) {
    const errorMessage =
      error?.message || "Error desconocido al obtener usuario";
    throw new Error(errorMessage);
  }
}

/**
 * Obtiene la sesión actual del usuario
 * @returns Sesión actual o null si no hay sesión activa
 */
export async function getSession() {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) throw error;
    return session;
  } catch (error: any) {
    const errorMessage =
      error?.message || "Error desconocido al obtener sesión";
    throw new Error(errorMessage);
  }
}

export interface GrupoEstudiante {
  nombre: string;
  email: string;
  tel: string;
  area: string;
}

export interface GrupoPostulacion {
  empresa: string;
  periodoInicio: string;
  periodoFin: string;
  descripcion: string;
  reglamento: string;
  horasRequeridas: string;
}

export interface GrupoStudentCreationResult {
  email: string;
  password: string;
  success: boolean;
  error?: string;
  userId?: string | null;
  emailSent?: boolean;
  emailError?: string;
}

export interface CreateGrupoWithStudentsResponse {
  groupId: string;
  results: GrupoStudentCreationResult[];
}

function randomFromArray<T>(values: T[]) {
  return values[Math.floor(Math.random() * values.length)];
}

export function generateStudentPassword(name: string) {
  const cleanName = name.replace(/[^a-zA-Z]/g, "").toLowerCase();
  const letters = cleanName.split("");
  const pool = letters.length ? letters : ["a", "b", "c", "d", "e", "f"];
  const selectedLetters: string[] = [];

  while (selectedLetters.length < 5) {
    selectedLetters.push(randomFromArray(pool));
  }

  const upperIndex = Math.floor(Math.random() * selectedLetters.length);
  selectedLetters[upperIndex] = selectedLetters[upperIndex].toUpperCase();

  const digits = Array.from({ length: 2 }, () =>
    String(Math.floor(Math.random() * 10)),
  );
  const special = "$";

  const passwordChars = [...selectedLetters, ...digits, special];
  return passwordChars.join("");
}

export async function createGrupoWithStudents(
  payload: CreateGrupoPayload,
): Promise<CreateGrupoWithStudentsResponse> {
  const group = await createGrupo(payload);
  const results: GrupoStudentCreationResult[] = [];

  for (const student of payload.estudiantes) {
    const password = generateStudentPassword(student.nombre || "estudiante");
    console.log(
      "[createGrupoWithStudents] contraseña generada:",
      student.email,
      password,
    );

    const { data: authData, error: signupError } = await supabase.auth.signUp({
      email: student.email,
      password,
      options: {
        data: {
          role: "estudiante",
          nombre: student.nombre,
          universidad_id: payload.universidadId,
          grupo_id: group.id,
        },
      },
    });

    const authSuccess = !signupError;
    const userId = authData?.user?.id ?? null;

    let alumnoInsertError: any = null;
    if (userId) {
      const { error } = await supabase.from("alumnos").upsert(
        {
          id: userId,
          user_id: userId,
          universidad_id: payload.universidadId,
          nombre: student.nombre,
          nombre_completo: student.nombre,
          email: student.email,
          carrera: payload.carrera,
          created_at: new Date().toISOString(),
        } as any,
        { onConflict: "id" },
      );
      alumnoInsertError = error;
    }

    try {
      await supabase.from("estudiantes").insert({
        universidad_id: payload.universidadId,
        grupo_id: group.id,
        nombre_completo: student.nombre,
        email: student.email,
        matricula: payload.carrera,
      } as any);
    } catch (e: any) {
      console.error("Error insertando estudiante:", e?.message ?? e);
    }

    const insertSuccess = !alumnoInsertError;

    let emailSent = false;
    let emailError: string | undefined;

    if (authSuccess) {
      try {
        const estudiante = {
          nombre_completo: student.nombre,
          email: student.email,
        };
        const nombreGrupo = payload.nombre;
        const datosUniversidad = await getUniversityById(payload.universidadId);
        const passwordGeneradaTemporal = password;
        const loginUrl = "https://gradly.app/iniciar-sesion";

        await emailjs.send(
          "service_xkdrpfa",
          "__ejs-test-mail-service__",
          {
            to_email: estudiante.email,
            correo_alumno: estudiante.email,
            student_email: estudiante.email,
            nombre_alumno: estudiante.nombre_completo,
            nombre_grupo: nombreGrupo,
            nombre_universidad: datosUniversidad?.nombre ?? "",
            password_generada: passwordGeneradaTemporal,
            login_url: loginUrl,
          },
          "8ivlbrxojkAxQ5IR0",
        );
        emailSent = true;
      } catch (emailErrorRaw: any) {
        emailError =
          emailErrorRaw?.message ||
          String(emailErrorRaw) ||
          "Error desconocido al enviar correo.";
        console.error("Error enviando correo a:", student.email, emailErrorRaw);
      }
    }

    results.push({
      email: student.email,
      password,
      success: insertSuccess,
      error:
        alumnoInsertError?.message ||
        signupError?.message ||
        emailError ||
        undefined,
      userId,
      emailSent,
      emailError,
    });
  }

  return { groupId: group.id, results };
}

export interface CreateGrupoPayload {
  universidadId: string;
  carrera: string;
  nombre: string;
  totalHoras: number;
  estudiantes: GrupoEstudiante[];
  postulacion: GrupoPostulacion | null;
}

export async function createGrupo(payload: CreateGrupoPayload) {
  try {
    const groupInsert: Record<string, unknown> = {
      universidad_id: payload.universidadId,
      nombre_grupo: payload.nombre,
      especialidad: payload.carrera,
    };

    const { data, error } = await supabase
      .from("grupos")
      .insert(groupInsert)
      .select("id")
      .single();

    if (error || !data) {
      Alert.alert(
        "Error creando grupo",
        error?.message || "No se pudo crear el grupo.",
      );
      console.error("createGrupo error", error);
      throw error || new Error("No se pudo crear el grupo.");
    }

    return data as { id: string };
  } catch (error: any) {
    const errorMessage =
      error?.message || "Error desconocido al crear el grupo";
    throw new Error(errorMessage);
  }
}

export async function getUserData(
  userId: string,
): Promise<{ nombreUniv?: string; encNombre?: string } | null> {
  try {
    const { data, error } = await supabase
      .from("universidades")
      .select("nombre, enc_nombre")
      .eq("id", userId)
      .single();

    if (error || !data) {
      console.error("getUserData error", error);
      return null;
    }

    return {
      nombreUniv: data.nombre ?? undefined,
      encNombre: data.enc_nombre ?? undefined,
    };
  } catch (error: any) {
    console.error("getUserData unexpected error", error);
    return null;
  }
}

/**
 * Obtiene el registro completo de una universidad por su ID
 * @param id - ID de la universidad (user id)
 */
export async function getUniversityById(id: string) {
  try {
    const { data, error } = await supabase
      .from("universidades")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("getUniversityById error", error);
      return null;
    }
    return data;
  } catch (error: any) {
    console.error("getUniversityById unexpected error", error);
    return null;
  }
}

/**
 * Actualiza campos de la tabla 'universidades' para la universidad especificada
 * @param id - ID de la universidad
 * @param payload - campos a actualizar
 */
export async function updateUniversidad(
  id: string,
  payload: Record<string, any>,
) {
  try {
    assertSupabaseCredentialsLoaded();
    const { data, error } = await supabase
      .from("universidades")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("updateUniversidad error", error);
      throw error;
    }
    return data;
  } catch (error: any) {
    console.error("updateUniversidad unexpected error", error);
    throw error;
  }
}
