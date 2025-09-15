// PARIA-V2-CLEAN v1.0.0 | core/net.js
import { settingsLoad } from './settings.js';

export async function postJSON(url, data){
  const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function getGAS(){ const s=settingsLoad(); const url = s?.endpoints?.proxy?.url || s?.proxy?.url || ''; const token = s?.endpoints?.proxy?.token || s?.proxy?.token || ''; return { url, token }; }

export async function diag(){
  const s=settingsLoad(); const {url,token}=getGAS();
  const out={ workId:`${s.client}::${s.service}`, proxy:{configured:!!url, ok:false, detail:''}, llm:{configured:!!s?.endpoints?.llm, ok:false, detail:''}, git:{configured:!!s?.endpoints?.git, ok:false, detail:''}, gdrive:{configured:!!s?.endpoints?.gdrive, ok:false, detail:''} };
  try{ if (url){ await postJSON(url,{action:'ping', token}); out.proxy.ok=true; out.proxy.detail='pong'; } }catch(e){ out.proxy.detail=e?.message||'fail'; }
  try{ if (s?.endpoints?.llm){ await postJSON(s.endpoints.llm,{mode:'ping'}); out.llm.ok=true; out.llm.detail='pong'; } }catch(e){ out.llm.detail=e?.message||'fail'; }
  // git/gdrive pings optionnels via GAS
  return out;
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

