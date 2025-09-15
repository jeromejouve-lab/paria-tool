// PARIA-V2-CLEAN v1.0.0 | ui/tabs/journal.js (injection)
import { listJournal, restoreByTarget } from '../../domain/journal.js';

const $=(s,r=document)=>r.querySelector(s);

function html(filters={}){
  const kinds = ['','card','scenario','charter','work','session'];
  return `
  <div class="journal">
    <section class="block">
      <div class="row">
        <label>Type (exact)<br><input id="flt-type" type="text" placeholder="ex: card/create" value="${filters.type||''}"></label>
        <label>Kind<br>
          <select id="flt-kind">${kinds.map(k=>`<option value="${k}" ${k===filters.kind?'selected':''}>${k||'(tous)'}</option>`).join('')}</select>
        </label>
        <label>Depuis<br><input id="flt-from" type="datetime-local"></label>
        <label>Jusqu’à<br><input id="flt-to" type="datetime-local"></label>
        <button id="flt-apply">Appliquer</button>
      </div>
    </section>
    <section class="block cols">
      <div class="col">
        <div id="journal-list" class="journal-list"></div>
      </div>
      <div class="col">
        <div class="row"><button id="btn-restore" disabled>Restaurer</button></div>
        <pre id="journal-json" class="mono-pre" style="white-space:pre-wrap;">—</pre>
      </div>
    </section>
  </div>`;
}

function toDateTimeLocal(ts){
  const d=new Date(ts);
  const pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderList($list, arr){
  $list.innerHTML = arr.map((e,i)=>`
    <div class="journal-row" data-idx="${i}" data-kind="${e?.target?.kind||''}" data-id="${e?.target?.id||''}">
      <code>${new Date(e.ts).toLocaleString()}</code> — <b>${e.type}</b> — ${e?.target?.kind||''} ${e?.target?.id||''}
    </div>`).join('');
}

export function mountJournalTab(host = document.getElementById('tab-journal')){
  if (!host) return;
  host.innerHTML = html();

  const $type=$('#flt-type',host), $kind=$('#flt-kind',host), $from=$('#flt-from',host), $to=$('#flt-to',host);
  const $apply=$('#flt-apply',host), $list=$('#journal-list',host), $json=$('#journal-json',host), $restore=$('#btn-restore',host);

  let selIdx = -1;
  const refresh = ()=>{
    const q={};
    if ($type.value.trim()) q.type=$type.value.trim();
    if ($kind.value) q.kind=$kind.value;
    if ($from.value) q.fromTs=Date.parse($from.value);
    if ($to.value) q.toTs=Date.parse($to.value);
    const arr = listJournal(q);
    renderList($list, arr);
    $json.textContent = arr.length? JSON.stringify(arr[arr.length-1],null,2) : '—';
    $restore.disabled = true; selIdx = -1;
  };
  $apply.onclick = refresh;
  refresh();

  $list.addEventListener('click', (ev)=>{
    const row = ev.target.closest('.journal-row'); if (!row) return;
    selIdx = Number(row.dataset.idx);
    const q={};
    if ($type.value.trim()) q.type=$type.value.trim();
    if ($kind.value) q.kind=$kind.value;
    if ($from.value) q.fromTs=Date.parse($from.value);
    if ($to.value) q.toTs=Date.parse($to.value);
    const arr = listJournal(q);
    $json.textContent = JSON.stringify(arr[selIdx], null, 2);
    $restore.disabled = !(arr[selIdx]?.target?.kind);
  });

  $restore.onclick = async ()=>{
    const q={};
    if ($type.value.trim()) q.type=$type.value.trim();
    if ($kind.value) q.kind=$kind.value;
    if ($from.value) q.fromTs=Date.parse($from.value);
    if ($to.value) q.toTs=Date.parse($to.value);
    const arr = listJournal(q);
    const e = arr[selIdx];
    if (!e?.target?.kind) return;
    await restoreByTarget({ kind:e.target.kind, id:e.target.id });
    refresh();
  };

  // Optionnel: préremplir les dates autour de maintenant
  const now=Date.now(); $from.value=''; $to.value='';
}

export const mount = mountJournalTab;
export default { mount };
