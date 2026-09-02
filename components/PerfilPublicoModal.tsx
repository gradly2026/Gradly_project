import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
// Drop-in de traducción automática (mismo patrón que el resto del proyecto).
import { AutoText as Text } from "../src/components/AutoText";
import { collection, doc, documentId, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "../src/config/firebaseConfig";
import CertificadoGradly from "../src/components/CertificadoGradly";
import RangoCard from "../src/components/RangoCard";
import { ResenasResumen } from "../src/components/ResenasFeedback";
import SelloEmpresa from "../src/components/SelloEmpresa";
import { calcularRango } from "../src/services/feedbackService";
import ReportarModal from "./ReportarModal";

export type PerfilRol = "empresa" | "talento" | "alumno" | "universidad";

interface Props {
  visible: boolean;
  onClose: () => void;
  userId: string;
  rol: PerfilRol;
  viewerUserId: string;
  theme?: "dark" | "light";
}

const DARK = {
  overlay: "rgba(0,0,0,0.80)",
  bg: "#0d0b1e",
  card: "rgba(255,255,255,0.04)",
  border: "rgba(139,92,246,0.25)",
  text: "#f4f1ff",
  textSub: "rgba(255,255,255,0.65)",
  muted: "rgba(255,255,255,0.40)",
  purple: "#8b5cf6",
  purpleDim: "rgba(139,92,246,0.12)",
  green: "#22c55e",
  greenBg: "rgba(34,197,94,0.10)",
  closeBg: "rgba(255,255,255,0.07)",
  avatarBg: "rgba(139,92,246,0.15)",
  red: "#ef4444",
};

const LIGHT = {
  overlay: "rgba(0,0,0,0.55)",
  bg: "#ffffff",
  card: "#f8f9fa",
  border: "rgba(139,92,246,0.20)",
  text: "#111827",
  textSub: "#6b7280",
  muted: "#9ca3af",
  purple: "#7c3aed",
  purpleDim: "rgba(139,92,246,0.08)",
  green: "#059669",
  greenBg: "rgba(5,150,105,0.08)",
  closeBg: "rgba(0,0,0,0.06)",
  avatarBg: "rgba(139,92,246,0.10)",
  red: "#dc2626",
};

/** Resuelve una lista de ids a sus nombres, en lotes de 30 (límite de `in`
 * en Firestore) — mismo patrón ya usado en dashboard-empresa.tsx para
 * calificaciones por lote. */
async function resolverNombres(
  coleccion: string,
  ids: string[],
  campoNombre: string,
): Promise<string[]> {
  const unicos = [...new Set(ids)].filter(Boolean);
  if (unicos.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < unicos.length; i += 30) chunks.push(unicos.slice(i, i + 30));
  const snaps = await Promise.all(
    chunks.map((chunk) =>
      getDocs(query(collection(db, coleccion), where(documentId(), "in", chunk))),
    ),
  );
  const nombres: string[] = [];
  snaps.forEach((snap) =>
    snap.docs.forEach((d) => {
      const nombre = (d.data() as any)?.[campoNombre];
      if (nombre) nombres.push(nombre);
    }),
  );
  return nombres.sort((a, b) => a.localeCompare(b));
}

// Colecciones de perfil en Firestore por rol.
const COLLECTION_MAP: Record<PerfilRol, string> = {
  empresa: "perfiles_empresas",
  talento: "perfiles_estudiantes",
  alumno: "perfiles_estudiantes",
  universidad: "perfiles_universidades",
};

const ROL_LABEL: Record<PerfilRol, string> = {
  empresa: "Empresa",
  talento: "Joven Talento",
  alumno: "Estudiante",
  universidad: "Universidad",
};

/** `perfiles_estudiantes.estado_pasantia` — autoreportado en los servicios
 * que confirman/finalizan una pasantía (grupo o cupos). Ausente = "sin_iniciar"
 * de facto para cuentas creadas antes de este campo, sin backfill retroactivo. */
type EstadoPasantia = "sin_iniciar" | "en_proceso" | "finalizada";

const ESTADO_PASANTIA_LABEL: Record<EstadoPasantia, string> = {
  sin_iniciar: "Sin iniciar",
  en_proceso: "En proceso",
  finalizada: "Finalizada",
};

function estadoPasantiaTokens(valor: string, C: typeof DARK): { bg: string; fg: string } {
  if (valor === "en_proceso") return { bg: C.greenBg, fg: C.green };
  if (valor === "finalizada") return { bg: C.purpleDim, fg: C.purple };
  return { bg: "rgba(148,163,184,0.14)", fg: C.muted };
}

export default function PerfilPublicoModal({
  visible,
  onClose,
  userId,
  rol,
  viewerUserId,
  theme = "dark",
}: Props) {
  const C = theme === "light" ? LIGHT : DARK;

  const [perfil, setPerfil] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);
  const [showReportar, setShowReportar] = useState(false);
  const [universidadNombre, setUniversidadNombre] = useState<string | null>(null);
  const [aliados, setAliados] = useState<string[]>([]);

  useEffect(() => {
    if (visible && userId) loadPerfil();
  }, [visible, userId]);

  const loadPerfil = async () => {
    setLoading(true);
    setPerfil(null);
    setUniversidadNombre(null);
    setAliados([]);
    try {
      const snap = await getDoc(doc(db, COLLECTION_MAP[rol], userId));
      const data = snap.exists() ? (snap.data() as Record<string, any>) : null;
      setPerfil(data);
      // Universidad donde estudia — solo aplica a estudiantes, y solo si el
      // perfil trae universidad_id (lo escribe dashboard-universidad.tsx al crearlo).
      if ((rol === "alumno" || rol === "talento") && data?.universidad_id) {
        try {
          const uniSnap = await getDoc(doc(db, "perfiles_universidades", data.universidad_id));
          setUniversidadNombre(uniSnap.exists() ? ((uniSnap.data() as any)?.nombre_universidad ?? null) : null);
        } catch {
          setUniversidadNombre(null);
        }
      }
      // Aliados (convenio con pasantías reales) — `aliados_*_ids` ya vive en
      // el propio perfil (autoreportado al aprobar una pasantía, ver
      // [[project_ranking_alianzas]]), así que no hay que tocar reglas nuevas.
      try {
        if (rol === "empresa" && Array.isArray(data?.aliados_universidades_ids) && data.aliados_universidades_ids.length > 0) {
          setAliados(await resolverNombres("perfiles_universidades", data.aliados_universidades_ids, "nombre_universidad"));
        } else if (rol === "universidad" && Array.isArray(data?.aliados_empresas_ids) && data.aliados_empresas_ids.length > 0) {
          setAliados(await resolverNombres("perfiles_empresas", data.aliados_empresas_ids, "nombre_empresa"));
        }
      } catch {
        setAliados([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const getNombre = () => {
    if (!perfil) return "";
    return (
      perfil.nombre ??
      perfil.nombre_completo ??
      perfil.nombre_empresa ??
      ""
    );
  };

  const getFoto = () =>
    perfil?.foto_perfil ?? perfil?.foto_url ?? perfil?.foto_logo ?? perfil?.logo_url ?? null;

  const getSubtitulo = () => {
    if (!perfil) return "";
    if (rol === "empresa") return perfil.industria ?? perfil.sector ?? "";
    if (rol === "talento") return perfil.headline ?? perfil.area ?? "";
    if (rol === "alumno") return [perfil.carrera, perfil.semestre ? `${perfil.semestre}° sem.` : ""].filter(Boolean).join(" · ");
    if (rol === "universidad") {
      const distrito = perfil.distrito ?? perfil.ciudad;
      return distrito ? `${distrito}, El Salvador` : "Universidad";
    }
    return "";
  };

  const foto = getFoto();

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={[styles.overlay, { backgroundColor: C.overlay }]}>
          <View style={[styles.sheet, { backgroundColor: C.bg, borderTopColor: C.border }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: C.border }]}>
              <Text style={[styles.headerTitle, { color: C.text }]}>
                Perfil público
              </Text>
              <TouchableOpacity
                style={[styles.closeBtn, { backgroundColor: C.closeBg }]}
                onPress={onClose}
              >
                <Ionicons name="close" size={18} color={C.text} />
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={C.purple} size="large" />
              </View>
            ) : !perfil ? (
              <View style={styles.loadingWrap}>
                <Ionicons name="person-outline" size={40} color={C.muted} />
                <Text style={{ color: C.muted, marginTop: 8 }}>Perfil no disponible</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Avatar + nombre */}
                <View style={styles.profileTop}>
                  <View style={[styles.avatar, { backgroundColor: C.avatarBg, borderColor: C.border }]}>
                    {foto ? (
                      <Image source={{ uri: foto }} style={styles.avatarImg} />
                    ) : (
                      <Ionicons
                        name={rol === "empresa" || rol === "universidad" ? "business-outline" : "person-outline"}
                        size={36}
                        color={C.purple}
                      />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.nombreRow}>
                      <Text style={[styles.nombre, { color: C.text }]}>
                        {getNombre() || "Sin nombre"}
                      </Text>
                      {rol === "empresa" && perfil.verificado && (
                        <Ionicons name="checkmark-circle" size={18} color={C.purple} />
                      )}
                    </View>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      <View style={[styles.rolBadge, { backgroundColor: C.purpleDim, borderColor: C.border }]}>
                        <Text style={{ color: C.purple, fontSize: 11, fontWeight: "600" }}>
                          {ROL_LABEL[rol]}
                        </Text>
                      </View>
                      {(rol === "alumno" || rol === "talento") && perfil.estado_pasantia ? (
                        <View style={[styles.rolBadge, { backgroundColor: estadoPasantiaTokens(perfil.estado_pasantia, C).bg, borderColor: C.border }]}>
                          <Text style={{ color: estadoPasantiaTokens(perfil.estado_pasantia, C).fg, fontSize: 11, fontWeight: "600" }}>
                            {ESTADO_PASANTIA_LABEL[perfil.estado_pasantia as EstadoPasantia] ?? perfil.estado_pasantia}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    {getSubtitulo() ? (
                      <Text style={{ color: C.textSub, fontSize: 12, marginTop: 4 }}>
                        {getSubtitulo()}
                      </Text>
                    ) : null}
                  </View>
                </View>

                {/* Estudiante: certificación digital · Empresa: rango + sello */}
                {rol === "empresa" ? (
                  <View style={{ marginBottom: 12, gap: 10 }}>
                    <SelloEmpresa
                      tier={calcularRango(Number(perfil.puntos_experiencia ?? 0), "empresa").tier}
                      size="md"
                    />
                    <RangoCard
                      xp={Number(perfil.puntos_experiencia ?? 0)}
                      calificacion={Number(perfil.calificacion_promedio ?? 0)}
                      pasantias={Number(perfil.pasantias_completadas ?? 0)}
                      rol="empresa"
                      theme={theme}
                    />
                  </View>
                ) : null}
                {/* ── "Certificación Gradly" del estudiante: OCULTA por ahora
                       (pedido del usuario, 2026-09-01). Descomentar para volver
                       a mostrarla en el perfil público.
                {rol === "talento" || rol === "alumno" ? (
                  <View style={{ marginBottom: 12 }}>
                    <CertificadoGradly
                      xp={Number(perfil.puntos_experiencia ?? 0)}
                      calificacion={Number(perfil.calificacion_promedio ?? 0)}
                      pasantias={Number(perfil.pasantias_completadas ?? 0)}
                      nombre={getNombre()}
                      theme={theme}
                    />
                  </View>
                ) : null}
                ── */}

                {/* Vistazo de reseñas: promedio + "Ver más" → modal con la lista
                    completa (feedback_pasantias). Los 3 roles reciben reseñas
                    reales desde que la evaluación es a 3 bandas. */}
                <View style={{ marginBottom: 12 }}>
                  <ResenasResumen
                    entidadId={userId}
                    entidadRol={
                      rol === "empresa"
                        ? "empresa"
                        : rol === "universidad"
                        ? "universidad"
                        : "estudiante"
                    }
                    theme={theme}
                  />
                </View>

                {/* Descripción */}
                {perfil.descripcion ? (
                  <View style={[styles.section, { backgroundColor: C.card, borderColor: C.border }]}>
                    <Text style={[styles.sectionLabel, { color: C.muted }]}>Acerca de</Text>
                    <Text style={{ color: C.text, fontSize: 13, lineHeight: 20 }}>
                      {perfil.descripcion}
                    </Text>
                  </View>
                ) : null}

                {/* Info de contacto pública */}
                {[
                  { icon: "mail-outline", label: "Email", val: perfil.email ?? perfil.email_corporativo ?? perfil.email_institucional },
                  { icon: "call-outline", label: "Teléfono", val: perfil.telefono },
                  { icon: "globe-outline", label: "Web", val: perfil.web },
                  ...((rol === "alumno" || rol === "talento") ? [{ icon: "school-outline", label: "Universidad", val: universidadNombre }] : []),
                  { icon: "location-outline", label: "Ubicación", val: [perfil.distrito ?? perfil.ciudad, perfil.departamento].filter(Boolean).join(", ") || null },
                  { icon: "home-outline", label: "Dirección", val: perfil.direccion },
                  { icon: "logo-instagram", label: "Instagram", val: perfil.instagram },
                ].filter((f) => f.val).map((f) => (
                  <View key={f.label} style={[styles.infoRow, { borderBottomColor: C.border }]}>
                    <Ionicons name={f.icon as any} size={16} color={C.purple} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.muted, fontSize: 11 }}>{f.label}</Text>
                      <Text style={{ color: C.text, fontSize: 13 }} noTranslate={f.label === "Universidad"}>{f.val}</Text>
                    </View>
                  </View>
                ))}

                {/* Campos específicos por rol */}
                {/* Nota: el campo real en perfiles_estudiantes es `skills`, no
                    `habilidades` — perfil.habilidades nunca lo escribe nadie
                    (bug preexistente que dejaba esta sección siempre vacía). */}
                {(rol === "talento" || rol === "alumno") && perfil.skills?.length > 0 && (
                  <View style={[styles.section, { backgroundColor: C.card, borderColor: C.border }]}>
                    <Text style={[styles.sectionLabel, { color: C.muted }]}>Habilidades</Text>
                    <View style={styles.tagsRow}>
                      {(Array.isArray(perfil.skills)
                        ? perfil.skills
                        : String(perfil.skills).split(",")
                      ).map((h: string, i: number) => (
                        <View key={i} style={[styles.tag, { backgroundColor: C.purpleDim, borderColor: C.border }]}>
                          <Text style={{ color: C.purple, fontSize: 11 }}>{String(h).trim()}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Universidades/Empresas aliadas (convenio con pasantía real) */}
                {(rol === "empresa" || rol === "universidad") && aliados.length > 0 && (
                  <View style={[styles.section, { backgroundColor: C.card, borderColor: C.border }]}>
                    <Text style={[styles.sectionLabel, { color: C.muted }]}>
                      {rol === "empresa" ? "Universidades aliadas" : "Empresas aliadas"}
                    </Text>
                    <View style={styles.tagsRow}>
                      {aliados.map((nombre, i) => (
                        <View key={`${nombre}-${i}`} style={[styles.tag, { backgroundColor: C.purpleDim, borderColor: C.border }]}>
                          <Text style={{ color: C.purple, fontSize: 11 }} noTranslate>{nombre}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Top 5 estudiantes con mejor calificación que trabajaron con esta
                    empresa/universidad — dato ya autoreportado en el propio perfil
                    (dashboard-empresa.tsx/dashboard-universidad.tsx), sin query nueva aquí. */}
                {(rol === "empresa" || rol === "universidad") && Array.isArray(perfil.top_estudiantes) && perfil.top_estudiantes.length > 0 && (
                  <View style={[styles.section, { backgroundColor: C.card, borderColor: C.border }]}>
                    <Text style={[styles.sectionLabel, { color: C.muted }]}>
                      {rol === "empresa" ? "Mejores estudiantes que trabajaron aquí" : "Mejores estudiantes de esta universidad"}
                    </Text>
                    <View style={{ gap: 8, marginTop: 4 }}>
                      {perfil.top_estudiantes.map((e: any, i: number) => (
                        <View key={e.uid ?? i} style={[styles.topEstudianteRow, { borderColor: C.border }]}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: C.text, fontSize: 13, fontWeight: "600" }} noTranslate>{e.nombre}</Text>
                            {!!e.carrera && (
                              <Text style={{ color: C.muted, fontSize: 11, marginTop: 1 }} noTranslate>{e.carrera}</Text>
                            )}
                          </View>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <Ionicons name="star" size={13} color="#f5b50a" />
                            <Text style={{ color: C.text, fontSize: 12.5, fontWeight: "700" }}>
                              {Number(e.calificacion_promedio ?? 0).toFixed(1)}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Botón reportar */}
                <TouchableOpacity
                  style={[styles.reportBtn, { borderColor: C.red }]}
                  onPress={() => setShowReportar(true)}
                >
                  <Ionicons name="flag-outline" size={14} color={C.red} />
                  <Text style={{ color: C.red, fontSize: 12, fontWeight: "600" }}>Reportar perfil</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <ReportarModal
        visible={showReportar}
        onClose={() => setShowReportar(false)}
        reportadoId={userId}
        reportadoRol={rol}
        reportadoNombre={perfil ? getNombre() : undefined}
        reportanteId={viewerUserId}
        theme={theme}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    maxHeight: "90%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingWrap: {
    padding: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: { padding: 16, paddingBottom: 40 },

  profileTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    marginBottom: 16,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: "100%", height: "100%" },
  nombreRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  nombre: { fontSize: 17, fontWeight: "700" },
  rolBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },

  section: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    marginBottom: 0,
  },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  topEstudianteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  reportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 20,
  },
});
