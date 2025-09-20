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
      return `
        <div class="card-mini-wrap" style="position:relative">
          <button class="card-mini ${isDel?'is-del':''} ${isAct?'is-active':''}"
                  data-card-id="${c.id}"
                  style="border:1px solid #2a2a2a;border-radius:10px;padding:8px;min-width:240px;background:#161616;text-align:left">
            <div style="font-size:12px;opacity:.8;display:flex;gap:8px;align-items:center">
              <b>#${c.id}</b> ${c.state?.think?'🤔':''}
              <span style="margin-left:auto">${(c.updated_ts||c.created_ts)?new Date(c.updated_ts||c.created_ts).toLocaleString():''}</span>
            </div>
            <div style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${(c.title||'Sans titre').replace(/</g,'&lt;')}
            </div>
            ${c.tags?.length?`<div style="font-size:11px;opacity:.7">${c.tags.map(t=>`#${t}`).join(' ')}</div>`:''}
          </button>
          <button class="mini-trash"
                  data-action="mini-soft-delete" data-id="${c.id}"
                  title="${isDel?'Restaurer':'Supprimer'}" aria-label="${isDel?'Restaurer':'Supprimer'}">🗑️</button>
        </div>
      `;
    }).join('') || '<div style="opacity:.6">Aucune card</div>';
  }

  renderTimeline();
  
  timeline.addEventListener('click',(ev)=>{
    // 1) clic sur la poubelle/restaurer : ne change PAS la sélection
    const del = ev.target.closest('[data-action="mini-soft-delete"]');
    if (del){
      const id = del.dataset.id;
      const b  = readClientBlob();
      const c  = (b.cards||[]).find(x=>String(x.id)===String(id));
      const nowDel = !c?.state?.deleted;
      softDeleteCard(id, nowDel);
      renderTimeline();
      // si on vient de supprimer la card sélectionnée, on garde la vue telle quelle (card courante inchangée)
      return;
    }
  
    // 2) clic sur une minicard : ignorer si supprimée
    const btn = ev.target.closest('[data-card-id]');
    if (!btn) return;
    if (btn.classList.contains('is-del')) return; // non sélectionnable quand supprimée
  
    host.dataset.selectedCardId = btn.getAttribute('data-card-id');
    renderTimeline();           // met le halo sur la card active
    renderDetail(host.dataset.selectedCardId);
  });

  function renderDetail(cardId){
    const b = readClientBlob();
    const card = (b.cards||[]).find(x=>String(x.id)===String(cardId));
    const detail = host.querySelector('#card-detail');
    if (!card){ detail.innerHTML = '<div style="opacity:.7">Aucune card</div>'; return; }
  
    // assurer au moins une section
    if (!card.sections?.length){ card.sections=[{id:'1', title:'Proposition 1'}]; writeClientBlob(b); }

    const sectionsHtml = card.sections.map(sec=>{
      const f = (card.ui?.filters?.[sec.id]) || {days:[], types:['analyse','note','comment','client_md','client_html']};
      const days = listCardDays(card.id, sec.id);
      const view = getCardView(card.id, { sectionId: sec.id, days: f.days, types: f.types });
  
      const chipsDays = days.map(d=>`<label class="chip">
        <input type="checkbox" data-action="sec-day" data-sec="${sec.id}" value="${d}" ${f.days.includes(d)?'checked':''}> ${d}
      </label>`).join('');
  
      const typeNames = [['analyse','Analyse'],['note','Note'],['comment','Commentaire'],['client_md','Client MD'],['client_html','Client HTML']];
      const chipsTypes = typeNames.map(([val,lab])=>`<label class="chip">
        <input type="checkbox" data-action="sec-type" data-sec="${sec.id}" value="${val}" ${f.types.includes(val)?'checked':''}> ${lab}
      </label>`).join('');
  
      const groups = view.groups.map(g=>`
        <section class="day-group" data-day="${g.day}" style="border:1px dashed #2a2a2a;border-radius:10px;padding:8px;margin:8px 0">
          <div style="font-size:12px;opacity:.8;margin-bottom:6px">${g.day}</div>
          ${g.items.map(u=>`
            <article class="upd" data-upd="${u.id}" data-sec="${sec.id}"
              style="border:1px solid #333;border-radius:8px;padding:8px;margin:6px 0;background:#181818">
              <div class="upd-head" style="display:flex;gap:8px;align-items:center;font-size:12px;opacity:.8">
                <span>${new Date(u.ts).toLocaleTimeString()}</span>
                ${u.origin?`<span>• ${u.origin}</span>`:''}
                ${u.type?`<span>• ${u.type}</span>`:''}
                ${u.meta?.think?`<span>• 🤔</span>`:''}
                <label style="margin-left:auto;font-weight:500">
                  <input type="checkbox" data-action="exp-pick" data-upd="${u.id}"> sélectionner
              </label>
              <label style="margin-left:8px;opacity:.9">
                <input type="checkbox" data-action="hide-upd" data-upd="${u.id}"> masquer
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
  
      return `
        <div class="section" data-sec="${sec.id}" style="border:1px solid #2a2a2a;border-radius:12px;padding:10px;margin:10px 0;background:#141415">
          <header style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <h4 style="margin:0">${(sec.title||('Section '+sec.id)).replace(/</g,'&lt;')}</h4>
            <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
              ${chipsDays}
              ${chipsTypes}
              <button class="btn btn-xs" data-action="sec-calendar" data-sec="${sec.id}">Calendrier</button>
              <button class="btn btn-xs" data-action="sec-import-md" data-sec="${sec.id}">Importer MD</button>
              <button class="btn btn-xs" data-action="sec-import-html" data-sec="${sec.id}">Importer HTML</button>
              <button class="btn btn-xs" data-action="sec-select-all" data-sec="${sec.id}">Sélectionner tout</button>
              <button class="btn btn-xs" data-action="sec-clear" data-sec="${sec.id}">Tout masquer</button>
            </div>
          </header>
          ${groups || '<div style="opacity:.6;padding:6px 0">Aucun élément pour ce filtre.</div>'}
        </div>
      `;
    }).join('');
  
    detail.innerHTML = toolbar + sectionsHtml + `
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
    const cardId = host.dataset.selectedCardId;
    if (!cardId) return;
  
    // toggle days
    if (cb.dataset.action==='sec-day'){
      const sec = cb.dataset.sec;
      const b = readClientBlob();
      const card = (b.cards||[]).find(x=>String(x.id)===String(cardId));
      const f = (card.ui?.filters?.[sec]) || {days:[], types:['analyse','note','comment','client_md','client_html']};
      const set = new Set(f.days||[]);
      cb.checked ? set.add(cb.value) : set.delete(cb.value);
      setSectionFilters(cardId, sec, {days:[...set], types:f.types});
      renderDetail(cardId);
      return;
    }
  
    // toggle types
    if (cb.dataset.action==='sec-type'){
      const sec = cb.dataset.sec;
      const b = readClientBlob();
      const card = (b.cards||[]).find(x=>String(x.id)===String(cardId));
      const f = (card.ui?.filters?.[sec]) || {days:[], types:['analyse','note','comment','client_md','client_html']};
      const set = new Set(f.types||[]);
      cb.checked ? set.add(cb.value) : set.delete(cb.value);
      setSectionFilters(cardId, sec, {days:f.days, types:[...set]});
      renderDetail(cardId);
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
      const sec = btn.dataset.sec;
      detail.querySelectorAll(`.section[data-sec="${sec}"] [data-action="exp-pick"]`).forEach(x=>x.checked=true);
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
      const cardId = host.dataset.selectedCardId;
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
      const picks = Array.from(detail.querySelectorAll('[data-action="exp-pick"]:checked')).map(x=>x.getAttribute('data-upd'));
      const b = readClientBlob();
      const card = (b.cards||[]).find(x=>String(x.id)===String(cardId));
      const all = (card?.updates||[]).slice().sort((a,b)=>a.ts<b.ts?1:-1);
      const chosen = picks.length ? all.filter(u=>picks.includes(String(u.id))) : all;
    
      const groups = {};
      for (const u of chosen){
        const k = _dayKey(u.ts);
        (groups[k] = groups[k] || []).push(u);
      }
    
      const esc = s=>(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
      const thinkBadge = card?.state?.think ? ' 🤔' : '';
    
      if (btn.dataset.action==='exp-md'){
        const md = [
          `# Card #${cardId}${thinkBadge} — ${(card?.title||'Sans titre')}`,
          ...(Object.keys(groups).sort((a,b)=>a<b?1:-1).map(day=>{
            const items = groups[day].map(u=>{
              const meta = [];
              meta.push(new Date(u.ts).toLocaleTimeString());
              if (u.origin) meta.push(u.origin);
              if (u.type)   meta.push(u.type);
              if (u.meta?.think) meta.push('🤔');
              if (u.meta?.prompt) meta.push('[prompt]');
              return `## ${day} • ${meta.join(' • ')}\n\n${u.md || u.html || ''}${u.meta?.prompt?`\n\n> Prompt:\n>\n> ${u.meta.prompt}`:''}`;
            }).join('\n\n');
            return items;
          }))
        ].join('\n\n');
        const blob = new Blob([md], {type:'text/markdown'});
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `card-${cardId}.md`; a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
        return;
      }
    
      const html = `<!doctype html><meta charset="utf-8"><title>Card #${cardId}</title><style>
        body{font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Arial;padding:20px;color:#111}
        h1{font-size:20px;margin:0 0 12px} h2{font-size:14px;margin:14px 0 6px}
        .meta{opacity:.7;font-size:12px} pre{white-space:pre-wrap}
        @media print{@page{margin:12mm}}
      </style>
      <h1>Card #${cardId}${thinkBadge} — ${esc(card?.title||'Sans titre')}</h1>
      ${Object.keys(groups).sort((a,b)=>a<b?1:-1).map(day=>{
        return `<h2>${day}</h2>` + groups[day].map(u=>{
          const meta = [];
          meta.push(new Date(u.ts).toLocaleTimeString());
          if (u.origin) meta.push(u.origin);
          if (u.type)   meta.push(u.type);
          if (u.meta?.think) meta.push('🤔');
          return `<div class="meta">${esc(meta.join(' • '))}${u.meta?.prompt?' • [prompt]':''}</div>
          <pre>${esc(u.md || u.html || '')}</pre>
          ${u.meta?.prompt?`<details><summary>Prompt</summary><pre>${esc(u.meta.prompt)}</pre></details>`:''}`;
        }).join('');
      }).join('')}`;
      if (btn.dataset.action==='exp-html'){
        const blob = new Blob([html], {type:'text/html'}); const a=document.createElement('a');
        a.href=URL.createObjectURL(blob); a.download=`card-${cardId}.html`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1e3);
      } else {
        const w = window.open('', '_blank'); w.document.write(html); w.document.close(); w.focus(); w.print();
      }
      return;
    }

  });
 
}

export const mount = mountCardsTab;
export default { mount };
























