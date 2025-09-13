// src/ui/tabs/cards.js
import { listCards, createCard, updateCard, softDeleteCard, restoreCard, addAItoCard, toggleAIStatus, exportJSONCard, startSession } from '../../domain/reducers.js';
import { cardToMarkdown, cardToHTML } from '../../domain/models.js';
import { commitWithEviction } from '../../core/budget.js';

const $ = s=>document.querySelector(s);

function downloadBlob(blob, filename){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function renderCardItem(c){
  const wrapper = document.createElement('div');
  wrapper.style.border='1px solid #333';
  wrapper.style.borderRadius='.5rem';
  wrapper.style.padding='.75rem';
  wrapper.style.margin='.5rem 0';
  wrapper.style.background = c.state.deleted ? '#220' : '#151820';

  const header = document.createElement('div');
  header.style.display='flex';
  header.style.justifyContent='space-between';
  header.style.alignItems='center';
  header.innerHTML = `
    <strong>${c.title}</strong>
    <span class="small muted">${new Date(c.state.updated_ts).toLocaleString()}</span>
  `;
  wrapper.appendChild(header);

  const content = document.createElement('pre');
  content.className = 'small mono';
  content.textContent = (c.content||'').slice(0,400);
  wrapper.appendChild(content);

  // actions
  const btns = document.createElement('div'); btns.className='btns';
  // Projecteur
  const bProj = document.createElement('button'); bProj.textContent='Ouvrir Projecteur';
  bProj.onclick = ()=>{ startSession(c.id); commitWithEviction(); alert('Projecteur prêt. Onglet Projecteur → Démarrer.'); };
  btns.appendChild(bProj);

  // Exports
  const bMd = document.createElement('button'); bMd.className='secondary'; bMd.textContent='Export MD';
  bMd.onclick = ()=> downloadBlob(new Blob([cardToMarkdown(c)],{type:'text/markdown'}), `${c.title||c.id}.md`);
  const bHtml = document.createElement('button'); bHtml.className='secondary'; bHtml.textContent='Export HTML';
  bHtml.onclick = ()=> downloadBlob(new Blob([cardToHTML(c)],{type:'text/html'}), `${c.title||c.id}.html`);
  const bJson = document.createElement('button'); bJson.className='secondary'; bJson.textContent='Export JSON';
  bJson.onclick = ()=> downloadBlob(exportJSONCard(c), `${c.title||c.id}.json`);
  btns.append(bMd,bHtml,bJson);

  // Delete / Restore
  const bDel = document.createElement('button'); bDel.className='secondary';
  if (!c.state.deleted){
    bDel.textContent='Supprimer (soft)';
    bDel.onclick = ()=>{ softDeleteCard(c.id); renderCards(); };
  } else {
    bDel.textContent='Restaurer';
    bDel.onclick = ()=>{ restoreCard(c.id); renderCards(); };
  }
  btns.appendChild(bDel);

  wrapper.appendChild(btns);

  // IA & commentaires (pictos)
  const aiBox = document.createElement('div');
  aiBox.className='small';
  aiBox.style.marginTop='.5rem';
  aiBox.innerHTML = `<div class="muted">Propositions IA</div>`;
  (c.ai||[]).forEach(a=>{
    const row = document.createElement('div'); row.style.display='flex'; row.style.gap='.5rem'; row.style.alignItems='center'; row.style.margin='.25rem 0';
    const chk = document.createElement('input'); chk.type='checkbox'; chk.checked = !!a.selected;
    chk.onchange = ()=> toggleAIStatus(c.id, a.id, chk.checked?'ok':'todo') && renderCards();

    const txt = document.createElement('span'); txt.textContent = a.text.slice(0,120);
    const o = document.createElement('span'); o.className='pill'; o.textContent = a.origin||'manual';

    const val = document.createElement('button'); val.className='secondary'; val.textContent='✅';
    val.title='valider'; val.onclick=()=> toggleAIStatus(c.id, a.id, 'ok') && renderCards();
    const hold = document.createElement('button'); hold.className='secondary'; hold.textContent='💭';
    hold.title='à réfléchir'; hold.onclick=()=> toggleAIStatus(c.id, a.id, 'hold') && renderCards();
    const drop = document.createElement('button'); drop.className='secondary'; drop.textContent='🗑️';
    drop.title='supprimer'; drop.onclick=()=> toggleAIStatus(c.id, a.id, 'drop') && renderCards();

    row.append(chk, txt, o, val, hold, drop);
    aiBox.appendChild(row);
  });

  // Ajout rapide IA
  const addRow = document.createElement('div'); addRow.className='btns';
  const txt = document.createElement('input'); txt.placeholder='ajouter une proposition IA / note';
  const add = document.createElement('button'); add.textContent='Ajouter';
  add.onclick = ()=>{ if(!txt.value.trim())return; addAItoCard(c.id,{text:txt.value,origin:'manual',status:'todo'}); renderCards(); };
  addRow.append(txt,add);
  aiBox.appendChild(addRow);

  wrapper.appendChild(aiBox);
  return wrapper;
}

function renderCards(){
  const mode = $('#cardsFilter').value;
  const q = $('#cardsSearch').value;
  const list = listCards(mode, q);
  const host = $('#cardsList'); host.innerHTML='';
  if (!list.length){ host.innerHTML = `<div class="muted">Aucune card</div>`; return; }
  list.forEach(c=> host.appendChild(renderCardItem(c)));
}

export function mountCardsTab(){
  $('#btnNewCard').onclick = ()=>{
    const c = createCard({ title:'Nouvelle card', content:'' });
    commitWithEviction(); renderCards();
    alert(`Créée: ${c.title}`);
  };
  $('#cardsSearch').oninput = ()=> renderCards();
  $('#cardsFilter').onchange = ()=> renderCards();

  // Import JSON client → injecte dans la card sélectionnée (la première de la liste active, simple pour M2)
  $('#btnImport').onclick = ()=> $('#cardImport').click();
  $('#cardImport').onchange = (ev)=>{
    const file = ev.target.files?.[0]; if (!file) return;
    file.text().then(t=>{
      try{
        const json = JSON.parse(t);
        const first = listCards('active')[0];
        if (!first){ alert('Aucune card active pour injecter'); return; }
        updateCard(first.id, { props:{ client:json }});
        commitWithEviction(); renderCards();
        alert('Données client injectées dans la card active.');
      }catch{ alert('JSON invalide'); }
    });
  };

  renderCards();
}
