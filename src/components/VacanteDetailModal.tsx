import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { doc, getDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,

  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../config/firebaseConfig";
import { AutoText, AutoText as Text } from "./AutoText";
import MapViewer from "./MapViewer";
import { cuposDisponibles, hayCupos, textoCupos, textoSalario } from "../utils/cupos";
import { afinidadCarreraVacante } from "../data/areas";
import { useTranslation } from "../context/TranslationContext";
import { textoHorario, type HorarioPasantia } from "../data/disponibilidad";

// Forma flexible de vacante para reutilizar el modal en varios dashboards.
export interface VacanteDetalle {
  id?: string;
  empresa_id?: string;
  nombre_empresa?: string;
  logo_empresa_url?: string;
  titulo?: string;
  descripcion?: string;
  modalidad?: string;
  tipo?: string;
  /** Granularidad de empleo (solo en tipo 'Vacante'): Tiempo completo/Medio tiempo/Por proyecto. */
  modalidad_contrato?: string;
  area?: string;
  horas_requeridas?: number;
  /** Rango salarial opcional (solo 'Vacante'). Informativo: se negocia fuera de Gradly. */
  salario_min?: number | null;
  salario_max?: number | null;
  /** Ausente = vacante legada, sin límite de cupos declarado. */
  /** Roles concretos dentro del área. */
  tags?: string[] | null;
  cupos?: number | null;
  cupos_reclamados?: number | null;
  contratados_count?: number | null;
  /** Horario declarado al publicar. Ausente = vacante legada. */
  horario?: HorarioPasantia | null;
  fecha_publicacion?: any;
  activa?: boolean;
  /** Derivados por Cloud Function (functions/src/aplicantes.ts). AUSENTES en
   *  vacantes anteriores a ese cambio y hasta que corra el backfill — por eso
   *  son opcionales y el render los trata como "no hay dato", no como cero. */
  aplicantes_count?: number;
  aplicantes_por_carrera?: Record<string, number>;
  ubicacion_coords?: { latitude: number; longitude: number } | null;
  ubicacion_texto?: { direccion?: string; municipio?: string; departamento?: string; pais?: string } | null;
  [key: string]: any;
}

interface Props {
  visible: boolean;
  vacante: VacanteDetalle | null;
  onClose: () => void;
  /**
   * Si se provee, muestra un botón primario "Contactar Empresa" (chat directo
   * estudiante↔empresa). Pensado para la vista de postulaciones activas del
   * estudiante. Sólo se renderiza cuando la vacante tiene `empresa_id`.
   */
  onContactarEmpresa?: () => void;
  /**
   * Carrera del estudiante que está mirando. Solo la manda el feed del
   * estudiante; los dashboards de empresa y universidad reutilizan este mismo
   * modal y no la pasan, así que todo el bloque de afinidad/competencia
   * simplemente no se dibuja para ellos.
   */
  carreraEstudiante?: string | null;
}

const C = {
  card: "#0d0b1e",
  border: "rgba(139,92,246,0.28)",
  text: "#f4f1ff",
  textSub: "rgba(255,255,255,0.66)",
  muted: "rgba(255,255,255,0.42)",
  purple: "#a78bfa",
  purpleDim: "rgba(139,92,246,0.14)",
  surface: "rgba(255,255,255,0.04)",
  green: "#22c55e",
  greenBg: "rgba(34,197,94,0.14)",
  redBg: "rgba(239,68,68,0.14)",
  red: "#f87171",
  closeBg: "rgba(255,255,255,0.08)",
};

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// "Publicado el 12 de Octubre, 2026"
function fechaLegible(ts: any): string {
  if (!ts) return "Fecha no disponible";
  const d: Date = ts?.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return "Fecha no disponible";
  return `Publicado el ${d.getDate()} de ${MESES[d.getMonth()]}, ${d.getFullYear()}`;
}

// Normaliza un enlace de red social a URL absoluta.
function normalizarUrl(v: string): string {
  const t = v.trim();
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

export default function VacanteDetailModal({
  visible, vacante, onClose, onContactarEmpresa, carreraEstudiante,
}: Props) {
  const { t } = useTranslation();
  const [empresa, setEmpresa] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !vacante?.empresa_id) {
      setEmpresa(null);
      return;
    }
    let activo = true;
    setLoading(true);
    getDoc(doc(db, "perfiles_empresas", vacante.empresa_id))
      .then((snap) => {
        if (activo) setEmpresa(snap.exists() ? snap.data() : null);
      })
      .catch(() => {
        if (activo) setEmpresa(null);
      })
      .finally(() => {
        if (activo) setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [visible, vacante?.empresa_id]);

  if (!vacante) return null;

  const activa = vacante.activa !== false;

  // ── Afinidad y competencia (solo cuando mira un estudiante) ─────────
  // `afinidadCarreraVacante` es el MISMO motor que ya ordena el feed: si aquí
  // se calculara distinto, el estudiante vería una vacante en los primeros
  // puestos de su lista y luego el detalle le diría que no es de su área.
  const afinidad = carreraEstudiante ? afinidadCarreraVacante(carreraEstudiante, vacante) : null;

  // `typeof === "number"` y no un `??`: la diferencia entre "esta vacante no
  // tiene postulantes" (0, un dato real) y "todavía no se ha contado nunca"
  // (undefined, en vacantes previas al contador) es justo lo que no se puede
  // perder — decir "0 postulantes" sobre una vacante con 30 sería mentir.
  const hayConteo = typeof vacante.aplicantes_count === "number";
  const totalAplicantes = vacante.aplicantes_count ?? 0;
  const misAfines = carreraEstudiante
    ? vacante.aplicantes_por_carrera?.[carreraEstudiante] ?? 0
    : 0;
  const libres = cuposDisponibles(vacante);
  const logo = vacante.logo_empresa_url || empresa?.logo_url || null;
  const industria = empresa?.industria ?? vacante.area ?? "";

  // Datos de contacto (en el perfil de la empresa).
  const correo = empresa?.contacto_correo || empresa?.correo || "";
  const telefono = empresa?.telefono || empresa?.contacto_telefono || "";
  const instagram = empresa?.instagram || "";
  const facebook = empresa?.facebook || "";
  const web = empresa?.sitio_web || "";

  const abrir = (url: string) => {
    if (!url) return;
    Linking.openURL(url).catch(() => {});
  };

  const contactos = [
    correo && { icon: "mail-outline", label: correo, url: `mailto:${correo}` },
    telefono && { icon: "call-outline", label: telefono, url: `tel:${telefono.replace(/\s/g, "")}` },
    web && { icon: "globe-outline", label: web, url: normalizarUrl(web) },
    instagram && { icon: "logo-instagram", label: "Instagram", url: normalizarUrl(instagram) },
    facebook && { icon: "logo-facebook", label: "Facebook", url: normalizarUrl(facebook) },
  ].filter(Boolean) as { icon: any; label: string; url: string }[];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <BlurView intensity={40} tint="dark" style={styles.overlay}>
        <View style={styles.card}>
          {/* Botón cerrar */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={20} color={C.text} />
          </TouchableOpacity>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 22, paddingTop: 26 }}>
            {/* Estado */}
            <View style={[styles.estadoBadge, { backgroundColor: activa ? C.greenBg : C.redBg }]}>
              <View style={[styles.dot, { backgroundColor: activa ? C.green : C.red }]} />
              <Text style={[styles.estadoText, { color: activa ? C.green : C.red }]}>
                {activa ? "Vacante activa" : "Vacante inactiva"}
              </Text>
            </View>

            {/* Título */}
            <AutoText style={styles.titulo}>{vacante.titulo ?? "Vacante"}</AutoText>
            <Text style={styles.fecha}>{fechaLegible(vacante.fecha_publicacion)}</Text>

            {/* Chips */}
            <View style={styles.chipsRow}>
              {[vacante.tipo, vacante.modalidad_contrato, vacante.modalidad, vacante.area].filter(Boolean).map((c, i) => (
                <View key={i} style={styles.chip}>
                  <AutoText style={styles.chipText}>{String(c)}</AutoText>
                </View>
              ))}
              {/* Roles concretos dentro del área (p. ej. "Desarrollo web"). */}
              {(vacante.tags ?? []).map((t, i) => (
                <View key={`tag-${i}`} style={[styles.chip, styles.chipTag]}>
                  <AutoText style={styles.chipText}>{t}</AutoText>
                </View>
              ))}
              {!!vacante.horas_requeridas && (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>{vacante.horas_requeridas}h</Text>
                </View>
              )}
              {/* Cupos: ausente en vacantes legadas; sin cupos se resalta en rojo. */}
              {textoCupos(vacante) && (
                <View style={[styles.chip, !hayCupos(vacante) && styles.chipAgotado]}>
                  <Text style={[styles.chipText, !hayCupos(vacante) && styles.chipTextAgotado]}>
                    {textoCupos(vacante)}
                  </Text>
                </View>
              )}
            </View>

            {/* ── ¿Encaja conmigo y contra cuántos compito? ──
                Solo para el estudiante (ver la prop `carreraEstudiante`). */}
            {!!afinidad && (
              <View style={styles.afinidadBox}>
                <View style={styles.afinidadFila}>
                  {/* Tres estados, no dos: `afinidadCarreraVacante` devuelve
                      también "ninguna", y tratarla como "posible" le diría al
                      estudiante que una vacante de Salud "podría encajar" con
                      Contaduría. Se dice lo que es. */}
                  <Ionicons
                    name={
                      afinidad === "alta" ? "checkmark-circle"
                      : afinidad === "posible" ? "help-circle-outline"
                      : "remove-circle-outline"
                    }
                    size={17}
                    color={
                      afinidad === "alta" ? C.green
                      : afinidad === "posible" ? C.purple
                      : C.muted
                    }
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.afinidadTitulo}>
                      {afinidad === "alta" ? t("vac_afin_alta")
                        : afinidad === "posible" ? t("vac_afin_posible")
                        : t("vac_afin_ninguna")}
                    </Text>
                    <Text style={styles.afinidadSub} noTranslate>{carreraEstudiante}</Text>
                  </View>
                </View>

                {hayConteo && (
                  <View style={styles.competenciaFila}>
                    <Ionicons name="people-outline" size={15} color={C.muted} />
                    <Text style={styles.competenciaTxt}>
                      {[
                        t("vac_postulantes", { n: totalAplicantes }),
                        misAfines > 0 ? t("vac_postulantes_carrera", { n: misAfines }) : null,
                        libres !== null && libres > 0 ? t("vac_cupos_libres", { n: libres }) : null,
                      ].filter(Boolean).join("  ·  ")}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Horario declarado por la empresa (ausente en vacantes legadas) */}
            {textoHorario(vacante.horario) && (
              <View style={styles.horarioBox}>
                <Text style={styles.horarioLabel}>Horario</Text>
                <Text style={styles.horarioValor}>{textoHorario(vacante.horario)}</Text>
              </View>
            )}

            {/* Rango salarial (opcional, solo 'Vacante'): informativo, con nota
                de que la negociación final ocurre fuera de Gradly. */}
            {textoSalario(vacante.salario_min, vacante.salario_max) && (
              <View style={styles.horarioBox}>
                <Text style={styles.horarioLabel}>Salario estimado</Text>
                <Text style={styles.horarioValor}>
                  {textoSalario(vacante.salario_min, vacante.salario_max)}
                </Text>
                <View style={styles.salarioNota}>
                  <Ionicons name="information-circle-outline" size={14} color={C.muted} />
                  <Text style={styles.salarioNotaTxt}>
                    Informativo. La negociación final se realiza de forma privada entre la
                    empresa y el postulante, fuera de Gradly.
                  </Text>
                </View>
              </View>
            )}

            {/* Ubicación de la plaza (solo lectura) */}
            {vacante.ubicacion_coords && vacante.ubicacion_texto && (
              <View style={styles.mapSection}>
                <Text style={styles.mapTitle}>Ubicación de la Plaza</Text>
                <Text style={styles.mapAddress}>
                  {[vacante.ubicacion_texto.municipio, vacante.ubicacion_texto.departamento]
                    .filter(Boolean)
                    .join(", ") || vacante.ubicacion_texto.direccion || "El Salvador"}
                </Text>
                <View style={styles.mapBox}>
                  <MapViewer
                    mapRegion={{ ...vacante.ubicacion_coords, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
                    markerPos={vacante.ubicacion_coords}
                  />
                </View>
              </View>
            )}

            {/* Descripción */}
            {!!vacante.descripcion && (
              <View style={styles.section}>
                <AutoText style={styles.sectionLabel}>Descripción</AutoText>
                <AutoText style={styles.bodyText}>{vacante.descripcion}</AutoText>
              </View>
            )}

            {/* Empresa */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Empresa</Text>
              <View style={styles.empresaRow}>
                <View style={styles.logoWrap}>
                  {logo ? (
                    <Image source={{ uri: logo }} style={styles.logo} resizeMode="cover" />
                  ) : (
                    <Ionicons name="business-outline" size={26} color={C.purple} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.empresaNombre} numberOfLines={1}>
                    {vacante.nombre_empresa ?? empresa?.nombre_empresa ?? "Empresa"}
                  </Text>
                  {!!industria && <Text style={styles.empresaMeta} numberOfLines={1}>{industria}</Text>}
                </View>
                {empresa?.verificado && (
                  <Ionicons name="checkmark-circle" size={18} color={C.purple} />
                )}
              </View>

              {/* Contactar a la empresa por chat directo (postulaciones activas) */}
              {onContactarEmpresa && vacante.empresa_id ? (
                <TouchableOpacity
                  style={styles.contactarBtn}
                  activeOpacity={0.85}
                  onPress={onContactarEmpresa}
                >
                  <Ionicons name="chatbubble-outline" size={18} color="#fff" />
                  <Text style={styles.contactarBtnText}>Contactar Empresa</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Contacto */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Contacto de la Empresa</Text>
              {loading ? (
                <ActivityIndicator color={C.purple} style={{ marginVertical: 12 }} />
              ) : contactos.length === 0 ? (
                <Text style={styles.bodyText}>Sin información de contacto disponible.</Text>
              ) : (
                contactos.map((c, i) => (
                  <TouchableOpacity key={i} style={styles.contactRow} onPress={() => abrir(c.url)} activeOpacity={0.7}>
                    <View style={styles.contactIcon}>
                      <Ionicons name={c.icon} size={16} color={C.purple} />
                    </View>
                    <Text style={styles.contactText} numberOfLines={1}>{c.label}</Text>
                    <Ionicons name="open-outline" size={15} color={C.muted} />
                  </TouchableOpacity>
                ))
              )}
            </View>
          </ScrollView>
        </View>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(7,5,15,0.55)",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    maxHeight: "86%",
    overflow: "hidden",
  },
  closeBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.closeBg,
    alignItems: "center",
    justifyContent: "center",
  },
  estadoBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 12,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  estadoText: { fontSize: 12, fontWeight: "700" },
  titulo: { fontSize: 22, fontWeight: "800", color: C.text, lineHeight: 28 },
  fecha: { fontSize: 13, color: C.muted, marginTop: 6 },
  afinidadBox: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    padding: 13,
    gap: 10,
  },
  afinidadFila: { flexDirection: "row", alignItems: "center", gap: 9 },
  afinidadTitulo: { fontSize: 13.5, fontWeight: "700", color: C.text },
  afinidadSub: { fontSize: 12, color: C.textSub, marginTop: 1 },
  competenciaFila: {
    flexDirection: "row", alignItems: "center", gap: 7,
    borderTopWidth: 1, borderTopColor: C.border, paddingTop: 9,
  },
  competenciaTxt: { flex: 1, fontSize: 12, color: C.textSub },
  horarioBox: {
    marginTop: 16,
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  horarioLabel: { fontSize: 11.5, color: C.muted, marginBottom: 3 },
  horarioValor: { fontSize: 14, color: C.text, fontWeight: "700" },
  salarioNota: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 8 },
  salarioNotaTxt: { flex: 1, fontSize: 11, color: C.muted, lineHeight: 15 },
  chipTag: { backgroundColor: C.surface },
  chipAgotado: { backgroundColor: C.redBg, borderColor: C.red },
  chipTextAgotado: { color: C.red },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  chip: {
    backgroundColor: C.purpleDim,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipText: { fontSize: 12, color: C.purple, fontWeight: "600" },
  mapSection: {
    marginTop: 20,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "rgba(26,22,43,0.55)",
    borderWidth: 1,
    borderColor: C.border,
  },
  mapTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: C.purple,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  mapAddress: { fontSize: 14, color: C.text, fontWeight: "600", marginBottom: 12 },
  mapBox: { height: 200, width: "100%", borderRadius: 12, overflow: "hidden" },
  section: { marginTop: 20 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: C.purple,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  bodyText: { fontSize: 14, color: C.textSub, lineHeight: 21 },
  empresaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  logoWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: C.purpleDim,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logo: { width: "100%", height: "100%" },
  empresaNombre: { fontSize: 15, fontWeight: "700", color: C.text },
  empresaMeta: { fontSize: 12, color: C.textSub, marginTop: 2 },
  contactarBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
    backgroundColor: C.purple,
    borderRadius: 14,
    paddingVertical: 14,
  },
  contactarBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 8,
  },
  contactIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.purpleDim,
    alignItems: "center",
    justifyContent: "center",
  },
  contactText: { flex: 1, fontSize: 14, color: C.text },
});
