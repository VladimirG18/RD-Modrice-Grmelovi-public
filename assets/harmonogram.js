/* ============================================================
   RD Modřice – Grmelovi · sdílený interaktivní harmonogram stavby
   Fáze výstavby (kolekce harmonogram_faze) rozpadnuté na dílčí kroky
   (kolekce harmonogram_kroky), volitelně navázané na kategorii rozpočtu
   (assets/rozpocet.js), editovatelné a přeuspořádatelné (drag & drop nebo
   šipky ▲▼ – pořadí je pole „order", při přeuspořádání se přepočítá
   a uloží najednou dávkou). Sdílené přes Firebase (Firestore), při
   nedostupnosti spadne na localStorage.
   ============================================================ */
import { firebaseConfig } from './firebase-config.js';
import { DEFAULT_CATEGORIES as BUDGET_CATEGORIES } from './rozpocet.js';
export { esc } from './pozadavky.js';
export { BUDGET_CATEGORIES };

const FB_VER = 'https://www.gstatic.com/firebasejs/10.12.2';

export const STATUSES = [
  { id:'planovano', name:'Plánováno', icon:'📋', cls:'' },
  { id:'probiha',   name:'Probíhá',   icon:'🛠️', cls:'active' },
  { id:'hotovo',    name:'Hotovo',    icon:'✅', cls:'done' },
];
export const STATUS_BY_ID = Object.fromEntries(STATUSES.map(s => [s.id, s]));
export const BUDGET_CAT_BY_ID = Object.fromEntries(BUDGET_CATEGORIES.map(c => [c.id, c]));

/* ---------- Výchozí fáze + dílčí kroky ----------
   Vychází z dosavadního harmonogramu a stránky Stavba domu, rozpadnuté
   na víc a jemnějších fází tak, aby šly co nejlíp napárovat na kategorie
   rozpočtu (budgetCat = id kategorie z assets/rozpocet.js). */
