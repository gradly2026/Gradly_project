import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  CRITERIOS_EMPRESA_A_ESTUDIANTE,
  CRITERIOS_ESTUDIANTE_A_EMPRESA,
  enviarFeedback,
  type EnviarFeedbackResult,
  type FeedbackPendiente,
} from "../services/feedbackService";

const C = {
  overlay: "rgba(7,5,15,0.92)",
  surface: "#0d0b1e",
  card: "rgba(255,255,255,0.04)",
  border: "rgba(139,92,246,0.25)",
  text: "#f4f1ff",
  textSub: "rgba(255,255,255,0.65)",
  muted: "rgba(255,255,255,0.40)",
  accent: "#8b5cf6",
  star: "#f5b50a",
  starOff: "rgba(255,255,255,0.18)",
  green: "#34d399",
};

interface Props {
  pendiente: FeedbackPendiente;
  onSubmitted: () => void;
}

/** Selector de 1 a 5 estrellas. */
function StarRow({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity
          key={n}
          onPress={() => onChange(n)}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          activeOpacity={0.7}
        >
          <Ionicons
            name={n <= value ? "star" : "star-outline"}
            size={30}
            color={n <= value ? C.star : C.starOff}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

/**
 * Formulario de Experiencia Gradly. Modal **obligatorio** (no se puede cerrar
 * sin enviar) que recoge la evaluación de la contraparte tras una pasantía
 * finalizada y, al enviar, dispara la transacción de subida de rango.
 */
export default function FeedbackExperienciaModal({
  pendiente,
  onSubmitted,
}: Props) {
  const criterios = useMemo(
    () =>
      pendiente.evaluadorRol === "estudiante"
        ? CRITERIOS_ESTUDIANTE_A_EMPRESA
        : CRITERIOS_EMPRESA_A_ESTUDIANTE,
    [pendiente.evaluadorRol],
  );

  const [valores, setValores] = useState<Record<string, number>>({});
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<EnviarFeedbackResult | null>(null);

  const completo = criterios.every((c) => (valores[c.key] ?? 0) > 0);

  const setEstrella = (key: string, v: number) =>
    setValores((prev) => ({ ...prev, [key]: v }));

  const handleEnviar = async () => {
    if (!completo || enviando) return;
    setEnviando(true);
    try {
      const res = await enviarFeedback({
        feedbackId: pendiente.feedbackId,
        solicitudId: pendiente.solicitudId,
        evaluadorId: pendiente.evaluadorId,
        evaluadorRol: pendiente.evaluadorRol,
        evaluadoId: pendiente.evaluadoId,
        evaluadoRol: pendiente.evaluadoRol,
        criterios: valores,
        comentario,
      });
      setResultado(res);
    } catch (error: any) {
      // Si ya existía (doble envío), lo tratamos como completado.
      if (String(error?.message ?? "").includes("Ya enviaste")) {
        onSubmitted();
        return;
      }
      console.warn("Error enviando feedback:", error);
      setEnviando(false);
    }
  };

  const titulo =
    pendiente.evaluadorRol === "estudiante"
      ? `¿Cómo fue tu experiencia con ${pendiente.evaluadoNombre}?`
      : `Evalúa el desempeño de ${pendiente.evaluadoNombre}`;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Cabecera */}
          <View style={styles.headerBadge}>
            <Ionicons name="ribbon" size={18} color={C.accent} />
            <Text style={styles.headerBadgeText}>Formulario de Experiencia Gradly</Text>
          </View>

          {resultado ? (
            // ── Pantalla de resultado (subida de XP / rango) ──
            <View style={styles.resultWrap}>
              <View
                style={[styles.rangoCircle, { borderColor: resultado.rango.color }]}
              >
                <Ionicons name="trophy" size={40} color={resultado.rango.color} />
              </View>
              <Text style={styles.resultXp}>+{resultado.xp} XP</Text>
              {resultado.subioDeRango ? (
                <Text style={styles.resultSubio}>¡Subiste de rango! 🎉</Text>
              ) : null}
              <Text style={styles.resultRango}>
                Rango: <Text style={{ color: resultado.rango.color }}>{resultado.rango.nivel}</Text>
              </Text>
              <Text style={styles.resultThanks}>
                Gracias por compartir tu experiencia.
              </Text>
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={onSubmitted}
                activeOpacity={0.9}
              >
                <Text style={styles.submitText}>Continuar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.titulo}>{titulo}</Text>
              <Text style={styles.subtitulo}>
                Tu evaluación es obligatoria y ayuda a mantener la confianza de la
                comunidad Gradly.
              </Text>

              {criterios.map((c) => (
                <View key={c.key} style={styles.criterio}>
                  <Text style={styles.criterioLabel}>{c.label}</Text>
                  <StarRow
                    value={valores[c.key] ?? 0}
                    onChange={(v) => setEstrella(c.key, v)}
                  />
                </View>
              ))}

              <Text style={styles.criterioLabel}>Comentario</Text>
              <TextInput
                style={styles.input}
                value={comentario}
                onChangeText={setComentario}
                placeholder="Cuéntanos más sobre tu experiencia (opcional)"
                placeholderTextColor={C.muted}
                multiline
              />

              <TouchableOpacity
                style={[styles.submitBtn, (!completo || enviando) && styles.submitBtnDisabled]}
                onPress={handleEnviar}
                disabled={!completo || enviando}
                activeOpacity={0.9}
              >
                {enviando ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send" size={16} color="#fff" />
                    <Text style={styles.submitText}>Enviar Evaluación</Text>
                  </>
                )}
              </TouchableOpacity>
              {!completo ? (
                <Text style={styles.hint}>
                  Califica todos los criterios para continuar.
                </Text>
              ) : null}
            </ScrollView>
          )}
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
    padding: 18,
  },
  sheet: {
    backgroundColor: C.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
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
    backgroundColor: "rgba(139,92,246,0.12)",
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 18,
  },
  headerBadgeText: {
    color: C.accent,
    fontSize: 13,
    fontWeight: "800",
  },
  titulo: {
    color: C.text,
    fontSize: 19,
    fontWeight: "800",
    textAlign: "center",
  },
  subtitulo: {
    color: C.textSub,
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 18,
    lineHeight: 19,
  },
  criterio: {
    marginBottom: 16,
  },
  criterioLabel: {
    color: C.text,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  starRow: {
    flexDirection: "row",
    gap: 10,
  },
  input: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 12,
    color: C.text,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
    marginTop: 4,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingVertical: 15,
    marginTop: 20,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  hint: {
    color: C.muted,
    fontSize: 12,
    textAlign: "center",
    marginTop: 10,
  },
  // ── Resultado ──
  resultWrap: {
    alignItems: "center",
    paddingVertical: 12,
    gap: 8,
  },
  rangoCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    marginBottom: 6,
  },
  resultXp: {
    color: C.green,
    fontSize: 28,
    fontWeight: "900",
  },
  resultSubio: {
    color: C.star,
    fontSize: 15,
    fontWeight: "800",
  },
  resultRango: {
    color: C.text,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 2,
  },
  resultThanks: {
    color: C.textSub,
    fontSize: 13,
    textAlign: "center",
    marginTop: 4,
  },
});
