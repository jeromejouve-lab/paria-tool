import { isoWeekString, startOfISOWeek, addWeeks, listWeekDays } from '../../core/time.js';
import { listScenarios, createScenario, promoteScenario, softDeleteScenario, restoreScenario, addCardToScenario, removeCardFromScenario, duplicateCurrentCard, importSelectedToCurrentCard } from '../../domain/reducers.js';
import { listCards } from '../../domain/reducers.js';

let anchorDate=new Date(); let selectedScenarioId='';

function renderWeekHeader(host){ host.querySelector('#weekLabel').textContent=isoWeekString(anchorDate); }

function renderPlan(host){
  const hostPlan=host.querySelector('#planList'); hostPlan.innerHTML='';
  if(!selectedScenarioId){hostPlan.innerHTML='<div class="muted">—</div>';return;}
  const sel=host.querySelector('#addCardSelect'); sel.innerHTML='';
  listCards('active','').forEach(c=>{const opt=document.createElement('option'); opt.value=c.id; opt.textContent=c.title; sel.appendChild(opt);});
  const days=listWeekDays(anchorDate);
  const header=document.createElement('div'); header.style.display='grid'; header.style.gridTemplateColumns='repeat(7,1fr)'; header.style.gap='.25rem';
  days.forEach(d=>{const cell=document.createElement('div'); cell.className='pill'; cell.textContent=d.label; header.appendChild(cell);}); hostPlan.appendChild(header);
  const arr=listScenarios('active',isoWeekString(anchorDate)); const sc=arr.find(x=>x.id===selectedScenarioId);
  const byDay=new Map(days.map(d=>[d.date,[]])); (sc?.items||[]).forEach(it=>{const day=(it.slot||'').slice(0,10); const key=byDay.has(day)?day:days[0].date; byDay.get(key).push(it);});
  const grid=document.createElement('div'); grid.style.display='grid'; grid.style.gridTemplateColumns='repeat(7,1fr)'; grid.style.gap='.25rem';
  days.forEach(d=>{const col=document.createElement('div'); col.style.minHeight='120px'; col.style.border='1px dashed #2b2f36'; col.style.borderRadius='.6rem'; col.style.padding='.35rem'; const its=byDay.get(d.date)||[];
    its.forEach(it=>{const wrap=document.createElement('div'); wrap.className='card'; wrap.style.padding='.35rem'; const c=listCards('active','').find(x=>x.id===it.card_id)||{title:it.card_id};
      wrap.innerHTML=`<strong>${c.title}</strong><div class="muted small">${(it.slot||'').slice(11,16)||''}</div>`; const rm=document.createElement('button'); rm.className='secondary'; rm.textContent='Retirer'; rm.onclick=()=>{removeCardFromScenario(selectedScenarioId,it.card_id); renderPlan(host);}; wrap.appendChild(rm); col.appendChild(wrap);});
    grid.appendChild(col);}); hostPlan.appendChild(grid);
}

function renderScenarioList(host){
  const week=isoWeekString(anchorDate); const arr=listScenarios('active',week); const root=host.querySelector('#scList'); root.innerHTML='';
  if(!arr.length){root.innerHTML=`<div class="muted">Aucun scénario pour ${week}</div>`; selectedScenarioId=''; renderPlan(host); return;}
  arr.forEach(sc=>{ const row=document.createElement('div'); row.className='card'; const chk=document.createElement('input'); chk.type='radio'; chk.name='scSel'; chk.checked=sc.id===selectedScenarioId; chk.onchange=()=>{selectedScenarioId=sc.id; renderPlan(host);};
    const title=document.createElement('span'); title.style.marginLeft='.5rem'; title.textContent=sc.title+' '+(sc.working?'(work)':''); const btns=document.createElement('span'); btns.style.float='right';
    const del=document.createElement('button'); del.className='secondary'; del.textContent=sc.state.deleted?'Restaurer':'Supprimer'; del.onclick=()=>{ sc.state.deleted?restoreScenario(sc.id):softDeleteScenario(sc.id); renderScenarioList(host); };
    const prom=document.createElement('button'); prom.className='secondary'; prom.textContent='Promouvoir'; prom.onclick=()=>{promoteScenario(sc.id); renderScenarioList(host);};
    btns.append(prom,del); row.append(chk,title,btns); root.appendChild(row); if(!selectedScenarioId) selectedScenarioId=sc.id; });
  renderPlan(host);
}

export function mountScenariosTab(host){
  anchorDate=startOfISOWeek(new Date());
  host.innerHTML=`
    <h2>Scénarios (vue hebdo)</h2>
    <div class="btns">
      <button id="btnPrevWeek" class="secondary">⟵ Semaine -1</button>
      <span id="weekLabel" class="pill mono">—</span>
      <button id="btnNextWeek" class="secondary">Semaine +1 ⟶</button>
      <button id="btnNewScenario">Nouveau scénario (semaine courante)</button>
      <button id="btnPromote" class="secondary">Promouvoir en version de travail</button>
      <button id="btnDupCurrentCard" class="secondary">Dupliquer card courante</button>
      <button id="btnImportSelected" class="secondary">Importer propositions sélectionnées → card courante</button>
    </div>
    <div class="row">
      <div>
        <label>Scénarios de la semaine</label>
        <div id="scList" class="list"></div>
      </div>
      <div>
        <label>Planning (cards du scénario sélectionné)</label>
        <div class="btns">
          <select id="addCardSelect"></select>
          <input id="slotTime" placeholder="HH:mm (optionnel)" />
          <button id="btnAddCard" class="secondary">Ajouter au planning</button>
        </div>
        <div id="planList" style="margin-top:.5rem;max-height:420px;overflow:auto"></div>
      </div>
    </div>
  `;
  renderWeekHeader(host); renderScenarioList(host);
  host.querySelector('#btnPrevWeek').onclick=()=>{anchorDate=addWeeks(anchorDate,-1); renderWeekHeader(host); renderScenarioList(host);};
  host.querySelector('#btnNextWeek').onclick=()=>{anchorDate=addWeeks(anchorDate,+1); renderWeekHeader(host); renderScenarioList(host);};
  host.querySelector('#btnNewScenario').onclick=()=>{ const sc=createScenario({title:'Scénario '+isoWeekString(anchorDate),week:isoWeekString(anchorDate),working:false,items:[]}); selectedScenarioId=sc.id; renderScenarioList(host); };
  host.querySelector('#btnPromote').onclick=()=>{ if(!selectedScenarioId){alert('Sélectionner un scénario');return;} promoteScenario(selectedScenarioId); renderScenarioList(host); };
  host.querySelector('#btnDupCurrentCard').onclick=()=>{ const copy=duplicateCurrentCard(); alert(copy?`Copiée: ${copy.title}`:'Aucune card courante'); renderPlan(host); };
  host.querySelector('#btnAddCard').onclick=()=>{ if(!selectedScenarioId){alert('Sélectionner un scénario');return;} const cardId=host.querySelector('#addCardSelect').value; if(!cardId)return; const hhmm=(host.querySelector('#slotTime').value||'').trim(); const day0=listWeekDays(anchorDate)[0].date;
    const slot=hhmm&&/^\d{2}:\d{2}$/.test(hhmm)?`${day0}T${hhmm}`:`${day0}`; addCardToScenario(selectedScenarioId,cardId,slot); renderPlan(host); };
  host.querySelector('#btnImportSelected').onclick=()=>{ if(!selectedScenarioId){alert('Sélectionner un scénario');return;} const res=importSelectedToCurrentCard(selectedScenarioId); alert(res?'Propositions importées':'Rien à importer / pas de card courante'); };
}
