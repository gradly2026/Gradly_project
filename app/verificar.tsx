// ════════════════════════════════════════════════════════════════════════
// app/verificar.tsx — RUTA "/verificar" (pública, SIN sesión)
//
// A dónde lleva el código QR del comprobante de finalización de una pasantía
// por cupo (Fase 2 de la mejora al comprobante): cualquiera que escanee ese
// QR —por ejemplo un futuro empleador— llega aquí sin necesidad de cuenta ni
// inicio de sesión, y puede confirmar que el comprobante es real.
//
// Ruta plana (no `[id].tsx`) a propósito: en el hosting estático de este
// proyecto (Hostinger), `/verificar?id=xyz` en una carga en frío encuentra
// directo el archivo `verificar.html` generado por `expo export`, igual que
// cualquier otra ruta conocida — sin depender del mecanismo de repliegue a
// `index.html` que usan los segmentos dinámicos. Mismo patrón que
// `app/auth/action.tsx`, la otra página pública que ya lee parámetros de la
// URL en este proyecto.
//
// Lee `comprobantes_publicos/{id}` (functions/src/comprobantePublico.ts) —
// una colección espejo con SOLO los campos seguros (nombre, carrera,
// universidad, empresa, puesto, fechas, horas, estado), nunca el original
// `comprobantes_pasantia` (que exige sesión y pertenencia).
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AutoText as Text } from '../src/components/AutoText';
import { fmtFechaLarga } from '../src/utils/constanciaHtml';
import { getComprobantePublico, type ComprobantePublico } from '../src/services/comprobanteService';

// Paleta fija (no useTheme()): igual que app/auth/action.tsx y
// app/bienvenida.tsx, esta pantalla se ve siempre igual para un visitante
// sin cuenta ni preferencia de tema guardada.
const C = {
  bg: '#07050f',
  surface: '#0d0b1e',
  accent: '#8b5cf6',
  accent70: 'rgba(167,139,250,1)',
  text: '#ffffff',
  textSub: 'rgba(255,255,255,0.65)',
  textMuted: 'rgba(255,255,255,0.38)',
  border: 'rgba(139,92,246,0.22)',
  hair: 'rgba(255,255,255,0.08)',
  red: '#ef4444',
  redBg: 'rgba(239,68,68,0.10)',
  redBorder: 'rgba(239,68,68,0.35)',
  green: '#22c55e',
  greenBg: 'rgba(34,197,94,0.12)',
  greenBorder: 'rgba(34,197,94,0.35)',
  amber: '#f59e0b',
  amberBg: 'rgba(245,158,11,0.12)',
  amberBorder: 'rgba(245,158,11,0.35)',
};

type Fase = 'cargando' | 'encontrado' | 'no-encontrado' | 'error';

