import { CATALOG, SLOT_LABELS, TYPES, STATUS, KB, DEFAULT_KB, TEMPLATES, STAND } from './data.js';
import { layoutKeys } from './layouts.js';
import * as Viewer from './viewer.js';

// ---------- State ----------
const LS = 'nkzs-build-studio-v1';
const uid = () => Math.random().toString(36).slice(2, 10);
const eur = (n) => (Math.round(n * 100) / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const $ = (s) => document.querySelector(s);

let state = load();
const ui = { customerId: null, buildId: null, view: null, rgb: true, autoRotate: false, sound: true, search: '', typed: '' };

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
function save() { try { localStorage.setItem(LS, JSON.stringify(state)); } catch {} }

function fromTemplate(t, customerId, name) {
  const parts = {};
  for (const [slot, id] of Object.entries(t.parts || {})) parts[slot] = { id, qty: 1, price: null };
  return {
    id: uid(), customerId, name: name || t.name, type: t.type, status: 'Entwurf', parts, units: t.units || 1,
    kb: { ...clone(DEFAULT_KB), ...clone(t.kb || {}) }, service: null, notes: '', created: Date.now(), updated: Date.now(),
  };
}

// ---------- Katalog-Zugriff ----------
const catalogFor = (slot) => [...(CATALOG[slot] || []), ...state.customParts.filter((p) => p.slot === slot)];
const part = (slot, id) => catalogFor(slot).find((p) => p.id === id);
const kbItem = (list, id) => KB[list].find((x) => x.id === id) || KB[list][0];
function sel(b, slot) {
  const s = b.parts[slot];
  if (!s?.id) return null;
  const p = part(slot, s.id);
  return p ? { ...p, qty: s.qty || 1, price: s.price ?? p.price, basePrice: p.price } : null;
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
function resolveKb(kb) {
  const cs = kbItem('cases', kb.caseId), pl = kbItem('plates', kb.plateId), pcb = kbItem('pcbs', kb.pcbId);
  const sw = kbItem('switches', kb.switchId), cap = kbItem('caps', kb.capsId);
  const ex = (kb.extras || []).map((x) => KB.extras.find((y) => y.id === x)).filter(Boolean);
  const damp = (sw.damp || 0) + ex.reduce((s, e) => s + (e.damp || 0), 0) + (cs.material === 'pc' ? 0.1 : 0);
  const pitch = sw.pitch * pl.pitch * cs.pitch * ex.reduce((s, e) => s * (e.pitch || 1), 1) * (cap.h > 0.55 ? 0.93 : 1);
  return {
    layout: layoutKeys(kb.layout), caseColor: kb.caseColor, caseMat: cs.material, weight: cs.weight,
    plate: pl, switchColor: sw.color, capH: cap.h, sculpt: cap.sculpt, gloss: cap.gloss, rgb: !!pcb.rgb,
    colors: kb.colors, sound: { pitch, type: sw.type, damp },
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
    L.push({ slot, label: SLOT_LABELS[slot], name: p.name, qty: p.qty, price: p.price });
  }
  if (TYPES[b.type].kb) kbLines(b.kb).forEach((l) => L.push(l));
  return L;
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
  if (t.slots.includes('cpu')) {
    const cpu = g('cpu'), mb = g('mobo'), ram = g('ram'), gpu = g('gpu'), psu = g('psu'), cs = g('case'), cl = g('cooler');
    const miss = ['cpu', 'mobo', 'ram', 'storage', 'psu', 'case'].filter((s) => !g(s)).map((s) => SLOT_LABELS[s]);
    if (miss.length) out.push({ level: 'warn', text: `Fehlt noch: ${miss.join(', ')}` });
    if (cpu && mb && cpu.socket && mb.socket && cpu.socket !== mb.socket) out.push({ level: 'error', slots: ['cpu', 'mobo'], text: `Sockel passt nicht: CPU ist ${cpu.socket}, Mainboard ist ${mb.socket}.` });
    if (ram && mb && ram.ramType && mb.ram && ram.ramType !== mb.ram) out.push({ level: 'error', slots: ['ram', 'mobo'], text: `RAM-Typ passt nicht: Mainboard braucht ${mb.ram}, gewählt ist ${ram.ramType}.` });
    if (ram && mb && ram.sticks === 4 && mb.ff === 'ITX') out.push({ level: 'error', slots: ['ram', 'mobo'], text: 'Mini-ITX-Boards haben nur 2 RAM-Slots.' });
    if (mb && cs && cs.ff && mb.ff && !cs.ff.includes(mb.ff)) out.push({ level: 'error', slots: ['mobo', 'case'], text: `Mainboard (${mb.ff}) passt nicht ins Gehäuse (nur ${cs.ff.join('/')}).` });
    if (gpu && cs && cs.maxGpu && gpu.len > cs.maxGpu) out.push({ level: 'error', slots: ['gpu', 'case'], text: `Grafikkarte zu lang: ${gpu.len} mm, Gehäuse erlaubt ${cs.maxGpu} mm.` });
    if (cl && cs) {
      if ((cl.kind === 'air' || cl.kind === 'low') && cs.maxCooler && cl.height > cs.maxCooler) out.push({ level: 'error', slots: ['cooler', 'case'], text: `Kühler zu hoch: ${cl.height} mm, Gehäuse erlaubt ${cs.maxCooler} mm.` });
      if (cl.kind === 'aio' && cs.maxRad !== undefined && cl.rad > cs.maxRad) out.push({ level: 'error', slots: ['cooler', 'case'], text: cs.maxRad ? `Radiator zu groß: ${cl.rad} mm, Gehäuse erlaubt ${cs.maxRad} mm.` : 'In dieses Gehäuse passt keine AiO-Wasserkühlung.' });
    }
    if (psu && cs && cs.psu === 'SFX' && psu.ff !== 'SFX') out.push({ level: 'error', slots: ['psu', 'case'], text: 'Gehäuse braucht ein SFX-Netzteil.' });
    if (cpu) {
      const est = (cpu.tdp || 100) + (gpu?.tdp || 0) + 75;
      const rec = Math.ceil((est * 1.4) / 50) * 50;
      if (psu && psu.watt < est) out.push({ level: 'error', slots: ['psu', 'gpu', 'cpu'], text: `Netzteil zu schwach: ca. ${est} W Verbrauch, Netzteil hat ${psu.watt} W.` });
      else if (psu && psu.watt < rec) out.push({ level: 'warn', text: `Netzteil knapp: empfohlen sind ${rec} W (Verbrauch ca. ${est} W).` });
      else out.push({ level: 'info', text: `Geschätzter Verbrauch unter Last: ca. ${est} W${psu ? ` · Netzteil ${psu.watt} W` : ''}` });
      if (!gpu && !cpu.igpu) out.push({ level: 'error', slots: ['gpu', 'cpu'], text: 'Diese CPU hat keine eingebaute Grafik – Grafikkarte nötig.' });
      if (!cl) out.push({ level: 'warn', text: 'Kein CPU-Kühler gewählt.' });
    }
  }
  if (t.slots.includes('monitor') && !g('monitor')) out.push({ level: 'warn', text: 'Noch kein Monitor gewählt.' });
  if (b.type === 'workstation' && !g('minipc')) out.push({ level: 'warn', text: 'Noch kein Mini-PC gewählt.' });
  const kb = activeKb(b);
  if (kb && (TYPES[b.type].kb || sel(b, 'keyboard')?.custom)) {
    if (kb.capsId === 'kk-low') out.push({ level: 'warn', text: 'Low-Profile-Keycaps passen nicht auf normale MX-Switches.' });
    if (kb.pcbId === 'kpcb-solder' && (kb.extras || []).includes('kx-lube')) out.push({ level: 'info', text: 'Löt-PCB: Switches vor dem Einlöten lubben.' });
  }
  if (!out.some((o) => o.level === 'error' || o.level === 'warn')) out.unshift({ level: 'ok', text: 'Alles kompatibel.' });
  return out;
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
    <div class="brand"><b>NKZS</b><span>Build Studio</span></div>
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
    <div class="side-foot">
      <button data-act="settings">Einstellungen</button>
      <button data-act="backup">Backup</button>
    </div>`;
}
const typeDot = (type) => `<span class="type-dot t-${type}">${{ pc: 'PC', setup: 'ST', keyboard: 'KB', workstation: 'WS' }[type]}</span>`;

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

    <div class="section"><div class="checks">${ch.map((x) => `<div class="check ${x.level}"><i>${{ ok: '✓', warn: '!', error: '✕', info: 'i' }[x.level]}</i><span>${esc(x.text)}</span></div>`).join('')}</div></div>

    ${t.slots.length ? `<div class="section"><div class="section-h"><span>Komponenten</span><span>Richtpreise ${STAND}</span></div>
      <div class="card">${t.slots.map((s) => slotRow(b, s)).join('')}</div></div>` : ''}

    ${(t.kb || sel(b, 'keyboard')?.custom) ? kbSection(b) : ''}

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
      <a href="https://geizhals.de/?fs=${encodeURIComponent(p.name)}" target="_blank" rel="noopener" title="Aktuellen Preis auf Geizhals prüfen">Preis ↗</a>
    </div>` : p?.custom ? `<div class="slot-meta"><span class="info">Konfiguration unten · ${eur(kbPrice(b.kb))}</span></div>` : ''}
  </div>`;
}

function kbSection(b) {
  const kb = b.kb;
  const lay = layoutKeys(kb.layout);
  const sw = kbItem('switches', kb.switchId);
  const selK = (list, key) => `<select class="big" data-kb="${key}">${KB[list].filter((x) => list !== 'caps' || x.id !== 'kk-low').map((x) => `<option value="${x.id}" ${x.id === kb[key] ? 'selected' : ''}>${esc(x.name)} · ${eur(x.price).replace(',00', '')}${list === 'switches' ? '/Stk' : ''}</option>`).join('')}</select>`;
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
      <div class="hint">Tipp: In der 3D-Ansicht „Tastatur“ einfach auf deiner echten Tastatur tippen oder Tasten anklicken – Sound ändert sich mit Switch, Plate, Case und Mods.</div>
    </div></div>`;
}

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
  if (!b) { $('#stage-top').innerHTML = ''; $('#stage-bottom').innerHTML = ''; return; }
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
}

