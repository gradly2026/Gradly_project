// ════════════════════════════════════════════════════════════════════════
// GUÍA PARA PRINCIPIANTES:
// La bandeja de mensajes "completa" (a diferencia de app/(tabs)/mensajes.tsx,
// que es solo la pestaña del estudiante). Esta pantalla implementa un
// diseño "master-detail" (lista + detalle) que cambia según el ANCHO de
// pantalla — un patrón MUY común en apps que también corren en navegador
// de escritorio: en pantalla ancha se ven la lista de chats y el chat
// abierto AL MISMO TIEMPO, lado a lado; en pantalla angosta (celular) solo
// hay espacio para uno a la vez, así que tocar un chat navega a otra
// pantalla completa.
// ════════════════════════════════════════════════════════════════════════

import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  Image,
  StyleSheet,

  useWindowDimensions,
  View,
} from "react-native";
// useWindowDimensions() → hook que devuelve el ancho/alto ACTUAL de la
// ventana/pantalla, y se actualiza solo si el usuario cambia el tamaño de
// la ventana (en escritorio) o gira el dispositivo — clave para el diseño
// responsivo de esta pantalla.

import { AutoText as Text } from "../../src/components/AutoText";
import { LiquidBackground } from "../../components/ui/liquid-glass/LiquidBackground";
import ChatThread from "../../src/components/ChatThread";
import FloatingTopBar from "../../src/components/FloatingTopBar";
import InboxList from "../../src/components/InboxList";
import SearchUsersModal from "../../src/components/SearchUsersModal";
// Modal para buscar a otro usuario e iniciar una conversación nueva con
// él (el botón de lupa dentro de la lista de chats).
import { useAuth } from "../../src/context/AuthContext";
import { FONTS, useTheme } from "../../src/context/ThemeContext";
import { chatTitle, type ChatListItem } from "../../src/services/chatService";
// chatTitle(chat, miUid) → función utilitaria que, dado un documento de
// chat (que tiene 2 participantes) y mi propio uid, devuelve el NOMBRE
// del OTRO participante (el que no soy yo) — así la lista siempre
// muestra "con quién" es cada conversación, sin importar cuál de los 2
// participantes esté mirando la lista.

/** Umbral de escritorio: a partir de aquí se usa layout de dos paneles. */
const BREAKPOINT = 768;
// Un "breakpoint" es el ancho de pantalla (en píxeles) a partir del cual
// el diseño cambia de comportamiento — 768px es un umbral típico para
// distinguir "celular" de "tablet/escritorio".

const GRADLY_LOGO = require("../../assets/images/LogoGradly.png");
// require(...) (a diferencia de `import`) es la forma en que React
// Native/Metro (el empaquetador de la app) referencia ARCHIVOS estáticos
// como imágenes — el resultado es un identificador especial que se le
// puede pasar directo a la prop `source` de un componente <Image>.

/**
 * Pantalla principal de mensajes. Master-detail responsivo:
 * - Escritorio (> 768): lista de chats (30%) + chat seleccionado (70%).
 * - Móvil (≤ 768): solo la lista; al tocar un chat se navega a `/mensajes/[id]`.
 */
