// ════════════════════════════════════════════════════════════════════════
// Contenido (HTML + CSS) de las "historias con scroll" de /bienvenida:
// laptop con grosor 3D, teléfono 3D con grosor y fondo de pantallas en
// perspectiva. SOLO web (ver UJStories.tsx).
//
// Las pantallas son RÉPLICAS del diseño real de la app con datos de
// EJEMPLO (empresas, personas y cifras inventadas; sin marcas ni logos
// reales). No son capturas. Todo el tamaño interno va en `em`: UJStories
// fija el font-size de cada pantalla según su ancho.
// ════════════════════════════════════════════════════════════════════════
import { EMBLEM_DEFS, EMBLEM_INNER, EMBLEM_VIEWBOX } from './uniJoberEmblem';

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── CSS de los aparatos (teléfono con grosor: también lo usa el hero) ──
export const PHONE_CSS = `
.ujs-ph{--d:26px;position:relative;width:min(290px,60vw);aspect-ratio:9/19;transform-style:preserve-3d;will-change:transform}
.ujs-slab{position:absolute;inset:0;border-radius:2.7em;background:#17171f;border:2px solid #44445a;transform:translateZ(calc(var(--d) * (var(--i) / 11 - .5)))}
.ujs-face{position:absolute;inset:0;border-radius:2.7em;backface-visibility:hidden;-webkit-backface-visibility:hidden}
.ujs-front{transform:translateZ(calc(var(--d) / 2));background:#0b0b10;border:.5em solid #1b1b26;box-shadow:inset 0 0 0 2px #3a3a50}
.ujs-back{transform:translateZ(calc(var(--d) / -2)) rotateY(180deg);background:linear-gradient(145deg,#2b2f6e,#5963C4 45%,#8890D5);display:grid;place-items:center;border:2px solid #44445a}
.ujs-back svg{width:38%;height:auto;opacity:.95}
.ujs-cam{position:absolute;left:1.2em;top:1.2em;width:4.4em;height:4.4em;border-radius:1.2em;background:rgba(10,10,20,.55);display:grid;grid-template-columns:1fr 1fr;gap:.35em;padding:.55em}
.ujs-cam i{border-radius:50%;background:radial-gradient(#444,#111);box-shadow:inset 0 0 0 .15em #2b2b3a}
.ujs-key{position:absolute;right:-3px;width:5px;border-radius:3px;background:#55556e;transform:translateZ(0)}
.ujs-notch{position:absolute;left:50%;top:.7em;transform:translateX(-50%);width:32%;height:1.2em;background:#000;border-radius:1em;z-index:6}
.ujs-pscr{position:absolute;inset:0;border-radius:2.1em;overflow:hidden;background:#0B0B0F}
.ujs-sc{position:absolute;inset:0;overflow:hidden;will-change:transform,opacity}
`;

