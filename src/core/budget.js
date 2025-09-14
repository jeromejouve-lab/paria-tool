// src/core/budget.js — quotas 45/70/90 (local = courant)
import { getSettings } from './settings.js';
import { readClientBlob } from './store.js';

export function getBudget(){
  try{
    const raw = JSON.stringify(readClientBlob());
    const used = (new Blob([raw])).size;
    const limit = getSettings().budgets?.max_local_bytes || (5*1024*1024);
    return { used, limit, usage: used/limit };
  }catch{ return { used:0, limit:5*1024*1024, usage:0 }; }
}
export function watchBudget(cb){
  const tick=()=> cb(getBudget().usage);
  tick();
  const id=setInterval(tick,3000);
  return ()=> clearInterval(id);
}
// À 90% : pas de nouveaux snapshots locaux (de toute façon on ne fait que remote)
export function commitWithEviction(){}

/*
INDEX budget.js:
- getBudget()
- watchBudget(cb)
- commitWithEviction()
*/
