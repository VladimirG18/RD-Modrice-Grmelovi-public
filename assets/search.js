/* ============================================================
   RD Modřice – Grmelovi · fulltextové vyhledávání napříč webem
   ------------------------------------------------------------
   • Lupa v horní liště (prvek s atributem data-search-open), klávesa
     Ctrl/⌘+K nebo „/" otevře vyhledávací okno.
   • Index se staví až v prohlížeči, žádný build: stáhne HTML všech stránek
     (seznam PAGES + odkazy z navigace), rozdělí je podle nadpisů na úseky
     a doplní sdílená data z Firestore (poznámky, požadavky, nástěnky,
     rozpočet, harmonogram) přes REST – aby šlo najít i obsah, který se na
     stránce dokresluje až z databáze. Když je databáze nedostupná, sáhne
     po lokální záloze (localStorage), stejně jako zbytek webu.
   • Hledá se bez ohledu na diakritiku a velikost písmen, po slovech (AND).
   • Kliknutí na výsledek otevře stránku s ?q=… – tam se výskyty zvýrazní,
     stránka odroluje na první z nich a dole se ukáže lišta pro přeskakování
     mezi výskyty (zvýrazní se i obsah, který se dorenderuje z databáze).

   Styl vyhledávacího okna je schválně tady v JS (ne v assets/style.css),
   aby fungoval i na model.html, který má vlastní CSS a design systém
   nenačítá. V style.css je jen tlačítko lupy v liště (.search-btn).
   ============================================================ */

/* ---------- Stránky v indexu ----------
   Nová stránka se sem doplní (a do navigace, viz CLAUDE.md). Odkazy
   z .navlinks se přidávají automaticky, takže na běžnou stránku
   v navigaci se nezapomene ani bez zápisu tady. */
const PAGES = [
  { url:'index.html',               icon:'🏡', title:'Rozcestník' },
  { url:'model.html',               icon:'🏠', title:'3D model' },
  { url:'informace.html',           icon:'ℹ️' },
  { url:'material.html',            icon:'🧱' },
  { url:'dokumentace.html',         icon:'📐' },
  { url:'vizualizace.html',         icon:'🖼️' },
  { url:'inspirace.html',           icon:'💡' },
  { url:'harmonogram.html',         icon:'📅' },
  { url:'stavba.html',              icon:'🏗️' },
  { url:'pripojky.html',            icon:'🔌' },
  { url:'pripojky-elektrina.html',  icon:'⚡' },
  { url:'pripojky-voda.html',       icon:'🚰' },
  { url:'pripojky-plyn.html',       icon:'🔥' },
  { url:'pripojky-kanalizace.html', icon:'🚽' },
  { url:'fotky-stavby.html',        icon:'📷' },
  { url:'checklist.html',           icon:'✅' },
  { url:'poznamky.html',            icon:'📝' },
  { url:'pozadavky.html',           icon:'✏️' },
  { url:'rozpocet.html',            icon:'💰' },
];

const CACHE_KEY = 'rdmodrice-search-index-v1';
const CACHE_TTL = 15 * 60 * 1000;      // stažené stránky drž čtvrt hodiny (jen v rámci záložky)
const RECENT_KEY = 'rdmodrice-search-recent';
const DATA_TTL = 60 * 1000;            // sdílená data z databáze drž minutu
const MAX_RESULTS = 40;

