// src/ui/tabs/settings.js — injection au mount, diag sur CHAMPS, WorkID + Restore

import { settingsLoad, settingsSave, updateLocalUsageBadge, buildWorkId } from '../../core/settings.js';
import { bootstrapWorkspace } from '../../core/net.js';

const $ = (s, r=document) => r.querySelector(s);

function markErr(root, sel, on){
  const el = root.querySelector(sel);
  if (!el) return;
  el.style.outline = on ? '2px solid #ff99aa' : '';
  el.style.outlineOffset = on ? '2px' : '';
}

function toISODate(dateStr, timeStr){
  // dateStr: "YYYY-MM-DD" (ou vide), timeStr: "HH:mm" (ou vide)
  if (!dateStr) return '';
  const [y,m,d] = dateStr.split('-').map(Number);
  let h=0, mi=0;
  if (timeStr && /^\d{2}:\d{2}$/.test(timeStr)) { const [hh,mm]=timeStr.split(':').map(Number); h=hh; mi=mm; }
  const dt = new Date(y, (m||1)-1, d||1, h||0, mi||0, 0);
  // on renvoie ISO date-only si pas d’heure, sinon ISO datetime sans ms
  if (!timeStr) return dt.toISOString().slice(0,10);
  return dt.toISOString().slice(0,19);
}

// ---- injection du formulaire au mount ----
function injectMarkup(root){
  root.innerHTML = `
    <section class="block">
      <h3>Réglages</h3>

      <div class="row">
        <label>Client<br>
          <input id="client" name="client" type="text" placeholder="Nom du client">
        </label>
        <label>Service<br>
          <input id="service" name="service" type="text" placeholder="Nom du service">
        </label>
      </div>

      <fieldset style="margin-top:10px">
        <legend>Work ID & Date</legend>
        <div class="row" style="align-items:flex-end;gap:12px;flex-wrap:wrap">
          <label>Date (YYYY-MM-DD)<br>
            <input id="work-date" type="date" />
          </label>
          <label>Heure (HH:mm, optionnel)<br>
            <input id="work-time" type="time" />
          </label>
          <button id="btn-workid-link" type="button">Lier ce WorkID</button>
          <button id="btn-workid-suggest" type="button">Proposer</button>
          <div class="muted" id="workid-now" style="min-width:220px">WorkID actuel : –</div>
        </div>
        <div class="row" style="margin-top:8px;gap:12px;flex-wrap:wrap;align-items:center">
          <button id="btn-restore-propose" type="button">Proposer snapshots</button>
          <button id="btn-restore-apply" type="button" disabled>Restaurer la sélection</button>
        </div>
        <div id="restore-list" class="list"></div>

        <div class="row" style="margin-top:8px;gap:12px;flex-wrap:wrap;align-items:center">
          <button id="btn-restore" type="button">Restaurer</button>
          <span id="restore-status" class="muted">—</span>
        </div>
        <div class="row" style="margin-top:8px;gap:12px;align-items:center">
          <button id="btn-snapshot-now" type="button">Snapshot maintenant</button>
          <span id="snapshot-status" class="muted">—</span>
        </div>

      </fieldset>

      <div class="row" style="margin-top:12px">
        <fieldset style="min-width:320px">
          <legend>Proxy (Apps Script)</legend>
          <label>URL<br>
            <input id="proxy-url" name="endpoints.proxy.url" type="url" placeholder="https://script.google.com/macros/s/.../exec">
          </label>
          <label>Secret<br>
            <input id="proxy-secret" name="endpoints.proxy.secret" type="password" placeholder="secret">
          </label>
          <div class="muted" style="margin-top:6px" id="proxy-status">Proxy —</div>
        </fieldset>

        <fieldset style="min-width:320px">
          <legend>GitHub (versionning)</legend>
          <div style="display:flex; gap:12px; flex-wrap:wrap">
            <label style="flex:1 1 260px">Repo URL<br>
              <input id="git-url" name="endpoints.git.url" type="url" placeholder="https://github.com/owner/repo (optionnel si Owner/Repo ci-dessous)">
            </label>
            <div style="flex:1 1 260px">
              <label>Owner<br>
                <input id="git-owner" name="git-owner" type="text" placeholder="ex: jeromejouve-lab">
              </label>
              <label>Repo<br>
                <input id="git-repo" name="git-repo" type="text" placeholder="ex: paria-audits">
              </label>
            </div>
          </div>
          <label style="margin-top:6px">Token PAT<br>
            <input id="git-token" name="endpoints.git.token" type="password" placeholder="github_pat_… ou ghp_…">
          </label>
          <div class="muted" style="margin-top:6px" id="git-status">Git —</div>
        </fieldset>
      </div>

      <div class="btns" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-top:8px">
        <button id="btn-diag" type="button">Diag</button>
        <button id="btn-save-conf" type="button">Sauver la conf</button>
        <!-- pas de badge 'Local —' ici : on garde le badge global en haut -->
      </div>
    </section>
  `;
}

