import { CATALOG, SLOT_LABELS, TYPES, STATUS, KB, DEFAULT_KB, TEMPLATES, USED_ADVICE, GAMES, TWEAKS } from './data.js';
import { PRICES, CHECKED } from './prices.js';
import { layoutKeys } from './layouts.js';
import * as Viewer from './viewer.js';
import { demo } from './sound.js';
import { mountViz, stopViz, SWITCH_INFO } from './switchviz.js';

// ---------- State ----------
const LS = 'nkzs-build-studio-v1';
const uid = () => Math.random().toString(36).slice(2, 10);
const eur = (n) => (Math.round(n * 100) / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const $ = (s) => document.querySelector(s);

let state = load();
const ui = { customerId: null, buildId: null, view: null, rgb: false, autoRotate: false, sound: true, search: '', typed: '' };

function seed() {
  const me = { id: uid(), name: 'Meine Sammlung', company: 'Eigene Builds & Tastaturen', email: '', phone: '', address: '', notes: '', created: Date.now() };
  const firm = { id: uid(), name: 'Beispiel GmbH', company: 'Musterstraße 1, 35000 Gießen', email: '', phone: '', address: '', notes: 'Demo-Kunde – kann gelöscht werden.', created: Date.now() };
  const s = { customers: [me, firm], builds: [], customParts: [], settings: { markup: 0, amazonTag: '', owner: 'Nico Klein', company: 'NKZS · Nico Klein Kaizo Studios', email: 'nicoklein@nkzs.de', web: 'nkzs.de', kleinunternehmer: true, quoteNo: 1 } };
  s.builds.push(fromTemplate(TEMPLATES.find((t) => t.name.startsWith('65')), me.id, 'Mein 65 % Thock'));
  s.builds.push(fromTemplate(TEMPLATES.find((t) => t.name === 'Gaming 1440p'), me.id));
  s.builds.push(fromTemplate(TEMPLATES.find((t) => t.name === 'Gaming-Setup komplett'), me.id));
  s.builds.push(fromTemplate(TEMPLATES.find((t) => t.name.startsWith('Büro Standard')), firm.id));
  return s;
}
function load() {
  try { const s = JSON.parse(localStorage.getItem(LS)); if (s?.customers) return s; } catch {}
  return seed();
}
function save() { try { localStorage.setItem(LS, JSON.stringify(state)); } catch {} scheduleSync(); }

// ---------- Online-Speicher (Artifact-db) ----------
// Läuft die Seite als claude.ai-Artifact, landen Kunden & Builds im Online-Speicher; lokal bleibt es im Browser.
const cap = (name) => (window.claude?.use ? window.claude.use(name).catch(() => null) : Promise.resolve(null));
let db = null, dbReady = false, syncTimer = null, syncing = false, saveState = 'local';
const synced = { customers: {}, builds: {}, parts: {}, settings: '' };
function setSaveState(s) { saveState = s; const el = $('#tb-save'); if (el) { el.className = 'tb-save' + (s === 'cloud' ? ' cloud' : ''); el.lastChild.textContent = { cloud: 'Online gespeichert', local: 'Nur in diesem Browser', saving: 'Speichert …', error: 'Speichern fehlgeschlagen' }[s]; } }
function scheduleSync() { if (!dbReady) return; setSaveState('saving'); clearTimeout(syncTimer); syncTimer = setTimeout(pushAll, 700); }
async function pushAll() {
  if (!db) return;
  if (syncing) return scheduleSync();
  syncing = true;
  try {
    for (const [col, list] of [['customers', state.customers], ['builds', state.builds], ['parts', state.customParts]]) {
      const seen = new Set();
      for (const item of list) {
        const j = JSON.stringify(item);
        seen.add(item.id);
        if (synced[col][item.id] !== j) { await db.doc(`${col}/${item.id}`).set(JSON.parse(j)); synced[col][item.id] = j; }
      }
      for (const id of Object.keys(synced[col])) if (!seen.has(id)) { await db.doc(`${col}/${id}`).delete(); delete synced[col][id]; }
    }
    const sj = JSON.stringify(state.settings);
    if (synced.settings !== sj) { await db.doc('config/settings').set(JSON.parse(sj)); synced.settings = sj; }
    setSaveState('cloud');
  } catch (e) {
    setSaveState('error');
    toast(e?.code === 'quota_exceeded' ? 'Online-Speicher ist voll – alte Builds löschen.' : 'Speichern fehlgeschlagen – Änderungen bleiben in diesem Browser.');
  } finally { syncing = false; }
}
async function initDb() {
  db = await cap('db');
  if (!db) return setSaveState('local');
  try {
    const [cs, bs, ps, st] = await Promise.all([db.collection('customers').get(), db.collection('builds').get(), db.collection('parts').get(), db.doc('config/settings').get()]);
    dbReady = true;
    if (cs.empty && bs.empty) { await pushAll(); return; }
    const plain = (d) => JSON.parse(JSON.stringify(d.data()));
    state = {
      customers: cs.docs.map(plain).sort((a, b) => (b.created || 0) - (a.created || 0)),
      builds: bs.docs.map(plain),
      customParts: ps.docs.map(plain),
      settings: st.exists ? plain(st) : state.settings,
    };
    for (const c of state.customers) synced.customers[c.id] = JSON.stringify(c);
    for (const b of state.builds) synced.builds[b.id] = JSON.stringify(b);
    for (const p of state.customParts) synced.parts[p.id] = JSON.stringify(p);
    synced.settings = JSON.stringify(state.settings);
    try { localStorage.setItem(LS, JSON.stringify(state)); } catch {}
    setSaveState('cloud');
    const keep = state.builds.find((b) => b.id === ui.buildId) || state.builds[0];
    if (keep) selectBuild(keep.id); else { ui.customerId = ui.buildId = null; renderAll(); render3D(); }
  } catch { db = null; dbReady = false; setSaveState('local'); }
}

// Datei an den Nutzer geben (im Artifact über die Download-Freigabe, lokal als normaler Download)
const downloadsCap = cap('downloads');
async function saveFile(filename, data) {
  const dl = await downloadsCap;
  if (dl) {
    try { await dl.save({ filename, data }); toast('Datei gespeichert'); return true; }
    catch (e) { if (e?.code !== 'declined') toast('Speichern nicht möglich: ' + (e?.message || e?.code || '')); return false; }
  }
  const l = document.createElement('a');
  l.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
  l.download = filename;
  document.body.appendChild(l); l.click(); l.remove();
  return true;
}
let toastT;
function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3200);
}

function fromTemplate(t, customerId, name) {
  const parts = {};
  for (const [slot, id] of Object.entries(t.parts || {})) parts[slot] = { id, qty: 1, price: null };
  if (t.usedAll) for (const [slot, v] of Object.entries(parts)) if (USED_ADVICE[slot]?.[0] !== 'no') v.used = true;
  return {
    id: uid(), customerId, name: name || t.name, type: t.type, status: 'Entwurf', parts, units: t.units || 1, quoteUsed: !!t.usedAll,
    kb: { ...clone(DEFAULT_KB), ...clone(t.kb || {}) }, service: null, notes: '', created: Date.now(), updated: Date.now(),
  };
}

// ---------- Katalog-Zugriff ----------
const withCheck = (p) => { const c = PRICES[p.id]; return c ? { ...p, price: c.price ?? p.price, chk: c } : p; };
const catalogFor = (slot) => [...(CATALOG[slot] || []).map(withCheck), ...state.customParts.filter((p) => p.slot === slot)];
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '';
const usedOk = (slot) => (USED_ADVICE[slot] || ['warn'])[0] !== 'no';
const part = (slot, id) => catalogFor(slot).find((p) => p.id === id);
const kbItem = (list, id) => KB[list].find((x) => x.id === id) || KB[list][0];
function sel(b, slot) {
  const s = b.parts[slot];
  if (!s?.id) return null;
  const p = part(slot, s.id);
  if (!p) return null;
  const isUsed = !!(s.used && p.chk?.used);
  return { ...p, qty: s.qty || 1, price: s.price ?? (isUsed ? p.chk.used : p.price), basePrice: isUsed ? p.chk.used : p.price, newPrice: p.price, isUsed };
}
const curBuild = () => state.builds.find((b) => b.id === ui.buildId);
const curCustomer = () => state.customers.find((c) => c.id === ui.customerId);