export const STORIES_CSS =
  PHONE_CSS +
  `
.ujs{position:relative;color:#F4F4F8;font-family:'Inter_400Regular',Inter,system-ui,sans-serif;width:100%}
.ujs *{box-sizing:border-box}
.ujs h2,.ujs h3{margin:0;font-weight:400}
.ujs .a{color:#8890D5}
.ujs-intro{max-width:1100px;margin:0 auto;padding:90px 5vw 30px;text-align:center}
.ujs-kick{display:inline-block;font:600 12px 'Inter_600SemiBold',Inter,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#8890D5;border:1px solid #2A2A34;background:#13131899;border-radius:99px;padding:6px 14px}
.ujs-intro h2{font:400 clamp(30px,4.6vw,56px)/1.04 'Sora_800ExtraBold',Sora,sans-serif;text-transform:uppercase;margin:16px 0 26px;letter-spacing:-.01em}
.ujs-mv{display:grid;grid-template-columns:1fr 1fr;gap:16px;text-align:left}
.ujs-mv div{background:#131318;border:1px solid #2A2A34;border-radius:18px;padding:22px}
.ujs-mv b{display:block;font:400 15px 'Sora_800ExtraBold',Sora,sans-serif;margin-bottom:6px;color:#F4F4F8}
.ujs-mv p{margin:0;color:#9696A8;font-size:15px;line-height:1.6}
@media(max-width:760px){.ujs-mv{grid-template-columns:1fr}}

.ujs-story{position:relative}
.ujs-sticky{position:sticky;top:0;height:var(--vh,calc(100vh - 64px));display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);align-items:center;gap:3vw;padding:0 5vw;max-width:1280px;margin:0 auto;overflow:hidden}
.ujs-sticky.rev{grid-template-columns:minmax(0,1.1fr) minmax(0,1fr)}
.ujs-sticky.rev .ujs-steps{order:2}
.ujs-steps{position:relative;height:min(62vh,430px);z-index:3}
.ujs-step{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:14px;will-change:transform,opacity}
.ujs-step h2{font:400 clamp(28px,3.8vw,54px)/1.02 'Sora_800ExtraBold',Sora,sans-serif;text-transform:uppercase;letter-spacing:-.015em}
.ujs-step p{margin:0;color:#B4B4C4;font-size:clamp(15px,1.4vw,18px);line-height:1.6;max-width:30em}
.ujs-count{font:600 13px 'Inter_600SemiBold',Inter,sans-serif;color:#8890D5;letter-spacing:.1em}
.ujs-dots{position:absolute;left:0;bottom:-6px;display:flex;gap:8px}
.ujs-dots i{display:block;height:6px;width:6px;border-radius:6px;background:#2A2A34;transition:all .3s}
.ujs-dots i.on{width:26px;background:#8890D5;box-shadow:0 0 12px #8890D5}
.ujs-stage{position:relative;display:grid;place-items:center;perspective:1800px;min-width:0}

/* ---- laptop con grosor ---- */
.ujs-lap{position:relative;width:min(700px,100%);transform-style:preserve-3d;will-change:transform}
.ujs-lidbox{position:relative;aspect-ratio:16/10.2;transform-style:preserve-3d;--d:14px}
.ujs-lslab{position:absolute;inset:0;border-radius:18px 18px 6px 6px;background:#1a1a24;border:2px solid #3a3a50;transform:translateZ(calc(var(--d) * (var(--i) / 5 - .5)))}
.ujs-lface{position:absolute;inset:0;border-radius:18px 18px 6px 6px;background:#0e0e14;border:2px solid #34344a;padding:2.4%;transform:translateZ(calc(var(--d) / 2));box-shadow:0 50px 100px -20px #000,0 0 80px rgba(89,99,196,.25)}
.ujs-lback{position:absolute;inset:0;border-radius:18px 18px 6px 6px;background:linear-gradient(145deg,#262634,#14141c);transform:translateZ(calc(var(--d) / -2)) rotateY(180deg);backface-visibility:hidden}
.ujs-scr{position:relative;width:100%;height:100%;border-radius:8px;overflow:hidden;background:#0B0B0F}
.ujs-bar{position:absolute;left:0;right:0;top:0;height:2.3em;background:#15151c;border-bottom:1px solid #2A2A34;display:flex;align-items:center;gap:.5em;padding:0 .9em;z-index:6}
.ujs-bar i{width:.6em;height:.6em;border-radius:50%;background:#34344a}
.ujs-bar span{margin-left:.8em;background:#0B0B0F;border-radius:.4em;padding:.2em 1.4em;font-size:.65em;color:#9696A8}
.ujs-pgv{position:absolute;left:0;right:0;top:2.3em;bottom:0;overflow:hidden}
.ujs-pg{position:absolute;left:0;top:0;width:100%;will-change:transform}
.ujs-deck{position:relative;height:0;transform-style:preserve-3d}
.ujs-deckface{position:absolute;left:-4%;right:-4%;top:0;height:46px;background:repeating-linear-gradient(90deg,#1b1b26 0 7px,#14141c 7px 9px),linear-gradient(#2a2a38,#17171f);background-blend-mode:overlay;border:2px solid #3a3a50;border-radius:4px 4px 22px 22px;transform-origin:50% 0;transform:rotateX(74deg);box-shadow:0 30px 50px -10px #000}
.ujs-deckfront{position:absolute;left:-4%;right:-4%;top:-2px;height:14px;background:linear-gradient(#3e3e52,#1c1c26);border-radius:0 0 22px 22px;border:2px solid #44445a;border-top:0;transform:translateZ(18px)}
.ujs-deckfront::before{content:"";position:absolute;left:50%;top:0;width:16%;height:6px;transform:translateX(-50%);background:#0e0e14;border-radius:0 0 8px 8px}
.ujs-pad{position:absolute;left:38%;right:38%;top:24px;height:18px;border-radius:5px;background:#101018;border:1px solid #2c2c3c}

/* ---- réplicas de la interfaz (em) ---- */
.u{font-family:'Inter_400Regular',Inter,sans-serif;color:#F4F4F8}
.u i{font-style:normal}
.u-t{font:400 1.5em/1.1 'Sora_800ExtraBold',Sora,sans-serif;text-transform:uppercase;letter-spacing:-.01em}
.u-t .a{color:#8890D5}
.u-s{color:#9696A8;font-size:.78em;margin-top:.3em}
.u-c{background:#131318;border:1px solid #2A2A34;border-radius:1em;padding:1em}
.u-chip{display:inline-block;background:#1c1c26;border-radius:99px;padding:.22em .8em;font-size:.68em;color:#c9cdf5;margin:.45em .35em 0 0}
.u-chip.p{background:#5963C4;color:#fff}.u-chip.g{background:rgba(63,166,107,.16);color:#4CB877}.u-chip.o{background:rgba(217,119,6,.16);color:#f0a030}.u-chip.s{background:rgba(136,144,213,.12);color:#8890D5}
.u-btn{display:inline-block;background:#4F58B8;color:#fff;border-radius:.7em;padding:.55em 1.2em;font-size:.72em;font-family:'Inter_600SemiBold',Inter,sans-serif}
.u-btn.o{background:transparent;border:1px solid #3a3a50;color:#c9cdf5}
.u-logo{width:2.6em;height:2.6em;border-radius:50%;display:grid;place-items:center;font:400 .95em 'Sora_800ExtraBold',Sora,sans-serif;color:#fff;flex:none}
.u-row{display:flex;align-items:center;gap:.7em}
.u-av{width:2.2em;height:2.2em;border-radius:50%;background:#22223a;flex:none;position:relative}
.u-av::after{content:"";position:absolute;left:50%;top:26%;width:.8em;height:.8em;border-radius:50%;background:#8890D5;transform:translateX(-50%);box-shadow:0 .95em 0 .15em #8890D5}
.u-bar2{height:.55em;background:#2A2A34;border-radius:1em;overflow:hidden;margin-top:.7em}
.u-bar2 i{display:block;height:100%;background:linear-gradient(90deg,#5963C4,#8890D5)}
.u-ring{width:7em;height:7em;border-radius:50%;background:conic-gradient(#5963C4 0 var(--p,62%),#2A2A34 0);display:grid;place-items:center}
.u-ring i{width:5.5em;height:5.5em;border-radius:50%;background:#131318;display:grid;place-items:center;text-align:center;font:400 1.3em/1.1 'Sora_800ExtraBold',Sora,sans-serif;color:#8890D5}
.u-ring i small{display:block;font:400 .45em 'Inter_400Regular',Inter,sans-serif;color:#9696A8}
.u-st b{display:block;font:400 1.5em/1 'Sora_800ExtraBold',Sora,sans-serif}
.u-st small{color:#9696A8;font-size:.72em}
.u-code{display:flex;gap:.4em;justify-content:center;margin:.8em 0}
.u-code i{font:400 1.5em 'Sora_800ExtraBold',Sora,sans-serif;background:#0B0B0F;border:1px solid #3a3a50;border-radius:.45em;width:1.4em;text-align:center;padding:.2em 0}
.u-bub{padding:.6em .9em;border-radius:1em;font-size:.8em;max-width:84%;line-height:1.4;margin-top:.6em}
.u-bub.l{background:#22222c;border-bottom-left-radius:.3em}
.u-bub.r{background:#5963C4;margin-left:auto;border-bottom-right-radius:.3em}
.u-bub small{display:block;font-size:.72em;opacity:.65;margin-top:.2em;text-align:right}
.u-ok{color:#4CB877;font-size:.75em}
.u-qr{display:grid;grid-template-columns:repeat(6,1fr);gap:.18em;width:5em}
.u-qr i{aspect-ratio:1;background:#F4F4F8;border-radius:.1em}.u-qr i.z{background:transparent}

/* móvil */
.m-top{display:flex;align-items:center;justify-content:space-between;padding:2.9em .9em .6em;background:#101016;border-bottom:1px solid #2A2A34}
.m-top .lg{font:400 1.15em 'Sora_800ExtraBold',Sora,sans-serif;display:flex;align-items:center;gap:.4em}
.m-top .em{width:1.5em;height:1.7em;background:linear-gradient(145deg,#5963C4,#C9CDF5);border-radius:.5em}
.m-top .pill{display:flex;gap:.7em;border:1px solid #2A2A34;border-radius:99px;padding:.4em .8em}
.m-top .pill i{width:.9em;height:.9em;border-radius:50%;background:#3a3a50}
.m-body{padding:.8em .85em 6em}
.m-card{background:#131318;border:1px solid #2A2A34;border-radius:1.1em;padding:.9em;margin-bottom:.8em}
.m-h{display:flex;gap:.7em;align-items:center}
.m-emp{color:#9696A8;font-size:.78em}
.m-tit{font:400 1.02em/1.15 'Sora_800ExtraBold',Sora,sans-serif}
.m-foot{display:flex;justify-content:space-between;align-items:center;margin-top:.7em;color:#9696A8;font-size:.72em}
.m-nav{position:absolute;left:.7em;right:.7em;bottom:.7em;height:3.4em;border-radius:99px;background:#101016;border:1px solid #2A2A34;display:flex;justify-content:space-around;align-items:center;z-index:5}
.m-nav i{width:1.3em;height:1.3em;border-radius:.4em;background:#2A2A34}.m-nav i.on{background:#8890D5;box-shadow:0 0 .8em #8890D5aa}
.m-fab{position:absolute;right:.8em;width:2.8em;height:2.8em;border-radius:50%;background:#5963C4;z-index:5;box-shadow:0 .5em 1em rgba(0,0,0,.5)}
.m-chath{display:flex;align-items:center;gap:.6em;padding:3em .9em .7em;background:#101016;border-bottom:1px solid #2A2A34}
.m-chatin{position:absolute;left:.7em;right:.7em;bottom:.7em;display:flex;gap:.5em;align-items:center}
.m-chatin span{flex:1;background:#131318;border:1px solid #2A2A34;border-radius:99px;padding:.6em 1em;font-size:.72em;color:#6a6a80}
.m-chatin i{width:2.3em;height:2.3em;border-radius:50%;background:#5963C4}

/* escritorio */
.d-shell{position:relative;width:100%;height:100%;background:#0B0B0F}
.d-side{position:absolute;left:0;top:0;bottom:0;width:19%;background:#101016;border-right:1px solid #2A2A34;padding:.9em .7em;display:flex;flex-direction:column;gap:.35em;z-index:4}
.d-brand{font:400 1.05em 'Sora_800ExtraBold',Sora,sans-serif;display:flex;align-items:center;gap:.4em;margin:.2em .3em .8em}
.d-brand b{font-weight:400;color:#8890D5}
.d-em{width:1.5em;height:1.7em;background:linear-gradient(145deg,#5963C4,#C9CDF5);border-radius:.5em}
.d-ni{display:flex;align-items:center;gap:.6em;padding:.55em .7em;border-radius:.8em;font-size:.78em;color:#9696A8;transition:all .25s}
.d-ni i{width:1.1em;height:1.1em;border-radius:.3em;background:#2A2A34;flex:none}
.d-ni.on{background:#1f2040;color:#8890D5;box-shadow:inset 0 0 0 1px #34366a}.d-ni.on i{background:#8890D5}
.d-user{margin-top:auto;display:flex;align-items:center;gap:.6em;background:#16161d;border:1px solid #2A2A34;border-radius:.9em;padding:.55em}
.d-user b{display:block;font-size:.72em;font-weight:400;line-height:1.15}.d-user small{color:#9696A8;font-size:.62em}
.d-main{position:absolute;left:19%;right:0;top:0;bottom:0}
.d-top{height:3.3em;display:flex;align-items:center;gap:1.2em;padding:0 1.2em;border-bottom:1px solid #2A2A34;background:#0d0d12;position:relative;z-index:3}
.d-top b{font:400 1.05em 'Sora_800ExtraBold',Sora,sans-serif;text-transform:uppercase}
.d-search{flex:1;max-width:22em;background:#131318;border:1px solid #2A2A34;border-radius:.8em;padding:.5em .9em;font-size:.7em;color:#6a6a80}
.d-ic{margin-left:auto;display:flex;gap:.6em;border:1px solid #2A2A34;border-radius:99px;padding:.4em .8em}.d-ic i{width:.9em;height:.9em;border-radius:50%;background:#3a3a50}
.d-body{padding:1.1em 1.3em}
.d-g2{display:grid;grid-template-columns:1fr 1fr;gap:.9em}
.d-tabs{display:flex;gap:.5em;margin:.8em 0}.d-tabs span{border:1px solid #2A2A34;border-radius:99px;padding:.35em 1em;font-size:.7em;color:#9696A8;background:#131318}.d-tabs span.on{background:#5963C4;color:#fff;border-color:#5963C4}
.d-li{display:flex;align-items:center;gap:.8em;padding:.8em;margin-top:.6em;background:#131318;border:1px solid #2A2A34;border-radius:.9em}
.d-li b{display:block;font:400 .9em 'Sora_800ExtraBold',Sora,sans-serif}.d-li small{color:#9696A8;font-size:.7em}
.d-li .st{margin-left:auto;font-size:.65em;color:#4CB877;background:rgba(63,166,107,.14);padding:.2em .8em;border-radius:99px}

/* fondo de pantallas en perspectiva */
.ujs-mo{position:relative}
.ujs-mo .ujs-sticky{display:block;max-width:none;padding:0}
.ujs-mo-bg{position:absolute;inset:0;perspective:1400px;overflow:hidden;background:radial-gradient(900px circle at 70% 40%,rgba(89,99,196,.22),transparent 65%),#0B0B0F}
.ujs-grid{position:absolute;left:34%;top:-30%;width:92%;display:flex;gap:22px;transform:rotateX(52deg) rotateZ(-20deg) scale(1.05);transform-origin:50% 50%;transform-style:preserve-3d}
.ujs-col{flex:1;display:flex;flex-direction:column;gap:22px;will-change:transform}
.ujs-mc{position:relative;border-radius:22px;overflow:hidden;border:1px solid #2A2A34;background:#0B0B0F;box-shadow:0 30px 60px -20px #000}
.ujs-mc.ph{aspect-ratio:9/16}
.ujs-mc.ls{aspect-ratio:16/10}
.ujs-ph-photo{background-size:cover;background-position:center}
.ujs-mo-fade{position:absolute;inset:0;background:linear-gradient(90deg,#0B0B0F 0%,rgba(11,11,15,.88) 34%,rgba(11,11,15,.2) 62%,transparent 80%),linear-gradient(180deg,#0B0B0F,transparent 18%,transparent 82%,#0B0B0F);z-index:2;pointer-events:none}
.ujs-mo .ujs-steps{position:absolute;left:5vw;top:50%;transform:translateY(-50%);width:min(520px,46vw);z-index:3}
.ujs-mo .ujs-step ul{margin:6px 0 0;padding:0;list-style:none;display:grid;gap:10px}
.ujs-mo .ujs-step li{display:flex;gap:10px;color:#C9C9D8;font-size:clamp(14px,1.3vw,17px);line-height:1.45}
.ujs-mo .ujs-step li::before{content:"";flex:none;margin-top:.5em;width:8px;height:8px;border-radius:50%;background:#8890D5;box-shadow:0 0 10px #8890D5}

@media(max-width:900px){
 .ujs-sticky,.ujs-sticky.rev{grid-template-columns:1fr;grid-template-rows:auto 1fr;align-content:start;padding-top:18px;gap:8px}
 .ujs-sticky.rev .ujs-steps{order:-1}
 .ujs-steps{height:min(34vh,300px)}
 .ujs-step h2{font-size:clamp(24px,7vw,34px)}
 .ujs-step p{font-size:14px}
 .ujs-lap{width:min(520px,100%)}
 .ujs-ph{width:min(220px,46vw)}
 .ujs-mo .ujs-steps{left:5vw;width:90vw;top:30%}
 .ujs-grid{left:10%;width:130%}
 .ujs-mo-fade{background:linear-gradient(180deg,#0B0B0F 0%,rgba(11,11,15,.9) 45%,rgba(11,11,15,.3) 80%,transparent)}
}
@media(prefers-reduced-motion:reduce){.ujs-lap,.ujs-ph,.ujs-col{transform:none!important}}
`;