/* ---------- Pomocné funkce ---------- */
const esc = s => (s == null ? '' : String(s)).replace(/[&<>"']/g, m =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
const clean = s => (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim();
const isWordChar = c => !!c && /[\p{L}\p{N}]/u.test(c);

/* Normalizace pro hledání: bez diakritiky, malá písmena – a hlavně
   znak za znak stejně dlouhá jako původní text, aby seděly pozice
   výskytů (podle nich se staví úryvek i zvýraznění). */
function norm(s){
  const str = String(s == null ? '' : s);
  const n = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\u00a0/g, ' ');
  if(n.length === str.length) return n;
  let out = '';
  for(const ch of str){
    let d = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\u00a0/g, ' ');
    if(d.length > ch.length) d = d.slice(0, ch.length);
    while(d.length < ch.length) d += ' ';
    out += d;
  }
  return out;
}

function tokenize(q){
  const t = norm(clean(q)).split(' ').filter(Boolean);
  return t.length > 1 ? t.filter(x => x.length >= 2) : t;
}

/* Výskyty jehly v (normalizovaném) senu – počet, nejlepší pozice
   (přednost má začátek slova) a jestli některý začíná slovo. */
function hits(hay, needle){
  let n = 0, first = -1, best = -1, start = false;
  let i = hay.indexOf(needle);
  while(i !== -1 && n < 12){
    if(first < 0) first = i;
    if(!isWordChar(hay[i - 1])){ start = true; if(best < 0) best = i; }
    n++;
    i = hay.indexOf(needle, i + needle.length);
  }
  return { n, pos: best >= 0 ? best : first, start };
}

/* české skloňování počtů (1 výsledek / 2–4 výsledky / 5+ výsledků) */
function plural(n, one, few, many){ return n === 1 ? one : (n >= 2 && n <= 4 ? few : many); }

function fmtDate(ts){
  const n = Number(ts);
  if(!n) return '';
  try { return new Date(n).toLocaleDateString('cs-CZ'); } catch(e){ return ''; }
}

/* ============================================================
   1) Index statických stránek (stažené HTML)
   ============================================================ */
function pageList(){
  const list = PAGES.map(p => ({ ...p }));
  const known = new Set(list.map(p => p.url));
  document.querySelectorAll('.navlinks a').forEach(a => {
    const href = (a.getAttribute('href') || '').trim();
    if(/^[\w.-]+\.html$/.test(href) && !known.has(href)){
      known.add(href);
      list.push({ url: href, icon:'📄', title: clean(a.textContent) });
    }
  });
  return list;
}

const STRIP = 'script,style,noscript,template,svg,select,datalist,header.site-header,' +
  '.site-footer,.lightbox,.rds-overlay,.rds-hlbar,[hidden],[aria-hidden="true"]';

/* Text prvku – textové uzly spojené mezerou, ať se nadpis se štítkem
   nespojí do jednoho slova („hotovoDetail"). */
function textOf(el){
  const w = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const parts = [];
  for(let n = w.nextNode(); n; n = w.nextNode()) if(n.nodeValue.trim()) parts.push(n.nodeValue);
  return clean(parts.join(' '));
}

/* Rozdělení stránky na úseky podle nadpisů (h1–h3). */
function sections(body){
  const out = [];
  let cur = { h:'', a:'', parts:[] };
  const push = () => {
    const t = clean(cur.parts.join(' ')).slice(0, 6000);
    if(t.length > 1 || cur.h) out.push({ h: cur.h, a: cur.a, t });
  };
  const walker = body.ownerDocument.createTreeWalker(body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let skip = null;
  for(let n = walker.nextNode(); n; n = walker.nextNode()){
    if(skip){ if(skip.contains(n)) continue; skip = null; }
    if(n.nodeType === 1){
      if(/^H[123]$/.test(n.tagName)){
        push();
        const idEl = n.closest('[id]');
        cur = { h: textOf(n), a: idEl ? idEl.id : '', parts: [] };
        skip = n;
      }
      continue;
    }
    if(n.nodeValue && n.nodeValue.trim()) cur.parts.push(n.nodeValue);
  }
  push();
  return out;
}

/* Text schovaný v inline skriptech stránky – část obsahu (třeba dlaždice
   a detaily na stránce Materiály) je zapsaná jako pole v JavaScriptu, ne
   v HTML. Vytáhni z řetězců jen to, co vypadá jako text pro lidi; když
   řetězec začíná nadpisem (<h2>…), použij ho jako název úseku. */
function stripTpl(s){
  let prev;
  do { prev = s; s = s.replace(/\$\{[^{}]*\}/g, ' '); } while(s !== prev);
  return s.includes('${') ? s.slice(0, s.indexOf('${')) : s;
}

function scriptSections(doc){
  const named = [], misc = [];
  doc.querySelectorAll('script:not([src])').forEach(sc => {
    const code = sc.textContent || '';
    if(!code || code.length > 400000) return;
    const re = /`([^`\\]*(?:\\.[^`\\]*)*)`|'([^'\\\n]*(?:\\.[^'\\\n]*)*)'|"([^"\\\n]*(?:\\.[^"\\\n]*)*)"/g;
    let m;
    while((m = re.exec(code))){
      const raw = m[1] || m[2] || m[3] || '';
      if(raw.length < 30) continue;
      const head = /^\s*<(h[1-4])[^>]*>([\s\S]*?)<\/\1>/i.exec(raw);
      const t = clean(stripTpl(raw).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
      if(t.length < 30 || /=>|function\s*\(|\bvar\b/.test(t)) continue;
      if(/^(https?:|data:)/i.test(t)) continue;
      if(t.split(' ').filter(w => /[\p{L}]{2}/u.test(w)).length < 5) continue;
      if(head) named.push({ h: clean(head[2].replace(/<[^>]*>/g, ' ')), a:'', t });
      else misc.push(t);
    }
  });
  if(misc.length) named.push({ h:'', a:'', t: misc.join(' · ') });
  return named;
}

async function fetchPage(p){
  const res = await fetch(p.url, { credentials:'same-origin' });
  if(!res.ok) throw new Error(p.url + ' → ' + res.status);
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const extra = scriptSections(doc);
  doc.body.querySelectorAll(STRIP).forEach(el => el.remove());
  const title = p.title || clean(doc.title).replace(/^RD Modřice\s*[–—-]\s*/, '') || p.url;
  return [...sections(doc.body), ...extra].map(s => ({
    u: p.url, p: title, i: p.icon || '📄', h: s.h, a: s.a, t: s.t, k:'page'
  }));
}

async function buildPageIndex(){
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if(raw){
      const c = JSON.parse(raw);
      if(c && Array.isArray(c.e) && Date.now() - c.t < CACHE_TTL) return c.e;
    }
  } catch(e){}

  const all = [];
  await Promise.all(pageList().map(p =>
    fetchPage(p).then(rows => all.push(...rows)).catch(err => console.warn('Hledání:', err))
  ));
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), e: all })); } catch(e){}
  return all;
}

/* ============================================================
   2) Index sdílených dat (Firestore REST, fallback localStorage)
   ============================================================ */
const SOURCES = [
  { coll:'poznamky', page:'poznamky.html', icon:'📝', label:'Poznámky',
    fields:['author','text','ts'], local:'rdmodrice-poznamky-v1',
    row: d => ({ h: [d.author, fmtDate(d.ts)].filter(Boolean).join(' · '), t: d.text }) },

  { coll:'pozadavky', page:'pozadavky.html', icon:'✏️', label:'Požadavky',
    fields:['author','text','area','status','kind','ts'], local:'rdmodrice-pozadavky-v1',
    row: (d, L) => ({
      h: [L.area(d.area), L.kind(d.kind), L.pozStatus(d.status), d.author].filter(Boolean).join(' · '),
      t: [d.text, L.area(d.area), L.kind(d.kind), L.pozStatus(d.status), d.author, fmtDate(d.ts)].filter(Boolean).join(' · ') }) },

  { coll:'vizualizace', page:'vizualizace.html', icon:'🖼️', label:'Vizualizace',
    fields:['title','note','cat','author','ts'], local:'rdmodrice-vizualizace-v1',
    row: (d, L) => ({ h: clean(d.title) || 'Obrázek',
      t: [d.title, d.note, L.cat(d.cat), d.author, fmtDate(d.ts)].filter(Boolean).join(' · ') }) },

  { coll:'inspirace', page:'inspirace.html', icon:'💡', label:'Inspirace',
    fields:['title','note','cat','author','ts'], local:'rdmodrice-inspirace-v1',   // `src` ne – u nahraných obrázků je to celý obrázek
    row: (d, L) => ({ h: clean(d.title) || 'Odkaz',
      t: [d.title, d.note, L.cat(d.cat), d.author, shortUrl(d.src), fmtDate(d.ts)].filter(Boolean).join(' · ') }) },

  { coll:'rozpocet', page:'rozpocet.html', icon:'💰', label:'Rozpočet',
    fields:['name','note','category','unit','qty','priceOff','priceUnoff','link'], local:'rdmodrice-rozpocet-items-v1',
    row: (d, L) => ({ h: [clean(d.name), L.budget(d.category)].filter(Boolean).join(' · '),
      t: [d.name, d.note, L.budget(d.category),
          d.qty != null ? `${d.qty} ${d.unit || ''}` : '',
          d.priceOff != null ? `oficiální ${d.priceOff} Kč` : '',
          d.priceUnoff != null ? `neoficiální ${d.priceUnoff} Kč` : '',
          shortUrl(d.link)].filter(Boolean).join(' · ') }) },

  { coll:'fotky', page:'fotky-stavby.html', icon:'📷', label:'Fotky ze stavby',
    fields:['caption','date','author','ts'], local:'rdmodrice-fotky-v1',   // `thumb` ne – to je náhled fotky
    row: (d, L) => ({ h: [L.day(d.date), d.author].filter(Boolean).join(' · '),
      t: [d.caption, L.day(d.date), d.date, d.author].filter(Boolean).join(' · ') }) },

  { coll:'harmonogram_faze', page:'harmonogram.html', icon:'📅', label:'Harmonogram',
    fields:['name','note','when','status','budgetCat'], local:'rdmodrice-harmonogram-faze-v1',
    row: (d, L) => ({ h: [clean(d.name), d.when].filter(Boolean).join(' · '),
      t: [d.name, d.note, d.when, L.hgStatus(d.status), L.budget(d.budgetCat)].filter(Boolean).join(' · ') }) },

  { coll:'harmonogram_kroky', page:'harmonogram.html', icon:'📅', label:'Harmonogram – kroky',
    fields:['text','when','status'], local:'rdmodrice-harmonogram-kroky-v1',
    row: (d, L) => ({ h: clean(d.text).slice(0, 70),
      t: [d.text, d.when, L.hgStatus(d.status)].filter(Boolean).join(' · ') }) },
];

function shortUrl(u){
  const s = clean(u);
  if(!s || /^data:/i.test(s) || s.length > 200) return '';
  try { return new URL(s).hostname.replace(/^www\./, ''); } catch(e){ return s.slice(0, 80); }
}

/* Popisky kategorií/stavů si půjč z modulů, které je už definují –
   ať se nemusí udržovat na dvou místech. Načítají se až při hledání. */
async function labels(){
  const [poz, brd, roz, hg, fot] = await Promise.all([
    import('./pozadavky.js').catch(() => null),
    import('./board.js').catch(() => null),
    import('./rozpocet.js').catch(() => null),
    import('./harmonogram.js').catch(() => null),
    import('./fotky.js').catch(() => null),
  ]);
  const byId = (arr, id) => {
    if(!id || !Array.isArray(arr)) return id ? String(id) : '';
    const f = arr.find(x => x.id === id);
    return f ? f.name : String(id);
  };
  return {
    area:      id => byId(poz && poz.AREAS, id),
    kind:      id => byId(poz && poz.KINDS, id),
    pozStatus: id => byId(poz && poz.STATUSES, id),
    cat:       id => byId(brd && brd.CATS, id),
    budget:    id => byId(roz && roz.DEFAULT_CATEGORIES, id),
    hgStatus:  id => byId(hg && hg.STATUSES, id),
    day:       iso => (fot && fot.fmtDay ? fot.fmtDay(iso) : (iso || '')),
  };
}

function firestoreUrl(cfg, src){
  const qs = new URLSearchParams();
  qs.set('key', cfg.apiKey);
  qs.set('pageSize', '300');
  src.fields.forEach(f => qs.append('mask.fieldPaths', f));   // ať se netahají náhledy obrázků
  return `https://firestore.googleapis.com/v1/projects/${cfg.projectId}` +
         `/databases/(default)/documents/${src.coll}?${qs.toString()}`;
}

/* Firestore REST vrací „typované" hodnoty (stringValue, mapValue…). */
function unwrap(v){
  if(!v || typeof v !== 'object') return null;
  if('stringValue' in v) return v.stringValue;
  if('integerValue' in v) return Number(v.integerValue);
  if('doubleValue' in v) return v.doubleValue;
  if('booleanValue' in v) return v.booleanValue;
  if('timestampValue' in v) return v.timestampValue;
  if('nullValue' in v) return null;
  if('arrayValue' in v) return (v.arrayValue.values || []).map(unwrap);
  if('mapValue' in v){
    const o = {}, f = v.mapValue.fields || {};
    for(const k in f) o[k] = unwrap(f[k]);
    return o;
  }
  return null;
}

function fromLocal(src){
  try {
    const arr = JSON.parse(localStorage.getItem(src.local) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch(e){ return []; }
}

async function loadSource(src, cfg){
  if(cfg && cfg.apiKey && cfg.projectId){
    try {
      const res = await fetch(firestoreUrl(cfg, src));
      if(res.ok){
        const j = await res.json();
        const docs = (j.documents || []).map(d => {
          const o = {}, f = d.fields || {};
          for(const k in f) o[k] = unwrap(f[k]);
          return o;
        });
        if(docs.length) return docs;
      }
    } catch(e){ console.warn('Hledání – databáze nedostupná:', src.coll, e); }
  }
  return fromLocal(src);   // záloha v prohlížeči (stejně jako zbytek webu)
}

let dataCache = { t: 0, e: [] };

async function buildDataIndex(){
  if(Date.now() - dataCache.t < DATA_TTL) return dataCache.e;
  let cfg = null;
  try { cfg = (await import('./firebase-config.js')).firebaseConfig; } catch(e){}
  const L = await labels();
  const all = [];
  await Promise.all(SOURCES.map(async src => {
    const docs = await loadSource(src, cfg);
    docs.forEach(d => {
      let r;
      try { r = src.row(d, L); } catch(e){ return; }
      const t = clean(r.t);
      if(!t) return;
      all.push({ u: src.page, p: src.label, i: src.icon, h: clean(r.h), a:'', t, k:'data' });
    });
  }));
  dataCache = { t: Date.now(), e: all };
  return all;
}

/* ---------- Sestavení indexu ----------
   Stránky a sdílená data se staví zvlášť: výsledky ze stránek se ukážou
   hned, data z databáze se přidají, jakmile dojdou. */
let pagesPromise = null, dataPromise = null;

function prepare(entries){
  entries.forEach(e => {
    e.nh = norm(e.p + ' ' + e.h);
    e.nt = norm(e.t);
  });
  return entries;
}

function pageEntries(){
  if(!pagesPromise){
    pagesPromise = buildPageIndex().then(prepare)
      .catch(err => { console.warn('Hledání – stránky:', err); pagesPromise = null; return []; });
  }
  return pagesPromise;
}

let dataLoading = false;

function dataEntries(){
  // po minutě si data načti znovu (mohly přibýt poznámky) – ale ne, když se právě načítají
  if(dataPromise && !dataLoading && Date.now() - dataCache.t > DATA_TTL) dataPromise = null;
  if(!dataPromise){
    dataLoading = true;
    dataPromise = buildDataIndex().then(prepare)
      .catch(err => { console.warn('Hledání – sdílená data:', err); dataPromise = null; return []; })
      .finally(() => { dataLoading = false; });
  }
  return dataPromise;
}

function ensureIndex(){
  return Promise.all([pageEntries(), dataEntries()]).then(([a, b]) => [...a, ...b]);
}

/* ============================================================
   3) Vlastní hledání + úryvky
   ============================================================ */
function scoreEntry(e, tokens, nq){
  let score = 0, anchor = -1, anchorLen = 0;
  for(const t of tokens){
    const h = hits(e.nh, t);
    const b = hits(e.nt, t);
    if(!h.n && !b.n) return null;                       // každé slovo musí někde být
    if(h.n) score += (h.start ? 26 : 12) + Math.min(h.n, 3);
    if(b.n){
      score += (b.start ? 8 : 4) + Math.min(b.n, 6) * 0.5;
      if(t.length > anchorLen || (t.length === anchorLen && b.pos < anchor)){
        anchor = b.pos; anchorLen = t.length;
      }
    }
  }
  if(tokens.length > 1){
    if(e.nh.includes(nq)) score += 22;
    if(e.nt.includes(nq)) score += 14;
  }
  if(e.h && norm(e.h) === nq) score += 30;              // přesný nadpis
  return { score, anchor };
}

function mergeRanges(ranges){
  ranges.sort((a, b) => a[0] - b[0]);
  const out = [];
  for(const r of ranges){
    const last = out[out.length - 1];
    if(last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

function rangesIn(ntext, tokens, from, to){
  const out = [];
  for(const t of tokens){
    let i = ntext.indexOf(t, from);
    while(i !== -1 && i < to){
      out.push([i, Math.min(i + t.length, to)]);
      i = ntext.indexOf(t, i + t.length);
    }
  }
  return mergeRanges(out);
}

function snippet(e, tokens, anchor){
  const text = e.t, nt = e.nt;
  if(!text) return '';
  let from = 0, to = Math.min(text.length, 190);
  if(anchor >= 0){
    from = Math.max(0, anchor - 70);
    to = Math.min(text.length, from + 210);
    if(from > 0){                                        // dorovnej na hranici slova
      const sp = text.indexOf(' ', from);
      if(sp !== -1 && sp - from < 18) from = sp + 1;
    }
    if(to < text.length){
      const sp = text.lastIndexOf(' ', to);
      if(sp > from && to - sp < 18) to = sp;
    }
  }
  const parts = rangesIn(nt, tokens, from, to);
  let html = '', cur = from;
  for(const [s, t2] of parts){
    html += esc(text.slice(cur, s)) + '<mark>' + esc(text.slice(s, t2)) + '</mark>';
    cur = t2;
  }
  html += esc(text.slice(cur, to));
  return (from > 0 ? '… ' : '') + html + (to < text.length ? ' …' : '');
}

function runSearch(entries, q){
  const nq = norm(clean(q));
  const tokens = tokenize(q);
  if(!tokens.length) return [];
  const out = [];
  for(const e of entries){
    const s = scoreEntry(e, tokens, nq);
    if(s) out.push({ e, score: s.score, snip: snippet(e, tokens, s.anchor) });
  }
  out.sort((a, b) => b.score - a.score || a.e.p.localeCompare(b.e.p, 'cs'));
  return out.slice(0, MAX_RESULTS);
}

function resultUrl(e, q){
  const hash = e.a ? '#' + e.a : '';
  return `${e.u}?q=${encodeURIComponent(q)}${hash}`;
}

/* ============================================================
   4) Vyhledávací okno
   ============================================================ */
const CSS = `
.rds-overlay{ position:fixed; inset:0; z-index:9999; display:flex; justify-content:center;
  align-items:flex-start; padding:10vh 16px 16px; background:rgba(8,12,18,.55);
  backdrop-filter:blur(3px); -webkit-backdrop-filter:blur(3px); }
.rds-overlay[hidden]{ display:none; }
.rds-modal{ width:min(720px,100%); max-height:78vh; display:flex; flex-direction:column; overflow:hidden;
  background:var(--surface,#151c25); color:var(--text,#e7edf4);
  border:1px solid var(--border,#27313f); border-radius:var(--radius-lg,18px);
  box-shadow:0 22px 60px rgba(0,0,0,.45); font-size:15px; }
.rds-bar{ display:flex; align-items:center; gap:10px; padding:12px 14px;
  border-bottom:1px solid var(--border,#27313f); }
.rds-bar .rds-ic{ font-size:1.05rem; }
.rds-bar input{ flex:1 1 auto; min-width:0; border:0; outline:0; background:transparent;
  color:inherit; font:inherit; font-size:1.02rem; padding:4px 0; }
.rds-bar input::-webkit-search-cancel-button{ display:none; }
.rds-x{ flex:0 0 auto; border:1px solid var(--border,#27313f); background:var(--surface-2,#1c2531);
  color:var(--muted,#93a0b1); border-radius:8px; padding:3px 8px; font:inherit; font-size:.74rem; cursor:pointer; }
.rds-x:hover{ color:var(--text,#e7edf4); }
.rds-results{ overflow-y:auto; padding:6px; }
.rds-group{ padding:10px 10px 4px; font-size:.7rem; font-weight:700; letter-spacing:.08em;
  text-transform:uppercase; color:var(--muted,#93a0b1); }
.rds-item{ display:flex; gap:10px; align-items:flex-start; padding:9px 10px; border-radius:10px;
  color:inherit; text-decoration:none; cursor:pointer; }
.rds-item:hover, .rds-item.sel{ background:var(--surface-2,#1c2531); text-decoration:none; }
.rds-item.sel{ box-shadow:inset 0 0 0 1px var(--border-strong,#38455a); }
.rds-item .rds-i{ flex:0 0 auto; font-size:1.05rem; line-height:1.4; }
.rds-item .rds-main{ min-width:0; flex:1 1 auto; }
.rds-ttl{ font-weight:600; font-size:.93rem; line-height:1.35; }
.rds-ttl .rds-page{ color:var(--muted,#93a0b1); font-weight:500; }
.rds-ttl .rds-arrow{ color:var(--muted,#93a0b1); margin:0 5px; }
.rds-snip{ display:block; margin-top:2px; font-size:.83rem; color:var(--muted,#93a0b1); line-height:1.45;
  overflow-wrap:anywhere; }
.rds-snip mark, .rds-ttl mark{ background:var(--accent-soft,#5b9dff26); color:var(--accent-ink,#8db9ff);
  border-radius:3px; padding:0 1px; }
.rds-msg{ padding:22px 14px; text-align:center; color:var(--muted,#93a0b1); font-size:.9rem; }
.rds-foot{ display:flex; gap:10px; justify-content:space-between; align-items:center; flex-wrap:wrap;
  padding:8px 14px; border-top:1px solid var(--border,#27313f); color:var(--muted,#93a0b1); font-size:.74rem; }
.rds-foot kbd{ font:inherit; border:1px solid var(--border,#27313f); border-radius:5px;
  padding:0 4px; background:var(--surface-2,#1c2531); }
.rds-chip{ display:inline-block; border:1px solid var(--border,#27313f); background:var(--surface-2,#1c2531);
  color:inherit; border-radius:999px; padding:4px 11px; margin:0 6px 6px 0; font-size:.82rem; cursor:pointer; }
.rds-chip:hover{ border-color:var(--accent,#5b9dff); }
.rds-chips{ padding:4px 10px 10px; }

/* zvýraznění nalezených výskytů na stránce */
mark.rds-hit{ background:var(--accent-soft,#5b9dff26); color:inherit; border-radius:3px;
  padding:0 1px; box-shadow:inset 0 0 0 1px var(--border-strong,#38455a); }
mark.rds-hit.rds-cur{ background:var(--accent,#5b9dff); color:#04121f; }
/* položky rozpočtu a harmonogramu jsou v editovatelných polích – tam se text
   zvýraznit nedá, tak se orámuje celé políčko */
.rds-hit-field{ outline:2px solid var(--accent-soft,#5b9dff26); outline-offset:1px; border-radius:5px; }
.rds-hit-field.rds-cur{ outline-color:var(--accent,#5b9dff); }
.rds-hlbar{ position:fixed; left:50%; bottom:16px; transform:translateX(-50%); z-index:60;
  display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:center;
  max-width:calc(100% - 24px); padding:7px 10px; border-radius:12px;
  background:var(--surface,#151c25); color:var(--text,#e7edf4);
  border:1px solid var(--border,#27313f); box-shadow:0 10px 30px rgba(0,0,0,.35); font-size:.82rem; }
.rds-hlbar[hidden]{ display:none; }
.rds-hlbar button{ border:1px solid var(--border,#27313f); background:var(--surface-2,#1c2531);
  color:inherit; border-radius:8px; padding:3px 9px; font:inherit; font-size:.82rem; cursor:pointer; }
.rds-hlbar button:hover{ border-color:var(--accent,#5b9dff); }
.rds-hlbar .rds-hl-q{ font-weight:600; }
.rds-hlbar .rds-hl-n{ color:var(--muted,#93a0b1); font-variant-numeric:tabular-nums; }
@media (max-width:560px){
  .rds-overlay{ padding:0; }
  .rds-modal{ width:100%; max-height:100%; height:100%; border-radius:0; border:0; }
}`;

function injectCss(){
  if(document.getElementById('rds-css')) return;
  const st = document.createElement('style');
  st.id = 'rds-css';
  st.textContent = CSS;
  document.head.appendChild(st);
}

let ui = null;

function recent(){
  try { const a = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(a) ? a : []; }
  catch(e){ return []; }
}
function rememberQuery(q){
  const s = clean(q);
  if(s.length < 2) return;
  try {
    const list = [s, ...recent().filter(x => x.toLowerCase() !== s.toLowerCase())].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch(e){}
}

function buildUi(){
  if(ui) return ui;
  injectCss();
  const root = document.createElement('div');
  root.className = 'rds-overlay';
  root.hidden = true;
  root.innerHTML = `
    <div class="rds-modal" role="dialog" aria-modal="true" aria-label="Hledání na webu">
      <div class="rds-bar">
        <span class="rds-ic" aria-hidden="true">🔍</span>
        <input type="search" id="rdsInput" autocomplete="off" autocapitalize="off" spellcheck="false"
               placeholder="Hledat na webu – materiál, termín, poznámka, položka rozpočtu…"
               aria-label="Hledaný výraz" />
        <button class="rds-x" type="button" data-rds="close">Esc</button>
      </div>
      <div class="rds-results" id="rdsResults"></div>
      <div class="rds-foot">
        <span><kbd>↑</kbd><kbd>↓</kbd> výběr · <kbd>⏎</kbd> otevřít · <kbd>Esc</kbd> zavřít</span>
        <span id="rdsStat"></span>
      </div>
    </div>`;
  document.body.appendChild(root);

  ui = {
    root,
    input: root.querySelector('#rdsInput'),
    list: root.querySelector('#rdsResults'),
    stat: root.querySelector('#rdsStat'),
    results: [],
    sel: -1,
    entries: null,   // sloučené položky (stránky + sdílená data)
    pages: null,
    data: null,
  };

  root.addEventListener('click', e => {
    if(e.target === root || e.target.closest('[data-rds="close"]')) closeSearch();
  });

  let timer = null;
  ui.input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(render, 60);
  });

  ui.input.addEventListener('keydown', e => {
    if(e.key === 'ArrowDown'){ e.preventDefault(); move(1); }
    else if(e.key === 'ArrowUp'){ e.preventDefault(); move(-1); }
    else if(e.key === 'Enter'){
      const a = ui.list.querySelector('.rds-item.sel') || ui.list.querySelector('.rds-item');
      if(a){ e.preventDefault(); rememberQuery(ui.input.value); location.href = a.getAttribute('href'); }
    }
  });

  ui.list.addEventListener('click', e => {
    const chip = e.target.closest('[data-q]');
    if(chip){ e.preventDefault(); ui.input.value = chip.dataset.q; ui.input.focus(); render(); return; }
    const item = e.target.closest('.rds-item');
    if(item) rememberQuery(ui.input.value);
  });

  return ui;
}

function move(dir){
  const items = Array.from(ui.list.querySelectorAll('.rds-item'));
  if(!items.length) return;
  ui.sel = Math.max(0, Math.min(items.length - 1, ui.sel + dir));
  items.forEach((el, i) => el.classList.toggle('sel', i === ui.sel));
  items[ui.sel].scrollIntoView({ block:'nearest' });
}

function emptyState(){
  const rec = recent();
  const pages = pageList();
  return (rec.length ? `<div class="rds-group">Poslední hledání</div><div class="rds-chips">` +
      rec.map(q => `<button class="rds-chip" type="button" data-q="${esc(q)}">${esc(q)}</button>`).join('') +
      `</div>` : '') +
    `<div class="rds-group">Stránky</div>` +
    pages.map(p => `<a class="rds-item" href="${esc(p.url)}">
        <span class="rds-i">${p.icon || '📄'}</span>
        <span class="rds-main"><span class="rds-ttl">${esc(p.title || p.url.replace('.html', ''))}</span></span>
      </a>`).join('');
}

function loading(){ return ui.data ? '' : ' · načítám sdílená data…'; }

function render(){
  const q = ui.input.value;
  ui.sel = -1;
  if(!clean(q)){
    ui.list.innerHTML = emptyState();
    const n = ui.entries ? ui.entries.length : 0;
    ui.stat.textContent = (ui.entries ? `${n} ${plural(n, 'úsek', 'úseky', 'úseků')} v indexu` : 'Připravuji index…') + loading();
    return;
  }
  if(!ui.entries){
    ui.list.innerHTML = `<div class="rds-msg">Připravuji vyhledávání…</div>`;
    ui.stat.textContent = '';
    return;
  }
  const res = runSearch(ui.entries, q);
  ui.results = res;
  if(!res.length){
    ui.list.innerHTML = `<div class="rds-msg">Nic nenalezeno.<br />Zkus jiné slovo nebo jen jeho začátek – diakritika ani velikost písmen nevadí.</div>`;
    ui.stat.textContent = 'žádný výsledek' + loading();
    return;
  }
  ui.list.innerHTML = res.map(r => `
    <a class="rds-item" href="${esc(resultUrl(r.e, q))}">
      <span class="rds-i" aria-hidden="true">${r.e.i}</span>
      <span class="rds-main">
        <span class="rds-ttl">${r.e.h ? `${esc(r.e.h)}<span class="rds-arrow">·</span><span class="rds-page">${esc(r.e.p)}</span>`
                                      : esc(r.e.p)}</span>
        <span class="rds-snip">${r.snip}</span>
      </span>
    </a>`).join('');
  const capped = res.length === MAX_RESULTS;
  ui.stat.textContent = `${res.length}${capped ? '+' : ''} ` +
    (capped ? 'výsledků' : plural(res.length, 'výsledek', 'výsledky', 'výsledků')) + loading();
}

let opener = null;

function openSearch(prefill){
  buildUi();
  opener = document.activeElement;
  ui.root.hidden = false;
  document.documentElement.style.overflow = 'hidden';
  if(prefill != null) ui.input.value = prefill;
  ui.input.focus();
  ui.input.select();
  render();

  const merge = () => {
    if(!ui.pages) return;
    ui.entries = ui.data ? [...ui.pages, ...ui.data] : ui.pages;
    if(!ui.root.hidden) render();
  };
  if(!ui.pages) pageEntries().then(e => { ui.pages = e; merge(); });
  if(!ui.data)  dataEntries().then(e => { ui.data = e; merge(); });
}

function closeSearch(){
  if(!ui || ui.root.hidden) return;
  ui.root.hidden = true;
  document.documentElement.style.overflow = '';
  ui.input.blur();                       // ať „/" zase otevírá hledání
  if(opener && document.contains(opener)) { try { opener.focus(); } catch(e){} }
  opener = null;
}

/* ============================================================
   5) Zvýraznění výskytů na stránce (příchod z výsledků – ?q=…)
   ============================================================ */
const HL_ROOTS = '.content, .hubwrap, .hero';
const FIELDS = 'input[type="text"], input[type="search"], input:not([type]), textarea';
let hl = { tokens: [], marks: [], cur: -1, bar: null, observer: null, pending: null, runs: 0 };

function hlSkip(node){
  const p = node.parentElement;
  if(!p) return true;
  return !!p.closest('mark.rds-hit, script, style, textarea, select, option, optgroup,' +
    ' .rds-overlay, .rds-hlbar, [hidden]');
}

function markAll(){
  const added = [];
  if(!hl.tokens.length) return added;
  document.querySelectorAll(HL_ROOTS).forEach(root => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => (!n.nodeValue || !n.nodeValue.trim() || hlSkip(n))
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    const nodes = [];
    for(let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
    for(const node of nodes){
      const text = node.nodeValue;
      const parts = rangesIn(norm(text), hl.tokens, 0, text.length);
      if(!parts.length) continue;
      const frag = document.createDocumentFragment();
      let cur = 0;
      for(const [s, e] of parts){
        if(s > cur) frag.appendChild(document.createTextNode(text.slice(cur, s)));
        const m = document.createElement('mark');
        m.className = 'rds-hit';
        m.textContent = text.slice(s, e);
        frag.appendChild(m);
        added.push(m);
        cur = e;
      }
      if(cur < text.length) frag.appendChild(document.createTextNode(text.slice(cur)));
      node.parentNode.replaceChild(frag, node);
    }

    // text v editovatelných polích (položky rozpočtu, kroky harmonogramu)
    root.querySelectorAll(FIELDS).forEach(el => {
      const v = el.value || '';
      const hit = !!v && rangesIn(norm(v), hl.tokens, 0, v.length).length > 0;
      if(hit && !el.classList.contains('rds-hit-field')) added.push(el);
      el.classList.toggle('rds-hit-field', hit);
      if(!hit) el.classList.remove('rds-cur');
    });
  });
  return added;
}

/* Když odkaz z výsledků míří na konkrétní úsek (#kotva), začni prvním
   výskytem v něm – ne prvním na stránce. */
function hlFirstIndex(){
  let target = null;
  try {
    const id = decodeURIComponent((location.hash || '').slice(1));
    if(id) target = document.getElementById(id);
  } catch(e){}
  if(target){
    const i = hl.marks.findIndex(m =>
      target.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING);
    if(i >= 0) return i;
  }
  return 0;
}

/* Do počítání a přeskakování ber jen výskyty, které jsou opravdu vidět
   (ne skryté záložky, sbalené panely apod.). */
const hlVisible = m => m.getClientRects().length > 0;

function hlRefresh(scroll){
  const added = markAll();
  if(!added.length && hl.marks.length) return;
  hl.marks = Array.from(document.querySelectorAll('mark.rds-hit, .rds-hit-field')).filter(hlVisible);
  if(hl.bar) hlCount();
  if(scroll && hl.marks.length && hl.cur < 0) hlGo(hlFirstIndex());
}

function hlCount(){
  if(!hl.bar) return;
  const n = hl.marks.length;
  hl.bar.querySelector('.rds-hl-n').textContent = n ? `${Math.min(hl.cur + 1, n)} / ${n}` : 'nenalezeno';
}

function hlGo(i){
  if(!hl.marks.length) return;
  hl.cur = (i + hl.marks.length) % hl.marks.length;
  hl.marks.forEach((m, k) => m.classList.toggle('rds-cur', k === hl.cur));
  hl.marks[hl.cur].scrollIntoView({ block:'center', behavior:'smooth' });
  hlCount();
}

function hlClear(){
  document.querySelectorAll('mark.rds-hit').forEach(m => {
    const t = document.createTextNode(m.textContent);
    m.parentNode.replaceChild(t, m);
    t.parentNode.normalize();
  });
  document.querySelectorAll('.rds-hit-field').forEach(el => el.classList.remove('rds-hit-field', 'rds-cur'));
  hl.marks = []; hl.cur = -1; hl.tokens = [];
  if(hl.pending){ clearTimeout(hl.pending); hl.pending = null; }
  if(hl.observer){ hl.observer.disconnect(); hl.observer = null; }
  if(hl.bar){ hl.bar.remove(); hl.bar = null; }
  dropQueryParam();
}

function hlBar(q){
  const bar = document.createElement('div');
  bar.className = 'rds-hlbar';
  bar.innerHTML = `
    <span class="rds-hl-q">„${esc(q)}"</span>
    <span class="rds-hl-n"></span>
    <button type="button" data-hl="prev" aria-label="Předchozí výskyt">‹</button>
    <button type="button" data-hl="next" aria-label="Další výskyt">›</button>
    <button type="button" data-hl="again">🔍 Hledat znovu</button>
    <button type="button" data-hl="close">✕ Zrušit</button>`;
  bar.addEventListener('click', e => {
    const b = e.target.closest('[data-hl]');
    if(!b) return;
    if(b.dataset.hl === 'next') hlGo(hl.cur + 1);
    else if(b.dataset.hl === 'prev') hlGo(hl.cur - 1);
    else if(b.dataset.hl === 'again') openSearch(q);
    else hlClear();
  });
  document.body.appendChild(bar);
  return bar;
}

function dropQueryParam(){
  try {
    const url = new URL(location.href);
    url.searchParams.delete('q');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch(e){}
}

function highlightFromUrl(){
  let q = '';
  try { q = new URLSearchParams(location.search).get('q') || ''; } catch(e){}
  if(!clean(q)) return;
  // stránky bez běžného obsahu (3D model) nezvýrazňujeme – ať v odkazu nezůstává dotaz
  hl.tokens = document.querySelector(HL_ROOTS) ? tokenize(q).filter(t => t.length >= 2) : [];
  if(!hl.tokens.length){ dropQueryParam(); return; }
  injectCss();

  hl.bar = hlBar(clean(q));
  hlRefresh(true);

  // obsah z databáze se dorenderuje později – zvýrazni ho, až doběhne
  hl.observer = new MutationObserver(() => {
    if(hl.pending || hl.runs > 25) return;
    hl.pending = setTimeout(() => {
      hl.pending = null; hl.runs++;
      const obs = hl.observer;
      if(!obs) return;
      obs.disconnect();
      hlRefresh(true);
      if(hl.observer) obs.observe(document.body, { childList:true, subtree:true });
    }, 350);
  });
  hl.observer.observe(document.body, { childList:true, subtree:true });
  setTimeout(() => { if(hl.observer){ hl.observer.disconnect(); hl.observer = null; } }, 30000);
}

/* ============================================================
   6) Napojení na stránku
   ============================================================ */
function init(){
  document.querySelectorAll('[data-search-open]').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); openSearch(''); });
  });

  document.addEventListener('keydown', e => {
    const open = ui && !ui.root.hidden;
    if(e.key === 'Escape' && open){ e.stopPropagation(); closeSearch(); return; }
    if(e.key === 'Escape' && hl.bar){ hlClear(); return; }   // Esc zruší i zvýraznění na stránce
    if((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')){
      e.preventDefault(); e.stopPropagation();
      open ? closeSearch() : openSearch('');
      return;
    }
    if(e.key === '/' && !open && !e.ctrlKey && !e.metaKey && !e.altKey){
      const t = e.target;
      const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if(typing || document.pointerLockElement) return;   // v modelu při procházce needitujeme
      e.preventDefault();
      openSearch('');
    }
  }, true);

  highlightFromUrl();
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

/* testovací háček – ať jde vyhledávání ověřit z automatického testu */
window.__search = { open: openSearch, close: closeSearch, index: ensureIndex, run: runSearch, norm };