export const DEFAULT_PHASES = [
  { name:'Projektová dokumentace', when:'07/2023', start:'2023-07', end:'2023-07', status:'hotovo', budgetCat:'priprava',
    note:'Architektonicko-stavební řešení pro územní souhlas a ohlášení stavby (Ing. arch. Bradáč a kol.).',
    kroky:[
      { text:'Půdorysy, řez, pohledy, situace', status:'hotovo', when:'07/2023' },
      { text:'Technická zpráva', status:'hotovo', when:'07/2023' },
    ]},
  { name:'Průzkumy a profese', when:'10/2024', start:'2024-10', end:'2024-10', status:'hotovo', budgetCat:'priprava',
    note:'Doplňkové průzkumy a posouzení potřebné k povolení a bezpečnému návrhu stavby.',
    kroky:[
      { text:'Radonový průzkum (střední index)', status:'hotovo', when:'10/2024' },
      { text:'Hydrogeologické posouzení vsakování', status:'hotovo', when:'10/2024' },
      { text:'Požárně bezpečnostní řešení', status:'hotovo', when:'10/2024' },
      { text:'Koordinační situace s přípojkami', status:'hotovo', when:'10/2024' },
    ]},
  { name:'Povolení a příprava', when:'6/2026 – 8/2026', start:'2026-06', end:'2026-08', status:'hotovo', budgetCat:'priprava',
    note:'Administrativní a smluvní příprava před zahájením zemních prací.',
    kroky:[
      { text:'Vyjádření správců sítí', status:'hotovo', when:'' },
      { text:'Stavební povolení (řízení R/2026/4233)', status:'hotovo', when:'9. 6. 2026' },
      { text:'Právní moc povolení', status:'hotovo', when:'11. 7. 2026' },
      { text:'Výběr dodavatele a rozpočet', status:'hotovo', when:'' },
      { text:'Demolice staré garáže na pozemku', status:'hotovo', when:'' },
    ]},
  { name:'Přípojky inženýrských sítí', when:'9/2026 →', start:'2026-09', end:null, status:'probiha', budgetCat:'pripojky',
    note:'Elektřina, plyn, voda a kanalizace/jímka – podrobný stav viz stránka Přípojky.',
    kroky:[
      { text:'Elektro – EG.D: smlouva a úhrada', status:'hotovo', when:'8/2024' },
      { text:'Elektro – ověřit fyzický stav skříně', status:'probiha', when:'' },
      { text:'Plyn – GasNet: projekt a smlouva', status:'hotovo', when:'7/2024' },
      { text:'Plyn – fyzická realizace přípojky', status:'planovano', when:'' },
      { text:'Voda – BVK: kladné vyjádření', status:'hotovo', when:'8/2024' },
      { text:'Voda – objednat realizaci', status:'probiha', when:'' },
      { text:'Kanalizace – jímka a vsak AS-KRECHT', status:'probiha', when:'' },
    ]},
  { name:'Zemní práce a základy', when:'9/2026', start:'2026-09', end:null, status:'probiha', budgetCat:'hruba',
    note:'Založení −1,25 m, ležaté rozvody, podkladní beton s kari sítí, hydroizolace 2× SBS s protiradonovou funkcí.',
    kroky:[
      { text:'Skrývka a vytyčení stavby', status:'hotovo', when:'' },
      { text:'Výkopy základových rýh', status:'hotovo', when:'31. 8. – 4. 9. 2026' },
      { text:'Armovací kari síť', status:'hotovo', when:'' },
      { text:'Vylití základové desky betonem', status:'probiha', when:'' },
      { text:'Ležaté rozvody a hydroizolace 2× SBS', status:'planovano', when:'' },
    ]},
  { name:'Hrubá stavba – svislé a vodorovné konstrukce', when:'—', status:'planovano', budgetCat:'hruba',
    note:'Zdivo 1. NP (bloky 450/250 mm), železobetonový strop s věncem, zdivo podkroví, schodiště, komín.',
    kroky:[
      { text:'Zdivo 1. NP', status:'planovano', when:'' },
      { text:'Strop nad 1. NP + věnec', status:'planovano', when:'' },
      { text:'Zdivo podkroví (2. NP)', status:'planovano', when:'' },
      { text:'Schodiště', status:'planovano', when:'' },
      { text:'Komín', status:'planovano', when:'' },
    ]},
  { name:'Krov a střešní krytina', when:'—', status:'planovano', budgetCat:'hruba',
    note:'Hambálkový krov (krokve 100/180), krytina Bramac Turmalin, klempířské prvky.',
    kroky:[
      { text:'Krov (hambálky)', status:'planovano', when:'' },
      { text:'Krytina Bramac Turmalin', status:'planovano', when:'' },
      { text:'Klempířské prvky', status:'planovano', when:'' },
    ]},
  { name:'Okna, dveře a vrata', when:'—', status:'planovano', budgetCat:'vyplne',
    note:'Střešní a hliníková okna, vstupní a vnitřní dveře, garážová vrata – uzavření hrubé stavby.',
    kroky:[
      { text:'Střešní okna', status:'planovano', when:'' },
      { text:'Hliníková okna', status:'planovano', when:'' },
      { text:'Vstupní dveře', status:'planovano', when:'' },
      { text:'Vnitřní dveře', status:'planovano', when:'' },
      { text:'Garážová vrata', status:'planovano', when:'' },
    ]},
  { name:'Fasáda, izolace a vnitřní povrchy', when:'—', status:'planovano', budgetCat:'fasada',
    note:'Zateplení, silikátová omítka, vnitřní omítky, malby a obklady, SDK podhledy.',
    kroky:[
      { text:'Zateplení a tepelná izolace', status:'planovano', when:'' },
      { text:'Vnější silikátová omítka', status:'planovano', when:'' },
      { text:'Vnitřní omítky a malby', status:'planovano', when:'' },
      { text:'Obklady (koupelny, kuchyně)', status:'planovano', when:'' },
      { text:'SDK podhledy', status:'planovano', when:'' },
    ]},
  { name:'Podlahy', when:'—', status:'planovano', budgetCat:'podlahy',
    note:'Podlahové konstrukce, dlažba, dřevo/vinyl dle místností.',
    kroky:[
      { text:'Podlahové konstrukce', status:'planovano', when:'' },
      { text:'Dlažba', status:'planovano', when:'' },
      { text:'Dřevo / vinyl', status:'planovano', when:'' },
    ]},
  { name:'TZB – rozvody a instalace', when:'—', status:'planovano', budgetCat:'tzb',
    note:'Elektroinstalace, voda a kanalizace, plynový kondenzační kotel, podlahové vytápění, rekuperace, krb.',
    kroky:[
      { text:'Elektroinstalace', status:'planovano', when:'' },
      { text:'Rozvody vody a odpadů', status:'planovano', when:'' },
      { text:'Plynový kondenzační kotel', status:'planovano', when:'' },
      { text:'Podlahové vytápění', status:'planovano', when:'' },
      { text:'Rekuperace', status:'planovano', when:'' },
      { text:'Krbová vložka', status:'planovano', when:'' },
    ]},
  { name:'Kuchyň a koupelny', when:'—', status:'planovano', budgetCat:'kuchyn',
    note:'Kuchyňská linka se spotřebiči, koupelny a WC – obklady a zařizovací předměty.',
    kroky:[
      { text:'Kuchyňská linka a spotřebiče', status:'planovano', when:'' },
      { text:'Koupelny a WC', status:'planovano', when:'' },
    ]},
  { name:'Nábytek a vybavení interiéru', when:'—', status:'planovano', budgetCat:'nabytek',
    note:'Vybavení obývacího pokoje, ložnic a pokojů, osvětlení.',
    kroky:[
      { text:'Obývací pokoj', status:'planovano', when:'' },
      { text:'Ložnice a pokoje', status:'planovano', when:'' },
      { text:'Osvětlení', status:'planovano', when:'' },
    ]},
  { name:'Venkovní úpravy a zahrada', when:'—', status:'planovano', budgetCat:'venkovni',
    note:'Terasa, sjezd a zpevněné plochy, oplocení, sadové úpravy.',
    kroky:[
      { text:'Terasa s dlažbou na terčích a skleněným zábradlím', status:'planovano', when:'' },
      { text:'Sjezd a zpevněné plochy', status:'planovano', when:'' },
      { text:'Oplocení', status:'planovano', when:'' },
      { text:'Zahrada a sadové úpravy', status:'planovano', when:'' },
    ]},
  { name:'Kolaudace a stěhování', when:'—', status:'planovano', budgetCat:'rezerva',
    note:'Závěrečná kontrola, kolaudace, nastěhování. 🎉',
    kroky:[
      { text:'Revize a zkoušky', status:'planovano', when:'' },
      { text:'Závěrečná kontrola a kolaudace', status:'planovano', when:'' },
      { text:'Nastěhování 🎉', status:'planovano', when:'' },
    ]},
];

