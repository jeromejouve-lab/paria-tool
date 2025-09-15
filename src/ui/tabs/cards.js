// PARIA-V2-CLEAN v1.0.0 | ui/tabs/cards.js
import { listCards, toggleThink, softDeleteCard, addNote, addComment, addAItoCard } from '../../domain/reducers.js';
import { askAI } from '../../core/ai.js';

export function mountCardsTab(){
  const root=document.getElementById('tab-cards'); if(!root) return;

  root.addEventListener('click',(ev)=>{
    const btn=ev.target.closest('[data-card-id] .icon-trash, [data-card-id] .icon-think, [data-action="card-delete"], [data-action="card-think"]');
    if(!btn) return;
    const wrap=btn.closest('[data-card-id]'); const id=wrap?.dataset?.cardId;
    if(!id) return;
    if (btn.classList.contains('icon-trash') || btn.dataset.action==='card-delete') softDeleteCard(id);
    else toggleThink(id);
  });

  // Analyse IA sur la card sélectionnée (sel: [data-action="card-analyze"] avec data-card-id)
  root.addEventListener('click', async (ev)=>{
    const b=ev.target.closest('[data-action="card-analyze"]'); if(!b) return;
    const id=b.dataset.cardId || b.closest('[data-card-id]')?.dataset?.cardId; if(!id) return;
    const task={ mode:'ideas', subject:{kind:'card', id}, payload:{}, context:{ tab:'cards' } };
    const r=await askAI(task); if (r.status!=='ok') return;
    addAItoCard(id, r.results);
  });

  // Notes / commentaires (si tu as des boutons ou forms)
  root.addEventListener('submit',(ev)=>{
    const f=ev.target; if(!f.closest('[data-card-id]')) return;
    ev.preventDefault(); const id=f.closest('[data-card-id]')?.dataset?.cardId; if(!id) return;
    const txt=(new FormData(f).get('text')||'').toString().trim(); const author=(new FormData(f).get('author')||'moi').toString();
    if (f.matches('[data-form="note"]')) addNote(id,{author,text:txt});
    if (f.matches('[data-form="comment"]')) addComment(id,{author,text:txt});
    f.reset();
  });
}

export const mount=mountCardsTab; export default { mount };