// ── Réplicas móviles ──────────────────────────────────────────────────

const mTop = () =>
  `<div class="m-top"><span class="lg"><i class="em"></i>UniJober</span><span class="pill"><i></i><i></i><i></i></span></div>`;
const mNav = (n: number) =>
  `<div class="m-nav">${[0, 1, 2, 3, 4].map((i) => `<i class="${i === n ? 'on' : ''}"></i>`).join('')}</div>`;
const mFabs = (bottom = 5) =>
  `<div class="m-fab" style="bottom:${bottom + 3.4}em"></div><div class="m-fab" style="bottom:${bottom}em;background:#3f48a8"></div>`;

const vac = (ini: string, color: string, emp: string, tit: string, chips: string[], sal: string, cupos: string, skills: string[], fecha: string) =>
  `<div class="m-card"><div class="m-h"><span class="u-logo" style="background:${color}">${ini}</span><div><div class="m-emp">${esc(emp)}</div><div class="m-tit">${esc(tit)}</div></div></div>
  <div><span class="u-chip p">Vacante</span>${chips.map((c) => `<span class="u-chip">${esc(c)}</span>`).join('')}</div>
  <div><span class="u-chip g">${esc(sal)}</span><span class="u-chip o">${esc(cupos)}</span></div>
  <div>${skills.map((s) => `<span class="u-chip s">${esc(s)}</span>`).join('')}</div>
  <div class="m-foot"><span>${esc(fecha)}</span><span class="u-btn">Postularme</span></div></div>`;

