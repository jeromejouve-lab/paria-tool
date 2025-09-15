// src/ui/tabs/settings.js — injection au mount, diag sur CHAMPS, WorkID + Restore

import { settingsLoad, settingsSave, updateLocalUsageBadge, buildWorkId } from '../../core/settings.js';

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
          <button id="btn-restore" type="button">Restaurer</button>
          <span id="restore-status" class="muted">—</span>
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
    refresh();
  };

  // Proposer = propose aujourd’hui + heure courante
  const btnSuggest = $('#btn-workid-suggest', root);
  if (btnSuggest) btnSuggest.onclick = ()=>{
    const d = new Date(); const p=v=>String(v).padStart(2,'0');
    if (dateEl) dateEl.value = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
    if (timeEl) timeEl.value = `${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  // Restaurer = route=load via proxy (GET), avec work_id + when
  const btnRestore = $('#btn-restore', root);
  if (btnRestore) btnRestore.onclick = async ()=>{
    const s = settingsLoad() || {};
    const client  = $('#client', root)?.value?.trim() || s.client || '';
    const service = $('#service', root)?.value?.trim() || s.service || '';
    const whenISO = toISODate(dateEl?.value || '', timeEl?.value || '');
    const workId = `${client}|${service}|${(dateEl?.value || '').trim() || (new Date().toISOString().slice(0,10))}`;
    const url = $('#proxy-url', root)?.value?.trim() || '';
    const secret = $('#proxy-secret', root)?.value?.trim() || '';
    const statusEl = $('#restore-status', root);
    if (!url || !secret || !client || !service || !dateEl?.value) {
      if (statusEl) statusEl.textContent = '❌ infos incomplètes (proxy/client/service/date)';
      return;
    }
    try {
      const u = new URL(url);
      u.searchParams.set('route','load');
      u.searchParams.set('secret',secret);
      u.searchParams.set('work_id', workId);
      if (whenISO) u.searchParams.set('at', whenISO);
      const r = await fetch(u.toString(), { method:'GET' });
      const txt = await r.text();
      let data; try { data = JSON.parse(txt); } catch { data = { text: txt }; }
      console.log('[RESTORE]', { workId, whenISO, http:r.status, data });
      if (statusEl) statusEl.textContent = r.ok && (data?.ok !== false) ? '✅ restauré (voir console)' : '⚠︎ réponse proxy (voir console)';
    } catch(e){
      console.error('[RESTORE][error]', e);
      if (statusEl) statusEl.textContent = '❌ erreur réseau';
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
