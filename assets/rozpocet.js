/* ============================================================
   RD Modřice – Grmelovi · sdílený interaktivní rozpočet stavby
   Položky rozdělené do kategorií, u každé cena oficiální (dle rozpočtu/
   smlouvy) a neoficiální (aktuální odhad/nabídka) – násobené množstvím.
   Volitelně jde u položky vyplnit odkaz na e-shop a zkusit z něj
   (experimentálně, přes veřejnou CORS proxy – web je statický bez
   backendu) načíst cenu do pole „neoficiální". Data se sdílejí v reálném
   čase přes Firebase (Firestore), při nedostupnosti spadne na localStorage.
   ============================================================ */
import { firebaseConfig } from './firebase-config.js';
export { esc } from './pozadavky.js';

const FB_VER = 'https://www.gstatic.com/firebasejs/10.12.2';

/* ---------- Výchozí kategorie ---------- */
export const DEFAULT_CATEGORIES = [
  { id:'priprava',  name:'Příprava, projekt a povolení',   icon:'📐' },
  { id:'pripojky',  name:'Přípojky inženýrských sítí',      icon:'🔌' },
  { id:'hruba',     name:'Hrubá stavba',                    icon:'🏗️' },
  { id:'fasada',    name:'Fasáda, povrchy a izolace',       icon:'🎨' },
  { id:'vyplne',    name:'Výplně otvorů a stínění',         icon:'🪟' },
  { id:'podlahy',   name:'Podlahy',                         icon:'▭' },
  { id:'tzb',       name:'Technické zařízení budovy',       icon:'⚡' },
  { id:'kuchyn',    name:'Kuchyň a koupelny',                icon:'🍳' },
  { id:'nabytek',   name:'Nábytek a vybavení interiéru',    icon:'🛋️' },
  { id:'venkovni',  name:'Venkovní úpravy a zahrada',       icon:'🌳' },
  { id:'rezerva',   name:'Rezerva a ostatní náklady',       icon:'🧾' },
];

/* ---------- Výchozí položky ----------
   Řádky z rozpočtu (Excel „RD rozpočet hypo") přenesené 1:1 (množství ×
   cena/jednotku odpovídá sloupci „Cena celkem"), plus doplněné kategorie
   a položky, na které se v rozpočtu ještě nemyslelo – u těch zatím není
   vyplněná cena (doplní se ručně nebo přes odkaz na nabídku). */
