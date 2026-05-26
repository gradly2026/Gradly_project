import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Valores de configuración de Supabase
 * IMPORTANTE: Para producción, utiliza variables de entorno (.env)
 * Reemplaza estos valores con los de tu proyecto Supabase
 */
export const SUPABASE_URL = "https://kbevyjupphyxrgcvdsgv.supabase.co";
export const SUPABASE_ANON_KEY =
  "sb_publishable_-CLkZKX7jyJuzOA0QEG4uQ_JopGLyhE";

/**
 * Adaptador de almacenamiento seguro para iOS/Android
 * Utiliza expo-secure-store para encriptar las sesiones de autenticación
 */
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

/**
 * Cliente de Supabase configurado
 * - En web: utiliza localStorage (por defecto)
 * - En móvil: utiliza expo-secure-store para almacenamiento encriptado
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage:
      Platform.OS === "web" ? undefined : (ExpoSecureStoreAdapter as any),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
