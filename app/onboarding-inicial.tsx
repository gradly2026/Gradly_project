// ════════════════════════════════════════════════════════════════════════
// app/onboarding-inicial.tsx — CARRUSEL DE BIENVENIDA (solo nativo, solo
// la primera vez que se abre la app en el dispositivo)
//
// GUÍA PARA PRINCIPIANTES:
// Implementación real del boceto aprobado (artifact HTML interactivo).
// 5 diapositivas dentro de un ScrollView horizontal con `pagingEnabled`:
//   0. Idioma + tema — aplica y guarda de inmediato con las MISMAS
//      funciones que ya usan los botones existentes de la app
//      (setLanguage/setTheme de sus contextos, ver más abajo).
//   1. Elegir "cómo vas a usar Gradly" (Estudiante/Empresa/Universidad)
//      — SOLO cambia qué contenido se muestra en las diapositivas 2-4,
//      no crea ninguna cuenta ni reemplaza el registro real.
//   2-4. Contenido informativo por rol, con foto real en la 2 y la 4.
// Al terminar (o tocar "Omitir"), marca la bandera de
// onboardingInicialService.ts y navega a /auth/iniciosesion — de ahí en
// adelante, abrir la app va directo al login (ver app/index.tsx).
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useRef, useState } from "react";
import {
  Image,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LiquidBackground } from "../components/ui/liquid-glass/LiquidBackground";
import { AutoText as Text } from "../src/components/AutoText";
import { FONTS, useTheme, type GradlyColors } from "../src/context/ThemeContext";
import { useTranslation } from "../src/context/TranslationContext";
import { marcarOnboardingInicialVisto } from "../src/services/onboardingInicialService";

type Rol = "estudiante" | "empresa" | "universidad";
type IconName = keyof typeof Ionicons.glyphMap;

const TOTAL_SLIDES = 5;

const ROLES: { key: Rol; icon: IconName }[] = [
  { key: "estudiante", icon: "person-outline" },
  { key: "empresa", icon: "briefcase-outline" },
  { key: "universidad", icon: "school-outline" },
];
// Mismos íconos/roles que el boceto aprobado (persona / maletín / birrete).
const ROL_LABEL: Record<Rol, string> = {
  estudiante: "Estudiante",
  empresa: "Empresa",
  universidad: "Universidad",
};

// Fotos reales (Unsplash, licencia gratuita) — las mismas 6 ya aprobadas
// en el boceto, con crédito visible como cortesía (la licencia no lo exige).
type Credito = { nombre: string; url: string };
type ItemContenido = { titulo: string; sub: string; foto?: string; credito?: Credito };

