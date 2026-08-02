import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,

  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { AutoText, AutoText as Text } from "./AutoText";
import {
  FONTS,
  useTheme,
  type GradlyColors,
} from "../context/ThemeContext";
import { useTranslation } from "../context/TranslationContext";
import {
  chatTitle,
  markChatRead,
  subscribeUserChats,
  type ChatListItem,
} from "../services/chatService";

/** Hora corta: hoy → HH:mm; otro día → dd/mm. Respeta el idioma activo (antes fija en es-ES). */
function formatHora(d: Date | null, locale: string): string {
  if (!d) return "";
  const hoy = new Date();
  const mismoDia =
    d.getDate() === hoy.getDate() &&
    d.getMonth() === hoy.getMonth() &&
    d.getFullYear() === hoy.getFullYear();
  if (mismoDia) {
    return d.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
}

interface Props {
  /** Muestra botón de retroceso (cuando se abre como pantalla del stack). */
  showBack?: boolean;
  /**
   * Si se pasa, al tocar un chat se invoca este callback en vez de navegar a
   * `/ChatScreen` (modo master-detail). El orquestador decide qué hacer.
   */
  onSelect?: (chat: ChatListItem) => void;
  /** Id del chat seleccionado (para resaltarlo en el panel izquierdo web). */
  selectedId?: string | null;
  /** Si se pasa, se muestra una barra de búsqueda prominente que lo invoca. */
  onOpenSearch?: () => void;
}

export default function InboxList({
  showBack = false,
  onSelect,
  selectedId,
  onOpenSearch,
}: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { locale } = useTranslation();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const webScrollStyle = Platform.OS === 'web'
    ? ({ scrollbarColor: `${colors.primary35} ${colors.backgroundSurface}`, scrollbarWidth: 'thin' } as any)
    : undefined;

  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);
    const unsub = subscribeUserChats(
      user.uid,
      (items) => {
        setChats(items);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [user?.uid]);

  /** Nombre del otro participante según el rol del usuario actual. */
  const tituloDe = (chat: ChatListItem): string => chatTitle(chat, user?.uid);

  const abrirChat = (chat: ChatListItem) => {
    if (user?.uid) void markChatRead(chat.id, user.uid);
    // Modo master-detail: delega la selección al orquestador.
    if (onSelect) {
      onSelect(chat);
      return;
    }
    router.push({
      pathname: "/ChatScreen",
      params: { chatId: chat.id, peerName: tituloDe(chat) },
    } as any);
  };

  const renderItem = ({ item }: { item: ChatListItem }) => {
    const titulo = tituloDe(item);
    const inicial = titulo?.[0]?.toUpperCase() ?? "?";
    const noLeidos = item.unread > 0;
    const seleccionado = !!selectedId && item.id === selectedId;
    return (
      <TouchableOpacity
        style={[styles.item, seleccionado && styles.itemSelected]}
        activeOpacity={0.8}
        onPress={() => abrirChat(item)}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{inicial}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.itemTop}>
            <Text style={styles.itemTitle} numberOfLines={1}>
              {titulo}
            </Text>
            <Text style={styles.itemTime}>{formatHora(item.updatedAt, locale)}</Text>
          </View>
          <View style={styles.itemBottom}>
            <AutoText
              style={[styles.itemMsg, noLeidos && styles.itemMsgUnread]}
              numberOfLines={1}
            >
              {item.lastMessage ||
                (item.type === "group"
                  ? `Grupo: ${item.grupoNombre}`
                  : "Sin mensajes aún")}
            </AutoText>
            {noLeidos ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {item.unread > 99 ? "99+" : item.unread}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        {showBack ? (
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Mensajes</Text>
          <Text style={styles.headerSub}>Tus conversaciones activas</Text>
        </View>
        <Ionicons
          name="chatbubble-ellipses-outline"
          size={24}
          color={colors.primaryLight}
        />
      </View>

      {onOpenSearch ? (
        <TouchableOpacity
          style={styles.searchBar}
          activeOpacity={0.8}
          onPress={onOpenSearch}
        >
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <Text style={styles.searchPlaceholder}>Buscar o iniciar un chat</Text>
        </TouchableOpacity>
      ) : null}

      <FlatList
        data={chats}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        style={[{ flex: 1 }, webScrollStyle]}
        contentContainerStyle={{
          paddingHorizontal: 8,
          paddingBottom: insets.bottom + 100,
          gap: 2,
          flexGrow: 1,
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons
              name="chatbubbles-outline"
              size={40}
              color={colors.textMuted}
            />
            <Text style={styles.emptyText}>
              {loading
                ? "Cargando conversaciones..."
                : "Aún no tienes conversaciones.\nSe crean al aceptar una solicitud de prácticas."}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const makeStyles = (C: GradlyColors) =>
  StyleSheet.create({
    root: { flex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 16,
      paddingBottom: 16,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.white8,
    },
    headerTitle: {
      fontSize: 24,
      fontFamily: FONTS.soraBold,
      color: C.textPrimary,
    },
    headerSub: {
      fontSize: 12,
      fontFamily: FONTS.interRegular,
      color: C.textMuted,
      marginTop: 2,
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginHorizontal: 16,
      marginBottom: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.white8,
    },
    searchPlaceholder: {
      flex: 1,
      fontSize: 14,
      fontFamily: FONTS.interRegular,
      color: C.textMuted,
    },
    // Filas planas estilo WhatsApp Web: sin tarjeta, separador hairline.
    item: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
      backgroundColor: "transparent",
    },
    itemSelected: {
      backgroundColor: C.primary12,
      borderBottomColor: "transparent",
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.primary20,
      borderWidth: 1,
      borderColor: C.primary35,
    },
    avatarText: {
      fontSize: 18,
      fontFamily: FONTS.soraBold,
      color: C.primaryLight,
    },
    itemTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    itemTitle: {
      flex: 1,
      fontSize: 15,
      fontFamily: FONTS.interSemiBold,
      color: C.textPrimary,
      marginRight: 8,
    },
    itemTime: {
      fontSize: 11,
      fontFamily: FONTS.interRegular,
      color: C.textMuted,
    },
    itemBottom: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 4,
    },
    itemMsg: {
      flex: 1,
      fontSize: 13,
      fontFamily: FONTS.interRegular,
      color: C.textMuted,
      marginRight: 8,
    },
    itemMsgUnread: {
      color: C.textPrimary,
      fontFamily: FONTS.interSemiBold,
    },
    badge: {
      minWidth: 20,
      height: 20,
      paddingHorizontal: 6,
      borderRadius: 10,
      backgroundColor: C.error,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeText: {
      fontSize: 10,
      fontFamily: FONTS.interSemiBold,
      color: "#fff",
    },
    empty: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 80,
      gap: 12,
    },
    emptyText: {
      fontSize: 14,
      fontFamily: FONTS.interRegular,
      color: C.textMuted,
      textAlign: "center",
      lineHeight: 20,
    },
  });
