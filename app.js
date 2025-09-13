import { migrateSettingsOnce } from '../core/settings.js';
import { loadDB } from '../core/store.js';
import { updateStorageBadge } from '../core/budget.js';
import { mountSettingsTab } from './tabs/settings.js';
import { mountCardsTab } from './tabs/cards.js';
import { mountProjectorTab } from './tabs/projector.js';
import { mountScenariosTab } from './tabs/scenarios.js';
import { mountJournalTab } from './tabs/journal.js';

function showTab(name){
  ['settings','cards','projector'].forEach(t=>{
    document.getElementById('tab-'+t).style.display = (t===name)?'block':'none';
  });
  // re-mount lightweight when switching
  if (name==='settings') mountSettingsTab();
  if (name==='cards')    mountCardsTab();
  if (name==='projector')mountProjectorTab();
}


function showTab(name){
  ['settings','cards','scenarios','projector','journal'].forEach(t=>{
    document.getElementById('tab-'+t).style.display = (t===name)?'block':'none';
  });
  if (name==='settings')  mountSettingsTab();
  if (name==='cards')     mountCardsTab();
  if (name==='scenarios') mountScenariosTab();
  if (name==='projector') mountProjectorTab();
  if (name==='journal')   mountJournalTab();
}

function boot(){
  migrateSettingsOnce();
  loadDB();
  updateStorageBadge();
  mountSettingsTab();

  document.querySelectorAll('header nav [data-tab]').forEach(b=>{
    b.onclick = ()=> showTab(b.getAttribute('data-tab'));
  });

  // deep-link guest mode if needed (lecture seule futur)
  if (location.hash==='#guest'){ showTab('projector'); } 
}

boot();

