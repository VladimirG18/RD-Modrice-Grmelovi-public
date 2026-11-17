/* ============================================================
   RD Modřice – Grmelovi · obecné sdílené úložiště jedné kolekce
   Realtime přes Firestore (SDK), při nedostupnosti záloha v localStorage
   – stejné chování jako ostatní nástroje webu. Používá Deník, Kontakty
   a Výběry. Volitelně založí výchozí záznamy (seed) – jen jednou,
   značka je v `<coll>_meta/seed`.
   ============================================================ */
import { firebaseConfig } from './firebase-config.js';

const FB_VER = 'https://www.gstatic.com/firebasejs/10.12.2';

export const AUTHORS = ['Lucka', 'Vladimír', 'Jirka', 'Jarka'];
export const AUTHOR_KEY = 'rdmodrice-board-author';
export const esc = s => (s == null ? '' : String(s)).replace(/[&<>"']/g, m =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
export const slug = s => (s || '').toLowerCase()
  .replace(/á/g,'a').replace(/í/g,'i').replace(/ř/g,'r').replace(/[^a-z]/g,'');
export const todayISO = () => new Date().toLocaleDateString('sv-SE');
/* pro hledání: malá písmena bez diakritiky („novak" najde „Novák") */
export const fold = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function myName(){
  try { const a = localStorage.getItem(AUTHOR_KEY); return AUTHORS.includes(a) ? a : ''; } catch(e){ return ''; }
}
export function setMyName(a){ try { if(AUTHORS.includes(a)) localStorage.setItem(AUTHOR_KEY, a); } catch(e){} }

const WD = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
const MON = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
export function fmtDate(iso, { year = 'auto', weekday = false } = {}){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if(!m) return iso || '';
  const y = Number(m[1]);
  const showY = year === true || (year === 'auto' && y !== new Date().getFullYear());
  const d = new Date(y, Number(m[2]) - 1, Number(m[3]));
  return `${weekday ? WD[d.getDay()] + ' ' : ''}${Number(m[3])}. ${Number(m[2])}.${showY ? ' ' + y : ''}`;
}
export const monthLabel = ym => { const [y, m] = String(ym).split('-'); return `${MON[Number(m) - 1] || ''} ${y}`; };
/* 'over' = po termínu, 'soon' = do týdne */
export function dueState(due, closed){
  if(closed || !/^\d{4}-\d{2}-\d{2}$/.test(due || '')) return '';
  const t = todayISO();
  if(due < t) return 'over';
  return due <= new Date(Date.now() + 7 * 86400000).toLocaleDateString('sv-SE') ? 'soon' : '';
}

/* ---------- lokální záloha ---------- */
function localBackend(key){
  let items = [];
  try { items = JSON.parse(localStorage.getItem(key)) || []; } catch(e){ items = []; }
  let cb = () => {};
  const save = () => { try { localStorage.setItem(key, JSON.stringify(items)); } catch(e){ alert('Úložiště prohlížeče je plné.'); } };
  return {
    shared:false,
    subscribe(f){ cb = f; cb(items.slice()); },
    async seedIfEmpty(seed){
      if(items.length || !seed || !seed.length) return;
      items = seed.map((d, i) => ({ id:'l' + Date.now() + '_' + i, ...d })); save();
    },
    async add(t){ const it = { id:'l' + uid(), ...t }; items.push(it); save(); cb(items.slice()); return it; },
    async update(id, patch){ const it = items.find(x => x.id === id); if(it){ Object.assign(it, patch); save(); cb(items.slice()); } },
    async remove(id){ items = items.filter(x => x.id !== id); save(); cb(items.slice()); },
    // pomocné záznamy (např. plné fotky) – mimo hlavní seznam, ať se nenačítají pořád
    async putAux(coll, data){
      const k = key + '-' + coll, id = 'l' + uid();
      let m = {}; try { m = JSON.parse(localStorage.getItem(k)) || {}; } catch(e){}
      m[id] = data;
      try { localStorage.setItem(k, JSON.stringify(m)); } catch(e){ alert('Úložiště prohlížeče je plné.'); throw e; }
      return id;
    },
    async getAux(coll, id){ try { return (JSON.parse(localStorage.getItem(key + '-' + coll)) || {})[id] || null; } catch(e){ return null; } },
    async delAux(coll, id){
      const k = key + '-' + coll;
      try { const m = JSON.parse(localStorage.getItem(k)) || {}; delete m[id]; localStorage.setItem(k, JSON.stringify(m)); } catch(e){}
    },
  };
}

/* ---------- Firestore ---------- */
async function firebaseBackend(coll){
  const { initializeApp, getApps } = await import(`${FB_VER}/firebase-app.js`);
  const { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, getDoc, onSnapshot, writeBatch }
    = await import(`${FB_VER}/firebase-firestore.js`);
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const col = collection(db, coll);
  return {
    shared:true,
    subscribe(cb, onError){
      onSnapshot(col, snap => cb(snap.docs.map(d => ({ id:d.id, ...d.data() }))),
        err => { console.error(err); if(onError) onError(err); });
    },
    async seedIfEmpty(seed){
      if(!seed || !seed.length) return;
      const meta = doc(db, coll + '_meta', 'seed');
      if((await getDoc(meta)).exists()) return;
      const batch = writeBatch(db);
      seed.forEach(d => batch.set(doc(col), d));
      batch.set(meta, { done:true, ts:Date.now() });
      await batch.commit();
    },
    add: t => addDoc(col, t),
    update: (id, patch) => updateDoc(doc(db, coll, id), patch),
    remove: id => deleteDoc(doc(db, coll, id)),
    async putAux(c, data){ return (await addDoc(collection(db, c), data)).id; },
    async getAux(c, id){ const s = await getDoc(doc(db, c, id)); return s.exists() ? s.data() : null; },
    delAux: (c, id) => deleteDoc(doc(db, c, id)),
  };
}

/* ============================================================
   createStore({ coll, localKey, label, seed, onItems(list, shared), onStatus(kind, html) })
   ============================================================ */
export async function createStore(opts){
  const status = (k, t) => opts.onStatus && opts.onStatus(k, t);
  const label = opts.label || 'Záznamy';
  let current = null;
  const facade = {
    get shared(){ return !!(current && current.shared); },
    add: t => current.add({ ts: Date.now(), ...t }),
    update: (id, patch) => current.update(id, patch),
    remove: id => current.remove(id),
    putAux: (c, data) => current.putAux(c, data),
    getAux: (c, id) => current.getAux(c, id),
    delAux: (c, id) => current.delAux(c, id),
  };
  const goLocal = async reason => {
    current = localBackend(opts.localKey);
    await current.seedIfEmpty(opts.seed);
    status('', `🔒 ${label} se ukládají jen v tomto prohlížeči${reason ? ' – ' + reason : ''}.`);
    current.subscribe(list => opts.onItems && opts.onItems(list, false));
  };
  const useFb = firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey.length > 10;
  if(!useFb){ await goLocal('pro sdílení doplň konfiguraci Firebase'); return facade; }
  try {
    const fb = await firebaseBackend(opts.coll);
    await fb.seedIfEmpty(opts.seed);
    current = fb;
    status('ok', `🟢 Sdílené online – ${label.toLowerCase()} vidí a upravují všichni v reálném čase.`);
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

export function setStatusEl(el){
  return (kind, html) => { el.className = 'statusbar' + (kind ? ' ' + kind : ''); el.innerHTML = html; };
}
