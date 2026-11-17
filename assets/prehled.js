/* ============================================================
   RD Modřice – Grmelovi · Přehled na úvodní stránce
   „Co se děje na stavbě" – aktuální fáze a nejbližší kroky
   (z harmonogramu), poslední fotky, stav rozpočtu, požadavky
   a poslední poznámka. Jen čte (assets/data.js), nic nezapisuje.
   ============================================================ */
import { esc, online, loadTimeline, listDocs, queryDocs, localList, pluralCz, fmtDay, agoCz } from './data.js';
import { fmtMoney, itemOfficialTotal, itemEstimateTotal } from './rozpocet.js';

const $ = id => document.getElementById(id);
const STEP_ICON = { planovano:'📋', probiha:'🛠️', hotovo:'✅' };

/* ---------- Právě probíhá ---------- */
function renderPhases({ phases, kroky, source }){
  const el = $('nowPhase');
  if(!el) return;
  const total = kroky.length, done = kroky.filter(k => k.status === 'hotovo').length;
  const active = phases.filter(p => p.status === 'probiha');
  const next = phases.find(p => p.status !== 'hotovo' && p.status !== 'probiha');
  const stepsOf = p => kroky.filter(k => k.phase === p.id);

  const phaseHTML = p => {
    const st = stepsOf(p);
    const d = st.filter(k => k.status === 'hotovo').length;
    const open = st.filter(k => k.status !== 'hotovo')
      .sort((a, b) => (a.status === 'probiha' ? 0 : 1) - (b.status === 'probiha' ? 0 : 1));
    return `<div class="now-ph">
      <div class="now-ph-head">
        <b>${esc(p.name)}</b>
        ${p.when ? `<span class="now-when">${esc(p.when)}</span>` : ''}
        ${st.length ? `<span class="now-frac">${d}/${st.length}</span>` : ''}
      </div>
      ${st.length ? `<div class="progressbar"><i style="width:${(d / st.length * 100).toFixed(0)}%"></i></div>` : ''}
      ${open.length ? `<ul class="now-steps">${open.slice(0, 3).map(k =>
        `<li class="${k.status === 'probiha' ? 'run' : ''}"><span aria-hidden="true">${STEP_ICON[k.status] || '📋'}</span>${esc(k.text)}</li>`).join('')}${
        open.length > 3 ? `<li class="more">… a ${open.length - 3} ${pluralCz(open.length - 3, 'další krok', 'další kroky', 'dalších kroků')}</li>` : ''}</ul>`
        : (st.length ? '<p class="now-muted">Všechny kroky hotové – fázi jde uzavřít.</p>' : '')}
    </div>`;
  };

  const allDone = phases.length && phases.every(p => p.status === 'hotovo');
  el.innerHTML = `
    <div class="now-card-head">
      <h3>${active.length ? '🛠️ Právě probíhá' : (allDone ? '🎉 Hotovo' : '📋 Co je na řadě')}</h3>
      <a href="stavba.html">Postup stavby →</a>
    </div>
    ${active.length ? active.slice(0, 3).map(phaseHTML).join('')
      : `<p class="now-muted">${allDone ? 'Všechny fáze jsou hotové.' : 'Teď neprobíhá žádná fáze.'}</p>`}
    ${next ? `<div class="now-next"><span>Dál nás čeká</span><b>${esc(next.name)}</b>${
      next.when && next.when !== '—' ? `<span class="now-when">${esc(next.when)}</span>` : ''}</div>` : ''}
    <div class="now-total">
      <div class="progressbar"><i style="width:${total ? (done / total * 100).toFixed(0) : 0}%"></i></div>
      <small>Celkem hotovo ${done} z ${total} ${pluralCz(total, 'kroku', 'kroků', 'kroků')} ·
        <a href="harmonogram.html">upravit v harmonogramu</a>${
        source !== 'online' ? ' · <span title="Databáze teď není dostupná">údaje ze zálohy</span>' : ''}</small>
    </div>`;
}