function renderAll() { renderSidebar(); renderConfig(); renderStage(); }

// ---------- Modals ----------
function modal(title, body, { wide = false } = {}) {
  $('#modal-root').innerHTML = `<div class="modal-bg" data-act="close-modal"><div class="modal ${wide ? 'wide' : ''}" onclick="event.stopPropagation()">
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
        ${TEMPLATES.filter((x) => x.type === k).map((x) => `<button class="tpl" data-tpl="${TEMPLATES.indexOf(x)}">${esc(x.name)}<small>${eur(totals(fromTemplate(x, null)).total)}</small></button>`).join('')}
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
  modal('Backup', `<p class="hint">Alle Kunden, Builds und eigenen Teile liegen lokal in diesem Browser. Sichere sie regelmäßig als Datei.</p>
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
  modal('Angebot', `${html}<div class="btns"><button class="btn primary grow" data-act="print">Drucken / als PDF sichern</button></div>`, { wide: true });
}

// ---------- Events ----------
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act],[data-view],[data-tgl],[data-layout],[data-preset],[data-new],[data-tpl]');
  if (!a) return;
  const d = a.dataset;
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
      if (!confirm(`Kunde „${c.name}“${n ? ` mit ${n} Build(s)` : ''} löschen?`)) return;
      state.customers = state.customers.filter((x) => x.id !== c.id);
      state.builds = state.builds.filter((b) => b.customerId !== c.id);
      ui.customerId = null; ui.buildId = null; save(); renderAll(); render3D();
      return;
    }
    case 'delete-build': {
      const b = curBuild();
      if (!confirm(`Build „${b.name}“ löschen?`)) return;
      state.builds = state.builds.filter((x) => x.id !== b.id);
      ui.buildId = null; save(); renderAll(); render3D();
      return;
    }
    case 'duplicate': {
      const b = clone(curBuild());
      b.id = uid(); b.name += ' (Kopie)'; b.created = b.updated = Date.now(); b.status = 'Entwurf';
      state.builds.push(b); save(); selectBuild(b.id);
      return;
    }
    case 'quote': return quoteModal();
    case 'print': state.settings.quoteNo++; save(); window.print(); return;
    case 'shopping': return shoppingModal();
    case 'copy-list': {
      const b = curBuild(), tot = totals(b);
      const txt = lines(b).filter((l) => !l.group).map((l) => `${l.qty * tot.units}× ${l.name} – ${eur(l.qty * l.price * tot.units)}`).join('\n');
      navigator.clipboard.writeText(`${b.name}\n${txt}\nTeile gesamt: ${eur(tot.parts * tot.units)}`);
      a.textContent = 'Kopiert ✓';
      return;
    }
    case 'settings': return settingsModal();
    case 'backup': return backupModal();
    case 'export': {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const l = document.createElement('a');
      l.href = URL.createObjectURL(blob);
      l.download = `nkzs-build-studio-backup-${new Date().toISOString().slice(0, 10)}.json`;
      l.click();
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
  if (d.kb) return update((b) => (b.kb[d.kb] = t.value));
  if (d.extra) return update((b) => { const s = new Set(b.kb.extras || []); t.checked ? s.add(d.extra) : s.delete(d.extra); b.kb.extras = [...s]; });
  if (d.color) return update((b) => { if (d.color === 'case') b.kb.caseColor = t.value; else b.kb.colors[d.color] = t.value; });
  if (d.f) {
    return update((b) => {
      if (d.f === 'units') b.units = Math.max(1, +t.value || 1);
      else if (d.f === 'service') b.service = t.value === '' ? null : +t.value;
      else b[d.f] = t.value;
    }, { view: false });
  }
  if (d.cf) { const c = curCustomer(); c[d.cf] = t.value; save(); renderSidebar(); return; }
  if (d.set) { state.settings[d.set] = t.type === 'checkbox' ? t.checked : t.type === 'number' ? +t.value : t.value; save(); renderConfig(); renderSidebar(); renderStage(); return; }
  if (t.id === 'import-file' && t.files[0]) {
    t.files[0].text().then((txt) => {
      try { const s = JSON.parse(txt); if (!s.customers) throw 0; state = s; save(); ui.customerId = ui.buildId = null; closeModal(); renderAll(); render3D(); }
      catch { alert('Die Datei ist kein gültiges Backup.'); }
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
