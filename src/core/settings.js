// src/core/settings.js — schéma unifié + "zero-config safe" (UI inchangée)
const KEY_CONN  = 'paria::connections';
const KEY_PROXY = 'paria::proxy';

const DEFAULT_PROXY = { url:'', token:'' };

const DEFAULT_CONN_SHAPE = {
  client:  'default-client',
  service: 'default-service',
  endpoints: {
    llm:    (window.PARIA_LLM_ENDPOINT || ''), // strings attendues par net.js
    git:    '',
    gdrive: '',
    proxy:  { ...DEFAULT_PROXY }               // objet
  },
  proxy: { ...DEFAULT_PROXY },                 // miroir top-level (quelques UIs lisent ici)
  branding: { my_name:'', my_logo_url:'', my_address:'' },
  budgets:  { max_local_bytes: 5 * 1024 * 1024 }
};

// helpers
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const asStr = (v, def='') => (typeof v === 'string' ? v : def);
const coerceEndpoint = (v, def='') => (typeof v === 'string' ? v : (isObj(v) ? asStr(v.url, def) : def));

function normalizeAnyShape(src){
  const s   = isObj(src) ? src : {};
  const bag = isObj(s.connections) ? s.connections : s;

  const epRaw  = isObj(bag.endpoints) ? bag.endpoints : {};
  const llm    = coerceEndpoint(epRaw.llm,    DEFAULT_CONN_SHAPE.endpoints.llm);
  const git    = coerceEndpoint(epRaw.git,    DEFAULT_CONN_SHAPE.endpoints.git);
  const gdrive = coerceEndpoint(epRaw.gdrive, DEFAULT_CONN_SHAPE.endpoints.gdrive);

  // proxy: endpoints.proxy > top-level proxy > legacy
  let proxyObj = isObj(epRaw.proxy) ? epRaw.proxy : (isObj(bag.proxy) ? bag.proxy : null);
  try {
    if (!proxyObj) {
      const legacy = JSON.parse(localStorage.getItem(KEY_PROXY) || 'null');
      if (isObj(legacy)) proxyObj = legacy;
    }
  } catch {}
  if (!isObj(proxyObj)) proxyObj = { ...DEFAULT_PROXY };
  proxyObj = { url: asStr(proxyObj.url), token: asStr(proxyObj.token) };

  const branding = {
    my_name:     asStr(bag?.branding?.my_name),
    my_logo_url: asStr(bag?.branding?.my_logo_url),
    my_address:  asStr(bag?.branding?.my_address)
  };
  const budgets = { max_local_bytes: Number(bag?.budgets?.max_local_bytes) || DEFAULT_CONN_SHAPE.budgets.max_local_bytes };

  const client  = asStr(bag?.client,  DEFAULT_CONN_SHAPE.client);
  const service = asStr(bag?.service, DEFAULT_CONN_SHAPE.service);

  const topLevel = { client, service, endpoints:{ llm, git, gdrive, proxy: proxyObj }, proxy:{...proxyObj}, branding, budgets };
  const connections = { client, service, endpoints:{ llm, git, gdrive, proxy:{...proxyObj} }, proxy:{...proxyObj}, branding, budgets };

  return { ...topLevel, connections };
}

// lecture / écriture
export function getSettings(){
  try {
    const raw = localStorage.getItem(KEY_CONN);
    const parsed = raw ? JSON.parse(raw) : DEFAULT_CONN_SHAPE;
    const normalized = normalizeAnyShape(parsed);
    // fige le schéma unifié pour les prochains boots
    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
      localStorage.setItem(KEY_CONN, JSON.stringify(normalized));
      try { localStorage.setItem(KEY_PROXY, JSON.stringify(normalized.proxy)); } catch {}
    }
    return normalized;
  } catch {
    const def = normalizeAnyShape(DEFAULT_CONN_SHAPE);
    localStorage.setItem(KEY_CONN, JSON.stringify(def));
    try { localStorage.setItem(KEY_PROXY, JSON.stringify(def.proxy)); } catch {}
    return def;
  }
}

export function saveSettings(patch){
  const cur = getSettings();
  const merged = {
    ...cur,
    ...patch,
    endpoints: { ...cur.endpoints, ...(patch?.endpoints || {}) },
    branding:  { ...cur.branding,  ...(patch?.branding  || {}) },
    budgets:   { ...cur.budgets,   ...(patch?.budgets   || {}) }
  };
  if (isObj(patch?.connections)) {
    const pc = patch.connections;
    if (pc.client)  merged.client  = pc.client;
    if (pc.service) merged.service = pc.service;
    if (pc.endpoints) merged.endpoints = { ...merged.endpoints, ...pc.endpoints };
    if (pc.branding)  merged.branding  = { ...merged.branding,  ...pc.branding  };
    if (pc.budgets)   merged.budgets   = { ...merged.budgets,   ...pc.budgets   };
    if (pc.proxy)     merged.proxy     = { ...(merged.proxy||{}), ...pc.proxy };
  }
  const normalized = normalizeAnyShape(merged);
  localStorage.setItem(KEY_CONN, JSON.stringify(normalized));
  try { localStorage.setItem(KEY_PROXY, JSON.stringify(normalized.proxy)); } catch {}
  return normalized;
}

export function getWorkId(s = getSettings()){ return `${s.client}::${s.service}`; }

// alias attendus par l’UI
export const settingsLoad  = getSettings;
export const settingsSave  = saveSettings;
export const currentWorkId = getWorkId;

// changer client/service
export function setWorkContext({ client, service } = {}){
  const cur = getSettings();
  return saveSettings({ client: client ?? cur.client, service: service ?? cur.service });
}

// proxy direct (compat)
export function getProxyConfig(){
  try {
    const s = getSettings();
    if (isObj(s.proxy)) return s.proxy;
    if (isObj(s.endpoints?.proxy)) return s.endpoints.proxy;
    const legacy = JSON.parse(localStorage.getItem(KEY_PROXY) || 'null');
    return isObj(legacy) ? legacy : { ...DEFAULT_PROXY };
  } catch { return { ...DEFAULT_PROXY }; }
}
export function setProxyConfig(patch){
  const cur = getProxyConfig();
  const next = { ...cur, ...(patch || {}) };
  const s = getSettings();
  const updated = saveSettings({
    endpoints: { ...s.endpoints, proxy: next },
    proxy: next,
    connections: { ...(s.connections||{}), endpoints: { ...s.connections.endpoints, proxy: next }, proxy: next }
  });
  try { localStorage.setItem(KEY_PROXY, JSON.stringify(next)); } catch {}
  return updated.proxy;
}

/*
INDEX settings.js:
- getSettings/saveSettings/getWorkId (+ alias settingsLoad/settingsSave/currentWorkId)
- setWorkContext
- getProxyConfig/setProxyConfig
- Schéma garanti au boot, même "tout vide":
  top-level    : { client, service, endpoints:{llm,git,gdrive,proxy{url,token}}, proxy{url,token}, branding, budgets }
  connections  : { client, service, endpoints:{...}, proxy{...}, branding, budgets }
*/
