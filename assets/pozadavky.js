/* ============================================================
   RD Modřice – Grmelovi · sdílená nástěnka „Požadavky na úpravy 3D modelu"
   Rodina zadává textové požadavky/prompty (co v modelu upravit), volitelně
   s přiloženým pohledem kamery a náhledem. Já je pak zapracuji do modelu
   (přes generátor GLB) a nasadím; ve seznamu se mění stav (nový → hotovo).
   Data se sdílejí v reálném čase přes Firebase (Firestore),
   při nedostupnosti spadne zpět na lokální úložiště prohlížeče.
   ============================================================ */
import { firebaseConfig } from './firebase-config.js';

export const AUTHORS = ['Lucka', 'Vladimír', 'Jirka', 'Jarka'];

/* Oblast, které se úprava týká (jednodušší členění mířené na 3D model) */
export const AREAS = [
  { id:'exterier',  name:'Exteriér a fasáda', icon:'🏠' },
  { id:'strecha',   name:'Střecha',           icon:'🏛️' },
  { id:'okna',      name:'Okna a dveře',      icon:'🪟' },
  { id:'terasa',    name:'Terasa',            icon:'☀️' },
  { id:'vjezd',     name:'Vjezd a zahrada',   icon:'🌳' },
  { id:'dispozice', name:'Dispozice a stěny', icon:'🧱' },
  { id:'interier',  name:'Interiér',          icon:'🛋️' },
  { id:'barvy',     name:'Barvy a materiály', icon:'🎨' },
  { id:'jine',      name:'Jiné',              icon:'📌' },
];
export const AREA_BY_ID = Object.fromEntries(AREAS.map(a => [a.id, a]));

/* Druh úpravy (rychlé volby – jedno klepnutí místo psaní, zpřesní zadání) */
export const KINDS = [
  { id:'barva',    name:'Barva',    icon:'🎨' },
  { id:'pridat',   name:'Přidat',   icon:'➕' },
  { id:'odebrat',  name:'Odebrat',  icon:'➖' },
  { id:'rozmer',   name:'Rozměr',   icon:'📐' },
  { id:'material', name:'Materiál', icon:'🧱' },
  { id:'jine',     name:'Jiné',     icon:'💬' },
];
export const KIND_BY_ID = Object.fromEntries(KINDS.map(k => [k.id, k]));

/* Stav zpracování požadavku */
export const STATUSES = [
  { id:'novy',    name:'Nový',         icon:'🆕' },
  { id:'probiha', name:'Rozpracováno', icon:'🛠️' },
  { id:'hotovo',  name:'Hotovo',       icon:'✅' },
];
export const STATUS_BY_ID = Object.fromEntries(STATUSES.map(s => [s.id, s]));

const FB_VER = 'https://www.gstatic.com/firebasejs/10.12.2';

