// PARIA-V2-CLEAN v1.0.0 | ui/tabs/projector.js (injection)
import {
  getSession, startSession, pauseSession, stopSession,
  addSessionComment, addSessionAnnotation, listCards
} from '../../domain/reducers.js';

const $=(s,r=document)=>r.querySelector(s);

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

  host.addEventListener('click', (ev)=>{
    const b = ev.target.closest('[data-action]');
    if (!b) return;
    const sel = $('#proj-card', host);
    const cid = sel?.value || '';
    if (b.dataset.action==='session-start') startSession(cid);
    if (b.dataset.action==='session-pause') pauseSession();
    if (b.dataset.action==='session-stop')  stopSession();
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
