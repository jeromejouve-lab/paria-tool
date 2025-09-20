// PARIA-V2-CLEAN v1.0.0 | ui/tabs/cards.js (injection)
import {
  listCards, toggleThink, softDeleteCard,
  addNote, addComment, addAItoCard, updateCard
} from '../../domain/reducers.js';
import { askAI } from '../../core/ai.js';

import {
  getCardView, setSectionFilters, listCardDays,
  appendCardUpdate, touchCard, __cards_migrate_v2_once
} from "../../domain/reducers.js";

import { readClientBlob, writeClientBlob } from "../../core/store.js";

const $ = (s,r=document)=>r.querySelector(s);

function _dayKey(ts){
  const d = new Date(ts);
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function html(){
  const cards = listCards();
  return `
  <div id="cards-grid">
    ${cards.length? cards.map(renderCard).join('') : `<div class="muted">— Aucune card.</div>`}
  </div>`;
}

function fmtTs(ts){ try{ return ts ? new Date(ts).toLocaleString() : ''; }catch{ return ''; } }

function cardPrint(c){
  const w = window.open('', '_blank');
  w.document.write(cardToHTML(c));
  w.document.close();
  w.focus();
  w.print(); // l’utilisateur choisit “Enregistrer en PDF” si besoin
}

export function mountCardsTab(host = document.getElementById('tab-cards')){
  // --- boot cards UI (sticky + zones) ---
  __cards_migrate_v2_once?.();

  let selectedIds = new Set();   // autres cartes sélectionnées
  let primaryId   = null;        // carte courante (halo fort)

  host.style.display = 'flex';
  host.style.flexDirection = 'column';
  
  const bar = host.querySelector('.btns');
  if (bar){
    bar.style.position = 'sticky';
    bar.style.top = '0';
    bar.style.zIndex = '2';
    bar.style.background = 'var(--bg,#0f0f10)';
    bar.style.paddingBottom = '8px';
  }
  
  let timeline = host.querySelector('#cards-timeline');
  let detail = host.querySelector('#card-detail');
  
  if (!timeline){
    timeline = document.createElement('div');
    timeline.id = 'cards-timeline';
    timeline.style.cssText = 'display:flex;gap:8px;overflow:auto;padding:8px 4px;';
    bar ? bar.insertAdjacentElement('afterend', timeline) : host.prepend(timeline);
  }
  if (!detail){
    detail = document.createElement('div');
    detail.id = 'card-detail';
    detail.style.cssText = 'flex:1 1 auto; overflow:auto; padding:8px 4px 16px;';
    host.appendChild(detail);
  }
  
  // helpers locaux
  function _dayKey(ts){ const d=new Date(ts); const m=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); return `${d.getFullYear()}-${m}-${dd}`; }
  function fmt(ts){ try{ return ts? new Date(ts).toLocaleString() : ''; }catch{return '';} }
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
    const f = (card.ui?.filters?.[secId]) || {days:[], types:['analyse','note','comment','client_md','client_html']};
    const days = listCardDays(cardId, secId); // ['YYYY-MM-DD', ...]
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
    const selId = String(host.dataset.selectedCardId || '');
    const cards = (b.cards || []).slice().sort((a,b)=> (a.updated_ts<b.updated_ts)?1:-1);
  
    timeline.innerHTML = cards.map(c=>{
      const isDel = !!c.state?.deleted;
      const isAct = selId && String(c.id) === selId;
      const isSel = selectedIds.has(String(c.id));
      const isPri = String(primaryId||'') === String(c.id);
      
      return `
        <button class="card-mini ${c.state?.deleted?'is-del':''} ${String(primaryId||'')===String(c.id)?'is-active':''} ${selectedIds?.has?.(String(c.id))?'is-selected':''}"
                data-card-id="${c.id}"
                style="position:relative;border:1px solid #2a2a2a;border-radius:10px;padding:8px;min-width:240px;background:#161616;text-align:left">
          <div class="meta-row" style="font-size:12px;opacity:.85;display:flex;gap:8px;align-items:center">
            <b>#${c.id}</b> ${c.state?.think?'🤔':''}
            <span class="ts" style="margin-left:auto">${(c.updated_ts||c.created_ts)?new Date(c.updated_ts||c.created_ts).toLocaleString():''}</span>
            <button class="mini-trash" data-action="mini-soft-delete" data-id="${c.id}"
                    title="${c.state?.deleted?'Restaurer':'Supprimer'}" aria-label="${c.state?.deleted?'Restaurer':'Supprimer'}">
              ${c.state?.deleted?'↩︎':'🗑️'}
            </button>
          </div>
          <div style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${((c.title && c.title.trim()) ? c.title : (b.charter?.title || 'Sans titre')).replace(/</g,'&lt;')}
          </div>
          ${c.tags?.length?`<div style="font-size:11px;opacity:.7">${c.tags.map(t=>`#${t}`).join(' ')}</div>`:''}
        </button>
      `;

    }).join('') || '<div style="opacity:.6">Aucune card</div>';
  }

  renderTimeline();
    
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
            <span style="margin-left:8px">${(card.title||'Proposition').replace(/</g,'&lt;')}</span>
            <span style="margin-left:auto;opacity:.8;font-size:12px">${new Date(card.updated_ts||card.created_ts||Date.now()).toLocaleString()}</span>
          </div>
      `);
  
      // sections
      for (const sec of (card.sections||[])){
        const f = (card.ui?.filters?.[sec.id]) || {days:[], types:['analyse','note','comment','client_md','client_html']};
        const days = listCardDays(card.id, sec.id);
        const view = getCardView(card.id, { sectionId: sec.id, days: f.days, types: f.types });
  
        const chipsDays = days.map(d=>`<label class="chip">
          <input type="checkbox" data-action="sec-day" data-card="${card.id}" data-sec="${sec.id}" value="${d}" ${f.days.includes(d)?'checked':''}> ${d}
        </label>`).join('');
  
        const typeNames = [['analyse','Analyse'],['note','Note'],['comment','Commentaire'],['client_md','Client MD'],['client_html','Client HTML']];
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
                  <pre style="white-space:pre-wrap;margin:6px 0 0 0">${(u.md||u.html||'').replace(/</g,'&lt;')}</pre>
                  ${u.meta?.prompt?`<details style="margin-top:6px"><summary>Prompt</summary><pre style="white-space:pre-wrap">${(u.meta.prompt||'').replace(/</g,'&lt;')}</pre></details>`:''}
                </div>
              </article>
            `).join('')}
          </section>
        `).join('');
  
        chunks.push(`
          <div class="section" data-sec="${sec.id}" style="padding:10px">
            <header style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
              <h4 style="margin:0">${(sec.title||('Section '+sec.id)).replace(/</g,'&lt;')}</h4>
              <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
                ${chipsDays}
                ${chipsTypes}
                <button class="btn btn-xs" data-action="sec-calendar" data-card="${card.id}" data-sec="${sec.id}">Calendrier</button>
                <button class="btn btn-xs" data-action="sec-select-all" data-card="${card.id}" data-sec="${sec.id}">Sélectionner tout</button>
                <button class="btn btn-xs" data-action="sec-clear" data-card="${card.id}" data-sec="${sec.id}">Tout masquer</button>
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
      </div>
    `;
  }

   
  __cards_migrate_v2_once();

  // layout de base
  host.style.display='flex'; host.style.flexDirection='column';

  if (bar){ bar.style.position='sticky'; bar.style.top='0'; bar.style.zIndex='2'; bar.style.background='var(--bg,#0f0f10)'; }
  if (!timeline){ timeline=document.createElement('div'); timeline.id='cards-timeline'; timeline.style.cssText='display:flex;gap:8px;overflow:auto;padding:8px 4px;'; bar?.insertAdjacentElement('afterend', timeline); }
  if (!detail){   detail  =document.createElement('div'); detail.id='card-detail'; detail.style.cssText='flex:1 1 auto; overflow:auto; padding:8px 4px 16px;'; bar?.parentNode?.appendChild(detail); }
  if (!timeline) throw new Error('[Cards] #cards-timeline introuvable');
  if (!detail)   throw new Error('[Cards] #card-detail introuvable');

  // ---- Layout scrollable sous la barre d'actions ----
  const root   = host;                              // conteneur de l'onglet Cards
  const list   = root.querySelector('#cards-grid'); // conteneur des cards (on crée juste après si absent)
  
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.minHeight = 'calc(100vh - 80px)'; // ajuste si besoin
  
  if (bar){
    bar.style.position = 'sticky';
    bar.style.top = '0';
    bar.style.zIndex = '2';
    bar.style.background = 'var(--bg,#0f0f10)'; // pour masquer le contenu derrière
    bar.style.paddingBottom = '8px';
  }
  
  if (!list){
    const grid = document.createElement('div');
    grid.id = 'cards-grid';
    root.appendChild(grid);
  }
  const grid = host.querySelector('#cards-grid') || host;
  grid.style.flex = '1 1 auto';
  grid.style.overflow = 'auto';

  function fmt(ts){ try{ return ts? new Date(ts).toLocaleString() : ''; }catch{return '';} }

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
      const f = (card.ui?.filters?.[sec]) || {days:[], types:['analyse','note','comment','client_md','client_html']};
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
      const f = (card.ui?.filters?.[sec]) || {days:[], types:['analyse','note','comment','client_md','client_html']};
      const set = new Set(f.types||[]);
      cb.checked ? set.add(cb.value) : set.delete(cb.value);
      setSectionFilters(cardId, sec, {days:f.days, types:[...set]});
      renderDetail();
      return;
    }

    // exp-pick : rien à faire à part la case cochée
    if (cb.dataset.action==='exp-pick'){
      return;
    }
    
    // hide-upd : masque uniquement le corps
    if (cb.dataset.action==='hide-upd'){
      const art = cb.closest('.upd');
      if (art) art.classList.toggle('is-hidden', cb.checked);
      return;
    }

    const art = cb.closest('.upd');
    if (art) art.classList.toggle('is-hidden', cb.checked);
    return;

  });

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




