// ---- remplir depuis conf (lecture seule) ----
function fillForm(root, cfg){
  const s = cfg || {};
  const set = (sel, v)=>{ const el = root.querySelector(sel); if (el) el.value = v ?? ''; };

  set('#client',  s.client || '');
  set('#service', s.service || '');

  set('#proxy-url',    s?.endpoints?.proxy?.url || s?.proxy?.url || '');
  set('#proxy-secret', s?.endpoints?.proxy?.secret || s?.proxy?.secret || s?.endpoints?.proxy?.token || s?.proxy?.token || '');

  // Git : url OU owner/repo
  const gUrl   = s?.endpoints?.git?.url   || s?.git?.url   || '';
  const gOwner = s?.endpoints?.git?.owner || s?.git?.owner || '';
  const gRepo  = s?.endpoints?.git?.repo  || s?.git?.repo  || '';
  const gTok   = s?.endpoints?.git?.token || s?.git?.token || '';

  set('#git-url',   gUrl);
  set('#git-owner', gOwner);
  set('#git-repo',  gRepo);
  set('#git-token', gTok);

  // WorkID preview
  try {
    const d = new Date();
    const pad = v=>String(v).padStart(2,'0');
    const today = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    const w = (typeof buildWorkId === 'function') ? buildWorkId() : `${(s.client||'').trim()}|${(s.service||'').trim()}|${today}`;
    const span = $('#workid-now', root);
    if (span) span.textContent = `WorkID actuel : ${w || '–'}`;
    const dateInput = $('#work-date', root);
    if (dateInput && !dateInput.value) dateInput.value = today;
  } catch {}
}

// ---- lecture du formulaire (pour sauvegarde explicite) ----
function readForm(root){
  const out = {
    client:  root.querySelector('#client')?.value?.trim() || '',
    service: root.querySelector('#service')?.value?.trim() || '',
    endpoints: {
      proxy: {
        url:    root.querySelector('#proxy-url')?.value?.trim()    || '',
        secret: root.querySelector('#proxy-secret')?.value?.trim() || ''
      },
      git: {
        url:   root.querySelector('#git-url')?.value?.trim()   || '',
        owner: root.querySelector('#git-owner')?.value?.trim() || '',
        repo:  root.querySelector('#git-repo')?.value?.trim()  || '',
        token: root.querySelector('#git-token')?.value?.trim() || ''
      }
    }
  };
  return out;
}

