// PARIA-V2-CLEAN v1.0.0 | ui/tabs/scenarios.js
import { createScenario, addCardToScenario, removeCardFromScenario, promoteScenario, softDeleteScenario } from '../../domain/reducers.js';

export function mountScenariosTab(){
  const root=document.getElementById('tab-scenarios'); if(!root) return;

  root.addEventListener('click',(ev)=>{
    const b=ev.target.closest('[data-action]'); if(!b) return;
    const act=b.dataset.action;
    if (act==='scenario-create') createScenario({ title: b.dataset.title||'Scénario' });
    if (act==='scenario-add-card') addCardToScenario(b.dataset.scenarioId, b.dataset.cardId);
    if (act==='scenario-remove-card') removeCardFromScenario(b.dataset.scenarioId, b.dataset.cardId);
    if (act==='scenario-promote') promoteScenario(b.dataset.scenarioId, { targetCardId: b.dataset.targetCardId||null });
    if (act==='scenario-delete') softDeleteScenario(b.dataset.scenarioId);
  });
}

export const mount=mountScenariosTab; export default { mount };
