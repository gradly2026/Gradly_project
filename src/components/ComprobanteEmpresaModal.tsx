import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import * as DocumentPicker from 'expo-document-picker';
import * as Print from 'expo-print';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { db } from '../config/firebaseConfig';
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
  // Colores del "papel" (documento formal).
  paper: '#fbfaf7',
  ink: '#1b1730',
  inkSub: '#5b5570',
  hair: 'rgba(27,23,48,0.14)',
};

const toISO = (d: Date | null): string => (d ? d.toISOString().slice(0, 10) : '');

interface Props {
  asignacion: AsignacionCupo;
  /** Se llamó "Enviar" o "Enviar más tarde" → avanzar/cerrar. */
  onListo: () => void;
}

/**
 * Pantalla de la EMPRESA para generar y enviar el comprobante de finalización
 * de una pasantía por cupo. Muestra la constancia con formato de documento
 * formal (los datos salen de la BD); la empresa puede completar área/supervisor,
 * descargarla como PDF, adjuntar su propia versión en papel membretado, y
 * enviarla a la universidad para que la valide.
 */
export default function ComprobanteEmpresaModal({ asignacion, onListo }: Props) {
  const [area, setArea] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [nota, setNota] = useState('');
  const [archivoUrl, setArchivoUrl] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  // Fecha de emisión congelada al abrir el modal (≈ fecha de envío). Es la que
  // muestra la constancia, no la del día en que luego se abra/imprima.
  const [fechaEmisionISO] = useState(() => new Date().toISOString().slice(0, 10));

  // ── Meta de horas del grupo + nombre de la universidad ──
  // El total lo define el GRUPO (`horasRequeridas`/`total_horas`), no la
  // asignación: si el cupo se cerró sin escribir `horasCumplidas`, hay que
  // leerlo del grupo o el comprobante saldría con "0 h".
  const [metaGrupo, setMetaGrupo] = useState<number | null>(null);
  const [uniNombre, setUniNombre] = useState('');
  const [cargandoDatos, setCargandoDatos] = useState(true);

  useEffect(() => {
    let cancel = false;
    setCargandoDatos(true);
    (async () => {
      const tareas: Promise<any>[] = [];
      if (asignacion.grupoId) {
        tareas.push(
          getDoc(doc(db, 'grupos', asignacion.grupoId))
            .then(g => {
              if (cancel) return;
              const dd = g.exists() ? (g.data() as any) : {};
              const h = Number(dd.horasRequeridas ?? dd.total_horas ?? 0);
              setMetaGrupo(Number.isFinite(h) && h > 0 ? Math.round(h) : null);
            })
            .catch(() => { if (!cancel) setMetaGrupo(null); }),
        );
      } else {
        setMetaGrupo(null);
      }
      if (asignacion.universidadId) {
        tareas.push(
          getDoc(doc(db, 'perfiles_universidades', asignacion.universidadId))
            .then(u => { if (!cancel) setUniNombre((u.data() as any)?.nombre_universidad ?? ''); })
            .catch(() => { if (!cancel) setUniNombre(''); }),
        );
      }
      await Promise.allSettled(tareas);
      if (!cancel) setCargandoDatos(false);
    })();
    return () => { cancel = true; };
  }, [asignacion.grupoId, asignacion.universidadId]);

  // Horas de la práctica: lo cumplido guardado, o la meta del grupo (quien
  // culminó por horas cumplió exactamente la meta).
  const horas = Math.round(
    Number(asignacion.horasCumplidas) > 0
      ? Number(asignacion.horasCumplidas)
      : Number(metaGrupo) || 0,
  );

  const prog = useMemo(
    () => progresoPorMeta(asignacion.horario, asignacion.fechaPresentacion ?? '', horas),
    [asignacion, horas],
  );

  const datos = useMemo(
    () =>
      construirDatosConstancia(asignacion, {
        fechaFin: toISO(prog.fechaFin),
        horasCumplidas: horas,
        universidadNombre: uniNombre,
      }),
    [asignacion, prog, horas, uniNombre],
  );

  const listoParaEnviar = !cargandoDatos && horas > 0 && !enviando && !subiendo;

  const verPdf = async () => {
    try {
      await Print.printAsync({
        html: constanciaHtml(datos, { area, supervisor, nota, fechaEmisionISO }),
      });
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
    if (!listoParaEnviar) return;
    setEnviando(true);
    try {
      await enviarComprobante(datos, {
        archivoUrl,
        notaEmpresa: nota,
        area,
        supervisor,
        fechaEmisionISO,
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

  const horario = textoHorario(asignacion.horario) || '';
  const hoy = fmtFechaLarga(fechaEmisionISO);
  const empresa = datos.empresaNombre || 'La empresa';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onListo}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.headerBadge}>
            <Ionicons name="document-text" size={16} color={C.accent} />
            <Text style={styles.headerBadgeText}>Comprobante de finalización</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* ── El "papel": constancia con formato de documento formal ── */}
            <View style={styles.paper}>
              <Text style={styles.pTitulo}>Constancia de finalización de pasantía</Text>
              <Text style={styles.pBrand}>GRADLY</Text>
              <View style={styles.pRule} />

              <Text style={styles.pLugar} noTranslate>
                San Salvador, El Salvador, a {hoy}.
              </Text>

              <Text style={styles.pBody}>
                Por medio de la presente,{' '}
                <Text style={styles.pStrong} noTranslate>{empresa}</Text> hace constar que el/la
                estudiante <Text style={styles.pStrong} noTranslate>{datos.estudianteNombre || '—'}</Text>
                {datos.carrera ? (
                  <Text noTranslate>, de la carrera de {datos.carrera}</Text>
                ) : null}
                , de <Text style={styles.pStrong} noTranslate>{datos.universidadNombre || 'su universidad'}</Text>,
                realizó y culminó satisfactoriamente su pasantía o práctica profesional en nuestra
                organización
                {datos.vacanteTitulo ? (
                  <Text noTranslate>, desempeñándose como {datos.vacanteTitulo}</Text>
                ) : null}
                .
              </Text>

              <Text style={styles.pSubtitulo}>Detalle de la práctica</Text>
              <PRow k="Período" v={`${fmtFechaLarga(datos.fechaInicio)} — ${fmtFechaLarga(datos.fechaFin)}`} />
              <PRow k="Total de horas cumplidas" v={cargandoDatos && horas === 0 ? 'Calculando…' : `${horas} horas`} />
              {!!horario && <PRow k="Horario" v={horario} />}
              {!!area.trim() && <PRow k="Área o departamento" v={area.trim()} />}
              {!!supervisor.trim() && <PRow k="Supervisor" v={supervisor.trim()} />}

              {!!nota.trim() && <Text style={[styles.pBody, { marginTop: 12 }]} noTranslate>{nota.trim()}</Text>}

              <Text style={[styles.pBody, { marginTop: 12 }]}>
                El/la estudiante cumplió con las horas y los compromisos establecidos para su
                práctica. Se extiende la presente a solicitud de la parte interesada, para los fines
                académicos que estime convenientes.
              </Text>

              <View style={styles.pFirma}>
                <View style={styles.pFirmaLine} />
                <Text style={styles.pFirmaName} noTranslate>{empresa}</Text>
                {!!supervisor.trim() && <Text style={styles.pFirmaSub} noTranslate>{supervisor.trim()}</Text>}
                <Text style={styles.pFirmaSub} noTranslate>{hoy}</Text>
              </View>
            </View>

            {/* ── Campos que la empresa completa ── */}
            <Text style={styles.seccion}>Completa la constancia (opcional)</Text>
            <Text style={styles.label}>Área o departamento</Text>
            <TextInput
              style={styles.input}
              value={area}
              onChangeText={setArea}
              placeholder="Ej. Desarrollo de software"
              placeholderTextColor={C.muted}
            />
            <Text style={styles.label}>Supervisor</Text>
            <TextInput
              style={styles.input}
              value={supervisor}
              onChangeText={setSupervisor}
              placeholder="Nombre de quien acompañó al estudiante"
              placeholderTextColor={C.muted}
            />
            <Text style={styles.label}>Nota para la universidad</Text>
            <TextInput
              style={[styles.input, { minHeight: 68, textAlignVertical: 'top' }]}
              value={nota}
              onChangeText={setNota}
              placeholder="Comentario breve sobre el desempeño"
              placeholderTextColor={C.muted}
              multiline
            />

            {/* ── Documento ── */}
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
              style={[styles.enviarBtn, !listoParaEnviar && { opacity: 0.5 }]}
              onPress={enviar}
              disabled={!listoParaEnviar}
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
            {!cargandoDatos && horas === 0 ? (
              <Text style={styles.hint}>
                No se pudieron calcular las horas de la práctica. Revisa el grupo del estudiante
                antes de enviar.
              </Text>
            ) : null}
            <TouchableOpacity style={styles.laterBtn} onPress={onListo} activeOpacity={0.7}>
              <Text style={styles.laterText}>Enviar más tarde</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function PRow({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.pDetRow}>
      <Text style={styles.pDetK}>{k}</Text>
      <Text style={styles.pDetV} noTranslate>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: C.overlay, justifyContent: 'center', padding: 16 },
  sheet: {
    backgroundColor: C.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
    padding: 18,
    maxHeight: '92%',
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 13,
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 14,
  },
  headerBadgeText: { color: C.accent, fontSize: 12.5, fontWeight: '800' },

  // ── Papel ──
  paper: {
    backgroundColor: C.paper,
    borderRadius: 6,
    paddingVertical: 26,
    paddingHorizontal: 24,
    marginBottom: 18,
  },
  pTitulo: {
    color: C.ink,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  pBrand: {
    color: C.inkSub,
    fontSize: 9.5,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 3,
    marginTop: 4,
  },
  pRule: {
    height: 1,
    backgroundColor: C.hair,
    marginTop: 14,
    marginBottom: 18,
  },
  pLugar: { color: C.ink, fontSize: 12.5, marginBottom: 14 },
  pBody: { color: C.ink, fontSize: 12.5, lineHeight: 21, textAlign: 'justify' },
  pStrong: { fontWeight: '800' },
  pSubtitulo: { color: C.ink, fontSize: 12.5, fontWeight: '800', marginTop: 16, marginBottom: 6 },
  pDetRow: { flexDirection: 'row', marginTop: 4 },
  pDetK: { color: C.inkSub, fontSize: 12, width: 150 },
  pDetV: { color: C.ink, fontSize: 12, fontWeight: '600', flex: 1 },
  pFirma: { alignItems: 'center', marginTop: 40 },
  pFirmaLine: { height: 1, backgroundColor: C.ink, width: 200, marginBottom: 6 },
  pFirmaName: { color: C.ink, fontSize: 12, fontWeight: '800' },
  pFirmaSub: { color: C.inkSub, fontSize: 11.5, marginTop: 2 },

  // ── Campos ──
  seccion: {
    color: C.textSub,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  label: { color: C.text, fontSize: 12.5, fontWeight: '700', marginTop: 10, marginBottom: 5 },
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
  hint: { color: C.muted, fontSize: 11.5, textAlign: 'center', marginTop: 10, lineHeight: 16 },
  laterBtn: { marginTop: 10, paddingVertical: 8, alignItems: 'center' },
  laterText: { color: C.muted, fontSize: 12.5, fontWeight: '700' },
});
