/**
 * NetworkStats.tsx — gráficas interactivas y estadísticas gamificadas.
 *
 * Exporta:
 *  - <RedGradlyBanner />            → carrusel "Estadísticas de la Red Gradly"
 *                                     (Top empresas / universidades) para el Inicio
 *                                     y, debajo, el Top 3 estudiantes de la plataforma.
 *  - <PerfilStatsEmpresa empresaId />     → panel de Mi Perfil (Empresa):
 *      listas de universidades aliadas y estudiantes trabajando (datos reales).
 *  - <PerfilStatsUniversidad universidadId /> → panel de Mi Perfil (Universidad):
 *      PieChart del estado de las postulaciones de sus grupos.
 */
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { collection, doc, getDoc, getDocs, limit, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text, useAutoText } from "./AutoText";
import { BarChart } from 'react-native-chart-kit';
import PerfilPublicoModal, { type PerfilRol } from '../../components/PerfilPublicoModal';
import TopEstudiantesCard from './TopEstudiantesCard';
import type { TopEstudianteEntry } from '../services/topEstudiantesService';
import { db } from '../config/firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';
import { useInscripcionesActivas } from '../hooks/useInscripcionesActivas';

const SCREEN_W = Dimensions.get('window').width;

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function makeChartConfig(colors: GradlyColors, isDark: boolean) {
  const [pr, pg, pb] = hexToRgb(colors.primary);
  const [tr, tg, tb] = hexToRgb(colors.textMuted);
  return {
    backgroundGradientFrom: colors.backgroundCard,
    backgroundGradientTo: colors.backgroundCard,
    backgroundGradientFromOpacity: 0,
    backgroundGradientToOpacity: 0,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(${pr},${pg},${pb},${opacity})`,
    labelColor: (opacity = 1) => `rgba(${tr},${tg},${tb},${opacity})`,
    barPercentage: 0.6,
    propsForBackgroundLines: { stroke: colors.border },
  };
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MEDALLAS = ['🥇', '🥈', '🥉'];

// ═════════════════════════════════════════════
// BANNER: ESTADÍSTICAS DE LA RED GRADLY
// ═════════════════════════════════════════════
/** Fila del ranking: alianzas (contrapartes únicas con pasantía real) +
 * calificación promedio de los estudiantes vinculados a esas pasantías. */
interface RankEntry {
  /** id del perfil (empresa/universidad) — para abrir su vista al tocarlo. */
  id: string;
  nombre: string;
  alianzas: number;
  /** null = ningún estudiante vinculado tiene calificaciones aún (no se penaliza). */
  calificacion: number | null;
}

/** Calificación neutra (punto medio 1–5) para quien aún no tiene datos: no
 * hunde el score de una institución con alianzas reales pero sin historial de
 * calificaciones todavía — mismo principio de "dato ausente no penaliza" que
 * ya usa el resto del proyecto (disponibilidad, afinidad, cupos). */
const CALIFICACION_NEUTRA = 2.5;

/**
 * `disposicion`: 'carrusel' (por defecto, como en los dashboards) muestra Top
 * Empresas / Top Universidades en un carrusel y el Top 3 estudiantes debajo;
 * 'fila' pone los TRES cuadros lado a lado — para pantallas anchas, donde un
 * carrusel de tarjetas del ancho de toda la página quedaría desproporcionado
 * (lo usa la pestaña Vacantes del estudiante en escritorio).
 */
export function RedGradlyBanner({ disposicion = 'carrusel' }: { disposicion?: 'carrusel' | 'fila' } = {}) {
  const { colors, isDark } = useTheme();
  const { user, rol } = useAuth();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [topEmpresas, setTopEmpresas] = useState<RankEntry[]>([]);
  const [topUnis, setTopUnis] = useState<RankEntry[]>([]);
  // Top 3 estudiantes: UN solo top de TODA la plataforma, calculado en el
  // servidor cada 3 días (Cloud Function `actualizarTopEstudiantes`, ver
  // functions/src/topEstudiantes.ts) y guardado en `ranking_plataforma/
  // top_estudiantes`. Aquí solo se lee ese documento. Lo leen los 4 roles
  // (reglas de Firestore; el estudiante desde 2026-09-23, para que vea cómo
  // funciona la plataforma y se motive). `topEstCargado` distingue "aún no
  // llegó" de "todavía no hay nadie" (solo en ese caso se muestra el mensaje de vacío).
  const [topEst, setTopEst] = useState<TopEstudianteEntry[]>([]);
  const [topEstCargado, setTopEstCargado] = useState(false);
  const puedeVerTop3 = rol === 'empresa' || rol === 'universidad' || rol === 'admin' || rol === 'estudiante';
  // Perfil (empresa / universidad / estudiante) abierto desde un ranking.
  const [verPerfil, setVerPerfil] = useState<{ rol: PerfilRol; id: string } | null>(null);
  // Ancho real del contenedor (en los dashboards: la pantalla menos el padding de
  // 16 a cada lado). Se mide en vez de restarle a la pantalla una cifra fija, para
  // que cada tarjeta ocupe exactamente ese ancho —sin que se asome un pedazo de la
  // siguiente— en cualquier tamaño de pantalla. Arranca con esa misma estimación.
  const [anchoContenedor, setAnchoContenedor] = useState(SCREEN_W - 32);

  useEffect(() => {
    // No ejecutar consultas a Firestore sin sesión activa.
    if (!user?.uid) { setTopEmpresas([]); setTopUnis([]); setTopEst([]); setTopEstCargado(false); return; }
    let cancel = false;
    (async () => {
      try {
        // ⚠️ Este banner lo puede ver CUALQUIER usuario autenticado, pero las
        // reglas de Firestore de `solicitudes_practicas` (y de `perfiles_
        // estudiantes` para la universidad) solo dejan a cada dueño leer lo
        // suyo — no hay forma de que este componente calcule el ranking
        // consultándolas directamente sin toparse con "Missing or
        // insufficient permissions". Por eso ambas cifras vienen YA
        // calculadas: `aliados_*_ids` (arrayUnion en el propio perfil, lo
        // escriben `respuestaFinalUniversidad`/`firmarAcuerdo` al aprobar una
        // pasantía) y `calificacion_estudiantes_promedio` (cada institución se
        // autoreporta desde su propio dashboard — ver dashboard-empresa.tsx/
        // dashboard-universidad.tsx). Aquí solo se leen y ordenan.
        const [empSnap, uniSnap] = await Promise.all([
          getDocs(query(collection(db, 'perfiles_empresas'), limit(60))),
          getDocs(query(collection(db, 'perfiles_universidades'), limit(60))),
        ]);
        if (cancel) return;

        // Score aditivo (nunca multiplicativo): las alianzas son el eje
        // principal y jamás se van a cero por falta de calificaciones — la
        // calificación solo suma o resta dentro de una banda, con 2.5 (punto
        // medio) como aporte neutro cuando aún no hay ninguna.
        const construirRanking = (
          docs: typeof empSnap.docs,
          campoNombre: string,
          campoAliados: string,
        ): RankEntry[] =>
          docs
            .map(d => {
              const data: any = d.data();
              const aliados: string[] = Array.isArray(data[campoAliados]) ? data[campoAliados] : [];
              const calificacion =
                typeof data.calificacion_estudiantes_promedio === 'number'
                  ? data.calificacion_estudiantes_promedio
                  : null;
              return {
                id: d.id,
                nombre: (data[campoNombre] as string) ?? '—',
                alianzas: aliados.length,
                calificacion,
                score: aliados.length + (calificacion ?? CALIFICACION_NEUTRA),
              };
            })
            .filter(e => e.alianzas > 0)
            // Desempate DETERMINISTA: con el mismo dato en Firestore el top 3
            // sale siempre igual (mismo orden en toda sesión / entorno), aunque
            // varias instituciones empaten en `score`.
            .sort((a, b) => b.score - a.score || a.nombre.localeCompare(b.nombre) || a.id.localeCompare(b.id))
            .slice(0, 3)
            .map(({ id, nombre, alianzas, calificacion }) => ({ id, nombre, alianzas, calificacion }));

        setTopEmpresas(construirRanking(empSnap.docs, 'nombre_empresa', 'aliados_universidades_ids'));
        setTopUnis(construirRanking(uniSnap.docs, 'nombre_universidad', 'aliados_empresas_ids'));

        // ── Top 3 estudiantes: un solo documento calculado en el servidor (ver
        // el comentario de `topEst`). Va en su propio try/catch: si falla (p. ej.
        // reglas aún sin desplegar) no debe afectar a Top Empresas/Universidades,
        // que ya se calcularon arriba; en ese caso la tarjeta simplemente no se
        // muestra. ──
        if (rol === 'empresa' || rol === 'universidad' || rol === 'admin' || rol === 'estudiante') {
          try {
            const topSnap = await getDoc(doc(db, 'ranking_plataforma', 'top_estudiantes'));
            if (cancel) return;
            const crudas: any[] = topSnap.exists() && Array.isArray(topSnap.data()?.entradas)
              ? topSnap.data()!.entradas
              : [];
            setTopEst(crudas.filter(e => e?.id).slice(0, 3) as TopEstudianteEntry[]);
            setTopEstCargado(true);
          } catch (e) {
            console.warn('[RedGradly] top 3 estudiantes', e);
            setTopEst([]);
            setTopEstCargado(false);
          }
        } else {
          setTopEst([]);
          setTopEstCargado(false);
        }
      } catch (e) {
        // No crítico (banner informativo) — se registra pero no debe verse
        // como un crash en el LogBox del usuario.
        console.warn('[RedGradly] rank', e);
      }
    })();
    return () => { cancel = true; };
  }, [user?.uid, rol]);

  const cardWidth = anchoContenedor;

  const enFila = disposicion === 'fila';

  // ── Flechas ◀▶ del carrusel (solo web) ──
  // En web (escritorio/tablet) no hay swipe táctil, así que "Top Universidades"
  // quedaba fuera de alcance detrás de "Top Empresas". Las flechas mueven el
  // carrusel una tarjeta (cardWidth + el gap de 12). En la disposición 'fila' no
  // hacen falta (los tres cuadros ya se ven) y en nativo no se dibujan.
  const conFlechas = Platform.OS === 'web' && !enFila;
  const carruselRef = useRef<ScrollView | null>(null);
  const [pagina, setPagina] = useState(0);
  // Espejo de `pagina` para leerlo dentro de efectos/handlers sin depender del render.
  const paginaRef = useRef(0);
  // Mientras corre la animación de un clic, los eventos de scroll pasan por
  // posiciones intermedias (el "redondeo" daría la página de origen) y harían
  // parpadear las flechas: se ignoran hasta este instante.
  const ignorarScrollHasta = useRef(0);
  const fijarPagina = (p: number) => {
    paginaRef.current = p;
    setPagina(p);
  };
  const irAPagina = (p: number) => {
    ignorarScrollHasta.current = Date.now() + 600;
    carruselRef.current?.scrollTo({ x: p * (cardWidth + 12), animated: true });
    fijarPagina(p);
  };
  // Un swipe o el trackpad también mueven el carrusel: la página se deduce del offset.
  const alScrollCarrusel = (offsetX: number) => {
    if (Date.now() < ignorarScrollHasta.current) return;
    const p = Math.max(0, Math.min(1, Math.round(offsetX / (cardWidth + 12))));
    if (p !== paginaRef.current) fijarPagina(p);
  };
  // Si cambia el ancho (redimensionar la ventana) se mantiene la tarjeta actual:
  // sin esto el offset en píxeles quedaría a medias entre las dos.
  useEffect(() => {
    if (!conFlechas) return;
    carruselRef.current?.scrollTo({ x: paginaRef.current * (cardWidth + 12), animated: false });
  }, [cardWidth, conFlechas]);

  // Es una función que devuelve JSX (se invoca como `rankCard({...})`), no un
  // componente: al definirse dentro del render, como componente habría cambiado
  // de identidad en cada render y React lo habría desmontado y vuelto a montar
  // — con las flechas eso ocurre en cada cambio de página, a mitad de la animación.
  const rankCard = ({ titulo, icon, color, data, perfilRol }: {
    titulo: string; icon: keyof typeof Ionicons.glyphMap; color: string;
    data: RankEntry[]; perfilRol: PerfilRol;
  }) => (
    <BlurView
      intensity={isDark ? 30 : 55}
      tint={isDark ? 'dark' : 'light'}
      // En fila, cada cuadro llena su tercio (flex) y no lleva ancho fijo.
      style={[styles.rankCard, enFila ? { flex: 1 } : { width: cardWidth }]}
    >
      <View style={styles.rankHeader}>
        <Ionicons name={icon} size={18} color={color} />
        <Text style={styles.rankTitle}>{titulo}</Text>
      </View>
      {data.length === 0 ? (
        <Text style={styles.rankEmpty}>Aún sin datos suficientes.</Text>
      ) : (
        data.map((e, i) => (
          <View key={`${e.id}-${i}`} style={styles.rankRow}>
            <Text style={styles.rankMedal}>{MEDALLAS[i]}</Text>
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={e.id ? 0.7 : 1}
              disabled={!e.id}
              onPress={() => e.id && setVerPerfil({ rol: perfilRol, id: e.id })}
            >
              <Text style={styles.rankName} numberOfLines={1}>{e.nombre}</Text>
            </TouchableOpacity>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.rankValue, { color }]}>{e.alianzas} alianza{e.alianzas === 1 ? '' : 's'}</Text>
              <Text style={styles.rankStars}>
                {e.calificacion != null ? `★ ${e.calificacion.toFixed(1)}` : 'Sin calificación aún'}
              </Text>
            </View>
          </View>
        ))
      )}
    </BlurView>
  );

  // Cuadro "Top 3 estudiantes" (igual en las dos disposiciones; solo cambia su estilo).
  const top3Estudiantes = (estilo?: object) => (
    <TopEstudiantesCard
      titulo="Top 3 estudiantes"
      subtitulo="Se actualiza cada 3 días"
      textoVacio="Aún no hay estudiantes en el Top 3: entran quienes ya tienen horas certificadas y reseñas."
      entries={topEst}
      detallado
      style={estilo}
      onVerEstudiante={(id) => setVerPerfil({ rol: 'talento', id })}
    />
  );

  return (
    <View
      style={{ marginBottom: 16 }}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - anchoContenedor) > 0.5) setAnchoContenedor(w);
      }}
    >
      {conFlechas ? (
        // Web: el título comparte fila con las flechas ◀▶ del carrusel: ▶ va a
        // "Top Universidades" y ◀ vuelve a "Top Empresas"; cada una se atenúa
        // cuando ya se está en ese extremo.
        <View style={styles.bannerHeadingRow}>
          <Text style={[styles.bannerHeading, { flex: 1, marginBottom: 0 }]}>🌐 Estadísticas de la Red Gradly</Text>
          <TouchableOpacity
            style={[styles.bannerArrow, pagina === 0 && styles.bannerArrowDisabled]}
            onPress={() => irAPagina(0)}
            disabled={pagina === 0}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Volver al Top Empresas"
          >
            <Ionicons name="chevron-back" size={18} color={pagina === 0 ? colors.textMuted : colors.primaryLight} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bannerArrow, pagina === 1 && styles.bannerArrowDisabled]}
            onPress={() => irAPagina(1)}
            disabled={pagina === 1}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Ver el Top Universidades"
          >
            <Ionicons name="chevron-forward" size={18} color={pagina === 1 ? colors.textMuted : colors.primaryLight} />
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={styles.bannerHeading}>🌐 Estadísticas de la Red Gradly</Text>
      )}

      {enFila ? (
        // Pantalla ancha: los tres cuadros lado a lado, todos del mismo alto.
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'stretch' }}>
          {rankCard({ titulo: 'Top Empresas', icon: 'trophy', color: colors.gold, data: topEmpresas, perfilRol: 'empresa' })}
          {rankCard({ titulo: 'Top Universidades', icon: 'school', color: colors.primaryLight, data: topUnis, perfilRol: 'universidad' })}
          {puedeVerTop3 && topEstCargado && (
            <View style={{ flex: 1 }}>{top3Estudiantes({ flex: 1 })}</View>
          )}
        </View>
      ) : (
        <>
          <ScrollView
            ref={carruselRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={cardWidth + 12}
            decelerationRate="fast"
            contentContainerStyle={{ gap: 12 }}
            onScroll={conFlechas ? (e) => alScrollCarrusel(e.nativeEvent.contentOffset.x) : undefined}
            scrollEventThrottle={conFlechas ? 16 : undefined}
          >
            {rankCard({ titulo: 'Top Empresas', icon: 'trophy', color: colors.gold, data: topEmpresas, perfilRol: 'empresa' })}
            {rankCard({ titulo: 'Top Universidades', icon: 'school', color: colors.primaryLight, data: topUnis, perfilRol: 'universidad' })}
          </ScrollView>

          {/* Top 3 estudiantes de toda la plataforma — BAJO el carrusel, a lo ancho
              (no dentro del scroll horizontal). Lo ven los 4 roles (el estudiante
              desde 2026-09-23). */}
          {puedeVerTop3 && topEstCargado && (
            <View style={{ marginTop: 12 }}>{top3Estudiantes()}</View>
          )}
        </>
      )}

      {verPerfil && (
        <PerfilPublicoModal
          visible
          rol={verPerfil.rol}
          userId={verPerfil.id}
          viewerUserId={user?.uid ?? ''}
          theme={isDark ? 'dark' : 'light'}
          onClose={() => setVerPerfil(null)}
        />
      )}
    </View>
  );
}