export default function VerificarComprobante() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id.trim() : '';

  const [fase, setFase] = useState<Fase>('cargando');
  const [comp, setComp] = useState<ComprobantePublico | null>(null);
  const [intento, setIntento] = useState(0);

  const cargar = useCallback(async () => {
    if (!id) {
      setFase('no-encontrado');
      return;
    }
    setFase('cargando');
    try {
      const r = await getComprobantePublico(id);
      if (r) {
        setComp(r);
        setFase('encontrado');
      } else {
        setFase('no-encontrado');
      }
    } catch {
      setFase('error');
    }
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar, intento]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.card}>
        <View style={styles.brandRow}>
          <Ionicons name="shield-checkmark-outline" size={16} color={C.accent70} />
          <Text style={styles.brandText}>VERIFICACIÓN GRADLY</Text>
        </View>

        {fase === 'cargando' && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={C.accent} />
            <Text style={styles.loadingText}>Verificando comprobante…</Text>
          </View>
        )}

        {fase === 'encontrado' && comp && <ComprobanteEncontrado comp={comp} />}

        {fase === 'no-encontrado' && (
          <View>
            <View style={[styles.iconWrap, styles.iconWrapErr]}>
              <Ionicons name="close-circle-outline" size={34} color={C.red} />
            </View>
            <Text style={styles.title}>Comprobante no encontrado</Text>
            <Text style={styles.sub}>
              Este enlace no corresponde a ningún comprobante emitido por Gradly.
            </Text>
          </View>
        )}

        {fase === 'error' && (
          <View>
            <View style={[styles.iconWrap, styles.iconWrapWarn]}>
              <Ionicons name="wifi-outline" size={34} color={C.amber} />
            </View>
            <Text style={styles.title}>No se pudo verificar</Text>
            <Text style={styles.sub}>
              No se pudo verificar el documento. Revisa tu conexión e intenta de nuevo.
            </Text>
            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={() => setIntento((n) => n + 1)}
              activeOpacity={0.85}
            >
              <Text style={styles.btnPrimaryText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

function ComprobanteEncontrado({ comp }: { comp: ComprobantePublico }) {
  const validado = comp.estado === 'validado';
  return (
    <View>
      <View
        style={[
          styles.badge,
          validado ? styles.badgeOk : styles.badgeWarn,
        ]}
      >
        <Ionicons
          name={validado ? 'checkmark-circle' : 'time-outline'}
          size={16}
          color={validado ? C.green : C.amber}
        />
        <Text style={[styles.badgeText, { color: validado ? C.green : C.amber }]}>
          {validado ? 'Validado por la universidad' : 'Pendiente de validación universitaria'}
        </Text>
      </View>

      <Text style={styles.nombre} noTranslate>{comp.estudianteNombre || '—'}</Text>
      {!!comp.carrera && (
        <Text style={styles.carrera} noTranslate>{comp.carrera}</Text>
      )}

      <View style={styles.rule} />

      <InfoRow icon="school-outline" label="Universidad" valor={comp.universidadNombre} />
      <InfoRow icon="business-outline" label="Empresa" valor={comp.empresaNombre} />
      {!!comp.vacanteTitulo && (
        <InfoRow icon="briefcase-outline" label="Puesto" valor={comp.vacanteTitulo} />
      )}
      <InfoRow
        icon="calendar-outline"
        label="Período"
        valor={`${fmtFechaLarga(comp.fechaInicio)} — ${fmtFechaLarga(comp.fechaFin)}`}
      />
      <InfoRow
        icon="hourglass-outline"
        label="Horas cumplidas"
        valor={`${Math.round(comp.horasCumplidas)} horas`}
      />

      <Text style={styles.footNote}>
        Este comprobante fue emitido a través de Gradly y corresponde a una pasantía real registrada
        en la plataforma.
      </Text>
    </View>
  );
}

function InfoRow({ icon, label, valor }: { icon: keyof typeof Ionicons.glyphMap; label: string; valor: string }) {
  if (!valor) return null;
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={16} color={C.accent70} style={styles.infoIcon} />
      <View style={styles.infoTexts}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValor} noTranslate>{valor}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: C.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 28,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 22,
  },
  brandText: {
    color: C.textMuted,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.4,
  },

  centered: { alignItems: 'center', justifyContent: 'center', gap: 16, paddingVertical: 24 },
  loadingText: { color: C.textSub, fontSize: 15 },

  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderWidth: 2,
    borderColor: 'rgba(139,92,246,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 18,
  },
  iconWrapErr: { backgroundColor: C.redBg, borderColor: C.redBorder },
  iconWrapWarn: { backgroundColor: C.amberBg, borderColor: C.amberBorder },

  title: { fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 6, textAlign: 'center' },
  sub: { fontSize: 14, color: C.textSub, marginBottom: 20, lineHeight: 20, textAlign: 'center' },

  btnPrimary: {
    height: 46,
    backgroundColor: '#7c3aed',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: { fontSize: 14, fontWeight: '600', color: C.text },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 18,
  },
  badgeOk: { backgroundColor: C.greenBg, borderColor: C.greenBorder },
  badgeWarn: { backgroundColor: C.amberBg, borderColor: C.amberBorder },
  badgeText: { fontSize: 12.5, fontWeight: '800' },

  nombre: { fontSize: 22, fontWeight: '800', color: C.text, textAlign: 'center' },
  carrera: { fontSize: 14, color: C.textSub, textAlign: 'center', marginTop: 4 },

  rule: { height: 1, backgroundColor: C.hair, marginTop: 18, marginBottom: 16 },

  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  infoIcon: { marginTop: 2 },
  infoTexts: { flex: 1 },
  infoLabel: { fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 0.3 },
  infoValor: { fontSize: 14.5, color: C.text, fontWeight: '600', marginTop: 2 },

  footNote: { fontSize: 12, color: C.textMuted, lineHeight: 17, textAlign: 'center', marginTop: 8 },
});
