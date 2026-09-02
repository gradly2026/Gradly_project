/**
 * ResenasFeedback.tsx — reseñas (estrellas + comentario) de un perfil, a partir
 * de `feedback_pasantias` (el sistema OFICIAL: obligatorio vía FeedbackGate /
 * flujo de culminación, atado a una pasantía real terminada, el mismo que ya
 * alimenta `calificacion_promedio`/rango/XP en toda la app — ver
 * `feedbackService.ts`). NO usa la subcolección
 * `perfiles_estudiantes/{id}/calificaciones` de `ProfileViewerModal.tsx`
 * (sistema paralelo más viejo).
 *
 * Exports:
 *  - `ResenasFeedback` (default): PROMEDIO grande arriba + línea divisoria +
 *    lista de reseñas (estrellas + comentario). Para la sección "Reseñas"
 *    completa de cada dashboard.
 *  - `ResenasResumen`: solo el cuadro del promedio + "Ver más" → abre un modal
 *    encima con la lista completa. Para los modales/microsecciones que muestran
 *    un vistazo del perfil.
 *  - `PromedioSimple`: cuadro con estrellas + número, sin lista (legado; hoy
 *    todos los roles tienen reseñas reales — se conserva por compatibilidad).
 */
import { Ionicons } from "@expo/vector-icons";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { AutoText as Text } from "./AutoText";
import { db } from "../config/firebaseConfig";
import { useTranslation } from "../context/TranslationContext";

type EntidadRol = "estudiante" | "empresa" | "universidad";

interface FeedbackDoc {
  id: string;
  evaluadorId: string;
  evaluadorRol: EntidadRol;
  promedio: number;
  comentario?: string;
  createdAt?: any;
}

/** Máximo de reseñas a listar — una bandeja de perfil no es un historial completo. */
const LIMITE_DEFAULT = 20;

function tokensPorTema(theme: "dark" | "light") {
  const dark = theme !== "light";
  return {
    text: dark ? "#f4f1ff" : "#111827",
    sub: dark ? "rgba(255,255,255,0.55)" : "#6b7280",
    card: dark ? "rgba(255,255,255,0.04)" : "#f8f9fa",
    border: dark ? "rgba(139,92,246,0.18)" : "rgba(139,92,246,0.14)",
    line: dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)",
    surface: dark ? "#0d0b1e" : "#ffffff",
    star: "#f5b50a",
  };
}

/** Fila de 5 estrellas (soporta media estrella). */
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

/** Fecha y hora exactas (no relativas). Respeta el idioma activo. */
function fechaHora(ts: any, locale: string): string {
  if (!ts) return "";
  const d: Date = ts?.toDate ? ts.toDate() : new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const fecha = d.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
  const hora = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return `${fecha}, ${hora}`;
}

/** Colección Firestore donde vive el perfil del evaluador, según su rol. */
const COL_POR_ROL: Record<EntidadRol, string> = {
  empresa: "perfiles_empresas",
  estudiante: "perfiles_estudiantes",
  universidad: "perfiles_universidades",
};

/** Campo con el nombre visible del evaluador, según su rol. */
const CAMPO_NOMBRE_POR_ROL: Record<EntidadRol, string> = {
  empresa: "nombre_empresa",
  estudiante: "nombre_completo",
  universidad: "nombre_universidad",
};

/**
 * Suscripción a todas las reseñas de un perfil (`feedback_pasantias` where
 * `evaluadoId == entidadId`, SIN `orderBy` — se ordena en cliente para no
 * exigir índice compuesto). Devuelve el promedio y el total sobre TODAS las
 * reseñas, y la lista ya recortada a `limite`.
 */
function useResenas(entidadId: string, limite: number) {
  const [todas, setTodas] = useState<FeedbackDoc[] | null>(null);

  useEffect(() => {
    if (!entidadId) {
      setTodas([]);
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, "feedback_pasantias"), where("evaluadoId", "==", entidadId)),
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as FeedbackDoc));
        docs.sort(
          (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
        );
        setTodas(docs);
      },
      () => setTodas([]),
    );
    return unsub;
  }, [entidadId]);

  const total = todas?.length ?? 0;
  const promedio =
    todas && total > 0
      ? todas.reduce((acc, r) => acc + (Number(r.promedio) || 0), 0) / total
      : 0;
  const lista = useMemo(() => (todas ? todas.slice(0, limite) : []), [todas, limite]);

  return { cargando: todas === null, lista, total, promedio };
}

