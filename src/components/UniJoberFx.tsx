// ════════════════════════════════════════════════════════════════════════
// UniJoberFx — efectos 3D ligeros de la bienvenida (/bienvenida), tal como
// se aprobaron en la maqueta HTML. SOLO web: en nativo todo devuelve null /
// no hace nada y la pantalla queda como siempre.
//
//   - useUniJoberFx()  → activa los efectos para todos los elementos que
//                        lleven dataSet: `ujRev` (aparece con desvanecimiento
//                        al hacer scroll) y `ujFx` (tarjeta que se inclina con
//                        el cursor y se ilumina donde pasa el mouse). También
//                        mueve el fondo y la escena 3D con el cursor.
//   - <UJBackground/>  → fondo: piso en perspectiva que avanza + luces
//                        suaves que siguen al cursor.
//   - <UJHeroScene/>   → tarjetas flotantes a distintas profundidades.
//   - <UJBrandMark/>   → emblema + "UniJober" con degradado; sus ids
//                        (#uj-brand-emb / #uj-brand-txt) son el destino al
//                        que aterriza la animación de carga (UniJoberIntro).
// Los efectos respetan "reducir movimiento".
// ════════════════════════════════════════════════════════════════════════
import { createElement, useEffect } from 'react';
import { Image, Platform, StyleSheet, Text as RNText, View } from 'react-native';
import { FONTS } from '../context/ThemeContext';
import { EMBLEM_DEFS, EMBLEM_INNER, EMBLEM_VIEWBOX } from './uniJoberEmblem';
import { mFeed, phone3d, STORIES_CSS } from './ujStoriesContent';

const LOGO_NATIVO = require('../../assets/images/LogoGradlyRecorte.png');

/** Atributos para marcar un View como "aparece al hacer scroll" / "se inclina". */
export const REV = { dataSet: { ujRev: '1' } } as any;
export const FX = { dataSet: { ujFx: '1' } } as any;

const FX_CSS = `
html.uj-js [data-uj-rev]{opacity:0;transform:translateY(34px) scale(.985);transition:opacity .9s ease,transform .9s cubic-bezier(.2,.8,.2,1)}
html.uj-js [data-uj-rev].uj-in{opacity:1;transform:none}
[data-uj-fx]{transition:transform .14s ease-out,border-color .25s ease,box-shadow .25s ease;will-change:transform}
[data-uj-fx]:hover{border-color:rgba(136,144,213,.55)!important;box-shadow:0 18px 44px -18px rgba(89,99,196,.55)}
[data-uj-fx]::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity .25s;
 background:radial-gradient(260px circle at var(--mx,50%) var(--my,0%),rgba(136,144,213,.18),transparent 60%)}
[data-uj-fx]:hover::after{opacity:1}
[data-uj=bg]{perspective:1100px;overflow:hidden}
[data-uj=floor]{position:absolute;left:-30%;right:-30%;bottom:-8%;height:62%;transform:rotateX(68deg);transform-origin:50% 100%;
 background:linear-gradient(rgba(136,144,213,.16) 1px,transparent 1px) 0 0/100% 60px,linear-gradient(90deg,rgba(136,144,213,.16) 1px,transparent 1px) 0 0/80px 100%;
 -webkit-mask-image:linear-gradient(to top,#000 10%,transparent 85%);mask-image:linear-gradient(to top,#000 10%,transparent 85%);animation:ujflow 5s linear infinite}
@keyframes ujflow{to{background-position:0 60px,0 0}}
[data-uj=orb]{position:absolute;border-radius:50%;will-change:transform;transition:transform .35s ease-out}
[data-uj=scene]{transition:transform .18s ease-out;transform-style:preserve-3d}
[data-uj=gc]{will-change:transform;animation:ujfloat 7s ease-in-out infinite}
@keyframes ujfloat{50%{margin-top:-14px}}
[data-uj=brandtxt]{display:flex;letter-spacing:-.02em;padding-bottom:.12em}
@media (prefers-reduced-motion:reduce){[data-uj=floor],[data-uj=gc]{animation:none!important}html.uj-js [data-uj-rev]{opacity:1;transform:none}}
`;

