// ════════════════════════════════════════════════════════════════════════
// ChatAudioRecorderModal.tsx — grabar y enviar un mensaje de voz en el chat.
//
// El padre (ChatThread) lo monta SOLO cuando `visible` es true, así los hooks
// de `expo-audio` (useAudioRecorder / useAudioRecorderState) arrancan y se
// liberan limpio en cada apertura.
//
// Flujo:
//   abrir → permiso → graba automáticamente (fase 'grabando', ondas + contador)
//     · Pausar / Reanudar   → recorder.pause() / recorder.record()
//     · Listo (■)           → recorder.stop() → fase 'listo'
//   fase 'listo' → reproductor con barra para saltar a un punto + Eliminar / Enviar
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { AutoText as Text } from './AutoText';
import { FONTS, useTheme, type GradlyColors } from '../context/ThemeContext';

const N_BARRAS = 30;
const REC_OPTS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

/** ms → "M:SS". */
export function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

interface Props {
  visible: boolean;
  onCancel: () => void;
  onEnviar: (uri: string, durationMs: number) => void;
  enviando?: boolean;
}

export default function ChatAudioRecorderModal({ visible, onCancel, onEnviar, enviando = false }: Props) {
  const { colors } = useTheme();
  const s = makeStyles(colors);

  const recorder = useAudioRecorder(REC_OPTS);
  const recState = useAudioRecorderState(recorder, 120);

  const [fase, setFase] = useState<'preparando' | 'grabando' | 'pausado' | 'listo' | 'error'>('preparando');
  const [errMsg, setErrMsg] = useState('');
  const [grabUri, setGrabUri] = useState<string | null>(null);
  const [grabMs, setGrabMs] = useState(0);
  const barras = useRef<number[]>(new Array(N_BARRAS).fill(0.12));
  const [, forceTick] = useState(0);

  // Arranque: permiso → modo audio → grabar.
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const perm = await requestRecordingPermissionsAsync();
        if (cancel) return;
        if (!perm.granted) {
          setErrMsg('Necesitamos permiso para usar el micrófono.');
          setFase('error');
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        if (cancel) return;
        recorder.record();
        setFase('grabando');
      } catch (e) {
        console.warn('[audio] no se pudo iniciar la grabación', e);
        if (!cancel) {
          setErrMsg('No se pudo iniciar la grabación.');
          setFase('error');
        }
      }
    })();
    return () => {
      cancel = true;
      // Limpieza: si sigue grabando al desmontar, corta; y libera el modo audio.
      try {
        if (recorder.isRecording) void recorder.stop();
      } catch {
        /* no-op */
      }
      void setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    };
    // Solo al montar (el padre remonta el componente en cada apertura).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Alimenta las ondas con el nivel del micro (metering en dBFS) mientras graba.
  useEffect(() => {
    if (fase !== 'grabando') return;
    const m = recState.metering;
    const amp =
      typeof m === 'number' && Number.isFinite(m)
        ? Math.min(1, Math.max(0.08, (m + 60) / 60))
        : 0.25 + Math.random() * 0.55;
    barras.current = [...barras.current.slice(1), amp];
    forceTick((n) => n + 1);
  }, [recState.metering, recState.durationMillis, fase]);

  const detener = async () => {
    try {
      await recorder.stop();
      setGrabUri(recorder.uri ?? null);
      setGrabMs(recState.durationMillis || 0);
      setFase('listo');
      void setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    } catch (e) {
      console.warn('[audio] error al detener', e);
      setErrMsg('No se pudo finalizar la grabación.');
      setFase('error');
    }
  };

  const pausar = () => {
    try {
      recorder.pause();
      setFase('pausado');
    } catch {
      /* no-op */
    }
  };
  const reanudar = () => {
    try {
      recorder.record();
      setFase('grabando');
    } catch {
      /* no-op */
    }
  };

  const durMostrada = fase === 'listo' ? grabMs : recState.durationMillis;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.header}>
            <Ionicons name="mic-outline" size={18} color={colors.primaryLight} />
            <Text style={s.title}>Mensaje de voz</Text>
            <TouchableOpacity onPress={onCancel} hitSlop={10} disabled={enviando}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {fase === 'error' ? (
            <View style={s.body}>
              <Ionicons name="alert-circle-outline" size={30} color={colors.error} />
              <Text style={[s.errTxt, { color: colors.error }]}>{errMsg}</Text>
              <TouchableOpacity style={[s.btnGhost, { borderColor: colors.border }]} onPress={onCancel}>
                <Text style={[s.btnGhostTxt, { color: colors.textSecondary }]}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          ) : fase === 'preparando' ? (
            <View style={s.body}>
              <ActivityIndicator color={colors.primary} />
              <Text style={s.hint}>Preparando el micrófono…</Text>
            </View>
          ) : fase === 'listo' ? (
            <View style={s.body}>
              {grabUri ? <PreviewPlayer uri={grabUri} durationMs={grabMs} colors={colors} /> : null}
              <View style={s.rowBtns}>
                <TouchableOpacity
                  style={[s.btnGhost, { borderColor: colors.error + '66' }]}
                  onPress={onCancel}
                  disabled={enviando}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.error} />
                  <Text style={[s.btnGhostTxt, { color: colors.error }]}>Eliminar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.btnPrimary, { backgroundColor: colors.primary, opacity: enviando ? 0.6 : 1 }]}
                  onPress={() => grabUri && onEnviar(grabUri, grabMs)}
                  disabled={enviando || !grabUri}
                >
                  {enviando ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="send" size={16} color="#fff" />
                      <Text style={s.btnPrimaryTxt}>Enviar</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            // grabando / pausado
            <View style={s.body}>
              <View style={s.waveRow}>
                {barras.current.map((h, i) => (
                  <View
                    key={i}
                    style={[
                      s.waveBar,
                      {
                        height: 6 + h * 46,
                        backgroundColor: fase === 'pausado' ? colors.textMuted : colors.primary,
                        opacity: fase === 'pausado' ? 0.5 : 1,
                      },
                    ]}
                  />
                ))}
              </View>
              <Text style={s.timer} noTranslate>{mmss(durMostrada)}</Text>
              {fase === 'pausado' ? <Text style={s.hint}>En pausa</Text> : null}
              <View style={s.rowBtns}>
                {fase === 'grabando' ? (
                  <TouchableOpacity style={[s.btnGhost, { borderColor: colors.border }]} onPress={pausar}>
                    <Ionicons name="pause" size={16} color={colors.textSecondary} />
                    <Text style={[s.btnGhostTxt, { color: colors.textSecondary }]}>Pausar</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[s.btnGhost, { borderColor: colors.border }]} onPress={reanudar}>
                    <Ionicons name="mic" size={16} color={colors.primary} />
                    <Text style={[s.btnGhostTxt, { color: colors.primary }]}>Reanudar</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[s.btnPrimary, { backgroundColor: colors.primary }]}
                  onPress={detener}
                >
                  <Ionicons name="stop" size={16} color="#fff" />
                  <Text style={s.btnPrimaryTxt}>Listo</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

/** Reproductor de la grabación ya finalizada (play/pausa + barra para saltar). */
function PreviewPlayer({
  uri,
  durationMs,
  colors,
}: {
  uri: string;
  durationMs: number;
  colors: GradlyColors;
}) {
  const s = makeStyles(colors);
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const [trackW, setTrackW] = useState(0);

  const total = status.duration || durationMs / 1000 || 1;
  const pos = Math.min(1, (status.currentTime || 0) / total);

  const seek = (x: number) => {
    if (trackW <= 0) return;
    void player.seekTo(Math.max(0, Math.min(1, x / trackW)) * total);
  };

  return (
    <View style={s.playerBox}>
      <TouchableOpacity
        style={[s.playBtn, { backgroundColor: colors.primary }]}
        onPress={() => (status.playing ? player.pause() : player.play())}
      >
        <Ionicons name={status.playing ? 'pause' : 'play'} size={18} color="#fff" />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Pressable
          style={s.track}
          onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
          onPress={(e) => seek(e.nativeEvent.locationX)}
        >
          <View style={[s.trackBase, { backgroundColor: colors.border }]} />
          <View style={[s.trackFill, { width: `${pos * 100}%`, backgroundColor: colors.primary }]} />
          <View style={[s.trackKnob, { left: `${pos * 100}%`, backgroundColor: colors.primary }]} />
        </Pressable>
        <Text style={s.playerTime} noTranslate>
          {mmss((status.currentTime || 0) * 1000)} / {mmss(total * 1000)}
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (C: GradlyColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(7,5,15,0.9)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 18,
    },
    sheet: {
      width: '100%',
      maxWidth: 440,
      alignSelf: 'center',
      backgroundColor: C.backgroundCard,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    title: { flex: 1, fontSize: 14, fontFamily: FONTS.soraSemiBold, color: C.primaryLight },
    body: { padding: 20, gap: 16, alignItems: 'center' },
    hint: { fontSize: 13, fontFamily: FONTS.interRegular, color: C.textMuted },
    errTxt: { fontSize: 13, fontFamily: FONTS.interMedium, textAlign: 'center' },

    waveRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      height: 58,
      alignSelf: 'stretch',
    },
    waveBar: { width: 4, borderRadius: 2 },
    timer: { fontSize: 22, fontFamily: FONTS.soraBold, color: C.textPrimary, letterSpacing: 1 },

    rowBtns: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
    btnGhost: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 12,
    },
    btnGhostTxt: { fontSize: 13, fontFamily: FONTS.interSemiBold },
    btnPrimary: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 12,
      paddingVertical: 12,
    },
    btnPrimaryTxt: { fontSize: 14, fontFamily: FONTS.interSemiBold, color: '#fff' },

    playerBox: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'stretch' },
    playBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
    track: {
      height: 22,
      justifyContent: 'center',
    },
    trackBase: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 4,
      borderRadius: 2,
    },
    trackFill: {
      position: 'absolute',
      left: 0,
      height: 4,
      borderRadius: 2,
    },
    trackKnob: {
      position: 'absolute',
      width: 12,
      height: 12,
      borderRadius: 6,
      marginLeft: -6,
    },
    playerTime: { fontSize: 11, fontFamily: FONTS.interRegular, color: C.textMuted, marginTop: 6 },
  });
