import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { textoHorario } from '../data/disponibilidad';
import { cuposLibresEnReclamo } from '../utils/cupos';
import {
  getAvisosCuposEstudiante,
  getAvisosInscripcionesEmpresa,
  getAvisosInscripcionesUniversidad,
  getAvisosReclamosEmpresa,
  marcarCuposAvisadosEstudiante,
  marcarInscripcionesAvisadas,
  marcarReclamoVistoEmpresa,
  responderReclamo,
  type AsignacionCupo,
  type AvisoReclamoEmpresa,
  type ReclamoCupos,
} from '../services/reclamoCuposService';
import { showAlert } from './AppAlert';
import AvisoListaModal, { type AvisoItem } from './AvisoListaModal';
import ReclamoDetailModal from './ReclamoDetailModal';

/**
 * Compuerta de avisos al iniciar sesión. Mismo patrón que `FeedbackGate` /
 * `ModeracionVacanteGate` (una lectura al montar, no un listener). Despacha
 * según el rol:
 *   · empresa     → reservas de cupos por confirmar/informativas + inscripciones nuevas.
 *   · universidad → inscripciones nuevas de sus estudiantes.
 *   · estudiante  → cupos que su universidad le reservó, para dar por enterado.
 *
 * Montada en `app/(tabs)/_layout.tsx` (estudiante) y en `dashboard-empresa.tsx`
 * / `dashboard-universidad.tsx`.
 */
export default function AvisosGate() {
  const { rol } = useAuth();
  if (rol === 'empresa') return <AvisosEmpresa />;
  if (rol === 'universidad') return <AvisosUniversidad />;
  if (rol === 'estudiante') return <AvisosEstudiante />;
  return null;
}

/** Una inscripción (`asignaciones_cupo` tomado) como fila de `AvisoListaModal`. */
function inscripcionAItem(a: AsignacionCupo, audiencia: 'universidad' | 'empresa'): AvisoItem {
  const nombre = a.estudianteNombre || 'Un estudiante';
  const vacante = a.vacanteTitulo || 'Práctica';
  if (audiencia === 'universidad') {
    // El nombre de la empresa va en `secondary` (que NO se traduce) para no
    // pasar un nombre propio por el traductor.
    return {
      id: a.id,
      primary: nombre,
      secondary: a.empresaNombre ? `${vacante} · ${a.empresaNombre}` : vacante,
    };
  }
  return {
    id: a.id,
    primary: nombre,
    secondary: vacante,
    meta: textoHorario(a.horario) || undefined,
  };
}

// ─────────────────────────────────────────────
// EMPRESA — reservas de cupos (cola) y luego inscripciones nuevas (lista)
// ─────────────────────────────────────────────
function AvisosEmpresa() {
  const { user } = useAuth();
  const [reclamos, setReclamos] = useState<AvisoReclamoEmpresa[]>([]);
  const [indice, setIndice] = useState(0);
  const [inscripciones, setInscripciones] = useState<AsignacionCupo[]>([]);
  const [inscCerrado, setInscCerrado] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setReclamos([]); setIndice(0); setInscripciones([]); setInscCerrado(false);
      return;
    }
    let cancelado = false;
    setInscCerrado(false);
    (async () => {
      try {
        const [avisos, insc] = await Promise.all([
          getAvisosReclamosEmpresa(user.uid),
          getAvisosInscripcionesEmpresa(user.uid),
        ]);
        if (!cancelado) { setReclamos(avisos); setIndice(0); setInscripciones(insc); }
      } catch (error) {
        console.warn('Error detectando avisos (empresa):', error);
      }
    })();
    return () => { cancelado = true; };
  }, [user?.uid]);

  const actual = reclamos[indice];
  // Se difiere un tick por la misma razón que en ModeracionVacanteGate:
  // `setIndice` desmonta el <Modal> por completo y hacerlo en el mismo clic
  // choca con la limpieza del portal de react-native-web.
  const avanzar = () => setTimeout(() => setIndice(i => i + 1), 0);

  // 1º la cola de reservas por confirmar; cuando se agota, la lista de inscripciones.
  if (actual) {
    return (
      <ReclamoDetailModal
        key={actual.reclamoId}
        visible
        reclamoId={actual.reclamoId}
        soloInformativo={actual.modo === 'info'}
        onResponder={
          actual.modo === 'accion'
            ? async (decision, motivo) => {
                try {
                  await responderReclamo(actual.reclamoId, decision, motivo);
                  showAlert(
                    decision === 'aceptar' ? 'Reserva confirmada' : 'Reserva rechazada',
                    decision === 'aceptar'
                      ? 'La universidad ya puede asignar estos cupos a sus estudiantes.'
                      : 'Se avisó a la universidad con tu motivo.',
                  );
                } catch (e: any) {
                  showAlert('No se pudo procesar', e?.message ?? 'Intenta de nuevo desde tus solicitudes de cupos.');
                } finally {
                  avanzar();
                }
              }
            : undefined
        }
        onClose={() => {
          if (actual.modo === 'info') {
            void marcarReclamoVistoEmpresa(actual.reclamoId).catch(() => {});
          }
          avanzar();
        }}
      />
    );
  }

  if (!inscCerrado && inscripciones.length > 0) {
    return (
      <AvisoListaModal
        icon="person-add-outline"
        titulo="Nuevos estudiantes en tus pasantías"
        subtitulo="Estos estudiantes tomaron un cupo de tus vacantes. Ya cuentan como parte de tu pasantía."
        items={inscripciones.map(a => inscripcionAItem(a, 'empresa'))}
        onCerrar={() => {
          if (user?.uid) {
            void marcarInscripcionesAvisadas(user.uid, 'perfiles_empresas', inscripciones.map(a => a.id)).catch(() => {});
          }
          setInscCerrado(true);
        }}
      />
    );
  }

  return null;
}

