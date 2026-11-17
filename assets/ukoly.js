/* ============================================================
   RD Modřice – Grmelovi · sdílené úkoly (kolekce `ukoly`)
   Jeden seznam věcí k zařízení pro celou rodinu – nahrazuje dřívější
   Checklist i checklisty u přípojek, které se ukládaly jen v jednom
   prohlížeči. Úkol: { text, group, who, due, phase, done, doneBy, doneAt,
   note, urgent, key, order, ts }. `key` = id položky ze starého checklistu
   (kvůli převzetí odškrtnutí z prohlížeče). Realtime přes Firestore,
   při nedostupnosti záloha v localStorage.
   ============================================================ */
import { firebaseConfig } from './firebase-config.js';

const FB_VER = 'https://www.gstatic.com/firebasejs/10.12.2';
export const AUTHORS = ['Lucka', 'Vladimír', 'Jirka', 'Jarka'];
export const AUTHOR_KEY = 'rdmodrice-board-author';      // „kdo jsem" – společné pro celý web
const LOCAL_KEY = 'rdmodrice-ukoly-v1';

export const esc = s => (s == null ? '' : String(s)).replace(/[&<>"']/g, m =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
export const slug = s => (s || '').toLowerCase()
  .replace(/á/g,'a').replace(/í/g,'i').replace(/ř/g,'r').replace(/[^a-z]/g,'');
export const todayISO = () => new Date().toLocaleDateString('sv-SE');

export function myName(){
  try { const a = localStorage.getItem(AUTHOR_KEY); return AUTHORS.includes(a) ? a : ''; } catch(e){ return ''; }
}
export function setMyName(a){ try { localStorage.setItem(AUTHOR_KEY, a); } catch(e){} }

/* Termín: 'over' = po termínu, 'soon' = do týdne, '' = jinak */
export function dueState(t){
  if(!t || t.done || !/^\d{4}-\d{2}-\d{2}$/.test(t.due || '')) return '';
  const today = todayISO();
  if(t.due < today) return 'over';
  const week = new Date(Date.now() + 7 * 86400000).toLocaleDateString('sv-SE');
  return t.due <= week ? 'soon' : '';
}
export function fmtDue(iso){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if(!m) return '';
  const y = Number(m[1]) === new Date().getFullYear() ? '' : ' ' + m[1];
  return `${Number(m[3])}. ${Number(m[2])}.${y}`;
}

/* ---------- Výchozí úkoly (převzaté ze starého Checklistu a z přípojek) ----------
   Skupina „Hrubá stavba" ze starého checklistu sem nepatří – stavební kroky
   jsou v harmonogramu. Hotové jsou jen ty, u kterých to je jisté. */
export const GROUP_ORDER = ['Příprava a povolení', 'Financování', 'Přípojky – elektřina', 'Přípojky – plyn',
  'Přípojky – voda', 'Přípojky – kanalizace', 'Přípojky – ostatní', 'Rozhodnutí – interiér', 'Dokončení a okolí'];

const C = (g, text, extra = {}) => ({ group:g, text, key: g + '::' + text, ...extra });
const P = (g, key, text, extra = {}) => ({ group:g, text, key, ...extra });
export const DEFAULT_TASKS = [
  C('Příprava a povolení', 'Koupě / vyřešení pozemku', { done:true }),
  C('Příprava a povolení', 'Geodetické zaměření pozemku'),
  C('Příprava a povolení', 'Geologický / radonový průzkum', { done:true }),
  C('Příprava a povolení', 'Studie a projektová dokumentace (DSP)', { done:true }),
  C('Příprava a povolení', 'Vyjádření správců sítí (elektřina, voda, plyn, kanalizace)', { done:true }),
  C('Příprava a povolení', 'Stavební povolení / ohlášení', { done:true }),
  C('Příprava a povolení', 'Výběr stavební firmy / dodavatele', { done:true }),
  C('Příprava a povolení', 'Demolice stávající garáže na pozemku', { done:true }),
  C('Financování', 'Rozpočet stavby', { done:true }),
  C('Financování', 'Hypotéka / úvěr schválen'),
  C('Financování', 'Rezerva na vícepráce (10–15 %)'),
  C('Financování', 'Pojištění stavby'),
  P('Přípojky – elektřina', 'pripojky-elektro-1', 'Vyfotit typový štítek/výrobní číslo skříně u souseda (je to SS300?) a ověřit, kolik má uvnitř sad pojistek a jak jsou označené'),
  P('Přípojky – elektřina', 'pripojky-elektro-2', 'Nahlásit EG.D fotky a polohu skříně s odkazem na smlouvu č. 9002317986 – zeptat se, jestli je to tatáž skříň ze smlouvy a kdy do ní přibude naše sada pojistek'),
  P('Přípojky – elektřina', 'pripojky-elektro-3', 'Po potvrzení hotové skříně: objednat elektrikáře na vybudování kabelu od HDS + elektroměrový rozvaděč'),
  P('Přípojky – elektřina', 'pripojky-elektro-4', 'Objednat revizního technika – revizní zpráva elektroinstalace'),
  P('Přípojky – elektřina', 'pripojky-elektro-5', 'Vybrat dodavatele elektřiny a podepsat smlouvu o sdružených službách dodávky'),
  P('Přípojky – elektřina', 'pripojky-elektro-6', 'Podat žádost o osazení elektroměru (EG.D/dodavatel) – po revizi'),
  P('Přípojky – plyn', 'pripojky-plyn-1', 'Ověřit fyzický stav na pozemku (je HUP / přípojka již položená, nebo ne)'),
  P('Přípojky – plyn', 'pripojky-plyn-2', 'Objednat firmu s oprávněním pro plynová zařízení na vybudování přípojky dle hotového projektu'),
  P('Přípojky – plyn', 'pripojky-plyn-3', 'Zajistit povinnou tlakovou zkoušku přípojky před zásypem'),
  P('Přípojky – plyn', 'pripojky-plyn-4', 'Objednat revizi plynového zařízení (revizní zpráva)'),
  P('Přípojky – plyn', 'pripojky-plyn-5', 'Podat u GasNet žádost o uvedení do provozu / zahájení distribuce'),
  P('Přípojky – plyn', 'pripojky-plyn-6', 'Vybrat dodavatele plynu a podepsat samostatnou smlouvu o dodávce plynu'),
  P('Přípojky – plyn', 'pripojky-plyn-7', 'Po zahájení distribuce – osazení plynoměru (provádí GasNet)'),
  P('Přípojky – voda', 'pripojky-voda-8', 'Řešit realizaci před zimou (BVK v zimě nepřipojuje)', { urgent:true }),
  P('Přípojky – voda', 'pripojky-voda-1', 'Objednat u přípojkového oddělení BVK realizaci (smlouva o dílo, dotazník, plná moc, čestné prohlášení)', { urgent:true }),
  P('Přípojky – voda', 'pripojky-voda-2', 'Uhradit zálohu (BVK běžně požaduje 80 % ceny předem)'),
  P('Přípojky – voda', 'pripojky-voda-3', 'Objednat vytyčení sítí BVK (min. 3 dny předem), případně povolení zvláštního užívání komunikace'),
  P('Přípojky – voda', 'pripojky-voda-4', 'Zajistit výkop a vodoměrnou šachtu (dodavatel investora) – navrtávku, odbočku a vodoměr dělá BVK'),
  P('Přípojky – voda', 'pripojky-voda-5', 'Povinná tlaková zkouška za přítomnosti BVK'),
  P('Přípojky – voda', 'pripojky-voda-6', 'Závěrečná technická prohlídka (geodetické zaměření, přípojkový list V1, protokol)'),
  P('Přípojky – voda', 'pripojky-voda-7', 'Po instalaci vodoměru podepsat smlouvu o dodávce vody s BVK'),
  C('Přípojky – kanalizace', 'Jímka na vyvážení 6,4 m³ + vsak dešťových vod (AS-KRECHT)'),
  P('Přípojky – kanalizace', 'pripojky-kanal-1', 'Ověřit, že je jímka jako vodní dílo řádně povolena (dle stavebního povolení domu)'),
  P('Přípojky – kanalizace', 'pripojky-kanal-2', 'Zajistit smlouvu s oprávněnou firmou na pravidelný vývoz jímky'),
  P('Přípojky – kanalizace', 'pripojky-kanal-3', 'Uchovávat doklady o vývozu (pro případnou kontrolu)'),
  C('Přípojky – ostatní', 'Datová / internetová přípojka'),
  C('Rozhodnutí – interiér', 'Vytápění (tepelné čerpadlo / kotel / podlahové)'),
  C('Rozhodnutí – interiér', 'Rekuperace / větrání'),
  C('Rozhodnutí – interiér', 'Elektroinstalace – rozmístění zásuvek a světel'),
  C('Rozhodnutí – interiér', 'Rozvody vody a odpadů'),
  C('Rozhodnutí – interiér', 'Kuchyňská linka – návrh a dodavatel'),
  C('Rozhodnutí – interiér', 'Koupelny – obklady a zařizovací předměty'),
  C('Rozhodnutí – interiér', 'Podlahy – vinyl / dlažba'),
  C('Rozhodnutí – interiér', 'Vnitřní dveře'),
  C('Rozhodnutí – interiér', 'Schodiště – provedení a zábradlí'),
  C('Rozhodnutí – interiér', 'Krbová vložka (6 kW) – výběr a napojení na komín'),
  C('Dokončení a okolí', 'Fasáda a zateplení'),
  C('Dokončení a okolí', 'Terasa'),
  C('Dokončení a okolí', 'Oplocení a vjezd'),
  C('Dokončení a okolí', 'Zpevněné plochy a chodníky'),
  C('Dokončení a okolí', 'Zahrada a terénní úpravy'),
  C('Dokončení a okolí', 'Kolaudace'),
];
/* klíče starého checklistu, které se přejmenovaly (převzetí odškrtnutí) */
export const LEGACY_KEYS = {
  'Přípojky::Jímka na vyvážení 6,4 m³ + vsak dešťových vod (AS-KRECHT)': 'Přípojky – kanalizace::Jímka na vyvážení 6,4 m³ + vsak dešťových vod (AS-KRECHT)',
  'Přípojky::Datová / internetová přípojka': 'Přípojky – ostatní::Datová / internetová přípojka',
};

/* fáze harmonogramu, ke které skupina patří (podle názvu fáze) */
const GROUP_PHASE = [
  [/^Přípojky/, /přípoj/i],
  [/^Příprava/, /povolen/i],
  [/^Dokončení/, /venkovní|zahrad/i],
];
function phaseFor(group, phases){
  const rule = GROUP_PHASE.find(([g]) => g.test(group));
  if(!rule || !Array.isArray(phases)) return null;
  const p = phases.find(f => rule[1].test(f.name || ''));
  return p ? p.id : null;
}

function seedDocs(phases){
  const now = Date.now();
  return DEFAULT_TASKS.map((t, i) => ({
    text:t.text, group:t.group, key:t.key, who:'', due:null, note:'', urgent:!!t.urgent,
    phase: phaseFor(t.group, phases), done:!!t.done, doneBy: t.done ? '' : null, doneAt: t.done ? now : null,
    order:(i + 1) * 10, ts: now,
  }));
}

/* ---------- Lokální záloha ---------- */
function localBackend(){
  let items = [];
  try { items = JSON.parse(localStorage.getItem(LOCAL_KEY)) || []; } catch(e){ items = []; }
  let cb = () => {};
  const save = () => { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(items)); } catch(e){ alert('Úložiště prohlížeče je plné.'); } };
  return {
    shared:false,
    subscribe(f){ cb = f; cb(items.slice()); },
    async seedIfEmpty(phases){
      if(items.length) return;
      items = seedDocs(phases).map((d, i) => ({ id:'l' + Date.now() + '_' + i, ...d }));
      save();
    },
    async add(t){ const it = { id:'l' + Date.now() + Math.random().toString(36).slice(2, 7), ...t }; items.push(it); save(); cb(items.slice()); return it; },
    async update(id, patch){ const it = items.find(x => x.id === id); if(it){ Object.assign(it, patch); save(); cb(items.slice()); } },
    async remove(id){ items = items.filter(x => x.id !== id); save(); cb(items.slice()); },
  };
}

