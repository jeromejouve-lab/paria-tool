// src/domain/reducers.js — cœur métier intégral (UI intouchée)
import { readClientBlob, writeClientBlob } from '../core/store.js';
import { appendJournal } from './journal.js';
import { newCard, normalizeCard, newScenario, normalizeScenario, now } from './models.js';
import { commitWithEviction } from '../core/budget.js';
import {
  listGitSnapshots, pushSnapshotToGit, fetchSnapshotFromGit,
  listDriveSnapshots, pushSnapshotToDrive, fetchSnapshotFromDrive
} from '../core/net.js';

// ====== CHARTER ======
export function getCharter(){
  const s = readClientBlob();
  return s.charter || { title:'', content:'', tags:[], ai:[], state:{deleted:false, updated_ts:now()} };
}
function _ensureCharter(){
  const s = readClientBlob();
  s.charter = s.charter || { title:'', content:'', tags:[], ai:[], state:{deleted:false, updated_ts:now()} };
  if (!Array.isArray(s.charter.ai)) s.charter.ai = [];
  return s;
}
export function saveCharter(patch){
  const s = _ensureCharter();
  s.charter = { ...s.charter, ...patch, state:{ ...(s.charter.state||{}), updated_ts: now() } };
  writeClientBlob(s); commitWithEviction();
  appendJournal({ type:'update', target:{kind:'charter', id:'charter'}, payload:patch });
  return s.charter;
}
export function softDeleteCharter(){ return saveCharter({ state:{ deleted:true, updated_ts:now() } }); }
export function restoreCharter(){ return saveCharter({ state:{ deleted:false, updated_ts:now() } }); }

export function addAItoCharter(part){
  const s = _ensureCharter();
  const a = {
    id: part?.id || `chai_${now()}`,
    component: part?.component || 'P',
    kind: 'paria',
    origin: part?.origin || 'gpt',
    status: part?.status || 'todo',
    text: part?.text || '',
    selected: !!part?.selected,
    ts: now()
  };
  s.charter.ai.push(a);
  s.charter.state = { ...(s.charter.state||{}), updated_ts: now() };
  writeClientBlob(s); commitWithEviction();
  appendJournal({ type:'ai-add', target:{kind:'charter', id:'charter'}, payload:{ id:a.id, component:a.component } });
  return a;
}
export function toggleCharterAIStatus(aiId, status){
  const s = _ensureCharter();
  const it = (s.charter.ai||[]).find(x=>x.id===aiId);
  if (!it) return null;
  it.status = status;
  if (status==='ok') it.selected = true;
  s.charter.state = { ...(s.charter.state||{}), updated_ts: now() };
  writeClientBlob(s); commitWithEviction();
  appendJournal({ type:'ai-status', target:{kind:'charter', id:'charter'}, payload:{ id:aiId, status } });
  return it;
}
export function removeCharterAI(aiId){
  const s = _ensureCharter();
  const before = (s.charter.ai||[]).length;
  s.charter.ai = (s.charter.ai||[]).filter(x=>x.id!==aiId);
  if ((s.charter.ai||[]).length===before) return false;
  s.charter.state = { ...(s.charter.state||{}), updated_ts: now() };
  writeClientBlob(s); commitWithEviction();
  appendJournal({ type:'ai-delete', target:{kind:'charter', id:'charter'}, payload:{ id:aiId } });
  return true;
}
export function setCharterAISelected(aiId, selected){
  const s = _ensureCharter();
  const it = (s.charter.ai||[]).find(x=>x.id===aiId);
  if (!it) return false;
  it.selected = !!selected;
  s.charter.state = { ...(s.charter.state||{}), updated_ts: now() };
  writeClientBlob(s); commitWithEviction();
  return true;
}
export function importCharterSelectedToCurrentCard(){
  const s = _ensureCharter();
  const selected = (s.charter.ai||[]).filter(a => a.selected || a.status==='ok');
  if (!selected.length) return false;

  const id = s?.meta?.session?.card_id || (s.items||[]).find(x=>!x.state?.deleted)?.id;
  if (!id) return false;

  const idx = (s.items||[]).findIndex(x=>x.id===id);
  if (idx<0) return false;
  const cur = normalizeCard(s.items[idx]);

  const block =
`\n\n## PARIA – Propositions sélectionnées (${new Date().toLocaleString()})
${selected.map(a=>`- (${a.component}) ${a.text}`).join('\n')}
`;
  const next = { ...cur, content: (cur.content||'') + block, state:{ ...(cur.state||{}), updated_ts: now() } };
  s.items[idx] = next;
  writeClientBlob(s); commitWithEviction();
  appendJournal({ type:'import', target:{kind:'card', id}, payload:{ from:'charter', count:selected.length } });
  return true;
}

