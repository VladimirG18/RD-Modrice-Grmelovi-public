/* ============================================================
   RD Modřice – Grmelovi · Postup stavby (stavba.html)
   Časová osa se skládá živě z harmonogramu (fáze + dílčí kroky),
   ke každé fázi se přiřadí fotky (uložená fáze, jinak podle data)
   a součet z navázané kategorie rozpočtu. Jen čte – upravuje se
   v Harmonogramu a ve Fotkách ze stavby.
   ============================================================ */
import { esc, online, loadTimeline, listDocs, getDocsById, localList, pluralCz, fmtDay, agoCz,
         effectivePhase, phaseForDate } from './data.js';
import { fmtMoney, itemEstimateTotal, DEFAULT_CATEGORIES } from './rozpocet.js';

const $ = id => document.getElementById(id);
const STEP_ICON = { planovano:'📋', probiha:'🛠️', hotovo:'✅' };
const STATE = { hotovo:['done','hotovo'], probiha:['active','probíhá'], planovano:['','plánováno'] };
const CAT_BY_ID = Object.fromEntries(DEFAULT_CATEGORIES.map(c => [c.id, c]));

/* Ručně psaná historie a odkazy, které v harmonogramu nejsou – přiřadí se
   k fázi podle názvu. Nové záznamy stačí dopsat sem. */
const EXTRA = [
  { match:/projektov/i, items:[
      ['07/2023', 'zpracována kompletní dokumentace pro ohlášení stavby (Ing. arch. Bradáč a kol.) – půdorysy, řez, pohledy, situace, technická zpráva'] ],
    links:[['dokumentace.html', '📐 Výkresy z dokumentace']] },
  { match:/průzkum/i, items:[
      ['10/2024', 'radonový průzkum (střední index) a hydrogeologické posouzení vsakování'],
      ['10/2024', 'požárně bezpečnostní řešení'],
      ['10/2024', 'koordinační situace s přípojkami vody a plynu'] ] },
  { match:/povolen/i, items:[
      ['2024', 'vyjádření správců sítí, kladné vyjádření BVK (8/2024)'],
      ['2024', 'uzavřeny smlouvy o připojení k distribučním soustavám (elektřina, plyn)'],
      ['9. 6. 2026', 'vydáno stavební povolení na dům (řízení R/2026/4233)'],
      ['11. 7. 2026', 'stavební povolení nabylo právní moci (potvrzeno úřadem 10. 8. 2026)'],
      ['11. 8. 2026', 'obdržen štítek „stavba povolena“'] ] },
  { match:/přípoj/i, items:[],
    links:[['pripojky.html', '🔌 Stav přípojek'], ['pripojky-elektrina.html', '⚡ Elektřina'],
           ['pripojky-plyn.html', '🔥 Plyn'], ['pripojky-voda.html', '🚰 Voda'], ['pripojky-kanalizace.html', '🚽 Kanalizace']] },
  { match:/základ/i, items:[
      ['31. 8. – 4. 9. 2026', 'postupné odkrývání a kopání základových rýh'],
      ['6. 9. 2026', 'rýhy vykopané, hromada suti z bouraček, svazky armovací kari sítě připravené, výstražná páska kolem výkopu'] ] },
];
const extraFor = p => EXTRA.filter(e => e.match.test(p.name || ''));

let T = { phases:[], kroky:[] }, photos = [], budget = null, tasks = [], diary = [];
const thumbs = new Map();                 // id fotky → náhled

const stepsOf = p => T.kroky.filter(k => k.phase === p.id);
const photosOf = p => photos.filter(f => { const e = effectivePhase(T.phases, f); return e && e.id === p.id; })
  .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (b.ts || 0) - (a.ts || 0));

/* ---------- náhledy fotek – stahují se jen ty, které se opravdu ukážou ---------- */
async function ensureThumbs(list){
  const need = list.filter(f => !thumbs.has(f.id));
  need.forEach(f => { if(f.thumb || f.src) thumbs.set(f.id, f.thumb || f.src); });
  const ids = need.filter(f => !thumbs.has(f.id)).map(f => f.id);
  if(!ids.length || !online()) return;
  try {
    for(let i = 0; i < ids.length; i += 40){
      const docs = await getDocsById('fotky', ids.slice(i, i + 40), ['thumb', 'src']);
      docs.forEach(d => thumbs.set(d.id, d.thumb || d.src || ''));
    }
  } catch(e){ console.warn('Náhledy fotek:', e); }
}
const thumbHTML = (f, cls = '') => {
  const src = thumbs.get(f.id);
  const tip = (f.caption ? f.caption + ' · ' : '') + fmtDay(f.date);
  return `<a class="ph-thumb ${cls}" href="fotky-stavby.html?faze=${encodeURIComponent(effectivePhase(T.phases, f).id)}" title="${esc(tip)}">${
    src ? `<img src="${esc(src)}" alt="${esc(f.caption || 'Fotka ze stavby ' + fmtDay(f.date))}" loading="lazy" />` : ''}</a>`;
};

