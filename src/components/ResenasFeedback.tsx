/**
 * ResenasFeedback.tsx — bandeja de reseñas (estrellas + comentario) de un
 * perfil, a partir de `feedback_pasantias` (el sistema OFICIAL: obligatorio
 * vía FeedbackGate, atado a una pasantía real terminada, el mismo que ya
 * alimenta `calificacion_promedio`/rango/XP en toda la app — ver
 * `feedbackService.ts`). Deliberadamente NO usa la subcolección
 * `perfiles_estudiantes/{id}/calificaciones` de `ProfileViewerModal.tsx`
 * (sistema paralelo más viejo, sin pasantía real de por medio) — son dos
 * fuentes que hoy se pisan sobre el mismo campo, y se decidió con el usuario
 * dejar ese conflicto para después en vez de mezclarlas aquí.
 *
 * Dos exports:
 *  - `ResenasFeedback` (default): lista real de reseñas — estudiante/empresa,
 *    los dos roles que SÍ reciben feedback en `feedback_pasantias`.
 *  - `PromedioSimple`: solo estrellas + número, sin lista — para universidad,
 *    que no tiene reseñas reales, solo un promedio derivado del desempeño de
 *    sus propios estudiantes (`calificacion_estudiantes_promedio`).
 */
import { Ionicons } from "@expo/vector-icons";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AutoText as Text } from "./AutoText";
import { db } from "../config/firebaseConfig";

type EntidadRol = "estudiante" | "empresa";

interface FeedbackDoc {
  id: string;
  evaluadorRol: EntidadRol;
  promedio: number;
  comentario?: string;
  createdAt?: any;
}

/** Máximo de reseñas a mostrar — una bandeja de perfil no es un historial completo. */
const LIMITE_DEFAULT = 15;

function tokensPorTema(theme: "dark" | "light") {
  const dark = theme !== "light";
  return {
    text: dark ? "#f4f1ff" : "#111827",
    sub: dark ? "rgba(255,255,255,0.55)" : "#6b7280",
    card: dark ? "rgba(255,255,255,0.04)" : "#f8f9fa",
    border: dark ? "rgba(139,92,246,0.18)" : "rgba(139,92,246,0.14)",
    star: "#f5b50a",
  };
}

/** Fila de 5 estrellas (soporta media estrella) — mismo patrón ya repetido en
 * RangoCard/CertificadoGradly/ProfileViewerModal; una cuarta copia local aquí
 * es consistente con el precedente del proyecto. */
function Estrellas({ valor, color, size = 14 }: { valor: number; color: string; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const name =
          valor >= n ? "star" : valor >= n - 0.5 ? "star-half" : "star-outline";
        return <Ionicons key={n} name={name} size={size} color={color} />;
      })}
    </View>
  );
}

function relativo(ts: any): string {
  if (!ts) return "";
  const d: Date = ts?.toDate ? ts.toDate() : new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const dias = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Hace 1 día";
  if (dias < 30) return `Hace ${dias} días`;
  if (dias < 365) return `Hace ${Math.floor(dias / 30)} mes(es)`;
  return `Hace ${Math.floor(dias / 365)} año(s)`;
}

/**
 * Lista de reseñas recibidas por un estudiante o una empresa. Un solo
 * `where('evaluadoId','==',entidadId)`, SIN `orderBy` — se ordena en el
 * cliente para no exigir un índice compuesto (mismo patrón defensivo ya
 * usado en `progreso.tsx` para `solicitudes_practicas`).
 */
export default function ResenasFeedback({
  entidadId,
  theme = "dark",
  limite = LIMITE_DEFAULT,
}: {
  entidadId: string;
  /** Sin uso funcional hoy (la query es simétrica) — documenta la intención del llamador. */
  entidadRol?: EntidadRol;
  theme?: "dark" | "light";
  limite?: number;
}) {
  const T = useMemo(() => tokensPorTema(theme), [theme]);
  const [resenas, setResenas] = useState<FeedbackDoc[] | null>(null);

  useEffect(() => {
    if (!entidadId) return;
    const unsub = onSnapshot(
      query(collection(db, "feedback_pasantias"), where("evaluadoId", "==", entidadId)),
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as FeedbackDoc));
        docs.sort(
          (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
        );
        setResenas(docs.slice(0, limite));
      },
      () => setResenas([]),
    );
    return unsub;
  }, [entidadId, limite]);

  if (resenas === null) return null; // cargando: no ocupar espacio con un spinner discreto

  return (
    <View style={{ gap: 10 }}>
      <Text style={[styles.titulo, { color: T.text }]}>
        Reseñas {resenas.length > 0 ? `(${resenas.length})` : ""}
      </Text>
      {resenas.length === 0 ? (
        <Text style={{ color: T.sub, fontSize: 13 }}>Aún no hay reseñas.</Text>
      ) : (
        resenas.map((r) => (
          <View key={r.id} style={[styles.card, { backgroundColor: T.card, borderColor: T.border }]}>
            <View style={styles.cardTop}>
              <Estrellas valor={r.promedio} color={T.star} />
              <Text style={[styles.promedioTxt, { color: T.sub }]}>{r.promedio.toFixed(1)}</Text>
              <View style={{ flex: 1 }} />
              <Text style={[styles.fecha, { color: T.sub }]}>{relativo(r.createdAt)}</Text>
            </View>
            <Text style={[styles.origen, { color: T.sub }]}>
              {r.evaluadorRol === "empresa" ? "De una empresa" : "De un estudiante"}
            </Text>
            {!!r.comentario && (
              <Text style={[styles.comentario, { color: T.text }]}>{r.comentario}</Text>
            )}
          </View>
        ))
      )}
    </View>
  );
}

/** Solo estrellas + número, sin lista — para entidades sin reseñas reales
 * (universidad: `calificacion_estudiantes_promedio`, un promedio derivado). */
export function PromedioSimple({
  promedio,
  theme = "dark",
}: {
  promedio: number | null | undefined;
  theme?: "dark" | "light";
}) {
  const T = useMemo(() => tokensPorTema(theme), [theme]);
  const valor = Number(promedio) || 0;

  return (
    <View style={[styles.card, { backgroundColor: T.card, borderColor: T.border }]}>
      <View style={styles.cardTop}>
        <Estrellas valor={valor} color={T.star} size={16} />
        <Text style={[styles.promedioTxt, { color: T.sub }]}>
          {valor > 0 ? valor.toFixed(1) : "Sin datos aún"}
        </Text>
      </View>
      <Text style={[styles.origen, { color: T.sub, marginTop: 4 }]}>
        Promedio de calificación de tus estudiantes en sus pasantías.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  titulo: { fontSize: 14, fontWeight: "800" },
  card: { borderRadius: 14, borderWidth: 1, padding: 12, gap: 4 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  promedioTxt: { fontSize: 12, fontWeight: "700" },
  fecha: { fontSize: 11, fontWeight: "600" },
  origen: { fontSize: 11, fontWeight: "600" },
  comentario: { fontSize: 13, lineHeight: 18, marginTop: 2 },
});
