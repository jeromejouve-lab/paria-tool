// src/ui/tabs/seances.js — from scratch, calqué sur Projecteur/Cards (mode modif)
// Hypothèse: reducers exposent les helpers normalisés déjà utilisés par Cards/Projector.

import {
  // lecture & rendu
  readClientBlob, writeClientBlob,
  listCards, getCardView, listCardDays, setSectionFilters,
  // mini-cards & updates
  createMiniFromSource, addSectionEntry, hideEntry, touchCard,
  // IA (contexte charter + commentaire)
  aiAnalyzeEntry, isRemoteViewer
} from '../../domain/reducers.js';

import { buildWorkId } from '../../core/settings.js';

const $  = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));

function fmtTs(ts){ try{ return ts ? new Date(ts).toLocaleString() : ''; }catch{ return ''; } }
function esc(s){ return String(s||'').replace(/</g,'&lt;'); }
function _dayKey(ts){ const d=new Date(ts); const mm=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); return `${d.getFullYear()}-${mm}-${dd}`; }

function safeCards(){
  let b; try{ b = readClientBlob(); }catch{ b = {}; }
  const cards = (b.cards||[]).filter(c=>!c.state?.deleted).sort((a,b)=> (b.updated_ts||0)-(a.updated_ts||0));
  return { b, cards };
}

let primaryId = null; // id de la mini-card courante

function htmlShell(){
  return `
  <div class="seances" style="padding:8px">
    <section class="block" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <strong>Séances</strong>
      <span class="muted">• travail sur <em>mini-cards</em> (jamais l’original)</span>
      <span style="margin-left:auto;opacity:.8;font-size:12px" id="sess-wid">${esc(buildWorkId?.()||'')}</span>
    </section>

    <!-- timeline (clone Cards/Projecteur) -->
    <div id="sc-timeline" style="display:flex;gap:8px;overflow:auto;padding:8px 4px;"></div>

    <!-- filtres par types (affichage) -->
    <section class="block" id="sc-filters" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:8px 4px">
      <div class="muted">Filtres</div>
      <div id="chips-days" class="chips" style="display:flex;gap:6px;flex-wrap:wrap"></div>
      <label><input type="checkbox" name="t_analyse" checked> analyse</label>
      <label><input type="checkbox" name="t_ai_md"  checked> IA (md)</label>
      <label><input type="checkbox" name="t_note"    checked> note</label>
      <label><input type="checkbox" name="t_comment" checked> commentaire</label>
      <label><input type="checkbox" name="t_client"  checked> client</label>
    </section>

    <div id="sc-detail" style="flex:1 1 auto; overflow:auto; padding:8px 4px 16px;"></div>
  </div>`;
}

function currentCardId(){
  // on garde en mémoire locale la dernière mini-card ouverte
  try {
    const k = localStorage.getItem('seances.sel');
    if (k) return k;
  } catch{}
  const { cards } = safeCards();
  return cards[0]?.id ?? null;
}
function setLocalSel(id){ try{ localStorage.setItem('seances.sel', String(id)); }catch{} }

// Assure une mini-card à partir d’une source (jamais écrire l’original)
function ensureMini(cardId){
  const { cards } = safeCards();
  const c = cards.find(x=>String(x.id)===String(cardId));
  if (!c) return null;
  if (c.kind === 'mini') return c.id;
  const nid = createMiniFromSource(String(c.id));
  return nid || c.id;
}

