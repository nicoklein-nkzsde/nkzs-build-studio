// Synthetischer Tastatur-Sound (WebAudio). Jedes Bauteil verändert eigene Parameter:
// p = { pitch, bright, caseRes, ring, hollow, damp, scratch, rattle, ping, type }
//   pitch   Grundtonhöhe (Plate, Keycaps, Switch)      bright  Höhenanteil/„Clack“ (Plate, Keycaps)
//   caseRes Resonanzfrequenz des Cases                  ring    Nachklingen des Cases/Plates
//   hollow  Hohlheit (leeres Case, ohne Foam)           damp    Dämpfung (Foam, Lube, Gasket, Silent)
//   scratch Kratzen der Switches (ungelubt)             rattle  Stabi-Klappern (große Tasten)
//   ping    Federpling/Hot-Swap-Sockel                  type    linear | tactile | clicky | magnetic
let ctx, noiseBuf, master;

function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noise(c) {
  if (noiseBuf) return noiseBuf;
  noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function burst(c, t, out, { freq, q = 1, gain, len, type = 'bandpass', attack = 0.001 }) {
  if (gain <= 0.001) return;
  const n = c.createBufferSource();
  n.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = Math.min(18000, Math.max(40, freq));
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + len);
  n.connect(f).connect(g).connect(out);
  n.start(t, Math.random() * 0.8);
  n.stop(t + attack + len + 0.03);
}

function tone(c, t, out, { freq, gain, len, sweep = 1.6, type = 'sine' }) {
  if (gain <= 0.001) return;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq * sweep, t);
  o.frequency.exponentialRampToValueAtTime(freq, t + 0.02);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + len + 0.03);
}

export function playKey(p, down, big = false, when = 0) {
  const c = ac();
  const t = c.currentTime + 0.002 + when;
  const rnd = 0.95 + Math.random() * 0.1;
  const pitch = (p.pitch || 1) * rnd * (big ? 0.8 : 1);
  const damp = Math.min(0.92, p.damp || 0);
  const bright = p.bright ?? 0.5;
  const out = c.createGain();
  out.gain.value = down ? 1 : 0.5;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3500 + bright * 9000 - damp * 3000;
  out.connect(lp).connect(master);

  // Hub: auf dem Weg nach unten (Kratzen) bzw. beim Loslassen (Top-out)
  const travel = p.type === 'magnetic' ? 0.9 : 1;
  if (down && p.scratch > 0.05) burst(c, t - 0.001, out, { freq: 3800, q: 0.7, gain: 0.05 * p.scratch, len: 0.012, type: 'highpass' });

  let bt = t; // Zeitpunkt Bottom-out
  if (down && p.type === 'tactile') {
    burst(c, t, out, { freq: 1100 * pitch, q: 2.2, gain: 0.3, len: 0.012 });
    bt = t + 0.014;
  }
  if (p.type === 'clicky') {
    burst(c, t, out, { freq: 4600 * pitch, q: 3.5, gain: down ? 1.1 : 0.7, len: 0.011 });
    burst(c, t + 0.006, out, { freq: 3300 * pitch, q: 2.5, gain: down ? 0.55 : 0.35, len: 0.01 });
    if (down) bt = t + 0.012;
  }

  // Bottom-out: tiefer Körper („Thock“) + heller Anschlag („Clack“)
  const body = down ? 1 : 0.55;
  tone(c, bt, out, { freq: (down ? 170 : 260) * pitch, gain: 0.55 * body * (1.15 - bright * 0.5) * travel, len: 0.045 + (1 - damp) * 0.06 });
  burst(c, bt, out, { freq: (down ? 1350 : 2100) * pitch * (0.7 + bright * 0.7), q: 1, gain: (0.35 + bright * 0.4) * body * (1 - damp * 0.55) * travel, len: 0.022 + (1 - damp) * 0.02 });
  // Case-Resonanz (Nachklingen) + Hohlheit
  burst(c, bt + 0.003, out, { freq: (p.caseRes || 900) * (0.96 + Math.random() * 0.08), q: 6 + (p.ring || 0) * 14, gain: 0.08 + (p.ring || 0) * 0.3 * (1 - damp), len: 0.03 + (p.ring || 0) * 0.12 });
  burst(c, bt + 0.002, out, { freq: 380 * pitch, q: 1.8, gain: (p.hollow || 0) * 0.45 * (1 - damp * 0.8), len: 0.05 + (p.hollow || 0) * 0.05 });
  // Feder-/Sockel-Pling
  if (p.ping > 0.05) burst(c, bt + 0.01, out, { freq: 6200, q: 18, gain: 0.05 * p.ping * (1 - damp), len: 0.06 });
  // Stabilisatoren: Klappern bei großen Tasten
  if (big && p.rattle > 0.03) {
    for (let i = 0; i < 3; i++) burst(c, bt + 0.004 + i * 0.007 + Math.random() * 0.003, out, { freq: 2600 + Math.random() * 1500, q: 5, gain: 0.22 * p.rattle, len: 0.012 });
  }
}

// Kurze Hörprobe: ein paar Buchstaben + Leertaste
export function demo(p) {
  const seq = [0, 0.13, 0.24, 0.37, 0.5, 0.66, 0.8];
  seq.forEach((w, i) => {
    const big = i === 4;
    playKey(p, true, big, w);
    playKey(p, false, big, w + 0.07);
  });
}
