import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import {
  Image,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { LiquidBackground } from "../../components/ui/liquid-glass/LiquidBackground";
import ChatThread from "../../src/components/ChatThread";
import InboxList from "../../src/components/InboxList";
import SearchUsersModal from "../../src/components/SearchUsersModal";
import { useAuth } from "../../src/context/AuthContext";
import { FONTS, useTheme } from "../../src/context/ThemeContext";
import { chatTitle, type ChatListItem } from "../../src/services/chatService";

/** Umbral de escritorio: a partir de aquí se usa layout de dos paneles. */
const BREAKPOINT = 768;

const GRADLY_LOGO = require("../../assets/images/LogoGradly.png");

/**
 * Pantalla principal de mensajes. Master-detail responsivo:
 * - Escritorio (> 768): lista de chats (30%) + chat seleccionado (70%).
 * - Móvil (≤ 768): solo la lista; al tocar un chat se navega a `/mensajes/[id]`.
 */
export default function MensajesScreen() {
  const { width } = useWindowDimensions();
  const isWide = width > BREAKPOINT;
  const router = useRouter();
  const { user, rol } = useAuth();
  const { colors } = useTheme();

  const [selected, setSelected] = useState<ChatListItem | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const handleSelect = (chat: ChatListItem) => {
    const peerName = chatTitle(chat, user?.uid);
    if (isWide) {
      setSelected(chat);
      return;
    }
    // Móvil: navega al chat individual.
    router.push({
      pathname: "/mensajes/[id]",
      params: { id: chat.id, peerName },
    } as any);
  };

  return (
    <LiquidBackground>
      <StatusBar style="light" />
      <View style={styles.row}>
        {/* ── Panel izquierdo: lista de chats ── */}
        <View style={isWide ? styles.leftPane : styles.fullPane}>
          <InboxList
            showBack
            onSelect={handleSelect}
            selectedId={isWide ? selected?.id : null}
            onOpenSearch={() => setSearchOpen(true)}
          />
        </View>

        {/* ── Panel derecho (solo web): chat o estado vacío ── */}
        {isWide ? (
          <View style={[styles.rightPane, { borderLeftColor: colors.border }]}>
            {selected ? (
              <ChatThread
                key={selected.id}
                embedded
                chatId={selected.id}
                peerName={chatTitle(selected, user?.uid)}
              />
            ) : (
              <View style={styles.emptyDetail}>
                <Image
                  source={GRADLY_LOGO}
                  style={styles.logo}
                  resizeMode="contain"
                />
                <Text style={[styles.brand, { color: colors.textPrimary }]}>
                  Gradly
                </Text>
                <Text style={[styles.emptyHint, { color: colors.textMuted }]}>
                  Selecciona una conversación para empezar a chatear.
                </Text>
              </View>
            )}
          </View>
        ) : null}
      </View>

      <SearchUsersModal
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
        rol={rol}
        universidadId={user?.uid}
      />
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: "row",
  },
  leftPane: {
    width: "30%",
    minWidth: 320,
  },
  fullPane: {
    flex: 1,
  },
  rightPane: {
    flex: 1,
    borderLeftWidth: 1,
  },
  emptyDetail: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  logo: {
    width: 70,
    height: 70,
  },
  brand: {
    fontSize: 24,
    fontFamily: FONTS.soraBold,
  },
  emptyHint: {
    fontSize: 14,
    fontFamily: FONTS.interRegular,
    textAlign: "center",
    maxWidth: 280,
    lineHeight: 20,
  },
});
