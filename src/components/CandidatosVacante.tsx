import { Ionicons } from "@expo/vector-icons";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from "react-native";
import { AutoText as Text } from "./AutoText";
import { db } from "../config/firebaseConfig";
import { FONTS, useTheme, type GradlyColors } from "../context/ThemeContext";
import FechaPresentacionModal from "./FechaPresentacionModal";
import type { AsignacionCupo } from "../services/reclamoCuposService";

/** "2026-09-03" → "3 sep" (o "" si no parsea). */
function fechaCorta(iso?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? "").trim());
  if (!m) return "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("es-SV", { day: "numeric", month: "short" });
}

/**
 * Candidatos que ya ocupan un cupo de esta vacante, con conteo y lista.
 *
 * La fuente de datos depende de `categoria` porque son dos flujos de admisión
 * distintos en el sistema:
 *  - **'vacante'** (aplicación individual, graduados): el estudiante aplica
 *    solo y la empresa lo mueve por el Kanban → `aplicaciones` donde
 *    `vacante_id == X` y `estado == 'contratado'`.
 *  - **'pasantia'** (reparto de cupos): una universidad reclama cupos y el
 *    estudiante los toma desde su tablero → `asignaciones_cupo` donde
 *    `vacanteId == X` y `estado == 'tomado'`.
 *
 * ⚠️ Alcance conocido: una pasantía cuyo cupo se llenó por el matchmaking de
 * GRUPO COMPLETO (`aplicaciones_grupos`/`solicitudes_practicas`, sin pasar por
 * el reparto por lote) no aparece aquí — son sistemas de admisión distintos.
 * Si hace falta unificarlos, es un cambio aparte.
 */
