// src/ui/tabs/settings.js — mount non bloquant, tests auto si conf complète, coloration, save explicite

import { settingsLoad, settingsSave, updateLocalUsageBadge } from '../../core/settings.js';
import { diag, testGit } from '../../core/net.js';

const $ = (s, r=document) => r.querySelector(s);

// helpers robustes: on tente plusieurs ids/names possibles
function pick(root, candidates) {
  for (const sel of candidates) {
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function setError(el, on){
  if (!el) return;
  if (on) {
    el.style.outline = '2px solid #ff99aa';
    el.style.outlineOffset = '2px';
  } else {
    el.style.outline = '';
    el.style.outlineOffset = '';
  }
}

// lit le formulaire (tolérant aux IDs)
function readForm(root) {
  const client = (pick(root, ['#client','[name="client"]'])?.value || '').trim();
  const service = (pick(root, ['#service','[name="service"]'])?.value || '').trim();

  const proxyUrl = (pick(root, ['#proxy-url','#proxy','[name="proxy-url"]','[name="endpoints.proxy.url"]'])?.value || '').trim();
  const proxySecret = (pick(root, ['#proxy-secret','#proxy-token','[name="proxy-secret"]','[name="endpoints.proxy.secret"]','[name="endpoints.proxy.token"]'])?.value || '').trim();

  const gitUrl = (pick(root, ['#git-url','#github-url','[name="git-url"]','[name="endpoints.git.url"]'])?.value || '').trim();
  const gitToken = (pick(root, ['#git-token','#github-token','[name="git-token"]','[name="endpoints.git.token"]'])?.value || '').trim();

  const autoSyncEl = pick(root, ['#AUTO_SYNC','[name="AUTO_SYNC"]','[data-flag="auto-sync"]']);
  const autoSync = !!(autoSyncEl && (autoSyncEl.checked || autoSyncEl.value === 'on'));

  const out = { client, service, endpoints: { proxy:{ url: proxyUrl, secret: proxySecret }, git:{ url: gitUrl, token: gitToken } }, flags: { auto_sync: autoSync } };
  return out;
}

// remplit le formulaire depuis la conf
function fillForm(root, cfg) {
  const s = cfg || {};
  const set = (selArr, v)=>{ const el = pick(root, selArr); if (el) el.value = v ?? ''; };

  set(['#client','[name="client"]'], s.client || '');
  set(['#service','[name="service"]'], s.service || '');

  set(['#proxy-url','#proxy','[name="proxy-url"]','[name="endpoints.proxy.url"]'], s?.endpoints?.proxy?.url || s?.proxy?.url || '');
  set(['#proxy-secret','#proxy-token','[name="proxy-secret"]','[name="endpoints.proxy.secret"]','[name="endpoints.proxy.token"]'], s?.endpoints?.proxy?.secret || s?.proxy?.secret || s?.endpoints?.proxy?.token || s?.proxy?.token || '');

  set(['#git-url','#github-url','[name="git-url"]','[name="endpoints.git.url"]'], s?.endpoints?.git?.url || s?.git?.url || '');
  set(['#git-token','#github-token','[name="git-token"]','[name="endpoints.git.token"]'], s?.endpoints?.git?.token || s?.git?.token || '');

  const autoSyncEl = pick(root, ['#AUTO_SYNC','[name="AUTO_SYNC"]','[data-flag="auto-sync"]']);
  if (autoSyncEl) autoSyncEl.checked = !!(s?.flags?.auto_sync);
}

async function autoTestsAndColor(root) {
  // reset coloration
  [ ['proxy', ['#proxy-url','#proxy','[name="proxy-url"]','[name="endpoints.proxy.url"]'], ['#proxy-secret','#proxy-token','[name="proxy-secret"]','[name="endpoints.proxy.secret"]','[name="endpoints.proxy.token"]']],
    ['git',   ['#git-url','#github-url','[name="git-url"]','[name="endpoints.git.url"]'], ['#git-token','#github-token','[name="git-token"]','[name="endpoints.git.token"]']]
  ].forEach(([_, a, b])=>{
    setError(pick(root,a), false);
    setError(pick(root,b), false);
  });

  const cfg = readForm(root);

  // PROXY: test seulement si complet
  if (cfg.endpoints.proxy.url && cfg.endpoints.proxy.secret) {
    try {
      const r = await diag();
      const ok = !!r.ok;
      setError(pick(root, ['#proxy-url','#proxy','[name="proxy-url"]','[name="endpoints.proxy.url"]']), !ok);
      setError(pick(root, ['#proxy-secret','#proxy-token','[name="proxy-secret"]','[name="endpoints.proxy.secret"]','[name="endpoints.proxy.token"]']), !ok);
      const badge = $('#proxy-status', root) || document.getElementById('proxy-status');
      if (badge) { badge.textContent = ok ? 'Proxy ✅' : 'Proxy ❌'; }
    } catch {
      setError(pick(root, ['#proxy-url','#proxy','[name="proxy-url"]','[name="endpoints.proxy.url"]']), true);
      setError(pick(root, ['#proxy-secret','#proxy-token','[name="proxy-secret"]','[name="endpoints.proxy.secret"]','[name="endpoints.proxy.token"]']), true);
      const badge = $('#proxy-status', root) || document.getElementById('proxy-status');
      if (badge) { badge.textContent = 'Proxy ❌'; }
    }
  } else {
    const badge = $('#proxy-status', root) || document.getElementById('proxy-status');
    if (badge) badge.textContent = 'Proxy —'; // incomplet
  }

  // GIT: test seulement si URL présente (et token si requis)
  if (cfg.endpoints.git.url) {
    try {
      const r = await testGit();
      const ok = !!r.ok;
      setError(pick(root, ['#git-url','#github-url','[name="git-url"]','[name="endpoints.git.url"]']), !ok);
      // token: on ne colore que si 401/403
      if (!ok && (r.status === 401 || r.status === 403)) {
        setError(pick(root, ['#git-token','#github-token','[name="git-token"]','[name="endpoints.git.token"]']), true);
      }
      const badge = $('#git-status', root) || document.getElementById('git-status');
      if (badge) { badge.textContent = ok ? 'Git ✅' : 'Git ❌'; }
    } catch {
      setError(pick(root, ['#git-url','#github-url','[name="git-url"]','[name="endpoints.git.url"]']), true);
      const badge = $('#git-status', root) || document.getElementById('git-status');
      if (badge) { badge.textContent = 'Git ❌'; }
    }
  } else {
    const badge = $('#git-status', root) || document.getElementById('git-status');
    if (badge) badge.textContent = 'Git —'; // incomplet
  }

  // MAJ badge Local %
  try { updateLocalUsageBadge(); } catch {}
}

export function mountSettingsTab(host = document.getElementById('tab-settings')) {
  if (!host) return;
  const cfg = settingsLoad();
  // on ne change pas l'UI : on remplit si champs trouvés
  fillForm(host, cfg);

  // Tests auto non bloquants (seulement si conf complète)
  autoTestsAndColor(host);

  // Bouton "Diag" si présent
  const btnDiag = pick(host, ['#btn-diag','[data-action="diag"]']);
  if (btnDiag) {
    btnDiag.onclick = ()=> autoTestsAndColor(host);
  }

  // Bouton "Sauver la conf" si présent
  const btnSave = pick(host, ['#btn-save-conf','#save-settings','[data-action="save-settings"]']);
  if (btnSave) {
    btnSave.onclick = ()=>{
      const patch = readForm(host);
      settingsSave(patch);
      // relance des tests après save
      autoTestsAndColor(host);
    };
  }
}

export const mount = mountSettingsTab;
export default { mount };
