// src/core/net.js — LLM + snapshots Git/Drive (+ alias compat)
import { getSettings, getWorkId } from './settings.js';

async function postJSON(url,data){
  const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// LLM
export async function postLLM(payload){
  const { endpoints } = getSettings(); if(!endpoints.llm) return { ok:false, data:[] };
  const out = await postJSON(endpoints.llm, payload);
  return { ok:true, data: out };
}
export async function llmParia({title='',content='',tags=[],components=['P','A','R','I']}){
  const r=await postLLM({ mode:'paria', title, content, tags, components });
  return r.ok && Array.isArray(r.data)? r.data : [];
}

// Git
export async function listGitSnapshots(workId=getWorkId()){ const {endpoints}=getSettings(); if(!endpoints.git) return []; const out=await postJSON(endpoints.git,{action:'snapshot.list',workId}); return Array.isArray(out)?out:[]; }
export async function pushSnapshotToGit(snapshot,workId=getWorkId()){ const {endpoints}=getSettings(); if(!endpoints.git) throw new Error('Git endpoint not configured'); const out=await postJSON(endpoints.git,{action:'snapshot.save',workId,payload:snapshot}); return out?.ok?out:{ok:true}; }
export async function fetchSnapshotFromGit(id,workId=getWorkId()){ const {endpoints}=getSettings(); if(!endpoints.git) throw new Error('Git endpoint not configured'); const out=await postJSON(endpoints.git,{action:'snapshot.fetch',workId,payload:{id}}); return out&&out.blob?out:null; }
export const gitFind = listGitSnapshots; export const gitSnapshot = pushSnapshotToGit; export const gitLoad = fetchSnapshotFromGit;

// Google Drive
export async function listDriveSnapshots(workId=getWorkId()){ const {endpoints}=getSettings(); if(!endpoints.gdrive) return []; const out=await postJSON(endpoints.gdrive,{action:'snapshot.list',workId}); return Array.isArray(out)?out:[]; }
export async function pushSnapshotToDrive(snapshot,workId=getWorkId()){ const {endpoints}=getSettings(); if(!endpoints.gdrive) throw new Error('Drive endpoint not configured'); const out=await postJSON(endpoints.gdrive,{action:'snapshot.save',workId,payload:snapshot}); return out?.ok?out:{ok:true}; }
export async function fetchSnapshotFromDrive(id,workId=getWorkId()){ const {endpoints}=getSettings(); if(!endpoints.gdrive) throw new Error('Drive endpoint not configured'); const out=await postJSON(endpoints.gdrive,{action:'snapshot.fetch',workId,payload:{id}}); return out&&out.blob?out:null; }
export const gdrvFind = listDriveSnapshots; export const gdrvSnapshot = pushSnapshotToDrive; export const gdrvLoad = fetchSnapshotFromDrive;

/*
INDEX net.js:
- postLLM/llmParia
- listGitSnapshots/pushSnapshotToGit/fetchSnapshotFromGit (+ alias gitFind/gitSnapshot/gitLoad)
- listDriveSnapshots/pushSnapshotToDrive/fetchSnapshotFromDrive (+ alias gdrvFind/gdrvSnapshot/gdrvLoad)
*/
