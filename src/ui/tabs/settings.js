// src/ui/tabs/settings.js — SAFE MOUNT (aucun write auto, aucun DOM injecté)
// - si champs vides => affiche seulement, n'appelle rien
// - préremplissage optionnel (désactivé par défaut)
// - pas d'innerHTML, pas de clear => impossible de "virer" l'onglet

import { settingsLoad, settingsSave } from '../../core/settings.js';
import { diag } from '../../core/net.js';

const PRESEED = false; // <-- mets true si tu veux préremplir en dur une fois
const PRESEED_DEFAULTS = {
  client:  'TEST',
  service: 'RH',
  llm:     '', // ex: 'https://…/llm'
  git:     'https://github.com/jeromejouve-lab/paria-audits',
  gdrive:  '',
  proxy:   { url: 'https://script.google.com/macros/s/XXX/exec', token: 'Prox11_Secret' },
};

const $ = (sel) => document.querySelector(sel);

// IDs attendus (doivent exister dans ton index.html)
const SEL = {
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

function normalizeSettingsShape(s = {}) {
  const str = (v, d = '') => (typeof v === 'string' ? v : d);
  const url = (v, d = '') => (typeof v === 'string' ? v : (v && typeof v === 'object' ? str(v.url, d) : d));

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

function allInputsExist() {
  return Object.values(SEL).every(sel => !!$(sel) || sel === SEL.diagOut);
}

export function mountSettingsTab() {
  // 0) On ne modifie JAMAIS le DOM ; si les champs n'existent pas, on sort proprement.
  if (!allInputsExist()) {
    console.warn('[settings] Inputs manquants dans le HTML — aucun binding appliqué.');
    return;
  }

  // 1) Charger l'état actuel et normaliser (jamais d'undefined)
  const s = normalizeSettingsShape(settingsLoad());

  // 2) Préremplissage *optionnel* (désactivé par défaut)
  if (PRESEED && !localStorage.getItem('paria::connections')) {
    const p = PRESEED_DEFAULTS;
    try {
      settingsSave({
        client: p.client, service: p.service,
        endpoints: { llm: p.llm, git: p.git, gdrive: p.gdrive, proxy: { url: p.proxy.url, token: p.proxy.token } },
        proxy: { url: p.proxy.url, token: p.proxy.token },
        connections: {
          client: p.client, service: p.service,
          endpoints: {
            llm: { url: p.llm }, git: { url: p.git }, gdrive: { url: p.gdrive },
            proxy: { url: p.proxy.url, token: p.proxy.token }
          },
          proxy: { url: p.proxy.url, token: p.proxy.token }
        }
      });
    } catch (_) {/* i*_
