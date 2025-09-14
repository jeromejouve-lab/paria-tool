// src/core/store.js — état local "courant" (LocalStorage) + mergeIntoCurrentService
import { getSettings, getWorkId } from './settings.js';

const LS_PREFIX = 'paria::';
const key = () => `${LS_PREFIX}${getWorkId(getSettings())}`;

// ---------- Base blob ----------
export function ensureBaseBlob(){
  const k = key();
  if (!localStorage.getItem(k)) {
    const base = {
      items: [], // cards
      charter: { title:'', content:'', tags:[], ai:[], state:{ deleted:false, updated_ts:Date.now() } },
      scenarios: [],
      meta: { session:{ status:'idle', card_id:'', started_ts:0, stopped_ts:0, updated_ts:Date.now(), comments:[], annotations:[] } },
      journal: []
    };
    localStorage.setItem(k, JSON.stringify(base));
  }
  return readClientBlob();
}

export function readClientBlob(){
  const raw = localStorage.getItem(key());
  return raw ? JSON.parse(raw) : ensureBaseBlob();
}

export function writeClientBlob(blob){
  localStorage.setItem(key(), JSON.stringify(blob));
  return true;
}

// ---------- Merge helpers ----------
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

function mergeByIdArray(a = [], b = [], idKey = 'id', mergeItem = (x,y)=>({ ...x, ...y })) {
  const map = new Map();
  a.forEach(x => map.set(x?.[idKey] ?? Symbol(), x));
  b.forEach(y => {
    const id = y?.[idKey] ?? Symbol();
    if (map.has(id)) map.set(id, mergeItem(map.get(id), y));
    else map.set(id, y);
  });
  return Array.from(map.values());
}

function deepMerge(x, y){
  if (Array.isArray(x) && Array.isArray(y)) {
    // Si ce sont des objets avec id -> merge par id, sinon concat dédupli
    const objectsWithId = x.concat(y).every(it => isObj(it) && ('id' in it || 'card_id' in it));
    if (objectsWithId) {
      const idKey = ('card_id' in (x[0]||y[0]||{})) ? 'card_id' : 'id';
      return mergeByIdArray(x, y, idKey, deepMerge);
    }
    const seen = new Set();
    const out = [];
    for (const it of [...x, ...y]) {
      const k = JSON.stringify(it);
      if (!seen.has(k)) { seen.add(k); out.push(it); }
    }
    return out;
  }
  if (isObj(x) && isObj(y)) {
    const out = { ...x };
    for (const k of Object.keys(y)) {
      out[k] = k in x ? deepMerge(x[k], y[k]) : y[k];
    }
    return out;
  }
  // y remplace x (primitifs / types différents)
  return y;
}

// Merge spécifique aux structures PARIA (cards/charter/scenarios/journal/meta)
function pariaMerge(current, incoming){
  const cur = current || {};
  const inc = incoming || {};

  // Charter : merge champ à champ + ai par id
  const charter = (() => {
    const c = cur.charter || { title:'', content:'', tags:[], ai:[], state:{} };
    const i = inc.charter || {};
    const ai = mergeByIdArray(c.ai || [], i.ai || [], 'id', (x,y)=>({ ...x, ...y }));
    return {
      ...c,
      ...i,
      ai,
      tags: Array.from(new Set([...(c.tags||[]), ...(i.tags||[])])),
      state: { ...(c.state||{}), ...(i.state||{}), updated_ts: Date.now() }
    };
  })();

  // Cards (items) : merge par id + merge ai par id
  const items = (() => {
    const a = cur.items || [];
    const b = inc.items || [];
    return mergeByIdArray(a, b, 'id', (x,y) => ({
      ...x, ...y,
      ai: mergeByIdArray(x.ai || [], y.ai || [], 'id', (u,v)=>({ ...u, ...v })),
      tags: Array.from(new Set([...(x.tags||[]), ...(y.tags||[])])),
      state: { ...(x.state||{}), ...(y.state||{}), updated_ts: Date.now() }
    }));
  })();

  // Scenarios : merge par id + cards (références) par card_id
  const scenarios = (() => {
    const a = cur.scenarios || [];
    const b = inc.scenarios || [];
    return mergeByIdArray(a, b, 'id', (x,y) => ({
      ...x, ...y,
      cards: mergeByIdArray(x.cards || [], y.cards || [], 'card_id', (u,v)=>({ ...u, ...v })),
      state: { ...(x.state||{}), ...(y.state||{}), updated_ts: Date.now() }
    }));
  })();

  // Journal : concat + dédupl (ts+type+target.id)
  const journal = (() => {
    const j = [...(cur.journal || []), ...(inc.journal || [])];
    const seen = new Set();
    const out = [];
    for (const e of j) {
      const k = `${e.ts||0}|${e.type||''}|${e?.target?.kind||''}|${e?.target?.id||''}`;
      if (!seen.has(k)) { seen.add(k); out.push(e); }
    }
    return out.sort((a,b)=>(a.ts||0)-(b.ts||0));
  })();

  // Meta/session : on garde la session en cours, on fusionne note/annotations
  const meta = (() => {
    const a = cur.meta?.session || { status:'idle', card_id:'', started_ts:0, stopped_ts:0, updated_ts:Date.now(), comments:[], annotations:[] };
    const b = inc.meta?.session || {};
    return {
      session: {
        ...a, ...b,
        comments: mergeByIdArray(a.comments || [], b.comments || [], 'id', (x,y)=>({ ...x, ...y })),
        annotations: mergeByIdArray(a.annotations || [], b.annotations || [], 'id', (x,y)=>({ ...x, ...y })),
        updated_ts: Date.now()
      }
    };
  })();

  return { items, charter, scenarios, meta, journal };
}

// ---------- API demandée par l’UI ----------
/**
 * mergeIntoCurrentService(blobOrPartial, opts?)
 * - Fusionne un blob (entier ou partiel) dans l'état courant {client::service}.
 * - opts.mode:
 *    - 'merge' (défaut) : fusion prudente (voir règles ci-dessus)
 *    - 'replace' : remplace entièrement l'état courant par le blob donné
 * Renvoie le blob final écrit.
 */
export function mergeIntoCurrentService(blobOrPartial, opts = {}){
  const mode = opts.mode || 'merge';
  const current = readClientBlob();

  let next;
  if (mode === 'replace') {
    next = blobOrPartial && typeof blobOrPartial === 'object' ? blobOrPartial : current;
  } else {
    // merge
    next = pariaMerge(current, blobOrPartial || {});
  }

  writeClientBlob(next);
  return next;
}

/*
INDEX store.js:
- ensureBaseBlob(), readClientBlob(), writeClientBlob()
- mergeIntoCurrentService(blobOrPartial, {mode?})
*/
