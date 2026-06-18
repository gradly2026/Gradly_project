import { Ionicons } from "@expo/vector-icons";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { db } from "../config/firebaseConfig";
import { shadow } from "../utils/shadow";

// ══════════════════════════════════════════════════════════════════
//  Tokens de diseño oscuro (glassmorphism violeta)
// ══════════════════════════════════════════════════════════════════
const C = {
  bg: "rgba(13,11,30,0.92)",
  accent: "#8b5cf6",
  accent70: "rgba(167,139,250,1)",
  accent20: "rgba(139,92,246,0.16)",
  border: "rgba(139,92,246,0.45)",
  text: "#ffffff",
  textSub: "rgba(255,255,255,0.72)",
  textMuted: "rgba(255,255,255,0.45)",
};

// ══════════════════════════════════════════════════════════════════
//  Hook de onboarding — controla persistencia en Firestore
//  usuarios/{uid}: { esPrimerIngreso: boolean, tourVisto: {sec:bool} }
// ══════════════════════════════════════════════════════════════════
export function useOnboarding(
  uid: string | undefined,
  seccionActual: string,
  claves: string[],
) {
  const [activo, setActivo] = useState(false);
  const [tourVisto, setTourVisto] = useState<Record<string, boolean>>({});

  // Carga inicial del estado del tour (una sola vez por uid).
  useEffect(() => {
    if (!uid) return;
    let mounted = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "usuarios", uid));
        if (!mounted) return;
        const data = snap.exists() ? (snap.data() as any) : null;
        if (data?.esPrimerIngreso === true) {
          setActivo(true);
          setTourVisto(data?.tourVisto ?? {});
        }
      } catch {
        // Silencioso: si falla la lectura, simplemente no se muestra el tour.
      }
    })();
    return () => {
      mounted = false;
    };
  }, [uid]);

  const visible = activo && tourVisto[seccionActual] !== true;
  const total = claves.length;
  const paso = Math.min(claves.filter((k) => tourVisto[k]).length + 1, total);
  const esUltimo = paso >= total;

  // Marca la sección actual como vista; al completar todo → esPrimerIngreso:false.
  const marcar = useCallback(async () => {
    if (!activo) return;
    const nuevo = { ...tourVisto, [seccionActual]: true };
    setTourVisto(nuevo);
    const completo = claves.every((k) => nuevo[k]);
    if (completo) setActivo(false);
    if (uid) {
      try {
        await updateDoc(doc(db, "usuarios", uid), {
          tourVisto: nuevo,
          ...(completo ? { esPrimerIngreso: false } : {}),
        });
      } catch {
        /* no-op */
      }
    }
  }, [activo, tourVisto, seccionActual, claves, uid]);

  // Salta toda la guía y la desactiva permanentemente.
  const saltar = useCallback(async () => {
    setActivo(false);
    if (uid) {
      try {
        await updateDoc(doc(db, "usuarios", uid), { esPrimerIngreso: false });
      } catch {
        /* no-op */
      }
    }
  }, [uid]);

  return { visible, paso, total, esUltimo, marcar, saltar };
}

// ══════════════════════════════════════════════════════════════════
//  Globo flotante (glassmorphism). pointerEvents box-none deja tocar
//  las pestañas debajo para continuar el recorrido.
// ══════════════════════════════════════════════════════════════════
export function OnboardingBubble({
  visible,
  titulo,
  texto,
  paso,
  total,
  esUltimo,
  onContinuar,
  onSaltar,
}: {
  visible: boolean;
  titulo: string;
  texto: string;
  paso: number;
  total: number;
  esUltimo: boolean;
  onContinuar: () => void;
  onSaltar: () => void;
}) {
  if (!visible) return null;
  return (
    <View style={[styles.layer, { pointerEvents: 'box-none' }]}>
      <View style={styles.bubble}>
        <View style={styles.headerRow}>
          <View style={styles.iconWrap}>
            <Ionicons name="sparkles" size={14} color={C.accent70} />
          </View>
          <Text style={styles.paso}>
            Paso {paso} de {total}
          </Text>
          <TouchableOpacity onPress={onSaltar} hitSlop={8}>
            <Text style={styles.saltar}>Saltar guía</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.titulo}>{titulo}</Text>
        <Text style={styles.texto}>{texto}</Text>

        {/* Progreso */}
        <View style={styles.dotsRow}>
          {Array.from({ length: total }).map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i < paso && styles.dotActive]}
            />
          ))}
        </View>

        <TouchableOpacity style={styles.btn} onPress={onContinuar} activeOpacity={0.85}>
          <Text style={styles.btnText}>{esUltimo ? "Entendido" : "Siguiente"}</Text>
          <Ionicons
            name={esUltimo ? "checkmark" : "arrow-forward"}
            size={16}
            color="#fff"
          />
        </TouchableOpacity>

        {!esUltimo && (
          <Text style={styles.hint}>
            Toca otra pestaña del menú para seguir conociendo tu panel.
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 28,
    zIndex: 9999,
  },
  bubble: {
    width: "100%",
    maxWidth: 460,
    backgroundColor: C.bg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    padding: 18,
    ...shadow({ color: C.accent, y: 8, blur: 20, opacity: 0.5, elevation: 16 }),
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.accent20,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  paso: { flex: 1, color: C.accent70, fontSize: 12, fontWeight: "700" },
  saltar: { color: C.textMuted, fontSize: 12, fontWeight: "600" },
  titulo: { color: C.text, fontSize: 17, fontWeight: "800", marginBottom: 6 },
  texto: { color: C.textSub, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  dotsRow: { flexDirection: "row", gap: 6, marginBottom: 14 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  dotActive: { backgroundColor: C.accent },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 46,
    borderRadius: 12,
    backgroundColor: C.accent,
  },
  btnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  hint: {
    color: C.textMuted,
    fontSize: 11,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 15,
  },
});