/** Feed de pasantías (móvil, estudiante). */
export const mFeed = () =>
  `<div class="u">${mTop()}<div class="m-body">
  ${vac('DC', '#2f7d6d', 'Distribuidora Costa Azul', 'Asistente Contable', ['Tiempo parcial', 'Híbrido'], '$300 - $450', 'Quedan 2 de 3 cupos', ['Excel', 'Facturación'], 'hace 2 días')}
  ${vac('CV', '#8a4fb0', 'Clínica Vida Plena', 'Auxiliar de Laboratorio', ['Tiempo completo', 'Presencial'], '$350 - $500', 'Quedan 1 de 2 cupos', ['Bioseguridad'], 'hace 4 días')}
  </div>${mFabs()}${mNav(0)}</div>`;

/** Chat estudiante ↔ empresa (cordial y profesional). */
export const mChat = () =>
  `<div class="u"><div class="m-chath"><span class="u-av"></span><div><div class="m-tit" style="font-size:.95em">Distribuidora Costa Azul</div><div class="u-ok">en línea</div></div></div>
  <div class="m-body" style="padding-bottom:5em"><div class="u-bub l">Buenos días, Ana. Le confirmamos su cupo de pasantía en el área de Contabilidad.<small>8:15</small></div>
  <div class="u-bub r">Muchas gracias. ¿A qué hora debo presentarme el lunes?<small>8:17</small></div>
  <div class="u-bub l">A las 8:00 a. m., con su carné universitario. Le recibirá el Lic. Pérez.<small>8:20</small></div>
  <div class="u-bub r">Perfecto, allí estaré. Gracias por la oportunidad.<small>8:21</small></div></div>
  <div class="m-chatin"><span>Escribe un mensaje…</span><i></i></div></div>`;