// ---------- Tastatur ----------
function kbLines(kb) {
  const lay = layoutKeys(kb.layout), mult = KB.layouts[kb.layout].mult;
  const cs = kbItem('cases', kb.caseId), pl = kbItem('plates', kb.plateId), pcb = kbItem('pcbs', kb.pcbId);
  const sw = kbItem('switches', kb.switchId), cap = kbItem('caps', kb.capsId), st = kbItem('stabs', kb.stabId);
  const nSw = lay.count + 5;
  const L = [
    { label: 'Case', name: `${cs.name} · ${KB.layouts[kb.layout].label}`, qty: 1, price: Math.round(cs.price * mult) },
    { label: 'Plate', name: pl.name, qty: 1, price: Math.round(pl.price * mult) },
    { label: 'PCB', name: pcb.name, qty: 1, price: Math.round(pcb.price * mult) },
    { label: 'Switches', name: `${sw.name} (${lay.count} + 5 Ersatz)`, qty: nSw, price: sw.price },
    { label: 'Keycaps', name: cap.name, qty: 1, price: cap.price },
    { label: 'Stabilisatoren', name: st.name, qty: 1, price: st.price },
  ];
  for (const x of kb.extras || []) { const e = KB.extras.find((y) => y.id === x); if (e) L.push({ label: 'Mod', name: e.name, qty: 1, price: e.price }); }
  return L;
}
const kbPrice = (kb) => kbLines(kb).reduce((s, l) => s + l.qty * l.price, 0);
// Sound-Profil aus allen Bauteilen (siehe sound.js)
const clamp01 = (v) => Math.max(0, Math.min(1, v));
function soundProfile(kb) {
  const cs = kbItem('cases', kb.caseId), pl = kbItem('plates', kb.plateId), pcb = kbItem('pcbs', kb.pcbId);
  const sw = kbItem('switches', kb.switchId), cap = kbItem('caps', kb.capsId), st = kbItem('stabs', kb.stabId);
  const ex = (kb.extras || []).map((x) => KB.extras.find((y) => y.id === x)).filter(Boolean);
  const sum = (k) => ex.reduce((a, e) => a + (e[k] || 0), 0);
  const abs = cap.mat === 'ABS';
  const capFactor = (abs ? 1.07 : 0.97) * (1.12 - cap.h * 0.35);
  const damp = clamp01((sw.damp || 0) + sum('damp') + (pl.flex || 0) * 0.25 + (cs.material === 'pc' ? 0.1 : 0));
  const pitch = sw.pitch * pl.pitch * cs.pitch * (pcb.pitch || 1) * capFactor * ex.reduce((a, e) => a * (e.pitch || 1), 1);
  const lubed = ex.some((e) => e.id === 'kx-lube');
  return {
    pitch, damp,
    type: sw.type,
    bright: clamp01((pl.bright ?? 0.5) * 0.6 + (abs ? 0.35 : 0.15) + (cap.h < 0.3 ? 0.2 : 0) + (sw.type === 'clicky' ? 0.1 : 0) - damp * 0.2),
    caseRes: (cs.res || 900) * pl.pitch,
    ring: clamp01((cs.ring || 0) + (pl.ring || 0) + sum('ring')),
    hollow: clamp01((cs.hollow || 0) + sum('hollow')),
    scratch: clamp01((sw.scratch ?? 0.3) + sum('scratch')),
    rattle: clamp01((st.rattle ?? 0.3) * (lubed ? 0.7 : 1)),
    ping: clamp01((pcb.ping ?? 0.3) + sum('ping')),
  };
}
function soundTraits(p) {
  const depth = clamp01((1.12 - p.pitch) / 0.45);
  const word = p.type === 'clicky' ? 'Clicky – laut & knackig'
    : depth > 0.6 && p.damp > 0.35 ? 'Thocky & gedämpft'
    : depth > 0.6 ? 'Thocky'
    : p.hollow > 0.5 ? 'Hohl / klapprig'
    : p.bright > 0.6 ? 'Clacky & hell'
    : p.damp > 0.5 ? 'Leise & weich' : 'Ausgewogen';
  return { word, bars: [['Tiefe (Thock)', depth], ['Helligkeit (Clack)', p.bright], ['Nachklang', p.ring], ['Hohlheit', p.hollow], ['Dämpfung', p.damp], ['Kratzen', p.scratch], ['Stabi-Klappern', p.rattle]] };
}
function resolveKb(kb) {
  const cs = kbItem('cases', kb.caseId), pl = kbItem('plates', kb.plateId), pcb = kbItem('pcbs', kb.pcbId);
  const sw = kbItem('switches', kb.switchId), cap = kbItem('caps', kb.capsId);
  return {
    layout: layoutKeys(kb.layout), caseColor: kb.caseColor, caseMat: cs.material, weight: cs.weight,
    plate: pl, switchColor: sw.color, capH: cap.h, sculpt: cap.sculpt, gloss: cap.gloss, rgb: !!pcb.rgb,
    colors: kb.colors, sound: soundProfile(kb),
  };
}
function stockKb(item) {
  return { ...clone(DEFAULT_KB), extras: [], stabId: 'ks-clip', ...clone(item.preset) };
}
function activeKb(b) {
  if (TYPES[b.type].kb) return b.kb;
  const k = sel(b, 'keyboard');
  if (!k) return null;
  return k.custom ? b.kb : k.preset ? stockKb(k) : null;
}

// ---------- Preise ----------
function lines(b) {
  const L = [];
  for (const slot of TYPES[b.type].slots) {
    const p = sel(b, slot);
    if (!p) continue;
    if (slot === 'keyboard' && p.custom) {
      L.push({ group: 'Custom-Tastatur' });
      kbLines(b.kb).forEach((l) => L.push({ ...l, slot, sub: true }));
      continue;
    }
    L.push({ slot, label: SLOT_LABELS[slot] + (p.isUsed ? ' · gebraucht' : ''), name: p.name, qty: p.qty, price: p.price, newPrice: p.newPrice, used: p.chk?.used, isUsed: p.isUsed });
  }
  if (TYPES[b.type].kb) kbLines(b.kb).forEach((l) => L.push(l));
  return L;
}
// Vergleich: alles neu vs. gebraucht, wo sinnvoll und Daten vorhanden
function compare(b) {
  let allNew = 0, bestUsed = 0, n = 0;
  for (const l of lines(b)) {
    if (l.group) continue;
    const nw = (l.newPrice ?? l.price) * l.qty;
    allNew += nw;
    if (l.slot && l.used && usedOk(l.slot) && l.slot !== 'keyboard') { bestUsed += l.used * l.qty; n++; } else bestUsed += nw;
  }
  return { allNew, bestUsed, saving: allNew - bestUsed, n };
}

function totals(b) {
  const parts = lines(b).reduce((s, l) => s + (l.group ? 0 : l.qty * l.price), 0);
  const markup = (parts * (+state.settings.markup || 0)) / 100;
  const service = b.service ?? TYPES[b.type].service;
  const unit = parts + markup + service;
  const units = Math.max(1, b.units || 1);
  return { parts, markup, service, unit, units, total: unit * units };
}

// ---------- Kompatibilität ----------
function checks(b) {
  const out = [];
  const t = TYPES[b.type];
  const g = (s) => sel(b, s);
  // key = Art des Problems (für Lösungsvorschläge), fix = welche Slots getauscht werden können (bevorzugt zuerst)
  const E = (key, fix, text, level = 'error') => out.push({ level, key, fix, slots: fix, text });
  if (t.slots.includes('cpu')) {
    const cpu = g('cpu'), mb = g('mobo'), ram = g('ram'), gpu = g('gpu'), psu = g('psu'), cs = g('case'), cl = g('cooler');
    const miss = ['cpu', 'mobo', 'ram', 'storage', 'psu', 'case'].filter((s) => !g(s));
    if (miss.length) out.push({ level: 'warn', key: 'missing', text: `Fehlt noch: ${miss.map((s) => SLOT_LABELS[s]).join(', ')}`, autofill: true });
    if (cpu && mb && cpu.socket && mb.socket && cpu.socket !== mb.socket) E('socket', ['mobo', 'cpu'], `Sockel passt nicht: CPU ist ${cpu.socket}, Mainboard ist ${mb.socket}.`);
    if (ram && mb && ram.ramType && mb.ram && ram.ramType !== mb.ram) E('ramtype', ['ram', 'mobo'], `RAM-Typ passt nicht: Mainboard braucht ${mb.ram}, gewählt ist ${ram.ramType}.`);
    if (ram && mb && ram.sticks === 4 && mb.ff === 'ITX') E('ramslots', ['ram'], 'Mini-ITX-Boards haben nur 2 RAM-Slots.');
    if (mb && cs && cs.ff && mb.ff && !cs.ff.includes(mb.ff)) E('mbff', ['mobo', 'case'], `Mainboard (${mb.ff}) passt nicht ins Gehäuse (nur ${cs.ff.join('/')}).`);
    if (gpu && cs && cs.maxGpu && gpu.len > cs.maxGpu) E('gpulen', ['gpu', 'case'], `Grafikkarte zu lang: ${gpu.len} mm, Gehäuse erlaubt ${cs.maxGpu} mm.`);
    const gThick = gpu ? Math.round((gpu.slots || 2) * 20.3) : 0;
    if (gpu && cs?.gpuThick && gThick > cs.gpuThick) E('gputhick', ['gpu', 'case'], `Grafikkarte zu dick: ca. ${gThick} mm (${gpu.slots} Slots), Gehäuse erlaubt ${cs.gpuThick} mm.`);
    if (cl && cs) {
      if ((cl.kind === 'air' || cl.kind === 'low') && cs.maxCooler && cl.height > cs.maxCooler) E('coolerh', ['cooler', 'case'], `Kühler zu hoch: ${cl.height} mm, Gehäuse erlaubt ${cs.maxCooler} mm.`);
      if (cl.kind === 'aio' && cs.maxRad !== undefined && cl.rad > cs.maxRad) E('rad', ['cooler', 'case'], cs.maxRad ? `Radiator zu groß: ${cl.rad} mm, Gehäuse erlaubt ${cs.maxRad} mm.` : 'In dieses Gehäuse passt keine AiO-Wasserkühlung.');
      else if (cl.kind === 'aio' && cs.radThick && cl.radThick && cl.radThick + 25 > cs.radThick) E('radthick', ['cooler', 'case'], `Radiator zu dick: ${cl.radThick} mm + 25-mm-Lüfter = ${cl.radThick + 25} mm, Platz sind nur ${cs.radThick} mm.`);
    }
    if (cl && cpu && cl.sockets && !cl.sockets.includes(cpu.socket)) E('coolsock', ['cooler'], `Kühler passt nicht auf Sockel ${cpu.socket}.`);
    if (cl?.kind === 'low' && cl.height < 50 && cpu && cpu.tdp > 90) out.push({ level: 'warn', key: 'lowcool', fix: ['cooler'], text: `Kühler zu schwach für diese CPU (${cpu.tdp} W) – sie wird heiß und taktet runter.` });
    if (psu && cs && cs.psu === 'SFX' && psu.ff !== 'SFX') E('psuff', ['psu'], 'Gehäuse braucht ein SFX-Netzteil.');
    if (cpu) {
      const est = (cpu.tdp || 100) + (gpu?.tdp || 0) + 75;
      const rec = Math.ceil((est * 1.4) / 50) * 50;
      if (psu && psu.watt < est) E('psuweak', ['psu'], `Netzteil zu schwach: ca. ${est} W Verbrauch, Netzteil hat ${psu.watt} W.`);
      else if (psu && psu.watt < rec) out.push({ level: 'warn', key: 'psutight', fix: ['psu'], text: `Netzteil knapp: empfohlen sind ${rec} W (Verbrauch ca. ${est} W).` });
      else out.push({ level: 'info', text: `Geschätzter Verbrauch unter Last: ca. ${est} W${psu ? ` · Netzteil ${psu.watt} W` : ''}` });
      if (!gpu && !cpu.igpu) E('nogpu', ['gpu'], 'Diese CPU hat keine eingebaute Grafik – Grafikkarte nötig.');
      if (!cl) out.push({ level: 'warn', key: 'nocooler', fix: ['cooler'], text: 'Kein CPU-Kühler gewählt.' });
    }
    if (cs?.sff) {
      if (cs.spine && gpu && cl && (cl.kind === 'air' || cl.kind === 'low') && gThick + cl.height > 125) out.push({ level: 'warn', key: 'spine', text: `${cs.name}: Die verstellbare Mittelwand teilt den Platz – dicke GPU (${gThick} mm) und hoher Kühler (${cl.height} mm) gehen evtl. nicht gleichzeitig. Vor dem Kauf ausmessen.` });
      if (gpu) out.push({ level: 'info', text: `Mini-Gehäuse: Beim genauen GPU-Modell auf max. ${cs.maxGpu} mm Länge, ${cs.gpuHeight || '–'} mm Höhe und ${cs.gpuThick || '–'} mm Dicke achten. „SFF-Ready“-Karten passen fast immer.` });
    }
  }
  if (t.slots.includes('monitor') && !g('monitor')) out.push({ level: 'warn', key: 'nomon', fix: ['monitor'], text: 'Noch kein Monitor gewählt.' });
  if (b.type === 'workstation' && !g('minipc')) out.push({ level: 'warn', key: 'nomini', fix: ['minipc'], text: 'Noch kein Mini-PC gewählt.' });
  const kb = activeKb(b);
  if (kb && (TYPES[b.type].kb || sel(b, 'keyboard')?.custom)) {
    if (kb.capsId === 'kk-low') out.push({ level: 'warn', text: 'Low-Profile-Keycaps passen nicht auf normale MX-Switches.', kbfix: { capsId: 'kk-cherry' }, kbfixText: 'Cherry-Profil nehmen' });
    const swi = kbItem('switches', kb.switchId), pcbi = kbItem('pcbs', kb.pcbId);
    if (swi.magnetic && !pcbi.he) out.push({ level: 'error', text: 'Magnet-Switches brauchen ein Hall-Effect-PCB.', kbfix: { pcbId: 'kpcb-he' }, kbfixText: 'Hall-Effect-PCB nehmen' });
    if (!swi.magnetic && pcbi.he) out.push({ level: 'error', text: 'Hall-Effect-PCB funktioniert nur mit Magnet-Switches.', kbfix: { switchId: 'sw-ks20' }, kbfixText: 'Gateron KS-20 Magnet-Switches nehmen' });
    if (kb.pcbId === 'kpcb-solder' && (kb.extras || []).includes('kx-lube')) out.push({ level: 'info', text: 'Löt-PCB: Switches vor dem Einlöten lubben.' });
  }
  if (!out.some((o) => o.level === 'error' || o.level === 'warn')) out.unshift({ level: 'ok', text: 'Alles kompatibel.' });
  return out;
}

