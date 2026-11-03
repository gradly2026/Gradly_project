// ════════════════════════════════════════════════════════════════════════
// UJStories — "historias con scroll" de /bienvenida (solo web):
//   1. Laptop: la plataforma se recorre dentro de la pantalla mientras el
//      texto de al lado se barre hacia la izquierda y va cambiando.
//   2. Teléfono 3D: aparece abajo, pequeño y con desvanecimiento, y al
//      scrollear sube, crece y gira 360°; el texto cambia con un barrido y
//      la pantalla del teléfono va navegando entre vistas de la app.
//   3. Fondo de pantallas y fotos en perspectiva que se mueven con el
//      scroll, con el texto de empresas y universidades encima.
// Reemplazan a las tarjetas de "¿Qué es?", "Beneficios" y "Cómo funciona".
// Las pantallas son ilustrativas (ver ujStoriesContent.ts).
//
// Todo el movimiento sale de UN listener de scroll (en captura, porque el
// que se mueve es el ScrollView de la pantalla, no la ventana) que calcula
// el avance 0→1 de cada historia y escribe transforms directo en el DOM,
// sin pasar por React, para que sea fluido.
// ════════════════════════════════════════════════════════════════════════
import { createElement, useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import {
  introHtml,
  laptopHtml,
  mosaicHtml,
  phoneHtml,
  STORIES_CSS,
  type Step,
} from './ujStoriesContent';

type Props = {
  mision: string;
  vision: string;
  laptop: Step[];
  phone: Step[];
  empresa: { titulo: string; items: string[] };
  universidad: { titulo: string; items: string[] };
  fotos: string[];
};

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t: number) => t * t * (3 - 2 * t);

function findScroller(el: HTMLElement | null): HTMLElement | null {
  let p = el?.parentElement || null;
  while (p) {
    const o = getComputedStyle(p).overflowY;
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p;
    p = p.parentElement;
  }
  return null;
}

/** Barrido de textos: cada paso entra desde la derecha y sale hacia la izquierda. */
function pasos(story: HTMLElement, p: number) {
  const els = Array.from(story.querySelectorAll<HTMLElement>('[data-step]'));
  const n = els.length;
  if (!n) return;
  els.forEach((el, i) => {
    const t = p * n - i;
    let op = 1;
    let x = 0;
    if (t < 0) op = 0;
    else if (i > 0 && t < 0.2) {
      const e = clamp(t / 0.2);
      op = e;
      x = (1 - e) * 80;
    }
    if (i < n - 1 && t > 0.8) {
      const e = clamp((t - 0.8) / 0.2);
      op = 1 - e;
      x = -e * 110;
    }
    if (i < n - 1 && t > 1) op = 0;
    el.style.opacity = String(op);
    el.style.transform = `translateX(${x}px)`;
    el.style.pointerEvents = op > 0.5 ? 'auto' : 'none';
  });
  const activo = clamp(Math.floor(p * n), 0, n - 1);
  story.querySelectorAll<HTMLElement>('[data-dots] i').forEach((d, k) => d.classList.toggle('on', k === activo));
}

