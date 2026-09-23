// Übernimmt Preis-Check-Ergebnisse in js/prices.js
// Aufruf: node tools/merge.mjs <results.json>
// results.json = { date, idealo: { id: result }, used: { id: result }, reject: [ids], notes: { id: text } }
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { CATALOG } from '../js/data.js';

const file = process.argv[2];
const res = JSON.parse(readFileSync(file, 'utf8'));
const out = new URL('../js/prices.js', import.meta.url);

// Bestehende Werte behalten, wenn ein Teil diesmal nicht geprüft wurde
let old = {};
if (existsSync(out)) {
  const m = readFileSync(out, 'utf8').match(/export const PRICES = (\{[\s\S]*\});/);
  if (m) old = JSON.parse(m[1]);
}

const catalogPrice = {};
for (const list of Object.values(CATALOG)) for (const p of list) catalogPrice[p.id] = p.price;

const prices = { ...old };
const report = [];
for (const [id, r] of Object.entries(res.idealo || {})) {
  if ((res.reject || []).includes(id)) { report.push(`✕ ${id}: manuell verworfen`); continue; }
  if (!r.best) { report.push(`– ${id}: ${r.status}`); continue; }
  const ref = catalogPrice[id];
  const ratio = ref ? r.best.total / ref : 1;
  prices[id] = {
    ...(prices[id] || {}),
    price: r.best.total,
    shop: r.best.shop,
    product: r.best.title.slice(0, 120),
    url: r.best.url,
    offers: r.best.valid,
    date: res.date,
    note: res.notes?.[id],
  };
  report.push(`${ratio < 0.55 || ratio > 1.8 ? '⚠' : '✓'} ${id}: ${r.best.total} € (${r.best.shop}) – bisher ${ref} €`);
}
for (const [id, u] of Object.entries(res.used || {})) {
  if (!prices[id]) continue;
  if (u.n >= 2 && u.median) Object.assign(prices[id], { used: u.median, usedMin: u.min, usedN: u.n, usedDate: res.date });
  else { delete prices[id].used; delete prices[id].usedMin; delete prices[id].usedN; }
}
for (const p of Object.values(prices)) for (const k of Object.keys(p)) if (p[k] === undefined) delete p[k];

writeFileSync(out, `// Automatisch erzeugt vom Preis-Check (tools/merge.mjs). Nicht von Hand bearbeiten.
// Neupreis = günstigster geprüfter idealo-Preis inkl. Versand · Gebraucht = Median Kleinanzeigen-Angebote
export const CHECKED = ${JSON.stringify(res.date)};
export const PRICES = ${JSON.stringify(prices, null, 1)};
`);
console.log(report.join('\n'));
console.log(`\n${Object.keys(prices).length} Preise gespeichert.`);
