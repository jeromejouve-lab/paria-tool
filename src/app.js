// PARIA-V2-CLEAN v1.0.0 | src/app.js — routeur d’onglets (bind-only, pas d’injection)
import * as Settings  from './ui/tabs/settings.js';
import * as Charter   from './ui/tabs/charter.js';
import * as Cards     from './ui/tabs/cards.js';
import * as Scenarios from './ui/tabs/scenarios.js';
import * as Projector from './ui/tabs/projector.js';
import * as Journal   from './ui/tabs/journal.js';
import './core/compat-exports.js';

// --- app.js ---
import { backupFlushLocal, backupPushGit } from './domain/reducers.js';
import { backupsList, restoreFromGit } from './domain/reducers.js';

window.__pariaHydrating = true;

// --- AUTOSAVE LOCAL (central) ---
let __flushTimer = null;
export function scheduleFlushLocal(delay = 300) {
  if (window.__pariaHydrating) return; // ⛔ pas de flush pendant l’hydratation
  clearTimeout(__flushTimer);
  __flushTimer = setTimeout(async () => {
    try {
      const m = await import('./domain/reducers.js');
      m.backupFlushLocal?.(); // UI -> blob (passera par safeWriteBlob)
    } catch(e){ console.warn('[autosave] flush local fail', e?.message||e); }
  }, delay);
}

async function initOnBoot(){}
initOnBoot();

// 1) saisie/édition (input + change) => flush (debounce 300ms)
document.addEventListener('input',  ev => {
  scheduleFlushLocal(300);
}, true);
document.addEventListener('change', ev => {
  scheduleFlushLocal(0);
}, true);

// 2) on quitte la page ou elle passe en arrière-plan => flush immédiat
window.addEventListener('beforeunload', () => { try{ scheduleFlushLocal(0); }catch{} });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) scheduleFlushLocal(0);
});

const mounts = {
  settings : Settings.mount,
  charter  : Charter.mount,
  cards    : Cards.mount,
  scenarios: Scenarios.mount,
  projector: Projector.mount,
  journal  : Journal.mount,
};

const TABS = Object.keys(mounts);

export function showTab(tab){
  if (!TABS.includes(tab)) return;
  
  // afficher/masquer les sections
  for (const id of TABS){
    const sec = document.getElementById(`tab-${id}`);
    if (sec) sec.style.display = (id === tab ? '' : 'none');
  }
  
  // appeler le mount de l’onglet
  const fn = mounts[tab];
  if (typeof fn === 'function') { try { fn(); } catch (e) { console.error('mount error:', tab, e); } }
  
  // marquer l’onglet actif sur la nav si tu as des classes .active
  scheduleFlushLocal(0);   // flush immédiat AVANT de quitter l’onglet courant
  document.querySelectorAll('header nav [data-tab]').forEach(b=>{
    const on = (b.dataset.tab === tab);
    b.classList.toggle('active', on);
    b.classList.toggle('is-active', on); // <- au cas où l’ancien CSS le regarde
  });
  
  // optionnel: hash (pas obligatoire)
  try { history.replaceState(null,'',`#${tab}`); } catch {}
}

// init workspace (pull Git s’il faut) + lancer l’unique auto-backup
import('./domain/reducers.js').then(async ({ hydrateOnEnter, startAutoBackup })=>{
  try {
    await hydrateOnEnter();            // <— on attend l’hydratation locale/git
  } finally {
    window.__pariaHydrating = false;
    document.dispatchEvent(new CustomEvent('paria:hydrated'));
  }
  startAutoBackup(60*60*1000);         // autobackup toutes les heures
});

export function boot(){
  
  // délégation de clic sur toute la page (boutons, liens, etc. portant data-tab)
  document.addEventListener('click', (ev)=>{
    const el = ev.target.closest('[data-tab]');
    if (!el) return;
    const tab = el.dataset.tab;
    if (!TABS.includes(tab)) return;
    ev.preventDefault();
    showTab(tab);
  });

  // onglet par défaut: hash si présent, sinon premier bouton, sinon settings
  const hash = (location.hash||'').replace('#','');
  const firstBtn = document.querySelector('[data-tab]');
  const first = TABS.includes(hash) ? hash : (firstBtn?.dataset?.tab && TABS.includes(firstBtn.dataset.tab) ? firstBtn.dataset.tab : 'settings');
  showTab(first);
}

// auto-boot
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(boot, 0);
} else {
  document.addEventListener('DOMContentLoaded', boot);
}

// utile au besoin depuis la console
try { window.showTab = showTab; window.pariaBoot = boot; } catch {}






















