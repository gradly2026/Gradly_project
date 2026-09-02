import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Print from 'expo-print';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { textoHorario } from '../data/disponibilidad';
import {
  construirDatosConstancia,
  enviarComprobante,
  subirComprobantePdf,
} from '../services/comprobanteService';
import type { AsignacionCupo } from '../services/reclamoCuposService';
import { progresoPorMeta } from '../utils/horasPasantia';
import { constanciaHtml, fmtFechaLarga } from '../utils/constanciaHtml';
import { showAlert } from './AppAlert';
import { AutoText as Text, AutoTextInput as TextInput } from './AutoText';

const C = {
  overlay: 'rgba(7,5,15,0.92)',
  surface: '#0d0b1e',
  card: 'rgba(255,255,255,0.04)',
  border: 'rgba(139,92,246,0.25)',
  text: '#f4f1ff',
  textSub: 'rgba(255,255,255,0.65)',
  muted: 'rgba(255,255,255,0.40)',
  accent: '#8b5cf6',
  green: '#34d399',
};

const toISO = (d: Date | null): string => (d ? d.toISOString().slice(0, 10) : '');

interface Props {
  asignacion: AsignacionCupo;
  /** Se llamó "Enviar" o "Enviar más tarde" → avanzar/cerrar. */
  onListo: () => void;
}

/**
 * Pantalla de la EMPRESA para generar y enviar el comprobante de finalización
 * de una pasantía por cupo. Muestra la constancia auto-generada con los datos
 * de la BD; la empresa puede descargarla como PDF, adjuntar su propia versión
 * en papel membretado, y enviarla a la universidad para que la valide.
 */
