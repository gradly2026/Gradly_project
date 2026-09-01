// ════════════════════════════════════════════════════════════════════════
// MiInstitucionCard.tsx — "¿a quién pertenezco?" para el estudiante.
//
// GUÍA PARA PRINCIPIANTES:
// Un estudiante entra a Gradly con una cuenta que le creó SU UNIVERSIDAD
// (ver dashboard-universidad.tsx: la universidad da de alta el grupo y,
// con él, una cuenta por alumno). Hasta ahora esa pertenencia era
// invisible dentro de la app: el estudiante no veía en ninguna pantalla
// de qué universidad es ni en qué grupo lo metieron, aunque ambos datos
// ya estaban guardados en su perfil (`universidad_id` y `grupo_id`).
// Este componente cierra ese hueco.
//
// Se dibuja de 2 formas según la prop `variant`:
//   - 'compacta' → una sola línea (logo + "UES · Grupo 2026-A"), pensada
//     para ir en la cabecera del feed sin robarle espacio.
//   - 'completa' → una tarjeta con todo: carrera, docente, cuántos
//     compañeros hay en el grupo, horas requeridas y período de prácticas.
//
// PERMISOS (importante): las reglas de Firestore dejan que CUALQUIER
// usuario autenticado lea `perfiles_universidades` y `grupos`, así que
// este componente no necesita ningún cambio de reglas. Lo que NO puede
// hacer es listar a los compañeros con nombre: `perfiles_estudiantes`
// solo lo lee su dueño, su universidad, una empresa o un admin — un
// estudiante no puede leer el perfil de otro. Por eso aquí se muestra el
// CONTADOR `estudiantes_registrados` que el propio documento del grupo ya
// guarda, y no una lista de personas.
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import StorageAvatar from './StorageAvatar';
import { GlassCard } from '../../components/ui/liquid-glass/GlassCard';
import { db } from '../config/firebaseConfig';
import { useTranslation } from '../context/TranslationContext';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';

/** Lo que este componente necesita del documento `perfiles_universidades/{uid}`. */
export interface UniversidadDoc {
  nombre_universidad?: string;
  siglas?: string;
  logo_url?: string | null;
  direccion?: string;
  departamento?: string;
  distrito?: string;
  sitio_web?: string;
  telefono?: string;
  contacto_nombre?: string;
  contacto_cargo?: string;
  contacto_correo?: string;
  contacto_telefono?: string;
}

/** Lo que necesita del documento `grupos/{grupoId}` (ver dashboard-universidad.tsx). */
export interface GrupoDoc {
  nombre?: string;
  carrera?: string;
  docente?: string;
  horasRequeridas?: number;
  estudiantes_registrados?: number;
  /** Fechas guardadas como texto ISO "YYYY-MM-DD", no como Timestamp. */
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  egresado?: boolean;
}

/**
 * Convierte "2026-03-01" en "1 mar 2026" (o "Mar 1, 2026" en inglés).
 * Se construye la fecha con `new Date(a, m - 1, d)` en vez de
 * `new Date("2026-03-01")` a propósito: esa segunda forma la interpreta el
 * motor como UTC y, en El Salvador (UTC-6), termina mostrando el día
 * ANTERIOR. Partiendo el texto a mano, la fecha queda en hora local.
 */
