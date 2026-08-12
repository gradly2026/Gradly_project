import { Ionicons } from "@expo/vector-icons";
import { doc, updateDoc } from "firebase/firestore";
import { useMemo, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { AutoText as Text, AutoTextInput as TextInput } from "./AutoText";
import UbicacionSelector from "./UbicacionSelector";
import { db } from "../config/firebaseConfig";
import { useTheme, type GradlyColors } from "../context/ThemeContext";
import type { UbicacionEstudiante } from "../data/ubicacionElSalvador";

interface Props {
  uid: string;
  onGuardado: () => void;
}

/**
 * Modal **obligatorio** (no se puede cerrar sin guardar) que completa el dato
 * que `perfiles_estudiantes` nunca llegó a pedir: departamento/distrito del
 * estudiante. Es el "primer login completa su dirección" que quedó pendiente
 * desde la decisión original de MVP — ver [[project_reparto_cupos]] Fase 9.1.
 *
 * Mismo patrón que FeedbackExperienciaModal: `Modal` centrado, sin botón de
 * cerrar, `onRequestClose` vacío para que el botón atrás de Android no lo
 * descarte.
 */
export default function OnboardingDireccionModal({ uid, onGuardado }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [valor, setValor] = useState<Partial<UbicacionEstudiante>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  // ── Descripción + skills (opcionales) — el perfil recién creado por la
  // universidad (importación Excel) llega sin ninguno de los dos, así que
  // se piden aquí de una vez en vez de dejarlos para que el estudiante los
  // descubra luego en "Mi Perfil". ──
  const [descripcion, setDescripcion] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");

  const agregarSkill = () => {
    const sk = skillInput.trim();
    if (!sk || skills.includes(sk)) { setSkillInput(""); return; }
    setSkills((prev) => [...prev, sk]);
    setSkillInput("");
  };

  const quitarSkill = (sk: string) => {
    setSkills((prev) => prev.filter((s) => s !== sk));
  };

  const completo = !!valor.departamento && !!valor.distrito;

  const guardar = async () => {
    if (!completo || guardando) return;
    setGuardando(true);
    setError("");
    try {
      await updateDoc(doc(db, "perfiles_estudiantes", uid), {
        departamento: valor.departamento,
        distrito: valor.distrito,
        direccion: valor.direccion?.trim() || "",
        descripcion: descripcion.trim(),
        skills,
      });
      onGuardado();
    } catch (e) {
      console.warn("Error guardando ubicación de onboarding:", e);
      setError("No se pudo guardar. Verifica tu conexión e intenta de nuevo.");
      setGuardando(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.headerBadge}>
            <Ionicons name="sparkles" size={18} color={colors.primaryLight} />
            <Text style={s.headerBadgeText}>¡Bienvenido/a a Gradly!</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={s.titulo}>¿Dónde vivís?</Text>
            <Text style={s.subtitulo}>
              Como sos usuario nuevo, antes de llevarte a tu nuevo perfil necesitamos
              que completes este dato. Nos ayuda a mostrarte empresas y universidades
              cercanas a vos, y solo se pide una vez.
            </Text>

            <UbicacionSelector value={valor} onChange={setValor} />

            <Text style={[s.label, { marginTop: 18 }]}>Descripción (opcional)</Text>
            <TextInput
              style={s.descripcionInput}
              value={descripcion}
              onChangeText={setDescripcion}
              placeholder="Contanos brevemente sobre vos…"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
            />

            <Text style={[s.label, { marginTop: 14 }]}>Habilidades (opcional)</Text>
            <View style={s.skillsRow}>
              <TextInput
                style={s.skillInput}
                value={skillInput}
                onChangeText={setSkillInput}
                placeholder="Ej: Excel, atención al cliente…"
                placeholderTextColor={colors.textMuted}
                onSubmitEditing={agregarSkill}
                returnKeyType="done"
              />
              <TouchableOpacity style={s.skillAddBtn} onPress={agregarSkill} activeOpacity={0.8}>
                <Ionicons name="add" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
            {skills.length > 0 && (
              <View style={s.skillsWrap}>
                {skills.map((sk) => (
                  <TouchableOpacity
                    key={sk}
                    style={s.skillChip}
                    onPress={() => quitarSkill(sk)}
                    activeOpacity={0.75}
                  >
                    <Text style={s.skillChipTxt} noTranslate>{sk}</Text>
                    <Ionicons name="close" size={13} color={colors.primaryLight} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {!!error && <Text style={s.errorTxt}>{error}</Text>}

            <TouchableOpacity
              style={[s.submitBtn, (!completo || guardando) && s.submitBtnDisabled]}
              onPress={guardar}
              disabled={!completo || guardando}
              activeOpacity={0.9}
            >
              {guardando ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={16} color="#fff" />
                  <Text style={s.submitText}>Guardar y continuar</Text>
                </>
              )}
            </TouchableOpacity>
            {!completo ? (
              <Text style={s.hint}>Elige tu departamento y distrito para continuar.</Text>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (COLORS: GradlyColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.75)",
      justifyContent: "center",
      padding: 18,
    },
    sheet: {
      backgroundColor: COLORS.backgroundDark,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: COLORS.border,
      padding: 22,
      maxHeight: "88%",
    },
    headerBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      alignSelf: "center",
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 14,
      backgroundColor: COLORS.primary12,
      borderWidth: 1,
      borderColor: COLORS.border,
      marginBottom: 18,
    },
    headerBadgeText: { color: COLORS.primaryLight, fontSize: 13, fontWeight: "800" },
    titulo: {
      color: COLORS.textPrimary,
      fontSize: 19,
      fontWeight: "800",
      textAlign: "center",
    },
    subtitulo: {
      color: COLORS.textMuted,
      fontSize: 13,
      textAlign: "center",
      marginTop: 6,
      marginBottom: 20,
      lineHeight: 18,
    },
    errorTxt: { color: COLORS.error, fontSize: 12.5, textAlign: "center", marginTop: 12 },
    submitBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: COLORS.primary,
      borderRadius: 14,
      paddingVertical: 14,
      marginTop: 20,
    },
    submitBtnDisabled: { opacity: 0.45 },
    submitText: { color: "#fff", fontSize: 14, fontWeight: "700" },
    hint: { color: COLORS.textMuted, fontSize: 11.5, textAlign: "center", marginTop: 8 },
    label: { fontSize: 13, fontWeight: "600", color: COLORS.textPrimary, marginBottom: 8 },
    descripcionInput: {
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.backgroundCard,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 13,
      color: COLORS.textPrimary,
      minHeight: 70,
      textAlignVertical: "top",
    },
    skillsRow: { flexDirection: "row", gap: 8, alignItems: "center" },
    skillInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.backgroundCard,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 13,
      color: COLORS.textPrimary,
    },
    skillAddBtn: {
      width: 38,
      height: 38,
      borderRadius: 10,
      backgroundColor: COLORS.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    skillsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
    skillChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.primary12,
    },
    skillChipTxt: { fontSize: 12.5, color: COLORS.textPrimary },
  });
