// ════════════════════════════════════════════════════════════════════════
// BandejaIncidencias.tsx — la MISMA bandeja para los tres roles.
//
// GUÍA PARA PRINCIPIANTES:
// Estudiante, empresa y universidad ven la misma lista de incidencias, con las
// mismas tarjetas y el mismo hilo de conversación. Lo único que cambia entre
// ellos es QUÉ PUEDEN HACER:
//
//   · estudiante  → abre incidencias y escribe en el hilo. No mueve el estado.
//   · empresa     → responde y mueve el estado (atender / resolver).
//   · universidad → lo mismo que la empresa, y además puede ESCALAR al admin.
//
// Por eso es un solo componente con una prop `rol` y no tres pantallas
// parecidas: tres copias del mismo hilo se habrían desincronizado a la primera
// corrección. Las reglas de Firestore imponen lo mismo del lado del servidor
// (ver firestore.rules → match /incidencias), así que ocultar un botón aquí es
// comodidad de interfaz, no el candado de seguridad.
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text, AutoTextInput as TextInput } from './AutoText';
import { GlassCard } from '../../components/ui/liquid-glass/GlassCard';
import { useTranslation } from '../context/TranslationContext';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import {
  cambiarEstadoIncidencia,
  escalarIncidencia,
  responderIncidencia,
  suscribirIncidencias,
  type EstadoIncidencia,
  type Incidencia,
} from '../services/incidenciaService';

type RolBandeja = 'estudiante' | 'universidad' | 'empresa';

/**
 * Color e ícono por estado.
 *
 * El `default` NO sobra aunque TypeScript considere el switch exhaustivo: el
 * tipo `EstadoIncidencia` es una promesa del código, no de la base de datos.
 * Un documento con un estado inesperado (una migración a medias, una escritura
 * manual desde la consola de Firebase) devolvería `undefined` aquí y la
 * pantalla reventaría al leer `.icon`. Se degrada a "abierta".
 */
function metaEstado(estado: EstadoIncidencia, c: GradlyColors) {
  switch (estado) {
    case 'en_seguimiento': return { color: c.primaryLight, icon: 'sync-outline' as const, clave: 'inc_estado_seguimiento' };
    case 'escalada':       return { color: c.error, icon: 'arrow-up-circle-outline' as const, clave: 'inc_estado_escalada' };
    case 'resuelta':       return { color: c.success, icon: 'checkmark-circle-outline' as const, clave: 'inc_estado_resuelta' };
    case 'abierta':
    default:               return { color: c.warning, icon: 'alert-circle-outline' as const, clave: 'inc_estado_abierta' };
  }
}

