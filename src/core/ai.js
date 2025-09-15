import { getGAS, postPlain } from './net.js';
import { buildWorkId } from './settings.js';
import { getCharter, saveCharter, addAItoCard } from '../domain/reducers.js';

const uid = () => Math.random().toString(36).slice(2)+Date.now().toString(36);

export async function askAI(task){
  const { url, secret } = getGAS();
  if (!url) return { status:'needs_config', results:[] };

  // Contrat code.gs : route:'ai' + secret + work_id + task ; Content-Type: text/plain
  const payload = {
    route: 'ai',
    secret,
    work_id: buildWorkId(),
    task: task || {}
  };

  try{
    const r = await postPlain(url, payload);
    const arr = Array.isArray(r) ? r : (Array.isArray(r?.data) ? r.data : []);
    const norm = arr.map((x,i)=>({
      id: x.id || uid(),
      title: x.title || `Proposition ${i+1}`,
      content: x.content || '',
      tags: Array.isArray(x.tags)?x.tags:[],
      meta: x.meta || {},
      state:{ selected:false, think:false, deleted:false, created_ts:Date.now(), updated_ts:Date.now() }
    }));
    return { status: norm.length?'ok':'empty', results:norm };
  }catch(e){
    return { status:'network_error', error:e?.message||String(e), results:[] };
  }
}

// util: normalisation d’une liste IA
function _normAI(items){
  const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  const arr = Array.isArray(items) ? items : [];
  return arr.map((x,i)=>({
    id: x?.id || uid(),
    title: x?.title || `Proposition ${i+1}`,
    content: x?.content || '',
    tags: Array.isArray(x?.tags) ? x.tags : [],
    meta: x?.meta || {},
    state: {
      selected: !!x?.state?.selected,
      think: !!x?.state?.think,
      deleted: !!x?.state?.deleted,
      created_ts: x?.state?.created_ts || Date.now(),
      updated_ts: Date.now(),
    }
  }));
}

// export à ajouter : utilisé par charter.js
export function applyAIResults(subject, results, { mode = 'replace' } = {}){
  const norm = _normAI(results);

  // Charter → on remplace ou on ajoute dans ch.ai puis on sauvegarde
  if (subject?.kind === 'charter'){
    const ch = getCharter();
    const base = Array.isArray(ch?.ai) ? ch.ai.filter(p=>!p?.state?.deleted) : [];
    let next;
    if (mode === 'append'){
      const byId = new Map(base.map(p=>[p.id, p]));
      for (const n of norm) byId.set(n.id, n); // dédoublonne par id
      next = [...byId.values()];
    } else {
      next = norm; // replace
    }
    saveCharter({ ...ch, ai: next });
    return next.length;
  }

  // Card ciblée → délègue au reducer prévu
  if (subject?.kind === 'card' && subject?.id){
    addAItoCard(subject.id, norm);
    return norm.length;
  }

  // par défaut, rien à faire
  return 0;
}