/** Asistencia con código del día. */
export const mAsistencia = () =>
  `<div class="u">${mTop()}<div class="m-body"><div class="u-t">Asistencia <span class="a">de hoy</span></div><div class="u-s">Ingresa el código que te da tu empresa</div>
  <div class="m-card" style="margin-top:.9em;text-align:center"><small style="color:#9696A8">Código del día</small><div class="u-code">${'482917'.split('').map((d) => `<i>${d}</i>`).join('')}</div><span class="u-btn">Marcar asistencia</span><div class="u-ok" style="margin-top:.8em">Entrada registrada · 8:02 a. m.</div></div>
  <div class="m-card"><div class="u-row"><b style="font:400 .95em 'Sora_800ExtraBold'">Horario acordado</b><span class="u-chip g" style="margin:0 0 0 auto">Activo</span></div><div class="u-s">Lun a vie · 8:00 a. m. a 12:00 m.</div></div>
  </div>${mFabs()}${mNav(0)}</div>`;

/** Progreso de horas. */
export const mProgreso = () =>
  `<div class="u">${mTop()}<div class="m-body"><div class="u-t">Mi <span class="a">progreso</span></div>
  <div class="m-card" style="margin-top:.8em"><div class="u-s" style="letter-spacing:.1em;text-transform:uppercase;color:#8890D5">Horas de práctica</div>
  <div class="u-row" style="margin-top:.8em;gap:1.1em"><div class="u-ring" style="--p:62%"><i>62%<small>124/200 hrs</small></i></div>
  <div class="u-st"><b style="color:#4CB877">124</b><small>Cumplidas</small><b style="color:#f0a030;margin-top:.4em">0</b><small>En proceso</small><b style="margin-top:.4em;color:#9696A8">76</b><small>Restantes</small></div></div>
  <div style="margin-top:.8em"><span class="u-chip s" style="border:1px solid #3a3a50">Explorador</span></div></div>
  <div class="m-card"><div class="u-s">Próxima meta</div><b style="font:400 .95em 'Sora_800ExtraBold'">Rango Aprendiz · 76 h</b><div class="u-bar2"><i style="width:62%"></i></div></div></div>${mFabs()}${mNav(1)}</div>`;

/** Comprobante de pasantía (móvil). */
export const mCertificado = () =>
  `<div class="u">${mTop()}<div class="m-body"><div class="u-row" style="margin-bottom:.8em"><span class="u-chip" style="margin:0;padding:.5em .9em;border-radius:.8em">‹</span><b style="font:400 1.15em/1.1 'Sora_800ExtraBold'">Comprobante<br>de pasantía</b></div>
  <div class="m-card"><span class="u-chip g" style="margin:0">● Comprobante validado</span><div style="margin:.7em 0 .8em;font-size:.82em">Pasantía de Contabilidad · Distribuidora Costa Azul</div><div class="u-btn o" style="display:block;text-align:center;color:#8890D5">Ver comprobante</div></div>
  <div style="background:#fff;border-radius:.6em;padding:.9em;color:#222;font:400 .62em/1.4 Georgia,serif;margin-top:.4em"><b style="display:block;text-align:center;font-size:1.15em">CONSTANCIA DE FINALIZACIÓN DE PASANTÍA</b><div style="text-align:center;letter-spacing:.3em;font-size:.8em;margin:.2em 0 .6em">UNIJOBER</div>Por medio de la presente se hace constar que la estudiante realizó y culminó satisfactoriamente su pasantía, con 200 horas certificadas.<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:.8em"><div style="border-top:1px solid #444;padding-top:.3em;width:55%;text-align:center">Dirección de Pasantías</div><div class="u-qr" style="width:3.4em">${Array.from({ length: 36 }, (_, i) => `<i class="${[1, 4, 8, 13, 17, 20, 25, 28, 31, 34].includes(i) ? 'z' : ''}" style="background:#222"></i>`).join('')}</div></div></div>
  </div>${mFabs()}${mNav(4)}</div>`;

// ── Réplicas de escritorio ────────────────────────────────────────────

const side = (role: string, items: string[], act: number, user: string) =>
  `<aside class="d-side"><div class="d-brand"><i class="d-em"></i>Uni<b>Jober</b></div><div data-nav>${items
    .map((n, i) => `<div class="d-ni ${i === act ? 'on' : ''}"><i></i>${n}</div>`)
    .join('')}</div><div class="d-user"><span class="u-av"></span><div><b>${esc(user)}</b><small>${role}</small></div></div></aside>`;
