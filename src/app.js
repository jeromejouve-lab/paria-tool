// PARIA-V2-CLEAN v1.0.0 | src/app.js — routeur d’onglets (bind-only, pas d’injection)
import * as Settings  from './ui/tabs/settings.js';
import * as Charter   from './ui/tabs/charter.js';
import * as Cards     from './ui/tabs/cards.js';
import * as Seances from './ui/tabs/seances.js';
import * as Projector from './ui/tabs/projector.js';
import * as Journal   from './ui/tabs/journal.js';
import './core/compat-exports.js';

// --- app.js ---
import { backupFlushLocal, backupPushGit, backupsList, restoreFromGit, readClientBlob } from './domain/reducers.js';
import { buildWorkId } from './core/settings.js';
import { stateSet, stateGet, dataSet, aesImportKeyRawB64, aesEncryptJSON } from './core/net.js';

window.__pariaHydrating = true;
window.__sess = { b64:null, key:null, exp:0 }; // K_sess en base64 + CryptoKey + expiration (ms)

async function ensureSessionKey(){
  const now = Date.now();
  if (window.__sess.key && window.__sess.exp > now+5000) return window.__sess;
  // (re)génère une clé 256 bits
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const b64 = b64e(raw);
  const key = await aesImportKeyRawB64(b64);
  window.__sess = { b64, key, exp: now + 30_000 }; // TTL 30s
  // publie la clé côté état (visible seulement si tabs.on)
  await stateSet(buildWorkId(), { K_sess:b64, exp_s:30 }); 
  return window.__sess;
}

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

let __pubTimer = null;
let __stateTimer = null;
async function publishState(){
  try{
    const workId = buildWorkId();
    const m = await import('./domain/reducers.js');
    if (m.isRemoteViewer?.()) return; // remote = lecture seule, pas d’emit
    const blob = m.readClientBlob?.() || {};
    await stateSet(workId, { tabs: blob.tabs || {} });
  }catch(e){ /* no-op best-effort */ }
}

document.addEventListener('paria:blob-updated', ()=>{
  clearTimeout(__pubTimer);
  __pubTimer = setTimeout(publishEncryptedSnapshot, 300); // throttle
  
  // publier aussi l'état des tabs (léger et throttlé)
  clearTimeout(__stateTimer);
  __stateTimer = setTimeout(publishState, 150);
});

// publication immédiate quand un onglet bascule (évènement dédié des reducers)
document.addEventListener('paria:tabs-changed', ()=>{ publishState(); });
});

async function publishEncryptedSnapshot(){
  const workId = buildWorkId();
  const { isRemoteViewer } = await import('./domain/reducers.js');
  if (isRemoteViewer()) return; // remote = lecture seule, pas de publication

  // si l’onglet séance/projecteur n’est pas "on", on ne publie pas
  // on décide depuis le blob local (source de vérité)
  const { readClientBlob } = await import('./domain/reducers.js');
  const blob = readClientBlob();
  const on = (blob?.tabs?.seance === 'on') || (blob?.tabs?.projector === 'on');
  if (!on) return;

  // on pousse aussi l’état des tabs côté "state" (meilleure synchro remote)
  await stateSet(workId, { tabs: blob.tabs || {} });

  const sess = await ensureSessionKey();
  const b64e = (u8)=> btoa(String.fromCharCode(...u8));
  
  // extrait seulement ce qui doit être partagé (mini-cards, etc.)
  const view = {
    cards: (blob.cards||[]).filter(c => c.kind==='mini' && !c?.state?.deleted),
    tabs:  blob.tabs||{},
    index: blob.index||{},
    ver:   1,
    ts:    Date.now()
  };
  const { iv, ct } = await aesEncryptJSON(sess.key, view);
  await dataSet(workId, { iv, ct, ver:1, ts:Date.now() });
}

await stateSet(buildWorkId(), { K_sess:null }); // clé retirée => clients ne peuvent plus déchiffrer

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
  seances: Seances.mount,
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
import('./domain/reducers.js').then(async ({ hydrateOnEnter, startAutoBackup, isRemoteViewer })=>{
  try {
    // côté remote → pas d’hydratation réseau
    if (!isRemoteViewer()) {
      await hydrateOnEnter();   // <— hydratation locale/git seulement en mode auteur
    }
  } finally {
    window.__pariaHydrating = false;
    document.dispatchEvent(new CustomEvent('paria:hydrated'));
  }
  // côté remote → pas d’autobackup
  if (!isRemoteViewer()) {
    startAutoBackup(60*60*1000);
  }
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






