// ---- DIAG sur les CHAMPS (pas la conf) : Proxy + Git ----
async function autoTests(root){
  // reset styles
  ['#proxy-url','#proxy-secret','#git-url','#git-owner','#git-repo','#git-token']
    .forEach(sel => markErr(root, sel, false));

  // Proxy (Apps Script) : GET ?route=diag&secret=...
  const purl = root.querySelector('#proxy-url')?.value?.trim() || '';
  const psec = root.querySelector('#proxy-secret')?.value?.trim() || '';
  const proxBadge = root.querySelector('#proxy-status');

  if (purl && psec) {
    try {
      const u = new URL(purl);
      u.searchParams.set('route', 'diag');
      u.searchParams.set('secret', psec);
      const r = await fetch(u.toString(), { method: 'GET' });
      let ok = r.ok;
      try { const j = await r.clone().json(); if (typeof j.ok === 'boolean') ok = ok && j.ok; } catch {}
      markErr(root, '#proxy-url', !ok);
      markErr(root, '#proxy-secret', !ok);
      if (proxBadge) proxBadge.textContent = ok ? 'Proxy ✅' : 'Proxy ❌';
    } catch {
      markErr(root, '#proxy-url', true);
      markErr(root, '#proxy-secret', true);
      if (proxBadge) proxBadge.textContent = 'Proxy ❌';
    }
  } else {
    if (proxBadge) proxBadge.textContent = 'Proxy —';
  }

  // Git (API GitHub) : URL complète OU Owner/Repo
  const urlField   = root.querySelector('#git-url');
  const ownerField = root.querySelector('#git-owner');
  const repoField  = root.querySelector('#git-repo');
  const tokenField = root.querySelector('#git-token');

  const urlIn = (urlField?.value || '').trim();
  const owner = (ownerField?.value || '').trim();
  const repo  = (repoField?.value  || '').trim();
  const gtok  = (tokenField?.value || '').trim();
  const gitBadge = root.querySelector('#git-status');

  let apiUrl = '';
  if (urlIn) {
    const m = urlIn.match(/github\.com\/([^\/]+)\/([^\/\.]+)(?:\.git)?/i);
    if (m) apiUrl = `https://api.github.com/repos/${m[1]}/${m[2]}`;
  } else if (owner && repo) {
    apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
  }

  if (apiUrl) {
    try {
      const headers = { 'Accept':'application/vnd.github+json' };
      if (gtok) headers['Authorization'] = `Bearer ${gtok}`;
      const r = await fetch(apiUrl, { headers });
      const ok = r.ok;
      const status = r.status;

      if (ok) {
        markErr(root, '#git-url',   false);
        markErr(root, '#git-owner', false);
        markErr(root, '#git-repo',  false);
        markErr(root, '#git-token', false);
        if (gitBadge) gitBadge.textContent = 'Git ✅';
      } else if (status === 401 || status === 403 || status === 404) {
        // privé / non autorisé / rate-limit → token requis/insuffisant
        markErr(root, '#git-url',   false);
        markErr(root, '#git-owner', false);
        markErr(root, '#git-repo',  false);
        markErr(root, '#git-token', !gtok);
        if (gitBadge) gitBadge.textContent = gtok ? 'Git ⚠︎ (autorisations/limite)' : 'Git 🔒 token requis';
      } else {
        // autre erreur réseau ou URL introuvable
        if (urlIn) {
          markErr(root, '#git-url', true);
        } else {
          markErr(root, '#git-owner', true);
          markErr(root, '#git-repo',  true);
        }
        if (gitBadge) gitBadge.textContent = 'Git ❌';
      }
    } catch {
      if (urlIn) {
        markErr(root, '#git-url', true);
      } else {
        markErr(root, '#git-owner', true);
        markErr(root, '#git-repo',  true);
      }
      if (gitBadge) gitBadge.textContent = 'Git ❌';
    }
  } else {
    if (gitBadge) gitBadge.textContent = 'Git —';
  }

  // badge global Local % (no-op si pas de placeholder global)
  try { updateLocalUsageBadge(); } catch {}
}

