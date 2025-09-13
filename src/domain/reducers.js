import { readClientBlob, writeClientBlob } from '../core/store.js';
import { commitWithEviction } from '../core/budget.js';
import { newCard, normalizeCard, newScenario, normalizeScenario } from './models.js';
import { appendJournal } from './journal.js';

export function getCharter(){const s=readClientBlob(); return s.charter||{title:'',content:'',tags:[],state:{deleted:false,updated_ts:Date.now()}};}
export function saveCharter(patch){ const s=readClientBlob(); s.charter={...(s.charter||{title:'',content:'',tags:[],state:{deleted:false,updated_ts:Date.now()}}),...patch}; s.charter.state={...(s.charter.state||{}),updated_ts:Date.now()}; writeClientBlob(s); commitWithEviction(); appendJournal({ts:Date.now(),type:'update',target:{kind:'charter',id:'charter'}}); return s.charter;}
export const softDeleteCharter=()=>saveCharter({state:{deleted:true,updated_ts:Date.now()}}); 
export const restoreCharter=()=>saveCharter({state:{deleted:false,updated_ts:Date.now()}});

// === IA sur Charter ===
export function ensureCharter(){
  const s=readClientBlob();
  s.charter = s.charter || {title:'',content:'',tags:[],state:{deleted:false,updated_ts:Date.now()}};
  if (!Array.isArray(s.charter.ai)) s.charter.ai = [];
  return s;
}

export function addAItoCharter(part){
  const s = ensureCharter();
  const a = {
    id: part.id || `ai_${Math.random().toString(36).slice(2,8)}`,
    component: part.component || 'P',
    kind: 'paria',
    status: part.status || 'todo',
    origin: part.origin || 'heuristic',
    text: part.text || '',
    ts: Date.now(),
    selected: !!part.selected,
  };
  s.charter.ai.push(a);
  s.charter.state = {...(s.charter.state||{}), updated_ts: Date.now()};
  writeClientBlob(s);
  appendJournal({ts:Date.now(), type:'ai', target:{kind:'charter', id:'charter'}, payload:{component:a.component}});
  return a;
}

export function toggleCharterAIStatus(aiId, status){
  const s = ensureCharter();
  const i = s.charter.ai.findIndex(x => x.id === aiId);
  if (i < 0) return null;
  s.charter.ai[i].status = status;
  if (status === 'ok') s.charter.ai[i].selected = true;
  s.charter.state = {...(s.charter.state||{}), updated_ts: Date.now()};
  writeClientBlob(s); commitWithEviction();
  return s.charter.ai[i];
}

export function setCharterAISelected(aiId, selected){
  const s = ensureCharter();
  const i = s.charter.ai.findIndex(x => x.id === aiId);
  if (i < 0) return null;
  s.charter.ai[i].selected = !!selected;
  s.charter.state = {...(s.charter.state||{}), updated_ts: Date.now()};
  writeClientBlob(s); commitWithEviction();
  return s.charter.ai[i];
}

export function importCharterSelectedToCurrentCard(){
  const s = ensureCharter();
  const selected = (s.charter.ai||[]).filter(a => a.selected || a.status === 'ok');
  if (!selected.length) return false;

  const sess = s.meta?.session;
  const targetId = sess?.card_id || ((s.items||[]).find(x=>!x.state?.deleted)?.id);
  if (!targetId) return false;

  const bullets = '\n\n## PARIA – Propositions sélectionnées\n' +
    selected.map(a => `- (${a.component}) ${a.text}`).join('\n') + '\n';

  const tgt = (s.items||[]).find(x => x.id === targetId);
  const newContent = (tgt?.content || '') + bullets;
  updateCard(targetId, { content: newContent });
  appendJournal({ts:Date.now(), type:'update', target:{kind:'card', id:targetId}, payload:{from:'charter.ai', count:selected.length}});
  return true;
}

export function listCards(mode='active',q=''){const s=readClientBlob(); let arr=Array.isArray(s.items)?s.items.map(normalizeCard):[]; if(mode==='active')arr=arr.filter(c=>!c.state.deleted); if(mode==='deleted')arr=arr.filter(c=>c.state.deleted);
  if(mode==='recent')arr=arr.sort((a,b)=>b.state.updated_ts-a.state.updated_ts).slice(0,50); if(q){const qq=q.toLowerCase(); arr=arr.filter(c=>(c.title||'').toLowerCase().includes(qq)||(c.content||'').toLowerCase().includes(qq));} return arr;}
