import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Share,
  StyleSheet,

  TouchableOpacity,
  View,
} from 'react-native';
import { AutoText as Text } from "../../src/components/AutoText";
import { useAuth } from '../../src/context/AuthContext';
import { db } from '../../src/config/firebaseConfig';
import { COLORS, FONTS, useTheme, type GradlyColors } from '../../src/context/ThemeContext';
import { generarReciboTexto } from '../../src/services/pagoService';
import { estudianteFinalizaProyecto } from '../../src/services/pasantiaService';
import { progresoPorFechas } from '../../src/utils/progresoPasantia';
import CalendarioEventos from '../../src/components/CalendarioEventos';
import TableroCupos from '../../src/components/TableroCupos';
import { LiquidBackground } from '../../components/ui/liquid-glass/LiquidBackground';
import { GlassCard } from '../../components/ui/liquid-glass/GlassCard';
import { JellyButton } from '../../components/ui/liquid-glass/JellyButton';

// Hook que recrea los estilos según el tema activo (claro/oscuro)
function useThemedStyles() {
  const { colors } = useTheme();
  return useMemo(() => ({ colors, styles: makeStyles(colors) }), [colors]);
}

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
interface EstudiantePerfil {
  horas_objetivo:  number;
  horas_aprobadas: number;
  horas_en_proceso:number;
  /** Para el tablero de cupos reservados por su universidad. */
  universidad_id?: string;
  grupo_id?:       string;
}

interface Aplicacion {
  id: string;
  vacante_id: string;
  empresa_id: string;
  estado: string;
  fecha_inicio: any;
  fecha_fin: any;
  horas_completadas: number;
  calificacion_empresa: number;
  // desnormalizados
  nombre_empresa?: string;
  titulo_vacante?: string;
}

/**
 * Notificación de acuerdo aprobado que recibe el estudiante cuando su grupo
 * cierra trato con una empresa (la escribe `firmarAcuerdo`). Es la fuente que
 * alimenta la tarjeta "Mi pasantía" — el estudiante puede leerla por regla
 * (`estudianteId == uid`) sin necesidad de acceso a `solicitudes_practicas`.
 */
interface AcuerdoEstudiante {
  id: string;
  empresaNombre?: string;
  fechaInicio?: string;
  fechaFin?: string;
  carrera?: string;
  horario?: { dias: string[]; horaInicio: string; horaFin: string };
  pago?: { tipo: 'con_pago' | 'sin_pago'; monto?: number };
  createdAt?: any;
}

// ─────────────────────────────────────────────
// NIVEL GAMIFICADO
// ─────────────────────────────────────────────
function getLevel(pct: number) {
  if (pct >= 100) return { name: 'Graduado',    icon: 'trophy'    as const, color: COLORS.gold };
  if (pct >= 76)  return { name: 'Experto',     icon: 'star'      as const, color: COLORS.warning };
  if (pct >= 51)  return { name: 'Profesional', icon: 'briefcase' as const, color: COLORS.success };
  if (pct >= 26)  return { name: 'Practicante', icon: 'bag'       as const, color: COLORS.primaryLight };
  return           { name: 'Explorador',  icon: 'compass'   as const, color: COLORS.accent };
}

// ─────────────────────────────────────────────
// CÍRCULO DE PROGRESO (puro React Native)
// Implementación con la técnica de dos semianillos
// rotados — no requiere react-native-svg.
// ─────────────────────────────────────────────
const RING_SIZE = 160;
const RING_HALF = RING_SIZE / 2;
const RING_THICKNESS = 14;

