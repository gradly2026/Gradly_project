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
// ALCANCE FASE 1 (este commit): cascarón navegable. Las tarjetas, el orden,
// la microsección con los 11 datos y el listado básico de candidatos ya
// funcionan. Los CHIPS-FILTRO por skill, el ranking compuesto y las
// ACCIONES sobre cada candidato (rechazar / contratar / CV / chat) llegan
// en la Fase 2; el detalle rico del puesto contratado (tareas, calendario,
// despedir/reportar) en la Fase 3.
// ════════════════════════════════════════════════════════════════════════
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { AutoText as Text } from './AutoText';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { GlassCard } from '../../components/ui/liquid-glass/GlassCard';
import MapViewer from './MapViewer';
import { cuposDisponibles, cuposTotales, textoCupos, textoSalario } from '../utils/cupos';
import { textoHorario } from '../data/disponibilidad';

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

export default function SeccionReclutamiento({
  empresaId: _empresaId,
  empresaNombre: _empresaNombre,
  vacantes,
  apps,
  onVerPerfilCandidato,
}: {
  empresaId: string;
  empresaNombre: string;
  vacantes: VacanteReclutamiento[];
  apps: AplicacionReclutamiento[];
  onVerPerfilCandidato: (estudianteId: string) => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const esAncho = width >= 768;

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

  // ── MICROSECCIÓN interna ──
  if (vacanteSel) {
    return (
      <VacanteMicroseccion
        vacante={vacanteSel}
        apps={apps}
        modo={tab}
        colors={colors}
        s={s}
        onVolver={() => setVacanteSelId(null)}
        onVerPerfil={onVerPerfilCandidato}
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
  vacante, apps, modo, colors, s, onVolver, onVerPerfil,
}: {
  vacante: VacanteReclutamiento;
  apps: AplicacionReclutamiento[];
  modo: 'reclutamiento' | 'contratado';
  colors: GradlyColors;
  s: ReturnType<typeof makeStyles>;
  onVolver: () => void;
  onVerPerfil: (estudianteId: string) => void;
}) {
  const esContratado = modo === 'contratado';
  const candidatos = apps.filter((a) =>
    a.vacante_id === vacante.id &&
    (esContratado ? a.estado === 'contratado' : EN_RECLUTAMIENTO.has(a.estado)),
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
          {!!vacante.ubicacion_coords && (
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 }}>
        <Ionicons name={esContratado ? 'checkmark-circle' : 'people'} size={16} color={colors.primaryLight} />
        <Text style={s.microLabel} noTranslate>{candidatos.length}{' '}</Text>
        <Text style={s.microLabel}>{esContratado ? 'contratados' : 'postulantes'}</Text>
      </View>

      {candidatos.length === 0 ? (
        <Text style={s.vacio}>
          {esContratado ? 'Este puesto no tiene contratados.' : 'Todavía nadie se ha postulado a esta vacante.'}
        </Text>
      ) : (
        <View style={{ gap: 8 }}>
          {candidatos.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={s.filaPersona}
              activeOpacity={0.75}
              onPress={() => c.estudiante_id && onVerPerfil(c.estudiante_id)}
              disabled={!c.estudiante_id}
            >
              <View style={s.avatar}>
                <Ionicons name="person" size={16} color={colors.primaryLight} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.personaNombre} numberOfLines={1}>{c.estudiante_nombre}</Text>
                <Text style={s.personaMeta} numberOfLines={1}>Ver perfil</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
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

    // Filtros
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

    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
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

    // Lista plana de personas
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
  });
