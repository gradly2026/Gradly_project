import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, TouchableOpacity, View } from 'react-native';
import { GlassCard } from '../../components/ui/liquid-glass/GlassCard';
import { db } from '../config/firebaseConfig';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import {
  suscribirComprobantesDeRol,
  validarComprobante,
  type Comprobante,
} from '../services/comprobanteService';
import { COLECCION_ASIGNACIONES, type AsignacionCupo } from '../services/reclamoCuposService';
import { abrirConstancia, constanciaHtml } from '../utils/constanciaHtml';
import { showAlert, showConfirm } from './AppAlert';
import { AutoText as Text } from './AutoText';
import ComprobanteEmpresaModal from './ComprobanteEmpresaModal';

type Rol = 'estudiante' | 'universidad' | 'empresa';

interface Fila {
  id: string;
  asignacion: AsignacionCupo | null;
  comp: Comprobante | null;
}

/**
 * Tarjeta del Inicio que sigue el ciclo del comprobante de finalización de las
 * pasantías por cupo YA culminadas del usuario. Estados por fila:
 *   (sin comprobante) → esperando que la empresa lo envíe
 *   'enviado'         → la universidad debe validarlo (ve el botón "Validar")
 *   'validado'        → la fila desaparece; si no quedan filas, la tarjeta se
 *                       oculta por completo.
 */
