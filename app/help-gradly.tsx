// ════════════════════════════════════════════════════════════════════════
// GUÍA PARA PRINCIPIANTES:
// Pantalla estática de "Ayuda / Contacto" (teléfono, correo, horario de
// atención). No usa Firebase para nada — todo su contenido son textos fijos
// (t('clave')). Es un buen ejemplo simple del patrón `makeStyles(colors)`
// (ver GUIA_03_TEMA_CLARO_OSCURO.md) y de cómo se arma un componente
// pequeño reutilizable DENTRO del mismo archivo (`ContactItem`) para no
// repetir 3 veces el mismo bloque de JSX.
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from '../src/components/AutoText';
import { LiquidBackground } from '../components/ui/liquid-glass/LiquidBackground';
import { GlassCard } from '../components/ui/liquid-glass/GlassCard';
// GlassCard: componente reutilizable que dibuja una "tarjeta" con el
// mismo efecto visual de vidrio esmerilado (glassmorphism) que el resto
// de la app — se usa como contenedor genérico en vez de un <View> simple
// cada vez que se necesita ese estilo de tarjeta.
import { useTheme, FONTS, type GradlyColors } from '../src/context/ThemeContext';
import { useTranslation } from '../src/context/TranslationContext';

function useThemedStyles() {
  // Hook propio (definido aquí mismo, no exportado) que combina
  // useTheme() + el patrón makeStyles(colors) en un solo paso reutilizable
  // dentro de este archivo — así tanto la pantalla principal como el
  // componente ContactItem (más abajo) pueden llamarlo sin repetir la
  // lógica de useMemo cada vez.
  const { colors } = useTheme();
  return useMemo(() => ({ colors, styles: makeStyles(colors) }), [colors]);
}

function ContactItem({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  // "keyof typeof Ionicons.glyphMap" es un tipo calculado: significa "uno
  // de los nombres de ícono VÁLIDOS que existen en la librería Ionicons"
  // — así TypeScript avisaría si se escribiera mal un nombre de ícono.
  label: string;
  value: string;
}) {
  // Componente chico y local: una fila con un ícono redondeado + una
  // etiqueta + un valor (por ejemplo: ícono de teléfono, "Teléfono",
  // "+503 1234-5678"). Se define y se usa SOLO dentro de este archivo
  // (no tiene `export`), porque no hace falta en ningún otro lado del
  // proyecto.
  const { colors, styles } = useThemedStyles();
  return (
    <GlassCard contentStyle={styles.contactCardContent}>
      <View style={[styles.contactIconWrap, { backgroundColor: colors.primary12, borderColor: colors.primary35 }]}>
        <Ionicons name={icon} size={18} color={colors.primaryLight} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.contactLabel}>{label}</Text>
        <Text style={styles.contactValue}>{value}</Text>
      </View>
    </GlassCard>
  );
}

