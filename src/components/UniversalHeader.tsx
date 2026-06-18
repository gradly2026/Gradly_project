/**
 * UniversalHeader — header reutilizable para todos los dashboards.
 *
 * Izquierda : foto de perfil circular (o inicial) + nombre + subtítulo
 * Derecha   : idioma · tema · notificaciones (con badge) · cerrar sesión
 */

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../config/firebaseConfig";
import handleLogout from "../services/authService";
import { useThemeContext } from "../context/ThemeContext";
import { useTranslationContext } from "../context/TranslationContext";

// ── Tipos ────────────────────────────────────────────────────────────────────

interface Notif {
  id: string;
  titulo: string;
  mensaje: string;
  leida: boolean;
  created_at: string;
  tipo?: string;
}

export interface UniversalHeaderProps {
  userName?: string;
  userSubtitle?: string;
  profilePhotoUrl?: string | null;
  userId?: string | null;
}

// ── Paletas (espejo de las ya usadas en los dashboards) ───────────────────────

const dark = {
  bg: "rgba(13,11,30,0.96)",
  surface: "#0d0b1e",
  border: "rgba(139,92,246,0.18)",
  purple: "#8b5cf6",
  purpleDim: "rgba(139,92,246,0.12)",
  text: "#f4f1ff",
  muted: "rgba(255,255,255,0.50)",
  badge: "#8b5cf6",
  badgeText: "#fff",
  unread: "rgba(139,92,246,0.10)",
  dot: "#8b5cf6",
  panelBg: "#0d0b1e",
  itemBorder: "rgba(139,92,246,0.12)",
  cardBg: "rgba(255,255,255,0.03)",
};

const light = {
  bg: "rgba(248,250,252,0.97)",
  surface: "#ffffff",
  border: "rgba(139,92,246,0.18)",
  purple: "#7c3aed",
  purpleDim: "rgba(139,92,246,0.08)",
  text: "#111827",
  muted: "rgba(17,24,39,0.50)",
  badge: "#7c3aed",
  badgeText: "#fff",
  unread: "rgba(139,92,246,0.06)",
  dot: "#7c3aed",
  panelBg: "#ffffff",
  itemBorder: "rgba(139,92,246,0.10)",
  cardBg: "#f8fafc",
};

// ── Componente ────────────────────────────────────────────────────────────────

