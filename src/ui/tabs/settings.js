// src/ui/tabs/settings.js — Onglet Réglages robuste (UI existante ou vide)
// - Ne plante jamais si l'état est vide
// - Si le HTML existe déjà: on ne le modifie pas (remplissage + handlers)
// - Si l'onglet est vide: on injecte un fallback minimal (mêmes IDs)

import { settingsLoad, settingsSave } from '../../core/settings.js';
import { diag } from '../../core/net.js';

// ---------- Utils DOM ----------
const $ = (sel, from = document) => from.querySelector(sel);
const allIds = [
  'settings-client','settings-service',
  'settings-llm','settings-git','settings-gdrive',
  'settings-proxy-url','settings-proxy-token',
  'settings-save','settings-diag','settings-diag-output'
];

// essaie plusieurs conteneurs probables sans casser l'UI
function getSettingsContainer() {
  return (
    $('[data-tab="settings"]') ||
    $('#tab-settings') ||
    $('#settings-tab') ||
    $('#settings') ||
    document.querySelector('[data-tab].active') ||
    document.body
  );
}

// n'injecte un fallback QUE si aucun des inputs attendus n'existe ET que le conteneur est vide
function ensureFallbackUI(container) {
  const haveAny = allIds.some(id => container.querySelector('#' + id));
  if (haveAny) return;

  const isEmpty = !container.children || container.children.length === 0 || !container.innerHTML.trim();
  if (!isEmpty) return;

  container.innerHTML = `
    <div class="settings-form" style="display:grid; gap:.75rem; max-width:720px">
      <div><label>Client<br><input id="settings-client" type="text" /></label></div>
      <div><label>Service<br><input id="settings-service" type="text" /></label></div>

      <hr>
      <div><label>LLM endpoint<br><input id="settings-llm" type="text" placeholder="https://…/llm" /></label></div>
      <div><label>Git endpoint / repo URL<br><input id="settings-git" type="text" placeholder="https://github.com/… ou https://…/git" /></label></div>
      <div><label>Google Drive endpoint<br><input id="settings-gdrive" type="text" placeholder="https://…/drive" /></label></div>

      <div style="display:grid; gap:.5rem;">
        <label>Proxy URL<br><input id="settings-proxy-url" type="text" placeholder="https://script.google.com/macros/s/…/exec" /></label>
        <label>Proxy Token<br><input id="settings-proxy-token" type="text" placeholder="token (facultatif)" /></label>
      </div>

      <div style="display:flex; gap:.5rem; align-items:center;">
        <button id="settings-save">Sauver la conf</button>
        <button id="settings-diag">Diag</button>
      </div>

      <pre id="settings-diag-output" style="white-space:pre-wrap; background:#111; color:#eee; padding:.5rem; border-radius:.5rem; min-height:2.5rem;"></pre>
    </div>
  `;
}

// ---------- Normalisation (zéro undefined) ----------
function safeSettingsShape(s = {}) {
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const asStr = (v, d='') => typeof v === 'string' ? v : d;
  const urlOf = v => (typeof v === 'string' ? v : (isObj(v) ? asStr(v.url) : ''));

  const top = {
    client: asStr(s?.client),
    service: asStr(s?.service),
    endpoints: {
      llm:    asStr(s?.endpoints?.llm),
      git:    asStr(s?.endpoints?.git),
      gdrive: asStr(s?.endpoints?.gdrive),
      proxy: {
        url:   asStr(s?.endpoints?.proxy?.url)   || asStr(s?.proxy?.url),
        token: asStr(s?.endpoints?.proxy?.token) || asStr(s?.proxy?.token)
      }
    },
    proxy: {
      url:   asStr(s?.proxy?.url)   || asStr(s?.endpoints?.proxy?.url),
      token: asStr(s?.proxy?.token) || asStr(s?.endpoints?.proxy?.token)
    },
    branding: {
      my_name:     asStr(s?.branding?.my_name),
      my_logo_url: asStr(s?.branding?.my_logo_url),
      my_address:  asStr(s?.branding?.my_address)
    },
    budgets: {
      max_local_bytes: Number(s?.budgets?.max_local_bytes) || 5 * 1024 * 1024
    }
  };

  const connections = {
    client:  asStr(s?.connections?.client)  || top.client,
    service: asStr(s?.connections?.service) || top.service,
    endpoints: {
      llm:    { url: s?.connections?.endpoints?.llm?.url    ?? urlOf(top.endpoints.llm)    },
      git:    { url: s?.connections?.endpoints?.git?.url    ?? urlOf(top.endpoints.git)    },
      gdrive: { url: s?.connections?.endpoints?.gdrive?.url ?? urlOf(top.endpoints.gdrive) },
      proxy:  {
        url:   s?.connections?.endpoints?.proxy?.url   ?? top.endpoints.proxy.url,
        token: s?.connections?.endpoints?.proxy?.token ?? top.endpoints.proxy.token
      }
    },
    proxy: {
      url:   s?.connections?.proxy?.url   ?? top.proxy.url,
      token: s?.connections?.proxy?.token ?? top.proxy.token
    },
    branding: {
      my_name:     s?.connections?.branding?.my_name     ?? top.branding.my_name,
      my_logo_url: s?.connections?.branding?.my_logo_url ?? top.branding.my_logo_url,
      my_address:  s?.connections?.branding?.my_address  ?? top.branding.my_address
    },
    budgets: {
      max_local_bytes: Number(s?.connections?.budgets?.max_local_bytes ?? top.budgets.max_local_bytes)
    }
  };

  return { ...top, connections };
}

