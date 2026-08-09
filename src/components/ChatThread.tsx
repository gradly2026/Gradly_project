import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import * as ScreenCapture from "expo-screen-capture";
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Switch,


  TouchableOpacity,
  View,
} from "react-native";
import { AutoText as Text, AutoTextInput as TextInput } from "./AutoText";
import {
  Bubble,
  Composer,
  GiftedChat,
  InputToolbar,
  MessageText,
  Send,
  type BubbleProps,
  type IMessage,
  type MessageTextProps,
} from "react-native-gifted-chat";

// gifted-chat v2 no exporta `ReplyMessage` (era de v3). Tipo local mínimo con la
// forma que construimos al responder (ver startReply).
type ReplyMessage = { _id: string | number; text: string; user: IMessage["user"] };
import { SafeAreaView } from "react-native-safe-area-context";
import { db } from "../config/firebaseConfig";
import { useAuth } from "../context/AuthContext";
import { useTheme, type GradlyColors } from "../context/ThemeContext";
import {
  chatTitle,
  markChatRead,
  parseEscribiendo,
  setTyping,
  subscribeUserChats,
  textoEscribiendo,
  touchChatOnMessage,
  TYPING_THROTTLE_MS,
  TYPING_VIGENCIA_MS,
  type ChatListItem,
  type EscribiendoInfo,
} from "../services/chatService";
import {
  aceptarGrupoCompartido,
  finalizarPasantia,
  firmarAcuerdo,
  modificarAcuerdo,
  subirConstanciaPdf,
  type FirmarAcuerdoResult,
} from "../services/solicitudPracticaService";
import { useAutoText } from "./AutoText";
import {
  acuerdoToSchedule,
  type AcuerdoData,
  type ChatMessage,
  type GroupOfferData,
} from "../types/chat";
import ProponerHorarioModal from "./ProponerHorarioModal";
import ProfileViewerModal, { type ProfileTipo } from "./ProfileViewerModal";
import ReportarUsuarioModal from "./ReportarUsuarioModal";
import StorageAvatar from "./StorageAvatar";
import { useIniciarChat } from "../hooks/useIniciarChat";

/**
 * Paleta del chat: se deriva de la paleta oficial del tema activo
 * (`ThemeContext` — la misma que usa el resto de la app), en vez de una
 * paleta fija en claro. Así, si la app está en modo oscuro, el chat también
 * se ve oscuro con los mismos colores del tema original (y viceversa).
 */
type ChatColors = ReturnType<typeof buildChatColors>;
function buildChatColors(theme: GradlyColors) {
  return {
    bg: theme.backgroundDark,
    surface: theme.backgroundCard,
    text: theme.textPrimary,
    textMuted: theme.textMuted,
    muted: theme.textSecondary,
    accent: theme.primary,
    border: theme.border,
    green: theme.success,
    // Relleno sutil para inputs/items sobre una tarjeta (antes fijo en negro
    // translúcido, invisible sobre fondos oscuros); `white4` ya está pensado
    // para verse bien en ambos temas.
    subtleFill: theme.white4,
    // Burbujas: la mía usa el color primario de marca (texto blanco fijo, ya
    // que el primario es igual de oscuro/saturado en ambos temas); la de la
    // contraparte usa la superficie de tarjeta del tema con su texto normal.
    bubbleMine: theme.primary,
    bubbleMineText: "#FFFFFF",
    bubbleOther: theme.backgroundSurface,
    bubbleOtherText: theme.textPrimary,
  };
}

/** Alumno referenciado en la solicitud. */
interface AlumnoRef {
  id: string;
  nombre: string;
}

/** Metadatos del chat + solicitud necesarios para el handshake. */
interface ChatContext {
  empresaId: string;
  universidadId: string;
  grupoId: string;
  solicitudId: string;
  empresaNombre: string;
  carrera: string;
  fechaInicio: string;
  fechaFin: string;
  alumnos: AlumnoRef[];
  /** Estado de la solicitud (`aprobado` → se puede finalizar). */
  estado: string;
}

/** Hora exacta HH:mm (es-ES). */
const formatHoraExacta = (d: Date) =>
  d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

/**
 * Texto del recibo bajo un mensaje propio:
 *  - "Visto HH:mm" si el otro participante entró al chat después de enviarse.
 *  - "Enviado HH:mm" en caso contrario (hora exacta de registro del mensaje).
 */
function reciboTexto(msg: ChatMessage, peerLeido: Date | null): string {
  const created =
    msg.createdAt instanceof Date
      ? msg.createdAt
      : new Date(Number(msg.createdAt) || Date.now());
  if (peerLeido && peerLeido.getTime() >= created.getTime()) {
    return `Visto ${formatHoraExacta(peerLeido)}`;
  }
  return `Enviado ${formatHoraExacta(created)}`;
}

/** Texto de presencia legible a partir del estado del peer. */
function presenciaTexto(online: boolean, lastSeen: Date | null): string {
  if (online) return "En línea";
  if (!lastSeen) return "Desconectado";
  const hoy = new Date();
  const mismoDia =
    lastSeen.getDate() === hoy.getDate() &&
    lastSeen.getMonth() === hoy.getMonth() &&
    lastSeen.getFullYear() === hoy.getFullYear();
  const cuando = mismoDia
    ? lastSeen.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
    : lastSeen.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
  return `Últ. vez ${cuando}`;
}

export interface ChatThreadProps {
  /** ID de la sala (`chats/{...}`). */
  chatId: string;
  /** Nombre a mostrar del otro participante. */
  peerName?: string;
  /** Si se pasa, se muestra la flecha de retroceso y se invoca al pulsarla. */
  onBack?: () => void;
  /**
   * `true` cuando se monta dentro del panel derecho del layout master-detail
   * (web): rellena el contenedor padre sin SafeAreaView ni insets propios.
   */
  embedded?: boolean;
  /**
   * Se invoca en vez de navegar a `/ChatScreen` cuando este hilo necesita
   * abrir OTRO chat (p. ej. la sala nueva creada al aceptar un grupo
   * compartido). Lo usan los orquestadores embebidos (como la sección
   * "Mensajes" de los dashboards de empresa/universidad) para quedarse
   * dentro de su propia sección en vez de empujar una pantalla nueva del
   * stack. Si no se pasa, cae al comportamiento por defecto (navegar).
   */
  onOpenChat?: (chatId: string, peerName: string) => void;
}

/**
 * Renderiza el texto de un mensaje traducido al vuelo (según el idioma activo),
 * pasándolo a `MessageText` de GiftedChat para conservar su formato/linkify.
 */
function TranslatedMessageText(props: MessageTextProps<ChatMessage>) {
  const msg = props.currentMessage;
  const translated = useAutoText(typeof msg?.text === "string" ? msg.text : "");
  const patched = msg ? ({ ...msg, text: translated } as ChatMessage) : msg;
  return <MessageText {...props} currentMessage={patched} />;
}

/**
 * Hilo de conversación reutilizable. Concentra toda la lógica de chat (antes en
 * `app/ChatScreen.tsx`) para poder montarse como pantalla del stack/tab o
 * embebido en el panel derecho del master-detail.
 */
