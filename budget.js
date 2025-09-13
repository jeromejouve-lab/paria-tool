import { settingsLoad } from './settings.js';
import { readClientBlob, writeClientBlob } from './store.js';

const usedBytes = () => {
  let n = 0;
  for (let i=0;i<localStorage.length;i++){
    const k = localStorage.key(i);
    const v = localStorage.getItem(k);
    n += (k?.length||0) + (v?.length||0);
  }
  return n;
};

export function updateStorageBadge(){
  const st = settingsLoad();
  const pct = Math.min(100, Math.round(100*usedBytes()/st.budgets.max_local_bytes));
  const b = document.getElementById('quotaBadge');
  if (!b) return;
  b.textContent = `local ${pct}%`;
  b.className = 'badge '+(pct<40?'b-green':pct<90?'b-orange':'b-red');
}

/** anneau local "light" uniquement pour le journal (ne purge pas côté API) */
function capLocalJournal(s){
  const MAX = 200; // tu peux mettre un cap par taille si tu préfères
  if (Array.isArray(s.decisions) && s.decisions.length > MAX){
    s.decisions = s.decisions.slice(-MAX);
  }
  return s;
}

/** actifs intouchables : maquette (tu complèteras quand Cards/Scénarios seront là) */
function isActive(_it){ return true; } // placeholder

/** offload non-actif : TODO (branché M2/M3) — ici on ne fait que caper localement */
export function commitWithEviction(){
  const cur = readClientBlob();
  const trimmed = capLocalJournal(cur);
  writeClientBlob(trimmed);
  updateStorageBadge();
  return true;
}
