// PARIA-V2-CLEAN v1.0.0 | ui/tabs/cards.js (injection)
import {
  listCards, toggleThink, softDeleteCard,
  addNote, addComment, addAItoCard, updateCard, saveWorkset, listWorksets, addSectionEntry, hideEntry, aiAnalyzeEntry,
  getTabMode, setTabMode, cycleTabMode
} from '../../domain/reducers.js';

import { askAI } from '../../core/ai.js';

import {
  getCardView, setSectionFilters, listCardDays,
  appendCardUpdate, touchCard, __cards_migrate_v2_once, createCard, hydrateOnEnter, startAutoBackup, createMiniFromSource
} from "../../domain/reducers.js";

import { readClientBlob, writeClientBlob } from "../../domain/reducers.js";

const $ = (s,r=document)=>r.querySelector(s);

function _dayKey(ts){
  const d = new Date(ts);
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function fmtTs(ts){ try{ return ts ? new Date(ts).toLocaleString() : ''; }catch{ return ''; } }

export function mountCardsTab(host = document.getElementById('tab-cards')){
  // --- boot cards UI (sticky + zones) ---
  __cards_migrate_v2_once?.();

  let selectedIds = new Set();   // autres cartes sélectionnées
  let primaryId   = null;        // carte courante (halo fort)
  let activeWsId = null; // WS actuellement appliqué (pour halo de sélection)

  host.style.display = 'flex';
  host.style.flexDirection = 'column';

  // on laisse aussi le render initial juste après, pour affichage immédiat du local
  
  let bar = host.querySelector('.btns');
  if (!bar) {
    const b = document.createElement('div');
    b.className = 'btns';
    b.style.cssText = 'display:flex;gap:8px;align-items:center;padding:8px 4px';
    host.prepend(b);
    bar = b;

  }

  if (bar){
    bar.style.position = 'sticky';
    bar.style.top = '0';
    bar.style.zIndex = '2';
    bar.style.background = 'var(--bg,#0f0f10)';
    bar.style.paddingBottom = '8px';
  }

  // -- contrôles de session distants (état global) --
  const stateBox = document.createElement('div');
  stateBox.className = 'cards-remote-state';
  stateBox.style.cssText = 'display:flex;gap:8px;align-items:center;margin-left:auto';
  stateBox.innerHTML = `
    <span class="muted">Projecteur:</span>
    <button class="btn btn-xxs" data-act="cycle-proj" title="on → pause → off">⟳</button>
    <strong id="mode-proj" class="muted"></strong>
    <span style="width:12px;display:inline-block"></span>
    <span class="muted">Séances:</span>
    <button class="btn btn-xxs" data-act="cycle-sea" title="on → pause → off">⟳</button>
    <strong id="mode-sea" class="muted"></strong>
  `;
  bar.appendChild(stateBox);

  const refreshModes = ()=>{
    stateBox.querySelector('#mode-proj').textContent = getTabMode('projector');
    stateBox.querySelector('#mode-sea').textContent  = getTabMode('seance');
  };
  bar.addEventListener('click', (ev)=>{
    const a = ev.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act==='cycle-proj'){ cycleTabMode('projector'); refreshModes(); return; }
    if (a.dataset.act==='cycle-sea'){  cycleTabMode('seance');    refreshModes(); return; }
  });
  document.addEventListener('paria:tabs-changed', refreshModes);
  refreshModes();
  
  let timeline = host.querySelector('#cards-timeline');
  let detail = host.querySelector('#card-detail');
  
  if (!timeline){
    timeline = document.createElement('div');
    timeline.id = 'cards-timeline';
    timeline.style.cssText = 'display:flex;gap:8px;overflow:auto;padding:8px 4px;';
    // 1) insérer d'abord la timeline dans le DOM
    bar ? bar.insertAdjacentElement('afterend', timeline) : host.prepend(timeline);
  }
  
  // 2) garantir le conteneur d'actions SOUS la timeline (même si elle existait déjà)
  let actions = host.querySelector('#cards-actions');
  if (!actions){
    actions = document.createElement('div');
    actions.id = 'cards-actions';
    actions.style.cssText = 'display:flex;gap:8px;align-items:center;padding:8px 4px';
    timeline.insertAdjacentElement('afterend', actions);
  }
  // 3) garantir le bouton "Enregistrer la sélection"
  if (!actions.querySelector('[data-action="workset-save"]')){
    const btn = document.createElement('button');
    btn.className = 'btn btn-xs';
    btn.dataset.action = 'workset-save';
    btn.textContent = 'Enregistrer la sélection';
    actions.appendChild(btn);
  }
  
  if (!actions.querySelector('[data-action="consolidate-selection"]')){
    const btn2 = document.createElement('button');
    btn2.className = 'btn btn-xs';
    btn2.dataset.action = 'consolidate-selection';
    btn2.textContent = 'Consolider la sélection';
    actions.appendChild(btn2);
  }

  if (!detail){
    detail = document.createElement('div');
    detail.id = 'card-detail';
    detail.style.cssText = 'flex:1 1 auto; overflow:auto; padding:8px 4px 16px;';
    host.appendChild(detail);
  }
  
  // --- Overlay calendrier multi-jours par section ---
  let calOverlay=null;
  function ensureCalOverlay(){
    if (calOverlay) return calOverlay;
    calOverlay = document.createElement('div');
    calOverlay.id = 'cards-cal-overlay';
    calOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;z-index:9999';
    calOverlay.innerHTML = `<div id="cards-cal-panel" style="background:#111;border:1px solid #333;border-radius:12px;min-width:360px;max-width:680px;max-height:80vh;overflow:auto;padding:12px">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
        <strong style="font-size:14px">Sélection de jours</strong>
        <span style="margin-left:auto"></span>
        <button class="btn btn-xs" data-cal="apply">Appliquer</button>
        <button class="btn btn-xs" data-cal="close">Fermer</button>
      </div>
      <div class="months"></div>
    </div>`;
    document.body.appendChild(calOverlay);
    calOverlay.addEventListener('click',(e)=>{
      if (e.target===calOverlay || e.target.getAttribute('data-cal')==='close') calOverlay.style.display='none';
    });
    return calOverlay;
  }

  function showSectionCalendar(cardId, secId){
    const ov = ensureCalOverlay();
    const b = readClientBlob();
    const card = (b.cards||[]).find(x=>String(x.id)===String(cardId));
    const f = (card.ui?.filters?.[secId]) || {days:[], types:['analyse','ai_md','note','comment','client_md','client_html']};
    
    // Si "Historique (famille)" est coché sur la section, on agrège les jours de toute la filiation
    const secEl = detail.querySelector(`.card-block[data-card="${cardId}"] .section[data-sec="${secId}"]`);
    const familyMode = !!(secEl && secEl.dataset.history === '1');
    let days = [];
    if (!familyMode){
      days = listCardDays(cardId, secId);
    } else {
      const b2 = readClientBlob();
      const card = (b2.cards||[]).find(x=>String(x.id)===String(cardId));
      const familyIds = [...new Set([...(card?.source_ids||[]), card?.parent_id, card?.id].map(String).filter(Boolean))];
      const set = new Set();
      for (const fid of familyIds){
        const c = (b2.cards||[]).find(x=>String(x.id)===String(fid));
        const ups = (c?.updates||[]).filter(u => u?.section_id === secId);
        for (const u of ups) set.add(_dayKey(u.ts));
      }
      days = Array.from(set).sort();
    }

    // grouper par mois
    const byMonth = {};
    for(const d of days){
      const m = d.slice(0,7); // YYYY-MM
      (byMonth[m]=byMonth[m]||[]).push(d);
    }
    const months = Object.keys(byMonth).sort();
    const box = ov.querySelector('.months');
    box.innerHTML = months.map(m=>{
      const items = byMonth[m].map(d=>`
        <label class="chip"><input type="checkbox" data-cal="day" value="${d}" ${f.days.includes(d)?'checked':''}> ${d}</label>
      `).join('');
      return `<section style="border:1px solid #2a2a2a;border-radius:10px;padding:8px;margin:8px 0">
        <div style="opacity:.8;font-size:12px;margin-bottom:6px">${m}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${items||'<em style="opacity:.6">Aucun jour</em>'}</div>
      </section>`;
    }).join('') || '<div style="opacity:.6">Aucun jour disponible</div>';
  
    // appliquer
    const apply = ov.querySelector('[data-cal="apply"]');
    apply.onclick = ()=>{
      const sel = Array.from(ov.querySelectorAll('[data-cal="day"]:checked')).map(x=>x.value);
      setSectionFilters(cardId, secId, {days: sel, types: f.types});
      ov.style.display='none';
      renderDetail(cardId);
    };
    ov.style.display='flex';
  }

  function renderTimeline(){
    const b = readClientBlob();
    const items = [
      ...(b.worksets||[]).map(ws => ({
        kind:'ws',
        id: 'ws:'+ws.id,
        ts: ws.last_used_ts || ws.created_ts || 0,
        ws
      })),
      ...(b.cards||[]).map(c => ({
        kind:'card',
        id: String(c.id),
        ts: c.updated_ts || c.created_ts || 0,
        card: c
      })),
    ].sort((a,b)=> a.ts < b.ts ? 1 : -1);

    function esc(s){ return String(s||'').replace(/</g,'&lt;'); }
    
    const html = items.map(it=>{
      if (it.kind==='ws'){
        const ws = it.ws;
        const created = ws.created_ts ? new Date(ws.created_ts).toLocaleString() : '';
        const tip = `${esc(ws.title||'Sélection')} — ${(ws.card_ids||[]).length} card(s)`;
        return `
        <article class="card-mini is-workset${activeWsId===ws.id?' is-selected':''}"
         data-kind="workset" data-wsid="${ws.id}"
         title="${tip}"
         style="border-radius:12px;border:1px solid #ffea00;background:#1a1608;box-shadow:0 0 0 2px #ffea00 inset;min-width:220px;padding:6px 8px">
          <header style="display:flex;align-items:center;gap:6px;font-size:12px;opacity:.85">
            <span class="badge" style="background:#f6c24a;color:#111;padding:0 6px;border-radius:999px;font-weight:600">WS</span>
            <span class="ts" style="margin-left:auto">${created}</span>
            <button class="btn btn-xxs" title="Supprimer le workset" data-action="ws-delete" data-wsid="${ws.id}" style="margin-left:8px">🗑️</button>
          </header>
          <div style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">
            ${esc(ws.title||'Sélection')}
          </div>
        </article>`;
      } else {
        const c = it.card;
        const id   = String(c.id);
        const isDel= !!(c.state?.deleted);
        const isAct= String(primaryId||'')===id;
        const isSel= (selectedIds||new Set()).has(id);
        const cls  = `card-mini ${isDel?'is-del':''} ${isAct?'is-active':''} ${isSel?'is-selected':''}`;
        const title= (
          (c.title && c.title.trim())
          || (b.charter?.title && b.charter.title.trim())
          || (b.charter?.service ? ('Service: '+b.charter.service) : 'Sans titre')
        ).replace(/</g,'&lt;');
        const ts   = new Date(c.updated_ts || c.created_ts || Date.now()).toLocaleString();
        const btn  = isDel ? '↩︎' : '🗑️';
        const tip  = isDel ? 'Restaurer' : 'Supprimer';
        const think= c.state?.think ? ' • 🤔' : '';
        // halo orange pour consolidation, rouge si supprimée (classe is-del), sinon défaut
        const halo = c.state?.consolidated ? 'box-shadow:0 0 0 2px #ff8c00 inset;border-color:#ff8c00;' : '';
    
        return `
        <article class="${cls}" data-kind="card" data-card-id="${id}"
                 title="${esc(title)}"
                 style="border-radius:12px;border:1px solid #2a2a2a;${halo}padding:6px 8px;min-width:220px;background:#141415">
          <header style="display:flex;align-items:center;gap:6px;font-size:12px;opacity:.85">
            <span>#${id}${think}</span>
            ${c.state?.consolidated ? '<span class="badge" title="Consolidation" style="background:#ff8c00;color:#111;padding:0 6px;border-radius:999px;font-weight:600;margin-left:6px">🧩</span>' : ''}
            <span class="ts" style="margin-left:auto">${ts}</span>
            <button class="btn btn-xxs" title="Dupliquer (nouvelle card)" data-action="mini-duplicate" data-id="${id}" style="margin-left:8px">＋</button>
            <button class="btn btn-xxs" title="${tip}" data-action="mini-soft-delete" data-id="${id}" style="margin-left:8px">${btn}</button>
          </header>
          <div style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">
            ${title}
          </div>
          ${c.kind==='mini'
            ? `<div class="family" style="font-size:11px;opacity:.75;margin-top:4px">
                  Famille : ${
                    [...new Set([...(c.source_ids||[]), c.parent_id].filter(Boolean))]
                    .map(fid=>`<a href="#" data-action="goto-card" data-id="${fid}">#${fid}</a>`).join(' ')
                  }
               </div>`
            : ''
          }
        </article>`;
      }
    }).join('');
    
    timeline.innerHTML = html || '<em style="opacity:.6;padding:4px 0">Aucune card</em>';
    
  }
  
  renderTimeline();

  document.addEventListener('paria:blob-updated', () => {
    try { renderTimeline(); renderDetail(); } catch {}
  }, { passive:true });
        
  timeline.addEventListener('click',(ev)=>{
    // 🗑️ / ↩︎ : ne change PAS la sélection
    const del = ev.target.closest('[data-action="mini-soft-delete"]');
    if (del){
      const id = String(del.dataset.id);
      const b  = readClientBlob();
      const c  = (b.cards||[]).find(x=>String(x.id)===String(id));
      if (!c) return;
    
      const nowDel = !c.state?.deleted;
      softDeleteCard(id, nowDel);
    
      // MAJ sélection : si supprimée → retirer du Set + gérer la primaire
      if (nowDel){
        if (selectedIds?.has?.(id)) selectedIds.delete(id);
        if (String(primaryId||'')===id) primaryId = null;
      }
  
      renderTimeline();
      renderDetail();   // <-- re-render multi-cards (la supprimée disparaît du détail)

      if (!selectedIds || selectedIds.size===0){
        primaryId = null;
        const detail = host.querySelector('#card-detail');
        detail.innerHTML = '<div style="opacity:.7">Aucune card sélectionnée</div>';
        return;
      }
      return;
    }

    // Dupliquer -> créer une mini depuis la source courante
    const dup = ev.target.closest('[data-action="mini-duplicate"]');
    if (dup){
      const id = String(dup.dataset.id);
      const newId = createMiniFromSource(id);
      selectedIds = new Set();
      primaryId   = String(newId);
      renderTimeline(); renderDetail();
      return;
    }

    // Cliquer sur #id -> focus (Ctrl/⌘ pour multi-sélection)
    const go = ev.target.closest('[data-action="goto-card"]');
    if (go){
      const id = String(go.dataset.id);
      if (ev.ctrlKey || ev.metaKey){
        if (!selectedIds) selectedIds = new Set();
        selectedIds.add(id);
        if (!primaryId) primaryId = id;
      } else {
        selectedIds = new Set([id]);
        primaryId   = id;
      }
      renderTimeline(); renderDetail();
      ev.preventDefault();
      return;
    }

    // clic sur mini-card
    const btn = ev.target.closest('[data-card-id]');
    if (!btn) return;
    if (btn.classList.contains('is-del')) return; // supprimées = non sélectionnables
  
    const id = String(btn.getAttribute('data-card-id'));
  
    if (ev.ctrlKey || ev.metaKey){
      // toggle sans casser la sélection en cours
      if (!selectedIds) selectedIds = new Set();
      if (selectedIds.has(id)) selectedIds.delete(id);
      else selectedIds.add(id);
      if (!primaryId) primaryId = id; // première primaire si inexistante
    } else {
      // sélection simple
      selectedIds = new Set([id]);
      primaryId   = id;
    }
  
    host.dataset.selectedCardId = primaryId || id; // rétrocompat
    activeWsId = null;

    renderTimeline();              // met à jour le halo
    renderDetail(); // ouvre le détail
  });

  function renderDetail(){
    const detail = host.querySelector('#card-detail');
    const b = readClientBlob();
  
    // ordre : primaire d'abord, puis autres sélectionnées
    const ids = [];
    if (primaryId) ids.push(String(primaryId));
    for (const x of (selectedIds||new Set())) if (String(x)!==String(primaryId)) ids.push(String(x));
    if (!ids.length){ detail.innerHTML = '<div style="opacity:.7">Aucune card sélectionnée</div>'; return; }
  
    const chunks = [];
  
    for (const cardId of ids){
      const card = (b.cards||[]).find(x=>String(x.id)===String(cardId));
      if (!card || card.state?.deleted) continue;
      if (!card.sections?.length){ card.sections=[{id:'1', title:'Proposition'}]; writeClientBlob(b); }
  
      // header card
      chunks.push(`
        <div class="card-block" data-card="${card.id}" style="border:1px solid #2a2a2a;border-radius:12px;margin:8px 0;background:#141415">
          <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #2a2a2a">
            <strong>#${card.id}</strong>${card.state?.think?'&nbsp;🤔':''}
            <span style="margin-left:8px">${(card.title || b.charter?.title || (b.charter?.service?('Service: '+b.charter.service):'Sans titre'))
.replace(/</g,'&lt;')}</span>
            <span style="margin-left:auto;opacity:.8;font-size:12px">${new Date(card.updated_ts||card.created_ts||Date.now()).toLocaleString()}</span>
          </div>
      `);
  
      // sections
      for (const sec of (card.sections||[])){
        const f = (card.ui?.filters?.[sec.id]) || {days:[], types:['analyse','ai_md','note','comment','client_md','client_html'], history:false};
        const days = listCardDays(card.id, sec.id);
        const view = getCardView(card.id, { sectionId: sec.id, days: f.days, types: f.types });
  
        const chipsDays = days.map(d=>`<label class="chip">
          <input type="checkbox" data-action="sec-day" data-card="${card.id}" data-sec="${sec.id}" value="${d}" ${f.days.includes(d)?'checked':''}> ${d}
        </label>`).join('');
  
        const typeNames = [
          ['analyse','Analyse'],
          ['ai_md','IA (md)'],
          ['note','Note'],
          ['comment','Commentaire'],
          ['client_md','Client MD'],
          ['client_html','Client HTML']
        ];
        const chipsTypes = typeNames.map(([val,lab])=>`<label class="chip">
          <input type="checkbox" data-action="sec-type" data-card="${card.id}" data-sec="${sec.id}" value="${val}" ${f.types.includes(val)?'checked':''}> ${lab}
        </label>`).join('');
  
        const groups = view.groups.map(g=>`
          <section class="day-group" data-day="${g.day}" style="border:1px dashed #2a2a2a;border-radius:10px;padding:8px;margin:8px 0">
            <div style="font-size:12px;opacity:.8;margin-bottom:6px">${g.day}</div>
            ${g.items.map(u=>`
              <article class="upd" data-upd="${u.id}" data-card="${card.id}" data-sec="${sec.id}"
                style="border:1px solid #333;border-radius:8px;padding:8px;margin:6px 0;background:#181818">
                <div class="upd-head" style="display:flex;gap:8px;align-items:center;font-size:12px;opacity:.9">
                  <span>${new Date(u.ts).toLocaleTimeString()}</span>
                  ${u.origin?`<span>• ${u.origin}</span>`:''}
                  ${u.type?`<span>• ${u.type}</span>`:''}
                  ${u.meta?.think?`<span>• 🤔</span>`:''}
                  <label style="margin-left:auto;font-weight:500">
                    <input type="checkbox" data-action="exp-pick" data-card="${card.id}" data-upd="${u.id}"> sélectionner
                  </label>
                  <label style="margin-left:8px;opacity:.9">
                    <input type="checkbox" data-action="hide-upd" data-card="${card.id}" data-upd="${u.id}"> masquer
                  </label>
                </div>
                <div class="upd-body">
                  <pre style="white-space:pre-wrap;margin:6px 0 0 0">${(u.md ?? u.html ?? u.content ?? '').replace(/</g,'&lt;')}</pre>
                  ${u.meta?.prompt?`<details style="margin-top:6px"><summary>Prompt</summary><pre style="white-space:pre-wrap">${(u.meta.prompt||'').replace(/</g,'&lt;')}</pre></details>`:''}
                </div>
              </article>
            `).join('')}
          </section>
        `).join('');
  
        chunks.push(`
          <div class="section" data-sec="${sec.id}" data-history="${f.history?1:0}" style="padding:10px">
            <header style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
              <h4 style="margin:0">${(sec.title||('Section '+sec.id)).replace(/</g,'&lt;')}</h4>
              <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
                ${chipsDays}
                ${chipsTypes}
                <label class="chip">
                  <input type="checkbox" data-action="sec-history" data-card="${card.id}" data-sec="${sec.id}" ${f.history?'checked':''}> Historique (famille)
                </label>
                <button class="btn btn-xs" data-action="sec-calendar" data-card="${card.id}" data-sec="${sec.id}">Calendrier</button>
                <button class="btn btn-xs" data-action="sec-select-all" data-card="${card.id}" data-sec="${sec.id}">Sélectionner tout</button>
                <button class="btn btn-xs" data-action="sec-clear" data-card="${card.id}" data-sec="${sec.id}">Tout masquer</button>
                <button class="btn btn-xs" data-action="pick-family">Afficher la famille</button>
              </div>
            </header>
            ${groups || '<div style="opacity:.6;padding:6px 0">Aucun élément pour ce filtre.</div>'}
          </div>
        `);
      }
      chunks.push(`</div>`); // fin card-block
    }
  
    detail.innerHTML = chunks.join('') + `
      <div class="export-bar" style="position:sticky;bottom:0;padding:8px;background:#101010;border-top:1px solid #2a2a2a;display:flex;gap:8px">
        <button class="btn btn-xs" data-action="exp-md">Exporter MD (sélection)</button>
        <button class="btn btn-xs" data-action="exp-html">Exporter HTML (sélection)</button>
        <button class="btn btn-xs" data-action="exp-print">Imprimer/PDF (sélection)</button>
        <button class="btn btn-xs" data-action="imp-md-file">Importer MD (nouvelle card)</button>
        <input type="file" id="imp-md-file" accept=".md,.markdown,.txt" style="display:none">
      </div>
    `;
  }

  // -- composer par section (sous le header de section) --
  function attachSectionComposer(sectionRoot, { cardId, sectionId }) {
    let box = sectionRoot.querySelector('.composer');

    if (!box) {
      box = document.createElement('div');
      box.className = 'composer';
      box.style.cssText = 'display:flex;gap:6px;margin:8px 0;';
      box.innerHTML = `
        <textarea class="composer-text" rows="2" style="flex:1"></textarea>
        <button class="composer-add">+ </button>
        <button class="composer-ai">IA</button>
      `;
      sectionRoot.appendChild(box);
    }
    const ta = box.querySelector('.composer-text');
    box.querySelector('.composer-add').onclick = () => {
      const txt = (ta.value||'').trim();
      if (!txt) return;
      addSectionEntry(cardId, sectionId, { text: txt, author:'client' });
      ta.value = '';
      // rerender local (le code existant de render est déjà appelé après append)
    };
    box.querySelector('.composer-ai').onclick = async () => {
      const txt = (ta.value||'').trim();
      if (!txt) return;
      const prep = await aiAnalyzeEntry({ cardId, updateId: addSectionEntry(cardId, sectionId, { text: txt, author:'client' }), sectionId });
      // demander l’IA avec le contexte charter + commentaire
      const resp = await askAI({ route:'ai', work_id: buildWorkId?.(), task: { mode:'paria', subject:{kind:'card'}, payload:{ text: txt, sectionId }, context:{ charter:getCharter?.(), tab:'cards' } } });
      if (resp?.status==='ok' && Array.isArray(resp.results)) {
        addAItoCard(cardId, resp.results);
      }
      ta.value='';
    };
  }


  
  // -- actions sur les petites cards (compact) --

  detail.addEventListener('change', (ev)=>{
    const cb = ev.target.closest('input[type="checkbox"]');
    if (!cb) return;
    const cardId = cb.dataset.card || host.dataset.selectedCardId; // <-- clé
    if (!cardId) return;
  
    // toggle days
    // sec-day
    if (cb.dataset.action==='sec-day'){
      const sec = cb.dataset.sec;
      const b = readClientBlob();
      const card = (b.cards||[]).find(x=>String(x.id)===String(cardId));
      const f = (card.ui?.filters?.[sec]) || { days:[], types:['analyse','ai_md','note','comment','client_md','client_html'] };
      const set = new Set(f.days||[]);
      cb.checked ? set.add(cb.value) : set.delete(cb.value);
      setSectionFilters(cardId, sec, {days:[...set], types:f.types});
      renderDetail();
      return;
    }
    // sec-type
    if (cb.dataset.action==='sec-type'){
      const sec = cb.dataset.sec;
      const b = readClientBlob();
      const card = (b.cards||[]).find(x=>String(x.id)===String(cardId));
      const f = (card.ui?.filters?.[sec]) || { days:[], types:['analyse','ai_md','note','comment','client_md','client_html'] };
      const set = new Set(f.types||[]);
      cb.checked ? set.add(cb.value) : set.delete(cb.value);
      setSectionFilters(cardId, sec, {days:f.days, types:[...set]});
      renderDetail();
      return;
    }

    // sec-history : bascule affichage jours = card seule / famille complète
    if (cb.dataset.action==='sec-history'){
      const sec = cb.dataset.sec;
      const cardId = cb.dataset.card || host.dataset.selectedCardId; if(!cardId) return;
      // marqueur DOM immédiat
      const secEl = detail.querySelector(`.card-block[data-card="${cardId}"] .section[data-sec="${sec}"]`);
      if (secEl) secEl.dataset.history = cb.checked ? '1' : '0';
      // persistance (si reducers accepte des clés en plus dans filters)
      try {
        const b = readClientBlob();
        const card = (b.cards||[]).find(x=>String(x.id)===String(cardId));
        const f = (card?.ui?.filters?.[sec]) || {days:[], types:['analyse','ai_md','note','comment','client_md','client_html']};
        setSectionFilters(cardId, sec, { ...f, history: !!cb.checked });
      } catch {}
      renderDetail();
      return;
    }

    // exp-pick : rien à faire à part la case cochée
    if (cb.dataset.action==='exp-pick'){
      return;
    }
    
    // hide-upd : masque uniquement le corps
    // remplace les deux blocs par CE SEUL bloc
    if (cb.dataset.action==='hide-upd'){
      const art = cb.closest('.upd');
      if (art) art.classList.toggle('is-hidden', cb.checked);
      const cardId = cb.dataset.card || host.dataset.selectedCardId;
      const updId  = cb.dataset.upd;
      if (cardId && updId) hideEntry(cardId, updId, cb.checked); // persiste dans paria.blob
      return;
    }

    const art = cb.closest('.upd');
    if (art) art.classList.toggle('is-hidden', cb.checked);
    return;

  });

  // -- actions globales sur l'onglet (ex: workset-save sous la timeline)
  // évite les doublons si mountCardsTab est rappelé
  if (!host.dataset.cardsHandlersBound) {
    host.dataset.cardsHandlersBound = '1';
  
    host.addEventListener('click', (ev)=>{
  
      // 1) Enregistrer la sélection (workset-save)
      {
        const btn = ev.target.closest('[data-action="workset-save"]');
        if (btn){
          const ids = [];
          if (primaryId) ids.push(String(primaryId));
          for (const x of (selectedIds||new Set())) if (String(x)!==String(primaryId)) ids.push(String(x));
          if (!ids.length) { alert('Aucune card sélectionnée.'); return; }
          const title = prompt('Nom de la sélection (workset) :', 'Sélection du jour');
          if (title!=null){
            saveWorkset({ title, card_ids: ids });
            renderTimeline(); // affiche la tuile WS
          }
          return;
        }
      }
  
      // 2) Appliquer un workset (clic sur tuile WS, hors boutons)
      {
        const wsTile = ev.target.closest('.card-mini[data-kind="workset"]');
        if (wsTile && !ev.target.closest('button')){
          const wid = String(wsTile.getAttribute('data-wsid')||'');
          const b = readClientBlob();
          const ws = (b.worksets||[]).find(x=>String(x.id)===wid);
          activeWsId = ws.id;
          if (ws && ws.card_ids?.length){
            primaryId   = String(ws.card_ids[0]);
            selectedIds = new Set(ws.card_ids.slice(1).map(String));
            // maj “dernier usage” pour le tri
            ws.last_used_ts = Date.now();
            writeClientBlob(b);
            renderTimeline();
            renderDetail();
          }
          return;
        }
      }
  
      // 3) Supprimer un workset (bouton 🗑️ sur tuile WS)
      {
        const del = ev.target.closest('button[data-action="ws-delete"]');
        if (del){
          const wid = String(del.getAttribute('data-wsid')||'');
          const b = readClientBlob();
          b.worksets = (b.worksets||[]).filter(x=>String(x.id)!==wid);
          writeClientBlob(b);
          renderTimeline(); // la tuile WS disparaît
          return;
        }
      }
  
      // 4) Consolider la sélection (bouton sous timeline)
      {
        const btnCons = ev.target.closest('[data-action="consolidate-selection"]');
        if (btnCons){
          const ids = [];
          if (primaryId) ids.push(String(primaryId));
          for (const x of (selectedIds||new Set())) if (String(x)!==String(primaryId)) ids.push(String(x));
          if (!ids.length){ alert('Aucune card sélectionnée.'); return; }
  
          const title = prompt('Titre de la consolidation :','Consolidation');
          const newId = createCard({ title: title||'Consolidation', tags:['consolidation'] });
  
          // marquer consolidation + provenance (meta)
          const b = readClientBlob();
          const nc = (b.cards||[]).find(c=>String(c.id)===String(newId));
          if (nc){
            nc.state = nc.state || {};
            nc.state.consolidated = true;                 // halo orange
            nc.meta = nc.meta || {};
            nc.meta.consolidated_from = ids.slice();      // provenance
            nc.updated_ts = Date.now();
            writeClientBlob(b);
          }
          // -- recopier le contenu des cards sélectionnées dans la nouvelle card --
          // on duplique les updates par section ; chaque card src devient une section dédiée
          {
            const srcIds = ids.slice();
            const b2 = readClientBlob();
            for (const sid of srcIds){
              const src = (b2.cards||[]).find(x=>String(x.id)===String(sid));
              if (!src) continue;
              // id de section unique dans la card consolidée
              const secId = `c${src.id}`;
              const secTitle = (src.title || `Card #${src.id}`);
              for (const u of (src.updates||[])){
                appendCardUpdate(String(newId), secId, {
                  ts: u.ts,
                  origin: u.origin,
                  type: u.type,
                  md: u.md,
                  html: u.html,
                  section_title: secTitle,                  // crée la section si absente
                  meta: { ...(u.meta||{}), source_card: src.id, source_section: u.section_id, source_update: u.id }
                });
              }
            }
            touchCard(String(newId)); // met à jour updated_ts
          }

          // montrer la nouvelle card (mini-card visible immédiatement)
          primaryId = String(newId);
          selectedIds = new Set();
          renderTimeline();
          renderDetail();
          return;
        }
      }
  
    });
  }
 
  detail.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('[data-action]');
    if (!btn) return;
    const cardId = host.dataset.selectedCardId;
  
    if (btn.dataset.action==='sec-select-all'){
      const cardId = btn.dataset.card; // important en mode multi-cards
      const secId  = btn.dataset.sec;
      const scope  = detail.querySelector(`.card-block[data-card="${cardId}"] .section[data-sec="${secId}"]`);
      scope?.querySelectorAll('[data-action="exp-pick"]').forEach(x=>x.checked=true);
      return;
    }

    if (btn.dataset.action==='sec-clear'){
      const sec = btn.dataset.sec;
      detail.querySelectorAll(`.section[data-sec="${sec}"] .upd`).forEach(x=>{
        x.classList.add('is-hidden');
        const h = x.querySelector('input[data-action="hide-upd"]');
        if (h) h.checked = true;
      });
      return;
    }
    if (btn.dataset.action==='sec-calendar'){
      const sec = btn.dataset.sec;
      const cardId = btn.dataset.card || host.dataset.selectedCardId;
      if (!cardId) return;
      showSectionCalendar(cardId, sec);
      return;
    }

    if (btn.dataset.action==='sec-import-md'){
      const sec = btn.dataset.sec;
      const cardId = host.dataset.selectedCardId; if(!cardId) return;
      const md = prompt('Colle le Markdown du client :');
      if (md!=null){
        appendCardUpdate(cardId, sec, { origin:'client', type:'client_md', md });
        touchCard(cardId);
        renderDetail(cardId);
      }
      return;
    }
    if (btn.dataset.action==='sec-import-html'){
      const sec = btn.dataset.sec;
      const cardId = host.dataset.selectedCardId; if(!cardId) return;
      const html = prompt('Colle le HTML du client (source de confiance) :');
      if (html!=null){
        appendCardUpdate(cardId, sec, { origin:'client', type:'client_html', html });
        touchCard(cardId);
        renderDetail(cardId);
      }
      return;
    }
    if (btn.dataset.action==='pick-family'){

      // On part de la carte primaire (ou la seule sélectionnée)
      const b = readClientBlob();
      const cur = (b.cards||[]).find(x=>String(x.id)===String(primaryId||host.dataset.selectedCardId||''));
      if (!cur) return;
      const fam = [...new Set([...(cur.source_ids||[]), cur.parent_id, cur.id].filter(Boolean))].map(String);
      
      // sélection = toute la famille, primaire = la plus récente (dernier id)
      selectedIds = new Set(fam.filter(id=>String(id)!==String(cur.id)));
      primaryId = String(cur.id);
      renderTimeline();
      renderDetail();
      return;
    }

    // import .md => nouvelle card
    if (btn.dataset.action==='imp-md-file'){
      const input = document.getElementById('imp-md-file');
      if (!input) return;
      input.value = '';
      input.onchange = async (e)=>{
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const text = await file.text();
        const name = (file.name||'client.md').replace(/\.[^.]+$/,'').trim() || 'Client';
        const newId = createCard({ title: name });
        // update client_md dans section "Client" (id 's1' par défaut)
        appendCardUpdate(String(newId), 's1', {
          origin:'client', type:'client_md', md: text, section_title:'Client'
        });
        touchCard(String(newId));
        // focus timeline/détail
        selectedIds = new Set(); primaryId = String(newId);
        renderTimeline(); renderDetail();
      };
      input.click();
      return;
    }

    // exports
    if (btn.dataset.action==='exp-md' || btn.dataset.action==='exp-html' || btn.dataset.action==='exp-print'){
      
      // 1) cartes concernées = primaire puis autres sélectionnées
      const ids = [];
      if (primaryId) ids.push(String(primaryId));
      for (const x of (selectedIds||new Set())) if (String(x)!==String(primaryId)) ids.push(String(x));
      if (!ids.length) return;
    
      // 2) cases cochées -> groupées par card
      const picks = Array.from(detail.querySelectorAll('[data-action="exp-pick"]:checked'));
      const picksByCard = new Map();
      if (picks.length){
        for (const el of picks){
          const cid = String(el.getAttribute('data-card'));
          const uid = String(el.getAttribute('data-upd'));
          if (!picksByCard.has(cid)) picksByCard.set(cid, new Set());
          picksByCard.get(cid).add(uid);
        }
      } else {
      
        // si aucune case cochée : on exporte TOUT des cards sélectionnées
        for (const cid of ids) picksByCard.set(String(cid), null);
      }
    
      const b = readClientBlob();
      const esc = s=>(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
    
      // 3) Construit le contenu multi-card
      const outMD = [];
      const outHTML = [];
    
      for (const cid of ids){
        const card = (b.cards||[]).find(x=>String(x.id)===String(cid));
        if (!card || card.state?.deleted) continue;
        const chosen = (()=> {
          const wanted = picksByCard.get(String(cid)); // null => tout
          const all = (card.updates||[]).slice().sort((a,b)=>a.ts<b.ts?1:-1);
          return wanted ? all.filter(u=>wanted.has(String(u.id))) : all;
        })();
        if (!chosen.length) continue;
    
        // group by day
        const groups = {};
        for (const u of chosen){ const k=_dayKey(u.ts); (groups[k]=groups[k]||[]).push(u); }
    
        // MD
        outMD.push(`# Card #${cid}${card.state?.think?' 🤔':''} — ${(card.title||b.charter?.title||'Sans titre')}`);
        for (const day of Object.keys(groups).sort((a,b)=>a<b?1:-1)){
          for (const u of groups[day]){
            const meta = [];
            meta.push(new Date(u.ts).toLocaleTimeString());
            if (u.origin) meta.push(u.origin);
            if (u.type)   meta.push(u.type);
            if (u.meta?.think) meta.push('🤔');
            const head = `## ${day} • ${meta.join(' • ')}`;
            const body = (u.md || u.html || '');
            const prompt = u.meta?.prompt ? `\n\n> Prompt:\n>\n> ${u.meta.prompt}` : '';
            outMD.push(`${head}\n\n${body}${prompt}`);
          }
        }
    
        // HTML
        const htmlParts = [`<h1>Card #${cid}${card.state?.think?' 🤔':''} — ${esc(card.title||b.charter?.title||'Sans titre')}</h1>`];
        for (const day of Object.keys(groups).sort((a,b)=>a<b?1:-1)){
          htmlParts.push(`<h2>${esc(day)}</h2>`);
          for (const u of groups[day]){
            const meta = [];
            meta.push(new Date(u.ts).toLocaleTimeString());
            if (u.origin) meta.push(u.origin);
            if (u.type)   meta.push(u.type);
            if (u.meta?.think) meta.push('🤔');
            htmlParts.push(
              `<div class="meta">${esc(meta.join(' • '))}${u.meta?.prompt?' • [prompt]':''}</div>`+
              `<pre>${esc(u.md || u.html || '')}</pre>`+
              (u.meta?.prompt?`<details><summary>Prompt</summary><pre>${esc(u.meta.prompt)}</pre></details>`:'')
            );
          }
        }
        outHTML.push(htmlParts.join(''));
      }
    
      // 4) Emission
      if (btn.dataset.action==='exp-md'){
        const blob = new Blob([outMD.join('\n\n')], {type:'text/markdown'});
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `cards-selection.md`; a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
      } else {
        const html = `<!doctype html><meta charset="utf-8"><title>Cards — export</title><style>
          body{font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Arial;padding:20px;color:#eee;background:#111}
          h1{font-size:20px;margin:12px 0} h2{font-size:14px;margin:12px 0 6px}
          .meta{opacity:.7;font-size:12px} pre{white-space:pre-wrap}
          @media print{@page{margin:12mm}}
        </style>${outHTML.join('<hr>')}`;
        if (btn.dataset.action==='exp-html'){
          const blob = new Blob([html], {type:'text/html'}); const a=document.createElement('a');
          a.href=URL.createObjectURL(blob); a.download=`cards-selection.html`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1e3);
        } else {
          const w = window.open('', '_blank'); w.document.write(html); w.document.close(); w.focus(); w.print();
        }
      }
      return;
    }


  });
 
}

export const mount = mountCardsTab;
export default { mount };






































