/* ---------- Poslední fotky ---------- */
function renderPhotos(photos){
  const el = $('nowPhotos');
  if(!el) return;
  const head = `<div class="now-card-head"><h3>📷 Poslední fotky</h3><a href="fotky-stavby.html">Všechny fotky →</a></div>`;
  if(!photos.length){
    el.innerHTML = head + `<p class="now-muted">Zatím tu nejsou žádné fotky ze stavby.</p>
      <a class="btn" href="fotky-stavby.html">📷 Přidat první fotku</a>`;
    return;
  }
  const last = photos[0].date;
  el.innerHTML = head + `
    <div class="now-thumbs">${photos.slice(0, 6).map(p => `
      <a href="fotky-stavby.html" title="${esc((p.caption ? p.caption + ' · ' : '') + fmtDay(p.date))}">
        <img src="${esc(p.thumb || p.src || '')}" alt="${esc(p.caption || 'Fotka ze stavby ' + fmtDay(p.date))}" loading="lazy" />
      </a>`).join('')}</div>
    <div class="now-photos-foot">
      <small>Poslední z ${esc(fmtDay(last))} (${esc(agoCz(last))})</small>
      <a class="btn" href="fotky-stavby.html">📷 Přidat fotky</a>
    </div>`;
}

/* ---------- Malé dlaždice ---------- */
function tile(id, html){ const el = $(id); if(el) el.innerHTML = html; }

function renderBudget(items){
  let off = 0, est = 0, bez = 0, paid = 0;
  items.forEach(it => {
    const o = itemOfficialTotal(it), e = itemEstimateTotal(it);
    if(it.paid != null && isFinite(it.paid)) paid += Number(it.paid);
    if(o != null) off += o;
    if(e != null) est += e;
    if(o == null && e == null) bez++;
  });
  const diff = est - off;
  tile('nowBudget', `<span class="now-tile-ic">💰</span>
    <span class="now-tile-main"><b>${esc(fmtMoney(est))}</b>
    <small>rozpočet (aktuální odhad)${paid ? ` · zaplaceno ${esc(fmtMoney(paid))}` : ''}${
      Math.abs(diff) >= 1 ? ` · <span class="${diff > 0 ? 'rz-over' : 'rz-under'}">${diff > 0 ? '+' : '−'}${esc(fmtMoney(Math.abs(diff)))} proti plánu</span>` : ''}${
      bez ? ` · ${bez} ${pluralCz(bez, 'položka', 'položky', 'položek')} bez ceny` : ''}</small></span>`);
}

function renderRequests(list){
  const n = s => list.filter(r => (r.status || 'novy') === s).length;
  const novy = n('novy'), run = n('probiha'), hot = n('hotovo');
  const main = novy ? `${novy} ${pluralCz(novy, 'nový požadavek', 'nové požadavky', 'nových požadavků')}`
    : (run ? `${run} ${pluralCz(run, 'rozpracovaný', 'rozpracované', 'rozpracovaných')}` : (list.length ? 'Vše zapracováno' : 'Žádné požadavky'));
  const sub = [run && novy ? `${run} rozpracováno` : '', hot ? `${hot} hotovo` : ''].filter(Boolean).join(' · ') || 'úpravy 3D modelu';
  tile('nowReq', `<span class="now-tile-ic">✏️</span>
    <span class="now-tile-main"><b>${esc(main)}</b><small>${esc(sub)} · požadavky na model</small></span>`);
}

function renderTasks(list){
  const open = list.filter(t => !t.done);
  const today = new Date().toLocaleDateString('sv-SE');
  const over = open.filter(t => t.due && t.due < today).length;
  let me = '';
  try { me = localStorage.getItem('rdmodrice-board-author') || ''; } catch(e){}
  const mine = me ? open.filter(t => t.who === me).length : 0;
  const sub = [over ? `<span class="rz-over">${over} po termínu</span>` : '', mine ? `${mine} na tobě` : '']
    .filter(Boolean).join(' · ');
  tile('nowTasks', `<span class="now-tile-ic">✅</span>
    <span class="now-tile-main"><b>${!list.length ? 'Úkoly' : open.length ? `${open.length} ${pluralCz(open.length, 'otevřený úkol', 'otevřené úkoly', 'otevřených úkolů')}` : 'Vše hotovo'}</b>
    <small>${sub ? sub + ' · ' : ''}co zařídit a rozhodnout</small></span>`);
}

function renderChoices(list){
  const open = list.filter(v => (v.status || 'vybirame') === 'vybirame');
  const today = new Date().toLocaleDateString('sv-SE');
  const over = open.filter(v => v.due && v.due < today).length;
  const next = open.filter(v => v.due && v.due >= today).sort((a, b) => a.due.localeCompare(b.due))[0];
  const sub = [over ? `<span class="rz-over">${over} po termínu</span>` : '',
    next ? `nejbližší ${esc(fmtDay(next.due))}: ${esc(next.title)}` : ''].filter(Boolean).join(' · ');
  tile('nowChoices', `<span class="now-tile-ic">🧭</span>
    <span class="now-tile-main"><b>${!list.length ? 'Výběry' : open.length
      ? `${open.length} ${pluralCz(open.length, 'věc', 'věci', 'věcí')} k rozhodnutí` : 'Vše rozhodnuto'}</b>
    <small class="now-clip">${sub || (list.length ? 'okna, podlahy, kuchyň…' : 'co vybrat a do kdy – zatím prázdné')}</small></span>`);
}

