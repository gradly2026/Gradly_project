// ════════════════════════════════════════════════════════════════════════
// Contenido (HTML + CSS) de las "historias con scroll" de /bienvenida:
// laptop con la plataforma que se recorre sola, teléfono 3D que sube, crece
// y gira, y fondo de pantallas en perspectiva. SOLO web (ver UJStories.tsx).
//
// Las pantallas que se ven dentro de los aparatos son ILUSTRATIVAS: usan el
// diseño de la app con datos inventados, no son capturas reales. Cuando
// existan capturas reales basta con cambiar los bloques `screen*` por <img>.
// Todo el tamaño interno va en `em`, y UJStories fija el font-size de cada
// pantalla según su ancho, así las pantallas escalan en cualquier tamaño.
// ════════════════════════════════════════════════════════════════════════
import { EMBLEM_DEFS, EMBLEM_INNER, EMBLEM_VIEWBOX } from './uniJoberEmblem';

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const STORIES_CSS = `
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

/* ---- laptop ---- */
.ujs-lap{position:relative;width:min(700px,100%);transform-style:preserve-3d;will-change:transform}
.ujs-lid{position:relative;aspect-ratio:16/10.2;background:#0e0e14;border:2px solid #34344a;border-radius:18px 18px 6px 6px;padding:2.4%;box-shadow:0 50px 100px -20px #000,0 0 80px rgba(89,99,196,.25),inset 0 0 0 1px #1a1a24}
.ujs-scr{position:relative;width:100%;height:100%;border-radius:8px;overflow:hidden;background:#0B0B0F}
.ujs-bar{position:absolute;left:0;right:0;top:0;height:2.3em;background:#15151c;border-bottom:1px solid #2A2A34;display:flex;align-items:center;gap:.5em;padding:0 .9em;z-index:3;font-size:inherit}
.ujs-bar i{width:.6em;height:.6em;border-radius:50%;background:#34344a}
.ujs-bar span{margin-left:.8em;background:#0B0B0F;border-radius:.4em;padding:.2em 1.4em;font-size:.65em;color:#9696A8}
.ujs-pgv{position:absolute;left:0;right:0;top:2.3em;bottom:0;overflow:hidden}
.ujs-pg{position:absolute;left:0;top:0;width:100%;will-change:transform}
.ujs-base{height:16px;margin:0 -5%;background:linear-gradient(#34344a,#15151c);border-radius:0 0 22px 22px;position:relative;box-shadow:0 30px 50px -10px #000}
.ujs-base::before{content:"";position:absolute;left:50%;top:0;width:16%;height:6px;transform:translateX(-50%);background:#0e0e14;border-radius:0 0 8px 8px}

/* ---- teléfono ---- */
.ujs-ph{position:relative;width:min(290px,60vw);aspect-ratio:9/19;transform-style:preserve-3d;will-change:transform}
.ujs-face{position:absolute;inset:0;border-radius:2.7em;backface-visibility:hidden;-webkit-backface-visibility:hidden}
.ujs-front{background:#0b0b10;border:.55em solid #1b1b26;box-shadow:0 0 0 2px #3a3a50,0 50px 90px -20px #000,0 0 70px rgba(89,99,196,.35)}
.ujs-back{transform:rotateY(180deg);background:linear-gradient(145deg,#2b2f6e,#5963C4 45%,#8890D5);box-shadow:0 0 0 2px #3a3a50,0 50px 90px -20px #000;display:grid;place-items:center}
.ujs-back svg{width:38%;height:auto;opacity:.95}
.ujs-cam{position:absolute;left:1.2em;top:1.2em;width:4.4em;height:4.4em;border-radius:1.2em;background:rgba(10,10,20,.55);display:grid;grid-template-columns:1fr 1fr;gap:.35em;padding:.55em}
.ujs-cam i{border-radius:50%;background:radial-gradient(#444,#111);box-shadow:inset 0 0 0 .15em #2b2b3a}
.ujs-notch{position:absolute;left:50%;top:.7em;transform:translateX(-50%);width:32%;height:1.2em;background:#000;border-radius:1em;z-index:6}
.ujs-pscr{position:absolute;inset:0;border-radius:2.1em;overflow:hidden;background:#0B0B0F}
.ujs-sc{position:absolute;inset:0;padding:3em .9em 4.4em;will-change:transform,opacity;overflow:hidden}
.ujs-tab{position:absolute;left:0;right:0;bottom:0;height:3.6em;background:#101016;border-top:1px solid #2A2A34;display:flex;justify-content:space-around;align-items:center;z-index:5}
.ujs-tab i{width:1.3em;height:1.3em;border-radius:.4em;background:#2A2A34}
.ujs-tab i.on{background:#8890D5}

/* ---- bloques de interfaz ilustrativa (em) ---- */
.u{font-family:'Inter_400Regular',Inter,sans-serif}
.u-hd{display:flex;justify-content:space-between;align-items:center;padding:.9em 1.2em;border-bottom:1px solid #2A2A34;background:#101016}
.u-logo{font:400 1.05em 'Sora_800ExtraBold',Sora,sans-serif}
.u-nav{display:flex;gap:1.2em;font-size:.72em;color:#9696A8}.u-nav b{color:#F4F4F8;font-weight:400}.u-nav span,.u-nav b{display:inline-block}
.u-av{width:1.9em;height:1.9em;border-radius:50%;background:linear-gradient(135deg,#5963C4,#8890D5)}
.u-sec{padding:1.3em 1.4em}
.u-t{font:400 1.5em/1.1 'Sora_800ExtraBold',Sora,sans-serif;text-transform:uppercase;letter-spacing:-.01em}
.u-t .a{color:#8890D5}
.u-s{color:#9696A8;font-size:.78em;margin-top:.3em}
.u-g3{display:grid;grid-template-columns:repeat(3,1fr);gap:.8em;margin-top:1em}
.u-g2{display:grid;grid-template-columns:1fr 1fr;gap:.8em;margin-top:1em}
.u-c{background:#131318;border:1px solid #2A2A34;border-radius:.9em;padding:.9em}
.u-c b{display:block;font:400 .95em 'Sora_800ExtraBold',Sora,sans-serif;line-height:1.2}
.u-c small{display:block;color:#9696A8;font-size:.72em;margin-top:.2em}
.u-ic{width:2em;height:2em;border-radius:.6em;background:rgba(136,144,213,.16);margin-bottom:.6em;display:grid;place-items:center;color:#8890D5;font-size:.9em}
.u-chip{display:inline-block;background:#1c1c26;border-radius:99px;padding:.18em .7em;font-size:.62em;color:#c9cdf5;margin:.5em .3em 0 0}
.u-btn{display:inline-block;background:#5963C4;color:#fff;border-radius:.6em;padding:.45em 1em;font-size:.68em;margin-top:.8em;font-family:'Inter_600SemiBold',Inter,sans-serif}
.u-btn.o{background:transparent;border:1px solid #3a3a50;color:#c9cdf5}
.u-bar2{height:.55em;background:#2A2A34;border-radius:1em;overflow:hidden;margin-top:.7em}
.u-bar2 i{display:block;height:100%;background:linear-gradient(90deg,#5963C4,#8890D5)}
.u-ring{width:6em;height:6em;border-radius:50%;background:conic-gradient(#8890D5 0 62%,#2A2A34 0);display:grid;place-items:center;margin:.2em auto}
.u-ring i{width:4.6em;height:4.6em;border-radius:50%;background:#131318;display:grid;place-items:center;font:400 1.15em 'Sora_800ExtraBold',Sora,sans-serif;font-style:normal}
.u-wk{display:flex;align-items:flex-end;gap:.45em;height:4em;margin-top:.8em}
.u-wk i{flex:1;background:linear-gradient(#8890D5,#5963C4);border-radius:.3em .3em 0 0}
.u-code{display:flex;gap:.4em;justify-content:center;margin:.7em 0}
.u-code i{font:400 1.5em 'Sora_800ExtraBold',Sora,sans-serif;font-style:normal;background:#0B0B0F;border:1px solid #3a3a50;border-radius:.4em;width:1.4em;text-align:center;padding:.2em 0}
.u-bub{padding:.55em .85em;border-radius:1em;font-size:.78em;max-width:84%;line-height:1.35;margin-top:.55em}
.u-bub.l{background:#22222c}
.u-bub.r{background:#5963C4;margin-left:auto}
.u-ok{color:#7fe0b0;font-size:.75em}
.u-qr{display:grid;grid-template-columns:repeat(6,1fr);gap:.18em;width:5em;margin:.6em 0}
.u-qr i{aspect-ratio:1;background:#F4F4F8;border-radius:.1em}.u-qr i.z{background:transparent}
.u-row{display:flex;align-items:center;gap:.7em}
.u-row .u-av{flex:none}
.u-tt{font:400 1.08em/1.15 'Sora_800ExtraBold',Sora,sans-serif}

/* ---- fondo de pantallas en perspectiva ---- */
.ujs-mo{position:relative}
.ujs-mo .ujs-sticky{display:block;max-width:none;padding:0}
.ujs-mo-bg{position:absolute;inset:0;perspective:1400px;overflow:hidden;background:radial-gradient(900px circle at 70% 40%,rgba(89,99,196,.22),transparent 65%),#0B0B0F}
.ujs-grid{position:absolute;left:34%;top:-30%;width:92%;display:flex;gap:22px;transform:rotateX(52deg) rotateZ(-20deg) scale(1.05);transform-origin:50% 50%;transform-style:preserve-3d}
.ujs-col{flex:1;display:flex;flex-direction:column;gap:22px;will-change:transform}
.ujs-mc{font-size:13px;border-radius:22px;overflow:hidden;border:1px solid #2A2A34;background:#101016;box-shadow:0 30px 60px -20px #000}
.ujs-mc.ph{aspect-ratio:9/16}
.ujs-mc.ls{aspect-ratio:4/3}
.ujs-mc.ph .u-sec{padding:1em}
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

// ── Bloques de pantalla (ilustrativos) ────────────────────────────────

const ICON = '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
const ic = {
  brief: ICON + '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2"/></svg>',
  clock: ICON + '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  chat: ICON + '<path d="M21 12a8 8 0 01-11.5 7.2L4 20l1-4.5A8 8 0 1121 12z"/></svg>',
  check: ICON + '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/></svg>',
  school: ICON + '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/></svg>',
  users: ICON + '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14.5c2 .6 3.5 2.2 3.5 5.5"/></svg>',
};

const header = (activo: string) =>
  `<div class="u-hd"><span class="u-logo">Uni<span class="a">Jober</span></span><span class="u-nav">${['Inicio', 'Pasantías', 'Chat', 'Perfil']
    .map((n) => (n === activo ? `<b>${n}</b>` : `<span>${n}</span>`))
    .join('')}</span><span class="u-av"></span></div>`;

const vacante = (t: string, e: string, chips: string[], cta = 'Aplicar') =>
  `<div class="u-c"><div class="u-ic">${ic.brief}</div><b>${esc(t)}</b><small>${esc(e)}</small><div>${chips.map((c) => `<span class="u-chip">${esc(c)}</span>`).join('')}</div><span class="u-btn">${cta}</span></div>`;

/** Feed de pasantías (estudiante). */
export const screenFeed = (ancho = true) =>
  `<div class="u">${ancho ? header('Pasantías') : ''}<div class="u-sec"><div class="u-t">Pasantías para <span class="a">tu carrera</span></div><div class="u-s">Ofertas reales, verificadas por tu universidad</div>
  <div class="${ancho ? 'u-g3' : ''}" style="${ancho ? '' : 'display:grid;gap:.7em;margin-top:.9em'}">${vacante('Analista de Datos Jr.', 'Empresa de Tecnología', ['Presencial', '20 h/sem'])}${vacante('Soporte de Sistemas', 'Empresa Financiera', ['Híbrido', '25 h/sem'])}${ancho ? vacante('Asistente de Marketing', 'Agencia de Marketing', ['Remoto', '15 h/sem']) : ''}</div></div></div>`;

/** Progreso de horas. */
export const screenProgreso = (ancho = true) =>
  `<div class="u">${ancho ? '' : ''}<div class="u-sec"><div class="u-t">Tu <span class="a">progreso</span></div><div class="u-s">Las horas avanzan solas con tu asistencia</div>
  <div class="${ancho ? 'u-g2' : ''}" style="${ancho ? '' : 'display:grid;gap:.7em;margin-top:.9em'}"><div class="u-c"><div class="u-ring"><i>62%</i></div><b style="text-align:center;margin-top:.5em">124 de 200 horas</b><small style="text-align:center">Analista de Datos Jr.</small></div>
  <div class="u-c"><b>Esta semana</b><small>18 h registradas</small><div class="u-wk">${[40, 70, 55, 90, 65, 30, 15].map((h) => `<i style="height:${h}%"></i>`).join('')}</div><div class="u-bar2"><i style="width:62%"></i></div></div></div></div></div>`;

/** Código de asistencia. */
export const screenAsistencia = (ancho = true) =>
  `<div class="u"><div class="u-sec"><div class="u-t">Asistencia <span class="a">de hoy</span></div><div class="u-s">Ingresa el código que te da tu empresa</div>
  <div class="u-c" style="margin-top:1em;text-align:center"><small>Código del día</small><div class="u-code">${'482917'.split('').map((d) => `<i>${d}</i>`).join('')}</div><span class="u-btn">Marcar asistencia</span><div class="u-ok" style="margin-top:.7em">Entrada registrada 8:02 a. m.</div></div>
  ${ancho ? '' : '<div class="u-c" style="margin-top:.7em"><b>Horario acordado</b><small>Lun a vie · 8:00 a 12:00</small></div>'}</div></div>`;

/** Chat estudiante ↔ empresa. */
export const screenChat = () =>
  `<div class="u"><div class="u-sec"><div class="u-row"><span class="u-av"></span><div><div class="u-tt">Empresa de Tecnología</div><div class="u-ok">en línea</div></div></div>
  <div class="u-bub l">Hola Ana, ¿puedes llegar mañana a las 8?</div><div class="u-bub r">Claro, ahí estaré. ¿Llevo mi laptop?</div><div class="u-bub l">Sí, y tu carné universitario.</div><div class="u-bub r">Perfecto, gracias.</div></div></div>`;

/** Comprobante validado. */
export const screenCertificado = () =>
  `<div class="u"><div class="u-sec"><div class="u-t">Comprobante <span class="a">validado</span></div><div class="u-s">Tu universidad ya lo aprobó</div>
  <div class="u-c" style="margin-top:1em"><div class="u-row"><div class="u-ic" style="margin:0;color:#7fe0b0;background:rgba(127,224,176,.14)">${ic.check}</div><div><b>200 horas certificadas</b><small>Analista de Datos Jr.</small></div></div>
  <div class="u-row" style="margin-top:.8em"><div class="u-qr">${Array.from({ length: 36 }, (_, i) => `<i class="${[1, 4, 8, 13, 17, 20, 25, 28, 31, 34].includes(i) ? 'z' : ''}"></i>`).join('')}</div><div><small>Verificable con código QR</small><span class="u-btn o" style="margin-top:.4em">Descargar PDF</span></div></div></div></div></div>`;

/** Panel de empresa. */
export const screenEmpresa = () =>
  `<div class="u"><div class="u-sec"><div class="u-t">Tus <span class="a">pasantes</span></div><div class="u-s">Seguimiento por carrera y universidad</div>
  ${['Ana M. · Ing. en Sistemas', 'Luis R. · Administración', 'Sofía C. · Mercadotecnia']
    .map((n, i) => `<div class="u-c u-row" style="margin-top:.7em"><span class="u-av"></span><div style="flex:1"><b>${n}</b><div class="u-bar2"><i style="width:${[62, 38, 85][i]}%"></i></div></div><small>${[62, 38, 85][i]}%</small></div>`)
    .join('')}</div></div>`;

/** Panel de universidad. */
export const screenUniversidad = () =>
  `<div class="u"><div class="u-sec"><div class="u-t">Cupos y <span class="a">alianzas</span></div><div class="u-s">Reparte y valida sin papeleo</div>
  <div class="u-g2"><div class="u-c"><div class="u-ic">${ic.users}</div><b>128</b><small>Estudiantes activos</small></div><div class="u-c"><div class="u-ic">${ic.brief}</div><b>24</b><small>Empresas aliadas</small></div></div>
  <div class="u-c u-row" style="margin-top:.8em"><div class="u-ic" style="margin:0;color:#7fe0b0;background:rgba(127,224,176,.14)">${ic.check}</div><div style="flex:1"><b>12 comprobantes</b><small>por validar</small></div><span class="u-btn" style="margin:0">Revisar</span></div></div></div>`;

const tabbar = (n: number) =>
  `<div class="ujs-tab">${[0, 1, 2, 3, 4].map((i) => `<i class="${i === n ? 'on' : ''}"></i>`).join('')}</div>`;

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

export function laptopHtml(steps: Step[]) {
  const page = `<div class="ujs-pg ujs-ui u" data-r="pg">${header('Pasantías')}${screenFeed(true).replace(header('Pasantías'), '')}${screenProgreso(true)}
    <div class="u-sec"><div class="u-g2"><div>${screenChat().replace('class="u"', 'class="u" style="margin:-1.3em -1.4em"')}</div><div>${screenCertificado().replace('class="u"', 'class="u" style="margin:-1.3em -1.4em"')}</div></div></div></div>`;
  return `<div class="ujs-story" data-story="lap" style="height:330vh"><div class="ujs-sticky">
    <div class="ujs-steps" data-steps>${stepsHtml(steps, 'Estudiantes')}</div>
    <div class="ujs-stage"><div class="ujs-lap" data-r="lap"><div class="ujs-lid"><div class="ujs-scr" data-r="scr"><div class="ujs-bar"><i></i><i></i><i></i><span>UniJober</span></div><div class="ujs-pgv" data-r="pgv">${page}</div></div></div><div class="ujs-base"></div></div></div>
  </div></div>`;
}

export function phoneHtml(steps: Step[]) {
  const screens = [
    `<div class="ujs-sc" data-sc>${screenChat()}</div>`,
    `<div class="ujs-sc" data-sc>${screenAsistencia(false)}</div>`,
    `<div class="ujs-sc" data-sc>${screenProgreso(false)}</div>`,
    `<div class="ujs-sc" data-sc>${screenCertificado()}</div>`,
  ].join('');
  const emb = `<svg viewBox="${EMBLEM_VIEWBOX}" fill="none"><defs>${EMBLEM_DEFS.replace('id="ujg"', 'id="ujgb"')}</defs>${EMBLEM_INNER.replace(/url\(#ujg\)/g, '#fff')}</svg>`;
  return `<div class="ujs-story" data-story="ph" style="height:430vh"><div class="ujs-sticky rev">
    <div class="ujs-stage"><div class="ujs-ph" data-r="ph">
      <div class="ujs-face ujs-front"><div class="ujs-notch"></div><div class="ujs-pscr ujs-ui" data-r="pscr">${screens}${tabbar(0)}</div></div>
      <div class="ujs-face ujs-back"><div class="ujs-cam"><i></i><i></i><i></i><i></i></div>${emb}</div>
    </div></div>
    <div class="ujs-steps" data-steps>${stepsHtml(steps, 'En tu bolsillo')}</div>
  </div></div>`;
}

export function mosaicHtml(emp: { titulo: string; items: string[] }, uni: { titulo: string; items: string[] }, fotos: string[]) {
  const foto = (i: number, cls: string) => `<div class="ujs-mc ${cls} ujs-ph-photo" style="background-image:url('${fotos[i % fotos.length] || ''}')"></div>`;
  const scr = (h: string, cls = 'ph') => `<div class="ujs-mc ${cls}"><div class="ujs-ui u" data-mc>${h}</div></div>`;
  const cols = [
    [scr(screenEmpresa()), foto(0, 'ls'), scr(screenChat()), foto(2, 'ls')],
    [foto(1, 'ls'), scr(screenUniversidad()), foto(3, 'ls'), scr(screenCertificado())],
    [scr(screenAsistencia(false)), scr(screenProgreso(false)), foto(4, 'ls'), scr(screenFeed(false))],
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
