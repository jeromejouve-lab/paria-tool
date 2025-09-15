// PARIA-V2-CLEAN v1.0.0 | ui/tabs/charter.js (injection)
import {
  getCharter, saveCharter,
  setCharterAISelected, toggleCharterAIStatus, removeCharterAI,
  pushSelectedCharterToCards
} from '../../domain/reducers.js';
import { askAI, applyAIResults } from '../../core/ai.js';

const $ = (s,r=document)=>r.querySelector(s);

function renderProposals(ch){
  const list = (ch.ai||[]).filter(p=>!p?.state?.deleted);
  if (!list.length) return `<div class="muted">— Aucune proposition.</div>`;
  return `
    <ul class="charter-proposals">
      ${list.map(p=>`
        <li class="proposal" data-id="${p.id}">
          <label class="sel">
            <input type="checkbox" class="chk-sel" ${p?.state?.selected?'checked':''} />
            <span>Sélectionner</span>
          </label>
          <div class="proposal-body">
            <h4 class="proposal-title">${p.title||''}</h4>
            <div class="proposal-content">${(p.content||'').replace(/\n/g,'<br>')}</div>
            ${p.tags?.length?`<div class="tags">${p.tags.map(t=>`<span class="tag">#${t}</span>`).join(' ')}</div>`:''}
          </div>
          <div class="actions">
            <button class="icon-think" title="À réfléchir" data-action="prop-think">${p?.state?.think?'🤔':'💡'}</button>
            <button class="icon-trash" title="Supprimer" data-action="prop-delete">🗑️</button>
          </div>
        </li>`).join('')}
    </ul>`;
}

function html(ch){
  return `
  <div class="charter">
    <section class="block">
      <div class="row">
        <label>Titre<br><input id="charter-title" type="text" value="${ch.title||''}"></label>
      </div>
      <div class="row">
        <label>Contenu<br><textarea id="charter-content" rows="6">${ch.content||''}</textarea></label>
      </div>
      <div class="row">
        <label>Tags (séparés par des virgules)<br><input id="charter-tags" type="text" value="${(ch.tags||[]).join(', ')}"></label>
      </div>
      <div class="row">
        <button id="charter-gen" type="button">Analyser</button>
        <button id="charter-push" type="button">Envoyer les sélectionnés vers Cards</button>
      </div>
    </section>
    <section class="block">
      <h3>Propositions</h3>
      <div id="charter-proposals-box">${renderProposals(ch)}</div>
    </section>
  </div>`;
}

export function mountCharterTab(host = document.getElementById('tab-charter')) {
  if (!host) return;
  const ch = getCharter();
  host.innerHTML = html(ch);

  // Bind inputs -> saveCharter (debounce simple)
  const getVals = (root)=>{
    const t = $('#charter-title', root)?.value?.trim() || '';
    const c = $('#charter-content', root)?.value || '';
    const tags = ($('#charter-tags', root)?.value || '').split(',').map(s=>s.trim()).filter(Boolean);
    return { title:t, content:c, tags };
  };
  let to;
  host.addEventListener('input', (ev)=>{
    if (!ev.target.closest('#charter-title,#charter-content,#charter-tags')) return;
    clearTimeout(to);
    to = setTimeout(()=>{ saveCharter(getVals(host)); }, 250);
  });

  // Analyser (IA via GAS)
  $('#charter-gen', host).onclick = async ()=>{
    const vals = getVals(host);
    const r = await askAI({
      mode:'paria',
      subject:{kind:'charter'},
      payload:{ title:vals.title, content:vals.content, tags:vals.tags, components:['P','A','R','I'] },
      context:{ tab:'charter' }
    });
    if (r.status!=='ok') return;
    applyAIResults({kind:'charter'}, r.results, {mode:'replace'});
    mountCharterTab(host); // re-render
  };

  // Push sélectionnés -> Cards
  $('#charter-push', host).onclick = ()=>{
    pushSelectedCharterToCards();
  };

  // Délégation : checkbox select + pictos
  host.addEventListener('change', (ev)=>{
    const chk = ev.target.closest('.chk-sel'); if (!chk) return;
    const id = ev.target.closest('[data-id]')?.dataset?.id; if (!id) return;
    setCharterAISelected(id, chk.checked);
  });
  host.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.closest('[data-id]')?.dataset?.id; if (!id) return;
    if (btn.dataset.action==='prop-delete') { removeCharterAI(id); }
    if (btn.dataset.action==='prop-think')  { toggleCharterAIStatus(id,'think'); }
    // rafraîchir uniquement la zone propositions
    $('#charter-proposals-box', host).innerHTML = renderProposals(getCharter());
  });
}

export const mount = mountCharterTab;
export default { mount };
