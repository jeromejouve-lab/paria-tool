import { readClientBlob } from './store.js';

// Seuils: 45% / 70% / 90%
const LIMIT_BYTES = 5 * 1024 * 1024; // 5MB cible locale (à adapter si besoin)
let listeners = [];

export function getBudget(){
  try{
    const raw = JSON.stringify(readClientBlob());
    const used = (new Blob([raw])).size;
    return { used, limit: LIMIT_BYTES, usage: used / LIMIT_BYTES };
  }catch{
    return { used:0, limit:LIMIT_BYTES, usage:0 };
  }
}

export function watchBudget(cb){
  listeners.push(cb);
  const tick = ()=> {
    const { usage } = getBudget();
    cb(usage);
  };
  tick();
  // light polling pour démo (tu peux remplacer par events ciblés)
  setInterval(tick, 3000);
}

export function commitWithEviction(){
  const { usage } = getBudget();
  if (usage >= 0.90){
    // règle: on autorise encore le courant mais on bloque nouveaux snapshots locaux
    // ( à implémenter dans l’écran snapshot / journal si besoin )
  }
}

/*
INDEX budget.js:
- LIMIT_BYTES
- getBudget()
- watchBudget(cb)
- commitWithEviction()
*/