export const DEFAULT_ITEMS = [
  // Příprava, projekt a povolení
  { category:'priprava', name:'Projektová dokumentace a inženýring', qty:1, unit:'kpl', priceOff:null, priceUnoff:null, note:'Projekt, inženýrská činnost, komunikace s úřady.', link:null },
  { category:'priprava', name:'Geologický a radonový průzkum', qty:1, unit:'kpl', priceOff:null, priceUnoff:null, note:'Pozemek má střední radonový index – řešeno izolací s protiradonovou funkcí.', link:null },
  { category:'priprava', name:'Geodetické zaměření a vytyčení stavby', qty:1, unit:'kpl', priceOff:null, priceUnoff:null, note:'', link:null },
  { category:'priprava', name:'Stavební dozor', qty:1, unit:'kpl', priceOff:null, priceUnoff:null, note:'', link:null },

  // Přípojky inženýrských sítí
  { category:'pripojky', name:'Elektro – přípojka EG.D', qty:1, unit:'kpl', priceOff:15750, priceUnoff:null, note:'Podíl na nákladech EG.D, uhrazeno 21. 8. 2024; dodatek ke smlouvě (nevratné zálohy) podepsán 8/2026 bez doplatku.', link:null },
  { category:'pripojky', name:'Voda – přípojka a realizace (BVK)', qty:1, unit:'kpl', priceOff:null, priceUnoff:null, note:'Kladné vyjádření BVK 8/2024 (přípojka PE 32×3,0 mm, 4,1 m) – zbývá objednat a zaplatit realizaci.', link:null },
  { category:'pripojky', name:'Plyn – přípojka a realizace (GasNet)', qty:1, unit:'kpl', priceOff:null, priceUnoff:null, note:'Projekt a smlouva hotové 7/2024 (přípojka PE 40×3,7 mm, 4,1 m) – čeká se na fyzickou realizaci.', link:null },

  // Hrubá stavba
  { category:'hruba', name:'Zemní práce', qty:150, unit:'m³', priceOff:3200, priceUnoff:null, note:'Výkopy základů, výkop pro inženýrské sítě, vsakovací tunel, odvoz a likvidace na skládce.', link:null },
  { category:'hruba', name:'Základy', qty:55, unit:'m³', priceOff:13500, priceUnoff:null, note:'Železobetonové základy vč. bednění, výztuže, štěrkopísku.', link:null },
  { category:'hruba', name:'Základová deska', qty:20, unit:'m³', priceOff:17100, priceUnoff:null, note:'Železobetonová deska.', link:null },
  { category:'hruba', name:'Svislé konstrukce – nosné zdivo', qty:176, unit:'m²', priceOff:7050, priceUnoff:null, note:'Obvodové nosné zdivo tl. 440 mm s tepelnou izolací výplně (konkrétní výrobek – např. Porotherm 44 T Profi – ještě ověřit).', link:null },
  { category:'hruba', name:'Svislé konstrukce – příčky', qty:60, unit:'m²', priceOff:1200, priceUnoff:null, note:'Vnitřní příčky.', link:null },
  { category:'hruba', name:'Vodorovné konstrukce – stropní deska', qty:24.2, unit:'m³', priceOff:15300, priceUnoff:null, note:'Železobetonová stropní deska nad 1. NP.', link:null },
  { category:'hruba', name:'Krov s krytinou', qty:121, unit:'m²', priceOff:7200, priceUnoff:null, note:'Zateplený krov s krytinou, SDK podhled, bez povrchových úprav – keramická krytina pálená (dle materiálů aktuálně Bramac Turmalin).', link:null },

  // Fasáda, povrchy a izolace
  { category:'fasada', name:'Úpravy povrchu – omítky', qty:640, unit:'m²', priceOff:500, priceUnoff:null, note:'Omítka štuková s malbou.', link:null },
  { category:'fasada', name:'Úpravy povrchu – obklady', qty:65, unit:'m²', priceOff:2000, priceUnoff:null, note:'Koupelny 1. NP + 2. NP, WC, kuchyňská linka.', link:null },
  { category:'fasada', name:'Tepelná izolace', qty:25, unit:'m²', priceOff:4000, priceUnoff:null, note:'Doplnění izolace krovu (+10), terasa, strop garáže a vjezdu.', link:null },

  // Výplně otvorů a stínění
  { category:'vyplne', name:'Okna a střešní okna', qty:30, unit:'m²', priceOff:13500, priceUnoff:null, note:'V rozpočtu uvažováno plastová okna – aktuální projekt počítá s hliníkovými v antracitu, cenový rozdíl ověřit.', link:null },
  { category:'vyplne', name:'Garážová vrata', qty:2, unit:'ks', priceOff:60000, priceUnoff:null, note:'Sekční vrata, tmavě šedá – od ulice a do zahrady.', link:null },
  { category:'vyplne', name:'Dveře vnitřní', qty:14, unit:'ks', priceOff:12000, priceUnoff:null, note:'', link:null },
  { category:'vyplne', name:'Dveře vchodové', qty:1, unit:'ks', priceOff:25000, priceUnoff:null, note:'', link:null },
  { category:'vyplne', name:'Žaluzie a stínicí technika', qty:1, unit:'kpl', priceOff:null, priceUnoff:null, note:'Venkovní/vnitřní stínění oken – zatím nerozpočtováno.', link:null },

  // Podlahy
  { category:'podlahy', name:'Podlahy – podlahové konstrukce', qty:242, unit:'m²', priceOff:2200, priceUnoff:null, note:'Dlažba keramická, vinyl, lamino.', link:null },

  // Technické zařízení budovy
  { category:'tzb', name:'Elektroinstalace', qty:1, unit:'kpl', priceOff:350000, priceUnoff:null, note:'', link:null },
  { category:'tzb', name:'Fotovoltaika', qty:1, unit:'kpl', priceOff:150000, priceUnoff:null, note:'Předběžný odhad, výkon a konfigurace zatím neupřesněny.', link:null },
  { category:'tzb', name:'ZTI + ústřední topení', qty:1, unit:'kpl', priceOff:420000, priceUnoff:null, note:'Rozvody ZTI, vnitřní kanalizace, vytápění.', link:null },
  { category:'tzb', name:'Kanalizace – jímka a čistička OV', qty:1, unit:'kpl', priceOff:385000, priceUnoff:null, note:'Jímka na vyvážení 6,4 m³ + vsak dešťové vody AS-KRECHT.', link:null },
  { category:'tzb', name:'VZT a klimatizace', qty:1, unit:'kpl', priceOff:180000, priceUnoff:null, note:'Vč. centrální rekuperační jednotky (min. 150 m³/h).', link:null },
  { category:'tzb', name:'Hromosvod', qty:1, unit:'kpl', priceOff:12000, priceUnoff:null, note:'Odhad – ověřit přesnou cenu.', link:null },
  { category:'tzb', name:'Krbová vložka a komín', qty:1, unit:'kpl', priceOff:null, priceUnoff:null, note:'Krbová vložka 6 kW s vlastním přívodem vzduchu, systémový komín Schiedel.', link:null },
  { category:'tzb', name:'Revize a zkoušky', qty:1, unit:'kpl', priceOff:null, priceUnoff:null, note:'Revize elektro, plynu, komína, tlaková zkouška rozvodů – nutné před kolaudací.', link:null },

  // Kuchyň a koupelny
  { category:'kuchyn', name:'Kuchyně', qty:1, unit:'kpl', priceOff:200000, priceUnoff:null, note:'1 kuchyně vč. spotřebičů.', link:null },
  { category:'kuchyn', name:'Koupelny a WC', qty:1, unit:'kpl', priceOff:250000, priceUnoff:null, note:'1 velká koupelna, 1 WC, 1 malá koupelna s WC – vč. zařizovacích předmětů.', link:null },

  // Nábytek a vybavení interiéru
  { category:'nabytek', name:'Obývací pokoj – nábytek', qty:1, unit:'kpl', priceOff:null, priceUnoff:null, note:'Sedačka, stoly, TV stěna, police (mimo vestavěnou kuchyň).', link:null },
  { category:'nabytek', name:'Ložnice a pokoje – nábytek', qty:1, unit:'kpl', priceOff:null, priceUnoff:null, note:'Postele, skříně, doplňky.', link:null },
  { category:'nabytek', name:'Předsíň, chodby a šatny', qty:1, unit:'kpl', priceOff:null, priceUnoff:null, note:'Vestavěné skříně a úložné prostory.', link:null },
  { category:'nabytek', name:'Osvětlení – svítidla', qty:1, unit:'kpl', priceOff:null, priceUnoff:null, note:'Svítidla v celém domě.', link:null },

  // Venkovní úpravy a zahrada
  { category:'venkovni', name:'Zpevněné plochy a příjezdová cesta', qty:1, unit:'kpl', priceOff:null, priceUnoff:null, note:'', link:null },
  { category:'venkovni', name:'Oplocení a vjezdová brána', qty:1, unit:'kpl', priceOff:null, priceUnoff:null, note:'', link:null },
  { category:'venkovni', name:'Sadové úpravy a zahrada', qty:1, unit:'kpl', priceOff:null, priceUnoff:null, note:'', link:null },
  { category:'venkovni', name:'Venkovní osvětlení a zásuvky', qty:1, unit:'kpl', priceOff:null, priceUnoff:null, note:'', link:null },

  // Rezerva a ostatní náklady
  { category:'rezerva', name:'Rezerva na vícepráce', qty:1, unit:'kpl', priceOff:null, priceUnoff:null, note:'Doporučená rezerva ~5–10 % z celkového rozpočtu na nepředvídané vícepráce.', link:null },
  { category:'rezerva', name:'Pojištění stavby', qty:1, unit:'kpl', priceOff:null, priceUnoff:null, note:'', link:null },
  { category:'rezerva', name:'Kolaudace a správní poplatky', qty:1, unit:'kpl', priceOff:null, priceUnoff:null, note:'', link:null },
];