// ---------- Mount principal ----------
export async function mountSettingsTab() {
  try {
    const root = getSettingsContainer();
    if (!root) return;

    // n'injecte le fallback que si l'onglet est vraiment vide
    ensureFallbackUI(root);

    // état
    const raw = (window.settings && (window.settings.__raw || window.settings)) || settingsLoad();
    const s = safeSettingsShape(raw);

    // éléments (depuis ton HTML ou le fallback)
    const $client     = $('#settings-client', root);
    const $service    = $('#settings-service', root);
    const $llm        = $('#settings-llm', root);
    const $git        = $('#settings-git', root);
    const $gdrive     = $('#settings-gdrive', root);
    const $proxyUrl   = $('#settings-proxy-url', root);
    const $proxyToken = $('#settings-proxy-token', root);

    const $saveBtn    = $('#settings-save', root);
    const $diagBtn    = $('#settings-diag', root);
    const $diagOut    = $('#settings-diag-output', root);

    // remplissage (aucun undefined possible)
    if ($client)     $client.value     = s.connections.client;
    if ($service)    $service.value    = s.connections.service;
    if ($llm)        $llm.value        = s.connections.endpoints.llm.url;
    if ($git)        $git.value        = s.connections.endpoints.git.url;
    if ($gdrive)     $gdrive.value     = s.connections.endpoints.gdrive.url;
    if ($proxyUrl)   $proxyUrl.value   = s.connections.endpoints.proxy.url;
    if ($proxyToken) $proxyToken.value = s.connections.endpoints.proxy.token;

    // Sauver la conf
    if ($saveBtn) {
      $saveBtn.onclick = async () => {
        const client  = ($client?.value || '').trim();
        const service = ($service?.value || '').trim();
        const llm     = ($llm?.value || '').trim();
        const git     = ($git?.value || '').trim();
        const gdrive  = ($gdrive?.value || '').trim();
        const pUrl    = ($proxyUrl?.value || '').trim();
        const pTok    = ($proxyToken?.value || '').trim();

        await settingsSave({
          client, service,
          endpoints: { llm, git, gdrive, proxy: { url: pUrl, token: pTok } },
          proxy: { url: pUrl, token: pTok },
          connections: {
            client, service,
            endpoints: {
              llm:    { url: llm },
              git:    { url: git },
              gdrive: { url: gdrive },
              proxy:  { url: pUrl, token: pTok }
            },
            proxy: { url: pUrl, token: pTok }
          }
        });

        if ($diagOut) $diagOut.textContent = '✅ Config sauvegardée.';
      };
    }

    // Diag (safe)
    if ($diagBtn) {
      $diagBtn.onclick = async () => {
        const hasAnyEndpoint =
          s.connections.endpoints.llm.url ||
          s.connections.endpoints.git.url ||
          s.connections.endpoints.gdrive.url ||
          s.connections.endpoints.proxy.url;

        if (!hasAnyEndpoint) {
          if ($diagOut) $diagOut.textContent = '— Renseigne au moins un endpoint pour tester le diag.';
          return;
        }

        try {
          const r = await diag();
          if ($diagOut) $diagOut.textContent = JSON.stringify(r, null, 2);
          else console.log('diag:', r);
        } catch (e) {
          if ($diagOut) $diagOut.textContent = `diag: ${e?.message || e}`;
          else console.warn('diag error', e);
        }
      };
    }
  } catch (e) {
    // on ne plante jamais l'onglet, on log seulement
    console.error('mountSettingsTab error:', e);
  }
}

// Compat : certaines architectures appellent "mount"
export const mount = mountSettingsTab;
export default { mount: mountSettingsTab };

/*
INDEX settings UI:
- mountSettingsTab()
- mount (alias)
- default export { mount }
*/