/* ---------- Lokální backend (localStorage) ---------- */
function localCrudBackend(key){
  let items = [];
  try { items = JSON.parse(localStorage.getItem(key)) || []; } catch(e){ items = []; }
  let cb = () => {};
  const save = () => {
    try { localStorage.setItem(key, JSON.stringify(items)); }
    catch(e){ alert('Úložiště prohlížeče je plné.'); throw e; }
  };
  return {
    subscribe(f){ cb = f; cb(items); },
    async add(item){ item.id = 'l' + Date.now() + Math.random().toString(36).slice(2, 7); items.push(item); save(); cb(items); return { id:item.id }; },
    async update(id, patch){ const it = items.find(x => x.id === id); if(it){ Object.assign(it, patch); save(); cb(items); } },
    async remove(id){ items = items.filter(x => x.id !== id); save(); cb(items); },
    async reorder(idsInOrder){
      idsInOrder.forEach((id, i) => { const it = items.find(x => x.id === id); if(it) it.order = (i + 1) * 10; });
      save(); cb(items);
    },
  };
}

/* ---------- Firebase backend (Firestore, realtime) ---------- */
async function firebaseBackend(){
  const { initializeApp } = await import(`${FB_VER}/firebase-app.js`);
  const { getFirestore, collection, addDoc, deleteDoc, updateDoc, doc, getDoc, setDoc, onSnapshot, query, orderBy, writeBatch }
    = await import(`${FB_VER}/firebase-firestore.js`);
  const app = initializeApp(firebaseConfig);
  const db  = getFirestore(app);
  const fazeCol  = collection(db, 'harmonogram_faze');
  const krokyCol = collection(db, 'harmonogram_kroky');
  const metaRef  = doc(db, 'harmonogram_meta', 'init');

  const crud = (col, colName) => ({
    subscribe(cb, onError){
      onSnapshot(query(col, orderBy('order', 'asc')),
        snap => cb(snap.docs.map(d => ({ id:d.id, ...d.data() }))),
        err  => { console.error(err); if(onError) onError(err); });
    },
    add:(item) => addDoc(col, item),
    update:(id, patch) => updateDoc(doc(db, colName, id), patch),
    remove:(id) => deleteDoc(doc(db, colName, id)),
    async reorder(idsInOrder){
      const batch = writeBatch(db);
      idsInOrder.forEach((id, i) => batch.update(doc(db, colName, id), { order:(i + 1) * 10 }));
      await batch.commit();
    },
  });

  return {
    shared:true,
    phases: crud(fazeCol, 'harmonogram_faze'),
    kroky:  crud(krokyCol, 'harmonogram_kroky'),
    async seedIfEmpty(defaultPhases){
      const snap = await getDoc(metaRef);
      if(snap.exists()) return;
      const batch = writeBatch(db);
      batch.set(metaRef, { seeded:true, at:Date.now() });
      defaultPhases.forEach((phase, i) => {
        const pRef = doc(fazeCol);
        batch.set(pRef, { name:phase.name, when:phase.when || '', status:phase.status || 'planovano',
          note:phase.note || '', budgetCat:phase.budgetCat || null, start:phase.start || null, end:phase.end || null,
          order:(i + 1) * 10 });
        (phase.kroky || []).forEach((krok, j) => {
          const kRef = doc(krokyCol);
          batch.set(kRef, { phase:pRef.id, text:krok.text, status:krok.status || phase.status || 'planovano',
            when:krok.when || '', order:(j + 1) * 10 });
        });
      });
      await batch.commit();
    },
  };
}