function CircleProgress({ pct, aprobadas, objetivo }: { pct: number; aprobadas: number; objetivo: number }) {
  const { styles } = useThemedStyles();
  const clamped  = Math.min(pct, 100);
  const nivel    = getLevel(pct);
  const arcColor = pct >= 100 ? COLORS.gold : COLORS.primary;

  // Semianillo derecho: cubre 0–50 % (0°–180°)
  // rotate -90 = 0 % visible, rotate +90 = 50 % visible
  const rotDer = clamped <= 50
    ? (clamped / 50) * 180 - 90
    : 90;

  // Semianillo izquierdo: cubre 50–100 % (180°–360°)
  // rotate -90 = 0 extra, rotate +90 = otro 50 % visible
  const rotIzq = clamped > 50
    ? ((clamped - 50) / 50) * 180 - 90
    : -90;

  return (
    <View style={styles.svgWrap}>
      <View style={{ width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' }}>
        {/* Track (fondo gris) */}
        <View style={{
          position: 'absolute', width: RING_SIZE, height: RING_SIZE,
          borderRadius: RING_HALF, borderWidth: RING_THICKNESS,
          borderColor: COLORS.border,
        }} />

        {/* Semianillo derecho (derecho = x ≥ HALF) */}
        <View style={{
          position: 'absolute', top: 0, right: 0,
          width: RING_HALF, height: RING_SIZE, overflow: 'hidden',
        }}>
          <View style={{
            position: 'absolute', top: 0, left: -RING_HALF,
            width: RING_SIZE, height: RING_SIZE, borderRadius: RING_HALF,
            borderWidth: RING_THICKNESS,
            borderTopColor: arcColor, borderRightColor: arcColor,
            borderBottomColor: 'transparent', borderLeftColor: 'transparent',
            transform: [{ rotate: `${rotDer}deg` }],
            opacity: clamped > 0 ? 1 : 0,
          }} />
        </View>

        {/* Semianillo izquierdo (izquierdo = x ≤ HALF) */}
        <View style={{
          position: 'absolute', top: 0, left: 0,
          width: RING_HALF, height: RING_SIZE, overflow: 'hidden',
        }}>
          <View style={{
            position: 'absolute', top: 0, left: 0,
            width: RING_SIZE, height: RING_SIZE, borderRadius: RING_HALF,
            borderWidth: RING_THICKNESS,
            borderBottomColor: arcColor, borderLeftColor: arcColor,
            borderTopColor: 'transparent', borderRightColor: 'transparent',
            transform: [{ rotate: `${rotIzq}deg` }],
            opacity: clamped > 50 ? 1 : 0,
          }} />
        </View>

        {/* Texto central */}
        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.pctBig, { color: arcColor }]}>{clamped}%</Text>
          <Text style={styles.pctHrs}>{aprobadas}/{objetivo} hrs</Text>
        </View>
      </View>

      {/* Badge de nivel */}
      <View style={[styles.nivelBadge, { borderColor: nivel.color }]}>
        <Ionicons name={nivel.icon} size={14} color={nivel.color} />
        <Text style={[styles.nivelText, { color: nivel.color }]}>{nivel.name}</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────
// TARJETA PASANTÍA ACTIVA
// ─────────────────────────────────────────────
function PasantiaActivaCard({ app, onFinalizar }: { app: Aplicacion; onFinalizar: () => void }) {
  const { styles } = useThemedStyles();
  const inicio = app.fecha_inicio?.toDate?.() ?? new Date();
  const ahora  = new Date();
  const diasTranscurridos = Math.floor((ahora.getTime() - inicio.getTime()) / 86_400_000);
  const totalDias = 120; // estimado
  const pctDias = Math.min(100, Math.round((diasTranscurridos / totalDias) * 100));

  return (
    <GlassCard style={{ marginBottom: 16 }} contentStyle={{ padding: 16, gap: 10 }}>
      <View style={styles.activaHeader}>
        <Ionicons name="business-outline" size={22} color={COLORS.primaryLight} />
        <View style={{ flex: 1 }}>
          <Text style={styles.activaEmpresa} numberOfLines={1}>
            {app.nombre_empresa ?? 'Empresa'}
          </Text>
          <Text style={styles.activaVacante} numberOfLines={1}>
            {app.titulo_vacante ?? 'Pasantía'}
          </Text>
        </View>
        <View style={styles.estadoBadge}>
          <Text style={styles.estadoText}>Activa</Text>
        </View>
      </View>

      {/* Barra de días */}
      <View style={styles.diasRow}>
        <Text style={styles.diasLabel}>Día {diasTranscurridos} de ~{totalDias}</Text>
        <Text style={styles.diasPct}>{pctDias}%</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pctDias}%` as any }]} />
      </View>

      <Text style={styles.horasText}>Horas completadas: {app.horas_completadas ?? 0}</Text>

      <JellyButton style={styles.finalizarBtn} contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6 }} onPress={onFinalizar}>
        <Ionicons name="flag-outline" size={16} color={COLORS.warning} />
        <Text style={styles.finalizarText}>Notificar finalización</Text>
      </JellyButton>
    </GlassCard>
  );
}

// ─────────────────────────────────────────────
// TARJETA "MI PASANTÍA" (acuerdo de grupo aprobado)
// Línea de tiempo porcentual basada en el periodo acordado.
// ─────────────────────────────────────────────
function MiPasantiaCard({ acuerdo, estadoServidor }: { acuerdo: AcuerdoEstudiante; estadoServidor?: string | null }) {
  const { styles } = useThemedStyles();
  const prog = progresoPorFechas(acuerdo.fechaInicio, acuerdo.fechaFin);
  const conPago = acuerdo.pago?.tipo === 'con_pago';

  // El estado del ciclo de vida (finalizado/certificada) manda sobre la línea de
  // tiempo por fechas: así el estudiante ve el cierre real de la pasantía, no solo
  // el avance del calendario. Si la solicitud sigue "aprobado", usamos las fechas.
  const estadoOverride: { label: string; color: string } | null =
    estadoServidor === 'certificada'
      ? { label: 'Certificada', color: COLORS.gold }
      : estadoServidor === 'pendiente_certificacion'
        ? { label: 'Pendiente de certificar', color: COLORS.warning }
        : estadoServidor === 'finalizado' || estadoServidor === 'finalizada'
          ? { label: 'Finalizada', color: COLORS.success }
          : null;

  const estadoLabel =
    estadoOverride?.label ??
    (prog.estado === 'por_iniciar'
      ? 'Por iniciar'
      : prog.estado === 'completado'
        ? 'Completada'
        : 'En curso');
  const estadoColor =
    estadoOverride?.color ??
    (prog.estado === 'completado'
      ? COLORS.gold
      : prog.estado === 'en_curso'
        ? COLORS.success
        : COLORS.primaryLight);
  const horarioTexto = acuerdo.horario
    ? `${acuerdo.horario.dias.join(', ')} · ${acuerdo.horario.horaInicio} - ${acuerdo.horario.horaFin}`
    : '—';

  return (
    <GlassCard style={{ marginBottom: 16 }} contentStyle={{ padding: 16, gap: 12 }}>
      <View style={styles.activaHeader}>
        <Ionicons name="ribbon-outline" size={22} color={COLORS.primaryLight} />
        <View style={{ flex: 1 }}>
          <Text style={styles.activaEmpresa} numberOfLines={1}>
            {acuerdo.empresaNombre ?? 'Empresa'}
          </Text>
          <Text style={styles.activaVacante} numberOfLines={1}>
            {acuerdo.carrera ?? 'Pasantía'}
          </Text>
        </View>
        <View style={[styles.estadoBadge, { borderColor: estadoColor + '40', backgroundColor: estadoColor + '20' }]}>
          <Text style={[styles.estadoText, { color: estadoColor }]}>{estadoLabel}</Text>
        </View>
      </View>

      {/* Línea de tiempo porcentual */}
      <View style={styles.diasRow}>
        <Text style={styles.diasLabel}>
          {prog.estado === 'por_iniciar'
            ? `Inicia ${acuerdo.fechaInicio}`
            : `Día ${prog.diasTranscurridos} de ${prog.diasTotales}`}
        </Text>
        <Text style={[styles.diasPct, { color: estadoColor }]}>{prog.pct}%</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${prog.pct}%` as any, backgroundColor: estadoColor }]} />
      </View>

      <View style={styles.miPasanRow}>
        <Ionicons name="calendar-outline" size={15} color={COLORS.textMuted} />
        <Text style={styles.miPasanText}>{acuerdo.fechaInicio} → {acuerdo.fechaFin}</Text>
      </View>
      <View style={styles.miPasanRow}>
        <Ionicons name="time-outline" size={15} color={COLORS.textMuted} />
        <Text style={styles.miPasanText} numberOfLines={2}>{horarioTexto}</Text>
      </View>
      <View style={styles.miPasanRow}>
        <Ionicons name="wallet-outline" size={15} color={conPago ? COLORS.success : COLORS.textMuted} />
        <Text style={[styles.miPasanText, conPago && { color: COLORS.success }]}>
          {conPago ? `Pago: $${Number(acuerdo.pago?.monto ?? 0).toFixed(2)}` : 'Sin pago'}
        </Text>
      </View>

      {prog.estado === 'en_curso' && (
        <Text style={styles.miPasanRestante}>
          {prog.diasRestantes} día(s) restante(s)
        </Text>
      )}
    </GlassCard>
  );
}

