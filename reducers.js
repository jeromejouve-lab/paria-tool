// src/domain/reducers.js
import { readClientBlob, writeClientBlob } from '../core/store.js';
import { normalizeCard, newCard, normalizeAI } from './models.js';
import { commitWithEviction } from '../core/budget.js';
import { appendJournal } from './journal.js';

export function listCards(mode='active', q=''){
  const s = readClientBlob();
  let arr = Array.isArray(s.items)? s.items.map(normalizeCard) : [];
  if (mode==='active')   arr = arr.filter(c=>!c.state.deleted);
  if (mode==='deleted')  arr = arr.filter(c=>c.state.deleted);
  if (mode==='recent')   arr = arr.sort((a,b)=>b.state.updated_ts - a.state.updated_ts).slice(0,50);
  if (q) {
    const qq = q.toLowerCase();
    arr = arr.filter(c=> (c.title||'').toLowerCase().includes(qq) || (c.content||'').toLowerCase().includes(qq));
  }
  return arr;
}

export function createCard(part={}){
  const s = readClientBlob();
  const c = newCard(part);
  s.items = Array.isArray(s.items)? s.items : [];
  s.items.push(c);
  writeClientBlob(s);
  appendJournal({ ts: Date.now(), type:'create', target:{kind:'card', id:c.id}, payload:{title:c.title} });
  return c;
}

export function updateCard(id, patch){
  const s = readClientBlob();
  const i = s.items.findIndex(x=>x.id===id);
  if (i<0) return null;
  const cur = normalizeCard(s.items[i]);
  const next = normalizeCard({ ...cur, ...patch, state:{ ...cur.state, updated_ts: Date.now() }});
  s.items[i] = next;
  writeClientBlob(s);
  appendJournal({ ts: Date.now(), type:'update', target:{kind:'card', id}, payload:patch });
  return next;
}

export function softDeleteCard(id){
  return updateCard(id, { state:{ deleted:true, deleted_at: Date.now(), deleted_by:'me', updated_ts: Date.now() }});
}

export function restoreCard(id){
  return updateCard(id, { state:{ deleted:false, deleted_at:0, deleted_by:'', updated_ts: Date.now() }});
}

export function addAItoCard(id, aiPart){
  const s = readClientBlob();
  const i = s.items.findIndex(x=>x.id===id);
  if (i<0) return null;
  const card = normalizeCard(s.items[i]);
  card.ai = card.ai.concat([ normalizeAI(aiPart) ]);
  card.state.updated_ts = Date.now();
  s.items[i] = card;
  writeClientBlob(s);
  appendJournal({ ts: Date.now(), type:'ai', target:{kind:'card', id}, payload:{ kind: aiPart.kind, origin: aiPart.origin } });
  return card;
}

export function toggleAIStatus(id, aiId, status){
  const s = readClientBlob();
  const i = s.items.findIndex(x=>x.id===id); if (i<0) return null;
  const card = normalizeCard(s.items[i]);
  const j = card.ai.findIndex(a=>a.id===aiId); if (j<0) return null;
  card.ai[j].status = status;
  card.ai[j].selected = (status==='ok') ? true : card.ai[j].selected;
  card.state.updated_ts = Date.now();
  s.items[i] = card;
  writeClientBlob(s); commitWithEviction();
  return card;
}

// Séance / Projecteur (stockée dans meta.session)
export function getSession(){
  const s = readClientBlob();
  return s.meta?.session || { card_id:'', state:'off', guest_token:'' };
}

export function setSession(sess){
  const s = readClientBlob();
  s.meta = s.meta || {};
  s.meta.session = { ...getSession(), ...sess };
  writeClientBlob(s); commitWithEviction();
  appendJournal({ ts: Date.now(), type:'session', target:{kind:'card', id:s.meta.session.card_id||'*'}, payload:{ state:sess.state } });
  return s.meta.session;
}

export function startSession(card_id){
  const token = Math.random().toString(36).slice(2,10);
  return setSession({ card_id, state:'live', guest_token: token });
}
export function pauseSession(){ return setSession({ state:'pause' }); }
export function stopSession(){ return setSession({ state:'off', card_id:'' }); }

export function exportJSONCard(card){
  return new Blob([ JSON.stringify(card, null, 2) ], { type:'application/json' });
}

// --- SCENARIOS ---
import { newScenario, normalizeScenario } from './models.js';
import { getSession } from './reducers.js'; // si déjà exporté dans ce fichier, ignorer cet import croisé

export function listScenarios(mode='active', week=''){
  const s = readClientBlob();
  let arr = Array.isArray(s.scenarios)? s.scenarios.map(normalizeScenario) : [];
  if (mode==='active')   arr = arr.filter(x=>!x.state.deleted);
  if (mode==='deleted')  arr = arr.filter(x=>x.state.deleted);
  if (week)              arr = arr.filter(x=>x.week===week);
  return arr.sort((a,b)=> (b.working?-1:0) - (a.working?-1:0) || (b.state.updated_ts - a.state.updated_ts));
}

