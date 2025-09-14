import { getSettings, getWorkId } from './settings.js';

const LS_PREFIX = 'paria::';

export function keyForCurrent(){
  const s = getSettings();
  const workId = getWorkId(s);
  return `${LS_PREFIX}${workId}`;
}

export function ensureBaseBlob(){
  const k = keyForCurrent();
  const raw = localStorage.getItem(k);
  if (!raw){
    const base = {
      items: [],             // cards
      charter: { title:'', content:'', tags:[], ai:[], state:{deleted:false, updated_ts:Date.now()} },
      scenarios: [],         // scenarios
      meta: { session:{ status:'idle', card_id:'', started_ts:0, stopped_ts:0, updated_ts:Date.now(), comments:[], annotations:[] } },
      journal: []            // audit log
    };
    localStorage.setItem(k, JSON.stringify(base));
    return base;
  }
  return JSON.parse(raw);
}

export function readClientBlob(){
  const k = keyForCurrent();
  const raw = localStorage.getItem(k);
  return raw ? JSON.parse(raw) : ensureBaseBlob();
}

export function writeClientBlob(blob){
  const k = keyForCurrent();
  localStorage.setItem(k, JSON.stringify(blob));
  return true;
}

/*
INDEX store.js:
- keyForCurrent()
- ensureBaseBlob()
- readClientBlob()
- writeClientBlob()
*/
