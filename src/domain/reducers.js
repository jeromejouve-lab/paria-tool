// PARIA-V2-CLEAN v1.0.0 | domain/reducers.js
import { readClientBlob, writeClientBlob } from '../core/store.js';
import { logEvent } from './journal.js';
import { bootstrapWorkspace } from '../core/net.js';

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

// --- Cards
export function listCards(){ return (readClientBlob().items||[]).filter(c=>!c?.state?.deleted); }
export function createCard({title='',content='',tags=[]}={}){
  const blob=readClientBlob(); const id=uid();
  blob.items.push({ id, title, content, tags:[...tags], notes:[], comments:[], ai:[], state:{deleted:false,think:false,selected:false,created_ts:Date.now(),updated_ts:Date.now()} });
  writeClientBlob(blob); logEvent('card/create',{kind:'card',id}); return id;
}
export function updateCard(id,patch={}){
  const blob=readClientBlob(); const it=(blob.items||[]).find(c=>c.id===id); if(!it) return false;
  Object.assign(it, patch); it.state={...(it.state||{}), updated_ts:Date.now()}; writeClientBlob(blob);
  logEvent('card/update',{kind:'card',id}); return true;
}
export function softDeleteCard(id){ const b=readClientBlob(); const it=(b.items||[]).find(c=>c.id===id); if(!it) return false; it.state={...(it.state||{}),deleted:true,updated_ts:Date.now()}; writeClientBlob(b); logEvent('card/remove',{kind:'card',id}); return true; }
export function restoreCard(id){ const b=readClientBlob(); const it=(b.items||[]).find(c=>c.id===id); if(!it) return false; it.state={...(it.state||{}),deleted:false,updated_ts:Date.now()}; writeClientBlob(b); logEvent('card/restore',{kind:'card',id}); return true; }
export function toggleThink(id,v=null){ const b=readClientBlob(); const it=(b.items||[]).find(c=>c.id===id); if(!it) return false; const nv=(v==null)?!it.state?.think:!!v; it.state={...(it.state||{}),think:nv,updated_ts:Date.now()}; writeClientBlob(b); logEvent('card/think',{kind:'card',id},{value:nv}); return true; }
export function addNote(id,{author='moi',text=''}){ const b=readClientBlob(); const it=(b.items||[]).find(c=>c.id===id); if(!it) return false; it.notes=it.notes||[]; it.notes.push({id:uid(),author,text,ts:Date.now()}); it.state={...(it.state||{}),updated_ts:Date.now()}; writeClientBlob(b); logEvent('card/note',{kind:'card',id}); return true; }
export function addComment(id,{author='moi',text=''}){ const b=readClientBlob(); const it=(b.items||[]).find(c=>c.id===id); if(!it) return false; it.comments=it.comments||[]; it.comments.push({id:uid(),author,text,ts:Date.now()}); it.state={...(it.state||{}),updated_ts:Date.now()}; writeClientBlob(b); logEvent('card/comment',{kind:'card',id}); return true; }
export function addAItoCard(id, list=[]){ const b=readClientBlob(); const it=(b.items||[]).find(c=>c.id===id); if(!it) return false; it.ai=(it.ai||[]).concat(list); it.state={...(it.state||{}),updated_ts:Date.now()}; writeClientBlob(b); logEvent('card/ai-add',{kind:'card',id},{count:list.length}); return true; }
export function toggleCardAIStatus(id, aiId, key){ const b=readClientBlob(); const it=(b.items||[]).find(c=>c.id===id); if(!it) return false; it.ai=(it.ai||[]).map(x=>x.id===aiId?({...x,state:{...(x.state||{}),[key]:!x.state?.[key],updated_ts:Date.now()}}):x); writeClientBlob(b); logEvent('card/ai-flag',{kind:'card',id},{aiId,key}); return true; }
export function removeCardAI(id, aiId){ const b=readClientBlob(); const it=(b.items||[]).find(c=>c.id===id); if(!it) return false; it.ai=(it.ai||[]).map(x=>x.id===aiId?({...x,state:{...(x.state||{}),deleted:true,updated_ts:Date.now()}}):x); writeClientBlob(b); logEvent('card/ai-remove',{kind:'card',id},{aiId}); return true; }