// ─────────────────────────────────────────────
// PANTALLA
// ─────────────────────────────────────────────
export default function ProgresoTab() {
  const { user, userProfile } = useAuth();
  const { styles, colors } = useThemedStyles();
  const webScrollStyle = Platform.OS === 'web'
    ? ({ scrollbarColor: `${colors.primary35} ${colors.backgroundSurface}`, scrollbarWidth: 'thin' } as any)
    : undefined;

  const [perfil,        setPerfil]        = useState<EstudiantePerfil | null>(null);
  const [apps,          setApps]          = useState<Aplicacion[]>([]);
  const [transacciones, setTransacciones] = useState<any[]>([]);
  const [acuerdo,       setAcuerdo]       = useState<AcuerdoEstudiante | null>(null);
  const [pasantiaEstado, setPasantiaEstado] = useState<string | null>(null);
  const [cargando,      setCargando]      = useState(true);

  const horasObjetivo   = perfil?.horas_objetivo   ?? 500;
  const horasAprobadas  = perfil?.horas_aprobadas  ?? 0;
  const horasEnProceso  = perfil?.horas_en_proceso ?? 0;
  const pct = Math.min(100, Math.round((horasAprobadas / horasObjetivo) * 100));

  const activa    = apps.find(a => a.estado === 'contratado');
  const historial = apps.filter(a => a.estado === 'finalizado' || a.estado === 'aprobado');

  // ── Firestore: perfil ────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'perfiles_estudiantes', user.uid), snap => {
      if (snap.exists()) setPerfil(snap.data() as EstudiantePerfil);
      setCargando(false);
    });
    return unsub;
  }, [user]);

  // ── Firestore: aplicaciones ──────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'aplicaciones'), where('estudiante_id', '==', user.uid));
    const unsub = onSnapshot(q, snap => {
      setApps(snap.docs.map(d => ({ id: d.id, ...d.data() } as Aplicacion)));
    });
    return unsub;
  }, [user]);

  // ── Firestore: transacciones (ingresos) ──────────────────────────
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'transacciones'), where('estudiante_id', '==', user.uid));
    const unsub = onSnapshot(q, snap => {
      setTransacciones(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [user]);

  // ── Firestore: acuerdo de pasantía del grupo (notificaciones del estudiante)
  // Toma el acuerdo aprobado más reciente para mostrar "Mi pasantía".
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'notificaciones_estudiantes'),
      where('estudianteId', '==', user.uid),
    );
    const unsub = onSnapshot(
      q,
      snap => {
        const acuerdos = snap.docs
          .map(d => ({ id: d.id, ...(d.data() as any) }))
          .filter(a => a.tipo === 'acuerdo_aprobado' && a.fechaInicio)
          .sort(
            (a, b) =>
              (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
          );
        setAcuerdo(acuerdos[0] ?? null);
      },
      () => setAcuerdo(null),
    );
    return unsub;
  }, [user]);

  // ── Firestore: estado EN VIVO de la pasantía (solicitudes_practicas) ──
  // El estudiante ahora puede leer su propia solicitud vía `estudianteIds`
  // (denormalizado en el servicio). Esto refleja el ciclo de vida real
  // (aprobado → finalizado → certificada) que la notificación puntual no capta.
  // Sin orderBy para no exigir índice compuesto; se ordena en cliente.
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'solicitudes_practicas'),
      where('estudianteIds', 'array-contains', user.uid),
    );
    const unsub = onSnapshot(
      q,
      snap => {
        const sols = snap.docs
          .map(d => ({ id: d.id, ...(d.data() as any) }))
          .sort(
            (a, b) =>
              (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
          );
        // 'certificada' se modela con el campo `certificacion`; el resto usa `estado`.
        const top = sols[0];
        setPasantiaEstado(
          top ? (top.certificacion === 'certificada' ? 'certificada' : top.estado ?? null) : null,
        );
      },
      () => setPasantiaEstado(null),
    );
    return unsub;
  }, [user]);

  const totalIngresos = useMemo(() =>
    transacciones
      .filter(t => t.estado === 'completado')
      .reduce((acc, t) => acc + (t.monto ?? 0), 0),
  [transacciones]);

  const handleCompartirRecibo = async (tx: any) => {
    const texto = generarReciboTexto({
      referencia: tx.referencia ?? 'N/A',
      monto:      tx.monto ?? 0,
      empresa:    tx.empresa_id ?? 'Empresa',
      estudiante: user?.email ?? 'Estudiante',
      fecha:      tx.fecha?.toDate?.()?.toLocaleDateString('es-SV') ?? '—',
      concepto:   tx.concepto ?? 'Pasantía',
    });
    try {
      await Share.share({ message: texto, title: 'Recibo Gradly' });
    } catch { /* usuario canceló el share */ }
  };

  const handleFinalizar = async (appId: string) => {
    const app = apps.find(a => a.id === appId);
    Alert.alert(
      'Confirmar finalización',
      '¿Seguro que quieres notificar que has finalizado esta pasantía? La empresa deberá confirmar.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, finalicé',
          onPress: async () => {
            try {
              await estudianteFinalizaProyecto(
                appId,
                user!.uid,
                app?.horas_completadas ?? 0,
                app?.empresa_id,
                (userProfile as any)?.nombre_completo,
              );
            } catch {
              Alert.alert('Error', 'No se pudo actualizar el estado.');
            }
          },
        },
      ],
    );
  };

  if (cargando) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <LiquidBackground>
    <View style={[styles.root, { backgroundColor: 'transparent' }]}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mi progreso</Text>
      </View>

      <ScrollView
        style={webScrollStyle}
        showsVerticalScrollIndicator
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scroll, { flexGrow: 1 }]}
      >

        {/* ── Termómetro ── */}
        <GlassCard style={{ marginBottom: 20 }} contentStyle={{ padding: 20 }}>
          <Text style={styles.sectionLabel}>Horas de práctica</Text>

          <View style={styles.circleRow}>
            <CircleProgress pct={pct} aprobadas={horasAprobadas} objetivo={horasObjetivo} />

            <View style={styles.statsCol}>
              <StatItem label="Aprobadas"   value={horasAprobadas}  color={COLORS.success} />
              <StatItem label="En proceso"  value={horasEnProceso}  color={COLORS.warning} />
              <StatItem label="Restantes"   value={Math.max(0, horasObjetivo - horasAprobadas)} color={COLORS.textMuted} />
              <StatItem label="Objetivo"    value={horasObjetivo}   color={COLORS.primaryLight} />
            </View>
          </View>

          {pct >= 100 && (
            <View style={styles.metaBanner}>
              <Ionicons name="trophy" size={18} color={COLORS.gold} />
              <Text style={styles.metaText}>¡Meta alcanzada! Eres un Graduado.</Text>
            </View>
          )}
        </GlassCard>

        {/* ── Cupos que su universidad le aseguró (tablero de selección) ──
            Va aquí y NO en el feed de vacantes: ese feed solo lo ven quienes
            YA culminaron su práctica, justo el público contrario a este. */}
        {user?.uid && (
          <TableroCupos
            estudianteId={user.uid}
            universidadId={perfil?.universidad_id ?? (userProfile as any)?.universidad_id}
            grupoId={perfil?.grupo_id}
            estudianteNombre={(userProfile as any)?.nombre_completo ?? ''}
          />
        )}

        {/* ── Mi pasantía (acuerdo de grupo aprobado) ── */}
        {acuerdo && (
          <>
            <Text style={styles.sectionTitle}>Mi pasantía</Text>
            <MiPasantiaCard acuerdo={acuerdo} estadoServidor={pasantiaEstado} />
          </>
        )}

        {/* ── Calendario: días acordados de asistencia a la práctica ── */}
        {user?.uid && (
          <>
            <Text style={styles.sectionTitle}>Mi calendario</Text>
            <CalendarioEventos uid={user.uid} rol="estudiante" />
          </>
        )}

        {/* ── Pasantía activa ── */}
        <Text style={styles.sectionTitle}>Pasantía activa</Text>
        {activa ? (
          <PasantiaActivaCard app={activa} onFinalizar={() => handleFinalizar(activa.id)} />
        ) : (
          <View style={styles.emptySection}>
            <Ionicons name="briefcase-outline" size={40} color={COLORS.border} />
            <Text style={styles.emptyText}>Sin pasantía activa en este momento.</Text>
          </View>
        )}

        {/* ── Historial ── */}
        <Text style={styles.sectionTitle}>Historial</Text>
        {historial.length === 0 ? (
          <View style={styles.emptySection}>
            <Text style={styles.emptyText}>Aquí aparecerán tus pasantías completadas.</Text>
          </View>
        ) : (
          historial.map(app => (
            <GlassCard key={app.id} style={{ marginBottom: 8 }} contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
              <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
              <View style={{ flex: 1 }}>
                <Text style={styles.historialEmpresa}>{app.nombre_empresa ?? 'Empresa'}</Text>
                <Text style={styles.historialHoras}>{app.horas_completadas ?? 0} horas completadas</Text>
              </View>
              {app.calificacion_empresa > 0 && (
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map(s => (
                    <Ionicons
                      key={s}
                      name={s <= app.calificacion_empresa ? 'star' : 'star-outline'}
                      size={14}
                      color={COLORS.gold}
                    />
                  ))}
                </View>
              )}
            </GlassCard>
          ))
        )}

        {/* ── Mis Ingresos ── */}
        <Text style={styles.sectionTitle}>Mis Ingresos</Text>

        {/* Resumen total */}
        <GlassCard style={[{ marginBottom: 12 }, { borderColor: 'rgba(16,185,129,0.25)' }]} contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
          <Ionicons name="wallet-outline" size={22} color={COLORS.success} />
          <View>
            <Text style={styles.ingresosLabel}>Total recibido</Text>
            <Text style={styles.ingresosTotal}>${totalIngresos.toFixed(2)}</Text>
          </View>
        </GlassCard>

        {transacciones.length === 0 ? (
          <View style={styles.emptySection}>
            <Text style={styles.emptyText}>Sin transacciones registradas aún.</Text>
          </View>
        ) : (
          transacciones.map(tx => {
            const color = tx.estado === 'completado' ? COLORS.success : tx.estado === 'fallido' ? COLORS.error : COLORS.warning;
            return (
              <GlassCard key={tx.id} style={{ marginBottom: 8 }} contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txConcepto} numberOfLines={1}>{tx.concepto}</Text>
                  <Text style={styles.txMeta}>
                    ${(tx.monto ?? 0).toFixed(2)} · {tx.fecha?.toDate?.()?.toLocaleDateString('es-SV') ?? '—'}
                  </Text>
                  {tx.referencia ? <Text style={styles.txRef}>Ref: {tx.referencia}</Text> : null}
                </View>
                <View style={{ gap: 6, alignItems: 'flex-end' }}>
                  <View style={[styles.txEstadoBadge, { borderColor: color + '44', backgroundColor: color + '11' }]}>
                    <Text style={[styles.txEstadoText, { color }]}>{tx.estado}</Text>
                  </View>
                  {tx.estado === 'completado' && (
                    <JellyButton style={styles.reciboBtn} contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10 }} onPress={() => handleCompartirRecibo(tx)}>
                      <Ionicons name="share-outline" size={14} color={COLORS.primaryLight} />
                      <Text style={styles.reciboBtnText}>Recibo</Text>
                    </JellyButton>
                  )}
                </View>
              </GlassCard>
            );
          })
        )}

      </ScrollView>
    </View>
    </LiquidBackground>
  );
}

