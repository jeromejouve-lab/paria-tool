// src/core/settings.js — schéma unifié + miroirs pour l'UI (top-level & connections.*)
const KEY_CONN  = 'paria::connections';
const KEY_PROXY = 'paria::proxy';

const DEFAULT_PROXY = { url:'', token:'' };

const DEFAULT_CONN_SHAPE = {
  client:  'default-client',
  service: 'default-service',
  endpoints: {
    llm:    (window.PARIA_LLM_ENDPOINT || ''), // string (net.js)
    git:    '',
    gdrive: '',
    proxy:  { ...DEFAULT_PROXY }               // objet
  },
  proxy: { ...DEFAULT_PROXY },                 // miroir top-level (UI)
  branding: { my_name:'Moi', my_logo_url:'', my_address:'' },
  budgets:  { max_local_bytes: 5 * 1024 * 1024 }
};

// --- helpers ---
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Convertit {url:"..."} → "..." si besoin
function coerceEndpoint(v, fallback='') {
  if (typeof v === 'string') return v;
  if (isObj(v) && typeof v.url === 'string') return v.url;
  return fallback;
}

/**
 * Normalise n'importe quelle forme vers :
 * - top-level: client/service/endpoints/branding/budgets/proxy
 * - miroir:    connections.{ client,service,endpoints,branding,budgets,proxy }
 */
function normalizeAnyShape(src) {
  const s = isObj(src) ? src : {};

  // Certaines UIs stockent tout sous "connections"
  const conn = isObj(s.connections) ? s.connections : s;

  // endpoints (avec coercition)
  const epRaw = isObj(conn.endpoints) ? conn.endpoints : {};
  const llm    = coerceEndpoint(epRaw.llm,    DEFAULT_CONN_SHAPE.endpoints.llm);
  const git    = coerceEndpoint(epRaw.git,    DEFAULT_CONN_SHAPE.endpoints.git);
  const gdrive = coerceEndpoint(epRaw.gdrive, DEFAULT_CONN_SHAPE.endpoints.gdrive);

  // proxy: priorité endpoints.proxy, sinon top-level proxy, sinon legacy KEY_PROXY
  let proxyObj = isObj(epRaw.proxy) ? epRaw.proxy : (isObj(conn.proxy) ? conn.proxy : null);
  try {
    if (!proxyObj) {
      const legacy = JSON.parse(localStorage.getItem(KEY_PROXY) || 'null');
      if (isObj(legacy)) proxyObj = legacy;
    }
  } catch {}
  if (!isObj(proxyObj)) proxyObj = { ...DEFAULT_PROXY };
  proxyObj = { url: proxyObj.url || '', token: proxyObj.token || '' };

  // branding & budgets
  const branding = {
    my_name:     conn?.branding?.my_name     ?? DEFAULT_CONN_SHAPE.branding.my_name,
    my_logo_url: conn?.branding?.my_logo_url ?? DEFAULT_CONN_SHAPE.branding.my_logo_url,
    my_address:  conn?.branding?.my_address  ?? DEFAULT_CONN_SHAPE.branding.my_address
  };
  const budgets = {
    max_local_bytes: conn?.budgets?.max_local_bytes ?? DEFAULT_CONN_SHAPE.budgets.max_local_bytes
  };

  // client/service
  const client  = conn?.client  || DEFAULT_CONN_SHAPE.client;
  const service = conn?.service || DEFAULT_CONN_SHAPE.service;

  // forme finale
  const topLevel = {
    client, service,
    endpoints: { llm, git, gdrive, proxy: proxyObj },
    proxy: { ...proxyObj }, // miroir top-level demandé par certaines UIs
    branding, budgets
  };

  // miroir "connections" (ce que lit ton UI : settings.connections.client, etc.)
  const connections = {
    client, service,
    endpoints: { llm, git, gdrive, proxy: { ...proxyObj } },
    proxy: { ...proxyObj },
    branding, budgets
  };

  return { ...topLevel, connections };
}

// --- lecture / écriture ---
export function getSettings(){
  try {
    const raw = localStorage.getItem(KEY_CONN);
    const parsed = raw ? JSON.parse(raw) : DEFAULT_CONN_SHAPE;
    const normalized = normalizeAnyShape(parsed);

    // Si normalisé ≠ stocké, on fige le nouveau schéma (avec .connections miroir)
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
  // accepte patch sur top-level OU connections.*
  const merged = {
    ...cur,
    ...patch,
    // merge explicite endpoints si patch.endpoints existe
    endpoints: { ...cur.endpoints, ...(patch?.endpoints || {}) },
    branding:  { ...cur.branding,  ...(patch?.branding  || {}) },
    budgets:   { ...cur.budgets,   ...(patch?.budgets   || {}) }
  };

  // si patch.connections est fourni, on l’absorbe aussi
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

// --- accès direct proxy (compat UI variées) ---
export function getProxyConfig(){
  try {
    const s = getSettings();
    if (isObj(s.proxy)) return s.proxy;
    if (isObj(s.endpoints?.proxy)) return s.endpoints.proxy;
    const legacy = JSON.parse(localStorage.getItem(KEY_PROXY) || 'null');
    return isObj(legacy) ? legacy : { ...DEFAULT_PROXY };
  } catch {
    return { ...DEFAULT_PROXY };
  }
}

export function setProxyConfig(patch){
  const cur = getProxyConfig();
  const next = { ...cur, ...(patch || {}) };
  // écrire dans connections (endpoints.proxy + proxy top-level + miroir connections)
  const s = getSettings();
  const updated = saveSettings({
    endpoints: { ...s.endpoints, proxy: next },
    proxy: next,
    connections: { ...(s.connections||{}), endpoints: { ...s.connections.endpoints, proxy: next }, proxy: next }
  });
  // garder le legacy synchro
  try { localStorage.setItem(KEY_PROXY, JSON.stringify(next)); } catch {}
  return updated.proxy;
}

/*
INDEX settings.js:
- getSettings/saveSettings/getWorkId (+ alias settingsLoad/settingsSave/currentWorkId)
- setWorkContext
- getProxyConfig/setProxyConfig
- Schéma garanti:
    top-level:    { client, service, endpoints:{llm,git,gdrive,proxy{url,token}}, proxy{url,token}, branding, budgets }
    connections : { client, service, endpoints:{...}, proxy{...}, branding, budgets }
*/