const top = (t: string, ph = 'Buscar…') =>
  `<div class="d-top"><b>${t}</b><span class="d-search">${ph}</span><span class="d-ic"><i></i><i></i><i></i></span></div>`;

const dVac = (ini: string, color: string, emp: string, tit: string, chips: string[], sal: string, cupos: string, skills: string[]) =>
  `<div class="m-card" style="margin:0"><div class="m-h"><span class="u-logo" style="background:${color}">${ini}</span><div><div class="m-emp">${esc(emp)}</div><div class="m-tit">${esc(tit)}</div></div></div>
  <div><span class="u-chip p">Vacante</span>${chips.map((c) => `<span class="u-chip">${esc(c)}</span>`).join('')}</div>
  <div><span class="u-chip g">${esc(sal)}</span><span class="u-chip o">${esc(cupos)}</span></div>
  <div>${skills.map((s) => `<span class="u-chip s">${esc(s)}</span>`).join('')}</div>
  <div class="m-foot"><span>hace 3 días</span><span class="u-btn">Postularme</span></div></div>`;

const dVacantes = () =>
  `<div class="d-tabs"><span class="on">Todas</span><span>Remoto</span><span>Presencial</span><span>Híbrido</span></div>
  <div class="d-g2">${dVac('BA', '#c2562d', 'Agencia Brújula Creativa', 'Pasante de Mercadotecnia Digital', ['Medio tiempo', 'Remoto'], '$250 - $400', 'Quedan 2 de 4 cupos', ['Redes sociales', 'Canva'])}${dVac('AL', '#2d5fa6', 'Bufete Alianza Legal', 'Asistente Jurídico', ['Tiempo completo', 'Presencial'], '$300 - $420', 'Quedan 1 de 2 cupos', ['Redacción'])}</div>`;

const dProgreso = () =>
  `<div class="u-t" style="margin-top:.6em">Mi <span class="a">progreso</span></div>
  <div class="d-tabs"><span>Puesto de trabajo</span><span class="on">Pasantía en curso</span></div>
  <div class="m-card"><div class="u-s" style="letter-spacing:.1em;text-transform:uppercase;color:#8890D5">Horas de práctica</div>
  <div class="u-row" style="margin-top:.8em;gap:1.6em"><div class="u-ring" style="--p:62%"><i>62%<small>124/200 hrs</small></i></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6em 2em" class="u-st"><div><b style="color:#4CB877">124</b><small>Cumplidas</small></div><div><b style="color:#f0a030">0</b><small>En proceso</small></div><div><b style="color:#9696A8">76</b><small>Restantes</small></div><div><b style="color:#8890D5">200</b><small>Objetivo</small></div></div></div>
  <div class="u-ok" style="margin-top:.9em;background:rgba(63,166,107,.1);border-radius:.8em;padding:.7em 1em">Vas al día: tus horas avanzan con cada asistencia registrada.</div></div>`;

const dComprobante = () =>
  `<div class="u-t" style="margin-top:.6em">Mi <span class="a">perfil</span></div>
  ${[['Reseñas', 'Calificación y comentarios recibidos'], ['Historial de puestos', 'Empleos anteriores y cómo terminaron'], ['Comprobante de pasantía', 'Comprobante validado'], ['Mi ubicación', 'San Salvador, San Salvador']]
    .map((r, i) => `<div class="d-li"><span class="u-logo" style="background:${i === 2 ? '#1f6e4c' : '#25264a'};border-radius:.8em"></span><div><b>${r[0]}</b><small>${r[1]}</small></div><small style="margin-left:auto">›</small></div>`)
    .join('')}`;

/** Cuerpo del laptop de estudiantes: 3 secciones apiladas que se recorren. */
export const laptopPage = () =>
  `<div class="u" style="padding:1.1em 1.3em 3em">${dVacantes()}<div style="height:2.2em"></div>${dProgreso()}<div style="height:2.2em"></div>${dComprobante()}</div>`;

const shellFull = (role: string, items: string[], act: number, user: string, title: string, body: string, ph?: string) =>
  `<div class="u d-shell">${side(role, items, act, user)}<div class="d-main">${top(title, ph)}<div class="d-body">${body}</div></div></div>`;

const UNI = ['Inicio', 'Mis Estudiantes', 'Pasantías', 'Mensajes', 'Mi Perfil'];
const EMP = ['Inicio', 'Trabajos', 'Reclutar', 'Pasantías', 'Mensajes', 'Mi Perfil'];

export const dUniInicio = () =>
  shellFull('Universidad', UNI, 0, 'Universidad Ejemplo', 'Inicio', `<div class="u-t" style="font-size:1.05em">Estadísticas de la <span class="a">red</span></div>
  <div class="m-card" style="margin-top:.6em"><div class="u-s">Top empresas</div>${[['Distribuidora Costa Azul', '3 alianzas'], ['Clínica Vida Plena', '2 alianzas'], ['Bufete Alianza Legal', '1 alianza']].map((r) => `<div class="u-row" style="margin-top:.55em"><span style="font-size:.8em">${r[0]}</span><span class="u-chip o" style="margin:0 0 0 auto">${r[1]} · ★ 5.0</span></div>`).join('')}</div>
  <div class="m-card"><div class="u-s">Top 3 estudiantes</div>${[['Ana Martínez', 'Contabilidad'], ['Luis Rivas', 'Administración']].map((r) => `<div class="u-row" style="margin-top:.55em"><span class="u-av"></span><div><b style="font:400 .85em 'Sora_800ExtraBold'">${r[0]}</b><div class="u-s" style="margin:0">${r[1]}</div></div><span class="u-chip o" style="margin:0 0 0 auto">★ 5.0</span></div>`).join('')}</div>`, 'Buscar estudiantes…');

