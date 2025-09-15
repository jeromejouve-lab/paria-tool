// PARIA-V2-CLEAN v1.0.0 | ui/tabs/scenarios.js (injection)
import {
  listScenarios, createScenario, addCardToScenario, removeCardFromScenario,
  promoteScenario, softDeleteScenario, listCards
} from '../../domain/reducers.js';

const $=(s,r=document)=>r.querySelector(s);

function renderScenario(sc, allCards){
  const optCards = allCards.map(c=>`<option value="${c.id}">${c.title||c.id}</option>`).join('');
  const linked = (sc.cards||[]).map(r=> {
    const ref = allCards.find(c=>c.id===r.card_id);
    return `<li data-card-ref="${r.card_id}">
      <span>${ref?.title || r.card_id}</span>
      <button class="mini" data-action="scenario-remove-card" data-sid="${sc.id}" data-cid="${r.card_id}">Retirer</button>
    </li>`;
  }).join('') || '<li class="muted">—</li>';

  return `
  <article class="scenario" data-sid="${sc.id}">
    <header class="row">
      <h3>${sc.title||'Scénario'}</h3>
      <div class="actions">
        <button data-action="scenario-promote" data-sid="${sc.id}">Promouvoir → Card</button>
        <button class="icon-trash" data-action="scenario-delete" data-sid="${sc.id}">🗑️</button>
      </div>
    </header>

    <section class="block">
      <h4>Cards incluses</h4>
      <ul class="links">${linked}</ul>
      <div class="row">
        <select data-role="add-card-select">${optCards}</select>
        <button data-action="scenario-add-card" data-sid="${sc.id}">Ajouter la card</button>
      </div>
    </section>
  </article>`;
}

function html(){
  const scs = listScenarios();
  const cards = listCards();
  return `
  <div class="scenarios">
    <div class="row"><button id="scenario-create">Nouveau scénario</button></div>
    ${scs.length ? scs.map(sc=>renderScenario(sc, cards)).join('') : `<div class="muted">— Aucun scénario.</div>`}
  </div>`;
}

export function mountScenariosTab(host = document.getElementById('tab-scenarios')){
  if (!host) return;
  host.innerHTML = html();

  $('#scenario-create', host).onclick = ()=>{ createScenario({ title:'Scénario' }); mountScenariosTab(host); };

  host.addEventListener('click', (ev)=>{
    const b = ev.target.closest('[data-action]');
    if (!b) return;
    const sid = b.dataset.sid;
    if (b.dataset.action==='scenario-delete'){ softDeleteScenario(sid); return mountScenariosTab(host); }
    if (b.dataset.action==='scenario-promote'){ promoteScenario(sid, { targetCardId:null }); return mountScenariosTab(host); }
    if (b.dataset.action==='scenario-add-card'){
      const sel = b.closest('[data-sid]')?.querySelector('select[data-role="add-card-select"]');
      const cid = sel?.value; if (!cid) return;
      addCardToScenario(sid, cid); return mountScenariosTab(host);
    }
    if (b.dataset.action==='scenario-remove-card'){
      const cid = b.dataset.cid; if (!cid) return;
      removeCardFromScenario(sid, cid); return mountScenariosTab(host);
    }
  });
}

export const mount = mountScenariosTab;
export default { mount };
