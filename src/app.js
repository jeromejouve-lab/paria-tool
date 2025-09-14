// src/app.js — câblé sur ton index.html, UI intouchée
import { mountCardsTab } from './ui/tabs/cards.js';
import { mountCharterTab } from './ui/tabs/charter.js';
import { mountScenariosTab } from './ui/tabs/scenarios.js';
import { mountProjectorTab } from './ui/tabs/projector.js';
import { mountJournalTab } from './ui/tabs/journal.js';
import { mountSettingsTab } from './ui/tabs/settings.js';
import { watchBudget } from './core/budget.js';

const TAB_MAP = {
  settings:   { section: 'tab-settings',   mount: mountSettingsTab },
  charter:    { section: 'tab-charter',    mount: mountCharterTab },
  cards:      { section: 'tab-cards',      mount: mountCardsTab },
  scenarios:  { section: 'tab-scenarios',  mount: mountScenariosTab },
  projector:  { section: 'tab-projector',  mount: mountProjectorTab },
  journal:    { section: 'tab-journal',    mount: mountJournalTab },
};

function getButtons(){ return Array.from(document.querySelectorAll('header nav [data-tab]')); }
function getSections(){ return Object.values(TAB_MAP).map(t => document.getElementById(t.section)).filter(Boolean); }

export function showTab(id){
  const cfg = TAB_MAP[id] || TAB_MAP.cards;

  // masquer toutes les sections, afficher la cible
  getSections().forEach(sec => { sec.style.display = 'none'; });
  const target = document.getElementById(cfg.section);
  if (target) target.style.display = '';

  // état actif des boutons (pour ta bordure LED blanche)
  getButtons().forEach(b=>{
    b.classList.toggle('is-active', b.getAttribute('data-tab') === id);
  });

  // monter le contenu dans la section (sans créer de conteneur)
  if (cfg.mount && target){
    cfg.mount(target);
  }
}

function boot(){
  // câblage des boutons d’onglet
  getButtons().forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.getAttribute('data-tab');
      showTab(id);
    });
  });

  // badge quota (déjà présent dans ton header : #quotaBadge)
  const badge = document.getElementById('quotaBadge');
  watchBudget(usage=>{
    if (!badge) return;
    const pct = Math.round(usage*100);
    badge.textContent = `local ${pct}%`;
    badge.classList.remove('b-green','b-orange','b-red');
    if (pct >= 90)      badge.classList.add('b-red');
    else if (pct >= 70) badge.classList.add('b-orange');
    else                badge.classList.add('b-green');
  });

  // onglet par défaut
  showTab('cards');
}

// ton index.html charge app.js en bas de <body> → DOM déjà prêt
boot();

/*
INDEX app.js:
- TAB_MAP {settings,charter,cards,scenarios,projector,journal}
- getButtons()
- getSections()
- showTab(id)
- boot()
*/
