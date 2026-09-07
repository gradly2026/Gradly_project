// ════════════════════════════════════════════════════════════════════════
// TopEstudiantesCard — cuadro de "estudiantes destacados".
//
// Lee filas ya calculadas (`TopEstudianteEntry`, ver topEstudiantesService):
// nada de consultas aquí. Cada nombre es tocable → abre la vista de perfil
// del estudiante (el padre decide cómo). Con `detallado` muestra, bajo el
// nombre, la empresa / puesto / salario y la universidad (para la Red Gradly).
//
// Quien lo monta ya decidió que el rol del que mira puede ver estos datos
// (empresa / universidad / admin) — este componente no comprueba permisos.
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import type { TopEstudianteEntry } from '../services/topEstudiantesService';
import { AutoText as Text } from './AutoText';
import StorageAvatar from './StorageAvatar';

interface Props {
  titulo: string;
  entries: TopEstudianteEntry[];
  onVerEstudiante: (id: string) => void;
  /** Muestra empresa · puesto · salario y universidad bajo cada nombre. */
  detallado?: boolean;
  /**
   * El cuadro se ve DENTRO del perfil de una empresa: en vez del nombre de la
   * empresa (que sería "esta misma"), la primera línea dice si el estudiante
   * "Trabaja aquí" (contrato) o "Hizo su pasantía aquí" (cupo).
   */
  relacionEmpresa?: boolean;
  /** Estilo extra del contenedor. */
  style?: any;
}

const MEDALLAS = ['🥇', '🥈', '🥉', '4°', '5°'];

export default function TopEstudiantesCard({
  titulo, entries, onVerEstudiante, detallado, relacionEmpresa, style,
}: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  if (!entries || entries.length === 0) return null;

  return (
    <View style={[s.card, style]}>
      <View style={s.header}>
        <Ionicons name="star" size={16} color={colors.gold} />
        <Text style={s.title}>{titulo}</Text>
      </View>
      {entries.map((e, i) => (
        <TouchableOpacity
          key={`${e.id}-${i}`}
          style={s.row}
          activeOpacity={e.id ? 0.7 : 1}
          disabled={!e.id}
          onPress={() => e.id && onVerEstudiante(e.id)}
        >
          <Text style={s.medal} noTranslate>{MEDALLAS[i] ?? `${i + 1}°`}</Text>
          <StorageAvatar url={e.foto} size={34} fallbackIcon="person" />
          <View style={{ flex: 1 }}>
            <Text style={s.nombre} numberOfLines={1} noTranslate>{e.nombre}</Text>
            {relacionEmpresa ? (
              <>
                <Text style={s.subRelacion} numberOfLines={1}>
                  {e.contratado ? 'Trabaja aquí' : 'Hizo su pasantía aquí'}
                </Text>
                {!!(e.puesto || e.salarioTxt) && (
                  <Text style={s.sub} numberOfLines={1} noTranslate>
                    {[e.puesto, e.salarioTxt].filter(Boolean).join(' · ')}
                  </Text>
                )}
                {!!e.universidadNombre && (
                  <Text style={s.sub} numberOfLines={1} noTranslate>{e.universidadNombre}</Text>
                )}
              </>
            ) : detallado ? (
              <>
                {!!(e.empresaNombre || e.puesto) && (
                  <Text style={s.sub} numberOfLines={1} noTranslate>
                    {[e.puesto, e.empresaNombre].filter(Boolean).join(' · ')}
                    {e.salarioTxt ? ` · ${e.salarioTxt}` : ''}
                  </Text>
                )}
                {!!e.universidadNombre && (
                  <Text style={s.sub} numberOfLines={1} noTranslate>{e.universidadNombre}</Text>
                )}
              </>
            ) : (
              !!e.rango && <Text style={s.sub} numberOfLines={1} noTranslate>{e.rango}</Text>
            )}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.stars} noTranslate>★ {(Number(e.stars) || 0).toFixed(1)}</Text>
            {!!e.id && <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />}
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const makeStyles = (COLORS: GradlyColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: COLORS.backgroundCard,
      borderWidth: 1, borderColor: COLORS.border, borderRadius: 16,
      padding: 14, gap: 4,
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
    title: { fontSize: 12.5, fontFamily: FONTS.interSemiBold, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 9, borderTopWidth: 1, borderTopColor: COLORS.border,
    },
    medal: { fontSize: 13, width: 22, textAlign: 'center' },
    nombre: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
    sub: { fontSize: 11.5, fontFamily: FONTS.interRegular, color: COLORS.textMuted, marginTop: 1 },
    subRelacion: { fontSize: 11.5, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight, marginTop: 1 },
    stars: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: COLORS.gold },
  });
