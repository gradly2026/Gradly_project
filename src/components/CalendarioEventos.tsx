/**
 * CalendarioEventos.tsx — Calendario mensual de solo lectura para el Inicio de
 * la universidad. Marca en el mes los hitos reales de la cuenta, tomados de
 * Firestore:
 *
 *   · Registro en la plataforma   → usuarios/{uid}.fecha_registro
 *   · Creación de un grupo         → grupos.fecha_creacion
 *   · Postulación de grupo enviada → aplicaciones_grupos.fechaPostulacion
 *   · Inicio de pasantía           → solicitudes_practicas.fechaInicio
 *   · Fin de pasantía              → solicitudes_practicas.fechaFin
 *   · Egreso de un grupo           → grupos.fecha_egreso
 *
 * Navegación por meses con flechas. Al tocar un día se listan sus eventos.
 */
import { Ionicons } from '@expo/vector-icons';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,

  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { AutoText as Text } from "./AutoText";
import { db } from '../config/firebaseConfig';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { useTranslation } from '../context/TranslationContext';
import { GlassCard } from '../../components/ui/liquid-glass/GlassCard';

const MAX_W = 640;
/** Primera letra en mayúscula (los nombres de mes de Intl vienen en minúscula). */
const capitalizar = (texto: string) => (texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto);

type TipoEvento = 'registro' | 'grupo_creado' | 'postulacion' | 'pasantia_inicio' | 'pasantia_fin' | 'egreso' | 'vacante' | 'practica_dia';

interface Evento {
  fecha: Date;
  tipo: TipoEvento;
  titulo: string;
  detalle?: string;
}

const META: Record<TipoEvento, { icon: keyof typeof Ionicons.glyphMap; colorKey: keyof GradlyColors }> = {
  registro:         { icon: 'flag',              colorKey: 'primaryLight' },
  grupo_creado:     { icon: 'albums',            colorKey: 'accent' },
  postulacion:      { icon: 'paper-plane',       colorKey: 'warning' },
  pasantia_inicio:  { icon: 'play',              colorKey: 'success' },
  pasantia_fin:     { icon: 'stop',              colorKey: 'primaryLight' },
  egreso:           { icon: 'school',            colorKey: 'gold' },
  vacante:          { icon: 'briefcase',         colorKey: 'accent' },
  practica_dia:     { icon: 'briefcase-outline', colorKey: 'success' },
};

/** Nombre de día laboral (del acuerdo) → getDay() de JS. */
const DIA_A_JS: Record<string, number> = {
  Lunes: 1, Martes: 2, Miércoles: 3, Jueves: 4, Viernes: 5,
};

