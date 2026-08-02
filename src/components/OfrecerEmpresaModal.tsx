import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  SafeAreaView,
  StyleSheet,


  TouchableOpacity,
  View,
} from "react-native";
import { AutoText as Text, AutoTextInput as TextInput } from "./AutoText";
import {
  buscarEmpresas,
  crearSolicitudPractica,
  type EmpresaResult,
} from "../services/solicitudPracticaService";
import { type GrupoData } from "./GroupDetailModal";

const C = {
  bg: "#07050f",
  surface: "#0d0b1e",
  text: "#ffffff",
  muted: "rgba(255,255,255,0.65)",
  textMuted: "rgba(255,255,255,0.38)",
  accent: "#8b5cf6",
  border: "rgba(139,92,246,0.22)",
  card: "rgba(255,255,255,0.03)",
  green: "#34d399",
};

interface Props {
  visible: boolean;
  group: GrupoData | null;
  universidadId: string;
  onClose: () => void;
  /** Se invoca tras crear la solicitud con éxito (para feedback + cerrar). */
  onSuccess: (empresaNombre: string) => void;
}

export default function OfrecerEmpresaModal({
  visible,
  group,
  universidadId,
  onClose,
  onSuccess,
}: Props) {
  const [termino, setTermino] = useState("");
  const [resultados, setResultados] = useState<EmpresaResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [seleccionada, setSeleccionada] = useState<EmpresaResult | null>(null);
  const [enviando, setEnviando] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reinicia el estado cada vez que se abre.
  useEffect(() => {
    if (visible) {
      setTermino("");
      setSeleccionada(null);
      setEnviando(false);
      void cargarEmpresas("");
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const cargarEmpresas = async (q: string) => {
    setLoading(true);
    try {
      const data = await buscarEmpresas(q);
      setResultados(data);
    } catch (error) {
      console.warn("Error buscando empresas:", error);
      setResultados([]);
    } finally {
      setLoading(false);
    }
  };

  const handleChangeTermino = (value: string) => {
    setTermino(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void cargarEmpresas(value), 300);
  };

  const handleConfirmar = async () => {
    if (!seleccionada || !group || enviando) return;
    setEnviando(true);
    try {
      await crearSolicitudPractica({
        universidadId,
        empresaId: seleccionada.id,
        grupoId: group.id,
        grupoNombre: group.name,
        alumnos: group.estudiantes.map((s) => ({ id: s.id, nombre: s.name })),
        carrera: group.carrera,
        fechaInicio: group.inicio,
        fechaFin: group.fin,
      });
      onSuccess(seleccionada.nombre);
    } catch (error: any) {
      console.warn("Error creando solicitud de prácticas:", error);
      // Mantenemos el modal abierto para reintentar.
      setEnviando(false);
    }
  };

  const renderEmpresa = ({ item }: { item: EmpresaResult }) => {
    const activa = seleccionada?.id === item.id;
    return (
      <TouchableOpacity
        style={[styles.empresaCard, activa && styles.empresaCardActive]}
        activeOpacity={0.85}
        onPress={() => setSeleccionada(item)}
      >
        <View style={styles.empresaAvatar}>
          <Ionicons name="business" size={18} color={C.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.empresaNombreRow}>
            <Text style={styles.empresaNombre} numberOfLines={1}>
              {item.nombre}
            </Text>
            {item.verificado ? (
              <Ionicons name="checkmark-circle" size={14} color={C.green} />
            ) : null}
          </View>
          <Text style={styles.empresaIndustria} numberOfLines={1}>
            {item.industria || "Sin rubro especificado"}
          </Text>
        </View>
        <Ionicons
          name={activa ? "radio-button-on" : "radio-button-off"}
          size={20}
          color={activa ? C.accent : C.textMuted}
        />
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerLabel}>Ofrecer grupo</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {group?.name ?? ""}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={22} color={C.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={C.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={termino}
            onChangeText={handleChangeTermino}
            placeholder="Buscar empresa por nombre o rubro..."
            placeholderTextColor={C.textMuted}
            selectionColor={C.accent}
            autoCorrect={false}
          />
        </View>

        <FlatList
          data={resultados}
          keyExtractor={(item) => item.id}
          renderItem={renderEmpresa}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            loading ? (
              <View style={styles.emptyBox}>
                <ActivityIndicator color={C.accent} />
              </View>
            ) : (
              <View style={styles.emptyBox}>
                <Ionicons
                  name="business-outline"
                  size={28}
                  color={C.textMuted}
                />
                <Text style={styles.emptyText}>
                  No se encontraron empresas.
                </Text>
              </View>
            )
          }
          ListHeaderComponent={
            loading && resultados.length > 0 ? (
              <ActivityIndicator
                color={C.accent}
                style={{ marginBottom: 12 }}
              />
            ) : null
          }
        />

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.btnOutline, { flex: 1 }]}
            onPress={onClose}
            disabled={enviando}
          >
            <Text style={styles.btnOutlineText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.btnPrimary,
              { flex: 1 },
              (!seleccionada || enviando) && { opacity: 0.5 },
            ]}
            onPress={handleConfirmar}
            disabled={!seleccionada || enviando}
          >
            <Text style={styles.btnPrimaryText}>
              {enviando ? "Enviando..." : "Enviar solicitud"}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
  },
  headerLabel: {
    color: C.textMuted,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  headerSubtitle: {
    color: C.text,
    fontSize: 20,
    fontWeight: "800",
    marginTop: 4,
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  searchInput: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    padding: 0,
  },
  listContent: {
    padding: 16,
    paddingBottom: 24,
    gap: 10,
  },
  empresaCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  empresaCardActive: {
    borderColor: C.accent,
    backgroundColor: "rgba(139,92,246,0.10)",
  },
  empresaAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(139,92,246,0.14)",
  },
  empresaNombreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  empresaNombre: {
    color: C.text,
    fontSize: 15,
    fontWeight: "700",
    flexShrink: 1,
  },
  empresaIndustria: {
    color: C.muted,
    fontSize: 13,
    marginTop: 2,
  },
  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    gap: 10,
  },
  emptyText: {
    color: C.textMuted,
    fontSize: 14,
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  btnPrimary: {
    backgroundColor: C.accent,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: {
    color: "#fff",
    fontWeight: "700",
  },
  btnOutline: {
    borderWidth: 1,
    borderColor: C.accent,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  btnOutlineText: {
    color: C.accent,
    fontWeight: "700",
  },
});