/* ============================================================
   createTimelineStore – fasáda nad backendem (Firebase → fallback lokál),
   se seedováním výchozích fází/kroků při prvním použití.
   opts: { fazeKey, krokyKey, onPhases(list,shared), onKroky(list,shared), onStatus(kind,text) }
   ============================================================ */
export async function createTimelineStore(opts = {}){
  const fazeKey  = opts.fazeKey  || 'rdmodrice-harmonogram-faze-v1';
  const krokyKey = opts.krokyKey || 'rdmodrice-harmonogram-kroky-v1';
  const status = (k, t) => { if(opts.onStatus) opts.onStatus(k, t); };

  let current = null;
  const facade = {
    get shared(){ return current ? current.shared : false; },
    phases:{
      add:    (...a) => current.phases.add(...a),
      update: (...a) => current.phases.update(...a),
      remove: (...a) => current.phases.remove(...a),
      reorder:(...a) => current.phases.reorder(...a),
    },
    kroky:{
      add:    (...a) => current.kroky.add(...a),
      update: (...a) => current.kroky.update(...a),
      remove: (...a) => current.kroky.remove(...a),
      reorder:(...a) => current.kroky.reorder(...a),
    },
  };

  const goLocal = (reason) => {
    let seeded = null;
    try { seeded = JSON.parse(localStorage.getItem(fazeKey)); } catch(e){}
    if(!seeded || !seeded.length){
      const phases = [], kroky = [];
      DEFAULT_PHASES.forEach((phase, i) => {
        const pid = 'l' + Date.now() + '_p' + i;
        phases.push({ id:pid, name:phase.name, when:phase.when || '', status:phase.status || 'planovano',
          note:phase.note || '', budgetCat:phase.budgetCat || null, start:phase.start || null, end:phase.end || null,
          order:(i + 1) * 10 });
        (phase.kroky || []).forEach((krok, j) => {
          kroky.push({ id:'l' + Date.now() + '_k' + i + '_' + j, phase:pid, text:krok.text,
            status:krok.status || phase.status || 'planovano', when:krok.when || '', order:(j + 1) * 10 });
        });
      });
      try { localStorage.setItem(fazeKey, JSON.stringify(phases)); } catch(e){}
      try { localStorage.setItem(krokyKey, JSON.stringify(kroky)); } catch(e){}
    }
    const phasesB = localCrudBackend(fazeKey);
    const krokyB  = localCrudBackend(krokyKey);
    current = { shared:false, phases:phasesB, kroky:krokyB };
    status('', '🔒 Uloženo jen v tomto prohlížeči' + (reason ? ' – ' + reason : '') + '.');
    phasesB.subscribe(list => opts.onPhases && opts.onPhases(list, false));
    krokyB.subscribe(list => opts.onKroky && opts.onKroky(list, false));
  };

  const useFb = firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey.length > 10;
  if(!useFb){ goLocal('pro sdílení doplň konfiguraci Firebase'); return facade; }

  try {
    const fb = await firebaseBackend();
    await fb.seedIfEmpty(DEFAULT_PHASES);
    current = fb;
    status('ok', '🟢 Sdílené online – harmonogram vidí a upravují všichni v reálném čase.');
    let fell = false;
    const onErr = () => { if(fell) return; fell = true; status('warn', '⚠️ Online databáze není dostupná – ukládá se jen lokálně.'); goLocal(); };
    fb.phases.subscribe(list => opts.onPhases && opts.onPhases(list, true), onErr);
    fb.kroky.subscribe(list => opts.onKroky && opts.onKroky(list, true), onErr);
  } catch(e){
    console.error(e);
    goLocal('online databázi se nepodařilo načíst');
  }
  return facade;
}
