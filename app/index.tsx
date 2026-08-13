// ════════════════════════════════════════════════════════════════════════
// app/index.tsx — LA PRIMERA PANTALLA QUE VE CUALQUIER USUARIO
//
// GUÍA PARA PRINCIPIANTES:
// Esta es la ruta "/" (la raíz de toda la app) — lo primero que se dibuja
// después del splash nativo del sistema operativo (ver app/_layout.tsx).
// Muestra el logo de Gradly animado mientras, EN SEGUNDO PLANO, decide a
// dónde debe mandar al usuario:
//   - Si NO hay sesión iniciada           → a la pantalla de login.
//   - Si hay sesión y se sabe su ROL       → al dashboard de ese rol.
//   - Si hay sesión pero el ROL tarda      → se queda esperando (con un
//     "escape" de emergencia si tarda demasiado, ver más abajo).
// Es un buen ejemplo de usar useEffect para tomar una decisión de
// NAVEGACIÓN según datos que llegan de forma asíncrona (la sesión del
// usuario), en vez de datos que se dibujan en pantalla.
// ════════════════════════════════════════════════════════════════════════

import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
// useRef(valorInicial) → crea una "caja" que guarda un valor que
// SOBREVIVE entre repintados de pantalla, pero que (a diferencia de
// useState) NO provoca que el componente se vuelva a dibujar cuando
// cambia. Aquí se usa para guardar los valores de animación (ver
// fadeAnim/scaleAnim más abajo), que Animated maneja internamente sin
// necesidad de disparar renders de React por cada frame de la animación.

import {
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  StyleSheet,

  TouchableOpacity,
  View,
} from 'react-native';
// Animated: el sistema de animaciones de React Native. `Animated.Value`
// representa un número que puede animarse suavemente con el tiempo (por
// ejemplo, de 0 a 1), y componentes especiales como `Animated.View`
// pueden usar ese valor directamente en sus estilos (opacity, transform...)
// para que la animación se vea fluida.

import { AutoText as Text } from "../src/components/AutoText";
import { useAuth } from '../src/context/AuthContext';
import { FONTS, useTheme, type GradlyColors } from '../src/context/ThemeContext';
import { rutaPorRol } from '../src/utils/roleRouting';
// Función utilitaria que, dado el `rol` de un usuario ('estudiante',
// 'empresa', 'universidad', 'admin'), devuelve la RUTA de navegación
// correspondiente a su dashboard — centraliza esa decisión en un solo
// lugar del proyecto, en vez de repetir la misma lista de "if rol ===
// 'empresa' entonces..." en cada pantalla que necesite redirigir según rol.

