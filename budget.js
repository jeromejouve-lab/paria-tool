import { settingsLoad } from './settings.js';
import { readClientBlob, writeClientBlob } from './store.js';
import { gitSnapshot, saveToGoogle } from './net.js';

export function usedBytes(){ let n=0; for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i),v=localStorage.getItem(k); n+=(k?.length||0)+(v?.length||0);} return n; }
export function updateStorageBadge(){
  const st=settingsLoad(); const pct=Math.min(100,Math.round(100*usedBytes()/st.budgets.max_local_bytes));
  const b=document.getElementById('quotaBadge'); if(b){ b.textContent=`local ${pct}%`; b.className='badge '+(pct<40?'b-green':pct<90?'b-orange':'b-red'); }
  const mode=document.getElementById('modeBadge'); if(mode){ const cfg=settingsLoad().proxy||{}; mode.textContent=(cfg.url&&cfg.secret)?'proxy':'local-only'; }
  return pct/100;
}
function activeIds(){ const s=readClientBlob(); const ids=new Set(); ids.add('charter'); const sess=s.meta?.session; if(sess?.card_id)ids.add(sess.card_id);
  const open=s.meta?.open_cards||[]; open.forEach(id=>ids.add(id)); const sc=(s.scenarios||[]).find(x=>x.working); if(sc&&Array.isArray(sc.items)){sc.items.forEach(it=>ids.add(it.card_id));} return ids; }
function capLocalJournal(s){ const MAX=300; if(Array.isArray(s.decisions)&&s.decisions.length>MAX){ s.decisions=s.decisions.slice(-MAX); } return s; }

export async function offloadNonActiveIfNeeded(){
  const st=settingsLoad(); const ratio=updateStorageBadge(); if(ratio<st.budgets.warn)return false;
  const s=readClientBlob(); const ids=activeIds(); const active=[],cold=[]; (s.items||[]).forEach(c=>(ids.has(c.id)?active:cold).push(c));
  if(!cold.length)return false;
  const wid=st.work.work_id||`${st.work.client||'ACME'}|${st.work.service||'Compta'}|${new Date().toISOString().slice(0,10)}`;
  let snap=null; try{snap=await gitSnapshot(wid,s);}catch{} if(!snap||!snap.ok){ try{await saveToGoogle(wid,s);}catch{} }
  const next={...s,items:active}; capLocalJournal(next); writeClientBlob(next); updateStorageBadge(); return true;
}
export async function commitWithEviction(){ await offloadNonActiveIfNeeded(); updateStorageBadge(); return true; }
export async function ensurePreRestoreBudget(){ return await offloadNonActiveIfNeeded(); }
export async function consolidateAfterRestore(){ const s=readClientBlob(); writeClientBlob(capLocalJournal(s)); await offloadNonActiveIfNeeded(); updateStorageBadge(); }
