import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
    Alert,
    Modal,
    SafeAreaView,
    ScrollView,
    StyleSheet,


    TouchableOpacity,
    View,
} from "react-native";
import { AutoText as Text, AutoTextInput as TextInput } from "./AutoText";
import { auth } from "../config/firebaseConfig";
import OfrecerEmpresaModal from "./OfrecerEmpresaModal";

export interface GroupStudent {
  id: string;
  name: string;
  carrera: string;
  estado: string;
  horas?: number | null;
}

export interface GrupoData {
  id: string;
  name: string;
  carrera: string;
  dateCreated: string;
  inicio: string;
  fin: string;
  count: number;
  status: string;
  badgeType:
    | "premium"
    | "verificada"
    | "startup"
    | "pyme"
    | "internacional"
    | "default"
    | "pending"
    | "inprogress"
    | "validated"
    | "completed"
    | "rejected"
    | "convenio"
    | "active"
    | "review";
  tags: string[];
  empresaAsignada: string | null;
  estudiantes: GroupStudent[];
}

interface Props {
  visible: boolean;
  mode: "view" | "edit";
  group: GrupoData | null;
  /** Universidad dueña del grupo. Si no llega, se usa el usuario autenticado. */
  universidadId?: string;
  onClose: () => void;
  onSave?: (updatedGroup: GrupoData) => void;
  saving?: boolean;
}

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

