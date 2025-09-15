import { getGAS, postPlain } from './net.js';
import { buildWorkId } from './settings.js';

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
