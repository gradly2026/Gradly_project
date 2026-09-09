// ════════════════════════════════════════════════════════════════════════
// ComunicadosGate.tsx — muestra, de forma intrusiva, los comunicados que el
// admin dirigió a este usuario (a su rol, a todos, o solo a él). Un modal
// informativo con X para cerrarlo; al cerrar se marca como visto y NO vuelve
// a aparecer.
//
// Montado una sola vez en app/_layout.tsx (fuera del <Stack>, dentro de los
// Providers) → cubre cualquier pantalla. Mismo espíritu que AvisosGate /
// FeedbackGate, pero cross-rol y cross-ruta.
//
// "Visto" por usuario: `arrayUnion` en `perfiles_<rol>/{uid}.comunicados_vistos`
// — el dueño ya puede escribir su propio perfil, sin regla nueva.
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import { arrayUnion, collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import { db } from '../config/firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { FONTS, useTheme, webScrollStyle, type GradlyColors } from '../context/ThemeContext';

type RolUsuario = 'estudiante' | 'empresa' | 'universidad';

const PERFIL_COL: Record<RolUsuario, string> = {
  estudiante: 'perfiles_estudiantes',
  empresa: 'perfiles_empresas',
  universidad: 'perfiles_universidades',
};
const DESTINO_DE_ROL: Record<RolUsuario, string> = {
  estudiante: 'estudiantes',
  empresa: 'empresas',
  universidad: 'universidades',
};

interface Comunicado {
  id: string;
  titulo?: string;
  mensaje: string;
  destino: 'todos' | 'estudiantes' | 'empresas' | 'universidades' | 'usuario';
  destinoUid?: string | null;
  creadoAt?: any;
}

export default function ComunicadosGate() {
  const { user, rol } = useAuth();
  const { colors } = useTheme();
  const s = makeStyles(colors);

  const [cola, setCola] = useState<Comunicado[]>([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!user?.uid || (rol !== 'estudiante' && rol !== 'empresa' && rol !== 'universidad')) {
      setCola([]);
      setIdx(0);
      return;
    }
    const rolU = rol as RolUsuario;
    let cancel = false;
    (async () => {
      try {
        const [snap, perfil] = await Promise.all([
          getDocs(query(collection(db, 'comunicados'), where('activo', '==', true))),
          getDoc(doc(db, PERFIL_COL[rolU], user.uid)),
        ]);
        if (cancel) return;
        const vistos: string[] = Array.isArray((perfil.data() as any)?.comunicados_vistos)
          ? (perfil.data() as any).comunicados_vistos
          : [];
        const destinoRol = DESTINO_DE_ROL[rolU];
        const pend = snap.docs
          .map(d => ({ id: d.id, ...(d.data() as any) } as Comunicado))
          .filter(
            c =>
              (c.destino === 'todos' ||
                c.destino === destinoRol ||
                (c.destino === 'usuario' && c.destinoUid === user.uid)) &&
              !vistos.includes(c.id),
          )
          .sort((a, b) => (a.creadoAt?.toMillis?.() ?? 0) - (b.creadoAt?.toMillis?.() ?? 0));
        if (!cancel) {
          setCola(pend);
          setIdx(0);
        }
      } catch (e) {
        console.warn('[ComunicadosGate]', e);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [user?.uid, rol]);

  const actual = cola[idx];
  if (!actual || !user?.uid || (rol !== 'estudiante' && rol !== 'empresa' && rol !== 'universidad')) return null;

  const cerrar = () => {
    const rolU = rol as RolUsuario;
    void updateDoc(doc(db, PERFIL_COL[rolU], user.uid), {
      comunicados_vistos: arrayUnion(actual.id),
    }).catch(() => {});
    setTimeout(() => setIdx(i => i + 1), 0);
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={cerrar}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.header}>
            <Ionicons name="megaphone-outline" size={18} color={colors.primaryLight} />
            <Text style={s.badge}>Comunicado de Gradly</Text>
            <TouchableOpacity onPress={cerrar} hitSlop={10}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView style={webScrollStyle(colors)} contentContainerStyle={{ padding: 20, gap: 12 }}>
            {!!actual.titulo && <Text style={s.titulo} noTranslate>{actual.titulo}</Text>}
            <Text style={s.mensaje} noTranslate>{actual.mensaje}</Text>
            <TouchableOpacity style={s.btn} onPress={cerrar} activeOpacity={0.9}>
              <Text style={s.btnTxt}>Entendido</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (C: GradlyColors) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(7,5,15,0.9)', justifyContent: 'center', alignItems: 'center', padding: 18 },
    sheet: {
      width: '100%', maxWidth: 460, maxHeight: '82%', alignSelf: 'center',
      backgroundColor: C.backgroundCard, borderRadius: 22,
      borderWidth: 1, borderColor: C.border, overflow: 'hidden',
    },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 16, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: C.border,
    },
    badge: { flex: 1, fontSize: 13, fontFamily: FONTS.soraSemiBold, color: C.primaryLight },
    titulo: { fontSize: 17, fontFamily: FONTS.soraBold, color: C.textPrimary },
    mensaje: { fontSize: 14, fontFamily: FONTS.interRegular, color: C.textSecondary, lineHeight: 21 },
    btn: {
      backgroundColor: C.primary, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 6,
    },
    btnTxt: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: '#fff' },
  });
