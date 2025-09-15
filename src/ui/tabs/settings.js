// src/ui/tabs/settings.js — injection par JS (render + bind)
import { settingsLoad, settingsSave, setWorkContext } from '../../core/settings.js';
import { diag } from '../../core/net.js';
// facultatif si présent dans ton code :
let bootstrapWorkspaceIfNeeded = null;
try {
  ({ bootstrapWorkspaceIfNeeded } = await import('../../domain/reducers.js'));
} catch { /* ok si absent */ }

function html() {
  return `
  <div class="settings">
    <section class="block">
      <h3>Contexte de travail</h3>
      <div class="row">
        <label>Client<br><input id="CLIENT" type="text" /></label>
        <label>Service<br><input id="SERVICE" type="text" /></label>
      </div>
      <div class="row">
        <label>Date<br><input id="DATE" type="date" /></label>
        <label>Heure<br><input id="TIME" type="time" /></label>
      </div>
      <div class="row">
        <button id="btnLinkWID" type="button">Lier au WID</button>
        <button id="btnPropose" type="button">Proposer WID</button>
        <div>WID: <strong id="widNow"></strong></div>
      </div>
    </section>

    <section class="block">
      <h3>Connexion / Proxy</h3>
      <div class="row">
        <label>Proxy GAS URL<br>
          <input id="GAS_URL" type="url" placeholder="https://script.google.com/macros/s/.../exec" />
        </label>
        <label>Proxy Secret<br>
          <input id="PROXY_SECRET" type="text" placeholder="token" />
        </label>
      </div>
    </section>

    <section class="block">
      <h3>Sources distantes</h3>
      <div class="row">
        <label>GitHub Repo / Endpoint<br>
          <input id="GH_REPO" type="url" placeholder="https://github.com/... ou https://…/git" />
        </label>
      </div>
      <div class="row">
        <label><input id="AUTO_SYNC" type="checkbox" /> Auto-sync snapshots</label>
      </div>
      <div class="row">
        <button id="btnSnapshotNow" type="button">Snapshot maintenant</button>
        <button id="btnLoad" type="button">Charger snapshot…</button>
        <button id="btnRestore" type="button">Restaurer dernier</button>
      </div>
      <pre id="loadState" class="mono-pre" style="white-space:pre-wrap;"></pre>
    </section>

    <section class="block">
      <div class="row">
        <button id="btnSaveCfg" type="button">Sauver la conf</button>
        <button id="btnDiag" type="button">Diag</button>
      </div>
      <pre id="diagState" class="mono-pre" style="white-space:pre-wrap;"></pre>
    </section>
  </div>`;
}

export function mountSettingsTab(host = document.getElementById('tab-settings')) {
  if (!host) return;
  host.innerHTML = html(); // injection du formulaire

  const s = settingsLoad();
  const $ = (sel)=>host.querySelector(sel);

  // Bind champs
  $('#CLIENT').value = s.client || '';
  $('#SERVICE').value = s.service || '';
  $('#GAS_URL').value = (s?.endpoints?.proxy?.url || s?.proxy?.url) || '';
  $('#PROXY_SECRET').value = (s?.endpoints?.proxy?.token || s?.proxy?.token) || '';
  $('#GH_REPO').value = (s?.endpoints?.git || s?.connections?.endpoints?.git?.url) || '';
  $('#AUTO_SYNC').checked = !!s?.flags?.auto_sync;

  const today = new Date();
  const pad = v => String(v).padStart(2,'0');
  $('#DATE').value = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;
  $('#TIME').value = `${pad(today.getHours())}:${pad(today.getMinutes())}`;

  const refreshWid = ()=>{
    const wid = `${$('#CLIENT').value||''}::${$('#SERVICE').value||''}::${$('#DATE').value||''}T${$('#TIME').value||''}`;
    $('#widNow').textContent = wid;
  };
  ['CLIENT','SERVICE','DATE','TIME'].forEach(id => $('#'+id).addEventListener('input', refreshWid));
  refreshWid();

  $('#btnPropose').onclick = refreshWid;
  $('#btnLinkWID').onclick = async ()=>{ await setWorkContext({ client:$('#CLIENT').value, service:$('#SERVICE').value }); refreshWid(); };

  $('#btnSaveCfg').onclick = async ()=>{
    const client = $('#CLIENT').value.trim();
    const service = $('#SERVICE').value.trim();
    const proxyUrl = $('#GAS_URL').value.trim();
    const proxyTok = $('#PROXY_SECRET').value.trim();
    const git = $('#GH_REPO').value.trim();
    const autos = $('#AUTO_SYNC').checked;

    await settingsSave({
      client, service,
      endpoints:{ git, proxy:{ url:proxyUrl, token:proxyTok } },
      proxy:{ url:proxyUrl, token:proxyTok },
      connections:{ client, service, endpoints:{ git:{url:git}, proxy:{ url:proxyUrl, token:proxyTok } }, proxy:{ url:proxyUrl, token:proxyTok } },
      flags:{ auto_sync:autos }
    });
    await setWorkContext({ client, service });
    if (typeof bootstrapWorkspaceIfNeeded === 'function') {
      try { await bootstrapWorkspaceIfNeeded(client,service); } catch {}
    }
    $('#diagState').textContent = '✅ Config sauvegardée.';
  };

  $('#btnDiag').onclick = async ()=>{
    try {
      const r = await diag();
      $('#diagState').textContent = JSON.stringify(r, null, 2);
    } catch (e) {
      $('#diagState').textContent = `❌ Diag: ${e?.message||e}`;
    }
  };

  // boutons Snapshot/Load/Restore: branchés quand tes endpoints seront prêts
  $('#btnSnapshotNow').onclick = ()=>{ $('#loadState').textContent = 'Snapshot : à câbler (core/net).'; };
  $('#btnLoad').onclick        = ()=>{ $('#loadState').textContent = 'Load : à câbler (core/net).'; };
  $('#btnRestore').onclick     = ()=>{ $('#loadState').textContent = 'Restore : à câbler (journal).'; };
}

export const mount = mountSettingsTab;
export default { mount };
