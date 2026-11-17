/* ============================================================
   RD Modřice – Grmelovi · čtení sdílených dat (jen pro čtení)
   Lehké načtení z Firestore přes REST – bez Firebase SDK, takže se
   přehledové stránky (úvodní Přehled, Postup stavby) načtou rychle.
   Zápisy tu nejsou; upravuje se na stránkách jednotlivých nástrojů.
   Když databáze není dostupná, vrací se záloha z prohlížeče
   (localStorage – stejné klíče jako u nástrojů), případně výchozí plán.
   ============================================================ */
import { firebaseConfig } from './firebase-config.js';

export const esc = s => (s == null ? '' : String(s)).replace(/[&<>"']/g, m =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));

export const online = () => !!(firebaseConfig && firebaseConfig.projectId &&
  firebaseConfig.apiKey && firebaseConfig.apiKey.length > 10);

const docsRoot = () => `projects/${firebaseConfig.projectId}/databases/(default)/documents`;
const base = () => `https://firestore.googleapis.com/v1/${docsRoot()}`;

/* Firestore REST vrací „typované" hodnoty (stringValue, mapValue…). */
export function unwrap(v){
  if(!v || typeof v !== 'object') return null;
  if('stringValue' in v) return v.stringValue;
  if('integerValue' in v) return Number(v.integerValue);
  if('doubleValue' in v) return v.doubleValue;
  if('booleanValue' in v) return v.booleanValue;
  if('timestampValue' in v) return v.timestampValue;
  if('nullValue' in v) return null;
  if('arrayValue' in v) return (v.arrayValue.values || []).map(unwrap);
  if('mapValue' in v){
    const o = {}, f = v.mapValue.fields || {};
    for(const k in f) o[k] = unwrap(f[k]);
    return o;
  }
  return null;
}
function toObj(doc){
  const o = { id: String(doc.name || '').split('/').pop() }, f = doc.fields || {};
  for(const k in f) o[k] = unwrap(f[k]);
  return o;
}
async function ok(res){
  if(!res.ok) throw new Error('Firestore ' + res.status);
  return res.json();
}

/* Celá kolekce (stránkovaně). `fields` = jen vybraná pole – obrázky
   (thumb/img/images) tak zůstanou v databázi a nestahují se megabajty. */
export async function listDocs(coll, fields){
  const out = [];
  let token = '';
  do {
    const qs = new URLSearchParams({ key: firebaseConfig.apiKey, pageSize: '300' });
    (fields || []).forEach(f => qs.append('mask.fieldPaths', f));
    if(token) qs.set('pageToken', token);
    const j = await ok(await fetch(`${base()}/${coll}?${qs}`));
    (j.documents || []).forEach(d => out.push(toObj(d)));
    token = j.nextPageToken || '';
  } while(token && out.length < 3000);
  return out;
}

/* Několik nejnovějších/nejstarších dokumentů podle jednoho pole. */
export async function queryDocs(coll, { fields, orderBy, desc = true, limit = 10 } = {}){
  const q = { from: [{ collectionId: coll }], limit };
  if(fields && fields.length) q.select = { fields: fields.map(f => ({ fieldPath: f })) };
  if(orderBy) q.orderBy = [{ field: { fieldPath: orderBy }, direction: desc ? 'DESCENDING' : 'ASCENDING' }];
  const j = await ok(await fetch(`${base()}:runQuery?key=${encodeURIComponent(firebaseConfig.apiKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: q }),
  }));
  return (Array.isArray(j) ? j : []).filter(r => r.document).map(r => toObj(r.document));
}

/* Vybrané dokumenty podle id (např. náhledy jen těch fotek, které se ukážou). */
export async function getDocsById(coll, ids, fields){
  if(!ids || !ids.length) return [];
  const body = { documents: ids.map(id => `${docsRoot()}/${coll}/${id}`) };
  if(fields && fields.length) body.mask = { fieldPaths: fields };
  const j = await ok(await fetch(`${base()}:batchGet?key=${encodeURIComponent(firebaseConfig.apiKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
  return (Array.isArray(j) ? j : []).filter(r => r.found).map(r => toObj(r.found));
}

export function localList(key){
  try {
    const a = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(a) ? a : [];
  } catch(e){ return []; }
}

const byOrder = (a, b) => (a.order || 0) - (b.order || 0);

/* Harmonogram (fáze + dílčí kroky) – zdroj pravdy pro stav stavby.
   Vrací { phases, kroky, source:'online'|'local'|'default' }. */
export async function loadTimeline(){
  if(online()){
    try {
      const [phases, kroky] = await Promise.all([listDocs('harmonogram_faze'), listDocs('harmonogram_kroky')]);
      if(phases.length) return { phases: phases.sort(byOrder), kroky: kroky.sort(byOrder), source: 'online' };
    } catch(e){ console.warn('Harmonogram – databáze nedostupná:', e); }
  }
  const lp = localList('rdmodrice-harmonogram-faze-v1');
  if(lp.length){
    return { phases: lp.sort(byOrder), kroky: localList('rdmodrice-harmonogram-kroky-v1').sort(byOrder), source: 'local' };
  }
  // úplná záloha: výchozí plán zabudovaný ve webu
  const { DEFAULT_PHASES } = await import('./harmonogram.js');
  const phases = [], kroky = [];
  DEFAULT_PHASES.forEach((p, i) => {
    const id = 'd' + i;
    phases.push({ id, name: p.name, when: p.when || '', status: p.status || 'planovano', note: p.note || '',
      budgetCat: p.budgetCat || null, start: p.start || null, end: p.end || null, order: (i + 1) * 10 });
    (p.kroky || []).forEach((k, j) => kroky.push({ id: id + '_' + j, phase: id, text: k.text,
      status: k.status || p.status || 'planovano', when: k.when || '', order: (j + 1) * 10 }));
  });
  return { phases, kroky, source: 'default' };
}

/* ---------- fáze stavby u fotek ---------- */
/* Do které fáze fotka podle data spadá – vyhrává fáze, která začala
   nejpozději před datem fotky a ještě neskončila (fáze se překrývají). */
export function phaseForDate(phases, iso){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso || '') || !Array.isArray(phases)) return null;
  const month = iso.slice(0, 7);
  const hit = phases.filter(f => f.start && month >= f.start && (!f.end || month <= f.end));
  if(!hit.length) return null;
  hit.sort((a, b) => String(a.start).localeCompare(String(b.start)) || (a.order || 0) - (b.order || 0));
  return hit[hit.length - 1];
}

/* Fáze, pod kterou fotka patří: ta uložená u fotky, a když žádnou nemá,
   ta, do které spadá podle data (auto:true) – starší fotky i fotky bez ručně
   vybrané fáze se tak zařadí samy a přizpůsobí se změnám harmonogramu.
   Ručně zvolené „bez fáze" (phaseManual) se respektuje. */
export function effectivePhase(phases, it){
  if(!it) return null;
  const list = Array.isArray(phases) ? phases : [];
  if(it.phase){
    const f = list.find(x => x.id === it.phase);
    return { id: it.phase, name: f ? f.name : (it.phaseName || 'Jiná fáze'), status: f ? f.status : '', auto: false, known: !!f };
  }
  if(it.phaseManual) return null;
  const f = phaseForDate(list, it.date);
  return f ? { id: f.id, name: f.name, status: f.status, auto: true, known: true } : null;
}

/* ---------- drobnosti pro texty ---------- */
export function pluralCz(n, one, few, many){ return n === 1 ? one : (n >= 2 && n <= 4 ? few : many); }

export function fmtDay(iso){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : (iso || '');
}

/* „dnes", „včera", „před 5 dny", „před 3 týdny", „před 2 měsíci" */
export function agoCz(date){
  const d = date instanceof Date ? date : new Date(typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date + 'T12:00:00' : date);
  if(isNaN(d)) return '';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if(days <= 0) return 'dnes';
  if(days === 1) return 'včera';
  if(days < 14) return `před ${days} dny`;
  if(days < 60) return `před ${Math.round(days / 7)} týdny`;
  if(days < 365) return `před ${Math.round(days / 30)} měsíci`;
  const y = Math.round(days / 365);
  return y === 1 ? 'před rokem' : `před ${y} lety`;
}
