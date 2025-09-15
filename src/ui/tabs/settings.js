// src/ui/tabs/settings.js — bind-only + anti-effacement pour #tab-settings
// - Ne modifie pas l'UI (aucune injection / aucun innerHTML côté script)
// - N'appelle pas de save/diag si les champs sont vides
// - Prend un snapshot du contenu HTML initial de #tab-settings et le restaure si quelqu'un l'efface

import { settingsLoad, settingsSave } from '../../core/settings.js';
import { diag } from '../../core/net.js';

// --- Préremplissage optionnel (désactivé par défaut)
const PRESEED = false;
const PRESEED_DEFAULTS = {
  client:  'TEST',
  service: 'RH',
  llm:     '',
  git:     'https://github.com/jeromejouve-lab/paria-audits',
  gdrive:  '',
  proxy:   { url: 'https://script.google.com/macros/s/XXX/exec', token: 'Prox11_Secret' },
};

// --- Sélecteurs attendus dans TON index.html (on ne crée rien)
const SEL = {
  root:      '#tab-settings, [data-tab="settings"]',
  client:     '#settings-client',
  service:    '#settings-service',
  llm:        '#settings-llm',
  git:        '#settings-git',
  gdrive:     '#settings-gdrive',
  proxyUrl:   '#settings-proxy-url',
  proxyToken: '#settings-proxy-token',
  save:       '#settings-save',
  diag:       '#settings-diag',
  diagOut:    '#settings-diag-output',
};

const $ = (sel, from=document) => from.querySelector(sel);

// --- Normalisation (zéro undefined)
function normalize(s = {}) {
  const str = (v,d='') => typeof v === 'string' ? v : d;
  const url = (v,d='') => (typeof v === 'string' ? v : (v && typeof v === 'object' ? str(v.url,d) : d));
  const top = {
    client:  str(s.client),
    service: str(s.service),
    endpoints: {
      llm:    str(s?.endpoints?.llm),
      git:    str(s?.endpoints?.git),
      gdrive: str(s?.endpoints?.gdrive),
      proxy: { url: str(s?.endpoints?.proxy?.url) || str(s?.proxy?.url),
               token: str(s?.endpoints?.proxy?.token) || str(s?.proxy?.token) }
    },
    proxy: { url: str(s?.proxy?.url) || str(s?.endpoints?.proxy?.url),
             token: str(s?.proxy?.token) || str(s?.endpoints?.proxy?.token) }
  };
  const connections = {
    client:  str(s?.connections?.client)  || top.client,
    service: str(s?.connections?.service) || top.service,
    endpoints: {
      llm:    { url: url(s?.connections?.endpoints?.llm,    top.endpoints.llm)    },
      git:    { url: url(s?.connections?.endpoints?.git,    top.endpoints.git)    },
      gdrive: { url: url(s?.connections?.endpoints?.gdrive, top.endpoints.gdrive) },
      proxy:  { url: top.proxy.url, token: top.proxy.token }
    },
    proxy: { url: top.proxy.url, token: top.proxy.token }
  };
  return { ...top, connections };
}

function hasAnyEndpoint(s) {
  const e = s?.connections?.endpoints;
  return !!(e?.llm?.url || e?.git?.url || e?.gdrive?.url || e?.proxy?.url);
}

function allInputsExist(root) {
  const req = [SEL.client, SEL.service, SEL.llm, SEL.git, SEL.gdrive, SEL.proxyUrl, SEL.proxyToken, SEL.save, SEL.diag];
  return req.every(sel => $(sel, root));
}

// --- Anti-effacement : si un script vide #tab-settings, on restaure le HTML initial
function protectContainer(root, onRestored) {
  if (!root) return () => {};
  const snapshot = root.innerHTML; // on garde LE HTML D’ORIGINE
  let restoring = false;
  const obs = new MutationObserver(() => {
    if (restoring) return;
    // si le conteneur est vidé, on restaure le HTML d’origine
    if (!root.innerHTML || !root.innerHTML.trim()) {
      restoring = true;
      root.innerHTML = snapshot;
      restoring = false;
      try { onRestored && onRestored(); } catch {}
    }
  });
  obs.observe(root, { childList: true, subtree: false });
  return () => obs.disconnect();
}