// Lösungsvorschläge: Teile, die genau dieses Problem beheben, ohne ein neues zu verursachen
const swap = (b, slot, id) => ({ ...b, parts: { ...b.parts, [slot]: { id, qty: b.parts[slot]?.qty || 1, price: null } } });
function fixesFor(b, issue, max = 3) {
  if (!issue.fix) return [];
  const before = checks(b);
  const errKeys = new Set(before.filter((c) => c.level === 'error').map((c) => c.key));
  const warnKeys = new Set(before.filter((c) => c.level === 'warn').map((c) => c.key));
  for (const slot of issue.fix) {
    const cur = sel(b, slot);
    const cands = [];
    for (const p of catalogFor(slot)) {
      if (p.id === cur?.id || p.custom || p.own) continue;
      const after = checks(swap(b, slot, p.id));
      if (after.some((c) => c.key === issue.key)) continue;
      // keine neuen Fehler; aus einem Fehler darf höchstens ein Hinweis werden
      if (after.some((c) => c.level === 'error' && !errKeys.has(c.key))) continue;
      const newWarns = after.filter((c) => c.level === 'warn' && c.key && !warnKeys.has(c.key)).length;
      if (issue.level === 'warn' && newWarns) continue;
      cands.push({ p, newWarns });
    }
    const ref = cur?.price ?? 0;
    cands.sort((a, c) => a.newWarns - c.newWarns || (ref ? Math.abs(a.p.price - ref) - Math.abs(c.p.price - ref) : a.p.price - c.p.price));
    // Erst das naheliegende Teil tauschen (z. B. Kühler statt Gehäuse) – nur wenn das nicht geht, das nächste
    if (cands.length) return cands.slice(0, max).map(({ p }) => ({ slot, p }));
  }
  return [];
}

// Leere Pflicht-Plätze mit dem günstigsten passenden Teil füllen
function autoFill(b) {
  const order = ['case', 'cpu', 'mobo', 'ram', 'cooler', 'gpu', 'storage', 'psu'];
  for (const slot of order) {
    if (!TYPES[b.type].slots.includes(slot) || sel(b, slot)) continue;
    const cands = catalogFor(slot).filter((p) => !p.custom && !p.own).map((p) => {
      const res = checks(swap(b, slot, p.id));
      const bad = res.some((c) => (c.level === 'error' || (c.level === 'warn' && c.key !== 'missing' && c.key !== 'nocooler' && c.key !== 'spine')) && (c.slots || c.fix || []).includes(slot));
      return { p, bad };
    }).filter((x) => !x.bad).sort((a, c) => a.p.price - c.p.price);
    if (cands[0]) b.parts[slot] = { id: cands[0].p.id, qty: 1, price: null };
  }
}

function issueFor(b, slot, id) {
  const tmp = { ...b, parts: { ...b.parts, [slot]: { id, qty: 1, price: null } } };
  return checks(tmp).find((c) => c.level === 'error' && c.slots?.includes(slot));
}

// ---------- Aktionen ----------
function touch(b) { b.updated = Date.now(); save(); }
function update(fn, { panel = true, view = true, keepCam = true } = {}) {
  const b = curBuild();
  fn(b);
  if (b) touch(b); else save();
  if (panel) renderConfig();
  renderTopbar();
  renderSidebar();
  renderStage();
  if (view) schedule3D(keepCam);
}

function selectBuild(id) {
  const b = state.builds.find((x) => x.id === id);
  if (!b) return;
  ui.buildId = id;
  ui.customerId = b.customerId;
  ui.view = availableViews(b)[0];
  ui.typed = '';
  ui.svType = null;
  renderAll();
  schedule3D(false);
}
function selectCustomer(id) {
  ui.customerId = id;
  ui.buildId = null;
  renderAll();
}
function availableViews(b) {
  return TYPES[b.type].views.filter((v) => v !== 'kb' || activeKb(b));
}

// ---------- 3D ----------
let t3d;
function schedule3D(keepCam = true) {
  clearTimeout(t3d);
  t3d = setTimeout(() => render3D(keepCam), 60);
}
function pcParts(b) {
  const o = {};
  for (const s of ['cpu', 'cooler', 'mobo', 'ram', 'gpu', 'storage', 'psu', 'case']) o[s] = sel(b, s) || undefined;
  return o;
}
function render3D(keepCam) {
  const b = curBuild();
  $('#empty-stage').hidden = !!b;
  if (!b) return;
  const views = availableViews(b);
  if (!views.includes(ui.view)) ui.view = views[0];
  const kb = activeKb(b);
  const data = { mode: ui.view };
  if (ui.view === 'pc') data.pc = pcParts(b);
  if (ui.view === 'kb') data.kb = resolveKb(kb);
  if (ui.view === 'setup') {
    const m = sel(b, 'monitor');
    data.setup = {
      monitor: m, monitorQty: m?.qty || 1, kb: kb ? resolveKb(kb) : null,
      mouse: sel(b, 'mouse'), mousepad: sel(b, 'mousepad'), headset: sel(b, 'headset'), webcam: sel(b, 'webcam'),
      minipc: sel(b, 'minipc'), pc: TYPES[b.type].slots.includes('case') ? pcParts(b) : null,
    };
  }
  Viewer.show(data, keepCam);
}

// ---------- Render: Sidebar ----------
function renderSidebar() {
  const q = ui.search.toLowerCase();
  const custs = state.customers.filter((c) => !q || (c.name + c.company).toLowerCase().includes(q) || state.builds.some((b) => b.customerId === c.id && b.name.toLowerCase().includes(q)));
  $('#sidebar').innerHTML = `
    <div class="side-search"><input id="search" placeholder="Kunde oder Build suchen…" value="${esc(ui.search)}"></div>
    <div class="side-head"><span>Kunden</span><button class="icon-btn" data-act="new-customer" title="Neuer Kunde">+</button></div>
    <div class="cust-list">
      ${custs.map((c) => {
        const bs = state.builds.filter((b) => b.customerId === c.id).sort((a, b) => b.updated - a.updated);
        const open = c.id === ui.customerId;
        return `<div class="cust ${open ? 'active' : ''}">
          <div class="cust-row" data-act="customer" data-id="${c.id}">
            <div style="min-width:0"><div class="cust-name">${esc(c.name)}</div>${c.company ? `<div class="cust-sub">${esc(c.company)}</div>` : ''}</div>
            <span class="count">${bs.length}</span>
          </div>
          ${open ? `<div class="build-list">
            ${bs.map((b) => `<div class="build-item ${b.id === ui.buildId ? 'active' : ''}" data-act="build" data-id="${b.id}">
              ${typeDot(b.type)}<span class="bi-name">${esc(b.name)}</span><span class="bi-price">${eur(totals(b).total).replace(/,\d\d/, '')}</span>
            </div>`).join('')}
            <button class="add-build" data-act="new-build">+ Neuer Build</button>
          </div>` : ''}
        </div>`;
      }).join('')}
    </div>
`;
}
const typeDot = (type) => `<span class="type-dot" title="${esc(TYPES[type].label)}">${{ pc: 'PC', setup: 'SETUP', keyboard: 'KB', workstation: 'WS' }[type]}</span>`;

function renderTopbar() {
  const b = curBuild(), c = b ? state.customers.find((x) => x.id === b.customerId) : curCustomer();
  $('#topbar').innerHTML = `
    <div class="tb-brand"><b>NKZS</b><span>Build Studio</span></div>
    <div class="tb-crumbs">${c ? `<span>${esc(c.name)}</span>` : '<span>Kein Kunde gewählt</span>'}${b ? `<span class="sep">/</span><b>${esc(b.name)}</b>` : ''}</div>
    <div class="tb-actions">
      <span id="tb-save" class="tb-save"><i></i><span></span></span>
      ${b ? '<button class="btn primary" data-act="quote">Angebot</button>' : ''}
      <button class="btn ghost" data-act="settings">Einstellungen</button>
      <button class="btn ghost" data-act="backup">Backup</button>
    </div>`;
  setSaveState(saveState);
}

