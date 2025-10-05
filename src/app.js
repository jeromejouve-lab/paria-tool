// PARIA-V2-CLEAN v1.0.0 | src/app.js — routeur d’onglets (bind-only, pas d’injection)
import * as Settings  from './ui/tabs/settings.js';
import * as Charter   from './ui/tabs/charter.js';
import * as Cards     from './ui/tabs/cards.js';
import * as Seances from './ui/tabs/seances.js';
import * as Projector from './ui/tabs/projector.js';
import * as Journal   from './ui/tabs/journal.js';
import './core/compat-exports.js';

import { ensureSessionKey } from './app.js';

// --- app.js ---
import { backupFlushLocal, backupPushGit, backupsList, restoreFromGit, readClientBlob } from './domain/reducers.js';
import { buildWorkId } from './core/settings.js';
import { stateSet, saveSnapshotToGit } from './core/net.js';

// -- Handler unique : construit et copie l'URL remote sous /paria-tool/ --
document.addEventListener('paria:remote-link', async (e) => {
  const { tab, action } = e.detail || {};
  if (!tab) return;
  const kind = (tab === 'seance') ? 'seances' : 'projector';

  // si tab 'off' => forcer 'on' pour publier
  try {
    const r = await import('./domain/reducers.js');
    if (r.getTabMode?.(tab) === 'off') r.setTabMode?.(tab, 'on');
  } catch {}

  // 1) Préparer wid/sid/k en PRIORITÉ depuis e.detail (centralisation)
  const wid = e?.detail?.workId || (await import('./core/settings.js')).buildWorkId();
  const sid = e?.detail?.sid
           || (await ensureSessionKey()).sid
           || ('S-' + new Date().toISOString().slice(0,10) + '-' + Math.random().toString(36).slice(2,8));
  const tok = e?.detail?.k
           || (await ensureSessionKey()).token
           || sessionStorage.getItem('__paria_k')
           || localStorage.getItem('__paria_k')
           || '';

  // 2) Publier avec ces secrets (clé 100% alignée avec #k qu’on mettra dans l’URL)
  try { await publishEncryptedSnapshot({ workId: wid, sid, k: tok }); } catch (err) { console.warn('[remote-link] publish error', err); }

  // 3) Construire l’URL viewer et copier
  const base = `${location.origin}/paria-tool/${kind}/`;
  const u = new URL(base);
  u.searchParams.set('work_id', wid);
  u.searchParams.set('sid', sid);
  if (tok) u.hash = 'k=' + tok;

  try { sessionStorage.setItem('__paria_k', tok); } catch {}
  try { sessionStorage.setItem('__paria_workId', wid); } catch {}
  try { sessionStorage.setItem('__paria_sid', sid); } catch {}

  if (action === 'open') {
    window.open(u.toString(), '_blank', 'noopener,noreferrer');
  } else {
    try { await navigator.clipboard.writeText(u.toString()); } catch {}
    console.log('[paria] lien copié:', u.toString());
  }

});

function getRemoteBase(){
  try{
    // si tu as une conf persistée, tu peux la lire ici
    const s = (window.pariaSettingsLoad && window.pariaSettingsLoad()) || {};
    if (s.remoteBase) return s.remoteBase;
  }catch{}
  // fallback: ton GitHub Pages
  return 'https://jeromejouve-lab.github.io/paria-tool';
}

window.__pariaHydrating = true;

