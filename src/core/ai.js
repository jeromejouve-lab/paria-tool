// PARIA-V2-CLEAN v1.0.0 | core/ai.js
import { settingsLoad } from './settings.js';
import { postJSON } from './net.js';
import { readClientBlob, writeClientBlob } from './store.js';
import { logEvent } from '../domain/journal.js';

const uid = () => Math.random().toString(36).slice(2)+Date.now().toString(36);

export async function askAI(task){
  const s=settingsLoad();
  const url = s?.endpoints?.proxy?.url || s?.proxy?.url || '';
  const token = s?.endpoints?.proxy?.token || s?.proxy?.token || '';
  if (!url) return { status:'needs_config', results:[] };
  const payload = { action:'ai', token, task:{ ...task, context:{ client:s.client, service:s.service, workId:`${s.client}::${s.service}`, tab: task?.context?.tab||'' } } };
  try{
    const r = await postJSON(url, payload);
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
  }catch(e){ return { status:'network_error', error:e?.message||String(e), results:[] }; }
}

export function applyAIResults(subject, results, {mode='replace'}={}){
  const blob=readClientBlob();
  if (subject?.kind==='charter'){
    blob.charter.ai = mode==='append' ? [ ...(blob.charter.ai||[]), ...results ] : results;
  } else if (subject?.kind==='card'){
    const it = (blob.items||[]).find(x=>x.id===subject.id);
    if (it){ it.ai = mode==='append' ? [ ...(it.ai||[]), ...results ] : results; it.state={ ...(it.state||{}), updated_ts:Date.now() }; }
  } else if (subject?.kind==='session'){
    blob.meta.session.ai = mode==='append' ? [ ...(blob.meta.session.ai||[]), ...results ] : results;
  } else if (subject?.kind==='scenario'){
    const sc = (blob.scenarios||[]).find(x=>x.id===subject.id);
    if (sc){ sc.ai = mode==='append' ? [ ...(sc.ai||[]), ...results ] : results; sc.state={ ...(sc.state||{}), updated_ts:Date.now() }; }
  }
  writeClientBlob(blob);
  logEvent('ai/generate', { kind: subject?.kind||'unknown', id: subject?.id||'' }, { mode, count: results.length });
  return true;
}

/* INDEX
- askAI(task) via GAS, applyAIResults(subject, results, {mode})
*/
