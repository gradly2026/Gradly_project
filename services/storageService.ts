import * as ImagePicker from "expo-image-picker";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { Alert } from "react-native";
import { db, storage } from "../src/config/firebaseConfig";

type PerfilTable = "talentos" | "empresas" | "universidades" | "alumnos";

// Mapea los nombres heredados de tabla a las colecciones Firestore.
const COLLECTION_MAP: Record<PerfilTable, string> = {
  talentos: "perfiles_estudiantes",
  alumnos: "perfiles_estudiantes",
  empresas: "perfiles_empresas",
  universidades: "perfiles_universidades",
};

/**
 * Selecciona una imagen de la galería y la sube a Firebase Storage.
 * `bucket` y `destinationPath` se combinan en la ruta: `${bucket}/${destinationPath}`.
 * Devuelve la URL de descarga (o el path si se prefiere algo privado).
 *
 * Fix Expo: se convierte la URI local (file://) a Blob con fetch antes de subir.
 */
export async function pickAndUploadImage(
  bucket: string,
  destinationPath: string,
): Promise<string | null> {
  try {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert(
        "Permiso denegado",
        "Necesitamos permiso para acceder a tu galería para seleccionar una imagen.",
      );
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.85,
    });

    if (result.canceled) return null;

    const uri = result.assets[0].uri;
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Error al leer la imagen local: ${response.status}`);
    }

    const blob = await response.blob();
    const storageRef = ref(storage, `${bucket}/${destinationPath}`);
    await uploadBytes(storageRef, blob);

    return getDownloadURL(storageRef);
  } catch (error: any) {
    Alert.alert(
      "Error subiendo imagen",
      error?.message || "Ocurrió un error al subir la imagen.",
    );
    console.error("pickAndUploadImage error", error);
    return null;
  }
}

export async function getProfilePhotoUrl(
  userId: string,
  table: PerfilTable,
): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db, COLLECTION_MAP[table], userId));
    if (!snap.exists()) return null;
    const data: any = snap.data();
    return data.foto_url ?? data.logo_url ?? data.foto_perfil ?? null;
  } catch (error) {
    console.error("getProfilePhotoUrl error", error);
    return null;
  }
}

export async function updateProfilePhoto(
  userId: string,
  table: PerfilTable,
  photoUrl: string,
): Promise<boolean> {
  try {
    await updateDoc(doc(db, COLLECTION_MAP[table], userId), {
      foto_url: photoUrl,
    });
    return true;
  } catch (error) {
    console.error("updateProfilePhoto error", error);
    return false;
  }
}

export async function updateUserProfile(
  userId: string,
  table: "talentos" | "alumnos",
  fields: Record<string, any>,
): Promise<boolean> {
  try {
    await updateDoc(doc(db, COLLECTION_MAP[table], userId), fields);
    return true;
  } catch (error: any) {
    console.error("updateUserProfile unexpected error", error);
    Alert.alert(
      "Error actualizando perfil",
      error?.message || "No se pudo actualizar el perfil.",
    );
    return false;
  }
}
