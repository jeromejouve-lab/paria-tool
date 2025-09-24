// PARIA-V2-CLEAN v1.0.0 | domain/reducers.js
import { readClientBlob, writeClientBlob } from '../core/store.js';
import { logEvent } from './journal.js';
import { bootstrapWorkspace } from '../core/net.js';
import { buildWorkId } from '../core/settings.js';
import { ghContentsUrl, ghHeaders } from '../core/net.js';

// ---- Cards v2: sections + updates (append-only) ----
function _dayKey(ts){ const d=new Date(ts); return `${d.getFullYear()}-${(d.getMonth()+1+'').padStart(2,'0')}-${(d.getDate()+'').padStart(2,'0')}`; }
function _ensureSeq(b,key){ b.seq=b.seq||{}; b.seq[key]=(b.seq[key]||0)+1; return b.seq[key]; }

// --- reducers.js ---
//export const buildWorkId = (S, dateStr)=>
//  `${(S.client||'').trim()}|${(S.service||'').trim()}|${dateStr}`;

export function backupFlushLocal() {
  const S = JSON.parse(localStorage.getItem('paria.settings')||'{}');
  const date = document.querySelector('#work-date')?.value || new Date().toISOString().slice(0,10);
  const workId = buildWorkId(S, date);

  const qs = s=>document.querySelector(s);
  const csv = s=>(s||'').split(',').map(x=>x.trim()).filter(Boolean);
  const charter = {
    title: qs('#charter-title')?.value?.trim()||'',
    content: qs('#charter-content')?.value||'',
    tags: csv(qs('#charter-tags')?.value),
    updated_ts: Date.now()
  };
  const cards = JSON.parse(localStorage.getItem('paria.cards')||'[]');
  const now = Date.now(); const index={};
  for (const c of cards){ const st=c.state||{};
    index[c.id] = { id:c.id, title:c.title||'', state:{active:!!st.active,paused:!!st.paused,deleted:!!st.deleted},
      updated_ts:c.updated_ts||now, last_open_ts:st.last_open_ts||now, parent_id:c.parent_id||null };
  }
  const profile = {
    name: qs('#client-name')?.value?.trim()||'',
    headcount: Number(qs('#client-headcount')?.value)||null,
    languages: csv(qs('#client-languages')?.value),
    tone: qs('#client-tone')?.value?.trim()||'',
    description: qs('#client-desc')?.value||'',
    goals: csv(qs('#client-goals')?.value),
    challenges: csv(qs('#client-challenges')?.value),
    constraints: csv(qs('#client-constraints')?.value)
  };
  localStorage.setItem(`paria.client.${S.client}.profile`, JSON.stringify(profile));

  const tabs = JSON.parse(localStorage.getItem('paria.tabs')||'null') || { cards:'on', seance:'off', projector:'off' };
  const blob = { workId, profile, charter, cards, index, tabs, meta:{schema:'v1', snapshot_at:new Date().toISOString()} };
  localStorage.setItem('paria.blob', JSON.stringify(blob));
  return blob;
}

export async function backupPushGit() {
  const S = JSON.parse(localStorage.getItem('paria.settings')||'{}');
  const {git_owner:o,git_repo:r,git_branch:b='main',git_token:t,client:c,service:s} = S;
  if (!o||!r||!t||!c||!s) throw new Error('conf git incomplète');
  const blob = JSON.parse(localStorage.getItem('paria.blob')||'{}');
  const DATE = blob.workId?.split('|')[2] || new Date().toISOString().slice(0,10);
  const pad2=n=>String(n).padStart(2,'0'), pad3=n=>String(n).padStart(3,'0');
  const d=new Date(); const stamp=`${DATE}_${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}-${pad3(d.getMilliseconds())}`;
  const path = ['clients', c, s, DATE, `backup-${stamp}.json`];
  const url  = ghContentsUrl(o,r,b, ...path);
  const enc = s=>{const u=new TextEncoder().encode(s);let bin='';for(let i=0;i<u.length;i++)bin+=String.fromCharCode(u[i]);return btoa(bin);};
  const payload = { workId: blob.workId, data:{ profile:blob.profile, charter:blob.charter, cards:blob.cards, index:blob.index, tabs:blob.tabs } };
  const res = await fetch(url.replace(/\?ref=.*/,''), { // PUT n'a pas besoin de ?ref
    method:'PUT',
    headers:{...ghHeaders(t),'Content-Type':'application/json'},
    body: JSON.stringify({ message:`backup ${blob.workId}`, content: enc(JSON.stringify(payload,null,2)), branch:b })
  });
  if (!res.ok) throw new Error(await res.text());
  return { path: path.join('/'), stamp };
}