/* ---------- Pomocné funkce ---------- */
export function fmtMoney(n){
  if(n == null || !isFinite(n)) return '–';
  return Math.round(n).toLocaleString('cs-CZ') + ' Kč';
}
export function itemOfficialTotal(it){
  if(it.priceOff == null) return null;
  const q = it.qty == null ? 0 : it.qty;
  return q * it.priceOff;
}
export function itemEstimateTotal(it){
  const p = it.priceUnoff != null ? it.priceUnoff : it.priceOff;
  if(p == null) return null;
  const q = it.qty == null ? 0 : it.qty;
  return q * p;
}

/* ---------- Zkusit natáhnout cenu z odkazu (experimentální) ----------
   Web je statický (GitHub Pages) bez backendu, takže se cizí stránka
   čte přes veřejnou CORS proxy. Zkouší se JSON-LD (schema.org Product/
   Offer), pak obvyklé meta tagy s cenou, nakonec regex „… Kč" v textu. */
const CORS_PROXIES = [
  url => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url),
  url => 'https://corsproxy.io/?url=' + encodeURIComponent(url),
];

function findPriceInJson(node, depth){
  depth = depth || 0;
  if(!node || depth > 6) return null;
  if(Array.isArray(node)){
    for(const item of node){ const p = findPriceInJson(item, depth + 1); if(p) return p; }
    return null;
  }
  if(typeof node === 'object'){
    if(node.price != null){
      const v = parseFloat(String(node.price).replace(',', '.'));
      if(isFinite(v) && v > 0) return v;
    }
    if(node.offers){ const p = findPriceInJson(node.offers, depth + 1); if(p) return p; }
    for(const k of Object.keys(node)){
      if(k === 'price' || k === 'offers') continue;
      const p = findPriceInJson(node[k], depth + 1); if(p) return p;
    }
  }
  return null;
}

