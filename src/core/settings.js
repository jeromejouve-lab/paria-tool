// src/core/settings.js — binding VIVANT `settings` + zéro-config safe (UI intacte)
const KEY_CONN  = 'paria::connections';
const KEY_PROXY = 'paria::proxy';

const DEF_PROXY = { url:'', token:'' };
const DEF = {
  client:  '',
  service: '',
  // top-level: strings (utilisé par net.js)
  endpoints: { llm:'', git:'', gdrive:'', proxy:{ ...DEF_PROXY } },
  // miroir top-level (certaines UIs lisent settings.proxy.url)
  proxy: { ...DEF_PROXY },
  branding: { my_name:'', my_logo_url:'', my_address:'' },
  budgets:  { max_local_bytes: 5 * 1024 * 1024 }
};

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const asStr = (v,d='') => typeof v==='string' ? v : d;
const asUrl = (v,d='') => (typeof v==='string' ? v : (isObj(v) ? asStr(v.url,d) : d));

function loadRaw(){
  try { const raw = localStorage.getItem(KEY_CONN); return raw ? JSON.parse(raw) : {}; }
  catch { return {}; }
}
function saveRaw(x){
  localStorage.setItem(KEY_CONN, JSON.stringify(x));
  try { localStorage.setItem(KEY_PROXY, JSON.stringify(x.proxy || DEF.proxy)); } catch {}
}

// Normalise: top-level (strings) + connections (objets {url})
function normalizeAny(raw){
  const s = isObj(raw) ? raw : {};
  const bag = isObj(s.connections) ? s.connections : s;

  const llmStr    = asUrl(bag?.endpoints?.llm,    DEF.endpoints.llm);
  const gitStr    = asUrl(bag?.endpoints?.git,    DEF.endpoints.git);
  const gdriveStr = asUrl(bag?.endpoints?.gdrive, DEF.endpoints.gdrive);

  let proxyObj = isObj(bag?.endpoints?.proxy) ? bag.endpoints.proxy
               : isObj(bag?.proxy)            ? bag.proxy
               : null;
  if (!proxyObj) {
    try { const legacy = JSON.parse(localStorage.getItem(KEY_PROXY) || 'null'); if (isObj(legacy)) proxyObj = legacy; } catch {}
  }
  if (!isObj(proxyObj)) proxyObj = { ...DEF_PROXY };
  proxyObj = { url: asStr(proxyObj.url,''), token: asStr(proxyObj.token,'') };

  const client  = asStr(bag?.client,  DEF.client);
  const service = asStr(bag?.service, DEF.service);
  const branding = {
    my_name:     asStr(bag?.branding?.my_name,''),
    my_logo_url: asStr(bag?.branding?.my_logo_url,''),
    my_address:  asStr(bag?.branding?.my_address,'')
  };
  const budgets = { max_local_bytes: Number(bag?.budgets?.max_local_bytes) || DEF.budgets.max_local_bytes };

  // TOP-LEVEL (core/net.js)
  const top = {
    client, service,
    endpoints: { llm: llmStr, git: gitStr, gdrive: gdriveStr, proxy: { ...proxyObj } },
    proxy: { ...proxyObj },
    branding, budgets
  };

  // MIRROR "connections" (UI : .endpoints.X.url)
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

// Binding vivant (⚠️ let, pas const)
export let settings = normalizeAny({ ...DEF, ...loadRaw() });
try { window.settings = settings; } catch {}

// API
export function getSettings(){
  // merge DEF + raw pour ne manquer aucune clé, puis normalise
  const merged = {
    ...DEF,
    ...loadRaw(),
    endpoints: { ...DEF.endpoints, ...(loadRaw()?.endpoints || {}) },
    branding:  { ...DEF.branding,  ...(loadRaw()?.branding  || {}) },
    budgets:   { ...DEF.budgets,   ...(loadRaw()?.budgets   || {}) }
  };
  const norm = normalizeAny(merged);
  saveRaw(norm);

  // ⬇️ mise à jour du binding exporté
  settings = norm;
  try { window.settings = settings; } catch {}

  return norm;
}

export function saveSettings(patch){
  const cur = getSettings(); // remet déjà settings=norm
  const merged = {
    ...cur, ...patch,
    endpoints: { ...cur.endpoints, ...(patch?.endpoints || {}) },
    branding:  { ...cur.branding,  ...(patch?.branding  || {}) },
    budgets:   { ...cur.budgets,   ...(patch?.budgets   || {}) }
  };
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
    if (pc.proxy)    merged.proxy    = { url: asStr(pc.proxy.url, merged.proxy.url), token: asStr(pc.proxy.token, merged.proxy.token) };
    if (pc.branding) merged.branding = { ...merged.branding, ...pc.branding };
    if (pc.budgets)  merged.budgets  = { ...merged.budgets,  ...pc.budgets  };
  }
  const norm = normalizeAny(merged);
  saveRaw(norm);

  // ⬇️ mise à jour du binding exporté
  settings = norm;
  try { window.settings = settings; } catch {}

  return norm;
}

export function getWorkId(s = getSettings()){ return `${s.client}::${s.service}`; }

// Aliases UI
export const settingsLoad  = getSettings;
export const settingsSave  = saveSettings;
export const currentWorkId = getWorkId;

// Contexte client/service
export function setWorkContext({ client, service } = {}){
  const cur = getSettings();
  return saveSettings({ client: client ?? cur.client, service: service ?? cur.service });
}

// Proxy direct (compat)
export function getProxyConfig(){
  const s = getSettings();
  return s.proxy || s.endpoints?.proxy || { ...DEF_PROXY };
}
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

/*
INDEX settings.js:
- export let settings (binding vivant) + window.settings
- getSettings/saveSettings/currentWorkId (aliases settingsLoad/settingsSave/currentWorkId)
- setWorkContext, getProxyConfig/setProxyConfig
- Schéma garanti (même à vide):
  top-level:    endpoints.llm/git/gdrive = string, endpoints.proxy={url,token}, proxy={url,token}
  connections:  endpoints.llm/git/gdrive = {url:"..."}, endpoints.proxy={url,token}, proxy={url,token}
*/
