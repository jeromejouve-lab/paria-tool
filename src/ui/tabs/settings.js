// src/ui/tabs/settings.js — réintégration du formulaire "Réglages" (IDs du zip)
// Injecte le markup (IDs d'origine) et branche Sauver / Diag / WID / Snapshot.
// Ne plante pas si des champs sont vides.

import { settingsLoad, settingsSave, setWorkContext } from '../../core/settings.js';
import { diag, saveToGit, saveToGoogle, listGitSnapshots, listDriveSnapshots, loadFromGit, loadFromGoogle } from '../../core/net.js';

const $ = (sel, from=document) => from.querySelector(sel);

function hostNode() {
  return $('#tab-settings') || document.querySelector('[data-tab="settings"]') || document.body;
}

function html() {
  // IDs d’origine vus dans le zip :
  // GAS_URL, PROXY_SECRET, GH_REPO, AUTO_SYNC
  // CLIENT, SERVICE, DATE, TIME, widNow
  // btnSaveCfg, diagState, btnLinkWID, btnPropose, btnRestore, btnLoad, btnSnapshotNow, loadState
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
        <label>Proxy GAS URL<br><input id="GAS_URL" type="url" placeholder="https://script.google.com/macros/s/…/exec" /></label>
        <label>Proxy Secret<br><input id="PROXY_SECRET" type="text" placeholder="token" /></label>
      </div>
    </section>

    <section class="block">
      <h3>Sources distantes</h3>
      <div class="row">
        <label>GitHub Repo / Endpoint<br><input id="GH_REPO" type="url" placeholder="https://github.com/… ou https://…/git" /></label>
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
  </div>
  `;
}

function norm(s={}) {
  const S = v => (typeof v === 'string' ? v : '');
  const pickUrl = (v) => typeof v === 'string' ? v : (v && typeof v==='object' ? S(v.url) : '');
  const top = {
    client: S(s.client), service: S(s.service),
    endpoints: {
      proxy: { url: S(s?.endpoints?.proxy?.url) || S(s?.proxy?.url), token: S(s?.endpoints?.proxy?.token) || S(s?.proxy?.token) },
      git:   S(s?.endpoints?.git),
    },
    flags: { auto_sync: !!s?.flags?.auto_sync }
  };
  const connections = {
    client: S(s?.connections?.client) || top.client,
    service: S(s?.connections?.service) || top.service,
    endpoints: {
      proxy: { url: top.endpoints.proxy.url, token: top.endpoints.proxy.token },
      git:   { url: pickUrl(s?.connections?.endpoints?.git) || top.endpoints.git }
    }
  };
  return { ...top, connections };
}

function widFrom({client, service, dateStr, timeStr}) {
  const d = (dateStr || new Date().toISOString().slice(0,10));
  const t = (timeStr || new Date().toTimeString().slice(0,5));
  return `${client||''}::${service||''}::${d}T${t}`;
}

async function runDiag(outEl) {
  try {
    const r = await diag();
    if (outEl) outEl.textContent = JSON.stringify(r, null, 2);
  } catch (e) {
    if (outEl) outEl.textContent = `❌ Diag: ${e?.message || e}`;
  }
}

async function snapshotNow(outEl) {
  try {
    // on tente Git puis Drive, silencieux si non configuré
    const g1 = await saveToGit({ when: Date.now() }).catch(()=>({ok:false}));
    const g2 = await saveToGoogle({ when: Date.now() }).catch(()=>({ok:false}));
    const txt = `Snapshot: git=${g1?.ok?'ok':'ko'} / drive=${g2?.ok?'ok':'ko'}`;
    if (outEl) outEl.textContent = txt;
  } catch (e) {
    if (outEl) outEl.textContent = `❌ Snapshot: ${e?.message || e}`;
  }
}

async function loadLatest(outEl) {
  try {
    const git = await listGitSnapshots().catch(()=>[]);
    const drv = await listDriveSnapshots().catch(()=>[]);
    const pick = (arr)=>arr && arr.length ? arr[arr.length-1] : null;
    const last = pick(git) || pick(drv);
    if (!last) { if (outEl) outEl.textContent = '— Aucun snapshot.'; return; }
    const blob = last.source==='git' ? await loadFromGit(last.id) : await loadFromGoogle(last.id);
    if (outEl) outEl.textContent = blob ? '✅ Chargé (voir console).' : '⚠️ Snapshot introuvable';
    if (blob) console.log('Loaded snapshot:', blob);
  } catch (e) {
    if (outEl) outEl.textContent = `❌ Load: ${e?.message || e}`;
  }
}

export function mountSettingsTab(host) {
  const root = host || hostNode();
  if (!root) return;

  // (1) injecter le formulaire d’origine
  root.innerHTML = html();

  // (2) peupler champs depuis settings
  const s = norm(settingsLoad());

  const $CLIENT = $('#CLIENT', root);
  const $SERVICE = $('#SERVICE', root);
  const $DATE = $('#DATE', root);
  const $TIME = $('#TIME', root);
  const $widNow = $('#widNow', root);

  const $GAS_URL = $('#GAS_URL', root);
  const $PROXY_SECRET = $('#PROXY_SECRET', root);
  const $GH_REPO = $('#GH_REPO', root);
  const $AUTO_SYNC = $('#AUTO_SYNC', root);

  const $btnSaveCfg = $('#btnSaveCfg', root);
  const $btnDiag = $('#btnDiag', root);
  const $diagState = $('#diagState', root);

  const $btnLinkWID = $('#btnLinkWID', root);
  const $btnPropose = $('#btnPropose', root);

  const $btnRestore = $('#btnRestore', root);
  const $btnLoad = $('#btnLoad', root);
  const $btnSnapshotNow = $('#btnSnapshotNow', root);
  const $loadState = $('#loadState', root);

  // valeurs initiales
  if ($CLIENT)  $CLIENT.value  = s.connections.client || '';
  if ($SERVICE) $SERVICE.value = s.connections.service || '';
  const today = new Date();
  if ($DATE) $DATE.value = new Date(today.getTime() - today.getTimezoneOffset()*60000).toISOString().slice(0,10);
  if ($TIME) $TIME.value = today.toTimeString().slice(0,5);
  if ($widNow) $widNow.textContent = widFrom({ client:$CLIENT?.value, service:$SERVICE?.value, dateStr:$DATE?.value, timeStr:$TIME?.value });

  if ($GAS_URL) $GAS_URL.value = s.connections.endpoints.proxy.url || '';
  if ($PROXY_SECRET) $PROXY_SECRET.value = s.connections.endpoints.proxy.token || '';
  if ($GH_REPO) $GH_REPO.value = (s.connections.endpoints.git && s.connections.endpoints.git.url) || s.endpoints.git || '';
  if ($AUTO_SYNC) $AUTO_SYNC.checked = !!s.flags?.auto_sync;

  // (3) Handlers UI
  const refreshWid = () => {
    if ($widNow) $widNow.textContent = widFrom({
      client: $CLIENT?.value, service: $SERVICE?.value, dateStr: $DATE?.value, timeStr: $TIME?.value
    });
  };
  [$CLIENT,$SERVICE,$DATE,$TIME].forEach(el => el && el.addEventListener('input', refreshWid));

  if ($btnPropose) $btnPropose.onclick = refreshWid;

  if ($btnLinkWID) $btnLinkWID.onclick = async () => {
    // lie le contexte courant (client/service) — la date/heure sert pour le WID d’affichage
    try { await setWorkContext({ client:$CLIENT?.value||'', service:$SERVICE?.value||'' }); } catch {}
    refreshWid();
  };

  if ($btnSaveCfg) $btnSaveCfg.onclick = async () => {
    const client = ($CLIENT?.value||'').trim();
    const service = ($SERVICE?.value||'').trim();
    const proxyUrl = ($GAS_URL?.value||'').trim();
    const proxyTok = ($PROXY_SECRET?.value||'').trim();
    const git = ($GH_REPO?.value||'').trim();
    const auto_sync = !!$AUTO_SYNC?.checked;

    try {
      await settingsSave({
        client, service,
        endpoints: { git, proxy:{ url: proxyUrl, token: proxyTok } },
        proxy: { url: proxyUrl, token: proxyTok },
        connections: {
          client, service,
          endpoints: { git:{ url: git }, proxy:{ url: proxyUrl, token: proxyTok } },
          proxy:{ url: proxyUrl, token: proxyTok }
        },
        flags: { auto_sync }
      });
      if ($diagState) $diagState.textContent = '✅ Config sauvegardée.';
    } catch (e) {
      if ($diagState) $diagState.textContent = `❌ Save: ${e?.message||e}`;
    }
  };

  if ($btnDiag) $btnDiag.onclick = () => runDiag($diagState);

  if ($btnSnapshotNow) $btnSnapshotNow.onclick = () => snapshotNow($loadState);

  if ($btnLoad) $btnLoad.onclick = () => loadLatest($loadState);

  if ($btnRestore) $btnRestore.onclick = async () => {
    // “Restaurer dernier” = charge le dernier snapshot dispo (git/drive)
    await loadLatest($loadState);
  };
}

export const mount = mountSettingsTab;
export default { mount: mountSettingsTab };
