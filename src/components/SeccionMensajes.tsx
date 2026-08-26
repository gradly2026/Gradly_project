import { useEffect, useState } from "react";
import { Image, StyleSheet, useWindowDimensions, View } from "react-native";
import { AutoText as Text } from "./AutoText";
import ChatThread from "./ChatThread";
import InboxList from "./InboxList";
import SearchUsersModal from "./SearchUsersModal";
import { useAuth } from "../context/AuthContext";
import { FONTS, useTheme } from "../context/ThemeContext";
import { chatTitle, type ChatListItem } from "../services/chatService";

/** Umbral de escritorio: a partir de aquí se usa layout de dos paneles. */
const BREAKPOINT = 768;

const GRADLY_LOGO = require("../../assets/images/LogoGradly.png");

export interface SeccionMensajesProps {
  /**
   * Chat a abrir de inmediato (p. ej. tras "Chatear con Candidato" o "Abrir
   * chat del grupo"), en vez de esperar a que el usuario lo elija del inbox.
   */
  openChat?: { id: string; peerName: string } | null;
  /** Se invoca una sola vez, apenas se aplica `openChat`. */
  onOpenChatConsumed?: () => void;
  /**
   * Avisa al dashboard que la contiene si hay (o no) un chat abierto ahora
   * mismo. El dashboard usa esto para OCULTAR su propia píldora flotante de
   * notificaciones/idioma/tema mientras se ve un chat — ChatThread ya trae
   * la suya propia en la cabecera, y mostrar las dos a la vez las duplicaba
   * (además de ser, junto con la navegación de "Chatear" a `/mensajes`, la
   * causa de que la cabecera del chat pareciera "cambiar de diseño").
   */
  onChatOpenChange?: (abierto: boolean) => void;
}

/**
 * Sección "Mensajes" embebida en el dashboard de empresa/universidad — mismo
 * modelo que usa el estudiante (una sección más del panel, no una pantalla
 * aparte del stack de navegación). Toda la selección de chat vive en estado
 * local (nunca en el historial del navegador), así que la flecha de "volver
 * al inbox" en móvil jamás dispara el guard de "¿Desea cerrar sesión?" que
 * intercepta el botón "atrás" del dashboard.
 */
export default function SeccionMensajes({
  openChat,
  onOpenChatConsumed,
  onChatOpenChange,
}: SeccionMensajesProps) {
  const { width } = useWindowDimensions();
  const isWide = width > BREAKPOINT;
  const { user, rol } = useAuth();
  const { colors } = useTheme();

  const [selected, setSelected] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [searchOpen, setSearchOpen] = useState(false);

  // Apertura solicitada por el dashboard (p. ej. "Chatear con Candidato").
  useEffect(() => {
    if (!openChat) return;
    setSelected({ id: openChat.id, name: openChat.peerName });
    onOpenChatConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openChat]);

  // Un chat "abierto" ocupa la sección completa en móvil, o el panel derecho
  // en escritorio — en ambos casos, ChatThread ya dibuja su propia barra de
  // notificaciones/idioma/tema, así que el dashboard debe ocultar la suya.
  // La limpieza al desmontar es clave: si el usuario cambia de sección del
  // dashboard con un chat todavía abierto, esta sección se desmonta entera
  // SIN pasar por "selected → null" — sin el cleanup, el dashboard se
  // quedaría creyendo para siempre que hay un chat abierto y nunca volvería
  // a mostrar su propia píldora flotante.
  useEffect(() => {
    onChatOpenChange?.(!!selected);
    return () => onChatOpenChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const handleSelect = (chat: ChatListItem) =>
    setSelected({ id: chat.id, name: chatTitle(chat, user?.uid) });

  // Navegación interna del propio chat (p. ej. al aceptar un grupo compartido
  // se abre la sala recién creada): se queda dentro de esta misma sección.
  const handleOpenChat = (chatId: string, peerName: string) =>
    setSelected({ id: chatId, name: peerName });

  // Móvil/estrecho con un chat elegido: la conversación ocupa toda la
  // sección; "volver" limpia la selección local (sin tocar el historial).
  if (!isWide && selected) {
    return (
      <ChatThread
        key={selected.id}
        chatId={selected.id}
        peerName={selected.name}
        onBack={() => setSelected(null)}
        onOpenChat={handleOpenChat}
      />
    );
  }

  return (
    <View style={styles.row}>
      {/* ── Panel izquierdo: lista de chats ── */}
      <View style={isWide ? styles.leftPane : styles.fullPane}>
        <InboxList
          onSelect={handleSelect}
          selectedId={isWide ? selected?.id : null}
          onOpenSearch={() => setSearchOpen(true)}
        />
      </View>

      {/* ── Panel derecho (solo ancho): chat o estado vacío ── */}
      {isWide ? (
        <View style={[styles.rightPane, { borderLeftColor: colors.border }]}>
          {selected ? (
            <ChatThread
              key={selected.id}
              embedded
              chatId={selected.id}
              peerName={selected.name}
              onOpenChat={handleOpenChat}
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

      <SearchUsersModal
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
        rol={rol}
        universidadId={user?.uid}
      />
    </View>
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
