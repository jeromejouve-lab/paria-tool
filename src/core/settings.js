// src/core/settings.js — réglages + normalisation proxy (UI intacte)
const KEY_CONN  = 'paria::connections';
const KEY_PROXY = 'paria::proxy';

const DEFAULT_CONN = {
  client:  'default-client',
  service: 'default-service',
  endpoints: {
    llm:    (window.PARIA_LLM_ENDPOINT || ''),
    git:    '',
    gdrive: '',
    proxy:  { url:'', token:'' }   // <-- important
  },
  branding: { my_name:'Moi', my_logo_url:'', my_address:'' },
  budgets:  { max_local_bytes: 5 * 1024 * 1024 }
};
const DEFAULT_PROXY = { url:'', token:'' };

// --- Normalisation robuste (backfill pour anciens états) ---
function normalizeConnections(s) {
  const src = s && typeof s === 'object' ? s : {};
  const ep  = src.endpoints && typeof src.endpoints === 'object' ? src.endpoints : {};
  const proxy = (ep.proxy && typeof ep.proxy === 'object') ? ep.proxy : { ...DEFAULT_PROXY };

  return {
    client:  src.client  ?? DEFAULT_CONN.client,
    service: src.service ?? DEFAULT_CONN.service,
    endpoints: {
      llm:    typeof ep.llm    === 'string' ? ep.llm    : DEFAULT_CONN.endpoints.llm,
      git:    typeof ep.git    === 'string' ? ep.git    : DEFAULT_CONN.endpoints.git,
      gdrive: typeof ep.gdrive === 'string' ? ep.gdrive : DEFAULT_CONN.endpoints.gdrive,
      proxy:  { url: proxy.url ?? '', token: proxy.token ?? '' }
    },
    branding: {
      my_name:     src?.branding?.my_name     ?? DEFAULT_CONN.branding.my_name,
      my_logo_url: src?.branding?.my_logo_url ?? DEFAULT_CONN.branding.my_logo_url,
      my_address:  src?.branding?.my_address  ?? DEFAULT_CONN.branding.my_address
    },
    budgets: {
      max_local_bytes: src?.budgets?.max_local_bytes ?? DEFAULT_CONN.budgets.max_local_bytes
    }
  };
}

// --- Accès / Sauvegarde ---
export function getSettings(){
  try {
    const raw = localStorage.getItem(KEY_CONN);
    const parsed = raw ? JSON.parse(raw) : DEFAULT_CONN;
    const normalized = normalizeConnections(parsed);
    // si normalisé ≠ stocké, on réécrit pour figer proxy
    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
      localStorage.setItem(KEY_CONN, JSON.stringify(normalized));
    }
    return normalized;
  } catch {
    localStorage.setItem(KEY_CONN, JSON.stringify(DEFAULT_CONN));
    return DEFAULT_CONN;
  }
}

export function saveSettings(patch){
  const cur = getSettings();
  const next = normalizeConnections({
    ...cur,
    ...patch,
    endpoints: { ...cur.endpoints, ...(patch?.endpoints||{}) },
    branding:  { ...cur.branding,  ...(patch?.branding||{}) },
    budgets:   { ...cur.budgets,   ...(patch?.budgets||{}) }
  });
  localStorage.setItem(KEY_CONN, JSON.stringify(next));
  return next;
}

export function getWorkId(s = getSettings()){
  return `${s.client}::${s.service}`;
}

// --- Alias UI attendus ---
export const settingsLoad  = getSettings;
export const settingsSave  = saveSettings;
export const currentWorkId = getWorkId;

// --- Contexte client/service ---
export function setWorkContext({ client, service } = {}){
  const cur = getSettings();
  return saveSettings({
    client:  client  ?? cur.client,
    service: service ?? cur.service
  });
}

// --- Proxy (si l’UI utilise l’ancien stockage séparé aussi) ---
export function getProxyConfig(){
  try {
    // priorité à la valeur dans connections.endpoints.proxy
    const s = getSettings();
    if (s?.endpoints?.proxy) return s.endpoints.proxy;

    // fallback ancien stockage
    const legacy = JSON.parse(localStorage.getItem(KEY_PROXY) || 'null');
    return legacy || DEFAULT_PROXY;
  } catch {
    return DEFAULT_PROXY;
  }
}

export function setProxyConfig(patch){
  const cur = getProxyConfig();
  const next = { ...cur, ...(patch||{}) };

  // on écrit dans la structure principale (connections)
  const s = getSettings();
  saveSettings({ endpoints: { ...s.endpoints, proxy: next } });

  // et on maintient l’ancien emplacement si l’UI le consulte encore
  try { localStorage.setItem(KEY_PROXY, JSON.stringify(next)); } catch {}

  return next;
}

/*
INDEX settings.js:
- getSettings/saveSettings/getWorkId
- settingsLoad/settingsSave/currentWorkId
- setWorkContext
- getProxyConfig/setProxyConfig  // endpoints.proxy + compat legacy
*/
