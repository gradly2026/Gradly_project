import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";

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

    if (result.canceled) {
      return null;
    }

    const uri = result.assets[0].uri;
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Error al leer la imagen local: ${response.status}`);
    }

    const blob = await response.blob();
    const { error } = await supabase.storage
      .from(bucket)
      .upload(destinationPath, blob, { upsert: true });

    if (error) {
      throw error;
    }

    if (bucket === "public-media") {
      const { data } = supabase.storage
        .from(bucket)
        .getPublicUrl(destinationPath);

      if (!data?.publicUrl) {
        throw new Error("No se pudo obtener la URL pública.");
      }

      return data.publicUrl;
    }

    if (bucket === "private-docs") {
      return destinationPath;
    }

    return destinationPath;
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
  table: "talentos" | "empresas" | "universidades" | "alumnos",
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from(table)
      .select("foto_perfil")
      .eq("id", userId)
      .single();

    if (error || !data) {
      return null;
    }

    return data.foto_perfil ?? null;
  } catch (error) {
    console.error("getProfilePhotoUrl error", error);
    return null;
  }
}

export async function updateProfilePhoto(
  userId: string,
  table: "talentos" | "empresas" | "universidades" | "alumnos",
  photoUrl: string,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from(table)
      .update({ foto_perfil: photoUrl })
      .eq("id", userId);

    if (error) {
      console.error("updateProfilePhoto error", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("updateProfilePhoto unexpected error", error);
    return false;
  }
}

export async function updateUserProfile(
  userId: string,
  table: "talentos" | "alumnos",
  fields: Record<string, any>,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from(table)
      .update(fields)
      .eq("id", userId);
    if (error) {
      console.error("updateUserProfile error", error);
      Alert.alert(
        "Error actualizando perfil",
        error.message || "No se pudo actualizar el perfil.",
      );
      return false;
    }

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
