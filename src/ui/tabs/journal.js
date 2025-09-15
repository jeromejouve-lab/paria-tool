// src/ui/tabs/journal.js — restore handler (sans réécrire l’UI)
import * as R from '../../domain/reducers.js';
import { listJournal } from '../../domain/journal.js';

function canRestore(e){
  // considère restaurables: create/remove/soft-delete sur card/scenario/charter
  const t = (e?.type||'').toLowerCase();
  return /restore|remove|soft-delete|create/.test(t) && e?.target && (e.target.kind==='card' || e.target.kind==='scenario' || e.target.kind==='charter');
}

async function doRestore(kind, id){
  if (typeof R.restoreByTarget === 'function') return R.restoreByTarget({ kind, id });
  // fallback si pas d’API unifiée
  if (kind==='card'     && typeof R.restoreCard     === 'function') return R.restoreCard(id);
  if (kind==='scenario' && typeof R.restoreScenario === 'function') return R.restoreScenario(id);
  if (kind==='charter'  && typeof R.restoreCharter  === 'function') return R.restoreCharter();
  return false;
}

export function mountJournalTab(){
  // 1) Si tu as une boîte JSON, on l’alimente (sinon on n’y touche pas)
  const box = document.querySelector('#journal-box, .journal-box, [data-box="journal-json"]');
  if (box) { box.textContent = JSON.stringify(listJournal(), null, 2); }

  // 2) Click "Restaurer" sur l’UI existante (sans réécrire le markup)
  document.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-action="restore"], .btn-restore');
    if (!btn) return;

    // Cherche le conteneur de la ligne d’historique pour récupérer kind/id
    const row = btn.closest('[data-kind][data-id], .journal-row');
    let kind = row?.dataset?.kind || btn.dataset.kind;
    let id   = row?.dataset?.id   || btn.dataset.id;

    // Si l’UI ne porte pas les data-attrs, on tente via la dernière entrée sélectionnée (fallback)
    if (!kind || !id) {
      const arr = listJournal().filter(canRestore);
      const last = arr[arr.length - 1];
      if (!last) return;
      kind = last.target?.kind;
      id   = last.target?.id;
    }
    if (!kind) return;

    const ok = await doRestore(kind, id);
    // feedback léger ; on ne modifie pas ton affichage
    if (ok) console.log(`✅ restauré: ${kind} ${id||''}`);
    else    console.warn(`⚠️ restore a échoué: ${kind} ${id||''}`);
  });
}

export const mount = mountJournalTab;
export default { mount: mountJournalTab };