function renderTimeline(host){
  const wrap = $('#sc-timeline', host);
  const { b, cards } = safeCards();
  const active = String(primaryId || currentCardId() || '');

  wrap.innerHTML = cards.map(c=>{
    const id    = String(c.id);
    const isAct = active===id;
    const cls   = `card-mini ${isAct?'is-active':''}`;
    const title = (c.title?.trim()
      || b.charter?.title?.trim()
      || (b.charter?.service?('Service: '+b.charter.service):'Sans titre'));
    const ts    = fmtTs(c.updated_ts||c.created_ts||Date.now());
    const halo  = c.state?.consolidated ? 'box-shadow:0 0 0 2px #ff8c00 inset;border-color:#ff8c00;' : '';
    const badge = (c.kind==='mini') ? '<span class="badge" title="mini-card" style="background:#444;padding:0 6px;border-radius:999px;margin-left:6px">🎬</span>' : '';

    return `
    <article class="${cls}" data-card-id="${id}"
      title="${esc(title)}"
      style="border-radius:12px;border:1px solid #2a2a2a;${halo}padding:6px 8px;min-width:220px;background:#141415">
      <header style="display:flex;align-items:center;gap:6px;font-size:12px;opacity:.85">
        <span>#${id}${c.state?.think?' • 🤔':''}</span>${badge}
        <span class="mini-ts" style="margin-left:auto">${ts}</span>
      </header>
      <div class="mini-title" style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">
        ${esc(title)}
      </div>
    </article>`;
  }).join('') || '<em style="opacity:.6;padding:4px 0">Aucune card</em>';
}

function typeFilters(host){
  const box = $('#sc-filters', host);
  return {
    analyse: $('input[name="t_analyse"]', box)?.checked !== false,
    ai_md:   $('input[name="t_ai_md"]',   box)?.checked !== false,
    note:    $('input[name="t_note"]',    box)?.checked !== false,
    comment: $('input[name="t_comment"]', box)?.checked !== false,
    client:  $('input[name="t_client"]',  box)?.checked !== false,
  };
}
function keepType(t,on){
  if (t==='analyse') return on.analyse;
  if (t==='ai_md')   return on.ai_md;
  if (t==='note')    return on.note;
  if (t==='comment') return on.comment;
  if (t?.startsWith('client')) return on.client;
  return true;
}

