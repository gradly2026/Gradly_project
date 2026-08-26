/**
 * ReclamoDetailModal — detalle de un reclamo de cupos por lote (colección
 * `reclamos_cupos`, ver reclamoCuposService.ts).
 *
 * Cubre las notificaciones "Solicitud de cupos" / "Cupos reservados"
 * (empresa) y "Cupos confirmados" / "Cupos rechazados" (universidad), que
 * antes solo llevaban a la sección general del dashboard sin identificar cuál
 * reclamo en concreto. Muestra vacante, universidad y grupo (tocables) junto
 * con la cantidad, el horario y el motivo si fue rechazado.
 */

// ════════════════════════════════════════════════════════════════════════
// GUÍA PARA PRINCIPIANTES:
// Este modal es un buen "siguiente paso" después de entender
// VacanteDetailByIdModal.tsx (el ejemplo maestro más simple): tiene el
// MISMO patrón base (leer un documento por su ID, mostrar loader/vacío/
// contenido), pero le agrega varias cosas más avanzadas:
//   - Dos lecturas de Firestore encadenadas (el reclamo, y si hace falta,
//     el nombre de la universidad aparte).
//   - Filas TOCABLES que abren OTROS 3 modales (perfil, grupo, vacante) —
//     un modal que abre modales.
//   - Un "diccionario de metadatos" (ESTADO_META) que traduce un valor
//     interno (el estado) a texto + color para mostrar.
//   - Un componente auxiliar local (InfoRow) para no repetir la misma
//     fila 3 veces.
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
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
import { textoHorario } from '../data/disponibilidad';
// Función utilitaria que convierte un objeto de horario estructurado (día,
// hora de entrada, hora de salida...) en un texto legible, ej.
// "Lunes a Viernes, 8:00 - 17:00".
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import type { EstadoReclamo, ReclamoCupos } from '../services/reclamoCuposService';
// Se importan SOLO los tipos (con la palabra `type`) del servicio de
// reclamos de cupos — este componente necesita conocer la FORMA de esos
// datos, pero no necesita ninguna de las funciones CRUD de ese servicio
// (aquí se lee el documento directo con getDoc, sin pasar por funciones
// intermedias).
import ProfileViewerModal, { type ProfileTipo } from './ProfileViewerModal';
import GrupoDetailViewerModal from './GrupoDetailViewerModal';
import VacanteDetailByIdModal from './VacanteDetailByIdModal';
// 3 modales más, que ESTE modal puede abrir encima de sí mismo: al tocar
// "Universidad" o "Empresa" se abre el perfil de esa institución; al
// tocar "Grupo" se abre el detalle del grupo; al tocar "Ver vacante
// completa" se abre el detalle de la vacante.

interface Props {
  visible: boolean;
  reclamoId: string | null;
  onClose: () => void;
}

const ESTADO_META: Record<EstadoReclamo, { label: string; color: (c: GradlyColors) => string }> = {
  // Un "diccionario de metadatos": para cada valor posible de
  // `EstadoReclamo` ('pendiente' | 'aceptado' | 'rechazado' | 'liberado'),
  // define el TEXTO a mostrar y una FUNCIÓN que, dado el objeto de
  // colores del tema activo, devuelve el color correspondiente a ese
  // estado. Guardar una FUNCIÓN en vez de un color fijo permite que el
  // color correcto se recalcule según el tema activo (claro/oscuro) en el
  // momento de usarlo, en vez de quedar fijo a un solo tema.
  pendiente: { label: 'Pendiente de confirmación', color: c => c.warning },
  aceptado: { label: 'Cupos confirmados', color: c => c.success },
  rechazado: { label: 'Rechazado', color: c => c.error },
  liberado: { label: 'Liberado', color: c => c.textMuted },
};

