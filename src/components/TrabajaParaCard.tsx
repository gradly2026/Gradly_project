/**
 * TrabajaParaCard — en la vista de perfil de un estudiante, si el que mira es
 * la EMPRESA que lo tiene contratado, muestra un cuadro "Trabaja para nosotros"
 * con el puesto y la fecha de inicio, y un botón "Añadir tarea" que le asigna
 * una tarea al contratado (colección `tareas_laborales`, vía asignarTarea).
 *
 * Solo consulta `contratos_laborales where empresaId == viewerUserId` (rama de
 * la regla de seguridad), así que la tarjeta aparece únicamente para el
 * empleador. Para otros roles (universidad, otra empresa) las reglas no dejan
 * leer el contrato y la tarjeta simplemente no se dibuja.
 */
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text, AutoTextInput as TextInput } from './AutoText';
import { db } from '../config/firebaseConfig';
import { COL_CONTRATOS, asignarTarea, type ContratoLaboral } from '../services/contratoService';

interface Palette {
  card: string; border: string; text: string; textSub: string;
  muted: string; purple: string; purpleDim: string; green: string; greenBg: string;
  bg?: string;
}

function fechaLegible(v: any): string {
  const d: Date | null =
    typeof v?.toDate === 'function' ? v.toDate()
    : v instanceof Date ? v
    : typeof v?.seconds === 'number' ? new Date(v.seconds * 1000)
    : null;
  if (!d) return '';
  return d.toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function TrabajaParaCard({
  estudianteId, viewerUserId, C,
}: {
  estudianteId: string;
  viewerUserId: string;
  C: Palette;
}) {
  const [contrato, setContrato] = useState<ContratoLaboral | null>(null);
  const [tareaOpen, setTareaOpen] = useState(false);

  useEffect(() => {
    if (!estudianteId || !viewerUserId) return;
    const unsub = onSnapshot(
      query(collection(db, COL_CONTRATOS), where('empresaId', '==', viewerUserId)),
      (snap) => {
        const activo = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) } as ContratoLaboral))
          .find((c) => c.estudianteId === estudianteId && c.estado === 'activo');
        setContrato(activo ?? null);
      },
      (e) => console.warn('TrabajaParaCard:', e),
    );
    return unsub;
  }, [estudianteId, viewerUserId]);

  if (!contrato) return null;

  return (
    <>
      <View style={[styles.card, { backgroundColor: C.greenBg, borderColor: C.green + '55' }]}>
        <View style={styles.row}>
          <Ionicons name="briefcase" size={16} color={C.green} />
          <Text style={[styles.titulo, { color: C.green }]}>Trabaja para tu empresa</Text>
        </View>
        <Text style={[styles.linea, { color: C.text }]} noTranslate>{contrato.vacanteTitulo}</Text>
        {!!fechaLegible(contrato.fechaInicio) && (
          <Text style={[styles.sub, { color: C.textSub }]}>
            Desde <Text style={[styles.sub, { color: C.textSub }]} noTranslate>{fechaLegible(contrato.fechaInicio)}</Text>
          </Text>
        )}
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: C.purple }]}
          onPress={() => setTareaOpen(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={15} color="#fff" />
          <Text style={styles.btnTxt}>Añadir tarea</Text>
        </TouchableOpacity>
      </View>

      <AñadirTareaModal
        visible={tareaOpen}
        contrato={contrato}
        C={C}
        onClose={() => setTareaOpen(false)}
      />
    </>
  );
}

function AñadirTareaModal({
  visible, contrato, C, onClose,
}: {
  visible: boolean;
  contrato: ContratoLaboral;
  C: Palette;
  onClose: () => void;
}) {
  const [titulo, setTitulo] = useState('');
  const [detalle, setDetalle] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (visible) { setTitulo(''); setDetalle(''); setErr(''); setOk(false); setEnviando(false); }
  }, [visible]);

  const enviar = async () => {
    if (!titulo.trim()) { setErr('La tarea necesita un título.'); return; }
    setEnviando(true); setErr('');
    try {
      await asignarTarea({
        vacanteId: contrato.vacanteId,
        vacanteTitulo: contrato.vacanteTitulo,
        empresaId: contrato.empresaId,
        empresaNombre: contrato.empresaNombre,
        titulo,
        detalle,
        estudianteIds: [contrato.estudianteId],
      });
      setOk(true);
    } catch (e: any) {
      setErr(e?.message || 'No se pudo asignar la tarea.');
    } finally {
      setEnviando(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { backgroundColor: C.bg ?? '#0d0b1e', borderColor: C.border }]}>
          <Text style={[styles.modalTitulo, { color: C.text }]}>Añadir tarea</Text>
          <Text style={[styles.modalSub, { color: C.textSub }]} noTranslate>{contrato.estudianteNombre} · {contrato.vacanteTitulo}</Text>

          {ok ? (
            <View style={{ alignItems: 'center', gap: 10, paddingVertical: 12 }}>
              <Ionicons name="checkmark-circle" size={40} color={C.green} />
              <Text style={[styles.modalSub, { color: C.textSub, textAlign: 'center' }]}>
                Tarea asignada. El empleado la verá en "Mi Progreso" y podrá marcarla completada.
              </Text>
              <TouchableOpacity style={[styles.btn, { backgroundColor: C.purple, alignSelf: 'stretch' }]} onPress={onClose}>
                <Text style={styles.btnTxt}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TextInput
                style={[styles.input, { borderColor: C.border, color: C.text }, { minHeight: 44 }]}
                value={titulo}
                onChangeText={setTitulo}
                placeholder="Título de la tarea"
                placeholderTextColor={C.muted}
              />
              <TextInput
                style={[styles.input, { borderColor: C.border, color: C.text }]}
                value={detalle}
                onChangeText={setDetalle}
                placeholder="Detalle (opcional)"
                placeholderTextColor={C.muted}
                multiline
                maxLength={600}
              />
              {!!err && <Text style={[styles.err, { color: '#ef4444' }]}>{err}</Text>}
              <View style={styles.modalBotones}>
                <TouchableOpacity style={[styles.btnGhost, { borderColor: C.border }]} onPress={onClose} disabled={enviando}>
                  <Text style={[styles.btnGhostTxt, { color: C.muted }]}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, { backgroundColor: C.purple, flex: 1.3 }]} onPress={enviar} disabled={enviando}>
                  {enviando ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.btnTxt}>Asignar</Text>}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  titulo: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  linea: { fontSize: 14, fontWeight: '700' },
  sub: { fontSize: 12 },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, borderRadius: 12, marginTop: 6,
  },
  btnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },

  overlay: { flex: 1, backgroundColor: 'rgba(7,5,15,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 400, borderRadius: 20, padding: 20, gap: 10, borderWidth: 1 },
  modalTitulo: { fontSize: 17, fontWeight: '800' },
  modalSub: { fontSize: 12.5, lineHeight: 18 },
  input: {
    minHeight: 80, borderRadius: 12, borderWidth: 1, padding: 12, textAlignVertical: 'top',
    fontSize: 13,
  },
  err: { fontSize: 12, fontWeight: '700' },
  modalBotones: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btnGhost: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  btnGhostTxt: { fontSize: 13, fontWeight: '700' },
});
