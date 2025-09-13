// src/ui/tabs/projector.js
import { getSession, startSession, pauseSession, stopSession } from '../../domain/reducers.js';
import { listCards } from '../../domain/reducers.js';

const $ = s=>document.querySelector(s);

function currentCard(){
  const sess = getSession();
  if (!sess.card_id) return null;
  const all = listCards('active','');
  return all.find(c=>c.id===sess.card_id)||null;
}

function updateSessUI(){
  const sess = getSession();
  const pill = $('#sessState');
  pill.textContent = sess.state || 'off';
  const linkBtn = $('#btnGuestLink');
  if (sess.state==='live' && sess.guest_token){
    linkBtn.disabled = false;
    linkBtn.style.background = '#f59e0b'; // orange
  }else{
    linkBtn.disabled = true;
    linkBtn.style.background = '';
  }
  // render projector view
  const c = currentCard();
  const host = $('#projectorView');
  if (!c){ host.innerHTML = `<div class="muted">Aucune card active</div>`; return; }
  host.innerHTML = `<h3>${c.title}</h3><div>${(c.content||'').replace(/\n/g,'<br>')}</div>`;
}

export function mountProjectorTab(){
  $('#btnSessStart').onclick = ()=>{
    const first = currentCard() || listCards('active','')[0];
    if (!first){ alert('Ouvrir une card depuis l’onglet Cards (Ouvrir Projecteur)'); return; }
    startSession(first.id);
    updateSessUI();
  };
  $('#btnSessPause').onclick = ()=>{ pauseSession(); updateSessUI(); };
  $('#btnSessStop').onclick = ()=>{ stopSession(); updateSessUI(); };
  $('#btnGuestLink').onclick = async ()=>{
    const sess = getSession();
    if (!sess.guest_token){ return; }
    const url = new URL(window.location.href);
    url.hash = '#guest';
    url.searchParams.set('guest','1');
    url.searchParams.set('card', sess.card_id);
    url.searchParams.set('token', sess.guest_token);
    await navigator.clipboard.writeText(url.toString());
    alert('Lien invité copié.');
  };

  updateSessUI();
}
