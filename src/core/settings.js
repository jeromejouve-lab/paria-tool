// src/core/settings.js — réglages + alias compat UI (AUCUNE modif d’UI)
const KEY_CONN  = 'paria::connections';
const KEY_PROXY = 'paria::proxy';

const DEFAULT_CONN = {
  client:'default-client', service:'default-service',
  endpoints:{ llm:(window.PARIA_LLM_ENDPOINT||''), git:'', gdrive:'' },
  branding:{ my_name:'Moi', my_logo_url:'', my_address:'' },
  budgets:{ max_local_bytes: 5*1024*1024 }
};
const DEFAULT_PROXY = { url:'', token:'' };

// Connexions
export function getSettings(){ try{ return JSON.parse(localStorage.getItem(KEY_CONN))||DEFAULT_CONN; }catch{ return DEFAULT_CONN; } }
export function saveSettings(patch){
  const cur=getSettings();
  const next={ ...cur, ...patch,
    endpoints:{...cur.endpoints,...(patch?.endpoints||{})},
    branding:{...cur.branding,...(patch?.branding||{})},
    budgets:{...cur.budgets,...(patch?.budgets||{})}
  };
  localStorage.setItem(KEY_CONN, JSON.stringify(next));
  return next;
}
export function getWorkId(s=getSettings()){ return `${s.client}::${s.service}`; }

// Alias UI
export const settingsLoad  = getSettings;
export const settingsSave  = saveSettings;
export const currentWorkId = getWorkId;

// Option : changer client/service (utilisé par l’UI)
export function setWorkContext({client,service}={}){
  const cur=getSettings();
  return saveSettings({ client:client??cur.client, service:service??cur.service });
}

// Proxy (GAS/Git/Drive)
export function getProxyConfig(){ try{ return JSON.parse(localStorage.getItem(KEY_PROXY))||DEFAULT_PROXY; }catch{ return DEFAULT_PROXY; } }
export function setProxyConfig(patch){ const cur=getProxyConfig(); const next={...cur,...patch}; localStorage.setItem(KEY_PROXY, JSON.stringify(next)); return next; }

/*
INDEX settings.js:
- getSettings/saveSettings/getWorkId
- settingsLoad/settingsSave/currentWorkId
- setWorkContext
- getProxyConfig/setProxyConfig
*/
