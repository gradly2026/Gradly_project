import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { textoHorario } from '../data/disponibilidad';
import { cuposLibresEnReclamo } from '../utils/cupos';
import {
  getAvisoFinalizacionEstudiante,
  getAvisosCuposEstudiante,
  getAvisosFinalizacionEmpresa,
  getAvisosFinalizacionUniversidad,
  getAvisosInscripcionesEmpresa,
  getAvisosInscripcionesUniversidad,
  getAvisosReclamosEmpresa,
  marcarCuposAvisadosEstudiante,
  marcarFinalizacionAvisadaEstudiante,
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
  const [finalizadas, setFinalizadas] = useState<AsignacionCupo[]>([]);
  const [finCerrado, setFinCerrado] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setReclamos([]); setIndice(0); setInscripciones([]); setInscCerrado(false);
      setFinalizadas([]); setFinCerrado(false);
      return;
    }
    let cancelado = false;
    setInscCerrado(false); setFinCerrado(false);
    (async () => {
      try {
        const [avisos, insc, fin] = await Promise.all([
          getAvisosReclamosEmpresa(user.uid),
          getAvisosInscripcionesEmpresa(user.uid),
          getAvisosFinalizacionEmpresa(user.uid),
        ]);
        if (!cancelado) { setReclamos(avisos); setIndice(0); setInscripciones(insc); setFinalizadas(fin); }
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

  if (!finCerrado && finalizadas.length > 0) {
    return (
      <AvisoListaModal
        icon="checkmark-done-circle-outline"
        titulo="Estudiantes que culminaron su pasantía"
        subtitulo="Estos estudiantes cumplieron todas sus horas de práctica."
        items={finalizadas.map(a => inscripcionAItem(a, 'empresa'))}
        onCerrar={() => {
          if (user?.uid) {
            void marcarInscripcionesAvisadas(user.uid, 'perfiles_empresas', finalizadas.map(a => a.id), 'finalizado').catch(() => {});
          }
          setFinCerrado(true);
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
  const [finalizadas, setFinalizadas] = useState<AsignacionCupo[]>([]);
  const [finCerrado, setFinCerrado] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setInscripciones([]); setCerrado(false); setFinalizadas([]); setFinCerrado(false);
      return;
    }
    let cancelado = false;
    setCerrado(false); setFinCerrado(false);
    (async () => {
      try {
        const [insc, fin] = await Promise.all([
          getAvisosInscripcionesUniversidad(user.uid),
          getAvisosFinalizacionUniversidad(user.uid),
        ]);
        if (!cancelado) { setInscripciones(insc); setFinalizadas(fin); }
      } catch (error) {
        console.warn('Error detectando inscripciones (universidad):', error);
      }
    })();
    return () => { cancelado = true; };
  }, [user?.uid]);

  if (!cerrado && inscripciones.length > 0) {
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

  if (!finCerrado && finalizadas.length > 0) {
    return (
      <AvisoListaModal
        icon="checkmark-done-circle-outline"
        titulo="Estudiantes que culminaron su pasantía"
        subtitulo="Estos estudiantes cumplieron todas sus horas de práctica."
        items={finalizadas.map(a => inscripcionAItem(a, 'universidad'))}
        onCerrar={() => {
          if (user?.uid) {
            void marcarInscripcionesAvisadas(user.uid, 'perfiles_universidades', finalizadas.map(a => a.id), 'finalizado').catch(() => {});
          }
          setFinCerrado(true);
        }}
      />
    );
  }

  return null;
}

// ─────────────────────────────────────────────
// ESTUDIANTE — cupos que su universidad le reservó (lista)
// ─────────────────────────────────────────────
function AvisosEstudiante() {
  const { user } = useAuth();
  const [reclamos, setReclamos] = useState<ReclamoCupos[]>([]);
  const [cerrado, setCerrado] = useState(false);
  const [finalizada, setFinalizada] = useState<AsignacionCupo | null>(null);
  const [finCerrado, setFinCerrado] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setReclamos([]); setCerrado(false); setFinalizada(null); setFinCerrado(false);
      return;
    }
    let cancelado = false;
    setCerrado(false); setFinCerrado(false);
    (async () => {
      try {
        const [pendientes, fin] = await Promise.all([
          getAvisosCuposEstudiante(user.uid),
          getAvisoFinalizacionEstudiante(user.uid),
        ]);
        if (!cancelado) { setReclamos(pendientes); setFinalizada(fin); }
      } catch (error) {
        console.warn('Error detectando avisos de cupos (estudiante):', error);
      }
    })();
    return () => { cancelado = true; };
  }, [user?.uid]);

  if (!finCerrado && finalizada) {
    return (
      <AvisoListaModal
        icon="checkmark-done-circle-outline"
        titulo="¡Culminaste tu pasantía!"
        subtitulo="Cumpliste todas tus horas de práctica. Tu universidad y la empresa ya fueron notificadas."
        items={[{
          id: finalizada.id,
          primary: finalizada.empresaNombre || 'Empresa',
          secondary: finalizada.vacanteTitulo || 'Pasantía',
          meta: textoHorario(finalizada.horario) || undefined,
        }]}
        onCerrar={() => {
          if (user?.uid) {
            void marcarFinalizacionAvisadaEstudiante(user.uid, [finalizada.id]).catch(() => {});
          }
          setFinCerrado(true);
        }}
      />
    );
  }

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
