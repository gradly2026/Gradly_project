import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,


  TouchableOpacity,
  View,
} from "react-native";
import { AutoText as Text, AutoTextInput as TextInput } from "./AutoText";
import { useTheme, type GradlyColors } from "../context/ThemeContext";
import {
  CARRERAS_EL_SALVADOR,
  avisosZonaRoja,
  cargarOverridesCarreras,
  carrerasRojasEn,
  zonaDeCarrera,
  type AvisoZonaRoja,
  type Carrera,
} from "../data/carreras";

/**
 * Editor de carreras ofertadas reutilizable (Mi Perfil de universidad).
 * Mismo gate de Zona Roja que el registro: las carreras reguladas por el
 * Estado salen con candado y muestran el aviso legal; no se pueden seleccionar.
 */
export default function CarrerasEditorModal({
  visible,
  initial,
  onClose,
  onSave,
}: {
  visible: boolean;
  initial: string[];
  onClose: () => void;
  onSave: (nombres: string[]) => void | Promise<void>;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [selected, setSelected] = useState<string[]>(initial);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [avisos, setAvisos] = useState<AvisoZonaRoja[] | null>(null);

  // Al abrir: sincroniza la selección con la actual y refresca overrides.
  useEffect(() => {
    if (visible) {
      setSelected(initial);
      setSearch("");
      cargarOverridesCarreras();
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CARRERAS_EL_SALVADOR;
    return CARRERAS_EL_SALVADOR.filter(
      (c) =>
        c.nombre.toLowerCase().includes(q) ||
        c.tipo.toLowerCase().includes(q) ||
        c.modalidad.toLowerCase().includes(q),
    );
  }, [search]);

  // Selección libre; la validación de Zona Roja ocurre al pulsar "Guardar".
  const toggle = (nombre: string) => {
    setSelected((prev) =>
      prev.includes(nombre) ? prev.filter((x) => x !== nombre) : [...prev, nombre],
    );
  };

  const guardar = async () => {
    // Examina la selección: si hay carreras Zona Roja, muestra el aviso legal
    // y NO guarda; el usuario acepta y se deseleccionan.
    if (carrerasRojasEn(selected).length > 0) {
      setAvisos(avisosZonaRoja(selected));
      return;
    }
    setSaving(true);
    try {
      await onSave(selected);
      onClose();
    } catch {
      Alert.alert("Error", "No se pudieron guardar las carreras.");
    } finally {
      setSaving(false);
    }
  };

  // Aceptado el aviso → se anulan las carreras Zona Roja y se cierra el aviso.
  const aceptarAvisos = () => {
    setSelected((prev) => prev.filter((n) => zonaDeCarrera(n) !== "roja"));
    setAvisos(null);
  };

  const renderItem = ({ item }: { item: Carrera }) => {
    const sel = selected.includes(item.nombre);
    const esRoja = zonaDeCarrera(item.nombre) === "roja";
    return (
      <TouchableOpacity
        style={[s.item, sel && s.itemSel, esRoja && !sel && { opacity: 0.55 }]}
        activeOpacity={0.7}
        onPress={() => toggle(item.nombre)}
      >
        <View style={[s.checkbox, sel && s.checkboxOn]}>
          {sel && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.itemName} numberOfLines={2}>
            {item.nombre}
          </Text>
          <Text style={s.itemMeta}>
            {item.tipo} · {item.modalidad} · {item.duracion}
            {esRoja ? "  ·  🔒 Regulada por el Estado" : ""}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.header}>
            <Text style={s.title}>Carreras ofertadas</Text>
            <TouchableOpacity onPress={onClose} style={s.close}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={s.searchRow}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              style={s.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar carrera, tipo o modalidad…"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <FlatList
            data={filtradas}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
            style={s.list}
            ListEmptyComponent={<Text style={s.empty}>No se encontraron carreras.</Text>}
          />

          <TouchableOpacity
            style={[s.saveBtn, saving && { opacity: 0.6 }]}
            disabled={saving}
            onPress={guardar}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.saveBtnText}>Guardar ({selected.length})</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Aviso legal de carreras Zona Roja detectadas al guardar */}
        <Modal
          visible={!!avisos}
          transparent
          animationType="fade"
          onRequestClose={() => setAvisos(null)}
        >
          <View style={s.avisoOverlay}>
            <View style={s.avisoCard}>
              <View style={s.avisoIcon}>
                <Ionicons name="shield-checkmark-outline" size={30} color={colors.primary} />
              </View>
              <ScrollView style={{ width: "100%" }}>
                {(avisos ?? []).map((a, i) => (
                  <View key={a.motivo} style={{ marginBottom: i < (avisos?.length ?? 0) - 1 ? 16 : 0 }}>
                    <Text style={s.avisoTitle}>{a.titulo}</Text>
                    <Text style={s.avisoBody}>{a.cuerpo}</Text>
                    <Text style={s.avisoAfecta}>Se quitará(n): {a.carreras.join(", ")}</Text>
                  </View>
                ))}
              </ScrollView>
              <TouchableOpacity style={[s.saveBtn, { marginTop: 14 }]} onPress={aceptarAvisos}>
                <Text style={s.saveBtnText}>Entendido</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const makeStyles = (c: GradlyColors) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
    card: {
      backgroundColor: c.backgroundCard,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingHorizontal: 18,
      paddingTop: 14,
      paddingBottom: 22,
      maxHeight: "88%",
    },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    title: { fontSize: 20, fontWeight: "700", color: c.textPrimary },
    close: { padding: 6 },
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: c.white4,
      borderRadius: 12,
      paddingHorizontal: 12,
      height: 44,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 12,
    },
    searchInput: { flex: 1, color: c.textPrimary, fontSize: 15 },
    list: { flexGrow: 0 },
    item: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 8,
    },
    itemSel: { borderColor: c.primary, backgroundColor: c.primary12 },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxOn: { backgroundColor: c.primary, borderColor: c.primary },
    itemName: { color: c.textPrimary, fontSize: 14, fontWeight: "600" },
    itemMeta: { color: c.textMuted, fontSize: 12, marginTop: 2 },
    empty: { color: c.textMuted, textAlign: "center", paddingVertical: 24 },
    saveBtn: {
      backgroundColor: c.primary,
      borderRadius: 14,
      height: 50,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 12,
    },
    saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
    avisoOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 20 },
    avisoCard: {
      backgroundColor: c.backgroundCard,
      borderRadius: 18,
      padding: 20,
      width: "100%",
      maxWidth: 440,
      maxHeight: "85%",
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
    },
    avisoIcon: { marginBottom: 12 },
    avisoTitle: { color: c.textPrimary, fontSize: 16, fontWeight: "700", marginBottom: 6, textAlign: "center" },
    avisoBody: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
    avisoAfecta: { color: c.textPrimary, fontSize: 13, fontWeight: "700", marginTop: 6 },
  });
