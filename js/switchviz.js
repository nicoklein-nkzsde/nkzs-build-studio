// Animierte Schnittansicht eines Switches (Skelett-Stil) + Kraftkurve.
// Typen: linear | tactile | clicky | magnetic
import { playKey } from './sound.js';

export const SWITCH_INFO = {
  linear: {
    name: 'Linear',
    what: 'Der Stempel gleitet ohne Widerstandshügel gerade nach unten – nur die Feder drückt gleichmäßig zurück. Bei ca. 2 mm berühren sich die Metallkontakte und die Taste zählt.',
    good: 'Gaming, schnelles Tippen, der klassische „Thock“-Sound.',
    bad: 'Kein spürbares Feedback, wann die Taste auslöst.',
    ex: 'Gateron Oil King, Keygeek Y2, Banana Split, Cherry Red',
  },
  tactile: {
    name: 'Taktil',
    what: 'Am Stempel sitzt ein kleiner Höcker („Bump“). Er drückt die Kontaktfeder zur Seite – das spürst du als kurzen Widerstand, direkt bevor die Taste auslöst.',
    good: 'Viel Schreiben, Programmieren, weniger Vertipper.',
    bad: 'Für sehr schnelles Spamming etwas langsamer als linear.',
    ex: 'Boba U4T, Glorious Panda, Keychron Banana',
  },
  clicky: {
    name: 'Clicky',
    what: 'Ein Klickbügel schnappt beim Drücken und beim Loslassen hörbar zurück – Bump plus lautes „Klick“.',
    good: 'Spaß, maximales Feedback, Schreibmaschinen-Gefühl.',
    bad: 'Laut – nichts für Büro, Stream-Mikrofon oder Mitbewohner.',
    ex: 'Kailh Box Jade, Box White',
  },
  magnetic: {
    name: 'Magnetisch (Hall-Effekt)',
    what: 'Im Stempel steckt ein Magnet, darunter misst ein Hall-Sensor auf der Platine den Abstand – ohne Kontakt, stufenlos. Du stellst selbst ein, ab welcher Tiefe die Taste auslöst.',
    good: 'Esport: einstellbarer Auslösepunkt (0,1–4 mm) und Rapid Trigger – die Taste setzt sich sofort beim Hochgehen zurück. Perfekt für Strafing in CS2, Valorant, Fortnite.',
    bad: 'Braucht ein Hall-Effect-PCB, teurer, weniger Sound-Auswahl.',
    ex: 'Gateron KS-20, Wooting Lekker, Razer Analog',
  },
};

// Kraft in Gramm abhängig vom Weg x (0–4 mm)
function force(type, x) {
  const spring = 38 + (x / 4) * 22;
  if (type === 'tactile') return spring + 28 * Math.exp(-((x - 0.7) ** 2) / 0.08) - (x > 0.7 && x < 1.3 ? 6 : 0);
  if (type === 'clicky') return spring + 26 * Math.exp(-((x - 1.5) ** 2) / 0.02) + 8 * Math.exp(-((x - 1.2) ** 2) / 0.1);
  return spring;
}
const ACT = { linear: 2.0, tactile: 2.0, clicky: 1.8, magnetic: 1.2 };

let raf = null;
export function stopViz() { if (raf) cancelAnimationFrame(raf); raf = null; }

