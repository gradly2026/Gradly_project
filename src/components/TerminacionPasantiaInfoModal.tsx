import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import { db } from '../config/firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import type { AsignacionCupo } from '../services/reclamoCuposService';

interface Props {
  visible: boolean;
  /** Id de la `asignaciones_cupo` terminada anticipadamente. */
  asignacionId: string | null;
  onClose: () => void;
}

const LABEL_GRAVEDAD: Record<string, string> = { leve: 'Leve', moderada: 'Moderada', grave: 'Grave' };

/**
 * Modal informativo que se abre al tocar una notificación
 * `terminacionPasantia:{id}` (Fase 5 de "asistencia real"): una pasantía de
 * cupo que terminó ANTES de cumplir sus horas (despido o renuncia). Lo
 * pueden abrir las 3 partes — cada una ve el mismo detalle, con el saludo
 * adaptado a su rol.
 */
export default function TerminacionPasantiaInfoModal({ visible, asignacionId, onClose }: Props) {
  const { colors: C } = useTheme();
  const { rol } = useAuth();
  const s = useMemo(() => makeStyles(C), [C]);
  const [a, setA] = useState<AsignacionCupo | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!visible || !asignacionId) return;
    let vivo = true;
    setCargando(true);
    getDoc(doc(db, 'asignaciones_cupo', asignacionId))
      .then(snap => { if (vivo) { setA(snap.exists() ? ({ id: snap.id, ...snap.data() } as AsignacionCupo) : null); setCargando(false); } })
      .catch(() => { if (vivo) { setA(null); setCargando(false); } });
    return () => { vivo = false; };
  }, [visible, asignacionId]);

  if (!visible) return null;

  const esDespido = a?.finPor === 'empresa';
  const titulo = cargando
    ? 'Cargando…'
    : !a
      ? 'No se encontró esta pasantía'
      : esDespido
        ? 'Pasantía terminada por la empresa'
        : 'El estudiante renunció a la pasantía';

  const saludo =
    rol === 'estudiante'
      ? `${a?.empresaNombre || 'La empresa'} reportó el fin de tu pasantía en "${a?.vacanteTitulo || 'su vacante'}".`
      : rol === 'empresa'
        ? `Registraste el fin de la pasantía de ${a?.estudianteNombre || 'el estudiante'}.`
        : `${a?.estudianteNombre || 'Un estudiante'} dejó su pasantía en ${a?.empresaNombre || 'la empresa'} antes de cumplir sus horas.`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={[s.iconWrap, { backgroundColor: (esDespido ? C.error : C.warning) + '1f' }]}>
            <Ionicons
              name={esDespido ? 'close-circle' : 'exit-outline'}
              size={28}
              color={esDespido ? C.error : C.warning}
            />
          </View>
          <Text style={s.titulo}>{titulo}</Text>

          {!cargando && a && (
            <>
              <Text style={s.cuerpo}>{saludo}</Text>

              <View style={s.detalleBox}>
                <Text style={s.detalleLinea} noTranslate>
                  {(a.horasCumplidas ?? 0)} h acumuladas hasta ese momento
                </Text>
                {esDespido && a.gravedad && (
                  <Text style={[s.detalleLinea, { color: esDespido ? C.error : C.warning }]}>
                    Gravedad: {LABEL_GRAVEDAD[a.gravedad] ?? a.gravedad}
                  </Text>
                )}
                {!!a.motivoFin && (
                  <>
                    <Text style={s.motivoLabel}>Motivo</Text>
                    <Text style={s.motivoTxt} noTranslate>{a.motivoFin}</Text>
                  </>
                )}
              </View>

              {rol === 'universidad' && (
                <Text style={s.nota}>
                  Estas horas quedan registradas, pero no se acreditan solas a una pasantía nueva. Si el
                  estudiante se inscribe en otra pasantía, tú decides si continúa con ellas o empieza de cero.
                </Text>
              )}
            </>
          )}

          <TouchableOpacity style={s.btn} onPress={onClose} activeOpacity={0.85}>
            <Text style={s.btnText}>Entendido</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (C: GradlyColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1, backgroundColor: 'rgba(7,5,15,0.75)',
      justifyContent: 'center', alignItems: 'center', padding: 22,
    },
    card: {
      width: '100%', maxWidth: 400,
      backgroundColor: C.backgroundCard,
      borderRadius: 24, borderWidth: 1, borderColor: C.border,
      padding: 24, alignItems: 'center',
    },
    iconWrap: {
      width: 54, height: 54, borderRadius: 27,
      alignItems: 'center', justifyContent: 'center', marginBottom: 14,
    },
    titulo: { fontSize: 17, fontFamily: FONTS.soraBold, color: C.textPrimary, textAlign: 'center' },
    cuerpo: {
      fontSize: 13, fontFamily: FONTS.interRegular, color: C.textSecondary,
      textAlign: 'center', marginTop: 10, lineHeight: 19,
    },
    detalleBox: {
      width: '100%', marginTop: 16, backgroundColor: C.backgroundSurface,
      borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14, gap: 4,
    },
    detalleLinea: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: C.textPrimary },
    motivoLabel: {
      fontSize: 10, fontFamily: FONTS.interSemiBold, color: C.textMuted,
      textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 6,
    },
    motivoTxt: { fontSize: 12.5, fontFamily: FONTS.interRegular, color: C.textPrimary, lineHeight: 18 },
    nota: {
      fontSize: 11.5, fontFamily: FONTS.interRegular, color: C.textMuted,
      textAlign: 'center', marginTop: 12, lineHeight: 16, fontStyle: 'italic',
    },
    btn: {
      marginTop: 20, width: '100%', backgroundColor: C.primary,
      borderRadius: 14, paddingVertical: 13, alignItems: 'center',
    },
    btnText: { color: '#fff', fontFamily: FONTS.interSemiBold, fontSize: 14 },
  });
