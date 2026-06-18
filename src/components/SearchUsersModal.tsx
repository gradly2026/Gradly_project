import { Ionicons } from "@expo/vector-icons";
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
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../config/firebaseConfig";
import { type UserRole } from "../context/AuthContext";

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

  const esEmpresa = rol === "empresa";
  const esUniversidad = rol === "universidad";

  // Carga el lote base de usuarios y comprueba si la universidad tiene grupos.
  useEffect(() => {
    if (!visible) {
      setTermino("");
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
            };
          }
          return {
            id: d.id,
            nombre: String(data.nombre_empresa ?? "Empresa"),
            detalle: String(data.industria ?? "Sin rubro"),
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

  const onPressResultado = () => {
    // El esquema de chat directo aún no existe (decisión: "Solo UI por ahora").
    Alert.alert(
      "Próximamente",
      "La mensajería directa con este usuario estará disponible pronto.",
    );
  };

  const onBulkLoad = () => {
    if (!hasGrupos) return;
    onClose();
    Alert.alert(
      "Chatea con tus estudiantes",
      "El chat con los alumnos de tu primer grupo estará disponible próximamente.",
    );
  };

  const placeholder = esEmpresa
    ? "Buscar estudiantes por nombre o carrera"
    : "Buscar empresas por nombre o rubro";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.container}>
          <View style={styles.handle} />

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

          {esUniversidad ? (
            <TouchableOpacity
              style={[styles.bulkBtn, !hasGrupos && styles.bulkBtnDisabled]}
              onPress={onBulkLoad}
              disabled={!hasGrupos}
              activeOpacity={0.85}
            >
              <Ionicons
                name="people"
                size={18}
                color={hasGrupos ? "#fff" : C.textMuted}
              />
              <Text
                style={[
                  styles.bulkBtnText,
                  !hasGrupos && { color: C.textMuted },
                ]}
              >
                Chatea con tus estudiantes
              </Text>
            </TouchableOpacity>
          ) : null}
          {esUniversidad && !hasGrupos ? (
            <Text style={styles.bulkHint}>
              Crea un grupo de estudiantes para habilitar esta opción.
            </Text>
          ) : null}

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
                const inicial = item.nombre?.[0]?.toUpperCase() ?? "?";
                return (
                  <TouchableOpacity
                    style={styles.resultItem}
                    activeOpacity={0.8}
                    onPress={onPressResultado}
                  >
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{inicial}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultName} numberOfLines={1}>
                        {item.nombre}
                      </Text>
                      <Text style={styles.resultDetail} numberOfLines={1}>
                        {item.detalle}
                      </Text>
                    </View>
                    <Ionicons
                      name="chatbubble-outline"
                      size={18}
                      color={C.accent70}
                    />
                  </TouchableOpacity>
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
        </View>
      </View>
    </Modal>
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
});