export const dUniEstudiantes = () =>
  shellFull('Universidad', UNI, 1, 'Universidad Ejemplo', 'Mis estudiantes', `<div class="m-card"><b style="font:400 .95em 'Sora_800ExtraBold'">Gestión de estudiantes</b><div class="u-s">Crea un grupo y carga a tus estudiantes desde un Excel.</div><div class="u-btn" style="display:block;text-align:center;margin-top:.8em">Crear grupo y cargar estudiantes</div></div>
  ${[['María Flores', 'Contaduría Pública', 60], ['Jorge Mejía', 'Administración', 35], ['Karla Núñez', 'Mercadotecnia', 85]].map((r) => `<div class="d-li"><span class="u-av"></span><div style="flex:1"><b>${r[0]}</b><small>${r[1]}</small><div class="u-bar2" style="margin-top:.4em"><i style="width:${r[2]}%"></i></div></div><span class="st">Activo</span></div>`).join('')}`, 'Buscar estudiantes…');

export const dUniPasantias = () =>
  shellFull('Universidad', UNI, 2, 'Universidad Ejemplo', 'Pasantías', `<div class="d-tabs"><span>Incidencias</span><span class="on">En pasantía (8)</span><span>Por certificar (2)</span><span>Certificados (7)</span></div>
  ${[['Ana Martínez', 'Contabilidad · Distribuidora Costa Azul', 62], ['Luis Rivas', 'Asistente Jurídico · Bufete Alianza Legal', 40], ['Sofía Campos', 'Marketing Digital · Agencia Brújula', 78]].map((r) => `<div class="d-li"><div style="flex:1"><b>${r[0]}</b><small>${r[1]}</small><div class="u-bar2" style="margin-top:.5em"><i style="width:${r[2]}%"></i></div></div><span class="st">En curso</span></div>`).join('')}`, 'Buscar estudiantes…');

export const dUniMensajes = () =>
  shellFull('Universidad', UNI, 3, 'Universidad Ejemplo', 'Mensajes', `<div style="display:grid;grid-template-columns:34% 1fr;gap:.9em">
  <div>${['Distribuidora Costa Azul', 'Clínica Vida Plena', 'Bufete Alianza Legal'].map((n, i) => `<div class="d-li" style="margin:0 0 .5em;${i === 0 ? 'border-color:#34366a;background:#1a1b33' : ''}"><span class="u-av"></span><div><b style="font-size:.78em">${n}</b><small>${['Confirmado, gracias.', 'Recibimos el listado.', 'Quedamos atentos.'][i]}</small></div></div>`).join('')}</div>
  <div><div class="u-s" style="margin:0 0 .3em">Coordinación de Pasantías ↔ Distribuidora Costa Azul</div>
  <div class="u-bub l">Estimados, de parte de la Coordinación de Pasantías confirmamos la asignación de 2 cupos para el período septiembre a noviembre.<small>9:05</small></div>
  <div class="u-bub r">Recibido. Los estudiantes asignados se presentarán el lunes 8 de septiembre a las 8:00 a. m. Agradecemos su gestión.<small>9:12</small></div>
  <div class="u-bub l">Quedamos atentos a la constancia de finalización al concluir las horas.<small>9:14</small></div></div></div>`, 'Buscar…');

export const dEmpTrabajos = () =>
  shellFull('Plan Premium', EMP, 1, 'Distribuidora Costa Azul', 'Trabajos', `<div class="u-btn" style="display:block;text-align:center;font-size:.8em">＋ Publicar nueva pasantía o vacante</div>
  <div class="d-tabs"><span>Vacantes</span><span>Pasantías</span><span>Disponibles</span><span>Ocupados</span></div>
  ${[['Asistente Contable', 'Pasantía · Contabilidad · Presencial · 4 aplicantes', '1 de 2 cupos'], ['Auxiliar de Bodega', 'Vacante · Logística · Presencial · 2 aplicantes', '1 de 1 cupo'], ['Diseño de Material Gráfico', 'Pasantía · Diseño · Híbrido · 6 aplicantes', '2 de 3 cupos']].map((r) => `<div class="d-li"><div style="flex:1"><b>${r[0]}</b><small>${r[1]}</small><small style="display:block;color:#8890D5">${r[2]}</small></div><span class="st">Activa</span></div>`).join('')}`, 'Buscar candidatos o vacantes…');

export const dEmpPasantias = () =>
  shellFull('Plan Premium', EMP, 3, 'Distribuidora Costa Azul', 'Pasantías', `<div class="d-tabs"><span>Incidencias</span><span class="on">Pasantes por cupo (2)</span><span>Por certificar</span><span>Historial</span></div>
  <div class="m-card" style="border-color:#34366a;background:#14152a;text-align:center;font-size:.8em;color:#8890D5;padding:.8em">Registrar asistencia de pasantes</div>
  ${[['Paola Martínez', 'Día 1: 2026-09-01 · Asistente Contable', 25], ['Daniel Mozo', 'Día 1: 2026-09-05 · Auxiliar de Bodega', 19]].map((r) => `<div class="d-li"><div style="flex:1"><b>${r[0]}</b><small>${r[1]}</small><div class="u-bar2" style="margin-top:.5em"><i style="width:${(r[2] as number) * 2.5}%;background:#3FA66B"></i></div><small>${r[2]} % de las horas</small></div></div>`).join('')}`, 'Buscar candidatos o vacantes…');

/** Pantallas del teléfono, una por paso de texto (la de asistencia la diseñó UniJober). */
export const screensPhone = [mChat, mAsistencia, mProgreso, mCertificado];

// ── Armado de cada escena ─────────────────────────────────────────────

export type Step = { titulo: string; desc: string };

