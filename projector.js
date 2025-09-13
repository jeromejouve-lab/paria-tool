import { getSession, startSession, pauseSession, stopSession } from '../../domain/reducers.js';
import { listCards } from '../../domain/reducers.js';

function currentCard(){ const sess=getSession(); if(!sess.card_id)return null; const all=listCards('active',''); return all.find(c=>c.id===sess.card_id)||null; }
function updateSessUI(host){ const sess=getSession(); host.querySelector('#sessState').textContent=sess.state||'off'; const linkBtn=host.querySelector('#btnGuestLink');
  if(sess.state==='live'&&sess.guest_token){ linkBtn.disabled=false; linkBtn.style.background='#f59e0b'; }else{ linkBtn.disabled=true; linkBtn.style.background=''; }
  const c=currentCard(); const view=host.querySelector('#projectorView'); if(!c){view.innerHTML='<div class="muted">Aucune card active</div>'; return;} view.innerHTML=`<h3>${c.title}</h3><div>${(c.content||'').replace(/\n/g,'<br>')}</div>`; }

export function mountProjectorTab(host){
  host.innerHTML=`
    <h2>Projecteur / Séance</h2>
    <div class="btns">
      <button id="btnSessStart">Démarrer</button>
      <button id="btnSessPause" class="secondary">Pause</button>
      <button id="btnSessStop" class="secondary">Terminer</button>
      <span id="sessState" class="pill">off</span>
      <button id="btnGuestLink" class="secondary" title="copier le lien invité" disabled>Lien invité</button>
    </div>
    <article id="projectorView" style="margin-top:1rem;border:1px solid #2b2f36;border-radius:.6rem;padding:1rem"></article>
  `;
  host.querySelector('#btnSessStart').onclick=()=>{ const all=listCards('active',''); const first=all[0]; if(!first){alert('Ouvrir une card depuis Cards'); return;} startSession(first.id); updateSessUI(host); };
  host.querySelector('#btnSessPause').onclick=()=>{ pauseSession(); updateSessUI(host); };
  host.querySelector('#btnSessStop').onclick=()=>{ stopSession(); updateSessUI(host); };
  host.querySelector('#btnGuestLink').onclick=async ()=>{ const sess=getSession(); if(!sess.guest_token)return; const url=new URL(window.location.href); url.hash='#guest'; url.searchParams.set('guest','1'); url.searchParams.set('card',sess.card_id); url.searchParams.set('token',sess.guest_token); await navigator.clipboard.writeText(url.toString()); alert('Lien invité copié.'); };
  updateSessUI(host);
}