export async function backupsList(dateStr, timeHHmm='') {
  const S = JSON.parse(localStorage.getItem('paria.settings')||'{}');
  const {git_owner:o,git_repo:r,git_branch:b='main',git_token:t,client:c,service:s} = S;
  const listUrl = ghContentsUrl(o,r,b,'clients',c,s,dateStr);
  const r1 = await fetch(listUrl, { headers: ghHeaders(t) });
  if (!r1.ok) throw new Error(`Git ${r1.status}`);
  const items = (await r1.json()).filter(x=>x.type==='file');
  const re=/^(backup|snapshot)-(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})(?:-(\d{3}))?\.json$/;
  let out = items.filter(x=>re.test(x.name)).map(x=>{
    const m=x.name.match(re); const hh=+m[3], mm=+m[4];
    return { name:x.name, path:x.path, hh, mm, url: ghContentsUrl(o,r,b, ...x.path.split('/')) };
  }).sort((a,b)=> (a.name<b.name?1:-1));
  if (/^\d{2}:\d{2}$/.test(timeHHmm)) { const [H,M]=timeHHmm.split(':').map(Number); out = out.filter(i=> i.hh>H || (i.hh===H && i.mm>=M)); }
  return out;
}

export async function restoreFromGit(fileUrl) {
  const S = JSON.parse(localStorage.getItem('paria.settings')||'{}');
  const t = S.git_token; const dec = b64=>{const bin=atob((b64||'').replace(/\n/g,''));const u8=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);return new TextDecoder().decode(u8);};
  const r = await fetch(fileUrl, { headers: ghHeaders(t) });
  if (!r.ok) throw new Error(`Git ${r.status}`);
  const meta = await r.json(); const snap = JSON.parse(dec(meta.content||''));
  const blob = { workId:snap.workId, ...snap.data, meta:{...snap.meta, restored_at:new Date().toISOString()} };
  localStorage.setItem('paria.blob', JSON.stringify(blob));
  // on garde paria.settings intact
  return blob;
}

export function migrateCards_v2(){
  const b = readClientBlob();
  if (!Array.isArray(b.cards)) return;
  let changed=false;
  for (const c of b.cards){
    c.sections = c.sections || [];       // [{id,title}]
    c.updates  = c.updates  || [];       // [{id,section_id,ts,origin,type,md?,html?}]
    c.ui       = c.ui       || {filters:{}};
    if (!c.created_ts) { c.created_ts = Date.now(); changed=true; }
    if (!c.updated_ts) { c.updated_ts = c.created_ts; changed=true; }
  }
  if (changed) writeClientBlob(b);
}

export function ensureSection(cardId, sectionId, title){
  const b = readClientBlob();
  const c = (b.cards||[]).find(x=>String(x.id)===String(cardId));
  if (!c) return false;
  c.sections = c.sections||[];
  if (!c.sections.find(s=>String(s.id)===String(sectionId))){
    c.sections.push({id:sectionId, title: title||('Section '+sectionId)});
    writeClientBlob(b);
  }
  return true;
}

export function touchCard(cardId){
  const b = readClientBlob();
  const c = (b.cards||[]).find(x=>String(x.id)===String(cardId));
  if (!c) return false;
  c.updated_ts = Date.now();
  b.journal = b.journal||[];
  b.journal.push({type:'card.touched', card_id:cardId, ts:c.updated_ts});
  writeClientBlob(b);
  return true;
}

