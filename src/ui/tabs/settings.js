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
      try { onRest
