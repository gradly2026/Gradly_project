/**
 * TrabajaParaCard — en la vista de perfil de un estudiante, si el que mira es
 * la EMPRESA que lo tiene contratado, muestra un cuadro "Trabaja para tu
 * empresa" con el puesto y la fecha de inicio.
 *
 * Solo consulta `contratos_laborales where empresaId == viewerUserId` (rama de
 * la regla de seguridad), así que la tarjeta aparece únicamente para el
 * empleador. Para otros roles (universidad, otra empresa) las reglas no dejan
 * leer el contrato y la tarjeta simplemente no se dibuja.
 */
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import { db } from '../config/firebaseConfig';
import { COL_CONTRATOS, type ContratoLaboral } from '../services/contratoService';

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
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  titulo: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  linea: { fontSize: 14, fontWeight: '700' },
  sub: { fontSize: 12 },
});
