// src/domain/journal.js
import { readClientBlob, writeClientBlob } from '../core/store.js';
import { commitWithEviction } from '../core/budget.js';

export function appendJournal(entry){
  const s = readClientBlob();
  s.decisions = Array.isArray(s.decisions)? s.decisions : [];
  s.decisions.push({ id:`ev_${Date.now()}`, ...entry });
  writeClientBlob(s);
  commitWithEviction();
}
