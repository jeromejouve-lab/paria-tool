// PARIA-V2-CLEAN v1.0.0 | ui/tabs/projector.js (injection)
import {
  getSession, startSession, pauseSession, stopSession,
  addSessionComment, addSessionAnnotation, listCards
} from '../../domain/reducers.js';

import { loadSession, loadCardFromSnapshots } from '../../core/net.js';  // <-- polling Git
import { loadLatestSnapshot } from '../../core/net.js';
import { buildWorkId } from '../../core/settings.js';                     // <-- workId courant

const $=(s,r=document)=>r.querySelector(s);

// --- Projecteur: overlay d'état + polling Git ---
const POLL_MS = 2500;
let __projPoll = null;

function qparam(k){ try{ return new URLSearchParams(location.search).get(k); }catch{ return null; } }

function ensureOverlay(host){
  let ov = host.querySelector('#proj-overlay');
  if (!ov){
    ov = document.createElement('div');
    ov.id = 'proj-overlay';
    ov.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.5);z-index:10';
    ov.innerHTML = `<div style="background:#111;border:1px solid #333;padding:16px 20px;border-radius:12px;min-width:260px;text-align:center">
      <div id="proj-state" style="font-weight:600;margin-bottom:8px">—</div>
      <div id="proj-meta"  class="muted" style="font-size:12px">Session distante</div>
    </div>`;
    host.style.position = host.style.position || 'relative';
    host.appendChild(ov);
  }
  return ov;
}
function showOverlay(host, status){
  const ov = ensureOverlay(host);
  const st = ov.querySelector('#proj-state');
  st.textContent = (status==='paused'?'Séance en pause': status==='stopped'?'Séance stoppée': status==='ended'?'Séance terminée':'—');
  ov.style.display = (status && status!=='running') ? 'flex' : 'none';
}

async function renderFromSnapshot(host, session, blob){
  // overlay
  showOverlay(host, session?.status||'idle');

  // choisir la card à afficher
  const cid = session?.card_id || session?.selection?.primary_id;
  if (!cid) return;

  // local d'abord
  let localList = [];
  try { localList = listCards?.() || []; } catch {}
  let card = localList.find(c => String(c.id)===String(cid));

  // sinon depuis le backup (blob)
  if (!card) {
    const set = blob?.cards || blob?.items || [];
    card = (set||[]).find(c => String(c.id)===String(cid));
  }

  const box = host.querySelector('.projector .content');
  if (box){
    // à adapter si tu as un rendu markdown; ici simple fallback
    const html = (card?.content || '—').replace(/\n/g,'<br>');
    box.innerHTML = html;
  }
  renderMiniTimeline(host);
}

function startPolling(host){
  const wid = buildWorkId();
  const sid = qparam('session'); // ?mode=projecteur&session=...
  if (__projPoll) clearInterval(__projPoll);

  const tick = async ()=>{
    try{
      const blob = await loadLatestSnapshot({ workId: wid });
      if (!blob) return;
      const session = blob?.meta?.session;
      if (!session) { showOverlay(host, 'ended'); return; }
      if (sid && session.session_id && String(session.session_id)!==String(sid)) {
        // une autre session est active → overlay
        showOverlay(host, 'ended'); 
        return;
      }
      await renderFromSnapshot(host, session, blob);
    }catch{}
  };

  // premier rendu immédiat
  tick();
  __projPoll = setInterval(tick, POLL_MS);
}

function fmtTs(s){ return (s||'').replace(/^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}).*$/,'$1 $2'); }

function renderMiniTimeline(host){
  const wrap = host.querySelector('#proj-mini-tl'); if (!wrap) return;
  const sess = (typeof getSession==='function' ? getSession() : {}) || {};
  const cid  = String(sess.card_id||'');

  // même source/structure que cards (v2)
  let list = [];
  try { list = (listCards?.() || []); } catch {}
  const cards = list.filter(c => !(c.state?.deleted));

  const html = cards.map(c=>{
    const active = String(c.id)===cid;
    const title  = (c.title || `#${c.id}`).replace(/</g,'&lt;');
    const ts     = new Date(c.updated_ts || c.created_ts || Date.now()).toLocaleString();
    const think  = c.state?.think ? ' • 🤔' : '';
    const scen   = (c.type==='scenario') ? ' <span class="badge" title="Scénario" style="background:#444;padding:0 6px;border-radius:999px;margin-left:6px">🎬</span>' : '';
    return `<button class="card-mini ${active?'is-active':''}" data-cid="${c.id}" title="#${c.id} • ${title} • ${ts}">
      <span class="mini-id">#${c.id}${think}${scen}</span>
      <span class="mini-title">${title}</span>
      <span class="mini-ts">${ts}</span>
    </button>`;
  }).join('') || `<div class="muted">Aucune card</div>`;

  wrap.innerHTML = html;
}