/* ---------- Firestore (realtime) ---------- */
async function firebaseBackend(){
  const { initializeApp, getApps } = await import(`${FB_VER}/firebase-app.js`);
  const { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, getDoc, onSnapshot, writeBatch }
    = await import(`${FB_VER}/firebase-firestore.js`);
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const col = collection(db, 'ukoly');
  const metaRef = doc(db, 'ukoly_meta', 'seed');
  return {
    shared:true,
    subscribe(cb, onError){
      onSnapshot(col, snap => cb(snap.docs.map(d => ({ id:d.id, ...d.data() }))),
        err => { console.error(err); if(onError) onError(err); });
    },
    async seedIfEmpty(phases){
      const s = await getDoc(metaRef);
      if(s.exists()) return;
      const batch = writeBatch(db);
      seedDocs(phases).forEach(d => batch.set(doc(col), d));
      batch.set(metaRef, { done:true, ts:Date.now() });
      await batch.commit();
    },
    add: t => addDoc(col, t),
    update: (id, patch) => updateDoc(doc(db, 'ukoly', id), patch),
    remove: id => deleteDoc(doc(db, 'ukoly', id)),
  };
}

/* ============================================================
   createTaskStore({ onItems(list, shared), onStatus(kind, html), phases })
   Vrací { add, update, remove, toggle(task, by), shared }.
   ============================================================ */
