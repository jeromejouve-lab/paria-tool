import { readClientBlob } from '../../core/store.js';
import { gitLoad, gdrvLoad } from '../../core/net.js';
import { settingsLoad } from '../../core/settings.js';
import { mergeIntoCurrentService } from '../../core/store.js';
import { commitWithEviction } from '../../core/budget.js';
import { restoreCard, softDeleteCard, restoreScenario, softDeleteScenario } from '../../domain/reducers.js';

function fmtTs(ts){ try{return new Date(ts||Date.now()).toLocaleString();}catch{return String(ts||'');} }
function canRestoreElement(ev){ if(!ev||!ev.target)return false; const k=ev.target.kind, t=ev.type; if(k==='card'||k==='scenario'){ if(t==='delete'||t==='restore'||t==='create') return true; return false;} if(k==='charter'){return false;} return false; }

async function restoreFromSnapshot(ev){ const wid=settingsLoad().work.work_id; if(!wid) return {ok:false,error:'no_workid'}; const hit=ev.snapshot||{};
  if(hit.sha||hit.json_path){ const r=await gitLoad(wid,hit.sha,hit.json_path); if(r&&r.ok&&(r.state||r.data)){ mergeIntoCurrentService(r.state||r.data); await commitWithEviction(); return {ok:true}; } }
  if(hit.id){ const r2=await gdrvLoad(wid,hit.id); if(r2&&r2.ok&&(r2.state||r2.data)){ mergeIntoCurrentService(r2.state||r2.data); await commitWithEviction(); return {ok:true}; } }
  return {ok:false,error:'no_snapshot'};
}
function restoreElement(ev){ const k=ev.target?.kind, id=ev.target?.id, t=ev.type;
  if(k==='card'){ if(t==='delete'){restoreCard(id); return {ok:true};} if(t==='restore'){softDeleteCard(id); return {ok:true};} if(t==='create'){softDeleteCard(id); return {ok:true};} return {ok:false,error:'not_reversible'}; }
  if(k==='scenario'){ if(t==='delete'){restoreScenario(id); return {ok:true};} if(t==='restore'){softDeleteScenario(id); return {ok:true};} if(t==='create'){softDeleteScenario(id); return {ok:true};} return {ok:false,error:'not_reversible'}; }
  return {ok:false,error:'unsupported'};
}

function rowView(ev, onSelect){ const div=document.createElement('div'); div.className='card'; const tgt=ev.target?`${ev.target.kind}:${ev.target.id||'*'}`:'—';
  div.innerHTML=`<div><strong>${ev.type}</strong> <span class="muted small">(${fmtTs(ev.ts)})</span></div><div class="small">target: ${tgt}</div>`;
  div.onclick=()=>onSelect(ev); return div; }

export function mountJournalTab(host){
  host.innerHTML=`
    <h2>Journal</h2>
    <div class="row">
      <div>
        <label>Filtre</label>
        <select id="jFilter">
          <option value="all">Tous</option><option value="create">Créations</option><option value="delete">Suppressions</option>
          <option value="restore">Restaurations</option><option value="update">Mises à jour</option><option value="ai">IA</option>
          <option value="session">Séance</option><option value="save">Saves</option><option value="load">Loads</option><option value="sync">Sync</option>
        </select>
        <div id="jList" style="margin-top:.5rem;max-height:480px;overflow:auto"></div>
      </div>
      <div>
        <label>Détail</label>
        <pre id="jDetail" class="mono small mono-pre card">—</pre>
        <div class="btns">
          <button id="jRestore">↺ Restaurer</button>
          <span id="jState" class="pill mono">—</span>
        </div>
      </div>
    </div>
  `;
  let CURRENT=null;
  const render=()=>{ const mode=host.querySelector('#jFilter').value; const s=readClientBlob(); let arr=Array.isArray(s.decisions)?s.decisions.slice():[]; arr.sort((a,b)=>(b.ts||0)-(a.ts||0)); if(mode!=='all')arr=arr.filter(e=>e.type===mode);
    const root=host.querySelector('#jList'); root.innerHTML=''; if(!arr.length){root.innerHTML='<div class="muted">Aucun évènement</div>'; return;} arr.forEach(ev=>root.appendChild(rowView(ev, ev=>{ CURRENT=ev; host.querySelector('#jDetail').textContent=JSON.stringify(ev,null,2); host.querySelector('#jState').textContent=canRestoreElement(ev)||ev.snapshot?'restaurable':'—'; }))); };
  host.querySelector('#jFilter').onchange=render;
  host.querySelector('#jRestore').onclick=async ()=>{ const st=host.querySelector('#jState'); st.textContent='…'; const ev=CURRENT; if(!ev){st.textContent='—';return;}
    if(ev.snapshot){ const r=await restoreFromSnapshot(ev); st.textContent=r.ok?'OK (snapshot)':(r.error||'ko'); if(r.ok)render(); return; }
    const r2=restoreElement(ev); st.textContent=r2.ok?'OK (élément)':(r2.error||'ko'); if(r2.ok)render(); };
  render(); host.querySelector('#jDetail').textContent='—'; host.querySelector('#jState').textContent='—';
}
