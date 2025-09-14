// src/core/net.js — API snapshots Git / Google (Drive) + POST JSON
import { getSettings, getWorkId } from './settings.js';

async function postJSON(url, data){
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---------- GIT ----------
export async function listGitSnapshots(workId = getWorkId()){
  const { endpoints } = getSettings();
  if (!endpoints.git) return [];
  const out = await postJSON(endpoints.git, { action:'snapshot.list', workId });
  return Array.isArray(out) ? out : [];
}

export async function pushSnapshotToGit(snapshot, workId = getWorkId()){
  const { endpoints } = getSettings();
  if (!endpoints.git) throw new Error('Git endpoint not configured');
  const out = await postJSON(endpoints.git, { action:'snapshot.save', workId, payload:snapshot });
  return out?.ok ? out : { ok:true };
}

export async function fetchSnapshotFromGit(id, workId = getWorkId()){
  const { endpoints } = getSettings();
  if (!endpoints.git) throw new Error('Git endpoint not configured');
  const out = await postJSON(endpoints.git, { action:'snapshot.fetch', workId, payload:{ id } });
  return out && out.blob ? out : null; // { id, ts, label, blob }
}

// ---------- GOOGLE DRIVE ----------
export async function listDriveSnapshots(workId = getWorkId()){
  const { endpoints } = getSettings();
  if (!endpoints.gdrive) return [];
  const out = await postJSON(endpoints.gdrive, { action:'snapshot.list', workId });
  return Array.isArray(out) ? out : [];
}

export async function pushSnapshotToDrive(snapshot, workId = getWorkId()){
  const { endpoints } = getSettings();
  if (!endpoints.gdrive) throw new Error('Drive endpoint not configured');
  const out = await postJSON(endpoints.gdrive, { action:'snapshot.save', workId, payload:snapshot });
  return out?.ok ? out : { ok:true };
}

export async function fetchSnapshotFromDrive(id, workId = getWorkId()){
  const { endpoints } = getSettings();
  if (!endpoints.gdrive) throw new Error('Drive endpoint not configured');
  const out = await postJSON(endpoints.gdrive, { action:'snapshot.fetch', workId, payload:{ id } });
  return out && out.blob ? out : null;
}

export async function postLLM(url, payload){ return postJSON(url, payload); }

/*
INDEX net.js:
- postJSON(url, data)
- listGitSnapshots(workId), pushSnapshotToGit(snapshot, workId), fetchSnapshotFromGit(id, workId)
- listDriveSnapshots(workId), pushSnapshotToDrive(snapshot, workId), fetchSnapshotFromDrive(id, workId)
- postLLM(url, payload)
*/
