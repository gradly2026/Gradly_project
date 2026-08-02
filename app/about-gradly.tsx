import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from '../src/components/AutoText';
import { LiquidBackground } from '../components/ui/liquid-glass/LiquidBackground';
import { GlassCard } from '../components/ui/liquid-glass/GlassCard';
import { useTheme, FONTS, type GradlyColors } from '../src/context/ThemeContext';
import { useTranslation } from '../src/context/TranslationContext';

function useThemedStyles() {
  const { colors } = useTheme();
  return useMemo(() => ({ colors, styles: makeStyles(colors) }), [colors]);
}

function ValueCard({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}) {
  const { colors, styles } = useThemedStyles();
  return (
    <GlassCard contentStyle={styles.valueCardContent}>
      <View style={[styles.valueIconWrap, { backgroundColor: colors.primary12, borderColor: colors.primary35 }]}>
        <Ionicons name={icon} size={18} color={colors.primaryLight} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.valueTitle}>{title}</Text>
        <Text style={styles.valueBody}>{body}</Text>
      </View>
    </GlassCard>
  );
}

export default function AboutGradlyScreen() {
  const router = useRouter();
  const { styles, colors } = useThemedStyles();
  const { t } = useTranslation();
  const webScrollStyle = Platform.OS === 'web'
    ? ({ scrollbarColor: `${colors.primary35} ${colors.backgroundSurface}`, scrollbarWidth: 'thin' } as any)
    : undefined;

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
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('acerca_titulo')}</Text>
        </View>

        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          style={[styles.scrollView, webScrollStyle]}
          showsVerticalScrollIndicator
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.scroll, { flexGrow: 1 }]}
        >
          <GlassCard contentStyle={styles.heroCard}>
            <View style={styles.heroBadge}>
              <Ionicons name="information-circle-outline" size={18} color={colors.primaryLight} />
              <Text style={styles.heroBadgeText}>Gradly</Text>
            </View>
            <Text style={styles.sectionTitle}>{t('about_screen_about_title')}</Text>
            <Text style={styles.paragraph}>{t('about_screen_about_p1')}</Text>
            <Text style={styles.paragraph}>{t('about_screen_about_p2')}</Text>
          </GlassCard>

          <View style={styles.valuesSection}>
            <Text style={styles.sectionTitle}>{t('about_screen_values_title')}</Text>
            <ValueCard
              icon="people-outline"
              title={t('about_screen_value_1_title')}
              body={t('about_screen_value_1_body')}
            />
            <ValueCard
              icon="briefcase-outline"
              title={t('about_screen_value_2_title')}
              body={t('about_screen_value_2_body')}
            />
            <ValueCard
              icon="trending-up-outline"
              title={t('about_screen_value_3_title')}
              body={t('about_screen_value_3_body')}
            />
          </View>
        </ScrollView>
      </View>
    </LiquidBackground>
  );
}

const makeStyles = (COLORS: GradlyColors) =>
  StyleSheet.create({
    root: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingTop: 56,
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
      paddingBottom: 120,
      gap: 16,
    },
    scrollView: {
      flex: 1,
      minHeight: 0,
    },
    heroCard: {
      padding: 20,
      gap: 14,
    },
    heroBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
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
    valuesSection: {
      gap: 12,
    },
    valueCardContent: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      padding: 16,
    },
    valueIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    valueTitle: {
      fontSize: 15,
      fontFamily: FONTS.interSemiBold,
      color: COLORS.textPrimary,
      marginBottom: 4,
    },
    valueBody: {
      fontSize: 13,
      lineHeight: 21,
      fontFamily: FONTS.interRegular,
      color: COLORS.textMuted,
    },
  });