export default function ComprobantePasantiaCard({ rol, uid }: { rol: Rol; uid: string }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [culminadas, setCulminadas] = useState<AsignacionCupo[]>([]);
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
  const [validando, setValidando] = useState<string | null>(null);
  const [enviarPara, setEnviarPara] = useState<AsignacionCupo | null>(null);

  const campo =
    rol === 'estudiante' ? 'estudianteId'
    : rol === 'universidad' ? 'universidadId'
    : 'empresaId';

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      query(collection(db, COLECCION_ASIGNACIONES), where(campo, '==', uid)),
      snap =>
        setCulminadas(
          snap.docs
            .map(d => ({ id: d.id, ...d.data() } as AsignacionCupo))
            .filter(a => a.finalizada === true && a.estado !== 'cancelado'),
        ),
      e => console.warn('Error en listener (comprobante card / asignaciones):', e),
    );
    return unsub;
  }, [campo, uid]);

  useEffect(() => {
    if (!uid) return;
    return suscribirComprobantesDeRol(rol, uid, setComprobantes);
  }, [rol, uid]);

  const filas: Fila[] = useMemo(() => {
    const compPorId: Record<string, Comprobante> = {};
    comprobantes.forEach(c => { compPorId[c.id] = c; });
    const ids = new Set<string>();
    culminadas.forEach(a => ids.add(a.id));
    comprobantes.forEach(c => { if (c.estado !== 'validado') ids.add(c.id); });
    return Array.from(ids)
      .map(id => ({
        id,
        asignacion: culminadas.find(a => a.id === id) ?? null,
        comp: compPorId[id] ?? null,
      }))
      .filter(f => f.comp?.estado !== 'validado' && (f.asignacion || f.comp));
  }, [culminadas, comprobantes]);

  if (filas.length === 0) return null;

  const nombreEstudiante = (f: Fila) =>
    f.comp?.estudianteNombre || f.asignacion?.estudianteNombre || 'Estudiante';
  const nombreEmpresa = (f: Fila) =>
    f.comp?.empresaNombre || f.asignacion?.empresaNombre || 'Empresa';

  const verDocumento = async (comp: Comprobante) => {
    try {
      if (comp.origen === 'pdf' && comp.archivoUrl) {
        await Linking.openURL(comp.archivoUrl);
      } else {
        await abrirConstancia(
          constanciaHtml(comp, {
            area: comp.area,
            supervisor: comp.supervisor,
            nota: comp.notaEmpresa,
            fechaEmisionISO: comp.fechaEmision,
          }),
        );
      }
    } catch (e: any) {
      showAlert('No se pudo abrir el documento', e?.message ?? 'Inténtalo de nuevo.');
    }
  };

  const validar = async (f: Fila) => {
    if (!f.comp || validando) return;
    const ok = await showConfirm({
      title: 'Validar comprobante',
      message: `Vas a validar el comprobante de ${nombreEstudiante(f)}. Se acreditarán sus horas de práctica y el proceso quedará 100% culminado.`,
    });
    if (!ok) return;
    setValidando(f.id);
    try {
      await validarComprobante(f.id);
      showAlert('Pasantía validada', 'Se acreditaron las horas y el proceso quedó culminado.');
    } catch (e: any) {
      showAlert('No se pudo validar', e?.message ?? 'Inténtalo de nuevo.');
    } finally {
      setValidando(null);
    }
  };

  return (
    <>
      <GlassCard style={{ marginBottom: 16 }} contentStyle={{ padding: 16, gap: 12 }}>
        <View style={s.header}>
          <Ionicons name="ribbon-outline" size={18} color={colors.primaryLight} />
          <Text style={s.title}>Comprobante de finalización</Text>
        </View>

        {filas.map(f => {
          const enviado = f.comp?.estado === 'enviado';
          return (
            <View key={f.id} style={s.fila}>
              <Ionicons
                name={enviado ? 'document-attach-outline' : 'time-outline'}
                size={18}
                color={enviado ? colors.primaryLight : colors.textMuted}
                style={{ marginTop: 1 }}
              />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.filaTitulo} noTranslate>
                  {rol === 'empresa'
                    ? nombreEstudiante(f)
                    : rol === 'universidad'
                    ? `${nombreEstudiante(f)} · ${nombreEmpresa(f)}`
                    : nombreEmpresa(f)}
                </Text>
                <Text style={s.filaTexto}>
                  {rol === 'estudiante'
                    ? enviado
                      ? 'Tu comprobante fue enviado a tu universidad. Falta que lo valide.'
                      : 'Esperando que la empresa envíe tu comprobante de finalización.'
                    : rol === 'empresa'
                    ? enviado
                      ? 'Comprobante enviado. Esperando validación de la universidad.'
                      : 'Genera y envía el comprobante de finalización.'
                    : enviado
                    ? 'Comprobante recibido. Revísalo y valídalo.'
                    : 'Esperando el comprobante de la empresa.'}
                </Text>

                {/* Acciones por rol */}
                {rol === 'empresa' && f.asignacion ? (
                  <TouchableOpacity
                    style={s.btnLine}
                    onPress={() => setEnviarPara(f.asignacion)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={enviado ? 'create-outline' : 'send-outline'}
                      size={14}
                      color={colors.primaryLight}
                    />
                    <Text style={s.btnLineText}>
                      {enviado ? 'Corregir y reenviar' : 'Enviar comprobante'}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {rol === 'universidad' && enviado && f.comp ? (
                  <View style={s.uniBtns}>
                    <TouchableOpacity
                      style={s.btnLine}
                      onPress={() => verDocumento(f.comp!)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="eye-outline" size={14} color={colors.primaryLight} />
                      <Text style={s.btnLineText}>Ver documento</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.btnSolid, validando === f.id && { opacity: 0.6 }]}
                      onPress={() => validar(f)}
                      disabled={validando === f.id}
                      activeOpacity={0.85}
                    >
                      {validando === f.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle" size={14} color="#fff" />
                          <Text style={s.btnSolidText}>Validar</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </GlassCard>

      {enviarPara ? (
        <ComprobanteEmpresaModal
          asignacion={enviarPara}
          onListo={() => setEnviarPara(null)}
        />
      ) : null}
    </>
  );
}

const makeStyles = (COLORS: GradlyColors) =>
  StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { fontSize: 14, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
    fila: {
      flexDirection: 'row',
      gap: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: COLORS.border,
      paddingTop: 12,
    },
    filaTitulo: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
    filaTexto: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textSecondary, lineHeight: 17 },
    btnLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
    btnLineText: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },
    uniBtns: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 },
    btnSolid: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: COLORS.primary,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    btnSolidText: { color: '#fff', fontSize: 12.5, fontFamily: FONTS.interSemiBold },
  });
