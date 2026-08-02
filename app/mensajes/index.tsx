import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  Image,
  StyleSheet,

  useWindowDimensions,
  View,
} from "react-native";
import { AutoText as Text } from "../../src/components/AutoText";
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
  const params = useLocalSearchParams<{ chat?: string; peerName?: string }>();

  // Selección ligera: vale para clics del inbox y para aperturas por parámetro
  // (buscador → iniciar chat). Solo se necesitan id y nombre para ChatThread.
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [searchOpen, setSearchOpen] = useState(false);

  // Abre una conversación: en web la fija en el panel derecho; en móvil navega
  // a la pantalla individual del chat.
  const abrir = (id: string, name: string) => {
    if (isWide) {
      setSelected({ id, name });
      return;
    }
    router.push({
      pathname: "/mensajes/[id]",
      params: { id, peerName: name },
    } as any);
  };

  const handleSelect = (chat: ChatListItem) =>
    abrir(chat.id, chatTitle(chat, user?.uid));

  // Apertura por parámetro (proviene del buscador → useIniciarChat).
  useEffect(() => {
    if (!params.chat) return;
    const id = String(params.chat);
    const name = params.peerName ? String(params.peerName) : "Chat";
    if (isWide) {
      setSelected({ id, name });
    } else {
      router.replace({
        pathname: "/mensajes/[id]",
        params: { id, peerName: name },
      } as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.chat, params.peerName, isWide]);

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
                peerName={selected.name}
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
