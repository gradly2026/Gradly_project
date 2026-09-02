import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';

export interface AvisoItem {
  id: string;
  /** Línea principal (nombre de empresa, nombre del estudiante...). */
  primary: string;
  /** Segunda línea (título de la vacante...). */
  secondary?: string;
  /** Línea gris pequeña (horario...). */
  meta?: string;
  /** Línea destacada en color primario ("Quedan 3 cupos", "Empresa: X"...). */
  highlight?: string;
}

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  titulo: string;
  subtitulo: string;
  items: AvisoItem[];
  onCerrar: () => void;
  /** Acción primaria opcional (p. ej. "Calificar ahora"). Si se pasa, se
   *  dibuja como botón principal y "Entendido" pasa a enlace secundario. */
  accionLabel?: string;
  onAccion?: () => void;
  /** Si se pasa, cada fila es tocable y llama a esto con el id del item
   *  (selector). En ese modo el pie muestra solo "Entendido". */
  onItemPress?: (id: string) => void;
}

/**
 * Modal genérico de "aviso con lista" al iniciar sesión: ícono + título +
 * subtítulo + lista desplazable de tarjetas + botón "Entendido". Un solo modal
 * (no una cola). Lo usan varias ramas de `AvisosGate` (cupos reservados para el
 * estudiante, inscripciones nuevas para universidad/empresa) para no repetir la
 * misma maqueta tres veces.
 */
export default function AvisoListaModal({ icon, titulo, subtitulo, items, onCerrar, accionLabel, onAccion, onItemPress }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const contenido = (it: AvisoItem) => (
    <>
      {/* primary/secondary son nombres propios (empresa, estudiante) o
          títulos escritos por la empresa: no se traducen. */}
      <Text style={s.itemPrimary} numberOfLines={1} noTranslate>{it.primary}</Text>
      {!!it.secondary && <Text style={s.itemSecondary} numberOfLines={1} noTranslate>{it.secondary}</Text>}
      {!!it.meta && <Text style={s.itemMeta} numberOfLines={1}>{it.meta}</Text>}
      {!!it.highlight && <Text style={s.itemHighlight}>{it.highlight}</Text>}
    </>
  );

  return (
    <Modal visible transparent animationType="none" onRequestClose={onCerrar}>
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.iconWrap}>
            <Ionicons name={icon} size={26} color={colors.primaryLight} />
          </View>

          <Text style={s.titulo}>{titulo}</Text>
          <Text style={s.subtitulo}>{subtitulo}</Text>

          <ScrollView style={s.lista} contentContainerStyle={{ gap: 10 }} showsVerticalScrollIndicator={false}>
            {items.map(it =>
              onItemPress ? (
                <TouchableOpacity key={it.id} style={[s.item, s.itemTappable]} onPress={() => onItemPress(it.id)} activeOpacity={0.7}>
                  <View style={{ flex: 1 }}>{contenido(it)}</View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              ) : (
                <View key={it.id} style={s.item}>{contenido(it)}</View>
              ),
            )}
          </ScrollView>

          {onItemPress ? (
            <TouchableOpacity style={s.btnLink} onPress={onCerrar} activeOpacity={0.7}>
              <Text style={s.btnLinkText}>Entendido</Text>
            </TouchableOpacity>
          ) : accionLabel && onAccion ? (
            <>
              <TouchableOpacity style={s.btn} onPress={onAccion} activeOpacity={0.85}>
                <Text style={s.btnText}>{accionLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnLink} onPress={onCerrar} activeOpacity={0.7}>
                <Text style={s.btnLinkText}>Entendido</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={s.btn} onPress={onCerrar} activeOpacity={0.85}>
              <Text style={s.btnText}>Entendido</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (COLORS: GradlyColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1, backgroundColor: 'rgba(7,5,15,0.75)',
      justifyContent: 'center', alignItems: 'center', padding: 22,
    },
    card: {
      width: '100%', maxWidth: 400,
      backgroundColor: COLORS.backgroundCard,
      borderRadius: 24, borderWidth: 1, borderColor: COLORS.border,
      padding: 24, alignItems: 'center',
    },
    iconWrap: {
      width: 54, height: 54, borderRadius: 27,
      backgroundColor: COLORS.primary12,
      alignItems: 'center', justifyContent: 'center', marginBottom: 14,
    },
    titulo: { fontSize: 18, fontFamily: FONTS.soraBold, color: COLORS.textPrimary, textAlign: 'center' },
    subtitulo: {
      fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textSecondary,
      textAlign: 'center', marginTop: 10, lineHeight: 19,
    },
    lista: { width: '100%', maxHeight: 280, marginTop: 16 },
    item: {
      backgroundColor: COLORS.backgroundSurface,
      borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
      padding: 13,
    },
    itemTappable: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    itemPrimary: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
    itemSecondary: { fontSize: 12.5, fontFamily: FONTS.interRegular, color: COLORS.textMuted, marginTop: 2 },
    itemMeta: { fontSize: 11.5, fontFamily: FONTS.interRegular, color: COLORS.textMuted, marginTop: 4 },
    itemHighlight: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight, marginTop: 6 },
    btn: {
      marginTop: 20, width: '100%', backgroundColor: COLORS.primary,
      borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    },
    btnText: { color: '#fff', fontFamily: FONTS.interSemiBold, fontSize: 14.5 },
    btnLink: { marginTop: 10, paddingVertical: 6, alignItems: 'center' },
    btnLinkText: { color: COLORS.textMuted, fontFamily: FONTS.interSemiBold, fontSize: 13 },
  });
