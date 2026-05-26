/**
 * dashboard-empresa.tsx
 * Portal de empresa — React Native (Expo)
 *
 * Bottom nav: Inicio · Vacantes · Candidatos · Horas Sociales · Mi Perfil
 * Todos los datos provienen de Supabase — cero hardcode.
 */

import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import UniversalHeader from "../src/components/UniversalHeader";
import { useThemeContext } from "../src/context/ThemeContext";

// ── Tipos ────────────────────────────────────────────────────────────────────

type Tab = "inicio" | "vacantes" | "candidatos" | "horas" | "perfil";
type EmpresaData = Record<string, any>;
type Vacante = Record<string, any>;
type Aplicacion = Record<string, any>;
type Solicitud = Record<string, any>;

type ToastItem = { id: number; msg: string; type: "ok" | "err" | "info" };

// ── Paleta ───────────────────────────────────────────────────────────────────

const darkC = {
  bg: "#07050f",
  surface: "#0d0b1e",
  card: "#141226",
  border: "rgba(139,92,246,0.18)",
  purple: "#8b5cf6",
  purpleDark: "#7c3aed",
  purpleDim: "rgba(139,92,246,0.10)",
  purpleBorder: "rgba(139,92,246,0.35)",
  text: "#f4f1ff",
  muted: "rgba(255,255,255,0.50)",
  green: "#10b981",
  greenBg: "rgba(16,185,129,0.10)",
  greenBorder: "rgba(16,185,129,0.30)",
  red: "#ef4444",
  redBg: "rgba(239,68,68,0.10)",
  yellow: "#f59e0b",
  yellowBg: "rgba(245,158,11,0.10)",
};

const lightC = {
  bg: "#f8fafc",
  surface: "#ffffff",
  card: "#f0f4ff",
  border: "rgba(139,92,246,0.15)",
  purple: "#7c3aed",
  purpleDark: "#6d28d9",
  purpleDim: "rgba(139,92,246,0.08)",
  purpleBorder: "rgba(139,92,246,0.28)",
  text: "#111827",
  muted: "rgba(17,24,39,0.50)",
  green: "#059669",
  greenBg: "rgba(5,150,105,0.08)",
  greenBorder: "rgba(5,150,105,0.25)",
  red: "#dc2626",
  redBg: "rgba(220,38,38,0.08)",
  yellow: "#d97706",
  yellowBg: "rgba(217,119,6,0.08)",
};

// ── Bottom nav items ──────────────────────────────────────────────────────────

const NAV: { key: Tab; label: string; icon: string }[] = [
  { key: "inicio", label: "Inicio", icon: "home-outline" },
  { key: "vacantes", label: "Vacantes", icon: "briefcase-outline" },
  { key: "candidatos", label: "Candidatos", icon: "people-outline" },
  { key: "horas", label: "Horas", icon: "time-outline" },
  { key: "perfil", label: "Mi Perfil", icon: "business-outline" },
];

const KANBAN_COLS = [
  { key: "pendiente", label: "Pendiente", color: "#f59e0b" },
  { key: "en_revision", label: "En revisión", color: "#8b5cf6" },
  { key: "entrevista", label: "Entrevista", color: "#3b82f6" },
  { key: "contratada", label: "Contratada", color: "#10b981" },
  { key: "rechazada", label: "Rechazada", color: "#ef4444" },
];

// ── Componente principal ───────────────────────────────────────────────────────