// ====== CARDS ======
export function listCards(scope='active', query=''){
  const s = readClientBlob();
  let arr = (s.items||[]).map(normalizeCard);
  if (scope==='active')  arr = arr.filter(c=>!c.state?.deleted);
  if (scope==='deleted') arr = arr.filter(c=> c.state?.deleted);
  if (scope==='recent')  arr = arr.sort((a,b)=>(b.state.updated_ts||0)-(a.state.updated_ts||0));
  const q = (query||'').toLowerCase().trim();
  if (q) arr = arr.filter(c =>
    (c.title||'').toLowerCase().includes(q) ||
    (c.content||'').toLowerCase().includes(q) ||
    (c.tags||[]).join(',').toLowerCase().includes(q)
  );
  return arr;
}
export function createCard(part={}){
  const s = readClientBlob();
  s.items = Array.isArray(s.items)?s.items:[];
  const c = newCard(part);
  s.items.push(c);
  writeClientBlob(s); commitWithEviction();
  appendJournal({ type:'create', target:{kind:'card', id:c.id}, payload:{ title:c.title } });
  return c;
}
export function updateCard(id, patch){
  const s = readClientBlob();
  const idx = (s.items||[]).findIndex(c=>c.id===id);
  if (idx<0) return null;
  const cur = normalizeCard(s.items[idx]);
  const next = { ...cur, ...patch, state:{ ...(cur.state||{}), ...(patch?.state||{}), updated_ts: now() } };
  s.items[idx] = next;
  writeClientBlob(s); commitWithEviction();
  appendJournal({ type:'update', target:{kind:'card', id}, payload:patch });
  return next;
}
export const softDeleteCard = id => updateCard(id, { state:{ deleted:true,  updated_ts: now(), deleted_at: now(), deleted_by:'me' } });
export const restoreCard    = id => updateCard(id, { state:{ deleted:false, updated_ts: now(), deleted_at:0,   deleted_by:''   } });

export function openCard(id){
  const s = readClientBlob();
  s.meta = s.meta || {};
  s.meta.session = { ...(s.meta.session||{}), card_id:id, updated_ts: now() };
  writeClientBlob(s); commitWithEviction();
  appendJournal({ type:'session', target:{kind:'session', id:'current'}, payload:{ card_id:id }});
  return id;
}

