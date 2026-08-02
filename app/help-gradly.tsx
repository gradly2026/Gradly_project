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

function ContactItem({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
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
          <Text style={styles.headerTitle}>{t('help_screen_title')}</Text>
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
              <Ionicons name="help-circle-outline" size={18} color={colors.primaryLight} />
              <Text style={styles.heroBadgeText}>Gradly</Text>
            </View>
            <Text style={styles.sectionTitle}>{t('help_screen_contact_title')}</Text>
            <Text style={styles.paragraph}>{t('help_screen_intro')}</Text>
          </GlassCard>

          <View style={styles.contactsSection}>
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