export default function DashboardEmpresa() {
  const router = useRouter();
  const { isDark } = useThemeContext();
  const C = isDark ? darkC : lightC;

  // ── Estado global ─────────────────────────────────────────────────────────
  const [userId, setUserId] = useState<string | null>(null);
  const [empresa, setEmpresa] = useState<EmpresaData | null>(null);
  const [tab, setTab] = useState<Tab>("inicio");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // ── Inicio — métricas ─────────────────────────────────────────────────────
  const [metVacantes, setMetVacantes] = useState(0);
  const [metCandidatos, setMetCandidatos] = useState(0);
  const [metHoras, setMetHoras] = useState(0);
  const [metEvaluaciones, setMetEvaluaciones] = useState(0);

  // ── Vacantes ──────────────────────────────────────────────────────────────
  const [vacantes, setVacantes] = useState<Vacante[]>([]);
  const [showVacanteModal, setShowVacanteModal] = useState(false);
  const [vacanteStep, setVacanteStep] = useState<1 | 2 | 3>(1);
  const [formTitulo, setFormTitulo] = useState("");
  const [formArea, setFormArea] = useState("");
  const [formModalidad, setFormModalidad] = useState("presencial");
  const [formTipo, setFormTipo] = useState("tiempo_completo");
  const [formDesc, setFormDesc] = useState("");
  const [formSalMin, setFormSalMin] = useState("");
  const [formSalMax, setFormSalMax] = useState("");
  const [formMostrarSal, setFormMostrarSal] = useState(false);
  const [savingVacante, setSavingVacante] = useState(false);
  const [selectedVacante, setSelectedVacante] = useState<Vacante | null>(null);
  const [showVacanteDetail, setShowVacanteDetail] = useState(false);

  // ── Candidatos ────────────────────────────────────────────────────────────
  const [aplicaciones, setAplicaciones] = useState<Aplicacion[]>([]);
  const [kanbanTab, setKanbanTab] = useState("pendiente");
  const [loadingCand, setLoadingCand] = useState(false);

  // ── Horas Sociales ────────────────────────────────────────────────────────
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [horasTab, setHorasTab] = useState("pendiente");
  const [loadingHoras, setLoadingHoras] = useState(false);
  const [showEvalModal, setShowEvalModal] = useState(false);
  const [evalEstudiante, setEvalEstudiante] = useState<any>(null);
  const [evalGrupoId, setEvalGrupoId] = useState<string>("");
  const [evalPuntualidad, setEvalPuntualidad] = useState(0);
  const [evalDisciplina, setEvalDisciplina] = useState(0);
  const [evalResponsabilidad, setEvalResponsabilidad] = useState(0);
  const [evalRespeto, setEvalRespeto] = useState(0);
  const [evalDesempeno, setEvalDesempeno] = useState(0);
  const [evalComentario, setEvalComentario] = useState("");
  const [savingEval, setSavingEval] = useState(false);

  // ── Mi Perfil ─────────────────────────────────────────────────────────────
  const [editNombre, setEditNombre] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editTel, setEditTel] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editWeb, setEditWeb] = useState("");
  const [editInst, setEditInst] = useState("");
  const [editFacebook, setEditFacebook] = useState("");
  const [editDep, setEditDep] = useState("");
  const [editCiudad, setEditCiudad] = useState("");
  const [editDireccion, setEditDireccion] = useState("");
  const [savingPerfil, setSavingPerfil] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const toastId = useRef(0);

  // ── Toast ─────────────────────────────────────────────────────────────────

  const toast = useCallback(
    (msg: string, type: "ok" | "err" | "info" = "ok") => {
      const id = ++toastId.current;
      setToasts((p) => [...p, { id, msg, type }]);
      setTimeout(
        () => setToasts((p) => p.filter((t) => t.id !== id)),
        3500,
      );
    },
    [],
  );

  // ── Carga inicial ─────────────────────────────────────────────────────────

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      setLoading(true);
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();
      if (authErr || !user) {
        router.replace("/iniciosesion");
        return;
      }
      setUserId(user.id);
      await Promise.all([
        loadEmpresa(user.id),
        loadVacantes(user.id),
        loadMetricas(user.id),
        loadAplicaciones(user.id),
        loadSolicitudes(user.id),
      ]);
    } catch (e: any) {
      toast(e?.message ?? "Error al cargar datos", "err");
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    if (!userId) return;
    setRefreshing(true);
    await Promise.all([
      loadEmpresa(userId),
      loadVacantes(userId),
      loadMetricas(userId),
      loadAplicaciones(userId),
      loadSolicitudes(userId),
    ]).catch(() => {});
    setRefreshing(false);
  };

  // ── Loaders ───────────────────────────────────────────────────────────────

  const loadEmpresa = async (id: string) => {
    const { data, error } = await supabase
      .from("empresas")
      .select("*")
      .eq("id", id)
      .single();
    if (!error && data) {
      setEmpresa(data);
      setEditNombre(data.nombre ?? "");
      setEditDesc(data.descripcion ?? "");
      setEditTel(data.telefono ?? "");
      setEditEmail(data.email_corporativo ?? "");
      setEditWeb(data.web ?? "");
      setEditInst(data.instagram ?? "");
      setEditFacebook(data.facebook ?? "");
      setEditDep(data.departamento ?? "");
      setEditCiudad(data.ciudad ?? "");
      setEditDireccion(data.direccion ?? "");
    }
  };

  const loadVacantes = async (id: string) => {
    const { data } = await supabase
      .from("vacantes")
      .select("*")
      .eq("empresa_id", id)
      .order("created_at", { ascending: false });
    if (data) setVacantes(data);
  };

  const loadMetricas = async (id: string) => {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);

    const [
      { count: vAct },
      { data: vIds },
      { count: hAct },
      { count: evMes },
    ] = await Promise.all([
      supabase
        .from("vacantes")
        .select("*", { count: "exact", head: true })
        .eq("empresa_id", id)
        .eq("estado", "activa"),
      supabase.from("vacantes").select("id").eq("empresa_id", id),
      supabase
        .from("solicitudes_horas")
        .select("*", { count: "exact", head: true })
        .eq("empresa_id", id)
        .eq("estado", "aprobada"),
      supabase
        .from("evaluaciones_alumnos")
        .select("*", { count: "exact", head: true })
        .eq("empresa_id", id)
        .gte("created_at", inicioMes.toISOString()),
    ]);

    setMetVacantes(vAct ?? 0);
    setMetHoras(hAct ?? 0);
    setMetEvaluaciones(evMes ?? 0);

    if (vIds && vIds.length > 0) {
      const ids = vIds.map((v) => v.id);
      const { count: cMes } = await supabase
        .from("aplicaciones")
        .select("*", { count: "exact", head: true })
        .in("vacante_id", ids)
        .gte("created_at", inicioMes.toISOString());
      setMetCandidatos(cMes ?? 0);
    } else {
      setMetCandidatos(0);
    }
  };

  const loadAplicaciones = async (id: string) => {
    setLoadingCand(true);
    const { data: vIds } = await supabase
      .from("vacantes")
      .select("id")
      .eq("empresa_id", id);

    if (!vIds || vIds.length === 0) {
      setAplicaciones([]);
      setLoadingCand(false);
      return;
    }

    const ids = vIds.map((v) => v.id);
    const { data } = await supabase
      .from("aplicaciones")
      .select("*, vacantes(titulo, area)")
      .in("vacante_id", ids)
      .order("created_at", { ascending: false });

    if (data) {
      // Enriquecer con datos del solicitante (talento o alumno)
      const enriched = await Promise.all(
        data.map(async (ap) => {
          const { data: talento } = await supabase
            .from("talentos")
            .select("nombre, email, foto_perfil, telefono")
            .eq("id", ap.solicitante_id)
            .maybeSingle();
          if (talento) return { ...ap, _solicitante: talento };

          const { data: alumno } = await supabase
            .from("alumnos")
            .select("nombre_completo, email, foto_perfil, telefono")
            .eq("id", ap.solicitante_id)
            .maybeSingle();
          if (alumno)
            return {
              ...ap,
              _solicitante: {
                nombre: alumno.nombre_completo,
                email: alumno.email,
                foto_perfil: alumno.foto_perfil,
                telefono: alumno.telefono,
              },
            };

          return ap;
        }),
      );
      setAplicaciones(enriched);
    }
    setLoadingCand(false);
  };

  const loadSolicitudes = async (id: string) => {
    setLoadingHoras(true);
    const { data } = await supabase
      .from("solicitudes_horas")
      .select(
        "*, universidades(nombre, foto_banner), grupos(nombre_grupo, especialidad, horas_requeridas)",
      )
      .eq("empresa_id", id)
      .order("created_at", { ascending: false });
    if (data) setSolicitudes(data);
    setLoadingHoras(false);
  };

  // ── Crear vacante ─────────────────────────────────────────────────────────

  const resetVacanteForm = () => {
    setFormTitulo("");
    setFormArea("");
    setFormDesc("");
    setFormSalMin("");
    setFormSalMax("");
    setFormModalidad("presencial");
    setFormTipo("tiempo_completo");
    setFormMostrarSal(false);
    setVacanteStep(1);
  };

  const guardarVacante = async () => {
    if (!formTitulo.trim() || !formArea.trim() || !formDesc.trim()) {
      toast("Completa título, área y descripción.", "err");
      return;
    }
    setSavingVacante(true);
    try {
      const { data, error } = await supabase
        .from("vacantes")
        .insert([
          {
            empresa_id: userId,
            titulo: formTitulo.trim(),
            area: formArea.trim(),
            modalidad: formModalidad,
            tipo: formTipo,
            descripcion: formDesc.trim(),
            salario_min: formSalMin ? parseFloat(formSalMin) : null,
            salario_max: formSalMax ? parseFloat(formSalMax) : null,
            mostrar_salario: formMostrarSal,
            estado: "activa",
          },
        ])
        .select()
        .single();
      if (error) throw error;
      setVacantes((p) => [data, ...p]);
      setMetVacantes((n) => n + 1);
      setShowVacanteModal(false);
      resetVacanteForm();
      toast("Vacante publicada correctamente.", "ok");
    } catch (e: any) {
      toast(e?.message ?? "Error al publicar vacante.", "err");
    } finally {
      setSavingVacante(false);
    }
  };

  const cerrarVacante = async (id: string) => {
    Alert.alert("Cerrar vacante", "¿Deseas cerrar esta vacante?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Cerrar",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase
            .from("vacantes")
            .update({ estado: "cerrada" })
            .eq("id", id);
          if (!error) {
            setVacantes((p) =>
              p.map((v) => (v.id === id ? { ...v, estado: "cerrada" } : v)),
            );
            toast("Vacante cerrada.", "info");
          }
        },
      },
    ]);
  };

  // ── Candidatos ────────────────────────────────────────────────────────────

  const cambiarEstadoAplicacion = async (
    id: string,
    nuevoEstado: string,
    nota?: string,
  ) => {
    const { error } = await supabase
      .from("aplicaciones")
      .update({ estado: nuevoEstado, nota_empresa: nota ?? null })
      .eq("id", id);
    if (!error) {
      setAplicaciones((p) =>
        p.map((a) =>
          a.id === id
            ? { ...a, estado: nuevoEstado, nota_empresa: nota ?? null }
            : a,
        ),
      );
      toast(`Candidato movido a "${nuevoEstado}".`, "ok");
    }
  };

  // ── Horas Sociales ────────────────────────────────────────────────────────

  const aprobarSolicitud = async (id: string) => {
    const { error } = await supabase
      .from("solicitudes_horas")
      .update({ estado: "aprobada" })
      .eq("id", id);
    if (!error) {
      setSolicitudes((p) =>
        p.map((s) => (s.id === id ? { ...s, estado: "aprobada" } : s)),
      );
      setMetHoras((n) => n + 1);
      toast("Solicitud aprobada.", "ok");
    }
  };

  const guardarEvaluacion = async () => {
    if (!evalEstudiante || !userId) return;
    const campos = [
      evalPuntualidad,
      evalDisciplina,
      evalResponsabilidad,
      evalRespeto,
      evalDesempeno,
    ];
    if (campos.some((v) => v === 0)) {
      toast("Califica todos los criterios (1-5 estrellas).", "err");
      return;
    }
    setSavingEval(true);
    try {
      const { error } = await supabase
        .from("evaluaciones_alumnos")
        .upsert(
          {
            empresa_id: userId,
            estudiante_id: evalEstudiante.id,
            grupo_id: evalGrupoId || null,
            puntualidad: evalPuntualidad,
            disciplina: evalDisciplina,
            responsabilidad: evalResponsabilidad,
            respeto: evalRespeto,
            desempeno: evalDesempeno,
            comentario: evalComentario.trim() || null,
          },
          { onConflict: "empresa_id,estudiante_id" },
        );
      if (error) throw error;
      // Notificación al alumno
      await supabase.from("notificaciones").insert({
        usuario_id: evalEstudiante.id,
        tipo: "evaluacion",
        titulo: "Nueva evaluación recibida",
        mensaje: `La empresa ${empresa?.nombre ?? ""} te evaluó. ¡Revisa tu perfil!`,
      });
      setShowEvalModal(false);
      setEvalEstudiante(null);
      setEvalComentario("");
      setEvalPuntualidad(0);
      setEvalDisciplina(0);
      setEvalResponsabilidad(0);
      setEvalRespeto(0);
      setEvalDesempeno(0);
      setMetEvaluaciones((n) => n + 1);
      toast("Evaluación guardada.", "ok");
    } catch (e: any) {
      toast(e?.message ?? "Error al guardar evaluación.", "err");
    } finally {
      setSavingEval(false);
    }
  };

  // ── Mi Perfil ─────────────────────────────────────────────────────────────

  const guardarPerfil = async () => {
    if (!userId) return;
    setSavingPerfil(true);
    try {
      const { error } = await supabase
        .from("empresas")
        .update({
          nombre: editNombre.trim(),
          descripcion: editDesc.trim(),
          telefono: editTel.trim(),
          email_corporativo: editEmail.trim(),
          web: editWeb.trim(),
          instagram: editInst.trim(),
          facebook: editFacebook.trim(),
          departamento: editDep.trim(),
          ciudad: editCiudad.trim(),
          direccion: editDireccion.trim(),
        })
        .eq("id", userId);
      if (error) throw error;
      await loadEmpresa(userId);
      toast("Perfil actualizado correctamente.", "ok");
    } catch (e: any) {
      toast(e?.message ?? "Error al guardar perfil.", "err");
    } finally {
      setSavingPerfil(false);
    }
  };

  const cambiarLogo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast("Se necesita acceso a la galería.", "err");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;

    setUploadingLogo(true);
    try {
      const uri = result.assets[0].uri;
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: "base64",
      });
      const fileName = `${userId}/logo_${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(fileName, base64, { contentType: "image/jpeg", upsert: true });
      if (upErr) throw upErr;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(fileName);

      await supabase
        .from("empresas")
        .update({ foto_logo: publicUrl })
        .eq("id", userId);
      setEmpresa((p: any) => ({ ...p, foto_logo: publicUrl }));
      toast("Logo actualizado.", "ok");
    } catch (e: any) {
      toast(e?.message ?? "Error al subir logo.", "err");
    } finally {
      setUploadingLogo(false);
    }
  };

  // ── Helpers de render ─────────────────────────────────────────────────────

  const stateColor = (estado: string) => {
    const col = KANBAN_COLS.find((k) => k.key === estado);
    return col?.color ?? C.muted;
  };

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("es-SV", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  // ── Sección INICIO ────────────────────────────────────────────────────────

  const renderInicio = () => (
    <ScrollView
      contentContainerStyle={[st.scroll]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={C.purple}
        />
      }
    >
      {/* Banner empresa */}
      <View style={[st.empresaBanner, { backgroundColor: C.surface, borderColor: C.border }]}>
        <TouchableOpacity onPress={cambiarLogo} style={st.logoWrap}>
          {uploadingLogo ? (
            <ActivityIndicator color={C.purple} />
          ) : empresa?.foto_logo ? (
            <Image source={{ uri: empresa.foto_logo }} style={st.logoImg} />
          ) : (
            <Ionicons name="business-outline" size={28} color={C.purple} />
          )}
          <View style={[st.editBadge, { backgroundColor: C.purple }]}>
            <Ionicons name="camera-outline" size={10} color="#fff" />
          </View>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[st.empresaNombre, { color: C.text }]}>
            {empresa?.nombre ?? "Mi Empresa"}
          </Text>
          <Text style={[st.empresaSector, { color: C.muted }]}>
            {empresa?.industria ?? empresa?.sector ?? "—"}
          </Text>
        </View>
      </View>

      {/* 4 métricas */}
      <Text style={[st.sectionLabel, { color: C.muted }]}>RESUMEN DEL MES</Text>
      <View style={st.metricsGrid}>
        {[
          { label: "Vacantes activas", val: metVacantes, icon: "briefcase-outline", color: C.purple },
          { label: "Candidatos (mes)", val: metCandidatos, icon: "people-outline", color: C.green },
          { label: "Horas activas", val: metHoras, icon: "time-outline", color: C.yellow },
          { label: "Evaluaciones (mes)", val: metEvaluaciones, icon: "star-outline", color: "#f59e0b" },
        ].map((m) => (
          <View key={m.label} style={[st.metCard, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Ionicons name={m.icon as any} size={22} color={m.color} />
            <Text style={[st.metVal, { color: m.color }]}>{m.val}</Text>
            <Text style={[st.metLabel, { color: C.muted }]}>{m.label}</Text>
          </View>
        ))}
      </View>

      {/* Acciones rápidas */}
      <Text style={[st.sectionLabel, { color: C.muted }]}>ACCIONES RÁPIDAS</Text>
      <View style={st.quickActions}>
        <TouchableOpacity
          style={[st.qaBtn, { backgroundColor: C.purple }]}
          onPress={() => { setShowVacanteModal(true); setTab("vacantes"); }}
        >
          <Ionicons name="add-circle-outline" size={18} color="#fff" />
          <Text style={st.qaBtnText}>Nueva vacante</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[st.qaBtn, { backgroundColor: C.surface, borderColor: C.purpleBorder, borderWidth: 1 }]}
          onPress={() => setTab("candidatos")}
        >
          <Ionicons name="people-outline" size={18} color={C.purple} />
          <Text style={[st.qaBtnText, { color: C.purple }]}>Ver candidatos</Text>
        </TouchableOpacity>
      </View>

      {/* Vacantes recientes */}
      <Text style={[st.sectionLabel, { color: C.muted }]}>VACANTES RECIENTES</Text>
      {vacantes.slice(0, 3).length === 0 ? (
        <View style={[st.emptyCard, { backgroundColor: C.surface, borderColor: C.purpleBorder }]}>
          <Ionicons name="briefcase-outline" size={32} color={C.muted} />
          <Text style={[st.emptyText, { color: C.muted }]}>
            Aún no has publicado vacantes.
          </Text>
        </View>
      ) : (
        vacantes.slice(0, 3).map((v) => (
          <TouchableOpacity
            key={v.id}
            style={[st.vacanteRow, { backgroundColor: C.surface, borderColor: C.border }]}
            onPress={() => { setSelectedVacante(v); setShowVacanteDetail(true); }}
          >
            <View style={{ flex: 1 }}>
              <Text style={[st.vacanteTitle, { color: C.text }]}>{v.titulo}</Text>
              <Text style={[st.vacanteSub, { color: C.muted }]}>
                {v.area} · {v.modalidad?.toUpperCase()}
              </Text>
            </View>
            <View style={[st.estadoBadge, { backgroundColor: v.estado === "activa" ? C.greenBg : C.redBg }]}>
              <Text style={{ fontSize: 11, color: v.estado === "activa" ? C.green : C.red, fontWeight: "600" }}>
                {v.estado === "activa" ? "Activa" : "Cerrada"}
              </Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );

  // ── Sección VACANTES ──────────────────────────────────────────────────────

  const renderVacantes = () => (
    <ScrollView
      contentContainerStyle={st.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.purple} />}
    >
      <TouchableOpacity
        style={[st.createBtn, { backgroundColor: C.purple }]}
        onPress={() => { resetVacanteForm(); setShowVacanteModal(true); }}
      >
        <Ionicons name="add-circle-outline" size={20} color="#fff" />
        <Text style={st.createBtnText}>Publicar nueva vacante</Text>
      </TouchableOpacity>

      {vacantes.length === 0 ? (
        <View style={[st.emptyCard, { backgroundColor: C.surface, borderColor: C.purpleBorder }]}>
          <Ionicons name="briefcase-outline" size={36} color={C.muted} />
          <Text style={[st.emptyText, { color: C.muted }]}>No tienes vacantes publicadas aún.</Text>
        </View>
      ) : (
        vacantes.map((v) => (
          <View key={v.id} style={[st.vacanteCard, { backgroundColor: C.surface, borderColor: C.border }]}>
            <TouchableOpacity
              style={{ flex: 1 }}
              onPress={() => { setSelectedVacante(v); setShowVacanteDetail(true); }}
            >
              <Text style={[st.vacanteTitle, { color: C.text }]}>{v.titulo}</Text>
              <Text style={[st.vacanteSub, { color: C.muted }]}>
                {v.area} · {v.modalidad?.toUpperCase()} · {fmtDate(v.created_at)}
              </Text>
            </TouchableOpacity>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <View style={[st.estadoBadge, { backgroundColor: v.estado === "activa" ? C.greenBg : C.redBg }]}>
                <Text style={{ fontSize: 11, color: v.estado === "activa" ? C.green : C.red, fontWeight: "600" }}>
                  {v.estado === "activa" ? "Activa" : "Cerrada"}
                </Text>
              </View>
              {v.estado === "activa" && (
                <TouchableOpacity onPress={() => cerrarVacante(v.id)}>
                  <Ionicons name="close-circle-outline" size={22} color={C.red} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );

  // ── Sección CANDIDATOS ────────────────────────────────────────────────────

  const renderCandidatos = () => {
    const filtrados = aplicaciones.filter((a) => a.estado === kanbanTab);

    return (
      <View style={{ flex: 1 }}>
        {/* Tabs kanban */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ paddingHorizontal: 16, paddingTop: 12, maxHeight: 52 }}
          contentContainerStyle={{ gap: 8 }}
        >
          {KANBAN_COLS.map((col) => {
            const cnt = aplicaciones.filter((a) => a.estado === col.key).length;
            const active = kanbanTab === col.key;
            return (
              <TouchableOpacity
                key={col.key}
                style={[
                  st.kanbanTab,
                  { borderColor: col.color, backgroundColor: active ? col.color : "transparent" },
                ]}
                onPress={() => setKanbanTab(col.key)}
              >
                <Text style={{ color: active ? "#fff" : col.color, fontSize: 12, fontWeight: "600" }}>
                  {col.label} ({cnt})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loadingCand ? (
          <ActivityIndicator color={C.purple} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView contentContainerStyle={st.scroll}>
            {filtrados.length === 0 ? (
              <View style={[st.emptyCard, { backgroundColor: C.surface, borderColor: C.purpleBorder }]}>
                <Ionicons name="people-outline" size={36} color={C.muted} />
                <Text style={[st.emptyText, { color: C.muted }]}>
                  No hay candidatos en esta etapa.
                </Text>
              </View>
            ) : (
              filtrados.map((ap) => (
                <View key={ap.id} style={[st.candCard, { backgroundColor: C.surface, borderColor: C.border }]}>
                  <View style={[st.candAvatar, { backgroundColor: C.purpleDim }]}>
                    {ap._solicitante?.foto_perfil ? (
                      <Image source={{ uri: ap._solicitante.foto_perfil }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                    ) : (
                      <Text style={{ color: C.purple, fontSize: 16, fontWeight: "700" }}>
                        {ap._solicitante?.nombre?.[0]?.toUpperCase() ?? "?"}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[{ color: C.text, fontWeight: "700", fontSize: 14 }]}>
                      {ap._solicitante?.nombre ?? "Sin nombre"}
                    </Text>
                    <Text style={[{ color: C.muted, fontSize: 12 }]}>
                      {ap.vacantes?.titulo ?? "Vacante eliminada"}
                    </Text>
                    {(ap.estado === "entrevista" || ap.estado === "contratada") && (
                      <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                        <Text style={{ color: C.purple, fontSize: 11 }}>
                          📧 {ap._solicitante?.email ?? "—"}
                        </Text>
                        {ap._solicitante?.telefono ? (
                          <Text style={{ color: C.purple, fontSize: 11 }}>
                            📞 {ap._solicitante.telefono}
                          </Text>
                        ) : null}
                      </View>
                    )}
                  </View>
                  {/* Cambiar estado */}
                  <TouchableOpacity
                    onPress={() => {
                      const cols = KANBAN_COLS.map((c) => c.key);
                      const idx = cols.indexOf(ap.estado);
                      const next = cols[idx + 1];
                      if (!next) return;
                      cambiarEstadoAplicacion(ap.id, next);
                    }}
                  >
                    <View style={[st.estadoBadge, { backgroundColor: C.purpleDim }]}>
                      <Ionicons name="arrow-forward-outline" size={14} color={C.purple} />
                    </View>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        )}
      </View>
    );
  };

  // ── Sección HORAS SOCIALES ────────────────────────────────────────────────

  const renderHoras = () => {
    const filtradas = solicitudes.filter((s) => s.estado === horasTab);
    const tabLabels = ["pendiente", "en_revision", "aprobada", "cerrada"];

    return (
      <View style={{ flex: 1 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ paddingHorizontal: 16, paddingTop: 12, maxHeight: 52 }}
          contentContainerStyle={{ gap: 8 }}
        >
          {tabLabels.map((t) => {
            const cnt = solicitudes.filter((s) => s.estado === t).length;
            const active = horasTab === t;
            return (
              <TouchableOpacity
                key={t}
                style={[
                  st.kanbanTab,
                  { borderColor: C.purpleBorder, backgroundColor: active ? C.purple : "transparent" },
                ]}
                onPress={() => setHorasTab(t)}
              >
                <Text style={{ color: active ? "#fff" : C.purple, fontSize: 12, fontWeight: "600" }}>
                  {t.charAt(0).toUpperCase() + t.slice(1).replace("_", " ")} ({cnt})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loadingHoras ? (
          <ActivityIndicator color={C.purple} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView contentContainerStyle={st.scroll}>
            {filtradas.length === 0 ? (
              <View style={[st.emptyCard, { backgroundColor: C.surface, borderColor: C.purpleBorder }]}>
                <Ionicons name="time-outline" size={36} color={C.muted} />
                <Text style={[st.emptyText, { color: C.muted }]}>
                  No hay solicitudes en esta etapa.
                </Text>
              </View>
            ) : (
              filtradas.map((s) => (
                <View key={s.id} style={[st.solicitudCard, { backgroundColor: C.surface, borderColor: C.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[{ color: C.text, fontWeight: "700", fontSize: 14 }]}>
                      {s.universidades?.nombre ?? "Universidad"}
                    </Text>
                    <Text style={[{ color: C.muted, fontSize: 12 }]}>
                      {s.grupos?.nombre_grupo ?? "Grupo"} · {s.grupos?.especialidad ?? ""}
                    </Text>
                    <Text style={[{ color: C.muted, fontSize: 11, marginTop: 2 }]}>
                      {s.grupos?.horas_requeridas ?? "?"} horas requeridas
                    </Text>
                    {s.fecha_inicio && (
                      <Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
                        {fmtDate(s.fecha_inicio)} – {s.fecha_fin ? fmtDate(s.fecha_fin) : "—"}
                      </Text>
                    )}
                  </View>
                  <View style={{ gap: 6 }}>
                    {s.estado === "pendiente" && (
                      <>
                        <TouchableOpacity
                          style={[st.smallBtn, { backgroundColor: C.green }]}
                          onPress={() => aprobarSolicitud(s.id)}
                        >
                          <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>Aprobar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[st.smallBtn, { backgroundColor: C.purpleDim, borderColor: C.purpleBorder, borderWidth: 1 }]}
                          onPress={async () => {
                            await supabase
                              .from("solicitudes_horas")
                              .update({ estado: "en_revision" })
                              .eq("id", s.id);
                            setSolicitudes((p) => p.map((x) => x.id === s.id ? { ...x, estado: "en_revision" } : x));
                            toast("Solicitud en revisión.", "info");
                          }}
                        >
                          <Text style={{ color: C.purple, fontSize: 11, fontWeight: "700" }}>Revisar</Text>
                        </TouchableOpacity>
                      </>
                    )}
                    {s.estado === "aprobada" && (
                      <TouchableOpacity
                        style={[st.smallBtn, { backgroundColor: C.purple }]}
                        onPress={() => {
                          setEvalGrupoId(s.grupo_id ?? "");
                          setEvalEstudiante({ id: s.grupo_id, nombre: s.grupos?.nombre_grupo });
                          setShowEvalModal(true);
                        }}
                      >
                        <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>Evaluar</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        )}
      </View>
    );
  };

  // ── Sección MI PERFIL ─────────────────────────────────────────────────────

  const renderPerfil = () => (
    <ScrollView contentContainerStyle={st.scroll}>
      {/* Logo */}
      <View style={[st.perfilHeader, { backgroundColor: C.surface, borderColor: C.border }]}>
        <TouchableOpacity onPress={cambiarLogo} style={[st.logoWrap, { width: 72, height: 72 }]}>
          {uploadingLogo ? (
            <ActivityIndicator color={C.purple} />
          ) : empresa?.foto_logo ? (
            <Image source={{ uri: empresa.foto_logo }} style={{ width: 72, height: 72, borderRadius: 12 }} />
          ) : (
            <Ionicons name="business-outline" size={32} color={C.purple} />
          )}
          <View style={[st.editBadge, { backgroundColor: C.purple }]}>
            <Ionicons name="camera-outline" size={10} color="#fff" />
          </View>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[{ color: C.text, fontWeight: "700", fontSize: 16 }]}>{empresa?.nombre ?? "Mi Empresa"}</Text>
          <Text style={[{ color: C.muted, fontSize: 12 }]}>{empresa?.industria ?? "—"}</Text>
        </View>
      </View>

      {/* Campos de edición */}
      {[
        { label: "Nombre de la empresa", val: editNombre, set: setEditNombre },
        { label: "Descripción", val: editDesc, set: setEditDesc, multi: true },
        { label: "Teléfono", val: editTel, set: setEditTel, kb: "phone-pad" as const },
        { label: "Email corporativo", val: editEmail, set: setEditEmail, kb: "email-address" as const },
        { label: "Sitio web", val: editWeb, set: setEditWeb, kb: "url" as const },
        { label: "Instagram", val: editInst, set: setEditInst },
        { label: "Facebook", val: editFacebook, set: setEditFacebook },
        { label: "Departamento", val: editDep, set: setEditDep },
        { label: "Ciudad", val: editCiudad, set: setEditCiudad },
        { label: "Dirección", val: editDireccion, set: setEditDireccion },
      ].map((f) => (
        <View key={f.label} style={{ marginBottom: 14 }}>
          <Text style={[st.inputLabel, { color: C.muted }]}>{f.label}</Text>
          <TextInput
            style={[
              st.input,
              { color: C.text, backgroundColor: C.card, borderColor: C.border },
              f.multi && { height: 80, textAlignVertical: "top" },
            ]}
            value={f.val}
            onChangeText={f.set}
            multiline={f.multi}
            keyboardType={f.kb ?? "default"}
            placeholderTextColor={C.muted}
          />
        </View>
      ))}

      <TouchableOpacity
        style={[st.createBtn, { backgroundColor: savingPerfil ? C.muted : C.purple }]}
        onPress={guardarPerfil}
        disabled={savingPerfil}
      >
        {savingPerfil ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
            <Text style={st.createBtnText}>Guardar cambios</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );

  // ── Estrellas helper ──────────────────────────────────────────────────────

  const Stars = ({ val, set }: { val: number; set: (n: number) => void }) => (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity key={n} onPress={() => set(n)}>
          <Ionicons
            name={n <= val ? "star" : "star-outline"}
            size={26}
            color={n <= val ? "#f59e0b" : C.muted}
          />
        </TouchableOpacity>
      ))}
    </View>
  );

  // ── Loading screen ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={[st.root, { backgroundColor: C.bg, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={C.purple} />
        <Text style={[{ color: C.muted, marginTop: 12, fontSize: 13 }]}>
          Cargando datos...
        </Text>
      </SafeAreaView>
    );
  }

  // ── Render principal ──────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[st.root, { backgroundColor: C.bg }]}>
      {/* Header universal */}
      <UniversalHeader
        userName={empresa?.nombre ?? "Empresa"}
        userSubtitle={empresa?.industria ?? empresa?.sector ?? "Empresa"}
        profilePhotoUrl={empresa?.foto_logo ?? null}
        userId={userId}
      />

      {/* Contenido */}
      <View style={{ flex: 1 }}>
        {tab === "inicio" && renderInicio()}
        {tab === "vacantes" && renderVacantes()}
        {tab === "candidatos" && renderCandidatos()}
        {tab === "horas" && renderHoras()}
        {tab === "perfil" && renderPerfil()}
      </View>

      {/* Bottom nav */}
      <View style={[st.bottomNav, { backgroundColor: C.surface, borderTopColor: C.border }]}>
        {NAV.map((item) => {
          const active = tab === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={st.navItem}
              onPress={() => setTab(item.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={item.icon as any}
                size={22}
                color={active ? C.purple : C.muted}
              />
              <Text
                style={{
                  fontSize: 10,
                  marginTop: 3,
                  color: active ? C.purple : C.muted,
                  fontWeight: active ? "700" : "400",
                }}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Modal Crear Vacante ── */}
      <Modal
        visible={showVacanteModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowVacanteModal(false)}
      >
        <View style={st.modalOverlay}>
          <View style={[st.modalSheet, { backgroundColor: C.surface, borderTopColor: C.border }]}>
            <View style={[st.modalHeader, { borderBottomColor: C.border }]}>
              <Text style={[st.modalTitle, { color: C.text }]}>
                Nueva vacante — Paso {vacanteStep} de 3
              </Text>
              <TouchableOpacity onPress={() => setShowVacanteModal(false)}>
                <Ionicons name="close" size={22} color={C.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 16 }}>
              {vacanteStep === 1 && (
                <View>
                  <Text style={[st.inputLabel, { color: C.muted }]}>Título del puesto *</Text>
                  <TextInput value={formTitulo} onChangeText={setFormTitulo} style={[st.input, { color: C.text, backgroundColor: C.card, borderColor: C.border }]} placeholder="Ej: Desarrollador Frontend React" placeholderTextColor={C.muted} />

                  <Text style={[st.inputLabel, { color: C.muted }]}>Área profesional *</Text>
                  <TextInput value={formArea} onChangeText={setFormArea} style={[st.input, { color: C.text, backgroundColor: C.card, borderColor: C.border }]} placeholder="Ej: Tecnología / Ingeniería" placeholderTextColor={C.muted} />

                  <Text style={[st.inputLabel, { color: C.muted }]}>Descripción *</Text>
                  <TextInput value={formDesc} onChangeText={setFormDesc} style={[st.input, { height: 90, color: C.text, backgroundColor: C.card, borderColor: C.border }]} multiline placeholder="Responsabilidades y requisitos..." placeholderTextColor={C.muted} />
                </View>
              )}

              {vacanteStep === 2 && (
                <View>
                  <Text style={[st.inputLabel, { color: C.muted }]}>Modalidad</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                    {["presencial", "remoto", "hibrido"].map((m) => (
                      <TouchableOpacity
                        key={m}
                        style={[st.chip, { borderColor: C.purpleBorder, backgroundColor: formModalidad === m ? C.purple : C.card }]}
                        onPress={() => setFormModalidad(m)}
                      >
                        <Text style={{ color: formModalidad === m ? "#fff" : C.muted, fontSize: 12 }}>
                          {m.toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={[st.inputLabel, { color: C.muted }]}>Tipo de contrato</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {["tiempo_completo", "medio_tiempo", "pasantia", "freelance"].map((t) => (
                      <TouchableOpacity
                        key={t}
                        style={[st.chip, { borderColor: C.purpleBorder, backgroundColor: formTipo === t ? C.purple : C.card }]}
                        onPress={() => setFormTipo(t)}
                      >
                        <Text style={{ color: formTipo === t ? "#fff" : C.muted, fontSize: 12 }}>
                          {t.replace("_", " ").toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {vacanteStep === 3 && (
                <View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <Text style={[st.inputLabel, { color: C.muted }]}>Mostrar salario</Text>
                    <Switch
                      value={formMostrarSal}
                      onValueChange={setFormMostrarSal}
                      trackColor={{ false: C.card, true: C.purple }}
                    />
                  </View>
                  <Text style={[st.inputLabel, { color: C.muted }]}>Salario mínimo (USD, opcional)</Text>
                  <TextInput value={formSalMin} onChangeText={(t) => setFormSalMin(t.replace(/[^0-9.]/g, ""))} keyboardType="numeric" style={[st.input, { color: C.text, backgroundColor: C.card, borderColor: C.border }]} placeholder="Ej: 400" placeholderTextColor={C.muted} />
                  <Text style={[st.inputLabel, { color: C.muted }]}>Salario máximo (USD, opcional)</Text>
                  <TextInput value={formSalMax} onChangeText={(t) => setFormSalMax(t.replace(/[^0-9.]/g, ""))} keyboardType="numeric" style={[st.input, { color: C.text, backgroundColor: C.card, borderColor: C.border }]} placeholder="Ej: 800" placeholderTextColor={C.muted} />
                </View>
              )}
            </ScrollView>

            <View style={[st.modalFooter, { borderTopColor: C.border, backgroundColor: C.card }]}>
              {vacanteStep > 1 ? (
                <TouchableOpacity style={[st.btnSec, { borderColor: C.border }]} onPress={() => setVacanteStep((p) => (p - 1) as any)}>
                  <Text style={[{ color: C.text, fontWeight: "600", fontSize: 14 }]}>← Atrás</Text>
                </TouchableOpacity>
              ) : <View />}

              {vacanteStep < 3 ? (
                <TouchableOpacity style={[st.btnPri, { backgroundColor: C.purple }]} onPress={() => setVacanteStep((p) => (p + 1) as any)}>
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Siguiente →</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[st.btnPri, { backgroundColor: savingVacante ? C.muted : C.green }]}
                  onPress={guardarVacante}
                  disabled={savingVacante}
                >
                  {savingVacante ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Publicar vacante</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal Detalle Vacante ── */}
      <Modal
        visible={showVacanteDetail && !!selectedVacante}
        animationType="slide"
        transparent
        onRequestClose={() => setShowVacanteDetail(false)}
      >
        <View style={st.modalOverlay}>
          <View style={[st.modalSheet, { backgroundColor: C.surface, borderTopColor: C.border }]}>
            <View style={[st.modalHeader, { borderBottomColor: C.border }]}>
              <Text style={[st.modalTitle, { color: C.text }]} numberOfLines={1}>
                {selectedVacante?.titulo}
              </Text>
              <TouchableOpacity onPress={() => setShowVacanteDetail(false)}>
                <Ionicons name="close" size={22} color={C.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 16 }}>
              <Text style={[{ color: C.muted, fontSize: 12, marginBottom: 8 }]}>
                {selectedVacante?.area} · {selectedVacante?.modalidad?.toUpperCase()} · {selectedVacante?.tipo?.replace("_", " ").toUpperCase()}
              </Text>
              {selectedVacante?.mostrar_salario && selectedVacante.salario_min && (
                <Text style={[{ color: C.green, fontWeight: "700", marginBottom: 12 }]}>
                  ${selectedVacante.salario_min} – ${selectedVacante.salario_max} USD/mes
                </Text>
              )}
              <Text style={[{ color: C.text, fontSize: 14, lineHeight: 20 }]}>
                {selectedVacante?.descripcion}
              </Text>
            </ScrollView>
            {selectedVacante?.estado === "activa" && (
              <View style={{ padding: 16 }}>
                <TouchableOpacity
                  style={[st.btnPri, { backgroundColor: C.red }]}
                  onPress={() => { setShowVacanteDetail(false); cerrarVacante(selectedVacante.id); }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700" }}>Cerrar vacante</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Modal Evaluación ── */}
      <Modal
        visible={showEvalModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowEvalModal(false)}
      >
        <View style={st.modalOverlay}>
          <View style={[st.modalSheet, { backgroundColor: C.surface, borderTopColor: C.border }]}>
            <View style={[st.modalHeader, { borderBottomColor: C.border }]}>
              <Text style={[st.modalTitle, { color: C.text }]}>Evaluar grupo</Text>
              <TouchableOpacity onPress={() => setShowEvalModal(false)}>
                <Ionicons name="close" size={22} color={C.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 16 }}>
              {[
                { label: "Puntualidad", val: evalPuntualidad, set: setEvalPuntualidad },
                { label: "Disciplina", val: evalDisciplina, set: setEvalDisciplina },
                { label: "Responsabilidad", val: evalResponsabilidad, set: setEvalResponsabilidad },
                { label: "Respeto", val: evalRespeto, set: setEvalRespeto },
                { label: "Desempeño", val: evalDesempeno, set: setEvalDesempeno },
              ].map((cr) => (
                <View key={cr.label} style={{ marginBottom: 16 }}>
                  <Text style={[{ color: C.text, fontWeight: "600", marginBottom: 6 }]}>{cr.label}</Text>
                  <Stars val={cr.val} set={cr.set} />
                </View>
              ))}
              <Text style={[{ color: C.muted, fontSize: 13, marginBottom: 6 }]}>Comentario (opcional)</Text>
              <TextInput
                value={evalComentario}
                onChangeText={setEvalComentario}
                style={[st.input, { height: 80, color: C.text, backgroundColor: C.card, borderColor: C.border }]}
                multiline
                placeholder="Observaciones generales..."
                placeholderTextColor={C.muted}
              />
            </ScrollView>
            <View style={{ padding: 16 }}>
              <TouchableOpacity
                style={[st.btnPri, { backgroundColor: savingEval ? C.muted : C.purple }]}
                onPress={guardarEvaluacion}
                disabled={savingEval}
              >
                {savingEval ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "700" }}>Guardar evaluación</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Toasts ── */}
      <View style={st.toastContainer} pointerEvents="none">
        {toasts.map((t) => (
          <View
            key={t.id}
            style={[
              st.toast,
              {
                backgroundColor:
                  t.type === "ok"
                    ? C.greenBg
                    : t.type === "err"
                    ? C.redBg
                    : C.purpleDim,
                borderColor:
                  t.type === "ok"
                    ? C.greenBorder
                    : t.type === "err"
                    ? C.red
                    : C.purpleBorder,
              },
            ]}
          >
            <Ionicons
              name={
                t.type === "ok"
                  ? "checkmark-circle-outline"
                  : t.type === "err"
                  ? "alert-circle-outline"
                  : "information-circle-outline"
              }
              size={16}
              color={
                t.type === "ok" ? C.green : t.type === "err" ? C.red : C.purple
              }
            />
            <Text
              style={{
                color: t.type === "ok" ? C.green : t.type === "err" ? C.red : C.purple,
                fontSize: 13,
                flex: 1,
              }}
            >
              {t.msg}
            </Text>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32 },

  // Banner empresa
  empresaBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  logoWrap: {
    width: 52,
    height: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
  },
  logoImg: { width: "100%", height: "100%" },
  editBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  empresaNombre: { fontSize: 16, fontWeight: "700" },
  empresaSector: { fontSize: 12, marginTop: 2 },

  // Labels de sección
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginBottom: 10, marginTop: 6 },

  // Métricas
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  metCard: {
    width: "47%",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    gap: 4,
  },
  metVal: { fontSize: 26, fontWeight: "800" },
  metLabel: { fontSize: 11, textAlign: "center" },

  // Quick actions
  quickActions: { flexDirection: "row", gap: 10, marginBottom: 16 },
  qaBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  qaBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  // Vacantes
  vacanteRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  vacanteCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  vacanteTitle: { fontSize: 14, fontWeight: "700" },
  vacanteSub: { fontSize: 12, marginTop: 2 },
  estadoBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },

  // Empty state
  emptyCard: {
    padding: 32,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  emptyText: { fontSize: 13, textAlign: "center" },

  // Crear btn
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  createBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  // Candidatos
  kanbanTab: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  candCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  candAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },

  // Horas sociales
  solicitudCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  smallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: "center",
  },

  // Perfil
  perfilHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 20,
  },

  // Inputs
  inputLabel: { fontSize: 12, marginBottom: 5, fontWeight: "500" },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 11,
    fontSize: 14,
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },

  // Modales
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 16, fontWeight: "700", flex: 1, marginRight: 10 },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
    borderTopWidth: 1,
  },
  btnPri: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSec: {
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },

  // Bottom nav
  bottomNav: {
    flexDirection: "row",
    borderTopWidth: 1,
    paddingBottom: 8,
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    paddingTop: 10,
  },

  // Toasts
  toastContainer: {
    position: "absolute",
    bottom: 80,
    left: 16,
    right: 16,
    gap: 8,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
});