export function appendCardUpdate(cardId, sectionId, payload){
  const b = readClientBlob();
  const c = (b.cards||[]).find(x=>String(x.id)===String(cardId));
  if (!c) return null;
  c.sections = c.sections||[];
  if (!c.sections.find(s=>String(s.id)===String(sectionId))){
    c.sections.push({id:sectionId, title: payload?.section_title||('Section '+sectionId)});
  }
  c.updates = c.updates||[];
  const id = _ensureSeq(b, 'updates_id');
  const u = {
    id, section_id: sectionId,
    ts: payload?.ts || Date.now(),
    origin: payload?.origin || 'client',
    type: payload?.type   || 'note',
    md:   payload?.md || null,
    html: payload?.html || null,
    meta: payload?.meta || null
  };
  c.updates.push(u);
  c.updated_ts = Date.now();
  b.journal = b.journal||[];
  b.journal.push({type:'card.section.appended', card_id:cardId, section_id:sectionId, update_id:id, ts:c.updated_ts});
  writeClientBlob(b);
  maybeImmediateBackup();
  return id;
}

export function setSectionFilters(cardId, sectionId, filters){
  const b = readClientBlob();
  const c = (b.cards||[]).find(x=>String(x.id)===String(cardId));
  if (!c) return false;
  c.ui = c.ui||{filters:{}};
  c.ui.filters = c.ui.filters||{};
  c.ui.filters[sectionId] = { days: filters.days||[], types: filters.types||[] };
  writeClientBlob(b);
  return true;
}

export function listCardDays(cardId, sectionId){
  const b = readClientBlob();
  const c = (b.cards||[]).find(x=>String(x.id)===String(cardId));
  if(!c) return [];
  const days = new Set();

  for(const u of (c.updates||[])){
    if (String(u.section_id)!==String(sectionId)) continue;
    const d = new Date(u.ts||c.updated_ts||c.created_ts||Date.now());
    const m = String(d.getMonth()+1).padStart(2,'0');
    const dd= String(d.getDate()).padStart(2,'0');
    days.add(`${d.getFullYear()}-${m}-${dd}`);
  }

  // + toujours created_ts en plus des updates (même s'il y a déjà des jours)
  if (c.created_ts){
    const d = new Date(c.created_ts);
    const m = String(d.getMonth()+1).padStart(2,'0');
    const dd= String(d.getDate()).padStart(2,'0');
    days.add(`${d.getFullYear()}-${m}-${dd}`);
  }
  return Array.from(days).sort();

}

export function getCardView(cardId, {sectionId, days=[], types=[]}={}){
  const b = readClientBlob();
  const c = (b.cards||[]).find(x=>String(x.id)===String(cardId));
  if (!c) return {section:null, groups:[]};
  const section = (c.sections||[]).find(s=>String(s.id)===String(sectionId));
  const filtDays  = new Set(days||[]);
  const filtTypes = new Set((types&&types.length)?types: ['analyse','note','comment','client_md','client_html']);
  const items = (c.updates||[]).filter(u=>{
    if (String(u.section_id)!==String(sectionId)) return false;
    if (!filtTypes.has(u.type)) return false;
    if (filtDays.size && !filtDays.has(_dayKey(u.ts))) return false;
    return true;
  }).sort((a,b)=>a.ts<b.ts?1:-1);
  const groups = [];
  let curKey=null, cur=[];
  for (const it of items){
    const k=_dayKey(it.ts);
    if (k!==curKey){ if (cur.length) groups.push({day:curKey, items:cur}); curKey=k; cur=[]; }
    cur.push(it);
  }
  if (cur.length) groups.push({day:curKey, items:cur});
  return {section, groups};
}

const uid = () => Math.random().toString(36).slice(2)+Date.now().toString(36);

// [ADD] Profil Client — persistant par client (transverse à tous les services)
export function readClientProfile(client){
  try { return JSON.parse(localStorage.getItem(`paria.client.${client}.profile`) || '{}'); }
  catch { return {}; }
}
export function writeClientProfile(client, data){
  localStorage.setItem(`paria.client.${client}.profile`, JSON.stringify(data || {}));
  logEvent('client/profile_save', { kind:'client', id:client });
  return true;
}

// --- Cards (v2: cards + updates) — remplace le bloc items
export function listCards(){
  return (readClientBlob().cards||[]);
}