export async function createTaskStore(opts = {}){
  const status = (k, t) => opts.onStatus && opts.onStatus(k, t);
  let current = null;
  const facade = {
    get shared(){ return !!(current && current.shared); },
    add: t => current.add({ who:'', due:null, note:'', urgent:false, phase:null, done:false, doneBy:null, doneAt:null,
      order: Date.now(), ts: Date.now(), ...t }),
    update: (id, patch) => current.update(id, patch),
    remove: id => current.remove(id),
    toggle: (t, by) => current.update(t.id, t.done
      ? { done:false, doneBy:null, doneAt:null }
      : { done:true, doneBy: by || '', doneAt: Date.now() }),
  };
  const goLocal = async (reason) => {
    current = localBackend();
    await current.seedIfEmpty(opts.phases);
    status('', '🔒 Úkoly se ukládají jen v tomto prohlížeči' + (reason ? ' – ' + reason : '') + '.');
    current.subscribe(list => opts.onItems && opts.onItems(list, false));
  };
  const useFb = firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey.length > 10;
  if(!useFb){ await goLocal('pro sdílení doplň konfiguraci Firebase'); return facade; }
  try {
    const fb = await firebaseBackend();
    await fb.seedIfEmpty(opts.phases);
    current = fb;
    status('ok', '🟢 Sdílené online – úkoly vidí a odškrtávají všichni v reálném čase.');
    let fell = false;
    fb.subscribe(list => opts.onItems && opts.onItems(list, true), () => {
      if(fell) return; fell = true;
      status('warn', '⚠️ Online databáze není dostupná – ukládá se jen lokálně.');
      goLocal();
    });
  } catch(e){
    console.error(e);
    await goLocal('online databázi se nepodařilo načíst');
  }
  return facade;
}