function formatFecha(ts: any, locale: string): string {
  // Función utilitaria local: convierte un Timestamp de Firestore (o
  // cualquier cosa parecida a una fecha) a un texto legible según el
  // idioma/región (`locale`, ej. 'es-SV').
  if (!ts) return '';
  const d: Date = ts?.toDate ? ts.toDate() : new Date(ts);
  // "ts?.toDate ? ts.toDate() : new Date(ts)" cubre 2 casos posibles:
  // si `ts` es un Timestamp real de Firestore (tiene el método .toDate),
  // se usa ese método; si no (por ejemplo, ya fuera un string o número de
  // fecha), se intenta construir un Date normal de JavaScript directo.
  if (isNaN(d.getTime())) return '';
  // d.getTime() da un número; si la fecha fuera inválida, ese número es
  // "NaN" (Not a Number) — isNaN(...) lo detecta y se devuelve texto
  // vacío en vez de mostrar una fecha rota tipo "Invalid Date".
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ReclamoDetailModal({ visible, reclamoId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [r, setR] = useState<ReclamoCupos | null>(null);
  // `r` (de "reclamo") guarda el documento completo ya leído.
  const [universidadNombre, setUniversidadNombre] = useState('');
  // Estado separado para el nombre de la universidad — se explica en el
  // useEffect por qué a veces hace falta una SEGUNDA lectura para
  // conseguirlo.

  const [perfil, setPerfil] = useState<{ tipo: ProfileTipo; id: string } | null>(null);
  const [grupoModalId, setGrupoModalId] = useState<string | null>(null);
  const [vacanteModalId, setVacanteModalId] = useState<string | null>(null);
  // 3 estados, uno por cada modal "hijo" que este componente puede abrir
  // — mismo patrón visto en FloatingTopBar.tsx para sus 4 modales.

  useEffect(() => {
    if (!visible || !reclamoId) return;
    let cancel = false;
    setLoading(true);
    setR(null);
    setUniversidadNombre('');
    // Limpia el estado anterior antes de cargar el nuevo reclamo — evita
    // mostrar por un instante los datos del reclamo PREVIO mientras carga
    // el nuevo.

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'reclamos_cupos', reclamoId));
        // READ 1: el documento del reclamo en sí.
        if (cancel) return;
        if (!snap.exists()) { setR(null); return; }
        const data = { id: snap.id, ...snap.data() } as ReclamoCupos;
        setR(data);

        if (data.universidadNombre) {
          setUniversidadNombre(data.universidadNombre);
          // Camino RÁPIDO: si el propio documento del reclamo ya trae el
          // nombre de la universidad "desnormalizado" (copiado ahí en su
          // momento, ver GUIA_01_FIREBASE_Y_CRUD.md sección 6), se usa
          // directo, sin gastar una segunda lectura a Firestore.
        } else if (data.universidadId) {
          const u = await getDoc(doc(db, 'perfiles_universidades', data.universidadId));
          // READ 2 (solo si hace falta): si el reclamo NO trae el nombre
          // ya copiado (por ejemplo, reclamos creados antes de que se
          // agregara ese campo desnormalizado), se hace una lectura extra
          // al perfil de la universidad para conseguirlo.
          if (!cancel && u.exists()) setUniversidadNombre((u.data() as any).nombre_universidad ?? '');
        }
      } catch (e) {
        console.error('[ReclamoDetail] load', e);
        if (!cancel) setR(null);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => { cancel = true; };
  }, [visible, reclamoId]);

  if (!visible) return null;

  const estadoMeta = r ? ESTADO_META[r.estado] : null;
  // Busca en el diccionario ESTADO_META la entrada correspondiente al
  // estado actual del reclamo (o `null` si todavía no hay reclamo cargado).
  const fecha = r ? formatFecha(r.fechaRespuesta ?? r.fechaReclamo, 'es-SV') : '';
  // Prioriza mostrar la fecha de RESPUESTA (cuando la empresa/universidad
  // ya reaccionó); si todavía no hay respuesta, cae en la fecha del
  // reclamo original.

  return (
    <>
      <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
        <View style={[styles.root, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.backBtn} hitSlop={10}>
              <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Reclamo de cupos</Text>
            <View style={{ width: 32 }} />
            {/* Espacio vacío del mismo ancho que el botón de "atrás", para
                que el título quede perfectamente centrado (mismo truco
                visto en FloatingTopBar.tsx con "Marcar todas"). */}
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : !r ? (
            // Segundo estado: terminó de cargar pero no se encontró nada.
            <View style={styles.center}>
              <Ionicons name="alert-circle-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>No se encontró este reclamo.</Text>
            </View>
          ) : (
            // Tercer estado ("camino feliz"): ya hay datos para mostrar.
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
              <View style={styles.hero}>
                <Text style={styles.vacanteTitulo} noTranslate>{r.vacanteTitulo || 'Vacante'}</Text>
                {/* noTranslate: el título de la vacante es contenido
                    escrito por la empresa (parecido a un nombre propio en
                    este contexto de "identificador de la publicación"),
                    así que no se traduce automáticamente. */}
                {!!estadoMeta && (
                  <View style={[styles.estadoBadge, { backgroundColor: `${estadoMeta.color(colors)}22`, borderColor: estadoMeta.color(colors) }]}>
                    {/* `${estadoMeta.color(colors)}22` — llama a la función
                        de color guardada en el diccionario (pasándole los
                        colores del tema activo) y le concatena "22" al
                        final (truco de opacidad hexadecimal: "22" ≈ 13%
                        de opacidad) para un fondo
                        sutil detrás del badge. */}
                    <Text style={[styles.estadoText, { color: estadoMeta.color(colors) }]}>{estadoMeta.label}</Text>
                  </View>
                )}
                {!!fecha && <Text style={styles.fecha}>{fecha}</Text>}
              </View>

              {r.estado === 'rechazado' && !!r.motivoRechazo && (
                // Solo se muestra el cuadro de motivo si el reclamo está
                // rechazado Y además tiene un motivo guardado.
                <View style={styles.motivoBox}>
                  <Ionicons name="alert-circle" size={16} color={colors.error} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.motivoLabel}>Motivo del rechazo</Text>
                    <Text style={styles.motivoText}>{r.motivoRechazo}</Text>
                  </View>
                </View>
              )}

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Universidad y grupo</Text>
                <TouchableOpacity
                  style={styles.infoRow}
                  activeOpacity={r.universidadId ? 0.7 : 1}
                  // Si NO hay universidadId, activeOpacity se fija en 1
                  // (sin efecto visual al tocar) — una pista visual sutil
                  // de que esta fila no es tocable en ese caso.
                  disabled={!r.universidadId}
                  onPress={() => r.universidadId && setPerfil({ tipo: 'universidad', id: r.universidadId })}
                  // "r.universidadId && setPerfil(...)" es un atajo común:
                  // si `r.universidadId` es falsy (vacío/undefined), la
                  // expresión se detiene ahí y setPerfil NUNCA se llama;
                  // si es verdadero, se ejecuta setPerfil con esos datos.
                >
                  <Ionicons name="school-outline" size={18} color={colors.primaryLight} style={{ width: 26 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>Universidad</Text>
                    <Text style={styles.infoValue} noTranslate>{universidadNombre || 'No disponible'}</Text>
                  </View>
                  {!!r.universidadId && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
                  {/* La flechita ">" solo se muestra si la fila SÍ es
                      tocable (hay un universidadId al cual navegar). */}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.infoRow}
                  activeOpacity={r.grupoId ? 0.7 : 1}
                  disabled={!r.grupoId}
                  onPress={() => r.grupoId && setGrupoModalId(r.grupoId!)}
                >
                  <Ionicons name="people-outline" size={18} color={colors.primaryLight} style={{ width: 26 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>Grupo</Text>
                    <Text style={styles.infoValue} noTranslate>{r.grupoNombre || 'Sin asignar todavía'}</Text>
                  </View>
                  {!!r.grupoId && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.infoRow}
                  activeOpacity={r.empresaId ? 0.7 : 1}
                  disabled={!r.empresaId}
                  onPress={() => r.empresaId && setPerfil({ tipo: 'empresa', id: r.empresaId })}
                >
                  <Ionicons name="business-outline" size={18} color={colors.primaryLight} style={{ width: 26 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>Empresa</Text>
                    <Text style={styles.infoValue} noTranslate>{r.empresaNombre || 'No disponible'}</Text>
                  </View>
                  {!!r.empresaId && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
                </TouchableOpacity>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Cupos reclamados</Text>
                <InfoRow icon="people-circle-outline" label="Cantidad vigente" value={`${r.cantidad} de ${r.cantidadInicial} cupo(s)`} colors={colors} styles={styles} />
                {typeof r.tomados === 'number' && (
                  // Solo se muestra esta fila si `r.tomados` es
                  // efectivamente un número (podría no existir en
                  // reclamos viejos que se crearon antes de que se
                  // empezara a llevar esa cuenta).
                  <InfoRow icon="checkmark-done-outline" label="Ya elegidos por estudiantes" value={String(r.tomados)} colors={colors} styles={styles} />
                )}
                {!!textoHorario(r.horario) && (
                  <InfoRow icon="alarm-outline" label="Horario" value={textoHorario(r.horario) as string} colors={colors} styles={styles} />
                )}
              </View>

              {!!r.vacanteId && (
                <TouchableOpacity style={styles.verVacanteBtn} activeOpacity={0.85} onPress={() => setVacanteModalId(r.vacanteId)}>
                  <Ionicons name="briefcase-outline" size={18} color="#fff" />
                  <Text style={styles.verVacanteText}>Ver vacante completa</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* ── Modales "nietos": se abren ENCIMA de este mismo modal ── */}
      {perfil && (
        <ProfileViewerModal visible={!!perfil} tipo={perfil.tipo} profileId={perfil.id} onClose={() => setPerfil(null)} />
      )}
      <GrupoDetailViewerModal visible={!!grupoModalId} grupoId={grupoModalId} onClose={() => setGrupoModalId(null)} />
      <VacanteDetailByIdModal visible={!!vacanteModalId} vacanteId={vacanteModalId} onClose={() => setVacanteModalId(null)} />
    </>
  );
}

function InfoRow({ icon, label, value, colors, styles }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; value: string; colors: GradlyColors; styles: any;
}) {
  // Componente auxiliar LOCAL (no exportado): una fila simple de
  // "ícono + etiqueta + valor", SIN comportamiento tocable (a diferencia
  // de las 3 filas de arriba, que sí navegan a otro modal). Recibe
  // `styles` como prop en vez de calcularlo con su propio useThemedStyles,
  // porque es tan chico que no vale la pena — simplemente reutiliza el
  // objeto de estilos ya calculado por el componente padre.
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
  hero: { alignItems: 'center', paddingVertical: 22, gap: 8, paddingHorizontal: 24 },
  vacanteTitulo: { fontSize: 19, fontFamily: FONTS.soraBold, color: COLORS.textPrimary, textAlign: 'center' },
  estadoBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, borderWidth: 1 },
  estadoText: { fontSize: 12, fontFamily: FONTS.interSemiBold },
  fecha: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  motivoBox: {
    flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 16, padding: 14,
    borderRadius: 14, backgroundColor: 'rgba(239,68,68,0.10)', borderWidth: 1, borderColor: COLORS.error,
  },
  motivoLabel: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: COLORS.error, marginBottom: 3 },
  motivoText: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textPrimary, lineHeight: 18 },
  section: {
    marginHorizontal: 16, marginBottom: 16, padding: 14, borderRadius: 16,
    backgroundColor: COLORS.backgroundCard, borderWidth: 1, borderColor: COLORS.border,
  },
  sectionTitle: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.textMuted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  infoLabel: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted, marginBottom: 2 },
  infoValue: { fontSize: 14, fontFamily: FONTS.interMedium, color: COLORS.textPrimary },
  verVacanteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 14,
    marginHorizontal: 16, marginBottom: 12,
  },
  verVacanteText: { color: '#fff', fontFamily: FONTS.interSemiBold, fontSize: 15 },
});
