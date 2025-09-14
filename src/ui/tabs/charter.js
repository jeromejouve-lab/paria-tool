import {
  getCharter, saveCharter,
  addAItoCharter, toggleCharterAIStatus, removeCharterAI, setCharterAISelected,
  importCharterSelectedToCurrentCard, softDeleteCharter, restoreCharter
} from '../../domain/reducers.js';
import { generateParia } from '../../core/llm.js';

let hostRef=null;

function renderAI(box, ai){
  box.innerHTML='';
  (ai||[]).forEach(a=>{
    const row=document.createElement('div'); row.className='ai-row';
    const chk=document.createElement('input'); chk.type='checkbox'; chk.checked=(a.selected||a.status==='ok');
    chk.onchange=()=>{ setCharterAISelected(a.id, chk.checked); render(); };
    const txt=document.createElement('span'); txt.textContent=a.text.slice(0,200);
    const pill=document.createElement('span'); pill.className='pill'; pill.textContent='charter';
    const bOk=document.createElement('button'); bOk.className='secondary'; bOk.textContent='✅'; bOk.onclick=()=>{ toggleCharterAIStatus(a.id,'ok'); render(); };
    const bHold=document.createElement('button'); bHold.className='secondary'; bHold.textContent='💭'; bHold.onclick=()=>{ toggleCharterAIStatus(a.id,'hold'); render(); };
    const bDrop=document.createElement('button'); bDrop.className='secondary'; bDrop.textContent='🗑️'; bDrop.onclick=()=>{ removeCharterAI(a.id); render(); };
    row.append(chk,txt,pill,bOk,bHold,bDrop);
    box.appendChild(row);
  });
}

function render(){
  const host=hostRef;
  const ch=getCharter();

  const t=host.querySelector('#chTitle'); const c=host.querySelector('#chContent'); const g=host.querySelector('#chTags');
  t.value=ch.title||''; c.value=ch.content||''; g.value=(ch.tags||[]).join(', ');

  const aiBox=host.querySelector('#chAI');
  renderAI(aiBox, ch.ai||[]);
}

export function mountCharterTab(host){
  hostRef=host;
  host.innerHTML=`
    <h2>Charter</h2>
    <div class="editor">
      <input id="chTitle" placeholder="Titre">
      <input id="chTags" placeholder="Tags (séparés par des virgules)">
      <textarea id="chContent" placeholder="Contenu"></textarea>
    </div>
    <div class="btns">
      <button id="btnChSave">Enregistrer</button>
      <button id="btnChDelete" class="secondary">Supprimer (soft)</button>
      <button id="btnChRestore" class="secondary">Restaurer</button>
      <button id="btnChGen">Analyser (PARIA)</button>
      <button id="btnChIns">Insérer sélection → Card</button>
    </div>
    <div class="vstack">
      <div class="muted">Propositions IA</div>
      <div id="chAI"></div>
    </div>
  `;
  host.querySelector('#btnChSave').onclick=()=>{ saveCharter({
    title:host.querySelector('#chTitle').value,
    content:host.querySelector('#chContent').value,
    tags:(host.querySelector('#chTags').value||'').split(',').map(s=>s.trim()).filter(Boolean)
  }); render(); };

  host.querySelector('#btnChDelete').onclick=()=>{ softDeleteCharter(); render(); };
  host.querySelector('#btnChRestore').onclick=()=>{ restoreCharter(); render(); };

  host.querySelector('#btnChGen').onclick=async()=>{
    const comps=['P','A','R','I'];
    const proposals = await generateParia({
      title:host.querySelector('#chTitle').value,
      content:host.querySelector('#chContent').value,
      tags:(host.querySelector('#chTags').value||'').split(',').map(s=>s.trim()).filter(Boolean),
      components:comps
    });
    (proposals||[]).forEach(p=> addAItoCharter({ component:p.component||'P', text:p.text||'', status:'todo', selected:false }));
    render();
  };

  host.querySelector('#btnChIns').onclick=()=>{ importCharterSelectedToCurrentCard(); };

  render();
}

/*
INDEX ui/tabs/charter.js:
- renderAI(box, ai[])
- render()
- mountCharterTab(host)
- imports: getCharter, saveCharter, addAItoCharter, toggleCharterAIStatus, removeCharterAI, setCharterAISelected, importCharterSelectedToCurrentCard, softDeleteCharter, restoreCharter, generateParia
*/
