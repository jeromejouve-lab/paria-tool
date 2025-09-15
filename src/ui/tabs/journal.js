// PARIA-V2-CLEAN v1.0.0 | ui/tabs/journal.js
import { listJournal, restoreByTarget } from '../../domain/journal.js';

export function mountJournalTab(){
  const root=document.getElementById('tab-journal'); if(!root) return;

  const $list = root.querySelector('#journal-list, .journal-list, [data-list="journal"]');
  const $json = root.querySelector('#journal-box, .journal-box, [data-box="journal-json"]');
  const $type = root.querySelector('[data-filter-type]');
  const $kind = root.querySelector('[data-filter-kind]');
  const $from = root.querySelector('[data-filter-from]');
  const $to   = root.querySelector('[data-filter-to]');

  function refresh(){
    const q={};
    if ($type && $type.value) q.type=$type.value;
    if ($kind && $kind.value) q.kind=$kind.value;
    if ($from && $from.value) q.fromTs=Number($from.value)||Date.parse($from.value);
    if ($to && $to.value) q.toTs=Number($to.value)||Date.parse($to.value);
    const arr=listJournal(q);
    if ($list) $list.innerHTML = arr.map((e,i)=>`<div class="journal-row" data-kind="${e?.target?.kind||''}" data-id="${e?.target?.id||''}" data-idx="${i}"><code>${new Date(e.ts).toLocaleString()}</code> — <b>${e.type}</b> — ${e?.target?.kind||''} ${e?.target?.id||''} <button class="btn-restore" data-action="restore">Restaurer</button></div>`).join('');
    if ($json) $json.textContent = arr.length? JSON.stringify(arr[arr.length-1],null,2) : '—';
  }
  [$type,$kind,$from,$to].forEach(el=>el&&el.addEventListener('change',refresh));
  refresh();

  root.addEventListener('click', async (ev)=>{
    const r=ev.target.closest('.journal-row'); if (r && $json){ const idx=Number(r.dataset.idx); const arr=listJournal({}); $json.textContent = JSON.stringify(arr[idx],null,2); }
    const b=ev.target.closest('[data-action="restore"], .btn-restore'); if(!b) return;
    const row=b.closest('.journal-row'); const kind=row?.dataset?.kind; const id=row?.dataset?.id;
    if (!kind) return;
    await restoreByTarget({kind,id});
    refresh();
  });
}

export const mount=mountJournalTab; export default { mount };
