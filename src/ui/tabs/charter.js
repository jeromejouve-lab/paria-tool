// ui/tabs/charter.js — 2 colonnes stables + statut + champs multi-lignes
import {
  getCharter, saveCharter,
  setCharterAISelected, toggleCharterAIStatus, removeCharterAI,
  pushSelectedCharterToCards
} from '../../domain/reducers.js';
import { askAI, applyAIResults } from '../../core/ai.js';

// [ADD] Lecture settings + persistance profil client
import { settingsLoad } from '../../core/settings.js';
import { readClientProfile, writeClientProfile } from '../../domain/reducers.js';

const $ = (s,r=document)=>r.querySelector(s);

// Normalise la réponse IA en { status, results[] } même si on reçoit juste du texte
function normalizeAIResponse(raw) {
  const d = raw?.data || raw || {};
  // 1) essaie les formats connus (OpenAI / proxy variés)
  const fromChoices = d?.choices?.[0]?.message?.content || d?.choices?.[0]?.text;
  const fromOutput  = d?.output_text || d?.result || d?.content || d?.text;
  const text = (fromChoices || fromOutput || '').trim();

  // 2) si le backend a déjà un tableau results[]
  if (Array.isArray(d.results)) {
    return { status: d.results.length ? 'ok' : 'empty', results: d.results };
  }

  // 3) si on a du texte simple, on fabrique une proposition unique
  if (text) {
    const id = `p-${Date.now()}`;
    const summary = text.length > 180 ? text.slice(0, 180) + '…' : text;
    return {
      status: 'ok',
      results: [{
        id,
        title: 'Proposition',
        summary,
        content: text,
        state: { selected: false }
      }]
    };
  }

  // 4) rien d’exploitable
  return { status: 'empty', results: [] };
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

// Construit une version texte lisible du contexte IA (Client + Service)
function buildPromptPreviewFromScreen(host){
  const s = settingsLoad() || {};
  const clientId  = (s.client  || '').trim();
  const serviceId = (s.service || '').trim();

  // Profil client (persisté)
  const client = (typeof readClientProfile === 'function')
    ? (readClientProfile(clientId) || {})
    : (()=>{ try{ return JSON.parse(localStorage.getItem(`paria.client.${clientId}.profile`)||'{}'); }catch{return {}} })();

  // Lecture "service charter" depuis l’écran, de façon tolérante
  const getVal = (id)=> (host.querySelector(id)?.value ?? '').trim();
  const coerceCSV = (s)=> s ? s.split(',').map(x=>x.trim()).filter(Boolean) : [];

  const service = {
    id: serviceId,
    title: getVal('#charter-title') || getVal('input[name="charter-title"]') || '',
    content: getVal('#charter-content') || getVal('textarea[name="charter-content"]') || '',
    tags: coerceCSV(getVal('#charter-tags') || getVal('input[name="charter-tags"]')),
    // champs optionnels si tu les as :
    purpose: getVal('#charter-purpose') || '',
    scope: getVal('#charter-scope') || '',
    kpis: coerceCSV(getVal('#charter-kpis') || ''),
    audience: getVal('#charter-audience') || '',
    processes: coerceCSV(getVal('#charter-processes') || ''),
    data_sources: coerceCSV(getVal('#charter-data-sources') || ''),
    constraints: coerceCSV(getVal('#charter-constraints') || '')
  };

  const clamp = (txt, n=1500)=> (txt && txt.length>n ? txt.slice(0,n)+' …' : txt||'');

  const lines = [
    `# CONTEXTE ENTREPRISE`,
    `Client: ${clientId || 'n/d'}`,
    `Secteur: ${client.industry || 'n/d'} | Effectif: ${client.headcount ?? 'n/d'}`,
    `Objectifs: ${(client.goals||[]).join('; ') || 'n/d'}`,
    `Enjeux: ${(client.challenges||[]).join('; ') || 'n/d'}`,
    `Contraintes: ${(client.constraints||[]).join('; ') || 'n/d'}`,
    `Ton: ${client.tone || 'clair, orienté business'}`,
    `Langues: ${(client.languages||[]).join(', ') || 'fr'}`,
    ``,
    `# CONTEXTE SERVICE`,
    `Service: ${serviceId || 'n/d'}`,
    `Titre: ${service.title || 'n/d'}`,
    `But: ${service.purpose || 'n/d'}`,
    `Périmètre: ${service.scope || 'n/d'}`,
    `KPIs: ${(service.kpis||[]).join(', ') || 'n/d'}`,
    `Audience: ${service.audience || 'n/d'}`,
    `Process: ${(service.processes||[]).join(', ') || 'n/d'}`,
    `Sources de données: ${(service.data_sources||[]).join(', ') || 'n/d'}`,
    `Contraintes: ${(service.constraints||[]).join(', ') || 'n/d'}`,
    `Tags: ${(service.tags||[]).join(', ') || '—'}`,
    ``,
    `# CHARTE (contenu)`,
    clamp(service.content),
    ``,
    `# CONSIGNES`,
    `- Réponds en français, style concis et chiffré quand c'est pertinent.`,
    `- Donne des alternatives et des next steps actionnables.`,
    ``,
    `# QUESTION / TÂCHE (à compléter)`,
    `<décris la demande ici>`
  ];
  return lines.join('\n');
}

// [ADD] Binder du profil client (lecture + autosave)
function bindClientProfile(host){
  const s = settingsLoad() || {};
  const client = (s.client || '').trim();
  if (!client) return;

  const p = (typeof readClientProfile === 'function') ? readClientProfile(client) : {};
  const set = (sel, v)=>{ const el = $(sel, host); if (el) el.value = (v ?? ''); };

  set('#client-name',        p.name || s.client || '');
  set('#client-headcount',   (p.headcount ?? '') );
  set('#client-desc',        p.description || '');
  set('#client-goals',       (p.goals||[]).join(', '));
  set('#client-challenges',  (p.challenges||[]).join(', '));
  set('#client-constraints', (p.constraints||[]).join(', '));
  set('#client-tone',        p.tone || '');
  set('#client-languages',   (p.languages||[]).join(', '));

  let to; // debounce
  host.addEventListener('input', (ev)=>{
    if (!ev.target.closest('#client-name,#client-headcount,#client-desc,#client-goals,#client-challenges,#client-constraints,#client-tone,#client-languages')) return;
    clearTimeout(to);
    to = setTimeout(()=>{
      const data = {
        name:        $('#client-name', host)?.value?.trim() || '',
        headcount:   parseInt($('#client-headcount', host)?.value || '0', 10) || 0,
        description: $('#client-desc', host)?.value || '',
        goals:       ($('#client-goals', host)?.value || '').split(',').map(s=>s.trim()).filter(Boolean),
        challenges:  ($('#client-challenges', host)?.value || '').split(',').map(s=>s.trim()).filter(Boolean),
        constraints: ($('#client-constraints', host)?.value || '').split(',').map(s=>s.trim()).filter(Boolean),
        tone:        $('#client-tone', host)?.value?.trim() || '',
        languages:   ($('#client-languages', host)?.value || '').split(',').map(s=>s.trim()).filter(Boolean)
      };
      if (typeof writeClientProfile === 'function') writeClientProfile(client, data);
      else localStorage.setItem(`paria.client.${client}.profile`, JSON.stringify(data));
    }, 250);
  });
}

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
            <h4 class="proposal-title">${esc(p.title||'')}</h4>
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
      <!-- Client (grille 2 colonnes) -->
      <section class="block client-grid">
        <h3>Client</h3>

        <!-- Colonne gauche -->
        <div class="grid-left">
          <label>Nom<br><input id="client-name" type="text"></label>
        </div>

        <!-- Colonne droite (champs courts empilés) -->
        <div class="grid-right">
          <label>Effectif<br><input id="client-headcount" type="number" min="0"></label>
          <label>Langues (csv)<br><input id="client-languages" type="text" placeholder="fr,en"></label>
          <label>Ton<br><input id="client-tone" type="text" placeholder="pragmatique, orienté ROI"></label>
        </div>

        <!-- Description = gauche (grand champ) -->
        <div class="grid-left">
          <label>Description<br>
            <textarea id="client-desc" rows="3" style="resize:vertical"></textarea>
          </label>
        </div>

        <!-- Pleine largeur : zones lourdes -->
        <div class="grid-full">
          <label>Objectifs (séparés par virgule)<br>
            <textarea id="client-goals" rows="2" style="resize:vertical"></textarea>
          </label>
        </div>

        <div class="grid-full">
          <label>Problèmes (séparés par virgule)<br>
            <textarea id="client-challenges" rows="2" style="resize:vertical"></textarea>
          </label>
        </div>

        <div class="grid-full">
          <label>Contraintes (séparées par virgule)<br>
            <textarea id="client-constraints" rows="2" style="resize:vertical"></textarea>
          </label>
        </div>
      </section>

      <section class="block">
        <h3>Charter</h3>

        <div class="grid-left">
          <label>Titre<br><input id="charter-title" type="text"></label>
        </div>
      
        <div class="grid-right">
          <label>Tags (séparés par virgule)<br>
            <input id="charter-tags" type="text" placeholder="activation, onboarding, RH">
          </label>
        </div>
      
        <div class="grid-full">
          <label>Contenu<br>
            <textarea id="charter-content" rows="8" style="resize:vertical"></textarea>
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
 
// Bouton "Aperçu du prompt" placé à côté de "Analyser" si présent
(() => {
  const actionsRow = host.querySelector('.actions, .row.actions, .charter-actions') || host; // cherche ta barre d'actions
  const btnPreview = document.createElement('button');
  btnPreview.id = 'btn-charter-preview';
  btnPreview.type = 'button';
  btnPreview.textContent = 'Aperçu du prompt';
  btnPreview.className = 'btn';
  actionsRow.appendChild(btnPreview);

  // Modal léger (HTML <dialog>)
  let dlg = host.querySelector('#charter-preview-modal');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'charter-preview-modal';
    dlg.style.width = 'min(900px, 90vw)';
    dlg.innerHTML = `
      <form method="dialog" style="margin:0;padding:0">
        <header style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0">
          <h3 style="margin:0;font-size:1.05rem">Aperçu du prompt</h3>
          <div>
            <button id="btn-copy-preview" type="button" class="btn">Copier</button>
            <button value="close" class="btn">Fermer</button>
          </div>
        </header>
        <pre id="charter-preview-pre" style="white-space:pre-wrap;background:#0f0f13;border:1px solid #2a2a31;border-radius:8px;padding:12px;max-height:60vh;overflow:auto;margin:0"></pre>
      </form>
    `;
    host.appendChild(dlg);
  }

  const pre = dlg.querySelector('#charter-preview-pre');
  const btnCopy = dlg.querySelector('#btn-copy-preview');

  btnPreview.onclick = () => {
    try{
      pre.textContent = buildPromptPreviewFromScreen(host);
      dlg.showModal();
    }catch(e){
      console.error('[Charter][Preview] error', e);
      pre.textContent = 'Erreur lors de la génération du prompt (voir console).';
      dlg.showModal();
    }
  };

  btnCopy.onclick = async () => {
    try{
      await navigator.clipboard.writeText(pre.textContent || '');
      const t=btnCopy.textContent; btnCopy.textContent='Copié ✓'; setTimeout(()=>btnCopy.textContent=t, 1000);
    }catch(e){
      console.warn('Clipboard error', e);
    }
  };
})();

  bindClientProfile(host); // remplissage + autosave du Profil Client

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
    
      // r peut déjà être normalisé par core/ai.js ; sinon on le normalise ici
      const norm = (r && typeof r.status === 'string' && Array.isArray(r.results))
        ? r
        : normalizeAIResponse(r);
      console.log('[Charter][norm]', norm);
      
      if (norm.status === 'ok' && norm.results?.length){
        applyAIResults({kind:'charter'}, norm.results, {mode:'replace'});
        $('#charter-proposals-box', host).innerHTML = renderProposals(getCharter());
        $status.textContent = `✅ ${norm.results.length} proposition(s)`;
      } else if (norm.status === 'empty') {
        $status.textContent = 'ℹ️ IA: aucune proposition.';
      } else if (norm.status === 'needs_config') {
        $status.textContent = '⚠️ Proxy non configuré (Réglages).';
      } else {
        $status.textContent = `❌ IA: ${norm.error||'erreur'}`;
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






