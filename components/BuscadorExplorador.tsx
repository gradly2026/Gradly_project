import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import PerfilPublicoModal, { PerfilRol } from "./PerfilPublicoModal";

type TabKey = "empresas" | "talentos" | "alumnos";

interface Props {
  viewerUserId: string;
  theme?: "dark" | "light";
  tabs?: TabKey[];
  containerStyle?: object;
}

const DARK = {
  bg: "transparent",
  card: "rgba(255,255,255,0.04)",
  border: "rgba(139,92,246,0.20)",
  inputBg: "rgba(255,255,255,0.04)",
  text: "#f4f1ff",
  muted: "rgba(255,255,255,0.45)",
  purple: "#8b5cf6",
  purpleDim: "rgba(139,92,246,0.12)",
  purpleActive: "#8b5cf6",
  tabActiveBg: "#8b5cf6",
  tabInactiveBg: "rgba(255,255,255,0.04)",
  avatarBg: "rgba(139,92,246,0.12)",
};

const LIGHT = {
  bg: "transparent",
  card: "#ffffff",
  border: "rgba(139,92,246,0.18)",
  inputBg: "#f3f4f6",
  text: "#111827",
  muted: "#9ca3af",
  purple: "#7c3aed",
  purpleDim: "rgba(139,92,246,0.08)",
  purpleActive: "#7c3aed",
  tabActiveBg: "#7c3aed",
  tabInactiveBg: "#f3f4f6",
  avatarBg: "rgba(139,92,246,0.08)",
};

const TAB_LABELS: Record<TabKey, string> = {
  empresas: "Empresas",
  talentos: "Talentos",
  alumnos: "Estudiantes",
};

const TAB_ROL: Record<TabKey, PerfilRol> = {
  empresas: "empresa",
  talentos: "talento",
  alumnos: "alumno",
};

type ResultItem = {
  id: string;
  nombre: string;
  subtitulo: string;
  foto: string | null;
};

export default function BuscadorExplorador({
  viewerUserId,
  theme = "dark",
  tabs = ["empresas", "talentos", "alumnos"],
  containerStyle,
}: Props) {
  const C = theme === "light" ? LIGHT : DARK;

  const [activeTab, setActiveTab] = useState<TabKey>(tabs[0]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [selectedId, setSelectedId] = useState("");
  const [selectedRol, setSelectedRol] = useState<PerfilRol>("empresa");
  const [showPerfil, setShowPerfil] = useState(false);

  useEffect(() => {
    setQuery("");
    loadTab(activeTab, "");
  }, [activeTab]);

  const loadTab = useCallback(async (tab: TabKey, q: string) => {
    setLoading(true);
    try {
      let qb = supabase.from(tab).select("id, nombre, foto_perfil, foto_logo, logo_url, industria, sector, headline, area, carrera, semestre, ciudad, departamento, nombre_completo");
      if (q.trim()) {
        const field = tab === "alumnos" ? "nombre_completo" : "nombre";
        qb = qb.ilike(field, `%${q.trim()}%`);
      }
      const { data } = await qb.order("created_at", { ascending: false }).limit(20);
      if (!data) { setResults([]); return; }

      const mapped: ResultItem[] = data.map((r: any) => {
        const nombre = r.nombre_completo ?? r.nombre ?? "";
        const foto = r.foto_perfil ?? r.foto_logo ?? r.logo_url ?? null;
        let subtitulo = "";
        if (tab === "empresas") subtitulo = r.industria ?? r.sector ?? "";
        else if (tab === "talentos") subtitulo = r.headline ?? r.area ?? "";
        else if (tab === "alumnos") subtitulo = r.carrera ?? "";
        if (r.ciudad) subtitulo = subtitulo ? `${subtitulo} · ${r.ciudad}` : r.ciudad;
        return { id: r.id, nombre, subtitulo, foto };
      });
      setResults(mapped);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => loadTab(activeTab, query), 400);
    return () => clearTimeout(timeout);
  }, [query, activeTab]);

  const openPerfil = (item: ResultItem) => {
    setSelectedId(item.id);
    setSelectedRol(TAB_ROL[activeTab]);
    setShowPerfil(true);
  };

  return (
    <View style={[styles.root, containerStyle]}>
      {/* Search bar */}
      <View style={[styles.searchBar, { backgroundColor: C.inputBg, borderColor: C.border }]}>
        <Ionicons name="search-outline" size={16} color={C.muted} />
        <TextInput
          style={[styles.searchInput, { color: C.text }]}
          value={query}
          onChangeText={setQuery}
          placeholder={`Buscar ${TAB_LABELS[activeTab].toLowerCase()}...`}
          placeholderTextColor={C.muted}
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery("")}>
            <Ionicons name="close-circle" size={16} color={C.muted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      {tabs.length > 1 && (
        <View style={styles.tabs}>
          {tabs.map((t) => (
            <TouchableOpacity
              key={t}
              style={[
                styles.tab,
                {
                  backgroundColor: activeTab === t ? C.tabActiveBg : C.tabInactiveBg,
                  borderColor: C.border,
                },
              ]}
              onPress={() => setActiveTab(t)}
            >
              <Text style={{ color: activeTab === t ? "#fff" : C.muted, fontSize: 12, fontWeight: "600" }}>
                {TAB_LABELS[t]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Results */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.purple} />
        </View>
      ) : results.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="search-outline" size={28} color={C.muted} />
          <Text style={{ color: C.muted, fontSize: 13, marginTop: 8 }}>
            {query ? "Sin resultados" : "Cargando..."}
          </Text>
        </View>
      ) : (
        results.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.resultCard, { backgroundColor: C.card, borderColor: C.border }]}
            onPress={() => openPerfil(item)}
            activeOpacity={0.75}
          >
            <View style={[styles.avatar, { backgroundColor: C.avatarBg }]}>
              {item.foto ? (
                <Image source={{ uri: item.foto }} style={styles.avatarImg} />
              ) : (
                <Ionicons
                  name={activeTab === "empresas" ? "business-outline" : "person-outline"}
                  size={22}
                  color={C.purple}
                />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontWeight: "600", fontSize: 13 }} numberOfLines={1}>
                {item.nombre || "—"}
              </Text>
              {item.subtitulo ? (
                <Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                  {item.subtitulo}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={14} color={C.muted} />
          </TouchableOpacity>
        ))
      )}

      <PerfilPublicoModal
        visible={showPerfil}
        onClose={() => setShowPerfil(false)}
        userId={selectedId}
        rol={selectedRol}
        viewerUserId={viewerUserId}
        theme={theme}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 42,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 13 },
  tabs: { flexDirection: "row", gap: 6, marginBottom: 12 },
  tab: {
    flex: 1,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  center: { paddingVertical: 24, alignItems: "center" },
  resultCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: "100%", height: "100%" },
});