export function createCard({title='',content='',tags=[]}={}){
  const b = readClientBlob();
  b.cards = b.cards || [];
  b.seq   = b.seq   || {};
  b.seq.cards_id = b.seq.cards_id || 0;

  const id = (++b.seq.cards_id);
  const card = {
    id,
    // NEW: fallback propre depuis le Charter si title est vide
    title: title || (b.charter?.title || (b.charter?.service ? b.charter.service : 'Sans titre')),
    tags: [...tags],            // FIX: pas " [.tags] "
    content: content || '',
    state: { deleted:false, think:false },
    created_ts: Date.now(),
    updated_ts: Date.now(),
    sections: [],
    updates: []
  };
  b.cards.push(card);
  writeClientBlob(b);
  logEvent('card/create',{kind:'card',id});
  maybeImmediateBackup();
  return id;
}

export function updateCard(id, patch={}){
  const b = readClientBlob();
  const it = (b.cards||[]).find(c=>String(c.id)===String(id));
  if(!it) return false;
  Object.assign(it, patch);
  it.updated_ts = Date.now();
  writeClientBlob(b);
  logEvent('card/update',{kind:'card',id});
  return true;
}

export function softDeleteCard(id, deleted=true){
  const b = readClientBlob();
  const it = (b.cards||[]).find(c=>String(c.id)===String(id));
  if(!it) return false;
  it.state = { ...(it.state||{}), deleted: !!deleted };
  it.updated_ts = Date.now();
  writeClientBlob(b);
  logEvent(deleted?'card/remove':'card/restore',{kind:'card',id});
  return true;
}

export function restoreCard(id){ return softDeleteCard(id,false); }

export function toggleThink(id, v=null){
  const b = readClientBlob();
  const it = (b.cards||[]).find(c=>String(c.id)===String(id));
  if(!it) return false;
  const nv = (v==null)? !it.state?.think : !!v;
  it.state = { ...(it.state||{}), think: nv };
  it.updated_ts = Date.now();
  writeClientBlob(b);
  logEvent('card/think',{kind:'card',id},{value:nv});
  return true;
}

export function saveWorkset({ title='Sélection', card_ids=[] } = {}){
  const b = readClientBlob();
  b.worksets = b.worksets || [];
  b.seq = b.seq || {};
  b.seq.worksets_id = b.seq.worksets_id || 0;
  const id = (++b.seq.worksets_id);
  const ws = { id, title, card_ids: Array.from(new Set(card_ids.map(String))), created_ts: Date.now() };
  b.worksets.push(ws);
  writeClientBlob(b);
  logEvent('workset/save', { kind:'workset', id }, { card_ids: ws.card_ids });
  maybeImmediateBackup();
  return id;
}
export function listWorksets(){
  const b = readClientBlob();
  return b.worksets || [];
}

// Notes/Commentaires → deviennent des updates
export function addNote(id, {author='moi', text=''}){
  ensureSection(id,'1','Proposition 1');
  appendCardUpdate(id,'1',{ origin:'client', type:'note', md:text, meta:{author} });
  touchCard(id);
  return true;
}
export function addComment(id, {author='moi', text=''}){
  ensureSection(id,'1','Proposition 1');
  appendCardUpdate(id,'1',{ origin:'client', type:'comment', md:text, meta:{author} });
  touchCard(id);
  return true;
}

// Compat “AI” (ancien) → on append des updates d’analyse
export function addAItoCard(id, list=[]){
  ensureSection(id,'1','Proposition 1');
  for (const it of (list||[])){
    appendCardUpdate(id,'1',{
      origin:'charter',
      type:'analyse',
      md: it?.content || '',
      meta:{ title:it?.title||'', tags:it?.tags||[], think:!!(it?.state?.think) }
    });
  }
  touchCard(id);
  return true;
}
export function toggleCardAIStatus(){ return true; } // no-op v2 (compat)
export function removeCardAI(){ return true; }       // no-op v2 (compat)