/** Cabecera con el promedio grande (número + estrellas + total). */
function PromedioHeader({
  promedio,
  total,
  T,
}: {
  promedio: number;
  total: number;
  T: ReturnType<typeof tokensPorTema>;
}) {
  return (
    <View style={styles.header}>
      <Text style={[styles.promGrande, { color: T.text }]}>
        {total > 0 ? promedio.toFixed(1) : "—"}
      </Text>
      <View style={{ gap: 4 }}>
        <Estrellas valor={promedio} color={T.star} size={17} />
        <Text style={[styles.headerSub, { color: T.sub }]}>
          {total > 0
            ? `${total} reseña${total === 1 ? "" : "s"}`
            : "Aún no hay reseñas."}
        </Text>
      </View>
    </View>
  );
}

/** Un cuadro de reseña: estrellas + fecha + autor + comentario. */
function TarjetaResena({
  r,
  nombreEvaluador,
  T,
  locale,
}: {
  r: FeedbackDoc;
  nombreEvaluador?: string;
  T: ReturnType<typeof tokensPorTema>;
  locale: string;
}) {
  const origen =
    nombreEvaluador ||
    (r.evaluadorRol === "empresa"
      ? "De una empresa"
      : r.evaluadorRol === "universidad"
      ? "De una universidad"
      : "De un estudiante");
  return (
    <View style={[styles.card, { backgroundColor: T.card, borderColor: T.border }]}>
      <View style={styles.cardTop}>
        <Estrellas valor={r.promedio} color={T.star} />
        <Text style={[styles.promedioTxt, { color: T.sub }]}>{Number(r.promedio).toFixed(1)}</Text>
        <View style={{ flex: 1 }} />
        <Text style={[styles.fecha, { color: T.sub }]}>{fechaHora(r.createdAt, locale)}</Text>
      </View>
      <Text style={[styles.origen, { color: T.sub }]} noTranslate={!!nombreEvaluador}>
        {origen}
      </Text>
      {!!r.comentario && (
        <Text style={[styles.comentario, { color: T.text }]}>{r.comentario}</Text>
      )}
    </View>
  );
}

/**
 * Vista completa: promedio grande + línea divisoria + lista de reseñas.
 */
