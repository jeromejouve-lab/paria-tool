// src/core/ai.js — IA centrale normalisée
import { settingsLoad, buildWorkId } from './settings.js';
import { getCharter, saveCharter, readClientProfile, writeClientProfile } from '../domain/reducers.js';

// ----------------- helpers contexte -----------------
const uid = () => 'p-' + Math.random().toString(36).slice(2) + Date.now();

function loadClientProfile(clientId){
  try { return (typeof readClientProfile === 'function') ? (readClientProfile(clientId) || {}) : {}; }
  catch { return {}; }
}
 
function workCtx(){
  try{
    const s = settingsLoad() || {};
    return { client: (s.client||'').trim(), service: (s.service||'').trim() };
  }catch{ return { client:'', service:'' }; }
}

function serviceFromCharter(){
  try{
    const ch = getCharter() || {};
    return {
      title: ch.title || '',
      content: ch.content || '',
      tags: Array.isArray(ch.tags) ? ch.tags : (ch.tags ? String(ch.tags).split(',').map(s=>s.trim()).filter(Boolean) : [])
    };
  }catch{ return { title:'', content:'', tags:[] }; }
}

function composePromptFallback({ client, service }){
  const csv = a => (a||[]).join(', ') || '—';
  const clientLine = [
    `Client: ${client.id || 'n/d'}`,
    `Secteur: ${client.industry || 'n/d'} | Effectif: ${client.headcount ?? 'n/d'}`,
    `Objectifs: ${csv(client.goals)}`,
    `Enjeux: ${csv(client.challenges)}`,
    `Contraintes: ${csv(client.constraints)}`,
    `Ton: ${client.tone || 'pragmatique, orienté ROI'}`
  ].join('\n');

  const serviceLine = [
    `Service: ${service.id || 'n/d'}`,
    `Titre: ${service.title || 'n/d'}`,
    `Tags: ${csv(service.tags)}`
  ].join('\n');

  return [
    '# CONTEXTE ENTREPRISE', clientLine,
    '',
    '# CONTEXTE SERVICE', serviceLine,
    '',
    '# CHARTE (contenu)', service.content || '—',
    '',
    '# CONSIGNES',
    '- Réponds en français, concis et chiffré quand pertinent.',
    '- Donne des alternatives et des next steps actionnables.'
  ].join('\n');
}

// ----------------- helpers proxy -----------------
function getProxy(){
  const s = settingsLoad() || {};
  const url = (s?.endpoints?.proxy?.url || '').trim();
  const secret = (s?.endpoints?.proxy?.secret || '').trim();

  return { url, secret };
}

async function callAIProxy({ work_id, task }){
  const { url, secret } = getProxy();
  console.log('[AI][proxy]', { url, secret_len: (secret||'').length });
  if (!url) return { status: 'needs_config', results: [], error: 'missing proxy', http: 0 };

  const payload = { route: 'ai', work_id, task, secret }; // secret aussi en body si ton GAS le lit côté body
  console.log('[AI][payload]', payload);

  let res, data, text;
  try{
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    });
    text = await res.text();
    try { data = JSON.parse(text); } catch { data = { text }; }
    console.log('[AI][resp]', { http: res.status, keys: Object.keys(data||{}), text: (text||'').slice(0,200) });

  }catch(e){
    return { status: 'error', results: [], error: String(e.message||e), http: 0 };
  }
  return { http: res.status, data };
}

