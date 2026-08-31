/* ============================================================
   RD Modřice – Grmelovi · sdílená „nástěnka" obrázků / odkazů
   Použití: Vizualizace (vlastní obrázky) a Inspirace (odkazy).
   Data se sdílejí v reálném čase přes Firebase (Firestore + Storage),
   při nedostupnosti spadne zpět na lokální úložiště prohlížeče.
   ============================================================ */

import { firebaseConfig } from './firebase-config.js';

/* ---------- Kategorie: exteriér → místnosti (dle projektu) ---------- */
export const CATS = [
  // Exteriér
  { id:'exterier',  name:'Exteriér a fasáda',   icon:'🏠', group:'Exteriér' },
  { id:'strecha',   name:'Střecha',             icon:'🏛️', group:'Exteriér' },
  { id:'zahrada',   name:'Zahrada',             icon:'🌳', group:'Exteriér' },
  { id:'terasa',    name:'Terasa a závětří',    icon:'☀️', group:'Exteriér' },
  { id:'vjezd',     name:'Vjezd a oplocení',    icon:'🚗', group:'Exteriér' },
  // Interiér – 1. NP
  { id:'vstup',     name:'Zádveří a chodby',    icon:'🚪', group:'Interiér – 1. NP' },
  { id:'obyvak',    name:'Obývací pokoj',       icon:'🛋️', group:'Interiér – 1. NP' },
  { id:'kuchyn',    name:'Kuchyně a spíž',      icon:'🍽️', group:'Interiér – 1. NP' },
  { id:'pracovna',  name:'Pracovna',            icon:'💼', group:'Interiér – 1. NP' },
  { id:'schodiste', name:'Schodiště',           icon:'🪜', group:'Interiér – 1. NP' },
  { id:'garaz',     name:'Garáž',               icon:'🚙', group:'Interiér – 1. NP' },
  // Podkroví
  { id:'loznice',   name:'Ložnice',             icon:'🛏️', group:'Podkroví' },
  { id:'detsky',    name:'Dětské pokoje',       icon:'🧸', group:'Podkroví' },
  { id:'koupelna',  name:'Koupelny a WC',       icon:'🛁', group:'Podkroví' },
  { id:'satna',     name:'Šatna',               icon:'👗', group:'Podkroví' },
  { id:'technicka', name:'Technická místnost',  icon:'🔧', group:'Podkroví' },
  // Ostatní
  { id:'ostatni',   name:'Ostatní',             icon:'📌', group:'Ostatní' },
];
const CAT_BY_ID = Object.fromEntries(CATS.map(c => [c.id, c]));
const GROUPS = [...new Set(CATS.map(c => c.group))];

const AUTHORS = ['Lucka', 'Vladimír', 'Jirka', 'Jarka'];
const FB_VER  = 'https://www.gstatic.com/firebasejs/10.12.2';
const INLINE_TARGET = 600 * 1024; // max velikost obrázku uloženého přímo do databáze (bezpečně pod limit 1 MB na dokument)

/* ---------- Pomocné funkce ---------- */
const slug = s => (s || '').toLowerCase()
  .replace(/á/g,'a').replace(/í/g,'i').replace(/ř/g,'r')
  .replace(/[^a-z]/g,'');
