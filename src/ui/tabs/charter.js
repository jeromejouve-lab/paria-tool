import {
  getCharter, saveCharter, softDeleteCharter, restoreCharter,
  addAItoCharter, toggleCharterAIStatus, setCharterAISelected,
  importCharterSelectedToCurrentCard, removeCharterAI
} from '../../domain/reducers.js';


const PARIA = ['P','A','R','I','A2']; // labels génériques (on pourra renommer finement plus tard)

export function mountCharterTab(host){
  const ch=getCharter();
  host.innerHTML = `
    <h2>Charter</h2>
    <div class="row">
      <div><label>Titre</label><input id="chTitle" placeholder="Titre du charter"></div>
      <div><label>Tags (séparés par ,)</label><input id="chTags" placeholder="vision,notes"></div>
    </div>
    <label>Contenu</label><textarea id="chContent" placeholder="Contenu…"></textarea>

    <fieldset style="margin-top:1rem">
      <legend>Analyse IA (PARIA)</legend>
      <div class="btns" id="pariaChecklist"></div>
      <div class="btns">
        <input id="pariaContext" placeholder="Contexte additionnel (optionnel)" />
        <button id="btnGenParia">Générer</button>
        <button id="btnInsertToCard" class="secondary">Insérer sélectionnées → card courante</button>
      </div>
      <div id="pariaList" class="list" style="margin-top:.5rem"></div>
    </fieldset>

    <div class="btns">
      <button id="btnChSave">Enregistrer</button>
      <button id="btnChDelete" class="secondary">Supprimer (soft)</button>
      <button id="btnChRestore" class="secondary">Restaurer</button>
      <button id="btnChExportMD" class="secondary">Export MD</button>
      <button id="btnChExportHTML" class="secondary">Export HTML</button>
      <button id="btnChExportJSON" class="secondary">Export JSON</button>
    </div>
  `;

  // init champs
  host.querySelector('#chTitle').value=ch.title||'';
  host.querySelector('#chContent').value=ch.content||'';
  host.querySelector('#chTags').value=(ch.tags||[]).join(',');

  // checklist PARIA
  const cl=host.querySelector('#pariaChecklist');
  const all=document.createElement('button'); all.className='secondary'; all.textContent='Tout cocher';
  const boxes=[];
  PARIA.forEach(label=>{
    const id='chk_'+label;
    const wrap=document.createElement('label'); wrap.className='pill'; wrap.style.padding='.35rem .5rem'; wrap.style.cursor='pointer';
    wrap.innerHTML=`<input type="checkbox" id="${id}" style="margin-right:.35rem">${label}`;
    cl.appendChild(wrap); boxes.push(()=>host.querySelector('#'+id));
  });
  all.onclick=()=>boxes.forEach(get=>{get().checked=true;});
  cl.appendChild(all);

  // rendu des propositions IA existantes
  function renderAI(){
    const list=host.querySelector('#pariaList'); list.innerHTML='';
    const ai=(getCharter().ai||[]);
    if(!ai.length){ list.innerHTML='<div class="muted">Aucune proposition IA</div>'; return; }
    ai.slice().reverse().forEach(a=>{
      const row=document.createElement('div'); row.className='card';
      const top=document.createElement('div'); top.style.display='flex'; top.style.justifyContent='space-between';
      top.innerHTML=`<strong>[${a.component}]</strong><span class="small muted">${new Date(a.ts).toLocaleString()}</span>`;
      const text=document.createElement('div'); text.className='small mono-pre'; text.textContent=a.text;
      const status = document.createElement('div');
      status.className = 'small muted';
      status.textContent =
        (a.status==='hold') ? 'À réfléchir' :
        (a.status==='ok')   ? 'Validé' :
        (a.status==='drop') ? 'Rejeté' : 'À traiter';
      const btns=document.createElement('div'); btns.className='btns';
      const chk=document.createElement('input'); chk.type='checkbox'; chk.checked=!!a.selected; chk.onchange=()=>{ setCharterAISelected(a.id, chk.checked); };
      const ok=document.createElement('button'); ok.className='secondary'; ok.textContent='✅'; ok.title='valider'; ok.onclick=()=>{ toggleCharterAIStatus(a.id,'ok'); renderAI(); };
      const hold=document.createElement('button'); hold.className='secondary'; hold.textContent='💭'; hold.title='à réfléchir'; hold.onclick=()=>{ toggleCharterAIStatus(a.id,'hold'); renderAI(); };
      const drop=document.createElement('button'); drop.className='secondary'; drop.textContent='🗑️'; drop.title='rejeter'; drop.onclick=()=>{ removeCharterAI(a.id); renderAI(); };
      btns.append(chk, ok, hold, drop);
      row.append(top,text,status,btns); list.appendChild(row);

    });
  }
  renderAI();

  // générateur (heuristique locale, 100% offline ; remplaçable par un appel LLM plus tard)
  function generatePariaProposals(content, ctx, components){
    const base = (content||'').trim();
    const ideas = (txt)=>[
      `Diagnostic: ${txt.slice(0,80)||'contexte'}…`,
      `Risque: risque principal à mitiger sur ${txt.slice(0,50)||'le périmètre'}`,
      `Action: quick win prioritaire (30j)`,
      `KPI: indicateur simple à suivre`,
    ];
    const out=[];
    components.forEach(c=>{
      const lines = ideas(base + (ctx?(' / '+ctx):''));
      lines.forEach(t=> out.push({component:c,text:t,origin:'heuristic',status:'todo',selected:false}));
    });
    return out;
  }

  // events IA
  host.querySelector('#btnGenParia').onclick=()=>{
    const content=host.querySelector('#chContent').value;
    const ctx=host.querySelector('#pariaContext').value;
    const comps = PARIA.filter(lbl => host.querySelector('#chk_'+lbl).checked);
    if (!comps.length){ alert('Sélectionner au moins un composant PARIA.'); return; }
    const props = generatePariaProposals(content, ctx, comps);
    props.forEach(p=> addAItoCharter(p));
    renderAI();
  };

  host.querySelector('#btnInsertToCard').onclick=()=>{
    const ok = importCharterSelectedToCurrentCard();
    alert(ok ? 'Propositions insérées dans la card courante.' : 'Aucune card courante ou aucune proposition sélectionnée.');
  };

  // export/download helpers
  const download=(blob,name)=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href); };

  // CRUD charter
  host.querySelector('#btnChSave').onclick=()=>{saveCharter({
    title:host.querySelector('#chTitle').value,
    content:host.querySelector('#chContent').value,
    tags:(host.querySelector('#chTags').value||'').split(',').map(s=>s.trim()).filter(Boolean)
  }); alert('Charter enregistré');};
  host.querySelector('#btnChDelete').onclick = () => {
    if (!confirm('Supprimer le Charter ? (soft-delete)')) return;
    softDeleteCharter();
    // feedback UI discret
    const ed = host.querySelector('.charter-editor') || host;
    const info = document.createElement('div');
    info.className = 'charter-empty-hint';
    info.textContent = 'Charter supprimé (soft). Vous pouvez le restaurer.';
    (host.firstElementChild || host).before(info);
  };

  host.querySelector('#btnChRestore').onclick=()=>{restoreCharter(); alert('Charter restauré');};
  host.querySelector('#btnChExportMD').onclick=()=>{const md=`# ${host.querySelector('#chTitle').value}\n\n${host.querySelector('#chContent').value}`; download(new Blob([md],{type:'text/markdown'}),'charter.md');};
  host.querySelector('#btnChExportHTML').onclick=()=>{const esc=s=>String(s).replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m])); const html=`<!doctype html><meta charset="utf-8"><article><h1>${esc(host.querySelector('#chTitle').value)}</h1><div>${esc(host.querySelector('#chContent').value).replace(/\n/g,'<br>')}</div></article>`; download(new Blob([html],{type:'text/html'}),'charter.html');};
  host.querySelector('#btnChExportJSON').onclick=()=>download(new Blob([JSON.stringify(getCharter(),null,2)],{type:'application/json'}),'charter.json');
}