/* řazení: nehotové nahoře (urgentní, pak podle termínu, pak pořadí), hotové dole */
export function sortTasks(list){
  return list.slice().sort((a, b) => {
    if(!!a.done !== !!b.done) return a.done ? 1 : -1;
    if(a.done) return (b.doneAt || 0) - (a.doneAt || 0);
    if(!!a.urgent !== !!b.urgent) return a.urgent ? -1 : 1;
    const da = a.due || '9999', db = b.due || '9999';
    if(da !== db) return da.localeCompare(db);
    return (a.order || 0) - (b.order || 0);
  });
}

/* ---------- Převzetí odškrtnutí ze starého checklistu (byla jen v prohlížeči) ---------- */
const OLD_KEYS = ['rdmodrice-checklist-v1', 'rdmodrice-stavba-checklist-v1'];
const MIGRATED = 'rdmodrice-ukoly-migrated';
export function legacyChecked(tasks){
  try { if(localStorage.getItem(MIGRATED)) return []; } catch(e){ return []; }
  const keys = new Set();
  OLD_KEYS.forEach(k => {
    try {
      const st = JSON.parse(localStorage.getItem(k) || '{}') || {};
      Object.keys(st).forEach(id => { if(st[id]) keys.add(LEGACY_KEYS[id] || id); });
    } catch(e){}
  });
  return tasks.filter(t => !t.done && t.key && keys.has(t.key));
}
export function markMigrated(){ try { localStorage.setItem(MIGRATED, String(Date.now())); } catch(e){} }