export default function CandidatosVacante({
  vacanteId,
  empresaId,
  empresaNombre,
  categoria,
  cupos,
  onVerPerfil,
}: {
  vacanteId: string;
  /**
   * uid de la empresa dueña (= usuario autenticado que ve esta pantalla).
   * OBLIGATORIO para la consulta, no solo para narrarla: las reglas de
   * `aplicaciones`/`asignaciones_cupo` son un OR de igualdades por uid
   * (`empresa_id == request.auth.uid`, entre otras), y Firestore exige que la
   * consulta incluya un `where` que calce con esa rama — sin este filtro la
   * lectura falla con `permission-denied`, no solo devuelve de más.
   */
  empresaId: string;
  /** Nombre de la empresa dueña — para abrir el chat con el estudiante desde
   *  el modal de "primer día". */
  empresaNombre: string;
  categoria?: "pasantia" | "vacante";
  /** Total de cupos declarado. `null`/ausente = vacante legada, sin total conocido. */
  cupos?: number | null;
  onVerPerfil: (estudianteId: string) => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [cargando, setCargando] = useState(true);
  // Modal de "primer día" (solo para pasantías de cupo, que tienen asignación).
  const [asignSel, setAsignSel] = useState<AsignacionCupo | null>(null);

  useEffect(() => {
    if (!vacanteId || !empresaId) return;
    let cancelado = false;
    setCargando(true);

    // Caché local: varios candidatos suelen compartir universidad, así se
    // evita repetir la misma lectura de `perfiles_universidades`.
    const cacheUniversidad = new Map<string, string>();
    async function resolverUniversidad(uid?: string): Promise<string> {
      if (!uid) return "";
      if (cacheUniversidad.has(uid)) return cacheUniversidad.get(uid)!;
      try {
        const snap = await getDoc(doc(db, "perfiles_universidades", uid));
        const nombre = (snap.data() as any)?.nombre_universidad ?? "Universidad";
        cacheUniversidad.set(uid, nombre);
        return nombre;
      } catch {
        return "";
      }
    }

    async function armarCandidatos(entradas: { estudianteId: string; asignacion?: AsignacionCupo }[]) {
      // Dedup por estudianteId (por si acaso), conservando la asignación.
      const porId = new Map<string, AsignacionCupo | undefined>();
      for (const e of entradas) {
        if (e.estudianteId && !porId.has(e.estudianteId)) porId.set(e.estudianteId, e.asignacion);
      }
      const resueltos = await Promise.all(
        Array.from(porId.entries()).map(async ([id, asignacion]): Promise<Candidato | null> => {
          try {
            const snap = await getDoc(doc(db, "perfiles_estudiantes", id));
            if (!snap.exists()) return null;
            const d = snap.data() as any;
            return {
              estudianteId: id,
              nombre: d.nombre_completo || "Estudiante",
              correo: d.correo || "",
              // Ausente en cuentas creadas antes del onboarding de dirección
              // (OnboardingDireccionGate) — se muestra "Dirección no
              // especificada" hasta que el estudiante lo complete.
              departamento: d.departamento || "",
              // Fallback al campo legado para no perder la ubicación de
              // perfiles guardados antes del cambio de nombre municipio→distrito.
              distrito: d.distrito || d.municipio || "",
              universidadNombre: await resolverUniversidad(d.universidad_id),
              asignacion,
            };
          } catch {
            return null;
          }
        }),
      );
      if (!cancelado) {
        setCandidatos(resueltos.filter((c): c is Candidato => c !== null));
        setCargando(false);
      }
    }

    // Tres equality filters (sin orderBy) — no requiere índice compuesto,
    // mismo patrón que `postularGrupoAVacante` (universidadId+vacanteId) ya
    // usa. El filtro por empresaId/empresa_id es OBLIGATORIO para que la
    // regla de seguridad (OR de igualdades por uid) pueda validar la query.
    const q =
      categoria === "pasantia"
        ? query(
            collection(db, "asignaciones_cupo"),
            where("empresaId", "==", empresaId),
            where("vacanteId", "==", vacanteId),
            where("estado", "==", "tomado"),
          )
        : query(
            collection(db, "aplicaciones"),
            where("empresa_id", "==", empresaId),
            where("vacante_id", "==", vacanteId),
            where("estado", "==", "contratado"),
          );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const entradas =
          categoria === "pasantia"
            ? snap.docs.map((d) => ({
                estudianteId: (d.data() as any).estudianteId,
                asignacion: { id: d.id, ...d.data() } as AsignacionCupo,
              }))
            : snap.docs.map((d) => ({ estudianteId: (d.data() as any).estudiante_id }));
        void armarCandidatos(entradas);
      },
      () => {
        if (!cancelado) setCargando(false);
      },
    );

    return () => {
      cancelado = true;
      unsub();
    };
  }, [vacanteId, empresaId, categoria]);

  const total = typeof cupos === "number" && cupos > 0 ? cupos : null;

  if (cargando) {
    return (
      <View style={s.cargando}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  // Sin cupos y sin candidatos: nada que mostrar (evita una caja vacía).
  if (candidatos.length === 0 && total === null) return null;

  return (
    <View style={s.wrap}>
      <View style={s.contador}>
        <Ionicons name="people" size={16} color={colors.primaryLight} />
        <Text style={s.contadorTxt}>
          {total !== null
            ? `${candidatos.length}/${total} candidatos admitidos`
            : `${candidatos.length} candidato(s) admitido(s)`}
        </Text>
      </View>

      {candidatos.length === 0 ? (
        <Text style={s.vacio}>Todavía no hay candidatos admitidos.</Text>
      ) : (
        <View style={s.lista}>
          {candidatos.map((c) => {
            const primerDia = c.asignacion ? fechaCorta(c.asignacion.fechaPresentacion) : "";
            return (
              <TouchableOpacity
                key={c.estudianteId}
                style={s.fila}
                onPress={() => (c.asignacion ? setAsignSel(c.asignacion) : onVerPerfil(c.estudianteId))}
                activeOpacity={0.7}
              >
                <View style={s.avatarFallback}>
                  <Ionicons name="person" size={16} color={colors.primaryLight} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.nombre} numberOfLines={1}>{c.nombre}</Text>
                  {!!c.correo && (
                    <Text style={s.detalle} numberOfLines={1}>{c.correo}</Text>
                  )}
                  <Text style={s.detalle} numberOfLines={1}>
                    {c.departamento || c.distrito
                      ? [c.departamento, c.distrito].filter(Boolean).join(", ")
                      : "Dirección no especificada"}
                  </Text>
                  {!!c.universidadNombre && (
                    <Text style={s.universidad} numberOfLines={1} noTranslate>
                      {c.universidadNombre}
                    </Text>
                  )}
                  {!!c.asignacion && (
                    <Text style={[s.primerDia, primerDia && { color: colors.success }]}>
                      {primerDia ? `Primer día: ${primerDia}` : "Primer día: por definir"}
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <FechaPresentacionModal
        visible={!!asignSel}
        asignacion={asignSel}
        empresaId={empresaId}
        empresaNombre={empresaNombre}
        onClose={() => setAsignSel(null)}
        onVerPerfil={onVerPerfil}
      />
    </View>
  );
}

interface Candidato {
  estudianteId: string;
  nombre: string;
  correo: string;
  departamento: string;
  distrito: string;
  universidadNombre: string;
  /** Solo en pasantías de cupo: la asignación, para fijar su "primer día". */
  asignacion?: AsignacionCupo;
}

const makeStyles = (COLORS: GradlyColors) =>
  StyleSheet.create({
    wrap: { gap: 10, marginTop: 4 },
    cargando: { paddingVertical: 16, alignItems: "center" },
    contador: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      backgroundColor: COLORS.primary + "18",
      borderWidth: 1,
      borderColor: COLORS.primary + "40",
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    contadorTxt: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
    vacio: { fontSize: 12.5, color: COLORS.textMuted, fontStyle: "italic" },
    lista: { gap: 8 },
    fila: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: COLORS.backgroundCard,
      borderWidth: 1,
      borderColor: COLORS.border,
      borderRadius: 12,
      padding: 11,
    },
    avatarFallback: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: COLORS.primary + "22",
      alignItems: "center",
      justifyContent: "center",
    },
    nombre: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
    detalle: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 1 },
    universidad: { fontSize: 11.5, color: COLORS.primaryLight, marginTop: 2, fontFamily: FONTS.interSemiBold },
    primerDia: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 3, fontFamily: FONTS.interSemiBold },
  });
