import { getSettings, saveSettings, getWorkId } from '../../core/settings.js';
import { getBudget } from '../../core/budget.js';
import { ensureBaseBlob } from '../../core/store.js';

export function mountSettingsTab(host){
  const s=getSettings();
  host.innerHTML=`
    <h2>Réglages</h2>
    <div class="editor">
      <div class="row">
        <div><label>Client</label><input id="client" value="${s.client}"></div>
        <div><label>Service</label><input id="service" value="${s.service}"></div>
      </div>
      <div class="row">
        <div><label>Endpoint LLM</label><input id="llm" value="${s.endpoints.llm||''}"></div>
        <div><label>Git</label><input id="git" value="${s.endpoints.git||''}"></div>
        <div><label>Google</label><input id="gdrv" value="${s.endpoints.gdrive||''}"></div>
      </div>
      <div class="row">
        <div><label>Nom (branding)</label><input id="myname" value="${s.branding.my_name||''}"></div>
        <div><label>Logo URL</label><input id="mylogo" value="${s.branding.my_logo_url||''}"></div>
        <div><label>Adresse</label><input id="myaddr" value="${s.branding.my_address||''}"></div>
      </div>
      <div class="btns">
        <button id="save">Enregistrer</button>
        <button id="reinit" class="secondary">Réinitialiser le blob courant</button>
      </div>
      <div class="small muted">WorkId: <code id="workId"></code> — Stockage: <span id="quota"></span></div>
    </div>
  `;
  const refresh=()=>{
    const b=getBudget(); host.querySelector('#quota').textContent=`${Math.round(b.usage*100)}%`;
    host.querySelector('#workId').textContent=getWorkId(getSettings());
  };
  host.querySelector('#save').onclick=()=>{
    saveSettings({
      client: host.querySelector('#client').value.trim(),
      service: host.querySelector('#service').value.trim(),
      endpoints: { llm:host.querySelector('#llm').value.trim(), git:host.querySelector('#git').value.trim(), gdrive:host.querySelector('#gdrv').value.trim() },
      branding: { my_name:host.querySelector('#myname').value.trim(), my_logo_url:host.querySelector('#mylogo').value.trim(), my_address:host.querySelector('#myaddr').value.trim() }
    });
    refresh();
  };
  host.querySelector('#reinit').onclick=()=>{ ensureBaseBlob(); refresh(); };
  refresh();
}

/*
INDEX ui/tabs/settings.js:
- mountSettingsTab(host)
- imports: getSettings, saveSettings, getWorkId, getBudget, ensureBaseBlob
*/