export function useUniJoberFx() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const html = document.documentElement;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const style = document.createElement('style');
    style.setAttribute('data-uj-fx', '1');
    style.textContent = FX_CSS;
    document.head.appendChild(style);
    html.classList.add('uj-js');

    // ── aparecer con desvanecimiento al entrar en pantalla ──
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            (e.target as HTMLElement).classList.add('uj-in');
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.12 },
    );
    const seen = new WeakSet<Element>();
    const scan = () =>
      document.querySelectorAll('[data-uj-rev]').forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        if (reduce) el.classList.add('uj-in');
        else io.observe(el);
      });
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });

    // ── inclinación de tarjetas + movimiento del fondo con el cursor ──
    let cur: HTMLElement | null = null;
    const onMove = (ev: PointerEvent) => {
      const t = ev.target as Element | null;
      const el = (t && (t as any).closest ? (t as any).closest('[data-uj-fx]') : null) as HTMLElement | null;
      if (cur && cur !== el) {
        cur.style.transform = '';
        cur = null;
      }
      if (el) {
        const r = el.getBoundingClientRect();
        const x = (ev.clientX - r.left) / r.width;
        const y = (ev.clientY - r.top) / r.height;
        el.style.transform = `perspective(800px) rotateY(${(x - 0.5) * 12}deg) rotateX(${(0.5 - y) * 12}deg) translateZ(6px)`;
        el.style.setProperty('--mx', x * 100 + '%');
        el.style.setProperty('--my', y * 100 + '%');
        cur = el;
      }
      const nx = ev.clientX / window.innerWidth - 0.5;
      const ny = ev.clientY / window.innerHeight - 0.5;
      document.querySelectorAll<HTMLElement>('[data-uj=orb]').forEach((o) => {
        const d = Number(o.dataset.depth || 20);
        o.style.transform = `translate(${nx * d * 2}px,${ny * d * 2}px)`;
      });
      document.querySelectorAll<HTMLElement>('[data-uj=scene]').forEach((s) => {
        s.style.transform = `rotateY(${nx * 16}deg) rotateX(${-ny * 12}deg)`;
      });
    };
    const onLeave = () => {
      if (cur) cur.style.transform = '';
      cur = null;
      document.querySelectorAll<HTMLElement>('[data-uj=scene]').forEach((s) => (s.style.transform = ''));
    };
    if (!reduce) {
      window.addEventListener('pointermove', onMove, { passive: true });
      document.addEventListener('pointerleave', onLeave);
    }
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      io.disconnect();
      mo.disconnect();
      html.classList.remove('uj-js');
      style.remove();
    };
  }, []);
}

/** Fondo de la bienvenida: piso en perspectiva + luces suaves (reemplaza la foto fija). */
export function UJBackground() {
  if (Platform.OS !== 'web') return null;
  const orb = (extra: any, depth: number) => (
    <View
      {...({ dataSet: { uj: 'orb', depth: String(depth) } } as any)}
      style={[{ position: 'absolute' }, extra] as any}
    />
  );
  return (
    <View
      {...({ dataSet: { uj: 'bg' } } as any)}
      pointerEvents="none"
      style={{ ...StyleSheet.absoluteFillObject, zIndex: 0 } as any}
    >
      {orb({ left: -140, top: 40, width: 560, height: 560, background: 'radial-gradient(circle, rgba(89,99,196,.42) 0%, rgba(89,99,196,.18) 40%, transparent 70%)' }, 30)}
      {orb({ right: -120, top: 260, width: 480, height: 480, background: 'radial-gradient(circle, rgba(59,139,214,.26) 0%, rgba(59,139,214,.10) 40%, transparent 70%)' }, -24)}
      {orb({ left: '42%', bottom: 40, width: 380, height: 380, background: 'radial-gradient(circle, rgba(136,144,213,.22) 0%, rgba(136,144,213,.08) 40%, transparent 70%)' }, 18)}
      <View {...({ dataSet: { uj: 'floor' } } as any)} />
    </View>
  );
}

