// src/ui/tabs/journal.js
import { readClientBlob, mergeIntoCurrentService } from '../../core/store.js';
import { commitWithEviction } from '../../core/budget.js';
import { settingsLoad } from '../../core/settings.js';
import { gitLoad, gdrvLoad } from '../../core/net.js';
import { restoreCard, softDeleteCard, restoreScenario, softDeleteScenario } from '../../domain/reducers.js';

const $ = s=>document.querySelector(s);
let CURRENT = null; // entrée sélectionnée

function fmtTs(ts){ try{ return new Date(ts||Date.now()).toLocaleString(); }catch{ return String(ts||''); } }

function canRestoreElement(ev){
  if (!ev || !ev.target) return false;
  const k = ev.target.kind, t = ev.type;
  if (k==='card' || k==='scenario'){
    // inverses simples couverts : delete<->restore, create->softDelete
    if (t==='delete' || t==='restore' || t==='create') return true;
    // update/ai : on ne sait pas revenir sans "before"
    return false;
  }
  if (k==='charter'){
    // on ne gère pas de delete charter dans M0–M3; snapshot requis
    return false;
  }
  return false;
}

async function restoreFromSnapshot(ev){
  const wid = settingsLoad().work.work_id;
  if (!wid) return { ok:false, error:'no_workid' };
  const hit = ev.snapshot||{};
  // Git d'abord, fallback Google
  if (hit.sha || hit.json_path){
    const r = await gitLoad(wid, hit.sha, hit.json_path);
    if (r && r.ok && (r.state || r.data)){ mergeIntoCurrentService(r.state||r.data); commitWithEviction(); return { ok:true }; }
  }
  if (hit.id){
    const r2 = await gdrvLoad(wid, hit.id);
    if (r2 && r2.ok && (r2.state || r2.data)){ mergeIntoCurrentService(r2.state||r2.data); commitWithEviction(); return { ok:true }; }
  }
  return { ok:false, error:'no_snapshot' };
}

function restoreElement(ev){
  const k = ev.target?.kind, id = ev.target?.id, t = ev.type;
  if (k==='card'){
    if (t==='delete')      { restoreCard(id); commitWithEviction(); return { ok:true }; }
    if (t==='restore')     { softDeleteCard(id); commitWithEviction(); return { ok:true }; } // inverse
    if (t==='create')      { softDeleteCard(id); commitWithEviction(); return { ok:true }; }
    return { ok:false, error:'not_reversible' };
  }
  if (k==='scenario'){
    if (t==='delete')      { restoreScenario(id); commitWithEviction(); return { ok:true }; }
    if (t==='restore')     { softDeleteScenario(id); commitWithEviction(); return { ok:true }; }
    if (t==='create')      { softDeleteScenario(id); commitWithEviction(); return { ok:true }; }
    return { ok:false, error:'not_reversible' };
  }
  return { ok:false, error:'unsupported' };
}

function rowView(ev){
  const div = document.createElement('div');
  div.style.border='1px solid #333';
  div.style.borderRadius='.5rem';
  div.style.padding='.5rem';
  div.style.margin='.35rem 0';
  div.style.background = ev.type==='delete' ? '#291515' : '#151820';
  const tgt = ev.target ? `${ev.target.kind}:${ev.target.id||'*'}` : '—';
  div.innerHTML = `<div><strong>${ev.type}</strong> <span class="muted small">(${fmtTs(ev.ts)})</span></div>
                   <div class="small">target: ${tgt}</div>`;
  div.onclick = ()=>{
    CURRENT = ev;
    $('#jDetail').textContent = JSON.stringify(ev, null, 2);
    $('#jState').textContent = canRestoreElement(ev) || ev.snapshot ? 'restaurable' : '—';
  };
  return div;
}

function renderList(){
  const mode = $('#jFilter').value;
  const s = readClientBlob();
  let arr = Array.isArray(s.decisions)? s.decisions.slice() : [];
  arr.sort((a,b)=> (b.ts||0)-(a.ts||0));
  if (mode!=='all') arr = arr.filter(e=>e.type===mode);
  const host = $('#jList'); host.innerHTML='';
  if (!arr.length){ host.innerHTML = `<div class="muted">Aucun évènement</div>`; return; }
  arr.forEach(ev=> host.appendChild(rowView(ev)));
}

export function mountJournalTab(){
  $('#jFilter').onchange = renderList;
  $('#jRestore').onclick = async ()=>{
    const st = $('#jState'); st.textContent = '…';
    const ev = CURRENT;
    if (!ev){ st.textContent='—'; return; }
    // priorité snapshot si présent
    if (ev.snapshot){
      const r = await restoreFromSnapshot(ev);
      st.textContent = r.ok ? 'OK (snapshot)' : (r.error||'ko');
      if (r.ok) renderList();
      return;
    }
    // sinon, restauration élémentaire (inverses simples)
    const r2 = restoreElement(ev);
    st.textContent = r2.ok ? 'OK (élément)' : (r2.error||'ko');
    if (r2.ok) renderList();
  };

  renderList();
  $('#jDetail').textContent = '—';
  $('#jState').textContent  = '—';
}