export default function UniversalHeader({
  userName,
  userSubtitle,
  profilePhotoUrl,
  userId,
}: UniversalHeaderProps) {
  const router = useRouter();
  const { isDark, toggleTheme } = useThemeContext();
  const { language } = useTranslationContext();

  const C = isDark ? dark : light;

  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);

  // ── Notificaciones ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!userId) return;

    // Realtime con onSnapshot. Sin orderBy para evitar requerir un índice
    // compuesto; ordenamos por fecha en el cliente.
    const q = query(
      collection(db, "notificaciones"),
      where("usuario_id", "==", userId),
      limit(60),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Notif[] = snap.docs.map((d) => {
          const data: any = d.data();
          const created = data.fecha?.toDate?.() ?? null;
          return {
            id: d.id,
            titulo: data.titulo ?? "",
            mensaje: data.mensaje ?? "",
            leida: !!data.leida,
            tipo: data.tipo,
            created_at: created ? created.toISOString() : new Date(0).toISOString(),
          };
        });
        list.sort((a, b) => b.created_at.localeCompare(a.created_at));
        setNotifs(list.slice(0, 40));
        setUnread(list.filter((n) => !n.leida).length);
      },
      (err) => console.error("[UniversalHeader] notif error", err),
    );

    return () => unsub();
  }, [userId]);

  const markAllRead = async () => {
    if (!userId) return;
    const pendientes = notifs.filter((n) => !n.leida);
    await Promise.all(
      pendientes.map((n) =>
        updateDoc(doc(db, "notificaciones", n.id), { leida: true }),
      ),
    );
    setNotifs((prev) => prev.map((n) => ({ ...n, leida: true })));
    setUnread(0);
  };

  const markOneRead = async (id: string) => {
    await updateDoc(doc(db, "notificaciones", id), { leida: true });
    setNotifs((prev) =>
      prev.map((n) => (n.id === id ? { ...n, leida: true } : n)),
    );
    setUnread((prev) => Math.max(0, prev - 1));
  };

  // ── Idioma ─────────────────────────────────────────────────────────────────

  // App en español fijo: el menú de idioma solo se cierra (no-op de cambio).
  const handleLangToggle = () => {
    setLangMenuOpen(false);
  };

  // ── Logout ─────────────────────────────────────────────────────────────────

  const confirmLogout = async () => {
    setLogoutOpen(false);
    await handleLogout(router);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const initial = userName ? userName[0].toUpperCase() : "G";

  return (
    <>
      {/* ── Topbar ── */}
      <View style={[styles.topbar, { backgroundColor: C.bg, borderBottomColor: C.border }]}>
        {/* Izquierda: foto + nombre */}
        <View style={styles.left}>
          {profilePhotoUrl ? (
            <Image source={{ uri: profilePhotoUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: C.purple }]}>
              <Text style={styles.avatarInitial}>{initial}</Text>
            </View>
          )}
          {(userName || userSubtitle) && (
            <View style={styles.nameBlock}>
              {userName ? (
                <Text style={[styles.userName, { color: C.text }]} numberOfLines={1}>
                  {userName}
                </Text>
              ) : null}
              {userSubtitle ? (
                <Text style={[styles.userSub, { color: C.muted }]} numberOfLines={1}>
                  {userSubtitle}
                </Text>
              ) : null}
            </View>
          )}
        </View>

        {/* Derecha: acciones */}
        <View style={styles.actions}>
          {/* Idioma */}
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: C.purpleDim }]}
            onPress={() => setLangMenuOpen((v) => !v)}
            accessibilityLabel="Cambiar idioma"
          >
            <Ionicons name="planet-outline" size={20} color={C.text} />
          </TouchableOpacity>

          {/* Tema */}
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: C.purpleDim }]}
            onPress={toggleTheme}
            accessibilityLabel="Cambiar tema"
          >
            <Ionicons
              name={isDark ? "sunny-outline" : "moon-outline"}
              size={20}
              color={C.text}
            />
          </TouchableOpacity>

          {/* Notificaciones */}
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: C.purpleDim }]}
            onPress={() => setNotifOpen(true)}
            accessibilityLabel="Notificaciones"
          >
            <Ionicons name="notifications-outline" size={20} color={C.text} />
            {unread > 0 && (
              <View style={[styles.badge, { backgroundColor: C.badge }]}>
                <Text style={[styles.badgeText, { color: C.badgeText }]}>
                  {unread > 9 ? "9+" : String(unread)}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Cerrar sesión */}
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: C.purpleDim }]}
            onPress={() => setLogoutOpen(true)}
            accessibilityLabel="Cerrar sesión"
          >
            <Ionicons name="log-out-outline" size={20} color={C.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Menú idioma ── */}
      {langMenuOpen && (
        <TouchableOpacity
          style={styles.langBackdrop}
          activeOpacity={1}
          onPress={() => setLangMenuOpen(false)}
        >
          <View style={[styles.langMenu, { backgroundColor: C.surface ?? C.panelBg, borderColor: C.border }]}>
            <TouchableOpacity style={styles.langItem} onPress={handleLangToggle}>
              <Ionicons name="swap-horizontal-outline" size={16} color={C.purple} />
              <Text style={[styles.langItemText, { color: C.text }]}>
                {language === "es" ? "Switch to English" : "Cambiar a Español"}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}

      {/* ── Panel notificaciones ── */}
      <Modal
        visible={notifOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setNotifOpen(false)}
      >
        <TouchableOpacity
          style={styles.notifOverlay}
          activeOpacity={1}
          onPress={() => setNotifOpen(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.notifPanel, { backgroundColor: C.panelBg, borderTopColor: C.border }]}
            onPress={() => {}}
          >
            {/* Header del panel */}
            <View style={[styles.notifHeader, { borderBottomColor: C.border }]}>
              <Text style={[styles.notifTitle, { color: C.text }]}>
                Notificaciones
                {unread > 0 && (
                  <Text style={{ color: C.purple }}> ({unread} nuevas)</Text>
                )}
              </Text>
              <View style={{ flexDirection: "row", gap: 12 }}>
                {unread > 0 && (
                  <TouchableOpacity onPress={markAllRead}>
                    <Text style={[styles.markAll, { color: C.purple }]}>
                      Marcar todas
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setNotifOpen(false)}>
                  <Ionicons name="close" size={22} color={C.muted} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Lista */}
            <ScrollView showsVerticalScrollIndicator={false}>
              {notifs.length === 0 ? (
                <View style={styles.emptyNotif}>
                  <Ionicons
                    name="notifications-off-outline"
                    size={44}
                    color={C.muted}
                  />
                  <Text style={[styles.emptyNotifText, { color: C.muted }]}>
                    No tienes notificaciones aún
                  </Text>
                </View>
              ) : (
                notifs.map((n) => (
                  <TouchableOpacity
                    key={n.id}
                    style={[
                      styles.notifItem,
                      { borderBottomColor: C.itemBorder },
                      !n.leida && { backgroundColor: C.unread },
                    ]}
                    onPress={() => {
                      if (!n.leida) markOneRead(n.id);
                    }}
                  >
                    <View style={styles.notifItemLeft}>
                      {!n.leida && (
                        <View style={[styles.unreadDot, { backgroundColor: C.dot }]} />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.notifItemTitle, { color: C.text }]}
                        numberOfLines={1}
                      >
                        {n.titulo}
                      </Text>
                      <Text
                        style={[styles.notifItemMsg, { color: C.muted }]}
                        numberOfLines={2}
                      >
                        {n.mensaje}
                      </Text>
                      <Text style={[styles.notifItemTime, { color: C.muted }]}>
                        {new Date(n.created_at).toLocaleDateString("es-SV", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Modal cerrar sesión ── */}
      <Modal
        visible={logoutOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setLogoutOpen(false)}
      >
        <View style={styles.logoutOverlay}>
          <View style={[styles.logoutCard, { backgroundColor: C.panelBg, borderColor: C.border }]}>
            <View style={[styles.logoutIconWrap, { backgroundColor: C.purpleDim }]}>
              <Ionicons name="log-out-outline" size={28} color={C.purple} />
            </View>
            <Text style={[styles.logoutTitle, { color: C.text }]}>
              ¿Cerrar sesión?
            </Text>
            <Text style={[styles.logoutSub, { color: C.muted }]}>
              Tu sesión se cerrará en este dispositivo.
            </Text>
            <View style={styles.logoutBtns}>
              <TouchableOpacity
                style={[styles.logoutCancel, { borderColor: C.border }]}
                onPress={() => setLogoutOpen(false)}
              >
                <Text style={[styles.logoutCancelText, { color: C.muted }]}>
                  Cancelar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.logoutConfirm, { backgroundColor: C.purple }]}
                onPress={confirmLogout}
              >
                <Text style={styles.logoutConfirmText}>Sí, salir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  avatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  nameBlock: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
  },
  userSub: {
    fontSize: 11,
    lineHeight: 14,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "700",
  },

  // Menú idioma
  langBackdrop: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
  },
  langMenu: {
    position: "absolute",
    right: 80,
    top: 4,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 4,
    minWidth: 180,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  langItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  langItemText: {
    fontSize: 13,
    fontWeight: "500",
  },

  // Panel notificaciones
  notifOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.50)",
    justifyContent: "flex-end",
  },
  notifPanel: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    maxHeight: "75%",
    paddingBottom: 24,
  },
  notifHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  notifTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  markAll: {
    fontSize: 12,
    fontWeight: "600",
  },
  emptyNotif: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
  },
  emptyNotifText: {
    fontSize: 14,
  },
  notifItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  notifItemLeft: {
    width: 10,
    paddingTop: 4,
    alignItems: "center",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  notifItemTitle: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 2,
  },
  notifItemMsg: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 4,
  },
  notifItemTime: {
    fontSize: 10,
  },

  // Modal logout
  logoutOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.60)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  logoutCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 18,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
  },
  logoutIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  logoutTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 6,
  },
  logoutSub: {
    fontSize: 13,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 18,
  },
  logoutBtns: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  logoutCancel: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logoutCancelText: {
    fontSize: 14,
    fontWeight: "600",
  },
  logoutConfirm: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  logoutConfirmText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
});
