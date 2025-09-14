// src/domain/journal.js — append/list scope client/service
import { readClientBlob, writeClientBlob } from '../core/store.js';
import { getSettings } from '../core/settings.js';

export function appendJournal(evt){
  const s = readClientBlob();
  s.journal = Array.isArray(s.journal) ? s.journal : [];
  const base = {
    ts: Date.now(),
    type: evt?.type || 'update',
    target: evt?.target || {kind:'unknown', id:'*'},
    payload: evt?.payload || {},
    scope: { client:getSettings().client, service:getSettings().service }
  };
  s.journal.push(base);
  writeClientBlob(s);
  return base;
}
export function listJournal({ types=[], since=0, until=Date.now() }={}){
  const s = readClientBlob();
  const scope = { client:getSettings().client, service:getSettings().service };
  const all = Array.isArray(s.journal) ? s.journal : [];
  return all.filter(e =>
    e.scope?.client===scope.client &&
    e.scope?.service===scope.service &&
    e.ts>=since && e.ts<=until &&
    (types.length? types.includes(e.type) : true)
  );
}

/*
INDEX journal.js:
- appendJournal(evt)
- listJournal({types?, since?, until?})
*/
