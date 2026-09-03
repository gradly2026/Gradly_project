/**
 * OfertarEmpleoModal — la empresa elige una de sus vacantes abiertas y se la
 * OFRECE a un ex-pasante desde "Historial de Pasantes". Crea el documento en
 * `ofertas_empleo` (vía crearOfertaEmpleo) y notifica al estudiante.
 *
 * Las vacantes se ordenan poniendo primero las de área afín a la carrera del
 * estudiante, pero se puede elegir cualquiera.
 */
import { Ionicons } from '@expo/vector-icons';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import { db } from '../config/firebaseConfig';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { normalizarSkill } from '../utils/skills';
import { crearOfertaEmpleo } from '../services/contratoService';

interface VacanteMin {
  id: string;
  titulo: string;
  area: string;
  modalidad: string;
}

interface Props {
  visible: boolean;
  empresaId: string;
  empresaNombre: string;
  estudiante: { id: string | null; nombre: string; carrera?: string };
  onClose: () => void;
}

export default function OfertarEmpleoModal({ visible, empresaId, empresaNombre, estudiante, onClose }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [cargando, setCargando] = useState(true);
  const [vacantes, setVacantes] = useState<VacanteMin[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancel = false;
    setCargando(true); setSel(null); setErr(''); setOk(false); setEnviando(false);
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'vacantes'), where('empresa_id', '==', empresaId)));
        if (cancel) return;
        const carreraN = normalizarSkill(estudiante.carrera ?? '');
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((v) => v.categoria === 'vacante' && !v.cerrada && v.activa !== false && v.estado_moderacion !== 'eliminada')
          .map((v) => ({ id: v.id, titulo: v.titulo || 'Vacante', area: v.area || '', modalidad: v.modalidad || '' }))
          .sort((a, b) => {
            // Área afín a la carrera primero, luego alfabético.
            const af = (x: VacanteMin) => (carreraN && normalizarSkill(x.area).includes(carreraN.slice(0, 6)) ? 0 : 1);
            return af(a) - af(b) || a.titulo.localeCompare(b.titulo);
          });
        setVacantes(list);
      } catch (e) {
        console.warn('[OfertarEmpleo] vacantes', e);
        setVacantes([]);
      } finally {
        if (!cancel) setCargando(false);
      }
    })();
    return () => { cancel = true; };
  }, [visible, empresaId, estudiante.carrera]);

  if (!visible) return null;

  const enviar = async () => {
    if (!sel) { setErr('Elige una vacante.'); return; }
    if (!estudiante.id) { setErr('No se pudo identificar al estudiante.'); return; }
    const v = vacantes.find((x) => x.id === sel);
    if (!v) return;
    setEnviando(true); setErr('');
    try {
      await crearOfertaEmpleo({
        empresaId,
        empresaNombre,
        estudianteId: estudiante.id,
        estudianteNombre: estudiante.nombre,
        vacanteId: v.id,
        vacanteTitulo: v.titulo,
        area: v.area,
      });
      setOk(true);
    } catch (e: any) {
      setErr(e?.message || 'No se pudo enviar la oferta.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.headerRow}>
            <Text style={s.titulo}>Ofertar empleo</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}><Ionicons name="close" size={20} color={colors.textMuted} /></TouchableOpacity>
          </View>
          <Text style={s.sub} noTranslate>{estudiante.nombre}</Text>

          {ok ? (
            <View style={s.okBox}>
              <Ionicons name="checkmark-circle" size={44} color={colors.success} />
              <Text style={s.okTxt}>Oferta enviada. El estudiante la verá en sus notificaciones y podrá aceptarla o rechazarla.</Text>
              <TouchableOpacity style={[s.btn, { backgroundColor: colors.primary }]} onPress={onClose}>
                <Text style={s.btnTxt}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          ) : cargando ? (
            <View style={{ paddingVertical: 30, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : vacantes.length === 0 ? (
            <Text style={s.vacio}>No tienes vacantes de empleo abiertas para ofrecer.</Text>
          ) : (
            <>
              <Text style={s.label}>Elige la vacante a ofrecer</Text>
              <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
                <View style={{ gap: 8 }}>
                  {vacantes.map((v) => {
                    const activo = sel === v.id;
                    return (
                      <TouchableOpacity
                        key={v.id}
                        style={[s.opcion, activo && s.opcionActiva]}
                        onPress={() => { setSel(v.id); setErr(''); }}
                        activeOpacity={0.85}
                      >
                        <Ionicons
                          name={activo ? 'radio-button-on' : 'radio-button-off'}
                          size={18}
                          color={activo ? colors.primary : colors.textMuted}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={s.opcionTitulo} numberOfLines={1} noTranslate>{v.titulo}</Text>
                          {!!(v.area || v.modalidad) && (
                            <Text style={s.opcionMeta} numberOfLines={1} noTranslate>
                              {[v.area, v.modalidad].filter(Boolean).join(' · ')}
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
              {!!err && <Text style={s.err}>{err}</Text>}
              <View style={s.botones}>
                <TouchableOpacity style={s.btnGhost} onPress={onClose} disabled={enviando}>
                  <Text style={s.btnGhostTxt}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, { backgroundColor: colors.primary }]} onPress={enviar} disabled={enviando}>
                  {enviando ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.btnTxt}>Enviar oferta</Text>}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: GradlyColors) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(7,5,15,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: {
    width: '100%', maxWidth: 420, borderRadius: 20, padding: 20, gap: 10,
    backgroundColor: c.backgroundCard, borderWidth: 1, borderColor: c.border,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titulo: { fontSize: 17, fontFamily: FONTS.soraBold, color: c.textPrimary },
  sub: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: c.primaryLight },
  label: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 4 },
  vacio: { fontSize: 13, color: c.textMuted, fontStyle: 'italic', paddingVertical: 20, textAlign: 'center' },
  opcion: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 12,
    borderWidth: 1, borderColor: c.border, backgroundColor: c.backgroundSurface,
  },
  opcionActiva: { borderColor: c.primary, backgroundColor: c.primary + '12' },
  opcionTitulo: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: c.textPrimary },
  opcionMeta: { fontSize: 11.5, color: c.textMuted, marginTop: 1 },
  err: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: c.error },
  botones: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btnGhost: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: c.border },
  btnGhostTxt: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: c.textMuted },
  btn: { flex: 1.3, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12 },
  btnTxt: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: '#fff' },
  okBox: { alignItems: 'center', gap: 12, paddingVertical: 14 },
  okTxt: { fontSize: 13, color: c.textSecondary, textAlign: 'center', lineHeight: 19 },
});
