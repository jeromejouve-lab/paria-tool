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
  ('input', (ev)=>{
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

function fillCharter(root, vals){
  if (!vals) return;
  const $t = root.querySelector('#charter-title');
  const $c = root.querySelector('#charter-content');
  const $g = root.querySelector('#charter-tags');
  if ($t) $t.value = vals.title || '';
  if ($c) $c.value = vals.content || '';
  if ($g) $g.value = (vals.tags||[]).join(', ');
}

export function mountCharterTab(host = document.getElementById('tab-charter')) {
  if (!host) return;
  const ch = getCharter();
  host.innerHTML = html(ch);

  // restore last saved values
  const _saved = loadCharter();
  if (_saved) fillCharter(host, _saved);
  // init history datalist pour le contenu
  attachContentHistoryDatalist(host);
  
  // --- Menu flottant Historique (textarea "Contenu") ---
  (function setupContentHistoryMenu(){
    const ta = host.querySelector('#charter-content');
    if (!ta) return;

    let menu = host.querySelector('#content-history-menu');
    if (!menu){
      menu = document.createElement('div');
      menu.id = 'content-history-menu';
      menu.style.position = 'absolute';
      menu.style.zIndex = '9999';
      menu.style.display = 'none';
      menu.style.maxHeight = '220px';
      menu.style.overflow = 'auto';
      menu.style.border = '1px solid #ccc';
      menu.style.background = '#fff';
      menu.style.padding = '6px';
      menu.style.boxShadow = '0 2px 10px rgba(0,0,0,.15)';
      host.appendChild(menu);
    }

    function histKey(){
      try{
        const s = (window.paria && window.paria.settings) ? window.paria.settings : (JSON.parse(localStorage.getItem('paria.settings')||'{}'));
        const w = (window.paria && window.paria.work) ? window.paria.work : {};
        const workId = (w && w.current && w.current.workId) || [s?.client,s?.service,s?.date].filter(Boolean).join('|') || 'default';
        return `charter.history.${workId}`;
      }catch{ return 'charter.history.default'; }
    }
    
    function loadHist(){
      try{
        const raw = JSON.parse(localStorage.getItem(histKey())||'[]');
        // Ne garder que les entrées “utiles”
        return raw.filter(x=>{
          if (!x) return false;
          const hasTitle = !!(x.title && String(x.title).trim());
          const hasContent = !!(x.content && String(x.content).trim());
          const hasTags = Array.isArray(x.tags) ? x.tags.filter(Boolean).length>0 : false;
          return hasTitle || hasContent || hasTags;
        });
      }catch{ return []; }
    }
    
    function showMenu(){
      const list = loadHist();
      if (!list.length) return hideMenu();
      menu.innerHTML = list.map((h,i)=>`
        <div class="hist-item" data-i="${i}" style="padding:6px 8px; cursor:pointer; border-bottom:1px dashed #eee">
          <div style="font-weight:600">${(h.title||'Sans titre').replace(/</g,'&lt;')}</div>
          <div style="font-size:12px;opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${(h.content||'').replace(/</g,'&lt;')}</div>
          ${Array.isArray(h.tags)&&h.tags.length?`<div style="font-size:11px;opacity:.6">${h.tags.map(t=>`#${t}`).join(' ')}</div>`:''}
        </div>`).join('');
      const r = ta.getBoundingClientRect();
      const hr = host.getBoundingClientRect();
      menu.style.left = (r.left - hr.left) + 'px';
      menu.style.top  = (r.bottom - hr.top + 4) + 'px';
      menu.style.width = r.width + 'px';
      menu.style.display = 'block';
    }
    function hideMenu(){ menu.style.display = 'none'; }

    ta.addEventListener('focus', showMenu);
    ta.addEventListener('click', showMenu);
    host.addEventListener('click', (ev)=>{
      const it = ev.target.closest('.hist-item');
      if (it){
        const list = loadHist();
        const h = list[parseInt(it.dataset.i,10)];
        if (h){
          const t = host.querySelector('#charter-title');
          const c = host.querySelector('#charter-content');
          const g = host.querySelector('#charter-tags');
          if (t) t.value = h.title||'';
          if (c) c.value = h.content||'';
          if (g) g.value = Array.isArray(h.tags)? h.tags.join(', ') : (h.tags||'');
          // déclenche autosave
          c.dispatchEvent(new Event('input',{bubbles:true}));
        }
        hideMenu();
      } else if (!ev.target.closest('#content-history-menu') && ev.target!==ta) {
        hideMenu();
      }
    });
  })();


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
  const pv = document.querySelector('#charter-prompt-preview') || document.querySelector('.charter-prompt-preview');
  if (pv) pv.style.display = 'none';

  btnPreview.onclick = () => {
    try{
      let txt = '';
      try { txt = buildPromptPreviewFromScreen(host) || ''; } catch {}
      if (!txt.trim()) {
        // fallback sûr si la lecture “profil+écran” échoue
        const v = getVals(host);
        txt = buildCharterPrompt(v);
      }
      pre.textContent = txt;
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

  function buildCharterPrompt(vals){
    const parts = [];
    if (vals?.title)   parts.push(`Titre: ${vals.title}`);
    if (vals?.tags?.length) parts.push(`Tags: ${vals.tags.join(', ')}`);
    if (vals?.content) parts.push(`Contenu:\n${vals.content}`);
    return [
      "Analyse PARIA d'un charter.",
      ...parts,
      "Renvoie 4 propositions structurées (title, content, tags[])."
    ].join("\n");
  }

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
    to = setTimeout(()=>{
      const v = getVals(host);
      // ❶ Sauvegarde “courante”
      try { 
        if (typeof saveCharter === 'function') saveCharter(v);
        else localStorage.setItem('paria.charter', JSON.stringify(v));
      } catch{}
      // ❷ Historique (par WorkID)
      if (typeof saveCharterHistory === 'function') saveCharterHistory(v);
      // ❸ Rafraîchir la datalist (version *History*)
      if (typeof attachContentHistoryDatalist === 'function') attachContentHistoryDatalist(host);
    }, 200);
  });

  // === Charter persistence & history ===
  function fillCharter(host, vals){
    if (!vals) return;
    const t = host.querySelector('#charter-title');
    const c = host.querySelector('#charter-content');
    const g = host.querySelector('#charter-tags');
    if (t) t.value = vals.title || '';
    if (c) c.value = vals.content || '';
    if (g) g.value = Array.isArray(vals.tags) ? vals.tags.join(', ') : (vals.tags||'');
  }
  function saveCharter(vals){
    try{ localStorage.setItem('paria.charter', JSON.stringify(vals)); }catch{}
  }
  function loadCharter(){
    try{ return JSON.parse(localStorage.getItem('paria.charter')||'null'); }catch{ return null; }
  }
  // history par workId (pour datalist de contenu)
  function charterHistKey(){
    try { return histKey(); } catch { return 'charter.history.default'; }
  }

  function attachContentHistoryDatalist(host){
    // 1) on lit l’historique via la bonne clé
    let list = [];
    try { list = JSON.parse(localStorage.getItem(histKey())||'[]'); } catch {}
  
    // 2) TITRE — datalist
    const dlTitle = host.querySelector('#dl-charter-title') || (()=>{
      const dl = document.createElement('datalist');
      dl.id = 'dl-charter-title';
      host.appendChild(dl);
      return dl;
    })();
    const titles = [...new Set(list.map(x=>x?.title||'').filter(Boolean))].slice(0,30);
    dlTitle.innerHTML = titles.map(t=>`<option value="${t.replace(/"/g,'&quot;')}"></option>`).join('');
    const inpTitle = host.querySelector('#charter-title');
    if (inpTitle && !inpTitle.getAttribute('list')) inpTitle.setAttribute('list','dl-charter-title');
  
    // 3) TAGS — datalist (à partir des tags historisés)
    const dlTags = host.querySelector('#dl-charter-tags') || (()=>{
      const dl = document.createElement('datalist');
      dl.id = 'dl-charter-tags';
      host.appendChild(dl);
      return dl;
    })();
    const tags = [...new Set(list.flatMap(x=>Array.isArray(x?.tags)?x.tags:[]).filter(Boolean))].slice(0,50);
    dlTags.innerHTML = tags.map(t=>`<option value="${t.replace(/"/g,'&quot;')}"></option>`).join('');
    const inpTags = host.querySelector('#charter-tags');
    if (inpTags && !inpTags.getAttribute('list')) inpTags.setAttribute('list','dl-charter-tags');
  
    // 4) CONTENU — pas de datalist sur <textarea> (non supporté) → menu flottant seulement
    //    on ne touche pas ici, c’est géré par setupContentHistoryMenu()
  }

  // --- history (dernieres saisies) --- //
  function histKey(){
    const s = (window.paria && window.paria.settings) ? window.paria.settings : (JSON.parse(localStorage.getItem('paria.settings')||'{}'));
    const w = (window.paria && window.paria.work) ? window.paria.work : {};
    const workId = (w && w.current && w.current.workId) || [s?.client,s?.service,s?.date].filter(Boolean).join('|') || 'default';
    return `charter.history.${workId}`;
  }
    
  function saveCharterHistory(entry){
    try{
      const k = histKey();
      let arr = JSON.parse(localStorage.getItem(k)||'[]');
      const norm = (x)=>({
        title: (x?.title||'').trim(),
        content: (x?.content||'').trim(),
        tags: Array.isArray(x?.tags) ? x.tags.filter(Boolean) : String(x?.tags||'').split(',').map(s=>s.trim()).filter(Boolean),
        ts: Date.now()
      });
      const rec = norm(entry);
      const sig = (e)=> (e.title||'')+'|'+(e.content||'').slice(0,120)+'|'+(e.tags||[]).join(',');
      arr = [rec, ...arr].filter(Boolean);
      const seen = new Set();
      arr = arr.filter(e=>{ const s=sig(e); if(seen.has(s)) return false; seen.add(s); return true; }).slice(0,20);
      localStorage.setItem(k, JSON.stringify(arr));
    }catch{}
  }

  function getCharterHistory(){
    try{ return JSON.parse(localStorage.getItem(histKey())||'[]'); }catch{ return []; }
  }
    
  function attachContentDatalist(host){
    const ta = host.querySelector('#charter-content');
    if (!ta) return;
    let dl = document.getElementById('charter-content-history');
    if (!dl){
      dl = document.createElement('datalist');
      dl.id = 'charter-content-history';
      document.body.appendChild(dl);
    }
    ta.setAttribute('list','charter-content-history');
    const hist = getCharterHistory();
    dl.innerHTML = hist.map(h => `<option value="${(h.content||'').replace(/"/g,'&quot;').slice(0,120)}"></option>`).join('');
  }

  // Analyse IA
  const btnGen = $('#charter-gen', host);
  const $status = $('#charter-status', host); 

  btnGen.onclick = async ()=>{
    const vals = getVals(host);
    const ts = new Date();
    saveCharterHistory(vals);
    saveCharter(vals);
    attachContentHistoryDatalist(host);

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
      const ts = new Date(); // timestamp pour le statut
    
      // r peut déjà être normalisé par core/ai.js ; sinon on le normalise ici
      const norm = (r && typeof r.status === 'string' && Array.isArray(r.results))
        ? r
        : normalizeAIResponse(r);
      console.log('[Charter][norm]', norm);
      
      if (norm.status === 'ok' && norm.results?.length){
        applyAIResults({kind:'charter'}, norm.results, {mode:'append'});
        $('#charter-proposals-box', host).innerHTML = renderProposals(getCharter());
        $status.textContent = `✅ ${r.results.length} proposition(s) · ${ts.toLocaleTimeString()}`;
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
  attachContentHistoryDatalist(host);
}

export const mount = mountCharterTab;
export default { mount };














