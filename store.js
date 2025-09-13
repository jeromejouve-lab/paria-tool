import { settingsLoad, currentClient, currentService } from './settings.js';
import { normalizeState } from './normalize.js';

const keyFor = cid => 'paria_db_'+cid;

export function readClientBlob(cid=currentClient()){
  const raw = localStorage.getItem(keyFor(cid));
  if (!raw) return normalizeState({});
  try{ return normalizeState(JSON.parse(raw)); }catch{ return normalizeState({}); }
}

export function writeClientBlob(blob, cid=currentClient()){
  const safe = normalizeState(blob);
  localStorage.setItem(keyFor(cid), JSON.stringify(safe));
  return safe;
}

/** merge dans le "service courant" (si tu décides plus tard de spliter par service) */
export function mergeIntoCurrentService(part, cid=currentClient()){
  const cur = readClientBlob(cid);
  const next = { ...cur };
  if (part.charter)   next.charter   = part.charter;
  if (part.items)     next.items     = part.items;
  if (part.scenarios) next.scenarios = part.scenarios;
  if (part.decisions) next.decisions = part.decisions;
  next.meta = { ...(next.meta||{}), client_id: cid, rev: (next.meta?.rev||0)+1, updated_ts: Date.now() };
  return writeClientBlob(next, cid);
}

export function loadDB(){
  const S = readClientBlob();
  window.__svc = S;
  return S;
}
