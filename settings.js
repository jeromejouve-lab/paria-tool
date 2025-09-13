import { settingsLoad, settingsSave, setProxyConfig, setWorkContext, currentWorkId } from '../../core/settings.js';
import { updateStorageBadge, commitWithEviction } from '../../core/budget.js';
import { readClientBlob, mergeIntoCurrentService } from '../../core/store.js';
import { loadFromGoogle, gitFind, gitLoad, gdrvFind, gdrvLoad, diag } from '../../core/net.js';
import { combineAt } from '../../core/time.js';

const $ = sel => document.querySelector(sel);

export function mountSettingsTab(){
  const st = settingsLoad();

  // init fields
  $('#GAS_URL').value = st.proxy.url;
  $('#PROXY_SECRET').value = st.proxy.secret;
  $('#GH_REPO').value = st.proxy.repo;
  $('#AUTO_SYNC').value = String(st.proxy.auto_sync!==false);
  $('#CLIENT').value = st.work.client||'ACME';
  $('#SERVICE').value = st.work.service||'Compta';
  $('#DATE').value = st.ui.date || st.work.restore_at?.slice(0,10) || '';
  $('#TIME').value = st.ui.time || (st.work.restore_at?.split('T')[1]||'');
  $('#widNow').textContent = currentWorkId() || '—';

  updateStorageBadge();

  // save config
  $('#btnSaveCfg').onclick = async ()=>{
    setProxyConfig({
      url: $('#GAS_URL').value,
      secret: $('#PROXY_SECRET').value,
      repo: $('#GH_REPO').value,
      auto_sync: $('#AUTO_SYNC').value === 'true'
    });
    settingsSave({ ui:{ date: $('#DATE').value, time: $('#TIME').value }});
    const j = await diag();
    $('#diagState').textContent = j && j.ok ? 'ok' : (j.error||'ko');
  };

  // link WID
  $('#btnLinkWID').onclick = ()=>{
    const client = $('#CLIENT').value.trim()||'ACME';
    const service = $('#SERVICE').value.trim()||'Compta';
    const dateISO = $('#DATE').value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)){ alert('Date invalide'); return; }
    const work_id = `${client}|${service}|${dateISO}`;
    setWorkContext({ client, service, work_id, restore_at: combineAt(dateISO, $('#TIME').value.trim()) });
    $('#widNow').textContent = currentWorkId();
  };

  // propose (git then gdrive)
  $('#btnPropose').onclick = async ()=>{
    const wid = currentWorkId(); if (!wid){ alert('Lier un WorkID d\'abord'); return; }
    const at = combineAt($('#DATE').value.trim(), $('#TIME').value.trim());
    $('#gitState').textContent = 'Recherche…';
    let j = await gitFind(wid, at);
    if (!j || !j.ok || !j.hit) j = await gdrvFind(wid, at);
    if (!j || !j.ok || !j.hit){ $('#gitState').textContent = 'Aucun snapshot'; return; }
    window.__hit = j.hit; // { ts, sha|json_path|id }
    const t = new Date(j.hit.ts||Date.now()).toLocaleString();
    $('#gitState').textContent = `Hit: ${t}`;
  };

  // restore (git then gdrive) + budget
  $('#btnRestore').onclick = async ()=>{
    const wid = currentWorkId(); if (!wid){ alert('Lier un WorkID d\'abord'); return; }
    const at = combineAt($('#DATE').value.trim(), $('#TIME').value.trim());
    $('#gitState').textContent = 'Préparation…';
    // resolve hit if needed
    let hit = window.__hit;
    if (!hit){
      let j = await gitFind(wid, at);
      if (!j || !j.ok || !j.hit) j = await gdrvFind(wid, at);
      if (!j || !j.ok || !j.hit){ $('#gitState').textContent = 'Aucun snapshot'; return; }
      hit = window.__hit = j.hit;
    }
    $('#gitState').textContent = 'Chargement…';
    let ok=false, resp=null;
    if (hit.sha || hit.json_path){ resp = await gitLoad(wid, hit.sha, hit.json_path); ok = resp && resp.ok; }
    if (!ok && hit.id){ resp = await gdrvLoad(wid, hit.id); ok = resp && resp.ok; }
    if (!ok){ $('#gitState').textContent = 'Erreur chargement'; return; }
    // merge + commit budget
    mergeIntoCurrentService(resp.state||resp.data||{});
    commitWithEviction();
    const t = new Date(hit.ts||Date.now()).toLocaleString();
    $('#gitState').textContent = `Restauré: ${t}`;
  };

  // load from google (current state)
  $('#btnLoad').onclick = async ()=>{
    const wid = currentWorkId(); if (!wid){ alert('Lier un WorkID d\'abord'); return; }
    $('#loadState').textContent = 'Chargement…';
    const j = await loadFromGoogle(wid);
    if (!j || !j.ok || !j.data){ $('#loadState').textContent = j?.error||'ko'; return; }
    mergeIntoCurrentService(j.data);
    commitWithEviction();
    $('#loadState').textContent = 'OK';
  };
}
