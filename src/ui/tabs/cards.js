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

function renderCard(c){
  const think = c?.state?.think ? '🤔 ' : '';
  const del   = c?.state?.deleted;
  return `
  <article class="card ${del?'is-deleted':''}" data-card-id="${c.id}">
    <div class="meta">
      <span class="id">#${c.id}</span>
      ${c.tags?.length ? `<span>${c.tags.map(t=>`#${t}`).join(' ')}</span>` : ''}
      <span class="ts">${fmtTs(c.created_ts || c.ts)}</span>
    </div>
    <h4>${think}${(c.title||'Sans titre').replace(/</g,'&lt;')}</h4>
    <div class="ops">
      <button class="btn btn-xs" data-action="card-export-md">MD</button>
      <button class="btn btn-xs" data-action="card-export-html">HTML</button>
      <button class="btn btn-xs" data-action="card-export-pdf">PDF/Print</button>
      <button class="btn btn-xs" data-action="card-import-md">Intégrer MD client</button>
      <button class="btn btn-xs" data-action="card-import-html">Intégrer HTML client</button>
      <button class="btn btn-xs" data-action="card-soft-delete">${del?'Restaurer':'Supprimer'}</button>
    </div>
  </article>`;
}

function download(filename, text, type='text/plain'){
  const blob = new Blob([text], {type});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
}