export function createCard(part={}){const s=readClientBlob(); const c=newCard(part); s.items=Array.isArray(s.items)?s.items:[]; s.items.push(c); writeClientBlob(s); appendJournal({ts:Date.now(),type:'create',target:{kind:'card',id:c.id},payload:{title:c.title}}); return c;}
export function updateCard(id,patch){const s=readClientBlob(); const i=s.items.findIndex(x=>x.id===id); if(i<0)return null; const cur=normalizeCard(s.items[i]); const next=normalizeCard({...cur,...patch,state:{...cur.state,updated_ts:Date.now()}}); s.items[i]=next; writeClientBlob(s); appendJournal({ts:Date.now(),type:'update',target:{kind:'card',id},payload:patch}); return next;}
export const softDeleteCard=id=>updateCard(id,{state:{deleted:true,deleted_at:Date.now(),deleted_by:'me',updated_ts:Date.now()}});
export const restoreCard=id=>updateCard(id,{state:{deleted:false,deleted_at:0,deleted_by:'',updated_ts:Date.now()}});
export function openCard(id){const s=readClientBlob(); s.meta=s.meta||{}; const open=new Set(s.meta.open_cards||[]); open.add(id); s.meta.open_cards=[...open]; writeClientBlob(s); commitWithEviction();}
export function addAItoCard(id,aiPart){const s=readClientBlob(); const i=s.items.findIndex(x=>x.id===id); if(i<0)return null; const card=normalizeCard(s.items[i]); const a={id:aiPart?.id||`ai_${Math.random().toString(36).slice(2,6)}`,kind:aiPart?.kind||'note',status:aiPart?.status||'todo',origin:aiPart?.origin||'manual',text:aiPart?.text||'',ts:Date.now(),selected:!!aiPart?.selected}; card.ai=card.ai.concat([a]); card.state.updated_ts=Date.now(); s.items[i]=card; writeClientBlob(s); appendJournal({ts:Date.now(),type:'ai',target:{kind:'card',id},payload:{kind:a.kind,origin:a.origin}}); return card;}
export function toggleAIStatus(id,aiId,status){const s=readClientBlob(); const i=s.items.findIndex(x=>x.id===id); if(i<0)return null; const card=normalizeCard(s.items[i]); const j=card.ai.findIndex(a=>a.id===aiId); if(j<0)return null; card.ai[j].status=status; card.ai[j].selected=(status==='ok')?true:card.ai[j].selected; card.state.updated_ts=Date.now(); s.items[i]=card; writeClientBlob(s); commitWithEviction(); return card;}

export function getSession(){const s=readClientBlob(); return s.meta?.session||{card_id:'',state:'off',guest_token:''};}
export function setSession(sess){const s=readClientBlob(); s.meta=s.meta||{}; s.meta.session={...(s.meta.session||{card_id:'',state:'off',guest_token:''}),...sess}; writeClientBlob(s); commitWithEviction(); appendJournal({ts:Date.now(),type:'session',target:{kind:'card',id:s.meta.session.card_id||'*'},payload:{state:sess.state}}); return s.meta.session;}
export const startSession=card_id=>setSession({card_id,state:'live',guest_token:Math.random().toString(36).slice(2,10)});
export const pauseSession=()=>setSession({state:'pause'}); export const stopSession=()=>setSession({state:'off',card_id:''});

export function listScenarios(mode='active',week=''){const s=readClientBlob(); let arr=Array.isArray(s.scenarios)?s.scenarios.map(normalizeScenario):[]; if(mode==='active')arr=arr.filter(x=>!x.state.deleted); if(mode==='deleted')arr=arr.filter(x=>x.state.deleted); if(week)arr=arr.filter(x=>x.week===week);
  return arr.sort((a,b)=>(b.working?-1:0)-(a.working?-1:0)||(b.state.updated_ts-a.state.updated_ts));}