export default function UJStories(props: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const html = useMemo(
    () =>
      introHtml(props.mision, props.vision) +
      laptopHtml(props.laptop) +
      phoneHtml(props.phone) +
      mosaicHtml(props.empresa, props.universidad, props.fotos),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const root = ref.current as HTMLElement | null;
    if (!root) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scroller = findScroller(root);
    const q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T | null;
    // Los elementos se buscan en cada movimiento (no se guardan): si React
    // reemplaza el HTML al hidratar, las referencias viejas quedarían muertas.
    const refs = () => ({
      lapStory: q('[data-story=lap]'),
      phStory: q('[data-story=ph]'),
      moStory: q('[data-story=mo]'),
      lap: q('[data-r=lap]'),
      pg: q('[data-r=pg]'),
      pgv: q('[data-r=pgv]'),
      scr: q('[data-r=scr]'),
      ph: q('[data-r=ph]'),
      pscr: q('[data-r=pscr]'),
      grid: q('[data-r=grid]'),
      cols: Array.from(root.querySelectorAll<HTMLElement>('[data-col]')),
      sc: Array.from(root.querySelectorAll<HTMLElement>('[data-sc]')),
      tabs: Array.from(root.querySelectorAll<HTMLElement>('.ujs-tab i')),
    });

    const alto = () => (scroller ? scroller.clientHeight : window.innerHeight);
    const progreso = (s: HTMLElement) => {
      const sr = scroller ? scroller.getBoundingClientRect() : ({ top: 0 } as DOMRect);
      const r = s.getBoundingClientRect();
      return clamp((sr.top - r.top) / Math.max(r.height - alto(), 1));
    };

    const medir = () => {
      const { scr, pscr } = refs();
      root.style.setProperty('--vh', alto() + 'px');
      if (scr) scr.style.fontSize = scr.clientWidth / 62 + 'px';
      if (pscr) pscr.style.fontSize = pscr.clientWidth / 24 + 'px';
      root.querySelectorAll<HTMLElement>('[data-mc]').forEach((el) => {
        const card = el.parentElement as HTMLElement;
        el.style.fontSize = card.clientWidth / 24 + 'px';
      });
    };

    const tick = () => {
      const { lapStory, phStory, moStory, lap, pg, pgv, ph, grid, cols, sc, tabs } = refs();
      if (lapStory && lap && pg && pgv) {
        const p = progreso(lapStory);
        const rec = Math.max(0, pg.scrollHeight - pgv.clientHeight);
        pg.style.transform = `translateY(${-ease(p) * rec}px)`;
        lap.style.transform = reduce
          ? 'none'
          : `rotateX(${(1 - p) * 5}deg) rotateY(${-20 + p * 17}deg) scale(${0.9 + 0.1 * clamp(p * 3)})`;
        pasos(lapStory, p);
      }
      if (phStory && ph) {
        const p = progreso(phStory);
        const e1 = ease(clamp(p / 0.42));
        const giro = reduce ? 0 : ease(clamp(p / 0.6)) * 360;
        ph.style.transform = `translateY(${(1 - e1) * alto() * 0.55}px) scale(${0.28 + 0.72 * e1}) rotateY(${giro}deg)`;
        ph.style.opacity = String(clamp(p / 0.12));
        const n = sc.length;
        const s = clamp((p - 0.38) / 0.62) * (n - 1);
        sc.forEach((el, k) => {
          const d = s - k;
          el.style.opacity = String(clamp(1.5 - Math.abs(d) * 2.5));
          el.style.transform = `translateX(${-d * 26}px)`;
        });
        const ti = [0, 2, 3, 4][Math.round(s)] ?? 0;
        tabs.forEach((t, k) => t.classList.toggle('on', k === ti));
        pasos(phStory, p);
      }
      if (moStory && grid) {
        const p = progreso(moStory);
        const d = [-260, 220, -180];
        cols.forEach((c, k) => (c.style.transform = reduce ? 'none' : `translateY(${(d[k] ?? 0) * p}px)`));
        grid.style.transform = `rotateX(52deg) rotateZ(${-20 + p * 6}deg) scale(1.05)`;
        pasos(moStory, p);
      }
    };

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        tick();
      });
    };
    const onResize = () => {
      medir();
      tick();
    };

    medir();
    tick();
    const t1 = setTimeout(onResize, 500);
    const t2 = setTimeout(onResize, 1800);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  if (Platform.OS !== 'web') return null;
  return createElement(
    'div',
    { ref, className: 'ujs' } as any,
    createElement('style', { dangerouslySetInnerHTML: { __html: STORIES_CSS } } as any),
    createElement('div', { dangerouslySetInnerHTML: { __html: html }, suppressHydrationWarning: true } as any),
  );
}
