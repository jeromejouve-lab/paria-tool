// PARIA-V2-CLEAN v1.0.0 | ui/tabs/charter.js
import { getCharter, saveCharter, setCharterAISelected, toggleCharterAIStatus, removeCharterAI, pushSelectedCharterToCards } from '../../domain/reducers.js';
import { askAI, applyAIResults } from '../../core/ai.js';
import { logEvent } from '../../domain/journal.js';

const $=(s,r=document)=>r.querySelector(s);

export function mountCharterTab(){
  const root=document.getElementById('tab-charter'); if(!root) return;

  // Bind boutons existants (tolérant sur les sélecteurs)
  const btnAnalyze = root.querySelector('[data-action="charter-analyze"], #charter-gen, #btnCharterAnalyze');
  const btnPush    = root.querySelector('[data-action="charter-push"], #charter-push, #btnCharterPush');

  if (btnAnalyze) btnAnalyze.onclick = async ()=>{
    const ch=getCharter();
    const task={ mode:'paria', subject:{kind:'charter'}, payload:{ title:ch.title, content:ch.content, tags:ch.tags, components:['P','A','R','I'] }, context:{ tab:'charter' } };
    const r=await askAI(task); if (r.status!=='ok') { console.warn('AI status:', r.status); return; }
    applyAIResults({kind:'charter'}, r.results, {mode:'replace'});
  };

  if (btnPush) btnPush.onclick = ()=>{ const n=pushSelectedCharterToCards(); logEvent('charter/push',{kind:'charter',id:'_'},{count:n}); };

  // Délégation pour cases & pictos (tu gardes tes classes/icônes)
  root.addEventListener('change', (ev)=>{
    const el=ev.target;
    if (!(el instanceof HTMLInputElement)) return;
    if (el.matches('[data-proposal-id][type="checkbox"], .chk-sel')) {
      const id = el.dataset.proposalId || el.closest('[data-proposal-id]')?.dataset?.proposalId || el.closest('[data-id]')?.dataset?.id;
      if (id) setCharterAISelected(id, el.checked);
    }
  });
  root.addEventListener('click', (ev)=>{
    const b=ev.target.closest('.icon-trash, .icon-think, [data-action="prop-delete"], [data-action="prop-think"]');
    if(!b) return;
    const wrap=b.closest('[data-proposal-id], [data-id]');
    const id=wrap?.dataset?.proposalId || wrap?.dataset?.id;
    if(!id) return;
    if (b.classList.contains('icon-trash') || b.dataset.action==='prop-delete') removeCharterAI(id);
    else toggleCharterAIStatus(id,'think');
  });
}

export const mount=mountCharterTab; export default { mount };
