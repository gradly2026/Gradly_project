// ════════════════════════════════════════════════════════════════════════
// app/(tabs)/institucion.tsx — pestaña "Mi institución" del estudiante.
//
// GUÍA PARA PRINCIPIANTES:
// Esta pestaña ocupa el lugar que antes tenía "Academia". El cambio no fue
// estético: Academia mostraba cursos, guías y un tip ESCRITOS A MANO en su
// propio archivo — nada venía de la base de datos, así que un slot de la
// barra inferior (hay solo 5) se gastaba en contenido que nunca cambiaba.
// En su lugar va lo que el estudiante sí necesita saber y que la app tenía
// guardado pero no mostraba en ninguna parte: de qué universidad es, en
// qué grupo lo metieron, en qué punto va el período de prácticas de ese
// grupo, qué implica su carrera, y a quién de su universidad escribirle.
//
// Todo sale de 2 documentos que las reglas de Firestore ya permiten leer a
// cualquier usuario autenticado: `perfiles_universidades/{uid}` y
// `grupos/{grupoId}` — no hizo falta abrir ningún permiso nuevo.
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from '../../src/components/AutoText';
import MiInstitucionCard, { useInstitucion, fechaCorta } from '../../src/components/MiInstitucionCard';
import { GlassCard } from '../../components/ui/liquid-glass/GlassCard';
import { LiquidBackground } from '../../components/ui/liquid-glass/LiquidBackground';
import { db } from '../../src/config/firebaseConfig';
import { useAuth } from '../../src/context/AuthContext';
import { useTranslation } from '../../src/context/TranslationContext';
import { FONTS, useTheme, type GradlyColors } from '../../src/context/ThemeContext';
import {
  CARRERAS_EL_SALVADOR,
  cargarOverridesCarreras,
  mensajeZonaRoja,
  zonaDeCarrera,
} from '../../src/data/carreras';
import { progresoPorFechas } from '../../src/utils/progresoPasantia';
import BandejaIncidencias from '../../src/components/BandejaIncidencias';
import ReportarIncidenciaModal from '../../src/components/ReportarIncidenciaModal';

// En web, un ScrollView anidado necesita que el navegador sepa que ESTE
// contenedor es el que desplaza. Mismo truco que ya usan index.tsx y
// progreso.tsx para que la rueda del ratón funcione dentro de la pestaña.
const webScrollStyle = Platform.OS === 'web' ? ({ overflowY: 'auto' } as any) : undefined;

