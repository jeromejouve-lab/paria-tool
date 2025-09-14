import {
  listCards, createCard, updateCard, openCard,
  softDeleteCard, restoreCard,
  addAItoCard, toggleCardAIStatus, removeCardAI
} from '../../domain/reducers.js';
import { cardToMarkdown, cardToHTML } from '../../domain/models.js';
import { generateParia } from '../../core/llm.js';

let hostRef=null;

function download(blob,name){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href); }

function renderCardItem(c){
  const wrap=document.createElement('div'); wrap.className='card';
  const head=document.createElement('div'); head.className='row'; head.innerHTML=`<strong>${c.title}</strong><span class="small muted">${new Date(c.state.updated_ts||Date.now()).toLocaleString()}</span>`;

  const content=document.createElement('pre'); content.textContent=(c.content||'').slice(0,800);
  content.onclick=()=>openCard(c.id);

  const btns=document.createElement('div'); btns.className='btns';
  const bProj=document.createElement('button'); bProj.textContent='Projeter'; bProj.onclick=()=>openCard(c.id);
  const bMd=document.createElement('button'); bMd.className='secondary'; bMd.textContent='Export MD';
  bMd.onclick=()=>download(new Blob([cardToMarkdown(c)],{type:'text/markdown'}),`${c.title||c.id}.md`);
  const bHtml=document.createElement('button'); bHtml.className='secondary'; bHtml.textContent='Export HTML';
  bHtml.onclick=()=>download(new Blob([cardToHTML(c)],{type:'text/html'}),`${c.title||c.id}.html`);
  const bJson=document.createElement('button'); bJson.className='secondary'; bJson.textContent='Export JSON';
  bJson.onclick=()=>download(new Blob([JSON.stringify(c,null,2)],{type:'application/json'}),`${c.title||c.id}.json`);

  const bDel=document.createElement('button'); bDel.className='secondary';
  if(!c.state?.deleted){ bDel.textContent='Supprimer'; bDel.onclick=()=>{softDeleteCard(c.id); render();}; }
  else { bDel.textContent='Restaurer'; bDel.onclick=()=>{restoreCard(c.id); render();}; }

  btns.append(bProj,bMd,bHtml,bJson,bDel);

  const aiBox=document.createElement('div'); aiBox.className='small';
  aiBox.innerHTML='<div class="muted">Propositions IA</div>';
  (c.ai||[]).forEach(a=>{
    const row=document.createElement('div'); row.className='ai-row';
    const chk=document.createElement('input'); chk.type='checkbox'; chk.checked=(a.status==='ok'||a.selected);
    chk.onchange=()=>{toggleCardAIStatus(c.id,a.id,chk.checked?'ok':'todo'); render();};
    const txt=document.createElement('span'); txt.textContent=a.text.slice(0,200);
    const pill=document.createElement('span'); pill.className='pill'; pill.textContent=a.origin||'gpt';
    const bOk=document.createElement('button'); bOk.className='secondary'; bOk.textContent='✅'; bOk.title='Valider';
    bOk.onclick=()=>{toggleCardAIStatus(c.id,a.id,'ok'); render();};
    const bHold=document.createElement('button'); bHold.className='secondary'; bHold.textContent='💭'; bHold.title='Réfléchir';
    bHold.onclick=()=>{toggleCardAIStatus(c.id,a.id,'hold'); render();};
    const bDrop=document.createElement('button'); bDrop.className='secondary'; bDrop.textContent='🗑️'; bDrop.title='Supprimer';
    bDrop.onclick=()=>{removeCardAI(c.id,a.id); render();};
    row.append(chk,txt,pill,bOk,bHold,bDrop);
    aiBox.appendChild(row);
  });

  const genRow=document.createElement('div'); genRow.className='btns';
  const gBtn=document.createElement('button'); gBtn.textContent='Analyser (PARIA)';
  gBtn.onclick=async()=>{
    const comps=['P','A','R','I'];
    const proposals = await generateParia({ title:c.title, content:c.content, tags:c.tags, components:comps });
    (proposals||[]).forEach(p=> addAItoCard(c.id, { component:p.component||'P', text:p.text||'', origin:'gpt', kind:'paria', status:'todo' }));
    render();
  };
  genRow.append(gBtn);

  wrap.append(head, content, btns, aiBox, genRow);
  return wrap;
}

function render(){
  const host=hostRef;
  const root=host.querySelector('#cardsList');
  const mode=host.querySelector('#cardsFilter')?.value || 'active';
  const q=host.querySelector('#cardsSearch')?.value || '';
  const list=listCards(mode,q);
  root.innerHTML='';
  list.forEach(c=>root.appendChild(renderCardItem(c)));
}

export function mountCardsTab(host){
  hostRef=host;
  host.innerHTML=`
    <h2>Cards</h2>
    <div class="row">
      <div><label>Recherche</label><input id="cardsSearch" placeholder="titre, tag…"></div>
      <div><label>Filtre</label>
        <select id="cardsFilter"><option value="active">Actives</option><option value="deleted">Supprimées</option><option value="recent">Récentes</option></select>
      </div>
    </div>
    <div class="btns">
      <button id="btnNewCard">Nouvelle card</button>
      <input type="file" id="cardImport" accept="application/json" style="display:none">
      <button id="btnImport" class="secondary">Importer JSON client → card</button>
    </div>
    <div id="cardsList" class="list"></div>
  `;
  host.querySelector('#btnNewCard').onclick=()=>{ createCard({title:'Nouvelle card',content:''}); render(); };
  host.querySelector('#cardsSearch').oninput=()=>render();
  host.querySelector('#cardsFilter').onchange=()=>render();
  host.querySelector('#btnImport').onclick=()=>host.querySelector('#cardImport').click();
  host.querySelector('#cardImport').onchange=ev=>{
    const f=ev.target.files?.[0]; if(!f) return;
    const r=new FileReader(); r.onload=()=>{ try{
      const json=JSON.parse(r.result);
      const first=listCards('active')[0]; if(!first) return;
      updateCard(first.id, { content:(first.content||'')+'\n\n## Données client\n'+JSON.stringify(json,null,2) });
      render();
    }catch{} }; r.readAsText(f);
  };
  host.appendChild(document.createElement('hr'));
  const rx=document.createElement('div'); rx.className='small muted'; rx.textContent='Tip: cliquez sur le contenu pour projeter.';
  host.appendChild(rx);
  render();
}

/*
INDEX ui/tabs/cards.js:
- renderCardItem(c)
- render()
- mountCardsTab(host)
- imports: listCards, createCard, updateCard, openCard, softDeleteCard, restoreCard, addAItoCard, toggleCardAIStatus, removeCardAI, cardToMarkdown, cardToHTML, generateParia
*/
