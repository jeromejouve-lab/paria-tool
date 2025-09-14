import { getSettings } from './settings.js';

export async function postJSON(url, body){
  const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Placeholders — brancher tes infos Git/Drive existantes
export async function pushSnapshotToGit(snapshot){ /* TODO: impl concrète via tes creds */ return { ok:true }; }
export async function pushSnapshotToDrive(snapshot){ /* TODO: impl concrète via code.gs/token */ return { ok:true }; }
export async function fetchFromGit(ref){ /* TODO */ return null; }
export async function fetchFromDrive(ref){ /* TODO */ return null; }

/*
INDEX net.js:
- postJSON(url, body)
- pushSnapshotToGit(snapshot)
- pushSnapshotToDrive(snapshot)
- fetchFromGit(ref)
- fetchFromDrive(ref)
*/
