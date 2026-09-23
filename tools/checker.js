// Preis-Checker – läuft im Browser-Tab auf idealo.de bzw. kleinanzeigen.de (gleiche Domain → fetch erlaubt).
// Wird von Claude per /preischeck in den Tab geladen. Langsam & höflich: eine Anfrage nach der anderen.
window.PC = (() => {
  const norm = (s) => String(s).toLowerCase().replace(/ß/g, 'ss').replace(/[^a-z0-9äöü]/g, '');
  const hasTok = (t, tok) => tok.split('|').some((a) => t.includes(norm(a)));
  const matches = (title, spec, bad) => {
    const t = norm(title);
    return spec.m.every((tok) => hasTok(t, tok)) && !spec.x.some((x) => t.includes(norm(x))) && !bad.some((b) => t.includes(norm(b)));
  };
  const euro = (s) => { const m = String(s).match(/(\d{1,3}(?:\.\d{3})*,\d{2})\s*€/); return m ? +m[1].replace(/\./g, '').replace(',', '.') : null; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
  async function doc(url) {
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return new DOMParser().parseFromString(await r.text(), 'text/html');
  }

  // ---------- idealo: Neupreis ----------
  async function offers(url, spec, bad) {
    const d = await doc(url);
    const rows = [...d.querySelectorAll('li.productOffers-listItem')];
    const all = [];
    for (const li of rows) {
      const title = li.querySelector('.productOffers-listItemTitle')?.textContent.replace(/\s+/g, ' ').trim() || '';
      if (!title) continue;
      let meta = {};
      try { meta = JSON.parse(li.getAttribute('data-mtrx-click') || '{}'); } catch {}
      const txt = li.textContent.replace(/\s+/g, ' ');
      const tm = txt.match(/(\d{1,3}(?:\.\d{3})*,\d{2})\s*€\s*inkl\.\s*Versand/);
      const total = tm ? euro(tm[0]) : meta.products?.[0]?.price;
      const ratings = +(li.querySelector('.productOffers-listItemOfferShopV2NORatings')?.textContent.replace(/\D/g, '') || 0);
      const market = /Marktplatz|Verkauf durch/.test(txt);
      all.push({ title, shop: meta.shop_name || '?', price: meta.products?.[0]?.price ?? null, total, ratings, market, used: /gebraucht|b-ware|refurb|generalüberholt|wie neu|retoure/i.test(txt) });
    }
    const good = [], dropped = [];
    for (const o of all) {
      if (!o.total) continue;
      if (!matches(o.title, spec, bad)) { dropped.push({ ...o, why: 'anderes Produkt/Variante' }); continue; }
      if (o.used) { dropped.push({ ...o, why: 'gebraucht/B-Ware' }); continue; }
      if (o.market && o.ratings < 50) { dropped.push({ ...o, why: `Marktplatz, nur ${o.ratings} Bewertungen` }); continue; }
      if (o.ratings < 20) { dropped.push({ ...o, why: `Shop mit nur ${o.ratings} Bewertungen` }); continue; }
      good.push(o);
    }
    const med = median(good.map((o) => o.total));
    const safe = good.filter((o) => {
      if (med && o.total < med * 0.72) { dropped.push({ ...o, why: `verdächtig billig (Median ${med} €)` }); return false; }
      return true;
    }).sort((a, b) => a.total - b.total);
    return { best: safe[0] || null, count: all.length, valid: safe.length, dropped, median: med };
  }

  async function idealo(id, spec, bad) {
    const d = await doc('/preisvergleich/MainSearchProductCategory.html?q=' + encodeURIComponent(spec.q));
    const cards = [];
    const seen = new Set();
    for (const a of d.querySelectorAll('a[href*="OffersOfProduct"]')) {
      const href = a.getAttribute('href');
      const title = a.textContent.replace(/\s+/g, ' ').trim();
      if (!title || seen.has(href)) continue;
      seen.add(href);
      const card = a.closest('[class*="sr-resultList__item"]');
      const from = euro(card?.textContent.replace(/\s+/g, ' ') || '');
      if (matches(title, spec, bad)) cards.push({ href, title, from });
    }
    if (!cards.length) return { id, status: 'nicht gefunden' };
    cards.sort((a, b) => (a.from ?? 1e9) - (b.from ?? 1e9));
    const tried = [];
    let best = null;
    for (const c of cards.slice(0, spec.n || 1)) {
      await sleep(700);
      const r = await offers(c.href, spec, bad);
      tried.push({ product: c.title, from: c.from, best: r.best?.total, valid: r.valid, count: r.count, dropped: r.dropped.slice(0, 4).map((x) => `${x.total} € ${x.shop}: ${x.why}`) });
      if (r.best && (!best || r.best.total < best.total)) best = { ...r.best, product: c.title, url: c.href };
    }
    return { id, status: best ? 'ok' : 'keine gültigen Angebote', best, tried };
  }

  // ---------- Kleinanzeigen: Gebraucht ----------
  async function used(id, spec, badUsed, newPrice) {
    const d = await doc('/s-' + encodeURIComponent(spec.q.toLowerCase().replace(/\s+/g, '-')) + '/k0');
    const ads = [...d.querySelectorAll('article.aditem')].map((a) => ({
      title: a.querySelector('.ellipsis')?.textContent.trim() || '',
      price: a.querySelector('.aditem-main--middle--price-shipping--price')?.textContent.replace(/\s+/g, ' ').trim() || '',
      desc: a.querySelector('.aditem-main--middle--description')?.textContent.trim().slice(0, 120) || '',
    }));
    const hits = [];
    for (const ad of ads) {
      const p = +((ad.price.match(/[\d.]+/) || ['0'])[0].replace(/\./g, ''));
      const tl = ' ' + ad.title.toLowerCase() + ' ';
      if (!p || !matches(ad.title, spec, [])) continue;
      if (badUsed.some((b) => tl.includes(b))) continue;
      if (/\bneu\b|ovp.*versiegelt|originalverpackt/i.test(ad.title) && !/wie neu/i.test(ad.title)) { /* Neuware privat – trotzdem zählen */ }
      if (newPrice && (p < newPrice * 0.3 || p > newPrice * 1.05)) continue; // Lockpreise / Mondpreise raus
      hits.push({ p, t: ad.title, vb: /VB/.test(ad.price) });
    }
    const prices = hits.map((h) => h.p);
    return { id, n: hits.length, median: median(prices), min: prices.length ? Math.min(...prices) : null, sample: hits.slice(0, 5) };
  }

  async function runIdealo(list, bad) {
    const out = [];
    for (const [id, spec] of list) {
      try { out.push(await idealo(id, spec, bad)); } catch (e) { out.push({ id, status: 'Fehler ' + e.message }); }
      await sleep(900);
    }
    return out;
  }
  async function runUsed(list, badUsed, newPrices) {
    const out = [];
    for (const [id, spec] of list) {
      try { out.push(await used(id, spec, badUsed, newPrices[id])); } catch (e) { out.push({ id, error: e.message }); }
      await sleep(1200);
    }
    return out;
  }
  return { runIdealo, runUsed, norm };
})();
'PC bereit';
