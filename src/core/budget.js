// PARIA-V2-CLEAN v1.0.0 | core/budget.js
import { settingsLoad } from './settings.js';
import { readClientBlob, writeClientBlob } from './store.js';
import { saveToGit, saveToGoogle } from './net.js';

export function getBudget(){ return { cap: settingsLoad().budgets?.max_local_bytes || (5*1024*1024) }; }
export function usageRatio(bytes){ const {cap}=getBudget(); return cap? (bytes/cap):0; }

function heavySlices(blob){
  const out=[]; // {path, data}
  if ((blob.charter?.ai||[]).length) out.push({ path:['charter','ai'], data: blob.charter.ai });
  if ((blob.meta?.session?.ai||[]).length) out.push({ path:['meta','session','ai'], data: blob.meta.session.ai });
  for (const c of (blob.items||[])) { if ((c.ai||[]).length) out.push({ path:['items', c.id, 'ai'], data:c.ai }); }
  if ((blob.journal||[]).length>1000) out.push({ path:['journal'], data: blob.journal }); // seuil simple
  return out;
}

function setAtPath(blob, path, value, cardId=null){
  if (path[0]==='items'){ const id=path[1]; const idx=(blob.items||[]).findIndex(x=>x.id===id); if (idx>=0){ if (path[2]==='ai') blob.items[idx].ai=value; } return; }
  if (path.join('.')==='charter.ai') blob.charter.ai=value;
  if (path.join('.')==='meta.session.ai') blob.meta.session.ai=value;
  if (path.join('.')==='journal') blob.journal=value;
}

export async function commitWithEviction(){
  const blob=readClientBlob();
  const slices=heavySlices(blob);
  if (!slices.length) return {offloaded:false};
  const payload={ workId: (window?.settings? `${window.settings.client}::${window.settings.service}` : '') , ts:Date.now(), slices: slices.map(s=>({ path:s.path, count:Array.isArray(s.data)?s.data.length:0 })) };
  let okGit=false, okDrv=false;
  try{ okGit=(await saveToGit(payload))?.ok||false; }catch{}
  try{ okDrv=(await saveToGoogle(payload))?.ok||false; }catch{}
  if (okGit||okDrv){
    for (const s of slices){ setAtPath(blob, s.path, [{ remote_ref:true, count: Array.isArray(s.data)?s.data.length:0, ts:Date.now() }]); }
    writeClientBlob(blob);
  }
  return {offloaded:(okGit||okDrv), git:okGit, drive:okDrv};
}

/* INDEX
- getBudget(), usageRatio(bytes), commitWithEviction()
*/
