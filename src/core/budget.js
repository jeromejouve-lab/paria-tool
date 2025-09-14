// src/core/budget.js — quotas 45/70/90 (local = courant)
import { readClientBlob } from './store.js';

const LIMIT_BYTES = 5 * 1024 * 1024; // 5MB par défaut (ajuste si besoin)

export function getBudget(){
  try{
    const raw = JSON.stringify(readClientBlob());
    const used = (new Blob([raw])).size;
    return { used, limit: LIMIT_BYTES, usage: used / LIMIT_BYTES };
  }catch{ return { used:0, limit:LIMIT_BYTES, usage:0 }; }
}

export function watchBudget(cb){
  const tick = ()=> cb(getBudget().usage);
  tick();
  const id = setInterval(tick, 3000);
  return ()=> clearInterval(id);
}

// à 90%: on continue le "courant", mais on ne crée plus de nouveaux snapshots locaux (les snapshots sont de toute façon remote-only ici)
export function commitWithEviction(){}

/*
INDEX budget.js:
- getBudget()
- watchBudget(cb)
- commitWithEviction()
- LIMIT_BYTES (interne)
*/
