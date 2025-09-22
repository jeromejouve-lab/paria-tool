// ui/tabs/seances.js
import { listCards, appendCardUpdate, touchCard, duplicateCardForScenario } from '../../domain/reducers.js';

const $=(s,r=document)=>r.querySelector(s);

let currentId = null;

function ensureScenario(cardId){
  const b = listCards();
  const c = b.find(x=>String(x.id)===String(cardId));
  if (!c) return null;
  if (c.type==='scenario') return c.id;
  const nid = duplicateCardForScenario(c.id);
  return nid || c.id;
}

function renderMiniTl(host){
  // même que Projecteur 1.1 (sans delete)
  // … (reprends la version de 1.1 en adaptant l’handler de clic ci-dessous)
}

function renderDetail(host){
  const box = host.querySelector('#seance-detail');
  if (!currentId){ box.innerHTML = '<div class="muted">Aucune card</div>'; return; }
  box.innerHTML = `
    <section class="block">
      <h4>Ajouter</h4>
      <form data-form="add-comment" class="inline">
        <input name="text" type="text" placeholder="Commentaire…" required />
        <select name="author"><option>moi</option><option>client</option><option>gpt</option></select>
        <button>Commenter</button>
      </form>
      <form data-form="add-note" class="inline" style="margin-left:8px">
        <input name="text" type="text" placeholder="Note…" required />
        <button>Noter</button>
      </form>
    </section>
    <section class="block">
      <div class="muted">Filtrage identique Cards (à brancher si besoin)</div>
    </section>
  `;
}

export function mount(host=document.getElementById('tab-seances')){
  if (!host) return;
  host.innerHTML = `
    <div class="seances">
      <div id="seances-mini" class="cards-timeline"></div>
      <div id="seance-detail" style="padding:8px"></div>
    </div>`;
  renderMiniTl(host);
  renderDetail(host);

  host.addEventListener('click',(ev)=>{
    const m = ev.target.closest('[data-cid]');
    if (m){
      const id = String(m.dataset.cid);
      const sid = ensureScenario(id);
      currentId = sid;
      renderMiniTl(host);
      renderDetail(host);
      return;
    }
  });

  host.addEventListener('submit',(ev)=>{
    const f = ev.target.closest('form[data-form]');
    if (!f) return;
    ev.preventDefault();
    const fd = new FormData(f);
    const text = (fd.get('text')||'').toString();
    if (!text || !currentId) return;

    if (f.dataset.form==='add-comment'){
      appendCardUpdate(currentId, '1', { origin:'seance', type:'comment', md:text, meta:{ author: (fd.get('author')||'moi') } });
      touchCard(currentId);
    }
    if (f.dataset.form==='add-note'){
      appendCardUpdate(currentId, '1', { origin:'seance', type:'note', md:text });
      touchCard(currentId);
    }
    f.reset();
  });
}
