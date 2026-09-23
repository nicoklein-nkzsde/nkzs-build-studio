// Synthetischer Switch-Sound (WebAudio). profile = { pitch, type: linear|tactile|clicky, damp }
let ctx, noiseBuf, master;

function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noise(c) {
  if (noiseBuf) return noiseBuf;
  noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function burst(c, t, { freq, q = 1, gain, len, type = 'bandpass', out }) {
  const n = c.createBufferSource();
  n.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  n.connect(f).connect(g).connect(out);
  n.start(t, Math.random() * 0.4);
  n.stop(t + len + 0.02);
}

function thump(c, t, { freq, gain, len, out }) {
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq * 1.7, t);
  o.frequency.exponentialRampToValueAtTime(freq, t + 0.025);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + len + 0.02);
}

export function playKey(profile, down, big = false) {
  const c = ac();
  const t = c.currentTime + 0.001;
  const pitch = (profile.pitch || 1) * (0.96 + Math.random() * 0.08) * (big ? 0.82 : 1);
  const damp = Math.min(0.9, profile.damp || 0);
  const out = c.createGain();
  out.gain.value = down ? 0.9 : 0.45;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 9000 * (1 - damp * 0.6);
  out.connect(lp).connect(master);

  // Bottom-out / Top-out: Körper + tiefer "Thock"
  thump(c, t, { freq: (down ? 210 : 300) * pitch, gain: down ? 0.7 : 0.35, len: 0.05 + (1 - damp) * 0.05, out });
  burst(c, t, { freq: (down ? 1500 : 2300) * pitch, q: 1.1, gain: (down ? 0.55 : 0.3) * (1 - damp * 0.5), len: 0.03 + (1 - damp) * 0.02, out });
  // Case-Resonanz
  burst(c, t + 0.004, { freq: 520 * pitch, q: 4, gain: 0.25 * (1 - damp * 0.7), len: 0.06, out });

  if (profile.type === 'clicky') {
    burst(c, t, { freq: 4800 * pitch, q: 3, gain: 1.1, len: 0.012, out });
    burst(c, t + 0.008, { freq: 3600 * pitch, q: 2, gain: 0.6, len: 0.01, out });
  }
  if (profile.type === 'tactile' && down) {
    burst(c, t, { freq: 900 * pitch, q: 2, gain: 0.25, len: 0.015, out });
  }
  if (big) {
    // Stabilisator-Rattle leicht
    burst(c, t + 0.006, { freq: 3000, q: 5, gain: 0.08 * (1 - damp), len: 0.02, out });
  }
}