export default function InstitucionTab() {
  const { user, userProfile } = useAuth();
  const { t, language } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const locale = language === 'en' ? 'en-US' : 'es-SV';

  // Perfil del estudiante: de aquí salen los 2 identificadores que abren
  // todo lo demás (a qué universidad pertenece y en qué grupo está).
  const [perfil, setPerfil] = useState<{
    universidad_id?: string; grupo_id?: string; carrera?: string;
  } | null>(null);
  const [cargado, setCargado] = useState(false);
  const [reportando, setReportando] = useState(false);
  // Empresa de la práctica en curso, si la hay. Sin ella el formulario ni
  // siquiera ofrece la categoría "la empresa": no habría a quién dirigir el
  // reclamo, y ofrecer una opción que no lleva a nadie es peor que omitirla.
  const [empresa, setEmpresa] = useState<{ id: string; nombre: string } | null>(null);
  // Bandera aparte de `perfil`: sin ella no se puede distinguir "todavía no
  // llegó la respuesta" de "llegó y no tiene universidad" — las dos serían
  // `perfil === null`, y la pantalla mostraría durante un instante el aviso
  // de "no estás vinculado a una universidad" a un estudiante que sí lo
  // está. Ese parpadeo se ve de verdad al entrar a la pestaña.

  useEffect(() => {
    if (!user) { setCargado(false); return; }
    return onSnapshot(
      doc(db, 'perfiles_estudiantes', user.uid),
      snap => { setPerfil(snap.exists() ? (snap.data() as any) : null); setCargado(true); },
      () => { setPerfil(null); setCargado(true); },
    );
  }, [user]);

  // ── Empresa de la práctica en curso ──────────────────────────────
  // Se mira en las DOS vías por las que un estudiante llega a una empresa:
  // el acuerdo de grupo que gestiona su universidad (`solicitudes_practicas`,
  // que el estudiante lee por `estudianteIds`) y la postulación individual
  // (`aplicaciones`, que lee por ser suya). La primera trae el nombre de la
  // empresa ya denormalizado; la segunda no, así que ahí hay que ir a
  // buscarlo al perfil.
  useEffect(() => {
    if (!user) { setEmpresa(null); return; }
    let cancel = false;

    const unsubGrupo = onSnapshot(
      query(collection(db, 'solicitudes_practicas'), where('estudianteIds', 'array-contains', user.uid)),
      snap => {
        if (cancel) return;
        const viva = snap.docs
          .map(d => d.data() as any)
          .find(d => d.estado === 'aprobado' || d.estado === 'finalizado');
        if (viva?.empresaId) {
          setEmpresa({ id: viva.empresaId, nombre: viva.empresaNombre ?? '' });
        }
      },
      () => {},
    );

    const unsubIndiv = onSnapshot(
      query(collection(db, 'aplicaciones'), where('estudiante_id', '==', user.uid)),
      async snap => {
        if (cancel) return;
        const viva = snap.docs
          .map(d => d.data() as any)
          .find(d => d.estado === 'contratado' || d.estado === 'entrevista');
        if (!viva?.empresa_id) return;
        // Solo se pisa lo del acuerdo de grupo si todavía no hay nada: el
        // acuerdo es la vía "oficial" y manda cuando existen las dos.
        setEmpresa(prev => prev ?? { id: viva.empresa_id, nombre: '' });
        try {
          const perfilEmp = await getDoc(doc(db, 'perfiles_empresas', viva.empresa_id));
          const nombre = String(perfilEmp.data()?.nombre_empresa ?? '');
          if (!cancel && nombre) {
            setEmpresa(prev => (prev && !prev.nombre ? { ...prev, nombre } : prev));
          }
        } catch { /* el nombre es cosmético: sin él la categoría sigue sirviendo */ }
      },
      () => {},
    );

    return () => { cancel = true; unsubGrupo(); unsubIndiv(); };
  }, [user]);

  // Las zonas verde/roja pueden estar sobreescritas desde el panel admin;
  // sin esta carga, zonaDeCarrera() respondería solo con el catálogo fijo.
  useEffect(() => { cargarOverridesCarreras(); }, []);

  const universidadId = perfil?.universidad_id ?? (userProfile as any)?.universidad_id;
  const grupoId = perfil?.grupo_id;
  const { uni, grupo } = useInstitucion(universidadId, grupoId);

  // La carrera del grupo manda sobre la del perfil: es la que la
  // universidad declaró al crear el grupo, y de ella cuelga la regulación.
  const miCarrera = grupo?.carrera ?? perfil?.carrera ?? (userProfile as any)?.carrera ?? '';
  const fichaCarrera = useMemo(
    () => CARRERAS_EL_SALVADOR.find(c => c.nombre === miCarrera) ?? null,
    [miCarrera],
  );
  const zona = miCarrera ? zonaDeCarrera(miCarrera) : 'verde';
  const avisoRoja = miCarrera ? mensajeZonaRoja(miCarrera) : null;

  // Avance del período de prácticas del grupo (no de las horas: eso vive en
  // la pestaña Progreso). Se recalcula en cada render, que es justo lo que
  // se quiere — el porcentaje depende de la fecha de HOY.
  const periodo = useMemo(
    () => progresoPorFechas(grupo?.fecha_inicio, grupo?.fecha_fin),
    [grupo?.fecha_inicio, grupo?.fecha_fin],
  );

  // Vías de contacto reales de la universidad, ya filtradas: solo se dibujan
  // las que la institución llenó al registrarse.
  const contactos = [
    uni?.contacto_correo && {
      icon: 'mail-outline' as const,
      label: uni.contacto_correo,
      url: `mailto:${uni.contacto_correo}`,
    },
    (uni?.contacto_telefono || uni?.telefono) && {
      icon: 'call-outline' as const,
      label: (uni.contacto_telefono || uni.telefono)!,
      url: `tel:${(uni.contacto_telefono || uni.telefono)!.replace(/\s+/g, '')}`,
    },
    uni?.sitio_web && {
      icon: 'globe-outline' as const,
      label: uni.sitio_web,
      url: /^https?:\/\//i.test(uni.sitio_web) ? uni.sitio_web : `https://${uni.sitio_web}`,
      // Sin el prefijo https:// el navegador trataría "ues.edu.sv" como una
      // ruta relativa del propio sitio y no saldría a ninguna parte.
    },
  ].filter(Boolean) as { icon: 'mail-outline' | 'call-outline' | 'globe-outline'; label: string; url: string }[];

  const sinInstitucion = cargado && !universidadId;

  return (
    <LiquidBackground>
      <View style={[styles.root, { backgroundColor: 'transparent' }]}>
        <StatusBar style="light" />

        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('inst_titulo')}</Text>
        </View>

        <ScrollView
          style={webScrollStyle}
          showsVerticalScrollIndicator
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.scroll, { flexGrow: 1 }]}
        >
          {!cargado ? (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : sinInstitucion ? (
            // Caso real, no defensivo de más: un estudiante puede existir sin
            // universidad si su cuenta no la creó una institución.
            <View style={styles.empty}>
              <Ionicons name="school-outline" size={56} color={colors.border} />
              <Text style={styles.emptyTitle}>{t('inst_sin_universidad_titulo')}</Text>
              <Text style={styles.emptyDesc}>{t('inst_sin_universidad_desc')}</Text>
            </View>
          ) : (
            <>
              {/* ── Identidad: universidad + grupo ── */}
              <MiInstitucionCard universidadId={universidadId} grupoId={grupoId} />

              {/* ── Período de prácticas del grupo ── */}
              {periodo.diasTotales > 0 && (
                <>
                  <Text style={styles.sectionTitle}>{t('inst_periodo_titulo')}</Text>
                  <GlassCard style={styles.card} contentStyle={{ padding: 16, gap: 12 }}>
                    <View style={styles.periodoTop}>
                      <Text style={styles.periodoEstado}>
                        {periodo.estado === 'por_iniciar'
                          ? t('inst_periodo_por_iniciar')
                          : periodo.estado === 'completado'
                          ? t('inst_periodo_completado')
                          : t('inst_periodo_dia', { n: periodo.diasTranscurridos, total: periodo.diasTotales })}
                      </Text>
                      <Text style={styles.periodoPct} noTranslate>{periodo.pct}%</Text>
                    </View>

                    {/* Barra de avance: una View de fondo y otra encima cuyo
                        ancho es el porcentaje. No hace falta librería. */}
                    <View style={styles.barraFondo}>
                      <View style={[styles.barraLlena, { width: `${Math.min(100, Math.max(0, periodo.pct))}%` }]} />
                    </View>

                    <View style={styles.periodoPie}>
                      <Text style={styles.periodoFecha} noTranslate>
                        {fechaCorta(grupo?.fecha_inicio, locale)}
                      </Text>
                      {periodo.estado === 'en_curso' && (
                        <Text style={styles.periodoRestante}>
                          {t('inst_periodo_restantes', { n: periodo.diasRestantes })}
                        </Text>
                      )}
                      <Text style={styles.periodoFecha} noTranslate>
                        {fechaCorta(grupo?.fecha_fin, locale)}
                      </Text>
                    </View>
                  </GlassCard>
                </>
              )}

              {/* ── Mi carrera y qué implica ── */}
              {!!miCarrera && (
                <>
                  <Text style={styles.sectionTitle}>{t('inst_carrera_titulo')}</Text>
                  <GlassCard style={styles.card} contentStyle={{ padding: 16, gap: 12 }}>
                    <View style={styles.carreraTop}>
                      <Text style={styles.carreraNombre} numberOfLines={2} noTranslate>{miCarrera}</Text>
                      <View style={[styles.zonaPill, zona === 'roja' ? styles.zonaPillRoja : styles.zonaPillVerde]}>
                        <Ionicons
                          name={zona === 'roja' ? 'shield-checkmark-outline' : 'checkmark-circle-outline'}
                          size={12}
                          color={zona === 'roja' ? colors.warning : colors.success}
                        />
                        <Text style={[styles.zonaTxt, { color: zona === 'roja' ? colors.warning : colors.success }]}>
                          {zona === 'roja' ? t('inst_zona_roja') : t('inst_zona_verde')}
                        </Text>
                      </View>
                    </View>

                    {!!fichaCarrera && (
                      <View style={styles.carreraMetaRow}>
                        <Meta icon="laptop-outline"   valor={fichaCarrera.modalidad} styles={styles} colors={colors} />
                        <Meta icon="hourglass-outline" valor={fichaCarrera.duracion}  styles={styles} colors={colors} />
                        <Meta icon="ribbon-outline"    valor={fichaCarrera.tipo}      styles={styles} colors={colors} />
                      </View>
                    )}

                    {/* Zona Roja: el aviso legal es el MISMO texto que ya se le
                        muestra a la universidad, en vez de inventar copy nuevo. */}
                    {zona === 'roja' && !!avisoRoja && (
                      <View style={styles.avisoRoja}>
                        <Text style={styles.avisoRojaTitulo}>{avisoRoja.titulo}</Text>
                        <Text style={styles.avisoRojaTxt}>{avisoRoja.cuerpo}</Text>
                      </View>
                    )}
                  </GlassCard>
                </>
              )}

              {/* ── Incidencias: reportar un problema y seguirlo ── */}
              <View style={styles.incHeader}>
                <Text style={styles.sectionTitle}>{t('inc_titulo')}</Text>
                <TouchableOpacity style={styles.incBtn} onPress={() => setReportando(true)} activeOpacity={0.85}>
                  <Ionicons name="flag-outline" size={14} color={colors.primaryLight} />
                  <Text style={styles.incBtnTxt}>{t('inc_reportar_btn')}</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.incSub}>{t('inc_subtitulo_estudiante')}</Text>
              <View style={{ marginBottom: 16 }}>
                <BandejaIncidencias
                  rol="estudiante"
                  uid={user?.uid ?? ''}
                  nombreUsuario={(userProfile as any)?.nombre_completo ?? ''}
                />
              </View>

              {/* ── A quién escribirle en la universidad ── */}
              {(contactos.length > 0 || !!uni?.contacto_nombre) && (
                <>
                  <Text style={styles.sectionTitle}>{t('inst_contacto_titulo')}</Text>
                  <GlassCard style={styles.card} contentStyle={{ padding: 16, gap: 12 }}>
                    {!!uni?.contacto_nombre && (
                      <View>
                        <Text style={styles.contactoNombre} noTranslate>{uni.contacto_nombre}</Text>
                        {!!uni?.contacto_cargo && (
                          <Text style={styles.contactoCargo} noTranslate>{uni.contacto_cargo}</Text>
                        )}
                      </View>
                    )}
                    {contactos.map(c => (
                      <TouchableOpacity
                        key={c.url}
                        style={styles.contactoFila}
                        onPress={() => Linking.openURL(c.url).catch(() => {})}
                        // .catch vacío: si el dispositivo no tiene app de correo
                        // o de teléfono, no se hace nada en vez de reventar.
                        activeOpacity={0.75}
                      >
                        <Ionicons name={c.icon} size={16} color={colors.primaryLight} />
                        <Text style={styles.contactoTxt} numberOfLines={1} noTranslate>{c.label}</Text>
                        <Ionicons name="open-outline" size={14} color={colors.textMuted} />
                      </TouchableOpacity>
                    ))}
                  </GlassCard>
                </>
              )}
            </>
          )}
        </ScrollView>

        <ReportarIncidenciaModal
          visible={reportando}
          onClose={() => setReportando(false)}
          estudianteNombre={(userProfile as any)?.nombre_completo ?? ''}
          universidadId={universidadId}
          empresaId={empresa?.id}
          empresaNombre={empresa?.nombre}
        />
      </View>
    </LiquidBackground>
  );
}

