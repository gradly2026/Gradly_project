// ════════════════════════════════════════════════════════════════════════
// MantenimientoGate.tsx — modo mantenimiento / suspensión de la plataforma.
//
// El admin activa `config/mantenimiento = { activo:true, motivo }` desde su
// panel. Mientras esté activo, TODO usuario NO admin ve una pantalla que
// cubre la app entera con el motivo y un botón para cerrar sesión. El admin
// NO se ve afectado (`rol === 'admin'` → este componente no pinta nada).
//
// Es un OVERLAY, no un signOut forzado: cuando el admin desactiva el modo, el
// `onSnapshot` lo detecta y la pantalla desaparece sola, sin re-login.
// Fail-open: si el doc no existe o aún no cargó, no bloquea.
//
// Montado una sola vez en app/_layout.tsx (fuera del <Stack>, dentro de los
// Providers) como ÚLTIMO hijo → queda por encima de todo.
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import { db } from '../config/firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';

export default function MantenimientoGate() {
  const { user, rol, isLoading, logout } = useAuth();
  const { colors } = useTheme();
  const s = makeStyles(colors);

  const [estado, setEstado] = useState<{ activo: boolean; motivo: string } | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'config', 'mantenimiento'),
      snap => {
        const d = snap.exists() ? (snap.data() as any) : null;
        setEstado(d ? { activo: d.activo === true, motivo: String(d.motivo ?? '') } : null);
      },
      () => setEstado(null),
    );
    return unsub;
  }, []);

  // No bloquea: sin sesión, cargando, admin, o modo inactivo / sin datos.
  if (isLoading || !user || !rol || rol === 'admin' || !estado?.activo) return null;

  return (
    <View style={s.root} pointerEvents="auto">
      <Ionicons name="construct-outline" size={54} color={colors.warning} />
      <Text style={s.titulo}>Plataforma en mantenimiento</Text>
      <Text style={s.sub}>Estamos haciendo trabajos en Gradly. Vuelve a intentarlo en un rato.</Text>
      {!!estado.motivo && (
        <View style={s.motivoBox}>
          <Text style={s.motivo} noTranslate>{estado.motivo}</Text>
        </View>
      )}
      <TouchableOpacity style={s.btn} onPress={() => void logout()} activeOpacity={0.85}>
        <Ionicons name="log-out-outline" size={16} color="#fff" />
        <Text style={s.btnTxt}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (C: GradlyColors) =>
  StyleSheet.create({
    root: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: C.backgroundDark,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
      gap: 12,
      zIndex: 9999,
      elevation: 9999,
    },
    titulo: { fontSize: 20, fontFamily: FONTS.soraBold, color: C.textPrimary, textAlign: 'center', marginTop: 4 },
    sub: { fontSize: 13.5, fontFamily: FONTS.interRegular, color: C.textMuted, textAlign: 'center', lineHeight: 20 },
    motivoBox: {
      backgroundColor: C.backgroundCard, borderRadius: 14, borderWidth: 1, borderColor: C.border,
      paddingHorizontal: 16, paddingVertical: 14, marginTop: 6, maxWidth: 460,
    },
    motivo: { fontSize: 13.5, fontFamily: FONTS.interMedium, color: C.textSecondary, lineHeight: 20, textAlign: 'center' },
    btn: {
      flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16,
      backgroundColor: C.primary, borderRadius: 24, paddingHorizontal: 22, paddingVertical: 12,
    },
    btnTxt: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: '#fff' },
  });
