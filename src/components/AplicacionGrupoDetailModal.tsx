/**
 * AplicacionGrupoDetailModal — detalle de una postulación de grupo
 * (colección `aplicaciones_grupos`, ver pasantiaService.ts).
 *
 * Cubre 2 notificaciones que antes no llevaban a ningún lado útil:
 *  - "Nueva postulación de grupo" (empresa) / "La empresa aceptó tu grupo"
 *    y "Grupo no aceptado" (universidad) → estado pendiente/revisando.
 *  - "¡Pasantía confirmada!" / "Oferta rechazada" (empresa) → estado
 *    aprobada/rechazada, con el motivo del rechazo si aplica.
 *
 * Muestra la vacante/pasantía, la universidad y el grupo (ambos tocables →
 * abren su propio perfil/detalle) junto con la fecha, y el motivo cuando la
 * postulación terminó rechazada.
 */

// ════════════════════════════════════════════════════════════════════════
// GUÍA PARA PRINCIPIANTES:
// Este archivo es prácticamente GEMELO de src/components/ReclamoDetailModal.tsx
// (léelo primero si no lo hiciste — ahí está explicado a fondo cada pieza:
// el diccionario ESTADO_META, formatFecha, el patrón de 2 lecturas
// encadenadas para el nombre de universidad, las filas tocables que abren
// otros modales, y el componente auxiliar InfoRow). Aquí comento
// principalmente lo que es DISTINTO respecto a ese archivo, para no
// repetir exactamente la misma explicación dos veces.
//
// Diferencias reales con ReclamoDetailModal.tsx:
//   - Lee de la colección "aplicaciones_grupos" en vez de "reclamos_cupos".
//   - Su tipo de estado (EstadoAplicacionGrupo) tiene 4 valores distintos:
//     pendiente | revisando | aprobada | rechazada (el flujo completo
//     está explicado en pasantiaService.ts, sección "MOTOR RELACIONAL").
//   - La fecha a mostrar prioriza fechaRespuestaUniversidad, luego
//     fechaRespuestaEmpresa, luego fechaPostulacion (3 niveles de
//     respaldo con "??", en vez de los 2 de ReclamoDetailModal).
//   - Su sección de detalles muestra datos propios de una pasantía de
//     grupo: carrera, horas requeridas, cantidad de estudiantes, y si ya
//     hay un acuerdo (horario/fechas) definido.
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
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import type { AplicacionGrupo, EstadoAplicacionGrupo } from '../services/pasantiaService';
// Tipos importados desde pasantiaService.ts (no desde reclamoCuposService.ts
// como en el modal gemelo) — esta pantalla muestra postulaciones de
// GRUPO a vacantes, que es un concepto de negocio distinto al de
// "reclamar cupos por lote".
import ProfileViewerModal, { type ProfileTipo } from './ProfileViewerModal';
import GrupoDetailViewerModal from './GrupoDetailViewerModal';
import VacanteDetailByIdModal from './VacanteDetailByIdModal';

interface Props {
  visible: boolean;
  aplicacionId: string | null;
  onClose: () => void;
}

const ESTADO_META: Record<EstadoAplicacionGrupo, { label: string; color: (c: GradlyColors) => string }> = {
  pendiente: { label: 'Pendiente de revisión', color: c => c.warning },
  revisando: { label: 'Oferta enviada · esperando respuesta', color: c => c.primaryLight },
  aprobada: { label: 'Pasantía confirmada', color: c => c.success },
  rechazada: { label: 'Rechazada', color: c => c.error },
};