/** Píldora "ícono + valor" para los 3 datos del catálogo de carreras. */
function Meta({
  icon, valor, styles, colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  valor?: string;
  styles: ReturnType<typeof makeStyles>;
  colors: GradlyColors;
}) {
  if (!valor) return null;
  return (
    <View style={styles.metaPill}>
      <Ionicons name={icon} size={12} color={colors.textMuted} />
      <Text style={styles.metaTxt}>{valor}</Text>
    </View>
  );
}

const makeStyles = (COLORS: GradlyColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: COLORS.backgroundDark },

    // Cabecera y contenido centrados y topados al mismo ancho (760): un poco
    // anchos, pero sin estirarse de borde a borde en web/tablet. En móvil
    // ocupan todo el ancho disponible.
    header: {
      width: '100%', maxWidth: 760, alignSelf: 'center',
      paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
      borderBottomWidth: 1, borderBottomColor: COLORS.border,
    },
    headerTitle: { fontSize: 22, fontFamily: FONTS.soraBold, color: COLORS.textPrimary },

    scroll: { padding: 16, paddingBottom: 100, width: '100%', maxWidth: 760, alignSelf: 'center' },
    sectionTitle: {
      fontSize: 15, fontFamily: FONTS.soraSemiBold,
      color: COLORS.textPrimary, marginBottom: 10, marginTop: 4,
    },
    card: { marginBottom: 16 },

    // Período
    periodoTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    periodoEstado: { flex: 1, fontSize: 13.5, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
    periodoPct: { fontSize: 15, fontFamily: FONTS.soraBold, color: COLORS.primaryLight },
    barraFondo: { height: 8, borderRadius: 4, backgroundColor: COLORS.border, overflow: 'hidden' },
    barraLlena: { height: '100%', borderRadius: 4, backgroundColor: COLORS.primary },
    periodoPie: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    periodoFecha: { fontSize: 11.5, fontFamily: FONTS.interRegular, color: COLORS.textMuted },
    periodoRestante: { fontSize: 11.5, fontFamily: FONTS.interSemiBold, color: COLORS.warning },

    // Carrera
    carreraTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    carreraNombre: { flex: 1, fontSize: 15, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary, lineHeight: 20 },
    zonaPill: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    },
    zonaPillVerde: { borderColor: COLORS.success },
    zonaPillRoja: { borderColor: COLORS.warning },
    zonaTxt: { fontSize: 10.5, fontFamily: FONTS.interSemiBold },
    carreraMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    metaPill: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: COLORS.backgroundSurface,
      borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5,
    },
    metaTxt: { fontSize: 11.5, fontFamily: FONTS.interRegular, color: COLORS.textSecondary },
    avisoRoja: {
      borderLeftWidth: 3, borderLeftColor: COLORS.warning,
      paddingLeft: 11, gap: 4,
    },
    avisoRojaTitulo: { fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
    avisoRojaTxt: { fontSize: 12.5, fontFamily: FONTS.interRegular, color: COLORS.textMuted, lineHeight: 18 },

    // Contacto
    contactoNombre: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
    contactoCargo: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted, marginTop: 2 },
    contactoFila: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      borderWidth: 1, borderColor: COLORS.border,
      borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10,
    },
    contactoTxt: { flex: 1, fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textPrimary },

    loader: { paddingTop: 80, alignItems: 'center' },

    // Incidencias
    incHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    incBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      borderWidth: 1, borderColor: COLORS.primary35, borderRadius: 10,
      paddingHorizontal: 11, paddingVertical: 7, marginBottom: 10, marginTop: 4,
    },
    incBtnTxt: { fontSize: 12, fontFamily: FONTS.interSemiBold, color: COLORS.primaryLight },
    incSub: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted, lineHeight: 17, marginBottom: 10 },

    // Vacío
    empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 24, gap: 10 },
    emptyTitle: { fontSize: 16, fontFamily: FONTS.soraSemiBold, color: COLORS.textPrimary, textAlign: 'center' },
    emptyDesc: { fontSize: 13, fontFamily: FONTS.interRegular, color: COLORS.textMuted, textAlign: 'center', lineHeight: 19 },
  });
