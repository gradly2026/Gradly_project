import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
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

const TABLE_MAP: Record<PerfilRol, string> = {
  empresa: "empresas",
  talento: "talentos",
  alumno: "alumnos",
  universidad: "universidades",
};

const ROL_LABEL: Record<PerfilRol, string> = {
  empresa: "Empresa",
  talento: "Joven Talento",
  alumno: "Estudiante",
  universidad: "Universidad",
};

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

  useEffect(() => {
    if (visible && userId) loadPerfil();
  }, [visible, userId]);

  const loadPerfil = async () => {
    setLoading(true);
    setPerfil(null);
    try {
      const tabla = TABLE_MAP[rol];
      const { data } = await supabase
        .from(tabla)
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      setPerfil(data);
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

  const getFoto = () => perfil?.foto_perfil ?? perfil?.foto_logo ?? perfil?.logo_url ?? null;

  const getSubtitulo = () => {
    if (!perfil) return "";
    if (rol === "empresa") return perfil.industria ?? perfil.sector ?? "";
    if (rol === "talento") return perfil.headline ?? perfil.area ?? "";
    if (rol === "alumno") return [perfil.carrera, perfil.semestre ? `${perfil.semestre}° sem.` : ""].filter(Boolean).join(" · ");
    if (rol === "universidad") return perfil.ciudad ? `${perfil.ciudad}, El Salvador` : "Universidad";
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
                    <Text style={[styles.nombre, { color: C.text }]}>
                      {getNombre() || "Sin nombre"}
                    </Text>
                    <View style={[styles.rolBadge, { backgroundColor: C.purpleDim, borderColor: C.border }]}>
                      <Text style={{ color: C.purple, fontSize: 11, fontWeight: "600" }}>
                        {ROL_LABEL[rol]}
                      </Text>
                    </View>
                    {getSubtitulo() ? (
                      <Text style={{ color: C.textSub, fontSize: 12, marginTop: 4 }}>
                        {getSubtitulo()}
                      </Text>
                    ) : null}
                  </View>
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
                  { icon: "location-outline", label: "Ubicación", val: [perfil.ciudad, perfil.departamento].filter(Boolean).join(", ") || null },
                  { icon: "logo-instagram", label: "Instagram", val: perfil.instagram },
                ].filter((f) => f.val).map((f) => (
                  <View key={f.label} style={[styles.infoRow, { borderBottomColor: C.border }]}>
                    <Ionicons name={f.icon as any} size={16} color={C.purple} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.muted, fontSize: 11 }}>{f.label}</Text>
                      <Text style={{ color: C.text, fontSize: 13 }}>{f.val}</Text>
                    </View>
                  </View>
                ))}

                {/* Campos específicos por rol */}
                {rol === "talento" && perfil.habilidades && (
                  <View style={[styles.section, { backgroundColor: C.card, borderColor: C.border }]}>
                    <Text style={[styles.sectionLabel, { color: C.muted }]}>Habilidades</Text>
                    <View style={styles.tagsRow}>
                      {(Array.isArray(perfil.habilidades)
                        ? perfil.habilidades
                        : String(perfil.habilidades).split(",")
                      ).map((h: string, i: number) => (
                        <View key={i} style={[styles.tag, { backgroundColor: C.purpleDim, borderColor: C.border }]}>
                          <Text style={{ color: C.purple, fontSize: 11 }}>{String(h).trim()}</Text>
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
  nombre: { fontSize: 17, fontWeight: "700", marginBottom: 4 },
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
