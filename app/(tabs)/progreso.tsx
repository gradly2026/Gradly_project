// ════════════════════════════════════════════════════════════════════════
// app/(tabs)/progreso.tsx — pestaña "Progreso" del estudiante
//
// GUÍA PARA PRINCIPIANTES:
// Esta es la pantalla donde el estudiante ve el avance de su práctica:
// un círculo de porcentaje de horas, un "termómetro" de estadísticas, el
// tablero de cupos que su universidad le aseguró, la tarjeta de su
// pasantía actual (si tiene una vía grupo), un calendario, la pasantía
// "activa" (si aplicó individualmente a una vacante), y su historial de
// pasantías completadas. Es la pantalla más rica en LECTURAS EN VIVO
// (onSnapshot) de todo el proyecto: tiene 4 escuchas simultáneas a
// distintas colecciones de Firestore, todas relacionadas con el mismo
// estudiante. También tiene un ejemplo interesante de dibujo geométrico
// puro (el círculo de progreso, sin usar ninguna librería de gráficos).
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,

  TouchableOpacity,
  View,
} from 'react-native';
import { AutoText as Text } from "../../src/components/AutoText";
import { showAlert, showConfirm } from "../../src/components/AppAlert";
import { useAuth } from '../../src/context/AuthContext';
import { useTranslation } from '../../src/context/TranslationContext';
import { db } from '../../src/config/firebaseConfig';
import { COLORS, FONTS, useTheme, type GradlyColors } from '../../src/context/ThemeContext';
import { estudianteFinalizaProyecto } from '../../src/services/pasantiaService';
import { abrirChatDirectoEmpresaEstudiante } from '../../src/services/chatService';
import { progresoPorFechas } from '../../src/utils/progresoPasantia';
// Función utilitaria: dado un rango de fechas (inicio/fin de una
// pasantía), calcula en qué punto del tiempo estamos AHORA — devuelve
// cosas como el estado ('por_iniciar' | 'en_curso' | 'completado'), el
// porcentaje transcurrido, días transcurridos/totales/restantes. Se usa
// para dibujar la "línea de tiempo" de la tarjeta "Mi pasantía".
import CalendarioEventos from '../../src/components/CalendarioEventos';
import TableroCupos from '../../src/components/TableroCupos';
import MiInstitucionCard from '../../src/components/MiInstitucionCard';
import { textoHorario } from '../../src/data/disponibilidad';
import type { AsignacionCupo } from '../../src/services/reclamoCuposService';
import type { ProgresoMeta } from '../../src/utils/horasPasantia';
import { useProgresoInscripcion } from '../../src/hooks/useProgresoInscripcion';
// Libro mayor de horas del reparto de cupos: horas que avanzan solas desde la
// fecha de presentación que fijó la empresa, sobre la meta del grupo (Fase D).
// Ficha completa de la universidad y el grupo del estudiante. Va primero
// en esta pantalla porque es el CONTEXTO de todo lo demás: las horas, el
// calendario y el período de prácticas los define su grupo.
import { LiquidBackground } from '../../components/ui/liquid-glass/LiquidBackground';
import { GlassCard } from '../../components/ui/liquid-glass/GlassCard';
import { JellyButton } from '../../components/ui/liquid-glass/JellyButton';
// JellyButton: otro componente decorativo del "sistema de diseño" Liquid
// Glass del proyecto — un botón con una animación elástica al presionarlo.

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
  // La forma de un documento de la colección "aplicaciones" (aplicación
  // INDIVIDUAL a una vacante, no de grupo) — mismo concepto ya visto en
  // pasantiaService.ts.
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
  // Versión LOCAL (redefinida en este archivo) del mismo cálculo de
  // nivel gamificado que ya vimos como calcularNivelEstudiante() en
  // pasantiaService.ts — aquí se repite con un formato de retorno
  // distinto (usa directamente `COLORS` fijo en vez de recibir la paleta
  // como parámetro), pero la idea de negocio es la misma: 5 escalones
  // según el % de horas.
  if (pct >= 100) return { name: 'Graduado',    icon: 'trophy'    as const, color: COLORS.gold };
  if (pct >= 76)  return { name: 'Experto',     icon: 'star'      as const, color: COLORS.warning };
  if (pct >= 51)  return { name: 'Profesional', icon: 'briefcase' as const, color: COLORS.success };
  if (pct >= 26)  return { name: 'Practicante', icon: 'bag'       as const, color: COLORS.primaryLight };
  return           { name: 'Explorador',  icon: 'compass'   as const, color: COLORS.accent };
  // "as const" después de cada nombre de ícono: fija el TIPO exacto de
  // ese texto (por ejemplo, literalmente 'trophy'), necesario porque el
  // prop `name` de <Ionicons> espera uno de una lista cerrada de nombres
  // válidos, no cualquier `string` genérico.
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
  // GUÍA DEL TRUCO GEOMÉTRICO: React Native "puro" (sin una librería de
  // dibujo vectorial como react-native-svg) no tiene una forma directa de
  // dibujar "un arco que cubre el X% de un círculo". La técnica usada
  // aquí es un truco clásico de CSS/React Native:
  //   1. Se dibuja un círculo COMPLETO gris de fondo (el "track" o riel).
  //   2. Se dibujan DOS mitades de círculo (semianillos) por separado —
  //      cada una es en realidad un círculo completo con SOLO 2 de sus 4
  //      lados de borde coloreados (los otros 2 transparentes), recortado
  //      (overflow: 'hidden') para que solo se vea su mitad
  //      correspondiente (derecha o izquierda).
  //   3. Cada semianillo se ROTA (transform: rotate) una cantidad de
  //      grados proporcional al progreso, revelando gradualmente más o
  //      menos "arco" coloreado.
  // Es más difícil de seguir que usar una librería de gráficos, pero
  // evita agregar una dependencia extra solo para este único círculo.
  const { styles } = useThemedStyles();
  const clamped  = Math.min(pct, 100);
  // "clamped" (acotado): nunca deja pasar de 100, por seguridad, aunque
  // `pct` ya debería venir acotado desde quien llama a este componente.
  const nivel    = getLevel(pct);
  const arcColor = pct >= 100 ? COLORS.gold : COLORS.primary;
  // El color del arco cambia a dorado si ya se alcanzó el 100%.

  // Semianillo derecho: cubre 0–50 % (0°–180°)
  // rotate -90 = 0 % visible, rotate +90 = 50 % visible
  const rotDer = clamped <= 50
    ? (clamped / 50) * 180 - 90
    : 90;
  // Si el progreso es 50% o menos, el semianillo DERECHO hace todo el
  // trabajo: se rota proporcionalmente entre -90° (nada visible) y +90°
  // (la mitad derecha completa visible). Si el progreso ya pasa de 50%,
  // el semianillo derecho queda fijo en +90° (completamente lleno) y el
  // trabajo restante lo hace el semianillo izquierdo (ver abajo).

  // Semianillo izquierdo: cubre 50–100 % (180°–360°)
  // rotate -90 = 0 extra, rotate +90 = otro 50 % visible
  const rotIzq = clamped > 50
    ? ((clamped - 50) / 50) * 180 - 90
    : -90;
  // Simétrico al anterior: si el progreso supera 50%, el semianillo
  // IZQUIERDO empieza a revelarse proporcionalmente al EXCEDENTE sobre
  // 50% (por ejemplo, con 75% de progreso, esta mitad muestra la mitad
  // de SU propio arco). Si el progreso es 50% o menos, este semianillo
  // se mantiene en -90° (totalmente oculto).

  return (
    <View style={styles.svgWrap}>
      <View style={{ width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' }}>
        {/* Track (fondo gris) */}
        <View style={{
          position: 'absolute', width: RING_SIZE, height: RING_SIZE,
          borderRadius: RING_HALF, borderWidth: RING_THICKNESS,
          borderColor: COLORS.border,
        }} />
        {/* Un círculo completo (borderRadius = mitad del tamaño = círculo
            perfecto) con TODO su borde del mismo color apagado — sirve de
            "riel" de fondo, visible en la parte que el progreso todavía
            no cubre. */}

        {/* Semianillo derecho (derecho = x ≥ HALF) */}
        <View style={{
          position: 'absolute', top: 0, right: 0,
          width: RING_HALF, height: RING_SIZE, overflow: 'hidden',
          // Esta "ventana" recortada (overflow: hidden) ocupa solo la
          // MITAD DERECHA del cuadrado total — cualquier cosa que se
          // dibuje adentro y se salga de esta ventana queda invisible.
        }}>
          <View style={{
            position: 'absolute', top: 0, left: -RING_HALF,
            // "left: -RING_HALF" desplaza este círculo COMPLETO hacia la
            // izquierda, de forma que su mitad derecha caiga justo dentro
            // de la ventana recortada de arriba.
            width: RING_SIZE, height: RING_SIZE, borderRadius: RING_HALF,
            borderWidth: RING_THICKNESS,
            borderTopColor: arcColor, borderRightColor: arcColor,
            borderBottomColor: 'transparent', borderLeftColor: 'transparent',
            // Solo los bordes SUPERIOR y DERECHO tienen color — los otros
            // 2 son transparentes. Combinado con la rotación, esto
            // produce el efecto de "arco creciente" en el cuadrante
            // derecho.
            transform: [{ rotate: `${rotDer}deg` }],
            opacity: clamped > 0 ? 1 : 0,
            // Con 0% de progreso, se oculta del todo (opacity 0) — evita
            // mostrar un puntito de color con progreso exactamente en 0.
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
  // Diferencia entre 2 fechas en MILISEGUNDOS, dividida entre
  // 86,400,000 (la cantidad de milisegundos que tiene UN día completo:
  // 24h × 60min × 60s × 1000ms) → da la cantidad de DÍAS completos
  // transcurridos. Math.floor() redondea hacia abajo (no cuenta un día
  // parcial como completo). El guion bajo en "86_400_000" es solo un
  // separador visual de miles que JavaScript permite en números
  // literales, para que sea más fácil de leer a simple vista.
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
        {/* La barra de progreso simple SÍ usa el truco más sencillo:
            un <View> cuyo ancho es un porcentaje de texto ("75%"), dentro
            de un contenedor con overflow oculto — no necesita el truco
            geométrico complejo del círculo de arriba, porque una barra
            RECTA sí se puede expresar directo con `width` como
            porcentaje. */}
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
// TARJETA "MI INSCRIPCIÓN" (pasantía de cupo / autoservicio, Fase D)
// Muestra el libro mayor de horas: horas que avanzan solas desde el "Día 1"
// que fijó la empresa, sobre la meta del grupo.
// ─────────────────────────────────────────────
function MiInscripcionCard({ asignacion, ledger }: { asignacion: AsignacionCupo; ledger: ProgresoMeta | null }) {
  const { styles } = useThemedStyles();
  const router = useRouter();
  const [abriendoChat, setAbriendoChat] = useState(false);
  const horario = textoHorario(asignacion.horario);
  const sinFecha = !asignacion.fechaPresentacion;

  // Chat directo con la empresa para coordinar el primer día. El helper usa un
  // id determinístico (`direct_{empresaId}_{estudianteId}`): si ya existía la
  // conversación, la reutiliza — nunca crea una repetida.
  const chatearConEmpresa = async () => {
    if (abriendoChat || !asignacion.empresaId || !asignacion.estudianteId) return;
    setAbriendoChat(true);
    try {
      const chatId = await abrirChatDirectoEmpresaEstudiante({
        empresaId: asignacion.empresaId,
        empresaNombre: asignacion.empresaNombre || 'Empresa',
        estudianteId: asignacion.estudianteId,
        estudianteNombre: asignacion.estudianteNombre || 'Estudiante',
        contexto: 'candidatura',
      });
      router.push({ pathname: '/ChatScreen', params: { chatId, peerName: asignacion.empresaNombre || 'Empresa' } } as any);
    } catch {
      void showAlert('Error', 'No se pudo abrir el chat con la empresa.');
    } finally {
      setAbriendoChat(false);
    }
  };
  const completado = ledger?.completado ?? false;
  const pct = ledger?.pct ?? 0;
  const badge = completado
    ? { label: 'Completada', color: COLORS.gold }
    : sinFecha
      ? { label: 'Por iniciar', color: COLORS.primaryLight }
      : { label: 'Activa', color: COLORS.success };

  return (
    <GlassCard style={{ marginBottom: 16 }} contentStyle={{ padding: 16, gap: 10 }}>
      <View style={styles.activaHeader}>
        <Ionicons name="ribbon-outline" size={22} color={COLORS.primaryLight} />
        <View style={{ flex: 1 }}>
          <Text style={styles.activaEmpresa} numberOfLines={1} noTranslate>
            {asignacion.empresaNombre || 'Empresa'}
          </Text>
          <Text style={styles.activaVacante} numberOfLines={1} noTranslate>
            {asignacion.vacanteTitulo || 'Pasantía'}
          </Text>
        </View>
        <View style={[styles.estadoBadge, { borderColor: badge.color + '40', backgroundColor: badge.color + '20' }]}>
          <Text style={[styles.estadoText, { color: badge.color }]}>{badge.label}</Text>
        </View>
      </View>

      {sinFecha ? (
        <View style={styles.metaBanner}>
          <Ionicons name="information-circle-outline" size={16} color={COLORS.primaryLight} />
          <Text style={[styles.metaText, { color: COLORS.primaryLight, flex: 1 }]}>
            Coordina con la empresa tu primer día. El conteo de horas arranca ese día.
          </Text>
          <TouchableOpacity
            style={styles.bannerChatBtn}
            onPress={chatearConEmpresa}
            disabled={abriendoChat}
            hitSlop={8}
            accessibilityLabel="Chatear con la empresa"
          >
            {abriendoChat
              ? <ActivityIndicator size="small" color={COLORS.primaryLight} />
              : <Ionicons name="chatbubbles" size={18} color={COLORS.primaryLight} />}
          </TouchableOpacity>
        </View>
      ) : ledger ? (
        <>
          <View style={styles.diasRow}>
            <Text style={styles.diasLabel}>{ledger.cumplidas} / {ledger.meta} h</Text>
            <Text style={[styles.diasPct, completado && { color: COLORS.gold }]}>{pct}%</Text>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${pct}%` as any, backgroundColor: completado ? COLORS.gold : COLORS.primary }]} />
          </View>
          <Text style={styles.horasText}>
            {completado ? 'Cumpliste todas tus horas de práctica.' : `Te faltan ${ledger.restantes} h`}
          </Text>
        </>
      ) : null}

      {!!horario && (
        <View style={styles.miPasanRow}>
          <Ionicons name="time-outline" size={15} color={COLORS.textMuted} />
          <Text style={styles.miPasanText} numberOfLines={2}>{horario}</Text>
        </View>
      )}
      {!sinFecha && (
        <View style={styles.miPasanRow}>
          <Ionicons name="calendar-outline" size={15} color={COLORS.textMuted} />
          <Text style={styles.miPasanText} noTranslate>
            Primer día: {asignacion.fechaPresentacion}
            {ledger?.fechaFin ? `  ·  último ~${ledger.fechaFin.toISOString().slice(0, 10)}` : ''}
          </Text>
        </View>
      )}
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
  // Una cadena de ternarios anidados que actúa como un "switch" compacto:
  // revisa el estado que llegó del servidor (leído de
  // solicitudes_practicas más abajo en el componente padre) y, si
  // coincide con alguno de los 3 casos "terminales" del ciclo de vida,
  // arma un override con su propia etiqueta y color — que tiene PRIORIDAD
  // sobre lo que digan las fechas.

  const estadoLabel =
    estadoOverride?.label ??
    (prog.estado === 'por_iniciar'
      ? 'Por iniciar'
      : prog.estado === 'completado'
        ? 'Completada'
        : 'En curso');
  // Si hay un override (la pasantía ya terminó o se certificó), se usa su
  // etiqueta; si no (todavía está en curso según el ciclo de vida), se
  // calcula la etiqueta a partir de `prog.estado` (calculado por fechas).
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
  const { t } = useTranslation();
  const { styles, colors } = useThemedStyles();
  const webScrollStyle = Platform.OS === 'web'
    ? ({ scrollbarColor: `${colors.primary35} ${colors.backgroundSurface}`, scrollbarWidth: 'thin' } as any)
    : undefined;

  const [perfil,        setPerfil]        = useState<EstudiantePerfil | null>(null);
  const [apps,          setApps]          = useState<Aplicacion[]>([]);
  const [acuerdo,       setAcuerdo]       = useState<AcuerdoEstudiante | null>(null);
  const [pasantiaEstado, setPasantiaEstado] = useState<string | null>(null);
  const [cargando,      setCargando]      = useState(true);
  // 5 estados distintos, cada uno alimentado por su PROPIO useEffect con
  // onSnapshot (ver los 4 bloques "Firestore:" más abajo) — esta pantalla
  // combina datos de 4 colecciones diferentes de Firestore, todas
  // relacionadas con el mismo estudiante, para armar una vista unificada.

  const horasObjetivoPerfil = perfil?.horas_objetivo   ?? 500;
  const horasAprobadas      = perfil?.horas_aprobadas  ?? 0;
  const horasEnProceso      = perfil?.horas_en_proceso ?? 0;

  // Libro mayor de horas del reparto de cupos (Fase D). Si el estudiante está
  // inscrito a una pasantía de cupo con fecha de presentación fijada, el
  // termómetro muestra sus horas REALES avanzando; si no, cae al expediente
  // del perfil (`horas_aprobadas`/`horas_objetivo`, que solo se acreditan al
  // certificar).
  const { asignacion: inscripcion, metaHoras: metaInscripcion, progreso: ledger } = useProgresoInscripcion(user?.uid);
  const horasObjetivo = ledger ? ledger.meta : horasObjetivoPerfil;
  const horasCumplidas = ledger ? ledger.cumplidas : horasAprobadas;
  const horasRestantes = ledger ? ledger.restantes : Math.max(0, horasObjetivoPerfil - horasAprobadas);
  const pct = ledger
    ? ledger.pct
    : Math.min(100, Math.round((horasAprobadas / horasObjetivoPerfil) * 100));

  const activa    = apps.find(a => a.estado === 'contratado');
  // .find() devuelve el PRIMER elemento que cumple la condición (o
  // undefined si ninguno la cumple) — a diferencia de .filter(), que
  // devolvería TODOS los que coincidan. Se asume que un estudiante solo
  // puede tener una aplicación "contratado" a la vez.
  const historial = apps.filter(a => a.estado === 'finalizado' || a.estado === 'aprobado');

  // ── Pasantías de cupo del estudiante (Fase E: las culminadas van a Historial) ──
  const [asignacionesCupo, setAsignacionesCupo] = useState<AsignacionCupo[]>([]);
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, 'asignaciones_cupo'), where('estudianteId', '==', user.uid)),
      snap => setAsignacionesCupo(snap.docs.map(d => ({ id: d.id, ...d.data() } as AsignacionCupo))),
      e => console.warn('Error en listener (asignaciones_cupo progreso):', e),
    );
    return unsub;
  }, [user]);
  const historialCupos = asignacionesCupo.filter(a => a.finalizada === true);
  // La inscripción "activa" para la sección "Pasantía activa" es la que aún NO
  // culminó; la culminada vive en Historial.
  const inscripcionActiva = inscripcion && !inscripcion.finalizada ? inscripcion : null;

  // ── Firestore: perfil ────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'perfiles_estudiantes', user.uid), snap => {
      // READ en vivo de UN SOLO documento (no una colección/query): así,
      // si algún proceso en segundo plano actualiza las horas aprobadas
      // del estudiante (por ejemplo, la universidad aprueba horas), esta
      // pantalla se actualiza SOLA, sin que el estudiante tenga que
      // recargar nada.
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

  // ── Firestore: acuerdo de pasantía del grupo (notificaciones del estudiante)
  // Toma el acuerdo vigente más reciente para mostrar "Mi pasantía".
  // Incluye `horario_modificado` (renegociación aceptada por ambas partes): esa
  // notificación trae los MISMOS campos que la original, así que al ser la más
  // nueva sustituye al acuerdo previo. Sin ella, el estudiante recibiría el
  // aviso del cambio pero su tarjeta seguiría mostrando el horario viejo.
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
          .filter(
            a =>
              (a.tipo === 'acuerdo_aprobado' || a.tipo === 'horario_modificado') &&
              a.fechaInicio,
          )
          // Se queda solo con notificaciones de tipo "acuerdo" (no todas
          // las que llegan a esta colección son sobre pasantías) y que
          // tengan una fecha de inicio (evita notificaciones incompletas).
          .sort(
            (a, b) =>
              (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
          );
          // Ordena de más reciente a más antigua, comparando la fecha
          // convertida a milisegundos (.toMillis() es otro método de los
          // Timestamp de Firestore, similar a .toDate() pero da un
          // número en vez de un objeto Date — más cómodo para restar
          // directamente en el sort).
        setAcuerdo(acuerdos[0] ?? null);
        // Toma solo el PRIMERO (el más reciente) de la lista ya ordenada
        // — así, si hubo una "horario_modificado" más nueva que la
        // "acuerdo_aprobado" original, la modificación gana y se muestra
        // esa (con el horario ya actualizado).
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

  const handleFinalizar = async (appId: string) => {
    // Se ejecuta al tocar "Notificar finalización" en la tarjeta de
    // pasantía activa. Usa showConfirm (Modal propio) y no Alert.alert:
    // este último es un no-op en react-native-web y el botón de confirmar
    // nunca se dispararía en el navegador (memoria "Gotcha Alert.alert en web").
    const app = apps.find(a => a.id === appId);
    const ok = await showConfirm({
      title: 'Confirmar finalización',
      message: '¿Seguro que quieres notificar que has finalizado esta pasantía? La empresa deberá confirmar.',
      confirmText: 'Sí, finalicé',
    });
    if (!ok) return;
    try {
      await estudianteFinalizaProyecto(
        appId,
        user!.uid,
        app?.horas_completadas ?? 0,
        app?.empresa_id,
        (userProfile as any)?.nombre_completo,
      );
    } catch {
      void showAlert('Error', 'No se pudo actualizar el estado.');
    }
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

        {/* ── Mi institución: universidad y grupo al que pertenece ──
            Va ARRIBA del termómetro a propósito: las horas objetivo, el
            calendario y el período que se ven más abajo salen todos del
            grupo, así que primero se dice de qué grupo hablamos. */}
        <Text style={styles.sectionTitle}>{t('inst_titulo')}</Text>
        <MiInstitucionCard
          universidadId={perfil?.universidad_id ?? (userProfile as any)?.universidad_id}
          grupoId={perfil?.grupo_id}
        />

        {/* ── Termómetro ── */}
        <GlassCard style={{ marginBottom: 20 }} contentStyle={{ padding: 20 }}>
          <Text style={styles.sectionLabel}>Horas de práctica</Text>

          <View style={styles.circleRow}>
            <CircleProgress pct={pct} aprobadas={Math.round(horasCumplidas)} objetivo={horasObjetivo} />

            <View style={styles.statsCol}>
              <StatItem label={ledger ? 'Cumplidas' : 'Aprobadas'} value={Math.round(horasCumplidas)} color={COLORS.success} />
              <StatItem label="En proceso"  value={horasEnProceso}  color={COLORS.warning} />
              <StatItem label="Restantes"   value={Math.round(horasRestantes)} color={COLORS.textMuted} />
              <StatItem label="Objetivo"    value={horasObjetivo}   color={COLORS.primaryLight} />
            </View>
          </View>

          {ledger?.completado ? (
            <View style={styles.metaBanner}>
              <Ionicons name="checkmark-done-circle" size={18} color={COLORS.success} />
              <Text style={styles.metaText}>Completaste tus horas de práctica.</Text>
            </View>
          ) : pct >= 100 ? (
            <View style={styles.metaBanner}>
              <Ionicons name="trophy" size={18} color={COLORS.gold} />
              <Text style={styles.metaText}>¡Meta alcanzada! Eres un Graduado.</Text>
            </View>
          ) : null}
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
            <CalendarioEventos
              uid={user.uid}
              rol="estudiante"
              inscripcion={
                inscripcion
                  ? {
                      horario: inscripcion.horario,
                      fechaPresentacion: inscripcion.fechaPresentacion,
                      fechaFin: ledger?.fechaFin ?? null,
                    }
                  : null
              }
            />
          </>
        )}

        {/* ── Pasantía activa ── */}
        <Text style={styles.sectionTitle}>Pasantía activa</Text>
        {activa ? (
          <PasantiaActivaCard app={activa} onFinalizar={() => handleFinalizar(activa.id)} />
        ) : inscripcionActiva ? (
          <MiInscripcionCard asignacion={inscripcionActiva} ledger={ledger} />
        ) : (
          <View style={styles.emptySection}>
            <Ionicons name="briefcase-outline" size={40} color={COLORS.border} />
            <Text style={styles.emptyText}>Sin pasantía activa en este momento.</Text>
          </View>
        )}

        {/* ── Historial ── */}
        <Text style={styles.sectionTitle}>Historial</Text>
        {historial.length === 0 && historialCupos.length === 0 ? (
          <View style={styles.emptySection}>
            <Text style={styles.emptyText}>Aquí aparecerán tus pasantías completadas.</Text>
          </View>
        ) : (
          <>
            {historial.map(app => (
              <GlassCard key={app.id} style={{ marginBottom: 8 }} contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.historialEmpresa}>{app.nombre_empresa ?? 'Empresa'}</Text>
                  <Text style={styles.historialHoras}>{app.horas_completadas ?? 0} horas completadas</Text>
                </View>
                {app.calificacion_empresa > 0 && (
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map(s => (
                      // Dibuja 5 estrellas, cada una rellena o vacía según
                      // si su número (1 a 5) es menor o igual a la
                      // calificación real.
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
            ))}

            {/* Pasantías de cupo culminadas (Fase E). El nº de horas se guardó
                en `horasCumplidas` al cerrarse; para las culminadas antes de
                que existiera ese campo, se cae a la meta si es la misma que
                sigue en el libro mayor. */}
            {historialCupos.map(a => {
              const horas =
                a.horasCumplidas ??
                (metaInscripcion && inscripcion?.id === a.id ? metaInscripcion : null);
              return (
                <GlassCard key={a.id} style={{ marginBottom: 8 }} contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historialEmpresa}>{a.empresaNombre ?? 'Empresa'}</Text>
                    <Text style={styles.historialHoras}>
                      {horas != null ? `${Math.round(horas)} horas completadas` : 'Pasantía completada'}
                    </Text>
                    {!!a.vacanteTitulo && (
                      <Text style={styles.historialHoras}>{a.vacanteTitulo}</Text>
                    )}
                  </View>
                </GlassCard>
              );
            })}
          </>
        )}

      </ScrollView>
    </View>
    </LiquidBackground>
  );
}

function StatItem({ label, value, color }: { label: string; value: number; color: string }) {
  // Componente pequeño reutilizado 4 veces en el "termómetro" de arriba
  // (Aprobadas/En proceso/Restantes/Objetivo) — un número grande + una
  // etiqueta debajo.
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
  // La cabecera y el contenido se centran y se topan al mismo ancho (760):
  // un poco más anchos que el feed de vacantes, pero sin estirarse de borde
  // a borde en web/tablet. En móvil ocupan todo el ancho disponible.
  header: {
    width: '100%', maxWidth: 760, alignSelf: 'center',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: 22, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
  scroll: { padding: 16, paddingBottom: 100, width: '100%', maxWidth: 760, alignSelf: 'center' },

  // Card termómetro
  card: {
    // No usado directamente en el JSX (GlassCard maneja su propio fondo);
    // queda como estilo de respaldo sin aplicar.
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
  bannerChatBtn: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.primary12, borderWidth: 1, borderColor: COLORS.primary35,
  },

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
    // Tampoco usado directamente (PasantiaActivaCard usa GlassCard en su
    // lugar).
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
    // No usado directamente (el .map() de historial usa GlassCard en su
    // lugar).
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
});