function cardToMarkdown(c){
  const tags = (c.tags||[]).map(t=>`#${t}`).join(' ');
  return `# ${c.title||'Sans titre'}\n\n${c.content||''}\n\n${tags?`\n${tags}\n`:''}`;
}
function cardToHTML(c){
  const tags = (c.tags||[]).map(t=>`#${t}`).join(' ');
  const esc = s=>(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
  return `<!doctype html><meta charset="utf-8">
  <title>${esc(c.title||'Sans titre')}</title>
  <style>
    body{font:14px/1.45 system-ui, -apple-system, Segoe UI, Roboto, Arial; padding:24px; color:#111}
    .meta{opacity:.7;font-size:12px;margin-bottom:8px}
    h1{font-size:20px;margin:0 0 12px 0}
    pre{white-space:pre-wrap}
    @media print{ @page { margin: 12mm; } }
  </style>
  <div class="meta">#${c.id} — ${fmtTs(c.created_ts)}</div>
  <h1>${esc(c.title||'Sans titre')}</h1>
  <pre>${esc(c.content||'')}</pre>
  ${tags?`<div class="meta">${esc(tags)}</div>`:''}`;
}
function cardPrint(c){
  const w = window.open('', '_blank');
  w.document.write(cardToHTML(c));
  w.document.close();
  w.focus();
  w.print(); // l’utilisateur choisit “Enregistrer en PDF” si besoin
}

export function mountCardsTab(host = document.getElementById('tab-cards')){
  if (!host) return;
  host.innerHTML = html();

  __cards_migrate_v2_once();

  // layout de base
  host.style.display='flex'; host.style.flexDirection='column';
  const bar = host.querySelector('.btns');
  if (bar){ bar.style.position='sticky'; bar.style.top='0'; bar.style.zIndex='2'; bar.style.background='var(--bg,#0f0f10)'; }
  
  let timeline = host.querySelector('#cards-timeline');
  let detail   = host.querySelector('#card-detail');
  if (!timeline){ timeline=document.createElement('div'); timeline.id='cards-timeline'; timeline.style.cssText='display:flex;gap:8px;overflow:auto;padding:8px 4px;'; bar?.insertAdjacentElement('afterend', timeline); }
  if (!detail){   detail  =document.createElement('div'); detail.id='card-detail'; detail.style.cssText='flex:1 1 auto; overflow:auto; padding:8px 4px 16px;'; bar?.parentNode?.appendChild(detail); }

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

  
  // Actions (think / delete / analyze)
  host.addEventListener('click', async (ev)=>{
    const act = ev.target.closest('[data-action]');
    if (!act) return;
    const wrap = ev.target.closest('[data-card-id]'); if (!wrap) return;
    const id = wrap.dataset.cardId;

    if (act.dataset.action==='card-soft-delete'){ softDeleteCard(id); return mountCardsTab(host); }
    if (act.dataset.action==='card-think'){ toggleThink(id); return mountCardsTab(host); }
    if (act.dataset.action==='card-analyze'){
      const r = await askAI({ mode:'ideas', subject:{kind:'card', id}, payload:{}, context:{ tab:'cards' } });
      if (r.status==='ok') addAItoCard(id, r.results);
      return mountCardsTab(host);
    }
  });

  // Notes & commentaires
  host.addEventListener('submit', (ev)=>{
    const f = ev.target;
    if (!f.matches('[data-form="note"],[data-form="comment"]')) return;
    ev.preventDefault();
    const id = f.closest('[data-card-id]')?.dataset?.cardId; if (!id) return;
    const fd = new FormData(f);
    const text=(fd.get('text')||'').toString().trim();
    const author=(fd.get('author')||'moi').toString();
    if (!text) return;

    if (f.dataset.form==='note') addNote(id,{author,text});
    else addComment(id,{author,text});

    f.reset(); mountCardsTab(host);
  });

  function fmt(ts){ try{ return ts? new Date(ts).toLocaleString() : ''; }catch{return '';} }

  function renderTimeline(){
    const b = readClientBlob();
    const cards = (b.cards||[]).slice().sort((a,b)=> (a.updated_ts<b.updated_ts)?1:-1);
    timeline.innerHTML = cards.map(c=>`
      <button class="card-mini ${c.state?.deleted?'is-del':''}" data-card-id="${c.id}"
              style="border:1px solid #2a2a2a;border-radius:10px;padding:8px;min-width:220px;background:#161616;text-align:left">
        <div style="font-size:12px;opacity:.8;display:flex;gap:8px;align-items:center">
          <b>#${c.id}</b> ${c.state?.think?'🤔':''}
          <span style="margin-left:auto">${fmt(c.updated_ts||c.created_ts)}</span>
        </div>
        <div style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${(c.title||'Sans titre').replace(/</g,'&lt;')}</div>
        ${c.tags?.length?`<div style="font-size:11px;opacity:.7">${c.tags.map(t=>`#${t}`).join(' ')}</div>`:''}
      </button>
    `).join('');
  }
  renderTimeline();
  
  timeline.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('[data-card-id]');
    if (!btn) return;
    const id = btn.getAttribute('data-card-id');
    host.dataset.selectedCardId = id;
    renderDetail(id);
  });

  function renderDetail(cardId){
    const b = readClientBlob();
    const card = (b.cards||[]).find(x=>String(x.id)===String(cardId));
    if (!card){ detail.innerHTML = '<div style="opacity:.7">Aucune card</div>'; return; }
  
    // sections : si vide, créer une "Proposition 1" par défaut (id=1)
    if (!card.sections?.length){ card.sections=[{id:1, title:'Proposition 1'}]; writeClientBlob(b); }
  
    detail.innerHTML = card.sections.map(sec=>{
      const f = (card.ui?.filters?.[sec.id]) || {days:[], types:['analyse','note','comment','client_md','client_html']};
      const availableDays = listCardDays(card.id, sec.id);
      const view = getCardView(card.id, {sectionId: sec.id, days: f.days, types: f.types});
      const chips = availableDays.map(d=>`<label class="chip"><input type="checkbox" data-action="sec-day" data-sec="${sec.id}" value="${d}" ${f.days.includes(d)?'checked':''}> ${d}</label>`).join('');
      const typeNames = [['analyse','Analyse'],['note','Note'],['comment','Commentaire'],['client_md','Client MD'],['client_html','Client HTML']];
      const types = typeNames.map(([val,lab])=>`<label class="chip"><input type="checkbox" data-action="sec-type" data-sec="${sec.id}" value="${val}" ${f.types.includes(val)?'checked':''}> ${lab}</label>`).join('');
  
      const groupsHtml = view.groups.map(g=>`
        <section class="day-group" data-day="${g.day}" style="border:1px dashed #2a2a2a;border-radius:10px;padding:8px;margin:8px 0">
          <div style="font-size:12px;opacity:.8;margin-bottom:6px">${g.day}</div>
          ${g.items.map(it=>`
            <article class="upd" data-upd="${it.id}" style="border:1px solid #333;border-radius:8px;padding:8px;margin:6px 0;background:#181818">
              <div style="display:flex;gap:8px;align-items:center;font-size:12px;opacity:.8">
                <span>${new Date(it.ts).toLocaleTimeString()}</span>
                <span>• ${it.origin}</span>
                <span>• ${it.type}</span>
                <label style="margin-left:auto;font-weight:500"><input type="checkbox" data-action="exp-pick" data-upd="${it.id}"> sélectionner</label>
                <label style="margin-left:8px;opacity:.9"><input type="checkbox" data-action="hide-upd" data-upd="${it.id}"> masquer</label>
              </div>
              <pre style="white-space:pre-wrap;margin:6px 0 0 0">${(it.md||it.html||'').replace(/</g,'&lt;')}</pre>
            </article>
          `).join('')}
        </section>
      `).join('');
  
      return `
        <div class="section" data-sec="${sec.id}" style="border:1px solid #2a2a2a;border-radius:12px;padding:10px;margin:10px 0;background:#141415">
          <header style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <h4 style="margin:0">${(sec.title||('Section '+sec.id)).replace(/</g,'&lt;')}</h4>
            <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
              ${chips}
              ${types}
              <button class="btn btn-xs" data-action="sec-select-all" data-sec="${sec.id}">Sélectionner tout</button>
              <button class="btn btn-xs" data-action="sec-clear" data-sec="${sec.id}">Tout masquer</button>
            </div>
          </header>
          ${groupsHtml || '<div style="opacity:.6;padding:6px 0">Aucun élément pour ce filtre.</div>'}
        </div>
      `;
    }).join('') + `
      <div class="export-bar" style="position:sticky;bottom:0;padding:8px;background:#101010;border-top:1px solid #2a2a2a;display:flex;gap:8px">
        <button class="btn btn-xs" data-action="exp-md">Exporter MD (sélection)</button>
        <button class="btn btn-xs" data-action="exp-html">Exporter HTML (sélection)</button>
        <button class="btn btn-xs" data-action="exp-print">Imprimer/PDF (sélection)</button>
      </div>
    `;
  }

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
      detail.querySelectorAll(`.section[data-sec="${sec}"] .upd`).forEach(x=>x.style.display='none');
      return;
    }
  
    // exports
    if (btn.dataset.action==='exp-md' || btn.dataset.action==='exp-html' || btn.dataset.action==='exp-print'){
      const picks = Array.from(detail.querySelectorAll('[data-action="exp-pick"]:checked')).map(x=>x.getAttribute('data-upd'));
      if (!picks.length){ alert('Sélection vide'); return; }
      const b = readClientBlob();
      const card = (b.cards||[]).find(x=>String(x.id)===String(cardId));
      const sel = (card.updates||[]).filter(u=>picks.includes(String(u.id)));
      const esc = s=>(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
  
      if (btn.dataset.action==='exp-md'){
        const md = sel.map(u=>`## ${_dayKey(u.ts)} ${new Date(u.ts).toLocaleTimeString()} • ${u.origin} • ${u.type}\n\n${u.md||u.html||''}`).join('\n\n');
        const blob = new Blob([md], {type:'text/markdown'}); const a=document.createElement('a');
        a.href=URL.createObjectURL(blob); a.download=`card-${cardId}-selection.md`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1e3);
        return;
      }
      const html = `<!doctype html><meta charset="utf-8"><title>Card #${cardId}</title><style>
        body{font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Arial;padding:20px;color:#111}
        h2{font-size:16px;margin:16px 0 6px} .meta{opacity:.7;font-size:12px}
        pre{white-space:pre-wrap}
        @media print{@page{margin:12mm}}
      </style>
      <h1>Card #${cardId} — ${(card.title||'Sans titre').replace(/</g,'&lt;')}</h1>
      ${sel.map(u=>`<h2>${_dayKey(u.ts)} ${new Date(u.ts).toLocaleTimeString()} • ${u.origin} • ${u.type}</h2>
      <pre>${esc(u.md||u.html||'')}</pre>`).join('')}`;
      if (btn.dataset.action==='exp-html'){
        const blob = new Blob([html], {type:'text/html'}); const a=document.createElement('a');
        a.href=URL.createObjectURL(blob); a.download=`card-${cardId}-selection.html`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1e3);
      } else {
        const w = window.open('', '_blank'); w.document.write(html); w.document.close(); w.focus(); w.print();
      }
      return;
    }
  });

  grid.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('[data-action]');
    if (!btn) return;
    const cardEl = btn.closest('.card,[data-card-id]');
    if (!cardEl) return;
    const id = cardEl.getAttribute('data-card-id');
  
    // soft delete / restore
    if (btn.dataset.action === 'card-soft-delete'){
      const isDeleted = cardEl.classList.contains('is-deleted');
      softDeleteCard(id, !isDeleted);
      cardEl.classList.toggle('is-deleted', !isDeleted);
      btn.textContent = !isDeleted ? 'Restaurer' : 'Supprimer';
      return;
    }
  
    // export MD
    if (btn.dataset.action === 'card-export-md'){
      const b = readClientBlob();
      const c = (b.cards||[]).find(x=>String(x.id)===String(id));
      const tags = (c?.tags||[]).map(t=>`#${t}`).join(' ');
      const md = `# ${c?.title||'Sans titre'}\n\n${c?.content||''}\n\n${tags?`\n${tags}\n`:''}`;
      const blob = new Blob([md], {type:'text/markdown'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `card-${id}.md`; a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
      return;
    }
  
    // export HTML (+ print/PDF)
    if (btn.dataset.action === 'card-export-html' || btn.dataset.action === 'card-export-pdf'){
      const b = readClientBlob();
      const c = (b.cards||[]).find(x=>String(x.id)===String(id));
      const esc = s=>(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
      const tags = (c?.tags||[]).map(t=>`#${t}`).join(' ');
      const html = `<!doctype html><meta charset="utf-8">
  <title>${esc(c?.title||'Sans titre')}</title>
  <style>
    body{font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,Arial;padding:24px;color:#111}
    .meta{opacity:.7;font-size:12px;margin-bottom:8px}
    h1{font-size:20px;margin:0 0 12px 0}
    pre{white-space:pre-wrap}
    @media print{ @page { margin:12mm; } }
  </style>
  <div class="meta">#${id} — ${c?.created_ts?new Date(c.created_ts).toLocaleString():''}</div>
  <h1>${esc(c?.title||'Sans titre')}</h1>
  <pre>${esc(c?.content||'')}</pre>
  ${tags?`<div class="meta">${esc(tags)}</div>`:''}`;
      if (btn.dataset.action === 'card-export-html'){
        const blob = new Blob([html], {type:'text/html'});
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `card-${id}.html`; a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
      } else {
        const w = window.open('', '_blank'); w.document.write(html); w.document.close(); w.focus(); w.print();
      }
      return;
    }
  
    // import MD
    if (btn.dataset.action === 'card-import-md'){
      const md = prompt('Colle ici le Markdown du client :');
      if (md!=null) updateCard(id, { content: md });
      return;
    }
  
    // import HTML
    if (btn.dataset.action === 'card-import-html'){
      const html = prompt('Colle ici le HTML du client (source de confiance) :');
      if (html!=null) updateCard(id, { content_html: html });
      return;
    }
  });

}

export const mount = mountCardsTab;
export default { mount };









