import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useEffect } from 'react';
import { db } from '../config/firebaseConfig';
import { useAuth } from '../context/AuthContext';

/**
 * Recordatorio de datos personales (v87). Sin UI propia: se monta en las tabs
 * del estudiante (junto a OnboardingDireccionGate) y, si el estudiante YA pasó
 * el onboarding de dirección pero le falta teléfono o número de documento, le
 * crea UNA notificación "Completa tu perfil". Al tocarla se abre
 * CompletarPerfilModal (deep link "completarPerfil:me").
 *
 * - Id de notificación DETERMINÍSTICO (`completarPerfil_{uid}`) → nunca duplica.
 * - Flag `datos_recordatorio_enviado` en el perfil → se envía UNA sola vez
 *   (si el estudiante la borra sin llenar los datos, no se vuelve a crear).
 * - Cuando ya completó los datos, marca la notificación como leída.
 */
export default function DatosPersonalesGate() {
  const { user, rol } = useAuth();

  useEffect(() => {
    if (!user?.uid || rol !== 'estudiante') return;
    const uid = user.uid;
    let cancel = false;

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'perfiles_estudiantes', uid));
        if (cancel || !snap.exists()) return;
        const d = snap.data() as any;

        // Solo aplica a quien ya pasó el onboarding de dirección (los que no,
        // completan todo en OnboardingDireccionModal).
        if (!d.departamento) return;

        const faltan = !String(d.telefono ?? '').trim() || !String(d.doc_numero ?? '').trim();
        const notifRef = doc(db, 'notificaciones_app', `completarPerfil_${uid}`);

        if (faltan && d.datos_recordatorio_enviado !== true) {
          await setDoc(
            notifRef,
            {
              destinatario_id: uid,
              titulo: 'Completa tu perfil',
              mensaje: 'Agrega tu teléfono y tu documento de identidad para tener tu perfil completo. Toca aquí para hacerlo.',
              tipo: 'info',
              referencia_id: 'completarPerfil:me',
              link_accion: 'completarPerfil:me',
              leido: false,
              createdAt: serverTimestamp(),
              fecha: serverTimestamp(),
            },
            { merge: true },
          );
          await updateDoc(doc(db, 'perfiles_estudiantes', uid), { datos_recordatorio_enviado: true }).catch(() => {});
        } else if (!faltan && d.datos_recordatorio_enviado === true) {
          // Ya completó (por el modal o desde Mi Perfil): cierra el recordatorio.
          await updateDoc(notifRef, { leido: true }).catch(() => {});
        }
      } catch (e) {
        console.warn('DatosPersonalesGate:', e);
      }
    })();

    return () => { cancel = true; };
  }, [user?.uid, rol]);

  return null;
}
