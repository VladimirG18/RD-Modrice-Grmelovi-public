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

/* české skloňování počtů */
const pluralCz = (n, a, b, c) => n === 1 ? a : (n < 5 ? b : c);

/* odkud se vzalo datum focení (ukazuje se u fotky) */
const SRC_TEXT = { fotka:'z fotky', nazev:'z názvu souboru',
                   soubor:'z data souboru', formular:'z formuláře' };

const FAZE_COLL  = 'harmonogram_faze';            // fáze se čtou z harmonogramu (jen pro čtení)
const FAZE_LOCAL = 'rdmodrice-harmonogram-faze-v1';
const PHASE_ICON = { hotovo:'✅', probiha:'🛠️', planovano:'📋' };

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

/* ---------- Datum pořízení fotky ----------
   Zkouší se popořadě: EXIF ve fotce → datum v názvu souboru (fotky
   přeposlané přes WhatsApp apod. o EXIF přijdou, ale datum jim zůstane
   v názvu) → datum souboru → datum z formuláře. Jde vždycky přepsat. */

/* Vypadá to datum rozumně? (chrání před nesmysly typu 1980 u foťáku
   s vybitou baterií nebo číslem v názvu, které datum jen připomíná) */
function plausible(iso){
  if(!isISO(iso)) return false;
  const d = new Date(iso + 'T12:00:00');
  if(isNaN(d) || d.toLocaleDateString('sv-SE') !== iso) return false;   // třeba 31. 2. neexistuje
  if(Number(iso.slice(0, 4)) < 2015) return false;
  const zitra = new Date(Date.now() + 864e5).toLocaleDateString('sv-SE');
  return iso <= zitra;                                                  // ne z budoucnosti
}

/* Datum v názvu souboru: IMG-20260902-WA0001, IMG_20260902_101530,
   PXL_20260902_..., 20260902_101530, 2026-09-02 10.15.30, Screenshot_2026-09-02… */
export function dateFromName(name){
  const m = /(20\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])/.exec(String(name || ''));
  if(!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  return plausible(iso) ? iso : null;
}

function fileDate(file){
  const t = Number(file && file.lastModified);
  if(!t) return null;
  const iso = new Date(t).toLocaleDateString('sv-SE');
  return plausible(iso) ? iso : null;
}

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