// --- Mount principal (aucune écriture automatique)
export function mountSettingsTab() {
  const root = $(SEL.root) || document.getElementById('tab-settings') || document.querySelector('[data-tab="settings"]');
  if (!root) return;

  // Protéger l’onglet contre tout clear externe
  const unprotect = protectContainer(root, () => {
    // si on a dû restaurer, on re-binde les handlers
    bind(root);
  });

  // Si les inputs n’existent pas dans le HTML, on ne fait rien (pas d’injection)
  if (!allInputsExist(root)) {
    // on laisse l’onglet tel quel, visible, sans planter
    return;
  }

  // Préremplissage optionnel (une seule fois si localStorage vide)
  if (PRESEED && !localStorage.getItem('paria::connections')) {
    const p = PRESEED_DEFAULTS;
    try {
      settingsSave({
        client: p.client, service: p.service,
        endpoints: { llm: p.llm, git: p.git, gdrive: p.gdrive, proxy: { url: p.proxy.url, token: p.proxy.token } },
        proxy: { url: p.proxy.url, token: p.proxy.token },
        connections: {
          client: p.client, service: p.service,
          endpoints: { llm:{url:p.llm}, git:{url:p.git}, gdrive:{url:p.gdrive}, proxy:{ url:p.proxy.url, token:p.proxy.token } },
          proxy: { url:p.proxy.url, token:p.proxy.token }
        }
      });
    } catch {}
  }

  // Bind & remplissage
  bind(root);

  // Si tu démontes l’onglet, pense à appeler unprotect() depuis ton routeur (facultatif)
  // return unprotect;
}

// --- Binding des champs et handlers (lecture seule tant que tu ne cliques pas)
function bind(root) {
  const s = normalize(settingsLoad());

  const $client     = $(SEL.client, root);
  const $service    = $(SEL.service, root);
  const $llm        = $(SEL.llm, root);
  const $git        = $(SEL.git, root);
  const $gdrive     = $(SEL.gdrive, root);
  const $proxyUrl   = $(SEL.proxyUrl, root);
  const $proxyToken = $(SEL.proxyToken, root);
  const $saveBtn    = $(SEL.save, root);
  const $diagBtn    = $(SEL.diag, root);
  const $diagOut    = $(SEL.diagOut, root);

  // Remplissage passif (aucune écriture système)
  if ($client)     $client.value     = s.connections.client || '';
  if ($service)    $service.value    = s.connections.service || '';
  if ($llm)        $llm.value        = s.connections.endpoints.llm.url || '';
  if ($git)        $git.value        = s.connections.endpoints.git.url || '';
  if ($gdrive)     $gdrive.value     = s.connections.endpoints.gdrive.url || '';
  if ($proxyUrl)   $proxyUrl.value   = s.connections.endpoints.proxy.url || '';
  if ($proxyToken) $proxyToken.value = s.connections.endpoints.proxy.token || '';

  // Sauver (sur clic uniquement)
  if ($saveBtn) {
    $saveBtn.onclick = async () => {
      const client  = ($client?.value || '').trim();
      const service = ($service?.value || '').trim();
      const llm     = ($llm?.value || '').trim();
      const git     = ($git?.value || '').trim();
      const gdrive  = ($gdrive?.value || '').trim();
      const pUrl    = ($proxyUrl?.value || '').trim();
      const pTok    = ($proxyToken?.value || '').trim();

      try {
        await settingsSave({
          client, service,
          endpoints: { llm, git, gdrive, proxy: { url: pUrl, token: pTok } },
          proxy: { url: pUrl, token: pTok },
          connections: {
            client, service,
            endpoints: { llm:{url:llm}, git:{url:git}, gdrive:{url:gdrive}, proxy:{ url:pUrl, token:pTok } },
            proxy: { url:pUrl, token:pTok }
          }
        });
        if ($diagOut) $diagOut.textContent = '✅ Config sauvegardée.';
      } catch (e) {
        if ($diagOut) $diagOut.textContent = `❌ Save: ${e?.message || e}`;
      }
    };
  }

  // Diag (ne lance rien si aucun endpoint saisi)
  if ($diagBtn) {
    $diagBtn.onclick = async () => {
      const cur = normalize(settingsLoad());
      if (!hasAnyEndpoint(cur)) {
        if ($diagOut) $diagOut.textContent = '— Renseigne au moins un endpoint (LLM / Git / Drive / Proxy) avant Diag.';
        return;
      }
      try {
        const r = await diag();
        if ($diagOut) $diagOut.textContent = JSON.stringify(r, null, 2);
      } catch (e) {
        if ($diagOut) $diagOut.textContent = `❌ Diag: ${e?.message || e}`;
      }
    };
  }
}

export const mount = mountSettingsTab;
export default { mount: mountSettingsTab };
