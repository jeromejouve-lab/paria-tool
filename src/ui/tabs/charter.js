import { getCharter, saveCharter, softDeleteCharter, restoreCharter } from '../../domain/reducers.js';

export function mountCharterTab(host){
  const ch=getCharter();
  host.innerHTML = `
    <h2>Charter</h2>
    <div class="row">
      <div><label>Titre</label><input id="chTitle" placeholder="Titre du charter"></div>
      <div><label>Tags (séparés par ,)</label><input id="chTags" placeholder="vision,notes"></div>
    </div>
    <label>Contenu</label><textarea id="chContent" placeholder="Contenu…"></textarea>
    <div class="btns">
      <button id="btnChSave">Enregistrer</button>
      <button id="btnChDelete" class="secondary">Supprimer (soft)</button>
      <button id="btnChRestore" class="secondary">Restaurer</button>
      <button id="btnChExportMD" class="secondary">Export MD</button>
      <button id="btnChExportHTML" class="secondary">Export HTML</button>
      <button id="btnChExportJSON" class="secondary">Export JSON</button>
    </div>
  `;
  host.querySelector('#chTitle').value=ch.title||'';
  host.querySelector('#chContent').value=ch.content||'';
  host.querySelector('#chTags').value=(ch.tags||[]).join(',');

  const download=(blob,name)=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href); };

  host.querySelector('#btnChSave').onclick=()=>{saveCharter({title:host.querySelector('#chTitle').value,content:host.querySelector('#chContent').value,tags:(host.querySelector('#chTags').value||'').split(',').map(s=>s.trim()).filter(Boolean)}); alert('Charter enregistré');};
  host.querySelector('#btnChDelete').onclick=()=>{softDeleteCharter(); alert('Charter supprimé (soft)');};
  host.querySelector('#btnChRestore').onclick=()=>{restoreCharter(); alert('Charter restauré');};
  host.querySelector('#btnChExportMD').onclick=()=>{const md=`# ${host.querySelector('#chTitle').value}\n\n${host.querySelector('#chContent').value}`; download(new Blob([md],{type:'text/markdown'}),'charter.md');};
  host.querySelector('#btnChExportHTML').onclick=()=>{const esc=s=>String(s).replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m])); const html=`<!doctype html><meta charset="utf-8"><article><h1>${esc(host.querySelector('#chTitle').value)}</h1><div>${esc(host.querySelector('#chContent').value).replace(/\n/g,'<br>')}</div></article>`; download(new Blob([html],{type:'text/html'}),'charter.html');};
  host.querySelector('#btnChExportJSON').onclick=()=>download(new Blob([JSON.stringify(getCharter(),null,2)],{type:'application/json'}),'charter.json');
}
