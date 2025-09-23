// PARIA-V2-CLEAN v1.0.0 | src/app.js — routeur d’onglets (bind-only, pas d’injection)
import * as Settings  from './ui/tabs/settings.js';
import * as Charter   from './ui/tabs/charter.js';
import * as Cards     from './ui/tabs/cards.js';
import * as Scenarios from './ui/tabs/scenarios.js';
import * as Projector from './ui/tabs/projector.js';
import * as Journal   from './ui/tabs/journal.js';
import './core/compat-exports.js';
import * as Seances   from './ui/tabs/seances.js';


const mounts = {
  settings : Settings.mount,
  charter  : Charter.mount,
  cards    : Cards.mount,
  scenarios: Scenarios.mount,
  projector: Projector.mount,
  journal  : Journal.mount,
  seances  : Seances.mount,
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
  document.querySelectorAll('header nav [data-tab]').forEach(b=>{
    const on = (b.dataset.tab === tab);
    b.classList.toggle('active', on);
    b.classList.toggle('is-active', on); // <- au cas où l’ancien CSS le regarde
  });
  // optionnel: hash (pas obligatoire)
  try { history.replaceState(null,'',`#${tab}`); } catch {}
}

// init workspace (pull Git s’il faut) + lancer l’unique auto-backup
import('/paria-tool/src/domain/reducers.js').then(({ hydrateOnEnter, startAutoBackup })=>{
  hydrateOnEnter();
  startAutoBackup(5*60*1000);
});

export function boot(){
  // --- VIEWER-ONLY (Projecteur) — doit s'exécuter AVANT tout showTab / bind ---
  {
    const params = new URLSearchParams(location.search);
    const mode   = params.get('mode');
    const cardQ  = params.get('card');
  
    if (mode === 'projecteur') {
      if (cardQ) { try { localStorage.setItem('projector.sel', String(cardQ)); } catch {} }
      document.documentElement.classList.add('viewer-only');
      let st = document.getElementById('viewer-only-css');
      if (!st) {
        st = document.createElement('style');
        st.id = 'viewer-only-css';
        st.textContent = `
          .viewer-only [data-tab] { display:none !important; }
          .viewer-only #tabs, .viewer-only .tabs, .viewer-only nav, .viewer-only .topbar { display:none !important; }
          .viewer-only body { overflow:hidden; }
        `;
        document.head.appendChild(st);
      }
      // masquer tout de suite d'éventuels boutons déjà présents
      document.querySelectorAll('[data-tab]').forEach(btn => { btn.style.display = 'none'; });
      // afficher UNIQUEMENT le projecteur et sortir
      showTab('projector');
      return;
    }
  }
  // ---------------------------------------------------------------------------

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
  
  // switch auto via URL ?mode=projecteur|seance&session=...
  try {
    const q = new URLSearchParams(location.search);
    const mode = q.get('mode'); const ses = q.get('session');
    if (ses && mode === 'projecteur') showTab('projector');
    if (ses && mode === 'seance')     showTab('seances'); // (temporaire tant que l’onglet Séance n’est pas séparé)
  } catch {}
}

// auto-boot
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(boot, 0);
} else {
  document.addEventListener('DOMContentLoaded', boot);
}

// utile au besoin depuis la console
try { window.showTab = showTab; window.pariaBoot = boot; } catch {}
















