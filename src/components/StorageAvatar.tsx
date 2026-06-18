/**
 * StorageAvatar — avatar circular que muestra la foto/logo real del usuario.
 *
 * Prioridad de resolución:
 *   1. `url` directa (si el perfil ya tiene la download URL guardada)
 *   2. fetch a Firebase Storage en `storagePath` (ej. 'logos_empresas/{uid}')
 *   3. ícono de respaldo
 */
import { Ionicons } from '@expo/vector-icons';
import { getDownloadURL, ref } from 'firebase/storage';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { storage } from '../config/firebaseConfig';
import { useTheme } from '../context/ThemeContext';

interface StorageAvatarProps {
  url?: string | null;
  storagePath?: string | null;
  size?: number;
  fallbackIcon?: keyof typeof Ionicons.glyphMap;
}

export default function StorageAvatar({
  url,
  storagePath,
  size = 40,
  fallbackIcon = 'person',
}: StorageAvatarProps) {
  const { colors } = useTheme();
  const [resolved, setResolved] = useState<string | null>(url ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancel = false;
    if (url) { setResolved(url); setFailed(false); return; }
    if (!storagePath) { setResolved(null); return; }
    // Intenta obtener la URL de descarga desde Storage
    getDownloadURL(ref(storage, storagePath))
      .then(u => { if (!cancel) { setResolved(u); setFailed(false); } })
      .catch(() => { if (!cancel) setResolved(null); });
    return () => { cancel = true; };
  }, [url, storagePath]);

  const dim = { width: size, height: size, borderRadius: size / 2 };

  if (resolved && !failed) {
    return (
      <Image
        source={{ uri: resolved }}
        style={[dim, { borderWidth: 2, borderColor: colors.primary35 }]}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <View style={[dim, styles.fallback, { backgroundColor: colors.primary12 }]}>
      <Ionicons name={fallbackIcon} size={size * 0.5} color={colors.primaryLight} />
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
});
