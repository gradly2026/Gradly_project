import { Ionicons } from "@expo/vector-icons";
import { Linking, Modal, StyleSheet, TouchableOpacity, View } from "react-native";
import { AutoText as Text } from "./AutoText";
import type { ModeracionVacantePendiente } from "../services/moderacionVacanteService";

const C = {
  overlay: "rgba(7,5,15,0.75)",
  card: "#0d0b1e",
  border: "rgba(139,92,246,0.28)",
  text: "#f4f1ff",
  textSub: "rgba(255,255,255,0.66)",
  muted: "rgba(255,255,255,0.42)",
  red: "#f87171",
  redBg: "rgba(239,68,68,0.14)",
  purple: "#a78bfa",
  purpleDim: "rgba(139,92,246,0.14)",
};

interface Props {
  pendiente: ModeracionVacantePendiente;
  onCerrar: () => void;
}

/**
 * Aviso obligatorio (dismissible, no bloqueante) mostrado a la empresa dueña
 * cuando un admin deshabilita o elimina una de sus publicaciones — mismo
 * espíritu que el modal de cuenta baneada del login (motivo + contacto), pero
 * a nivel de una vacante puntual en vez de la cuenta completa. Se monta desde
 * `ModeracionVacanteGate`, que además marca `moderacion_notificada:true` al
 * cerrarse para que no vuelva a aparecer.
 */
export default function ModeracionVacanteModal({ pendiente, onCerrar }: Props) {
  const esEliminada = pendiente.estado === "eliminada";

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCerrar}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name={esEliminada ? "trash-outline" : "ban-outline"} size={28} color={C.red} />
          </View>

          <Text style={styles.titulo}>
            {esEliminada ? "Tu publicación fue eliminada" : "Tu publicación fue deshabilitada"}
          </Text>
          <Text style={styles.subtitulo}>
            {esEliminada
              ? `"${pendiente.titulo}" ya no está visible en Gradly para nadie, incluido tu perfil.`
              : `"${pendiente.titulo}" ya no es visible para otros usuarios mientras siga deshabilitada.`}
          </Text>

          {!!pendiente.motivo && (
            <View style={styles.motivoBox}>
              <Text style={styles.motivoLabel}>Motivo</Text>
              <Text style={styles.motivoTexto}>{pendiente.motivo}</Text>
            </View>
          )}

          <Text style={styles.contactoHint}>
            Para más información, ponte en contacto con el administrador que tomó esta decisión.
          </Text>
          {!!pendiente.moderadoPorEmail && (
            <TouchableOpacity
              style={styles.contactRow}
              onPress={() => Linking.openURL(`mailto:${pendiente.moderadoPorEmail}`).catch(() => {})}
              activeOpacity={0.7}
            >
              <Ionicons name="mail-outline" size={16} color={C.purple} />
              <Text style={styles.contactTexto}>{pendiente.moderadoPorEmail}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.btnPrimary} onPress={onCerrar} activeOpacity={0.85}>
            <Text style={styles.btnPrimaryTexto}>Entendido</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: C.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: 22,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: C.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    padding: 24,
    alignItems: "center",
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.redBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  titulo: { fontSize: 18, fontWeight: "800", color: C.text, textAlign: "center" },
  subtitulo: { fontSize: 13.5, color: C.textSub, textAlign: "center", marginTop: 10, lineHeight: 20 },
  motivoBox: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 16,
  },
  motivoLabel: {
    fontSize: 10.5,
    fontWeight: "700",
    color: C.purple,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  motivoTexto: { fontSize: 13.5, color: C.text, lineHeight: 19 },
  contactoHint: { fontSize: 12, color: C.muted, textAlign: "center", marginTop: 16, lineHeight: 17 },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    backgroundColor: C.purpleDim,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  contactTexto: { fontSize: 12.5, color: C.purple, fontWeight: "600" },
  btnPrimary: {
    marginTop: 22,
    width: "100%",
    backgroundColor: C.red,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnPrimaryTexto: { color: "#fff", fontWeight: "800", fontSize: 14.5 },
});
