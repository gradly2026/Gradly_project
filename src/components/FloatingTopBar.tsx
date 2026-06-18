/**
 * FloatingTopBar — píldora flotante (Glassmorphism) arriba a la derecha.
 *
 * Agrupa 3 acciones: Notificaciones · Traducción · Tema (claro/oscuro).
 * Position absolute, top: SafeArea, right: 15 — fuera del flujo del documento.
 */
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../config/firebaseConfig';
import { FONTS, useTheme } from '../context/ThemeContext';
import { useTranslationContext } from '../context/TranslationContext';
import { shadow } from '../utils/shadow';

interface Notif {
  id: string;
  titulo: string;
  mensaje: string;
  leida: boolean;
  created_at: string;
}

interface FloatingTopBarProps {
  userId?: string | null;
}

export default function FloatingTopBar({ userId }: FloatingTopBarProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark, toggleTheme } = useTheme();
  const { language } = useTranslationContext();

  const [notifOpen, setNotifOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);

  // ── Notificaciones en tiempo real ────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    const q = query(
      collection(db, 'notificaciones_app'),
      where('destinatario_id', '==', userId),
      limit(60),
    );
    const unsub = onSnapshot(
      q,
      snap => {
        const list: Notif[] = snap.docs.map(d => {
          const data: any = d.data();
          // Soporta tanto el campo canónico nuevo (`createdAt`) como el histórico (`fecha`).
          const created = data.createdAt?.toDate?.() ?? data.fecha?.toDate?.() ?? null;
          return {
            id: d.id,
            titulo: data.titulo ?? '',
            mensaje: data.mensaje ?? '',
            leida: !!data.leido,
            created_at: created ? created.toISOString() : new Date(0).toISOString(),
          };
        });
        list.sort((a, b) => b.created_at.localeCompare(a.created_at));
        setNotifs(list.slice(0, 40));
        setUnread(list.filter(n => !n.leida).length);
      },
      err => console.error('[FloatingTopBar] notif error', err),
    );
    return () => unsub();
  }, [userId]);

  const markAllRead = async () => {
    const pend = notifs.filter(n => !n.leida);
    await Promise.all(
      pend.map(n => updateDoc(doc(db, 'notificaciones_app', n.id), { leido: true })),
    );
    setNotifs(prev => prev.map(n => ({ ...n, leida: true })));
    setUnread(0);
  };

  const markOneRead = async (id: string) => {
    await updateDoc(doc(db, 'notificaciones_app', id), { leido: true });
    setNotifs(prev => prev.map(n => (n.id === id ? { ...n, leida: true } : n)));
    setUnread(prev => Math.max(0, prev - 1));
  };

  const tap = (fn: () => void) => () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    fn();
  };

  return (
    <>
      <View
        style={[styles.wrap, { top: insets.top + 8, pointerEvents: 'box-none' }]}
      >
        <BlurView
          intensity={40}
          tint={isDark ? 'dark' : 'light'}
          style={[
            styles.pill,
            {
              backgroundColor: isDark ? 'rgba(26,16,48,0.55)' : 'rgba(255,255,255,0.55)',
              borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(124,58,237,0.18)',
            },
          ]}
        >
          {/* Notificaciones */}
          <Pressable style={styles.iconBtn} onPress={tap(() => setNotifOpen(true))} hitSlop={6}>
            <Ionicons name="notifications-outline" size={22} color={colors.textPrimary} />
            {unread > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.error }]}>
                <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </Pressable>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Traducción */}
          <Pressable style={styles.iconBtn} onPress={tap(() => setLangOpen(v => !v))} hitSlop={6}>
            <Ionicons name="language-outline" size={22} color={colors.textPrimary} />
          </Pressable>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Tema claro/oscuro */}
          <Pressable style={styles.iconBtn} onPress={tap(toggleTheme)} hitSlop={6}>
            <Ionicons
              name={isDark ? 'sunny-outline' : 'moon-outline'}
              size={22}
              color={colors.textPrimary}
            />
          </Pressable>
        </BlurView>

        {/* Menú idioma (la app es español fijo por ahora → no-op) */}
        {langOpen && (
          <View
            style={[
              styles.langMenu,
              { backgroundColor: colors.backgroundCard, borderColor: colors.border },
            ]}
          >
            <TouchableOpacity style={styles.langItem} onPress={() => setLangOpen(false)}>
              <Ionicons name="swap-horizontal-outline" size={16} color={colors.primary} />
              <Text style={[styles.langItemText, { color: colors.textPrimary }]}>
                {language === 'es' ? 'Switch to English' : 'Cambiar a Español'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Vista de notificaciones (pantalla completa con flecha de retorno) ── */}
      <Modal
        visible={notifOpen}
        animationType="slide"
        onRequestClose={() => setNotifOpen(false)}
      >
        <View style={[styles.notifScreen, { backgroundColor: colors.backgroundDark }]}>
          <View style={[styles.notifHeader, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setNotifOpen(false)} style={styles.backBtn} hitSlop={10}>
              <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.notifTitle, { color: colors.textPrimary }]}>
              Notificaciones
            </Text>
            {unread > 0 ? (
              <TouchableOpacity onPress={markAllRead}>
                <Text style={[styles.markAll, { color: colors.primary }]}>Marcar todas</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 80 }} />
            )}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {notifs.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="notifications-off-outline" size={48} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                  No tienes notificaciones aún
                </Text>
              </View>
            ) : (
              notifs.map(n => (
                <TouchableOpacity
                  key={n.id}
                  style={[
                    styles.notifItem,
                    { borderBottomColor: colors.border },
                    !n.leida && { backgroundColor: colors.primary12 },
                  ]}
                  onPress={() => { if (!n.leida) markOneRead(n.id); }}
                >
                  {!n.leida && <View style={[styles.dot, { backgroundColor: colors.primary }]} />}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                      {n.titulo}
                    </Text>
                    <Text style={[styles.itemMsg, { color: colors.textMuted }]} numberOfLines={2}>
                      {n.mensaje}
                    </Text>
                    <Text style={[styles.itemTime, { color: colors.textMuted }]}>
                      {new Date(n.created_at).toLocaleDateString('es-SV', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 15,
    zIndex: 50,
    alignItems: 'flex-end',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    borderRadius: 23,
    paddingHorizontal: 6,
    overflow: 'hidden',
    borderWidth: 1,
    ...shadow({ color: '#000', y: 2, blur: 10, opacity: 0.3, elevation: 8 }),
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: { width: 1, height: 22, opacity: 0.5 },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 8, fontFamily: FONTS.interSemiBold, color: '#fff' },
  langMenu: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 4,
    minWidth: 190,
    ...shadow({ color: '#000', y: 0, blur: 10, opacity: 0.25, elevation: 10 }),
  },
  langItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  langItemText: { fontSize: 13, fontFamily: FONTS.interMedium },

  // Vista notificaciones
  notifScreen: { flex: 1 },
  notifHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  notifTitle: { flex: 1, fontSize: 18, fontFamily: FONTS.soraBold },
  markAll: { fontSize: 12, fontFamily: FONTS.interSemiBold, width: 80, textAlign: 'right' },
  empty: { alignItems: 'center', paddingVertical: 64, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: FONTS.interRegular },
  notifItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  itemTitle: { fontSize: 14, fontFamily: FONTS.interSemiBold, marginBottom: 2 },
  itemMsg: { fontSize: 12, fontFamily: FONTS.interRegular, lineHeight: 17, marginBottom: 4 },
  itemTime: { fontSize: 10, fontFamily: FONTS.interRegular },
});