export function createScenario(part={}){const s=readClientBlob(); const sc=newScenario(part); s.scenarios=Array.isArray(s.scenarios)?s.scenarios:[]; s.scenarios.push(sc); writeClientBlob(s); commitWithEviction(); appendJournal({ts:Date.now(),type:'create',target:{kind:'scenario',id:sc.id},payload:{title:sc.title,week:sc.week}}); return sc;}
export function updateScenario(id,patch){const s=readClientBlob(); const i=s.scenarios.findIndex(x=>x.id===id); if(i<0)return null; const cur=normalizeScenario(s.scenarios[i]); const next=normalizeScenario({...cur,...patch,state:{...cur.state,updated_ts:Date.now()}}); s.scenarios[i]=next; writeClientBlob(s); commitWithEviction(); appendJournal({ts:Date.now(),type:'update',target:{kind:'scenario',id},payload:patch}); return next;}
export const softDeleteScenario=id=>updateScenario(id,{state:{deleted:true,updated_ts:Date.now()}}); export const restoreScenario=id=>updateScenario(id,{state:{deleted:false,updated_ts:Date.now()}});
export function promoteScenario(id){const s=readClientBlob(); s.scenarios=Array.isArray(s.scenarios)?s.scenarios:[]; let promoted=null; s.scenarios=s.scenarios.map(sc=>{sc=normalizeScenario(sc); if(sc.id===id){sc.working=true;promoted=sc;}else{sc.working=false;} sc.state.updated_ts=Date.now(); return sc;}); writeClientBlob(s); commitWithEviction(); appendJournal({ts:Date.now(),type:'update',target:{kind:'scenario',id},payload:{working:true}}); return promoted;}
export function addCardToScenario(scId,cardId,slot=''){const s=readClientBlob(); const i=s.scenarios.findIndex(x=>x.id===scId); if(i<0)return null; const sc=normalizeScenario(s.scenarios[i]); sc.items=sc.items.concat([{card_id:cardId,slot}]); sc.state.updated_ts=Date.now(); s.scenarios[i]=sc; writeClientBlob(s); commitWithEviction(); appendJournal({ts:Date.now(),type:'update',target:{kind:'scenario',id:scId},payload:{add:{card_id:cardId,slot}}}); return sc;}
export function removeCardFromScenario(scId,cardId){const s=readClientBlob(); const i=s.scenarios.findIndex(x=>x.id===scId); if(i<0)return null; const sc=normalizeScenario(s.scenarios[i]); sc.items=sc.items.filter(it=>it.card_id!==cardId); sc.state.updated_ts=Date.now(); s.scenarios[i]=sc; writeClientBlob(s); commitWithEviction(); appendJournal({ts:Date.now(),type:'update',target:{kind:'scenario',id:scId},payload:{remove:{card_id:cardId}}}); return sc;}
export function duplicateCurrentCard(){const s=readClientBlob(); const sess=s.meta?.session; const baseId=sess?.card_id; const src=(Array.isArray(s.items)?s.items:[]).find(x=>x.id===baseId)||(Array.isArray(s.items)?s.items[0]:null); if(!src)return null; const copy={...src,id:undefined,title:(src.title||'Card')+' (copie)',state:{...src.state,deleted:false,updated_ts:Date.now()}}; return createCard(copy);}
export function importSelectedToCurrentCard(scId){const s=readClientBlob(); const sess=s.meta?.session; const targetId=sess?.card_id||((s.items||[]).find(x=>!x.state?.deleted)?.id); if(!targetId)return null; const sc=(Array.isArray(s.scenarios)?s.scenarios:[]).find(x=>x.id===scId); if(!sc)return null; const byId=new Map((s.items||[]).map(c=>[c.id,c])); const selected=[]; (sc.items||[]).forEach(it=>{const c=byId.get(it.card_id); if(!c)return; (c.ai||[]).forEach(a=>{if(a.selected||a.status==='ok')selected.push({card:c.title,text:a.text});});});
  if(!selected.length){updateCard(targetId,{}); return true;} const tgt=(s.items||[]).find(x=>x.id===targetId); const bullets='\n\n## Propositions importées\n'+selected.map(x=>`- (${x.card}) ${x.text}`).join('\n')+'\n'; const newContent=(tgt?.content||'')+bullets; updateCard(targetId,{content:newContent}); appendJournal({ts:Date.now(),type:'update',target:{kind:'card',id:targetId},payload:{imported_from:scId,count:selected.length}}); return true;}