export default function GroupDetailModal({
  visible,
  mode,
  group,
  universidadId,
  onClose,
  onSave,
  saving,
}: Props) {
  const [draft, setDraft] = useState<GrupoData | null>(null);
  const [showOfrecer, setShowOfrecer] = useState(false);

  const ofertaUniversidadId = universidadId ?? auth.currentUser?.uid ?? "";

  useEffect(() => {
    if (group) {
      setDraft(group);
    }
  }, [group, visible]);

  if (!visible || !draft) return null;

  const updateField = (field: keyof GrupoData, value: string | null) => {
    setDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const updateStudent = (index: number, name: string) => {
    if (!draft) return;
    const students = draft.estudiantes.map((student, idx) =>
      idx === index ? { ...student, name } : student,
    );
    setDraft({ ...draft, estudiantes: students });
  };

  const handleSave = () => {
    if (draft && onSave) {
      onSave(draft);
    }
  };

  const handleOfertaCreada = (empresaNombre: string) => {
    setShowOfrecer(false);
    // Feedback de éxito sin sacar al usuario de su dashboard.
    Alert.alert(
      "Solicitud enviada",
      `Tu grupo se ofreció a ${empresaNombre}. La empresa recibirá la solicitud en estado pendiente.`,
    );
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerLabel}>
              {mode === "view" ? "Ver grupo" : "Editar grupo"}
            </Text>
            <Text style={styles.headerSubtitle}>{draft.name}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={22} color={C.text} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Especialidad</Text>
              {mode === "edit" ? (
                <Ionicons name="pencil-outline" size={16} color={C.accent} />
              ) : null}
            </View>
            {mode === "edit" ? (
              <TextInput
                style={styles.input}
                value={draft.carrera}
                onChangeText={(value) => updateField("carrera", value)}
                placeholder="Ej: Ingeniería en Sistemas"
                placeholderTextColor={C.textMuted}
              />
            ) : (
              <Text style={styles.valueText}>{draft.carrera}</Text>
            )}

            <View style={[styles.row, { marginTop: 18 }]}>
              <View style={styles.fieldBlock}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Fecha creación</Text>
                  {mode === "edit" ? (
                    <Ionicons
                      name="pencil-outline"
                      size={16}
                      color={C.accent}
                    />
                  ) : null}
                </View>
                {mode === "edit" ? (
                  <TextInput
                    style={styles.input}
                    value={draft.dateCreated}
                    onChangeText={(value) => updateField("dateCreated", value)}
                    placeholder="DD/MM/AAAA"
                    placeholderTextColor={C.textMuted}
                  />
                ) : (
                  <Text style={styles.valueText}>{draft.dateCreated}</Text>
                )}
              </View>
              <View style={styles.fieldBlock}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Inicio</Text>
                  {mode === "edit" ? (
                    <Ionicons
                      name="pencil-outline"
                      size={16}
                      color={C.accent}
                    />
                  ) : null}
                </View>
                {mode === "edit" ? (
                  <TextInput
                    style={styles.input}
                    value={draft.inicio}
                    onChangeText={(value) => updateField("inicio", value)}
                    placeholder="DD/MM/AAAA"
                    placeholderTextColor={C.textMuted}
                  />
                ) : (
                  <Text style={styles.valueText}>{draft.inicio}</Text>
                )}
              </View>
            </View>

            <View style={[styles.row, { marginTop: 18 }]}>
              <View style={styles.fieldBlock}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Fin</Text>
                  {mode === "edit" ? (
                    <Ionicons
                      name="pencil-outline"
                      size={16}
                      color={C.accent}
                    />
                  ) : null}
                </View>
                {mode === "edit" ? (
                  <TextInput
                    style={styles.input}
                    value={draft.fin}
                    onChangeText={(value) => updateField("fin", value)}
                    placeholder="DD/MM/AAAA"
                    placeholderTextColor={C.textMuted}
                  />
                ) : (
                  <Text style={styles.valueText}>{draft.fin}</Text>
                )}
              </View>
              <View style={styles.fieldBlock}>
                <Text style={styles.label}>Inscritos</Text>
                <Text style={styles.valueText}>{draft.count}</Text>
              </View>
            </View>

            <View style={[styles.labelRow, { marginTop: 18 }]}>
              <Text style={styles.label}>Empresa asignada</Text>
              {mode === "edit" ? (
                <Ionicons name="pencil-outline" size={16} color={C.accent} />
              ) : null}
            </View>
            {mode === "edit" ? (
              <TextInput
                style={styles.input}
                value={draft.empresaAsignada ?? ""}
                onChangeText={(value) =>
                  updateField("empresaAsignada", value || null)
                }
                placeholder="Ej: TechSV Solutions"
                placeholderTextColor={C.textMuted}
              />
            ) : (
              <Text style={styles.valueText}>
                {draft.empresaAsignada || "Sin empresa asignada"}
              </Text>
            )}
          </View>

          <View style={styles.card}>
            <View style={styles.headerCardRow}>
              <Text style={styles.sectionTitle}>Estudiantes</Text>
              <Text style={styles.valueText}>{draft.estudiantes.length}</Text>
            </View>
            {draft.estudiantes.map((student, index) => (
              <View key={student.id} style={styles.studentRow}>
                <View style={{ flex: 1 }}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Nombre</Text>
                    {mode === "edit" ? (
                      <Ionicons
                        name="pencil-outline"
                        size={16}
                        color={C.accent}
                      />
                    ) : null}
                  </View>
                  {mode === "edit" ? (
                    <TextInput
                      style={styles.studentInput}
                      value={student.name}
                      onChangeText={(value) => updateStudent(index, value)}
                      placeholder="Nombre completo"
                      placeholderTextColor={C.textMuted}
                    />
                  ) : (
                    <Text style={styles.valueText}>{student.name}</Text>
                  )}
                  <Text style={[styles.valueText, { marginTop: 6 }]}>
                    {student.carrera} · {student.estado}
                  </Text>
                  {student.horas != null ? (
                    <Text style={[styles.valueText, { marginTop: 6 }]}>
                      Horas: {student.horas}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>

          {mode === "view" ? (
            <TouchableOpacity
              style={styles.btnOffer}
              onPress={() => setShowOfrecer(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="briefcase-outline" size={18} color="#fff" />
              <Text style={styles.btnOfferText}>Ofrecer a Empresa</Text>
            </TouchableOpacity>
          ) : null}

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.btnOutline, { flex: 1 }]}
              onPress={onClose}
              disabled={saving}
            >
              <Text style={styles.btnOutlineText}>Cerrar</Text>
            </TouchableOpacity>
            {mode === "edit" ? (
              <TouchableOpacity
                style={[
                  styles.btnPrimary,
                  { flex: 1, opacity: saving ? 0.7 : 1 },
                ]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={styles.btnPrimaryText}>
                  {saving ? "Guardando..." : "Guardar cambios"}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </ScrollView>

        <OfrecerEmpresaModal
          visible={showOfrecer}
          group={draft}
          universidadId={ofertaUniversidadId}
          onClose={() => setShowOfrecer(false)}
          onSuccess={handleOfertaCreada}
        />
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
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  label: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  valueText: {
    color: C.text,
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.05)",
    color: C.text,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  fieldBlock: {
    flex: 1,
  },
  headerCardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: "800",
  },
  studentRow: {
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 16,
    marginBottom: 12,
  },
  studentInput: {
    backgroundColor: "rgba(255,255,255,0.05)",
    color: C.text,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  btnOffer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.accent,
    borderRadius: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  btnOfferText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 6,
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