// ─────────────────────────────────────────────
// UNIVERSIDAD — inscripciones nuevas de sus estudiantes (lista)
// ─────────────────────────────────────────────
function AvisosUniversidad() {
  const { user } = useAuth();
  const [inscripciones, setInscripciones] = useState<AsignacionCupo[]>([]);
  const [cerrado, setCerrado] = useState(false);

  useEffect(() => {
    if (!user?.uid) { setInscripciones([]); setCerrado(false); return; }
    let cancelado = false;
    setCerrado(false);
    (async () => {
      try {
        const insc = await getAvisosInscripcionesUniversidad(user.uid);
        if (!cancelado) setInscripciones(insc);
      } catch (error) {
        console.warn('Error detectando inscripciones (universidad):', error);
      }
    })();
    return () => { cancelado = true; };
  }, [user?.uid]);

  if (cerrado || inscripciones.length === 0) return null;

  return (
    <AvisoListaModal
      icon="person-add-outline"
      titulo="Tus estudiantes se inscribieron"
      subtitulo="Estos estudiantes tomaron un cupo que reservaste. Ya están oficialmente en una pasantía."
      items={inscripciones.map(a => inscripcionAItem(a, 'universidad'))}
      onCerrar={() => {
        if (user?.uid) {
          void marcarInscripcionesAvisadas(user.uid, 'perfiles_universidades', inscripciones.map(a => a.id)).catch(() => {});
        }
        setCerrado(true);
      }}
    />
  );
}

// ─────────────────────────────────────────────
// ESTUDIANTE — cupos que su universidad le reservó (lista)
// ─────────────────────────────────────────────
function AvisosEstudiante() {
  const { user } = useAuth();
  const [reclamos, setReclamos] = useState<ReclamoCupos[]>([]);
  const [cerrado, setCerrado] = useState(false);

  useEffect(() => {
    if (!user?.uid) { setReclamos([]); setCerrado(false); return; }
    let cancelado = false;
    setCerrado(false);
    (async () => {
      try {
        const pendientes = await getAvisosCuposEstudiante(user.uid);
        if (!cancelado) setReclamos(pendientes);
      } catch (error) {
        console.warn('Error detectando avisos de cupos (estudiante):', error);
      }
    })();
    return () => { cancelado = true; };
  }, [user?.uid]);

  if (cerrado || reclamos.length === 0) return null;

  return (
    <AvisoListaModal
      icon="ticket-outline"
      titulo="Tu universidad te reservó cupos"
      subtitulo="Reservó estas plazas para tu grupo. Elige una desde tu tablero antes de que venza el plazo; si no eliges, el cupo pasa a otro compañero."
      items={reclamos.map(r => ({
        id: r.id,
        primary: r.empresaNombre || 'Empresa',
        secondary: r.vacanteTitulo || 'Práctica',
        meta: textoHorario(r.horario) || undefined,
        highlight: cuposLibresEnReclamo(r) === 1 ? 'Queda 1 cupo' : `Quedan ${cuposLibresEnReclamo(r)} cupos`,
      }))}
      onCerrar={() => {
        if (user?.uid) {
          void marcarCuposAvisadosEstudiante(user.uid, reclamos.map(r => r.id)).catch(() => {});
        }
        setCerrado(true);
      }}
    />
  );
}