/* ---------- časová osa ---------- */
function phaseHTML(p, i){
  const [cls, label] = STATE[p.status] || STATE.planovano;
  const st = stepsOf(p), d = st.filter(k => k.status === 'hotovo').length;
  const open = st.filter(k => k.status !== 'hotovo')
    .sort((a, b) => (a.status === 'probiha' ? 0 : 1) - (b.status === 'probiha' ? 0 : 1));
  const ph = photosOf(p);
  const showOpen = p.status === 'probiha' ? open.slice(0, 3) : [];
  return `<div class="phase clickable ${cls}" data-phase="${esc(p.id)}" tabindex="0" role="button" aria-haspopup="dialog">
    <h3>${i + 1}. ${esc(p.name)} <span class="statetag ${cls}">${label}</span><span class="open-hint">Detail →</span></h3>
    <div class="when">${esc(p.when && p.when !== '—' ? p.when : 'termín zatím neurčen')}</div>
    ${p.note ? `<p>${esc(p.note)}</p>` : ''}
    ${st.length ? `<div class="ph-prog"><div class="progressbar"><i style="width:${(d / st.length * 100).toFixed(0)}%"></i></div>
      <small>${d}/${st.length} ${pluralCz(st.length, 'krok', 'kroky', 'kroků')}</small></div>` : ''}
    ${showOpen.length ? `<ul class="ph-steps">${showOpen.map(k =>
      `<li class="${k.status === 'probiha' ? 'run' : ''}"><span aria-hidden="true">${STEP_ICON[k.status] || '📋'}</span>${esc(k.text)}</li>`).join('')}</ul>` : ''}
    ${ph.length ? `<div class="ph-photos">${ph.slice(0, 4).map(f => thumbHTML(f)).join('')}
      <span class="ph-photos-n">📷 ${ph.length} ${pluralCz(ph.length, 'fotka', 'fotky', 'fotek')}</span></div>` : ''}
  </div>`;
}

function renderStatus(){
  const el = $('status');
  const active = T.phases.filter(p => p.status === 'probiha');
  const last = photos.reduce((m, f) => (f.date || '') > m ? f.date : m, '');
  const parts = [];
  parts.push(active.length ? `📍 <b>Právě probíhá:</b> ${active.map(p => esc(p.name)).join(', ')}`
    : '📍 <b>Teď neprobíhá žádná fáze</b>');
  if(last) parts.push(`poslední fotka ${esc(fmtDay(last))} (${esc(agoCz(last))})`);
  el.innerHTML = parts.join(' · ') + (T.source !== 'online'
    ? ' <span class="muted">· databáze není dostupná, zobrazuje se záloha</span>' : '');
}

function render(){
  renderStatus();
  const total = T.kroky.length, done = T.kroky.filter(k => k.status === 'hotovo').length;
  $('pfill').style.width = total ? (done / total * 100) + '%' : '0%';
  $('pcount').textContent = `${done} / ${total} dílčích kroků hotovo`;
  $('timeline').innerHTML = T.phases.length ? T.phases.map(phaseHTML).join('')
    : '<div class="empty">Harmonogram je zatím prázdný.</div>';
}

/* ---------- detail fáze (modální okno, odkaz stavba.html#faze=<id>) ---------- */
const modal = $('modal'), body = $('modalBody');
let lastFocus = null;

function budgetHTML(p){
  if(!p.budgetCat) return '';
  const cat = CAT_BY_ID[p.budgetCat];
  const sum = budget ? budget.filter(it => it.category === p.budgetCat)
    .reduce((s, it) => s + (itemEstimateTotal(it) || 0), 0) : null;
  return `<a class="ph-link" href="rozpocet.html#cat-${encodeURIComponent(p.budgetCat)}">${cat ? cat.icon : '💰'} Rozpočet: ${
    esc(cat ? cat.name : p.budgetCat)}${sum != null && sum > 0 ? ` · <b>${esc(fmtMoney(sum))}</b>` : ''}</a>`;
}