const stepsHtml = (steps: Step[], kicker: string) =>
  steps
    .map((s, i) => {
      const words = s.titulo.split(' ');
      const last = words.pop();
      return `<div class="ujs-step" data-step="${i}"><div class="ujs-count">${kicker} · ${String(i + 1).padStart(2, '0')} / ${String(steps.length).padStart(2, '0')}</div><h2>${esc(words.join(' '))} <span class="a">${esc(last || '')}</span></h2><p>${esc(s.desc)}</p></div>`;
    })
    .join('') + `<div class="ujs-dots" data-dots>${steps.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div>`;

/** Teléfono 3D con grosor: capas apiladas + cara frontal + tapa trasera + botones. */
export function phone3d(screenInner: string, attrs = '') {
  const slabs = Array.from({ length: 12 }, (_, i) => `<div class="ujs-slab" style="--i:${i}"></div>`).join('');
  const emb = `<svg viewBox="${EMBLEM_VIEWBOX}" fill="none"><defs>${EMBLEM_DEFS.replace('id="ujg"', 'id="ujgb"')}</defs>${EMBLEM_INNER.replace(/url\(#ujg\)/g, '#fff')}</svg>`;
  return `<div class="ujs-ph" ${attrs}>${slabs}
    <div class="ujs-key" style="top:20%;height:7%"></div><div class="ujs-key" style="top:30%;height:12%"></div>
    <div class="ujs-face ujs-front"><div class="ujs-notch"></div><div class="ujs-pscr ujs-ui" data-r="pscr">${screenInner}</div></div>
    <div class="ujs-face ujs-back"><div class="ujs-cam"><i></i><i></i><i></i><i></i></div>${emb}</div></div>`;
}

export function laptopHtml(steps: Step[]) {
  const slabs = Array.from({ length: 6 }, (_, i) => `<div class="ujs-lslab" style="--i:${i}"></div>`).join('');
  return `<div class="ujs-story" data-story="lap" style="height:330vh"><div class="ujs-sticky">
    <div class="ujs-steps" data-steps>${stepsHtml(steps, 'Estudiantes')}</div>
    <div class="ujs-stage"><div class="ujs-lap" data-r="lap"><div class="ujs-lidbox">${slabs}<div class="ujs-lback"></div>
      <div class="ujs-lface"><div class="ujs-scr" data-r="scr"><div class="ujs-bar"><i></i><i></i><i></i><span>UniJober</span></div>
        <div class="ujs-pgv" data-r="pgv"><div class="u d-shell" style="position:absolute;inset:0">${side('Estudiante', ['Vacantes', 'Progreso', 'Institución', 'Mensajes', 'Perfil'], 0, 'Ana Martínez')}<div class="d-main">${top('Vacantes', 'Buscar vacantes…')}<div style="position:absolute;left:0;right:0;top:3.3em;bottom:0;overflow:hidden"><div class="ujs-pg ujs-ui" data-r="pg">${laptopPage()}</div></div></div></div></div></div></div></div>
      <div class="ujs-deck"><div class="ujs-deckface"><div class="ujs-pad"></div></div><div class="ujs-deckfront"></div></div></div></div>
  </div></div>`;
}

export function phoneHtml(steps: Step[]) {
  const screens = screensPhone.map((f) => `<div class="ujs-sc" data-sc>${f()}</div>`).join('');
  return `<div class="ujs-story" data-story="ph" style="height:430vh"><div class="ujs-sticky rev">
    <div class="ujs-stage">${phone3d(screens, 'data-r="ph"')}</div>
    <div class="ujs-steps" data-steps>${stepsHtml(steps, 'En tu bolsillo')}</div>
  </div></div>`;
}

export function mosaicHtml(emp: { titulo: string; items: string[] }, uni: { titulo: string; items: string[] }, fotos: string[]) {
  const foto = (i: number, cls: string) => `<div class="ujs-mc ${cls} ujs-ph-photo" style="background-image:url('${fotos[i % fotos.length] || ''}')"></div>`;
  const scr = (h: string, cls: string) => `<div class="ujs-mc ${cls}"><div class="ujs-ui u" data-mc="${cls}" style="position:absolute;inset:0">${h}</div></div>`;
  const cols = [
    [scr(dUniInicio(), 'ls'), foto(0, 'ls'), scr(mChat(), 'ph'), scr(dEmpTrabajos(), 'ls')],
    [foto(1, 'ls'), scr(dUniPasantias(), 'ls'), scr(mFeed(), 'ph'), foto(3, 'ls')],
    [scr(dUniMensajes(), 'ls'), scr(mProgreso(), 'ph'), foto(4, 'ls'), scr(dEmpPasantias(), 'ls')],
  ];
  const step = (s: { titulo: string; items: string[] }, i: number, n: number) => {
    const words = s.titulo.split(' ');
    const last = words.pop();
    return `<div class="ujs-step" data-step="${i}"><div class="ujs-count">Para ellos · 0${i + 1} / 0${n}</div><h2>${esc(words.join(' '))} <span class="a">${esc(last || '')}</span></h2><ul>${s.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`;
  };
  return `<div class="ujs-story ujs-mo" data-story="mo" style="height:280vh"><div class="ujs-sticky">
    <div class="ujs-mo-bg"><div class="ujs-grid" data-r="grid">${cols.map((c) => `<div class="ujs-col" data-col>${c.join('')}</div>`).join('')}</div></div>
    <div class="ujs-mo-fade"></div>
    <div class="ujs-steps" data-steps>${step(emp, 0, 2)}${step(uni, 1, 2)}<div class="ujs-dots" data-dots><i class="on"></i><i></i></div></div>
  </div></div>`;
}

export function introHtml(mision: string, vision: string) {
  return `<div class="ujs-intro"><span class="ujs-kick">La plataforma</span><h2>¿Qué es <span class="a">UniJober</span>?</h2>
  <div class="ujs-mv"><div><b>Misión</b><p>${esc(mision)}</p></div><div><b>Visión</b><p>${esc(vision)}</p></div></div></div>`;
}
