import { getProxyConfig } from './settings.js';

// helpers fetch sans preflight
async function postJSON(url, body){
  const r = await fetch(url, { method:'POST', headers:{ 'Content-Type':'text/plain' }, body: JSON.stringify(body) });
  if (!r.ok) return { ok:false, error:`http_${r.status}` };
  try{ return await r.json(); }catch{ return { ok:false, error:'bad_json' }; }
}

export async function gasPost(route, payload={}){
  const cfg = getProxyConfig();
  if (!cfg.url || !cfg.secret) return { ok:false, error:'proxy_unconfigured' };
  const body = { route, secret: cfg.secret, repo: cfg.repo, ...payload };
  return await postJSON(cfg.url, body);
}

export async function gasGet(route, payload={}){
  const cfg = getProxyConfig();
  if (!cfg.url || !cfg.secret) return { ok:false, error:'proxy_unconfigured' };
  const q = new URLSearchParams({ route, secret: cfg.secret, repo: cfg.repo, ...payload });
  const r = await fetch(cfg.url+'?'+q.toString(), { method:'GET' });
  if (!r.ok) return { ok:false, error:`http_${r.status}` };
  try{ return await r.json(); }catch{ return { ok:false, error:'bad_json' }; }
}

// API M1
export const gitFind = (work_id, at) => gasGet('git_find', { work_id, at });
export const gitLoad = (work_id, sha, json_path) => gasGet('git_load', { work_id, sha, json_path });
export const gitSnapshot = (work_id, state) => gasPost('git_snapshot', { work_id, state });

export const gdrvFind = (work_id, at) => gasGet('gdrive_find', { work_id, at });
export const gdrvLoad = (work_id, id) => gasGet('gdrive_load', { work_id, id });

export const loadFromGoogle = (work_id) => gasGet('load', { work_id });
export const saveToGoogle = (work_id, state) => gasPost('save', { work_id, state });
export const diag = () => gasGet('diag', {});
