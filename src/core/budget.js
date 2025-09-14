import { readClientBlob } from './store.js';

// Quotas: 45% (préventif), 70% (alerte), 90% (alerte forte, on stoppe nouveaux snapshots locaux)
const LIMIT_BYTES = 5 * 1024 * 1024; // 5MB par défaut, ajuste si besoin

export function getBudget(){
  try{
    const raw = JSON.stringify(readClientBlob());
    const used = (new Blob([raw])).size;
    return { used, limit: LIMIT_BYTES, usage: used / LIMIT_BYTES };
  }catch{ return { used:0, limit:LIMIT_BYTES, usage:0 }; }
}

export function watchBudget(cb){
  // L’UI actuelle affiche déjà des hints ; on laisse un hook léger
  const tick = ()=> cb(getBudget().usage);
  tick();
  const id = setInterval(tick, 3000);
  return ()=> clearInterval(id);
}

export function commitWithEviction(){
  // À 90%+: tu continues le courant, mais pas de nouveaux snapshots locaux (à gérer côté écrans de backup)
}

/*
INDEX budget.js:
- getBudget()
- watchBudget(cb)
- commitWithEviction()
- LIMIT_BYTES (interne)
*/
