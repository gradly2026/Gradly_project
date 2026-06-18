import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  initializeAuth,
  type Auth,
} from "firebase/auth";
// getReactNativePersistence existe en el build de React Native aunque su tipo
// no se exporte en algunas versiones de firebase; lo importamos por separado.
// @ts-expect-error - falta la declaración de tipos, no el símbolo en runtime
import { getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { Platform } from "react-native";

// Credenciales reales del proyecto e1a2a
const firebaseConfig = {
  apiKey: "AIzaSyDU5GwYZIxqOYoOCZrpJfXYNK3XpoIQLSQ",
  authDomain: "gradly-e1a2a.firebaseapp.com",
  projectId: "gradly-e1a2a",
  storageBucket: "gradly-e1a2a.firebasestorage.app",
  messagingSenderId: "310178316831",
  appId: "1:310178316831:web:e626bac6368549df824b2a",
  measurementId: "G-NEC63F18E1",
};

// getApps() evita el crash "Firebase App '[DEFAULT]' already exists" al recargar.
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

/**
 * Auth robusto en las tres plataformas:
 *  - Web   → browserLocalPersistence (getReactNativePersistence NO funciona en web).
 *  - Nativo→ AsyncStorage vía getReactNativePersistence.
 *  - Hot reload → si ya estaba inicializado, initializeAuth lanza y reutilizamos getAuth.
 */
const auth: Auth = (() => {
  try {
    return initializeAuth(app, {
      persistence:
        Platform.OS === "web"
          ? browserLocalPersistence
          : getReactNativePersistence(AsyncStorage),
    });
  } catch {
    return getAuth(app);
  }
})();

const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage, firebaseConfig };
