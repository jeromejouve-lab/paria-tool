// src/ui/tabs/cards.js
import {
  listCards, createCard, updateCard,
  softDeleteCard, restoreCard,
  addAItoCard, toggleCardAIStatus, removeCardAI
} from '../../domain/reducers.js';

export function mountCardsTab(host){
  host.innerHTML = `
    <h2>Cards</h2>
    <div class="btns">
      <button id="btnNewCard">Nouvelle card</button>
    </div>
    <div id="cardsList" class="list" style="margin-top:.75rem"></div>
  `;

  const $list = host.querySelector('#cardsList');

  function cardView(c){
    const wrap = document.createElement('div');
    wrap.className = 'card';
    wrap.dataset.id = c.id;

    const deleted = c.state?.deleted;

    wrap.innerHTML = `
      <div class="row">
        <div><label>Titre</label><input data-k="title" value="${c.title||''}" ${deleted?'disabled':''}></div>
        <div><label>Tags (séparés par ,)</label><input data-k="tags" value="${(c.tags||[]).join(',')}" ${deleted?'disabled':''}></div>
      </div>
      <label>Contenu</label>
      <textarea data-k="content" ${deleted?'disabled':''}>${c.content||''}</textarea>

      <div class="btns">
        <button data-act="save" class="secondary" ${deleted?'disabled':''}>💾</button>
        <button data-act="gen"  class="secondary" ${deleted?'disabled':''}>⚙️ Générer</button>
        <button data-act="del"  class="secondary">🗑️</button>
        <button data-act="restore" class="secondary">↩️ Restaurer</button>
      </div>

      <div class="sep"></div>
      <div class="small muted" style="margin:.25rem 0 .5rem">Analyse IA</div>
      <div class="list" data-zone="ai"></div>
    `;

    // IA list
    const $ai = wrap.querySelector('[data-zone="ai"]');
    const ai = (c.ai||[]);
    if(!ai.length){
      $ai.innerHTML = `<div class="muted small">Aucune proposition IA</div>`;
    }else{
      ai.slice().reverse().forEach(a=>{
        const row = document.createElement('div');
        row.className = 'card';
        row.dataset.aiId = a.id;

        const badgetxt =
          (a.status==='hold') ? 'À réfléchir' :
          (a.status==='ok')   ? 'Validé' :
          (a.status==='drop') ? 'Rejeté' : 'À traiter';

        row.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center">
            <strong>[${a.component||'P'}]</strong>
            <span class="small muted">${new Date(a.ts||Date.now()).toLocaleString()}</span>
          </div>
          <div class="small mono-pre">${a.text||''}</div>
          <div class="small muted">${badgetxt}</div>
          <div class="btns">
            <button data-ai="ok"   class="secondary">✅</button>
            <button data-ai="hold" class="secondary">💭</button>
            <button data-ai="del"  class="secondary">🗑️</button>
          </div>
        `;

        // IA actions (pictos)
        row.querySelector('[data-ai="ok"]').onclick   = ()=>{ toggleCardAIStatus(c.id, a.id, 'ok');   render(); };
        row.querySelector('[data-ai="hold"]').onclick = ()=>{ toggleCardAIStatus(c.id, a.id, 'hold'); render(); };
        row.querySelector('[data-ai="del"]').onclick  = ()=>{ removeCardAI(c.id, a.id);               render(); };
        $ai.appendChild(row);
      });
    }

    // CRUD / générer
    wrap.querySelector('[data-act="save"]').onclick = ()=>{
      const title = wrap.querySelector('[data-k="title"]').value;
      const content = wrap.querySelector('[data-k="content"]').value;
      const tags = wrap.querySelector('[data-k="tags"]').value.split(',').map(s=>s.trim()).filter(Boolean);
      updateCard(c.id, { title, content, tags });
      render();
    };

    wrap.querySelector('[data-act="gen"]').onclick = ()=>{
      const title = wrap.querySelector('[data-k="title"]').value.trim();
      const content = wrap.querySelector('[data-k="content"]').value.trim();
      const base = (title || content || 'idée').slice(0,80);
      const mk = (t)=>({ id: undefined, ts: Date.now(), component:'P', text:t, status:'todo', selected:false });
      const props = [
        mk(`Diagnostic: ${base}…`),
        mk(`Risque: blocant principal à mitiger`),
        mk(`Action: quick win (30j)`),
        mk(`KPI: indicateur simple à suivre`)
      ];
      props.forEach(p=> addAItoCard(c.id, p));
      render();
    };

    wrap.querySelector('[data-act="del"]').onclick = ()=>{ softDeleteCard(c.id); render(); };
    wrap.querySelector('[data-act="restore"]').onclick = ()=>{ restoreCard(c.id); render(); };

    return wrap;
  }

  function render(){
    const cards = listCards();
    $list.innerHTML = '';
    if(!cards.length){
      $list.innerHTML = `<div class="muted">Aucune card</div>`;
      return;
    }
    cards.slice().reverse().forEach(c => $list.appendChild(cardView(c)));
  }

  host.querySelector('#btnNewCard').onclick = ()=>{
    const c = createCard({ title:'Nouvelle card', content:'', tags:[] });
    updateCard(c.id, { /* touche le updated_ts via reducers */ });
    render();
  };

  render();
}