export default function ComprobanteEmpresaModal({ asignacion, onListo }: Props) {
  const prog = useMemo(
    () =>
      progresoPorMeta(
        asignacion.horario,
        asignacion.fechaPresentacion ?? '',
        asignacion.horasCumplidas ?? 0,
      ),
    [asignacion],
  );

  const datos = useMemo(() => {
    const horas = asignacion.horasCumplidas ?? prog.meta ?? 0;
    return construirDatosConstancia(asignacion, {
      fechaFin: toISO(prog.fechaFin),
      horasCumplidas: horas,
    });
  }, [asignacion, prog]);

  const [area, setArea] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [nota, setNota] = useState('');
  const [archivoUrl, setArchivoUrl] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const verPdf = async () => {
    try {
      await Print.printAsync({ html: constanciaHtml(datos, { area, supervisor }) });
    } catch (e: any) {
      showAlert('No se pudo generar el PDF', e?.message ?? 'Inténtalo de nuevo.');
    }
  };

  const adjuntar = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      setSubiendo(true);
      const url = await subirComprobantePdf(asignacion.id, res.assets[0].uri);
      setArchivoUrl(url);
    } catch (e: any) {
      showAlert('No se pudo adjuntar el archivo', e?.message ?? 'Inténtalo de nuevo.');
    } finally {
      setSubiendo(false);
    }
  };

  const enviar = async () => {
    if (enviando) return;
    setEnviando(true);
    try {
      await enviarComprobante(datos, {
        archivoUrl,
        notaEmpresa: nota,
        area,
        supervisor,
      });
      showAlert(
        'Comprobante enviado',
        'Tu universidad ya puede revisarlo y validarlo. Al validarlo, el proceso queda 100% culminado.',
      );
      onListo();
    } catch (e: any) {
      showAlert('No se pudo enviar', e?.message ?? 'Inténtalo de nuevo.');
      setEnviando(false);
    }
  };

  const horario = textoHorario(asignacion.horario) || '—';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onListo}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.headerBadge}>
            <Ionicons name="document-text" size={18} color={C.accent} />
            <Text style={styles.headerBadgeText}>Comprobante de finalización</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.titulo} noTranslate>
              {datos.estudianteNombre || 'Estudiante'}
            </Text>
            <Text style={styles.sub}>
              Revisa la constancia. Puedes enviarla tal cual o adjuntar tu propio PDF en papel
              membretado.
            </Text>

            {/* Vista previa de la constancia */}
            <View style={styles.preview}>
              <Text style={styles.pvBrand}>CONSTANCIA · GRADLY</Text>
              <Text style={styles.pvTitle}>Constancia de finalización de pasantía</Text>
              <Row k="Estudiante" v={datos.estudianteNombre || '—'} />
              {!!datos.carrera && <Row k="Carrera" v={datos.carrera} />}
              <Row k="Empresa" v={datos.empresaNombre || '—'} />
              {!!datos.vacanteTitulo && <Row k="Rol" v={datos.vacanteTitulo} />}
              <Row k="Período" v={`${fmtFechaLarga(datos.fechaInicio)} — ${fmtFechaLarga(datos.fechaFin)}`} />
              <Row k="Horas cumplidas" v={`${datos.horasCumplidas} h`} />
              <Row k="Horario" v={horario} />
            </View>

            {/* Campos opcionales */}
            <Text style={styles.label}>Área / departamento (opcional)</Text>
            <TextInput
              style={styles.input}
              value={area}
              onChangeText={setArea}
              placeholder="Ej. Desarrollo de software"
              placeholderTextColor={C.muted}
            />
            <Text style={styles.label}>Supervisor (opcional)</Text>
            <TextInput
              style={styles.input}
              value={supervisor}
              onChangeText={setSupervisor}
              placeholder="Nombre de quien acompañó al estudiante"
              placeholderTextColor={C.muted}
            />
            <Text style={styles.label}>Nota para la universidad (opcional)</Text>
            <TextInput
              style={[styles.input, { minHeight: 64, textAlignVertical: 'top' }]}
              value={nota}
              onChangeText={setNota}
              placeholder="Comentario breve sobre el desempeño"
              placeholderTextColor={C.muted}
              multiline
            />

            {/* Acciones de documento */}
            <View style={styles.docRow}>
              <TouchableOpacity style={styles.docBtn} onPress={verPdf} activeOpacity={0.85}>
                <Ionicons name="download-outline" size={16} color={C.text} />
                <Text style={styles.docBtnText}>Ver / descargar PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.docBtn} onPress={adjuntar} disabled={subiendo} activeOpacity={0.85}>
                {subiendo ? (
                  <ActivityIndicator size="small" color={C.text} />
                ) : (
                  <>
                    <Ionicons name="attach-outline" size={16} color={C.text} />
                    <Text style={styles.docBtnText}>Adjuntar mi PDF</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
            {archivoUrl ? (
              <View style={styles.adjuntoOk}>
                <Ionicons name="checkmark-circle" size={15} color={C.green} />
                <Text style={styles.adjuntoOkText}>
                  PDF adjunto — reemplaza la constancia automática al enviar.
                </Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.enviarBtn, enviando && { opacity: 0.5 }]}
              onPress={enviar}
              disabled={enviando}
              activeOpacity={0.9}
            >
              {enviando ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="send" size={16} color="#fff" />
                  <Text style={styles.enviarText}>Enviar a la universidad</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.laterBtn} onPress={onListo} activeOpacity={0.7}>
              <Text style={styles.laterText}>Enviar más tarde</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.pvRow}>
      <Text style={styles.pvK}>{k}</Text>
      <Text style={styles.pvV} noTranslate>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: C.overlay, justifyContent: 'center', padding: 18 },
  sheet: {
    backgroundColor: C.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    padding: 22,
    maxHeight: '90%',
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 16,
  },
  headerBadgeText: { color: C.accent, fontSize: 13, fontWeight: '800' },
  titulo: { color: C.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  sub: {
    color: C.textSub,
    fontSize: 12.5,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
    lineHeight: 18,
  },
  preview: {
    backgroundColor: '#f7f5ff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  pvBrand: { color: '#6b7280', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  pvTitle: { color: '#1b1430', fontSize: 15, fontWeight: '800', marginTop: 4, marginBottom: 10 },
  pvRow: { flexDirection: 'row', marginTop: 5 },
  pvK: { color: '#6b7280', fontSize: 12, fontWeight: '600', width: 118 },
  pvV: { color: '#1b1430', fontSize: 12.5, fontWeight: '600', flex: 1 },
  label: { color: C.text, fontSize: 13, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 11,
    color: C.text,
    fontSize: 13.5,
  },
  docRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  docBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingVertical: 12,
  },
  docBtnText: { color: C.text, fontSize: 12.5, fontWeight: '700' },
  adjuntoOk: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  adjuntoOkText: { color: C.green, fontSize: 12, fontWeight: '600', flex: 1 },
  enviarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingVertical: 15,
    marginTop: 20,
  },
  enviarText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  laterBtn: { marginTop: 10, paddingVertical: 8, alignItems: 'center' },
  laterText: { color: C.muted, fontSize: 12.5, fontWeight: '700' },
});
