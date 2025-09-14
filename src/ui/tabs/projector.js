import {
  getSession, setSession, startSession, pauseSession, stopSession,
  addSessionComment, listSessionComments
} from '../../domain/reducers.js';
import { listCards, openCard, toggleCardAIStatus, addAItoCard, removeCardAI } from '../../domain/reducers.js';
import { generateParia } from '../../core/llm.js';

let hostRef=null;

function renderComments(box){
  const all=listSessionComments();
  box.innerHTML = (all.length? '' : '<div class="small muted">Aucun commentaire</div>');
  all.forEach(c=>{
    const row=document.createElement('div'); row.className='row small';
    row.innerHTML=`<span class="muted">${new Date(c.ts).toLocaleTimeString()}</span><span class="pill">${c.actor}</span><span>${c.text}</span>`;
    box.appendChild(row);
  });
}

function render(){
  const host=hostRef;
  const sess=getSession();
  const card=(listCards('active').find(c=>c.id===sess.card_id) || null);

  host.querySelector('#sessState').textContent = `Session: ${sess.status}`;
  const out=host.querySelector('#projContent'); out.innerHTML='';
  if (!card){ out.innerHTML='<div class="muted">Aucune card projetée.</div>'; return; }

  const h=document.createElement('h3'); h.textContent=card.title;
  const pre=document.createElement('pre'); pre.textContent=card.content||'';
  out.append(h, pre);

  const aiBox=host.querySelector('#projAI'); aiBox.innerHTML='';
  (card.ai||[]).forEach(a=>{
    const row=document.createElement('div'); row.className='ai-row';
    const chk=document.createElement('input'); chk.type='checkbox'; chk.checked=(a.status==='ok'||a.selected);
    chk.onchange=()=>{toggleCardAIStatus(card.id,a.id,chk.checked?'ok':'todo'); render();};
    const txt=document.createElement('span'); txt.textContent=a.text.slice(0,200);
    const pill=document.createElement('span'); pill.className='pill'; pill.textContent=a.origin||'gpt';
    const bOk=document.createElement('button'); bOk.className='secondary'; bOk.textContent='✅'; bOk.onclick=()=>{ toggleCardAIStatus(card.id,a.id,'ok'); render(); };
    const bHold=document.createElement('button'); bHold.className='secondary'; bHold.textContent='💭'; bHold.onclick=()=>{ toggleCardAIStatus(card.id,a.id,'hold'); render(); };
    const bDrop=document.createElement('button'); bDrop.className='secondary'; bDrop.textContent='🗑️'; bDrop.onclick=()=>{ removeCardAI(card.id,a.id); render(); };
    row.append(chk,txt,pill,bOk,bHold,bDrop);
    aiBox.appendChild(row);
  });
}

export function mountProjectorTab(host){
  hostRef=host;
  host.innerHTML=`
    <h2>Projecteur / Séance</h2>
    <div class="btns">
      <button id="sessStart">Démarrer</button>
      <button id="sessPause" class="secondary">Pause</button>
      <button id="sessStop" class="secondary">Stop</button>
      <span id="sessState" class="small muted">Session: -</span>
    </div>
    <div class="row">
      <div style="flex:2">
        <div id="projContent" class="vstack"></div>
        <div class="vstack">
          <div class="muted">Propositions IA (card projetée)</div>
          <div id="projAI"></div>
          <div class="btns"><button id="projGen">Analyser (PARIA)</button></div>
        </div>
      </div>
      <div style="flex:1">
        <div class="vstack">
          <div class="muted">Commentaires (acteur: moi / client / gpt)</div>
          <div class="row">
            <select id="actor"><option>moi</option><option>client</option><option>gpt</option></select>
            <input id="note" placeholder="Ajouter un commentaire">
            <button id="addNote">Ajouter</button>
          </div>
          <div id="comments" class="vstack"></div>
        </div>
      </div>
    </div>
  `;
  host.querySelector('#sessStart').onclick=()=>{ const sess=getSession(); startSession(sess.card_id); render(); };
  host.querySelector('#sessPause').onclick=()=>{ pauseSession(); render(); };
  host.querySelector('#sessStop').onclick=()=>{ stopSession(); render(); };

  host.querySelector('#addNote').onclick=()=>{
    const actor=host.querySelector('#actor').value||'moi';
    const text=host.querySelector('#note').value.trim(); if(!text) return;
    addSessionComment({ text, actor }); host.querySelector('#note').value=''; renderComments(host.querySelector('#comments'));
  };

  host.querySelector('#projGen').onclick=async()=>{
    const sess=getSession(); const card=(listCards('active').find(c=>c.id===sess.card_id)||null);
    if (!card) return;
    const comps=['P','A','R','I'];
    const proposals=await generateParia({ title:card.title, content:card.content, tags:card.tags, components:comps });
    (proposals||[]).forEach(p=> addAItoCard(card.id, { component:p.component||'P', text:p.text||'', origin:'gpt', kind:'paria', status:'todo' }));
    render();
  };

  render();
  renderComments(host.querySelector('#comments'));
}

/*
INDEX ui/tabs/projector.js:
- renderComments(box)
- render()
- mountProjectorTab(host)
- imports: getSession, setSession, startSession, pauseSession, stopSession, addSessionComment, listSessionComments, listCards, openCard, toggleCardAIStatus, addAItoCard, removeCardAI, generateParia
*/
