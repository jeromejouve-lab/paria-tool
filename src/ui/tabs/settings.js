// src/ui/tabs/settings.js — NO INJECTION, NO CLEAR: bind-only
import { settingsLoad, settingsSave } from '../../core/settings.js';
import { diag } from '../../core/net.js';

const $ = (sel) => document.querySelector(sel);

// Normalise pour éviter tout undefined en lecture
function safe(s = {}) {
  const str = (v, d='') => typeof v === 'string' ? v : d;
  const url = (v, d='') => (typeof v==='string' ? v : (v && typeof v==='object' ? str(v.url, d) : d));
  const top = {
    client: str(s.client), service: str(s.service),
    endpoints: {
      llm: str(s?.endpoints?.llm),
      git: str(s?.endpoints?.git),
      gdrive: str(s?.endpoints?.gdrive),
      proxy: { url: str(s?.endpoints?.proxy?.url) || str(s?.proxy?.url), token: str(s?.endpoints?.proxy?.token) || str(s?.proxy?.token) }
    },
    proxy: { url: str(s?.proxy?.url) || str(s?.endpoints?.proxy?.url), token: str(s?.proxy?.token) || str(s?.endpoints?.proxy?.token) }
  };
  const connections = {
    client:  str(s?.connections?.client)  || top.client,
    service: str(s?.connections?.service) || top.service,
    endpoints: {
      llm:    { url: url(s?.connections?.endpoints?.llm, top.endpoints.llm) },
      git:    { url: url(s?.connections?.endpoints?.git, top.endpoints.git) },
      gdrive: { url: url(s?.connections?.endpoints?.gdrive, top.endpoints.gdrive) },
      proxy:  { url: top.proxy.url, token: top.proxy.token }
    },
    proxy: { url: top.proxy.url, token: top.proxy.token }
  };
  return { ...top, connections };
}

export function mountSettingsTab(){
  // ⚠️ Ne JAMAIS toucher au DOM structurel ni vider la section
  const s = safe(settingsLoad());

  // Bind sur tes champs **s'ils existent déjà** dans l'HTML
  const $client     = $('#settings-client');
  const $service    = $('#settings-service');
  const $llm        = $('#settings-llm');
  const $git        = $('#settings-git');
  const $gdrive     = $('#settings-gdrive');
  const $proxyUrl   = $('#settings-proxy-url');
  const $proxyToken = $('#settings-proxy-token');

  if ($client)     $client.value     = s.connections.client;
  if ($service)    $service.value    = s.connections.service;
  if ($llm)        $llm.value        = s.connections.endpoints.llm.url;
  if ($git)        $git.value        = s.connections.endpoints.git.url;
  if ($gdrive)     $gdrive.value     = s.connections.endpoints.gdrive.url;
  if ($proxyUrl)   $proxyUrl.value   = s.connections.endpoints.proxy.url;
  if ($proxyToken) $proxyToken.value = s.connections.endpoints.proxy.token;

  const $saveBtn = $('#settings-save');
  const $diagBtn = $('#settings-diag');
  const $diagOut = $('#settings-diag-output');

  if ($saveBtn) $saveBtn.onclick = async () => {
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
        endpoints: { llm:{url:llm}, git:{url:git}, gdrive:{url:gdrive}, proxy:{ url:pUrl, token:pTok } },
        proxy: { url:pUrl, token:pTok }
      }
    });

    if ($diagOut) $diagOut.textContent = '✅ Config sauvegardée.';
  };

  if ($diagBtn) $diagBtn.onclick = async () => {
    try {
      const r = await diag();
      if ($diagOut) $diagOut.textContent = JSON.stringify(r, null, 2);
    } catch (e) {
      if ($diagOut) $diagOut.textContent = `diag: ${e?.message || e}`;
    }
  };
}

export const mount = mountSettingsTab;
export default { mount: mountSettingsTab };