// ---------- Render: Config ----------
function renderConfig() {
  const el = $('#config');
  const b = curBuild();
  if (!b) { el.innerHTML = ui.customerId ? customerView() : `<div class="cfg"><p class="hint">Kein Kunde gewählt.</p></div>`; return; }
  const c = state.customers.find((x) => x.id === b.customerId);
  const t = TYPES[b.type];
  const tot = totals(b);
  const ch = checks(b);
  const scroll = el.scrollTop;
  el.innerHTML = `<div class="cfg">
    <span class="crumb" data-act="customer" data-id="${c?.id}">← ${esc(c?.name || 'Kunde')}</span>
    <input class="title-input" data-f="name" value="${esc(b.name)}">
    <div class="meta-row">
      <span class="pill">${typeDot(b.type)} ${t.label}</span>
      <span class="pill">Status <select data-f="status">${STATUS.map((s) => `<option ${s === b.status ? 'selected' : ''}>${s}</option>`).join('')}</select></span>
      <span class="pill" title="Anzahl identischer Systeme">Anzahl <input type="number" min="1" data-f="units" value="${b.units || 1}"></span>
    </div>

    <div class="section"><div class="checks">${ch.map((x) => checkRow(b, x)).join('')}</div></div>

    ${t.slots.length ? `<div class="section"><div class="section-h"><span>Komponenten</span><span>${CHECKED ? `Preise geprüft ${fmtDate(CHECKED)}` : "Richtpreise"}</span></div>
      <div class="card">${t.slots.map((s) => slotRow(b, s)).join('')}</div></div>` : ''}

    ${(t.kb || sel(b, 'keyboard')?.custom) ? kbSection(b) : ''}
    ${t.slots.length ? usedSection(b) : ''}
    ${t.slots.includes('gpu') ? benchSection(b) : ''}

    <div class="section"><div class="section-h"><span>Preis</span></div>
      <div class="card sum">
        <div class="sum-row"><span>Teile</span><span>${eur(tot.parts)}</span></div>
        ${tot.markup ? `<div class="sum-row"><span>Aufschlag (${state.settings.markup} %)</span><span>${eur(tot.markup)}</span></div>` : ''}
        <div class="sum-row"><span>Montage & Einrichtung</span><span><input class="mini price" type="number" min="0" step="5" data-f="service" value="${tot.service}"> €</span></div>
        ${tot.units > 1 ? `<div class="sum-row"><span>Pro System</span><span>${eur(tot.unit)}</span></div><div class="sum-row"><span>× Anzahl</span><span>${tot.units}</span></div>` : ''}
        <div class="sum-total"><span>Gesamt</span><span>${eur(tot.total)}</span></div>
        ${state.settings.kleinunternehmer ? `<div class="hint" style="margin-top:6px">Endpreis · keine USt. nach § 19 UStG</div>` : ''}
      </div>
    </div>

    <div class="section"><div class="section-h"><span>Notizen</span></div>
      <div class="field"><textarea data-f="notes" placeholder="Wünsche des Kunden, Budget, Farben, Liefertermin…">${esc(b.notes)}</textarea></div>
    </div>

    <div class="btns">
      <button class="btn primary grow" data-act="quote">Angebot erstellen</button>
      <button class="btn" data-act="shopping">Einkaufsliste</button>
      <button class="btn" data-act="duplicate">Duplizieren</button>
      <button class="btn danger" data-act="delete-build">Löschen</button>
    </div>
  </div>`;
  el.scrollTop = scroll;
}

function checkRow(b, x) {
  const icon = { ok: '✓', warn: '!', error: '✕', info: 'i' }[x.level];
  let help = '';
  if (x.level === 'error' || x.level === 'warn') {
    const fx = fixesFor(b, x);
    if (fx.length) {
      help = `<div class="fixes"><span>Stattdessen:</span>${fx.map(({ slot, p }) => {
        const cur = sel(b, slot); const d = p.price - (cur?.newPrice ?? cur?.price ?? 0);
        return `<button class="fix" data-fix="${slot}:${p.id}" title="${esc(SLOT_LABELS[slot])} tauschen">${esc(p.name)} <b>${eur(p.price).replace(',00', '')}</b>${cur ? `<small>${d >= 0 ? '+' : '−'}${eur(Math.abs(d)).replace(',00', '')}</small>` : ''}</button>`;
      }).join('')}</div>`;
    }
    if (x.kbfix) help = `<div class="fixes"><span>Lösung:</span><button class="fix" data-kbfix='${JSON.stringify(x.kbfix)}'>${esc(x.kbfixText)}</button></div>`;
    if (x.autofill) help += `<div class="fixes"><button class="fix auto" data-act="autofill">Automatisch passend ergänzen</button></div>`;
  }
  return `<div class="check ${x.level}"><i>${icon}</i><div style="flex:1;min-width:0"><span>${esc(x.text)}</span>${help}</div></div>`;
}

function slotRow(b, slot) {
  const s = b.parts[slot] || {};
  const p = sel(b, slot);
  const opts = catalogFor(slot);
  const bad = p && issueFor(b, slot, p.id);
  const lineTotal = p ? (p.custom ? kbPrice(b.kb) : p.price * p.qty) : 0;
  return `<div class="slot">
    <div class="slot-head"><span class="slot-label">${SLOT_LABELS[slot]}</span><span class="slot-price">${p ? eur(lineTotal) : '–'}</span></div>
    <select class="big ${bad ? 'bad' : ''}" data-slot="${slot}">
      <option value="">— nichts —</option>
      ${opts.map((o) => { const iss = issueFor(b, slot, o.id); return `<option value="${o.id}" ${o.id === s.id ? 'selected' : ''}>${iss ? '⚠ ' : ''}${esc(o.name)}${o.custom ? '' : ` · ${eur(o.price).replace(',00', '')}`}</option>`; }).join('')}
      <option value="__custom">+ Eigenes Teil hinzufügen…</option>
    </select>
    ${p && !p.custom ? `<div class="slot-meta">
      <span class="info">${esc(p.info || '')}</span>
      <input class="mini" type="number" min="1" data-qty="${slot}" value="${p.qty}" title="Menge">×
      <input class="mini price" type="number" min="0" step="1" data-price="${slot}" value="${s.price ?? ''}" placeholder="${p.basePrice}" title="Eigener Preis (leer = Richtpreis)">€
    </div>${priceLine(slot, p, s)}` : p?.custom ? `<div class="slot-meta"><span class="info">Konfiguration unten · ${eur(kbPrice(b.kb))}</span></div>` : ''}
  </div>`;
}

function priceLine(slot, p, s) {
  const c = p.chk;
  const adv = USED_ADVICE[slot] || ['warn', ''];
  const idealo = c?.url || `https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q=${encodeURIComponent(p.name)}`;
  const ka = `https://www.kleinanzeigen.de/s-${encodeURIComponent(p.name.toLowerCase().replace(/\(.*?\)/g, '').trim().replace(/\s+/g, '-'))}/k0`;
  if (slot === 'os' || slot === 'office') return `<div class="price-line"><span class="pl-new">Offizielle Lizenz · keine Graumarkt-Keys (die gibt es „ab 3 €“ – Finger weg)</span></div>`;
  if (c?.usedOnly) return `<div class="price-line"><span class="pl-new warn">Neu kaum noch erhältlich · Preis = gebraucht (Median aus ${c.usedN} Kleinanzeigen, ${fmtDate(c.usedDate)})</span><a href="${ka}" target="_blank" rel="noopener">Kleinanz. ↗</a></div>`;
  const nw = c ? `<span class="pl-new" title="${esc(c.product || '')}">Neu ${eur(c.price)} · ${esc(c.shop || '')} · ${fmtDate(c.date)}</span>` : `<span class="pl-new warn">Richtpreis – noch nicht geprüft</span>`;
  const used = c?.used
    ? `<label class="pl-used ${adv[0]}" title="${esc(adv[1])}${c.usedN ? ` · ${c.usedN} Anzeigen` : ''}"><input type="checkbox" data-used="${slot}" ${s.used ? 'checked' : ''} ${adv[0] === 'no' ? 'disabled' : ''}>gebraucht ~${eur(c.used).replace(',00', '')} <b>−${Math.round((1 - c.used / c.price) * 100)} %</b></label>`
    : `<span class="pl-used none">gebraucht: keine Daten</span>`;
  return `<div class="price-line">${nw}${used}<a href="${idealo}" target="_blank" rel="noopener">idealo ↗</a><a href="${ka}" target="_blank" rel="noopener">Kleinanz. ↗</a></div>`;
}

function usedSection(b) {
  const c = compare(b);
  if (!c.n) return '';
  return `<div class="section"><div class="section-h"><span>Neu vs. Gebraucht</span><span>Stand ${fmtDate(CHECKED)}</span></div>
    <div class="card sum">
      <div class="sum-row"><span>Alles neu (günstigster geprüfter Preis)</span><span>${eur(c.allNew)}</span></div>
      <div class="sum-row"><span>Gebraucht, wo sinnvoll (${c.n} Teile)</span><span>${eur(c.bestUsed)}</span></div>
      <div class="sum-total" style="font-size:15px"><span>Ersparnis gebraucht</span><span style="color:var(--ok)">−${eur(c.saving)} (${Math.round((c.saving / c.allNew) * 100)} %)</span></div>
      <div class="hint" style="margin-top:6px">Gebrauchtpreise = Median aktueller Kleinanzeigen-Angebote (VB, meist noch verhandelbar). Netzteil, SSD und Mauspad bleiben immer neu.</div>
      <div class="btns" style="margin-top:10px"><button class="btn" data-act="used-all">Gebraucht übernehmen, wo sinnvoll</button><button class="btn" data-act="used-none">Alles neu</button></div>
      <label class="chk" style="margin-top:6px"><input type="checkbox" data-f="quoteUsed" ${b.quoteUsed ? 'checked' : ''}> Vergleich im Angebot zeigen</label>
    </div></div>`;
}

function benchSection(b) {
  const bn = b.bench || {};
  const g = bn.games || {};
  const num = (gid, k, f) => `<input class="mini" type="number" min="0" step="1" data-bench="${gid}.${k}.${f}" value="${g[gid]?.[k]?.[f] ?? ''}" placeholder="–">`;
  const gain = (gid) => { const a = g[gid]?.stock?.avg, t = g[gid]?.tuned?.avg; return a && t ? `<b style="color:${t >= a ? 'var(--ok)' : 'var(--err)'}">${t >= a ? '+' : ''}${Math.round((t / a - 1) * 100)} %</b>` : ''; };
  const tw = bn.tweaks || {};
  return `<div class="section"><div class="section-h"><span>Benchmarks (selbst gemessen)</span><span><select class="mini" style="width:auto" data-benchf="res">${['1080p', '1440p', '4K'].map((r) => `<option ${r === (bn.res || '1080p') ? 'selected' : ''}>${r}</option>`).join('')}</select></span></div>
    <div class="card bench">
      <div class="bench-row bench-head"><span>Spiel</span><span>Serie Ø</span><span>1 % Low</span><span>Getweakt Ø</span><span>1 % Low</span><span></span></div>
      ${GAMES.map((x) => `<div class="bench-row"><span title="${esc(x.how)}">${x.name}<small>${x.preset}</small></span>${num(x.id, 'stock', 'avg')}${num(x.id, 'stock', 'low')}${num(x.id, 'tuned', 'avg')}${num(x.id, 'tuned', 'low')}<span>${gain(x.id)}</span></div>`).join('')}
      <div class="bench-tweaks">${TWEAKS.map((t) => `<label class="chk"><input type="checkbox" data-tweak="${t.id}" ${tw[t.id] ? 'checked' : ''}>${t.name}${t.input ? ` <input class="mini" style="width:56px" type="number" step="0.1" data-tweakv="${t.id}" value="${tw[t.id + '_v'] ?? ''}" placeholder="${t.input}">` : ''}${t.note ? `<span class="p">${t.note}</span>` : ''}</label>`).join('')}</div>
      <div class="row2" style="padding:0 12px 12px"><div class="field"><label>Gemessen mit</label><input data-benchf="tool" value="${esc(bn.tool || '')}" placeholder="CapFrameX / PresentMon"></div><div class="field"><label>Datum</label><input type="date" data-benchf="date" value="${esc(bn.date || '')}"></div></div>
      <div class="hint" style="padding:0 12px 12px">Nur echte Messwerte eintragen – gleiche Szene, 3 Durchläufe, Ø nehmen. Die Werte landen im Angebot als Beweis, was deine Tweaks bringen.</div>
    </div></div>`;
}

