// PARIA-V2-CLEAN v1.0.0 | app.js
import * as Settings from './ui/tabs/settings.js';
import * as Charter  from './ui/tabs/charter.js';
import * as Cards    from './ui/tabs/cards.js';
import * as Scens    from './ui/tabs/scenarios.js';
import * as Proj     from './ui/tabs/projector.js';
import * as Journal  from './ui/tabs/journal.js';

const mounts={ settings:Settings.mount, charter:Charter.mount, cards:Cards.mount, scenarios:Scens.mount, projector:Proj.mount, journal:Journal.mount };

export function showTab(tab){
  const all=['settings','charter','cards','scenarios','projector','journal'];
  all.forEach(id=>{ const sec=document.getElementById(`tab-${id}`); if (sec) sec.style.display=(id===tab?'':'none'); });
  const fn=mounts[tab]; if(typeof fn==='function'){ try{ fn(); }catch(e){ console.error('mount error',tab,e); } }
}

export function boot(){
  document.querySelectorAll('nav [data-tab]').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.tab)));
  showTab('settings');
}
if (document.readyState==='complete'||document.readyState==='interactive') setTimeout(boot,0);
else document.addEventListener('DOMContentLoaded',boot);