function renderDayChips(host){
  const box = $('#chips-days', host); if (!box) return;
  const cid = primaryId || currentCardId(); if (!cid) { box.innerHTML=''; return; }
  const days = listCardDays(String(cid));
  const key = `seances.filters.days.${cid}`;
  let sel = [];
  try { sel = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
  if (!sel.length) sel = days.slice(0,3);

  box.innerHTML = days.map(d=>{
    const on = sel.includes(d);
    return `<button class="chip ${on?'on':''}" data-day="${d}">${d}</button>`;
  }).join('');

  box.onclick = (ev)=>{
    const b = ev.target.closest('button[data-day]'); if (!b) return;
    const d = b.dataset.day;
    const was = sel.includes(d);
    sel = was ? sel.filter(x=>x!==d) : [...sel, d];
    localStorage.setItem(key, JSON.stringify(sel));
    renderDayChips(host);
    renderDetail(host);
  };
}

function sectionComposerHTML(cardId, secId){
  if (isRemoteViewer()) return ''; // remote = pas de saisie
  return `
    <div class="composer" data-card="${cardId}" data-sec="${secId}" style="display:flex;gap:6px;margin:8px 0;align-items:flex-start">
      <textarea class="composer-text" rows="2" style="flex:1" placeholder="Commentaire séance…"></textarea>
      <select class="composer-origin" title="origine" style="height:28px">
        <option value="client">client</option>
        <option value="moi">moi</option>
        <option value="seance">seance</option>
        <option value="ia">ia</option>
      </select>
      <button class="btn btn-xs" data-cmd="add">+ </button>
      <button class="btn btn-xs" data-cmd="ai">IA</button>
    </div>
  `;
}

async function onComposerAction(host, btn){
  const box = btn.closest('.composer'); if (!box) return;
  const cardId = String(box.getAttribute('data-card'));
  const secId  = String(box.getAttribute('data-sec'));
  const ta     = box.querySelector('.composer-text');
  const sel    = box.querySelector('.composer-origin');
  const text   = (ta?.value||'').trim();
  const origin = (sel?.value||'client');

  if (isRemoteViewer()) return; // rien à faire côté remote

  if (btn.dataset.cmd==='add'){
    if (!text) return;
    addSectionEntry(cardId, secId, { type:'comment', text, origin });
    ta.value = '';
    touchCard(cardId);
    renderDetail(host);
    return;
  }
  if (btn.dataset.cmd==='ai'){
    if (!text) return;
    // crée une entrée "commentaire" puis déclenche l'IA dessus (contexte charter inclus côté reducers)
    const updId = addSectionEntry(cardId, secId, { type:'comment', text, origin });
    try {
      await aiAnalyzeEntry({ cardId, updateId: updId, sectionId: secId });
      touchCard(cardId);
    } catch(e) { /* afficher une bannière ? */ }
    ta.value = '';
    renderDetail(host);
    return;
  }
}

function renderDetail(host){
  const detail = $('#sc-detail', host); if (!detail) return;

  // s’assure d’être sur une mini-card
  const cid0 = primaryId || currentCardId();
  const cid  = ensureMini(String(cid0||'')); // peut cloner si c’était une source
  if (cid && cid!==cid0){ primaryId = cid; setLocalSel(cid); }

  const { b, cards } = safeCards();
  const card = cards.find(x=>String(x.id)===String(primaryId||'')) || null;
  if (!card){ detail.innerHTML = '<div style="opacity:.7">Aucune card sélectionnée</div>'; return; }

  const sections = Array.isArray(card.sections) && card.sections.length ? card.sections : [{id:'1', title:'Proposition'}];

  const on  = typeFilters(host);
  const key = `seances.filters.days.${card.id}`;
  let daysSel = []; try { daysSel = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}

  const chunks = [];
  // header card
  chunks.push(`
    <div class="card-block" data-card="${card.id}"
         style="border:1px solid #2a2a2a;border-radius:12px;margin:8px 0;background:#141415">
      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #2a2a2a">
        <strong>#${card.id}</strong>${card.state?.think?'&nbsp;🤔':''}
        <span style="margin-left:8px">${
          (card.title || b.charter?.title || (b.charter?.service?('Service: '+b.charter.service):'Sans titre'))
          .replace(/</g,'&lt;')
        }</span>
        <span style="margin-left:auto;opacity:.8;font-size:12px">${fmtTs(card.updated_ts||card.created_ts||Date.now())}</span>
      </div>
  `);

  for (const sec of sections){
    const f = (card.ui?.filters?.[sec.id]) || { days:daysSel, types:['analyse','ai_md','note','comment','client_md','client_html'] };
    const view = getCardView(String(card.id), { sectionId: sec.id, days: (daysSel.length?daysSel:(f.days||[])), types: f.types });

    // filtrage types selon les cases
    view.groups.forEach(g=>{
      g.items = g.items.filter(u=> keepType(u.type, on));
    });

    const days = view.groups.map(g=>g.day);
    const chipsDays = days.map(d=>`<label class="chip">
      <input type="checkbox" data-action="sec-day" data-card="${card.id}" data-sec="${sec.id}" value="${d}" ${(!daysSel.length || daysSel.includes(d))?'checked':''}> ${d}
    </label>`).join('');

    const typeNames = [
      ['analyse','Analyse'],['ai_md','IA (md)'],['note','Note'],['comment','Commentaire'],
      ['client_md','Client MD'],['client_html','Client HTML']
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
              <label style="margin-left:auto;opacity:.9">
                <input type="checkbox" data-action="hide-upd" data-card="${card.id}" data-upd="${u.id}"> masquer
              </label>
            </div>
            <div class="upd-body">
              <pre style="white-space:pre-wrap;margin:6px 0 0 0">${(u.md ?? u.html ?? u.content ?? '').replace(/</g,'&lt;')}</pre>
              ${u.meta?.prompt?`<details style="margin-top:6px"><summary>Prompt</summary><pre style="white-space:pre-wrap">${(u.meta.prompt||'').replace(/</g,'&lt;')}</pre></details>`:''}
            </div>
          </article>
        `).join('')||'<div style="opacity:.6">Aucun élément</div>'}
      </section>
    `).join('');

    chunks.push(`
      <div class="section" data-sec="${sec.id}" style="padding:10px">
        <header style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <h4 style="margin:0">${(sec.title||('Section '+sec.id)).replace(/</g,'&lt;')}</h4>
          <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
            ${chipsDays}
            ${chipsTypes}
          </div>
        </header>
        ${sectionComposerHTML(card.id, sec.id)}
        ${groups}
      </div>
    `);
  }

  chunks.push(`</div>`); // fin card-block
  detail.innerHTML = chunks.join('');
}

export function mount(host=document.getElementById('tab-seances')){
  if (!host) return;

  // structure
  host.innerHTML = htmlShell();

  // rendu initial (local only)
  renderTimeline(host);
  renderDayChips(host);
  renderDetail(host);

  // éviter double-binding
  if (host.dataset.scBound==='1') return;
  host.dataset.scBound='1';

  // refresh doux quand le blob change (écritures locales)
  document.addEventListener('paria:blob-updated', ()=> {
    const wrap = host; if (!wrap) return;
    renderTimeline(wrap);
    renderDetail(wrap);
  }, {passive:true});

  // interactions timeline (sélection card -> assure mini)
  host.addEventListener('click', (ev)=>{
    const m = ev.target.closest('[data-card-id]');
    if (!m) return;
    const id = String(m.getAttribute('data-card-id'));
    const nid = ensureMini(id);
    primaryId = String(nid||id);
    setLocalSel(primaryId);
    renderTimeline(host);
    renderDayChips(host);
    renderDetail(host);
  });

  // filtres (jours/types) + composer + hide
  host.addEventListener('change', (ev)=>{
    const t = ev.target;
    if (!t) return;

    // types globaux
    if (/^t_(analyse|ai_md|note|comment|client)$/.test(t.name||'')){
      renderDetail(host);
      return;
    }
    // jour dans section
    if (t.dataset?.action==='sec-day'){
      const cardId = t.dataset.card;
      const secId  = t.dataset.sec;
      const b = readClientBlob();
      const card = (b.cards||[]).find(x=>String(x.id)===String(cardId));
      const f = (card.ui?.filters?.[secId]) || { days:[], types:['analyse','ai_md','note','comment','client_md','client_html'] };
      const set = new Set(f.days||[]);
      t.checked ? set.add(t.value) : set.delete(t.value);
      setSectionFilters(cardId, secId, {days:[...set], types:f.types});
      renderDetail(host);
      return;
    }
    // type dans section
    if (t.dataset?.action==='sec-type'){
      const cardId = t.dataset.card;
      const secId  = t.dataset.sec;
      const b = readClientBlob();
      const card = (b.cards||[]).find(x=>String(x.id)===String(cardId));
      const f = (card.ui?.filters?.[secId]) || { days:[], types:['analyse','ai_md','note','comment','client_md','client_html'] };
      const set = new Set(f.types||[]);
      t.checked ? set.add(t.value) : set.delete(t.value);
      setSectionFilters(cardId, secId, {days:f.days, types:[...set]});
      renderDetail(host);
      return;
    }

    // masquer une entrée
    if (t.dataset?.action==='hide-upd'){
      const cardId = t.dataset.card;
      const updId  = t.dataset.upd;
      const art = t.closest('.upd');
      if (art) art.classList.toggle('is-hidden', t.checked);
      if (cardId && updId) hideEntry(cardId, updId, t.checked);
      return;
    }
  });

  host.addEventListener('click', async (ev)=>{
    // actions composer
    const c = ev.target.closest('.composer [data-cmd]');
    if (c) { await onComposerAction(host, c); return; }
  });

  // petit refresh quand l’onglet redevient visible
  document.addEventListener('visibilitychange', ()=>{
    if (document.visibilityState==='visible'){
      renderTimeline(host);
      renderDetail(host);
    }
  });
}

export default { mount };