function kbSection(b) {
  const kb = b.kb;
  const lay = layoutKeys(kb.layout);
  const sw = kbItem('switches', kb.switchId);
  const selK = (list, key) => `<select class="big" data-kb="${key}">${KB[list].filter((x) => list !== 'caps' || x.id !== 'kk-low').map((x) => `<option value="${x.id}" ${x.id === kb[key] ? 'selected' : ''}>${esc(x.name)} · ${eur(x.price).replace(',00', '')}${list === 'switches' ? '/Stk' : ''}${x.unchecked ? ' (Preis prüfen)' : ''}</option>`).join('')}</select>`;
  const col = (k, label) => `<div class="color"><input type="color" data-color="${k}" value="${kb.colors[k]}">${label}</div>`;
  return `<div class="section"><div class="section-h"><span>Tastatur-Konfigurator</span><span>${lay.count} Tasten · ${eur(kbPrice(kb))}</span></div>
    <div class="card kb-grid">
      <div class="seg">${KB.layoutOrder.map((k) => [k, KB.layouts[k]]).map(([k, v]) => `<button data-layout="${k}" class="${k === kb.layout ? 'on' : ''}">${v.label}</button>`).join('')}</div>
      <div class="field"><label>Case</label>${selK('cases', 'caseId')}</div>
      <div class="row2">
        <div class="field"><label>Plate</label>${selK('plates', 'plateId')}</div>
        <div class="field"><label>Stabilisatoren</label>${selK('stabs', 'stabId')}</div>
      </div>
      <div class="field"><label>PCB</label>${selK('pcbs', 'pcbId')}</div>
      <div class="field"><label>Switches <span style="color:var(--dim)">· ${esc(sw.info)} · ${lay.count + 5} Stück</span></label>${selK('switches', 'switchId')}</div>
      <div class="field"><label>Keycaps</label>${selK('caps', 'capsId')}</div>
      <div class="field"><label>Farben</label>
        <div class="colors">
          <div class="color"><input type="color" data-color="case" value="${kb.caseColor}">Case</div>
          ${col('alpha', 'Alphas')}${col('mod', 'Mods')}${col('accent', 'Akzent')}${col('legend', 'Schrift')}
        </div>
      </div>
      <div class="presets">${KB.presets.map((p, i) => `<button class="preset" data-preset="${i}"><span class="sw">${['alpha', 'mod', 'accent'].map((k) => `<span style="background:${p.colors[k]}"></span>`).join('')}</span>${p.name}</button>`).join('')}</div>
      <div>${KB.extras.map((x) => `<label class="chk"><input type="checkbox" data-extra="${x.id}" ${(kb.extras || []).includes(x.id) ? 'checked' : ''}>${esc(x.name)}<span class="p">${eur(x.price)}</span></label>`).join('')}</div>
      <div class="hint">Tipp: In der 3D-Ansicht „Tastatur“ auf deiner echten Tastatur tippen oder Tasten anklicken. Jedes Teil verändert den Sound – nach jeder Änderung hörst du kurz eine Probe.</div>
    </div></div>
    ${soundCard(kb)}`;
}

function soundCard(kb) {
  const p = soundProfile(kb);
  const tr = soundTraits(p);
  const cs = kbItem('cases', kb.caseId), pl = kbItem('plates', kb.plateId), st = kbItem('stabs', kb.stabId), cap = kbItem('caps', kb.capsId), pcb = kbItem('pcbs', kb.pcbId);
  const who = [
    ['Case', cs.sound], ['Plate', pl.info], ['Keycaps', `${cap.mat} · ${cap.mat === 'PBT' ? 'tiefer, matter' : 'heller, „clacky“'}${cap.h > 0.55 ? ' · hohes Profil = tiefer' : ''}`],
    ['Stabis', st.info], ['PCB', pcb.he ? 'Hall-Effect' : pcb.id === 'kpcb-solder' ? 'gelötet · etwas satter' : 'Hot-Swap · minimal Sockel-Pling'],
  ];
  return `<div class="section"><div class="section-h"><span>Sound-Profil</span><span>${esc(tr.word)}</span></div>
    <div class="card snd">
      <div class="snd-bars">${tr.bars.map(([n, v]) => `<div class="snd-row"><span>${n}</span><div class="snd-bar"><i style="width:${Math.round(v * 100)}%"></i></div></div>`).join('')}</div>
      <div class="snd-who">${who.map(([k, v]) => `<div><b>${k}</b> ${esc(v || '')}</div>`).join('')}</div>
      <button class="btn primary" data-act="kbdemo">▶ Probe hören</button>
    </div></div>`;
}

function mountSwitchViz() {
  const el = document.getElementById('stage-viz');
  const b = curBuild();
  const show = !!b && ui.view === 'kb' && !!activeKb(b);
  el.hidden = !show;
  $('#stage').classList.toggle('with-viz', show);
  if (!show) return stopViz();
  const kb = activeKb(b);
  const type = ui.svType || kbItem('switches', kb.switchId).type;
  mountViz(el, {
    type, sound: ui.svSound,
    getSound: () => soundProfile(activeKb(curBuild())),
    onType: (t, snd) => { if (snd !== undefined) { ui.svSound = snd; return; } ui.svType = t; mountSwitchViz(); },
  });
}
function playDemo() { const b = curBuild(); const kb = b && activeKb(b); if (kb && ui.sound) demo(soundProfile(kb)); }

function customerView() {
  const c = curCustomer();
  if (!c) return '';
  const bs = state.builds.filter((b) => b.customerId === c.id).sort((a, b) => b.updated - a.updated);
  const sum = bs.reduce((s, b) => s + totals(b).total, 0);
  const f = (k, label, ph = '') => `<div class="field"><label>${label}</label><input data-cf="${k}" value="${esc(c[k])}" placeholder="${ph}"></div>`;
  return `<div class="cfg">
    <input class="title-input" data-cf="name" value="${esc(c.name)}">
    <div class="meta-row"><span class="pill">${bs.length} Builds</span><span class="pill">Volumen ${eur(sum)}</span></div>
    <div class="section"><div class="section-h"><span>Builds</span><button class="icon-btn" data-act="new-build">+</button></div>
      <div class="card">${bs.length ? bs.map((b) => `<div class="bcard" data-act="build" data-id="${b.id}">${typeDot(b.type)}<div class="n">${esc(b.name)}<div class="s">${TYPES[b.type].label} · ${b.status}${b.units > 1 ? ` · ${b.units}×` : ''}</div></div><b>${eur(totals(b).total)}</b></div>`).join('') : `<div class="bcard" data-act="new-build"><div class="n" style="color:var(--muted)">+ Ersten Build anlegen</div></div>`}</div>
    </div>
    <div class="section"><div class="section-h"><span>Kontakt</span></div>
      <div class="card cust-form">
        ${f('company', 'Firma / Zusatz')}
        <div class="row2">${f('email', 'E-Mail')}${f('phone', 'Telefon')}</div>
        ${f('address', 'Adresse', 'Straße, PLZ Ort')}
        <div class="field"><label>Notizen</label><textarea data-cf="notes" placeholder="Budget, Vorlieben, Games, Software…">${esc(c.notes)}</textarea></div>
      </div>
    </div>
    <div class="btns"><button class="btn primary grow" data-act="new-build">+ Neuer Build</button><button class="btn danger" data-act="delete-customer">Kunde löschen</button></div>
  </div>`;
}

// ---------- Render: Stage ----------
function renderStage() {
  const b = curBuild();
  $('#empty-stage').hidden = !!b;
  if (!b) { $('#stage-top').innerHTML = ''; $('#stage-bottom').innerHTML = ''; mountSwitchViz(); return; }
  const views = availableViews(b);
  const names = { pc: 'PC', kb: 'Tastatur', setup: 'Setup' };
  const tot = totals(b);
  const ch = checks(b);
  const errs = ch.filter((c) => c.level === 'error').length, warns = ch.filter((c) => c.level === 'warn').length;
  const stColor = errs ? 'var(--err)' : warns ? 'var(--warn)' : 'var(--ok)';
  $('#stage-top').innerHTML = `
    <div class="tabs">${views.map((v) => `<button data-view="${v}" class="${v === ui.view ? 'on' : ''}">${names[v]}</button>`).join('')}</div>
    <div class="toggles">
      <button class="tgl ${ui.rgb ? 'on' : ''}" data-tgl="rgb">RGB</button>
      <button class="tgl ${ui.autoRotate ? 'on' : ''}" data-tgl="autoRotate">Drehen</button>
      ${ui.view === 'kb' ? `<button class="tgl ${ui.sound ? 'on' : ''}" data-tgl="sound">Sound</button>` : ''}
    </div>`;
  $('#stage-bottom').innerHTML = `
    <div class="hud">
      <div class="big">${eur(tot.total)}</div>
      <div class="small"><span class="status-dot" style="background:${stColor}"></span>${errs ? `${errs} Problem${errs > 1 ? 'e' : ''}` : warns ? `${warns} Hinweis${warns > 1 ? 'e' : ''}` : 'Kompatibel'} · ${esc(b.name)}${tot.units > 1 ? ` · ${tot.units}×` : ''}</div>
    </div>
    ${ui.view === 'kb' ? `<div class="hud type-test"><div class="small">Tipp-Test – einfach lostippen</div><div class="typed"><span id="typed">${esc(ui.typed) || '&nbsp;'}</span></div></div>` : ''}`;
  mountSwitchViz();
}

