// PARIA-V2-CLEAN v1.0.0 | core/settings.js
const KEY_CONN  = 'paria::connections';
const KEY_PROXY = 'paria::proxy';

const DEF_PROXY = { url:'', token:'' };
const DEF = {
  client:'', service:'',
  endpoints: { llm:'', git:'', gdrive:'', proxy:{...DEF_PROXY} },
  proxy:{...DEF_PROXY},
  branding:{ my_name:'', my_logo_url:'', my_address:'' },
  budgets:{ max_local_bytes: 5*1024*1024 },
  flags:{ auto_sync:false }
};

const S = (v,d='') => (typeof v==='string'?v:d);
const U = (v,d='') => (typeof v==='string'?v:(v&&typeof v==='object'?S(v.url,d):d));
const isObj = v => v && typeof v==='object' && !Array.isArray(v);

function normalizeAny(r={}){
  const s=isObj(r)?r:{};
  const bag=isObj(s.connections)?s.connections:s;

  const proxyObj=isObj(bag?.endpoints?.proxy)?bag.endpoints.proxy:(isObj(bag?.proxy)?bag.proxy:{...DEF_PROXY});
  const proxy={ url:S(proxyObj.url), token:S(proxyObj.token) };

  const top={
    client:S(bag.client), service:S(bag.service),
    endpoints:{ llm:S(bag?.endpoints?.llm), git:S(bag?.endpoints?.git), gdrive:S(bag?.endpoints?.gdrive), proxy:{...proxy} },
    proxy:{...proxy},
    branding:{
      my_name:S(bag?.branding?.my_name), my_logo_url:S(bag?.branding?.my_logo_url), my_address:S(bag?.branding?.my_address)
    },
    budgets:{ max_local_bytes:Number(bag?.budgets?.max_local_bytes)||DEF.budgets.max_local_bytes },
    flags:{ auto_sync:!!bag?.flags?.auto_sync }
  };

  const connections={
    client:S(s?.connections?.client)||top.client,
    service:S(s?.connections?.service)||top.service,
    endpoints:{
      llm:{url:U(s?.connections?.endpoints?.llm,top.endpoints.llm)},
      git:{url:U(s?.connections?.endpoints?.git,top.endpoints.git)},
      gdrive:{url:U(s?.connections?.endpoints?.gdrive,top.endpoints.gdrive)},
      proxy:{...proxy}
    },
    proxy:{...proxy}
  };
  return { ...top, connections };
}

export function buildWorkId(){
   const s = settingsLoad();
   const d = new Date();
   const pad = v => String(v).padStart(2,'0');
   const day = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
   // format attendu par code.gs : client|service|yyyy-MM-dd
   return `${s.client}|${s.service}|${day}`;
}

function loadRaw(){ try{const r=localStorage.getItem(KEY_CONN);return r?JSON.parse(r):{};}catch{return {};} }
function saveRaw(x){ localStorage.setItem(KEY_CONN, JSON.stringify(x)); try{localStorage.setItem(KEY_PROXY, JSON.stringify(x.proxy||DEF_PROXY));}catch{} }

export let settings = normalizeAny({ ...DEF, ...loadRaw() });
try{ window.settings=settings; }catch{}

export function settingsLoad(){ settings=normalizeAny({ ...DEF, ...loadRaw() }); saveRaw(settings); try{window.settings=settings;}catch{}; return settings; }
export function settingsSave(patch){
  const cur=settingsLoad();
  const merged={
    ...cur, ...patch,
    endpoints:{ ...cur.endpoints, ...(patch?.endpoints||{}) },
    branding:{ ...cur.branding, ...(patch?.branding||{}) },
    budgets:{ ...cur.budgets, ...(patch?.budgets||{}) },
    flags:{ ...cur.flags, ...(patch?.flags||{}) }
  };
  if (isObj(patch?.connections)) {
    const c=patch.connections;
    if (c.client) merged.client=c.client;
    if (c.service) merged.service=c.service;
    if (c.endpoints) merged.endpoints={
      ...merged.endpoints,
      llm:U(c.endpoints.llm,merged.endpoints.llm),
      git:U(c.endpoints.git,merged.endpoints.git),
      gdrive:U(c.endpoints.gdrive,merged.endpoints.gdrive),
      proxy:isObj(c.endpoints.proxy)?{ url:S(c.endpoints.proxy.url), token:S(c.endpoints.proxy.token) }:merged.endpoints.proxy
    };
    if (c.proxy) merged.proxy={ url:S(c.proxy.url, merged.proxy.url), token:S(c.proxy.token, merged.proxy.token) };
  }
  const norm=normalizeAny(merged); saveRaw(norm); settings=norm; try{window.settings=settings;}catch{}; return norm;
}

export function currentWorkId(s=settingsLoad()){ return `${s.client}::${s.service}`; }
export function getWorkContext(){ const s=settingsLoad(); return { client:s.client, service:s.service, workId:currentWorkId(s) }; }
export function setWorkContext({client,service}={}){ const s=settingsLoad(); return settingsSave({ client:client??s.client, service:service??s.service, connections:{ client:client??s.client, service:service??s.service } }); }
export function getProxyConfig(){ const s=settingsLoad(); return s.proxy || s.endpoints?.proxy || { ...DEF_PROXY }; }

/* INDEX
- settings (binding), settingsLoad/settingsSave, currentWorkId/getWorkContext/setWorkContext, getProxyConfig
*/