// --- Charter
export function getCharter(){ return readClientBlob().charter; }
export function saveCharter(patch){ const b=readClientBlob(); b.charter={ ...(b.charter||{}), ...patch, state:{ ...(b.charter?.state||{}), updated_ts:Date.now() } }; writeClientBlob(b); logEvent('charter/update',{kind:'charter',id:'_'}); return true; }
export function setCharterAISelected(aiId, val){ const b=readClientBlob(); b.charter.ai=(b.charter.ai||[]).map(p=>p.id===aiId?({...p,state:{...(p.state||{}),selected:!!val,updated_ts:Date.now()}}):p); writeClientBlob(b); logEvent('charter/select',{kind:'charter',id:'_'},{aiId,selected:!!val}); return true; }
export function toggleCharterAIStatus(aiId,key){ const b=readClientBlob(); b.charter.ai=(b.charter.ai||[]).map(p=>p.id===aiId?({...p,state:{...(p.state||{}),[key]:!p.state?.[key],updated_ts:Date.now()}}):p); writeClientBlob(b); logEvent('charter/ai-flag',{kind:'charter',id:'_'},{aiId,key}); return true; }
export function removeCharterAI(aiId){ const b=readClientBlob(); b.charter.ai=(b.charter.ai||[]).map(p=>p.id===aiId?({...p,state:{...(p.state||{}),deleted:true,updated_ts:Date.now()}}):p); writeClientBlob(b); logEvent('charter/ai-remove',{kind:'charter',id:'_'},{aiId}); return true; }
export function pushSelectedCharterToCards(){
  const b = readClientBlob();
  const sel = (b.charter?.ai||[]).filter(p => p?.state?.selected && !p?.state?.deleted);

  if (!sel.length) return 0;

  let count = 0;
  for (const p of sel){
    // 1) nouvelle card à chaque envoi
    const id = createCard({
      title:   p.title   || '',
      content: p.content || '',
      tags:    Array.isArray(p.tags) ? p.tags : []
    });

    // 2) propagation des méta
    updateCard(id, {
      created_ts: p.ts || Date.now(),            // ← timestamp de la proposition
      state: { think: !!(p?.state?.think) },     // ← “penser”
      origin: { kind:'charter', ai_id:String(p.id||''), pushed_ts: Date.now() }
    });

    count++;
  }

  logEvent?.('charter/push-to-cards', {count});
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
  const b=readClientBlob(); const sc=(b.scenarios||[]).find(s=>s.id===id); if(!sc) return false;
  const content = (sc.cards||[]).map(x=> (b.items||[]).find(c=>c.id===x.card_id)?.content || '').join('\n\n');
  if (targetCardId){ updateCard(targetCardId,{ content }); }
  else { createCard({ title: sc.title||'Scénario', content }); }
  logEvent('scenario/promote',{kind:'scenario',id}); return true;
}

// --- Session/Projecteur (sur card active)
export function getSession(){ return readClientBlob().meta?.session || {status:'idle'}; }
export function setSession(patch){ const b=readClientBlob(); b.meta=b.meta||{}; b.meta.session={ ...(b.meta.session||{}), ...patch, updated_ts:Date.now() }; writeClientBlob(b); return b.meta.session; }
export function startSession(cardId){ return setSession({ status:'running', card_id:cardId, started_ts:Date.now() }); }
export function pauseSession(){ return setSession({ status:'paused' }); }
export function stopSession(){ return setSession({ status:'stopped', stopped_ts:Date.now() }); }
export function addSessionComment({author='moi',text=''}){ const b=readClientBlob(); const sid=b.meta?.session?.card_id; if (!sid) return false; const it=(b.items||[]).find(c=>c.id===sid); if(!it) return false; it.comments=it.comments||[]; it.comments.push({id:uid(),author,text,ts:Date.now()}); writeClientBlob(b); logEvent('session/comment',{kind:'card',id:sid}); return true; }
export function addSessionAnnotation({author='moi',text=''}){ const b=readClientBlob(); const sid=b.meta?.session?.card_id; if (!sid) return false; const it=(b.items||[]).find(c=>c.id===sid); if(!it) return false; it.notes=it.notes||[]; it.notes.push({id:uid(),author,text,ts:Date.now()}); writeClientBlob(b); logEvent('session/annotate',{kind:'card',id:sid}); return true; }

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
  <div class="meta">#${c.id} — ${fmtTs(c.created_ts)}</div>
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

/* INDEX
- Cards CRUD & AI flags, Charter ops, Scenario ops incl. promote
- Session ops (write on active card)
- bootstrapWorkspaceIfNeeded()
*/