function html(){
  const session = getSession();
  const cards = listCards();
  const opts = cards.map(c=>`<option value="${c.id}" ${c.id===session.card_id?'selected':''}>${c.title||c.id}</option>`).join('');
  const cur = cards.find(c=>c.id===session.card_id);
  return `
  <div class="projector">
    <section class="block">
      <div class="row">
        <label>Card active &nbsp;
          <select id="proj-card">${opts}</select>
        </label>
        <button data-action="session-start">Démarrer</button>
        <button data-action="session-pause">Pause</button>
        <button data-action="session-stop">Stop</button>
        <button data-action="session-copy">Copier le lien</button>
      </div>
      <div class="muted">État: ${session.status||'idle'}</div>
    </section>

    <section class="block">
      <h4>Contenu de la card</h4>
      <div class="content">${(cur?.content||'—').replace(/\n/g,'<br>')}</div>
    </section>

    <section class="block">
      <h4>Commenter / Annoter</h4>
      <form data-form="session-comment" class="inline">
        <input name="text" type="text" placeholder="Commentaire…" required />
        <select name="author">
          <option value="moi">moi</option><option value="gpt">gpt</option><option value="client">client</option>
        </select>
        <button type="submit">Commenter</button>
      </form>
      <form data-form="session-annot" class="inline">
        <input name="text" type="text" placeholder="Annotation…" required />
        <select name="author">
          <option value="moi">moi</option><option value="gpt">gpt</option><option value="client">client</option>
        </select>
        <button type="submit">Annoter</button>
      </form>
    </section>
  </div>`;
}

export function mountProjectorTab(host = document.getElementById('tab-projector')){
  if (!host) return;
  host.innerHTML = html();
  // Mini timeline (en-tête)
  host.querySelector('.projector')?.insertAdjacentHTML('afterbegin', '<div id="proj-mini-tl" class="cards-timeline"></div>');
  renderMiniTimeline(host);

  // Démarrage auto en mode viewer si ?session=... présent (remote)
  try { startPolling(host); } catch {}
  // Dès le 1er render, si une session locale existe avec statut != running, afficher l’overlay
  import('../../domain/reducers.js')
    .then(({ getSession }) => {
      const sess = (typeof getSession === 'function' ? getSession() : {}) || {};
      showOverlay(host, sess.status || 'idle');
    })
    .catch(() => {});

  host.addEventListener('click', async (ev)=>{
    const b = ev.target.closest('[data-action]');
    if (!b) return;
    const sel = $('#proj-card', host);
    const cid = sel?.value || '';
    const m = ev.target.closest('#proj-mini-tl [data-cid]');
    if (m){
      const id = m.dataset.cid;
      // on réutilise ta mécanique existante : startSession(...) positionne la card + persiste
      startSession(id);
      renderMiniTimeline(host);
      mountProjectorTab(host);
      return;
    }

    if (b.dataset.action==='session-start'){ startSession(cid); showOverlay(host,'running'); }
    if (b.dataset.action==='session-pause'){ pauseSession();   showOverlay(host,'paused');  }
    if (b.dataset.action==='session-stop') { stopSession();    showOverlay(host,'stopped'); }
    if (b.dataset.action==='session-copy'){
      try {
        let sess = (typeof getSession==='function' ? getSession() : {}) || {};
        const sel = $('#proj-card', host);
        const cid = sel?.value || '';
    
        // si pas démarré, on démarre sur la card sélectionnée
        if ((sess.status||'idle')==='idle' && cid) {
          await startSession(cid);
          // re-lire la session pour récupérer le vrai session_id
          sess = (typeof getSession==='function' ? getSession() : {}) || {};
        }
    
        const sid = sess.session_id || (crypto?.randomUUID?.() || ('s'+Date.now()));
        const u = new URL(location.href);
        u.searchParams.set('mode','projecteur');
        u.searchParams.set('session', sid);
        await navigator.clipboard.writeText(u.toString());
        alert('Lien copié.');
      } catch {}
      return;
    }

    mountProjectorTab(host);
  });

  host.addEventListener('change', (ev)=>{
    if (ev.target.id==='proj-card'){ startSession(ev.target.value||''); mountProjectorTab(host); }
  });

  host.addEventListener('submit', (ev)=>{
    const f=ev.target;
    if (!f.matches('[data-form="session-comment"],[data-form="session-annot"]')) return;
    ev.preventDefault();
    const fd=new FormData(f);
    const text=(fd.get('text')||'').toString().trim();
    const author=(fd.get('author')||'moi').toString();
    if (!text) return;
    if (f.dataset.form==='session-comment') addSessionComment({author,text});
    else addSessionAnnotation({author,text});
    f.reset(); mountProjectorTab(host);
  });
}

export const mount = mountProjectorTab;
export default { mount };








