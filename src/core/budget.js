// src/core/budget.js — quotas + helpers compatibles avec l’UI
import { getSettings } from './settings.js';
import { readClientBlob } from './store.js';

const DEFAULT_LIMIT = 5 * 1024 * 1024; // 5 MB

// Taille utilisée par l’état "courant" (LocalStorage → blob JSON)
export function usedBytes(){
  try {
    const raw = JSON.stringify(readClientBlob());
    return new Blob([raw]).size;
  } catch {
    return 0;
  }
}

// Renvoie { used, limit, usage (0..1) }
export function getBudget(){
  try{
    const limit = getSettings().budgets?.max_local_bytes || DEFAULT_LIMIT;
    const used  = usedBytes();
    return { used, limit, usage: used / limit };
  }catch{
    return { used:0, limit:DEFAULT_LIMIT, usage:0 };
  }
}

// Appelle cb(usage:0..1) régulièrement (pour le badge)
export function watchBudget(cb){
  const tick = ()=> cb(getBudget().usage);
  tick();
  const id = setInterval(tick, 3000);
  return ()=> clearInterval(id);
}

// Met à jour l’affichage du badge #quotaBadge (classes b-green/orange/red)
export function updateStorageBadge(){
  const el = document.getElementById('quotaBadge');
  if (!el) return;
  const { usage } = getBudget();
  const pct = Math.round(usage * 100);
  el.textContent = `local ${pct}%`;
  el.classList.remove('b-green','b-orange','b-red');
  if (pct >= 90) el.classList.add('b-red');
  else if (pct >= 70) el.classList.add('b-orange');
  else el.classList.add('b-green');
}

// Hook d’écriture (ici no-op; snapshots locaux interdits au-delà de 90%)
export function commitWithEviction(){ /* no-op by design (remote-only snapshots) */ }

// Hooks utilisés par Réglages → Restauration
// - ensurePreRestoreBudget(): vérif avant restauration (on autorise jusqu’à 90%)
// - consolidateAfterRestore(): rafraîchit les indicateurs après restauration
export function ensurePreRestoreBudget(){
  const { usage } = getBudget();
  // Politique : on autorise la restauration tant qu’on n’a pas dépassé 90%.
  return usage <= 0.90;
}

export function consolidateAfterRestore(){
  // Après restauration : on met juste à jour le badge.
  try { updateStorageBadge(); } catch {}
  return true;
}

/*
INDEX budget.js:
- usedBytes()
- getBudget()
- watchBudget(cb)
- updateStorageBadge()
- commitWithEviction()
- ensurePreRestoreBudget()
- consolidateAfterRestore()
*/
