// src/core/settings.js — réglages normalisés (compat UI) : endpoints.proxy ET proxy (miroir)
const KEY_CONN  = 'paria::connections';
const KEY_PROXY = 'paria::proxy';

const DEFAULT_CONN = {
  client:  'default-client',
  service: 'default-service',
  endpoints: {
    llm:    (window.PARIA_LLM_ENDPOINT || ''), // string attendue par net.js
    git:    '',
    gdrive: '',
    proxy:  { url:'', token:'' }               // objet
  },
  // ⚠️ miroir top-level pour UI qui lit settings.proxy.url
  proxy: { url:'', token:'' },
  branding: { my_name:'Moi', my_logo_url:'', my_address:'' },
  budgets:  { max_local_bytes: 5 * 1024 * 1024 }
};
const DEFAULT_PROXY = { url:'', token:'' };

// --- helpers ---
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/**
 * Normalise la structure :
 * - endpoints.llm/git/gdrive => string (si objet {url}, on prend .url)
 * - endpoints.proxy => {url,token}
 * - proxy (top-level) => miroir de endpoints.proxy
 */
function normalizeConnections(src) {
  const s = isObj(src) ? src : {};

  const ep = isObj(s.endpoints) ? s.endpoints : {};
  const llm    = typeof ep.llm    === 'string' ? ep.llm    : (isObj(ep.llm)    ? (ep.llm.url || '')    : DEFAULT_CONN.endpoints.llm);
  const git    = typeof ep.git    === 'string' ? ep.git    : (isObj(ep.git)    ? (ep.git.url || '')    : DEFAULT_CONN.endpoints.git);
  const gdrive = typeof ep.gdrive === 'string' ? ep.gdrive : (isObj(ep.gdrive) ? (ep.gdrive.url || '') : DEFAULT_CONN.endpoints.gdrive);

  // proxy : on prend d’abord endpoints.proxy, sinon top-level proxy, sinon legacy KEY_PROXY
  let proxyObj = isObj(ep.proxy) ? ep.proxy : (isObj(s.proxy) ? s.proxy : null);
  try {
    if (!proxyObj) {
      const legacy = JSON.parse(localStorage.getItem(KEY_PROXY) || 'null');
      if (isObj(legacy)) proxyObj = legacy;
    }
  } catch {}

  if (!isObj(proxyObj)) proxyObj = { ...DEFAULT_PROXY };
  proxyObj = { url: proxyObj.url || '', token: proxyObj.token || '' };

  return {
    client:  s.client  || DEFAULT_CONN.client,
    service: s.service || DEFAULT_CONN.service,
    endpoints: { llm, git, gdrive, proxy: proxyObj },
    proxy: { ...proxyObj }, // miroir pour l’UI
    branding: {
      my_name:     s?.branding?.my_name     || DEFAULT_CONN.branding.my_name,
      my_logo_url: s?.branding?.my_logo_url || DEFAULT_CONN.branding.my_logo_url,
      my_address:  s?.branding?.my_address  || DEFAULT_CONN.branding.my_address
    },
    budgets: {
      max_local_bytes: s?.budgets?.max_local_bytes || DEFAULT_CONN.budgets.max_local_bytes
    }
  };
}

// --- lecture / écriture ---
export function getSettings(){
  try {
    const raw = localStorage.getItem(KEY_CONN);
    const parsed = raw ? JSON.parse(raw) : DEFAULT_CONN;
    const normalized = normalizeConnections(parsed);
    // si normalisé ≠ stocké, on fige la nouvelle forme (incluant proxy top-level)
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
  // on merge puis on normalise (assure les miroirs)
  const next = normalizeConnections({
    ...cur,
    ...patch,
    endpoints: { ...cur.endpoints, ...(patch?.endpoints || {}) },
    branding:  { ...cur.branding,  ...(patch?.branding  || {}) },
    budgets:   { ...cur.budgets,   ...(patch?.budgets   || {}) }
  });
  localStorage.setItem(KEY_CONN, JSON.stringify(next));
  // on maintient aussi le legacy KEY_PROXY (si l’UI l’utilise encore)
  try { localStorage.setItem(KEY_PROXY, JSON.stringify(next.proxy)); } catch {}
  return next;
}

export function getWorkId(s = getSettings()){
  return `${s.client}::${s.service}`;
}

// --- alias UI attendus ---
export const settingsLoad  = getSettings;
export const settingsSave  = saveSettings;
export const currentWorkId = getWorkId;

// --- changer client/service ---
export function setWorkContext({ client, service } = {}){
  const cur = getSettings();
  return saveSettings({
    client:  client  ?? cur.client,
    service: service ?? cur.service
  });
}

// --- accès direct proxy (compat) ---
export function getProxyConfig(){
  try {
    const s = getSettings();
    if (isObj(s.proxy)) return s.proxy;
    if (isObj(s.endpoints?.proxy)) return s.endpoints.proxy;
    const legacy = JSON.parse(localStorage.getItem(KEY_PROXY) || 'null');
    return isObj(legacy) ? legacy : DEFAULT_PROXY;
  } catch {
    return DEFAULT_PROXY;
  }
}

export function setProxyConfig(patch){
  const cur = getProxyConfig();
  const next = { ...cur, ...(patch || {}) };
  // écrire dans connections (endpoints.proxy + proxy top-level)
  const s = getSettings();
  saveSettings({ endpoints: { ...s.endpoints, proxy: next }, proxy: next });
  // garder le legacy en synchro
  try { localStorage.setItem(KEY_PROXY, JSON.stringify(next)); } catch {}
  return next;
}

/*
INDEX settings.js:
- getSettings/saveSettings/getWorkId
- settingsLoad/settingsSave/currentWorkId
- setWorkContext
- getProxyConfig/setProxyConfig
- structure normalisée: endpoints.proxy ET proxy (miroir)
*/
