import { mountCardsTab } from './ui/tabs/cards.js';
import { mountCharterTab } from './ui/tabs/charter.js';
import { mountScenariosTab } from './ui/tabs/scenarios.js';
import { mountProjectorTab } from './ui/tabs/projector.js';
import { mountJournalTab } from './ui/tabs/journal.js';
import { mountSettingsTab } from './ui/tabs/settings.js';

import { getSettings, saveSettings, getWorkId } from './core/settings.js';
import { getBudget, watchBudget } from './core/budget.js';
import { readClientBlob, writeClientBlob, ensureBaseBlob } from './core/store.js';

ensureBaseBlob(); // initialise un blob vide si absent

const TABS = [
  { id:'cards',      title:'Cards',      mount:mountCardsTab },
  { id:'charter',    title:'Charter',    mount:mountCharterTab },
  { id:'scenarios',  title:'Scénarios',  mount:mountScenariosTab },
  { id:'projector',  title:'Projecteur', mount:mountProjectorTab },
  { id:'journal',    title:'Journal',    mount:mountJournalTab },
  { id:'settings',   title:'Réglages',   mount:mountSettingsTab },
];

function mountNav(){
  const nav = document.getElementById('tabs');
  nav.innerHTML = '';
  TABS.forEach(t=>{
    const b = document.createElement('button');
    b.textContent = t.title;
    b.onclick = ()=> showTab(t.id);
    b.id = `tab-${t.id}`;
    nav.appendChild(b);
  });
}

export function showTab(id){
  const root = document.getElementById('root');
  root.innerHTML = '';
  TABS.forEach(t=>{
    const btn = document.getElementById(`tab-${t.id}`);
    if (!btn) return;
    btn.classList.toggle('active', t.id===id);
  });
  const tab = TABS.find(x=>x.id===id) || TABS[0];
  tab.mount(root);
}

function boot(){
  mountNav();
  showTab('cards');
  watchBudget(usage=>{
    const el = document.getElementById('quotaHint');
    if (!el) return;
    const pct = Math.round(usage*100);
    let note = '';
    if (pct>=90) note = '⚠️ 90% — snapshots locaux suspendus, backup Git/Google.';
    else if (pct>=70) note = '⚠️ 70% — alerte.';
    else if (pct>=45) note = 'ℹ️ 45% — préventif.';
    el.textContent = `Stockage ${pct}% ${note}`;
  });
}

boot();

/*
INDEX app.js:
- TABS[]
- mountNav()
- showTab(id)
- boot()
- imports: mount*Tab, getSettings/saveSettings/getWorkId, getBudget/watchBudget, readClientBlob/writeClientBlob/ensureBaseBlob
*/
