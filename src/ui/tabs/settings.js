// --- MOUNT: injecte le formulaire puis bind (pas de dépendance à l'index) ---
export function mountSettingsTab(host) {
  const root =
    host
    || document.querySelector('#tab-settings, [data-tab-pane="settings"], #settings, .tab-pane.settings, [data-pane="settings"]')
    || document.body;

  // 1) INJECTION du markup (UI identique à ce qu’on avait)
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

      <div class="row">
        <fieldset style="min-width:280px">
          <legend>Proxy (Apps Script)</legend>
          <label>URL<br>
            <input id="proxy-url" name="endpoints.proxy.url" type="url" placeholder="https://script.google.com/macros/s/.../exec">
          </label>
          <label>Secret<br>
            <input id="proxy-secret" name="endpoints.proxy.secret" type="password" placeholder="secret">
          </label>
          <div class="muted" style="margin-top:6px" id="proxy-status">Proxy —</div>
        </fieldset>

        <fieldset style="min-width:280px">
          <legend>GitHub</legend>
          <label>Repo URL<br>
            <input id="git-url" name="endpoints.git.url" type="url" placeholder="https://github.com/owner/repo">
          </label>
          <label>Token<br>
            <input id="git-token" name="endpoints.git.token" type="password" placeholder="ghp_xxx (si privé)">
          </label>
          <label style="display:flex;align-items:center;gap:8px;margin-top:8px">
            <input id="AUTO_SYNC" type="checkbox"> Auto-sync snapshots (≥70%)
          </label>
          <div class="muted" style="margin-top:6px" id="git-status">Git —</div>
        </fieldset>
      </div>

      <div class="btns" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-top:8px">
        <button id="btn-diag" type="button">Diag</button>
        <button id="btn-save-conf" type="button">Sauver la conf</button>
        <span id="local-usage" class="muted" style="margin-left:auto">Local —</span>
      </div>
    </section>
  `;

  // 2) BIND: remplissage depuis la conf + tests auto non bloquants
  import('../../core/settings.js').then(({ settingsLoad, settingsSave, updateLocalUsageBadge })=>{
    import('../../core/net.js').then(({ diag, testGit })=>{

      const cfg = settingsLoad() || {};
      // Remplir
      const set = (sel, val)=>{ const el = root.querySelector(sel); if (el) el.value = val ?? ''; };
      set('#client', cfg.client || '');
      set('#service', cfg.service || '');
      set('#proxy-url', cfg?.endpoints?.proxy?.url || cfg?.proxy?.url || '');
      set('#proxy-secret', cfg?.endpoints?.proxy?.secret || cfg?.proxy?.secret || cfg?.endpoints?.proxy?.token || cfg?.proxy?.token || '');
      set('#git-url', cfg?.endpoints?.git?.url || cfg?.git?.url || '');
      set('#git-token', cfg?.endpoints?.git?.token || cfg?.git?.token || '');
      const autoSync = root.querySelector('#AUTO_SYNC'); if (autoSync) autoSync.checked = !!(cfg?.flags?.auto_sync);

      const markErr = (sel, on)=>{ const el = root.querySelector(sel); if (!el) return; el.style.outline = on ? '2px solid #ff99aa' : ''; el.style.outlineOffset = on ? '2px' : ''; };

      async function autoTests(){
        // reset
        ['#proxy-url','#proxy-secret','#git-url','#git-token'].forEach(s=>markErr(s,false));

        // proxy si complet
        const purl = root.querySelector('#proxy-url')?.value?.trim();
        const psec = root.querySelector('#proxy-secret')?.value?.trim();
        const proxBadge = root.querySelector('#proxy-status');
        if (purl && psec) {
          try {
            const r = await diag();
            const ok = !!r.ok;
            markErr('#proxy-url', !ok); markErr('#proxy-secret', !ok);
            if (proxBadge) proxBadge.textContent = ok ? 'Proxy ✅' : 'Proxy ❌';
          } catch {
            markErr('#proxy-url', true); markErr('#proxy-secret', true);
            if (proxBadge) proxBadge.textContent = 'Proxy ❌';
          }
        } else if (proxBadge) proxBadge.textContent = 'Proxy —';

        // git si URL
        const gurl = root.querySelector('#git-url')?.value?.trim();
        const gtok = root.querySelector('#git-token')?.value?.trim();
        const gitBadge = root.querySelector('#git-status');

        if (gurl) {
          try {
            const m = gurl.match(/github\.com\/([^\/]+)\/([^\/\.]+)(?:\.git)?/i);
            let ok = false, status = 0;
            if (m) {
              const owner = m[1], repo = m[2];
              const api = `https://api.github.com/repos/${owner}/${repo}`;
              const headers = { 'Accept':'application/vnd.github+json' };
              if (gtok) headers['Authorization'] = `Bearer ${gtok}`;
              const r = await fetch(api, { headers });
              status = r.status;
              ok = r.ok;
            }
            // coloration nuancée
            if (ok) {
              markErr('#git-url', false);
              markErr('#git-token', false);
              if (gitBadge) gitBadge.textContent = 'Git ✅';
            } else {
              if (status === 401 || status === 403 || status === 404) {
                // privé / non autorisé → token requis
                markErr('#git-url', false);
                markErr('#git-token', true);
                if (gitBadge) gitBadge.textContent = 'Git 🔒 token requis';
              } else {
                // vraie erreur d’URL ou autre
                markErr('#git-url', true);
                markErr('#git-token', false);
                if (gitBadge) gitBadge.textContent = 'Git ❌';
              }
            }
          } catch {
            markErr('#git-url', true);
            if (gitBadge) gitBadge.textContent = 'Git ❌';
          }
        } else {
          if (gitBadge) gitBadge.textContent = 'Git —'; // incomplet
        }
      }

      autoTests();

      // Diag
      const btnDiag = root.querySelector('#btn-diag');
      if (btnDiag) btnDiag.onclick = ()=> autoTests();

      // Sauver la conf (écriture explicite)
      const btnSave = root.querySelector('#btn-save-conf');
      if (btnSave) btnSave.onclick = ()=>{
        const out = {
          client: root.querySelector('#client')?.value?.trim() || '',
          service: root.querySelector('#service')?.value?.trim() || '',
          endpoints: {
            proxy: { url: root.querySelector('#proxy-url')?.value?.trim() || '', secret: root.querySelector('#proxy-secret')?.value?.trim() || '' },
            git:   { url: root.querySelector('#git-url')?.value?.trim() || '',   token:  root.querySelector('#git-token')?.value?.trim()  || '' }
          },
          flags: { auto_sync: !!root.querySelector('#AUTO_SYNC')?.checked }
        };
        settingsSave(out);
        autoTests();
      };
    });
  });
}

export const mount = mountSettingsTab;
export default { mount: mountSettingsTab };

