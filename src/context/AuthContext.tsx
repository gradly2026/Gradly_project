import {
  createContext,
  useContext,
  useEffect,
  useState,
  type FC,
  type ReactNode,
} from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { AppState } from 'react-native';
import { auth, db } from '../config/firebaseConfig';
import { obtenerRolConReintento } from '../utils/roleRouting';

// ═══════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════
export type UserRole = 'estudiante' | 'empresa' | 'universidad' | 'admin';

export interface UserProfile {
  nombre_completo: string;
  correo: string;
  rol: UserRole;
  fecha_registro: unknown;
  activo: boolean;
}

interface AuthContextValue {
  /** Usuario de Firebase Auth (null si no está autenticado) */
  user: User | null;
  /** Documento de /usuarios/{uid} en Firestore */
  userProfile: UserProfile | null;
  /** Rol leído de Firestore */
  rol: UserRole | null;
  /** True mientras se verifica el estado de sesión inicial */
  isLoading: boolean;
  /** Cierra la sesión en Firebase Auth */
  logout: () => Promise<void>;
  /** Vuelve a leer el perfil de Firestore (útil tras editar datos) */
  refreshProfile: () => Promise<void>;
}

// ═══════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════
const AuthContext = createContext<AuthContextValue>({
  user: null,
  userProfile: null,
  rol: null,
  isLoading: true,
  logout: async () => {},
  refreshProfile: async () => {},
});

// ═══════════════════════════════════════════
// PROVIDER
// ═══════════════════════════════════════════
export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [rol, setRol] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = async (uid: string): Promise<void> => {
    try {
      const snap = await getDoc(doc(db, 'usuarios', uid));
      if (snap.exists()) {
        const data = snap.data() as UserProfile;
        setUserProfile(data);
        setRol(data.rol ?? null);
        return;
      }
    } catch {
      // Cae al reintento de abajo (carrera de propagación token/replicación).
    }
    // El documento puede no existir aún justo después del registro o la
    // primera lectura puede fallar por la carrera del token: reintentamos
    // antes de rendirnos. NUNCA degradamos a un rol por defecto.
    const rolReintentado = await obtenerRolConReintento(uid);
    setRol(rolReintentado);
    if (!rolReintentado) setUserProfile(null);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        await fetchProfile(firebaseUser.uid);
      } else {
        setUserProfile(null);
        setRol(null);
      }
      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  // ═══════════════════════════════════════════
  // PRESENCIA (heartbeat → punto verde en el chat)
  // ═══════════════════════════════════════════
  // Firestore no tiene onDisconnect (eso es RTDB), así que mantenemos
  // `usuarios/{uid}.status` + `lastSeen` con un heartbeat mientras la app está
  // activa y marcamos `offline` al pasar a segundo plano o cerrar sesión.
  useEffect(() => {
    if (!user?.uid) return;
    const ref = doc(db, 'usuarios', user.uid);

    const escribir = (status: 'online' | 'offline') => {
      // merge: nunca pisa el resto del perfil; tolera doc inexistente.
      void setDoc(
        ref,
        { status, lastSeen: serverTimestamp() },
        { merge: true },
      ).catch(() => {});
    };

    escribir('online');
    // Heartbeat: refresca lastSeen para que "última vez" se mantenga fresca.
    const heartbeat = setInterval(() => escribir('online'), 45000);

    const sub = AppState.addEventListener('change', (state) => {
      escribir(state === 'active' ? 'online' : 'offline');
    });

    return () => {
      clearInterval(heartbeat);
      sub.remove();
      escribir('offline');
    };
  }, [user?.uid]);

  const logout = async (): Promise<void> => {
    await signOut(auth);
    setUser(null);
    setUserProfile(null);
    setRol(null);
  };

  const refreshProfile = async (): Promise<void> => {
    if (user) {
      await fetchProfile(user.uid);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, userProfile, rol, isLoading, logout, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
};

/** Hook principal de autenticación */
export const useAuth = () => useContext(AuthContext);

export default AuthContext;