/* ---------- Pomocné funkce ---------- */
export const esc = s => (s == null ? '' : String(s)).replace(/[&<>"']/g, m =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
export const slug = s => (s || '').toLowerCase()
  .replace(/á/g,'a').replace(/í/g,'i').replace(/ř/g,'r').replace(/[^a-z]/g,'');
export function fmtDate(ts){
  if(!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('cs-CZ') + ' ' + d.toLocaleTimeString('cs-CZ', { hour:'2-digit', minute:'2-digit' });
}

/* pohled kamery ⇄ řetězec pro URL (#view=px,py,pz,tx,ty,tz) */
export function viewToHash(v){
  if(!v || !v.p || !v.t) return '';
  const r = n => Number(n).toFixed(2);
  return [...v.p.map(r), ...v.t.map(r)].join(',');
}
export function hashToView(s){
  const a = (s || '').split(',').map(Number);
  if(a.length !== 6 || a.some(n => !isFinite(n))) return null;
  return { p:a.slice(0,3), t:a.slice(3,6) };
}

/* ---- Kontext scény (barvy konfigurátoru + zapnuté vrstvy) ---- */
/* pevné pořadí kvůli kompaktnímu (a dekódovatelnému) zápisu do odkazu */
export const SCENE_COLORS = ['fasada','strecha','okna','vrata','klemp','sokl','obklad','ocel',
  'dvere','zpevnene','interier','podlaha','sklo'];
export const SCENE_LAYERS = ['roof','walls','np2','np1','glass','terrain','labels'];
export const SCENE_LAYER_NAMES = {
  roof:'Střecha', walls:'Obvodové stěny', np2:'2. patro', np1:'1. patro',
  glass:'Okna', terrain:'Terén', labels:'Popisky',
};
/* scéna ⇄ řetězec pro URL (#scene=RRGGBB×8 _ 0/1×7). Chybějící barva = 6× „-". */
export function sceneToHash(sc){
  if(!sc) return '';
  const c = SCENE_COLORS.map(id => {
    const h = (((sc.colors && sc.colors[id]) || '').replace('#','')).toLowerCase();
    return /^[0-9a-f]{6}$/.test(h) ? h : '------';
  }).join('');
  const l = SCENE_LAYERS.map(id => (sc.layers && sc.layers[id] === false) ? '0' : '1').join('');
  return c + '_' + l;
}
export function hashToScene(s){
  if(!s || s.indexOf('_') < 0) return null;
  const [c, l] = s.split('_');
  if(!c) return null;
  const colors = {};
  // dekóduj tolik barev, kolik jich řetězec nese (starší odkazy měly méně ovladačů)
  const nc = Math.min(SCENE_COLORS.length, Math.floor(c.length / 6));
  for(let i = 0; i < nc; i++){ const h = c.substr(i*6, 6); if(/^[0-9a-f]{6}$/i.test(h)) colors[SCENE_COLORS[i]] = '#' + h.toLowerCase(); }
  const layers = {};
  SCENE_LAYERS.forEach((id, i) => { layers[id] = (l || '')[i] !== '0'; });
  return { colors, layers };
}

/* ---------- Lokální backend (localStorage) ---------- */
function localBackend(key){
  let items = [];
  try { items = JSON.parse(localStorage.getItem(key)) || []; } catch(e){ items = []; }
  let cb = () => {};
  const save = () => {
    try { localStorage.setItem(key, JSON.stringify(items)); }
    catch(e){ alert('Úložiště prohlížeče je plné – smaž prosím starší požadavky.'); throw e; }
  };
  return {
    shared:false,
    subscribe(f){ cb = f; cb(items); },
    async add(item){ item.id = 'l' + Date.now() + Math.random().toString(36).slice(2, 7); items.unshift(item); save(); cb(items); },
    async update(id, patch){ const it = items.find(x => x.id === id); if(it){ Object.assign(it, patch); save(); cb(items); } },
    async remove(id){ items = items.filter(x => x.id !== id); save(); cb(items); },
  };
}

/* ---------- Firebase backend (Firestore, realtime) ---------- */
async function firebaseBackend(){
  const { initializeApp } = await import(`${FB_VER}/firebase-app.js`);
  const { getFirestore, collection, addDoc, deleteDoc, updateDoc, doc, onSnapshot, query, orderBy }
    = await import(`${FB_VER}/firebase-firestore.js`);
  const app = initializeApp(firebaseConfig);
  const db  = getFirestore(app);
  const col = collection(db, 'pozadavky');
  return {
    shared:true,
    subscribe(cb, onError){
      onSnapshot(query(col, orderBy('ts', 'desc')),
        snap => cb(snap.docs.map(d => ({ id:d.id, ...d.data() }))),
        err  => { console.error(err); if(onError) onError(err); });
    },
    async add(item){ return addDoc(col, item); },
    async update(id, patch){ return updateDoc(doc(db, 'pozadavky', id), patch); },
    async remove(id){ return deleteDoc(doc(db, 'pozadavky', id)); },
  };
}

/* ============================================================
   createStore – stabilní fasáda nad backendem (Firebase → fallback lokál).
   opts: { localKey, onItems(items, shared), onStatus(kind, text) }
   Vrací { shared, add(item), update(id,patch), remove(id) }.
   ============================================================ */
export async function createStore(opts = {}){
  const localKey = opts.localKey || 'rdmodrice-pozadavky-v1';
  const status = (k, t) => { if(opts.onStatus) opts.onStatus(k, t); };
  const emit   = (items, shared) => { if(opts.onItems) opts.onItems(items || [], shared); };

  let current = null;
  const facade = {
    get shared(){ return current ? current.shared : false; },
    add:   (...a) => current.add(...a),
    update:(...a) => current.update(...a),
    remove:(...a) => current.remove(...a),
  };

  const goLocal = (reason) => {
    current = localBackend(localKey);
    status('', '🔒 Uloženo jen v tomto prohlížeči' + (reason ? ' – ' + reason : '') + '.');
    current.subscribe(items => emit(items, false));
  };

  const useFb = firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey.length > 10;
  if(!useFb){ goLocal('pro sdílení doplň konfiguraci Firebase'); return facade; }

  try {
    current = await firebaseBackend();
    status('ok', '🟢 Sdílené online – požadavky vidí všichni v reálném čase.');
    let fell = false;
    current.subscribe(items => emit(items, true), () => {
      if(fell) return; fell = true;
      status('warn', '⚠️ Online databáze není dostupná – ukládá se jen lokálně.');
      goLocal();
    });
  } catch(e){
    console.error(e);
    goLocal('online databázi se nepodařilo načíst');
  }
  return facade;
}
