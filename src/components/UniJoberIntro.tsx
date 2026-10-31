// ════════════════════════════════════════════════════════════════════════
// UniJoberIntro — animación de carga de la web (la que se aprobó en la
// maqueta HTML). SOLO web: en celular/app devuelve null y se queda el
// splash normal de app/index.tsx.
//
// Qué hace, en orden:
//   1. Pantalla oscura con motas de luz que convergen al centro.
//   2. El emblema se forma de cero: los trazos (aro, cintas, flecha) se
//      DIBUJAN con degradado lila y luego aparecen, con rebote, el brote,
//      el birrete, los edificios, el globo y las personas.
//   3. Debajo del logo las letras de "UniJober" entran una a una (con
//      desenfoque y degradado) y un destello las recorre.
//   4. Con el logo SOBRE el nombre, ambos viajan a la esquina superior
//      izquierda y se acomodan lado a lado, al tamaño exacto de la marca
//      de la pantalla (si hay un elemento #uj-brand-emb / #uj-brand-txt se
//      aterriza justo encima; si no, en una esquina por defecto).
//   5. Mientras viajan, el fondo negro se desvanece y el resto de la
//      página aparece con desvanecimiento.
//
// Se muestra una vez por sesión del navegador (sessionStorage 'uj:intro');
// se puede forzar con ?intro=1 en la URL. Respeta "reducir movimiento".
// +html.tsx oculta #root desde el primer pintado cuando la intro va a
// jugar (evita el parpadeo de la página antes de la animación).
// ════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { EMBLEM_DEFS, EMBLEM_INNER, EMBLEM_RATIO, EMBLEM_VIEWBOX } from './uniJoberEmblem';

const CSS = `
#uj-intro{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;--L:clamp(96px,22vw,150px);transition:opacity .6s ease;font-family:'Inter_400Regular',Inter,sans-serif}
#uj-intro.gone{opacity:0;pointer-events:none}
#uj-intro .bg{position:absolute;inset:0;background:#08080c;transition:opacity 1s ease .15s}
#uj-intro.out .bg{opacity:0}
#uj-intro canvas{position:absolute;inset:0;width:100%;height:100%;transition:opacity .5s}
#uj-intro.out canvas,#uj-intro.out .bar,#uj-intro.out .skip,#uj-intro.out .tagl{opacity:0!important;transition:opacity .4s}
#uj-intro .stage{position:relative;display:flex;flex-direction:column;align-items:center;gap:22px;padding:0 16px}
#uj-emb{height:var(--L);width:auto;overflow:visible;filter:drop-shadow(0 0 22px rgba(136,144,213,.45));transform-origin:0 0}
#uj-emb .st{fill:none;stroke-dasharray:1;stroke-dashoffset:1}
#uj-emb .fl{opacity:0;transform-box:fill-box;transform-origin:center;transform:scale(.3)}
#uj-word{display:flex;font:400 calc(var(--L)*.63)/1 'Sora_800ExtraBold',Sora,sans-serif;letter-spacing:-.02em;padding-bottom:.12em;transform-origin:0 0}
#uj-word span{display:inline-block;opacity:0;transform:translateY(40%) scale(.8);filter:blur(10px);
 background:linear-gradient(110deg,#fff 0%,#c9cdf5 30%,#8890D5 55%,#5963C4 100%) 0 0/220% 100%;-webkit-background-clip:text;background-clip:text;color:transparent}
#uj-word.go span{animation:ujltr .7s cubic-bezier(.2,.8,.2,1) forwards,ujshine 2.6s ease-in-out .9s 1}
@keyframes ujltr{to{opacity:1;transform:none;filter:none}}
@keyframes ujshine{0%{background-position:0 0}100%{background-position:-220% 0}}
#uj-intro .tagl{color:#9696A8;font:400 15px 'Inter_400Regular',Inter,sans-serif;letter-spacing:.04em;opacity:0;transition:opacity .8s}
#uj-intro .tagl.on{opacity:1}
#uj-intro .skip{position:absolute;right:18px;bottom:18px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.16);color:#aab;border-radius:99px;padding:8px 14px;font:600 13px Inter,sans-serif;cursor:pointer}
#uj-intro .bar{position:absolute;left:50%;bottom:9%;width:min(220px,50vw);height:3px;border-radius:3px;background:rgba(255,255,255,.08);transform:translateX(-50%);overflow:hidden}
#uj-intro .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#5963C4,#8890D5);border-radius:3px}
#uj-intro .fly{transition:transform 1.15s cubic-bezier(.65,0,.2,1),filter 1.15s ease}
#uj-word.final span{animation:none!important;opacity:1;transform:none;filter:none;background:none;-webkit-text-fill-color:#8890D5;color:#8890D5}
#uj-word.final span:nth-child(-n+3){-webkit-text-fill-color:#F4F4F8;color:#F4F4F8}
html.uj-intro-on #uj-brand-emb,html.uj-intro-on #uj-brand-txt{opacity:0}
html.uj-intro-on #root{opacity:0}
html.uj-intro-on.uj-ready #root{opacity:1;transition:opacity 1.3s ease .1s}
`;