/** Convierte un Timestamp de Firestore o un string ISO 'YYYY-MM-DD' a Date local. */
function aFecha(v: any): Date | null {
  if (!v) return null;
  if (typeof v?.toDate === 'function') return v.toDate();
  if (typeof v === 'string') {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  return null;
}

const claveDia = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const mismoDia = (a: Date, b: Date) => claveDia(a) === claveDia(b);

export default function CalendarioEventos({ uid, rol = 'universidad' }: { uid: string; rol?: 'universidad' | 'empresa' | 'estudiante' }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { locale } = useTranslation();

  const { width: winW } = useWindowDimensions();
  const boxWidth = Math.min(winW - 32, MAX_W);

  const hoy = useMemo(() => new Date(), []);
  const [mesVisible, setMesVisible] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [diaSel, setDiaSel] = useState<Date | null>(null);

  // Formatos de fecha/mes/día que respetan el idioma activo (antes fijos en
  // español vía los arrays MESES/DIAS_SEMANA).
  const formatoMesTitulo = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }),
    [locale],
  );
  const formatoDiaSemana = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }),
    [locale],
  );
  const formatoFechaDetalle = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }),
    [locale],
  );
  const formatoFechaCorta = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric' }),
    [locale],
  );
  // Encabezados L-M-M-J-V-S-D (o su equivalente en el idioma activo), derivados
  // de una semana de referencia fija (2026-01-05 es lunes) para no depender del
  // mes visible.
  const diasSemana = useMemo(() => {
    const lunesBase = new Date(Date.UTC(2026, 0, 5));
    return Array.from({ length: 7 }, (_, idx) => {
      const dia = new Date(lunesBase);
      dia.setUTCDate(lunesBase.getUTCDate() + idx);
      return formatoDiaSemana.format(dia).toLocaleUpperCase(locale);
    });
  }, [formatoDiaSemana, locale]);
  const tituloMesVisible = useMemo(
    () => capitalizar(formatoMesTitulo.format(mesVisible)),
    [formatoMesTitulo, mesVisible],
  );

  // Fuentes de datos (filtradas por el usuario actual según su rol).
  const esEmpresa = rol === 'empresa';
  const esEstudiante = rol === 'estudiante';
  const [registro, setRegistro] = useState<Date | null>(null);
  const [grupos, setGrupos] = useState<any[]>([]);
  const [vacantes, setVacantes] = useState<any[]>([]);
  const [postulaciones, setPostulaciones] = useState<any[]>([]);
  const [solicitudes, setSolicitudes] = useState<any[]>([]);

  useEffect(() => {
    if (!uid) return;
    let cancel = false;
    getDoc(doc(db, 'usuarios', uid))
      .then(snap => { if (!cancel && snap.exists()) setRegistro(aFecha((snap.data() as any).fecha_registro)); })
      .catch(() => {});
    return () => { cancel = true; };
  }, [uid]);

  useEffect(() => {
    if (!uid) return;

    // El ESTUDIANTE solo ve sus pasantías (solicitudes donde está su uid en
    // `estudianteIds`); no tiene grupos/vacantes/postulaciones propias.
    if (esEstudiante) {
      const unsub = onSnapshot(
        query(collection(db, 'solicitudes_practicas'), where('estudianteIds', 'array-contains', uid)),
        s => setSolicitudes(s.docs.map(d => d.data())),
        e => console.warn('Error listener (solicitudes calendario estudiante):', e),
      );
      return () => unsub();
    }

    // La empresa filtra por sus campos (empresa_id/empresaId) y usa vacantes en
    // lugar de grupos; la universidad usa grupos y sus campos universidadId.
    const campoAplic = esEmpresa ? 'empresaId' : 'universidadId';
    const unsubs = [
      onSnapshot(query(collection(db, 'aplicaciones_grupos'), where(campoAplic, '==', uid)),
        s => setPostulaciones(s.docs.map(d => d.data())),
        e => console.warn('Error listener (postulaciones calendario):', e)),
      onSnapshot(query(collection(db, 'solicitudes_practicas'), where(campoAplic, '==', uid)),
        s => setSolicitudes(s.docs.map(d => d.data())),
        e => console.warn('Error listener (solicitudes calendario):', e)),
    ];
    if (esEmpresa) {
      unsubs.push(
        onSnapshot(query(collection(db, 'vacantes'), where('empresa_id', '==', uid)),
          s => setVacantes(s.docs.map(d => d.data())),
          e => console.warn('Error listener (vacantes calendario):', e)),
      );
    } else {
      unsubs.push(
        onSnapshot(query(collection(db, 'grupos'), where('universidad_id', '==', uid)),
          s => setGrupos(s.docs.map(d => d.data())),
          e => console.warn('Error listener (grupos calendario):', e)),
      );
    }
    return () => unsubs.forEach(u => u());
  }, [uid, esEmpresa, esEstudiante]);

  // ── Ensamblado de eventos ──
  const eventos = useMemo(() => {
    const out: Evento[] = [];
    if (registro) out.push({ fecha: registro, tipo: 'registro', titulo: 'Te uniste a Gradly' });

    if (esEmpresa) {
      vacantes.forEach(v => {
        const f = aFecha(v.fecha_creacion ?? v.fecha_publicacion);
        if (f) out.push({ fecha: f, tipo: 'vacante', titulo: 'Vacante publicada', detalle: v.titulo });
      });
      postulaciones.forEach(p => {
        const f = aFecha(p.fechaPostulacion);
        if (f) out.push({ fecha: f, tipo: 'postulacion', titulo: 'Postulación recibida', detalle: p.grupoNombre || p.vacanteTitulo });
      });
    } else if (!esEstudiante) {
      grupos.forEach(g => {
        const fc = aFecha(g.fecha_creacion);
        if (fc) out.push({ fecha: fc, tipo: 'grupo_creado', titulo: 'Grupo creado', detalle: g.nombre });
        const fe = aFecha(g.fecha_egreso);
        if (fe) out.push({ fecha: fe, tipo: 'egreso', titulo: 'Grupo egresado', detalle: g.nombre });
      });
      postulaciones.forEach(p => {
        const f = aFecha(p.fechaPostulacion);
        if (f) out.push({ fecha: f, tipo: 'postulacion', titulo: 'Postulación enviada', detalle: p.empresaNombre || p.grupoNombre });
      });
    }

    solicitudes.forEach(sg => {
      const fi = aFecha(sg.fechaInicio);
      if (fi) out.push({ fecha: fi, tipo: 'pasantia_inicio', titulo: 'Inicio de pasantía', detalle: sg.grupoNombre });
      const ff = aFecha(sg.fechaFin);
      if (ff) out.push({ fecha: ff, tipo: 'pasantia_fin', titulo: 'Fin de pasantía', detalle: sg.grupoNombre });

      // Días de asistencia acordados: se marca cada día laborable del acuerdo
      // (Lunes..Viernes elegidos) desde el inicio hasta el fin del periodo.
      const ac = sg.acuerdo;
      const dias: string[] = Array.isArray(ac?.dias) ? ac.dias : [];
      const ini = aFecha(ac?.fechaInicio ?? sg.fechaInicio);
      const fin = aFecha(ac?.fechaFin ?? sg.fechaFin);
      if (dias.length && ini && fin && fin.getTime() >= ini.getTime()) {
        const set = new Set(dias.map(d => DIA_A_JS[d]).filter(n => n !== undefined));
        const cursor = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate());
        const finDia = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate());
        while (cursor.getTime() <= finDia.getTime()) {
          if (set.has(cursor.getDay())) {
            out.push({ fecha: new Date(cursor), tipo: 'practica_dia', titulo: 'Día de práctica', detalle: sg.grupoNombre });
          }
          cursor.setDate(cursor.getDate() + 1);
        }
      }
    });

    return out;
  }, [esEmpresa, esEstudiante, registro, grupos, vacantes, postulaciones, solicitudes]);

  // Índice día → eventos.
  const porDia = useMemo(() => {
    const m = new Map<string, Evento[]>();
    eventos.forEach(ev => {
      const k = claveDia(ev.fecha);
      const arr = m.get(k) ?? [];
      arr.push(ev);
      m.set(k, arr);
    });
    return m;
  }, [eventos]);

  // ── Celdas del mes visible ──
  const celdas = useMemo(() => {
    const y = mesVisible.getFullYear();
    const mth = mesVisible.getMonth();
    const primerDiaSemana = (new Date(y, mth, 1).getDay() + 6) % 7; // 0 = lunes
    const diasEnMes = new Date(y, mth + 1, 0).getDate();
    const arr: (Date | null)[] = [];
    for (let i = 0; i < primerDiaSemana; i++) arr.push(null);
    for (let d = 1; d <= diasEnMes; d++) arr.push(new Date(y, mth, d));
    return arr;
  }, [mesVisible]);

  // Mes de registro: es el límite más antiguo que la universidad puede ver.
  const minMonth = useMemo(
    () => (registro ? new Date(registro.getFullYear(), registro.getMonth(), 1) : null),
    [registro],
  );
  const puedeRetroceder = !minMonth || mesVisible.getTime() > minMonth.getTime();

  const cambiarMes = (delta: number) => {
    if (delta < 0 && !puedeRetroceder) return;
    setMesVisible(prev => {
      const next = new Date(prev.getFullYear(), prev.getMonth() + delta, 1);
      if (minMonth && next.getTime() < minMonth.getTime()) return prev;
      return next;
    });
    setDiaSel(null);
  };

  const eventosDiaSel = diaSel ? (porDia.get(claveDia(diaSel)) ?? []) : [];

  // Próximos eventos (a partir de hoy) cuando no hay día seleccionado.
  const proximos = useMemo(() => {
    const hoy0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
    return eventos
      .filter(e => e.fecha.getTime() >= hoy0 && e.tipo !== 'practica_dia')
      .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
      .slice(0, 4);
  }, [eventos, hoy]);

  const cellSize = (boxWidth - 36) / 7;

  const renderEvento = (ev: Evento, i: number) => {
    const meta = META[ev.tipo];
    const color = colors[meta.colorKey] as string;
    return (
      <View key={i} style={styles.evRow}>
        <View style={[styles.evIcon, { backgroundColor: color + '22' }]}>
          <Ionicons name={meta.icon} size={14} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.evTitulo} numberOfLines={1}>{ev.titulo}</Text>
          {!!ev.detalle && <Text style={styles.evDetalle} numberOfLines={1}>{ev.detalle}</Text>}
        </View>
        <Text style={styles.evFecha}>{formatoFechaCorta.format(ev.fecha)}</Text>
      </View>
    );
  };

  return (
    <View style={{ marginBottom: 16, width: boxWidth, alignSelf: 'center' }}>
      <GlassCard contentStyle={{ padding: 16 }}>
        {/* Encabezado con navegación de mes */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => cambiarMes(-1)}
            disabled={!puedeRetroceder}
            style={[styles.navBtn, !puedeRetroceder && { opacity: 0.35 }]}
          >
            <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.mesTitulo}>{tituloMesVisible}</Text>
          <TouchableOpacity onPress={() => cambiarMes(1)} style={styles.navBtn}>
            <Ionicons name="chevron-forward" size={18} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Cabecera de días de la semana */}
        <View style={styles.semana}>
          {diasSemana.map((d, i) => (
            <Text key={i} style={[styles.semanaTxt, { width: cellSize }]}>{d}</Text>
          ))}
        </View>

        {/* Grilla del mes */}
        <View style={styles.grid}>
          {celdas.map((d, i) => {
            if (!d) return <View key={i} style={{ width: cellSize, height: cellSize }} />;
            const evs = porDia.get(claveDia(d)) ?? [];
            const esHoy = mismoDia(d, hoy);
            const esSel = diaSel && mismoDia(d, diaSel);
            const esPractica = evs.some(e => e.tipo === 'practica_dia');
            return (
              <TouchableOpacity
                key={i}
                style={{ width: cellSize, height: cellSize, alignItems: 'center', justifyContent: 'center' }}
                onPress={() => setDiaSel(esSel ? null : d)}
                activeOpacity={0.7}
              >
                <View style={[styles.dia, esPractica && styles.diaPractica, esHoy && styles.diaHoy, esSel && styles.diaSel]}>
                  <Text style={[styles.diaTxt, (esHoy || esSel) && styles.diaTxtActivo]}>{d.getDate()}</Text>
                </View>
                <View style={styles.puntos}>
                  {evs.filter(e => e.tipo !== 'practica_dia').slice(0, 3).map((ev, j) => (
                    <View key={j} style={[styles.punto, { backgroundColor: colors[META[ev.tipo].colorKey] as string }]} />
                  ))}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Detalle: eventos del día seleccionado o próximos */}
        <View style={styles.detalle}>
          {diaSel ? (
            eventosDiaSel.length === 0
              ? <Text style={styles.empty}>Sin eventos el {formatoFechaDetalle.format(diaSel)}.</Text>
              : eventosDiaSel.map(renderEvento)
          ) : (
            <>
              <Text style={styles.detalleTitulo}>Próximos eventos</Text>
              {proximos.length === 0
                ? <Text style={styles.empty}>No hay eventos próximos.</Text>
                : proximos.map(renderEvento)}
            </>
          )}
        </View>
      </GlassCard>
    </View>
  );
}

const makeStyles = (COLORS: GradlyColors) => StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  navBtn: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.backgroundSurface, borderWidth: 1, borderColor: COLORS.border,
  },
  mesTitulo: { fontSize: 15, fontFamily: FONTS.soraSemiBold, color: COLORS.textPrimary },

  semana: { flexDirection: 'row', marginBottom: 4 },
  semanaTxt: { textAlign: 'center', fontSize: 11, fontFamily: FONTS.interSemiBold, color: COLORS.textMuted },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dia: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  diaHoy: { backgroundColor: COLORS.primary + '33', borderWidth: 1, borderColor: COLORS.primaryLight },
  diaPractica: { backgroundColor: COLORS.success + '2E', borderWidth: 1, borderColor: COLORS.success + '66' },
  diaSel: { backgroundColor: COLORS.primary },
  diaTxt: { fontSize: 13, fontFamily: FONTS.interMedium, color: COLORS.textPrimary },
  diaTxtActivo: { color: COLORS.textPrimary, fontFamily: FONTS.interSemiBold },
  puntos: { flexDirection: 'row', gap: 2, height: 6, marginTop: 1 },
  punto: { width: 4, height: 4, borderRadius: 2 },

  detalle: { marginTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12, gap: 8 },
  detalleTitulo: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight, letterSpacing: 0.3 },
  empty: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textMuted, paddingVertical: 6 },

  evRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  evIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  evTitulo: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  evDetalle: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
  evFecha: { fontSize: 11, fontFamily: FONTS.rajdhaniSemiBold, color: COLORS.textMuted },
});
