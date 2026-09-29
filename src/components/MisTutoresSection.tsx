// ════════════════════════════════════════════════════════════════════════
// MisTutoresSection.tsx — sección "Mis tutores" dentro de Mi Perfil (empresa).
// Fase 1 del rol "tutor": alta/baja de cuenta y nada más — la asignación de
// tutores a pasantes es de una fase futura. Se usa como `render:` dentro de
// PerfilMasterDetail (app/dashboard-empresa.tsx), igual que
// ResenasFeedback/HistorialPuestos.
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text, AutoTextInput as TextInput } from './AutoText';
import { showAlert, showConfirm } from './AppAlert';
import ProfileViewerModal from './ProfileViewerModal';
import StorageAvatar from './StorageAvatar';
import { db } from '../config/firebaseConfig';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { abrirChatDirectoUsuarios } from '../services/chatService';
import { COLECCION_ASIGNACIONES, type AsignacionCupo } from '../services/reclamoCuposService';
import {
  crearTutor,
  desactivarTutor,
  reactivarTutor,
  suscribirTutoresDeEmpresa,
  type PerfilTutor,
} from '../services/tutorService';

interface Props {
  empresaId: string;
  empresaNombre: string;
}

/** Solo letras (con tildes/ñ) y espacios — se aplica mientras se escribe, así
 *  el campo nunca llega a contener un carácter inválido. */
