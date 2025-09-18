// PARIA-V2-CLEAN v1.0.0 | ui/tabs/cards.js (injection)
import {
  listCards, toggleThink, softDeleteCard,
  addNote, addComment, addAItoCard
} from '../../domain/reducers.js';
import { askAI } from '../../core/ai.js';

const $ = (s,r=document)=>r.querySelector(s);

function renderCard(c){
  const notes = (c.notes||[]).map(n=>`<li><b>${n.author||'—'}</b> — ${n.text||''}</li>`).join('') || '<li class="muted">—</li>';
  const comments = (c.comments||[]).map(n=>`<li><b>${n.author||'—'}</b> — ${n.text||''}</li>`).join('') || '<li class="muted">—</li>';
  const ai = (c.ai||[]).filter(a=>!a?.state?.deleted).map(a=>`
      <li data-ai-id="${a.id}">
        <div><b>${a.title||''}</b> ${a.tags?.length? a.tags.map(t=>`<span class="tag">#${t}</span>`).join(' '):''}</div>
        <div>${(a.content||'').replace(/\n/g,'<br>')}</div>
      </li>
    `).join('') || '<li class="muted">—</li>';

  return `
  <article class="card" data-card-id="${c.id}">
    <header class="row">
      <h3 class="title">${c.title||'(sans titre)'}</h3>
      <div class="actions">
        <button class="icon-think" data-action="card-think" title="À réfléchir">${c?.state?.think?'🤔':'💡'}</button>
        <button class="icon-trash" data-action="card-delete" title="Supprimer">🗑️</button>
      </div>
    </header>
    <div class="content">${(c.content||'').replace(/\n/g,'<br>')}</div>
    ${c.tags?.length?`<div class="tags">${c.tags.map(t=>`<span class="tag">#${t}</span>`).join(' ')}</div>`:''}

    <section class="block">
      <div class="row">
        <button class="btn" data-action="card-analyze">Analyser (idées)</button>
      </div>
      <h4>Propositions IA</h4>
      <ul class="ai-list">${ai}</ul>
    </section>

    <section class="block">
      <h4>Notes</h4>
      <ul class="notes">${notes}</ul>
      <form data-form="note" class="inline">
        <input name="text" type="text" placeholder="Ajouter une note…" required />
        <select name="author"><option value="moi">moi</option><option value="gpt">gpt</option><option value="client">client</option></select>
        <button type="submit">Ajouter</button>
      </form>
    </section>

    <section class="block">
      <h4>Commentaires</h4>
      <ul class="comments">${comments}</ul>
      <form data-form="comment" class="inline">
        <input name="text" type="text" placeholder="Ajouter un commentaire…" required />
        <select name="author"><option value="moi">moi</option><option value="gpt">gpt</option><option value="client">client</option></select>
        <button type="submit">Commenter</button>
      </form>
    </section>
  </article>`;
}

function html(){
  const cards = listCards();
  return `
  <div class="cards">
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

function renderCardsGrid(cards){
  const grid = host.querySelector('#cards-grid');
  grid.innerHTML = (cards||[]).map(renderCard).join('');
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

host.addEventListener('click', (ev)=>{
  const btn = ev.target.closest('[data-action]');
  if (!btn) return;
  const cardEl = btn.closest('.card');
  const id = cardEl?.getAttribute('data-card-id');
  const b = readClientBlob();
  const c = (b.cards||[]).find(x=>String(x.id)===String(id));
  if (!c) return;

  if (btn.dataset.action==='card-soft-delete'){
    const del = !(c?.state?.deleted);
    softDeleteCard(id, del);
    cardEl.classList.toggle('is-deleted', del);
    btn.textContent = del ? 'Restaurer' : 'Supprimer';
    return;
  }
  if (btn.dataset.action==='card-export-md'){
    download(`card-${id}.md`, cardToMarkdown(c), 'text/markdown');
    return;
  }
  if (btn.dataset.action==='card-export-html'){
    download(`card-${id}.html`, cardToHTML(c), 'text/html');
    return;
  }
  if (btn.dataset.action==='card-export-pdf'){
    cardPrint(c);
    return;
  }
  if (btn.dataset.action==='card-import-md'){
    const md = prompt('Colle ici le Markdown du client :');
    if (md!=null){
      c.content = md;
      writeClientBlob(b);
      // si tu as un détail “preview”, rafraîchis-le ici
    }
    return;
  }
  if (btn.dataset.action==='card-import-html'){
    const html = prompt('Colle ici le HTML du client (source de confiance) :');
    if (html!=null){
      c.content_html = html; // stocke séparément si tu affiches différemment
      writeClientBlob(b);
    }
    return;
  }
});

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
  const grid = root.querySelector('#cards-grid');
  grid.style.flex = '1 1 auto';
  grid.style.overflow = 'auto';

  
  // Actions (think / delete / analyze)
  host.addEventListener('click', async (ev)=>{
    const act = ev.target.closest('[data-action]');
    if (!act) return;
    const wrap = ev.target.closest('[data-card-id]'); if (!wrap) return;
    const id = wrap.dataset.cardId;

    if (act.dataset.action==='card-delete'){ softDeleteCard(id); return mountCardsTab(host); }
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
}

export const mount = mountCardsTab;
export default { mount };



