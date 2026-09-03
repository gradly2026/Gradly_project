// ════════════════════════════════════════════════════════════════════════
// SeccionReclutamiento.tsx  —  pestaña "Reclutamiento" del dashboard empresa.
//
// Reemplaza al viejo tablero Kanban lineal (pendiente → en_revisión →
// entrevista → contratado, con un botón "Avanzar →" que no pedía ninguna
// decisión). La unidad ahora es LA VACANTE:
//
//   ┌ Pestañas ──────────────────────────────────────────────────────────┐
//   │  [ En reclutamiento ]   [ Contratado ]                              │
//   ├────────────────────────────────────────────────────────────────────┤
//   │  filtro:  ( Vacantes )                         ← "Puestos" / "Todos │
//   │                                                  los contratados"   │
//   │  ┌───────┐ ┌───────┐ ┌───────┐   (fila de 3 en desktop,            │
//   │  │vacante│ │vacante│ │vacante│    lista en móvil — como la Imagen1) │
//   │  └───────┘ └───────┘ └───────┘   ordenadas "pan caliente":         │
//   │                                   más postulantes → primero        │
//   └────────────────────────────────────────────────────────────────────┘
//
// Al tocar una tarjeta se abre una MICROSECCIÓN interna (no un modal) con
// los datos de la vacante y el listado de candidatos.
//
// FASE 1 · cascarón navegable + microsección con los 11 datos.
// FASE 2 (este commit) · listado de candidatos con chips-filtro por skill +
//   "Hizo su pasantía con nosotros" + "Mejor calificados" + "Todos" (ranking
//   compuesto), y por candidato: perfil, chat, CV (menú Ver/Abrir), Rechazar
//   (modal con motivo → notifica al estudiante) y Contratar (confirmación →
//   crea el contrato; si con eso se cubren los cupos, descarta al resto y
//   cierra la vacante). Botón "Cerrar vacante" cuando ya hay ≥1 contratado.
// FASE 3 · detalle rico del puesto contratado (tareas, calendario, despedir).
// ════════════════════════════════════════════════════════════════════════
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { AutoText as Text, AutoTextInput as TextInput } from './AutoText';
import { db } from '../config/firebaseConfig';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { GlassCard } from '../../components/ui/liquid-glass/GlassCard';
import MapViewer from './MapViewer';
import { cuposDisponibles, cuposTotales, textoCupos, textoSalario } from '../utils/cupos';
import { textoHorario } from '../data/disponibilidad';
import { matchSkills, normalizarSkill } from '../utils/skills';
import { scoreCandidato } from '../utils/rankingCandidatos';
import { usePasantesEmpresa } from '../hooks/usePasantesEmpresa';
import {
  cerrarVacante,
  contratarCandidato,
  type VacanteParaContrato,
} from '../services/contratoService';
import { enviarNotificacion } from '../services/notificationService';

// ── Formas mínimas que usa esta pantalla. El `Vacante` / `Aplicacion`
//    completos viven en app/dashboard-empresa.tsx (no exportados); estas
//    interfaces son un subconjunto estructural — pasar el tipo completo
//    encaja sin conversiones. ──
export interface VacanteReclutamiento {
  id: string;
  titulo: string;
  descripcion?: string;
  categoria?: 'pasantia' | 'vacante';
  area?: string;
  modalidad?: string;
  modalidad_contrato?: string;
  tipo?: string;
  tags?: string[];
  skills_requeridas?: string[];
  fecha_creacion?: any;
  fecha_publicacion?: any;
  fecha_limite?: any;
  cupos?: number | null;
  cupos_reclamados?: number | null;
  contratados_count?: number | null;
  aplicantes_count?: number | null;
  horario?: any;
  salario_min?: number | null;
  salario_max?: number | null;
  activa?: boolean;
  cerrada?: boolean;
  estado_moderacion?: string | null;
  ubicacion_coords?: { latitude: number; longitude: number } | null;
  ubicacion_texto?: { direccion: string; municipio: string; departamento: string; pais: string } | null;
}

export interface AplicacionReclutamiento {
  id: string;
  estudiante_id: string;
  estudiante_nombre: string;
  estudiante_foto?: string;
  vacante_id: string;
  estado: string;
  fecha_aplicacion?: any;
  titulo_vacante?: string;
}

/** Estados de `aplicaciones` que cuentan como "sigue en reclutamiento". Los
 *  legados 'en_revision' / 'entrevista' se colapsan a 'pendiente' (esas
 *  etapas se eliminaron: la coordinación de la entrevista es ahora el chat). */
const EN_RECLUTAMIENTO = new Set(['pendiente', 'en_revision', 'entrevista']);

