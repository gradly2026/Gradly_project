// ════════════════════════════════════════════════════════════════════════
// ChatAudioBubble.tsx — reproductor compacto de un mensaje de voz dentro de la
// burbuja del hilo (`renderMessageAudio` de gifted-chat).
//
// Un `useAudioPlayer` por burbuja; gifted-chat usa FlatList, así que solo las
// visibles montan (y `useAudioPlayer` se libera al desmontar).
// ════════════════════════════════════════════════════════════════════════

import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AutoText as Text } from './AutoText';
import { FONTS, useTheme } from '../context/ThemeContext';

/** ms → "M:SS". */
function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

interface Props {
  url?: string;
  durationMs?: number;
  /** true = burbuja propia (fondo primario) → iconos y barra en blanco. */
  mine?: boolean;
}

export default function ChatAudioBubble({ url, durationMs, mine }: Props) {
  const { colors } = useTheme();
  const player = useAudioPlayer(url || undefined);
  const status = useAudioPlayerStatus(player);
  const [trackW, setTrackW] = useState(0);

  if (!url) return null;

  const accent = mine ? '#fff' : colors.primary;
  const dim = mine ? 'rgba(255,255,255,0.35)' : colors.border;
  const timeColor = mine ? 'rgba(255,255,255,0.75)' : colors.textMuted;

  const total = status.duration || (durationMs ? durationMs / 1000 : 0) || 1;
  const cur = status.currentTime || 0;
  const pos = Math.min(1, cur / total);

  const seek = (x: number) => {
    if (trackW <= 0) return;
    void player.seekTo(Math.max(0, Math.min(1, x / trackW)) * total);
  };

  return (
    <View style={s.row}>
      <Pressable
        onPress={() => (status.playing ? player.pause() : player.play())}
        hitSlop={6}
        style={[s.playBtn, { borderColor: accent }]}
        accessibilityLabel="Reproducir mensaje de voz"
      >
        <Ionicons name={status.playing ? 'pause' : 'play'} size={16} color={accent} />
      </Pressable>
      <View style={s.mid}>
        <Pressable
          style={s.track}
          onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
          onPress={(e) => seek(e.nativeEvent.locationX)}
        >
          <View style={[s.trackBase, { backgroundColor: dim }]} />
          <View style={[s.trackFill, { width: `${pos * 100}%`, backgroundColor: accent }]} />
        </Pressable>
        <Text style={[s.time, { color: timeColor }]} noTranslate>
          {status.playing || cur > 0 ? mmss(cur * 1000) : mmss(total * 1000)}
        </Text>
      </View>
      <Ionicons name="mic" size={14} color={timeColor} />
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 190,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  playBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mid: { flex: 1, gap: 5 },
  track: { height: 16, justifyContent: 'center' },
  trackBase: { position: 'absolute', left: 0, right: 0, height: 3, borderRadius: 2 },
  trackFill: { position: 'absolute', left: 0, height: 3, borderRadius: 2 },
  time: { fontSize: 10, fontFamily: FONTS.interRegular },
});
