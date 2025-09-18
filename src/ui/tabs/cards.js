// PARIA-V2-CLEAN v1.0.0 | ui/tabs/cards.js (injection)
import {
  listCards, toggleThink, softDeleteCard,
  addNote, addComment, addAItoCard, updateCard
} from '../../domain/reducers.js';
import { askAI } from '../../core/ai.js';

const $ = (s,r=document)=>r.querySelector(s);

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

  // ---- Layout scrollable sous la barre d'actions ----
  const root   = host;                              // conteneur de l'onglet Cards
  const bar    = root.querySelector('.btns');       // barre d'actions du haut (Analyser / Export / etc.)
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
  
  // -- actions sur les petites cards (compact) --

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






