// src/core/budget.js — quotas + helpers compatibles UI
import { getSettings } from './settings.js';
import { readClientBlob } from './store.js';

const DEFAULT_LIMIT = 5 * 1024 * 1024;

export function usedBytes(){ try{ return new Blob([JSON.stringify(readClientBlob())]).size; }catch{ return 0; } }
export function getBudget(){
  try{ const limit=getSettings().budgets?.max_local_bytes||DEFAULT_LIMIT; const used=usedBytes(); return { used, limit, usage: used/limit }; }
  catch{ return { used:0, limit:DEFAULT_LIMIT, usage:0 }; }
}
export function watchBudget(cb){ const tick=()=>cb(getBudget().usage); tick(); const id=setInterval(tick,3000); return ()=>clearInterval(id); }
export function updateStorageBadge(){
  const el=document.getElementById('quotaBadge'); if(!el) return;
  const {usage}=getBudget(); const pct=Math.round(usage*100);
  el.textContent=`local ${pct}%`; el.classList.remove('b-green','b-orange','b-red');
  if(pct>=90) el.classList.add('b-red'); else if(pct>=70) el.classList.add('b-orange'); else el.classList.add('b-green');
}
export function commitWithEviction(){ /* remote-only snapshots → no-op */ }
export function ensurePreRestoreBudget(){ return getBudget().usage<=0.90; }
export function consolidateAfterRestore(){ try{ updateStorageBadge(); }catch{} return true; }

/*
INDEX budget.js:
- usedBytes, getBudget, watchBudget, updateStorageBadge
- commitWithEviction, ensurePreRestoreBudget, consolidateAfterRestore
*/