const CONTENIDO: Record<Rol, ItemContenido[]> = {
  estudiante: [
    {
      titulo: "Pasantías reales, sin depender de contactos",
      sub: "Tu universidad te asigna un cupo de pasantía, o aplicás directo a una pasantía — todo desde la app.",
      foto: "https://images.unsplash.com/photo-1521791136064-7986c2920216?w=900&q=80",
      credito: { nombre: "Cytonn Photography", url: "https://unsplash.com/photos/n95VMLxqM2I" },
    },
    {
      titulo: "Tus horas de pasantía avanzan solas",
      sub: "Marca tu código de asistencia cada día y coordina tu pasantía por chat, sin salir de Gradly.",
    },
    {
      titulo: "Certifica tu pasantía y da el siguiente paso",
      sub: "Al terminar tu pasantía, tu empresa emite el comprobante y tu universidad lo valida.",
      foto: "https://images.unsplash.com/photo-1521020781921-ce0d582b7665?w=900&q=80",
      credito: { nombre: "Guillaume de Germain", url: "https://unsplash.com/photos/rEVQCk1dqrA" },
    },
  ],
  empresa: [
    {
      titulo: "Encuentra pasantes ya verificados",
      sub: "Publica pasantías por carrera y recibe postulantes ya validados por su universidad.",
      foto: "https://images.unsplash.com/photo-1529929444253-062f0b823ba1?w=900&q=80",
      credito: { nombre: "Dylan Gillis", url: "https://unsplash.com/photos/1p99o5sVm3s" },
    },
    {
      titulo: "Da seguimiento a cada pasantía sin papeleo",
      sub: "Revisa asistencia y avance de tus pasantes desde un panel, sin hojas de cálculo.",
    },
    {
      titulo: "Recluta cuando terminen su pasantía",
      sub: "Convierte una pasantía exitosa en tu próxima contratación, directo desde la app.",
      foto: "https://images.unsplash.com/photo-1752650735509-58f11eaa2e10?w=900&q=80",
      credito: { nombre: "Vitaly Gariev", url: "https://unsplash.com/photos/8N0oIGSSNcU" },
    },
  ],
  universidad: [
    {
      titulo: "Acompaña las pasantías de tus estudiantes",
      sub: "Reparte cupos de pasantía por carrera y conecta a tus estudiantes con empresas aliadas.",
      foto: "https://images.unsplash.com/photo-1576495199011-eb94736d05d6?w=900&q=80",
      credito: { nombre: "Wonderlane", url: "https://unsplash.com/photos/6zlgM-GUd6I" },
    },
    {
      titulo: "Valida horas de pasantía sin papeleo",
      sub: "Aprueba comprobantes y asistencia de cada pasantía desde un panel, sin reportes por correo.",
    },
    {
      titulo: "Certifica pasantías, fortalece alianzas",
      sub: "Construye relaciones directas con empresas que ya confían en las pasantías de tus egresados.",
      foto: "https://images.unsplash.com/photo-1627556704290-2b1f5853ff78?w=900&q=80",
      credito: { nombre: "RUT MIIT", url: "https://unsplash.com/photos/hpRGrfOIybc" },
    },
  ],
};

