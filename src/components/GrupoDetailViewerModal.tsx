/**
 * GrupoDetailViewerModal — "micro sección" con el detalle de un grupo,
 * al estilo de `ProfileViewerModal` (se abre solo con un id y se autocarga).
 *
 * Pensado para tocar el nombre de un grupo desde cualquier parte de la app
 * (notificaciones, postulaciones, reclamos de cupos): universidad que lo
 * creó, carrera, categoría/área, horas a cumplir, listado de miembros (cada
 * uno abre su perfil) y si el grupo ya tiene una alianza activa con alguna
 * empresa.
 */

// ════════════════════════════════════════════════════════════════════════
// GUÍA PARA PRINCIPIANTES:
// Comparte el mismo "esqueleto" visual que ReclamoDetailModal.tsx y
// AplicacionGrupoDetailModal.tsx (header con botón atrás, hero, secciones
// con InfoRow, filas tocables que abren perfiles), pero su carga de datos
// es la MÁS COMPLEJA de los 3: en vez de leer un solo documento, dispara
// VARIAS lecturas relacionadas EN PARALELO (universidad dueña del grupo,
// TODOS los estudiantes miembros del grupo, y si el grupo ya está en una
// pasantía activa, la empresa aliada) — es un buen ejemplo del patrón
// "varias tareas asíncronas independientes, junta sus resultados al
// final con Promise.all, y que si UNA falla no tumbe a las demás".
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AutoText as Text } from './AutoText';
import { db } from '../config/firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { areasDeCarrera } from '../data/areas';
// Función utilitaria: dado el nombre de una carrera, devuelve una lista
// de "áreas"/categorías asociadas (por ejemplo, "Ingeniería en Sistemas"
// podría mapear a ["Tecnología", "Desarrollo de software"]) — se usa para
// mostrar los "chips" de categoría del grupo.
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import ProfileViewerModal, { type ProfileTipo } from './ProfileViewerModal';

interface Props {
  visible: boolean;
  grupoId: string | null;
  onClose: () => void;
}

interface MiembroGrupo {
  // La forma "limpia" de cada estudiante miembro del grupo, ya lista para
  // dibujar en la lista de miembros.
  id: string;
  nombre: string;
  carrera: string;
  horasAprobadas: number;
  horasObjetivo: number;
}

interface GrupoInfo {
  // La forma "limpia" del documento del grupo, ya con nombres de
  // propiedad en camelCase (el documento crudo de Firestore usa
  // snake_case para varios campos, como `universidad_id`) y con valores
  // de respaldo ya resueltos.
  nombre: string;
  carrera: string;
  universidadId: string;
  horas: number | null;
  egresado: boolean;
  pasantiaActivaId: string | null;
}