function formatFecha(ts: any, locale: string): string {
  // Idéntica a la de ReclamoDetailModal.tsx — ver ese archivo para el
  // detalle línea por línea.
  if (!ts) return '';
  const d: Date = ts?.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AplicacionGrupoDetailModal({ visible, aplicacionId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [ap, setAp] = useState<AplicacionGrupo | null>(null);
  // `ap` (de "aplicación") — mismo rol que `r` en el modal gemelo.
  const [universidadNombre, setUniversidadNombre] = useState('');

  const [perfil, setPerfil] = useState<{ tipo: ProfileTipo; id: string } | null>(null);
  const [grupoModalId, setGrupoModalId] = useState<string | null>(null);
  const [vacanteModalId, setVacanteModalId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !aplicacionId) return;
    let cancel = false;
    setLoading(true);
    setAp(null);
    setUniversidadNombre('');

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'aplicaciones_grupos', aplicacionId));
        // READ 1: aquí está la diferencia clave de colección respecto al
        // modal gemelo — "aplicaciones_grupos" en vez de "reclamos_cupos".
        if (cancel) return;
        if (!snap.exists()) { setAp(null); return; }
        const data = { id: snap.id, ...snap.data() } as AplicacionGrupo;
        setAp(data);

        if (data.universidadNombre) {
          setUniversidadNombre(data.universidadNombre);
        } else if (data.universidadId) {
          const u = await getDoc(doc(db, 'perfiles_universidades', data.universidadId));
          // READ 2 (solo si hace falta) — mismo patrón de "desnormalización
          // con respaldo" explicado en ReclamoDetailModal.tsx.
          if (!cancel && u.exists()) setUniversidadNombre((u.data() as any).nombre_universidad ?? '');
        }
      } catch (e) {
        console.error('[AplicacionGrupoDetail] load', e);
        if (!cancel) setAp(null);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => { cancel = true; };
  }, [visible, aplicacionId]);

  if (!visible) return null;

  const estadoMeta = ap ? ESTADO_META[ap.estado] : null;
  const fecha = ap
    ? formatFecha(ap.fechaRespuestaUniversidad ?? ap.fechaRespuestaEmpresa ?? ap.fechaPostulacion, 'es-SV')
    : '';
  // 3 niveles de respaldo con "??": prioriza la fecha de respuesta final
  // de la universidad (el evento más reciente si ya se cerró el ciclo);
  // si no existe, la fecha en que la empresa respondió; si tampoco, la
  // fecha original en que se postuló el grupo.

  return (
    <>
      <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
        <View style={[styles.root, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.backBtn} hitSlop={10}>
              <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Postulación de grupo</Text>
            <View style={{ width: 32 }} />
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : !ap ? (
            <View style={styles.center}>
              <Ionicons name="alert-circle-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>No se encontró esta postulación.</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
              <View style={styles.hero}>
                <Text style={styles.vacanteTitulo} noTranslate>{ap.vacanteTitulo || 'Vacante'}</Text>
                {!!estadoMeta && (
                  <View style={[styles.estadoBadge, { backgroundColor: `${estadoMeta.color(colors)}22`, borderColor: estadoMeta.color(colors) }]}>
                    <Text style={[styles.estadoText, { color: estadoMeta.color(colors) }]}>{estadoMeta.label}</Text>
                  </View>
                )}
                {!!fecha && <Text style={styles.fecha}>{fecha}</Text>}
              </View>

              {ap.estado === 'rechazada' && !!ap.justificacionRechazo && (
                <View style={styles.motivoBox}>
                  <Ionicons name="alert-circle" size={16} color={colors.error} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.motivoLabel}>Motivo del rechazo</Text>
                    <Text style={styles.motivoText}>{ap.justificacionRechazo}</Text>
                  </View>
                </View>
              )}

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Universidad y grupo</Text>
                {/* Las siguientes 3 filas tocables (universidad, grupo,
                    empresa) son el MISMO patrón exacto de
                    ReclamoDetailModal.tsx: cada una está deshabilitada si
                    falta el id correspondiente, y al tocarse abre el
                    modal de perfil/detalle correspondiente. */}
                <TouchableOpacity
                  style={styles.infoRow}
                  activeOpacity={ap.universidadId ? 0.7 : 1}
                  disabled={!ap.universidadId}
                  onPress={() => ap.universidadId && setPerfil({ tipo: 'universidad', id: ap.universidadId })}
                >
                  <Ionicons name="school-outline" size={18} color={colors.primaryLight} style={{ width: 26 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>Universidad</Text>
                    <Text style={styles.infoValue} noTranslate>{universidadNombre || 'No disponible'}</Text>
                  </View>
                  {!!ap.universidadId && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.infoRow}
                  activeOpacity={ap.grupoId ? 0.7 : 1}
                  disabled={!ap.grupoId}
                  onPress={() => ap.grupoId && setGrupoModalId(ap.grupoId)}
                >
                  <Ionicons name="people-outline" size={18} color={colors.primaryLight} style={{ width: 26 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>Grupo</Text>
                    <Text style={styles.infoValue} noTranslate>{ap.grupoNombre || 'Sin nombre'}</Text>
                  </View>
                  {!!ap.grupoId && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.infoRow}
                  activeOpacity={ap.empresaId ? 0.7 : 1}
                  disabled={!ap.empresaId}
                  onPress={() => ap.empresaId && setPerfil({ tipo: 'empresa', id: ap.empresaId })}
                >
                  <Ionicons name="business-outline" size={18} color={colors.primaryLight} style={{ width: 26 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>Empresa</Text>
                    <Text style={styles.infoValue} noTranslate>{ap.empresaNombre || 'No disponible'}</Text>
                  </View>
                  {!!ap.empresaId && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
                </TouchableOpacity>
              </View>

              {/* ── Esta sección SÍ es propia de este modal (no existe en
                  ReclamoDetailModal.tsx): muestra los datos específicos
                  de la pasantía de grupo. ── */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Detalles de la pasantía</Text>
                <InfoRow icon="book-outline" label="Carrera" value={ap.carrera || 'No especificada'} colors={colors} styles={styles} />
                <InfoRow icon="time-outline" label="Horas requeridas" value={ap.horasRequeridas ? `${ap.horasRequeridas} horas` : 'No especificado'} colors={colors} styles={styles} />
                <InfoRow icon="people-circle-outline" label="Estudiantes del grupo" value={ap.estudiantesCount ? String(ap.estudiantesCount) : '—'} colors={colors} styles={styles} />
                {!!ap.acuerdo && (
                  // El "acuerdo" estructurado (ver AcuerdoData en
                  // pasantiaService.ts) solo existe una vez que la
                  // empresa ya envió su oferta (estado 'revisando' en
                  // adelante) — antes de eso, este bloque no se muestra.
                  <>
                    <InfoRow icon="calendar-outline" label="Período" value={`${ap.acuerdo.fechaInicio} – ${ap.acuerdo.fechaFin}`} colors={colors} styles={styles} />
                    <InfoRow icon="alarm-outline" label="Horario" value={`${ap.acuerdo.dias.join(', ')} · ${ap.acuerdo.horaInicio} - ${ap.acuerdo.horaFin}`} colors={colors} styles={styles} />
                  </>
                )}
              </View>

              {!!ap.vacanteId && (
                <TouchableOpacity style={styles.verVacanteBtn} activeOpacity={0.85} onPress={() => setVacanteModalId(ap.vacanteId)}>
                  <Ionicons name="briefcase-outline" size={18} color="#fff" />
                  <Text style={styles.verVacanteText}>Ver vacante completa</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </View>
      </Modal>

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
  // Idéntico al InfoRow de ReclamoDetailModal.tsx (cada archivo tiene su
  // propia copia local, en vez de compartir uno solo).
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
