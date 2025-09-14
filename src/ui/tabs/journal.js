import { listJournal } from '../../domain/journal.js';
import { restoreCard, restoreScenario, restoreCharter } from '../../domain/reducers.js';
import { getSettings } from '../../core/settings.js';

export function mountJournalTab(host){
  host.innerHTML=`
    <h2>Journal</h2>
    <div class="row">
      <div><label>Types</label><input id="types" placeholder="ex: update,ai-add,delete"></div>
      <button id="apply">Appliquer</button>
    </div>
    <div id="log" class="list"></div>
  `;
  const render=()=>{
    const types=(host.querySelector('#types').value||'').split(',').map(s=>s.trim()).filter(Boolean);
    const rows=listJournal({ types });
    const root=host.querySelector('#log'); root.innerHTML='';
    rows.slice().reverse().forEach(e=>{
      const row=document.createElement('div'); row.className='card small';
      const head=document.createElement('div'); head.className='row';
      head.innerHTML=`<strong>${e.type}</strong> <span class="muted">${new Date(e.ts).toLocaleString()}</span> <span class="pill">${e.target.kind}:${e.target.id}</span>`;
      const pre=document.createElement('pre'); pre.textContent=JSON.stringify(e.payload||{},null,2);
      row.append(head, pre);
      root.appendChild(row);
    });
  };
  host.querySelector('#apply').onclick=()=>render();
  render();
}

/*
INDEX ui/tabs/journal.js:
- mountJournalTab(host)
- imports: listJournal, restoreCard, restoreScenario, restoreCharter, getSettings
*/
