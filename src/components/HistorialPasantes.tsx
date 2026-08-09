import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,

  TouchableOpacity,
  View,
} from "react-native";
import { AutoText as Text } from "./AutoText";
import PerfilPublicoModal from "../../components/PerfilPublicoModal";
import { db } from "../config/firebaseConfig";
import { useTheme } from "../context/ThemeContext";
import { useTranslation } from "../context/TranslationContext";
import { abrirChatDirectoRecontratacion } from "../services/chatService";
import {
  calcularNivelEstudiante,
  type NivelEstudiante,
} from "../services/pasantiaService";

function useHistorialStyles() {
  const { colors, isDark } = useTheme();
  return useMemo(() => {
    const C = {
      card: isDark ? "rgba(255,255,255,0.04)" : colors.backgroundCard,
      border: isDark ? "rgba(139,92,246,0.22)" : colors.border,
      text: colors.textPrimary,
      textSub: isDark ? "rgba(255,255,255,0.65)" : colors.white60,
      muted: colors.textMuted,
      accent: colors.primary,
      accentSoft: isDark ? "rgba(139,92,246,0.15)" : colors.primary12,
      amber: colors.warning,
      badgeBg: isDark ? "rgba(255,255,255,0.03)" : colors.white4,
      pillBg: isDark ? "rgba(255,255,255,0.04)" : colors.white4,
    };
    return { C, styles: makeStyles(C) };
  }, [colors, isDark]);
}

/** Normaliza un nombre para emparejar alumno↔perfil (sin acentos ni caso). */
const normaliza = (s: string) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

/** Un pasante finalizado (un alumno dentro de una solicitud finalizada). */
interface PasanteItem {
  key: string;
  solicitudId: string;
  nombre: string;
  carrera: string;
  fechaInicio: string;
  fechaFin: string;
  /** uid real de Auth resuelto desde `perfiles_estudiantes` (o null). */
  estudianteUid: string | null;
  foto: string | null;
  nivel: NivelEstudiante;
  puntuacion: number;
  horasAprobadas: number;
}

interface Props {
  empresaId: string;
  empresaNombre: string;
}

/**
 * Historial de Pasantes (Empresa): estudiantes que terminaron pasantías
 * (`solicitudes_practicas` con `estado: 'finalizado'`). Permite re-contactar
 * abriendo un chat directo y ver el perfil público destacando rango y puntuación.
 */