// ═════════════════════════════════════════════
// PANEL MI PERFIL — EMPRESA
// ═════════════════════════════════════════════
export function PerfilStatsEmpresa({ empresaId }: { empresaId: string }) {
  const [verPerfilId, setVerPerfilId] = useState<string | null>(null);
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // El contador va aparte en <Text noTranslate>: dentro del string traducido
  // ('Universidades aliadas (N)') AutoText podía mostrar un N viejo.
  const lblUnisAliadas = useAutoText('Universidades aliadas');
  const lblTrabajando = useAutoText('Estudiantes trabajando');

  // Marca durable de alianzas: `perfiles_empresas.aliados_universidades_ids`
  // (arrayUnion al aprobar una pasantía de grupo o reservar un cupo). No se
  // borra aunque la pasantía termine — es el "ya trabajamos con esta uni".
  const [aliadosIds, setAliadosIds] = useState<string[]>([]);
  const [grupoApps, setGrupoApps] = useState<any[]>([]);
  const [contratados, setContratados] = useState<any[]>([]);
  const [cupos, setCupos] = useState<any[]>([]);
  const [unisAliadas, setUnisAliadas] = useState<{ id: string; nombre: string }[]>([]);

  const inscripcionesCupo = useInscripcionesActivas('empresaId', empresaId);

  useEffect(() => {
    if (!empresaId) return;
    const unsubs = [
      onSnapshot(doc(db, 'perfiles_empresas', empresaId),
        s => setAliadosIds(Array.isArray((s.data() as any)?.aliados_universidades_ids) ? (s.data() as any).aliados_universidades_ids : []),
        error => console.warn('Error en listener (perfil empresa):', error)),
      onSnapshot(query(collection(db, 'aplicaciones_grupos'), where('empresaId', '==', empresaId)),
        s => setGrupoApps(s.docs.map(d => d.data())),
        error => console.warn('Error en listener (aplicaciones_grupos):', error)),
      onSnapshot(query(collection(db, 'aplicaciones'), where('empresa_id', '==', empresaId)),
        s => setContratados(s.docs.filter(d => (d.data() as any).estado === 'contratado').map(d => ({ id: d.id, ...(d.data() as any) }))),
        error => console.warn('Error en listener (aplicaciones empresa):', error)),
      onSnapshot(query(collection(db, 'asignaciones_cupo'), where('empresaId', '==', empresaId)),
        s => setCupos(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))),
        error => console.warn('Error en listener (asignaciones_cupo empresa):', error)),
    ];
    return () => unsubs.forEach(u => u());
  }, [empresaId]);

  // Universidades con las que la empresa ha trabajado — unión de TODAS las
  // vías, porque la marca durable `aliados_universidades_ids` solo se escribe
  // en algunos flujos (p. ej. NO en el autoservicio de cupo):
  //   · marca durable `aliados_universidades_ids`
  //   · toda `asignaciones_cupo` de la empresa (cada cupo pertenece a una uni)
  //   · postulaciones de grupo aprobadas / en revisión
  //   · `aplicaciones` en 'contratado' con universidad vinculada (flujo legado)
  useEffect(() => {
    const ids = [...new Set([
      ...aliadosIds,
      ...cupos.map(c => c.universidadId),
      ...grupoApps.filter(a => a.estado === 'aprobada' || a.estado === 'revisando').map(a => a.universidadId),
      ...contratados.map(a => a.universidad_id),
    ])].filter(Boolean) as string[];
    if (ids.length === 0) { setUnisAliadas([]); return; }
    let cancel = false;
    Promise.all(ids.map(id => getDoc(doc(db, 'perfiles_universidades', id))))
      .then(snaps => {
        if (cancel) return;
        setUnisAliadas(
          snaps
            .filter(s => s.exists())
            .map(s => ({ id: s.id, nombre: (s.data() as any).nombre_universidad ?? 'Universidad' })),
        );
      })
      .catch(() => {});
    return () => { cancel = true; };
  }, [aliadosIds, cupos, grupoApps, contratados]);

  // Estudiantes trabajando ahora: contratados (flujo individual legado) +
  // inscripciones de cupo activas (no finalizadas). Se deduplica por id.
  const trabajando = useMemo(() => {
    const map = new Map<string, string>();
    contratados.forEach(a => {
      if (a.estudiante_id) map.set(a.estudiante_id, a.estudiante_nombre ?? 'Estudiante');
    });
    cupos.forEach(c => {
      if (c.estado === 'tomado' && c.finalizada !== true && c.estudianteId) {
        map.set(c.estudianteId, c.estudianteNombre ?? 'Estudiante');
      }
    });
    // `inscripcionesCupo` ya trae la meta/progreso, pero para esta lista basta
    // el id+nombre; se usa `cupos` directo para no depender del orden de carga.
    void inscripcionesCupo;
    return [...map.entries()].map(([id, nombre]) => ({ id, nombre }));
  }, [contratados, cupos, inscripcionesCupo]);

  return (
    <View style={{ gap: 16 }}>
      {/* Universidades aliadas */}
      <View>
        <Text style={styles.panelTitle}>{lblUnisAliadas} <Text noTranslate>({unisAliadas.length})</Text></Text>
        {unisAliadas.length === 0 ? (
          <Text style={styles.empty}>Aún sin universidades aliadas.</Text>
        ) : (
          unisAliadas.map(u => (
            <View key={u.id} style={styles.listRow}>
              <Ionicons name="school-outline" size={18} color={colors.primaryLight} />
              <Text style={styles.listText} numberOfLines={1} noTranslate>{u.nombre}</Text>
            </View>
          ))
        )}
      </View>

      {/* Estudiantes trabajando */}
      <View>
        <Text style={styles.panelTitle}>{lblTrabajando} <Text noTranslate>({trabajando.length})</Text></Text>
        {trabajando.length === 0 ? (
          <Text style={styles.empty}>Aún sin estudiantes trabajando.</Text>
        ) : (
          trabajando.map(e => (
            <TouchableOpacity
              key={e.id}
              style={styles.listRow}
              activeOpacity={0.7}
              onPress={() => setVerPerfilId(e.id)}
            >
              <Ionicons name="person-outline" size={18} color={colors.success} />
              <Text style={styles.listText} numberOfLines={1} noTranslate>{e.nombre}</Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      <PerfilPublicoModal
        visible={!!verPerfilId}
        onClose={() => setVerPerfilId(null)}
        userId={verPerfilId ?? ''}
        rol="talento"
        viewerUserId={empresaId}
        theme="dark"
      />
    </View>
  );
}

// ═════════════════════════════════════════════
// PANEL MI PERFIL — UNIVERSIDAD
// Avance formativo de los estudiantes: distribución por % de horas cumplidas
// (barras) + indicadores de promedio, estudiantes en proceso y egresados.
// Datos reales de `perfiles_estudiantes` de la universidad.
// ═════════════════════════════════════════════
const BUCKET_LABELS = ['0-25%', '26-50%', '51-75%', '76-99%', '100%'];

export function PerfilStatsUniversidad({ universidadId }: { universidadId: string }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [estudiantes, setEstudiantes] = useState<any[]>([]);

  useEffect(() => {
    if (!universidadId) return;
    const unsub = onSnapshot(
      query(collection(db, 'perfiles_estudiantes'), where('universidad_id', '==', universidadId)),
      s => setEstudiantes(s.docs.map(d => ({ id: d.id, ...d.data() }))),
      error => console.warn('Error en listener (perfiles_estudiantes universidad):', error),
    );
    return unsub;
  }, [universidadId]);

  // Libro mayor de horas de las inscripciones de cupo activas (Fase D): es el
  // avance REAL de un estudiante mientras cursa la pasantía. `horas_aprobadas`
  // solo se llena al CERTIFICAR, así que sin esto todos caían en el bucket 0-25%.
  const inscripciones = useInscripcionesActivas('universidadId', universidadId);
  const ledgerPorEstudiante = useMemo(() => {
    const m: Record<string, { pct: number; enProceso: boolean }> = {};
    inscripciones.forEach(({ asignacion, progreso }) => {
      const pct = progreso?.pct ?? 0;
      m[asignacion.estudianteId] = { pct, enProceso: !progreso?.completado };
    });
    return m;
  }, [inscripciones]);

  const resumen = useMemo(() => {
    const buckets = [0, 0, 0, 0, 0];
    let enProceso = 0, egresados = 0;
    estudiantes.forEach(e => {
      const objetivo = Number(e.horas_objetivo) || 500;
      const pctCert = Math.max(0, Math.min(100, (Number(e.horas_aprobadas) || 0) / objetivo * 100));
      const led = ledgerPorEstudiante[e.id];
      // El mayor de: horas ya certificadas vs avance del libro mayor en curso.
      const pct = Math.max(pctCert, led?.pct ?? 0);
      const idx = pct >= 100 ? 4 : pct >= 76 ? 3 : pct >= 51 ? 2 : pct >= 26 ? 1 : 0;
      buckets[idx]++;
      if ((Number(e.horas_en_proceso) || 0) > 0 || led?.enProceso) enProceso++;
      if (e.graduado === true) egresados++;
    });
    return { buckets, enProceso, egresados };
  }, [estudiantes, ledgerPorEstudiante]);

  const chartConfig = makeChartConfig(colors, isDark);
  const chartWidth = SCREEN_W - 96;

  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.panelTitle}>Avance formativo de tus estudiantes</Text>
      {estudiantes.length === 0 ? (
        <Text style={styles.empty}>Aún no tienes estudiantes registrados.</Text>
      ) : (
        <>
          <BarChart
            data={{ labels: BUCKET_LABELS, datasets: [{ data: resumen.buckets }] }}
            width={chartWidth}
            height={200}
            yAxisLabel=""
            yAxisSuffix=""
            chartConfig={chartConfig}
            fromZero
            showValuesOnTopOfBars
            style={styles.chart}
          />
          <Text style={styles.empty}>Estudiantes según su porcentaje de horas cumplidas.</Text>
          <View style={styles.statsRow}>
            {/* "Avance prom." se quitó por pedido del usuario (ya se había
                hablado): la barra de arriba ya muestra la distribución y la
                abreviatura confundía al traductor automático. */}
            <MiniStat label="En proceso" value={resumen.enProceso} color={colors.success} styles={styles} />
            <MiniStat label="Egresados" value={resumen.egresados} color={colors.gold} styles={styles} />
          </View>
        </>
      )}
    </View>
  );
}

function MiniStat({ label, value, color, styles }: { label: string; value: number; color: string; styles: any }) {
  return (
    <View style={styles.miniStat}>
      <Text style={[styles.miniValue, { color }]}>{value}</Text>
      <Text style={styles.miniLabel}>{label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────
const makeStyles = (COLORS: GradlyColors) => StyleSheet.create({
  bannerHeading: { fontSize: 15, fontFamily: FONTS.soraSemiBold, color: COLORS.textPrimary, marginBottom: 10 },
  // Web: título + flechas ◀▶ del carrusel en una fila.
  bannerHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  bannerArrow: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.backgroundSurface,
    borderWidth: 1, borderColor: COLORS.border,
  },
  bannerArrowDisabled: { opacity: 0.45 },
  rankCard: {
    borderRadius: 20, padding: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.18)',
    backgroundColor: COLORS.backgroundCard + 'cc',
    gap: 8,
  },
  rankHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  rankTitle: { fontSize: 14, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },
  rankEmpty: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted, paddingVertical: 8 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rankMedal: { fontSize: 14, width: 24, textAlign: 'center' },
  rankName: { flex: 1, fontSize: 13, fontFamily: FONTS.interMedium, color: COLORS.textPrimary },
  rankValue: { fontSize: 13, fontFamily: FONTS.rajdhaniBold },
  rankStars: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.gold, marginTop: 1 },

  panelTitle: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight, marginBottom: 8, letterSpacing: 0.3 },
  empty: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textMuted, paddingVertical: 10 },
  chart: { borderRadius: 16, marginVertical: 4 },

  listRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.backgroundSurface, borderRadius: 10, padding: 12, marginBottom: 6,
    borderWidth: 1, borderColor: COLORS.border,
  },
  listText: { flex: 1, fontSize: 13, fontFamily: FONTS.interMedium, color: COLORS.textPrimary },

  statsRow: { flexDirection: 'row', gap: 10 },
  miniStat: {
    flex: 1, alignItems: 'center', backgroundColor: COLORS.backgroundSurface,
    borderRadius: 12, paddingVertical: 12, borderWidth: 1, borderColor: COLORS.border,
  },
  miniValue: { fontSize: 22, fontFamily: FONTS.rajdhaniBold },
  miniLabel: { fontSize: 11, fontFamily: FONTS.interRegular, color: COLORS.textMuted, marginTop: 2 },
});