/* JPEG: projdi segmenty a najdi APP1 s EXIF (nejspolehlivější cesta) */
function jpegExifDate(v){
  try {
    if(v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return null;
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
  } catch(e){ /* nevadí – zkusí se ostatní způsoby */ }
  return null;
}

/* Ostatní formáty (HEIC z iPhonu, WebP…): najdi v souboru značku
   „Exif\0\0" a přečti TIFF hned za ní. */
function scanExifDate(v){
  const limit = Math.min(v.byteLength - 8, 512 * 1024);
  for(let i = 0; i < limit; i++){
    if(v.getUint8(i) !== 0x45) continue;                  // 'E' – rychlé přeskočení
    if(v.getUint32(i) === 0x45786966 && v.getUint16(i + 4) === 0){
      const d = readTiff(v, i + 6);
      if(d) return d;
    }
  }
  return null;
}

export async function exifDate(file){
  try {
    const v = new DataView(await file.slice(0, 512 * 1024).arrayBuffer());
    const d = jpegExifDate(v) || scanExifDate(v);
    return plausible(d) ? d : null;
  } catch(e){ return null; }
}

/* Výsledné datum fotky + odkud se vzalo (kvůli popisku u fotky). */
export async function detectDate(file, formDate){
  const fromExif = await exifDate(file);
  if(fromExif) return { date: fromExif, src:'fotka' };

  const fromName = dateFromName(file.name);
  if(fromName) return { date: fromName, src:'nazev' };

  // datum souboru použij, jen když uživatel ve formuláři nechal dnešek
  const fromFile = fileDate(file);
  const today = todayISO();
  if(fromFile && fromFile < today && (!isISO(formDate) || formDate === today)){
    return { date: fromFile, src:'soubor' };
  }
  return { date: isISO(formDate) ? formDate : today, src:'formular' };
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

/* ---------- Fáze stavby (čtou se z harmonogramu) ---------- */
const useFirebase = () => !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey.length > 10);

/* jedna Firebase aplikace pro fotky i pro čtení fází */
async function fbApp(){
  const { initializeApp, getApps } = await import(`${FB_VER}/firebase-app.js`);
  return getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
}

function localPhases(){
  const a = loadJson(FAZE_LOCAL, []);
  return Array.isArray(a) ? [...a].sort((x, y) => (x.order || 0) - (y.order || 0)) : [];
}

/* Fáze jen čteme – upravují se na stránce Harmonogram. */
export async function watchPhases(cb){
  if(useFirebase()){
    try {
      const { getFirestore, collection, onSnapshot, query, orderBy } = await import(`${FB_VER}/firebase-firestore.js`);
      const db = getFirestore(await fbApp());
      onSnapshot(query(collection(db, FAZE_COLL), orderBy('order', 'asc')),
        snap => cb(snap.docs.map(d => ({ id:d.id, ...d.data() }))),
        err  => { console.warn('Fáze harmonogramu:', err); cb(localPhases()); });
      return;
    } catch(e){ console.warn('Fáze harmonogramu:', e); }
  }
  cb(localPhases());
}

/* Do které fáze fotka podle data spadá – vyhrává fáze, která začala
   nejpozději před datem fotky a ještě neskončila (fáze se překrývají). */
export function phaseForDate(phases, iso){
  if(!isISO(iso) || !Array.isArray(phases)) return null;
  const month = iso.slice(0, 7);
  const hit = phases.filter(f => f.start && month >= f.start && (!f.end || month <= f.end));
  if(!hit.length) return null;
  hit.sort((a, b) => String(a.start).localeCompare(String(b.start)) || (a.order || 0) - (b.order || 0));
  return hit[hit.length - 1];
}

/* ---------- Firebase (Firestore, realtime) ---------- */
async function firebaseBackend(){
  const { getFirestore, collection, addDoc, deleteDoc, updateDoc, doc, getDoc, onSnapshot, writeBatch }
    = await import(`${FB_VER}/firebase-firestore.js`);

  const db  = getFirestore(await fbApp());
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
        <label class="ba-field">Fáze stavby
          <select id="fPhase"><option value="auto">⏱️ Podle data fotky</option></select>
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
      <div class="ba-hint">Datum focení si aplikace u každé fotky vezme sama – z údajů ve fotce,
        případně z názvu souboru (fotky přeposlané přes WhatsApp o své údaje přijdou, datum jim ale
        zůstane v názvu). Teprve když se nedá zjistit, použije se datum nastavené výše. Fotky se před
        uložením zmenší, ať se stránka rychle načítá – popisek, datum i fáze jdou kdykoli upravit.
        Fáze se nabízejí z <a href="harmonogram.html">harmonogramu</a>; ve výchozím nastavení
        se ke každé fotce doplní ta, do které podle data spadá.</div>

      <div class="ba-progress" id="fProg" hidden></div>
    </div>

    <div class="fot-bar">
      <span class="fot-count" id="fCount"></span>
      <button class="btn" id="fFill" type="button" hidden></button>
      <button class="btn" id="fOrder" type="button"></button>
    </div>

    <div class="board-filter" id="fFilter"></div>
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
        countEl = $('fCount'), orderBtn = $('fOrder'), phaseEl = $('fPhase'),
        filterEl = $('fFilter'), fillBtn = $('fFill');

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

  /* --- fáze stavby (jen se čtou z harmonogramu) --- */
  let phases = [], activePhase = null;      // activePhase: null = vše, '' = bez fáze, jinak id fáze
  try {
    const f = new URLSearchParams(location.search).get('faze');
    if(f !== null) activePhase = f;         // odkaz z harmonogramu: ?faze=<id>
  } catch(e){}

  const phaseById = id => phases.find(f => f.id === id) || null;
  const phaseLabel = it => {
    const f = phaseById(it.phase);
    return f ? f.name : (it.phaseName || '');
  };
  const phaseIcon = it => {
    const f = phaseById(it.phase);
    return PHASE_ICON[f ? f.status : ''] || '🏗️';
  };

  function fillPhaseSelect(){
    const cur = phaseEl.value;
    phaseEl.innerHTML = `<option value="auto">⏱️ Podle data fotky</option>` +
      `<option value="">— bez fáze —</option>` +
      phases.map(f => `<option value="${esc(f.id)}">${PHASE_ICON[f.status] || '🏗️'} ${esc(f.name)}${
        f.when ? ` (${esc(f.when)})` : ''}</option>`).join('');
    if(cur && [...phaseEl.options].some(o => o.value === cur)) phaseEl.value = cur;
  }
  fillPhaseSelect();

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

  const useFb = useFirebase();
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
  let busyTimer = null;
  function busy(on, txt){
    clearTimeout(busyTimer);
    progEl.hidden = !on;
    if(on) progEl.textContent = txt;
  }

  async function addFiles(fileList){
    const files = [...fileList].filter(f => /^image\//.test(f.type) || /\.(hei[cf]|jpe?g|png|webp)$/i.test(f.name || ''));
    if(!files.length) return;
    const author = authorEl.value;
    const caption = (capEl.value || '').trim();
    const formDate = isISO(dateEl.value) ? dateEl.value : todayISO();
    const phaseChoice = phaseEl.value;          // 'auto' | '' | id fáze

    busy(true, `Zpracovávám ${files.length === 1 ? 'fotku' : 'fotky'}…`);
    let ok = 0, fail = 0, heic = 0;
    const zdroje = {};
    for(const f of files){
      try {
        const { date, src } = await detectDate(f, formDate);
        const thumb = await blobToDataURL(await compressFile(f, THUMB_DIM, THUMB_Q));
        const full  = await blobToDataURL(await compressForInline(f));
        const faze = phaseChoice === 'auto' ? phaseForDate(phases, date) : phaseById(phaseChoice);
        await backend.add({ date, dateSrc: src, caption, author, thumb, ts: Date.now(),
          phase: faze ? faze.id : null, phaseName: faze ? faze.name : null }, full);
        zdroje[src] = (zdroje[src] || 0) + 1;
        ok++;
      } catch(e){
        console.error(e);
        fail++;
        if(/hei[cf]/i.test(f.type || '') || /\.hei[cf]$/i.test(f.name || '')) heic++;
      }
      busy(true, `Ukládám… (${ok + fail}/${files.length})`);
    }

    capEl.value = '';
    // shrnutí – ať je vidět, odkud se u fotek vzalo datum
    if(ok){
      const kde = Object.keys(zdroje).map(k => `${zdroje[k]}× ${SRC_TEXT[k]}`).join(', ');
      const kolik = ok === 1 ? 'Přidána 1 fotka' : (ok < 5 ? `Přidány ${ok} fotky` : `Přidáno ${ok} fotek`);
      busy(true, `✅ ${kolik} · datum: ${kde}.`);
      clearTimeout(busyTimer);
      busyTimer = setTimeout(() => busy(false), 9000);
    } else {
      busy(false);
    }
    if(fail){
      alert((fail === files.length ? 'Fotky se nepodařilo přidat.' : `${fail} z ${files.length} fotek se nepodařilo přidat.`) +
        (heic ? '\n\nFotky ve formátu HEIC (z iPhonu) prohlížeč neumí zpracovat – ulož je prosím jako JPEG, ' +
                'nebo si v iPhonu přepni Nastavení → Fotoaparát → Formáty na „Nejkompatibilnější".' : ''));
    }
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
          <select class="fot-in-phase">
            <option value=""${it.phase ? '' : ' selected'}>— bez fáze —</option>
            ${phases.map(f => `<option value="${esc(f.id)}"${f.id === it.phase ? ' selected' : ''}>${
              PHASE_ICON[f.status] || '🏗️'} ${esc(f.name)}</option>`).join('')}
          </select>
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
        ${phaseLabel(it) ? `<button class="fot-phase" type="button" data-phase="${esc(it.phase || '')}"
            title="Zobrazit jen fotky z této fáze">${phaseIcon(it)} <span>${esc(phaseLabel(it))}</span></button>` : ''}
        ${it.caption ? `<span class="fot-cap">${esc(it.caption)}</span>` : '<span class="fot-cap fot-cap-empty">Bez popisku</span>'}
        <span class="fot-meta">${who}${it.ts ? ` · přidáno ${esc(fmtAdded(it.ts))}` : ''}${
          it.dateSrc && it.dateSrc !== 'formular' && SRC_TEXT[it.dateSrc]
            ? ` · <span class="fot-src" title="Datum focení ${esc(SRC_TEXT[it.dateSrc])}">${
                it.dateSrc === 'fotka' ? '📷 z fotky' : it.dateSrc === 'nazev' ? '🏷️ z názvu' : '🗂️ ze souboru'}</span>`
            : ''}</span>
      </figcaption>
    </figure>`;
  }

  function renderFilter(){
    if(!items.length || (!phases.length && !items.some(i => i.phase))){ filterEl.innerHTML = ''; return; }
    const pocty = {};
    items.forEach(i => { const k = i.phase || ''; pocty[k] = (pocty[k] || 0) + 1; });
    const chip = (val, label, n) =>                       // val === null → „Vše"
      `<button class="fchip${activePhase === val ? ' on' : ''}" ${
        val === null ? 'data-vse="1"' : `data-faze="${esc(val)}"`}>${label} <b>${n}</b></button>`;
    let html = chip(null, 'Vše', items.length);
    phases.forEach(f => { if(pocty[f.id]) html += chip(f.id, `${PHASE_ICON[f.status] || '🏗️'} ${esc(f.name)}`, pocty[f.id]); });
    // fotky s fází, která už v harmonogramu není
    const zname = new Set(phases.map(f => f.id));
    const cizi = items.filter(i => i.phase && !zname.has(i.phase));
    if(cizi.length) html += chip(cizi[0].phase, `🏗️ ${esc(cizi[0].phaseName || 'Jiná fáze')}`, cizi.length);
    if(pocty['']) html += chip('', 'Bez fáze', pocty['']);
    filterEl.innerHTML = html;
  }

  const vFiltru = () => activePhase === null ? items : items.filter(i => (i.phase || '') === activePhase);

  function render(list){
    items = Array.isArray(list) ? list : [];
    const dnu = groups(vFiltru()).length;
    const plural = pluralCz;
    const kolik = vFiltru().length;
    countEl.textContent = kolik
      ? `${kolik} ${plural(kolik, 'fotka', 'fotky', 'fotek')} · ${dnu} ${plural(dnu, 'den', 'dny', 'dní')}`
      : '';
    orderBtn.hidden = items.length < 2;

    renderFilter();
    updateFillBtn();

    if(!items.length){
      bodyEl.innerHTML = `<div class="board-empty">
        <span class="be-ic">📷</span>
        <p>Zatím tu nejsou žádné fotky. Přidej první výše – rovnou z mobilu od základů.</p>
      </div>`;
      return;
    }
    const vybrane = vFiltru();
    if(!vybrane.length){
      bodyEl.innerHTML = `<div class="board-empty"><p>V této fázi zatím žádné fotky nejsou.</p></div>`;
      return;
    }
    bodyEl.innerHTML = groups(vybrane).map(g => `
      <section class="fot-day">
        <h2>${esc(fmtDay(g.date))} <span class="fot-n">${g.items.length}</span></h2>
        <div class="gallery">${g.items.map(cardHTML).join('')}</div>
      </section>`).join('');
  }

  /* --- hromadné doplnění fází u fotek, které ji ještě nemají --- */
  const bezFaze = () => items.filter(i => !i.phase && phaseForDate(phases, i.date));

  function updateFillBtn(){
    const n = bezFaze().length;
    fillBtn.hidden = !n;
    if(n) fillBtn.textContent = `🏗️ Doplnit fáze podle data (${n})`;
  }

  fillBtn.addEventListener('click', async () => {
    const list = bezFaze();
    if(!list.length) return;
    if(!confirm(`Doplnit fázi u ${list.length} ${pluralCz(list.length, 'fotky', 'fotek', 'fotek')} bez fáze?\n\n` +
      'U každé se použije fáze z harmonogramu, do které fotka podle data spadá. ' +
      'Fotky, které fázi už mají, se nemění.')) return;
    fillBtn.disabled = true;
    let ok = 0;
    for(const it of list){
      const f = phaseForDate(phases, it.date);
      if(!f) continue;
      try { await backend.update(it.id, { phase:f.id, phaseName:f.name }); ok++; }
      catch(e){ console.error(e); }
      busy(true, `Doplňuji fáze… (${ok}/${list.length})`);
    }
    fillBtn.disabled = false;
    busy(true, `✅ Fáze doplněna u ${ok} ${pluralCz(ok, 'fotky', 'fotek', 'fotek')}.`);
    clearTimeout(busyTimer);
    busyTimer = setTimeout(() => busy(false), 7000);
  });

  /* --- filtr podle fáze --- */
  function setPhaseFilter(val){          // null = vše
    activePhase = val;
    try {
      const url = new URL(location.href);
      if(val === null) url.searchParams.delete('faze'); else url.searchParams.set('faze', val);
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch(e){}
    render(items);
  }
  filterEl.addEventListener('click', e => {
    const b = e.target.closest('.fchip');
    if(!b) return;
    setPhaseFilter(b.dataset.vse ? null : (b.dataset.faze || ''));
  });

  /* --- úpravy a mazání --- */
  bodyEl.addEventListener('click', e => {
    const chip = e.target.closest('.fot-phase');
    if(chip){ setPhaseFilter(chip.dataset.phase || ''); return; }

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
      const phaseSel = card.querySelector('.fot-in-phase');
      const faze = phaseSel ? phaseById(phaseSel.value) : null;
      editing = null;
      const orig = items.find(i => i.id === save.dataset.save);
      const novy = isISO(date) ? date : todayISO();
      const patch = { caption, date: novy,
        phase: faze ? faze.id : null, phaseName: faze ? faze.name : null };
      if(orig && orig.date !== novy) patch.dateSrc = 'rucne';     // datum zadané ručně
      backend.update(save.dataset.save, patch)
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
    const faze = phaseLabel(it);
    const sub = `<span class="lb-sub">${esc(fmtDay(it.date))}${who ? ' · ' + who : ''}${
      faze ? ` · ${phaseIcon(it)} ${esc(faze)}` : ''} · ${lbIdx + 1}/${lbList.length}</span>`;
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
    lbList = sorted(vFiltru());
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

  // fáze z harmonogramu (živě – když se harmonogram změní, štítky se přizpůsobí)
  watchPhases(list => {
    phases = Array.isArray(list) ? list : [];
    fillPhaseSelect();
    render(items);
  });

  // testovací háček (neškodný) – ať jde přidávání ověřit z automatického testu
  window.__fotky = { add: addFiles, items: () => items, exifDate, detectDate, dateFromName,
                     phases: () => phases, phaseForDate, filter: setPhaseFilter,
                     fill: () => fillBtn.click() };
}