function StatItem({ label, value, color }: { label: string; value: number; color: string }) {
  const { styles } = useThemedStyles();
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, { color, fontFamily: FONTS.rajdhaniBold }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────
const makeStyles = (COLORS: GradlyColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.backgroundDark },
  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: 22, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
  scroll: { padding: 16, paddingBottom: 100 },

  // Card termómetro
  card: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: COLORS.border,
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 11, fontFamily: FONTS.interSemiBold,
    color: COLORS.primaryLight, textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 16,
  },
  circleRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },

  // Indicador circular
  svgWrap: { alignItems: 'center', gap: 10 },
  pctBig: {
    fontSize: 34, fontFamily: FONTS.rajdhaniBold, lineHeight: 36,
  },
  pctHrs: {
    fontSize: 10, fontFamily: FONTS.interRegular,
    color: COLORS.textMuted, textAlign: 'center',
  },
  nivelBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  nivelText: { fontSize: 11, fontFamily: FONTS.interSemiBold },

  // Stats
  statsCol: { flex: 1, gap: 12 },
  statItem: { alignItems: 'flex-start' },
  statValue: { fontSize: 28 },
  statLabel: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted },

  // Meta banner
  metaBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.gold + '15',
    borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: COLORS.gold + '30',
    marginTop: 12,
  },
  metaText: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.gold },

  // Barras
  barTrack: {
    height: 6, backgroundColor: COLORS.backgroundSurface,
    borderRadius: 3, overflow: 'hidden', marginBottom: 8,
  },
  barFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 3 },

  // Secciones
  sectionTitle: {
    fontSize: 15, fontFamily: FONTS.soraSemiBold,
    color: COLORS.textPrimary, marginBottom: 10, marginTop: 4,
  },

  // Pasantía activa
  activaCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.border,
    marginBottom: 16, gap: 10,
  },
  activaHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  activaEmpresa: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  activaVacante: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  estadoBadge: {
    backgroundColor: COLORS.success + '20',
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: COLORS.success + '40',
  },
  estadoText: { fontSize: 10, fontFamily: FONTS.interSemiBold, color: COLORS.success },
  diasRow: { flexDirection: 'row', justifyContent: 'space-between' },
  diasLabel: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  diasPct: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },
  horasText: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  finalizarBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.warning + '15',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: COLORS.warning + '30',
  },
  finalizarText: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: COLORS.warning },

  // Mi pasantía (acuerdo de grupo)
  miPasanRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  miPasanText: { flex: 1, fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  miPasanRestante: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },

  // Historial
  historialCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 8,
  },
  historialEmpresa: { fontSize: 14, fontFamily: FONTS.interMedium, color: COLORS.textPrimary },
  historialHoras: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  starsRow: { flexDirection: 'row', gap: 2 },

  // Empty
  emptySection: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 14, padding: 24,
    alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: COLORS.border,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 13, fontFamily: FONTS.interRegular,
    color: COLORS.textMuted, textAlign: 'center',
  },

  // ── Ingresos
  ingresosResumen: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)', marginBottom: 12,
  },
  ingresosLabel: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  ingresosTotal: { fontSize: 24, fontFamily: FONTS.rajdhaniBold, color: COLORS.success },
  txCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 8,
  },
  txConcepto: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  txMeta: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  txRef: { fontSize: 10, fontFamily: FONTS.interRegular, color: COLORS.textMuted, marginTop: 2 },
  txEstadoBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  txEstadoText: { fontSize: 10, fontFamily: FONTS.interSemiBold },
  reciboBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.primary12, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: COLORS.primary35,
  },
  reciboBtnText: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },
});