export default function MensajesScreen() {
  const { width } = useWindowDimensions();
  const isWide = width > BREAKPOINT;
  // `isWide` es la variable clave de todo el archivo: un booleano
  // calculado en CADA render, que decide entre el layout de 2 paneles o
  // el de 1 solo panel.
  const router = useRouter();
  const { user, rol } = useAuth();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ chat?: string; peerName?: string }>();
  // Esta pantalla puede recibir parámetros de navegación OPCIONALES
  // (`chat`, `peerName`) — se usan cuando se llega aquí desde el buscador
  // global pidiendo abrir directamente una conversación específica (ver
  // el useEffect de "Apertura por parámetro" más abajo).

  // Selección ligera: vale para clics del inbox y para aperturas por parámetro
  // (buscador → iniciar chat). Solo se necesitan id y nombre para ChatThread.
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(
    null,
  );
  // Estado: qué chat está actualmente ABIERTO en el panel derecho (solo
  // se usa en modo `isWide`). `null` significa "ninguno seleccionado
  // todavía".
  const [searchOpen, setSearchOpen] = useState(false);
  // Estado: ¿está visible el modal de "buscar usuario para chatear"?

  // Abre una conversación: en web la fija en el panel derecho; en móvil navega
  // a la pantalla individual del chat.
  const abrir = (id: string, name: string) => {
    if (isWide) {
      setSelected({ id, name });
      return;
      // En pantalla ancha, "abrir" un chat solo significa actualizar el
      // estado local `selected` — el panel derecho reacciona solo y
      // dibuja ese chat, sin necesitar navegar a ninguna ruta nueva.
    }
    router.push({
      pathname: "/mensajes/[id]",
      params: { id, peerName: name },
    } as any);
    // En pantalla angosta, "abrir" un chat significa NAVEGAR de verdad a
    // la ruta dinámica /mensajes/[id] (el archivo app/mensajes/[id].tsx
    // que ya comentamos), pasándole el id del chat y el nombre del otro
    // participante como parámetros.
  };

  const handleSelect = (chat: ChatListItem) =>
    abrir(chat.id, chatTitle(chat, user?.uid));
  // Función que le pasamos a <InboxList onSelect={...}> — cuando el
  // usuario toca una fila de la lista, InboxList entrega el objeto
  // `chat` completo, y aquí se extrae el id y se calcula el nombre a
  // mostrar (del OTRO participante) antes de llamar a `abrir`.

  // Apertura por parámetro (proviene del buscador → useIniciarChat).
  useEffect(() => {
    if (!params.chat) return;
    // Si no llegó el parámetro `chat` en la URL, no hay nada que hacer
    // (caso normal: el usuario entró a /mensajes navegando desde el menú,
    // no desde el buscador).
    const id = String(params.chat);
    const name = params.peerName ? String(params.peerName) : "Chat";
    if (isWide) {
      setSelected({ id, name });
    } else {
      router.replace({
        pathname: "/mensajes/[id]",
        params: { id, peerName: name },
      } as any);
      // router.replace (en vez de router.push) para no dejar esta
      // pantalla de bandeja "vacía" en el historial de navegación entre
      // el buscador y el chat individual.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Este comentario especial le dice a la herramienta de linting (ESLint)
    // que ignore, A PROPÓSITO, una regla que normalmente exigiría listar
    // TODAS las variables usadas dentro del efecto como dependencias — en
    // este caso se omiten deliberadamente `router` y `abrir` porque
    // agregarlas causaría que el efecto se repitiera más de lo necesario.
  }, [params.chat, params.peerName, isWide]);

  return (
    <LiquidBackground>
      <StatusBar style="light" />
      {/* Esta bandeja no vive dentro de (tabs) ni de un dashboard, así que
          sin esto los botones de notificaciones/idioma/tema desaparecían
          por completo al llegar aquí (p. ej. desde el buscador global).
          Cuando SÍ hay un chat abierto en el panel derecho (escritorio),
          esos mismos botones ya viven dentro de la propia cabecera de
          ChatThread — mostrar también esta píldora flotante los duplicaría
          (y era, además, la causa de que la cabecera "cambiara de diseño"
          según desde dónde se hubiera entrado al chat). */}
      {!(isWide && selected) && <FloatingTopBar userId={user?.uid} offsetY={72} />}
      <View style={styles.row}>
        {/* ── Panel izquierdo: lista de chats ── */}
        <View style={isWide ? styles.leftPane : styles.fullPane}>
          {/* En modo ancho, el panel izquierdo ocupa solo 30% (styles.leftPane);
              en modo angosto, ocupa TODO el ancho disponible (styles.fullPane) —
              porque en ese modo no hay panel derecho que mostrar. */}
          <InboxList
            showBack
            onSelect={handleSelect}
            selectedId={isWide ? selected?.id : null}
            // Solo se resalta visualmente la fila seleccionada cuando SÍ
            // existe un panel derecho mostrándola (isWide) — en modo
            // angosto no aplica, porque al tocar un chat se navega fuera
            // de esta pantalla por completo.
            onOpenSearch={() => setSearchOpen(true)}
          />
        </View>

        {/* ── Panel derecho (solo web): chat o estado vacío ── */}
        {isWide ? (
          // Renderizado condicional: el panel derecho completo SOLO existe
          // en modo ancho — en modo angosto, esta rama es simplemente `null`.
          <View style={[styles.rightPane, { borderLeftColor: colors.border }]}>
            {selected ? (
              <ChatThread
                key={selected.id}
                // La prop `key` aquí cumple un rol especial: cuando
                // `selected.id` cambia (el usuario elige OTRO chat),
                // cambiar la `key` le indica a React "esto es un
                // componente completamente NUEVO, no reutilices el
                // anterior" — así ChatThread se reinicia limpio para cada
                // conversación distinta, en vez de arrastrar estado viejo
                // del chat anterior.
                embedded
                // Prop que le avisa a ChatThread que está siendo mostrado
                // "incrustado" dentro de otra pantalla (sin su propio
                // encabezado de pantalla completa con botón de "atrás"),
                // a diferencia de cuando se usa en ChatScreen.tsx o
                // mensajes/[id].tsx.
                chatId={selected.id}
                peerName={selected.name}
              />
            ) : (
              // Si `isWide` es true pero todavía no se seleccionó ningún
              // chat (estado inicial), se muestra una pantalla de
              // bienvenida con el logo, en vez de dejar el panel vacío.
              <View style={styles.emptyDetail}>
                <Image
                  source={GRADLY_LOGO}
                  style={styles.logo}
                  resizeMode="contain"
                  // resizeMode="contain" → la imagen se escala manteniendo
                  // su proporción original, completa dentro del espacio
                  // disponible (sin recortarse ni deformarse).
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
    flexDirection: "row",   // los 2 paneles (o el único, en modo angosto) se acomodan lado a lado
  },
  leftPane: {
    width: "30%",           // 30% del ancho disponible en modo escritorio
    minWidth: 320,          // pero nunca menos de 320px, aunque la ventana sea muy angosta
  },
  fullPane: {
    flex: 1,                // ocupa TODO el ancho disponible (modo móvil)
  },
  rightPane: {
    flex: 1,                 // ocupa el 70% restante (todo lo que sobra tras el 30% de la izquierda)
    borderLeftWidth: 1,      // línea divisoria vertical entre los 2 paneles
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