/* zápisy ze stavebního deníku (uložená fáze, jinak podle data) */
function diaryHTML(p){
  const mine = diary.filter(e => (e.phase || (phaseForDate(T.phases, e.date) || {}).id) === p.id)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  if(!mine.length) return '';
  return `<h3>Ze stavebního deníku <span class="ph-d-n">${mine.length}</span></h3>
    <ul class="subtl">${mine.slice(0, 6).map(e => `<li><b>${esc(fmtDay(e.date))}</b> – ${esc(String(e.text || '').slice(0, 160))}${
      e.deal ? ` <span class="ph-d-deal">🤝 ${esc(e.deal)}</span>` : ''}</li>`).join('')}</ul>
    <a class="ph-link" href="denik.html">📒 ${mine.length > 6 ? `Všech ${mine.length} zápisů` : 'Stavební deník'} →</a>`;
}

/* úkoly rodiny navázané na fázi (assets/ukoly.js, checklist.html) */
function tasksHTML(p){
  const mine = tasks.filter(t => t.phase === p.id);
  if(!mine.length) return '';
  const open = mine.filter(t => !t.done)
    .sort((a, b) => (a.urgent ? 0 : 1) - (b.urgent ? 0 : 1) || String(a.due || '9999').localeCompare(String(b.due || '9999')));
  const today = new Date().toLocaleDateString('sv-SE');
  return `<h3>Úkoly <span class="ph-d-n">${mine.length - open.length}/${mine.length}</span></h3>
    ${open.length ? `<ul class="ph-d-steps">${open.slice(0, 8).map(t => `<li class="st-planovano">
        <span aria-hidden="true">${t.urgent ? '⏰' : '☐'}</span><span>${esc(t.text)}</span>${
        t.who || t.due ? `<small${t.due && t.due < today ? ' class="rz-over"' : ''}>${[t.who ? esc(t.who) : '', t.due ? esc(fmtDay(t.due)) : ''].filter(Boolean).join(' · ')}</small>` : ''}</li>`).join('')}</ul>`
      : '<p class="ph-d-empty">Všechny úkoly k této fázi jsou hotové. ✅</p>'}
    <a class="ph-link" href="checklist.html${mine[0] && mine[0].group ? '?skupina=' + encodeURIComponent(mine[0].group) : ''}">✅ ${
      open.length > 8 ? `Všech ${open.length} otevřených úkolů` : 'Úkoly'} →</a>`;
}

async function openPhase(id, focusBack){
  const p = T.phases.find(x => x.id === id);
  if(!p) return;
  lastFocus = focusBack || document.activeElement;
  const [cls, label] = STATE[p.status] || STATE.planovano;
  const st = stepsOf(p), d = st.filter(k => k.status === 'hotovo').length;
  const ph = photosOf(p), ex = extraFor(p);
  const hist = ex.flatMap(e => e.items || []), links = ex.flatMap(e => e.links || []);
  const draw = () => {
    body.innerHTML = `
      <h2 id="modalTitle">${esc(p.name)} <span class="statetag ${cls}">${label}</span></h2>
      <div class="ph-d-when">${esc(p.when && p.when !== '—' ? p.when : 'termín zatím neurčen')}${
        st.length ? ` · ${d}/${st.length} ${pluralCz(st.length, 'krok hotový', 'kroky hotové', 'kroků hotovo')}` : ''}</div>
      ${st.length ? `<div class="progressbar"><i style="width:${(d / st.length * 100).toFixed(0)}%"></i></div>` : ''}
      ${p.note ? `<p class="ph-d-note">${esc(p.note)}</p>` : ''}
      ${st.length ? `<h3>Kroky</h3><ul class="ph-d-steps">${st.map(k => `<li class="st-${esc(k.status || 'planovano')}">
          <span aria-hidden="true">${STEP_ICON[k.status] || '📋'}</span><span>${esc(k.text)}</span>${
          k.when ? `<small>${esc(k.when)}</small>` : ''}</li>`).join('')}</ul>` : ''}
      ${tasksHTML(p)}
      ${diaryHTML(p)}
      ${hist.length ? `<h3>Záznamy</h3><ul class="subtl">${hist.map(([w, t]) => `<li><b>${esc(w)}</b> – ${esc(t)}</li>`).join('')}</ul>` : ''}
      <h3>Fotky${ph.length ? ` <span class="ph-d-n">${ph.length}</span>` : ''}</h3>
      ${ph.length ? `<div class="ph-d-photos">${ph.slice(0, 12).map(f => thumbHTML(f)).join('')}</div>
        <a class="ph-link" href="fotky-stavby.html?faze=${encodeURIComponent(p.id)}">📷 ${
          ph.length > 12 ? `Všech ${ph.length} fotek` : 'Fotky'} z této fáze →</a>`
        : `<p class="ph-d-empty">K této fázi zatím nejsou fotky. <a href="fotky-stavby.html">Přidat fotky →</a></p>`}
      <div class="ph-d-links">
        ${budgetHTML(p)}
        ${links.map(([h, t]) => `<a class="ph-link" href="${esc(h)}">${esc(t)}</a>`).join('')}
        <a class="ph-link" href="harmonogram.html">✏️ Upravit v harmonogramu</a>
      </div>`;
  };
  draw();
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  $('modalClose').focus();
  try { history.replaceState(null, '', '#faze=' + encodeURIComponent(id)); } catch(e){}
  const before = ph.slice(0, 12).filter(f => !thumbs.has(f.id)).length;
  await ensureThumbs(ph.slice(0, 12));
  if(before && modal.classList.contains('open')) draw();
}