/* ============================================================
   mountGroupTasks – malý živý seznam úkolů jedné skupiny (stránky přípojek).
   Statické položky v HTML zůstávají jako záloha a pro vyhledávání,
   po načtení se nahradí sdíleným seznamem.
   ============================================================ */
export async function mountGroupTasks(el, group){
  if(!el) return;
  let tasks = [];
  const draw = () => {
    // pevné pořadí – odškrtnutý úkol zůstane na místě (neuskočí pod prst)
    const mine = tasks.filter(t => t.group === group).sort((a, b) => (a.order || 0) - (b.order || 0));
    const open = mine.filter(t => !t.done).length;
    el.innerHTML = `
      ${mine.map(t => {
        const ds = dueState(t);
        return `<label class="clitem${t.done ? ' done' : ''}${t.urgent && !t.done ? ' urgent' : ''}">
          <input type="checkbox" data-tid="${esc(t.id)}"${t.done ? ' checked' : ''}>
          <span>${t.urgent && !t.done ? '⏰ ' : ''}${esc(t.text)}${
            t.who || t.due || t.done ? `<small class="uk-inline-meta">${[
              t.who ? '👤 ' + esc(t.who) : '',
              t.due ? `<span class="uk-due ${ds}">📅 ${esc(fmtDue(t.due))}</span>` : '',
              t.done && t.doneBy ? '✓ ' + esc(t.doneBy) : '',
            ].filter(Boolean).join(' · ')}</small>` : ''}</span>
        </label>`;
      }).join('') || '<p class="empty">Zatím tu nejsou žádné úkoly.</p>'}
      <div class="uk-mini-foot">
        <input type="text" class="uk-mini-add" placeholder="+ Přidat úkol… (Enter)" maxlength="200">
        <a href="checklist.html?skupina=${encodeURIComponent(group)}">${open ? `${open} otevřených · ` : ''}Všechny úkoly →</a>
      </div>`;
  };
  const store = await createTaskStore({ onItems: list => { tasks = list; draw(); } });
  el.addEventListener('change', e => {
    const cb = e.target.closest('input[data-tid]');
    if(!cb) return;
    const t = tasks.find(x => x.id === cb.dataset.tid);
    if(t) store.toggle(t, myName()).catch(err => { console.error(err); alert('Uložení se nepodařilo.'); });
  });
  el.addEventListener('keydown', e => {
    if(e.key !== 'Enter' || !e.target.matches('.uk-mini-add')) return;
    const text = e.target.value.trim();
    if(!text) return;
    const phase = (tasks.find(t => t.group === group && t.phase) || {}).phase || null;
    store.add({ text, group, phase }).catch(err => { console.error(err); alert('Přidání se nepodařilo.'); });
    e.target.value = '';
  });
}
