// PARIA-V2-CLEAN v1.0.0 | core/net.js
import { settingsLoad } from './settings.js';

export async function postJSON(url, data){
  const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export function getGAS(){
  const s = settingsLoad();
  const url = s?.endpoints?.proxy?.url || s?.proxy?.url || '';
  const secret = s?.endpoints?.proxy?.token || s?.proxy?.token || '';
  return { url, secret };
}

// POST text/plain (évite preflight CORS)
export async function postPlain(url, obj){
  const body = JSON.stringify(obj || {});
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return { ok:true, text:txt }; }
}

// Diag GET conforme à code.gs ?route=diag&secret=...
export async function diag(){
  const { url, secret } = getGAS();
  if (!url) return { proxy:{configured:false, ok:false} };
  const u = new URL(url); u.searchParams.set('route','diag'); u.searchParams.set('secret',secret);
  const r = await fetch(u.toString(), { method:'GET' });
  const txt = await r.text();
  let data; try { data = JSON.parse(txt); } catch { data = { text: txt }; }
  return { proxy:{configured:true, ok:r.ok, detail:r.ok?'pong':`HTTP ${r.status}`}, data };
}

// Snapshots / bootstrap via GAS (safe if not configured)
async function callGAS(action, payload={}){
  const {url,token}=getGAS(); if (!url) return { ok:false, detail:'proxy not configured' };
  try{ const r=await postJSON(url, { action, token, ...payload }); return (r && typeof r==='object')?r:{ok:true}; }catch(e){ return {ok:false, detail:e?.message||'net error'}; }
}

export const saveToGit = (x)=>callGAS('git.saveSnapshot',{ blob:x });
export const listGitSnapshots = ()=>callGAS('git.list',{}).then(r=>r?.list||[]);
export const loadFromGit = (id)=>callGAS('git.load',{ id });

export const saveToGoogle = (x)=>callGAS('gdrive.saveSnapshot',{ blob:x });
export const listDriveSnapshots = ()=>callGAS('gdrive.list',{}).then(r=>r?.list||[]);
export const loadFromGoogle = (id)=>callGAS('gdrive.load',{ id });

export const gitEnsureClient = (client)=>callGAS('git.ensureClient',{ client });
export const gitEnsureService = (client,service)=>callGAS('git.ensureService',{ client, service });
export const gdrvEnsureClient = (client)=>callGAS('gdrive.ensureClient',{ client });
export const gdrvEnsureService = (client,service)=>callGAS('gdrive.ensureService',{ client, service });

export async function bootstrapWorkspace(client, service){
  const r1 = await gitEnsureClient(client); const r2 = await gitEnsureService(client,service);
  const r3 = await gdrvEnsureClient(client); const r4 = await gdrvEnsureService(client,service);
  return { git:{ client:r1?.ok, service:r2?.ok }, gdrive:{ client:r3?.ok, service:r4?.ok } };
}

/* INDEX
- postJSON, diag
- saveToGit/listGitSnapshots/loadFromGit
- saveToGoogle/listDriveSnapshots/loadFromGoogle
- gitEnsure, bootstrapWorkspace()
*/


