// src/ui/tabs/projector.js — clean rewrite (clone de la timeline Cards en read-only)
import {
  getSession, startSession, pauseSession, stopSession
} from '../../domain/reducers.js';

import { stateGet, dataGet, aesImportKeyRawB64, aesDecryptJSON, getGAS } from '../../core/net.js';
import { buildWorkId } from '../../core/settings.js';

let __cliKey = null; // CryptoKey en RAM, jamais en localStorage
let __remoteDead = false;
let __pollTimer = null;
let __lastSnapFetch = { url: '', tries: 0, ok: false }; // diag lecture snapshot

// --- auto-gate: bascule en mode viewer/projector si l'URL l'indique ---
if (!window.__pariaMode) {
  const isProj = /\/projector\/?/.test(location.pathname);
  const hasK   = /[#&]k=/.test(location.hash);
  window.__pariaMode   = (isProj || hasK) ? 'viewer' : 'local';
}
if (!window.__pariaRemote && window.__pariaMode === 'viewer') {
  window.__pariaRemote = /\/projector\/?/.test(location.pathname) ? 'projector'
                      : /\/seances\/?/.test(location.pathname)   ? 'seances'
                      : '';
}

// --- bootstrap secrets: capture immédiate workId/sid/#k avant réécriture URL ---
(function bootstrapViewerSecrets(){
  try{
    const qs = new URLSearchParams(location.search);
    const wid = qs.get('work_id');
    const sid = qs.get('sid');
    const m   = (location.hash||'').match(/[#&]k=([^&]+)/);
    const k   = m ? m[1] : null;

    if (wid) sessionStorage.setItem('__paria_workId', decodeURIComponent(wid));
    if (sid) sessionStorage.setItem('__paria_sid', sid);
    if (k)   sessionStorage.setItem('__paria_k', k);
  }catch(e){ console.warn('[VIEWER] bootstrap secrets error', e); }
})();


// --- Boot/poll guards (persistés entre itérations)
window.__proj = window.__proj || {};
const PROJ = window.__proj;
PROJ.startTs  ??= Date.now();
PROJ.deadline ??= PROJ.startTs + 30_000; // 30s
PROJ.okCount  ??= 0;                     // nb de lectures OK
PROJ.retries  ??= 0;                     // compteur de retries
PROJ.stopped  ??= false;                 // flag arrêt


// --- Remote crypto (HKDF + AES-GCM) ------------------------------------------
const td = new TextDecoder(); const te = new TextEncoder();
const b64uToBytes = (s)=>{ s=s.replace(/-/g,'+').replace(/_/g,'/'); const pad=s.length%4? '='.repeat(4-(s.length%4)) : ''; const bin=atob(s+pad); const out=new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i); return out; };

async function hkdf(ikm, salt, info, len=32){
  const key = await crypto.subtle.importKey('raw', ikm, {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const prk = await crypto.subtle.sign('HMAC', key, salt);
  const k2  = await crypto.subtle.importKey('raw', prk, {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  
  // HKDF (simplifié) : T1 = HMAC(PRK, info || 0x01)
  const infoBuf = (info && info.buffer) ? new Uint8Array(info) : new Uint8Array(0);
  const inBuf   = new Uint8Array(infoBuf.length + 1);
  inBuf.set(infoBuf, 0);
  inBuf[inBuf.length - 1] = 0x01;

  const t1  = await crypto.subtle.sign('HMAC', k2, inBuf);
  return new Uint8Array(t1).slice(0, len);
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
    __remoteDead = true; // OFF terminal: stoppe toute activité
    ov.style.display='flex'; ov.style.background='rgba(0,0,0,.85)'; badge.textContent='Session terminée (off)';
  } else if (mode==='pause'){
    ov.style.display='flex'; ov.style.background='rgba(0,0,0,.35)'; badge.textContent='Pause';
  } else {
    ov.style.display='none';
  }
}

async function fetchSnapshotFromGit(workId, sid) {

  // chemin du snapshot (côté Git)
  const safeWid = decodeURIComponent(workId || '').replace(/\|/g,'/');
  const keyPath = `clients/${safeWid}/snapshot.json`;
  console.log('[VIEWER] snapshot path =', keyPath, '(via GAS:git_load)');

  // lecture via Apps Script (route=git_load) en GET, retry 10×3s (max 30s)
  const { url, secret } = getGAS() || {};
  const exec = String(url||'').replace(/\/+$/,'').replace(/\/exec(?:\/exec)?$/,'/exec');

  for (let i = 0; i < 10; i++) {
    try {
      const u = `${exec}?route=git_load&work_id=${encodeURIComponent(workId)}&json_path=${encodeURIComponent(keyPath)}&secret=${encodeURIComponent(secret||'')}`;
      const res = await fetch(u, { method:'GET', cache:'no-store' });
      __lastSnapFetch = { url: u, tries: i + 1, ok: res.ok };
      if (res.ok) {
        const j   = await res.json().catch(()=> ({}));
        const enc = j && j.ok && (j.state || j.data) ? (j.state || j.data) : null;
        if (enc) return enc; // succès → on sort sans relancer le poll ici
      }
    } catch {
      __lastSnapFetch = { url: keyPath, tries: i + 1, ok: false };
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  
  // timeout → message + arrêt
  try {
    const ov = ensureOverlay();
    ov.style.display = 'flex';
    ov.style.background = 'rgba(0,0,0,.85)';
    ov.querySelector('#remote-overlay-badge').textContent = 'Aucun snapshot (timeout)';
  } catch {}
  __remoteDead = true;
  console.warn('[VIEWER] snapshot introuvable après', (__lastSnapFetch.tries || 10), 'essais → arrêt.');
  return null;

}

async function pollLoop(){

  if (window.__pariaMode !== 'viewer' || window.__pariaRemote !== 'projector') return;

  const boot = (k) => (window.__pariaBoot && window.__pariaBoot[k]) || '';

  // deadline 30s
  if (Date.now() > PROJ.deadline) {
    if (PROJ.okCount === 0) {
      console.warn('[VIEWER] arrêt: impossible de lire le snapshot (30s).');
      try { setRemoteMode('pause'); } catch {}
      PROJ.stopped = true;
      return;
    }
    if (PROJ.okCount > 1) {
      console.warn('[VIEWER] arrêt: instabilité snapshot (>1 lectures OK dans 30s).');
      try { setRemoteMode('pause'); } catch {}
      PROJ.stopped = true;
      return;
    }
  }
  // si déjà arrêté (première lecture OK), on ne fait plus rien
  if (PROJ.stopped) return;

  try{
    const qs   = new URLSearchParams(location.search);
    const workId = boot('workId') || qs.get('work_id') || sessionStorage.getItem('__paria_workId') || localStorage.getItem('__paria_workId') || buildWorkId();
    const sid    = boot('sid')    || qs.get('sid')     || sessionStorage.getItem('__paria_sid')     || localStorage.getItem('__paria_sid')     || '';
    const token  = boot('k')      || (((location.hash||'').match(/[#&]k=([^&]+)/)||[])[1]) || sessionStorage.getItem('__paria_k') || localStorage.getItem('__paria_k') || '';

    // (1) état onglet -> overlay
    try{
      const st = await stateGet(workId);
      const mode = st?.tabs?.projector;
      if (mode) setRemoteMode(mode); // sinon conserver l’overlay courant (défaut = pause)
      console.log('[VIEWER] état lu (tabs.projector) =', mode ?? '(absent)');

    }catch{}

    // (2) charger snapshot (chiffré v1 / legacy clair)
    let snap = await fetchSnapshotFromGit(workId);
    if (__lastSnapFetch && __lastSnapFetch.url) {
      const retries = Math.max(0, (__lastSnapFetch.tries || 0) - 1);
      console.log('[VIEWER] retries =', retries);
    }

    if (__remoteDead || snap === null) {
      console.warn('[VIEWER] arrêt du poll (timeout). retries=', Math.max(0, (__lastSnapFetch.tries||0)-1));
      return;
    }

    // log retries (essais - 1)
    {
      const info = (typeof __lastSnapFetch !== 'undefined') ? __lastSnapFetch : {};
      if (info.url) {
        const retries = Math.max(0, (info.tries || 0) - 1);
        console.log('[VIEWER] retries =', retries);
      }
    }

    if (snap && snap.v === 1 && snap.alg === 'A256GCM') {
      // récupérer les secrets saisis très tôt (bootstrapViewerSecrets)
      const kHash = sessionStorage.getItem('__paria_k') || ((location.hash||'').match(/[#&]k=([^&]+)/)||[])[1] || '';
      const wid   = sessionStorage.getItem('__paria_workId') || workId;
      const sid0  = sessionStorage.getItem('__paria_sid')    || sid;
    
      if (!kHash || !sid0 || !wid) {
        console.warn('[VIEWER] secrets incomplets (k|sid|workId manquants) → retry');
        return; // on laisse la boucle poll/retry continuer
      }
    
      // pipeline identique Cards : HKDF(key = base64url(#k), salt = workId, info = "view:"+sid)
      const ikm  = (()=>{
        // base64url => bytes
        const s = String(kHash).replace(/-/g,'+').replace(/_/g,'/');
        const pad = s.length % 4 ? '='.repeat(4-(s.length%4)) : '';
        const bin = atob(s+pad);
        const out = new Uint8Array(bin.length);
        for (let i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i);
        return out;
      })();
      const salt = new TextEncoder().encode(wid);
      const info = new TextEncoder().encode('view:'+sid0);
    
      const prkKey = await crypto.subtle.importKey('raw', ikm, {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
      const prk    = await crypto.subtle.sign('HMAC', prkKey, salt);
      const macKey = await crypto.subtle.importKey('raw', prk, {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
      const infoBuf= new Uint8Array(info.length+1); infoBuf.set(info); infoBuf[infoBuf.length-1]=1;
      const t1     = await crypto.subtle.sign('HMAC', macKey, infoBuf);
      const kvRaw  = new Uint8Array(t1).slice(0,32);
      const kDec   = await crypto.subtle.importKey('raw', kvRaw, {name:'AES-GCM'}, false, ['decrypt']);
    
      const iv  = (()=>{ // snap.n = IV en base64url (12 octets)
        const s = String(snap.n||'').replace(/-/g,'+').replace(/_/g,'/');
        const pad = s.length % 4 ? '='.repeat(4-(s.length%4)) : '';
        const bin = atob(s+pad);
        const out = new Uint8Array(bin.length);
        for (let i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i);
        return out;
      })();
    
      const ct  = (()=>{ // snap.ct = ciphertext+tag (base64url)
        const s = String(snap.ct||'').replace(/-/g,'+').replace(/_/g,'/');
        const pad = s.length % 4 ? '='.repeat(4-(s.length%4)) : '';
        const bin = atob(s+pad);
        const out = new Uint8Array(bin.length);
        for (let i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i);
        return out;
      })();
    
      try {
        const pt   = await crypto.subtle.decrypt({name:'AES-GCM', iv}, kDec, ct);
        const text = new TextDecoder().decode(pt);
        const obj  = JSON.parse(text);
    
        // on a le snapshot en clair → appliquer l’état
        const mode = obj?.tabs?.projector;
        if (mode) setRemoteMode(mode);
        console.log('[VIEWER] snapshot OK (tabs.projector) =', mode ?? '(absent)');
        
        // --- ajout : poser le snapshot en RAM + rendre via l’API standard
        window.__remoteSnapshot = obj;
        try {
          const host = document.getElementById('tab-projector') || document.body;
          update(host, obj); // update(...) est exportée par CE fichier
        } catch(e) {
          console.warn('[VIEWER] update err', e);
        }

        // … si tu as un rendu à déclencher ici, fais-le …
        snap = obj; // ← on garde le snapshot déchiffré pour la suite
      } catch(e){
        console.warn('[VIEWER] déchiffrement v1 KO → retry', e?.name||e);
        return; // on laisse le retry tourner
      }
    } else if (snap && snap.ct && snap.iv){
      // Fallback legacy (K_sess côté state + aesDecryptJSON)
      try{
        const st2 = await stateGet(workId);
        if (st2 && st2.K_sess){
          if (!__cliKey) { __cliKey = await aesImportKeyRawB64(st2.K_sess); }
          snap = await aesDecryptJSON(__cliKey, snap.ct, snap.iv);
        } else {
          snap = null;
        }
      }catch{
        snap = null;
      }
    }

    if (snap){
      const mode2 = snap?.tabs?.projector;
      if (mode2) setRemoteMode(mode2);
      const host = document.getElementById('tab-projector') || document.body;
      window.__remoteSnapshot = snap;
      try { update(host, snap); } catch(e){ console.warn('[VIEWER] update err', e); }
    }

    if (!window.__projRenderedOnce) {
  __pollTimer = setTimeout(pollLoop, 1500);
  }

  }catch{}
}

// démarrer
if (window.__pariaMode === 'viewer' && window.__pariaRemote === 'projector') {
  setRemoteMode('pause'); // overlay immédiat, pas de flash "off"
  
  // -- ajout : monter l'UI tout de suite
  const host = document.getElementById('tab-projector') || document.body;
  try { host.style.removeProperty('display'); } catch {}
  try { mount(host); } catch (e) { console.warn('[VIEWER] mount err', e); }

  pollLoop();                  // kick immédiat
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
  const sess = (window.__pariaMode==='viewer') ? {} : (getSession()||{});
  const { cards } = safeCards();
  return sess.card_id || getLocalSel() || (cards[0]?.id ?? null);
}

// ---------- shell ----------
function htmlShell(){
  const sess = (window.__pariaMode==='viewer') ? {} : (getSession()||{});
  return `
  <div class="projector" style="padding:8px">
    <section class="block" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <div class="muted" style="display:flex;gap:8px;align-items:center">
        <strong>Projecteur</strong>
        <span> • État: <span id="proj-state">${sess.status||'idle'}</span></span>
      </div>
      <div style="margin-left:auto;display:flex;gap:6px;${window.__pariaMode==='viewer'?'display:none;':''}">
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
      <label><input type="checkbox" name="t_ai_md"  checked> IA (md)</label>
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
  const sess = (window.__pariaMode==='viewer') ? {} : (getSession()||{});
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
    ai_md:    $('input[name="t_ai_md"]',   box)?.checked !== false,
    note:     $('input[name="t_note"]',    box)?.checked !== false,
    comment:  $('input[name="t_comment"]', box)?.checked !== false,
    client:   $('input[name="t_client"]',  box)?.checked !== false,
  };
}
function keepType(t,on){
  if (t==='analyse') return on.analyse;
  if (t==='ai_md')   return on.ai_md;
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
  if (window.__pariaMode!=='viewer') {
    renderTimeline(host);
    renderDayChips(host);
    renderDetail(host);
  }

  // (3) bind handlers une seule fois
  if (host.dataset.projBound === '1') return;
  host.dataset.projBound = '1';

  if (window.__pariaMode!=='viewer') {
    document.addEventListener('paria:blob-updated', () => {
      const wrap = document.querySelector('#cards-timeline')?.closest('.projector');
      if (!wrap) return;
      renderTimeline(wrap);
      renderDetail(wrap, currentCardId());
    });
  }

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
      if (window.__pariaMode==='viewer') return;
      const id = currentCardId();
      if (id) await startSession(id);
      $('#proj-state', host).textContent = (getSession()?.status||'idle');
      return;
    }
    if (b.dataset.action==='session-pause'){
      if (window.__pariaMode==='viewer') return;
      await pauseSession();
      $('#proj-state', host).textContent = (getSession()?.status||'idle');
      return;
    }
    if (b.dataset.action==='session-stop'){
      if (window.__pariaMode==='viewer') return;
      await stopSession();
      $('#proj-state', host).textContent = (getSession()?.status||'idle');
      return;
    }
    if (b.dataset.action==='session-copy'){
      try {
        
        // 1) work_id / sid / #k
        const workId = await buildWorkId();
        const sid = (getSession()?.sid)
          || ('S-' + new Date().toISOString().slice(0,10) + '-' + Math.random().toString(36).slice(2,8));
        const bytes = new Uint8Array(32); crypto.getRandomValues(bytes);
        const b64 = btoa(String.fromCharCode(...bytes));
        const k   = b64.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); // base64url

        // 2) mémoriser localement (pour le viewer si l’URL est réécrite très tôt)
        localStorage.setItem('__paria_workId', workId);
        localStorage.setItem('__paria_sid', sid);
        localStorage.setItem('__paria_k', k);

        // 3) construire l’URL projector propre (PAS “settings”)
        const viewer = new URL(`${location.origin}/paria-tool/projector/`);
        viewer.searchParams.set('work_id', workId);
        viewer.searchParams.set('sid', sid);
        const id = currentCardId();
        if (id) viewer.searchParams.set('card', String(id));
        viewer.hash = `#k=${k}`;

        // 4) publier (laisse ton code existant écouter cet event pour snapshot/state)
        document.dispatchEvent(new CustomEvent('paria:remote-link', {
          detail: { tab:'projector', action:'copy', workId, sid, k }
        }));

        await navigator.clipboard.writeText(viewer.toString());
        alert('Lien copié.');
      } catch {}
      return;
    }
  });

  // filtres types
  host.addEventListener('change', (ev)=>{
    const t = ev.target;
    if (!t) return;
    if (/^t_(analyse|ai_md|note|comment|client)$/.test(t.name||'')){
      renderDetail(host);
    }
    if (t.dataset?.action==='sec-day'){
      renderDetail(host);
    }
  });
}

// --- RENDERER STANDARD POUR PROJECTOR (ajout minimal, non intrusif)
export function update(host, snapshot) {
  const snap = snapshot || (window.__remoteSnapshot || {});
  // Si l’UI expose déjà des helpers, on les utilise
  const maybe = (name) => {
    // cherche d’abord un export nommé, puis une méthode du default export
    const mod = /** @type any */ (module || {});
    const fn = (typeof exports !== 'undefined' && exports[name])
      || (typeof module !== 'undefined' && module.exports && module.exports[name])
      || (typeof window !== 'undefined' && window[name])
      || null;
    return fn && typeof fn === 'function' ? fn : null;
  };

  const hasCards = Array.isArray(snap.cards) && snap.cards.length > 0;

  // Tentatives « douces » si tes helpers existent déjà
  const renderTL  = (typeof renderTimeline  === 'function') ? renderTimeline  : null;
  const renderDC  = (typeof renderDayChips  === 'function') ? renderDayChips  : null;
  const renderDet = (typeof renderDetail    === 'function') ? renderDetail    : null;

  if (renderTL && renderDC && renderDet && host) {
    try { renderTL(host, snap); }  catch(e){ console.warn('[UI] renderTimeline err', e); }
    try { renderDC(host, snap); }  catch(e){ console.warn('[UI] renderDayChips err', e); }
    try { renderDet(host, snap); } catch(e){ console.warn('[UI] renderDetail err', e); }
    return;
  }

  // --- Fallback léger (au cas où l’UI n’expose pas encore les helpers)
  if (!host) return;
  host.innerHTML = '';
  const css = `
    .p-wrap{font:14px/1.45 system-ui,Segoe UI,Roboto,sans-serif;padding:12px}
    .p-h{margin:0 0 10px;font-weight:700}
    .p-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
    .p-card{border:1px solid #e5e7eb;border-radius:12px;padding:10px;background:#fff}
    .p-ttl{font-weight:600;margin:0 0 6px}
    .p-sub{opacity:.66;font-size:12px}
  `;
  if (!document.getElementById('p-proj-style')) {
    const style = document.createElement('style'); style.id='p-proj-style'; style.textContent = css; document.head.appendChild(style);
  }
  const wrap = document.createElement('div'); wrap.className = 'p-wrap';
  const h1   = document.createElement('div'); h1.className='p-h'; h1.textContent = 'Projector — Mini-cards';
  const grid = document.createElement('div'); grid.className='p-list';
  const daysOf = (c) => (c.updates||[]).reduce((m,u)=>{ const d=(u.date||'').slice(0,10); if(!d) return m; m[d]=(m[d]||0)+1; return m; },{});
  (snap.cards||[]).forEach(c=>{
    const card = document.createElement('div'); card.className='p-card';
    const ttl  = document.createElement('div'); ttl.className='p-ttl'; ttl.textContent = c.title || c.name || '[sans titre]';
    const sub  = document.createElement('div'); sub.className='p-sub';
    const dmap = daysOf(c);
    const days = Object.keys(dmap).sort().slice(-4).map(d=>`${d}: ${dmap[d]} upd`).join(' • ');
    sub.textContent = hasCards ? (days || 'aucune update') : 'aucune card';
    card.appendChild(ttl); card.appendChild(sub); grid.appendChild(card);
  });
  wrap.appendChild(h1); wrap.appendChild(grid); host.appendChild(wrap);
}

export default { mount };










