// Découpe un texte en items à partir de listes (puces et listes numérotées)
function segmentByBullets(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/);

  // Puces : -, *, •, —, – ; Numérotées : 1. 2) etc.
  const bulletRe = /^\s*(?:[-*•—–]|(?:\d+[\.\)]))\s+/;

  const chunks = [];
  let cur = [];

  const pushCur = () => {
    const block = cur.join('\n').trim();
    if (!block) return;
    // titre = première ligne (sans puce), summary = 180c
    const firstLine = block.split(/\r?\n/)[0];
    const title = firstLine.replace(bulletRe, '').trim().slice(0, 120) || 'Proposition';
    const summary = block.length > 180 ? block.slice(0, 180) + '…' : block;
    chunks.push({
      id: 'p-' + Math.random().toString(36).slice(2) + Date.now(),
      title,
      summary,
      content: block,
      state: { selected: false }
    });
    cur = [];
  };

  for (const ln of lines) {
    if (bulletRe.test(ln)) {
      // nouvelle puce → flush le bloc précédent
      if (cur.length) pushCur();
      cur.push(ln.replace(bulletRe, '').trim());
    } else {
      // continuation du bloc courant
      if (!cur.length && ln.trim()==='') continue;
      cur.push(ln);
    }
  }
  if (cur.length) pushCur();

  // si 1 seul item ET pas de vraie puce détectée, renvoie vide (laisse fallback mono-texte)
  const hadBullets = lines.some(l => bulletRe.test(l));
  return hadBullets ? chunks : [];
}