function fechaCorta(ts: any, locale: string): string {
  const d: Date | null = ts?.toDate ? ts.toDate() : null;
  if (!d) return '';
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

export default function BandejaIncidencias({
  rol,
  uid,
  nombreUsuario,
}: {
  rol: RolBandeja;
  uid: string;
  /** Nombre con el que firmará sus respuestas en el hilo. */
  nombreUsuario: string;
}) {
  const { colors } = useTheme();
  const { t, language } = useTranslation();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const locale = language === 'en' ? 'en-US' : 'es-SV';

  const [lista, setLista] = useState<Incidencia[]>([]);
  const [cargado, setCargado] = useState(false);
  const [abierta, setAbierta] = useState<Incidencia | null>(null);

  useEffect(() => {
    if (!uid) { setLista([]); setCargado(true); return; }
    return suscribirIncidencias(
      rol,
      uid,
      l => { setLista(l); setCargado(true); },
      () => { setLista([]); setCargado(true); },
    );
  }, [rol, uid]);

  // La incidencia abierta en el detalle se re-lee de la lista EN VIVO en vez de
  // guardarse en el estado: si la otra parte responde mientras el modal está
  // abierto, el hilo se actualiza solo. Guardar una copia lo habría congelado.
  const detalle = abierta ? lista.find(i => i.id === abierta.id) ?? abierta : null;

  if (!cargado) {
    return <View style={s.loader}><ActivityIndicator color={colors.primary} /></View>;
  }

  if (lista.length === 0) {
    return (
      <View style={s.vacio}>
        <Ionicons name="shield-checkmark-outline" size={38} color={colors.border} />
        <Text style={s.vacioTxt}>
          {rol === 'estudiante' ? t('inc_vacio_estudiante') : t('inc_vacio_receptor')}
        </Text>
      </View>
    );
  }

  return (
    <>
      <View style={{ gap: 10 }}>
        {lista.map(inc => {
          const m = metaEstado(inc.estado, colors);
          return (
            <TouchableOpacity key={inc.id} activeOpacity={0.85} onPress={() => setAbierta(inc)}>
              <GlassCard contentStyle={{ padding: 14, gap: 8 }}>
                <View style={s.filaTop}>
                  <Ionicons name={m.icon} size={16} color={m.color} />
                  <Text style={s.motivo} numberOfLines={1}>{inc.motivo}</Text>
                  <Text style={s.fecha} noTranslate>{fechaCorta(inc.fecha, locale)}</Text>
                </View>

                <Text style={s.descripcion} numberOfLines={2}>{inc.descripcion}</Text>

                <View style={s.filaBottom}>
                  <View style={[s.pill, { borderColor: m.color }]}>
                    <Text style={[s.pillTxt, { color: m.color }]}>{t(m.clave)}</Text>
                  </View>
                  {/* Para empresa/universidad importa DE QUIÉN es; para el
                      estudiante, sobre quién es. Cada rol ve lo que le falta. */}
                  <Text style={s.contraparte} numberOfLines={1} noTranslate>
                    {rol === 'estudiante' ? inc.empresa_nombre : inc.estudiante_nombre}
                  </Text>
                  {/* `?? []` en todos los accesos a `seguimiento`: el campo
                      nace como array vacío, pero basta un documento escrito a
                      mano sin él para que `.length` tire la pantalla entera. */}
                  {(inc.seguimiento?.length ?? 0) > 0 && (
                    <View style={s.hiloChip}>
                      <Ionicons name="chatbubble-outline" size={11} color={colors.textMuted} />
                      <Text style={s.hiloTxt} noTranslate>{String(inc.seguimiento.length)}</Text>
                    </View>
                  )}
                </View>
              </GlassCard>
            </TouchableOpacity>
          );
        })}
      </View>

      <DetalleIncidencia
        incidencia={detalle}
        rol={rol}
        nombreUsuario={nombreUsuario}
        onClose={() => setAbierta(null)}
      />
    </>
  );
}

// ─────────────────────────────────────────────
// DETALLE + HILO
// ─────────────────────────────────────────────
function DetalleIncidencia({
  incidencia, rol, nombreUsuario, onClose,
}: {
  incidencia: Incidencia | null;
  rol: RolBandeja;
  nombreUsuario: string;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { t, language } = useTranslation();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const locale = language === 'en' ? 'en-US' : 'es-SV';

  const [respuesta, setRespuesta] = useState('');
  const [resolucion, setResolucion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [pidiendoCierre, setPidiendoCierre] = useState(false);

  // Al cambiar de incidencia se limpian los borradores: sin esto, el texto que
  // alguien escribió para un caso reaparecería dentro de otro.
  useEffect(() => {
    setRespuesta(''); setResolucion(''); setError(''); setPidiendoCierre(false);
  }, [incidencia?.id]);

  if (!incidencia) return null;

  const puedeGestionar = rol === 'universidad' || rol === 'empresa';
  const puedeEscalar = rol === 'universidad' && incidencia.estado !== 'escalada';
  const cerrada = incidencia.estado === 'resuelta';
  const m = metaEstado(incidencia.estado, colors);

  const correr = async (fn: () => Promise<void>) => {
    setEnviando(true); setError('');
    try { await fn(); } catch (e: any) { setError(e?.message ?? t('error_generico')); }
    finally { setEnviando(false); }
  };

  return (
    // animationType="none": dos Modal nativos encadenados con animación pueden
    // quedarse invisibles o fuera de pantalla en iOS — misma decisión que el
    // resto de modales del proyecto.
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.hoja}>
          <View style={s.hojaHeader}>
            <Ionicons name={m.icon} size={18} color={m.color} />
            <Text style={s.hojaTitulo} numberOfLines={2}>{incidencia.motivo}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            <View style={[s.pill, { borderColor: m.color, alignSelf: 'flex-start' }]}>
              <Text style={[s.pillTxt, { color: m.color }]}>{t(m.clave)}</Text>
            </View>

            <View style={{ gap: 4 }}>
              <Text style={s.bloqueLabel}>{t('inc_reportada_por')}</Text>
              <Text style={s.bloqueValor} noTranslate>{incidencia.estudiante_nombre}</Text>
            </View>

            {!!incidencia.empresa_nombre && (
              <View style={{ gap: 4 }}>
                <Text style={s.bloqueLabel}>{t('inc_empresa')}</Text>
                <Text style={s.bloqueValor} noTranslate>{incidencia.empresa_nombre}</Text>
              </View>
            )}

            <View style={{ gap: 4 }}>
              <Text style={s.bloqueLabel}>{t('inc_descripcion')}</Text>
              <Text style={s.bloqueTexto}>{incidencia.descripcion}</Text>
            </View>

            {/* Hilo */}
            {(incidencia.seguimiento?.length ?? 0) > 0 && (
              <View style={{ gap: 8 }}>
                <Text style={s.bloqueLabel}>{t('inc_seguimiento')}</Text>
                {incidencia.seguimiento.map((r, i) => (
                  <View key={`${r.autor_id}-${i}`} style={s.mensaje}>
                    <View style={s.mensajeTop}>
                      <Text style={s.mensajeAutor} noTranslate>{r.autor_nombre}</Text>
                      <Text style={s.mensajeFecha} noTranslate>{fechaCorta(r.fecha, locale)}</Text>
                    </View>
                    <Text style={s.mensajeTxt}>{r.texto}</Text>
                  </View>
                ))}
              </View>
            )}

            {!!incidencia.resolucion && (
              <View style={s.resolucionBox}>
                <Text style={s.bloqueLabel}>{t('inc_resolucion')}</Text>
                <Text style={s.bloqueTexto}>{incidencia.resolucion}</Text>
              </View>
            )}

            {!!error && <Text style={s.error}>{error}</Text>}

            {/* Responder: cualquiera de las partes, mientras no esté cerrada. */}
            {!cerrada && (
              <View style={{ gap: 8 }}>
                <TextInput
                  style={s.input}
                  value={respuesta}
                  onChangeText={setRespuesta}
                  placeholder={t('inc_responder_placeholder')}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  selectionColor={colors.primary}
                />
                <TouchableOpacity
                  style={[s.btn, (!respuesta.trim() || enviando) && s.btnOff]}
                  disabled={!respuesta.trim() || enviando}
                  onPress={() => correr(async () => {
                    await responderIncidencia(incidencia.id, respuesta, { nombre: nombreUsuario, rol });
                    setRespuesta('');
                  })}
                >
                  {enviando
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <Text style={s.btnTxt}>{t('inc_responder')}</Text>}
                </TouchableOpacity>
              </View>
            )}

            {/* Gestión: solo quien debe responder por el problema. */}
            {puedeGestionar && !cerrada && (
              <View style={s.acciones}>
                {incidencia.estado === 'abierta' && (
                  <TouchableOpacity
                    style={s.btnSec}
                    disabled={enviando}
                    onPress={() => correr(() => cambiarEstadoIncidencia(incidencia.id, 'en_seguimiento', {
                      estudianteId: incidencia.estudiante_id, motivo: incidencia.motivo,
                    }))}
                  >
                    <Text style={s.btnSecTxt}>{t('inc_accion_atender')}</Text>
                  </TouchableOpacity>
                )}

                {puedeEscalar && (
                  <TouchableOpacity
                    style={s.btnSec}
                    disabled={enviando}
                    onPress={() => correr(() => escalarIncidencia(incidencia.id, incidencia))}
                  >
                    <Text style={s.btnSecTxt}>{t('inc_accion_escalar')}</Text>
                  </TouchableOpacity>
                )}

                {!pidiendoCierre ? (
                  <TouchableOpacity style={s.btnSec} onPress={() => setPidiendoCierre(true)}>
                    <Text style={s.btnSecTxt}>{t('inc_accion_resolver')}</Text>
                  </TouchableOpacity>
                ) : (
                  // La resolución es obligatoria: cerrar sin explicar deja al
                  // estudiante sin saber qué pasó con su problema.
                  <View style={{ width: '100%', gap: 8 }}>
                    <TextInput
                      style={s.input}
                      value={resolucion}
                      onChangeText={setResolucion}
                      placeholder={t('inc_resolucion_placeholder')}
                      placeholderTextColor={colors.textMuted}
                      multiline
                      selectionColor={colors.primary}
                    />
                    <TouchableOpacity
                      style={[s.btn, (!resolucion.trim() || enviando) && s.btnOff]}
                      disabled={!resolucion.trim() || enviando}
                      onPress={() => correr(async () => {
                        await cambiarEstadoIncidencia(incidencia.id, 'resuelta', {
                          resolucion,
                          estudianteId: incidencia.estudiante_id,
                          motivo: incidencia.motivo,
                        });
                        onClose();
                      })}
                    >
                      {enviando
                        ? <ActivityIndicator size="small" color="#FFF" />
                        : <Text style={s.btnTxt}>{t('inc_accion_confirmar_cierre')}</Text>}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (COLORS: GradlyColors) =>
  StyleSheet.create({
    loader: { paddingVertical: 24, alignItems: 'center' },
    vacio: { alignItems: 'center', paddingVertical: 26, gap: 8 },
    vacioTxt: { fontSize: 12.5, fontFamily: FONTS.interRegular, color: COLORS.textMuted, textAlign: 'center' },

    filaTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    motivo: { flex: 1, fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
    fecha: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
    descripcion: { fontSize: 12.5, fontFamily: FONTS.interRegular, color: COLORS.textMuted, lineHeight: 18 },
    filaBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    pill: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    pillTxt: { fontSize: 10.5, fontFamily: FONTS.interSemiBold },
    contraparte: { flex: 1, fontSize: 11.5, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
    hiloChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    hiloTxt: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: COLORS.textMuted },

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 18 },
    hoja: {
      maxHeight: '86%', maxWidth: 560, width: '100%', alignSelf: 'center',
      backgroundColor: COLORS.backgroundCard,
      borderRadius: 18, borderWidth: 1, borderColor: COLORS.border,
      overflow: 'hidden',
    },
    hojaHeader: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 16, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: COLORS.border,
    },
    hojaTitulo: { flex: 1, fontSize: 15, fontFamily: FONTS.soraSemiBold, color: COLORS.textPrimary },

    bloqueLabel: { fontSize: 11, fontFamily: FONTS.interSemiBold, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
    bloqueValor: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
    bloqueTexto: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textSecondary, lineHeight: 19 },

    mensaje: {
      backgroundColor: COLORS.backgroundSurface,
      borderRadius: 11, padding: 11, gap: 4,
    },
    mensajeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    mensajeAutor: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
    mensajeFecha: { fontSize: 10.5, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
    mensajeTxt: { fontSize: 12.5, fontFamily: FONTS.interRegular, color: COLORS.textSecondary, lineHeight: 18 },

    resolucionBox: {
      borderLeftWidth: 3, borderLeftColor: COLORS.success,
      paddingLeft: 11, gap: 4,
    },

    input: {
      borderWidth: 1, borderColor: COLORS.border, borderRadius: 11,
      paddingHorizontal: 12, paddingVertical: 10,
      minHeight: 76, textAlignVertical: 'top',
      fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textPrimary,
    },
    btn: {
      backgroundColor: COLORS.primary, borderRadius: 11,
      paddingVertical: 11, alignItems: 'center',
    },
    btnOff: { opacity: 0.45 },
    btnTxt: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: '#FFF' },
    acciones: {
      flexDirection: 'row', flexWrap: 'wrap', gap: 8,
      borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12,
    },
    btnSec: {
      borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
      paddingHorizontal: 13, paddingVertical: 9,
    },
    btnSecTxt: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },
    error: { fontSize: 12.5, fontFamily: FONTS.interRegular, color: COLORS.error },
  });
