// ui/tabs/charter.js — 2 colonnes stables + statut + champs multi-lignes
import {
  getCharter, saveCharter, 
  setCharterAISelected, toggleCharterAIStatus, removeCharterAI,
  pushSelectedCharterToCards, readClientProfile, writeClientProfile
} from '../../domain/reducers.js';
import { askAI, applyAIResults } from '../../core/ai.js';

// [ADD] Lecture settings + persistance profil client
import { settingsLoad, buildWorkId } from '../../core/settings.js';

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
  host.addEventListener('input', (ev) => {
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
            <h4 class="proposal-title" style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
              <span>${esc(p.title||'')}</span>
              <span style="display:flex;gap:8px;align-items:center">
                ${p.ts?`<span class="prop-ts" style="font-size:11px;opacity:.65">${new Date(p.ts).toLocaleString()}</span>`:''}
                <button class="btn btn-xs" data-action="prop-preview" data-prop-id="${p.id}">Aperçu du prompt</button>
              </span>
            </h4>
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

  ['#charter-title','#charter-content','#charter-tags'].forEach(sel=>{
    const el = host.querySelector(sel);
    if (!el) return;
    el.addEventListener('input', ()=> window.__tabDirtyCharter = true, {passive:true});
    el.addEventListener('change',()=> window.__tabDirtyCharter = true, {passive:true});
  });

  // restore last saved values
  const _saved = loadCharter();
  if (_saved) fillCharter(host, _saved);

  // MIGRATION: garantir id/ts/prompt sur les propositions déjà stockées
  try{
    const ch0 = (typeof getCharter==='function') ? getCharter() : {};
    if (Array.isArray(ch0.ai) && ch0.ai.length){
      let changed=false;
      const lp = ch0.last_prompt || '';
      ch0.ai.forEach((p,i)=>{
        if (!p.id){ p.id = String(Date.now())+'-'+i; changed=true; }
        if (!p.ts){ p.ts = Date.now(); changed=true; }
        if (!p.prompt && lp){ p.prompt = lp; changed=true; }
      });
      if (changed && typeof saveCharter==='function') saveCharter({ ai: ch0.ai });
    }
  }catch(e){ console.warn('[Charter][MIGRATE ai]', e); }

  // init history datalist pour le contenu
  attachContentHistoryDatalist(host);

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

  function loadCharter(){
    try{
      if (typeof getCharter === 'function') return getCharter();
      return JSON.parse(localStorage.getItem('paria.charter')||'null');
    }catch{
      return null;
    }
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

  function histKey(){
    try{
      const s = (window.paria && window.paria.settings)
        ? window.paria.settings
        : JSON.parse(localStorage.getItem('paria.settings')||'{}');
      const w = (window.paria && window.paria.work && window.paria.work.current && window.paria.work.current.workId)
        || [s?.client, s?.service, s?.date].filter(Boolean).join('|')
        || 'default';
      return `charter.history.${w}`;
    }catch{
      return 'charter.history.default';
    }
  }
      
  function saveCharterHistory(entry){
    try{
      const k = histKey();
      const norm = {
        title: String(entry?.title||'').trim(),
        content: String(entry?.content||''),
        tags: Array.isArray(entry?.tags)
          ? entry.tags.filter(Boolean)
          : String(entry?.tags||'').split(',').map(s=>s.trim()).filter(Boolean),
        ts: Date.now(),
      };
      let arr = JSON.parse(localStorage.getItem(k)||'[]')||[];
      const sig = (x)=>`${x.title}|${x.content.slice(0,120)}|${(x.tags||[]).join(',')}`;
      const seen = new Set();
      arr = [norm, ...arr].filter(x=>{
        if (!x) return false;
        const keep = (x.title || x.content || (Array.isArray(x.tags)&&x.tags.length));
        if (!keep) return false;
        const s = sig(x);
        if (seen.has(s)) return false;
        seen.add(s);
        return true;
      }).slice(0,30);
      localStorage.setItem(k, JSON.stringify(arr));
    }catch{}
  }
    
  // --- Menu d'historique pour <textarea id="charter-content"> ---
  (function ensureContentMenu(){
    const hostEl = host;
    const ta = hostEl.querySelector('#charter-content');
    if (!ta) return;
  
    let menu = hostEl.querySelector('#dl-like-content');
    if (!menu){
      menu = document.createElement('div');
      menu.id = 'dl-like-content';
      menu.style.cssText = 'position:absolute;display:none;z-index:9999;max-height:240px;overflow:auto;border:1px solid var(--border,#2a2a2a);background:var(--bg,#111);box-shadow:0 2px 10px rgba(0,0,0,.25)';
      hostEl.appendChild(menu);
    }
  
    function loadHist(){
      try{
        const arr = JSON.parse(localStorage.getItem(histKey())||'[]')||[];
        return arr.filter(x=>x && (x.title || x.content || (Array.isArray(x.tags)&&x.tags.length)));
      }catch{ return []; }
    }
    function hide(){ menu.style.display='none'; menu.innerHTML=''; }
    
    function show(){
      const list = loadHist();
      if (!list.length) return hide();
      
      // (re)construction du menu
      menu.innerHTML = list.map((h,i)=>{
        const dt   = h.ts ? new Date(h.ts).toLocaleString() : '';
        const title= (h.title||'Sans titre').replace(/</g,'&lt;');
        const prev = (h.content||'').replace(/</g,'&lt;');
        const tagz = Array.isArray(h.tags)&&h.tags.length ? h.tags.map(t=>`#${t}`).join(' ') : '';
        return `
        <div class="opt" data-i="${i}" style="padding:8px 10px;cursor:pointer;border-bottom:1px dashed #2a2a2a">
          <div style="display:flex;justify-content:space-between;gap:8px">
            <div style="font-weight:600">${title}</div>
            ${dt?`<div style="font-size:11px;opacity:.7">${dt}</div>`:''}
          </div>
          ${prev?`<div style="font-size:12px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${prev}</div>`:''}
          ${tagz?`<div style="font-size:11px;opacity:.7">${tagz}</div>`:''}
        </div>`;
      }).join('');

      // ... (construction menu.innerHTML inchangée)
    
      const r = ta.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
    
      menu.style.position = 'fixed';
      menu.style.left = r.left + 'px';
      menu.style.width = r.width + 'px';
      menu.style.overflowY = 'auto';
    
      // place dispo sous le textarea
      const spaceBelow = vh - r.bottom - 12;
      const spaceAbove = r.top - 12;
    
      // hauteur max 300px mais clampée à l’espace dispo
      let maxH = Math.min(300, spaceBelow);
      let top  = r.bottom + 6;
    
      // si pas assez de place dessous, on ouvre vers le haut
      if (maxH < 140 && spaceAbove > spaceBelow){
        maxH = Math.min(300, spaceAbove);
        top  = r.top - maxH - 6;
      }
    
      // éviter que ça sorte encore du viewport
      if (top < 6) top = 6;
      if (top + maxH > vh - 6) maxH = Math.max(120, vh - top - 6);
    
      menu.style.maxHeight = maxH + 'px';
      menu.style.top = top + 'px';
      menu.style.display = 'block';
    }

  
    ta.addEventListener('focus', show);
    ta.addEventListener('click', show);
    hostEl.addEventListener('click', (ev)=>{
      const opt = ev.target.closest('.opt');
      if (opt){
        const list = loadHist();
        const h = list[parseInt(opt.dataset.i,10)];
        if (h){
          const _t = hostEl.querySelector('#charter-title');
          if (_t) _t.value = h.title || '';
          const _c = hostEl.querySelector('#charter-content');
          if (_c) _c.value = h.content || '';
          const _g = hostEl.querySelector('#charter-tags');
          if (_g) _g.value = Array.isArray(h.tags) ? h.tags.join(', ') : (h.tags || '');
          if (_c) _c.dispatchEvent(new Event('input', {bubbles:true}));
        }
        hide();
      }else if (!ev.target.closest('#dl-like-content') && ev.target!==ta){
        hide();
      }
    });
  })();
  
  // Analyse IA
  const btnGen = $('#charter-gen', host);
  const $status = $('#charter-status', host); 

  btnGen.onclick = async ()=>{
    const vals = getVals(host);
    const ts = new Date();
    saveCharterHistory(vals);
    saveCharter(vals);
    // Persister le prompt réellement utilisé pour l’IA
    let lastPrompt = '';
    try{
      lastPrompt = (typeof buildPromptPreviewFromScreen==='function')
        ? (buildPromptPreviewFromScreen(host) || '')
        : '';
      if (lastPrompt && lastPrompt.trim()){
        saveCharter({ last_prompt: lastPrompt, last_prompt_ts: Date.now() });
      }
    }catch{}

    attachContentHistoryDatalist(host);

    btnGen.disabled = true;
    $status.textContent = '⏳ Analyse en cours…';
    try{
      const charter = getCharter();                 // {title, content, tags, ...}
      const s = settingsLoad() || {};
      const profile = (typeof readClientProfile==='function') ? (readClientProfile(s.client||'') || {}) : {};
      const task = {
        mode: 'paria',
        subject: { kind: 'charter' },
        context: { profile, charter, tab: 'charter' },
        payload: {} // (rien d’autre côté charter)
      };
      
      const res = await askAI({
        work_id: (typeof buildWorkId === 'function'
          ? buildWorkId()
          : [s.client, s.service, (s.date || new Date().toISOString().slice(0,10))].filter(Boolean).join('|')),
        task
      });
      console.log('[Charter][askAI]', res);
      const ts = new Date(); // timestamp pour le statut
    
      // r peut déjà être normalisé par core/ai.js ; sinon on le normalise ici
      const norm = (res && typeof res.status === 'string' && Array.isArray(res.results))
        ? res
        : (typeof normalizeAIResponse==='function' ? normalizeAIResponse(res) : {status:'error',results:[],error:'bad ai resp'});
      console.log('[Charter][norm]', norm);
      
      if (norm.status === 'ok' && norm.results?.length){
       
        // 1) prompt réellement utilisé
        const promptUsed = buildCharterPrompt(vals);

        // 2) estampiller chaque proposition
        const stamped = (norm.results||[]).map((p, idx)=>({
          ...p,
          id: p.id ?? String(Date.now())+'-'+idx,
          prompt: promptUsed,
          ts: Date.now()
        }));

        // 3) appliquer + rendre
        // prompt réellement utilisé
        const _vals = (typeof getVals==='function') ? getVals(host) : {
          title:  host.querySelector('#charter-title')?.value||'',
          content:host.querySelector('#charter-content')?.value||'',
          tags:   (host.querySelector('#charter-tags')?.value||'').split(',').map(s=>s.trim()).filter(Boolean)
        };
        const _promptUsed = buildCharterPrompt(_vals);
        
        // estampiller puis injecter
        const _src = Array.isArray(norm?.results) ? norm.results : [];
        const _stamped = _src.map((p,i)=>({
          ...p,
          id: p.id ?? (Date.now()+'-'+i),
          ts: Date.now(),
          prompt: p.prompt || _promptUsed
        }));
        
        // 👇 forcer la persistance + re-render
        saveCharter({ ai: (getCharter().ai || []).concat(_stamped), last_prompt: lastPrompt });
        const box = document.querySelector('#charter-proposals-box');
        if (box) box.innerHTML = renderProposals(getCharter());


        $('#charter-proposals-box', host).innerHTML = renderProposals(getCharter());
        $('#charter-proposals-box', host).querySelectorAll('.actions [data-action="prop-preview"]').forEach(el=>el.remove());
        $status.textContent = `✅ ${stamped.length} proposition(s) · ${ts.toLocaleTimeString()}`;

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
    const ch = (typeof getCharter==='function') ? getCharter() : {};
    const sel = (ch.ai||[]).filter(p => p?.state?.selected && !p?.state?.deleted);
    const $status = $('#charter-status', host);
    if (!sel.length){
      if ($status) $status.textContent = '— aucune proposition sélectionnée';
      return;
    }
    const created = (typeof pushSelectedCharterToCards==='function') ? pushSelectedCharterToCards() : 0;
    if ($status) $status.textContent = `✅ ${created} envoyée(s) vers Cards`;
  };

  // Sélection + pictos
  host.addEventListener('change', (ev)=>{
    const chk = ev.target.closest('.chk-sel'); if (!chk) return;
    const id = ev.target.closest('[data-id]')?.dataset?.id; if (!id) return;
    setCharterAISelected(id, chk.checked);
  });
  // --- Prompt Overlay (singleton) ---
  const PromptOverlay = (() => {
    const LSKEY = 'paria.promptOverlay.v1';
    const clamp = (v,min,max)=>Math.max(min, Math.min(max, v));
    const load = ()=>{ try{return JSON.parse(localStorage.getItem(LSKEY)||'{}');}catch{ return {}; } };
    const save = (st)=>{ try{ localStorage.setItem(LSKEY, JSON.stringify(st)); }catch{} };
  
    function ensure(){
      // reset si structure incomplète
      let root = document.getElementById('prompt-overlay');
      if (root && !root.querySelector('#prompt-overlay-panel')) { try{ root.remove(); }catch{} root=null; }
  
      if (!root){
        root = document.createElement('div');
        root.id = 'prompt-overlay';
        Object.assign(root.style, {position:'fixed', inset:'0', zIndex:'999999', background:'rgba(0,0,0,.6)', display:'none'});
  
        const panel = document.createElement('div');
        panel.id = 'prompt-overlay-panel';
        Object.assign(panel.style, {
          position:'fixed', left:'50%', top:'50%', transform:'translate(-50%,-50%)',
          width:'min(960px,92vw)', height:'min(80vh,calc(100vh - 40px))',
          background:'#1a1a1a', color:'#eaeaea', border:'1px solid #333',
          boxShadow:'0 10px 40px rgba(0,0,0,.5)', display:'flex', flexDirection:'column', userSelect:'none'
        });
  
        const head = document.createElement('div');
        head.id = 'prompt-overlay-head';
        Object.assign(head.style, {display:'flex',justifyContent:'space-between',alignItems:'center',gap:'8px',padding:'10px 12px',borderBottom:'1px solid #2a2a2a',cursor:'move',flex:'0 0 auto'});
        const h3 = Object.assign(document.createElement('h3'), {textContent:'Aperçu du prompt'}); h3.style.margin='0';
        const btn = Object.assign(document.createElement('button'), {textContent:'Fermer'}); btn.style.cssText='padding:6px 10px'; btn.onclick = ()=> hide();
        head.append(h3, btn);
  
        const pre = document.createElement('pre');
        pre.id = 'prompt-overlay-pre';
        Object.assign(pre.style, {whiteSpace:'pre-wrap',margin:'0',padding:'12px',overflow:'auto',flex:'1 1 auto',font:'13px/1.45 ui-monospace,Menlo,Consolas,monospace',background:'transparent',color:'#eaeaea'});
  
        const grip = document.createElement('div');
        grip.id = 'prompt-overlay-resize';
        Object.assign(grip.style, {position:'absolute',right:'0',bottom:'0',width:'18px',height:'18px',cursor:'nwse-resize',background:'linear-gradient(135deg, transparent 50%, #666 50%)'});
  
        panel.append(head, pre, grip);
        root.append(panel);
        root.addEventListener('click', (e)=>{ if(e.target===root) hide(); });
        document.body.append(root);
      }
  
      // taille/position persistées (recentrage si off-screen)
      const st = Object.assign({left:null, top:null, width:null, height:null}, load());
      const panel = document.getElementById('prompt-overlay-panel');
      const vw = innerWidth, vh = innerHeight;
      const defW = Math.min(960, vw*0.92), defH = Math.min(vh*0.8, vh-40);
      const W = clamp(st.width ?? defW, 420, vw-20);
      const H = clamp(st.height ?? defH, 260, vh-20);
      panel.style.width = W+'px'; panel.style.height = H+'px';
      if (st.left!=null && st.top!=null){
        panel.style.transform = 'none';
        panel.style.left = clamp(st.left, 10, Math.max(10, vw - W - 10))+'px';
        panel.style.top  = clamp(st.top , 10, Math.max(10, vh - H - 10))+'px';
      } else {
        panel.style.left = '50%'; panel.style.top = '50%'; panel.style.transform = 'translate(-50%,-50%)';
      }
  
      // drag + resize
      let drag=null, rez=null;
      const head = document.getElementById('prompt-overlay-head');
      const pre  = document.getElementById('prompt-overlay-pre');
      const grip = document.getElementById('prompt-overlay-resize');
  
      function onMove(e){
        if (drag){
          const nx = clamp(drag.x + (e.clientX - drag.sx), 10, Math.max(10, innerWidth  - drag.w - 10));
          const ny = clamp(drag.y + (e.clientY - drag.sy), 10, Math.max(10, innerHeight - drag.h - 10));
          panel.style.left = nx+'px'; panel.style.top = ny+'px';
        } else if (rez){
          panel.style.width  = clamp(rez.w + (e.clientX - rez.sx), 420, innerWidth  - 20)+'px';
          panel.style.height = clamp(rez.h + (e.clientY - rez.sy), 260, innerHeight - 20)+'px';
        }
      }
      function onUp(){
        if (drag || rez){
          const r = panel.getBoundingClientRect();
          save({left:Math.round(r.left), top:Math.round(r.top), width:Math.round(r.width), height:Math.round(r.height)});
        }
        drag=rez=null; removeEventListener('mousemove', onMove); removeEventListener('mouseup', onUp);
      }
      head.onmousedown = (e)=>{ e.preventDefault();
        const r = panel.getBoundingClientRect();
        panel.style.transform = 'none'; panel.style.left = r.left+'px'; panel.style.top = r.top+'px';
        drag = {sx:e.clientX, sy:e.clientY, x:r.left, y:r.top, w:r.width, h:r.height};
        addEventListener('mousemove', onMove); addEventListener('mouseup', onUp);
      };
      grip.onmousedown = (e)=>{ e.preventDefault(); e.stopPropagation();
        const r = panel.getBoundingClientRect();
        panel.style.transform = 'none'; panel.style.left = r.left+'px'; panel.style.top = r.top+'px';
        rez = {sx:e.clientX, sy:e.clientY, w:r.width, h:r.height};
        addEventListener('mousemove', onMove); addEventListener('mouseup', onUp);
      };
  
      root.addEventListener('wheel', (e)=>e.stopPropagation(), {passive:false});
      pre.addEventListener('wheel', (e)=>e.stopPropagation(), {passive:true});
      return root;
    }
    function show(text){ const root = ensure(); const pre = document.getElementById('prompt-overlay-pre'); pre.textContent = text || '(vide)'; root.style.display='block'; document.documentElement.style.overflow='hidden'; }
    function hide(){ const root = document.getElementById('prompt-overlay'); if (root) root.style.display='none'; document.documentElement.style.overflow=''; }
    return { show, hide };
  })();

  document.addEventListener('paria:blob-updated', ()=>{
    try {
      const now = (typeof getCharter==='function') ? getCharter() : null;
      if (now) fillCharter(host, now);
      
      // rebind pour que la grille Client reflète le profil du blob
      try { bindClientProfile(host); } catch {}
    } catch(e){}
  }, { passive:true });

  host.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('[data-action]'); if (!btn) return;
    const id = btn.closest('[data-id]')?.dataset?.id; if (!id) return;
    if (btn.dataset.action === 'prop-preview'){
      // ⛔️ ignorer l’ancien bouton bas (dans .actions)
      if (btn.closest('.actions')) return;
    
      const id = btn.dataset.propId
          || btn.closest('.proposal')?.getAttribute('data-id')
          || btn.closest('[data-id]')?.getAttribute('data-id');
      const ch = (typeof getCharter==='function') ? getCharter() : {};
      const pr = (ch.ai||[]).find(x=>String(x.id)===String(id));
      const txt = pr?.prompt || ch?.last_prompt || '(prompt indisponible)';
      PromptOverlay.show(txt);
      return;
    }
  
    if (btn.dataset.action==='prop-delete') removeCharterAI(id);
    if (btn.dataset.action === 'prop-think'){
      const card = btn.closest('.proposal,[data-id]');
      const id = btn.dataset.propId || card?.getAttribute('data-id');
      const ch = (typeof getCharter==='function') ? getCharter() : {};
      const p  = (ch.ai||[]).find(x=>String(x.id)===String(id));
      if (!p) return;
    
      const next = !(p?.state?.think);
      p.state = {...(p.state||{}), think: next};
    
      if (typeof saveCharter==='function') saveCharter({ ai: ch.ai });
    
      // Mise à jour UI locale uniquement (pas de re-render global)
      btn.textContent = next ? '🤔' : '💡';
      btn.title = next ? 'À réfléchir (activé)' : 'À réfléchir (désactivé)';
      return;
    }

    $('#charter-proposals-box', host).innerHTML = renderProposals(getCharter());
    
    // Purge: si une prop n'est plus à l'écran → retirer son prompt du JSON
    try{
      const ch = getCharter()||{};
      const ids = new Set([...host.querySelectorAll('#charter-proposals-box .proposal')].map(n=>n.getAttribute('data-id')));
      let changed = false;
      (ch.ai||[]).forEach(p=>{
        if (!ids.has(String(p.id)) && p.prompt){ delete p.prompt; changed = true; }
      });
      if (changed) saveCharter({ ai: ch.ai });
    }catch{}

    // Si plus aucune proposition active → on efface le dernier prompt
    try{
      const ch = getCharter() || {};
      const left = (ch.ai||[]).filter(p=>!p?.state?.deleted).length;
      if (!left) saveCharter({ last_prompt: null, last_prompt_ts: null });
    }catch{}
  });
  attachContentHistoryDatalist(host);
}

export const mount = mountCharterTab;
export default { mount };





















