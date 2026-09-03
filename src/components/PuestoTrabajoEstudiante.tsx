// ════════════════════════════════════════════════════════════════════════
// PuestoTrabajoEstudiante.tsx — la vista "Puesto de trabajo" de la pestaña
// "Mi Progreso" del estudiante (la otra pestaña, "Pasantía culminada", es el
// contenido de siempre de progreso.tsx, intacto).
//
// Muestra el empleo REAL del graduado (colección `contratos_laborales`):
//   · Mi institución  → empresa que contrató, puesto, compañeros, fecha inicio
//   · Mi calendario   → el horario laboral, pintado en el mes (CalendarioEventos)
//   · Tareas          → las que asignó la empresa; el estudiante las marca hechas
//   · Renuncia        → aviso a la empresa, o renuncia definitiva (anula contrato)
//
// Cuando no hay contrato activo (nunca contratado, o renunció / fue despedido)
// muestra un estado vacío hasta que vuelva a ser contratado.
// ════════════════════════════════════════════════════════════════════════
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { AutoText as Text, AutoTextInput as TextInput } from './AutoText';
import { db } from '../config/firebaseConfig';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { GlassCard } from '../../components/ui/liquid-glass/GlassCard';
import CalendarioEventos from './CalendarioEventos';
import { textoHorario } from '../data/disponibilidad';
import {
  COL_CONTRATOS,
  COL_TAREAS,
  avisarEmpresaContrato,
  completarTarea,
  renunciarPuesto,
  type ContratoLaboral,
  type TareaLaboral,
} from '../services/contratoService';

/** Timestamp/Date/ISO → "12 sep 2026" (o "" si no parsea). */
function fechaLegible(v: any): string {
  if (!v) return '';
  const d: Date | null =
    typeof v?.toDate === 'function' ? v.toDate()
    : v instanceof Date ? v
    : typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v)
    : typeof v?.seconds === 'number' ? new Date(v.seconds * 1000)
    : null;
  if (!d) return '';
  return d.toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Timestamp/Date → "yyyy-mm-dd" en hora LOCAL (para CalendarioEventos). */