function renderAll() { renderTopbar(); renderSidebar(); renderConfig(); renderStage(); }

// ---------- Modals ----------
let pendingConfirm = null;
function confirmBox(title, text, yesLabel, onYes) {
  pendingConfirm = onYes;
  modal(title, `<p style="margin:0 0 4px;color:var(--muted)">${esc(text)}</p>
    <div class="btns"><button class="btn danger grow" data-act="confirm-yes">${esc(yesLabel)}</button><button class="btn grow" data-act="close-modal">Abbrechen</button></div>`, { small: true });
}
function modal(title, body, { wide = false, small = false } = {}) {
  $('#modal-root').innerHTML = `<div class="modal-bg" data-act="close-modal"><div class="modal ${wide ? 'wide' : small ? 'small' : ''}" role="dialog" aria-label="${esc(title)}">
    <div class="modal-h"><h2>${title}</h2><button class="icon-btn" data-act="close-modal">×</button></div>
    <div class="modal-b">${body}</div></div></div>`;
}
const closeModal = () => ($('#modal-root').innerHTML = '');

function newBuildModal() {
  const types = Object.entries(TYPES);
  modal('Neuer Build', `
    <div class="type-cards">${types.map(([k, t]) => `<div class="type-card"><b>${typeDot(k)} ${t.label}</b><p>${t.desc}</p>
      <div class="tpl-list">
        <button class="tpl" data-new="${k}">Leer starten</button>
        ${(() => { let last = null; return TEMPLATES.filter((x) => x.type === k).sort((x, y) => (y.group ? 1 : 0) - (x.group ? 1 : 0)).map((x) => {
          const head = x.group && x.group !== last ? `<div class="tpl-group">${esc(x.group)} – passt garantiert</div>` : (!x.group && last ? '<div class="tpl-group">Standard</div>' : '');
          last = x.group || null;
          return `${head}<button class="tpl" data-tpl="${TEMPLATES.indexOf(x)}">${esc(x.name)}<small>${eur(totals(fromTemplate(x, null)).total)}</small></button>`;
        }).join(''); })()}
      </div></div>`).join('')}
    </div>`, { wide: true });
}

function customPartModal(slot) {
  modal(`Eigenes Teil – ${SLOT_LABELS[slot]}`, `
    <div class="cust-form" style="padding:0">
      <div class="field"><label>Name</label><input id="cp-name" placeholder="z. B. ASUS ROG Strix RTX 5080 OC"></div>
      <div class="row2"><div class="field"><label>Preis (€)</label><input id="cp-price" type="number" min="0" step="1"></div>
      <div class="field"><label>Kurzinfo</label><input id="cp-info" placeholder="optional"></div></div>
      <p class="hint">Eigene Teile landen in deinem Katalog und stehen in allen Builds zur Verfügung. Für die Kompatibilitätsprüfung fehlen ihnen technische Daten – bitte selbst gegenchecken.</p>
      <div class="btns"><button class="btn primary grow" data-act="save-custom" data-slot="${slot}">Hinzufügen</button></div>
    </div>`);
  setTimeout(() => $('#cp-name')?.focus(), 30);
}

function settingsModal() {
  const s = state.settings;
  const f = (k, label, type = 'text') => `<div class="field"><label>${label}</label><input data-set="${k}" type="${type}" value="${esc(s[k])}"></div>`;
  modal('Einstellungen', `<div class="cust-form" style="padding:0">
    <div class="row2">${f('owner', 'Dein Name')}${f('company', 'Firma')}</div>
    <div class="row2">${f('email', 'E-Mail')}${f('web', 'Website')}</div>
    <div class="row2">${f('markup', 'Aufschlag auf Teile (%)', 'number')}${f('amazonTag', 'Amazon-Partner-Tag (optional)')}</div>
    <label class="chk"><input type="checkbox" data-set="kleinunternehmer" ${s.kleinunternehmer ? 'checked' : ''}> Kleinunternehmer nach § 19 UStG (keine USt. ausweisen)</label>
    <p class="hint">Der Aufschlag wird im Angebot direkt in die Teilepreise eingerechnet. Mit Amazon-Tag bekommen die Links in der Einkaufsliste deine Partner-ID.</p>
    <div class="btns"><button class="btn primary grow" data-act="close-modal">Fertig</button></div>
  </div>`);
}

function backupModal() {
  modal('Backup', `<p class="hint">${saveState === 'cloud' ? 'Kunden, Builds und eigene Teile werden online gespeichert. Ein Backup als Datei ist trotzdem sinnvoll – z. B. vor großen Änderungen.' : 'Kunden, Builds und eigene Teile liegen nur in diesem Browser. Sichere sie regelmäßig als Datei.'}</p>
    <div class="btns"><button class="btn primary" data-act="export">Backup herunterladen</button>
    <label class="btn">Backup laden…<input type="file" accept=".json" id="import-file" hidden></label></div>`);
}

function shopUrl(name) {
  const tag = state.settings.amazonTag?.trim();
  return `https://www.amazon.de/s?k=${encodeURIComponent(name)}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`;
}
function shoppingModal() {
  const b = curBuild();
  const tot = totals(b);
  const L = lines(b).filter((l) => !l.group);
  modal(`Einkaufsliste – ${esc(b.name)}`, `
    <div class="card">${L.map((l) => `<div class="bcard" style="cursor:default"><div class="n">${esc(l.name)}<div class="s">${esc(l.label || '')}${tot.units > 1 ? ` · gesamt ${l.qty * tot.units}×` : l.qty > 1 ? ` · ${l.qty}×` : ''}</div></div>
      <a href="https://geizhals.de/?fs=${encodeURIComponent(l.name)}" target="_blank" rel="noopener">Geizhals</a>
      <a href="${shopUrl(l.name)}" target="_blank" rel="noopener">Amazon</a>
      <b style="min-width:80px;text-align:right">${eur(l.qty * l.price * tot.units)}</b></div>`).join('')}</div>
    <div class="btns"><button class="btn" data-act="copy-list">Als Text kopieren</button></div>`, { wide: true });
}

function quoteExtras(b) {
  let h = '';
  const g = b.bench?.games || {};
  const rows = GAMES.filter((x) => g[x.id]?.stock?.avg || g[x.id]?.tuned?.avg);
  if (rows.length) {
    const tw = TWEAKS.filter((t) => b.bench?.tweaks?.[t.id]).map((t) => t.name + (t.input && b.bench.tweaks[t.id + '_v'] ? ` ${b.bench.tweaks[t.id + '_v']} ${t.input}` : ''));
    h += `<h3 style="margin:22px 0 6px;font-size:14px">Gemessene Leistung (${esc(b.bench.res || '1080p')})</h3>
      <table><thead><tr><th>Spiel</th><th class="r">Serie Ø / 1 % Low</th><th class="r">NKZS-getweakt Ø / 1 % Low</th><th class="r">Plus</th></tr></thead><tbody>
      ${rows.map((x) => { const s = g[x.id].stock || {}, t = g[x.id].tuned || {}; return `<tr><td>${x.name}<span class="cat">${x.preset}</span></td><td class="r">${s.avg ?? '–'} / ${s.low ?? '–'} FPS</td><td class="r">${t.avg ?? '–'} / ${t.low ?? '–'} FPS</td><td class="r">${s.avg && t.avg ? `+${Math.round((t.avg / s.avg - 1) * 100)} %` : ''}</td></tr>`; }).join('')}
      </tbody></table>
      <div style="color:#666;font-size:11px;margin-top:6px">Selbst gemessen${b.bench.tool ? ` mit ${esc(b.bench.tool)}` : ''}${b.bench.date ? ` am ${new Date(b.bench.date).toLocaleDateString('de-DE')}` : ''}. ${tw.length ? `Tweaks: ${esc(tw.join(', '))}.` : ''}</div>`;
  }
  if (b.quoteUsed) {
    const c = compare(b);
    if (c.n) h += `<div style="margin-top:18px;padding:12px 14px;background:#f5f5f7;border-radius:8px"><b>Spar-Option gebraucht:</b> Mit geprüften Gebrauchtteilen (${c.n} Teile, z. B. CPU/GPU) läge der Teilepreis bei ca. <b>${eur(c.bestUsed)}</b> statt ${eur(c.allNew)} – also rund <b>${eur(c.saving)}</b> günstiger. Netzteil & SSD immer neu.</div>`;
  }
  return h;
}

function quoteHtml(b, img) {
  const s = state.settings;
  const c = state.customers.find((x) => x.id === b.customerId) || {};
  const tot = totals(b);
  const f = 1 + (+s.markup || 0) / 100;
  const no = `AN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(s.quoteNo).padStart(3, '0')}`;
  const valid = new Date(Date.now() + 14 * 864e5).toLocaleDateString('de-DE');
  const rows = lines(b).map((l) => l.group
    ? `<tr class="q-group"><td colspan="4">${esc(l.group)}</td></tr>`
    : `<tr><td>${l.label ? `<span class="cat">${esc(l.label)}</span>` : ''}${esc(l.name)}</td><td class="r">${l.qty}</td><td class="r">${eur(l.price * f)}</td><td class="r">${eur(l.price * f * l.qty)}</td></tr>`).join('');
  return `<div class="quote">
    <div class="q-head">
      <div class="q-logo">NKZS<small>NICO KLEIN KAIZO STUDIOS</small></div>
      <div class="q-from">${esc(s.owner)}<br>${esc(s.email)}<br>${esc(s.web)}</div>
    </div>
    <div style="display:flex;justify-content:space-between;gap:20px">
      <div><div style="color:#888;font-size:10.5px">Angebot für</div><b>${esc(c.name)}</b><br>${esc(c.company || '')}${c.address ? `<br>${esc(c.address)}` : ''}</div>
      <div style="text-align:right;color:#555">Angebot ${no}<br>Datum ${new Date().toLocaleDateString('de-DE')}<br>gültig bis ${valid}</div>
    </div>
    <h1 style="margin-top:22px">${esc(b.name)}</h1>
    <div class="q-meta">${TYPES[b.type].label}${tot.units > 1 ? ` · ${tot.units} Systeme` : ''}</div>
    ${img ? `<img class="q-img" src="${img}">` : ''}
    <table><thead><tr><th>Position</th><th class="r">Menge</th><th class="r">Einzel</th><th class="r">Summe</th></tr></thead>
      <tbody>${rows}<tr><td><span class="cat">Dienstleistung</span>Montage, Einrichtung & Test</td><td class="r">1</td><td class="r">${eur(tot.service)}</td><td class="r">${eur(tot.service)}</td></tr></tbody></table>
    <div class="q-sum">
      ${tot.units > 1 ? `<div><span>Pro System</span><span>${eur(tot.unit)}</span></div><div><span>Anzahl</span><span>× ${tot.units}</span></div>` : ''}
      <div class="tot"><span>Gesamtbetrag</span><span>${eur(tot.total)}</span></div>
    </div>
    ${quoteExtras(b)}
    ${b.notes ? `<p style="margin-top:18px"><b>Hinweise:</b> ${esc(b.notes)}</p>` : ''}
    <div class="q-foot">
      ${s.kleinunternehmer ? 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.<br>' : ''}
      Preise abhängig von der Tagesverfügbarkeit der Komponenten. Bei Preisänderungen einzelner Teile melde ich mich vor der Bestellung.<br>
      Vielen Dank für dein Vertrauen! – ${esc(s.owner)}
    </div>
  </div>`;
}
function quoteModal() {
  const b = curBuild();
  const img = Viewer.snapshot();
  const html = quoteHtml(b, img);
  $('#print-root').innerHTML = html;
  ui.quoteImg = img;
  modal('Angebot', `<div class="quote-wrap">${html}</div><div class="btns"><button class="btn primary grow" data-act="pdf">PDF herunterladen</button><button class="btn" data-act="copy-quote">Als Text kopieren</button></div>`, { wide: true });
}

