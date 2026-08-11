/**
 * ReportarUsuarioModal — modal reutilizable para que CUALQUIER usuario reporte
 * a otro. Escribe en `reportes` (vía reporteService) con el esquema que lee el
 * panel admin, y notifica al admin. Theme-aware (claro/oscuro) e i18n (AutoText).
 *
 * Uso:
 *   <ReportarUsuarioModal
 *     visible={open}
 *     reportadoId={peerUid}
 *     reportadoNombre={peerName}
 *     onClose={() => setOpen(false)}
 *   />
 */
import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme, type GradlyColors } from "../context/ThemeContext";
import { MOTIVOS_REPORTE, crearReporte } from "../services/reporteService";
import { AutoText as Text, AutoTextInput as TextInput } from "./AutoText";

interface Props {
  visible: boolean;
  reportadoId: string;
  reportadoNombre?: string;
  onClose: () => void;
  /** Categoría del reporte (por defecto "usuario"). */
  tipo?: string;
  /** Callback tras enviar con éxito. */
  onSubmitted?: () => void;
}

export default function ReportarUsuarioModal({
  visible,
  reportadoId,
  reportadoNombre,
  onClose,
  tipo = "usuario",
  onSubmitted,
}: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [motivo, setMotivo] = useState<string>("");
  const [descripcion, setDescripcion] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const reset = () => {
    setMotivo("");
    setDescripcion("");
    setError("");
    setDone(false);
    setSending(false);
  };

  const cerrar = () => {
    reset();
    onClose();
  };

  const enviar = async () => {
    setError("");
    if (!motivo) {
      setError("Selecciona un motivo.");
      return;
    }
    setSending(true);
    try {
      await crearReporte({ reportadoId, motivo, descripcion, tipo });
      setDone(true);
      onSubmitted?.();
    } catch (e: any) {
      setError(e?.message ?? "No se pudo enviar el reporte.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={cerrar}>
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.header}>
            <View style={s.headerIcon}>
              <Ionicons name="flag" size={18} color={colors.error} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Reportar usuario</Text>
              {reportadoNombre ? (
                <Text style={s.subtitle} numberOfLines={1}>
                  {reportadoNombre}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={cerrar} style={s.closeBtn} activeOpacity={0.8}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {done ? (
            <View style={s.doneBox}>
              <Ionicons name="checkmark-circle" size={44} color={colors.success} />
              <Text style={s.doneTitle}>Reporte enviado</Text>
              <Text style={s.doneText}>
                Gracias. Nuestro equipo administrativo revisará el caso.
              </Text>
              <TouchableOpacity style={s.btnPrimary} onPress={cerrar} activeOpacity={0.85}>
                <Text style={s.btnPrimaryText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.label}>Motivo</Text>
              <View style={s.motivos}>
                {MOTIVOS_REPORTE.map((m) => {
                  const active = motivo === m;
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[s.motivoChip, active && s.motivoChipActive]}
                      onPress={() => {
                        setMotivo(m);
                        setError("");
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.motivoText, active && s.motivoTextActive]}>{m}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[s.label, { marginTop: 16 }]}>Descripción (opcional)</Text>
              <TextInput
                style={s.input}
                value={descripcion}
                onChangeText={setDescripcion}
                placeholder="Describe brevemente lo ocurrido…"
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={600}
                selectionColor={colors.primary}
              />

              {!!error && <Text style={s.error}>{error}</Text>}

              <TouchableOpacity
                style={[s.btnPrimary, sending && { opacity: 0.6 }]}
                onPress={enviar}
                disabled={sending}
                activeOpacity={0.85}
              >
                {sending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.btnPrimaryText}>Enviar reporte</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={s.btnGhost} onPress={cerrar} activeOpacity={0.8}>
                <Text style={s.btnGhostText}>Cancelar</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: GradlyColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "flex-end",
    },
    card: {
      backgroundColor: c.backgroundCard,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 1,
      borderColor: c.border,
      padding: 20,
      maxHeight: "88%",
    },
    header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
    headerIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: "rgba(239,68,68,0.12)",
      alignItems: "center",
      justifyContent: "center",
    },
    title: { color: c.textPrimary, fontSize: 17, fontWeight: "800" },
    subtitle: { color: c.textMuted, fontSize: 13, marginTop: 2 },
    closeBtn: { padding: 4 },
    label: {
      color: c.primaryLight,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.3,
      marginBottom: 8,
    },
    motivos: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    motivoChip: {
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.backgroundSurface,
    },
    motivoChipActive: {
      borderColor: c.primary,
      backgroundColor: c.primary20,
    },
    motivoText: { color: c.textSecondary, fontSize: 13, fontWeight: "600" },
    motivoTextActive: { color: c.primaryLight },
    input: {
      minHeight: 90,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      backgroundColor: c.backgroundSurface,
      color: c.textPrimary,
      padding: 12,
      fontSize: 14,
      textAlignVertical: "top",
    },
    error: { color: c.error, fontSize: 13, marginTop: 10 },
    btnPrimary: {
      height: 50,
      borderRadius: 14,
      backgroundColor: c.error,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 18,
    },
    btnPrimaryText: { color: "#fff", fontSize: 15, fontWeight: "700" },
    btnGhost: { height: 46, alignItems: "center", justifyContent: "center", marginTop: 6 },
    btnGhostText: { color: c.textMuted, fontSize: 14, fontWeight: "600" },
    doneBox: { alignItems: "center", paddingVertical: 18, gap: 10 },
    doneTitle: { color: c.textPrimary, fontSize: 18, fontWeight: "800" },
    doneText: { color: c.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20 },
  });
