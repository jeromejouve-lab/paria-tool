// src/core/store.js — état local "courant" (LocalStorage)
import { getSettings, getWorkId } from './settings.js';

const LS_PREFIX = 'paria::';
const key = ()=> `${LS_PREFIX}${getWorkId(getSettings())}`;

export function ensureBaseBlob(){
  const k=key();
  if(!localStorage.getItem(k)){
    const base={
      items:[], // cards
      charter:{ title:'', content:'', tags:[], ai:[], state:{ deleted:false, updated_ts:Date.now() } },
      scenarios:[],
      meta:{ session:{ status:'idle', card_id:'', started_ts:0, stopped_ts:0, updated_ts:Date.now(), comments:[], annotations:[] } },
      journal:[]
    };
    localStorage.setItem(k, JSON.stringify(base));
  }
  return readClientBlob();
}
export function readClientBlob(){ const raw=localStorage.getItem(key()); return raw?JSON.parse(raw):ensureBaseBlob(); }
export function writeClientBlob(blob){ localStorage.setItem(key(), JSON.stringify(blob)); return true; }

/*
INDEX store.js:
- ensureBaseBlob(), readClientBlob(), writeClientBlob()
*/