// IA sur Card
export function addAItoCard(id, part){
  const s = readClientBlob();
  const idx = (s.items||[]).findIndex(c=>c.id===id);
  if (idx<0) return null;
  const card = normalizeCard(s.items[idx]);
  const a = {
    id: part?.id || `ai_${now()}`,
    component: part?.component || 'P',
    kind: 'paria',
    origin: part?.origin || 'gpt',
    status: part?.status || 'todo',
    text: part?.text || '',
    selected: !!part?.selected,
    ts: now()
  };
  card.ai = (card.ai||[]).concat([a]);
  card.state = { ...(card.state||{}), updated_ts: now() };
  s.items[idx] = card;
  writeClientBlob(s); commitWithEviction();
  appendJournal({ type:'ai-add', target:{kind:'card', id}, payload:{ aiId:a.id, component:a.component }});
  return card;
}
export function toggleAIStatus(id, aiId, status){
  const s = readClientBlob();
  const idx = (s.items||[]).findIndex(c=>c.id===id);
  if (idx<0) return null;
  const card = normalizeCard(s.items[idx]);
  const it = (card.ai||[]).find(a=>a.id===aiId);
  if (!it) return null;
  it.status = status;
  if (status==='ok') it.selected = true;
  card.state = { ...(card.state||{}), updated_ts: now() };
  s.items[idx] = card;
  writeClientBlob(s); commitWithEviction();
  appendJournal({ type:'ai-status', target:{kind:'card', id}, payload:{ aiId, status }});
  return card;
}
export function removeCardAI(id, aiId){
  const s = readClientBlob();
  const idx = (s.items||[]).findIndex(c=>c.id===id);
  if (idx<0) return false;
  const card = normalizeCard(s.items[idx]);
  const before = (card.ai||[]).length;
  card.ai = (card.ai||[]).filter(a=>a.id!==aiId);
  if ((card.ai||[]).length===before) return false;
  card.state = { ...(card.state||{}), updated_ts: now() };
  s.items[idx] = card;
  writeClientBlob(s); commitWithEviction();
  appendJournal({ type:'ai-delete', target:{kind:'card', id}, payload:{ aiId }});
  return true;
}
export const toggleCardAIStatus = (id, aiId, status)=> toggleAIStatus(id, aiId, status);
// alias anti-écart éventuel d'UI
export const removecardai = removeCardAI;

// ====== SESSION / PROJECTOR ======
export function getSession(){
  const s = readClientBlob();
  return s?.meta?.session || { status:'idle', card_id:'', started_ts:0, stopped_ts:0, updated_ts: now(), comments:[], annotations:[] };
}
export function setSession(patch){
  const s = readClientBlob();
  s.meta = s.meta || {};
  const base = s.meta.session || { status:'idle', card_id:'', started_ts:0, stopped_ts:0, updated_ts: now(), comments:[], annotations:[] };
  s.meta.session = { ...base, ...patch, updated_ts: now() };
  writeClientBlob(s); commitWithEviction();
  appendJournal({ type:'session', target:{kind:'session', id:'current'}, payload:{ status:s.meta.session.status, card_id:s.meta.session.card_id }});
  return s.meta.session;
}
export const startSession = (card_id)=> setSession({ status:'live',  card_id, started_ts: (getSession().started_ts||now()) });
export const pauseSession = ()=> setSession({ status:'pause' });
export const stopSession  = ()=> setSession({ status:'idle',  stopped_ts: now() });

export function addSessionComment({ text='', actor='moi' }){
  const s = readClientBlob();
  const sess = getSession();
  const c = { id:`sc_${now()}`, ts: now(), actor, text };
  sess.comments = Array.isArray(sess.comments)?sess.comments:[];
  sess.comments.push(c);
  s.meta.session = sess;
  writeClientBlob(s); commitWithEviction();
  appendJournal({ type:'session-note', target:{kind:'session', id:'current'}, payload:{ id:c.id, actor }});
  return c;
}
export function listSessionComments(){ return getSession().comments || []; }

// ====== SCENARIOS ======
export function listScenarios(scope='active', week=''){
  const s = readClientBlob();
  let arr = (s.scenarios||[]).map(normalizeScenario);
  if (scope==='active')  arr = arr.filter(x=>!x.state?.deleted);
  if (scope==='deleted') arr = arr.filter(x=> x.state?.deleted);
  if (week) arr = arr.filter(x=>x.week===week);
  return arr.sort((a,b)=>(b.working?-1:0)-(a.working?-1:0) || (b.state.updated_ts-a.state.updated_ts));
}
export function createScenario(part={}){
  const s = readClientBlob();
  s.scenarios = Array.isArray(s.scenarios)?s.scenarios:[];
  const sc = newScenario(part);
  s.scenarios.push(sc);
  writeClientBlob(s); commitWithEviction();
  appendJournal({ type:'create', target:{kind:'scenario', id:sc.id}, payload:{ title:sc.title, week:sc.week }});
  return sc;
}
export function updateScenario(id, patch){
  const s = readClientBlob();
  const idx = (s.scenarios||[]).findIndex(x=>x.id===id);
  if (idx<0) return null;
  const cur = normalizeScenario(s.scenarios[idx]);
  const next = { ...cur, ...patch, state:{ ...(cur.state||{}), ...(patch?.state||{}), updated_ts: now() } };
  s.scenarios[idx] = next;
  writeClientBlob(s); commitWithEviction();
  appendJournal({ type:'update', target:{kind:'scenario', id}, payload:patch });
  return next;
}
export const softDeleteScenario = id => updateScenario(id, { state:{ deleted:true,  updated_ts: now() } });
export const restoreScenario    = id => updateScenario(id, { state:{ deleted:false, updated_ts: now() } });