const esc = s => (s == null ? '' : String(s)).replace(/[&<>"']/g, m =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
const isImageUrl = u => /^data:image\//i.test(u || '') || /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?|#|$)/i.test(u || '');
function domainOf(u){ try { return new URL(u).hostname.replace(/^www\./, ''); } catch(e){ return (u || '').replace(/^https?:\/\//, '').split('/')[0]; } }
function fmtDate(ts){
  if(!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('cs-CZ') + ' ' + d.toLocaleTimeString('cs-CZ', { hour:'2-digit', minute:'2-digit' });
}

/* ---------- Zpracování / komprese obrázku ---------- */
async function fileToBitmap(file){
  if('createImageBitmap' in window){
    try { return await createImageBitmap(file, { imageOrientation:'from-image' }); } catch(e){ /* fallback */ }
  }
  return await new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}
async function compressFile(file, maxDim, quality){
  const bmp = await fileToBitmap(file);
  const iw = bmp.width, ih = bmp.height;
  const scale = Math.min(1, maxDim / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  if(bmp.close) bmp.close();
  const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', quality));
  return blob || file;
}
// Zmenší obrázek tak, aby se vešel do databáze jako data URL (fallback bez Storage)
async function compressForInline(file){
  const steps = [[1600,.8],[1280,.78],[1024,.74],[820,.7],[640,.66]];
  let best = null;
  for(const [d, q] of steps){
    const b = await compressFile(file, d, q);
    best = b;
    if(b.size <= INLINE_TARGET) return b;
  }
  return best;
}
const blobToDataURL = blob => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = rej;
  r.readAsDataURL(blob);
});

/* ---------- Lokální backend (localStorage) ---------- */
function localBackend(localKey){
  let items = [];
  try { items = JSON.parse(localStorage.getItem(localKey)) || []; } catch(e){ items = []; }
  let cb = () => {};
  const save = () => {
    try { localStorage.setItem(localKey, JSON.stringify(items)); }
    catch(e){ alert('Úložiště prohlížeče je plné – smaž prosím starší obrázky.'); throw e; }
  };
  return {
    shared: false,
    subscribe(f){ cb = f; cb(items); },
    async putImage(file){
      const blob = await compressForInline(file);
      return { type:'image', src: await blobToDataURL(blob), inline:true };
    },
    async add(item){
      item.id = 'l' + Date.now() + Math.random().toString(36).slice(2, 7);
      items.unshift(item); save(); cb(items);
    },
    async remove(item){ items = items.filter(x => x.id !== item.id); save(); cb(items); }
  };
}

/* ---------- Firebase backend (Firestore + Storage, realtime) ---------- */
async function firebaseBackend(collectionName, storageDir){
  const { initializeApp } = await import(`${FB_VER}/firebase-app.js`);
  const { getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy }
    = await import(`${FB_VER}/firebase-firestore.js`);

  const app = initializeApp(firebaseConfig);
  const db  = getFirestore(app);
  const col = collection(db, collectionName);

  // Storage je volitelné. Když se nenačte, není povolené nebo nereaguje, obrázek se uloží
  // (zmenšený) přímo do Firestore – stejnou cestou jako odkazy. Bez časového limitu by
  // nahrávání do nefunkčního Storage viselo (Firebase SDK opakuje pokus i mnoho minut).
  let storage = null, sRef, uploadBytes, getDownloadURL, deleteObject;
  let storageOk = true;           // po prvním selhání Storage přestaneme zkoušet (žádné čekání)
  const STORAGE_TIMEOUT = 8000;   // ms – limit na nahrání do Storage, pak fallback do Firestore
  try {
    const st = await import(`${FB_VER}/firebase-storage.js`);
    storage = st.getStorage(app);
    try { storage.maxUploadRetryTime = STORAGE_TIMEOUT; storage.maxOperationRetryTime = STORAGE_TIMEOUT; } catch(e){}
    sRef = st.ref; uploadBytes = st.uploadBytes; getDownloadURL = st.getDownloadURL; deleteObject = st.deleteObject;
  } catch(e){ console.warn('Firebase Storage nedostupné, obrázky se uloží do databáze.', e); }

  // Nahrání do Storage s tvrdým časovým limitem; při selhání/timeoutu vrátí null.
  async function tryStorage(file){
    if(!storage || !storageOk) return null;
    const attempt = (async () => {
      const blob = await compressFile(file, 1600, 0.82);
      const path = `${storageDir}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const r = sRef(storage, path);
      await uploadBytes(r, blob, { contentType:'image/jpeg' });
      const url = await getDownloadURL(r);
      return { type:'image', src:url, storagePath:path };
    })();
    attempt.catch(() => {}); // pozdější odmítnutí po timeoutu ať není „unhandled"
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('storage-timeout')), STORAGE_TIMEOUT + 1500));
    try {
      return await Promise.race([attempt, timeout]);
    } catch(e){
      console.warn('Storage nedostupné → ukládám obrázek přímo do databáze.', e);
      storageOk = false; // příště rovnou do Firestore, ať se nečeká
      return null;
    }
  }

  return {
    shared: true,
    subscribe(cb, onError){
      onSnapshot(query(col, orderBy('ts', 'desc')),
        snap => cb(snap.docs.map(d => ({ id:d.id, ...d.data() }))),
        err => { console.error(err); if(onError) onError(err); });
    },
    async putImage(file){
      // 1) zkusit Firebase Storage (plná kvalita, v databázi jen odkaz) – s časovým limitem
      const viaStorage = await tryStorage(file);
      if(viaStorage) return viaStorage;
      // 2) spolehlivý fallback: komprimovaný obrázek přímo do Firestore
      const blob = await compressForInline(file);
      return { type:'image', src: await blobToDataURL(blob), inline:true };
    },
    async add(item){ return addDoc(col, item); },
    async remove(item){
      if(item.storagePath && storage){
        try { await deleteObject(sRef(storage, item.storagePath)); } catch(e){ console.warn('Storage delete', e); }
      }
      return deleteDoc(doc(db, collectionName, item.id));
    }
  };
}

/* ============================================================
   initBoard – sestaví UI a připojí backend
   opts: { mount, collection, storageDir, localKey,
           allowUpload, linkLabel, linkPlaceholder, emptyHint }
   ============================================================ */
export async function initBoard(opts){
  const mount = document.querySelector(opts.mount);
  if(!mount) return;
  const allowUpload = opts.allowUpload !== false;

  /* --- sestavení DOM --- */
  const catOptions = GROUPS.map(g =>
    `<optgroup label="${esc(g)}">` +
    CATS.filter(c => c.group === g).map(c => `<option value="${c.id}">${c.icon} ${esc(c.name)}</option>`).join('') +
    `</optgroup>`).join('');
  const authorOptions = AUTHORS.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('');

  mount.innerHTML = `
    <div class="statusbar board-status" id="bStatus">Načítám…</div>

    <div class="board-add">
      <div class="ba-row">
        <label class="ba-field">Kdo přidává
          <select id="baAuthor">${authorOptions}</select>
        </label>
        <label class="ba-field ba-grow">Kam to patří
          <select id="baCat">${catOptions}</select>
        </label>
      </div>

      ${allowUpload ? `
      <div class="ba-drop" id="baDrop" tabindex="0" role="button" aria-label="Nahrát obrázky">
        <input type="file" id="baFile" accept="image/*" multiple hidden>
        <span class="ba-drop-ic">📤</span>
        <div class="ba-drop-txt">
          <b>Nahraj obrázky z počítače</b>
          <span>Přetáhni sem soubory, vlož ze schránky (Ctrl+V) nebo <span class="linklike" id="baPick">vyber soubory</span></span>
        </div>
      </div>
      <div class="ba-or"><span>nebo přidej odkaz</span></div>` : ''}

      <div class="ba-link">
        <input type="url" id="baUrl" placeholder="${esc(opts.linkPlaceholder || 'https://…')}" />
        <input type="text" id="baTitle" placeholder="Popis (nepovinné)" />
        <button class="btn primary" id="baAddLink" type="button">Přidat odkaz</button>
      </div>
      <div class="ba-hint" id="baLinkHint">${esc(opts.linkLabel || 'Odkaz na obrázek nebo stránku')}</div>

      <div class="ba-progress" id="baProg" hidden></div>
    </div>

    <div class="board-filter" id="bFilter"></div>
    <div class="board-body" id="bBody"></div>

    <div class="lightbox" id="bLight" hidden>
      <button class="lb-close" id="lbClose" aria-label="Zavřít">✕</button>
      <button class="lb-nav lb-prev" id="lbPrev" aria-label="Předchozí">‹</button>
      <figure class="lb-fig">
        <img id="lbImg" alt="" />
        <figcaption id="lbCap"></figcaption>
      </figure>
      <button class="lb-nav lb-next" id="lbNext" aria-label="Další">›</button>
    </div>
  `;

  const $ = id => mount.querySelector('#' + id);
  const statusEl = $('bStatus');
  const authorEl = $('baAuthor');
  const catEl    = $('baCat');
  const urlEl    = $('baUrl');
  const titleEl  = $('baTitle');
  const filterEl = $('bFilter');
  const bodyEl   = $('bBody');
  const progEl   = $('baProg');

  // zapamatuj si autora a naposledy zvolenou kategorii
  const AKEY = 'rdmodrice-board-author', CKEY = opts.localKey + '-cat';
  try {
    const la = localStorage.getItem(AKEY); if(la && AUTHORS.includes(la)) authorEl.value = la;
    const lc = localStorage.getItem(CKEY); if(lc && CAT_BY_ID[lc]) catEl.value = lc;
  } catch(e){}
  authorEl.addEventListener('change', () => { try { localStorage.setItem(AKEY, authorEl.value); } catch(e){} });
  catEl.addEventListener('change',    () => { try { localStorage.setItem(CKEY, catEl.value); } catch(e){} });

  /* --- backend s fallbackem --- */
  let backend, activeCat = null, currentItems = [];
  const useFb = firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey.length > 10;

  function setStatus(kind, html){
    statusEl.className = 'statusbar board-status' + (kind ? ' ' + kind : '');
    statusEl.innerHTML = html;
  }
  function goLocal(reason){
    backend = localBackend(opts.localKey);
    setStatus('', '🔒 Uloženo jen v tomto prohlížeči' + (reason ? ' – ' + reason : '') + '.');
    backend.subscribe(render);
  }

  if(useFb){
    try {
      backend = await firebaseBackend(opts.collection, opts.storageDir);
      setStatus('ok', '🟢 Sdílené online – vidí všichni v reálném čase.');
      let fellBack = false;
      backend.subscribe(render, () => {
        if(fellBack) return; fellBack = true;
        setStatus('warn', '⚠️ Online databáze není dostupná – ukládá se jen lokálně.');
        goLocal();
      });
    } catch(e){
      console.error(e);
      goLocal('online databázi se nepodařilo načíst');
    }
  } else {
    goLocal('pro sdílení doplň konfiguraci Firebase');
  }

  /* --- přidání položek --- */
  function busy(on, txt){
    progEl.hidden = !on;
    if(on) progEl.textContent = txt || 'Pracuji…';
  }
  async function addImagesFromFiles(fileList){
    const files = [...fileList].filter(f => /^image\//.test(f.type));
    if(!files.length) return;
    const cat = catEl.value, author = authorEl.value;
    busy(true, `Nahrávám ${files.length} obrázek/ky…`);
    let ok = 0;
    for(const f of files){
      try {
        const img = await backend.putImage(f);
        const title = (f.name || '').replace(/\.[a-z0-9]+$/i, '') || 'Obrázek';
        await backend.add({ cat, author, ts: Date.now(), title, note:'', ...img });
        ok++;
      } catch(e){ console.error(e); }
      busy(true, `Nahrávám… (${ok}/${files.length})`);
    }
    busy(false);
    if(!ok) alert('Obrázky se nepodařilo přidat.');
  }
  async function addLink(){
    const url = (urlEl.value || '').trim();
    if(!url){ urlEl.focus(); return; }
    let href = url;
    if(!/^https?:\/\//i.test(href) && !/^data:/i.test(href)) href = 'https://' + href;
    const cat = catEl.value, author = authorEl.value;
    const title = (titleEl.value || '').trim();
    const type = isImageUrl(href) ? 'image' : 'link';
    busy(true, 'Přidávám odkaz…');
    try {
      await backend.add({ cat, author, ts: Date.now(), type, src: href, external:true,
        title: title || (type === 'image' ? 'Obrázek z odkazu' : domainOf(href)), note:'' });
      urlEl.value = ''; titleEl.value = '';
    } catch(e){ console.error(e); alert('Odkaz se nepodařilo přidat.'); }
    finally { busy(false); }
  }

  $('baAddLink').addEventListener('click', addLink);
  urlEl.addEventListener('keydown', e => { if(e.key === 'Enter') addLink(); });
  titleEl.addEventListener('keydown', e => { if(e.key === 'Enter') addLink(); });

  if(allowUpload){
    const drop = $('baDrop'), fileEl = $('baFile');
    const pick = () => fileEl.click();
    $('baPick').addEventListener('click', e => { e.stopPropagation(); pick(); });
    drop.addEventListener('click', pick);
    drop.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); pick(); } });
    fileEl.addEventListener('change', () => { addImagesFromFiles(fileEl.files); fileEl.value = ''; });
    ['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); if(ev === 'dragleave' && drop.contains(e.relatedTarget)) return; drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => { if(e.dataTransfer && e.dataTransfer.files) addImagesFromFiles(e.dataTransfer.files); });
    // vložení obrázku ze schránky (Ctrl+V) kdekoli na stránce
    window.addEventListener('paste', e => {
      const items = e.clipboardData && e.clipboardData.items;
      if(!items) return;
      const files = [];
      for(const it of items){ if(it.kind === 'file'){ const f = it.getAsFile(); if(f && /^image\//.test(f.type)) files.push(f); } }
      if(files.length){ e.preventDefault(); addImagesFromFiles(files); }
    });
  }

  /* --- filtr + vykreslení --- */
  function counts(items){
    const m = {}; items.forEach(i => { m[i.cat] = (m[i.cat] || 0) + 1; }); return m;
  }
  function renderFilter(items){
    const c = counts(items);
    let html = `<button class="fchip${activeCat === null ? ' on' : ''}" data-cat="">Vše <b>${items.length}</b></button>`;
    GROUPS.forEach(g => {
      const inGroup = CATS.filter(cat => cat.group === g && c[cat.id]);
      if(!inGroup.length) return;
      html += `<span class="fgroup">${esc(g)}</span>`;
      inGroup.forEach(cat => {
        html += `<button class="fchip${activeCat === cat.id ? ' on' : ''}" data-cat="${cat.id}">${cat.icon} ${esc(cat.name)} <b>${c[cat.id]}</b></button>`;
      });
    });
    filterEl.innerHTML = html;
  }
  function cardHTML(item){
    const s = slug(item.author);
    const who = `<span class="who who-${s}">${esc(item.author || '')}</span>`;
    const meta = `<span class="bcard-meta">${who} · ${esc(fmtDate(item.ts))}</span>`;
    const del = `<button class="bcard-del" data-id="${esc(item.id)}" title="Smazat" aria-label="Smazat">🗑</button>`;
    if(item.type === 'link'){
      const dom = domainOf(item.src);
      const fav = `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(dom)}`;
      return `<article class="bcard bcard-link" data-id="${esc(item.id)}">
        ${del}
        <a class="bcard-linkbody" href="${esc(item.src)}" target="_blank" rel="noopener noreferrer">
          <span class="bcard-fav"><img src="${esc(fav)}" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('🔗'))"></span>
          <span class="bcard-linktext">
            <span class="bcard-title">${esc(item.title || dom)}</span>
            <span class="bcard-url">${esc(dom)}</span>
            ${item.note ? `<span class="bcard-note">${esc(item.note)}</span>` : ''}
          </span>
        </a>
        ${meta}
      </article>`;
    }
    // obrázek (nahraný nebo z odkazu)
    const badge = item.external ? `<span class="bcard-badge">odkaz</span>` : '';
    return `<figure class="bcard bcard-img" data-id="${esc(item.id)}">
      ${del}
      <button class="bcard-thumb" data-open="${esc(item.id)}" aria-label="Zvětšit">
        <img src="${esc(item.src)}" alt="${esc(item.title || '')}" loading="lazy">
        ${badge}
      </button>
      <figcaption>
        <span class="bcard-title">${esc(item.title || '')}</span>
        ${item.note ? `<span class="bcard-note">${esc(item.note)}</span>` : ''}
        ${meta}
      </figcaption>
    </figure>`;
  }
  function sectionHTML(cat, items){
    const c = CAT_BY_ID[cat];
    const head = `<h2 class="bsec-head"><span class="bsec-ic">${c ? c.icon : '📌'}</span>${c ? esc(c.name) : 'Ostatní'} <span class="bsec-n">${items.length}</span></h2>`;
    return `<section class="bsec">${head}<div class="bgrid">${items.map(cardHTML).join('')}</div></section>`;
  }
  function render(items){
    currentItems = items || [];
    renderFilter(currentItems);
    if(!currentItems.length){
      bodyEl.innerHTML = `<div class="board-empty">
        <span class="be-ic">🖼️</span>
        <p>${esc(opts.emptyHint || 'Zatím tu nic není. Přidej první položku výše.')}</p>
      </div>`;
      return;
    }
    let list = currentItems;
    if(activeCat) list = list.filter(i => i.cat === activeCat);
    if(activeCat){
      bodyEl.innerHTML = list.length ? sectionHTML(activeCat, list)
        : `<div class="board-empty"><p>V této kategorii zatím nic není.</p></div>`;
    } else {
      // seskupit dle kategorie v pořadí CATS
      let html = '';
      CATS.forEach(cat => {
        const inCat = list.filter(i => i.cat === cat.id);
        if(inCat.length) html += sectionHTML(cat.id, inCat);
      });
      // položky s neznámou kategorií
      const known = new Set(CATS.map(c => c.id));
      const unknown = list.filter(i => !known.has(i.cat));
      if(unknown.length) html += sectionHTML('ostatni', unknown);
      bodyEl.innerHTML = html;
    }
  }

  filterEl.addEventListener('click', e => {
    const b = e.target.closest('.fchip'); if(!b) return;
    activeCat = b.dataset.cat || null;
    render(currentItems);
  });

  bodyEl.addEventListener('click', e => {
    const delBtn = e.target.closest('.bcard-del');
    if(delBtn){
      const id = delBtn.dataset.id;
      const item = currentItems.find(i => i.id === id);
      if(item && confirm('Smazat tuto položku?')) backend.remove(item).catch(err => { console.error(err); alert('Smazání se nepodařilo.'); });
      return;
    }
    const openBtn = e.target.closest('.bcard-thumb');
    if(openBtn){ openLightbox(openBtn.dataset.open); }
  });

  /* --- lightbox --- */
  const light = $('bLight'), lbImg = $('lbImg'), lbCap = $('lbCap');
  let lbList = [], lbIdx = 0;
  function openLightbox(id){
    lbList = currentItems.filter(i => i.type === 'image' && (!activeCat || i.cat === activeCat));
    lbIdx = Math.max(0, lbList.findIndex(i => i.id === id));
    showLb();
    light.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function showLb(){
    const it = lbList[lbIdx]; if(!it) return;
    lbImg.src = it.src; lbImg.alt = it.title || '';
    const c = CAT_BY_ID[it.cat];
    lbCap.innerHTML = `<b>${esc(it.title || '')}</b> <span class="lb-sub">${c ? c.icon + ' ' + esc(c.name) : ''} · ${esc(it.author || '')} · ${esc(fmtDate(it.ts))}</span>`;
  }
  function closeLb(){ light.hidden = true; lbImg.src = ''; document.body.style.overflow = ''; }
  function step(d){ if(!lbList.length) return; lbIdx = (lbIdx + d + lbList.length) % lbList.length; showLb(); }
  $('lbClose').addEventListener('click', closeLb);
  $('lbPrev').addEventListener('click', () => step(-1));
  $('lbNext').addEventListener('click', () => step(1));
  light.addEventListener('click', e => { if(e.target === light) closeLb(); });
  window.addEventListener('keydown', e => {
    if(light.hidden) return;
    if(e.key === 'Escape') closeLb();
    else if(e.key === 'ArrowLeft') step(-1);
    else if(e.key === 'ArrowRight') step(1);
  });
}