function fechaISOLocal(v: any): string | null {
  const d: Date | null =
    typeof v?.toDate === 'function' ? v.toDate()
    : v instanceof Date ? v
    : typeof v?.seconds === 'number' ? new Date(v.seconds * 1000)
    : null;
  if (!d) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function PuestoTrabajoEstudiante({
  uid, estudianteNombre, onVerPerfil,
}: {
  uid: string;
  estudianteNombre: string;
  /** Abre la vista de perfil de un compañero (lo cablea la pantalla padre). */
  onVerPerfil?: (estudianteId: string) => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [contrato, setContrato] = useState<ContratoLaboral | null>(null);
  const [tareas, setTareas] = useState<TareaLaboral[]>([]);
  const [cargando, setCargando] = useState(true);
  const [renunciaOpen, setRenunciaOpen] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      query(collection(db, COL_CONTRATOS), where('estudianteId', '==', uid)),
      (snap) => {
        const activo = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) } as ContratoLaboral))
          .find((c) => c.estado === 'activo');
        setContrato(activo ?? null);
        setCargando(false);
      },
      (e) => { console.warn('contrato estudiante:', e); setCargando(false); },
    );
    return unsub;
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      query(collection(db, COL_TAREAS), where('estudianteId', '==', uid)),
      (snap) => setTareas(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as TareaLaboral))),
      (e) => console.warn('tareas estudiante:', e),
    );
    return unsub;
  }, [uid]);

  if (cargando) {
    return (
      <View style={{ paddingVertical: 40, alignItems: 'center' }}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (!contrato) {
    return (
      <View style={s.vacio}>
        <Ionicons name="briefcase-outline" size={42} color={colors.border} />
        <Text style={s.vacioTxt}>
          No tienes un puesto de trabajo activo. Cuando una empresa te contrate, aquí verás los detalles del puesto.
        </Text>
      </View>
    );
  }

  const tareasDelPuesto = tareas
    .filter((t) => t.vacanteId === contrato.vacanteId)
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
  const companeros = Array.isArray(contrato.companeros) ? contrato.companeros : [];
  const horario = textoHorario(contrato.horario);
  const fechaInicioISO = fechaISOLocal(contrato.fechaInicio);
  // El empleo no tiene fecha de fin: se pinta una ventana móvil de ~6 meses
  // para que CalendarioEventos marque los días laborales del mes en curso.
  const ventanaCalendario = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    return d;
  }, []);

  return (
    <>
      {/* ── Mi institución ── */}
      <Text style={s.sectionTitle}>Mi institución</Text>
      <GlassCard style={{ marginBottom: 18 }} contentStyle={{ padding: 16, gap: 12 }}>
        <Dato icono="business-outline" label="Empresa que me contrató" valor={contrato.empresaNombre} colors={colors} s={s} />
        <Dato icono="briefcase-outline" label="Puesto de trabajo" valor={contrato.vacanteTitulo} colors={colors} s={s} />
        <Dato icono="calendar-outline" label="Fecha de inicio" valor={fechaLegible(contrato.fechaInicio) || '—'} colors={colors} s={s} />
        <View>
          <View style={s.datoFila}>
            <Ionicons name="people-outline" size={16} color={colors.primaryLight} style={{ width: 22 }} />
            <Text style={s.datoLabel}>Compañeros</Text>
          </View>
          {companeros.length === 0 ? (
            <Text style={s.datoValorSuelto}>Puesto único: no tienes compañeros en esta plaza.</Text>
          ) : (
            <View style={{ gap: 6, marginTop: 6 }}>
              {companeros.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={s.companeroRow}
                  activeOpacity={onVerPerfil ? 0.7 : 1}
                  disabled={!onVerPerfil}
                  onPress={() => onVerPerfil?.(c.id)}
                >
                  {c.foto ? (
                    <Image source={{ uri: c.foto }} style={s.companeroAvatar} />
                  ) : (
                    <View style={s.companeroAvatar}><Ionicons name="person" size={13} color={colors.primaryLight} /></View>
                  )}
                  <Text style={s.companeroTxt} numberOfLines={1} noTranslate>{c.nombre || 'Compañero'}</Text>
                  {!!onVerPerfil && <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </GlassCard>

      {/* ── Mi calendario ── */}
      <Text style={s.sectionTitle}>Mi calendario</Text>
      {contrato.horario && fechaInicioISO ? (
        <CalendarioEventos
          uid={uid}
          rol="estudiante"
          inscripcion={{ horario: contrato.horario, fechaPresentacion: fechaInicioISO, fechaFin: ventanaCalendario }}
        />
      ) : (
        <GlassCard style={{ marginBottom: 18 }} contentStyle={{ padding: 16 }}>
          <Text style={s.datoValorSuelto}>
            {horario ? horario : 'Este puesto no tiene un horario laboral declarado.'}
          </Text>
        </GlassCard>
      )}
      {!!horario && (
        <View style={s.horarioPill}>
          <Ionicons name="time-outline" size={14} color={colors.primaryLight} />
          <Text style={s.horarioPillTxt} noTranslate>{horario}</Text>
        </View>
      )}

      {/* ── Tareas ── */}
      <Text style={s.sectionTitle}>Tareas</Text>
      {tareasDelPuesto.length === 0 ? (
        <View style={s.vacio}>
          <Text style={s.vacioTxt}>La empresa aún no te asignó tareas.</Text>
        </View>
      ) : (
        <View style={{ gap: 8, marginBottom: 18 }}>
          {tareasDelPuesto.map((t) => {
            const hecha = t.estado === 'completada';
            return (
              <TouchableOpacity
                key={t.id}
                style={[s.tareaCard, hecha && s.tareaHecha]}
                activeOpacity={0.8}
                onPress={() => { void completarTarea(t.id, !hecha); }}
              >
                <Ionicons
                  name={hecha ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={hecha ? colors.success : colors.textMuted}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[s.tareaTitulo, hecha && s.tareaTituloHecha]} noTranslate>{t.titulo}</Text>
                  {!!t.detalle && <Text style={s.tareaDetalle} noTranslate>{t.detalle}</Text>}
                </View>
                <Text style={[s.tareaEstado, { color: hecha ? colors.success : colors.textMuted }]}>
                  {hecha ? 'Completada' : 'Marcar'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ── Renuncia ── */}
      <TouchableOpacity style={s.renunciaBtn} onPress={() => setRenunciaOpen(true)} activeOpacity={0.85}>
        <Ionicons name="exit-outline" size={16} color={colors.error} />
        <Text style={s.renunciaBtnTxt}>Renunciar al puesto</Text>
      </TouchableOpacity>

      <RenunciaModal
        visible={renunciaOpen}
        contrato={contrato}
        estudianteNombre={estudianteNombre}
        colors={colors}
        s={s}
        onClose={() => setRenunciaOpen(false)}
      />
    </>
  );
}

function Dato({
  icono, label, valor, colors, s,
}: {
  icono: keyof typeof Ionicons.glyphMap;
  label: string;
  valor: string;
  colors: GradlyColors;
  s: ReturnType<typeof makeStyles>;
}) {
  return (
    <View>
      <View style={s.datoFila}>
        <Ionicons name={icono} size={16} color={colors.primaryLight} style={{ width: 22 }} />
        <Text style={s.datoLabel}>{label}</Text>
      </View>
      <Text style={s.datoValor} noTranslate>{valor || '—'}</Text>
    </View>
  );
}

function RenunciaModal({
  visible, contrato, estudianteNombre, colors, s, onClose,
}: {
  visible: boolean;
  contrato: ContratoLaboral;
  estudianteNombre: string;
  colors: GradlyColors;
  s: ReturnType<typeof makeStyles>;
  onClose: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [accion, setAccion] = useState<null | 'avisar' | 'renunciar'>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (visible) { setMotivo(''); setAccion(null); setErr(''); }
  }, [visible]);

  const correr = async (tipo: 'avisar' | 'renunciar') => {
    if (motivo.trim().length < 5) { setErr('Escribe el motivo (mín. 5 caracteres).'); return; }
    setAccion(tipo);
    setErr('');
    try {
      if (tipo === 'avisar') {
        await avisarEmpresaContrato({
          contratoId: contrato.id,
          empresaId: contrato.empresaId,
          estudianteNombre,
          vacanteTitulo: contrato.vacanteTitulo,
          texto: motivo,
        });
      } else {
        await renunciarPuesto({
          contratoId: contrato.id,
          empresaId: contrato.empresaId,
          estudianteNombre,
          vacanteTitulo: contrato.vacanteTitulo,
          motivo,
        });
      }
      onClose();
    } catch (e: any) {
      setErr(e?.message || 'No se pudo completar la acción.');
      setAccion(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={s.modalCard}>
          <Text style={s.modalTitulo}>Renunciar al puesto</Text>
          <Text style={s.modalTexto}>
            Escribe el motivo. Puedes enviarlo solo como aviso a la empresa, o renunciar definitivamente (el contrato se anula y no se reabre).
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
          {!!err && <Text style={s.modalError}>{err}</Text>}
          <View style={{ gap: 8 }}>
            <TouchableOpacity
              style={[s.modalConfirmar, { backgroundColor: colors.warning }]}
              onPress={() => correr('avisar')}
              disabled={!!accion}
            >
              {accion === 'avisar' ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.modalConfirmarTxt}>Enviar solo como aviso a la empresa</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.modalConfirmar, { backgroundColor: colors.error }]}
              onPress={() => correr('renunciar')}
              disabled={!!accion}
            >
              {accion === 'renunciar' ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.modalConfirmarTxt}>Renunciar definitivamente</Text>}
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

const makeStyles = (c: GradlyColors) =>
  StyleSheet.create({
    sectionTitle: {
      fontSize: 15,
      fontFamily: FONTS.soraBold,
      color: c.textPrimary,
      marginBottom: 10,
      marginTop: 4,
    },
    vacio: { alignItems: 'center', gap: 12, paddingVertical: 34, marginBottom: 12 },
    vacioTxt: { fontSize: 13, color: c.textMuted, textAlign: 'center', lineHeight: 19, paddingHorizontal: 20 },

    datoFila: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    datoLabel: { fontSize: 11.5, fontFamily: FONTS.interSemiBold, color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
    datoValor: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: c.textPrimary, marginTop: 3, marginLeft: 28 },
    datoValorSuelto: { fontSize: 13, color: c.textSecondary, marginLeft: 28, marginTop: 3, lineHeight: 18 },

    companeroRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 20,
      backgroundColor: c.backgroundSurface, borderWidth: 1, borderColor: c.border,
      borderRadius: 10, padding: 8,
    },
    companeroAvatar: {
      width: 26, height: 26, borderRadius: 13,
      backgroundColor: c.primary + '22', alignItems: 'center', justifyContent: 'center',
    },
    companeroTxt: { flex: 1, fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: c.primaryLight },

    horarioPill: {
      flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
      backgroundColor: c.primary + '14', borderWidth: 1, borderColor: c.primary + '33',
      borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7,
      marginTop: -6, marginBottom: 18,
    },
    horarioPillTxt: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: c.primaryLight },

    tareaCard: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: c.backgroundCard, borderWidth: 1, borderColor: c.border,
      borderRadius: 12, padding: 12,
    },
    tareaHecha: { borderColor: c.success + '55', backgroundColor: c.success + '0E' },
    tareaTitulo: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: c.textPrimary },
    tareaTituloHecha: { textDecorationLine: 'line-through', color: c.textMuted },
    tareaDetalle: { fontSize: 11.5, color: c.textMuted, marginTop: 2, lineHeight: 16 },
    tareaEstado: { fontSize: 11, fontFamily: FONTS.interSemiBold },

    renunciaBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      borderWidth: 1, borderColor: c.error + '66', backgroundColor: c.error + '10',
      borderRadius: 14, paddingVertical: 13, marginBottom: 24,
    },
    renunciaBtnTxt: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: c.error },

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
    modalError: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: c.error },
    modalConfirmar: { alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12 },
    modalConfirmarTxt: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: '#fff' },
    modalCancelar: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: c.border },
    modalCancelarTxt: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: c.textMuted },
  });