// --- pick the useful text regardless of vendor shape -----------------
function pickText(d){
  if (!d) return '';
  if (typeof d === 'string') return d;

  // common direct fields
  if (d.text)      return d.text;
  if (d.result)    return d.result;
  if (d.response)  return d.response;
  if (d.output)    return d.output;

  // openai-like
  if (Array.isArray(d.choices) && d.choices.length){
    const c0 = d.choices[0];
    if (c0?.message?.content) return c0.message.content;
    if (c0?.delta?.content)   return c0.delta.content;      // streaming chunk
    if (c0?.text)             return c0.text;
    // concat all choices if needed
    const pieces = d.choices.map(c => c?.message?.content || c?.text || '').filter(Boolean);
    if (pieces.length) return pieces.join('\n\n');
  }

  // nested data
  if (d.data) {
    const t = pickText(d.data);
    if (t) return t;
  }

  // try first stringish field
  for (const k of Object.keys(d)){
    const v = d[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return '';
}

// ----------------- normalisation réponse -----------------
function normalizeAIResponse(resp){
  // resp ressemble à { http, data } où data peut être { ok, results, ... } ou d'autres formats
  const d = resp && (resp.data ?? resp);

  // 1) Erreur explicite du backend
  if (d && d.ok === false && d.error) {
    return { status:'error', results:[], error:String(d.error), http: resp.http||200 };
  }

  // 2) Forme backend GAS : { ok:true, results:[...] }
  if (d && d.ok === true && Array.isArray(d.results) && d.results.length) {
    return { status:'ok', results: d.results, http: resp.http||200 };
  }

  // 3) Formes OpenAI-like ou texte brut (fallbacks)
  const pickText = (x)=>{
    if (!x) return '';
    if (typeof x === 'string') return x;
    if (x.text) return x.text;
    if (x.result) return x.result;
    if (x.response) return x.response;
    if (Array.isArray(x.choices) && x.choices.length){
      const c0 = x.choices[0];
      return (c0?.message?.content) || c0?.text || '';
    }
    if (x.data) return pickText(x.data);
    for (const k of Object.keys(x)){ const v=x[k]; if (typeof v==='string' && v.trim()) return v; }
    return '';
  };

  const text = pickText(d);
  if (text && text.trim()){
    // Segmentation simple en puces si présentes
    const lines = text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    const bullets = lines.filter(s => /^[•\-*]\s+/.test(s) || /^\d+\.\s+/.test(s));
    if (bullets.length){
      const results = bullets.map((b,i)=>({
        id: 'p-'+Math.random().toString(36).slice(2)+Date.now(),
        title: 'Proposition '+(i+1),
        content: b.replace(/^[•\-*]\s+/, '').trim(),
        tags: [], meta:{}, state:{ selected:false }
      }));
      return { status:'ok', results, http: resp.http||200 };
    }
    // Sinon, un seul bloc
    return {
      status:'ok',
      results:[{
        id:'p-'+Math.random().toString(36).slice(2)+Date.now(),
        title: (text.split(/\r?\n/)[0] || 'Proposition').slice(0,120),
        content: text, tags:[], meta:{}, state:{ selected:false }
      }],
      http: resp.http||200
    };
  }

  // 4) Rien d’exploitable
  return { status:'empty', results:[], http: resp.http||0 };
}


// Applique des résultats IA dans le store selon le sujet
export function applyAIResults(subject, items, { mode = 'replace' } = {}) {
  const kind = subject?.kind;
  if (kind === 'charter') {
    const ch = getCharter() || {};
    const existing = Array.isArray(ch.ai) ? ch.ai : [];
    const now = Date.now();

    const normItems = (items || []).map(p => ({
      id: p.id || ('p-' + Math.random().toString(36).slice(2) + now),
      title: p.title || 'Proposition',
      summary: p.summary || (p.content ? (p.content.length > 180 ? p.content.slice(0,180)+'…' : p.content) : ''),
      content: p.content || '',
      state: { selected: !!(p.state?.selected), think: !!(p.state?.think), deleted: !!(p.state?.deleted) },
      created_ts: p.created_ts || now,
      updated_ts: now
    }));

    const merged = mode === 'append' ? (existing.concat(normItems)) : normItems;
    saveCharter({ ai: merged });
    return { ok: true, count: merged.length };
  }

  return { ok: false, error: 'unsupported_subject' };
}

// ----------------- export central -----------------
export async function askAI(task = {}){

  // [MiniFlush] — si des champs balisés data-dirty existent, on flushe minimalement
  if (typeof document !== 'undefined') {
    try {
      const dirty = Array.from(document.querySelectorAll('[data-dirty=\"1\"][data-bind]'));
      if (dirty.length){
        const chPatch = {};
        const profPatch = {};
        for (const el of dirty){
          const bind = el.getAttribute('data-bind') || '';
          const val = (el.tagName==='TEXTAREA' || el.tagName==='INPUT') ? (el.value||'') : (el.textContent||'');
          if (bind.startsWith('charter.')) {
            const key = bind.split('.')[1];
            if (key === 'tags') chPatch.tags = String(val||'').split(',').map(s=>s.trim()).filter(Boolean);
            else chPatch[key] = val;
          } else if (bind.startsWith('profile.')) {
            const key = bind.split('.')[1];
            profPatch[key] = val;
          }
          el.removeAttribute('data-dirty');
        }
        if (Object.keys(chPatch).length) await saveCharter(chPatch);
        const S = (typeof settingsLoad==='function') ? (settingsLoad()||{}) : {};
        const cid = (S.client||'').trim();
        if (cid && Object.keys(profPatch).length && typeof writeClientProfile === 'function') {
          const cur = (typeof readClientProfile==='function') ? (readClientProfile(cid)||{}) : {};
          await writeClientProfile(cid, { ...cur, ...profPatch });
        }
      }
    } catch(e){ console.warn('[AI][MiniFlush] non bloquant', e); }
  }

  // 1) Contexte commun
  const { client: clientId, service: serviceId } = workCtx();
  const client = { id: clientId, ...loadClientProfile(clientId) };
  const svc = { id: serviceId, ...serviceFromCharter() };

  // 2) Task fusionnée avec contexte
  const mergedTask = {
    ...task,
    context: { client, service: svc, ...(task.context || {}) }
  };

  // 3) Si rien n’est fourni (pas de prompt / query / messages), on compose un fallback
  if (!mergedTask.prompt && !mergedTask.query && !mergedTask.messages) {
    mergedTask.prompt = composePromptFallback({ client, service: svc });
  }

  // 4) Appel proxy
  const work_id = buildWorkId();
  const resp = await callAIProxy({ work_id, task: mergedTask });

  // 5) Normalisation unique
  const norm = normalizeAIResponse(resp);

  // 6) Statuts HTTP -> statuts logiques (optionnel)
  if (norm.status === 'empty' && resp.http >= 400) {
    return { status: 'error', results: [], error: `HTTP ${resp.http}`, http: resp.http };
  }
  return norm; // {status, results[], error?}
}
