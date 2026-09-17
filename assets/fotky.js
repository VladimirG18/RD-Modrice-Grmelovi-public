/* ============================================================
   RD Modřice – Grmelovi · sdílená fotodokumentace stavby
   ------------------------------------------------------------
   Fotky přidává kdokoli z rodiny přímo na stránce (z mobilu i z počítače),
   řadí se chronologicky po dnech. Datum se bere z údajů ve fotce (EXIF),
   takže se nemusí vyplňovat ručně; popisek i datum jdou později upravit.

   Data se sdílejí v reálném čase přes Firebase (Firestore):
   • kolekce `fotky`      – údaje o fotce + náhled (malý, ~40 kB), to se
                            načítá při každém otevření stránky;
   • kolekce `fotky_plne` – fotka ve velkém, stahuje se až po kliknutí
                            (jinak by stránka s přibývajícími fotkami
                            byla čím dál pomalejší);
   • dokument `fotky_meta/seed` – značka, že se původní fotky ze složky
                            v repozitáři už jednou založily do databáze.
   Když je databáze nedostupná, spadne to na localStorage jako zbytek webu.
   ============================================================ */

import { firebaseConfig } from './firebase-config.js';
import { compressFile, compressForInline, blobToDataURL } from './board.js';

const FB_VER = 'https://www.gstatic.com/firebasejs/10.12.2';
const AUTHORS = ['Lucka', 'Vladimír', 'Jirka', 'Jarka'];

const LOCAL_KEY   = 'rdmodrice-fotky-v1';
const LOCAL_FULL  = 'rdmodrice-fotky-plne-v1';
const ORDER_KEY   = 'rdmodrice-fotky-order';
const AUTHOR_KEY  = 'rdmodrice-board-author';   // stejný autor jako na nástěnkách

const THUMB_DIM = 560, THUMB_Q = 0.7;           // náhled do výpisu (~40 kB)

/* Fotky, které na stránce byly už předtím (soubory ve složce assets/img/stavba).
   Při prvním spuštění se založí do databáze, ať jsou všechny na jednom místě
   a jdou stejně upravovat i mazat. */
export const SEED_PHOTOS = [
  { date:'2026-09-02', src:'assets/img/stavba/2026-09-02_02.jpg', author:'Vladimír',
    caption:'Minibagr Bobcat na pozemku – začíná výkop první základové rýhy.' },
  { date:'2026-09-03', src:'assets/img/stavba/2026-09-03_01.jpg', author:'Vladimír',
    caption:'Vykopané základové rýhy, výstražná páska a připravené svazky armovací kari sítě.' },
];

