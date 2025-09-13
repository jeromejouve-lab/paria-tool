import { settingsLoad, settingsSave, setProxyConfig, setWorkContext, currentWorkId } from '../../core/settings.js';
import { updateStorageBadge, ensurePreRestoreBudget, consolidateAfterRestore, commitWithEviction } from '../../core/budget.js';
import { combineAt } from '../../core/time.js';
import { diag, gitFind, gdrvFind, gitLoad, gdrvLoad, loadFromGoogle } from '../../core/net.js';
import { mergeIntoCurrentService } from '../../core/store.js';
import { appendJournal } from '../../domain/journal.js';

export function mountSettingsTab(host){
  host.innerHTML = `
    <h2>Réglages & Restauration</h2>
    <fieldset>
      <legend>Proxy Apps Script</legend>
      <div class="row">
        <div><label>URL Apps Script</label><input id="GAS_URL" placeholder="https://script.google.com/macros/s/XXX/exec"></div>
        <div><label>Secret</label><input id="PROXY_SECRET" placeholder="******"></div>
      </div>
      <div class="row">
        <div><label>Repo Git</label><input id="GH_REPO" placeholder="owner/repo"></div>
        <div><label>Auto-sync</label>
          <select id="AUTO_SYNC"><option value="true">Activé</option><option value="false">Désactivé</option></select>
        </div>
      </div>
      <div class="btns">
        <button id="btnSaveCfg">Sauver la conf</button>
        <span class="muted small">diag: <span id="diagState" class="pill">—</span></span>
      </div>
    </fieldset>

    <fieldset>
      <legend>Work ID & Date</legend>
      <div class="row">
        <div><label>Client</label><input id="CLIENT" placeholder="ACME"></div>
        <div><label>Service</label><input id="SERVICE" placeholder="Compta"></div>
      </div>
      <div class="row">
        <div><label>Jour (YYYY-MM-DD)</label><input id="DATE" placeholder="2025-08-31"></div>
        <div><label>Heure (HH:mm, optionnel)</label><input id="TIME" placeholder="10:50"></div>
      </div>
      <div class="btns">
        <button id="btnLinkWID" class="secondary">Lier ce WorkID</button>
        <button id="btnPropose">Proposer</button>
        <button id="btnRestore">Restaurer</button>
        <span id="gitState" class="pill mono">—</span>
      </div>
      <div class="small muted">WorkID actuel: <span id="widNow" class="mono">—</span></div>
    </fieldset>

    <fieldset>
      <legend>Charger depuis Google (état courant)</legend>
      <div class="btns">
        <button id="btnLoad">Charger</button>
        <span id="loadState" class="pill mono">—</span>
      </div>
    </fieldset>
  `;

  const st=settingsLoad();
  host.querySelector('#GAS_URL').value=st.proxy.url;
  host.querySelector('#PROXY_SECRET').value=st.proxy.secret;
  host.querySelector('#GH_REPO').value=st.proxy.repo;
  host.querySelector('#AUTO_SYNC').value=String(st.proxy.auto_sync!==false);
  host.querySelector('#CLIENT').value=st.work.client||'ACME';
  host.querySelector('#SERVICE').value=st.work.service||'Compta';
  host.querySelector('#DATE').value=st.ui.date||st.work.restore_at?.slice(0,10)||'';
  host.querySelector('#TIME').value=st.ui.time||(st.work.restore_at?.split('T')[1]||'');
  host.querySelector('#widNow').textContent=currentWorkId()||'—';
  updateStorageBadge();

  host.querySelector('#btnSaveCfg').onclick=async ()=>{
    setProxyConfig({
      url:host.querySelector('#GAS_URL').value,
      secret:host.querySelector('#PROXY_SECRET').value,
      repo:host.querySelector('#GH_REPO').value,
      auto_sync:host.querySelector('#AUTO_SYNC').value==='true'
    });
    settingsSave({ui:{date:host.querySelector('#DATE').value,time:host.querySelector('#TIME').value}});
    const j=await diag(); host.querySelector('#diagState').textContent=(j&&j.ok)?'ok':(j?.error||'ko');
  };

  host.querySelector('#btnLinkWID').onclick=()=>{
    const client=host.querySelector('#CLIENT').value.trim()||'ACME';
    const service=host.querySelector('#SERVICE').value.trim()||'Compta';
    const dateISO=host.querySelector('#DATE').value.trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)){alert('Date invalide');return;}
    const work_id=`${client}|${service}|${dateISO}`;
    setWorkContext({client,service,work_id,restore_at:combineAt(dateISO,host.querySelector('#TIME').value.trim())});
    host.querySelector('#widNow').textContent=currentWorkId();
  };

  host.querySelector('#btnPropose').onclick=async ()=>{
    const wid=currentWorkId(); if(!wid){alert('Lier un WorkID');return;}
    const at=combineAt(host.querySelector('#DATE').value.trim(),host.querySelector('#TIME').value.trim());
    host.querySelector('#gitState').textContent='Recherche…';
    let j=await gitFind(wid,at); if(!j||!j.ok||!j.hit) j=await gdrvFind(wid,at);
    if(!j||!j.ok||!j.hit){host.querySelector('#gitState').textContent='Aucun snapshot';return;}
    window.__hit=j.hit; const t=new Date(j.hit.ts||Date.now()).toLocaleString(); host.querySelector('#gitState').textContent=`Hit: ${t}`;
  };

  host.querySelector('#btnRestore').onclick=async ()=>{
    const wid=currentWorkId(); if(!wid){alert('Lier un WorkID');return;}
    const at=combineAt(host.querySelector('#DATE').value.trim(),host.querySelector('#TIME').value.trim());
    host.querySelector('#gitState').textContent='Préparation…';
    let hit=window.__hit; if(!hit){ let j=await gitFind(wid,at); if(!j||!j.ok||!j.hit) j=await gdrvFind(wid,at); if(!j||!j.ok||!j.hit){host.querySelector('#gitState').textContent='Aucun snapshot';return;} hit=window.__hit=j.hit; }
    await ensurePreRestoreBudget(); host.querySelector('#gitState').textContent='Chargement…';
    let ok=false,resp=null; if(hit.sha||hit.json_path){resp=await gitLoad(wid,hit.sha,hit.json_path); ok=resp&&resp.ok;}
    if(!ok&&hit.id){resp=await gdrvLoad(wid,hit.id); ok=resp&&resp.ok;} if(!ok){host.querySelector('#gitState').textContent='Erreur chargement';return;}
    mergeIntoCurrentService(resp.state||resp.data||{}); await consolidateAfterRestore();
    appendJournal({ts:Date.now(),type:'load',target:{kind:'state',id:'*'},snapshot:{source:(hit.sha||hit.json_path)?'git':'gdrive',...hit}});
    const t=new Date(hit.ts||Date.now()).toLocaleString(); host.querySelector('#gitState').textContent=`Restauré: ${t}`;
  };

  host.querySelector('#btnLoad').onclick=async ()=>{
    const wid=currentWorkId(); if(!wid){alert('Lier un WorkID');return;}
    host.querySelector('#loadState').textContent='Chargement…';
    const j=await loadFromGoogle(wid);
    if(!j||!j.ok||!j.data){host.querySelector('#loadState').textContent=j?.error||'ko'; return;}
    mergeIntoCurrentService(j.data); await commitWithEviction(); appendJournal({ts:Date.now(),type:'load',target:{kind:'state',id:'*'}});
    host.querySelector('#loadState').textContent='OK';
  };
}