// --- Charter
export function getCharter(){ return readClientBlob().charter; }
export function saveCharter(patch){ const b=readClientBlob(); b.charter={ ...(b.charter||{}), ...patch, state:{ ...(b.charter?.state||{}), updated_ts:Date.now() } }; writeClientBlob(b); logEvent('charter/update',{kind:'charter',id:'_'}); return true; }
export function setCharterAISelected(aiId, val){ const b=readClientBlob(); b.charter.ai=(b.charter.ai||[]).map(p=>p.id===aiId?({...p,state:{...(p.state||{}),selected:!!val,updated_ts:Date.now()}}):p); writeClientBlob(b); logEvent('charter/select',{kind:'charter',id:'_'},{aiId,selected:!!val}); return true; }
export function toggleCharterAIStatus(aiId,key){ const b=readClientBlob(); b.charter.ai=(b.charter.ai||[]).map(p=>p.id===aiId?({...p,state:{...(p.state||{}),[key]:!p.state?.[key],updated_ts:Date.now()}}):p); writeClientBlob(b); logEvent('charter/ai-flag',{kind:'charter',id:'_'},{aiId,key}); return true; }
export function removeCharterAI(aiId){ const b=readClientBlob(); b.charter.ai=(b.charter.ai||[]).map(p=>p.id===aiId?({...p,state:{...(p.state||{}),deleted:true,updated_ts:Date.now()}}):p); writeClientBlob(b); logEvent('charter/ai-remove',{kind:'charter',id:'_'},{aiId}); return true; }
export function pushSelectedCharterToCards(){
  const b = readClientBlob();

  // --- source sélection : prioriser paria.charter (même source que l'UI) ---
  const chLocal = (()=>{ try{ return JSON.parse(localStorage.getItem('paria.charter')||'{}'); }catch{ return {}; } })();
  const chBlob  = b.charter || {};
  const chSrc   = (Array.isArray(chLocal.ai) && chLocal.ai.length>=0) ? chLocal : chBlob;

  // sélection effective
  const sel = (chSrc.ai||[]).filter(p => p?.state?.selected && !p?.state?.deleted);
  if (!sel.length) return 0;

  // init structures blob
  b.cards = b.cards || [];
  b.seq   = b.seq   || {};
  b.seq.cards_id   = b.seq.cards_id   || 0;
  b.seq.updates_id = b.seq.updates_id || 0;

  let count = 0;

  for (const p of sel){
    // 1) nouvelle card
    const cardId = (++b.seq.cards_id);
    const sectionId = String(p.id||'1');

    const card = {
      id: cardId,
      title:   chSrc?.title || (chSrc?.service ? `Service: ${chSrc.service}` : (p.title || '')),
      tags:    Array.isArray(p.tags) ? p.tags : [],
      content: p.content || '',                        // vue "courante" minimale
      state:   { think: !!(p?.state?.think) },
      created_ts: p.ts || Date.now(),
      updated_ts: p.ts || Date.now(),
      origin: { kind:'charter', ai_id:String(p.id||''), pushed_ts: Date.now() },
      sections: [{ id: sectionId, title: p.title || 'Proposition' }],
      updates:  []
    };

    // 2) première update = ANALYSE IA (avec prompt + penser)
    const updId = (++b.seq.updates_id);
    card.updates.push({
      id: updId,
      section_id: sectionId,
      ts: p.ts || Date.now(),
      origin: 'charter',
      type: 'analyse',
      md: p.content || '',
      html: null,
      meta: { prompt: p.prompt || chSrc.last_prompt || null, think: !!(p?.state?.think) }
    });

    b.cards.push(card);
    count++;
  }

  writeClientBlob(b);
  return count;
}

export function restoreCharter(){ const b=readClientBlob(); b.charter.state={...(b.charter?.state||{}),deleted:false,updated_ts:Date.now()}; writeClientBlob(b); logEvent('charter/restore',{kind:'charter',id:'_'}); return true; }

