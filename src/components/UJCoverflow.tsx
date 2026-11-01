// ════════════════════════════════════════════════════════════════════════
// UJCoverflow — carrusel 3D "coverflow" de la galería de /bienvenida.
// Réplica del que usa la galería de Xidecode (JS-Trick): la tarjeta activa
// se ve de frente y las vecinas se inclinan hacia atrás, más pequeñas y
// más tenues. Se navega con las flechas, los puntos, tocando una tarjeta
// lateral o deslizando; avanza solo hasta que la persona lo toca.
// Los transforms con perspectiva solo existen en web (RN nativo no los
// soporta como cadena), así que esta pieza solo se usa allí.
// ════════════════════════════════════════════════════════════════════════
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { FONTS } from '../context/ThemeContext';

export type CoverItem = { src: any; titulo: string; sub: string };

export default function UJCoverflow({ items }: { items: CoverItem[] }) {
  const n = items.length;
  const [idx, setIdx] = useState(0);
  const tocado = useRef(false);
  const sx = useRef<number | null>(null);

  const ir = (i: number, persona = true) => {
    if (persona) tocado.current = true;
    setIdx(((i % n) + n) % n);
  };

  // avanza solo cada 4,5 s hasta que la persona lo toca
  useEffect(() => {
    if (Platform.OS !== 'web' || n < 2) return;
    const t = setInterval(() => {
      if (!tocado.current) setIdx((v) => (v + 1) % n);
    }, 4500);
    return () => clearInterval(t);
  }, [n]);

  if (!n) return null;

  return (
    <View
      style={
        {
          height: 430,
          marginTop: 14,
          perspective: 1400,
          transformStyle: 'preserve-3d',
          width: '100%',
        } as any
      }
      onTouchStart={(e) => {
        sx.current = e.nativeEvent.pageX;
      }}
      onTouchEnd={(e) => {
        if (sx.current != null && Math.abs(e.nativeEvent.pageX - sx.current) > 50) {
          ir(idx + (e.nativeEvent.pageX < sx.current ? 1 : -1));
        }
        sx.current = null;
      }}
    >
      <View style={{ ...StyleSheet.absoluteFillObject, transformStyle: 'preserve-3d' } as any}>
        {items.map((it, k) => {
          let d = k - idx;
          if (d > n / 2) d -= n;
          if (d < -n / 2) d += n;
          const a = Math.abs(d);
          return (
            <Pressable
              key={it.titulo}
              onPress={() => d !== 0 && ir(k)}
              accessibilityLabel={it.titulo}
              style={
                {
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: '86%',
                  maxWidth: 560,
                  aspectRatio: 1.55,
                  borderRadius: 22,
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: d === 0 ? 'rgba(136,144,213,0.55)' : 'rgba(255,255,255,0.08)',
                  backgroundColor: '#131318',
                  transform: `translate(-50%,-50%) translateX(${d * 58}%) translateZ(${-a * 150}px) rotateY(${-d * 40}deg) scale(${1 - a * 0.06})`,
                  opacity: a > 2 ? 0 : 1 - a * 0.28,
                  zIndex: 10 - a,
                  pointerEvents: a > 2 ? 'none' : 'auto',
                  cursor: d === 0 ? 'default' : 'pointer',
                  boxShadow: d === 0 ? '0 40px 90px rgba(0,0,0,.65), 0 0 60px rgba(89,99,196,.28)' : '0 30px 70px rgba(0,0,0,.55)',
                  transition: 'transform .6s cubic-bezier(.2,.8,.2,1), opacity .5s, border-color .3s',
                } as any
              }
            >
              <Image source={it.src} resizeMode="cover" style={StyleSheet.absoluteFillObject} />
              <View
                style={
                  {
                    ...StyleSheet.absoluteFillObject,
                    backgroundImage: 'linear-gradient(transparent 40%, rgba(11,11,15,.92))',
                    justifyContent: 'flex-end',
                    padding: 18,
                  } as any
                }
              >
                <Text style={styles.titulo}>{it.titulo}</Text>
                <Text style={styles.sub}>{it.sub}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Pressable onPress={() => ir(idx - 1)} accessibilityLabel="Anterior" style={[styles.nav, { left: 0 }]}>
        <Ionicons name="chevron-back" size={20} color="#8890D5" />
      </Pressable>
      <Pressable onPress={() => ir(idx + 1)} accessibilityLabel="Siguiente" style={[styles.nav, { right: 0 }]}>
        <Ionicons name="chevron-forward" size={20} color="#8890D5" />
      </Pressable>

      <View style={styles.dots}>
        {items.map((it, k) => (
          <Pressable
            key={it.titulo}
            onPress={() => ir(k)}
            accessibilityLabel={`Ir a ${it.titulo}`}
            style={
              {
                height: 10,
                width: k === idx ? 26 : 10,
                borderRadius: 6,
                backgroundColor: k === idx ? '#8890D5' : 'rgba(255,255,255,0.22)',
                boxShadow: k === idx ? '0 0 12px #8890D5' : undefined,
                transition: 'all .25s',
              } as any
            }
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  titulo: { color: '#fff', fontSize: 18, fontFamily: FONTS.soraExtraBold },
  sub: { color: 'rgba(255,255,255,.78)', fontSize: 13, fontFamily: FONTS.interRegular, marginTop: 2 },
  nav: {
    position: 'absolute',
    top: '50%',
    marginTop: -23,
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(14,16,24,.85)',
    borderWidth: 1,
    borderColor: 'rgba(136,144,213,.4)',
    zIndex: 30,
  },
  dots: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    zIndex: 30,
  },
});