export default function Index() {
  const router = useRouter();
  const { user, rol, isLoading, refreshProfile, logout } = useAuth();
  // Del AuthContext se extraen: `user` (la cuenta de Firebase Auth
  // actual, o null si no hay sesión), `rol` (el rol leído de Firestore,
  // puede tardar en resolverse incluso con sesión activa), `isLoading`
  // (si AuthContext todavía está determinando el estado inicial),
  // `refreshProfile` (función para forzar una nueva lectura del perfil) y
  // `logout` (cerrar sesión).
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Red de seguridad: si hay sesión pero el rol no se resuelve en unos segundos,
  // dejamos de mostrar un logo infinito y ofrecemos reintentar o salir.
  const [mostrarEscape, setMostrarEscape] = useState(false);
  // Estado: ¿se debe mostrar el mensaje de "esto está tardando" con
  // botones de Reintentar/Salir?
  const [reintentando, setReintentando] = useState(false);
  // Estado: ¿está en curso un reintento (para mostrar su propio loader en
  // el botón)?

  // Necesita escape si: (a) hay sesión pero el rol no resuelve, o (b) la carga
  // se queda colgada demasiado tiempo. El caso "sin sesión" no lo necesita: el
  // efecto de redirección de abajo ya manda al login.
  const necesitaEscape = isLoading || (!!user && !rutaPorRol(rol));
  // Esta variable se RECALCULA en cada render (no es un estado, es una
  // simple expresión booleana): es true si TODAVÍA se está cargando, O SI
  // hay un usuario pero su rol no resuelve a ninguna ruta conocida.

  useEffect(() => {
    if (!necesitaEscape) {
      setMostrarEscape(false);
      return;
      // Si ya no hace falta el "escape" (la app se destrabó sola), se
      // asegura de que el mensaje de emergencia esté oculto.
    }
    const t = setTimeout(() => setMostrarEscape(true), 7000);
    // Si SÍ hace falta, programa mostrar el mensaje de emergencia recién
    // después de 7 SEGUNDOS — no de inmediato, para no alarmar al usuario
    // por una carga normal que tarda solo 1-2 segundos.
    return () => clearTimeout(t);
    // Si `necesitaEscape` deja de ser true ANTES de que pasen los 7
    // segundos (por ejemplo, el rol se resolvió a tiempo), se cancela el
    // temporizador pendiente para que el mensaje nunca llegue a aparecer.
  }, [necesitaEscape]);

  const onReintentar = async () => {
    // Se ejecuta al tocar el botón "Reintentar" del mensaje de emergencia.
    setReintentando(true);
    setMostrarEscape(false);
    try {
      await refreshProfile();
      // Vuelve a pedirle a AuthContext que relea el perfil/rol del
      // usuario desde Firestore, por si la lectura anterior falló
      // temporalmente (problema de red, por ejemplo).
    } finally {
      setReintentando(false);
    }
  };

  const onSalir = async () => {
    // Se ejecuta al tocar "Volver a iniciar sesión": en vez de seguir
    // esperando indefinidamente, cierra la sesión actual (que
    // aparentemente está en un estado inconsistente) y manda al usuario
    // de vuelta al login para que empiece de cero.
    try {
      await logout();
    } finally {
      router.replace('/auth/iniciosesion' as any);
    }
  };

  const fadeAnim = useRef(new Animated.Value(0)).current;
  // Crea un valor animado que arranca en 0 (invisible) y se guarda en un
  // useRef — ".current" accede al valor actual guardado dentro de la
  // referencia. Al usar useRef (en vez de useState), este mismo objeto
  // `Animated.Value` se mantiene IDÉNTICO entre renders (nunca se vuelve
  // a crear), que es justo lo que Animated necesita para animar sin
  // sobresaltos.
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  // Otro valor animado, que arranca en 0.85 (85% del tamaño normal) y
  // crecerá hasta 1 (tamaño normal) — un efecto sutil de "aparece
  // agrandándose un poco" para el logo.

  // Animación de entrada del logo
  useEffect(() => {
    Animated.parallel([
      // Animated.parallel([...]) ejecuta VARIAS animaciones AL MISMO
      // TIEMPO (en paralelo), en vez de una después de otra.
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 900,
        useNativeDriver: Platform.OS !== 'web',
        // useNativeDriver: true delega el cálculo de la animación al hilo
        // nativo del dispositivo (más fluido, no se traba aunque el hilo
        // de JavaScript esté ocupado) — pero esa optimización NO está
        // disponible en la versión web, de ahí "Platform.OS !== 'web'"
        // (verdadero en nativo, falso en web).
      }),
      // Animated.timing → anima el valor de forma LINEAL/con curva
      // definida, durante una duración fija (900 milisegundos), hasta
      // llegar a 1 (opacidad completa).
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 60,
        useNativeDriver: Platform.OS !== 'web',
      }),
      // Animated.spring → anima el valor con una física de "resorte"
      // (rebote sutil), en vez de una curva de tiempo fija — `friction`
      // (fricción) y `tension` (tensión) controlan qué tan rígido o
      // "rebotón" se siente el resorte.
    ]).start();
    // .start() dispara la ejecución del grupo de animaciones.
  }, []);
  // Array de dependencias vacío: la animación de entrada corre UNA sola
  // vez, al aparecer la pantalla.

  // Redirección basada en sesión y rol (ESTRICTA).
  // Mientras `isLoading` o mientras el rol de un usuario autenticado aún no se
  // resuelve, NO se navega: se mantiene el splash. Bajo ninguna circunstancia
  // se redirige a /(tabs) por defecto cuando el rol es null/undefined.
  useEffect(() => {
    // Este es el efecto MÁS importante del archivo: decide a dónde
    // navegar, y se vuelve a evaluar cada vez que cambian `user`, `rol` o
    // `isLoading`.

    // Sesión todavía verificándose → mantener splash.
    if (isLoading) return;
    // Mientras AuthContext no haya determinado ni siquiera si hay sesión
    // o no, no se toma ninguna decisión — se sigue mostrando el logo.

    // Sin sesión → al login.
    if (!user) {
      const timer = setTimeout(() => {
        router.replace('/auth/iniciosesion' as any);
      }, 1800);
      // Se espera 1.8 segundos ANTES de navegar — a propósito, para que
      // el usuario alcance a ver la animación del logo (si se navegara
      // instantáneamente, la pantalla de bienvenida ni se notaría).
      return () => clearTimeout(timer);
      // Si el efecto se vuelve a ejecutar antes de que pasen los 1.8s
      // (por ejemplo, porque `user` cambió durante ese lapso), se cancela
      // este temporizador para no navegar dos veces.
    }

    // Hay sesión: resolver la ruta a partir del rol de Firestore.
    const ruta = rutaPorRol(rol);

    // Rol aún indeterminado (la lectura sigue reintentando en AuthContext):
    // permanecer en el splash en vez de degradar a estudiante.
    if (!ruta) return;
    // Punto CRÍTICO de diseño (marcado también en el comentario de la
    // función): si `rutaPorRol(rol)` no devuelve nada (el rol todavía no
    // se leyó, o es un valor desconocido), la función se detiene AQUÍ, sin
    // navegar a ningún lado por defecto. La alternativa (mandar a todos
    // por defecto a la experiencia de estudiante mientras se resuelve el
    // rol real) se descartó a propósito, para que una empresa o
    // universidad nunca vea, ni por un instante, la pantalla equivocada.

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
          // Los valores animados se conectan directo al estilo: `opacity`
          // sigue a fadeAnim (0→1), y `transform: [{ scale: ... }]`
          // escala el tamaño del logo siguiendo a scaleAnim (0.85→1). Como
          // este es un <Animated.View> (no un <View> normal), React
          // Native sabe interpretar estos valores especiales y animarlos
          // suavemente cuadro a cuadro.
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
        // Mientras NO haga falta el "escape" de emergencia, se muestra un
        // indicador de carga sutil (3 puntitos, uno de ellos resaltado).
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
            // El botón se DESHABILITA mientras ya hay un reintento en
            // curso, para que el usuario no pueda disparar varios
            // reintentos superpuestos tocando repetidas veces.
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
