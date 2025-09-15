// PARIA-V2-CLEAN v1.0.0 | core/store.js
import { currentWorkId } from './settings.js';
const LS_PREFIX='paria::';
const key=()=>`${LS_PREFIX}${currentWorkId()}`;

const BASE = ()=>({
  items:[],
  scenarios:[],
  charter:{ title:'', content:'', tags:[], ai:[], state:{ deleted:false, updated_ts:Date.now() } },
  meta:{ session:{ status:'idle', card_id:'', started_ts:0, stopped_ts:0, updated_ts:Date.now(), comments:[], annotations:[], ai:[] } },
  journal:[]
});

export function ensureBaseBlob(){ const k=key(); if(!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(BASE())); return readClientBlob(); }
export function readClientBlob(){ const raw=localStorage.getItem(key()); return raw?JSON.parse(raw):ensureBaseBlob(); }
export function writeClientBlob(blob){ localStorage.setItem(key(), JSON.stringify(blob)); return true; }

// util
export function usedBytes(){
  let total=0; for (let i=0;i<localStorage.length;i++){ const k=localStorage.key(i)||''; if (k.startsWith(LS_PREFIX)) { const v=localStorage.getItem(k)||''; total+=k.length+v.length; } }
  return total;
}

/* INDEX
- ensureBaseBlob/readClientBlob/writeClientBlob
- usedBytes()
*/
