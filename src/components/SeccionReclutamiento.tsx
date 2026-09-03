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
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Modal,
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
  COL_CONTRATOS,
  COL_TAREAS,
  advertirEmpleado,
  asignarTarea,
  cerrarVacante,
  completarTarea,
  contratarCandidato,
  contratarExPasante,
  despedirEmpleado,
  reportarEmpleado,
  type ContratoLaboral,
  type OfertaEmpleo,
  type TareaLaboral,
  type VacanteParaContrato,
} from '../services/contratoService';
import { enviarNotificacion } from '../services/notificationService';
import { MOTIVOS_REPORTE } from '../services/reporteService';

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

  // Filtro "supremo", por encima de todo: ver las vacantes/puestos, o
  // recontratar directamente a un ex-pasante.
  const [filtroSupremo, setFiltroSupremo] = useState<'porVacantes' | 'recontratar'>('porVacantes');
  const [tab, setTab] = useState<'reclutamiento' | 'contratado'>('reclutamiento');
  const [filtroContratado, setFiltroContratado] = useState<'puestos' | 'todos'>('puestos');
  const [vacanteSelId, setVacanteSelId] = useState<string | null>(null);
  // Drill-in de "Todos los contratados": el contrato (empleado) enfocado.
  const [empleadoSelId, setEmpleadoSelId] = useState<string | null>(null);

  // ── Contratos laborales de la empresa (fuente de verdad del lado
  //    "Contratado": estado real, reportes, advertencias, horario). ──
  const [contratos, setContratos] = useState<ContratoLaboral[]>([]);
  useEffect(() => {
    if (!empresaId) return;
    const unsub = onSnapshot(
      query(collection(db, COL_CONTRATOS), where('empresaId', '==', empresaId)),
      (snap) => setContratos(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as ContratoLaboral))),
      (e) => console.warn('contratos empresa:', e),
    );
    return unsub;
  }, [empresaId]);
  const contratosActivos = useMemo(() => contratos.filter((c) => c.estado === 'activo'), [contratos]);

  // ── Conteo de postulantes PENDIENTES por vacante (para el orden pan caliente). ──
  const pendientesPorVacante = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of apps) if (EN_RECLUTAMIENTO.has(a.estado)) m[a.vacante_id] = (m[a.vacante_id] ?? 0) + 1;
    return m;
  }, [apps]);

  // Contratos ACTIVOS agrupados por vacante (para "Puestos").
  const contratosPorVacante = useMemo(() => {
    const m: Record<string, ContratoLaboral[]> = {};
    for (const c of contratosActivos) (m[c.vacanteId] = m[c.vacanteId] ?? []).push(c);
    return m;
  }, [contratosActivos]);

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
        .sort((a, b) => (pendientesPorVacante[b.id] ?? 0) - (pendientesPorVacante[a.id] ?? 0)),
    [vacantesEmpleo, pendientesPorVacante],
  );

  /** Vacante mínima reconstruida desde un contrato (por si el doc se borró). */
  const vacanteDesdeContrato = (c: ContratoLaboral): VacanteReclutamiento => ({
    id: c.vacanteId,
    titulo: c.vacanteTitulo,
    area: c.area,
    modalidad: c.modalidad,
    modalidad_contrato: c.modalidad_contrato,
    ubicacion_texto: c.ubicacion_texto,
    horario: c.horario,
    salario_min: c.salario_min,
    salario_max: c.salario_max,
    categoria: 'vacante',
    cerrada: true,
  });

  // "Contratado" → filtro "Puestos": una tarjeta por vacante con ≥1 contrato activo.
  const puestos = useMemo(
    () =>
      Object.keys(contratosPorVacante)
        .map((vid) => vacantesEmpleo.find((v) => v.id === vid) ?? vacanteDesdeContrato(contratosPorVacante[vid][0]))
        .sort((a, b) => (contratosPorVacante[b.id]?.length ?? 0) - (contratosPorVacante[a.id]?.length ?? 0)),
    [contratosPorVacante, vacantesEmpleo],
  );

  // "Contratado" → filtro "Todos los contratados": lista plana de empleados.
  const contratadosPlano = useMemo(
    () =>
      [...contratosActivos].sort((a, b) => (a.estudianteNombre || '').localeCompare(b.estudianteNombre || '')),
    [contratosActivos],
  );

  const vacanteSel = vacanteSelId ? vacantes.find((v) => v.id === vacanteSelId) ?? null : null;
  const empleadoSel = empleadoSelId ? contratos.find((c) => c.id === empleadoSelId) ?? null : null;

  // Tras contratar (o cubrir cupos): llevar a la empresa a "Contratado".
  const irAContratado = () => {
    setFiltroSupremo('porVacantes');
    setTab('contratado');
    setFiltroContratado('puestos');
    setVacanteSelId(null);
    setEmpleadoSelId(null);
  };

  // ── MICROSECCIÓN: vacante en reclutamiento (candidatos) ──
  if (tab === 'reclutamiento' && vacanteSel) {
    return (
      <VacanteMicroseccion
        vacante={vacanteSel}
        apps={apps}
        empresaId={empresaId}
        empresaNombre={empresaNombre}
        pasantes={pasantes}
        contratadosCount={contratosPorVacante[vacanteSel.id]?.length ?? 0}
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

  // ── MICROSECCIÓN: puesto contratado (detalle, tareas, empleados) ──
  const vacantePuesto = tab === 'contratado'
    ? (empleadoSel
        ? (vacantes.find((v) => v.id === empleadoSel.vacanteId) ?? vacanteDesdeContrato(empleadoSel))
        : vacanteSel)
    : null;
  if (tab === 'contratado' && vacantePuesto) {
    const contratosDelPuesto = contratosPorVacante[vacantePuesto.id] ?? (empleadoSel ? [empleadoSel] : []);
    return (
      <PuestoMicroseccion
        vacante={vacantePuesto}
        contratos={contratosDelPuesto}
        empresaId={empresaId}
        empresaNombre={empresaNombre}
        focoEmpleadoId={empleadoSel?.estudianteId ?? null}
        colors={colors}
        s={s}
        onVolver={() => { setVacanteSelId(null); setEmpleadoSelId(null); }}
        onVerPerfil={onVerPerfilCandidato}
        onChatCandidato={onChatCandidato}
        onCambiarFoco={(contratoId) => setEmpleadoSelId(contratoId)}
      />
    );
  }

  const cardWidth: '32%' | '100%' = esAncho ? '32%' : '100%';

  return (
    <View style={s.wrap}>
      {/* ── Filtro supremo ── */}
      <View style={s.supremo}>
        {([
          { id: 'porVacantes', label: 'Por vacantes', icon: 'briefcase' },
          { id: 'recontratar', label: 'Recontratar pasantes', icon: 'ribbon' },
        ] as const).map((f) => {
          const activo = filtroSupremo === f.id;
          return (
            <TouchableOpacity
              key={f.id}
              style={[s.supremoBtn, activo && s.supremoBtnActivo]}
              onPress={() => { setFiltroSupremo(f.id); setVacanteSelId(null); setEmpleadoSelId(null); }}
              activeOpacity={0.85}
            >
              <Ionicons name={f.icon} size={13} color={activo ? '#fff' : colors.textMuted} />
              <Text style={activo ? s.supremoTxtActivo : s.supremoTxt}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {filtroSupremo === 'recontratar' ? (
        <RecontratarPasantes
          empresaId={empresaId}
          empresaNombre={empresaNombre}
          contratosActivos={contratosActivos}
          colors={colors}
          s={s}
          onVerPerfil={onVerPerfilCandidato}
          onChatCandidato={onChatCandidato}
          onContratado={irAContratado}
        />
      ) : (
      <>
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
              onPress={() => { setTab(t.id); setVacanteSelId(null); setEmpleadoSelId(null); }}
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
                  conteo={pendientesPorVacante[v.id] ?? 0}
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
                  conteo={contratosPorVacante[v.id]?.length ?? 0}
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
          data={contratadosPlano}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={s.listaPlana}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Text style={s.vacio}>Todavía no hay contratados.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.filaPersona}
              activeOpacity={0.75}
              onPress={() => setEmpleadoSelId(item.id)}
            >
              {item.estudianteFoto ? (
                <Image source={{ uri: item.estudianteFoto }} style={s.avatar} />
              ) : (
                <View style={s.avatar}>
                  <Ionicons name="person" size={16} color={colors.primaryLight} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.personaNombre} numberOfLines={1} noTranslate>{item.estudianteNombre}</Text>
                <Text style={s.personaMeta} numberOfLines={1} noTranslate>{item.vacanteTitulo}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        />
      )}
      </>
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
// DETALLE DEL PUESTO/VACANTE — los datos comunes (título, chips, ubicación,
// descripción, skills, datos rápidos). Lo usan la microsección de
// reclutamiento y la de puesto contratado.
// ────────────────────────────────────────────────────────────────────────
function DetallePuesto({
  vacante, esPuesto, colors, s,
}: {
  vacante: VacanteReclutamiento;
  esPuesto?: boolean;
  colors: GradlyColors;
  s: ReturnType<typeof makeStyles>;
}) {
  const total = cuposTotales(vacante);
  const libres = cuposDisponibles(vacante);
  const salario = textoSalario(vacante.salario_min, vacante.salario_max);
  const horario = textoHorario(vacante.horario);
  const conUbicacion = vacante.modalidad === 'Presencial' || vacante.modalidad === 'Híbrido';
  const fechaLim = fechaLimiteLegible(vacante.fecha_limite);

  return (
    <>
      <Text style={s.microTitulo}>{vacante.titulo}</Text>

      <View style={s.chipsRow}>
        <View style={s.chip}><Text style={s.chipTxt}>{esPuesto ? 'Puesto' : 'Vacante'}</Text></View>
        {!!vacante.area && <View style={s.chip}><Text style={s.chipTxt}>{vacante.area}</Text></View>}
        {!!vacante.modalidad && <View style={s.chip}><Text style={s.chipTxt}>{vacante.modalidad}</Text></View>}
        {!!vacante.modalidad_contrato && (
          <View style={s.chip}><Text style={s.chipTxt}>{vacante.modalidad_contrato}</Text></View>
        )}
        {(vacante.tags ?? []).map((t, i) => (
          <View key={`tag-${i}`} style={[s.chip, s.chipSkill]}><Text style={s.chipSkillTxt} noTranslate>{t}</Text></View>
        ))}
      </View>

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

      {!!vacante.descripcion && (
        <View style={s.microBox}>
          <Text style={s.microLabel}>Descripción</Text>
          <Text style={s.microTexto}>{vacante.descripcion}</Text>
        </View>
      )}

      {(vacante.skills_requeridas ?? []).length > 0 && (
        <View style={s.microBox}>
          <Text style={s.microLabel}>{esPuesto ? 'Skills del puesto' : 'Skills requeridas'}</Text>
          <View style={s.chipsRow}>
            {(vacante.skills_requeridas ?? []).map((sk, i) => (
              <View key={`${sk}-${i}`} style={[s.chip, s.chipSkill]}>
                <Text style={s.chipSkillTxt} noTranslate>{sk}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={s.microBox}>
        {!esPuesto && (
          <View style={s.datoFila}>
            <Ionicons name="calendar-outline" size={15} color={colors.textMuted} />
            <Text style={s.datoTxt}>Fecha límite:</Text>
            <Text style={s.datoTxt} noTranslate>{fechaLim || '—'}</Text>
          </View>
        )}
        {!esPuesto && (
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
        )}
        {!!horario && (
          <View style={s.datoFila}>
            <Ionicons name="time-outline" size={15} color={colors.textMuted} />
            <Text style={s.datoTxt}>{esPuesto ? 'Horario laboral:' : ''}</Text>
            <Text style={s.datoTxt} noTranslate>{horario}</Text>
          </View>
        )}
        {!!salario && (
          <View style={s.datoFila}>
            <Ionicons name="cash-outline" size={15} color={colors.textMuted} />
            <Text style={s.datoTxt} noTranslate>{salario}</Text>
          </View>
        )}
        {esPuesto && !horario && (
          <View style={s.datoFila}>
            <Ionicons name="time-outline" size={15} color={colors.textMuted} />
            <Text style={s.datoTxt}>Sin horario laboral declarado.</Text>
          </View>
        )}
      </View>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
// MICROSECCIÓN: detalle de una vacante en reclutamiento + listado de candidatos.
// ────────────────────────────────────────────────────────────────────────
function VacanteMicroseccion({
  vacante, apps, empresaId, empresaNombre, pasantes, contratadosCount,
  colors, s, onVolver, onVerPerfil, onChatCandidato, onContratado, onVacanteCerrada,
}: {
  vacante: VacanteReclutamiento;
  apps: AplicacionReclutamiento[];
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
  const candidatosPendientes = apps.filter(
    (a) => a.vacante_id === vacante.id && EN_RECLUTAMIENTO.has(a.estado),
  );

  return (
    <ScrollView contentContainerStyle={s.microWrap} showsVerticalScrollIndicator={false}>
      <TouchableOpacity style={s.volver} onPress={onVolver} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={18} color={colors.primaryLight} />
        <Text style={s.volverTxt}>Volver</Text>
      </TouchableOpacity>

      <DetallePuesto vacante={vacante} colors={colors} s={s} />

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
    </ScrollView>
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

// ════════════════════════════════════════════════════════════════════════
// FASE 3 · MICROSECCIÓN DEL PUESTO CONTRATADO — detalle + horario + tareas +
// empleados con acciones (chat / reportar / despedir). Se abre desde
// "Puestos" (todos los empleados) o desde "Todos los contratados" (un
// empleado enfocado + sus compañeros como enlaces).
// ════════════════════════════════════════════════════════════════════════
function PuestoMicroseccion({
  vacante, contratos, empresaId, empresaNombre, focoEmpleadoId,
  colors, s, onVolver, onVerPerfil, onChatCandidato, onCambiarFoco,
}: {
  vacante: VacanteReclutamiento;
  contratos: ContratoLaboral[];
  empresaId: string;
  empresaNombre: string;
  focoEmpleadoId: string | null;
  colors: GradlyColors;
  s: ReturnType<typeof makeStyles>;
  onVolver: () => void;
  onVerPerfil: (estudianteId: string) => void;
  onChatCandidato: (args: ChatCandidatoArgs) => void;
  onCambiarFoco: (contratoId: string) => void;
}) {
  const foco = focoEmpleadoId ? contratos.find((c) => c.estudianteId === focoEmpleadoId) ?? null : null;
  const empleados = foco ? [foco] : contratos;
  const companeros = foco ? contratos.filter((c) => c.id !== foco.id) : [];

  const [reportarC, setReportarC] = useState<ContratoLaboral | null>(null);
  const [despedirC, setDespedirC] = useState<ContratoLaboral | null>(null);
  const [asignarOpen, setAsignarOpen] = useState(false);
  const [sugerirDespido, setSugerirDespido] = useState<ContratoLaboral | null>(null);

  return (
    <ScrollView contentContainerStyle={s.microWrap} showsVerticalScrollIndicator={false}>
      <TouchableOpacity style={s.volver} onPress={onVolver} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={18} color={colors.primaryLight} />
        <Text style={s.volverTxt}>Volver</Text>
      </TouchableOpacity>

      {/* Cabecera de empleado individual (vista desde "Todos los contratados") */}
      {foco && (
        <View style={s.empHeader}>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
            activeOpacity={0.75}
            onPress={() => onVerPerfil(foco.estudianteId)}
          >
            {foco.estudianteFoto ? (
              <Image source={{ uri: foco.estudianteFoto }} style={s.candAvatar} />
            ) : (
              <View style={s.candAvatar}><Ionicons name="person" size={18} color={colors.primaryLight} /></View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={s.microTitulo} numberOfLines={1} noTranslate>{foco.estudianteNombre}</Text>
              <Text style={s.personaMeta}>Ver perfil</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.accionBtn}
            onPress={() => onChatCandidato({ estudianteId: foco.estudianteId, estudianteNombre: foco.estudianteNombre })}
            activeOpacity={0.85}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.primaryLight} />
            <Text style={s.accionTxt}>Chat</Text>
          </TouchableOpacity>
        </View>
      )}

      <DetallePuesto vacante={vacante} esPuesto colors={colors} s={s} />

      {/* Compañeros (solo en vista individual y si hay más de uno) */}
      {foco && companeros.length > 0 && (
        <View style={s.microBox}>
          <Text style={s.microLabel}>Compañeros</Text>
          <View style={{ gap: 6 }}>
            {companeros.map((c) => (
              <TouchableOpacity key={c.id} style={s.companeroRow} onPress={() => onCambiarFoco(c.id)} activeOpacity={0.75}>
                <Ionicons name="person-circle-outline" size={18} color={colors.primaryLight} />
                <Text style={s.companeroTxt} noTranslate>{c.estudianteNombre}</Text>
                <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Tareas */}
      <TareasSection
        vacanteId={vacante.id}
        vacanteTitulo={vacante.titulo}
        empresaId={empresaId}
        empresaNombre={empresaNombre}
        empleados={foco ? [foco] : contratos}
        colors={colors}
        s={s}
        onAbrirAsignar={() => setAsignarOpen(true)}
      />

      {/* Empleados del puesto */}
      <View style={s.candHeader}>
        <Ionicons name="briefcase" size={16} color={colors.primaryLight} />
        <Text style={s.microLabel} noTranslate>{empleados.length}{' '}</Text>
        <Text style={s.microLabel}>{foco ? 'empleado' : 'empleados'}</Text>
      </View>
      <View style={{ gap: 10 }}>
        {empleados.map((c) => (
          <EmpleadoRow
            key={c.id}
            contrato={c}
            colors={colors}
            s={s}
            onVerPerfil={() => onVerPerfil(c.estudianteId)}
            onChat={() => onChatCandidato({ estudianteId: c.estudianteId, estudianteNombre: c.estudianteNombre })}
            onReportar={() => setReportarC(c)}
            onDespedir={() => setDespedirC(c)}
          />
        ))}
      </View>

      {/* ── Modales ── */}
      <ReportarEmpleadoModal
        contrato={reportarC}
        empresaId={empresaId}
        empresaNombre={empresaNombre}
        colors={colors}
        s={s}
        onClose={() => setReportarC(null)}
        onReportado={(total, contrato) => {
          setReportarC(null);
          if (total >= 3) setSugerirDespido(contrato);
        }}
      />
      <DespedirEmpleadoModal
        contrato={despedirC}
        empresaNombre={empresaNombre}
        colors={colors}
        s={s}
        onClose={() => setDespedirC(null)}
        onDespedido={() => { setDespedirC(null); onVolver(); }}
      />
      <AsignarTareaModal
        visible={asignarOpen}
        vacanteId={vacante.id}
        vacanteTitulo={vacante.titulo}
        empresaId={empresaId}
        empresaNombre={empresaNombre}
        empleados={foco ? [foco] : contratos}
        colors={colors}
        s={s}
        onClose={() => setAsignarOpen(false)}
      />

      {/* Modal motivacional: 3er reporte → sugerir despido */}
      <Modal visible={!!sugerirDespido} transparent animationType="none" onRequestClose={() => setSugerirDespido(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalIcono}><Ionicons name="alert-circle" size={26} color={colors.warning} /></View>
            <Text style={s.modalTitulo}>Este empleado acumula 3 reportes</Text>
            <Text style={s.modalTexto}>
              Ya enviaste tres reportes sobre {sugerirDespido?.estudianteNombre}. Si el problema persiste, considera finalizar el contrato.
            </Text>
            <View style={s.modalBotones}>
              <TouchableOpacity style={s.modalCancelar} onPress={() => setSugerirDespido(null)}>
                <Text style={s.modalCancelarTxt}>Entendido</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalConfirmar, { backgroundColor: colors.error }]}
                onPress={() => { const c = sugerirDespido; setSugerirDespido(null); setDespedirC(c); }}
              >
                <Text style={s.modalConfirmarTxt}>Ir a despedir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

/** Fila de un empleado del puesto con sus badges y acciones inline. */
function EmpleadoRow({
  contrato, colors, s, onVerPerfil, onChat, onReportar, onDespedir,
}: {
  contrato: ContratoLaboral;
  colors: GradlyColors;
  s: ReturnType<typeof makeStyles>;
  onVerPerfil: () => void;
  onChat: () => void;
  onReportar: () => void;
  onDespedir: () => void;
}) {
  const reportes = Number(contrato.reportesCount) || 0;
  const advertencias = Array.isArray(contrato.advertenciasEmpresa) ? contrato.advertenciasEmpresa.length : 0;
  return (
    <View style={s.candCard}>
      <TouchableOpacity style={s.candTop} activeOpacity={0.75} onPress={onVerPerfil}>
        {contrato.estudianteFoto ? (
          <Image source={{ uri: contrato.estudianteFoto }} style={s.candAvatar} />
        ) : (
          <View style={s.candAvatar}><Ionicons name="person" size={17} color={colors.primaryLight} /></View>
        )}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={s.candNombre} numberOfLines={1} noTranslate>{contrato.estudianteNombre}</Text>
            <Ionicons name="chevron-forward-circle-outline" size={15} color={colors.primaryLight} />
          </View>
          <Text style={s.candCarrera} numberOfLines={1}>Ver perfil</Text>
        </View>
      </TouchableOpacity>

      {(reportes > 0 || advertencias > 0) && (
        <View style={s.chipsRow}>
          {reportes > 0 && (
            <View style={[s.chip, { backgroundColor: colors.warning + '18', borderColor: colors.warning + '55' }]}>
              <Ionicons name="flag" size={11} color={colors.warning} />
              <Text style={[s.chipCumpleTxt, { color: colors.warning }]} noTranslate>{reportes}</Text>
              <Text style={[s.chipCumpleTxt, { color: colors.warning }]}>{reportes === 1 ? 'reporte' : 'reportes'}</Text>
            </View>
          )}
          {advertencias > 0 && (
            <View style={[s.chip, { backgroundColor: colors.error + '14', borderColor: colors.error + '55' }]}>
              <Ionicons name="alert-circle" size={11} color={colors.error} />
              <Text style={[s.chipCumpleTxt, { color: colors.error }]} noTranslate>{advertencias}</Text>
              <Text style={[s.chipCumpleTxt, { color: colors.error }]}>{advertencias === 1 ? 'advertencia' : 'advertencias'}</Text>
            </View>
          )}
        </View>
      )}

      <View style={s.candAcciones}>
        <TouchableOpacity style={s.accionBtn} onPress={onChat} activeOpacity={0.85}>
          <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.primaryLight} />
          <Text style={s.accionTxt}>Chat</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.accionBtn, s.accionRechazar]} onPress={onReportar} activeOpacity={0.85}>
          <Ionicons name="flag-outline" size={14} color={colors.error} />
          <Text style={[s.accionTxt, { color: colors.error }]}>Reportar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.accionBtn, { borderColor: colors.error, backgroundColor: colors.error }]} onPress={onDespedir} activeOpacity={0.85}>
          <Ionicons name="exit-outline" size={14} color="#fff" />
          <Text style={[s.accionTxt, { color: '#fff' }]}>Despedir</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Sección de Tareas del puesto ──
function TareasSection({
  vacanteId, vacanteTitulo, empresaId, empresaNombre, empleados, colors, s, onAbrirAsignar,
}: {
  vacanteId: string;
  vacanteTitulo: string;
  empresaId: string;
  empresaNombre: string;
  empleados: ContratoLaboral[];
  colors: GradlyColors;
  s: ReturnType<typeof makeStyles>;
  onAbrirAsignar: () => void;
}) {
  const [tareas, setTareas] = useState<TareaLaboral[]>([]);
  useEffect(() => {
    if (!empresaId) return;
    const unsub = onSnapshot(
      query(collection(db, COL_TAREAS), where('empresaId', '==', empresaId)),
      (snap) => setTareas(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as TareaLaboral)).filter((t) => t.vacanteId === vacanteId),
      ),
      (e) => console.warn('tareas puesto:', e),
    );
    return unsub;
  }, [empresaId, vacanteId]);

  const nombrePorId = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of empleados) m[c.estudianteId] = c.estudianteNombre;
    return m;
  }, [empleados]);

  // Agrupa por loteId (o id suelto) para mostrar "a ambos" como una tarjeta.
  const grupos = useMemo(() => {
    const idsVisibles = new Set(empleados.map((e) => e.estudianteId));
    const visibles = tareas.filter((t) => idsVisibles.has(t.estudianteId));
    const m: Record<string, TareaLaboral[]> = {};
    for (const t of visibles) (m[t.loteId || t.id] = m[t.loteId || t.id] ?? []).push(t);
    return Object.values(m).sort((a, b) => {
      const ta = a[0]?.createdAt?.seconds ?? 0;
      const tb = b[0]?.createdAt?.seconds ?? 0;
      return tb - ta;
    });
  }, [tareas, empleados]);

  return (
    <View style={s.microBox}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={s.microLabel}>Tareas</Text>
        <TouchableOpacity style={s.asignarBtn} onPress={onAbrirAsignar} activeOpacity={0.85}>
          <Ionicons name="add" size={14} color="#fff" />
          <Text style={s.asignarBtnTxt}>Asignar tarea</Text>
        </TouchableOpacity>
      </View>
      {grupos.length === 0 ? (
        <Text style={s.vacio}>Sin tareas asignadas.</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {grupos.map((g) => {
            const primera = g[0];
            const completadas = g.filter((t) => t.estado === 'completada').length;
            const paraTodos = g.length > 1;
            const quien = paraTodos
              ? 'Para todos'
              : (nombrePorId[primera.estudianteId] || 'Empleado');
            return (
              <View key={primera.loteId || primera.id} style={s.tareaCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons
                    name={completadas === g.length ? 'checkmark-circle' : 'ellipse-outline'}
                    size={15}
                    color={completadas === g.length ? colors.success : colors.textMuted}
                  />
                  <Text style={s.tareaTitulo} numberOfLines={2} noTranslate>{primera.titulo}</Text>
                </View>
                {!!primera.detalle && <Text style={s.tareaDetalle} noTranslate>{primera.detalle}</Text>}
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  <View style={[s.chip, s.chipSkill]}>
                    <Text style={s.chipSkillTxt}>{paraTodos ? 'Para todos' : ''}</Text>
                    {!paraTodos && <Text style={s.chipSkillTxt} noTranslate>{quien}</Text>}
                  </View>
                  <View style={[s.chip, s.chipSkill]}>
                    <Text style={s.chipSkillTxt} noTranslate>{completadas}/{g.length}</Text>
                    <Text style={s.chipSkillTxt}>completadas</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ── Modal: Reportar empleado ──
function ReportarEmpleadoModal({
  contrato, empresaId, empresaNombre, colors, s, onClose, onReportado,
}: {
  contrato: ContratoLaboral | null;
  empresaId: string;
  empresaNombre: string;
  colors: GradlyColors;
  s: ReturnType<typeof makeStyles>;
  onClose: () => void;
  onReportado: (total: number, contrato: ContratoLaboral) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (contrato) { setMotivo(''); setDescripcion(''); setErr(''); }
  }, [contrato]);

  const enviar = async () => {
    if (!contrato) return;
    if (!motivo) { setErr('Selecciona un motivo.'); return; }
    setEnviando(true);
    setErr('');
    try {
      const { total } = await reportarEmpleado({
        contratoId: contrato.id,
        empresaId,
        empresaNombre,
        estudianteId: contrato.estudianteId,
        estudianteNombre: contrato.estudianteNombre,
        vacanteTitulo: contrato.vacanteTitulo,
        motivo,
        descripcion,
      });
      onReportado(total, contrato);
    } catch (e: any) {
      setErr(e?.message || 'No se pudo enviar el reporte.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal visible={!!contrato} transparent animationType="none" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={s.modalCard}>
          <Text style={s.modalTitulo}>Reportar empleado</Text>
          <Text style={[s.modalTexto, { fontFamily: FONTS.interSemiBold, color: colors.textPrimary }]} noTranslate>
            {contrato?.estudianteNombre}
          </Text>
          <Text style={s.modalTexto}>El administrador revisará este reporte. El empleado recibe un aviso.</Text>
          <View style={s.chipsRow}>
            {MOTIVOS_REPORTE.map((m) => (
              <TouchableOpacity
                key={m}
                style={[s.candFiltro, motivo === m && s.candFiltroActivo]}
                onPress={() => { setMotivo(m); setErr(''); }}
                activeOpacity={0.8}
              >
                <Text style={motivo === m ? s.candFiltroTxtActivo : s.candFiltroTxt}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={s.modalInput}
            value={descripcion}
            onChangeText={setDescripcion}
            placeholder="Detalle (opcional)"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={600}
            selectionColor={colors.primary}
          />
          {!!err && <Text style={s.modalError}>{err}</Text>}
          <View style={s.modalBotones}>
            <TouchableOpacity style={s.modalCancelar} onPress={onClose} disabled={enviando}>
              <Text style={s.modalCancelarTxt}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.modalConfirmar, { backgroundColor: colors.warning }]} onPress={enviar} disabled={enviando}>
              {enviando ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.modalConfirmarTxt}>Enviar reporte</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Modal: Despedir / advertir ──
function DespedirEmpleadoModal({
  contrato, empresaNombre, colors, s, onClose, onDespedido,
}: {
  contrato: ContratoLaboral | null;
  empresaNombre: string;
  colors: GradlyColors;
  s: ReturnType<typeof makeStyles>;
  onClose: () => void;
  onDespedido: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [accion, setAccion] = useState<null | 'advertir' | 'despedir'>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (contrato) { setMotivo(''); setAccion(null); setErr(''); }
  }, [contrato]);

  const advertenciasHechas = Array.isArray(contrato?.advertenciasEmpresa)
    ? contrato!.advertenciasEmpresa.length
    : 0;
  const advertenciaBloqueada = advertenciasHechas >= 3;

  const correr = async (tipo: 'advertir' | 'despedir') => {
    if (!contrato) return;
    if (motivo.trim().length < 5) { setErr('Escribe el motivo (mín. 5 caracteres).'); return; }
    setAccion(tipo);
    setErr('');
    try {
      if (tipo === 'advertir') {
        await advertirEmpleado({
          contratoId: contrato.id,
          empresaNombre,
          estudianteId: contrato.estudianteId,
          vacanteTitulo: contrato.vacanteTitulo,
          texto: motivo,
        });
        onClose();
      } else {
        await despedirEmpleado({
          contratoId: contrato.id,
          empresaNombre,
          estudianteId: contrato.estudianteId,
          vacanteTitulo: contrato.vacanteTitulo,
          motivo,
        });
        onDespedido();
      }
    } catch (e: any) {
      setErr(e?.message || 'No se pudo completar la acción.');
      setAccion(null);
    }
  };

  return (
    <Modal visible={!!contrato} transparent animationType="none" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={s.modalCard}>
          <Text style={s.modalTitulo}>Finalizar contrato</Text>
          <Text style={[s.modalTexto, { fontFamily: FONTS.interSemiBold, color: colors.textPrimary }]} noTranslate>
            {contrato?.estudianteNombre}
          </Text>
          <Text style={s.modalTexto}>
            Escribe el motivo. Puedes enviarlo solo como advertencia, o finalizar el contrato definitivamente (no se reabre).
          </Text>
          <TextInput
            style={s.modalInput}
            value={motivo}
            onChangeText={setMotivo}
            placeholder="Motivo (mín. 5 caracteres)"
            placeholderTextColor={colors.textMuted}
            multiline
            selectionColor={colors.primary}
          />
          {advertenciasHechas > 0 && (
            <Text style={s.modalTexto} noTranslate>
              {advertenciasHechas}/3 {advertenciasHechas === 1 ? 'advertencia enviada' : 'advertencias enviadas'}
            </Text>
          )}
          {!!err && <Text style={s.modalError}>{err}</Text>}
          <View style={{ gap: 8 }}>
            {!advertenciaBloqueada && (
              <TouchableOpacity
                style={[s.modalConfirmar, { backgroundColor: colors.warning }]}
                onPress={() => correr('advertir')}
                disabled={!!accion}
              >
                {accion === 'advertir' ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.modalConfirmarTxt}>Enviar solo como advertencia</Text>}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[s.modalConfirmar, { backgroundColor: colors.error }]}
              onPress={() => correr('despedir')}
              disabled={!!accion}
            >
              {accion === 'despedir' ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.modalConfirmarTxt}>Despedir definitivamente</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={s.modalCancelar} onPress={onClose} disabled={!!accion}>
              <Text style={s.modalCancelarTxt}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Modal: Asignar tarea ──
function AsignarTareaModal({
  visible, vacanteId, vacanteTitulo, empresaId, empresaNombre, empleados, colors, s, onClose,
}: {
  visible: boolean;
  vacanteId: string;
  vacanteTitulo: string;
  empresaId: string;
  empresaNombre: string;
  empleados: ContratoLaboral[];
  colors: GradlyColors;
  s: ReturnType<typeof makeStyles>;
  onClose: () => void;
}) {
  const [titulo, setTitulo] = useState('');
  const [detalle, setDetalle] = useState('');
  const [destino, setDestino] = useState<'todos' | string>('todos'); // 'todos' o un estudianteId
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (visible) {
      setTitulo(''); setDetalle(''); setErr('');
      setDestino(empleados.length === 1 ? empleados[0].estudianteId : 'todos');
    }
  }, [visible, empleados]);

  const enviar = async () => {
    if (!titulo.trim()) { setErr('La tarea necesita un título.'); return; }
    const ids = destino === 'todos' ? empleados.map((e) => e.estudianteId) : [destino];
    if (ids.length === 0) { setErr('No hay empleados a los que asignar.'); return; }
    setEnviando(true);
    setErr('');
    try {
      await asignarTarea({ vacanteId, vacanteTitulo, empresaId, empresaNombre, titulo, detalle, estudianteIds: ids });
      onClose();
    } catch (e: any) {
      setErr(e?.message || 'No se pudo asignar la tarea.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={s.modalCard}>
          <Text style={s.modalTitulo}>Asignar tarea</Text>
          <TextInput
            style={[s.modalInput, { minHeight: 44 }]}
            value={titulo}
            onChangeText={setTitulo}
            placeholder="Título de la tarea"
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.primary}
          />
          <TextInput
            style={s.modalInput}
            value={detalle}
            onChangeText={setDetalle}
            placeholder="Detalle (opcional)"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={600}
            selectionColor={colors.primary}
          />
          {empleados.length > 1 && (
            <>
              <Text style={s.modalTexto}>¿A quién se la asignas?</Text>
              <View style={s.chipsRow}>
                <TouchableOpacity
                  style={[s.candFiltro, destino === 'todos' && s.candFiltroActivo]}
                  onPress={() => setDestino('todos')}
                  activeOpacity={0.8}
                >
                  <Text style={destino === 'todos' ? s.candFiltroTxtActivo : s.candFiltroTxt}>A todos</Text>
                </TouchableOpacity>
                {empleados.map((e) => (
                  <TouchableOpacity
                    key={e.id}
                    style={[s.candFiltro, destino === e.estudianteId && s.candFiltroActivo]}
                    onPress={() => setDestino(e.estudianteId)}
                    activeOpacity={0.8}
                  >
                    <Text style={destino === e.estudianteId ? s.candFiltroTxtActivo : s.candFiltroTxt} noTranslate>
                      {e.estudianteNombre}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
          {!!err && <Text style={s.modalError}>{err}</Text>}
          <View style={s.modalBotones}>
            <TouchableOpacity style={s.modalCancelar} onPress={onClose} disabled={enviando}>
              <Text style={s.modalCancelarTxt}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.modalConfirmar, { backgroundColor: colors.primary }]} onPress={enviar} disabled={enviando}>
              {enviando ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.modalConfirmarTxt}>Asignar</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════
// FASE 5 · RECONTRATAR PASANTES — lista de ex-pasantes de la empresa por
// calificación; cada uno se puede contratar directo a una vacante afín, sin
// que haya postulación. Marca a los que aceptaron una oferta de empleo.
// ════════════════════════════════════════════════════════════════════════
interface ExPasanteFila {
  uid: string;
  nombre: string;
  carrera: string;
  rating: number;
  cvUrl: string;
  foto: string;
}

function RecontratarPasantes({
  empresaId, empresaNombre, contratosActivos, colors, s, onVerPerfil, onChatCandidato, onContratado,
}: {
  empresaId: string;
  empresaNombre: string;
  contratosActivos: ContratoLaboral[];
  colors: GradlyColors;
  s: ReturnType<typeof makeStyles>;
  onVerPerfil: (id: string) => void;
  onChatCandidato: (args: ChatCandidatoArgs) => void;
  onContratado: () => void;
}) {
  const { pasantes, cargando: cargandoPasantes } = usePasantesEmpresa(empresaId);
  const [perfiles, setPerfiles] = useState<Record<string, ExPasanteFila>>({});
  const [ofertas, setOfertas] = useState<OfertaEmpleo[]>([]);
  const [contratarUid, setContratarUid] = useState<string | null>(null);
  const [cvMenu, setCvMenu] = useState<string | null>(null);

  // Ofertas de la empresa (para marcar "Aceptó tu oferta").
  useEffect(() => {
    if (!empresaId) return;
    const unsub = onSnapshot(
      query(collection(db, 'ofertas_empleo'), where('empresaId', '==', empresaId)),
      (snap) => setOfertas(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as OfertaEmpleo))),
      (e) => console.warn('ofertas recontratar:', e),
    );
    return unsub;
  }, [empresaId]);

  // Perfiles de los ex-pasantes.
  const idsKey = [...pasantes].sort().join(',');
  useEffect(() => {
    let cancel = false;
    const ids = idsKey ? idsKey.split(',') : [];
    (async () => {
      const faltan = ids.filter((id) => id && !perfiles[id]);
      if (faltan.length === 0) return;
      const nuevos: Record<string, ExPasanteFila> = {};
      await Promise.all(faltan.map(async (id) => {
        try {
          const snap = await getDoc(doc(db, 'perfiles_estudiantes', id));
          const d = snap.exists() ? (snap.data() as any) : {};
          nuevos[id] = {
            uid: id,
            nombre: d.nombre_completo || 'Estudiante',
            carrera: d.carrera || '',
            rating: Number(d.calificacion_promedio) || 0,
            cvUrl: d.cv_url || '',
            foto: d.foto_url || '',
          };
        } catch {
          nuevos[id] = { uid: id, nombre: 'Estudiante', carrera: '', rating: 0, cvUrl: '', foto: '' };
        }
      }));
      if (!cancel) setPerfiles((prev) => ({ ...prev, ...nuevos }));
    })();
    return () => { cancel = true; };
  }, [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const yaContratados = useMemo(
    () => new Set(contratosActivos.map((c) => c.estudianteId)),
    [contratosActivos],
  );
  const ofertaAceptadaDe = useMemo(() => {
    const set = new Set<string>();
    for (const o of ofertas) if (o.estado === 'aceptada') set.add(o.estudianteId);
    return set;
  }, [ofertas]);

  const filas = useMemo(() => {
    return [...pasantes]
      .map((id) => perfiles[id])
      .filter((p): p is ExPasanteFila => !!p && !yaContratados.has(p.uid))
      .sort((a, b) => {
        // Los que aceptaron una oferta primero; luego por rating.
        const af = (p: ExPasanteFila) => (ofertaAceptadaDe.has(p.uid) ? 0 : 1);
        return af(a) - af(b) || b.rating - a.rating || a.nombre.localeCompare(b.nombre);
      });
  }, [pasantes, perfiles, yaContratados, ofertaAceptadaDe]);

  const abrirCV = (url: string) => { if (url) Linking.openURL(url).catch(() => {}); setCvMenu(null); };

  if (cargandoPasantes && filas.length === 0) {
    return <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator size="small" color={colors.primary} /></View>;
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
      <Text style={s.recontratarIntro}>
        Estudiantes que ya culminaron su pasantía contigo, ordenados por calificación. Contrátalos directo a una vacante afín a su carrera.
      </Text>
      {filas.length === 0 ? (
        <Text style={s.vacio}>Aún no tienes ex-pasantes disponibles para recontratar.</Text>
      ) : (
        <View style={{ gap: 10 }}>
          {filas.map((p) => {
            const acepto = ofertaAceptadaDe.has(p.uid);
            return (
              <View key={p.uid} style={[s.candCard, acepto && { borderColor: colors.success + '77' }]}>
                <TouchableOpacity style={s.candTop} activeOpacity={0.75} onPress={() => onVerPerfil(p.uid)}>
                  {p.foto ? (
                    <Image source={{ uri: p.foto }} style={s.candAvatar} />
                  ) : (
                    <View style={s.candAvatar}><Ionicons name="person" size={17} color={colors.primaryLight} /></View>
                  )}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Text style={s.candNombre} numberOfLines={1} noTranslate>{p.nombre}</Text>
                      <Ionicons name="chevron-forward-circle-outline" size={15} color={colors.primaryLight} />
                    </View>
                    {!!p.carrera && <Text style={s.candCarrera} numberOfLines={1} noTranslate>{p.carrera}</Text>}
                  </View>
                  {p.rating > 0 && (
                    <View style={s.ratingPill}>
                      <Ionicons name="star" size={12} color={colors.gold} />
                      <Text style={s.ratingTxt} noTranslate>{p.rating.toFixed(1)}</Text>
                    </View>
                  )}
                </TouchableOpacity>

                {acepto && (
                  <View style={[s.chip, s.chipPriv, { alignSelf: 'flex-start' }]}>
                    <Ionicons name="checkmark-circle" size={11} color={colors.success} />
                    <Text style={s.chipPrivTxt}>Aceptó tu oferta de empleo</Text>
                  </View>
                )}

                <View style={s.candAcciones}>
                  <TouchableOpacity
                    style={s.accionBtn}
                    onPress={() => onChatCandidato({ estudianteId: p.uid, estudianteNombre: p.nombre })}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.primaryLight} />
                    <Text style={s.accionTxt}>Chat</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.accionBtn, !p.cvUrl && s.accionDeshabilitada]}
                    onPress={() => p.cvUrl && setCvMenu(cvMenu === p.uid ? null : p.uid)}
                    disabled={!p.cvUrl}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="document-text-outline" size={14} color={p.cvUrl ? colors.primaryLight : colors.textMuted} />
                    <Text style={[s.accionTxt, !p.cvUrl && { color: colors.textMuted }]}>CV</Text>
                    {!!p.cvUrl && <Ionicons name="chevron-down" size={12} color={colors.primaryLight} />}
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.accionBtn, s.accionContratar]} onPress={() => setContratarUid(p.uid)} activeOpacity={0.85}>
                    <Ionicons name="checkmark" size={14} color="#fff" />
                    <Text style={[s.accionTxt, { color: '#fff' }]}>Contratar</Text>
                  </TouchableOpacity>
                </View>

                {cvMenu === p.uid && !!p.cvUrl && (
                  <View style={s.cvMenu}>
                    <TouchableOpacity style={s.cvMenuItem} onPress={() => abrirCV(p.cvUrl)} activeOpacity={0.8}>
                      <Ionicons name="eye-outline" size={14} color={colors.textPrimary} />
                      <Text style={s.cvMenuTxt}>Ver CV</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.cvMenuItem} onPress={() => abrirCV(p.cvUrl)} activeOpacity={0.8}>
                      <Ionicons name="open-outline" size={14} color={colors.textPrimary} />
                      <Text style={s.cvMenuTxt}>Abrir en navegador</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      <ContratarExPasanteModal
        pasante={contratarUid ? perfiles[contratarUid] ?? null : null}
        empresaId={empresaId}
        empresaNombre={empresaNombre}
        colors={colors}
        s={s}
        onClose={() => setContratarUid(null)}
        onContratado={() => { setContratarUid(null); onContratado(); }}
      />
    </ScrollView>
  );
}

// ── Modal: elegir vacante y contratar a un ex-pasante ──
function ContratarExPasanteModal({
  pasante, empresaId, empresaNombre, colors, s, onClose, onContratado,
}: {
  pasante: ExPasanteFila | null;
  empresaId: string;
  empresaNombre: string;
  colors: GradlyColors;
  s: ReturnType<typeof makeStyles>;
  onClose: () => void;
  onContratado: () => void;
}) {
  const [cargando, setCargando] = useState(true);
  const [vacantes, setVacantes] = useState<VacanteParaContrato[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!pasante) return;
    let cancel = false;
    setCargando(true); setSel(null); setErr(''); setEnviando(false);
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'vacantes'), where('empresa_id', '==', empresaId)));
        if (cancel) return;
        const carreraN = normalizarSkill(pasante.carrera ?? '');
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((v) => v.categoria === 'vacante' && !v.cerrada && v.activa !== false && v.estado_moderacion !== 'eliminada')
          .map((v) => ({
            id: v.id, titulo: v.titulo || 'Vacante', area: v.area, modalidad: v.modalidad,
            modalidad_contrato: v.modalidad_contrato, ubicacion_texto: v.ubicacion_texto ?? null,
            horario: v.horario ?? null, salario_min: v.salario_min ?? null, salario_max: v.salario_max ?? null,
            cupos: v.cupos ?? null, contratados_count: v.contratados_count ?? 0,
          } as VacanteParaContrato))
          .sort((a, b) => {
            const af = (x: VacanteParaContrato) => (carreraN && normalizarSkill(x.area ?? '').includes(carreraN.slice(0, 6)) ? 0 : 1);
            return af(a) - af(b) || (a.titulo || '').localeCompare(b.titulo || '');
          });
        setVacantes(list);
      } catch (e) {
        console.warn('[ContratarExPasante] vacantes', e);
        setVacantes([]);
      } finally {
        if (!cancel) setCargando(false);
      }
    })();
    return () => { cancel = true; };
  }, [pasante, empresaId]);

  const confirmar = async () => {
    if (!pasante || !sel) { setErr('Elige una vacante.'); return; }
    const v = vacantes.find((x) => x.id === sel);
    if (!v) return;
    setEnviando(true); setErr('');
    try {
      await contratarExPasante({
        vacante: v,
        estudianteId: pasante.uid,
        estudianteNombre: pasante.nombre,
        estudianteFoto: pasante.foto,
        empresaId,
        empresaNombre,
        origen: 'recontratacion',
      });
      onContratado();
    } catch (e: any) {
      setErr(e?.message || 'No se pudo contratar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal visible={!!pasante} transparent animationType="none" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={s.modalCard}>
          <Text style={s.modalTitulo}>Contratar a un ex-pasante</Text>
          <Text style={[s.modalTexto, { fontFamily: FONTS.interSemiBold, color: colors.textPrimary }]} noTranslate>
            {pasante?.nombre}
          </Text>
          <Text style={s.modalTexto}>Elige la vacante bajo la cual quedará contratado.</Text>
          {cargando ? (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}><ActivityIndicator size="small" color={colors.primary} /></View>
          ) : vacantes.length === 0 ? (
            <Text style={s.vacio}>No tienes vacantes de empleo abiertas.</Text>
          ) : (
            <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
              <View style={{ gap: 8 }}>
                {vacantes.map((v) => {
                  const activo = sel === v.id;
                  return (
                    <TouchableOpacity
                      key={v.id}
                      style={[s.exVacOpcion, activo && s.exVacOpcionActiva]}
                      onPress={() => { setSel(v.id); setErr(''); }}
                      activeOpacity={0.85}
                    >
                      <Ionicons name={activo ? 'radio-button-on' : 'radio-button-off'} size={18} color={activo ? colors.primary : colors.textMuted} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.exVacTitulo} numberOfLines={1} noTranslate>{v.titulo}</Text>
                        {!!(v.area || v.modalidad) && (
                          <Text style={s.exVacMeta} numberOfLines={1} noTranslate>{[v.area, v.modalidad].filter(Boolean).join(' · ')}</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          )}
          {!!err && <Text style={s.modalError}>{err}</Text>}
          <View style={s.modalBotones}>
            <TouchableOpacity style={s.modalCancelar} onPress={onClose} disabled={enviando}>
              <Text style={s.modalCancelarTxt}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.modalConfirmar, { backgroundColor: colors.success }]} onPress={confirmar} disabled={enviando || !sel}>
              {enviando ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.modalConfirmarTxt}>Contratar</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
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
    modalIcono: {
      alignSelf: 'center', width: 48, height: 48, borderRadius: 24,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.warning + '1E', borderWidth: 1, borderColor: c.warning + '55',
    },

    // ── Fase 3: puesto contratado ──
    empHeader: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: c.backgroundCard, borderWidth: 1, borderColor: c.border,
      borderRadius: 14, padding: 12,
    },
    companeroRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingVertical: 8, paddingHorizontal: 4,
    },
    companeroTxt: { flex: 1, fontSize: 13, fontFamily: FONTS.interSemiBold, color: c.primaryLight },
    asignarBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
      backgroundColor: c.primary,
    },
    asignarBtnTxt: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: '#fff' },
    tareaCard: {
      backgroundColor: c.backgroundSurface, borderWidth: 1, borderColor: c.border,
      borderRadius: 10, padding: 11, gap: 6,
    },
    tareaTitulo: { flex: 1, fontSize: 13, fontFamily: FONTS.interSemiBold, color: c.textPrimary },
    tareaDetalle: { fontSize: 11.5, color: c.textMuted, lineHeight: 16 },

    // ── Fase 5: filtro supremo + recontratar pasantes ──
    supremo: {
      flexDirection: 'row', gap: 6, padding: 4, marginBottom: 12,
      backgroundColor: c.backgroundSurface, borderRadius: 14,
      borderWidth: 1, borderColor: c.border,
    },
    supremoBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
      paddingVertical: 10, borderRadius: 10,
    },
    supremoBtnActivo: { backgroundColor: c.primary },
    supremoTxt: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: c.textMuted },
    supremoTxtActivo: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: '#fff' },
    recontratarIntro: { fontSize: 12.5, color: c.textSecondary, lineHeight: 18, marginBottom: 14 },
    exVacOpcion: {
      flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 12,
      borderWidth: 1, borderColor: c.border, backgroundColor: c.backgroundSurface,
    },
    exVacOpcionActiva: { borderColor: c.primary, backgroundColor: c.primary + '12' },
    exVacTitulo: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: c.textPrimary },
    exVacMeta: { fontSize: 11.5, color: c.textMuted, marginTop: 1 },
  });
