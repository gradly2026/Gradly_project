import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  StyleSheet,

  TouchableOpacity,
  View,
} from 'react-native';
import { AutoText as Text } from "../src/components/AutoText";
import { useAuth } from '../src/context/AuthContext';
import { FONTS, useTheme, type GradlyColors } from '../src/context/ThemeContext';
import { rutaPorRol } from '../src/utils/roleRouting';

export default function Index() {
  const router = useRouter();
  const { user, rol, isLoading, refreshProfile, logout } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Red de seguridad: si hay sesión pero el rol no se resuelve en unos segundos,
  // dejamos de mostrar un logo infinito y ofrecemos reintentar o salir.
  const [mostrarEscape, setMostrarEscape] = useState(false);
  const [reintentando, setReintentando] = useState(false);

  // Necesita escape si: (a) hay sesión pero el rol no resuelve, o (b) la carga
  // se queda colgada demasiado tiempo. El caso "sin sesión" no lo necesita: el
  // efecto de redirección de abajo ya manda al login.
  const necesitaEscape = isLoading || (!!user && !rutaPorRol(rol));

  useEffect(() => {
    if (!necesitaEscape) {
      setMostrarEscape(false);
      return;
    }
    const t = setTimeout(() => setMostrarEscape(true), 7000);
    return () => clearTimeout(t);
  }, [necesitaEscape]);

  const onReintentar = async () => {
    setReintentando(true);
    setMostrarEscape(false);
    try {
      await refreshProfile();
    } finally {
      setReintentando(false);
    }
  };

  const onSalir = async () => {
    try {
      await logout();
    } finally {
      router.replace('/auth/iniciosesion' as any);
    }
  };

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;

  // Animación de entrada del logo
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 900,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 60,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();
  }, []);

  // Redirección basada en sesión y rol (ESTRICTA).
  // Mientras `isLoading` o mientras el rol de un usuario autenticado aún no se
  // resuelve, NO se navega: se mantiene el splash. Bajo ninguna circunstancia
  // se redirige a /(tabs) por defecto cuando el rol es null/undefined.
  useEffect(() => {
    // Sesión todavía verificándose → mantener splash.
    if (isLoading) return;

    // Sin sesión → al login.
    if (!user) {
      const timer = setTimeout(() => {
        router.replace('/auth/iniciosesion' as any);
      }, 1800);
      return () => clearTimeout(timer);
    }

    // Hay sesión: resolver la ruta a partir del rol de Firestore.
    const ruta = rutaPorRol(rol);

    // Rol aún indeterminado (la lectura sigue reintentando en AuthContext):
    // permanecer en el splash en vez de degradar a estudiante.
    if (!ruta) return;

    const timer = setTimeout(() => {
      router.replace(ruta as any);
    }, 1800);

    return () => clearTimeout(timer);
  }, [user, rol, isLoading]);

  return (
    <View style={styles.root}>
      <Animated.View
        style={[
          styles.logoWrap,
          { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Image
          source={require('../assets/images/LogoGradly.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.brandName}>Gradly</Text>
        <Text style={styles.tagline}>Conectando talento con oportunidades</Text>
      </Animated.View>

      {/* Indicador sutil de carga */}
      {!mostrarEscape ? (
        <Animated.View style={[styles.bottomDots, { opacity: fadeAnim }]}>
          <View style={[styles.dot, styles.dotActive]} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </Animated.View>
      ) : (
        // Red de seguridad: el rol no se resolvió a tiempo (carrera de red).
        <View style={styles.escapeBox}>
          <Text style={styles.escapeText}>
            Estamos tardando en cargar tu cuenta. Revisa tu conexión.
          </Text>
          <TouchableOpacity
            style={styles.escapeBtn}
            onPress={onReintentar}
            disabled={reintentando}
            activeOpacity={0.85}
          >
            {reintentando ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.escapeBtnText}>Reintentar</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.escapeLink} onPress={onSalir}>
            <Text style={styles.escapeLinkText}>Volver a iniciar sesión</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const makeStyles = (COLORS: GradlyColors) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.backgroundDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrap: {
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    width: 100,
    height: 100,
  },
  brandName: {
    fontSize: 52,
    fontFamily: FONTS.soraExtraBold,
    color: COLORS.textPrimary,
    letterSpacing: 2,
  },
  tagline: {
    fontSize: 14,
    fontFamily: FONTS.interRegular,
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 4,
  },
  bottomDots: {
    position: 'absolute',
    bottom: 60,
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.border,
  },
  dotActive: {
    backgroundColor: COLORS.primary,
  },
  escapeBox: {
    position: 'absolute',
    bottom: 48,
    left: 32,
    right: 32,
    alignItems: 'center',
    gap: 14,
  },
  escapeText: {
    fontSize: 14,
    fontFamily: FONTS.interRegular,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  escapeBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 160,
    alignItems: 'center',
  },
  escapeBtnText: {
    fontSize: 15,
    fontFamily: FONTS.interSemiBold,
    color: '#ffffff',
  },
  escapeLink: {
    paddingVertical: 4,
  },
  escapeLinkText: {
    fontSize: 13,
    fontFamily: FONTS.interRegular,
    color: COLORS.primaryLight,
  },
});