// --- Scénarios
export function listScenarios(){ return (readClientBlob().scenarios||[]).filter(s=>!s?.state?.deleted); }
export function createScenario({title='Scénario',cards=[]}={}){
  const b=readClientBlob(); const id=uid(); b.scenarios.push({ id, title, cards: cards.map(cid=>({card_id:cid})), ai:[], state:{deleted:false,updated_ts:Date.now()} }); writeClientBlob(b); logEvent('scenario/create',{kind:'scenario',id}); return id;
}
export function updateScenario(id,patch){ const b=readClientBlob(); const sc=(b.scenarios||[]).find(s=>s.id===id); if(!sc) return false; Object.assign(sc,patch); sc.state={...(sc.state||{}),updated_ts:Date.now()}; writeClientBlob(b); logEvent('scenario/update',{kind:'scenario',id}); return true; }
export function addCardToScenario(id,cardId){ const b=readClientBlob(); const sc=(b.scenarios||[]).find(s=>s.id===id); if(!sc) return false; sc.cards=sc.cards||[]; if(!sc.cards.find(x=>x.card_id===cardId)) sc.cards.push({card_id:cardId}); sc.state={...(sc.state||{}),updated_ts:Date.now()}; writeClientBlob(b); logEvent('scenario/add-card',{kind:'scenario',id},{cardId}); return true; }
export function removeCardFromScenario(id,cardId){ const b=readClientBlob(); const sc=(b.scenarios||[]).find(s=>s.id===id); if(!sc) return false; sc.cards=(sc.cards||[]).filter(x=>x.card_id!==cardId); sc.state={...(sc.state||{}),updated_ts:Date.now()}; writeClientBlob(b); logEvent('scenario/remove-card',{kind:'scenario',id},{cardId}); return true; }
export function softDeleteScenario(id){ const b=readClientBlob(); const sc=(b.scenarios||[]).find(s=>s.id===id); if(!sc) return false; sc.state={...(sc.state||{}),deleted:true,updated_ts:Date.now()}; writeClientBlob(b); logEvent('scenario/remove',{kind:'scenario',id}); return true; }
export function restoreScenario(id){ const b=readClientBlob(); const sc=(b.scenarios||[]).find(s=>s.id===id); if(!sc) return false; sc.state={...(sc.state||{}),deleted:false,updated_ts:Date.now()}; writeClientBlob(b); logEvent('scenario/restore',{kind:'scenario',id}); return true; }
export function promoteScenario(id, {targetCardId=null}={}){
  const b = readClientBlob();
  const sc = (b.scenarios||[]).find(s=>s.id===id);
  if(!sc) return false;

  const content = (sc.cards||[])
    .map(x => (b.cards||[]).find(c=>String(c.id)===String(x.card_id))?.content || '')
    .join('\n\n');

  if (targetCardId){ updateCard(targetCardId,{ content }); }
  else { createCard({ title: sc.title||'Scénario', content }); }

  logEvent('scenario/promote',{kind:'scenario',id});
  return true;
}

// --- Session/Projecteur (sur card active)
export function getSession(){ return readClientBlob().meta?.session || {status:'idle'}; }
export function setSession(patch){ const b=readClientBlob(); b.meta=b.meta||{}; b.meta.session={ ...(b.meta.session||{}), ...patch, updated_ts:Date.now() }; writeClientBlob(b); return b.meta.session; }
export function startSession(cardId){ return setSession({ status:'running', card_id:cardId, started_ts:Date.now() }); }
export function pauseSession(){ return setSession({ status:'paused' }); }
export function stopSession(){ return setSession({ status:'stopped', stopped_ts:Date.now() }); }
export function addSessionComment({author='moi',text=''}){
  const b = readClientBlob();
  const sid = b.meta?.session?.card_id;
  if (!sid) return false;
  ensureSection(sid,'1','Proposition 1');
  appendCardUpdate(sid,'1',{ origin:'projecteur', type:'comment', md:text, meta:{author} });
  touchCard(sid);
  return true;
}

export function addSessionAnnotation({author='moi',text=''}){
  const b = readClientBlob();
  const sid = b.meta?.session?.card_id;
  if (!sid) return false;
  ensureSection(sid,'1','Proposition 1');
  appendCardUpdate(sid,'1',{ origin:'projecteur', type:'note', md:text, meta:{author} });
  touchCard(sid);
  return true;
}

// --- Bootstrap workspace (Git/Drive arbo)
export async function bootstrapWorkspaceIfNeeded(client, service){
  const wid = `${client}::${service}`; const mark = `paria::init::${wid}`;
  if (localStorage.getItem(mark)) return { skipped:true };
  const r = await bootstrapWorkspace(client, service);
  localStorage.setItem(mark,'1');
  if (r?.git)   logEvent('remote/create_git',{kind:'work',id:wid}, r.git);
  if (r?.gdrive)logEvent('remote/create_gdrive',{kind:'work',id:wid}, r.gdrive);
  return r;
}

function download(filename, text, type='text/plain'){
  const blob = new Blob([text], {type});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
}

