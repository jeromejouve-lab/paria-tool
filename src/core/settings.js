// src/core/settings.js — zéro-config safe, UI-proof
const KEY_CONN  = 'paria::connections';
const KEY_PROXY = 'paria::proxy';

const DEFAULT_PROXY = { url:'', token:'' };
const DEFAULTS = {
  client:  '',
  service: '',
  endpoints: {              // top-level: STRINGS (utilisé par net.js)
    llm:    (window.PARIA_LLM_ENDPOINT || ''),
    git:    '',
    gdrive: '',
    proxy:  { ...DEFAULT_PROXY } // objet
  },
  proxy: { ...DEFAULT_PROXY },   // miroir top-level
  branding: { my_name:'', my_logo_url:'', my_address:'' },
  budgets:  { max_local_bytes: 5 * 1024 * 1024 }
};

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const asStr = (v, d='') => (typeof v === 'string' ? v : d);
const asUrl = (v, d='') => (typeof v === 'string' ? v : (isObj(v) ? asStr(v.url, d) : d));

function loadRaw(){
  try { const raw = localStorage.getItem(KEY_CONN); return raw ? JSON.parse(raw) : {}; }
  catch { return {}; }
}
function saveRaw(norm){
  localStorage.setItem(KEY_CONN, JSON.stringify(norm));
  try { localStorage.setItem(KEY_PROXY, JSON.stringify(norm.proxy || DEFAULTS.proxy)); } catch {}
}

/** Normalise TOUS les schémas possibles vers :
 *  - top-level : endpoints.{llm/git/gdrive}=string, endpoints.proxy={url,token}, proxy={url,token}
 *  - connections.* : mêmes infos MAIS llm/git/gdrive sous forme {url:"..."} (ce que l’UI lit)
 */
function normalizeAnyShape(src){
  const s = isObj(src) ? src : {};
  const bag = isObj(s.connections) ? s.connections : s;

  // strings (pour top-level)
  const llmStr    = asUrl(bag?.endpoints?.llm,    DEFAULTS.endpoints.llm);
  const gitStr    = asUrl(bag?.endpoints?.git,    DEFAULTS.endpoints.git);
  const gdriveStr = asUrl(bag?.endpoints?.gdrive, DEFAULTS.endpoints.gdrive);

  // proxy (objet)
  let proxyObj = isObj(bag?.endpoints?.proxy) ? bag.endpoints.proxy
               : isObj(bag?.proxy)            ? bag.proxy
               : null;
  if (!proxyObj) {
    try { const legacy = JSON.parse(localStorage.getItem(KEY_PROXY) || 'null'); if (isObj(legacy)) proxyObj = legacy; } catch {}
  }
  if (!isObj(proxyObj)) proxyObj = { ...DEFAULT_PROXY };
  proxyObj = { url: asStr(proxyObj.url), token: asStr(proxyObj.token) };

  // autres
  const branding = {
    my_name:     asStr(bag?.branding?.my_name),
    my_logo_url: asStr(bag?.branding?.my_logo_url),
    my_address:  asStr(bag?.branding?.my_address)
  };
  const budgets = { max_local_bytes: Number(bag?.budgets?.max_local_bytes) || DEFAULTS.budgets.max_local_bytes };
  const client  = asStr(bag?.client,  DEFAULTS.client);
  const service = asStr(bag?.service, DEFAULTS.service);

  // forme finale — TOP-LEVEL (pour net.js & reste du core)
  const top = {
    client, service,
    endpoints: { llm: llmStr, git: gitStr, gdrive: gdriveStr, proxy: { ...proxyObj } },
    proxy: { ...proxyObj },
    branding, budgets
  };

  // miroir — CONNECTIONS (pour l’UI : .endpoints.git.url etc.)
  const connections = {
    client, service,
    endpoints: {
      llm:    { url: llmStr    },
      git:    { url: gitStr    },
      gdrive: { url: gdriveStr },
      proxy:  { ...proxyObj }
    },
    proxy: { ...proxyObj },
    branding, budgets
  };

  return { ...top, connections };
}

export function getSettings(){
  // merge raw avec DEFAULTS pour éviter toute clé manquante
  const raw = loadRaw();
  const merged = {
    ...DEFAULTS,
    ...raw,
    endpoints: { ...DEFAULTS.endpoints, ...(raw?.endpoints || {}) },
    branding:  { ...DEFAULTS.branding,  ...(raw?.branding  || {}) },
    budgets:   { ...DEFAULTS.budgets,   ...(raw?.budgets   || {}) }
  };
  const norm = normalizeAnyShape(merged);
  saveRaw(norm);
  return norm;
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
  // patch.connections supporté aussi
  if (isObj(patch?.connections)) {
    const pc = patch.connections;
    if (pc.client)   merged.client   = pc.client;
    if (pc.service)  merged.service  = pc.service;
    if (pc.endpoints){
      merged.endpoints = {
        ...merged.endpoints,
        llm:    asUrl(pc.endpoints.llm,    merged.endpoints.llm),
        git:    asUrl(pc.endpoints.git,    merged.endpoints.git),
        gdrive: asUrl(pc.endpoints.gdrive, merged.endpoints.gdrive),
        proxy:  isObj(pc.endpoints.proxy) ? { url: asStr(pc.endpoints.proxy.url), token: asStr(pc.endpoints.proxy.token) } : merged.endpoints.proxy
      };
    }
    if (pc.proxy) merged.proxy = { url: asStr(pc.proxy.url, merged.proxy.url), token: asStr(pc.proxy.token, merged.proxy.token) };
    if (pc.branding) merged.branding = { ...merged.branding, ...pc.branding };
    if (pc.budgets)  merged.budgets  = { ...merged.budgets,  ...pc.budgets  };
  }
  const norm = normalizeAnyShape(merged);
  __settings_cache = norm; // maj export objet
  saveRaw(norm);
  return norm;
}

export function getWorkId(s = getSettings()){ return `${s.client}::${s.service}`; }

// Aliases UI
export const settingsLoad  = getSettings;
export const settingsSave  = saveSettings;
export const currentWorkId = getWorkId;

// Contexte client/service
export function setWorkContext({ client, service } = {}){ const cur=getSettings(); return saveSettings({ client:client??cur.client, service:service??cur.service }); }

// Proxy direct (compat)
export function getProxyConfig(){ const s=getSettings(); return s.proxy || s.endpoints?.proxy || { ...DEFAULT_PROXY }; }
export function setProxyConfig(patch){
  const cur = getProxyConfig();
  const next = { ...cur, ...(patch || {}) };
  const s = getSettings();
  const out = saveSettings({
    endpoints:  { ...s.endpoints,  proxy: next },
    proxy: next,
    connections:{ ...(s.connections||{}), endpoints:{ ...s.connections.endpoints, proxy: next }, proxy: next }
  });
  try { localStorage.setItem(KEY_PROXY, JSON.stringify(next)); } catch {}
  return out.proxy;
}

// ✅ Export objet (certaines UIs lisent directement settings.* au mount)
let __settings_cache = getSettings();
export const settings = __settings_cache;

/*
INDEX settings.js:
- getSettings/saveSettings/getWorkId (+ aliases settingsLoad/settingsSave/currentWorkId)
- setWorkContext
- getProxyConfig/setProxyConfig
- export objet `settings`
- Garantie:
  top-level:    endpoints.llm/git/gdrive = string, endpoints.proxy={url,token}, proxy={url,token}
  connections:  endpoints.llm/git/gdrive = {url:"..."}, endpoints.proxy={url,token}, proxy={url,token}
*/
