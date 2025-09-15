// ui/tabs/charter.js — 2 colonnes stables + statut + champs multi-lignes
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
            <input type="checkbox" class="chk-sel" ${p?.state?.selected?'checked':''}/>
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
  <div class="charter cols">
    <!-- Colonne gauche -->
    <div class="col">
      <section class="block">
        <h3>Charter</h3>

        <div class="row">
          <label>Titre<br>
            <textarea id="charter-title" rows="2" style="resize:vertical">${ch.title||''}</textarea>
          </label>
        </div>

        <div class="row">
          <label>Contenu<br>
            <textarea id="charter-content" rows="8" style="resize:vertical">${ch.content||''}</textarea>
          </label>
        </div>

        <div class="row">
          <label>Tags (séparés par virgule)<br>
            <textarea id="charter-tags" rows="2" style="resize:vertical">${(ch.tags||[]).join(', ')}</textarea>
          </label>
        </div>

        <!-- barre de boutons locale (pas .row pour éviter l’étalement) -->
        <div class="btns" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">
          <button id="charter-gen" type="button">Analyser</button>
          <button id="charter-push" type="button">Envoyer les sélectionnés vers Cards</button>
        </div>

        <div id="charter-status" class="muted" style="margin-top:8px">—</div>
      </section>
    </div>

    <!-- Colonne droite -->
    <div class="col">
      <section class="block">
        <h3>Propositions IA</h3>
        <div id="charter-proposals-box">${renderProposals(ch)}</div>
      </section>
    </div>
  </div>`;
}

export function mountCharterTab(host = document.getElementById('tab-charter')) {
  if (!host) return;
  const ch = getCharter();
  host.innerHTML = html(ch);

  const getVals = (root)=>{
    const t = $('#charter-title', root)?.value?.trim() || '';
    const c = $('#charter-content', root)?.value || '';
    const tags = ($('#charter-tags', root)?.value || '').split(',').map(s=>s.trim()).filter(Boolean);
    return { title:t, content:c, tags };
  };

  // autosave
  let to;
  host.addEventListener('input', (ev)=>{
    if (!ev.target.closest('#charter-title,#charter-content,#charter-tags')) return;
    clearTimeout(to);
    to = setTimeout(()=>{ saveCharter(getVals(host)); }, 200);
  });

  // Analyse IA
  const btnGen = $('#charter-gen', host);
  const $status = $('#charter-status', host);
  btnGen.onclick = async ()=>{
    const vals = getVals(host);
    btnGen.disabled = true;
    $status.textContent = '⏳ Analyse en cours…';
    try{
      const r = await askAI({
        mode:'paria',
        subject:{kind:'charter'},
        payload:{ title:vals.title, content:vals.content, tags:vals.tags, components:['P','A','R','I'] },
        context:{ tab:'charter' }
      });
      console.log('[Charter][askAI]', r);

      if (r.status === 'ok' && r.results?.length){
        applyAIResults({kind:'charter'}, r.results, {mode:'replace'});
        $('#charter-proposals-box', host).innerHTML = renderProposals(getCharter());
        $status.textContent = `✅ ${r.results.length} proposition(s)`;
      } else if (r.status === 'empty') {
        $status.textContent = 'ℹ️ IA: aucune proposition.';
      } else if (r.status === 'needs_config') {
        $status.textContent = '⚠️ Proxy non configuré (Réglages).';
      } else {
        $status.textContent = `❌ IA: ${r.error||'erreur'}`;
      }
    } catch(e){
      console.error('[Charter][askAI] error', e);
      $status.textContent = `❌ IA: ${e?.message||e}`;
    } finally {
      btnGen.disabled = false;
    }
  };

  // Push sélectionnés -> Cards
  $('#charter-push', host).onclick = ()=>{
    pushSelectedCharterToCards();
    $('#charter-status', host).textContent = '➡️ Envoyé vers Cards.';
  };

  // Sélection + pictos
  host.addEventListener('change', (ev)=>{
    const chk = ev.target.closest('.chk-sel'); if (!chk) return;
    const id = ev.target.closest('[data-id]')?.dataset?.id; if (!id) return;
    setCharterAISelected(id, chk.checked);
  });
  host.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('[data-action]'); if (!btn) return;
    const id = btn.closest('[data-id]')?.dataset?.id; if (!id) return;
    if (btn.dataset.action==='prop-delete') removeCharterAI(id);
    if (btn.dataset.action==='prop-think')  toggleCharterAIStatus(id,'think');
    $('#charter-proposals-box', host).innerHTML = renderProposals(getCharter());
  });
}

export const mount = mountCharterTab;
export default { mount };