// --- Crypto helpers (HKDF + AES-GCM) -----------------------------------------
function b64u(buf){ return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function strBytes(s){ return new TextEncoder().encode(s); }

function b64uToBytes(s){
  s = String(s||'').replace(/-/g,'+').replace(/_/g,'/');
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = atob(s + pad);
  const out = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hkdf(ikm, salt, info, len=32){
  const key = await crypto.subtle.importKey('raw', ikm, {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
  const prk = await crypto.subtle.sign('HMAC', key, salt);
  const T1 = new Uint8Array(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', prk, {name:'HMAC',hash:'SHA-256'}, false, ['sign']), new Uint8Array([...info,1])));
  return T1.slice(0,len);
}

export async function ensureSessionKey(){
  // Génère ou réutilise une session {sid, token} et dérive K_view/K_cmd
  if (window.__pariaSess && window.__pariaSess.sid && window.__pariaSess.kv) return window.__pariaSess;
  const workId = buildWorkId();
   
  // token 32o aléatoire (base64url), sid lisible
  const tokBytes = crypto.getRandomValues(new Uint8Array(32));
  const tokenB64u = b64u(tokBytes);
  const sid = `S-${new Date().toISOString().slice(0,10)}-${Math.random().toString(36).slice(2,8)}`;
  
  // HKDF (salt=workId)
  const salt = strBytes(workId);
  const kvRaw = await hkdf(tokBytes, salt, strBytes('view:'+sid), 32);
  const kcRaw = await hkdf(tokBytes, salt, strBytes('cmd:'+sid), 32);
  
  // Clé AES-GCM pour le chiffrage snapshot
  const kv = await crypto.subtle.importKey('raw', kvRaw, {name:'AES-GCM'}, false, ['encrypt']);
  window.__pariaSess = { sid, token: tokenB64u, kv, kc: kcRaw }; // kc gardée brute (HMAC à l'étape 4)
  return window.__pariaSess;
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

async function publishEncryptedSnapshot(opts = {}){
  const workId = opts.workId || buildWorkId();
  const { isRemoteViewer, readClientBlob } = await import('./domain/reducers.js');
  if (isRemoteViewer()) return;

  const blob = readClientBlob() || {};
  const on = (blob?.tabs?.seance === 'on') || (blob?.tabs?.projector === 'on');
  if (!on) return;

  // publier aussi l’état des tabs (léger)
  await stateSet(workId, { tabs: blob.tabs || {} });

  // ——— DÉRIVATION DE CLÉ ———
  // Si on nous a donné workId/sid/k → on DÉRIVE avec ça (source unique).
  // Sinon, on retombe sur la session locale existante.
  let sess = null;
  if (opts.k && opts.sid) {
    const ikm  = b64uToBytes(opts.k);
    const salt = strBytes(workId);
    const info = strBytes('view:' + opts.sid);
    const kvRaw = await hkdf(ikm, salt, info, 32);
    const kv    = await crypto.subtle.importKey('raw', kvRaw, { name:'AES-GCM' }, false, ['encrypt']);
    sess = { sid: opts.sid, token: opts.k, kv };
  } else {
    sess = await ensureSessionKey();
  }
   
  // extrait seulement ce qui doit être partagé (mini-cards, etc.)
  const view = {
    cards: (blob.cards||[]).filter(c => c.kind==='mini' && !c?.state?.deleted),
    tabs:  blob.tabs||{},
    index: blob.index||{},
    ver:   1,
    ts:    Date.now()
  };
  
  // --- Encrypt view snapshot (AES-256-GCM) ---
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(view));   // 'view' = payload clair déjà construit
  const ctBuf = await crypto.subtle.encrypt({name:'AES-GCM', iv}, sess.kv, plain);
  const encSnapshot = {
    v: 1,
    alg: 'A256GCM',
    sid: sess.sid,
    rev: view.rev || (readClientBlob()?.rev)||0,
    n: b64u(iv),
    ct: b64u(ctBuf)
  };

  await saveSnapshotToGit(workId, encSnapshot);
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

export async function boot(){
  
  // délégation de clic sur toute la page (boutons, liens, etc. portant data-tab)
  document.addEventListener('click', (ev)=>{
    const el = ev.target.closest('[data-tab]');
    if (!el) return;
    const tab = el.dataset.tab;
    if (!TABS.includes(tab)) return;
    ev.preventDefault();
    showTab(tab);
  });

  // ---- Réglages toujours accessible (local) ----
  try {
    // on ne bloque JAMAIS l’UI : on lit juste la conf locale
    const raw = localStorage.getItem('paria.settings') || '{}';
    const cfg = JSON.parse(raw);
    const needsSetup = !cfg?.endpoints?.proxy?.url; // aucune URL => config à faire
    if (needsSetup || localStorage.getItem('paria.forceSettings') === '1') {
      
      // afficher le bouton Réglages s’il était masqué par du CSS
      const tabBtn = document.querySelector('[data-tab="settings"]');
      if (tabBtn) tabBtn.style.display = '';
      
      // ouvrir l’onglet
      tabBtn?.click?.();
      
      // monter le module au besoin (défensif, non bloquant)
      try {
        const mod = await import('./ui/tabs/settings.js');
        const pane = document.getElementById('tab-settings') || document.querySelector('#tab-settings');
        if (pane && !pane.childElementCount) mod.mount(pane);
      } catch (e) { console.warn('[settings] mount fallback (non-blocking):', e); }
      localStorage.removeItem('paria.forceSettings'); // one-shot
    }
  } catch (e) {
    console.warn('[settings] force at boot error (non-blocking):', e);
  }
  
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


















