export function mountViz(el, { type, getSound, sound, onType }) {
  stopViz();
  if (!el) return;
  const st = { type, act: ACT.magnetic, sound, rapid: true, lastPhase: '' };
  const info = SWITCH_INFO[type];
  el.innerHTML = `
    <div class="sv-head"><b>So funktioniert dein Switch</b></div>
    <div class="sv-tabs">${Object.entries(SWITCH_INFO).map(([k, v]) => `<button data-svt="${k}" class="${k === type ? 'on' : ''}">${v.name.split(' ')[0]}</button>`).join('')}</div>
    <svg viewBox="0 0 520 250" class="sv-svg" role="img" aria-label="Schnittansicht ${info.name}">
      <g class="sv-sect"></g>
      <g class="sv-graph"></g>
    </svg>
    <div class="sv-ctrl">
      <label class="chk"><input type="checkbox" data-svsound ${st.sound ? 'checked' : ''}> mit Ton</label>
      ${type === 'magnetic' ? `<label class="sv-act">Auslösepunkt <input type="range" min="0.1" max="4" step="0.1" value="${st.act}" data-svact> <b>${st.act.toFixed(1)} mm</b></label>` : ''}
    </div>
    <div class="sv-text">
      <p>${info.what}</p>
      <p><b>Gut für:</b> ${info.good}</p>
      <p><b>Nachteil:</b> ${info.bad}</p>
      <p class="sv-ex">Beispiele: ${info.ex}</p>
    </div>`;
  el.querySelectorAll('[data-svt]').forEach((b) => b.addEventListener('click', () => onType(b.dataset.svt)));
  el.querySelector('[data-svsound]').addEventListener('change', (e) => { st.sound = e.target.checked; onType(type, st.sound); });
  const actIn = el.querySelector('[data-svact]');
  if (actIn) actIn.addEventListener('input', () => { st.act = +actIn.value; actIn.nextElementSibling.textContent = st.act.toFixed(1) + ' mm'; });

  const sect = el.querySelector('.sv-sect'), graph = el.querySelector('.sv-graph');
  const S = 9; // px pro mm (4 mm Hub = 36 px)
  // Kraftkurve (statisch)
  const gx = (x) => 300 + (x / 4) * 190, gy = (f) => 215 - (f / 100) * 170;
  let path = '';
  for (let i = 0; i <= 80; i++) { const x = (i / 80) * 4; path += `${i ? 'L' : 'M'}${gx(x).toFixed(1)},${gy(force(type, x)).toFixed(1)}`; }
  path += `L${gx(4)},${gy(100)}`;
  const actX = () => (type === 'magnetic' ? st.act : ACT[type]);
  graph.innerHTML = `
    <line x1="300" y1="215" x2="495" y2="215" class="sv-axis"/><line x1="300" y1="215" x2="300" y2="40" class="sv-axis"/>
    <text x="398" y="238" class="sv-lbl" text-anchor="middle">Weg (mm) →</text>
    <text x="292" y="45" class="sv-lbl" text-anchor="end">g</text>
    ${[0, 1, 2, 3, 4].map((m) => `<text x="${gx(m)}" y="228" class="sv-tick" text-anchor="middle">${m}</text>`).join('')}
    ${[25, 50, 75, 100].map((f) => `<text x="294" y="${gy(f) + 3}" class="sv-tick" text-anchor="end">${f}</text><line x1="300" x2="495" y1="${gy(f)}" y2="${gy(f)}" class="sv-grid"/>`).join('')}
    <path d="${path}" class="sv-curve"/>
    <line class="sv-actline" y1="40" y2="215"/>
    <text class="sv-lbl sv-acttxt" y="36" text-anchor="middle">Auslösung</text>
    <circle class="sv-dot" r="5"/>
    <text x="398" y="18" class="sv-title" text-anchor="middle">Kraftkurve – ${info.name}</text>`;
  const dot = graph.querySelector('.sv-dot'), actLine = graph.querySelector('.sv-actline'), actTxt = graph.querySelector('.sv-acttxt');

  const t0 = performance.now();
  const P = 2400;
  const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
  let prevX = 0, triggered = false, peak = 0;

  function frame(now) {
    const u = ((now - t0) % P) / P;
    let x, phase;
    if (u < 0.38) { x = 4 * ease(u / 0.38); phase = 'down'; }
    else if (u < 0.55) { x = 4; phase = 'bottom'; }
    else if (u < 0.88) { x = 4 * (1 - ease((u - 0.55) / 0.33)); phase = 'up'; }
    else { x = 0; phase = 'idle'; }
    const d = x * S;
    const a = actX();
    // Auslöselogik (Rapid Trigger bei magnetisch: Reset sofort beim Hochgehen)
    if (phase === 'down' && x >= a && !triggered) { triggered = true; if (st.sound && type === 'clicky') snd(true, 'click'); }
    if (type === 'magnetic' && st.rapid) { if (x < prevX - 0.05 && triggered) triggered = false; }
    else if (x < a - 0.4) triggered = false;
    if (phase === 'bottom' && st.lastPhase !== 'bottom' && st.sound) snd(true);
    if (phase === 'idle' && st.lastPhase === 'up' && st.sound) snd(false);
    st.lastPhase = phase;
    peak = x > prevX ? x : peak;
    prevX = x;
    draw(x, d, triggered, phase);
    const f = x >= 3.98 && phase === 'bottom' ? 100 : force(type, x);
    dot.setAttribute('cx', gx(x)); dot.setAttribute('cy', gy(f));
    actLine.setAttribute('x1', gx(a)); actLine.setAttribute('x2', gx(a));
    actTxt.setAttribute('x', gx(a));
    raf = requestAnimationFrame(frame);
  }
  function snd(down) {
    const p = { ...(getSound() || {}), type };
    playKey(p, down, false);
  }

  function spring(y1, y2, cx = 135, w = 11, turns = 7) {
    let pts = `${cx},${y1}`;
    const h = (y2 - y1) / (turns * 2);
    for (let i = 1; i <= turns * 2; i++) pts += ` ${cx + (i % 2 ? w : -w)},${(y1 + h * i).toFixed(1)}`;
    return `<polyline points="${pts} ${cx},${y2}" class="sv-spring"/>`;
  }

  function draw(x, d, on, phase) {
    const capY = 44 + d, stemTop = 70 + d, stemBot = 162 + d;
    let h = '';
    // Plate & PCB
    h += `<line x1="30" y1="150" x2="250" y2="150" class="sv-plate"/><text x="34" y="145" class="sv-lbl">Plate</text>`;
    h += `<rect x="30" y="214" width="220" height="9" rx="2" class="sv-pcb"/><text x="34" y="236" class="sv-lbl">Platine (PCB)</text>`;
    // Gehäuse
    h += `<path d="M78,108 L192,108 L204,150 L66,150 Z" class="sv-house"/>`;
    h += `<rect x="66" y="150" width="138" height="56" rx="3" class="sv-house"/>`;
    // Keycap
    h += `<path d="M58,${capY + 26} L66,${capY} L204,${capY} L212,${capY + 26} Z" class="sv-cap"/><text x="135" y="${capY + 17}" class="sv-lbl" text-anchor="middle">Keycap</text>`;
    // Stempel
    h += `<rect x="124" y="${stemTop}" width="22" height="${stemBot - stemTop}" rx="2" class="sv-stem ${on ? 'on' : ''}"/>`;
    h += `<rect x="146" y="${stemTop + 58}" width="10" height="34" rx="1" class="sv-stem ${on ? 'on' : ''}"/>`;
    // Feder (unten fix am Gehäuseboden)
    h += spring(stemBot, 204);
    h += `<text x="96" y="196" class="sv-lbl" text-anchor="end">Feder</text>`;

    if (type === 'magnetic') {
      // Magnet im Stempel + Hall-Sensor
      h += `<rect x="124" y="${stemBot - 12}" width="11" height="12" class="sv-magN"/><rect x="135" y="${stemBot - 12}" width="11" height="12" class="sv-magS"/>`;
      h += `<text x="152" y="${stemBot - 2}" class="sv-lbl">Magnet</text>`;
      h += `<rect x="122" y="207" width="26" height="7" rx="1" class="sv-sensor ${on ? 'on' : ''}"/><text x="152" y="212" class="sv-lbl">Hall-Sensor</text>`;
      const prox = Math.max(0.15, (x / 4));
      for (let i = 1; i <= 3; i++) h += `<path d="M${135 - i * 9},${stemBot} Q135,${stemBot + i * 12} ${135 + i * 9},${stemBot}" class="sv-field" style="opacity:${(prox * (1.1 - i * 0.25)).toFixed(2)}"/>`;
      const ay = 162 + st.act * S;
      h += `<line x1="40" x2="116" y1="${ay}" y2="${ay}" class="sv-actmark"/><text x="40" y="${ay - 4}" class="sv-lbl sv-act-t">Auslösepunkt ${st.act.toFixed(1)} mm</text>`;
      if (on) h += `<text x="232" y="190" class="sv-signal" text-anchor="end">Signal!</text>`;
      if (phase === 'up' && !on) h += `<text x="232" y="190" class="sv-lbl sv-rt" text-anchor="end">Rapid Trigger: sofort zurückgesetzt</text>`;
    } else {
      // Kontaktfedern (Metallblatt)
      const bumpY = stemTop + 66;
      let bend = 0;
      if (type === 'tactile' || type === 'clicky') {
        // Bump am Stempelbein
        h += `<path d="M156,${bumpY} L163,${bumpY + 6} L156,${bumpY + 12} Z" class="sv-bump"/>`;
        bend = Math.max(0, 7 - Math.abs(bumpY + 6 - 150) * 0.55);
      }
      const leafX = 168 + bend;
      h += `<line x1="170" y1="158" x2="${leafX}" y2="186" class="sv-leaf"/>`;
      h += `<line x1="${on ? leafX + 2 : 186}" y1="164" x2="186" y2="200" class="sv-leaf"/>`;
      h += `<line x1="170" y1="186" x2="170" y2="214" class="sv-pin"/><line x1="186" y1="200" x2="186" y2="214" class="sv-pin"/>`;
      h += `<text x="208" y="176" class="sv-lbl">Kontakt</text>`;
      if (type === 'clicky') {
        const snap = x > 1.5 ? 10 : x * 3;
        h += `<line x1="94" y1="${150 + snap}" x2="122" y2="${146 + snap * 0.4}" class="sv-clickbar"/><text x="70" y="140" class="sv-lbl">Klickbügel</text>`;
        if (x > 1.45 && x < 2.4 && phase === 'down') h += `<text x="60" y="126" class="sv-klick">KLICK!</text>`;
        if (x > 1.2 && x < 2 && phase === 'up') h += `<text x="60" y="126" class="sv-klick">klick</text>`;
      }
      if (type === 'tactile' && bend > 2) h += `<text x="212" y="140" class="sv-lbl sv-bumptxt" text-anchor="end">Bump spürbar</text>`;
      if (on) h += `<text x="236" y="206" class="sv-signal" text-anchor="end">Signal!</text>`;
    }
    h += `<text x="135" y="18" class="sv-title" text-anchor="middle">Schnitt · ${x.toFixed(1)} mm gedrückt</text>`;
    sect.innerHTML = h;
  }
  raf = requestAnimationFrame(frame);
}
