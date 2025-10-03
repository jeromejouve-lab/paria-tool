// PARIA-V2-CLEAN v1.0.0 | domain/journal.js
import { readClientBlob, writeClientBlob } from '../core/store.js';

export function logEvent(type, target={}, meta={}){
  const blob=readClientBlob();
  const e={ ts:Date.now(), type, target, meta };
  blob.journal.push(e); writeClientBlob(blob); return e;
}

export function listJournal({type=null, kind=null, fromTs=null, toTs=null}={}){
  const arr=(readClientBlob().journal||[]).slice();
  return arr.filter(e=>{
    if (type && e.type!==type) return false;
    if (kind && e?.target?.kind!==kind) return false;
    if (fromTs && e.ts<fromTs) return false;
    if (toTs && e.ts>toTs) return false;
    return true;
  });
}

/* Soft-restore dispatcher: appelle reducers selon le kind */
export async function restoreByTarget({kind,id}){
  const mod = await import('./reducers.js');
  if (kind==='card'     && typeof mod.restoreCard==='function')     return mod.restoreCard(id);
  if (kind==='scenario' && typeof mod.restoreScenario==='function') return mod.restoreScenario(id);
  if (kind==='charter'  && typeof mod.restoreCharter==='function')  return mod.restoreCharter();
  return false;
}

/* INDEX
- logEvent(), listJournal({filters}), restoreByTarget({kind,id})
*/