function cardToMarkdown(c){
  const tags = (c.tags||[]).map(t=>`#${t}`).join(' ');
  return `# ${c.title||'Sans titre'}\n\n${c.content||''}\n\n${tags?`\n${tags}\n`:''}`;
}
function cardToHTML(c){
  const tags = (c.tags||[]).map(t=>`#${t}`).join(' ');
  const esc = s=>(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
  return `<!doctype html><meta charset="utf-8">
  <title>${esc(c.title||'Sans titre')}</title>
  <style>
    body{font:14px/1.45 system-ui, -apple-system, Segoe UI, Roboto, Arial; padding:24px; color:#111}
    .meta{opacity:.7;font-size:12px;margin-bottom:8px}
    h1{font-size:20px;margin:0 0 12px 0}
    pre{white-space:pre-wrap}
    @media print{ @page { margin: 12mm; } }
  </style>
  <div class="meta">#${c.id} — ${new Date(c.created_ts||Date.now()).toLocaleString()}</div>
  <h1>${esc(c.title||'Sans titre')}</h1>
  <pre>${esc(c.content||'')}</pre>
  ${tags?`<div class="meta">${esc(tags)}</div>`:''}`;
}
function cardPrint(c){
  const w = window.open('', '_blank');
  w.document.write(cardToHTML(c));
  w.document.close();
  w.focus();
  w.print(); // l’utilisateur choisit “Enregistrer en PDF” si besoin
}

// auto-migration (à appeler une fois au boot UI)
export function __cards_migrate_v2_once(){
  try{ migrateCards_v2(); }catch(e){ console.warn('[migrateCards_v2]', e); }
}
// ====================================================================
// BACKUP AUTO (5 min) + HYDRATATION DEPUIS GIT + MERGE ADD-ONLY
// ====================================================================

// ---------- helpers stables ----------
function __stableStringify(obj){
  const seen = new WeakSet();
  return JSON.stringify(obj, (k, v)=>{
    if (v && typeof v==='object'){
      if (seen.has(v)) return;
      seen.add(v);
      const o = Array.isArray(v) ? v.slice() : Object.fromEntries(Object.keys(v).sort().map(key=>[key,v[key]]));
      return o;
    }
    return v;
  });
}
function __hash(str){
  // djb2 xor
  let h = 5381;
  for (let i=0;i<str.length;i++) h = ((h<<5)+h) ^ str.charCodeAt(i);
  return (h>>>0).toString(16);
}
function __todayStr(){
  const d=new Date(), pad=v=>String(v).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
export function getWorkIdForDate(isoDate){ // ex: "2025-09-21"
  const b = readClientBlob();
  const norm = s => String(s||'').replace(/\|/g,'-').trim() || 'default';
  return `${norm(b.charter?.client)}|${norm(b.charter?.service)}|${isoDate}`;
}
export function getWorkIdForToday(){ return getWorkIdForDate(__todayStr()); }

// ---------- mesure de remplissage local ----------
export function computeLocalFill(){
  const raw = __stableStringify(readClientBlob());
  const bytes = new Blob([raw]).size;
  const QUOTA = window.pariaLocalQuotaBytes || 8 * 1024 * 1024; // 8MB par défaut
  const pct = Math.round((bytes/QUOTA)*100);
  const band = (pct<45) ? 'green' : (pct<70 ? 'orange' : (pct<90 ? 'red' : 'over'));
  return { bytes, quota:QUOTA, pct, band };
}

// ---------- backup auto (timer unique) ----------
let __autoBackupTimer = null;
export function startAutoBackup(intervalMs = 5*60*1000){ // 5 min
  if (__autoBackupTimer) return;
  __autoBackupTimer = setInterval(async ()=>{
    try{
      const b = readClientBlob();
      b.meta = b.meta || {};
      b.meta.backup = b.meta.backup || {};
      const s = __stableStringify(b);
      const h = __hash(s);
      if (b.meta.backup.last_hash === h) return; // pas de changement, pas d’envoi
      const { saveToGit } = await import('../core/net.js');
      await saveToGit({ workId: buildWorkId(), data: b });
      b.meta.backup.last_hash = h;
      b.meta.backup.last_push_ts = Date.now();
      writeClientBlob(b);
      // rotation 45/70/90 -> à brancher côté net.js si besoin (index Git)
    }catch(e){ console.warn('[auto-backup]', e); }
  }, intervalMs);
}

// ---------- backup immédiat si orange/rouge ----------
export async function maybeImmediateBackup(){
  try{
    const f = computeLocalFill();
    if (f.band==='orange' || f.band==='red' || f.band==='over'){
      const b = readClientBlob();
      const { saveToGit } = await import('../core/net.js');
      await saveToGit({ workId: buildWorkId(), data: b });
      b.meta = b.meta || {};
      b.meta.backup = b.meta.backup || {};
      b.meta.backup.last_hash = __hash(__stableStringify(b));
      b.meta.backup.last_push_ts = Date.now();
      writeClientBlob(b);
    }
  }catch(e){ console.warn('[immediate-backup]', e); }
}

// ---------- merge add-only (n’ajoute que ce qui manque) ----------
function __mergeAddOnly(remote){
  const b = readClientBlob();
  // cards
  b.cards = b.cards || [];
  const byId = new Map(b.cards.map(c=>[String(c.id), c]));
  for (const rc of (remote.cards||[])){
    const id = String(rc.id);
    if (!byId.has(id)){
      b.cards.push(rc);
      byId.set(id, rc);
    }else{
      // si remote plus récent, tu peux décider de merger champs — ici on reste add-only strict
    }
  }
  // worksets
  b.worksets = b.worksets || [];
  const byWs = new Map(b.worksets.map(w=>[String(w.id), w]));
  for (const rw of (remote.worksets||[])){
    const id = String(rw.id);
    if (!byWs.has(id)) b.worksets.push(rw);
  }
  // journal (optionnel) — add-only
  if (Array.isArray(remote.journal)){
    b.journal = b.journal || [];
    b.journal.push(...remote.journal);
  }
  writeClientBlob(b);
}

// ---------- pull Git (aujourd’hui -> hier) + merge ----------
export async function hydrateOnEnter(){
  const b = readClientBlob();
  const today = __todayStr();
  b.meta = b.meta || {};
  const lastOpen = b.meta.last_open_date || '';
  const hasLocal = Array.isArray(b.cards) && b.cards.length>0;

  // on marque la date d’ouverture
  b.meta.last_open_date = today;
  writeClientBlob(b);

  const need = (!hasLocal) || (lastOpen !== today);
  if (!need) return false;

  try{
    const { loadLatestSnapshot } = await import('../core/net.js'); // à implémenter côté net.js si pas présent
    // essai aujourd’hui
    const snapToday = await loadLatestSnapshot({ workId: getWorkIdForToday() });
    if (snapToday && snapToday.cards && snapToday.cards.length){
      __mergeAddOnly(snapToday);
      return true;
    }
    // fallback hier
    const y = new Date(); y.setDate(y.getDate()-1);
    const pad=v=>String(v).padStart(2,'0');
    const yStr = `${y.getFullYear()}-${pad(y.getMonth()+1)}-${pad(y.getDate())}`;
    const snapY = await loadLatestSnapshot({ workId: getWorkIdForDate(yStr) });
    if (snapY && snapY.cards && snapY.cards.length){
      __mergeAddOnly(snapY);
      return true;
    }
  }catch(e){}
  return false;
}

// ---------- hydratation ciblée: s’assurer qu’une card existe localement ----------
export async function ensureCardAvailable(cardId){
  const b = readClientBlob();
  const id = String(cardId);
  const has = (b.cards||[]).some(c=>String(c.id)===id);
  if (has) return true;
  try{
    const { loadCardFromSnapshots } = await import('../core/net.js'); // à implémenter: cherche la card dans les derniers snapshots
    const rc = await loadCardFromSnapshots({ id, prefer: getWorkIdForToday() });
    if (rc){
      b.cards = b.cards || [];
      b.cards.push(rc);
      writeClientBlob(b);
      return true;
    }
  }catch(e){ console.warn('[ensureCardAvailable]', e); }
  return false;
}


/* INDEX
- Cards CRUD & AI flags, Charter ops, Scenario ops incl. promote
- Session ops (write on active card)
- bootstrapWorkspaceIfNeeded()
*/

