/** "2026-08-30" (Timestamp/Date/ISO) → "hoy" / "ayer" / "30 ago" / "30 ago 2025". */
function fechaCreacionCorta(...candidatos: any[]): string {
  let d: Date | null = null;
  for (const c of candidatos) {
    if (!c) continue;
    if (typeof c?.toDate === 'function') { d = c.toDate(); break; }
    if (c instanceof Date) { d = c; break; }
    if (typeof c === 'string') {
      const ms = Date.parse(c);
      if (!Number.isNaN(ms)) { d = new Date(ms); break; }
    }
    if (typeof c?.seconds === 'number') { d = new Date(c.seconds * 1000); break; }
  }
  if (!d) return '';
  const hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) return 'hoy';
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === ayer.toDateString()) return 'ayer';
  const mismoAnio = d.getFullYear() === hoy.getFullYear();
  return d.toLocaleDateString('es-SV', mismoAnio
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "2026-09-15" → "15 sep 2026" (o el texto tal cual si no parsea). */
function fechaLimiteLegible(v: any): string {
  if (!v) return '';
  // Fecha "solo día" (YYYY-MM-DD) del formulario: construir en hora LOCAL para
  // no restar un día al formatear en zonas detrás de UTC (El Salvador, UTC-6).
  if (typeof v === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return d.toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  }
  const raw = typeof v?.toDate === 'function' ? v.toDate() : v;
  const ms = raw instanceof Date ? raw.getTime() : Date.parse(String(raw));
  if (Number.isNaN(ms)) return String(v);
  return new Date(ms).toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric' });
}

export interface ChatCandidatoArgs {
  estudianteId: string;
  estudianteNombre: string;
}

export default function SeccionReclutamiento({
  empresaId,
  empresaNombre,
  vacantes,
  apps,
  onVerPerfilCandidato,
  onChatCandidato,
}: {
  empresaId: string;
  empresaNombre: string;
  vacantes: VacanteReclutamiento[];
  apps: AplicacionReclutamiento[];
  onVerPerfilCandidato: (estudianteId: string) => void;
  onChatCandidato: (args: ChatCandidatoArgs) => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const esAncho = width >= 768;

  const { pasantes } = usePasantesEmpresa(empresaId);

  const [tab, setTab] = useState<'reclutamiento' | 'contratado'>('reclutamiento');
  const [filtroContratado, setFiltroContratado] = useState<'puestos' | 'todos'>('puestos');
  const [vacanteSelId, setVacanteSelId] = useState<string | null>(null);

  // ── Conteo de postulantes por vacante (pendientes / contratados) ──
  const conteos = useMemo(() => {
    const m: Record<string, { pendientes: number; contratados: number }> = {};
    for (const a of apps) {
      if (!m[a.vacante_id]) m[a.vacante_id] = { pendientes: 0, contratados: 0 };
      if (EN_RECLUTAMIENTO.has(a.estado)) m[a.vacante_id].pendientes += 1;
      else if (a.estado === 'contratado') m[a.vacante_id].contratados += 1;
    }
    return m;
  }, [apps]);

  // Solo vacantes de EMPLEO (graduados). Las pasantías siguen por su carril
  // (Matchmaking / reparto de cupos), no aparecen aquí.
  const vacantesEmpleo = useMemo(
    () => vacantes.filter((v) => v.categoria === 'vacante' && v.estado_moderacion !== 'eliminada'),
    [vacantes],
  );

  // "En reclutamiento": abiertas, ordenadas por demanda (pan caliente).
  const vacantesReclutamiento = useMemo(
    () =>
      [...vacantesEmpleo]
        .filter((v) => !v.cerrada)
        .sort((a, b) => (conteos[b.id]?.pendientes ?? 0) - (conteos[a.id]?.pendientes ?? 0)),
    [vacantesEmpleo, conteos],
  );

  // "Contratado" → filtro "Puestos": vacantes con al menos un contratado.
  const puestos = useMemo(
    () =>
      [...vacantesEmpleo]
        .filter((v) => (conteos[v.id]?.contratados ?? 0) > 0)
        .sort((a, b) => (conteos[b.id]?.contratados ?? 0) - (conteos[a.id]?.contratados ?? 0)),
    [vacantesEmpleo, conteos],
  );

  // "Contratado" → filtro "Todos los contratados": lista plana de personas.
  const contratados = useMemo(() => {
    const idsEmpleo = new Set(vacantesEmpleo.map((v) => v.id));
    return apps
      .filter((a) => a.estado === 'contratado' && idsEmpleo.has(a.vacante_id))
      .map((a) => {
        const v = vacantesEmpleo.find((x) => x.id === a.vacante_id);
        return { ...a, puestoTitulo: v?.titulo ?? a.titulo_vacante ?? 'Puesto' };
      })
      .sort((x, y) => x.estudiante_nombre.localeCompare(y.estudiante_nombre));
  }, [apps, vacantesEmpleo]);

  const vacanteSel = vacanteSelId ? vacantes.find((v) => v.id === vacanteSelId) ?? null : null;

  // Tras contratar (o cubrir cupos): llevar a la empresa a "Contratado".
  const irAContratado = () => {
    setTab('contratado');
    setFiltroContratado('puestos');
    setVacanteSelId(null);
  };

  // ── MICROSECCIÓN interna ──
  if (vacanteSel) {
    return (
      <VacanteMicroseccion
        vacante={vacanteSel}
        apps={apps}
        modo={tab}
        empresaId={empresaId}
        empresaNombre={empresaNombre}
        pasantes={pasantes}
        contratadosCount={conteos[vacanteSel.id]?.contratados ?? 0}
        colors={colors}
        s={s}
        onVolver={() => setVacanteSelId(null)}
        onVerPerfil={onVerPerfilCandidato}
        onChatCandidato={onChatCandidato}
        onContratado={irAContratado}
        onVacanteCerrada={irAContratado}
      />
    );
  }

  const cardWidth: '32%' | '100%' = esAncho ? '32%' : '100%';

  return (
    <View style={s.wrap}>
      {/* ── Pestañas ── */}
      <View style={s.tabs}>
        {([
          { id: 'reclutamiento', label: 'En reclutamiento' },
          { id: 'contratado', label: 'Contratado' },
        ] as const).map((t) => {
          const activo = tab === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              style={[s.tab, activo && s.tabActivo]}
              onPress={() => { setTab(t.id); setVacanteSelId(null); }}
              activeOpacity={0.8}
            >
              <Text style={[s.tabTxt, activo && s.tabTxtActivo]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Fila de filtros ── */}
      <View style={s.filtros}>
        {tab === 'reclutamiento' ? (
          <View style={[s.chipFiltro, s.chipFiltroActivo]}>
            <Ionicons name="briefcase" size={13} color="#fff" />
            <Text style={s.chipFiltroTxtActivo}>Vacantes</Text>
          </View>
        ) : (
          <>
            <TouchableOpacity
              style={[s.chipFiltro, filtroContratado === 'puestos' && s.chipFiltroActivo]}
              onPress={() => setFiltroContratado('puestos')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="business"
                size={13}
                color={filtroContratado === 'puestos' ? '#fff' : colors.textMuted}
              />
              <Text style={filtroContratado === 'puestos' ? s.chipFiltroTxtActivo : s.chipFiltroTxt}>
                Puestos
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.chipFiltro, filtroContratado === 'todos' && s.chipFiltroActivo]}
              onPress={() => setFiltroContratado('todos')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="people"
                size={13}
                color={filtroContratado === 'todos' ? '#fff' : colors.textMuted}
              />
              <Text style={filtroContratado === 'todos' ? s.chipFiltroTxtActivo : s.chipFiltroTxt}>
                Todos los contratados
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ── Contenido ── */}
      {tab === 'reclutamiento' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.grid} showsVerticalScrollIndicator={false}>
          {vacantesReclutamiento.length === 0 ? (
            <Text style={s.vacio}>No hay vacantes de empleo abiertas. Publica una desde "Mis Vacantes".</Text>
          ) : (
            <View style={s.gridRow}>
              {vacantesReclutamiento.map((v) => (
                <VacanteCard
                  key={v.id}
                  vacante={v}
                  conteo={conteos[v.id]?.pendientes ?? 0}
                  etiquetaConteo="postulantes"
                  width={cardWidth}
                  colors={colors}
                  s={s}
                  onPress={() => setVacanteSelId(v.id)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {tab === 'contratado' && filtroContratado === 'puestos' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.grid} showsVerticalScrollIndicator={false}>
          {puestos.length === 0 ? (
            <Text style={s.vacio}>Aún no has contratado a nadie. Cuando lo hagas, el puesto cubierto aparecerá aquí.</Text>
          ) : (
            <View style={s.gridRow}>
              {puestos.map((v) => (
                <VacanteCard
                  key={v.id}
                  vacante={v}
                  conteo={conteos[v.id]?.contratados ?? 0}
                  etiquetaConteo="contratados"
                  esPuesto
                  width={cardWidth}
                  colors={colors}
                  s={s}
                  onPress={() => setVacanteSelId(v.id)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {tab === 'contratado' && filtroContratado === 'todos' && (
        <FlatList
          data={contratados}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={s.listaPlana}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Text style={s.vacio}>Todavía no hay contratados.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.filaPersona}
              activeOpacity={0.75}
              onPress={() => item.estudiante_id && onVerPerfilCandidato(item.estudiante_id)}
              disabled={!item.estudiante_id}
            >
              <View style={s.avatar}>
                <Ionicons name="person" size={16} color={colors.primaryLight} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.personaNombre} numberOfLines={1}>{item.estudiante_nombre}</Text>
                <Text style={s.personaMeta} numberOfLines={1}>{item.puestoTitulo}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Tarjeta de vacante (grid de 3 en desktop / lista en móvil).
// ────────────────────────────────────────────────────────────────────────
function VacanteCard({
  vacante, conteo, etiquetaConteo, esPuesto, width, colors, s, onPress,
}: {
  vacante: VacanteReclutamiento;
  conteo: number;
  etiquetaConteo: 'postulantes' | 'contratados';
  esPuesto?: boolean;
  width: '32%' | '100%';
  colors: GradlyColors;
  s: ReturnType<typeof makeStyles>;
  onPress: () => void;
}) {
  const skills = vacante.skills_requeridas ?? [];
  const skillsVisibles = skills.slice(0, 3);
  const extra = skills.length - skillsVisibles.length;
  const salario = textoSalario(vacante.salario_min, vacante.salario_max);
  const fecha = fechaCreacionCorta(vacante.fecha_creacion, vacante.fecha_publicacion);
  const caliente = !esPuesto && conteo > 0;

  return (
    <GlassCard style={{ width, marginBottom: 12 }} contentStyle={{ padding: 14, gap: 9 }}>
      <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={{ gap: 9 }}>
        {/* Cabecera */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <View style={s.cardIcon}>
            <Ionicons name={esPuesto ? 'business' : 'briefcase'} size={16} color={colors.primaryLight} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitulo} numberOfLines={2}>{vacante.titulo}</Text>
            {!!fecha && <Text style={s.cardFecha}>{fecha}</Text>}
          </View>
          {vacante.activa === false && !esPuesto && (
            <View style={s.tagInactiva}><Text style={s.tagInactivaTxt}>Inactiva</Text></View>
          )}
        </View>

        {/* Chips */}
        <View style={s.chipsRow}>
          <View style={s.chip}><Text style={s.chipTxt}>{esPuesto ? 'Puesto' : 'Vacante'}</Text></View>
          {!!vacante.modalidad_contrato && (
            <View style={s.chip}><Text style={s.chipTxt}>{vacante.modalidad_contrato}</Text></View>
          )}
          {!!vacante.modalidad && (
            <View style={s.chip}><Text style={s.chipTxt}>{vacante.modalidad}</Text></View>
          )}
          {!!salario && (
            <View style={[s.chip, s.chipSalario]}>
              <Text style={[s.chipTxt, { color: colors.success }]} noTranslate>{salario}</Text>
            </View>
          )}
        </View>

        {/* Skills */}
        {skillsVisibles.length > 0 && (
          <View style={s.chipsRow}>
            {skillsVisibles.map((sk, i) => (
              <View key={`${sk}-${i}`} style={[s.chip, s.chipSkill]}>
                <Text style={s.chipSkillTxt} noTranslate>{sk}</Text>
              </View>
            ))}
            {extra > 0 && (
              <View style={[s.chip, s.chipSkill]}><Text style={s.chipSkillTxt}>{`+${extra}`}</Text></View>
            )}
          </View>
        )}

        {/* Pie: cupos + demanda */}
        <View style={s.cardPie}>
          {!!textoCupos(vacante) && <Text style={s.cardCupos}>{textoCupos(vacante)}</Text>}
          <View style={[s.conteoBadge, caliente && s.conteoBadgeCaliente]}>
            {caliente && <Ionicons name="flame" size={12} color={colors.warning} />}
            <Text style={[s.conteoBadgeTxt, caliente && { color: colors.warning }]} noTranslate>
              {conteo}{' '}
            </Text>
            <Text style={[s.conteoBadgeTxt, caliente && { color: colors.warning }]}>
              {etiquetaConteo === 'postulantes' ? 'postulantes' : 'contratados'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </GlassCard>
  );
}

// ────────────────────────────────────────────────────────────────────────
// MICROSECCIÓN: detalle de una vacante + listado de candidatos.
// ────────────────────────────────────────────────────────────────────────
function VacanteMicroseccion({
  vacante, apps, modo, empresaId, empresaNombre, pasantes, contratadosCount,
  colors, s, onVolver, onVerPerfil, onChatCandidato, onContratado, onVacanteCerrada,
}: {
  vacante: VacanteReclutamiento;
  apps: AplicacionReclutamiento[];
  modo: 'reclutamiento' | 'contratado';
  empresaId: string;
  empresaNombre: string;
  pasantes: Set<string>;
  contratadosCount: number;
  colors: GradlyColors;
  s: ReturnType<typeof makeStyles>;
  onVolver: () => void;
  onVerPerfil: (estudianteId: string) => void;
  onChatCandidato: (args: ChatCandidatoArgs) => void;
  onContratado: () => void;
  onVacanteCerrada: () => void;
}) {
  const esContratado = modo === 'contratado';
  const candidatosPendientes = apps.filter(
    (a) => a.vacante_id === vacante.id && EN_RECLUTAMIENTO.has(a.estado),
  );
  const contratadosDelPuesto = apps.filter(
    (a) => a.vacante_id === vacante.id && a.estado === 'contratado',
  );

  const total = cuposTotales(vacante);
  const libres = cuposDisponibles(vacante);
  const salario = textoSalario(vacante.salario_min, vacante.salario_max);
  const horario = textoHorario(vacante.horario);
  const conUbicacion = vacante.modalidad === 'Presencial' || vacante.modalidad === 'Híbrido';
  const fechaLim = fechaLimiteLegible(vacante.fecha_limite);

  return (
    <ScrollView contentContainerStyle={s.microWrap} showsVerticalScrollIndicator={false}>
      {/* Volver */}
      <TouchableOpacity style={s.volver} onPress={onVolver} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={18} color={colors.primaryLight} />
        <Text style={s.volverTxt}>Volver</Text>
      </TouchableOpacity>

      {/* 1. Título */}
      <Text style={s.microTitulo}>{vacante.titulo}</Text>

      {/* 2·3·5 Área / Modalidad / Modalidad de contrato */}
      <View style={s.chipsRow}>
        <View style={s.chip}><Text style={s.chipTxt}>{esContratado ? 'Puesto' : 'Vacante'}</Text></View>
        {!!vacante.area && <View style={s.chip}><Text style={s.chipTxt}>{vacante.area}</Text></View>}
        {!!vacante.modalidad && <View style={s.chip}><Text style={s.chipTxt}>{vacante.modalidad}</Text></View>}
        {!!vacante.modalidad_contrato && (
          <View style={s.chip}><Text style={s.chipTxt}>{vacante.modalidad_contrato}</Text></View>
        )}
        {(vacante.tags ?? []).map((t, i) => (
          <View key={`tag-${i}`} style={[s.chip, s.chipSkill]}><Text style={s.chipSkillTxt} noTranslate>{t}</Text></View>
        ))}
      </View>

      {/* 4. Ubicación (solo Presencial / Híbrido) */}
      {conUbicacion && (vacante.ubicacion_texto || vacante.ubicacion_coords) && (
        <View style={s.microBox}>
          <Text style={s.microLabel}>Ubicación</Text>
          {!!vacante.ubicacion_texto && (
            <Text style={s.microTexto} noTranslate>
              {[vacante.ubicacion_texto.direccion, vacante.ubicacion_texto.municipio, vacante.ubicacion_texto.departamento]
                .filter(Boolean)
                .join(', ') || '—'}
            </Text>
          )}
          {/* El mapa interactivo solo tiene sentido en la app móvil; en web el
              componente muestra un texto de respaldo pensado para PUBLICAR una
              vacante, que no aplica en esta vista de solo lectura. */}
          {Platform.OS !== 'web' && !!vacante.ubicacion_coords && (
            <View pointerEvents="none" style={s.mapa}>
              <MapViewer
                mapRegion={{
                  latitude: vacante.ubicacion_coords.latitude,
                  longitude: vacante.ubicacion_coords.longitude,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }}
                markerPos={vacante.ubicacion_coords}
              />
            </View>
          )}
        </View>
      )}

      {/* 6. Descripción */}
      {!!vacante.descripcion && (
        <View style={s.microBox}>
          <Text style={s.microLabel}>Descripción</Text>
          <Text style={s.microTexto}>{vacante.descripcion}</Text>
        </View>
      )}

      {/* 7. Skills */}
      {(vacante.skills_requeridas ?? []).length > 0 && (
        <View style={s.microBox}>
          <Text style={s.microLabel}>Skills requeridas</Text>
          <View style={s.chipsRow}>
            {(vacante.skills_requeridas ?? []).map((sk, i) => (
              <View key={`${sk}-${i}`} style={[s.chip, s.chipSkill]}>
                <Text style={s.chipSkillTxt} noTranslate>{sk}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 8·9·10·11 Datos rápidos */}
      <View style={s.microBox}>
        <View style={s.datoFila}>
          <Ionicons name="calendar-outline" size={15} color={colors.textMuted} />
          <Text style={s.datoTxt}>Fecha límite:</Text>
          <Text style={s.datoTxt} noTranslate>{fechaLim || '—'}</Text>
        </View>
        <View style={s.datoFila}>
          <Ionicons name="people-outline" size={15} color={colors.textMuted} />
          {total === null ? (
            <Text style={s.datoTxt}>Cupos: sin límite declarado</Text>
          ) : (
            <>
              <Text style={s.datoTxt}>Cupos disponibles:</Text>
              <Text style={s.datoTxt} noTranslate>{`${libres ?? 0} / ${total}`}</Text>
            </>
          )}
        </View>
        {!!horario && (
          <View style={s.datoFila}>
            <Ionicons name="time-outline" size={15} color={colors.textMuted} />
            <Text style={s.datoTxt} noTranslate>{horario}</Text>
          </View>
        )}
        {!!salario && (
          <View style={s.datoFila}>
            <Ionicons name="cash-outline" size={15} color={colors.textMuted} />
            <Text style={s.datoTxt} noTranslate>{salario}</Text>
          </View>
        )}
      </View>

      {/* 12. Candidatos */}
      {esContratado ? (
        <ContratadosBasico
          contratados={contratadosDelPuesto}
          colors={colors}
          s={s}
          onVerPerfil={onVerPerfil}
        />
      ) : (
        <ListaCandidatos
          vacante={vacante}
          candidatos={candidatosPendientes}
          empresaId={empresaId}
          empresaNombre={empresaNombre}
          pasantes={pasantes}
          contratadosCount={contratadosCount}
          colors={colors}
          s={s}
          onVerPerfil={onVerPerfil}
          onChatCandidato={onChatCandidato}
          onContratado={onContratado}
          onVacanteCerrada={onVacanteCerrada}
        />
      )}
    </ScrollView>
  );
}

/** Listado de solo lectura de contratados de un puesto (Fase 3 lo enriquece). */
function ContratadosBasico({
  contratados, colors, s, onVerPerfil,
}: {
  contratados: AplicacionReclutamiento[];
  colors: GradlyColors;
  s: ReturnType<typeof makeStyles>;
  onVerPerfil: (id: string) => void;
}) {
  return (
    <>
      <View style={s.candHeader}>
        <Ionicons name="checkmark-circle" size={16} color={colors.primaryLight} />
        <Text style={s.microLabel} noTranslate>{contratados.length}{' '}</Text>
        <Text style={s.microLabel}>contratados</Text>
      </View>
      {contratados.length === 0 ? (
        <Text style={s.vacio}>Este puesto no tiene contratados.</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {contratados.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={s.filaPersona}
              activeOpacity={0.75}
              onPress={() => c.estudiante_id && onVerPerfil(c.estudiante_id)}
              disabled={!c.estudiante_id}
            >
              <View style={s.avatar}><Ionicons name="person" size={16} color={colors.primaryLight} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.personaNombre} numberOfLines={1}>{c.estudiante_nombre}</Text>
                <Text style={s.personaMeta} numberOfLines={1}>Ver perfil</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
// LISTA DE CANDIDATOS — chips-filtro por skill + "Hizo su pasantía con
// nosotros" + "Mejor calificados" + "Todos" (ranking compuesto), y por
// candidato: perfil, chat, CV, Rechazar y Contratar.
// ────────────────────────────────────────────────────────────────────────
interface PerfilCand {
  skills: string[];
  rating: number;
  cvUrl: string;
  carrera: string;
  foto: string;
  nombre: string;
}

function ListaCandidatos({
  vacante, candidatos, empresaId, empresaNombre, pasantes, contratadosCount,
  colors, s, onVerPerfil, onChatCandidato, onContratado, onVacanteCerrada,
}: {
  vacante: VacanteReclutamiento;
  candidatos: AplicacionReclutamiento[];
  empresaId: string;
  empresaNombre: string;
  pasantes: Set<string>;
  contratadosCount: number;
  colors: GradlyColors;
  s: ReturnType<typeof makeStyles>;
  onVerPerfil: (id: string) => void;
  onChatCandidato: (args: ChatCandidatoArgs) => void;
  onContratado: () => void;
  onVacanteCerrada: () => void;
}) {
  const skillsVacante = vacante.skills_requeridas ?? [];

  // ── Perfiles de cada candidato (skills / rating / CV / carrera / foto) ──
  const [perfiles, setPerfiles] = useState<Record<string, PerfilCand>>({});
  const idsKey = candidatos.map((c) => c.estudiante_id).sort().join(',');
  useEffect(() => {
    let cancel = false;
    const ids = idsKey ? idsKey.split(',') : [];
    (async () => {
      const faltantes = ids.filter((id) => id && !perfiles[id]);
      if (faltantes.length === 0) return;
      const nuevos: Record<string, PerfilCand> = {};
      await Promise.all(
        faltantes.map(async (id) => {
          try {
            const snap = await getDoc(doc(db, 'perfiles_estudiantes', id));
            const d = snap.exists() ? (snap.data() as any) : {};
            nuevos[id] = {
              skills: Array.isArray(d.skills) ? d.skills : [],
              rating: Number(d.calificacion_promedio) || 0,
              cvUrl: d.cv_url || '',
              carrera: d.carrera || '',
              foto: d.foto_url || '',
              nombre: d.nombre_completo || '',
            };
          } catch {
            nuevos[id] = { skills: [], rating: 0, cvUrl: '', carrera: '', foto: '', nombre: '' };
          }
        }),
      );
      if (!cancel) setPerfiles((prev) => ({ ...prev, ...nuevos }));
    })();
    return () => { cancel = true; };
  }, [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Candidatos enriquecidos + score ──
  const enriquecidos = useMemo(() => {
    return candidatos.map((app) => {
      const p = perfiles[app.estudiante_id];
      const skills = p?.skills ?? [];
      const skillsCumplidas = matchSkills(skillsVacante, skills);
      const exPasante = pasantes.has(app.estudiante_id);
      const rating = p?.rating ?? 0;
      const score = scoreCandidato({
        rating,
        skillsCumplidas: skillsCumplidas.length,
        skillsTotales: skillsVacante.length,
        exPasante,
      });
      return { app, perfil: p, skillsCumplidas, exPasante, rating, score };
    });
  }, [candidatos, perfiles, pasantes, skillsVacante]);

  // ── Filtro activo ──
  //   'todos' | 'expasante' | 'rating' | 'skill:<normalizada>'
  const [filtro, setFiltro] = useState<string>('todos');

  const chipsSkill = useMemo(() => {
    const vistos = new Set<string>();
    const out: { label: string; key: string }[] = [];
    for (const sk of skillsVacante) {
      const n = normalizarSkill(sk);
      if (!n || vistos.has(n)) continue;
      vistos.add(n);
      out.push({ label: sk, key: `skill:${n}` });
    }
    return out;
  }, [skillsVacante]);

  const visibles = useMemo(() => {
    let lista = enriquecidos;
    if (filtro.startsWith('skill:')) {
      const target = filtro.slice(6);
      lista = lista.filter((e) => e.skillsCumplidas.some((sk) => normalizarSkill(sk) === target));
    } else if (filtro === 'expasante') {
      lista = lista.filter((e) => e.exPasante);
    }
    return [...lista].sort((a, b) =>
      filtro === 'rating' ? b.rating - a.rating || b.score - a.score : b.score - a.score,
    );
  }, [enriquecidos, filtro]);

  // ── Acciones ──
  const [rechazar, setRechazar] = useState<AplicacionReclutamiento | null>(null);
  const [motivo, setMotivo] = useState('');
  const [enviandoRechazo, setEnviandoRechazo] = useState(false);
  const [contratar, setContratar] = useState<AplicacionReclutamiento | null>(null);
  const [contratando, setContratando] = useState(false);
  const [confirmarCerrar, setConfirmarCerrar] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [errAccion, setErrAccion] = useState('');
  const [cvMenu, setCvMenu] = useState<string | null>(null);

  const cuposTot = cuposTotales(vacante);
  const cupoUnico = cuposTot === 1 || (cuposTot !== null && contratadosCount + 1 >= cuposTot);

  const confirmarRechazo = async () => {
    if (!rechazar || motivo.trim().length < 10) {
      setErrAccion('Escribe un motivo de al menos 10 caracteres.');
      return;
    }
    setEnviandoRechazo(true);
    setErrAccion('');
    try {
      await updateDoc(doc(db, 'aplicaciones', rechazar.id), {
        estado: 'rechazado',
        motivo_rechazo: motivo.trim(),
        fecha_rechazo: serverTimestamp(),
      });
      await enviarNotificacion(
        rechazar.estudiante_id,
        'Postulación no seleccionada',
        motivo.trim(),
        'info',
        `postulacionRechazada:${rechazar.id}`,
      );
      setRechazar(null);
      setMotivo('');
    } catch (e) {
      console.warn('rechazar candidato:', e);
      setErrAccion('No se pudo rechazar. Intenta de nuevo.');
    } finally {
      setEnviandoRechazo(false);
    }
  };

  const confirmarContratacion = async () => {
    if (!contratar) return;
    setContratando(true);
    setErrAccion('');
    try {
      const vp: VacanteParaContrato = {
        id: vacante.id,
        titulo: vacante.titulo,
        area: vacante.area,
        modalidad: vacante.modalidad,
        modalidad_contrato: vacante.modalidad_contrato,
        ubicacion_texto: vacante.ubicacion_texto ?? null,
        horario: vacante.horario ?? null,
        salario_min: vacante.salario_min ?? null,
        salario_max: vacante.salario_max ?? null,
        cupos: vacante.cupos ?? null,
        contratados_count: vacante.contratados_count ?? contratadosCount,
      };
      await contratarCandidato({
        aplicacionId: contratar.id,
        vacante: vp,
        estudianteId: contratar.estudiante_id,
        estudianteNombre: contratar.estudiante_nombre,
        estudianteFoto: perfiles[contratar.estudiante_id]?.foto ?? contratar.estudiante_foto ?? '',
        empresaId,
        empresaNombre,
        origen: 'candidato',
      });
      setContratar(null);
      onContratado();
    } catch (e: any) {
      console.warn('contratar candidato:', e);
      setErrAccion(e?.message || 'No se pudo completar la contratación.');
    } finally {
      setContratando(false);
    }
  };

  const confirmarCierre = async () => {
    setCerrando(true);
    setErrAccion('');
    try {
      await cerrarVacante({ vacanteId: vacante.id, empresaId, vacanteTitulo: vacante.titulo });
      setConfirmarCerrar(false);
      onVacanteCerrada();
    } catch (e) {
      console.warn('cerrar vacante:', e);
      setErrAccion('No se pudo cerrar la vacante.');
    } finally {
      setCerrando(false);
    }
  };

  const abrirCV = (url: string) => {
    if (url) Linking.openURL(url).catch(() => {});
    setCvMenu(null);
  };

  return (
    <>
      {/* Cabecera de la sección + "Cerrar vacante" */}
      <View style={s.candHeader}>
        <Ionicons name="people" size={16} color={colors.primaryLight} />
        <Text style={s.microLabel} noTranslate>{candidatos.length}{' '}</Text>
        <Text style={s.microLabel}>postulantes</Text>
        {contratadosCount >= 1 && !vacante.cerrada && (
          <TouchableOpacity style={s.cerrarBtn} onPress={() => { setConfirmarCerrar(true); setErrAccion(''); }} activeOpacity={0.85}>
            <Ionicons name="lock-closed-outline" size={13} color={colors.warning} />
            <Text style={s.cerrarBtnTxt}>Cerrar vacante</Text>
          </TouchableOpacity>
        )}
      </View>

      {candidatos.length === 0 ? (
        <Text style={s.vacio}>Todavía nadie se ha postulado a esta vacante.</Text>
      ) : (
        <>
          {/* Chips-filtro */}
          <View style={s.chipsRow}>
            <FiltroChip label="Todos" activo={filtro === 'todos'} onPress={() => setFiltro('todos')} s={s} />
            {pasantes.size > 0 && enriquecidos.some((e) => e.exPasante) && (
              <FiltroChip
                label="Ex-pasantes"
                icon="ribbon-outline"
                activo={filtro === 'expasante'}
                onPress={() => setFiltro('expasante')}
                s={s}
              />
            )}
            <FiltroChip
              label="Mejor calificados"
              icon="star-outline"
              activo={filtro === 'rating'}
              onPress={() => setFiltro('rating')}
              s={s}
            />
            {chipsSkill.map((c) => (
              <FiltroChip
                key={c.key}
                label={c.label}
                noTranslate
                activo={filtro === c.key}
                onPress={() => setFiltro(c.key)}
                s={s}
              />
            ))}
          </View>

          {/* Filas de candidatos */}
          <View style={{ gap: 10, marginTop: 4 }}>
            {visibles.map(({ app, perfil, skillsCumplidas, exPasante, rating }) => {
              const cvUrl = perfil?.cvUrl ?? '';
              return (
                <View key={app.id} style={s.candCard}>
                  {/* Identidad */}
                  <TouchableOpacity
                    style={s.candTop}
                    activeOpacity={0.75}
                    onPress={() => app.estudiante_id && onVerPerfil(app.estudiante_id)}
                    disabled={!app.estudiante_id}
                  >
                    {perfil?.foto ? (
                      <Image source={{ uri: perfil.foto }} style={s.candAvatar} />
                    ) : (
                      <View style={s.candAvatar}>
                        <Ionicons name="person" size={17} color={colors.primaryLight} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Text style={s.candNombre} numberOfLines={1}>{app.estudiante_nombre}</Text>
                        <Ionicons name="chevron-forward-circle-outline" size={15} color={colors.primaryLight} />
                      </View>
                      {!!perfil?.carrera && <Text style={s.candCarrera} numberOfLines={1} noTranslate>{perfil.carrera}</Text>}
                    </View>
                    {rating > 0 && (
                      <View style={s.ratingPill}>
                        <Ionicons name="star" size={12} color={colors.gold} />
                        <Text style={s.ratingTxt} noTranslate>{rating.toFixed(1)}</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  {/* Privilegios / coincidencias */}
                  {(exPasante || skillsCumplidas.length > 0) && (
                    <View style={s.chipsRow}>
                      {exPasante && (
                        <View style={[s.chip, s.chipPriv]}>
                          <Ionicons name="ribbon" size={11} color={colors.success} />
                          <Text style={[s.chipPrivTxt]}>Hizo su pasantía con nuestra empresa</Text>
                        </View>
                      )}
                      {skillsCumplidas.map((sk, i) => (
                        <View key={`${sk}-${i}`} style={[s.chip, s.chipCumple]}>
                          <Ionicons name="checkmark-circle" size={11} color={colors.primaryLight} />
                          <Text style={s.chipCumpleTxt}>Cumple con</Text>
                          <Text style={s.chipCumpleTxt} noTranslate>{sk}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Acciones */}
                  <View style={s.candAcciones}>
                    <TouchableOpacity style={[s.accionBtn, s.accionRechazar]} onPress={() => { setRechazar(app); setMotivo(''); setErrAccion(''); }} activeOpacity={0.85}>
                      <Ionicons name="close" size={14} color={colors.error} />
                      <Text style={[s.accionTxt, { color: colors.error }]}>Rechazar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.accionBtn}
                      onPress={() => onChatCandidato({ estudianteId: app.estudiante_id, estudianteNombre: app.estudiante_nombre })}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.primaryLight} />
                      <Text style={s.accionTxt}>Chat</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.accionBtn, !cvUrl && s.accionDeshabilitada]}
                      onPress={() => cvUrl && setCvMenu(cvMenu === app.id ? null : app.id)}
                      disabled={!cvUrl}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="document-text-outline" size={14} color={cvUrl ? colors.primaryLight : colors.textMuted} />
                      <Text style={[s.accionTxt, !cvUrl && { color: colors.textMuted }]}>CV</Text>
                      {!!cvUrl && <Ionicons name="chevron-down" size={12} color={colors.primaryLight} />}
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.accionBtn, s.accionContratar]} onPress={() => { setContratar(app); setErrAccion(''); }} activeOpacity={0.85}>
                      <Ionicons name="checkmark" size={14} color="#fff" />
                      <Text style={[s.accionTxt, { color: '#fff' }]}>Contratar</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Menú del CV */}
                  {cvMenu === app.id && !!cvUrl && (
                    <View style={s.cvMenu}>
                      <TouchableOpacity style={s.cvMenuItem} onPress={() => abrirCV(cvUrl)} activeOpacity={0.8}>
                        <Ionicons name="eye-outline" size={14} color={colors.textPrimary} />
                        <Text style={s.cvMenuTxt}>Ver CV</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.cvMenuItem} onPress={() => abrirCV(cvUrl)} activeOpacity={0.8}>
                        <Ionicons name="open-outline" size={14} color={colors.textPrimary} />
                        <Text style={s.cvMenuTxt}>Abrir en navegador</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
            {visibles.length === 0 && (
              <Text style={s.vacio}>Ningún postulante coincide con este filtro.</Text>
            )}
          </View>
        </>
      )}

      {/* ── MODAL: Rechazar ── */}
      <Modal visible={!!rechazar} transparent animationType="none" onRequestClose={() => setRechazar(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitulo}>Rechazar postulación</Text>
            <Text style={[s.modalTexto, { fontFamily: FONTS.interSemiBold, color: colors.textPrimary }]} noTranslate>
              {rechazar?.estudiante_nombre}
            </Text>
            <Text style={s.modalTexto}>
              Explica por qué no fue seleccionado; el estudiante verá este motivo en sus notificaciones.
            </Text>
            <TextInput
              style={s.modalInput}
              value={motivo}
              onChangeText={setMotivo}
              placeholder="Motivo del rechazo (mín. 10 caracteres)"
              placeholderTextColor={colors.textMuted}
              multiline
              selectionColor={colors.primary}
            />
            {!!errAccion && <Text style={s.modalError}>{errAccion}</Text>}
            <View style={s.modalBotones}>
              <TouchableOpacity style={s.modalCancelar} onPress={() => setRechazar(null)} disabled={enviandoRechazo}>
                <Text style={s.modalCancelarTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalConfirmar, { backgroundColor: colors.error }]} onPress={confirmarRechazo} disabled={enviandoRechazo}>
                {enviandoRechazo ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.modalConfirmarTxt}>Confirmar rechazo</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL: Contratar ── */}
      <Modal visible={!!contratar} transparent animationType="none" onRequestClose={() => setContratar(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitulo}>Confirmar contratación</Text>
            <Text style={s.modalTexto}>Vas a contratar a:</Text>
            <Text style={[s.modalTexto, { fontFamily: FONTS.interSemiBold, color: colors.textPrimary }]} noTranslate>
              {contratar?.estudiante_nombre} · {vacante.titulo}
            </Text>
            {cupoUnico && (
              <View style={s.modalAviso}>
                <Ionicons name="alert-circle-outline" size={15} color={colors.warning} />
                <Text style={s.modalAvisoTxt}>
                  Con esta contratación se cubren los cupos: el resto de postulantes quedarán descartados (con aviso de agradecimiento) y la vacante se cerrará.
                </Text>
              </View>
            )}
            {!!errAccion && <Text style={s.modalError}>{errAccion}</Text>}
            <View style={s.modalBotones}>
              <TouchableOpacity style={s.modalCancelar} onPress={() => setContratar(null)} disabled={contratando}>
                <Text style={s.modalCancelarTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalConfirmar, { backgroundColor: colors.success }]} onPress={confirmarContratacion} disabled={contratando}>
                {contratando ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.modalConfirmarTxt}>Contratar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL: Cerrar vacante ── */}
      <Modal visible={confirmarCerrar} transparent animationType="none" onRequestClose={() => setConfirmarCerrar(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitulo}>Cerrar la vacante</Text>
            <Text style={s.modalTexto}>
              La vacante quedará cerrada con los contratados que ya tienes. El resto de postulantes serán descartados con un aviso de agradecimiento. No se puede reabrir.
            </Text>
            {!!errAccion && <Text style={s.modalError}>{errAccion}</Text>}
            <View style={s.modalBotones}>
              <TouchableOpacity style={s.modalCancelar} onPress={() => setConfirmarCerrar(false)} disabled={cerrando}>
                <Text style={s.modalCancelarTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalConfirmar, { backgroundColor: colors.warning }]} onPress={confirmarCierre} disabled={cerrando}>
                {cerrando ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.modalConfirmarTxt}>Cerrar vacante</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function FiltroChip({
  label, icon, activo, onPress, s, noTranslate,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  activo: boolean;
  onPress: () => void;
  s: ReturnType<typeof makeStyles>;
  noTranslate?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[s.candFiltro, activo && s.candFiltroActivo]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {icon && <Ionicons name={icon} size={11} color={activo ? '#fff' : undefined} />}
      <Text style={activo ? s.candFiltroTxtActivo : s.candFiltroTxt} noTranslate={noTranslate}>{label}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (c: GradlyColors) =>
  StyleSheet.create({
    wrap: { flex: 1, padding: 16, paddingBottom: 110 },

    // Pestañas
    tabs: {
      flexDirection: 'row',
      backgroundColor: c.white4,
      borderRadius: 14,
      padding: 4,
      gap: 4,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 12,
    },
    tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    tabActivo: { backgroundColor: c.primary },
    tabTxt: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: c.textMuted },
    tabTxtActivo: { color: '#fff' },

    // Filtros (nivel pestaña)
    filtros: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
    chipFiltro: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.backgroundCard,
    },
    chipFiltroActivo: { backgroundColor: c.primary, borderColor: c.primary },
    chipFiltroTxt: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: c.textMuted },
    chipFiltroTxtActivo: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: '#fff' },

    // Grid
    grid: { paddingBottom: 20 },
    gridRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 },
    vacio: { fontSize: 13, color: c.textMuted, fontStyle: 'italic', textAlign: 'center', paddingVertical: 24 },

    // Tarjeta
    cardIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: c.primary + '22',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTitulo: { fontSize: 14.5, fontFamily: FONTS.interSemiBold, color: c.textPrimary },
    cardFecha: { fontSize: 11.5, color: c.textMuted, marginTop: 2 },
    tagInactiva: {
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: c.textMuted + '55',
    },
    tagInactivaTxt: { fontSize: 9.5, fontFamily: FONTS.interSemiBold, color: c.textMuted },

    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 7,
      backgroundColor: c.primary + '14',
      borderWidth: 1,
      borderColor: c.primary + '2E',
    },
    chipTxt: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: c.primaryLight },
    chipSalario: { backgroundColor: c.success + '18', borderColor: c.success + '44' },
    chipSkill: { backgroundColor: c.backgroundSurface, borderColor: c.border },
    chipSkillTxt: { fontSize: 10.5, fontFamily: FONTS.interSemiBold, color: c.textMuted },
    chipPriv: { backgroundColor: c.success + '18', borderColor: c.success + '55' },
    chipPrivTxt: { fontSize: 10.5, fontFamily: FONTS.interSemiBold, color: c.success },
    chipCumple: { backgroundColor: c.primaryLight + '20', borderColor: c.primaryLight + '55' },
    chipCumpleTxt: { fontSize: 10.5, fontFamily: FONTS.interSemiBold, color: c.primaryLight },

    cardPie: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 2,
      gap: 8,
    },
    cardCupos: { fontSize: 11, color: c.textMuted, flexShrink: 1 },
    conteoBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: c.white4,
      borderWidth: 1,
      borderColor: c.border,
    },
    conteoBadgeCaliente: { backgroundColor: c.warning + '1E', borderColor: c.warning + '55' },
    conteoBadgeTxt: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: c.textMuted },

    // Lista plana de personas / contratados básicos
    listaPlana: { paddingBottom: 24, gap: 8 },
    filaPersona: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.backgroundCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      padding: 11,
    },
    avatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: c.primary + '22',
      alignItems: 'center',
      justifyContent: 'center',
    },
    personaNombre: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: c.textPrimary },
    personaMeta: { fontSize: 11.5, color: c.textMuted, marginTop: 1 },

    // Microsección
    microWrap: { padding: 16, paddingBottom: 120, gap: 12 },
    volver: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 },
    volverTxt: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: c.primaryLight },
    microTitulo: { fontSize: 19, fontFamily: FONTS.soraBold, color: c.textPrimary },
    microBox: {
      backgroundColor: c.backgroundCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      padding: 13,
      gap: 8,
    },
    microLabel: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: c.textPrimary },
    microTexto: { fontSize: 13, color: c.textSecondary, lineHeight: 19 },
    mapa: { height: 150, borderRadius: 10, overflow: 'hidden', marginTop: 4 },
    datoFila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    datoTxt: { fontSize: 12.5, color: c.textSecondary },

    // Cabecera de candidatos
    candHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4, flexWrap: 'wrap' },
    cerrarBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 'auto',
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
      borderWidth: 1, borderColor: c.warning + '66', backgroundColor: c.warning + '14',
    },
    cerrarBtnTxt: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: c.warning },

    // Chips-filtro de candidatos
    candFiltro: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
      borderWidth: 1, borderColor: c.border, backgroundColor: c.backgroundCard,
    },
    candFiltroActivo: { backgroundColor: c.primary, borderColor: c.primary },
    candFiltroTxt: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: c.textMuted },
    candFiltroTxtActivo: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: '#fff' },

    // Tarjeta de candidato
    candCard: {
      backgroundColor: c.backgroundCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      padding: 12,
      gap: 10,
    },
    candTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    candAvatar: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: c.primary + '22', alignItems: 'center', justifyContent: 'center',
    },
    candNombre: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: c.textPrimary, flexShrink: 1 },
    candCarrera: { fontSize: 11.5, color: c.textMuted, marginTop: 1 },
    ratingPill: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
      backgroundColor: c.gold + '1E', borderWidth: 1, borderColor: c.gold + '55',
    },
    ratingTxt: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: c.gold },

    candAcciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    accionBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10,
      borderWidth: 1, borderColor: c.border, backgroundColor: c.backgroundSurface,
    },
    accionTxt: { fontSize: 11.5, fontFamily: FONTS.interSemiBold, color: c.primaryLight },
    accionRechazar: { borderColor: c.error + '66', backgroundColor: c.error + '12' },
    accionContratar: { borderColor: c.success, backgroundColor: c.success },
    accionDeshabilitada: { opacity: 0.45 },

    cvMenu: {
      borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8, gap: 4,
    },
    cvMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 4 },
    cvMenuTxt: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: c.textPrimary },

    // Modales
    modalOverlay: { flex: 1, backgroundColor: 'rgba(7,5,15,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalCard: {
      width: '100%', maxWidth: 400, borderRadius: 20, padding: 22, gap: 12,
      backgroundColor: c.backgroundCard, borderWidth: 1, borderColor: c.border,
    },
    modalTitulo: { fontSize: 17, fontFamily: FONTS.soraBold, color: c.textPrimary },
    modalTexto: { fontSize: 13, fontFamily: FONTS.interRegular, color: c.textSecondary, lineHeight: 19 },
    modalInput: {
      minHeight: 84, borderRadius: 12, borderWidth: 1, borderColor: c.border,
      backgroundColor: c.backgroundSurface, padding: 12, textAlignVertical: 'top',
      fontSize: 13, fontFamily: FONTS.interRegular, color: c.textPrimary,
    },
    modalAviso: {
      flexDirection: 'row', gap: 8, alignItems: 'flex-start',
      backgroundColor: c.warning + '14', borderWidth: 1, borderColor: c.warning + '55',
      borderRadius: 12, padding: 11,
    },
    modalAvisoTxt: { flex: 1, fontSize: 12, fontFamily: FONTS.interRegular, color: c.textPrimary, lineHeight: 17 },
    modalError: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: c.error },
    modalBotones: { flexDirection: 'row', gap: 10, marginTop: 4 },
    modalCancelar: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: c.border },
    modalCancelarTxt: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: c.textMuted },
    modalConfirmar: { flex: 1.4, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12 },
    modalConfirmarTxt: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: '#fff' },
  });
