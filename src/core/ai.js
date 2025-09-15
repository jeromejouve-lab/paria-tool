import { getGAS, postPlain } from './net.js';
import { buildWorkId } from './settings.js';
import { getCharter, saveCharter, addAItoCard } from '../domain/reducers.js';

const uid = () => Math.random().toString(36).slice(2)+Date.now().toString(36);

import { getGAS, postPlain } from './net.js';
import { buildWorkId } from './settings.js';

export async function askAI(task){
  const { url, secret } = getGAS();
  if (!url) return { status:'needs_config', results:[] };

  const payload = {
    route: 'ai',
    secret,
    work_id: buildWorkId(),
    task: task || {}
  };

  const uid = () => Math.random().toString(36).slice(2)+Date.now().toString(36);

  // 1) essaie d'extraire une liste
  const pickArray = (r)=>{
    if (Array.isArray(r)) return r;
    const keys = ['results','data','items','proposals','choices','suggestions'];
    for (const k of keys) if (Array.isArray(r?.[k])) return r[k];
    return [];
  };

  // 2) sinon, essaie d'extraire un texte “raisonnable”
  const pickText = (r)=>{
    if (!r) return '';
    if (typeof r === 'string') return r;

    // variantes simples
    const prim = r.text || r.content || r.message || r.output || r.result;
    if (typeof prim === 'string' && prim.trim()) return prim;

    // OpenAI styles
    try {
      const c0 = r.choices?.[0];
      const t1 = c0?.message?.content || c0?.text;
      if (typeof t1 === 'string' && t1.trim()) return t1;
    } catch {}

    // Vertex styles
    try {
      const p = r.candidates?.[0]?.content?.parts;
      if (Array.isArray(p)){
        const t = p.map(x=>x?.text).filter(Boolean).join('\n').trim();
        if (t) return t;
      }
    } catch {}

    // “text” dans sous-objets usuels
    try {
      const t2 = r.data?.text || r.data?.content;
      if (typeof t2 === 'string' && t2.trim()) return t2;
    } catch {}

    return '';
  };

  try{
    const raw = await postPlain(url, payload);   // envoi en text/plain
    console.log('[AI][raw]', raw);

    let arr = pickArray(raw);

    // Si pas de liste, on fabrique une proposition depuis un texte brut
    if (!arr.length){
      const t = pickText(raw);
      if (t && t.trim()){
        arr = [{ title:'Proposition', content:t }];
      }
    }

    const norm = arr.map((x,i)=>({
      id: x?.id || uid(),
      title: x?.title || `Proposition ${i+1}`,
      content: x?.content || '',
      tags: Array.isArray(x?.tags) ? x.tags : [],
      meta: x?.meta || {},
      state: { selected:false, think:false, deleted:false, created_ts:Date.now(), updated_ts:Date.now() }
    }));

    return { status: norm.length ? 'ok' : 'empty', results: norm };
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
