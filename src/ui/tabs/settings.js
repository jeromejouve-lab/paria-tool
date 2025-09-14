// src/ui/tabs/settings.js — V2 SANS INJECTION (respecte 100% ton UI)
// — Remplit uniquement les champs existants + branche les boutons
// — Ne modifie JAMAIS le DOM ni les styles

import { settingsLoad, settingsSave } from '../../core/settings.js';
import { diag } from '../../core/net.js';

const $ = (sel, from = document) => from.querySelector(sel);

// Normalise pour éviter tout "undefined"
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

// IDs attendus dans TON HTML (pas d’injection) :
// #settings-client, #settings-service,
// #settings-llm, #settings-git, #settings-gdrive,
// #settings-proxy-url, #settings-proxy-token,
// #settings-save, #settings-diag, #settings-diag-output

export async function mountSettingsTab() {
  // 1) Lire + normaliser l’état
  const raw = (window.settings && (window.settings.__raw || window.settings)) || settingsLoad();
  const s = safeSettingsShape(raw);

  // 2) Récupérer les éléments SI ils existent (sinon on ne fait rien)
  const $client     = $('#settings-client');
  const $service    = $('#settings-service');
  const $llm        = $('#settings-llm');
  const $git        = $('#settings-git');
  const $gdrive     = $('#settings-gdrive');
  const $proxyUrl   = $('#settings-proxy-url');
  const $proxyToken = $('#settings-proxy-token');

  const $saveBtn    = $('#settings-save');
  const $diagBtn    = $('#settings-diag');
  const $diagOut    = $('#settings-diag-output');

  // 3) Remplir les champs présents (aucun undefined possible)
  if ($client)     $client.value     = s.connections.client;
  if ($service)    $service.value    = s.connections.service;
  if ($llm)        $llm.value        = s.connections.endpoints.llm.url;
  if ($git)        $git.value        = s.connections.endpoints.git.url;
  if ($gdrive)     $gdrive.value     = s.connections.endpoints.gdrive.url;
  if ($proxyUrl)   $proxyUrl.value   = s.connections.endpoints.proxy.url;
  if ($proxyToken) $proxyToken.value = s.connections.endpoints.proxy.token;

  // 4) Sauver la conf (si le bouton existe)
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

  // 5) Diag (safe)
  if ($diagBtn) {
    $diagBtn.onclick = async () => {
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
}

// Compat éventuelle
export const mount = mountSettingsTab;
export default { mount: mountSettingsTab };
