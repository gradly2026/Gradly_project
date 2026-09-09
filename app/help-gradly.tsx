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
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from '../src/components/AutoText';
import { db } from '../src/config/firebaseConfig';
import { LiquidBackground } from '../components/ui/liquid-glass/LiquidBackground';
import { GlassCard } from '../components/ui/liquid-glass/GlassCard';
import { useAuth } from '../src/context/AuthContext';
import SoporteTicketModal from '../src/components/SoporteTicketModal';
import {
  labelCategoriaSoporte,
  suscribirMisTickets,
  type TicketSoporte,
} from '../src/services/soporteService';
// GlassCard: componente reutilizable que dibuja una "tarjeta" con el
// mismo efecto visual de vidrio esmerilado (glassmorphism) que el resto
// de la app — se usa como contenedor genérico en vez de un <View> simple
// cada vez que se necesita ese estilo de tarjeta.
import { useTheme, FONTS, webScrollStyle, type GradlyColors } from '../src/context/ThemeContext';
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

/**
 * Contacto de soporte. Los valores por defecto viven en i18n
 * (`help_screen_*_value`), pero el admin los puede sobrescribir desde
 * "Config → Contacto de soporte" (doc `config/soporte`, campos
 * `telefono` / `correo` / `horario`). Lectura para cualquier usuario
 * autenticado; escritura solo admin (regla `match /config/{docId}`).
 */
function useSoporte() {
  const [soporte, setSoporte] = useState<{ telefono?: string; correo?: string; horario?: string }>({});
  useEffect(() => {
    let cancel = false;
    getDoc(doc(db, 'config', 'soporte'))
      .then((s) => { if (!cancel && s.exists()) setSoporte(s.data() as any); })
      .catch(() => {});
    return () => { cancel = true; };
  }, []);
  return soporte;
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
        {/* Dato de contacto: se muestra tal cual, sin pasar por el traductor. */}
        <Text style={styles.contactValue} noTranslate>{value}</Text>
      </View>
    </GlassCard>
  );
}

