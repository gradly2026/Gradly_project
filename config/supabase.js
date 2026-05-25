import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import "react-native-url-polyfill/auto";

/**
 * Valores de configuración de Supabase
 * ⚠️ IMPORTANTE: Para producción, utiliza variables de entorno (.env)
 * Reemplaza estos valores con los de tu proyecto Supabase
 */
const supabaseUrl = "https://kbevyjupphyxrgcvdsgv.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtiZXZ5anVwcGh5eHJnY3Zkc2d2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2ODgwNjQsImV4cCI6MjA5NDI2NDA2NH0.N8XddTP5R-34S2OZXc0vsxGklD64X9mLBhNl9apfaqQ";
  

/**
 * Cliente de Supabase configurado
 * Utiliza AsyncStorage para persistencia de sesión en React Native
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
