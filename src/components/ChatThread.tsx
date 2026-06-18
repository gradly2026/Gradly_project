import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ScreenCapture from "expo-screen-capture";
import {
  arrayRemove,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  GiftedChat,
  MessageText,
  type BubbleProps,
  type IMessage,
  type MessageTextProps,
  type ReplyMessage,
} from "react-native-gifted-chat";
import { SafeAreaView } from "react-native-safe-area-context";
import { db } from "../config/firebaseConfig";
import { useAuth } from "../context/AuthContext";
import {
  chatTitle,
  markChatRead,
  subscribeUserChats,
  touchChatOnMessage,
  type ChatListItem,
} from "../services/chatService";
import {
  aceptarGrupoCompartido,
  finalizarPasantia,
} from "../services/solicitudPracticaService";
import { type ChatMessage, type GroupOfferData, type ScheduleData } from "../types/chat";
import ProponerHorarioModal from "./ProponerHorarioModal";

const C = {
  bg: "#07050f",
  surface: "#0d0b1e",
  text: "#ffffff",
  textMuted: "rgba(255,255,255,0.38)",
  muted: "rgba(255,255,255,0.6)",
  accent: "#8b5cf6",
  border: "rgba(139,92,246,0.22)",
  green: "#34d399",
};

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

const horarioToText = (s: ScheduleData) =>
  `${s.dias.join(", ")} · ${s.horaInicio} - ${s.horaFin}`;

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
}: ChatThreadProps) {
  const { user, userProfile } = useAuth();
  const router = useRouter();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [ctx, setCtx] = useState<ChatContext | null>(null);
  const [showPropuesta, setShowPropuesta] = useState(false);
  const [aprobando, setAprobando] = useState(false);
  const [peerStatus, setPeerStatus] = useState<string | null>(null);
  const [peerLastSeen, setPeerLastSeen] = useState<Date | null>(null);
  // Tick para reevaluar la frescura del heartbeat aunque no llegue snapshot.
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Composer controlado: necesario para precargar el texto al editar.
  const [inputText, setInputText] = useState("");
  // Cita estilo WhatsApp encima del input (responder).
  const [replyTo, setReplyTo] = useState<ReplyMessage | null>(null);
  // Mensaje en edición (si no es null, onSend hace updateDoc).
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  // Mensaje con el menú de acciones abierto (long-press).
  const [actionMsg, setActionMsg] = useState<ChatMessage | null>(null);
  // Mensaje a reenviar (abre el modal con la lista de chats).
  const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null);
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
  } | null>(null);
  // Panel de administración del grupo.
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [nombreEdit, setNombreEdit] = useState("");
  const [participantes, setParticipantes] = useState<
    { uid: string; nombre: string }[]
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

  // ── Presencia del peer: status / lastSeen en usuarios/{peerUid} ──
  useEffect(() => {
    if (!peerUid) return;
    const unsub = onSnapshot(
      doc(db, "usuarios", peerUid),
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
  const onFinalizarPasantia = useCallback(() => {
    if (!ctx?.solicitudId) return;
    Alert.alert(
      "Finalizar pasantía",
      "¿Marcar esta pasantía como finalizada? Se habilitará el formulario de evaluación para ambas partes.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Finalizar",
          style: "destructive",
          onPress: async () => {
            setFinalizando(true);
            try {
              await finalizarPasantia(ctx.solicitudId);
              inyectarMensajeSistema(
                "La pasantía fue marcada como finalizada. Por favor completen su evaluación de experiencia.",
              );
              setCtx((p) => (p ? { ...p, estado: "finalizado" } : p));
            } catch (error) {
              console.warn("Error finalizando pasantía:", error);
              Alert.alert("Error", "No se pudo finalizar la pasantía. Intenta de nuevo.");
            } finally {
              setFinalizando(false);
            }
          },
        },
      ],
    );
  }, [ctx?.solicitudId, inyectarMensajeSistema]);

  // ── Anti-captura de pantalla ──
  // Bloquea capturas mientras el chat está montado (no soportado en Web).
  ScreenCapture.usePreventScreenCapture();

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
        });
      },
      (error) => console.warn("Error en listener (chat doc):", error),
    );
    return unsub;
  }, [chatId]);

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
            groupOffer: data.groupOffer,
            approved: data.approved ?? false,
            isDeleted: data.isDeleted ?? false,
            isEdited: data.isEdited ?? false,
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
        // Adjunta la cita del mensaje original al responder.
        if (replyTo) payload.replyMessage = replyTo;
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
        createdAt: serverTimestamp(),
        user: { _id: giftedUser._id, name: giftedUser.name },
      });
      void touchChatOnMessage(destino.id, msg.text, giftedUser._id, destino.users);
    },
    [forwardMsg, giftedUser._id, giftedUser.name],
  );

  // ── Panel de administración del grupo ──
  const abrirGroupInfo = useCallback(async () => {
    if (!isGroup) return;
    setNombreEdit(group?.name ?? "");
    setShowGroupInfo(true);

    // Carga los nombres de los participantes desde `usuarios`.
    const uids = group?.users ?? [];
    try {
      const docs = await Promise.all(
        uids.map((u) => getDoc(doc(db, "usuarios", u))),
      );
      setParticipantes(
        docs.map((snap, i) => ({
          uid: uids[i],
          nombre:
            (snap.data() as any)?.nombre_completo ??
            (uids[i] === user?.uid ? "Tú" : "Participante"),
        })),
      );
    } catch (error) {
      console.warn("Error cargando participantes:", error);
      setParticipantes(uids.map((u) => ({ uid: u, nombre: "Participante" })));
    }
  }, [isGroup, group?.name, group?.users, user?.uid]);

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
            <MessageText {...props} />
            <Text style={styles.editedLabel}>Editado</Text>
          </View>
        );
      }
      return <MessageText {...props} />;
    },
    [],
  );

  // ── Envío de una propuesta de horario estructurada ──
  const enviarPropuesta = useCallback(
    (scheduleData: ScheduleData) => {
      setShowPropuesta(false);
      if (!chatId) return;
      const ref = doc(collection(db, "chats", chatId, "messages"));
      void setDoc(ref, {
        _id: ref.id,
        text: "", // El contenido se renderiza como tarjeta (renderCustomView).
        type: "proposal",
        scheduleData,
        approved: false,
        createdAt: serverTimestamp(),
        user: { _id: giftedUser._id, name: giftedUser.name },
      });
      void touchChatOnMessage(
        chatId,
        "📅 Propuesta de horario",
        giftedUser._id,
        chatUsers,
      );
    },
    [chatId, giftedUser._id, giftedUser.name, chatUsers],
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
        router.push({
          pathname: "/ChatScreen",
          params: { chatId: res.chatId, peerName: g.universidadNombre },
        } as any);
      } catch (error) {
        console.warn("Error aceptando grupo compartido:", error);
        Alert.alert("Error", "No se pudo aceptar el grupo. Intenta de nuevo.");
      } finally {
        setAceptandoGrupo(null);
      }
    },
    [chatId, ctx, isEmpresa, aceptandoGrupo, router],
  );

  // ── Aprobación del acuerdo (solo Empresa) en operación batch atómica ──
  const aprobarAcuerdo = useCallback(
    async (message: ChatMessage) => {
      if (!chatId || !ctx || !message.scheduleData) return;
      if (user?.uid !== ctx.empresaId) return; // Doble validación de rol.
      if (aprobando || message.approved) return;

      setAprobando(true);
      try {
        const horario = message.scheduleData;
        const horarioTexto = horarioToText(horario);
        const batch = writeBatch(db);

        // 1) Solicitud principal → aprobado.
        batch.update(doc(db, "solicitudes_practicas", ctx.solicitudId), {
          estado: "aprobado",
          horarioAcordado: horario,
          aprobadoAt: serverTimestamp(),
        });

        // 2) Notificación por cada estudiante involucrado.
        ctx.alumnos.forEach((al) => {
          const notiRef = doc(collection(db, "notificaciones_estudiantes"));
          batch.set(notiRef, {
            estudianteId: al.id,
            estudianteNombre: al.nombre,
            empresaId: ctx.empresaId,
            empresaNombre: ctx.empresaNombre,
            grupoId: ctx.grupoId,
            carrera: ctx.carrera,
            fechaInicio: ctx.fechaInicio,
            fechaFin: ctx.fechaFin,
            horario,
            tipo: "acuerdo_aprobado",
            leida: false,
            mensaje: `Tu pasantía en ${ctx.empresaNombre} fue aprobada. Del ${ctx.fechaInicio} al ${ctx.fechaFin}. Horario: ${horarioTexto}.`,
            createdAt: serverTimestamp(),
          });
        });

        // 3) Marca la propuesta como aprobada.
        batch.update(
          doc(db, "chats", chatId, "messages", String(message._id)),
          { approved: true },
        );

        // 4) Mensaje automático de sistema en el chat.
        const sysRef = doc(collection(db, "chats", chatId, "messages"));
        batch.set(sysRef, {
          _id: sysRef.id,
          text: "El acuerdo ha sido firmado y los estudiantes han sido notificados.",
          type: "system",
          system: true,
          createdAt: serverTimestamp(),
          user: { _id: "system", name: "Sistema" },
        });

        // 5) Metadatos del chat para la bandeja de entrada.
        batch.update(doc(db, "chats", chatId), {
          lastMessage: "✅ Acuerdo firmado",
          lastSenderId: user?.uid ?? "",
          updatedAt: serverTimestamp(),
          [`unread.${ctx.universidadId}`]: increment(1),
        });

        await batch.commit();
        Alert.alert(
          "Acuerdo firmado",
          `Se notificó a ${ctx.alumnos.length} estudiante(s).`,
        );
      } catch (error) {
        console.warn("Error aprobando el acuerdo:", error);
        Alert.alert("Error", "No se pudo aprobar el acuerdo. Intenta de nuevo.");
      } finally {
        setAprobando(false);
      }
    },
    [chatId, ctx, user?.uid, aprobando],
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

      if (!msg || msg.type !== "proposal" || !msg.scheduleData) return null;
      const s = msg.scheduleData;
      const aprobado = !!msg.approved;

      return (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="calendar" size={16} color={C.accent} />
            <Text style={styles.cardTitle}>Propuesta de horario</Text>
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

          <View style={styles.cardDivider} />

          {aprobado ? (
            <View style={[styles.statusPill, styles.statusApproved]}>
              <Ionicons name="checkmark-circle" size={16} color={C.green} />
              <Text style={[styles.statusText, { color: C.green }]}>
                Acuerdo aprobado
              </Text>
            </View>
          ) : isEmpresa ? (
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
                  <Ionicons name="ribbon-outline" size={16} color="#fff" />
                  <Text style={styles.approveBtnText}>Aprobar Acuerdo</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <View style={[styles.statusPill, styles.statusWaiting]}>
              <Ionicons name="time-outline" size={16} color={C.muted} />
              <Text style={[styles.statusText, { color: C.muted }]}>
                Esperando aprobación...
              </Text>
            </View>
          )}
        </View>
      );
    },
    [isEmpresa, aprobando, aprobarAcuerdo, aceptandoGrupo, onAceptarGrupo],
  );

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

      <View style={styles.headerAvatar}>
        {isGroup ? (
          <Ionicons name="people" size={20} color="#c4b5fd" />
        ) : (
          <Text style={styles.headerAvatarText}>{inicial}</Text>
        )}
        {isGroup ? null : (
          <View
            style={[
              styles.presenceDot,
              { backgroundColor: peerOnline ? C.green : C.textMuted },
            ]}
          />
        )}
      </View>

      {/* En grupos, pulsar el nombre abre el panel de administración. */}
      <TouchableOpacity
        style={{ flex: 1 }}
        activeOpacity={isGroup ? 0.6 : 1}
        disabled={!isGroup}
        onPress={abrirGroupInfo}
      >
        <Text style={styles.headerTitle} numberOfLines={1}>
          {tituloHeader}
        </Text>
        <Text style={styles.headerSub} numberOfLines={1}>
          {estadoTexto}
        </Text>
      </TouchableOpacity>

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
          <TouchableOpacity
            onPress={() => setShowPropuesta(true)}
            style={styles.iconBtn}
            accessibilityLabel="Proponer Horario"
          >
            <Ionicons name="calendar-outline" size={22} color={C.accent} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  // Banner de edición sobre el input (la cita de reply la dibuja GiftedChat).
  const renderChatFooter = useCallback(() => {
    if (!editing) return null;
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
  }, [editing, cancelarComposer]);

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
    [],
  );

  const body = (
    <>
      {header}
      <GiftedChat<ChatMessage>
        messages={messages}
        onSend={(msgs) => onSend(msgs)}
        user={giftedUser}
        text={inputText}
        onLongPressMessage={onLongPressMessage}
        renderCustomView={renderCustomView}
        renderMessageText={renderMessageText}
        renderChatFooter={renderChatFooter}
        renderInputToolbar={inputBloqueado ? renderInputBloqueado : undefined}
        reply={{ message: replyTo, onClear: () => setReplyTo(null) }}
        textInputProps={{
          placeholder: editing ? "Edita tu mensaje..." : "Escribe un mensaje...",
          onChangeText: setInputText,
        }}
      />

      <ProponerHorarioModal
        visible={showPropuesta}
        onClose={() => setShowPropuesta(false)}
        onSubmit={enviarPropuesta}
      />

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
          <View style={styles.menuSheet}>
            <View style={styles.menuHandle} />
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
        onRequestClose={() => setShowGroupInfo(false)}
      >
        <View style={styles.fwdBackdrop}>
          <View style={[styles.fwdSheet, { maxHeight: "85%" }]}>
            <View style={styles.fwdHeader}>
              <Text style={styles.fwdTitle}>Detalles del grupo</Text>
              <TouchableOpacity onPress={() => setShowGroupInfo(false)}>
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
            <Text style={[styles.groupLabel, { marginTop: 16 }]}>
              Participantes ({participantes.length})
            </Text>
            <FlatList
              data={participantes}
              keyExtractor={(item) => item.uid}
              contentContainerStyle={{ paddingVertical: 8, gap: 6 }}
              renderItem={({ item }) => {
                const esAdminP = (group?.admins ?? []).includes(item.uid);
                return (
                  <View style={styles.partItem}>
                    <View style={styles.partAvatar}>
                      <Text style={styles.headerAvatarText}>
                        {item.nombre?.[0]?.toUpperCase() ?? "?"}
                      </Text>
                    </View>
                    <Text style={styles.partName} numberOfLines={1}>
                      {item.nombre}
                    </Text>
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
      </Modal>
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

/** Fila del menú contextual long-press. */
function MenuOption({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
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
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
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
    color: "#c4b5fd",
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
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  statusText: {
    fontSize: 13,
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
    backgroundColor: "rgba(255,255,255,0.03)",
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
    backgroundColor: "rgba(255,255,255,0.04)",
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
    backgroundColor: "rgba(255,255,255,0.04)",
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
    backgroundColor: "rgba(255,255,255,0.04)",
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
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  partAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(139,92,246,0.18)",
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
    color: "#c4b5fd",
    fontSize: 11,
    fontWeight: "700",
  },
});
