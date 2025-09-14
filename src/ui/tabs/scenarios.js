import {
  listScenarios, createScenario, updateScenario,
  promoteScenario, softDeleteScenario, restoreScenario,
  addCardToScenario, removeCardFromScenario,
  importSelectedToCurrentCard
} from '../../domain/reducers.js';
import { listCards, openCard } from '../../domain/reducers.js';
import { generateParia } from '../../core/llm.js';
import { addAItoCard } from '../../domain/reducers.js';

let hostRef=null;

function renderScenarioItem(sc){
  const wrap=document.createElement('div'); wrap.className='card';
  const head=document.createElement('div'); head.className='row';
  head.innerHTML=`<strong>${sc.title} (${sc.week||'-'})</strong> <span class="pill">${sc.working?'working':''}</span>`;

  const btns=document.createElement('div'); btns.className='btns';
  const bProm=document.createElement('button'); bProm.textContent='Promote'; bProm.onclick=()=>{ promoteScenario(sc.id); render(); };
  const bDel=document.createElement('button'); bDel.className='secondary';
  if(!sc.state?.deleted){ bDel.textContent='Supprimer'; bDel.onclick=()=>{ softDeleteScenario(sc.id); render(); }; }
  else { bDel.textContent='Restaurer'; bDel.onclick=()=>{ restoreScenario(sc.id); render(); }; }

  const bIns=document.createElement('button'); bIns.className='secondary'; bIns.textContent='Insérer sélection → Card';
  bIns.onclick=()=>{ importSelectedToCurrentCard(sc.id); };

  btns.append(bProm,bIns,bDel);

  const list=document.createElement('div'); list.className='list small';
  (sc.cards||[]).forEach(ref=>{
    const li=document.createElement('div'); li.className='row';
    const c=(listCards('active').find(x=>x.id===ref.card_id)||{title:ref.card_id});
    const a=document.createElement('a'); a.href='#'; a.textContent=c.title; a.onclick=(e)=>{e.preventDefault(); openCard(c.id);};
    const rm=document.createElement('button'); rm.className='secondary'; rm.textContent='🗑️'; rm.onclick=()=>{ removeCardFromScenario(sc.id, ref.card_id); render(); };
    li.append(a, rm);
    list.appendChild(li);
  });

  const add=document.createElement('div'); add.className='row';
  const sel=document.createElement('select');
  listCards('active').forEach(c=>{ const o=document.createElement('option'); o.value=c.id; o.textContent=c.title; sel.appendChild(o); });
  const bAdd=document.createElement('button'); bAdd.textContent='Ajouter card'; bAdd.onclick=()=>{ if(sel.value) { addCardToScenario(sc.id, sel.value); render(); } };
  add.append(sel,bAdd);

  wrap.append(head, btns, list, add);
  return wrap;
}

function render(){
  const host=hostRef; const root=host.querySelector('#scList');
  const list=listScenarios('active');
  root.innerHTML='';
  list.forEach(sc=>root.appendChild(renderScenarioItem(sc)));
}

export function mountScenariosTab(host){
  hostRef=host;
  host.innerHTML=`
    <h2>Scénarios</h2>
    <div class="btns">
      <button id="btnNewSc">Nouveau scénario</button>
    </div>
    <div id="scList" class="list"></div>
  `;
  host.querySelector('#btnNewSc').onclick=()=>{ createScenario({title:'Nouveau scénario'}); render(); };
  render();
}

/*
INDEX ui/tabs/scenarios.js:
- renderScenarioItem(sc)
- render()
- mountScenariosTab(host)
- imports: listScenarios, createScenario, updateScenario, promoteScenario, softDeleteScenario, restoreScenario, addCardToScenario, removeCardFromScenario, importSelectedToCurrentCard, listCards, openCard, generateParia, addAItoCard
*/
