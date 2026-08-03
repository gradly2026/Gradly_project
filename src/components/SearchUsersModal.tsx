import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  collection,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  StyleSheet,


  TouchableOpacity,
  View,
} from "react-native";
import { AutoText as Text, AutoTextInput as TextInput } from "./AutoText";
import { db } from "../config/firebaseConfig";
import { useAuth, type UserRole } from "../context/AuthContext";
import { useIniciarChat } from "../hooks/useIniciarChat";
import { crearChatGrupoAdHoc } from "../services/chatService";
import ProfileViewerModal, { type ProfileTipo } from "./ProfileViewerModal";
import StorageAvatar from "./StorageAvatar";

/** Estudiante de la universidad (para el modo "Chatea con tus estudiantes"). */
interface EstudianteItem {
  id: string;
  nombre: string;
  carrera: string;
}

const C = {
  surface: "#0d0b1e",
  surface2: "rgba(255,255,255,0.04)",
  text: "#ffffff",
  textMuted: "rgba(255,255,255,0.45)",
  accent: "#8b5cf6",
  accent70: "rgba(167,139,250,1)",
  border: "rgba(139,92,246,0.25)",
  green: "#34d399",
};

/** Resultado de búsqueda normalizado (empresa o estudiante). */
interface UserResult {
  id: string;
  nombre: string;
  detalle: string;
  foto?: string | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Rol del usuario actual: define qué colección se consulta. */
  rol: UserRole | null;
  /** Uid de la universidad (para el bulk-load "Chatea con tus estudiantes"). */
  universidadId?: string;
}

/**
 * Buscador de usuarios. Consulta `perfiles_estudiantes` (rol empresa) o
 * `perfiles_empresas` (resto) y filtra en cliente por nombre. Para universidad
 * añade el botón bulk-load, habilitado solo si tiene grupos creados.
 */