const HTML =
  '<div class="bg"></div><canvas id="uj-cv"></canvas>' +
  '<div class="stage">' +
  `<svg id="uj-emb" viewBox="${EMBLEM_VIEWBOX}" fill="none" aria-hidden="true"><defs>${EMBLEM_DEFS}</defs><g id="uj-embg">${EMBLEM_INNER}</g></svg>` +
  '<div id="uj-word" aria-label="UniJober"></div>' +
  '<div class="tagl" id="uj-tagl">Conectando talento con oportunidades</div>' +
  '</div><div class="bar"><i id="uj-bar"></i></div>' +
  '<button class="skip" id="uj-skip" type="button">Saltar</button>';

/** ¿Debe jugar la intro en este momento? (también lo evalúa +html.tsx). */
export function debeJugarIntro(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (/[?&]intro=1/.test(window.location.search)) return true;
    return !window.sessionStorage.getItem('uj:intro');
  } catch {
    return false;
  }
}

function jugar(root: HTMLElement, alTerminar: () => void) {
  const html = document.documentElement;
  const $ = (id: string) => root.querySelector('#' + id) as any;
  const emb = $('uj-emb') as SVGSVGElement;
  const word = $('uj-word') as HTMLElement;
  const tagl = $('uj-tagl') as HTMLElement;
  const bar = $('uj-bar') as HTMLElement;
  const cv = $('uj-cv') as HTMLCanvasElement;
  const cx = cv.getContext('2d')!;
  const timers: any[] = [];
  const T = (f: () => void, ms: number) => timers.push(setTimeout(f, ms));
  let raf = 0;
  let volando = false;
  let W = 0;
  let H = 0;
  let P: { a: number; r: number; s: number; z: number }[] = [];

  const size = () => {
    W = cv.width = window.innerWidth;
    H = cv.height = window.innerHeight;
  };
  size();
  window.addEventListener('resize', size);

  // separa trazos (se dibujan) de rellenos (aparecen con escala)
  const kids = Array.from((emb.querySelector('#uj-embg') as Element).children) as SVGElement[];
  kids.forEach((n) => {
    const stroke = n.getAttribute('stroke');
    const fill = n.getAttribute('fill');
    if (n.tagName === 'path' && fill === 'none' && stroke) {
      n.setAttribute('pathLength', '1');
      n.classList.add('st');
      n.dataset.kind = 's';
    } else {
      n.classList.add('fl');
      n.dataset.kind = 'f';
    }
  });

  // letras de UniJober (cada una con su degradado)
  'UniJober'.split('').forEach((c, i) => {
    const s = document.createElement('span');
    s.textContent = c;
    s.style.animationDelay = i * 70 + 'ms,' + (900 + i * 40) + 'ms';
    word.appendChild(s);
  });

  // motas de luz que convergen al centro
  for (let i = 0; i < 70; i++) {
    P.push({ a: Math.random() * 6.28, r: Math.max(W, H) * (0.4 + Math.random() * 0.5), s: 0.3 + Math.random() * 0.9, z: Math.random() });
  }
  const t0 = performance.now();
  const draw = (t: number) => {
    cx.clearRect(0, 0, W, H);
    const e = Math.min(1, (t - t0) / 2200);
    P.forEach((p) => {
      const rr = p.r * (1 - e * 0.92 * p.s) + 6;
      const x = W / 2 + Math.cos(p.a + e * 1.5) * rr;
      const y = H * 0.42 + Math.sin(p.a + e * 1.5) * rr * 0.62;
      cx.globalAlpha = (1 - e * 0.7) * (0.25 + p.z * 0.55);
      cx.fillStyle = p.z > 0.5 ? '#8890D5' : '#5963C4';
      cx.beginPath();
      cx.arc(x, y, 1 + p.z * 2, 0, 6.28);
      cx.fill();
    });
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);

  // 1) el emblema se forma: trazos dibujados, rellenos con rebote
  bar.style.transition = 'width 3.1s cubic-bezier(.5,0,.2,1)';
  requestAnimationFrame(() => (bar.style.width = '100%'));
  let si = 0;
  let fi = 0;
  kids.forEach((n) => {
    if (n.dataset.kind === 's') {
      const d = si * 230;
      si++;
      T(() => {
        n.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.6,0,.2,1)';
        n.style.strokeDashoffset = '0';
      }, 120 + d);
    } else {
      const d2 = 1300 + fi * 95;
      fi++;
      T(() => {
        n.style.transition = 'opacity .6s ease,transform .7s cubic-bezier(.2,1.4,.4,1)';
        n.style.opacity = '1';
        n.style.transform = 'none';
      }, d2);
    }
  });
  // 2) las letras entran debajo del logo, 3) el lema
  T(() => word.classList.add('go'), 2300);
  T(() => tagl.classList.add('on'), 3300);

  // 4) con el logo sobre el nombre: viajan a la esquina y se acomodan
  const volar = () => {
    if (volando) return;
    volando = true;
    timers.forEach(clearTimeout);
    // si se saltó la animación, deja el emblema completo antes de volar
    kids.forEach((n) => {
      if (n.dataset.kind === 's') n.style.strokeDashoffset = '0';
      else {
        n.style.opacity = '1';
        n.style.transform = 'none';
      }
    });
    word.classList.add('go');
    const eR = emb.getBoundingClientRect();
    const wR = word.getBoundingClientRect();
    const bE = document.getElementById('uj-brand-emb')?.getBoundingClientRect();
    const bT = document.getElementById('uj-brand-txt')?.getBoundingClientRect();
    let tE = { left: 24, top: 14, height: 35, width: 35 * EMBLEM_RATIO };
    if (bE && bE.height > 0) tE = { left: bE.left, top: bE.top, height: bE.height, width: bE.width };
    const sE = tE.height / eR.height;
    const sW = bT && bT.height > 0 ? bT.height / wR.height : 22 / ((wR.height / 1.12) || 1);
    const wLeft = bT && bT.height > 0 ? bT.left : tE.left + tE.width + tE.height * 0.12;
    const wTop = bT && bT.height > 0 ? bT.top : tE.top + tE.height / 2 - (wR.height * sW) / 2;
    emb.classList.add('fly');
    word.classList.add('fly');
    // colores finales de la marca: Uni en blanco, Jober en el lila de la página
    word.classList.add('final');
    emb.style.filter = 'none';
    emb.style.transform = `translate(${tE.left - eR.left}px,${tE.top - eR.top}px) scale(${sE})`;
    word.style.transform = `translate(${wLeft - wR.left}px,${wTop - wR.top}px) scale(${sW})`;
    root.classList.add('out');
    html.classList.add('uj-ready');
    // 5) al aterrizar, se retira la capa y queda la marca real de la página
    // el logo y el nombre que viajaron SON la marca: la capa se retira de golpe y
    // la marca real (idéntica) aparece justo debajo, sin duplicado ni parpadeo
    T(() => {
      html.classList.remove('uj-intro-on');
      root.style.display = 'none';
      terminar();
    }, 1350);
  };
  T(volar, 4300);
  ($('uj-skip') as HTMLElement).onclick = volar;

  function terminar() {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', size);
    html.classList.remove('uj-intro-on', 'uj-ready');
    try {
      window.sessionStorage.setItem('uj:intro', '1');
    } catch {}
    alTerminar();
  }
  // red de seguridad: pase lo que pase, la página vuelve a mostrarse
  T(() => {
    if (!volando) volar();
  }, 9000);
}

export default function UniJoberIntro() {
  const [montar, setMontar] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!debeJugarIntro()) {
      document.documentElement.classList.remove('uj-intro-on', 'uj-ready');
      return;
    }
    document.documentElement.classList.add('uj-intro-on');
    setMontar(true);
  }, []);

  useEffect(() => {
    if (!montar || Platform.OS !== 'web') return;
    const style = document.createElement('style');
    style.setAttribute('data-uj-intro', '1');
    style.textContent = CSS;
    document.head.appendChild(style);
    const root = document.createElement('div');
    root.id = 'uj-intro';
    root.innerHTML = HTML;
    document.body.appendChild(root);
    try {
      jugar(root, () => {
        root.remove();
        style.remove();
        setMontar(false);
      });
    } catch {
      root.remove();
      document.documentElement.classList.remove('uj-intro-on', 'uj-ready');
    }
    return () => {
      root.remove();
      style.remove();
    };
  }, [montar]);

  return null;
}