const SOLO_LETRAS_RE = /[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g;
const soloLetras = (raw: string): string => raw.replace(SOLO_LETRAS_RE, '');

/** Mismo patrón de correo ya usado en el resto del proyecto (otp.ts/registro.tsx). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

type CampoTutor = 'nombreCompleto' | 'correo' | 'cargo' | 'carnetTrabajo';

/** Borde del campo: neutral mientras el usuario no ha tocado ESE campo
 *  todavía; en cuanto escribe algo en él, se valida al instante — rojo con
 *  error, verde si ya es válido. Por campo, no por el formulario completo:
 *  escribir en uno no enciende el color de los demás. */
function campoBorde(s: ReturnType<typeof makeStyles>, tocado: boolean, error?: string) {
  if (!tocado) return null;
  return error ? s.inputError : s.inputOk;
}

export default function MisTutoresSection({ empresaId, empresaNombre }: Props) {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const router = useRouter();

  const [tutores, setTutores] = useState<PerfilTutor[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [correo, setCorreo] = useState('');
  const [cargo, setCargo] = useState('');
  const [carnetTrabajo, setCarnetTrabajo] = useState('');
  const [errores, setErrores] = useState<Partial<Record<CampoTutor, string>>>({});
  const [tocados, setTocados] = useState<Partial<Record<CampoTutor, boolean>>>({});
  const [guardando, setGuardando] = useState(false);
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);
  const [chateandoId, setChateandoId] = useState<string | null>(null);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [perfilEstudianteId, setPerfilEstudianteId] = useState<string | null>(null);

  useEffect(() => suscribirTutoresDeEmpresa(empresaId, setTutores), [empresaId]);

  // Todos los cupos de la empresa, agrupados por tutor (activos + historial) —
  // UNA sola suscripción para todas las tarjetas, en vez de una por tutor.
  // Mismo query que ya usa AsignarTutorModal.tsx para su propio contador.
  const [cupos, setCupos] = useState<AsignacionCupo[]>([]);
  useEffect(() => {
    if (!empresaId) { setCupos([]); return; }
    const unsub = onSnapshot(
      query(collection(db, COLECCION_ASIGNACIONES), where('empresaId', '==', empresaId)),
      snap => setCupos(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as AsignacionCupo))),
      () => setCupos([]),
    );
    return unsub;
  }, [empresaId]);

  const cuposPorTutor = useMemo(() => {
    const m = new Map<string, AsignacionCupo[]>();
    cupos.forEach(c => {
      if (!c.tutorId) return;
      const arr = m.get(c.tutorId) ?? [];
      arr.push(c);
      m.set(c.tutorId, arr);
    });
    // Activos primero, luego historial; dentro de cada grupo, por nombre.
    m.forEach(arr => arr.sort((a, b) => {
      const activoA = a.estado === 'tomado' && a.finalizada !== true;
      const activoB = b.estado === 'tomado' && b.finalizada !== true;
      if (activoA !== activoB) return activoA ? -1 : 1;
      return String(a.estudianteNombre ?? '').localeCompare(String(b.estudianteNombre ?? ''));
    }));
    return m;
  }, [cupos]);

  const cantidadActivos = (tutorId: string) =>
    (cuposPorTutor.get(tutorId) ?? []).filter(c => c.estado === 'tomado' && c.finalizada !== true).length;

  const chatearConTutor = async (tutor: PerfilTutor) => {
    if (chateandoId) return;
    setChateandoId(tutor.id);
    try {
      const chatId = await abrirChatDirectoUsuarios({
        yo: { uid: empresaId, nombre: empresaNombre || 'Empresa', rol: 'empresa' },
        otro: { uid: tutor.id, nombre: tutor.nombre_completo || 'Tutor', rol: 'tutor' },
      });
      router.push({ pathname: '/ChatScreen', params: { chatId, peerName: tutor.nombre_completo || 'Tutor' } } as any);
    } catch {
      showAlert('Error', 'No se pudo abrir el chat con el tutor.');
    } finally {
      setChateandoId(null);
    }
  };

  const limpiarFormulario = () => {
    setNombreCompleto('');
    setCorreo('');
    setCargo('');
    setCarnetTrabajo('');
    setErrores({});
    setTocados({});
  };

  const validarCampo = (campo: CampoTutor, valor: string): string => {
    const v = valor.trim();
    if (!v) return 'Este campo es obligatorio.';
    if (campo === 'correo' && !EMAIL_RE.test(v)) {
      return 'Ingresa un correo válido (debe llevar @ y un dominio, ej. nombre@empresa.com).';
    }
    return '';
  };

  /** Valida ESE campo al instante, en cada tecla — no espera a un intento de
   *  envío. Marca el campo como "tocado" para que su borde ya pueda pintarse. */
  const revalidar = (campo: CampoTutor, valor: string) => {
    const msg = validarCampo(campo, valor);
    setErrores((prev) => ({ ...prev, [campo]: msg }));
    setTocados((prev) => (prev[campo] ? prev : { ...prev, [campo]: true }));
  };

  const registrar = async () => {
    const valores: Record<CampoTutor, string> = { nombreCompleto, correo, cargo, carnetTrabajo };
    const nuevosErrores: Partial<Record<CampoTutor, string>> = {};
    (Object.keys(valores) as CampoTutor[]).forEach((campo) => {
      const msg = validarCampo(campo, valores[campo]);
      if (msg) nuevosErrores[campo] = msg;
    });
    setErrores(nuevosErrores);
    // Al enviar, todo campo cuenta como "tocado" — así un campo vacío que el
    // usuario nunca llegó a escribir también se pinta de rojo de inmediato.
    setTocados({ nombreCompleto: true, correo: true, cargo: true, carnetTrabajo: true });
    if (Object.keys(nuevosErrores).length > 0) return;

    setGuardando(true);
    try {
      const r = await crearTutor({
        nombreCompleto: nombreCompleto.trim(),
        correo: correo.trim(),
        cargo: cargo.trim(),
        carnetTrabajo: carnetTrabajo.trim(),
      });
      setModalOpen(false);
      limpiarFormulario();
      if (r.emailEnviado) {
        showAlert('Tutor registrado', `Le enviamos sus datos de acceso a ${correo.trim()}.`);
      } else {
        showAlert(
          'Tutor registrado',
          'La cuenta quedó creada, pero no pudimos enviarle el correo con sus datos de acceso. Avísale por otro medio.',
        );
      }
    } catch (e: any) {
      showAlert('No se pudo registrar', e?.message ?? 'Inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async (tutor: PerfilTutor) => {
    const activar = !tutor.activo;
    const ok = await showConfirm({
      title: activar ? 'Reactivar tutor' : 'Desactivar tutor',
      message: activar
        ? `${tutor.nombre_completo} podrá volver a iniciar sesión.`
        : `${tutor.nombre_completo} perderá el acceso a su cuenta. Su historial no se borra.`,
      confirmText: activar ? 'Reactivar' : 'Desactivar',
      destructive: !activar,
    });
    if (!ok) return;
    setCambiandoId(tutor.id);
    try {
      if (activar) await reactivarTutor(tutor.id);
      else await desactivarTutor(tutor.id);
    } catch (e: any) {
      showAlert('No se pudo completar', e?.message ?? 'Inténtalo de nuevo.');
    } finally {
      setCambiandoId(null);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      {tutores.length === 0 ? (
        <Text style={s.vacio}>Todavía no has registrado ningún tutor.</Text>
      ) : (
        tutores.map((tutor) => {
          const pasantes = cuposPorTutor.get(tutor.id) ?? [];
          const expandido = expandidoId === tutor.id;
          return (
          <View key={tutor.id} style={s.fila}>
            <View style={s.filaTop}>
              <StorageAvatar
                url={tutor.foto_url}
                storagePath={`fotos_tutores/${tutor.id}/foto.jpg`}
                size={44}
                fallbackIcon="person"
              />
              <View style={{ flex: 1 }}>
                <Text style={s.nombre} noTranslate>{tutor.nombre_completo}</Text>
                <Text style={s.cargo} noTranslate>{tutor.cargo}</Text>
              </View>
              <View style={[s.badge, tutor.activo ? s.badgeOk : s.badgeOff]}>
                <Text style={[s.badgeTxt, tutor.activo ? s.badgeTxtOk : s.badgeTxtOff]}>
                  {tutor.activo ? 'Activo' : 'Inactivo'}
                </Text>
              </View>
              <TouchableOpacity
                style={s.accionBtn}
                onPress={() => cambiarEstado(tutor)}
                disabled={cambiandoId === tutor.id}
                activeOpacity={0.8}
              >
                {cambiandoId === tutor.id ? (
                  <ActivityIndicator size="small" color={colors.primaryLight} />
                ) : (
                  <Ionicons
                    name={tutor.activo ? 'pause-circle-outline' : 'play-circle-outline'}
                    size={22}
                    color={tutor.activo ? colors.error : colors.success}
                  />
                )}
              </TouchableOpacity>
            </View>

            <View style={s.filaBottom}>
              <TouchableOpacity
                style={s.chatBtn}
                onPress={() => chatearConTutor(tutor)}
                disabled={chateandoId === tutor.id}
                activeOpacity={0.85}
              >
                {chateandoId === tutor.id ? (
                  <ActivityIndicator size="small" color={colors.primaryLight} />
                ) : (
                  <Ionicons name="chatbubbles-outline" size={16} color={colors.primaryLight} />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={s.pasantesBtn}
                onPress={() => setExpandidoId(expandido ? null : tutor.id)}
                activeOpacity={0.8}
              >
                <Ionicons name="people-outline" size={14} color={colors.textMuted} />
                <Text style={s.pasantesBtnTxt} noTranslate>{cantidadActivos(tutor.id)}</Text>
                <Ionicons name={expandido ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {expandido && (
              <View style={s.listaPasantes}>
                {pasantes.length === 0 ? (
                  <Text style={s.listaVacia}>Todavía no tiene pasantes asignados.</Text>
                ) : (
                  pasantes.map(c => {
                    const activo = c.estado === 'tomado' && c.finalizada !== true;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={s.pasanteRow}
                        activeOpacity={0.7}
                        onPress={() => setPerfilEstudianteId(c.estudianteId)}
                      >
                        <Text style={s.pasanteNombre} numberOfLines={1} noTranslate>
                          {c.estudianteNombre || 'Estudiante'}
                        </Text>
                        <View style={[s.pasanteBadge, activo ? s.badgeOk : s.badgeOff]}>
                          <Text style={[s.pasanteBadgeTxt, activo ? s.badgeTxtOk : s.badgeTxtOff]}>
                            {activo ? 'Activo' : 'Finalizado'}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            )}
          </View>
          );
        })
      )}

      <TouchableOpacity style={s.addBtn} onPress={() => setModalOpen(true)} activeOpacity={0.85}>
        <Ionicons name="person-add-outline" size={16} color="#fff" />
        <Text style={s.addBtnTxt}>Agregar tutor</Text>
      </TouchableOpacity>

      <Modal
        visible={modalOpen}
        transparent
        animationType="none"
        onRequestClose={() => { setModalOpen(false); limpiarFormulario(); }}
      >
        <View style={s.overlay}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Agregar tutor</Text>
              <TouchableOpacity
                onPress={() => { setModalOpen(false); limpiarFormulario(); }}
                activeOpacity={0.8}
              >
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={s.modalHint}>
              Le enviaremos sus datos de acceso por correo. El resto de su perfil (dirección, DUI, foto, horario) lo completa él mismo.
            </Text>

            <View style={s.campoWrap}>
              <TextInput
                style={[s.input, campoBorde(s, !!tocados.nombreCompleto, errores.nombreCompleto)]}
                value={nombreCompleto}
                onChangeText={(v) => { const limpio = soloLetras(v); setNombreCompleto(limpio); revalidar('nombreCompleto', limpio); }}
                placeholder="Nombre completo"
                placeholderTextColor={colors.white60}
              />
              {!!errores.nombreCompleto && <Text style={s.errorTxt}>{errores.nombreCompleto}</Text>}
            </View>

            <View style={s.campoWrap}>
              <TextInput
                style={[s.input, campoBorde(s, !!tocados.correo, errores.correo)]}
                value={correo}
                onChangeText={(v) => { setCorreo(v); revalidar('correo', v); }}
                placeholder="Correo"
                placeholderTextColor={colors.white60}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              {!!errores.correo && <Text style={s.errorTxt}>{errores.correo}</Text>}
            </View>

            <View style={s.campoWrap}>
              <TextInput
                style={[s.input, campoBorde(s, !!tocados.cargo, errores.cargo)]}
                value={cargo}
                onChangeText={(v) => { setCargo(v); revalidar('cargo', v); }}
                placeholder="Cargo"
                placeholderTextColor={colors.white60}
              />
              {!!errores.cargo && <Text style={s.errorTxt}>{errores.cargo}</Text>}
            </View>

            <View style={s.campoWrap}>
              <TextInput
                style={[s.input, campoBorde(s, !!tocados.carnetTrabajo, errores.carnetTrabajo)]}
                value={carnetTrabajo}
                onChangeText={(v) => { setCarnetTrabajo(v); revalidar('carnetTrabajo', v); }}
                placeholder="Carnet de trabajo"
                placeholderTextColor={colors.white60}
              />
              {!!errores.carnetTrabajo && <Text style={s.errorTxt}>{errores.carnetTrabajo}</Text>}
            </View>

            <TouchableOpacity
              style={[s.saveBtn, guardando && { opacity: 0.6 }]}
              onPress={registrar}
              disabled={guardando}
              activeOpacity={0.9}
            >
              {guardando ? <ActivityIndicator size="small" color="#fff" /> : (
                <Text style={s.saveBtnTxt}>Registrar tutor</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {!!perfilEstudianteId && (
        <ProfileViewerModal
          visible
          tipo="estudiante"
          profileId={perfilEstudianteId}
          onClose={() => setPerfilEstudianteId(null)}
        />
      )}
    </View>
  );
}

const makeStyles = (C: GradlyColors) =>
  StyleSheet.create({
    vacio: { color: C.white60, fontSize: 13.5, textAlign: 'center', paddingVertical: 10 },
    fila: {
      gap: 10,
      backgroundColor: C.white8,
      borderRadius: 14,
      padding: 10,
    },
    filaTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    nombre: { color: C.textPrimary, fontSize: 14, fontFamily: FONTS.interSemiBold },
    cargo: { color: C.white60, fontSize: 12, marginTop: 1 },
    badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
    badgeOk: { backgroundColor: 'rgba(34,197,94,0.14)' },
    badgeOff: { backgroundColor: 'rgba(239,68,68,0.12)' },
    badgeTxt: { fontSize: 11, fontFamily: FONTS.interSemiBold },
    badgeTxtOk: { color: C.success },
    badgeTxtOff: { color: C.error },
    accionBtn: { padding: 2 },
    filaBottom: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10,
    },
    chatBtn: {
      width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: C.primary35, backgroundColor: C.primary12,
    },
    pasantesBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      borderWidth: 1, borderColor: C.border, borderRadius: 10,
      paddingHorizontal: 10, paddingVertical: 7,
    },
    pasantesBtnTxt: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: C.textMuted },
    listaPasantes: { gap: 6, paddingTop: 2 },
    listaVacia: { color: C.white60, fontSize: 12, fontStyle: 'italic', paddingVertical: 4 },
    pasanteRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: C.backgroundSurface, borderRadius: 10,
      paddingHorizontal: 10, paddingVertical: 8,
    },
    pasanteNombre: { flex: 1, fontSize: 12.5, fontFamily: FONTS.interRegular, color: C.textPrimary },
    pasanteBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
    pasanteBadgeTxt: { fontSize: 10, fontFamily: FONTS.interSemiBold },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: C.primary,
      borderRadius: 14,
      paddingVertical: 13,
      marginTop: 4,
    },
    addBtnTxt: { color: '#fff', fontSize: 14, fontFamily: FONTS.interSemiBold },
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(7,5,15,0.85)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modal: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: C.backgroundCard,
      borderRadius: 20,
      padding: 22,
      borderWidth: 1,
      borderColor: C.primary35,
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    modalTitle: { color: C.textPrimary, fontSize: 17, fontFamily: FONTS.soraBold },
    modalHint: { color: C.white60, fontSize: 12.5, lineHeight: 17, marginBottom: 16 },
    campoWrap: { marginBottom: 10 },
    input: {
      backgroundColor: C.white8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: 'transparent',
      paddingHorizontal: 14,
      paddingVertical: 11,
      color: C.textPrimary,
      fontSize: 14,
    },
    inputError: { borderColor: C.error },
    inputOk: { borderColor: C.success },
    errorTxt: { color: C.error, fontSize: 11.5, fontFamily: FONTS.interRegular, marginTop: 4 },
    saveBtn: {
      backgroundColor: C.primary,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 4,
    },
    saveBtnTxt: { color: '#fff', fontSize: 14.5, fontFamily: FONTS.interSemiBold },
  });