// ---------- Angebot als PDF (jsPDF) ----------
const pdfTxt = (t) => String(t ?? '').replace(/[„“”]/g, '"').replace(/[‚‘’]/g, "'").replace(/[–—−]/g, '-').replace(/→/g, '->').replace(/≈/g, '~').replace(/ | /g, ' ').replace(/[^\x20-\x7e -ÿ€–]/g, '');
const pdfEur = (n) => pdfTxt(eur(n));
async function savePdf() {
  const J = window.jspdf?.jsPDF;
  if (!J) return toast('PDF-Modul nicht geladen – Internetverbindung prüfen.');
  const b = curBuild(), st = state.settings, c = state.customers.find((x) => x.id === b.customerId) || {};
  const tot = totals(b), f = 1 + (+st.markup || 0) / 100;
  const no = `AN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(st.quoteNo).padStart(3, '0')}`;
  const doc = new J({ unit: 'mm', format: 'a4' });
  const M = 18, W = 210 - 2 * M, ACC = [15, 122, 90], INK = [22, 25, 28], GREY = [120, 126, 132];
  let y = 20;
  const text = (t, x, yy, o = {}) => { doc.setFont('helvetica', o.bold ? 'bold' : 'normal'); doc.setFontSize(o.size || 9.5); doc.setTextColor(...(o.color || INK)); doc.text(pdfTxt(t), x, yy, { align: o.align || 'left' }); };
  const ensure = (h) => { if (y + h > 272) { doc.addPage(); y = 20; } };
  // Kopf
  text('NKZS', M, y, { bold: true, size: 17 });
  text('NICO KLEIN KAIZO STUDIOS', M, y + 5, { size: 7, color: GREY });
  [st.owner, st.email, st.web].forEach((t, i) => text(t, 210 - M, y - 3 + i * 4.3, { size: 8.5, align: 'right', color: [80, 86, 92] }));
  y += 11; doc.setDrawColor(...ACC); doc.setLineWidth(0.6); doc.line(M, y, 210 - M, y);
  y += 9;
  text('Angebot für', M, y, { size: 7.5, color: GREY });
  text(c.name, M, y + 5, { bold: true, size: 11 });
  [c.company, c.address].filter(Boolean).forEach((t, i) => text(t, M, y + 10 + i * 4.3, { size: 9 }));
  [['Angebot', no], ['Datum', new Date().toLocaleDateString('de-DE')], ['Gültig bis', new Date(Date.now() + 14 * 864e5).toLocaleDateString('de-DE')]].forEach(([k, v], i) => {
    text(k, 150, y + i * 4.6, { size: 8.5, color: GREY }); text(v, 210 - M, y + i * 4.6, { size: 8.5, align: 'right' });
  });
  y += 24;
  text(b.name, M, y, { bold: true, size: 15 });
  text(`${TYPES[b.type].label}${tot.units > 1 ? ` · ${tot.units} Systeme` : ''}`, M, y + 5.5, { size: 9, color: GREY });
  y += 10;
  // 3D-Ansicht
  const img = ui.quoteImg;
  if (img) {
    const im = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = img; });
    if (im) {
      let w = W, h = (W * im.height) / im.width;
      if (h > 80) { h = 80; w = (h * im.width) / im.height; }
      doc.addImage(img, 'JPEG', M + (W - w) / 2, y, w, h);
      y += h + 7;
    }
  }
  // Positionen
  const cols = { pos: M, qty: 140, unit: 166, sum: 210 - M };
  const head = () => {
    ensure(10);
    [['Position', cols.pos, 'left'], ['Menge', cols.qty, 'right'], ['Einzel', cols.unit, 'right'], ['Summe', cols.sum, 'right']].forEach(([t, x, al]) => text(t.toUpperCase(), x, y, { size: 7, color: GREY, bold: true, align: al }));
    y += 2; doc.setDrawColor(...INK); doc.setLineWidth(0.4); doc.line(M, y, 210 - M, y); y += 5;
  };
  head();
  const rows = lines(b).concat([{ label: 'Dienstleistung', name: 'Montage, Einrichtung & Test', qty: 1, price: tot.service / f, service: true }]);
  for (const l of rows) {
    if (l.group) { ensure(8); doc.setFillColor(243, 245, 246); doc.rect(M, y - 3.8, W, 6, 'F'); text(l.group, M + 1.5, y, { bold: true, size: 8.5 }); y += 6; continue; }
    doc.setFontSize(9); const nameLines = doc.splitTextToSize(pdfTxt(l.name), 112);
    const h = (l.label ? 3.6 : 0) + nameLines.length * 4 + 2.5;
    if (y + h > 272) { doc.addPage(); y = 20; head(); }
    let yy = y;
    if (l.label) { text(l.label, cols.pos, yy, { size: 7, color: GREY }); yy += 3.6; }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...INK); doc.text(nameLines, cols.pos, yy);
    const unit = l.service ? tot.service : l.price * f;
    text(String(l.qty), cols.qty, y + (l.label ? 3.6 : 0), { align: 'right', size: 9 });
    text(pdfEur(unit), cols.unit, y + (l.label ? 3.6 : 0), { align: 'right', size: 9 });
    text(pdfEur(unit * l.qty), cols.sum, y + (l.label ? 3.6 : 0), { align: 'right', size: 9 });
    y += h; doc.setDrawColor(226, 229, 232); doc.setLineWidth(0.2); doc.line(M, y - 1.5, 210 - M, y - 1.5); y += 1.5;
  }
  // Summe
  ensure(22); y += 2;
  if (tot.units > 1) { text('Pro System', 130, y, { size: 9, color: GREY }); text(pdfEur(tot.unit), 210 - M, y, { align: 'right', size: 9 }); y += 5; text('Anzahl', 130, y, { size: 9, color: GREY }); text('× ' + tot.units, 210 - M, y, { align: 'right', size: 9 }); y += 5; }
  doc.setDrawColor(...INK); doc.setLineWidth(0.5); doc.line(130, y, 210 - M, y); y += 6;
  text('Gesamtbetrag', 130, y, { bold: true, size: 11 }); text(pdfEur(tot.total), 210 - M, y, { bold: true, size: 11, align: 'right' });
  y += 10;
  // Benchmarks
  const g = b.bench?.games || {};
  const bench = GAMES.filter((x) => g[x.id]?.stock?.avg || g[x.id]?.tuned?.avg);
  if (bench.length) {
    ensure(14 + bench.length * 6);
    text(`Gemessene Leistung (${b.bench.res || '1080p'})`, M, y, { bold: true, size: 10.5 }); y += 6;
    [['Spiel', M, 'left'], ['Serie Ø / 1 % Low', 130, 'right'], ['Getweakt Ø / 1 % Low', 172, 'right'], ['Plus', 210 - M, 'right']].forEach(([t, x, al]) => text(t.toUpperCase(), x, y, { size: 7, color: GREY, bold: true, align: al }));
    y += 5;
    for (const x of bench) {
      const s1 = g[x.id].stock || {}, t1 = g[x.id].tuned || {};
      text(`${x.name} · ${x.preset}`, M, y, { size: 9 });
      text(`${s1.avg ?? '-'} / ${s1.low ?? '-'} FPS`, 130, y, { size: 9, align: 'right' });
      text(`${t1.avg ?? '-'} / ${t1.low ?? '-'} FPS`, 172, y, { size: 9, align: 'right' });
      text(s1.avg && t1.avg ? `+${Math.round((t1.avg / s1.avg - 1) * 100)} %` : '', 210 - M, y, { size: 9, align: 'right', bold: true, color: ACC });
      y += 5.5;
    }
    const tw = TWEAKS.filter((t) => b.bench?.tweaks?.[t.id]).map((t) => t.name + (t.input && b.bench.tweaks[t.id + '_v'] ? ` ${b.bench.tweaks[t.id + '_v']} ${t.input}` : ''));
    doc.setFontSize(8); const note = doc.splitTextToSize(pdfTxt(`Selbst gemessen${b.bench.tool ? ` mit ${b.bench.tool}` : ''}${b.bench.date ? ` am ${new Date(b.bench.date).toLocaleDateString('de-DE')}` : ''}.${tw.length ? ` Tweaks: ${tw.join(', ')}.` : ''}`), W);
    doc.setTextColor(...GREY); doc.text(note, M, y); y += note.length * 3.6 + 4;
  }
  const para = (label, body) => {
    doc.setFontSize(9); const t = doc.splitTextToSize(pdfTxt(body), W - 2);
    ensure(t.length * 4 + 8); text(label, M, y, { bold: true, size: 9 }); y += 4.5;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...INK); doc.text(t, M, y); y += t.length * 4 + 4;
  };
  if (b.quoteUsed) { const cc = compare(b); if (cc.n) para('Spar-Option gebraucht', `Mit geprüften Gebrauchtteilen (${cc.n} Teile) läge der Teilepreis bei ca. ${eur(cc.bestUsed)} statt ${eur(cc.allNew)} – rund ${eur(cc.saving)} günstiger. Netzteil und SSD immer neu.`); }
  if (b.notes) para('Hinweise', b.notes);
  // Fuß auf jeder Seite
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 229, 232); doc.setLineWidth(0.2); doc.line(M, 280, 210 - M, 280);
    doc.setFontSize(7.5); doc.setTextColor(...GREY); doc.setFont('helvetica', 'normal');
    doc.text(pdfTxt(`${st.kleinunternehmer ? 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet. ' : ''}Preise abhängig von der Tagesverfügbarkeit der Komponenten.`), M, 284.5);
    doc.text(pdfTxt(`${st.company || 'NKZS'} · ${no} · Seite ${i}/${pages}`), 210 - M, 288.5, { align: 'right' });
  }
  const file = `Angebot ${no} ${pdfTxt(c.name || '')}.pdf`.replace(/[\\/:*?"<>|]/g, '');
  if (await saveFile(file, doc.output('blob'))) { st.quoteNo++; save(); }
}

// ---------- Events ----------
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act],[data-view],[data-tgl],[data-layout],[data-preset],[data-new],[data-tpl],[data-fix],[data-kbfix]');
  if (!a) return;
  const d = a.dataset;
  if (d.fix) { const [slot, id] = d.fix.split(':'); return update((b) => (b.parts[slot] = { id, qty: b.parts[slot]?.qty || 1, price: null })); }
  if (d.kbfix) return update((b) => Object.assign(b.kb, JSON.parse(d.kbfix)));
  if (d.view) { ui.view = d.view; renderStage(); schedule3D(false); return; }
  if (d.tgl) { ui[d.tgl] = !ui[d.tgl]; Viewer.setOpts({ rgb: ui.rgb, autoRotate: ui.autoRotate, sound: ui.sound }); renderStage(); return; }
  if (d.layout) return update((b) => (b.kb.layout = d.layout), { keepCam: false });
  if (d.preset) return update((b) => (b.kb.colors = clone(KB.presets[+d.preset].colors)));
  if (d.new || d.tpl) {
    const t = d.tpl ? TEMPLATES[+d.tpl] : { type: d.new, name: `Neuer ${TYPES[d.new].short}`, parts: {} };
    const b = fromTemplate(t, ui.customerId);
    state.builds.push(b); save(); closeModal(); selectBuild(b.id);
    return;
  }
  switch (d.act) {
    case 'customer': return selectCustomer(d.id);
    case 'build': return selectBuild(d.id);
    case 'new-customer': {
      const c = { id: uid(), name: 'Neuer Kunde', company: '', email: '', phone: '', address: '', notes: '', created: Date.now() };
      state.customers.unshift(c); save(); selectCustomer(c.id);
      setTimeout(() => { const i = $('[data-cf="name"]'); i?.focus(); i?.select(); }, 20);
      return;
    }
    case 'new-build': if (!ui.customerId) return; return newBuildModal();
    case 'delete-customer': {
      const c = curCustomer();
      const n = state.builds.filter((b) => b.customerId === c.id).length;
      return confirmBox('Kunde löschen', `„${c.name}“${n ? ` und ${n} Build(s)` : ''} werden endgültig gelöscht.`, 'Endgültig löschen', () => {
        state.customers = state.customers.filter((x) => x.id !== c.id);
        state.builds = state.builds.filter((b) => b.customerId !== c.id);
        ui.customerId = null; ui.buildId = null; save(); renderAll(); render3D(); toast('Kunde gelöscht');
      });
    }
    case 'delete-build': {
      const b = curBuild();
      return confirmBox('Build löschen', `„${b.name}“ wird endgültig gelöscht.`, 'Endgültig löschen', () => {
        state.builds = state.builds.filter((x) => x.id !== b.id);
        ui.buildId = null; save(); renderAll(); render3D(); toast('Build gelöscht');
      });
    }
    case 'duplicate': {
      const b = clone(curBuild());
      b.id = uid(); b.name += ' (Kopie)'; b.created = b.updated = Date.now(); b.status = 'Entwurf';
      state.builds.push(b); save(); selectBuild(b.id);
      return;
    }
    case 'kbdemo': return playDemo();
    case 'autofill': return update((b) => autoFill(b));
    case 'quote': return quoteModal();
    case 'used-all': return update((b) => { for (const slot of TYPES[b.type].slots) { const p = sel(b, slot); if (p?.chk?.used && usedOk(slot) && slot !== 'keyboard') b.parts[slot].used = true; } });
    case 'used-none': return update((b) => { for (const s of Object.values(b.parts)) s.used = false; });
    case 'confirm-yes': { const f = pendingConfirm; pendingConfirm = null; closeModal(); f?.(); return; }
    case 'pdf': return savePdf();
    case 'copy-quote': {
      const b = curBuild(), tot = totals(b);
      const txt = `Angebot: ${b.name}\n` + lines(b).filter((l) => !l.group).map((l) => `${l.qty}× ${l.name} – ${eur(l.price * l.qty)}`).join('\n') + `\nMontage & Einrichtung – ${eur(tot.service)}\nGesamt: ${eur(tot.total)}`;
      navigator.clipboard?.writeText(txt).then(() => toast('Angebot als Text kopiert'), () => toast('Kopieren nicht erlaubt – Text bitte markieren'));
      return;
    }
    case 'shopping': return shoppingModal();
    case 'copy-list': {
      const b = curBuild(), tot = totals(b);
      const txt = lines(b).filter((l) => !l.group).map((l) => `${l.qty * tot.units}× ${l.name} – ${eur(l.qty * l.price * tot.units)}`).join('\n');
      navigator.clipboard?.writeText(`${b.name}\n${txt}\nTeile gesamt: ${eur(tot.parts * tot.units)}`).then(() => toast('Einkaufsliste kopiert'), () => toast('Kopieren nicht erlaubt'));
      return;
    }
    case 'settings': return settingsModal();
    case 'backup': return backupModal();
    case 'export': {
      saveFile(`nkzs-build-studio-backup-${new Date().toISOString().slice(0, 10)}.json`, new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
      return;
    }
    case 'save-custom': {
      const name = $('#cp-name').value.trim(), price = +$('#cp-price').value || 0;
      if (!name) return $('#cp-name').focus();
      const p = { id: 'own-' + uid(), slot: d.slot, name, price, info: $('#cp-info').value.trim() || 'eigenes Teil', own: true };
      state.customParts.push(p);
      closeModal();
      return update((b) => (b.parts[d.slot] = { id: p.id, qty: 1, price: null }));
    }
    case 'close-modal': if (e.target === a || a.classList.contains('icon-btn') || a.classList.contains('btn')) closeModal(); return;
  }
});