function closeModal(){
  if(!modal.classList.contains('open')) return;
  modal.classList.remove('open');
  document.body.style.overflow = '';
  try { history.replaceState(null, '', location.pathname + location.search); } catch(e){}
  if(lastFocus && document.contains(lastFocus)) lastFocus.focus();
}

$('timeline').addEventListener('click', e => {
  if(e.target.closest('a')) return;                       // klik na náhled fotky vede rovnou do Fotek
  const el = e.target.closest('.phase[data-phase]');
  if(el) openPhase(el.dataset.phase, el);
});
$('timeline').addEventListener('keydown', e => {
  const el = e.target.closest('.phase[data-phase]');
  if(el && e.target === el && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); openPhase(el.dataset.phase, el); }
});
$('modalClose').addEventListener('click', closeModal);
modal.addEventListener('click', e => { if(e.target === modal) closeModal(); });
document.addEventListener('keydown', e => { if(e.key === 'Escape') closeModal(); });

/* ---------- načtení ---------- */
async function init(){
  const on = online();
  const [timeline, fotky, rozpocet, ukoly, denik] = await Promise.all([
    loadTimeline().catch(e => { console.warn(e); return null; }),
    (on ? listDocs('fotky', ['date', 'caption', 'phase', 'phaseName', 'phaseManual', 'ts', 'src']) : Promise.reject(new Error('offline')))
      .catch(() => localList('rdmodrice-fotky-v1')),
    (on ? listDocs('rozpocet', ['category', 'qty', 'priceOff', 'priceUnoff']) : Promise.reject(new Error('offline')))
      .catch(() => localList('rdmodrice-rozpocet-items-v1')),
    (on ? listDocs('ukoly', ['text', 'done', 'who', 'due', 'phase', 'urgent', 'group']) : Promise.reject(new Error('offline')))
      .catch(() => localList('rdmodrice-ukoly-v1')),
    (on ? listDocs('denik', ['date', 'text', 'deal', 'phase']) : Promise.reject(new Error('offline')))
      .catch(() => localList('rdmodrice-denik-v1')),
  ]);
  diary = Array.isArray(denik) ? denik : [];
  tasks = Array.isArray(ukoly) ? ukoly : [];
  if(!timeline){
    $('timeline').innerHTML = '<div class="empty">Stav stavby se nepodařilo načíst – zkus stránku obnovit.</div>';
    $('status').textContent = '⚠️ Data se nepodařilo načíst.';
    return;
  }
  T = timeline; photos = Array.isArray(fotky) ? fotky : []; budget = Array.isArray(rozpocet) ? rozpocet : null;
  render();
  // náhledy na časové ose (max. 4 na fázi)
  await ensureThumbs(T.phases.flatMap(p => photosOf(p).slice(0, 4)));
  render();
  const m = /#faze=([^&]+)/.exec(location.hash);
  if(m) openPhase(decodeURIComponent(m[1]), null);
}
init();