export default function HelpGradlyScreen() {
  const router = useRouter();
  const { styles, colors } = useThemedStyles();
  const { t } = useTranslation();
  const soporte = useSoporte();
  const { user, rol } = useAuth();

  // ── Mensajes de soporte (tickets 1-a-1 con el equipo de Gradly) ──────
  const puedeSoporte =
    !!user?.uid && (rol === 'estudiante' || rol === 'empresa' || rol === 'universidad');
  const [misTickets, setMisTickets] = useState<TicketSoporte[]>([]);
  const [crearOpen, setCrearOpen] = useState(false);
  const [verTicketId, setVerTicketId] = useState<string | null>(null);

  useEffect(() => {
    if (!puedeSoporte || !user?.uid) {
      setMisTickets([]);
      return;
    }
    const unsub = suscribirMisTickets(user.uid, setMisTickets, () => setMisTickets([]));
    return () => unsub();
  }, [puedeSoporte, user?.uid]);
  // Scroll delgado morado: mismo helper compartido que usa "Mi Perfil"
  // (ver `webScrollStyle` en ThemeContext.tsx), no una copia propia.
  const scrollStyle = webScrollStyle(colors);

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
          style={[styles.scrollView, scrollStyle]}
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
              value={soporte.telefono?.trim() || t('help_screen_phone_value')}
            />
            <ContactItem
              icon="mail-outline"
              label={t('help_screen_email_label')}
              value={soporte.correo?.trim() || t('help_screen_email_value')}
            />
            <ContactItem
              icon="time-outline"
              label={t('help_screen_hours_label')}
              value={soporte.horario?.trim() || t('help_screen_hours_value')}
            />
          </View>

          {/* ── Mensajes de soporte 1-a-1 con el equipo de Gradly ── */}
          {puedeSoporte && (
            <GlassCard contentStyle={styles.soporteCard}>
              <View style={styles.soporteHeadRow}>
                <Ionicons name="chatbubbles-outline" size={18} color={colors.primaryLight} />
                <Text style={styles.soporteTitle}>Enviar un mensaje al equipo</Text>
              </View>
              <Text style={styles.paragraph}>
                ¿Tienes un problema con tu cuenta, una pasantía o algo que no funciona? Escríbenos
                y te respondemos por aquí mismo.
              </Text>
              <TouchableOpacity
                style={[styles.soporteBtn, { backgroundColor: colors.primary }]}
                onPress={() => setCrearOpen(true)}
                activeOpacity={0.9}
              >
                <Ionicons name="add-circle-outline" size={18} color="#fff" />
                <Text style={styles.soporteBtnText}>Nuevo mensaje de soporte</Text>
              </TouchableOpacity>

              {misTickets.length > 0 && (
                <View style={styles.ticketList}>
                  <Text style={styles.ticketListLabel}>Mis mensajes</Text>
                  {misTickets.map((tk) => {
                    const ultimo = tk.mensajes?.[tk.mensajes.length - 1];
                    const cerrado = tk.estado === 'resuelto';
                    return (
                      <TouchableOpacity
                        key={tk.id}
                        style={[styles.ticketRow, { borderColor: colors.border }]}
                        activeOpacity={0.85}
                        onPress={() => setVerTicketId(tk.id)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.ticketCat} noTranslate>
                            {labelCategoriaSoporte(tk.categoria)}
                          </Text>
                          {!!ultimo?.texto && (
                            <Text style={styles.ticketSnippet} numberOfLines={1} noTranslate>
                              {ultimo.autor === 'admin' ? 'Gradly: ' : ''}
                              {ultimo.texto}
                            </Text>
                          )}
                        </View>
                        {tk.noLeidoUsuario && !cerrado ? (
                          <View style={[styles.ticketDot, { backgroundColor: colors.primary }]} />
                        ) : null}
                        <View
                          style={[
                            styles.ticketPill,
                            {
                              backgroundColor:
                                (cerrado ? colors.success : colors.warning) + '22',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.ticketPillText,
                              { color: cerrado ? colors.success : colors.warning },
                            ]}
                            noTranslate
                          >
                            {cerrado ? 'Resuelto' : 'Abierto'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </GlassCard>
          )}
        </ScrollView>

        <SoporteTicketModal
          visible={crearOpen}
          onClose={() => setCrearOpen(false)}
          onCreado={(id) => {
            setCrearOpen(false);
            setVerTicketId(id);
          }}
        />
        <SoporteTicketModal
          visible={!!verTicketId}
          ticketId={verTicketId}
          marcarLeidoAlAbrir
          onClose={() => setVerTicketId(null)}
        />
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
    soporteCard: {
      padding: 18,
      gap: 12,
    },
    soporteHeadRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    soporteTitle: {
      flex: 1,
      fontSize: 16,
      fontFamily: FONTS.soraSemiBold,
      color: COLORS.textPrimary,
    },
    soporteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 14,
      paddingVertical: 13,
    },
    soporteBtnText: {
      fontSize: 14,
      fontFamily: FONTS.interSemiBold,
      color: '#fff',
    },
    ticketList: {
      gap: 8,
      marginTop: 4,
    },
    ticketListLabel: {
      fontSize: 12,
      fontFamily: FONTS.interSemiBold,
      color: COLORS.textSecondary,
    },
    ticketRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    ticketCat: {
      fontSize: 13,
      fontFamily: FONTS.interSemiBold,
      color: COLORS.textPrimary,
    },
    ticketSnippet: {
      fontSize: 12,
      fontFamily: FONTS.interRegular,
      color: COLORS.textMuted,
      marginTop: 2,
    },
    ticketDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    ticketPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    ticketPillText: {
      fontSize: 10,
      fontFamily: FONTS.interSemiBold,
    },
  });