// ---- WorkID + Restore ----
function bindWorkId(root){
  const wNow = $('#workid-now', root);
  const dateEl = $('#work-date', root);
  const timeEl = $('#work-time', root);

  const refresh = ()=>{
    const s = settingsLoad() || {};
    const todayISO = (()=>{
      const d = new Date(); const p=v=>String(v).padStart(2,'0');
      return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
    })();
    const w = (typeof buildWorkId === 'function') ? buildWorkId() : `${(s.client||'').trim()}|${(s.service||'').trim()}|${todayISO}`;
    if (wNow) wNow.textContent = `WorkID actuel : ${w || '–'}`;
    if (dateEl && !dateEl.value) dateEl.value = todayISO;
  };

  refresh();

  // Lier ce WorkID = mémorise client/service + (optionnellement) date (via settings)
  const btnLink = $('#btn-workid-link', root);
  if (btnLink) btnLink.onclick = ()=>{
    // on sauvegarde juste client/service saisis ; la date reste pour RESTORE
    const patch = {
      client:  $('#client', root)?.value?.trim() || '',
      service: $('#service', root)?.value?.trim() || ''
    };
    settingsSave(patch);
    
    // feedback visuel court
    btnLink.disabled = true;
    const _oldText_link = btnLink.textContent;
    btnLink.textContent = '✅ Lié';
    setTimeout(()=>{ btnLink.disabled = false; btnLink.textContent = _oldText_link; }, 900);

    refresh();
  };

  // Proposer = propose aujourd’hui + heure courante
  const btnSuggest = $('#btn-workid-suggest', root);
  
  if (btnSuggest) btnSuggest.onclick = ()=>{
    const d = new Date(); const p=v=>String(v).padStart(2,'0');
    if (dateEl) dateEl.value = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
    if (timeEl) timeEl.value = `${p(d.getHours())}:${p(d.getMinutes())}`;
    
    // feedback visuel court
    btnSuggest.disabled = true;
    const _oldText_suggest = btnSuggest.textContent;
    btnSuggest.textContent = '📌 Proposé';
    setTimeout(()=>{ btnSuggest.disabled = false; btnSuggest.textContent = _oldText_suggest; }, 900);
  };

  // Restaurer = route=load via proxy (GET), avec work_id + when
  const btnRestore = $('#btn-restore', root);
  // === RESTAURER (one-click) — GIT ONLY (écrase tout handler précédent) ===
  if (btnRestore) btnRestore.onclick = async ()=>{ 
    console.group('[RESTORE][git] one-click');
    const _old = btnRestore.textContent;
    btnRestore.disabled = true;
    btnRestore.textContent = 'Restauration…';
    try{
      const s = settingsLoad() || {};
      const owner  = (document.querySelector('#git-owner')  ?.value || s.git_owner  || '').trim();
      const repo   = (document.querySelector('#git-repo')   ?.value || s.git_repo   || '').trim();
      const branch = (document.querySelector('#git-branch') ?.value || s.git_branch || 'main').trim();
      const token  = (document.querySelector('#git-token')  ?.value || s.git_token  || '').trim();
  
      const client  = (document.querySelector('#client')?.value  || s.client  || '').trim();
      const service = (document.querySelector('#service')?.value || s.service || '').trim();
      const dateStr = (document.querySelector('#work-date')?.value || new Date().toISOString().slice(0,10)).trim();
      const timeStr = (document.querySelector('#work-time')?.value || '').trim();
  
      const statusEl = $('#restore-status', root);
      if (!owner || !repo || !client || !service || !dateStr){
        if (statusEl) statusEl.textContent = '❌ paramètres manquants (Git/client/service/date)';
        throw new Error('missing_params');
      }
  
      // 1) Choisir le snapshot/backup candidat
      let candidatePath = __picked?.path; // si une sélection a été faite dans la liste
      if (!candidatePath){
        const base = `clients/${client}/${service}/${dateStr}`;
        const url  = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(base)}?ref=${encodeURIComponent(branch)}`;
        console.log('GET', url);
        const r = await fetch(url, {
          headers: {
            'Accept': 'application/vnd.github+json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          }
        });
        const arr = (r.status===200 ? await r.json() : []);
        const SNAP = /^snapshot-(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.json$/;
        const BACK = /^backup-(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.json$/;
  
        const items = Array.isArray(arr) ? arr
          .filter(x => x?.type==='file' && (SNAP.test(x.name) || BACK.test(x.name)))
          .map(x => {
            const m = x.name.match(SNAP) || x.name.match(BACK);
            return { path:x.path, at:`${m[1]}_${m[2]}` }; // YYYY-MM-DD_HH-MM-SS
          }) : [];
  
        if (!items.length) throw new Error('no_snapshots_for_day');
  
        // tri ASC pour appliquer la règle ≥ HH:MM ; sinon dernier du jour
        items.sort((a,b)=> a.at.localeCompare(b.at));
        if (timeStr){
          const hhmm = timeStr.replace(':','-');
          const after = items.find(o => o.at >= `${dateStr}_${hhmm}-00`);
          candidatePath = (after || items[items.length-1]).path;
        } else {
          candidatePath = items[items.length-1].path;
        }
      }
  
      // 2) Charger le JSON depuis Git
      const url2 = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(candidatePath)}?ref=${encodeURIComponent(branch)}`;
      console.log('GET', url2);
      const r2 = await fetch(url2, {
        headers: {
          'Accept': 'application/vnd.github+json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      if (r2.status !== 200) throw new Error('not_found');
      const meta = await r2.json();
      const raw  = atob((meta.content||'').replace(/\n/g,''));
      let snap=null; try { snap = JSON.parse(raw); } catch { throw new Error('bad_json'); }
  
      // 3) Appliquer (replace namespace paria.*) + backup
      const content = snap?.local || snap?.content?.local || snap?.content || snap || {};
      if (!content || typeof content !== 'object') throw new Error('empty');
  
      const keys = Object.keys(localStorage).filter(k=>k.startsWith('paria') && k!=='paria.__backup__');
      const bak = keys.reduce((a,k)=>(a[k]=localStorage.getItem(k),a),{});
      localStorage.setItem('paria.__backup__', JSON.stringify({ stamp:new Date().toISOString(), bak }));
  
      for (const k of Object.keys(localStorage)){
        if (k.startsWith('paria') && !k.endsWith('.__backup__')) localStorage.removeItem(k);
      }
      for (const [k,v] of Object.entries(content)){
        const key = k.startsWith('paria') ? k : `paria.${k}`;
        localStorage.setItem(key, typeof v==='string' ? v : JSON.stringify(v));
      }
  
      if (statusEl) statusEl.textContent = '✅ restauré (Git one-click)';
      try { await bootstrapWorkspace(); } catch {}
      setTimeout(()=> location.reload(), 120);
    }catch(e){
      console.error('[RESTORE][git] one-click error', e);
      const statusEl = $('#restore-status', root);
      if (statusEl) statusEl.textContent = '❌ restauration (Git one-click)';
    }finally{
      btnRestore.textContent = _old;
      btnRestore.disabled = false;
      console.groupEnd();
    }
  };

  
  // === Restore (liste/sélection) ===
  const btnProp = $('#btn-restore-propose', root);
  const btnApplySel = $('#btn-restore-apply', root);
  const listEl = $('#restore-list', root);
  
  // ——— Compact typographique pour la liste des snapshots (sans toucher au thème global)
  (function ensureRestoreListCSS(){
    const prev = document.getElementById('paria-restore-compact-css');
    if (prev) prev.remove();
    const st = document.createElement('style');
    st.id = 'paria-restore-compact-css';
    st.textContent = `
      #restore-list{ font-size:.88em; line-height:1.25; }
      /* grille: [radio] [info extensible] [heure alignée droite] */
      #restore-list .snap{ display:grid; grid-template-columns: 20px 1fr auto; align-items:center; gap:8px; padding:4px 0; }
      #restore-list .snap .info{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; min-width:0; }
      #restore-list .snap .date{ opacity:.8; }
      #restore-list .snap .name{ opacity:.7; font-size:.86em; overflow-wrap:anywhere; }
      #restore-list code.mono{ font-size:.78em; opacity:.65; overflow-wrap:anywhere; }
      #restore-list .snap .time{ text-align:right; width:56px; font-variant-numeric:tabular-nums; opacity:.85; }
      #restore-list input[type="radio"]{ margin:0; }
    `;

    document.head.appendChild(st);
  })();


  let __snaps = [];
  let __picked = null;

  function currentClientService(){
    const s = settingsLoad() || {};
    const client  = $('#client', root)?.value?.trim() || s.client || '';
    const service = $('#service', root)?.value?.trim() || s.service || '';
    return { client, service };
  }
  function currentWhenISO(){
    const dateEl = $('#work-date', root);
    const timeEl = $('#work-time', root);
    const dateStr = (dateEl?.value || '').trim();
    const timeStr = (timeEl?.value || '').trim();
    if (!dateStr) return '';
    return timeStr ? `${dateStr}T${timeStr}:00` : `${dateStr}T00:00:00`;
  }
  function buildWorkIdLocal(){
    const { client, service } = currentClientService();
    const d = ($('#work-date', root)?.value || '').trim() || new Date().toISOString().slice(0,10);
    return `${client}|${service}|${d}`;
  }
  function renderSnapList(items){
    if (!listEl) return;
    if (!items?.length){
      listEl.innerHTML = `<div class="muted">Aucun snapshot proposé.</div>`;
      btnApplySel && (btnApplySel.disabled = true);
      __picked = null; return;
    }
    listEl.innerHTML = items.map((x,i)=>`
      <label class="row" style="gap:8px;align-items:center">
        <input type="radio" name="snap" value="${i}">
        <span><b>${new Date(x.at).toLocaleString()}</b> · ${x.source || 'git'}</span>
        <code class="mono">${x.path}</code>
      </label>
    `).join('');
    // auto-pick selon règle "à l’instant T"
    const at = currentWhenISO();
    let idx = 0;
    if (at){
      const t = Date.parse(at);
      const srt = [...items].sort((a,b)=> Date.parse(a.at)-Date.parse(b.at));
      const after = srt.find(o=> Date.parse(o.at) >= t);
      const chosen = after || srt[srt.length-1];
      idx = items.findIndex(o=> o.path===chosen?.path);
      if (idx < 0) idx = 0;
    }
    const radio = listEl.querySelector(`input[value="${idx}"]`);
    if (radio){ radio.checked = true; __picked = items[idx]; }
    if (btnApplySel) btnApplySel.disabled = !__picked;

    listEl.addEventListener('change', (e)=>{
      if (e.target?.name === 'snap'){
        const i = Number(e.target.value);
        __picked = items[i] || null;
        if (btnApplySel) btnApplySel.disabled = !__picked;
      }
    }, { once:true });
  }

  if (btnProp) btnProp.onclick = async ()=>{
    console.group('[RESTORE][git] proposer');
    const _oldText_prop = btnProp.textContent;
    btnProp.disabled = true; btnProp.textContent = 'Proposition…';
  
    try{
      const s = settingsLoad() || {};
      const owner  = (document.querySelector('#git-owner')  ?.value || s.git_owner  || '').trim();
      const repo   = (document.querySelector('#git-repo')   ?.value || s.git_repo   || '').trim();
      const branch = (document.querySelector('#git-branch') ?.value || s.git_branch || 'main').trim();
      const token  = (document.querySelector('#git-token')  ?.value || s.git_token  || '').trim();
  
      const client  = (document.querySelector('#client')?.value  || s.client  || '').trim();
      const service = (document.querySelector('#service')?.value || s.service || '').trim();
      const dateStr = (document.querySelector('#work-date')?.value || new Date().toISOString().slice(0,10)).trim();
      const timeStr = (document.querySelector('#work-time')?.value || '').trim();
  
      if (!owner || !repo || !client || !service || !dateStr){
        listEl.innerHTML = `<div class="muted">Paramètres manquants (owner/repo/client/service/date).</div>`;
        btnApplySel && (btnApplySel.disabled = true);
        __picked = null;
        return;
      }
  
      const base = `clients/${client}/${service}/${dateStr}`;
      const url  = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(base)}?ref=${encodeURIComponent(branch)}`;
      console.log('GET', url);
  
      const r = await fetch(url, {
        headers: {
          'Accept': 'application/vnd.github+json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
  
      let items = [];
      if (r.status === 200){
        const arr = await r.json();
        const SNAP = /^snapshot-(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.json$/;
        const BACK = /^backup-(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.json$/;
  
        items = Array.isArray(arr) ? arr
          .filter(x => x?.type === 'file' && (SNAP.test(x.name) || BACK.test(x.name)))
          .map(x => {
            const m = x.name.match(SNAP) || x.name.match(BACK);
            const at = `${m[1]}T${m[2].replace(/-/g,':')}`;
            return { at, source:'git', path:x.path, name:x.name };
          }) : [];
      }
  
      // tri DESC (plus récent en haut)
      items.sort((a,b)=> Date.parse(b.at) - Date.parse(a.at));
  
      if (!items.length){
        listEl.innerHTML = `<div class="muted">Aucun snapshot/backup pour ${dateStr}.</div>`;
        btnApplySel && (btnApplySel.disabled = true);
        __picked = null;
      } else {
        listEl.innerHTML = items.map((x,i)=>{
          const d = new Date(x.at);
          const hh = d.toLocaleTimeString(undefined, {hour:'2-digit', minute:'2-digit'});
          const dateShort = d.toLocaleDateString();
          return `
            <label class="snap">
              <input type="radio" name="snap" value="${i}">
              <span class="info">
                <span class="date">${dateShort}</span>
                <span class="name">${x.name}</span>
                <code class="mono">${x.path}</code>
              </span>
              <span class="time">${hh}</span>
            </label>
          `;
        }).join('');
  
        // auto-pick : premier ≥ HH:MM si heure saisie, sinon le plus récent (liste triée DESC)
        const atIso = timeStr ? `${dateStr}T${timeStr}:00` : null;
        if (atIso){
          // calcul sur copie ASC pour la règle "≥ HH:MM"
          const asc = [...items].sort((a,b)=> Date.parse(a.at) - Date.parse(b.at));
          const after = asc.find(o => Date.parse(o.at) >= Date.parse(atIso));
          const chosen = after || asc[asc.length-1];
          const idx = items.findIndex(o => o.path === chosen.path); // items est DESC
          const radio = listEl.querySelector(`input[name="snap"][value="${idx}"]`);
          if (radio){ radio.checked = true; __picked = items[idx]; btnApplySel.disabled = false; }
        } else {
          // par défaut : premier (plus récent)
          const radio = listEl.querySelector(`input[name="snap"][value="0"]`);
          if (radio){ radio.checked = true; __picked = items[0]; btnApplySel.disabled = false; }
        }
  
        listEl.addEventListener('change', (e)=>{
          if (e.target?.name === 'snap'){
            const i = Number(e.target.value);
            __picked = items[i] || null;
            btnApplySel.disabled = !__picked;
          }
        }, { once:true });
      }

      console.table(items.map(x=>({at:x.at, path:x.path})));
    }catch(e){
      console.error('[RESTORE][git] proposer error', e);
      listEl.innerHTML = `<div class="muted">❌ Erreur lors de la proposition (Git).</div>`;
      btnApplySel && (btnApplySel.disabled = true);
      __picked = null;
    }finally{
      btnProp.textContent = _oldText_prop;
      btnProp.disabled = false;
      console.groupEnd();
    }
  };


  if (btnApplySel) btnApplySel.onclick = async ()=>{
    console.group('[RESTORE][git] apply selection');
    const _old = btnApplySel.textContent;
    btnApplySel.disabled = true; btnApplySel.textContent = 'Restauration…';
    try{
      if (!__picked?.path) throw new Error('no candidate');
  
      const s = settingsLoad() || {};
      const owner  = (document.querySelector('#git-owner')  ?.value || s.git_owner  || '').trim();
      const repo   = (document.querySelector('#git-repo')   ?.value || s.git_repo   || '').trim();
      const branch = (document.querySelector('#git-branch') ?.value || s.git_branch || 'main').trim();
      const token  = (document.querySelector('#git-token')  ?.value || s.git_token  || '').trim();
  
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(__picked.path)}?ref=${encodeURIComponent(branch)}`;
      console.log('GET', url);
  
      const r = await fetch(url, {
        headers: {
          'Accept': 'application/vnd.github+json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      if (r.status !== 200) throw new Error('not_found');
      const meta = await r.json();
      const raw  = atob((meta.content||'').replace(/\n/g,''));
      let snap=null; try { snap = JSON.parse(raw); } catch { throw new Error('bad_json'); }
  
      // supporte {local}, {content:{local}}, ou objet plat
      const content = snap?.local || snap?.content?.local || snap?.content || snap || {};
      if (!content || typeof content !== 'object') throw new Error('empty');
  
      // backup local
      const keys = Object.keys(localStorage).filter(k=>k.startsWith('paria') && k!=='paria.__backup__');
      const bak = keys.reduce((a,k)=>(a[k]=localStorage.getItem(k),a),{});
      localStorage.setItem('paria.__backup__', JSON.stringify({ stamp:new Date().toISOString(), bak }));
  
      // replace namespace paria.*
      for (const k of Object.keys(localStorage)){
        if (k.startsWith('paria') && !k.endsWith('.__backup__')) localStorage.removeItem(k);
      }
      for (const [k,v] of Object.entries(content)){
        const key = k.startsWith('paria') ? k : `paria.${k}`;
        localStorage.setItem(key, typeof v==='string' ? v : JSON.stringify(v));
      }
  
      const statusEl = $('#restore-status', root);
      if (statusEl) statusEl.textContent = '✅ restauré (Git sélection)';
      try { await bootstrapWorkspace(); } catch {}
      setTimeout(()=> location.reload(), 120);
    }catch(e){
      console.error('[RESTORE][git] apply error', e);
      const statusEl = $('#restore-status', root);
      if (statusEl) statusEl.textContent = '❌ restauration (Git sélection)';
    }finally{
      btnApplySel.textContent = _old;
      btnApplySel.disabled = false;
      console.groupEnd();
    }
  };
  
  // --- Snapshot manuel (sauvegarde côté proxy / route 'save') ---
  const btnSnap = $('#btn-snapshot-now', root);
  if (btnSnap) btnSnap.onclick = async ()=>{
    const _old = btnSnap.textContent;
    btnSnap.disabled = true;
    btnSnap.textContent = 'Snapshot…';

    const statusEl = $('#snapshot-status', root);
    const s = settingsLoad() || {};
    const client  = $('#client', root)?.value?.trim() || s.client || '';
    const service = $('#service', root)?.value?.trim() || s.service || '';
    const dateStr = $('#work-date', root)?.value?.trim() || new Date().toISOString().slice(0,10);

    if (!client || !service) { if (statusEl) statusEl.textContent='❌ client/service manquants'; return; }

    // bundle de l’état local 'paria.*'
    const data = {};
    for (const k of Object.keys(localStorage)){
      if (k.startsWith('paria.') && k !== 'paria.__backup__'){
        const v = localStorage.getItem(k);
        try { data[k] = JSON.parse(v); } catch { data[k] = v; }
      }
    }

    // chemin cible Drive/Git (côté GAS, route 'save')
    const ts = new Date();
    const pad = v => String(v).padStart(2,'0');
    const stamp = `${ts.getFullYear()}-${pad(ts.getMonth()+1)}-${pad(ts.getDate())}_${pad(ts.getHours())}-${pad(ts.getMinutes())}-${pad(ts.getSeconds())}`;
    const path = `clients/${client}/${service}/${dateStr}/snapshot-${stamp}.json`;

    // === SNAPSHOT → GIT (unique path) ===
    {
      const s = settingsLoad() || {};
      const owner  = (document.querySelector('#git-owner')  ?.value || s.git_owner  || '').trim();
      const repo   = (document.querySelector('#git-repo')   ?.value || s.git_repo   || '').trim();
      const branch = (document.querySelector('#git-branch') ?.value || s.git_branch || 'main').trim();
      const token  = (document.querySelector('#git-token')  ?.value || s.git_token  || '').trim();

      const jsonStr    = JSON.stringify({ local: data }, null, 2);
      const contentB64 = btoa(unescape(encodeURIComponent(jsonStr))); // base64 UTF-8
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;

      console.group('[SNAPSHOT][git]');
      console.log('PUT', url, 'branch:', branch, 'bytes:', jsonStr.length);

      const r = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `snapshot ${client}|${service}|${dateStr} ${stamp}`,
          content: contentB64,
          branch
        })
      });
      const j = await r.json();
      console.log('status:', r.status, j);

      if (r.status !== 201 && r.status !== 200) {
        if (statusEl) statusEl.textContent = '❌ Snapshot Git';
        btnSnap.textContent = _old; btnSnap.disabled = false;
        console.groupEnd();
        return; // STOP ici: on ne tente PAS Google
      }

      if (statusEl) statusEl.textContent = `✅ Git: ${owner}/${repo}/${path}`;
      console.groupEnd();
      btnSnap.textContent = _old; btnSnap.disabled = false;
      return; // STOP ici: on ne tente PAS Google
    }

    // --- TRACE CONSOLE ---
    const gas = getGAS();
    const mask = s => (s ? (s.slice(0,3) + '…' + s.slice(-3)) : '');
    console.group('[SNAPSHOT][now]');
    console.log('GAS.url =', gas.url || '(vide)');
    console.log('GAS.secret =', mask(gas.secret || ''));
    console.log('target path =', path);
    console.log('local keys =', Object.keys(data).length);

    try{
      return; // Google désactivé tant que non résolu
      const res = await saveToGoogle(path, { local: data }, { kind:'snapshot', client, service, date: dateStr, at: ts.toISOString() });
      console.log('saveToGoogle → res =', res);
      console.log('res.status =', res?.status, 'res.ok =', res?.ok, 'data.ok =', res?.data?.ok);
      const ok = (res?.ok !== false) && (res?.data?.ok ?? true);
      if (statusEl) statusEl.textContent = ok ? `✅ ${path}` : '❌ échec snapshot';
    }catch(e){
      console.error('[snapshot][now]', e);
      if (statusEl) statusEl.textContent = '❌ erreur snapshot';
    }finally{
      console.groupEnd();
      btnSnap.textContent = _old; btnSnap.disabled = false;
    }
  };
}

// ---- bind des boutons + relance diag à la saisie ----
function bindActions(root){
  const btnDiag = $('#btn-diag', root);
  if (btnDiag) btnDiag.onclick = ()=> autoTests(root);

  const btnSave = $('#btn-save-conf', root);
  if (btnSave) btnSave.onclick = ()=>{
    const patch = readForm(root);
    settingsSave(patch);
    autoTests(root);
    // refresh workid preview après save
    const wNow = $('#workid-now', root);
    if (wNow && typeof buildWorkId === 'function') wNow.textContent = `WorkID actuel : ${buildWorkId()}`;
  };

  // relance diag après saisie (debounce)
  ['#client','#service','#proxy-url','#proxy-secret','#git-url','#git-owner','#git-repo','#git-token']
    .forEach(sel=>{
      const el = root.querySelector(sel);
      if (!el) return;
      el.addEventListener('input', ()=>{
        clearTimeout(el._t);
        el._t = setTimeout(()=> autoTests(root), 350);
      });
    });
}

// ---- point d’entrée onglet Réglages ----
export function mountSettingsTab(host){
  const root =
    host
    || document.querySelector('#tab-settings, [data-tab-pane="settings"], #settings, .tab-pane.settings, [data-pane="settings"]')
    || document.body;

  injectMarkup(root);
  const cfg = settingsLoad() || {};
  fillForm(root, cfg);
  bindActions(root);
  bindWorkId(root);
  autoTests(root); // tests non bloquants au mount
}

export const mount = mountSettingsTab;
export default { mount: mountSettingsTab };
