export default function ResenasFeedback({
  entidadId,
  theme = "dark",
  limite = LIMITE_DEFAULT,
  sinCabecera = false,
}: {
  entidadId: string;
  entidadRol?: EntidadRol;
  theme?: "dark" | "light";
  limite?: number;
  /** true = no dibuja el promedio de arriba (lo pone el contenedor). */
  sinCabecera?: boolean;
}) {
  const T = useMemo(() => tokensPorTema(theme), [theme]);
  const { locale } = useTranslation();
  const { cargando, lista, total, promedio } = useResenas(entidadId, limite);
  const [nombres, setNombres] = useState<Record<string, string>>({});

  // Resuelve el nombre real de cada evaluador aún no cacheado.
  useEffect(() => {
    if (lista.length === 0) return;
    const faltantes = [...new Set(lista.map((r) => r.evaluadorId))].filter(
      (id) => id && !(id in nombres),
    );
    if (faltantes.length === 0) return;
    let cancelado = false;
    (async () => {
      const resueltos = await Promise.all(
        faltantes.map(async (id) => {
          const r = lista.find((x) => x.evaluadorId === id);
          const col = COL_POR_ROL[r!.evaluadorRol] ?? "perfiles_estudiantes";
          const campo = CAMPO_NOMBRE_POR_ROL[r!.evaluadorRol] ?? "nombre_completo";
          try {
            const snap = await getDoc(doc(db, col, id));
            return [id, snap.exists() ? ((snap.data() as any)?.[campo] ?? "") : ""] as const;
          } catch {
            return [id, ""] as const;
          }
        }),
      );
      if (cancelado) return;
      setNombres((prev) => {
        const next = { ...prev };
        for (const [id, nombre] of resueltos) next[id] = nombre;
        return next;
      });
    })();
    return () => {
      cancelado = true;
    };
  }, [lista, nombres]);

  if (cargando) return null;

  return (
    <View style={{ gap: 12 }}>
      {!sinCabecera && (
        <>
          <PromedioHeader promedio={promedio} total={total} T={T} />
          <View style={[styles.linea, { backgroundColor: T.line }]} />
        </>
      )}
      {lista.length === 0 ? (
        sinCabecera ? (
          <Text style={{ color: T.sub, fontSize: 13 }}>Aún no hay reseñas.</Text>
        ) : null
      ) : (
        <View style={{ gap: 10 }}>
          {lista.map((r) => (
            <TarjetaResena
              key={r.id}
              r={r}
              nombreEvaluador={nombres[r.evaluadorId]}
              T={T}
              locale={locale}
            />
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * Cuadro compacto para modales/vistazos de perfil: promedio + "Ver más" → abre
 * un modal encima con la lista completa (`ResenasFeedback`).
 */
export function ResenasResumen({
  entidadId,
  theme = "dark",
}: {
  entidadId: string;
  entidadRol?: EntidadRol;
  theme?: "dark" | "light";
}) {
  const T = useMemo(() => tokensPorTema(theme), [theme]);
  const { total, promedio } = useResenas(entidadId, 1);
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <View style={[styles.resumenBox, { backgroundColor: T.card, borderColor: T.border }]}>
        <Text style={[styles.resumenLabel, { color: T.sub }]}>Reseñas</Text>
        <View style={styles.resumenFila}>
          <Text style={[styles.promGrande, { color: T.text }]}>
            {total > 0 ? promedio.toFixed(1) : "—"}
          </Text>
          <View style={{ gap: 4 }}>
            <Estrellas valor={promedio} color={T.star} size={15} />
            <Text style={[styles.headerSub, { color: T.sub }]}>
              {total > 0
                ? `${total} reseña${total === 1 ? "" : "s"}`
                : "Aún no hay reseñas."}
            </Text>
          </View>
        </View>
        {total > 0 && (
          <TouchableOpacity onPress={() => setAbierto(true)} activeOpacity={0.7} style={styles.verMasBtn}>
            <Text style={[styles.verMasTxt, { color: T.star }]}>Ver más</Text>
            <Ionicons name="chevron-forward" size={14} color={T.star} />
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={abierto} transparent animationType="fade" onRequestClose={() => setAbierto(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: T.surface, borderColor: T.border }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: T.text }]}>Reseñas</Text>
              <TouchableOpacity onPress={() => setAbierto(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={T.sub} />
              </TouchableOpacity>
            </View>
            <PromedioHeader promedio={promedio} total={total} T={T} />
            <View style={[styles.linea, { backgroundColor: T.line, marginVertical: 12 }]} />
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              <ResenasFeedback entidadId={entidadId} theme={theme} limite={50} sinCabecera />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

/** Legado: solo estrellas + número, sin lista. */
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
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  promGrande: { fontSize: 30, fontWeight: "900", lineHeight: 34 },
  headerSub: { fontSize: 11.5, fontWeight: "600" },
  linea: { height: StyleSheet.hairlineWidth },
  card: { borderRadius: 14, borderWidth: 1, padding: 12, gap: 4 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  promedioTxt: { fontSize: 12, fontWeight: "700" },
  fecha: { fontSize: 11, fontWeight: "600" },
  origen: { fontSize: 11, fontWeight: "600" },
  comentario: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  // ── Resumen ──
  resumenBox: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  resumenLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase" },
  resumenFila: { flexDirection: "row", alignItems: "center", gap: 12 },
  verMasBtn: { flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-start" },
  verMasTxt: { fontSize: 12.5, fontWeight: "800" },
  // ── Modal ──
  overlay: {
    flex: 1,
    backgroundColor: "rgba(7,5,15,0.78)",
    justifyContent: "center",
    padding: 18,
  },
  sheet: { borderRadius: 22, borderWidth: 1, padding: 20 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  sheetTitle: { fontSize: 17, fontWeight: "800" },
});