export default function GrupoDetailViewerModal({ visible, grupoId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user, rol } = useAuth();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [grupo, setGrupo] = useState<GrupoInfo | null>(null);
  const [universidadNombre, setUniversidadNombre] = useState('');
  const [miembros, setMiembros] = useState<MiembroGrupo[]>([]);
  const [empresaAliadaNombre, setEmpresaAliadaNombre] = useState<string | null>(null);
  const [empresaAliadaId, setEmpresaAliadaId] = useState<string | null>(null);
  // 5 estados de datos distintos (a diferencia de los otros 2 modales,
  // que solo tenían 1-2) — reflejo directo de que aquí se combinan varias
  // fuentes de información sobre el mismo grupo.

  const [perfil, setPerfil] = useState<{ tipo: ProfileTipo; id: string } | null>(null);
  // Este modal solo abre UN tipo de modal "nieto" (ProfileViewerModal,
  // para ver el perfil de la universidad, la empresa aliada, o cualquier
  // estudiante miembro) — no abre otros GrupoDetailViewerModal ni
  // VacanteDetailByIdModal.

  useEffect(() => {
    if (!visible || !grupoId) return;
    let cancel = false;
    setLoading(true);
    setGrupo(null);
    setUniversidadNombre('');
    setMiembros([]);
    setEmpresaAliadaNombre(null);
    setEmpresaAliadaId(null);

    (async () => {
      try {
        const grupoSnap = await getDoc(doc(db, 'grupos', grupoId));
        // READ principal: el documento del grupo. Las lecturas SIGUIENTES
        // (universidad, miembros, empresa aliada) dependen de datos que
        // salen de ESTA primera lectura (el universidadId, por ejemplo),
        // así que no pueden dispararse en paralelo con esta — pero SÍ se
        // disparan en paralelo ENTRE ELLAS, una vez que ya se tiene el
        // documento del grupo (ver el array `tareas` más abajo).
        if (cancel) return;
        if (!grupoSnap.exists()) { setGrupo(null); return; }
        const g = grupoSnap.data() as any;

        const info: GrupoInfo = {
          nombre: g.nombre ?? 'Grupo',
          carrera: g.carrera ?? '',
          universidadId: g.universidad_id ?? '',
          horas: g.total_horas ?? g.horasRequeridas ?? null,
          // Dos posibles nombres de campo para las horas totales
          // (`total_horas` es el más común en el proyecto,
          // `horasRequeridas` un respaldo por si el documento viniera de
          // otro flujo que usara ese nombre) — si ninguno existe, `null`.
          egresado: g.egresado === true,
          // "=== true" en vez de solo "g.egresado": esto convierte
          // CUALQUIER valor (incluso undefined) a un booleano estricto:
          // solo es true si el campo es LITERALMENTE `true`, nunca por
          // accidente con un valor "truthy" inesperado.
          pasantiaActivaId: g.pasantia_activa_id ?? null,
          // Este es el mismo "candado" que vimos en pasantiaService.ts
          // (respuestaFinalUniversidad): si el grupo tiene este campo con
          // un valor, significa que está comprometido con una pasantía
          // en curso.
        };
        setGrupo(info);

        const tareas: Promise<void>[] = [];
        // Un array donde se van ACUMULANDO promesas (tareas asíncronas
        // independientes) para ejecutarlas todas en paralelo al final con
        // Promise.all — en vez de hacer "await" de cada una en secuencia,
        // lo cual sería más lento.

        if (info.universidadId) {
          tareas.push(
            getDoc(doc(db, 'perfiles_universidades', info.universidadId)).then(u => {
              if (!cancel && u.exists()) setUniversidadNombre((u.data() as any).nombre_universidad ?? '');
            }).catch(() => { /* best-effort */ }),
            // "best-effort" (mejor esfuerzo): si esta lectura falla (por
            // ejemplo, por reglas de seguridad de Firestore que no
            // permiten a este usuario ver ese perfil), el error se
            // IGNORA en silencio — el resto del modal sigue funcionando,
            // solo que el nombre de la universidad quedará vacío.
          );
        }

        // READ: busca TODOS los estudiantes cuyo campo `grupo_id` coincida con
        // este grupo — así se arma la lista de miembros sin depender de que el
        // documento del grupo guarde una lista de ids (evita mantener 2 lugares
        // sincronizados con la misma información).
        //
        // Las reglas de `perfiles_estudiantes` dejan a una universidad leer
        // SOLO a sus propios alumnos (`universidad_id == uid`), así que una
        // query filtrada únicamente por `grupo_id` Firestore la rechaza ENTERA
        // para ese rol (no puede probar que todos los resultados sean visibles)
        // y la lista salía siempre vacía al abrir el modal desde la
        // notificación "Creaste el grupo". Cuando quien mira es la universidad
        // se añade `universidad_id == su uid` para que la query sea válida;
        // empresa y admin pueden leer cualquier perfil, así que su query queda
        // igual que antes.
        const miembrosQuery = rol === 'universidad' && user?.uid
          ? query(
              collection(db, 'perfiles_estudiantes'),
              where('grupo_id', '==', grupoId),
              where('universidad_id', '==', user.uid),
            )
          : query(collection(db, 'perfiles_estudiantes'), where('grupo_id', '==', grupoId));
        tareas.push(
          getDocs(miembrosQuery).then(snap => {
            if (cancel) return;
            setMiembros(
              snap.docs.map(d => {
                const x = d.data() as any;
                return {
                  id: d.id,
                  nombre: x.nombre_completo ?? 'Estudiante',
                  carrera: x.carrera ?? '',
                  horasAprobadas: x.horas_aprobadas ?? 0,
                  horasObjetivo: x.horas_objetivo ?? 0,
                };
              }),
            );
          }).catch(() => { /* sin permisos en un caso límite: la lista queda vacía, no rompe el modal */ }),
        );

        // Alianza con empresa: best-effort — si el grupo tiene una pasantía
        // activa pero quien mira no es parte de ella, la lectura puede fallar
        // por reglas (OR de igualdades por uid); se degrada en silencio.
        if (info.pasantiaActivaId) {
          tareas.push(
            getDoc(doc(db, 'solicitudes_practicas', info.pasantiaActivaId))
              .then(async sol => {
                // Esta tarea tiene una lectura ENCADENADA adentro: primero
                // lee la solicitud de práctica, y SOLO SI la encuentra y
                // trae un empresaId, hace una segunda lectura (anidada)
                // para conseguir el nombre de esa empresa.
                if (cancel || !sol.exists()) return;
                const empresaId = (sol.data() as any).empresaId as string | undefined;
                if (!empresaId) return;
                setEmpresaAliadaId(empresaId);
                const emp = await getDoc(doc(db, 'perfiles_empresas', empresaId));
                if (!cancel && emp.exists()) setEmpresaAliadaNombre((emp.data() as any).nombre_empresa ?? 'Empresa');
              })
              .catch(() => { /* sin permisos o ya no existe: se omite */ }),
          );
        }

        await Promise.all(tareas);
        // Espera a que TODAS las tareas de la lista terminen (con éxito o
        // ya manejadas con su propio .catch) antes de continuar — como
        // cada tarea individual ya atrapa sus propios errores, Promise.all
        // aquí nunca "falla" por culpa de una sola tarea rota.
      } catch (e) {
        console.error('[GrupoDetailViewer] load', e);
        if (!cancel) setGrupo(null);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => { cancel = true; };
  }, [visible, grupoId, rol, user?.uid]);

  if (!visible) return null;

  const categorias = grupo ? areasDeCarrera(grupo.carrera) : [];
  // Se calcula DESPUÉS de que `grupo` ya está cargado (no es parte del
  // useEffect): es una transformación PURA y rápida (no toca Firebase),
  // así que se recalcula en cada render sin problema — no hace falta
  // useMemo para algo tan liviano.

  return (
    <>
      <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
        <View style={[styles.root, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.backBtn} hitSlop={10}>
              <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Grupo</Text>
            <View style={{ width: 32 }} />
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : !grupo ? (
            <View style={styles.center}>
              <Ionicons name="alert-circle-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>No se encontró este grupo.</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
              <View style={styles.hero}>
                <View style={styles.groupIcon}>
                  <Ionicons name="people" size={32} color={colors.primaryLight} />
                </View>
                <Text style={styles.nombre} noTranslate>{grupo.nombre}</Text>
                {grupo.egresado && (
                  <View style={styles.egresadoBadge}>
                    <Text style={styles.egresadoBadgeText}>🎓 Egresado</Text>
                  </View>
                )}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Información del grupo</Text>
                <TouchableOpacity
                  style={styles.infoRow}
                  activeOpacity={grupo.universidadId ? 0.7 : 1}
                  disabled={!grupo.universidadId}
                  onPress={() => grupo.universidadId && setPerfil({ tipo: 'universidad', id: grupo.universidadId })}
                >
                  <Ionicons name="school-outline" size={18} color={colors.primaryLight} style={{ width: 26 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>Universidad</Text>
                    <Text style={styles.infoValue} noTranslate>{universidadNombre || 'No disponible'}</Text>
                  </View>
                  {!!grupo.universidadId && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
                </TouchableOpacity>

                <InfoRow icon="book-outline" label="Carrera" value={grupo.carrera || 'No especificada'} colors={colors} styles={styles} />

                <View style={styles.infoRow}>
                  <Ionicons name="pricetag-outline" size={18} color={colors.primaryLight} style={{ width: 26 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>Categoría</Text>
                    {categorias.length > 0 ? (
                      // Si hay categorías, se dibujan como una fila de
                      // "chips" (etiquetas pequeñas), una por categoría.
                      <View style={styles.chipsRow}>
                        {categorias.map(c => (
                          <View key={c} style={styles.chip}>
                            <Text style={styles.chipText}>{c}</Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={styles.infoValue}>No determinada</Text>
                    )}
                  </View>
                </View>

                <InfoRow
                  icon="time-outline"
                  label="Horas a cumplir"
                  value={grupo.horas ? `${grupo.horas} horas` : 'No especificado'}
                  colors={colors}
                  styles={styles}
                />

                <TouchableOpacity
                  style={styles.infoRow}
                  activeOpacity={empresaAliadaId ? 0.7 : 1}
                  disabled={!empresaAliadaId}
                  onPress={() => empresaAliadaId && setPerfil({ tipo: 'empresa', id: empresaAliadaId })}
                >
                  <Ionicons name="briefcase-outline" size={18} color={colors.primaryLight} style={{ width: 26 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>Alianza con empresa</Text>
                    <Text style={styles.infoValue} noTranslate={!!empresaAliadaNombre}>
                      {grupo.pasantiaActivaId
                        ? (empresaAliadaNombre || 'Pasantía activa')
                        : 'Sin alianza activa'}
                      {/* 3 estados posibles para este texto:
                          1) sin pasantiaActivaId → "Sin alianza activa"
                          2) con pasantiaActivaId pero el nombre de la
                             empresa aún no cargó (o falló su lectura por
                             permisos) → "Pasantía activa" (genérico)
                          3) con pasantiaActivaId Y nombre ya cargado → el
                             nombre real de la empresa. */}
                    </Text>
                  </View>
                  {!!empresaAliadaId && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
                </TouchableOpacity>
              </View>

              <View style={styles.section}>
                <View style={styles.headerCardRow}>
                  <Text style={styles.sectionTitle}>Miembros del grupo</Text>
                  <Text style={styles.countBadge}>{miembros.length}</Text>
                </View>
                {miembros.length === 0 ? (
                  <Text style={styles.emptyInline}>Aún no hay estudiantes registrados en este grupo.</Text>
                ) : (
                  miembros.map(m => (
                    <TouchableOpacity
                      key={m.id}
                      style={styles.miembroRow}
                      activeOpacity={0.75}
                      onPress={() => setPerfil({ tipo: 'estudiante', id: m.id })}
                      // Cada miembro, al tocarse, abre su PROPIO perfil de
                      // estudiante (ProfileViewerModal con tipo
                      // 'estudiante') — a diferencia de las filas de
                      // arriba, aquí no hace falta comprobar si el id
                      // existe (siempre existe, porque viene de un
                      // documento real ya leído de Firestore).
                    >
                      <View style={styles.miembroAvatar}>
                        <Ionicons name="person" size={16} color={colors.primaryLight} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.miembroNombre} numberOfLines={1} noTranslate>{m.nombre}</Text>
                        <Text style={styles.miembroMeta} numberOfLines={1}>
                          {m.carrera || 'Sin carrera'}{m.horasObjetivo ? ` · ${m.horasAprobadas}/${m.horasObjetivo}h` : ''}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  ))
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>

      {perfil && (
        <ProfileViewerModal
          visible={!!perfil}
          tipo={perfil.tipo}
          profileId={perfil.id}
          onClose={() => setPerfil(null)}
        />
      )}
    </>
  );
}

function InfoRow({ icon, label, value, colors, styles }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; value: string; colors: GradlyColors; styles: any;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={colors.primaryLight} style={{ width: 26 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

const makeStyles = (COLORS: GradlyColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.backgroundDark },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyText: { fontSize: 14, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  hero: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  groupIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: COLORS.primary12, alignItems: 'center', justifyContent: 'center',
  },
  nombre: { fontSize: 20, fontFamily: FONTS.soraBold, color: COLORS.textPrimary, textAlign: 'center', paddingHorizontal: 24 },
  egresadoBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
    backgroundColor: COLORS.primary12,
  },
  egresadoBadgeText: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: COLORS.gold },
  section: {
    marginHorizontal: 16, marginBottom: 16, padding: 14, borderRadius: 16,
    backgroundColor: COLORS.backgroundCard, borderWidth: 1, borderColor: COLORS.border,
  },
  sectionTitle: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.textMuted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  headerCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  countBadge: {
    fontSize: 12, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight,
    backgroundColor: COLORS.primary12, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  infoLabel: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted, marginBottom: 2 },
  infoValue: { fontSize: 14, fontFamily: FONTS.interMedium, color: COLORS.textPrimary },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  chip: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8, backgroundColor: COLORS.primary12 },
  chipText: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },
  emptyInline: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textMuted, paddingVertical: 8 },
  miembroRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  miembroAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.primary12, alignItems: 'center', justifyContent: 'center',
  },
  miembroNombre: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  miembroMeta: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted, marginTop: 1 },
});