export default function HistorialPasantes({ empresaId, empresaNombre }: Props) {
  const router = useRouter();
  const { t } = useTranslation();
  const { C, styles } = useHistorialStyles();

  const [solicitudes, setSolicitudes] = useState<any[]>([]);
  const [items, setItems] = useState<PasanteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolviendo, setResolviendo] = useState<string | null>(null);
  const [perfilUid, setPerfilUid] = useState<string | null>(null);

  // ── Consulta en tiempo real a las pasantías finalizadas de esta empresa ──
  // Filtramos `empresaId` en el servidor y `estado === 'finalizado'` en cliente:
  // mismo resultado que un `where` doble, pero sin requerir el índice compuesto
  // (empresaId + estado) que Firestore exigiría — y que aquí se administra en
  // consola. Es el mismo patrón que el resto de paneles del proyecto.
  useEffect(() => {
    if (!empresaId) return;
    setLoading(true);
    const q = query(
      collection(db, "solicitudes_practicas"),
      where("empresaId", "==", empresaId),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const finalizadas = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((s) => s.estado === "finalizado");
        setSolicitudes(finalizadas);
        setLoading(false);
      },
      (error) => {
        console.warn("Error en listener (historial pasantes):", error);
        setLoading(false);
      },
    );
    return unsub;
  }, [empresaId]);

  // ── Resuelve uid real + rango de cada alumno vía perfiles_estudiantes ──
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const grupoIds = [
        ...new Set(solicitudes.map((s) => s.grupoId).filter(Boolean)),
      ];

      // Mapa grupoId → estudiantes del grupo (uid real + datos de rango).
      const porGrupo: Record<string, any[]> = {};
      await Promise.all(
        grupoIds.map(async (gid) => {
          try {
            const es = await getDocs(
              query(
                collection(db, "perfiles_estudiantes"),
                where("grupo_id", "==", gid),
              ),
            );
            porGrupo[gid] = es.docs.map((d) => ({ uid: d.id, ...(d.data() as any) }));
          } catch {
            porGrupo[gid] = [];
          }
        }),
      );

      if (cancelado) return;

      const lista: PasanteItem[] = [];
      solicitudes.forEach((s) => {
        const alumnos: any[] = Array.isArray(s.alumnos) ? s.alumnos : [];
        const candidatos = porGrupo[s.grupoId] ?? [];
        alumnos.forEach((al) => {
          const match = candidatos.find(
            (c) => normaliza(c.nombre_completo) === normaliza(al.nombre),
          );
          const horasAprob = Number(match?.horas_aprobadas ?? 0);
          const horasObj = Number(match?.horas_objetivo ?? 0);
          lista.push({
            key: `${s.id}-${al.id ?? al.nombre}`,
            solicitudId: s.id,
            nombre: al.nombre ?? "Estudiante",
            carrera: s.carrera || match?.carrera || "Sin carrera",
            fechaInicio: s.fechaInicio ?? "",
            fechaFin: s.fechaFin ?? "",
            estudianteUid: match?.uid ?? null,
            foto: match?.foto_url ?? null,
            nivel: calcularNivelEstudiante(horasAprob, horasObj),
            puntuacion: Number(match?.calificacion_promedio ?? 0),
            horasAprobadas: horasAprob,
          });
        });
      });

      lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setItems(lista);
    })();

    return () => {
      cancelado = true;
    };
  }, [solicitudes]);

  const perfilViewer = useMemo(() => empresaId, [empresaId]);

  // ── Re-contacto: abre/reactiva el chat directo y navega ──
  const reContactar = async (item: PasanteItem) => {
    if (!item.estudianteUid) {
      Alert.alert(
        "No disponible",
        "No se pudo localizar la cuenta del estudiante para iniciar el chat.",
      );
      return;
    }
    if (resolviendo) return;
    setResolviendo(item.key);
    try {
      const chatId = await abrirChatDirectoRecontratacion({
        empresaId,
        empresaNombre,
        estudianteId: item.estudianteUid,
        estudianteNombre: item.nombre,
      });
      router.push({
        pathname: "/ChatScreen",
        params: { chatId, peerName: item.nombre },
      } as any);
    } catch (error) {
      console.warn("Error abriendo chat de recontratación:", error);
      Alert.alert("Error", "No se pudo abrir el chat. Intenta de nuevo.");
    } finally {
      setResolviendo(null);
    }
  };

  const abrirPerfil = (item: PasanteItem) => {
    if (!item.estudianteUid) {
      Alert.alert(
        "Perfil no disponible",
        "No se encontró el perfil de este estudiante.",
      );
      return;
    }
    setPerfilUid(item.estudianteUid);
  };

  const renderItem = ({ item }: { item: PasanteItem }) => {
    const inicial = item.nombre?.[0]?.toUpperCase() ?? "?";
    const cargando = resolviendo === item.key;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => abrirPerfil(item)}
      >
        <View style={styles.cardTop}>
          {item.foto ? (
            <Image source={{ uri: item.foto }} style={styles.avatar} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{inicial}</Text>
            </View>
          )}

          <View style={{ flex: 1 }}>
            <Text style={styles.nombre} numberOfLines={1}>
              {item.nombre}
            </Text>
            <Text style={styles.carrera} numberOfLines={1}>
              {item.carrera}
            </Text>
            <View style={styles.fechasRow}>
              <Ionicons name="calendar-outline" size={12} color={C.muted} />
              <Text style={styles.fechas} numberOfLines={1}>
                {item.fechaInicio || "—"} → {item.fechaFin || "—"}
              </Text>
            </View>
          </View>

          {/* Rango / nivel actual destacado */}
          <View style={[styles.nivelBadge, { borderColor: item.nivel.color }]}>
            <Ionicons
              name={item.nivel.icono as any}
              size={14}
              color={item.nivel.color}
            />
            <Text style={[styles.nivelText, { color: item.nivel.color }]}>
              {item.nivel.titulo}
            </Text>
          </View>
        </View>

        {/* Puntuación acumulada + horas */}
        <View style={styles.statsRow}>
          <View style={styles.statPill}>
            <Ionicons name="star" size={13} color={C.amber} />
            <Text style={styles.statText}>
              {item.puntuacion.toFixed(1)} pts
            </Text>
          </View>
          <View style={styles.statPill}>
            <Ionicons name="time-outline" size={13} color={C.accent} />
            <Text style={styles.statText}>{item.horasAprobadas}h aprobadas</Text>
          </View>
          {!item.estudianteUid ? (
            <View style={styles.statPill}>
              <Ionicons name="alert-circle-outline" size={13} color={C.muted} />
              <Text style={[styles.statText, { color: C.muted }]}>
                {t('history_company_account_not_found')}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Botón de re-contacto destacado */}
        <TouchableOpacity
          style={[styles.recontactarBtn, cargando && { opacity: 0.7 }]}
          activeOpacity={0.9}
          onPress={() => reContactar(item)}
          disabled={cargando}
        >
          {cargando ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="briefcase" size={16} color="#fff" />
              <Text style={styles.recontactarText}>
                {t('history_company_recontact')}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        contentContainerStyle={{
          paddingHorizontal: 12,
          paddingBottom: 120,
          gap: 12,
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={42} color={C.muted} />
            <Text style={styles.emptyText}>
              {loading
                ? t('history_company_loading')
                : t('history_company_empty')}
            </Text>
          </View>
        }
      />

      <PerfilPublicoModal
        visible={!!perfilUid}
        onClose={() => setPerfilUid(null)}
        userId={perfilUid ?? ""}
        rol="talento"
        viewerUserId={perfilViewer}
        theme="dark"
      />
    </View>
  );
}

const makeStyles = (C: {
  card: string;
  border: string;
  text: string;
  textSub: string;
  muted: string;
  accent: string;
  accentSoft: string;
  amber: string;
  badgeBg: string;
  pillBg: string;
}) => StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    gap: 12,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.accentSoft,
    borderWidth: 1,
    borderColor: C.border,
  },
  avatarText: {
    color: "#c4b5fd",
    fontSize: 20,
    fontWeight: "800",
  },
  nombre: {
    color: C.text,
    fontSize: 16,
    fontWeight: "800",
  },
  carrera: {
    color: C.textSub,
    fontSize: 13,
    marginTop: 2,
  },
  fechasRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
  },
  fechas: {
    color: C.muted,
    fontSize: 11,
  },
  nivelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: C.badgeBg,
  },
  nivelText: {
    fontSize: 12,
    fontWeight: "800",
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: C.pillBg,
    borderWidth: 1,
    borderColor: C.border,
  },
  statText: {
    color: C.textSub,
    fontSize: 12,
    fontWeight: "600",
  },
  recontactarBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingVertical: 13,
  },
  recontactarText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    gap: 14,
  },
  emptyText: {
    color: C.muted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});