export default function ChatThread({
  chatId,
  peerName,
  onBack,
  embedded = false,
  onOpenChat,
}: ChatThreadProps) {
  const { user, userProfile, rol } = useAuth();
  const router = useRouter();
  const iniciarChat = useIniciarChat();

  // Paleta y estilos del chat: siguen el tema activo (claro/oscuro) de la app.
  const { colors: themeColors, isDark } = useTheme();
  const C = useMemo(() => buildChatColors(themeColors), [themeColors]);
  const styles = useMemo(() => makeStyles(C), [C]);

  /** Fila del menú contextual long-press. Anidado para heredar `C`/`styles`
   * del tema activo por closure (antes vivía a nivel de módulo, atado a la
   * paleta fija). */
  const MenuOption = ({
    icon,
    label,
    onPress,
    danger,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress: () => void;
    danger?: boolean;
  }) => (
    <TouchableOpacity
      style={styles.menuOption}
      activeOpacity={0.7}
      onPress={onPress}
    >
      <Ionicons name={icon} size={20} color={danger ? "#f87171" : C.text} />
      <Text style={[styles.menuOptionText, danger && { color: "#f87171" }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  // Foto/logo del otro participante (chat 1:1) para la cabecera.
  const [peerFoto, setPeerFoto] = useState<string | null>(null);
  // "Vaciar chat" por usuario: oculta los mensajes anteriores a esta marca SOLO
  // para mí (no borra nada para los demás).
  const [clearedAtMe, setClearedAtMe] = useState<Date | null>(null);
  // Acción al tocar un integrante del grupo (ver perfil / chatear).
  const [accionMiembro, setAccionMiembro] = useState<{
    uid: string;
    nombre: string;
    rol: string;
    foto?: string | null;
  } | null>(null);
  // Perfil a mostrar (modal) tras elegir "Ver perfil".
  const [verPerfil, setVerPerfil] = useState<{ tipo: ProfileTipo; id: string } | null>(null);
  // Añadir integrantes (solo admin universidad).
  const [showAddMember, setShowAddMember] = useState(false);
  const [candidatos, setCandidatos] = useState<{ uid: string; nombre: string; foto?: string | null }[]>([]);
  const [loadingCand, setLoadingCand] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [ctx, setCtx] = useState<ChatContext | null>(null);
  const [showPropuesta, setShowPropuesta] = useState(false);
  const [aprobando, setAprobando] = useState(false);
  // Resultado de la firma → alimenta el modal "Inicio de la pasantía".
  const [acuerdoFirmado, setAcuerdoFirmado] = useState<FirmarAcuerdoResult | null>(
    null,
  );
  const [peerStatus, setPeerStatus] = useState<string | null>(null);
  const [peerLastSeen, setPeerLastSeen] = useState<Date | null>(null);
  // Hora en que cada participante entró al chat por última vez (para "Visto").
  const [lastReadMap, setLastReadMap] = useState<Record<string, Date>>({});
  // Tick para reevaluar la frescura del heartbeat aunque no llegue snapshot.
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Composer controlado: necesario para precargar el texto al editar.
  const [inputText, setInputText] = useState("");
  // Quién más está escribiendo en esta sala (viene del doc del chat).
  const [escribiendo, setEscribiendo] = useState<EscribiendoInfo[]>([]);
  // Cita estilo WhatsApp encima del input (responder).
  const [replyTo, setReplyTo] = useState<ReplyMessage | null>(null);
  // Mensaje en edición (si no es null, onSend hace updateDoc).
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  // Mensaje con el menú de acciones abierto (long-press).
  const [actionMsg, setActionMsg] = useState<ChatMessage | null>(null);
  // Mensaje a reenviar (abre el modal con la lista de chats).
  const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null);
  // Usuario a reportar (abre el modal de reporte).
  const [reportTarget, setReportTarget] = useState<{ id: string; nombre: string } | null>(null);
  // Chats activos del usuario (para el modal de reenvío).
  const [misChats, setMisChats] = useState<ChatListItem[]>([]);

  // Metadatos del documento del chat (en tiempo real) para grupos oficiales.
  const [group, setGroup] = useState<{
    type: string;
    name: string;
    admins: string[];
    users: string[];
    adminsOnly: boolean;
    contexto: string;
    participantsInfo: Record<string, { nombre: string; rol: string; foto?: string | null }>;
  } | null>(null);
  // Panel de administración del grupo.
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [nombreEdit, setNombreEdit] = useState("");
  const [participantes, setParticipantes] = useState<
    { uid: string; nombre: string; rol: string; foto?: string | null }[]
  >([]);

  // Compartir grupo de estudiantes (acción rápida de la Universidad).
  const [showCompartirGrupo, setShowCompartirGrupo] = useState(false);
  const [gruposUni, setGruposUni] = useState<GroupOfferData[]>([]);
  const [cargandoGrupos, setCargandoGrupos] = useState(false);
  const [compartiendoGrupo, setCompartiendoGrupo] = useState(false);
  // Id del mensaje group_offer cuya aceptación está en curso (empresa).
  const [aceptandoGrupo, setAceptandoGrupo] = useState<string | null>(null);

  const isGroup = group?.type === "group";
  const isAdmin = !!user?.uid && (group?.admins ?? []).includes(user.uid);
  const adminsOnly = !!group?.adminsOnly;
  // Input bloqueado: grupo en modo solo-admins y el usuario no es admin.
  const inputBloqueado = isGroup && adminsOnly && !isAdmin;

  const giftedUser = useMemo(
    () => ({
      _id: user?.uid ?? "anon",
      name: userProfile?.nombre_completo ?? "Yo",
    }),
    [user?.uid, userProfile?.nombre_completo],
  );

  // El usuario actual es la Empresa si su uid coincide con el empresaId del chat.
  const isEmpresa = !!ctx && user?.uid === ctx.empresaId;
  // ...y la Universidad si coincide con el universidadId del chat.
  const isUni = !!ctx && user?.uid === ctx.universidadId;

  // Participantes reales del chat: preferimos el array `users` del documento
  // (fiable para grupos y directos `direct_*`); como fallback, mientras carga,
  // derivamos del id 1:1 (uni_empresa_grupo). Los uids de Firebase no llevan
  // "_", así que el split inicial es seguro para los chats antiguos.
  const idFallback = useMemo(
    () => (chatId ? String(chatId).split("_").slice(0, 2) : []),
    [chatId],
  );
  const chatUsers = useMemo(
    () => (group?.users?.length ? group.users : idFallback),
    [group?.users, idFallback],
  );

  // El otro participante (para leer su presencia, solo 1:1).
  const peerUid = useMemo(
    () => chatUsers.find((u) => u && u !== user?.uid) ?? null,
    [chatUsers, user?.uid],
  );

  // Al abrir el chat, marca como leídos los mensajes del usuario actual.
  useEffect(() => {
    if (chatId && user?.uid) void markChatRead(chatId, user.uid);
  }, [chatId, user?.uid]);

  // Presencia "viendo este chat": permite que el backend NO notifique/pushee
  // mensajes de un chat que el usuario tiene abierto. Se limpia al salir.
  // Vive en `presencia/{uid}` (junto con status/lastSeen), no en `usuarios`,
  // para consolidar toda la presencia en una sola colección de lectura pública.
  useEffect(() => {
    const uid = user?.uid;
    if (!chatId || !uid) return;
    const ref = doc(db, "presencia", uid);
    // setDoc+merge: tolera que el doc de presencia aún no exista.
    void setDoc(ref, { activeChatId: chatId }, { merge: true }).catch(() => {});
    // Borra la notificación de campanita de este chat al abrirlo (si existe).
    void deleteDoc(doc(db, "notificaciones_app", `chat_${chatId}_${uid}`)).catch(() => {});
    return () => {
      void setDoc(ref, { activeChatId: null }, { merge: true }).catch(() => {});
    };
  }, [chatId, user?.uid]);

  // ── Presencia del peer: status / lastSeen en presencia/{peerUid} ──
  // Colección aparte (lectura pública para autenticados) para no exponer el
  // correo/perfil del otro usuario solo por ver su punto verde.
  useEffect(() => {
    if (!peerUid) return;
    const unsub = onSnapshot(
      doc(db, "presencia", peerUid),
      (snap) => {
        const data = (snap.data() ?? {}) as any;
        setPeerStatus(data.status ?? null);
        setPeerLastSeen(data.lastSeen?.toDate?.() ?? null);
      },
      (error) => console.warn("Error en listener (presencia):", error),
    );
    return unsub;
  }, [peerUid]);

  // Reevalúa la frescura del heartbeat cada 30s (sin depender de snapshots).
  useEffect(() => {
    if (peerStatus !== "online") return;
    const id = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, [peerStatus]);

  // Online solo si el flag está activo y el heartbeat es reciente (≤120s).
  // Cubre el caso de una app cerrada sin escribir "offline".
  const peerOnline =
    peerStatus === "online" &&
    (!peerLastSeen || nowTick - peerLastSeen.getTime() < 120000);

  // ── Foto/logo del peer (chat 1:1) para la cabecera ──
  // empresa/universidad: logos públicos. estudiante: foto solo si el lector tiene
  // permiso (empresa/universidad/él mismo); si no, cae al ícono/inicial.
  useEffect(() => {
    if (isGroup || !peerUid) {
      setPeerFoto(null);
      return;
    }
    let cancel = false;
    const rolPeer = group?.participantsInfo?.[peerUid]?.rol;
    const intentos: [string, string][] =
      rolPeer === "empresa"
        ? [["perfiles_empresas", "logo_url"]]
        : rolPeer === "universidad"
          ? [["perfiles_universidades", "logo_url"]]
          : rolPeer === "estudiante"
            ? [["perfiles_estudiantes", "foto_url"]]
            : [
                ["perfiles_empresas", "logo_url"],
                ["perfiles_universidades", "logo_url"],
                ["perfiles_estudiantes", "foto_url"],
              ];
    (async () => {
      for (const [col, field] of intentos) {
        try {
          const s = await getDoc(doc(db, col, peerUid));
          if (!cancel && s.exists()) {
            const url = (s.data() as any)?.[field];
            if (url) {
              setPeerFoto(url);
              return;
            }
          }
        } catch {
          /* sin permiso → probamos la siguiente colección */
        }
      }
      if (!cancel) setPeerFoto(null);
    })();
    return () => {
      cancel = true;
    };
  }, [isGroup, peerUid, group?.participantsInfo]);

  // ── Inyecta un mensaje de sistema en la subcolección messages ──
  const inyectarMensajeSistema = useCallback(
    (texto: string) => {
      if (!chatId) return;
      const ref = doc(collection(db, "chats", chatId, "messages"));
      void setDoc(ref, {
        _id: ref.id,
        text: texto,
        type: "system",
        system: true,
        createdAt: serverTimestamp(),
        user: { _id: "system", name: "Sistema" },
      });
    },
    [chatId],
  );

  // ── Marcar la pasantía como finalizada (universidad o empresa) ──
  const [finalizando, setFinalizando] = useState(false);

  // Finaliza la pasantía; `constanciaUrl` opcional (PDF escaneado subido).
  const doFinalizar = useCallback(
    async (constanciaUrl?: string) => {
      if (!ctx?.solicitudId) return;
      setFinalizando(true);
      try {
        await finalizarPasantia(ctx.solicitudId, user?.uid, constanciaUrl);
        inyectarMensajeSistema(
          "La pasantía fue marcada como finalizada. Se emitió la constancia y la universidad podrá certificarla. Por favor completen su evaluación de experiencia.",
        );
        setCtx((p) => (p ? { ...p, estado: "finalizado" } : p));
      } catch (error) {
        console.warn("Error finalizando pasantía:", error);
        Alert.alert("Error", "No se pudo finalizar la pasantía. Intenta de nuevo.");
      } finally {
        setFinalizando(false);
      }
    },
    [ctx?.solicitudId, inyectarMensajeSistema, user?.uid],
  );

  // Elige un PDF, lo sube a Storage y finaliza con esa constancia.
  const subirConstanciaYFinalizar = useCallback(async () => {
    if (!ctx?.solicitudId) return;
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      setFinalizando(true);
      const url = await subirConstanciaPdf(ctx.solicitudId, res.assets[0].uri);
      await doFinalizar(url);
    } catch (error) {
      console.warn("Error subiendo constancia:", error);
      Alert.alert("Error", "No se pudo subir la constancia. Intenta de nuevo.");
      setFinalizando(false);
    }
  }, [ctx?.solicitudId, doFinalizar]);

  const onFinalizarPasantia = useCallback(() => {
    if (!ctx?.solicitudId) return;
    // La subida de PDF solo la puede hacer la empresa (regla de Storage).
    const opciones: any[] = [
      { text: "Constancia automática", onPress: () => doFinalizar() },
    ];
    if (isEmpresa) {
      opciones.push({ text: "Subir PDF escaneado", onPress: subirConstanciaYFinalizar });
    }
    opciones.push({ text: "Cancelar", style: "cancel" });
    Alert.alert(
      "Finalizar pasantía",
      "Elige cómo emitir la constancia. Se habilitará la evaluación de experiencia para ambas partes.",
      opciones,
    );
  }, [ctx?.solicitudId, isEmpresa, doFinalizar, subirConstanciaYFinalizar]);

  // Si el usuario captura, registra un aviso de sistema en el propio chat.
  useEffect(() => {
    if (Platform.OS === "web") return;
    let subscription: { remove: () => void } | undefined;
    try {
      subscription = ScreenCapture.addScreenshotListener(() => {
        try {
          const nombre = userProfile?.nombre_completo ?? "El usuario";
          inyectarMensajeSistema(`${nombre} tomó una captura de pantalla`);
        } catch (error) {
          console.warn("No se pudo registrar la captura:", error);
        }
      });
    } catch (error) {
      console.warn("addScreenshotListener no disponible:", error);
    }
    return () => subscription?.remove();
  }, [userProfile?.nombre_completo, inyectarMensajeSistema]);

  // ── Chats activos del usuario (para el modal de reenvío) ──
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeUserChats(user.uid, setMisChats, () => {});
    return unsub;
  }, [user?.uid]);

  // ── Metadatos del chat en tiempo real (grupo, admins, settings) ──
  useEffect(() => {
    if (!chatId) return;
    const unsub = onSnapshot(
      doc(db, "chats", chatId),
      (snap) => {
        const d = snap.data() as any;
        if (!d) {
          setGroup(null);
          return;
        }
        setGroup({
          type: d.type ?? "direct",
          name: d.name ?? "",
          admins: Array.isArray(d.admins) ? d.admins : [],
          users: Array.isArray(d.users) ? d.users : [],
          adminsOnly: !!d.settings?.adminsOnly,
          contexto: d.contexto ?? "",
          participantsInfo: (d.participantsInfo ?? {}) as Record<
            string,
            { nombre: string; rol: string; foto?: string | null }
          >,
        });
        // Mapa de "última lectura" por usuario → alimenta el recibo "Visto".
        const lr = (d.lastRead ?? {}) as Record<string, any>;
        const parsed: Record<string, Date> = {};
        Object.keys(lr).forEach((u) => {
          const fecha = lr[u]?.toDate?.();
          if (fecha) parsed[u] = fecha;
        });
        setLastReadMap(parsed);
        // Marca de "vaciado" propia (oculta mensajes anteriores solo para mí).
        const mi = user?.uid;
        const ca = mi ? (d.clearedAt ?? {})[mi]?.toDate?.() ?? null : null;
        setClearedAtMe(ca);
        // Indicador "está escribiendo…" de los demás participantes.
        setEscribiendo(parseEscribiendo(d, mi ?? ""));
      },
      (error) => console.warn("Error en listener (chat doc):", error),
    );
    return unsub;
  }, [chatId]);

  // ── "Está escribiendo…": emisión ────────────────────────────────
  // Se avisa como MUCHO una vez cada TYPING_THROTTLE_MS mientras se teclea
  // (una escritura por tecla saturaría Firestore y la cuota), y se limpia al
  // dejar de escribir, al enviar y al salir de la sala.
  const ultimoAvisoRef = useRef(0);
  const paroTecleoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const avisarTecleo = useCallback(
    (texto: string) => {
      const uid = user?.uid;
      if (!chatId || !uid) return;

      if (paroTecleoRef.current) clearTimeout(paroTecleoRef.current);

      if (!texto.trim()) {
        ultimoAvisoRef.current = 0;
        void setTyping(chatId, uid, giftedUser.name ?? "", false);
        return;
      }

      const ahora = Date.now();
      if (ahora - ultimoAvisoRef.current > TYPING_THROTTLE_MS) {
        ultimoAvisoRef.current = ahora;
        void setTyping(chatId, uid, giftedUser.name ?? "", true);
      }
      // Si deja de teclear, la marca se retira sola.
      paroTecleoRef.current = setTimeout(() => {
        ultimoAvisoRef.current = 0;
        void setTyping(chatId, uid, giftedUser.name ?? "", false);
      }, TYPING_VIGENCIA_MS);
    },
    [chatId, user?.uid, giftedUser.name],
  );

  // Al cambiar de sala o desmontar: limpiar la marca para no dejarla colgada.
  useEffect(() => {
    return () => {
      if (paroTecleoRef.current) clearTimeout(paroTecleoRef.current);
      const uid = user?.uid;
      if (chatId && uid) void setTyping(chatId, uid, giftedUser.name ?? "", false);
    };
  }, [chatId, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // El doc del chat no re-emite cuando la marca ajena simplemente CADUCA, así
  // que se programa una reevaluación local para que el indicador desaparezca.
  useEffect(() => {
    if (escribiendo.length === 0) return;
    const t = setTimeout(() => setEscribiendo([]), TYPING_VIGENCIA_MS);
    return () => clearTimeout(t);
  }, [escribiendo]);

  // ── Carga del contexto: chat → solicitud → nombre de empresa ──
  useEffect(() => {
    if (!chatId) return;
    let cancelado = false;

    (async () => {
      try {
        const chatSnap = await getDoc(doc(db, "chats", chatId));
        if (!chatSnap.exists()) return;
        const chat = chatSnap.data() as any;

        const solicitudId: string = chat.solicitudId ?? "";
        let alumnos: AlumnoRef[] = [];
        let carrera = "";
        let fechaInicio = "";
        let fechaFin = "";
        let estado = "";

        if (solicitudId) {
          const solSnap = await getDoc(
            doc(db, "solicitudes_practicas", solicitudId),
          );
          if (solSnap.exists()) {
            const sol = solSnap.data() as any;
            alumnos = Array.isArray(sol.alumnos) ? sol.alumnos : [];
            carrera = sol.carrera ?? "";
            fechaInicio = sol.fechaInicio ?? "";
            fechaFin = sol.fechaFin ?? "";
            estado = sol.estado ?? "";
          }
        }

        let empresaNombre = "la empresa";
        if (chat.empresaId) {
          const empSnap = await getDoc(
            doc(db, "perfiles_empresas", chat.empresaId),
          );
          if (empSnap.exists()) {
            empresaNombre =
              (empSnap.data() as any).nombre_empresa ?? empresaNombre;
          }
        }

        if (cancelado) return;
        setCtx({
          empresaId: chat.empresaId ?? "",
          universidadId: chat.universidadId ?? "",
          grupoId: chat.grupoId ?? "",
          solicitudId,
          empresaNombre,
          carrera,
          fechaInicio,
          fechaFin,
          alumnos,
          estado,
        });
      } catch (error) {
        console.warn("Error cargando contexto del chat:", error);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [chatId]);

  // ── Sincronización en tiempo real con la subcolección messages ──
  useEffect(() => {
    if (!chatId) return;

    const q = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("createdAt", "desc"),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const mapped: ChatMessage[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            _id: data._id ?? d.id,
            text: data.text ?? "",
            // serverTimestamp() llega null en el snapshot local optimista.
            createdAt: data.createdAt?.toDate?.() ?? new Date(),
            user: {
              _id: data.user?._id ?? "anon",
              name: data.user?.name ?? "",
              avatar: data.user?.avatar ?? undefined,
            },
            system: data.system ?? false,
            type: data.type ?? "text",
            scheduleData: data.scheduleData,
            acuerdo: data.acuerdo,
            groupOffer: data.groupOffer,
            approved: data.approved ?? false,
            isDeleted: data.isDeleted ?? false,
            isEdited: data.isEdited ?? false,
            forwarded: data.forwarded ?? false,
            replyMessage: data.replyMessage ?? undefined,
          };
        });
        setMessages(mapped);
      },
      (error) => console.warn("Error en listener (messages):", error),
    );

    return unsub;
  }, [chatId]);

  // ── Envío / edición de mensajes de texto ──
  const onSend = useCallback(
    (nuevos: IMessage[] = []) => {
      if (!chatId) return;
      // Al enviar ya no se está escribiendo: retirar la marca de inmediato
      // (si no, el destinatario vería "escribiendo…" junto al mensaje ya recibido).
      avisarTecleo("");

      // Modo edición: actualiza el mensaje existente en vez de crear uno nuevo.
      if (editing) {
        const nuevoTexto = (nuevos[0]?.text ?? inputText).trim();
        if (nuevoTexto) {
          void updateDoc(
            doc(db, "chats", chatId, "messages", String(editing._id)),
            { text: nuevoTexto, isEdited: true, editedAt: serverTimestamp() },
          );
        }
        setEditing(null);
        setReplyTo(null);
        setInputText("");
        return;
      }

      nuevos.forEach((m) => {
        const ref = doc(db, "chats", chatId, "messages", String(m._id));
        const payload: Record<string, unknown> = {
          _id: String(m._id),
          text: m.text,
          type: "text",
          // Hora exacta del servidor (no la del dispositivo).
          createdAt: serverTimestamp(),
          user: { _id: giftedUser._id, name: giftedUser.name },
        };
        // Adjunta la cita del mensaje original al responder. Firestore NO
        // acepta `undefined` (p. ej. user.avatar), así que limpiamos el objeto.
        if (replyTo) {
          const u = (replyTo as any).user ?? {};
          const cleanUser: Record<string, unknown> = {
            _id: u._id ?? "",
            name: u.name ?? "",
          };
          if (u.avatar) cleanUser.avatar = u.avatar;
          payload.replyMessage = {
            _id: String((replyTo as any)._id ?? ""),
            text: (replyTo as any).text ?? "",
            user: cleanUser,
          };
        }
        void setDoc(ref, payload);
        void touchChatOnMessage(chatId, m.text, giftedUser._id, chatUsers);
      });

      setReplyTo(null);
      setInputText("");
    },
    [chatId, editing, inputText, replyTo, giftedUser._id, giftedUser.name, chatUsers],
  );

  // ── Acciones del menú long-press ──
  const startReply = useCallback((msg: ChatMessage) => {
    setActionMsg(null);
    setReplyTo({
      _id: msg._id,
      text: msg.isDeleted ? "Mensaje eliminado" : msg.text,
      user: msg.user,
    });
  }, []);

  const startEdit = useCallback((msg: ChatMessage) => {
    setActionMsg(null);
    setReplyTo(null);
    setEditing(msg);
    setInputText(msg.text);
  }, []);

  const cancelarComposer = useCallback(() => {
    setReplyTo(null);
    setEditing(null);
    setInputText("");
  }, []);

  const eliminarMensaje = useCallback(
    (msg: ChatMessage) => {
      setActionMsg(null);
      if (!chatId) return;
      // Borrado lógico: nunca se elimina el documento.
      void updateDoc(doc(db, "chats", chatId, "messages", String(msg._id)), {
        text: "Mensaje eliminado",
        isDeleted: true,
      });
    },
    [chatId],
  );

  // Reenvía el texto del mensaje a otro chat activo.
  const reenviarA = useCallback(
    (destino: ChatListItem) => {
      const msg = forwardMsg;
      setForwardMsg(null);
      if (!msg) return;
      const ref = doc(collection(db, "chats", destino.id, "messages"));
      void setDoc(ref, {
        _id: ref.id,
        text: msg.text,
        type: "text",
        forwarded: true, // → muestra la etiqueta "Reenviado" en el destino.
        createdAt: serverTimestamp(),
        user: { _id: giftedUser._id, name: giftedUser.name },
      });
      void touchChatOnMessage(destino.id, msg.text, giftedUser._id, destino.users);
    },
    [forwardMsg, giftedUser._id, giftedUser.name],
  );

  // ── Panel de administración del grupo ──
  const abrirGroupInfo = useCallback(() => {
    if (!isGroup) return;
    setNombreEdit(group?.name ?? "");
    // Arranca sin overlays abiertos (evita reaperturas fantasma).
    setShowAddMember(false);
    setAccionMiembro(null);
    setShowGroupInfo(true);

    // Nombres + foto desde `participantsInfo` del propio chat (NO desde
    // `usuarios/{uid}`, cuya lectura niegan las reglas para la universidad).
    const uids = group?.users ?? [];
    const info = group?.participantsInfo ?? {};
    setParticipantes(
      uids.map((u) => ({
        uid: u,
        nombre:
          info[u]?.nombre ?? (u === user?.uid ? "Tú" : "Participante"),
        rol: info[u]?.rol ?? "",
        foto: info[u]?.foto ?? null,
      })),
    );
  }, [isGroup, group?.name, group?.users, group?.participantsInfo, user?.uid]);

  // ── Añadir integrantes (solo admin universidad): carga sus estudiantes ──
  const abrirAddMember = useCallback(async () => {
    if (!user?.uid) return;
    setShowAddMember(true);
    setLoadingCand(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, "perfiles_estudiantes"),
          where("universidad_id", "==", user.uid),
        ),
      );
      const yaEstan = new Set(group?.users ?? []);
      const items = snap.docs
        .filter((d) => !yaEstan.has(d.id))
        .map((d) => ({
          uid: d.id,
          nombre: String((d.data() as any)?.nombre_completo ?? "Estudiante"),
          foto: (d.data() as any)?.foto_url ?? null,
        }));
      setCandidatos(items);
    } catch (error) {
      console.warn("Error cargando candidatos:", error);
      setCandidatos([]);
    } finally {
      setLoadingCand(false);
    }
  }, [user?.uid, group?.users]);

  // Añade un usuario al grupo (arrayUnion users + participantsInfo). El admin
  // puede actualizar el chat según las reglas de Firestore.
  const agregarMiembro = useCallback(
    async (cand: { uid: string; nombre: string; foto?: string | null }) => {
      if (!chatId || !isAdmin) return;
      try {
        await updateDoc(doc(db, "chats", chatId), {
          users: arrayUnion(cand.uid),
          [`participantsInfo.${cand.uid}`]: {
            nombre: cand.nombre,
            rol: "estudiante",
            foto: cand.foto ?? null,
          },
        });
        setCandidatos((prev) => prev.filter((c) => c.uid !== cand.uid));
        setParticipantes((prev) =>
          prev.some((p) => p.uid === cand.uid)
            ? prev
            : [...prev, { uid: cand.uid, nombre: cand.nombre, rol: "estudiante", foto: cand.foto ?? null }],
        );
      } catch (error) {
        console.warn("Error agregando miembro:", error);
        Alert.alert("Error", "No se pudo agregar al integrante.");
      }
    },
    [chatId, isAdmin],
  );

  const renombrarGrupo = useCallback(() => {
    const nombre = nombreEdit.trim();
    if (!chatId || !isAdmin || !nombre) return;
    void updateDoc(doc(db, "chats", chatId), { name: nombre });
  }, [chatId, isAdmin, nombreEdit]);

  const toggleAdminsOnly = useCallback(
    (value: boolean) => {
      if (!chatId || !isAdmin) return;
      void updateDoc(doc(db, "chats", chatId), {
        "settings.adminsOnly": value,
      });
    },
    [chatId, isAdmin],
  );

  const expulsarParticipante = useCallback(
    (uid: string) => {
      if (!chatId || !isAdmin) return;
      if ((group?.admins ?? []).includes(uid)) return; // No se expulsa a un admin.
      void updateDoc(doc(db, "chats", chatId), { users: arrayRemove(uid) });
      setParticipantes((prev) => prev.filter((p) => p.uid !== uid));
    },
    [chatId, isAdmin, group?.admins],
  );

  // Menú contextual al mantener pulsado un mensaje.
  const onLongPressMessage = useCallback(
    (_context: unknown, message: ChatMessage) => {
      if (message.system || message.type === "system") return;
      setActionMsg(message);
    },
    [],
  );

  // Render del texto: borrado en cursiva + etiqueta "Editado".
  const renderMessageText = useCallback(
    (props: MessageTextProps<ChatMessage>) => {
      const msg = props.currentMessage;
      if (msg?.isDeleted) {
        return (
          <Text style={styles.deletedText}>
            <Ionicons name="ban-outline" size={13} color={C.textMuted} />{" "}
            Mensaje eliminado
          </Text>
        );
      }
      if (msg?.isEdited) {
        return (
          <View>
            <TranslatedMessageText {...props} />
            <Text style={styles.editedLabel}>Editado</Text>
          </View>
        );
      }
      return <TranslatedMessageText {...props} />;
    },
    [C, styles],
  );

  // ── Burbujas: salientes en acento, entrantes en morado oscuro suave ──
  // `maxWidth` en % fuerza el ajuste de línea (wrap) de los mensajes largos,
  // que antes en web podían no dividirse en párrafo.
  const renderBubble = useCallback(
    (props: BubbleProps<ChatMessage>) => {
      const esMio = props.position === "right";
      const msg = props.currentMessage;
      const esSistema = !!msg?.system || msg?.type === "system";
      // "Visto" solo aplica a chats 1:1 (en grupos hay múltiples lectores).
      const peerLeido = !isGroup && peerUid ? lastReadMap[peerUid] ?? null : null;
      // Nombre del remitente sobre las burbujas entrantes de un grupo.
      const sid = msg?.user?._id ? String(msg.user._id) : "";
      const nombreRemitente =
        group?.participantsInfo?.[sid]?.nombre ?? msg?.user?.name ?? "";
      const mostrarNombre = !esMio && isGroup && !!msg && !esSistema && !!nombreRemitente;
      return (
        // El contenedor lleva el maxWidth (no la burbuja interna): así el ancho
        // se resuelve contra la fila del mensaje y NO se desborda en móvil-web.
        <View
          style={{
            maxWidth: "82%",
            alignItems: esMio ? "flex-end" : "flex-start",
          }}
        >
          {mostrarNombre ? (
            <TouchableOpacity
              disabled={!sid}
              activeOpacity={0.6}
              onPress={() => {
                const rol = group?.participantsInfo?.[sid]?.rol ?? "";
                const tipo = (["estudiante", "empresa", "universidad"].includes(rol)
                  ? rol
                  : "estudiante") as ProfileTipo;
                setVerPerfil({ tipo, id: sid });
              }}
            >
              <Text style={styles.senderName} numberOfLines={1}>
                {nombreRemitente}
              </Text>
            </TouchableOpacity>
          ) : null}
          {msg?.forwarded && !esSistema ? (
            <View
              style={[
                styles.reenviadoLabel,
                { alignSelf: esMio ? "flex-end" : "flex-start" },
              ]}
            >
              <Ionicons name="arrow-redo-outline" size={11} color={C.textMuted} />
              <Text style={styles.reenviadoText}>Reenviado</Text>
            </View>
          ) : null}
          {msg?.replyMessage && !esSistema ? (
            <View
              style={[
                styles.replyQuote,
                { alignSelf: esMio ? "flex-end" : "flex-start" },
              ]}
            >
              <View style={styles.replyQuoteBar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.replyQuoteName} numberOfLines={1}>
                  {msg.replyMessage.user?.name || "Mensaje"}
                </Text>
                <Text style={styles.replyQuoteText} numberOfLines={1}>
                  {msg.replyMessage.text}
                </Text>
              </View>
            </View>
          ) : null}
          <Bubble
            {...props}
            wrapperStyle={{
              right: {
                backgroundColor: C.bubbleMine,
                borderRadius: 18,
                marginVertical: 2,
                paddingHorizontal: 2,
                paddingVertical: 1,
              },
              left: {
                backgroundColor: C.bubbleOther,
                borderRadius: 18,
                marginVertical: 2,
                borderWidth: 1,
                borderColor: C.border,
                paddingHorizontal: 2,
                paddingVertical: 1,
              },
            }}
            textStyle={{
              // Burbuja propia en el color primario (saturado en ambos temas)
              // → texto blanco; la de la contraparte usa el texto normal del
              // tema sobre su superficie de tarjeta.
              right: { color: C.bubbleMineText, fontSize: 15, lineHeight: 21 },
              left: { color: C.bubbleOtherText, fontSize: 15, lineHeight: 21 },
            }}
          />
          {/* Recibo "Enviado / Visto" bajo cada mensaje propio (no de sistema). */}
          {esMio && msg && !esSistema ? (
            <Text style={styles.recibo}>{reciboTexto(msg, peerLeido)}</Text>
          ) : null}
        </View>
      );
    },
    [isGroup, peerUid, lastReadMap, group?.participantsInfo, C, styles],
  );

  // ── Barra de entrada con aspecto flotante (neumórfico sutil) ──
  const renderInputToolbarStyled = useCallback(
    (props: ComponentProps<typeof InputToolbar>) => (
      <InputToolbar
        {...props}
        containerStyle={[
          styles.inputToolbar,
          { backgroundColor: C.surface, borderTopColor: C.border },
        ]}
        primaryStyle={{ alignItems: "center" }}
      />
    ),
    [C, styles],
  );

  // ── Composer (campo de texto) ──
  // Dos correcciones críticas sobre el Composer por defecto de gifted-chat:
  //  1) BLOQUEO DE ESCRITURA: gifted-chat inyecta `maxLength: isTypingDisabled
  //     ? 0 : ...` en el TextInput. En dispositivos reales (iOS/Android) la
  //     animación del teclado puede dejar `isTypingDisabled` pegado en `true`,
  //     lo que fija `maxLength:0` y deshabilita por completo la escritura.
  //     Forzamos `maxLength: undefined` (sin límite) para que nunca se bloquee.
  //  2) COLOR DEL TEXTO: sin `textInputStyle` el campo usa el negro por defecto
  //     del sistema (ilegible en modo oscuro). Fijamos `C.text` (el color de
  //     texto del tema activo) explícitamente.
  const renderComposerStyled = useCallback(
    (props: ComponentProps<typeof Composer>) => (
      <Composer
        {...props}
        textInputStyle={[props.textInputStyle as any, { color: C.text }]}
        textInputProps={{
          ...props.textInputProps,
          maxLength: undefined,
        }}
      />
    ),
    [C],
  );

  // ── Botón de enviar redondo con el ícono de acento ──
  const renderSend = useCallback(
    (props: ComponentProps<typeof Send>) => (
      <Send {...props} containerStyle={styles.sendContainer}>
        <View style={styles.sendBtn}>
          <Ionicons name="send" size={18} color="#fff" />
        </View>
      </Send>
    ),
    [styles],
  );

  // ── Envío de una propuesta de acuerdo estructurada ──
  // Guarda el acuerdo completo (horario + fechas + pago) y, por compatibilidad
  // con render/recibos antiguos, también el sub-horario `scheduleData`.
  const enviarPropuesta = useCallback(
    (acuerdo: AcuerdoData) => {
      setShowPropuesta(false);
      if (!chatId) return;
      // Si la pasantía ya está aprobada, esta propuesta RENEGOCIA el horario en
      // vez de abrirla: se marca para que la contraparte vea "Aceptar cambio" y
      // se aplique con `modificarAcuerdo` (que conserva el pago y el estado).
      const esCambio = ctx?.estado === "aprobado";
      const ref = doc(collection(db, "chats", chatId, "messages"));
      void setDoc(ref, {
        _id: ref.id,
        text: "", // El contenido se renderiza como tarjeta (renderCustomView).
        type: "proposal",
        acuerdo,
        scheduleData: acuerdoToSchedule(acuerdo),
        approved: false,
        cambioHorario: esCambio,
        createdAt: serverTimestamp(),
        user: { _id: giftedUser._id, name: giftedUser.name },
      });
      void touchChatOnMessage(
        chatId,
        esCambio ? "🕒 Propuesta de cambio de horario" : "📅 Propuesta de acuerdo",
        giftedUser._id,
        chatUsers,
      );
    },
    [chatId, giftedUser._id, giftedUser.name, chatUsers, ctx?.estado],
  );

  // ── Compartir grupo de estudiantes (acción rápida de la Universidad) ──
  // Carga los grupos de la universidad y abre el selector.
  const abrirCompartirGrupo = useCallback(async () => {
    if (!user?.uid) return;
    setShowCompartirGrupo(true);
    setCargandoGrupos(true);
    try {
      const snap = await getDocs(
        query(collection(db, "grupos"), where("universidad_id", "==", user.uid)),
      );
      const universidadNombre = userProfile?.nombre_completo ?? "Universidad";
      const items: GroupOfferData[] = await Promise.all(
        snap.docs.map(async (d) => {
          const data = d.data() as any;
          // Cuenta de estudiantes del grupo (denormalizada para la tarjeta).
          let totalEstudiantes = 0;
          try {
            const estSnap = await getDocs(
              query(
                collection(db, "perfiles_estudiantes"),
                where("grupo_id", "==", d.id),
              ),
            );
            totalEstudiantes = estSnap.size;
          } catch {
            totalEstudiantes = 0;
          }
          return {
            grupoId: d.id,
            grupoNombre: (data.nombre as string) ?? "Grupo",
            carrera: (data.carrera as string) ?? "",
            totalEstudiantes,
            universidadId: user.uid,
            universidadNombre,
          };
        }),
      );
      setGruposUni(items);
    } catch (error) {
      console.warn("Error cargando grupos para compartir:", error);
      setGruposUni([]);
    } finally {
      setCargandoGrupos(false);
    }
  }, [user?.uid, userProfile?.nombre_completo]);

  // Envía la tarjeta interactiva del grupo al chat (mensaje type: 'group_offer').
  const compartirGrupo = useCallback(
    (grupo: GroupOfferData) => {
      if (!chatId || compartiendoGrupo) return;
      setCompartiendoGrupo(true);
      try {
        const ref = doc(collection(db, "chats", chatId, "messages"));
        void setDoc(ref, {
          _id: ref.id,
          text: "", // El contenido se renderiza como tarjeta (renderCustomView).
          type: "group_offer",
          groupOffer: grupo,
          createdAt: serverTimestamp(),
          user: { _id: giftedUser._id, name: giftedUser.name },
        });
        void touchChatOnMessage(
          chatId,
          `👥 Grupo compartido: ${grupo.grupoNombre}`,
          giftedUser._id,
          chatUsers,
        );
      } finally {
        setCompartiendoGrupo(false);
        setShowCompartirGrupo(false);
      }
    },
    [chatId, compartiendoGrupo, giftedUser._id, giftedUser.name, chatUsers],
  );

  // ── La empresa acepta el grupo compartido (crea solicitud + sala) ──
  const onAceptarGrupo = useCallback(
    async (msg: ChatMessage) => {
      const g = msg.groupOffer;
      if (!chatId || !g || !ctx || !isEmpresa) return;
      if (msg.approved || aceptandoGrupo) return;

      setAceptandoGrupo(String(msg._id));
      try {
        const res = await aceptarGrupoCompartido({
          universidadId: g.universidadId,
          universidadNombre: g.universidadNombre,
          empresaId: ctx.empresaId,
          empresaNombre: ctx.empresaNombre,
          grupoId: g.grupoId,
          grupoNombre: g.grupoNombre,
          carrera: g.carrera,
        });

        // Marca la tarjeta como aceptada.
        await updateDoc(
          doc(db, "chats", chatId, "messages", String(msg._id)),
          { approved: true },
        );

        // Mensaje de sistema en el chat actual.
        const sysRef = doc(collection(db, "chats", chatId, "messages"));
        await setDoc(sysRef, {
          _id: sysRef.id,
          text: `Se aceptó el grupo "${g.grupoNombre}" (${res.totalAlumnos} estudiante(s)) y se creó su sala de pasantía.`,
          type: "system",
          system: true,
          createdAt: serverTimestamp(),
          user: { _id: "system", name: "Sistema" },
        });

        // Abre la sala de pasantía recién creada para coordinar el horario.
        // Si hay un orquestador embebido (sección "Mensajes" del dashboard),
        // se queda dentro de esa misma sección; si no, navega como antes.
        if (onOpenChat) {
          onOpenChat(res.chatId, g.universidadNombre);
        } else {
          router.push({
            pathname: "/ChatScreen",
            params: { chatId: res.chatId, peerName: g.universidadNombre },
          } as any);
        }
      } catch (error) {
        console.warn("Error aceptando grupo compartido:", error);
        Alert.alert("Error", "No se pudo aceptar el grupo. Intenta de nuevo.");
      } finally {
        setAceptandoGrupo(null);
      }
    },
    [chatId, ctx, isEmpresa, aceptandoGrupo, router, onOpenChat],
  );

  // ── Firma del acuerdo: la acepta la CONTRAPARTE (la que no la envió) ──
  // Tanto la Universidad como la Empresa pueden firmar. La lógica atómica vive
  // en `firmarAcuerdo` (solicitud→aprobado, notificaciones, transacciones).
  const aprobarAcuerdo = useCallback(
    async (message: ChatMessage) => {
      if (!chatId || !ctx) return;
      // Solo participantes del handshake (uni o empresa), nunca el emisor.
      if (!isUni && !isEmpresa) return;
      if (String(message.user?._id) === String(user?.uid)) return;
      if (aprobando || message.approved) return;

      // Acuerdo completo del mensaje; fallback para propuestas antiguas que solo
      // traían `scheduleData` (sin fechas ni pago).
      const acuerdo: AcuerdoData =
        message.acuerdo ??
        (message.scheduleData
          ? {
              ...message.scheduleData,
              fechaInicio: ctx.fechaInicio || new Date().toISOString().slice(0, 10),
              fechaFin: ctx.fechaFin || "",
              pago: { tipo: "sin_pago" },
            }
          : (null as any));
      if (!acuerdo) return;

      setAprobando(true);
      try {
        // Renegociación: la pasantía ya está aprobada y esta propuesta solo
        // cambia el horario → `modificarAcuerdo` (conserva pago y estado).
        if (message.cambioHorario) {
          const res = await modificarAcuerdo({
            solicitudId: ctx.solicitudId,
            chatId,
            messageId: String(message._id),
            universidadId: ctx.universidadId,
            empresaId: ctx.empresaId,
            empresaNombre: ctx.empresaNombre,
            grupoId: ctx.grupoId,
            aceptadoPor: user?.uid ?? "",
            acuerdo,
          });
          Alert.alert(
            "Horario actualizado",
            `El nuevo horario rige del ${res.fechaInicio} al ${res.fechaFin}. ` +
              `Se notificó a ${res.totalEstudiantes} estudiante(s).`,
          );
          return;
        }

        const res = await firmarAcuerdo({
          solicitudId: ctx.solicitudId,
          chatId,
          messageId: String(message._id),
          universidadId: ctx.universidadId,
          empresaId: ctx.empresaId,
          empresaNombre: ctx.empresaNombre,
          grupoId: ctx.grupoId,
          carrera: ctx.carrera,
          firmadoPor: user?.uid ?? "",
          acuerdo,
        });
        // Refleja el nuevo estado localmente (habilita "finalizar pasantía").
        setCtx((p) => (p ? { ...p, estado: "aprobado" } : p));
        setAcuerdoFirmado(res); // Abre el modal "Inicio de la pasantía".
      } catch (error: any) {
        console.warn("Error procesando el acuerdo:", error);
        Alert.alert("Error", error?.message ?? "No se pudo procesar el acuerdo. Intenta de nuevo.");
      } finally {
        setAprobando(false);
      }
    },
    [chatId, ctx, user?.uid, isUni, isEmpresa, aprobando],
  );

  // ── Tarjeta visual para los mensajes type: 'proposal' ──
  const renderCustomView = useCallback(
    (props: BubbleProps<ChatMessage>) => {
      const msg = props.currentMessage;

      // Tarjeta de grupo compartido por la Universidad.
      if (msg?.type === "group_offer" && msg.groupOffer) {
        const g = msg.groupOffer;
        const aceptado = !!msg.approved;
        const procesando = aceptandoGrupo === String(msg._id);
        return (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="people" size={16} color={C.accent} />
              <Text style={styles.cardTitle}>Grupo de estudiantes</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Grupo</Text>
              <Text style={styles.cardValue} numberOfLines={1}>
                {g.grupoNombre}
              </Text>
            </View>
            {!!g.carrera && (
              <View style={styles.cardRow}>
                <Text style={styles.cardLabel}>Carrera</Text>
                <Text style={styles.cardValue} numberOfLines={1}>
                  {g.carrera}
                </Text>
              </View>
            )}
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Estudiantes</Text>
              <Text style={styles.cardValue}>{g.totalEstudiantes}</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Universidad</Text>
              <Text style={styles.cardValue} numberOfLines={1}>
                {g.universidadNombre}
              </Text>
            </View>

            <View style={styles.cardDivider} />

            {aceptado ? (
              <View style={[styles.statusPill, styles.statusApproved]}>
                <Ionicons name="checkmark-circle" size={16} color={C.green} />
                <Text style={[styles.statusText, { color: C.green }]}>
                  Grupo aceptado
                </Text>
              </View>
            ) : isEmpresa ? (
              <TouchableOpacity
                style={[styles.approveBtn, procesando && { opacity: 0.6 }]}
                onPress={() => onAceptarGrupo(msg)}
                disabled={procesando}
                activeOpacity={0.9}
              >
                {procesando ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                    <Text style={styles.approveBtnText}>Aceptar grupo</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <View style={[styles.statusPill, styles.statusWaiting]}>
                <Ionicons name="time-outline" size={16} color={C.muted} />
                <Text style={[styles.statusText, { color: C.muted }]}>
                  Esperando respuesta de la empresa...
                </Text>
              </View>
            )}
          </View>
        );
      }

      if (!msg || msg.type !== "proposal") return null;
      // Acuerdo del mensaje (nuevo) o derivado del sub-horario (antiguo).
      const ac = msg.acuerdo;
      const s = ac ?? msg.scheduleData;
      if (!s) return null;
      const aprobado = !!msg.approved;
      const conPago = ac?.pago?.tipo === "con_pago";
      // La firma la hace la contraparte: cualquier participante que NO la envió.
      const esEmisor = String(msg.user?._id) === String(user?.uid);
      const puedeFirmar = (isUni || isEmpresa) && !esEmisor;

      return (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons
              name={msg.cambioHorario ? "time" : "document-text"}
              size={16}
              color={C.accent}
            />
            <Text style={styles.cardTitle}>
              {msg.cambioHorario ? "Cambio de horario propuesto" : "Propuesta de acuerdo"}
            </Text>
          </View>

          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Días</Text>
            <Text style={styles.cardValue}>{s.dias.join(", ")}</Text>
          </View>
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Horario</Text>
            <Text style={styles.cardValue}>
              {s.horaInicio} - {s.horaFin}
            </Text>
          </View>
          {ac?.fechaInicio ? (
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Periodo</Text>
              <Text style={styles.cardValue}>
                {ac.fechaInicio} → {ac.fechaFin}
              </Text>
            </View>
          ) : null}
          {/* En una renegociación el pago NO se toca: mostrarlo confundiría
              (el modal lo oculta y enviaría "sin pago", pero se conserva). */}
          {ac?.pago && !msg.cambioHorario ? (
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Pago</Text>
              <Text
                style={[
                  styles.cardValue,
                  conPago && { color: C.green },
                ]}
              >
                {conPago
                  ? `$${Number(ac.pago.monto ?? 0).toFixed(2)} / estudiante`
                  : "Sin pago"}
              </Text>
            </View>
          ) : null}

          <View style={styles.cardDivider} />

          {aprobado ? (
            <View style={[styles.statusPill, styles.statusApproved]}>
              <Ionicons name="checkmark-circle" size={16} color={C.green} />
              <Text style={[styles.statusText, { color: C.green }]}>
                {msg.cambioHorario ? "Cambio aplicado" : "Acuerdo aprobado"}
              </Text>
            </View>
          ) : puedeFirmar ? (
            <TouchableOpacity
              style={[styles.approveBtn, aprobando && { opacity: 0.6 }]}
              onPress={() => aprobarAcuerdo(msg)}
              disabled={aprobando}
              activeOpacity={0.9}
            >
              {aprobando ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons
                    name={msg.cambioHorario ? "time-outline" : "ribbon-outline"}
                    size={16}
                    color="#fff"
                  />
                  <Text style={styles.approveBtnText}>
                    {msg.cambioHorario ? "Aceptar cambio" : "Aceptar acuerdo"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <View style={[styles.statusPill, styles.statusWaiting]}>
              <Ionicons name="time-outline" size={16} color={C.muted} />
              <Text style={[styles.statusText, { color: C.muted }]}>
                Esperando que la contraparte acepte...
              </Text>
            </View>
          )}
        </View>
      );
    },
    [isEmpresa, isUni, user?.uid, aprobando, aprobarAcuerdo, aceptandoGrupo, onAceptarGrupo, C, styles],
  );

  // ── Avatar (foto/logo) a la izquierda de cada burbuja entrante ──
  const renderAvatar = useCallback(
    (props: { currentMessage?: ChatMessage }) => {
      const uid = props.currentMessage?.user?._id;
      const foto = uid ? group?.participantsInfo?.[String(uid)]?.foto : null;
      return <StorageAvatar url={foto ?? null} size={30} fallbackIcon="person" />;
    },
    [group?.participantsInfo],
  );

  // ── Copiar el contenido de un mensaje al portapapeles ──
  const copiarMensaje = useCallback((msg: ChatMessage) => {
    setActionMsg(null);
    const texto = msg?.text ?? "";
    if (!texto) return;
    void Clipboard.setStringAsync(texto).catch(() => {});
  }, []);

  // ── Vaciar el chat SOLO para mí (no borra para los demás) ──
  const vaciarChatParaMi = useCallback(() => {
    if (!chatId || !user?.uid) return;
    Alert.alert(
      "Vaciar chat",
      "Se ocultarán todos los mensajes solo en tu vista. Los demás participantes seguirán viéndolos.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Vaciar",
          style: "destructive",
          onPress: () => {
            void updateDoc(doc(db, "chats", chatId), {
              [`clearedAt.${user.uid}`]: serverTimestamp(),
            }).catch(() => {});
            setClearedAtMe(new Date());
            setShowGroupInfo(false);
          },
        },
      ],
    );
  }, [chatId, user?.uid]);

  // Mensajes visibles tras aplicar el "vaciado" propio.
  const mensajesVisibles = useMemo(() => {
    if (!clearedAtMe) return messages;
    const corte = clearedAtMe.getTime();
    return messages.filter((m) => {
      const t = m.createdAt instanceof Date ? m.createdAt.getTime() : Number(m.createdAt);
      return t > corte;
    });
  }, [messages, clearedAtMe]);

  const tituloHeader = isGroup ? group?.name || "Grupo" : peerName || "Chat de pasantía";
  const inicial = tituloHeader?.trim()?.[0]?.toUpperCase() ?? "?";
  const estadoTexto = isGroup
    ? `${group?.users.length ?? 0} participantes${isAdmin ? " · Admin" : ""}`
    : presenciaTexto(peerOnline, peerLastSeen);

  const header = (
    <View style={styles.header}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>
      ) : null}

      {isGroup ? (
        <View style={styles.headerAvatar}>
          <Ionicons name="people" size={20} color={C.accent} />
        </View>
      ) : (
        <View>
          <StorageAvatar url={peerFoto} size={42} fallbackIcon="person" />
          <View
            style={[
              styles.presenceDot,
              { backgroundColor: peerOnline ? C.green : C.textMuted },
            ]}
          />
        </View>
      )}

      {/* En grupos, pulsar el nombre abre el panel de administración; en
          chats 1:1 abre el perfil público de la contraparte. */}
      <TouchableOpacity
        style={{ flex: 1 }}
        activeOpacity={isGroup || peerUid ? 0.6 : 1}
        disabled={!isGroup && !peerUid}
        onPress={() => {
          if (isGroup) {
            abrirGroupInfo();
            return;
          }
          if (!peerUid) return;
          const rol = group?.participantsInfo?.[peerUid]?.rol ?? "";
          const tipo = (["estudiante", "empresa", "universidad"].includes(rol)
            ? rol
            : "estudiante") as ProfileTipo;
          setVerPerfil({ tipo, id: peerUid });
        }}
      >
        <Text style={styles.headerTitle} numberOfLines={1}>
          {tituloHeader}
        </Text>
        <Text style={styles.headerSub} numberOfLines={1}>
          {estadoTexto}
        </Text>
      </TouchableOpacity>

      {/* Vaciar chat (solo para mi vista). */}
      <TouchableOpacity
        onPress={vaciarChatParaMi}
        style={styles.iconBtn}
        accessibilityLabel="Vaciar chat"
      >
        <Ionicons name="trash-outline" size={20} color={C.textMuted} />
      </TouchableOpacity>

      {/* Reportar a la contraparte — botón explícito (antes solo estaba
          escondido en el menú de mantener presionado un mensaje). En grupos
          el mismo flujo vive en "Detalles del grupo" → tocar un integrante,
          porque ahí sí hay a quién reportar sin ambigüedad. */}
      {!isGroup && peerUid ? (
        <TouchableOpacity
          onPress={() => setReportTarget({ id: peerUid, nombre: peerName || "Usuario" })}
          style={styles.iconBtn}
          accessibilityLabel="Reportar usuario"
        >
          <Ionicons name="flag-outline" size={20} color={C.textMuted} />
        </TouchableOpacity>
      ) : null}

      {/* El handshake de horario solo aplica al flujo de pasantía uni↔empresa,
          no a los grupos ni a los chats directos de recontratación. */}
      {isGroup ? (
        <TouchableOpacity
          onPress={abrirGroupInfo}
          style={styles.iconBtn}
          accessibilityLabel="Detalles del grupo"
        >
          <Ionicons name="information-circle-outline" size={24} color={C.accent} />
        </TouchableOpacity>
      ) : group?.type === "direct" ? null : (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {/* Marcar pasantía como finalizada (uni o empresa), si está aprobada. */}
          {ctx?.estado === "aprobado" && ctx?.solicitudId ? (
            <TouchableOpacity
              onPress={onFinalizarPasantia}
              style={styles.iconBtn}
              disabled={finalizando}
              accessibilityLabel="Marcar pasantía como finalizada"
            >
              {finalizando ? (
                <ActivityIndicator size="small" color={C.green} />
              ) : (
                <Ionicons name="checkmark-done-circle" size={24} color={C.green} />
              )}
            </TouchableOpacity>
          ) : null}
          {isUni ? (
            <TouchableOpacity
              onPress={abrirCompartirGrupo}
              style={styles.iconBtn}
              accessibilityLabel="Compartir grupo de estudiantes"
            >
              <Ionicons name="people-outline" size={22} color={C.accent} />
            </TouchableOpacity>
          ) : null}
          {/* Con la pasantía ya aprobada, el mismo botón sirve para RENEGOCIAR
              el horario (la contraparte deberá aceptar el cambio). */}
          <TouchableOpacity
            onPress={() => setShowPropuesta(true)}
            style={styles.iconBtn}
            accessibilityLabel={
              ctx?.estado === "aprobado" ? "Proponer cambio de horario" : "Proponer Horario"
            }
          >
            <Ionicons
              name={ctx?.estado === "aprobado" ? "time-outline" : "calendar-outline"}
              size={22}
              color={C.accent}
            />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  // Banner de edición sobre el input (la cita de reply la dibuja GiftedChat).
  /**
   * Indicador "está escribiendo…" al pie de la lista de mensajes (justo encima
   * del input), que es donde lo espera cualquiera acostumbrado a WhatsApp.
   */
  const renderFooterTecleo = useCallback(() => {
    const texto = textoEscribiendo(escribiendo);
    if (!texto) return null;
    return (
      <View style={styles.tecleoRow}>
        <View style={styles.tecleoDot} />
        <Text style={styles.tecleoText}>{texto}</Text>
      </View>
    );
  }, [escribiendo, styles]);

  const renderChatFooter = useCallback(() => {
    if (editing) {
      return (
        <View style={styles.editBanner}>
          <Ionicons name="pencil" size={15} color={C.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.editBannerTitle}>Editando mensaje</Text>
            <Text style={styles.editBannerText} numberOfLines={1}>
              {editing.text}
            </Text>
          </View>
          <TouchableOpacity onPress={cancelarComposer}>
            <Ionicons name="close" size={18} color={C.textMuted} />
          </TouchableOpacity>
        </View>
      );
    }
    if (replyTo) {
      return (
        <View style={styles.editBanner}>
          <Ionicons name="arrow-undo" size={15} color={C.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.editBannerTitle}>
              Respondiendo a {replyTo.user?.name ?? "mensaje"}
            </Text>
            <Text style={styles.editBannerText} numberOfLines={1}>
              {replyTo.text}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)}>
            <Ionicons name="close" size={18} color={C.textMuted} />
          </TouchableOpacity>
        </View>
      );
    }
    return null;
  }, [editing, replyTo, cancelarComposer, C, styles]);

  const esPropio = actionMsg?.user?._id === giftedUser._id;
  // El admin del grupo puede borrar mensajes ajenos (moderación en vivo).
  const puedeEliminar = (esPropio || isAdmin) && !actionMsg?.isDeleted;
  const labelEliminar = !esPropio && isAdmin ? "Eliminar para todos" : "Eliminar mensaje";

  // Bloque que sustituye al input cuando el grupo es solo-admins.
  const renderInputBloqueado = useCallback(
    () => (
      <View style={styles.blockedInput}>
        <Ionicons name="lock-closed" size={16} color={C.textMuted} />
        <Text style={styles.blockedInputText}>
          Solo los administradores pueden enviar mensajes
        </Text>
      </View>
    ),
    [C, styles],
  );

  const body = (
    <>
      {header}
      <GiftedChat<ChatMessage>
        messages={mensajesVisibles}
        onSend={(msgs) => onSend(msgs)}
        user={giftedUser}
        text={inputText}
        onLongPress={onLongPressMessage}
        renderBubble={renderBubble}
        renderSend={renderSend}
        renderAvatar={renderAvatar}
        renderCustomView={renderCustomView}
        renderMessageText={renderMessageText}
        renderChatFooter={renderChatFooter}
        renderFooter={renderFooterTecleo}
        renderInputToolbar={inputBloqueado ? renderInputBloqueado : renderInputToolbarStyled}
        renderComposer={renderComposerStyled}
        textInputProps={{
          placeholder: editing ? "Edita tu mensaje..." : "Escribe un mensaje...",
          onChangeText: (t: string) => { setInputText(t); avisarTecleo(t); },
          placeholderTextColor: C.textMuted,
          keyboardAppearance: isDark ? "dark" : "light",
        }}
      />

      {/* Renegociación: se oculta el pago (no se toca en un cambio de horario;
          `modificarAcuerdo` conserva el pactado) y cambian los textos. */}
      <ProponerHorarioModal
        visible={showPropuesta}
        onClose={() => setShowPropuesta(false)}
        onSubmit={enviarPropuesta}
        showPago={ctx?.estado !== "aprobado"}
        title={ctx?.estado === "aprobado" ? "Cambiar horario" : "Proponer acuerdo"}
        submitLabel={
          ctx?.estado === "aprobado" ? "Enviar cambio" : "Enviar propuesta"
        }
        helperText={
          ctx?.estado === "aprobado"
            ? "La pasantía ya está aprobada: el cambio se aplica solo si la contraparte lo acepta. El pago pactado no se modifica."
            : undefined
        }
      />

      {/* ── Modal de confirmación: inicio de la pasantía (tras firmar) ── */}
      <Modal
        visible={!!acuerdoFirmado}
        transparent
        animationType="fade"
        onRequestClose={() => setAcuerdoFirmado(null)}
      >
        <View style={styles.successBackdrop}>
          <View style={styles.successCard}>
            <View style={styles.successIcon}>
              <Ionicons name="rocket" size={34} color={C.green} />
            </View>
            <Text style={styles.successTitle}>¡Acuerdo firmado!</Text>
            <Text style={styles.successSubtitle}>
              La pasantía está confirmada y los estudiantes ya fueron
              notificados.
            </Text>

            {acuerdoFirmado ? (
              <View style={styles.successBox}>
                <View style={styles.successRow}>
                  <Ionicons name="calendar-outline" size={16} color={C.accent} />
                  <Text style={styles.successRowText}>
                    Inicio: {acuerdoFirmado.fechaInicio}
                  </Text>
                </View>
                <View style={styles.successRow}>
                  <Ionicons name="flag-outline" size={16} color={C.accent} />
                  <Text style={styles.successRowText}>
                    Fin: {acuerdoFirmado.fechaFin}
                  </Text>
                </View>
                <View style={styles.successRow}>
                  <Ionicons name="people-outline" size={16} color={C.accent} />
                  <Text style={styles.successRowText}>
                    {acuerdoFirmado.totalEstudiantes} estudiante(s) notificados
                  </Text>
                </View>
                {acuerdoFirmado.totalConPago > 0 ? (
                  <View style={styles.successRow}>
                    <Ionicons name="wallet-outline" size={16} color={C.green} />
                    <Text style={[styles.successRowText, { color: C.green }]}>
                      Pago registrado para {acuerdoFirmado.totalConPago}{" "}
                      estudiante(s)
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.successBtn}
              onPress={() => setAcuerdoFirmado(null)}
              activeOpacity={0.9}
            >
              <Text style={styles.successBtnText}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Selector: compartir grupo de estudiantes (Universidad) ── */}
      <Modal
        visible={showCompartirGrupo}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCompartirGrupo(false)}
      >
        <View style={styles.menuBackdrop}>
          <View style={styles.compartirSheet}>
            <View style={styles.compartirHeader}>
              <Text style={styles.compartirTitle}>Compartir grupo de estudiantes</Text>
              <TouchableOpacity onPress={() => setShowCompartirGrupo(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={C.text} />
              </TouchableOpacity>
            </View>

            {cargandoGrupos ? (
              <ActivityIndicator color={C.accent} style={{ marginVertical: 28 }} />
            ) : gruposUni.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 28, gap: 8 }}>
                <Ionicons name="people-outline" size={28} color={C.textMuted} />
                <Text style={styles.compartirEmpty}>
                  No tienes grupos creados todavía.
                </Text>
              </View>
            ) : (
              <FlatList
                data={gruposUni}
                keyExtractor={(g) => g.grupoId}
                style={{ maxHeight: 340 }}
                contentContainerStyle={{ paddingBottom: 8 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.compartirItem}
                    activeOpacity={0.85}
                    disabled={compartiendoGrupo}
                    onPress={() => compartirGrupo(item)}
                  >
                    <View style={styles.compartirItemIcon}>
                      <Ionicons name="people" size={18} color={C.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.compartirItemName} numberOfLines={1}>
                        {item.grupoNombre}
                      </Text>
                      <Text style={styles.compartirItemMeta} numberOfLines={1}>
                        {[item.carrera, `${item.totalEstudiantes} estudiante(s)`]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </View>
                    <Ionicons name="send" size={18} color={C.accent} />
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* ── Menú de acciones (long-press) ── */}
      <Modal
        visible={!!actionMsg}
        transparent
        animationType="fade"
        onRequestClose={() => setActionMsg(null)}
      >
        <TouchableOpacity
          style={styles.menuBackdrop}
          activeOpacity={1}
          onPress={() => setActionMsg(null)}
        >
          {/* Fondo borroso alrededor del mensaje seleccionado. */}
          <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={styles.menuSheet}>
            <View style={styles.menuHandle} />
            <MenuOption
              icon="copy-outline"
              label="Copiar"
              onPress={() => actionMsg && copiarMensaje(actionMsg)}
            />
            <MenuOption
              icon="arrow-undo-outline"
              label="Responder"
              onPress={() => actionMsg && startReply(actionMsg)}
            />
            <MenuOption
              icon="share-outline"
              label="Reenviar"
              onPress={() => {
                setForwardMsg(actionMsg);
                setActionMsg(null);
              }}
            />
            {!esPropio && actionMsg?.user?._id ? (
              <MenuOption
                icon="flag-outline"
                label="Reportar usuario"
                danger
                onPress={() => {
                  setReportTarget({
                    id: String(actionMsg.user._id),
                    nombre: String(actionMsg.user?.name ?? ""),
                  });
                  setActionMsg(null);
                }}
              />
            ) : null}
            {esPropio && !actionMsg?.isDeleted ? (
              <MenuOption
                icon="create-outline"
                label="Editar"
                onPress={() => actionMsg && startEdit(actionMsg)}
              />
            ) : null}
            {puedeEliminar ? (
              <MenuOption
                icon="trash-outline"
                label={labelEliminar}
                danger
                onPress={() => actionMsg && eliminarMensaje(actionMsg)}
              />
            ) : null}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Modal de reenvío: lista de chats activos ── */}
      <Modal
        visible={!!forwardMsg}
        transparent
        animationType="slide"
        onRequestClose={() => setForwardMsg(null)}
      >
        <View style={styles.fwdBackdrop}>
          <View style={styles.fwdSheet}>
            <View style={styles.fwdHeader}>
              <Text style={styles.fwdTitle}>Reenviar a…</Text>
              <TouchableOpacity onPress={() => setForwardMsg(null)}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={misChats.filter((c) => c.id !== chatId)}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingVertical: 8, gap: 8 }}
              renderItem={({ item }) => {
                const titulo = chatTitle(item, user?.uid);
                const ini = titulo?.[0]?.toUpperCase() ?? "?";
                return (
                  <TouchableOpacity
                    style={styles.fwdItem}
                    activeOpacity={0.8}
                    onPress={() => reenviarA(item)}
                  >
                    <View style={styles.headerAvatar}>
                      <Text style={styles.headerAvatarText}>{ini}</Text>
                    </View>
                    <Text style={styles.fwdItemText} numberOfLines={1}>
                      {titulo}
                    </Text>
                    <Ionicons name="send" size={16} color={C.accent} />
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.fwdEmpty}>No tienes otros chats activos.</Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* ── Panel de administración del grupo ── */}
      <Modal
        visible={showGroupInfo}
        transparent
        animationType="slide"
        onRequestClose={() => {
          // Cierra primero el overlay superior (evita saltarse un nivel al
          // pulsar "atrás" en Android).
          if (showAddMember) setShowAddMember(false);
          else if (accionMiembro) setAccionMiembro(null);
          else setShowGroupInfo(false);
        }}
      >
        <View style={styles.fwdBackdrop}>
          <View style={[styles.fwdSheet, { maxHeight: "85%" }]}>
            <View style={styles.fwdHeader}>
              <Text style={styles.fwdTitle}>Detalles del grupo</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowAddMember(false);
                  setAccionMiembro(null);
                  setShowGroupInfo(false);
                }}
              >
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Nombre del grupo (editable solo por admin) */}
            <Text style={styles.groupLabel}>Nombre del grupo</Text>
            <View style={styles.groupNameRow}>
              <TextInput
                style={styles.groupNameInput}
                value={nombreEdit}
                onChangeText={setNombreEdit}
                editable={isAdmin}
                placeholder="Nombre del grupo"
                placeholderTextColor={C.textMuted}
              />
              {isAdmin ? (
                <TouchableOpacity
                  style={styles.groupSaveBtn}
                  onPress={renombrarGrupo}
                  disabled={!nombreEdit.trim() || nombreEdit.trim() === group?.name}
                >
                  <Ionicons name="checkmark" size={18} color="#fff" />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Toggle solo-admins (solo admin) */}
            {isAdmin ? (
              <View style={styles.groupToggleRow}>
                <Text style={styles.groupToggleText}>
                  Solo administradores pueden enviar mensajes
                </Text>
                <Switch
                  value={adminsOnly}
                  onValueChange={toggleAdminsOnly}
                  trackColor={{ false: C.border, true: C.accent }}
                  thumbColor="#fff"
                />
              </View>
            ) : adminsOnly ? (
              <View style={styles.groupToggleRow}>
                <Ionicons name="lock-closed" size={15} color={C.textMuted} />
                <Text style={[styles.groupToggleText, { flex: 1 }]}>
                  Solo los administradores pueden enviar mensajes
                </Text>
              </View>
            ) : null}

            {/* Participantes */}
            <View style={styles.partHeaderRow}>
              <Text style={styles.groupLabel}>
                Participantes ({participantes.length})
              </Text>
              {isAdmin && rol === "universidad" ? (
                <TouchableOpacity
                  style={styles.addMemberBtn}
                  onPress={abrirAddMember}
                  activeOpacity={0.85}
                >
                  <Ionicons name="person-add" size={15} color={C.accent} />
                  <Text style={styles.addMemberText}>Añadir</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <FlatList
              data={participantes}
              keyExtractor={(item) => item.uid}
              contentContainerStyle={{ paddingVertical: 8, gap: 6 }}
              renderItem={({ item }) => {
                const esAdminP = (group?.admins ?? []).includes(item.uid);
                const esYo = item.uid === user?.uid;
                return (
                  <View style={styles.partItem}>
                    <TouchableOpacity
                      style={styles.partTapZone}
                      activeOpacity={esYo ? 1 : 0.7}
                      disabled={esYo}
                      onPress={() =>
                        setAccionMiembro({
                          uid: item.uid,
                          nombre: item.nombre,
                          rol: item.rol,
                          foto: item.foto,
                        })
                      }
                    >
                      <StorageAvatar url={item.foto} size={38} fallbackIcon="person" />
                      <Text style={styles.partName} numberOfLines={1}>
                        {item.nombre}
                      </Text>
                    </TouchableOpacity>
                    {esAdminP ? (
                      <View style={styles.adminBadge}>
                        <Text style={styles.adminBadgeText}>Admin</Text>
                      </View>
                    ) : isAdmin ? (
                      <TouchableOpacity
                        onPress={() => expulsarParticipante(item.uid)}
                        accessibilityLabel="Expulsar"
                      >
                        <Ionicons name="person-remove" size={18} color="#f87171" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.fwdEmpty}>Cargando participantes…</Text>
              }
            />
          </View>
        </View>

        {/* ── Acción al tocar un integrante: ver perfil o chatear ──
            Se renderiza DENTRO del modal de detalles para no apilar modales
            nativos (apilarlos deja un overlay fantasma que bloquea los toques). */}
        {accionMiembro ? (
          <TouchableOpacity
            style={[StyleSheet.absoluteFill, styles.menuBackdrop]}
            activeOpacity={1}
            onPress={() => setAccionMiembro(null)}
          >
            <View style={styles.menuSheet}>
              <View style={styles.menuHandle} />
              <Text style={[styles.fwdTitle, { marginBottom: 6, paddingHorizontal: 12 }]}>
                {accionMiembro?.nombre}
              </Text>
              <MenuOption
                icon="person-circle-outline"
                label="Ver perfil"
                onPress={() => {
                  if (!accionMiembro) return;
                  const tipo = (["estudiante", "empresa", "universidad"].includes(
                    accionMiembro.rol,
                  )
                    ? accionMiembro.rol
                    : "estudiante") as ProfileTipo;
                  const id = accionMiembro.uid;
                  setAccionMiembro(null);
                  // Cierra el panel de grupo ANTES de abrir el modal de perfil.
                  // En iOS presentar un Modal mientras otro se está cerrando
                  // falla silenciosamente (el perfil no aparece / "da error"),
                  // así que esperamos a que termine la animación de cierre
                  // (~300 ms) antes de abrir el visor de perfil.
                  setShowGroupInfo(false);
                  setTimeout(
                    () => setVerPerfil({ tipo, id }),
                    Platform.OS === "ios" ? 350 : 0,
                  );
                }}
              />
              <MenuOption
                icon="chatbubble-ellipses-outline"
                label="Chatear"
                onPress={() => {
                  const m = accionMiembro;
                  setAccionMiembro(null);
                  setShowGroupInfo(false);
                  if (m) void iniciarChat({ uid: m.uid, nombre: m.nombre, rol: m.rol });
                }}
              />
              <MenuOption
                icon="flag-outline"
                label="Reportar"
                danger
                onPress={() => {
                  const m = accionMiembro;
                  setAccionMiembro(null);
                  // Mismo cuidado que "Ver perfil" arriba: cerrar el Modal de
                  // "Detalles del grupo" y abrir otro Modal (ReportarUsuarioModal)
                  // en el mismo tick falla silenciosamente en iOS.
                  setShowGroupInfo(false);
                  if (m) {
                    setTimeout(
                      () => setReportTarget({ id: m.uid, nombre: m.nombre }),
                      Platform.OS === "ios" ? 350 : 0,
                    );
                  }
                }}
              />
            </View>
          </TouchableOpacity>
        ) : null}

        {/* ── Picker: añadir integrantes (admin universidad) ──
            Overlay interno (no un Modal aparte) para evitar el apilamiento. */}
        {showAddMember ? (
          <View style={[StyleSheet.absoluteFill, styles.fwdBackdrop]}>
            <View style={[styles.fwdSheet, { maxHeight: "75%" }]}>
              <View style={styles.fwdHeader}>
                <Text style={styles.fwdTitle}>Añadir integrantes</Text>
                <TouchableOpacity onPress={() => setShowAddMember(false)}>
                  <Ionicons name="close" size={22} color={C.textMuted} />
                </TouchableOpacity>
              </View>
              {loadingCand ? (
                <ActivityIndicator color={C.accent} style={{ marginVertical: 28 }} />
              ) : (
                <FlatList
                  data={candidatos}
                  keyExtractor={(item) => item.uid}
                  contentContainerStyle={{ paddingVertical: 8, gap: 8 }}
                  renderItem={({ item }) => (
                    <View style={styles.partItem}>
                      <StorageAvatar url={item.foto} size={38} fallbackIcon="person" />
                      <Text style={[styles.partName, { flex: 1 }]} numberOfLines={1}>
                        {item.nombre}
                      </Text>
                      <TouchableOpacity
                        style={styles.addMemberBtn}
                        onPress={() => agregarMiembro(item)}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="add" size={16} color={C.accent} />
                        <Text style={styles.addMemberText}>Agregar</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  ListEmptyComponent={
                    <Text style={styles.fwdEmpty}>
                      No hay más estudiantes para agregar.
                    </Text>
                  }
                />
              )}
            </View>
          </View>
        ) : null}
      </Modal>

      {/* ── Perfil del integrante (Ver perfil) ── */}
      {verPerfil ? (
        <ProfileViewerModal
          visible={!!verPerfil}
          tipo={verPerfil.tipo}
          profileId={verPerfil.id}
          onClose={() => setVerPerfil(null)}
        />
      ) : null}

      {reportTarget ? (
        <ReportarUsuarioModal
          visible={!!reportTarget}
          reportadoId={reportTarget.id}
          reportadoNombre={reportTarget.nombre}
          onClose={() => setReportTarget(null)}
        />
      ) : null}
    </>
  );

  // Embebido (panel derecho web): rellena el padre sin SafeArea propio.
  if (embedded) {
    return <View style={styles.container}>{body}</View>;
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {body}
    </SafeAreaView>
  );
}

const makeStyles = (C: ChatColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  // ── Barra de entrada (aspecto flotante) ──
  inputToolbar: {
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  sendContainer: {
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
    marginBottom: 4,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  // Recibo "Enviado / Visto" bajo cada mensaje propio.
  recibo: {
    fontSize: 10,
    color: C.textMuted,
    marginTop: 1,
    marginHorizontal: 8,
    marginBottom: 3,
  },
  // Nombre del remitente sobre las burbujas entrantes de un grupo.
  senderName: {
    fontSize: 11,
    fontWeight: "700",
    color: C.accent,
    marginLeft: 12,
    marginBottom: 2,
  },
  // Etiqueta "Reenviado" sobre la burbuja.
  reenviadoLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginHorizontal: 10,
    marginBottom: 2,
  },
  reenviadoText: {
    fontSize: 10,
    fontStyle: "italic",
    color: C.textMuted,
  },
  // ── Cita del mensaje respondido, dentro de la burbuja ──
  replyQuote: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 6,
    maxWidth: "82%",
    marginHorizontal: 10,
    marginBottom: 3,
    paddingVertical: 5,
    paddingRight: 8,
    paddingLeft: 6,
    borderRadius: 10,
    backgroundColor: "rgba(139,92,246,0.12)",
  },
  replyQuoteBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: C.accent,
  },
  replyQuoteName: {
    fontSize: 11,
    fontWeight: "700",
    color: C.accent,
  },
  replyQuoteText: {
    fontSize: 11,
    color: C.textMuted,
    marginTop: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.surface,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(139,92,246,0.18)",
    borderWidth: 1,
    borderColor: C.border,
  },
  headerAvatarText: {
    color: C.accent,
    fontSize: 17,
    fontWeight: "800",
  },
  presenceDot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: C.surface,
  },
  headerTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: "800",
  },
  headerSub: {
    color: C.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  // ── Tarjeta de propuesta ──
  card: {
    width: 248,
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    margin: 4,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  cardTitle: {
    color: C.text,
    fontSize: 14,
    fontWeight: "800",
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  cardLabel: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  cardValue: {
    color: C.text,
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "right",
    marginLeft: 12,
  },
  cardDivider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 10,
  },
  approveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.accent,
    borderRadius: 12,
    paddingVertical: 11,
  },
  approveBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    paddingVertical: 10,
  },
  statusApproved: {
    backgroundColor: "rgba(52,211,153,0.12)",
  },
  statusWaiting: {
    backgroundColor: C.subtleFill,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "700",
  },
  // ── Modal de inicio de pasantía (tras firmar el acuerdo) ──
  successBackdrop: {
    flex: 1,
    backgroundColor: "rgba(7,5,15,0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 28,
  },
  successCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: C.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    padding: 24,
    alignItems: "center",
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(52,211,153,0.12)",
    borderWidth: 1,
    borderColor: "rgba(52,211,153,0.35)",
    marginBottom: 14,
  },
  successTitle: {
    color: C.text,
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  successSubtitle: {
    color: C.muted,
    fontSize: 13,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 16,
    lineHeight: 18,
  },
  successBox: {
    alignSelf: "stretch",
    backgroundColor: C.subtleFill,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    gap: 10,
  },
  successRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  successRowText: {
    color: C.text,
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  successBtn: {
    alignSelf: "stretch",
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 18,
  },
  successBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  // ── Texto borrado / etiqueta editado ──
  deletedText: {
    fontStyle: "italic",
    color: C.textMuted,
    fontSize: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  editedLabel: {
    fontSize: 10,
    color: C.textMuted,
    paddingHorizontal: 10,
    paddingBottom: 4,
    marginTop: -2,
  },
  // ── Banner de edición ──
  tecleoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  tecleoDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.accent,
  },
  tecleoText: {
    fontSize: 12,
    color: C.textMuted,
    fontStyle: "italic",
  },
  editBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 10,
    marginBottom: 6,
    padding: 10,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
    backgroundColor: "rgba(139,92,246,0.10)",
  },
  editBannerTitle: {
    color: C.accent,
    fontSize: 12,
    fontWeight: "700",
  },
  editBannerText: {
    color: C.muted,
    fontSize: 12,
    marginTop: 1,
  },
  // ── Menú contextual long-press ──
  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(7,5,15,0.6)",
    justifyContent: "flex-end",
  },
  menuSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 28,
  },
  compartirSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 28,
  },
  compartirHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  compartirTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: "800",
    flex: 1,
  },
  compartirEmpty: {
    color: C.textMuted,
    fontSize: 14,
    textAlign: "center",
  },
  compartirItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.subtleFill,
    marginBottom: 10,
  },
  compartirItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(139,92,246,0.14)",
  },
  compartirItemName: { color: C.text, fontSize: 15, fontWeight: "700" },
  compartirItemMeta: { color: C.muted, fontSize: 13, marginTop: 2 },
  menuHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    marginBottom: 10,
  },
  menuOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  menuOptionText: {
    color: C.text,
    fontSize: 15,
    fontWeight: "600",
  },
  // ── Modal de reenvío ──
  fwdBackdrop: {
    flex: 1,
    backgroundColor: "rgba(7,5,15,0.75)",
    justifyContent: "flex-end",
  },
  fwdSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    maxHeight: "70%",
    minHeight: "40%",
  },
  fwdHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  fwdTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: "800",
  },
  fwdItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.subtleFill,
  },
  fwdItemText: {
    flex: 1,
    color: C.text,
    fontSize: 15,
    fontWeight: "600",
  },
  fwdEmpty: {
    color: C.textMuted,
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 30,
  },
  // ── Input bloqueado (solo-admins) ──
  blockedInput: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.surface,
  },
  blockedInputText: {
    color: C.textMuted,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  // ── Panel de administración del grupo ──
  groupLabel: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
  },
  groupNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  groupNameInput: {
    flex: 1,
    color: C.text,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.subtleFill,
  },
  groupSaveBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.accent,
  },
  groupToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.subtleFill,
  },
  groupToggleText: {
    flex: 1,
    color: C.text,
    fontSize: 13,
    fontWeight: "600",
  },
  partItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.subtleFill,
  },
  partAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(139,92,246,0.18)",
  },
  partTapZone: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  partHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
  },
  addMemberBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: "rgba(139,92,246,0.12)",
  },
  addMemberText: {
    color: C.accent,
    fontSize: 12,
    fontWeight: "700",
  },
  partName: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    fontWeight: "600",
  },
  adminBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(139,92,246,0.18)",
  },
  adminBadgeText: {
    color: C.accent,
    fontSize: 11,
    fontWeight: "700",
  },
});
