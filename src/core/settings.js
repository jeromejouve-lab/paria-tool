// src/core/settings.js — zéro-config safe + export objet `settings` (compat UI)
const KEY_CONN  = 'paria::connections';
const KEY_PROXY = 'paria::proxy';

const DEFAULT_PROXY = { url:'', token:'' };
const DEFAULT_CONN_SHAPE = {
  client:  'default-client',
  service: 'default-service',
  endpoints: { llm:(window.PARIA_LLM_ENDPOINT||''), git:'', gdrive:'', proxy:{...DEFAULT_PROXY} },
  proxy: { ...DEFAULT_PROXY }, // miroir top-level
  branding: { my_name:'', my_logo_url:'', my_address:'' },
  budgets:  { max_local_bytes: 5 * 1024 * 1024 }
};

const isObj = v => v && typeof v==='object' && !Array.isArray(v);
const asStr = (v,def='') => typeof v==='string'?v:def;
const coerceEndpoint = (v,def='') => typeof v==='string' ? v : (isObj(v)?asStr(v.url,def):def);

function normalizeAnyShape(src){
  const s   = isObj(src)?src:{};
  const bag = isObj(s.connections)?s.connections:s;

  const epRaw  = isObj(bag.endpoints)?bag.endpoints:{};
  const llm    = coerceEndpoint(epRaw.llm,    DEFAULT_CONN_SHAPE.endpoints.llm);
  const git    = coerceEndpoint(epRaw.git,    DEFAULT_CONN_SHAPE.endpoints.git);
  const gdrive = coerceEndpoint(epRaw.gdrive, DEFAULT_CONN_SHAPE.endpoints.gdrive);

  let proxyObj = isObj(epRaw.proxy)?epRaw.proxy:(isObj(bag.proxy)?bag.proxy:null);
  try{ if(!proxyObj){ const legacy=JSON.parse(localStorage.getItem(KEY_PROXY)||'null'); if(isObj(legacy)) proxyObj=legacy; } }catch{}
  if(!isObj(proxyObj)) proxyObj={...DEFAULT_PROXY};
  proxyObj={ url:asStr(proxyObj.url), token:asStr(proxyObj.token) };

  const branding={ my_name:asStr(bag?.branding?.my_name), my_logo_url:asStr(bag?.branding?.my_logo_url), my_address:asStr(bag?.branding?.my_address) };
  const budgets={ max_local_bytes:Number(bag?.budgets?.max_local_bytes)||DEFAULT_CONN_SHAPE.budgets.max_local_bytes };

  const client  = asStr(bag?.client,  DEFAULT_CONN_SHAPE.client);
  const service = asStr(bag?.service, DEFAULT_CONN_SHAPE.service);

  const topLevel = { client, service, endpoints:{llm,git,gdrive,proxy:proxyObj}, proxy:{...proxyObj}, branding, budgets };
  const connections = { client, service, endpoints:{llm,git,gdrive,proxy:{...proxyObj}}, proxy:{...proxyObj}, branding, budgets };
  return { ...topLevel, connections };
}

function readRaw(){ try{ const raw=localStorage.getItem(KEY_CONN); return raw?JSON.parse(raw):DEFAULT_CONN_SHAPE; }catch{ return DEFAULT_CONN_SHAPE; } }
function writeNorm(norm){
  localStorage.setItem(KEY_CONN, JSON.stringify(norm));
  try{ localStorage.setItem(KEY_PROXY, JSON.stringify(norm.proxy)); }catch{}
}

export function getSettings(){
  const parsed = readRaw();
  const norm   = normalizeAnyShape(parsed);
  if (JSON.stringify(parsed)!==JSON.stringify(norm)) writeNorm(norm);
  return norm;
}

export function saveSettings(patch){
  const cur = getSettings();
  const merged = {
    ...cur, ...patch,
    endpoints:{...cur.endpoints, ...(patch?.endpoints||{})},
    branding:{...cur.branding, ...(patch?.branding||{})},
    budgets:{...cur.budgets, ...(patch?.budgets||{})}
  };
  if (isObj(patch?.connections)) {
    const pc=patch.connections;
    if(pc.client)  merged.client  = pc.client;
    if(pc.service) merged.service = pc.service;
    if(pc.endpoints) merged.endpoints = { ...merged.endpoints, ...pc.endpoints };
    if(pc.branding)  merged.branding  = { ...merged.branding,  ...pc.branding };
    if(pc.budgets)   merged.budgets   = { ...merged.budgets,   ...pc.budgets };
    if(pc.proxy)     merged.proxy     = { ...(merged.proxy||{}), ...pc.proxy };
  }
  const norm = normalizeAnyShape(merged);
  writeNorm(norm);
  // met aussi à jour l'export `settings` (objet) ci-dessous
  __settings_cache = norm;
  return norm;
}

export function getWorkId(s=getSettings()){ return `${s.client}::${s.service}`; }

// Aliases UI
export const settingsLoad  = getSettings;
export const settingsSave  = saveSettings;
export const currentWorkId = getWorkId;

// Contexte client/service
export function setWorkContext({client,service}={}){ const cur=getSettings(); return saveSettings({ client:client??cur.client, service:service??cur.service }); }

// Proxy direct (compat)
export function getProxyConfig(){ const s=getSettings(); return s.proxy || s.endpoints?.proxy || { ...DEFAULT_PROXY }; }
export function setProxyConfig(patch){ const cur=getProxyConfig(); const next={...cur, ...(patch||{})}; const s=getSettings();
  const out=saveSettings({ endpoints:{...s.endpoints, proxy:next}, proxy:next, connections:{...(s.connections||{}), endpoints:{...s.connections.endpoints, proxy:next}, proxy:next }});
  try{ localStorage.setItem(KEY_PROXY, JSON.stringify(next)); }catch{}; return out.proxy;
}

// ✅ Export *objet* attendu par l’UI (lecture directe dans mount)
let __settings_cache = getSettings();
export const settings = __settings_cache;

/*
INDEX settings.js:
- getSettings/saveSettings/getWorkId (aliases settingsLoad/settingsSave/currentWorkId)
- setWorkContext
- getProxyConfig/setProxyConfig
- export objet `settings` (toujours défini)
- Schéma garanti (même à vide):
  top-level    : { client, service, endpoints:{llm,git,gdrive,proxy{url,token}}, proxy{url,token}, branding, budgets }
  connections  : { client, service, endpoints:{...}, proxy{...}, branding, budgets }
*/