/* ---------- Pomocné funkce ---------- */
export const esc = s => (s == null ? '' : String(s)).replace(/[&<>"']/g, m =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
const slug = s => (s || '').toLowerCase()
  .replace(/á/g,'a').replace(/í/g,'i').replace(/ř/g,'r').replace(/[^a-z]/g,'');

export const todayISO = () => new Date().toLocaleDateString('sv-SE');   // YYYY-MM-DD v místním čase
const isISO = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

export function fmtDay(iso){
  if(!isISO(iso)) return iso || '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d}. ${m}. ${y}`;
}
function fmtAdded(ts){
  if(!ts) return '';
  try { return new Date(ts).toLocaleDateString('cs-CZ'); } catch(e){ return ''; }
}

/* ---------- Datum pořízení z EXIF ----------
   U fotek z mobilu je v souboru datum, kdy vznikly – přečti ho, ať se
   nemusí u každé fotky vyplňovat ručně (jde přepsat). */
function readTiff(v, base){
  const le = v.getUint16(base) === 0x4949;              // "II" = little endian
  const u16 = o => v.getUint16(o, le);
  const u32 = o => v.getUint32(o, le);
  if(u16(base + 2) !== 42) return null;

  const findTag = (ifd, want) => {
    if(ifd + 2 > v.byteLength) return null;
    const n = u16(ifd);
    for(let i = 0; i < n; i++){
      const e = ifd + 2 + i * 12;
      if(e + 12 > v.byteLength) break;
      if(u16(e) === want) return e;
    }
    return null;
  };
  const ascii = e => {
    const count = u32(e + 4);
    const p = base + u32(e + 8);
    if(count < 5 || p + count > v.byteLength) return null;
    let s = '';
    for(let i = 0; i < count - 1; i++) s += String.fromCharCode(v.getUint8(p + i));
    return s;
  };

  const ifd0 = base + u32(base + 4);
  let entry = null;
  const exifPtr = findTag(ifd0, 0x8769);                // odkaz na Exif IFD
  if(exifPtr){
    const sub = base + u32(exifPtr + 8);
    entry = findTag(sub, 0x9003) || findTag(sub, 0x9004);  // DateTimeOriginal / Digitized
  }
  if(!entry) entry = findTag(ifd0, 0x0132);            // DateTime
  const s = entry ? ascii(entry) : null;
  const m = s && /^(\d{4}):(\d{2}):(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export async function exifDate(file){
  try {
    if(!/^image\/jpe?g$/i.test(file.type || '')) return null;
    const v = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if(v.getUint16(0) !== 0xFFD8) return null;
    let off = 2;
    while(off + 4 <= v.byteLength){
      if(v.getUint8(off) !== 0xFF) return null;
      const marker = v.getUint8(off + 1);
      if(marker === 0x01 || (marker >= 0xD0 && marker <= 0xD9)){ off += 2; continue; }
      if(marker === 0xDA) return null;                 // začátek obrazových dat
      const size = v.getUint16(off + 2);
      if(marker === 0xE1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966){
        return readTiff(v, off + 10);                  // za "Exif\0\0" začíná TIFF
      }
      if(size < 2) return null;
      off += 2 + size;
    }
  } catch(e){ /* nevadí – použije se datum z formuláře */ }
  return null;
}

/* ---------- Lokální záloha (localStorage) ---------- */
function loadJson(key, fallback){
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
  catch(e){ return fallback; }
}
function saveJson(key, value){
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch(e){ return false; }
}

function localBackend(){
  let items = loadJson(LOCAL_KEY, []);
  if(!Array.isArray(items)) items = [];
  let fulls = loadJson(LOCAL_FULL, {}) || {};
  let cb = () => {};
  const save = () => {
    if(!saveJson(LOCAL_KEY, items) || !saveJson(LOCAL_FULL, fulls)){
      alert('Úložiště prohlížeče je plné – smaž prosím starší fotky.');
      throw new Error('quota');
    }
  };
  return {
    shared: false,
    subscribe(f){ cb = f; cb(items); },
    async add(item, full){
      const id = 'l' + Date.now() + Math.random().toString(36).slice(2, 7);
      if(full) fulls[id] = full;
      items = [...items, { ...item, id, fullId: full ? id : null }];
      save(); cb(items);
    },
    async update(id, patch){
      items = items.map(i => i.id === id ? { ...i, ...patch } : i);
      save(); cb(items);
    },
    async remove(item){
      items = items.filter(i => i.id !== item.id);
      if(item.fullId) delete fulls[item.fullId];
      save(); cb(items);
    },
    async getFull(fullId){ return fulls[fullId] || null; },
    async seedIfEmpty(photos){
      if(items.length || localStorage.getItem(LOCAL_KEY)) return;
      items = photos.map((p, i) => ({ ...p, id:'seed' + i, ts: Date.now() + i, fullId:null }));
      save();
    },
  };
}

/* ---------- Firebase (Firestore, realtime) ---------- */
async function firebaseBackend(){
  const { initializeApp } = await import(`${FB_VER}/firebase-app.js`);
  const { getFirestore, collection, addDoc, deleteDoc, updateDoc, doc, getDoc, onSnapshot, writeBatch }
    = await import(`${FB_VER}/firebase-firestore.js`);

  const app = initializeApp(firebaseConfig);
  const db  = getFirestore(app);
  const col     = collection(db, 'fotky');
  const fullCol = collection(db, 'fotky_plne');
  const seedRef = doc(db, 'fotky_meta', 'seed');

  return {
    shared: true,
    subscribe(cb, onError){
      onSnapshot(col,
        snap => cb(snap.docs.map(d => ({ id:d.id, ...d.data() }))),
        err  => { console.error(err); if(onError) onError(err); });
    },
    async add(item, full){
      let fullId = null;
      if(full){
        const r = await addDoc(fullCol, { img: full, ts: Date.now() });
        fullId = r.id;
      }
      await addDoc(col, { ...item, fullId });
    },
    update(id, patch){ return updateDoc(doc(db, 'fotky', id), patch); },
    async remove(item){
      if(item.fullId){
        try { await deleteDoc(doc(db, 'fotky_plne', item.fullId)); } catch(e){ console.warn(e); }
      }
      await deleteDoc(doc(db, 'fotky', item.id));
    },
    async getFull(fullId){
      const s = await getDoc(doc(db, 'fotky_plne', fullId));
      return s.exists() ? (s.data().img || null) : null;
    },
    async seedIfEmpty(photos){
      const s = await getDoc(seedRef);
      if(s.exists()) return;                            // založeno už dřív – znovu ne
      const batch = writeBatch(db);
      photos.forEach((p, i) => batch.set(doc(col), { ...p, ts: Date.now() + i, fullId:null }));
      batch.set(seedRef, { done:true, ts: Date.now() });
      await batch.commit();
    },
  };
}

/* ============================================================
   initFotky – sestaví stránku a připojí backend
   opts: { mount }
   ============================================================ */
export async function initFotky(opts){
  const mount = document.querySelector(opts.mount);
  if(!mount) return;

  const authorOptions = AUTHORS.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('');

  mount.innerHTML = `
    <div class="statusbar board-status" id="fStatus">Načítám…</div>

    <div class="board-add">
      <div class="ba-row">
        <label class="ba-field">Kdo přidává
          <select id="fAuthor">${authorOptions}</select>
        </label>
        <label class="ba-field">Datum focení
          <input type="date" id="fDate" />
        </label>
        <label class="ba-field ba-grow">Popisek (nepovinné)
          <input type="text" id="fCaption" placeholder="Co je na fotce – např. „Betonáž základové desky“" />
        </label>
      </div>

      <div class="ba-drop" id="fDrop" tabindex="0" role="button" aria-label="Přidat fotky ze stavby">
        <input type="file" id="fFile" accept="image/*" multiple hidden>
        <span class="ba-drop-ic">📷</span>
        <div class="ba-drop-txt">
          <b>Přidej fotky ze stavby</b>
          <span>Vyfoť mobilem, přetáhni sem soubory, vlož ze schránky (Ctrl+V)
            nebo <span class="linklike" id="fPick">vyber fotky</span></span>
        </div>
      </div>
      <div class="ba-hint">U každé fotky se datum vezme z jejích údajů (kdy byla vyfocená);
        když ho fotka nemá, použije se datum nastavené výše. Fotky se před uložením zmenší,
        ať se stránka rychle načítá – popisek i datum jde kdykoli upravit.</div>

      <div class="ba-progress" id="fProg" hidden></div>
    </div>

    <div class="fot-bar">
      <span class="fot-count" id="fCount"></span>
      <button class="btn" id="fOrder" type="button"></button>
    </div>

    <div id="fBody"></div>

    <div class="lightbox" id="fLight" hidden>
      <button class="lb-close" id="fLbClose" aria-label="Zavřít">✕</button>
      <button class="lb-nav lb-prev" id="fLbPrev" aria-label="Předchozí">‹</button>
      <figure class="lb-fig">
        <img id="fLbImg" alt="" />
        <figcaption id="fLbCap"></figcaption>
      </figure>
      <button class="lb-nav lb-next" id="fLbNext" aria-label="Další">›</button>
    </div>`;

  const $ = id => mount.querySelector('#' + id);
  const statusEl = $('fStatus'), authorEl = $('fAuthor'), dateEl = $('fDate'),
        capEl = $('fCaption'), bodyEl = $('fBody'), progEl = $('fProg'),
        countEl = $('fCount'), orderBtn = $('fOrder');

  dateEl.value = todayISO();
  try {
    const a = localStorage.getItem(AUTHOR_KEY);
    if(a && AUTHORS.includes(a)) authorEl.value = a;
  } catch(e){}
  authorEl.addEventListener('change', () => { try { localStorage.setItem(AUTHOR_KEY, authorEl.value); } catch(e){} });

  let newestFirst = false;
  try { newestFirst = localStorage.getItem(ORDER_KEY) === 'new'; } catch(e){}
  const orderLabel = () => { orderBtn.textContent = newestFirst ? '🔼 Řadit nejstarší nahoře' : '🔽 Řadit nejnovější nahoře'; };
  orderLabel();
  orderBtn.addEventListener('click', () => {
    newestFirst = !newestFirst;
    try { localStorage.setItem(ORDER_KEY, newestFirst ? 'new' : 'old'); } catch(e){}
    orderLabel();
    render(items);
  });

  /* --- backend s fallbackem --- */
  let backend = null, items = [], editing = null;

  function setStatus(kind, html){
    statusEl.className = 'statusbar board-status' + (kind ? ' ' + kind : '');
    statusEl.innerHTML = html;
  }
  async function goLocal(reason){
    backend = localBackend();
    await backend.seedIfEmpty(SEED_PHOTOS);
    setStatus('', '🔒 Fotky se ukládají jen v tomto prohlížeči' + (reason ? ' – ' + reason : '') + '.');
    backend.subscribe(render);
  }

  const useFb = firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey.length > 10;
  if(useFb){
    try {
      backend = await firebaseBackend();
      await backend.seedIfEmpty(SEED_PHOTOS);
      setStatus('ok', '🟢 Sdílené online – fotky vidí všichni v reálném čase.');
      let fell = false;
      backend.subscribe(render, () => {
        if(fell) return; fell = true;
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

  /* --- přidávání fotek --- */
  function busy(on, txt){
    progEl.hidden = !on;
    if(on) progEl.textContent = txt;
  }

  async function addFiles(fileList){
    const files = [...fileList].filter(f => /^image\//.test(f.type));
    if(!files.length) return;
    const author = authorEl.value;
    const caption = (capEl.value || '').trim();
    const fallbackDate = isISO(dateEl.value) ? dateEl.value : todayISO();

    busy(true, `Zpracovávám ${files.length === 1 ? 'fotku' : 'fotky'}…`);
    let ok = 0, fail = 0;
    for(const f of files){
      try {
        const date = (await exifDate(f)) || fallbackDate;
        const thumb = await blobToDataURL(await compressFile(f, THUMB_DIM, THUMB_Q));
        const full  = await blobToDataURL(await compressForInline(f));
        await backend.add({ date, caption, author, thumb, ts: Date.now() }, full);
        ok++;
      } catch(e){ console.error(e); fail++; }
      busy(true, `Ukládám… (${ok + fail}/${files.length})`);
    }
    busy(false);
    capEl.value = '';
    if(fail) alert(fail === files.length ? 'Fotky se nepodařilo přidat.' : `${fail} z ${files.length} fotek se nepodařilo přidat.`);
  }

  const fileEl = $('fFile'), drop = $('fDrop');
  const pick = () => fileEl.click();
  $('fPick').addEventListener('click', e => { e.stopPropagation(); pick(); });
  drop.addEventListener('click', pick);
  drop.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); pick(); } });
  fileEl.addEventListener('change', () => { addFiles(fileEl.files); fileEl.value = ''; });
  ['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => {
    e.preventDefault();
    if(ev === 'dragleave' && drop.contains(e.relatedTarget)) return;
    drop.classList.remove('over');
  }));
  drop.addEventListener('drop', e => { if(e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files); });
  window.addEventListener('paste', e => {
    const list = e.clipboardData && e.clipboardData.items;
    if(!list) return;
    const files = [];
    for(const it of list){
      if(it.kind === 'file'){ const f = it.getAsFile(); if(f && /^image\//.test(f.type)) files.push(f); }
    }
    if(files.length){ e.preventDefault(); addFiles(files); }
  });

  /* --- vykreslení časové osy --- */
  const byDate = (a, b) => (a.date || '').localeCompare(b.date || '') || (a.ts || 0) - (b.ts || 0);

  function sorted(list){
    const s = [...list].sort(byDate);
    return newestFirst ? s.reverse() : s;
  }
  function groups(list){
    const out = [];
    sorted(list).forEach(it => {
      const last = out[out.length - 1];
      if(last && last.date === it.date) last.items.push(it);
      else out.push({ date: it.date, items: [it] });
    });
    return out;
  }

  function cardHTML(it){
    const who = `<span class="who who-${slug(it.author)}">${esc(it.author || '')}</span>`;
    const src = it.thumb || it.src || '';
    if(editing === it.id){
      return `<figure class="fot-card editing" data-id="${esc(it.id)}">
        <img src="${esc(src)}" alt="" loading="lazy" />
        <figcaption class="fot-edit">
          <input type="text" class="fot-in-cap" value="${esc(it.caption || '')}" placeholder="Popisek fotky" />
          <input type="date" class="fot-in-date" value="${esc(it.date || '')}" />
          <div class="fot-edit-btns">
            <button class="btn primary" data-save="${esc(it.id)}" type="button">Uložit</button>
            <button class="btn" data-cancel="1" type="button">Zrušit</button>
          </div>
        </figcaption>
      </figure>`;
    }
    return `<figure class="fot-card" data-id="${esc(it.id)}">
      <div class="fot-tools">
        <button data-edit="${esc(it.id)}" title="Upravit popisek nebo datum" aria-label="Upravit">✎</button>
        <button data-del="${esc(it.id)}" title="Smazat fotku" aria-label="Smazat">🗑</button>
      </div>
      <button class="fot-thumb" data-open="${esc(it.id)}" aria-label="Zvětšit fotku">
        <img src="${esc(src)}" alt="${esc(it.caption || 'Fotka ze stavby')}" loading="lazy" />
      </button>
      <figcaption>
        ${it.caption ? `<span class="fot-cap">${esc(it.caption)}</span>` : '<span class="fot-cap fot-cap-empty">Bez popisku</span>'}
        <span class="fot-meta">${who}${it.ts ? ` · přidáno ${esc(fmtAdded(it.ts))}` : ''}</span>
      </figcaption>
    </figure>`;
  }

  function render(list){
    items = Array.isArray(list) ? list : [];
    const dnu = groups(items).length;
    const plural = (n, a, b, c) => n === 1 ? a : (n < 5 ? b : c);
    countEl.textContent = items.length
      ? `${items.length} ${plural(items.length, 'fotka', 'fotky', 'fotek')} · ${dnu} ${plural(dnu, 'den', 'dny', 'dní')}`
      : '';
    orderBtn.hidden = items.length < 2;

    if(!items.length){
      bodyEl.innerHTML = `<div class="board-empty">
        <span class="be-ic">📷</span>
        <p>Zatím tu nejsou žádné fotky. Přidej první výše – rovnou z mobilu od základů.</p>
      </div>`;
      return;
    }
    bodyEl.innerHTML = groups(items).map(g => `
      <section class="fot-day">
        <h2>${esc(fmtDay(g.date))} <span class="fot-n">${g.items.length}</span></h2>
        <div class="gallery">${g.items.map(cardHTML).join('')}</div>
      </section>`).join('');
  }

  /* --- úpravy a mazání --- */
  bodyEl.addEventListener('click', e => {
    const del = e.target.closest('[data-del]');
    if(del){
      const it = items.find(i => i.id === del.dataset.del);
      if(it && confirm('Opravdu smazat tuto fotku?')){
        backend.remove(it).catch(err => { console.error(err); alert('Smazání se nepodařilo.'); });
      }
      return;
    }
    const edit = e.target.closest('[data-edit]');
    if(edit){ editing = edit.dataset.edit; render(items); return; }

    if(e.target.closest('[data-cancel]')){ editing = null; render(items); return; }

    const save = e.target.closest('[data-save]');
    if(save){
      const card = save.closest('.fot-card');
      const caption = card.querySelector('.fot-in-cap').value.trim();
      const date = card.querySelector('.fot-in-date').value;
      editing = null;
      backend.update(save.dataset.save, { caption, date: isISO(date) ? date : todayISO() })
        .catch(err => { console.error(err); alert('Uložení se nepodařilo.'); });
      return;
    }

    const open = e.target.closest('[data-open]');
    if(open) openLb(open.dataset.open);
  });

  bodyEl.addEventListener('keydown', e => {
    if(e.key !== 'Enter' || !e.target.matches('.fot-in-cap, .fot-in-date')) return;
    const btn = e.target.closest('.fot-card').querySelector('[data-save]');
    if(btn) btn.click();
  });

  /* --- lightbox (fotka ve velkém se stahuje až teď) --- */
  const light = $('fLight'), lbImg = $('fLbImg'), lbCap = $('fLbCap');
  const fullCache = new Map();
  let lbList = [], lbIdx = 0, lbToken = 0;

  async function showLb(){
    const it = lbList[lbIdx];
    if(!it) return;
    const token = ++lbToken;
    lbImg.src = it.thumb || it.src || '';
    lbImg.alt = it.caption || '';
    const who = esc(it.author || '');
    const sub = `<span class="lb-sub">${esc(fmtDay(it.date))}${who ? ' · ' + who : ''} · ${lbIdx + 1}/${lbList.length}</span>`;
    lbCap.innerHTML = `<b>${esc(it.caption || '')}</b> ${sub}`;

    if(!it.fullId) return;                              // fotka ze složky v repu – už je v plné velikosti
    if(fullCache.has(it.fullId)){ lbImg.src = fullCache.get(it.fullId); return; }
    lbCap.innerHTML = `<b>${esc(it.caption || '')}</b> ${sub} <span class="lb-sub">· načítám plnou velikost…</span>`;
    try {
      const full = await backend.getFull(it.fullId);
      if(full) fullCache.set(it.fullId, full);
      if(token === lbToken){
        if(full) lbImg.src = full;
        lbCap.innerHTML = `<b>${esc(it.caption || '')}</b> ${sub}`;
      }
    } catch(err){
      console.error(err);
      if(token === lbToken) lbCap.innerHTML = `<b>${esc(it.caption || '')}</b> ${sub} <span class="lb-sub">· plnou velikost se nepodařilo načíst</span>`;
    }
  }
  function openLb(id){
    lbList = sorted(items);
    lbIdx = Math.max(0, lbList.findIndex(i => i.id === id));
    light.hidden = false;
    document.body.style.overflow = 'hidden';
    showLb();
  }
  function closeLb(){
    light.hidden = true; lbImg.src = ''; lbToken++;
    document.body.style.overflow = '';
  }
  function step(d){
    if(!lbList.length) return;
    lbIdx = (lbIdx + d + lbList.length) % lbList.length;
    showLb();
  }
  $('fLbClose').addEventListener('click', closeLb);
  $('fLbPrev').addEventListener('click', () => step(-1));
  $('fLbNext').addEventListener('click', () => step(1));
  light.addEventListener('click', e => { if(e.target === light) closeLb(); });
  window.addEventListener('keydown', e => {
    if(light.hidden) return;
    if(e.key === 'Escape') closeLb();
    else if(e.key === 'ArrowLeft') step(-1);
    else if(e.key === 'ArrowRight') step(1);
  });

  // testovací háček (neškodný) – ať jde přidávání ověřit z automatického testu
  window.__fotky = { add: addFiles, items: () => items, exifDate };
}
