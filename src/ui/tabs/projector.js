// src/ui/tabs/projector.js — REWRITE FULL (Cards en lecture seule)
import { listCards, getSession, startSession, pauseSession, stopSession } from '../../domain/reducers.js';

const $  = (s, r=document)=>r.querySelector(s);

// ---------- helpers ----------
function tsToStr(t){
  const d = new Date(typeof t==='number' ? t : Date.now());
  const p = n=>String(n).padStart(2,'0');
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function dayKey(t){
  const d = new Date(typeof t==='number' ? t : Date.now());
  const p = n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}
function getLocalSel(){ try{ return localStorage.getItem('projector.sel'); }catch{return null;} }
function setLocalSel(id){ try{ localStorage.setItem('projector.sel', String(id)); }catch{} }

function safeCards(){
  let cards = [];
  try { cards = listCards() || []; } catch {}
  return cards
    .filter(c => !(c?.state?.deleted) && !c?.deleted)
    .sort((a,b)=> (b.updated_ts||0)-(a.updated_ts||0));
}
function currentCardId(){
  const sess = getSession() || {};
  return sess.card_id || getLocalSel() || (safeCards()[0]?.id ?? null);
}

// ---------- shell ----------
function htmlShell(){
  const sess  = getSession() || {};
  const cards = safeCards();
  const selId = currentCardId();

  const opts = cards.map(c =>
    `<option value="${c.id}" ${String(c.id)===String(selId)?'selected':''}>${(c.title||`#${c.id}`)}</option>`
  ).join('');

  return `
  <div class="projector" style="padding:8px">
    <section class="block" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <div id="proj-toolbar" class="muted" style="display:flex;gap:8px;align-items:center">
        <strong>Projecteur</strong>
        <span> • État: <span id="proj-state">${sess.status||'idle'}</span></span>
      </div>
      <div style="margin-left:auto;display:flex;gap:6px">
        <button title="Démarrer"        data-action="session-start">▶️</button>
        <button title="Pause"           data-action="session-pause">⏸️</button>
        <button title="Stop"            data-action="session-stop">⏹️</button>
        <button title="Copier le lien"  data-action="session-copy">🔗</button>
      </div>
    </section>

    <section class="block">
      <div id="proj-filters" class="cards-filters" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <label>Card :
          <select id="proj-card">${opts}</select>
        </label>
        <div class="muted">Filtres</div>
        <div id="chips-days" class="chips" style="display:flex;gap:6px;flex-wrap:wrap"></div>
        <label><input type="checkbox" name="t_analyse" checked> analyse</label>
        <label><input type="checkbox" name="t_note"    checked> note</label>
        <label><input type="checkbox" name="t_comment" checked> commentaire</label>
        <label><input type="checkbox" name="t_client"  checked> client</label>
      </div>
    </section>

    <!-- timeline identique à Cards (read-only) -->
    <div id="proj-mini-tl" class="cards-timeline" style="margin-bottom:8px"></div>

    <section id="proj-detail" class="block"></section>
  </div>`;
}

// ---------- renders ----------
function renderMiniTimeline(host){
  const wrap = $('#proj-mini-tl', host); if (!wrap) return;
  const sess = getSession() || {};
  const activeId = String(sess.card_id || getLocalSel() || '');
  const cards = safeCards();

  const html = cards.map(c=>{
    const active = String(c.id)===activeId;
    const title  = (c.title || `#${c.id}`).replace(/</g,'&lt;');
    const ts     = tsToStr(c.updated_ts || c.created_ts || Date.now());
    const think  = (c.state?.think) ? ' • 🤔' : '';
    const scen   = (c.type==='scenario')
      ? ' <span class="badge" title="Scénario" style="background:#444;padding:0 6px;border-radius:999px;margin-left:6px">🎬</span>'
      : '';
    return `<button class="card-mini ${active?'is-active':''}" data-cid="${c.id}" title="#${c.id} • ${title} • ${ts}">
      <span class="mini-id">#${c.id}${think}${scen}</span>
      <span class="mini-title">${title}</span>
      <span class="mini-ts">${ts}</span>
    </button>`;
  }).join('') || `<div class="muted">Aucune card</div>`;

  wrap.innerHTML = html;
}

function collectDaysForCard(card){
  const upd = (card?.updates || []);
  const days = new Set(upd.map(u=>dayKey(u.ts || card.updated_ts)));
  return Array.from(days).sort().reverse();
}

function renderDayChips(host){
  const box = $('#chips-days', host); if (!box) return;
  const cid = currentCardId();
  const card = safeCards().find(c=>String(c.id)===String(cid));
  const days = collectDaysForCard(card);

  const key = `projector.filters.days.${cid}`;
  let sel = [];
  try { sel = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
  if (!sel.length) sel = days.slice(0, 3); // par défaut : 3 derniers jours

  box.innerHTML = days.map(d=>{
    const on = sel.includes(d);
    return `<button class="chip ${on?'on':''}" data-day="${d}">${d}</button>`;
  }).join('');

  box.onclick = (ev)=>{
    const b = ev.target.closest('button[data-day]');
    if (!b) return;
    const d = b.dataset.day;
    const was = sel.includes(d);
    sel = was ? sel.filter(x=>x!==d) : [...sel, d];
    localStorage.setItem(key, JSON.stringify(sel));
    renderDayChips(host);
    renderDetail(host);
  };
}

function typeFilters(host){
  const box = $('#proj-filters', host);
  return {
    analyse:  $('input[name="t_analyse"]', box)?.checked !== false,
    note:     $('input[name="t_note"]',    box)?.checked !== false,
    comment:  $('input[name="t_comment"]', box)?.checked !== false,
    client:   $('input[name="t_client"]',  box)?.checked !== false,
  };
}
function filterByTypes(type, on){
  if (type==='analyse')   return on.analyse;
  if (type==='note')      return on.note;
  if (type==='comment')   return on.comment;
  if (type?.startsWith('client')) return on.client;
  return true;
}

function renderDetail(host){
  const box = $('#proj-detail', host); if (!box) return;
  const cid = currentCardId();
  const card = safeCards().find(c=>String(c.id)===String(cid));
  if (!card){ box.innerHTML = `<div class="muted">Aucune card</div>`; return; }

  const sections = Array.isArray(card.sections) && card.sections.length
    ? card.sections
    : [{ id:'1', title:'Contenu' }];

  const on  = typeFilters(host);
  const key = `projector.filters.days.${cid}`;
  let daysSel = [];
  try { daysSel = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}

  const upd = (card.updates || []);
  const bySection = {};
  for (const u of upd){
    const okType = filterByTypes(u.type, on);
    const dk = dayKey(u.ts || card.updated_ts);
    const okDay  = !daysSel.length || daysSel.includes(dk);
    if (!okType || !okDay) continue;
    const sid = String(u.section_id || '1');
    bySection[sid] = bySection[sid] || {};
    bySection[sid][dk] = bySection[sid][dk] || [];
    bySection[sid][dk].push(u);
  }

  const sectionHtml = sections.map(sec=>{
    const days = Object.keys(bySection[String(sec.id)||'1']||{}).sort().reverse();
    const items = days.map(d=>{
      const arr = bySection[String(sec.id)||'1'][d] || [];
      const lis = arr.map(u=>{
        const t = tsToStr(u.ts || card.updated_ts);
        const origin = u.origin || 'n/d';
        const type   = u.type   || 'note';
        const body   = (u.html ? u.html : (u.md||'')).replace(/\n/g,'<br>');
        return `<li><span class="muted">${t} • ${origin} • ${type}</span><div class="body">${body||'—'}</div></li>`;
      }).join('');
      return `<div class="day-group"><div class="muted">${d}</div><ul class="updates">${lis}</ul></div>`;
    }).join('') || `<div class="muted">Aucune mise à jour pour cette section.</div>`;

    return `
    <article class="card-section">
      <header class="sticky"><h4>${sec.title||'Section'}</h4></header>
      ${items}
    </article>`;
  }).join('');

  box.innerHTML = sectionHtml;
}

// ---------- public mount ----------
export function mount(host=document.getElementById('tab-projector')){
  if (!host) return;
  host.innerHTML = htmlShell();

  // renders init
  renderMiniTimeline(host);
  renderDayChips(host);
  renderDetail(host);

  host.addEventListener('change', async (ev)=>{
    // select card
    if (ev.target && ev.target.id==='proj-card'){
      const id = ev.target.value;
      const sess = getSession() || {};
      if ((sess.status||'idle')==='running'){
        await startSession(id);   // publish
      } else {
        setLocalSel(id);          // preview
      }
      $('#proj-state', host).textContent = (getSession()?.status||'idle');
      renderMiniTimeline(host);
      renderDayChips(host);
      renderDetail(host);
    }
    // type filters
    if (ev.target && /^t_(analyse|note|comment|client)$/.test(ev.target.name||'')){
      renderDetail(host);
    }
  });

  host.addEventListener('click', async (ev)=>{
    const m = ev.target.closest('#proj-mini-tl [data-cid]');
    if (m){
      const id = m.dataset.cid;
      const sess = getSession() || {};
      if ((sess.status||'idle')==='running'){
        await startSession(id);   // publish
      } else {
        setLocalSel(id);          // preview
      }
      $('#proj-state', host).textContent = (getSession()?.status||'idle');
      renderMiniTimeline(host);
      renderDayChips(host);
      renderDetail(host);
      return;
    }

    const b = ev.target.closest('[data-action]');
    if (!b) return;

    if (b.dataset.action==='session-start'){
      const id = currentCardId();
      if (id) await startSession(id);
      $('#proj-state', host).textContent = (getSession()?.status||'idle');
      return;
    }
    if (b.dataset.action==='session-pause'){
      await pauseSession();
      $('#proj-state', host).textContent = (getSession()?.status||'idle');
      return;
    }
    if (b.dataset.action==='session-stop'){
      await stopSession();
      $('#proj-state', host).textContent = (getSession()?.status||'idle');
      return;
    }
    if (b.dataset.action==='session-copy'){
      try {
        let sess = getSession() || {};
        let sid  = sess.session_id;
        // si pas démarré → démarrer sur la card courante pour avoir une session
        if ((sess.status||'idle')==='idle'){
          const id = currentCardId();
          if (id) await startSession(id);
          sess = getSession() || {};
          sid  = sess.session_id;
        }
        const u = new URL(location.href);
        u.searchParams.set('mode','projecteur');
        if (sid) u.searchParams.set('session', sid);
        await navigator.clipboard.writeText(u.toString());
        alert('Lien copié.');
      } catch {}
      return;
    }
  });
}

export default { mount };