export default function HelpGradlyScreen() {
  const router = useRouter();
  const { styles, colors } = useThemedStyles();
  const { t } = useTranslation();
  const webScrollStyle = Platform.OS === 'web'
    ? ({ scrollbarColor: `${colors.primary35} ${colors.backgroundSurface}`, scrollbarWidth: 'thin' } as any)
    : undefined;
  // Estilo EXTRA que solo aplica en la versión web: personaliza el color
  // y grosor de la barra de scroll del navegador para que combine con el
  // tema (esta propiedad no existe en React Native "puro", solo tiene
  // efecto cuando el proyecto corre como página web — de ahí el
  // "as any" para que TypeScript no se queje de una propiedad que no
  // reconoce en su tipo estándar de estilos).

  return (
    <LiquidBackground>
      <View style={styles.root}>
        <StatusBar style="light" />

        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/(tabs)/perfil' as any);
              // router.canGoBack() pregunta si hay una pantalla anterior en
              // el historial de navegación a la cual volver. Si la hay,
              // vuelve normalmente; si NO la hay (por ejemplo, si el
              // usuario llegó aquí por un link directo, sin haber
              // navegado desde ningún lado dentro de la app), en vez de
              // quedar "atascado", lo manda a una pantalla segura por
              // defecto (el perfil).
            }}
            activeOpacity={0.8}
            // activeOpacity controla cuánto se atenúa visualmente el botón
            // al ser presionado (0.8 = se ve un 80% de su opacidad normal
            // mientras se mantiene presionado) — un efecto sutil de
            // retroalimentación táctil.
          >
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('help_screen_title')}</Text>
        </View>

        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          // Ajuste específico de iOS: deja que el sistema operativo
          // acomode automáticamente el contenido respecto a barras de
          // navegación/estado, sin que se superponga.
          style={[styles.scrollView, webScrollStyle]}
          showsVerticalScrollIndicator
          nestedScrollEnabled
          // Permite que este ScrollView funcione bien incluso si hay otro
          // elemento con scroll anidado adentro (no es el caso aquí, pero
          // es una configuración defensiva común).
          keyboardShouldPersistTaps="handled"
          // Controla qué pasa si el usuario toca un botón mientras el
          // teclado está abierto: "handled" hace que el toque SÍ se
          // procese normalmente (en vez de que el primer toque solo sirva
          // para cerrar el teclado).
          contentContainerStyle={[styles.scroll, { flexGrow: 1 }]}
        >
          <GlassCard contentStyle={styles.heroCard}>
            <View style={styles.heroBadge}>
              <Ionicons name="help-circle-outline" size={18} color={colors.primaryLight} />
              <Text style={styles.heroBadgeText}>Gradly</Text>
              {/* "Gradly" se escribe literal, sin t() ni AutoText — es el
                  nombre propio de la marca, nunca debe traducirse. */}
            </View>
            <Text style={styles.sectionTitle}>{t('help_screen_contact_title')}</Text>
            <Text style={styles.paragraph}>{t('help_screen_intro')}</Text>
          </GlassCard>

          <View style={styles.contactsSection}>
            {/* Se reutiliza el componente ContactItem 3 veces, con
                distintos íconos y distintas claves de traducción — así se
                evita repetir la misma estructura visual (GlassCard +
                ícono + etiqueta + valor) 3 veces a mano. */}
            <ContactItem
              icon="call-outline"
              label={t('help_screen_phone_label')}
              value={t('help_screen_phone_value')}
            />
            <ContactItem
              icon="mail-outline"
              label={t('help_screen_email_label')}
              value={t('help_screen_email_value')}
            />
            <ContactItem
              icon="time-outline"
              label={t('help_screen_hours_label')}
              value={t('help_screen_hours_value')}
            />
          </View>
        </ScrollView>
      </View>
    </LiquidBackground>
  );
}

// makeStyles(colors) — patrón explicado a fondo en GUIA_03_TEMA_CLARO_OSCURO.md:
// una función que arma el StyleSheet usando la paleta de color ACTIVA,
// para que la pantalla reaccione al tema claro/oscuro.
const makeStyles = (COLORS: GradlyColors) =>
  StyleSheet.create({
    root: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingTop: 56,          // deja espacio para la barra de estado del sistema
      paddingHorizontal: 16,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: COLORS.white8,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    headerTitle: {
      fontSize: 22,
      fontFamily: FONTS.soraBold,
      color: COLORS.textPrimary,
    },
    scroll: {
      padding: 16,
      paddingBottom: 120,      // espacio extra al final para no tapar el último elemento
      gap: 16,
    },
    scrollView: {
      flex: 1,
      minHeight: 0,            // truco de layout: evita que el ScrollView "empuje" de más
                                 // su contenedor padre en ciertos casos de flexbox anidado
    },
    heroCard: {
      padding: 20,
      gap: 14,
    },
    heroBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',  // el badge no se estira, solo ocupa su ancho natural
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,        // número muy alto → esquinas totalmente redondeadas (píldora)
      backgroundColor: COLORS.primary12,
      borderWidth: 1,
      borderColor: COLORS.primary35,
    },
    heroBadgeText: {
      fontSize: 13,
      fontFamily: FONTS.interSemiBold,
      color: COLORS.primaryLight,
    },
    sectionTitle: {
      fontSize: 20,
      fontFamily: FONTS.soraSemiBold,
      color: COLORS.textPrimary,
    },
    paragraph: {
      fontSize: 14,
      lineHeight: 23,
      fontFamily: FONTS.interRegular,
      color: COLORS.textMuted,
    },
    contactsSection: {
      gap: 12,
    },
    contactCardContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 16,
    },
    contactIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    contactLabel: {
      fontSize: 12,
      fontFamily: FONTS.interMedium,
      color: COLORS.textMuted,
      marginBottom: 4,
    },
    contactValue: {
      fontSize: 15,
      fontFamily: FONTS.interSemiBold,
      color: COLORS.textPrimary,
    },
  });
