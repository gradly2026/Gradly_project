// ════════════════════════════════════════════════════════════════════════
// HistorialPuestos.tsx — lista de puestos de trabajo (empleo real) que un
// estudiante tuvo, o de contrataciones que una empresa hizo, y cómo terminó
// cada una (renuncia / despido).
//
//   · propio = true  → el dueño ve su historial COMPLETO (con el motivo real
//     del despido). Fuente: getHistorialPropio (contratos_laborales).
//   · propio = false → un tercero ve la versión pública (sin motivo de
//     despido). Fuente: getHistorialPublico (historial_laboral_publico).
//
// Se usa en "Mi perfil" (PerfilMasterDetail) y en el perfil público
// (ProfileViewerModal).
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import {
  getHistorialPropio,
  getHistorialPublico,
  type EntradaHistorial,
  type RolHistorial,
} from '../services/historialLaboralService';

interface Props {
  rol: RolHistorial;
  id: string;
  /** true = es MI perfil → historial completo con motivos. */
  propio: boolean;
}

const fmtFecha = (d: Date | null) =>
  d ? d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '—';

export default function HistorialPuestos({ rol, id, propio }: Props) {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const [items, setItems] = useState<EntradaHistorial[] | null>(null);

  useEffect(() => {
    let cancel = false;
    setItems(null);
    (propio ? getHistorialPropio(rol, id) : getHistorialPublico(rol, id))
      .then((r) => { if (!cancel) setItems(r); })
      .catch(() => { if (!cancel) setItems([]); });
    return () => { cancel = true; };
  }, [rol, id, propio]);

  if (items === null) {
    return (
      <View style={{ paddingVertical: 18, alignItems: 'center' }}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <Text style={s.vacio}>
        {rol === 'estudiante'
          ? 'Todavía no hay puestos de trabajo anteriores.'
          : 'Todavía no hay contrataciones anteriores.'}
      </Text>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {items.map((e) => {
        const despido = e.estado === 'despido';
        const col = despido ? colors.error : colors.warning;
        const etiqueta =
          e.finPor === 'estudiante' ? 'Renunció' : 'Contrato terminado por la empresa';
        return (
          <View key={e.contratoId} style={s.card}>
            <View style={s.top}>
              <Text style={s.contraparte} numberOfLines={1} noTranslate>
                {e.contraparteNombre || (rol === 'estudiante' ? 'Empresa' : 'Estudiante')}
              </Text>
              <View style={[s.badge, { backgroundColor: col + '22' }]}>
                <Ionicons
                  name={despido ? 'close-circle' : 'exit-outline'}
                  size={11}
                  color={col}
                />
                <Text style={[s.badgeTxt, { color: col }]}>{etiqueta}</Text>
              </View>
            </View>
            {!!e.puesto && <Text style={s.puesto} noTranslate>{e.puesto}</Text>}
            <Text style={s.periodo} noTranslate>
              {`${fmtFecha(e.fechaInicio)} — ${fmtFecha(e.fechaFin)}`}
            </Text>
            {e.motivo ? (
              <View style={{ marginTop: 2 }}>
                <Text style={s.motivoLabel}>Motivo</Text>
                <Text style={s.motivo} noTranslate>{e.motivo}</Text>
              </View>
            ) : e.motivoOculto ? (
              <Text style={s.motivoOculto}>
                {propio
                  ? 'Sin motivo registrado.'
                  : 'El motivo solo lo ven la persona y la empresa involucradas.'}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (c: GradlyColors) =>
  StyleSheet.create({
    vacio: {
      fontSize: 12.5,
      fontFamily: FONTS.interRegular,
      color: c.textMuted,
      fontStyle: 'italic',
      paddingVertical: 6,
    },
    card: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.backgroundCard,
      borderRadius: 12,
      padding: 12,
      gap: 4,
    },
    top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    contraparte: { flex: 1, fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: c.textPrimary },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    badgeTxt: { fontSize: 10, fontFamily: FONTS.interSemiBold },
    puesto: { fontSize: 12.5, fontFamily: FONTS.interRegular, color: c.textSecondary },
    periodo: { fontSize: 11.5, fontFamily: FONTS.interRegular, color: c.textMuted },
    motivoLabel: { fontSize: 10, fontFamily: FONTS.interSemiBold, color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
    motivo: { fontSize: 12, fontFamily: FONTS.interRegular, color: c.textPrimary, marginTop: 1, lineHeight: 17 },
    motivoOculto: { fontSize: 11.5, fontFamily: FONTS.interRegular, color: c.textMuted, fontStyle: 'italic', marginTop: 2 },
  });