document.addEventListener('change', (e) => {
  const t = e.target, d = t.dataset;
  if (d.slot && t.tagName === 'SELECT') {
    if (t.value === '__custom') { t.value = curBuild().parts[d.slot]?.id || ''; return customPartModal(d.slot); }
    return update((b) => {
      if (!t.value) delete b.parts[d.slot];
      else b.parts[d.slot] = { id: t.value, qty: b.parts[d.slot]?.qty || 1, price: null };
      if (d.slot === 'keyboard' && sel(b, 'keyboard')?.custom === false && ui.view === 'kb') ui.view = null;
    });
  }
  if (d.qty) return update((b) => (b.parts[d.qty].qty = Math.max(1, +t.value || 1)));
  if (d.price !== undefined) return update((b) => (b.parts[d.price].price = t.value === '' ? null : +t.value), { view: false });
  if (d.kb) { if (d.kb === 'switchId') ui.svType = null; update((b) => (b.kb[d.kb] = t.value)); return playDemo(); }
  if (d.used) return update((b) => (b.parts[d.used].used = t.checked));
  if (d.bench) { const [gid, k, f] = d.bench.split('.'); return update((b) => { b.bench ??= {}; b.bench.games ??= {}; b.bench.games[gid] ??= {}; b.bench.games[gid][k] ??= {}; b.bench.games[gid][k][f] = t.value === '' ? null : +t.value; }, { view: false }); }
  if (d.benchf) return update((b) => { b.bench ??= {}; b.bench[d.benchf] = t.value; }, { view: false });
  if (d.tweak) return update((b) => { b.bench ??= {}; b.bench.tweaks ??= {}; b.bench.tweaks[d.tweak] = t.checked; }, { view: false });
  if (d.tweakv) return update((b) => { b.bench ??= {}; b.bench.tweaks ??= {}; b.bench.tweaks[d.tweakv + '_v'] = t.value; b.bench.tweaks[d.tweakv] = true; }, { view: false });
  if (d.extra) { update((b) => { const s = new Set(b.kb.extras || []); t.checked ? s.add(d.extra) : s.delete(d.extra); b.kb.extras = [...s]; }); return playDemo(); }
  if (d.color) return update((b) => { if (d.color === 'case') b.kb.caseColor = t.value; else b.kb.colors[d.color] = t.value; });
  if (d.f) {
    return update((b) => {
      if (d.f === 'units') b.units = Math.max(1, +t.value || 1);
      else if (d.f === 'service') b.service = t.value === '' ? null : +t.value;
      else if (d.f === 'quoteUsed') b.quoteUsed = t.checked;
      else b[d.f] = t.value;
    }, { view: false });
  }
  if (d.cf) { const c = curCustomer(); c[d.cf] = t.value; save(); renderSidebar(); return; }
  if (d.set) { state.settings[d.set] = t.type === 'checkbox' ? t.checked : t.type === 'number' ? +t.value : t.value; save(); renderConfig(); renderSidebar(); renderStage(); return; }
  if (t.id === 'import-file' && t.files[0]) {
    t.files[0].text().then((txt) => {
      try { const s = JSON.parse(txt); if (!s.customers) throw 0; state = s; save(); ui.customerId = ui.buildId = null; closeModal(); renderAll(); render3D(); }
      catch { toast('Die Datei ist kein gültiges Backup (JSON aus „Backup herunterladen“).'); }
    });
  }
});

// Live-Farbvorschau ohne Panel-Neuaufbau
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'search') { ui.search = t.value; renderSidebar(); const s = $('#search'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); return; }
  if (t.dataset.color) {
    const b = curBuild();
    if (t.dataset.color === 'case') b.kb.caseColor = t.value; else b.kb.colors[t.dataset.color] = t.value;
    schedule3D(true);
  }
});

// Tipp-Test
Viewer.setOnTyped((e) => {
  if (e.key === 'Backspace') ui.typed = ui.typed.slice(0, -1);
  else if (e.key === 'Enter') ui.typed = '';
  else if (e.key.length === 1) ui.typed = (ui.typed + e.key).slice(-60);
  const el = $('#typed');
  if (el) el.textContent = ui.typed || ' ';
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#modal-root').innerHTML) closeModal(); });

// ---------- Start ----------
Viewer.init($('#viewer'));
Viewer.setOpts({ rgb: ui.rgb, autoRotate: ui.autoRotate, sound: ui.sound });
const first = state.builds[0];
if (first) selectBuild(first.id); else renderAll();
initDb();