export function promoteScenario(id){
  // Spéc: snapshot + journal + *écrasement* de la Card courante par le scénario
  const s = readClientBlob();
  const sessId = s?.meta?.session?.card_id || (s.items||[]).find(x=>!x.state?.deleted)?.id;
  const sc = (s.scenarios||[]).find(x=>x.id===id);
  if (!sessId || !sc) return null;

  // 1) journal "promote"
  appendJournal({ type:'promote', target:{kind:'scenario', id}, payload:{ target_card:sessId } });

  // 2) construire contenu depuis sélection (AI ok/selected) de TOUTES les cards du scénario
  const selected = [];
  (sc.cards||[]).forEach(ref=>{
    const card = (s.items||[]).find(c=>c.id===ref.card_id);
    (card?.ai||[]).forEach(a=>{ if (a.status==='ok' || a.selected) selected.push({ from:card.title, text:a.text, component:a.component }); });
  });
  const block =
`# ${sc.title || 'Scénario'}

## Sélection du scénario (${new Date().toLocaleString()})
${selected.map(x=>`- (${x.component}) ${x.text} — source: ${x.from}`).join('\n') || '- (aucune sélection)'}
`;

  // 3) écraser le contenu de la card courante (snapshot géré côté endpoints de backup à l'action utilisateur)
  const idx = (s.items||[]).findIndex(x=>x.id===sessId);
  const cur = normalizeCard(s.items[idx]);
  const next = { ...cur, content:block, state:{ ...(cur.state||{}), updated_ts: now() } };
  s.items[idx] = next;
  writeClientBlob(s); commitWithEviction();

  return updateScenario(id, { working:true });
}

