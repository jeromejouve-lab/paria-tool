// src/ui/tabs/scenarios.js
import { isoWeekString, startOfISOWeek, addWeeks, listWeekDays } from '../../core/time.js';
import { listScenarios, createScenario, promoteScenario, softDeleteScenario, restoreScenario, listCards, addCardToScenario, removeCardFromScenario, duplicateCurrentCard, importSelectedToCurrentCard } from '../../domain/reducers.js';
import { getSession } from '../../domain/reducers.js';

const $ = s=>document.querySelector(s);
let anchorDate = new Date();
let selectedScenarioId = '';

function renderWeekHeader(){
  $('#weekLabel').textContent = isoWeekString(anchorDate);
}

function renderScenarioList(){
  const week = isoWeekString(anchorDate);
  const arr = listScenarios('active', week);
  const host = $('#scList'); host.innerHTML='';
  if (!arr.length){ host.innerHTML = `<div class="muted">Aucun scénario pour ${week}</div>`; selectedScenarioId=''; renderPlan(); return; }

  arr.forEach(sc=>{
    const row = document.createElement('div');
    row.style.border='1px solid #333'; row.style.borderRadius='.5rem'; row.style.padding='.5rem'; row.style.margin='.35rem 0';
    row.style.background = sc.working ? '#102a43' : '#151820';
    const chk = document.createElement('input'); chk.type='radio'; chk.name='scSel'; chk.checked = sc.id===selectedScenarioId;
    chk.onchange = ()=>{ selectedScenarioId = sc.id; renderPlan(); };

    const title = document.createElement('span'); title.style.marginLeft='.5rem'; title.textContent = sc.title+' '+(sc.working?'(work)':'');
    const btns = document.createElement('span'); btns.style.float='right';
    const del = document.createElement('button'); del.className='secondary'; del.textContent = sc.state.deleted?'Restaurer':'Supprimer';
    del.onclick = ()=>{ sc.state.deleted? restoreScenario(sc.id): softDeleteScenario(sc.id); renderScenarioList(); };

    const prom = document.createElement('button'); prom.className='secondary'; prom.textContent = 'Promouvoir';
    prom.onclick = ()=>{ promoteScenario(sc.id); renderScenarioList(); };

    btns.append(prom, del);
    row.append(chk, title, btns);
    host.appendChild(row);

    if (!selectedScenarioId) selectedScenarioId = sc.id;
  });

  renderPlan();
}

function renderPlan(){
  const host = $('#planList'); host.innerHTML='';
  if (!selectedScenarioId){ host.innerHTML='<div class="muted">—</div>'; return; }

  // sélecteur d’ajout : cards actives
  const sel = $('#addCardSelect'); sel.innerHTML='';
  listCards('active','').forEach(c=>{
    const opt = document.createElement('option'); opt.value=c.id; opt.textContent=c.title; sel.appendChild(opt);
  });

  // vue hebdo (colonnes jour, lignes items)
  const days = listWeekDays(anchorDate);
  const header = document.createElement('div'); header.style.display='grid'; header.style.gridTemplateColumns='repeat(7, 1fr)'; header.style.gap='.25rem';
  days.forEach(d=>{
    const cell = document.createElement('div'); cell.className='pill'; cell.textContent = d.label; header.appendChild(cell);
  });
  host.appendChild(header);

  // items (cards) groupés par jour
  const sc = listScenarios('active', isoWeekString(anchorDate)).find(x=>x.id===selectedScenarioId);
  const byDay = new Map(days.map(d=>[d.date, []]));
  (sc?.items||[]).forEach(it=>{
    const day = (it.slot||'').slice(0,10);
    const key = byDay.has(day) ? day : days[0].date;
    byDay.get(key).push(it);
  });

  const grid = document.createElement('div'); grid.style.display='grid'; grid.style.gridTemplateColumns='repeat(7, 1fr)'; grid.style.gap='.25rem';
  days.forEach(d=>{
    const col = document.createElement('div'); col.style.minHeight='120px'; col.style.border='1px dashed #333'; col.style.borderRadius='.5rem'; col.style.padding='.35rem';
    const arr = byDay.get(d.date)||[];
    arr.forEach(it=>{
      const wrap = document.createElement('div'); wrap.style.border='1px solid #444'; wrap.style.borderRadius='.35rem'; wrap.style.padding='.35rem'; wrap.style.margin='.25rem 0';
      const c = listCards('active','').find(x=>x.id===it.card_id) || { title: it.card_id };
      wrap.innerHTML = `<strong>${c.title}</strong><div class="muted small">${(it.slot||'').slice(11,16)||''}</div>`;
      const rm = document.createElement('button'); rm.className='secondary'; rm.textContent='Retirer';
      rm.onclick = ()=>{ removeCardFromScenario(selectedScenarioId, it.card_id); renderPlan(); };
      wrap.appendChild(rm);
      col.appendChild(wrap);
    });
    grid.appendChild(col);
  });
  host.appendChild(grid);
}

export function mountScenariosTab(){
  // init semaine à partir d’aujourd’hui
  anchorDate = startOfISOWeek(new Date());
  renderWeekHeader();
  renderScenarioList();

  $('#btnPrevWeek').onclick = ()=>{ anchorDate = addWeeks(anchorDate, -1); renderWeekHeader(); renderScenarioList(); };
  $('#btnNextWeek').onclick = ()=>{ anchorDate = addWeeks(anchorDate, +1); renderWeekHeader(); renderScenarioList(); };

  $('#btnNewScenario').onclick = ()=>{
    const sc = createScenario({ title:'Scénario '+isoWeekString(anchorDate), week: isoWeekString(anchorDate), working:false, items:[] });
    selectedScenarioId = sc.id; renderScenarioList();
  };

  $('#btnPromote').onclick = ()=>{
    if (!selectedScenarioId) { alert('Sélectionner un scénario'); return; }
    promoteScenario(selectedScenarioId); renderScenarioList();
  };

  $('#btnDupCurrentCard').onclick = ()=>{
    const copy = duplicateCurrentCard();
    alert(copy? `Copiée: ${copy.title}` : 'Aucune card courante');
    renderPlan();
  };

  $('#btnAddCard').onclick = ()=>{
    if (!selectedScenarioId){ alert('Sélectionner un scénario'); return; }
    const cardId = $('#addCardSelect').value; if (!cardId) return;
    const hhmm = ($('#slotTime').value||'').trim();
    // slot = date du premier jour + HH:mm si fourni
    const day0 = listWeekDays(anchorDate)[0].date;
    const slot = hhmm && /^\d{2}:\d{2}$/.test(hhmm) ? `${day0}T${hhmm}` : `${day0}`;
    addCardToScenario(selectedScenarioId, cardId, slot); renderPlan();
  };

  $('#btnImportSelected').onclick = ()=>{
    if (!selectedScenarioId){ alert('Sélectionner un scénario'); return; }
    const res = importSelectedToCurrentCard(selectedScenarioId);
    alert(res? 'Propositions importées' : 'Rien à importer / pas de card courante');
  };
}