export default function OnboardingInicial() {
  const router = useRouter();
  const { colors, isDark, setTheme } = useTheme();
  const { language, setLanguage } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const C = colors;
  const styles = makeStyles(C);

  const [slide, setSlide] = useState(0);
  const [rol, setRol] = useState<Rol>("estudiante");
  const scrollRef = useRef<ScrollView>(null);

  const irA = (i: number) => {
    const destino = Math.max(0, Math.min(TOTAL_SLIDES - 1, i));
    scrollRef.current?.scrollTo({ x: destino * width, animated: true });
    setSlide(destino);
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    setSlide(i);
  };

  const finalizar = async () => {
    await marcarOnboardingInicialVisto();
    router.replace("/auth/iniciosesion" as any);
  };

  const siguiente = () => {
    if (slide === TOTAL_SLIDES - 1) {
      finalizar();
      return;
    }
    irA(slide + 1);
  };

  const abrirCredito = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  return (
    <LiquidBackground>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* ── Omitir ── */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={finalizar} hitSlop={10} accessibilityRole="button">
          <Text style={styles.omitirText}>Omitir</Text>
        </Pressable>
      </View>

      {/* ── Diapositivas ── */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onScrollEnd}
        style={styles.flex1}
      >
        {/* 0. Idioma + tema */}
        <View style={{ width }}>
          <ScrollView contentContainerStyle={styles.slidePad} showsVerticalScrollIndicator={false}>
            <View style={styles.brand}>
              <Image
                source={require("../assets/images/LogoGradly.png")}
                style={styles.brandLogo}
                resizeMode="contain"
              />
              <Text style={styles.brandName}>Gradly</Text>
            </View>

            <Text style={styles.slideTitle}>Antes de empezar</Text>
            <Text style={styles.slideSub}>
              Elige cómo quieres ver Gradly. Puedes cambiarlo cuando quieras desde tu perfil.
            </Text>

            <View style={styles.settingsBlock}>
              <Text style={styles.settingsLabel}>Idioma</Text>
              <View style={styles.pillRow}>
                <Pressable
                  style={[styles.pill, language === "es" && styles.pillActive]}
                  onPress={() => setLanguage("es")}
                >
                  {/* Nombres de idioma: SIEMPRE en su propio idioma, nunca
                      traducidos (RNText, no el Text=AutoText del resto del
                      archivo) — "Español" no debe volverse "Spanish" solo
                      porque el idioma activo sea inglés. */}
                  <RNText style={[styles.pillText, language === "es" && styles.pillTextActive]}>
                    Español
                  </RNText>
                </Pressable>
                <Pressable
                  style={[styles.pill, language === "en" && styles.pillActive]}
                  onPress={() => setLanguage("en")}
                >
                  <RNText style={[styles.pillText, language === "en" && styles.pillTextActive]}>
                    English
                  </RNText>
                </Pressable>
              </View>
            </View>

            <View style={styles.settingsBlock}>
              <Text style={styles.settingsLabel}>Tema</Text>
              <View style={styles.pillRow}>
                <Pressable
                  style={[styles.pill, !isDark && styles.pillActive]}
                  onPress={() => setTheme("light")}
                >
                  <Ionicons
                    name="sunny-outline"
                    size={15}
                    color={!isDark ? "#ffffff" : C.textMuted}
                  />
                  <Text style={[styles.pillText, !isDark && styles.pillTextActive]}>Claro</Text>
                </Pressable>
                <Pressable
                  style={[styles.pill, isDark && styles.pillActive]}
                  onPress={() => setTheme("dark")}
                >
                  <Ionicons
                    name="moon-outline"
                    size={15}
                    color={isDark ? "#ffffff" : C.textMuted}
                  />
                  <Text style={[styles.pillText, isDark && styles.pillTextActive]}>Oscuro</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>

        {/* 1. Rol */}
        <View style={{ width }}>
          <ScrollView contentContainerStyle={styles.slidePad} showsVerticalScrollIndicator={false}>
            <Text style={styles.slideTitle}>¿Cómo vas a usar Gradly?</Text>
            <Text style={styles.slideSub}>
              Así te mostramos lo que más te importa. Puedes cambiarlo cuando quieras.
            </Text>

            <View style={styles.roleCards}>
              {ROLES.map((r) => {
                const activo = rol === r.key;
                return (
                  <Pressable
                    key={r.key}
                    style={[styles.roleCard, activo && styles.roleCardActive]}
                    onPress={() => setRol(r.key)}
                    accessibilityRole="button"
                  >
                    <View style={[styles.roleIconWrap, activo && styles.roleIconWrapActive]}>
                      <Ionicons
                        name={r.icon}
                        size={18}
                        color={activo ? "#ffffff" : C.primaryLight}
                      />
                    </View>
                    <Text style={styles.roleCardLabel}>{ROL_LABEL[r.key]}</Text>
                    {activo && (
                      <Ionicons name="checkmark-circle" size={20} color={C.primary} style={styles.roleCheck} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>

        {/* 2-4. Contenido por rol */}
        {CONTENIDO[rol].map((item, i) => (
          <View key={i} style={{ width }}>
            <ScrollView contentContainerStyle={styles.slidePad} showsVerticalScrollIndicator={false}>
              {!!item.foto && (
                <View style={styles.photoCard}>
                  <Image source={{ uri: item.foto }} style={styles.photoImg} resizeMode="cover" />
                </View>
              )}
              <Text style={styles.slideTitle}>{item.titulo}</Text>
              <Text style={styles.slideSub}>{item.sub}</Text>
              {!!item.credito && (
                <Pressable onPress={() => abrirCredito(item.credito!.url)}>
                  {/* RNText a propósito: el nombre del fotógrafo es un
                      nombre propio que nunca debe pasar por el traductor;
                      el prefijo/sufijo se elige a mano según `language`
                      en vez de sembrarlo en autoSeed.ts (evita mezclar un
                      nombre propio dentro de una frase traducible). */}
                  <RNText style={styles.creditoText}>
                    {(language === "en" ? "Photo: " : "Foto: ") +
                      item.credito.nombre +
                      (language === "en" ? " on Unsplash" : " en Unsplash")}
                  </RNText>
                </Pressable>
              )}
            </ScrollView>
          </View>
        ))}
      </ScrollView>

      {/* ── Puntos + botón ── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.dotsRow}>
          {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
            <View key={i} style={[styles.dot, i === slide && styles.dotActive]} />
          ))}
        </View>
        <Pressable style={styles.btnPrimary} onPress={siguiente} accessibilityRole="button">
          <Text style={styles.btnPrimaryText}>
            {slide === TOTAL_SLIDES - 1 ? "Comenzar" : "Siguiente"}
          </Text>
          <Ionicons name="chevron-forward" size={18} color="#ffffff" />
        </Pressable>
      </View>
    </LiquidBackground>
  );
}

const makeStyles = (C: GradlyColors) =>
  StyleSheet.create({
    flex1: { flex: 1 },
    topBar: {
      flexDirection: "row",
      justifyContent: "flex-end",
      paddingHorizontal: 24,
      paddingBottom: 8,
    },
    omitirText: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: C.textMuted },

    slidePad: {
      flexGrow: 1,
      paddingHorizontal: 28,
      paddingTop: 12,
      paddingBottom: 24,
      alignItems: "flex-start",
      justifyContent: "center",
      gap: 8,
    },

    brand: { flexDirection: "row", alignItems: "center", marginBottom: 22 },
    // Ancho fijo en vez de `aspectRatio` a propósito: en react-native-web,
    // <Image> con solo height+aspectRatio (sin width) resuelve el ancho al
    // tamaño NATIVO del archivo (421px) en vez de calcularlo — se calcula
    // el ancho a mano igual que en nativo. El PNG trae además ~23% de
    // relleno transparente pegado a su borde derecho (medido a pixel en el
    // boceto aprobado), compensado con el mismo margin-right negativo,
    // escalado a esta altura desde el boceto (154px→-16px ⇒ 84px→-11px).
    brandLogo: { height: 84, width: 84 * (421 / 593), marginRight: -11 },
    brandName: { fontSize: 28, fontFamily: FONTS.soraExtraBold, color: C.textPrimary },

    slideTitle: {
      fontSize: 24,
      fontFamily: FONTS.soraExtraBold,
      color: C.textPrimary,
      lineHeight: 30,
      marginTop: 4,
    },
    slideSub: {
      fontSize: 14.5,
      fontFamily: FONTS.interRegular,
      color: C.textMuted,
      lineHeight: 21,
      marginTop: 4,
      marginBottom: 6,
    },

    settingsBlock: { width: "100%", marginTop: 22, gap: 9 },
    settingsLabel: {
      fontSize: 11,
      fontFamily: FONTS.interSemiBold,
      color: C.textMuted,
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    pillRow: { flexDirection: "row", gap: 8 },
    pill: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 12,
      borderRadius: 13,
      borderWidth: 1.5,
      borderColor: C.border,
      backgroundColor: C.white4,
    },
    pillActive: { backgroundColor: C.primary, borderColor: C.primary },
    pillText: { fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: C.textMuted },
    pillTextActive: { color: "#ffffff" },

    roleCards: { width: "100%", marginTop: 20, gap: 10 },
    roleCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 13,
      paddingHorizontal: 14,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: C.border,
      backgroundColor: C.backgroundCard,
    },
    roleCardActive: { borderColor: C.primary, backgroundColor: C.primary12 },
    roleIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.primary12,
      borderWidth: 1,
      borderColor: C.primary35,
    },
    roleIconWrapActive: { backgroundColor: C.primary, borderColor: C.primary },
    roleCardLabel: { flex: 1, fontSize: 14.5, fontFamily: FONTS.interSemiBold, color: C.textPrimary },
    roleCheck: {},

    photoCard: {
      width: "100%",
      aspectRatio: 4 / 3,
      borderRadius: 18,
      overflow: "hidden",
      marginBottom: 18,
      backgroundColor: C.white4,
    },
    photoImg: { width: "100%", height: "100%" },
    creditoText: { fontSize: 11, fontFamily: FONTS.interRegular, color: C.textMuted, marginTop: 4 },

    bottomBar: {
      paddingHorizontal: 28,
      paddingTop: 10,
      alignItems: "center",
      gap: 16,
    },
    dotsRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.border },
    dotActive: { width: 18, backgroundColor: C.primary },
    btnPrimary: {
      width: "100%",
      height: 52,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: C.primary,
      borderRadius: 14,
    },
    btnPrimaryText: { fontSize: 15.5, fontFamily: FONTS.interSemiBold, color: "#ffffff" },
  });