function parsePriceFromHtml(html){
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for(const s of scripts){
      try { const price = findPriceInJson(JSON.parse(s.textContent)); if(price) return price; } catch(e){}
    }
    const metaSelectors = ['meta[property="product:price:amount"]', 'meta[property="og:price:amount"]', 'meta[itemprop="price"]'];
    for(const sel of metaSelectors){
      const m = doc.querySelector(sel);
      if(m){ const v = parseFloat((m.getAttribute('content') || '').replace(',', '.')); if(isFinite(v) && v > 0) return v; }
    }
    const text = doc.body ? doc.body.textContent : html;
    const m = text.match(/(\d[\d\s ]{2,9}(?:,\d{1,2})?)\s*(?:Kč|CZK)/i);
    if(m){ const v = parseFloat(m[1].replace(/[\s ]/g, '').replace(',', '.')); if(isFinite(v) && v > 0) return v; }
  } catch(e){}
  return null;
}

export async function fetchPriceFromLink(url){
  if(!/^https?:\/\//i.test(url)) throw new Error('Odkaz musí začínat http(s)://');
  let lastErr = null;
  for(const build of CORS_PROXIES){
    try {
      const res = await fetch(build(url), { signal: AbortSignal.timeout(12000) });
      if(!res.ok) throw new Error('HTTP ' + res.status);
      const html = await res.text();
      const price = parsePriceFromHtml(html);
      if(price) return price;
      lastErr = new Error('Cenu se na stránce nepodařilo najít.');
    } catch(e){ lastErr = e; }
  }
  throw lastErr || new Error('Načtení se nepodařilo.');
}

/* ---------- Lokální backend (localStorage) ---------- */
function localItemsBackend(key){
  let items = [];
  try { items = JSON.parse(localStorage.getItem(key)) || []; } catch(e){ items = []; }
  let cb = () => {};
  const save = () => {
    try { localStorage.setItem(key, JSON.stringify(items)); }
    catch(e){ alert('Úložiště prohlížeče je plné.'); throw e; }
  };
  return {
    subscribe(f){ cb = f; cb(items); },
    async add(item){ item.id = 'l' + Date.now() + Math.random().toString(36).slice(2, 7); items.push(item); save(); cb(items); },
    async update(id, patch){ const it = items.find(x => x.id === id); if(it){ Object.assign(it, patch); save(); cb(items); } },
    async remove(id){ items = items.filter(x => x.id !== id); save(); cb(items); },
  };
}
function localDocBackend(key){
  let list = null;
  try { list = JSON.parse(localStorage.getItem(key)); } catch(e){ list = null; }
  let cb = () => {};
  return {
    subscribe(f){ cb = f; cb(list); },
    async save(newList){ list = newList; try { localStorage.setItem(key, JSON.stringify(list)); } catch(e){} cb(list); },
  };
}

/* ---------- Firebase backend (Firestore, realtime) ---------- */
async function firebaseBackend(){
  const { initializeApp } = await import(`${FB_VER}/firebase-app.js`);
  const { getFirestore, collection, addDoc, deleteDoc, updateDoc, doc, setDoc, getDoc, onSnapshot, query, orderBy, writeBatch }
    = await import(`${FB_VER}/firebase-firestore.js`);
  const app = initializeApp(firebaseConfig);
  const db  = getFirestore(app);
  const itemsCol = collection(db, 'rozpocet');
  const catDocRef = doc(db, 'rozpocet_meta', 'kategorie');
  return {
    shared:true,
    items:{
      subscribe(cb, onError){
        onSnapshot(query(itemsCol, orderBy('ts', 'asc')),
          snap => cb(snap.docs.map(d => ({ id:d.id, ...d.data() }))),
          err  => { console.error(err); if(onError) onError(err); });
      },
      add:(item) => addDoc(itemsCol, item),
      update:(id, patch) => updateDoc(doc(db, 'rozpocet', id), patch),
      remove:(id) => deleteDoc(doc(db, 'rozpocet', id)),
    },
    categories:{
      subscribe(cb, onError){
        onSnapshot(catDocRef,
          snap => cb(snap.exists() ? (snap.data().list || []) : null),
          err  => { console.error(err); if(onError) onError(err); });
      },
      save:(list) => setDoc(catDocRef, { list }),
    },
    async seedIfEmpty(defaultCategories, defaultItems){
      const snap = await getDoc(catDocRef);
      if(snap.exists()) return;
      const batch = writeBatch(db);
      batch.set(catDocRef, { list:defaultCategories });
      defaultItems.forEach((it, i) => { batch.set(doc(itemsCol), { ...it, ts:Date.now() + i }); });
      await batch.commit();
    },
  };
}

/* ============================================================
   createBudgetStore – fasáda nad backendem (Firebase → fallback lokál),
   se seedováním výchozích kategorií a položek při prvním použití.
   opts: { itemsKey, catKey, onItems(items,shared), onCategories(list,shared), onStatus(kind,text) }
   ============================================================ */
export async function createBudgetStore(opts = {}){
  const itemsKey = opts.itemsKey || 'rdmodrice-rozpocet-items-v1';
  const catKey   = opts.catKey   || 'rdmodrice-rozpocet-categories-v1';
  const status = (k, t) => { if(opts.onStatus) opts.onStatus(k, t); };

  let current = null;
  const facade = {
    get shared(){ return current ? current.shared : false; },
    addItem:       (...a) => current.items.add(...a),
    updateItem:    (...a) => current.items.update(...a),
    removeItem:    (...a) => current.items.remove(...a),
    saveCategories:(...a) => current.categories.save(...a),
  };

  const goLocal = (reason) => {
    let existingCat = null;
    try { existingCat = JSON.parse(localStorage.getItem(catKey)); } catch(e){}
    if(!existingCat){
      try { localStorage.setItem(catKey, JSON.stringify(DEFAULT_CATEGORIES)); } catch(e){}
      let existingItems = [];
      try { existingItems = JSON.parse(localStorage.getItem(itemsKey)) || []; } catch(e){}
      if(!existingItems.length){
        const seeded = DEFAULT_ITEMS.map((it, i) => ({ ...it, id:'l' + Date.now() + '_' + i, ts:Date.now() + i }));
        try { localStorage.setItem(itemsKey, JSON.stringify(seeded)); } catch(e){}
      }
    }
    const itemsB = localItemsBackend(itemsKey);
    const catB   = localDocBackend(catKey);
    current = { shared:false, items:itemsB, categories:catB };
    status('', '🔒 Uloženo jen v tomto prohlížeči' + (reason ? ' – ' + reason : '') + '.');
    itemsB.subscribe(items => opts.onItems && opts.onItems(items, false));
    catB.subscribe(list => opts.onCategories && opts.onCategories(list || DEFAULT_CATEGORIES, false));
  };

  const useFb = firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey.length > 10;
  if(!useFb){ goLocal('pro sdílení doplň konfiguraci Firebase'); return facade; }

  try {
    const fb = await firebaseBackend();
    await fb.seedIfEmpty(DEFAULT_CATEGORIES, DEFAULT_ITEMS);
    current = fb;
    status('ok', '🟢 Sdílené online – rozpočet vidí a upravují všichni v reálném čase.');
    let fell = false;
    fb.items.subscribe(items => opts.onItems && opts.onItems(items, true), () => {
      if(fell) return; fell = true;
      status('warn', '⚠️ Online databáze není dostupná – ukládá se jen lokálně.');
      goLocal();
    });
    fb.categories.subscribe(list => opts.onCategories && opts.onCategories(list || DEFAULT_CATEGORIES, true), () => {});
  } catch(e){
    console.error(e);
    goLocal('online databázi se nepodařilo načíst');
  }
  return facade;
}
