// src/ui/settings.js — onglet Réglages (robuste "page vide")
// ⚠️ Ne modifie pas l'UI : lit seulement des #ids existants.
// IDs attendus côté HTML :
//   #settings-client, #settings-service,
//   #settings-llm, #settings-git, #settings-gdrive,
//   #settings-proxy-url, #settings-proxy-token,
//   #settings-save, #settings-diag, #settings-diag-output

import { settingsLoad, settingsSave } from '../../core/settings.js';
import { diag } from '../../core/net.js';

// ---------- Helpers ----------
const $ = (sel) => document.querySelector(sel);

// Normalise l’objet settings pour garantir que chaque lecture a une valeur.
function safeSettingsShape(s = {}) {
  const asStr = (v, d = '') => (typeof v === 'string' ? v : d);
  const urlOf = (v) => (typeof v === 'string' ? v : (v && typeof v === 'object' ? asStr(v.url) : ''));

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

  // Miroir connections (ce que l’UI peut lire ailleurs)
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

function setText(el, text) { if (el) el.textContent = text; }
function setVal(el, val)   { if (el) el.value = val ?? ''; }

// ---------- Mount (appelé par l’onglet) ----------
export async function mountSettingsTab() {
  // 1) Lire settings (via core) et le normaliser pour éviter tout undefined
  const raw = (window.settings && (window.settings.__raw || window.settings)) || settingsLoad();
  const s = safeSettingsShape(raw);

  // 2) Récupérer les éléments UI (ne change pas l’HTML)
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

  // 3) Remplir les champs (si l’input n’existe pas, on ignore)
  setVal($client,     s.connections.client);
  setVal($service,    s.connections.service);
  setVal($llm,        s.connections.endpoints.llm.url);
  setVal($git,        s.connections.endpoints.git.url);
  setVal($gdrive,     s.connections.endpoints.gdrive.url);
  setVal($proxyUrl,   s.connections.endpoints.proxy.url);
  setVal($proxyToken, s.connections.endpoints.proxy.token);

  // 4) Binder Sauver la conf (écrit top-level + connections.*)
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
        endpoints: { llm, git, gdrive, proxy:{ url:pUrl, token:pTok } },
        proxy: { url:pUrl, token:pTok },
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

      setText($diagOut, '✅ Config sauvegardée.');
    };
  }

  // 5) Binder Diag (sans planter si vide)
  if ($diagBtn) {
    $diagBtn.onclick = async () => {
      try {
        const r = await diag();
        setText($diagOut, JSON.stringify(r, null, 2));
      } catch (e) {
        setText($diagOut, `diag: ${e?.message || e}`);
      }
    };
  }
}

// Pour compat éventuelle (si l'app attend settings.mount)
export const mount = mountSettingsTab;

/*
INDEX settings UI:
- safeSettingsShape(s)
- mountSettingsTab()
- mount (alias)
*/