export function createScenario(part={}){
  const s = readClientBlob();
  const sc = newScenario(part);
  s.scenarios = Array.isArray(s.scenarios)? s.scenarios : [];
  s.scenarios.push(sc);
  writeClientBlob(s); commitWithEviction();
  appendJournal({ ts: Date.now(), type:'create', target:{kind:'scenario', id:sc.id}, payload:{ title: sc.title, week: sc.week }});
  return sc;
}

export function updateScenario(id, patch){
  const s = readClientBlob();
  const i = s.scenarios.findIndex(x=>x.id===id); if (i<0) return null;
  const cur = normalizeScenario(s.scenarios[i]);
  const next = normalizeScenario({ ...cur, ...patch, state:{ ...cur.state, updated_ts: Date.now() }});
  s.scenarios[i] = next;
  writeClientBlob(s); commitWithEviction();
  appendJournal({ ts: Date.now(), type:'update', target:{kind:'scenario', id}, payload: patch });
  return next;
}

export const softDeleteScenario = id => updateScenario(id, { state:{ deleted:true, updated_ts: Date.now() }});
export const restoreScenario    = id => updateScenario(id, { state:{ deleted:false, updated_ts: Date.now() }});

export function promoteScenario(id){
  const s = readClientBlob();
  s.scenarios = Array.isArray(s.scenarios)? s.scenarios : [];
  let promoted = null;
  s.scenarios = s.scenarios.map(sc=>{
    sc = normalizeScenario(sc);
    if (sc.id===id){ sc.working = true; promoted = sc; }
    else { sc.working = false; }
    sc.state.updated_ts = Date.now();
    return sc;
  });
  writeClientBlob(s); commitWithEviction();
  appendJournal({ ts: Date.now(), type:'update', target:{kind:'scenario', id}, payload:{ working:true }});
  return promoted;
}

export function addCardToScenario(scId, cardId, slot=''){
  const s = readClientBlob();
  const i = s.scenarios.findIndex(x=>x.id===scId); if (i<0) return null;
  const sc = normalizeScenario(s.scenarios[i]);
  sc.items = sc.items.concat([{ card_id: cardId, slot }]);
  sc.state.updated_ts = Date.now();
  s.scenarios[i] = sc; writeClientBlob(s); commitWithEviction();
  appendJournal({ ts: Date.now(), type:'update', target:{kind:'scenario', id:scId}, payload:{ add: { card_id: cardId, slot } }});
  return sc;
}

export function removeCardFromScenario(scId, cardId){
  const s = readClientBlob();
  const i = s.scenarios.findIndex(x=>x.id===scId); if (i<0) return null;
  const sc = normalizeScenario(s.scenarios[i]);
  sc.items = sc.items.filter(it=>it.card_id!==cardId);
  sc.state.updated_ts = Date.now();
  s.scenarios[i] = sc; writeClientBlob(s); commitWithEviction();
  appendJournal({ ts: Date.now(), type:'update', target:{kind:'scenario', id:scId}, payload:{ remove: { card_id: cardId } }});
  return sc;
}

/** Dupliquer la card courante (session) → nouvelle card */
export function duplicateCurrentCard(){
  const sess = getSession();
  const baseId = sess?.card_id;
  const s = readClientBlob();
  const src = (Array.isArray(s.items)? s.items : []).find(x=>x.id===baseId) || (Array.isArray(s.items)? s.items[0] : null);
  if (!src) return null;
  const copy = { ...src, id: undefined, title: (src.title||'Card')+' (copie)', state:{ ...src.state, deleted:false, updated_ts: Date.now() } };
  return createCard(copy);
}

/** Importer les propositions sélectionnées des cards du scénario → card courante (concat en bas de contenu) */
export function importSelectedToCurrentCard(scId){
  const sess = getSession();
  const targetId = sess?.card_id || (listCards('active','')[0]?.id);
  if (!targetId) return null;
  const s = readClientBlob();
  const sc = (Array.isArray(s.scenarios)? s.scenarios : []).find(x=>x.id===scId);
  if (!sc) return null;

  // agrège toutes les AI sélectionnées des cards du scénario
  const byId = new Map((s.items||[]).map(c=>[c.id, c]));
  const selected = [];
  (sc.items||[]).forEach(it=>{
    const c = byId.get(it.card_id); if (!c) return;
    (c.ai||[]).forEach(a=>{ if (a.selected || a.status==='ok') selected.push({ card: c.title, text: a.text }); });
  });

  if (!selected.length) return updateCard(targetId, { }); // no-op

  const bullets = '\n\n## Propositions importées\n'+selected.map(x=>`- (${x.card}) ${x.text}`).join('\n')+'\n';
  const tgt = (s.items||[]).find(x=>x.id===targetId);
  const newContent = (tgt?.content||'') + bullets;
  const res = updateCard(targetId, { content: newContent });
  appendJournal({ ts: Date.now(), type:'update', target:{kind:'card', id: targetId}, payload:{ imported_from: scId, count: selected.length }});
  return res;
}