export function addCardToScenario(scId, cardId, slot=''){
  const s = readClientBlob();
  const idx = (s.scenarios||[]).findIndex(x=>x.id===scId);
  if (idx<0) return null;
  const sc = normalizeScenario(s.scenarios[idx]);
  sc.cards = Array.isArray(sc.cards)?sc.cards:[];
  sc.cards.push({ card_id:cardId, slot });
  sc.state = { ...(sc.state||{}), updated_ts: now() };
  s.scenarios[idx] = sc;
  writeClientBlob(s); commitWithEviction();
  appendJournal({ type:'scenario-add-card', target:{kind:'scenario', id:scId}, payload:{ card_id:cardId, slot }});
  return sc;
}
export function removeCardFromScenario(scId, cardId){
  const s = readClientBlob();
  const idx = (s.scenarios||[]).findIndex(x=>x.id===scId);
  if (idx<0) return null;
  const sc = normalizeScenario(s.scenarios[idx]);
  const before = (sc.cards||[]).length;
  sc.cards = (sc.cards||[]).filter(x=>x.card_id!==cardId);
  if ((sc.cards||[]).length===before) return sc;
  sc.state = { ...(sc.state||{}), updated_ts: now() };
  s.scenarios[idx] = sc;
  writeClientBlob(s); commitWithEviction();
  appendJournal({ type:'scenario-remove-card', target:{kind:'scenario', id:scId}, payload:{ card_id:cardId }});
  return sc;
}
export function duplicateCurrentCard(){
  const s = readClientBlob();
  const baseId = s?.meta?.session?.card_id || ((s.items||[]).find(x=>!x.state?.deleted)?.id);
  if (!baseId) return null;
  const baseIdx = (s.items||[]).findIndex(x=>x.id===baseId);
  const src = normalizeCard(s.items[baseIdx]);
  const copy = newCard({ title:`${src.title} (copie)`, content:src.content, tags:src.tags });
  s.items.push(copy);
  writeClientBlob(s); commitWithEviction();
  appendJournal({ type:'create', target:{kind:'card', id:copy.id}, payload:{ from:baseId }});
  return copy;
}
export function importSelectedToCurrentCard(scId){
  const s = readClientBlob();
  const sessId = s?.meta?.session?.card_id || ((s.items||[]).find(x=>!x.state?.deleted)?.id);
  if (!sessId) return false;
  const sc = (s.scenarios||[]).find(x=>x.id===scId);
  if (!sc) return false;

  const selected = [];
  (sc.cards||[]).forEach(ref=>{
    const card = (s.items||[]).find(c=>c.id===ref.card_id);
    (card?.ai||[]).forEach(a=>{ if (a.status==='ok' || a.selected) selected.push({ from:card.title, text:a.text, component:a.component }); });
  });

  const idx = (s.items||[]).findIndex(x=>x.id===sessId);
  const cur = normalizeCard(s.items[idx]);
  const block =
`\n\n## Scénario – Sélection (${new Date().toLocaleString()})
${selected.map(x=>`- (${x.component}) ${x.text}  —  source: ${x.from}`).join('\n') || '- (aucune)'}
`;
  const next = { ...cur, content:(cur.content||'')+block, state:{ ...(cur.state||{}), updated_ts: now() } };
  s.items[idx] = next;
  writeClientBlob(s); commitWithEviction();
  appendJournal({ type:'import', target:{kind:'card', id:sessId}, payload:{ from:`scenario:${scId}`, count:selected.length }});
  return true;
}

// ====== BACKUPS (sélection/restauration remote) ======
export async function listSnapshots(where='git'){
  if (where==='git')   return await listGitSnapshots();
  if (where==='drive') return await listDriveSnapshots();
  return [];
}

// snapshot = { id, ts, label, blob }
// blob = JSON.stringify(state courant)
export async function saveSnapshotRemote({ label='', where='git' }={}){
  const blob = JSON.stringify(readClientBlob());
  const snap = { id: `snap_${now()}`, ts: now(), label: label||new Date().toLocaleString(), blob };
  let out = { ok:true };
  if (where==='git')   out = await pushSnapshotToGit(snap);
  if (where==='drive') out = await pushSnapshotToDrive(snap);
  appendJournal({ type:'snapshot-save', target:{kind:'snapshot', id:snap.id}, payload:{ where, label:snap.label }});
  return out;
}

export async function restoreSnapshotRemote({ id, where='git' }={}){
  const snap = (where==='git') ? await fetchSnapshotFromGit(id) : await fetchSnapshotFromDrive(id);
  if (!snap || !snap.blob) throw new Error('snapshot introuvable');
  const json = JSON.parse(snap.blob);
  writeClientBlob(json);
  appendJournal({ type:'snapshot-restore', target:{kind:'snapshot', id}, payload:{ where }});
  return true;
}

/*
INDEX reducers.js:
- Charter: getCharter, saveCharter, softDeleteCharter, restoreCharter, addAItoCharter, toggleCharterAIStatus, removeCharterAI, setCharterAISelected, importCharterSelectedToCurrentCard
- Cards: listCards, createCard, updateCard, softDeleteCard, restoreCard, openCard, addAItoCard, toggleAIStatus, removeCardAI, toggleCardAIStatus (alias), removecardai (alias)
- Session/Projector: getSession, setSession, startSession, pauseSession, stopSession, addSessionComment, listSessionComments
- Scenarios: listScenarios, createScenario, updateScenario, softDeleteScenario, restoreScenario, promoteScenario, addCardToScenario, removeCardFromScenario, duplicateCurrentCard, importSelectedToCurrentCard
- Backups: listSnapshots(where), saveSnapshotRemote({label,where}), restoreSnapshotRemote({id,where})
*/
