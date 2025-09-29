// src/ui/tabs/projector.js — clean rewrite (clone de la timeline Cards en read-only)
import {
  getSession, startSession, pauseSession, stopSession
} from '../../domain/reducers.js';

import { stateGet, dataGet, aesImportKeyRawB64, aesDecryptJSON } from '../../core/net.js';
import { buildWorkId } from '../../core/settings.js';

let __cliKey = null; // CryptoKey en RAM, jamais en localStorage

// --- Remote crypto (HKDF + AES-GCM) ------------------------------------------
const td = new TextDecoder(); const te = new TextEncoder();
const b64uToBytes = (s)=>{ s=s.replace(/-/g,'+').replace(/_/g,'/'); const pad=s.length%4? '='.repeat(4-(s.length%4)) : ''; const bin=atob(s+pad); const out=new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i); return out; };
async function hkdf(ikm, salt, info, len=32){
  const key = await crypto.subtle.importKey('raw', ikm, {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const prk = await crypto.subtle.sign('HMAC', key, salt);
  const k2  = await crypto.subtle.importKey('raw', prk, {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const t1  = await crypto.subtle.sign('HMAC', k2, new Uint8Array([...info,1]));
  return new Uint8Array(t1).slice(0,len);
}

async function deriveViewKey(tokenB64u, workId, sid){
  const ikm  = b64uToBytes(tokenB64u);
  const salt = te.encode(workId);
  const info = te.encode('view:'+sid);
  const raw  = await hkdf(ikm, salt, info, 32);
  return crypto.subtle.importKey('raw', raw, {name:'AES-GCM'}, false, ['decrypt']);
}

// --- Overlay remote mode (off/pause/on) -------------------------------------
function ensureOverlay(){
  let ov = document.getElementById('remote-overlay');
  if (!ov){
    ov = document.createElement('div');
    ov.id = 'remote-overlay';
    ov.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;font:600 18px/1.2 system-ui;background:rgba(0,0,0,.0);color:#fff;z-index:9999;';
    ov.innerHTML = '<div id="remote-overlay-badge" style="padding:10px 14px;border-radius:10px;background:rgba(0,0,0,.55);backdrop-filter:blur(2px)">•••</div>';
    document.body.appendChild(ov);
  }
  return ov;
}

function setRemoteMode(mode){
  const ov = ensureOverlay();
  const badge = ov.querySelector('#remote-overlay-badge');
  if (mode==='off'){
    ov.style.display='flex'; ov.style.background='rgba(0,0,0,.85)'; badge.textContent='Session terminée (off)';
  } else if (mode==='pause'){
    ov.style.display='flex'; ov.style.background='rgba(0,0,0,.35)'; badge.textContent='Pause';
  } else {
    ov.style.display='none';
  }
}

async function pollLoop(){
  if (window.__pariaMode !== 'viewer' || window.__pariaRemote !== 'projector') return;
  try{
    const qs   = new URLSearchParams(location.search);
    const workId = qs.get('work_id') || buildWorkId();
    const sid    = qs.get('sid') || '';
    const token  = (location.hash||'').replace(/^#?k=/,''); // base64url (ikm)

    // (1) état onglet -> overlay
    try{
      const st = await stateGet(workId);
      const mode = (st?.tabs?.projector) || 'off';
      setRemoteMode(mode);
    }catch{}

    // (2) charger snapshot (chiffré v1 / legacy clair)
    let snap = await dataGet(workId, 'snapshot');
    if (snap && snap.v===1 && snap.alg==='A256GCM'){
      if (!token || !sid) return; // paramètres insuffisants
      try{
        const k  = await deriveViewKey(token, workId, sid);
        const iv = b64uToBytes(snap.n);
        const ct = b64uToBytes(snap.ct);
        const plain = await crypto.subtle.decrypt({name:'AES-GCM', iv}, k, ct);
        snap = JSON.parse(new TextDecoder().decode(plain));
      }catch{ return; }
    } else if (snap && snap.ct && snap.iv){
      // Fallback legacy (K_sess côté state + aesDecryptJSON)
      try{
        const st2 = await stateGet(workId);
        if (st2?.K_sess){
          if (!__cliKey) __cliKey = await aesImportKeyRawB64(st2.K_sess);
          snap = await aesDecryptJSON(__cliKey, snap.ct, snap.iv);
        } else { snap = null; }
      }catch{ snap = null; }
    }

    if (snap){
      // Publier en RAM + re-render (read-only)
      window.__remoteSnapshot = snap;
      const host = document.getElementById('tab-projector');
      if (host){
        renderTimeline(host);
        renderDayChips(host);
        renderDetail(host);
      }
    }
  }catch{}
}

// démarrer
if (window.__pariaMode === 'viewer' && window.__pariaRemote === 'projector') {
  pollLoop();                  // kick immédiat
  setInterval(pollLoop, 1500); // suivi périodique
}

const $ = (s,r=document)=>r.querySelector(s);
const $$= (s,r=document)=>Array.from(r.querySelectorAll(s));

// ---------- helpers ----------
function fmtTs(ts){ try{ return ts ? new Date(ts).toLocaleString() : ''; }catch{ return ''; } }
function _dayKey(ts){
  const d = new Date(ts);
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
function getLocalSel(){ try{ return localStorage.getItem('projector.sel'); }catch{return null;} }
function setLocalSel(id){ try{ localStorage.setItem('projector.sel', String(id)); }catch{} }

function listCardDaysSnap(cardId){
  const b = (window.__remoteSnapshot || {});
  const card = (b.cards||[]).find(c=>String(c.id)===String(cardId));
  if (!card) return [];
  const set = new Set();
  for (const u of (card.updates||[])){ if (u?.ts) set.add(_dayKey(u.ts)); }
  return Array.from(set).sort();
}

function getCardViewSnap(cardId, { sectionId, days=[], types=[] } = {}){
  const b = (window.__remoteSnapshot || {});
  const card = (b.cards||[]).find(c=>String(c.id)===String(cardId));
  const groups = [];
  if (!card) return { groups };
  const wantDays  = new Set(days||[]);
  const wantTypes = new Set((types&&types.length)?types:['analyse','ai_md','note','comment','client_md','client_html']);
  const all = (card.updates||[]).filter(u=>{
    if (sectionId && String(u.section_id)!==String(sectionId)) return false;
    const d = _dayKey(u.ts||Date.now());
    if (wantDays.size && !wantDays.has(d)) return false;
    if (wantTypes.size && !wantTypes.has(u.type)) return false;
    return true;
  }).sort((a,b)=>a.ts<b.ts?1:-1);
  const byDay = {};
  for (const u of all){ const d=_dayKey(u.ts||Date.now()); (byDay[d]=byDay[d]||[]).push(u); }
  for (const d of Object.keys(byDay).sort((a,b)=>a<b?1:-1)){ groups.push({ day:d, items:byDay[d] }); }
  return { groups };
}

function safeCards(){
  const b = (window.__remoteSnapshot || {});
  const cards = (b.cards||[]).filter(c=>!(c.state?.deleted)).slice()
    .sort((a,b)=> (b.updated_ts||0)-(a.updated_ts||0));
  return { b, cards };
}

function currentCardId(){
  const sess = getSession() || {};
  const { cards } = safeCards();
  return sess.card_id || getLocalSel() || (cards[0]?.id ?? null);
}

// ---------- shell ----------
function htmlShell(){
  const sess = getSession() || {};
  return `
  <div class="projector" style="padding:8px">
    <section class="block" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <div class="muted" style="display:flex;gap:8px;align-items:center">
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

    <!-- timeline identique Cards -->
    <div id="cards-timeline" class="cards-timeline" style="display:flex;gap:8px;overflow:auto;padding:8px 4px;"></div>

    <!-- filtres identiques (jours + types) -->
    <section class="block" id="proj-filters" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:8px 4px">
      <div class="muted">Filtres</div>
      <div id="chips-days" class="chips" style="display:flex;gap:6px;flex-wrap:wrap"></div>
      <label><input type="checkbox" name="t_analyse" checked> analyse</label>
      <label><input type="checkbox" name="t_note"    checked> note</label>
      <label><input type="checkbox" name="t_comment" checked> commentaire</label>
      <label><input type="checkbox" name="t_client"  checked> client</label>
    </section>

    <div id="card-detail" style="flex:1 1 auto; overflow:auto; padding:8px 4px 16px;"></div>
  </div>`;
}

// ---------- renders (clone Cards, sans actions d’édition) ----------
let primaryId = null;

function renderTimeline(host){
  const wrap = $('#cards-timeline', host); if (!wrap) return;
  const { b, cards } = safeCards();
  const sess = getSession() || {};
  const activeId = String(sess.card_id || getLocalSel() || primaryId || '');

  function esc(s){ return String(s||'').replace(/</g,'&lt;'); }

  const html = cards.map(c=>{
    const id    = String(c.id);
    const isAct = String(activeId||'')===id;
    const cls   = `card-mini ${isAct?'is-active':''}`;
    const title = (
      (c.title && c.title.trim())
      || (b.charter?.title && b.charter.title.trim())
      || (b.charter?.service ? ('Service: '+b.charter.service) : 'Sans titre')
    ).replace(/</g,'&lt;');
    const ts    = fmtTs(c.updated_ts || c.created_ts || Date.now());
    const think = c.state?.think ? ' • 🤔' : '';
    const halo  = c.state?.consolidated ? 'box-shadow:0 0 0 2px #ff8c00 inset;border-color:#ff8c00;' : '';
    const scen  = (c.type==='scenario')
      ? '<span class="badge" title="Scénario" style="background:#444;padding:0 6px;border-radius:999px;margin-left:6px">🎬</span>'
      : '';

    return `
    <article class="${cls}" data-card-id="${id}"
      title="${esc(title)}"
      style="border-radius:12px;border:1px solid #2a2a2a;${halo}padding:6px 8px;min-width:220px;background:#141415">
      <header style="display:flex;align-items:center;gap:6px;font-size:12px;opacity:.85">
        <span>#${id}${think}</span>${scen}
        <span class="mini-ts" style="margin-left:auto">${ts}</span>
      </header>
      <div class="mini-title" style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">
        ${title}
      </div>
    </article>`;
  }).join('');

  wrap.innerHTML = html || '<em style="opacity:.6;padding:4px 0">Aucune card</em>';
}

function renderDayChips(host){
  const box = $('#chips-days', host); if (!box) return;
  const cid = currentCardId(); if (!cid) { box.innerHTML=''; return; }
  const days = listCardDaysSnap(String(cid));

  const key = `projector.filters.days.${cid}`;
  let sel = [];
  try { sel = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
  if (!sel.length) sel = days.slice(0, 3);

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

function typeFilters(host){
  const box = $('#proj-filters', host);
  return {
    analyse:  $('input[name="t_analyse"]', box)?.checked !== false,
    note:     $('input[name="t_note"]',    box)?.checked !== false,
    comment:  $('input[name="t_comment"]', box)?.checked !== false,
    client:   $('input[name="t_client"]',  box)?.checked !== false,
  };
}
function keepType(t,on){
  if (t==='analyse') return on.analyse;
  if (t==='note') return on.note;
  if (t==='comment') return on.comment;
  if (t?.startsWith('client')) return on.client;
  return true;
}

function renderDetail(host){
  const detail = $('#card-detail', host); if (!detail) return;
  const cid = currentCardId();
  const { b, cards } = safeCards();
  const card = cards.find(x=>String(x.id)===String(cid));
  if (!card){ detail.innerHTML = '<div style="opacity:.7">Aucune card sélectionnée</div>'; return; }

  const sections = Array.isArray(card.sections) && card.sections.length ? card.sections : [{id:'1', title:'Proposition'}];

  const on  = typeFilters(host);
  const key = `projector.filters.days.${cid}`;
  let daysSel = [];
  try { daysSel = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}

  const viewBySec = new Map();

  for (const sec of sections){
    const f = (card.ui?.filters?.[sec.id]) || { days:daysSel, types:['analyse','ai_md','note','comment','client_md','client_html'] };
    // priorité aux jours du panneau global; sinon ceux stockés dans la card
    const filt = { days: (daysSel.length?daysSel:(f.days||[])), types: f.types };
    const v = getCardViewSnap(String(card.id), { sectionId: sec.id, days: filt.days, types: filt.types });
    // filtrage types (checkbox) côté Projecteur
    v.groups.forEach(g=>{
      g.items = g.items.filter(u=> keepType(u.type, on));
    });
    viewBySec.set(String(sec.id), v);
  }

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
    const v = viewBySec.get(String(sec.id));
    const days = v.groups.map(g=>g.day);
    const chipsDays = days.map(d=>`<label class="chip">
      <input type="checkbox" data-action="sec-day" data-card="${card.id}" data-sec="${sec.id}" value="${d}" ${(!daysSel.length || daysSel.includes(d))?'checked':''}> ${d}
    </label>`).join('');

    const groups = v.groups.map(g=>`
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
            </div>
            <div class="upd-body">
              <pre style="white-space:pre-wrap;margin:6px 0 0 0">${(u.md||u.html||'').replace(/</g,'&lt;')}</pre>
              ${u.meta?.prompt?`<details style="margin-top:6px"><summary>Prompt</summary><pre style="white-space:pre-wrap">${(u.meta.prompt||'').replace(/</g,'&lt;')}</pre></details>`:''}
            </div>
          </article>
        `).join('')}
      </section>
    `).join('') || '<div style="opacity:.6;padding:6px 0">Aucun élément pour ce filtre.</div>';

    chunks.push(`
      <div class="section" data-sec="${sec.id}" style="padding:10px">
        <header style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <h4 style="margin:0">${(sec.title||('Section '+sec.id)).replace(/</g,'&lt;')}</h4>
          <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
            ${chipsDays}
          </div>
        </header>
        ${groups}
      </div>
    `);
  }
  chunks.push(`</div>`); // fin card-block

  detail.innerHTML = chunks.join('');
}

// ---------- public mount ----------
export function mount(host=document.getElementById('tab-projector')){
  if (!host) return;
  primaryId = null;

  // (1) structure UI
  host.innerHTML = htmlShell();

  // (2) always render UI (même si déjà câblé)
  renderTimeline(host);
  renderDayChips(host);
  renderDetail(host);

  // (3) bind handlers une seule fois
  if (host.dataset.projBound === '1') return;
  host.dataset.projBound = '1';
  
  document.addEventListener('paria:blob-updated', () => {
    const wrap = document.querySelector('#cards-timeline')?.closest('.projector');
    if (!wrap) return;
    renderTimeline(wrap);
    renderDetail(wrap, currentCardId());
  });

  document.addEventListener('visibilitychange', ()=>{
    if (document.visibilityState === 'visible'){
      renderTimeline(host);
      renderDetail(host);
    }
  });

  // interactions
  host.addEventListener('click', async (ev)=>{
    // clic mini-card : preview local (aucun publish Git depuis Projecteur)
    const m = ev.target.closest('[data-card-id]');
    if (m){
      const id = String(m.getAttribute('data-card-id'));
      setLocalSel(id);
      primaryId = id;
      $('#proj-state', host).textContent = (getSession()?.status||'idle');
      renderTimeline(host);
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
        const id = currentCardId();
        const u = new URL(location.href);
        u.searchParams.set('mode','projecteur');
        if (id) u.searchParams.set('card', String(id)); // pas de session, pas de PUT
        await navigator.clipboard.writeText(u.toString());
        alert('Lien copié.');
      } catch {}
      return;
    }
  });

  // filtres types
  host.addEventListener('change', (ev)=>{
    const t = ev.target;
    if (!t) return;
    if (/^t_(analyse|note|comment|client)$/.test(t.name||'')){
      renderDetail(host);
    }
    if (t.dataset?.action==='sec-day'){
      renderDetail(host);
    }
  });
}


export default { mount };