export default function SearchUsersModal({
  visible,
  onClose,
  rol,
  universidadId,
}: Props) {
  const [termino, setTermino] = useState("");
  const [base, setBase] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasGrupos, setHasGrupos] = useState(false);
  const iniciarChat = useIniciarChat();
  const router = useRouter();
  const { user, userProfile } = useAuth();

  // ── Modo "Chatea con tus estudiantes" (solo universidad) ──
  const [modoEstudiantes, setModoEstudiantes] = useState(false);
  const [estudiantes, setEstudiantes] = useState<EstudianteItem[]>([]);
  const [loadingEst, setLoadingEst] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [nombreGrupo, setNombreGrupo] = useState("");
  const [creandoGrupo, setCreandoGrupo] = useState(false);

  const esEmpresa = rol === "empresa";
  const esUniversidad = rol === "universidad";

  // ── Ver perfil (en vez de chatear) ──
  // Cierra este buscador antes de abrir el visor: dos `Modal` nativos
  // presentados a la vez fallan silenciosamente en iOS si uno se está
  // cerrando justo cuando el otro se abre (mismo cuidado que ChatThread).
  const [verPerfil, setVerPerfil] = useState<{ tipo: ProfileTipo; id: string } | null>(null);
  const abrirPerfil = (tipo: ProfileTipo, id: string) => {
    onClose();
    setTimeout(() => setVerPerfil({ tipo, id }), Platform.OS === "ios" ? 350 : 0);
  };

  // Carga el lote base de usuarios y comprueba si la universidad tiene grupos.
  useEffect(() => {
    if (!visible) {
      setTermino("");
      setModoEstudiantes(false);
      setSeleccion(new Set());
      setNombreGrupo("");
      return;
    }

    let cancelado = false;
    setLoading(true);

    (async () => {
      try {
        const coleccion = esEmpresa
          ? "perfiles_estudiantes"
          : "perfiles_empresas";
        const snap = await getDocs(query(collection(db, coleccion), limit(80)));

        const items: UserResult[] = snap.docs.map((d) => {
          const data = d.data() as any;
          if (esEmpresa) {
            return {
              id: d.id,
              nombre: String(data.nombre_completo ?? "Estudiante"),
              detalle: String(data.carrera ?? "Sin carrera"),
              foto: data.foto_url ?? null,
            };
          }
          return {
            id: d.id,
            nombre: String(data.nombre_empresa ?? "Empresa"),
            detalle: String(data.industria ?? "Sin rubro"),
            foto: data.logo_url ?? null,
          };
        });

        if (!cancelado) setBase(items);
      } catch (error) {
        console.warn("Error buscando usuarios:", error);
        if (!cancelado) setBase([]);
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();

    // ¿La universidad tiene grupos? Habilita el bulk-load.
    if (esUniversidad && universidadId) {
      (async () => {
        try {
          const snap = await getDocs(
            query(
              collection(db, "grupos"),
              where("universidad_id", "==", universidadId),
              limit(1),
            ),
          );
          if (!cancelado) setHasGrupos(!snap.empty);
        } catch (error) {
          console.warn("Error comprobando grupos:", error);
          if (!cancelado) setHasGrupos(false);
        }
      })();
    } else {
      setHasGrupos(false);
    }

    return () => {
      cancelado = true;
    };
  }, [visible, esEmpresa, esUniversidad, universidadId]);

  const resultados = useMemo(() => {
    const q = termino.trim().toLowerCase();
    const lista = q
      ? base.filter(
          (u) =>
            u.nombre.toLowerCase().includes(q) ||
            u.detalle.toLowerCase().includes(q),
        )
      : base;
    return [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [base, termino]);

  const onPressResultado = (item: UserResult) => {
    // Crea/abre el chat directo con el usuario seleccionado y cierra el modal.
    // El rol del otro se infiere de la colección consultada según el rol actual.
    const otroRol: UserRole = esEmpresa ? "estudiante" : "empresa";
    onClose();
    void iniciarChat({ uid: item.id, nombre: item.nombre, rol: otroRol });
  };

  // ── "Chatea con tus estudiantes": carga los estudiantes de la universidad ──
  const onBulkLoad = async () => {
    if (!universidadId) return;
    setModoEstudiantes(true);
    setLoadingEst(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, "perfiles_estudiantes"),
          where("universidad_id", "==", universidadId),
        ),
      );
      const items: EstudianteItem[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          nombre: String(data.nombre_completo ?? "Estudiante"),
          carrera: String(data.carrera ?? ""),
        };
      });
      items.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setEstudiantes(items);
    } catch (error) {
      console.warn("Error cargando estudiantes:", error);
      setEstudiantes([]);
    } finally {
      setLoadingEst(false);
    }
  };

  // Chat 1:1 con un estudiante.
  const chatearConEstudiante = (est: EstudianteItem) => {
    onClose();
    void iniciarChat({ uid: est.id, nombre: est.nombre, rol: "estudiante" });
  };

  // Alterna la selección de un estudiante para el grupo.
  const toggleSeleccion = (id: string) => {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Crea un grupo con los estudiantes seleccionados (≥ 2) y lo abre.
  const crearGrupo = async () => {
    if (!user?.uid || seleccion.size < 2 || creandoGrupo) return;
    const miembros = estudiantes
      .filter((e) => seleccion.has(e.id))
      .map((e) => ({ uid: e.id, nombre: e.nombre }));
    const nombre = nombreGrupo.trim() || `Grupo · ${miembros.length} estudiantes`;
    setCreandoGrupo(true);
    try {
      const chatId = await crearChatGrupoAdHoc({
        adminUid: user.uid,
        adminNombre: userProfile?.nombre_completo ?? "Universidad",
        nombre,
        miembros,
      });
      onClose();
      router.push({
        pathname: "/mensajes",
        params: { chat: chatId, peerName: nombre },
      } as any);
    } catch (error) {
      console.warn("Error creando grupo:", error);
      Alert.alert("Error", "No se pudo crear el grupo. Intenta de nuevo.");
    } finally {
      setCreandoGrupo(false);
    }
  };

  const placeholder = esEmpresa
    ? "Buscar estudiantes por nombre o carrera"
    : "Buscar empresas por nombre o rubro";

  return (
    <>
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.container}>
          <View style={styles.handle} />

          {modoEstudiantes ? (
            // ════════ MODO: Chatea con tus estudiantes ════════
            <>
              <View style={styles.estHeader}>
                <TouchableOpacity onPress={() => setModoEstudiantes(false)} hitSlop={8}>
                  <Ionicons name="chevron-back" size={22} color={C.text} />
                </TouchableOpacity>
                <Text style={styles.estTitle}>Tus estudiantes</Text>
                <TouchableOpacity onPress={onClose} hitSlop={8}>
                  <Ionicons name="close" size={22} color={C.textMuted} />
                </TouchableOpacity>
              </View>
              <Text style={styles.estHint}>
                Toca un estudiante para chatear, o marca varios para crear un grupo.
              </Text>

              {loadingEst ? (
                <View style={styles.center}>
                  <ActivityIndicator color={C.accent} />
                </View>
              ) : (
                <FlatList
                  data={estudiantes}
                  keyExtractor={(it) => it.id}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{
                    paddingVertical: 8,
                    gap: 8,
                    paddingBottom: seleccion.size >= 1 ? 160 : 8,
                  }}
                  renderItem={({ item }) => {
                    const inicial = item.nombre?.[0]?.toUpperCase() ?? "?";
                    const sel = seleccion.has(item.id);
                    return (
                      <View style={styles.resultItem}>
                        <TouchableOpacity
                          style={styles.estTapZone}
                          activeOpacity={0.8}
                          onPress={() => chatearConEstudiante(item)}
                        >
                          <View style={styles.avatar}>
                            <Text style={styles.avatarText}>{inicial}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.resultName} numberOfLines={1}>
                              {item.nombre}
                            </Text>
                            <Text style={styles.resultDetail} numberOfLines={1}>
                              {item.carrera || "Estudiante"}
                            </Text>
                          </View>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => abrirPerfil("estudiante", item.id)}
                          hitSlop={8}
                          style={styles.verPerfilBtn}
                          accessibilityLabel="Ver perfil"
                        >
                          <Ionicons name="person-circle-outline" size={22} color={C.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => toggleSeleccion(item.id)}
                          hitSlop={8}
                          style={styles.checkbox}
                        >
                          <Ionicons
                            name={sel ? "checkbox" : "square-outline"}
                            size={24}
                            color={sel ? C.accent70 : C.textMuted}
                          />
                        </TouchableOpacity>
                      </View>
                    );
                  }}
                  ListEmptyComponent={
                    <View style={styles.center}>
                      <Text style={styles.emptyText}>
                        No tienes estudiantes registrados todavía.
                      </Text>
                    </View>
                  }
                />
              )}

              {/* Barra flotante para crear grupo con los seleccionados */}
              {seleccion.size >= 1 ? (
                <View style={styles.grupoBar}>
                  <TextInput
                    style={styles.grupoInput}
                    value={nombreGrupo}
                    onChangeText={setNombreGrupo}
                    placeholder={`Nombre del grupo (${seleccion.size} sel.)`}
                    placeholderTextColor={C.textMuted}
                  />
                  <TouchableOpacity
                    style={[
                      styles.grupoBtn,
                      (seleccion.size < 2 || creandoGrupo) && styles.grupoBtnDisabled,
                    ]}
                    onPress={crearGrupo}
                    disabled={seleccion.size < 2 || creandoGrupo}
                    activeOpacity={0.85}
                  >
                    {creandoGrupo ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="people" size={18} color="#fff" />
                        <Text style={styles.grupoBtnText}>
                          Crear grupo ({seleccion.size})
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : null}
            </>
          ) : (
            // ════════ MODO: Buscar usuarios ════════
            <>
              <View style={styles.searchRow}>
                <Ionicons name="search" size={18} color={C.textMuted} />
                <TextInput
                  style={styles.input}
                  value={termino}
                  onChangeText={setTermino}
                  placeholder={placeholder}
                  placeholderTextColor={C.textMuted}
                  autoFocus
                />
                <TouchableOpacity onPress={onClose}>
                  <Ionicons name="close" size={22} color={C.textMuted} />
                </TouchableOpacity>
              </View>

              {loading ? (
                <View style={styles.center}>
                  <ActivityIndicator color={C.accent} />
                </View>
              ) : (
                <FlatList
                  data={resultados}
                  keyExtractor={(item) => item.id}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingVertical: 8, gap: 8 }}
                  renderItem={({ item }) => {
                    return (
                      <View style={styles.resultItem}>
                        <TouchableOpacity
                          style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}
                          activeOpacity={0.8}
                          onPress={() => onPressResultado(item)}
                        >
                          <StorageAvatar url={item.foto} size={42} fallbackIcon="person" />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.resultName} numberOfLines={1}>
                              {item.nombre}
                            </Text>
                            <Text style={styles.resultDetail} numberOfLines={1}>
                              {item.detalle}
                            </Text>
                          </View>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => abrirPerfil(esEmpresa ? "estudiante" : "empresa", item.id)}
                          hitSlop={8}
                          style={styles.verPerfilBtn}
                          accessibilityLabel="Ver perfil"
                        >
                          <Ionicons name="person-circle-outline" size={22} color={C.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => onPressResultado(item)}
                          hitSlop={8}
                        >
                          <Ionicons
                            name="chatbubble-outline"
                            size={18}
                            color={C.accent70}
                          />
                        </TouchableOpacity>
                      </View>
                    );
                  }}
                  ListEmptyComponent={
                    <View style={styles.center}>
                      <Text style={styles.emptyText}>
                        No se encontraron usuarios.
                      </Text>
                    </View>
                  }
                />
              )}
            </>
          )}
        </View>
      </View>
    </Modal>

    {verPerfil ? (
      <ProfileViewerModal
        visible
        tipo={verPerfil.tipo}
        profileId={verPerfil.id}
        onClose={() => setVerPerfil(null)}
      />
    ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(7,5,15,0.75)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    maxHeight: "85%",
    minHeight: "55%",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    marginBottom: 16,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface2,
  },
  input: {
    flex: 1,
    color: C.text,
    fontSize: 14,
  },
  bulkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: C.accent,
  },
  bulkBtnDisabled: {
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
  },
  bulkBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  bulkHint: {
    color: C.textMuted,
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
  },
  center: {
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: C.textMuted,
    fontSize: 14,
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface2,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(139,92,246,0.18)",
    borderWidth: 1,
    borderColor: C.border,
  },
  avatarText: {
    color: "#c4b5fd",
    fontSize: 17,
    fontWeight: "800",
  },
  resultName: {
    color: C.text,
    fontSize: 15,
    fontWeight: "700",
  },
  resultDetail: {
    color: C.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  // ── Modo estudiantes ──
  estHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 6,
  },
  estTitle: {
    flex: 1,
    color: C.text,
    fontSize: 17,
    fontWeight: "800",
  },
  estHint: {
    color: C.textMuted,
    fontSize: 12,
    marginBottom: 6,
  },
  estTapZone: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  checkbox: {
    paddingLeft: 8,
  },
  verPerfilBtn: {
    paddingLeft: 8,
  },
  grupoBar: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 20,
    gap: 10,
  },
  grupoInput: {
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: C.text,
    fontSize: 14,
  },
  grupoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: C.accent,
  },
  grupoBtnDisabled: {
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
  },
  grupoBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
});