/** Escena 3D del hero: tarjetas de ejemplo a distintas profundidades. */
export function UJHeroScene({ width = 520 }: { width?: number }) {
  if (Platform.OS !== 'web') return null;
  const card = (key: string, pos: any, delay: number, z: number, children: any) => (
    <View
      key={key}
      {...({ dataSet: { uj: 'gc' } } as any)}
      style={
        {
          position: 'absolute',
          backgroundColor: '#15151c',
          borderWidth: 1,
          borderColor: '#2A2A34',
          borderRadius: 20,
          padding: 18,
          transform: `translateZ(${z}px)`,
          boxShadow: '0 30px 60px -20px #000, inset 0 1px 0 rgba(255,255,255,.07)',
          animationDelay: `${delay}s`,
          ...pos,
        } as any
      }
    >
      {children}
    </View>
  );
  const small = { fontSize: 12, color: '#9696A8', fontFamily: FONTS.interRegular } as const;
  const big = { fontSize: 17, color: '#F4F4F8', fontFamily: FONTS.soraExtraBold } as const;
  return (
    <View style={{ width: '100%', maxWidth: width, height: 470, perspective: 1100 } as any}>
      <View {...({ dataSet: { uj: 'scene' } } as any)} style={{ flex: 1 } as any}>
        {createElement(
          'div',
          {
            className: 'ujs ujh',
            suppressHydrationWarning: true,
            style: { position: 'absolute', left: '50%', top: '50%', width: 200, marginLeft: -100, marginTop: -212, transformStyle: 'preserve-3d', transform: 'rotateY(-22deg) rotateX(4deg)' },
          } as any,
          createElement('style', { dangerouslySetInnerHTML: { __html: STORIES_CSS + '.ujh .ujs-ph{width:200px}.ujh .ujs-pscr{font-size:8.3px}' } } as any),
          createElement('div', { dangerouslySetInnerHTML: { __html: phone3d(mFeed()) }, suppressHydrationWarning: true, style: { transformStyle: 'preserve-3d' } } as any),
        )}
        {card('a', { left: 0, top: '2%', width: '47%' }, 0, 40, (
          <>
            <RNText style={small}>Tu pasantía activa</RNText>
            <RNText style={big}>Analista de Datos Jr.</RNText>
            <View style={{ height: 8, borderRadius: 8, backgroundColor: '#2A2A34', marginTop: 12, overflow: 'hidden' }}>
              <View style={{ width: '62%', height: '100%', borderRadius: 8, backgroundColor: '#8890D5' }} />
            </View>
            <RNText style={{ ...small, marginTop: 8 }}>124 de 200 horas · 62 %</RNText>
          </>
        ))}
        {card('b', { right: 0, top: '38%', width: '46%' }, 2, 110, (
          <>
            <RNText style={small}>Chat con tu empresa</RNText>
            <View style={{ marginTop: 10, gap: 8 }}>
              <View style={{ backgroundColor: '#22222c', padding: 10, borderRadius: 12, maxWidth: '90%' }}>
                <RNText style={{ ...small, color: '#F4F4F8' }}>¿Puedes llegar mañana a las 8?</RNText>
              </View>
              <View style={{ backgroundColor: '#5963C4', padding: 10, borderRadius: 12, alignSelf: 'flex-end' }}>
                <RNText style={{ ...small, color: '#fff' }}>Claro, ahí estaré.</RNText>
              </View>
            </View>
          </>
        ))}
        {card('c', { left: 0, bottom: '1%', width: '44%' }, 4, 70, (
          <>
            <RNText style={small}>Al terminar</RNText>
            <RNText style={big}>Comprobante validado</RNText>
            <RNText style={{ ...small, color: '#7fe0b0', marginTop: 8 }}>Certificado por tu universidad</RNText>
          </>
        ))}
      </View>
    </View>
  );
}

/** Teléfono 3D tenue detrás del texto del hero en pantallas angostas (sin tarjetas). */
export function UJHeroPhoneBg() {
  if (Platform.OS !== 'web') return null;
  return createElement(
    'div',
    {
      className: 'ujs',
      'aria-hidden': 'true',
      suppressHydrationWarning: true,
      style: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 0, perspective: 1200, overflow: 'hidden' },
    } as any,
    createElement('style', { dangerouslySetInnerHTML: { __html: STORIES_CSS + '.ujb .ujs-ph{width:250px}.ujb .ujs-pscr{font-size:10.4px}' } } as any),
    createElement(
      'div',
      {
        className: 'ujb',
        suppressHydrationWarning: true,
        dangerouslySetInnerHTML: { __html: phone3d(mFeed()) },
        style: { opacity: 0.22, transformStyle: 'preserve-3d', transform: 'rotateY(-24deg) rotateX(6deg) rotateZ(4deg)', filter: 'blur(.5px)' },
      } as any,
    ),
  );
}

/** Marca de la barra superior. En web es el DESTINO de la animación de carga. */
export function UJBrandMark({ color = '#F4F4F8' }: { color?: string }) {
  if (Platform.OS !== 'web') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Image source={LOGO_NATIVO} style={{ width: 30, height: 35 }} resizeMode="contain" />
        <RNText style={{ fontSize: 22, color, fontFamily: FONTS.soraExtraBold }}>UniJober</RNText>
      </View>
    );
  }
  const inner = EMBLEM_INNER.replace(/url\(#ujg\)/g, 'url(#ujg2)');
  const defs = EMBLEM_DEFS.replace('id="ujg"', 'id="ujg2"');
  const svg =
    `<svg id="uj-brand-emb" viewBox="${EMBLEM_VIEWBOX}" fill="none" aria-hidden="true" ` +
    `style="height:35px;width:auto;display:block;flex:none"><defs>${defs}</defs><g>${inner}</g></svg>`;
  const letters = 'UniJober'
    .split('')
    .map((c, i) => `<span style="color:${i < 3 ? '#F4F4F8' : '#8890D5'}">${c}</span>`)
    .join('');
  const txt =
    `<div id="uj-brand-txt" data-uj="brandtxt" aria-label="UniJober" ` +
    `style="font-family:${FONTS.soraExtraBold},Sora,sans-serif;font-weight:400;font-size:22px;line-height:1">${letters}</div>`;
  return createElement('div', {
    style: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4.2, height: 35 },
    dangerouslySetInnerHTML: { __html: svg + txt },
  } as any);
}
