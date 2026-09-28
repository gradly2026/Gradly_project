// ════════════════════════════════════════════════════════════════════════
// MisTutoresSection.tsx — sección "Mis tutores" dentro de Mi Perfil (empresa).
// Fase 1 del rol "tutor": alta/baja de cuenta y nada más — la asignación de
// tutores a pasantes es de una fase futura. Se usa como `render:` dentro de
// PerfilMasterDetail (app/dashboard-empresa.tsx), igual que
// ResenasFeedback/HistorialPuestos.
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text, AutoTextInput as TextInput } from './AutoText';
import { showAlert, showConfirm } from './AppAlert';
import StorageAvatar from './StorageAvatar';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import {
  crearTutor,
  desactivarTutor,
  reactivarTutor,
  suscribirTutoresDeEmpresa,
  type PerfilTutor,
} from '../services/tutorService';

interface Props {
  empresaId: string;
}

export default function MisTutoresSection({ empresaId }: Props) {
  const { colors } = useTheme();
  const s = makeStyles(colors);

  const [tutores, setTutores] = useState<PerfilTutor[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [correo, setCorreo] = useState('');
  const [cargo, setCargo] = useState('');
  const [carnetTrabajo, setCarnetTrabajo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);

  useEffect(() => suscribirTutoresDeEmpresa(empresaId, setTutores), [empresaId]);

  const limpiarFormulario = () => {
    setNombreCompleto('');
    setCorreo('');
    setCargo('');
    setCarnetTrabajo('');
  };

  const registrar = async () => {
    if (!nombreCompleto.trim() || !correo.trim() || !cargo.trim() || !carnetTrabajo.trim()) {
      showAlert('Faltan datos', 'Completa nombre, correo, cargo y carnet de trabajo.');
      return;
    }
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
        tutores.map((tutor) => (
          <View key={tutor.id} style={s.fila}>
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
        ))
      )}

      <TouchableOpacity style={s.addBtn} onPress={() => setModalOpen(true)} activeOpacity={0.85}>
        <Ionicons name="person-add-outline" size={16} color="#fff" />
        <Text style={s.addBtnTxt}>Agregar tutor</Text>
      </TouchableOpacity>

      <Modal visible={modalOpen} transparent animationType="none" onRequestClose={() => setModalOpen(false)}>
        <View style={s.overlay}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Agregar tutor</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)} activeOpacity={0.8}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={s.modalHint}>
              Le enviaremos sus datos de acceso por correo. El resto de su perfil (dirección, DUI, foto, horario) lo completa él mismo.
            </Text>
            <TextInput
              style={s.input}
              value={nombreCompleto}
              onChangeText={setNombreCompleto}
              placeholder="Nombre completo"
              placeholderTextColor={colors.white60}
            />
            <TextInput
              style={s.input}
              value={correo}
              onChangeText={setCorreo}
              placeholder="Correo"
              placeholderTextColor={colors.white60}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={s.input}
              value={cargo}
              onChangeText={setCargo}
              placeholder="Cargo"
              placeholderTextColor={colors.white60}
            />
            <TextInput
              style={s.input}
              value={carnetTrabajo}
              onChangeText={setCarnetTrabajo}
              placeholder="Carnet de trabajo"
              placeholderTextColor={colors.white60}
            />
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
    </View>
  );
}

const makeStyles = (C: GradlyColors) =>
  StyleSheet.create({
    vacio: { color: C.white60, fontSize: 13.5, textAlign: 'center', paddingVertical: 10 },
    fila: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: C.white8,
      borderRadius: 14,
      padding: 10,
    },
    nombre: { color: C.textPrimary, fontSize: 14, fontFamily: FONTS.interSemiBold },
    cargo: { color: C.white60, fontSize: 12, marginTop: 1 },
    badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
    badgeOk: { backgroundColor: 'rgba(34,197,94,0.14)' },
    badgeOff: { backgroundColor: 'rgba(239,68,68,0.12)' },
    badgeTxt: { fontSize: 11, fontFamily: FONTS.interSemiBold },
    badgeTxtOk: { color: C.success },
    badgeTxtOff: { color: C.error },
    accionBtn: { padding: 2 },
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
      padding: 20,
    },
    modal: {
      backgroundColor: C.backgroundCard,
      borderRadius: 20,
      padding: 22,
      borderWidth: 1,
      borderColor: C.primary35,
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    modalTitle: { color: C.textPrimary, fontSize: 17, fontFamily: FONTS.soraBold },
    modalHint: { color: C.white60, fontSize: 12.5, lineHeight: 17, marginBottom: 16 },
    input: {
      backgroundColor: C.white8,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 11,
      color: C.textPrimary,
      fontSize: 14,
      marginBottom: 10,
    },
    saveBtn: {
      backgroundColor: C.primary,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 4,
    },
    saveBtnTxt: { color: '#fff', fontSize: 14.5, fontFamily: FONTS.interSemiBold },
  });