export function fechaCorta(iso: string | null | undefined, locale: string): string {
  if (!iso) return '';
  const [a, m, d] = iso.split('-').map(Number);
  if (!a || !m || !d) return iso;
  return new Date(a, m - 1, d).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Hook con las 2 escuchas en vivo (universidad + grupo). Se exporta aparte
 * de la tarjeta porque la pantalla "Mi institución" necesita esos MISMOS
 * documentos para sus otras secciones (carrera, período, contacto) y no
 * tiene sentido reimplementar las suscripciones ahí.
 *
 * Dos onSnapshot sobre el mismo documento no cuestan el doble: el SDK de
 * Firestore comparte internamente la conexión por documento.
 */
export function useInstitucion(universidadId?: string | null, grupoId?: string | null) {
  const [uni, setUni] = useState<UniversidadDoc | null>(null);
  const [grupo, setGrupo] = useState<GrupoDoc | null>(null);

  // Dos escuchas EN VIVO e independientes: si la universidad cambia su
  // logo, o si agrega alumnos al grupo, todo se actualiza solo sin que el
  // estudiante recargue nada.
  useEffect(() => {
    if (!universidadId) { setUni(null); return; }
    return onSnapshot(
      doc(db, 'perfiles_universidades', universidadId),
      snap => setUni(snap.exists() ? (snap.data() as UniversidadDoc) : null),
      () => setUni(null),
      // El 3er argumento de onSnapshot es el manejador de ERROR. Se pasa
      // explícitamente porque sin él un fallo de permisos se convertiría
      // en una excepción no capturada; aquí basta con quedarse sin datos
      // y no dibujar la tarjeta.
    );
  }, [universidadId]);

  useEffect(() => {
    if (!grupoId) { setGrupo(null); return; }
    return onSnapshot(
      doc(db, 'grupos', grupoId),
      snap => setGrupo(snap.exists() ? (snap.data() as GrupoDoc) : null),
      () => setGrupo(null),
    );
  }, [grupoId]);

  return { uni, grupo };
}

export default function MiInstitucionCard({
  universidadId,
  grupoId,
  variant = 'completa',
}: {
  universidadId?: string | null;
  grupoId?: string | null;
  variant?: 'compacta' | 'completa';
}) {
  const { colors } = useTheme();
  const { t, language } = useTranslation();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const locale = language === 'en' ? 'en-US' : 'es-SV';
  const { uni, grupo } = useInstitucion(universidadId, grupoId);

  const nombreUni   = uni?.nombre_universidad?.trim() || '';
  const siglas      = uni?.siglas?.trim() || '';
  const nombreGrupo = grupo?.nombre?.trim() || '';

  // Sin universidad no hay nada que contar: el estudiante llegó por una vía
  // que no lo ató a ninguna institución. Mejor no dibujar un hueco vacío.
  if (!universidadId || (!nombreUni && !nombreGrupo)) return null;

  // ── Variante compacta: una línea para la cabecera del feed ──────────
  if (variant === 'compacta') {
    return (
      <View style={s.compactaWrap}>
        <StorageAvatar url={uni?.logo_url} size={22} fallbackIcon="school" />
        {/* noTranslate: son NOMBRES PROPIOS (una universidad y un grupo).
            Sin esto, AutoText mandaría "Universidad de El Salvador" al
            traductor y volvería como "University of El Salvador". */}
        <Text style={s.compactaTxt} numberOfLines={1} noTranslate>
          {[siglas || nombreUni, nombreGrupo].filter(Boolean).join('  ·  ')}
        </Text>
      </View>
    );
  }

  // ── Variante completa ───────────────────────────────────────────────
  const companeros = grupo?.estudiantes_registrados ?? 0;
  const periodo = [fechaCorta(grupo?.fecha_inicio, locale), fechaCorta(grupo?.fecha_fin, locale)]
    .filter(Boolean)
    .join(' → ');

  return (
    <GlassCard style={s.card} contentStyle={{ padding: 16, gap: 14 }}>
      {/* Cabecera: identidad de la universidad */}
      <View style={s.header}>
        <StorageAvatar url={uni?.logo_url} size={46} fallbackIcon="school" />
        <View style={{ flex: 1 }}>
          <Text style={s.uniNombre} numberOfLines={2} noTranslate>
            {nombreUni || siglas}
          </Text>
          {!!(uni?.direccion || uni?.departamento) && (
            <Text style={s.uniMeta} numberOfLines={1} noTranslate>
              {uni?.direccion || uni?.departamento}
            </Text>
          )}
        </View>
        {grupo?.egresado && (
          <View style={s.egresadoPill}>
            <Ionicons name="school" size={12} color={colors.success} />
            <Text style={s.egresadoTxt}>{t('inst_egresado')}</Text>
          </View>
        )}
      </View>

      {/* Datos del grupo. Cada fila se dibuja SOLO si tiene valor, para que
          un grupo al que le falten campos no muestre filas en blanco. */}
      <View style={s.filas}>
        <Fila icon="people-outline" label={t('inst_grupo')}   value={nombreGrupo}          s={s} colors={colors} propio />
        <Fila icon="book-outline"   label={t('inst_carrera')} value={grupo?.carrera ?? ''} s={s} colors={colors} propio />
        {/* Fila "Docente" retirada a pedido del usuario (2026-09-01). */}
        <Fila
          icon="people-circle-outline"
          label={t('inst_companeros')}
          value={companeros > 0 ? t('inst_companeros_valor', { n: companeros }) : ''}
          s={s}
          colors={colors}
        />
        <Fila
          icon="time-outline"
          label={t('inst_horas')}
          value={grupo?.horasRequeridas ? t('inst_horas_valor', { n: grupo.horasRequeridas }) : ''}
          s={s}
          colors={colors}
        />
        <Fila icon="calendar-outline" label={t('inst_periodo')} value={periodo} s={s} colors={colors} propio />
      </View>
    </GlassCard>
  );
}

/** Una fila "ícono · etiqueta · valor". `propio` = el valor es un nombre
 *  propio o una fecha ya formateada, así que no debe pasar por el traductor. */
function Fila({
  icon, label, value, s, colors, propio,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  s: ReturnType<typeof makeStyles>;
  colors: GradlyColors;
  propio?: boolean;
}) {
  if (!value) return null;
  return (
    <View style={s.fila}>
      <Ionicons name={icon} size={15} color={colors.textMuted} />
      <Text style={s.filaLabel}>{label}</Text>
      <Text style={s.filaValor} numberOfLines={2} noTranslate={propio}>{value}</Text>
    </View>
  );
}

const makeStyles = (COLORS: GradlyColors) =>
  StyleSheet.create({
    // Compacta
    compactaWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    compactaTxt: { flex: 1, fontSize: 12, fontFamily: FONTS.interMedium, color: COLORS.textMuted },

    // Completa
    card: { marginBottom: 16 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    uniNombre: { fontSize: 15.5, fontFamily: FONTS.soraSemiBold, color: COLORS.textPrimary, lineHeight: 21 },
    uniMeta: { fontSize: 12, fontFamily: FONTS.interRegular, color: COLORS.textMuted, marginTop: 2 },
    egresadoPill: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      borderWidth: 1, borderColor: COLORS.success,
      borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    },
    egresadoTxt: { fontSize: 10.5, fontFamily: FONTS.interSemiBold, color: COLORS.success },

    filas: { gap: 9 },
    fila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    filaLabel: { fontSize: 12.5, fontFamily: FONTS.interRegular, color: COLORS.textMuted, minWidth: 88 },
    filaValor: { flex: 1, fontSize: 13, fontFamily: FONTS.interSemiBold, color: COLORS.textPrimary },
  });