function renderDiary(list){
  const e = list[0];
  if(!e){
    tile('nowDiary', `<span class="now-tile-ic">📒</span>
      <span class="now-tile-main"><b>Stavební deník</b><small>zatím bez zápisu – co se dnes na stavbě dělalo?</small></span>`);
    return;
  }
  const text = String(e.text || '').replace(/\s+/g, ' ').trim();
  tile('nowDiary', `<span class="now-tile-ic">📒</span>
    <span class="now-tile-main"><b class="now-clip">${esc(text.length > 60 ? text.slice(0, 58) + '…' : text)}</b>
    <small>${esc(fmtDay(e.date))} (${esc(agoCz(e.date))})${e.author ? ' · ' + esc(e.author) : ''} · poslední zápis</small></span>`);
}

function renderNotes(list){
  const n = list[0];
  if(!n){
    tile('nowNotes', `<span class="now-tile-ic">📝</span>
      <span class="now-tile-main"><b>Poznámky</b><small>zatím žádné – zapiš první domluvu nebo nápad</small></span>`);
    return;
  }
  const text = String(n.text || '').replace(/\s+/g, ' ').trim();
  tile('nowNotes', `<span class="now-tile-ic">📝</span>
    <span class="now-tile-main"><b class="now-clip">${esc(text.length > 70 ? text.slice(0, 68) + '…' : text)}</b>
    <small>${esc(n.author || '')}${n.ts ? ' · ' + esc(agoCz(new Date(n.ts))) : ''} · poslední poznámka</small></span>`);
}

/* ---------- načtení (každá část zvlášť, ať jedna chyba neshodí zbytek) ---------- */
const byTsDesc = (a, b) => (b.ts || 0) - (a.ts || 0);
const tryPart = (fn, fallback) => fn().catch(e => { console.warn('Přehled:', e); return fallback(); });

async function init(){
  if(!$('now')) return;
  const on = online();

  tryPart(loadTimeline, () => null).then(t => {
    if(t && t.phases.length) renderPhases(t);
    else if($('nowPhase')) $('nowPhase').innerHTML = `<div class="now-card-head"><h3>🛠️ Postup stavby</h3>
      <a href="stavba.html">Otevřít →</a></div><p class="now-muted">Stav se nepodařilo načíst.</p>`;
  });

  tryPart(
    () => on ? queryDocs('fotky', { fields:['date','caption','thumb','src'], orderBy:'date', limit:6 }) : Promise.reject(new Error('offline')),
    () => localList('rdmodrice-fotky-v1').sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 6)
  ).then(renderPhotos);

  tryPart(
    () => on ? listDocs('rozpocet', ['qty','priceOff','priceUnoff','paid']) : Promise.reject(new Error('offline')),
    () => localList('rdmodrice-rozpocet-items-v1')
  ).then(renderBudget);

  tryPart(
    () => on ? listDocs('pozadavky', ['status']) : Promise.reject(new Error('offline')),
    () => localList('rdmodrice-pozadavky-v1')
  ).then(renderRequests);

  tryPart(
    () => on ? listDocs('ukoly', ['done', 'due', 'who']) : Promise.reject(new Error('offline')),
    () => localList('rdmodrice-ukoly-v1')
  ).then(renderTasks);

  tryPart(
    () => on ? listDocs('vybery', ['status', 'due', 'title']) : Promise.reject(new Error('offline')),
    () => localList('rdmodrice-vybery-v1')
  ).then(renderChoices);

  tryPart(
    () => on ? queryDocs('denik', { fields:['date', 'text', 'author'], orderBy:'date', limit:1 }) : Promise.reject(new Error('offline')),
    () => localList('rdmodrice-denik-v1').sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 1)
  ).then(renderDiary);

  tryPart(
    () => on ? queryDocs('poznamky', { fields:['text','author','ts'], orderBy:'ts', limit:1 }) : Promise.reject(new Error('offline')),
    () => localList('rdmodrice-poznamky-v1').sort(byTsDesc).slice(0, 1)
  ).then(renderNotes);
}

init();
