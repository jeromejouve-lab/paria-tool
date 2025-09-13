import { migrateSettingsOnce } from './core/settings.js';
import { loadDB } from './core/store.js';
import { updateStorageBadge } from './core/budget.js';
import { mountSettingsTab } from './ui/tabs/settings.js';
import { mountCharterTab } from './ui/tabs/charter.js';
import { mountCardsTab } from './ui/tabs/cards.js';
import { mountScenariosTab } from './ui/tabs/scenarios.js';
import { mountProjectorTab } from './ui/tabs/projector.js';
import { mountJournalTab } from './ui/tabs/journal.js';

function showTab(name){
  ['settings','charter','cards','scenarios','projector','journal'].forEach(t=>{
    const s=document.getElementById('tab-'+t);
    if(s) s.style.display=(t===name)?'block':'none';
  });
  if(name==='settings')mountSettingsTab(document.getElementById('tab-settings'));
  if(name==='charter')mountCharterTab(document.getElementById('tab-charter'));
  if(name==='cards')mountCardsTab(document.getElementById('tab-cards'));
  if(name==='scenarios')mountScenariosTab(document.getElementById('tab-scenarios'));
  if(name==='projector')mountProjectorTab(document.getElementById('tab-projector'));
  if(name==='journal')mountJournalTab(document.getElementById('tab-journal'));
}

function boot(){
  migrateSettingsOnce(); loadDB(); updateStorageBadge();
  document.querySelectorAll('header nav [data-tab]').forEach(b=>{ b.onclick=()=>showTab(b.getAttribute('data-tab')); });
  showTab('settings');
  if(location.hash==='#guest'){ showTab('projector'); }
}
boot();
