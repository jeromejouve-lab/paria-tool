import { listCards, createCard, openCard, softDeleteCard, restoreCard, addAItoCard, toggleAIStatus } from '../../domain/reducers.js';
import { cardToMarkdown, cardToHTML } from '../../domain/models.js';

function renderCardItem(c){
  const wrapper=document.createElement('div'); wrapper.className='card';
  const header=document.createElement('div'); header.style.display='flex'; header.style.justifyContent='space-between'; header.style.alignItems='center';
  header.innerHTML=`<strong>${c.title}</strong><span class="small muted">${new Date(c.state.updated_ts).toLocaleString()}</span>`; wrapper.appendChild(header);
  const content=document.createElement('pre'); content.className='small mono mono-pre'; content.textContent=(c.content||'').slice(0,400); content.onclick=()=>openCard(c.id); wrapper.appendChild(content);
  const btns=document.createElement('div'); btns.className='btns';
  const bProj=document.createElement('button'); bProj.textContent='Ouvrir Projecteur'; bProj.onclick=()=>{openCard(c.id); alert('Projecteur prêt. Onglet Projecteur → Démarrer.');}; btns.appendChild(bProj);
  const bMd=document.createElement('button'); bMd.className='secondary'; bMd.textContent='Export MD'; bMd.onclick=()=>download(new Blob([cardToMarkdown(c)],{type:'text/markdown'}),`${c.title||c.id}.md`);
  const bHtml=document.createElement('button'); bHtml.className='secondary'; bHtml.textContent='Export HTML'; bHtml.onclick=()=>download(new Blob([cardToHTML(c)],{type:'text/html'}),`${c.title||c.id}.html`);
  const bJson=document.createElement('button'); bJson.className='secondary'; bJson.textContent='Export JSON'; bJson.onclick=()=>download(new Blob([JSON.stringify(c,null,2)],{type:'application/json'}),`${c.title||c.id}.json`);
  btns.append(bMd,bHtml,bJson);
  const bDel=document.createElement('button'); bDel.className='secondary'; if(!c.state.deleted){ bDel.textContent='Supprimer (soft)'; bDel.onclick=()=>{softDeleteCard(c.id); render();}; } else { bDel.textContent='Restaurer'; bDel.onclick=()=>{restoreCard(c.id); render();}; }
  btns.appendChild(bDel); wrapper.appendChild(btns);
  const aiBox=document.createElement('div'); aiBox.className='small'; aiBox.style.marginTop='.5rem'; aiBox.innerHTML=`<div class="muted">Propositions IA</div>`;
  (c.ai||[]).forEach(a=>{const row=document.createElement('div'); row.style.display='flex'; row.style.gap='.5rem'; row.style.alignItems='center'; row.style.margin='.25rem 0';
    const chk=document.createElement('input'); chk.type='checkbox'; chk.checked=!!a.selected; chk.onchange=()=>{toggleAIStatus(c.id,a.id,chk.checked?'ok':'todo'); render();};
    const txt=document.createElement('span'); txt.textContent=a.text.slice(0,120);
    const o=document.createElement('span'); o.className='pill'; o.textContent=a.origin||'manual';
    const val=document.createElement('button'); val.className='secondary'; val.textContent='✅'; val.title='valider'; val.onclick=()=>{toggleAIStatus(c.id,a.id,'ok'); render();};
    const hold=document.createElement('button'); hold.className='secondary'; hold.textContent='💭'; hold.title='à réfléchir'; hold.onclick=()=>{toggleAIStatus(c.id,a.id,'hold'); render();};
    const drop=document.createElement('button'); drop.className='secondary'; drop.textContent='🗑️'; drop.title='supprimer'; drop.onclick=()=>{toggleAIStatus(c.id,a.id,'drop'); render();};
    row.append(chk,txt,o,val,hold,drop); aiBox.appendChild(row); });
  const addRow=document.createElement('div'); addRow.className='btns';
  const txt=document.createElement('input'); txt.placeholder='ajouter une proposition IA / note';
  const add=document.createElement('button'); add.textContent='Ajouter'; add.onclick=()=>{if(!txt.value.trim())return; addAItoCard(c.id,{text:txt.value,origin:'manual',status:'todo'}); render();};
  addRow.append(txt,add); aiBox.appendChild(addRow); wrapper.appendChild(aiBox);
  return wrapper;

  function download(blob,name){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href); }
}

let hostRef=null;
function render(){ const host=hostRef; const mode=host.querySelector('#cardsFilter').value; const q=host.querySelector('#cardsSearch').value; const list=listCards(mode,q); const root=host.querySelector('#cardsList'); root.innerHTML=''; if(!list.length){root.innerHTML='<div class="muted">Aucune card</div>';return;} list.forEach(c=>root.appendChild(renderCardItem(c))); }

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
  host.querySelector('#btnNewCard').onclick=()=>{const c=createCard({title:'Nouvelle card',content:''}); render(); alert(`Créée: ${c.title}`);};
  host.querySelector('#cardsSearch').oninput=()=>render(); host.querySelector('#cardsFilter').onchange=()=>render();
  host.querySelector('#btnImport').onclick=()=>host.querySelector('#cardImport').click();
  host.querySelector('#cardImport').onchange=ev=>{const file=ev.target.files?.[0]; if(!file)return; file.text().then(t=>{try{const json=JSON.parse(t); const first=listCards('active')[0]; if(!first){alert('Aucune card active');return;} importClientToFirst(first.id,json); render(); alert('Données client injectées.');}catch{alert('JSON invalide');}});};
  render();
}

import { updateCard } from '../../domain/reducers.js';
function importClientToFirst(cardId,json){ updateCard(cardId,{props:{client:json}}); }
