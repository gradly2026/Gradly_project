import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,


  TouchableOpacity,
  View,
} from "react-native";
import { AutoText as Text, AutoTextInput as TextInput } from "./AutoText";
import {
  criteriosPara,
  enviarFeedback,
  type EnviarFeedbackResult,
  type FeedbackPendiente,
} from "../services/feedbackService";
import {
  getIncidenciasDeEstudiante,
  type Incidencia,
} from "../services/incidenciaService";

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

/** Etiqueta legible del estado de una incidencia. */
const ESTADO_INC: Record<string, string> = {
  abierta: "Abierta",
  en_seguimiento: "En seguimiento",
  escalada: "Escalada",
  resuelta: "Resuelta",
};

/** Escala de calificación (1..ESCALA_MAX). */
const ESCALA_MAX = 10;

/** Selector de 1 a 10 estrellas. */
function StarRow({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.starRow}>
      {Array.from({ length: ESCALA_MAX }, (_, i) => i + 1).map((n) => (
        <TouchableOpacity
          key={n}
          onPress={() => onChange(n)}
          hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
          activeOpacity={0.7}
        >
          <Ionicons
            name={n <= value ? "star" : "star-outline"}
            size={22}
            color={n <= value ? C.star : C.starOff}
          />
        </TouchableOpacity>
      ))}
      <Text style={styles.starValue}>{value > 0 ? `${value}/${ESCALA_MAX}` : ""}</Text>
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
    () => criteriosPara(pendiente.evaluadorRol, pendiente.evaluadoRol),
    [pendiente.evaluadorRol, pendiente.evaluadoRol],
  );

  const [valores, setValores] = useState<Record<string, number>>({});
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<EnviarFeedbackResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Contexto: incidencias de la práctica de este estudiante, visibles solo a
  // quien lo evalúa (empresa o universidad). No expone nada nuevo — son las
  // mismas que ese rol ya ve en su bandeja de incidencias.
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  useEffect(() => {
    if (
      pendiente.evaluadoRol !== "estudiante" ||
      (pendiente.evaluadorRol !== "empresa" &&
        pendiente.evaluadorRol !== "universidad")
    ) {
      setIncidencias([]);
      return;
    }
    let vivo = true;
    getIncidenciasDeEstudiante(
      pendiente.evaluadorRol,
      pendiente.evaluadorId,
      pendiente.evaluadoId,
    )
      .then((l) => vivo && setIncidencias(l))
      .catch(() => vivo && setIncidencias([]));
    return () => {
      vivo = false;
    };
  }, [
    pendiente.evaluadoRol,
    pendiente.evaluadorRol,
    pendiente.evaluadorId,
    pendiente.evaluadoId,
  ]);

  const completo = criterios.every((c) => (valores[c.key] ?? 0) > 0);

  const setEstrella = (key: string, v: number) =>
    setValores((prev) => ({ ...prev, [key]: v }));

  const handleEnviar = async () => {
    if (!completo || enviando) return;
    setEnviando(true);
    setErrorMsg(null);
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
        escalaMax: ESCALA_MAX,
      });
      setResultado(res);
    } catch (error: any) {
      // Si ya existía (doble envío), lo tratamos como completado.
      if (String(error?.message ?? "").includes("Ya enviaste")) {
        onSubmitted();
        return;
      }
      console.warn("Error enviando feedback:", error);
      setErrorMsg(
        String(error?.message ?? "").includes("insufficient permissions")
          ? "No se pudo guardar la evaluación (permisos). Inténtalo de nuevo en un momento."
          : error?.message || "No se pudo enviar la evaluación. Inténtalo de nuevo.",
      );
      setEnviando(false);
    }
  };

  const titulo =
    pendiente.evaluadoRol === "empresa"
      ? `¿Cómo fue tu experiencia con ${pendiente.evaluadoNombre}?`
      : pendiente.evaluadoRol === "universidad"
      ? `¿Cómo fue el acompañamiento de ${pendiente.evaluadoNombre}?`
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
            // ── Pantalla de resultado ──
            // El XP/rango SÍ se calcula y guarda en la BD (feedbackService), pero
            // por ahora NO se muestra al usuario: el reveal queda comentado a
            // pedido del equipo. Se conserva para reactivarlo sin reescribirlo.
            <View style={styles.resultWrap}>
              <View style={[styles.rangoCircle, { borderColor: C.green }]}>
                <Ionicons name="checkmark-circle" size={40} color={C.green} />
              </View>
              {/*
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
              */}
              <Text style={styles.resultThanks}>
                ¡Gracias por compartir tu evaluación!
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

              {incidencias.length > 0 ? (
                <View style={styles.incWrap}>
                  <View style={styles.incHeader}>
                    <Ionicons name="alert-circle" size={15} color={C.star} />
                    <Text style={styles.incTitle}>Incidencias de esta práctica</Text>
                    <Text style={styles.incTitle} noTranslate>({incidencias.length})</Text>
                  </View>
                  {incidencias.map((i) => (
                    <View key={i.id} style={styles.incRow}>
                      <Text style={styles.incMotivo}>{i.motivo}</Text>
                      <Text style={styles.incMeta}>{ESTADO_INC[i.estado] ?? i.estado}</Text>
                      {i.descripcion ? (
                        <Text style={styles.incDesc} numberOfLines={3}>
                          {i.descripcion}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}

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
              {errorMsg ? (
                <Text style={styles.errorMsg}>{errorMsg}</Text>
              ) : !completo ? (
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
    alignItems: "center",
    padding: 18,
  },
  // Centrado y con ancho máximo: en móvil llena el ancho disponible, en
  // tablet/escritorio se topa a una tarjeta legible en vez de estirarse.
  sheet: {
    backgroundColor: C.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    padding: 22,
    maxHeight: "88%",
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
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
  // ── Panel de incidencias (contexto al evaluar a un estudiante) ──
  incWrap: {
    backgroundColor: "rgba(245,181,10,0.07)",
    borderWidth: 1,
    borderColor: "rgba(245,181,10,0.30)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 18,
    gap: 10,
  },
  incHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  incTitle: {
    color: C.star,
    fontSize: 12,
    fontWeight: "800",
  },
  incRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(245,181,10,0.25)",
    paddingTop: 8,
    gap: 2,
  },
  incMotivo: {
    color: C.text,
    fontSize: 13,
    fontWeight: "700",
  },
  incMeta: {
    color: C.textSub,
    fontSize: 11,
    fontWeight: "600",
  },
  incDesc: {
    color: C.textSub,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  criterioLabel: {
    color: C.text,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  starRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 4,
  },
  starValue: {
    color: C.star,
    fontSize: 13,
    fontWeight: "700",
    marginLeft: 6,
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
  errorMsg: {
    color: "#f87171",
    fontSize: 12.5,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 17,
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
